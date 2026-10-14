/**
 * Minimal, safe XML reader/writer for attribute-centric formats such as the click-TT
 * tournament interface file. No entity expansion beyond the five predefined entities and
 * numeric character references, DOCTYPE is skipped (never fetched) – no XXE risk.
 * Works identically in the browser and in Node (tests).
 */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

export class XmlParseError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent.startsWith('#x')) return String.fromCodePoint(parseInt(ent.slice(2), 16));
    if (ent.startsWith('#')) return String.fromCodePoint(parseInt(ent.slice(1), 10));
    return ENTITIES[ent] ?? m;
  });
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function parseXml(input: string): XmlElement {
  const src = input.replace(/^﻿/, '');
  let i = 0;
  const root: XmlElement = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  const top = () => stack[stack.length - 1]!;

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      top().text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) top().text += decodeEntities(src.slice(i, lt));
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt);
      if (end === -1) throw new XmlParseError('Unvollständige XML-Deklaration');
      i = end + 2;
    } else if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      if (end === -1) throw new XmlParseError('Unvollständiger Kommentar');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt);
      if (end === -1) throw new XmlParseError('Unvollständiger CDATA-Abschnitt');
      top().text += src.slice(lt + 9, end);
      i = end + 3;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE: skip, including an optional internal subset [...]
      let j = lt + 2;
      let depth = 0;
      while (j < src.length) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
        j++;
      }
      i = j + 1;
    } else if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      if (end === -1) throw new XmlParseError('Unvollständiges End-Tag');
      const name = src.slice(lt + 2, end).trim();
      const el = stack.pop();
      if (!el || el.name !== name) throw new XmlParseError(`Unerwartetes End-Tag </${name}>`);
      i = end + 1;
    } else {
      const m = /^<([A-Za-z_][\w.:-]*)/.exec(src.slice(lt, lt + 200));
      if (!m) throw new XmlParseError(`Ungültiges Tag an Position ${lt}`);
      const el: XmlElement = { name: m[1]!, attrs: {}, children: [], text: '' };
      let j = lt + m[0].length;
      const attrRe = /\s*([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/y;
      for (;;) {
        attrRe.lastIndex = j;
        const a = attrRe.exec(src);
        if (!a) break;
        el.attrs[a[1]!] = decodeEntities(a[3] ?? a[4] ?? '');
        j = attrRe.lastIndex;
      }
      while (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r') j++;
      top().children.push(el);
      if (src.startsWith('/>', j)) i = j + 2;
      else if (src[j] === '>') {
        stack.push(el);
        i = j + 1;
      } else throw new XmlParseError(`Ungültige Attribute in <${el.name}>`);
      if (stack.length > 64) throw new XmlParseError('XML zu tief verschachtelt');
    }
  }
  if (stack.length !== 1) throw new XmlParseError(`Nicht geschlossenes Element <${top().name}>`);
  const docRoot = root.children[0];
  if (!docRoot) throw new XmlParseError('Leere XML-Datei');
  return docRoot;
}

export function children(el: XmlElement, name: string): XmlElement[] {
  return el.children.filter((c) => c.name === name);
}

export function child(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c) => c.name === name);
}

/** Serialise attributes in the given order. */
export function attrsToString(attrs: [string, string | number | undefined][]): string {
  return attrs
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`)
    .join('');
}
