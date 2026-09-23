// Preview only changes transforms; commit the lineup once the pointer is released.
let boardPointer=null, suppressBoardClickUntil=0;
document.head.insertAdjacentHTML('beforeend','<style>#board .unit-card,#bench .unit-card{touch-action:none}.board-drag-ghost{position:fixed!important;z-index:10000!important;pointer-events:none!important;opacity:.88;transform:translate(-50%,-50%);margin:0!important}.board-drag-source{opacity:.15!important}</style>');
document.addEventListener('pointerdown',ev=>{
  if(ev.button!==0||s.busy||s.phase!=='备战'||boardPointer)return;
  const card=ev.target.closest('#board .unit-card,#bench .unit-card');if(!card)return;
  const type=card.dataset.side,index=Number(card.dataset.slot)-1;
  boardPointer={id:ev.pointerId,type,index,card,x:ev.clientX,y:ev.clientY,active:false};
  card.classList.add('board-pressed');
},true);
// Cancel the inline native drag handler too: a canceled drag has no dragend.
document.addEventListener('dragstart',ev=>{if(boardPointer){ev.preventDefault();ev.stopImmediatePropagation()}},true);
document.head.insertAdjacentHTML('beforeend','<style>.card.board-pressed{opacity:.72}</style>');
function resetBoardPreview(p){
  for(const item of p.slots||[]){item.el.style.transform='';item.el.style.transition=''}
  p.card.classList.remove('board-drag-source','board-pressed','dragging');p.ghost?.remove();
}
function previewBoardPointer(ev){
  const p=boardPointer;if(!p||p.id!==ev.pointerId)return;
  if(ev.pointerType==='mouse'&&(ev.buttons&1)===0){resetBoardPreview(p);boardPointer=null;return}
  if(!p.active){
    if(Math.hypot(ev.clientX-p.x,ev.clientY-p.y)<8)return;
    p.active=true;clearTimeout(longPressTimer);document.querySelector('.detail-pop')?.remove();
    p.slots=[...document.querySelectorAll('#board > .board-slot')].map(el=>({el,rect:el.getBoundingClientRect(),index:Number(el.dataset.index)}));
    const rect=p.card.getBoundingClientRect();p.ghost=p.card.cloneNode(true);
    p.ghost.classList.remove('board-pressed','dragging');
    p.ghost.classList.add('board-drag-ghost');p.ghost.removeAttribute('id');
    p.ghost.style.width=rect.width+'px';p.ghost.style.height=rect.height+'px';
    p.ghost.removeAttribute('data-side');p.ghost.removeAttribute('data-slot');
    document.body.appendChild(p.ghost);p.card.classList.add('board-drag-source');
  }
  ev.preventDefault();p.ghost.style.left=ev.clientX+'px';p.ghost.style.top=ev.clientY+'px';
  const bounds=document.getElementById('board').getBoundingClientRect();
  p.inside=ev.clientX>=bounds.left&&ev.clientX<=bounds.right&&ev.clientY>=bounds.top&&ev.clientY<=bounds.bottom;
  const remaining=p.slots.filter(x=>p.type!=='board'||x.index!==p.index);
  p.gap=remaining.filter(x=>ev.clientX>x.rect.left+x.rect.width/2).length;
  const width=p.slots[0]?.rect.width||p.card.getBoundingClientRect().width;
  const step=p.slots.length>1?p.slots[1].rect.left-p.slots[0].rect.left:width+8;
  const count=remaining.length+1,start=bounds.left+bounds.width/2-(count*step-step+width)/2;
  remaining.forEach((item,i)=>{
    item.el.style.transition='transform 140ms ease';
    const target=i+(i>=p.gap?1:0);
    item.el.style.transform=p.inside&&(p.type==='board'||remaining.length<7)?'translateX('+(start+target*step-item.rect.left)+'px)':'';
  });
}
document.addEventListener('pointermove',previewBoardPointer,{capture:true,passive:false});
async function finishBoardPointer(ev){
  const p=boardPointer;if(!p||p.id!==ev.pointerId)return;
  boardPointer=null;resetBoardPreview(p);if(!p.active)return;
  suppressBoardClickUntil=Date.now()+500;ev.preventDefault();
  if(ev.type==='pointercancel'||s.busy||s.phase!=='备战')return;
  if(typeof tutorial!=='undefined'&&tutorial.active&&!(tutorial.step==='deploy'&&p.type==='bench'&&p.inside))return;
  if(p.inside){
    s.dragging={type:p.type,index:p.index};
    const gap=p.type==='board'&&p.gap>p.index?p.gap+1:p.gap;
    try{await dropToBoardInsert({preventDefault(){},stopPropagation(){}},gap)}finally{s.dragging=null}
  }else if(['board','bench'].includes(p.type)&&document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.shop-panel')){
    await sellCard(p.type,p.index);draw();
  }
}
document.addEventListener('pointerup',finishBoardPointer,{capture:true,passive:false});
document.addEventListener('pointercancel',finishBoardPointer,{capture:true,passive:false});
window.addEventListener('blur',()=>{if(boardPointer){resetBoardPreview(boardPointer);boardPointer=null}});
// Window capture runs before the existing document-level tap-to-deploy handler.
window.addEventListener('click',ev=>{if(Date.now()<suppressBoardClickUntil){ev.preventDefault();ev.stopImmediatePropagation()}},true);

// Guided tutorial uses the real board/actions and an isolated server player.
const tutorial={active:false,step:'',pending:false,saved:null};
const tutorialSteps={
  welcome:['欢迎来到酒馆','我们一起完成三回合练习。教程没有倒计时，请按提示操作；每段说明都由你点击继续。','', 'buy'],
  buy:['购买第一张棋子','商店里都是乌有。单击一张购买，或将它拖到备战区。棋子统一花费 3 金币。','#shop',''],
  deploy:['让乌有上场','把备战区的乌有拖到我的棋盘；也可以先点乌有，再点棋盘。','#bench,#board',''],
  mechanics:['认识棋子机制','不同棋子拥有不同机制，例如上场、遗计、先手与化境。理解这些机制，才能让阵容互相配合。','#board','nothing'],
  nothing:['乌有：上场','乌有的机制是「上场：获得 1 张天有四时」。你刚将乌有放上棋盘，因此效果已自动触发。','#board','skillNote'],
  skillNote:['你的第一张技能卡','看，备战区已经获得【天有四时】！它能提高一个友方棋子的攻击和生命，并提供本回合的后勤生命加成。','#bench','useSkill'],
  useSkill:['给乌有使用技能','将【天有四时】拖到乌有身上，或点击下面的「对乌有使用」。强化后的乌有能够战胜本教程的对手。','#bench,#board',''],
  restriction:['部署不可撤回','已上场的棋子不能直接移回备战区，但可以调整站位或拖入商店出售。三连合成的金卡会自动回到备战区。','#board','fight1'],
  fight1:['开始第一场战斗','点击「结束备战」。接下来棋子会自动战斗，无需操作。敌方是原始属性的 U-Official。','#fight',''],
  battle1:['正在自动战斗','观察棋子攻击和伤害结算。战斗完成后，我们会继续第二回合。','',''],
  upgrade:['第二回合：升级商店','你获得了回合收入。点击「升级商店」，提高可以购买的棋子星级。教程中商店仍只出售乌有。','#upgrade',''],
  shopExplain:['商店已升级','更高等级会解锁更多棋子与技能卡。普通游戏中你可以刷新寻找阵容，也可以锁定商店保留棋子。','#shop','fight2'],
  fight2:['进入下一回合','再次点击「结束备战」。第二回合的敌人仍是原始属性的 U-Official。','#fight',''],
  battle2:['第二场自动战斗','战斗结束后，我们将学习三连合成。','',''],
  buy2:['第三回合：凑齐三张','再购买两张乌有。棋盘和备战区的同名普通棋子合计达到三张，就会自动合成金卡；黄色箭头提示可三连。','#shop',''],
  gold:['三连成功！','三张乌有已合成金卡并回到备战区。金卡拥有更强的基础属性，并保留参与合成棋子的额外属性。','#bench','goldMechanic'],
  goldMechanic:['更强的机制','金卡乌有上场能获得 2 张【天有四时】，普通版只有 1 张。其他金卡的机制也通常更强，请留意金卡描述。','#bench','goldReward'],
  goldReward:['金卡上场奖励','金卡上场还会获得奖励技能卡：使用后可挑选更高星级的棋子，最高为 6 星。合理安排三连与商店升级，能帮助你完善阵容。','#bench','finish'],
  finish:['教程完成','你已经学会本游戏的基本操作和大致规则了，请享受游戏吧！','','exit']
};
document.head.insertAdjacentHTML('beforeend',`<style>
.tutorial-box{position:fixed;z-index:45000;top:8px;left:50%;transform:translateX(-50%);width:min(540px,85vw);padding:14px 20px;background:#101b20f5;border:2px solid #d4e700;box-shadow:0 8px 30px #000a;color:#fff;animation:tutorialIn .25s ease-out}
.tutorial-box h3{margin:0 0 6px;color:#e4f44a;font-size:20px}.tutorial-box p{margin:6px 0 10px;line-height:1.6}.tutorial-box small{color:#b6c2c6}.tutorial-box .btn{margin-right:8px}.tutorial-focus{outline:3px solid #ffe333!important;outline-offset:4px;animation:tutorialGlow 1s ease-in-out infinite}
.tutorial-cue{position:fixed;z-index:44000;pointer-events:none;font-size:32px;color:#ffe333;text-shadow:0 0 8px #000;animation:tutorialPoint .9s ease-in-out infinite}
@keyframes tutorialGlow{50%{outline-color:#fff9a0;box-shadow:0 0 18px #ffe33388}}@keyframes tutorialPoint{50%{transform:translateY(9px)}}@keyframes tutorialIn{from{opacity:0;margin-top:-10px}to{opacity:1;margin-top:0}}
@media(max-height:600px){.tutorial-box{left:auto;right:8px;top:4px;transform:none;width:36vw;padding:8px 12px;font-size:12px}.tutorial-box h3{font-size:15px}.tutorial-box p{line-height:1.35}.tutorial-box .btn{padding:6px 9px}}
@media(prefers-reduced-motion:reduce){.tutorial-box,.tutorial-focus,.tutorial-cue{animation:none}}
</style>`);
$('#startGame').insertAdjacentHTML('afterend','<button class="btn secondary" id="startTutorial">新手教程</button>');
function tutorialGo(step){
  tutorial.step=step;tutorial.pending=false;
  if(step==='exit'){exitTutorial();return}
  const [title,body,,next]=tutorialSteps[step];
  document.querySelector('.tutorial-box')?.remove();
  const box=document.createElement('section');box.className='tutorial-box';box.setAttribute('aria-live','polite');
  box.innerHTML='<small>新手教程 · '+Math.min(s.round||1,3)+' / 3 回合 · 无限备战</small><h3>'+title+'</h3><p>'+body+'</p>'+(next?'<button class="btn primary" data-tutorial-next> '+(next==='exit'?'返回开始界面':'继续')+' </button>':step==='useSkill'?'<button class="btn primary" data-tutorial-skill>对乌有使用</button>':'<small>请完成高亮区域的操作</small>')+' <button class="btn" data-tutorial-exit>退出教程</button>';
  document.body.appendChild(box);
  box.querySelector('[data-tutorial-next]')?.addEventListener('click',()=>tutorialGo(next));
  box.querySelector('[data-tutorial-exit]').onclick=exitTutorial;
  box.querySelector('[data-tutorial-skill]')?.addEventListener('click',async()=>{
    if(tutorial.pending)return;tutorial.pending=true;
    const index=s.bench.findIndex(u=>u?.effect==='four_seasons');s.dragging={type:'bench',index};
    try{await dropSkillToUnit({preventDefault(){},stopPropagation(){}},0)}finally{s.dragging=null;tutorial.pending=false}
  });
  const panel=step==='deploy'||step==='mechanics'||step==='nothing'||step==='restriction'?'board-panel':step.includes('gold')||step==='skillNote'||step==='useSkill'?'bench-panel':'shop-panel';
  showMobilePanel(panel);tutorialPaint();
}
function tutorialPaint(){
  document.querySelectorAll('.tutorial-focus').forEach(e=>e.classList.remove('tutorial-focus'));
  document.querySelector('.tutorial-cue')?.remove();
  if(!tutorial.active)return;
  if(s.phase==='备战')$('#phase').textContent='备战 ∞';
  const selector=tutorialSteps[tutorial.step]?.[2];if(!selector)return;
  const targets=[...document.querySelectorAll(selector)];targets.forEach(e=>e.classList.add('tutorial-focus'));
  const target=targets[0],r=target?.getBoundingClientRect();if(!r)return;
  const cue=document.createElement('div');cue.className='tutorial-cue';cue.textContent='▼';cue.style.left=(r.left+r.width/2-16)+'px';cue.style.top=Math.max(0,r.top-32)+'px';document.body.appendChild(cue);
}
function tutorialObserve(){
  if(!tutorial.active||s.mergeAnimating)return;
  if(tutorial.step==='buy'&&s.bench.some(u=>u?.id==='Mr.Nothing'))tutorialGo('deploy');
  else if(tutorial.step==='deploy'&&compact(s.board).some(u=>u.id==='Mr.Nothing'))tutorialGo('mechanics');
  else if(tutorial.step==='useSkill'&&!s.bench.some(u=>u?.effect==='four_seasons'))tutorialGo('restriction');
  else if(tutorial.step==='upgrade'&&s.shopLevel>=2)tutorialGo('shopExplain');
  else if(tutorial.step==='buy2'&&s.bench.some(u=>u?.id==='Mr.Nothing'&&u.golden))tutorialGo('gold');
  else tutorialPaint();
}
const normalApi=api;
api=async(url,body)=>{
  if(tutorial.active&&url==='/api/shop')return Array.from({length:s.shopSlots||4},()=>cloneData(baseUnitById('Mr.Nothing')));
  if(tutorial.active&&url==='/api/enemy')return pad([cloneData(baseUnitById('U-Official'))]);
  return normalApi(url,body);
};
const normalDraw=draw;draw=function(){normalDraw();tutorialObserve()};
const normalPrep=startPrep;startPrep=async function(){
  if(!tutorial.active)return normalPrep();
  clearInterval(s.timer);s.timer=null;s.phase='备战';s.busy=false;s.skipBattle=false;s.skipBattleAvailable=false;s.prepSeconds=Infinity;
  s.enemy=await api('/api/enemy');s.shop=await api('/api/shop');
  tutorialGo(s.round===1?'welcome':s.round===2?'upgrade':'buy2');draw();
};
const normalFight=fight;fight=async function(){
  if(tutorial.active){if(!['fight1','fight2'].includes(tutorial.step))return;tutorialGo(s.round===1?'battle1':'battle2')}
  await normalFight();
  if(tutorial.active&&s.phase==='备战'&&tutorial.step.startsWith('battle'))tutorialGo(s.round===1?'fight1':'fight2');
};
$('#fight').onclick=()=>fight();
const normalBuy=buyShopIndex;buyShopIndex=async function(...args){
  if(!tutorial.active)return normalBuy(...args);
  if(tutorial.pending||!['buy','buy2'].includes(tutorial.step))return;
  tutorial.pending=true;try{await normalBuy(...args)}finally{tutorial.pending=false}
};
const normalUpgrade=upgradeShop;upgradeShop=async function(){
  if(!tutorial.active)return normalUpgrade();
  if(tutorial.pending||tutorial.step!=='upgrade')return;
  tutorial.pending=true;try{await normalUpgrade()}finally{tutorial.pending=false}
};
$('#upgrade').onclick=()=>upgradeShop();
function tutorialAllowed(event){
  if(!tutorial.active)return true;
  if(event.target.closest('.tutorial-box'))return !tutorial.pending;
  if(tutorial.pending)return false;
  if(event.type==='contextmenu'||event.type==='dblclick')return false;
  const step=tutorial.step,type=event.type;
  if(['buy','buy2'].includes(step))return !!event.target.closest(type==='drop'||type==='dragover'||type==='dragenter'?'#bench':'#shop .unit-card');
  if(step==='deploy')return !!event.target.closest('#bench .unit-card,#board');
  if(step==='useSkill')return !!event.target.closest('#bench .skill,#board');
  if(step==='upgrade')return !!event.target.closest('#upgrade');
  if(step==='fight1'||step==='fight2')return !!event.target.closest('#fight');
  return false;
}
for(const type of ['click','dblclick','contextmenu','pointerdown','dragstart','dragenter','dragover','drop'])window.addEventListener(type,event=>{
  if(!tutorialAllowed(event)){event.preventDefault();event.stopImmediatePropagation()}
},{capture:true,passive:false});
window.addEventListener('resize',()=>{if(tutorial.active)tutorialPaint()});
function exitTutorial(){
  if(tutorial.pending||s.phase==='战斗中')return;
  clearInterval(s.timer);if(boardPointer){resetBoardPreview(boardPointer);boardPointer=null}
  tutorial.active=false;Object.assign(s,tutorial.saved);s.started=false;s.dragging=null;
  document.querySelector('.tutorial-box')?.remove();document.querySelector('.tutorial-cue')?.remove();document.querySelectorAll('.tutorial-focus').forEach(e=>e.classList.remove('tutorial-focus'));
  delete s.tutorialPlayerId;$('#gameShell').classList.add('hidden');$('#startScreen').classList.remove('hidden');$('#log').innerHTML='';
}
$('#startTutorial').onclick=async()=>{
  if(tutorial.active)return;
  tutorial.saved=cloneData(s);tutorial.active=true;tutorial.step='welcome';s.tutorialPlayerId='tutorial-'+Date.now().toString(36);s.started=false;
  try{await start()}catch(e){tutorial.pending=false;s.phase='备战';exitTutorial();alert('教程启动失败：'+e.message)}
};

// Resolve game state synchronously; serialize only the visual celebration.
const tripleAnimations=[];
document.head.insertAdjacentHTML('beforeend',`<style>
.card.merge-hidden{visibility:hidden!important}.triple-stage{position:fixed;inset:0;z-index:60000;background:#080d1470;touch-action:none}
.triple-stage .card{position:fixed!important;margin:0!important;pointer-events:none!important;visibility:visible!important;min-height:0!important}
.triple-title{position:fixed;top:18%;left:0;width:100%;text-align:center;color:#ffe477;font-size:clamp(24px,4vw,48px);font-weight:bold;text-shadow:0 0 22px #ffc400;pointer-events:none}
</style>`);
function captureTripleSources(occ){return occ.map(o=>{
  const el=cardEl(o.w,o.i+1)||document.querySelector('#'+o.w+' .slot[data-slot="'+(o.i+1)+'"]')||document.getElementById(o.w);
  const rect=el.getBoundingClientRect();
  return {unit:cloneData(o.u),rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}};
})}
function queueTripleAnimation(sources,golden){
  tripleAnimations.push({sources,golden});(s.mergeHidden??=new Set()).add(golden);
  if(s.mergeAnimating)return;s.mergeAnimating=true;
  // The current purchase/deploy handler finishes drawing before animation starts.
  queueMicrotask(playTripleAnimations);
}
async function playTripleAnimations(){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration=ms=>reduced?Math.min(ms,100):ms;
  const stage=document.createElement('div');stage.className='triple-stage';stage.setAttribute('role','status');stage.setAttribute('aria-label','三连合成中');document.body.appendChild(stage);
  const animate=async(el,frames,ms)=>{try{await el.animate(frames,{duration:duration(ms),easing:'ease-in-out',fill:'forwards'}).finished}catch{}};
  const ghost=(unit,width,height)=>{const wrap=document.createElement('div');wrap.innerHTML=card(unit,'merge',0);const el=wrap.firstElementChild;el.style.width=width+'px';el.style.height=height+'px';el.removeAttribute('onclick');el.removeAttribute('oncontextmenu');stage.appendChild(el);return el};
  try{
    while(tripleAnimations.length){
      const {sources,golden}=tripleAnimations.shift();stage.replaceChildren();
      const width=Math.min(150,innerWidth*.18),height=Math.min(260,innerHeight*.55),cx=innerWidth/2-width/2,cy=innerHeight/2-height/2;
      const title=document.createElement('div');title.className='triple-title';title.textContent='三连合成';stage.appendChild(title);
      const cards=sources.map(x=>ghost(x.unit,width,height));
      await Promise.all(cards.map((el,i)=>animate(el,[{left:sources[i].rect.left+'px',top:sources[i].rect.top+'px',transform:'scale(.85)',opacity:1},{left:(cx+(i-1)*width*.9)+'px',top:cy+'px',transform:'scale(1)',opacity:1}],520)));
      await Promise.all(cards.map(el=>animate(el,[{opacity:1},{left:cx+'px',top:cy+'px',transform:'scale(.65)',opacity:0}],360)));
      cards.forEach(el=>el.remove());
      const result=ghost(golden,width,height);result.style.left=cx+'px';result.style.top=cy+'px';title.textContent='✦ '+golden.name+' · 金卡 ✦';
      await animate(result,[{opacity:0,transform:'scale(.5)',filter:'brightness(3)'},{opacity:1,transform:'scale(1.12)',filter:'brightness(1.3)'},{opacity:1,transform:'scale(1)',filter:'brightness(1)'}],550);
      const index=s.bench.indexOf(golden),target=index>=0?cardEl('bench',index+1):null,rect=(target||document.getElementById('bench')).getBoundingClientRect();
      await animate(result,[{left:cx+'px',top:cy+'px',transform:'scale(1)'},{left:rect.left+'px',top:rect.top+'px',transform:'scale('+Math.min(rect.width/width,rect.height/height)+')',transformOrigin:'top left',opacity:1}],550);
      s.mergeHidden.delete(golden);draw();
    }
  }finally{stage.remove();tripleAnimations.length=0;s.mergeHidden?.clear();s.mergeAnimating=false;draw()}
}
for(const type of ['pointerdown','click','contextmenu','dragstart','drop','keydown'])window.addEventListener(type,e=>{if(s.mergeAnimating){e.preventDefault();e.stopImmediatePropagation()}},{capture:true,passive:false});
