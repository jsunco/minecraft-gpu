// Pure fixture description. No default/world-selected origin and no native calls.
import assert from 'node:assert/strict';
export const SUITES=Object.freeze(['odd_then_all','even_then_all']);
export function makeFixture({origin}={}) {
  assert(origin&&Object.keys(origin).sort().join(',')==='x,y,z','Explicit unreserved origin required');
  for(const k of ['x','y','z'])assert(Number.isSafeInteger(origin[k]));
  assert(origin.x>=-29999983&&origin.x<=29999968&&origin.z>=-29999983&&origin.z<=29999976);
  assert(origin.y>=-63&&origin.y<=317,'Fixture and margin must fit vanilla overworld');
  const id='gpu_runner32_adoption',dimension='minecraft:overworld';
  const inputs=Array.from({length:32},(_,i)=>({name:`input_${i}`,position:{x:origin.x+2*(i%8),y:origin.y+1,z:origin.z+2*Math.floor(i/8)}}));
  const blocks=[...inputs.map(i=>({position:{...i.position,y:origin.y},block:{id:'minecraft:light_gray_concrete',properties:{}}})),...inputs.map(i=>({position:i.position,block:{id:'minecraft:lever',properties:{face:'floor',facing:'north',powered:'false'}}}))];
  const box={from:{...origin},to:{x:origin.x+14,y:origin.y+1,z:origin.z+6}},margin={from:{x:origin.x-1,y:origin.y-1,z:origin.z-1},to:{x:origin.x+15,y:origin.y+2,z:origin.z+7}};
  const circuit={id,dimension,description:'Temporary32-input tooling adoption only; direct real lever probes',signals:inputs.map(i=>({...i,property:'powered'})),buses:[{name:'controls',bits:inputs.map(i=>i.name)}]};
  const specs=Object.fromEntries(SUITES.map(suite=>{
    const patterns=[inputs.map((_,i)=>suite==='odd_then_all'?Boolean(i%2):!Boolean(i%2)),Array(32).fill(true)];
    return[suite,{circuit_id:id,inputs,cases:patterns.map((p,i)=>({name:i?'all_on_before_restore':suite.split('_then_')[0]+'_on',inputs:Object.fromEntries(inputs.map((v,k)=>[v.name,p[k]])),expect:{...Object.fromEntries(inputs.map((v,k)=>[v.name,Number(p[k])])),controls:p.reduce((n,b,k)=>n+Number(b)*2**k,0)}})),settle_ticks:200,timeout_ms:65000,trace:true,restore_inputs:true,stop_on_failure:true}];
  }));
  const region={id,dimension,box,description:'Unselected temporary32-lever adoption fixture; inspect and back up before any future placement'};
  const plan={id,region_id:id,label:'32 supports then32 independent levers, no logic outputs computed externally',operations:blocks.map(b=>({op:'set',...b}))};
  return{id,dimension,origin:{...origin},box,margin,blocks,inputs,circuit,specs,region,plan,native_status:'unplaced_uninspected_unreserved',scope:'Tool input capacity and cleanup only; no byte hardware timing or GPU acceptance'};
}
