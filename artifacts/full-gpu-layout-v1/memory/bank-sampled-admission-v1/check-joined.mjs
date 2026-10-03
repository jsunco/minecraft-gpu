// File-only exact four-bank delta replay; no service/bridge imports.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const H=b=>createHash('sha256').update(b).digest('hex'),K=p=>`${p.x},${p.y},${p.z}`,T=(p,o)=>({x:p.x+o.x,y:p.y+o.y,z:p.z+o.z});
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),mf=read('../admission-close-v1/source-manifest.json');assert.equal(H(readFileSync(new URL('../admission-close-v1/source-manifest.json',import.meta.url))),'50773c319a05fc6b811eba0cffc3ef2342fb75729be80d45e7f6a1cdcd101961');
const raw=readFileSync(new URL('../admission-close-v1/design.json',import.meta.url));assert.equal(H(raw),mf.source_sha256['artifacts/full-gpu-layout-v1/memory/admission-close-v1/design.json']);const parent=JSON.parse(raw),d=read('design.json'),l=read('bank.json'),m=new Map(d.blocks.map(v=>[K(v.position),v.block])),removed=new Map(),changed=new Map(),added=new Map();assert.equal(m.size,d.blocks.length);assert.deepEqual(d.box,parent.box);assert.deepEqual(d.ports,parent.ports);
assert.equal(d.bank_sampling_repairs.length,4);
for(const r of d.bank_sampling_repairs){
 assert.equal(r.snapshots.length,8);for(const k of ['added_blocks','removed_blocks','changed_blocks','snapshot_bits','extra_slow_repeaters','removed_slow_repeaters','dimensions'])assert.deepEqual(r.metrics[k],l.metrics[k]);assert.deepEqual(r.added_blocks,l.added_blocks.map(v=>({...v,position:T(v.position,r.origin)})));assert.deepEqual(r.removed_blocks,l.removed_blocks.map(v=>({...v,position:T(v.position,r.origin)})));assert.deepEqual(r.changes,l.changes.map(v=>({...v,position:T(v.position,r.origin)})));
 for(const v of r.added_blocks){const k=K(v.position);assert(!added.has(k));assert.deepEqual(m.get(k),v.block);added.set(k,v.block);}
 for(const v of r.removed_blocks){const k=K(v.position);assert(!m.has(k));removed.set(k,v.block);}
 for(const v of r.changes){const k=K(v.position);assert.deepEqual(m.get(k),v.to);changed.set(k,v);}
}
let preserved=0;for(const v of parent.blocks){const k=K(v.position);assert(!added.has(k));if(removed.has(k))assert.deepEqual(removed.get(k),v.block);else if(changed.has(k))assert.deepEqual(changed.get(k).from,v.block);else{assert.deepEqual(m.get(k),v.block,'parent change '+k);preserved++;}}
assert.equal(d.blocks.length,parent.blocks.length-removed.size+added.size);assert.equal(removed.size,200);assert.equal(changed.size,8);assert.equal(added.size,6516);assert.equal(d.blocks.length,2099920);
const loader=read('../../initial-loader-warm-drain-v3/ports.json');for(const ns of['config','loader','program'])assert.deepEqual(d.preserved_interfaces[ns],loader.ports[ns]);
let terminals=0;function checkPorts(v){if(!v||typeof v!=='object')return;if(Number.isInteger(v.x)&&Number.isInteger(v.y)&&Number.isInteger(v.z)){assert(m.has(K(v)),'missing preserved terminal '+K(v));terminals++;return;}for(const [k,x]of Object.entries(v))if(k==='positions'||k==='position'||k==='bits'||k==='ports'||!['travel','polarity','width','direction'].includes(k))checkPorts(x);}
// Only declared endpoint fields, not offset vectors, are position checks.
for(const ns of Object.values(d.preserved_interfaces))for(const port of Object.values(ns))for(const p of[...(port.positions??[]),...(port.bits??[]).map(b=>b.position)]){assert(m.has(K(p)));terminals++;}
const box=d.box;assert.equal(box.from.y,-64);assert.equal(box.to.y,317);
let negatives=0;const probe=d.bank_sampling_repairs[0].added_blocks.find(v=>v.block.id==='minecraft:repeater');const key=K(probe.position),old=m.get(key);m.delete(key);assert.throws(()=>assert.deepEqual(m.get(key),probe.block));m.set(key,old);negatives++;
for(const ns of['config','loader','program']){const copy=structuredClone(d.preserved_interfaces[ns]);copy.changed=true;assert.throws(()=>assert.deepEqual(copy,loader.ports[ns]));negatives++;}
const result={status:'offline_exact_four_bank_sampling_delta_pass',parent_blocks:parent.blocks.length,unchanged_parent_cells:preserved,added_blocks:added.size,removed_blocks:removed.size,changed_blocks:changed.size,blocks:d.blocks.length,actual_sampled_eligibility_bits:32,public_ports_byte_equal:true,preserved_loader_program_terminal_positions:terminals,box:d.box,occupied_chunk_columns:new Set(d.blocks.map(v=>`${Math.floor(v.position.x/16)},${Math.floor(v.position.z/16)}`)).size,negative_checks:negatives,native_acceptance:false};console.log(JSON.stringify(result));if(process.argv.includes('--save'))writeFileSync(new URL('joined-checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
