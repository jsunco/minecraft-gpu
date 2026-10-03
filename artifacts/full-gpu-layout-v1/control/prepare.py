#!/usr/bin/env python3
"""Offline control/interface specification. No Minecraft/runtime imports."""
import hashlib
import json
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RTL = ROOT / 'reference/tiny-gpu/src'
COMMIT = '02b6c2ce223f606051a6d3a35ca942fbb1dffde2'
FILES = ['gpu','core','dispatch','scheduler','fetcher','decoder','registers','pc','lsu','controller','dcr','alu']
PARAMS = dict(DATA_MEM_ADDR_BITS=8, DATA_MEM_DATA_BITS=8, DATA_MEM_NUM_CHANNELS=4,
              PROGRAM_MEM_ADDR_BITS=8, PROGRAM_MEM_DATA_BITS=16, PROGRAM_MEM_NUM_CHANNELS=1,
              NUM_CORES=2, THREADS_PER_BLOCK=4, DATA_BITS=8, ADDR_BITS=8,
              NUM_CONSUMERS=8, NUM_CHANNELS=4, THREAD_ID=0)
STATES = ['IDLE','FETCH','DECODE','REQUEST','WAIT','EXECUTE','UPDATE','DONE']
OPS = ['NOP','BRnzp','CMP','ADD','SUB','MUL','DIV','LDR','STR','CONST','reserved_A','reserved_B','reserved_C','reserved_D','reserved_E','RET']

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def pack(x): return json.dumps(x, indent=2, sort_keys=False) + '\n'
def source_refs():
    paths = [f'reference/tiny-gpu/src/{n}.sv' for n in FILES]
    paths += ['docs/ARCHITECTURE_CONTRACT.md','artifacts/compact-phase-controller-plan-v1/README.md',
              'hardware/compact-register-file.mjs','artifacts/compact-register-file-v1/design.json',
              'artifacts/compact-register-file-v1/bringup-campaign-analysis.json',
              'artifacts/compact-register-signatures-v1/native/campaign-analysis.json',
              'hardware/address-decoder4.mjs','artifacts/address-decoder4-relocated-v1/generated/design.json',
              'artifacts/address-decoder4-native-review-v2/native-acceptance-review.json']
    paths += ['hardware/full-gpu-register-bank.mjs','hardware/dense-register-word.mjs','artifacts/full-gpu-layout-v1/memory/interface.json','artifacts/full-gpu-layout-v1/alu/physical-control-interface.json']
    paths += [f'artifacts/full-gpu-layout-v1/registers/lane{i}.json' for i in range(4)]
    return {p: sha(ROOT/p) for p in paths}

def evaluate(expr, params):
    expr = re.sub(r'\$clog2\((\w+)\)', lambda m: str(math.ceil(math.log2(params[m[1]]))), expr)
    for key in sorted(params, key=len, reverse=True):
        expr = re.sub(r'\b'+key+r'\b', str(params[key]), expr)
    if not re.fullmatch(r'[0-9 +*/()\-]+', expr): raise ValueError(expr)
    return int(eval(expr, {'__builtins__': {}}, {}))

def rtl_interfaces():
    out = {}
    for name in FILES:
        ports=[]
        for line_no, line in enumerate((RTL/f'{name}.sv').read_text().splitlines(),1):
            m=re.match(r'\s*(input|output)\s+(wire|reg)\s*(?:\[([^]]+)\]\s*)?(\w+)\s*(?:\[([^]]+)\])?',line)
            if not m: continue
            direction,decl,packed,n,unpacked=m.groups()
            def width(rng):
                if not rng:return 1
                a,b=rng.split(':');return abs(evaluate(a,PARAMS)-evaluate(b,PARAMS))+1
            ports.append(dict(name=n,direction=direction,declaration=decl,packed_range=packed,
                unpacked_range=unpacked,element_width=width(packed),elements=width(unpacked),
                total_width=width(packed)*width(unpacked),source_line=line_no,
                polarity='active_high' if n in ['reset','enable','start','done'] or 'valid' in n or 'ready' in n or 'enable' in n else 'unsigned_binary',
                bit_order='LSB_first',geometry_status='not_mapped_by_this_RTL_interface'))
        out[name]={'source':f'reference/tiny-gpu/src/{name}.sv','ports':ports}
    return dict(version=1,status='exact_source_port_inventory_at_selected_2x4_8bit_parameters',
        upstream_commit=COMMIT,parameters=PARAMS,
        controller_specializations={'data':dict(consumers=8,channels=4,address_bits=8,data_bits=8),
                                    'program':dict(consumers=2,channels=1,address_bits=8,data_bits=16,write_ports='omitted_or_tied_zero')},
        note='Generic controller ports above are evaluated for the data specialization; declared expressions retained. This is not a claim of arbitrary RTL parameter support.',modules=out)

def decode(word):
    op=word>>12
    return dict(rd=(word>>8)&15,rs=(word>>4)&15,rt=word&15,branch_mask=(word>>9)&7,immediate=word&255,
        reg_write=int(op in [3,4,5,6,7,9]),mem_read=int(op==7),mem_write=int(op==8),
        nzp_write=int(op==2),reg_input_mux=1 if op==7 else 2 if op==9 else 0,
        arithmetic_mux={4:1,5:2,6:3}.get(op,0),compare=int(op==2),pc_mux=int(op==1),ret=int(op==15))

def next_pc(current, immediate, flags, mask, branch):
    return immediate if branch and (flags&mask) else (current+1)&255

def active_pc(candidates, count):
    if not 1<=count<=4: raise ValueError('Cannot retire a zero-lane block')
    if len(set(candidates[:count]))!=1: raise ValueError('Divergent active next PCs')
    return candidates[0]

def dispatch_plan(threads):
    if not 0<=threads<=255: raise ValueError('DCR range')
    return [{'block_id':b,'thread_count':min(4,threads-4*b),'lane_mask':(1<<min(4,threads-4*b))-1}
            for b in range((threads+3)//4)]

def decoder_gates():
    gates=[dict(id=f'n{i}',op='NOT',inputs=[f'opcode[{i}]']) for i in range(4)]
    for op in range(16):
        gates.append(dict(id=f'op{op}',op='AND',inputs=[f'opcode[{i}]' if op&(1<<i) else f'n{i}' for i in range(4)]))
    terms={'reg_write':[3,4,5,6,7,9],'mem_read':[7],'mem_write':[8],'nzp_write':[2],
           'reg_input_mux[0]':[7],'reg_input_mux[1]':[9], 'arithmetic_mux[0]':[4,6],
           'arithmetic_mux[1]':[5,6],'compare':[2],'pc_mux':[1],'ret':[15]}
    for out,ops in terms.items():gates.append(dict(id=out,op='OR' if len(ops)>1 else 'BUFFER',inputs=[f'op{x}' for x in ops]))
    return dict(version=1,status='Boolean_gate_netlist_unrouted',inputs={'opcode':4},gates=gates,
        field_wires={'rd':[8,9,10,11],'rs':[4,5,6,7],'rt':[0,1,2,3],'branch_mask':[9,10,11],'immediate':list(range(8))},
        outputs=terms,ops=OPS,
        latching='Selected candidate holds the16-bit instruction physically closed through UPDATE/drain; fields alias that IR and11 controls are combinational. DECODE produces a settled-valid barrier. All architectural actions require valid+qualified physical microphase. Separate34-bit latch map is an unselected baseline.',
        geometry_status='opcode-matrix.json supplies actual one-hot/OR/control geometry. Instruction storage,23 field routes, valid gate/fanout and downstream routes remain missing.',
        gate_count={'NOT':4,'AND4':16,'OR_multi':3,'BUFFER':8},
        physical_limit='Logical gate count is not a material count; refresh, inversion, support, isolation and clocked storage are uncounted.')

def protocols():
    return {
      'level_four_phase_v1':dict(polarity='active_high',sequence=['producer presents payload while request=0/ready=0','payload settles, request rises','receiver completes physical work, retains response and raises ready','producer captures response and drops request','receiver sees request low and drops ready','producer sees ready low before next request'],stable='Payload held from before request rises through ready recognition; response held while ready high. No pulse-only acknowledgements.',geometry_status='protocol_only'),
      'program_memory_level_v1':dict(base='level_four_phase_v1',address_bits=8,data_bits=16,consumers=2,channels=1,read_only_during_execution=True),
      'data_memory_level_v1':dict(base='level_four_phase_v1',address_bits=8,data_bits=8,consumers=8,channels=4,write_ack='Only after all eight selected physical bits are stored and closed.',mutual_exclusion='Each consumer and each channel issues read OR write; never both.'),
      'register_event_v1':dict(base='level_four_phase_v1',kinds={'0':'OTHER','1':'REQUEST','2':'UPDATE'},stable='Decoded fields/block ID/writeback stable until ACK; both A and B capture old values before any R13 refresh. Disabled lanes acknowledge without effects; reset overrides enable.'),
      'arithmetic_level_v1':dict(stable='A/B and mode held throughout execution. result/ready held through UPDATE and result_ack. A fault suppresses UPDATE.',sequence=['execute_request high with stable A/B/mode','all active ready high; result retained','architectural UPDATE consumes result','execute_request low then result_ack high','ALU ready low','result_ack low before next request'],ready_join='Every active lane ready and no active fault; inactive lanes are masked. Inner bit commits may not advance until all active lane local destination locks have completed closure.'),
      'physical_microphase_v1':dict(sequence=['all affected bank OPEN signals low','wait farthest actual lock closure','change selectors/data/next-control state','wait selected-path propagation','open exactly designated destination bank','wait capture','close destination','wait lock closure before source or opposite bank changes'],geometry_status='Needs routed delay/ack implementation; no microphase duration selected from software.')}

def control_netlist():
    types={};instances=[];nets=[]
    def module(name,inputs,outputs,role,geometry='missing'):
        def ports(items,direction):
            return [dict(name=n,direction=direction,width=w,polarity='active_high',bit_order='LSB_first',
                         role=role,protocol=pr,validity='As specified by '+pr,geometry_status=geometry) for n,w,pr in items]
        types[name]={'ports':ports(inputs,'in')+ports(outputs,'out'),'geometry_status':geometry}
    def q(n,w=1,p='physical_microphase_v1'):return(n,w,p)
    def inst(id,t,**extra):instances.append(dict(id=id,type=t,**extra));return id
    def ep(i,p,lsb=None,width=None):return {'instance':i,'port':p,**({'slice':{'lsb':lsb,'width':width}} if lsb is not None else {})}
    def net(id,w,driver,sinks,pr='physical_microphase_v1'):nets.append(dict(id=id,width=w,driver=driver,sinks=sinks,protocol=pr,polarity='active_high',bit_order='LSB_first',geometry_status='unrouted'))
    module('panel',[],[q('reset'),q('start'),q('dcr_write'),q('dcr_data',8)],'Physical launch/configuration controls; no host per-cycle answers')
    module('indicators',[q('done'),q('fault')],[],'Physical status outputs')
    module('dcr',[q('reset'),q('write'),q('data',8)],[q('thread_count',8)],'Eight-bit DCR; fixed during launch')
    module('dispatch',[q('reset'),q('start'),q('thread_count',8),q('core_done',2),q('core_reset_ack',2),q('core_fault',2)],
           [q('core_start',2),q('core_reset',2),q('block_id',16),q('thread_count_out',6),q('done'),q('fault')],'Two-core block allocator; reset-before-reuse')
    dec_fields=[q(k,w) for k,w in [('rd',4),('rs',4),('rt',4),('branch_mask',3),('immediate',8),('reg_write',1),('mem_read',1),('mem_write',1),('nzp_write',1),('reg_input_mux',2),('arithmetic_mux',2),('compare',1),('pc_mux',1),('ret',1)]]
    module('decoder',[q('reset'),q('decode_request'),q('instruction',16)],dec_fields+[q('decode_valid')],'IR-held combinational fields/controls plus DECODE settled-valid admission;34-output storage is an unselected alternative')
    module('fetcher',[q('reset'),q('fetch_request'),q('current_pc',8),q('consume'),q('read_ready',1,'program_memory_level_v1'),q('read_data',16,'program_memory_level_v1')],
           [q('read_valid',1,'program_memory_level_v1'),q('read_address',8,'program_memory_level_v1'),q('instruction',16),q('fetched'),q('idle')],'Retained instruction + four-phase memory fetch')
    module('core_control',[q('reset'),q('start'),q('block_id',8),q('thread_count',3),q('fetched'),q('fetch_idle'),q('decode_valid'),*[(n,w,p) for n,w,p in dec_fields],
       q('rf_ack'),q('rf_reset_ack'),q('lsu_done',4),q('lsu_idle',4),q('alu_ready',4),q('alu_fault',4),q('next_pc',32),q('pc_ready',4)],
       [q('done'),q('fault'),q('reset_ack'),q('lane_enable',4),q('current_pc',8),q('core_state',3),q('fetch_request'),q('fetch_consume'),q('decode_request'),
        q('rf_reset'),q('rf_event_req',1,'register_event_v1'),q('rf_event_kind',2,'register_event_v1'),q('lsu_request'),q('lsu_retire'),q('alu_execute',1,'arithmetic_level_v1'),q('alu_ack',1,'arithmetic_level_v1'),q('pc_execute'),q('nzp_commit'),q('local_reset')],
       'Logical eight-state scheduler plus non-overlap microsequencer/joins; no geometry')
    module('register_sequencer',[q('reset'),q('event_req',1,'register_event_v1'),q('kind',2,'register_event_v1'),q('lane_enable',4),q('block_id',8),q('rs',4),q('rt',4),q('rd',4),q('reg_write'),q('wb',32)],
       [q('ack'),q('reset_ack'),q('ra',4),q('wa',4),q('d',32),q('block',32),q('we',4),q('assign',4),q('capture_a',4),q('capture_b',4)],
       'One sequencer shared by four lane files; same address/control phases, independent data. Reset acts on all lanes.')
    rf_names={'ra':'read_address','wa':'write_address','d':'write_data','block':'block_id','we':'write_enable','assign':'assign_block','capture_a':'capture_a','capture_b':'capture_b'}
    module('register_file',[q(rf_names[n],w) for n,w in [('ra',4),('wa',4),('d',8),('block',8),('we',1),('assign',1),('capture_a',1),('capture_b',1)]],
       [q('operand_a',8),q('operand_b',8)],'13 independent writable bytes, retained R13, constants4/lane, serialized physical A/B', 'complete_component_io_geometry_offline_unverified')
    module('writeback_mux',[q('alu',8),q('lsu',8),q('immediate',8),q('select',2)],[q('wb',8)],'Select00 ALU,01 LSU,10 immediate;11 suppress write')
    module('alu',[q('reset'),q('lane_enable'),q('operand_a',8),q('operand_b',8),q('arithmetic_mux',2),q('compare'),q('execute_request',1,'arithmetic_level_v1'),q('result_ack',1,'arithmetic_level_v1')],
       [q('result',8,'arithmetic_level_v1'),q('cmp_nzp',3,'arithmetic_level_v1'),q('ready',1,'arithmetic_level_v1'),q('fault_div_zero',1,'arithmetic_level_v1')],'Arithmetic bundle boundary; internal core-shared sequencer refinements owned by alu bundle')
    module('pc',[q('reset'),q('lane_enable'),q('execute'),q('commit_nzp'),q('current_pc',8),q('immediate',8),q('branch_mask',3),q('branch'),q('alu',8)],
       [q('next_pc',8),q('ready')],'Per-lane retained NZP/nextPC; unsigned flags only CMP at UPDATE')
    module('lsu',[q('reset'),q('lane_enable'),q('request'),q('retire'),q('read_enable'),q('write_enable'),q('A',8),q('B',8),q('read_ready',1,'data_memory_level_v1'),q('read_data',8,'data_memory_level_v1'),q('write_ready',1,'data_memory_level_v1')],
       [q('read_valid',1,'data_memory_level_v1'),q('read_address',8,'data_memory_level_v1'),q('write_valid',1,'data_memory_level_v1'),q('write_address',8,'data_memory_level_v1'),q('write_data',8,'data_memory_level_v1'),q('out',8),q('done'),q('idle')],
       'One LSU per lane; request only after both operands close, held payload/ready return-to-zero')
    for name,n,b,pr in [('program_memory',2,16,'program_memory_level_v1'),('data_memory',8,8,'data_memory_level_v1')]:
        ins=[q('reset'),q('read_valid',n,pr),q('read_address',8*n,pr)];outs=[q('read_ready',n,pr),q('read_data',b*n,pr)]
        if name=='data_memory':ins += [q('write_valid',n,pr),q('write_address',8*n,pr),q('write_data',b*n,pr)];outs += [q('write_ready',n,pr)]
        module(name,ins,outs,'External bundle owned by memory/interface.json; consumer-major packed arrays','memory_bundle_partial_geometry_controllers_unrouted')
    micro=json.loads((ROOT/'artifacts/full-gpu-layout-v1/alu/physical-control-interface.json').read_text())['ports']
    assert len(micro)==38 and all(v['width']==1 for v in micro)
    for command in micro:
        common=dict(polarity='active_high',bit_order='LSB_first',role='Core-shared microsequence, individually lane-qualified; not a host command',protocol='physical_microphase_v1',validity='Selectors settled before OPEN; close before changing selector/opposite bank',geometry_status='missing')
        types['alu']['ports'].append(dict(name=command['name'],direction='in',width=1,**common))
        types['core_control']['ports'].append(dict(name='alu_micro_'+command['name'],direction='out',width=4,**common))
    panel=inst('gpu/panel','panel');ind=inst('gpu/indicators','indicators');dcr=inst('gpu/dcr','dcr');dispatch=inst('gpu/dispatch','dispatch')
    inst('gpu/program_memory','program_memory');inst('gpu/data_memory','data_memory')
    net('global_reset',1,ep(panel,'reset'),[ep(dcr,'reset'),ep(dispatch,'reset'),ep('gpu/program_memory','reset'),ep('gpu/data_memory','reset')]);net('start',1,ep(panel,'start'),[ep(dispatch,'start')]);
    for a,b in [('dcr_write','write'),('dcr_data','data')]:net(a,1 if b=='write' else 8,ep(panel,a),[ep(dcr,b)])
    net('thread_count',8,ep(dcr,'thread_count'),[ep(dispatch,'thread_count')])
    net('kernel_done',1,ep(dispatch,'done'),[ep(ind,'done')]);net('kernel_fault',1,ep(dispatch,'fault'),[ep(ind,'fault')])
    for c in range(2):
        core=inst(f'gpu/core{c}','core_control');dec=inst(core+'/decoder','decoder');fetch=inst(core+'/fetcher','fetcher');seq=inst(core+'/register_sequencer','register_sequencer')
        def connect(id,w,di,dp,si,sp,dl=None,sl=None,pr='physical_microphase_v1'):
            net(f'c{c}_{id}',w,ep(di,dp,dl,w),[ep(si,sp,sl,w)],pr)
        for p,w in [('core_start',1),('core_reset',1),('block_id',8),('thread_count_out',3)]:
            connect(p,w,dispatch,p,core,{'core_start':'start','core_reset':'reset','thread_count_out':'thread_count'}.get(p,p),c*w)
        for p in ['done','reset_ack','fault']:connect(p,1,core,p,dispatch,'core_'+p,None,c)
        for a,b in [('fetch_request','fetch_request'),('current_pc','current_pc'),('fetch_consume','consume')]:connect(a,8 if a=='current_pc' else 1,core,a,fetch,b)
        connect('fetched',1,fetch,'fetched',core,'fetched');connect('fetch_idle',1,fetch,'idle',core,'fetch_idle')
        connect('instruction',16,fetch,'instruction',dec,'instruction');connect('decode_request',1,core,'decode_request',dec,'decode_request');connect('decode_valid',1,dec,'decode_valid',core,'decode_valid')
        for name,w,pr in dec_fields:connect('decode_'+name,w,dec,name,core,name)
        # Phase refinements fan out the latched instruction fields without making copies of architectural data.
        for name in ['rs','rt','rd','reg_write']:connect('rf_'+name,4 if name!='reg_write' else 1,dec,name,seq,name)
        connect('rf_reset',1,core,'rf_reset',seq,'reset');connect('rf_event',1,core,'rf_event_req',seq,'event_req',pr='register_event_v1');connect('rf_kind',2,core,'rf_event_kind',seq,'kind',pr='register_event_v1')
        connect('rf_mask',4,core,'lane_enable',seq,'lane_enable');connect('rf_blockid',8,dispatch,'block_id',seq,'block_id',c*8)
        for p in ['ack','reset_ack']:connect('rf_'+p,1,seq,p,core,'rf_'+p)
        net(f'c{c}_local_reset',1,ep(core,'local_reset'),[ep(fetch,'reset'),ep(dec,'reset')]+[ep(core+f'/lane{l}/'+m,'reset') for l in range(4) for m in ['alu','pc','lsu']])
        for n,w,rev in [('read_valid',1,False),('read_address',8,False),('read_ready',1,True),('read_data',16,True)]:
            if rev:connect('program_'+n,w,'gpu/program_memory',n,fetch,n,c*w,pr='program_memory_level_v1')
            else:connect('program_'+n,w,fetch,n,'gpu/program_memory',n,None,c*w,'program_memory_level_v1')
        for l in range(4):
            lane=core+f'/lane{l}';rf=inst(lane+'/registers','register_file',lane_id=l,constant_registers={'R14':4,'R15':l});alu=inst(lane+'/alu','alu');pc=inst(lane+'/pc','pc');lsu=inst(lane+'/lsu','lsu');wb=inst(lane+'/writeback','writeback_mux')
            for p,w in [('ra',4),('wa',4),('d',8),('block',8),('we',1),('assign',1),('capture_a',1),('capture_b',1)]:connect(f'l{l}_rf_{p}',w,seq,p,rf,rf_names[p],None if p in ['ra','wa'] else l*w)
            for p in ['A','B']:net(f'c{c}_l{l}_{p}',8,ep(rf,'operand_'+p.lower()),[ep(alu,'operand_'+p.lower()),ep(lsu,p)])
            net(f'c{c}_l{l}_enable',1,ep(core,'lane_enable',l,1),[ep(x,'lane_enable') for x in [alu,lsu,pc]])
            for a,b in [('arithmetic_mux','arithmetic_mux'),('compare','compare')]:connect(f'l{l}_{a}',2 if a=='arithmetic_mux' else 1,dec,a,alu,b)
            for a,b in [('alu_execute','execute_request'),('alu_ack','result_ack')]:connect(f'l{l}_{a}',1,core,a,alu,b,pr='arithmetic_level_v1')
            for command in micro:connect(f'l{l}_micro_{command["name"]}',1,core,'alu_micro_'+command['name'],alu,command['name'],l)
            for p in ['ready','fault']:connect(f'l{l}_alu_{p}',1,alu,'fault_div_zero' if p=='fault' else p,core,'alu_'+p,None,l,'arithmetic_level_v1')
            net(f'c{c}_l{l}_alu_result',8,ep(alu,'result'),[ep(wb,'alu'),ep(pc,'alu')], 'arithmetic_level_v1')
            for a,b,w in [('pc_execute','execute',1),('nzp_commit','commit_nzp',1),('current_pc','current_pc',8)]:connect(f'l{l}_{a}',w,core,a,pc,b)
            for a,b,w in [('immediate','immediate',8),('branch_mask','branch_mask',3),('pc_mux','branch',1)]:connect(f'l{l}_pc_{a}',w,dec,a,pc,b)
            connect(f'l{l}_next_pc',8,pc,'next_pc',core,'next_pc',None,l*8);connect(f'l{l}_pc_ready',1,pc,'ready',core,'pc_ready',None,l)
            for a,b in [('lsu_request','request'),('lsu_retire','retire')]:connect(f'l{l}_{a}',1,core,a,lsu,b)
            for a,b in [('mem_read','read_enable'),('mem_write','write_enable')]:connect(f'l{l}_{a}',1,dec,a,lsu,b)
            for p in ['done','idle']:connect(f'l{l}_lsu_{p}',1,lsu,p,core,'lsu_'+p,None,l)
            connect(f'l{l}_lsu_out',8,lsu,'out',wb,'lsu');connect(f'l{l}_immediate_wb',8,dec,'immediate',wb,'immediate');connect(f'l{l}_wb_select',2,dec,'reg_input_mux',wb,'select');connect(f'l{l}_wb',8,wb,'wb',seq,'wb',None,l*8)
            consumer=c*4+l
            for n,w,rev in [('read_valid',1,False),('read_address',8,False),('read_ready',1,True),('read_data',8,True),('write_valid',1,False),('write_address',8,False),('write_data',8,False),('write_ready',1,True)]:
                if rev:connect(f'l{l}_data_{n}',w,'gpu/data_memory',n,lsu,n,consumer*w,pr='data_memory_level_v1')
                else:connect(f'l{l}_data_{n}',w,lsu,n,'gpu/data_memory',n,None,consumer*w,'data_memory_level_v1')
    return dict(version=1,status='proposed_logical_integration_netlist_no_complete_block_layout',scope={'cores':2,'lanes_per_core':4,'data_bits':8,'instruction_bits':16},
                schema={'endpoint':'{instance,port,slice?:{lsb,width}}','arrays':'consumer-major, each element LSB-first','polarity':'active-high assertions; stored binary buses LSB-first'},
                module_types=types,instances=instances,nets=nets,
                external_refinements=['ALU shared microsequencer is detailed in ../alu and must supply all bank-select/open routes; this boundary is not a claim those inputs generate themselves.',
                    'Memory top-level consumer ports are fixed with ../memory/interface.json; loading panel and bank/internal channels belong there.',
                    'Core_state output is a logical observability port, not a free-running Minecraft clock or direct action enable.'])

def fsm():
    def t(a,guard,b,actions):return dict(from_state=a,guard=guard,to_state=b,actions=actions)
    return dict(version=1,status='control_transition_design_only',reset_priority='dominates lane_enable and start; no new memory request after reset admission',
      logical_states={s:i for i,s in enumerate(STATES)},
      scheduler=[t('IDLE','start && core_reset_complete','FETCH',['fetch_request=1']),
        t('FETCH','fetched','DECODE',['instruction held; consume fetch response']),
        t('DECODE','decode_valid && instruction16_closed','REQUEST',['event_req=1,kind=REQUEST']),
        t('REQUEST','rf_ack && all_operand_banks_closed','WAIT',['drop RF request; then admit qualified LSU requests']),
        t('WAIT','all active memory operations done (or no memory opcode), RF ack returned low','EXECUTE',['start per-lane arithmetic/nextPC calculation']),
        t('EXECUTE','all active ALU ready && all active PC ready && no fault','UPDATE',['hold ALU result; launch UPDATE register event']),
        t('EXECUTE','any active ALU fault','EXECUTE',['latch fault; suppress UPDATE/PC advancement; explicit reset required']),
        t('UPDATE','rf_ack && flag commit complete && decoded_ret','DONE',['retire all LSUs; drain ready/valid; raise done only when quiescent']),
        t('UPDATE','rf_ack && flag commit complete && !decoded_ret && active PCs agree','FETCH',['commit chosen active nextPC; release ALU; retire LSUs; finish all return-to-zero handshakes; drop decode_request and wait decode_valid low BEFORE opening instruction storage for another fetch']),
        t('UPDATE','active PCs disagree','UPDATE',['latch divergence fault; suppress shared PC advancement']),
        t('DONE','!reset','DONE',['done held'])],
      refinements={'WAIT':'Recompute reductions each visit; do not reuse a sticky temporary. Disabled lanes excluded explicitly; request admission completed before checking them.',
                   'EXECUTE':'Arithmetic for every active lane matches original mux semantics, even if opcode will not write result; a future skip optimization must separately specify observable hidden state.',
                   'UPDATE':'Only CMP commits NZP. Reserved/NOP/BR/RET never write GPR. Rd>=13 never writes. Current PC commit follows completed lane effects.',
                   'reset':'Current data transfer may already have committed a store. Reset abort semantics are not specified upstream; require normal quiescent launch/core reuse. Emergency reset needs explicit drain/ownership protocol; no rollback guarantee.',
                   'decode_density':'Original34 decoded output latches replaced by held instruction16 plus physically generated settled-valid. This changes hidden FETCH-time decoder values only; all action gates must be closed before IR changes. WAIT/EXECUTE/UPDATE preserve IR, decode_request and fields. Valid must drop before any new IR capture. The baseline34bit map is retained unselected.'},
      fetcher=[t('IDLE','FETCH && ready=0','FETCHING',['latch PC; read_valid=1']),t('FETCHING','read_ready','FETCHED',['latch instruction; read_valid=0']),t('FETCHED','DECODE && read_ready=0','IDLE',['keep instruction until next successful fetch'])],
      lsu=[t('IDLE','lane_enabled && REQUEST operands closed && memory opcode','REQUESTING',['latch A as address, B as store data']),t('REQUESTING','selected ready=0','WAITING',['assert exactly one valid']),t('WAITING','selected ready=1','DONE',['capture read response if load; valid=0']),t('DONE','UPDATE complete && selected ready=0','IDLE',['out remains stored'])],
      upstream_memory_controller=[t('IDLE','lowest eligible consumer found','READ_WAITING or WRITE_WAITING',['claim busy immediately before another channel grant; latch owner/payload; valid=1']),t('READ_WAITING','memory ready','READ_RELAYING',['memory valid=0; response retained; consumer ready=1']),t('WRITE_WAITING','memory ready','WRITE_RELAYING',['memory valid=0; consumer ready=1']),t('READ_RELAYING or WRITE_RELAYING','owner valid=0','IDLE',['consumer ready=0; busy=0'])],
      memory_refinement='Before reissuing on a physical channel require prior memory ready low. Four striped banks may stall different channels; consumer ownership/order cannot be replaced by host arbitration.',
      dispatch=dict(states=['RESET_ALL','WAIT_START','SCAN_ASSIGN_CORE0','SCAN_ASSIGN_CORE1','SCAN_DONE_CORE0','SCAN_DONE_CORE1','WAIT_RESET_ACK','DONE'],
          count_widths={'thread_count':8,'ceil_input_T_plus_3':9,'total_blocks':7,'blocks_dispatched':7,'blocks_done':7,'core_block_id':8,'lane_count':3},
          total_blocks='(zero_extend9(T)+3)>>2; range0..64',
          assign='Scan available/reset-complete core0 then core1; latch block_id=blocks_dispatched and lane_count=min(4,T-4*block_id); increment once and raise start. Keep block_id/count stable while assigned.',
          retire='Only if assigned core start && done. Count once, lower start, assert that core reset. Await reset acknowledgements before reassignment. Other core/global memories continue.',
          completion='done iff blocks_done==total_blocks AND no assigned unfinished core; T=0 dispatches nothing. done sticky until reset.',
          source_difference='Physical transactional scans/acknowledgements replace RTL nonblocking same-clock reset/start behavior; ascending assignment and block identity preserved, not cycle accuracy.'),
      register_event=dict(inputs={'kind':2,'lane_enable':4,'rs':4,'rt':4,'rd':4,'reg_write':1,'wb':32,'block_id':8},
          REQUEST=['ALL_CLOSED','SELECT_RS','WAIT_READ','OPEN_A_ENABLED','CLOSE_A','WAIT_A_LOCK','SELECT_RT','WAIT_READ','OPEN_B_ENABLED','CLOSE_B','WAIT_B_LOCK','REFRESH_R13_ENABLED','ACK'],
          UPDATE=['ALL_CLOSED','STAGE_RD_WB','WAIT_WRITE_DATA','OPEN_WE_ENABLED_AND_RD_LT13','CLOSE_WE','WAIT_WORD_LOCK','REFRESH_R13_ENABLED','ACK'],
          OTHER=['ALL_CLOSED','REFRESH_R13_ENABLED','ACK'],
          R13_refresh=['stage block-ID bus with ASSIGN=0','wait local R13 data','ASSIGN=lane_enable','wait capture','ASSIGN=0','wait farthest R13 lock'],
          invariant='No RA/WA/data changes while the corresponding capture/write gate is open. Both A and B use old retained R13 on REQUEST; refresh strictly afterward. Rd write protection is independent of R13 refresh.',
          R13_clock_policy='Refinements are internal to one logical event; physical microphases do not repeatedly refresh R13. During logical stalls block ID is constant, so repeated enabled RTL refreshes are idempotent. Emit OTHER refresh at remaining logical boundaries.'),
      reset_sequence=['inhibit requests/updates; require quiescent normal restart','close all file/action/ALU bank gates, wait','prime actual D and block-ID sources FF then0 with actions closed','sweep all16 RA values and settle; protect all write/capture gates','zero D and write WA0..12: SELECT→OPEN_WE_ALL_LANES→CLOSE→WAIT','zero block-ID and ASSIGN_ALL_LANES→CLOSE→WAIT','select cleared R0; capture A/B zero and close','clear ALU/LSU/PC/NZP/fetch/decoder/control state via their own physical reset procedures','join reset acknowledgements; drop reset busy; release start'],
      timing=dict(selected_waits=None,reason='The file has directed paired400tick endpoint evidence, not integrated controller/ALU/memory timing. Physical ready may be a conservatively characterized delay network; no software-computed ready.',
          required=['raw closed gate to farthest lock closure','RA to read bus and A/B local-D','D/WA to selected storage','block-ID/ASSIGN at top row','all four-lane broadcast branches','ALU current/next closure and ripple settling','decoder fields to selected action gate','memory read/write response and return-to-zero']))

def physical_mapping():
    design=json.loads((ROOT/'artifacts/compact-register-file-v1/design.json').read_text())
    origin=design['origin'];blocks={tuple(x['position'][a] for a in 'xyz'):x['block'] for x in design['blocks']}
    ports=[]
    for p in design['inputs']:
        b=blocks[tuple(p['position'][a] for a in 'xyz')]
        ports.append(dict(name=p['name'],local_position={a:p['position'][a]-origin[a] for a in 'xyz'},source_block=b,
                          integration='Explicit backed-up lever-source replacement plus isolated diode input; route absent in this package. All retained local latch geometry preserved.'))
    return dict(version=1,status='inventory_and_missing_geometry_not_a_complete_layout',
      reusable=[dict(module='one lane register file including A/B',artifact='artifacts/compact-register-file-v1/design.json',blocks=len(design['blocks']),local_ports=ports,
          evidence=['artifacts/compact-register-file-v1/bringup-campaign-analysis.json','artifacts/compact-register-signatures-v1/native/campaign-analysis.json'],
          scope='Actual lane1 fixture directed passed. Eight physical copies and lane constants0..3, controller source conversions, full persistence and integrated timing not established.'),
        dict(module='complete opcode/control matrix',artifact='artifacts/full-gpu-layout-v1/control/opcode-matrix.json',blocks=3559,status='complete component coordinate map, native unverified',
             integration='Four opcode bits to all11 actual decoded control bits, including refreshed fanout rows, isolated branch diodes and positive OR towers. Combinational only, no direct architectural write enables. Reset/address conditioning required.'),
        dict(module='34bit decoded field/control latch bank',artifact='artifacts/full-gpu-layout-v1/control/decode-latches.json',blocks=1703,status='complete unselected baseline coordinate map, native unverified',selected=False,
             integration='34 independent normalized/locked repeater cells, active-high DECODE_OPEN, shared inverted lock rail, separate fresh Q outputs. Clear through actual zero D/open/close; no independent reset clamp.'),
        dict(module='integrated lane register IO derivative',artifacts=[f'artifacts/full-gpu-layout-v1/registers/lane{i}.json' for i in range(4)],blocks_each=13048,status='root-generated complete component IO maps, native unverified',
             integration='Exact names in interface.json: write_data/write_address/read_address/write_enable/block_id/assign_block/capture_a/capture_b to operand_a/operand_b. No fixture levers remain.'),
        dict(module='non-overlap/current-next storage and clock motifs',artifacts=['artifacts/serial-bank-coupon-v1/design.json','artifacts/compact-ripple-bulb-counter-v1/design.json'],status='offline proposals; no physical timing acceptance; not a complete core sequencer')],
      missing_geometry=['dispatch DCR/counters/comparators/core assignment/reset scan/handshake wiring','two PC8 current registers and per-lane nextPC8/NZP3 plus increment/branch/equality network',
        'two instruction16 response latches/fetch FSMs;23 field alias routes, opcode input routes, settled-valid gate and core fanout','logical scheduler storage and safe physical microphase transitions/clock reset/rearm',
        'shared RF/reset sequencer per core and all interlane28source/fanout routes','writeback selector integration routes and enable/protected-address gating (selector geometry owned by root)',
        'eight LSU payload/response/state/valid paths and memory return-to-zero logic','all cross-module routes, supports/refresh/isolation, global reset/launch/load/done/fault panel'],
      storage_accounting_note='Architecture bits and proposed control bits are not translated into block totals. No complete machine cost, site, clock rate or packed floorplan claimed.',
      concrete_logic='decoder-gates.json supplies exact Boolean terms/field wires; opcode-matrix.json and decode-latches.json now supply actual separate component maps. Their interconnection and all remaining control still require routing. Full connected layout is incomplete.')

def generate():
    return {'rtl-interfaces.json':rtl_interfaces(),'interface.json':control_netlist(),'protocols.json':protocols(),
            'control-fsm.json':fsm(),'decoder-gates.json':decoder_gates(),'physical-mapping.json':physical_mapping(),
            'alu-control-refinement.json':dict(version=1,status='exact_required_core_shared_microcontrol_ports_bound_geometry_missing',
              instances=['gpu/core0','gpu/core1'],
              source_interface='../alu/physical-control-interface.json',
              physical_ports=json.loads((ROOT/'artifacts/full-gpu-layout-v1/alu/physical-control-interface.json').read_text())['ports'],
              connected_command_nets=304,
              one_hot_source_options={'W':['zero','a','trial','self','q','cmp'],'M':['zero','a','b','left','self'],'Q':['zero','a','b','self','left_take']},
              logical_commands=[{'name':f'{bank}_{action}','width':1} for bank in ['w','m','q'] for action in ['open_next','open_current','load_parallel']]+
                  [{'name':f'{bank}_parallel_select','width':3} for bank in ['w','m','q']]+
                  [{'name':n,'width':w} for n,w in [('carry_select',2),('nonzero_clear',1),('q_aux_select',2),('addend_mode',2),('subtract',1),('final_latched',1)]],
              physical_decode='Decode W/M/Q choices once per core into one-hot select lines; broadcast to four independent lane-local muxes. All0 means masked; multiple1 is forbidden. External input A/B remain physical lane bytes.',
              local_data_conditions={'addend_mode':{'0':'zero','1':'one','2':'that lane Q0','3':'NOT that lane take'},'warning':'Never broadcast one lane Q0, carry, take, NZP or result to other lanes.'},
              sequence=['close all destination banks','wait for all active lane closures','choose stable one-hot source/aux modes','wait farthest combinational paths','open next banks selected by macrostep','close next; wait','open current banks selected by macrostep','close current; wait','advance shared bit/round state only after all affected closures'],
              loops={'ADD_SUB_CMP':8,'MUL':64,'DIV':128,'unit':'bit commits per operation; initialization/finalization/flags and waits are extra'},
              required_macrosteps=['RESET_SAFE','INIT','PASS_INIT_SELF_COPY','SERIAL_BIT','DIV_TRIAL','TAKE_CAPTURE','CONDITIONAL_RESTORE','MUL_OUTER','DIV_QSHIFT','FINAL'],
              missing_geometry=['Shared per-core mode/bit/round/microphase storage and next-state logic','All18 logical command qualification and encoded-to-one-hot gates','Broadcast/routed ports to four ALUs plus actual closure/settlement mechanism','Physical ready/fault join, final result hold/ack and full reset'],
              geometry_status='missing_do_not_count_as_existing_physical_controller')}

def main():
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
    data=generate()
    for name,value in data.items():
        out=pack(value)
        if args.check:
            if (HERE/name).read_text()!=out:raise ValueError('Regeneration mismatch: '+name)
        else:(HERE/name).write_text(out)
    pins=source_refs()
    for pth in [HERE/n for n in ['prepare.py','check.py','README.md','opcode-matrix.mjs','opcode-matrix.json','decode-latches.mjs','decode-latches.json']]:
        if pth.is_file():pins[str(pth.relative_to(ROOT))]=sha(pth)
    for name in data:pins[str((HERE/name).relative_to(ROOT))]=sha(HERE/name)
    manifest=dict(version=1,status='offline_control_specification_unrouted',upstream_commit=COMMIT,source_sha256=pins,
                  native_calls=0,existing_sources_modified=False,missing_geometry_explicit=True)
    if args.check:
        if json.loads((HERE/'source-manifest.json').read_text())!=manifest:raise ValueError('Manifest mismatch')
    else:(HERE/'source-manifest.json').write_text(pack(manifest))
    print(pack({'status':'checked' if args.check else 'prepared','RTL_modules':len(FILES),
          'instances':len(data['interface.json']['instances']),'nets':len(data['interface.json']['nets']),'pins':len(pins),'native_calls':0}))

if __name__=='__main__':main()
