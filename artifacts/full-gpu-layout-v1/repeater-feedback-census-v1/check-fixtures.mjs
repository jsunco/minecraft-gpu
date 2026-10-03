import assert from'node:assert/strict';import{writeFileSync}from'node:fs';
import{W,S,R0,DIR,X,Z,key,position,findFeedback}from'./dependencies.mjs';
const K=(x,y,z)=>key({x,y,z}),results=[];
function fixture(name,forward,side,solidRear=false){const world=new Map(),r=K(0,50,0),set=(k,c)=>{world.set(k,c);world.set(k-1,S);};set(r,R0+DIR.indexOf(forward));
 // A supported five-wire loop around one side of a diode.
 const loop=[r+forward,r+forward+side,r+side,r-forward+side,r-forward];
 for(const q of loop)set(q,W);
 if(solidRear)world.set(r-forward,S);
 assert(findFeedback(world,r),name+' positive witness');
 // Move the actual diode onto the first corner; the old entry becomes dust.
 world.set(r,W);world.set(r+forward,R0+DIR.indexOf(side));
 assert.equal(findFeedback(world,r+forward),null,name+' directional repair');results.push({name,positive:true,repair_refused_feedback:true});
}
fixture('east',X,Z);fixture('west',-X,Z);fixture('south',Z,X);fixture('north',-Z,X);fixture('weak-solid-rear',Z,X,true);
// Missing support blocks the upward dust step; capping it also blocks it.
{const m=new Map(),r=K(0,50,0),put=(x,y,z,c)=>m.set(K(x,y,z),c);put(0,50,0,R0+2);put(0,49,0,S);for(const[x,y,z]of[[0,50,1],[1,51,1],[1,51,0],[1,51,-1],[0,50,-1]]){put(x,y,z,W);put(x,y-1,z,S);}assert(findFeedback(m,r));m.set(K(0,51,1),S);assert.equal(findFeedback(m,r),null);results.push({name:'rising-step-cap',positive:true,cap_removes_path:true});}
for(const p of[{x:-1712,y:-64,z:-3840},{x:2648,y:319,z:1893}])assert.deepEqual(position(key(p)),p);
const out={status:'feedback_geometry_fixtures_passed',fixtures:results,coordinate_roundtrips:2,native_calls:0};writeFileSync(new URL('fixture-checks.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
