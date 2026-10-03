// Offline hardware microprogram definition. Never imports Bridge or executes a GPU.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=JSON.parse(readFileSync(new URL('../alu/physical-control-interface.json',import.meta.url)));
export const COMMANDS=[...base.ports.map(p=>p.name),'status_busy_value','status_open','status_clear'];
export const STATES=['RESET','RESET_STATUS','RESET_WAIT','IDLE','ACCEPT','INIT_ADD','INIT_SUB','INIT_MUL','INIT_DIV','ADD_BIT','SUB_BIT','MUL_PASS_INIT','MUL_BIT','MUL_OUTER','DIV_TRIAL','DIV_SUB_INIT','DIV_SUB_BIT','DIV_DECIDE','DIV_RESTORE_INIT','DIV_RESTORE_BIT','DIV_Q_COMMIT','FINAL_W','FINAL_CMP','FINAL_Q','READY','WAIT_ACK','ACK','FAULT_WAIT','UNUSED28','UNUSED29','UNUSED30','UNUSED31'];
export const PHASES=['PREP','NEXT','CURRENT','ADVANCE'];
export const ID=Object.fromEntries(STATES.map((n,i)=>[n,i]));
export function word(macro){
 assert(Number.isInteger(macro)&&macro>=0&&macro<32);
 const c=Object.fromEntries(COMMANDS.map(n=>[n,0])),next=[],current=[];let status=false;
 const high=(...ns)=>ns.forEach(n=>{assert(n in c,n);c[n]=1;});
 const sel=(bank,choice)=>high(bank+'_parallel_select_'+choice);
 const parallel=(bank,choice)=>{high(bank+'_load_parallel');sel(bank,choice);};
 const capture=(...banks)=>next.push(...banks),commit=(...banks)=>current.push(...banks),transfer=(...banks)=>{capture(...banks);commit(...banks);};
 const carry=n=>high('carry_select_'+n),qaux=n=>high('q_aux_select_'+n),addend=n=>high('addend_mode_'+n);
 const selfPass=sub=>{parallel('w','self');parallel('m','self');carry(sub?'one':'zero');high('nonzero_clear');transfer('w','m');};
 const serial=(sub,e)=>{carry('adder');addend(e);if(sub)high('subtract');transfer('w','m');};
 const name=STATES[macro];
 switch(name){
 case 'RESET':for(const b of['w','m','q'])parallel(b,'zero');carry('zero');qaux('zero');high('nonzero_clear');transfer('w','m','q');break;
 case 'RESET_STATUS':high('status_clear');status=true;break;
 case 'ACCEPT':high('status_busy_value');status=true;break;
 case 'INIT_ADD':case 'INIT_SUB':parallel('w','a');parallel('m','b');parallel('q','zero');carry(name==='INIT_SUB'?'one':'zero');qaux('zero');high('nonzero_clear');transfer('w','m','q');break;
 case 'INIT_MUL':parallel('w','zero');parallel('m','a');parallel('q','b');carry('zero');qaux('zero');high('nonzero_clear');transfer('w','m','q');break;
 case 'INIT_DIV':parallel('w','zero');parallel('m','b');parallel('q','a');carry('zero');qaux('zero');high('nonzero_clear');transfer('w','m','q');break;
 case 'ADD_BIT':serial(false,'one');break;
 case 'SUB_BIT':case 'DIV_SUB_BIT':serial(true,'one');break;
 case 'MUL_PASS_INIT':case 'DIV_RESTORE_INIT':selfPass(false);break;
 case 'MUL_BIT':serial(false,'q0');break;
 case 'MUL_OUTER':parallel('m','left');qaux('zero');high('nonzero_clear');transfer('m','q');break;
 case 'DIV_TRIAL':parallel('w','trial');parallel('q','self');carry('zero');qaux('trial_high');transfer('w','q');break;
 case 'DIV_SUB_INIT':selfPass(true);break;
 case 'DIV_DECIDE':parallel('q','left_take');qaux('take');capture('q');break;
 case 'DIV_RESTORE_BIT':serial(false,'not_take');break;
 case 'DIV_Q_COMMIT':commit('q');break;
 case 'FINAL_W':case 'FINAL_CMP':case 'FINAL_Q':parallel('w',name==='FINAL_W'?'self':name==='FINAL_Q'?'q':'cmp');carry('zero');capture('w');break;
 case 'READY':high('final_latched');status=true;break;
 case 'ACK':status=true;break;
 }
 return{macro,name,data:c,next,current,status,reset_all_lanes:name==='RESET'||name==='RESET_STATUS'};
}
export function commands(s,{qualifiedA=false,lane_enable=true,lane_fault=false,initialize=false,reset_request=false,any_fault=false}={}){
 const w=word(s.macro),c={...w.data};
 const normal=!initialize&&(!reset_request||w.reset_all_lanes)&&(!any_fault||w.reset_all_lanes);
 const dataOpen=qualifiedA&&normal&&(w.reset_all_lanes||(lane_enable&&!lane_fault));
 if(dataOpen&&s.phase===1)for(const b of w.next)c[b+'_open_next']=1;
 if(dataOpen&&s.phase===2)for(const b of w.current)c[b+'_open_current']=1;
 // Status data has lane enable/fault qualification inside the existing v4 cells.
 if(qualifiedA&&normal&&s.phase===1&&w.status)c.status_open=1;
 return c;
}
export function step(s,i){
 for(const[n,max]of[['macro',31],['phase',3],['bit',7],['round',7]])assert(Number.isInteger(s[n])&&s[n]>=0&&s[n]<=max,n);
 const n={...s,phase:(s.phase+1)&3};
 if(i.initialize)return{macro:0,phase:0,bit:0,round:0};
 if(s.phase!==3)return n;
 const goto=name=>n.macro=ID[name],zero=()=>{n.bit=0;n.round=0;};
 if(i.reset_request&&s.macro>=3){goto('RESET');zero();return n;}
 if(i.any_fault&&s.macro>=5&&s.macro<=26){goto('FAULT_WAIT');return n;}
 const mode=i.compare?'CMP':['ADD','SUB','MUL','DIV'][i.arithmetic_mux];assert(mode);
 const last=s.bit===7,lastRound=s.round===7;
 switch(STATES[s.macro]){
 case 'RESET':goto('RESET_STATUS');zero();break;
 case 'RESET_STATUS':goto('RESET_WAIT');break;
 case 'RESET_WAIT':if(!i.reset_request)goto('IDLE');break;
 case 'IDLE':if(i.execute_request&&!i.result_ack)goto('ACCEPT');zero();break;
 case 'ACCEPT':goto(i.any_fault?'FAULT_WAIT':mode==='MUL'?'INIT_MUL':mode==='DIV'?'INIT_DIV':mode==='ADD'?'INIT_ADD':'INIT_SUB');zero();break;
 case 'INIT_ADD':goto('ADD_BIT');zero();break;
 case 'INIT_SUB':goto('SUB_BIT');zero();break;
 case 'INIT_MUL':goto('MUL_PASS_INIT');zero();break;
 case 'INIT_DIV':goto('DIV_TRIAL');zero();break;
 case 'ADD_BIT':case 'SUB_BIT':n.bit=(s.bit+1)&7;if(last)goto(mode==='CMP'?'FINAL_CMP':'FINAL_W');break;
 case 'MUL_PASS_INIT':goto('MUL_BIT');n.bit=0;break;
 case 'MUL_BIT':n.bit=(s.bit+1)&7;if(last)goto('MUL_OUTER');break;
 case 'MUL_OUTER':n.round=(s.round+1)&7;goto(lastRound?'FINAL_W':'MUL_PASS_INIT');break;
 case 'DIV_TRIAL':goto('DIV_SUB_INIT');break;
 case 'DIV_SUB_INIT':goto('DIV_SUB_BIT');n.bit=0;break;
 case 'DIV_SUB_BIT':n.bit=(s.bit+1)&7;if(last)goto('DIV_DECIDE');break;
 case 'DIV_DECIDE':goto('DIV_RESTORE_INIT');break;
 case 'DIV_RESTORE_INIT':goto('DIV_RESTORE_BIT');n.bit=0;break;
 case 'DIV_RESTORE_BIT':n.bit=(s.bit+1)&7;if(last)goto('DIV_Q_COMMIT');break;
 case 'DIV_Q_COMMIT':n.round=(s.round+1)&7;goto(lastRound?'FINAL_Q':'DIV_TRIAL');break;
 case 'FINAL_W':case 'FINAL_CMP':case 'FINAL_Q':goto('READY');break;
 case 'READY':goto('WAIT_ACK');break;
 case 'WAIT_ACK':if(i.result_ack&&!i.execute_request)goto('ACK');break;
 case 'ACK':goto('IDLE');break;
 case 'FAULT_WAIT':break;
 default:goto('RESET');zero();break;
 }
 return n;
}
// Settled transfer model driven solely by the emitted physical command names.
// It is an offline checker target; this function is never a native execution path.
export function applyLane(l,c,{a,b,mode,compare,enable,request}){
 const old={...l},one=(prefix,choices)=>{const selected=choices.filter(k=>c[prefix+k]);assert(selected.length<=1,prefix);return selected[0];};
 const take=old.T8|old.C,E={zero:0,one:1,q0:old.Q&1,not_take:1-old.take}[one('addend_mode_',['zero','one','q0','not_take'])]??0;
 const conditioned=((old.M&1)&E)^c.subtract,s=(old.W&1)^conditioned^old.C,carry=((old.W&1)&conditioned)|((old.W&1)&old.C)|(conditioned&old.C);
 const nzp=((1-old.C)<<2)|((1-old.NZ)<<1)|(old.C&old.NZ);
 const wd={zero:0,a,trial:((old.W<<1)&255)|(old.Q>>7),self:old.W,q:old.Q,cmp:nzp};
 const md={zero:0,a,b,left:(old.M<<1)&255,self:old.M};
 const qd={zero:0,a,b,self:old.Q,left_take:((old.Q<<1)&255)|take};
 if(c.w_open_next){l.Wn=c.w_load_parallel?(wd[one('w_parallel_select_',Object.keys(wd))]??0):((old.W>>1)|(s<<7));l.Cn={zero:0,one:1,adder:carry}[one('carry_select_',['zero','one','adder'])]??0;}
 if(c.m_open_next){l.Mn=c.m_load_parallel?(md[one('m_parallel_select_',Object.keys(md))]??0):((old.M>>1)|((old.M&1)<<7));l.NZn=c.nonzero_clear?0:old.NZ|s;}
 if(c.q_open_next){l.Qn=c.q_load_parallel?(qd[one('q_parallel_select_',Object.keys(qd))]??0):(old.Q>>1);l.take={zero:0,trial_high:old.W>>7,take}[one('q_aux_select_',['zero','trial_high','take'])]??0;}
 for(const [bank,aux,naux]of[['W','C','Cn'],['M','NZ','NZn'],['Q','T8','take']])if(c[bank.toLowerCase()+'_open_current']){l[bank]=old[bank+'n'];l[aux]=old[naux];}
 if(c.status_open){const raw=!compare&&mode===3&&b===0,accepted=raw&&enable&&request&&!old.busy&&!old.ready&&!old.fault;l.fault=Number((old.fault||accepted)&&!c.status_clear);l.busy=Number(enable&&c.status_busy_value&&!l.fault&&!raw&&!c.status_clear);l.ready=Number(enable&&c.final_latched&&!l.fault&&!c.status_clear);}
 return l;
}
