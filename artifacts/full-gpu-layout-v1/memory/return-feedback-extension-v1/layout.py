"""Pure local cable reroute for ten identified return nets; no native imports."""
P=lambda p:tuple(p[a] for a in 'xyz')
POS=lambda p:dict(zip('xyz',p))
W='minecraft:redstone_wire';R='minecraft:repeater';S='minecraft:light_gray_concrete'
F={(1,0):'west',(-1,0):'east',(0,1):'north',(0,-1):'south'}

def path(points):
    out=[points[0]]
    for a,b in zip(points,points[1:]):
        assert a[1]==b[1]
        dx,dz=b[0]-a[0],b[2]-a[2];assert not dx or not dz
        for n in range(1,abs(dx)+abs(dz)+1):
            out.append((a[0]+(1 if dx>0 else -1 if dx<0 else 0)*n,a[1],a[2]+(1 if dz>0 else -1 if dz<0 else 0)*n))
    return out

def make_delta(d):
    old={P(v['position']):v['block'] for v in d['cable_blocks']}
    routes={r['name']:list(map(P,r['path'])) for r in d['routes']}
    groups=[]
    for name in ['owner2_0','owner2_6']:
        p=routes[name+'_low'];x,y,z=p[0];assert x==544
        end=(529,y,z+5);ix=p.index(end)
        q=path([p[0],(544,y,z+12),(529,y,z+12),end])
        assert len(q)==35 and ix==30
        groups.append({'name':name,'kind':'retained_owner','old_path':p[:ix+1],'new_path':q,'repeaters':[1,13,26],'routes_changed':[name+'_low']})
    for ch in range(4):
        for bit in range(2):
            name=f'typed{ch}_{bit}';escape=routes[name+'_escape'];low=routes[name+'_low']
            x,y,z=escape[0];assert escape[-1]==low[0]
            end=(x-4,y,z-1);ix=low.index(end)
            p=escape+low[1:ix+1]
            q=path([(x,y,z),(x,y,z-1),end])
            assert len(q)==6
            groups.append({'name':name,'kind':'typed_ready','old_path':p,'new_path':q,'repeaters':[0,2,4],'routes_changed':[name+'_escape',name+'_low']})
    removed={};new={};forbidden=set();records=[]
    for r in groups:
        p,q=r['old_path'],r['new_path'];old_count=sum(old[v]['id']==R for v in p)
        assert old_count in ([4] if r['name']=='typed3_1' else [3]),(r['name'],old_count)
        if old_count==4:r['repeaters']=[0,2,3,4]
        for pos in p:
            for v in [pos,(pos[0],pos[1]-1,pos[2])]:
                assert v in old
                assert v not in removed,'Overlapping repair prefixes'
                removed[v]=old[v]
        for i,pos in enumerate(q):
            if i in r['repeaters']:
                if i==0:travel=(0,-1)
                else:travel=(pos[0]-q[i-1][0],pos[2]-q[i-1][2])
                b={'id':R,'properties':{'facing':F[travel],'delay':'1'}}
            else:b={'id':W}
            for v,block in [(pos,b),((pos[0],pos[1]-1,pos[2]),{'id':S})]:
                assert v not in new
                new[v]=block
        records.append({**r,'old_path':[POS(v) for v in p],'new_path':[POS(v) for v in q],'old_repeater_count':old_count,'new_repeater_count':len(r['repeaters']),'nominal_series_diode_ticks':2*old_count})
    # Keep matching cells unchanged; make before/after absence explicit.
    changes=[]
    for pos in sorted(set(removed)|set(new)):
        before=removed.get(pos);after=new.get(pos)
        if before!=after:changes.append({'position':POS(pos),'before':before,'after':after})
    return {'status':'offline_additional_return_feedback_repair_candidate','changes':changes,'segments':records,'metrics':{'segments':len(groups),'old_segment_cells':len(removed),'new_segment_cells':len(new),'cell_delta':len(new)-len(removed),'old_repeaters':sum(r['old_repeater_count'] for r in records),'new_repeaters':sum(r['new_repeater_count'] for r in records),'storage_delta':0},'native_acceptance':False}
