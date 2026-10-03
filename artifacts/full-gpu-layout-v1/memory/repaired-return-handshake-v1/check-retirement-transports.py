from pathlib import Path
import json,hashlib,importlib.util
H=Path(__file__).resolve().parent;M=H.parent;ROOT=H.parents[3];helper=M/'program-rom-timing-v1/check.py';sp=importlib.util.spec_from_file_location('dag',helper);g=importlib.util.module_from_spec(sp);sp.loader.exec_module(g)
p=H/'retirement-transports-slice.json';q=H/'tail_return-slice.json';d=json.load(open(p));t=json.load(open(q));world={g.P(v['position']):v['block'] for a in [d,t] for v in a['blocks']};allowed={tuple(v) for a in [d,t] for v in a['allowed_positions']};r={};w={};built=g.build(world);g.build=lambda _:built
src=[g.P(v['source']) for v in d['bindings']];dst=[g.P(v['destination']) for v in d['bindings']];collectors=[g.P(v) for v in t['metadata']['ports']['downstream_bank_busy']['positions'][1:]]
for name,s,targets in [('raw_backend_return_to_global_receiver',src,dst),('actual_bank_collector_to_qualified_return',collectors,dst)]:
 out,proof=g.analyze(world,s,targets,allowed,require_all=False)
 (H/(name+'-diagnostic.json')).write_text(json.dumps(out,indent=2)+'\n')
 assert out['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,out)
 assert len(out['paths'])==(9 if name=='raw_backend_return_to_global_receiver' else 6),(name,len(out['paths']))
 out.update(source_positions=s,target_positions=targets);r[name]=out;w[name]=proof;print(name,[(x['potential_dependency_nominal_min_ticks'],x['potential_dependency_nominal_max_ticks'])for x in out['paths']],flush=True)
out={'status':'actual_remaining_three_channel_qualified_return_transports','paths':r,'bindings':d['bindings'],'source_sha256':{str(x.relative_to(ROOT)):hashlib.file_digest(x.open('rb'),'sha256').hexdigest()for x in [helper,p,q,Path(__file__).resolve()]},'limitations':['Bank masks are actual comparator-side inputs and BUSY OR branches, not instantaneous Boolean names.','This conservative graph includes mode dependencies; stable retained ownership and initialized state are separate premises.'],'native_acceptance':False}
(H/'retirement-transport-paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'retirement-transport-witnesses.json').write_text(json.dumps(w)+'\n')
