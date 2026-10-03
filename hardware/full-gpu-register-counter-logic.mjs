// Offline actual counter/boot transition and terminal-guard gates.
// No runtime host evaluation; all literals, conjunctions and sums are blocks.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export const INPUTS=['address_0','address_1','address_2','address_3','boot','branch_sweep','branch_zero','counter_zero','initialize','boot_set','boot_clear'];
// Carry expressions are ordinary literal gates here, not a hidden incrementer.
// ZERO_ADVANCE at address12 holds12; ordinary increment would produce13, so
// only bit0 needs a special guard. All higher result bits already agree.
export function counterTerms(){const terms=[];const term=(name,literals,bits)=>terms.push({name,literals,bits});
 const base={counter_zero:0,initialize:0};
 for(let bit=0;bit<4;bit++){
  term('hold_'+bit,{...base,['address_'+bit]:1,branch_sweep:0,branch_zero:0},[bit]);
  for(const mode of['branch_sweep','branch_zero']){
   const carry=Object.fromEntries(Array.from({length:bit},(_,j)=>['address_'+j,1]));
   if(bit===0&&mode==='branch_zero'){
    term('zero_low_not12_a1',{...base,branch_zero:1,address_0:0,address_1:1},[0]);
    term('zero_low_not12_a2',{...base,branch_zero:1,address_0:0,address_1:0,address_2:0},[0]);
    term('zero_low_not12_a3',{...base,branch_zero:1,address_0:0,address_1:0,address_2:1,address_3:0},[0]);
   }else term(mode+'_flip_to_one_'+bit,{...base,[mode]:1,...carry,['address_'+bit]:0},[bit]);
   for(let firstZero=0;firstZero<bit;firstZero++)term(mode+'_stay_one_'+bit+'_'+firstZero,{...base,[mode]:1,['address_'+bit]:1,...Object.fromEntries(Array.from({length:firstZero},(_,j)=>['address_'+j,1])),['address_'+firstZero]:0},[bit]);
  }
 }
 term('boot_hold',{boot:1,boot_clear:0,initialize:0},[4]);term('boot_set',{boot_set:1,boot_clear:0,initialize:0},[4]);
 term('guard_12',{address_0:0,address_1:0,address_2:1,address_3:1},[5]);term('guard_15',{address_0:1,address_1:1,address_2:1,address_3:1},[6]);return terms;
}
export function makeRegisterCounterLogic({dense=false}={}){
 const map=new Map(),terms=counterTerms(),inputs=INPUTS,rows=[],towers=[],ports={},edges=[];let part='';
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 const input=(name,p,receiver)=>ports[name]={direction:'input',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:p,receiver,travel:P(0,0,1)}]};
 const lastY=1+4*(terms.length-1),fixedY=lastY+4,outY=lastY+3,lastX=5*(inputs.length-1),orStart=lastX+9;
 for(const[j,name]of inputs.entries()){
  const used=terms.map((t,i)=>t.literals[name]!==undefined?i:-1).filter(i=>i>=0),first=dense?1:1+4*Math.min(...used),last=dense?lastY:1+4*Math.max(...used);
  const x=5*j;part='input_'+name;for(let y=first;y<=last;y++){if(y%2)solid(P(x,y,-5));else put(P(x,y,-5),'redstone_torch');}
  wire(P(x,first,-7));rep(P(x,first,-6),'south');edge(P(x,first,-7),P(x,first,-6));edge(P(x,first,-6),P(x,first,-5));input(name,P(x,first,-7),P(x,first,-6));towers.push({name,x,z:-5,first_y:first,last_y:last});
 }
 for(let bit=0;bit<7;bit++){part='next_or_'+bit;const x=orStart+4*bit;for(let y=1;y<outY;y++){if(y%2)solid(P(x,y,3));else put(P(x,y,3),'redstone_torch');}solid(P(x,0,3));put(P(x,outY,3),'redstone_torch');rep(P(x,outY,4),'south');wire(P(x,outY,5));edge(P(x,outY,3),P(x,outY,4));edge(P(x,outY,4),P(x,outY,5));

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
 ports.next_values={direction:'output',width:7,polarity:'active_high',bit_order:'lsb_first',bits:Array.from({length:7},(_,bit)=>({bit,position:P(orStart+4*bit,outY,5),source:P(orStart+4*bit,outY,4),travel:P(0,0,1)}))};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'unselected_unreviewed_counter_matrix_cost_exploration',selected_for_integration:false,focused_check_status:'not_reviewed',dense,blocks,ports,rows,towers,edges,or_columns:Array.from({length:7},(_,bit)=>({bit,x:orStart+4*bit,z:3,last_y:lastY,output_y:outY,...(!dense?{fixed_injection_y:fixedY}:{})})),box,metrics:{blocks:blocks.length,product_rows:terms.length,input_signals:INPUTS.length,literal_gates:rows.reduce((n,r)=>n+r.gates.length,0),dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,limits:['Seven real outputs: four next-address bits, next-boot, address==12 and address==15.','Guard rows sense retained address directly; address0..3 and boot still need stored feedback and phase control.','Stable branch_sweep and branch_zero are mutually exclusive decoded microstates; no claim for simultaneous corruption.','Initialize overrides all five next stored values. Guards need not be suppressed while architectural actions are blanked.','All producer paths and real bank captures are separate integration; not autonomous operation or physical proof.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterCounterLogic();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
