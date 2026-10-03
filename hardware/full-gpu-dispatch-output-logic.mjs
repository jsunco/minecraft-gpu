// Offline actual dispatch output next-state gates.
// No runtime host evaluation; all literals, conjunctions and sums are blocks.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export const INPUTS=['clear_all','owner_state','toggle_owner','done_state','set_done','core0_start_state','core1_start_state','lower_start','raise_start','core0_reset_state','core1_reset_state','assert_reset','lower_reset'];
export const OUTPUTS=['owner','done','core0_start','core0_reset','core1_start','core1_reset'];
export function outputTerms(){const terms=[],term=(name,literals,bits)=>terms.push({name,literals,bits});
term('owner_hold',{clear_all:0,owner_state:1,toggle_owner:0},[0]);term('owner_flip',{clear_all:0,owner_state:0,toggle_owner:1},[0]);term('done_hold',{clear_all:0,done_state:1},[1]);term('done_set',{clear_all:0,set_done:1},[1]);term('reset_all',{clear_all:1},[3,5]);
for(let core=0;core<2;core++){const start='core'+core+'_start_state',reset='core'+core+'_reset_state',startBit=2+2*core,resetBit=3+2*core;
term('start'+core+'_unselected',{clear_all:0,[start]:1,owner_state:1-core},[startBit]);term('start'+core+'_hold',{clear_all:0,[start]:1,owner_state:core,lower_start:0},[startBit]);term('start'+core+'_set',{clear_all:0,owner_state:core,raise_start:1,lower_start:0},[startBit]);
term('reset'+core+'_set',{owner_state:core,assert_reset:1},[resetBit]);term('reset'+core+'_unselected',{[reset]:1,owner_state:1-core},[resetBit]);term('reset'+core+'_hold',{[reset]:1,owner_state:core,lower_reset:0},[resetBit]);}return terms;}
export function makeDispatchOutputLogic({dense=false}={}){
 const map=new Map(),terms=outputTerms(),inputs=INPUTS,rows=[],towers=[],ports={},edges=[];let part='';
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 const input=(name,p,receiver)=>ports[name]={direction:'input',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:p,receiver,travel:P(0,0,1)}]};
 const lastY=1+4*(terms.length-1),fixedY=lastY+4,outY=lastY+3,lastX=5*(inputs.length-1),orStart=lastX+9;
 for(const[j,name]of inputs.entries()){
  const used=terms.map((t,i)=>t.literals[name]!==undefined?i:-1).filter(i=>i>=0),first=dense?1:1+4*Math.min(...used),last=dense?lastY:1+4*Math.max(...used);
  const x=5*j;part='input_'+name;for(let y=first;y<=last;y++){if(y%2)solid(P(x,y,-5));else put(P(x,y,-5),'redstone_torch');}
  wire(P(x,first,-7));rep(P(x,first,-6),'south');edge(P(x,first,-7),P(x,first,-6));edge(P(x,first,-6),P(x,first,-5));input(name,P(x,first,-7),P(x,first,-6));towers.push({name,x,z:-5,first_y:first,last_y:last});
 }
 for(let bit=0;bit<6;bit++){part='next_or_'+bit;const x=orStart+4*bit;for(let y=1;y<outY;y++){if(y%2)solid(P(x,y,3));else put(P(x,y,3),'redstone_torch');}solid(P(x,0,3));put(P(x,outY,3),'redstone_torch');rep(P(x,outY,4),'south');wire(P(x,outY,5));edge(P(x,outY,3),P(x,outY,4));edge(P(x,outY,4),P(x,outY,5));

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
 ports.next_values={direction:'output',width:6,polarity:'active_high',bit_order:'lsb_first',bits:Array.from({length:6},(_,bit)=>({bit,position:P(orStart+4*bit,outY,5),source:P(orStart+4*bit,outY,4),travel:P(0,0,1)}))};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_dispatch_retained_output_next_logic',selected_for_integration:false,focused_check_status:'author_checks_separate',dense,blocks,ports,rows,towers,edges,or_columns:Array.from({length:6},(_,bit)=>({bit,x:orStart+4*bit,z:3,last_y:lastY,output_y:outY})),box,metrics:{blocks:blocks.length,product_rows:terms.length,input_signals:INPUTS.length,literal_gates:rows.reduce((n,r)=>n+r.gates.length,0),dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,limits:['Actual conditional next-output gates only; six retained feedback banks and all phase/event/core routes remain to be joined.','Clear dominates done/start/owner and asserts both reset outputs; lower_start dominates raise_start if corrupted together.','Legal decoded actions still require physical phase/admission blanking; static gate truth does not prove timing or initialization.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDispatchOutputLogic();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
