// Fixed physical LSU equations. Offline design oracle, never runtime GPU logic.
export const STATES=['IDLE','CAPTURE_PAYLOAD','CLOSE_PAYLOAD','ASSERT_VALID','WAIT_READY','CAPTURE_RESULT','CLOSE_RESULT','DROP_VALID','WAIT_DRAIN','DONE','REARM','RESET_CLEAR','RESET_CLOSE','RESET_ACK','RESET_REARM','PROTOCOL_FAULT'];
const state=(n)=>Object.fromEntries(Array.from({length:4},(_,b)=>['s'+b,!!(n&(1<<b))]));
const add=(list,out,literals)=>list.push({out,literals});
export function guardDefinition(){
 const inputs=['request','enable','mem_read','mem_write','reset','read_ready','write_ready','drained','is_write'];
 const outputs=['safe','start','invalid','matched_ready'];const products=[];
 add(products,'safe',{drained:true,read_ready:false,write_ready:false});
 for(const w of[false,true])add(products,'start',{request:true,enable:true,mem_read:!w,mem_write:w,reset:false,read_ready:false,write_ready:false,drained:true});
 add(products,'invalid',{request:true,enable:true,mem_read:true,mem_write:true,reset:false});
 add(products,'matched_ready',{is_write:false,read_ready:true});add(products,'matched_ready',{is_write:true,write_ready:true});
 return{inputs,outputs,products};
}
export function nextDefinition(){
 const inputs=['s0','s1','s2','s3','start','invalid','matched_ready','safe','reset','update','request','initialize'];
 const outputs=['n0','n1','n2','n3'];const products=[];
 const emit=(s,target,cond={})=>{for(let b=0;b<4;b++)if(target&(1<<b))add(products,'n'+b,{...state(s),...cond,initialize:false});};
 emit(0,1,{start:true});emit(0,15,{invalid:true});emit(0,11,{reset:true,safe:true});
 emit(1,2,{reset:false});emit(1,1,{reset:true,safe:false});emit(1,11,{reset:true,safe:true});emit(2,3,{reset:false});emit(2,2,{reset:true,safe:false});emit(2,11,{reset:true,safe:true});emit(3,4);
 emit(4,4);emit(4,1,{matched_ready:true});
 emit(5,6);emit(6,7);emit(7,8);
 emit(8,8);emit(8,1,{safe:true});emit(8,2,{safe:true,reset:true});
 emit(9,8);emit(9,2,{reset:true,safe:true});emit(9,2,{reset:false,update:true});emit(9,1,{reset:true});emit(9,1,{update:false});
 emit(10,10,{reset:true});emit(10,10,{request:true});emit(10,1,{reset:true,safe:true});
 emit(11,12);emit(12,13);emit(13,12);emit(13,1,{reset:true});emit(13,2,{reset:false});
 emit(15,11);emit(15,4,{reset:false});emit(15,4,{safe:false});
 return{inputs,outputs,products};
}
export function actionDefinition(){
 const inputs=['s0','s1','s2','s3','phase_a','initialize','is_write','valid'];
 const outputs=['payload_open','result_open','clear','valid_data','read_valid','write_valid','done','reset_ack','fault'];const products=[];
 const emit=(s,out,extra={})=>add(products,out,{...state(s),...extra});
 emit(1,'payload_open',{phase_a:true});emit(11,'payload_open',{phase_a:true});add(products,'payload_open',{initialize:true,phase_a:true});
 emit(5,'result_open',{phase_a:true,is_write:false});emit(11,'result_open',{phase_a:true});add(products,'result_open',{initialize:true,phase_a:true});
 emit(11,'clear');add(products,'clear',{initialize:true});
 for(const s of[3,4,5,6])emit(s,'valid_data',{initialize:false});
 add(products,'read_valid',{valid:true,is_write:false,initialize:false});add(products,'write_valid',{valid:true,is_write:true,initialize:false});
 emit(9,'done',{initialize:false});emit(13,'reset_ack',{initialize:false});emit(15,'fault',{initialize:false});
 return{inputs,outputs,products};
}
export function equation(def,v){return Object.fromEntries(def.outputs.map(n=>[n,def.products.some(t=>t.out===n&&Object.entries(t.literals).every(([k,b])=>!!v[k]===b))]));}
export function nextState(s,v){
 if(v.initialize)return 0;
 switch(s){
  case 0:return v.reset&&v.safe?11:v.invalid?15:v.start?1:0;
  case 1:return v.reset?(v.safe?11:1):2;case 2:return v.reset?(v.safe?11:2):3;case 3:return 4;case 4:return v.matched_ready?5:4;
  case 5:return 6;case 6:return 7;case 7:return 8;
  case 8:return v.safe?(v.reset?11:9):8;
  case 9:return v.reset?(v.safe?11:9):(v.update?10:9);
  case 10:return v.reset?(v.safe?11:10):(v.request?10:0);
  case 11:return 12;case 12:return 13;case 13:return v.reset?13:14;case 14:return 0;
  case 15:return v.reset&&v.safe?11:15;
  default:throw Error('invalid state');
 }
}
export const stateValues=state;
