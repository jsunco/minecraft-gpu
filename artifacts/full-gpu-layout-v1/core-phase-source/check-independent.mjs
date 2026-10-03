// Read-only review of the frozen source, including both unequal output branches.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeCorePhaseSource} from '../../../hardware/full-gpu-core-phase-source.mjs';
const root=new URL('../../../',import.meta.url),P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('source-manifest.json',import.meta.url)));for(const[p,h]of Object.entries(manifest.pins))assert.equal(sha(new URL(p,root)),h,p);
const d=makeCorePhaseSource();assert.deepEqual(d,JSON.parse(readFileSync(new URL('design.json',import.meta.url))));
function inspect(d){const m=new Map(d.blocks.map(v=>[K(v.position),v.block])),at=p=>m.get(K(p)),allowed=new Set(),paths={},pair=(a,b)=>[K(a),K(b)].sort().join('|');assert.equal(m.size,d.blocks.length);
 const path=(name,ws)=>{const ps=[P(...ws[0])];for(let i=1;i<ws.length;i++){const a=ws[i-1],b=ws[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],n=Math.abs(dx)+Math.abs(dz);assert(n&&(!dx||!dz)&&(!dy||Math.abs(dy)===n));for(let j=1;j<=n;j++)ps.push(P(a[0]+Math.sign(dx)*j,a[1]+Math.sign(dy)*j,a[2]+Math.sign(dz)*j));}for(let i=1;i<ps.length;i++)allowed.add(pair(ps[i-1],ps[i]));paths[name]=ps;return ps;};
 path('loop',[[1,1,0],[196,1,0],[196,1,4],[-2,1,4],[-2,1,0],[0,1,0]]);
 path('fork',[[2,1,0],[2,1,-2]]);
 path('direct',[[2,1,-2],[-10,1,-2],[-10,1,-158],[30,1,-158],[30,1,-152],[35,1,-152]]);
 path('delayed',[[2,1,-2],[2,1,-146],[30,1,-146],[30,1,-144],[35,1,-144]]);
 path('delayed_A_side',[[31,1,-144],[31,1,-150],[35,1,-150],[35,1,-152]]);
 path('direct_B_side',[[31,1,-152],[31,4,-155],[35,4,-155],[35,4,-149],[35,1,-146],[35,1,-144]]);
 path('phase_A',[[35,1,-152],[43,1,-152]]);path('phase_B',[[35,1,-144],[43,1,-144]]);
 path('inhibit',[[48,1,-138],[46,1,-138],[46,1,-154]]);
 path('inhibit_A',[[46,1,-150],[40,1,-150],[40,1,-152]]);path('inhibit_B',[[46,1,-142],[40,1,-142],[40,1,-144]]);
 // An actual same-net diagonal shortcut at the direct input's upward bend.
 const shortcut=pair(P(30,1,-153),P(31,2,-153));allowed.add(shortcut);
 // The delayed rear and its A-side branch share this small wire ladder. Both
 // sides are downstream of the same last delayed-line repeater; no diode is bypassed.
 for(const z of[-146,-145])allowed.add(pair(P(30,1,z),P(31,1,z)));
 let supports=0,contacts=0,diodeDirections=0,indirect=0;for(const[p,b]of m){if(b.id.endsWith('_concrete'))continue;const[x,y,z]=p.split(',').map(Number);let s=P(x,y-1,z);if(b.id==='minecraft:redstone_wall_torch'){const v=D[b.properties.facing];s=P(x+v[0],y,z+v[1]);}assert.equal(at(s)?.id,'minecraft:light_gray_concrete','Unsupported '+p);supports++;}
 for(const ps of Object.values(paths))for(let i=0;i<ps.length;i++){const p=ps[i],b=at(p);assert(b,'Missing '+K(p));if(b.id==='minecraft:repeater'){const v=D[b.properties.facing];assert(i>0&&i<ps.length-1,'Unbounded repeater');assert.deepEqual(ps[i-1],P(p.x-v[0],p.y,p.z-v[1]));assert.deepEqual(ps[i+1],P(p.x+v[0],p.y,p.z+v[1]));diodeDirections++;}}
 for(const z of[-152,-144])for(const x of[35,40])assert.deepEqual(at(P(x,1,z)),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});
 for(const[p,b]of m){if(b.id!=='minecraft:redstone_wire')continue;const[x,y,z]=p.split(',').map(Number);for(const[dx,dz]of Object.values(D))for(const dy of[-1,0,1]){const q=P(x+dx,y+dy,z+dz),o=at(q);if(!o||o.id.endsWith('_concrete'))continue;if(dy&&o.id!=='minecraft:redstone_wire')continue;if(dy===1&&at(P(x,y+1,z)))continue;if(dy===-1&&at(P(q.x,q.y+1,q.z)))continue;assert(allowed.has(pair(P(x,y,z),q)),'Unlisted dust contact '+p+' '+K(q));contacts++;}
  // Dust strongly powers its support. At raised wiring, that support must not
  // expose a new device or another net; every such neighbor is the same drawn
  // ramp (or the direct-branch same-net diagonal above).
  for(const[dx,dz]of Object.values(D)){const q=P(x+dx,y-1,z+dz),o=at(q);if(o&&!o.id.endsWith('_concrete')){assert.equal(o.id,'minecraft:redstone_wire','Support can power a foreign device '+p+' '+K(q));assert(allowed.has(pair(P(x,y,z),q)),'Foreign strong-support wire '+p+' '+K(q));indirect++;}}
 }
 let sideFaces=0;for(const[p,b]of m){if(!['minecraft:repeater','minecraft:comparator'].includes(b.id))continue;const[x,y,z]=p.split(',').map(Number),[dx,dz]=D[b.properties.facing];for(const[sx,sz]of[[dz,dx],[-dz,-dx]]){const q=P(x+sx,y,z+sz),o=at(q);if(o&&!o.id.endsWith('_concrete')){assert.equal(b.id,'minecraft:comparator','Foreign repeater side '+p);assert.equal(o.id,'minecraft:repeater');assert(allowed.has(pair(P(x,y,z),q)));const[ox,oz]=D[o.properties.facing];assert.deepEqual(P(q.x+ox,q.y,q.z+oz),P(x,y,z));}sideFaces++;}}
 const counted=ps=>ps.reduce((sum,p)=>{const b=at(p);return sum+(b.id==='minecraft:repeater'?2*Number(b.properties.delay):b.id==='minecraft:comparator'?2:0);},0);
 // Primary comparator included by these paths; remove it to obtain its input.
 const directRear=counted(paths.direct)-2,delayedRear=counted(paths.delayed)-2,sideA=counted(paths.delayed_A_side)-2,sideB=counted(paths.direct_B_side)-2,afterPrimary=counted(paths.phase_A);
 assert.equal(afterPrimary,counted(paths.phase_B));
 const branch={direct_rear:directRear,delayed_rear:delayedRear,direct_to_B_side:directRear-2+sideB,delayed_to_A_side:delayedRear-2+sideA,from_primary_comparator_to_terminal:afterPrimary};
 assert.deepEqual(branch,{direct_rear:40,delayed_rear:584,direct_to_B_side:44,delayed_to_A_side:584,from_primary_comparator_to_terminal:10});
 const half=counted(paths.loop)+2;assert.equal(half,1580);const aRise=directRear+afterPrimary,aFall=branch.delayed_to_A_side+afterPrimary,bRise=half+branch.direct_to_B_side+afterPrimary,bFall=half+delayedRear+afterPrimary;
 const nominal={phase_a_width:aFall-aRise,phase_b_width:bFall-bRise,a_to_b_gap:bRise-aFall,b_to_a_gap:2*half+aRise-bFall};assert.deepEqual(nominal,{phase_a_width:544,phase_b_width:540,a_to_b_gap:1040,b_to_a_gap:1036});
 return{blocks:d.blocks.length,support_checks:supports,declared_dust_contacts:contacts,same_net_diagonal_shortcuts:1,same_net_delayed_wire_ladder_contacts:2,strong_support_same_route_wire_contacts:indirect,directed_path_repeater_checks:diodeDirections,all_diode_side_faces:sideFaces,primary_branch_component_ticks:branch,nominal_branch_component_sums:nominal};
}
const report=inspect(d);let negatives=0;for(const f of[c=>c.blocks.find(b=>K(b.position)==='33,4,-155').block.properties.facing='east',c=>c.blocks.find(b=>K(b.position)==='35,1,-151').block.properties.facing='north',c=>c.blocks.push({position:P(32,1,-150),block:{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}},part:'foreign'})]){const c=structuredClone(d);f(c);assert.throws(()=>inspect(c));negatives++;}
console.log(JSON.stringify({status:'independent_static_topology_pass_metadata_refinement_required',...report,corruptions_refused:negatives,manifest_sha256:sha(new URL('source-manifest.json',import.meta.url)),source_pins_checked:Object.keys(manifest.pins).length,native_acceptance:false,limits:['Component sums omit wire/update scheduling and inertial pulse transport; no native timing bound or operating rate is established.','The source metadata pulse544/gap1036 describes the fork delta/minimum nominal gap, not both unequal output widths.','No consumer fanout or phase-inhibit rearm protocol is proven by this component review.']},null,2));
