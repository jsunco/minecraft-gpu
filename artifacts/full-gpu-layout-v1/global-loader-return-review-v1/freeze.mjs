import assert from'node:assert/strict';
import{readFileSync,writeFileSync,readdirSync,existsSync}from'node:fs';
import{fileURLToPath}from'node:url';
import{relative,join}from'node:path';
import{makeSourcePinHasher}from'../../../scripts/source-pin-hasher.mjs';
const H=fileURLToPath(new URL('./',import.meta.url)),ROOT=fileURLToPath(new URL('../../../',import.meta.url)),target=join(H,'source-manifest.json'),hasher=makeSourcePinHasher(ROOT),read=p=>JSON.parse(readFileSync(p)),pinset={};
function merge(pins){for(const[p,h]of Object.entries(pins)){assert(!pinset[p]||pinset[p]===h,'Conflicting source identity '+p);pinset[p]=h;}}
function verify(pins){for(const[p,h]of Object.entries(pins))assert.equal(hasher.hash(p),h,p);hasher.assertStable();}
if(process.argv.includes('--check')){const m=read(target);verify(m.source_sha256);console.log(JSON.stringify({status:'independent_review_pins_passed',manifest_sha256:hasher.hash(target),pins:Object.keys(m.source_sha256).length,...hasher.stats()}));process.exit(0);}
assert(!existsSync(target),'Frozen review already exists');
const receipt=read(join(H,'receipt.json')),ledger=read(join(H,'ledger-receipt.json'));
assert.equal(receipt.primary.total_cells,2138720);assert.equal(receipt.compatibility.total_cells,2188176);assert.equal(receipt.retained_body_cells,102);assert.equal(receipt.stores.length,5);assert.equal(receipt.original.joint_cases.length,32);assert.equal(receipt.current.joint_cases,32);assert.equal(receipt.current.minimum_rear,5);assert.equal(receipt.mutations.length,172);assert.equal(ledger.metrics.changed_records,6);assert.equal(ledger.metrics.wrong_bindings_refused,23);
for(const[n,h]of[
 ['artifacts/full-gpu-layout-v1/global-loader-return-v1/source-manifest.json','3eac886044516ba07fefb591ec0e16e59d382bdce4086dda69cb6ae30d27af07'],
 ['artifacts/full-gpu-layout-v1/memory/fabric-colocation-v2/bank-ready-collectors-v1/source-manifest.json','aa2eac00ab251ce74a650451a4c97fdeadf636effcf176a0d9fbc5ebd70b5125']]){assert.equal(hasher.hash(n),h);merge(read(join(ROOT,n)).source_sha256);merge({[n]:h});}
merge(receipt.source_sha256);merge(ledger.source_sha256);
for(const n of readdirSync(H).sort()){const p=join(H,n);if(p===target)continue;merge({[relative(ROOT,p)]:hasher.hash(p)});}
merge({'scripts/source-pin-hasher.mjs':hasher.hash('scripts/source-pin-hasher.mjs')});verify(pinset);
const manifest={status:'frozen_independent_actual_global_loader_return_review',primary:receipt.primary,compatibility:receipt.compatibility,retained_body_cells:102,retained_stores:5,original_context_cells:receipt.original.actual_context_cells,original_and_current_joint_cases_each:32,observations_each:224,new_repeaters:165,minimum_rear:5,actual_mutations:172,ledger_metrics:ledger.metrics,source_sha256:Object.fromEntries(Object.entries(pinset).sort(([a],[b])=>a.localeCompare(b))),limits:[...receipt.limits,...ledger.limits],native_acceptance:false};
writeFileSync(target,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({status:'frozen_independent_review',manifest_sha256:hasher.hash(target),receipt_sha256:hasher.hash(join(H,'receipt.json')),ledger_receipt_sha256:hasher.hash(join(H,'ledger-receipt.json')),pins:Object.keys(pinset).length,...hasher.stats()}));
