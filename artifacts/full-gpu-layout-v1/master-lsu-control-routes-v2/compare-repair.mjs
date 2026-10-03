import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const H=new URL('.',import.meta.url),oldURL=new URL('../master-lsu-control-routes-v1/design.json',H),read=p=>JSON.parse(readFileSync(p)),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
assert.equal(sha(oldURL),'99255958740c5f7d123040fee82b0026b774ea8e2deae2aca51176c822af1eb2');
const old=read(oldURL),d=read(new URL('design.json',H)),K=p=>`${p.x},${p.y},${p.z}`,omit=c=>Object.fromEntries(['name','consumer','core','lane','type','source_instance','source_port','source_bit','source','source_normalizer','destination_instance','destination_port','destination_bit','destination','normalizer','semantics'].map(k=>[k,c[k]]));
assert.deepEqual(d.connections.map(omit),old.connections.map(omit));
const obs=read(new URL('obstacles.json',H)),parent=new Map(obs.cells.map(([x,y,z,b,i])=>[`${x},${y},${z}`,{block:obs.palette[b],instance:obs.instances[i].name}]));const collisions=[];for(const v of old.blocks){const b=parent.get(K(v.position));if(b)collisions.push({position:v.position,part:v.part,other:b});}assert.deepEqual(collisions,read(new URL('before-repair-collisions.json',H)).collisions);parent.clear();

const oldCells=new Map(old.blocks.map(v=>[K(v.position),v])),newCells=new Map(d.blocks.map(v=>[K(v.position),v]));let preserved=0;for(const[k,v]of oldCells)if(JSON.stringify(newCells.get(k))===JSON.stringify(v))preserved++;
const oldPaths=new Map(old.routes.map(v=>[v.name,v])),changedRoutes=d.routes.filter(v=>JSON.stringify(v)!==JSON.stringify(oldPaths.get(v.name))).map(v=>v.name),changedDescents=d.descents.filter(v=>JSON.stringify(v)!==JSON.stringify(old.descents.find(o=>o.name===v.name))).map(v=>v.name);
const config=read(new URL('parents.json',H));for(const v of d.blocks)assert(!config.planning_keepouts.some(b=>['x','y','z'].every(a=>v.position[a]>=b[a][0]&&v.position[a]<=b[a][1])),'Unbuilt write stripe occupied');
const report={status:'same_40_endpoint_contracts_repaired_against_explicit_new_parents',old_design_sha256:sha(oldURL),new_design_sha256:sha(new URL('design.json',H)),old_blocks:old.blocks.length,new_blocks:d.blocks.length,exact_preserved_records:preserved,removed_or_replaced_old_records:old.blocks.length-preserved,new_or_replaced_records:d.blocks.length-preserved,changed_routes:changedRoutes,changed_descents:changedDescents,identical_endpoint_contracts:40,original_collisions_reproduced:collisions.length,unbuilt_write_recipient_keepouts_clear:true,native_acceptance:false};
writeFileSync(new URL('repair-comparison.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
