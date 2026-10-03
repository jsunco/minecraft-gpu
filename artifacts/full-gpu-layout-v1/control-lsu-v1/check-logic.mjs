import assert from'node:assert/strict';
import{guardDefinition,nextDefinition,actionDefinition,equation,nextState,stateValues,STATES}from'./logic.mjs';
let transitions=0,traces=0;
const gd=guardDefinition(),nd=nextDefinition(),ad=actionDefinition();
for(let m=0;m<2**gd.inputs.length;m++){
 const v=Object.fromEntries(gd.inputs.map((n,i)=>[n,!!(m&(1<<i))])),g=equation(gd,v);
 assert.equal(g.safe,v.drained&&!v.read_ready&&!v.write_ready);
 assert.equal(g.start,v.request&&v.enable&&(v.mem_read!==v.mem_write)&&!v.reset&&g.safe);
 assert.equal(g.invalid,v.request&&v.enable&&v.mem_read&&v.mem_write&&!v.reset);
 assert.equal(g.matched_ready,v.is_write?v.write_ready:v.read_ready);
 for(let s=0;s<16;s++)for(const update of[false,true])for(const initialize of[false,true]){
  const q={...v,...g,...stateValues(s),update,initialize},got=equation(nd,q),n=nd.outputs.reduce((n,k,b)=>n+(got[k]?1<<b:0),0);
  assert.equal(n,nextState(s,q),STATES[s]+' '+JSON.stringify(q));transitions++;
 }
}
// A software sequence oracle is separate from the routed block checks. Each
// cycle is A capture -> all local closures -> B current transfer -> settlement.
for(const write of[false,true])for(const resetAt of[-1,1,3,4,5,7,8,9])for(const readyDelay of[0,1,5])for(const drainDelay of[0,1,4]){
 let s=0,valid=false,type=false,address=0,data=0,result=0x5A,oldValid=false,issued=false,readySeen=false,responseClosed=false,readyHold=0,drainWait=0,done=false,ack=false,reset=false;
 for(let cycle=0;cycle<100&&!done;cycle++){
  if(cycle===resetAt)reset=true;
  if(s===4)readyHold++;
  const matchedReady=issued&&(!readySeen?readyHold>readyDelay:valid);
  const ready=matchedReady||(readySeen&&s===7);
  if(s===8)drainWait++;
  const drained=!issued||s===8&&drainWait>drainDelay||s>=9;
  const v={request:cycle<80,enable:true,mem_read:!write,mem_write:write,reset,read_ready:!write&&ready,write_ready:write&&ready,drained,is_write:type,update:s===9&&!reset,initialize:false,phase_a:true,valid,...stateValues(s)};
  const g=equation(gd,v),a=equation(ad,v),next=nextState(s,{...v,...g});
  const prev={address,data,type,result};
  if(a.payload_open){address=a.clear?0:0xA6;data=a.clear?0:0x39;type=a.clear?false:write;}
  if(a.result_open)result=a.clear?0:0xC3;
  oldValid=valid;valid=a.valid_data;
  if(valid&&!oldValid){assert.equal(s,3);assert.equal(address,0xA6);assert.equal(data,0x39);assert.equal(type,write);issued=true;}
  if(oldValid){assert.equal(address,prev.address);assert.equal(data,prev.data);assert.equal(type,prev.type);}
  if(s===5){readySeen=true;assert(oldValid&&valid);if(!write)assert.equal(result,0xC3);else assert.equal(result,0x5A);}
  if(s===6){responseClosed=true;assert(valid);}
  if(oldValid&&!valid){assert.equal(s,7);assert(responseClosed);assert(readySeen);}
  if(a.done){assert(!valid&&drained&&!v.read_ready&&!v.write_ready);assert.equal(result,write?0x5A:0xC3);done=!reset;}
  if(a.reset_ack){assert(!valid);assert.equal(address,0);assert.equal(data,0);assert.equal(type,false);assert.equal(result,0);ack=true;done=true;}
  s=next;
 }
 assert(done,'sequence did not complete');if(reset)assert(ack);traces++;
}
// Inactive or non-memory lanes cannot accept; wrong-type ready cannot complete
// WAIT_READY; both opcodes high enters a fault without emitting a valid.
for(const enable of[false,true])for(const r of[false,true])for(const w of[false,true]){
 const v={request:true,enable,mem_read:r,mem_write:w,reset:false,read_ready:false,write_ready:false,drained:true,is_write:false};const g=equation(gd,v);
 assert.equal(nextState(0,{...v,...g}),!enable||!r&&!w?0:r&&w?15:1);
}
for(const type of[false,true]){const g=equation(gd,{is_write:type,read_ready:type,write_ready:!type});assert.equal(g.matched_ready,false);assert.equal(nextState(4,{...g}),4);}
console.log(JSON.stringify({status:'software_lsu_protocol_checked',transition_cases:transitions,variable_latency_traces:traces,retained_bits:37,native_acceptance:false}));
