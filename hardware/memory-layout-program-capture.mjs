// Actual program memory payload state: priority-owner, address mux/capture and
// response capture connected to the folded ROM. Handshake sequencer is NOT here.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeFoldedProgramROM} from './memory-layout-program-folded.mjs';
import {key} from './memory-layout-subarray.mjs';
const S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'},P=(x,y,z)=>({x,y,z}),A=['x','y','z'];
const sha=b=>createHash('sha256').update(b).digest('hex');
export function makeProgramCapture({image=Array(256).fill(0),id='program_capture'}={}){
 const source='1c61424d326f02fd9e16fda9652e9fa79cab7ce16f631f189f61c844e7a10b31';assert.equal(sha(readFileSync(new URL('./memory-layout-program-folded.mjs',import.meta.url))),source);
 const parent=makeFoldedProgramROM({image}),cells=new Map(parent.blocks.map(v=>[key(v.position),v])),groups={...parent.groups},nets={...parent.nets},added=[],stores=[],muxes=[],routes=[];let group='',net='';
 const put=(p,b)=>{const k=key(p),old=cells.get(k);if(old){assert.deepEqual(old.block,b,'Collision '+k+' '+groups[k]+' / '+group);assert(b.id===S||nets[k]===net,'Net collision '+k);return;}const v={position:p,block:b};cells.set(k,v);groups[k]=group;nets[k]=net;added.push(v);};
 const solid=(x,y,z)=>put(P(x,y,z),{id:S}),dev=(x,y,z,id,properties)=>{solid(x,y-1,z);put(P(x,y,z),{id:'minecraft:'+id,...(properties?{properties}:{})});};
 const wire=(x,y,z)=>dev(x,y,z,'redstone_wire'),rep=(x,y,z,t)=>dev(x,y,z,'repeater',{facing:F[t],delay:'1'}),cmp=(x,y,z,t)=>dev(x,y,z,'comparator',{facing:F[t],mode:'subtract'}),wall=(x,y,z,facing)=>put(P(x,y,z),{id:'minecraft:redstone_wall_torch',properties:{facing}});
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)if((y-lo)%2===0)solid(x,y,z);else put(P(x,y,z),{id:'minecraft:redstone_torch'});};
 const addStore=(name,bit,driver,q,lock,terminal)=>stores.push({name,bit,driver,storage:q,lock,terminal});
 const incoming=[[],[]],depth=[-4,-8,-12,-16,-25,-21,-33,-29],openPorts={};
 // Fixed-priority owner data is V1 AND NOT V0. Owner must close before address
 // capture begins; the future sequencer owns these explicit phase inputs.
 const y=-37;group='priority_owner';net='valid1';wire(45,y,-85);rep(46,y,-85,'east');wire(47,y,-85);net='owner_data';cmp(48,y,-85,'east');rep(49,y,-85,'east');wire(50,y,-85);rep(51,y,-85,'east');net='owner';rep(52,y,-85,'east');wire(53,y,-85);rep(54,y,-85,'east');
 net='valid0';wire(48,y,-83);rep(48,y,-84,'north');
 net='hold_owner';rep(52,y,-84,'north');for(let z=-83;z<=-75;z++)wire(52,y,z);for(let x=53;x<=56;x++)wire(x,y,-75);
 net='open_owner';wire(56,y,-79);rep(56,y,-78,'south');solid(56,y,-77);net='hold_owner';wall(56,y,-76,'south');openPorts.owner=P(56,y,-79);
 addStore('owner',0,P(51,y,-85),P(52,y,-85),P(52,y,-84),P(53,y,-85));
 group='owner_distribution';net='owner';for(let x=55;x<=80;x++)if(x===67)rep(x,y,-85,'east');else wire(x,y,-85);
 for(const x of[60,80]){rep(x,y,-84,'south');for(let z=-83;z<=-77;z++)wire(x,y,z);rep(x,y,-76,'south');tower(x,-75,-37,-5);}
 // Normally closed address bank. Positive hold levels are phase-aligned with
 // high-nibble stores; low-nibble branches read the positive support one below.
 group='address_hold_distribution';net='open_address';wire(76,y,-77);rep(76,y,-76,'south');solid(76,y,-75);net='hold_address';wall(76,y,-74,'south');wire(76,y,-73);rep(76,y,-72,'south');wire(76,y,-71);rep(76,y,-70,'south');tower(76,-69,-37,-5);openPorts.address=P(76,y,-77);
 for(let b=0;b<8;b++){
  const y=depth[b],low=b<4;group='address_mux';
  for(let c=0;c<2;c++){const x=c?72:64;net='consumer_address'+c+'_'+b;wire(x,y,-78);rep(x,y,-77,'south');wire(x,y,-76);incoming[c].push(P(x,y,-78));net='selected_address'+b;cmp(x,y,-75,'south');rep(x,y,-74,'south');}
  for(let x=64;x<=72;x++)wire(x,y,-73);rep(68,y,-72,'south');wire(68,y,-71);rep(68,y,-70,'south');net='address'+b;rep(68,y,-69,'south');wire(68,y,-68);rep(68,y,-67,'south');for(let z=-66;z<=-56;z++)wire(68,y,z);rep(68,y,-55,'south');
  net='owner';if(low){rep(61,y-1,-75,'east');wire(62,y,-75);}else{wire(61,y,-75);wire(62,y,-75);}rep(63,y,-75,'east');
  if(low){rep(79,y-1,-75,'west');wire(78,y,-75);rep(77,y,-75,'west');solid(76,y,-75);net='not_owner_'+b;wall(75,y,-75,'west');wire(74,y,-75);}else{rep(79,y,-75,'west');solid(78,y,-75);net='not_owner_'+b;wall(77,y,-75,'west');for(let x=76;x>=74;x--)wire(x,y,-75);}rep(73,y,-75,'west');
  group='address_locks';net='hold_address';rep(75,low?y-1:y,-69,'west');for(let x=74;x>=70;x--)wire(x,y,-69);rep(69,y,-69,'west');
  addStore('address',b,P(68,y,-70),P(68,y,-69),P(69,y,-69),P(68,y,-68));muxes.push({bit:b,owner_source:P(60,low?y-1:y,-75),branches:[P(64,y,-75),P(72,y,-75)],mask_diodes:[P(63,y,-75),P(73,y,-75)],owner_inverter:low?P(75,y,-75):P(77,y,-75),result:P(68,y,-71),destination:parent.ports.address.positions[b]});
 }
 // Response bits interleave two height planes, retaining four-block row pitch
 // per plane despite the folded ROM's two-block physical output pitch.
 const response=[];group='response_input';
 for(let b=0;b<16;b++){
  const z=-60-2*b,y=b%2?283:279;net='read'+b;rep(71,279,z,'east');tower(72,z,279,y);wire(73,y,z);rep(74,y,z,'east');net='response'+b;rep(75,y,z,'east');wire(76,y,z);rep(77,y,z,'east');wire(78,y,z);response.push(P(78,y,z));
  group='response_locks';net='hold_response';rep(75,y,z+1,'north');rep(81,y,z+2,'west');for(let x=80;x>=75;x--)wire(x,y,z+2);addStore('response',b,P(74,y,z),P(75,y,z),P(75,y,z+1),P(78,y,z));group='response_input';
 }
 group='response_hold_distribution';net='open_response';wire(90,279,-48);rep(89,279,-48,'west');solid(88,279,-48);net='hold_response';wall(87,279,-48,'west');wire(86,279,-48);rep(85,279,-48,'west');tower(84,-48,279,283);openPorts.response=P(90,279,-48);
 for(const y of[279,283]){wire(83,y,-48);wire(82,y,-48);for(let z=-49;z>=-88;z--)if((-z-51)%12===0)rep(82,y,z,'north');else wire(82,y,z);}
 const ports={consumer_read_valid:{direction:'input',width:2,bit_order:'lsb_first',positions:[P(48,-37,-83),P(45,-37,-85)]},consumer_read_address:{direction:'input',width:16,bit_order:'consumer_major_lsb_first',positions:incoming.flat()},owned_address:{...parent.ports.address,direction:'diagnostic'},response:{direction:'output',width:16,bit_order:'lsb_first',positions:response},owner:{direction:'diagnostic',width:1,positions:[P(53,-37,-85)]},phase_open_owner:{direction:'unresolved_controller_input',width:1,positions:[openPorts.owner]},phase_open_address:{direction:'unresolved_controller_input',width:1,positions:[openPorts.address]},phase_open_response:{direction:'unresolved_controller_input',width:1,positions:[openPorts.response]}};
 const signal=(name,position,property)=>({name,position,property}),circuits=[];
 for(const[name,list]of[['request',stores.filter(c=>c.name!=='response')],['response',stores.filter(c=>c.name==='response')]]){const signals=list.flatMap(c=>[signal(c.name+c.bit,c.storage,'powered'),signal('d_'+c.name+c.bit,c.driver,'powered'),signal('lock_'+c.name+c.bit,c.lock,'powered')]);for(const[n,p]of Object.entries(openPorts))if(name==='request'?n!=='response':n==='response')signals.push(signal('open_'+n,p,'power'));circuits.push({id:id+'_'+name,dimension:'minecraft:overworld',description:'Program capture payload state only; external phase controls not an implemented handshake.',signals,buses:[]});}
 const blocks=[...cells.values()],box={from:{},to:{}},histogram={},group_counts={};for(const a of A){box.from[a]=Infinity;box.to[a]=-Infinity;}for(const v of blocks){for(const a of A){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}histogram[v.block.id]=(histogram[v.block.id]??0)+1;if(added.includes(v))group_counts[groups[key(v.position)]]=(group_counts[groups[key(v.position)]]??0)+1;}
 return{status:'offline_program_payload_capture_proposal_controller_missing',id,blocks,added_blocks:added,box,ports,stores,muxes,circuits,groups,nets,configuration:parent.configuration,sources:{'hardware/memory-layout-program-folded.mjs':source,...parent.sources},metrics:{blocks:blocks.length,parent_blocks:parent.blocks.length,added_blocks:added.length,retained_payload_bits:25,address_selector_bits:8,dimensions:Object.fromEntries(A.map(a=>[a,box.to[a]-box.from[a]+1])),histogram,added_group_counts:group_counts},protocol:{priority:'When sampling owner, V1 AND NOT V0 chooses consumer1; otherwise consumer0. No autonomous grant occurs yet.',capture:'Open owner while priority settles, close owner, then open address while owned mux settles, close address. Hold both during backend access.',response:'After actual ROM settlement open response, settle, close response. A future owner-qualified ready must not assert until all locks close.',reset:'Physical zero/reset masks and controller reset/drain remain missing. Source cells must never be cleared by reset.'},missing:['Actual self-timed four-phase sequencer, active/busy/ready state, delay/settlement and reset/drain gates.','Consumer response fanout and owner-qualified ready-return routes.','Independent contact review, native initialization/hold/phase timing and vanilla acceptance.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeProgramCapture();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
