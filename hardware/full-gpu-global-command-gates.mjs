// Physical composition of retained dispatch commands, loader interlock and global admission.
import{makeLiteralNetwork}from'./full-gpu-literal-network.mjs';
export const COMMAND_INPUTS=['loader_start','loader_reset','global_launch','global_force','dispatch_start0','dispatch_reset0','dispatch_start1','dispatch_reset1','dispatch_done'];
export const COMMAND_OUTPUTS=['dispatch_start','core0_start','core0_reset','core1_start','core1_reset','visible_done'];
export function makeGlobalCommandGates({dense=false}={}){return makeLiteralNetwork({inputs:COMMAND_INPUTS,outputs:COMMAND_OUTPUTS,dense,terms:[
 {name:'admitted_kernel_start',literals:{loader_start:1,global_launch:1,global_force:0},bits:[0]},
 {name:'admitted_core0_start',literals:{dispatch_start0:1,global_launch:1,loader_reset:0,global_force:0,dispatch_reset0:0},bits:[1]},
 {name:'admitted_core1_start',literals:{dispatch_start1:1,global_launch:1,loader_reset:0,global_force:0,dispatch_reset1:0},bits:[3]},
 {name:'dispatch_core0_reset',literals:{dispatch_reset0:1},bits:[2]},
 {name:'dispatch_core1_reset',literals:{dispatch_reset1:1},bits:[4]},
 {name:'loader_reset_both',literals:{loader_reset:1},bits:[2,4]},
 {name:'global_reset_both',literals:{global_force:1},bits:[2,4]},
 {name:'visible_done',literals:{dispatch_done:1,global_launch:1,global_force:0},bits:[5]},
 ]});}
export function evaluateGlobalCommands(v){return[Number(v.loader_start&&v.global_launch&&!v.global_force),Number(v.dispatch_start0&&v.global_launch&&!v.loader_reset&&!v.global_force&&!v.dispatch_reset0),Number(v.dispatch_reset0||v.loader_reset||v.global_force),Number(v.dispatch_start1&&v.global_launch&&!v.loader_reset&&!v.global_force&&!v.dispatch_reset1),Number(v.dispatch_reset1||v.loader_reset||v.global_force),Number(v.dispatch_done&&v.global_launch&&!v.global_force)];}
