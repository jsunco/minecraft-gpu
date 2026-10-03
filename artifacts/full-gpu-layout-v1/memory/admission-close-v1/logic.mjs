// Offline equations for a physical post-mask empty admission traversal.
export const FLAGS=['armed','owner_seen','owner_closed','payload_seen','payload_closed','commit_seen','flushed'];
export const INPUTS=[...Array.from({length:8},(_,i)=>'mask'+i),...['owner_open','payload_open','commit_phase','any_owner','active','busy','commit_input'].flatMap(n=>Array.from({length:4},(_,i)=>n+i)),'initialize',...FLAGS];
export const OUTPUTS=[...FLAGS.map(n=>'set_'+n),'clear','global_channels_quiet'];
const eq=(name,value)=>Object.fromEntries(Array.from({length:4},(_,i)=>[name+i,value]));
export const MASKS=Object.fromEntries(Array.from({length:8},(_,i)=>['mask'+i,1]));
const enabled={...MASKS,initialize:0};
const empty={...eq('any_owner',0),...eq('active',0),...eq('busy',0),...eq('commit_input',0),...eq('owner_open',0),...eq('payload_open',0),...eq('commit_phase',0)};
export function terms(){return[
 {name:'arm_after_closed_owner_phase',literals:{...enabled,...eq('owner_open',0)},bits:[0]},
 {name:'observe_actual_owner_open',literals:{...enabled,armed:1,...eq('owner_open',1)},bits:[1]},
 {name:'observe_empty_owner_close',literals:{...enabled,owner_seen:1,...eq('owner_open',0),...eq('any_owner',0)},bits:[2]},
 {name:'observe_actual_payload_open',literals:{...enabled,owner_closed:1,...eq('payload_open',1)},bits:[3]},
 {name:'observe_payload_close',literals:{...enabled,payload_seen:1,...eq('payload_open',0)},bits:[4]},
 {name:'observe_actual_commit_phase',literals:{...enabled,payload_closed:1,...eq('commit_phase',1)},bits:[5]},
 {name:'commit_closed_and_entire_channel_empty',literals:{...enabled,commit_seen:1,...empty},bits:[6]},
 ...Array.from({length:8},(_,i)=>({name:'mask_withdrawal'+i,literals:{['mask'+i]:0},bits:[7]})),
 {name:'cold_initialize_witness',literals:{initialize:1},bits:[7]},
 {name:'qualified_quiet',literals:{...enabled,flushed:1,...empty},bits:[8]},
];}
export function evaluate(v){const out=Object.fromEntries(OUTPUTS.map(n=>[n,false]));for(const t of terms())if(Object.entries(t.literals).every(([n,x])=>!!v[n]===!!x))for(const b of t.bits)out[OUTPUTS[b]]=true;return out;}
export function step(v,state){const out=evaluate({...v,...state});return Object.fromEntries(FLAGS.map(n=>[n,out.clear?false:!!state[n]||out['set_'+n]]));}
