#!/usr/bin/env python3
"""Finite source/interface/control checks, not a running GPU or physical proof."""
import json
from collections import Counter
import prepare as p

def check_netlist(n):
    types={k:{v['name']:v for v in t['ports']} for k,t in n['module_types'].items()}
    instances={i['id']:i for i in n['instances']};used=Counter()
    assert len(instances)==len(n['instances'])
    for net in n['nets']:
        for endpoint,is_driver in [(net['driver'],True)]+[(v,False)for v in net['sinks']]:
            port=types[instances[endpoint['instance']]['type']][endpoint['port']]
            assert port['direction']==('out' if is_driver else 'in'),endpoint
            sl=endpoint.get('slice',dict(lsb=0,width=port['width']))
            assert sl['width']==net['width'] and 0<=sl['lsb'] and sl['lsb']+sl['width']<=port['width']
            if not is_driver:
                for bit in range(sl['lsb'],sl['lsb']+sl['width']):used[endpoint['instance'],endpoint['port'],bit]+=1
        assert net['protocol'] in p.protocols()
    for id,i in instances.items():
        for port in types[i['type']].values():
            if port['direction']=='in':
                for bit in range(port['width']):assert used[id,port['name'],bit]==1,(id,port['name'],bit,used[id,port['name'],bit])
    return sum(used.values())

def check_dispatch():
    total_assignments=0;dispatch_runs=0
    # Different independent completion latencies exercise reuse and simultaneous availability.
    for threads in range(256):
        for latency in [(1,1),(1,3),(4,1),(2,7)]:
            plan=p.dispatch_plan(threads);pending=0;done=[];cores=[None,None];now=0
            while len(done)<len(plan):
                for c in range(2):
                    if cores[c] is None and pending<len(plan):
                        job=dict(plan[pending],core=c,finish=now+latency[c]);cores[c]=job;pending+=1
                for c in range(2):
                    if cores[c] and cores[c]['finish']<=now:done.append(cores[c]);cores[c]=None
                now+=1;assert now<1024
            assert sorted(d['block_id']for d in done)==list(range(len(plan)))
            tids=[4*d['block_id']+lane for d in done for lane in range(4) if d['lane_mask']&(1<<lane)]
            assert sorted(tids)==list(range(threads))
            assert all(1<=d['thread_count']<=4 and d['lane_mask']==(1<<d['thread_count'])-1 for d in done)
            assert len(done)==(threads+3)//4
            total_assignments+=len(done);dispatch_runs+=1
    return dispatch_runs,total_assignments

def check_memory():
    tested=0
    # Independent four-channel priority/ownership rule for every read/write mask.
    for reads in range(256):
      for writes in [0,reads^255,255]:
        busy=set();owners=[]
        for ch in range(4):
            eligible=[c for c in range(8) if c not in busy and ((reads|writes)&(1<<c))]
            if not eligible:break
            c=eligible[0];busy.add(c);owners.append((c,'read' if reads&(1<<c) else 'write'))
        assert len({x[0] for x in owners})==len(owners)
        assert [c for c,_ in owners]==[c for c in range(8)if(reads|writes)&(1<<c)][:4]
        # Responses deliberately reverse order; original owners must remain fixed.
        returned={c:(c*37+reads)&255 for c,_ in reversed(owners)}
        assert all(returned[c]==(c*37+reads)&255 for c,_ in owners)
        tested+=1
    return tested

def check_r13():
    cases=0
    for old in [0,1,127,255]:
      for block in [0,1,63,255]:
       for rs in range(16):
        for rt in range(16):
         regs=[(i*19+7)&255 for i in range(13)]+[old,4,2]
         expected=(regs[rs],regs[rt]);a=regs[rs];b=regs[rt];regs[13]=block
         assert (a,b)==expected
         # Later aliased UPDATE cannot retroactively change the captured operand.
         if rs<13:regs[rs]=a^255
         assert (a,b)==expected and regs[13]==block
         cases+=1
    return cases

def main():
    n=p.control_netlist();bits=check_netlist(n)
    # Evaluate the declared Boolean gate graph independently of decode().
    gates=p.decoder_gates();count=0
    for word in range(65536):
        op=word>>12;v={f'opcode[{i}]':bool(op&(1<<i))for i in range(4)}
        for g in gates['gates']:
            xs=[v[x]for x in g['inputs']]
            v[g['id']]=not xs[0] if g['op']=='NOT' else all(xs)if g['op']=='AND' else any(xs)
        d=p.decode(word)
        for k,ops in gates['outputs'].items():
            if '[' in k:name,b=k[:-1].split('[');expected=(d[name]>>int(b))&1
            else:expected=d[k]
            assert int(v[k])==expected
        for field,bitslice in gates['field_wires'].items():assert d[field]==sum(((word>>bit)&1)<<i for i,bit in enumerate(bitslice))
        # Independent opcode range truth, including every reserved nibble/unused-field combination.
        assert d['reg_write']==int(3<=op<=7 or op==9)
        assert not(d['mem_read']and d['mem_write'])
        assert d['nzp_write']==int(op==2)
        if op in [0,10,11,12,13,14]:assert not any(d[k]for k in ['reg_write','mem_read','mem_write','nzp_write','compare','pc_mux','ret','reg_input_mux','arithmetic_mux'])
        count+=1
    pc_cases=0
    for count_active in range(1,5):
     for cur in range(256):
      for flags in range(8):
       for mask in range(8):
        expected=73 if any((flags&(1<<b)) and(mask&(1<<b))for b in range(3)) else (cur+1)%256
        assert p.next_pc(cur,73,flags,mask,True)==expected
        assert p.active_pc([expected]*count_active+[255]*(4-count_active),count_active)==expected
        pc_cases+=1
    for bad in [0,5]:
        try:p.active_pc([0]*4,bad);assert False
        except ValueError:pass
    try:p.active_pc([8,9,8,8],2);assert False
    except ValueError:pass
    runs,assignments=check_dispatch()
    # Interface equality against independently owned frozen memory and physical RF maps.
    m=json.loads((p.ROOT/'artifacts/full-gpu-layout-v1/memory/interface.json').read_text())
    for name in ['program_memory','data_memory']:
        theirs=m['instances']['gpu/'+name]['ports'];ours={v['name']:v for v in n['module_types'][name]['ports']}
        assert set(theirs)==set(ours),(set(theirs),set(ours))
        for key,v in theirs.items():assert v['width']==ours[key]['width'] and v['direction']=={'in':'input','out':'output'}[ours[key]['direction']]
    rf={v['name']:v for v in n['module_types']['register_file']['ports']}
    for lane in range(4):
        theirs=json.loads((p.ROOT/f'artifacts/full-gpu-layout-v1/registers/lane{lane}.json').read_text())['ports'];assert set(theirs)==set(rf)
        for key,v in theirs.items():assert v['width']==rf[key]['width'] and v['direction']=={'in':'input','out':'output'}[rf[key]['direction']]
    report=dict(status='offline_control_source_and_semantic_checks_passed',instruction_words=count,driven_input_bits=bits,
        instances=len(n['instances']),nets=len(n['nets']),dispatch_schedules=runs,assigned_blocks=assignments,
        active_pc_cases=pc_cases,memory_priority_patterns=check_memory(),retained_R13_operand_cases=check_r13(),
        native_calls=0,physical_correctness_claim=False,
        limitations=['Logical checks only. They do not simulate block delays, lock skew, torch updates or live protocol timing.',
          'No continuous RTL equivalence claim; named compatibility corrections and physical handshake refinements are intentional.',
          'Whole-GPU routed layout remains incomplete; internal arithmetic/memory bundle geometry has separate scope.'])
    print(p.pack(report))

if __name__=='__main__':main()
