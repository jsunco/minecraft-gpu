// Offline reference for the physical local control being routed in this package.
// It does not execute instructions or drive Minecraft.
import assert from 'node:assert/strict';
export const COMMIT=['IDLE','NEXT_CAPTURE','NEXT_CLOSED','CURRENT_FLAGS_CAPTURE','CURRENT_FLAGS_CLOSED','WAIT_RF_ACK','RELEASE_DRAIN','COMPLETE'];
export const OWNER=['IDLE','OWNER_CAPTURE','OWNER_CLOSED','REQUEST_START','WAIT_ACK','REQUEST_DROP','WAIT_ACK_LOW','COMPLETE'];
export const EVENT_KIND={other:0,operand:1,update:2};
export function commitSignals(s){return{pc_next:s===1,pc_current:s===3,flags:s===3,rf_update:s>=1&&s<=5,alu_release:s>=6,alu_ack:s>=6,complete:s===7};}
export function commitNext(s,i){
 if(i.initialize)return 0;
 if(i.fault||i.reset_request)return s;
 const go=[i.update_request&&i.agreement&&!i.owner_busy,true,true,true,true,i.rf_update_complete,i.all_status_low,!i.update_request][s];
 return go?(s+1)&7:s;
}
export function ownerSignals(s,k){return{request:s===3||s===4,kind:k,done_other:s===7&&k===0,done_operand:s===7&&k===1,done_update:s===7&&k===2,owner_capture:s===1,complete:s===7};}
export function ownerNext(s,k,i){
 if(i.initialize)return{state:0,kind:0};
 if(i.fault||i.reset_request)return{state:s,kind:k};
 const requests=[i.other_request,i.operand_request,i.update_request],count=requests.filter(Boolean).length;
 // Distinct architectural producers must not overlap. Retained owners do not
 // change because another source asks; overlap must blank new admission/fault.
 const go=[count===1&&!i.rf_ack,count===1,true,true,i.rf_ack,true,!i.rf_ack,!requests[k]][s];
 return{state:go?(s+1)&7:s,kind:s===1&&count===1?requests.findIndex(Boolean):k};
}
export function checkProtocol(){
 let cases=0;
 for(let s=0;s<8;s++)for(let kind=0;kind<3;kind++)for(let req=0;req<8;req++)for(let ack=0;ack<2;ack++){
  const i={other_request:!!(req&1),operand_request:!!(req&2),update_request:!!(req&4),rf_ack:!!ack};
  const r=ownerNext(s,kind,i);assert(r.state>=0&&r.state<8);
  if(s!==1)assert.equal(r.kind,kind);
  if(s===0&&(ack||[0,3,5,6,7].includes(req)))assert.equal(r.state,0);
  if(s===1&&[0,3,5,6,7].includes(req))assert.equal(r.state,1);
  if(s===6&&ack)assert.equal(r.state,6);
  if(s===7&&(req>>kind&1))assert.equal(r.state,7);
  cases++;
 }
 let sequences=0;
 for(let kind=0;kind<3;kind++)for(let ackDelay=0;ackDelay<4;ackDelay++)for(let releaseDelay=0;releaseDelay<4;releaseDelay++){
  let s=0,k=0,asserted=false,dropped=false,cycles=0,wait=0,release=0;
  while(s!==7&&cycles++<40){const before=s,requests=[false,false,false];requests[kind]=true;const i={other_request:requests[0],operand_request:requests[1],update_request:requests[2],rf_ack:asserted&&!dropped};
   if(s===4&&wait++>=ackDelay){asserted=true;i.rf_ack=true;}
   if(s===6&&release++>=releaseDelay){dropped=true;i.rf_ack=false;}
   ({state:s,kind:k}=ownerNext(s,k,i));
   if(before>=2)assert.equal(k,kind);
  }
  assert.equal(s,7);assert(dropped);assert.equal(ownerSignals(s,k)['done_'+['other','operand','update'][kind]],true);
  assert.equal(ownerNext(s,k,{other_request:false,operand_request:false,update_request:false,rf_ack:false}).state,0);sequences++;
 }
 let commits=0;
 for(let rfDelay=0;rfDelay<5;rfDelay++)for(let drainDelay=0;drainDelay<5;drainDelay++){
  let s=0,wait=0,drain=0,cycles=0,next=0,current=0,flags=0;const phases=[];
  while(s!==7&&cycles++<40){const o=commitSignals(s);phases.push({...o,state:s});next+=o.pc_next;current+=o.pc_current;flags+=o.flags;
   const i={update_request:true,agreement:true,owner_busy:false,rf_update_complete:s===5&&wait++>=rfDelay,all_status_low:s===6&&drain++>=drainDelay};s=commitNext(s,i);
  }
  assert.equal(s,7);assert.equal(next,1);assert.equal(current,1);assert.equal(flags,1);assert.equal(phases.findIndex(p=>p.pc_current)-phases.findIndex(p=>p.pc_next),2);
  assert(phases.filter(p=>p.state===6).every(p=>p.alu_release&&p.alu_ack&&!p.pc_next&&!p.pc_current&&!p.flags));commits++;
 }
 for(let s=0;s<8;s++){assert.equal(commitNext(s,{fault:true}),s);assert.equal(commitNext(s,{reset_request:true}),s);assert.equal(commitNext(s,{initialize:true,fault:true,reset_request:true}),0);}
 return{owner_cases:cases,owner_handshake_sequences:sequences,commit_delay_sequences:commits,scope:'Reference for proposed physical guards and held controls; not proof of routes, propagation or arbitrary-fault rollback.'};
}
