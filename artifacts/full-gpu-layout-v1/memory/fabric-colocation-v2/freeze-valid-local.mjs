import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),prefix='artifacts/full-gpu-layout-v1/memory/fabric-colocation-v2/';
const read=n=>JSON.parse(readFileSync(new URL(n,H))),hash=p=>createHash('sha256').update(readFileSync(new URL(p,ROOT))).digest('hex');
const c=read('joined-valid-local-checks.json');
assert.equal(c.status,'joined_raw_valid_local_static_checks_passed');
for(const [k,n]of[['dags',544],['validDags',64],['localDags',64],['directDags',32]])assert.equal(c[k].length,n);
for(const k of['bad','lost','missing','supports','weakRears','feedback','dagFailures','validDagFailures'])assert.equal(c[k].length,0,k);
assert.equal(c.minimumRear,4);assert.equal(c.metrics.cells,485408);assert.equal(c.metrics.actual_connections,704);assert.equal(c.kept,c.oldEdges);assert.equal(c.conditional_external_input_power.actual_master_delivery,false);
const source_sha256={...read('raw-shared-source-manifest.json').source_sha256};
for(const[p,h]of Object.entries(c.source_sha256)){assert.equal(hash(prefix+p),h,p);source_sha256[prefix+p]=h;}
for(const p of['joined-valid-local-checks.json','JOINED_VALID_LOCAL.md','freeze-valid-local.mjs'])source_sha256[prefix+p]=hash(prefix+p);
for(const[p,h]of Object.entries(source_sha256))assert.equal(hash(p),h,p);
const result={status:'source_frozen_partial_704_connection_geometry',source_sha256,metrics:c.metrics,matched_cost:{old:547912,new:485408,saving:62504,old_body:213196,new_body:176508,old_transport:334716,new_transport:308900},conditional_external_input_power:c.conditional_external_input_power,limits:c.limits,complete_fabric:false,selected:false,native_acceptance:false};
const name='joined-valid-local-source-manifest.json';
if(process.argv.includes('--check'))assert.deepEqual(read(name),result);else writeFileSync(new URL(name,H),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'source_pins_checked',manifest:name,sha256:hash(prefix+name),pins:Object.keys(source_sha256).length,...c.metrics}));
