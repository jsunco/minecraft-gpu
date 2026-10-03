import assert from 'node:assert/strict';
import{mkdtempSync,readFileSync,writeFileSync,rmSync,statSync,openSync,readSync,closeSync}from'node:fs';
import{tmpdir}from'node:os';import{join}from'node:path';import{createHash}from'node:crypto';
import{parseLargeDesign,writeLargeDesign}from'../../../../hardware/memory-layout-large-json-v2.mjs';
const sha=path=>{const h=createHash('sha256'),fd=openSync(path,'r'),b=Buffer.alloc(1024*1024);try{let n;while(n=readSync(fd,b))h.update(b.subarray(0,n));return h.digest('hex');}finally{closeSync(fd);}};
const tmp=mkdtempSync(join(tmpdir(),'memory-design-json-'));let cases=0;
try{
 for(const obj of[{},{a:[],b:{},c:null},{blocks:Array.from({length:8201},(_,i)=>({position:{x:i,y:0,z:1},block:{id:'minecraft:redstone_wire'}})),nets:Object.fromEntries(Array.from({length:8201},(_,i)=>['k'+i,'x"\\'+i+'\n'])),note:'é ⊕ 😀',bool:false},JSON.parse('{"__proto__":{"a":1},"constructor":2}')]){
  const p=join(tmp,'test.json');writeLargeDesign(p,obj);assert.equal(readFileSync(p,'utf8'),JSON.stringify(obj)+'\n');assert.deepEqual(parseLargeDesign(readFileSync(p)),obj);cases++;
  for(const spacing of[1,2,'\t']){assert.deepEqual(parseLargeDesign(Buffer.from(JSON.stringify(obj,null,spacing)+'\n')),obj);cases++;}
 }
 for(const raw of['[]','{"a":1,}','{"a":1,"a":2}','{"a":"x}','{"a":[1,2}','{"a":1}x','{"a":}','{"a":1 "b":2}','{"a":[1,]}','{"a":[1,,2]}','{"a":[','{"a":['+Array(4096).fill('1').join(',')+',]}']){assert.throws(()=>parseLargeDesign(Buffer.from(raw)));cases++;}
 const report={status:'offline_large_design_json_v2_pass',cases,utility_sha256:sha(new URL('../../../../hardware/memory-layout-large-json-v2.mjs',import.meta.url)),full_roundtrip:null};
 if(process.argv.includes('--full')){const p=new URL('./design.json',import.meta.url),bytes=readFileSync(p),d=parseLargeDesign(bytes),out=join(tmp,'large.json');writeLargeDesign(out,d);const before=sha(p),after=sha(out);assert.equal(after,before);assert.equal(statSync(out).size,bytes.length);report.full_roundtrip={blocks:d.blocks.length,bytes:bytes.length,before_sha256:before,after_sha256:after};}
 if(process.argv.includes('--save')){assert(report.full_roundtrip,'saved report requires actual full-map roundtrip');writeFileSync(new URL('./json-checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report));
}finally{rmSync(tmp,{recursive:true});}
