// Offline microstate witness, never imported by a Minecraft runtime.
import assert from 'node:assert/strict';
export function runLane(op,a,b,{flags=0,record=false}={}){
 assert(['ADD','SUB','CMP','MUL','DIV'].includes(op));for(const v of[a,b])assert(Number.isInteger(v)&&v>=0&&v<256);assert(Number.isInteger(flags)&&flags>=0&&flags<8);
 const state={W:0,M:0,Q:0,Wn:0,Mn:0,Qn:0,C:0,Cn:0,NZ:0,NZn:0,T8:0,take:0,busy:0,ready:0,fault:0};const trace=[];let bits=0,captures=0,commits=0;
 const nname={W:'Wn',M:'Mn',Q:'Qn'},aname={W:'C',M:'NZ',Q:'T8'},anext={W:'Cn',M:'NZn',Q:'take'};
 const push=(phase,extra={})=>{if(record)trace.push({phase,...extra,state:{...state}});};
 function capture(name,values){const before={...state};for(const[k,[v,aux]]of Object.entries(values)){assert(Number.isInteger(v)&&v>=0&&v<256);assert(aux===0||aux===1);state[nname[k]]=v;state[anext[k]]=aux;}captures++;push(name+'_next_closed',{banks:Object.keys(values)});for(const k of['W','M','Q','C','NZ','T8'])assert.equal(state[k],before[k]);}
 function commit(name,banks){const before={...state};for(const k of banks){state[k]=state[nname[k]];state[aname[k]]=state[anext[k]];}commits++;push(name+'_current_closed',{banks});for(const k of['Wn','Mn','Qn','Cn','NZn','take'])assert.equal(state[k],before[k]);}
 function transfer(name,values){capture(name,values);commit(name,Object.keys(values));}
 function passInit(subtract){transfer('PASS_INIT',{W:[state.W,Number(subtract)],M:[state.M,0]});}
 function pass(label,subtract,enabled){for(let i=0;i<8;i++){
  const w=state.W&1,m=((state.M&1)&Number(enabled))^Number(subtract),c=state.C,s=w^m^c,cn=(w&m)|(w&c)|(m&c);
  const frozen={Q:state.Q,Qn:state.Qn,T8:state.T8,take:state.take};
  transfer(label+'_BIT'+i,{W:[(state.W>>1)|(s<<7),cn],M:[(state.M>>1)|((state.M&1)<<7),state.NZ|s]});
  for(const[k,v]of Object.entries(frozen))assert.equal(state[k],v);bits++;
 }}
 state.busy=1;push('ACCEPT');
 if(op==='DIV'&&b===0){state.busy=0;state.fault=1;push('DIV0_FAULT');return{value:null,flags,state,bit_commits:0,captures,commits,trace};}
 const simple=['ADD','SUB','CMP'].includes(op);
 transfer('INIT',{W:[simple?a:0,Number(op==='SUB'||op==='CMP')],M:[op==='MUL'?a:b,0],Q:[op==='MUL'?b:op==='DIV'?a:0,0]});
 if(simple)pass(op,op!=='ADD',true);
 if(op==='MUL')for(let round=0;round<8;round++){
  passInit(false);pass('MUL'+round,false,!!(state.Q&1));
  transfer('MUL_OUTER'+round,{M:[(state.M<<1)&255,0],Q:[state.Q>>1,0]});
 }
 if(op==='DIV')for(let round=0;round<8;round++){
  transfer('DIV_TRIAL'+round,{W:[((state.W<<1)&255)|(state.Q>>7),0],Q:[state.Q,state.W>>7]});
  passInit(true);pass('DIV_SUB'+round,true,true);
  const take=state.T8|state.C;
  capture('DIV_DECISION'+round,{Q:[((state.Q<<1)&255)|take,take]});
  passInit(false);pass('DIV_RESTORE'+round,false,!state.take);
  assert.equal(state.take,take);commit('DIV_Q_COMMIT'+round,['Q']);
  assert(state.W<b,'Restored remainder invariant');
 }
 const nzp=((1-state.C)<<2)|((1-state.NZ)<<1)|(state.C&state.NZ);
 const value=op==='CMP'?nzp:op==='DIV'?state.Q:state.W;
 capture('FINAL',{W:[value,0]});state.busy=0;state.ready=1;push('READY');
 const expectedBits=simple?8:op==='MUL'?64:128;assert.equal(bits,expectedBits);
 return{value:state.Wn,flags:op==='CMP'?nzp:flags,state,bit_commits:bits,captures,commits,trace};
}
