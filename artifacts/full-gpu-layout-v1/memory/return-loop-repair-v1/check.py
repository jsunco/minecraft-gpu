"""Actual directed cable, effective-input and mutation checks for 50 substitutions.

Uses the preserved physical dependency model; this is not an event simulator.
"""
from pathlib import Path
from collections import deque
import json, importlib.util, hashlib, copy
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

H=Path(__file__).resolve().parent; ROOT=H.parents[3]
helper=H.parent/'program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('physical',helper)
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
P,A,NEG,TR,W,R,C,T,WT,S,RB=g.P,g.A,g.NEG,g.TR,g.W,g.R,g.C,g.T,g.WT,g.S,g.RB
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()

def effective(w,p):
    """One-device inputs, including conductor sources and side-lock inputs.

    Dust horizontal weak output is conservatively overapproximated. Dust below
    a solid is not an upward source; dust cannot power another dust via a solid.
    """
    b=w.get(p,{});bid=b.get('id');out=set()
    def emitted(src,dst):
        q=w.get(src,{});qid=q.get('id')
        if qid in [R,C]:return A(src,TR[q['properties']['facing']])==dst
        if qid in [T,WT]:return dst!=A(src,(0,-1,0) if qid==T else TR[q['properties']['facing']])
        return qid in [W,RB,'minecraft:lever']
    def solid_sources(src,wire):
        for v in g.DIR:
            q=A(src,v);qb=w.get(q,{});qid=qb.get('id')
            if (qid in [R,C] and emitted(q,src)) or (qid in [T,WT] and v==(0,-1,0)) or (not wire and qid==W and v!=(0,-1,0)):
                out.add(q)
    def raw(src,wire=False):
        if w.get(src,{}).get('id')==S:solid_sources(src,wire)
        elif emitted(src,p):out.add(src)
    if bid==W:
        for v in g.DIR:
            q=A(p,v)
            if w.get(q,{}).get('id')!=W:raw(q,True)
        for v in g.HOR:
            q=A(p,v);qb=w.get(q,{}).get('id')
            if qb==W:out.add(q)
            if qb==S and w.get(A(p,(0,1,0)),{}).get('id')!=S and w.get(A(q,(0,1,0)),{}).get('id')==W:out.add(A(q,(0,1,0)))
            if qb!=S and w.get(A(q,(0,-1,0)),{}).get('id')==W:out.add(A(q,(0,-1,0)))
    elif bid in [R,C]:
        v=TR[b['properties']['facing']];raw(A(p,NEG(v)))
        for s in g.HOR:
            if sum(a*b for a,b in zip(v,s)):continue
            q=A(p,s);qid=w.get(q,{}).get('id')
            if qid in [R,C] and emitted(q,p):out.add(q)
            elif bid==C and qid in [W,RB]:out.add(q)
    elif bid in [T,WT]:solid_sources(A(p,(0,-1,0) if bid==T else TR[b['properties']['facing']]),False)
    return out

def cycles(w):
    nodes,index,cost,edges=g.build(w)
    u,v=zip(*edges)
    _,labels=connected_components(coo_matrix((np.ones(len(edges)),(u,v)),shape=(len(nodes),len(nodes))).tocsr(),directed=True,connection='strong')
    sizes=np.bincount(labels)
    return sorted(nodes[i][0] for i,c in enumerate(cost) if c and sizes[labels[i]]>1)

def validate_delta(delta,slices):
    before={P(v['position']):v['block'] for v in slices['entry_blocks']}
    after=dict(before); seen=set()
    assert not delta['added_blocks'] and not delta['removed_blocks']
    for v in delta['substitutions']:
        p=P(v['position']);assert p not in seen;seen.add(p)
        assert before[p]==v['before'];after[p]=v['after']
        assert before[A(p,(0,-1,0))]['id']==S
    assert len(seen)==50
    wanted=set()
    for e in slices['entries']:
        p,o=P(e['driver']),P(e['output'])
        if e['feedback_found']:
            wanted.update([p,o])
            assert after[p]=={'id':W}
            assert after[o]=={'id':R,'properties':{'facing':'west','delay':'1'}}
            # Actual rear/front and both side cells of the moved diode.
            assert after[A(o,(-1,0,0))]['id']==W
            assert after[A(o,(1,0,0))]['id']==W
            for v in [(0,0,1),(0,0,-1)]:
                assert after.get(A(o,v),{}).get('id') not in [R,C]
        else:
            assert after[p]==before[p] and after[o]==before[o]
    assert seen==wanted
    return before,after

def main():
    delta=json.load((H/'delta.json').open());slices=json.load((H/'parent-slices.json').open())
    old,new=validate_delta(delta,slices)
    original_cycles=cycles(old)
    assert original_cycles==sorted(P(e['driver']) for e in slices['entries'] if e['feedback_found'])
    assert cycles(new)==[]
    # Exhaustive local dependency differential: all new/lost inputs must be in
    # the seven named cells of one repaired corner. No same-net exemptions.
    allowed=set();changes=[]
    for e in slices['entries']:
        if not e['feedback_found']:continue
        x,y,z=P(e['output'])
        cells={(x,y,z-1),(x,y,z),(x-1,y,z),(x-1,y,z-1),(x,y,z-2),(x,y,z+1),(x+1,y,z)}
        allowed.update((a,b) for a in cells for b in cells)
    foreign=json.load((H/'foreign-check.json').open())
    for v in foreign['foreign_blocks']:
        p=P(v['position']);assert p not in old;old[p]=v['block'];new[p]=v['block']
    for p,b in old.items():
        if b['id']==S:continue
        bi,ai=effective(old,p),effective(new,p)
        for kind,edges in [('added',ai-bi),('removed',bi-ai)]:
            for q in edges:
                assert (q,p) in allowed,('Unintended effective-input change',kind,q,p)
                changes.append({'kind':kind,'source':q,'target':p})
    # Explicit old→new graph regression: restoring either original corner pair
    # reinstates its original positive-cost cycle. Direction mistakes reject.
    negatives=0
    for e in slices['entries']:
        if not e['feedback_found']:continue
        p,o=P(e['driver']),P(e['output']);bad=dict(new);bad[p]=old[p];bad[o]=old[o]
        assert p in cycles(bad);negatives+=1
    for patch in [0,1,2,3]:
        bad=copy.deepcopy(delta)
        if patch==0:bad['substitutions'][1]['after']['properties']['facing']='east'
        if patch==1:bad['substitutions'][0]['after']={'id':R,'properties':{'facing':'north','delay':'1'}}
        if patch==2:bad['substitutions'].pop()
        if patch==3:bad['substitutions'][0]['before']={'id':W}
        try:validate_delta(bad,slices)
        except AssertionError:negatives+=1
        else:raise AssertionError('Corrupted delta accepted')
    # Check every full HIGH approach after truncating its now-dead last stub.
    cable={P(v['position']):v['block'] for v in slices['cable_blocks']}
    for v in delta['substitutions']:cable[P(v['position'])]=v['after']
    strength=[]
    for e in slices['entries']:
        route=next(r for r in slices['routes'] if r['name']==e['name']+'_high')
        path=list(map(P,route['path']));o=P(e['output']);p=P(e['driver'])
        if e['feedback_found']:
            rear=A(o,(-1,0,0));assert rear in path
            path=path[:path.index(rear)+1]+[o,A(o,(1,0,0)),A(o,(2,0,0)),A(o,(3,0,0))]
        else:path+= [p,o,A(o,(1,0,0)),A(o,(2,0,0)),A(o,(3,0,0))]
        run=0;maximum=0;diodes=0
        for i,q in enumerate(path):
            b=cable[q]
            if b['id']==W:run+=1;maximum=max(maximum,run)
            elif b['id']==R:
                if i:assert A(q,NEG(TR[b['properties']['facing']]))==path[i-1]
                if i+1<len(path):assert A(q,TR[b['properties']['facing']])==path[i+1]
                diodes+=1;run=0
            else:raise AssertionError(('Unexpected path block',q,b))
            if i:
                prev=path[i-1];assert abs(prev[0]-q[0])+abs(prev[2]-q[2])==1 and abs(prev[1]-q[1])<=1
                if prev[1]!=q[1]:
                    lower=prev if prev[1]<q[1] else q
                    assert cable.get(A(lower,(0,1,0)),{}).get('id')!=S
        assert maximum<=13,(e['name'],maximum)
        strength.append({'entry':e['name'],'maximum_high_path_dust_run':maximum,'minimum_rear_power_lower_bound':16-maximum,'path_points':len(path),'repeaters_including_first_descent_refresh':diodes})
    sources=[P(b['source']) for b in slices['bindings']];targets=[P(b['destination']) for b in slices['bindings']]
    # Complete 27 cable groups and their exact held-source/receiver terminals.
    report,witnesses=g.analyze(cable,sources,targets,require_all=False)
    assert report['status']=='conservative_potential_dependency_DAG_nominal_bound',report
    assert len(report['paths'])==27 and all(p['address_bit']==p['data_bit'] for p in report['paths'])
    result={'status':'offline_return_loop_repair_checks_passed','substitutions':50,'block_delta':0,'storage_delta':0,'original_entry_positive_device_cycles':len(original_cycles),'repaired_entry_positive_device_cycles':0,'full_cable_positive_device_cycles':0,'complete_source_to_receiver_paths':27,'unchanged_channel3_entries':['response3_0','response3_4'],'unchanged_channel3_scope':'Complete included high/rise/descent/low cable DAGs and local effective-input screen; not complete memory or native clearance.','entry_effective_input_changes':changes,'high_path_strength':strength,'negative_checks':negatives,'foreign_cells_checked':sum(r['cells_checked'] for r in foreign['instances']),'foreign_halo_cells':len(foreign['foreign_blocks']),'channel0_changed_halo_conflicts':foreign['channel0_changed_halo_conflicts'],'cable_analysis':report,'source_sha256':{str(p.relative_to(ROOT)):sha(p) for p in [Path(__file__).resolve(),helper,H/'delta.json',H/'parent-slices.json',H/'foreign-check.json']},'limits':['Physical dependency graph is conservative about horizontal dust weak output.','Fixed nominal scheduled-device costs are not physical event/pulse-width bounds.','This repair covers the 25 identified loops outside channel0, not an exhaustive census of all memory feedback.','Channel0 requires its separately frozen replacement; neither historical output delay nor this repair alone is whole-memory admission.'],'native_acceptance':False,'complete_gpu_layout':False}
    (H/'checks.json').write_text(json.dumps(result,indent=2)+'\n')
    (H/'cable-witnesses.json').write_text(json.dumps({'bindings':slices['bindings'],'witnesses':witnesses})+'\n')
    print(json.dumps({k:result[k] for k in ['status','substitutions','complete_source_to_receiver_paths','negative_checks','foreign_cells_checked','foreign_halo_cells']}))

if __name__=='__main__':main()
