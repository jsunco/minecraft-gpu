"""Source-bound order comparison, never a runtime memory implementation."""
from pathlib import Path
from itertools import product
import hashlib,json,sys
H=Path(__file__).resolve().parent;R=H.parents[3]
def upstream_helper(ops):
    # memory.py string parsing visits packed physical channel3 first. All read
    # results are computed before any write is applied in this helper call.
    memory=0xc3;reads={c:memory for c,t in enumerate(ops)if t=='R'}
    for c in reversed(range(4)):
        if ops[c]=='W':memory=0x11*(c+1)
    return reads,memory

def bank_stable_priority(ops):
    # Settled eligible slots0..3, one operation at a time; not an arrival/timing
    # proof of the physical priority capture. Lower channel has fixed priority.
    memory=0xc3;reads={}
    for c,t in enumerate(ops):
        if t=='R':reads[c]=memory
        elif t=='W':memory=0x11*(c+1)
    return reads,memory
all_ops=list(product('IRW',repeat=4));diff=[]
for ops in all_ops:
    a,b=upstream_helper(ops),bank_stable_priority(ops)
    if a!=b:diff.append({'operations':ops,'helper':a,'serialized_bank':b})
assert upstream_helper(('W','R','I','I'))==({1:0xc3},0x11)
assert bank_stable_priority(('W','R','I','I'))==({1:0x11},0x11)
assert upstream_helper(('W','I','I','W'))==({},0x11)
assert bank_stable_priority(('W','I','I','W'))==({},0x44)
# Independent address separation makes both schedules agree without claiming
# a general happens-before or fairness rule.
for ops in all_ops:
    before=[0xc3]*4;helper=before.copy();serial=before.copy();rh={};rs={}
    for c,t in enumerate(ops):
        if t=='R':rh[c]=before[c]
    for c in reversed(range(4)):
        if ops[c]=='W':helper[c]=0x11*(c+1)
    for c,t in enumerate(ops):
        if t=='R':rs[c]=serial[c]
        if t=='W':serial[c]=0x11*(c+1)
    assert(helper,rh)==(serial,rs)
paths=['reference/tiny-gpu/src/controller.sv','reference/tiny-gpu/test/helpers/memory.py',str(H.relative_to(R)/'contract-excerpt.json')]
out={'status':'offline_conflict_order_comparison','source_sha256':{p:hashlib.sha256((R/p).read_bytes()).hexdigest()for p in paths},'same_word_stable_request_sets':len(all_ops),'differing_outcomes':len(diff),'examples':diff[:4],'disjoint_word_sets_equal':len(all_ops),'original_global_allocation_preserved_in_parent':True,'helper_conflict_order_equivalent':False,'priority_caveat':'Only already-stable requests are ordered by the local priority encoder. Physical arrival/capture races and starvation are not solved by this calculation.','contract_scope':'Original controller is an external-memory interface; same-address races have no portable ISA winner. Explicit physical serialization remains unselected and must never be labeled helper-race equivalent.','native_acceptance':False}
print(json.dumps(out))
if '--save'in sys.argv:(H/'conflict-checks.json').write_text(json.dumps(out,indent=2)+'\n')
