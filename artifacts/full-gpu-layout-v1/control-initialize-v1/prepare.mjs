// Connected zero-data and phased bank initialization over frozen commit-v2.
// Pure geometry: no native services, host phases or world mutation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {P,K,V,F,searchPath,refreshIndices} from '../control-commit-v2/route.mjs';
const json=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire';
export function makeInitialization({plan=false}={}){
 const parent=json('../control-commit-v2/design.json'),removed=parent.blocks.filter(v=>v.part.startsWith('cmp_lane_')),map=new Map(parent.blocks.filter(v=>!v.part.startsWith('cmp_lane_')).map(v=>[K(v.position),{...v,part:'commit_v2'}])),edges=[],routes=[],connections=[],substitutions=[],clamps=[],gates=[];let part='';
 const Q=(x,y,z)=>P(x-400,y+10,z+714),at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),join=ps=>{for(let i=1;i<ps.length;i++)edge(ps[i-1],ps[i]);};
 const put=(p,id,properties)=>{const old=at(p),block={id:'minecraft:'+id,...properties?{properties}:{}};if(old){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p)+' '+old.part);assert.deepEqual(old.block,block);return;}map.set(K(p),{position:p,block,part});};
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 const replace=(p,expected,block)=>{assert.deepEqual(at(p)?.block,expected,'replacement '+K(p));substitutions.push({position:p,before:expected,after:block});map.set(K(p),{position:p,block,part});};
 // PC NEXT's normalized data driver becomes the real reset-zero subtractor.
 // Existing storage and all lock branches remain unchanged.
 for(let bit=0;bit<8;bit++){
  const z=-4+8*bit,p=P(29,252,z);part='pc_zero_'+bit;replace(p,{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}},{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});
  rep(P(29,252,z+1),'north');wire(P(29,252,z+2));join([P(28,252,z),p,P(30,252,z)]);join([P(29,252,z+2),P(29,252,z+1),p]);clamps.push({name:'pc_'+bit,comparator:p,rear:P(28,252,z),mask:P(29,252,z+1),input:P(29,252,z+2),arrival:'east',output:P(30,252,z)});
 }
 // At each flag receiver, the old input dust becomes a subtractor. The
 // inherited arrival and receiving diodes remain on both sides, each at15.
 for(let lane=0;lane<4;lane++)for(let bit=0;bit<3;bit++){
  const x=178+32*lane,z=-8+16*bit,p=P(x,285,z);part='flags_zero_'+lane+'_'+bit;replace(p,{id:W},{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});
  rep(P(x,285,z+1),'north');wire(P(x,285,z+2));join([P(x-1,285,z),p,P(x+1,285,z)]);join([P(x,285,z+2),P(x,285,z+1),p]);clamps.push({name:'flags_'+lane+'_'+bit,comparator:p,rear:P(x-1,285,z),mask:P(x,285,z+1),input:P(x,285,z+2),arrival:'north',output:P(x+1,285,z)});
 }
 // A real common initialize rail feeds twenty zero masks plus two OPEN
 // qualifiers through separate side-facing isolation diodes.
 part='initialize_distribution';wire(Q(286,300,-804));rep(Q(287,300,-804),'east');wire(Q(288,300,-804));wire(Q(289,300,-804));join([286,287,288,289,290].map(x=>Q(x,300,-804)));
 const branches=[];for(let x=290;x<=374;x++){if(x>290&&(x-290)%12===10)rep(Q(x,300,-804),'east');else wire(Q(x,300,-804));if(x>290)edge(Q(x-1,300,-804),Q(x,300,-804));if((x-290)%4===0){rep(Q(x,300,-803),'south');wire(Q(x,300,-802));join([Q(x,300,-804),Q(x,300,-803),Q(x,300,-802)]);branches.push(Q(x,300,-802));}}
 for(const [i,x]of[300,316].entries()){
  part='initialize_phase_'+i;wire(Q(x-2,300,-830));rep(Q(x-1,300,-830),'east');dev(Q(x,300,-830),'comparator',{facing:'west',mode:'subtract'});rep(Q(x+1,300,-830),'east');wire(Q(x+2,300,-830));join([-2,-1,0,1,2].map(dx=>Q(x+dx,300,-830)));
  wire(Q(x,300,-836));rep(Q(x,300,-835),'south');solid(Q(x,300,-834));solid(Q(x,299,-834));put(Q(x,300,-833),'redstone_wall_torch',{facing:'south'});wire(Q(x,300,-832));rep(Q(x,300,-831),'south');join([-836,-835,-834].map(z=>Q(x,300,z)));join([-833,-832,-831,-830].map(z=>Q(x,300,z)));edge(Q(x,300,-835),Q(x,300,-833));gates.push({phase:i?'B':'A',data:Q(x-2,300,-830),initialize:Q(x,300,-836),out:Q(x+2,300,-830),comparator:Q(x,300,-830)});
 }
 // Five A-qualified outputs, each separately normalized before routing.
 part='initialize_A_fanout';rep(Q(302,300,-829),'south');wire(Q(302,300,-828));wire(Q(302,300,-827));wire(Q(302,300,-826));join([-830,-829,-828,-827,-826].map(z=>Q(302,300,z)));
 for(let x=303;x<=340;x++){if([312,324,336].includes(x))rep(Q(x,300,-826),'east');else wire(Q(x,300,-826));edge(Q(x-1,300,-826),Q(x,300,-826));}
 const aOutputs=[];for(let z=-827;z>=-846;z--){if([-828,-840].includes(z))rep(Q(340,300,z),'north');else wire(Q(340,300,z));edge(Q(340,300,z+1),Q(340,300,z));if((z+830)%4===0&&z<=-830){rep(Q(339,300,z),'west');wire(Q(338,300,z));join([Q(340,300,z),Q(339,300,z),Q(338,300,z)]);aOutputs.push(Q(338,300,z));}}
 const cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?json('routes.json'):{},pending=[],reserved=[],step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 const reserve=(s,sd,d,ad)=>[...Array.from({length:14},(_,i)=>step(s,sd,i+2)),...Array.from({length:14},(_,i)=>step(d,ad,-i-2))];
 function connect(...v){pending.push(v);}
 function draw(name,source,sd,destination,ad,stubs=false){part=name;assert.equal(at(source)?.block.id,W,'source '+name);assert.equal(at(destination)?.block.id,name.startsWith('cmp_lane_')?'minecraft:comparator':W,'destination '+name);const first=step(source,sd),start=step(source,sd,2),last=step(destination,ad,-1),end=step(destination,ad,-2);if(stubs){rep(first,sd);wire(start);rep(last,ad);wire(end);join([source,first,start]);join([end,last,destination]);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[...reserve(source,sd,destination,ad),first,start,last,end,...[first,start,last,end].map(p=>P(p.x,p.y-1,p.z))];const forbidden=[first,last].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![source,start,end,destination].some(q=>K(p)===K(q)));const r=searchPath(map,start,end,{ignore,reserved,forbidden});path=r.path;cache[name]={source,destination,path,expanded:r.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length+' / '+r.expanded);}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i)){const d=Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z);rep(p,d);}else wire(p);}join(path);routes.push({name,path,refresh_indices:refresh});connections.push({name,source,tap:first,destination,arrival:last});
 }
 const fp=parent.ports.front,port=n=>fp[n].bits[0].position;
 for(const c of parent.connections.filter(c=>c.name.startsWith('cmp_lane_')))connect(c.name,c.source,'west',c.destination,'east');
 connect('initialize_source',port('initialize'),'east',Q(286,300,-804),'east');
 for(let i=0;i<clamps.length;i++)connect('zero_'+clamps[i].name,branches[i],'south',clamps[i].input,clamps[i].arrival);
 for(let i=0;i<2;i++){connect('init_gate_'+i,branches[20+i],'south',gates[i].initialize,'south');connect('raw_phase_'+i,i?port('phase_b'):P(-84,1,16),i?'north':'south',gates[i].data,'east');}
 connect('init_pc_next',aOutputs[0],'west',port('pc_next_open'),'south');
 connect('init_pc_current',gates[1].out,'south',port('pc_current_open'),'south');
 for(let lane=0;lane<4;lane++)connect('init_flags_'+lane,aOutputs[lane+1],'west',lane===3?P(282,285,-21):fp.flags_open.bits[lane].position,lane===3?'south':'east');
 for(const[,s,sd,d,ad]of pending)reserved.push(...reserve(s,sd,d,ad));for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'connected_core_initialization_draft',blocks,parents:{commit_v2:{blocks:parent.blocks.length,translation:P(0,0,0)}},removed_interconnect_cells:removed,substitutions,clamps,gates,edges,routes,connections,box,ports:parent.ports,metrics:{blocks:blocks.length,added_blocks:blocks.length-parent.blocks.length,replaced_parent_cells:substitutions.length,rerouted_parent_nets:12,removed_interconnect_cells:removed.length,connections:connections.length,retained_bits:347},native_acceptance:false,complete_controller:false,missing:['Initialization producer must hold masks and blanking before qualified A, retain through full A-close-B-close, close all banks, then prove distant closure.','OTHER, retained lane assignment, LSU WAIT/dispatch and source cadence/admission remain outside this component.','ALU internal microcommand delivery and whole-machine composition/timing remain incomplete.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeInitialization({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,json('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
