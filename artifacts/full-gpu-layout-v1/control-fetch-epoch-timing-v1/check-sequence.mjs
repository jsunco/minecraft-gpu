// Source-derived discrete state induction. This is not a physical tick simulator.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
import {nextCoreState} from '../control-core-v1/prepare.mjs';
const H=fileURLToPath(new URL('.',import.meta.url)),ROOT=resolve(H,'../../..');
const intent=s=>({FI:s===1,R:s>=2&&s<=6});
let cases=0;
for(let s=0;s<8;s++)for(const advance of [false,true])for(const ret of [false,true])for(const init of [false,true]){
 const expected=init?0:!advance||s===7?s:s===6?(ret?7:1):s+1;
 assert.equal(nextCoreState(s,advance,ret,init),expected);
 assert(!(intent(s).FI&&intent(s).R));cases++;
}
// Every non-initializing edge is retained, including arbitrary stalls and RET.
const edges=Array.from({length:8},(_,s)=>[...new Set([false,true].flatMap(a=>[false,true].map(r=>nextCoreState(s,a,r,false))))]);
function shortest(from,to,graph=edges){const q=[[from]],seen=new Set([from]);while(q.length){const p=q.shift();if(p.at(-1)===to)return p;for(const n of graph[p.at(-1)])if(!seen.has(n)){seen.add(n);q.push([...p,n]);}}return null;}
const operation=shortest(2,1);assert.deepEqual(operation,[2,3,4,5,6,1]);
assert(operation.slice(0,-1).every(s=>intent(s).R&&!intent(s).FI));
assert.deepEqual(shortest(1,2),[1,2]);
assert.deepEqual(edges[7],[7]);
assert(edges.every((next,s)=>next.every(n=>n===s||s===6&&[1,7].includes(n)||s<6&&n===s+1)));
// Structural ordering is what earns the long R-high/FI-low interval. A
// bypass is refused even if a shortened software trace reaches the same PC.
const bypass=structuredClone(edges);bypass[2].push(1);
assert.notDeepEqual(shortest(2,1,bypass),operation);
const r={status:'source_state_sequence_checked_not_physical_timing',state_cases:cases,
 normal_edges:edges,minimum_completed_operation_commits:operation.length-1,operation_path:operation,
 held_intent_table:Array.from({length:8},(_,state)=>({state,...intent(state)})),
 facts:['Stalling adds cycles and cannot shorten the five committed transitions between DECODE and the next FETCH.',
 'FI/R are separate A-held physical bits; this table does not assume they switch simultaneously.',
 'Warm request masks IDLE/UPDATE admission rather than changing this successor function. Any late admitted FETCH must still complete the normal sequence before service.',
 'Initialization is a separate destructive branch to state0. Its safe ownership admission is not proved by this sequence.'],
 bypass_negative:true,native_acceptance:false,full_timing_acceptance:false,source_sha256:{}};
for(const p of [fileURLToPath(import.meta.url),resolve(H,'../control-core-v1/prepare.mjs'),resolve(H,'../control-front-v1/prepare.mjs'),resolve(H,'../control-reset-retire-v1/logic.mjs')])r.source_sha256[relative(ROOT,p)]=createHash('sha256').update(readFileSync(p)).digest('hex');
writeFileSync(resolve(H,'sequence.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({cases,minimumOperationCommits:r.minimum_completed_operation_commits,bypassNegative:true}));
