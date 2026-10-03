// Bounded source/route and abstract level-handshake checks; not Minecraft simulation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeFetchControl,checkFetchControl} from './prepare.mjs';
const K=p=>`${p.x},${p.y},${p.z}`,dirs={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
const design=makeFetchControl();assert.deepEqual(design,JSON.parse(readFileSync(new URL('design.json',import.meta.url))));
function routes(d){const map=new Map(d.blocks.map(b=>[K(b.position),b]));let refresh=0,cells=0;
 for(const route of d.routes){let run=0;for(let i=0;i<route.path.length;i++){const p=route.path[i],b=map.get(K(p));assert(b);cells++;if(i){const a=route.path[i-1];assert.equal(Math.abs(a.x-p.x)+Math.abs(a.z-p.z),1);assert(Math.abs(a.y-p.y)<=1);}
  if(route.refresh_indices.includes(i)){assert.equal(b.block.id,'minecraft:repeater');const [x,z]=dirs[b.block.properties.facing],next=route.path[i+1],prev=route.path[i-1];assert.deepEqual(next,{x:p.x+x,y:p.y,z:p.z+z});assert.deepEqual(prev,{x:p.x-x,y:p.y,z:p.z-z});run=0;refresh++;}else {assert.equal(b.block.id,'minecraft:redstone_wire');run++;assert(run<=12);}
 }}
 const c=d.captured;assert.equal(map.get(K(c.data)).block.properties.facing,'west');assert.deepEqual(c.store,{x:c.data.x+1,y:c.data.y,z:c.data.z});const lock=map.get(K(c.lock)).block;const[x,z]=dirs[lock.properties.facing];assert.deepEqual(c.store,{x:c.lock.x+x,y:c.lock.y,z:c.lock.z+z});const rear={x:c.lock.x-x,y:c.lock.y,z:c.lock.z-z};assert.equal(map.get(K(rear)).block.id,'minecraft:redstone_wire');
 for(const g of d.gates){const p=g.center;assert.equal(map.get(`${p.x-1},1,${p.z}`).block.properties.facing,'west');assert.equal(map.get(`${p.x+1},1,${p.z}`).block.properties.facing,'west');assert.equal(map.get(`${p.x},1,${p.z-1}`).block.properties.facing,'north');}
 return{route_cells:cells,refresh_direction_checks:refresh,gate_normalizers_checked:d.gates.length*3,actual_lock_rear_output:true};
}
const stat=checkFetchControl(design),routeChecks=routes(design);let corruptions=0;
for(const mutate of [d=>d.blocks.find(b=>K(b.position)==='25,1,-17').block.properties.facing='south',d=>d.blocks.find(b=>K(b.position)==='50,1,0').block.properties.delay='1',d=>d.blocks.find(b=>K(b.position)==='24,1,-16').block.properties.facing='east',d=>d.blocks.splice(d.blocks.findIndex(b=>K(b.position)==='25,1,-18'),1),d=>d.blocks.find(b=>K(b.position)===K(d.routes[0].path[d.routes[0].refresh_indices[0]])).block.properties.facing='east']){const d=structuredClone(design);mutate(d);assert.throws(()=>{checkFetchControl(d);routes(d);});corruptions++;}
// Minimal synchronous event model of declared equations only. Fixed delays here
// establish the causal protocol, not actual block propagation or native margins.
function handshake(responseWait,readyReturn,initial){const s={A:[],valid:[],Q:[],d1:[],d2:[],D:[],hold:[],captured:[],F:[],complete:[],ready:[],request:[]};let cap=initial,request=0,ready=0,issued=-1,ack=-1,finish=-1;const at=(name,t)=>t<0?0:s[name][t], events={};
 for(let t=0;t<5000;t++){if(t===1000)request=1;if(issued>=0&&t===issued+responseWait)ready=1;if(ack>=0&&t===ack+readyReturn)ready=0;if(finish>=0&&t===finish+20)request=0;
  const A=request,valid=A&&!cap,Q=valid&&ready,d1=at('Q',t-512),d2=at('d1',t-256),D=at('A',t-64),hold=A&&!d2;if(!hold)cap=D;const F=Q&&!d1,complete=cap&&!ready;
  for(const[k,v]of Object.entries({A,valid,Q,d1,d2,D,hold,captured:cap,F,complete,ready,request}))s[k][t]=Number(v);
  if(t===999)assert.equal(cap,0,'reset/idle must clear arbitrary captured entry');
  if(valid&&issued<0){issued=t;events.request=t;}if(issued>=0&&!valid&&ack<0&&t>issued){ack=t;events.ack=t;}if(F&&!events.open)events.open=t;if(events.open&&!F&&!events.close)events.close=t;if(complete&&t>=1000&&finish<0){finish=t;events.complete=t;}
  if(issued>=0&&t<ack&&ack>=0)assert(ready);if(events.close&&t===ack)assert(t-events.close>=256,'abstract close wait');if(finish>=0&&t>finish+900){assert.equal(cap,0);assert.equal(valid,0);assert.equal(ready,0);assert.equal(d1,0);assert.equal(d2,0);break;}
 }
 assert(events.open>events.request);assert(events.ack>events.close);assert(events.complete>=events.ack+readyReturn);assert.equal(events.close-events.open,512);return events;
}
let sequences=0;for(const wait of [1,16,200,1000])for(const release of [1,25,100])for(const initial of [0,1]){handshake(wait,release,initial);sequences++;}
const result={...stat,...routeChecks,abstract_level_handshake_sequences:sequences,corruptions_refused:corruptions,abstract_model_scope:'Checks equations, retained captured bit, idle clear, positive capture window, close-before-memory-ack, backend ready return and repeat-request inhibition. Does not simulate Minecraft scheduling, block power or races.'};
if(process.argv.includes('--save'))writeFileSync(new URL('offline-check.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
