// Third audit: explicit source-coordinate setups, ordinary browser inputs, RAF sequences.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const OUT=path.resolve('captures/audit-pasada3-2026-10-08');fs.mkdirSync(OUT,{recursive:true});
const mode=process.argv[2]??'ramps';const data={date:new Date().toISOString(),mode,method:'RAF + browser inputs; isolated setups explicitly logged, no gameplay source edits',cases:[],errors:[]};
const save=()=>fs.writeFileSync(path.join(OUT,mode+'.json'),JSON.stringify(data,null,2));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--no-first-run']});
const page=await browser.newPage();await page.setViewport({width:1000,height:700,isMobile:true,hasTouch:true,deviceScaleFactor:mode==='device'?2:1});
page.on('pageerror',e=>{data.errors.push(String(e));save();});
try{
await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});await page.evaluate(()=>localStorage.removeItem('bellakaventuras.remake.save'));await page.reload({waitUntil:'load'});
await page.waitForFunction(()=>window.__bk&&!document.querySelector('#btn-start').disabled,{timeout:90000});await page.click('#btn-start');await sleep(800);
if(mode==='ramps'||mode==='ramp-ab'||mode==='ramp135'){
 const paths=await page.evaluate(()=>{
  const g=window.__bk,S=g.park.sector('no_me_guillo');
  const rot=(p,x,z,dy=0)=>({x:p.x+x*Math.cos(p.yaw)+z*Math.sin(p.yaw),z:p.z-x*Math.sin(p.yaw)+z*Math.cos(p.yaw),yaw:p.yaw+dy});
  const plat=S.pl(33,10);const routes=[{name:'nmg_quarter',p:S.pl(36.4,4),height:1.5,length:2.6*Math.sin(Math.acos(1-1.5/2.6)),deck:1,width:7},
   {name:'nmg_bank',p:rot(plat,5.6,0,-Math.PI/2),height:.6,length:2.6,deck:0,width:4.2}];
  for(const th of [45,135,225]){
   const a=th*Math.PI/180,p={x:58*Math.sin(a),z:-58*Math.cos(a),yaw:Math.PI-a};
   // P in source rotates its offset with yaw+dy, including bank's pi rotation.
   routes.push({name:'bank-'+th,p:rot({...p,yaw:p.yaw+Math.PI},0,3),height:.7,length:2.4,deck:1.2,width:3.6});
   routes.push({name:'quarter-'+th,p:rot(p,-1,-4.5),height:1.3,length:2.4*Math.sin(Math.acos(1-1.3/2.4)),deck:1,width:4});
  }
  return routes;
 });
 for(const route of paths.filter(r=>mode!=='ramp135'||r.name==='bank-135'))for(const approach of (mode==='ramp-ab'||mode==='ramp135'?['roll-up-original','roll-up-open']:['roll-up','roll-up-near','ollie-up','roll-down'])){
  const setup=await page.evaluate(({r,a})=>{
   const g=window.__bk,T=window.__bkTHREE,d=new T.Vector3(Math.sin(r.p.yaw),0,Math.cos(r.p.yaw));
   for(const item of window.__auditDisabled??[])item.c.setEnabled(true);window.__auditDisabled=[];
   const neighbor=r.name.startsWith('bank-')?'quarter_bola':r.name.startsWith('quarter-')?'bank':r.name==='nmg_quarter'?'nmg_bank':null;
   if(a==='roll-up-open'&&neighbor){
    const matches=g.park.b.colliders.filter(x=>x.name===neighbor).map(x=>{const v=x.c.vertices(),p=new T.Vector3();for(let i=0;i<v.length;i+=3)p.add(new T.Vector3(v[i],v[i+1],v[i+2]));p.multiplyScalar(3/v.length);return{x,d:p.distanceTo(new T.Vector3(r.p.x,0,r.p.z))};}).sort((a,b)=>a.d-b.d);
    if(matches[0]){matches[0].x.c.setEnabled(false);window.__auditDisabled.push(matches[0].x);}
   }
   const top=a==='roll-down',p=new T.Vector3(r.p.x,top?r.height:0,r.p.z).addScaledVector(d,top?r.length+Math.max(.1,r.deck*.6):(a==='roll-up-near'?-1.1:-4.5));
   const heading=r.p.yaw+(top?Math.PI:0);
   const ray=new window.__bkRapier.Ray({x:p.x,y:8,z:p.z},{x:0,y:-1,z:0});
   const hit=g.world.castRay(ray,20,true,undefined,undefined,g.skater.collider);
   const groundHitY=hit?8-hit.timeOfImpact:null;
   if(groundHitY!==null)p.y=groundHitY;
   g.skater.teleport(p,heading);g.rig.snapBehind(g.skater);g.input.clear();
   return {pos:p.toArray(),heading,groundHitY,groundCollider:hit?g.park.b.colliders.find(x=>x.c.handle===hit.collider.handle)?.name:null,disabledColliders:window.__auditDisabled.map(x=>x.name),respawns:g.skater.respawns,fixture:'source-defined toe/deck; actual ray-hit surface height; A/B disabled neighbor only in memory'};
  },{r:route,a:approach});
  await sleep(450);await page.screenshot({path:path.join(OUT,route.name+'-'+approach+'-before.png')});
  await page.keyboard.down('KeyW');let jumped=false;const samples=[];const start=Date.now();
  while(Date.now()-start<(mode==='ramp135'?5000:2900)){
   const s=await page.evaluate(r=>{const g=window.__bk,p=g.skater.footPos,d={x:Math.sin(r.p.yaw),z:Math.cos(r.p.yaw)},sgn=r.approach==='roll-down'?-1:1;
    const ray=new window.__bkRapier.Ray({x:p.x,y:p.y+.35,z:p.z},{x:d.x*sgn,y:0,z:d.z*sgn});const hit=g.world.castRay(ray,1,true,undefined,undefined,g.skater.collider);
    return {clock:g.clock,p:p.toArray(),along:(p.x-r.p.x)*d.x+(p.z-r.p.z)*d.z,lateral:(p.x-r.p.x)*d.z-(p.z-r.p.z)*d.x,speed:g.skater.speed,ground:g.skater.grounded,normal:g.skater.groundNormal.toArray(),respawns:g.skater.respawns,obstacle:hit?g.park.b.colliders.find(x=>x.c.handle===hit.collider.handle)?.name:null};},{...route,approach});
   samples.push(s);if(approach==='ollie-up'&&!jumped&&s.along>-.9&&s.ground){await page.keyboard.press('Space');jumped=true;}await sleep(65);
  }
  await page.keyboard.up('KeyW');await page.screenshot({path:path.join(OUT,route.name+'-'+approach+'-after.png')});
  data.cases.push({route,approach,setup,jumped,samples,peakY:Math.max(...samples.map(s=>s.p[1])),last:samples.at(-1)});save();console.log('RAMP',route.name,approach,JSON.stringify(data.cases.at(-1).last));
 }
}
if(mode==='sequences'){
 for(const id of ['la_pantera','aissa','juseph','bella'])await page.evaluate(id=>window.__bk.loadNpc(id),id);
 const actors=await page.evaluate(()=>[...window.__bk.npcs].map(([id,a])=>({id,clips:[...a[0].actions.keys()]})));
 data.actorClips=actors;save();
 for(const actor of actors){
  const gesture=actor.id==='bella'?'Cheer':'Talk';
  const setup=await page.evaluate(({id,gesture})=>{const g=window.__bk,a=g.npcs.get(id)[0],T=window.__bkTHREE;
   g.skater.teleport(a.root.position.clone().add(new T.Vector3(0,0,4)),Math.PI);g.rig.snapBehind(g.skater);
   g.rig.toFixed({pos:a.root.position.clone().add(new T.Vector3(2,1.4,4)),target:a.root.position.clone().add(new T.Vector3(0,1,0)),hfov:50},true);
   return {duration:a.gesture(gesture,.3),idle:a.idle,position:a.root.position.toArray(),clock:g.clock,method:'direct gesture API for isolated sequence, not activity completion'};
  },{id:actor.id,gesture});
  const samples=[];const start=Date.now();let i=0;
  while((samples.at(-1)?.time??setup.clock)-setup.clock<setup.duration+1&&Date.now()-start<(setup.duration+2)*5000){
   const s=await page.evaluate(id=>{const a=window.__bk.npcs.get(id)[0],T=window.__bkTHREE;let feet=[],head=null;
    a.model.updateMatrixWorld(true);a.model.traverse(o=>{if(o.isBone){if(/Foot$|ToeBase$/.test(o.name))feet.push({name:o.name,p:o.getWorldPosition(new T.Vector3()).toArray()});if(/:Head$/.test(o.name))head=o.getWorldPosition(new T.Vector3()).toArray();}});
    return {time:window.__bk.clock,current:a.current?.getClip().name,actions:[...a.actions].map(([name,x])=>({name,time:x.time,weight:x.getEffectiveWeight(),running:x.isRunning(),scheduled:x.isScheduled(),enabled:x.enabled})),feet,head};
   },actor.id);samples.push(s);
   await page.screenshot({path:path.join(OUT,'npc-'+actor.id+'-'+String(i++).padStart(3,'0')+'.png')});await sleep(140);
  }
  data.cases.push({id:actor.id,gesture,setup,samples});save();console.log('NPC',actor.id,samples.length,samples.at(-1).current);
 }
 // Full real-time dance transitions driven by keys; no debugComplete.
 await page.evaluate(()=>{const g=window.__bk,a=g.manifest.get('dance.center');g.skater.teleport(a.pos,a.heading);g.rig.toFollow(g.skater);g.rig.snapBehind(g.skater);});await sleep(400);await page.keyboard.press('KeyE');await sleep(500);
 const sequences=[['ArrowUp','ArrowRight','ArrowUp'],['ArrowLeft','ArrowDown','ArrowRight'],['ArrowUp','ArrowLeft','ArrowDown']];
 for(let round=0;round<3;round++){
  for(const k of sequences[round]){await page.keyboard.press(k);await sleep(100);}
  const samples=[];const start=Date.now();let i=0;
  while(Date.now()-start<2450){
   samples.push(await page.evaluate(()=>{const g=window.__bk;return {clock:g.clock,mode:g.mode,round:g.activities[4].round,idx:g.activities[4].idx,clips:g.visual.diagnostics?.()??null,girls:(g.npcs.get('bella')??[]).map(a=>({current:a.current?.getClip().name,actions:[...a.actions].map(([n,x])=>({name:n,w:x.getEffectiveWeight(),t:x.time}))}))};}));
   await page.screenshot({path:path.join(OUT,'dance-round-'+round+'-'+String(i++).padStart(3,'0')+'.png')});await sleep(90);
  }
  data.cases.push({label:'dance-round',round,samples});save();
 }
 await page.waitForFunction(()=>window.__bk.mode==='explore',{timeout:10000});await sleep(500);
 data.danceResult=await page.evaluate(()=>({mode:window.__bk.mode,completed:window.__bk.state.p.activities.danceCombo,clip:window.__bk.visual.currentName,weights:window.__bk.visual.weightSum}));
 await page.screenshot({path:path.join(OUT,'dance-return-to-skate.png')});save();
}
if(mode==='dance-clips'){
 await page.evaluate(()=>{const g=window.__bk,a=g.manifest.get('dance.center'),T=window.__bkTHREE;g.skater.teleport(a.pos,a.heading);g.skater.frozen=true;g.setMode('activity');g.visual.setBoardVisible(false);g.rig.toFixed({pos:a.pos.clone().add(new T.Vector3(2.5,1.6,4.5)),target:a.pos.clone().add(new T.Vector3(0,.85,0)),hfov:50},true);});
 for(const clip of ['Step_Hip_Hop_Dance','Hip_Hop_Dance_1','Hip_Hop_Dance_2','Hip_Hop_Dance_3','FunnyDancing_02','Breakdance_1990']){
  const duration=await page.evaluate(n=>{const v=window.__bk.visual;v.play(n,{loop:false,fade:.3});return v.actions.get(n).getClip().duration;},clip);
  const samples=[];const start=Date.now(),clock0=await page.evaluate(()=>window.__bk.clock);let i=0;
  while((samples.at(-1)?.clock??clock0)-clock0<duration+.6&&Date.now()-start<(duration+2)*5000){
   samples.push(await page.evaluate(()=>{const g=window.__bk,v=g.visual,T=window.__bkTHREE;v.root.updateMatrixWorld(true);let low=Infinity,high=-Infinity;
    v.model.traverse(o=>{if(o.isSkinnedMesh&&o.name.startsWith('ANMI_BODY')){o.skeleton.update();const p=new T.Vector3();for(let j=0;j<o.geometry.attributes.position.count;j+=13){o.getVertexPosition(j,p).applyMatrix4(o.matrixWorld);low=Math.min(low,p.y);high=Math.max(high,p.y);}}});
    return {clock:g.clock,name:v.currentName,weightSum:v.weightSum,active:v.activeActions,sampledMeshY:[low,high]};}));
   await page.screenshot({path:path.join(OUT,'clip-'+clip+'-'+String(i++).padStart(3,'0')+'.png')});await sleep(160);
  }
  data.cases.push({clip,duration,method:'full clip RAF plus .6s, normal override API; deformed vertex every 13th, not exact global bounds',samples});save();console.log('CLIP',clip,duration,samples.length);
 }
 await page.evaluate(()=>{const g=window.__bk;g.visual.play('skate',{fade:.3});g.visual.setBoardVisible(true);g.skater.frozen=false;g.setMode('explore');g.rig.toFollow(g.skater);});await sleep(900);
 data.return=await page.evaluate(()=>({mode:window.__bk.mode,clip:window.__bk.visual.currentName,weightSum:window.__bk.visual.weightSum,active:window.__bk.visual.activeActions}));save();
}
if(mode==='cache'){
 await page.evaluate(()=>{const g=window.__bk;g.paused=true;g.audio.music.stopAll();});
 data.method='Isolated paused scene, all world sources stopped; sequential ensure across all tracks twice. Measures Music cache, not whole-process RAM.';
 for(let cycle=0;cycle<2;cycle++){
  const ids=await page.evaluate(()=>[...window.__bk.audio.music.tracks.keys()]);
  for(const id of ids){
   await page.evaluate(id=>window.__bk.audio.music.ensure(id),id);
   data.cases.push(await page.evaluate(({id,cycle})=>{const m=window.__bk.audio.music;return {id,cycle,maxDecoded:m.MAX_DECODED,tracks:[...m.tracks.values()].map(t=>({id:t.id,playing:t.playing,rawBytes:t.raw?.byteLength??0,decoded:t.buffer?{duration:t.buffer.duration,channels:t.buffer.numberOfChannels,sampleRate:t.buffer.sampleRate,pcmBytes:t.buffer.length*t.buffer.numberOfChannels*4}:null,error:t.error})),decodes:m.stats.decodes};},{id,cycle}));save();
  }
 }
 console.log('CACHE',data.cases.length,'last',JSON.stringify(data.cases.at(-1)));
}
if(mode==='device'){
 data.initial=await page.evaluate(()=>{const g=window.__bk,gl=g.renderer.getContext();return {coarse:matchMedia('(pointer:coarse)').matches,dpr:devicePixelRatio,pixelRatio:g.renderer.getPixelRatio(),maxPixelRatio:g.maxPixelRatio,quality:g.quality,shadowSize:g.sun.shadow.mapSize.toArray(),audioSessionSupported:'audioSession'in navigator,webglVersion:gl.getParameter(gl.VERSION),savePersistent:g.state.persistent};});
 data.adaptive=await page.evaluate(()=>{const g=window.__bk;g.paused=false;const values=[];for(let i=0;i<63;i++)g.adaptResolution(.1);values.push({scenario:'6.3s synthetic 10fps',pr:g.renderer.getPixelRatio()});for(let i=0;i<1700;i++)g.adaptResolution(1/60);values.push({scenario:'28.3s synthetic 60fps',pr:g.renderer.getPixelRatio()});return values;});
 data.context=[];await page.evaluate(()=>{const g=window.__bk;window.__bkLostEvents=[];g.canvas.addEventListener('webglcontextlost',()=>window.__bkLostEvents.push('lost'));g.canvas.addEventListener('webglcontextrestored',()=>window.__bkLostEvents.push('restored'));g.renderer.forceContextLoss();});await sleep(600);
 data.context.push(await page.evaluate(()=>({events:window.__bkLostEvents,clock:window.__bk.clock,lost:window.__bk.renderer.getContext().isContextLost(),startErrorVisible:!document.querySelector('#start-error').hidden,mode:window.__bk.mode})));
 await page.evaluate(()=>window.__bk.renderer.forceContextRestore());await sleep(1200);data.context.push(await page.evaluate(()=>({events:window.__bkLostEvents,clock:window.__bk.clock,lost:window.__bk.renderer.getContext().isContextLost(),mode:window.__bk.mode})));
 await page.screenshot({path:path.join(OUT,'context-restored.png')});save();
}
}catch(e){data.errors.push('HARNESS '+String(e));save();process.exitCode=1;}finally{save();await browser.close();}
