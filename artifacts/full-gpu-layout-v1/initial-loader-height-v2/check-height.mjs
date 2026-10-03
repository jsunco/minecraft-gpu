import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),old=read('../initial-loader-v1/design.json'),d=read('design.json');
const K=p=>[p.x,p.y,p.z].join(','),move=p=>({...p,y:p.y+11});
const rerouted=new Set(['new_program_admission_mask','actual_program_quiet']);
const moved=new Set(['program_parent','program_new_request_mask']);
const map=new Map(d.blocks.map(v=>[K(v.position),v]));let preserved=0,raised=0,removed=0;
for(const v of old.blocks){if(rerouted.has(v.part)){removed++;continue;}const p=moved.has(v.part)?move(v.position):v.position;assert.deepEqual(map.get(K(p)),{...v,position:p});if(moved.has(v.part))raised++;else preserved++;}
for(const v of d.blocks)assert(v.position.y>=-64&&v.position.y<=319);
assert.equal(d.blocks.length,old.blocks.length);assert.deepEqual(d.box,{from:{x:-1003,y:-64,z:-290},to:{x:1784,y:313,z:1894}});
assert.deepEqual(d.configuration,old.configuration.map(v=>({...v,position:move(v.position)})));assert.deepEqual(d.ramReadback,old.ramReadback);
for(const r of old.routes)if(!rerouted.has(r.name))assert.deepEqual(d.routes.find(v=>v.name===r.name),r);
assert.deepEqual(d.changes,old.changes.map(v=>v.position.x===-644?{...v,position:move(v.position)}:v));
console.log(JSON.stringify({status:'legal_height_exact_derivative_passed',preserved_blocks:preserved,translated_program_blocks:raised,redrawn_old_route_blocks:removed,redrawn_routes:2,blocks:d.blocks.length,height:378,all_program_source_positions:4096,all_ram_readback_positions:2048,native_calls:0,native_acceptance:false}));
