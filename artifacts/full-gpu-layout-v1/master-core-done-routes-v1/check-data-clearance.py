"""Bounded actual-cell separation from the concurrent root program-data draft."""
import json,hashlib
from pathlib import Path
H=Path(__file__).resolve().parent;D=H.parent/'master-program-data-v1/design.json'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(D)=='71b9b6d7bfcab82427c083a2969ab9149a4550af99153864adb8550e9ce84cef'
a=json.loads((H/'design.json').read_text());b=json.loads(D.read_text());P=lambda r:tuple(r['position'][v]for v in'xyz');other={P(r):r for r in b['blocks']};near=[]
for row in a['blocks']:
 x,y,z=P(row)
 for dx in range(-3,4):
  for dy in range(-3,4):
   for dz in range(-3,4):
    q=(x+dx,y+dy,z+dz)
    if q in other:near.append({'done':P(row),'data':q,'done_part':row['part'],'data_part':other[q]['part']})
assert all(abs(r['done'][1]-r['data'][1])>=3 for r in near),near[:10]
# Every distinct-delta source/contact dependency in the audited wire/diode/torch palette spans <=2 cells.
# The only distance3 neighbors here are wires at315 below data supports at318.
r={'status':'actual_two_delta_three_cell_clearance','done_design_sha256':sha(H/'design.json'),'data_design_sha256':sha(D),'done_cells':len(a['blocks']),'data_cells':len(b['blocks']),'near_pairs_within_chebyshev3':len(near),'near_pairs_within_chebyshev2':0,'all_distance3_pairs_separated_vertically_by3':True,'distance3_part_pairs':sorted({(r['done_part'],r['data_part'])for r in near}),'native_acceptance':False,'limits':['Binds exact concurrent DATA geometry only; whole combined source manifests and admission remain separate.']}
(H/'data-clearance.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
