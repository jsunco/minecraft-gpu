// Read exact frozen groups. No constructors, regenerated blocks, or native IO.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const H=new URL('.',import.meta.url),root=new URL('../../../../',H),K=p=>`${p.x},${p.y},${p.z}`,cells=new Map(),sections={},source_sha256={};
function take(dir,groups,ends){
 const url=new URL(`../${dir}/design.json`,H),raw=readFileSync(url),d=JSON.parse(raw);
 source_sha256[url.pathname.slice(root.pathname.length)]=createHash('sha256').update(raw).digest('hex');
 const endpoints=ends(d),keys=new Set(Object.values(endpoints).flat().map(K));let count=0;
 for(const v of d.blocks){const k=K(v.position);if(groups.includes(d.groups[k])||keys.has(k)){const old=cells.get(k);if(old)assert.deepEqual(old.block,v.block);else{cells.set(k,{position:v.position,block:v.block});count++;}}}
 sections[dir]={endpoints,selected_groups:groups,added_cells:count};
}
take('channel-backend-v1',['reset_fanout'],d=>({source:[d.bindings.find(b=>b.name==='reset_blocked').source],destinations:d.bindings.filter(b=>b.name==='reset_blocked').map(b=>b.destination)}));
take('four-bank-service-v1',['global_reset_fanout'],d=>({source:[d.ports.reset.positions[0]],destinations:d.bindings.filter(b=>/^reset_bank/.test(b.name)).map(b=>b.destination)}));
take('admission-close-v1',['actual_initialize_return','actual_witness_source_connections'],d=>({source:[d.sources.initialize],destinations:[d.witness.ports.initialize.bits[0].position]}));
source_sha256[import.meta.url.slice(root.href.length)]=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
writeFileSync(new URL('reset-cable-slice.json',H),JSON.stringify({status:'exact_frozen_reset_cable_cells',blocks:[...cells.values()],sections,source_sha256,native_acceptance:false})+'\n');
console.log(JSON.stringify({cells:cells.size,sections:Object.fromEntries(Object.entries(sections).map(([n,v])=>[n,v.added_cells]))}));
