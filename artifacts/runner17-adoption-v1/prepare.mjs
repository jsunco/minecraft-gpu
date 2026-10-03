// Pure fixture preparation. No Minecraft or service constructors.
import assert from 'node:assert/strict';
export function makeFixture(){
 const id='gpu_runner17_adoption',dimension='minecraft:overworld',origin={x:-464,y:64,z:-120};
 const inputs=Array.from({length:17},(_,i)=>({name:`input_${i}`,position:{x:origin.x+2*(i%5),y:65,z:origin.z+2*Math.floor(i/5)}}));
 const blocks=[...inputs.map(i=>({position:{...i.position,y:64},block:{id:'minecraft:light_gray_concrete',properties:{}}})),...inputs.map(i=>({position:i.position,block:{id:'minecraft:lever',properties:{face:'floor',facing:'north',powered:'false'}}}))];
 const box={from:{x:-464,y:64,z:-120},to:{x:-456,y:65,z:-114}},margin={from:{x:-465,y:63,z:-121},to:{x:-455,y:66,z:-113}};
 const circuit={id,dimension,description:'',signals:inputs.map(i=>({...i,property:'powered'})),buses:[{name:'controls',bits:inputs.map(i=>i.name)}]};
 const patterns=[Array(17).fill(true),Array.from({length:17},(_,i)=>Boolean(i%2)),Array.from({length:17},(_,i)=>!Boolean(i%2)),Array(17).fill(true)];
 const cases=patterns.map((pattern,index)=>({name:['all_on','odd_on','even_on','all_on_before_restore'][index],inputs:Object.fromEntries(inputs.map((i,k)=>[i.name,pattern[k]])),expect:{...Object.fromEntries(inputs.map((i,k)=>[i.name,Number(pattern[k])])),controls:pattern.reduce((n,b,i)=>n+Number(b)*2**i,0)}}));
 const spec={circuit_id:id,inputs,cases,settle_ticks:20,timeout_ms:90000,trace:true,restore_inputs:true,stop_on_failure:true};
 const region={id,dimension,box,description:'Temporary isolated 17-input runner adoption fixture'};
 const plan={id,region_id:id,label:'17 supports and 17 independent levers; no redstone answers',operations:blocks.map(b=>({op:'set',...b}))};
 assert.equal(blocks.length,34);return{id,dimension,origin,box,margin,blocks,inputs,circuit,spec,region,plan,fixture_pins:['-30,-8','-29,-8'],native_status:'uninspected_unreserved_unbuilt'};
}
