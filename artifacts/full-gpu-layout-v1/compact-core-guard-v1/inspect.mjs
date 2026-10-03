// Extract the actual complete owner/commit product matrix and current cables.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,readdirSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
import{readLargeDesign}from'../../../hardware/memory-layout-large-json-v2.mjs';import{makeControlMatrix}from'../control-commit-v2/matrix.mjs';
const B=new URL('../',import.meta.url),P=(x,y,z)=>({x,y,z}),K=p=>[p.x,p.y,p.z].join(','),add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),sha=n=>createHash('sha256').update(readFileSync(new URL(n,B))).digest('hex');
const parent='compact-core-fault-v1/design.json',current=readLargeDesign(fileURLToPath(new URL(parent,B))),actual=new Map(current.blocks.map(v=>[K(v.position),v])),local=makeControlMatrix(),origin=P(300,180,-740),cells=local.blocks.map(v=>({...v,position:add(v.position,origin)})),component=new Set(cells.map(v=>K(v.position)));
for(const v of cells)assert.deepEqual(actual.get(K(v.position))?.block,v.block,'Changed primitive '+K(v.position));
const filenames=['control-commit-v2/routes.json',...readdirSync(B,{withFileTypes:true}).filter(v=>v.isDirectory()&&v.name!=='control-commit-v2'&&existsSync(new URL(v.name+'/routes.json',B))).map(v=>v.name+'/routes.json')];
const connections=[],seen=new Set,sourceFiles=new Set([parent,'control-commit-v2/matrix.mjs','control-commit-v2/terms.mjs']),rejected=[],cut=[];
for(const file of filenames){const data=JSON.parse(readFileSync(new URL(file,B))),rows=Array.isArray(data)?data:Object.entries(data).map(([name,v])=>({name,...v}));
 for(const row of rows){if(!row.path||!row.source||!row.destination)continue;let r=structuredClone(row);if(!component.has(K(r.source))&&!component.has(K(r.destination)))continue;
  // The later actual ALU-request subtract gate remains fixed. End the new
  // cable at its held input wire instead of deleting that newer qualifier.
  if(r.name==='held_alu_request'){
   const destination=P(1400,-37,10),i=r.path.findIndex(p=>K(p)===K(destination));assert(i>=2);cut.push({name:r.name,original_destination:r.destination,new_destination:destination,fixed_qualifier:P(1402,-37,10)});r.destination=destination;r.path=r.path.slice(0,i-1);
  }
  const missing=r.path.filter(p=>!['minecraft:redstone_wire','minecraft:repeater'].includes(actual.get(K(p))?.block.id));if(missing.length){rejected.push({file,name:r.name,missing_points:missing.length});continue;}
  const signature=JSON.stringify([r.source,r.destination,r.path]);if(seen.has(signature))continue;seen.add(signature);
  const mid=(a,b)=>P((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2),tap=mid(r.source,r.path[0]),arrival=mid(r.destination,r.path.at(-1));assert([tap,arrival].every(p=>['x','y','z'].every(a=>Number.isInteger(p[a]))),'Non-simple endpoint '+file+' '+r.name);
  assert.equal(actual.get(K(r.source))?.block.id,'minecraft:redstone_wire');assert.equal(actual.get(K(r.destination))?.block.id,'minecraft:redstone_wire');
  sourceFiles.add(file);connections.push({...r,tap,arrival,source_file:file,points:r.path.length,source_is_component:component.has(K(r.source)),destination_is_component:component.has(K(r.destination)),source_moves_with_cluster:component.has(K(r.source)),destination_moves_with_cluster:component.has(K(r.destination))});
 }
}
assert(new Set(connections.map(v=>v.name)).size===connections.length,'Ambiguous cable names');
const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...cells.map(v=>v.position[a]));box.to[a]=Math.max(...cells.map(v=>v.position[a]));}
const out={status:'extracted_complete_guard_matrix_not_relocated',parent_component:'compact-core-fault-v1',reference_origin:origin,source_sha256:Object.fromEntries([...sourceFiles].map(n=>['artifacts/full-gpu-layout-v1/'+n,sha(n)])),cluster_cells:cells,cluster_box:box,cluster_cell_mismatches:[],connections,protected_source_prefixes:[],protected_destination_suffixes:[],rejected_historical_paths:rejected,preserved_later_qualifiers:cut,complete_gpu_layout:false,native_acceptance:false};
writeFileSync(new URL('extraction.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({cluster_cells:cells.length,connections:connections.length,selected_routes:connections.map(v=>({name:v.name,file:v.source_file,points:v.path.length})),rejected,cut}));
