"use strict";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$("#game"),ctx=canvas.getContext("2d");
const setup=$("#setup"), arenaPanel=$("#arenaPanel"), result=$("#result"), countdown=$("#countdown");
const faceSources=[
  ["imagens/expressoes/mat_happy.png","imagens/expressoes/mat_serious.png","imagens/expressoes/mat_sad.png"],
  ["imagens/expressoes/ald_happy.png","imagens/expressoes/ald_serious.png","imagens/expressoes/ald_sad.png"]
];
const faces=faceSources.map(group=>group.map(src=>{const im=new Image();im.src=src;return im;}));
const allImages=faces.flat();
let selectedPlayer=0, level="intermediario", running=false, paused=false, raf=0, last=0, aiClock=0;
let projectiles=[];
let statusNoticeUntil=0;
let playerWasPowered=false;
let powerNoticeTimer=0;
const keys={left:false,right:false,jump:false,attack:false,special:false};
const LEVELS={chan:{speed:165,reaction:.62,attackGap:1.45,accuracy:.48,aggression:.43},intermediario:{speed:205,reaction:.34,attackGap:.92,accuracy:.72,aggression:.68},dificil:{speed:245,reaction:.17,attackGap:.58,accuracy:.91,aggression:.9}};
const ground=465;
function makeFighter(i){return {i,x:i===0?260:840,y:ground,vx:0,vy:0,w:80,h:210,hp:100,facing:i===0?1:-1,onGround:true,cooldown:0,specialCooldown:0,attackTime:0,hitTime:0,blocking:false,dead:false,powered:false};}
let fighters=[makeFighter(0),makeFighter(1)];
$$('.fighter-card').forEach((b)=>b.onclick=()=>{$$('.fighter-card').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');selectedPlayer=Number(b.dataset.player);});
$$('.levels button').forEach(b=>b.onclick=()=>{$$('.levels button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');level=b.dataset.level;});
$('#start').onclick=startMatch; $('#rematch').onclick=startMatch; $('#menu').onclick=showMenu; $('#quit').onclick=showMenu;
function showMenu(){running=false;cancelAnimationFrame(raf);arenaPanel.classList.add('hidden');setup.classList.remove('hidden');result.classList.add('hidden');}
async function startMatch(){await Promise.all(allImages.map(im=>im.complete?Promise.resolve():new Promise(r=>im.onload=r)));fighters=[makeFighter(0),makeFighter(1)];projectiles=[];playerWasPowered=false;clearTimeout(powerNoticeTimer);$('#powerNotice').classList.add('hidden');running=false;paused=false;result.classList.add('hidden');setup.classList.add('hidden');arenaPanel.classList.remove('hidden');updateHud();let n=3;countdown.textContent=n;const timer=setInterval(()=>{n--;countdown.textContent=n>0?n:n===0?'LUTEM!':'';if(n<0){clearInterval(timer);countdown.textContent='';running=true;last=performance.now();raf=requestAnimationFrame(loop);}},650);}
function loop(t){if(!running)return;const dt=Math.min(.033,(t-last)/1000||0);last=t;update(dt);draw();raf=requestAnimationFrame(loop);}
function controlHuman(f,dt){const accel=900,max=230;if(keys.left){f.vx=Math.max(f.vx-accel*dt,-max);f.facing=-1;}else if(keys.right){f.vx=Math.min(f.vx+accel*dt,max);f.facing=1;}else f.vx*=Math.pow(.001,dt);if(keys.jump&&f.onGround){f.vy=-520;f.onGround=false;keys.jump=false;}if(keys.attack){tryAttack(f,false);keys.attack=false;}if(keys.special){tryAttack(f,true);keys.special=false;}}
function controlAI(ai,human,dt){const cfg=LEVELS[level];aiClock-=dt;if(aiClock>0)return;aiClock=cfg.reaction*(.7+Math.random()*.6);const dist=human.x-ai.x,ad=Math.abs(dist);ai.facing=dist>0?1:-1;ai.vx=0;if(ad>125)ai.vx=Math.sign(dist)*cfg.speed;else if(ad<72&&Math.random()>.65)ai.vx=-Math.sign(dist)*cfg.speed*.65;if(ai.onGround&&Math.random()<.07*(level==='dificil'?2:1)){ai.vy=-470;ai.onGround=false;}if(ad<145&&ai.cooldown<=0&&Math.random()<cfg.aggression){if(Math.random()<cfg.accuracy)tryAttack(ai,Math.random()<(level==='dificil'?.32:.16));else ai.cooldown=cfg.attackGap;} }
function tryAttack(f,special){
  if(f.dead||f.cooldown>0||(special&&f.specialCooldown>0))return;
  if(special&&!f.powered){
    if(f.i===selectedPlayer){statusNoticeUntil=performance.now()+1200;$('#roundStatus').textContent='KAMEHAMEHA BLOQUEADO';}
    return;
  }
  if(special){
    f.attackTime=.65;f.cooldown=.9;f.specialCooldown=3.6;
    setTimeout(()=>launchKamehameha(f),260);
  }else{
    f.attackTime=.26;f.cooldown=.42;
    setTimeout(()=>resolvePunch(f),110);
  }
}
function launchKamehameha(f){
  if(!running||f.dead)return;
  projectiles.push({owner:f.i,startX:f.x+f.facing*54,x:f.x+f.facing*70,y:f.y-112,dir:f.facing,life:.62,maxLife:.62,hit:false});
}
function resolvePunch(attacker){
  if(!running||attacker.dead)return;
  const defender=fighters[1-attacker.i],dist=Math.abs(defender.x-attacker.x),toward=(defender.x-attacker.x)*attacker.facing>0;
  if(dist<125&&toward&&Math.abs(defender.y-attacker.y)<100)applyDamage(defender,10+Math.floor(Math.random()*7),attacker.facing,false,attacker.i);
}
function applyDamage(defender,damage,direction,special,owner){
  defender.hp=Math.max(0,defender.hp-damage);defender.vx=direction*(special?470:250);defender.vy=special?-220:-90;defender.hitTime=special?.42:.28;updateHud();
  if(defender.hp<=0){defender.dead=true;setTimeout(()=>endMatch(owner),600);}
}
function updateProjectiles(dt){
  projectiles.forEach(p=>{
    p.life-=dt;
    const target=fighters[1-p.owner];
    const oldX=p.x;
    p.x+=p.dir*1180*dt;
    const minX=Math.min(p.startX,p.x)-45,maxX=Math.max(p.startX,p.x)+45;
    const withinBeam=target.x>=minX&&target.x<=maxX;
    if(!p.hit&&!target.dead&&withinBeam&&Math.abs(p.y-(target.y-110))<110){
      p.hit=true;
      p.x=target.x+p.dir*48;
      p.life=Math.max(p.life,.34);
      applyDamage(target,22+Math.floor(Math.random()*8),p.dir,true,p.owner);
    }
    if(p.x<-100||p.x>canvas.width+100)p.life=Math.min(p.life,.15);
  });
  projectiles=projectiles.filter(p=>p.life>0);
}
function update(dt){
  const human=fighters[selectedPlayer],ai=fighters[1-selectedPlayer];
  const diff=fighters[0].hp-fighters[1].hp;
  fighters[0].powered=diff>=15&&fighters[0].hp>0&&fighters[1].hp>0;
  fighters[1].powered=diff<=-15&&fighters[0].hp>0&&fighters[1].hp>0;
  const playerIsPowered=fighters[selectedPlayer].powered;
  if(playerIsPowered&&!playerWasPowered)showPowerNotice();
  if(!playerIsPowered&&playerWasPowered)hidePowerNotice();
  playerWasPowered=playerIsPowered;
  controlHuman(human,dt);controlAI(ai,human,dt);fighters.forEach(f=>{f.cooldown=Math.max(0,f.cooldown-dt);f.specialCooldown=Math.max(0,f.specialCooldown-dt);f.attackTime=Math.max(0,f.attackTime-dt);f.hitTime=Math.max(0,f.hitTime-dt);f.vy+=1280*dt;f.x+=f.vx*dt;f.y+=f.vy*dt;if(f.y>=ground){f.y=ground;f.vy=0;f.onGround=true;}f.x=Math.max(65,Math.min(canvas.width-65,f.x));});const a=fighters[0],b=fighters[1];if(Math.abs(a.x-b.x)<85){const push=(85-Math.abs(a.x-b.x))/2;a.x-=push;a.x=Math.max(65,a.x);b.x+=push;b.x=Math.min(canvas.width-65,b.x);}updateProjectiles(dt); }
function showPowerNotice(){
  const notice=$('#powerNotice');
  clearTimeout(powerNoticeTimer);
  notice.classList.remove('hidden');
  powerNoticeTimer=setTimeout(()=>notice.classList.add('hidden'),3200);
}
function hidePowerNotice(){
  clearTimeout(powerNoticeTimer);
  $('#powerNotice').classList.add('hidden');
}
function updateHud(){fighters.forEach((f,i)=>{const bar=$('#hp'+i),text=$('#hpText'+i);bar.style.width=f.hp+'%';bar.className='fill '+(f.hp>50?'green':f.hp>20?'yellow':'red');text.textContent=f.hp;});if(performance.now()>=statusNoticeUntil){const powered=fighters.find(f=>f.powered);$('#roundStatus').textContent=!running?'PREPARE-SE!':powered?(powered.i===selectedPlayer?'SUPER BAGRE: VOCÊ':'SUPER BAGRE: PC'):(selectedPlayer===0?'VOCÊ × PC':'PC × VOCÊ');}}
function endMatch(winner){running=false;cancelAnimationFrame(raf);$('#winnerText').textContent=winner===selectedPlayer?'VOCÊ É O CAMPEÃO DOS BAGRES!':'O PC VENCEU A BATALHA!';result.classList.remove('hidden');}
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);const sky=ctx.createLinearGradient(0,0,0,560);sky.addColorStop(0,'#0a3650');sky.addColorStop(.6,'#092037');sky.addColorStop(1,'#07101d');ctx.fillStyle=sky;ctx.fillRect(0,0,1100,560);ctx.globalAlpha=.22;for(let i=0;i<18;i++){ctx.fillStyle=i%2?'#28d8ff':'#725cff';ctx.beginPath();ctx.arc((i*79+35)%1100,45+(i%5)*42,2+(i%3)*2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;ctx.fillStyle='#0b1721';ctx.fillRect(0,ground+12,1100,100);ctx.strokeStyle='#31c9df55';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,ground+12);ctx.lineTo(1100,ground+12);ctx.stroke();fighters.forEach(drawFighter);drawProjectiles();}

function drawProjectiles(){
  projectiles.forEach(p=>{
    const progress=1-p.life/p.maxLife;
    const pulse=.9+.12*Math.sin(performance.now()/35);
    const x1=p.startX,x2=p.x;
    ctx.save();ctx.lineCap='round';
    ctx.shadowColor='#126dff';ctx.shadowBlur=38;
    ctx.strokeStyle='rgba(35,92,255,.38)';ctx.lineWidth=105*pulse;ctx.beginPath();ctx.moveTo(x1,p.y);ctx.lineTo(x2,p.y);ctx.stroke();
    ctx.shadowColor='#00eaff';ctx.shadowBlur=28;
    ctx.strokeStyle='#00eaff';ctx.lineWidth=68*pulse;ctx.beginPath();ctx.moveTo(x1,p.y);ctx.lineTo(x2,p.y);ctx.stroke();
    ctx.strokeStyle='#89ffff';ctx.lineWidth=39*pulse;ctx.beginPath();ctx.moveTo(x1,p.y);ctx.lineTo(x2,p.y);ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=15*pulse;ctx.beginPath();ctx.moveTo(x1,p.y);ctx.lineTo(x2,p.y);ctx.stroke();
    const headX=x2;const r=49*pulse;
    const glow=ctx.createRadialGradient(headX,p.y,2,headX,p.y,r*1.45);glow.addColorStop(0,'#ffffff');glow.addColorStop(.28,'#d8ffff');glow.addColorStop(.57,'#00eaff');glow.addColorStop(.82,'#1671ff');glow.addColorStop(1,'rgba(20,70,255,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(headX,p.y,r*1.45,0,Math.PI*2);ctx.fill();
    ctx.translate(headX,p.y);ctx.rotate(progress*5);
    ctx.fillStyle='rgba(0,225,255,.82)';
    for(let i=0;i<16;i++){ctx.rotate(Math.PI/8);ctx.beginPath();ctx.moveTo(r*.65,-5);ctx.lineTo(r*(1.25+(i%3)*.18),0);ctx.lineTo(r*.65,5);ctx.closePath();ctx.fill();}
    ctx.restore();
  });
}
function drawGoldenHair(headY){
  ctx.save();ctx.translate(0,headY-34);ctx.fillStyle='#ffd52e';ctx.strokeStyle='#fff09a';ctx.lineWidth=3;ctx.shadowColor='#ffe74f';ctx.shadowBlur=23;
  ctx.beginPath();ctx.moveTo(-44,8);ctx.lineTo(-57,-28);ctx.lineTo(-31,-17);ctx.lineTo(-34,-65);ctx.lineTo(-9,-34);ctx.lineTo(2,-83);ctx.lineTo(17,-37);ctx.lineTo(43,-70);ctx.lineTo(36,-25);ctx.lineTo(61,-39);ctx.lineTo(45,8);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
function drawAura(f,headY){
  ctx.save();ctx.globalAlpha=.36+.12*Math.sin(performance.now()/90);ctx.strokeStyle='#ffe23b';ctx.lineWidth=7;ctx.shadowColor='#ffe83d';ctx.shadowBlur=30;ctx.beginPath();ctx.ellipse(0,-100,76,145,0,0,Math.PI*2);ctx.stroke();ctx.restore();
}
function drawFighter(f){ctx.save();ctx.translate(f.x,f.y);if(f.dead)ctx.rotate(f.i===0?-1.25:1.25);const recoil=f.hitTime>0?(Math.sin(f.hitTime*80)*7):0;ctx.translate(recoil,0);ctx.strokeStyle=f.i===selectedPlayer?'#b7fbff':'#ffdb8a';ctx.lineWidth=10;ctx.lineCap='round';ctx.shadowColor=f.i===selectedPlayer?'#29e4ff':'#ff922b';ctx.shadowBlur=13;const bodyTop=-125,headY=-174;if(f.powered)drawAura(f,headY);ctx.beginPath();ctx.moveTo(0,bodyTop);ctx.lineTo(0,-50);ctx.stroke();const attacking=f.attackTime>0;ctx.beginPath();ctx.moveTo(0,-105);ctx.lineTo(f.facing*(attacking?92:55),attacking?-112:-78);ctx.moveTo(0,-105);ctx.lineTo(-f.facing*48,-75);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-50);ctx.lineTo(-37,0);ctx.moveTo(0,-50);ctx.lineTo(39,0);ctx.stroke();ctx.shadowBlur=0;if(f.powered)drawGoldenHair(headY);ctx.save();ctx.beginPath();ctx.arc(0,headY,49,0,Math.PI*2);ctx.clip();const expression=f.hp>60?0:f.hp>30?1:2;const im=faces[f.i][expression];ctx.drawImage(im,-55,headY-55,110,110);ctx.restore();ctx.strokeStyle=f.i===selectedPlayer?'#5ef2ff':'#ffc85c';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,headY,51,0,Math.PI*2);ctx.stroke();if(attacking){ctx.fillStyle='#fff';ctx.font='900 25px Arial';ctx.fillText(f.specialCooldown>2.7?'⚡':'💥',f.facing*105,-118);}if(f.powered){ctx.fillStyle='#ffe342';ctx.font='900 15px Arial';ctx.textAlign='center';ctx.fillText('SUPER BAGRE',0,-242);}ctx.restore();}
function setAction(action,value){if(action==='left'||action==='right')keys[action]=value;else if(value)keys[action]=true;}
const keyMap={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyW:'jump',ArrowUp:'jump',KeyF:'attack',Space:'attack',KeyG:'special'};
addEventListener('keydown',e=>{const a=keyMap[e.code];if(a){e.preventDefault();setAction(a,true);}});addEventListener('keyup',e=>{const a=keyMap[e.code];if(a&&(a==='left'||a==='right'))setAction(a,false);});
$$('.mobile-controls button').forEach(b=>{const a=b.dataset.action;['pointerdown','touchstart'].forEach(ev=>b.addEventListener(ev,e=>{e.preventDefault();setAction(a,true)}));['pointerup','pointercancel','pointerleave','touchend'].forEach(ev=>b.addEventListener(ev,e=>{e.preventDefault();if(a==='left'||a==='right')setAction(a,false)}));});
draw();
