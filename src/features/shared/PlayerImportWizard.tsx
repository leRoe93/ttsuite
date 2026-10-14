import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Player } from '../../domain/players/model.ts';
import { fullName } from '../../domain/players/model.ts';
import { findDuplicate, mergePlayer, type DuplicateMatch } from '../../domain/players/duplicates.ts';
import { MAX_IMPORT_BYTES } from '../../imports/csv.ts';
import { readClickTtXml, type ClickTtImport, type ClickTtTournamentRef } from '../../imports/clickTtXml.ts';
import { adoptTtrAsQttr, FIELD_LABELS, guessMapping, mapRows, readTable, TABLE_PRESETS, type FieldKey, type TableParseResult } from '../../imports/tabular.ts';
import type { ImportPreview, LineupHints } from '../../imports/types.ts';
import { readFileText } from '../../lib/download.ts';
import { Badge, Callout, Dialog, FileButton } from '../../shared-ui/components.tsx';
import { IconUpload } from '../../shared-ui/icons.tsx';

export interface ImportOutcome {
  added: Player[];
  updated: Player[];
  /** Lineup hints keyed by the final player id (added or updated). */
  hints: Map<string, LineupHints>;
  clickTt?: { tournament: ClickTtTournamentRef; competitionIndex: number };
  fileName?: string;
}

type SourceChoice = (typeof TABLE_PRESETS)[number]['id'] | 'click-tt-xml';
type Action = 'new' | 'update' | 'skip';

const FIELD_KEYS = Object.keys(FIELD_LABELS) as FieldKey[];

export function PlayerImportWizard({
  open,
  onClose,
  onConfirm,
  pool,
  allowXml = true,
  defaultSource = 'click-tt-table',
  title = 'Spieler importieren',
  clickTtHelp,
  initialPaste,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (o: ImportOutcome) => void;
  pool: readonly Player[];
  allowXml?: boolean;
  defaultSource?: SourceChoice;
  /** Optional panel shown for the "click-TT Mannschaftsmeldung" source (links to the club's click-TT pages). */
  clickTtHelp?: ReactNode;
  /** Text pasted elsewhere (e.g. not recognised as click-TT page) – goes straight to the column mapping. */
  initialPaste?: string;
  title?: string;
}) {
  const [source, setSource] = useState<SourceChoice>(defaultSource);
  const [step, setStep] = useState<'source' | 'map' | 'review'>('source');
  const [error, setError] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [paste, setPaste] = useState('');
  const [table, setTable] = useState<TableParseResult>();
  const [mapping, setMapping] = useState<FieldKey[]>([]);
  const [adoptTtr, setAdoptTtr] = useState(false);
  const [xmlText, setXmlText] = useState<string>();
  const [xml, setXml] = useState<ClickTtImport>();
  const [actions, setActions] = useState<Record<number, Action>>({});
  const [encoding, setEncoding] = useState<string>();

  const reset = () => {
    setStep('source');
    setError(undefined);
    setFileName(undefined);
    setPaste('');
    setTable(undefined);
    setXml(undefined);
    setXmlText(undefined);
    setActions({});
    setAdoptTtr(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  const preset = TABLE_PRESETS.find((p) => p.id === source);

  const loadTable = (text: string, name?: string) => {
    try {
      const t = readTable(text);
      if (t.rows.length === 0) throw new Error('Keine Datenzeilen gefunden.');
      setTable(t);
      setMapping(guessMapping(t.headers, preset));
      setFileName(name);
      setError(undefined);
      setStep('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (open && initialPaste) {
      setSource('generic-table');
      setPaste(initialPaste);
      loadTable(initialPaste, 'Eingefügte Tabelle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPaste]);

  const loadXml = (text: string, name?: string, competitionIndex = 0) => {
    const r = readClickTtXml(text, { fileName: name, competitionIndex });
    setXmlText(text);
    setXml(r);
    setFileName(name);
    if (r.globalIssues.some((i) => i.severity === 'error') && r.candidates.length === 0) {
      setError(r.globalIssues.map((i) => i.message).join(' '));
      return;
    }
    setError(undefined);
    setStep('review');
  };

  const onFile = async (f: File) => {
    try {
      const { text, encoding: enc } = await readFileText(f, MAX_IMPORT_BYTES);
      setEncoding(enc);
      if (source === 'click-tt-xml' || /^\s*(<\?xml|<tournament)/.test(text)) {
        setSource('click-tt-xml');
        loadXml(text, f.name);
      } else loadTable(text, f.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const preview: ImportPreview | undefined = useMemo(() => {
    if (source === 'click-tt-xml') return xml;
    if (!table) return undefined;
    const p = mapRows(table, mapping, source as Exclude<SourceChoice, 'click-tt-xml'>, { fileName });
    return adoptTtr ? adoptTtrAsQttr(p) : p;
  }, [source, xml, table, mapping, fileName, adoptTtr]);

  const dupes = useMemo(() => {
    const m = new Map<number, DuplicateMatch>();
    const seenInFile: Player[] = [];
    preview?.candidates.forEach((c) => {
      if (!c.player) return;
      const d = findDuplicate(c.player, pool) ?? findDuplicate(c.player, seenInFile);
      if (d) m.set(c.row, d);
      seenInFile.push(c.player);
    });
    return m;
  }, [preview, pool]);

  const actionFor = (row: number): Action => {
    if (actions[row]) return actions[row]!;
    const d = dupes.get(row);
    if (!d) return 'new';
    const inPool = pool.some((p) => p.id === d.existing.id);
    if (!inPool) return 'skip'; // duplicate inside the file
    return d.strength === 'strong' ? 'update' : 'skip';
  };

  const confirm = () => {
    if (!preview) return;
    const added: Player[] = [];
    const updated: Player[] = [];
    const hints = new Map<string, LineupHints>();
    for (const c of preview.candidates) {
      if (!c.player || c.issues.some((i) => i.severity === 'error')) continue;
      const a = actionFor(c.row);
      if (a === 'skip') continue;
      const d = dupes.get(c.row);
      if (a === 'update' && d && pool.some((p) => p.id === d.existing.id)) {
        const merged = mergePlayer(d.existing, c.player);
        updated.push(merged);
        if (c.hints) hints.set(merged.id, c.hints);
      } else {
        added.push(c.player);
        if (c.hints) hints.set(c.player.id, c.hints);
      }
    }
    onConfirm({
      added,
      updated,
      hints,
      fileName,
      clickTt: source === 'click-tt-xml' && xml?.tournament ? { tournament: xml.tournament, competitionIndex: xml.competitionIndex } : undefined,
    });
    close();
  };

  const counts = useMemo(() => {
    const c = { new: 0, update: 0, skip: 0, invalid: 0 };
    preview?.candidates.forEach((x) => {
      if (!x.player || x.issues.some((i) => i.severity === 'error')) c.invalid++;
      else c[actionFor(x.row)]++;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, dupes, actions]);

  const globalErrors = preview?.globalIssues.filter((i) => i.severity === 'error') ?? [];

  const footer =
    step === 'source' ? (
      <>
        <button className="btn" onClick={close}>Abbrechen</button>
        {source !== 'click-tt-xml' && (
          <button className="btn btn-primary" disabled={!paste.trim()} onClick={() => loadTable(paste, 'Eingefügte Tabelle')}>
            Weiter
          </button>
        )}
      </>
    ) : step === 'map' ? (
      <>
        <button className="btn" onClick={() => setStep('source')}>Zurück</button>
        <button className="btn btn-primary" disabled={globalErrors.length > 0} onClick={() => setStep('review')}>
          Vorschau prüfen
        </button>
      </>
    ) : (
      <>
        <button className="btn" onClick={() => setStep(source === 'click-tt-xml' ? 'source' : 'map')}>Zurück</button>
        <button className="btn btn-primary" disabled={counts.new + counts.update === 0 || globalErrors.length > 0} onClick={confirm}>
          {counts.new + counts.update} Spieler übernehmen
        </button>
      </>
    );

  return (
    <Dialog open={open} onClose={close} title={title} wide footer={footer}>
      <ol className="steps" aria-label="Importschritte">
        <li className={step === 'source' ? 'is-current' : 'is-done'}>Quelle</li>
        <li className={step === 'map' ? 'is-current' : step === 'review' ? 'is-done' : ''}>Spalten zuordnen</li>
        <li className={step === 'review' ? 'is-current' : ''}>Vorschau &amp; Duplikate</li>
      </ol>
      {error && <Callout tone="error" title="Import nicht möglich">{error}</Callout>}

      {step === 'source' && (
        <div className="stack gap-m">
          <fieldset className="choice-grid">
            <legend className="sr-only">Datenquelle</legend>
            {allowXml && (
              <label className={`choice ${source === 'click-tt-xml' ? 'is-selected' : ''}`}>
                <input type="radio" name="src" checked={source === 'click-tt-xml'} onChange={() => setSource('click-tt-xml')} />
                <span className="choice-title">click-TT Teilnehmerdatei (XML)</span>
                <span className="choice-text">Download aus dem click-TT-Turnierportal („Teilnehmer“ → XML). Nötig für den späteren Ergebnis-Export nach click-TT.</span>
              </label>
            )}
            {TABLE_PRESETS.map((p) => (
              <label key={p.id} className={`choice ${source === p.id ? 'is-selected' : ''}`}>
                <input type="radio" name="src" checked={source === p.id} onChange={() => setSource(p.id)} />
                <span className="choice-title">{p.label}</span>
                <span className="choice-text">{p.hint}</span>
              </label>
            ))}
          </fieldset>
          <div className="row gap-s wrap">
            <FileButton accept={source === 'click-tt-xml' ? '.xml,text/xml' : '.csv,.tsv,.txt,text/csv,text/plain'} onFile={onFile} className="btn btn-primary">
              <IconUpload /> Datei auswählen
            </FileButton>
            <span className="muted small">Die Datei wird nur in diesem Browser gelesen und nicht hochgeladen.</span>
          </div>
          {source === 'click-tt-table' && clickTtHelp}
          {source !== 'click-tt-xml' && (
            <label className="field">
              <span className="field-label">…oder Tabelle einfügen (aus Excel, click-TT oder myTischtennis kopiert)</span>
              <textarea className="input mono" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Nachname;Vorname;Verein;Q-TTR\nMuster;Max;TTC Beispiel;1534'} />
            </label>
          )}
        </div>
      )}

      {step === 'map' && table && (
        <div className="stack gap-m">
          <p className="muted small">
            {fileName} · {table.rows.length} Zeilen · Trennzeichen „{table.delimiter === '\t' ? 'Tab' : table.delimiter}“{encoding ? ` · Zeichensatz ${encoding}` : ''} ·{' '}
            {table.hasHeader ? 'Kopfzeile erkannt' : 'keine Kopfzeile erkannt'}
            {table.contextClub ? ` · Verein: ${table.contextClub}` : ''}
          </p>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  {table.headers.map((h, i) => (
                    <th key={i}>
                      <div className="stack gap-xs">
                        <span className="small">{h || `Spalte ${i + 1}`}</span>
                        <select
                          className="input input-s"
                          aria-label={`Zuordnung für ${h || `Spalte ${i + 1}`}`}
                          value={mapping[i] ?? 'ignore'}
                          onChange={(e) => setMapping((m) => m.map((x, j) => (j === i ? (e.target.value as FieldKey) : x)))}
                        >
                          {FIELD_KEYS.map((k) => (
                            <option key={k} value={k}>{FIELD_LABELS[k]}</option>
                          ))}
                        </select>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    {table.headers.map((_, j) => (
                      <td key={j} className={mapping[j] === 'ignore' ? 'muted' : ''}>{r[j]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview?.globalIssues.map((i, k) => (
            <Callout key={k} tone={i.severity === 'error' ? 'error' : 'warning'}>{i.message}</Callout>
          ))}
          {mapping.includes('ttr') && !mapping.includes('qttr') && (
            <label className="check">
              <input type="checkbox" checked={adoptTtr} onChange={(e) => setAdoptTtr(e.target.checked)} /> TTR-Werte als Q-TTR übernehmen (nur wenn die Werte tatsächlich vom Stichtag stammen)
            </label>
          )}
        </div>
      )}

      {step === 'review' && preview && (
        <div className="stack gap-m">
          {source === 'click-tt-xml' && xml?.tournament && (
            <div className="row gap-s wrap">
              <Badge tone="info">{xml.tournament.attrs['name'] ?? 'Turnier'}</Badge>
              {xml.tournament.competitions.length > 1 ? (
                <select className="input input-s" value={xml.competitionIndex} onChange={(e) => xmlText && loadXml(xmlText, fileName, Number(e.target.value))} aria-label="Konkurrenz">
                  {xml.tournament.competitions.map((c) => (
                    <option key={c.index} value={c.index}>{c.label} ({c.playerCount})</option>
                  ))}
                </select>
              ) : (
                <span className="muted small">{xml.tournament.competitions[0]?.label}</span>
              )}
            </div>
          )}
          {preview.globalIssues.map((i, k) => (
            <Callout key={k} tone={i.severity === 'error' ? 'error' : 'warning'}>{i.message}</Callout>
          ))}
          <div className="row gap-s wrap">
            <Badge tone="ok">{counts.new} neu</Badge>
            <Badge tone="info">{counts.update} aktualisieren</Badge>
            <Badge tone="neutral">{counts.skip} überspringen</Badge>
            {counts.invalid > 0 && <Badge tone="error">{counts.invalid} fehlerhaft</Badge>}
          </div>
          <div className="table-wrap tall">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Zeile</th>
                  <th>Name</th>
                  <th>Verein</th>
                  <th className="num">Q-TTR</th>
                  <th className="num">TTR</th>
                  <th>Prüfung</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {preview.candidates.map((c) => {
                  const d = dupes.get(c.row);
                  const invalid = !c.player || c.issues.some((i) => i.severity === 'error');
                  const inPool = d && pool.some((p) => p.id === d.existing.id);
                  return (
                    <tr key={c.row} className={invalid ? 'row-error' : ''}>
                      <td className="num muted">{c.row}</td>
                      <td>{c.player ? fullName(c.player) : '—'}</td>
                      <td className="small">{c.player?.club}</td>
                      <td className="num">{c.player?.rules.qttr ?? '—'}</td>
                      <td className="num">{c.player?.ttr ?? '—'}</td>
                      <td className="small">
                        <div className="stack gap-xs">
                          {c.issues.map((i, k) => (
                            <Badge key={k} tone={i.severity === 'error' ? 'error' : 'warning'}>{i.message}</Badge>
                          ))}
                          {d && (
                            <Badge tone={d.strength === 'strong' ? 'info' : 'warning'} title={d.conflicts.map((x) => `${x.field}: ${x.existing} → ${x.incoming}`).join('\n')}>
                              {inPool ? 'Bereits vorhanden' : 'Doppelt in Datei'} ({d.reason === 'licence' ? 'Lizenz-Nr.' : d.reason === 'internal-nr' ? 'click-TT-Nr.' : 'Name'})
                              {d.conflicts.length > 0 && ` · ${d.conflicts.length} Abweichung(en)`}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td>
                        {!invalid && (
                          <select className="input input-s" aria-label={`Aktion für Zeile ${c.row}`} value={actionFor(c.row)} onChange={(e) => setActions((a) => ({ ...a, [c.row]: e.target.value as Action }))}>
                            <option value="new">neu anlegen</option>
                            {inPool && <option value="update">vorhandenen aktualisieren</option>}
                            <option value="skip">überspringen</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Dialog>
  );
}
