// Additive bank write-input underpasses. These are only source cable adapters;
// actual retained write-data sources must be routed before memory is complete.
import assert from 'node:assert/strict';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`;
export function makeInternalWriteAdapters(){
 const map=new Map(),nets={},adapters=[];let net='';
 const put=(p,id,properties)=>{const block={id:'minecraft:'+id,...(properties?{properties}:{})};const old=map.get(K(p));if(old)assert.deepEqual(old.block,block);else{map.set(K(p),{position:p,block});nets[K(p)]=net;}};
 const w=(x,y,z)=>{put(P(x,y-1,z),'light_gray_concrete');put(P(x,y,z),'redstone_wire');},r=(x,y,z)=>{put(P(x,y-1,z),'light_gray_concrete');put(P(x,y,z),'repeater',{facing:'east',delay:'1'});};
 for(let bank=0;bank<4;bank++)for(let channel=0;channel<4;channel++)for(let bit=0;bit<8;bit++){
  const x=218+432*(bank%2),y=-28+4*channel,z=898+622*Math.floor(bank/2)+8*bit,underZ=z+(bit===7?2:0),bend=20;net='retained_write_data'+channel+'_'+bit;
  r(x+1,y,z);w(x+2,y,z);w(x+3,y-1,z);w(x+4,y-2,z);
  if(underZ!==z)for(let zz=z+1;zz<=underZ;zz++)w(x+4,y-2,zz);
  for(let xx=x+5;xx<=x+bend;xx++)if([x+7,x+8,x+15,x+16,x+23,x+27].includes(xx))r(xx,y-2,underZ);else w(xx,y-2,underZ);
  if(underZ!==z)for(let zz=z;zz<underZ;zz++)w(x+bend,y-2,zz);
  for(let xx=x+bend+1;xx<=x+50;xx++)if(([x+23,x+33,x+43,x+47].includes(xx)||(bit===7&&xx===x+26)))r(xx,y-2,z);else w(xx,y-2,z);
  adapters.push({bank,channel,bit,source:P(105+128*channel,35+80*channel,54+8*bit),destination:P(x,y,z),driver:P(x+1,y,z),input:P(x+50,y-2,z),underpasses:[P(x+8,y-2,underZ),P(x+16,y-2,underZ)],ack_rail_detour:bit===7});
 }
 return {status:'unconnected_internal_write_adapters_draft',blocks:[...map.values()],nets,adapters,native_acceptance:false};
}
