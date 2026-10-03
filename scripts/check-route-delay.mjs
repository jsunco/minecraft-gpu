// Nominal scheduled-component arithmetic on authored directed interconnect only.
// Neither event simulation nor Minecraft timing bounds. Does not seed opaque parent logic.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {makeSignalDescent} from '../hardware/full-gpu-signal-descent.mjs';
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z);
export function routeDelays(d,{requireNoninverting=true}={}){
 const blocks=new Map(d.blocks.map(v=>[K(v.position),v.block])),graph=new Map();
 function edge(a,b){assert(blocks.has(K(a))&&blocks.has(K(b)),'Missing directed path endpoint');if(!graph.has(K(a)))graph.set(K(a),new Set());graph.get(K(a)).add(K(b));}
 for(const e of d.edges??[])edge(e.from,e.to);
 for(const c of d.columns??[])for(let y=c.bottom;y<c.output_y;y++)edge(P(c.x,y,c.z),P(c.x,y+1,c.z));
 for(const parent of d.parents??[])if(parent.parameters?.drop!==undefined){const x=makeSignalDescent(parent.parameters);for(let i=1;i<x.path.length;i++)edge(A(x.path[i-1],parent.origin),A(x.path[i],parent.origin));}
 const cost=key=>{const b=blocks.get(key);if(b.id==='minecraft:repeater'){const n=Number(b.properties?.delay);assert([1,2,3,4].includes(n));return 2*n;}if(['minecraft:redstone_torch','minecraft:redstone_wall_torch','minecraft:comparator'].includes(b.id))return 2;return 0;};
 const invert=key=>['minecraft:redstone_torch','minecraft:redstone_wall_torch'].includes(blocks.get(key).id)?1:0;
 const outputs=[];
 for(const c of d.connections??[]){const source=K(c.tap??c.source),target=K(c.destination);assert(blocks.has(source)&&blocks.has(target),'Missing connection endpoint');const reachable=new Set([source]),scan=[source];for(let i=0;i<scan.length;i++){const key=scan[i];if(key===target)continue;for(const next of graph.get(key)??[])if(!reachable.has(next)){reachable.add(next);scan.push(next);}}assert(reachable.has(target),'No authored directed path '+c.name);
  const degree=new Map([...reachable].map(k=>[k,0]));for(const key of reachable)if(key!==target)for(const next of graph.get(key)??[])if(reachable.has(next))degree.set(next,degree.get(next)+1);const queue=[...degree].filter(([k,n])=>n===0).map(([k])=>k),values=new Map([[source,{min:0,max:0,inversions:new Set([0]),devices:0}]]);for(let i=0;i<queue.length;i++){const key=queue[i],v=values.get(key);if(key===target)continue;for(const next of graph.get(key)??[])if(reachable.has(next)){if(v){const r=values.get(next)??{min:Infinity,max:-Infinity,inversions:new Set(),devices:0};r.min=Math.min(r.min,v.min+cost(next));r.max=Math.max(r.max,v.max+cost(next));r.devices=Math.max(r.devices,v.devices+(cost(next)>0?1:0));for(const n of v.inversions)r.inversions.add(n+invert(next));values.set(next,r);}degree.set(next,degree.get(next)-1);if(degree.get(next)===0)queue.push(next);}}assert.equal(queue.length,reachable.size,'Cycle in directed route');const r=values.get(target);assert(r,'Unreachable target');if(requireNoninverting)assert([...r.inversions].every(n=>n%2===0),'Unexpected route inversion '+c.name);outputs.push({name:c.name,source: c.tap??c.source,destination:c.destination,nominal_min_ticks:r.min,nominal_max_ticks:r.max,torch_inversions:[...r.inversions].sort((a,b)=>a-b),scheduled_devices_on_longest_route:r.devices});
 }
 return {status:'authored_route_nominal_delay_arithmetic_only',routes:outputs,model:{repeater_ticks:'2 * configured delay',torch_ticks:2,comparator_ticks:2,dust_ticks:0,solid_ticks:0},numeric_physical_bounds_established:false,native_acceptance:false,limits:['Only declared directed routes, columns and explicitly regenerated descent parents are traversed. Opaque parent logic and source-to-tap paths are excluded.','These are nominal component sums, not max/min Minecraft event bounds. Torch scheduling, burnout, comparator pulse behavior, chunk state and pulse widths are not simulated.','Rise/fall equality is a modeling assumption, not measured behavior. Input setup, held-level duration and distant latch closure remain separate obligations.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const [input,output]=process.argv.slice(2);assert(input&&output);const bytes=readFileSync(input),result=routeDelays(JSON.parse(bytes));result.design_sha256=createHash('sha256').update(bytes).digest('hex');writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({routes:result.routes.map(r=>({name:r.name,ticks:r.nominal_max_ticks})),numeric_physical_bounds_established:false}));}
