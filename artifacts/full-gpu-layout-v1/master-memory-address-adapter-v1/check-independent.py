"""Bounded independent identity/direction/fanout audit; no native tools or writes to authored files."""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;R=H.parents[2];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();load=lambda p:json.loads(p.read_text());K=lambda p:tuple(p[a]for a in'xyz')
d=load(H/'design.json');o=load(H/'obstacles.json');ledger=load(R/'artifacts/full-gpu-layout-v1/floorplan-v3/connections.json');m=load(H/'source-manifest.json')
assert sha(H/'source-manifest.json')=='28f13f1b4c2965fd1d7b00ebb15acaa74bde39dda6bb97b4f5d8611c8358df6c'
for p,h in m['files'].items():assert sha(R/p)==h,p
base={K(v['position']):v['block']for v in o['blocks']}
def check(q):
 cells={K(v['position']):v['block']for v in q['blocks']};assert len(cells)==320 and not(cells.keys()&base.keys());seen=set()
 for b in q['branches']:
  i,j=b['consumer'],b['bit'];assert 0<=i<8 and 0<=j<8 and(i,j)not in seen;seen.add((i,j));y=1+4*i;z=-6+8*j
  assert K(b['source'])==(614,y,z) and K(b['normalizer'])==(613,y,z) and K(b['strong_solid'])==(612,y,z)
  assert cells[(614,y,z)]=={'id':'minecraft:redstone_wire'}
  assert cells[(613,y,z)]=={'id':'minecraft:repeater','properties':{'facing':'east','delay':'1'}}
  for p in[(612,y,z),(613,y-1,z),(614,y-1,z)]:assert cells[p]=={'id':'minecraft:light_gray_concrete'}
  assert [K(p)for p in b['recipients']]==[(612,y,z-1),(612,y,z+1)]
  pref=f'gpu/core{i//4}/lane{i%4}/lsu.'
  rn=next(n for n in ledger['nets']if n['name'].startswith(pref+'read_address'));wn=next(n for n in ledger['nets']if n['name'].startswith(pref+'write_address'))
  assert rn['driver']['positions'][j]==wn['driver']['positions'][j]==b['upstream_LSU_source']
  assert rn['sink']['positions'][j]==b['recipients'][0] and wn['sink']['positions'][j]==b['recipients'][1]
  for p in b['recipients']:
   assert base[K(p)]=={'id':'minecraft:redstone_wire'}
   assert base[(p['x']-1,p['y'],p['z'])]=={'id':'minecraft:repeater','properties':{'facing':'east','delay':'1'}}
  # Other bit/consumer sources and recipient solids are at least four cells away.
  for i2,j2 in seen-{(i,j)}:assert abs(4*(i-i2))+abs(8*(j-j2))>=4
 assert len(seen)==64
check(d);n=0
for corrupt in[lambda q:q['branches'][0]['upstream_LSU_source'].update(x=999),lambda q:q['branches'][0]['recipients'][0].update(z=3),lambda q:next(v for v in q['blocks']if K(v['position'])==(613,1,-6))['block']['properties'].update(facing='west')]:
 q=copy.deepcopy(d);corrupt(q)
 try:check(q)
 except AssertionError:n+=1
 else:raise AssertionError('corruption admitted')
r={'status':'independently_checked_exact_address_identity_and_fanout','pins':len(m['files']),'cells':320,'shared_source_bits':64,'original_recipient_bindings':128,'negative_refusals':n,'native_acceptance':False};(H/'independent-checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
