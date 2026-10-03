import{readFileSync,writeFileSync}from'node:fs';
const P='artifacts/full-gpu-layout-v1/',read=p=>JSON.parse(readFileSync(P+p)),K=p=>`${p.x},${p.y},${p.z}`;
const d=read('control-reset-final-v1/design.json'),map=new Map(d.blocks.map(v=>[K(v.position),v])),owners=new Map();
for(const name of ['control-reset-zero-v1','control-reset-epoch-v1','control-reset-final-v1'])for(const c of read(name+'/design.json').blocks)if(c.part!=='base')owners.set(K(c.position),{package:name,part:c.part});
const collisions=[];for(const name of Object.keys(read('master-final-core-composition-v1/frame-config.json').route_deltas)){const delta=read(name+'/design.json');for(let core=0;core<2;core++)for(const b of delta.blocks){const p={x:b.position.x+400,y:b.position.y,z:b.position.z+1552+core*1520},v=map.get(K(p));if(v)collisions.push({core,position:b.position,local:p,core_block:v.block,core_owner:owners.get(K(p)),master_package:name,master_part:b.part,master_block:b.block});}}
const groups={};for(const x of collisions){const k=[x.core_owner?.package,x.core_owner?.part,x.master_package,x.master_part].join(' / ');groups[k]=(groups[k]??0)+1;}
writeFileSync(new URL('collision-ownership.json',import.meta.url),JSON.stringify({collisions,groups},null,2)+'\n');console.log(JSON.stringify({count:collisions.length,groups},null,2));
