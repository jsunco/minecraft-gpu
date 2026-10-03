"""Extract exact one-cable boundaries and screen a new delta against all parents."""
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
    entries=[]
    d=json.load(PARENT.open());world={P(v['position']):v for v in d['blocks']}
    wanted={'return_owner2_3'}
    rows=[v for v in d['blocks'] if d['nets'].get(K(P(v['position']))) in wanted and d['groups'].get(K(P(v['position'])),'').startswith('actual_')]
    routes=[r for r in d['return_routes'] if r['net'] in wanted]
    bindings=[r for r in d['return_bindings'] if (r['kind']=='retained_owner_live_busy' and r['channel']==2 and r['consumer']==3)]
    assert len(bindings)==1
    cable_keys={P(v['position']) for v in rows}
    for b in bindings:
        for n in ['source','destination']:
            p=P(b[n]);cable_keys.add(p);support=(p[0],p[1]-1,p[2]);assert support in world;cable_keys.add(support)
    info={'witnesses':entries,'cable_blocks':[world[p] for p in sorted(cable_keys)],'routes':routes,'bindings':bindings,'descents':[r for r in d['return_descents'] if r['net'] in wanted],'columns':[r for r in d['return_columns'] if r['net'] in wanted]}
    delta=make_delta(info);delta.update(parent_path=str(PARENT.relative_to(ROOT)),parent_sha256=sha(PARENT),required_inspection_recipe='artifacts/full-gpu-layout-v1/memory/feedback-composition-review-v1/composition.json')
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
    # Reconstruct ALL 80 complete return cables from the exact three-patch recipe.
    kinds={'actual_retained_response_joins','actual_owner_return_joins','actual_ready_source_joins','actual_typed_ready_field_joins','actual_retained_type_joins'}
    cable={P(v['position']):v['block'] for v in d['blocks'] if d['groups'][K(P(v['position']))] in kinds}
    bindings_all=json.loads(json.dumps(d['return_bindings']));assert len(bindings_all)==80
    trial0=json.load(TRIAL.open());remove0={P(v['position']) for v in trial0['removed']}
    for k in remove0:cable.pop(k,None)
    for b in trial0['connections']:
        if b['kind'] in ['retained_response','backend_ready']:
            cable.update({P(v['position']):v['block'] for v in trial0['blocks'] if v.get('part')==b['name']})
            for r in bindings_all:
                if r['channel']==0 and r['kind']==b['kind'] and r.get('bit')==b.get('bit'):r['source']=b['source']
    full={p:v['block'] for p,v in world.items()}
    for k in remove0:del full[k]
    full.update({P(v['position']):v['block'] for v in trial0['blocks']})
    for patchfile,field in [(PREVIOUS,'substitutions'),(H.parent/'return-feedback-extension-v1/delta.json','changes')]:
        patch=json.load(patchfile.open())
        for c in patch[field]:
            k=P(c['position']);assert full.get(k)==c['before']
            if c['after'] is None:del full[k];cable.pop(k,None)
            else:
                full[k]=c['after']
                if k in cable or patchfile.name=='delta.json' and field=='changes':cable[k]=c['after']
    for b in bindings_all:
        for n in ['source','destination']:
            k=P(b[n]);cable[k]=full[k];support=(k[0],k[1]-1,k[2]);cable[support]=full[support]
    assert len(full)==3337077
    save('all-transports.json',{'blocks':[{'position':POS(k),'block':b} for k,b in sorted(cable.items())],'bindings':bindings_all,'scope':'all80completephysicalconsumerreturncables;logicandretainedsourcesareexplicitboundaries'})
    del full,cable,trial0
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
    extension=json.load((H.parent/'return-feedback-extension-v1/delta.json').open());extension_conflicts=[r for r in extension['changes'] if P(r['position']) in halo]
    assert not conflicts and not prior_conflicts and not extension_conflicts,('overlay halo conflict',conflicts,prior_conflicts,extension_conflicts)
    for path in [H.parent/'return-feedback-extension-v1/delta.json',H.parent/'return-feedback-extension-v1/source-manifest.json',H.parent/'feedback-composition-review-v1/composition.json',H.parent/'feedback-composition-review-v1/source-manifest.json',H.parent/'repaired-return-handshake-v1/additional-cycle.json']:pins[str(path.relative_to(ROOT))]=sha(path)
    save('foreign-check.json',{'source_sha256':pins,'instances':inventory,'foreign_blocks':foreign,'halo_chebyshev_radius':3,'channel0_conflicts':conflicts,'frozen25_conflicts':prior_conflicts,'frozen22_conflicts':extension_conflicts,'channel0_removed':len(trial['removed']),'channel0_added':len(trial['blocks']),'native_acceptance':False})
    print(json.dumps({'metrics':delta['metrics'],'changes':len(delta['changes']),'foreign_cells':sum(r['cells_checked'] for r in inventory),'foreign_halo_cells':len(foreign),'other_overlay_conflicts':0}))
if __name__=='__main__':main()
