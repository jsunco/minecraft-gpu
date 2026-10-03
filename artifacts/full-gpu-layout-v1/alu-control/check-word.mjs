import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeAluControlWord} from '../../../hardware/full-gpu-alu-control-word.mjs';
import {commands} from './microprogram.mjs';
const d=makeAluControlWord();assert.deepEqual(d,JSON.parse(readFileSync(new URL('./control-word.json',import.meta.url))));let cases=0;
for(let macro=0;macro<32;macro++)for(let phase=0;phase<4;phase++)for(const A of[0,1]){
 const expected=commands({macro,phase},{qualifiedA:!!A});
 for(const [name,g]of Object.entries(d.groups)){
  const selected=Number(g.states.includes(macro)),mask=g.phase?Number(!A||phase!==(g.phase==='next'?1:2)):0;
  assert.equal(Math.max(15*selected-15*mask,0)/15,expected[name],name);cases++;
 }
}
for(const q of d.qualifiers)for(let p=0;p<4;p++)for(const A of[0,1]){
 const values={phase0:p&1,phase1:p>>1,qualified_action_A:A};let signal=15;
 for(const g of q.gates)signal=Math.max(signal-15*Number(values[g.name]!==g.wanted),0);
 assert.equal(Number(signal>0),Number(A&&p===(q.phase==='next'?1:2)));
}
console.log(JSON.stringify({status:'physical_word_groups_match_41_command_model',blocks:d.metrics.blocks,comparisons:cases,qualifier_truth_cases:16,native_calls:0}));
