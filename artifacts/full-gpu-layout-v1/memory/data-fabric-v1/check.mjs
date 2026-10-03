import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeDataFabric} from '../../../../hardware/memory-layout-data-fabric.mjs';
import {makeOwnedDataBank} from '../../../../hardware/memory-layout-data-owned-bank.mjs';
const d=makeDataFabric(),p=makeOwnedDataBank(),K=p=>`${p.x},${p.y},${p.z}`;assert.deepEqual(d,JSON.parse(readFileSync(new URL('design.json',import.meta.url))));const m=new Map(d.blocks.map(v=>[K(v.position),v.block]));assert.equal(m.size,317172);let cells=0,ports=0;for(const c of d.channels){for(const v of p.blocks){const q={x:v.position.x+c.origin.x,y:v.position.y,z:v.position.z+c.origin.z};assert.deepEqual(m.get(K(q)),v.block);cells++;}for(const[name,port]of Object.entries(p.ports)){assert.equal(c.ports[name].width,port.width);for(let i=0;i<port.positions.length;i++){const q=port.positions[i];assert.deepEqual(c.ports[name].positions[i],{x:q.x+c.origin.x,y:q.y,z:q.z+c.origin.z});ports++;}}}
const addresses=new Set();for(let a=0;a<256;a++){const bank=a&3,local=a>>2;assert.equal((local<<2)|bank,a);addresses.add(bank+','+local);}assert.equal(addresses.size,256);assert(d.box.to.y-d.box.from.y+1<=384);assert.equal(d.complete_channel_fabric,false);assert.equal(d.selected,false);
// Contract-only required eligibility. This is NOT implemented by this map.
// A consumer with both valid bits may be read-eligible at just its read bank;
// its write is globally suppressed even when its write bank differs.
function required(rv,wv,ra,wa,b){return Number(rv&&((ra&3)===b)||!rv&&wv&&((wa&3)===b));}
let cases=0;for(let rv=0;rv<2;rv++)for(let wv=0;wv<2;wv++)for(let ra=0;ra<4;ra++)for(let wa=0;wa<4;wa++){const e=Array.from({length:4},(_,b)=>required(rv,wv,ra,wa,b));assert.equal(e.reduce((a,b)=>a+b,0),Number(!!(rv||wv)));if(rv)assert.equal(e[ra],1);cases++;}
assert.equal(required(1,1,0,1,1),0);assert.equal(required(1,1,0,1,0),1);
const out={status:'offline_exact_four_owned_datapaths_partial_fabric_pass',...d.metrics,translated_parent_cells:cells,translated_port_bits:ports,unique_byte_addresses:256,contract_only_read_first_cases:cases,complete_channel_fabric:false,unimplemented_eligibility_explicit:true,native_acceptance:false};if(process.argv.includes('--save'))writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
