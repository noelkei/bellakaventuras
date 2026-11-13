// Complementary audit: real RAF, normal browser inputs. Teleports are explicit setup, never completion evidence.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const OUT=path.resolve('captures/audit-complementaria-2026-10-08'); fs.mkdirSync(OUT,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--no-first-run']});
const page=await browser.newPage(); await page.setViewport({width:1100,height:700,isMobile:true,hasTouch:true,deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const log=[]; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const save=()=>fs.writeFileSync(path.join(OUT,mode==='ui'?'runtime.json':mode+'.json'),JSON.stringify({date:new Date().toISOString(),method:'RAF real, browser keyboard/mouse/CDP touch; setup teleports explicitly logged; no forced autoplay policy',log,errors},null,2));
const record=async(label,extra={})=>{const s=await page.evaluate(()=>{const g=window.__bk; return {clock:g.clock,mode:g.mode,paused:g.paused,pos:g.skater.footPos.toArray(),speed:g.skater.speed,grounded:g.skater.grounded,crouched:g.skater.isCrouched,total:g.state.total,activities:g.state.p.activities,bridge:g.state.p.bridgeReached,action:document.querySelector('#prompt').hidden?null:document.querySelector('#btn-action').textContent,audio:g.audio.ctx?.state};});log.push({label,...extra,...s});save();console.log(label,JSON.stringify(s));};
const snap=async(name)=>{await page.screenshot({path:path.join(OUT,name+'.png')});};
const fresh=async()=>{await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});await page.evaluate(()=>localStorage.removeItem('bellakaventuras.remake.save'));await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.__bk&&!document.querySelector('#btn-start').disabled,{timeout:90000});await page.click('#btn-start');await sleep(700);};
const tp=async(anchor)=>{await page.evaluate(anchor=>{const g=window.__bk,a=g.manifest.get(anchor);g.skater.teleport(a.pos,a.heading);g.rig.snapBehind(g.skater);},anchor);await sleep(350);log.push({label:'SETUP teleport',anchor});};
const hold=async(keys,ms)=>{for(const k of keys)await page.keyboard.down(k);await sleep(ms);for(const k of keys)await page.keyboard.up(k);};
const drive=async(target,seconds=6,{jumpDistance=0,crouch=false,until=null}={})=>{
 let keys=new Set(),jumped=false;const start=Date.now();let samples=[],lastD=999;
 while(Date.now()-start<seconds*1000){
  const d=await page.evaluate(target=>{const g=window.__bk,s=g.skater,f=g.rig.forward,dx=target[0]-s.footPos.x,dz=target[2]-s.footPos.z;return {dist:Math.hypot(dx,dz),ang:Math.atan2(dx*(-f.z)+dz*f.x,dx*f.x+dz*f.z),ground:s.grounded,speed:s.speed,y:s.footPos.y,step:g.activities[1].step,stage:g.activities[3].stage,total:g.state.total};},target);
  samples.push(d);lastD=d.dist;if(until&&until(d))break;
  const next=new Set();const cs=Math.cos(d.ang),sn=Math.sin(d.ang);if(cs>.38)next.add('KeyW');else if(cs<-.38)next.add('KeyS');if(sn>.38)next.add('KeyD');else if(sn<-.38)next.add('KeyA');if(crouch)next.add('KeyC');
  for(const k of keys)if(!next.has(k))await page.keyboard.up(k);for(const k of next)if(!keys.has(k))await page.keyboard.down(k);keys=next;
  if(jumpDistance&&!jumped&&d.dist<jumpDistance&&d.ground&&d.speed>3){await page.keyboard.press('Space');jumped=true;}
  await sleep(80);
 }
 for(const k of keys)await page.keyboard.up(k);
 return {wallSeconds:(Date.now()-start)/1000,jumped,lastD,peakY:Math.max(...samples.map(x=>x.y)),samples};
};
const mode=process.argv[2]||'ui';
try {
await fresh();
if(mode==='ui'){
 await record('llegada');await snap('00-llegada');
 const manifest=await page.evaluate(()=>{const g=window.__bk;return {fries:g.manifest.fries.map(f=>({...f,pos:f.pos.toArray(),trigger:f.trigger.toArray()})),anchors:[...g.manifest.anchors].map(([id,a])=>({id,pos:a.pos.toArray(),heading:a.heading})),zones:[...g.park.zones].map(([id,z])=>({id,...z,pos:z.pos.toArray()})),gates:g.park.tutorialGates.map(x=>({...x,c:x.c.toArray(),h:x.h.toArray()})),stages:g.park.bridgeStages.map(x=>({...x,c:x.c.toArray(),h:x.h.toArray()}))};});
 fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,2));
 // Dialogue pause: ordinary E, pause click; timers continue while game clock stops.
 await tp('npc.la_pantera');await page.keyboard.press('KeyE');await sleep(350);await record('pantera diálogo iniciado');await snap('01-pantera-dialogo');
 await page.click('#btn-pause');await record('pausa durante diálogo');await sleep(3200);await record('diálogo tras 3,2s en pausa');await snap('02-pausa-premio');await page.click('#btn-resume');
 // Graffiti normal mouse strokes, including rotation mid-stroke session.
 await tp('mural.paint');await page.keyboard.press('KeyE');await page.waitForFunction(()=>document.querySelector('#graffiti-canvas').dataset.ready==='1');await snap('03-mural-entrada');
 let rect=await page.$eval('#graffiti-canvas',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
 await page.mouse.move(rect.x+rect.w*.05,rect.y+rect.h*.1);await page.mouse.down();await page.mouse.move(rect.x+rect.w*.95,rect.y+rect.h*.1,{steps:20});await page.mouse.up();await record('mural una pasada ratón',{pct:await page.$eval('#graffiti-pct',e=>e.textContent)});
 await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});await sleep(250);await snap('04-mural-vertical-rotado');
 rect=await page.$eval('#graffiti-canvas',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
 for(let row=1;row<=10;row++){
   if(await page.$eval('#graffiti',e=>e.hidden))break;
   let y=rect.y+rect.h*row/11;
   await page.mouse.move(rect.x+rect.w*.03,y);await page.mouse.down();await page.mouse.move(rect.x+rect.w*.97,y,{steps:18});await page.mouse.up();
 }
 await sleep(850);await record('mural completado con ratón tras rotar');await snap('05-mural-salida');
 await page.setViewport({width:1100,height:700,isMobile:true,hasTouch:true,deviceScaleFactor:1});await sleep(250);
 // Keyboard full dance, no direct press()/debug completion. Test Enter on focused directional button first.
 await tp('dance.center');await page.keyboard.press('KeyE');await sleep(600);await record('baile entrada');await snap('06-baile-desktop');
 await page.focus('#dance-pad button[data-k="up"]');await page.keyboard.press('Enter');await sleep(100);
 log.push({label:'Enter en botón arriba',idx:await page.evaluate(()=>window.__bk.activities[4].idx)});save();
 await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');
 await page.$eval('#btn-pause',e=>e.click());await record('pausa tras ronda1');await sleep(2600);await record('baile ronda avanza en pausa',{round:await page.evaluate(()=>window.__bk.activities[4].round)});await page.$eval('#btn-resume',e=>e.click());
 for(const seq of [['ArrowLeft','ArrowDown','ArrowRight'],['ArrowUp','ArrowLeft','ArrowDown']]){for(const k of seq)await page.keyboard.press(k);await sleep(2400);}
 await sleep(1500);await record('baile ganado mediante flechas');await snap('07-baile-salida');
 for(const vp of [{width:390,height:844},{width:844,height:390},{width:667,height:375}]){
  await page.setViewport({...vp,isMobile:true,hasTouch:true,deviceScaleFactor:1});await sleep(300);await tp('dance.center');await page.keyboard.press('KeyE');await sleep(650);await snap(`08-baile-${vp.width}x${vp.height}`);
  const layout=await page.evaluate(()=>{const ids=['dance-seq','dance-pad','dance-msg','dance-exit','btn-pause'];return Object.fromEntries(ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return [id,{x:r.x,y:r.y,w:r.width,h:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id,font:getComputedStyle(e).fontSize}]}));});log.push({label:'layout baile',vp,layout});save();await page.click('#dance-exit');
 }
 // Actual CDP multitouch: stick + camera, cancel cleanup, same finger button crouch.
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});await tp('tut.start');
 const client=await page.createCDPSession();
 const touch=async(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:4,radiusY:4,force:1}))});
 const yaw0=await page.evaluate(()=>window.__bk.rig.yaw);
 await touch('touchStart',[[1,70,650]]);await touch('touchMove',[[1,70,600]]);await sleep(500);
 await touch('touchStart',[[1,70,600],[2,290,400]]);await touch('touchMove',[[1,70,600],[2,330,400]]);await sleep(300);await record('táctil stick y cámara',{yaw0,yaw1:await page.evaluate(()=>window.__bk.rig.yaw)});
 await touch('touchCancel',[]);await sleep(100);log.push({label:'cancel táctil',input:await page.evaluate(()=>({read:window.__bk.input.read(),owners:[...window.__bk.input.owners],jump:window.__bk.input.jumpHeld}))});save();await snap('09-touch');
 // Accessibility, audio decoded endpoint continuity, and viewport final constraints.
 log.push({label:'semántica UI',data:await page.evaluate(()=>({live:document.querySelectorAll('[aria-live]').length,dialogs:document.querySelectorAll('[role="dialog"]').length,canvasLabel:document.querySelector('#game').getAttribute('aria-label'),focused:document.activeElement?.id,viewport:document.querySelector('meta[name=viewport]').content}))});
 const audio=await page.evaluate(async()=>{const m=window.__bk.audio.music;const out=[];for(const t of m.tracks.values()){await m.ensure(t.id);const b=t.buffer;if(!b){out.push({id:t.id,error:t.error});continue;}let jump=0,local=0,peak=0,rms=0;for(let c=0;c<b.numberOfChannels;c++){const d=b.getChannelData(c);jump=Math.max(jump,Math.abs(d[0]-d[d.length-1]));for(let k=1;k<Math.min(4410,d.length);k++)local=Math.max(local,Math.abs(d[k]-d[k-1]));for(let k=0;k<d.length;k++){peak=Math.max(peak,Math.abs(d[k]));rms+=d[k]*d[k];}}out.push({id:t.id,duration:b.duration,sampleRate:b.sampleRate,peak,rms:Math.sqrt(rms/(b.length*b.numberOfChannels)),endpointJump:jump,first100msMaxDelta:local});}return out;});log.push({label:'buffers audio',audio});save();
 // Valid save setup for preview/final; this is not progression evidence.
 await page.evaluate(()=>{const g=window.__bk;g.state.p.collected=g.manifest.fries.map(f=>f.id);Object.keys(g.state.p.activities).forEach(k=>g.state.p.activities[k]=true);g.state.p.bridgeReached=true;g.state.p.revealSeen=true;g.state.p.finalDone=true;g.state.save();});await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.__bk&&!document.querySelector('#btn-start').disabled);await page.click('#btn-start');await page.evaluate(()=>window.__bk.showPreview());await sleep(1200);
 for(const vp of [{width:390,height:844},{width:844,height:390},{width:667,height:375}]){await page.setViewport({...vp,isMobile:true,hasTouch:true});await sleep(300);await snap(`10-preview-${vp.width}x${vp.height}`);log.push({label:'preview layout',vp,data:await page.evaluate(()=>Object.fromEntries(['final','visual-slot','btn-play-preview','btn-close-final'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return[id,{top:r.top,bottom:r.bottom,left:r.left,right:r.right,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id}]})))});save();}
}
if(['routes','access2','navigation'].includes(mode)){
 // Isolated physical pickup access per ID. Activity flags are fixture setup here, not proof of activity completion.
 await page.evaluate(()=>{const g=window.__bk;Object.keys(g.state.p.activities).forEach(k=>g.state.p.activities[k]=true);g.state.p.bridgeReached=true;g.park.setBridgeOpen(true);for(const z of ['no_me_guillo','nosvamosdeaqui','yinyang','tratratra','fashion_girl'])g.revealReward(z);});
 const fries=await page.evaluate(()=>window.__bk.manifest.fries.map(f=>({id:f.id,access:f.access,pos:f.pos.toArray(),zone:f.zone})));
 if(mode!=='navigation')for(const fry of fries){
  // Skip bridge intermediate to test with complete unteleported ascent in the next branch.
  const setup=await page.evaluate(f=>{const g=window.__bk,T=window.__bkTHREE,S=g.park.sector(f.zone),p=new T.Vector3(...f.pos);let dist=f.access==='ollie'?7.5:3.8;
   let dir=p.clone().setY(0).normalize();let ground=f.pos[1];
   if(f.access==='roll')dir=new T.Vector3(-Math.cos(S.out(0)),0,Math.sin(S.out(0)));
   if(f.access==='ollie')ground=0;
   if(f.id==='no_me_guillo.hidden')dir=new T.Vector3(Math.cos(S.out(28)),0,-Math.sin(S.out(28)));
   if(f.id==='yinyang.hidden')dir=new T.Vector3(-Math.cos(S.out(0)),0,Math.sin(S.out(0)));
   if(f.id==='fashion_girl.hidden')dir=new T.Vector3(-Math.cos(S.out(-12)),0,Math.sin(S.out(-12)));
   if(f.id==='tratratra.medium')return null;
   if(f.id==='tratratra.hidden')ground=0;
   p.addScaledVector(dir,-dist).setY(ground);g.skater.teleport(p,Math.atan2(dir.x,dir.z));g.rig.snapBehind(g.skater);return {from:p.toArray(),dir:dir.toArray(),respawns:g.skater.respawns};},fry);
  if(!setup){log.push({label:'patata acceso',id:fry.id,result:'reserved for bridge ascent'});continue;}
  await sleep(400);await snap('fry-'+fry.id+'-before');
  let r=await drive(fry.pos,5,{jumpDistance:fry.access==='ollie'?3.2:0,crouch:fry.access==='crouch',until:d=>d.total>0&&d.dist<.7});
  // record actual collection; target proximity alone is never counted as success.
  const result=await page.evaluate(id=>({collected:window.__bk.state.isCollected(id),respawns:window.__bk.skater.respawns}),fry.id);
  await snap('fry-'+fry.id+'-after');await hold(['KeyW'],650);await record('patata acceso',{id:fry.id,access:fry.access,setup,result,route:r,returnPos:await page.evaluate(()=>window.__bk.skater.footPos.toArray())});
 }
 if(mode!=='access2'){
 // Single setup at bridge foot, successive platforms traversed with keyboard+ollie in real time.
 await fresh();await page.evaluate(()=>{const g=window.__bk,S=g.park.sector('tratratra');g.skater.teleport(S.P(29.1,30),S.ccw(30));g.rig.snapBehind(g.skater);});await sleep(350);log.push({label:'SETUP bridge foot only'});
 const stages=await page.evaluate(()=>window.__bk.park.bridgeStages.map(b=>b.c.toArray()));
 for(let k=0;k<stages.length;k++){const r=await drive(stages[k],7,{jumpDistance:4.3,until:d=>d.stage>=k&&d.ground});await record('puente plataforma '+(k+1),{route:r});await snap('bridge-stage-'+k);if(await page.evaluate(k=>window.__bk.activities[3].stage<k,k))break;}
 const talk=await page.evaluate(()=>window.__bk.park.zones.get('act.bridgeTalk').pos.toArray());const r=await drive(talk,7,{until:d=>d.dist<1.7});await record('puente zona charla',{route:r});await page.keyboard.press('KeyE');await sleep(450);await snap('bridge-dialog');await sleep(3700);await record('puente después charla');
 log.push({label:'puente trigger detalle',data:await page.evaluate(()=>{const g=window.__bk,p=g.skater.footPos,b=g.park.deckBox,dx=p.x-b.c.x,dz=p.z-b.c.z;return {p:p.toArray(),deck:{c:b.c.toArray(),h:b.h.toArray(),yaw:b.yaw},local:[dx*Math.cos(b.yaw)-dz*Math.sin(b.yaw),p.y+.6-b.c.y,dx*Math.sin(b.yaw)+dz*Math.cos(b.yaw)],stage:g.activities[3].stage};})});save();
 // Finish from current reached platform by moving onto the physical deck center; no additional teleport.
 const deckTarget=await page.evaluate(()=>{const p=window.__bk.park.deckBox.c;return[p.x,p.y-1,p.z];});const dr=await drive(deckTarget,7,{until:d=>d.dist<1.3});await record('puente centro tablero',{route:dr});await drive(talk,5,{until:d=>d.dist<2.6});await page.keyboard.press('KeyE');await sleep(500);await snap('bridge-dialog-2');await sleep(3800);await record('puente charla segunda aproximación');
 // Tutorial continuous route; includes both learning path and safe stop/orbit.
 await fresh();await tp('tut.start');await page.keyboard.press('KeyE');await record('tutorial comienzo');
 let gates=await page.evaluate(()=>window.__bk.park.tutorialGates.map(b=>b.c.toArray()));
 for(let k=0;k<gates.length;k++){const r=await drive(gates[k],9,{crouch:k===3,jumpDistance:k===2?4.0:0,until:d=>d.step>k});await record('tutorial puerta '+(k+1),{route:r});await snap('tutorial-gate-'+k);if(await page.evaluate(k=>window.__bk.activities[1].step<=k,k))break;}
 let pad=await page.evaluate(()=>window.__bk.park.zones.get('tut.campad').pos.toArray());await drive(pad,6,{until:d=>d.dist<.6});await hold(['KeyS'],550);await sleep(1000);await hold(['KeyJ'],1300);await record('tutorial parar y mirar');await snap('tutorial-camera');
 // Both camera orientations at every sector's checkpoint, genuine resize (no page reload).
 for(const zone of ['no_me_guillo','nosvamosdeaqui','yinyang','tratratra','fashion_girl']){
  const cp=await page.evaluate(z=>{const g=window.__bk;return g.manifest.checkpoints.find(c=>c.zone===z)??{pos:g.park.sector(z).P(28,0),heading:g.park.sector(z).out(0)};},zone);await page.evaluate(cp=>{const g=window.__bk;g.skater.teleport(new window.__bkTHREE.Vector3(cp.pos.x,cp.pos.y,cp.pos.z),cp.heading);g.rig.snapBehind(g.skater);},cp);
  for(const vp of [{width:390,height:844},{width:844,height:390}]){await page.setViewport({...vp,isMobile:true,hasTouch:true});await sleep(550);await snap('sector-'+zone+'-'+vp.width);}
 }
 // Centre fixture at 20/20 for reveal/backflip, using normal W/Space thereafter.
 await page.evaluate(()=>{const g=window.__bk;g.state.p.collected=g.manifest.fries.map(f=>f.id);Object.keys(g.state.p.activities).forEach(k=>g.state.p.activities[k]=true);g.state.p.revealSeen=false;g.state.p.finalDone=false;g.state.save();g.beginReveal();});await sleep(400);await snap('center-reveal');await sleep(3500);await tp('final.approach');
 const take=await page.evaluate(()=>window.__bk.manifest.get('final.takeoff').pos.toArray());await drive(take,5,{jumpDistance:5.8,until:d=>d.y>1.5});await sleep(450);await snap('center-backflip');await sleep(4200);await record('final teclado desde aproximación');await snap('center-preview-or-failure');
 }
}
if(mode==='diagnostics'){
 const hit=()=>page.evaluate(()=>Object.fromEntries(['btn-pause','btn-crouch','btn-jump','btn-cam'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return[id,{rect:[r.x,r.y,r.width,r.height],hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id}]})));
 log.push({label:'hit test controles exploración',data:await hit()});save();
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await sleep(200);log.push({label:'hit test vertical',data:await hit()});save();await snap('diagnostic-controls');
 // Keyboard camera while moving: timestamp remains stale, automatic return fights manual input.
 await tp('tut.start');await hold(['KeyW','KeyJ'],1200);await record('órbita J en marcha',{lastManual:await page.evaluate(()=>({stamp:window.__bk.input.lastCamInput,now:performance.now(),yaw:window.__bk.rig.yaw,orbit:window.__bk.rig.orbitTotal}))});
 // Partial minigames reload: actual strokes/keys, no debug completion.
 await tp('mural.paint');await page.keyboard.press('KeyE');await page.waitForFunction(()=>document.querySelector('#graffiti-canvas').dataset.ready==='1');
 const r=await page.$eval('#graffiti-canvas',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});await page.mouse.move(r.x+r.w*.3,r.y+r.h*.4);await page.mouse.down();await page.mouse.move(r.x+r.w*.7,r.y+r.h*.4,{steps:10});await page.mouse.up();
 const before=await page.$eval('#graffiti-pct',e=>e.textContent);await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.__bk&&!document.querySelector('#btn-start').disabled);await page.click('#btn-start');await tp('mural.paint');await page.keyboard.press('KeyE');await page.waitForFunction(()=>document.querySelector('#graffiti-canvas').dataset.ready==='1');log.push({label:'recarga mural parcial',before,after:await page.$eval('#graffiti-pct',e=>e.textContent)});save();await page.click('#graffiti-exit');
 // Pause through visibility change via switching to a foreground page in headless is not a physical mobile lock test.
 await tp('dance.center');await page.keyboard.press('KeyE');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');await sleep(100);const tab=await browser.newPage();await tab.goto('about:blank');await tab.bringToFront();await sleep(3000);await page.bringToFront();log.push({label:'background baile',data:await page.evaluate(()=>({hidden:document.hidden,paused:window.__bk.paused,round:window.__bk.activities[4].round,locked:window.__bk.activities[4].locked,mode:window.__bk.mode}))});save();await tab.close();if(await page.$eval('#pause',e=>!e.hidden))await page.click('#btn-resume');await page.click('#dance-exit');
 // Six dance clips: actual running mixers, near fixed view. These are pose review setups, not activity progress.
 await page.setViewport({width:844,height:390,isMobile:true,hasTouch:true});await tp('dance.center');
 const clips=await page.evaluate(()=>[...window.__bk.visual.actions.keys()].filter(n=>/Danc|Breakdance|Hip_Hop/i.test(n)));log.push({label:'clips disponibles',clips});save();
 for(const clip of clips){await page.evaluate(n=>{const g=window.__bk;g.skater.frozen=true;g.setMode('activity');g.visual.play(n,{loop:true,fade:.25});const a=g.manifest.get('cam.dance');g.rig.toFixed({pos:a.pos,target:g.skater.footPos.clone().add(new window.__bkTHREE.Vector3(0,1,0)),hfov:45});},clip);await sleep(700);await snap('dance-clip-'+clip);await sleep(500);await snap('dance-clip-'+clip+'-later');}
 await page.evaluate(()=>{const g=window.__bk;g.skater.frozen=false;g.setMode('explore');});
 // Local source surfaces: launch from profile entrance, W across actual physics, record height and respawns.
 const surfaces=await page.evaluate(()=>window.__bk.park.b.colliders.filter(x=>['nmg_quarter','quarter_bola','bank','nmg_bank','nmg_step','trick_kicker','tut_kicker','cajon','bound'].includes(x.name)).map((x,i)=>({i,name:x.name,handle:x.c.handle,pos:x.c.translation(),rot:x.c.rotation(),shape:x.c.shape.type,vertices:x.c.shape.vertices?Array.from(x.c.shape.vertices):null,half:x.c.shape.halfExtents??null})));
 fs.writeFileSync(path.join(OUT,'surfaces.json'),JSON.stringify(surfaces,null,2));
 for(const name of ['nmg_quarter','quarter_bola','bank','nmg_bank','trick_kicker','tut_kicker']){
  const item=surfaces.find(s=>s.name===name);if(!item||!item.vertices)continue;
  const fixture=await page.evaluate(item=>{const g=window.__bk,T=window.__bkTHREE,v=item.vertices,ys=[];for(let i=0;i<v.length;i+=3)if(v[i+1]>.1)ys.push({x:v[i],y:v[i+1],z:v[i+2]});const min=Math.min(...ys.map(p=>p.y));const low=ys.filter(p=>p.y<min+.02);const high=ys.filter(p=>p.y>Math.max(...ys.map(p=>p.y))-.02);const mean=a=>new T.Vector3(a.reduce((s,p)=>s+p.x,0)/a.length,0,a.reduce((s,p)=>s+p.z,0)/a.length);const lo=mean(low),hi=mean(high),dir=hi.clone().sub(lo).normalize();const start=lo.clone().addScaledVector(dir,-4);g.skater.teleport(start,Math.atan2(dir.x,dir.z));g.rig.snapBehind(g.skater);return{start:start.toArray(),end:hi.clone().addScaledVector(dir,4).toArray(),r:g.skater.respawns};},item);
  await sleep(250);const route=await drive(fixture.end,4);await record('superficie '+name,{fixture,route,respawns:await page.evaluate(()=>window.__bk.skater.respawns)});await snap('surface-'+name);
 }
 // Audio all-source peak and cross-track RMS with actual offline game chain, full 30-second excerpts.
 const audio=await page.evaluate(async()=>{const m=window.__bk.audio.music,out=[];for(const t of m.tracks.values()){await m.ensure(t.id);if(!t.buffer)continue;const s=await window.__bkRenderState(t.buffer,m.params,1,0,Math.min(t.buffer.duration,30));let peak=0;for(let c=0;c<2;c++){const d=s.buffer.getChannelData(c);for(const x of d)peak=Math.max(peak,Math.abs(x));}out.push({id:t.id,rms:s.rms,peak,masterDefaultPeak:peak*.9*.8});}return out;});log.push({label:'radio 4/4 full excerpt offline',audio});save();
 // Corrupt save and denied storage should recover without exception, expose user-facing notification.
 await page.evaluate(()=>localStorage.setItem('bellakaventuras.remake.save','{invalid'));await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.__bk&&!document.querySelector('#btn-start').disabled);log.push({label:'guardado corrupto',data:await page.evaluate(()=>({total:window.__bk.state.total,note:document.querySelector('#load-text').textContent}))});save();
}
if(mode==='finish'){
 // Pointer hit ownership: use ordinary clicks, then check mode. No DOM .click() bypass.
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.click('#btn-pause');await record('clic pausa en exploración');await tp('npc.la_pantera');
 const rect=await page.$eval('#btn-action',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id};});
 await page.click('#btn-action');await record('clic HABLAR en exploración',{rect});await page.keyboard.press('KeyE');await sleep(300);await snap('pantera-portrait-talk');await sleep(2700);
 // Bridge hidden radial entry: the low floor is .16 m, one keyboard crouch pass from an unblocked side.
 await page.evaluate(()=>{const g=window.__bk,S=g.park.sector('tratratra'),f=g.manifest.fries.find(f=>f.id==='tratratra.hidden');const p=f.pos.clone().setY(0),d=p.clone().normalize();g.skater.teleport(p.clone().addScaledVector(d,-3.7),Math.atan2(d.x,d.z));g.rig.snapBehind(g.skater);});await sleep(300);
 const hidden=await page.evaluate(()=>window.__bk.manifest.fries.find(f=>f.id==='tratratra.hidden').pos.toArray());
 await hold(['KeyC','KeyW'],1800);await record('TRATRATRA escondida radial',{collected:await page.evaluate(()=>window.__bk.state.isCollected('tratratra.hidden'))});await snap('bridge-under-radial');
 // Continuous bridge ascent, then deliberate transfer through gap onto higher deck with an additional ollie.
 await fresh();await page.evaluate(()=>{const g=window.__bk,S=g.park.sector('tratratra');g.skater.teleport(S.P(29.1,30),S.ccw(30));g.rig.snapBehind(g.skater);});await sleep(300);
 const stages=await page.evaluate(()=>window.__bk.park.bridgeStages.map(b=>b.c.toArray()));
 for(let k=0;k<stages.length;k++)await drive(stages[k],7,{jumpDistance:4.3,until:d=>d.stage>=k&&d.ground});
 const transfer=await page.evaluate(()=>{const g=window.__bk,S=g.park.sector('tratratra');const da=23-(4.2/29.1)/(Math.PI/180)*4.5;return S.P(33.3,da,4.2).toArray();});
 const route=await drive(transfer,6,{jumpDistance:3.4,until:d=>d.dist<1.2&&d.y>4.15});await record('transferencia P5 tablero',{route});await snap('bridge-transfer');
 const talk=await page.evaluate(()=>window.__bk.park.zones.get('act.bridgeTalk').pos.toArray());await drive(talk,6,{until:d=>d.dist<3});await page.keyboard.press('KeyE');await sleep(400);await record('charla puente tras ascenso');await snap('bridge-talk-after-route');await sleep(3800);
 const reward=await page.evaluate(()=>window.__bk.manifest.fries.find(f=>f.id==='tratratra.activity').pos.toArray());await drive(reward,4,{until:d=>d.dist<.6});await record('premio puente después ascenso',{collected:await page.evaluate(()=>window.__bk.state.isCollected('tratratra.activity'))});
 const bottom=await page.evaluate(()=>window.__bk.manifest.get('bridge.rampBottom').pos.toArray());const down=await drive(bottom,6);await record('bajada puente',{route:down});await snap('bridge-down');
 // Stage 5 isolated input requirement (explicit setup), not full tutorial route evidence.
 await fresh();await tp('tut.start');await page.keyboard.press('KeyE');await page.evaluate(()=>{const g=window.__bk;g.activities[1].step=4;g.activities[1].orbit0=-1;const p=g.park.zones.get('tut.campad').pos;g.skater.teleport(p,0);g.rig.snapBehind(g.skater);});await sleep(250);await hold(['KeyJ'],1300);await record('tutorial fase5 fixture parado',{completed:await page.evaluate(()=>window.__bk.state.p.activities.skateTutorial)});await snap('tutorial-stage5-fixture');
 // Explicit surface entrances from construction coordinates, rather than inferred geometry centroids.
 for(const kind of ['stairs','quarter','kicker']){
  await page.evaluate(kind=>{const g=window.__bk,S=g.park.sector('no_me_guillo');g.skater.teleport(S.P(kind==='stairs'?28.7:kind==='quarter'?33.4:28,kind==='stairs'?10:4),S.out(kind==='stairs'?10:4));g.rig.snapBehind(g.skater);},kind);await sleep(300);
  if(kind==='kicker')await tp('trick.approach');
  const samples=await page.evaluate(async()=>{const g=window.__bk,arr=[];window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));const t0=performance.now();while(performance.now()-t0<3200){arr.push({p:g.skater.footPos.toArray(),v:g.skater.speed,ground:g.skater.grounded,r:g.skater.respawns});await new Promise(r=>setTimeout(r,80));}window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));return arr;});
  log.push({label:'entrada explícita '+kind,samples});save();await snap('explicit-'+kind);
 }
}
if(mode==='closure'){
 await page.setViewport({width:1100,height:700,isMobile:true,hasTouch:true});
 // Hidden potato physical tunnel: enough time to traverse, actual C+W throughout.
 await page.evaluate(()=>{const g=window.__bk,S=g.park.sector('tratratra'),f=g.manifest.fries.find(f=>f.id==='tratratra.hidden'),p=f.pos.clone().setY(0),d=p.clone().normalize();g.skater.teleport(p.clone().addScaledVector(d,-3.7),Math.atan2(d.x,d.z));g.rig.snapBehind(g.skater);});await sleep(300);await hold(['KeyC','KeyW'],5000);await record('patata TRATRATRA oculta paso completo',{collected:await page.evaluate(()=>window.__bk.state.isCollected('tratratra.hidden'))});await snap('closure-bridge-hidden');
 // Bridge partial progress reload: reach platforms using normal inputs then reload, transfer via normal ollie.
 await fresh();await page.evaluate(()=>{const g=window.__bk,S=g.park.sector('tratratra');g.skater.teleport(S.P(29.1,30),S.ccw(30));g.rig.snapBehind(g.skater);});await sleep(300);
 const stages=await page.evaluate(()=>window.__bk.park.bridgeStages.map(b=>b.c.toArray()));for(let k=0;k<stages.length;k++)await drive(stages[k],7,{jumpDistance:4.3,until:d=>d.stage>=k&&d.ground});
 const savedBefore=await page.evaluate(()=>({stage:window.__bk.activities[3].stage,save:window.__bk.state.p.checkpoint,bridge:window.__bk.state.p.bridgeReached}));await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.__bk&&!document.querySelector('#btn-start').disabled);await page.click('#btn-start');await sleep(300);log.push({label:'reload puente parcial',before:savedBefore,after:await page.evaluate(()=>({stage:window.__bk.activities[3].stage,pos:window.__bk.skater.footPos.toArray(),bridge:window.__bk.state.p.bridgeReached}))});save();
 const transfer=await page.evaluate(()=>{const S=window.__bk.park.sector('tratratra');const da=23-(4.2/29.1)/(Math.PI/180)*4.5;return S.P(33.3,da,4.2).toArray();});const transferRoute=await drive(transfer,6,{jumpDistance:3.4,until:d=>d.dist<1.2&&d.y>4.15});await record('reload puente arriba sin desbloqueo',{route:transferRoute});await snap('closure-bridge-reload');
 // Isolated conversation framing/reward/return from the legitimate deck anchor; no claim of continuous ascent here.
 await page.evaluate(()=>{const g=window.__bk;g.state.setBridgeReached();g.park.setBridgeOpen(true);});await tp('bridge.top');await page.keyboard.press('KeyE');await sleep(600);await record('charla puente aislada');await snap('closure-bridge-talk-landscape');await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await sleep(300);await snap('closure-bridge-talk-portrait');await sleep(3000);
 const rew=await page.evaluate(()=>window.__bk.manifest.fries.find(f=>f.id==='tratratra.activity').pos.toArray());await drive(rew,4,{until:d=>d.dist<.6});await record('recompensa puente charla real',{collected:await page.evaluate(()=>window.__bk.state.isCollected('tratratra.activity'))});
 // Missing sixth dance's actual runtime preview.
 await page.setViewport({width:844,height:390,isMobile:true,hasTouch:true});await tp('dance.center');await page.evaluate(()=>{const g=window.__bk;g.skater.frozen=true;g.setMode('activity');g.visual.play('FunnyDancing_02',{loop:true,fade:.25});const a=g.manifest.get('cam.dance');g.rig.toFixed({pos:a.pos,target:g.skater.footPos.clone().add(new window.__bkTHREE.Vector3(0,1,0)),hfov:45});});await sleep(650);await snap('dance-clip-FunnyDancing_02');await sleep(500);await snap('dance-clip-FunnyDancing_02-later');await page.evaluate(()=>{const g=window.__bk;g.skater.frozen=false;g.setMode('explore');});
 // Roof/wall recovery and accessible perimeter paths in real time: six directional sweeps from ring checkpoints.
 for(let i=0;i<6;i++){await page.evaluate(i=>{const g=window.__bk,T=window.__bkTHREE,th=(i*60+10)*Math.PI/180,p=new T.Vector3(44*Math.sin(th),0,-44*Math.cos(th));g.skater.teleport(p,Math.atan2(-Math.cos(th),-Math.sin(th)));g.rig.snapBehind(g.skater);},i);await sleep(200);await hold(['KeyW'],2000);await record('paseo exterior barrido '+i);await snap('outer-sweep-'+i);}
 // Check storage failure after start, loss-of-focus release, Escape behavior, real hit tests in desktop.
 await page.evaluate(()=>{const g=window.__bk;g.state.storage={getItem(){return null;},setItem(){throw new DOMException('quota','QuotaExceededError');}};g.state.save();});log.push({label:'storage failure posterior',data:await page.evaluate(()=>({persistent:window.__bk.state.persistent,note:document.querySelector('#save-note').textContent}))});save();
 await page.keyboard.press('Escape');await record('Escape en exploración');
 await page.keyboard.down('KeyW');await sleep(250);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));log.push({label:'blur libera teclas',input:await page.evaluate(()=>window.__bk.input.read())});await page.keyboard.up('KeyW');save();
 // Orthographic map evidence with markers already existing; screenshot-only camera setup.
 await page.setViewport({width:1100,height:900,isMobile:true,hasTouch:true});await page.evaluate(()=>{const g=window.__bk,T=window.__bkTHREE;g.autoMode=true;const c=new T.OrthographicCamera(-66,66,54,-54,.1,300);c.position.set(0,120,0);c.up.set(0,0,-1);c.lookAt(0,0,0);g.paused=true;g.render=()=>g.renderer.render(g.scene,c);});await sleep(200);await snap('mapa-completo');
}
if(mode==='targeted'){
 // Tunnel A/B: only modify live test collider in variant B, source files stay unchanged.
 for(const raised of [false,true]){
  await fresh();const info=await page.evaluate(raised=>{const g=window.__bk,T=window.__bkTHREE,f=g.manifest.fries.find(f=>f.id==='tratratra.hidden'),p=f.pos.clone().setY(0),d=p.clone().normalize();const nearby=g.park.b.colliders.filter(x=>x.name==='tt_plat').sort((a,b)=>{const aa=a.c.translation(),bb=b.c.translation();return Math.hypot(aa.x-f.pos.x,aa.z-f.pos.z)-Math.hypot(bb.x-f.pos.x,bb.z-f.pos.z);});const roof=nearby[0],tr=roof.c.translation();if(raised)roof.c.setTranslation({x:tr.x,y:tr.y+.1,z:tr.z});g.skater.teleport(p.clone().addScaledVector(d,-3.7),Math.atan2(d.x,d.z));g.rig.snapBehind(g.skater);return{roof:tr,roofHeightChange:raised?.1:0,goal:f.pos.toArray(),start:g.skater.footPos.toArray()};},raised);await sleep(250);await hold(['KeyC','KeyW'],5000);await record('túnel puente A/B',{raised,info,collected:await page.evaluate(()=>window.__bk.state.isCollected('tratratra.hidden'))});await snap('target-tunnel-'+raised);
 }
 // Full phone touch activities after anchored setup, no fake JavaScript PointerEvent and no .click bypass.
 await fresh();await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await tp('dance.center');await page.keyboard.press('KeyE');const cdp=await page.createCDPSession();
 const tap=async(sel)=>{const r=await page.$eval(sel,e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,160)};});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y,id:1,force:1,radiusX:4,radiusY:4}]});await sleep(90);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});log.push({label:'tap baile',sel,r,state:await page.evaluate(()=>({round:window.__bk.activities[4].round,idx:window.__bk.activities[4].idx,locked:window.__bk.activities[4].locked,msg:document.querySelector('#dance-msg').textContent}))});save();};
 for(const seq of [['up','right','up'],['left','down','right'],['up','left','down']]){for(const k of seq){await tap(`#dance-pad button[data-k="${k}"]`);await sleep(330);}await sleep(2600);}await sleep(1700);await record('baile táctil completo',{completed:await page.evaluate(()=>window.__bk.state.p.activities.danceCombo)});
 if(await page.$eval('#dance',e=>!e.hidden))await page.click('#dance-exit');
 await tp('mural.paint');await page.keyboard.press('KeyE');await page.waitForFunction(()=>document.querySelector('#graffiti-canvas').dataset.ready==='1');const r=await page.$eval('#graffiti-canvas',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});
 for(let i=1;i<12;i++){if(await page.$eval('#graffiti',e=>e.hidden))break;const y=r.y+r.h*i/12;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:r.x+r.w*.02,y}]});for(let k=1;k<=15;k++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:r.x+r.w*(.02+.96*k/15),y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}await sleep(750);await record('grafiti táctil completo',{completed:await page.evaluate(()=>window.__bk.state.p.activities.graffiti)});
 // Normal desktop browser controls also have camera-layer overlap; settings transition may reload and is explicit.
 await page.setViewport({width:1100,height:700,isMobile:false,hasTouch:false});await page.waitForFunction(()=>window.__bk&&!document.querySelector('#btn-start').disabled);if(await page.$eval('#start',e=>!e.hidden))await page.click('#btn-start');await tp('npc.la_pantera');await page.click('#btn-action');await record('desktop clic HABLAR',{hit:await page.$eval('#btn-action',e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id;})});
 // Real-time cross-sector mixing at three positions, decoded samples already tested offline. Track count includes fade tails.
 for(const [id,th] of [['borde exterior',0],['borde centro',36],['centro',108]]){
  await page.evaluate(([id,th])=>{const g=window.__bk,T=window.__bkTHREE;const r=id==='centro'?21:id==='borde centro'?24:32;const a=th*Math.PI/180;g.skater.teleport(new T.Vector3(r*Math.sin(a),0,-r*Math.cos(a)),a);g.rig.snapBehind(g.skater);},[id,th]);await sleep(1800);log.push({label:'mezcla frontera',id,data:await page.evaluate(()=>({weights:window.__bk.musicDebug,sounding:window.__bk.audio.music.soundingIds,max:window.__bk.audio.music.stats.maxSimultaneous,levels:[...window.__bk.audio.music.tracks].map(([id,t])=>({id,level:t.level,gain:t.gain,playing:t.playing}))}))});save();
 }
}
if(mode==='map'){
 await page.setViewport({width:1100,height:900,isMobile:true,hasTouch:true});await page.evaluate(()=>{const g=window.__bk,T=window.__bkTHREE;g.autoMode=true;g.paused=true;const c=new T.OrthographicCamera(-66,66,54,-54,.1,300);c.position.set(0,120,0);c.up.set(0,0,-1);c.lookAt(0,0,0);g.render=()=>g.renderer.render(g.scene,c);document.querySelector('#hud').hidden=true;document.querySelector('#touch').hidden=true;});await sleep(400);await snap('mapa-completo');
}
if(mode==='audio-races'){
 // Physical approach to junction of two exterior sectors and centre; observe fade tails in real RAF.
 await page.evaluate(()=>{const g=window.__bk,T=window.__bkTHREE;g.skater.teleport(new T.Vector3(0,0,-30),0);g.rig.snapBehind(g.skater);});await sleep(1500);
 await page.evaluate(()=>{window.__mix=[];const g=window.__bk;const end=performance.now()+3500;const next=()=>{const m=g.audio.music;window.__mix.push({clock:g.clock,r:Math.hypot(g.skater.footPos.x,g.skater.footPos.z),ids:m.soundingIds,playing:[...m.tracks].filter(([id,t])=>t.playing).map(([id,t])=>({id,gain:t.gain})),weights:g.musicDebug});if(performance.now()<end)requestAnimationFrame(next);};next();});
 await hold(['KeyW'],3300);log.push({label:'croisement physique 3 sources',samples:await page.evaluate(()=>window.__mix)});save();
 // New browser page save fixture, delay centre audio so closing preview races with decoding/network.
 await fresh();await page.evaluate(()=>{const g=window.__bk;g.state.p.collected=g.manifest.fries.map(f=>f.id);Object.keys(g.state.p.activities).forEach(k=>g.state.p.activities[k]=true);g.state.p.bridgeReached=true;g.state.p.revealSeen=true;g.state.p.finalDone=true;g.state.save();});
 await page.setRequestInterception(true);page.on('request',r=>{if(r.url().includes('secrenovio-test'))setTimeout(()=>r.continue().catch(()=>{}),2500);else r.continue().catch(()=>{});});
 await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.__bk&&!document.querySelector('#btn-start').disabled);await page.click('#btn-start');await page.evaluate(()=>{void window.__bk.showPreview();});await sleep(350);await page.click('#btn-close-final');await record('preview cerrado antes de cargar audio');await sleep(3100);await record('preview audio termina descarga tras salir',{previewPlaying:await page.evaluate(()=>window.__bk.audio.music.previewPlaying),worldGain:await page.evaluate(()=>window.__bk.audio.music.worldGain)});await snap('preview-race-explore');
}
if(mode==='final-touch'){
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.evaluate(()=>{const g=window.__bk;g.state.p.collected=g.manifest.fries.map(f=>f.id);Object.keys(g.state.p.activities).forEach(k=>g.state.p.activities[k]=true);g.state.p.revealSeen=false;g.state.p.finalDone=false;g.state.save();g.beginReveal();});await sleep(500);await page.click('#btn-pause');await record('revelación en pausa');await sleep(1000);await record('revelación tras 1s pausada');await page.click('#btn-resume');await sleep(3400);await tp('final.approach');
 const c=await page.createCDPSession(),send=async(type,pts)=>c.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([id,x,y])=>({id,x,y,force:1,radiusX:4,radiusY:4}))});
 await send('touchStart',[[1,70,640]]);await send('touchMove',[[1,70,585]]);
 const t=Date.now();let pressed=false;
 while(Date.now()-t<5500){const state=await page.evaluate(()=>({hot:document.querySelector('#btn-jump').classList.contains('hot'),mode:window.__bk.mode}));if(state.hot){const r=await page.$eval('#btn-jump',e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];});await send('touchStart',[[1,70,585],[2,...r]]);await sleep(90);await send('touchEnd',[[1,70,585]]);pressed=true;break;}await sleep(40);}
 await send('touchEnd',[]);await record('SALTO táctil final',{pressed});await sleep(500);await snap('final-touch-flip');
 if(await page.evaluate(()=>window.__bk.mode==='final')){await page.click('#btn-pause');await record('final en pausa');await sleep(1000);await record('final tras 1s pausado');await page.click('#btn-resume');}
 await sleep(4200);await record('final táctil resultado',{unlocked:await page.evaluate(()=>window.__bk.state.previewUnlocked)});await snap('final-touch-preview');
}
}catch(e){log.push({label:'HARNESS ERROR',error:String(e),stack:e.stack});save();console.error(e);process.exitCode=1;}
finally{save();await browser.close();}
