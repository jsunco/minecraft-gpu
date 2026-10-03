// First connected RF/ALU/LSU lane slice within the new whole-core placement.
// No control functions are removed and no old absent cable counts as savings.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';
import{P,K,V,F,searchPath,refreshIndices}from'../../control-commit-v2/route.mjs';
import{inputs,active}from'../../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),B=new URL('../../',H),read=n=>JSON.parse(readFileSync(new URL(['bodies.json','inventory.json'].includes(n)?'../'+n:n,H))),W='minecraft:redstone_wire',R='minecraft:repeater',S='minecraft:light_gray_concrete';
const add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),sub=(a,b)=>P(a.x-b.x,a.y-b.y,a.z-b.z),under=p=>P(p.x,p.y-1,p.z),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
const source=read('bodies.json'),inventory=read('inventory.json'),lane=0;
// RF and its existing writeback column bundle remain rigidly joined. ALU
// operands face the RF capture height; LSU payload is just south of that pair.
const transforms={rf:sub(P(0,80,0),P(460,66,100)),writeback:sub(P(0,80,0),P(460,66,100)),alu:sub(P(120,165,0),P(1800,78,0)),lsu:sub(P(0,100,230),P(300,0,400))};
const parentRows=source.blocks.filter(b=>b.body.startsWith('lane0/')).map(b=>({...b,position:add(b.position,transforms[b.body.split('/')[1]])}));
const parent=new Map(parentRows.map(b=>[K(b.position),b.block])),map=new Map(parentRows.map(b=>[K(b.position),b]));assert.equal(map.size,parentRows.length,'Body overlap');
const rows=[...parentRows],newRows=[],edges=[],connections=[],ports={};let part='';
function put(p,id,properties){const block={id,...properties?{properties}:{}},old=map.get(K(p));if(old){assert.equal(id,S,'Collision '+part+' '+K(p));assert.deepEqual(old.block,block,'Support collision '+part+' '+K(p));return;}const v={position:p,block,part};map.set(K(p),v);rows.push(v);newRows.push(v);}
const dev=(p,id,props)=>{put(under(p),S);put(p,id,props);},wire=p=>dev(p,W),rep=(p,d)=>dev(p,R,{facing:F[d],delay:'1'}),edge=(from,to)=>edges.push({from,to,route:part});
const rf=JSON.parse(readFileSync(new URL('register-sequencer-v1/file-address-stage/lane0.json',B))),alu=JSON.parse(readFileSync(new URL('alu-v5/design.json',B))),lsu=JSON.parse(readFileSync(new URL('control-lsu-v2/design.json',B))),wb=JSON.parse(readFileSync(new URL('writeback/design.json',B)));
const rp=(n,i)=>add(rf.ports[n].bits[i].position,P(0,80,0)),ap=(n,i)=>add(alu.ports.find(p=>p.name===n&&p.bit===i).position,P(120,165,0)),lp=(n,i)=>add(lsu.ports[n].bits[i].position,P(0,100,230)),wp=(n,i)=>add(wb.ports[n].bits[i].position,P(0,-10,-30));
function pending(name,s,sd,d,ad,wasMissing){assert.equal(map.get(K(s))?.block.id,W,name+' source');assert.equal(map.get(K(d))?.block.id,W,name+' dest');connections.push({name,source:s,source_direction:sd,destination:d,arrival_direction:ad,was_missing_in_reference:wasMissing,tap:step(s,sd),start:step(s,sd,2),arrival:step(d,ad,-1),end:step(d,ad,-2)});}
// First group is the64 absent actual operand destinations across four lanes.
for(const[k,n]of ['operand_a','operand_b'].entries())for(let bit=0;bit<8;bit++)pending(n+bit,rp(n,bit),bit<4?'west':'east',ap(n,bit),k?'south':'east',true);
// Share only a physically isolated second outgoing tap from each RF pad;
// separate outputs are needed because both consumers must receive held data.
for(const[k,n]of ['operand_a','operand_b'].entries())for(let bit=0;bit<8;bit++)pending('lsu_'+(k?'rt':'rs')+bit,rp(n,bit),k?'south':'north',lp(k?'rt':'rs',bit),'east',false);
for(let bit=0;bit<8;bit++)pending('alu_writeback'+bit,ap('result',bit),'west',wp('alu',bit),'east',true);
for(let bit=0;bit<8;bit++)pending('lsu_writeback'+bit,lp('result',bit),'south',wp('lsu',bit),'east',false);
const selected=process.argv.includes('--operands-only')?connections.slice(0,16):connections;
// Reserve every boundary before searching; later paths cannot consume a
// different net's intended diode/rear approach.
const reserveFor=c=>[...Array.from({length:8},(_,i)=>step(c.source,c.source_direction,i+2)),...Array.from({length:12},(_,i)=>step(c.destination,c.arrival_direction,-i-2))],reserved=connections.flatMap(reserveFor);
for(const c of connections){part=c.name;rep(c.tap,c.source_direction);wire(c.start);rep(c.arrival,c.arrival_direction);wire(c.end);edge(c.source,c.tap);edge(c.tap,c.start);edge(c.end,c.arrival);edge(c.arrival,c.destination);}
const cachePath=new URL('lane0-paths.json',H),cache=existsSync(cachePath)?JSON.parse(readFileSync(cachePath)):{};
for(const c of selected){part=c.name;let path=cache[c.name]?.path;
 if(path){assert.deepEqual(cache[c.name].source,c.source);assert.deepEqual(cache[c.name].destination,c.destination);}else{
  const own=reserveFor(c),ignore=[c.tap,c.start,c.arrival,c.end,...[c.tap,c.start,c.arrival,c.end].map(under),...own];
  const tailLength=/^lsu_writeback[4-7]$/.test(c.name)?8:0,approach=step(c.end,c.arrival_direction,-tailLength),tail=Array.from({length:tailLength},(_,i)=>step(approach,c.arrival_direction,i+1));
  const found=searchPath(map,c.start,approach,{ignore:[...ignore,...tail,...tail.map(under)],forbidden:[...(c.name==='operand_b3'?[P(100,121,39)]:[]),...tail.flatMap(p=>[...[-2,-1,0,1,2].map(y=>P(p.x,p.y+y,p.z)),...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z)))])],reserved,limit:1200000});path=[...found.path,...tail];cache[c.name]={source:c.source,destination:c.destination,path,expanded:found.expanded};writeFileSync(cachePath,JSON.stringify(cache)+'\n');console.log(JSON.stringify({name:c.name,points:path.length,expanded:found.expanded}));
 }
 const refresh=new Set(refreshIndices(path));for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.has(i)){const dir=Object.keys(V).find(n=>K(step(p,n))===K(q));assert(dir);rep(p,dir);}else wire(p);}
 for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);c.path=path;c.refresh_indices=[...refresh];
}
const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)};for(const r of rows)for(const a of['x','y','z']){box.from[a]=Math.min(box.from[a],r.position[a]);box.to[a]=Math.max(box.to[a],r.position[a]);}
const report={status:'connected_data_slice_routing_candidate_unchecked',blocks:rows,transforms,parent_cells:parentRows.length,added_cells:newRows.length,metrics:{blocks:rows.length,physical_lane_stores:231,complete_data_connections:selected.length,unrouted_data_connections:connections.length-selected.length},box,connections,edges,remaining:['41 shared ALU commands, phase/cold/closure/highlevel inputs, RF address/action/block-ID fanout, writeback immediate/select and full shared controller placement.','Actual electrical differential, source strength and whole-core timing are pending.','All1117 core stores remain mandatory; this231-store lane is one extraction from that complete architecture.'],native_calls:0,native_acceptance:false};
writeFileSync(new URL('lane0-draft.json',H),JSON.stringify(report)+'\n');console.log(JSON.stringify({blocks:rows.length,body:parentRows.length,added:newRows.length,connections:selected.length,box}));
