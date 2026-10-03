// Original two-core lifecycle predicates, physically gated from retained owner/start and core replies.
import assert from'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{makeLiteralNetwork}from'./full-gpu-literal-network.mjs';
export const INPUTS=['owner','start0','start1','done0','done1','ack0','ack1','remaining'];
export const OUTPUTS=['completed','reset_high','reset_low','available','both_reset'];
export function makeDispatchPredicates({dense=false}={}){
 const terms=[],term=(name,literals,bits)=>terms.push({name,literals,bits});
 for(let c=0;c<2;c++)term('selected_completed_'+c,{owner:c,['start'+c]:1,['done'+c]:1},[0]);
 for(let c=0;c<2;c++)term('selected_ack_'+c,{owner:c,['ack'+c]:1},[1]);
 for(let c=0;c<2;c++)term('selected_ack_low_'+c,{owner:c,['ack'+c]:0},[2]);
 for(let c=0;c<2;c++)term('selected_available_'+c,{owner:c,['start'+c]:0,['ack'+c]:1,remaining:1},[3]);
 term('both_acknowledged',{ack0:1,ack1:1},[4]);
 return{...makeLiteralNetwork({inputs:INPUTS,outputs:OUTPUTS,terms,dense}),meaning:'Combinational Boolean predicates; core ACK must come from real local reset and matching program/LSU drain, never a host answer or raw IDLE.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDispatchPredicates();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
