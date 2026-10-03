// Physical reset-entry/retirement equations. Used only to generate/check blocks.
export function definition(){
 const inputs=['reset_request','release_complete','initialize','pending','candidate','parked','idle','done','update','commit_complete','idle_mask_arrived','update_mask_arrived','abort_safe','program_quiet','program_ready','rf_quiet','lsu_quiet'];
 const outputs=['pending_D','candidate_D','parked_D','entry_mask','service_ready'],products=[];
 const add=(out,literals)=>products.push({out,literals});
 for(const name of ['reset_request','pending'])add('pending_D',{[name]:true,release_complete:false,initialize:false});
 for(const name of ['reset_request','pending','initialize'])add('entry_mask',{[name]:true});
 const boundaries=[{idle:true},{done:true},{update:true,commit_complete:true},{abort_safe:true}];
 const qualified={pending:true,release_complete:false,initialize:false,idle_mask_arrived:true,update_mask_arrived:true};
 for(const b of boundaries){add('candidate_D',{...qualified,...b});add('parked_D',{...qualified,candidate:true,...b});}
 add('parked_D',{pending:true,parked:true,release_complete:false,initialize:false});
 add('service_ready',{pending:true,parked:true,release_complete:false,idle_mask_arrived:true,update_mask_arrived:true,program_quiet:true,program_ready:false,rf_quiet:true,lsu_quiet:true,initialize:false});
 return{inputs,outputs,products};
}
export function evaluate(v){const d=definition();return Object.fromEntries(d.outputs.map(n=>[n,d.products.some(t=>t.out===n&&Object.entries(t.literals).every(([k,b])=>!!v[k]===b))]));}
