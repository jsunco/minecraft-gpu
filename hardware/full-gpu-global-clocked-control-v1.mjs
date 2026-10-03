// Join the actual retained global controller to reset-priority command gates.
import assert from'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';
import{makeGlobalSampledControl}from'./full-gpu-global-sampled-control-v1.mjs';import{makeCorePhaseSource}from'./full-gpu-core-phase-source.mjs';import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';import{materializeInstance}from'./gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeGlobalClockedControl(){
 const map=new Map(),parents=[],routes=[],edges=[],connections=[],columns=[];let part='';
 function insert(id,d,origin,quarter_turns=0){const q=materializeInstance(d,{id,translation:origin,quarter_turns});for(const v of q.blocks){assert(!map.has(K(v.position)),'Parent collision '+id+' '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,origin,quarter_turns,blocks:q.blocks.length});return q;}
 const base=insert('sampled_controller',makeGlobalSampledControl(),P(0,0,0)),clock=insert('oscillator',makeCorePhaseSource(),P(250,64,-200));
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p)+' with '+map.get(K(p))?.part);map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){ws=ws.filter((w,i)=>!i||w.some((v,k)=>v!==ws[i-1][k]));part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!branchPoints.some(q=>q.y===p.y&&Math.abs(q.x-p.x)+Math.abs(q.z-p.z)<=1)&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>13)continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,outputY){assert(outputY>bottom&&(outputY-bottom)%4===1);part=name;for(let y=bottom;y<outputY;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,outputY,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:outputY});return P(x,outputY,z);}
 const anchors={};
 // A physical optional STOP lever controls oscillator blanking; reset never does.
 const inhibit=clock.ports.phase_inhibit.bits[0].position,stop=P(inhibit.x+1,inhibit.y,inhibit.z);part='manual_clock_stop';dev(stop,'lever',{face:'floor',facing:'east',powered:'false'});edge(stop,inhibit);
 for(const[bit,phase]of['a','b'].entries()){
  const source=clock.ports['phase_'+phase].bits[0].position,rise=2+4*bit,upper=source.y+rise,input=P(340+16*bit,upper,-264+24*bit),busY=-4-4*bit,desc=insert('phase_'+phase+'_descent',makeSignalDescent({drop:upper-busY}),input);parents.at(-1).parameters={drop:upper-busY};
  part='phase_'+phase+'_tap';rep(P(source.x,source.y,source.z-1),'north');wire(P(source.x,source.y,source.z-2));edge(source,P(source.x,source.y,source.z-1));edge(P(source.x,source.y,source.z-1),P(source.x,source.y,source.z-2));
  route('phase_'+phase+'_depart',[[source.x,source.y,source.z-2],[source.x,upper,source.z-2-rise],[input.x,upper,source.z-2-rise],[input.x,upper,input.z]]);
  const out=desc.ports.output.bits[0],p=out.position,dir=out.travel,q=P(p.x+3*dir.x,p.y,p.z+3*dir.z),ws=[[p.x,p.y,p.z],[q.x,q.y,q.z]];
  if(dir.x<0)ws.push([q.x,p.y,input.z-12],[input.x+12,p.y,input.z-12]);else if(dir.z)ws.push([input.x+12,p.y,q.z]);
  const last=ws.at(-1),anchor=P(330,busY,-200+20*bit);route('phase_'+phase+'_to_anchor',[...ws,[last[0],busY,anchor.z-12],[anchor.x,busY,anchor.z-12],[anchor.x,busY,anchor.z]]);anchors[phase]={source,anchor};
 }
 function finish(name,phase,ws,targetName){const source=anchors[phase].source,target=base.ports[targetName].bits[0].position;route(name,ws);part=name+'_arrival';const normalizer=P(target.x-1,target.y,target.z);rep(normalizer,'east');edge(P(target.x-2,target.y,target.z),normalizer);edge(normalizer,target);connections.push({name,phase,source,destination:target,normalizer,required_high_power:15});}
 const A=anchors.a.anchor,B=anchors.b.anchor;
 finish('A_next','a',[[A.x,A.y,A.z],[140,-4,A.z],[140,-4,11],[148,-4,11],[148,0,7],[148,0,3]],'next_open');
 finish('A_commands','a',[[A.x,A.y,A.z],[430,-4,A.z],[430,-4,11],[438,-4,11],[438,0,7],[438,0,3]],'command_open');
 // One B trunk, three isolated branch departures. Keep actual taps as wire.
 part='B_trunk_normalizer';rep(P(B.x-1,B.y,B.z),'west');wire(P(B.x-2,B.y,B.z));edge(B,P(B.x-1,B.y,B.z));edge(P(B.x-1,B.y,B.z),P(B.x-2,B.y,B.z));
 route('B_trunk',[[B.x-2,B.y,B.z],[-132,-8,B.z]],{branchPoints:[P(154,-8,B.z),P(-120,-8,B.z),P(-132,-8,B.z)]});
 for(const[x,n]of[[154,'current'],[-120,'sample0'],[-132,'sample1']]){part='B_'+n+'_tap';rep(P(x,-8,B.z+1),'south');wire(P(x,-8,B.z+2));edge(P(x,-8,B.z),P(x,-8,B.z+1));edge(P(x,-8,B.z+1),P(x,-8,B.z+2));}
 finish('B_current','b',[[154,-8,B.z+2],[154,-8,15],[160,-8,15],[160,0,7],[160,0,3]],'current_open');
 finish('B_sample0','b',[[-120,-8,B.z+2],[-120,-8,15],[-102,-8,15],[-102,0,7],[-102,0,3]],'phase_B_0');
 route('B_sample1_lift_input',[[-132,-8,B.z+2],[-132,-8,5],[-132,-5,8],[-112,-5,8],[-112,-5,10]]);part='B_sample1_driver';rep(P(-112,-5,11),'south');edge(P(-112,-5,10),P(-112,-5,11));edge(P(-112,-5,11),P(-112,-5,12));column('B_sample1_lift',-112,12,-5,32);
 finish('B_sample1','b',[[-112,32,12],[-106,32,12],[-106,32,3],[-102,32,3]],'phase_B_1');
 const ports={...base.ports};for(const n of['next_open','current_open','command_open','phase_B_0','phase_B_1'])delete ports[n];
 const blocks=[...map.values()],box={from:{},to:{}};for(const axis of['x','y','z']){box.from[axis]=blocks.reduce((n,v)=>Math.min(n,v.position[axis]),Infinity);box.to[axis]=blocks.reduce((n,v)=>Math.max(n,v.position[axis]),-Infinity);}
 return{status:'offline_global_physical_clock_input_and_command_cadence_joined',blocks,ports,parents,routes,edges,connections,columns,box,metrics:{blocks:blocks.length,stored_state_bits:28,actual_phase_arrivals:5,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},manual_controls:[{name:'clock_stop',position:stop,default_powered:false,meaning:'Optional vanilla lever: high masks both phase outputs. Keep low through BOOT/reset; stop does not rewind partial writes.'}],clock_settings:makeCorePhaseSource().settings,nominal_clock:makeCorePhaseSource().nominal_component_sums,native_calls:0,world_mutations:0,native_acceptance:false,complete_gpu_layout:false,missing:['Nominal path sums and actual far bank closure/nonoverlap must be compared before treating this cadence as safe.','Global state feedback plus all sampled predicate/decode and held-output paths must settle in their respective closed windows.','Direct raw BOOT/RESET/LOAD loader inhibition, all final master control/data joins, density and native execution remain required.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeGlobalClockedControl();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
