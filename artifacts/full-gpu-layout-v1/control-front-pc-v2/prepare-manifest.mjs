import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=dirname(fileURLToPath(import.meta.url)),root=resolve(base,'../../..'),files=new Set();
function collect(p){p=resolve(p);if(files.has(p))return;assert(p.startsWith(root+'/'));files.add(p);if(!p.endsWith('.mjs'))return;for(const m of readFileSync(p,'utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))collect(resolve(dirname(p),m[1]));}
for(const p of ['prepare.mjs','check.mjs','prepare-manifest.mjs','README.md','design.json','checks.json'])collect(resolve(base,p));
for(const [dir,names] of Object.entries({'control-front-pc-v1':['design.json','pc-paths.json','README.md','source-manifest.json'],'control-nextpc-v1':['branch-lane.json'],'control-nextpc-v2':['design.json','README.md','source-manifest.json']}))for(const name of names)collect(resolve(base,'../'+dir,name));
collect(resolve(base,'../control/ERRATA.md'));
const source_sha256=Object.fromEntries([...files].sort().map(p=>[relative(root,p),createHash('sha256').update(readFileSync(p)).digest('hex')]));
const r={status:'source_bound_offline_front_pc_nzp_target_routes',source_sha256,native_acceptance:false,independent_review:false,selected_density_layout:false,scope:'Connected retained frontend/IR/PC plus independent lane NZP, branch masks/predicates and target-value agreement. CMP/reset inputs, qualified flag/PC OPEN, retained fault and UPDATE closure/drain remain missing.'};
const p=resolve(base,'source-manifest.json');if(process.argv.includes('--check'))assert.deepEqual(r,JSON.parse(readFileSync(p)));else writeFileSync(p,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({files:files.size,sha256:createHash('sha256').update(readFileSync(p)).digest('hex')}));
