import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {INPUTS,evaluate,terms}from'./logic/terms.mjs';
import {checkMatrix}from'./logic/check-matrix.mjs';
import {programEdits,ramTransfers}from'./image.mjs';
const matrix=checkMatrix(),d=JSON.parse(readFileSync(new URL('design.json',import.meta.url)));let truth=0;
for(let mask=0;mask<2**INPUTS.length;mask++){
 const i=Object.fromEntries(INPUTS.map((n,b)=>[n,!!(mask&2**b)])),o=evaluate(i);const rows=terms();for(const[name,value]of Object.entries(o))assert.equal(rows.some(t=>t.out===name&&Object.entries(t.literals).every(([k,v])=>i[k]===!!v)),value);
 assert(!(o.owner_set&&o.owner_clear));if(i.boot){assert(o.owner_clear&&!o.ram_grant&&!o.program_grant&&!o.start_admitted&&o.runtime_block);}
 if(!i.owner&&!o.owner_set&&i.load_request)assert(!o.ram_grant);
 if(i.owner&&!i.boot&&(!i.global_channels_drained||[0,1,2,3].some(n=>i['writer'+n]))){assert(!o.owner_clear);assert(o.ram_grant&&o.runtime_block&&!o.start_admitted);}
 if(o.start_admitted)assert(i.cold_initialized&&i.image_verified&&!i.boot&&!i.owner&&!i.load_request&&!i.raw_reset);
 if(!i.boot&&(!i.cores_held_reset||!i.global_channels_drained||!i.program_drained||[0,1,2,3].some(b=>i['bank'+b+'_busy']||i['writer'+b])))assert(!o.dcr_reset_permit);truth++;
}
// READY-low never enters the equations: a live delayed bank tail holds owner.
let i=Object.fromEntries(INPUTS.map(n=>[n,false]));Object.assign(i,{owner:true,cold_initialized:true,cores_held_reset:true});assert.equal(evaluate(i).owner_clear,false);i.global_channels_drained=true;i.program_drained=true;assert.equal(evaluate(i).owner_clear,true);i.writer2=true;assert.equal(evaluate(i).owner_clear,false);
// Cold clear ignores arbitrary retained owners/ACKs; it is a separate pre-run operation.
for(const owner of[false,true])for(const drained of[false,true]){i={owner,global_channels_drained:drained,boot:true};assert(evaluate(i).owner_clear&&!evaluate(i).ram_grant);}
const bytes=Array.from({length:256},(_,a)=>(a*73+19)&255),tx=ramTransfers(bytes,d.panels);assert.equal(new Set(tx.map(t=>t.address)).size,256);for(const t of tx){assert.equal((t.local_address<<2)|t.bank,t.address);assert.equal(t.value,bytes[t.address]);assert.equal(Object.keys(t.levels).length,14);for(let bit=0;bit<6;bit++)assert.equal(t.levels['bank'+t.bank+'_address'+bit],!!(t.local_address&(1<<bit)));for(let bit=0;bit<8;bit++)assert.equal(t.levels['bank'+t.bank+'_data'+bit],!!(t.value&(1<<bit)));}
const words=Array.from({length:256},(_,a)=>(a*257)^0xA55A),edits=programEdits(words,d.configuration),decoded=Array(256).fill(0);for(const e of edits)decoded[e.address]|=e.value<<e.bit;assert.deepEqual(decoded,words);
assert.equal(d.ramReadback.length,2048);assert.equal(new Set(d.ramReadback.map(v=>[v.position.x,v.position.y,v.position.z].join(','))).size,2048);for(const v of d.ramReadback){assert.equal((v.local_address<<2)|v.bank,v.address);assert.equal(v.row,v.local_address&15);assert.equal(v.card,v.local_address>>4);assert(v.required_lock&&v.property==='powered'&&v.lock_property==='powered');}
let negatives=0;for(const bad of[[],Array(256).fill(-1),Array(256).fill(256),Array(255).fill(0)]){assert.throws(()=>ramTransfers(bad,d.panels));negatives++;}for(const bad of[Array(256).fill(65536),Array(256).fill(1.5)]){assert.throws(()=>programEdits(bad,d.configuration));negatives++;}const duplicate=structuredClone(d.configuration);duplicate[1]=duplicate[0];assert.throws(()=>programEdits(words,duplicate));negatives++;
console.log(JSON.stringify({status:'offline_loader_truth_and_full_address_image_checks_passed',matrix,complete_input_truth_cases:truth,ram_addresses:256,program_source_bits:4096,malformed_images_rejected:negatives,native_calls:0,limits:'Pre-run loading plans only; no physical timing or complete global reset/drain producer proof.'}));
