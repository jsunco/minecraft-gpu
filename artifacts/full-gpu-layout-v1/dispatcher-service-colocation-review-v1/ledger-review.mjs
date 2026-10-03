// Independent exact preservation of cut records and named endpoint identities.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},K=p=>`${p.x},${p.y},${p.z}`;
function read(n,expected){const p=new URL(n,H),bytes=readFileSync(p),sha=createHash('sha256').update(bytes).digest('hex');if(expected)assert.equal(sha,expected);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=sha;return JSON.parse(bytes);}
const original=read('../dispatch-global-colocation-v8-dcr-cold-v1/remaining-ledger.json'),service=read('../loader-program-colocation-v1/service-payload-open-delivery-v1/remaining-cuts.json'),updated=read('../dispatcher-service-colocation-v1/remaining-cuts.json'),endpoints=read('../dispatcher-service-colocation-v1/endpoint-map.json'),placement=read('../dispatcher-service-colocation-v1/placement.json'),parent=read('../dispatch-global-colocation-v8-dcr-cold-v1/connected-candidate.json'),delta=read('../dispatcher-service-colocation-v1/delta.json');
read('../dispatcher-service-colocation-v1/source-manifest.json','66621512048ed090908e19980f99033b2d5fb99e83df21106af31dbcbcdba2d0');
const byOld=new Map(parent.blocks.filter(v=>v.original_position).map(v=>[K(v.original_position),v])),add=p=>Object.fromEntries(['x','y','z'].map(a=>[a,p[a]+placement.translation[a]])),changed=[];
for(const [field,size,selected]of [['transfers',352,291],['effective_cut_ledger',661,501],['direct_foreign_boundaries',48,-1]]){
 assert.equal(updated.dispatch[field].length,size);assert.equal(original[field].length,size);
 for(let i=0;i<size;i++){const before=original[field][i],after=updated.dispatch[field][i];for(const [key,value]of Object.entries(before)){if(i===selected&&['status','reconciliation'].includes(key))continue;assert.deepEqual(after[key],value,field+'/'+i+'/'+key);}
  if(before.status!==after.status){assert.equal(i,selected);changed.push({ledger:field,index:i,before:before.status,after:after.status});}
  for(const side of ['source','target']){const row=byOld.get(K(before[side])),fieldName='shared_retained_'+side;if(row)assert.deepEqual(after[fieldName],add(row.position));else assert.equal(after[fieldName],undefined);}
 }
}
assert.deepEqual(changed.map(r=>[r.ledger,r.index]),[['transfers',291],['effective_cut_ledger',501]]);
const c=delta.connections[0],transfer=updated.dispatch.transfers[291],cut=updated.dispatch.effective_cut_ledger[501];
for(const row of [transfer,cut]){assert.deepEqual(row.shared_actual_producer,c.root);assert.deepEqual(row.shared_target,c.destination);assert.equal(row.shared_route,c.name);}
assert.deepEqual(transfer.shared_arrival_normalizer,c.normalizer);assert.deepEqual(cut.shared_source,c.normalizer);
assert.equal(updated.dispatch.transfers.filter(r=>r.status==='external_source_transfer_pending').length,17);
for(const key of Object.keys(service))if(!['quiet_fanout','source_sha256'].includes(key))assert.deepEqual(updated.service[key],service[key],key);
assert.deepEqual(updated.service.quiet_fanout.shared_bound_global_target,c.destination);assert.deepEqual(updated.service.quiet_fanout.shared_bound_global_arrival,c.normalizer);assert.equal(updated.service.quiet_fanout.global_delivery_status,'actual_matrix_to_sampler_transport_checked_source_witness_closure_pending');assert.deepEqual(updated.service.quiet_fanout.historical_global_original_target,service.quiet_fanout.pending_global_original_target);
assert.equal(updated.service.counts.witness_input_bound_total,16);assert.equal(updated.service.counts.witness_input_pending,21);
assert.equal(endpoints.named_ports.length,108);const identities=new Set();for(const p of endpoints.named_ports){const row=byOld.get(K(p.original_master_position));assert(row);assert.deepEqual(row.position,p.local_position);assert.deepEqual(add(row.position),p.shared_position);assert.deepEqual(row.block,p.block);const id=[p.original_instance,p.port,p.bit,K(p.original_master_position)].join('/');assert(!identities.has(id));identities.add(id);}
const self=new URL('ledger-review.mjs',H);pins[fileURLToPath(self).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(readFileSync(self)).digest('hex');
const report={status:'passed_exact_cut_and_named_port_reconciliation',metrics:{transfer_records:352,effective_cut_records:661,direct_foreign_records:48,status_changes:changed.length,named_ports:108,incoming_transfers_remaining:17,witness_inputs_bound:16,witness_inputs_pending:21},changed,source_sha256:pins,limits:['Only transfer291/cut501 closes. The other direct foreign records and every service input/control ledger remain byte-equivalent as structured data.','Exact named body endpoints are not cable delivery or timing proof.']};writeFileSync(new URL('ledger-receipt.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.metrics));
