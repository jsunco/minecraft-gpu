// Reconstruct old actual transport as settled Boolean expressions.
// Passive dust SCCs OR inputs; supported torch vertices invert their OR.
// No timing, pulse or native behavior is inferred.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),OLD=new URL('../dispatch-global-colocation-v1/',H),ROOT=new URL('../../../',H),pins={};
function read(n){const b=readFileSync(new URL(n,OLD));pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v1/'+n]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const scope=read('reference-scope.json'),cuts=read('actual-cuts.json'),inv=read('inventory.json'),lm=read('cell-labels.json'),lb=readFileSync(new URL('cell-labels.u16le',OLD));
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
if(cycle.length){writeFileSync(new URL('old-transport-cycle-refusal.json',H),JSON.stringify({status:'actual_transport_positive_device_cycle_refusal',components:cycle.map(v=>v.map(i=>nodes[i])),source_sha256:pins},null,2)+'\n');assert.fail('Positive transport SCC '+cycle.length);}
const ce=members.map(()=>new Set()),indeg=new Int32Array(members.length),arrivals=members.map(()=>0n);
for(let i=0;i<nodes.length;i++)for(const j of edges[i])if(component[i]!==component[j])ce[component[i]].add(component[j]);
for(const es of ce)for(const j of es)indeg[j]++;
for(const [r,i]of external)arrivals[component[i]]|=1n<<BigInt(r);
const queue=[];for(let i=0;i<members.length;i++)if(!indeg[i])queue.push(i);
for(let k=0;k<queue.length;k++){const i=queue[k];for(const j of ce[i]){arrivals[j]|=arrivals[i];if(!--indeg[j])queue.push(j);}}
assert.equal(queue.length,members.length);

const coverageRaw=readFileSync(new URL('coverage.json',H)),coverage=JSON.parse(coverageRaw),originalTransfers=read('transport-cuts.json').transfers;
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v6/coverage.json']=createHash('sha256').update(coverageRaw).digest('hex');
const incoming=members.map(()=>new Set()),rootInputs=members.map(()=>new Set());for(let i=0;i<nodes.length;i++)for(const j of edges[i])if(component[i]!==component[j])incoming[component[j]].add(component[i]);for(const [r,i]of external)rootInputs[component[i]].add(r);
const expressions=[],torchNames=new Set(['minecraft:redstone_torch','minecraft:redstone_wall_torch']);
function value(e,assignment,positions){let i=0;for(let k=0;k<e.root_ids.length;k++)if(assignment&(1<<positions.get(e.root_ids[k])))i|=1<<k;return Boolean(e.table&(1<<i));}
for(const ci of queue){const ids=[];for(let r=0;r<roots.length;r++)if(arrivals[ci]&(1n<<BigInt(r)))ids.push(r);assert(ids.length<=2,'Unexpected root expansion');const positions=new Map(ids.map((r,i)=>[r,i]));let table=0;const inverted=members[ci].some(i=>torchNames.has(nodes[i].block.id));if(inverted)assert.equal(members[ci].length,1,'Torch SCC cannot be transport');
 for(let a=0;a<1<<ids.length;a++){let high=[...rootInputs[ci]].some(r=>Boolean(a&(1<<positions.get(r))))||[...incoming[ci]].some(j=>value(expressions[j],a,positions));if(inverted)high=!high;if(high)table|=1<<a;}
 expressions[ci]={root_ids:ids,table};}
const checked=[],nonPositive=[];
for(const c of coverage.drawn){const matches=originalTransfers.filter(t=>K(t.source)===K(c.source)&&K(t.target)===K(c.target));assert.equal(matches.length,1);const t=matches[0],i=idx.get(K(t.target))??idx.get(K(t.immediate_source));assert.notEqual(i,undefined,'No actual transport endpoint '+c.name);const e=expressions[component[i]],positive=(1<<(1<<e.root_ids.length))-2,rootList=e.root_ids.map(r=>({source:roots[r].source,body:roots[r].body}));assert(rootList.some(r=>K(r.source)===K(c.source)),'Missing exact root '+c.name);const item={name:c.name,source:c.source,target:c.target,transport_endpoint:nodes[i].position,original_root_inputs:rootList,settled_truth_table:e.table,positive_or_truth_table:positive};checked.push(item);if(e.table!==positive)nonPositive.push(item);}
const groups=Object.values(expressions).reduce((m,e)=>{const k=e.root_ids.length+':'+e.table;m[k]=(m[k]??0)+1;return m;},{});
const report={status:nonPositive.length?'old_actual_transport_positive_replacement_refusal':'old_actual_transport_settled_positive_or_matches_drawn_roots',transport_nodes:nodes.length,actual_edges:edges.reduce((n,e)=>n+e.length,0),wire_SCCs:members.filter(m=>m.length>1).length,positive_device_SCCs:cycle.length,actual_torch_vertices:nodes.filter(v=>torchNames.has(v.block.id)).length,roots:roots.length,checked_transfers:checked.length,checked,non_positive:nonPositive,expression_groups:groups,source_sha256:pins,limits:['Settled Boolean functions only. No amplitude, finite propagation, scheduled updates, burnout, pulse width or setup/hold equivalence.','A positive OR with two original roots still requires both physical source paths; this does not close a partially drawn OR.','Retained bodies are explicit boundaries; no internal combinational or sequential body behavior is substituted.'],native_acceptance:false};
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v6/check-source-transport.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
writeFileSync(new URL('source-transport-checks.json',H),JSON.stringify(report,null,2)+'\n');assert.equal(nonPositive.length,0,'Nonpositive source transport requires actual polarity preservation');console.log(JSON.stringify({status:report.status,checked_transfers:checked.length,actual_torch_vertices:report.actual_torch_vertices,expression_groups:groups}));
