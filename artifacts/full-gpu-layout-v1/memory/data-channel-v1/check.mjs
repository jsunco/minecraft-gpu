import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeDataChannel} from '../../../../hardware/memory-layout-data-channel.mjs';
import {makeOwnedDataBank} from '../../../../hardware/memory-layout-data-owned-bank.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',W='minecraft:redstone_wire',V={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
const d=makeDataChannel(),parent=makeOwnedDataBank(),digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
assert.equal(digest(d),digest(JSON.parse(readFileSync(new URL('design.json',import.meta.url)))),'saved map differs');
const m=new Map(d.blocks.map(v=>[K(v.position),v.block])),pm=new Map(parent.blocks.map(v=>[K(v.position),v.block]));
const rep=(map,p,f)=>assert.deepEqual(map.get(K(p)),{id:'minecraft:repeater',properties:{facing:f,delay:'1'}});
const cmp=(map,p,f)=>assert.deepEqual(map.get(K(p)),{id:'minecraft:comparator',properties:{facing:f,mode:'subtract'}});
function interfaces(map){
 for(const[k,b]of pm)assert.deepEqual(map.get(k),b,'parent changed '+k);
 for(const g of d.frontends)for(const a of g.address_muxes){cmp(map,a.read_gate,'east');cmp(map,a.write_gate,'east');rep(map,a.read_mask,'north');rep(map,a.write_mask,'south');rep(map,a.result,'east');}
 for(const g of d.bindings){rep(map,g.driver,g.field==='eligibility'?'north':'south');assert.equal(map.get(K(g.destination))?.id,W);if(g.underpass)rep(map,g.underpass,'east');}
 for(const g of d.validGates){cmp(map,g.gate,'west');rep(map,g.rear,'west');rep(map,g.owner_mask,'north');}
 for(const g of d.readyGates){cmp(map,g.owner_gate,'west');cmp(map,g.read_gate,'west');cmp(map,g.write_gate,'west');}
 for(const[x,z]of[[31,-462],[63,-462],[111,-462]])cmp(map,P(x,-37,z),'south');cmp(map,P(79,-37,-430),'north');cmp(map,P(16,-41,-454),'west');
 for(const[p,f]of[[P(112,-49,-449),'south'],[P(8,-45,-435),'south'],[P(53,-53,-230),'east'],[P(48,-22,-245),'north'],[P(91,-59,-60),'east'],[P(-24,279,-67),'north']])rep(map,p,f);
 for(const p of[P(53,-52,-230),P(48,-21,-245),P(111,-18,-115)])assert.equal(map.get(K(p))?.id,S,'cap absent');
 for(const p of d.ports.read_data.positions)assert.equal(map.get(K(p))?.id,W);
 for(const[n,width]of Object.entries({reset:1,read_valid:8,write_valid:8,read_address:64,write_address:64,write_data:64,read_ready:8,write_ready:8,read_data:64}))assert.equal(d.ports[n].width,width);
}
interfaces(m);let supports=0,routeSteps=0;
for(const v of d.blocks){const p=v.position,b=v.block;if(pm.has(K(p))||b.id===S)continue;let q=P(p.x,p.y-1,p.z);if(b.id==='minecraft:redstone_wall_torch'){const[dx,dz]=V[b.properties.facing];q=P(p.x+dx,p.y,p.z+dz);}assert.equal(m.get(K(q))?.id,S,'support '+K(p));supports++;}
for(const route of d.routes){assert(route.max_dust_run<=14);for(let i=0;i<route.path.length;i++){const p=route.path[i],b=m.get(K(p));assert(b);if(i){const q=route.path[i-1];if(p.y>q.y)assert(!m.has(K(P(q.x,q.y+1,q.z))));if(p.y<q.y)assert(!m.has(K(P(p.x,q.y,p.z))));routeSteps++;}if(b.id==='minecraft:repeater'){const[dx,dz]=V[b.properties.facing];assert.deepEqual(route.path[i-1],P(p.x-dx,p.y,p.z-dz));assert.deepEqual(route.path[i+1],P(p.x+dx,p.y,p.z+dz));}else assert.equal(b.id,W);}}
// Separate settled Boolean contract: no oracle is a running memory implementation.
let arbitrationCases=0,ackCases=0;
for(let bank=0;bank<4;bank++)for(let mask=0;mask<256;mask++)for(let offset=0;offset<4;offset++){
 const e=Array.from({length:8},(_,i)=>Boolean((mask>>i)&1)&&((i+offset)&3)===bank);const owner=e.map((x,i)=>Number(x&&!e.slice(0,i).some(Boolean)));assert(owner.reduce((a,b)=>a+b,0)<=1);if(e.some(Boolean))assert.equal(owner.indexOf(1),e.indexOf(true));arbitrationCases++;
}
for(let i=0;i<8;i++)for(let rv=0;rv<2;rv++)for(let wv=0;wv<2;wv++)for(let rbank=0;rbank<4;rbank++)for(let wbank=0;wbank<4;wbank++){
 const eligible=Array.from({length:4},(_,b)=>Boolean(rv&&rbank===b||!rv&&wv&&wbank===b));assert.equal(eligible.filter(Boolean).length,Number(Boolean(rv||wv)));if(rv)assert(eligible[rbank]);else if(wv)assert(eligible[wbank]);arbitrationCases++;
}
for(let owner=0;owner<8;owner++)for(let type=0;type<2;type++)for(let rm=0;rm<256;rm++)for(let wm=0;wm<256;wm+=17){const r=Boolean(rm&(1<<owner)),w=Boolean(wm&(1<<owner)),actual=Boolean((!type&&r)||(type&&w));assert.equal(actual,type?w:r);ackCases++;}
let phaseCases=0;for(let reset=0;reset<2;reset++)for(let active=0;active<2;active++)for(let tail=0;tail<2;tail++)for(let ownedValid=0;ownedValid<2;ownedValid++){
 const blocked=!!reset,ready=!!(tail&&active&&!blocked),clear=!!(reset||tail&&!ownedValid),admit=!!(!blocked&&!tail),phases=[active&&!tail&&!blocked,active&&tail&&!blocked];assert(!blocked||!ready&&!admit&&phases.every(x=>!x));if(tail&&ownedValid&&!reset)assert(!clear);if(tail&&!ownedValid)assert(clear);phaseCases++;
}
let negatives=0;function bad(p,block){const x=new Map(m);if(block===null)x.delete(K(p));else x.set(K(p),block);assert.throws(()=>interfaces(x));negatives++;}
bad(P(70,-54,-245),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});bad(P(94,-54,-125),{id:'minecraft:comparator',properties:{facing:'west',mode:'compare'}});bad(P(112,-49,-449),null);bad(P(8,-45,-435),null);bad(P(53,-52,-230),null);bad(P(48,-21,-245),null);bad(P(91,-59,-60),null);bad(P(-24,279,-67),null);bad(P(128,-52,-98),{id:'minecraft:comparator',properties:{facing:'east',mode:'subtract'}});bad(d.ports.read_data.positions[0],null);for(const n of[-1,4,0.5]){assert.throws(()=>makeDataChannel({bankIndex:n}));negatives++;}
const out={status:'offline_connected_one_bank_candidate_static_checks_pass',...d.metrics,parent_positions_preserved:pm.size,new_supports:supports,route_steps_checked:routeSteps,raw_address_muxes:64,retained_owner_valid_gates:16,ready_gates:24,arbitration_cases:arbitrationCases,owned_valid_cases:ackCases,phase_boolean_cases:phaseCases,negative_cases:negatives,whole_four_bank_subsystem_complete:false,original_arbitration_equivalence:false,native_acceptance:false,limits:'Settled Boolean cases do not establish propagation, glitch absence, reset startup, ownership capture or memory write timing.'};if(process.argv.includes('--save'))writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
