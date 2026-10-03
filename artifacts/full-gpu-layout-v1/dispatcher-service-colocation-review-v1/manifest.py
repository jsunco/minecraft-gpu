"""Freeze the independent source/input/numeric and exact cut receipts."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];TARGET=H/'source-manifest.json'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        while chunk:=f.read(8*1024*1024):h.update(chunk)
    return h.hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'independent_dispatch_quiet_review_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Frozen receipt exists; use a new review revision'
receipt=json.loads((H/'receipt.json').read_text());ledger=json.loads((H/'ledger-receipt.json').read_text())
assert receipt['metrics']['total_cells']==1956526 and receipt['metrics']['actual_block_mutations']==82
assert ledger['metrics']['status_changes']==2 and ledger['metrics']['named_ports']==108
parent=H.parent/'dispatcher-service-colocation-v1/source-manifest.json';assert sha(parent)=='66621512048ed090908e19980f99033b2d5fb99e83df21106af31dbcbcdba2d0'
pins={}
for d in [json.loads(parent.read_text()),receipt,ledger]:
    for p,h in d['source_sha256'].items():assert p not in pins or pins[p]==h,p;pins[p]=h
pins[str(parent.relative_to(ROOT))]=sha(parent)
for p in sorted(H.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins);TARGET.write_text(json.dumps({'status':'frozen_independent_dispatcher_service_quiet_review','reviewed_manifest_sha256':sha(parent),'source_sha256':dict(sorted(pins.items())),'metrics':receipt['metrics'],'ledger_metrics':ledger['metrics'],'limits':receipt['limits'],'native_acceptance':False},indent=2)+'\n')
print(json.dumps({'status':'frozen','manifest_sha256':sha(TARGET),'receipt_sha256':sha(H/'receipt.json'),'pins':len(pins)}))
