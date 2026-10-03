// Original four-channel retention plus one physical raw-LSU selector/fanout.
// Offline, unselected, no native runtime or fabricated backend acknowledgements.
import assert from 'node:assert/strict';import{readFileSync,mkdirSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{resolve,join}from'node:path';import{pathToFileURL}from'node:url';
import{makeChannelRetention}from'./memory-layout-channel-retention.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'};
export function makeChannelPayload(){
 const source='206b749180931be863a70785ac11a01db970025fc1bd931ebaa9f4dc2969a4ff';assert.equal(createHash('sha256').update(readFileSync(new URL('./memory-layout-channel-retention.mjs',import.meta.url))).digest('hex'),source);
 const parent=makeChannelRetention(),map=new Map(parent.blocks.map(v=>[K(v.position),structuredClone(v)])),groups=Object.fromEntries(parent.blocks.map(v=>[K(v.position),'retention'])),nets={...parent.nets},routes=[],frontends=[],fanout=[],bindings=[],validReturns=[];let group='',net='';
 // Candidate terminals are now physically shared by consumer/field across all
 // four channels. This changes only net labels, never a parent block.
 for(const k of Object.keys(nets)){const match=/^candidate([0-3])_([0-7])_([0-9]+)$/.exec(nets[k]);if(match)nets[k]='candidate'+match[2]+'_'+match[3];}
 const put=(p,b)=>{const old=map.get(K(p));if(old){assert.deepEqual(old.block,b,'collision '+K(p)+' '+groups[K(p)]+'/'+group);assert(b.id===S||nets[K(p)]===net,'net collision '+K(p)+' '+nets[K(p)]+'/'+net);return;}map.set(K(p),{position:p,block:b});groups[K(p)]=group;nets[K(p)]=net;};
 const solid=(x,y,z)=>put(P(x,y,z),{id:S}),dev=(x,y,z,id,properties)=>{solid(x,y-1,z);put(P(x,y,z),{id:'minecraft:'+id,...(properties?{properties}:{})});},w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,d)=>dev(x,y,z,'repeater',{facing:F[d],delay:'1'}),c=(x,y,z,d)=>dev(x,y,z,'comparator',{facing:F[d],mode:'subtract'}),wall=(x,y,z,facing)=>put(P(x,y,z),{id:'minecraft:redstone_wall_torch',properties:{facing}});
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)if((y-lo)%2)put(P(x,y,z),{id:'minecraft:redstone_torch'});else solid(x,y,z);};
 function route(name,points,{wireOnly=[],force=[]}={}){const path=[P(...points[0])];for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],n=Math.abs(dx)+Math.abs(dz);if(!n){assert.equal(dy,0);continue;}assert((!dx||!dz)&&(!dy||Math.abs(dy)===n));for(let i=1;i<=n;i++)path.push(P(a[0]+Math.sign(dx)*i,a[1]+Math.sign(dy)*i,a[2]+Math.sign(dz)*i));}let run=0,max=0;for(let i=0;i<path.length;i++){const p=path[i],a=path[i-1],b=path[i+1];if(map.has(K(p))){const old=map.get(K(p)).block;assert(['minecraft:redstone_wire','minecraft:repeater'].includes(old.id),name+' occupied '+K(p));assert.equal(nets[K(p)],net,name+' net '+K(p));if(old.id==='minecraft:repeater'){const d=b??p,from=b?p:a;assert(from);assert.equal(d.y,from.y);assert.equal(old.properties.facing,F[d.x>from.x?'east':d.x<from.x?'west':d.z>from.z?'south':'north'],name+' existing diode direction '+K(p));}run=0;continue;}const flat=a&&b&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z;if(flat&&(run>=10||force.includes(K(p)))&&!wireOnly.includes(K(p))){r(p.x,p.y,p.z,b.x>p.x?'east':b.x<p.x?'west':b.z>p.z?'south':'north');run=0;}else{w(p.x,p.y,p.z);max=Math.max(max,++run);assert(run<=14,name+' attenuation '+K(p));}}routes.push({name,net,path,max_dust_run:max});}
 const fields=parent.fields,rv=[],wv=[],ra=[],wa=[],wd=[];
 for(let i=0;i<8;i++){
  const y=1+4*i;group='raw_request_selectors';
  const addrFields=[15,16,0,1,2,3,4,5],address=[];
  net='read_valid'+i;w(618,y,-26);r(618,y,-25,'south');rv.push(P(618,y,-26));
  route('read_valid_spine_'+i,[[618,y,-24],[618,y,125]],{wireOnly:[...addrFields.flatMap(f=>[fields[f].z-1,fields[f].z+5]),120].map(z=>K(P(618,y,z)))});
  net='write_valid'+i;w(626,y,-26);r(626,y,-25,'south');wv.push(P(626,y,-26));route('write_valid_spine_'+i,[[626,y,-24],[626,y,122]]);
  for(let bit=0;bit<8;bit++){
   const field=addrFields[bit],z=fields[field].z+2;net='read_valid'+i;r(617,y,z-3,'west');solid(616,y,z-3);net='not_read_valid'+i;wall(615,y,z-3,'west');for(let x=614;x>=610;x--)w(x,y,z-3);r(610,y,z-2,'south');
   net='read_valid'+i;r(617,y,z+3,'west');for(let x=616;x>=610;x--)w(x,y,z+3);r(610,y,z+2,'north');
   net='read_address'+i+'_'+bit;w(612,y,z-1);r(611,y,z-1,'west');ra.push(P(612,y,z-1));net='write_address'+i+'_'+bit;w(612,y,z+1);r(611,y,z+1,'west');wa.push(P(612,y,z+1));
   net='candidate'+i+'_'+field;for(const dz of[-1,1]){c(610,y,z+dz,'west');r(609,y,z+dz,'west');w(608,y,z+dz);}w(608,y,z);r(607,y,z,'west');w(606,y,z);r(605,y,z,'west');
   address.push({bit,field,read_gate:P(610,y,z-1),write_gate:P(610,y,z+1),read_mask:P(610,y,z-2),write_mask:P(610,y,z+2),output:P(605,y,z)});
  }
  for(let field=0;field<17;field++){
   const f=fields[field],z=f.z+2;group='raw_request_selectors';
   if(field>=6&&field<14){const bit=field-6;net='write_data'+i+'_'+bit;w(610,y,z);r(609,y,z,'west');wd.push(P(610,y,z));net='candidate'+i+'_'+field;w(608,y,z);r(607,y,z,'west');w(606,y,z);r(605,y,z,'west');}
   if(field===14){net='write_valid'+i;r(625,y,z,'west');w(624,y,z);w(623,y,z);w(622,y-1,z);w(621,y-2,z);w(620,y-2,z);r(619,y-2,z,'west');r(618,y-2,z,'west');w(617,y-2,z);w(616,y-1,z);w(615,y,z);w(614,y,z);w(613,y,z);w(612,y,z);r(611,y,z,'west');net='read_valid'+i;r(617,y,z-2,'west');for(let x=616;x>=610;x--)w(x,y,z-2);r(610,y,z-1,'south');net='candidate'+i+'_'+field;c(610,y,z,'west');r(609,y,z,'west');w(608,y,z);r(607,y,z,'west');w(606,y,z);r(605,y,z,'west');}
   group='candidate_shared_fanout';net='candidate'+i+'_'+field;
   const xs=Array.from({length:4},(_,ch)=>128+128*ch+4*i),busZ=field===14?z-2:z;
   if(field===14)route('type_bus_turn_'+i,[[604,y,z],[604,y,busZ]]);
   route('candidate_bus_'+i+'_'+field,i===6?[[604,y,busZ],[194,y,busZ],[192,y+2,busZ],[184,y+2,busZ],[182,y,busZ],[xs[0],y,busZ]]:[[604,y,busZ],[xs[0],y,busZ]],{wireOnly:xs.map(x=>K(P(x,y,busZ)))});
   for(let ch=0;ch<4;ch++){
    const x=xs[ch],ty=y+80*ch,X=128*ch;group='candidate_towers';r(x,y,busZ+1,'south');tower(x,busZ+2,y,ty);r(x-1,ty,busZ+2,'west');w(x-2,ty,busZ+2);w(x-3,ty-1,busZ+2);w(x-4,ty-2,busZ+2);
    if(busZ!==z)route('type_return_turn_'+ch+'_'+i,[[x-4,ty-2,busZ+2],[x-4,ty-2,z+2]]);
    group='candidate_terminal_routes';let normalizer,supportDrive=null;
    if(field===15){route('candidate_terminal_'+ch+'_'+i+'_'+field,[[x-4,ty-2,z+2],[x-4,ty-2,z],[X+119,ty-2,z]],{force:[K(P(X+121,ty-2,z))]});w(X+118,ty-1,z);solid(X+118,ty,z);r(X+118,ty-1,z-1,'north');normalizer=P(X+118,ty-1,z-1);supportDrive=P(X+118,ty-1,z-2);}
    else{route('candidate_terminal_'+ch+'_'+i+'_'+field,[[x-4,ty-2,z+2],[X+118,ty-2,z+2]],{force:[K(P(X+121,ty-2,z+2))]});w(X+118,ty-1,z+1);w(X+118,ty,z);r(X+118,ty,z-1,'north');normalizer=P(X+118,ty,z-1);}
    const dst=parent.ports.candidate_payload.positions[ch*136+i*17+field];assert.deepEqual(dst,P(X+118,ty,z-2));bindings.push({channel:ch,consumer:i,field,source:P(605,y,z),normalizer,supportDrive,destination:dst});fanout.push({channel:ch,consumer:i,field,base:P(x,y,busZ+2),top:P(x,ty,busZ+2),input:P(x,y,busZ+1),output:P(x-1,ty,busZ+2)});
   }
  }
  frontends.push({consumer:i,y,address_muxes:address,type_gate:P(610,y,122),valid_inputs:[rv[i],wv[i]]});
  // Actual raw valids also reach the earlier request snapshots. Each path has
  // an isolated underpass and its own supported descent; no host free mask.
  for(const kind of['read','write']){
   group='raw_valid_returns';net=kind+'_valid'+i;const x=kind==='read'?618:626,z0=(kind==='read'?-50:-66)-32*i,low=-3-4*i,bus=kind==='read'?-38:-26,tz=kind==='read'?-36:-28,dst=parent.ports[kind+'_valid'].positions[i];
   r(x,y,-27,'north');
   if(kind==='read')route('raw_read_depart_'+i,[[x,y,-28],[x,y,z0],[640,y,z0]]);
   else route('raw_write_depart_'+i,[[x,y,-28],[x,y,-45-32*i],[x,y-2,-47-32*i],[x,y-2,-52-32*i],[x,y,-54-32*i],[x,y,z0],[640,y,z0]],{force:[K(P(x,y-2,-49-32*i))]});
   r(641,y,z0,'east');let xx=642,yy=y,points=[[xx,yy,z0]],force=[];
   while(yy!==low){const n=Math.min(7,yy-low);xx+=n;yy-=n;points.push([xx,yy,z0]);if(yy!==low){xx+=3;points.push([xx,yy,z0]);force.push(K(P(xx-1,yy,z0)));}}
   route('raw_valid_descent_'+kind+'_'+i,points,{force});r(xx+1,low,z0,'east');const turn=xx+(kind==='read'?2:10);route('raw_valid_return_'+kind+'_'+i,[[xx+2,low,z0],[turn,low,z0],[turn,low,bus],[5*i,low,bus]],{force:[K(P(turn,low,bus-2))]});
   if(kind==='read'){r(5*i,low,-37,'south');tower(5*i,-36,low,1);r(5*i,1,-35,'south');}
   else{r(5*i,low,-27,'north');tower(5*i,-28,low,1);r(5*i,1,-29,'north');}
   validReturns.push({kind,consumer:i,source:kind==='read'?rv[i]:wv[i],destination:dst,base:P(5*i,low,tz),top:P(5*i,1,tz),normalizer:P(5*i,1,kind==='read'?-35:-29)});
  }
 }
 const blocks=[...map.values()],box={from:{},to:{}},histogram={},group_counts={};for(const a of['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}for(const v of blocks){histogram[v.block.id]=(histogram[v.block.id]??0)+1;group_counts[groups[K(v.position)]]=(group_counts[groups[K(v.position)]]??0)+1;}
 const port=(direction,positions)=>({direction,width:positions.length,positions,polarity:'active_high',bit_order:'consumer_major_lsb_first'}),ports={...parent.ports,read_valid:port('input',rv),write_valid:port('input',wv),read_address:port('input',ra),write_address:port('input',wa),write_data:port('input',wd)};delete ports.candidate_payload;
 return{status:'offline_original_channel_raw_payload_candidate',blocks,nets,groups,routes,frontends,fanout,bindings,validReturns,fields,ports,box,metrics:{blocks:blocks.length,parent_blocks:parent.blocks.length,added_blocks:blocks.length-parent.blocks.length,raw_consumers:8,address_mux_bits:64,address_product_comparators:128,is_write_comparators:8,physical_candidate_routes:bindings.length,raw_valid_routes:validReturns.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),histogram,group_counts,legal_y_translation:[-64-box.from.y,319-box.to.y]},source_sha256:{'hardware/memory-layout-channel-retention.mjs':source},missing:['Backend request/capture/ready-return state and consumer acknowledgement paths remain missing; RETIRE cannot be supplied by host transitions.','Four-consumer bank eligibility/payload/response interfaces and physical bank integration remain unrouted.','Slow admission windows have not been validated against these full fanout delays; no native timing, initialization or whole-memory placement acceptance.','Original release-within-scan retiming and full matched cost/density comparison remain unresolved.'],complete_component_geometry:false,selected:false,native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeChannelPayload();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
