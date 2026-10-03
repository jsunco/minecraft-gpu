// Offline concrete product/OR network for the binary register microsequencer.
// No runtime host evaluation; all literals, conjunctions and sums are blocks.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export const INPUTS=['fixed_next_0','fixed_next_1','fixed_next_2','fixed_next_3','fixed_next_4','branch_sweep','branch_zero','branch_reset_wait','branch_idle','branch_assign_finish','branch_event_wait','is_15','is_12','reset_request','event_request','event_kind_0','event_kind_1','boot'];
export function transitionTerms(){const terms=[];const term=(name,literals,bits)=>terms.push({name,literals,bits});
 for(let bit=0;bit<5;bit++)term('fixed_'+bit,{['fixed_next_'+bit]:1},[bit]);
 term('sweep_base',{branch_sweep:1},[0]);term('sweep_last',{branch_sweep:1,is_15:1},[2]);term('sweep_more',{branch_sweep:1,is_15:0},[1]);
 term('zero_base',{branch_zero:1},[1]);term('zero_last',{branch_zero:1,is_12:1},[3]);term('zero_more',{branch_zero:1,is_12:0},[2]);
 term('reset_wait_base',{branch_reset_wait:1},[4]);term('reset_wait_hold',{branch_reset_wait:1,reset_request:1},[0,1]);term('reset_wait_release',{branch_reset_wait:1,reset_request:0},[2]);
 term('idle_hold',{branch_idle:1,event_request:0},[2,4]);term('idle_read',{branch_idle:1,event_request:1,event_kind_0:1,event_kind_1:0},[0,2,4]);
 term('idle_update',{branch_idle:1,event_request:1,event_kind_0:0,event_kind_1:1},[0,1,3,4]);
 for(const b of[0,1])term('idle_other_'+b,{branch_idle:1,event_request:1,event_kind_0:b,event_kind_1:b},[1,3]);
 term('assign_base',{branch_assign_finish:1},[0,2,3]);term('assign_regular',{branch_assign_finish:1,boot:0},[1,4]);
 term('ack_base',{branch_event_wait:1},[2,4]);term('ack_hold',{branch_event_wait:1,event_request:1},[0,1,3]);return terms;
}
export function makeRegisterNextState({dense=false}={}){
 const map=new Map(),terms=transitionTerms().filter(t=>dense||!t.name.startsWith('fixed_')),inputs=INPUTS.filter(n=>dense||!n.startsWith('fixed_next_')),rows=[],towers=[],ports={},edges=[];let part='';
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 const input=(name,p,receiver)=>ports[name]={direction:'input',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:p,receiver,travel:P(0,0,1)}]};
 const lastY=1+4*(terms.length-1),fixedY=lastY+4,outY=lastY+(dense?3:7),lastX=5*(inputs.length-1),orStart=lastX+9;
 for(const[j,name]of inputs.entries()){
  const used=terms.map((t,i)=>t.literals[name]!==undefined?i:-1).filter(i=>i>=0),first=dense?1:1+4*Math.min(...used),last=dense?lastY:1+4*Math.max(...used);
  const x=5*j;part='input_'+name;for(let y=first;y<=last;y++){if(y%2)solid(P(x,y,-5));else put(P(x,y,-5),'redstone_torch');}
  wire(P(x,first,-7));rep(P(x,first,-6),'south');edge(P(x,first,-7),P(x,first,-6));edge(P(x,first,-6),P(x,first,-5));input(name,P(x,first,-7),P(x,first,-6));towers.push({name,x,z:-5,first_y:first,last_y:last});
 }
 for(let bit=0;bit<5;bit++){part='next_or_'+bit;const x=orStart+4*bit;for(let y=1;y<outY;y++){if(y%2)solid(P(x,y,3));else put(P(x,y,3),'redstone_torch');}solid(P(x,0,3));put(P(x,outY,3),'redstone_torch');rep(P(x,outY,4),'south');wire(P(x,outY,5));edge(P(x,outY,3),P(x,outY,4));edge(P(x,outY,4),P(x,outY,5));
  if(!dense){wire(P(x+2,fixedY,3));rep(P(x+1,fixedY,3),'west');edge(P(x+2,fixedY,3),P(x+1,fixedY,3));edge(P(x+1,fixedY,3),P(x,fixedY,3));input('fixed_next_'+bit,P(x+2,fixedY,3),P(x+1,fixedY,3));ports['fixed_next_'+bit].bits[0].travel=P(-1,0,0);}
 }
 for(const[i,t]of terms.entries()){
  const y=1+4*i,firstColumn=dense?0:Math.min(...Object.keys(t.literals).map(n=>inputs.indexOf(n))),lastColumn=dense?inputs.length-1:Math.max(...Object.keys(t.literals).map(n=>inputs.indexOf(n))),firstX=5*firstColumn,lastGateX=5*lastColumn;part='product_'+t.name;dev(P(firstX-3,y,0),'redstone_block');rep(P(firstX-2,y,0),'east');wire(P(firstX-1,y,0));const row={...t,y,gates:[],path:[P(firstX-3,y,0),P(firstX-2,y,0),P(firstX-1,y,0)]};
  // Every actual literal has a normalized subtract mask. Bypassed columns are
  // ordinary refreshed pass-through, not hidden Boolean operations.
  for(const[j,name]of inputs.entries()){
   if(j<firstColumn||j>lastColumn)continue;
   const x=5*j,wanted=t.literals[name];
   if(wanted!==undefined){rep(P(x,y,0),'east');dev(P(x+1,y,0),'comparator',{facing:'west',mode:'subtract'});wire(P(x+2,y,0));rep(P(x+3,y,0),'east');wire(P(x+4,y,0));
    // A tower's solid at every fourth level has original input polarity.
    if(wanted){put(P(x,y,-4),'redstone_wall_torch',{facing:'south'});wire(P(x,y,-3));}
    else{wire(P(x,y,-4));rep(P(x,y,-3),'south');}
    wire(P(x,y,-2));wire(P(x+1,y,-2));rep(P(x+1,y,-1),'south');
    edge(P(x,y,-5),P(x,y,-4));edge(P(x,y,-4),P(x,y,-3));edge(P(x,y,-3),P(x,y,-2));edge(P(x,y,-2),P(x+1,y,-2));edge(P(x+1,y,-2),P(x+1,y,-1));edge(P(x+1,y,-1),P(x+1,y,0));
    row.gates.push({name,wanted,comparator:P(x+1,y,0),mask:P(x+1,y,-1),tower:P(x,y,-5)});
   }else{for(let q=0;q<5;q++){if(q===0)rep(P(x+q,y,0),'east');else wire(P(x+q,y,0));}}
   for(let q=0;q<5;q++)row.path.push(P(x+q,y,0));
  }
  const maxX=orStart+4*Math.max(...t.bits),tapX=new Set(t.bits.map(bit=>orStart+4*bit));let lastRefresh=Math.max(...row.path.filter(p=>map.get(K(p)).block.id==='minecraft:repeater').map(p=>p.x));for(let x=lastGateX+5;x<=maxX;x++){if(x-lastRefresh>=10&&!tapX.has(x)){rep(P(x,y,0),'east');lastRefresh=x;}else wire(P(x,y,0));row.path.push(P(x,y,0));}
  for(const bit of t.bits){const x=orStart+4*bit;wire(P(x,y,1));rep(P(x,y,2),'south');edge(P(x,y,0),P(x,y,1));edge(P(x,y,1),P(x,y,2));edge(P(x,y,2),P(x,y,3));}
  for(let p=1;p<row.path.length;p++)edge(row.path[p-1],row.path[p]);rows.push(row);
 }
 ports.next_state={direction:'output',width:5,polarity:'active_high',bit_order:'lsb_first',bits:Array.from({length:5},(_,bit)=>({bit,position:P(orStart+4*bit,outY,5),source:P(orStart+4*bit,outY,4),travel:P(0,0,1)}))};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_register_conditional_next_state_geometry_native_unverified',dense,blocks,ports,rows,towers,edges,or_columns:Array.from({length:5},(_,bit)=>({bit,x:orStart+4*bit,z:3,last_y:lastY,output_y:outY,...(!dense?{fixed_injection_y:fixedY}:{})})),box,metrics:{blocks:blocks.length,product_rows:terms.length,input_signals:INPUTS.length,literal_gates:rows.reduce((n,r)=>n+r.gates.length,0),dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,limits:['Conditional truth network only. All18 producer routes, state-bank feedback, clock and initialize clamp remain separate integration work.','Only one stable microstate may assert its corresponding controls; intermediate decoder hazards must be blanked.','Event kind3 deliberately follows OTHER like the semantic reference.','Feedback does not imply timing safety; all column and gate delays are unmeasured.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterNextState();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
