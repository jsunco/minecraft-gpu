"""Bounded independent, read-only review of the nominal dependency model."""
from pathlib import Path
import hashlib, importlib.util, json, copy, contextlib, io
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
spec=importlib.util.spec_from_file_location('nominal_graph',H/'check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
seen={}
for folder in [H,ROOT/'artifacts/full-gpu-layout-v1/program-interface-timing-v1']:
 manifest=json.loads((folder/'source-manifest.json').read_text())
 for p,h in manifest['files'].items():
  assert seen.get(p,h)==h,(p,'incompatible pins');seen[p]=h
for p,h in seen.items(): assert sha(ROOT/p)==h,(p,'changed')
assert m.fixtures()==8
# Independent directional source set checks; wire-only support transfer must
# remain absent while direct adjacent-wire transfer remains possible.
S=lambda:{'id':m.S};W=lambda:{'id':m.W};T=lambda:{'id':m.T}
checks=0
for travel,facing in [((1,0,0),'west'),((-1,0,0),'east'),((0,0,1),'north'),((0,0,-1),'south')]:
 source=tuple(-v for v in travel);w={source:{'id':m.R,'properties':{'facing':facing,'delay':'2'}},(0,0,0):S(),(0,1,0):W()}
 _,idx,_,edges=m.build(w);assert (idx[(source,'signal')],idx[((0,0,0),'nonwire')]) in edges
 assert (idx[((0,0,0),'nonwire')],idx[((0,1,0),'signal')]) in edges
 wrong=copy.deepcopy(w);wrong[source]['properties']['facing']={'west':'east','east':'west','north':'south','south':'north'}[facing]
 _,i,_,e=m.build(wrong);assert (i[(source,'signal')],i[((0,0,0),'nonwire')]) not in e
 checks+=1
for loc in [(0,1,0),(1,0,0),(0,-1,0)]:
 w={(0,0,0):S(),loc:W(),(-1,0,0):W()};_,i,_,e=m.build(w)
 assert (i[(loc,'signal')],i[((0,0,0),'nonwire')]) not in e
 assert ((i[(loc,'signal')],i[((0,0,0),'all')]) in e)==(loc!=(0,-1,0));checks+=1
# A standing torch strongly powers only its upward solid; a redstone block is
# not a direct strong source for an intervening solid.
w={(0,-2,0):S(),(0,-1,0):T(),(0,0,0):S(),(1,0,0):W()};_,i,_,e=m.build(w)
assert (i[((0,-1,0),'signal')],i[((0,0,0),'nonwire')]) in e;checks+=1
w={(0,0,0):S(),(-1,0,0):{'id':m.RB},(1,0,0):W()};_,i,_,e=m.build(w)
assert (i[((-1,0,0),'signal')],i[((0,0,0),'nonwire')]) not in e;checks+=1
# Retained native-shaped outputs explicitly retain non-physical scope.
for filename,total,maximum in [('checks.json',128,518),('capture-checks.json',128,530)]:
 d=json.loads((H/filename).read_text());assert len(d['paths'])==total;assert d['max_nominal_dependency_ticks']==maximum
 assert d['native_acceptance'] is False and d['numeric_physical_bounds_established'] is False
 assert {(v['address_bit'],v['data_bit']) for v in d['paths']}=={(a,b) for a in range(8) for b in range(16)}
 witness=json.loads((H/('witnesses.json' if filename=='checks.json' else 'capture-witnesses.json')).read_text())
 by={(r['address_bit'],r['data_bit']):r for r in d['paths']}
 for row in witness:
  assert sum(q['cost'] for q in row['scheduled_devices'])==by[(row['address_bit'],row['data_bit'])]['potential_dependency_nominal_max_ticks']
 checks+=1
# Re-evaluate the frozen formula source without allowing a write to its report.
code=(H/'combine.py').read_text();write="(H/'combined-checks.json').write_text(json.dumps(out,indent=2)+'\\n')"
assert write in code
code=code.replace(write,"assert out == json.loads((H/'combined-checks.json').read_text())")
with contextlib.redirect_stdout(io.StringIO()):exec(compile(code,str(H/'combine.py'),'exec'),{'__file__':str(H/'combine.py')})
checks+=1
out={'status':'bounded_independent_nominal_timing_checks_pass','verified_source_pins':len(seen),'author_fixture_checks':8,'independent_groups':checks,'rom_and_capture_mappings':256,'formula_report_exact':True,'world_mutations':0,'native_acceptance':False}
print(json.dumps(out))
