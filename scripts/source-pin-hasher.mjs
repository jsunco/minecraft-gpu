// Hash each unchanged file once per audit, while rejecting source drift.
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
export function makeSourcePinHasher(root){
 const cache=new Map();let bytesRead=0,reuses=0;
 const stamp=p=>{const s=statSync(p,{bigint:true});assert(s.isFile(),'Source is not a file '+p);return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');};
 function hash(path){const p=resolve(root,path),before=stamp(p),old=cache.get(p);if(old){assert.equal(before,old.stamp,'Source changed within audit '+p);reuses++;return old.hash;}
  const bytes=readFileSync(p),h=createHash('sha256').update(bytes).digest('hex');assert.equal(stamp(p),before,'Source changed while hashing '+p);cache.set(p,{stamp:before,hash:h});bytesRead+=bytes.length;return h;
 }
 function assertStable(){for(const[p,v]of cache)assert.equal(stamp(p),v.stamp,'Source changed before audit finished '+p);}
 return{hash,assertStable,stats:()=>({unique_files_hashed:cache.size,repeated_hash_reads_avoided:reuses,actual_source_bytes_read:bytesRead})};
}
