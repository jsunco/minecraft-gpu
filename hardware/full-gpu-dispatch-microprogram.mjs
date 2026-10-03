// Offline specification for the physical dispatch controller. Never a live scheduler.
// An action executes once on the qualified A/B state cycle, with real retained
// outputs and counter banks. Conditional predicates require routed producers.
export const STATES={RESET_ALL:0,WAIT_START:1,TEST_COMPLETE:2,LOWER_START:3,COUNT_DONE:4,DONE_COUNT_CLOSE:5,ASSERT_RESET:6,WAIT_RESET_HIGH:7,TEST_ALLOCATE:8,CAPTURE_PAYLOAD:9,PAYLOAD_CLOSE:10,LOWER_RESET:11,WAIT_RESET_LOW:12,RAISE_START:13,START_CLOSE:14,COUNT_DISPATCHED:15,DISPATCH_COUNT_CLOSE:16,ROTATE:20,CHECK_DONE:21,SET_DONE:22,DONE_HOLD:23,RESET_CLOSE:24,WAIT_BOTH_RESET:25};
export const BRANCH_STATES=[1,2,7,8,12,20,21,25];
export const ACTION_STATES={clear_all:[0],lower_start:[3],increment_done:[4],assert_reset:[6],capture_payload:[9],lower_reset:[11],raise_start:[13],increment_dispatched:[15],toggle_owner:[20],set_done:[22]};
export const PREDICATES={start:'Held external kernel start; low before launch, high until done.',completed:'Selected retained core_start AND selected core_done.',reset_high:'Selected core reset acknowledgement is high after full actual clear and drain.',available:'Selected !core_start AND dispatched<total AND selected reset acknowledgement.',reset_low:'Selected reset acknowledgement is low after reset was released.',owner:'Retained scan owner;0 checks core0 before core1.',all_done:'Completed count equals the seven-bit total padded to eight bits.',both_reset:'Both physical cores acknowledge full reset.'};
export function nextState(state,p={}){switch(state){
 case 0:return 24;case 1:return p.start?21:1;case 2:return p.completed?3:8;
 case 3:return 4;case 4:return 5;case 5:return 6;case 6:return 7;case 7:return p.reset_high?8:7;
 case 8:return p.available?9:20;case 9:return 10;case 10:return 11;case 11:return 12;case 12:return p.reset_low?13:12;
 case 13:return 14;case 14:return 15;case 15:return 16;case 16:return 20;
 case 20:return p.owner?21:2;case 21:return p.all_done?22:2;case 22:return 23;case 23:return 23;
 case 24:return 25;case 25:return p.both_reset?1:25;default:return 0;
}}
export function laneMask(threadCount,last){if(!last)return 15;const n=threadCount&3;return n===0?15:(1<<n)-1;}
export function decodedActions(state){return Object.fromEntries(Object.entries(ACTION_STATES).map(([n,ss])=>[n,ss.includes(state)]));}
export const LIMITS=['Specification/oracle only; no host execution as GPU control.','Every control needs actual retained state, physical predicate mux/feedback and qualified phase routes.','Inputs obey original launch protocol: reset before launch; DCR stable; start held until done.','Reset acknowledgement is a deliberate redstone timing refinement, not an upstream RTL port.','Global cold startup must condition the decoder with actions blanked; invalid-state fallback is not startup proof.'];
