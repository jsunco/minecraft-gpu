import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {compose} from './compose.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),sha=n=>createHash('sha256').update(readFileSync(new URL(n,import.meta.url))).digest('hex');
export function makeUnion({plan=false}={}){
 const parents={alu:['alu-core-admission-v1','046ac335a491453e12b8ba52b74d02bc7ad7e676ac606bdd6fe9cbbebed0d839'],lsu:['control-lsu-core-v1','f07ae8837e100520543314c70d5ef84b052eb95588f5827ec1150c59ba81745b']},maps={};
 for(const[n,[dir,pin]]of Object.entries(parents)){
  const file='../'+dir+'/source-manifest.json';assert.equal(sha(file),pin,'Frozen parent manifest '+n);
  const manifest=read(file),key='artifacts/full-gpu-layout-v1/'+dir+'/design.json';assert.equal(sha('../'+dir+'/design.json'),manifest.source_sha256[key],'Frozen parent geometry '+n);maps[n]=read('../'+dir+'/design.json');
 }
 const d=compose(maps.alu,maps.lsu,{plan});d.parents=Object.fromEntries(Object.entries(parents).map(([id,[directory,manifest_sha256]])=>[id,{directory,manifest_sha256,blocks:maps[id].blocks.length}]));
 d.connections=d.repairs;d.columns=[];
 d.inherited_replacements=read('../alu-core-admission-v1/core-replacements.json');
 d.parent_connections={alu:maps.alu.connections.length,lsu:maps.lsu.connections.length,removed_lsu:['source_shared_phase_b','source_shared_initialize']};
 return d;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeUnion({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
