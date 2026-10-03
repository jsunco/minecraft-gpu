// Physical retained reset/drain component for the pending program controller.
// No native tools or host runtime sequencing. Standalone local coordinates.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'},V={east:[1,0],west:[-1,0],north:[0,-1],south:[0,1]},S='minecraft:light_gray_concrete';
export function makeProgramResetDrain({delayPerRow=16,rows=4}={}){
 assert.equal(delayPerRow,16);assert.equal(rows,4); // This frozen map is exact.
 const map=new Map(),nets={},routes=[],edges=[],delay=[];let net='';
 const put=(p,id,properties)=>{const block={id:'minecraft:'+id,...(properties?{properties}:{})},old=map.get(K(p));if(old){assert.deepEqual(old.block,block,'collision '+K(p));assert(id==='light_gray_concrete'||nets[K(p)]===net,'cross net collision '+K(p));return;}map.set(K(p),{position:p,block});nets[K(p)]=net;};
 const solid=(x,y,z)=>put(P(x,y,z),'light_gray_concrete'),dev=(x,y,z,id,properties)=>{solid(x,y-1,z);put(P(x,y,z),id,properties);};
 const wire=(x,y,z)=>dev(x,y,z,'redstone_wire'),rep=(x,y,z,d,t=1)=>dev(x,y,z,'repeater',{facing:F[d],delay:String(t)}),wall=(x,y,z,f)=>put(P(x,y,z),'redstone_wall_torch',{facing:f});
 const edge=(a,b,kind='signal')=>edges.push({from:a,to:b,kind});
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)if((y-lo)%2===0)solid(x,y,z);else put(P(x,y,z),'redstone_torch');};
 function route(name,points,{force={}}={}){const ps=[P(...points[0])];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],n=Math.abs(dx)+Math.abs(dz);assert(n&&(!dx||!dz)&&(dy===0||Math.abs(dy)===n));for(let j=1;j<=n;j++)ps.push(P(a[0]+Math.sign(dx)*j,a[1]+Math.sign(dy)*j,a[2]+Math.sign(dz)*j));}
  let power=15,maxRun=0,run=0;const refresh=[];for(let i=0;i<ps.length;i++){const p=ps[i],prev=ps[i-1],next=ps[i+1],old=map.get(K(p));if(old){assert.equal(old.block.id,'minecraft:redstone_wire');assert.equal(nets[K(p)],net);power=15;run=0;}else{const flat=prev&&next&&prev.y===p.y&&p.y===next.y&&p.x-prev.x===next.x-p.x&&p.z-prev.z===next.z-p.z;if(flat&&(power<=4||force[K(p)])){const d=Object.keys(V).find(d=>V[d][0]===next.x-p.x&&V[d][1]===next.z-p.z);rep(p.x,p.y,p.z,d,force[K(p)]??1);power=15;run=0;refresh.push(p);}else{wire(p.x,p.y,p.z);power--;run++;assert(power>0,'attenuation '+name+' '+K(p));maxRun=Math.max(maxRun,run);}}if(i)edge(ps[i-1],p,name);}
  routes.push({name,net,path:ps,refresh,max_dust_run:maxRun});return ps;
 }
 // Cross-coupled NOR torches. SET powers the NOT-F support; CLEAR powers F's.
 net='flush';solid(0,1,0);wall(1,1,0,'east');wire(2,1,0);rep(2,1,-1,'north');route('flush_feedback',[[2,1,-2],[2,1,-4],[12,1,-4]],{force:{'8,1,-4':1}});rep(12,1,-3,'south');wire(12,1,-2);rep(12,1,-1,'south');
 net='not_flush';solid(12,1,0);wall(11,1,0,'west');wire(10,1,0);rep(10,1,1,'south');route('not_flush_feedback',[[10,1,2],[10,1,4],[0,1,4]],{force:{'4,1,4':1}});rep(0,1,3,'north');wire(0,1,2);rep(0,1,1,'north');
 edge(P(12,1,-1),P(12,1,0),'flush_to_not_flush_support');edge(P(0,1,1),P(0,1,0),'not_flush_to_flush_support');
 net='reset';wire(16,1,0);rep(15,1,0,'west');net='admitted_reset';dev(14,1,0,'comparator',{facing:'east',mode:'subtract'});rep(13,1,0,'west');edge(P(15,1,0),P(14,1,0),'reset_set_rear');edge(P(14,1,1),P(14,1,0),'tail_set_mask');edge(P(13,1,0),P(12,1,0),'reset_set');
 net='clear';wire(-2,1,0);rep(-1,1,0,'east');edge(P(-1,1,0),P(0,1,0),'clear');
 // Export F above both feedback loops; this is a positive four-level column.
 net='flush';rep(3,1,0,'east');tower(4,0,1,5);rep(5,5,0,'east');wire(6,5,0);route('flush_to_delay',[[6,5,0],[14,5,0]]);rep(15,5,0,'east');
 // Four rows of sixteen maximum-delay repeaters, joined by counted turns.
 // Exactly 64*8 nominal game ticks inside the slow cells, plus turns/routes.
 net='delayed_flush';edge(P(15,5,0),P(16,5,0),'delay_entry');
 for(let row=0;row<4;row++){const z=row*4,east=row%2===0;for(let j=0;j<16;j++){const x=east?16+j:31-j;rep(x,5,z,east?'east':'west',4);delay.push(P(x,5,z));}
  if(row<3){const x=east?32:15;wire(x,5,z);rep(x,5,z+1,'south');wire(x,5,z+2);wire(x,5,z+3);wire(x,5,z+4);}
 }
 wire(15,5,12);rep(14,5,12,'west');for(let x=13;x>=10;x--)wire(x,5,12);rep(9,5,12,'west');
 // CLEAR = delayed F. SET is masked by delayed F so a new reset cannot
 // create a short F pulse during the previous tail. Raw RESET also masks
 // admission directly, including the turnover when held for many periods.
 net='clear';rep(8,5,12,'west');rep(7,5,12,'west');wire(6,5,12);rep(5,5,12,'west');
 edge(P(9,5,12),P(8,5,12),'clear_rear');
 route('clear_to_latch',[[4,5,12],[0,1,12],[-4,1,12],[-4,1,0]],{force:{'-4,1,4':1}});rep(-3,1,0,'east');
 // The actual tail mask descends outside the latch's feedback loops.
 net='delayed_flush';rep(10,5,11,'north');route('tail_to_set_mask',[[10,5,10],[14,5,10],[14,1,6],[14,1,2]]);rep(14,1,1,'north');
 // BLOCKED = RESET OR F OR delayed F, with isolation before the merge. Even
 // after F clears, its last delayed high must fall before reuse is permitted.
 net='flush';rep(6,5,-1,'north');wire(6,5,-2);rep(6,5,-3,'north');tower(6,-4,5,9);rep(7,9,-4,'east');
 net='blocked';wire(8,9,-4);wire(9,9,-4);wire(10,9,-4);edge(P(7,9,-4),P(8,9,-4),'flush_or');
 net='delayed_flush';rep(10,5,13,'south');wire(10,5,14);rep(10,5,15,'south');tower(10,16,5,9);rep(10,9,15,'north');
 route('tail_to_blocked',[[10,9,14],[10,9,-2]],{force:{'10,9,3':1}});rep(10,9,-3,'north');edge(P(10,9,-3),P(10,9,-4),'tail_or');
 net='reset';rep(17,1,0,'east');route('reset_to_rise',[[18,1,0],[38,1,0]]);rep(39,1,0,'east');tower(40,0,1,9);rep(40,9,-1,'north');route('reset_to_blocked',[[40,9,-2],[40,9,-8],[10,9,-8],[10,9,-6]]);rep(10,9,-5,'south');edge(P(10,9,-5),P(10,9,-4),'reset_or');
 net='blocked';rep(11,9,-4,'east');wire(12,9,-4);rep(13,9,-4,'east');solid(14,9,-4);
 net='drained';wall(15,9,-4,'east');wire(16,9,-4);rep(17,9,-4,'east');wire(18,9,-4);
 edge(P(13,9,-4),P(14,9,-4),'drained_invert');
 const blocks=[...map.values()],box={from:{},to:{}},histogram={};for(const axis of['x','y','z']){box.from[axis]=Math.min(...blocks.map(v=>v.position[axis]));box.to[axis]=Math.max(...blocks.map(v=>v.position[axis]));}for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 const port=(direction,p,meaning)=>({direction,width:1,position:p,polarity:'active_high',meaning});
 return{status:'offline_program_reset_drain_component_unintegrated_native_unverified',blocks,nets,routes,edges,delay_cells:delay,box,ports:{reset:port('input',P(16,1,0),'Global reset held until actual reset admission. Does not clear ROM bits.'),flush:port('diagnostic',P(2,1,0),'Retained reset/drain state F.'),delayed_flush:port('diagnostic',P(10,5,12),'Positive delayed copy of F.'),blocked:port('output',P(12,9,-4),'Blocks new grant while RESET, F or its delayed tail is high.'),drained:port('output',P(18,9,-4),'Complement of BLOCKED after its actual inverter/receiver delay.')} ,metrics:{blocks:blocks.length,retained_protocol_bits:1,slow_delay_repeaters:delay.length,slow_delay_nominal_game_ticks:delay.length*8,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),histogram},logic:{set:'RESET AND NOT D(F)',clear:'D(F)',blocked:'RESET OR F OR D(F)'},limits:['This is one physical reset/drain component, not the complete program-memory controller.','The 512 slow-cell ticks are a counted nominal delay, not the complete route time or a proved ROM/control flushing bound.','Placement initialization, reset pulse width, feedback settling and all delay margins require native proof.','ACTIVE state, normal delay phases, OPEN routing, ready/owner qualification and parent integration are still missing.','No site, live build plan, software-driven running phase or native result exists.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const dir=process.argv[2];assert(dir);mkdirSync(dir,{recursive:true});const d=makeProgramResetDrain();writeFileSync(join(dir,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
