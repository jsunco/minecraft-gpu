// Narrow zero sequencing. Evaluated only offline to build real gate rows.
export function definition(){const inputs=['active','arrived','prepared','enable','committed','settled','initialize','release','fault'],outputs=['prepared_D','enable_D','committed_D','settled_D','clear0','clear1','clear2','clear3'],products=[];const add=(out,literals)=>products.push({out,literals}),live={active:true,initialize:false,release:false,fault:false};
 for(const n of['arrived','prepared'])add('prepared_D',{...live,[n]:true});
 add('enable_D',{...live,prepared:true,settled:false});
 for(const n of['enable','committed'])add('committed_D',{...live,[n]:true});
 for(const n of['committed','settled'])add('settled_D',{...live,[n]:true});
 for(let i=0;i<4;i++)add('clear'+i,live);
 return{inputs,outputs,products};}
export function arrivalDefinition(){const inputs=Array.from({length:6},(_,i)=>'arrival'+i);return{inputs,outputs:['all_arrived'],products:[{out:'all_arrived',literals:Object.fromEntries(inputs.map(n=>[n,true]))}]};}
