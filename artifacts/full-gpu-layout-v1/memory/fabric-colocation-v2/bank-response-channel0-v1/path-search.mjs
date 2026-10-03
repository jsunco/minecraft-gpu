// Local fabric fork of frozen control-commit-v2/route.mjs.
// Only addition: an optional exact Y layer for parallel grant cables; no relaxed clearance.
import assert from 'node:assert/strict';
export const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`;
export const V={east:[1,0],west:[-1,0],south:[0,1],north:[0,-1]},F={east:'west',west:'east',south:'north',north:'south'};
class Heap{a=[];push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p].f<=v.f)break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}pop(){const r=this.a[0],v=this.a.pop();if(this.a.length){let i=0;while(2*i+1<this.a.length){let j=2*i+1;if(j+1<this.a.length&&this.a[j+1].f<this.a[j].f)j++;if(this.a[j].f>=v.f)break;this.a[i]=this.a[j];i=j;}this.a[i]=v;}return r;}}
export function searchPath(map,start,end,{limit=350000,ignore=[],forbidden=[],reserved=[],layer}={}){
 const ignored=new Set(ignore.map(K)),blocked=new Set(forbidden.map(K)),cache=new Map(),reserve=new Set(reserved.map(K)),at=p=>map.get(K(p))??(reserve.has(K(p))&&!ignored.has(K(p))?{reserved:true}:undefined);
 const clear=p=>{const k=K(p);if(k===K(start)||k===K(end))return true;if(cache.has(k))return cache.get(k);let ok=!blocked.has(k)&&!at(p)&&!at(P(p.x,p.y-1,p.z));if(ok){for(const[dx,dz]of Object.values(V))for(const dy of[-1,0,1]){const q=P(p.x+dx,p.y+dy,p.z+dz),v=at(q);if(v&&!ignored.has(K(q))){ok=false;break;}}for(const dy of[-2,1,2]){const q=P(p.x,p.y+dy,p.z);if(at(q)&&!ignored.has(K(q)))ok=false;}}cache.set(k,ok);return ok;};
 const h=p=>Math.abs(p.x-end.x)+Math.abs(p.z-end.z)+Math.abs(p.y-end.y)*1.05;
 const key=n=>K(n.p)+','+n.run+','+n.dx+','+n.dy+','+n.dz;
 const heap=new Heap(),first={p:start,g:0,f:h(start)*2,prev:null,run:0,dx:0,dy:0,dz:0};heap.push(first);const best=new Map([[key(first),0]]);let expanded=0,nearest=first;
 while(heap.a.length){const n=heap.pop();if(n.g!==best.get(key(n)))continue;if(K(n.p)===K(end)){const path=[];for(let v=n;v;v=v.prev)path.push(v.p);return{path:path.reverse(),expanded};}if(h(n.p)<h(nearest.p))nearest=n;assert(++expanded<=limit,'Path search exhausted '+K(start)+' -> '+K(end)+' nearest '+K(nearest.p)+' h '+h(nearest.p)+' goalneighbors '+JSON.stringify(Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>{const p=P(end.x+x,end.y+y,end.z+z);return[K(p),clear(p)];}))));
  for(const[dx,dz]of Object.values(V))for(const dy of[0,-1,1]){const p=P(n.p.x+dx,n.p.y+dy,n.p.z+dz);if((layer!==undefined&&p.y!==layer)||p.y< -78||p.y>301||p.x< -660||p.x>835||p.z< -647||p.z>1830||!clear(p)||dx===-n.dx&&dz===-n.dz&&n.prev)continue;let own=false,old=n.prev,depth=0;while(old&&depth++<32){const a=old.p,hd=Math.abs(p.x-a.x)+Math.abs(p.z-a.z),yd=Math.abs(p.y-a.y);if(hd===0&&yd<=2||hd===1&&yd<=1){own=true;break;}old=old.prev;}if(own)continue;const refresh=n.prev&&n.dy===0&&dy===0&&dx===n.dx&&dz===n.dz,run=refresh?1:n.run+1;if(run>10)continue;
   const g=n.g+1+(dy?0.25:0)+(n.prev&&(p.x-n.p.x!==n.p.x-n.prev.p.x||p.z-n.p.z!==n.p.z-n.prev.p.z)?0.03:0),v={p,g,f:g+2*h(p),prev:n,run,dx,dy,dz};const k=key(v);if(g>=(best.get(k)??Infinity))continue;best.set(k,g);heap.push(v);
  }
 }
 throw Error('No route '+K(start)+' -> '+K(end));
}
export function refreshIndices(path){const candidates=[-1];for(let i=1;i<path.length-1;i++){const[a,p,b]=[path[i-1],path[i],path[i+1]];if(a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const cost=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!cost.has(start)||end-start>12)continue;const value=cost.get(start)+(end===path.length?0:1);if(value<(cost.get(end)??Infinity)){cost.set(end,value);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable path');const out=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))out.push(i);return out.sort((a,b)=>a-b);}
