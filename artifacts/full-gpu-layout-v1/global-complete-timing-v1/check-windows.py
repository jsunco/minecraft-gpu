from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2]
r=json.loads((H/'checks.json').read_text());stores=r['source_roles'];assert len(stores)==28
clockfile=B/'core-phase-source/design.json';clock=json.loads(clockfile.read_text());c=clock['nominal_component_sums'];gaps={('A','B'):c['a_to_b_gap_ticks'],('B','A'):c['b_to_a_gap_ticks']};width={'A':c['phase_a_width_ticks'],'B':c['phase_b_width_ticks']};locks={}
for i,s in enumerate(stores):
 rows=[x for x in r['paths']if x['source']>=28 and x['target']['kind']=='lock'and x['target']['store']==i];assert len(rows)==1,('Missing/ambiguous clock',i)
 x=rows[0];assert x['source']==28+int(s['phase']=='B');assert width[s['phase']]-(x['nominal_max_ticks']-x['nominal_min_ticks'])>4;locks[i]=x
rows=[]
for x in r['paths']:
 a=x['source'];t=x['target']
 if a>=28 or t['kind']not in ['data_rear','lock']:continue
 b=t['store'];sa,sb=stores[a],stores[b];assert sa['phase']!=sb['phase'],('Unproved same-phase dependency',a,b)
 gap=gaps[(sa['phase'],sb['phase'])]+locks[b]['nominal_min_ticks']-locks[a]['nominal_max_ticks'];margin=gap-4-x['nominal_max_ticks'];assert margin>0,(a,b,margin)
 rows.append({'source':a,'target':b,'kind':t['kind'],'source_phase':sa['phase'],'target_phase':sb['phase'],'dependency_nominal_ticks':x['nominal_max_ticks'],'source_last_close_to_target_first_open':gap,'late_store_allowance':4,'nominal_setup_margin':margin})
p=B/'global-command-assembly-v3/design.json';d=json.loads(p.read_text());K=lambda p:tuple(p[a]for a in 'xyz');world={K(x['position']):x['block']for x in d['blocks']}
for x in clock['blocks']:
 q=tuple(x['position'][a]+[250,64,-200][i]for i,a in enumerate('xyz'));assert world[q]==x['block'],('Oscillator altered',q)
worst=min(rows,key=lambda x:x['nominal_setup_margin']);negative=0
for x in [dict(worst,dependency_nominal_ticks=worst['dependency_nominal_ticks']+worst['nominal_setup_margin']),dict(worst,source_last_close_to_target_first_open=worst['source_last_close_to_target_first_open']-worst['nominal_setup_margin']-1)]:assert x['source_last_close_to_target_first_open']-x['late_store_allowance']-x['dependency_nominal_ticks']<=0;negative+=1
report={'status':'actual_global_28_store_clock_and_nominal_setup_windows_pass','physical_cells':len(world),'actual_clock_cells':len(clock['blocks']),'stores':len(stores),'actual_phase_to_lock_paths':len(locks),'stored_dependencies':len(rows),'minimum_nominal_setup_margin':min(x['nominal_setup_margin']for x in rows),'minimum_nominal_high_window':min(width[stores[i]['phase']]-(x['nominal_max_ticks']-x['nominal_min_ticks'])for i,x in locks.items()),'negative_margin_refusals':negative,'rows':rows,'source_sha256':{str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest()for f in [H/'checks.json',clockfile,p,Path(__file__).resolve()]},'complete_timing_acceptance':False,'native_acceptance':False,'limits':['Actual block potential-dependency graph, conditional fixed scheduled-device arithmetic; no Minecraft tick-order, pulse or burnout measurement.','All actual28 store locks are reached from the correct physical A/B root. Exactly one actual manual STOP lever is required OFF; its support remains in the graph.','Four-tick late-store allowance is an explicit model premise. Cold convergence and asynchronous external handshake capture/epoch safety remain separate from these local windows.']}
(H/'window-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in ['rows','source_sha256','limits']}))
