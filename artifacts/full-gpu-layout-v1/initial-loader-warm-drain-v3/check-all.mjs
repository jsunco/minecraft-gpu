// Reproduce only offline geometry and pure image/logic checks.
import assert from'node:assert/strict';import{spawnSync}from'node:child_process';import{writeFileSync}from'node:fs';import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),prefix='artifacts/full-gpu-layout-v1/initial-loader-warm-drain-v3/',checks=[];
for(const[exe,args]of[[process.execPath,['--max-old-space-size=6144',prefix+'prepare.mjs','--check']],['python3',[prefix+'check-geometry.py']],['python3',[prefix+'check-preservation.py']],[process.execPath,['--max-old-space-size=4096',prefix+'check-logic.mjs']]]){
 const r=spawnSync(exe,args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(r.status,0,(r.stderr||r.stdout));const report=r.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));checks.push({command:[exe,...args],exit_code:r.status,report});console.log(args.at(0)+': passed');
}
const report={status:'authored_offline_loader_checks_passed',checks,native_calls:0,native_acceptance:false};if(process.argv.includes('--save'))writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,check_commands:checks.length,native_calls:0}));
