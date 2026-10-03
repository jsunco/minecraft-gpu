"""Future physical test images and software expected answers; no game access."""
from pathlib import Path
import sys,json,hashlib,ast
ROOT=Path(__file__).resolve().parents[3];sys.path.insert(0,str(ROOT))
from hardware.reference_model import ReferenceGPU,Opcode as O,encode,load_fixture,UPSTREAM_COMMIT,N,Z,P,UndefinedOperation,DivergentBranch
H=Path(__file__).resolve().parent;cases=[]
RET=encode(O.RET)
def add(name,program,data,threads,expected_changes,*,description,reserved=False):
 initial=list(data)+[0]*(256-len(data));words=list(program)+[0]*(256-len(program));assert len(initial)==len(words)==256
 expected=initial[:]
 for a,v in expected_changes.items():expected[a]=v
 result=ReferenceGPU(words,initial,reserved_as_nop=reserved).run(threads,max_instructions=10000)
 assert result.memory==expected,name
 cases.append({'name':name,'description':description,'program':words,'data':initial,'thread_count':threads,'expected_memory':expected,'expected_blocks':(threads+3)//4,'expected_logical_thread_masks':[min(4,threads-4*b)for b in range((threads+3)//4)],'oracle_retired_core_instructions':result.retired_instructions,'oracle_final_registers':[{'block':b.block_id,'lanes':[l.registers for l in b.lanes],'flags':[l.nzp for l in b.lanes]}for b in result.blocks],'reserved_as_nop':reserved,'software_expected_only':True,'physical_result':None})
for name in ['matadd','matmul']:
 f=load_fixture(name);tree=ast.parse((ROOT/'reference/tiny-gpu'/f['source_path']).read_text());a={n.targets[0].id:ast.literal_eval(n.value)for n in ast.walk(tree)if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name)and n.targets[0].id in ['program','data','threads']};assert all(a[k]==f[k]for k in a);assert f['source_commit']==UPSTREAM_COMMIT
 add('original_'+name,f['program'],f['data'],f['threads'],dict(enumerate(f['expected'],f['output_address'])),description='Exact upstream encoded program, stimulus and asserted result; zero-fill every other RAM/ROM location explicitly.')
f=load_fixture('matadd');a=[255,254,128,127,0,1,170,85];b=[1,3,128,129,255,254,85,171];add('matadd_changed_overflow',f['program'],a+b,8,{16+i:(a[i]+b[i])&255 for i in range(8)},description='Same original words, changed input image including overflow; rejects hardcoded example output.')
f=load_fixture('matmul');a=[255,2,128,7];b=[3,129,4,255];expected={8+2*r+c:sum(a[2*r+k]*b[2*k+c]for k in range(2))&255 for r in range(2)for c in range(2)};add('matmul_changed_overflow',f['program'],a+b,4,expected,description='Same original loop/branch program; independently calculated dot products modulo256.')
identity=[encode(O.MUL,rd=0,rs=13,rt=14),encode(O.ADD,rd=0,rs=0,rt=15),encode(O.STR,rs=0,rt=0),RET]
for t in [0,1,2,3,4,5,7,8,9,255]:add('thread_identity_'+str(t),identity,[165]*256,t,{i:i for i in range(t)},description='Physical lane IDs, block IDs, R14=4, partial masks, both cores and reuse; inactive output addresses retain165.')
for op,a,b,val in [(O.ADD,255,1,0),(O.SUB,0,1,255),(O.SUB,128,255,129),(O.MUL,255,255,1),(O.MUL,16,16,0),(O.DIV,255,2,127),(O.DIV,17,5,3),(O.DIV,1,2,0)]:
 words=[encode(O.CONST,rd=0,immediate=a),encode(O.CONST,rd=1,immediate=b),encode(op,rd=0,rs=0,rt=1),encode(O.CONST,rd=2,immediate=255),encode(O.STR,rs=2,rt=0),RET]
 add('alu_'+op.name.lower()+'_'+str(a)+'_'+str(b),words,[90]*256,1,{255:val},description='Arithmetic boundary with read-before-write operand alias; stores result at highest RAM address.')
for a,b,flag in [(0,255,N),(255,0,P),(127,127,Z)]:
 for mask in [0,N,Z,P,7]:
  # All four lanes agree on this branch. Put a discriminator in lane-specific output.
  words=[encode(O.CONST,rd=0,immediate=a),encode(O.CONST,rd=1,immediate=b),encode(O.CMP,rs=0,rt=1),encode(O.CONST,rd=2,immediate=11),encode(O.BR,nzp=mask,immediate=6),encode(O.CONST,rd=2,immediate=22),encode(O.STR,rs=15,rt=2),RET]
  add(f'cmp_{a}_{b}_mask{mask}',words,[165]*256,4,{i:11 if mask&flag else 22 for i in range(4)},description='Unsigned corrected CMP, absolute branch, mask0 and flags retained through CONST.')
words=[encode(O.CONST,rd=4,immediate=255),encode(O.LDR,rd=4,rs=4),encode(O.STR,rs=0,rt=4),RET];data=[0]*256;data[255]=173
add('load_address_alias_255',words,data,1,{0:173},description='LDR R4,R4 uses old R4 as address and then overwrites it; address255 remains173.')
words=[encode(O.CONST,rd=r,immediate=99)for r in [13,14,15]]+[encode(O.MUL,rd=0,rs=13,rt=14),encode(O.ADD,rd=0,rs=0,rt=15),encode(O.STR,rs=0,rt=0),RET]
add('protected_ids',words,[165]*256,9,{i:i for i in range(9)},description='Protected R13/R14/R15 ignore CONST writes across two cores and reused partial block.')
words=[encode(O.ADD,rd=0,rs=0,rt=14),encode(O.CONST,rd=1,immediate=8),encode(O.CMP,rs=0,rt=1),encode(O.BR,nzp=Z,immediate=6),encode(O.BR,nzp=7,immediate=255),0,encode(O.CONST,rd=2,immediate=254),encode(O.STR,rs=2,rt=0),RET]+[0]*247
add('pc_wrap_255_to_0',words,[165]*256,1,{254:8},description='First loop jumps to255 then NOP wraps to0; second iteration exits with R0=8.')
add('nop_reserved_ignored_fields',[0x0fff,0xafff,0xbfff,0xcfff,0xdfff,0xefff,0xffff],[165]*256,1,{},description='NOP/RET ignored fields and reserved A-E retain pinned decoder NOP-like behavior.',reserved=True)
assert len({c['name']for c in cases})==len(cases)
faults=[]
for name,words,threads,error in [('divide_by_zero',[encode(O.DIV,rd=1,rs=0,rt=0),RET],1,UndefinedOperation),('active_lane_divergence',[encode(O.CMP,rs=15,rt=0),encode(O.BR,nzp=Z,immediate=3),RET,RET],4,DivergentBranch)]:
 try:ReferenceGPU(words).run(threads)
 except error:pass
 else:raise AssertionError(name)
 faults.append({'name':name,'program':words+[0]*(256-len(words)),'data':[0]*256,'thread_count':threads,'expected':'retained fault and no successful kernel DONE/warm reset ACK; explicit destructive BOOT plus complete reload required','software_guard_confirmed':True,'physical_result':None})
pins={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in [Path(__file__).resolve(),ROOT/'hardware/reference_model.py',ROOT/'hardware/fixtures/original_matadd.json',ROOT/'hardware/fixtures/original_matmul.json',ROOT/'reference/tiny-gpu/test/test_matadd.py',ROOT/'reference/tiny-gpu/test/test_matmul.py']}
r={'status':'future_physical_acceptance_images_with_software_oracle_checks_only','source_commit':UPSTREAM_COMMIT,'cases':cases,'fault_cases':faults,'source_sha256':pins,'physical_runs':0,'native_acceptance':False,'complete_gpu_layout':False,'limits':['Expected answers and instruction counts are generated offline; none are physical evidence or elapsed-time bounds.','Do not write expected_memory or oracle registers into a running GPU. Only program/data/thread_count are pre-run input images.','RAM is fully initialized through actual loading panels; ROM changes only while program grant is held; source map must match selected machine.','Physical evidence must record actual commit/fault/DONE/readback transitions, full all256 final bytes and all active ticking coverage. Core assignment timing can differ; compare block/lane architectural behavior, not deterministic oracle core interleaving.']}
(H/'cases.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'valid_cases':len(cases),'fault_cases':len(faults),'software_expected_only':True,'physical_runs':0}))
