// Stronger-than-owner-specific drain: channel-wide quiet, actual vanilla Boolean gates.
import{makeLiteralNetwork}from'./full-gpu-literal-network.mjs';
export const INPUTS=['active','normal_tail','reset_blocked'];
export function makeProgramQuietLogic(){return{...makeLiteralNetwork({inputs:INPUTS,outputs:['core0_drained','core1_drained','channel_quiet'],terms:[{name:'all_protocol_activity_low',literals:{active:0,normal_tail:0,reset_blocked:0},bits:[0,1,2]}]}),status:'offline_program_shared_channel_quiet_gates',meaning:'Every output requires ACTIVE, actual final normal tail and retained reset-blocked low. This conservatively waits for unrelated core traffic too. Each core must also check its own READY low. Final tail vs all far bank closure remains a timing obligation.'};}
