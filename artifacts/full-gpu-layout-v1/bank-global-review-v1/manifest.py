"""Immutable independent receipt pins; no author mutation."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];target=H/'source-manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  while b:=f.read(8*1024*1024):h.update(b)
 return h.hexdigest()
def verify(pins):
 for n,h in pins.items():assert sha(ROOT/n)==h,n
if '--check'in sys.argv:
 d=json.loads(target.read_text());verify(d['source_sha256']);print(json.dumps({'status':'review_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(target)}));raise SystemExit()
assert not target.exists();r=json.loads((H/'receipt.json').read_text());l=json.loads((H/'ledger-receipt.json').read_text());assert r['metrics']['total_cells']==2072756 and r['metrics']['actual_block_mutations']==777;assert l['metrics']['changed_global_records']==8
pins={}
def merge(d):
 for p,h in d.items():assert p not in pins or pins[p]==h,p;pins[p]=h
source=H.parent/'bank-global-delivery-v1/source-manifest.json';assert sha(source)=='a51f6460b976309bdc63834af00d4212705c6ea1ef53b844eee6690fcb40c91b';merge(json.loads(source.read_text())['source_sha256']);pins[str(source.relative_to(ROOT))]=sha(source)
merge(r['source_sha256']);merge(l['source_sha256'])
for p in sorted(H.rglob('*')):
 if p.is_file() and p!=target:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins);target.write_text(json.dumps({'status':'frozen_independent_bank_global_delivery_review','metrics':r['metrics'],'ledger_metrics':l['metrics'],'source_sha256':dict(sorted(pins.items())),'limits':r['limits']+l['limits'],'native_acceptance':False},indent=2)+'\n');print(json.dumps({'status':'frozen','manifest_sha256':sha(target),'receipt_sha256':sha(H/'receipt.json'),'pins':len(pins)}))
