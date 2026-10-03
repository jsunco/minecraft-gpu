import assert from 'node:assert/strict';
import {makeHeldIR,checkHeldIR} from './prepare.mjs';
const d=makeHeldIR(),r=checkHeldIR(d),K=p=>`${p.x},${p.y},${p.z}`;
let refusals=0;const bad=change=>{const c=structuredClone(d);change(c);assert.throws(()=>checkHeldIR(c));refusals++;};
for(const bit of [0,6])bad(c=>{const b=c.lockBranches.find(b=>b.bit===bit),x=c.blocks.find(x=>K(x.position)===K(b.branch));x.block.properties.facing=x.block.properties.facing==='east'?'west':'east';});
bad(c=>{c.blocks.find(b=>b.part==='request_delay').block.properties.delay='1';});
bad(c=>{c.blocks.find(b=>b.part==='decode_valid').block.properties.mode='compare';});
bad(c=>{const r=c.routes.find(r=>r.refresh_indices.length),p=r.path[r.refresh_indices[0]];c.blocks.find(b=>K(b.position)===K(p)).block.properties.facing='south';});
bad(c=>{c.ports.immediate.bits[0].instruction_bit=1;});
bad(c=>{const p=c.cells[0].driver;c.blocks=c.blocks.filter(b=>K(b.position)!==`${p.x},${p.y-1},${p.z}`);});
// Explicit protocol state model, not an electrical simulator: IR opens only with
// both R and its completed request tail low. Valid never shares a stable open state.
let sequences=0;
for(let old=0;old<65536;old+=257)for(const next of [0,0xffff,0x92a5,0x1e53]){
 let q=old,R=0,F=0,T=0,V=0;
 const settled=(r,f,t,data)=>{R=r;F=f;T=t;const admitted=R&&!F;V=+(T&&admitted);const open=F&&!R&&!T;if(open)q=data;assert(!(V&&open));return open;};
 assert(settled(0,1,0,next));assert.equal(q,next);settled(0,0,0,next);settled(1,0,0,next);assert(!V);settled(1,0,1,next);assert(V);settled(1,1,1,old);assert.equal(q,next);assert(!V);settled(1,0,1,old);assert(V);settled(0,0,1,old);assert(!V);assert(!settled(0,1,1,old));assert.equal(q,next);assert(settled(0,1,0,old));assert.equal(q,old);sequences++;
}
console.log(JSON.stringify({...r,meaningful_corruptions_refused:refusals,finite_protocol_sequences:sequences,sequence_scope:'Stable protocol model only; transport glitches, aborted pulse flush and measured delays remain native gates.'},null,2));
