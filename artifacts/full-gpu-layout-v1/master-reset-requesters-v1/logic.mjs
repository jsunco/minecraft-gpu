// One retained four-phase master requester per core. Not a runtime controller.
export function definition(){
 const inputs=['demand','ack','start','active','waiting','pending','initialize','permit','reset_held'],outputs=['active_D','waiting_D','pending_D','reset_D','start_D','held_reset_D'],products=[],add=(out,literals)=>products.push({out,literals}),live={initialize:false};
 add('active_D',{initialize:true});
 add('active_D',{...live,waiting:false,active:true,demand:true});add('active_D',{...live,waiting:false,active:true,ack:false});
 for(const n of['demand','pending'])add('active_D',{...live,waiting:false,active:false,ack:false,[n]:true});
 add('waiting_D',{...live,waiting:true,ack:true});add('waiting_D',{...live,active:true,ack:true,demand:false});
 for(const n of['pending','demand']){add('pending_D',{...live,waiting:true,[n]:true});add('pending_D',{...live,active:false,waiting:false,ack:true,[n]:true});}
 add('reset_D',{initialize:true});add('reset_D',{active:true});add('reset_D',{waiting:true,reset_held:true,demand:true});
 add('start_D',{...live,permit:true,active:false,waiting:false,pending:false,demand:false,ack:false,start:true});
 add('held_reset_D',{...live,active:true,ack:true,demand:true});
 return{inputs,outputs,products};
}
export function evaluate(v){return{active_D:!!v.initialize||(!v.waiting&&(v.active?(v.demand||!v.ack):(!v.ack&&(v.demand||v.pending)))),waiting_D:!v.initialize&&((v.waiting&&v.ack)||(v.active&&v.ack&&!v.demand)),pending_D:!v.initialize&&((v.waiting&&(v.pending||v.demand))||(!v.active&&!v.waiting&&v.ack&&(v.pending||v.demand))),reset_D:!!v.initialize||!!v.active||!!v.waiting&&!!v.reset_held&&!!v.demand,start_D:!v.initialize&&!!v.permit&&!v.active&&!v.waiting&&!v.pending&&!v.demand&&!v.ack&&!!v.start,held_reset_D:!v.initialize&&!!v.active&&!!v.ack&&!!v.demand};}
export function step(q,phase,raw){const x=structuredClone(q);if(phase==='B'){for(const n of['active','waiting','pending'])x[n]=q[n+'_next'];x.demand=raw.initialize?false:!!raw.demand;x.ack=raw.initialize?false:!!raw.ack;x.start=raw.initialize?false:!!raw.start;x.permit=raw.initialize?false:!!raw.permit;}else{const r=evaluate({...q,reset_held:q.reset_out,initialize:raw.initialize});for(const n of['active','waiting','pending'])x[n+'_next']=r[n+'_D'];for(const n of['reset','start','held_reset'])x[n+'_out']=r[n+'_D'];}return x;}
export const zero=()=>Object.fromEntries(['active','waiting','pending','active_next','waiting_next','pending_next','demand','ack','start','permit','reset_out','start_out','held_reset_out'].map(n=>[n,false]));
