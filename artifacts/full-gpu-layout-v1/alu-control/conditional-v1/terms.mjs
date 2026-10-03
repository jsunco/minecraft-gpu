// Finite physical branch cubes. No runtime / host execution path.
import assert from 'node:assert/strict';
export const INPUTS=['reset_request','any_fault','execute_request','result_ack','compare','mode0','mode1','bit_last','round_last'];
export const OUTPUTS=['macro_next_0','macro_next_1','macro_next_2','macro_next_3','macro_next_4','bit_increment','bit_clear','round_increment','round_clear'];
export function transitionTerms(){const rows=[];for(let macro=0;macro<32;macro++){
 const local=[];const add=(name,lits,next,extra=[])=>{local.push({macro,name,literals:lits,outputs:[...Array.from({length:5},(_,b)=>b).filter(b=>(next>>b)&1),...extra]});};
 const faultEligible=macro>=5&&macro<=26,base={};
 const normal=(name,lits,next,extra=[])=>add(name,{...base,...lits},next,extra),zero=[6,8];
 switch(macro){
 case 0:normal('reset_finish',{},1,zero);break;
 case 1:normal('status_finish',{},2);break;
 case 2:normal('reset_wait',{reset_request:1},2);normal('reset_release',{reset_request:0},3);break;
 case 3:normal('idle_no_request',{execute_request:0},3,zero);normal('idle_old_ack',{execute_request:1,result_ack:1},3,zero);normal('idle_accept',{execute_request:1,result_ack:0},4,zero);break;
 case 4:
  normal('accept_fault',{any_fault:1},27,zero);
  normal('accept_cmp',{any_fault:0,compare:1},6,zero);
  for(let op=0;op<4;op++)normal('accept_mode_'+op,{any_fault:0,compare:0,mode0:op&1,mode1:op>>1},[5,6,7,8][op],zero);break;
 case 5:normal('add_init',{},9,zero);break;case 6:normal('sub_init',{},10,zero);break;
 case 7:normal('mul_init',{},11,zero);break;case 8:normal('div_init',{},14,zero);break;
 case 9:case 10:
  normal('simple_more',{bit_last:0},macro,[5]);normal('simple_done',{bit_last:1,compare:0},21,[5]);normal('cmp_done',{bit_last:1,compare:1},22,[5]);break;
 case 11:normal('mul_pass_init',{},12,[6]);break;
 case 12:normal('mul_more',{bit_last:0},12,[5]);normal('mul_bit_done',{bit_last:1},13,[5]);break;
 case 13:normal('mul_round_more',{round_last:0},11,[7]);normal('mul_done',{round_last:1},21,[7]);break;
 case 14:normal('div_trial',{},15);break;case 15:normal('div_sub_init',{},16,[6]);break;
 case 16:normal('div_sub_more',{bit_last:0},16,[5]);normal('div_sub_done',{bit_last:1},17,[5]);break;
 case 17:normal('div_decide',{},18);break;case 18:normal('restore_init',{},19,[6]);break;
 case 19:normal('restore_more',{bit_last:0},19,[5]);normal('restore_done',{bit_last:1},20,[5]);break;
 case 20:normal('div_round_more',{round_last:0},14,[7]);normal('div_done',{round_last:1},23,[7]);break;
 case 21:case 22:case 23:normal('final',{},24);break;case 24:normal('ready',{},25);break;
 case 25:normal('wait_ack_low',{result_ack:0},25);normal('wait_request_high',{result_ack:1,execute_request:1},25);normal('full_update_ack',{result_ack:1,execute_request:0},26);break;
 case 26:normal('ack_drain',{},3);break;case 27:normal('fault_wait',{},27);break;
 default:normal('illegal_to_reset',{},0,zero);break;
 }
 // Common reset/fault overrides are physical downstream gates, not repeated products.
 for(let slot=0;slot<local.length;slot++)rows.push({...local[slot],slot});
 }for(const r of rows){assert(r.outputs.length);assert(r.outputs.every(i=>i>=0&&i<OUTPUTS.length));}return rows;}
export function evaluate(macro,inputs){let active=0,out=0;for(const t of transitionTerms())if(t.macro===macro&&Object.entries(t.literals).every(([k,v])=>inputs[k]===v)){active++;for(const i of t.outputs)out|=1<<i;}assert.equal(active,1,'Exactly one stable branch');if(macro>=3&&inputs.reset_request)out=(1<<6)|(1<<8);else if(macro>=5&&macro<=26&&inputs.any_fault)out=27;return{macro:out&31,bit_increment:(out>>5)&1,bit_clear:(out>>6)&1,round_increment:(out>>7)&1,round_clear:(out>>8)&1};}
