import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server


class SaleTests(unittest.TestCase):
    def test_life_tower_applies_to_all_new_summons(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server,'DB_PATH',Path(directory)/'tower-summons.sqlite'):
                server.initialise_database()
                token=server._life_tower_effects.set({'left':[{'amount':3},{'amount':2}],'right':[]})
                try:
                    source=server.card_by_id('Highmore');team=[None]*7;events=[]
                    server.trigger_legacy(source,0,'left',team,[],events)
                    summoned=next(u for u in team if u)
                    self.assertEqual((summoned['attack'],summoned['max_hp']),(9,9))
                    for id in ['Skadi','Grani']:
                        base=server.card_by_id(id);team=[None]*7
                        _,summoned=server.summon_unit_from_legacy(source,0,'left',team,id,events=[])
                        self.assertEqual(summoned['attack'],base['attack']+5)
                        self.assertEqual(summoned['max_hp'],base['max_hp']+5)
                    team=[None]*7
                    _,enemy=server.summon_unit_from_legacy(source,0,'right',team,'Grani',events=[])
                    self.assertEqual(enemy['attack'],3)
                finally:server._life_tower_effects.reset(token)

    def test_summons_stay_between_original_neighbors(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server,'DB_PATH',Path(directory)/'positions.sqlite'):
                server.initialise_database()
                source=server.card_by_id('Deepcolor');source['battle_position']=2
                left={'id':'left','name':'left','current_hp':10,'battle_position':1}
                right={'id':'right','name':'right','current_hp':10,'battle_position':3}
                team=[None,left,None,right,None,None,None];events=[]
                server.trigger_legacy(source,2,'left',team,[],events)
                ordered=[u for _,u in server.battle_entries(team) if u]
                self.assertEqual([u['id'] for u in ordered],['left','Deep Sea Slider','Deep Sea Slider','right'])
                # Second summon uses slot zero, but is still adjacent to the right neighbor.
                self.assertEqual(server.spatial_neighbors(team,3), (0,None))
                revived=server.card_by_id('Deepcolor')
                server.place_summon(revived,source,2,team);team[4]=revived
                self.assertEqual([u['id'] for _,u in server.battle_entries(team) if u],['left','Deep Sea Slider','Deep Sea Slider','Deepcolor','right'])
                # Nested summons stay at the nested source's position too.
                nested=team[2];team[2]=None
                server.summon_unit_from_legacy(nested,2,'left',team,'Pocket Sea Crawler',events=events)
                self.assertEqual([u['id'] for _,u in server.battle_entries(team) if u],['left','Pocket Sea Crawler','Deep Sea Slider','Deepcolor','right'])

    def test_final_aegir_summon_effects(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server,'DB_PATH',Path(directory)/'final-aegir.sqlite'):
                server.initialise_database()
                token=server._aegir_game_attack.set({'left':0,'right':0})
                try:
                    def card(id):
                        u=server.card_by_id(id);u['current_hp']=u['max_hp'];return u
                    thorns=card('Thorns the Lodestar');skadi=card('Skadi the Corrupting Heart')
                    team=[thorns,skadi]+[None]*5;events=[]
                    _,monster=server.summon_unit_from_legacy(thorns,0,'left',team,'Deep Sea Slider',events=events)
                    self.assertEqual((monster['attack'],monster['max_hp']),(10,9));self.assertTrue(monster['lock_hp'])
                    self.assertEqual(server._aegir_game_attack.get()['left'],1)
                    ulpianus=card('Ulpianus');team=[None]*7
                    def pick(pool):
                        self.assertFalse(any(u['id']=='Ulpianus' for u in pool))
                        self.assertTrue(any(u.get('sea_monster') for u in pool))
                        self.assertTrue(any(not u.get('sea_monster') for u in pool))
                        return next(u for u in pool if u['id']=='Deep Sea Slider')
                    with patch.object(server.random,'choice',side_effect=pick):server.trigger_legacy(ulpianus,0,'left',team,[],[])
                    units=[u for u in team if u];self.assertEqual(len(units),2)
                    self.assertTrue(all(u['attack']==5 and u['max_hp']==4 for u in units))
                    specter=server.apply_golden_unit(card('Specter the Unchained'));team=[None]*7
                    server.trigger_legacy(specter,0,'left',team,[],[])
                    self.assertEqual(len([u for u in team if u and u['guard']]),6)
                    lumen=card('Lumen');a=card('Deep Sea Slider');b=card('Deep Sea Slider');far=card('Deep Sea Slider')
                    team=[a,lumen,None,b,far];events=[]
                    server.trigger_death_feud({'name':'Dead'},2,'left',team,[],events)
                    self.assertEqual([u['attack'] for u in [a,lumen,b,far]],[3,5,3,1])
                    self.assertEqual(len([e for e in events if e.get('type')=='permanent_buff']),3)
                finally:server._aegir_game_attack.reset(token)

    def test_gladiia_skadi_and_thorns(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server,'DB_PATH',Path(directory)/'summon-effects.sqlite'):
                server.initialise_database()
                token=server._aegir_game_attack.set({'left':0,'right':0})
                try:
                    skadi=server.card_by_id('Skadi');skadi['current_hp']=0
                    gladiia=server.card_by_id('Gladiia');gladiia['current_hp']=4
                    team=[skadi,gladiia]+[None]*5;events=[]
                    server.handle_unit_death(skadi,0,'left',team,[],events)
                    revived=next(u for u in team if u and u['id']=='Skadi')
                    # Gladiia's attack becomes 6 from Skadi, then grants half (3).
                    self.assertEqual(revived['attack'],8)
                    self.assertFalse(server.has_revive(revived))
                    self.assertEqual(server._aegir_game_attack.get()['left'],1)
                    server.trigger_legacy(revived,0,'left',team,[],events)
                    self.assertEqual(server._aegir_game_attack.get()['left'],2)
                    # Each Tin Man repetition independently summons the golden two.
                    thorns=server.apply_golden_unit(server.card_by_id('Thorns'));thorns['current_hp']=thorns['max_hp']
                    tin={'id':'Tin','name':'Tin','attack':1,'max_hp':5,'current_hp':5,'initiative_multiplier':2}
                    team=[thorns,tin]+[None]*5;events=[]
                    server.resolve_precombat_phase('initiative',team,[],'left',events)
                    crawlers=[u for u in team if u and u.get('id')=='Pocket Sea Crawler']
                    self.assertEqual(len(crawlers),4)
                    self.assertTrue(all(u['venom'] and u['attack']==3 for u in crawlers))
                finally:server._aegir_game_attack.reset(token)

    def test_aegir_summon_watchers_and_random_legacy(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server,'DB_PATH',Path(directory)/'aegir.sqlite'):
                server.initialise_database()
                for golden,count,bonus in [(False,2,4),(True,4,8)]:
                    source=server.card_by_id('Andreana');watcher=server.card_by_id('Lucilla')
                    if golden:source=server.apply_golden_unit(source);watcher=server.apply_golden_unit(watcher)
                    for hp in [3,0,-1]:
                        watcher['current_hp']=hp;team=[None]*6+[watcher];events=[]
                        with patch.object(server.random,'choice',side_effect=lambda pool: pool[0]) as choose:
                            server.trigger_legacy(source,0,'left',team,[],events)
                        self.assertEqual(choose.call_count,count)
                        monsters=[u for u in team if u and u.get('sea_monster')]
                        self.assertEqual(len(monsters),count)
                        self.assertEqual(len({u['id'] for u in monsters}),1)
                        for u in monsters:
                            base=server.card_by_id(u['id'])
                            self.assertEqual(u['attack'],base['attack']+(bonus if hp>0 else 0))
                            self.assertEqual(u['max_hp'],base['max_hp']+(bonus if hp>0 else 0))
                for id,attack,hp in [('Glaucus',2,2),('Whisperain',1,3)]:
                    c=server.card_by_id(id);self.assertEqual((c['attack'],c['max_hp']),(attack,hp))
                c=server.card_by_id('Underflow');self.assertTrue(c['lock_hp'])
                self.assertEqual(c['on_deploy']['attack'],3)
                self.assertEqual(server.apply_golden_unit(c)['on_deploy']['attack'],6)

    def test_deepcolor_legacy_summons(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server,'DB_PATH',Path(directory)/'summons.sqlite'):
                server.initialise_database()
                for golden,count in [(False,2),(True,4)]:
                    source=server.card_by_id('Deepcolor')
                    if golden:source=server.apply_golden_unit(source)
                    team=[None]*7;events=[]
                    server.trigger_legacy(source,0,'left',team,[],events)
                    summoned=[u for u in team if u]
                    self.assertEqual(len(summoned),count)
                    self.assertTrue(all(u['id']=='Deep Sea Slider' and u['attack']==1 and u['current_hp']==1 for u in summoned))
                for golden,count in [(False,1),(True,2)]:
                    source=server.card_by_id('Highmore')
                    if golden:source=server.apply_golden_unit(source)
                    self.assertTrue(source['guard'])
                    team=[None]*7;events=[]
                    server.trigger_legacy(source,0,'left',team,[],events)
                    summoned=[u for u in team if u]
                    self.assertEqual(len(summoned),count)
                    self.assertTrue(all(u['id']=='Basin Sea Reaper' and u['combo'] for u in summoned))
                for level in range(1,7):
                    tower=server.card_by_id(f'life_tower_{level}')
                    self.assertEqual(tower['effect_value'],level)
                for card_id in ['Glaucus','Whisperain']:
                    card=server.card_by_id(card_id)
                    self.assertEqual(card['on_deploy']['count'],1)
                    self.assertEqual(server.apply_golden_unit(card)['on_deploy']['count'],2)
                specter=server.card_by_id('Specter')
                self.assertTrue(specter['guard'] and specter['lock_hp'])

    def test_sea_monsters_are_summon_only(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server,'DB_PATH',Path(directory)/'tokens.sqlite'):
                server.initialise_database()
                tokens=[c for c in server.cards() if c.get('summon_only')]
                self.assertEqual(len(tokens),4)
                self.assertEqual(sorted((c['attack'],c['max_hp']) for c in tokens),[(1,1),(1,1),(4,4),(5,5)])
                for c in tokens:
                    self.assertEqual(c['tier'],1)
                    with self.assertRaises(ValueError):server.buy_card(c['id'],bypass_shop_level=True)
                for level in range(1,7):
                    with server.db() as con:con.execute('UPDATE players SET shop_level=?',(level,))
                    con.close()
                    self.assertFalse(any(c.get('summon_only') for c in server.shop(100)))
                    self.assertFalse(any(c and c.get('summon_only') for c in server.enemy_board(8,level)))

    def test_economy_round_discounts_and_income(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server,'DB_PATH',Path(directory)/'economy.sqlite'):
                server.initialise_database()
                for level,base in enumerate([5,9,12,14,15],1):
                    server.reset_player()
                    with server.db() as con: con.execute('UPDATE players SET shop_level=?,gold=100 WHERE id=?',(level,'local'))
                    self.assertEqual(server.player()['upgrade_cost'],base)
                    discount=0
                    for turn in range(6):
                        result=server.settle_battle({'winner':'left','loss_damage':0,'logistics_gold':20},turn+1)
                        discount+=2+turn//2+(level>=4)
                        self.assertEqual(result['shop_discount'],discount)
                        self.assertEqual(result['upgrade_cost'],max(0,base-discount))
                        self.assertEqual(result['victory_bonus'],0)
                    server.reduce_upgrade_cost(2)
                    self.assertEqual(server.player()['shop_rounds'],6)
                    result=server.upgrade_shop()
                    self.assertEqual(result['shop_rounds'],0)
                    self.assertEqual(result['shop_discount'],0)
                server.reset_player()
                result=server.settle_battle({'winner':'left','loss_damage':0,'logistics_gold':50},14)
                self.assertEqual(result['gold'],63)
                self.assertEqual(result['income'],10)
                self.assertEqual(server.gain_gold(100)['gold'],163)
                self.assertEqual(server.reset_player()['shop_rounds'],0)
                self.assertEqual([server.round_income(n) for n in range(1,15)],[4,5,6,7,8,9,10,10,10,10,10,10,10,10])

    def test_existing_database_gets_round_counter_without_losing_gold(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'old.sqlite'
            with sqlite3.connect(path) as con:
                con.execute('CREATE TABLE players(id TEXT PRIMARY KEY,gold INTEGER,health INTEGER,round INTEGER,shop_level INTEGER,shop_discount INTEGER,total_gold_earned INTEGER)')
                con.execute("INSERT INTO players VALUES('local',42,40,7,3,5,99)")
            con.close()
            with patch.object(server,'DB_PATH',path):
                server.initialise_database();server.initialise_database()
                player=server.player()
                self.assertEqual((player['gold'],player['shop_discount'],player['shop_rounds']),(42,5,0))

    def test_enemy_stats_by_round(self):
        totals=[None,None,5,5,5,8,10,20,30,50,100,200,300,400]
        # Deliberately extreme base verifies later stats aren't floored at base.
        base={'id':'test','name':'test','card_type':'unit','stars':1,'attack':90,'max_hp':1}
        for boundary in ('low','high'):
            class FixedRandom:
                def choices(self,pool,**kwargs): return [pool[0]]
                def randint(self,low,high): return low if boundary=='low' else high
            with patch.object(server,'cards',return_value=[base]),patch.object(server.random,'SystemRandom',return_value=FixedRandom()):
                for rn,total in enumerate(totals,1):
                    board=server.enemy_board(rn,3)
                    for card in filter(None,board):
                        if total is None:
                            self.assertEqual((card['attack'],card['max_hp']),(90,1))
                        else:
                            self.assertEqual(card['attack']+card['max_hp'],total)
                            for stat in ('attack','max_hp'):
                                self.assertGreaterEqual(card[stat],total*0.4)
                                self.assertLessEqual(card[stat],total*0.6)
                        self.assertEqual(card['current_hp'],card['max_hp'])
        self.assertEqual(base['attack'],90)

    def test_enemy_higher_tier_probability(self):
        for level in range(1,6):
            for round_number in (2,6,14):
                pool=[{'stars':tier} for tier in range(1,level+2) for _ in range(tier*3)]
                weights=server.enemy_selection_weights(pool,round_number,level)
                self.assertAlmostEqual(sum(weights),1)
                self.assertAlmostEqual(sum(w for c,w in zip(pool,weights) if c['stars']==level+1),0.15)
                self.assertTrue(all(w>0 for w in weights))
        self.assertEqual(len(server.enemy_selection_weights([{'stars':6}],14,6)),1)

    def test_every_unit_can_be_sold_at_shop_level_one(self):
        # Use an isolated database; never modify the player's saved game.
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server, 'DB_PATH', Path(directory) / 'sales.sqlite'):
                server.initialise_database()
                units=[card for card in server.cards() if card['card_type']=='unit']
                self.assertTrue(any(card['id']=='Hoederer' for card in units))
                gold=server.player('local')['gold']
                for card in units:
                    with self.subTest(card=card['id']):
                        result=server.sell_unit(card['id'])
                        gold+=1
                        self.assertEqual(result['gold'],gold)
                        self.assertEqual(result['refund'],1)
                        self.assertEqual(result['shop_level'],1)


if __name__=='__main__': unittest.main()
