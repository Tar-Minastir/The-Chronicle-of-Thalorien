/**
 * CLI: run the importer over the authorized documents and print a report.
 *   npm run import:report            summary + issues
 *   npm run import:report -- --all   also list every entity
 * Read-only. Writes nothing.
 */
import { readAuthorizedSources, resolveSourceDir } from '../server/readSources';
import { runImport } from '../src/importer';

const dir = resolveSourceDir(process.cwd());
const bundle = await readAuthorizedSources(dir);
const { world, issues } = runImport(bundle.documents);
const all = process.argv.includes('--all');

console.log(`Source directory: ${dir}`);
for (const s of world.sources) console.log(`  ${s.fileName}  ${s.lineCount} lines  hash ${s.hash}  ${s.lastUpdatedText ? '[' + s.lastUpdatedText.slice(0, 60) + '…]' : ''}`);
for (const m of bundle.missing) console.log(`  MISSING ${m}`);
for (const r of bundle.rejected) console.log(`  REJECTED ${r.fileName} (${r.reason})`);

const kinds = new Map<string, number>();
for (const e of world.entities) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
console.log(`\nBlocks: ${world.blocks.length}   Entities: ${world.entities.length}   Claims: ${world.claims.length}   Relations: ${world.relations.length}`);
console.log('  ' + [...kinds].map(([k, n]) => `${k} ${n}`).join(' · '));
console.log(`Places: ${world.geo.filter((g) => g.position).length} placed (provisional), ${world.geo.filter((g) => !g.position).length} unplaced`);
console.log(`Silences: ${world.silences.map((s) => `${s.locationId.replace('location:', '')}=${s.status}`).join(', ')}`);
console.log(`Current: day ${world.current?.day ?? '?'} at ${world.current?.partyLocationId ?? '?'};  saves ${JSON.stringify(world.saves)}`);

console.log(`\nIssues (${issues.length}):`);
for (const i of issues) {
  console.log(`  [${i.severity}] ${i.code}: ${i.message}`);
  if (i.severity !== 'info' || all) for (const d of i.details.slice(0, 12)) console.log(`      ${d}`);
}

if (all) {
  for (const kind of kinds.keys()) {
    console.log(`\n== ${kind} ==`);
    for (const e of world.entities.filter((x) => x.kind === kind)) {
      const t = e.time?.dayStart !== undefined ? ` [Day ${e.time.dayStart}${e.time.dayEnd !== e.time.dayStart ? '–' + e.time.dayEnd : ''}]` : '';
      console.log(`  ${e.id}  "${e.name}"${e.aliases.length ? ' aka ' + e.aliases.join(' | ') : ''}${e.status ? ' (' + e.status + ')' : ''}${t}  x${e.records.length}`);
    }
  }
}
