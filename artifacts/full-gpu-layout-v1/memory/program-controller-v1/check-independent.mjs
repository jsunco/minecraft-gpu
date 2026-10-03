// Bounded independent interfaces/polarity/ordering review; no Minecraft services.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../../',import.meta.url),P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,V={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},S='minecraft:light_gray_concrete',sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('source-manifest.json',import.meta.url)));for(const[p,h]of Object.entries(manifest.source_sha256))assert.equal(sha(new URL(p,root)),h,p);
const d=JSON.parse(readFileSync(new URL('design.json',import.meta.url))),parent=JSON.parse(readFileSync(new URL('../program-capture-v1/design.json',import.meta.url))),m=new Map(d.blocks.map(v=>[K(v.position),v.block])),G=(x,y,z)=>P(x-60,y-50,z-180),at=p=>m.get(K(p));
function inspect(map){const at=p=>map.get(K(p)),rep=(p,dir)=>assert.equal(at(p)?.properties?.facing,dir,K(p)),wire=p=>assert.equal(at(p)?.id,'minecraft:redstone_wire',K(p)),cmp=(p,dir)=>assert.deepEqual(at(p),{id:'minecraft:comparator',properties:{facing:dir,mode:'subtract'}});
 let stores=0;for(const s of parent.stores){const b=at(s.storage),l=at(s.lock),driver=at(s.driver);assert.equal(b?.id,'minecraft:repeater');assert.equal(l?.id,'minecraft:repeater');assert.equal(driver?.id,'minecraft:repeater');const[dx,dz]=V[b.properties.facing],[lx,lz]=V[l.properties.facing];assert.deepEqual(s.driver,P(s.storage.x-dx,s.storage.y,s.storage.z-dz));assert.deepEqual(P(s.lock.x+lx,s.lock.y,s.lock.z+lz),s.storage);assert.equal(dx*lx+dz*lz,0,'Lock must enter side');assert.equal(driver.properties.facing,b.properties.facing);assert.equal(b.properties.delay,'1');wire(s.terminal);stores++;}
 assert.equal(stores,25);
 // Real phase endpoints terminate in the preserved OPEN pads, each of which
 // drives its own HOLD inverter before lock distribution. No direct Q forcing.
 for(const[p,f,out]of[[P(57,-37,-79),'east',P(56,-37,-79)],[P(75,-37,-77),'west',P(76,-37,-77)],[P(90,279,-49),'north',P(90,279,-48)]]){rep(p,f);const[x,z]=V[f];assert.deepEqual(P(p.x+x,p.y,p.z+z),out);wire(out);}
 for(const[p,f]of[[P(56,-37,-78),'north'],[P(76,-37,-76),'north'],[P(89,279,-48),'east']])rep(p,f);
 for(const[p,f]of[[P(56,-37,-76),'south'],[P(76,-37,-74),'south'],[P(87,279,-48),'west']])assert.deepEqual(at(p),{id:'minecraft:redstone_wall_torch',properties:{facing:f}});
 // Two input masks on each local phase comparator: late tap on one side and
 // reset-busy on the opposite side, with a normalized rear source.
 for(const[x,z,dir]of[[31,-12,'south'],[63,-12,'south'],[79,20,'north']]){const p=G(x,13,z);cmp(p,dir);const[dx,dz]=V[dir];rep(P(p.x-dx,p.y,p.z-dz),dir);rep(P(p.x-1,p.y,p.z),'west');rep(P(p.x+1,p.y,p.z),'east');}
 cmp(G(8,5,12),'east');rep(G(8,5,13),'south'); // selected valid subtracts from tail clear.
 cmp(G(16,9,-4),'west');rep(G(16,9,-5),'north');rep(G(16,9,-3),'south');
 for(const x of[100,112]){cmp(P(x,287,-94),'north');rep(P(x,287,-95),'north');rep(P(x,287,-93),'north');}
 rep(P(99,287,-94),'west');rep(P(113,287,-94),'east');
 // Every output is an isolated fanout of the matching retained response bit.
 let taps=0;for(let b=0;b<16;b++){const y=b%2?283:279,z=-60-2*b;wire(P(78,y,z));assert.equal(at(P(78,y-1,z))?.id,S);assert.equal(at(P(79,y,z))?.id,S);rep(P(79,y-1,z),'west');assert(!at(P(79,y+1,z)),'Capped tap headroom');for(const x of[80,81,82,83])wire(P(x,x===80?y-1:y-2,z));rep(P(84,y-2,z),'west');
  let value=1;for(let yy=y-2;yy<=y+10;yy++){assert.equal(at(P(85,yy,z))?.id,(yy-(y-2))%2?'minecraft:redstone_torch':S);if((yy-(y-2))%2)value=1-value;}assert.equal(value,1,'Fanout rise must retain positive polarity');rep(P(86,y+10,z),'west');rep(P(88,y+10,z),'west');rep(P(87,y+10,z-1),'south');assert.deepEqual(d.ports.read_data.positions[b],P(89,y+10,z));assert.deepEqual(d.ports.read_data.positions[16+b],P(87,y+10,z-2));taps++;}
 for(const [name,parentName]of[['read_valid','consumer_read_valid'],['read_address','consumer_read_address']])assert.deepEqual(d.ports[name],parent.ports[parentName]);assert.deepEqual(d.ports.reset.positions,[G(-52,1,-60)]);
 // Both physical NOR states have the expected two attached torch supports,
 // isolated feedback directions, masked SET and independent positive CLEAR.
 for(const[dx,dz]of[[0,0],[-180,-60]]){assert.equal(at(G(dx,1,dz))?.id,S);assert.equal(at(G(dx+12,1,dz))?.id,S);assert.deepEqual(at(G(dx+1,1,dz)),{id:'minecraft:redstone_wall_torch',properties:{facing:'east'}});assert.deepEqual(at(G(dx+11,1,dz)),{id:'minecraft:redstone_wall_torch',properties:{facing:'west'}});rep(G(dx+12,1,dz-1),'north');rep(G(dx,1,dz+1),'south');cmp(G(dx+14,1,dz),'east');rep(G(dx+13,1,dz),'east');rep(G(dx-1,1,dz),'west');rep(G(dx+14,1,dz+1),'south');}
 return{actual_driver_storage_side_lock_interfaces:stores,real_open_to_hold_inverters:3,phase_comparators_with_both_masks:3,positive_response_taps_and_consumer_bit_mappings:taps,cross_coupled_protocol_states:2};
}
const physical=inspect(m);let ownerCases=0,phaseCases=0,norCases=0;
for(let owner=0;owner<2;owner++)for(let v=0;v<4;v++)for(let tail=0;tail<2;tail++)for(let active=0;active<2;active++)for(let reset=0;reset<2;reset++){
 const c0=Math.max(15*(v&1)-15*owner,0),c1=Math.max(15*(v>>1)-15*(1-owner),0),selected=Math.max(c0,c1)>0,clear=!!reset||!!tail&&!selected,admit=!!(v&&!tail&&!reset),ready=!!(tail&&active&&!reset);assert.equal(selected,!!(v>>owner&1));assert.equal(clear,!!reset||!!tail&&!(v>>owner&1));assert(!(ready&&admit));const demux=[Math.max(15*+ready-15*owner,0)>0,Math.max(15*+ready-15*(1-owner),0)>0];assert.equal(demux.filter(Boolean).length,ready?1:0);if(ready)assert(demux[owner]);ownerCases++;}
// Independently enumerate the *ordered* leading and falling wavefronts. This
// establishes intended level equations, not adequate physical route margins.
for(const rising of[false,true])for(let wave=0;wave<=6;wave++)for(const blocked of[false,true]){const stages=Array.from({length:7},(_,i)=>Number(rising?i<=wave:i>wave)),[a,t1,t2,t3,t4,t5,t6]=stages,op=[a&&!t1,t2&&!t3,t4&&!t5].map(x=>!!x&&!blocked),ready=!!(t6&&a&&!blocked);assert(op.filter(Boolean).length<=1);if(!rising)assert(!op.some(Boolean));if(ready)assert(!op.some(Boolean));if(blocked)assert(!ready&&!op.some(Boolean));phaseCases++;}
for(let set=0;set<2;set++)for(let clear=0;clear<2;clear++){const stable=[];for(let q=0;q<2;q++)for(let nq=0;nq<2;nq++)if(q===Number(!(nq||clear))&&nq===Number(!(q||set)))stable.push([q,nq]);assert.deepEqual(stable,set?(clear?[[0,0]]:[[1,0]]):clear?[[0,1]]:[[0,1],[1,0]]);norCases++;}
let negatives=0;for(const f of[map=>map.get('52,-37,-84').properties.facing='north',map=>map.get('79,278,-60').properties.facing='east',map=>map.get('99,287,-94').properties.facing='east',map=>map.get('-29,-37,-192').properties.mode='compare']){const mm=new Map([...m].map(([k,b])=>[k,structuredClone(b)]));f(mm);assert.throws(()=>inspect(mm));negatives++;}
console.log(JSON.stringify({status:'independent_program_controller_interface_and_protocol_checks_pass',manifest_sha256:sha(new URL('source-manifest.json',import.meta.url)),source_pins_checked:Object.keys(manifest.source_sha256).length,...physical,owner_valid_ready_reset_boolean_cases:ownerCases,ordered_edge_mask_cases:phaseCases,cross_coupled_nor_steady_cases:norCases,corruptions_refused:negatives,native_acceptance:false,limits:['This is an independently checked static interface/order abstraction, not an electrical scheduled-update simulator.','Simultaneous SET and CLEAR gives both NOR outputs low; their release and cold startup are unresolved until real reset conditioning/timing is validated.','Actual OPEN and lock closure, ROM settling, reset pulse service, repeated reset and ready-return-low margins still require continuous native traces.']}));
