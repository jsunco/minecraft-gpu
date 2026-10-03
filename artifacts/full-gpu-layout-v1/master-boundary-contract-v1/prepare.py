"""Explicit machine boundaries; no inherited nested input is silently a master input.
This is a routing checklist, not a complete physical composition or native result.
"""
from pathlib import Path
import hashlib,json,copy
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
BASE=ROOT/'artifacts/full-gpu-layout-v1';sources={}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):
 p=Path(p);sources[str(p.relative_to(ROOT))]=sha(p);return json.loads(p.read_text())
def key(p):return tuple(p[a] for a in 'xyz')
def translate(p,t):return {a:p[a]+t[a] for a in 'xyz'}
def positions(p):return [b['position'] for b in p['bits']]
frame=read(BASE/'floorplan-v3/frame-config.json');ports=read(BASE/'floorplan-v3/ports.json')
nets=copy.deepcopy(read(BASE/'floorplan-v3/connections.json')['nets'])
epoch=read(BASE/'control-reset-epoch-v1/design.json');core=epoch['ports']
memory=read(BASE/'memory/consumer-return-v1/ports.json')['ports']
global_d=read(BASE/'global-command-assembly-v3/design.json');g=global_d['ports']
dispatch_d=read(BASE/'dispatch-input-sampling-v1/design.json')
route_dirs=[*frame['route_deltas'],'master-program-data-v1','master-core-done-routes-v1','master-core-service-routes-v1','master-core-conditioning-routes-v1','master-memory-cold-routes-v1','master-bank-quiet-routes-v1','master-dispatch-payload-routes-v1','master-lsu-control-routes-v2','master-lsu-write-data-routes-v1','master-lsu-read-data-routes-v1','master-core-admission-routes-v1']
routes=[];route_designs={}
for name in route_dirs:
 path=Path(frame['route_deltas'][name]['path']) if name in frame['route_deltas'] else BASE/name/'design.json'
 if not path.is_absolute():path=ROOT/path
 design=read(path);route_designs[name]=design;routes.extend(design['connections'])
 if name in ['master-lsu-control-routes-v2','master-lsu-write-data-routes-v1','master-lsu-read-data-routes-v1','master-core-admission-routes-v1']:
  manifest=read(BASE/name/'source-manifest.json')
  assert manifest['files'][str(path.relative_to(ROOT))]==sources[str(path.relative_to(ROOT))]
  for filename in ['checks.json','power-checks.json','all-parent-checks.json']:
   receipt_path=BASE/name/filename;receipt=read(receipt_path)
   assert manifest['files'][str(receipt_path.relative_to(ROOT))]==sources[str(receipt_path.relative_to(ROOT))]
   assert receipt.get('design_sha256',receipt.get('source',{}).get('design'))==sources[str(path.relative_to(ROOT))],(name,filename,'Different checked geometry')
# Compose the actual single address trunk and two-recipient adapter only after
# their frozen receipts bind the same geometry. These are physical paths, not
# logical-name aliases or a second drawn bus.
shared_address_routes=[]
address_folder=BASE/'master-lsu-address-routes-v1'
if (address_folder/'source-manifest.json').exists():
 manifest=read(address_folder/'source-manifest.json')
 for file,h in manifest['files'].items():assert sha(ROOT/file)==h,file
 trunk=read(address_folder/'design.json');adapter=read(BASE/'master-memory-address-adapter-v1/design.json')
 for fn in ['checks.json','power-checks.json','all-parent-checks.json']:
  receipt=read(address_folder/fn)
  assert receipt.get('design_sha256',receipt.get('source',{}).get('design'))==sha(address_folder/'design.json')
 graph={}
 def ae(a,b):graph.setdefault(key(a),set()).add(key(b))
 for edge in trunk['edges']:ae(edge['from'],edge['to'])
 for col in trunk['columns']:
  for y in range(col['bottom'],col['output_y']):ae(dict(x=col['x'],y=y,z=col['z']),dict(x=col['x'],y=y+1,z=col['z']))
 ablocks={key(v['position']):v['block'] for v in adapter['blocks']}
 for c in trunk['connections']:
  b=next(b for b in adapter['branches'] if b['consumer']==c['consumer'] and b['bit']==c['bit'])
  assert c['source']==b['upstream_LSU_source'] and c['destination']==b['source']
  seen={key(c['source'])};todo=list(seen)
  for q in todo:
   for v in graph.get(q,[]):
    if v not in seen:seen.add(v);todo.append(v)
  assert key(b['source']) in seen
  assert b['normalizer']==dict(x=b['source']['x']-1,y=b['source']['y'],z=b['source']['z'])
  assert ablocks[key(b['normalizer'])]=={'id':'minecraft:repeater','properties':{'facing':'east','delay':'1'}}
  assert b['strong_solid']==dict(x=b['source']['x']-2,y=b['source']['y'],z=b['source']['z'])
  assert ablocks[key(b['strong_solid'])]['id']=='minecraft:light_gray_concrete'
  for field,sign,dst in zip(['read_address','write_address'],[-1,1],b['recipients']):
   assert dst==dict(x=b['strong_solid']['x'],y=b['strong_solid']['y'],z=b['strong_solid']['z']+sign)
   name=c['name']+'_'+field
   routes.append({'name':name,'source_instance':c['source_instance'],'source':c['source'],'destination_instance':'loader','destination':dst,'physical_path_composition':[c['name'],'master-memory-address-adapter-v1'], 'source_port':c['source_port'],'destination_port':'data.'+field})
   shared_address_routes.append(name)
def actual_driver(route):
 """Resolve only a drawn inherited lift prefix, never an alias by name alone."""
 upstream=route.get('upstream_driver')
 if not upstream:return route['source_instance'],route['source']
 folder,column_name=upstream['via'].split('/')
 parent=route_designs[folder];col=next(c for c in parent['columns'] if c['name']==column_name)
 assert route['source']==dict(x=col['x'],y=col['output_y'],z=col['z'])
 assert (col['output_y']-col['bottom'])%4==1
 blocks={key(v['position']):v['block'] for v in parent['blocks']}
 adjacency={}
 def edge(a,b):adjacency.setdefault(key(a),set()).add(key(b))
 for e in parent['edges']:edge(e['from'],e['to'])
 for y in range(col['bottom'],col['output_y']):
  pos=dict(x=col['x'],y=y,z=col['z']);kind=blocks[key(pos)]['id']
  assert kind==('minecraft:light_gray_concrete' if (y-col['bottom'])%2==0 else 'minecraft:redstone_torch')
  edge(pos,dict(x=col['x'],y=y+1,z=col['z']))
 assert blocks[key(route['source'])]['id']=='minecraft:redstone_wire'
 assert any(c['source_instance']==upstream['instance'] and c['source']==upstream['position'] for c in parent['connections'])
 seen={key(upstream['position'])};todo=list(seen)
 for pos in todo:
  for nxt in adjacency.get(pos,[]):
   if nxt not in seen:seen.add(nxt);todo.append(nxt)
 assert key(route['source']) in seen,('Unjoined inherited source alias',route['name'])
 return upstream['instance'],upstream['position']
refinement=read(HERE/'requester-refinement.json')
for p,h in refinement['source_sha256'].items():assert sha(ROOT/p)==h,p
routes.extend(refinement['links'])
resolved_drivers={r['name']:actual_driver(r) for r in routes}
def ep(instance,path,port):return {'instance':instance,'port':path,'positions':[translate(p,frame['instances'][instance]['translation']) for p in positions(port)],'direction':port['direction'],'coordinate_frame':'master'}
def add_net(name,driver,sink,width=1,scope='global_control'):
 assert not any(n['name']==name for n in nets)
 nets.append({'name':name,'driver':driver,'sink':sink,'width':width,'scope':scope})
extra=[]
for updated in refinement['replacements']:
 n=next(n for n in nets if n['name']==updated['name'])
 n['prior_boundary']={'driver':copy.deepcopy(n['driver']),'sink':copy.deepcopy(n['sink'])}
 n.update(updated)
 n['refinement_evidence']='master-reset-requesters-v2/interface.json and requester-refinement.json'
for n in refinement['additional']:
 add_net(n['name'],n['driver'],n['sink'],scope=n['scope']);extra.append(n['name'])
# These 80 actual return terminals were absent from the old frame ledger.
# Their existence does not imply that the bank-to-response input joins or the
# long return trunks are complete.
for n in nets:
 interface=n['driver'].get('source_interface',{})
 if interface.get('instance')=='gpu/data_memory' and interface.get('port') in ['read_ready','write_ready','read_data']:
  field=interface['port'];sl=interface['slice'];a=sl['lsb'];w=sl['width'];p=memory[field]
  assert p['direction']=='output' and w==n['width']
  n['driver'].update(positions=p['positions'][a:a+w],direction='output',port='data.'+field,endpoint_evidence='memory/consumer-return-v1/ports.json')
quiet=read(BASE/'master-bank-quiet-adapters-v1/design.json')
for bank in range(4):
 n=next(n for n in nets if n['name']=='global_bank_quiet'+str(bank))
 adapter=quiet['adapters'][bank]
 n['driver'].update(port='bank'+str(bank)+'_quiet',positions=[adapter['destination']],direction='output',endpoint_evidence='master-bank-quiet-adapters-v1/design.json')
for field,p in [('data',memory['reset']),('program',ports['instances']['loader']['program']['reset'])]:
 sink={'instance':'loader','port':field+'.reset','positions':p['positions'],'direction':'input','coordinate_frame':'master'}
 add_net('global_cold_initialize_'+field+'_memory',ep('global','cold_initialize',g['cold_initialize']),sink)
 extra.append(nets[-1]['name'])
for c in range(2):
 inst='core'+str(c)
 # Source tracing establishes one cold input and an already-joined internal fanout.
 add_net('global_cold_initialize_core_'+str(c),ep('global','cold_initialize',g['cold_initialize']),ep(inst,'rf.startup_initialize_request',core['rf']['startup_initialize_request']))
 add_net('global_alu_normal_permit_'+str(c),ep('global','normal_permit',g['normal_permit']),ep(inst,'alu_startup.logic.normal_permit',core['alu_startup']['logic']['normal_permit']))
 extra += [nets[-2]['name'],nets[-1]['name']]
 # DATA uses the actual common strong support before the existing two fanouts.
 data=next(n for n in nets if n['name']=='program_'+str(c)+'_read_data')
 old=data['driver'];bits=[next(r for r in routes if r['name']=='program_data_bit'+str(b)+'_core'+str(c)) for b in range(16)]
 data['driver']={'instance':'loader','port':'program.actual_common_retained_response','positions':[r['source'] for r in bits],'direction':'output','coordinate_frame':'master','prior_alias':old,'alias_evidence':'master-program-data-v1/contract-checks.json + independent-review.json'}

# One retained LSU address bus serves both operations. This records exact
# physical identity; no logical equality or host-computed mux is assumed.
shared=[]
for c in range(2):
 for l in range(4):
  prefix=f'gpu/core{c}/lane{l}/lsu.'
  a=next(n for n in nets if n['name'].startswith(prefix+'read_address'))
  b=next(n for n in nets if n['name'].startswith(prefix+'write_address'))
  assert a['width']==b['width']==8
  assert a['driver']['instance']==b['driver']['instance']
  assert a['driver']['positions']==b['driver']['positions']
  assert a['sink']['positions']!=b['sink']['positions']
  shared.append({'core':c,'lane':l,'source':a['driver']['positions'],'read_recipients':a['sink']['positions'],'write_recipients':b['sink']['positions'],'unique_trunk_bits':8,'actual_sink_bits':16,'status':'physical_trunk_and_two_recipient_adapter_drawn' if shared_address_routes else 'exact_source_alias_proven_route_not_drawn'})

for n in nets:
 src=n['driver'].get('positions');dst=n['sink'].get('positions');matches=[]
 if src is not None and dst is not None:
  assert len(src)==len(dst)==n['width'],n['name']
  for s,t in zip(src,dst):
   candidates=[r for r in routes if resolved_drivers[r['name']][0]==n['driver']['instance'] and r['destination_instance']==n['sink']['instance'] and key(resolved_drivers[r['name']][1])==key(s) and key(r['destination'])==key(t)]
   assert len(candidates)<=1,(n['name'],'duplicate drawn driving routes')
   if candidates:matches.append(candidates[0]['name'])
 n['routed_bits']=len(matches);n['routed_connections']=matches
 n['geometry_status']='physical_endpoint_missing' if src is None or dst is None else 'all_bits_actually_routed' if len(matches)==n['width'] else 'both_endpoints_drawn_route_missing'

# Distinct required nets may share a source but may not silently compete for a pad.
drivers={}
for n in nets:
 if n['driver'].get('positions') is None or n['sink'].get('positions') is None:continue
 for s,t in zip(n['driver']['positions'],n['sink']['positions']):
  dst=(n['sink']['instance'],key(t));src=(n['driver']['instance'],key(s))
  assert dst not in drivers or drivers[dst]==src,('Multiple physical drivers',dst,n['name'])
  drivers[dst]=src
tie_low=[]
for c in range(2):tie_low.append({'name':'core'+str(c)+'_RF_clock_inhibit','endpoint':ep('core'+str(c),'rf.startup_phase_inhibit',core['rf']['startup_phase_inhibit']),'required_value':0,'reason':'RF cadence must keep running through cold conditioning and reset. Never drive from raw RESET.','implementation_status':'explicit_static_low_boundary_to_be_screened_in_final_composition'})
tie_low.append({'name':'dispatch_clock_inhibit','endpoint':ep('dispatch','startup_phase_inhibit',dispatch_d['ports']['startup_phase_inhibit']),'required_value':0,'reason':'Dispatch conditioning and reset need its local cadence.','implementation_status':'explicit_static_low_boundary_to_be_screened_in_final_composition'})
manual=global_d.get('manual_controls',[])
report={'status':'explicit_master_boundary_routes_accounted_pending_complete_composition' if all(n['geometry_status']=='all_bits_actually_routed' for n in nets) else 'explicit_master_boundary_checklist_incomplete','component_basis':{'core':'control-reset-master-compatible-v3, original unchanged interfaces from control-reset-epoch-v1','memory':'internal-bank-response-v1, original consumer-return interfaces','composition':'floorplan-v3 with explicit frozen deltas, shared LSU address adapters and serialized reset requester refinement'},'required_connections':nets,'required_bit_destinations':sum(n['width'] for n in nets),'routed_bit_destinations':sum(n['routed_bits'] for n in nets),'known_unrouted_bits':sum(n['width']-n['routed_bits'] for n in nets if n['geometry_status']!='physical_endpoint_missing'),'bits_missing_endpoint':sum(n['width'] for n in nets if n['geometry_status']=='physical_endpoint_missing'),'additional_explicit_master_connections':extra,'shared_LSU_address_buses':shared,'composed_shared_address_routes':shared_address_routes,'constant_low_boundaries':tie_low,'manual_global_controls':manual,'source_sha256':sources,'complete_gpu_layout':False,'native_acceptance':False,'limits':['Current explicit master routing contract, not a proof that every historical nested port is an unconnected machine input. Source-traced cold/permission aliases are documented separately.','Latest core and future memory refinements require actual full-frame overlap/halo validation. Endpoint existence and named cable matching do not establish complete composition.','All five ACK recipients have actual sources through the stored reset requesters and explicit qualified completion AND. Raw core ACK and requester completion are distinct boundaries; no alias crosses storage.','Source and sink retention, clock/sample timing, startup and reset ownership are separate acceptance gates.','Internal memory address and write-data fanout have separate frozen derivatives; qualified bank response collection and final complete-composition screens remain distinct gates. The return terminal stage alone does not close those inputs.']}
HERE.joinpath('contract.json').write_text(json.dumps(report,indent=2)+'\n')
HERE.joinpath('summary.json').write_text(json.dumps({k:v for k,v in report.items() if k not in ['required_connections','source_sha256','shared_LSU_address_buses','constant_low_boundaries','manual_global_controls']},indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['status','required_bit_destinations','routed_bit_destinations','known_unrouted_bits','bits_missing_endpoint']}))
