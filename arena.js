/* Eight-player orchestration. Bot realms reuse the actual player actions and card
 * rules; only their decisions and cosmetic rendering differ from the human. */
(() => {
  'use strict';
  const botId = new URLSearchParams(location.search).get('arena-agent');
  const legacy = {start, fight, startPrep, loadEnemy, draw, updateHud};
  const arena = {lobby:null, agents:[], running:false, task:Promise.resolve(), error:null};
  const event = () => ({preventDefault(){}, stopPropagation(){}});
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const playerUpgrade=upgradeShop;
  upgradeShop=async function(){
    const before=s.shopLevel;await playerUpgrade();
    if(s.shopLevel>before&&!botId&&arena.lobby)await chooseCommanderUpgrade();
    if(s.shopLevel>before&&!tutorial.active)(botId?window.parent:window).dispatchEvent(new CustomEvent('arena-shop-upgraded',{detail:{id:botId||playerId,level:s.shopLevel}}));
  };
  if(!botId)$('#upgrade').onclick=()=>upgradeShop();
  function stateForBattle(){
    syncNecrassFaction();syncSeabornAura();
    return cloneData({round:s.round, board:compact(s.board), bench:s.bench,
      aegir_attack_bonus:Number(s.aegirAttackBonus||0), battle_wagers:s.battleWagers,
      life_tower_effects:(s.lifeTowerEffects||[]).filter(b=>b.expires>s.round),
      snow_vanguard_effects:(s.snowVanguardEffects||[]).filter(e=>e.round===s.round).map(e=>e.amount)});
  }
  const pendingCommanderRewards=[];
  let currentCommander=null,workshopRequest=null;
  function syncDobermannAura(clear=false){
    if(s.phase==='战斗中')return;
    const c=currentCommander||arena.lobby?.seats.find(p=>p.number===0)?.commander;
    const amount=!clear&&c?.id==='dobermann'?Number(s.round||1)+Number(c.victories||0):0;
    for(const zone of ['board','shop','bench'])for(const u of s[zone]||[]){
      if(!u||u.card_type!=='unit')continue;
      const next=zone==='bench'?0:amount;
      u.attack=Number(u.attack||0)+next-Number(u._dobermann_aura||0);
      if(next)u._dobermann_aura=next;else delete u._dobermann_aura;
    }
  }
  const commanderCombine=tryCombineTriples;
  tryCombineTriples=function(){syncSeabornAura(true);syncDobermannAura(true);try{const result=commanderCombine();syncNecrassFaction();return result}finally{syncDobermannAura();syncSeabornAura()}};
  window.commanderDisplayAttack=function(u,w){
    const c=currentCommander||arena.lobby?.seats.find(p=>p.number===0)?.commander;
    // The battle engine applies the aura; preparation renders it without
    // baking a temporary bonus into cards, merges, sales or the shared pool.
    if(u&&w==='board'&&s.phase!=='战斗中'&&(c?.id==='chen'||c?.chen_activated||c?.id==='necrass'))
      return Number(u.attack||0)+Number(s.shopLevel||1);
    return Number(u?.attack||0);
  };
  const commanderBloodbattle=triggerClientBloodbattle;
  triggerClientBloodbattle=async function(u,times=1){
    await commanderBloodbattle(u,times);
    const c=currentCommander||arena.lobby?.seats.find(p=>p.number===0)?.commander;
    if(c?.id==='russell'&&s.board.includes(u)){
      const upgrades=c.command_upgrades||[],atk=1+upgrades.filter(x=>x==='attack').length,hp=1+upgrades.filter(x=>x==='health').length;
      for(let n=0;n<times;n++)applyClientBuff(u,atk,hp,0,'bloodbattle');
    }
  };
  const unitSupports=triggerPlayerSupports;
  triggerPlayerSupports=function(){
    unitSupports();
    const c=currentCommander||arena.lobby?.seats.find(p=>p.number===0)?.commander;
    if(c?.id==='silverash_reignfrost')
      for(const u of compact(s.board))applyClientBuff(u,1,1,0,'support');
  };
  const syncCommanderPlayer=syncPlayer;
  syncPlayer=function(result){
    syncCommanderPlayer(result);
    s.totalGoldSpent=Number(result.total_gold_spent??s.totalGoldSpent??0);
    s.purchasedUnits=Number(result.purchased_units??s.purchasedUnits??0);
    const c=currentCommander||arena.lobby?.seats.find(p=>p.number===0)?.commander;
    const rewardReady=(c?.id==='paganini'&&!c.workshop_claimed&&s.totalGoldSpent>=55)
      ||(c?.id==='silverash_reignfrost'&&!c.level_three_reward_claimed&&s.shopLevel>=3);
    if(rewardReady&&!workshopRequest){
      workshopRequest=api('/api/arena/commander-reward',{}).then(reward=>{
        currentCommander=reward.commander;

        if(!botId&&arena.lobby)arena.lobby.seats.find(p=>p.number===0).commander=reward.commander;
        if(reward.card)pendingCommanderRewards.push(cloneData(reward.card));
        pendingCommanderRewards.push(...(reward.cards||[]).map(cloneData));draw();
      }).catch(e=>log(e.message,'bad')).finally(()=>{workshopRequest=null});
    }
  };
  function deliverCommanderRewards(){
    while(pendingCommanderRewards.length){let i=handAppendSlot();
      s.bench[i]=pendingCommanderRewards.shift();
      log('棋手奖励：获得 '+s.bench[i].name+'。','good');
    }
  }
  window.isNextCopyTarget=function(unit){
    const c=botId?currentCommander:arena.lobby?.seats.find(p=>p.number===0)?.commander;
    return c?.id==='damazti'&&s.phase==='备战'&&(Number(s.round)+1)%2===0&&unit===s.bench.find(u=>u?.card_type==='unit'&&Number(u.locked_until_round||0)<=Number(s.round)+1);
  };
  function syncSeabornAura(clear=false){
    if(s.phase==='战斗中')return;
    const c=currentCommander||arena.lobby?.seats.find(p=>p.number===0)?.commander;
    for(const u of [...compact(s.board),...s.bench.filter(Boolean)]){
      if(u.id!=='Skadi Seaborn')continue;
      if(u._seaborn_base){for(const [k,v] of Object.entries(u._seaborn_base)){if(v===null)delete u[k];else u[k]=cloneData(v)}delete u._seaborn_base}
      if(clear||c?.id!=='skadi_alter')continue;
      const upgrades=c.seaborn_upgrades||[],factor=u.golden?2:1,keys=['mechanics','logistics','legacy','venom','shield','revive','seaborn_summon_growth'];
      u._seaborn_base=Object.fromEntries(keys.map(k=>[k,u[k]===undefined?null:cloneData(u[k])]));u.mechanics=[...(u.mechanics||[])];
      if(upgrades.includes('summon_growth'))u.seaborn_summon_growth=factor;
      if(upgrades.includes('logistics'))u.logistics={type:'self_buff',attack:2*factor,max_hp:2*factor};
      if(upgrades.includes('monsters'))u.legacy={type:'summon_distinct_sea_monsters',count:2*factor};
      for(const key of ['venom','shield','revive'])if(upgrades.includes(key)){u[key]=true;if(!u.mechanics.includes(key))u.mechanics.push(key)}
    }
  }
  const seabornPrepSummon=triggerPrepSummon;
  triggerPrepSummon=function(unit){syncSeabornAura();seabornPrepSummon(unit);for(const u of compact(s.board))if(u!==unit&&u.seaborn_summon_growth)applyClientBuff(u,u.seaborn_summon_growth,u.seaborn_summon_growth,0,'summon')};
  function syncNecrassFaction(){
    const c=currentCommander||arena.lobby?.seats.find(p=>p.number===0)?.commander;
    if(c?.id!=='necrass'||!c.necrass_awakened)return;
    for(const u of [...compact(s.board),...s.bench.filter(Boolean)])if(u.id==='Necrass'){
      u.faction='任意';delete u._kaltsit_original_faction;delete u._kaltsit_expires;
    }
  }
  const commanderRewardDraw=draw;
  draw=function(){deliverCommanderRewards();syncSeabornAura();syncNecrassFaction();refreshCommanderBlessings();syncDobermannAura();return commanderRewardDraw()};
  function examinerOptions(spent){
    const damage=3+2*Math.floor(Number(spent||0)/8);
    return [
      {mode:'left',name:'扫射迎宾仪礼·左',position:'最左侧',icon:'confessor-s2.png',mirror:true},
      {mode:'middle',name:'架盾送客仪礼',position:'中间',icon:'confessor-s3.png'},
      {mode:'right',name:'扫射迎宾仪礼·右',position:'最右侧',icon:'confessor-s2.png'}
    ].map(o=>({...o,damage,description:`先手：对${o.position}的3个棋子造成${damage}点铳弹伤害，下回合重新选择目标`}));
  }
  async function chooseExaminerMode(){
    const overlay=document.createElement('div');overlay.className='discover-pop';
    const options=examinerOptions(s.totalGoldSpent);
    overlay.innerHTML='<div class="discover-box"><h3>铳骑主考官 · 选择本回合目标</h3><p>以战斗开始时的敌方站位为准；不足3个时选取全部。</p><div class="discover-options">'+options.map(o=>`<button class="discover-option" data-mode="${o.mode}" style="white-space:normal;padding:20px"><img src="assets/commanders/${o.icon}" style="width:80px;height:80px;${o.mirror?'transform:scaleX(-1)':''}"><h3>${o.name}</h3><p>${o.description}</p></button>`).join('')+'</div><p data-error></p><button class="btn" data-cancel>取消</button></div>';
    const wasBusy=s.busy;s.busy=true;document.body.appendChild(overlay);
    try{
      await new Promise(resolve=>{
        overlay.querySelector('[data-cancel]').onclick=()=>resolve();
        overlay.querySelectorAll('[data-mode]').forEach(button=>button.onclick=async()=>{
          overlay.querySelectorAll('button').forEach(b=>b.disabled=true);
          try{
            const result=await api('/api/arena/commander-skill',{choice:button.dataset.mode});
            currentCommander=result.commander;
            Object.assign(arena.lobby.seats.find(p=>p.number===0).commander,result.commander);
            log(options.find(o=>o.mode===button.dataset.mode).name+'：已准备本回合先手。','good');resolve();
          }catch(e){overlay.querySelector('[data-error]').textContent=e.message;overlay.querySelectorAll('button').forEach(b=>b.disabled=false)}
        });
      });
    }finally{overlay.remove();s.busy=wasBusy;updateCommanderButton()}
  }
  async function chooseCommanderBlessing(){
    const state=await api('/api/arena/commander-skill',{});
    if(!state.options)return;
    let choice;
    if(botId)choice=state.options[Math.floor(Math.random()*state.options.length)];
    else{
      const wasBusy=s.busy;s.busy=true;
      const overlay=document.createElement('div');overlay.className='commander-screen discover-pop blessing-choice';overlay.style.cssText='position:fixed;inset:0;z-index:10000;display:grid;place-items:center;overflow:auto';document.body.append(overlay);
      const effects={X:'增加棋子属性',Y:'增加棋子属性和铳弹强度',Z:'增加棋子属性和复活'};
      try{
        overlay.innerHTML=`<section><h1>陈述苦难</h1><p>选择一个苦难。不可连续选择相同苦难；等待结束前无法再次使用。</p>${['X','Y','Z'].map((k,i)=>`<button class="btn" data-blessing="${k}" ${state.options.includes(k)?'':'disabled'}><img src="assets/commanders/fiammetta-s${i+1}.png" width="64" height="64" alt="${sufferingName(k)}"><h2>${sufferingName(k)}</h2><p>${i+1}回合后，回营：获得1张【${sufferingName(k)}：${effects[k]}】，并重新选择（可超过手牌上限）</p><p>使用时获得当前回合数×3的攻击力和生命值${k==='Y'?'，以及等于当前回合数的铳弹强度':k==='Z'?'，以及复活':''}。</p></button>`).join('')}<p data-error></p></section>`;
        const result=await new Promise(resolve=>overlay.querySelectorAll('[data-blessing]:not(:disabled)').forEach(b=>b.onclick=async()=>{
          overlay.querySelectorAll('button').forEach(x=>x.disabled=true);
          try{resolve(await api('/api/arena/commander-skill',{choice:b.dataset.blessing}))}
          catch(e){overlay.querySelector('[data-error]').textContent=e.message;overlay.querySelectorAll('button').forEach(x=>x.disabled=!state.options.includes(x.dataset.blessing))}
        }));
        receiveBlessingChoice(result);return;
      }finally{overlay.remove();s.busy=wasBusy;updateCommanderButton()}
    }
    receiveBlessingChoice(await api('/api/arena/commander-skill',{choice}));
  }
  function receiveBlessingChoice(result){
    pendingCommanderRewards.push(cloneData(result.card));
    const seat=arena.lobby?.seats.find(p=>p.number===0);if(seat&&!botId)seat.commander=result.commander;
    draw();
  }
  async function choosePrivateFunding(stage){
    let choice;
    if(botId)choice=emptyBench()<0||s.gold<3?'gold':'units';
    else{
      const overlay=document.createElement('div');overlay.className='commander-screen discover-pop';overlay.style.cssText='position:fixed;inset:0;z-index:10000;display:grid;place-items:center';
      overlay.innerHTML=`<section><h1>私募资金 · 选择奖励</h1><p>第${stage*3}回合投资回报</p><button class="btn" data-choice="gold">${stage*3}枚金币</button><button class="btn" data-choice="units">${stage}个${s.shopLevel}星随机棋子</button><p>棋子受手牌上限限制，不触发招募。</p></section>`;
      document.body.append(overlay);
      try{choice=await new Promise(resolve=>overlay.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>resolve(b.dataset.choice)))}finally{overlay.remove()}
    }
    const result=await api('/api/arena/commander-skill',{choice});syncPlayer(result.player);currentCommander=result.commander;
    if(!botId)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    for(const card of result.cards||[]){const i=emptyBench();if(i<0){log('备战区已满，无法获得剩余私募资金棋子。','bad');break}s.bench[i]=cloneData(card);tryCombineTriples()}
    log('私募资金：'+(choice==='gold'?'获得'+result.gained+'金币':'已领取棋子奖励')+'。','good');
  }
  async function preparation(){
    clearInterval(s.timer);expireSnowVanguard();expireLifeTower();unlockDeliveredCards();
    s.phase='备战';s.busy=true;s.skipBattle=false;s.skipBattleAvailable=false;
    s.prepSeconds=PREP_TIMES[Math.min(s.round-1,PREP_TIMES.length-1)]||90;
    if(s.pendingNextRoundGold>0){syncPlayer(await api('/api/gain_gold',{amount:s.pendingNextRoundGold}));s.pendingNextRoundGold=0}
    await resolveReturnCampEffects();
    const reward=await api('/api/arena/commander-reward',{});
    if(reward.player)syncPlayer(reward.player);
    currentCommander=reward.commander;
    if(reward.fund_stage){await choosePrivateFunding(reward.fund_stage);reward.commander=currentCommander}
    if(currentCommander?.id==='damazti'&&s.round%2===0){
      const copied=await api('/api/arena/commander-skill',{target:{hand:cloneData(s.bench)}});
      currentCommander=copied.commander;reward.commander=copied.commander;
      if(copied.card){const source=s.bench[copied.index];source.attack=1;source.max_hp=1;source.current_hp=1;s.bench[handAppendSlot()]=cloneData(copied.card);log('变形同构：复制'+source.name+'，两张棋子变为1/1。','good');tryCombineTriples()}
    }

    if(reward.goliath_buff){
      for(const unit of [...compact(s.board),...s.bench.filter(u=>u?.card_type==='unit')])applyClientBuff(unit,reward.goliath_buff,reward.goliath_buff,0,'commander');
      log('坚不可摧：棋盘和手牌棋子获得 +'+reward.goliath_buff+'/+'+reward.goliath_buff+'，已激活【以己之长】。','good');
    }
    pendingCommanderRewards.push(...(reward.cards||[]).map(cloneData));
    deliverCommanderRewards();
    const seat=arena.lobby?.seats.find(p=>p.number===0);if(seat&&!botId)seat.commander=reward.commander;
    if(reward.card){
      if(reward.reselect)s.bench=s.bench.map(c=>c?.effect==='commander_blessing_wait'?null:c);
      pendingCommanderRewards.push(cloneData(reward.card));draw();
    }
    if(reward.condensation_options?.length){
      let chosen=null;
      while(!chosen)chosen=await chooseThree('至纯凝结 · 选择一个4星金色棋子（第6回合解锁）',reward.condensation_options);
      const result=await api('/api/arena/commander-skill',{choice:chosen.id});
      currentCommander=result.commander;if(seat&&!botId)seat.commander=result.commander;
      pendingCommanderRewards.push(cloneData(result.card));deliverCommanderRewards();
      log('至纯凝结：获得'+result.card.name+'，已增加+10/+10，第6回合解锁。','good');
    }
    if(reward.reselect||(botId&&reward.commander?.id==='fiammetta'&&!reward.commander.blessing_pending))await chooseCommanderBlessing();
    s.busy=false;draw();
  }
  async function applyResult(res,before,animated){
    s.phase='战斗中';s.enemy=pad(cloneData(res.opponent_board));
    if(animated)await animateEvents(res);
    else for(const e of res.events)if(e.type==='gain_card'||e.type==='aegir_game_attack')applyEventLog(cloneData(e));
    s.aegirAttackBonus=Number(res.aegir_attack_bonus||0);syncPlayer(res);s.battleWagers=0;
    s.board=restoreBoardAfterBattle(before,res.left,res.persistent_left);
    for(const u of s.board)if(u)delete u._dobermann_aura;
    s.enemy=pad(cloneData(res.opponent_board));s.phase='结算';syncAegirGameBonus();
    tryCombineTriples();draw();
  }
  async function newShop(){await replenishShop()}

  const guideKey='autochess-lineups-v2';
  const guideFactions=['拉特兰','炎','维多利亚','阿戈尔','谢拉格','卡西米尔','其他'];
  const guideDefaults=[
    ['拉特兰','铳弹累计','信仰搅拌机,菲亚梅塔,莫斯提马,见行者,能天使,W,逻各斯','翎羽,CONFESS-47,安比尔,芳汀,空构','前期用低费铳弹卡稳血，保留莫斯提马和见行者；后期组合多段铳弹与遗计。'],
    ['炎','成长与化境','重岳,年,陈,左乐,夕,令,乌有','乌有,惊蛰,矩,录武官,红豆','乌有提供过渡技能；经济允许时升级，逐步补齐成长核心。'],
    ['维多利亚','血战接力','维娜·维多利亚,风笛,焰影苇草,号角,夜魔,白铁,酒神','格拉尼,谜图,海蒂,戴菲恩,洛洛,薄绿','格拉尼稳住前期，以血战触发群体成长；保留血战触发器和后期群体增益。'],
    ['阿戈尔','召唤成长','归溟幽灵鲨,斯卡蒂,乌尔比安,歌蕾蒂娅,海霓,引星棘刺,浊心斯卡蒂','深海色,幽灵鲨,海沫,絮雨,格劳克斯,安哲拉','前期用嘲讽和召唤承伤；后期让召唤物获得增益，注意给召唤留出空间。'],
    ['谢拉格','攻击前与冲阵','锏,凛御银灰,耶拉,史都华德,初雪,圣聆初雪,哈洛德','讯使,角峰,银灰,雪猎,极光,烈夏,崖心','阻挡棋子靠前，突袭增加攻击前次数，雪境先驱与冲阵提供持续成长。'],
    ['中立','遗计混合','W,死芒,妮芙,逻各斯,莫斯提马,夜魔,酒神','红豆,罗比菈塔,芬,伊内丝,波登可','中立适合跨阵营补强；围绕遗计与群体成长选择核心，优先保护增幅棋子。'],
    ['任意','灵活补强','傀影,乌有,重岳,莫斯提马,见行者,风笛,夜魔','U-Official,斑点,格拉尼,幽灵鲨,讯使','任意阵营可搭配不同体系，傀影帮助三连；不必为了凑阵营强留弱卡。']
  ];
  function guideStore(){
    const current=localStorage.getItem(guideKey);
    if(current){const data=JSON.parse(current);if(data.version!==2||!Array.isArray(data.guides))throw Error('推荐阵容数据格式不正确，原数据已保留。');return data}
    const saved=JSON.parse(localStorage.getItem('autochess-lineups-v1')||'{}')||{};
    const names=new Map((s.cards||[]).map(u=>[u.name,u.id]));
    // Preserve both mixed-faction plans and retain the original storage as backup.
    const guides=guideDefaults.map(([faction,name,core,transition,note],i)=>{
      const custom=saved[faction],valid=custom&&Array.isArray(custom.core)&&Array.isArray(custom.transition);
      return {id:'default-'+i,faction:guideFactions.includes(faction)?faction:'其他',
        name:valid?String(custom.name||name):name,note:valid?String(custom.note||''):note,
        core:valid?custom.core:core.split(',').map(n=>names.get(n)).filter(Boolean),
        transition:valid?custom.transition:transition.split(',').map(n=>names.get(n)).filter(Boolean)};
    });
    const data={version:2,guides};
    if(s.cards?.length)localStorage.setItem(guideKey,JSON.stringify(data));
    return data;
  }
  let sharedGuideCache=null,guideEditable=false;
  async function syncGuides(){
    let remote=await api('/api/guides');
    const marker='autochess-guides-migrated-'+remote.token;
    if(remote.editable&&!localStorage.getItem(marker)){
      if(!remote.initialized||localStorage.getItem(guideKey)||localStorage.getItem('autochess-lineups-v1')){
        const local=guideStore().guides;
        remote=await api('/api/guides',{mode:'import',guides:local});
      }
      localStorage.setItem(marker,'1');
    }
    sharedGuideCache=remote.guides;guideEditable=remote.editable===true;
  }
  function readGuides(){return sharedGuideCache||guideStore().guides}
  async function saveGuide(guide){
    const remote=await api('/api/guides',{guide});sharedGuideCache=remote.guides;
  }

  if(botId){
    s.arenaPlayerId=botId;
    // No timers, animation, audio or card DOM churn in decision realms.
    draw=()=>{deliverCommanderRewards();refreshCommanderBlessings();syncDobermannAura();syncAegirGameBonus();s.board=pad(s.board)};
    queueTripleAnimation=()=>{};captureTripleSources=()=>[];
    animatePrepAssimilate=async()=>{};
    let number=1, steps=0, done=false, skippedSkills=new Set(), rejectedShop=new Set();
    const profiles=[[1.4,.7,.8,.8],[.85,1.45,.9,.8],[.9,1,1.5,.8],[1,1,1,1.5],[1.2,1,1.2,1],[1,1.2,1,1.2],[1.1,1.1,1.1,1.1]];
    let policy=null,trainingGuides=null;
    function validPolicy(p){return Array.isArray(p)&&p.length===6&&p.every(v=>Number.isFinite(v)&&v>=.25&&v<=3)}

    const weights=()=>policy||[...profiles[(number-1)%profiles.length],1,1];
    const owned=()=>[...compact(s.board),...s.bench.filter(Boolean)].filter(u=>u.card_type==='unit');
    let plan=null,planRound=0;
    function selectPlan(){
      const available=new Set(s.cards.filter(c=>c.card_type==='unit').map(c=>c.id));
      const plans=(trainingGuides||readGuides()).filter(g=>g.core.length&&g.core.every(id=>available.has(id))),units=owned();
      const value=g=>units.reduce((n,u)=>n+(g.core.includes(u.id)?12+(u.golden?6:0):g.transition.includes(u.id)?4:0),0)+(plan?.id===g.id?9:0)+(plans.indexOf(g)===(number-1)%plans.length?3:0);
      plan=plans.reduce((best,g)=>!best||value(g)>value(best)?g:best,null);planRound=s.round;
    }
    function strategicValue(u){
      const team=compact(s.board),others=team.filter(x=>x!==u),keys=['initiative','logistics','on_deploy','legacy'];
      let value=0;
      for(const key of keys){
        const power=Number(u[key+'_multiplier']||1);if(power<=1)continue;
        const existing=Math.max(1,...others.map(x=>Number(x[key+'_multiplier']||1)));
        const users=(key==='on_deploy'?owned():others).filter(x=>x[key]).length;
        value+=Math.min(5,users)*7*Math.max(0,power-existing);
        if(existing>=power)value-=12;
      }
      const family=others.filter(x=>x.faction===u.faction||x.faction==='任意').length;
      if(family>=2){
        const core=!!(u.shield_loss_team_buff||u.shield_loss_buff||u.aura||u.ally_before_attack||u.charge||u.cumulative||/team|aegir|summon_buff/.test(JSON.stringify({bloodbattle:u.bloodbattle,legacy:u.legacy,on_summon:u.on_summon})));
        if(core)value+=Math.min(5,family)*4;
      }
      return value;
    }
    function skillTargetScore(u,skill=null){
      if(skill?.effect==='four_seasons'){
        // Evaluate the next card's growth, not accumulated stats (which made Nian
        // keep winning every subsequent target selection).
        const team=compact(s.board),e=u.morale||{},a=Number(e.attack||0),h=Number(e.max_hp||e.hp||0);
        let targets=[u];
        if(['team_hp_buff','team_attack_buff','team_buff'].includes(e.type))targets=team;
        else if(e.type==='faction_team_buff')targets=team.filter(x=>x.faction===e.faction||x.faction==='任意');
        else if(e.type==='random_other_buff')targets=team.filter(x=>x!==u).slice(0,1);
        const logistics=Math.max(1,...team.map(x=>Number(x.logistics_multiplier||1)));
        const growth=(a*1.4+h)*targets.length*(1+logistics);
        const value=Number(skill.effect_value||1),attackNeed=Math.min(2,Number(u.max_hp||1)/Math.max(1,Number(u.attack||0)));
        return growth+value*(u.cleave?2*attackNeed:0)+Math.min(2,Math.max(0,strategicValue(u))/10)+(u.golden?.5:0);
      }
      const core=plan?.core.includes(u.id),transition=plan?.transition.includes(u.id)&&!core;
      return score(u)+strategicValue(u)+(core?30:0)+(u.golden?12:0)-(transition?20:0)-(Number(u.tier||u.stars||1)<=2&&!core?12:0);
    }
    function score(u,shopping=false){
      if(!u)return -Infinity;
      if(u.card_type==='skill')return 8+Number(u.effect_value||0)*2;
      const [tempo,,economy,synergy,coreWeight,transitionWeight]=weights(),team=compact(s.board),text=JSON.stringify(u);
      let value=(Number(u.attack||0)+Number(u.max_hp||0))*.6+Number(u.stars||u.tier||1)*1.3;
      for(const mark of ['shield','revive','lock_hp','combo','venom','block'])if(hasMark(u,mark))value+=mark==='venom'?6:3;
      if(u.legacy)value+=3;if(u.initiative)value+=2;if(u.bloodbattle)value+=3;
      value*=tempo+(s.hp<20?.5:0);
      if(/gain_gold|gain_card|gain_.*(?:seasons|soil|sorrow|vanguard|sunlit|alliance)|discover|upgrade_shop/.test(text))value+=economy*(s.round<10?6:3);
      const family=team.filter(x=>x!==u&&(x.faction===u.faction||x.faction==='任意'||u.faction==='任意')).length;
      value+=Math.min(5,family)*synergy*1.8;
      if(/bullet|cumulative/.test(text)&&team.some(x=>x!==u&&/bullet|cumulative/.test(JSON.stringify(x))))value+=4;
      if(/summon|aegir/.test(text)&&team.some(x=>x!==u&&/summon|aegir/.test(JSON.stringify(x))))value+=4;
      if(/bloodbattle/.test(text)&&team.some(x=>x!==u&&/bloodbattle/.test(JSON.stringify(x))))value+=3;
      const seasonsEngine=team.some(x=>x.gold_spend?.type==='gain_four_seasons');
      const growthCore=team.some(x=>['team_attack_buff','faction_team_buff','team_buff'].includes(x.morale?.type));
      if(u.gold_spend?.type==='gain_four_seasons'&&growthCore)value+=12*economy;
      if(u.logistics?.type==='gain_gold'&&seasonsEngine&&growthCore)value+=10*economy;
      if(u.morale&&seasonsEngine)value+=8*synergy;
      if(plan){
        const progress=team.filter(x=>plan.core.includes(x.id)).length;
        if(plan.core.includes(u.id))value+=(12+synergy*4+progress*1.5)*coreWeight;
        else if(plan.transition.includes(u.id))value+=Math.max(1,10-progress*2-(s.round>9?4:0))*transitionWeight;
      }
      if(shopping&&!u.golden){const copies=owned().filter(x=>!x.golden&&x.id===u.id).length;value+=copies===1?5:copies>=2?28:0;if(canCompleteTriple(u))value+=20}
      return value+strategicValue(u);
    }
    const bestIndex=(items,fn=score)=>items.reduce((best,u,i)=>u&&(best<0||fn(u)>fn(items[best]))?i:best,-1);
    chooseThree=async(_title,options)=>{
      if(options.some(u=>u.exclusive_emergency)){
        const effect=s.hp<=15?'precision_drop':s.round<12?'budget_saving':'tactical_delivery';
        return cloneData(options.find(u=>u.effect===effect)||options[0]);
      }
      return cloneData(options[bestIndex(options,u=>u.emergency_target_index!==undefined?-score(u):score(u,true))]||null);
    };
    chooseBlessingStat=async u=>Number(u.attack)>Number(u.max_hp)?'attack':'hp';
    async function choices(){
      if(s.deployTarget){const p=s.deployTarget,mark=({select_buff_shield:'shield',select_buff_combo:'combo',select_buff_lock_hp:'lock_hp',select_buff_revive:'revive'})[p._effect.type];
        await chooseDeployTarget(bestIndex(p._options,u=>skillTargetScore(u)+(s.board.includes(u)?12:0)-(mark&&hasMark(u,mark)?8:0)));return true}
      const pop=document.querySelector('.discover-pop');
      if(pop){const buttons=[...pop.querySelectorAll('.discover-option')],idx=bestIndex(pop._options||[],u=>score(u,true));
        if(buttons[idx]){buttons[idx].click();return true}
        throw Error('AI无法处理的选择界面');}
      return false;
    }
    function placement(unit){
      const team=compact(s.board);
      if(hasMark(unit,'block')||hasMark(unit,'guard')||unit.before_attack)return 0;
      if(/adjacent|left/.test(JSON.stringify(unit.on_deploy||{})))return Math.min(1,team.length);
      return team.length;
    }
    async function step(){
      if(await choices())return true;
      if(done||s.hp<=0)return false;
      if(planRound!==s.round||!plan)selectPlan();
      if(++steps>100){done=true;return false} // Bound repeated economic cycling, not rule resolution.
      const team=compact(s.board),hand=s.bench.filter(u=>u?.card_type==='unit'&&Number(u.locked_until_round||0)<=Number(s.round)+1);
      if(hand.length&&team.length<7){const unit=hand[bestIndex(hand)],i=s.bench.indexOf(unit);s.dragging={type:'bench',index:i};await dropToBoardInsert(event(),placement(unit));s.dragging=null;return true}
      const replace=bestIndex(team,u=>-score(u)),upgrade=bestIndex(hand);
      if(team.length===7&&upgrade>=0&&score(hand[upgrade])>score(team[replace])+3){if(currentCommander?.id==='humus'&&currentCommander.skill_used_round!==s.round)await useHumusSkill(team[replace]);else await sellCard('board',replace);return true}
      for(let i=0;i<s.bench.length;i++){
        const sk=s.bench[i];if(!sk||sk.card_type!=='skill'||skippedSkills.has(sk))continue;
        const destructive=['life_equation','self_repair','emergency_defibrillation','remove_for_gold','sacrifice_share_stats'].includes(sk.effect);
        if(destructive&&(sk.effect==='life_equation'?team.length<2:(!hand.length||!team.length))){skippedSkills.add(sk);continue}
        s.dragging={type:'bench',index:i};
        if(['single_unit','board_unit'].includes(sk.target_scope)&&team.length){
          const idx=bestIndex(team,u=>destructive?-score(u):skillTargetScore(u,sk));
          const target=team[idx],valuable=plan?.core.includes(target.id)||target.golden||strategicValue(target)>=10||Number(target.tier||target.stars)>=3;
          if(!destructive&&!valuable&&s.hp>20&&emptyBench()>=3){s.dragging=null;continue}
          await dropSkillToUnit(event(),idx);
        }else if(sk.target_scope==='shop_unit'){
          const idx=bestIndex(s.shop,u=>score(u,true));if(idx>=0){if(sk.effect==='angel_blessing')await useAngelBlessing(i,idx);else await useShopTransformSkill(i,idx)}
        }else await useBenchSkill(i,true);
        s.dragging=null;if(s.bench[i]===sk&&!document.querySelector('.discover-pop'))skippedSkills.add(sk);else return true;
      }
      const weak=bestIndex(team,u=>-score(u)),strong=bestIndex(hand);
      if(team.length===7&&strong>=0&&score(hand[strong])>score(team[weak])+3){if(currentCommander?.id==='humus'&&currentCommander.skill_used_round!==s.round)await useHumusSkill(team[weak]);else await sellCard('board',weak);return true}
      const levelBias=weights()[1],targetLevel=Math.min(6,1+Math.floor((s.round+(levelBias>1.2?1:0))/2));
      if(s.shopLevel<6&&s.gold>=s.upgradeCost&&s.shopLevel<targetLevel&&team.length>=Math.min(3,s.round)&&
        (s.hp>20||s.upgradeCost<=2)&&(levelBias>1.2||s.gold-s.upgradeCost>=3||s.upgradeCost===0)){
        await upgradeShop();rejectedShop.clear();return true;
      }
      const idx=bestIndex(s.shop,u=>rejectedShop.has(u)?-Infinity:score(u,true)),candidate=s.shop[idx];
      const worthwhile=candidate&&!rejectedShop.has(candidate)&&(team.length<7||score(candidate,true)>score(team[weak])+2);
      if(worthwhile&&s.gold>=3&&emptyBench()>=0){await buyShopIndex(idx);if(s.shop[idx]===candidate)rejectedShop.add(candidate);return true}
      if(emptyBench()<0&&hand.length){const u=hand[bestIndex(hand,x=>-score(x))];await sellCard('bench',s.bench.indexOf(u));return true}
      if(s.shopLevel<6&&s.gold>=s.upgradeCost&&s.shopLevel<targetLevel){await upgradeShop();return true}
      if(s.freeRefreshes>0||s.gold>=4){await refresh();rejectedShop.clear();return true}
      s.shopLocked=!!(worthwhile&&canCompleteTriple(candidate));done=true;return false;
    }
    window.arenaAgent={
      configure(options){if(!validPolicy(options.weights))throw Error('训练参数不合法');policy=options.weights.slice();trainingGuides=cloneData(options.guides);plan=null;planRound=0},
      guides:readGuides,
      async init(seat){const shared=await api('/api/training');policy=validPolicy(shared.policy?.weights)?shared.policy.weights:null;number=seat.number||8;s.started=true;s.cards=await api('/api/cards');await syncGuides();syncPlayer(await api('/api/player'));s.shop=await api('/api/shop');await preparation()},
      step,
      async submit(){while(await choices()){};if(currentCommander?.id==='cannot'&&currentCommander.skill_used_round!==s.round&&s.gold>=Math.max(0,10-Number(currentCommander.merchant_discount||0))&&s.shop.some(u=>u?.card_type==='unit')&&s.bench.filter(Boolean).length+s.shop.filter(u=>u?.card_type==='unit').length<=12)await useCannotSkill();if(currentCommander?.id==='jessica'&&s.shopLevel>=2&&emptyBench()>=0&&(currentCommander.rally_options?.length||(currentCommander.skill_used_round!==s.round&&s.gold>=2&&s.shop.some(u=>u?.card_type==='unit')))){try{await useJessicaSkill(s.shop.find(u=>u?.card_type==='unit'))}catch(e){log(e.message,'bad')}};if(currentCommander?.id==='tinman')for(let n=0;n<2&&currentCommander.skill_used_round!==s.round&&s.gold>=1&&emptyBench()>=0&&s.shop.some(u=>u?.card_type==='unit');n++)await useTinmanSkill();if(currentCommander?.id==='yu'&&(currentCommander.isomorph_options?.length||(currentCommander.skill_used_round!==s.round&&s.gold>=1)))await useYuSkill();if(currentCommander?.id==='kaltsit'&&currentCommander.skill_used_round!==s.round){const targets=compact(s.board);targets.sort((a,b)=>score(b)-score(a));if(targets.length)await useKaltsitSkill(targets[0])}if(currentCommander?.id==='qalaisa'&&currentCommander.skill_used_round!==s.round){const targets=compact(s.board);targets.sort((a,b)=>score(b)-score(a));if(targets.length)await useQalaisaSkill(targets[0])}if(currentCommander?.id==='quintus'&&currentCommander.skill_used_round!==s.round){const targets=compact(s.board).filter(u=>unitRarity(u)<6);targets.sort((a,b)=>score(a)-score(b));if(targets.length)await useQuintusSkill(targets[0])}if(currentCommander?.id==='warfarin'&&currentCommander.skill_used_round!==s.round){const targets=compact(s.board);targets.sort((a,b)=>Number(!!b.logistics)-Number(!!a.logistics)||(b.attack+b.max_hp)-(a.attack+a.max_hp));if(targets.length)await useWarfarinSkill(targets[0])}if(currentCommander?.id==='shu'&&currentCommander.skill_used_round!==s.round){const targets=[...compact(s.board),...compact(s.shop)];targets.sort((a,b)=>shuTargets(b.faction).length-shuTargets(a.faction).length);if(targets.length)await useShuSkill(targets[0])}if(plan){const team=compact(s.board);team.sort((a,b)=>{const pos=u=>hasMark(u,'block')?-2:plan.core.includes(u.id)?plan.core.indexOf(u.id):hasMark(u,'guard')?-1:8;return pos(a)-pos(b)});s.board=pad(team)}await workshopRequest;deliverCommanderRewards();await api('/api/arena/submit',stateForBattle())},
      async result(res,finished){if(!res)return;await applyResult(res,compact(s.board).map(cloneData),false);done=finished||s.hp<=0;steps=0;skippedSkills.clear();rejectedShop.clear()},
      async prepare(){if(s.hp<=0)return;await newShop();await preparation();await syncGuides();selectPlan();done=false},
      inspect(){return {round:s.round,gold:s.gold,hp:s.hp,level:s.shopLevel,board:cloneData(s.board),bench:cloneData(s.bench),steps,done}}
    };
    return;
  }

  document.head.insertAdjacentHTML('beforeend', `<style>
    .delivery-selectable{outline:3px solid #ffcf8b!important;box-shadow:0 0 26px #ff944b99!important;cursor:crosshair!important;filter:brightness(1.15)}.delivery-target-notice{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:10020;background:#13241df5;border:1px solid #edb775;padding:18px 28px;text-align:center;max-width:90vw;color:#fff1d5;box-shadow:0 10px 40px #0009}
    .blessing-choice section{width:min(1080px,100%)}.blessing-choice [data-blessing]{width:calc(33.333% - 16px);margin:8px;min-height:250px;vertical-align:top;white-space:normal;text-align:left;line-height:1.7;padding:24px;border-top:3px solid #d0b76e}.blessing-choice [data-blessing]:disabled{opacity:.35;cursor:not-allowed}.blessing-choice h2{color:#efd68a}.blessing-choice [data-blessing]:hover:not(:disabled){background:#254638}@media(max-width:700px){.blessing-choice [data-blessing]{width:100%;min-height:0;margin:8px 0}}
    .brief-exit{position:absolute;left:24px;top:24px;display:flex;align-items:center;gap:10px;background:#ae3038;border:1px solid #ec747b;color:white;padding:10px 16px;cursor:pointer;font:inherit;font-weight:bold;z-index:2}.brief-exit:hover{background:#cf4149}.brief-exit svg{width:28px;height:28px}.battle-tools .lineup-open{margin:8px 0;width:100%}
    #factionPreview{position:relative;min-height:100vh;display:grid;place-items:center;padding:28px;background:radial-gradient(ellipse at 20% 40%,#173b32,#060d0b 70%);box-sizing:border-box}
    #factionPreview.hidden{display:none}.faction-brief{width:min(900px,90vw);border-top:3px solid #c5e735;border-bottom:1px solid #426d5c;padding:40px 32px;background:linear-gradient(110deg,#162a23e8,#0d1915de);box-shadow:0 28px 90px #0008}.faction-brief small{font:11px monospace;letter-spacing:.18em;color:#7d9e90}.faction-brief h1{font-size:42px;text-align:left;margin:20px 0 8px;color:#f0f5e9}.brief-subtitle,.brief-note{color:#a9bbae}.faction-row{display:flex;gap:20px;padding:26px 0;border-top:1px solid #355345;align-items:center}.faction-row>div{display:flex;flex-wrap:wrap;gap:10px}.faction-row strong{white-space:nowrap;color:#d9e5d9}.faction-chip{padding:10px 18px;border-left:3px solid var(--faction);background:#ffffff08;color:#e1eadd;font-weight:bold}.faction-chip.unavailable{opacity:.7;text-decoration:line-through}.faction-brief button{display:block;margin:30px 0 0 auto;min-width:230px}.faction-brief button span{margin-left:30px}@media(max-width:600px){.faction-brief{padding:24px 16px}.faction-row{align-items:flex-start;flex-direction:column;gap:12px}.faction-chip{padding:8px 10px}.faction-brief h1{font-size:30px}}
    .lineup-guide{width:min(1050px,94vw);max-height:90vh;overflow:auto;background:#10201b;color:#e2f5eb;border:1px solid #5eaa89;padding:24px}.lineup-guide::backdrop{background:#020805c9}.lineup-guide nav{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.lineup-guide nav .active{border-color:#80edba;color:#80edba}.lineup-cards{display:flex;flex-wrap:wrap;gap:8px}.lineup-cards article{width:110px;padding:8px;background:#1c3229;text-align:center;border:1px solid #416253}.lineup-cards .result-portrait{width:65px;height:65px;margin:auto}.lineup-cards small{display:block;color:#a9c6b9}.lineup-guide label{display:block;margin:12px 0}.lineup-guide input,.lineup-guide textarea{display:block;box-sizing:border-box;width:100%;background:#08130e;color:#e5fff0;border:1px solid #547a64;padding:10px;font:inherit}.lineup-guide textarea{min-height:80px}.lineup-guide .guide-feedback{color:#ffe18c}.lineup-guide header{display:flex;justify-content:space-between;align-items:center}.lineup-open{margin:5px 10px}
    .arena-nickname{display:flex;align-items:center;justify-content:center;gap:12px;color:var(--text-lo);margin:16px auto;font-size:13px}
    .arena-nickname input{background:#0c1712;color:#e7fff5;border:1px solid #3d7b64;padding:10px 14px;width:200px;outline-color:#79eac1}
    .arena-seats{display:none;justify-content:center;gap:clamp(8px,2vw,28px);padding:2px 0 10px;border-bottom:1px solid #4ed8af22;margin-bottom:10px}
    .arena-mode .arena-seats{display:flex}.arena-seat{background:none;border:0;color:#abcbbf;padding:0;cursor:pointer;min-width:42px;font:14px var(--font-mono);transition:filter .2s}
    .arena-seat:hover{filter:brightness(1.3)}.arena-ring{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:conic-gradient(#74d7b6 var(--health),#293c34 0);padding:1.5px}
    .arena-seat{position:relative}.arena-seat.next-opponent .arena-ring{animation:arenaOpponent 2.4s ease-in-out infinite;outline:1px solid #c2ffe3;outline-offset:3px}
    @keyframes arenaOpponent{0%,100%{box-shadow:0 0 3px #83ffbc40;filter:brightness(1)}50%{box-shadow:0 0 18px #83ffbcaa;filter:brightness(1.65)}}
    .arena-upgrade-stars{position:absolute;top:100%;left:50%;display:flex;justify-content:center;gap:2px;white-space:nowrap;color:#ffe16b;z-index:20;pointer-events:none;filter:drop-shadow(0 0 4px #deb82e);animation:arenaLevelUp .5s ease-in-out both}
    .arena-upgrade-stars i{font:11px/10px sans-serif;font-style:normal}
    @keyframes arenaLevelUp{0%,100%{opacity:0;transform:translate(-50%,-6px) scale(.7)}25%,65%{opacity:1;transform:translate(-50%,12px) scale(1)}}
    @media(prefers-reduced-motion:reduce){.arena-seat.next-opponent .arena-ring{animation:none;box-shadow:0 0 10px #83ffbcaa}}
    .arena-ring>span{display:grid;place-items:center;background:#101e18;border-radius:50%;width:100%;height:100%;font-size:17px}.arena-seat small{display:block;margin-top:3px;font-size:11px}
    .arena-seat.is-self{color:#e9fff6}.arena-seat.is-self .arena-ring{box-shadow:0 0 14px #5cf2b94d}.arena-seat.is-self .arena-ring>span{background:#254738}.arena-seat.eliminated{opacity:.4}
    body.arena-mode #gameMain>.enemy,body.arena-mode #gameMain>.log-panel{display:none!important}
    body.arena-mode #gameMain>.board-panel{grid-row:2!important}body.arena-mode #gameMain>.bench-panel{grid-row:3!important}
    body.arena-mode.arena-combat #gameMain>.shop-panel{display:none!important}body.arena-mode.arena-combat #gameMain>.enemy{display:block!important;grid-row:1!important}body.arena-mode.arena-combat #gameMain>.board-panel{grid-row:2!important}body.arena-mode.arena-combat #gameMain>.bench-panel{grid-row:3!important}
    body.arena-mode [data-terminal-panel="enemy"],body.arena-mode [data-panel="enemy"],body.arena-mode [data-terminal-panel="log-panel"],body.arena-mode [data-panel="log-panel"]{display:none}
    .arena-inspect{background:#0e1c16;color:#def5e9;border:1px solid #467c65;width:min(1100px,94vw);max-height:85vh;padding:24px}.arena-inspect::backdrop{background:#020906bf;backdrop-filter:blur(5px)}
    .arena-inspect .victory-units,.arena-results .victory-units{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.arena-inspect .victory-unit,.arena-results .victory-unit{width:112px;padding:8px;min-width:0;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:6px}.arena-inspect .result-portrait,.arena-results .result-portrait{width:76px;height:76px}
    .arena-results{max-height:92vh;overflow:auto;width:min(1140px,96vw)}.arena-result-row{padding:18px 8px;border-bottom:1px solid #315241}.arena-result-row h2 small{float:right;font-size:12px}.arena-results .victory-title{font-size:40px!important}
    @media(max-width:850px){.arena-ring{width:34px;height:34px}.arena-seat{min-width:30px}.arena-seats{gap:8px}}
  </style>`);
  async function openLineupGuide(){
    if(tutorial.active)return;
    if(!s.cards?.length)s.cards=await api('/api/cards');
    const catalog=await api('/api/catalog');
    await syncGuides();
    document.getElementById('lineupGuide')?.remove();
    const dialog=document.createElement('dialog');dialog.id='lineupGuide';dialog.className='lineup-guide';
    let selected='拉特兰',selectedId=null,editing=false,draft=null;
    function render(){
      const guides=readGuides(),options=guides.filter(x=>x.faction===selected),g=draft||options.find(x=>x.id===selectedId)||options[0]||{name:'暂无阵容',note:'点击“＋ 添加阵容”创建第一套阵容。',core:[],transition:[]},pool=catalog.filter(u=>u.card_type==='unit'&&!u.summon_only&&!u.cannot_gain),byId=new Map(pool.map(u=>[u.id,u]));
      const list=ids=>ids.map(id=>byId.get(id)).filter(Boolean).map(u=>`<article>${resultPortrait(u)}<b>${esc(u.name)}</b><small>${u.stars} 星 · ${esc(u.faction)}</small></article>`).join('')||'<p>未设置棋子</p>';
      dialog.innerHTML=`<header><h2>推荐阵容</h2><button class="btn" data-close>关闭</button></header><p>成型阵容按左→右排列；过渡卡帮助前中期稳住战力，可跨阵营搭配。推荐仅作参考。</p><nav>${guideFactions.map(f=>`<button class="btn ${f===selected?'active':''}" data-faction="${esc(f)}">${esc(f)}</button>`).join('')}</nav><nav aria-label="阵容列表">${options.map(x=>`<button class="btn ${x.id===g.id?'active':''}" data-guide="${esc(x.id)}">${esc(x.name)}</button>`).join('')}${guideEditable?`<button class="btn" data-add aria-label="为${esc(selected)}添加阵容">＋ 添加阵容</button>`:''}</nav><h3>${esc(g.name)}</h3><p>${esc(g.note)}</p><h3>成型阵容</h3><div class="lineup-cards">${list(g.core)}</div><h3>过渡卡</h3><div class="lineup-cards">${list(g.transition)}</div><p>打法保存在服务器，访问同一服务器的浏览器共享。AI 从下一回合备战起参考你的修改，结合已有棋子选择路线。</p>${g.id&&guideEditable?`<button class="btn" data-edit>${editing?'取消编辑':'自定义编辑'}</button>${!draft?'<button class="btn" data-delete>删除阵容</button>':''}`:''}<p data-message role="status"></p>${editing?`<form><label>方案名称<input name="title" maxlength="40" value="${esc(g.name)}" required></label><label>成型棋子（1–7 张，从左至右，用逗号或换行分隔，可重复）<textarea name="core" required>${esc(g.core.map(id=>byId.get(id)?.name).join('，'))}</textarea></label><label>过渡棋子（最多 12 张，用逗号或换行分隔）<textarea name="transition">${esc(g.transition.map(id=>byId.get(id)?.name).join('，'))}</textarea></label><label>运营说明<textarea name="note" maxlength="1200">${esc(g.note)}</textarea></label><details><summary>查看可填写的棋子名称</summary><p>${esc(pool.map(u=>u.name).join('、'))}</p></details><button class="btn primary" type="submit">保存并供 AI 参考</button><p class="guide-feedback" role="status"></p></form>`:''}`;
      dialog.querySelector('[data-close]').onclick=()=>dialog.close();
      dialog.querySelectorAll('[data-faction]').forEach(b=>b.onclick=()=>{selected=b.dataset.faction;selectedId=null;draft=null;editing=false;render()});
      dialog.querySelectorAll('[data-guide]').forEach(b=>b.onclick=()=>{selectedId=b.dataset.guide;draft=null;editing=false;render()});
      const addButton=dialog.querySelector('[data-add]');if(addButton)addButton.onclick=()=>{draft={id:'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),faction:selected,name:'新阵容',core:[],transition:[],note:''};editing=true;render();dialog.querySelector('input').focus()};
      const editButton=dialog.querySelector('[data-edit]');if(editButton)editButton.onclick=()=>{editing=!editing;if(!editing)draft=null;render()};
      const deleteButton=dialog.querySelector('[data-delete]');if(deleteButton)deleteButton.onclick=async()=>{
        if(!confirm('删除阵容“'+g.name+'”？此操作会同步到所有浏览器。'))return;
        deleteButton.disabled=true;
        try{
          const status=await api('/api/guides');
          if(typeof status.initialized!=='boolean')throw Error('当前服务器仍在运行不支持删除阵容的旧版本。请停止旧服务并重新运行 python server.py，然后刷新页面。');
          const remote=await api('/api/guides',{mode:'delete',id:g.id,revision:g.revision});sharedGuideCache=remote.guides;selectedId=null;editing=false;draft=null;render()}
        catch(e){deleteButton.disabled=false;dialog.querySelector('[data-message]').textContent=e.message}
      };
      const form=dialog.querySelector('form');if(form){
        form.onsubmit=async e=>{e.preventDefault();try{
          const named=new Map(pool.map(u=>[u.name,u.id]));
          const parse=(text,max,required)=>{const names=text.split(/[,，、\n]+/).map(n=>n.trim()).filter(Boolean);if(names.length>max||(required&&!names.length))throw Error('成型阵容需 1–7 张，过渡卡最多 12 张。');for(const n of names)if(!named.has(n))throw Error('找不到可获得的棋子：'+n);return names.map(n=>named.get(n))};
          const custom={id:g.id,revision:g.revision,faction:selected,name:form.elements.title.value.trim(),core:parse(form.elements.core.value,7,true),transition:parse(form.elements.transition.value,12,false),note:form.elements.note.value};
          if(!custom.name)throw Error('请填写打法名称。');await saveGuide(custom);selectedId=custom.id;draft=null;render();dialog.querySelector('.guide-feedback').textContent='已保存到服务器；其他浏览器重新打开即可看到，AI 下一回合开始参考。';
        }catch(err){form.querySelector('.guide-feedback').textContent=err.message}};

      }
    }
    render();document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
  }
  for(const host of [document.querySelector('.start-actions'),document.querySelector('.terminal-nav'),document.querySelector('.battle-tools')])if(host){const button=document.createElement('button');button.className='btn lineup-open';button.textContent='推荐阵容';button.onclick=()=>openLineupGuide().catch(e=>alert(e.message));host.append(button)}
  window.openLineupGuide=openLineupGuide;
  let commanderCatalog=[],commanderFilter='all';
  function commanderDescription(c){if(c.id==='russell'){const upgrades=c.command_upgrades||[];return '光环：所有友方棋子获得【血战：永久获得+'+(1+upgrades.filter(x=>x==='attack').length)+'/+'+(1+upgrades.filter(x=>x==='health').length)+'】（商店2/3/4/5级挑选强化技能）'}const name=c.skill?.name||'',text=c.skill?.description||'技能待配置';return name&&text.startsWith(name)?text.slice(name.length).replace(/^[：:\s]+/,''):text}
  const commanderInfo=c=>c?`<div class="commander-profile">${c.artwork?`<img src="${esc(c.artwork)}" alt="${esc(c.name)}全身照">`:''}<h3>${esc(c.name)}</h3>${c.skill?.icon?`<img src="${esc(c.skill.icon)}" alt="技能图标" style="width:64px;height:64px">`:''}<p>【${esc(c.skill?.name||'')}】</p><p>${esc(commanderDescription(c))}${c.id==='exusiai'?'<br>升级二选一（可重复叠加）：冲锋模式——基础伤害翻倍；扫射模式——额外发射2发铳弹。<br>当前：'+(1+2*(c.overload_upgrades||[]).filter(x=>x==='barrage').length)+'发，每发'+(3*2**(c.overload_upgrades||[]).filter(x=>x==='charge').length)+'基础伤害':''}</p><small>${c.skill?.active?(c.id==='fiammetta'?'0金币 · 获得苦难后可再次选择':`${Number(c.skill.cost||0)} 金币 · 每回合${Number(c.skill.limit||1)}次`):'被动技能'}</small></div>`:'';
  const commanderStyle=document.createElement('style');commanderStyle.textContent=`
    .commander-library .codex-body{max-width:1800px;display:grid;grid-template-columns:160px minmax(0,1fr);column-gap:32px}.commander-library #codexTabs{grid-column:1;grid-row:1/3;display:flex;flex-direction:column;align-self:start;position:sticky;top:110px;border-left:1px solid #719a81;border-bottom:0;padding:20px 0;gap:20px}.commander-library #codexTabs .btn{text-align:left;padding:18px 24px;background:transparent}.commander-library #codexTabs .active{border-left:3px solid #c5e735;background:linear-gradient(90deg,#426c5055,transparent);color:#eff5d9}.commander-library #codexFilters{grid-column:2;align-items:center}.commander-library #codexGrid{grid-column:2}.commander-library #closeCodex{margin-right:180px}@media(max-width:650px){.commander-library .codex-body{display:block}.commander-library #codexTabs{position:static;flex-direction:row;padding:0;gap:8px}.commander-library #codexTabs .btn{padding:10px}.commander-library #closeCodex{margin-right:0}}
    #codexGrid.commander-archive{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:40px 22px;padding:32px 12px;align-items:start}
    .commander-archive-card{position:relative;isolation:isolate;aspect-ratio: .66;border:0;background:none;color:#eef4e9;cursor:pointer;padding:0;transition:transform .2s;overflow:visible;font:inherit}
    .archive-frame{position:absolute;inset:8% 0 0;border:1px solid #b3a76b;border-radius:16px 16px 3px 3px;background:radial-gradient(ellipse at 50% 35%,#385c50,#13231e 75%);box-shadow:inset 0 0 25px #0008,0 8px 20px #0005;z-index:-1}
    .archive-art{position:absolute;inset:0;width:100%;height:89%;object-fit:contain;filter:drop-shadow(0 5px 8px #0008);transition:transform .2s}
    .archive-name{position:absolute;bottom:9%;left:0;right:0;padding:24px 4px 8px;background:linear-gradient(transparent,#08130fee);font-size:clamp(16px,1.5vw,24px);font-weight:700;letter-spacing:.08em;text-shadow:0 2px 4px #000}
    .archive-type{position:absolute;bottom:3%;left:4px;right:4px;color:#b9c9b8;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .archive-diamond{position:absolute;width:12px;height:12px;bottom:-6px;left:calc(50% - 6px);background:#b5d8b6;border:2px solid #9e9460;transform:rotate(45deg)}
    .commander-archive-card:hover,.commander-archive-card:focus-visible{transform:translateY(-6px);outline:0}.commander-archive-card:hover .archive-frame,.commander-archive-card:focus-visible .archive-frame{border-color:#e3e98c;box-shadow:0 0 24px #c5e73535}
    .archive-count{color:#9db6a6;letter-spacing:.1em;margin-right:auto}#commanderFilter{background:#10231c;color:#dbe9df;border:1px solid #517460;padding:10px 20px;font:inherit}
    .commander-archive-detail{width:min(850px,90vw);max-height:85vh;overflow:auto;color:#e5eee7;background:#101f19;border:1px solid #819878;padding:30px}.commander-archive-detail::backdrop{background:#020906dc;backdrop-filter:blur(7px)}.archive-close{position:absolute;top:10px;right:10px;z-index:2}.commander-archive-detail .commander-profile{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:center}.commander-archive-detail .commander-profile>img:first-child{grid-row:1/7;width:100%;height:480px}.commander-archive-detail h3{font-size:32px;margin:0}.commander-archive-detail p{line-height:1.8;margin:0}
    @media(max-width:1100px){#codexGrid.commander-archive{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:650px){#codexGrid.commander-archive{grid-template-columns:repeat(2,minmax(0,1fr));gap:30px 16px}.commander-archive-detail .commander-profile{display:block}.commander-archive-detail .commander-profile>img:first-child{height:260px}.commander-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}

    .commander-screen{min-height:100vh;padding:48px 5vw;box-sizing:border-box;background:radial-gradient(ellipse at 20% 40%,#173b32,#060d0b 70%);color:#e4eee7}.commander-screen.hidden{display:none}.commander-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin:32px 0}.commander-slot{position:relative;border:1px solid #426d5c;background:#13241d;padding:18px;text-align:center;min-width:0}.commander-slot.selected{border-color:#c5e735;box-shadow:0 0 18px #c5e73540}.commander-slot img{height:260px;width:100%;object-fit:contain}.commander-slot .commander-pick{display:block;width:100%;background:none;color:inherit;border:0;cursor:pointer;font:inherit}.commander-slot .commander-tip{display:none;position:absolute;bottom:70px;left:8px;right:8px;background:#07100ff5;border:1px solid #83b09e;padding:14px;z-index:3;text-align:left;white-space:pre-line}.commander-slot:hover .commander-tip,.commander-slot:focus-within .commander-tip{display:block}.commander-empty{height:260px;display:grid;place-items:center;border:1px dashed #496158;background:repeating-linear-gradient(135deg,#ffffff03 0 2px,transparent 2px 12px);color:#789387;font-size:20px;letter-spacing:.15em}#codexGrid>.commander-profile{grid-column:1/-1;width:min(800px,100%);display:grid;grid-template-columns:minmax(180px,380px) 1fr;gap:12px 24px;align-items:start;border:1px solid #426d5c;padding:24px;box-sizing:border-box;background:#13241d}#codexGrid>.commander-profile>img:first-child{grid-column:1;grid-row:1/6;width:100%;height:400px}#codexGrid>.commander-profile>h3{font-size:28px;margin:12px 0}#codexGrid>.commander-profile>p{line-height:1.8;margin:0}.commander-profile img{height:280px;max-width:100%;object-fit:contain}.arena-ring>span{overflow:hidden}.arena-ring img{width:100%;height:100%;object-fit:cover;border-radius:50%}#commanderHud{position:relative;margin-top:20px}#commanderHud>img{width:100%;max-height:260px;object-fit:contain}#commanderHud button{position:absolute;right:0;bottom:24px}#commanderHud small{display:block;text-align:right;color:#eacb67}.commander-cost svg{width:16px;height:16px;vertical-align:middle}.commander-wait .commander-slot{opacity:.5}.commander-wait .commander-slot.ready{opacity:1;border-color:#c5e735}
    @media(max-width:700px){.commander-grid{gap:6px}.commander-slot{padding:6px}.commander-slot img,.commander-empty{height:160px}.commander-slot h3{font-size:14px}}
  `;document.head.append(commanderStyle);
  const originalRenderCodex=renderCodex;
  function openCommanderArchive(c){
    const dialog=document.createElement('dialog');dialog.className='commander-archive-detail';
    dialog.innerHTML=`<button class="btn archive-close" aria-label="关闭棋手详情">×</button>${commanderInfo(c)}`;
    dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  }
  renderCodex=function(){
    originalRenderCodex();
    $('#codexTabs').insertAdjacentHTML('beforeend',`<button class="btn ${codexType==='commander'?'active':''}" data-codex-type="commander">棋手</button>`);
    $('#codexGrid').classList.toggle('commander-archive',codexType==='commander');$('#codexScene').classList.toggle('commander-library',codexType==='commander');
    if(codexType==='commander'){
      $('#codexFilters').innerHTML=`<span class="archive-count">棋手档案 / ${commanderCatalog.length}</span><select aria-label="筛选棋手技能" id="commanderFilter"><option value="all">全部棋手</option><option value="active">主动技能</option><option value="passive">被动技能</option></select>`;
      $('#commanderFilter').value=commanderFilter;$('#commanderFilter').onchange=e=>{commanderFilter=e.target.value;renderCodex()};
      const shown=commanderCatalog.filter(c=>commanderFilter==='all'||Boolean(c.skill?.active)===(commanderFilter==='active'));
      $('#codexGrid').innerHTML=shown.length?shown.map(c=>`<button class="commander-archive-card" data-commander="${esc(c.id)}" aria-label="查看${esc(c.name)}的技能"><span class="archive-frame"></span><img class="archive-art" src="${esc(c.artwork||c.portrait)}" alt="${esc(c.name)}" loading="lazy"><span class="archive-name">${esc(c.name)}</span><span class="archive-type">${c.skill?.active?'主动':'被动'} · 【${esc(c.skill?.name||'')}】</span><span class="archive-diamond"></span></button>`).join(''):'<div class="commander-empty">暂无棋手</div>';
      $('#codexGrid').querySelectorAll('[data-commander]').forEach(b=>b.onclick=()=>openCommanderArchive(shown.find(c=>c.id===b.dataset.commander)));
    }
  };
  api('/api/commanders').then(data=>{commanderCatalog=data.commanders||[];if(codexType==='commander')renderCodex()}).catch(()=>{});
  async function chooseCommander(){
    const panel=document.createElement('section');panel.className='commander-screen hidden';document.body.append(panel);
    let state=await api('/api/arena/commander',{action:'state'}),selected=-1,busy=false;
    try{
      await sceneTransition(()=>{$('#factionPreview').classList.add('hidden');panel.classList.remove('hidden')});
      await new Promise(resolve=>{
        function render(){
          panel.innerHTML=`<small>RHODES ISLAND / COMMANDER SELECTION</small><h1>选择你的棋手</h1><p>每栏可刷新一次；刷新掉及确认后未选的棋手返回共享候选池，本人不会重复抽到。</p><div class="commander-grid">${state.options.map((c,i)=>`<article class="commander-slot ${selected===i?'selected':''}"><button class="commander-pick" data-pick="${i}" aria-label="选择${esc(c.name)}">${c.artwork?`<img src="${esc(c.artwork)}" alt="${esc(c.name)}">`:'<div class="commander-empty">棋手</div>'}<h3>${esc(c.name)}</h3></button><div class="commander-tip">${esc(commanderDescription(c))}</div><button class="btn" data-refresh="${i}" ${state.refreshed[i]||busy?'disabled':''}>${state.refreshed[i]?'刷新已用尽':'刷新 1/1'}</button></article>`).join('')}</div><p role="alert" id="commanderError"></p><button class="btn primary" id="confirmCommander" ${selected<0||busy?'disabled':''}>确认棋手</button>`;
          panel.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{if(!busy){selected=Number(b.dataset.pick);render()}});
          panel.querySelectorAll('[data-refresh]').forEach(b=>b.onclick=()=>act('refresh',Number(b.dataset.refresh)));
          panel.querySelector('#confirmCommander').onclick=()=>act('confirm',selected);
        }
        async function act(action,slot){if(busy)return;busy=true;render();try{state=await api('/api/arena/commander',{action,slot});if(action==='confirm'){resolve();return}if(selected===slot)selected=-1}catch(e){busy=false;render();panel.querySelector('#commanderError').textContent=e.message;return}busy=false;render()}
        render();
      });
      while(true){
        panel.innerHTML=`<small>RHODES ISLAND / WAITING ROOM</small><h1>等待棋手就位</h1><div class="commander-grid commander-wait">${state.seats.map(p=>`<article class="commander-slot ${p.commander?'ready':''}">${p.commander?commanderInfo(p.commander):'<div class="commander-empty">◇<br>等待选择</div>'}<h3>${esc(p.name)}</h3><small>${p.commander?'已就位':'正在选择棋手'}</small></article>`).join('')}</div>`;
        if(state.ready)break;
        await pause(500);state=await api('/api/arena/commander',{action:'advance_ai'});
      }
      await pause(500);arena.lobby=await api('/api/arena/state');
    }finally{panel.remove()}
  }
  async function chooseCommanderUpgrade(){
    const c=arena.lobby?.seats.find(p=>p.number===0)?.commander;
    if(!['exusiai','russell','skadi_alter'].includes(c?.id))return;
    let state=await api('/api/arena/commander-upgrade',{});
    if(!state.pending)return;
    const wasBusy=s.busy;s.busy=true;
    const overlay=document.createElement('div');overlay.className='commander-screen discover-pop';overlay.style.cssText='position:fixed;inset:0;z-index:10000;display:grid;place-items:center;overflow:auto';document.body.append(overlay);
    try{while(state.pending){
      overlay.innerHTML=`<section><h1>过载模式 · 选择强化</h1><p>强化持续至本局结束，可以重复选择并叠加。待选次数：${state.pending}</p><button class="btn" data-choice="charge"><img src="assets/commanders/exusiai-s1.png" alt="冲锋模式技能图标" width="64" height="64"><h2>冲锋模式</h2><p>在本局游戏的剩余时间内，你的【过载模式】伤害翻倍</p></button><button class="btn" data-choice="barrage"><img src="assets/commanders/exusiai-s2.png" alt="扫射模式技能图标" width="64" height="64"><h2>扫射模式</h2><p>在本局游戏的剩余时间内，你的【过载模式】额外射出2发铳弹</p></button><p class="upgrade-error"></p></section>`;
      if(c.id==='russell')overlay.innerHTML=`<section><h1>统御号令 · 选择强化</h1><p>强化持续至本局结束，可重复叠加。待选次数：${state.pending}</p><button class="btn" data-choice="attack"><h2>【利兵】</h2><p>在本局游戏的剩余时间内，【统御号令】使棋子额外获得+1攻击力</p></button><button class="btn" data-choice="health"><h2>【坚甲】</h2><p>在本局游戏的剩余时间内，【统御号令】使棋子额外获得+1生命值</p></button><p class="upgrade-error"></p></section>`;
      if(c.id==='skadi_alter'){
        const stage=(c.seaborn_upgrades||[]).length,options=[[
          ['summon_growth','同归殊途之吟.X','当友方召唤棋子，自身永久获得+1/+1（金卡+2/+2）'],['logistics','同归殊途之吟.Y','后勤：自身获得+2/+2（金卡+4/+4）']],
          [['venom','同葬无光之愿.X','获得鸩毒'],['monsters','同葬无光之愿.Y','遗计：召唤2只不同的海怪（金卡4只）']],
          [['shield','“潮涌，潮枯”.X','获得护盾'],['revive','“潮涌，潮枯”.Y','获得复活']]][stage];
        overlay.innerHTML=`<section><h1>远古血亲 · 强化海嗣</h1>${options.map(([key,name,desc])=>`<button class="btn" data-choice="${key}"><img src="assets/commanders/skadi-alter-s${stage+1}.png" width="64" height="64"><h2>【${name}】</h2><p>你的【斯卡蒂的海嗣】${desc}</p></button>`).join('')}<p class="upgrade-error"></p></section>`;
      }
      state=await new Promise(resolve=>overlay.querySelectorAll('[data-choice]').forEach(b=>b.onclick=async()=>{
        overlay.querySelectorAll('button').forEach(x=>x.disabled=true);
        try{resolve(await api('/api/arena/commander-upgrade',{choice:b.dataset.choice}))}
        catch(e){overlay.querySelector('.upgrade-error').textContent=e.message;overlay.querySelectorAll('button').forEach(x=>x.disabled=false)}
      }));Object.assign(c,state.commander);currentCommander=state.commander;syncSeabornAura();
    }}finally{overlay.remove();s.busy=wasBusy;updateCommanderButton()}
  }
  async function useCannotSkill(){
    const result=await api('/api/arena/commander-skill',{target:{shop:cloneData(s.shop),hand_count:s.bench.filter(Boolean).length}});
    syncPlayer(result.player);currentCommander=result.commander;
    if(!botId)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    for(const i of result.indices)s.shop[i]=null;
    for(const card of result.cards)s.bench[handAppendSlot()]=cloneData(card);
    tryCombineTriples();log('秘境商人：花费'+result.spent+'金币，获得'+result.cards.length+'个棋子，技能费用重置为10。','good');draw();
  }
  async function useTinmanSkill(){
    const slot=emptyBench();if(slot<0)throw Error('备战区已满');
    const result=await api('/api/arena/commander-skill',{target:{shop:cloneData(s.shop),hand_count:s.bench.filter(Boolean).length}});
    syncPlayer(result.player);currentCommander=result.commander;
    if(!botId&&arena.lobby)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    s.shop[result.index]=null;s.bench[slot]=cloneData(result.card);
    log('锡人：获得'+result.card.name+'。','good');tryCombineTriples();draw();
  }
  async function useJessicaSkill(target){
    if(emptyBench()<0)throw Error('备战区已满');
    const index=s.shop.indexOf(target);
    let result=await api('/api/arena/commander-skill',{target:target?{zone:'shop',id:target.id}:null});
    syncPlayer(result.player);currentCommander=result.commander;
    if(!botId)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    if(result.removed&&index>=0)s.shop[index]=null;
    draw();
    if(result.options?.length){
      let chosen=null;while(!chosen)chosen=await chooseThree('集结指标 · 挑选同阵营棋子',result.options);
      result=await api('/api/arena/commander-skill',{choice:chosen.id});
      currentCommander=result.commander;if(!botId)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
      s.bench[handAppendSlot()]=cloneData(result.card);tryCombineTriples();log('集结指标：获得'+result.card.name+'。','good');draw();
    }
  }
  async function useYuSkill(){
    let result=await api('/api/arena/commander-skill',{});syncPlayer(result.player);
    currentCommander=result.commander;
    if(!botId&&arena.lobby)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    if(result.options?.length){
      let chosen=null;while(!chosen)chosen=await chooseThree('文火慢炖 · 挑选1个金色棋子',result.options);
      result=await api('/api/arena/commander-skill',{choice:chosen.id});
      currentCommander=result.commander;if(!botId&&arena.lobby)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
      const slot=emptyBench();if(slot>=0){s.bench[slot]=cloneData(result.card);tryCombineTriples();log('文火慢炖：获得金色'+result.card.name+'。','good')}else log('备战区已满，无法获得文火慢炖奖励。','bad');
    }else log('文火慢炖：累计使用 '+result.commander.isomorph_uses+' 次。','good');
  }
  window.tryCommanderSaleExchange=async function(zone,index,unit){
    const c=botId?currentCommander:arena.lobby?.seats.find(p=>p.number===0)?.commander;
    if(c?.id!=='shamare'||unit.golden||c.exchange_round===s.round||!s.shop.some(u=>u?.card_type==='unit'))return false;
    const result=await api('/api/arena/commander-skill',{target:{unit:cloneData(unit),shop:cloneData(s.shop)}});
    if(!result.exchanged)return false;
    currentCommander=result.commander;if(!botId)Object.assign(c,result.commander);
    s.shop[result.index]=result.offered;
    if(zone==='board'){const board=compact(s.board);board[index]=result.card;s.board=pad(board)}else {s.bench[index]=null;s.bench[handAppendSlot()]=result.card;}
    log('替身娃娃：'+unit.name+'与商店中的'+result.card.name+'交换。','good');tryCombineTriples();draw();return true;
  };
  function shuTargets(faction){
    return [...compact(s.board),...compact(s.shop)].filter(u=>u.card_type==='unit'&&(u.faction===faction||u.faction==='任意'||faction==='任意'));
  }
  async function useShuSkill(target){
    const result=await api('/api/arena/commander-skill',{target:target.id});
    currentCommander=result.commander;
    if(!botId&&arena.lobby)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    for(const unit of shuTargets(result.faction))applyClientBuff(unit,result.amount,result.amount,0,'commander');
    log('离离枯荣：'+result.faction+'阵营棋子获得 +'+result.amount+'/+'+result.amount+'。','good');
  }
  async function useWarfarinSkill(target){
    const board=compact(s.board),index=board.indexOf(target);if(index<0)throw Error('只能选择我方棋盘棋子');
    const result=await api('/api/arena/commander-skill',{target:{zone:'board',board:cloneData(board),index}});
    currentCommander=result.commander;
    if(!botId&&arena.lobby)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    result.board.forEach((unit,i)=>Object.assign(board[i],unit));syncPlayer(result.player);
    for(const event of result.events||[])if(event.type==='gain_card')applyEventLog(event);
    log('不稳定血浆：'+target.name+'触发后勤效果，随后获得 +1/+1。','good');
  }
  async function useHumusSkill(target){
    const board=compact(s.board),index=board.indexOf(target);
    if(index<0)throw Error('只能选择我方棋盘棋子');
    const result=await api('/api/arena/commander-skill',{target:{zone:'board',board,index}});
    currentCommander=result.commander;
    if(!botId&&arena.lobby)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    board.splice(index,1);s.board=pad(board);syncPlayer(result.player);
    log('回收利用：移除'+target.name+'，获得3金币。','good');
  }
  async function useQuintusSkill(target){
    const zone=s.board.includes(target)?'board':s.shop.includes(target)?'shop':null;
    if(!zone)throw Error('只能选择棋盘或商店棋子');
    const index=s[zone].indexOf(target),name=target.name;
    const result=await api('/api/arena/commander-skill',{target:{zone,id:target.id}});
    currentCommander=result.commander;
    if(!botId&&arena.lobby)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    s[zone][index]=cloneData(result.card);
    log('不稳定要素：'+name+'变形为'+result.card.name+'，原有增益已清除。','good');
    tryCombineTriples();
  }
  async function useKaltsitSkill(target){
    if(!s.board.includes(target))throw Error('只能选择我方棋盘棋子');
    const result=await api('/api/arena/commander-skill',{target:{zone:'board',id:target.id}});
    currentCommander=result.commander;
    if(!botId&&arena.lobby)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    if(target._kaltsit_original_faction===undefined)target._kaltsit_original_faction=target.faction;
    target._kaltsit_expires=Number(s.round)+1;target.faction='任意';
    applyClientBuff(target,result.amount,result.amount,0,'commander');
    log('指令：熔毁：'+target.name+'本回合变为任意阵营，永久获得 +'+result.amount+'/+'+result.amount+'。','good');
  }
  async function useQalaisaSkill(target){
    const zone=s.board.includes(target)?'board':s.shop.includes(target)?'shop':null;
    if(!zone)throw Error('请选择棋盘或商店棋子');
    const result=await api('/api/arena/commander-skill',{target:{zone,id:target.id}});
    currentCommander=result.commander;
    if(!botId&&arena.lobby)arena.lobby.seats.find(p=>p.number===0).commander=result.commander;
    applyClientBuff(target,result.amount,result.amount,0,'commander');
    log('食腐之蝶：'+target.name+'获得 +'+result.amount+'/+'+result.amount+'。','good');
  }
  async function chooseShuTarget(boardOnly=false,quintus=false,qalaisa=false,kaltsit=false,jessica=false,humus=false){
    if(s.deployTarget||s.deployTargetResolving)return;
    if(!compact(s.board).length&&(boardOnly||!compact(s.shop).length)){log('没有可选棋子，请先部署棋子。','bad');return}
    const wasBusy=s.busy;s.busy=true;draw();
    const notice=document.createElement('div');notice.className='delivery-target-notice';
    notice.innerHTML='<strong>离离枯荣 · 点击棋盘或商店中的高亮棋子</strong><p>使棋盘和商店中同阵营的棋子获得属性增益。</p><button class="btn">取消</button>';
    if(boardOnly){notice.querySelector('strong').textContent='不稳定血浆 · 点击我方棋盘上的高亮棋子';notice.querySelector('p').textContent='触发所选棋子的后勤效果，随后使其获得 +1/+1。'}
    if(quintus){notice.querySelector('strong').textContent='不稳定要素 · 点击棋盘或商店中的高亮棋子';notice.querySelector('p').textContent='变为高一星的随机普通棋子，失去原有增益。六星棋子不可选择。'}
    if(qalaisa){notice.querySelector('strong').textContent='食腐之蝶 · 点击棋盘或商店中的高亮棋子';notice.querySelector('p').textContent='使所选棋子获得属性增益。'}
    if(kaltsit){notice.querySelector('strong').textContent='指令：熔毁 · 点击我方棋盘上的高亮棋子';notice.querySelector('p').textContent='本回合变为任意阵营，并永久获得属性增益。'}
    if(jessica){notice.querySelector('strong').textContent='集结指标 · 点击商店中的高亮棋子';notice.querySelector('p').textContent='消耗2金币，移除目标并挑选同阵营的其他棋子。'}
    if(humus){notice.querySelector('strong').textContent='回收利用 · 点击我方棋盘上的高亮棋子';notice.querySelector('p').textContent='将目标移除并获得3金币；不触发售出或遗计。'}
    document.body.append(notice);
    const selector=jessica?'#shop .unit-card':boardOnly?'#board .unit-card':'#board .unit-card,#shop .unit-card';
    const elements=[...document.querySelectorAll(selector)].filter(el=>!quintus||unitRarity((el.closest('#shop')?s.shop:s.board)[Number(el.dataset.slot)-1])<6);
    elements.forEach(el=>el.classList.add('delivery-selectable'));
    let onClick,onKey;
    try{await new Promise(resolve=>{
      let saving=false;const cancel=()=>{if(!saving)resolve()};notice.querySelector('button').onclick=cancel;
      onKey=e=>{if(e.key==='Escape')cancel()};window.addEventListener('keydown',onKey,true);
      onClick=async e=>{
        const el=e.target.closest(selector);if(!el||!elements.includes(el))return;
        e.preventDefault();e.stopImmediatePropagation();if(saving)return;
        const target=(el.closest('#shop')?s.shop:s.board)[Number(el.dataset.slot)-1];if(!target)return;
        saving=true;try{await (humus?useHumusSkill(target):jessica?useJessicaSkill(target):kaltsit?useKaltsitSkill(target):qalaisa?useQalaisaSkill(target):quintus?useQuintusSkill(target):boardOnly?useWarfarinSkill(target):useShuSkill(target));resolve()}catch(error){notice.querySelector('p').textContent=error.message;saving=false}
      };window.addEventListener('click',onClick,true);
    })}finally{
      window.removeEventListener('click',onClick,true);window.removeEventListener('keydown',onKey,true);
      elements.forEach(el=>el.classList.remove('delivery-selectable'));notice.remove();s.busy=wasBusy;draw();
    }
  }
  async function chooseDeliveryTarget(){
    if(!compact(s.board).length){log('请先将棋子放上棋盘，再选择投递目标。','bad');return}
    if(s.deployTarget||s.deployTargetResolving)return;
    const wasBusy=s.busy;s.busy=true;draw();
    const notice=document.createElement('div');notice.className='delivery-target-notice';notice.innerHTML='<strong>使命必达！ · 点击一个高亮的友方棋子</strong><p>先手装入投递坐标，触发遗计；有空位时返回原位置并永久 +1/+1。</p><button class="btn">取消</button>';document.body.append(notice);
    const elements=[...document.querySelectorAll('#board .unit-card')];elements.forEach(e=>e.classList.add('delivery-selectable'));
    let onClick,onKey;
    try{await new Promise(resolve=>{
      let saving=false;
      const cancel=()=>{if(!saving)resolve()};notice.querySelector('button').onclick=cancel;
      onKey=e=>{if(e.key==='Escape')cancel()};window.addEventListener('keydown',onKey,true);
      onClick=async e=>{
        const el=e.target.closest('#board .unit-card');if(!el)return;e.preventDefault();e.stopImmediatePropagation();if(saving)return;
        const unit=s.board[Number(el.dataset.slot)-1];if(!unit)return;
        saving=true;unit.delivery_target_key='delivery-'+crypto.randomUUID();
        try{const result=await api('/api/arena/commander-skill',{target:unit.delivery_target_key});Object.assign(arena.lobby.seats.find(p=>p.number===0).commander,result.commander);log('使命必达！：已选择 '+unit.name+'，本回合先手时投递。','good');resolve()}
        catch(error){notice.querySelector('p').textContent=error.message;saving=false}
      };window.addEventListener('click',onClick,true);
    })}finally{window.removeEventListener('click',onClick,true);window.removeEventListener('keydown',onKey,true);elements.forEach(e=>e.classList.remove('delivery-selectable'));notice.remove();s.busy=wasBusy;draw()}
  }
  function paintLobby(){
    const bar=document.getElementById('arenaSeats');if(!bar||!arena.lobby)return;
    bar.innerHTML=arena.lobby.seats.map(p=>`<button class="arena-seat ${p.number===0?'is-self':''} ${p.health<=0?'eliminated':''}" data-seat="${p.number}" title="${esc(p.name)} · ${p.health} 生命 · 查看上回合阵容" aria-label="${esc(p.name)}，生命${p.health}，查看上回合阵容"><span class="arena-ring" style="--health:${Math.max(0,Math.min(100,p.health*2))}%"><span>${esc(p.number===0?Array.from(p.name)[0]:String(p.number))}</span></span><small>${p.health<=0?'#'+p.rank:p.health}</small></button>`).join('');
    const next=arena.lobby.seats.find(p=>p.number===0)?.opponent_id;
    for(const p of arena.lobby.seats)if(p.commander?.portrait){const face=bar.querySelector(`[data-seat="${p.number}"] .arena-ring>span`);face.innerHTML=`<img src="${esc(p.commander.portrait)}" alt="${esc(p.commander.name)}" style="${p.commander.id==='humus'?'transform:scale(7);transform-origin:49% 38%':p.commander.id==='skadi_alter'?'transform:scale(8);transform-origin:48% 42%':p.commander.id==='cannot'?'transform:scale(5);transform-origin:40% 1%':p.commander.id==='russell'?'transform:scale(6);transform-origin:49% 18%':p.commander.id==='justin'?'transform:scale(5);transform-origin:55% 1%':p.commander.id==='necrass'?'transform:scale(8);transform-origin:48% 42%':p.commander.id==='jessica'?'transform:scale(6);transform-origin:41% 46%':p.commander.id==='yu'?'transform:scale(7);transform-origin:54% 35%':p.commander.id==='tinman'?'transform:scale(7);transform-origin:48% 37%':p.commander.id==='goliath'?'transform:scale(5);transform-origin:51% 12%':p.commander.id==='damazti'?'transform:scale(5);transform-origin:51% 10%':p.commander.id==='muelsyse'?'transform:scale(8);transform-origin:66% 37%':p.commander.id==='shamare'?'transform:scale(7);transform-origin:53% 34%':p.commander.id==='kaltsit'?'transform:scale(8);transform-origin:55% 60%':p.commander.id==='qalaisa'?'transform:scale(6);transform-origin:49% 22%':p.commander.id==='ermengard'?'transform:scale(6);transform-origin:54% 17%':p.commander.id==='mlynar'?'transform:scale(7);transform-origin:49% 34%':p.commander.id==='clementia'?'transform:scale(7);transform-origin:51% 30%':p.commander.id==='dobermann'?'transform:scale(5);transform-origin:55% 8%':p.commander.id==='quintus'?'transform:scale(1.2);transform-origin:50% 25%':p.commander.id==='chen'?'transform:scale(7);transform-origin:47% 39%':p.commander.id==='harold'?'transform:scale(6);transform-origin:50% 18%':p.commander.id==='lee'?'transform:scale(6);transform-origin:65% 23%':p.commander.id==='emperor'?'transform:scale(3);transform-origin:50% 13%':p.commander.id==='orchid'?'transform:scale(5);transform-origin:44% 6%':p.commander.id==='confessor'?'transform:scale(7);transform-origin:48% 40%':p.commander.id==='silverash_reignfrost'?'transform:scale(8);transform-origin:48% 33%':p.commander.id==='typhon'?'transform:scale(4);transform-origin:52% 24%':p.commander.id==='lemuen'?'transform:scale(5);transform-origin:50% 42%':p.commander.id==='exusiai'?'transform:scale(5);transform-origin:50% 12.5%':p.commander.id==='fiammetta'?'transform:scale(6);transform-origin:53% 36%':p.commander.id==='fiammetta'?'transform:scale(6);transform-origin:49% 34%':p.commander.id==='warfarin'?'transform:scale(5);transform-origin:53% 23%':p.commander.id==='shu'?'transform:scale(6);transform-origin:52% 41%':p.commander.id==='du_yaoye'?'transform:scale(5);transform-origin:51% 12%':p.commander.id==='closure'?'transform:scale(6);transform-origin:53% 43%':p.commander.id==='paganini'?'transform:scale(3);transform-origin:60% 4%':''}">`}
    const commander=arena.lobby.seats.find(p=>p.number===0)?.commander;
    if(commander&&!document.getElementById('commanderHud')){
      const hud=document.createElement('div');hud.id='commanderHud';
      hud.innerHTML=`${commander.artwork?`<img src="${esc(commander.artwork)}" alt="${esc(commander.name)}">`:''}<button class="btn" disabled title="${esc(commander.skill?.description||'技能待配置')}">${esc(commander.skill?.name||'被动技能')}</button><small class="commander-cost">${commander.skill?.active?`(<svg viewBox="0 0 20 20" aria-label="金币"><circle cx="10" cy="10" r="8" fill="#eacb67"/><path d="M10 5v10M7 7h6M7 13h6" stroke="#80601c"/></svg> ${Number(commander.skill.cost||0)})`:'被动'}</small>`;
      document.querySelector('.battle-tools').append(hud);
      const button=hud.querySelector('button');
      if(commander.skill?.icon)button.insertAdjacentHTML('afterbegin',`<img src="${esc(commander.skill.icon)}" alt="" style="width:48px;height:48px;display:block;margin:auto">`);
      button.onclick=async()=>{
        if(button.disabled)return;button.disabled=true;
        try{if(commander.id==='humus'){await chooseShuTarget(true,false,false,false,false,true);return}if(commander.id==='cannot'){await useCannotSkill();return}if(commander.id==='jessica'){if(commander.rally_options?.length)await useJessicaSkill();else await chooseShuTarget(false,false,false,false,true);return}if(commander.id==='tinman'){await useTinmanSkill();return}if(commander.id==='yu'){await useYuSkill();return}if(commander.id==='kaltsit'){await chooseShuTarget(true,false,false,true);return}if(commander.id==='qalaisa'){await chooseShuTarget(false,false,true);return}if(commander.id==='quintus'){await chooseShuTarget(false,true);return}if(commander.id==='confessor'){await chooseExaminerMode();return}if(commander.id==='warfarin'){await chooseShuTarget(true);return}if(commander.id==='shu'){await chooseShuTarget();return}if(commander.id==='fiammetta'){await chooseCommanderBlessing();return}if(commander.id==='exusiai_alter'){await chooseDeliveryTarget();return}const result=await api('/api/arena/commander-skill',{});Object.assign(arena.lobby.seats.find(p=>p.number===0).commander,result.commander);log(result.commander.id==='closure'?'极限调度已生效，经济资助将在下回合回营时发放。':result.commander.skill.name+'已准备，将在本回合先手阶段触发。','good')}
        catch(e){log(e.message,'bad')}finally{updateCommanderButton()}
      };
    }
    updateCommanderButton();
    for(const p of arena.lobby.seats){const b=bar.querySelector(`[data-seat="${p.number}"]`);b.classList.toggle('next-opponent',p.id===next&&!arena.lobby.finished);if(p.id===next)b.title+=' · 下回合对手'}
  }
  function updateCommanderButton(){
    const button=document.querySelector('#commanderHud button'),c=arena.lobby?.seats.find(p=>p.number===0)?.commander;if(!button||!c)return;
    button.disabled=!c.skill?.active||s.phase!=='备战'||s.busy||c.skill_used_round===s.round||!!c.blessing_pending;
    if(c.id==='cannot'){const cost=Math.max(0,10-Number(c.merchant_discount||0)),count=s.shop.filter(u=>u?.card_type==='unit').length;button.disabled=button.disabled||s.gold<cost||!count||s.bench.filter(Boolean).length+count>12;button.title=c.skill.description+'\n当前费用：'+cost+'金币；使用后重置为10金币';const label=document.querySelector('#commanderHud .commander-cost');if(label)label.innerHTML='(<span aria-label="金币">🪙</span> '+cost+')';return}
    if(c.id==='russell'){button.title=commanderDescription(c);return}
    if(c.id==='tinman'){button.disabled=button.disabled||s.gold<1||emptyBench()<0||!s.shop.some(u=>u?.card_type==='unit');button.innerHTML=`<img src="${esc(c.skill.icon)}" style="width:48px;height:48px;display:block;margin:auto">${esc(c.skill.name)}`;button.title=c.skill.description+(c.tinman_upgraded?'':'\n升级进度 '+Number(c.tinman_uses||0)+'/9');return}
    if(c.id==='necrass'){button.innerHTML=`<img src="${esc(c.skill.icon)}" style="width:48px;height:48px;display:block;margin:auto">${esc(c.skill.name)}`;button.title=c.skill.description+'\n当前光环：+'+s.shopLevel+'攻击力'+(c.necrass_awakened?'':'；距离激活还需 '+Math.max(0,10-(Number(s.round)-1)-Number(c.necrass_acceleration||0))+' 回合');return}
    if(c.id==='goliath'){button.innerHTML=`<img src="${esc(c.skill.icon)}" style="width:48px;height:48px;display:block;margin:auto">${esc(c.skill.name)}`;button.title=c.skill.description+(c.chen_activated?'':'\n当前回合增益：+'+(Number(s.round)*4)+'/+'+(Number(s.round)*4));return}
    if(c.id==='confessor'){
      const spent=Number(s.totalGoldSpent||0),selected=c.skill_used_round===s.round;
      const option=examinerOptions(spent).find(o=>o.mode===c.examiner_mode);
      button.innerHTML=`<img src="assets/commanders/${selected?option.icon:'confessor-s1.png'}" style="width:48px;height:48px;display:block;margin:auto;${selected&&option.mirror?'transform:scaleX(-1)':''}">${selected?option.name:c.skill.name}<br>${3+2*Math.floor(spent/8)}点伤害`;
      button.title=c.skill.description+'\n累计消耗 '+spent+' 金币；下次提升进度 '+(spent%8)+'/8'+(selected?'\n'+option.description:'\n本回合可选择左侧、中间或右侧');return;
    }
    if(c.id==='dobermann'){button.title=c.skill.description+'\n当前光环：+'+(Number(s.round||1)+Number(c.victories||0))+'攻击力；累计胜利 '+Number(c.victories||0)+' 次';return}
    if(c.id==='jessica'){button.disabled=s.phase!=='备战'||s.busy||s.shopLevel<2||emptyBench()<0||(!c.rally_options?.length&&(c.skill_used_round===s.round||s.gold<2||!s.shop.some(u=>u?.card_type==='unit')));button.title=c.skill.description+(s.shopLevel<2?'\n商店2级解锁':'');return}
    if(c.id==='yu'){button.disabled=s.phase!=='备战'||s.busy||(!c.isomorph_options?.length&&(c.skill_used_round===s.round||s.gold<1));button.title=c.skill.description+'\n累计使用 '+Number(c.isomorph_uses||0)+' 次；进度 '+Number(c.isomorph_uses||0)%4+'/4';return}
    if(c.id==='kaltsit'){const spent=Number(s.totalGoldSpent||0),amount=1+Math.floor(spent/7);button.title=c.skill.description+'\n当前增益 +'+amount+'/+'+amount+'；下次强化 '+spent%7+'/7金币';return}
    if(c.id==='qalaisa'){const deaths=Number(c.death_count||0),amount=Number(s.shopLevel||1)+Math.floor(deaths/7);button.title=c.skill.description+'\n当前增益 +'+amount+'/+'+amount+'；阵亡累计 '+deaths+'（下次强化 '+deaths%7+'/7）';return}
    if(c.id==='warfarin'){button.title=c.skill.description+'\n仅限我方棋盘；0金币，每回合一次';return}
    if(c.id==='shu'){
      const count=Number(s.purchasedUnits||0),amount=1+Math.floor(count/4);
      button.title=c.skill.description+'\n已购买 '+count+' 个棋子；当前增益 +'+amount+'/+'+amount+'；0金币，每回合一次';return;
    }
    if(c.id==='paganini'){
      const progress=Math.min(55,Number(s.totalGoldSpent||0));
      button.innerHTML=`<img src="${esc(c.skill.icon)}" alt="" style="width:48px;height:48px;display:block;margin:auto">定制铳械<br><strong>${progress}/55</strong>`;
      button.title=c.skill.description+'\n'+progress+'/55'+(c.workshop_claimed?'（奖励已领取）':'');return;
    }
    if(c.id==='closure'){
      button.innerHTML=`<img src="${esc(c.skill.icon)}" alt="" style="width:48px;height:48px;display:block;margin:auto">${esc(c.skill.name)}`;
      button.title=c.skill.description+'\n0金币，每回合一次'+(c.dispatch_upgraded?'':'；升级进度：'+Number(c.dispatch_uses||0)+'/6');return;
    }
    if(c.id==='fiammetta'){button.title=c.skill.description+'\n0金币；'+(c.blessing_pending?'等待'+sufferingName(c.blessing_pending.kind)+'，第'+c.blessing_pending.due+'回合回营时领取':'可选择苦难');return}
    if(c.id==='exusiai_alter'){button.title=c.skill.description+'\n0金币，每回合一次'+(c.skill_used_round===s.round?'（本回合已选择投递目标）':'');return}
    if(!c.skill?.active){button.title=(c.skill?.description||'')+'\n被动技能'+(c.id==='lemuen'?'；商店提供铳弹强度：'+Math.max(0,s.shopLevel-1):'');return}
    if(c.id==='exusiai'){const u=c.overload_upgrades||[];button.title=c.skill.description+'\n当前：'+(1+2*u.filter(x=>x==='barrage').length)+'发，每发'+(3*2**u.filter(x=>x==='charge').length)+'基础伤害；0金币，每回合一次'+(c.skill_used_round===s.round?'（本回合已使用）':'');return}
    button.title=(c.skill?.description||'')+'\n当前基础伤害：'+s.shopLevel+'；0金币，每回合一次'+(c.skill_used_round===s.round?'（本回合已使用）':'');
  }
  const upgradeQueues=new Map();
  async function showUpgrade(id,level){
    const seat=arena.lobby?.seats.find(p=>p.id===id);if(!seat)return;
    seat.shop_level=level;updateInspector();
    const prior=upgradeQueues.get(id)||Promise.resolve();
    const task=prior.then(async()=>{
      const button=document.querySelector(`#arenaSeats [data-seat="${seat.number}"]`);if(!button)return;
      const starsCount=Math.max(1,Math.min(6,Number(level)||1));
      const stars=document.createElement('span');stars.className='arena-upgrade-stars';stars.setAttribute('aria-label','商店升级至 '+level+' 级');
      stars.innerHTML='<i>★</i>'.repeat(starsCount);button.append(stars);await pause(500);stars.remove();
    });upgradeQueues.set(id,task);await task;if(upgradeQueues.get(id)===task)upgradeQueues.delete(id);
  }
  function updateInspector(){const dialog=document.getElementById('arenaInspect');if(!dialog)return;const seat=arena.lobby?.seats.find(p=>p.number===Number(dialog.dataset.seat));const label=dialog.querySelector('.arena-shop-level');if(seat&&label)label.textContent='商店等级 Lv.'+seat.shop_level}
  window.addEventListener('arena-shop-upgraded',e=>showUpgrade(e.detail.id,e.detail.level));
  let pollingLobby=false;
  setInterval(async()=>{
    if(pollingLobby||!arena.lobby||arena.lobby.finished||s.phase!=='备战'||s.busy)return;
    pollingLobby=true;const round=arena.lobby.round;
    try{const fresh=await api('/api/arena/state');if(s.phase!=='备战'||s.busy||fresh.round!==round)return;
      for(const p of fresh.seats){const old=arena.lobby.seats.find(x=>x.id===p.id);if(old&&p.shop_level>old.shop_level)showUpgrade(p.id,p.shop_level);if(old)old.shop_level=p.shop_level}updateInspector();
    }catch(e){console.warn('商店等级同步失败',e.message)}finally{pollingLobby=false}
  },1000);
  function reportError(message){
    let notice=document.getElementById('arenaError');
    if(!notice){notice=document.createElement('p');notice.id='arenaError';notice.setAttribute('role','alert');notice.style.color='#ffb6a7';document.getElementById('arenaSeats').after(notice)}
    notice.textContent=message;log(message,'bad');
  }
  function formation(units){return compact(units).map(u=>`<div class="victory-unit ${u.golden?'golden':''}">${resultPortrait(u)}<b>${esc(u.name)}${u.golden?' ★':''}</b><span>攻击 ${Number(u.attack||0)} · 生命 ${Number(u.max_hp||0)}</span></div>`).join('')||'<p>暂无阵容</p>'}
  function inspectSeat(number){
    const p=arena.lobby?.seats.find(x=>x.number===number);if(!p)return;
    document.getElementById('arenaInspect')?.remove();const dialog=document.createElement('dialog');dialog.id='arenaInspect';dialog.className='arena-inspect';
    dialog.innerHTML=`<h2>${esc(p.name)} · ${p.health} 生命</h2><p>${p.snapshot_round?'第 '+p.snapshot_round+' 回合结束时的阵容':'首回合尚未结束，暂无公开阵容'} · 备战变化不可见</p><div class="victory-units">${formation(p.snapshot)}</div><button class="btn">返回</button>`;
    dialog.dataset.seat=number;dialog.querySelector('h2').insertAdjacentHTML('afterend',`<p class="arena-shop-level">商店等级 Lv.${p.shop_level||1}</p>`);
    if(p.commander)dialog.querySelector('h2').insertAdjacentHTML('afterend',commanderInfo(p.commander));
    dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  }
  function results(){
    clearInterval(s.timer);s.phase='对局结束';s.busy=true;s.skipBattleAvailable=false;
    const self=arena.lobby.seats.find(p=>p.number===0),overlay=$('#victoryOverlay');
    overlay.classList.toggle('defeat',self.rank!==1);
    overlay.innerHTML=`<div class="victory-box arena-results"><div class="victory-title">${self.rank===1?'VICTORY':'FINISH #'+self.rank}</div><p>八人对局排名${self.rank!==1?' · 未淘汰玩家按剩余生命排列':''}</p>${arena.lobby.seats.map(p=>`<section class="arena-result-row"><h2>#${p.rank} ${esc(p.name)} <small>${p.health} 生命</small></h2><div class="victory-units">${formation(p.snapshot)}</div></section>`).join('')}<button class="btn primary" onclick="location.reload()">新游戏</button></div>`;
    overlay.classList.remove('hidden');draw();
  }
  function createAgent(seat){return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');frame.hidden=true;frame.dataset.arenaAgent=seat.id;frame.setAttribute('aria-hidden','true');frame.title='AI '+seat.number;frame.src='/index.html?arena-agent='+encodeURIComponent(seat.id);
    const timeout=setTimeout(()=>{frame.remove();reject(Error('AI '+seat.number+' 初始化超时'))},30000);
    frame.onload=async()=>{try{const agent=frame.contentWindow.arenaAgent;if(!agent)throw Error('AI经营模块未加载');await agent.init(seat);clearTimeout(timeout);resolve({seat,agent,frame})}catch(e){clearTimeout(timeout);frame.remove();reject(e)}};
    document.body.append(frame);
  })}
  async function pulse(){
    if(!arena.running)return;
    try{await Promise.all(arena.agents.filter(x=>x.seat.health>0).map(x=>x.agent.step()))}
    catch(e){arena.error=e;arena.running=false;reportError('AI经营失败：'+e.message+'。可重试结束备战。')}
    if(arena.running)arena.task=pause(350).then(pulse);
  }
  function runAgents(){arena.error=null;arena.running=true;arena.task=pulse()}
  async function finishAgents(){arena.running=false;await arena.task;if(arena.error){const e=arena.error;arena.error=null;throw e}
    // An early click gives all seats their normal shopping opportunity.
    for(let n=0;n<110;n++){const active=await Promise.all(arena.agents.filter(x=>x.seat.health>0).map(x=>x.agent.step()));if(!active.some(Boolean))break}
    await Promise.all(arena.agents.filter(x=>x.seat.health>0).map(x=>x.agent.submit()));
  }
  // Difficulty card layout adapted from Stronghold-Protocol public/css/screens/lobby.css
  // (sganggs and contributors, GPL-3.0-or-later; see docs/stronghold-LICENSE.txt).
  async function selectDifficulty(){
    let panel=document.getElementById('difficultySelect');
    if(!panel){
      panel=document.createElement('section');panel.id='difficultySelect';panel.className='hidden';
      panel.innerHTML=`<style>
        #difficultySelect{min-height:100vh;box-sizing:border-box;padding:90px 28px 36px;position:relative;background:radial-gradient(ellipse at 20% 40%,#173b32,#060d0b 70%);display:grid;place-items:center}
        #difficultySelect.hidden{display:none}.difficulty-content{width:min(900px,100%)}.difficulty-content>small{color:#7d9e90;letter-spacing:.18em;font:11px monospace}.difficulty-content h1{font-size:42px;color:#f0f5e9;margin:14px 0}.difficulty-content>p{color:#a9bbae}
        #difficultySelect .diff-list{display:flex;flex-direction:column;gap:14px;margin-top:26px}
        #difficultySelect .diff-card{--d-color:#c5e735;position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;gap:6px 20px;padding:18px 24px 18px 36px;overflow:hidden;text-align:left;background:linear-gradient(90deg,rgba(28,34,31,.93),rgba(15,19,17,.93));border:1px solid #355345;color:#e8eee8;transition:border-color .2s,box-shadow .2s,background .2s;font:inherit;cursor:pointer}
        #difficultySelect .diff-card__bar{position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--d-color);opacity:.45}
        #difficultySelect .diff-card__head{display:flex;align-items:center;gap:16px}.diff-card__name{font-size:25px;font-weight:900;letter-spacing:.06em;color:var(--d-color)}.diff-card__code{font:12px monospace;color:#82968a}.diff-card__desc{grid-column:1;color:#a9bbae;font-size:14px}.diff-card__check{grid-column:2;grid-row:1/3;align-self:center;color:var(--d-color)}
        #difficultySelect .diff-card:not(:disabled):hover,#difficultySelect .diff-card:not(:disabled):focus-visible{border-color:var(--d-color);background:linear-gradient(90deg,#28321c,#0f1311 70%);box-shadow:0 0 30px #c5e73526;outline:2px solid #c5e735}
        #difficultySelect .diff-card:disabled{cursor:not-allowed;opacity:.5}.diff-card__check svg{width:20px;height:20px;vertical-align:middle;margin-right:8px}
        @media(max-width:600px){#difficultySelect{padding:90px 16px 24px}.difficulty-content h1{font-size:30px}#difficultySelect .diff-card{padding:18px}.diff-card__head{flex-wrap:wrap}.diff-card__name{font-size:22px}.diff-card__code{display:none}}
      </style><button class="brief-exit" id="exitDifficulty">← 返回开始界面</button><div class="difficulty-content"><small>RHODES ISLAND / SIMULATION SELECT</small><h1>选择模拟难度</h1><p>选择本次行动的模拟等级</p><div class="diff-list">${['标准模拟','险境模拟','绝境模拟','终极模拟'].map((name,i)=>`<button class="diff-card" ${i>1?'disabled aria-disabled="true"':`data-difficulty="${i?'peril':'standard'}"`} style="--d-color:${['#c5e735','#e4ae56','#eb775f','#cd637c'][i]}"><span class="diff-card__bar"></span><span class="diff-card__head"><span class="diff-card__name">${name}</span><span class="diff-card__code">SIMULATION / 0${i+1}</span></span><span class="diff-card__desc">${i>1?'尚未开放 · 敬请期待':i?'选择专属棋手 · 运用技能构筑阵容':'标准游戏体验·适合新手熟悉规则'}</span><span class="diff-card__check">${i>1?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>已锁定':'进入 →'}</span></button>`).join('')}</div></div>`;
      document.body.append(panel);
    }
    const selection=new Promise(resolve=>{panel.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>resolve(b.dataset.difficulty));panel.querySelector('#exitDifficulty').onclick=()=>resolve(false)});
    await sceneTransition(()=>{$('#startScreen').classList.add('hidden');panel.classList.remove('hidden')});
    const selected=await selection;
    if(!selected)await sceneTransition(()=>{panel.classList.add('hidden');$('#startScreen').classList.remove('hidden')});
    return selected;
  }
  async function confirmFactions(){
    const roster=await api('/api/arena/preview',{});
    let panel=document.getElementById('factionPreview');
    if(!panel){panel=document.createElement('section');panel.id='factionPreview';panel.className='hidden';document.body.append(panel)}
    const chips=(items,disabled=false)=>items.map(f=>`<span class="faction-chip ${disabled?'unavailable':''}" style="--faction:${FACTION_COLORS[f]||'#aacac0'}">${esc(f)}</span>`).join('');
    panel.innerHTML=`<button class="brief-exit" id="exitFactions" aria-label="退出本局游戏" title="退出本局游戏"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M14 3H4v18h10M13 12h9m-4-4 4 4-4 4"/><circle cx="10" cy="7" r="2" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2" d="m8 10 4 2-2 4-3 3m3-3 4 3M8 10l-2 4"/></svg><span>退出本局</span></button><div class="faction-brief"><small>RHODES ISLAND / OPERATION BRIEFING</small><h1>参战阵容</h1><p class="brief-subtitle">本次行动的阵营已确定</p><div class="faction-row"><strong>本局参战：</strong><div>${chips(roster.active_factions)}</div></div><div class="faction-row"><strong>本局禁用：</strong><div>${chips(roster.banned_factions,true)||'无'}</div></div><p class="brief-note">任意阵营棋子始终可用。所有玩家共享本局参战卡池。</p><button class="btn primary" id="confirmFactions">确认 · 进入酒馆 <span>→</span></button></div>`;
    const confirmation=new Promise(resolve=>{panel.querySelector('#confirmFactions').onclick=()=>resolve(true);panel.querySelector('#exitFactions').onclick=()=>resolve(false)});
    await sceneTransition(()=>{$('#startScreen').classList.add('hidden');document.getElementById('difficultySelect')?.classList.add('hidden');panel.classList.remove('hidden')});
    const confirmed=await confirmation;
    if(!confirmed){await api('/api/arena/cancel-preview',{});await sceneTransition(()=>{panel.classList.add('hidden');$('#startScreen').classList.remove('hidden')})}
    return confirmed;
  }
  start=async function(){
    if(tutorial.active)return legacy.start();if(s.started)return;
    const input=$('#arenaNickname'),nickname=input.value.trim();if(!nickname){input.reportValidity();input.focus();return}
    s.started=true;$('#startGame').disabled=true;
    try{
      const difficulty=await selectDifficulty();if(!difficulty){s.started=false;return}
      if(!await confirmFactions()){s.started=false;return}
      localStorage.setItem('autochessNickname',nickname);
      pendingCommanderRewards.length=0;
      const response=await api('/api/arena/start',{nickname,difficulty});arena.lobby=response.lobby;syncPlayer(response.player);
      if(difficulty!=='standard')await chooseCommander();
      s.cards=await api('/api/cards');s.board=Array(7).fill(null);s.bench=Array(12).fill(null);s.enemy=Array(7).fill(null);
      s.lifeTowerEffects=[];s.snowVanguardEffects=[];s.aegirAttackBonus=0;s.shop=await api('/api/shop');
      arena.agents=await Promise.all(arena.lobby.seats.filter(p=>p.number).map(createAgent));
      document.body.classList.add('arena-mode');paintLobby();
      await sceneTransition(()=>{$('#startScreen').classList.add('hidden');document.getElementById('factionPreview')?.classList.add('hidden');$('#gameShell').classList.remove('hidden')});
      await startPrep();
    }catch(e){document.getElementById('difficultySelect')?.classList.add('hidden');document.getElementById('factionPreview')?.classList.add('hidden');$('#startScreen').classList.remove('hidden');s.started=false;document.querySelectorAll('iframe[data-arena-agent]').forEach(x=>x.remove());arena.agents=[];throw e}
    finally{$('#startGame').disabled=false}
  };
  startPrep=async function(){if(tutorial.active||!arena.lobby)return legacy.startPrep();await preparation();document.body.classList.remove('arena-combat');s.timer=setInterval(tickPrep,1000);paintLobby();runAgents()};
  loadEnemy=async function(){if(tutorial.active||!arena.lobby)return legacy.loadEnemy()};
  fight=async function(){
    if(tutorial.active||!arena.lobby)return legacy.fight();
    if(s.busy||s.phase!=='备战'||s.mergeAnimating||s.deployTarget||s.deployTargetResolving||document.querySelector('.discover-pop'))return;
    await chooseCommanderUpgrade();
    document.getElementById('arenaError')?.remove();clearInterval(s.timer);s.busy=true;draw();const before=compact(s.board).map(cloneData);let resolved=false;
    try{
      await finishAgents();await workshopRequest;deliverCommanderRewards();await api('/api/arena/submit',stateForBattle());
      const response=await api('/api/arena/resolve',{round:s.round});resolved=true;
      // Keep the public lobby at its pre-battle snapshot until playback finishes.
      // The server has already resolved every pairing, but those results are not visible yet.
      const res=response.results[playerId];s.assimilatedSources={};s.phase='战斗中';s.enemy=pad(cloneData(res.opponent_board));
      for(const u of compact(s.board))u.current_hp=u.max_hp;
      document.querySelector('#gameMain>.enemy h2').textContent='本轮对手 · '+res.opponent_name;
      document.querySelector('#gameMain>.enemy').prepend(document.getElementById('arenaSeats'));document.body.classList.add('arena-combat');draw();paintLobby();
      s.skipBattleAvailable=true;draw();
      await Promise.all(arena.agents.map(async x=>{x.seat=response.lobby.seats.find(p=>p.id===x.seat.id);await x.agent.result(response.results[x.seat.id],response.lobby.finished)}));
      await applyResult(res,before,true);
      document.querySelector('#gameMain>.shop-panel').prepend(document.getElementById('arenaSeats'));document.body.classList.remove('arena-combat');
      arena.lobby=response.lobby;paintLobby();
      const inspector=document.getElementById('arenaInspect');if(inspector)inspectSeat(Number(inspector.dataset.seat));
      log(res.winner==='left'?'战斗胜利！':res.winner==='draw'?'战斗平局。':'战斗失败，扣除 '+res.loss_damage+' 生命。',res.winner==='right'?'bad':'good');
      if(arena.lobby.finished){results();return}
      await Promise.all(arena.agents.filter(x=>x.seat.health>0).map(x=>x.agent.prepare()));await newShop();await startPrep();
    }catch(e){document.querySelector('#gameMain>.shop-panel').prepend(document.getElementById('arenaSeats'));document.body.classList.remove('arena-combat');reportError('对局推进失败：'+e.message+'。请重试结束备战。');
      // Never repeat a committed battle; expose a retry only before settlement.
      if(!resolved){s.phase='备战';s.busy=false;draw()}else{s.phase='结算异常';s.busy=true;draw();alert('战斗已结算，后续处理失败：'+e.message)}
    }
  };
  $('#fight').onclick=()=>s.phase==='战斗中'?requestSkipBattle():fight();
  updateHud=function(){legacy.updateHud();updateCommanderButton();if(arena.lobby&&!tutorial.active){$('#round').textContent='第 '+s.round+' 轮';$('#refresh').disabled=s.busy||s.phase!=='备战';$('#upgrade').disabled=s.busy||s.phase!=='备战'||s.shopLevel>=6;$('#lockShop').disabled=s.busy||s.phase!=='备战'}};
  document.getElementById('arenaSeats').onclick=e=>{const b=e.target.closest('[data-seat]');if(b)inspectSeat(Number(b.dataset.seat))};
  $('#arenaNickname').value=localStorage.getItem('autochessNickname')||'';
  window.arenaMatch={inspect:()=>cloneData(arena.lobby)};
  // Read-only visual sandbox: no arena creation, AI workers, timers or purchases.
  if(new URLSearchParams(location.search).has('commander-preview')){
    (async()=>{
      const [catalog,cards]=await Promise.all([api('/api/commanders'),api('/api/cards')]);
      s.cards=cards;const units=cards.filter(c=>c.card_type==='unit'&&!c.summon_only);
      const pick=(names)=>names.map(name=>units.find(c=>c.name===name)).filter(Boolean).map(cloneData);
      s.started=true;s.busy=true;s.phase='备战';s.round=6;s.hp=42;s.gold=10;s.shopLevel=4;s.shopSlots=6;s.prepSeconds=90;
      s.board=pad(pick(['能天使','莫斯提马','送葬人','翎羽','空构','安比尔','流星']));
      s.bench=Array(12).fill(null);pick(['焰尾','砾','芬']).forEach((u,i)=>s.bench[i]=u);
      s.shop=pick(['蕾缪安','逻各斯','信仰搅拌机','焰尾','玛恩纳','耀骑士临光']);
      while(s.shop.length<6)s.shop.push(cloneData(units[s.shop.length]));
      s.enemy=Array(7).fill(null);
      arena.lobby={round:6,finished:false,seats:Array.from({length:8},(_,i)=>({id:i?'preview-'+i:playerId,number:i,name:i?'AI '+i:'界面预览',health:42-i*4,shop_level:4,rank:null,snapshot:cloneData(compact(s.board)),snapshot_round:5,commander:cloneData(catalog.commanders[i%catalog.commanders.length]),opponent_id:i===0?'preview-1':playerId}))};
      document.body.classList.add('arena-mode');$('#startScreen').classList.add('hidden');$('#gameShell').classList.remove('hidden');
      draw();paintLobby();
      const bar=document.createElement('div');bar.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:10001;display:flex;gap:10px;align-items:center;padding:10px 18px;background:#101f1ef5;border:1px solid #718d65;color:#e7eddb';
      bar.innerHTML='<b>棋手界面预览</b><select aria-label="切换预览棋手">'+catalog.commanders.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')+'</select><a href="/" style="color:#c5e735">返回开始界面</a>';
      document.body.append(bar);
      bar.querySelector('select').onchange=e=>{arena.lobby.seats[0].commander=cloneData(catalog.commanders.find(c=>c.id===e.target.value));document.getElementById('commanderHud')?.remove();paintLobby()};
      // Keep existing hover details and avatar inspection, but prevent game actions.
      document.addEventListener('click',e=>{if(bar.contains(e.target)||e.target.closest('#arenaSeats, #arenaInspect, #commanderHud'))return;e.preventDefault();e.stopImmediatePropagation()},true);
      document.addEventListener('dragstart',e=>e.preventDefault(),true);
      log('界面预览：可切换棋手、悬停查看技能、点击玩家头像查看棋手和阵容。');
    })().catch(e=>alert('预览加载失败：'+e.message));
  }

})();
