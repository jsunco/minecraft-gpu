// Whole-layout design data only: no services, world calls, or running-machine answers.
import assert from 'node:assert/strict';

export function makeFullLaneAluNetlist(){
 const ports=[]; const port=(name,width,direction,meaning)=>ports.push({name,width,direction,polarity:'active_high',bit_order:'lsb_first',meaning});
 for(const n of ['operand_a','operand_b'])port(n,8,'input','REQUEST-captured operand; held through result acknowledgement.');
 port('arithmetic_mux',2,'input','Original encoding: 0 ADD, 1 SUB, 2 MUL, 3 DIV; ignored when compare=1. Core retains mode.');
 port('compare',1,'input','Original decoded_alu_output_mux; overrides arithmetic_mux, requests corrected unsigned CMP.');
 for(const[n,meaning]of Object.entries({lane_enable:'Inactive lanes never accept requests or commit state.',reset:'Requests ordered physical clear; suppress commits until all banks and control state are cleared.',execute_request:'Four-phase level request. Accept exactly once while idle and enabled; hold payload until ready.',result_ack:'Only after ready and architectural UPDATE; requester lowers request before acknowledgement.'}))port(n,1,'input',meaning);
 port('result',8,'output','W_next held until acknowledgement/next accepted operation. CMP: {0,0,0,0,0,N,Z,P}; DIV: quotient Q, never remainder W.');
 port('cmp_nzp',3,'output','Aliases result[2:0], valid for compare+ready only. N=result[2], Z=result[1], P=result[0].');
 port('ready',1,'output','Retained after final result closes and settles. Not a fixed clock count.');
 port('fault_div_zero',1,'output','Sticky fault on accepted DIV with B=0; no numeric result and no ready/UPDATE; reset clears. System halt policy remains a core design gate.');
 const state=[];for(const bank of ['W','M','Q'])for(const phase of ['current','next'])state.push({name:bank+'_'+phase,width:8,owner:'lane',reset:0,kind:'locked_repeater_bank'});
 for(const [name,macro,cell]of [['C','W','current_aux'],['C_next','W','next_aux'],['NZ','M','current_aux'],['NZ_next','M','next_aux'],['T8','Q','current_aux'],['take','Q','next_aux']])state.push({name,width:1,owner:'lane',reset:0,kind:'locked_repeater',macro,cell});
 for(const name of ['busy','ready','fault_div_zero'])state.push({name,width:1,owner:'lane',reset:0,kind:'control_latch',geometry:'missing'});
 const instances=[...['W','M','Q'].map(name=>({id:name,kind:'current_next_byte_plus_aux',width:8,state_bits:18,geometry:'integrated_work_bank_candidate'})),
  {id:'condition',kind:'and_then_xor',equation:'b=(M.current[0] & addend_enable) XOR subtract',geometry:'missing'},
  {id:'full_adder',kind:'one_bit_full_adder',equations:{sum:'W.current[0] XOR condition.b XOR C',carry:'(W.current[0]&condition.b)|(W.current[0]&C)|(condition.b&C)'},geometry:'reused_compact_adder_candidate'},
  {id:'enable_select',kind:'mux4',choices:['0','1','Q.current[0]','!take'],geometry:'missing'},
  {id:'constant0',kind:'unpowered_isolated_port',geometry:'missing'},
  {id:'constant1',kind:'permanently_powered_isolated_port',geometry:'missing'},
  {id:'nonzero',kind:'or2',equation:'NZ | full_adder.sum',geometry:'missing'},
  {id:'decision',kind:'or2',equation:'T8 | C',geometry:'missing'},
  {id:'cmp',kind:'unsigned_compare_flags',equation:'{N,Z,P}={!C,!NZ,C&NZ}',geometry:'missing'},
  {id:'divisor_zero',kind:'nor8',equation:'!(|operand_b)',geometry:'missing'},
  {id:'front',kind:'request_ready_fault_state',geometry:'missing'},
  {id:'W_select',kind:'byte_mux_tree',choices:['zero','operand_a','(W.current<<1)|Q.current[7]','W.current','Q.current','zero_extend(cmp.nzp)'],geometry:'missing'},
  {id:'M_select',kind:'byte_mux_tree',choices:['zero','operand_a','operand_b','M.current<<1'],geometry:'missing'},
  {id:'Q_select',kind:'byte_mux_tree',choices:['zero','operand_a','operand_b','Q.current','(Q.current<<1)|decision.take'],geometry:'missing'},
  {id:'C_select',kind:'bit_mux',choices:['0','1','full_adder.carry'],geometry:'missing'},
  {id:'NZ_select',kind:'bit_mux',choices:['0','nonzero.out'],geometry:'missing'},
  {id:'Qaux_select',kind:'bit_mux',choices:['0','W.current[7]','decision.take'],geometry:'missing'}];
 const nets=[];const net=(id,width,from,sinks,meaning)=>nets.push({id,width,driver:{instance:from[0],port:from[1]},sinks:sinks.map(([instance,port])=>({instance,port})),protocol_ref:'alu_closed_next_then_current_v1',meaning});
 net('A',8,['$self','operand_a'],[['W_select','a'],['M_select','a'],['Q_select','a']],'Held REQUEST operand.');
 net('B',8,['$self','operand_b'],[['M_select','b'],['Q_select','b'],['divisor_zero','data']],'Held REQUEST operand.');
 for(const n of ['W','M','Q']){
  net(n+'_current',8,[n,'current'],[[n+'_select','feedback'],...(n==='Q'?[['W_select','div_result']]:[])],n+' current bus retained while next is open.');
  net(n+'_parallel',8,[n+'_select','out'],[[n,'parallel_data']],n+' next parallel mux input.');
  net(n+'_feedback',8,[n,'next'],[[n,'current_data']],n+' real next-to-current wire, never a software copied value.');
 }
 net('w_lsb',1,['W','current[0]'],[['full_adder','a']],'Physical low-bit tap.');
 net('m_lsb',1,['M','current[0]'],[['condition','m'],['M','serial_in']],'Serial bit and rotate-right wrap.');
 net('q_lsb',1,['Q','current[0]'],[['enable_select','q_lsb']],'Retained unchanged throughout each eight-bit multiply pass.');
 net('q_msb',1,['Q','current[7]'],[['W_select','trial_in']],'Incoming dividend bit for DIV trial.');
 net('w_msb',1,['W','current[7]'],[['Qaux_select','trial_high']],'Retain ninth trial bit before W shifts left.');
 net('enabled_mode',1,['enable_select','out'],[['condition','enable']],'Lane-local Q0/take selection. Core supplies mode only; lane data never controls another lane.');
 net('zero_constants',1,['constant0','out'],[['W','rotate'],['Q','rotate'],['Q','serial_in'],['W_select','zero'],['M_select','zero'],['Q_select','zero'],['C_select','zero'],['NZ_select','zero'],['Qaux_select','zero'],['enable_select','zero']],'Physical fixed-zero pins, not runtime host inputs.');
 net('one_constants',1,['constant1','out'],[['M','rotate'],['C_select','one'],['enable_select','one']],'Physical fixed-one pins with all distribution counted when routed.');
 net('conditioned_m',1,['condition','b'],[['full_adder','b']],'Enable before inversion; subtract uses enabled M.');
 net('carry',1,['W','current_aux'],[['full_adder','cin'],['cmp','carry'],['decision','carry']],'Retained carry/no-borrow after final bit.');
 net('sum',1,['full_adder','sum'],[['W','serial_in'],['nonzero','sum']],'One arithmetic result bit enters W bit7.');
 net('carry_out',1,['full_adder','carry'],[['C_select','carry']],'Next carry selector.');
 net('nonzero_current',1,['M','current_aux'],[['nonzero','current'],['cmp','nonzero']],'Eight-result-bit nonzero accumulation, not W sign.');
 net('nonzero_next',1,['nonzero','out'],[['NZ_select','nonzero']],'Physical OR path before next capture.');
 net('trial_high',1,['Q','current_aux'],[['decision','trial_high']],'Old W7 retained independently while C is reused.');
 net('take_comb',1,['decision','take'],[['Qaux_select','take'],['Q_select','quotient_bit']],'Stable subtraction decision captures with complete next quotient before restore.');
 net('take_held',1,['Q','next_aux'],[['enable_select','take']],'Held while restore pass overwrites C and W.');
 net('cmp_bits',3,['cmp','nzp'],[['W_select','cmp']],'Corrected unsigned N/Z/P, bit2/1/0.');
 for(const[n,s]of [['W','C_select'],['M','NZ_select'],['Q','Qaux_select']])net(n+'_aux_data',1,[s,'out'],[[n,'aux_data']],'Captured in same next/current phases as this bank.');
 net('result',8,['W','next'],[['$self','result']],'Final next-only capture; hold every write/clock off while ready.');
 net('nzp_alias',3,['W','next[2:0]'],[['$self','cmp_nzp']],'Not a separately retained flag bank. Architectural NZP is PC-owned.');
 for(const n of ['arithmetic_mux','compare','lane_enable','reset','execute_request','result_ack'])net(n,n==='arithmetic_mux'?2:1,['$self',n],[['front',n],['$control',n]],'Stable interface/control ownership.');
 for(const n of ['ready','fault_div_zero'])net(n,1,['front',n],[['$self',n]],'Retained handshake output.');
 net('divisor_is_zero',1,['divisor_zero','out'],[['front','div_zero']],'Only accepted DIV may set fault; ADD/SUB/MUL/CMP with B0 are legal.');
 const micro_ports=[];
 for(const bank of ['W','M','Q'])for(const suffix of ['open_next','open_current','load_parallel'])micro_ports.push({name:bank.toLowerCase()+'_'+suffix,width:1});
 for(const[name,width]of [['w_parallel_select',3],['m_parallel_select',3],['q_parallel_select',3],['carry_select',2],['nonzero_clear',1],['q_aux_select',2],['addend_mode',2],['subtract',1],['final_latched',1]])micro_ports.push({name,width});
 for(const p of micro_ports){let sink;const b=/^([wmq])_(open_next|open_current|load_parallel)$/.exec(p.name);if(b)sink=[b[1].toUpperCase(),b[2]];else sink=({w_parallel_select:['W_select','select'],m_parallel_select:['M_select','select'],q_parallel_select:['Q_select','select'],carry_select:['C_select','select'],nonzero_clear:['NZ_select','clear'],q_aux_select:['Qaux_select','select'],addend_mode:['enable_select','select'],subtract:['condition','subtract'],final_latched:['front','final_latched']})[p.name];net('micro_'+p.name,p.width,['$control',p.name],[sink],'Core-owned sequencer; per-lane enable/busy/fault qualification required before bank OPEN. Selectors stable before opening next and through closure. Geometry not yet routed.');}
 const steps={
  RESET:{parallel:{W:0,M:0,Q:0},aux:{C:0,NZ:0,T8:0},capture_next:['W','M','Q'],commit_current:['W','M','Q'],effect:'Clear control latches only with safe bank clear sequence; suppress ready and commits during reset.'},
  INIT:{parallel:{W:'ADD/SUB/CMP?A:0',M:'MUL?A:B',Q:'MUL?B:DIV?A:0'},aux:{C:'SUB/CMP?1:0',NZ:0,T8:0},capture_next:['W','M','Q'],commit_current:['W','M','Q']},
  PASS_INIT:{aux:{C:'subtract?1:0',NZ:0},capture_next:['W','M'],commit_current:['W','M'],parallel:{W:'W.current',M:'M.current'},note:'Do not clear auxiliary latches by opening bank against shifted data; select exact self-copy for this control-only commit.'},
  BIT:{parallel:false,next:{W:'(W>>1)|(sum<<7)',M:'(M>>1)|((M&1)<<7)',C:'carry_out',NZ:'NZ|sum'},capture_next:['W','M'],commit_current:['W','M'],Q:'closed, unchanged'},
  MUL_OUTER:{next:{M:'(M<<1)&255',Q:'Q>>1'},capture_next:['M','Q'],commit_current:['M','Q'],W:'closed, unchanged',note:'Preserve unused auxiliary values or clear them only while their lifetime is dead.'},
  DIV_TRIAL:{next:{W:'((W<<1)&255)|(Q>>7)',Q:'Q',T8:'old W>>7'},capture_next:['W','Q'],commit_current:['W','Q'],M:'closed, unchanged'},
  DIV_DECISION:{next:{Q:'((Q<<1)&255)|(T8|C)',take:'T8|C'},capture_next:['Q'],commit_current:[],note:'Q_next and take remain physically closed during all eight restore bits.'},
  DIV_Q_COMMIT:{capture_next:[],commit_current:['Q'],note:'Q.current receives quotient shift; T8 receives take, harmless because the old trial-high lifetime ended.'},
  FINAL:{parallel:{W:'CMP?zero_extend({!C,!NZ,C&NZ}):DIV?Q:W'},capture_next:['W'],commit_current:[],note:'After full closure/settlement, assert ready. Never commit this final output back into scratch current automatically.'}
 };
 // PASS_INIT needs self-copy paths in addition to the earlier compact-plan mux choices.
 instances.find(n=>n.id==='M_select').choices.push('M.current');
 const program={ADD:['INIT','BIT x8','FINAL'],SUB:['INIT','BIT(subtract=1) x8','FINAL'],CMP:['INIT','BIT(subtract=1) x8','FINAL'],MUL:['INIT','(PASS_INIT(C0,NZ0); BIT(enable=Q0) x8; MUL_OUTER) x8','FINAL'],DIV:['reject B0','INIT','(DIV_TRIAL; PASS_INIT(C1,NZ0); BIT(subtract=1) x8; DIV_DECISION; PASS_INIT(C0,NZ0); BIT(enable=!take) x8; DIV_Q_COMMIT) x8','FINAL']};
 assert.equal(state.reduce((n,s)=>n+s.width,0),57);
 return{status:'complete_logical_interface_and_recurrence_physical_layout_in_progress',id:'full_lane_alu_v1',ports,state,state_bits:57,external_state:[{name:'A/B',bits:16,owner:'lane_register_file'},{name:'architectural_NZP',bits:3,owner:'lane_pc',update:'Only UPDATE & lane_enable & decoded_nzp_write_enable & ready; reset zero.'},{name:'mode/phase/inner/outer counters',owner:'core_sequencer',shared_across_lanes:4,independent_cores:2}],instances,nets,micro_ports,steps,program,handshake:{protocol:'Four-phase request/ready with explicit ack; no repeated start while request remains high.',accept:'lane_enable & execute_request & !busy & !ready & !fault',finish:'Final W_next closed and settled => busy0, ready1.',ack:'Requester lowers execute_request after UPDATE, raises result_ack; ready falls; requester lowers ack. Result stays held until the next accepted init/reset.',fault:'DIV0 makes sticky fault, ready0 and prevents UPDATE. Core-wide fault response remains unresolved; no numeric quotient defined.'},timing:{phase_sequence:['all_closed_select','next_open_settle','next_close_margin','current_open_settle','current_close_margin'],game_tick_bound:null,register_file_admission_ticks:400,bit_commit_counts:{ADD:8,SUB:8,CMP:8,MUL:64,DIV:128},extra_captures:'Reset/init/pass-init/outer-shift/trial/decision/final are additional, not included in arithmetic-bit counts.'},limits:['Logical netlist is exact; most new selector/condition/control routes are not yet geometrically implemented.','No native correctness, hazard-free behavior, or latency guarantee.','Mode encoding preserves original decoder inputs; corrected CMP follows architecture contract, not original broken subtraction/sign expression.','No numeric DIV0 result; global fault policy is not silently invented.']};
}
