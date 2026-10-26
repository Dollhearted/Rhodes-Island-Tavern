/* Shared, bounded estimates for AI shopping and self-play evaluation. */
(function(root){
  const units=a=>(a||[]).filter(u=>u?.card_type==='unit');
  const stats=u=>Math.max(0,Number(u.attack)||0)+Math.max(0,Number(u.max_hp)||0);
  const mark=(u,k)=>!!u[k]||(u.mechanics||[]).includes(k);
  const effects=u=>['on_deploy','logistics','support','synergy','recruit','sell','legacy'].map(k=>u[k]).filter(Boolean);
  const consumes=u=>effects(u).some(e=>/assimilate.*shop/.test(e.type||''));
  const grows=u=>effects(u).some(e=>/shop_(stat|health)_growth/.test(e.type||'')||e.card_id==='mechanism_analysis');
  function output(u){
    const attack=Math.max(0,Number(u.attack)||0);
    let damage=attack*(mark(u,'combo')?2:1)*(u.cleave?1.8:1);
    for(const e of [u.initiative,u.legacy])if(e&&/bullet/.test(e.type||''))damage+=Number(e.attack_ratio||0)*attack+Number(e.damage||e.amount||0);
    if(mark(u,'venom'))damage+=Math.min(15,Number(u.max_hp||0));
    return damage;
  }
  function sargonValue(u,team,shop){
    team=units(team);shop=units(shop);
    const others=team.filter(x=>x!==u),consumers=others.filter(consumes).length,growers=others.filter(grows).length;
    const food=shop.length?shop.reduce((n,x)=>n+stats(x),0)/shop.length:0;
    let value=grows(u)?Math.min(18,consumers*6):0;
    if(consumes(u)){
      // Limited stock is shared across all consumers, not multiplied for each.
      const capacity=Math.min(1,shop.length/(consumers+1));
      const effect=effects(u).find(e=>/assimilate.*shop/.test(e.type||''));
      value+=Math.min(24,food*.3*capacity*Number(effect.multiplier||1)+growers*3);
      if(u.logistics?.type==='team_assimilate_shop')value+=Math.min(12,others.filter(x=>['萨尔贡','任意'].includes(x.faction)).length*3);
    }
    return value;
  }
  const plans=[
    {id:'ai-sargon-logistics',faction:'萨尔贡',core:['Tomimi','Pepe','Philae','Scene','Warfarin','Passenger','Narantuya'],transition:['Manticore','Minimalist','Papyrus','Heavyrain']},
    {id:'ai-sargon-support',faction:'萨尔贡',core:['Narantuya','Eunectes','Tomimi','Pepe','Passenger','Sesa','Logos'],transition:['Manticore','Minimalist','Papyrus','Philae']}
  ];
  function trainingReward(board,guides,rank){
    const team=units(board),counts=new Map();for(const u of team)counts.set(u.id,(counts.get(u.id)||0)+1);
    const match=Math.max(0,...guides.filter(g=>g.core.length).map(g=>{const left=new Map(counts);let n=0;for(const id of g.core)if(left.get(id)>0){n++;left.set(id,left.get(id)-1)}return n/Math.max(7,g.core.length)}));
    const total=team.reduce((n,u)=>n+stats(u),0),damage=team.reduce((n,u)=>n+output(u),0);
    const normalize=(v,scale)=>Math.log1p(v)/(Math.log1p(v)+Math.log1p(scale));
    const placing=(8-Math.max(1,Math.min(8,Number(rank)||8)))/7;
    // Exploration is a small bonus, only for a competitive or demonstrably strong board.
    const viable=rank<=4||total>=350||damage>=200;
    const novelty=viable?3*(1-match):0;
    return {score:20*match+30*normalize(total,300)+15*normalize(damage,150)+35*placing+novelty,match,total,damage,novelty,rank};
  }
  root.AIPlaybook={stats,output,consumes,grows,sargonValue,plans,trainingReward};
  if(typeof module!=='undefined')module.exports=root.AIPlaybook;
})(globalThis);
