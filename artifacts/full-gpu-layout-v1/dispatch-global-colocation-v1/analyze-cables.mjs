// Cut only named retained bodies, then discover actual directed transport.
// Zero-cost wire SCCs collapse; any diode/torch SCC is an explicit blocker.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={};
function read(n){const b=readFileSync(new URL(n,H));pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v1/'+n]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const scope=read('reference-scope.json'),cuts=read('actual-cuts.json'),inv=read('inventory.json'),lm=read('cell-labels.json'),lb=readFileSync(new URL('cell-labels.u16le',H));
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v1/cell-labels.u16le']=createHash('sha256').update(lb).digest('hex');
const K=p=>`${p.x},${p.y},${p.z}`,world=new Map([...scope.blocks,...scope.foreign_context].map(v=>[K(v.position),v.block])),nodes=[],idx=new Map();
const labelAt=new Map(scope.blocks.map((v,i)=>[K(v.position),lb.readUInt16LE(i*2)])),bodyWire=new Map(),powered=new Set(),followers=new Map();
for(const v of scope.blocks)if(labelAt.get(K(v.position))&&v.block.id==='minecraft:redstone_wire')bodyWire.set(K(v.position),v);
for(const [k,v]of bodyWire)for(const p of inputs(world,v.position))if(labelAt.get(K(p))===labelAt.get(k)){
 if(world.get(K(p)).id!=='minecraft:redstone_wire')powered.add(k);else{if(!followers.has(K(p)))followers.set(K(p),[]);followers.get(K(p)).push(k);}
}
const powerQueue=[...powered];for(let i=0;i<powerQueue.length;i++)for(const k of followers.get(powerQueue[i])??[])if(!powered.has(k)){powered.add(k);powerQueue.push(k);}
// Passive input pads are physical body cells, but not independent drivers.
// Include them as zero-cost transport vertices so a pad's reciprocal dust
// contact cannot masquerade as a second source or an intentional wired OR.
const passive=new Set([...bodyWire.keys()].filter(k=>!powered.has(k)));let realTransport=0;
for(let i=0;i<scope.blocks.length;i++){const v=scope.blocks[i];if(!active(v.block))continue;if(lb.readUInt16LE(i*2)!==0&&!passive.has(K(v.position)))continue;idx.set(K(v.position),nodes.length);nodes.push(v);if(lb.readUInt16LE(i*2)===0)realTransport++;}
assert(nodes.every(v=>!['minecraft:comparator','minecraft:lever','minecraft:redstone_block'].includes(v.block.id)),'Unowned logic/manual source must not become transport');
const edges=nodes.map(()=>[]),reverse=nodes.map(()=>[]),rootMap=new Map(),roots=[],external=[];
for(let i=0;i<nodes.length;i++)for(const p of inputs(world,nodes[i].position)){
 const j=idx.get(K(p));if(j!==undefined){edges[j].push(i);reverse[i].push(j);}else{
  const cut=cuts.crossings.find(v=>K(v.source)===K(p)&&K(v.target)===K(nodes[i].position));
  // A foreign context prefix may terminate outside a body. Keep it explicit.
  const name=cut?.source_body??'foreign_context';let r=rootMap.get(K(p));if(r===undefined){r=roots.length;rootMap.set(K(p),r);roots.push({source:p,body:name,block:world.get(K(p))});}external.push([r,i]);
 }
}
// Iterative Kosaraju avoids recursion limits on long real transport coils.
const seen=new Uint8Array(nodes.length),order=[];
for(let start=0;start<nodes.length;start++)if(!seen[start]){seen[start]=1;const st=[[start,0]];while(st.length){const f=st.at(-1);if(f[1]<edges[f[0]].length){const j=edges[f[0]][f[1]++];if(!seen[j]){seen[j]=1;st.push([j,0]);}}else{order.push(f[0]);st.pop();}}}
const component=new Int32Array(nodes.length).fill(-1),members=[];
for(let oi=order.length-1;oi>=0;oi--){const start=order[oi];if(component[start]!==-1)continue;const ci=members.length,q=[start],out=[];component[start]=ci;for(let n=0;n<q.length;n++){const i=q[n];out.push(i);for(const j of reverse[i])if(component[j]===-1){component[j]=ci;q.push(j);}}members.push(out);}
const cycle=members.filter(v=>v.length>1&&v.some(i=>nodes[i].block.id!=='minecraft:redstone_wire'));
if(cycle.length){writeFileSync(new URL('positive-cycle-refusal.json',H),JSON.stringify({status:'actual_transport_positive_device_cycle_refusal',components:cycle.map(v=>v.map(i=>nodes[i])),source_sha256:pins},null,2)+'\n');assert.fail('Positive transport SCC '+cycle.length);}
const ce=members.map(()=>new Set()),indeg=new Int32Array(members.length),arrivals=members.map(()=>0n);
for(let i=0;i<nodes.length;i++)for(const j of edges[i])if(component[i]!==component[j])ce[component[i]].add(component[j]);
for(const es of ce)for(const j of es)indeg[j]++;
for(const [r,i]of external)arrivals[component[i]]|=1n<<BigInt(r);
const queue=[];for(let i=0;i<members.length;i++)if(!indeg[i])queue.push(i);
for(let k=0;k<queue.length;k++){const i=queue[k];for(const j of ce[i]){arrivals[j]|=arrivals[i];if(!--indeg[j])queue.push(j);}}
assert.equal(queue.length,members.length);
const transfers=[],direct=[],unrooted=[],signatures=new Map(),pairSeen=new Set();
for(const cut of cuts.crossings){const si=idx.get(K(cut.source)),ti=idx.get(K(cut.target));if(si===undefined&&ti===undefined){direct.push(cut);continue;}
 if(cut.target_body==='unpartitioned_cables')continue;const endpoint=ti??si;if(endpoint===undefined)continue;
 const mask=arrivals[component[endpoint]],rs=[];for(let r=0;r<roots.length;r++)if(mask&(1n<<BigInt(r)))rs.push(r);
 if(!rs.length)unrooted.push({target:cut.target,body:cut.target_body,immediate_source:cut.source});
 for(const r of rs){const pk=K(roots[r].source)+'>'+K(cut.target);if(pairSeen.has(pk))continue;pairSeen.add(pk);transfers.push({source:roots[r].source,source_body:roots[r].body,target:cut.target,target_body:cut.target_body,immediate_source:cut.source});}
}
for(let i=0;i<nodes.length;i++){const k=arrivals[component[i]].toString();let s=signatures.get(k);if(!s){s={root_ids:[],active_cells:0,materials:{},terminals:[]};for(let r=0;r<roots.length;r++)if(arrivals[component[i]]&(1n<<BigInt(r)))s.root_ids.push(r);signatures.set(k,s);}s.active_cells++;s.materials[nodes[i].block.id]=(s.materials[nodes[i].block.id]??0)+1;}
const pathPins=['../memory/fabric-colocation-v2/cut-inputs.mjs','analyze-cables.mjs'];for(const n of pathPins){const p=new URL(n,H);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(readFileSync(p)).digest('hex');}
const report={status:'actual_directed_body_transport_cut_graph',body_count:inv.bodies.length,body_cells:inv.body_cells,transport_cells:inv.unpartitioned_cable_cells,transport_active_cells:realTransport,passive_body_wire_vertices:passive.size,actual_edges:edges.reduce((n,e)=>n+e.length,0),wire_SCCs:members.filter(v=>v.length>1).length,positive_device_SCCs:0,body_or_foreign_sources:roots.length,matching_effective_transfers:transfers.length,direct_body_edges:direct.length,unrooted_targets:unrooted,source_sha256:pins,roots,transfers,direct,signal_groups:[...signatures.values()],limits:['Actual directed potential-dependency graph only. It is not truth-table equivalence, pulse transport or physical timing.','Complete selected body boundaries are preserved. Foreign contexts terminate at explicit master-cable cut sources rather than guessed remote source identities.','A path crossing an inversion column retains polarity/timing obligations; this reachability report does not authorize replacing it with arbitrary positive wire.','Unrooted paths and reconvergent multiple-source groups must be accounted for before removal or redraw.','All 187 retained stores and fifteen real conditional boundary gates remain in bodies.'],native_acceptance:false};
writeFileSync(new URL('transport-cuts.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({transport_active_cells:nodes.length,actual_edges:report.actual_edges,wire_SCCs:report.wire_SCCs,roots:roots.length,transfers:transfers.length,direct:direct.length,unrooted:unrooted.length,groups:signatures.size}));
