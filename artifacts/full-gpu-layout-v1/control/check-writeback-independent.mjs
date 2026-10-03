import assert from 'node:assert/strict';
import {readFileSync,writeFileSync}from'node:fs';
import {createHash}from'node:crypto';
import {makeWritebackMux}from'../../../hardware/full-gpu-writeback.mjs';
const root=new URL('../../../',import.meta.url),H=x=>createHash('sha256').update(x).digest('hex'),K=p=>`${p.x},${p.y},${p.z}`;
const P=(x,y,z)=>({x,y,z}),D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
const source='hardware/full-gpu-writeback.mjs',artifact='artifacts/full-gpu-layout-v1/writeback/design.json';
const d=makeWritebackMux();assert.deepEqual(d,JSON.parse(readFileSync(new URL(artifact,root))));
const cells=new Map(d.blocks.map(v=>[K(v.position),v]));let branches=0,sideDiodes=0,bitCases=0,staticSelectors=0;
for(const b of d.branches){
 const cmp=cells.get(K(b.comparator)),rear=cells.get(K(b.data)),mask=cells.get(K(b.mask)),out=cells.get(K(b.output));
 assert.deepEqual(cmp.block.properties,{facing:'west',mode:'subtract'});
 assert.deepEqual(rear.block.properties,{facing:'west',delay:'1'});assert.deepEqual(mask.block.properties,{facing:'north',delay:'1'});assert.deepEqual(out.block.properties,{facing:'west',delay:'1'});
 assert.equal(K(P(cmp.position.x-1,cmp.position.y,cmp.position.z)),K(rear.position));assert.equal(K(P(cmp.position.x,cmp.position.y,cmp.position.z-1)),K(mask.position));
 assert.equal(K(P(cmp.position.x+1,cmp.position.y,cmp.position.z)),K(out.position));assert.equal(K(P(out.position.x+1,out.position.y,out.position.z)),K(b.or_column));
 assert.equal(cells.get(K(b.or_column)).block.id,'minecraft:light_gray_concrete');
 // Other comparator side must be air, and both data/output repeater sides cannot contain a diode.
 assert(!cells.has(K(P(cmp.position.x,cmp.position.y,cmp.position.z+1))));
 for(const diode of [rear,out])for(const dz of[-1,1]){const n=cells.get(K(P(diode.position.x,diode.position.y,diode.position.z+dz)));assert(!n||!['minecraft:repeater','minecraft:comparator'].includes(n.block.id));sideDiodes++;}
 branches++;
}
// Four selector addresses x three source bits x eight output positions. Model
// each actual pair-mismatch, subtract comparator and positive collector stage.
for(let address=0;address<4;address++)for(let combination=0;combination<8;combination++)for(let bit=0;bit<8;bit++){
 let below=false,final=false;
 for(let y=1;y<=19;y+=2){
  const row=(y-1)/8;let injected=false;
  if(Number.isInteger(row)&&row<3){
   const mismatch=(((address&1)!==(row&1))||((address>>1)!==(row>>1)))?15:0;
   const input=(combination&(1<<row))?15:0;
   injected=Math.max(0,input-mismatch)>0;staticSelectors++;
  }
  final=!(below||injected);below=final;
 }
 assert.equal(final,address<3?!!(combination&(1<<address)):false);bitCases++;
}
// Collector columns remain isolated from the mask network by two empty Z cells,
// except each intentional input diode at (25,y,z).
for(const tower of d.towers)for(let y=1;y<=19;y+=2){
 const at=P(tower.base.x,y,tower.base.z);
 for(const [dx,dz]of Object.values(D)){
  const n=cells.get(K(P(at.x+dx,y,at.z+dz)));
  if(n&&n.block.id!=='minecraft:light_gray_concrete')assert(dx===-1&&dz===0&&[1,9,17].includes(y)&&n.block.id==='minecraft:repeater','foreign collector contact');
 }
}
const report={status:'independently_checked_offline_writeback_static_routes',source_sha256:{[source]:H(readFileSync(new URL(source,root))),[artifact]:H(readFileSync(new URL(artifact,root)))},
 checks:{blocks:d.blocks.length,exact_regeneration:true,qualified_branches:branches,diode_side_faces:sideDiodes,independent_static_bit_cases:bitCases,selector_injections:staticSelectors},native_calls:0,
 findings:[],limits:['No general block-power simulator; inherited pair-mismatch behavior supplies the static input relation.','Selector transitions may glitch. WE must remain closed until selected data settles and then through closure.','New loaded24-input/8-output layout is physically unverified. Outputs are combinational; invalid11 produces0 but must still suppress writes.']};
if(process.argv.includes('--save'))writeFileSync(new URL('writeback-independent-review.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
