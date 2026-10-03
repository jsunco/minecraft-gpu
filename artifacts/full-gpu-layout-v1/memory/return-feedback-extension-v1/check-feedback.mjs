// Rerun the exact frozen bounded own-output→rear screen on all ten cables.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {key,encode,repeater,findFeedback} from '../../repeater-feedback-census-v1/dependencies.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H)));
const d=read('cable-slice.json'),patch=read('delta.json'),w=new Map(d.cable_blocks.map(v=>[key(v.position),encode(v.block)]));
const scan=world=>[...world].filter(([,v])=>repeater(v)).map(([k])=>findFeedback(world,k)).filter(Boolean);
const before=scan(w);assert.equal(before.length,22);
assert.deepEqual(before.map(v=>key(v.repeater)).sort(),d.witnesses.map(v=>key(v.repeater)).sort());
for(const c of patch.changes){const k=key(c.position);if(c.before)assert.equal(w.get(k),encode(c.before));else assert(!w.has(k));if(c.after)w.set(k,encode(c.after));else w.delete(k);}
const after=scan(w);assert.deepEqual(after,[]);
const names=['cable-slice.json','delta.json','check-feedback.mjs'],sources=Object.fromEntries(names.map(n=>[n,createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex')]));
const out={status:'all_included_repeater_own_feedback_checks_passed',repeaters_checked:[...w.values()].filter(repeater).length,original_witnesses:before.length,new_witnesses:after.length,source_sha256:sources,native_acceptance:false,limits:['Same frozen <=15-dust-vertex rule as the complete reference census; not an exhaustive event or arbitrary feedback proof.']};
writeFileSync(new URL('feedback-checks.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
