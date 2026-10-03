// Read-only accepted context. No response geometry is inserted.
import assert from'node:assert/strict';import{loadBase as prior}from'../bank-ready-collectors-v1/frame.mjs';import{K,read,pins}from'./source-tools.mjs';
export function loadBase(){const base=prior();for(const[n,manifest,manifestHash,deltaHash]of[
 ['../bank-ready-collectors-v1/delta.json','../bank-ready-collectors-v1/source-manifest.json','aa2eac00ab251ce74a650451a4c97fdeadf636effcf176a0d9fbc5ebd70b5125','a250536391aaab40afa270de503a677e57574fcc7283e5c44c851f51c6495967'],
 ['../../../global-loader-return-v1/delta.json','../../../global-loader-return-v1/source-manifest.json','3eac886044516ba07fefb591ec0e16e59d382bdce4086dda69cb6ae30d27af07','7a5a780a41e84b0967539e80841431d8971f52fb1c52dc5c2831289c7e2d2070'],
 ['../../../loader-program-colocation-v1/service-live-busy-delivery-v1/delta.json','../../../loader-program-colocation-v1/service-live-busy-delivery-v1/source-manifest.json','35b6f3385a71bdb9e413c7bf62b335b242c048fd93d4e437c43a362ecd182adf','b6e76efe345a848db44cf462a5fdbbc9d3e649a5f92dfecac91ab5462c5efbdf']]){read(manifest,manifestHash);const d=read(n,deltaHash);for(const r of d.new_cells){assert(!base.world.has(K(r.position)),'Reserved overlap '+K(r.position));base.world.set(K(r.position),r.block);base.rows.push(r);}}
assert.equal(base.world.size,2192096);assert.equal(base.rows.length,2192096);return base;}
