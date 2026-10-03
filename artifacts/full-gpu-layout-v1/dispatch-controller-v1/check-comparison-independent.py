"""Bounded read-only comparison/operand delta review; no redstone scheduling."""
import json,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[3];H=Path(__file__).resolve().parent
load=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=load(H/'source-manifest.json');assert sha(H/'source-manifest.json')=='dd0a1677540b0db92c870e6e04e2cb9e2fd3aaedf1fe37098554b3f7454de064'
for p,h in manifest['files'].items():assert sha(R/p)==h,p
P=lambda p:tuple(p[a]for a in'xyz');A=lambda p,q:tuple(a+b for a,b in zip(p,q));N=lambda p:tuple(-a for a in p)
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(D.values());W='minecraft:redstone_wire';S='minecraft:light_gray_concrete';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch';DI={'minecraft:repeater','minecraft:comparator'}
def sources(m,p):
 out=set()
 for v in dirs:
  q=A(p,N(v));b=m.get(q,{})
  if b.get('id')==W or b.get('id')in DI and D[b['properties']['facing']]==v:out.add(q)
 for v,k in[((0,-1,0),T),((0,1,0),W)]:
  q=A(p,v)
  if m.get(q,{}).get('id')==k:out.add(q)
 return out
results={}
for name in ['byte-comparison','counts','totals']:
 d=load(H/name/'design.json');m={P(v['position']):v['block']for v in d['blocks']};assert len(m)==len(d['blocks']);parents={p['id']for p in d['parents']};base={P(v['position']):v['block']for v in d['blocks']if v['part']in parents};new=set(m)-set(base);torch=rear=0;new_solid_to_parent=[]
 for p,b in base.items():
  if b['id']in(T,WT):
   q=A(p,(0,-1,0))if b['id']==T else A(p,D[b['properties']['facing']]);assert sources(m,q)==sources(base,q),('torch support changed',name,p);torch+=1
  if b['id']in DI:
   q=A(p,N(D[b['properties']['facing']]))
   if base.get(q,{}).get('id')==S:assert sources(m,q)==sources(base,q),('solid rear changed',name,p);rear+=1
 for p,b in m.items():
  if b['id']!=S:continue
  for src in sources(m,p):
   if m[src]['id']==W:continue
   for v in dirs+[(0,1,0),(0,-1,0)]:
    q=A(p,v)
    if q in base and base[q]['id']==W and (src in new or p in new):new_solid_to_parent.append((src,p,q))
 assert not new_solid_to_parent,(name,new_solid_to_parent[:8])
 for c in d.get('connections',[]):
  q=P(c['destination']);rr=P(c['normalizer']);assert m[q]['id']==W;assert m[rr]['id']=='minecraft:repeater';assert A(rr,D[m[rr]['properties']['facing']])==q
 if name=='byte-comparison':
  for c in d['columns']:
   x,z,lo,hi=(c[k]for k in['x','z','bottom','top'])
   for y in range(lo,hi,2):
    q=(x,y,z);ss=sources(m,q)
    expected={(x,y-1,z)}if y>lo else set()
    if c.get('wire_top') and y==hi-1:expected.add((x,hi,z))
    if c.get('or_inputs')and (y-lo)%8==0:expected.add((x,y,z+1))
    elif y==lo:expected.add((x,y,z+1))
    assert ss==expected,('column source set',c['name'],q,ss,expected)
  for bit,b in enumerate(d['bits']):
   g=P(b['propagate_gate']);assert m[g]=={'id':'minecraft:comparator','properties':{'facing':'west','mode':'subtract'}}
   side=A(g,(0,0,1));assert m[side]=={'id':'minecraft:repeater','properties':{'facing':'south','delay':'1'}}
  q=P(d['quiet_zero']['position']);assert m[q]['id']==W
  for v in dirs+[(0,1,0),(0,-1,0)]:
   p=A(q,v);assert p not in m or m[p]['id']==S or p==P(d['quiet_zero']['receiver'])
 if name=='totals':
  assert len(d['connections'])==21
  for q in map(P,d['quiet_high_bits']):
   assert q[1]==57 and m[q]['id']==W
   for v in dirs+[(0,1,0),(0,-1,0)]:
    p=A(q,v);assert p not in m or m[p]['id']==S or p==A(q,(1,0,0))
 results[name]={'blocks':len(m),'preserved_parent_torch_source_sets':torch,'preserved_parent_solid_rears':rear,'new_strong_solid_paths_into_parent_dust':0,'actual_operand_bindings':len(d.get('connections',[]))}
# Independent bit-by-bit unsigned subtraction, with a negative intermediate
# generating the next borrow; compare actual XOR-mask recurrence separately.
cases=0
for a in range(256):
 for b in range(256):
  borrow=0;actual=0;diff=0
  for i in range(8):
   x=a>>i&1;y=b>>i&1;borrow=int(x-y-borrow<0)
   xor=x^y;actual=int((y and not x)or(actual and not xor));diff|=xor
  assert actual==borrow==int(a<b);assert (not diff)==(a==b);cases+=1
for t in range(256):
 low=int(bool(t&3));upper=t>>2;assert upper+low==(t+3)//4
print(json.dumps({'status':'independent_comparison_operand_static_pass','source_pins':len(manifest['files']),'components':results,'unsigned_pairs':cases,'total_domain_cases':256,'native_acceptance':False}))
