const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
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
    const picks=ctx.enemyPickOptions(),unique=new Set(ids);
    assert.equal(picks.length,ids.length?3:0);
    assert.ok(picks.every(x=>unique.has(x.id)));
    assert.equal(new Set(picks.map(x=>x.id)).size,Math.min(unique.size,3));
    if(unique.size===1){picks[0].stars=99;assert.equal(picks[1].stars,4)}
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
(async()=>{testPrepSummon();testPhantomExternalMechanisms();testHealthLockInheritance();testSummonVisualOrder();await testLifeTowerDropRoutes();testAegirGameBonus();testLifeTowerExpiry();await testComboPlaybackAndSeaKeywords();await testAnimation('bullet_batch',1);await testAnimation('w_barrage',3);await testAnimation('w_barrage',3,2);await testSelling();testGuard();for(const skip of [false,true]){await testBattleMerge(skip);await testBattleMerge(skip,1)}testTripleHints();testSaleOptions();testDeadUnitsStayHidden();testAssimilatedUnitsStayRemoved();await testPointerRelease();await testTutorialRules();await testTripleAnimationQueue();console.log('PASS: bullets, sales, guard, battle merge, triple hints and pointer release/cancel/blur')})().catch(e=>{console.error(e);process.exitCode=1});
