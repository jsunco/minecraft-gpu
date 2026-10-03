"""Extract exact ten-cable boundaries and screen a new delta against all parents."""
from pathlib import Path
import json,hashlib,gc
from layout import P,POS,make_delta
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
K=lambda p:','.join(map(str,p))
save=lambda n,d:(H/n).write_text(json.dumps(d,separators=(',',':'))+'\n')
PARENT=H.parent/'master-cold-compatible-v2/design.json'
CENSUS=H.parents[1]/'repeater-feedback-census-v1/census.json'
CONFIG=CENSUS.parent/'config.json'
KNOWN=H.parent/'channel-colocation-v1/original-feedback-audit.json'
TRIAL=H.parent/'channel-colocation-v1/trial-design.json'
PREVIOUS=H.parent/'return-loop-repair-v1/delta.json'

def main():
    assert sha(PARENT)=='364c11e6e3c7e6deafbd8f279b1e95d6baed949a64a2e4f2cb4592c1bca1207f'
    assert sha(TRIAL)=='82807b31ecf540b7f65fff558ac9e0c30ef7b59b72c7fbe52c65e4e63ec78448'
    assert sha(PREVIOUS)=='4ed1204e9472bbc48765345c278468daa85fc1efbf3beea033f67ba0a52427d6'
    census=json.load(CENSUS.open());known={P(v['driver']) for v in json.load(KNOWN.open())['witnesses'] if v['feedback_found']}
    assert len(known)==34 and census['feedback_witnesses']==56
    entries=[v for v in census['witnesses'] if P(v['repeater']) not in known];assert len(entries)==22
    d=json.load(PARENT.open());world={P(v['position']):v for v in d['blocks']}
    wanted={d['nets'][K(P(v['repeater']))] for v in entries};assert len(wanted)==10
    for v in entries:
        k=K(P(v['repeater']));v.update(net=d['nets'][k],group=d['groups'][k],block=world[P(v['repeater'])]['block'])
    rows=[v for v in d['blocks'] if d['nets'].get(K(P(v['position']))) in wanted and d['groups'].get(K(P(v['position'])),'').startswith('actual_')]
    routes=[r for r in d['return_routes'] if r['net'] in wanted]
    bindings=[r for r in d['return_bindings'] if (r['kind']=='retained_owner_live_busy' and r['channel']==2 and r['consumer'] in [0,6]) or r['kind'] in ['read_ready','write_ready']]
    assert len(bindings)==10
    cable_keys={P(v['position']) for v in rows}
    for b in bindings:
        for n in ['source','destination']:
            p=P(b[n]);cable_keys.add(p);support=(p[0],p[1]-1,p[2]);assert support in world;cable_keys.add(support)
    info={'witnesses':entries,'cable_blocks':[world[p] for p in sorted(cable_keys)],'routes':routes,'bindings':bindings,'descents':[r for r in d['return_descents'] if r['net'] in wanted],'columns':[r for r in d['return_columns'] if r['net'] in wanted]}
    delta=make_delta(info);delta.update(parent_path=str(PARENT.relative_to(ROOT)),parent_sha256=sha(PARENT))
    changed={P(r['position']) for r in delta['changes']}
    for r in delta['changes']:
        p=P(r['position']);assert world.get(p,{}).get('block')==r['before'],('old/collision',p)
    # No exported parent pad may change, including nested aliases.
    coords=[]
    def visit(v):
        if isinstance(v,dict):
            if set(v)==set('xyz') and all(isinstance(v[a],int) for a in 'xyz'):coords.append(P(v))
            else:
                for x in v.values():visit(x)
        elif isinstance(v,list):
            for x in v:visit(x)
    visit(d['ports']);assert not changed.intersection(coords)
    halo=set()
    for x,y,z in changed:halo.update((x+dx,y+dy,z+dz) for dx in range(-3,4) for dy in range(-3,4) for dz in range(-3,4))
    info['affected_blocks']=[world[p] for p in sorted(halo) if p in world]
    info['affected_nets']={K(p):d['nets'].get(K(p)) for p in halo if p in world}
    info['parent_port_semantic_sha256']=hashlib.sha256(json.dumps(d['ports'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
    save('cable-slice.json',info);save('delta.json',delta)
    del d,world,rows;gc.collect()
    raw=CONFIG.read_bytes();(H/'selected-config.json').write_bytes(raw);config=json.loads(raw)
    pins={str(p.relative_to(ROOT)):sha(p) for p in [PARENT,CENSUS,CONFIG,KNOWN,TRIAL,PREVIOUS]};inventory=[];foreign=[]
    for i in config['instances']:
        if i['name']=='memory':assert i['sha256']==sha(PARENT);continue
        p=ROOT/i['path'];assert sha(p)==i['sha256'];pins[i['path']]=i['sha256'];d=json.load(p.open());off=P(i['translation']);hits=[]
        for r in d['blocks']:
            q=tuple(a+b for a,b in zip(P(r['position']),off))
            if q in halo:hits.append({'position':POS(q),'block':r['block'],'instance':i['name']})
        foreign.extend(hits);inventory.append({'instance':i['name'],'path':i['path'],'sha256':i['sha256'],'translation':i['translation'],'cells_checked':len(d['blocks']),'halo_cells':len(hits)})
        del d;gc.collect()
    trial=json.load(TRIAL.open());conflicts=[]
    for kind,rows in [('removed',trial['removed']),('added',trial['blocks'])]:
        for r in rows:
            if P(r['position']) in halo:conflicts.append({'kind':kind,'row':r})
    previous=json.load(PREVIOUS.open());prior_conflicts=[r for r in previous['substitutions'] if P(r['position']) in halo]
    assert not conflicts and not prior_conflicts,('overlay halo conflict',conflicts,prior_conflicts)
    save('foreign-check.json',{'source_sha256':pins,'instances':inventory,'foreign_blocks':foreign,'halo_chebyshev_radius':3,'channel0_conflicts':conflicts,'frozen25_conflicts':prior_conflicts,'channel0_removed':len(trial['removed']),'channel0_added':len(trial['blocks']),'native_acceptance':False})
    print(json.dumps({'metrics':delta['metrics'],'changes':len(delta['changes']),'foreign_cells':sum(r['cells_checked'] for r in inventory),'foreign_halo_cells':len(foreign),'other_overlay_conflicts':0}))
if __name__=='__main__':main()
