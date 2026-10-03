// Retained architectural-zero pipeline. These equations generate real blocks.
export function definition(){const inputs=['scratch_complete','active','prepared','transferred','stop','clamps_high','release','initialize','fault','phase_a','phase_b','withdraw','next_captured'],outputs=['active_D','prepared_D','transferred_D','stop_D','next_open','current_open','rf_reset','clamp'],products=[];const add=(out,literals)=>products.push({out,literals});
 for(const n of['scratch_complete','active'])add('active_D',{[n]:true,release:false,initialize:false,fault:false});
 add('prepared_D',{active:true,clamps_high:true,release:false,initialize:false});add('transferred_D',{active:true,prepared:true,release:false,initialize:false});add('stop_D',{active:true,transferred:true,release:false,initialize:false});
 add('next_open',{phase_a:true,active:true,prepared:true,stop:false,initialize:false,fault:false});
 add('current_open',{phase_b:true,active:true,next_captured:true,stop:false,initialize:false,fault:false});
 add('rf_reset',{active:true,withdraw:false,initialize:false,fault:false});add('clamp',{active:true});return{inputs,outputs,products};}
export function clampDefinition(){const inputs=Array.from({length:20},(_,i)=>'clamp'+i);return{inputs,outputs:['all_clamps_high'],products:[{out:'all_clamps_high',literals:Object.fromEntries(inputs.map(n=>[n,true]))}]};}
