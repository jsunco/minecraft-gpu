// Actual front-end path accounting. This is nominal arithmetic, not an event simulator.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const H=new URL('.',import.meta.url),ROOT=new URL('../../../',H);
const read=p=>JSON.parse(readFileSync(new URL(p,ROOT))),sha=p=>createHash('sha256').update(readFileSync(new URL(p,ROOT))).digest('hex');
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,add=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z);
const files=['control-fetch-v1','control-front-v1','control-held-ir-v1'].map(n=>'artifacts/full-gpu-layout-v1/'+n+'/design.json');
const [fetch,front,ir]=files.map(read),models=new Map(),rows=[],checkedCells=new Map();
const move={fetch:P(80,0,170),ir:P(120,0,80)};
function model(d){return {d,blocks:new Map(d.blocks.map(v=>[K(v.position),v.block])),edges:new Set(d.edges.map(e=>K(e.from)+'>'+K(e.to)))};}
const f=model(fetch),i=model(ir),fr=model(front);models.set('fetch',f);models.set('ir',i);models.set('front',fr);
function route(m,n){const r=m.d.routes.find(r=>r.name===n);assert(r,n);return r.path;}
function gateRear(g){return [g.rear,P(g.center.x-1,g.center.y,g.center.z),g.center,P(g.center.x+1,g.center.y,g.center.z),g.out];}
function gateSide(g){return [g.side,P(g.center.x,g.center.y,g.center.z-1),g.center,P(g.center.x+1,g.center.y,g.center.z),g.out];}
function combine(...parts){const out=[];for(const ps of parts){if(out.length)assert.equal(K(out.at(-1)),K(ps[0]),'Segment join');out.push(...ps.slice(out.length?1:0));}return out;}
function inverter(m,s,t){const b=m.blocks.get(K(t));assert.equal(b?.id,'minecraft:redstone_wall_torch');const v={south:[0,1],north:[0,-1],east:[1,0],west:[-1,0]}[b.properties.facing];assert.deepEqual(t,P(s.x+v[0],s.y,s.z+v[1]));assert(m.blocks.get(K(s))?.id.endsWith('_concrete'));m.edges.add(K(s)+'>'+K(t));}
inverter(f,P(40,1,-32),P(40,1,-31));inverter(i,P(6,1,-85),P(6,1,-84));
function value(name,m,ps){let ticks=0,inversions=0,devices=0;const unique=new Set();for(let n=0;n<ps.length;n++){const p=ps[n],b=m.blocks.get(K(p));assert(b,name+' missing '+K(p));assert(!unique.has(K(p)),name+' repeated node');unique.add(K(p));if(n){assert(m.edges.has(K(ps[n-1])+'>'+K(p)),name+' undeclared edge '+K(ps[n-1])+'>'+K(p));let dt=0;if(b.id==='minecraft:repeater'){assert([1,2,3,4].includes(Number(b.properties.delay)));dt=2*Number(b.properties.delay);}else if(['minecraft:comparator','minecraft:redstone_torch','minecraft:redstone_wall_torch'].includes(b.id))dt=2;ticks+=dt;if(dt)devices++;if(b.id.includes('torch'))inversions++;}}
 const origin=m===f?move.fetch:m===i?move.ir:P(0,0,0);for(const p of ps){const position=add(p,origin),block=m.blocks.get(K(p)),previous=checkedCells.get(K(position));if(previous)assert.deepEqual(previous.block,block,'Subcomponent disagreement');else checkedCells.set(K(position),{position,block});}
 const result={name,source:ps[0],destination:ps.at(-1),nominal_ticks:ticks,scheduled_devices:devices,inversions,actual_cells:ps.length};rows.push(result);return {result,path:ps};}
const g=Object.fromEntries(fetch.gates.map(g=>[g.name,g]));
const readyResponse=value('fetch_ready_to_response',f,combine([P(40,1,-34),P(40,1,-33),P(40,1,-32),P(40,1,-31),P(40,1,-30),P(40,1,-29),P(40,1,-28)],route(f,'not_ready_to_response'),gateSide(g.response_present)));
const responseOpen=value('response_to_capture_open',f,combine([P(42,1,0),P(42,1,1),P(42,1,2)],route(f,'response_to_open'),gateRear(g.ir_capture_request)));
const delay=d=>[d.input,...d.cells,d.output],d0=fetch.delays[0],d1=fetch.delays[1];
const responseTail=combine(route(f,'response_to_delay'),delay(d0));
const responseClose=value('response_to_capture_close',f,combine(responseTail,[P(114,1,0),P(114,1,1),P(114,1,2)],route(f,'capture_tail_to_open_mask'),gateSide(g.ir_capture_request)));
const heldToLock=combine([g.captured_hold.center,P(1,1,-20),g.captured_hold.out],route(f,'hold_to_lock'),[P(25,1,-18),P(25,1,-17)]);
const toCaptured=combine(responseTail,delay(d1),route(f,'close_tail_to_hold_mask'),[P(0,1,-22),P(0,1,-21),P(0,1,-20)],heldToLock,[P(25,1,-17),P(25,1,-16),P(26,1,-16)]);
// The side-lock releases the stored repeater; its actual rear D must already be held 1.
const responseValidLow=value('response_to_captured_then_valid_low',f,combine(toCaptured,[P(26,1,-16),P(26,1,-15),P(26,1,-14)],route(f,'captured_to_valid_mask'),gateSide(g.memory_valid)));
const frontendRoute=value('fetch_open_to_ir_F',fr,route(fr,'fetch_to_ir_open'));
assert.deepEqual(frontendRoute.path[0],add(g.ir_capture_request.out,move.fetch));
assert.deepEqual(frontendRoute.path.at(-1),add(ir.ports.fetch_open_request.bits[0].position,move.ir));
const ig=ir.barrier.open;
const fToPad=value('ir_F_to_OPEN_pad',i,combine(route(i,'fetch_to_open_delayed'),[ig.rear,P(49,1,-100),ig.center,P(51,1,-100),ig.out],route(i,'open_to_bank')));
const inputPaths=[],lockPaths=[];
for(const cell of ir.cells){
 const b=ir.lockBranches.find(b=>b.bit===cell.bit),rail=ir.holdRail.map(v=>v.position),end=rail.findIndex(p=>K(p)===K(b.rail));assert(end>=0);
 const branch=i.d.edges.filter(e=>K(e.from)===K(b.rail)&&K(e.to)===K(b.branch));assert.equal(branch.length,1);
 const side=cell.side?1:-1,dust=[b.first_wire,P(b.first_wire.x+side,1,b.first_wire.z),P(b.first_wire.x+2*side,1,b.first_wire.z)];
 lockPaths.push(value('IR_OPEN_pad_to_lock_bit'+cell.bit,i,[P(6,1,-87),P(6,1,-86),P(6,1,-85),P(6,1,-84),P(6,1,-83),P(6,1,-82),...rail.slice(0,end+1),b.branch,...dust,b.lock]));
 const dx=cell.side?-1:1;inputPaths.push(value('IR_input_to_stored_Q_bit'+cell.bit,i,[cell.input,P(cell.input.x+dx,1,cell.input.z),P(cell.input.x+2*dx,1,cell.input.z),cell.driver,cell.storage,cell.q]));
 assert.deepEqual(front.ports.program_data.bits[cell.bit].position,add(cell.input,move.ir));
}
const dataPath='artifacts/full-gpu-layout-v1/master-program-data-v1/nominal-route-timing.json',readyPath='artifacts/full-gpu-layout-v1/master-program-ready-v1/checks.json',validPath='artifacts/full-gpu-layout-v1/master-program-request-v1/checks.json';
const data=read(dataPath),ready=read(readyPath).nominal_timing,valid=read(validPath).nominal_timing;
const sums=[];
for(let core=0;core<2;core++)for(let bit=0;bit<16;bit++){
 const dr=data.routes.find(r=>r.name==='program_data_bit'+bit+'_core'+core),rr=ready.routes[core],vr=valid.routes[core];assert(dr&&rr&&vr);
 const l=lockPaths[bit].result.nominal_ticks,q=inputPaths[bit].result.nominal_ticks,shared=rr.nominal_max_ticks+readyResponse.result.nominal_ticks+frontendRoute.result.nominal_ticks+fToPad.result.nominal_ticks+l;
 const opens=shared+responseOpen.result.nominal_ticks,closes=shared+responseClose.result.nominal_ticks;
 const release=rr.nominal_max_ticks+readyResponse.result.nominal_ticks+responseValidLow.result.nominal_ticks,ownerSees=release+vr.nominal_max_ticks;
 const earliestDependencyQ=dr.nominal_max_ticks+q,captureQ=Math.max(earliestDependencyQ-2,opens)+2;
 sums.push({core,bit,conditional_data_Q_dependency_time_if_open:earliestDependencyQ,conditional_capture_Q_time: captureQ,conditional_lock_open_time:opens,conditional_lock_close_time:closes,conditional_capture_Q_to_close:closes-captureQ,valid_withdrawal_time:release,owner_valid_withdrawal_arrival_time:ownerSees,lock_close_to_local_valid_withdrawal:release-closes,lock_close_to_owner_valid_withdrawal:ownerSees-closes});
}
// Corrupt an inherited device delay and a path edge to ensure the checker is reading geometry.
let negative=0;const changed=structuredClone(f);changed.blocks.set('50,1,0',{id:'minecraft:repeater',properties:{facing:'west',delay:'5'}});assert.throws(()=>value('bad_delay',changed,responseTail));negative++;
const cut={...f,edges:new Set(f.edges)};cut.edges.delete('50,1,0>51,1,0');assert.throws(()=>value('cut_chain',cut,responseTail));negative++;
const fake=model(ir);assert.throws(()=>inverter(fake,P(6,1,-85),P(6,1,-83)));negative++;
const out={status:'actual_frontend_paths_nominally_accounted_not_timing_acceptance',paths:rows,per_bit:sums,negative_refusals:negative,source_sha256:Object.fromEntries([...files,dataPath,readyPath,validPath].map(p=>[p,sha(p)])),assumptions:['For the displayed cross-module time origin only, DATA common support and owned READY producer are assumed to launch together. Producer relation is an independent required check.','Actual response gate is sensitized by held VALID and READY; prior fetch/decode tails are empty and R=0.','IR input data remains stable, all route transitions propagate with the nominal component costs, and captured D is already held1 before its lock opens.','IR store changes are not inferred from an open-loop path: reported input-to-Q time is the dependency delay if open.'],model:{repeater_ticks:'2 * delay',torch_ticks:2,comparator_ticks:2,dust_and_solid_ticks:0},native_acceptance:false,numeric_physical_bounds_established:false,world_mutations:0,limits:['Authored directed path arithmetic and exact cell IDs, not scheduled Minecraft execution. Both-edge pulse behavior, tick-order extrema, loaded update behavior and physical setup margins remain unmeasured.','Program producer response/READY relationship and stateful owner hold/regrant need independent proof. The nominal inequalities alone do not certify the complete interface.']};
writeFileSync(new URL('frontend-paths.json',H),JSON.stringify(out,null,2)+'\n');
writeFileSync(new URL('frontend-cells.json',H),JSON.stringify({status:'exact_frontend_timing_cells_in_core_local_coordinates',blocks:[...checkedCells.values()],source_sha256:out.source_sha256,native_acceptance:false})+'\n');
console.log(JSON.stringify({paths:rows.length,negative_refusals:negative,local:rows.slice(0,6),min_conditional_data_setup:Math.min(...sums.map(r=>r.conditional_capture_Q_to_close)),min_local_hold:Math.min(...sums.map(r=>r.lock_close_to_local_valid_withdrawal)),min_owner_hold:Math.min(...sums.map(r=>r.lock_close_to_owner_valid_withdrawal))}));
