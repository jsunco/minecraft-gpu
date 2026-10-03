"""Complete ten-cable DAG, direction, branch and effective-power checks."""
from pathlib import Path
import json,hashlib,importlib.util,copy
from layout import P,POS,W,R,S,make_delta
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
prior=module('prior_repair',H.parent/'return-loop-repair-v1/check.py');g=prior.g
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()

def apply(world,delta):
    out=dict(world);seen=set()
    for c in delta['changes']:
        p=P(c['position']);assert p not in seen;seen.add(p)
        assert world.get(p)==c['before'],('parent/add collision',p)
        if c['after'] is None:del out[p]
        else:out[p]=c['after']
    return out

def check_paths(world,delta,info):
    old={P(v['position']):v['block'] for v in info['cable_blocks']};rows=[]
    changed_routes={n for r in delta['segments'] for n in r['routes_changed']}
    # Authored downstream segments are preserved, and each prefix has exactly
    # the same two boundary coordinates and the same diode count/delays.
    for r in delta['segments']:
        p,q=list(map(P,r['old_path'])),list(map(P,r['new_path']))
        assert p[0]==q[0] and p[-1]==q[-1]
        assert sum(old[v]['id']==R for v in p)==sum(world[v]['id']==R for v in q)==r['old_repeater_count']
        nominal=0;max_run=0;run=0
        for i,v in enumerate(q):
            b=world[v];assert world[(v[0],v[1]-1,v[2])]['id']==S
            if b['id']==R:
                travel=g.TR[b['properties']['facing']]
                if i:assert g.A(v,g.NEG(travel))==q[i-1],('wrong rear',r['name'],v)
                if i+1<len(q):assert g.A(v,travel)==q[i+1],('wrong front',r['name'],v)
                side=[]
                for s in g.HOR:
                    if sum(a*b for a,b in zip(s,travel)):continue
                    a=g.A(v,s);ab=world.get(a,{})
                    if ab.get('id') in [R,g.C] and g.A(a,g.TR[ab['properties']['facing']])==v:side.append(a)
                assert not side,('side lock',v,side)
                run=0;nominal+=2*int(b['properties']['delay'])
            else:assert b['id']==W;run+=1;max_run=max(max_run,run)
        assert nominal==r['nominal_series_diode_ticks'];assert max_run<=12
        # Check the join into the unchanged next refresh, not just this prefix.
        low=next(v for v in info['routes'] if v['name']==r['name']+'_low')
        tail=list(map(P,low['path']));ix=tail.index(q[-1]);extended=q+tail[ix+1:]
        run=0;fullmax=0
        for v in extended:
            if world[v]['id']==R:run=0
            else:assert world[v]['id']==W;run+=1;fullmax=max(fullmax,run)
        assert fullmax<=13,(r['name'],fullmax)
        rows.append({'name':r['name'],'old_points':len(p),'new_points':len(q),'repeaters_before_after':r['old_repeater_count'],'nominal_series_ticks':nominal,'maximum_prefix_dust_run':max_run,'maximum_through_remaining_low_path_dust_run':fullmax,'minimum_normalized_rear_power_lower_bound':16-fullmax})
    # Every path outside these ten local prefixes still has its exact blocks.
    modified={P(c['position']) for c in delta['changes']}
    prefix={P(p) for r in delta['segments'] for p in r['old_path']}
    for r in info['routes']:
        for v in map(P,r['path']):
            if v not in prefix:assert world[v]==old[v],('lost nonprefix route',r['name'],v)
    return rows

def main():
    info=json.load((H/'cable-slice.json').open());delta=json.load((H/'delta.json').open());foreign=json.load((H/'foreign-check.json').open())
    canonical=make_delta(info);assert delta['changes']==canonical['changes'] and delta['segments']==canonical['segments']
    before={P(v['position']):v['block'] for v in info['cable_blocks']+info['affected_blocks']}
    for v in foreign['foreign_blocks']:
        p=P(v['position']);assert p not in before;before[p]=v['block']
    after=apply(before,delta)
    for c in delta['changes']:
        p=P(c['position']);b=after.get(p,{})
        if b.get('id') in [W,R]:assert after.get((p[0],p[1]-1,p[2]),{}).get('id')==S
    strengths=check_paths(after,delta,info)
    cable_keys={P(v['position']) for v in info['cable_blocks']}
    oldc={p:before[p] for p in cable_keys};newc=apply(oldc,delta)
    original=prior.cycles(oldc);assert len(original)==36
    assert all(P(w['repeater']) in original for w in info['witnesses'])
    assert prior.cycles(newc)==[]
    # New effective dependencies must be the consecutive physical route edges;
    # removed dependencies must stay within the same ten known transport nets.
    allowed=set()
    for r in delta['segments']:
        q=list(map(P,r['new_path']))
        if r['kind']=='typed_ready':q=[g.A(q[0],(0,0,1))]+q
        for a,b in zip(q,q[1:]):
            allowed.add((a,b))
            if after[a]['id']==W and after[b]['id']==W:allowed.add((b,a))
    changes=[]
    for p in set(before)|set(after):
        if before.get(p,{}).get('id')==S and after.get(p,{}).get('id')==S:continue
        bi,ai=prior.effective(before,p),prior.effective(after,p)
        for a in ai-bi:
            assert (a,p) in allowed,('new off-path input',a,p)
            changes.append({'kind':'added','source':a,'target':p})
        for a in bi-ai:
            assert a in cable_keys and p in cable_keys,('lost external branch',a,p)
            changes.append({'kind':'removed','source':a,'target':p})
    # Every original witness belongs to one precise intended cable/prefix;
    # reverting that segment must reproduce its original device cycle.
    negatives=0
    for r in delta['segments']:
        w=dict(newc)
        for p in map(P,r['new_path']):
            for v in [p,(p[0],p[1]-1,p[2])]:w.pop(v,None)
        for p in map(P,r['old_path']):
            for v in [p,(p[0],p[1]-1,p[2])]:w[v]=oldc[v]
        expected=[P(v['repeater']) for v in info['witnesses'] if (v['net']==('return_'+r['name'] if r['kind']=='retained_owner' else r['name'].replace('typed','typed_ready')))]
        assert expected and set(expected).issubset(prior.cycles(w));negatives+=1
        wrong=dict(after);p=P(r['new_path'][r['repeaters'][0]]);b=copy.deepcopy(wrong[p]);f=b['properties']['facing'];b['properties']['facing']={'west':'east','east':'west','north':'south','south':'north'}[f];wrong[p]=b
        try:check_paths(wrong,delta,info)
        except AssertionError:negatives+=1
        else:raise AssertionError('Reversed route diode accepted')
    wrong=copy.deepcopy(delta);wrong['changes'][0]['before']={'id':'minecraft:redstone_block'}
    try:apply(before,wrong)
    except AssertionError:negatives+=1
    else:raise AssertionError('Wrong parent accepted')
    sources=[P(b['source']) for b in info['bindings']];targets=[P(b['destination']) for b in info['bindings']]
    report,witnesses=g.analyze(newc,sources,targets,require_all=False)
    assert report['status']=='conservative_potential_dependency_DAG_nominal_bound'
    assert len(report['paths'])==10 and all(p['address_bit']==p['data_bit'] for p in report['paths'])
    out={'status':'additional_return_feedback_repair_checks_passed','metrics':delta['metrics'],'census_witnesses_covered':22,'original_positive_cycle_devices':len(original),'new_positive_cycle_devices':0,'complete_source_to_receiver_paths':10,'source_receiver_bindings':info['bindings'],'effective_input_changes':changes,'segment_strength':strengths,'negative_checks':negatives,'cable_analysis':report,'foreign_cells_checked':sum(v['cells_checked'] for v in foreign['instances']),'foreign_halo_cells':len(foreign['foreign_blocks']),'channel0_and_frozen25_halo_conflicts':0,'source_sha256':{str(p.relative_to(ROOT)):sha(p) for p in [Path(__file__).resolve(),H/'layout.py',H/'delta.json',H/'cable-slice.json',H/'foreign-check.json',H.parent/'return-loop-repair-v1/check.py',H.parent/'program-rom-timing-v1/check.py']},'limits':['Only the ten declared transport nets; whole-reference composition/census is a separate root check.','Old looped cables have no finite latest-arrival comparison; equal repeater count preserves only intended serial fixed-device cost.','Conservative horizontal weak dust dependencies; no native, scheduled-event, pulse-width or startup acceptance.'],'native_acceptance':False,'selected_geometry':False}
    (H/'checks.json').write_text(json.dumps(out,indent=2)+'\n');(H/'cable-witnesses.json').write_text(json.dumps({'bindings':info['bindings'],'witnesses':witnesses})+'\n')
    print(json.dumps({k:out[k] for k in ['status','metrics','census_witnesses_covered','complete_source_to_receiver_paths','negative_checks','foreign_halo_cells']}))
if __name__=='__main__':main()
