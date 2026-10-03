// Pre-run owner only. Runtime memory values are never supplied by this panel.
export const INPUTS=['load_request','raw_start','raw_reset','cores_held_reset','global_channels_drained','writer0','writer1','writer2','writer3','owner','cold_initialized','boot','image_verified','bank0_busy','bank1_busy','bank2_busy','bank3_busy','program_drained'];
export const OUTPUTS=['owner_set','owner_clear','runtime_block','core_reset_request','start_admitted','ram_grant','program_grant','cold_initialize_request','dcr_reset_permit'];
const drained={global_channels_drained:1,program_drained:1,bank0_busy:0,bank1_busy:0,bank2_busy:0,bank3_busy:0};
const closed={writer0:0,writer1:0,writer2:0,writer3:0};
export function terms(){return[
 {out:'owner_set',literals:{load_request:1,raw_start:0,raw_reset:0,cores_held_reset:1,...drained,cold_initialized:1,boot:0,...closed}},
 {out:'owner_clear',literals:{load_request:0,...drained,...closed}},{out:'owner_clear',literals:{boot:1}},
 {out:'runtime_block',literals:{load_request:1}},{out:'runtime_block',literals:{owner:1}},{out:'runtime_block',literals:{boot:1}},{out:'runtime_block',literals:{cold_initialized:0}},{out:'runtime_block',literals:{image_verified:0}},
 {out:'core_reset_request',literals:{raw_reset:1}},{out:'core_reset_request',literals:{load_request:1}},{out:'core_reset_request',literals:{owner:1}},{out:'core_reset_request',literals:{boot:1}},
 {out:'start_admitted',literals:{raw_start:1,raw_reset:0,load_request:0,owner:0,boot:0,cold_initialized:1,image_verified:1}},
 {out:'ram_grant',literals:{owner:1,boot:0}},
 {out:'program_grant',literals:{owner:1,boot:0,...drained,...closed}},{out:'cold_initialize_request',literals:{boot:1}},{out:'dcr_reset_permit',literals:{boot:1}},{out:'dcr_reset_permit',literals:{cores_held_reset:1,...drained,...closed}},
];}
export function evaluate(v){const closed=![0,1,2,3].some(i=>v['writer'+i]),drained=!!v.global_channels_drained&&!!v.program_drained&&![0,1,2,3].some(i=>v['bank'+i+'_busy']);return{
 owner_set:!!v.load_request&&!v.raw_start&&!v.raw_reset&&!!v.cores_held_reset&&drained&&!!v.cold_initialized&&!v.boot&&closed,
 owner_clear:!!v.boot||(!v.load_request&&drained&&closed),
 runtime_block:!!v.load_request||!!v.owner||!!v.boot||!v.cold_initialized||!v.image_verified,core_reset_request:!!v.raw_reset||!!v.load_request||!!v.owner||!!v.boot,
 start_admitted:!!v.raw_start&&!v.raw_reset&&!v.load_request&&!v.owner&&!v.boot&&!!v.cold_initialized&&!!v.image_verified,
 ram_grant:!!v.owner&&!v.boot,program_grant:!!v.owner&&!v.boot&&drained&&closed,cold_initialize_request:!!v.boot,dcr_reset_permit:!!v.boot||(!!v.cores_held_reset&&drained&&closed),
};}
