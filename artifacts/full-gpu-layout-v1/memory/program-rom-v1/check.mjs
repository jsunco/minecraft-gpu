// Deterministic static integration checks, never a live-memory implementation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeProgramROM} from '../../../../hardware/memory-layout-program.mjs';
import {makeMemorySubarray,key} from '../../../../hardware/memory-layout-subarray.mjs';
import {circuitSchema} from '../../../../tools/minecraft-redstone/scripts/circuit-service.mjs';
const p=(x,y,z)=>({x,y,z}),S='minecraft:light_gray_concrete';
const solid=b=>[S,'minecraft:redstone_block'].includes(b?.id),V={east:[-1,0],west:[1,0],north:[0,1],south:[0,-1]},H=Object.values(V);
const d=makeProgramROM(),saved=JSON.parse(readFileSync(new URL('design.json',import.meta.url)));
assert.deepEqual(d,saved);const m=new Map(d.blocks.map(v=>[key(v.position),v.block]));
assert.equal(m.size,d.blocks.length);let supports=0,parentCells=0,maskContacts=0,tapContacts=0,foreignSteps=0,diodeSides=0;
const get=(x,y,z)=>m.get(key(p(x,y,z))),expect=(x,y,z,b)=>assert.deepEqual(get(x,y,z),b,'Exact cell '+key(p(x,y,z)));
const rep=(x,y,z,facing)=>expect(x,y,z,{id:'minecraft:repeater',properties:{facing,delay:'1'}});
const wire=(x,y,z)=>assert.equal(get(x,y,z)?.id,'minecraft:redstone_wire');
const tower=(x,z,lo,hi)=>{for(let y=lo;y<=hi;y++)assert.equal(get(x,y,z)?.id,(y-lo)%2?'minecraft:redstone_torch':S,'Tower '+key(p(x,y,z)));};
for(const v of d.blocks){
 const a=v.position,b=v.block;if(solid(b))continue;let q={...a,y:a.y-1};
 if(b.id==='minecraft:redstone_wall_torch'){const[dx,dz]=V[b.properties.facing];q=p(a.x+dx,a.y,a.z+dz);}
 assert(solid(m.get(key(q))),'Missing support '+key(a));supports++;
 if(d.groups[key(a)]==='card')continue;
 for(const[dx,dz]of H){
  const q=p(a.x+dx,a.y,a.z+dz),bb=m.get(key(q));
  if(bb&&!solid(bb)&&d.nets[key(a)]!==d.nets[key(q)]){
   const mask=d.groups[key(a)]==='high_card_mask_distribution'&&b.id==='minecraft:repeater'&&d.groups[key(q)]==='high_card_output_selector'&&bb.id==='minecraft:comparator'&&q.x===a.x&&q.z===a.z+1;
   const reverse=d.groups[key(q)]==='high_card_mask_distribution'&&bb.id==='minecraft:repeater'&&d.groups[key(a)]==='high_card_output_selector'&&b.id==='minecraft:comparator'&&a.x===q.x&&a.z===q.z+1;
   assert(mask||reverse,'Foreign active face '+key(a)+' > '+key(q));if(mask)maskContacts++;
  }
  if(b.id==='minecraft:redstone_wire')for(const dy of[-1,1]){
   const r=p(q.x,a.y+dy,q.z),rb=m.get(key(r));if(rb?.id!=='minecraft:redstone_wire'||d.nets[key(a)]===d.nets[key(r)])continue;
   if(dy>0&&m.has(key(p(a.x,a.y+1,a.z))))continue;if(dy<0&&m.has(key(p(r.x,a.y,r.z))))continue;
   foreignSteps++;assert.fail('Foreign dust step '+key(a)+' > '+key(r));
  }
 }
 if(b.id==='minecraft:repeater'){
  const[dx,dz]=V[b.properties.facing];for(const sign of[-1,1]){const q=p(a.x+sign*dz,a.y,a.z+sign*dx),bb=m.get(key(q));if(!['minecraft:repeater','minecraft:comparator'].includes(bb?.id))continue;const[tX,tZ]=V[bb.properties.facing];if(q.x+tX===a.x&&q.z+tZ===a.z){diodeSides++;assert.fail('New side-lock source '+key(a)+' < '+key(q));}}
 }
}
// Changed source cells are exactly the sixteen unused upper-card input adapters.
const base=makeMemorySubarray({kind:'rom',bits:16,id:'rom16x16'}),removed=new Map(d.removed_source_cells.map(v=>[key(v.position),v]));
for(const card of d.cards){
 let omitted=0;for(const v of base.blocks){const q=p(v.position.x,v.position.y+card.origin.y,v.position.z+card.origin.z),r=removed.get(key(q));if(r){assert.equal(card.tier,1);assert.deepEqual(r.block,v.block);assert(!m.has(key(q)));assert([16,17,31,32].includes(v.position.x)&&[0,1].includes(v.position.y)&&[-18,-6].includes(v.position.z));omitted++;}else{assert.deepEqual(m.get(key(q)),v.block,'Inherited card cell '+key(q));parentCells++;}}
 assert.equal(omitted,card.tier?16:0);
}
assert.equal(removed.size,128);assert.equal(d.configuration.length,4096);assert.equal(new Set(d.configuration.map(v=>key(v.position))).size,4096);
// Actual eight input planes and every branch/tower terminate at the intended bit.
const depths=[-4,-8,-12,-16,-25,-21,-33,-29];
for(let b=0;b<8;b++){
 assert.deepEqual(d.ports.address.positions[b],p(88,depths[b],-54));rep(88,depths[b],-53,'north');
 for(let s=0;s<8;s++){
  const local=b%4,z=(local<2?-18:-6)+(b>=4?-18:0)+96*s,y=depths[b];wire(88,y,z);rep(87,y,z,'east');
  if(b<4){const x=local%2?14:34;tower(x,z,y,0);rep(x+1,y,z,'east');rep(local%2?15:33,0,z,local%2?'west':'east');expect(local%2?16:32,0,z,{id:S});wire(local%2?16:32,1,z);rep(local%2?17:31,1,z,local%2?'west':'east');tower(local%2?18:30,z,1,257);}
  else{const x=local%2?12:0;tower(x,z,y,267);rep(x+1,y,z,'east');assert.equal((131-y)%4,0);assert.equal((267-y)%4,0);}
 }
}
// Decode target bits from the actual arm devices, not from an expected table.
const targets=[];
for(const c of d.cards){const y=131+136*c.tier,Z=96*c.stack;let target=0;
 for(let b=0;b<4;b++){const left=b%2===0,z=-36+12*Math.floor(b/2)+Z,x=left?2:10,bb=get(x,y,z);if(bb.id===S){target|=1<<b;expect(left?3:9,y,z,{id:'minecraft:redstone_wall_torch',properties:{facing:left?'east':'west'}});}else rep(x,y,z,left?'west':'east');rep(left?5:7,y,z,left?'west':'east');}
 assert.equal(target,c.card);targets.push(target);rep(9,y,Z-30,'west');
 for(let b=0;b<16;b++){const right=b>=8,j=b%8,z=8*j+Z,x=right?10:2,gate=right?12:0,base=123+136*c.tier,col=right?36+4*j:-4-4*j;
  rep(x,base,z-1,'south');expect(x,base+1,z-1,{id:S});assert(!get(x,base+2,z-1),'Tap cap must retain headroom');tower(x,z-2,base,y);
  rep(right?11:1,y,z-2,right?'west':'east');expect(gate,y,z-2,{id:'minecraft:comparator',properties:{facing:right?'west':'east',mode:'subtract'}});rep(gate,y,z-3,'north');rep(right?13:-1,y,z-2,right?'west':'east');rep(col+(right?-1:1),y,z-2,right?'west':'east');
 }
}
assert.equal(new Set(targets).size,16);
// The selected outputs inject into two same-polarity levels of each isolated OR
// column; all sixteen final rails remain different electrical nets.
for(let b=0;b<16;b++){const right=b>=8,j=b%8,x=right?36+4*j:-4-4*j,rail=right?x+2:x-2;
 for(let s=0;s<8;s++){const z=8*j-2+96*s;tower(x,z,131,271);rep(right?x+1:x-1,271,z,right?'west':'east');wire(rail,271,z);assert.equal(d.nets[key(p(rail,271,z))],'read'+b);}
 rep(rail,271,-55,'south');wire(rail,271,-56);assert.deepEqual(d.ports.read_data.positions[b],p(rail,271,-56));
}
// Preserve every raw path cell, direction and refresh run emitted by generator.
let pathCells=0,maxDust=0;for(const r of d.routes){let dust=0;for(const q of r.path){const b=m.get(key(q));assert(['minecraft:redstone_wire','minecraft:repeater'].includes(b.id));assert.equal(d.nets[key(q)],r.net);if(b.id==='minecraft:repeater'){assert.deepEqual(V[b.properties.facing],{east:[1,0],west:[-1,0],south:[0,1],north:[0,-1]}[r.travel]);dust=0;}else{dust++;maxDust=Math.max(maxDust,dust);assert(dust<=12,'Unrefreshed dust path');}pathCells++;}}
// Screen all newly introduced one-solid strong-power rear paths. The only cross-
// net result is each intended capped tap reading the parent's dust-powered floor.
for(const v of d.blocks){const q=v.position,b=v.block;if(!['minecraft:repeater','minecraft:comparator'].includes(b.id))continue;const[dx,dz]=V[b.properties.facing],rear=p(q.x-dx,q.y,q.z-dz);if(!solid(m.get(key(rear))))continue;const sources=[],above=p(rear.x,rear.y+1,rear.z);if(m.get(key(above))?.id==='minecraft:redstone_wire')sources.push(above);
 for(const[tX,tZ]of H){const a=p(rear.x-tX,rear.y,rear.z-tZ),bb=m.get(key(a));if(['minecraft:repeater','minecraft:comparator'].includes(bb?.id)&&JSON.stringify(V[bb.properties.facing])===JSON.stringify([tX,tZ]))sources.push(a);}
 for(const a of sources){if(d.groups[key(a)]==='card'&&d.groups[key(q)]==='card'||d.nets[key(a)]===d.nets[key(q)])continue;assert.equal(d.groups[key(a)],'card');assert.equal(d.groups[key(q)],'capped_read_tap');assert.equal(a.x,q.x);assert.equal(a.y,q.y+1);assert.equal(a.z,q.z+1);tapContacts++;}
}
assert.equal(maskContacts,256);assert.equal(tapContacts,256);assert.equal(foreignSteps,0);assert.equal(diodeSides,0);
circuitSchema.parse(d.circuit);assert.equal(d.circuit.signals.length,40);for(const s of d.circuit.signals)assert(m.has(key(s.position)));
// Software truth model is only an oracle: high target from physical arms plus
// inherited local row selection maps each address to exactly one source word.
let logicalAddressChecks=0;for(let address=0;address<256;address++){const hits=targets.filter(t=>t===(address>>4));assert.deepEqual(hits,[address>>4]);const source=d.configuration.filter(c=>c.address===address);assert.equal(source.length,16);for(const c of source){assert.equal(c.card,hits[0]);assert.equal(c.address%16,address&15);}logicalAddressChecks++;}
// A distinct word at every address verifies the source loader changes only the
// enumerated physical bits. This is an offline configuration oracle, not runtime
// memory, and it does not turn a static route into a measured redstone response.
const image=Array.from({length:256},(_,a)=>((a*0x9e37)&65535)^0xa55a),configured=makeProgramROM({image}),allowed=new Set(d.configuration.map(v=>key(v.position)));let configurationChanges=0;
assert.equal(new Set(image).size,256);assert.equal(configured.blocks.length,d.blocks.length);
for(let i=0;i<d.blocks.length;i++){const a=d.blocks[i],b=configured.blocks[i];assert.deepEqual(a.position,b.position);if(JSON.stringify(a.block)!==JSON.stringify(b.block)){assert(allowed.has(key(a.position)));assert.equal(b.block.id,'minecraft:redstone_block');configurationChanges++;}}
const configuredMap=new Map(configured.blocks.map(v=>[key(v.position),v.block]));
for(let address=0;address<256;address++){let word=0;for(const c of configured.configuration.filter(v=>v.address===address)){const bit=configuredMap.get(key(c.position)).id==='minecraft:redstone_block'?1:0;assert.equal(bit,c.value);word|=bit<<c.bit;}assert.equal(word,image[address]);}
for(const c of d.configuration)for(const[dx,dy,dz]of[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const q=p(c.position.x+dx,c.position.y+dy,c.position.z+dz),b=m.get(key(q));if(b&&!solid(b))assert.equal(d.groups[key(q)],'card','New device touches programmable source');}
const report={status:'offline_generated_program_read_path_static_checked_native_unverified',...d.metrics,support_checks:supports,inherited_card_cells_checked:parentCells,removed_upper_input_cells:128,physical_configuration_positions_checked:4096,distinct_program_words_checked:256,configuration_only_changes_checked:configurationChanges,global_address_bits:8,card_masks:16,physical_return_bits:16,route_path_cells_checked:pathCells,max_recorded_path_dust_run:maxDust,intended_mask_side_contacts:maskContacts,intended_parent_floor_taps:tapContacts,foreign_new_step_dust_candidates:foreignSteps,new_diode_side_sources:diodeSides,logical_address_oracle_cases:logicalAddressChecks,native_calls:0,service_constructors:0,limits:['Inherited card circuitry is source reuse; logical address oracle is not physical execution.','Checks cover placement supports, exact routed endpoints/refresh directions, direct active contacts, step dust, diode sides, and the stated one-solid strong-power rear paths. They are not a complete weak/strong-power simulation.','No request ownership, address/response capture, reset/quiesce, arbitration or ready timing circuit exists.','No construction plan, native initialization, propagation/transient measurement or vanilla acceptance.']};
if(process.argv.includes('--save'))writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
