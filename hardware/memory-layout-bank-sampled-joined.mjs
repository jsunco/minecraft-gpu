// Four exact bank-local repairs in the frozen memory/loader/quiet union.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeSampledBank} from './memory-layout-bank-sampled-admission.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,H=b=>createHash('sha256').update(b).digest('hex');
export function makeSampledBankUnion(){
 const dir=new URL('../artifacts/full-gpu-layout-v1/memory/admission-close-v1/',import.meta.url),manifest=readFileSync(new URL('source-manifest.json',dir));assert.equal(H(manifest),'50773c319a05fc6b811eba0cffc3ef2342fb75729be80d45e7f6a1cdcd101961');const pinned=JSON.parse(manifest).source_sha256,raw=readFileSync(new URL('design.json',dir));assert.equal(H(raw),pinned['artifacts/full-gpu-layout-v1/memory/admission-close-v1/design.json']);const parent=JSON.parse(raw),m=new Map(parent.blocks.map(v=>[K(v.position),v])),nets={...parent.nets},groups={...parent.groups};
 const origins=[P(148,26,1078),P(580,26,1078),P(148,26,1700),P(580,26,1700)],repairs=[];
 for(let bank=0;bank<4;bank++){
  const local=makeSampledBank({bankIndex:bank}),o=origins[bank],T=p=>P(p.x+o.x,p.y+o.y,p.z+o.z),rm=local.removed_blocks.map(v=>({position:T(v.position),block:v.block})),changes=local.changes.map(v=>({...v,position:T(v.position)})),adds=local.added_blocks.map(v=>({position:T(v.position),block:v.block}));
  for(const v of rm){const k=K(v.position);assert.deepEqual(m.get(k)?.block,v.block,'removed-parent mismatch '+k);m.delete(k);delete nets[k];delete groups[k];}
  for(const v of changes){const k=K(v.position);assert.deepEqual(m.get(k)?.block,v.from,'changed-parent mismatch '+k);m.set(k,{position:v.position,block:v.to});nets[k]='bank'+bank+'/'+local.nets[K(P(v.position.x-o.x,v.position.y-o.y,v.position.z-o.z))];}
  for(const v of adds){const k=K(v.position);assert(!m.has(k),'foreign union collision '+k);m.set(k,v);nets[k]='sampled_bank'+bank+'/'+local.nets[K(P(v.position.x-o.x,v.position.y-o.y,v.position.z-o.z))];groups[k]='bank_sampling_repair';}
  repairs.push({bank,origin:o,metrics:local.metrics,added_blocks:adds,removed_blocks:rm,changes,snapshots:local.snapshots.map(s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,k==='slot'?v:T(v)]))),phase_roles:local.phase_roles});
 }
 const blocks=[...m.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}assert.deepEqual(box,parent.box);
 const meta=JSON.parse(readFileSync(new URL('../artifacts/full-gpu-layout-v1/initial-loader-warm-drain-v3/ports.json',import.meta.url))),preserved_interfaces=Object.fromEntries(['config','loader','program'].map(n=>[n,meta.ports[n]]));for(const ns of Object.values(preserved_interfaces))for(const port of Object.values(ns)){for(const p of[...(port.positions??[]),...(port.bits??[]).map(b=>b.position)])assert(m.has(K(p)),'missing preserved boundary '+K(p));}
 const add=repairs.reduce((n,r)=>n+r.added_blocks.length,0),remove=repairs.reduce((n,r)=>n+r.removed_blocks.length,0),metrics={blocks:blocks.length,parent_blocks:parent.blocks.length,added_blocks:add,removed_blocks:remove,changed_blocks:repairs.reduce((n,r)=>n+r.changes.length,0),physical_eligibility_snapshots:32,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),legal_y_translation:[-64-box.from.y,319-box.to.y],occupied_chunk_columns:new Set(blocks.map(v=>`${Math.floor(v.position.x/16)},${Math.floor(v.position.z/16)}`)).size};
 return{...parent,status:'offline_sampled_four_bank_memory_union_candidate',blocks,nets,groups,box,metrics,bank_sampling_repairs:repairs,preserved_interfaces,parent_manifest_sha256:H(manifest),missing:[...parent.missing,'New sample-to-owner and retimed payload/write/response closure require complete route/event bounds; static phase counts are not native acceptance.'],native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeSampledBankUnion();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');writeFileSync(join(out,'ports.json'),JSON.stringify({ports:d.ports,preserved_interfaces:d.preserved_interfaces},null,2)+'\n');writeFileSync(join(out,'inventory.json'),JSON.stringify(d.metrics,null,2)+'\n');console.log(JSON.stringify(d.metrics));}
