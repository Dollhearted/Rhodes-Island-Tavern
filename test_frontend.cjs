const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
// The bot realm must boot alongside the real immutable frontend bindings.
function testArenaAgentBoot(){
  const ctx=vm.createContext({URLSearchParams,location:{search:'?arena-agent=test-ai'},s:{},window:{},
    start(){},fight(){},startPrep(){},loadEnemy(){},draw(){},updateHud(){},upgradeShop(){},queueTripleAnimation(){},
    captureTripleSources(){},animatePrepAssimilate(){},chooseThree(){},chooseBlessingStat(){}});
  vm.runInContext("const log=()=>{};",ctx);
  vm.runInContext(fs.readFileSync('arena.js','utf8'),ctx);
  assert.equal(ctx.s.arenaPlayerId,'test-ai');
  for(const method of ['init','step','submit','result','prepare'])assert.equal(typeof ctx.window.arenaAgent[method],'function');
}
testArenaAgentBoot();
function testRecommendationGuidesAffectAI(){
  const code=fs.readFileSync('arena.js','utf8');
  const unit=(id,name)=>({id,name,card_type:'unit',attack:3,max_hp:3,stars:2,faction:'拉特兰'});
  const chosen=unit('chosen','推荐卡'),bridge=unit('bridge','过渡卡'),other=unit('other','普通卡');
  const ctx=vm.createContext({s:{cards:[chosen,bridge,other],board:[],bench:[],round:3,hp:50},
    localStorage:{getItem:key=>key.endsWith('v1')?JSON.stringify({'拉特兰':{name:'自定义',core:['chosen'],transition:['bridge'],note:''}}):null,setItem(){}},
    compact:a=>a.filter(Boolean),owned:()=>[],number:1,profiles:[[1,1,1,1]],hasMark:()=>false,canCompleteTriple:()=>false});
  vm.runInContext(code.slice(code.indexOf('  const guideKey='),code.indexOf('  if(botId){')),ctx);
  vm.runInContext('const trainingGuides=null;const weights=()=>[1,1,1,1,1,1];',ctx);
  vm.runInContext(code.slice(code.indexOf('    let plan=null'),code.indexOf('    const bestIndex=')),ctx);
  ctx.selectPlan();
  assert(ctx.score(chosen)>ctx.score(bridge));assert(ctx.score(bridge)>ctx.score(other));
  assert.equal(ctx.readGuides()[0].name,'自定义');
}
testRecommendationGuidesAffectAI();
function testMultipleGuidesMigration(){
  const code=fs.readFileSync('arena.js','utf8');
  const old={'拉特兰':{name:'我的打法',core:['a'],transition:['b'],note:'原始说明'},'中立':{name:'混搭一',core:['a'],transition:[],note:'保留一'},'任意':{name:'混搭二',core:['b'],transition:[],note:'保留二'}};
  const storage=new Map([['autochess-lineups-v1',JSON.stringify(old)]]);
  const ctx=vm.createContext({s:{cards:[{id:'a',name:'甲'},{id:'b',name:'乙'}]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
  vm.runInContext(code.slice(code.indexOf('  const guideKey='),code.indexOf('  if(botId){')),ctx);
  let guides=ctx.readGuides();
  assert.equal(guides[0].name,'我的打法');assert.equal(guides[0].note,'原始说明');
  assert.deepEqual(Array.from(guides.filter(g=>g.faction==='其他'),g=>g.name),['混搭一','混搭二']);
  assert(!guides.some(g=>['任意','中立'].includes(g.faction)));
  assert.equal(storage.get('autochess-lineups-v1'),JSON.stringify(old));
  const original=JSON.stringify(guides[0]);
  ctx.owned=()=>[{id:'b'}];ctx.number=1;ctx.s.round=3;
  vm.runInContext('const trainingGuides=null;const weights=()=>[1,1,1,1,1,1];',ctx);
  vm.runInContext(code.slice(code.indexOf('    let plan=null'),code.indexOf('    function score(')),ctx);
  ctx.selectPlan();assert.equal(vm.runInContext('plan.core[0]',ctx),'b');
}
testMultipleGuidesMigration();
async function testLobbyHealthWaitsForPlayback(){
  const code=fs.readFileSync('arena.js','utf8');
  for(const finished of [false,true]){
    const old={seats:[{id:'self',health:50},{id:'bot',health:40}],finished:false};
    const next={seats:[{id:'bot',health:40},{id:'self',health:finished?-2:35}],finished};
    let release,started;const playing=new Promise(r=>started=r),gate=new Promise(r=>release=r);
    const paints=[],state={phase:'备战',board:[],hp:50,round:1};
    const ctx=vm.createContext({s:state,arena:{lobby:old,agents:[]},tutorial:{active:false},playerId:'self',
      document:{getElementById:()=>null,querySelector:selector=>selector.includes('h2')?{}:null,body:{classList:{add(){}}}},
      compact:a=>a.filter(Boolean),cloneData:structuredClone,pad:a=>a,clearInterval(){},draw(){},finishAgents:async()=>{},stateForBattle:()=>({}),
      api:async()=>({lobby:next,results:{self:{health:finished?-2:35,opponent_board:[],winner:'right',loss_damage:15}}}),
      applyResult:async res=>{started();await gate;state.hp=res.health},paintLobby:()=>paints.push(ctx.arena.lobby),
      log(){},results(){},newShop:async()=>{},startPrep:async()=>{},reportError:msg=>{throw Error(msg)},alert:msg=>{throw Error(msg)}});
    vm.runInContext(code.slice(code.indexOf('  fight=async function(){'),code.indexOf("  $('#fight').onclick=")),ctx);
    const pending=ctx.fight();await playing;
    assert.equal(ctx.arena.lobby,old);assert.equal(state.hp,50);assert(paints.every(p=>p===old));
    release();await pending;
    assert.equal(ctx.arena.lobby,next);assert.equal(state.hp,finished?-2:35);assert.equal(paints.at(-1),next);
  }
}
function testTrainingReward(){
  const code=fs.readFileSync('train-ai.html','utf8'),ctx=vm.createContext({});
  vm.runInContext(code.slice(code.indexOf('function reward('),code.indexOf('const owner=')),ctx);
  const u=(id,n)=>({id,attack:n,max_hp:n}),guides=[{core:['a','b','b','c','d','e','f']}];
  const base=ctx.reward([u('a',10)],guides,4);
  assert(ctx.reward([u('a',20)],guides,4).score>base.score);
  assert(ctx.reward([u('a',10),u('b',10)],guides,4).match>base.match);
  assert.equal(ctx.reward([u('a',10),u('a',10)],guides,4).match,base.match);
  assert(ctx.reward([u('a',10)],guides,1).score>base.score);
  assert(ctx.mutate([.25,3,1,1,1,1]).every(v=>v>=.25&&v<=3));
}
testTrainingReward();
async function testGuideApiOldServerMessage(){
  const line=html.split(/\r?\n/).find(l=>l.startsWith('let api='));let status=404;
  const ctx=vm.createContext({s:{},playerId:'test',fetch:async(url,options)=>{assert.equal(options.cache,'no-store');return {status,ok:status===200,text:async()=>status===404?'<!DOCTYPE HTML>':JSON.stringify({guides:[]})}}});
  vm.runInContext(line+';globalThis.callApi=api;',ctx);
  await assert.rejects(ctx.callApi('/api/guides'),/python server.py/);
  status=200;assert.equal((await ctx.callApi('/api/guides')).guides.length,0);
}
function testLegacySourceCannotDamageReplacement(){
  const summon={id:'CONFESS_47',current_hp:2,max_hp:2},enemy={current_hp:10};
  const ctx=vm.createContext({s:{board:[summon],enemy:[enemy]},cacheBattleAnchors(){},cloneData:structuredClone});
  loadFunctions(ctx,['eventUnit','applyBattleEventState']);
  ctx.applyBattleEventState({damage:2,damage_type:'bullet',side:'left',from_slot:1,target_side:'right',to_slot:1,source_removed:true,attacker_hp:0,target_hp:8});
  assert.equal(summon.current_hp,2);assert.equal(enemy.current_hp,8);
}
testLegacySourceCannotDamageReplacement();
function extract(start,end){return html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)))}
async function testAnimation(kind,expected,volleys=1){
  let active=0,max=0,finished=0,launched=0;
  const applied=[];
  const ctx=vm.createContext({s:{},battleAnchors:new Map(),cacheBattleAnchors(){},draw(){},sleep:async()=>{},
    animateBullet:async()=>{if(launched%3===0)assert.equal(finished,launched);launched++;active++;max=Math.max(max,active);await new Promise(setImmediate);active--;finished++},
    applyBattleEventState:e=>{if(e.type==='cumulative_counter')assert.equal(finished,3*volleys);if(kind==='bullet_batch'&&e.damage_type==='bullet')assert.equal(finished,applied.filter(x=>x.damage_type==='bullet').length+1);applied.push(e)},applyEventLog(){}});
  vm.runInContext(extract('async function animateEvents(', 'async function refresh('),ctx);
  const shot={damage_type:'bullet',side:'left',from_slot:1,target_side:'right',to_slot:1};
  const events=Array.from({length:volleys},()=>[{type:kind+'_start'},shot,shot,shot,{type:kind+'_end'}]).flat();
  events.push({type:'cumulative_counter'});
  await ctx.animateEvents({events,left:[],right:[]});
  assert.equal(finished,3*volleys);
  assert.equal(max,expected);
}
async function testSelling(){
  const ctx=vm.createContext({document:{head:{insertAdjacentHTML(){}},addEventListener(){},elementFromPoint:()=>({closest:()=>true})},window:{addEventListener(){}},s:{phase:'备战',busy:false},Date,draw(){},compact:a=>a.filter(Boolean),pad:a=>a,log(){},syncPlayer(){}});
  vm.runInContext(fs.readFileSync('board-drag.js','utf8').split('// Guided tutorial')[0],ctx);
  vm.runInContext(extract('async function sellCard(', 'window.allowUnitSkillDrop='),ctx);
  for(const where of ['bench','board'])for(const id of ['Hoederer','Ines','U-Official','ordinary'])for(const golden of [false,true]){
    const card={id,card_type:'unit',name:id,golden};let refunded=0,triggered=0;
    ctx.s.bench=[card];ctx.s.board=[card];
    ctx.api=async(url,body)=>{assert.equal(url,'/api/sell');assert.equal(body.card_id,id);refunded++;return {refund:1}};
    ctx.triggerSale=async u=>{assert.equal(u,card);assert.ok(where==='bench'?ctx.s.bench[0]===null:ctx.s.board.length===0);triggered++};
    vm.runInContext(`boardPointer={id:1,type:'${where}',index:0,active:true,inside:false,card:{classList:{remove(){}}}}`,ctx);
    await ctx.finishBoardPointer({pointerId:1,type:'pointerup',clientX:0,clientY:0,preventDefault(){}});
    assert.equal(refunded,1);assert.equal(triggered,1);
  }
}
function loadFunctions(ctx,names){for(const name of names){const line=html.split(/\r?\n/).find(x=>x.startsWith('function '+name+'(')||x.startsWith('async function '+name+'('));assert.ok(line,name);vm.runInContext(line,ctx)}}
function testGuard(){
  const ctx=vm.createContext({});loadFunctions(ctx,['hasMark','setGuard','mechanicDetails']);
  const podenco={description:'上场：选择1个棋子，使其获得嘲讽，并使所有友方具有嘲讽的棋子获得+3/+3',mechanics:['on_deploy']};
  assert.equal(ctx.hasMark(podenco,'guard'),false);
  assert.ok(!ctx.mechanicDetails(podenco).includes('会优先被选为攻击目标'));
  ctx.setGuard(podenco,true);assert.equal(ctx.hasMark(podenco,'guard'),true);
  assert.ok(ctx.mechanicDetails(podenco).includes('会优先被选为攻击目标'));
  ctx.setGuard(podenco,false);assert.equal(ctx.hasMark(podenco,'guard'),false);
  assert.equal(ctx.hasMark({mechanics:['guard']},'guard'),true);
}
async function testBattleMerge(skip,owned=2){
  const base={id:'Fiammetta',name:'菲亚梅塔',card_type:'unit',attack:4,max_hp:4,mechanics:['legacy']};
  const compact=a=>a.filter(Boolean),pad=a=>{a=compact(a);return a.concat(Array(7-a.length).fill(null))};
  const state={cards:[base],board:pad(Array.from({length:owned},()=>({...base,attack:6}))),bench:Array(12).fill(null),enemy:[],phase:'备战',hp:50,round:2,shopLocked:true,skipBattle:skip};
  // Combat-only summoned copy must not count towards permanent triples.
  const res={left:[...structuredClone(state.board).filter(Boolean),{...base,summoned_by_phase:'legacy'}],right:[],winner:'left',round:3,events:[{type:'gain_card',side:'left',from:'死芒',card:{...base},card_name:base.name}]};
  const ctx=vm.createContext({s:state,compact,pad,captureTripleSources:occ=>occ.map(o=>o.u),queueTripleAnimation:(sources,golden)=>{assert.equal(sources.length,3);assert.equal(golden.golden,true)},cloneData:structuredClone,emptyBench:()=>state.bench.findIndex(x=>!x),log(){},draw(){},clearInterval(){},setTimeout(){},api:async()=>res,syncPlayer(){},startPrep:async()=>{},battleAnchors:new Map(),cacheBattleAnchors(){},sleep:async()=>{}});
  loadFunctions(ctx,['hasMark','setGuard','baseUnitById','applyGoldenOverrides','extraStatSum','applyAegirGameBonus','goldenCopy','collectMergePieces','phantomCanReplace','findTripleMerge','tryCombineTriples','cleanupAfterBattle','restoreBoardAfterBattle','applyEventLog','fight']);
  ctx.applyBattleEventState=()=>{};
  vm.runInContext(extract('async function animateEvents(', 'async function refresh('),ctx);
  await ctx.fight();
  const all=[...state.board,...state.bench].filter(Boolean);
  assert.equal(all.filter(u=>u.golden).length,owned===2?1:0);
  assert.equal(all.length,owned===2?1:2);
  if(owned===2){assert.equal(state.bench.find(u=>u)?.attack,12);assert.equal(compact(state.board).length,0)}
}
function testTripleHints(){
  const s={board:[],bench:[]},ctx=vm.createContext({s});
  loadFunctions(ctx,['collectMergePieces','phantomCanReplace','findTripleMerge','canCompleteTriple','tripleHint']);
  const unit=(id,extra={})=>({id,card_type:'unit',stars:4,...extra}),candidate=unit('Fiammetta');
  s.board=[unit('Fiammetta')];assert.equal(ctx.canCompleteTriple(candidate),false);
  s.bench=[unit('Fiammetta')];assert.equal(ctx.canCompleteTriple(candidate),true);
  for(const side of ['shop','discover','sale-pick'])assert.ok(ctx.tripleHint(candidate,side).includes('⬆'));
  for(const side of ['board','bench','enemy','codex','select-target'])assert.equal(ctx.tripleHint(candidate,side),'');
  assert.equal(ctx.canCompleteTriple({...candidate,golden:true}),false);
  assert.equal(ctx.canCompleteTriple({card_type:'skill',id:candidate.id}),false);
  s.bench=[unit('Fiammetta',{golden:true})];assert.equal(ctx.canCompleteTriple(candidate),false);
  s.bench=[unit('Phantom')];assert.equal(ctx.canCompleteTriple(candidate),false);
  s.bench=[unit('Phantom',{golden:true})];assert.equal(ctx.canCompleteTriple(candidate),true);
  s.board=[unit('Fiammetta'),unit('Fiammetta')];s.bench=[];
  assert.equal(ctx.canCompleteTriple(unit('Phantom',{golden:true})),true);
  assert.equal(ctx.canCompleteTriple(unit('Other')),false);
}
function testSaleOptions(){
  const u=(id,stars=4)=>({id,stars,card_type:'unit'});
  const s={shopLevel:4,cards:[u('Hoederer'),u('A'),u('B'),u('C'),u('D'),u('High',5),u('Ines')]};
  const ctx=vm.createContext({s,compact:a=>a.filter(Boolean),shuffle:a=>a,cloneData:structuredClone});
  loadFunctions(ctx,['baseUnitById','enemyPickOptions','shopTierPickOptions']);
  const options=ctx.shopTierPickOptions();
  assert.equal(options.length,3);assert.ok(options.every(x=>x.id!=='Hoederer'&&x.stars===4));
  for(const ids of [[],['A'],['A','A','B'],['A','A','B','C'],['A','B','C','D']]){
    s.enemy=ids.map(id=>u(id)).concat([u('Ines'),u('High',5)]);
    const picks=ctx.enemyPickOptions(),unique=new Set([...ids,'High']);
    assert.equal(picks.length,3);
    assert.ok(picks.every(x=>unique.has(x.id)));
    assert.equal(new Set(picks.map(x=>x.id)).size,Math.min(unique.size,3));
    if(unique.size===1){picks[0].stars=99;assert.equal(picks[1].stars,5)}
  }
}
function testDeadUnitsStayHidden(){
  const old={id:'old',current_hp:0},pending={id:'pending',current_hp:2};
  const s={board:[old,pending],enemy:[]};
  const ctx=vm.createContext({s,live:u=>u.current_hp,card:u=>u.id,cacheBattleAnchors(){}});
  loadFunctions(ctx,['battleCards','eventUnit','removeBattleUnit','applyBattleEventState']);
  ctx.applyBattleEventState({type:'effect_start'});
  assert.ok(!ctx.battleCards(s.board,'board').includes('>old<'));
  pending.current_hp=0;
  assert.ok(ctx.battleCards(s.board,'board').includes('>pending<'));
  ctx.applyBattleEventState({type:'effect_end'});
  assert.equal(ctx.battleCards(s.board,'board'),'');
  ctx.applyBattleEventState({type:'effect_start'});
  assert.equal(ctx.battleCards(s.board,'board'),'');
  ctx.applyBattleEventState({type:'effect_end'});
  pending.current_hp=2;
  ctx.applyBattleEventState({type:'effect_start'});
  pending.current_hp=0;
  pending.current_hp=1;
  ctx.applyBattleEventState({type:'effect_end'});
  assert.ok(ctx.battleCards(s.board,'board').includes('>pending<'));
  assert.ok(!ctx.battleCards(s.board,'board').includes('>old<'));
}
function testAssimilatedUnitsStayRemoved(){
  const victim={id:'W',current_hp:10},source={id:'Nymph',current_hp:20};
  const s={board:[victim,source],enemy:[],assimilatedSources:{}};
  const ctx=vm.createContext({s,live:u=>u.current_hp,card:u=>u.id,cacheBattleAnchors(){},cloneData:structuredClone});
  loadFunctions(ctx,['battleCards','eventUnit','removeBattleUnit','applyBattleEventState']);
  ctx.applyBattleEventState({type:'effect_start'});
  ctx.applyBattleEventState({type:'assimilate',side:'left',slot:2,to_slot:1,attack:30,max_hp:30,current_hp:30});
  assert.equal(s.board[0],null);assert.equal(s.effectUnits.has(victim),false);
  ctx.applyBattleEventState({type:'effect_start'});
  assert.ok(!ctx.battleCards(s.board,'board').includes('>W<'));
  ctx.applyBattleEventState({type:'summon',side:'left',slot:1,unit:{id:'new',current_hp:5}});
  ctx.applyBattleEventState({type:'assimilate_remove',side:'left',slot:1});
  assert.equal(s.board[0].id,'new');
  ctx.applyBattleEventState({type:'death',side:'left',slot:1});
  assert.equal(s.board[0],null);
  ctx.applyBattleEventState({type:'revive',side:'left',slot:1,unit:{id:'revived',current_hp:5}});
  assert.ok(ctx.battleCards(s.board,'board').includes('>revived<'));
}
async function testPointerRelease(){
  const handlers={},windows={},classes=new Set(),card={dataset:{side:'board',slot:'1'},classList:{add:x=>classes.add(x),remove:(...xs)=>xs.forEach(x=>classes.delete(x))}};
  const ctx=vm.createContext({document:{head:{insertAdjacentHTML(){}},addEventListener:(type,fn)=>handlers[type]=fn},window:{addEventListener:(type,fn)=>windows[type]=fn},s:{phase:'备战'},Date});
  vm.runInContext(fs.readFileSync('board-drag.js','utf8').split('// Guided tutorial')[0],ctx);
  const down=()=>handlers.pointerdown({button:0,pointerId:1,clientX:0,clientY:0,target:{closest:()=>card}});
  down();assert.ok(classes.has('board-pressed'));
  let stopped=false,canceled=false;handlers.dragstart({preventDefault(){canceled=true},stopImmediatePropagation(){stopped=true}});
  assert.ok(canceled&&stopped);
  await handlers.pointerup({pointerId:1});assert.equal(classes.size,0);
  down();await handlers.pointercancel({pointerId:1});assert.equal(classes.size,0);
  down();windows.blur();assert.equal(classes.size,0);
  down();handlers.pointermove({pointerId:1,pointerType:'mouse',buttons:0});assert.equal(classes.size,0);
}
async function testTutorialRules(){
  const nodes=new Map(),el=()=>({insertAdjacentHTML(){},classList:{add(){},remove(){}},addEventListener(){}});
  const $=key=>{if(!nodes.has(key))nodes.set(key,el());return nodes.get(key)};
  const calls=[],s={shopSlots:4,round:1,board:[],bench:[]};
  const ctx=vm.createContext({s,$,document:{head:el()},window:{addEventListener(){}},api:async url=>{calls.push(url);return 'normal'},draw(){},startPrep:async()=>{},fight:async()=>{},buyShopIndex:async()=>{},upgradeShop:async()=>{},cloneData:structuredClone,baseUnitById:id=>({id,card_type:'unit'}),pad:a=>a,compact:a=>a.filter(Boolean)});
  vm.runInContext('//'+fs.readFileSync('board-drag.js','utf8').split('// Guided tutorial')[1],ctx);
  vm.runInContext('tutorial.active=true;tutorial.step="buy"',ctx);
  const shop=await ctx.api('/api/shop');assert.equal(shop.length,4);assert.ok(shop.every(u=>u.id==='Mr.Nothing'));assert.notEqual(shop[0],shop[1]);
  assert.equal((await ctx.api('/api/enemy'))[0].id,'U-Official');assert.equal(calls.length,0);
  const event=(type,target)=>({type,target:{closest:selector=>selector.split(',').includes(target)}});
  assert.equal(ctx.tutorialAllowed(event('click','#shop .unit-card')),true);
  assert.equal(ctx.tutorialAllowed(event('click','#fight')),false);
  assert.equal(ctx.tutorialAllowed(event('drop','#bench')),true);
  assert.equal(ctx.tutorialAllowed(event('drop','#board')),false);
  vm.runInContext('tutorial.step="upgrade"',ctx);
  assert.equal(ctx.tutorialAllowed(event('click','#upgrade')),true);
  assert.equal(ctx.tutorialAllowed(event('click','#shop .unit-card')),false);
  vm.runInContext('tutorial.pending=true',ctx);
  assert.equal(ctx.tutorialAllowed(event('click','#upgrade')),false);
  vm.runInContext('tutorial.pending=false;tutorialGo=step=>tutorial.step=step;tutorialPaint=()=>{};tutorial.step="buy2"',ctx);
  s.bench=[{id:'Mr.Nothing',golden:true}];ctx.tutorialObserve();assert.equal(vm.runInContext('tutorial.step',ctx),'gold');
  vm.runInContext('tutorial.active=false',ctx);assert.equal(await ctx.api('/api/shop'),'normal');
}
async function testTripleAnimationQueue(){
  const tasks=[],animations=[],s={bench:[]};let draws=0,removed=0;
  const el=()=>({style:{},setAttribute(){},removeAttribute(){},appendChild(){},replaceChildren(){},remove(){removed++},animate(frames,options){animations.push({frames,options});return {finished:Promise.resolve()}}});
  const document={head:{insertAdjacentHTML(){}},body:{appendChild(){}},createElement:()=>{const e=el();e.firstElementChild=el();return e},getElementById:()=>({getBoundingClientRect:()=>({left:500,top:400,width:100,height:180})})};
  const ctx=vm.createContext({s,document,window:{addEventListener(){}},card:()=>'<div></div>',cardEl:()=>null,queueMicrotask:fn=>tasks.push(fn),matchMedia:()=>({matches:false}),innerWidth:1000,innerHeight:700,draw:()=>draws++});
  const code=fs.readFileSync('board-drag.js','utf8');vm.runInContext(code.slice(code.indexOf('const tripleAnimations=[];')),ctx);
  const sources=[0,1,2].map(i=>({unit:{id:'W'},rect:{left:i*100,top:100,width:100,height:180}}));
  const a={id:'W',name:'W',golden:true},b={...a};s.bench=[a,b];
  ctx.queueTripleAnimation(sources,a);ctx.queueTripleAnimation(sources,b);
  assert.equal(tasks.length,1);assert.equal(s.mergeAnimating,true);assert.equal(s.mergeHidden.size,2);
  await tasks[0]();
  assert.equal(animations.length,16);assert.equal(draws,3);assert.ok(removed>0);
  assert.equal(s.mergeAnimating,false);assert.equal(s.mergeHidden.size,0);
  assert.equal(animations.at(-1).frames.at(-1).left,'500px');
}
async function testComboPlaybackAndSeaKeywords(){
  for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
  const order=[],ctx=vm.createContext({s:{},battleAnchors:new Map(),cacheBattleAnchors(){},draw(){},sleep:async()=>{},animateCombo:async e=>order.push('combo'+e.strike),animateCollision:async()=>order.push('attack'),applyBattleEventState(){},applyEventLog(){},esc:x=>x,hasMark:(u,k)=>!!u[k]});
  vm.runInContext(extract('async function animateEvents(', 'async function refresh('),ctx);
  await ctx.animateEvents({events:[{type:'combo_strike',strike:1},{damage_type:'collision'},{type:'combo_strike',strike:2},{damage_type:'collision'}],left:[],right:[]});
  assert.deepEqual(order,['combo1','attack','combo2','attack']);
  vm.runInContext(extract('function renderDesc(', 'function mechanicDetails('),ctx);
  const start=html.indexOf('function mechanicDetails(');vm.runInContext(html.slice(start,html.indexOf('\n',start)),ctx);
  for(const name of ['海怪','底海滑动者','钵海收割者','囊海爬行者','始海穿刺者']){
    assert.match(ctx.renderDesc(name),/kw-sea-monster/);
    assert.match(ctx.mechanicDetails({description:'召唤'+name}),/阿戈尔阵营棋子召唤的海怪/);
  }
  assert.match(ctx.mechanicDetails({combo:true}),/攻击时，可以连续攻击两次，唯一效果不可叠加/);
}
function testSummonVisualOrder(){
  const ctx=vm.createContext({s:{},live:u=>u.current_hp,card:(u,w,i)=>u.id+':'+i});
  loadFunctions(ctx,['battleCards']);
  const rendered=ctx.battleCards([{id:'summon',current_hp:1,battle_position:2.5},{id:'left',current_hp:1,battle_position:1},null,{id:'right',current_hp:1,battle_position:3}],'board');
  assert.ok(rendered.indexOf('left:1')<rendered.indexOf('summon:0'));
  assert.ok(rendered.indexOf('summon:0')<rendered.indexOf('right:3'));
}
function testPrepSummon(){
  const watcher={name:'引星棘刺',card_type:'unit',faction:'阿戈尔',attack:4,max_hp:8,aegir_summon_game_attack:1},unit={name:'傀影',card_type:'unit',faction:'任意',attack:4,max_hp:4},combatWatcher={name:'海霓',card_type:'unit',faction:'阿戈尔',attack:4,max_hp:3,sea_summon_buff:4,aegir_summon_lock_buff:8,aegir_summon_attack_ratio:1};
  const s={round:1,phase:'备战',board:[watcher,combatWatcher,unit],bench:[],shop:[],lifeTowerEffects:[{amount:2,expires:2}]};
  const ctx=vm.createContext({s,compact:a=>a.filter(Boolean),cloneData:structuredClone,log(){}});
  loadFunctions(ctx,['triggerClientMorale','applyClientBuff','applyAegirGameBonus','syncAegirGameBonus']);
  vm.runInContext(extract('function triggerPrepSummon(', 'function onDeploy('),ctx);
  ctx.triggerPrepSummon(unit);assert.equal(unit.attack,7);assert.equal(unit.max_hp,6);assert.equal(unit.lock_hp,undefined);assert.equal(s.aegirAttackBonus,1);
  const outsider={name:'外族',faction:'炎',card_type:'unit',attack:1,max_hp:1};s.board.push(outsider);ctx.triggerPrepSummon(outsider);assert.equal(outsider.attack,3);assert.equal(s.aegirAttackBonus,1);
}
function testPhantomExternalMechanisms(){
  const base={id:'Gladiia',card_type:'unit',faction:'阿戈尔',attack:5,max_hp:4,mechanics:[]},phantom={id:'Phantom',card_type:'unit',faction:'任意',attack:4,max_hp:4,mechanics:[]};
  const gifted={...phantom,attack:7,lock_hp:true,revive:true,guard:true,shield:true,mechanics:['lock_hp','revive','guard','shield']};
  const s={cards:[base,phantom],board:[base,{...base}],bench:[gifted],phase:'备战'};
  const ctx=vm.createContext({s,cloneData:structuredClone,compact:a=>a.filter(Boolean),pad:a=>a.filter(Boolean),emptyBench:()=>s.bench.findIndex(x=>!x),captureTripleSources:()=>[],queueTripleAnimation(){},log(){}});
  loadFunctions(ctx,['hasMark','setGuard','baseUnitById','applyGoldenOverrides','extraStatSum','applyAegirGameBonus','goldenCopy','tryCombineTriples']);
  let planned=false;ctx.findTripleMerge=()=>{if(planned)return null;planned=true;return {base,occ:[{w:'board',i:0,u:base},{w:'board',i:1,u:s.board[1]},{w:'bench',i:0,u:gifted}]}};
  ctx.tryCombineTriples();const result=s.bench[0];
  for(const key of ['lock_hp','revive','guard','shield'])assert.equal(ctx.hasMark(result,key),true);
  assert.equal(result.attack,13);assert.equal(result.id,'Gladiia');assert.equal(result.golden,true);
}
function testPoolOriginInheritance(){
  const base={id:'A',attack:1,max_hp:2,mechanics:[]},phantom={id:'Phantom',attack:1,max_hp:2,mechanics:[]};
  const ctx=vm.createContext({s:{cards:[base,phantom]},cloneData:structuredClone});
  loadFunctions(ctx,['hasMark','setGuard','baseUnitById','applyGoldenOverrides','extraStatSum','applyAegirGameBonus','goldenCopy','transformUnitInto']);
  const bought={...base,pool_tokens:['a']},other={...base,pool_tokens:['b']},wild={...phantom,pool_tokens:['phantom']};
  assert.deepEqual(Array.from(ctx.goldenCopy(base,[bought,other,wild]).pool_tokens),['a','b']);
  assert.deepEqual(Array.from(ctx.goldenCopy(base,[bought,base,base]).pool_tokens),['a']);
  const muel={id:'Muelsyse',attack:6,max_hp:6,pool_tokens:['muel']};ctx.transformUnitInto(muel,base);
  assert.equal(muel.pool_tokens.length,0);
  assert.deepEqual(Array.from(ctx.goldenCopy(base,[bought,other,muel]).pool_tokens),['a','b']);
}
function testHealthLockInheritance(){
  const base={id:'Gladiia',card_type:'unit',faction:'阿戈尔',attack:5,max_hp:4,mechanics:[]};
  const ctx=vm.createContext({s:{cards:[base]},cloneData:structuredClone});
  loadFunctions(ctx,['hasMark','setGuard','baseUnitById','applyGoldenOverrides','extraStatSum','applyAegirGameBonus','goldenCopy','intrinsicDefenseSource','inheritDefenses','badgeHtml']);
  for(const grant of [{lock_hp:true},{mechanics:['lock_hp']}]){
    const boosted={...base,...grant},golden=ctx.goldenCopy(base,[base,boosted,base]);
    assert.equal(ctx.hasMark(golden,'lock_hp'),true);
    assert.equal(golden.mechanics.filter(x=>x==='lock_hp').length,1);
    assert.match(ctx.badgeHtml(golden),/health-lock/);
    const ceobe={id:'Ceobe',mechanics:[]};ctx.inheritDefenses(ceobe,boosted);ctx.inheritDefenses(ceobe,boosted);
    assert.equal(ceobe.lock_hp,true);assert.equal(ceobe.mechanics.filter(x=>x==='lock_hp').length,1);
  }
  const plain=ctx.goldenCopy(base,[base,base,base]);assert.equal(ctx.hasMark(plain,'lock_hp'),false);
  const ceobe={id:'Ceobe',mechanics:[]};ctx.inheritDefenses(ceobe,base);assert.equal(ctx.hasMark(ceobe,'lock_hp'),false);
}
function testAegirGameBonus(){
  const base={id:'Skadi',card_type:'unit',faction:'阿戈尔',attack:4,max_hp:1,mechanics:[]};
  const board={...base},bench={...base},shop={...base},other={card_type:'unit',faction:'炎',attack:3};
  const s={aegirAttackBonus:2,phase:'备战',board:[board,other],bench:[bench],shop:[shop],cards:[base]};
  const ctx=vm.createContext({s,cloneData:structuredClone});
  loadFunctions(ctx,['applyAegirGameBonus','syncAegirGameBonus','baseUnitById','applyGoldenOverrides','extraStatSum','hasMark','setGuard','goldenCopy']);
  ctx.syncAegirGameBonus();ctx.syncAegirGameBonus();
  for(const u of [board,bench,shop])assert.equal(u.attack,6);
  assert.equal(other.attack,3);assert.equal(base.attack,4);
  const fresh={...base};ctx.applyAegirGameBonus(fresh);assert.equal(fresh.attack,6);
  const golden=ctx.goldenCopy(board,[board,bench,shop]);assert.equal(golden.attack,10);
  ctx.applyAegirGameBonus(golden);assert.equal(golden.attack,10);
  s.aegirAttackBonus=3;ctx.applyAegirGameBonus(golden);assert.equal(golden.attack,11);
}
async function testLifeTowerDropRoutes(){
  for(const route of ['board','unit']){
    const unit={name:'友方',attack:1,max_hp:2},s={phase:'备战',busy:false,round:1,board:[unit],bench:[{card_type:'skill',effect:'life_tower',target_scope:'board',effect_value:3}]};
    let supports=0;const ctx=vm.createContext({s,window:{},readDrag:()=>({type:'bench',index:0}),compact:a=>a.filter(Boolean),log(){},draw(){},clearDrop(){},triggerPlayerSupports:()=>supports++});
    loadFunctions(ctx,['triggerClientMorale','applyClientBuff','applyLifeTower','useBenchSkill']);
    for(const name of ['allowBoardAreaSkillDrop','dropSkillToBoardArea','allowUnitSkillDrop','dropSkillToUnit']){const start=html.indexOf('window.'+name+'=');vm.runInContext(html.slice(start,html.indexOf('\n',start)),ctx);ctx[name]=ctx.window[name]}
    let accepted=false;const classes=[],ev={preventDefault(){accepted=true},stopPropagation(){},dataTransfer:{},currentTarget:{classList:{add:c=>classes.push(c)}}};
    if(route==='board'){ctx.allowBoardAreaSkillDrop(ev);await ctx.dropSkillToBoardArea(ev)}else{ctx.allowUnitSkillDrop(ev,0);await ctx.dropSkillToUnit(ev,0)}
    assert.ok(accepted);assert.ok(classes.includes('drop-target'));assert.equal(s.bench[0],null);assert.equal(unit.attack,4);assert.equal(unit.max_hp,5);assert.equal(supports,1);
  }
}
function testLifeTowerExpiry(){
  const u={name:'化境棋子',attack:2,max_hp:3,morale:{attack:1,max_hp:2}},bench={attack:5,max_hp:6},s={round:3,board:[u],bench:[bench]};
  const ctx=vm.createContext({s,compact:a=>a.filter(Boolean),log(){}});
  for(const name of ['triggerClientMorale','applyClientBuff','applyLifeTower','expireLifeTower']){const start=html.indexOf('function '+name+'(');vm.runInContext(html.slice(start,html.indexOf('\n',start)),ctx)}
  ctx.applyLifeTower(3);ctx.applyLifeTower(2);
  assert.equal(u.attack,9);assert.equal(u.max_hp,12);
  assert.equal(bench.attack,5);assert.equal(bench.max_hp,6);
  ctx.expireLifeTower();assert.equal(u.attack,9);
  s.round=4;ctx.expireLifeTower();assert.equal(u.attack,4);assert.equal(u.max_hp,7);assert.equal(u.life_tower_buffs,undefined);
  ctx.expireLifeTower();assert.equal(u.attack,4);
}

async function testBackgroundMusic(){
  const listeners={},sources=[],gains=[],nodes={};let observe;
  function node(){return {hidden:true,value:0,classList:{contains(){return this.owner.hidden}},handlers:{},addEventListener(k,f){this.handlers[k]=f},setAttribute(){}}}
  for(const id of ['musicToggle','musicVolume','gameShell','startScreen','codexScene','helpScene']){nodes[id]=node();nodes[id].classList.owner=nodes[id]}
  const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v},linearRampToValueAtTime(v){this.value=v},setTargetAtTime(v){this.value=v}});
  class Engine{constructor(){this.currentTime=0;this.destination={};this.state='running'}createGain(){const g={gain:param(),connect(){},disconnect(){}};gains.push(g);return g}createBufferSource(){const x={connect(){},disconnect(){},start(t){this.at=t},stop(){this.stopped=true}};sources.push(x);return x}decodeAudioData(){return Promise.resolve({duration:2})}resume(){this.state='running';return Promise.resolve()}suspend(){this.state='suspended';return Promise.resolve()}}
  const document={hidden:false,getElementById:id=>nodes[id],addEventListener:(k,f)=>listeners[k]=f};
  const ctx=vm.createContext({document,window:{AudioContext:Engine},localStorage:{getItem:()=>null,setItem(){}},MutationObserver:class{constructor(f){observe=f}observe(){}},fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}),console});
  vm.runInContext(extract('function musicSceneKey(', '// End background music.'),ctx);
  const settle=()=>new Promise(setImmediate);
  listeners.pointerdown({target:{closest:()=>false}});await settle();assert.equal(sources.length,2);assert.equal(sources[1].loop,true);assert.equal(sources[1].at-sources[0].at,2);
  observe();await settle();assert.equal(sources.length,2,'same menu music must not restart');
  nodes.gameShell.hidden=false;observe();await settle();assert.equal(sources.length,3);assert(sources[0].stopped&&sources[1].stopped);
  nodes.gameShell.hidden=true;observe();await settle();assert.equal(sources.length,5);assert(sources[2].stopped);
  nodes.musicToggle.handlers.click();assert.equal(gains[0].gain.value,0);
  nodes.musicToggle.handlers.click();await settle();assert.equal(gains[0].gain.value,.35);assert.equal(sources.length,5);
  document.hidden=true;listeners.visibilitychange();document.hidden=false;listeners.visibilitychange();await settle();assert.equal(sources.length,5,'visibility must resume without duplicate music');
  nodes.gameShell.hidden=false;observe();nodes.gameShell.hidden=true;observe();await settle();assert.equal(sources.length,5,'obsolete scene loading must not play');
}


async function testInlineDeployTarget(){
  const source={name:'深巡',faction:'阿戈尔',card_type:'unit'},shop={name:'商店目标',faction:'阿戈尔',card_type:'unit'},other={name:'其他',faction:'炎',card_type:'unit'},any={name:'傀影',faction:'任意',card_type:'unit'};
  let applied=0,painted=0,drawn=0;
  const ctx=vm.createContext({s:{board:[source,other,any],shop:[shop,{card_type:'skill'}],phase:'备战',prepSeconds:10},window:{},compact:a=>a.filter(Boolean),log(){},paintDeployTargets(){painted++},draw(){drawn++},document:{querySelector:()=>null},applyClientBuff(){applied++},triggerClientBloodbattle:async()=>{},hasMark:(u,k)=>!!u[k],setGuard:(u,v)=>u.guard=v});
  loadFunctions(ctx,['prepTargetPool','deployTargetOptions','openDeployTargetSelect']);
  vm.runInContext(html.split(/\r?\n/).find(l=>l.startsWith('window.chooseDeployTarget=')),ctx);
  const effect={type:'select_buff_lock_hp',faction:'阿戈尔',attack:3,max_hp:3};
  ctx.openDeployTargetSelect(source,effect,2);assert.equal(ctx.s.deployTarget._options.length,3);assert(ctx.s.deployTarget._options.includes(shop));assert(!ctx.s.deployTarget._options.includes(other));
  await ctx.window.chooseDeployTarget(99);assert(ctx.s.deployTarget);assert.equal(applied,0);
  const index=ctx.s.deployTarget._options.indexOf(shop);await ctx.window.chooseDeployTarget(index);await ctx.window.chooseDeployTarget(index);
  assert.equal(applied,2);assert(shop.lock_hp);assert.equal(shop.mechanics.filter(x=>x==='lock_hp').length,1);assert.equal(ctx.s.deployTarget,null);assert.equal(ctx.s.deployTargetResolving,false);assert.equal(drawn,1);assert(painted>=2);
  const friendly=ctx.deployTargetOptions(source,{type:'select_buff_bloodbattle'});assert(!friendly.includes(shop));assert(friendly.includes(other));
  assert(!ctx.deployTargetOptions(source,{...effect,exclude_self:true}).includes(source));
  ctx.openDeployTargetSelect(source,effect,1);ctx.s.shop=[];await ctx.window.chooseDeployTarget(ctx.s.deployTarget._options.indexOf(shop));assert.equal(applied,2,'removed targets must not receive buffs');
  loadFunctions(ctx,['tickPrep']);ctx.tickPrep();assert.equal(ctx.s.prepSeconds,10,'target selection pauses prep timer');
}


async function testBlockAnimationAndKjeragUI(){
  for(const side of ['left','right'])for(const reject of [false,true])for(const blocking of [false,true]){
    const motions=[],ghosts=[];
    const node=rect=>({style:{},classList:{add(){}},getBoundingClientRect:()=>rect,cloneNode(){const g={style:{},classList:{add(){}},animate(frames){motions.push(frames);return {finished:reject?Promise.reject(Error('cancelled')):Promise.resolve()}},remove(){this.removed=true}};ghosts.push(g);return g}});
    const blocker=node({left:200,top:side==='left'?400:0,width:100,height:180}),attacker=node({left:0,top:side==='left'?0:400,width:100,height:180});
    const ctx=vm.createContext({cardEl:zone=>zone===(side==='left'?'board':'enemy')?blocker:attacker,sleep:async()=>{},document:{body:{appendChild(){}},createElement:()=>({style:{},animate:()=>({finished:Promise.resolve()}),remove(){}})}});
    vm.runInContext(extract('async function animateMelee(', 'async function animateCleave('),ctx);
    await ctx.animateMelee({side,target_side:side==='left'?'right':'left',from_slot:1,to_slot:1},blocking);
    assert.equal(ghosts.length,2);assert(ghosts.every(g=>g.removed));assert.equal(blocker.style.visibility,'');assert.equal(attacker.style.visibility,'');
    if(blocking){
      assert(motions[0][2].transform.startsWith('translate(0px,'),'blocker moves straight forward');
      assert(motions[1][2].transform.startsWith('translate(200px,'),'incoming attacker meets blocker in its lane');
    }else{
      const contact=motions[0][2].transform.match(/translate\(([-.\d]+)px,([-.\d]+)px/);
      assert(Math.abs(Number(contact[2]))>200,'attacker reaches target instead of stopping halfway');
      assert.equal(motions[0][2].transform,motions[0][3].transform,'contact includes hit-stop');
      assert.notEqual(motions[1][3].transform,motions[1][4].transform,'target recoils after impact');
    }
  }
  const token={id:'Mountain Snowdevil',card_type:'unit',cannot_gain:true},normal={id:'Courier',card_type:'unit'};
  const ctx=vm.createContext({s:{enemy:[token,normal]},compact:a=>a.filter(Boolean),baseUnitById:()=>null,shuffle:a=>a,cloneData:x=>({...x}),esc:x=>x});
  loadFunctions(ctx,['enemyPickOptions','counterInfo','renderDesc']);
  assert(ctx.enemyPickOptions().every(c=>c.id==='Courier'));
  assert(ctx.counterInfo({charge:{threshold:4},charge_count:3}).includes('3/4'));
  const desc=ctx.renderDesc('山雪鬼；阻挡；冲阵(4)');for(const cls of ['kw-snowdevil','kw-block','kw-charge'])assert(desc.includes(cls));
}

function testComboAndConsumedVenomBadges(){
  const a={venom:true,mechanics:['venom']},b={venom:true,mechanics:['venom']};
  const ctx=vm.createContext({cacheBattleAnchors(){},eventUnit:side=>side==='left'?a:b});
  loadFunctions(ctx,['hasMark','badgeHtml','applyBattleEventState']);
  assert(ctx.badgeHtml(a).includes('badge venom'));
  ctx.applyBattleEventState({side:'left',from_slot:1,target_side:'right',to_slot:1,target_venom_triggered:true,attacker_venom_triggered:true,type:'test'});
  assert(!ctx.badgeHtml(a).includes('badge venom'));assert(!ctx.badgeHtml(b).includes('badge venom'));
  a.venom_consumed=false;ctx.applyBattleEventState({type:'test',side:'left',from_slot:1,venom_triggered:true});assert(!ctx.hasMark(a,'venom'));
  ctx.applyBattleEventState({type:'grant_combo',side:'left',slot:1});ctx.applyBattleEventState({type:'grant_combo',side:'left',slot:1});
  assert(ctx.badgeHtml(a).includes('<svg'));assert.equal(a.mechanics.filter(m=>m==='combo').length,1);
}

async function testSnowVanguardAndCliffheart(){
  const card={id:'snow_vanguard_3',name:'雪境先驱.3',effect:'snow_vanguard',card_type:'skill',effect_value:2};
  const gnosis={name:'灵知',recruit:{type:'gain_snow_vanguard',count:2},return_camp:{type:'gain_snow_vanguard',count:2}};
  const state={shopLevel:3,round:4,cards:[card],bench:Array(12).fill(null),board:[gnosis],shop:[]};let supports=0;
  const ctx=vm.createContext({s:state,emptyBench:()=>state.bench.findIndex(c=>!c),cloneData:c=>JSON.parse(JSON.stringify(c)),compact:a=>a.filter(Boolean),log(){},draw(){},triggerPlayerSupports(){supports++}});
  loadFunctions(ctx,['grantSnowVanguard','triggerRecruit','resolveReturnCampEffects','useBenchSkill','expireSnowVanguard']);
  ctx.triggerRecruit(gnosis);await ctx.resolveReturnCampEffects();assert.equal(state.bench.filter(Boolean).length,4);
  await ctx.useBenchSkill(0,true);await ctx.useBenchSkill(1,true);assert.equal(state.snowVanguardEffects.length,2);assert.equal(supports,2);
  ctx.expireSnowVanguard();assert.equal(state.snowVanguardEffects.length,2);state.round++;ctx.expireSnowVanguard();assert.equal(state.snowVanguardEffects.length,0);
  state.board=[{name:'崖心',faction:'谢拉格',card_type:'unit'},{name:'傀影',faction:'任意',card_type:'unit'},{name:'非谢拉格',faction:'炎',card_type:'unit'}];state.shop=[{name:'商店',faction:'谢拉格',card_type:'unit'}];
  Object.assign(ctx,{window:{},document:{querySelector:()=>null},paintDeployTargets(){},applyClientBuff(u,a,h){u.attack=(u.attack||0)+a;u.max_hp=(u.max_hp||0)+h}});
  loadFunctions(ctx,['prepTargetPool','deployTargetOptions','openDeployTargetSelect']);vm.runInContext(html.split(/\r?\n/).find(l=>l.startsWith('window.chooseDeployTarget=')),ctx);
  const effect={type:'select_buff_combo',faction:'谢拉格',attack:3,max_hp:3},source=state.board[0];
  assert.equal(ctx.deployTargetOptions(source,effect).length,3);ctx.openDeployTargetSelect(source,effect,2);
  await ctx.window.chooseDeployTarget(state.deployTarget._options.indexOf(state.shop[0]));assert(state.shop[0].combo);assert.equal(state.shop[0].attack,6);assert.equal(state.shop[0].mechanics.filter(m=>m==='combo').length,1);
}
function testOffboardEventSlots(){
  const state={board:Array(7).fill(null),enemy:Array(7).fill(null)};
  const ctx=vm.createContext({s:state,cacheBattleAnchors(){},cloneData:x=>({...x})});loadFunctions(ctx,['eventUnit','applyBattleEventState']);
  ctx.applyBattleEventState({type:'offboard_summon',side:'left',slot:8,from_slot:1,unit:{name:'山雪鬼',current_hp:1}});
  assert.equal(state.board.length,7);assert(state.board.every(u=>u===null));assert.equal(ctx.eventUnit('left',8).name,'山雪鬼');
  ctx.applyBattleEventState({type:'permanent_buff',side:'left',slot:8,attack:4,max_hp:3,current_hp:3});assert.equal(ctx.eventUnit('left',8).attack,4);
  ctx.applyBattleEventState({type:'offboard_leave',side:'left',slot:8});assert.equal(ctx.eventUnit('left',8),undefined);
}

(async()=>{await testGuideApiOldServerMessage();await testLobbyHealthWaitsForPlayback();await testSnowVanguardAndCliffheart();testOffboardEventSlots();testComboAndConsumedVenomBadges();await testBlockAnimationAndKjeragUI();testPoolOriginInheritance();await testInlineDeployTarget();await testBackgroundMusic();testPrepSummon();testPhantomExternalMechanisms();testHealthLockInheritance();testSummonVisualOrder();await testLifeTowerDropRoutes();testAegirGameBonus();testLifeTowerExpiry();await testComboPlaybackAndSeaKeywords();await testAnimation('bullet_batch',1);await testAnimation('w_barrage',3);await testAnimation('w_barrage',3,2);await testSelling();testGuard();for(const skip of [false,true]){await testBattleMerge(skip);await testBattleMerge(skip,1)}testTripleHints();testSaleOptions();testDeadUnitsStayHidden();testAssimilatedUnitsStayRemoved();await testPointerRelease();await testTutorialRules();await testTripleAnimationQueue();console.log('PASS: bullets, sales, guard, battle merge, triple hints and pointer release/cancel/blur')})().catch(e=>{console.error(e);process.exitCode=1});
