import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {makeMatrix} from './matrix.mjs';
import{guardDefinition,nextDefinition,actionDefinition,equation}from'./logic.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},dirs=Object.values(D),W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',diode=b=>['minecraft:repeater','minecraft:comparator'].includes(b?.id),pair=(a,b)=>[K(a),K(b)].sort().join('|');
export function checkMatrix(d){const {inputs:INPUTS,outputs:OUTPUTS}=d.definition;const evaluate=v=>equation(d.definition,v);
 const m=new Map(d.blocks.map(v=>[K(v.position),v])),at=p=>m.get(K(p)),allowed=new Set(d.edges.map(e=>pair(e.from,e.to)));
 assert.equal(m.size,d.blocks.length);assert.equal(Object.keys(d.ports).length,INPUTS.length+OUTPUTS.length);let supports=0,contacts=0,rears=0,columnSources=0,cases=0;
 for(const v of d.blocks){if(v.block.id===S)continue;let p=P(v.position.x,v.position.y-1,v.position.z);if(v.block.id==='minecraft:redstone_wall_torch'){const[x,z]=D[v.block.properties.facing];p=P(v.position.x+x,v.position.y,v.position.z+z);}assert.equal(at(p)?.block.id,S,'support '+K(v.position));supports++;}
 for(const v of d.blocks.filter(v=>v.block.id===W))for(const[x,z]of dirs)for(const dy of[-1,0,1]){const p=P(v.position.x+x,v.position.y+dy,v.position.z+z),b=at(p);if(!b||b.block.id===S||dy&&b.block.id!==W)continue;if(dy===1&&at(P(v.position.x,v.position.y+1,v.position.z)))continue;if(dy===-1&&at(P(p.x,p.y+1,p.z)))continue;assert(allowed.has(pair(v.position,p)),'foreign contact '+K(v.position)+' '+K(p));contacts++;}
 const rep=(p,travel)=>{assert.equal(at(p)?.block.id,'minecraft:repeater');assert.deepEqual(D[at(p).block.properties.facing],travel);};
 for(const v of d.blocks.filter(v=>diode(v.block))){const[x,z]=D[v.block.properties.facing],rear=P(v.position.x-x,v.position.y,v.position.z-z);assert(allowed.has(pair(v.position,rear)),'rear '+K(v.position));rears++;for(const[dx,dz]of[[z,x],[-z,-x]]){const b=at(P(v.position.x+dx,v.position.y,v.position.z+dz));if(diode(b?.block))assert(allowed.has(pair(v.position,b.position)),'side diode '+K(v.position));}}
 for(const c of d.columns)for(let y=c.bottom;y<c.top;y+=2){const p=P(c.x,y,c.z),got=[];for(const[x,z]of dirs){const q=P(c.x-x,y,c.z-z),b=at(q)?.block;if(b?.id===W||diode(b)&&D[b.properties.facing][0]===x&&D[b.properties.facing][1]===z)got.push(K(q));}if(at(P(c.x,y+1,c.z))?.block.id===W)got.push(K(P(c.x,y+1,c.z)));if(at(P(c.x,y-1,c.z))?.block.id==='minecraft:redstone_torch')got.push(K(P(c.x,y-1,c.z)));
  const want=y===c.bottom&&c.z===-5?[K(P(c.x-1,y,-5))]:y>c.bottom?[K(P(c.x,y-1,c.z))]:[];
  if(c.z===3&&d.products.some(t=>t.injections.some(p=>p.x===c.x)&&t.y===y))want.push(K(P(c.x,y,2)));
  // Literal masks may receive from the strong torch-powered spine block. They
  // also point back at that same solid; this is the sole intentional dust input.
  if(c.z===-5&&at(P(c.x,y,-4))?.block.id===W)want.push(K(P(c.x,y,-4)));
  assert.deepEqual(got.sort(),want.sort(),'column sources '+c.name+' '+y);columnSources++;
 }
 for(const n of OUTPUTS){const rows=d.products.filter(p=>p.outputs.includes(n)),vars=[...new Set(rows.flatMap(p=>p.gates.map(g=>g.name)))];for(let bits=0;bits<2**vars.length;bits++){const values=Object.fromEntries(vars.map((v,i)=>[v,!!(bits&2**i)]));const injections=new Map();for(const row of rows){let power=15;for(const g of row.gates){const j=INPUTS.indexOf(g.name),x=6+6*j,y=row.y;rep(P(x,y,0),[1,0]);assert.deepEqual(at(g.comparator)?.block.properties,{facing:'west',mode:'subtract'});rep(g.mask,[0,1]);let column=values[g.name];for(let yy=-3;yy<y;yy+=2)column=!column;assert.equal(column,values[g.name]);let mask;if(at(P(x,y,-4)).block.id==='minecraft:redstone_wall_torch'){assert.equal(at(P(x,y,-4)).block.properties.facing,'south');mask=!column;}else{rep(P(x,y,-3),[0,1]);mask=column;}power=Math.max(0,power-(mask?15:0));rep(P(x+3,y,0),[1,0]);if(power)power=15;}const output=row.injections.find(p=>p.x===d.columns.find(c=>c.name===n&&c.z===3).x);rep(P(output.x,row.y,2),[0,1]);injections.set(row.y,power>0);}
  const c=d.columns.find(c=>c.name===n&&c.z===3);let high=false;for(let y=c.bottom;y<c.top;y+=2)high=!(high||!!injections.get(y));assert.equal(high,evaluate(values)[n],n+' '+bits);cases++;}}
 return{blocks:d.blocks.length,supports,contacts,rears,column_source_sets:columnSources,physical_product_truth_cases:cases,limits:['Settled Boolean and contact checks only; no propagation, update ordering, or native timing claim.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify([guardDefinition,nextDefinition,actionDefinition].map(f=>checkMatrix(makeMatrix(f())))));
