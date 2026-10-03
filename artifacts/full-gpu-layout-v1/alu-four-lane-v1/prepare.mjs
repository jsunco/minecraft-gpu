import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';import{resolve}from'node:path';
import{makeAluCommandEscapes}from'../../../hardware/full-gpu-alu-command-escape.mjs';
import{makeAluLaneConnectors}from'../../../hardware/full-gpu-alu-lane-connectors.mjs';
import{makeAluFourLaneStatus}from'../../../hardware/full-gpu-alu-four-lane-status.mjs';
import{makeAluCommandLaunch}from'../../../hardware/full-gpu-alu-command-launch.mjs';
import{makeAluWChoiceFanout}from'../../../hardware/full-gpu-alu-w-choice-fanout.mjs';
import{makeAluFourLaneStatusSameHeight}from'../../../hardware/full-gpu-alu-four-lane-status-same-height.mjs';
import{makeAluWChoiceFanoutSameHeight}from'../../../hardware/full-gpu-alu-w-choice-fanout-same-height.mjs';
import{makeAluFourLaneStatusHeightMatched}from'../../../hardware/full-gpu-alu-four-lane-status-height-matched.mjs';
import{makeAluWChoiceFanoutHeightMatched}from'../../../hardware/full-gpu-alu-w-choice-fanout-height-matched.mjs';
import{makeAluOneHotWord}from'../../../hardware/full-gpu-alu-one-hot-word.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),prefix='artifacts/full-gpu-layout-v1/alu-four-lane-v1/',read=p=>readFileSync(resolve(root,p)),json=p=>JSON.parse(read(p)),sha=p=>createHash('sha256').update(read(p)).digest('hex'),enc=v=>JSON.stringify(v,null,2)+'\n';
const generated=[['receiving-draft',makeAluCommandEscapes],['lane-connectors',makeAluLaneConnectors],['status-draft',makeAluFourLaneStatus],['command-launch-draft',makeAluCommandLaunch],['w-choice-fanout-draft',makeAluWChoiceFanout],['status-same-height',makeAluFourLaneStatusSameHeight],['w-choice-same-height',makeAluWChoiceFanoutSameHeight],['status-height-matched',makeAluFourLaneStatusHeightMatched],['w-choice-height-matched',makeAluWChoiceFanoutHeightMatched],['one-hot-word-comparison',makeAluOneHotWord]];
export function prepare({check=false}={}){
 for(const[name,fn]of generated)assert.deepEqual(fn(),json(prefix+name+'.json'),'Regenerate '+name);
 const parents=['artifacts/full-gpu-layout-v1/alu-v5/source-manifest.json','artifacts/full-gpu-layout-v1/alu-control/initialized-feedback-v1/source-manifest.json','artifacts/full-gpu-layout-v1/control-event-gates-v1/source-manifest.json'],files=new Set(parents);
 for(const parent of parents)for(const[p,h]of Object.entries(json(parent).source_sha256)){assert.equal(sha(p),h,'Frozen parent '+p);files.add(p);}
 for(const n of ['command-escape','lane-connectors','four-lane-status','command-launch','w-choice-fanout','four-lane-status-same-height','w-choice-fanout-same-height','four-lane-status-height-matched','w-choice-fanout-height-matched','one-hot-word'])files.add('hardware/full-gpu-alu-'+n+'.mjs');
 for(const n of ['README.md','prepare.mjs','check-all.mjs','checks.json','check-receiving.py','check-lane-connectors.py','check-status.py','check-command-launch.py','check-w-choice.py','check-status-same-height.py','check-w-choice-same-height.py','check-status-height-matched.py','check-w-choice-height-matched.py','check-one-hot-word.py','check-one-hot-logic.mjs','check-corruptions.py',...generated.map(([n])=>n+'.json')])files.add(prefix+n);
 files.add('artifacts/full-gpu-layout-v1/alu-v5/independent-status-review.json');
 const placement_comparison=['w-choice-fanout-draft','w-choice-same-height','w-choice-height-matched'].map(name=>{const d=json(prefix+name+'.json');return{name,metrics:d.metrics,box:d.box,descent_blocks:d.descents.reduce((n,v)=>n+v.blocks,0)};});
 const manifest={status:'offline_four_lane_status_and_six_command_connection_checkpoint_not_complete_ALU',source_sha256:Object.fromEntries([...files].sort().map(p=>[p,sha(p)])),current_candidate:prefix+'w-choice-height-matched.json',placement_comparison,one_hot_matched_portion:json(prefix+'one-hot-word-comparison.json').metrics,required_shared_commands:41,connected_shared_commands:6,remaining_shared_commands:35,physical_lane_receivers_connected:24,physical_data_open_masks_complete:false,core_response_routes_complete:false,native_calls:0,native_acceptance:false,independent_full_geometry_review:false,missing:json(prefix+'w-choice-height-matched.json').missing};
 const path=prefix+'source-manifest.json';if(check)assert.equal(read(path).toString(),enc(manifest));else writeFileSync(resolve(root,path),enc(manifest));return{manifest_sha256:sha(path),source_pins:files.size,blocks:placement_comparison.at(-1).metrics.blocks,connected_commands:6,remaining_commands:35};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepare({check:process.argv.includes('--check')})));
