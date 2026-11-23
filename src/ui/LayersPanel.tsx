/**
 * "Map Layers & Legend": every layer independently toggleable, grouped by category, with a legend that
 * uses the same symbols as the map, optional category highlighting, and management of proposed additions.
 */
import { useMemo, useState, type Dispatch, type ReactNode } from 'react';
import { Banner, HeroToken, PlaceIcon, ProposedIcon, SilenceSigil } from '../atlas/art';
import { ATLAS_FEATURES, exportProposalsMarkdown, resolveFeatures, typeHeading } from '../atlas/geography';
import type { Highlight, LayerVisibility, MapAction, MapState, Overlays } from '../map/mapState';
import type { UserLayer } from '../storage/userLayer';

interface Props {
  map: MapState;
  dispatch: Dispatch<MapAction>;
  layer: UserLayer;
  onSelect: (id: string) => void;
  onRestoreFeature: (id: string) => void;
}

const Sym = ({ children, box = '-14 -14 28 28' }: { children: ReactNode; box?: string }) => (
  <svg className="sym" viewBox={box} width="26" height="26" aria-hidden="true">{children}</svg>
);
const Swatch = ({ cls }: { cls: string }) => <i className={`swatch ${cls}`} aria-hidden="true" />;

type Row = { key: keyof LayerVisibility; label: string; sym: ReactNode; note?: string; strategic?: boolean };
type Group = { title: string; highlight: Highlight; rows: Row[] };

const GROUPS: Group[] = [
  {
    title: 'World Geography', highlight: 'geography',
    rows: [
      { key: 'terrain', label: 'Terrain illustration', sym: <Swatch cls="land" />, note: 'the whole painted world' },
      { key: 'forests', label: 'Forests and woodlands', sym: <Swatch cls="wood" /> },
      { key: 'mountains', label: 'Mountains and highlands', sym: <Swatch cls="peak" /> },
      { key: 'waters', label: 'Rivers and waters', sym: <Swatch cls="water" /> },
      { key: 'routes', label: 'Recorded routes', sym: <Swatch cls="route" /> },
      { key: 'proposed', label: 'Proposed atlas additions', sym: <Sym><ProposedIcon type="landmark" /></Sym>, note: 'invented; not canon' },
      { key: 'places', label: 'Settlements and regions', sym: <Sym><PlaceIcon kind="settlement" /></Sym> },
      { key: 'labels', label: 'Names', sym: <span className="sym text">Aa</span> },
    ],
  },
  {
    title: 'Characters & Politics', highlight: 'characters',
    rows: [
      { key: 'heroes', label: 'Hero tokens', sym: <Sym box="-18 -18 36 36"><HeroToken id="legend" name="T H" lead={false} selected={false} /></Sym> },
      { key: 'factions', label: 'Faction banners', sym: <Sym box="-6 -28 28 34"><Banner id="faction:legend" name="Legend" stale={false} allied={false} /></Sym>, strategic: true },
      { key: 'reports', label: 'Strategic reports', sym: <Sym><g className="dispatch"><path d="M0 -8 L2.3 -3.2 L7.6 -2.5 L3.8 1.2 L4.7 6.5 L0 4 L-4.7 6.5 L-3.8 1.2 L-7.6 -2.5 L-2.3 -3.2 Z" /></g></Sym>, strategic: true },
    ],
  },
  {
    title: 'Mystical Landmarks', highlight: 'mystical',
    rows: [
      { key: 'silences', label: 'The Seven Silences', sym: <Sym><SilenceSigil state="awake" r={9} /></Sym>, strategic: true },
      { key: 'sites', label: 'Other established sites', sym: <Sym><PlaceIcon kind="site" /></Sym> },
    ],
  },
];
const EXTRA: [keyof Overlays, string][] = [
  ['history', 'Historical overlay'],
  ['annotations', 'My annotations'],
  ['provisional', 'Uncertainty indicators'],
];

export function LayersPanel({ map, dispatch, layer, onSelect, onRestoreFeature }: Props) {
  const [preview, setPreview] = useState(false);
  const strategic = map.mode === 'strategic';
  const proposed = useMemo(() => resolveFeatures(layer.atlas, true).filter((f) => f.status === 'proposed'), [layer.atlas]);
  const removed = ATLAS_FEATURES.filter((f) => layer.atlas.removed.includes(f.id));
  const markdown = useMemo(() => (preview ? exportProposalsMarkdown(layer.atlas, new Date().toISOString().slice(0, 10)) : ''), [preview, layer.atlas]);

  const save = () => {
    const text = exportProposalsMarkdown(layer.atlas, new Date().toISOString().slice(0, 10));
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atlas-proposals-for-the-dm.md';
    a.click();
    URL.revokeObjectURL(url);
  };
  const setAll = (keys: (keyof LayerVisibility)[], on: boolean) =>
    dispatch({ type: 'set-layers', layers: Object.fromEntries(keys.map((k) => [k, on])) });

  return (
    <div className="page layers-page">
      <p className="eyebrow">{strategic ? 'Strategic view' : 'Exploration'}</p>
      <h2>Map Layers &amp; Legend</h2>

      {GROUPS.map((g) => {
        const keys = g.rows.map((r) => r.key);
        const allOn = keys.every((k) => map.layers[k]);
        return (
          <section key={g.title} className="layer-group">
            <h3>
              {g.title}
              <span className="group-tools">
                <button className="link" onClick={() => setAll(keys, !allOn)}>{allOn ? 'hide all' : 'show all'}</button>
                <button
                  className={`link${map.highlight === g.highlight ? ' active' : ''}`} aria-pressed={map.highlight === g.highlight}
                  onClick={() => dispatch({ type: 'set-highlight', highlight: map.highlight === g.highlight ? 'none' : g.highlight })}
                >
                  {map.highlight === g.highlight ? 'highlighted' : 'highlight'}
                </button>
              </span>
            </h3>
            {g.rows.map((r) => (
              <label key={r.key} className={`layer-row${r.strategic && !strategic ? ' dim' : ''}`}>
                <input type="checkbox" checked={map.layers[r.key]} onChange={() => dispatch({ type: 'toggle-layer', layer: r.key })} />
                {r.sym}
                <span>{r.label}{r.note && <small> — {r.note}</small>}{r.strategic && !strategic && <small> — strategic view only</small>}</span>
              </label>
            ))}
          </section>
        );
      })}

      <section className="layer-group">
        <h3>Additional Controls</h3>
        {EXTRA.map(([k, label]) => (
          <label key={k} className="layer-row">
            <input type="checkbox" checked={map.overlays[k]} onChange={() => dispatch({ type: 'toggle-overlay', overlay: k })} />
            <span className="sym" />
            <span>{label}</span>
          </label>
        ))}
        <label className="layer-row">
          <input type="checkbox" checked={map.editPositions} onChange={() => dispatch({ type: 'toggle-edit-positions' })} />
          <span className="sym" />
          <span>Move markers by dragging</span>
        </label>
      </section>

      <section>
        <h3>Legend</h3>
        <ul className="legend-list">
          <li><Sym><circle className="plinth" r="10" /><PlaceIcon kind="settlement" /></Sym> Settlement or hold <small>(in the documents)</small></li>
          <li><Sym><circle className="plinth" r="10" /><PlaceIcon kind="site" /></Sym> Site or landmark <small>(in the documents)</small></li>
          <li><Sym><g className="marker report"><circle className="plinth" r="10" /><PlaceIcon kind="site" /></g></Sym> Faded: known by report, not named in the session log</li>
          <li><Sym box="-22 -22 44 44"><g className="marker unanchored"><circle className="uncertain" r="19" /><circle className="plinth" r="10" /><PlaceIcon kind="site" /></g></Sym> Dashed halo: nothing is stated about where it lies</li>
          <li><Sym><ProposedIcon type="settlement" /></Sym> Dotted ring and leaf, or a name with ❧: proposed atlas addition</li>
          <li><Sym box="-18 -18 36 36"><HeroToken id="legend2" name="T H" lead selected={false} /></Sym> Round medallion: Thalorien and companions the chronicle places</li>
          <li><Sym box="-6 -28 28 34"><Banner id="faction:legend" name="Legend" stale={false} allied /></Sym> Pennant: a faction whose entry names the place. Gold stud: entry says “allied”. Not control.</li>
          <li><Sym><g className="dispatch"><path d="M0 -8 L2.3 -3.2 L7.6 -2.5 L3.8 1.2 L4.7 6.5 L0 4 L-4.7 6.5 L-3.8 1.2 L-7.6 -2.5 L-2.3 -3.2 Z" /></g></Sym> Red seal: a force report names the place. Not a position.</li>
          <li><Sym><SilenceSigil state="awake" r={9} /></Sym><Sym><SilenceSigil state="holding" r={9} /></Sym><Sym><SilenceSigil state="dark" r={9} /></Sym> Star sigils: a silence awake · holding · dark</li>
          <li><Swatch cls="route" /> Dotted red: journey recorded in the chronicle</li>
          <li><Swatch cls="route road" /> Bronze dashes: a named road · <Swatch cls="route planned" /> grey: directions held, not yet travelled</li>
          <li><Swatch cls="route proposed-road" /> Faint double dash: proposed road</li>
        </ul>
        <p className="hint">
          Places come from the campaign documents; every position is provisional and the map has no scale. The painted
          land is the atlas’s interpretation of what the documents describe, filled out with proposed additions. No
          borders, territories or armies are drawn, because the documents establish none.
        </p>
      </section>

      <section>
        <h3>Proposed additions <small>{proposed.length}</small></h3>
        <p className="hint">Invented for the atlas and not canon. Select one to rename, re-describe, move or remove it. Export the list for your Dungeon Master to decide.</p>
        <p className="tags">{proposed.map((f) => <button key={f.id} className="tag" onClick={() => onSelect(f.id)} title={typeHeading(f.type)}>❧ {f.name}</button>)}</p>
        {removed.length > 0 && (
          <p className="hint">
            Removed: {removed.map((f, i) => <span key={f.id}>{i > 0 && ', '}{f.name} <button className="link" onClick={() => onRestoreFeature(f.id)}>restore</button></span>)}
          </p>
        )}
        <div className="row">
          <button onClick={() => setPreview(!preview)}>{preview ? 'Hide the proposal' : 'Preview the proposal'}</button>
          <button onClick={save}>Save as Markdown…</button>
        </div>
        {preview && <textarea className="export-preview" readOnly value={markdown} aria-label="Proposed atlas additions, Markdown" />}
      </section>
    </div>
  );
}
