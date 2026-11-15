import { useState } from 'react';
import type { Block, Entity, SourceRef } from '../domain/types';
import { coMentioned, entitiesMentioning, eventsAt, mentionBlocks, silenceOf, type WorldIndex } from '../domain/selectors';
import { stripMd } from '../domain/text';
import { formatTime } from '../domain/time';
import { effectivePosition } from '../map/layers';
import type { MapState } from '../map/mapState';
import type { UserLayer } from '../storage/userLayer';

interface Props {
  ix: WorldIndex;
  layer: UserLayer;
  state: MapState;
  onResetPosition: (id: string) => void;
  onPlaceAtCentre: (id: string) => void;
  onAddNote: (entityId: string, title: string, text: string) => void;
  onRemoveNote: (id: string) => void;
  onSelect: (id: string) => void;
}

const cite = (r: SourceRef) => `${r.docId}:${r.line}`;

function Quote({ text, refTo, time }: { text: string; refTo: SourceRef; time?: string }) {
  return (
    <li className="quote">
      <span className="cite" title={refTo.headingPath.join(' › ')}>{cite(refTo)}{time ? ` · ${time}` : ''}</span>
      {stripMd(text)}
    </li>
  );
}

function EntityList({ title, items, note }: { title: string; items: Entity[]; note?: string }) {
  if (!items.length) return null;
  return (
    <section>
      <h3>{title} <small>({items.length})</small></h3>
      {note && <p className="hint">{note}</p>}
      <ul>
        {items.map((e) => (
          <Quote key={e.id} text={e.records[0]?.text ?? e.name} refTo={e.records[0].ref}
            time={[e.name, e.status, e.time ? formatTime(e.time) : ''].filter(Boolean).join(' · ')} />
        ))}
      </ul>
    </section>
  );
}

export function DetailsPanel({ ix, layer, state, onResetPosition, onPlaceAtCentre, onAddNote, onRemoveNote, onSelect }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const { world } = ix;
  const geo = world.geo.find((g) => g.id === state.selectedId);

  if (!geo) {
    return (
      <aside className="panel details">
        <h2>Current state</h2>
        {!world.current && <p className="hint">Import the campaign chronicle to see the current state.</p>}
        <dl>
          {world.current?.fields.map((f, i) => (
            <div key={i}>
              <dt>{f.label} <span className="cite">{cite(f.ref)}</span></dt>
              <dd>{stripMd(f.text)}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">Select a place on the map for its details and sources.</p>
      </aside>
    );
  }

  const pos = effectivePosition(ix, layer, geo.id);
  const silence = silenceOf(world, geo.id);
  const day = state.overlays.history ? state.timelineDay ?? world.current?.day ?? world.maxDay : null;
  const blocks: Block[] = mentionBlocks(ix, geo.id);
  const shown = showAll ? blocks : blocks.slice(0, 8);
  const children = world.geo.filter((g) => g.parentId === geo.id);
  const presences = world.relations.filter((r) => r.type === 'presence' && r.to === geo.id);
  const notes = layer.annotations.filter((a) => a.entityId === geo.id);
  const people = coMentioned(ix, geo.id, 'character').slice(0, 12);

  return (
    <aside className="panel details">
      <h2>{geo.name}</h2>
      <p className="meta">
        {geo.kind}
        {geo.parentId && <> · in <button className="link" onClick={() => onSelect(geo.parentId!)}>{world.geo.find((g) => g.id === geo.parentId)?.name}</button></>}
        {world.current?.partyLocationId === geo.id && <> · <strong>party is here</strong> <span className="cite">{world.current.partyLocationRef ? cite(world.current.partyLocationRef) : ''}</span></>}
      </p>

      <section>
        <h3>Position</h3>
        {!pos && (
          <p>
            Not placed. The documents give no position for this place.{' '}
            <button onClick={() => onPlaceAtCentre(geo.id)}>Place at map centre</button>
          </p>
        )}
        {pos?.status === 'user-placed' && (
          <p>
            Placed by you at ({pos.position.x.toFixed(0)}, {pos.position.y.toFixed(0)}).{' '}
            <button onClick={() => onResetPosition(geo.id)}>{geo.position ? 'Reset to provisional' : 'Remove from map'}</button>
          </p>
        )}
        {pos?.status === 'provisional' && (
          <p>
            <strong>Provisional</strong> at ({pos.position.x.toFixed(0)}, {pos.position.y.toFixed(0)}).{' '}
            {geo.positionBasis === 'stated-relation'
              ? 'Laid out to agree with the statements below; the exact spot is not established.'
              : 'The documents state nothing about where this is; the spot is a placeholder.'}{' '}
            Turn on “Edit positions” and drag to move it.
          </p>
        )}
        {geo.relations.length > 0 && (
          <ul>
            {geo.relations.map((r, i) => (
              <li key={i} className="quote">
                <span className="cite">{r.ref ? cite(r.ref) : 'not found'} · {r.certainty}{r.attested ? '' : ' · UNVERIFIED'}</span>
                {r.kind === 'bearing' ? `${r.bearing} of ` : r.kind === 'within' ? 'within ' : 'near '}
                <button className="link" onClick={() => onSelect(r.target)}>{world.geo.find((g) => g.id === r.target)?.name ?? r.target}</button>
                : “{r.quote}”
              </li>
            ))}
          </ul>
        )}
        {children.length > 0 && (
          <p className="hint">
            Contains:{' '}
            {children.map((c, i) => (
              <span key={c.id}>{i > 0 && ', '}<button className="link" onClick={() => onSelect(c.id)}>{c.name}</button></span>
            ))}
          </p>
        )}
      </section>

      {silence && (
        <section>
          <h3>Silence: {silence.status}</h3>
          <ul><Quote text={silence.text} refTo={silence.ref} /></ul>
        </section>
      )}

      {presences.length > 0 && (
        <section>
          <h3>Factions mentioned here <small>({presences.length})</small></h3>
          <p className="hint">The faction’s own entry names this place. This is not a claim of control or of forces present.</p>
          <ul>
            {presences.map((r, i) => {
              const f = ix.entity.get(r.from);
              return <Quote key={i} text={`${f?.name}${f?.attrs.stale ? ' [entry may be out of date]' : ''} — ${r.note ?? ''}`} refTo={r.ref!} />;
            })}
          </ul>
        </section>
      )}

      <EntityList title={day === null ? 'Events naming this place' : `Events up to Day ${day}`} items={eventsAt(ix, geo.id, day)}
        note={day === null ? undefined : 'Undated events are hidden while the historical overlay is on.'} />
      <EntityList title="Quests naming this place" items={entitiesMentioning(ix, geo.id, 'quest')} />
      <EntityList title="Open threads naming this place" items={entitiesMentioning(ix, geo.id, 'thread').filter((t) => t.status === 'open')} />

      {people.length > 0 && (
        <section>
          <h3>People mentioned alongside</h3>
          <p className="tags">{people.map((p) => <span key={p.entity.id} className="tag">{p.entity.name} ×{p.count}</span>)}</p>
        </section>
      )}

      <section>
        <h3>Your notes <small>({notes.length})</small></h3>
        <ul>
          {notes.map((n) => (
            <li key={n.id} className="note">
              <strong>{n.title}</strong> {n.text} <button className="link" onClick={() => onRemoveNote(n.id)}>delete</button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() && !text.trim()) return;
            onAddNote(geo.id, title.trim() || 'Note', text.trim());
            setTitle('');
            setText('');
          }}
        >
          <input aria-label="Note title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea aria-label="Note text" placeholder="Your note (stored separately from imported data)" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit">Add note</button>
        </form>
      </section>

      <section>
        <h3>Source mentions <small>({blocks.length})</small></h3>
        <ul>{shown.map((b) => <Quote key={b.id} text={b.text} refTo={{ docId: b.docId, blockId: b.id, line: b.line, endLine: b.endLine, headingPath: b.headingPath }} time={b.asOf ? formatTime(b.asOf) : undefined} />)}</ul>
        {blocks.length > 8 && <button onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${blocks.length}`}</button>}
      </section>
    </aside>
  );
}
