// Pure source-to-sink DAG rule copied from the frozen direct checker.
import assert from 'node:assert/strict';
function checkDAG(nodes,adj,cost,start,end){
 let serial=0;const number=new Map(),low=new Map(),stack=[],onStack=new Set(),components=[];
 function visit(v){number.set(v,serial);low.set(v,serial++);stack.push(v);onStack.add(v);for(const q of adj.get(v)??[]){if(!number.has(q)){visit(q);low.set(v,Math.min(low.get(v),low.get(q)));}else if(onStack.has(q))low.set(v,Math.min(low.get(v),number.get(q)));}if(low.get(v)===number.get(v)){const c=[];let q;do{q=stack.pop();onStack.delete(q);c.push(q);}while(q!==v);components.push(c);}}
 for(const v of nodes)if(!number.has(v))visit(v);
 for(const c of components)if(c.length>1||adj.get(c[0])?.has(c[0]))assert(!c.some(k=>cost.get(k)>0),'Positive-device cycle');
 const component=new Map();components.forEach((c,i)=>c.forEach(k=>component.set(k,i)));
 const edges=components.map(()=>new Set()),indegree=components.map(()=>0);for(const[v,qs]of adj)for(const q of qs){const a=component.get(v),b=component.get(q);if(a!==b&&!edges[a].has(b)){edges[a].add(b);indegree[b]++;}}
 const queue=indegree.flatMap((v,i)=>v===0?[i]:[]),delay=components.map(()=>-Infinity);delay[component.get(start)]=0;
 for(let i=0;i<queue.length;i++){const a=queue[i];for(const b of edges[a]){delay[b]=Math.max(delay[b],delay[a]+Math.max(...components[b].map(k=>cost.get(k))));if(--indegree[b]===0)queue.push(b);}}
 assert.equal(queue.length,components.length);assert(Number.isFinite(delay[component.get(end)]),'Missing source-to-matching-sink path');
 return {vertices:nodes.length,zero_cost_components:components.filter(c=>c.length>1).length,nominal_max_source_to_sink:delay[component.get(end)]};
}

export {checkDAG};
