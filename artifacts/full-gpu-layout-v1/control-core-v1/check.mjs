import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeCoreState,checkCoreState,nextCoreState} from './prepare.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z);
const d=makeCoreState();assert.deepEqual(d,JSON.parse(readFileSync(new URL('design.json',import.meta.url))));
function inspect(d){const m=new Map(d.blocks.map(b=>[K(b.position),b])),at=p=>m.get(K(p))?.block;let directions=0;
 for(const route of d.routes)for(const i of route.refresh_indices){const p=route.path[i],v=D[at(p).properties.facing];assert.deepEqual(add(p,v),route.path[i+1]);assert.deepEqual(add(p,P(-v.x,0,-v.z)),route.path[i-1]);directions++;}
 for(const g of d.gates){assert.deepEqual(at(g.center),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});for(const[x,z,facing]of[[-1,0,'west'],[1,0,'west'],[0,-1,'north']]){assert.equal(at(P(g.center.x+x,g.center.y,g.center.z+z)).properties.facing,facing);directions++;}}
 for(const row of d.rows)for(let bit=0;bit<3;bit++){const x=30+4*bit;if(row.state>>bit&1){assert.equal(at(P(x,row.y,5))?.properties?.facing,'south');directions++;}if(row.normal_next>>bit&1){assert.equal(at(P(x,row.y,3))?.properties?.facing,'north');directions++;}}
 for(const x of[34,38]){assert.equal(at(P(x+1,53,4))?.properties?.facing,'east');assert.equal(at(P(x+2,53,21))?.properties?.facing,'south');directions+=2;}
 for(let b=0;b<3;b++){const y=1+4*b;for(const x of[-20,-8]){assert.equal(at(P(x,y,1)).properties.facing,'south');assert.deepEqual(add(P(x,y,1),D.south),P(x,y,0));directions++;}const x=30+4*b;assert.deepEqual(at(P(x,60,0)),{id:'minecraft:comparator',properties:{facing:'south',mode:'subtract'}});assert.equal(at(P(x+1,60,0)).properties.facing,'east');directions++;}
 // A bounded strength screen for drawn wire spans. Treat every diode as a
 // possible normalized source, then check each wire-fed diode rear can receive
 // a positive level through the declared wire graph. This is not a logic model.
 const power=new Map(),adj=new Map();for(const b of d.blocks.filter(b=>b.block.id==='minecraft:redstone_wire'))adj.set(K(b.position),[]);
 for(const e of d.edges)if(adj.has(K(e.from))&&adj.has(K(e.to))){adj.get(K(e.from)).push(K(e.to));adj.get(K(e.to)).push(K(e.from));}
 const seed=p=>{if(adj.has(K(p)))power.set(K(p),15);};
 for(const port of Object.values(d.ports).filter(p=>p.direction==='input'))for(const bit of port.bits)seed(bit.position);
 for(const b of d.blocks){if(['minecraft:repeater','minecraft:comparator'].includes(b.block.id))seed(add(b.position,D[b.block.properties.facing]));if(['minecraft:redstone_torch','minecraft:redstone_wall_torch'].includes(b.block.id))for(const v of Object.values(D))seed(add(b.position,v));}
 const queue=[...power.keys()];for(let i=0;i<queue.length;i++){const k=queue[i],v=power.get(k)-1;if(v<=0)continue;for(const p of adj.get(k)??[])if((power.get(p)??0)<v){power.set(p,v);queue.push(p);}}
 let rear=0;for(const b of d.blocks.filter(b=>b.part!=='decoder_parent'&&b.part!=='state_parent'&&['minecraft:repeater','minecraft:comparator'].includes(b.block.id))){const v=D[b.block.properties.facing],r=add(b.position,P(-v.x,0,-v.z));if(adj.has(K(r))){assert((power.get(K(r))??0)>0,'No positive wire span to '+K(b.position));rear++;}}
 return{explicit_direction_checks:directions,positive_possible_wire_rears:rear};
}
const staticChecks=checkCoreState(d),extra=inspect(d);let negatives=0;
for(const f of[c=>c.blocks.find(b=>K(b.position)==='-20,1,1').block.properties.facing='north',c=>c.blocks.find(b=>K(b.position)==='31,60,0').block.properties.facing='west',c=>c.blocks.find(b=>K(b.position)==='16,1,6').block.properties.mode='compare',c=>c.blocks.splice(c.blocks.findIndex(b=>K(b.position)==='30,1,3'),1)]){const c=structuredClone(d);f(c);assert.throws(()=>{checkCoreState(c);inspect(c);});negatives++;}
let transitions=0;for(let ret=0;ret<2;ret++)for(let holds=0;holds<4;holds++){let state=0;for(let k=0;k<7;k++){for(let delay=0;delay<holds;delay++)assert.equal(nextCoreState(state,false,!!ret),state);const next=nextCoreState(state,true,!!ret);if(state<6)assert.equal(next,state+1);state=next;transitions++;}assert.equal(state,ret?7:1);if(ret)assert.equal(nextCoreState(state,true,true),7);assert.equal(nextCoreState(state,false,!!ret,true),0);}
const report={...staticChecks,...extra,held_and_completed_transition_steps:transitions,corruptions_refused:negatives,strength_screen_scope:'Positive capacity of declared wire spans between normalized sources only; does not establish logical activation, strong-support behavior or scheduled timing.'};if(process.argv.includes('--save'))writeFileSync(new URL('offline-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
