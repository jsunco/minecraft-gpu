"""Exact copied-state-bank NEXT→CURRENT links; no functional epoch inference."""
from pathlib import Path
import hashlib,json
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2]
source=B/'control-reset-master-compatible-v3/design.json';d=json.loads(source.read_text());world={tuple(v['position'][a]for a in'xyz'):v['block']for v in d.pop('blocks')}
stores=json.loads((H/'storage-discovery.json').read_text())['stores'];by_pos={tuple(s['storage']):i for i,s in enumerate(stores)};phase=json.loads((H/'phase-checks.json').read_text());timings={}
for r in phase['phase_paths']:timings[(r['store_index'],r['phase'])]=r
W='minecraft:redstone_wire';R='minecraft:repeater';rows=[]
for p,n in by_pos.items():
 q=(p[0]+12,p[1],p[2])
 if q not in by_pos:continue
 path=[(p[0]+x,p[1],p[2])for x in range(13)];reps={0,2,9,11,12}
 if not all(world.get(v,{}).get('id')==(R if x in reps else W)for x,v in enumerate(path)):continue
 if not all(world[path[x]].get('properties')=={'facing':'west','delay':'1'}for x in reps):continue
 nn=by_pos[q];a=timings.get((n,'A'));b=timings.get((nn,'B'))
 row={'next_storage':p,'current_storage':q,'next_index':n,'current_index':nn,'actual_link':path,'nominal_storeQ_to_current_D':6,'next_phase_influences':[ph for ph in ['A','B']if(n,ph)in timings],'current_phase_influences':[ph for ph in ['A','B']if(nn,ph)in timings]}
 if a and b:
  row.update(nominal_A_close=544+a['nominal_max_ticks'],nominal_B_open=1584+b['nominal_min_ticks'],nominal_data_setup_margin=1584+b['nominal_min_ticks']-(544+a['nominal_max_ticks']+2+6),nominal_nonoverlap_margin=1584+b['nominal_min_ticks']-(544+a['nominal_max_ticks']))
 else:row['requires_separate_phase_epoch_binding']=True
 rows.append(row)
assert rows
report={'status':'exact_direct_NEXT_CURRENT_link_inventory','pairs':len(rows),'A_to_B_pairs':sum('nominal_data_setup_margin'in r for r in rows),'minimum_nominal_data_setup':min(r['nominal_data_setup_margin']for r in rows if'nominal_data_setup_margin'in r),'nonpositive_pair_margins':[r for r in rows if r.get('nominal_data_setup_margin',1)<=0],'rows':rows,'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[source,H/'phase-checks.json',H/'storage-discovery.json',Path(__file__).resolve(),ROOT/'hardware/full-gpu-state-bank.mjs']},'limits':['Exact13-cell motif only; other ALU/RF storage forms are not covered by this subset.','Positive nominal arithmetic is conditional on the actual phase pulse and stable qualifiers; inhibit and cold/reset transitions need separate closure analysis.','This checks direct held NEXT→CURRENT data, not CURRENT→logic→NEXT or same-phase microepochs.'],'native_acceptance':False,'full_timing_acceptance':False}
(H/'direct-pair-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in['rows','source_sha256','limits','nonpositive_pair_margins']})+f" bad={len(report['nonpositive_pair_margins'])}")
