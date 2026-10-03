import {readFileSync,writeFileSync} from 'node:fs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),K=p=>`${p.x},${p.y},${p.z}`;
const d=read('joined-valid-local-design.json'),r=read('../channel-retention-v1/design.json'),map=new Map(d.blocks.map(v=>[K(v.position),v]));
const rows=r.blocks.filter(v=>['free_request_snapshot','snapshot_hold'].includes(r.groups[K(v.position)]));
const collisions=[];for(const v of rows){const p={x:v.position.x,y:v.position.y-40,z:v.position.z-20};if(map.has(K(p)))collisions.push({new:p,group:r.groups[K(v.position)],old:map.get(K(p))});}
const out={status:'screen_only',body_cells:rows.length,collisions};writeFileSync(new URL('snapshot-clearance.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({cells:rows.length,collisions:collisions.length,first:collisions.slice(0,3)}));
for(let i=0;i<8;i++)for(const x of[658,666]){const p={x,y:-75+4*i,z:-46};const a=[];for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]])a.push({dx,dz,rows:[0,1,2].map(n=>map.get(K({x:x+dx,y:p.y+n-1,z:p.z+dz}))) });if(i===0)console.log(JSON.stringify({source:p,neighbors:a}));}
