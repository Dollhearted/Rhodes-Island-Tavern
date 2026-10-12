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
    if(s.shopLevel>before&&!tutorial.active)(botId?window.parent:window).dispatchEvent(new CustomEvent('arena-shop-upgraded',{detail:{id:botId||playerId,level:s.shopLevel}}));
  };
  if(!botId)$('#upgrade').onclick=()=>upgradeShop();
  function stateForBattle(){
    return cloneData({round:s.round, board:compact(s.board), bench:s.bench,
      aegir_attack_bonus:Number(s.aegirAttackBonus||0), battle_wagers:s.battleWagers,
      life_tower_effects:(s.lifeTowerEffects||[]).filter(b=>b.expires>s.round),
      snow_vanguard_effects:(s.snowVanguardEffects||[]).filter(e=>e.round===s.round).map(e=>e.amount)});
  }
  async function preparation(){
    clearInterval(s.timer);expireSnowVanguard();expireLifeTower();
    s.phase='备战';s.busy=true;s.skipBattle=false;s.skipBattleAvailable=false;
    s.prepSeconds=PREP_TIMES[Math.min(s.round-1,PREP_TIMES.length-1)]||90;
    if(s.pendingNextRoundGold>0){syncPlayer(await api('/api/gain_gold',{amount:s.pendingNextRoundGold}));s.pendingNextRoundGold=0}
    await resolveReturnCampEffects();s.busy=false;draw();
  }
  async function applyResult(res,before,animated){
    s.phase='战斗中';s.enemy=pad(cloneData(res.opponent_board));
    if(animated)await animateEvents(res);
    else for(const e of res.events)if(e.type==='gain_card'||e.type==='aegir_game_attack')applyEventLog(cloneData(e));
    s.aegirAttackBonus=Number(res.aegir_attack_bonus||0);syncPlayer(res);s.battleWagers=0;
    s.board=restoreBoardAfterBattle(before,res.left,res.persistent_left);
    s.enemy=pad(cloneData(res.opponent_board));s.phase='结算';syncAegirGameBonus();
    tryCombineTriples();draw();
  }
  async function newShop(){if(!s.shopLocked)s.shop=await api('/api/shop');s.shopLocked=false}

  const guideKey='autochess-lineups-v2';
  const guideFactions=['拉特兰','炎','维多利亚','阿戈尔','谢拉格','其他'];
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
    draw=()=>{syncAegirGameBonus();s.board=pad(s.board)};
    queueTripleAnimation=()=>{};captureTripleSources=()=>[];
    animatePrepAssimilate=async()=>{};
    let number=1, steps=0, done=false, skippedSkills=new Set(), rejectedShop=new Set();
    const profiles=[[1.4,.7,.8,.8],[.85,1.45,.9,.8],[.9,1,1.5,.8],[1,1,1,1.5],[1.2,1,1.2,1],[1,1.2,1,1.2],[1.1,1.1,1.1,1.1]];
    let policy=null,trainingGuides=null;
    function validPolicy(p){return Array.isArray(p)&&p.length===6&&p.every(v=>Number.isFinite(v)&&v>=.25&&v<=3)}

    const weights=()=>policy||[...profiles[(number-1)%profiles.length],1,1];
    const owned=()=>[...compact(s.board),...compact(s.bench)].filter(u=>u.card_type==='unit');
    let plan=null,planRound=0;
    function selectPlan(){
      const plans=(trainingGuides||readGuides()).filter(g=>g.core.length),units=owned();
      const value=g=>units.reduce((n,u)=>n+(g.core.includes(u.id)?12+(u.golden?6:0):g.transition.includes(u.id)?4:0),0)+(plan?.id===g.id?9:0)+(plans.indexOf(g)===(number-1)%plans.length?3:0);
      plan=plans.reduce((best,g)=>!best||value(g)>value(best)?g:best,null);planRound=s.round;
    }
    function score(u,shopping=false){
      if(!u)return -Infinity;
      if(u.card_type==='skill')return 8+Number(u.effect_value||0)*2;
      const [tempo,,economy,synergy,coreWeight,transitionWeight]=weights(),team=compact(s.board),text=JSON.stringify(u);
      let value=(Number(u.attack||0)+Number(u.max_hp||0))*.6+Number(u.stars||u.tier||1)*1.3;
      for(const mark of ['shield','revive','lock_hp','combo','venom','block'])if(hasMark(u,mark))value+=mark==='venom'?6:3;
      if(u.legacy)value+=3;if(u.initiative)value+=2;if(u.bloodbattle)value+=3;
      value*=tempo+(s.hp<20?.5:0);
      if(/gain_gold|gain_card|gain_.*(?:seasons|soil|sorrow|vanguard)|discover|upgrade_shop/.test(text))value+=economy*(s.round<10?6:3);
      const family=team.filter(x=>x!==u&&(x.faction===u.faction||x.faction==='任意'||u.faction==='任意')).length;
      value+=Math.min(5,family)*synergy*1.8;
      if(/bullet|cumulative/.test(text)&&team.some(x=>x!==u&&/bullet|cumulative/.test(JSON.stringify(x))))value+=4;
      if(/summon|aegir/.test(text)&&team.some(x=>x!==u&&/summon|aegir/.test(JSON.stringify(x))))value+=4;
      if(/bloodbattle/.test(text)&&team.some(x=>x!==u&&/bloodbattle/.test(JSON.stringify(x))))value+=3;
      if(plan){
        const progress=team.filter(x=>plan.core.includes(x.id)).length;
        if(plan.core.includes(u.id))value+=(12+synergy*4+progress*1.5)*coreWeight;
        else if(plan.transition.includes(u.id))value+=Math.max(1,10-progress*2-(s.round>9?4:0))*transitionWeight;
      }
      if(shopping&&!u.golden){const copies=owned().filter(x=>!x.golden&&x.id===u.id).length;value+=copies===1?5:copies>=2?28:0;if(canCompleteTriple(u))value+=20}
      return value;
    }
    const bestIndex=(items,fn=score)=>items.reduce((best,u,i)=>u&&(best<0||fn(u)>fn(items[best]))?i:best,-1);
    chooseThree=async(_title,options)=>cloneData(options[bestIndex(options,u=>score(u,true))]||null);
    chooseBlessingStat=async u=>Number(u.attack)>Number(u.max_hp)?'attack':'hp';
    async function choices(){
      if(s.deployTarget){const p=s.deployTarget,mark=({select_buff_combo:'combo',select_buff_lock_hp:'lock_hp',select_buff_revive:'revive'})[p._effect.type];
        await chooseDeployTarget(bestIndex(p._options,u=>score(u)+(s.board.includes(u)?12:0)-(mark&&hasMark(u,mark)?8:0)));return true}
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
      const team=compact(s.board),hand=compact(s.bench).filter(u=>u.card_type==='unit');
      if(hand.length&&team.length<7){const unit=hand[bestIndex(hand)],i=s.bench.indexOf(unit);s.dragging={type:'bench',index:i};await dropToBoardInsert(event(),placement(unit));s.dragging=null;return true}
      for(let i=0;i<s.bench.length;i++){
        const sk=s.bench[i];if(!sk||sk.card_type!=='skill'||skippedSkills.has(sk))continue;
        const destructive=['self_repair','emergency_defibrillation','remove_for_gold','sacrifice_share_stats'].includes(sk.effect);
        if(destructive&&(!hand.length||!team.length)){skippedSkills.add(sk);continue}
        s.dragging={type:'bench',index:i};
        if(['single_unit','board_unit'].includes(sk.target_scope)&&team.length){
          const idx=bestIndex(team,u=>destructive?-score(u):score(u));await dropSkillToUnit(event(),idx);
        }else if(sk.target_scope==='shop_unit'){
          const idx=bestIndex(s.shop,u=>score(u,true));if(idx>=0){if(sk.effect==='angel_blessing')await useAngelBlessing(i,idx);else await useShopTransformSkill(i,idx)}
        }else await useBenchSkill(i,true);
        s.dragging=null;if(s.bench[i]===sk&&!document.querySelector('.discover-pop'))skippedSkills.add(sk);else return true;
      }
      const weak=bestIndex(team,u=>-score(u)),strong=bestIndex(hand);
      if(team.length===7&&strong>=0&&score(hand[strong])>score(team[weak])+3){await sellCard('board',weak);return true}
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
      async submit(){while(await choices()){};if(plan){const team=compact(s.board);team.sort((a,b)=>{const pos=u=>hasMark(u,'block')?-2:plan.core.includes(u.id)?plan.core.indexOf(u.id):hasMark(u,'guard')?-1:8;return pos(a)-pos(b)});s.board=pad(team)}await api('/api/arena/submit',stateForBattle())},
      async result(res,finished){if(!res)return;await applyResult(res,compact(s.board).map(cloneData),false);done=finished||s.hp<=0;steps=0;skippedSkills.clear();rejectedShop.clear()},
      async prepare(){if(s.hp<=0)return;await newShop();await preparation();await syncGuides();selectPlan();done=false},
      inspect(){return {round:s.round,gold:s.gold,hp:s.hp,level:s.shopLevel,board:cloneData(s.board),bench:cloneData(s.bench),steps,done}}
    };
    return;
  }

  document.head.insertAdjacentHTML('beforeend', `<style>
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
    body.arena-mode.arena-combat #gameMain>.enemy{display:block!important;grid-row:2!important}body.arena-mode.arena-combat #gameMain>.board-panel{grid-row:3!important}body.arena-mode.arena-combat #gameMain>.bench-panel{grid-row:4!important}
    body.arena-mode [data-terminal-panel="enemy"],body.arena-mode [data-panel="enemy"],body.arena-mode [data-terminal-panel="log-panel"],body.arena-mode [data-panel="log-panel"]{display:none}
    .arena-inspect{background:#0e1c16;color:#def5e9;border:1px solid #467c65;width:min(1100px,94vw);max-height:85vh;padding:24px}.arena-inspect::backdrop{background:#020906bf;backdrop-filter:blur(5px)}
    .arena-inspect .victory-units,.arena-results .victory-units{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.arena-inspect .victory-unit,.arena-results .victory-unit{width:112px;padding:8px;min-width:0;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:6px}.arena-inspect .result-portrait,.arena-results .result-portrait{width:76px;height:76px}
    .arena-results{max-height:92vh;overflow:auto;width:min(1140px,96vw)}.arena-result-row{padding:18px 8px;border-bottom:1px solid #315241}.arena-result-row h2 small{float:right;font-size:12px}.arena-results .victory-title{font-size:40px!important}
    @media(max-width:850px){.arena-ring{width:34px;height:34px}.arena-seat{min-width:30px}.arena-seats{gap:8px}}
  </style>`);
  async function openLineupGuide(){
    if(tutorial.active)return;
    if(!s.cards?.length)s.cards=await api('/api/cards');
    await syncGuides();
    document.getElementById('lineupGuide')?.remove();
    const dialog=document.createElement('dialog');dialog.id='lineupGuide';dialog.className='lineup-guide';
    let selected='拉特兰',selectedId=null,editing=false,draft=null;
    function render(){
      const guides=readGuides(),options=guides.filter(x=>x.faction===selected),g=draft||options.find(x=>x.id===selectedId)||options[0]||{name:'暂无阵容',note:'点击“＋ 添加阵容”创建第一套阵容。',core:[],transition:[]},pool=s.cards.filter(u=>u.card_type==='unit'&&!u.summon_only&&!u.cannot_gain),byId=new Map(pool.map(u=>[u.id,u]));
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
  for(const host of [document.querySelector('.start-actions'),document.querySelector('.terminal-nav')])if(host){const button=document.createElement('button');button.className='btn lineup-open';button.textContent='推荐阵容';button.onclick=()=>openLineupGuide().catch(e=>alert(e.message));host.append(button)}
  window.openLineupGuide=openLineupGuide;
  function paintLobby(){
    const bar=document.getElementById('arenaSeats');if(!bar||!arena.lobby)return;
    bar.innerHTML=arena.lobby.seats.map(p=>`<button class="arena-seat ${p.number===0?'is-self':''} ${p.health<=0?'eliminated':''}" data-seat="${p.number}" title="${esc(p.name)} · ${p.health} 生命 · 查看上回合阵容" aria-label="${esc(p.name)}，生命${p.health}，查看上回合阵容"><span class="arena-ring" style="--health:${Math.max(0,Math.min(100,p.health*2))}%"><span>${esc(p.number===0?Array.from(p.name)[0]:String(p.number))}</span></span><small>${p.health<=0?'#'+p.rank:p.health}</small></button>`).join('');
    const next=arena.lobby.seats.find(p=>p.number===0)?.opponent_id;
    for(const p of arena.lobby.seats){const b=bar.querySelector(`[data-seat="${p.number}"]`);b.classList.toggle('next-opponent',p.id===next&&!arena.lobby.finished);if(p.id===next)b.title+=' · 下回合对手'}
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
  start=async function(){
    if(tutorial.active)return legacy.start();if(s.started)return;
    const input=$('#arenaNickname'),nickname=input.value.trim();if(!nickname){input.reportValidity();input.focus();return}
    s.started=true;$('#startGame').disabled=true;
    try{
      localStorage.setItem('autochessNickname',nickname);
      const response=await api('/api/arena/start',{nickname});arena.lobby=response.lobby;syncPlayer(response.player);
      s.cards=await api('/api/cards');s.board=Array(7).fill(null);s.bench=Array(12).fill(null);s.enemy=Array(7).fill(null);
      s.lifeTowerEffects=[];s.snowVanguardEffects=[];s.aegirAttackBonus=0;s.shop=await api('/api/shop');
      arena.agents=await Promise.all(arena.lobby.seats.filter(p=>p.number).map(createAgent));
      document.body.classList.add('arena-mode');paintLobby();
      await sceneTransition(()=>{$('#startScreen').classList.add('hidden');$('#gameShell').classList.remove('hidden')});
      await startPrep();
    }catch(e){s.started=false;document.querySelectorAll('iframe[data-arena-agent]').forEach(x=>x.remove());arena.agents=[];throw e}
    finally{$('#startGame').disabled=false}
  };
  startPrep=async function(){if(tutorial.active||!arena.lobby)return legacy.startPrep();await preparation();document.body.classList.remove('arena-combat');s.timer=setInterval(tickPrep,1000);paintLobby();runAgents()};
  loadEnemy=async function(){if(tutorial.active||!arena.lobby)return legacy.loadEnemy()};
  fight=async function(){
    if(tutorial.active||!arena.lobby)return legacy.fight();
    if(s.busy||s.phase!=='备战'||s.mergeAnimating||s.deployTarget||s.deployTargetResolving||document.querySelector('.discover-pop'))return;
    document.getElementById('arenaError')?.remove();clearInterval(s.timer);s.busy=true;draw();const before=compact(s.board).map(cloneData);let resolved=false;
    try{
      await finishAgents();await api('/api/arena/submit',stateForBattle());
      const response=await api('/api/arena/resolve',{round:s.round});resolved=true;
      // Keep the public lobby at its pre-battle snapshot until playback finishes.
      // The server has already resolved every pairing, but those results are not visible yet.
      const res=response.results[playerId];s.assimilatedSources={};s.phase='战斗中';s.enemy=pad(cloneData(res.opponent_board));
      for(const u of compact(s.board))u.current_hp=u.max_hp;
      document.querySelector('#gameMain>.enemy h2').textContent='本轮对手 · '+res.opponent_name;
      document.body.classList.add('arena-combat');draw();paintLobby();
      s.skipBattleAvailable=true;draw();
      await Promise.all(arena.agents.map(async x=>{x.seat=response.lobby.seats.find(p=>p.id===x.seat.id);await x.agent.result(response.results[x.seat.id],response.lobby.finished)}));
      await applyResult(res,before,true);
      arena.lobby=response.lobby;paintLobby();
      const inspector=document.getElementById('arenaInspect');if(inspector)inspectSeat(Number(inspector.dataset.seat));
      log(res.winner==='left'?'战斗胜利！':res.winner==='draw'?'战斗平局。':'战斗失败，扣除 '+res.loss_damage+' 生命。',res.winner==='right'?'bad':'good');
      if(arena.lobby.finished){results();return}
      await Promise.all(arena.agents.filter(x=>x.seat.health>0).map(x=>x.agent.prepare()));await newShop();await startPrep();
    }catch(e){reportError('对局推进失败：'+e.message+'。请重试结束备战。');
      // Never repeat a committed battle; expose a retry only before settlement.
      if(!resolved){s.phase='备战';s.busy=false;draw()}else{s.phase='结算异常';s.busy=true;draw();alert('战斗已结算，后续处理失败：'+e.message)}
    }
  };
  $('#fight').onclick=()=>s.phase==='战斗中'?requestSkipBattle():fight();
  updateHud=function(){legacy.updateHud();if(arena.lobby&&!tutorial.active){$('#round').textContent='第 '+s.round+' 轮';$('#refresh').disabled=s.busy||s.phase!=='备战';$('#upgrade').disabled=s.busy||s.phase!=='备战'||s.shopLevel>=6;$('#lockShop').disabled=s.busy||s.phase!=='备战'}};
  document.getElementById('arenaSeats').onclick=e=>{const b=e.target.closest('[data-seat]');if(b)inspectSeat(Number(b.dataset.seat))};
  $('#arenaNickname').value=localStorage.getItem('autochessNickname')||'';
  window.arenaMatch={inspect:()=>cloneData(arena.lobby)};
})();
