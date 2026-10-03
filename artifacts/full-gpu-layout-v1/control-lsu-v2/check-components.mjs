import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';
import{makeLsu}from'./prepare.mjs';import{checkMatrix}from'./check-matrix.mjs';import{makeMatrix}from'./matrix.mjs';import{guardDefinition,nextDefinition,actionDefinition}from'./logic.mjs';
import{makeStateBank}from'../../../hardware/full-gpu-state-bank.mjs';import{materializeInstance}from'../../../hardware/gpu-layout-assembly.mjs';import{screen}from'./check.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,d=makeLsu(),m=new Map(d.blocks.map(v=>[K(v.position),v.block]));
const matrices=[guardDefinition,nextDefinition,actionDefinition].map(f=>checkMatrix(makeMatrix(f())));
let inherited=0,locks=0;
for(const[n,desc]of Object.entries(d.parents)){
 let source;if(n==='guard')source=makeMatrix(guardDefinition());else if(n==='next')source=makeMatrix(nextDefinition());else if(n==='action')source=makeMatrix(actionDefinition());else{const width=n==='state_bank'?4:['bank_address','bank_store_data','bank_result'].includes(n)?8:1;source=makeStateBank({width,pair:n==='state_bank'});}
 const material=materializeInstance(source,{id:n,translation:desc.translation});for(const b of material.blocks){assert.deepEqual(m.get(K(b.position)),b.block,n+' '+K(b.position));inherited++;}
 if(source.banks){const t=desc.translation;for(const bank of source.banks)for(const l of bank.latches){const move=p=>P(p.x+t.x,p.y+t.y,p.z+t.z),lock=move(l.lock),storage=move(l.storage);assert.deepEqual(m.get(K(lock)).properties,{facing:'south',delay:'1'});assert.equal(K(P(lock.x,lock.y,lock.z-1)),K(storage));assert.equal(m.get(K(P(lock.x,lock.y,lock.z+1))).id,'minecraft:redstone_wire');assert.deepEqual(m.get(K(storage)).properties,{facing:'west',delay:'1'});assert.equal(m.get(K(P(storage.x-1,storage.y,storage.z))).id,'minecraft:repeater');assert.equal(m.get(K(P(storage.x+1,storage.y,storage.z))).id,'minecraft:redstone_wire');locks++;}}
}
let clampCases=0;for(const p of d.payload){assert.deepEqual(m.get(K(p.clamp)).properties,{facing:'west',mode:'subtract'});assert.deepEqual(m.get(K(p.mask)).properties,{facing:'north',delay:'1'});for(const input of[0,15])for(const clear of[false,true]){let value=clear;for(let y=-3;y<p.column.y;y+=2)value=!value;assert.equal(value,clear);assert.equal(Math.max(0,input-(value?15:0)),clear?0:input);clampCases++;}}
const corruptions=[];const reject=(name,mutate)=>{const q=structuredClone(d);mutate(q);assert.throws(()=>screen(q));corruptions.push(name);};
reject('reverse_new_route_repeater',q=>{q.blocks.find(v=>v.part==='guard_to_next_start'&&v.block.id==='minecraft:repeater').block.properties.facing='west';});
reject('remove_clear_spine_torch',q=>{q.blocks=q.blocks.filter(v=>K(v.position)!=='-4,0,56');});
reject('foreign_clear_spine_driver',q=>{q.blocks.push({position:P(-5,1,56),block:{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}},part:'bad'},{position:P(-5,0,56),block:{id:'minecraft:light_gray_concrete'},part:'bad'});});
reject('cross_read_write_guard_inputs',q=>{q.blocks.push({position:P(31,-3,-65),block:{id:'minecraft:redstone_wire'},part:'bad'},{position:P(31,-4,-65),block:{id:'minecraft:light_gray_concrete'},part:'bad'});});
const result={status:'author_static_component_checks',inherited_blocks:inherited,actual_lock_branches:locks,clamp_boolean_cases:clampCases,matrices,corruptions,native_acceptance:false};if(process.argv.includes('--save'))writeFileSync(new URL('component-checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
