// Proposed vanilla selector/carry coupon. Importing performs no game work.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeCompactAdderChain} from './compact-adder-chain.mjs';

export const axes=['x','y','z'];
export const key=p=>axes.map(k=>p[k]).join(',');
export const volume=b=>axes.reduce((n,k)=>n*(b.to[k]-b.from[k]+1),1);
const facing={east:'west',west:'east',north:'south',south:'north'};
const dir={east:[1,0],west:[-1,0],north:[0,-1],south:[0,1]};
const solid=id=>['minecraft:light_gray_concrete','minecraft:lime_concrete'].includes(id);

export function makeSelectorCarryCoupon({origin={x:0,y:0,z:0},id='selector_carry2'}={}){
 assert(axes.every(k=>Number.isSafeInteger(origin[k])));
 assert(/^[a-z][a-z0-9_]{0,19}$/.test(id));
 const p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
 const parent=makeCompactAdderChain({origin,id:'gpu_compact_coupon2'});
 const map=new Map(parent.blocks.map(b=>[key(b.position),structuredClone(b)]));
 const parentKeys=new Set(map.keys()),wiring={},added=[],replaced=[];
 const put=(x,y,z,name,properties,net,role)=>{
  const position=p(x,y,z),k=key(position);assert(!map.has(k),'Collision '+k);
  const v={position,block:{id:'minecraft:'+name,...(properties?{properties}:{})}};
  map.set(k,v);added.push(k);if(net)wiring[k]={net,role:role??name};return position;
 };
 const wire=(x,z,net)=>put(x,1,z,'redstone_wire',undefined,net);
 const rep=(x,z,travel,net,role)=>put(x,1,z,'repeater',{facing:facing[travel],delay:'1'},net,role);
 const inputs=parent.inputs.filter(v=>!/^a[01]$/.test(v.name)),signals=structuredClone(parent.signals);
 const probe=(name,x,z,property='powered')=>signals.push({name,position:p(x,1,z),property});
 const lever=(name,x,z,net)=>{inputs.push({name,position:put(x,1,z,'lever',{face:'floor',facing:'west',powered:'false'},net)});probe('raw_'+name,x,z);};
 // One S source. Every branch is isolated/refreshed. Each selector generates !S
 // physically at a wall torch, rather than treating it as a second input.
 lever('select',-15,-8,'S');rep(-15,-7,'south','S');
 for(let z=-6;z<=34;z++)if([4,16,28].includes(z))rep(-15,z,'south','S');else wire(-15,z,'S');
 for(let bit=0;bit<2;bit++){
  const z=28*bit;
  for(const [name,row]of [['x',z-2],['y',z+2]]){
   const input=name+bit,net=input.toUpperCase(),out='PASS_'+input;
   lever(input,-10,row,net);rep(-9,row,'east',net);wire(-8,row,net);
   put(-7,1,row,'comparator',{facing:'west',mode:'subtract'},out,'masked_branch');
   rep(-6,row,'east',out,'isolated_branch_output');
   probe('local_'+input,-9,row);probe('pass_'+input,-6,row);
  }
  for(let row=z-2;row<=z+2;row++)wire(-5,row,'SELECTED'+bit);
  rep(-4,z,'east','SELECTED'+bit,'selector_output');
  for(let x=-3;x<=-1;x++)wire(x,z,'SELECTED'+bit);
  const at=p(0,1,z),old=map.get(key(at));assert.equal(old.block.id,'minecraft:lever');
  map.set(key(at),{position:at,block:{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}}});
  replaced.push({position:at,before:old.block,after:map.get(key(at)).block});
  probe('selected'+bit,0,z);
  // S inhibits X. The unselected complement branch is closed at full strength15.
  rep(-14,z-4,'east','S');for(let x=-13;x<=-7;x++)wire(x,z-4,'S');
  rep(-7,z-3,'south','S','comparator_side');probe('mask_x'+bit,-7,z-3);
  // !S inhibits Y. Solid output block and torch are clear of both data rows.
  rep(-14,z+6,'east','S');for(let x=-13;x<=-11;x++)wire(x,z+6,'S');
  rep(-10,z+6,'east','S','inverter_driver');put(-9,1,z+6,'light_gray_concrete',undefined,'S','inverter_solid');
  put(-8,1,z+6,'redstone_wall_torch',{facing:'east'},'NOT_S','select_inverter');
  for(let row=z+6;row>=z+4;row--)wire(-7,row,'NOT_S');
  rep(-7,z+3,'north','NOT_S','comparator_side');probe('mask_y'+bit,-7,z+3);
 }
 // Read the inherited B/Cin sources and the shared select's near/far arrival.
 for(const input of inputs.filter(v=>['b0','b1','cin'].includes(v.name)))signals.push({name:'raw_'+input.name,position:input.position,property:'powered'});
 probe('select_near',-14,-4);probe('select_far',-14,34);
 // Retain every non-floor parent block. Add only actual required supports.
 const supportAdditions=[];
 // Keep the original floor below all inherited Y1 blocks, including the ten
 // solid stair supports. Thus every omitted old floor cell has air above it;
 // no inherited powered-solid path is shortened by this coupon.
 for(const v of parent.blocks.filter(v=>v.position.y===origin.y+1)){
  const support={...v.position,y:origin.y};if(map.has(key(support)))continue;
  map.set(key(support),{position:support,block:{id:'minecraft:lime_concrete'}});supportAdditions.push(key(support));
 }
 for(const v of [...map.values()]){
  if(solid(v.block.id))continue;
  let support={...v.position,y:v.position.y-1};
  if(v.block.id==='minecraft:redstone_wall_torch'){
   const [dx,dz]=dir[v.block.properties.facing];support={...v.position,x:v.position.x-dx,z:v.position.z-dz};
  }
  if(map.has(key(support))){assert(solid(map.get(key(support)).block.id),'Non-solid support');continue;}
  assert.equal(support.y,origin.y,'Missing elevated support in preserved primitive');
  const inOld=support.x>=origin.x&&support.x<=origin.x+27&&support.z>=origin.z-3&&support.z<=origin.z+46;
  map.set(key(support),{position:support,block:{id:'minecraft:'+(inOld?'lime_concrete':'light_gray_concrete')}});supportAdditions.push(key(support));
 }
 const blocks=[...map.values()];
 const box={from:p(-15,0,-8),to:p(27,7,46)};
 // Disjoint 2Y bands: sorted solids first make same-height torch supports safe.
 const tiles=[];
 for(let y=0;y<=7;y+=2){let z=-8;while(z<=46){let best=null;
  for(let end=z;end<=46;end++){
   const b={from:p(-15,y,z),to:p(27,Math.min(y+1,7),end)};
   const items=blocks.filter(v=>axes.every(a=>v.position[a]>=b.from[a]&&v.position[a]<=b.to[a]));
   if(items.length>128||volume(b)>4096)break;best={b,items,end};
  }
  assert(best);z=best.end+1;if(!best.items.length)continue;
  best.items.sort((a,b)=>a.position.y-b.position.y||Number(!solid(a.block.id))-Number(!solid(b.block.id))||a.position.z-b.position.z||a.position.x-b.position.x);
  const tid=id+'_t'+tiles.length;tiles.push({region:{id:tid,dimension:'minecraft:overworld',box:best.b,description:'Unplaced selector/carry coupon, sparse required supports'},plan:{id:tid,region_id:tid,label:'Exact selector plus preserved two-bit carry path',operations:best.items.map(v=>({op:'set',...v}))}});
 }}
 const buses=[{name:'result',bits:['bit0_sum','bit1_sum','bit1_carry']},{name:'selected',bits:['selected0','selected1']},{name:'sum',bits:['bit0_sum','bit1_sum']}];
 const circuit={id,dimension:'minecraft:overworld',description:'Proposed 2-bit selectable input plus physical ripple carry. No storage or serial control.',signals,buses};
 const hist={};for(const b of blocks)hist[b.block.id]=(hist[b.block.id]??0)+1;
 const floorCells=(box.to.x-box.from.x+1)*(box.to.z-box.from.z+1),neededFloor=blocks.filter(b=>b.position.y===origin.y).length;
 const retainedParentFloor=blocks.filter(b=>b.position.y===origin.y&&b.position.x>=origin.x&&b.position.x<=origin.x+27&&b.position.z>=origin.z-3&&b.position.z<=origin.z+46).length;
 return{status:'offline_proposed_native_unverified',id,origin,box,blocks,tiles,inputs,circuit,wiring,
  inheritance:{parent:'hardware/compact-adder-chain.mjs',parent_component_positions:parent.blocks.length,unchanged_parent_positions:parent.blocks.length-2,replaced_a_sources:replaced,original_floor_positions:1400,exact_parent_components_and_routes_except_two_a_ports:true},
  metrics:{blocks:blocks.length,selectors_and_control_components:added.length,added_support_or_retained_floor_blocks:supportAdditions.length,retained_floor_cells:neededFloor,retained_parent_floor_cells:retainedParentFloor,same_coupon_with_original_chain_floor:blocks.length+1400-retainedParentFloor,complete_decorative_floor_cells:floorCells,complete_same_coupon_with_decorative_floor:blocks.length+floorCells-neededFloor,decorative_floor_cells_omitted:floorCells-neededFloor,dimensions:{x:43,y:8,z:55},bounding_volume:volume(box),tiles:tiles.length,inputs:inputs.length,probes:signals.length,histogram:hist},
  ports:{selected:[p(0,1,0),p(0,1,28)],sum:parent.ports.sum,carry:parent.ports.carry,select:inputs.find(v=>v.name==='select').position},
  limits:['No reserved or inspected site.','Sparse-floor removal and new selector wiring need physical validation; preserving gate positions is not new native proof.','Combinational selector and two-bit ripple only; no retained carry/current-next banks, rotation, blanking controller or autonomous serial operation.','Masks can skew while SELECT changes. Downstream state must remain closed until the selected path settles.','Nominal component delays and static strength checks are not measured settling time.']};
}

export function expectedCoupon(v){
 const selected=v.select?v.y:v.x,total=selected+v.b+v.cin,out={result:total,selected,sum:total&3,raw_select:v.select,raw_cin:v.cin,select_near:v.select,select_far:v.select};
 let carry=v.cin;
 for(let bit=0;bit<2;bit++){
  const a=(selected>>bit)&1,b=(v.b>>bit)&1,x=(v.x>>bit)&1,y=(v.y>>bit)&1,p=a^b,c=carry;
  Object.assign(out,{['raw_x'+bit]:x,['raw_y'+bit]:y,['raw_b'+bit]:b,['local_x'+bit]:x,['local_y'+bit]:y,['pass_x'+bit]:x&!v.select,['pass_y'+bit]:y&v.select,['mask_x'+bit]:v.select,['mask_y'+bit]:1-v.select,['selected'+bit]:a});
  const values={sum:(a+b+c)&1,carry:(a+b+c)>>1,partial:p,carry_ab:a&b,carry_pc:p&c,ab_x_minus_y:a&!b,ab_y_minus_x:b&!a,ab_side_y:b,ab_side_x:a,pc_x_minus_y:p&!c,pc_y_minus_x:c&!p,pc_side_y:c,pc_side_x:p};
  for(const[n,value]of Object.entries(values))out['bit'+bit+'_'+n]=Number(value);
  if(bit===0)Object.assign(out,{cin0:c,cin1:values.carry,carry_bridge:values.carry});carry=values.carry;
 }
 return out;
}
export function makeSelectorCarryTests(design){
 const vectors=[];
 for(let select=0;select<2;select++)for(let selected=0;selected<4;selected++)for(let b=0;b<4;b++)for(let cin=0;cin<2;cin++)vectors.push({x:select?3-selected:selected,y:select?selected:3-selected,b,cin,select,kind:'arithmetic'});
 const edges=[[0,3,3,1,0],[1,3,3,1,0],[1,0,3,1,0],[1,0,3,1,1],[3,0,3,1,1],[3,2,3,1,1],[0,2,3,1,1],[0,2,3,1,0],[3,3,3,1,0],[3,3,3,1,1],[0,3,3,1,1],[0,0,3,1,1],[0,0,0,0,1],[0,0,0,0,0],[3,0,1,0,0],[0,0,0,0,0]];
 for(const[x,y,b,cin,select]of edges)vectors.push({x,y,b,cin,select,kind:'transition'});
 const jobs=[];
 for(let offset=0;offset<vectors.length;offset+=8){const rows=vectors.slice(offset,offset+8),cases=[];
  for(const[i,v]of rows.entries()){
   const inputs={b0:!!(v.b&1),b1:!!(v.b&2),cin:!!v.cin,select:!!v.select,x0:!!(v.x&1),y0:!!(v.y&1),x1:!!(v.x&2),y1:!!(v.y&2)};
   cases.push({name:`v${i}_propagate`,inputs,expect:Object.fromEntries(Object.entries(inputs).map(([n,value])=>['raw_'+n,Number(value)]))});
   cases.push({name:`v${i}_assert`,inputs,expect:expectedCoupon(v)});
  }
  jobs.push({index:jobs.length,vectors:rows,spec:{circuit_id:design.id,inputs:design.inputs,cases,settle_ticks:200,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}});
 }
 return jobs;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=process.argv[2];assert(out,'Usage: node hardware/selector-carry-coupon.mjs NEW_OUTPUT_DIR');
 const design=makeSelectorCarryCoupon(),jobs=makeSelectorCarryTests(design);mkdirSync(out,{recursive:true});
 for(const[n,v]of Object.entries({design,catalog:jobs.map(({index,vectors})=>({index,vectors})),circuit:design.circuit,...Object.fromEntries(jobs.map(j=>['test-'+String(j.index).padStart(2,'0'),j.spec]))}))writeFileSync(join(out,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({...design.metrics,jobs:jobs.length,phases:jobs.reduce((n,j)=>n+j.spec.cases.length,0),native_calls:0}));
}
