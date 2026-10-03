"""One complete owner2_3 prefix repair; no frozen generator edits."""
import importlib.util
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'return-feedback-extension-v1/layout.py';s=importlib.util.spec_from_file_location('prior_layout',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
P,POS,W,R,S,F,path=m.P,m.POS,m.W,m.R,m.S,m.F,m.path

def make_delta(info):
 old={P(v['position']):v['block'] for v in info['cable_blocks']};r=next(v for v in info['routes'] if v['name']=='owner2_3_low');p=list(map(P,r['path']));assert p[0]==(544,-15,495)
 end=(529,-15,500);p=p[:p.index(end)+1];q=path([p[0],(544,-15,507),(529,-15,507),end]);assert len(p)==31 and len(q)==35
 reps=[1,3,15,28];assert sum(old[v]['id']==R for v in p)==4
 before={};after={}
 for v in p:
  for a in [v,(v[0],v[1]-1,v[2])]:before[a]=old[a]
 for i,v in enumerate(q):
  b={'id':W}
  if i in reps:
   a,c=q[i-1],q[i+1];assert (v[0]-a[0],v[2]-a[2])==(c[0]-v[0],c[2]-v[2]);b={'id':R,'properties':{'facing':F[(c[0]-v[0],c[2]-v[2])],'delay':'1'}}
  after[v]=b;after[(v[0],v[1]-1,v[2])]={'id':S}
 changes=[{'position':POS(v),'before':before.get(v),'after':after.get(v)} for v in sorted(set(before)|set(after)) if before.get(v)!=after.get(v)]
 return {'status':'offline_longer_return_feedback_repair_candidate','changes':changes,'segments':[{'name':'owner2_3','kind':'retained_owner','old_path':list(map(POS,p)),'new_path':list(map(POS,q)),'repeaters':reps,'routes_changed':['owner2_3_low'],'old_repeater_count':4,'new_repeater_count':4,'nominal_series_diode_ticks':8}], 'metrics':{'segments':1,'old_segment_cells':len(before),'new_segment_cells':len(after),'cell_delta':len(after)-len(before),'old_repeaters':4,'new_repeaters':4,'storage_delta':0},'native_acceptance':False}
