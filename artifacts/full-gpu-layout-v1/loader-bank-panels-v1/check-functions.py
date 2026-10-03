"""Actual loading panel electrical functions. Held grant, pre-run switches only."""
import ast
import hashlib
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
BASE=HERE.parent
ENGINE=BASE/'memory/typed-request-review-v1/check.py'
allowed={'P','ADD','NEG','FACING','FLIP','HORIZONTAL','UP','DOWN','NEIGHBOURS','WIRE','REP','COMP','TORCH','WALL','RED','LEVER'}
nodes=[]
for node in ast.parse(ENGINE.read_text()).body:
    if isinstance(node,(ast.Import,ast.ImportFrom,ast.FunctionDef)):nodes.append(node)
    elif isinstance(node,ast.Assign):
        names={n.id for target in node.targets for n in ast.walk(target) if isinstance(n,ast.Name)}
        if names and names<=allowed:nodes.append(node)
ns={};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(ENGINE),'exec'),ns)
read=lambda p:json.loads(p.read_text())
P=ns['P'];compile_cone=ns['compile_cone'];variable=ns['variable'];inputs=ns['inputs']
d=read(HERE/'delta.json');parent=ROOT/d['parent']['path']
assert hashlib.sha256(parent.read_bytes()).hexdigest()==d['parent']['sha256']
world={P(v['position']):v['block'] for v in read(parent)['blocks']}
world.update({P(v['position']):v['block'] for v in d['blocks']})
reference=read(BASE/'loader-program-colocation-v1/reference-scope.json')
old={P(v['position']):v['block'] for v in reference['blocks']+reference['foreign_context']}
reports=[];negatives=[]
for panel in d['panels']:
    bank=panel['bank'];models=[]
    for name,w,paneldata in [('original',old,panel['original']),('current',world,panel)]:
        switches=paneldata['switches'];assert len(switches)==14
        roles=[P(v['position']) for v in switches]+[P(paneldata['strobe']),P(paneldata['grant'])]
        assert all(w[p]['id']==ns['LEVER'] for p in roles[:15])
        outs=list(map(P,paneldata['write_address']+paneldata['write_data']))+[P(paneldata['write_valid'])]
        logic,numeric,graph=compile_cone(w,outs,set(roles))
        width=65536;full=(1<<width)-1
        # Repeated bit patterns avoid building 16 huge sums of shifted integers.
        variables=[]
        for bit in range(16):
            stride=1<<bit;v=0;pattern=((1<<stride)-1)<<stride
            for start in range(0,width,2*stride):v|=pattern<<start
            variables.append(v)
        wanted=[full if bank&(1<<bit) else 0 for bit in range(2)]+variables[:14]+[variables[14]&variables[15]]
        actual=logic(dict(zip(roles,variables)),width)
        assert [actual[p] for p in outs]==wanted,(bank,name,'truth table')
        # Each cone is disjoint except grant/strobe; exercise all byte and local
        # address values plus every gated strobe combination in numeric model.
        cases=[(a,0,0,0) for a in range(64)]+[(0,v,0,0) for v in range(256)]+[(63,255,s,g) for s in range(2) for g in range(2)]
        low=15
        for address,value,strobe,grant in cases:
            assignment=address|(value<<6)|(strobe<<14)|(grant<<15)
            result,rear=numeric({p:15 if assignment&(1<<i) else 0 for i,p in enumerate(roles)})
            expected=[15 if ((address<<2)|bank)&(1<<bit) else 0 for bit in range(8)]+[15 if value&(1<<bit) else 0 for bit in range(8)]+[15 if strobe and grant else 0]
            assert [result[p] for p in outs]==expected,(bank,name,assignment,result,expected)
            low=min(low,rear)
        models.append({'name':name,'graph':graph,'exhaustive_boolean_assignments':width,'numeric_assignments':len(cases),'outputs':17,'minimum_positive_rear':low})
        if name=='current':
            clamp_values=dict(zip(roles,variables))
            # Reverse each actual immediate bank driver; downstream assertion
            # must reject either loss of function or unsupported cone boundary.
            driver_positions=[]
            for bit,p in enumerate(outs):
                source=list(inputs(w,p));assert len(source)==1,(p,source)
                q=source[0];assert w[q]['id']==ns['REP'];driver_positions.append(q)
                saved=w[q];w[q]={**saved,'properties':{**saved['properties'],'facing':ns['FLIP'][saved['properties']['facing']]}}
                try:
                    try:
                        bad,_,_=compile_cone(w,outs,set(roles))
                        changed=[bad(clamp_values,width)[r] for r in outs]!=wanted
                    except AssertionError:changed=True
                    # Fixed-zero bank-select bits remain logically zero after a
                    # broken wire; use mandatory physical edge loss for those.
                    assert changed or (bit<2 and not bank&(1<<bit) and q not in inputs(w,p))
                    negatives.append({'bank':bank,'output':bit,'position':q,'mutation':'reverse_actual_bank_driver','refused':True})
                finally:w[q]=saved
            gate=[P(v['position']) for v in d['blocks'] if v['group']==f'loader/bank{bank}_loader_strobe' and v['block']['id']==ns['COMP']]
            assert len(gate)==1;q=gate[0];saved=w[q]
            w[q]={**saved,'properties':{**saved['properties'],'mode':'compare'}}
            try:
                try:compile_cone(w,outs,set(roles))
                except AssertionError:negatives.append({'bank':bank,'position':q,'mutation':'subtract_to_compare','refused':True})
                else:raise AssertionError('wrong comparator mode survived')
            finally:w[q]=saved
    reports.append({'bank':bank,'models':models})
    print(json.dumps(reports[-1]),flush=True)
assert len(negatives)==72
assert ns['store_map'](world)==ns['store_map']({P(v['position']):v['block'] for v in read(parent)['blocks']})
pins={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [parent,ENGINE,HERE/'check-functions.py',HERE/'delta.json',BASE/'loader-program-colocation-v1/reference-scope.json']}
report={'status':'passed_actual_original_and_current_panel_functions','banks':reports,'negative_cases':negatives,'all_2352_parent_store_lock_identities_preserved':len(ns['store_map'](world))==2352,'source_sha256':pins,'limits':['Grant remains an actual undriven current pad; holding it as a boundary does not bind loader ownership. Switches are pre-run configuration inputs.','Only settled loading port functions are checked; no bank write, captured data, READY handshake, panel readback, state transition or native run is claimed.','The eight fixed bank-select source blocks remain actual geometry; no software value supplies the runtime GPU.'],'native_acceptance':False,'world_mutations':0}
assert report['all_2352_parent_store_lock_identities_preserved']
(HERE/'function-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':report['status'],'banks':4,'assignments_per_original_current_model':262144,'numeric_cases_per_model':1296,'mutations':72,'stores':2352}))
