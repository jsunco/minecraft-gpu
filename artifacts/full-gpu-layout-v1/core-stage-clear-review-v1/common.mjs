// Independent bounded review: direct source loading, actual cold context,
// complete input differential, and a separate directed-network strength solver.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z),W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},solid=b=>b?.id.endsWith('_concrete');
function bytes(n,expected){const p=new URL(n,H),b=readFileSync(p),h=createHash('sha256').update(b).digest('hex');if(expected)assert.equal(h,expected,n);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=h;return b;}
const read=(n,h)=>JSON.parse(bytes(n,h)),write=(n,v)=>writeFileSync(new URL(n,H),JSON.stringify(v,null,2)+'\n');
function insert(map,rows,{same=false}={}){for(const r of rows){const k=K(r.position);if(map.has(k)){assert(same,'Duplicate cell '+k);assert.deepEqual(map.get(k),r.block);}else map.set(k,r.block);}}
function scanBlocks(buffer,visit){const at=buffer.indexOf(Buffer.from('"blocks"'));assert(at>=0);let i=buffer.indexOf(91,at+8)+1,start=i,depth=0,quoted=false,escape=false,batch=0,count=0;const flush=end=>{const part=buffer.subarray(start,end).toString();if(part.trim())for(const r of JSON.parse('['+part+']')){visit(r);count++;}};for(;i<buffer.length;i++){const c=buffer[i];if(quoted){if(escape)escape=false;else if(c===92)escape=true;else if(c===34)quoted=false;continue;}if(c===34){quoted=true;continue;}if(c===93&&depth===0){flush(i);return count;}if(c===123||c===91)depth++;else if(c===125||c===93)depth--;else if(c===44&&depth===0&&++batch===4096){flush(i);start=i+1;batch=0;}}throw Error('Unterminated blocks');}
export {H,ROOT,pins,P,K,A,W,R,C,T,WT,D,solid,bytes,read,write,insert,scanBlocks};
