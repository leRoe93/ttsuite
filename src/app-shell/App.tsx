import { featureByPath, listFeatures } from './registry.ts';
import { href, useRoute } from './router.ts';
import { AppDataProvider, useAppData } from '../storage/AppDataProvider.tsx';
import { useState } from 'react';
import { Callout, ConfirmProvider, EmptyState, ToastProvider, useToast } from '../shared-ui/components.tsx';
import { buildDemo, DEMO_FILES } from '../features/shared/demo.ts';
import { IconChevron, IconLock } from '../shared-ui/icons.tsx';

function Brand() {
  return (
    <a className="brand" href="#/" aria-label="TTSuite Startseite">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
        <circle cx="13" cy="14" r="9" fill="var(--accent)" />
        <rect x="15.5" y="18" width="5" height="11" rx="2.5" transform="rotate(-40 18 23.5)" fill="var(--ink)" />
        <circle cx="25" cy="8" r="3" fill="var(--ink)" />
      </svg>
      <span>
        TT<b>Suite</b>
      </span>
    </a>
  );
}

function Home() {
  const { data, update } = useAppData();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const loadDemo = async () => {
    setLoading(true);
    try {
      const [csv, xml] = await Promise.all([DEMO_FILES.registration, DEMO_FILES.tournament].map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text(); })));
      const demo = buildDemo(csv!, xml!);
      update((d) => ({ ...d, players: [...d.players, ...demo.players], teamPlans: [...d.teamPlans, demo.plan], tournaments: [...d.tournaments, demo.tournament] }));
      toast('ok', `Beispieldaten geladen: ${demo.players.length} Spieler, 1 Planung, 1 Turnier`);
    } catch (e) {
      toast('error', `Beispieldaten nicht ladbar (${e instanceof Error ? e.message : e})`);
    } finally {
      setLoading(false);
    }
  };
  const tools = listFeatures().filter((f) => f.kind !== 'utility');
  return (
    <div className="page narrow">
      <section className="hero">
        <span className="badge badge-info">Für Vereine im TTVN</span>
        <h1>Werkzeuge für Tischtennis-Vereine in Niedersachsen</h1>
        <p className="lead">Mannschaftsmeldung planen und TTVN-Races durchführen – direkt im Browser, ohne Anmeldung. Deine Daten bleiben auf diesem Gerät.</p>
        <p className="small muted">TTSuite ist auf die Regeln des Tischtennis-Verbands Niedersachsen (TTVN) und dessen click-TT zugeschnitten. In anderen Verbänden sind die Werkzeuge nicht zwingend kompatibel.</p>
      </section>
      <div className="tiles">
        {tools.map((f) => (
          <a key={f.id} className="tile card card-link" href={href(f.path)}>
            <span className="tile-icon">{f.icon}</span>
            <span className="tile-title">{f.title}</span>
            <span className="tile-text">{f.description}</span>
            <span className="tile-go">
              Öffnen <IconChevron size={16} />
            </span>
          </a>
        ))}
      </div>
      <div className="facts">
        <div>
          <strong>{data.players.length}</strong>
          <span>Spieler im Pool</span>
        </div>
        <div>
          <strong>{data.teamPlans.length}</strong>
          <span>Planungen</span>
        </div>
        <div>
          <strong>{data.tournaments.length}</strong>
          <span>Turniere</span>
        </div>
      </div>
      <div className="card demo-card">
        <div>
          <strong>Erst einmal ausprobieren?</strong>
          <p className="small muted">Lädt eine erfundene Mannschaftsmeldung (wie aus click-TT kopiert) und ein TTVN-Race mit 13 erfundenen Teilnehmenden – ergänzt deine vorhandenen Daten.</p>
        </div>
        <button className="btn btn-primary" onClick={loadDemo} disabled={loading}>{loading ? 'Lädt…' : 'Beispieldaten laden'}</button>
      </div>
      <p className="small muted center">
        Testdateien zum Import: <a href="./sample-data/fiktive_clicktt_meldung_kopiert.txt" download>kopierte click-TT-Meldung (Text)</a> · <a href="./sample-data/fiktives_tt-race_clicktt_teilnehmer.xml" download>TTVN-Race-Teilnehmende (click-TT-XML)</a> – alle Personen fiktiv.
      </p>
    </div>
  );
}

function Shell() {
  const route = useRoute();
  const { status, externalChange, reloadFromStorage } = useAppData();
  const feature = featureByPath(route[0]);
  const Page = feature?.component;
  return (
    <div className="app">
      <a className="skip" href="#main">Zum Inhalt springen</a>
      <header className="topbar no-print">
        <Brand />
        <nav aria-label="Hauptnavigation">
          {listFeatures().map((f) => (
            <a key={f.id} href={href(f.path)} className={`nav-link ${feature?.id === f.id ? 'active' : ''} ${f.kind === 'utility' ? 'nav-utility' : ''}`} aria-current={feature?.id === f.id ? "page" : undefined} aria-label={f.title} title={f.title}>
              {f.icon}
              <span>{f.title.replace(' (TTVN-Race)', '')}</span>
            </a>
          ))}
        </nav>
      </header>
      {externalChange && (
        <div className="banner no-print">
          <Callout tone="warning" title="Daten in einem anderen Tab geändert">
            Um nichts zu überschreiben, bitte neu laden. <button className="btn btn-s" onClick={reloadFromStorage}>Jetzt neu laden</button>
          </Callout>
        </div>
      )}
      {status.state === 'error' || status.state === 'unavailable' ? (
        <div className="banner no-print">
          <Callout tone="error" title="Speichern nicht möglich">{status.message}</Callout>
        </div>
      ) : null}
      <main id="main">{route.length === 0 ? <Home /> : Page ? <Page subpath={route.slice(1)} /> : <EmptyState title="Seite nicht gefunden" actions={<a className="btn" href="#/">Zur Startseite</a>} />}</main>
      <footer className="footer no-print">
        <span>
          <IconLock size={13} /> Lokal gespeichert · keine Übertragung an Server
          {status.lastSaved ? ` · zuletzt ${status.lastSaved.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
        <span>
          Für den TTVN entwickelt – in anderen Verbänden nicht zwingend kompatibel · Regeln ohne Gewähr · <a href="#/daten">Daten &amp; Sicherung</a>
        </span>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AppDataProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Shell />
        </ConfirmProvider>
      </ToastProvider>
    </AppDataProvider>
  );
}
