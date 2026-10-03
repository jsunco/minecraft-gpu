import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{word,COMMANDS}from'../alu-control/microprogram.mjs';
const d=JSON.parse(readFileSync(new URL('one-hot-word-comparison.json',import.meta.url)));let cases=0;
for(let state=0;state<32;state++)for(const name of COMMANDS){const g=d.matrix.find(c=>c.names.includes(name)),w=word(state);assert(g);const expected=name==='status_open'?Boolean(w.status):name.endsWith('_open_next')?w.next.includes(name[0]):name.endsWith('_open_current')?w.current.includes(name[0]):Boolean(w.data[name]);assert.equal(g.states.includes(state),expected);cases++;}
console.log(JSON.stringify({status:'matched_one_hot_word_truth_only',cases,native_calls:0,conditional_successor_geometry_checked:false}));
