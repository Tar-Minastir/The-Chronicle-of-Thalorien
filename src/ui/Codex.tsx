/**
 * The book pages beside the atlas. These are plain indexes over existing data
 * (first folio): searchable, fully cited, deliberately not yet designed in depth.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { Block, Entity } from '../domain/types';
import type { WorldIndex } from '../domain/selectors';
import { formatTime } from '../domain/time';
import { Md, Quote, cite } from './Md';

export interface CodexGroup {
  title: string;
  entities: Entity[];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Entry({ e, extra }: { e: Entity; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rest = e.records.slice(1);
  return (
    <li className="entry">
      <h4>
        {e.name}
        {e.status && <span className={`seal ${e.status}`}>{e.status}</span>}
        {e.time && <span className="seal uncertain">{formatTime(e.time)}</span>}
      </h4>
      {e.aliases.length > 0 && <p className="hint">Also: {e.aliases.join(' · ')}</p>}
      {extra}
      <ul>
        {e.records[0] && <Quote text={e.records[0].text} refTo={e.records[0].ref} note={e.records[0].asOf ? formatTime(e.records[0].asOf) : undefined} />}
        {open && rest.map((r, i) => <Quote key={i} text={r.text} refTo={r.ref} note={[r.role === 'update' ? 'update' : '', r.asOf ? formatTime(r.asOf) : ''].filter(Boolean).join(' · ')} />)}
      </ul>
      {rest.length > 0 && <button className="link" onClick={() => setOpen(!open)}>{open ? 'Fewer passages' : `${rest.length} more passage${rest.length > 1 ? 's' : ''}`}</button>}
    </li>
  );
}

export function CodexPage({ title, intro, groups, extraFor }: { title: string; intro: string; groups: CodexGroup[]; extraFor?: (e: Entity) => ReactNode }) {
  const [q, setQ] = useState('');
  const needle = fold(q.trim());
  const filtered = useMemo(
    () => groups.map((g) => ({
      ...g,
      entities: needle
        ? g.entities.filter((e) => fold([e.name, ...e.aliases, ...e.records.map((r) => r.text)].join(' ')).includes(needle))
        : g.entities,
    })),
    [groups, needle],
  );
  return (
    <div className="codex">
      <header>
        <h2>{title}</h2>
        <p className="hint">{intro} <em>First folio: a plain index. A fuller page is yet to be made.</em></p>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`} aria-label={`Search ${title}`} />
      </header>
      {filtered.map((g) => (
        <section key={g.title}>
          <h3>{g.title} <small>{g.entities.length}</small></h3>
          <ul className="entries">{g.entities.map((e) => <Entry key={e.id} e={e} extra={extraFor?.(e)} />)}</ul>
        </section>
      ))}
    </div>
  );
}

/** The character sheet, shown section by section exactly as written. */
export function SheetPage({ ix }: { ix: WorldIndex }) {
  const pc = ix.world.entities.find((e) => e.attrs.role === 'player-character');
  const sections = useMemo(() => {
    const out = new Map<string, Block[]>();
    for (const b of ix.world.blocks) {
      if (b.docId !== 'character-sheet' || b.headingPath.length < 2 || (b.kind === 'heading' && b.headingPath.length === 2)) continue;
      out.set(b.headingPath[1], [...(out.get(b.headingPath[1]) ?? []), b]);
    }
    return [...out];
  }, [ix]);
  return (
    <div className="codex">
      <header>
        <h2>{pc?.name ?? 'Character'}</h2>
        <p className="hint">
          The character sheet as written, section by section. <em>First folio: a plain reading copy. A designed sheet is yet to be made.</em>
        </p>
        {pc && pc.aliases.length > 0 && <p className="tags">{pc.aliases.map((a) => <span key={a} className="tag">{a}</span>)}</p>}
      </header>
      <div className="sheet">
        {sections.map(([title, blocks]) => (
          <section key={title}>
            <h3>{title}</h3>
            {blocks.map((b) =>
              b.kind === 'table' ? <pre key={b.id}>{b.text}</pre>
                : b.kind === 'heading' ? <h4 key={b.id}><Md text={b.text} /></h4>
                : <p key={b.id} className="line" style={{ marginLeft: b.depth * 16 }}><span className="cite inline">{b.line}</span><Md text={b.text} /></p>,
            )}
          </section>
        ))}
        {!sections.length && <p className="hint">The character sheet has not been imported.</p>}
      </div>
    </div>
  );
}

export function attitudeNote(ix: WorldIndex, e: Entity): ReactNode {
  const claims = ix.world.claims.filter((c) => c.key === `attitude:${e.id}`);
  if (!claims.length) return null;
  return (
    <p className="hint">
      Attitude: {claims.map((c, i) => <span key={i}>{i > 0 && ' · '}<strong>{c.value}</strong> <span className="cite inline">{cite(c.ref)}, {formatTime(c.asOf)}</span></span>)}
    </p>
  );
}
