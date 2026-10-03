import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../../../../hardware/memory-layout-large-json-v2.mjs';
import {inputs,active} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
import {symbolicPower} from '../final-architecture-observers-v1/symbolic-power.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H)));
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z),E=(a,b)=>K(a)+'>'+K(b);
assert.equal(createHash('sha256').update(readFileSync(new URL('../final-stage-clear-connected-v1/source-manifest.json',H))).digest('hex'),'a5d1c7f216e1c6263a6c31c691dcaccab1c4cc4e6ff91cdf73253b817d85feb1');
const base=read('repaired-parent-design.json'),prior=read('../final-stage-clear-connected-v1/endpoint-map.json'),reference=read('original-functions.json');
const old=readLargeDesign(fileURLToPath(new URL('../../compact-core-guard-v1/design.json',H))),ow=new Map(old.blocks.map(b=>[K(b.position),b.block])),world=new Map(base.blocks.map(b=>[K(b.position),b.block]));
const mapping={...prior.mapping},gates=[],connections=[],reports=[],addedMappings=[];
function receiverAdapter(tip,lane,bit){
 const sign=bit===2?-1:1,at=(x,y,z=0)=>P(tip.x+sign*x,tip.y+y,tip.z+z),kind=`flags_mask_positive_adapter_${lane}_${bit}`,blocks=[];
 const add=(p,id,properties)=>blocks.push({position:p,block:{id:'minecraft:'+id,...properties?{properties}:{}},part:kind});
 const device=(x,y,id,properties)=>{add(at(x,y-1),'light_gray_concrete');add(at(x,y),id,properties);};
 device(1,0,'repeater',{facing:sign===1?'east':'west',delay:'1'});
 add(at(2,-1),'light_gray_concrete');add(at(2,0),'redstone_torch');
 add(at(2,-3),'light_gray_concrete');add(at(2,-2),'redstone_torch');
 device(1,-3,'repeater',{facing:sign===1?'west':'east',delay:'1'});device(0,-3,'redstone_wire');
 for(const b of blocks)assert(!world.has(K(b.position)),'Adapter collision '+kind+'/'+K(b.position));
 const template=new Map(blocks.map(b=>[K(b.position),b.block]));template.set(K(tip),world.get(K(tip)));template.set(K(P(tip.x,tip.y-1,tip.z)),world.get(K(P(tip.x,tip.y-1,tip.z))));
 const activePoints=[...blocks.filter(b=>active(b.block)).map(b=>b.position),tip],edges=activePoints.flatMap(to=>inputs(template,to).map(from=>({from,to,body:kind}))),model=symbolicPower(template,activePoints,{mask:at(0,-3)});
 for(let k=1;k<=15;k++)assert.equal(model.at(tip)[k],model.bdd.vars[0],'Positive receiver adapter function');
 const neighbors=new Map;for(const b of blocks)for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)>3)continue;const q=P(b.position.x+dx,b.position.y+dy,b.position.z+dz);if(active(world.get(K(q))))neighbors.set(K(q),q);}
 const expected=new Set(edges.map(e=>E(e.from,e.to)));for(const q of neighbors.values())for(const f of inputs(world,q))expected.add(E(f,q));
 for(const b of blocks){world.set(K(b.position),b.block);if(active(b.block))neighbors.set(K(b.position),b.position);}
 const actual=new Set;for(const q of neighbors.values())for(const f of inputs(world,q)){const e=E(f,q);actual.add(e);assert(expected.has(e),'Adapter foreign contact '+kind+'/'+e);}for(const e of expected)assert(actual.has(e),'Adapter lost parent input '+e);
 const g={kind,blocks,edges,ports:{input:at(0,-3),output:tip},two_inversions_positive:true,original_role:'positive_normalized_delivery_into_exact_mask_pad',symbolic_proof:model.summary()};gates.push(g);return g;
}
for(const r of reference.results){
 const p=r.original_comparator,shift=P(r.current_comparator.x-p.x,r.current_comparator.y-p.y,r.current_comparator.z-p.z);
 assert.deepEqual(ow.get(K(p)),world.get(K(r.current_comparator)));assert.equal(inputs(world,r.current_comparator).length,0);
 const points=[P(p.x-2,p.y,p.z),P(p.x-1,p.y,p.z),P(p.x,p.y,p.z+1),P(p.x,p.y,p.z+2)],kind=`flags_input_stubs_${r.lane}_${r.bit}`;
 const transform=(q,reflect)=>{const v=A(q,shift);return reflect&&q.z>p.z?P(v.x,v.y,r.current_comparator.z-(q.z-p.z)):v;};
 const makeBlocks=reflect=>points.flatMap(q=>[P(q.x,q.y-1,q.z),q]).map(original_position=>{
  assert(!mapping[K(original_position)],'Original stub already mapped '+K(original_position));
  const position=transform(original_position,reflect),original_block=ow.get(K(original_position));assert(original_block);
  const reflected=reflect&&original_position.z>p.z,block=reflected&&original_block.properties?.facing?{...original_block,properties:{...original_block.properties,facing:({north:'south',south:'north',east:'east',west:'west'})[original_block.properties.facing]}}:original_block;
  return{original_position,position,block,original_block,mapping_kind:reflected?'reflected_comparator_side_stub_preserving_input_role':'exact_original_translation',part:kind};
 });
 let reflected=false,blocks=makeBlocks(false);const collisions=blocks.filter(b=>world.has(K(b.position)));
 if(collisions.length){writeFileSync(new URL('history/refused-exact-'+kind+'.json',H),JSON.stringify({kind,attempted:blocks,collisions:collisions.map(b=>({position:b.position,existing:world.get(K(b.position))})),resolution:'Reflect only the side-mask stub to the opposite legal comparator side; preserve rear/output and all parent geometry.'},null,2)+'\n');reflected=true;blocks=makeBlocks(true);}
 for(const b of blocks)assert(!world.has(K(b.position)),'Reflected stub collision '+K(b.position));
 const oldEdges=new Set;for(const b of base.blocks)if(Math.abs(b.position.x-r.current_comparator.x)<=5&&Math.abs(b.position.y-r.current_comparator.y)<=3&&Math.abs(b.position.z-r.current_comparator.z)<=5&&active(b.block))for(const s of inputs(world,b.position))oldEdges.add(E(s,b.position));
 for(const b of blocks)world.set(K(b.position),b.block);
 const newKeys=new Set(blocks.map(b=>K(b.position))),receivers=[...blocks.filter(b=>active(b.block)).map(b=>b.position),r.current_comparator];
 const originalSelected=new Set([...points,p].map(K));
 const edges=[...points,p].flatMap(to=>inputs(ow,to).filter(from=>originalSelected.has(K(from))).map(from=>({from:transform(from,reflected),to:transform(to,reflected),body:kind})));
 for(const to of receivers)for(const from of inputs(world,to))assert(edges.some(e=>K(e.from)===K(from)&&K(e.to)===K(to)),'Unexpected actual stub input '+E(from,to));
 const expected=new Set([...oldEdges,...edges.map(e=>E(e.from,e.to))]);
 for(const b of [...base.blocks,...blocks])if(Math.abs(b.position.x-r.current_comparator.x)<=5&&Math.abs(b.position.y-r.current_comparator.y)<=3&&Math.abs(b.position.z-r.current_comparator.z)<=5&&active(b.block))for(const s of inputs(world,b.position))assert(expected.has(E(s,b.position)),'New stub foreign contact '+E(s,b.position));
 for(const b of blocks){mapping[K(b.original_position)]={position:b.position,body:kind,mapping_kind:b.mapping_kind};addedMappings.push(b);}
 gates.push({kind,blocks,edges,ports:{rear:transform(points[0],reflected),side:transform(points[3],reflected),comparator:r.current_comparator},original_comparator:p,original_translation:shift,side_reflected:reflected});
 for(const [role,sourceName,originalDestination]of [['rear',r.source_name,points[0]],['side','architecture_active',points[3]]]){
  const s=reference.sources.find(s=>s.name===sourceName),q=[originalDestination],seen=new Set(q.map(K));
  for(let i=0;i<q.length;i++){const at=q[i];if(K(at)===K(s.old_seed))continue;for(const n of inputs(ow,at))if(!seen.has(K(n))){seen.add(K(n));q.push(n);}}
  assert(seen.has(K(s.old_seed)));const m=symbolicPower(ow,q,{source:s.old_seed});
  assert.equal(m.at(originalDestination)[1],m.bdd.vars[0],'Original polarity '+sourceName+'/'+role);const originalHigh=m.evaluate(originalDestination,{source:1});assert(originalHigh>0);for(let k=1;k<=15;k++)assert.equal(m.at(originalDestination)[k],k<=originalHigh?m.bdd.vars[0]:0,'Original attenuation '+sourceName+'/'+role);
  const name=`flags_lane${r.lane}_bit${r.bit}_${role}`,exactDestination=transform(originalDestination,reflected),adapter=role==='side'?receiverAdapter(exactDestination,r.lane,r.bit):null;
  connections.push({name,lane:r.lane,bit:r.bit,role,source:s.current_tip,destination:adapter?.ports.input??exactDestination,exact_original_receiver:exactDestination,receiver_adapter:adapter?.kind??null,original_source:s.old_tip,original_destination:originalDestination,source_body:prior.mapping[K(s.old_tip)].body,target_body:kind,source_name:sourceName,source_asserted_high:15,actual_reference_upstream:[{position:s.old_tip,parity:0}],unary_torch_stages:null,upstream_transport_nodes:q.length,binding_kind:adapter?'positive_receiver_adapter_into_exact_original_mask_pad':'exact_original_flag_comparator_rear_delivery'});
  reports.push({name,source_name:sourceName,old_seed:s.old_seed,old_tip:s.old_tip,old_destination:originalDestination,positions:q,...m.summary(),old_low:m.evaluate(originalDestination,{source:0}),old_high:m.evaluate(originalDestination,{source:1}),polarity:'positive'});
 }
}
assert.equal(gates.length,24);assert.equal(addedMappings.length,96);assert.equal(connections.length,24);
const body={...base,blocks:[...base.blocks,...gates.flatMap(g=>g.blocks)],logic_bodies:gates,metrics:{cells:world.size,parent_cells:base.blocks.length,logic_body_additions:gates.reduce((n,g)=>n+g.blocks.length,0),new_transport_cells:0,stored_bits:1117}};
writeFileSync(new URL('body-design.json',H),JSON.stringify(body)+'\n');
writeFileSync(new URL('endpoint-map.json',H),JSON.stringify({...prior,receiver_adapters:connections.filter(c=>c.receiver_adapter).map(c=>({name:c.receiver_adapter,route:c.name,original_receiver:c.original_destination,exact_mapped_original_receiver:c.exact_original_receiver,physical_route_receiver:c.destination,function:'positive two-torch receiver adapter; original side normalizer and comparator remain'})),mapping,mapped_original_cells:Object.keys(mapping).length,connections,unmatched:[],inherited_open_obligations:'../final-stage-clear-connected-v1/timing-and-composition.json',complete_core:false,native_acceptance:false})+'\n');
writeFileSync(new URL('preflight.json',H),JSON.stringify({status:'twelve_source_bound_flag_stubs_and_positive_mask_receiver_adapters_placed',gates,added_exact_original_mappings:addedMappings,routes:connections,metrics:body.metrics,complete_core:false,native_acceptance:false},null,2)+'\n');
writeFileSync(new URL('transport-functions.json',H),JSON.stringify({status:'twenty_four_actual_original_input_deliveries_positive_with_separate_original_attenuation',reports,complete_core:false,native_acceptance:false},null,2)+'\n');
console.log(JSON.stringify({metrics:body.metrics,routes:connections.length,gates:gates.length}));
