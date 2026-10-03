// Exact two-cell versioned delta over the frozen complete memory map.
// Import-safe, no native calls or regenerated parent geometry.
export function makeProgramColdMaskRepair(){
 const wire={id:'minecraft:redstone_wire'},east={id:'minecraft:repeater',properties:{facing:'west',delay:'1'}};
 const translation={x:-600,y:11,z:1100};
 const changes=[
  {local:{x:-28,y:-41,z:-204},position:{x:-628,y:-30,z:896},before:wire,after:east,reason:'Move the same eastward refresh one block before the branch.'},
  {local:{x:-27,y:-41,z:-204},position:{x:-627,y:-30,z:896},before:east,after:wire,reason:'Give the existing south branch an actual dust source at its rear.'}
 ];
 return{status:'proposed_offline_program_reset_owner_mask_repair',parent_manifest:'artifacts/full-gpu-layout-v1/memory/internal-bank-response-v1/source-manifest.json',parent_manifest_sha256:'5e42a622d34a01876d956650f0147455fc87ba9b2d555173b556aeabc086cf62',parent_design:'artifacts/full-gpu-layout-v1/memory/internal-bank-response-v1/design.json',parent_design_sha256:'1cf502bc9cd5a5b9f4bf3227fa2ab7659bcd73888b3a9142127b4c39555ea0fc',translation,changes,blocks_added:0,blocks_removed:0,blocks_replaced:2,extra_stores:0,interface_changes:[],native_acceptance:false,physical_timing_verified:false};
}
