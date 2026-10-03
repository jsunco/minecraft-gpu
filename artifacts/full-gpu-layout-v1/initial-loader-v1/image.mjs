// Pure pre-run image preparation. No transport, block writes, or runtime answers.
import assert from 'node:assert/strict';
export function checkImage(values,width){assert(Array.isArray(values)&&values.length===256,'Exactly 256 words required');assert(values.every(x=>Number.isSafeInteger(x)&&x>=0&&x<2**width),'Word outside unsigned width');}
export function programEdits(values,configuration){
 checkImage(values,16);assert.equal(configuration.length,4096);const keys=new Set(),positions=new Set();
 return configuration.map(c=>{assert(Number.isSafeInteger(c.address)&&c.address>=0&&c.address<256&&Number.isSafeInteger(c.bit)&&c.bit>=0&&c.bit<16);const key=c.address+':'+c.bit,pos=['x','y','z'].map(a=>{assert(Number.isSafeInteger(c.position[a]));return c.position[a];}).join(',');assert(!keys.has(key)&&!positions.has(pos));keys.add(key);positions.add(pos);return{address:c.address,bit:c.bit,position:c.position,value:(values[c.address]>>c.bit)&1,block:{id:(values[c.address]&(1<<c.bit))?'minecraft:redstone_block':'minecraft:light_gray_concrete'}};});
}
export function ramTransfers(values,panels){
 checkImage(values,8);assert.equal(panels.length,4);assert.deepEqual(panels.map(p=>p.bank).sort(),[0,1,2,3]);
 return values.map((value,address)=>{const bank=address&3,local=address>>2,p=panels.find(p=>p.bank===bank);assert(p&&p.slot===4);const levels=Object.fromEntries(p.switches.map(s=>[s.name,!!((s.kind==='address'?local:value)&2**s.bit)]));return{address,bank,local_address:local,value,levels,write_switch:p.strobe,write_valid:p.write_valid,ready:p.ready,sequence:['WRITE=0; retain LOAD owner','set six address and eight data switches; wait measured settle','WRITE=1; hold payload until this slot WREADY=1','WRITE=0; keep payload until WREADY=0 AND actual bank-tail-busy=0','read all actual retained repeater bits and closed side locks from image-source-map.json before IMAGE_VERIFIED'],host_runtime_use:false};});
}
