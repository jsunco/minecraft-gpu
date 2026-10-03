"""Bounded in-memory corruptions of actual authored routes; no generated evidence files."""
import json,io,contextlib
from pathlib import Path
H=Path(__file__).resolve().parent
p=H/'check-w-choice-height-matched.py'
s=p.read_text().replace("d=json.loads((H/'w-choice-height-matched.json').read_text())",'d=INJECTED')
d=json.loads((H/'w-choice-height-matched.json').read_text())
by={tuple(v['position'][a] for a in 'xyz'):v for v in d['blocks']}
def validate():
 with contextlib.redirect_stdout(io.StringIO()):exec(compile(s,str(p),'exec'),{'__file__':str(p),'INJECTED':d})
def bad(label,change,undo):
 change()
 try:
  try:validate()
  except (AssertionError,KeyError):return label
  raise RuntimeError('Corruption accepted: '+label)
 finally:undo()
passed=[]
rep=next(v for v in d['blocks'] if v['part'].endswith('_receiver') and v['block']['id']=='minecraft:repeater')
old=rep['block'];wrong={**old,'properties':{**old['properties'],'facing':'east'}}
passed.append(bad('reversed_arrival_diode',lambda:rep.update(block=wrong),lambda:rep.update(block=old)))
r=next(r for r in d['routes'] if r['name'].endswith('_shared_bus'))
vs=[by[tuple(r['path'][i][a] for a in 'xyz')] for i in r['refresh_indices'][:2]];orig=[v['block'] for v in vs]
passed.append(bad('two_missing_refresh_diodes',lambda:[v.update(block={'id':'minecraft:redstone_wire'}) for v in vs],lambda:[v.update(block=b) for v,b in zip(vs,orig)]))

for idx,p2 in enumerate(r['path'][1:-1],1):
 q={**p2,'z':p2['z']+1};floor={**q,'y':q['y']-1}
 if by[tuple(p2[a] for a in 'xyz')]['block']['id']=='minecraft:redstone_wire' and r['path'][idx-1]['x']!=p2['x'] and r['path'][idx+1]['x']!=p2['x'] and tuple(q[a] for a in 'xyz') not in by and tuple(floor[a] for a in 'xyz') not in by:break
else:raise AssertionError('No empty side-wire fixture')
extra=[{'position':floor,'block':{'id':'minecraft:light_gray_concrete'},'part':'foreign'},{'position':q,'block':{'id':'minecraft:redstone_wire'},'part':'foreign'}]
passed.append(bad('unlisted_side_wire_short',lambda:d['blocks'].extend(extra),lambda:d['blocks'].__delitem__(slice(-2,None))))
source=d['connections'][0]['source'];v=by[tuple(source[a] for a in 'xyz')];old=v['block'];passed.append(bad('changed_frozen_source_cell',lambda:v.update(block={'id':'minecraft:air'}),lambda:v.update(block=old)))
print(json.dumps({'status':'four_static_corruptions_rejected','cases':passed,'native_calls':0}))
