"""Finite in-memory corruptions; no saved geometry writes and no native calls."""
import contextlib,copy,io,json
from pathlib import Path
h=Path(__file__).resolve().parent
original=json.loads((h/'qaux-design.json').read_text())
source=(h/'check-qaux-geometry.py').read_text()
start="d=json.loads((H/'qaux-design.json').read_text())"
assert start in source
source=source.replace(start,"d=provided")
def rejected(name,change):
 d=copy.deepcopy(original);change(d)
 try:
  with contextlib.redirect_stdout(io.StringIO()):exec(compile(source,str(h/'check-qaux-geometry.py'),'exec'),{'__file__':str(h/'check-qaux-geometry.py'),'provided':d})
 except (AssertionError,KeyError):return name
 raise AssertionError('Accepted corruption '+name)
def reversed_alias(d):
 v=next(v for v in d['blocks'] if v['part']=='q_aux_select_take_lane0_local_isolator' and v['block']['id']=='minecraft:repeater');v['block']['properties']['facing']='east'
def missing_support(d):
 v=next(v for v in d['blocks'] if v['part']=='q_aux_select_trial_high_lane0_local_alias' and v['block']['id']=='minecraft:redstone_wire');p={**v['position'],'y':v['position']['y']-1};d['blocks']=[q for q in d['blocks'] if q['position']!=p]
def unlisted_side(d):
 by={tuple(v['position'][a] for a in 'xyz') for v in d['blocks']};r=next(r for r in d['routes'] if r['name']=='q_aux_select_take_lane0_local_alias')
 for p in r['path'][3:-2]:
  q={**p,'z':p['z']-1};f={**q,'y':q['y']-1}
  if tuple(q[a] for a in 'xyz') not in by and tuple(f[a] for a in 'xyz') not in by:
   d['blocks'] += [{'position':q,'block':{'id':'minecraft:redstone_wire'},'part':'corrupt_side'},{'position':f,'block':{'id':'minecraft:light_gray_concrete'},'part':'corrupt_side'}];return
 raise AssertionError('No isolated fixture site')
cases=[rejected('reversed_real_alias_isolator',reversed_alias),rejected('missing_stair_support',missing_support),rejected('unlisted_side_short',unlisted_side)]
print(json.dumps({'status':'three_meaningful_geometry_corruptions_rejected','cases':cases,'native_calls':0}))
