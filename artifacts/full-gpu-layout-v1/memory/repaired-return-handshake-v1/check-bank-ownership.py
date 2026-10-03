"""Actual owner-export and ACTIVE-epoch paths, kept separate from event claims."""
from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;M=H.parent;ROOT=H.parents[3];helper=M/'program-rom-timing-v1/check.py'
s=importlib.util.spec_from_file_location('dag',helper);g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
files=[helper,M/'bank-sampled-admission-v1/bank.json',Path(__file__).resolve()]
d=json.load(open(files[1]));world={g.P(v['position']):v['block'] for v in d['blocks']};nets={tuple(map(int,k.split(','))):v for k,v in d['nets'].items()};built=g.build(world);g.build=lambda _:built
reports={};witness={}
def run(name,src,dst,ns,require_all=True):
 allowed={p for p,n in nets.items() if n in ns};allowed.update(src+dst)
 r,w=g.analyze(world,src,dst,allowed,require_all=require_all)
 assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,r)
 r.update(source_positions=src,target_positions=dst,allowed_nets=sorted(ns));reports[name]=r;witness[name]=w
 print(name,[(v['potential_dependency_nominal_min_ticks'],v['potential_dependency_nominal_max_ticks']) for v in r['paths']],flush=True)
for i,z in enumerate([-114,-111,-108,-102]):
 run('owner_Q_to_busy_identity_'+str(i),[(44,-52+4*i,-240)],[(100,-52+4*i,z)],{'owner/owner'+str(i),'owner/not_owner'+str(i),'not_owner'+str(i)})
run('common_epoch_to_bank_ACTIVE',[(14,-45,-450)],[(8,-41,-454)],{'sequence_active_flush'})
run('common_epoch_to_bank_tail_export',[(14,-45,-450)],[(10,-41,-454)],{'sequence_active_flush','sequence_active_delayed_flush'})
out={'status':'actual_owner_identity_and_epoch_paths_nominal_only','paths':reports,'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},'limitations':['Retained owner repeater output is a boundary; cost of acquiring its state is counted separately.','The common epoch is traced to actual ACTIVE and tail exports; their metadata names are not substituted for physical paths.','These normal-mode paths require reset and unrelated owner values stable, and are not arbitrary-state cold or native proofs.']}
(H/'bank-ownership-paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'bank-ownership-witnesses.json').write_text(json.dumps(witness)+'\n')
