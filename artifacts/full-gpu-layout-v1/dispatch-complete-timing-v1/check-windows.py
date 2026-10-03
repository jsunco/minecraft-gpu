"""Conditional nominal latch separation on all identified dispatcher stores."""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2]
d=json.loads((H/'checks.json').read_text());stores=d['source_roles'];assert len(stores)==125
clockfile=B/'core-phase-source/design.json';clock=json.loads(clockfile.read_text());c=clock['nominal_component_sums'];assert c['half_cycle_ticks']==1580 and c['cycle_ticks']==3160
# Actual root A/B outputs share the frozen oscillator. B has a separately
# counted extra4 ticks, already represented in the two gap figures.
gaps={('A','B'):c['a_to_b_gap_ticks'],('B','A'):c['b_to_a_gap_ticks']};widths={'A':c['phase_a_width_ticks'],'B':c['phase_b_width_ticks']}
locks={}
for i,s in enumerate(stores):
 rows=[r for r in d['paths']if r['source']>=125 and r['target']['kind']=='lock'and r['target']['store']==i]
 assert len(rows)==1,('Missing/ambiguous actual clock path',i,rows)
 r=rows[0];assert ['A','B'][r['source']-125]==s['phase'];locks[i]=r
 assert widths[s['phase']]-(r['nominal_max_ticks']-r['nominal_min_ticks'])>4,('No usable nominal lock window',i)
rows=[]
for r in d['paths']:
 a=r['source'];t=r['target']
 if a>=125 or t['kind']not in['data_rear','lock']:continue
 b=t['store'];sa,sb=stores[a],stores[b];assert sa['phase']!=sb['phase'],('Same-phase dependency requires separate proof',a,b)
 # Worst previous source lock closure plus four nominal ticks of late stored
 # response must finish before earliest following target lock opening.
 gap=gaps[(sa['phase'],sb['phase'])]+locks[b]['nominal_min_ticks']-locks[a]['nominal_max_ticks']
 margin=gap-4-r['nominal_max_ticks'];assert margin>0,('Nonpositive dependency setup',a,b,margin)
 rows.append({'source_store':a,'destination_store':b,'kind':t['kind'],'phases':sa['phase']+sb['phase'],'source_last_lock_close_to_target_first_open':gap,'dependency_nominal_max_ticks':r['nominal_max_ticks'],'late_storage_allowance':4,'nominal_setup_margin':margin})
assert len(rows)==1101
# Read source geometry again, independently match every oscillator cell and the
# complete two-cell replacement; there is no altered clock period in metadata.
repairedfile=B/'dispatch-clock-entry-repair-v1/design.json';repaired=json.loads(repairedfile.read_text());beforefile=B/'dispatch-input-sampling-v1/design.json';before=json.loads(beforefile.read_text());K=lambda p:tuple(p[a]for a in'xyz');world={K(r['position']):r['block']for r in repaired['blocks']};old={K(r['position']):r['block']for r in before['blocks']};assert len(world)==len(old)==297920 and world.keys()==old.keys()
changes=[]
for p,b in old.items():
 if b!=world[p]:changes.append(p)
assert set(changes)=={(-611,178,-245),(-596,178,-248)}
origin=(-500,180,-88)
for r in clock['blocks']:
 p=tuple(r['position'][a]+origin[i]for i,a in enumerate('xyz'));assert world[p]==r['block'],('Clock drift',p)
# A changed side-lock source is a different circuit and cannot inherit a role.
for s in stores:
 p=tuple(s['storage']);lock=tuple(s['lock_sources'][0]);assert world[p]['id']=='minecraft:repeater'and world[lock]['id']=='minecraft:repeater'
negative=0
oldreport=json.loads((H/'checks-before-clock-repair.json').read_text());oldlocks={r['target']['store']for r in oldreport['paths']if r['source']>=125 and r['target']['kind']=='lock'}
assert len(oldlocks)==113 and set(range(125))-oldlocks==set(range(102,114));negative+=1
worst=min(rows,key=lambda r:r['nominal_setup_margin'])
assert worst['nominal_setup_margin']==84
for change in [lambda r:r.update(dependency_nominal_max_ticks=r['dependency_nominal_max_ticks']+84),lambda r:r.update(source_last_lock_close_to_target_first_open=r['source_last_lock_close_to_target_first_open']-85),lambda r:r.update(late_storage_allowance=100)]:
 r=copy.deepcopy(worst);change(r);assert r['source_last_lock_close_to_target_first_open']-r['late_storage_allowance']-r['dependency_nominal_max_ticks']<=0;negative+=1
report={'status':'all_dispatcher_store_clock_and_dependency_nominal_windows_pass','physical_stores':125,'actual_clock_cells_matched':len(clock['blocks']),'changed_orientation_cells':changes,'preserved_parent_cells':297918,'checked_stored_dependencies':len(rows),'data_dependencies':sum(r['kind']=='data_rear'for r in rows),'enable_dependencies':sum(r['kind']=='lock'for r in rows),'minimum_nominal_setup_margin':min(r['nominal_setup_margin']for r in rows),'minimum_nominal_lock_high_window':min(widths[stores[i]['phase']]-(r['nominal_max_ticks']-r['nominal_min_ticks'])for i,r in locks.items()),'negative_refusals':negative,'rows':rows,'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[H/'checks.json',H/'checks-before-clock-repair.json',clockfile,repairedfile,beforefile,Path(__file__).resolve()]},'native_acceptance':False,'complete_timing_acceptance':False,'limits':['Nominal scheduled-device arithmetic assumes each clock edge propagates with the fixed costs; actual tick order, amplitude, pulse shaping and torch burnout are not established.','Four ticks after source lock closure is an explicit model allowance, not a measured physical bound.','External START/DONE/ACK are held scalar handshakes sampled onB. DCR is held constant during a run. Asynchronous cold input must satisfy later full cold-admission/hold proof.','Whole dispatcher launch/payload/reuse and complete master timing still need composition; these internal nominal windows alone are not complete machine acceptance.']}
(H/'window-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in['rows','source_sha256','limits']}))
