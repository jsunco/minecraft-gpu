"""Phase-control DAG with actual state boundaries held separately."""
from pathlib import Path
import importlib.util,json
H=Path(__file__).resolve().parent;p=H/'check.py';spec=importlib.util.spec_from_file_location('dag',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
f=H.parent/'program-controller-v1/design.json';c=H.parent/'program-capture-v1/design.json';d=json.loads(f.read_text());capture=json.loads(c.read_text());world={m.P(v['position']):v['block'] for v in d['blocks']}
nets={'active_delayed_flush','open_owner','hold_owner','open_address','hold_address','open_response','hold_response','ready','consumer_ready0','consumer_ready1'}
allowed={tuple(map(int,k.split(','))) for k,v in d['nets'].items() if v in nets}
sources=[m.P(v['position']) for v in d['stages']];source_names=[v['name'] for v in d['stages']]
stores=capture['stores'];targets=[m.P(s['lock']) for s in stores]+list(map(m.P,d['ports']['read_ready']['positions']));target_names=[s['name']+'_lock_'+str(s['bit']) for s in stores]+['owned_ready0','owned_ready1']
out,witnesses=m.analyze(world,sources,targets,allowed,require_all=False)
for r in out.get('paths',[]):r['source_name']=source_names[r.pop('address_bit')];r['destination_name']=target_names[r.pop('data_bit')]
out.update(source_sha256={str(q.relative_to(m.ROOT)):m.sha(q) for q in [p,f,c,Path(__file__).resolve()]},allowed_nets=sorted(nets),assumptions=['ACTIVE, reset-busy and retained owner are held stable while these phase-control paths propagate.','Owner and data stores are state boundaries, not inferred combinational feedback. Their capture correctness is checked by separate inequalities.','Costs are nominal; the potential dependency graph conservatively includes horizontal wire-to-solid weak sources. It is not an event or amplitude simulator.'],numeric_physical_bounds_established=False,native_acceptance=False,world_mutations=0)
(H/'controller-checks.json').write_text(json.dumps(out,indent=2)+'\n')
if witnesses is not None:
 for r in witnesses:r['source_name']=source_names[r.pop('address_bit')];r['destination_name']=target_names[r.pop('data_bit')]
 (H/'controller-witnesses.json').write_text(json.dumps(witnesses)+'\n')
print(json.dumps({k:v for k,v in out.items() if k not in ['paths','source_sha256','assumptions','allowed_nets']}))
for source,prefix in [('t1','owner_lock'),('t2','address_lock'),('t3','address_lock'),('t4','response_lock'),('t5','response_lock'),('t5','owned_ready')]:
 rows=[r for r in out.get('paths',[]) if r['source_name']==source and r['destination_name'].startswith(prefix)]
 print(source,prefix,[(r['potential_dependency_nominal_min_ticks'],r['potential_dependency_nominal_max_ticks']) for r in rows])
