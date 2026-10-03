import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];TARGET=H/'source-manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
 return h.hexdigest()
if '--check' in sys.argv:
 d=json.loads(TARGET.read_text())
 for n,h in d['source_sha256'].items():assert sha(ROOT/n)==h,n
 print(json.dumps({'status':'exact_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit
r=json.loads((H/'bindings.json').read_text());assert r['distinct_lane_receivers']==32 and r['settled_boolean_assignment_checks']==512 and len(r['negative_controls'])==48
pins=r['source_sha256'].copy()
for p in H.iterdir():
 if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
for n,h in pins.items():assert sha(ROOT/n)==h,n
TARGET.write_text(json.dumps({'status':'frozen_original_block_id_function_and_current_receiver_binding_review','source_sha256':dict(sorted(pins.items())),'metrics':{k:r[k] for k in ['original_actual_cells','current_actual_cells','shared_byte_ports','distinct_lane_receivers','two_core_external_byte_port_obligations','two_core_lane_bit_receivers','settled_boolean_assignment_checks','new_geometry_cells','new_routes']},'function':r['function'],'complete_core':False,'complete_gpu_layout':False,'native_acceptance':False,'limits':r['limits']},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins)}))
