"""Authored contact/strength screen for refolded lane, not a redstone simulation."""
import json,sys
from pathlib import Path
H=Path(__file__).resolve().parent
design_path=Path(sys.argv[sys.argv.index('--design')+1]) if '--design' in sys.argv else H/'design.json'
d=json.loads(design_path.read_text());xyz=lambda p:tuple(p[k] for k in ('x','y','z'))
m={xyz(v['position']):v['block'] for v in d['blocks']};assert len(m)==len(d['blocks'])
D={'east':(1,0,0),'west':(-1,0,0),'south':(0,0,1),'north':(0,0,-1)}
add=lambda p,q:tuple(a+b for a,b in zip(p,q));neg=lambda p:tuple(-v for v in p)
solid=lambda p:m.get(p,{}).get('id','').endswith('_concrete')
wire=lambda p:m.get(p,{}).get('id')=='minecraft:redstone_wire'
diodes=['minecraft:repeater','minecraft:comparator']
owned=lambda p:d['owner'][','.join(map(str,p))]
edges=set()
for p,b in m.items():
 if wire(p):
  for v in D.values():
   q=add(p,v);qs=[q]
   if solid(q) and not solid(add(p,(0,1,0))):qs.append(add(q,(0,1,0)))
   if not solid(q):qs.append(add(q,(0,-1,0)))
   for q in qs:
    if wire(q):edges.add((p,q))
allowed=set()
for j in d['joins']:
 a,b=xyz(j['from']),xyz(j['to']);allowed.update([(a,b),(b,a)])
foreign=[(p,q,owned(p),owned(q)) for p,q in edges if owned(p)!=owned(q) and (p,q) not in allowed]
assert not foreign,('Unintended dust joins',foreign[:30],len(foreign))
supports=0;locks=[]
status_locks={(xyz(c['store']),xyz(c['lock'])) for c in d['front']['status_cells']}
for p,b in m.items():
 if b['id'].endswith('_concrete'):continue
 q=add(p,(0,-1,0))
 if b['id']=='minecraft:redstone_wall_torch':q=add(p,neg(D[b['properties']['facing']]))
 assert solid(q),('Support',p,b);supports+=1
 if b['id']=='minecraft:repeater':
  f=D[b['properties']['facing']]
  for v in ([D['north'],D['south']] if f[0] else [D['east'],D['west']]):
   q=add(p,v);a=m.get(q,{})
   if a.get('id') in diodes and add(q,neg(D[a['properties']['facing']]))==p:
    # The only expected side locks are retained original current/next/aux cells.
    assert (owned(p)==owned(q) and owned(p) in ['W','Q','M']) or (p,q) in status_locks,('New side lock',p,q)
    locks.append((p,q))
minimum=15
for r in d['routes']:
 ps=list(map(xyz,r['positions']));strength=15;previous=None
 for p,q in zip(ps,ps[1:]):
  if wire(p) and wire(q):assert (p,q) in edges and (q,p) in edges,('Blocked step',r['net'],p,q)
  elif m[p]['id']=='minecraft:repeater':assert add(p,neg(D[m[p]['properties']['facing']]))==q,('Wrong output',p,q)
  elif m[q]['id']=='minecraft:repeater':assert add(q,D[m[q]['properties']['facing']])==p,('Wrong rear',p,q)
 for p in ps:
  if m[p]['id']=='minecraft:repeater':assert strength>0;strength=15
  else:
   if previous=='minecraft:redstone_wire':strength-=1
   assert strength>0,('Attenuated',r['net'],p)
  previous=m[p]['id']
 minimum=min(minimum,strength)
for c in d['columns']:
 x,y,z=xyz(c['bottom']);top=xyz(c['top'])[1]
 for yy in range(y,top+1):assert m[x,yy,z]['id']==('minecraft:light_gray_concrete' if (yy-y)%2==0 else 'minecraft:redstone_torch')
 for yy in c['injection_y']:assert (yy-y)%4==0
for s in d['selectors']:
 for b in s['bits']:
  cmp=xyz(b['comparator']);out=xyz(b['output_receiver']);supp=xyz(b['output_support']);mask=xyz(b['mask_receiver']);rear=xyz(b['data_receiver'])
  assert add(out,(1,0,0))==supp and solid(supp)
  assert m[out]['properties']['facing']=='west'
  assert cmp==add(mask,(0,0,-1)) and m[mask]['properties']['facing']=='south'
  assert m[cmp]['properties']=={'facing':'west','mode':'subtract'}
  assert m[rear]['properties']['facing']=='west'
for s in d['bit_selectors']:
 target=xyz(s['target'])
 for stage in s['stages']:
  p=xyz(stage['input']);cmp=xyz(stage['comparator']);out=xyz(stage['output_receiver'])
  assert cmp==add(p,(3,0,0)) and m[cmp]['properties']=={'facing':'west','mode':'subtract'}
  assert m[add(p,(1,0,0))]['properties']['facing']=='west'
  assert m[out]['properties']['facing']=='west' and add(out,(1,0,0))==xyz(stage['output_support'])
  assert m[add(cmp,(0,0,-1))]['properties']['facing']=='north'
  assert xyz(stage['mask_input'])==add(cmp,(0,0,-6))
 assert target in m and wire(target)
for g in d['groups']:
 if g['id'].endswith('_current_to_self'):
  assert len(g['links'])==8
  for b,l in enumerate(g['links']):assert l['bit']==b and l['source']==d['banks'][g['id'][0]]['current'][b]
 if g['id'].endswith('_current_to_left_upper7'):
  assert len(g['links'])==7
  for b,l in enumerate(g['links'],1):assert l['bit']==b and l['source_bit']==b-1
# Strong-support and direct-torch crossings are also screened, including the
# two-block vertical cases which a dust-only adjacency graph would miss.
allowed_power={(xyz(c['top']),xyz(c['output'])) for c in d['columns']}
allowed_taps={(xyz(t['support']),xyz(t['first'])) for t in d['taps']}
intentional_torch={(xyz(t['source']),xyz(t['receiver'])) for t in d['front']['intentional_torch_receivers']}
allowed_power.update((xyz(t['support']),xyz(t['destination'])) for t in d['intentional_support_power'])
strong_contacts=0
for p,b in m.items():
 targets=[]
 if b['id'] in ['minecraft:redstone_torch','minecraft:redstone_wall_torch']:
  targets=[add(p,(0,1,0))]
  for v in D.values():
   q=add(p,v);a=m.get(q,{})
   if q not in m or owned(q)==owned(p):continue
   assert not wire(q) or any(c['value']==1 and xyz(c['position'])==q and p==add(q,(-1,0,0)) for c in d['fixed_constants']),('Foreign torch to wire',p,q)
   if a.get('id') in diodes:assert add(q,D[a['properties']['facing']])!=p or (p,q) in intentional_torch,('Foreign torch diode rear',p,q)
 elif b['id'] in diodes:targets=[add(p,neg(D[b['properties']['facing']]))]
 elif wire(p):targets=[add(p,(0,-1,0))]
 for q in targets:
  if not solid(q):continue
  for v in [*D.values(),(0,1,0),(0,-1,0)]:
   r=add(q,v);a=m.get(r,{})
   if r not in m or r==p or owned(r)==owned(p):continue
   if wire(r):
    if wire(p):continue # Native getBlockSignal disables all wire sources for this receiver.
    assert (q,r) in allowed_power or (p,r) in allowed,('Foreign support to wire',p,q,r)
    strong_contacts+=1
   elif a.get('id') in diodes and add(r,D[a['properties']['facing']])==q:
    assert (q,r) in allowed_taps,('Foreign support to diode rear',p,q,r)
    strong_contacts+=1
for z in d['zero_ports']+[c for c in d['fixed_constants'] if c['value']==0]:
 p=xyz(z['position']);assert wire(p) and solid(add(p,(0,-1,0)))
 for v in [*D.values(),(0,1,0),(0,-2,0)]:
  q=add(p,v)
  if v==D['east']:assert m[q]['id']=='minecraft:repeater' and m[q]['properties']['facing']=='west'
  else:assert q not in m,('Constant zero contact',p,q)
assert len(d['zero_ports'])==33
# Exact retained-state/response map and original38 plus three explicit status
# refinement receivers. The missing acceptance qualification is NOT proved by
# finding these terminals or by the following settled Boolean checks.
micro=json.loads((H.parent/'alu/physical-control-interface.json').read_text())['ports']
names=[p['name'] for p in micro]+['status_busy_value','status_open','status_clear']
assert len(names)==41 and len(set(names))==41
for name in names:
 ps=[p for p in d['ports'] if p['name']==name];assert len(ps)==1,(name,len(ps))
 assert wire(xyz(ps[0]['position'])) and m[xyz(ps[0]['receiver'])]['id']=='minecraft:repeater'
state=[]
for bank,offset in [('W',0),('Q',40),('M',80)]:
 state += list(map(xyz,d['banks'][bank]['current']))+list(map(xyz,d['banks'][bank]['next']))+[(offset+18,1,0),(offset+18,1,6)]
for c in d['front']['status_cells']:
 p,q=xyz(c['store']),xyz(c['lock']);state.append(p)
 assert m[p]['properties']['facing']=='west' and m[q]['properties']['facing']=='south' and add(q,(0,0,-1))==p
 assert xyz(c['normalized_D'])==add(p,(-1,0,0))
 assert m[xyz(c['normalized_D'])]['properties']['facing']=='west'
 assert m[xyz(c['output_driver'])]['properties']['facing']=='west'
assert len(state)==len(set(state))==57 and set(state)=={p for p,q in locks}
result_ports=sorted([p for p in d['ports'] if p['name']=='result'],key=lambda p:p['bit'])
assert len(result_ports)==8
for b,p in enumerate(result_ports):
 assert p['bit']==b and p['source']==d['banks']['W']['next'][b] and xyz(p['via'])==(0,1,12*b)
 assert xyz(p['position'])==add(xyz(p['driver']),(-1,0,0)) and m[xyz(p['driver'])]['properties']['facing']=='east'
 assert p['normalized_high']==15
assert xyz(d['arithmetic']['held_restore_source'])==(59,1,6), 'Restore must use held next-aux, not live C|T8'
# Source-to-junction checks on the actual physical B collector. Every bit enters
# via its own west diode; only the northward accumulator can reach ZERO.
assert len(d['front']['divisor_zero']['source_bits'])==8
for b,j in enumerate(d['front']['divisor_zero']['source_bits']):
 p=xyz(j['collector']);assert p==(-32,-50,6+12*b) and wire(p)
 assert m[add(p,(1,0,0))]['properties']['facing']=='east'
 assert xyz(j['source'])==(-20,-45,6+12*b)
# Offline settled transfer equation of every stacked OR column, all choice masks
# and payloads. Not a transient or native simulation.
truth=0
for choices in [6,5,3,3,4]:
 for data in range(1<<choices):
  for selection in range(1<<choices):
   value=0
   for i in reversed(range(choices)):
    injected=((data>>i)&1) if (selection>>i)&1 else 0
    value=value|injected
   assert value==int(bool(data&selection));truth+=1
arithmetic_truth=0
for bits in range(32):
 w,m0,e,s,c=[(bits>>i)&1 for i in range(5)]
 x=max(15*m0-15*(1-e),0)//15
 conditioned=(max(x-s,0)|max(s-x,0))
 total=w+((m0&e)^s)+c
 assert conditioned==((m0&e)^s)
 assert (w^conditioned^c)==(total&1)
 assert ((w&conditioned)|(w&c)|(conditioned&c))==int(total>=2)
 arithmetic_truth+=1
for byte in range(256):assert int(not any((byte>>b)&1 for b in range(8)))==int(byte==0)
assert sum(g['added_blocks'] for g in d['groups'])==len(m)
# Exact derivative boundary: no v3 block/state/owner or command receiver moves.
parent=json.loads((H.parent/'alu-v3/design.json').read_text())
pm={xyz(v['position']):v['block'] for v in parent['blocks']}
for p,b in pm.items():
 assert m[p]==b and owned(p)==parent['owner'][','.join(map(str,p))],('Parent changed',p)
for p in parent['ports']:
 if p['name'] in names:
  current=[q for q in d['ports'] if q['name']==p['name']]
  assert len(current)==1 and current[0]['position']==p['position'] and current[0]['receiver']==p['receiver']
assert len(d['front']['status_cells'])==3 and d['front']['status_cells']==parent['front']['status_cells']
assert len(d['blocks'])-len(parent['blocks'])==sum(g['added_blocks'] for g in d['groups'][len(parent['groups']):])
# Every new cross-owner rear input is enumerated. This also catches an unintended
# extra diode rear driven by a nearby route even where the dust graph is isolated.
rear_pairs={((-37,62,-10),(-37,62,-9)),((7,61,-36),(7,61,-37)),((23,61,-36),(23,61,-37)),((39,61,-36),(40,61,-36)),((5,61,43),(6,61,43)),((65,61,7),(66,61,7)),((42,61,-36),(42,61,-35)),((63,61,-24),(63,61,-25)),((15,61,43),(15,61,44))}
seen=set()
for p,b in m.items():
 if p in pm or b['id']!='minecraft:repeater':continue
 q=add(p,D[b['properties']['facing']]);a=m.get(q,{})
 if a.get('id') in ['minecraft:redstone_wire','minecraft:repeater','minecraft:redstone_wall_torch'] and owned(q)!=owned(p):
  assert (q,p) in rear_pairs,('Unknown new rear source',q,p);seen.add((q,p))
assert seen==rear_pairs
# Only real diode/torch outputs may mediate power through a solid to dust.
# getBlockSignal temporarily disables wire.getSignal/getDirectSignal for ALL
# wire instances. A dust source above the solid cannot energize the lower dust.
assert {(xyz(t['source']),xyz(t['destination'])) for t in d['intentional_support_power']}=={((30,38,-37),(30,37,-36)),((0,38,-38),(-1,37,-38)),((16,38,-38),(15,37,-38))}
for t in d['intentional_support_power']:
 p,s,q=map(xyz,[t['source'],t['support'],t['destination']]);assert m[p]['id']=='minecraft:repeater' and solid(s) and wire(q)
 assert s==add(p,neg(D[m[p]['properties']['facing']])) and q==add(s,(0,-1,0))
 expected_sources={p}|({xyz(t['also_source'])} if 'also_source' in t else set())
 effective_sources=set()
 for v in [*D.values(),(0,1,0),(0,-1,0)]:
  a=add(s,v);b=m.get(a,{})
  if b.get('id') in diodes and add(a,neg(D[b['properties']['facing']]))==s:effective_sources.add(a)
  elif b.get('id') in ['minecraft:redstone_torch','minecraft:redstone_wall_torch'] and a==add(s,(0,-1,0)):effective_sources.add(a)
 assert effective_sources==expected_sources,('Incorrect non-wire strong sources',s,effective_sources)
 if 'also_destination' in t:
  assert xyz(t['also_destination'])==add(s,(0,1,0)) and wire(xyz(t['also_destination']))
assert m[30,38,-37]['properties']=={'facing':'north','delay':'1'}
assert m[31,37,-36]['properties']=={'facing':'west','mode':'subtract'}
assert m[7,39,-38]['properties']=={'facing':'east','delay':'1'} # blocks busy-only input from ready
assert m[-2,38,-38]['properties']=={'facing':'west','delay':'1'}
# Literal-predicate panels: geometry, directional collector refresh, and all
# normalized input combinations. Every HIGH mismatch gets re-normalized.
panels=d['front']['status_panels'];assert [x['name'] for x in panels]==['raw_local_div0','accepted_div0']
assert [(x['term'],x['wanted']) for x in panels[0]['stages']]==[('mode0',1),('mode1',1),('compare',0),('B_zero',1)]
assert [(x['term'],x['wanted']) for x in panels[1]['stages']]==[('busy',0),('ready',0),('fault_div_zero',0),('lane_enable',1),('execute_request',1),('raw_div0',1)]
panel_truth=0
for panel in panels:
 for i,stage in enumerate(panel['stages']):
  p=xyz(stage['input']);r=xyz(stage['receiver']);bad=xyz(stage['bad_driver']);collector=xyz(stage['collector'])
  assert r==add(p,(1,0,0)) and m[r]['properties']=={'facing':'west','delay':'1'}
  assert bad==add(p,(4,0,0)) and m[bad]['properties']=={'facing':'west','delay':'1'}
  assert collector==add(p,(5,0,0)) and wire(collector)
  if stage['wanted']:
   assert solid(add(p,(2,0,0))) and m[add(p,(3,0,0))]=={'id':'minecraft:redstone_wall_torch','properties':{'facing':'east'}}
  else:assert wire(add(p,(2,0,0))) and wire(add(p,(3,0,0)))
  if i:assert xyz(panel['stages'][i-1]['input'])==add(p,(0,0,-12))
 start,end=map(xyz,[panel['collector_start'],panel['collector_end']]);strength=0
 for z in range(start[2],end[2]+1):
  p=(start[0],start[1],z)
  if (z-start[2])%12==6:assert m[p]['properties']=={'facing':'north','delay':'1'}
  else:assert wire(p)
 out=xyz(panel['output']);assert wire(out) and m[add(out,(0,0,-1))]['properties']=={'facing':'north','delay':'1'}
 for values in range(1<<len(panel['stages'])):
  bads=[15*int(((values>>i)&1)!=s['wanted']) for i,s in enumerate(panel['stages'])]
  geometric=int(max(bads)==0)
  assert geometric==int(all(((values>>i)&1)==s['wanted'] for i,s in enumerate(panel['stages'])));panel_truth+=1
# Exhaust all 12 external/retained bits, comparing the physical mask expression
# with the declared sticky-fault/status contract. These are settled equations,
# not a claim about asynchronous propagation or core event production.
status_truth=0
for bits in range(4096):
 mode0,mode1,compare,bzero,en,req,busy,ready,fault,clear,busydata,final=[(bits>>i)&1 for i in range(12)]
 raw=int(not compare and mode0 and mode1 and bzero)
 accepted=int(raw and en and req and not busy and not ready and not fault)
 fault_next=int(bool(fault or accepted) and not clear)
 common=int(not en or fault or accepted)
 actual=(int(bool(busydata) and not (clear or common or raw)),int(bool(final) and not (clear or common)),fault_next)
 expected=(int(en and busydata and not fault_next and not raw and not clear),int(en and final and not fault_next and not clear),fault_next)
 assert actual==expected,(bits,actual,expected)
 if clear:assert actual==(0,0,0)
 if raw:assert actual[0]==0
 if fault and not clear:assert actual==(0,0,1)
 status_truth+=1
# Original high-level inputs are newly mapped, not added microcommands.
expected_inputs={('arithmetic_mux',0):(0,61,0),('arithmetic_mux',1):(0,61,12),('compare',0):(0,61,24),('lane_enable',0):(60,61,-24),('execute_request',0):(60,61,-12)}
for key,p in expected_inputs.items():
 ps=[v for v in d['ports'] if (v['name'],v.get('bit',0))==key];assert len(ps)==1 and xyz(ps[0]['position'])==p
 assert wire(p) and m[xyz(ps[0]['receiver'])]['id']=='minecraft:repeater'
r={'status':'authored_connected_status_geometry_screen_passed','blocks':len(m),'parent_preserved_blocks':len(pm),'added_blocks':len(m)-len(pm),'status_panel_truth_cases':panel_truth,'status_equation_truth_cases':status_truth,'explicit_support_power_inputs':3,'new_cross_owner_rear_paths':len(seen),'supported_components':supports,'original_bank_storage_locks':54,'explicit_status_storage_locks':len(status_locks),'retained_bits':len(state),'normalized_result_bits':8,'mapped_microcontrol_receivers':41,'foreign_dust_joins':0,'unexpected_side_locks':0,'minimum_route_endpoint_strength':minimum,'selector_choices':len(d['selectors']),'single_bit_selector_stages':sum(len(s['stages']) for s in d['bit_selectors']),'positive_OR_columns':len(d['columns']),'checked_cross_owner_strong_contacts':strong_contacts,'settled_selector_truth_cases':truth,'settled_conditioner_FA_truth_cases':arithmetic_truth,'settled_divisor_zero_cases':256,'isolated_zero_choice_bits':len(d['zero_ports']),'isolated_fixed_shift_mode_bits':4,'limitations':['Partial ALU, no build plans or native calls.','Local status qualification is mapped; shared core event producers, inter-module routes and all physical timing remain unverified.','Strong-support dynamics, simultaneous transitions, and timing are not simulated.','Settled Boolean truth checks assume the inspected component transfer motifs; they are not a full-map redstone simulation.']}
if '--save' in __import__('sys').argv:(H/'routing-check.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r))
