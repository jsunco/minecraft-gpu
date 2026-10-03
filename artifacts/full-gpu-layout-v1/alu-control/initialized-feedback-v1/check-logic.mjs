// Authored static/settled logic verification; no native dynamics or tick claims.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {step} from '../microprogram.mjs';
import {transitionTerms,INPUTS} from '../conditional-v1/terms.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),d=read('./design.json'),qualified=read('../qualified-feedback-v1/design.json'),loop=read('../loop-feedback-v1/design.json'),macro=read('../macro-feedback-v1/design.json');
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,m=new Map(d.blocks.map(v=>[K(v.position),v.block]));
function shape(map){const b=(x,y,z)=>map.get(K(P(x,y,z))),r=(x,y,z,face)=>assert.deepEqual(b(x,y,z),{id:'minecraft:repeater',properties:{facing:face,delay:'1'}}),c=(x,y,z)=>assert.deepEqual(b(x,y,z),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});
 for(const z of[40,64]){r(198,336,z,'west');c(199,336,z);r(199,336,z-1,'north');r(201,336,z,'west');}
 c(190,336,58);r(190,336,57,'north');r(187,336,36,'west');r(188,336,35,'north');assert.deepEqual(b(189,336,36),{id:'minecraft:redstone_wall_torch',properties:{facing:'east'}});r(190,336,36,'west');
 for(const x of[67,153]){assert.equal(b(x,294,-29).id,'minecraft:light_gray_concrete');r(x+1,294,-29,'east');r(x,294,-30,'north');}
 r(64,268,-37,'west');r(242,266,115,'north');r(188,336,29,'south');
 for(const c of qualified.connections.filter(c=>c.kind==='held_next'))assert.equal(map.get(K(c.source)).id,'minecraft:redstone_wire');
 assert.equal(d.ports.controller_initialize.bits[0].position.x,188);
 assert.equal(d.metrics.retained_controller_bits,26);assert.equal(loop.banks.reduce((n,b)=>n+b.stored_bits,0)+macro.bank.stored_bits+4,26);
 for(const n of['phase_initialize','macro_initialize','initialize_qualifiers','macro_next_open','macro_current_open','bit_last','round_last','bit_increment','bit_clear','round_increment','round_clear'])assert(!(n in d.ports),n);
}
shape(m);let negatives=0;for(const[x,y,z,props]of[[199,336,40,{facing:'east',mode:'subtract'}],[199,336,64,{facing:'west',mode:'compare'}],[190,336,58,{facing:'west',mode:'compare'}],[68,294,-29,{facing:'west',delay:'1'}],[154,294,-29,{facing:'west',delay:'1'}],[64,268,-37,{facing:'east',delay:'1'}],[242,266,115,{facing:'south',delay:'1'}]]){const bad=new Map(m),key=K(P(x,y,z));bad.set(key,{...bad.get(key),properties:props});assert.throws(()=>shape(bad));negatives++;}
// Evaluate the actual subtract/OR topology at normalized settled binary levels.
const actualGates=({A,B,current,next,initialize})=>{
 const current3=current===3?15:0,I=initialize?15:0;
 const nextMask=15-Math.max(current3,I),nextOpen=Math.max((A?15:0)-nextMask,0)>0;
 const nextOr=(next&1)||((next>>1)&1)?15:0,currentMask=Math.max(nextOr-I,0),currentOpen=Math.max((B?15:0)-currentMask,0)>0;
 return {nextOpen,currentOpen};
};let gates=0;for(let current=0;current<4;current++)for(let next=0;next<4;next++)for(let bits=0;bits<8;bits++){const A=!!(bits&1),B=!!(bits&2),initialize=!!(bits&4);assert.deepEqual(actualGates({A,B,current,next,initialize}),{nextOpen:A&&(initialize||current===3),currentOpen:B&&(initialize||next===0)});gates++;}
const terms=transitionTerms();let boundaries=0,initializations=0,stalls=0;
for(let macro=0;macro<32;macro++)for(let bit=0;bit<8;bit++)for(let round=0;round<8;round++)for(let combo=0;combo<128;combo++){
 const input=Object.fromEntries(INPUTS.slice(0,7).map((n,i)=>[n,(combo>>i)&1]));input.bit_last=+(bit===7);input.round_last=+(round===7);
 const i={...input,arithmetic_mux:input.mode0|(input.mode1<<1),initialize:false};
 const advance=step({macro,phase:3,bit,round},i);
 // Conditional plane's full262144 gate proof is separately rerun. Here verify
 // the actual four-phase capture/commit selection preserves that recurrence.
 for(let phase=0;phase<4;phase++){
  const s={macro,phase,bit,round},heldNext=(phase+1)&3,a=actualGates({A:true,B:false,current:phase,next:heldNext,initialize:false});
  const captured=a.nextOpen?advance:{macro,bit,round};
  const before=actualGates({A:false,B:true,current:phase,next:heldNext,initialize:false}),after=actualGates({A:false,B:true,current:heldNext,next:heldNext,initialize:false});
  assert.deepEqual(before,after,'held NEXT qualifier must survive CURRENT3→0');
  const got={macro:before.currentOpen?captured.macro:macro,bit:before.currentOpen?captured.bit:bit,round:before.currentOpen?captured.round:round,phase:heldNext};assert.deepEqual(got,step(s,i));boundaries++;
  const closed=actualGates({A:false,B:false,current:phase,next:heldNext,initialize:false});assert.deepEqual(closed,{nextOpen:false,currentOpen:false});stalls++;
 }
}
// Arbitrary current phase/macro/counters and stale next values: held initialize
// first zeroes every NEXT data source, then A closes before B commits zeros.
for(let macro=0;macro<32;macro++)for(let phase=0;phase<4;phase++)for(let bit=0;bit<8;bit++)for(let round=0;round<8;round++){
 const a=actualGates({A:true,B:false,current:phase,next:3,initialize:true});assert(a.nextOpen&&!a.currentOpen);const heldNext=0;
 const b=actualGates({A:false,B:true,current:phase,next:heldNext,initialize:true});assert(!b.nextOpen&&b.currentOpen);assert.deepEqual(step({macro,phase,bit,round},{initialize:true}),{macro:0,phase:0,bit:0,round:0});initializations++;
}
console.log(JSON.stringify({status:'authored_settled_feedback_and_qualifier_checks_passed',blocks:d.blocks.length,retained_controller_bits:26,shared_command_bits:41,qualifier_truth_cases:gates,full_state_phase_boundaries:boundaries,closed_stall_boundaries:stalls,arbitrary_current_initialization_cases:initializations,structural_corruption_rejections:negatives,limits:['Normalized settled Boolean/static proof only. A/B local overlap, data arrival, startup conditioning and actual farthest lock closure remain unmeasured.','Initialize must settle at all data clamps before A; held NEXT phase must stay unchanged until macro,bit,round CURRENT locks have all closed.'],native_calls:0}));
