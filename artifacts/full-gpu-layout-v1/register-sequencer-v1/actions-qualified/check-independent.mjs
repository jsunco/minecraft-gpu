// Independent, bounded, read-only electrical/binding review; no native imports.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeQualifiedRegisterActions} from '../../../../hardware/full-gpu-register-actions-qualified.mjs';
import {makeRegisterActionEligibility} from '../../../../hardware/full-gpu-register-action-eligibility.mjs';
import {makeRegisterActions} from '../../../../hardware/full-gpu-register-actions.mjs';
import {possibleStrengths} from '../connected-controller/check-strength-independent.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',R='minecraft:repeater',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},dirs=Object.values(D),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),diode=b=>[R,'minecraft:comparator'].includes(b?.id);
const design=makeQualifiedRegisterActions(),elig=makeRegisterActionEligibility(),actions=makeRegisterActions();
assert.deepEqual(design,JSON.parse(readFileSync(new URL('./design.json',import.meta.url))));
const expectedConnections=[['eligible_gpr_to_actions',[64,-16,5],[0,0,-3]],['boot_assignment_to_actions',[68,-16,5],[10,-2,72]],['assignment_intent_to_eligibility',[50,-19,-15],[50,-19,-7]],['assignment_intent_to_actions',[50,-19,-15],[0,0,69]]];
function lookup(d){const m=new Map(d.blocks.map(v=>[K(v.position),v]));assert.equal(m.size,d.blocks.length);return p=>m.get(K(p));}
function feeds(at,p){const out=[];for(const[x,z]of dirs){const q=P(p.x-x,p.y,p.z-z),b=at(q)?.block;if(b?.id===W||diode(b)&&same(D[b.properties.facing],[x,z]))out.push(K(q));}for(const[dy,id]of[[1,W],[-1,T]]){const q=P(p.x,p.y+dy,p.z);if(at(q)?.block.id===id)out.push(K(q));}return out.sort();}
function block(at,p,id,props){assert.deepEqual(at(p)?.block,{id,...(props?{properties:props}:{})},'Block '+K(p));}
const rep=(at,p,f)=>block(at,p,R,{facing:f,delay:'1'});
function inspect(d){const at=lookup(d);assert.equal(d.blocks.length,3480);assert.equal(d.metrics.stored_bits,0);let preserved=0;
 for(const[parent,origin]of[[actions,P(0,0,0)],[elig,P(20,-32,0)]])for(const v of parent.blocks){assert.deepEqual(at(P(v.position.x+origin.x,v.position.y+origin.y,v.position.z+origin.z))?.block,v.block);preserved++;}
 assert.deepEqual(d.connections.map(c=>[c.name,Object.values(c.source),Object.values(c.destination)]),expectedConnections);
 for(const n of['gpr_normal','assign_normal','assign_reset'])assert(!Object.hasOwn(d.ports,n),'Internalized input still exposed');
 assert.deepEqual(d.ports.open_assign.bits[0].position,P(50,-19,-15));
 let columnSets=0;for(const c of d.columns){assert.equal((c.top-c.bottom)%4,1);assert(c.wire_top);for(let y=c.bottom;y<c.top;y+=2){block(at,P(c.x,y,c.z),S);block(at,P(c.x,y+1,c.z),y+1===c.top?W:T);const expected=[K(y===c.bottom?P(c.x+1,y,c.z):P(c.x,y-1,c.z))];if(y===c.top-1)expected.push(K(P(c.x,c.top,c.z)));assert.deepEqual(feeds(at,P(c.x,y,c.z)),expected.sort());columnSets++;}}
 // Exhaust all conservative new/parent solid contact pairs. No cross-part
 // source/recipient pair exists, even before suppressing wire-only power.
 let solidPairs=0,crossPairs=0;for(const v of d.blocks.filter(v=>v.block.id===S)){const p=v.position,src=[],dst=[];for(const[x,z]of dirs){let a=at(P(p.x-x,p.y,p.z-z)),b=a?.block;if(b?.id===W||diode(b)&&same(D[b.properties.facing],[x,z]))src.push(a);a=at(P(p.x+x,p.y,p.z+z));b=a?.block;if(b?.id===W||diode(b)&&same(D[b.properties.facing],[x,z])||b?.id===WT&&same(D[b.properties.facing],[-x,-z]))dst.push(a);}const up=at(P(p.x,p.y+1,p.z)),down=at(P(p.x,p.y-1,p.z));if(up?.block.id===W)src.push(up);if(down?.block.id===T)src.push(down);if([W,T].includes(up?.block.id))dst.push(up);if(down?.block.id===W)dst.push(down);for(const a of src)for(const b of dst){if(a===b)continue;solidPairs++;if(a.part!==b.part)crossPairs++;}}
 assert.equal(crossPairs,0,'New solid contact crosses a parent/net boundary');
 const power=possibleStrengths(d);assert.equal(power.failed.length,0);assert.equal(power.new_wire_fed_rears,38);assert.equal(power.minimum_possible_rear_power,5);
 return{preserved_parent_cells:preserved,bindings:expectedConnections.length,positive_column_source_sets:columnSets,conservative_solid_pairs:solidPairs,cross_part_solid_pairs:crossPairs,new_wire_fed_rears:power.new_wire_fed_rears,minimum_possible_rear_power:power.minimum_possible_rear_power};}
function inspectEligibility(e){const at=lookup(e);let towerSets=0,maskGates=0,orSets=0;
 // Independent intended minterms: address0..7, address0..3/8..11,
 // address0/4/8/12, and initialization assignment. Their OR is Rd<13.
 const wanted=[{rd3:0,reg_write:1,open_gpr:1},{rd2:0,reg_write:1,open_gpr:1},{rd1:0,rd0:0,reg_write:1,open_gpr:1},{open_assign:1,boot:1}];
 assert.equal(e.rows.length,4);assert.deepEqual(e.rows.map(r=>r.literals),wanted);
 for(const c of e.towers){const expectedBit=e.ports[c.name].bits[0];assert.deepEqual(expectedBit.position,P(c.x,c.first_y,-7));rep(at,P(c.x,c.first_y,-6),'north');for(let y=c.first_y;y<=c.last_y;y+=2){block(at,P(c.x,y,-5),S);const expected=[K(y===c.first_y?P(c.x,y,-6):P(c.x,y-1,-5))];if(at(P(c.x,y,-4))?.block.id===W)expected.push(K(P(c.x,y,-4)));assert.deepEqual(feeds(at,P(c.x,y,-5)),expected.sort());towerSets++;}}
 for(const[rowIndex,row]of e.rows.entries())for(const g of row.gates){const x=g.comparator.x-1,y=row.y;assert.equal(row.y,1+4*rowIndex);assert.equal(g.wanted,wanted[rowIndex][g.name]);rep(at,P(x,y,0),'west');block(at,P(x+1,y,0),'minecraft:comparator',{facing:'west',mode:'subtract'});rep(at,P(x+3,y,0),'west');rep(at,P(x+1,y,-1),'north');if(g.wanted){block(at,P(x,y,-4),WT,{facing:'south'});block(at,P(x,y,-3),W);}else{block(at,P(x,y,-4),W);rep(at,P(x,y,-3),'north');}for(const p of[P(x,y,-2),P(x+1,y,-2),P(x+2,y,0)])block(at,p,W);maskGates++;}
 for(const c of e.or_columns){for(let y=1;y<c.output_y;y+=2){block(at,P(c.x,y,c.z),S);const expected=[];if(y>1)expected.push(K(P(c.x,y-1,c.z)));if(e.rows.some(r=>r.y===y&&r.bits.includes(c.bit))){rep(at,P(c.x,y,2),'north');expected.push(K(P(c.x,y,2)));}assert.deepEqual(feeds(at,P(c.x,y,c.z)),expected.sort());orSets++;}assert.equal((c.output_y-2)/2%2,1);block(at,P(c.x,c.output_y,c.z),T);rep(at,P(c.x,c.output_y,4),'north');}
 let cases=0;for(let rd=0;rd<16;rd++)for(let enable=0;enable<16;enable++)for(let flags=0;flags<64;flags++){
  const openG=!!(flags&1),regWrite=!!(flags&2),openAssign=!!(flags&4),boot=!!(flags&8),window=!!(flags&16),resetG=!!(flags&32),values={rd0:!!(rd&1),rd1:!!(rd&2),rd2:!!(rd&4),rd3:!!(rd&8),reg_write:regWrite,open_gpr:openG,open_assign:openAssign,boot};
  const bits=[false,false];for(const row of e.rows){let power=15;for(const g of row.gates){const x=g.comparator.x-1,maskInverted=at(P(x,row.y,-4)).block.id===WT,side=(maskInverted?!values[g.name]:values[g.name])?15:0;power=Math.max(0,power-side);power=power?15:0;}for(const b of row.bits)bits[b]||=power>0;}
  for(let lane=0;lane<4;lane++){const active=!!(enable>>lane&1),gpr=window&&(resetG||bits[0]&&active),assign=window&&(bits[1]||openAssign&&active);assert.equal(gpr,window&&(resetG||(openG&&regWrite&&rd<=12&&active)));assert.equal(assign,window&&openAssign&&(boot||active));}cases++;
 }
 return{input_tower_source_sets:towerSets,normalized_literal_gates:maskGates,or_column_source_sets:orSets,independent_mask_address_window_cases:cases};}
const result={...inspect(design),...inspectEligibility(elig)};let bad=0;
for(const f of[c=>c.connections[0].destination.z=69,c=>c.blocks.find(v=>K(v.position)==='51,-19,-12').block.properties.facing='east',c=>c.blocks.push({position:P(15,-8,-16),block:{id:R,properties:{facing:'west',delay:'1'}},part:'foreign'})]){const c=structuredClone(design);f(c);assert.throws(()=>inspect(c));bad++;}
for(const f of[c=>c.blocks.find(v=>K(v.position)==='0,1,-4').block={id:WT,properties:{facing:'south'}},c=>c.blocks.find(v=>K(v.position)==='21,1,-1').block.properties.facing='south',c=>c.blocks.find(v=>K(v.position)==='44,5,2').block.properties.facing='south']){const c=structuredClone(elig);f(c);assert.throws(()=>inspectEligibility(c));bad++;}
console.log(JSON.stringify({status:'independent_static_register_action_qualification_pass',blocks:design.blocks.length,...result,corruptions_refused:bad,native_acceptance:false,limits:['Settled physical literal polarity and source/contact review, not timing or event-window admission.','No upstream raw intent/mask/field/phase producer or downstream file route is supplied by this component.']}));
