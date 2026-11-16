/**
 * Application shell: wires repository <-> importer <-> map state <-> pages.
 * Deliberately thin. All logic lives in src/importer, src/storage, src/map and
 * src/domain/selectors; this file only holds React state and event plumbing.
 *
 * Layout: the ornate sidebar (logo, navigation, contextual panel) is fixed; the page area holds
 * the atlas or one of the book pages.
 */
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { Entity, EntityKind } from '../domain/types';
import { resolveFeatures, typeHeading } from '../atlas/geography';
import { applyUserDecisions, heroPlacements, indexWorld } from '../domain/selectors';
import type { RejectedSource } from '../importer';
import { buildMapViewModel } from '../map/layers';
import { initialMapState, mapReducer, restoreMapState } from '../map/mapState';
import { IndexedDbStore } from '../storage/kv';
import { CampaignRepository, type Snapshot, type SnapshotInfo } from '../storage/repository';
import { decideMerge, dismissIssue, emptyUserLayer, type UserLayer } from '../storage/userLayer';
import { AtlasPage, type Dock } from './AtlasPage';
import { CodexPage, SheetPage, Tome, attitudeNote } from './Codex';
import { LocationPreview } from './LocationPreview';
import { SidePanel } from './SidePanel';
import { Sidebar, type Section } from './shell/Sidebar';
import { fetchDiskSources, readPickedFiles, type GatheredSources, type PickedFile } from './sources';

export function App({ repository }: { repository?: CampaignRepository }) {
  const repo = useMemo(() => repository ?? new CampaignRepository(new IndexedDbStore()), [repository]);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('atlas');
  const [dock, setDock] = useState<Dock>(null);
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
  const features = useMemo(() => resolveFeatures(layer.atlas, map.layers.proposed), [layer.atlas, map.layers.proposed]);

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
  /** Jump from a book page to the thing on the map. */
  const showOnMap = (id: string) => {
    dispatch({ type: 'select', id });
    setSection('atlas');
  };

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
      onSelect={showOnMap}
    />
  );
  const historyPage = (
    <Tome icon="history" title="Campaign History" intro="The archive: bring in the campaign documents, compare what changed between imports, and review inconsistencies. The documents themselves are never altered.">
      <div className="archive">{archive}</div>
    </Tome>
  );

  let page;
  if (!view || !vm) {
    page = section === 'history' && ready ? historyPage : (
      <div className="empty">
        <div className="empty-card">
          <h2>{ready ? 'The atlas is unwritten' : 'Opening the chronicle…'}</h2>
          {ready && (
            <>
              <p>Bring in the four campaign documents to draw the map. Nothing else in the folder is read, and the documents are never altered.</p>
              <div className="row">
                <button className="ornate" onClick={syncDisk} disabled={busy}>Read the documents from disk</button>
                <button onClick={() => setSection('history')}>Open the archive</button>
              </div>
              {message && <p className="status" role="status">{message}</p>}
            </>
          )}
        </div>
      </div>
    );
  } else if (section === 'atlas') {
    page = <AtlasPage ix={view.ix} vm={vm} map={map} dispatch={dispatch} layer={layer} updateLayer={updateLayer} features={features} dock={dock} setDock={setDock} />;
  } else if (section === 'character') {
    page = <SheetPage ix={view.ix} />;
  } else if (section === 'quests') {
    page = (
      <CodexPage
        icon="scroll" title="Quests" intro="Quests from the journal and open threads from the chronicle, as written."
        groups={[
          { title: 'Active', entities: kind('quest', (e) => e.status === 'active') },
          { title: 'Noted at later saves', entities: kind('quest', (e) => e.status === 'noted') },
          { title: 'Open threads', entities: kind('thread', (e) => e.status === 'open') },
          { title: 'Promises and oaths', entities: kind('promise'), folded: true },
          { title: 'Completed', entities: [...kind('quest', (e) => e.status === 'completed'), ...kind('thread', (e) => e.status === 'done')], folded: true },
        ]}
      />
    );
  } else if (section === 'people') {
    const ix = view.ix;
    const placed = new Set(heroPlacements(ix).filter((h) => h.locationId).map((h) => h.entity.id));
    page = (
      <CodexPage
        icon="companions" title="Companions & NPCs" intro="Everyone the journal and the chronicle register, with each recorded attitude. Portraits await the appearance registry; initials stand in."
        avatars extraFor={(e) => attitudeNote(ix, e)}
        actionFor={(e) => (placed.has(e.id) ? <button className="link" onClick={() => showOnMap(e.id)}>Show on the map</button> : null)}
        groups={[
          { title: 'The company', entities: kind('character', (e) => e.attrs.role === 'player-character' || e.attrs.role === 'companion') },
          { title: 'People of the world', entities: kind('character', (e) => !e.attrs.role).sort((a, b) => a.name.localeCompare(b.name)) },
        ]}
      />
    );
  } else if (section === 'journal') {
    page = (
      <CodexPage
        icon="book" title="Journal" intro="The chronicle’s session log. Dated entries first, by day; undated entries after."
        groups={[
          { title: 'Dated entries', entities: kind('event', (e) => e.time?.dayStart !== undefined).sort(byDay) },
          { title: 'Undated entries', entities: kind('event', (e) => e.time?.dayStart === undefined) },
        ]}
      />
    );
  } else if (section === 'encyclopedia') {
    const proposed = resolveFeatures(layer.atlas, true).filter((f) => f.status === 'proposed');
    page = (
      <CodexPage
        icon="codex" title="World Encyclopedia" intro="Established world facts, lore, factions and places, with the atlas’s proposed additions kept apart at the end."
        actionFor={(e) => (e.kind === 'location' || e.kind === 'faction' ? <button className="link" onClick={() => showOnMap(e.id)}>Show on the map</button> : null)}
        groups={[
          { title: 'Lore and established facts', entities: kind('lore') },
          { title: 'Factions', entities: kind('faction') },
          { title: 'Places', entities: kind('location').sort((a, b) => a.name.localeCompare(b.name)), folded: true },
          { title: 'Things carried', entities: kind('item'), folded: true },
        ]}
        after={(
          <section className="proposed-lore">
            <h3>❧ Proposed atlas additions <small>{proposed.length}</small></h3>
            <p className="hint">Invented for the atlas. Not canon, and not part of the campaign record, until the Dungeon Master says so.</p>
            <ul className="entries">
              {proposed.map((f) => (
                <li key={f.id} className="entry">
                  <div>
                    <h4>❧ {f.name}<span className="seal proposed">proposed</span><span className="seal uncertain">{typeHeading(f.type)}</span></h4>
                    <p>{f.description}</p>
                    {f.relation && <p className="hint">{f.relation}</p>}
                    <p className="entry-actions"><button className="link" onClick={() => showOnMap(f.id)}>Show on the map</button></p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
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
        icon="rules" title="Rules Reference" intro="Every ruling and house rule, verbatim, in the order the Dungeon Master recorded them."
        groups={[...sections].map(([title, entities]) => ({ title, entities }))}
      />
    );
  } else {
    page = historyPage;
  }

  return (
    <div className="app">
      <Sidebar section={section} onSection={setSection} warnings={warnings}>
        {view && (
          <LocationPreview
            ix={view.ix} selectedId={section === 'atlas' ? map.selectedId : null} features={features}
            onOpenDetails={() => {
              if (!map.selectedId && view.ix.world.current?.partyLocationId) dispatch({ type: 'select', id: view.ix.world.current.partyLocationId });
              setSection('atlas');
              setDock('details');
            }}
          />
        )}
      </Sidebar>
      <main>{page}</main>
    </div>
  );
}
