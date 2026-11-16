/**
 * The book pages beside the atlas: quest book, companions, journal, encyclopedia, rules tome and the
 * character sheet. All of them read existing data through the same components (`Tome`, `Entry`),
 * so they share one look: a dark-green frame holding a parchment leaf.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { Block, Entity } from '../domain/types';
import type { WorldIndex } from '../domain/selectors';
import { formatTime } from '../domain/time';
import { monogram } from '../atlas/glyphs';
import { Md, Quote, cite } from './Md';
import { Divider, Icon, type IconName } from './shell/icons';

export interface CodexGroup {
  title: string;
  entities: Entity[];
  /** Start collapsed (long, lower-priority groups). */
  folded?: boolean;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Page frame shared by every book page. */
export function Tome({ icon, title, intro, tools, children }: { icon: IconName; title: string; intro?: string; tools?: ReactNode; children: ReactNode }) {
  return (
    <div className="tome">
      <header className="tome-head">
        <Icon name={icon} size={26} />
        <div>
          <h2>{title}</h2>
          {intro && <p>{intro}</p>}
        </div>
        {tools && <div className="tome-tools">{tools}</div>}
      </header>
      <div className="leaf-page">{children}</div>
    </div>
  );
}

function Entry({ e, extra, avatar, action }: { e: Entity; extra?: ReactNode; avatar?: boolean; action?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rest = e.records.slice(1);
  return (
    <li className={`entry${avatar ? ' with-avatar' : ''}`}>
      {avatar && <span className="medallion" aria-hidden="true">{monogram(e.name)}</span>}
      <div>
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
        <p className="entry-actions">
          {rest.length > 0 && <button className="link" onClick={() => setOpen(!open)}>{open ? 'Fewer passages' : `${rest.length} more passage${rest.length > 1 ? 's' : ''}`}</button>}
          {action}
        </p>
      </div>
    </li>
  );
}

interface CodexProps {
  icon: IconName;
  title: string;
  intro: string;
  groups: CodexGroup[];
  extraFor?: (e: Entity) => ReactNode;
  actionFor?: (e: Entity) => ReactNode;
  avatars?: boolean;
  after?: ReactNode;
}

export function CodexPage({ icon, title, intro, groups, extraFor, actionFor, avatars, after }: CodexProps) {
  const [q, setQ] = useState('');
  const [shut, setShut] = useState<Set<string>>(() => new Set(groups.filter((g) => g.folded).map((g) => g.title)));
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
  const toggle = (t: string) => setShut((s) => {
    const n = new Set(s);
    if (n.has(t)) n.delete(t); else n.add(t);
    return n;
  });
  return (
    <Tome
      icon={icon} title={title} intro={intro}
      tools={<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`} aria-label={`Search ${title}`} />}
    >
      <nav className="chapter-nav" aria-label="Chapters">
        {filtered.map((g) => <a key={g.title} href={`#ch-${fold(g.title).replace(/\W+/g, '-')}`}>{g.title} <small>{g.entities.length}</small></a>)}
      </nav>
      {filtered.map((g) => {
        const closed = shut.has(g.title) && !needle;
        return (
          <section key={g.title} id={`ch-${fold(g.title).replace(/\W+/g, '-')}`}>
            <h3><button className="chapter" aria-expanded={!closed} onClick={() => toggle(g.title)}>{closed ? '▸' : '▾'} {g.title} <small>{g.entities.length}</small></button></h3>
            {!closed && <ul className="entries">{g.entities.map((e) => <Entry key={e.id} e={e} extra={extraFor?.(e)} avatar={avatars} action={actionFor?.(e)} />)}</ul>}
            {!closed && !g.entities.length && <p className="hint">Nothing recorded{needle ? ' matches' : ''}.</p>}
          </section>
        );
      })}
      {after}
    </Tome>
  );
}

function MdTable({ text }: { text: string }) {
  const rows = text.split('\n').map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())).filter((r) => !r.every((c) => /^:?-+:?$/.test(c)));
  return (
    <table className="stat-table">
      <thead><tr>{rows[0]?.map((c, i) => <th key={i}><Md text={c} /></th>)}</tr></thead>
      <tbody>{rows.slice(1).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Md text={c} /></td>)}</tr>)}</tbody>
    </table>
  );
}

/** The character sheet: a summary plate, then one section at a time, exactly as written. */
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
  const [current, setCurrent] = useState<string | null>(null);
  const active = sections.find(([t]) => t === current) ?? sections[0];
  const find = (section: string, lead: string) =>
    sections.find(([t]) => t === section)?.[1].find((b) => b.kind === 'item' && b.text.replace(/\*/g, '').startsWith(lead));
  const after = (b: Block | undefined) => (b ? b.text.slice(b.text.indexOf(':') + 1).trim() : '');
  const abilities = sections.find(([t]) => t === 'ABILITY SCORES')?.[1].find((b) => b.kind === 'table');
  const vitals = sections.find(([t]) => t === 'COMBAT')?.[1].filter((b) => b.kind === 'item').slice(0, 4) ?? [];

  return (
    <Tome icon="hero" title={pc?.name ?? 'Character'} intro="The character sheet, section by section, exactly as written.">
      {!sections.length && <p className="hint">The character sheet has not been imported.</p>}
      {sections.length > 0 && (
        <>
          <div className="sheet-plate">
            <div className="portrait" aria-label="No approved portrait yet"><span>{monogram(pc?.name ?? '?')}</span><small>no approved portrait</small></div>
            <div className="identity">
              <h3>{after(find('IDENTITY', 'Name')) || pc?.name}</h3>
              <p className="class"><Md text={after(find('IDENTITY', 'Class'))} /> · <Md text={after(find('IDENTITY', 'Species'))} /></p>
              <Divider />
              {abilities && <MdTable text={abilities.text} />}
              <ul className="vitals">{vitals.map((b) => <li key={b.id}><span className="cite inline">{b.line}</span><Md text={b.text} /></li>)}</ul>
            </div>
          </div>
          <div className="sheet-body">
            <nav className="sheet-nav" aria-label="Sheet sections">
              {sections.map(([title]) => (
                <button key={title} className={active?.[0] === title ? 'on' : ''} onClick={() => setCurrent(title)}>{title.toLowerCase()}</button>
              ))}
            </nav>
            <section className="sheet">
              <h3>{active?.[0]}</h3>
              {active?.[1].map((b) =>
                b.kind === 'table' ? <MdTable key={b.id} text={b.text} />
                  : b.kind === 'heading' ? <h4 key={b.id}><Md text={b.text} /></h4>
                  : <p key={b.id} className="line" style={{ marginLeft: b.depth * 16 }}><span className="cite inline">{b.line}</span><Md text={b.text} /></p>,
              )}
            </section>
          </div>
        </>
      )}
    </Tome>
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
