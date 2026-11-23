/**
 * The page beside the map: details for the selected place, character or faction,
 * or (with nothing selected) the mode's overview. Every statement shown is a
 * verbatim passage with its citation.
 */
import { useState, type ReactNode } from 'react';
import type { Entity, GeoLocation } from '../domain/types';
import { ATLAS_FEATURES, typeHeading, type AtlasFeature } from '../atlas/geography';
import {
  coMentioned, entitiesMentioning, eventsAt, factionStance, forceReports, heroPlacements, mentionBlocks, recordedInPlay, silenceOf,
  type WorldIndex,
} from '../domain/selectors';
import { formatTime } from '../domain/time';
import { Banner } from '../atlas/art';
import { ROUTES } from '../atlas/terrain';
import { effectivePosition } from '../map/layers';
import type { MapState } from '../map/mapState';
import type { UserLayer } from '../storage/userLayer';
import { Md, Quote, cite } from './Md';

interface Props {
  ix: WorldIndex;
  layer: UserLayer;
  state: MapState;
  onResetPosition: (id: string) => void;
  onPlaceAtCentre: (id: string) => void;
  onAddNote: (entityId: string, title: string, text: string) => void;
  onRemoveNote: (id: string) => void;
  onSelect: (id: string | null) => void;
  /** Atlas features as the player has them. */
  features: AtlasFeature[];
  onEditFeature: (id: string, edit: { name?: string; description?: string }) => void;
  onRemoveFeature: (id: string) => void;
}

const KIND_LABEL: Record<string, string> = { region: 'Region', settlement: 'Settlement or hold', site: 'Site', route: 'Road', water: 'Water' };

function EntityList({ title, items, note }: { title: string; items: Entity[]; note?: string }) {
  if (!items.length) return null;
  return (
    <section>
      <h3>{title} <small>{items.length}</small></h3>
      {note && <p className="hint">{note}</p>}
      <ul>
        {items.map((e) => (
          <Quote key={e.id} text={e.records[0]?.text ?? e.name} refTo={e.records[0].ref}
            note={[e.name, e.status, e.time ? formatTime(e.time) : ''].filter(Boolean).join(' · ')} />
        ))}
      </ul>
    </section>
  );
}

function PlaceLink({ ix, id, onSelect }: { ix: WorldIndex; id: string; onSelect: Props['onSelect'] }) {
  return <button className="link" onClick={() => onSelect(id)}>{ix.world.geo.find((g) => g.id === id)?.name ?? ix.entity.get(id)?.name ?? id}</button>;
}

export function DetailsPanel(props: Props) {
  const { ix, state, onSelect } = props;
  const geo = ix.world.geo.find((g) => g.id === state.selectedId);
  const entity = state.selectedId ? ix.entity.get(state.selectedId) : undefined;
  const feature = props.features.find((x) => x.id === state.selectedId);
  return (
    <div className="page">
      {state.selectedId && <button className="close" onClick={() => onSelect(null)} aria-label="Close details">×</button>}
      {feature ? <FeatureDetails {...props} feature={feature} />
        : geo ? <PlaceDetails {...props} geo={geo} />
        : entity?.kind === 'character' ? <CharacterDetails {...props} entity={entity} />
        : entity?.kind === 'faction' ? <FactionDetails {...props} entity={entity} />
        : <Overview {...props} />}
    </div>
  );
}

function Overview({ ix, state, onSelect }: Props) {
  const { world } = ix;
  const heroes = heroPlacements(ix);
  const strategic = state.mode === 'strategic';
  const factions = world.entities.filter((e) => e.kind === 'faction');
  const reports = forceReports(ix);
  return (
    <>
      <p className="eyebrow">{strategic ? 'Strategic view' : 'Exploration'}</p>
      <h2>{strategic ? 'The War Table' : 'Where things stand'}</h2>

      {!strategic && (
        <dl>
          {world.current?.fields.map((f, i) => (
            <div key={i}><dt>{f.label} <span className="cite">{cite(f.ref)}</span></dt><dd><Md text={f.text} /></dd></div>
          ))}
          {!world.current && <p className="hint">Import the campaign chronicle to see the current state.</p>}
        </dl>
      )}

      <section>
        <h3>The company <small>{heroes.length}</small></h3>
        <ul className="roster">
          {heroes.map((h) => (
            <li key={h.entity.id}>
              <button className="link" onClick={() => onSelect(h.entity.id)}>{h.entity.name}</button>
              {' — '}
              {h.locationId ? <>at <PlaceLink ix={ix} id={h.locationId} onSelect={onSelect} /></> : <em>whereabouts not recorded</em>}
              <span className="cite">{h.basis}{h.ref ? ` ${cite(h.ref)}` : ''}</span>
            </li>
          ))}
        </ul>
      </section>

      {strategic && (
        <>
          <section>
            <h3>Factions <small>{factions.length}</small></h3>
            <p className="hint">Banner devices are placeholders: the documents describe no heraldry. A banner on the map means the faction’s own entry names that place; it is not a claim of control.</p>
            <ul className="faction-list">
              {factions.map((f) => (
                <li key={f.id}>
                  <svg viewBox="-3 -26 20 32" width="18" height="28"><Banner id={f.id} name={f.name} stale={f.attrs.stale === true} allied={factionStance(f) === 'allied'} /></svg>
                  <div>
                    <button className="link" onClick={() => onSelect(f.id)}>{f.name}</button>
                    <span className="cite">{factionStance(f) === 'allied' ? 'entry says “allied”' : 'stance not stated'}{f.attrs.stale ? ' · entry may be out of date' : ''}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Reported forces <small>{reports.length}</small></h3>
            <p className="hint">Head-counts quoted from faction entries and open threads. They are reports, possibly out of date; no unit is placed on the map.</p>
            <ul>{reports.map((r, i) => <Quote key={i} text={r.text} refTo={r.ref} note={[r.entity.name, formatTime(r.asOf)].join(' · ')} />)}</ul>
          </section>
          <section>
            <h3>Not established</h3>
            <p className="hint">The documents define no borders, no territorial control and no army positions, so none are drawn.</p>
          </section>
        </>
      )}
      <p className="hint">Select a place, a hero token or a banner on the map.</p>
    </>
  );
}

function PlaceDetails({ ix, layer, state, geo, features, onResetPosition, onPlaceAtCentre, onAddNote, onRemoveNote, onSelect }: Props & { geo: GeoLocation }) {
  const [showAll, setShowAll] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const { world } = ix;
  const slug = geo.id.replace('location:', '');
  const entity = ix.entity.get(geo.id);
  const pos = effectivePosition(ix, layer, geo.id);
  const silence = silenceOf(world, geo.id);
  const day = state.overlays.history ? state.timelineDay ?? world.current?.day ?? world.maxDay : null;
  const blocks = mentionBlocks(ix, geo.id);
  const shown = showAll ? blocks : blocks.slice(0, 6);
  const children = world.geo.filter((g) => g.parentId === geo.id);
  const presences = world.relations.filter((r) => r.type === 'presence' && r.to === geo.id);
  const notes = layer.annotations.filter((a) => a.entityId === geo.id);
  const people = coMentioned(ix, geo.id, 'character').slice(0, 14);
  const here = heroPlacements(ix).filter((h) => h.locationId === geo.id);
  const partyHere = world.current?.partyLocationId === geo.id;
  const drawn = features.filter((x) => x.status === 'interpreted' && x.near?.[0] === slug);
  const routes = ROUTES.filter((r) => r.stops.includes(slug));
  const reports = forceReports(ix).filter((r) => r.locationIds.includes(geo.id));

  return (
    <>
      <p className="eyebrow">
        {KIND_LABEL[geo.kind]}
        {geo.parentId && <> · in <PlaceLink ix={ix} id={geo.parentId} onSelect={onSelect} /></>}
      </p>
      <h2>{geo.name}</h2>
      <p className="seals">
        <span className={`seal ${partyHere ? 'here' : recordedInPlay(ix, geo.id) ? 'in-play' : 'report'}`}>
          {partyHere ? 'The company is here' : recordedInPlay(ix, geo.id) ? 'Recorded in play' : 'Known by report'}
        </span>
        <span className="seal uncertain">{pos?.status === 'user-placed' ? 'Placed by you' : pos ? 'Position provisional' : 'Not on the map'}</span>
        {silence && <span className={`seal ${silence.status}`}>Silence: {silence.status}</span>}
      </p>
      <p className="hint">
        {partyHere ? 'Given as the present location in the chronicle’s current state.'
          : recordedInPlay(ix, geo.id) ? 'The session log names this place. That is not, by itself, proof that Thalorien stood there.'
          : 'No session-log entry names this place; it is known from other entries only.'}
      </p>

      {entity && entity.records.length > 0 && (
        <section>
          <h3>As recorded</h3>
          <ul>{entity.records.map((r, i) => <Quote key={i} text={r.text} refTo={r.ref} />)}</ul>
        </section>
      )}

      {here.length > 0 && (
        <section>
          <h3>Here now</h3>
          <p className="tags">{here.map((h) => <button key={h.entity.id} className="tag" onClick={() => onSelect(h.entity.id)}>{h.entity.name}</button>)}</p>
        </section>
      )}

      <section>
        <h3>Where it lies</h3>
        {!pos && <p>The documents give no position for this place. <button onClick={() => onPlaceAtCentre(geo.id)}>Place at map centre</button></p>}
        {pos?.status === 'user-placed' && (
          <p>You placed this marker. <button onClick={() => onResetPosition(geo.id)}>{geo.position ? 'Return to provisional spot' : 'Remove from map'}</button></p>
        )}
        {pos?.status === 'provisional' && (
          <p>
            {geo.positionBasis === 'stated-relation'
              ? 'Set down to agree with the statements below. The exact spot is not established, and the map has no scale.'
              : 'The documents say nothing about where this lies. The marker is a placeholder.'}{' '}
            Turn on “Move markers” to drag it.
          </p>
        )}
        <ul>
          {geo.relations.map((r, i) => (
            <li key={i} className="quote">
              <span className="cite">{r.ref ? cite(r.ref) : 'not found'} · {r.certainty}{r.attested ? '' : ' · UNVERIFIED'}</span>
              {r.kind === 'bearing' ? `${r.bearing} of ` : r.kind === 'within' ? 'Within ' : 'Near '}
              <PlaceLink ix={ix} id={r.target} onSelect={onSelect} />: “{r.quote}”
            </li>
          ))}
          {routes.map((r) => (
            <li key={r.id} className="quote">
              <span className="cite">{r.kind === 'travelled' ? 'journey recorded' : r.kind === 'planned' ? 'directions held, not yet travelled' : 'named road'} · line drawn schematically</span>
              {r.label}: “{r.quote}”
            </li>
          ))}
          {drawn.map((x) => (
            <li key={x.id} className="quote">
              <span className="cite">painted map · atlas interpretation, not canon</span>
              {x.description}{' '}
              <em>Basis: {x.basis?.length ? x.basis.map((q) => `“${q}”`).join(' · ') : 'the place’s name only'}.</em>
            </li>
          ))}
        </ul>
        {children.length > 0 && (
          <p className="hint">Contains: {children.map((c, i) => <span key={c.id}>{i > 0 && ', '}<PlaceLink ix={ix} id={c.id} onSelect={onSelect} /></span>)}</p>
        )}
      </section>

      {silence && (
        <section>
          <h3>The silence</h3>
          <ul><Quote text={silence.text} refTo={silence.ref} /></ul>
        </section>
      )}

      {(presences.length > 0 || reports.length > 0) && (
        <section>
          <h3>Factions naming this place <small>{presences.length}</small></h3>
          <p className="hint">The faction’s own entry names this place. This is not a claim of control or of forces present.</p>
          <ul>
            {presences.map((r, i) => {
              const f = ix.entity.get(r.from);
              return (
                <li key={i} className="quote">
                  <span className="cite">{cite(r.ref!)}{f?.attrs.stale ? ' · entry may be out of date' : ''}</span>
                  <button className="link" onClick={() => onSelect(r.from)}>{f?.name}</button> — {r.note}
                </li>
              );
            })}
            {reports.map((r, i) => <Quote key={`f${i}`} text={r.text} refTo={r.ref} note={`force report · ${r.entity.name} · ${formatTime(r.asOf)}`} />)}
          </ul>
        </section>
      )}

      <EntityList title="Quests" items={entitiesMentioning(ix, geo.id, 'quest')} />
      <EntityList title={day === null ? 'Events' : `Events to Day ${day}`} items={eventsAt(ix, geo.id, day)}
        note={day === null ? undefined : 'Undated events are hidden while the historical overlay is on.'} />
      <EntityList title="Open threads" items={entitiesMentioning(ix, geo.id, 'thread').filter((t) => t.status === 'open')} />

      {people.length > 0 && (
        <section>
          <h3>People named alongside</h3>
          <p className="tags">{people.map((p) => <button key={p.entity.id} className="tag" onClick={() => onSelect(p.entity.id)}>{p.entity.name} <small>×{p.count}</small></button>)}</p>
        </section>
      )}

      <section>
        <h3>Your notes <small>{notes.length}</small></h3>
        <ul>
          {notes.map((n) => (
            <li key={n.id} className="note"><strong>{n.title}</strong> {n.text} <button className="link" onClick={() => onRemoveNote(n.id)}>delete</button></li>
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
          <textarea aria-label="Note text" placeholder="Your own note (kept apart from the imported record)" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit">Add note</button>
        </form>
      </section>

      <section>
        <h3>Source passages <small>{blocks.length}</small></h3>
        <ul>
          {shown.map((b) => (
            <Quote key={b.id} text={b.text} refTo={{ docId: b.docId, blockId: b.id, line: b.line, endLine: b.endLine, headingPath: b.headingPath }} note={b.asOf ? formatTime(b.asOf) : undefined} />
          ))}
        </ul>
        {blocks.length > 6 && <button onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${blocks.length}`}</button>}
      </section>
    </>
  );
}

/** A proposed (or interpreted) atlas feature: what it is, why it is drawn, and the player's controls over it. */
function FeatureDetails({ ix, layer, feature, onSelect, onEditFeature, onRemoveFeature, onResetPosition }: Props & { feature: AtlasFeature }) {
  const original = ATLAS_FEATURES.find((x) => x.id === feature.id);
  const [name, setName] = useState(feature.name ?? '');
  const [description, setDescription] = useState(feature.description);
  const proposed = feature.status === 'proposed';
  const moved = Boolean(layer.markerOverrides[feature.id]);
  const edited = Boolean(layer.atlas.edits[feature.id]?.name || layer.atlas.edits[feature.id]?.description);
  return (
    <>
      <p className="eyebrow">{typeHeading(feature.type)} · {feature.region}</p>
      <h2>{proposed ? '❧ ' : ''}{feature.name ?? 'Unnamed feature'}</h2>
      <p className="seals">
        <span className={`seal ${proposed ? 'proposed' : 'uncertain'}`}>{proposed ? 'Proposed atlas addition' : 'Atlas interpretation'}</span>
        <span className="seal dark">Not canon</span>
      </p>
      <p className="hint">
        {proposed
          ? 'Invented for this atlas to make the map coherent. It is not in the campaign documents and nothing has happened here in play. Your Dungeon Master decides whether it becomes real.'
          : 'The atlas’s drawing of something the documents state. The shape and extent are not canon.'}
      </p>
      <section>
        <h3>Description</h3>
        <p>{feature.description}</p>
        {feature.relation && <p><em>Where:</em> {feature.relation}</p>}
        {feature.basis && (
          <p className="hint">Basis: {feature.basis.length ? feature.basis.map((q) => `“${q}”`).join(' · ') : 'the place’s name only'}</p>
        )}
      </section>
      {feature.near && feature.near.length > 0 && (
        <section>
          <h3>Near established places</h3>
          <p className="tags">{feature.near.map((s) => <PlaceLink key={s} ix={ix} id={`location:${s}`} onSelect={onSelect} />).reduce<ReactNode[]>((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}</p>
        </section>
      )}
      {proposed && (
        <section>
          <h3>Change this proposal</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onEditFeature(feature.id, { name: name.trim(), description: description.trim() });
            }}
          >
            <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <textarea aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="row">
              <button type="submit">Save changes</button>
              {edited && original && (
                <button type="button" onClick={() => { onEditFeature(feature.id, { name: '', description: '' }); setName(original.name ?? ''); setDescription(original.description); }}>
                  Restore the atlas’s wording
                </button>
              )}
              {moved && <button type="button" onClick={() => onResetPosition(feature.id)}>Return to its spot</button>}
              <button type="button" onClick={() => { onRemoveFeature(feature.id); onSelect(null); }}>Remove from my atlas</button>
            </div>
          </form>
          <p className="hint">
            Changes are kept with your notes, apart from the campaign record, and can be undone from Map Layers.
            {feature.shape.kind === 'point' ? ' Turn on “Move markers” to drag it.' : ' Its outline on the painted map is fixed for now; removing it repaints the land without it.'}
          </p>
        </section>
      )}
    </>
  );
}

function CharacterDetails({ ix, entity, onSelect }: Props & { entity: Entity }) {
  const [showAll, setShowAll] = useState(false);
  const placement = heroPlacements(ix).find((h) => h.entity.id === entity.id);
  const attitudes = ix.world.claims.filter((c) => c.key === `attitude:${entity.id}`);
  const places = coMentioned(ix, entity.id, 'location').slice(0, 10);
  const records = showAll ? entity.records : entity.records.slice(0, 6);
  return (
    <>
      <p className="eyebrow">{entity.attrs.role === 'player-character' ? 'The hero' : entity.attrs.role === 'companion' ? 'Companion' : 'Person'}{entity.status ? ` · ${entity.status}` : ''}</p>
      <h2>{entity.name}</h2>
      {entity.aliases.length > 0 && <p className="hint">Also: {entity.aliases.join(' · ')}</p>}
      <p className="hint">Portrait: none approved yet. The token shows initials until the appearance registry supplies one.</p>

      {placement && (
        <section>
          <h3>Whereabouts</h3>
          <p>
            {placement.locationId ? <>At <PlaceLink ix={ix} id={placement.locationId} onSelect={onSelect} />.</> : 'Not recorded.'}{' '}
            <span className="cite">{placement.basis}{placement.ref ? ` ${cite(placement.ref)}` : ''}</span>
          </p>
        </section>
      )}

      {attitudes.length > 0 && (
        <section>
          <h3>Attitude toward Thalorien</h3>
          <ul>{attitudes.map((c, i) => <li key={i} className="quote"><span className="cite">{cite(c.ref)} · {formatTime(c.asOf)}</span><strong>{c.value}</strong> — {c.excerpt}</li>)}</ul>
        </section>
      )}

      <section>
        <h3>As recorded <small>{entity.records.length}</small></h3>
        <ul>{records.map((r, i) => <Quote key={i} text={r.text} refTo={r.ref} note={r.asOf ? formatTime(r.asOf) : undefined} />)}</ul>
        {entity.records.length > 6 && <button onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${entity.records.length}`}</button>}
      </section>

      {places.length > 0 && (
        <section>
          <h3>Places named alongside</h3>
          <p className="hint">Named in the same passages; not a record of having been there.</p>
          <p className="tags">{places.map((p) => <button key={p.entity.id} className="tag" onClick={() => onSelect(p.entity.id)}>{p.entity.name} <small>×{p.count}</small></button>)}</p>
        </section>
      )}
    </>
  );
}

function FactionDetails({ ix, entity, onSelect }: Props & { entity: Entity }) {
  const presences = ix.world.relations.filter((r) => r.type === 'presence' && r.from === entity.id);
  const reports = forceReports(ix).filter((r) => r.entity.id === entity.id);
  const stance = factionStance(entity);
  return (
    <>
      <p className="eyebrow">Faction</p>
      <h2>{entity.name}</h2>
      <p className="seals">
        <span className={`seal ${stance === 'allied' ? 'awake' : 'uncertain'}`}>{stance === 'allied' ? 'Entry says “allied”' : 'Stance not stated'}</span>
        {entity.attrs.stale === true && <span className="seal dark">Entry may be out of date</span>}
      </p>
      <section>
        <h3>As recorded</h3>
        <ul>{entity.records.map((r, i) => <Quote key={i} text={r.text} refTo={r.ref} note={r.asOf ? formatTime(r.asOf) : undefined} />)}</ul>
      </section>
      <section>
        <h3>Places its entry names <small>{presences.length}</small></h3>
        <p className="hint">Not territory. The documents establish no borders or control.</p>
        <p className="tags">{presences.map((r, i) => <button key={i} className="tag" onClick={() => onSelect(r.to)}>{ix.entity.get(r.to)?.name ?? r.to}</button>)}</p>
      </section>
      {reports.length > 0 && (
        <section>
          <h3>Reported forces</h3>
          <ul>{reports.map((r, i) => <Quote key={i} text={r.text} refTo={r.ref} note={formatTime(r.asOf)} />)}</ul>
        </section>
      )}
    </>
  );
}
