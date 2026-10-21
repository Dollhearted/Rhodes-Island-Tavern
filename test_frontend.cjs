const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const originalCreateContext=vm.createContext;vm.createContext=function(...args){const ctx=originalCreateContext(...args);if(ctx.s&&!ctx.handAppendSlot){const start=html.indexOf('function handAppendSlot(');vm.runInContext(html.slice(start,html.indexOf('\n',start)),ctx)}return ctx};
(async function testQuintusReset(){
 const code=fs.readFileSync('arena.js','utf8');
 for(const zone of ['board','shop']){
  const original={id:'old',name:'old',attack:99,max_hp:99,golden:true,shield:true,pool_tokens:['old-token']};
  const state={board:[],shop:[]};state[zone]=[original];
  const ctx=vm.createContext({s:state,currentCommander:null,botId:'bot',cloneData:structuredClone,log(){},tryCombineTriples(){},api:async(url,args)=>{assert.equal(args.target.zone,zone);return {commander:{id:'quintus'},card:{id:'new',name:'new',attack:3,max_hp:4,pool_tokens:[]}}}});
  vm.runInContext(code.slice(code.indexOf('  async function useQuintusSkill('),code.indexOf('  async function chooseShuTarget(')),ctx);
  await ctx.useQuintusSkill(original);
  assert.equal(state[zone][0].attack,3);assert.equal(state[zone][0].golden,undefined);
  assert.equal(state[zone][0].shield,undefined);assert.equal(state[zone][0].pool_tokens.length,0);
 }
})().catch(e=>{console.error(e);process.exitCode=1});
(function testExaminerOptions(){
 const code=fs.readFileSync('arena.js','utf8'),ctx=vm.createContext({});
 vm.runInContext(code.slice(code.indexOf('  function examinerOptions('),code.indexOf('  async function chooseExaminerMode(')),ctx);
 for(const [spent,damage] of [[0,3],[7,3],[8,5],[16,7]]){
   const opts=ctx.examinerOptions(spent);assert.equal(opts.length,3);
   assert(opts.every(o=>o.damage===damage));assert.equal(opts[0].mirror,true);
   assert.equal(opts[1].icon,'confessor-s3.png');assert.equal(opts[2].mirror,undefined);
 }
})();
(async function testEmergencyCards(){
 const ally={name:'友方',card_type:'unit',attack:2,max_hp:3},victim={name:'商店目标',card_type:'unit',attack:8,max_hp:9};
 const skill={exclusive_emergency:true,effect:'life_equation',name:'生命方程'};
 const state={phase:'备战',busy:false,round:5,board:[ally],shop:[victim],bench:[skill]};let supports=0;
 const ctx=vm.createContext({handAppendSlot:()=>state.bench.length,s:state,compact:a=>a.filter(Boolean).slice(0,7),pad:a=>a,prepTargetPool:()=>[ally,victim],log(){},draw(){},syncPlayer(){},triggerPlayerSupports(){supports++},cloneData:structuredClone,animatePrepAssimilate:async()=>{},applyClientBuff(u,a,h){u.attack+=a;u.max_hp+=h},api:async(url,data)=>{assert.equal(url,'/api/arena/emergency');assert.equal(data.action,'life_equation');return {player:{}}}});
 vm.runInContext(extract('function isCardLocked(', 'function shuffle('),ctx);
 await ctx.useEmergencySkill(0,victim);
 assert.equal(ally.attack,10);assert.equal(ally.max_hp,12);assert.equal(state.shop[0],null);assert.equal(supports,1);assert.equal(state.busy,false);
 state.bench=Array.from({length:12},()=>({card_type:'unit'}));ctx.receiveEmergencyCard({id:'overflow',locked_until_round:6});
 assert.equal(state.bench.length,13);assert.equal(ctx.isCardLocked(state.bench[12]),true);
 ctx.tryCombineTriples=()=>{};state.round=6;ctx.unlockDeliveredCards();assert.equal(state.bench[12].locked_until_round,undefined);
 const locked={id:'same',card_type:'unit',locked_until_round:7};state.bench=[locked,{id:'same',card_type:'unit'}];state.board=[{id:'same',card_type:'unit'}];
 loadFunctions(ctx,['collectMergePieces']);assert.equal(ctx.collectMergePieces().length,2);
 state.round=7;assert.equal(ctx.collectMergePieces().length,3);
})().catch(e=>{console.error(e);process.exitCode=1});
(function testReignfrostSupport(){
 const code=fs.readFileSync('arena.js','utf8');let original=0;
 const state={board:[{attack:2,max_hp:3},null,{attack:4,max_hp:5}],shop:[{attack:9,max_hp:9}]};
 const ctx=vm.createContext({s:state,currentCommander:{id:'silverash_reignfrost'},triggerPlayerSupports(){original++},compact:a=>a.filter(Boolean),applyClientBuff(u,a,h,b,source){assert.equal(source,'support');u.attack+=a;u.max_hp+=h}});
 vm.runInContext(code.slice(code.indexOf('  const unitSupports='),code.indexOf('  const syncCommanderPlayer=')),ctx);
 ctx.triggerPlayerSupports();ctx.triggerPlayerSupports();
 assert.equal(original,2);assert.equal(state.board[0].attack,4);assert.equal(state.board[2].max_hp,7);assert.equal(state.shop[0].attack,9);
 ctx.currentCommander={id:'typhon'};ctx.triggerPlayerSupports();assert.equal(state.board[0].attack,4);
})();
// The bot realm must boot alongside the real immutable frontend bindings.
function testArenaAgentBoot(){
  const ctx=vm.createContext({URLSearchParams,location:{search:'?arena-agent=test-ai'},s:{},window:{},
    start(){},fight(){},startPrep(){},loadEnemy(){},draw(){},updateHud(){},triggerPrepSummon(){},triggerClientBloodbattle(){},triggerPlayerSupports(){},syncPlayer(){},upgradeShop(){},queueTripleAnimation(){},
    tryCombineTriples(){},captureTripleSources(){},animatePrepAssimilate(){},chooseThree(){},chooseBlessingStat(){}});
  vm.runInContext("const log=()=>{};",ctx);
  vm.runInContext(fs.readFileSync('arena.js','utf8'),ctx);
  assert.equal(ctx.s.arenaPlayerId,'test-ai');
  for(const method of ['init','step','submit','result','prepare'])assert.equal(typeof ctx.window.arenaAgent[method],'function');
}
testArenaAgentBoot();
(function testHarshTrainingExpiry(){
 const target={card_type:'unit',name:'target',attack:2,max_hp:3},natural={card_type:'unit',attack:2,max_hp:3,combo:true};
 const state={round:1,board:[target],shop:[natural],bench:[{effect:'harsh_training',effect_value:6,name:'training'},{effect:'harsh_training',effect_value:2,name:'training'}]};
 const ctx=vm.createContext({s:state,compact:a=>(a||[]).filter(Boolean),triggerPlayerSupports(){},log(){},draw(){},applyClientBuff(u,a,h){u.attack+=a+1;u.max_hp+=h+1}});
 vm.runInContext(html.slice(html.indexOf('function useHarshTraining('),html.indexOf('function applyLifeTower(')),ctx);
 ctx.useHarshTraining(0,target);ctx.useHarshTraining(1,natural);
 assert.equal(target.attack,9);assert.equal(natural.attack,5);
 ctx.expireHarshTraining();assert.equal(target.attack,9);
 state.round=2;ctx.expireHarshTraining();
 assert.equal(target.attack,3);assert.equal(target.max_hp,4);assert.equal(target.training_buffs,undefined);assert.equal(target.combo,undefined);
 assert.equal(natural.combo,true);assert.equal(natural.attack,3);
 ctx.expireHarshTraining();assert.equal(target.attack,3);
})();
(async function testShuBoardAndShopBuff(){
  const code=fs.readFileSync('arena.js','utf8');
  const unit=faction=>({id:faction,card_type:'unit',faction,attack:1,max_hp:1});
  const board=unit('炎'),shop=unit('炎'),other=unit('拉特兰'),bench=unit('炎');
  const ctx=vm.createContext({s:{board:[board,other],shop:[shop],bench:[bench]},compact:a=>a.filter(Boolean),botId:true,
    api:async()=>({commander:{id:'shu'},faction:'炎',amount:2}),currentCommander:null,log(){},
    applyClientBuff(u,a,h){u.attack+=a;u.max_hp+=h}});
  vm.runInContext(code.slice(code.indexOf('  function shuTargets('),code.indexOf('  async function chooseShuTarget(')),ctx);
  await ctx.useShuSkill(shop);
  assert.equal(board.attack,3);assert.equal(shop.attack,3);assert.equal(other.attack,1);assert.equal(bench.attack,1);
})().catch(e=>{console.error(e);process.exitCode=1});
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
  const ctx=vm.createContext({s:{cards:[{id:'a',name:'甲',card_type:'unit'},{id:'b',name:'乙',card_type:'unit'}]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
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
    const ctx=vm.createContext({s:state,workshopRequest:null,deliverCommanderRewards(){},arena:{lobby:old,agents:[]},tutorial:{active:false},playerId:'self',
      document:{getElementById:()=>null,querySelector:selector=>selector.includes('h2')?{}:selector.includes('#gameMain>')?{prepend(){}}:null,body:{classList:{add(){},remove(){}}}},
      compact:a=>a.filter(Boolean),cloneData:structuredClone,pad:a=>a,clearInterval(){},draw(){},chooseCommanderUpgrade:async()=>{},finishAgents:async()=>{},stateForBattle:()=>({}),
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
  vm.runInContext(fs.readFileSync('network.js','utf8'),ctx);
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
  vm.runInContext(extract('const deliveryMarkers=', 'async function refresh('),ctx);
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
  loadFunctions(ctx,['isCardLocked']);
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
function loadFunctions(ctx,names){for(const name of new Set(['isCardLocked',...names])){const line=html.split(/\r?\n/).find(x=>x.startsWith('function '+name+'(')||x.startsWith('async function '+name+'('));assert.ok(line,name);vm.runInContext(line,ctx)}}
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
  const state={cards:[base],board:pad(Array.from({length:owned},()=>({...base,attack:6}))),bench:Array(12).fill(null),enemy:[],phase:'备战',hp:50,round:2,shopLocked:true,shop:[],shopSlots:0,skipBattle:skip};
  // Combat-only summoned copy must not count towards permanent triples.
  const res={left:[...structuredClone(state.board).filter(Boolean),{...base,summoned_by_phase:'legacy'}],right:[],winner:'left',round:3,events:[{type:'gain_card',side:'left',from:'死芒',card:{...base},card_name:base.name}]};
  const ctx=vm.createContext({s:state,compact,pad,captureTripleSources:occ=>occ.map(o=>o.u),queueTripleAnimation:(sources,golden)=>{assert.equal(sources.length,3);assert.equal(golden.golden,true)},cloneData:structuredClone,emptyBench:()=>state.bench.findIndex(x=>!x),log(){},draw(){},clearInterval(){},setTimeout(){},api:async()=>res,syncPlayer(){},startPrep:async()=>{},battleAnchors:new Map(),cacheBattleAnchors(){},sleep:async()=>{}});
  loadFunctions(ctx,['hasMark','setGuard','baseUnitById','applyGoldenOverrides','extraStatSum','applyAegirGameBonus','goldenCopy','collectMergePieces','phantomCanReplace','findTripleMerge','tryCombineTriples','cleanupAfterBattle','restoreBoardAfterBattle','applyEventLog','replenishShop','fight']);
  ctx.applyBattleEventState=()=>{};
  vm.runInContext(extract('const deliveryMarkers=', 'async function refresh('),ctx);
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
  vm.runInContext(extract('const deliveryMarkers=', 'async function refresh('),ctx);
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
  const ctx=vm.createContext({s,compact:a=>(a||[]).filter(Boolean),log(){},expireHarshTraining(){}});
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
  let transformed=null,merges=0;
  ctx.transformUnitInto=(unit,target,golden)=>{transformed={unit,target,golden}};ctx.tryCombineTriples=()=>merges++;
  ctx.s.shop=[shop,{card_type:'skill'}];loadFunctions(ctx,['openTransformSelect']);
  ctx.openTransformSelect(source,true);
  assert(!ctx.s.deployTarget._options.includes(source));assert(ctx.s.deployTarget._options.includes(shop));assert(ctx.s.deployTarget._options.includes(other));
  await ctx.window.chooseDeployTarget(ctx.s.deployTarget._options.indexOf(shop));
  assert.equal(transformed.unit,source);assert.equal(transformed.target,shop);assert.equal(transformed.golden,true);assert.equal(merges,1);assert.equal(ctx.s.deployTarget,null);
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


(async function testSunlitNod(){
  const skill={id:'sunlit_nod_2',name:'耀阳颔首.2',card_type:'skill',effect:'sunlit_nod',shield_bonus_cap:2};
  const state={shopLevel:2,cards:[skill],bench:Array(12).fill(null),board:[{shield:true},{shield:true},{shield:true},{}]};
  const ctx=vm.createContext({s:state,emptyBench:()=>state.bench.findIndex(c=>!c),cloneData:structuredClone,compact:a=>a.filter(Boolean),log(){},draw(){},triggerPlayerSupports(){},applyClientBuff(u,a,h){u.attack=(u.attack||0)+a;u.max_hp=(u.max_hp||0)+h}});
  loadFunctions(ctx,['grantSunlitNod','triggerRecruit','useBenchSkill']);
  ctx.triggerRecruit({name:'流星',recruit:{type:'gain_sunlit_nod',count:1}});
  assert.equal(state.bench.filter(Boolean).length,1);
  await ctx.useBenchSkill(0,true);
  assert(state.board.every(u=>u.attack===3&&u.max_hp===3));
  state.board.forEach(u=>u.shield=false);state.bench[0]=skill;
  await ctx.useBenchSkill(0,true);assert(state.board.every(u=>u.attack===4));
  const order=[];state.gold=3;state.shop=[{id:'Meteor',name:'流星',card_type:'unit'}];
  Object.assign(ctx,{UNIT_CARD_COST:3,api:async()=>({card:{},spent:3}),syncPlayer(){},recordGoldSpent(){},triggerRecruit:u=>order.push('recruit:'+u.id),tryCombineTriples:()=>order.push('merge')});
  loadFunctions(ctx,['buyShopIndex']);await ctx.buyShopIndex(0);
  assert.deepEqual(order,['recruit:Meteor','merge']);

})().catch(e=>{console.error(e);process.exitCode=1});

(async function testRecruitBeforeActualTriple(){
  for(const thirdId of ['Meteor','Phantom']){
    const meteor={id:'Meteor',name:'流星',card_type:'unit',tier:2,recruit:{type:'gain_sunlit_nod',count:1}};
    const skill={id:'sunlit_nod_2',card_type:'skill'};
    const state={gold:3,shopLevel:2,cards:[skill],board:[],bench:[structuredClone(meteor),structuredClone(meteor),...Array(10).fill(null)],shop:[thirdId==='Meteor'?structuredClone(meteor):{id:'Phantom',card_type:'unit',tier:3}]};
    const ctx=vm.createContext({s:state,UNIT_CARD_COST:3,api:async()=>({card:{},spent:3}),syncPlayer(){},recordGoldSpent(){},log(){},draw(){},cloneData:structuredClone,emptyBench:()=>state.bench.findIndex(c=>!c),pad:a=>a.filter(Boolean),baseUnitById:()=>meteor,captureTripleSources:()=>[],queueTripleAnimation(){},goldenCopy:base=>({...base,golden:true,recruit:{type:'gain_sunlit_nod',count:2}})});
    loadFunctions(ctx,['grantSunlitNod','triggerRecruit','collectMergePieces','phantomCanReplace','findTripleMerge','tryCombineTriples','buyShopIndex']);
    await ctx.buyShopIndex(0);
    assert.equal(state.bench.filter(u=>u?.golden).length,1);
    assert.equal(state.bench.filter(u=>u?.id==='sunlit_nod_2').length,thirdId==='Meteor'?1:0);
  }
})().catch(e=>{console.error(e);process.exitCode=1});

(function testProvisoShieldSupport(){
  for(const amount of [1,2]){
    const source={shield:true,support:{type:'shield_team_attack',attack:amount}},ally={shield:true},spent={shield:false,mechanics:['shield']},reserve={shield:true};
    const ctx=vm.createContext({s:{board:[source,ally,spent],bench:[reserve],shop:[reserve]},compact:a=>a.filter(Boolean),applyClientBuff:(u,a,h)=>{u.attack=(u.attack||0)+a;assert.equal(h,0)}});
    loadFunctions(ctx,['triggerPlayerSupports']);ctx.triggerPlayerSupports();
    assert.equal(source.attack,amount);assert.equal(ally.attack,amount);assert.equal(spent.attack,undefined);assert.equal(reserve.attack,undefined);
  }
})();

(function testAllianceSupport(){
 const target={id:'Fang',card_type:'unit',faction:'卡西米尔'},other={id:'Flametail',card_type:'unit',faction:'卡西米尔',recruit:{type:'gain_alliance_support',count:1}},sk={effect:'alliance_support',effect_value:4};
 const state={bench:[sk],cards:[target,other,{id:'token',card_type:'unit',faction:'卡西米尔',summon_only:true}]};const order=[];
 const ctx=vm.createContext({s:state,cloneData:structuredClone,applyClientBuff:(u,a,h)=>{u.attack=a;u.max_hp=h},triggerRecruit:()=>order.push('recruit'),triggerPlayerSupports(){},tryCombineTriples:()=>order.push('merge'),draw(){},log(){}});
 loadFunctions(ctx,['useAllianceSupport']);ctx.useAllianceSupport(0,target);
 assert.equal(target.attack,4);assert.equal(target.max_hp,4);assert.equal(state.bench[0].id,'Flametail');assert.deepEqual(order,['merge']);
})();

(async function testLockedShopRefill(){
 const kept={id:'old',attack:100},state={shopLocked:true,shopSlots:4,shop:[kept,null,null,{id:'last'}]},calls=[];
 const ctx=vm.createContext({s:state,api:async path=>{calls.push(path);return [{id:'new1'},{id:'new2'}]}});
 loadFunctions(ctx,['replenishShop']);await ctx.replenishShop();
 assert.equal(state.shop[0],kept);assert.equal(state.shop[0].attack,100);assert.equal(state.shop[1].id,'new1');assert.equal(state.shop[2].id,'new2');assert.deepEqual(calls,['/api/shop?count=2']);assert.equal(state.shopLocked,false);
 state.shopLocked=true;await ctx.replenishShop();assert.equal(calls.length,1);
})();

(function testAiStrategicHelpers(){
 const code=fs.readFileSync('arena.js','utf8'),part=code.slice(code.indexOf('    function strategicValue('),code.indexOf('    function score('));
 const team=[{initiative:{},faction:'炎'},{initiative:{},faction:'炎'},{legacy:{},faction:'炎'}];
 const ctx=vm.createContext({s:{board:team},compact:a=>a.filter(Boolean),owned:()=>team,plan:{core:['core'],transition:['temporary']},score:()=>10});vm.runInContext(part,ctx);
 assert(ctx.strategicValue({initiative_multiplier:2})>ctx.strategicValue({logistics_multiplier:2}));
 team.push({initiative_multiplier:2});assert(ctx.strategicValue({initiative_multiplier:2})<0);
 assert(ctx.skillTargetScore({id:'core',tier:2})>ctx.skillTargetScore({id:'temporary',tier:5}));
 const seasons={effect:'four_seasons',effect_value:6};
 const nian={name:'年',faction:'炎',attack:1000,max_hp:1000,morale:{type:'self_buff',max_hp:2}};
 const chen={name:'陈',faction:'炎',attack:7,max_hp:20,cleave:true,morale:{type:'team_attack_buff',attack:1}};
 const chong={name:'重岳',faction:'炎',attack:7,max_hp:5,morale:{type:'faction_team_buff',faction:'炎',attack:1,max_hp:1}};
 team.splice(0,team.length,nian,chen,chong,{faction:'炎'},{faction:'任意'},{faction:'炎'},{faction:'炎'});
 assert(ctx.skillTargetScore(chen,seasons)>ctx.skillTargetScore(nian,seasons),'Chen should beat a heavily buffed Nian');
 assert(ctx.skillTargetScore(chong,seasons)>ctx.skillTargetScore(nian,seasons),'Chongyue should spread seasons growth');
 const normal=ctx.skillTargetScore(chong,seasons);
 chong.morale={...chong.morale,attack:2,max_hp:2};chong.golden=true;
 assert(ctx.skillTargetScore(chong,seasons)>normal,'golden morale improves marginal value');
 team[3].logistics_multiplier=2;
 assert(ctx.skillTargetScore(chong,seasons)>normal,'logistics repeats contribute to growth');
})();

(async function testNetworkRetryIdentity(){
 const calls=[];let count=0;
 const ctx=vm.createContext({crypto:{randomUUID:()=> 'same-action'},setTimeout:fn=>fn(),fetch:async(url,opts)=>{calls.push(opts.headers['X-Request-Id']);if(++count<3)throw TypeError('Failed to fetch');return {ok:true,status:200,text:async()=>'{"ok":true}'}}});
 vm.runInContext(fs.readFileSync('network.js','utf8'),ctx);
 assert.equal((await ctx.requestJSON('/api/buy',{method:'POST',body:'{}'})).ok,true);
 assert.deepEqual(calls,['same-action','same-action','same-action']);
 count=0;ctx.fetch=async()=>{count++;return {ok:false,status:400,text:async()=>'{"error":"金币不足"}'}};
 await assert.rejects(ctx.requestJSON('/api/buy',{method:'POST',body:'{}'}),/金币不足/);assert.equal(count,1);
})().catch(e=>{console.error(e);process.exitCode=1});

(function testCommanderRewardExceedsBenchLimit(){
 const code=fs.readFileSync('arena.js','utf8'),state={board:[],bench:[{id:'occupied'}]};let draws=0;
 const ctx=vm.createContext({window:{},arena:{},tryCombineTriples(){},s:state,compact:a=>(a||[]).filter(Boolean),triggerPrepSummon(){},triggerClientBloodbattle(){},triggerPlayerSupports(){},syncPlayer(){},draw:()=>draws++,refreshCommanderBlessings(){},handAppendSlot:()=>state.bench.length,emptyBench:()=>-1,log(){}});
 vm.runInContext(code.slice(code.indexOf('  const pendingCommanderRewards='),code.indexOf('  async function preparation()')),ctx);
 vm.runInContext("pendingCommanderRewards.push({id:'reward',name:'金卡',golden:true})",ctx);
 ctx.draw();assert.equal(state.bench[0].id,'occupied');assert.equal(state.bench[1].id,'reward');
 ctx.draw();assert.equal(state.bench.length,2);assert.equal(draws,2);
 vm.runInContext("currentCommander={id:'chen'};s.shopLevel=4;s.phase='备战'",ctx);
 const unit={attack:2};
 assert.equal(ctx.window.commanderDisplayAttack(unit,'board'),6);
 assert.equal(ctx.window.commanderDisplayAttack(unit,'shop'),2);
 assert.equal(ctx.window.commanderDisplayAttack(unit,'bench'),2);
 state.phase='战斗中';assert.equal(ctx.window.commanderDisplayAttack(unit,'board'),2);
 assert.equal(unit.attack,2);
 vm.runInContext("currentCommander={id:'dobermann',victories:2};s.round=4;s.phase='备战';s.board=[{card_type:'unit',attack:2}];s.shop=[{card_type:'unit',attack:3}];s.bench=[{card_type:'unit',attack:4}]",ctx);
 ctx.syncDobermannAura();ctx.syncDobermannAura();
 assert.equal(state.board[0].attack,8);assert.equal(state.shop[0].attack,9);assert.equal(state.bench[0].attack,4);
 state.round=5;ctx.syncDobermannAura();assert.equal(state.board[0].attack,9);
 state.bench.push(state.shop.pop());ctx.syncDobermannAura();assert.equal(state.bench[1].attack,3);
 ctx.syncDobermannAura(true);assert.equal(state.board[0].attack,2);
})();

(function testAngelBlessingDynamicStatsAndRevive(){
 const state={round:7,bench:[]};let morale=0;
 const ctx=vm.createContext({s:state,triggerClientMorale:()=>morale++,triggerPlayerSupports(){},draw(){}});
 vm.runInContext(html.slice(html.indexOf('function sufferingName('),html.indexOf('function skillTop(')),ctx);
 loadFunctions(ctx,['applyClientBuff']);
 for(const kind of ['X','Y','Z']){
   const card={effect:'commander_angel_blessing',blessing_kind:kind};state.bench=[card];
   ctx.refreshCommanderBlessings();assert.equal(card.effect_value,21);assert.equal(card.bullet_strength,kind==='Y'?7:0);
   assert.equal(card.name,{X:'“你须直面”',Y:'“你须愧悔”',Z:'“你须偿还”'}[kind]);assert(card.icon.endsWith('.png'));
   state.round=8;ctx.refreshCommanderBlessings();assert.equal(card.effect_value,24);
   const target={card_type:'unit',attack:2,max_hp:3,current_hp:3,bullet_strength:1};
   ctx.useCommanderBlessing(0,target);
   assert.equal(target.attack,26);assert.equal(target.max_hp,27);assert.equal(target.current_hp,27);
   assert.equal(target.bullet_strength,kind==='Y'?9:1);assert.equal(!!target.revive,kind==='Z');assert.equal(state.bench[0],null);
   state.round=7;
 }
 assert.equal(morale,3,'each blessing triggers morale via the existing buff path');
})();

(function testDeliveryPlaybackPreservesSlots(){
 const unit={id:'selected',battle_position:2},other={id:'summon'},state={board:[null,null,unit],enemy:[]};
 const ctx=vm.createContext({s:state,cloneData:structuredClone});
 vm.runInContext(extract('function applyDeliveryEvent(', 'async function animateDeliveryStore('),ctx);
 assert(ctx.applyDeliveryEvent({type:'delivery_store',side:'left',slot:3}));assert.equal(state.board[2],null);
 state.board[2]=other;
 ctx.applyDeliveryEvent({type:'delivery_return',side:'left',slot:1,unit});
 assert.equal(state.board[0].id,'selected');assert.equal(state.board[0].battle_position,2);assert.equal(state.board[2],other);
})();

(function testErmengardHandLimit(){
 const state={bench:Array(12).fill({id:'occupied'})};
 const ctx=vm.createContext({s:state,emptyBench:()=>state.bench.findIndex(x=>!x),log(){}});
 vm.runInContext(html.slice(html.indexOf('function applyEventLog('),html.indexOf('function applyEventLog(')+html.slice(html.indexOf('function applyEventLog(')).indexOf('\n')),ctx);
 const event={type:'gain_card',side:'left',from:'命结之秘',card_name:'奖励',card:{id:'reward'}};
 ctx.applyEventLog(event);assert.equal(state.bench.length,12);assert(state.bench.every(c=>c.id==='occupied'));
 state.bench[3]=null;ctx.applyEventLog(event);assert.equal(state.bench[3].id,'reward');
})();

(async function testQalaisaTargetBuff(){
 const code=fs.readFileSync('arena.js','utf8');
 for(const zone of ['board','shop']){
  const target={id:'target',name:'target',attack:2,max_hp:3};const state={board:[],shop:[]};state[zone]=[target];let buffs=0;
  const ctx=vm.createContext({s:state,botId:'bot',currentCommander:null,log(){},api:async(url,args)=>{assert.equal(args.target.zone,zone);return {commander:{id:'qalaisa'},amount:4}},applyClientBuff(u,a,h,unused,source){assert.equal(u,target);assert.equal(source,'commander');u.attack+=a;u.max_hp+=h;buffs++}});
  vm.runInContext(code.slice(code.indexOf('  async function useQalaisaSkill('),code.indexOf('  async function chooseShuTarget(')),ctx);
  await ctx.useQalaisaSkill(target);assert.equal(target.attack,6);assert.equal(target.max_hp,7);assert.equal(buffs,1);
 }
})().catch(e=>{console.error(e);process.exitCode=1});

(async function testKaltsitTemporaryFaction(){
 const code=fs.readFileSync('arena.js','utf8');const target={id:'a',name:'a',faction:'炎',attack:2,max_hp:3,shield:true,revive:true,lock_hp:true};const state={board:[target],round:3};
 const ctx=vm.createContext({s:state,botId:'bot',currentCommander:null,log(){},cloneData:structuredClone,api:async()=>({commander:{id:'kaltsit'},amount:3}),applyClientBuff(u,a,h){u.attack+=a;u.max_hp+=h}});
 vm.runInContext(code.slice(code.indexOf('  async function useKaltsitSkill('),code.indexOf('  async function useQalaisaSkill(')),ctx);
 await ctx.useKaltsitSkill(target);assert.equal(target.faction,'任意');assert.equal(target.attack,5);
 const start=html.indexOf('function cleanupAfterBattle(');vm.runInContext(html.slice(start,html.indexOf('\n',start)),ctx);
 const restored=ctx.cleanupAfterBattle(target);assert.equal(restored.faction,'炎');assert.equal(restored.attack,5);assert(restored.shield&&restored.revive&&restored.lock_hp);
})().catch(e=>{console.error(e);process.exitCode=1});

(async function testShamareExchangeNoRecruit(){
 const code=fs.readFileSync('arena.js','utf8'),old={id:'old'},next={id:'new',recruit:{type:'gain_card'}};
 const state={round:1,board:[old],shop:[{...next,card_type:'unit'}],bench:[]};
 const ctx=vm.createContext({window:{},s:state,botId:'bot',currentCommander:{id:'shamare'},cloneData:structuredClone,compact:a=>a.filter(Boolean),pad:a=>a,log(){},draw(){},tryCombineTriples(){},triggerRecruit(){throw Error('交换不应招募')},api:async()=>({exchanged:true,commander:{id:'shamare',exchange_round:1},card:next,offered:old,index:0})});
 vm.runInContext(code.slice(code.indexOf('  window.tryCommanderSaleExchange='),code.indexOf('  function shuTargets(')),ctx);
 assert.equal(await ctx.window.tryCommanderSaleExchange('board',0,old),true);assert.equal(state.board[0].id,'new');assert.equal(state.shop[0].id,'old');
 assert.equal(await ctx.window.tryCommanderSaleExchange('board',0,next),false);
})().catch(e=>{console.error(e);process.exitCode=1});

(function testMuelsyseUnlockTiming(){
 const unit={locked_until_round:6,golden:true};const ctx=vm.createContext({s:{round:1,bench:[unit]},tryCombineTriples(){}});
 const start=html.indexOf('function isCardLocked('),end=html.indexOf('function receiveEmergencyCard(',start);
 vm.runInContext(html.slice(start,end),ctx);
 for(let round=1;round<=5;round++){ctx.s.round=round;ctx.unlockDeliveredCards();assert.equal(ctx.isCardLocked(unit),true)}
 ctx.s.round=6;ctx.unlockDeliveredCards();assert.equal(ctx.isCardLocked(unit),false);assert.equal(unit.locked_until_round,undefined);
})();

(function testGoliathBoardAndHandBuff(){
 const code=fs.readFileSync('arena.js','utf8'),unit=()=>({card_type:'unit',attack:1,max_hp:2});
 const state={board:[unit()],bench:[unit(),{card_type:'skill'}],shop:[unit()]};
 const ctx=vm.createContext({s:state,reward:{goliath_buff:24},compact:a=>a.filter(Boolean),log(){},applyClientBuff(u,a,h){u.attack+=a;u.max_hp+=h}});
 const start=code.indexOf('    if(reward.goliath_buff){');vm.runInContext(code.slice(start,code.indexOf('\n    }',start)+6),ctx);
 assert.equal(state.board[0].attack,25);assert.equal(state.bench[0].attack,25);assert.equal(state.shop[0].attack,1);assert.equal(state.bench[1].attack,undefined);
})();

(function testHandAppendOrder(){
 const ctx=vm.createContext({s:{bench:[null,{id:'old'},null,{id:'later'},null]}});
 const start=html.indexOf('function handAppendSlot(');vm.runInContext(html.slice(start,html.indexOf('\n',start)),ctx);
 assert.equal(ctx.handAppendSlot(),4);ctx.s.bench[4]={id:'new'};assert.equal(ctx.handAppendSlot(),5);
})();

(function testNecrassOwnedFaction(){
 const code=fs.readFileSync('arena.js','utf8'),unit=()=>({id:'Necrass',faction:'中立',card_type:'unit'});
 const state={board:[unit()],bench:[unit(),{id:'other',faction:'炎'}],shop:[unit()]};
 const ctx=vm.createContext({s:state,currentCommander:{id:'necrass',necrass_awakened:true},compact:a=>a.filter(Boolean)});
 const start=code.indexOf('  function syncNecrassFaction()');vm.runInContext(code.slice(start,code.indexOf('  const commanderRewardDraw',start)),ctx);
 ctx.syncNecrassFaction();assert.equal(state.board[0].faction,'任意');assert.equal(state.bench[0].faction,'任意');assert.equal(state.bench[1].faction,'炎');assert.equal(state.shop[0].faction,'中立');
})();

(async function testRussellPrepBloodbattle(){
 const code=fs.readFileSync('arena.js','utf8'),unit={attack:2,max_hp:3},shop={attack:5,max_hp:6};
 const ctx=vm.createContext({s:{board:[unit]},currentCommander:{id:'russell',command_upgrades:['attack','attack','health']},triggerClientBloodbattle:async()=>{},applyClientBuff(u,a,h){u.attack+=a;u.max_hp+=h}});
 const start=code.indexOf('  const commanderBloodbattle=');vm.runInContext(code.slice(start,code.indexOf('  const unitSupports=',start)),ctx);
 await ctx.triggerClientBloodbattle(unit,2);assert.equal(unit.attack,8);assert.equal(unit.max_hp,7);
 await ctx.triggerClientBloodbattle(shop,2);assert.equal(shop.attack,5);
})().catch(e=>{console.error(e);process.exitCode=1});

(function testSeabornOwnerAura(){
 const code=fs.readFileSync('arena.js','utf8');
 const card={id:'Skadi Seaborn',attack:2,max_hp:2,guard:true,mechanics:['guard']};
 const ctx=vm.createContext({s:{phase:'备战',board:[card],bench:[]},currentCommander:{id:'skadi_alter',seaborn_upgrades:['logistics','monsters','shield']},compact:a=>a.filter(Boolean),cloneData:structuredClone});
 vm.runInContext(code.slice(code.indexOf('  function syncSeabornAura('),code.indexOf('  const seabornPrepSummon=')),ctx);
 ctx.syncSeabornAura();ctx.syncSeabornAura();assert.equal(card.logistics.attack,2);assert.equal(card.legacy.count,2);assert.equal(card.mechanics.filter(x=>x==='shield').length,1);
 ctx.syncSeabornAura(true);assert(!card.shield);assert(card.guard);assert(!card.legacy);
 card.golden=true;ctx.syncSeabornAura();assert.equal(card.logistics.attack,4);assert.equal(card.legacy.count,4);
 ctx.currentCommander={id:'chen'};ctx.syncSeabornAura();assert(!card.shield);assert(!card.logistics);assert(card.guard);
 ctx.currentCommander={id:'skadi_alter',seaborn_upgrades:['summon_growth','venom','revive']};ctx.syncSeabornAura();assert.equal(card.seaborn_summon_growth,2);assert(card.revive&&card.venom);
})();

(async function testHumusRemoval(){
 const code=fs.readFileSync('arena.js','utf8'),unit={id:'Courier',card_type:'unit',name:'讯使'},ally={id:'Fang',card_type:'unit'};
 const s={board:[unit,ally],bench:[],shop:[]};let calls=0;
 const ctx=vm.createContext({s,compact:a=>a.filter(Boolean),pad:a=>a,botId:'test',log(){},syncPlayer:p=>{s.gold=p.gold},api:async(url,data)=>{calls++;assert.equal(data.target.zone,'board');return {commander:{id:'humus'},player:{gold:6}}}});
 vm.runInContext(code.slice(code.indexOf('  async function useHumusSkill('),code.indexOf('  async function useQuintusSkill(')),ctx);
 await assert.rejects(ctx.useHumusSkill({id:'shop'}));assert.equal(calls,0);
 await ctx.useHumusSkill(unit);assert.equal(s.board.length,1);assert.equal(s.board[0],ally);assert.equal(s.gold,6);assert.equal(calls,1);
})().catch(e=>{console.error(e);process.exitCode=1});
