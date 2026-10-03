// Read-only external entrypoint. Keeps the frozen analyzer's dynamic runner import
// outside that analyzer module's own top-level await, avoiding an ESM import cycle.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {summarizeSaved} from '../artifacts/compact-register-signatures-v1/analyze.mjs';
const args=process.argv.slice(2),at=args.indexOf('--out');
assert(at>0&&at===args.length-2,'Ordered indexes followed by --out NEW_REPORT.json required');
const indexes=args.slice(0,at);assert(indexes.every(i=>/^\d{1,2}$/.test(i)));
const report=await summarizeSaved(indexes.map(Number));
writeFileSync(args[at+1],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,counts:report.counts,complete:report.signature_campaign_complete,timing:report.timing_admission_passed,path:args[at+1]}));
if(!report.timing_admission_passed)process.exitCode=2;
