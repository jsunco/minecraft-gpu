import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=dirname(fileURLToPath(import.meta.url)),root=resolve(base,'../../..'),files=new Set();
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function collect(p){p=resolve(p);if(files.has(p))return;assert(p.startsWith(root+'/'));files.add(p);if(!p.endsWith('.mjs'))return;for(const m of readFileSync(p,'utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))collect(resolve(dirname(p),m[1]));}
for(const name of ['prepare.mjs','routes.json','design.json','check.mjs','checks.json','check-boundaries.mjs','boundary-checks.json','bind-memory.mjs','memory-bindings.json','README.md','prepare-manifest.mjs'])collect(resolve(base,name));
const parents={};
for(const name of ['control-start-other-v1','control-lsu-v2']){
 const p=resolve(base,'..',name,'source-manifest.json'),manifest=JSON.parse(readFileSync(p));parents[name]=sha(p);collect(p);
 for(const [rel,h]of Object.entries(manifest.source_sha256)){const f=resolve(root,rel);assert.equal(sha(f),h,'Parent source changed '+rel);collect(f);}
 collect(resolve(base,'..',name,'design.json'));
}
for(const name of ['memory/channel-payload-v1/design.json','memory/consumer-drain-v1/design.json','memory/consumer-drain-v1/source-manifest.json'])collect(resolve(base,'..',name));
collect(resolve(root,'reference/tiny-gpu/src/lsu.sv'));
const source_sha256=Object.fromEntries([...files].sort().map(p=>[relative(root,p),sha(p)])),result={status:'source_bound_four_lsu_core_attachment',source_sha256,parent_manifests:parents,native_acceptance:false,independent_review:false,complete_memory_interconnect:false,complete_core_reset:false};
const target=resolve(base,'source-manifest.json');if(process.argv.includes('--check'))assert.deepEqual(result,JSON.parse(readFileSync(target)));else writeFileSync(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({files:files.size,sha256:sha(target)}));
