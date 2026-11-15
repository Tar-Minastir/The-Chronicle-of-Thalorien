import { useRef, useState } from 'react';
import type { Issue } from '../domain/types';
import { formatTime } from '../domain/time';
import type { WorldIndex } from '../domain/selectors';
import { stripMd } from '../domain/text';
import type { RejectedSource } from '../importer';
import { AUTHORIZED_DOCS, REJECT_MESSAGES } from '../importer/sourcePolicy';
import type { Snapshot, SnapshotInfo } from '../storage/repository';
import type { PickedFile } from './sources';

interface Props {
  ix: WorldIndex | null;
  snapshot: Snapshot | null;
  snapshots: SnapshotInfo[];
  issues: Issue[];
  busy: boolean;
  message: string;
  rejected: RejectedSource[];
  unplaced: { id: string; name: string }[];
  onSyncDisk: () => void;
  onPickFiles: (files: PickedFile[]) => void;
  onViewSnapshot: (id: string) => void;
  onDismissIssue: (id: string) => void;
  onDecideMerge: (a: string, b: string, decision: 'same' | 'distinct') => void;
  onSelect: (id: string) => void;
}

export function SidePanel(p: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'import' | 'issues'>('import');
  const latestId = p.snapshots[p.snapshots.length - 1]?.id;
  const historical = p.snapshot && p.snapshot.id !== latestId;
  const diff = p.snapshot?.diff;
  const counts = new Map<string, number>();
  for (const e of p.ix?.world.entities ?? []) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);

  return (
    <aside className="panel side">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'import'} onClick={() => setTab('import')}>Documents</button>
        <button role="tab" aria-selected={tab === 'issues'} onClick={() => setTab('issues')}>
          Issues ({p.issues.filter((i) => i.severity !== 'info').length} / {p.issues.length})
        </button>
      </div>

      {tab === 'import' && (
        <div>
          <h2>Import</h2>
          <p className="hint">
            Reads only: {AUTHORIZED_DOCS.map((d) => d.fileName).join(', ')}. The Markdown files are never modified.
          </p>
          <div className="row">
            <button onClick={p.onSyncDisk} disabled={p.busy}>Sync from disk</button>
            <button onClick={() => fileInput.current?.click()} disabled={p.busy}>Choose files…</button>
            <input
              ref={fileInput} type="file" accept=".md,text/markdown" multiple hidden
              onChange={(e) => {
                p.onPickFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </div>
          {p.message && <p className="status" role="status">{p.message}</p>}
          {p.rejected.length > 0 && (
            <ul className="rejected">
              {p.rejected.map((r, i) => <li key={i}><strong>{r.fileName}</strong>: {REJECT_MESSAGES[r.reason]}</li>)}
            </ul>
          )}

          {p.snapshot && (
            <>
              <h3>Documents in this snapshot</h3>
              <table>
                <tbody>
                  {p.snapshot.world.sources.map((s) => (
                    <tr key={s.docId}>
                      <td>{s.fileName}</td>
                      <td>{s.lineCount} lines</td>
                      <td>{s.declaredAsOf ? formatTime(s.declaredAsOf) : 'no header date'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">{[...counts].map(([k, n]) => `${n} ${k}s`).join(' · ')}</p>

              <h3>History</h3>
              <label>
                Snapshot{' '}
                <select value={p.snapshot.id} onChange={(e) => p.onViewSnapshot(e.target.value)}>
                  {[...p.snapshots].reverse().map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.seq} · {new Date(s.createdAt).toLocaleString()} · {s.issueCount} issues
                    </option>
                  ))}
                </select>
              </label>
              {historical && <p className="status">Viewing an older snapshot (read-only view of imported data).</p>}

              {diff && (
                <>
                  <h3>Changes in this snapshot</h3>
                  <p>
                    Documents changed: {diff.documents.filter((d) => d.change !== 'unchanged').map((d) => `${d.docId} (${d.change})`).join(', ') || 'none'}.
                    <br />
                    Lines: +{diff.blocks.added.length} −{diff.blocks.removed.length} ~{diff.blocks.modified.length}.
                    Records: +{diff.entities.added.length} −{diff.entities.removed.length} ~{diff.entities.changed.length}.
                    Issues: {diff.issues.opened.length} new, {diff.issues.resolved.length} resolved.
                  </p>
                  <ul>
                    {diff.blocks.modified.slice(0, 15).map((m, i) => (
                      <li key={i} className="quote">
                        <span className="cite">{m.after.docId}:{m.after.line} changed</span>
                        <del>{stripMd(m.before.text).slice(0, 200)}</del><br /><ins>{stripMd(m.after.text).slice(0, 200)}</ins>
                      </li>
                    ))}
                    {diff.blocks.added.slice(0, 15).map((b, i) => (
                      <li key={`a${i}`} className="quote"><span className="cite">{b.docId}:{b.line} added</span><ins>{stripMd(b.text).slice(0, 200)}</ins></li>
                    ))}
                    {diff.blocks.removed.slice(0, 15).map((b, i) => (
                      <li key={`r${i}`} className="quote"><span className="cite">{b.docId}:{b.line} removed</span><del>{stripMd(b.text).slice(0, 200)}</del></li>
                    ))}
                  </ul>
                </>
              )}

              {p.unplaced.length > 0 && (
                <>
                  <h3>Places without a position</h3>
                  <ul>{p.unplaced.map((u) => <li key={u.id}><button className="link" onClick={() => p.onSelect(u.id)}>{u.name}</button></li>)}</ul>
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'issues' && (
        <div>
          <h2>Inconsistencies &amp; notices</h2>
          <p className="hint">Nothing here was changed or dropped. Each entry lists the source lines so you can decide.</p>
          <ul className="issues">
            {p.issues.map((i) => (
              <li key={i.id} className={`issue ${i.severity}`}>
                <details>
                  <summary><span className="sev">{i.severity}</span> {i.message}</summary>
                  <ul>{i.details.map((d, k) => <li key={k} className="quote">{d}</li>)}</ul>
                  {!i.details.length && i.refs.length > 0 && <p className="cite">{i.refs.map((r) => `${r.docId}:${r.line}`).join(', ')}</p>}
                </details>
                <div className="row">
                  {i.code === 'possible-duplicate' && i.entityIds.length === 2 && (
                    <>
                      <button onClick={() => p.onDecideMerge(i.entityIds[0], i.entityIds[1], 'same')}>Same person</button>
                      <button onClick={() => p.onDecideMerge(i.entityIds[0], i.entityIds[1], 'distinct')}>Different people</button>
                    </>
                  )}
                  <button onClick={() => p.onDismissIssue(i.id)}>Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
