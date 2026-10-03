"""All 80 repaired return cables: source identity, real DAG and local power delta."""
from pathlib import Path
import json,hashlib,importlib.util,copy
from layout import P,POS,W,R,S,make_delta
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
def module(n,p):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
prior=module('prior_repair',H.parent/'return-loop-repair-v1/check.py');g=prior.g
v1=module('extension_v1',H.parent/'return-feedback-extension-v1/check.py')
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def check_paths_local(world,delta,info):
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
        assert fullmax<=14,(r['name'],fullmax)
        rows.append({'name':r['name'],'old_points':len(p),'new_points':len(q),'repeaters_before_after':r['old_repeater_count'],'nominal_series_ticks':nominal,'maximum_prefix_dust_run':max_run,'maximum_through_remaining_low_path_dust_run':fullmax,'minimum_normalized_rear_power_lower_bound':16-fullmax})
    # Every path outside these ten local prefixes still has its exact blocks.
    modified={P(c['position']) for c in delta['changes']}
    prefix={P(p) for r in delta['segments'] for p in r['old_path']}
    for r in info['routes']:
        for v in map(P,r['path']):
            if v not in prefix:assert world[v]==old[v],('lost nonprefix route',r['name'],v)
    return rows


def main():
 info=json.load(open(H/'cable-slice.json'));delta=json.load(open(H/'delta.json'));foreign=json.load(open(H/'foreign-check.json'));full=json.load(open(H/'all-transports.json'))
 assert delta['changes']==make_delta(info)['changes'] and delta['metrics']['cell_delta']==8
 before={P(v['position']):v['block'] for v in info['cable_blocks']+info['affected_blocks']}
 for v in foreign['foreign_blocks']:assert P(v['position']) not in before;before[P(v['position'])]=v['block']
 after=v1.apply(before,delta);strength=check_paths_local(after,delta,info)
 allowed=set();q=list(map(P,delta['segments'][0]['new_path']))
 for a,b in zip(q,q[1:]):
  allowed.add((a,b))
  if after[a]['id']==W and after[b]['id']==W:allowed.add((b,a))
 diffs=[];cable_keys={P(v['position']) for v in info['cable_blocks']}
 for p in set(before)|set(after):
  if before.get(p,{}).get('id')==S and after.get(p,{}).get('id')==S:continue
  bi,ai=prior.effective(before,p),prior.effective(after,p)
  for a in ai-bi:
   assert (a,p) in allowed,('new external dependency',a,p);diffs.append({'kind':'added','source':a,'target':p})
  for a in bi-ai:
   assert a in cable_keys and p in cable_keys,('lost external source',a,p);diffs.append({'kind':'removed','source':a,'target':p})
 original={P(v['position']):v['block'] for v in full['blocks']};repaired=v1.apply(original,delta)
 cycles=prior.cycles(original);assert len(cycles)==8,cycles;assert prior.cycles(repaired)==[]
 # Stronger witness than the short dust-only census: a real seven-diode ring.
 witness=json.load(open(H/'original-cycle.json'));path=[tuple(v['position']) for v in witness['path']]
 assert path[0]==path[-1];power=15;minrear=15;diodes=0;wire_run=0;max_run=0
 for i,p in enumerate(path):
  b=original[p];assert b==witness['path'][i]['block'];assert original[(p[0],p[1]-1,p[2])]['id']==S
  if b['id']==R:
   v=g.TR[b['properties']['facing']]
   if i:assert g.A(p,g.NEG(v))==path[i-1];assert power>0;minrear=min(minrear,power);diodes+=1
   if i+1<len(path):assert g.A(p,v)==path[i+1]
   for dv in g.HOR:
    if sum(x*y for x,y in zip(v,dv)):continue
    side=g.A(p,dv);sb=before.get(side,{})
    assert not(sb.get('id') in [R,g.C] and g.A(side,g.TR[sb['properties']['facing']])==p),('side-locked ring',p,side)
   power=15;wire_run=0
  else:
   assert b['id']==W
   if i and original[path[i-1]]['id']==W:power-=1
   wire_run+=1;max_run=max(max_run,wire_run);assert power>0
   if i:assert sum(abs(x-y) for x,y in zip(p,path[i-1]))==1
 assert diodes==7 and minrear>=2
 # The complete transport world contains every retained-owner/Q/ready/type path.
 bindings=full['bindings'];assert len(bindings)==80
 sources=[P(b['source']) for b in bindings];targets=[P(b['destination']) for b in bindings]
 report,proof=g.analyze(repaired,sources,targets,require_all=False)
 assert report['status']=='conservative_potential_dependency_DAG_nominal_bound',report
 assert len(report['paths'])==80 and all(v['address_bit']==v['data_bit'] for v in report['paths']),report['paths']
 # Full consumer matrix is screened separately too; the one old ring is not hidden by a source cut.
 combined=json.load(open(H.parent/'repaired-return-handshake-v1/consumer-slice.json'));cw={P(v['position']):v['block'] for v in combined['blocks']};allowed_positions=set(map(tuple,combined['allowed_positions']))
 oldcycles=prior.cycles({p:cw[p] for p in allowed_positions});assert len(oldcycles)==8
 cw=v1.apply(cw,delta)
 for c in delta['changes']:
  p=P(c['position'])
  if c['after'] is None:allowed_positions.discard(p)
  else:allowed_positions.add(p)
 assert prior.cycles({p:cw[p] for p in allowed_positions})==[]
 # Negative controls retain exact original refusal, reverse each new directional device,
 # and reject an incorrect parent state. No restore of only one unsupported old cell.
 negatives=1;assert prior.cycles(original)==cycles
 for ix in delta['segments'][0]['repeaters']:
  wrong=dict(repaired);p=q[ix];b=copy.deepcopy(wrong[p]);b['properties']['facing']={'west':'east','east':'west','north':'south','south':'north'}[b['properties']['facing']];wrong[p]=b
  try:check_paths_local(wrong,delta,info)
  except AssertionError:negatives+=1
  else:raise AssertionError('Reversed diode passed')
 wrong=copy.deepcopy(delta);wrong['changes'][0]['before']={'id':'minecraft:redstone_block'}
 try:v1.apply(before,wrong)
 except AssertionError:negatives+=1
 else:raise AssertionError('Wrong source state passed')
 (H/'cable-witnesses.json').write_text(json.dumps({'bindings':bindings,'witnesses':proof})+'\n')
 out={'status':'longer_return_loop_repair_static_checks_passed','metrics':delta['metrics'],'changes':len(delta['changes']),'original_cycle_devices':8,'new_cycle_devices':0,'all_return_bindings':bindings,'complete_matching_only_paths':80,'cable_analysis':report,'consumer_logic_section_before_cycle_devices':8,'consumer_logic_section_after_cycle_devices':0,'physical_ring':{'cycle_positions':path,'diodes':diodes,'maximum_dust_run':max_run,'minimum_normalized_rear_power':minrear,'nominal_scheduled_round_trip':14,'all_side_inputs_unlocked':True},'strength':strength,'effective_input_changes':diffs,'negative_checks':negatives,'foreign_cells_checked':sum(v['cells_checked'] for v in foreign['instances']),'foreign_halo_cells':len(foreign['foreign_blocks']),'prior_patch_radius3_conflicts':0,'source_sha256':{str(p.relative_to(ROOT)):sha(p) for p in [Path(__file__).resolve(),H/'layout.py',H/'prepare.py',H/'delta.json',H/'cable-slice.json',H/'all-transports.json',H/'foreign-check.json',H/'original-cycle.json',H.parent/'repaired-return-handshake-v1/consumer-slice.json',H.parent/'return-feedback-extension-v1/check.py',H.parent/'return-feedback-extension-v1/layout.py',H.parent/'return-loop-repair-v1/check.py',H.parent/'program-rom-timing-v1/check.py']},'limits':['All80 complete feed-forward consumer-return transports and their physical return-matrix section, not whole-memory event correctness.','Old longer-ring latest delay is undefined; equal four prefix repeaters preserve only intended serial nominal cost.','Fixed device costs and potential dependency edges are not native delay bounds, asynchronous glitch proof or full handshake acceptance.'],'native_acceptance':False,'selected':False}
 (H/'checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:out[k] for k in ['status','metrics','changes','original_cycle_devices','complete_matching_only_paths','negative_checks']}),flush=True)
if __name__=='__main__':main()
