import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{iterateObstacles,shaFile,inside,sourceBindings}from'../floorplan-v3/obstacles.mjs';
const H=new URL('.',import.meta.url),P='artifacts/full-gpu-layout-v1/',read=p=>JSON.parse(readFileSync(P+p)),config=JSON.parse(readFileSync(new URL('parents.json',H))),pins=await sourceBindings();
for(const name of[config.memory,...config.extras]){const m=read(name+'/source-manifest.json');for(const[p,h]of Object.entries(m.files??m.source_sha256??m.pins)){assert(!pins[p]||pins[p]===h,p);pins[p]=h;}pins[P+name+'/source-manifest.json']=await shaFile(P+name+'/source-manifest.json');}
for(const[p,h]of Object.entries(pins))assert.equal(await shaFile(p),h,p);
const bounds=config.bounds,palette=[],pal=new Map(),instances=[],ids=new Map(),cells=[],counts={};
function add(v){if(!inside(v.position,bounds))return;if(!ids.has(v.instance)){ids.set(v.instance,instances.length);instances.push({name:v.instance});}const b=JSON.stringify(v.block);if(!pal.has(b)){pal.set(b,palette.length);palette.push(v.block);}const{x,y,z}=v.position;cells.push([x,y,z,pal.get(b),ids.get(v.instance)]);counts[v.instance]=(counts[v.instance]??0)+1;}
for await(const v of iterateObstacles({bounds,verify:false}))if(v.instance!=='loader')add(v);
for(const name of[config.memory,...config.extras])for(const v of read(name+'/design.json').blocks)add({...v,instance:name});
writeFileSync(new URL('obstacles.json',H),JSON.stringify({status:'source_bound_bank_quiet_corridor',bounds,all_y:true,palette,instances,cells,counts,cell_count:cells.length,source_sha256:pins,config_sha256:await shaFile(P+'master-bank-quiet-routes-v1/parents.json'),native_acceptance:false})+'\n');console.log(JSON.stringify({cells:cells.length,counts}));
