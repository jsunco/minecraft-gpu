import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{resolve}from'node:path';import{fileURLToPath}from'node:url';
import{makeAluMacroFeedback}from'../../../../hardware/full-gpu-alu-macro-feedback.mjs';
import{makeAluLoopFeedback}from'../../../../hardware/full-gpu-alu-loop-feedback.mjs';
import{makeAluQualifiedFeedback}from'../../../../hardware/full-gpu-alu-qualified-feedback.mjs';
import{makeAluInitializedFeedback}from'../../../../hardware/full-gpu-alu-initialized-feedback.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url)),prefix='artifacts/full-gpu-layout-v1/alu-control/',read=p=>readFileSync(resolve(root,p)),sha=p=>createHash('sha256').update(read(p)).digest('hex'),enc=v=>JSON.stringify(v,null,2)+'\n';
export function prepare({check=false}={}){
 const stages=[['macro-feedback-v1','full-gpu-alu-macro-feedback',makeAluMacroFeedback],['loop-feedback-v1','full-gpu-alu-loop-feedback',makeAluLoopFeedback],['qualified-feedback-v1','full-gpu-alu-qualified-feedback',makeAluQualifiedFeedback],['initialized-feedback-v1','full-gpu-alu-initialized-feedback',makeAluInitializedFeedback]],parent=prefix+'conditional-v1/source-manifest.json',old=JSON.parse(read(parent));
 for(const[p,h]of Object.entries(old.source_sha256))assert.equal(sha(p),h,p);
 const files=[...Object.keys(old.source_sha256),parent,...stages.flatMap(([dir,src])=>['hardware/'+src+'.mjs',prefix+dir+'/design.json',prefix+dir+'/check-routing.py']),...['README.md','prepare.mjs','check-logic.mjs','checks.json'].map(n=>prefix+'initialized-feedback-v1/'+n)];let final;
 for(const[dir,,make]of stages){const d=make();assert.deepEqual(d,JSON.parse(read(prefix+dir+'/design.json')),dir);final=d;}
 const result={status:'offline_connected_internal_ALU_controller_feedback',source_sha256:Object.fromEntries([...new Set(files)].map(p=>[p,sha(p)])),metrics:final.metrics,stages:stages.map(([dir])=>({directory:prefix+dir,metrics:JSON.parse(read(prefix+dir+'/design.json')).metrics})),native_calls:0,native_acceptance:false,independent_review:false,complete_controller:false,missing:final.missing};
 const p=prefix+'initialized-feedback-v1/source-manifest.json';if(check)assert.equal(read(p).toString(),enc(result));else writeFileSync(resolve(root,p),enc(result));return{manifest_sha256:sha(p),source_pins:Object.keys(result.source_sha256).length,...final.metrics};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepare({check:process.argv.includes('--check')})));
