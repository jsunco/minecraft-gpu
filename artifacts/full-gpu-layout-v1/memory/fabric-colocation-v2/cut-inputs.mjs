// Exact effective-input rule snapshot for current-parent cut inventory only.
import assert from 'node:assert/strict';
import {P,K} from '../../control-commit-v2/route.mjs';
const W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',RB='minecraft:redstone_block';
const A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),N=v=>P(-v.x,-v.y,-v.z),D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},HOR=Object.values(D),DIR=[...HOR,P(0,1,0),P(0,-1,0)];
const solid=b=>b?.id.endsWith('_concrete'),active=b=>b&&!solid(b),edge=(a,b)=>K(a)+'>'+K(b);
function emitted(w,s,t){const b=w.get(K(s));if(!b)return false;if([R,C].includes(b.id))return K(A(s,D[b.properties.facing]))===K(t);if([T,WT].includes(b.id))return K(t)!==K(A(s,b.id===T?P(0,-1,0):D[b.properties.facing]));return[W,RB,'minecraft:lever'].includes(b.id);}
function sources(w,p,wire){const out=[];for(const v of DIR){const q=A(p,v),b=w.get(K(q));if(!b)continue;const strong=([R,C].includes(b.id)&&emitted(w,q,p))||([T,WT].includes(b.id)&&v.y===-1);if(strong||!wire&&b.id===W&&v.y!==-1)out.push(q);}return out;}
function inputs(w,p){const b=w.get(K(p)),out=[];if(!active(b))return out;
 const raw=(q,wire=false)=>{const b=w.get(K(q));if(solid(b))out.push(...sources(w,q,wire));else if(emitted(w,q,p))out.push(q);};
 if(b.id===W){for(const v of DIR){const q=A(p,v);if(w.get(K(q))?.id!==W)raw(q,true);}for(const v of HOR){const q=A(p,v),hi=A(q,P(0,1,0)),lo=A(q,P(0,-1,0));if(w.get(K(q))?.id===W)out.push(q);if(solid(w.get(K(q)))&&!solid(w.get(K(A(p,P(0,1,0)))))&&w.get(K(hi))?.id===W)out.push(hi);if(!solid(w.get(K(q)))&&w.get(K(lo))?.id===W)out.push(lo);}}
 else if([R,C].includes(b.id)){const v=D[b.properties.facing];raw(A(p,N(v)));for(const s of HOR){if(s.x*v.x+s.z*v.z)continue;const q=A(p,s),qb=w.get(K(q));if([R,C].includes(qb?.id)&&emitted(w,q,p))out.push(q);else if(b.id===C&&[W,RB].includes(qb?.id))out.push(q);}}
 else if([T,WT].includes(b.id)){const q=A(p,b.id===T?P(0,-1,0):D[b.properties.facing]);assert(solid(w.get(K(q))),'Torch support '+K(p));out.push(...sources(w,q,false));}
 return [...new Map(out.map(p=>[K(p),p])).values()];
}

export {inputs,active};
