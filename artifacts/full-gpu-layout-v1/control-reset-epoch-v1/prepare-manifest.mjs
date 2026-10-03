import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=dirname(fileURLToPath(import.meta.url)),root=resolve(base,'../../..'),files=new Set();
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function collect(p){p=resolve(p);if(files.has(p))return;assert(p.startsWith(root+'/'));files.add(p);if(!p.endsWith('.mjs'))return;for(const m of readFileSync(p,'utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))collect(resolve(dirname(p),m[1]));}
for(const name of ['prepare.mjs','routes.json','design.json','check.mjs','checks.json','README.md','timing-obligations.json','prepare-manifest.mjs'])collect(resolve(base,name));
const parents={};
for(const name of ['control-reset-zero-v1']){
 const p=resolve(base,'..',name,'source-manifest.json'),manifest=JSON.parse(readFileSync(p));parents[name]=sha(p);collect(p);
 for(const [rel,h]of Object.entries(manifest.source_sha256??manifest.files)){const f=resolve(root,rel);assert.equal(sha(f),h,'Parent source changed '+rel);collect(f);}
}
const source_sha256=Object.fromEntries([...files].sort().map(p=>[relative(root,p),sha(p)])),design=JSON.parse(readFileSync(resolve(base,'design.json'))),result={status:'source_bound_narrow_control_epoch_zero_transfer_candidate',source_sha256,parent_manifests:parents,blocks:design.blocks.length,retained_bits:design.metrics.retained_bits,native_acceptance:false,independent_review:false,complete_reset_service:false,complete_core_reset:false};
const target=resolve(base,'source-manifest.json');if(process.argv.includes('--check'))assert.deepEqual(result,JSON.parse(readFileSync(target)));else writeFileSync(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({files:files.size,sha256:sha(target)}));
