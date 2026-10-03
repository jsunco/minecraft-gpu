import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const prior='artifacts/full-gpu-layout-v1/master-program-request-v1/',base=JSON.parse(readFileSync(prior+'obstacles.json')),a=JSON.parse(readFileSync(prior+'design.json')),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const pmap=new Map(base.palette.map((v,i)=>[JSON.stringify(v),i])),id=base.instances.length;
base.instances.push({name:'master_program_request'});
base.counts.master_program_request=0;
for(const v of a.blocks){const {x,y,z}=v.position;assert(x>=base.bounds.x[0]&&x<=base.bounds.x[1]&&z>=base.bounds.z[0]&&z<=base.bounds.z[1]);const key=JSON.stringify(v.block);if(!pmap.has(key)){pmap.set(key,base.palette.length);base.palette.push(v.block);}base.cells.push([x,y,z,pmap.get(key),id]);base.counts.master_program_request++;}
for(const f of ['source-manifest.json','design.json','obstacles.json'])base.source_sha256[prior+f]=hash(prior+f);
base.cell_count=base.cells.length;base.status='actual_parent_and_previous_control_address_request_route_obstacles';
writeFileSync(new URL('./obstacles.json',import.meta.url),JSON.stringify(base)+'\n');console.log(JSON.stringify({cells:base.cell_count,counts:base.counts}));
