import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{step}from'../microprogram.mjs';import{INPUTS,OUTPUTS,transitionTerms}from'./terms.mjs';import{makeAluConditional}from'../../../../hardware/full-gpu-alu-conditional.mjs';
const d=makeAluConditional();assert.deepEqual(d,JSON.parse(readFileSync(new URL('./design.json',import.meta.url))));
const K=p=>`${p.x},${p.y},${p.z}`,m=new Map(d.blocks.map(v=>[K(v.position),v.block])),block=p=>m.get(K(p)),P=(x,y,z)=>({x,y,z});
for(const t of d.products){assert.deepEqual(t.literals,transitionTerms().find(r=>r.macro===t.macro&&r.slot===t.slot).literals);for(const g of t.gates){assert.deepEqual(block(g.comparator),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});assert.deepEqual(block(g.mask),{id:'minecraft:repeater',properties:{facing:'north',delay:'1'}});assert.equal(t.literals[g.name],g.wanted);if(g.wanted)assert.deepEqual(block(P(g.column.x,t.y,t.z-4)),{id:'minecraft:redstone_wall_torch',properties:{facing:'south'}});else assert.equal(block(P(g.column.x,t.y,t.z-4)).id,'minecraft:redstone_wire');}}
assert.deepEqual(d.classes.map(c=>[c.name,c.states]),[['bit_increment',[9,10,12,16,19]],['bit_clear',[0,3,4,5,6,7,8,11,15,18,28,29,30,31]],['round_increment',[13,20]],['round_clear',[0,3,4,5,6,7,8,28,29,30,31]],['reset_eligible',Array.from({length:29},(_,i)=>i+3)],['fault_eligible',Array.from({length:22},(_,i)=>i+5)]]);
for(const g of d.outputGates){const z=g.normal.z;assert.deepEqual(block(P(210,256,z)),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});assert.deepEqual(block(P(218,256,z)),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});assert.deepEqual(block(g.fault_mask),{id:'minecraft:repeater',properties:{facing:'north',delay:'1'}});assert.deepEqual(block(g.reset_mask),{id:'minecraft:repeater',properties:{facing:'south',delay:'1'}});assert.equal(!!g.fault_set,[0,1,3,4].includes(g.bit));assert.equal(!!g.reset_set,[6,8].includes(g.bit));assert.deepEqual(d.ports[g.name].bits[0].position,g.output);}
let cases=0,phaseCases=0;
for(let macro=0;macro<32;macro++)for(let bit=0;bit<8;bit++)for(let round=0;round<8;round++)for(let combo=0;combo<128;combo++){
 const input=Object.fromEntries(INPUTS.slice(0,7).map((n,i)=>[n,(combo>>i)&1]));input.bit_last=Number(bit===7);input.round_last=Number(round===7);
 const normal=Array(9).fill(0);
 for(const row of d.products)if(row.macro===macro){let power=15;for(const g of row.gates){const mismatch=15*Number(input[g.name]!==g.wanted);power=Math.max(power-mismatch,0)?15:0;}if(power)for(const out of row.outputs)normal[out]=15;}
 for(let k=0;k<4;k++)normal[5+k]=d.classes[k].states.includes(macro)?15:0;
 const R=Number(d.classes[4].states.includes(macro)&&input.reset_request)*15,F=Number(d.classes[5].states.includes(macro)&&input.any_fault)*15;
 const outputs=d.outputGates.map(g=>{const gated=Math.max(normal[g.bit]-F,0),plusFault=g.fault_set?Math.max(gated,F):gated,masked=Math.max(plusFault-R,0);return Number((g.reset_set?Math.max(masked,R):masked)>0);});
 const gotMacro=outputs.slice(0,5).reduce((n,v,i)=>n|(v<<i),0),gotBit=outputs[6]?0:(bit+outputs[5])&7,gotRound=outputs[8]?0:(round+outputs[7])&7;
 const expected=step({macro,phase:3,bit,round},{reset_request:!!input.reset_request,any_fault:!!input.any_fault,execute_request:!!input.execute_request,result_ack:!!input.result_ack,compare:!!input.compare,arithmetic_mux:input.mode0|(input.mode1<<1),initialize:false});
 assert.deepEqual([gotMacro,gotBit,gotRound],[expected.macro,expected.bit,expected.round],JSON.stringify({macro,bit,round,input}));cases++;
}
// Admission proposal only: held NEXT phase zero, unlike changing CURRENT phase3,
// persists for the whole B window. It must not reopen other banks in PREP.
for(let current=0;current<4;current++)for(const initialize of[false,true])for(const A of[false,true])for(const B of[false,true]){
 if(A&&B)continue;const next=initialize?0:(current+1)&3;
 const openNext=A&&(initialize||current===3),openCurrent=B&&(initialize||next===0);
 if(!initialize){assert.equal(openNext,!!A&&current===3);assert.equal(openCurrent,!!B&&current===3);}else{assert.equal(openNext,A);assert.equal(openCurrent,B);}
 if(B&&!initialize){const changedCurrent=next;assert.equal(B&&next===0,openCurrent);void changedCurrent;}phaseCases++;
}
console.log(JSON.stringify({status:'authored_conditional_geometry_and_semantics_passed',blocks:d.blocks.length,products:d.products.length,connected_macro_sources:new Set([...d.products.map(t=>t.macro),...d.classes.flatMap(t=>t.states)]).size,output_bits:9,exhaustive_ADVANCE_cases:cases,proposed_clock_boundary_cases:phaseCases,notes:['Clock qualification proposal is checked logically but not yet routed in this map.','Cold conditioning, all26 stores, bit/round terminal routes and native timing remain incomplete.'],native_calls:0}));
