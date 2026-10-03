// Bounded actual-path regression after the full six-face power audit rejected three wires.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const H=new URL('.',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,H))),K=p=>`${p.x},${p.y},${p.z}`,sha=p=>createHash('sha256').update(readFileSync(new URL(p,H))).digest('hex');
const d=read('design.json'),old=read('history/before-strong-power-repair/rejected-flights.json'),hints=read('history/before-strong-power-repair/path-hints.json'),m=new Map(d.blocks.map(v=>[K(v.position),v]));
assert.equal(d.connections.length,64);
for(const [src,solid,wire] of old.forbidden_paths){assert.notEqual(m.get(wire.join(','))?.block.id,'minecraft:redstone_wire','Original unintended strong-power recipient remains');const known=old.routes.find(r=>r.path.some(p=>K(p)===wire.join(',')));assert(known);const replacement=d.routes.find(r=>r.name===known.name);assert(replacement&&!replacement.path.some(p=>K(p)===wire.join(',')),'Rejected flight was not rerouted');}
const changed=d.routes.filter(r=>JSON.stringify(r.path)!==JSON.stringify(hints.paths[r.name])).map(r=>r.name);
for(const r of old.routes)assert(changed.includes(r.name));
const report={status:'rejected_strong_solid_paths_removed_from_actual_routes',before_design_sha256:old.design_sha256,after_design_sha256:sha('design.json'),unchanged_connection_count:64,former_bad_paths:old.forbidden_paths,changed_authored_paths:changed,changed_path_count:changed.length,unaffected_authored_paths:d.routes.length-changed.length,scope:'Actual offending dust positions and their three route paths are absent. Full final power audit remains required; this is not a replacement for it.',native_acceptance:false};
writeFileSync(new URL('repair-comparison.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
