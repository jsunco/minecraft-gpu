"""All4 channel retained DATA/READY to all8 consumers after four-patch recipe."""
from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;M=H.parent;ROOT=H.parents[3];helper=M/'program-rom-timing-v1/check.py';spec=importlib.util.spec_from_file_location('dag',helper);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
f=H/'consumer-slice.json';p=M/'return-feedback-extension-v2/delta.json';d=json.load(open(f));world={g.P(v['position']):v['block'] for v in d['blocks']};allowed=set(map(tuple,d['allowed_positions']))
for c in json.load(open(p))['changes']:
 k=g.P(c['position']);assert world.get(k)==c['before']
 if c['after'] is None:del world[k];allowed.discard(k)
 else:world[k]=c['after'];allowed.add(k)
bind=[v for v in d['metadata']['return_bindings'] if v['kind'] in ['retained_response','backend_ready']];src=[g.P(v['source']) for v in bind];dst=[g.P(v) for name in ['read_ready','write_ready','read_data'] for v in d['metadata']['ports'][name]['positions']]
r,w=g.analyze(world,src,dst,allowed,require_all=False);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',r;assert len(r['paths'])==320
for row in r['paths']:
 b=bind[row['address_bit']];target=row['data_bit'];assert (target<16 if b['kind']=='backend_ready' else target>=16 and (target-16)%8==b['bit'])
r.update(source_bindings=bind,target_positions=dst,status='conditional_all4_channels_retained_DATA_READY_output_paths',source_sha256={str(x.relative_to(ROOT)):hashlib.file_digest(x.open('rb'),'sha256').hexdigest() for x in [helper,f,p,Path(__file__).resolve()]},limits=['Potential dependencies are mode-qualified by stable retained owner/type. They are not simultaneous electrical toggles or a proof of arbitration.','All finite paths use actual repaired cells; no bound over the removed positive cycles is inherited.','No numerical physical delay bound or native execution acceptance.'])
(H/'return-output-paths.json').write_text(json.dumps(r,indent=2)+'\n');(H/'return-output-witnesses.json').write_text(json.dumps(w)+'\n');print(json.dumps({'status':r['status'],'paths':len(r['paths']),'max':r['max_nominal_dependency_ticks']}))
