// Import-safe Workshop-only 28-input adapter. No CLI, connection or constructor on import.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AcceleratedTestRunner,AcceleratedCircuitService} from '../artifacts/runner17-adoption-accelerated-v2/accelerated-runner.mjs';
import {Accelerated32TestRunner,EXECUTION_POLICY as P32} from '../artifacts/runner32-adoption-accelerated-v1/accelerated-runner.mjs';
import {TestRunnerService,testRunSchema} from '../artifacts/runner-input-capacity-v1/test-runner-service.mjs';
import {parseReading} from '../tools/minecraft-redstone/scripts/telemetry-service.mjs';

export const ROOT=fileURLToPath(new URL('..',import.meta.url));
export const CONTROL_NAMES=Object.freeze([...Array.from({length:8},(_,b)=>'d'+b),...Array.from({length:4},(_,b)=>'wa'+b),...Array.from({length:4},(_,b)=>'ra'+b),'we',...Array.from({length:8},(_,b)=>'block'+b),'assign','capture_a','capture_b']);
export const POLICY=Object.freeze({...P32,variant:'workshop_register28_v1',restore_budget_ms:28000,rate_basis:'Fresh native Workshop tick status before each logical call; configured100TPS, not achieved rate'});
const runtimePins={
 'artifacts/runner17-adoption-accelerated-v2/accelerated-runner.mjs':'f4aa90d4736d4bd41b7ae2d8ac45ff250a9472634089514a6ababe52122c5407',
 'artifacts/runner32-adoption-accelerated-v1/accelerated-runner.mjs':'156fcd04f186d3c5cce8568c3f90ac4a2e2fb39c486acbeee46ad1660f1b8b5a',
 'artifacts/runner-input-capacity-v1/test-runner-service.mjs':'60e002651acbec6d2652c44f1b132520feb984bf8edd55dca988cf0fd2eb3fe8',
 '../tools/minecraft-redstone/scripts/circuit-service.mjs':'cad83ba658a1789ec83ab8ecc9131a20da9220109ebf3bffa39e9672fb4288e5',
 '../tools/minecraft-redstone/scripts/telemetry-service.mjs':'55ee7b3494d22d3d40d2bb75886c4535d46d2a090f8453cf13aae6b5a5e0f0f2',
};
const key=p=>[p.x,p.y,p.z].join(','),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const branded=new WeakSet();
export function bindWorkshopRegisterSpec({designPath,specPath,designSha256,specSha256}){
 const files={[resolve(designPath)]:designSha256,[resolve(specPath)]:specSha256,...Object.fromEntries(Object.entries(runtimePins).map(([p,h])=>[resolve(ROOT,p),h]))};
 const checkSources=()=>{for(const[p,h]of Object.entries(files)){assert(/^[a-f0-9]{64}$/.test(h??''),'Explicit artifact hash required');assert.equal(sha(p),h,'Changed source/artifact '+p);}};
 checkSources();const design=JSON.parse(readFileSync(designPath)),spec=testRunSchema.parse(JSON.parse(readFileSync(specPath)));
 validateBinding(design,spec);return{design,spec,source_sha256:files,checkSources};
}
export function validateBinding(design,spec){
 assert.deepEqual(design.inputs.map(i=>i.name),CONTROL_NAMES,'All28 original controls, in reviewed order');
 assert.deepEqual(spec.inputs,design.inputs);assert.equal(spec.settle_ticks,200);assert.equal(spec.timeout_ms,65000);
 assert(spec.trace&&spec.restore_inputs&&spec.stop_on_failure);testRunSchema.parse(spec);
 assert.equal(new Set(design.inputs.map(i=>key(i.position))).size,28);
 const blockMap=new Map(design.blocks.map(b=>[key(b.position),b.block]));
 for(const i of design.inputs){const b=blockMap.get(key(i.position));assert.equal(b?.id,'minecraft:lever');assert.deepEqual(b.properties,{face:'floor',facing:/^(wa|ra)[0-3]$/.test(i.name)?'north':'west',powered:'false'});}
 const definition=design.circuits.find(c=>c.id===spec.circuit_id);assert(definition&&definition.dimension==='minecraft:overworld');
 assert(spec.cases.length*spec.settle_ticks<=6000);return definition;
}
export function assertPlayersClear(players,inputs){
 assert(Array.isArray(players),'Missing player list');for(const player of players){
  if(player.dimensionId!=='minecraft:overworld')continue;
  const p=player.position;assert(p&&['x','y','z'].every(a=>Number.isFinite(p[a])),'Missing current player position');
  for(const{position:q}of inputs)assert(!(p.x+.3>q.x&&p.x-.3<q.x+1&&p.y+1.8>q.y&&p.y<q.y+1&&p.z+.3>q.z&&p.z-.3<q.z+1),'Control overlaps current player');
 }
}
// Caller supplies its already-authenticated transport; this adapter never reads credentials.
export function workshopRegisterBridge(raw,{expectedSession,inputs,clock=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),record=()=>{}}){
 assert(/^[0-9a-f-]{36}$/i.test(expectedSession??''));let lastStart=-Infinity,lastTick=-1,lastWorldTime=-1,poison=null,queue=Promise.resolve();
 const send=async(name,args={})=>{const wait=110-(clock()-lastStart);if(wait>0)await sleep(wait);lastStart=clock();record({kind:'request',name,args});try{const result=await raw.call('world',name,args);record({kind:'reply',name,result});return result;}catch(error){record({kind:'error',name,error:String(error)});throw error;}};
 const identity=value=>{try{assert.equal(value.world_name,'TinyGPU Workshop');assert.equal(value.minecraft_version,'26.3');assert.equal(value.session_id,expectedSession);assert.equal(value.tick_rate,100);assert.equal(value.frozen,false);assert.equal(value.stepping,false);assert.equal(value.sprinting,false);assert.equal(value.runs_normally,true);assert(Number.isSafeInteger(value.server_tick)&&value.server_tick>=lastTick);assert(Number.isSafeInteger(value.world_game_time)&&value.world_game_time>=lastWorldTime);lastTick=value.server_tick;lastWorldTime=value.world_game_time;}catch(error){poison=error;throw error;}};
 const perform=async(source,name,args={})=>{
  if(poison)throw poison;assert.equal(source,'world');
  const status=await send('server_tick_status');identity(parseReading(status));if(name==='server_tick_status')return status;
  if(name==='block_set_state'){
   assert(inputs.some(i=>key(i.position)===key(args.position)),'Only bound input positions can be written');
   assert.equal(args.dimension,'minecraft:overworld');assert.equal(args.block?.id,'minecraft:lever');assert.equal(args.update_flags,3);
   assertPlayersClear(parseReading(await send('player_list_online')),inputs.filter(i=>key(i.position)===key(args.position)));
  }
  const result=await send(name,args);let value;try{value=parseReading(result);}catch{}
  if(value?.session_id!==undefined&&value.session_id!==expectedSession){poison=Error('Native response from changed session; no further calls');throw poison;}
  if(value?.server_tick!==undefined){if(!Number.isSafeInteger(value.server_tick)||value.server_tick<lastTick){poison=Error('Native server_tick regressed');throw poison;}lastTick=value.server_tick;}
  return result;
 };
 const bridge={call(...args){const work=queue.then(()=>perform(...args));queue=work.catch(()=>{});return work;}};branded.add(bridge);return bridge;
}
export class WorkshopRegisterRunner extends AcceleratedTestRunner{
 constructor(bridge,circuits,{design,spec,checkSources,...options}){
  assert(branded.has(bridge),'Workshop/session/rate guarded bridge required');assert.equal(typeof options.lock?.acquire,'function','Explicit shared writer lease required');assert.equal(typeof checkSources,'function');checkSources();validateBinding(design,spec);
  super(bridge,circuits,options);this.design=structuredClone(design);this.spec=structuredClone(spec);this.checkSources=checkSources;
 }
 policy(){return{...POLICY};}
 validate(input){const spec=TestRunnerService.prototype.validate.call(this,input);assert.deepEqual(spec,this.spec,'Only bound prepared28-input specification admitted');return spec;}
 guard(context,options={}){return Accelerated32TestRunner.prototype.guard.call(this,context,options);}
 async readInputs(context,options={}){
  const rows=await super.readInputs(context,options);
  if(!options.cleanup&&!context.workshopBaseline){const blocks=new Map(this.design.blocks.map(b=>[key(b.position),b.block]));for(const i of this.design.inputs)assert.deepEqual(rows.get(i.name),{position:i.position,...blocks.get(key(i.position))},'Exact off/oriented control baseline required');context.workshopBaseline=true;}
  return rows;
 }
 describe(job){return{...super.describe(job),execution_policy:this.policy(),timing_note:'Workshop28:65s/6500observed-tick run cutoff;28s conflict-checked restoration then fresh10s trace cleanup.12000tick/4096entry recorder with continuous drains.200tick waits unchanged; no physical circuit acceptance from runner completion alone.'};}
}
// Do this before inherited reload(), which rewrites dead-owner running records.
// A failed stateful attempt needs explicit diagnosis, not a silent next job.
function requireResolvedPrivateJobs(stateDir){
 const runs=join(stateDir,'tests','runs');if(!existsSync(runs))return;
 for(const name of readdirSync(runs).filter(n=>n.endsWith('.json'))){
  const job=JSON.parse(readFileSync(join(runs,name)));
  assert(job.status==='passed'&&job.completed===job.total&&job.passed===job.total&&job.failed===0,'Unresolved prior private job; preserve and diagnose '+name);
  assert(job.restore?.status==='restored'&&job.trace?.complete===true&&job.trace.gaps===0&&job.trace.active===false&&job.trace.has_more===false&&job.trace.discarded===true&&job.trace.end_reason==='stopped'&&!job.trace.error,'Unresolved prior restoration/trace; preserve and diagnose '+name);
 }
}
// One job, one root lease. No old-world admission, plans, constants, coordinates or metadata.
// Caller must first accept construction, source review and exact ticking pins independently.
export async function runWorkshopRegisterJob({raw,binding,expectedSession,lock,stateDir,record,clock=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 assert(lock?.path===join(ROOT,'.minecraft-assistant','.writer-lock'),'Shared project root lock required');assert.equal(typeof record,'function');
 assert(resolve(stateDir).startsWith(join(ROOT,'.minecraft-assistant','workshop')+'/'),'Separate Workshop evidence directory required');
 binding.checkSources();return lock.withLock('Workshop28 '+binding.spec.circuit_id,async()=>{
  requireResolvedPrivateJobs(stateDir);
  let nested=false,runner;const bridge=workshopRegisterBridge(raw,{expectedSession,inputs:binding.design.inputs,clock,sleep,record:e=>record('native',e)});
  try{
   const first=parseReading(await bridge.call('world','server_tick_status'));
   const status=parseReading(await bridge.call('world','server_get_status'));assert.equal(status.minecraftVersion,'26.3');
   const watches=parseReading(await bridge.call('world','block_watch_list'));assert(Array.isArray(watches.watches)&&watches.watches.length===0,'Finish active native recorders first');
   assertPlayersClear(parseReading(await bridge.call('world','player_list_online')),binding.design.inputs);
   const second=parseReading(await bridge.call('world','server_tick_status'));assert(second.world_game_time>first.world_game_time&&second.server_tick>first.server_tick,'Native simulation must advance before input writes');
   const circuits=new AcceleratedCircuitService(bridge,{stateDir:join(stateDir,'circuits')});
   assert(Object.values(circuits.traces).every(t=>!t.active),'Unresolved private recorder metadata');
   const definition=validateBinding(binding.design,binding.spec);const prior=circuits.definitions[definition.id];if(prior)assert.deepEqual(prior,{description:'',...definition});else circuits.register(definition);
   const nestedLock={acquire(){assert(!nested);nested=true;return()=>{assert(nested);nested=false;};}};
   runner=new WorkshopRegisterRunner(bridge,circuits,{...binding,expectedSession,expectedTps:100,stateDir:join(stateDir,'tests'),lock:nestedLock,clock,sleep});
   assert([...runner.jobs.values()].every(j=>j.status!=='running'),'Existing private job has not finished');
   binding.checkSources();record('binding',{session_id:expectedSession,source_sha256:binding.source_sha256,policy:POLICY,spec:binding.spec,definition});
   const result=parseReading(await runner.run(binding.spec));record('result',result);binding.checkSources();return result;
  }finally{if(runner)await runner.close();}
 });
}
