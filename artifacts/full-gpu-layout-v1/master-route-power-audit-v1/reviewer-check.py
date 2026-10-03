"""Bounded rule/fixture/report review; does not rerun the full route scan."""
from pathlib import Path
import json,hashlib
H=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r=json.loads((H/'audit.json').read_text());assert sha(H/'audit.json')=='b396d17b692078f951dac6a2ede217d39e3311d413b2bb53c814ceea8687ff31'
assert sha(H/'audit.py')==r['audit_sha256'];root=H.parents[2]
for p,h in r['source_rules'].items():assert sha(root/p)==h
ns={'__file__':str(H/'audit.py')};exec((H/'audit.py').read_text().split('assert fixture_checks()==11')[0],ns);assert ns['fixture_checks']()==11
P=ns['paths'];D=ns['TRAVEL'];S={'id':'minecraft:light_gray_concrete'};W={'id':ns['W']};q=(0,0,0);w=(0,1,0)
count=0
for kind in ns['DI']:
 for facing,v in D.items():
  src=tuple(-x for x in v);world={q:S,w:W,src:{'id':kind,'properties':{'facing':facing}}};assert P(world,{w})[0]=={(src,q,w)};count+=1
for kind in ns['T']:
 for src in ns['DIRS']:
  if src==w:continue
  got=P({q:S,w:W,src:{'id':kind}},{w})[0];assert bool(got)==(src==(0,-1,0));count+=1
assert sum(x['new_dust_cells']for x in r['reports'])==155472
assert sum(x['adjacent_solid_cells']for x in r['reports'])==155522
assert sum(x['all_strong_paths_to_new_dust']for x in r['reports'])==47
paths=0
for x in r['reports']:
 assert not(x['unexpected_paths']or x['missing_paths']or x['unmodeled_neighbor_types'])
 for v in x['every_path']:
  a,s,p=v['source'],v['solid'],v['new_dust'];assert a[0]==s[0]==p[0]and a[2]==s[2]==p[2]and a[1]+1==s[1]and s[1]+1==p[1];assert v['source_id']=='minecraft:redstone_torch';paths+=1
assert paths==47
out={'status':'bounded_rule_and_expected_path_review_pass','author_fixtures':11,'independent_oriented_source_cases':count,'declared_column_top_paths':47,'source_rules_checked':r['source_rules'],'full_route_scan_repeated':False,'native_acceptance':False}
(H/'reviewer-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
