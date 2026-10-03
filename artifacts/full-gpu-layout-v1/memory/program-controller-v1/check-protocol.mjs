// Independent finite state/transport-lag model, not Minecraft tick simulation.
import assert from 'node:assert/strict';
const rom=a=>((a*257)^0xa65c)&65535;
class Controller{
 constructor({noTailMask=false,earlyReady=false}={}){this.a=0;this.f=0;this.q=Array(12).fill(0);this.rq=Array(30).fill(0);this.owner=1;this.address=255;this.response=0x1337;this.noTailMask=noTailMask;this.earlyReady=earlyReady;this.grants=0;this.wasOwnerOpen=false;}
 step(v,addr,reset=0){const rt=this.rq[0];this.f=rt?0:reset?1:this.f;const blocked=!!(reset||this.f||rt),t=this.q[0],selected=v[this.owner];this.a=blocked?0:t&&!selected?0:(!t||this.noTailMask)&&(v[0]||v[1])?1:this.a;
 const taps=[1,2,3,9,10].map(n=>this.q[12-n]),op=[this.a&&!taps[0],taps[1]&&!taps[2],taps[3]&&!taps[4]].map(x=>!!x&&!blocked);
 if(op[0])this.owner=v[0]?0:1;if(this.wasOwnerOpen&&!op[0]&&!blocked)this.grants++;this.wasOwnerOpen=op[0];if(op[1])this.address=addr[this.owner];if(op[2])this.response=rom(this.address);
 const ready=!!((this.earlyReady?this.a:t)&&this.a&&!blocked),out={ready:[ready&&this.owner===0,ready&&this.owner===1],data:[this.response,this.response],owner:this.owner,address:this.address,active:this.a,blocked,opens:op,tail:t,queue:[...this.q]};this.q.shift();this.q.push(this.a);this.rq.shift();this.rq.push(this.f);return out;
 }
}
let transfers=0,scenarios=0;for(const who of[0,1])for(let a=0;a<256;a++)for(const both of[false,true]){const c=new Controller(),v=[0,0],addr=[a,a^255];v[who]=1;if(both)v[1-who]=1;let seen=new Set(),holding=null;
 for(let t=0;t<90;t++){const o=c.step(v,addr);assert(o.opens.filter(Boolean).length<=1);if(o.ready.some(Boolean)){const w=o.owner;assert.equal(o.data[w],rom(addr[w]));assert.equal(o.address,addr[w]);if(holding?.w===w)assert.deepEqual(o.data,holding.data);holding={w,data:o.data};if(!seen.has(w)){seen.add(w);transfers++;}if(t%3===0)v[w]=0;}else holding=null;}
 assert(seen.has(who));if(both)assert.equal(seen.size,2);assert.equal(c.a,0);assert(c.q.every(x=>x===0));scenarios++;}
// A late other requester cannot change closed owner/address or held response.
let lateCases=0;for(let arrival=2;arrival<=18;arrival++)for(let ack=20;ack<=24;ack++){const c=new Controller(),v=[0,1],addr=[0x3d,0x97];let ownerClosed=false,firstDone=false;for(let t=0;t<95;t++){if(t===arrival)v[0]=1;if(t===ack)v[1]=0;const o=c.step(v,addr);if(t>=2&&!firstDone){ownerClosed=true;assert.equal(o.owner,1);if(o.ready[1])assert.equal(o.data[1],rom(0x97));}if(t>ack&&!o.active)firstDone=true;if(firstDone&&o.ready[0]){assert.equal(o.data[0],rom(0x3d));v[0]=0;}}assert(ownerClosed&&firstDone);lateCases++;}
// Reset at every conceptual phase, reassert during the old flush, then reuse.
let resets=0;for(let when=0;when<25;when++)for(let width=1;width<=8;width++){const c=new Controller(),v=[1,0],addr=[0x47,0x82];let lastReset=-1,reentered=false,wasBlocked=false;for(let t=0;t<180;t++){const reset=t>=when&&t<when+width||t>=when+32&&t<when+32+width;if(reset){v.fill(0);lastReset=t;}const o=c.step(v,addr,reset);if(o.blocked){wasBlocked=true;assert(!o.ready.some(Boolean));assert(!o.opens.some(Boolean));assert.equal(o.active,0);}if(wasBlocked&&!o.blocked&&t>lastReset){assert(c.rq.every(x=>x===0));assert(c.q.every(x=>x===0)||reentered);if(!reentered){v[1]=1;reentered=true;}}if(reentered&&o.ready[1]){assert.equal(o.data[1],rom(0x82));v[1]=0;}}assert(wasBlocked&&reentered);resets++;}
let negatives=0;
// Early-ready advertises initial garbage before the actual response capture.
{const c=new Controller({earlyReady:true});const o=c.step([1,0],[7,8]);assert(o.ready[0]&&o.data[0]!==rom(7));negatives++;}
// Without tail gating, acknowledgement plus a held other request can retrigger
// into a non-empty pipeline. Such a trace is not an admitted next transaction.
{const c=new Controller({noTailMask:true});let seen=false;for(let t=0;t<50;t++){const o=c.step(t<14?[1,1]:[0,1],[7,8]);if(t>14&&o.active&&!o.tail&&o.queue.some(Boolean))seen=true;}assert(seen);negatives++;}
console.log(JSON.stringify({status:'abstract_logic_only_not_native',address_owner_scenarios:scenarios,transfers,late_request_hold_scenarios:lateCases,reset_reassertion_scenarios:resets,negative_variants:negatives,model_time_units:'abstract transport stages, not measured game ticks',limitations:['No block update ordering, analog strength, wire attenuation or clock jitter simulation.','Only valid/address held until ready and delayed ready-return-low client protocol is admitted.','Late arbitration during the initial owner-open window is allowed; ownership becomes fixed when that bank closes.']}));
