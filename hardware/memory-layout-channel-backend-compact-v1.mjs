// Offline compact-route derivative; original frozen separately. Original-channel backend: retained capture/retirement, response bank,
// real bank-ready/release delay lines and safe busy tail. No host transitions.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';import{resolve,join}from'node:path';import{pathToFileURL}from'node:url';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'},D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
export function makeChannelBackendControl(){
 const variables=['active','bank_ready','owner_valid','reset_blocked','ready_t1','ready_t2','ready_t3','retiring_t1','retiring_t3','captured','retiring'];
 const terms={
  capture_set:[['active','bank_ready','ready_t2','!reset_blocked','!retiring']],
  capture_clear:[['reset_blocked'],['!active'],['retiring_t1']],
  retiring_set:[['active','captured','!bank_ready','!ready_t3','!owner_valid','!reset_blocked','!retiring']],
  retiring_clear:[['reset_blocked'],['!active']],
  bank_request:[['active','!captured','!retiring','!retiring_t3','!reset_blocked']],
  open_response:[['active','bank_ready','!ready_t1','!captured','!retiring','!reset_blocked']],
  consumer_ready:[['active','captured','!bank_ready','!ready_t3','!retiring','!reset_blocked']],
  retire:[['retiring','retiring_t3','!captured','!bank_ready','!ready_t3','!reset_blocked']],
  backend_busy:[['captured'],['retiring'],['retiring_t3'],['bank_ready'],['ready_t3']]
 };
 const rows=Object.values(terms).flat().length,H=1+4*(rows-1),map=new Map(),nets={},groups={},routes=[],columns=[],edges=[],gates=[],outputs={},feedback=[],delays=[],states=[];let net='',group='';
 function put(p,id,properties){const block={id:id.startsWith('minecraft:')?id:'minecraft:'+id,...(properties?{properties}:{})},old=map.get(K(p));if(old){assert.deepEqual(old.block,block,'collision '+K(p)+' '+groups[K(p)]+'/'+group);assert(id===S||nets[K(p)]===net,'netcollision '+K(p)+' '+nets[K(p)]+'/'+net);return;}map.set(K(p),{position:p,block});nets[K(p)]=net;groups[K(p)]=group;}
 const solid=(x,y,z)=>put(P(x,y,z),S),dev=(x,y,z,id,pr)=>{solid(x,y-1,z);put(P(x,y,z),id,pr);},w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,t,delay=1)=>dev(x,y,z,'repeater',{facing:F[t],delay:String(delay)}),c=(x,y,z,t)=>dev(x,y,z,'comparator',{facing:F[t],mode:'subtract'}),wall=(x,y,z,f)=>put(P(x,y,z),'redstone_wall_torch',{facing:f});
 const edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,points,{wireOnly=[],force=[]}={}){
  const ps=[P(...points[0])];for(let n=1;n<points.length;n++){const a=points[n-1],b=points[n],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.abs(dx)+Math.abs(dz);if(!len){assert.equal(dy,0);continue;}assert((!dx||!dz)&&(!dy||Math.abs(dy)===len),name);for(let j=1;j<=len;j++)ps.push(P(a[0]+Math.sign(dx)*j,a[1]+Math.sign(dy)*j,a[2]+Math.sign(dz)*j));}
  const choices=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],p=ps[i],b=ps[i+1];if(!map.has(K(p))&&!wireOnly.includes(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)choices.push(i);}choices.push(ps.length);
  const cost=new Map([[-1,0]]),prev=new Map();for(const end of choices.slice(1))for(const start of choices){if(start>=end)break;if(!cost.has(start)||end-start>12)continue;const c=cost.get(start)+(end===ps.length?0:1);if(c<(cost.get(end)??Infinity)){cost.set(end,c);prev.set(end,start);}}assert(prev.has(ps.length),name+' cannot refresh');const indices=new Set();for(let i=prev.get(ps.length);i!==-1;i=prev.get(i))indices.add(i);for(let i=0;i<ps.length;i++)if(force.includes(K(ps[i]))){assert(choices.includes(i));indices.add(i);}
  const refresh=[];for(let i=0;i<ps.length;i++){const p=ps[i],b=ps[i+1],old=map.get(K(p));if(old){assert.equal(old.block.id,'minecraft:redstone_wire',name+' occupied '+K(p));assert.equal(nets[K(p)],net,name+' net '+K(p));}else if(indices.has(i)){r(p.x,p.y,p.z,b.x>p.x?'east':b.x<p.x?'west':b.z>p.z?'south':'north');refresh.push(p);}else w(p.x,p.y,p.z);if(i)edge(ps[i-1],p);}
  routes.push({name,net,path:ps,refresh});return ps;
 }
 function tower(name,x,z,lo,hi){assert.equal((hi-lo)%4,0,name);for(let y=lo;y<=hi;y++)put(P(x,y,z),(y-lo)%2?'redstone_torch':S);columns.push({name,net,x,z,lo,hi});}
 group='logic_input_columns';const inputs={};for(let i=0;i<variables.length;i++){net=variables[i];const x=5*i;w(x,1,-7);r(x,1,-6,'south');tower(net,x,-5,1,H);inputs[net]=P(x,1,-7);}
 let row=0,f=0;
 for(const[name,clauses]of Object.entries(terms)){
  const outX=70+4*f++,base=1+4*row;group='normalized_product_matrix';
  for(const clause of clauses){const y=1+4*row++;net=name;dev(-2,y,0,'redstone_block');r(-1,y,0,'east');
   for(let j=0;j<variables.length;j++){
    const x=5*j,key=variables[j],literal=clause.find(v=>v.replace('!','')===key);net=name;
    if(literal){net=key;r(x,y,-4,'south');if(!literal.startsWith('!')){solid(x,y,-3);net='not_'+key;wall(x+1,y,-3,'east');}else{w(x,y,-3);w(x+1,y,-3);}w(x+2,y,-3);w(x+2,y,-2);r(x+2,y,-1,'south');net=name;w(x,y,0);r(x+1,y,0,'east');c(x+2,y,0,'east');r(x+3,y,0,'east');w(x+4,y,0);gates.push({function:name,row:row-1,literal,gate:P(x+2,y,0),rear:P(x+1,y,0),mask:P(x+2,y,-1)});}
    else{for(let n=0;n<5;n++)if(n!==2)w(x+n,y,0);r(x+2,y,0,'east');}
   }
   net=name;r(55,y,0,'east');route(name+'_term_'+(row-1),[[56,y,0],[outX,y,0]]);r(outX,y,1,'south');
  }
  net=name;group='function_collectors';tower(name+'_collector',outX,2,base,H);r(outX+1,H,2,'east');w(outX+2,H,2);outputs[name]=P(outX+2,H,2);
 }
 // Actual cross-coupled NOR stores; set/clear products above are exclusive in
 // settled normal operation. Reset CLEAR also suppresses both SET products.
 function sr(name,x,z){const y=H;group=name+'_retention';net=name;solid(x,y,z);wall(x+1,y,z,'east');w(x+2,y,z);r(x+2,y,z-1,'north');route(name+'_set_feedback',[[x+2,y,z-2],[x+2,y,z-4],[x+12,y,z-4]]);r(x+12,y,z-3,'south');w(x+12,y,z-2);r(x+12,y,z-1,'south');net='not_'+name;solid(x+12,y,z);wall(x+11,y,z,'west');w(x+10,y,z);r(x+10,y,z+1,'south');route(name+'_clear_feedback',[[x+10,y,z+2],[x+10,y,z+4],[x,y,z+4]]);r(x,y,z+3,'north');w(x,y,z+2);r(x,y,z+1,'north');
  net=name==='captured'?'capture_set':'retiring_set';w(x+14,y,z);r(x+13,y,z,'west');net=name==='captured'?'capture_clear':'retiring_clear';w(x-4,y,z);r(x-3,y,z,'east');w(x-2,y,z);r(x-1,y,z,'east');
  net=name;r(x+3,y,z,'east');tower(name+'_export',x+4,z,y,y+4);r(x+5,y+4,z,'east');w(x+6,y+4,z);states.push({name,positive:P(x+2,y,z),negative:P(x+10,y,z),set:P(x+14,y,z),clear:P(x-4,y,z),positive_support:P(x,y,z),negative_support:P(x+12,y,z),export:P(x+6,y+4,z)});return P(x+6,y+4,z);
 }
 const captured=sr('captured',70,300),retiring=sr('retiring',82,340);
 group='state_control_routes';
 net='capture_set';r(72,H,3,'south');route('capture_set_to_state',[[72,H,4],[72,H,280],[84,H,280],[84,H,300]]);
 net='capture_clear';r(76,H,3,'south');tower('capture_clear_lift',76,4,H,H+4);r(76,H+4,5,'south');route('capture_clear_far',[[76,H+4,6],[64,H+4,6],[64,H+4,290],[64,H,294],[64,H,300]]);r(65,H,300,'east');
 net='retiring_set';r(80,H,3,'south');tower('retiring_set_lift',80,4,H,H+8);r(80,H+8,5,'south');route('retiring_set_far',[[80,H+8,6],[80,H+8,320],[96,H+8,320],[96,H+8,326],[96,H,334],[96,H,340]]);
 net='retiring_clear';r(84,H,3,'south');tower('retiring_clear_lift',84,4,H,H+12);r(84,H+12,5,'south');route('retiring_clear_far',[[84,H+12,6],[76,H+12,6],[76,H+12,316],[76,H+5,323],[76,H+5,326],[76,H,331],[76,H,340]],{force:[K(P(76,H+5,325))]});r(77,H,340,'east');
 // Physical delayed levels. Each stage has128 delay4 repeaters (1024 nominal
 // game ticks) plus its real turns. Falling edges must drain the same cells.
 function coil(name,z0,source){group=name+'_delay';net=name;const y=H+4;let from;
  for(let row=0;row<6;row++){const z=z0+4*row,east=row%2===0;for(let k=0;k<64;k++)r(east?160+k:223-k,y,z,east?'east':'west',4);const x=east?224:159;w(x,y,z);if(row<5){r(x,y,z+1,'south');w(x,y,z+2);w(x,y,z+3);w(x,y,z+4);}if(row%2){r(158,y,z,'west');w(157,y,z);delays.push({name,stage:(row+1)/2,source:source,tap:P(157,y,z),slow_repeaters:128*(row+1)/2,nominal_slow_game_ticks:1024*(row+1)/2});}}
  w(159,y,z0);return P(159,y,z0);
 }
 // Extend the actual bank-ready input tower by four levels for a normalized
 // local high-level source; no abstract ready copy is supplied.
 group='bank_ready_delay_feed';net='bank_ready';for(let y=H+1;y<=H+4;y++)put(P(5,y,-5),(y-1)%2?'redstone_torch':S); // H odd: torch at H+1.
 r(6,H+4,-5,'east');w(7,H+4,-5);const rd=coil('ready_delay',40,inputs.bank_ready);net='bank_ready';route('bank_ready_to_delay',[[7,H+4,-5],[150,H+4,-5],[150,H+4,40],[157,H+4,40]]);r(158,H+4,40,'east');
 const rt=coil('retiring_delay',400,retiring);net='retiring';r(retiring.x,H+4,339,'north');route('retiring_to_delay',[[retiring.x,H+4,338],[150,H+4,338],[150,H+4,400],[157,H+4,400]]);r(158,H+4,400,'east');
 // Response cells are a real closed-by-default bank. Its unqualified data may
 // change only while OPEN propagates; consumers use held data + qualified ready.
 group='response_storage';const bank=makeStateBank({width:8,pair:false}),O=P(130,H,100);
 for(const v of bank.blocks){const p=P(v.position.x+O.x,v.position.y+O.y,v.position.z+O.z);net='response/'+(v.part??'bank');put(p,v.block.id,v.block.properties);}
 const response=bank.banks[0].latches.map(v=>Object.fromEntries(Object.entries(v).map(([n,p])=>[n,n==='bit'?p:P(p.x+O.x,p.y+O.y,p.z+O.z)])));
 net='open_response';group='response_open_route';r(92,H,3,'south');route('response_open_distribution',[[92,H,4],[92,H,90],[122,H,90],[122,H,103],[128,H,103]]);r(129,H,103,'east');
 // Retained state/delay feedback descends physically to the actual input pads.
 // Dedicated high levels and nested low returns avoid grid crossings.
 const feedbackSources=[...delays.filter(v=>v.name==='ready_delay').map(v=>[v.stage===1?'ready_t1':v.stage===2?'ready_t2':'ready_t3',v.tap,'west']),...delays.filter(v=>v.name==='retiring_delay'&&v.stage!==2).map(v=>[v.stage===1?'retiring_t1':'retiring_t3',v.tap,'west']),['captured',captured,'east'],['retiring',retiring,'east']];
 for(let i=0;i<feedbackSources.length;i++){
  const[name,src,travel]=feedbackSources[i],sx=travel==='west'?-1:1,x=src.x+2*sx+(travel==='west'?-4*i:0),top=H+40+4*i,dx=-32-32*i,dz=-60;net=name;group='state_and_tail_feedback';r(src.x+sx,src.y,src.z,travel);if(travel==='west'&&i){route(name+'_feedback_tap',[[src.x-2,src.y,src.z],[x+2,src.y,src.z]]);r(x+1,src.y,src.z,'west');}tower(name+'_feedback_lift',x,src.z,src.y,top);r(x,top,src.z+1,'south');
  route(name+'_feedback_high',[[x,top,src.z+2],[dx-4,top,src.z+2],[dx-4,top,dz-6],[dx,top,dz-6],[dx,top,dz-2]]);r(dx,top,dz-1,'south');
  const down=makeSignalDescent({drop:top-1}),off=P(dx,top,dz);for(const v of down.blocks){const p=P(v.position.x+off.x,v.position.y+off.y,v.position.z+off.z);put(p,v.block.id,v.block.properties);}const e0=down.ports.output.bits[0],ep=P(e0.position.x+off.x,e0.position.y+off.y,e0.position.z+off.z),v=e0.travel; r(ep.x+v.x,1,ep.z+v.z,v.x>0?'east':v.x<0?'west':v.z>0?'south':'north');
  const start=P(ep.x+2*v.x,1,ep.z+2*v.z),rx=dx+12,rz=-100-8*i,dst=inputs[name];
  route(name+'_feedback_low',[[start.x,1,start.z],...(v.x<0?[[start.x,1,dz-12],[rx,1,dz-12]]:[[rx,1,start.z]]),[rx,1,rz],[dst.x,1,rz],[dst.x,1,-9]]);r(dst.x,1,-8,'south');feedback.push({name,source:src,lift:P(x,src.y,src.z),top:P(x,top,src.z),descent_origin:off,descent_drop:top-1,destination:dst,normalizer:P(dst.x,1,-8)});
 }
 const port=(direction,positions,meaning)=>({direction,width:positions.length,positions,polarity:'active_high',bit_order:'lsb_first',meaning});
 const ports={};for(const n of variables.slice(0,4))ports[n]=port('input',[inputs[n]],'Actual '+n+' producer; no host runtime drive.');for(const n of['bank_request','consumer_ready','retire','backend_busy'])ports[n]=port('output',[outputs[n]],'Actual normalized '+n+' terminal; all downstream routing still counted separately.');ports.bank_response=port('input',bank.ports.next_data.bits.map(v=>P(v.position.x+O.x,v.position.y+O.y,v.position.z+O.z)),'Eight bank data bits held through the response capture window.');ports.response=port('output',bank.ports.state.bits.map(v=>P(v.position.x+O.x,v.position.y+O.y,v.position.z+O.z)),'Actual retained response; qualified by consumer_ready.');
 const blocks=[...map.values()],box={from:{},to:{}},histogram={},gc={};for(const a of['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}for(const v of blocks){histogram[v.block.id]=(histogram[v.block.id]??0)+1;gc[groups[K(v.position)]]=(gc[groups[K(v.position)]]??0)+1;}
 return{status:'offline_owned_channel_backend_control_candidate_unverified',blocks,nets,groups,ports,variables,terms,input_columns:inputs,outputs,routes,edges,columns,gates,states,feedback,delays,response,box,metrics:{blocks:blocks.length,retained_protocol_bits:2,response_bits:8,product_terms:rows,comparators:gates.length,slow_repeaters:768,nominal_each_delay_stage_slow_ticks:1024,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),histogram,group_counts:gc},native_acceptance:false,complete_component_geometry:true,selected:false,limits:['Standalone connected backend logic only; parent ACTIVE/BUSY/retire/owner-valid and bank routes remain external until union derivative.','All delay figures count actual delay4 cells, not native or complete route timing.','SR cold-state convergence, reset flush, request masking and capture/closure edge ordering need continuous native validation.','Read/write owner/type qualification and bank arbitration are external; no numerical memory contents or phases are supplied by software.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeChannelBackendControl();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
