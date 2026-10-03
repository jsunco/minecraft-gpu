// ALU-local conditioning and RESET-aware action qualification. No host state.
export const INPUTS=['raw_A','initialize','scan_ready','selected','admitted','reset_row0','reset_row1','reset_request','any_fault','normal_permit','idle'];
export const OUTPUTS=['select_data','admit_data','initialize_hold','qualified_action_A','scan_owns_decode','startup_admitted','request_inhibit'];
export function terms(){return[
 {out:'request_inhibit',literals:{initialize:1}},
 {out:'request_inhibit',literals:{selected:0}},
 {out:'request_inhibit',literals:{admitted:0}},
 {out:'request_inhibit',literals:{idle:1,normal_permit:0}},
 {out:'qualified_action_A',literals:{raw_A:1,initialize:0,selected:1,admitted:1,reset_request:0,any_fault:0,idle:0}},
 {out:'scan_owns_decode',literals:{selected:0}},
 {out:'startup_admitted',literals:{initialize:0,selected:1,admitted:1}},
 {out:'select_data',literals:{initialize:0,scan_ready:1}},
 {out:'admit_data',literals:{initialize:0,selected:1}},
 {out:'initialize_hold',literals:{initialize:1}},
 {out:'initialize_hold',literals:{selected:0}},
 {out:'initialize_hold',literals:{admitted:0}},
 {out:'qualified_action_A',literals:{raw_A:1,initialize:0,selected:1,admitted:1,reset_row0:1}},
 {out:'qualified_action_A',literals:{raw_A:1,initialize:0,selected:1,admitted:1,reset_row1:1}},
 {out:'qualified_action_A',literals:{raw_A:1,initialize:0,selected:1,admitted:1,reset_request:0,any_fault:0,normal_permit:1}},
];}
export function evaluate(v){return{request_inhibit:!!v.initialize||!v.selected||!v.admitted||(!!v.idle&&!v.normal_permit),scan_owns_decode:!v.selected,startup_admitted:!v.initialize&&!!v.selected&&!!v.admitted,select_data:!v.initialize&&!!v.scan_ready,admit_data:!v.initialize&&!!v.selected,initialize_hold:!!v.initialize||!v.selected||!v.admitted,qualified_action_A:!!v.raw_A&&!v.initialize&&!!v.selected&&!!v.admitted&&(!!v.reset_row0||!!v.reset_row1||(!v.reset_request&&!v.any_fault&&(!!v.normal_permit||!v.idle)))};}
