// Bind all56 known reference loops to actual cold-parent provenance groups.
// This is an extraction guard; the root owns whole-overlay composition.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
import{readLargeDesign}from'../../../../hardware/memory-layout-large-json-v2.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),B='artifacts/full-gpu-layout-v1/',pins={},K=p=>`${p.x},${p.y},${p.z}`;
const read=p=>{const b=readFileSync(new URL(p,ROOT));pins[p]=createHash('sha256').update(b).digest('hex');return b.length>450000000?readLargeDesign(fileURLToPath(new URL(p,ROOT))):JSON.parse(b);};
const census=read(B+'repeater-feedback-census-v1/census.json'),labels=read(B+'memory/fabric-colocation-v2/cell-labels.json'),rawLabels=readFileSync(new URL('cell-labels.u16le',H));
const parent=read(labels.parent);assert.equal(pins[labels.parent],labels.parent_sha256);assert.equal(parent.blocks.length,labels.cells);assert.equal(rawLabels.length,labels.cells*2);assert.equal(census.witnesses.length,56);
const ch0=read(B+'memory/channel-colocation-v1/trial-design.json'),p25=read(B+'memory/return-loop-repair-v1/delta.json'),p22=read(B+'memory/return-feedback-extension-v1/delta.json');
const removed0=new Set(ch0.removed.map(v=>K(v.position))),changes25=new Set(p25.substitutions.map(v=>K(v.position))),changes22=new Set(p22.changes.filter(v=>v.before).map(v=>K(v.position)));
const wanted=new Map(census.witnesses.map(v=>[K(v.repeater),v])),rows=[];
for(let i=0;i<parent.blocks.length;i++){const v=parent.blocks[i],w=wanted.get(K(v.position));if(!w)continue;const path=[w.repeater,...w.wire_path],patches=[];
 if(path.some(p=>removed0.has(K(p))))patches.push('channel0_complete_colocation');if(path.some(p=>changes25.has(K(p))))patches.push('residual25_return_entry_repair');if(path.some(p=>changes22.has(K(p))))patches.push('additional22_feedback_extension');
 assert.equal(patches.length,1,'Ambiguous/uncovered loop '+K(v.position));rows.push({position:v.position,block:v.block,actual_group:labels.labels[rawLabels.readUInt16LE(i*2)],repair:patches[0],wire_path:w.wire_path,minimum_nominal_rear_power:w.minimum_nominal_rear_power});
}
assert.equal(rows.length,56);const byGroup={},byRepair={};for(const v of rows){byGroup[v.actual_group]=(byGroup[v.actual_group]??0)+1;byRepair[v.repair]=(byRepair[v.repair]??0)+1;}
assert.deepEqual(byRepair,{additional22_feedback_extension:22,channel0_complete_colocation:9,residual25_return_entry_repair:25});
pins[B+'memory/fabric-colocation-v2/cell-labels.u16le']=createHash('sha256').update(rawLabels).digest('hex');
const out={status:'all56_original_feedback_witnesses_mapped_to_explicit_repairs',source_sha256:pins,parent_cells:parent.blocks.length,byGroup,byRepair,rows,selected:false,native_acceptance:false,limits:['Each old feedback loop must be excluded or replaced before reusing its route group.','A patch intersecting the old witness is provenance, not a replacement proof; root whole-overlay inspection owns that check.','No exhaustive multi-device-cycle or normal-handshake acceptance.']};writeFileSync(new URL('loop-ownership.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,byGroup,byRepair}));
