// Offline design artifacts can exceed V8's single-string limit. Parse each
// top-level field separately; arrays use bounded groups of records for both
// reading and writing. The canonical logical schema stays unchanged.
import assert from 'node:assert/strict';
import {readFileSync,openSync,writeSync,closeSync} from 'node:fs';
function arrayRecords(b,start,end){
 const out=[];let cursor=start+1,record=cursor,depth=0,quoted=false,escape=false,chunkStart=cursor,count=0;
 for(;cursor<end-1;cursor++){const c=b[cursor];if(quoted){if(escape)escape=false;else if(c===92)escape=true;else if(c===34)quoted=false;continue;}if(c===34){quoted=true;continue;}if(c===123||c===91)depth++;else if(c===125||c===93)depth--;else if(c===44&&depth===0){count++;if(count===4096){out.push(...JSON.parse('['+b.subarray(chunkStart,cursor).toString()+']'));chunkStart=cursor+1;count=0;}record=cursor+1;}}
 assert.equal(b[end-1],93);const tail=b.subarray(chunkStart,end-1).toString();if(tail.trim()){out.push(...JSON.parse('['+tail+']'));}else assert(chunkStart===start+1,'trailing array comma');return out;
}
function objectRecords(b,start,end){
 const out={};let cursor=start+1,depth=0,quoted=false,escape=false,chunkStart=cursor,count=0;
 const accept=text=>{for(const [key,value]of Object.entries(JSON.parse('{'+text+'}'))){assert(!Object.hasOwn(out,key),'duplicate map key across chunks');Object.defineProperty(out,key,{value,writable:true,enumerable:true,configurable:true});}};
 for(;cursor<end-1;cursor++){const c=b[cursor];if(quoted){if(escape)escape=false;else if(c===92)escape=true;else if(c===34)quoted=false;continue;}if(c===34){quoted=true;continue;}if(c===123||c===91)depth++;else if(c===125||c===93)depth--;else if(c===44&&depth===0){count++;if(count===4096){accept(b.subarray(chunkStart,cursor).toString());chunkStart=cursor+1;count=0;}}}
 assert.equal(b[end-1],125);const tail=b.subarray(chunkStart,end-1).toString();if(tail.trim())accept(tail);else assert(chunkStart===start+1,'trailing map comma');return out;
}
export function parseLargeDesign(buffer){
 const b=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer),out={};let i=0;
 const ws=()=>{while(i<b.length&&[32,9,10,13].includes(b[i]))i++;};
 ws();assert.equal(b[i++],123,'design must be an object');ws();
 while(b[i]!==125){
  assert.equal(b[i],34,'expected object key');const ks=i++;let escaped=false;
  while(i<b.length){const c=b[i++];if(escaped){escaped=false;continue;}if(c===92){escaped=true;continue;}if(c===34)break;}
  const key=JSON.parse(b.subarray(ks,i).toString());assert(!Object.hasOwn(out,key),'duplicate top-level key');ws();assert.equal(b[i++],58);ws();const start=i;let depth=0,quoted=false,escape=false;
  for(;i<b.length;i++){const c=b[i];if(quoted){if(escape)escape=false;else if(c===92)escape=true;else if(c===34)quoted=false;continue;}if(c===34){quoted=true;continue;}if(c===123||c===91){depth++;continue;}if((c===125||c===44)&&depth===0)break;if(c===125||c===93){assert(depth>0,'unbalanced value');depth--;}}
  assert(i<b.length&&!quoted&&depth===0,'unterminated top-level value');const value=b[start]===91?arrayRecords(b,start,i):b[start]===123?objectRecords(b,start,i):JSON.parse(b.subarray(start,i).toString());Object.defineProperty(out,key,{value,writable:true,enumerable:true,configurable:true});
  if(b[i]===125)break;assert.equal(b[i++],44);ws();assert.notEqual(b[i],125,'trailing comma');
 }
 assert.equal(b[i++],125);ws();assert.equal(i,b.length,'trailing bytes');return out;
}
export const readLargeDesign=path=>parseLargeDesign(readFileSync(path));
export function writeLargeDesign(path,value){
 const fd=openSync(path,'w');const emit=s=>{const b=Buffer.from(s);let n=0;while(n<b.length)n+=writeSync(fd,b,n,b.length-n);};
 try{emit('{');let first=true;for(const [key,v]of Object.entries(value)){if(v===undefined)continue;if(!first)emit(',');first=false;emit(JSON.stringify(key)+':');
   if(Array.isArray(v)){emit('[');for(let i=0;i<v.length;i+=4096){if(i)emit(',');emit(JSON.stringify(v.slice(i,i+4096)).slice(1,-1));}emit(']');}
   else if(v&&typeof v==='object'){const keys=Object.keys(v);emit('{');let any=false;for(let i=0;i<keys.length;i+=4096){const chunk=JSON.stringify(Object.fromEntries(keys.slice(i,i+4096).map(k=>[k,v[k]]))).slice(1,-1);if(!chunk)continue;if(any)emit(',');emit(chunk);any=true;}emit('}');}
   else emit(JSON.stringify(v));
  }emit('}\n');}finally{closeSync(fd);}
}
