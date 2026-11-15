/**
 * Application shell: wires repository <-> importer <-> map state <-> panels.
 * Deliberately thin. All logic lives in src/importer, src/storage, src/map and
 * src/domain/selectors; this file only holds React state and event plumbing.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Point } from '../domain/types';
import { applyUserDecisions, indexWorld } from '../domain/selectors';
import type { RejectedSource } from '../importer';
import { buildMapViewModel } from '../map/layers';
import { initialMapState, mapReducer, restoreMapState, type MapMode, type Overlays } from '../map/mapState';
import { fitPoints, type Size } from '../map/viewport';
import { IndexedDbStore } from '../storage/kv';
import { CampaignRepository, type Snapshot, type SnapshotInfo } from '../storage/repository';
import {
  addAnnotation, clearMarkerPosition, decideMerge, dismissIssue, emptyUserLayer, removeAnnotation, setMarkerPosition, type UserLayer,
} from '../storage/userLayer';
import { DetailsPanel } from './DetailsPanel';
import { MapView } from './MapView';
import { SidePanel } from './SidePanel';
import { fetchDiskSources, readPickedFiles, type GatheredSources, type PickedFile } from './sources';

const OVERLAY_LABELS: Record<keyof Overlays, string> = {
  history: 'Historical overlay',
  annotations: 'My notes',
  provisional: 'Provisional hints',
};

export function App({ repository }: { repository?: CampaignRepository }) {
  const repo = useMemo(() => repository ?? new CampaignRepository(new IndexedDbStore()), [repository]);
  const [ready, setReady] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [layer, setLayer] = useState<UserLayer>(emptyUserLayer);
  const [map, dispatch] = useReducer(mapReducer, undefined, initialMapState);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [rejected, setRejected] = useState<RejectedSource[]>([]);
  const size = useRef<Size>({ width: 800, height: 600 });

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

  // Persist map state (debounced) and the user layer (immediately) once loaded.
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

  const centre = (): Point => ({ x: map.viewport.cx, y: map.viewport.cy });
  const fit = () => {
    const pts = vm?.markers.map((m) => m.position) ?? [];
    dispatch({ type: 'set-viewport', viewport: fitPoints(pts, size.current) });
  };
  const zoomBy = (factor: number) =>
    dispatch({ type: 'zoom', size: size.current, anchor: { x: size.current.width / 2, y: size.current.height / 2 }, factor });
  const onSize = useCallback((s: Size) => {
    size.current = s;
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>The Chronicle of Thalorien</h1>
        <div className="group" role="radiogroup" aria-label="Map mode">
          {(['exploration', 'strategic'] as MapMode[]).map((m) => (
            <button key={m} role="radio" aria-checked={map.mode === m} className={map.mode === m ? 'on' : ''} onClick={() => dispatch({ type: 'set-mode', mode: m })}>
              {m === 'exploration' ? 'Exploration' : 'Strategic'}
            </button>
          ))}
        </div>
        <div className="group">
          {(Object.keys(OVERLAY_LABELS) as (keyof Overlays)[]).map((o) => (
            <label key={o}>
              <input type="checkbox" checked={map.overlays[o]} onChange={() => dispatch({ type: 'toggle-overlay', overlay: o })} /> {OVERLAY_LABELS[o]}
            </label>
          ))}
        </div>
        {vm?.timeline.enabled && vm.timeline.maxDay !== null && (
          <label className="group">
            Day {vm.timeline.day}
            <input
              type="range" min={1} max={vm.timeline.maxDay} value={vm.timeline.day ?? vm.timeline.maxDay}
              onChange={(e) => dispatch({ type: 'set-timeline-day', day: Number(e.target.value) })}
            />
          </label>
        )}
        <div className="group">
          <label>
            <input type="checkbox" checked={map.editPositions} onChange={() => dispatch({ type: 'toggle-edit-positions' })} /> Edit positions
          </label>
          <button onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">−</button>
          <button onClick={() => zoomBy(1.4)} aria-label="Zoom in">+</button>
          <button onClick={fit}>Fit</button>
        </div>
      </header>

      <SidePanel
        ix={view?.ix ?? null}
        snapshot={snapshot}
        snapshots={snapshots}
        issues={view?.issues ?? []}
        busy={busy}
        message={message}
        rejected={rejected}
        unplaced={vm?.unplaced ?? []}
        onSyncDisk={() => void runSync(() => fetchDiskSources())}
        onPickFiles={(files: PickedFile[]) => void runSync(() => readPickedFiles(files))}
        onViewSnapshot={(id) => void repo.getSnapshot(id).then((s) => s && setSnapshot(s))}
        onDismissIssue={(id) => updateLayer((l) => dismissIssue(l, id))}
        onDecideMerge={(a, b, d) => updateLayer((l) => decideMerge(l, a, b, d))}
        onSelect={(id) => dispatch({ type: 'select', id })}
      />

      <main className="map-wrap">
        {vm && view ? (
          <>
            <MapView vm={vm} state={map} dispatch={dispatch} onSize={onSize} onMoveMarker={(id, p) => updateLayer((l) => setMarkerPosition(l, id, p))} />
            <p className="legend">
              {map.mode === 'strategic'
                ? 'Strategic: silence status (journal), factions whose entries name a place, party position (chronicle). No borders or armies are drawn: the documents define none.'
                : 'Exploration: places named in the documents; badges count active quests naming the place.'}{' '}
              Dashed markers are provisional positions; the map has no scale.
              {vm.orphanedUserData.length > 0 && ` ${vm.orphanedUserData.length} saved position(s)/note(s) refer to places not in this import (kept).`}
            </p>
          </>
        ) : (
          <div className="empty">
            <p>{ready ? 'No campaign data yet. Use “Sync from disk” or “Choose files…” to import the four campaign documents.' : 'Loading…'}</p>
          </div>
        )}
      </main>

      {view ? (
        <DetailsPanel
          key={map.selectedId ?? 'none'}
          ix={view.ix}
          layer={layer}
          state={map}
          onSelect={(id) => dispatch({ type: 'select', id })}
          onResetPosition={(id) => updateLayer((l) => clearMarkerPosition(l, id))}
          onPlaceAtCentre={(id) => updateLayer((l) => setMarkerPosition(l, id, centre()))}
          onAddNote={(entityId, title, text) => updateLayer((l) => addAnnotation(l, { entityId, title, text }))}
          onRemoveNote={(id) => updateLayer((l) => removeAnnotation(l, id))}
        />
      ) : (
        <aside className="panel details" />
      )}
    </div>
  );
}
