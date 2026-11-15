/**
 * Application shell: wires repository <-> importer <-> map state <-> pages.
 * Deliberately thin. All logic lives in src/importer, src/storage, src/map and
 * src/domain/selectors; this file only holds React state and event plumbing.
 */
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { Entity, EntityKind } from '../domain/types';
import { applyUserDecisions, indexWorld } from '../domain/selectors';
import type { RejectedSource } from '../importer';
import { buildMapViewModel } from '../map/layers';
import { initialMapState, mapReducer, restoreMapState } from '../map/mapState';
import { IndexedDbStore } from '../storage/kv';
import { CampaignRepository, type Snapshot, type SnapshotInfo } from '../storage/repository';
import { decideMerge, dismissIssue, emptyUserLayer, type UserLayer } from '../storage/userLayer';
import { AtlasPage } from './AtlasPage';
import { CodexPage, SheetPage, attitudeNote } from './Codex';
import { SidePanel } from './SidePanel';
import { fetchDiskSources, readPickedFiles, type GatheredSources, type PickedFile } from './sources';

type Section = 'atlas' | 'character' | 'quests' | 'people' | 'encyclopedia' | 'rules' | 'history';
const SECTIONS: [Section, string][] = [
  ['atlas', 'World Atlas'],
  ['character', 'Character'],
  ['quests', 'Quest Journal'],
  ['people', 'Companions & NPCs'],
  ['encyclopedia', 'World Encyclopedia'],
  ['rules', 'Rules Reference'],
  ['history', 'Campaign History'],
];

export function App({ repository }: { repository?: CampaignRepository }) {
  const repo = useMemo(() => repository ?? new CampaignRepository(new IndexedDbStore()), [repository]);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('atlas');
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [layer, setLayer] = useState<UserLayer>(emptyUserLayer);
  const [map, dispatch] = useReducer(mapReducer, undefined, initialMapState);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [rejected, setRejected] = useState<RejectedSource[]>([]);

  // Load persisted state once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, latest, storedLayer, storedMap] = await Promise.all([
        repo.listSnapshots(), repo.latestSnapshot(), repo.loadUserLayer(), repo.loadUi('mapState'),
      ]);
      if (cancelled) return;
      setSnapshots(list);
      setSnapshot(latest);
      setLayer(storedLayer);
      dispatch({ type: 'restore', state: restoreMapState(storedMap) });
      setReady(true);
    })().catch((e) => setMessage(`Could not open local storage: ${String(e)}`));
    return () => {
      cancelled = true;
    };
  }, [repo]);

  // Persist map state (debounced) once loaded; the user layer is saved on every change.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void repo.saveUi('mapState', map), 250);
    return () => clearTimeout(t);
  }, [map, ready, repo]);

  const updateLayer = useCallback(
    (fn: (l: UserLayer) => UserLayer) => {
      setLayer((prev) => {
        const next = fn(prev);
        void repo.saveUserLayer(next);
        return next;
      });
    },
    [repo],
  );

  const view = useMemo(() => {
    if (!snapshot) return null;
    const applied = applyUserDecisions(snapshot.world, snapshot.issues, layer);
    return { ix: indexWorld(applied.world), issues: applied.issues };
  }, [snapshot, layer]);
  const vm = useMemo(() => (view ? buildMapViewModel(view.ix, layer, map) : null), [view, layer, map]);

  const runSync = async (gather: () => Promise<GatheredSources>) => {
    setBusy(true);
    setMessage('Importing…');
    try {
      const gathered = await gather();
      const outcome = await repo.sync(gathered.sources);
      setRejected([...gathered.rejected, ...outcome.rejected]);
      setSnapshots(await repo.listSnapshots());
      if (outcome.snapshot) setSnapshot(outcome.snapshot);
      const missing = gathered.missing.length ? ` Missing on disk: ${gathered.missing.join(', ')}.` : '';
      setMessage(
        outcome.status === 'created'
          ? `Imported ${gathered.sources.length} document(s) into snapshot #${outcome.snapshot.seq}.${missing}`
          : gathered.sources.length
            ? `No changes since the last import.${missing}`
            : `Nothing was imported.${missing}`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const syncDisk = () => void runSync(() => fetchDiskSources());

  const kind = (k: EntityKind, pred: (e: Entity) => boolean = () => true) => view?.ix.world.entities.filter((e) => e.kind === k && pred(e)) ?? [];
  const byDay = (a: Entity, b: Entity) => (a.time?.dayStart ?? Infinity) - (b.time?.dayStart ?? Infinity);
  const warnings = view?.issues.filter((i) => i.severity !== 'info').length ?? 0;

  const archive = (
    <SidePanel
      ix={view?.ix ?? null}
      snapshot={snapshot}
      snapshots={snapshots}
      issues={view?.issues ?? []}
      busy={busy}
      message={message}
      rejected={rejected}
      unplaced={vm?.unplaced ?? []}
      onSyncDisk={syncDisk}
      onPickFiles={(files: PickedFile[]) => void runSync(() => readPickedFiles(files))}
      onViewSnapshot={(id) => void repo.getSnapshot(id).then((s) => s && setSnapshot(s))}
      onDismissIssue={(id) => updateLayer((l) => dismissIssue(l, id))}
      onDecideMerge={(a, b, d) => updateLayer((l) => decideMerge(l, a, b, d))}
      onSelect={(id) => {
        dispatch({ type: 'select', id });
        setSection('atlas');
      }}
    />
  );

  let page;
  if (!view || !vm) {
    page = (
      <div className="empty">
        <div className="empty-card">
          <h2>{ready ? 'The atlas is unwritten' : 'Opening the chronicle…'}</h2>
          {ready && (
            <>
              <p>Bring in the four campaign documents to draw the map. Nothing else in the folder is read, and the documents are never altered.</p>
              <div className="row">
                <button onClick={syncDisk} disabled={busy}>Read the documents from disk</button>
                <button onClick={() => setSection('history')}>Open the archive</button>
              </div>
              {message && <p className="status" role="status">{message}</p>}
            </>
          )}
        </div>
      </div>
    );
    if (section === 'history' && ready) page = <div className="history"><div className="archive">{archive}</div></div>;
  } else if (section === 'atlas') {
    page = <AtlasPage ix={view.ix} vm={vm} map={map} dispatch={dispatch} layer={layer} updateLayer={updateLayer} />;
  } else if (section === 'character') {
    page = <SheetPage ix={view.ix} />;
  } else if (section === 'quests') {
    page = (
      <CodexPage
        title="Quest Journal" intro="Quests from the journal and open threads from the chronicle, as written."
        groups={[
          { title: 'Active', entities: kind('quest', (e) => e.status === 'active') },
          { title: 'Noted at later saves', entities: kind('quest', (e) => e.status === 'noted') },
          { title: 'Open threads (chronicle)', entities: kind('thread', (e) => e.status === 'open') },
          { title: 'Promises and oaths', entities: kind('promise') },
          { title: 'Completed', entities: [...kind('quest', (e) => e.status === 'completed'), ...kind('thread', (e) => e.status === 'done')] },
        ]}
      />
    );
  } else if (section === 'people') {
    const ix = view.ix;
    page = (
      <CodexPage
        title="Companions & NPCs" intro="Everyone the journal and the chronicle register, with each recorded attitude."
        extraFor={(e) => attitudeNote(ix, e)}
        groups={[
          { title: 'The company', entities: kind('character', (e) => e.attrs.role === 'player-character' || e.attrs.role === 'companion') },
          { title: 'People of the world', entities: kind('character', (e) => !e.attrs.role).sort((a, b) => a.name.localeCompare(b.name)) },
        ]}
      />
    );
  } else if (section === 'encyclopedia') {
    page = (
      <CodexPage
        title="World Encyclopedia" intro="Established world facts, lore, factions and places."
        groups={[
          { title: 'Lore and established facts', entities: kind('lore') },
          { title: 'Factions', entities: kind('faction') },
          { title: 'Places', entities: kind('location').sort((a, b) => a.name.localeCompare(b.name)) },
          { title: 'Things carried', entities: kind('item') },
        ]}
      />
    );
  } else if (section === 'rules') {
    const sections = new Map<string, Entity[]>();
    for (const r of kind('ruling')) {
      const key = String(r.attrs.section || 'Rulings');
      sections.set(key, [...(sections.get(key) ?? []), r]);
    }
    page = (
      <CodexPage
        title="Rules Reference" intro="Every ruling and house rule, verbatim, in the order the Dungeon Master recorded them."
        groups={[...sections].map(([title, entities]) => ({ title, entities }))}
      />
    );
  } else {
    page = (
      <div className="history">
        <CodexPage
          title="Campaign History" intro="The chronicle’s session log. Dated entries first, by day; undated entries after."
          groups={[
            { title: 'Dated', entities: kind('event', (e) => e.time?.dayStart !== undefined).sort(byDay) },
            { title: 'Undated', entities: kind('event', (e) => e.time?.dayStart === undefined) },
          ]}
        />
        <div className="archive">{archive}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="masthead">
        <h1><span>The Chronicle of</span> Thalorien</h1>
        <nav aria-label="Sections">
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={section === id ? 'on' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>
              {label}
              {id === 'history' && warnings > 0 && <sup title={`${warnings} inconsistencies to review`}>{warnings}</sup>}
            </button>
          ))}
        </nav>
        {view?.ix.world.current?.day != null && <p className="day">Day {view.ix.world.current.day}</p>}
      </header>
      <main>{page}</main>
    </div>
  );
}
