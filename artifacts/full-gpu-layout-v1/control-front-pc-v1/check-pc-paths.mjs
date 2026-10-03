import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makePcPaths} from './pc-paths.mjs';
import {possibleStrengths} from '../register-sequencer-v1/connected-controller/check-strength-independent.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},dirs=Object.values(D),pair=(a,b)=>[K(a),K(b)].sort().join('|');
export function inspect(d){const m=new Map(d.blocks.map(v=>[K(v.position),v])),at=p=>m.get(K(p)),parents=new Set(Object.keys(d.parents)),allowed=new Set(d.edges.map(e=>pair(e.from,e.to)));assert.equal(m.size,d.blocks.length);let supports=0,contacts=0;
 for(const v of d.blocks){if(v.block.id.endsWith('_concrete'))continue;let p=P(v.position.x,v.position.y-1,v.position.z);if(v.block.id==='minecraft:redstone_wall_torch'){const[x,z]=D[v.block.properties.facing];p=P(v.position.x+x,v.position.y,v.position.z+z);}assert.equal(at(p)?.block.id,'minecraft:light_gray_concrete','Support '+K(v.position));supports++;}
 for(const v of d.blocks.filter(v=>v.block.id==='minecraft:redstone_wire'))for(const[x,z]of dirs)for(const dy of[-1,0,1]){const p=P(v.position.x+x,v.position.y+dy,v.position.z+z),b=at(p);if(!b||b.block.id.endsWith('_concrete')||v.part===b.part&&parents.has(v.part))continue;if(dy&&b.block.id!=='minecraft:redstone_wire')continue;if(dy===1&&at(P(v.position.x,v.position.y+1,v.position.z)))continue;if(dy===-1&&at(P(p.x,p.y+1,p.z)))continue;assert(allowed.has(pair(v.position,p)),'Foreign '+v.part+' '+K(v.position)+' -> '+b.part+' '+K(p));contacts++;}
 const capacity=possibleStrengths({...d,parents:[...parents].map(id=>({id}))});assert.equal(capacity.failed.length,0,JSON.stringify(capacity.failed));
 assert.equal(d.connections.length,16);for(let bit=0;bit<8;bit++){const c=d.connections.filter(c=>c.from_bit===bit);assert.equal(c.length,2);assert.equal(c[0].to,'incrementer.pc');assert.equal(c[1].to,'pc.incremented_pc');assert.equal(c[0].to_bit,bit);assert.equal(c[1].to_bit,bit);}
 return{...d.metrics,supports,listed_contacts:contacts,...capacity};}
const d=makePcPaths();assert.deepEqual(d,JSON.parse(readFileSync(new URL('./pc-paths.json',import.meta.url))));console.log(JSON.stringify(inspect(d)));
