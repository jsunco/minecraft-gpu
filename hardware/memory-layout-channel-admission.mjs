// Folded physical admission/reset sequencer for the original-channel derivative.
// Counted delays remain native-unverified; no host phase or runtime computation.
import assert from 'node:assert/strict';
import {makeProgramResetDrain} from './memory-layout-program-reset.mjs';
import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'};
export function makeChannelAdmission(){
 const map=new Map(),nets={},routes=[],coils=[],taps=[];let net='';
 const put=(p,b)=>{const old=map.get(K(p));if(old){assert.deepEqual(old.block,b,'admission collision '+K(p));assert(b.id===S||nets[K(p)]===net,'net collision '+K(p));return;}map.set(K(p),{position:p,block:b});nets[K(p)]=net;};
 const solid=(x,y,z)=>put(P(x,y,z),{id:S}),dev=(x,y,z,id,properties)=>{solid(x,y-1,z);put(P(x,y,z),{id:'minecraft:'+id,...(properties?{properties}:{})});},w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,d,t=1)=>dev(x,y,z,'repeater',{facing:F[d],delay:String(t)}),c=(x,y,z,d)=>dev(x,y,z,'comparator',{facing:F[d],mode:'subtract'});
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)put(P(x,y,z),{id:(y-lo)%2?'minecraft:redstone_torch':S});};
 function route(name,points,{wireOnly=[]}={}){const ps=[P(...points[0])];for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],dx=b[0]-a[0],dz=b[2]-a[2];assert.equal(a[1],b[1]);assert(!dx||!dz);for(let k=1;k<=Math.abs(dx)+Math.abs(dz);k++)ps.push(P(a[0]+Math.sign(dx)*k,a[1],a[2]+Math.sign(dz)*k));}let run=0;for(let i=0;i<ps.length;i++){const p=ps[i],a=ps[i-1],b=ps[i+1],old=map.get(K(p));if(old){assert.equal(old.block.id,'minecraft:redstone_wire',name+' occupied '+K(p));assert.equal(nets[K(p)],net);run=0;continue;}if(a&&b&&run>=10&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z&&!wireOnly.includes(K(p))){r(p.x,p.y,p.z,b.x>p.x?'east':b.x<p.x?'west':b.z>p.z?'south':'north');run=0;}else{w(p.x,p.y,p.z);assert(++run<=14,name);}}routes.push({name,net,path:ps});}
 function component(kind,X,rows){
  const core=makeProgramResetDrain();
  for(const v of core.blocks){const p=v.position,n=core.nets[K(p)];if(n==='delayed_flush'&&p.x>=15&&[4,5].includes(p.y)&&p.z>=0&&p.z<=12)continue;net=kind+'_'+n;put(P(p.x+X,p.y,p.z),v.block);}
  net=kind+'_flush';tower(X+16,0,5,17);r(X+17,17,0,'east');route(kind+'_delay_input',[[X+18,17,0],[X+62,17,0]]);r(X+63,17,0,'east');
  net=kind+'_delayed_flush';const slow=[];
  for(let row=0;row<rows;row++){const z=4*row,east=row%2===0;for(let j=0;j<64;j++){const x=east?X+64+j:X+127-j;r(x,17,z,east?'east':'west',4);slow.push(P(x,17,z));}const x=east?X+128:X+63;w(x,17,z);if(row<rows-1){r(x,17,z+1,'south');w(x,17,z+2);w(x,17,z+3);w(x,17,z+4);}
   if(kind==='active'&&row%2===1){r(X+62,17,z,'west');tower(X+61,z,17,21);r(X+60,21,z,'west');w(X+59,21,z);taps.push({index:(row+1)*64,position:P(X+59,21,z),slow_game_ticks:(row+1)*64*8});}
  }
  const z=4*(rows-1),dz=z+28; r(X+63,17,z+1,'south');route(kind+'_tail_out',[[X+63,17,z+2],[X+63,17,dz],[X+50,17,dz]]);r(X+49,17,dz,'west');
  const down=makeSignalDescent({drop:12}),T=p=>P(X+48-p.x,17+p.y,dz+p.z);
  for(const v of down.blocks){const b=structuredClone(v.block);if(b.properties?.facing==='west')b.properties.facing='east';else if(b.properties?.facing==='east')b.properties.facing='west';put(T(v.position),b);}
  const e=T(down.path.at(-1));r(e.x,e.y,e.z-1,'north');route(kind+'_tail_return',[[e.x,e.y,e.z-2],[e.x,e.y,12],[X+15,e.y,12]]);
  coils.push({kind,rows,width:64,slow_cells:slow,slow_game_ticks:slow.length*8,tail_return:P(X+15,5,12),folded_descent:down.drop});
 }
 component('active',0,16);component('reset',220,24);
 // Physical reset is retained until its longer flush line returns. Its actual
 // BLOCKED output masks every capture pulse and both ACTIVE set/clear sides.
 net='reset_blocked';r(232,9,-5,'north');w(232,9,-6);r(233,9,-6,'east');tower(234,-6,9,13);r(233,13,-6,'west');route('reset_to_masks',[[232,13,-6],[52,13,-6],[52,13,-18],[36,13,-18],[36,13,42]],{wireOnly:[-14,10,26,42].map(z=>K(P(36,13,z)))});r(36,13,43,'south');w(36,13,44);
 const phases=[['open_owner',-12,null,4],['open_address',12,12,20],['write_phase',28,28,36],['open_response',44,44,52]],ports={};
 net='active_flush';r(16,17,-1,'north');route('active_to_first_phase',[[16,17,-2],[16,17,-14]]);r(16,17,-15,'north');tower(16,-16,17,21);r(17,21,-16,'east');route('first_phase_rear',[[18,21,-16],[44,21,-16],[44,21,-12],[42,21,-12]]);r(41,21,-12,'west');
 for(const[name,z,early,late]of phases){
  if(early!==null){net='active_delayed_flush';route(name+'_early',[[59,21,early],[42,21,early]]);r(41,21,z,'west');}
  net='active_delayed_flush';route(name+'_late',[[59,21,late],[40,21,late],[40,21,z+2]]);r(40,21,z+1,'north');
  net='reset_blocked';r(37,13,z-2,'east');w(38,13,z-2);r(39,13,z-2,'east');tower(40,z-2,13,21);r(40,21,z-1,'south');
  net=name;c(40,21,z,'west');r(39,21,z,'west');w(38,21,z);ports[name]=P(38,21,z);
 }
 // Reset CLEAR also physically suppresses SET, avoiding simultaneous S/R.
 net='reset_blocked';route('reset_to_active_descent',[[36,13,-18],[-20,13,-18],[-20,13,-22],[-18,13,-22]]);r(-17,13,-22,'east');const down=makeSignalDescent({drop:16}),T=p=>P(p.x-16,p.y+13,p.z-22);for(const v of down.blocks)put(T(v.position),v.block);const e=T(down.path.at(-1));assert.deepEqual(e,P(-10,-3,-15));r(-10,-3,-14,'south');route('reset_active_floor',[[-10,-3,-13],[14,-3,-13],[14,-3,-4]],{wireOnly:[K(P(0,-3,-13))]});r(14,-3,-3,'south');tower(14,-2,-3,1);r(14,1,-1,'south');r(0,-3,-12,'south');route('reset_clear_floor',[[0,-3,-11],[0,-3,-4]]);r(0,-3,-3,'south');tower(0,-2,-3,1);r(0,1,-1,'south');
 // The free-running admission source is an actual constant, never a host step.
 net='active_reset';r(16,1,-1,'south');put(P(16,1,-2),{id:'minecraft:redstone_block'});
 return{blocks:[...map.values()],nets,routes,coils,taps,ports:{...ports,reset:P(236,1,0),active:P(16,17,0),blocked:P(36,13,44)},nominal:{normal_slow_cells:1024,normal_slow_game_ticks:8192,reset_slow_cells:1536,reset_slow_game_ticks:12288,capture_window_slow_game_ticks:1024,between_capture_slow_game_ticks:1024,period_slow_game_ticks:16384},limits:['Delay figures count slow cells only; complete edge arrival and close-before-next margins need native proof.','Admission snapshots stable free/idle masks; release-within-HDL-loop timing equivalence is not claimed.']};
}
