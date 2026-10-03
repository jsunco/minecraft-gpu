// Hardware design equations only; never a live control path.
export const INPUTS=['start','idle','permit','reset','initialize'];export const OUTPUTS=['claim'];
export const terms=()=>[{out:'claim',literals:{start:true,idle:true,permit:true,reset:false,initialize:false}}];
export const evaluate=v=>({claim:!!v.start&&!!v.idle&&!!v.permit&&!v.reset&&!v.initialize});
