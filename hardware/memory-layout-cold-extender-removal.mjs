// Offline explicit substitutions only. Integrated cold/conditioning contract;
// NOT a pulse-only reset component and NOT a native execution adapter.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='artifacts/full-gpu-layout-v1/memory/';
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export function makeColdExtenderRemoval(){
 const positions=[['program',-839,-38,860],['data_global',521,-31,350],
  ['bank0',-111,-23,568],['bank1',321,-23,568],['bank2',-111,-23,1190],['bank3',321,-23,1190]];
 const parent=root+'internal-bank-response-v1/';
 return {status:'offline_integrated_cold_extender_removal_candidate',
  parent_design:parent+'design.json',parent_design_sha256:'1cf502bc9cd5a5b9f4bf3227fa2ab7659bcd73888b3a9142127b4c39555ea0fc',
  parent_manifest:parent+'source-manifest.json',parent_manifest_sha256:'5e42a622d34a01876d956650f0147455fc87ba9b2d555173b556aeabc086cf62',
  required_companion:root+'program-cold-mask-repair-v1/delta.json',
  required_companion_sha256:sha(root+'program-cold-mask-repair-v1/delta.json'),
  changes:positions.map(([instance,x,y,z])=>({instance,position:{x,y,z},
   before:{id:'minecraft:redstone_wall_torch',properties:{facing:'east'}},
   after:{id:'minecraft:light_gray_concrete'},role:'Remove F positive source; leave raw COLD mask and all delay/owner/payload circuitry intact.'})),
  metrics:{replacements:6,added_blocks:0,removed_blocks:0,added_routes:0,protocol_bits_removed:6},
  semantics:{old:'F is a self-clearing SR cold-pulse extender.',new:'F output is structurally quiet. Raw cold is held through controller clear/closure; all old delay state must flush before normal admission.',lost_contract:'A short isolated reset pulse no longer promises extension. Only the integrated held-cold plus fresh conditioning sequence is admissible.',preserved:'Every owner, payload, response, backing RAM cell, loader interface, warm core reset handshake and physical reset pad.'},
  native_acceptance:false,numeric_physical_bounds_established:false};
}
