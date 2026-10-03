import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),prefix='artifacts/full-gpu-layout-v1/memory/fabric-colocation-v2/',read=n=>JSON.parse(readFileSync(new URL(n,H))),hash=p=>createHash('sha256').update(readFileSync(new URL(p,ROOT))).digest('hex');
const d=read('raw-local-design.json'),c=read('raw-local-checks.json'),oldPorts=read('direct-bodies.json').ports,rawPath='artifacts/full-gpu-layout-v1/memory/channel-payload-v1/design.json',raw=JSON.parse(readFileSync(new URL(rawPath,ROOT))),K=p=>`${p.x},${p.y},${p.z}`,map=new Map(d.blocks.map(v=>[K(v.position),v.block]));
assert.equal(c.status,'raw_and_local_static_checks_passed');assert.equal(c.dags.length,544);assert.equal(c.localDags.length,64);assert.equal(c.minimumRear,4);assert.equal(c.feedback.length,0);assert.equal(d.metrics.cells,451976);
const ports={};for(const[name,p]of Object.entries(oldPorts)){ports[name]={...p,positions:p.positions.map(q=>({...q,z:q.z-(name.includes('.lookup.')?120:0)}))};}
for(const name of['read_valid','write_valid','read_address','write_address','write_data'])ports['raw.'+name]={...raw.ports[name],positions:raw.ports[name].positions.map(p=>({x:p.x+40,y:p.y-76,z:p.z-20}))};
for(const p of Object.values(ports))for(const pos of p.positions)assert(map.has(K(pos)),'Missing physical port '+K(pos));
assert.equal(['read_valid','write_valid','read_address','write_address','write_data'].reduce((n,k)=>n+ports['raw.'+k].positions.length,0),208);
writeFileSync(new URL('raw-local-ports.json',H),JSON.stringify({status:'actual_partial_component_ports_not_external_delivery',ports,raw_fields:raw.fields,proposed_y_translation:16,limits:c.limits},null,2)+'\n');
const source_sha256={...read('raw-shared-source-manifest.json').source_sha256};source_sha256[prefix+'raw-shared-source-manifest.json']=hash(prefix+'raw-shared-source-manifest.json');
for(const [p,h]of Object.entries(c.source_sha256)){assert.equal(hash(prefix+p),h);source_sha256[prefix+p]=h;}
for(const n of['raw-local-checks.json','raw-local-ports.json','RAW_LOCAL.md','freeze-raw-local.mjs'])source_sha256[prefix+n]=hash(prefix+n);
for(const[p,h]of Object.entries(source_sha256))assert.equal(hash(p),h);
writeFileSync(new URL('raw-local-source-manifest.json',H),JSON.stringify({status:'source_frozen_partial_joined_raw_local_checkpoint',source_sha256,metrics:d.metrics,matched_cost:{old:485272,new:451976,saving:33296,body_saving:36688,additional_transport:3392},limits:c.limits,complete_fabric:false,selected:false,native_acceptance:false},null,2)+'\n');console.log(JSON.stringify({sha256:hash(prefix+'raw-local-source-manifest.json'),pins:Object.keys(source_sha256).length,...d.metrics}));
