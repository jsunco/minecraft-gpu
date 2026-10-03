// Offline connected derivative: the actual downstream-bank tail mask/OR is
// adjacent to the compact backend. No host/runtime computation is introduced.
import assert from 'node:assert/strict';
import {makeChannelBackendControl} from './memory-layout-channel-backend-compact-v1.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete';
export function makeQualifiedCompactBackend(){
 const p=makeChannelBackendControl(),map=new Map(p.blocks.map(v=>[K(v.position),structuredClone(v)])),nets={...p.nets},groups={...p.groups},added=[];let net='';
 const put=(q,id,properties)=>{const v={position:q,block:{id:'minecraft:'+id,...properties?{properties}:{}}};assert(!map.has(K(q)),'Qualification collision '+K(q));map.set(K(q),v);nets[K(q)]=net;groups[K(q)]='actual_bank_tail_qualification';added.push(v);};
 const dev=(x,z,id,props)=>{put(P(x,60,z),'light_gray_concrete');put(P(x,61,z),id,props);},w=(x,z)=>dev(x,z,'redstone_wire'),r=(x,z,f)=>dev(x,z,'repeater',{facing:f,delay:'1'});
 // Retire remains inhibited until matching retained bank ownership AND the
 // actual bank tail have released. The mask is a normalized positive level.
 net='retire';r(100,3,'north');w(100,4);r(100,5,'north');
 net='qualified_retire';dev(100,6,'comparator',{facing:'north',mode:'subtract'});r(100,7,'north');w(100,8);
 // The same actual downstream busy also keeps the global BUSY return high.
 net='backend_busy';r(104,3,'north');w(104,4);r(104,5,'north');
 net='qualified_backend_busy';w(104,6);r(104,7,'north');w(104,8);
 net='downstream_bank_busy';for(let x=98;x<=110;x++)w(x,12);
 for(const x of[98,106]){r(x,11,'south');for(let z=10;z>=6;z--)w(x,z);}
 r(99,6,'west');r(105,6,'east');
 const ports=structuredClone(p.ports);ports.retire.positions=[P(100,61,8)];ports.backend_busy.positions=[P(104,61,8)];ports.downstream_bank_busy={direction:'input',width:1,positions:[P(110,61,12)],polarity:'active_high',meaning:'Actual OR of matching bank-owner ACTIVE/final-tail/reset-blocked; never READY-low.'};
 return {...p,status:'offline_compact_backend_with_actual_bank_tail_qualification',blocks:[...map.values()],nets,groups,ports,unqualified_ports:{retire:p.ports.retire,backend_busy:p.ports.backend_busy},bank_tail_qualification:{source:P(110,61,12),retire_gate:P(100,61,6),retire_rear:P(100,61,5),retire_mask:P(99,61,6),busy_wire:P(104,61,6),busy_tail_driver:P(105,61,6),added_cells:added.length,equations:{retire:'raw_retire && !downstream_bank_busy',backend_busy:'raw_backend_busy || downstream_bank_busy'}},metrics:{...p.metrics,blocks:map.size,bank_tail_qualification_cells:added.length},limits:[...p.limits,'The moved bank-tail mask/OR replaces the real later global RETIRE/BUSY cable qualification. All incoming/outgoing cables still require complete rerouting and timing reanalysis.'],selected:false,native_acceptance:false};
}
