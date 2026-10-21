import copy
import json
import threading
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server


class ArenaTests(unittest.TestCase):
    def test_humus_board_only_once_per_round(self):
        room=server.arena_room('human');c={'id':'humus'};room['seats'][0]['commander']=c
        unit=self.card('Courier');before=server.player('human')['gold']
        for zone in ['shop','bench']:
            with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target={'zone':zone,'board':[unit],'index':0})
        self.assertNotIn('skill_used_round',c)
        result=server.use_commander_skill(room,'human',target={'zone':'board','board':[unit],'index':0})
        self.assertEqual(result['player']['gold'],before+3);self.assertEqual(result['removed_index'],0)
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target={'zone':'board','board':[unit],'index':0})
        room['round']=2
        self.assertEqual(server.use_commander_skill(room,'human',target={'zone':'board','board':[unit],'index':0})['player']['gold'],before+6)

    def test_peril_start_draft_and_faction_bans(self):
        result=server.arena_start('human','险境测试',difficulty='peril')
        room=server.arena_room('human');self.assertFalse(room['commanders_ready'])
        drafts=room['commander_draft'];allowed={c['id'] for c in server.available_commanders(server.COMMANDERS,room['banned_factions'])}
        for d in drafts.values():self.assertTrue(set(d['options'])<=allowed)
        self.assertEqual(len({x for d in drafts.values() for x in d['options']}),32)
        for seat in room['seats']:
            d=drafts[seat['id']]
            if d['chosen']:continue
            for slot in range(4):server.commander_action(room,seat['id'],'refresh',slot)
            self.assertEqual(len(set(d['seen'])),8)
            server.commander_action(room,seat['id'],'confirm',0)
        self.assertTrue(room['commanders_ready'])
        self.assertEqual(len({p['commander']['id'] for p in room['seats']}),8)

    def test_skadi_seaborn_rewards_upgrades_and_ownership(self):
        room=server.arena_room('human');c={'id':'skadi_alter'};room['seats'][0]['commander']=c
        card=server.commander_round_reward(room,'human')['card'];self.assertEqual((card['attack'],card['max_hp']),(2,2))
        self.assertTrue(card['summon_only']);self.assertIsNone(server.commander_round_reward(room,'human')['card'])
        for level,choice in [(2,'summon_growth'),(4,'monsters'),(6,'revive')]:
            with server.db() as con:con.execute('UPDATE players SET shop_level=? WHERE id=?',(level,'human'))
            self.assertEqual(server.commander_upgrade(room,'human')['pending'],1)
            server.commander_upgrade(room,'human',choice)
        server.sync_seaborn_aura(card,c);self.assertEqual(card['seaborn_summon_growth'],1);self.assertEqual(card['legacy']['count'],2);self.assertTrue(card['revive'])
        server.sync_seaborn_aura(card,{'id':'chen'});self.assertNotIn('revive',card);self.assertNotIn('legacy',card);self.assertNotIn('seaborn_summon_growth',card)
        card['golden']=True;server.sync_seaborn_aura(card,c);self.assertEqual(card['legacy']['count'],4);self.assertEqual(card['seaborn_summon_growth'],2)
        server.sync_seaborn_aura(card,None);card['summoned_by_revival']=True;server.sync_seaborn_aura(card,c);self.assertFalse(server.has_revive(card))

    def test_seaborn_summon_logistics_and_distinct_monsters(self):
        c={'id':'skadi_alter','seaborn_upgrades':['summon_growth','monsters','revive']}
        unit=dict(self.card('Skadi Seaborn'),current_hp=2)
        ally=dict(self.card('Courier'),current_hp=1)
        token=server._battle_commanders.set({'left':c})
        try:
            server.sync_seaborn_aura(unit,c)
            events=[];server.trigger_sea_summon_buff(ally,1,'left',[unit,ally],events)
            self.assertEqual((unit['attack'],unit['max_hp']),(3,3))
            self.assertTrue(any(e.get('type')=='permanent_buff' for e in events))
            unit['_death_confirmed']=True
            server.trigger_sea_summon_buff(ally,1,'left',[unit,ally],[])
            self.assertEqual(unit['attack'],3)
            for count in [2,4]:
                with patch.object(server,'summon_unit_from_legacy') as summon:
                    server.trigger_legacy_effect(unit,0,'left',[],[],[],{'type':'summon_distinct_sea_monsters','count':count})
                    ids=[call.args[4] for call in summon.call_args_list]
                    self.assertEqual(len(ids),count);self.assertEqual(len(set(ids)),count)
            fresh=dict(self.card('Skadi Seaborn'),current_hp=2)
            server.sync_seaborn_aura(fresh,{'id':'skadi_alter','seaborn_upgrades':['logistics']})
            server.apply_logistics_effects([fresh],'left',[])
            self.assertEqual((fresh['attack'],fresh['max_hp']),(4,4))
        finally:server._battle_commanders.reset(token)

    def test_skill_shop_pool_return_and_atomic_exhaustion(self):
        room=server.arena_room('human');c={'id':'cannot','merchant_discount':10};room['seats'][0]['commander']=c
        card=self.card('Courier');target={'shop':[card,card],'hand_count':0}
        with server.db() as con:
            for i in range(server.POOL_COPIES[server.card_tier(card)]-1):
                con.execute("INSERT INTO shop_purchases(token,player_id,card_id) VALUES(?,?,?)",('stock'+str(i),'human',card['id']))
        before=server.player('human')
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=target)
        self.assertNotIn('skill_used_round',c)
        with server.db() as con:self.assertEqual(con.execute("SELECT COUNT(*) FROM shop_purchases WHERE source='skill'").fetchone()[0],0)
        result=server.use_commander_skill(room,'human',target={'shop':[card],'hand_count':0})
        self.assertEqual(server.player('human')['purchased_units'],before['purchased_units'])
        token=result['cards'][0]['pool_tokens'][0]
        with server.db() as con:self.assertEqual(con.execute('SELECT returned FROM shop_purchases WHERE token=?',(token,)).fetchone()[0],0)
        server.sell_unit(card['id'],'human',pool_tokens=[token,token])
        with server.db() as con:self.assertEqual(con.execute('SELECT returned FROM shop_purchases WHERE token=?',(token,)).fetchone()[0],1)

    def test_cannot_discount_bulk_gain_reset(self):
        room=server.arena_room('human');c={'id':'cannot'};room['seats'][0]['commander']=c
        server.commander_round_reward(room,'human');self.assertEqual(c['skill']['cost'],10)
        room['round']=2;server.commander_round_reward(room,'human');self.assertEqual(c['skill']['cost'],9)
        server.commander_round_reward(room,'human');self.assertEqual(c['skill']['cost'],9)
        with server.db() as con:con.execute("UPDATE players SET shop_level=5,gold=20 WHERE id='human'")
        room['round']=3;server.commander_round_reward(room,'human');self.assertEqual(c['skill']['cost'],7)
        card=dict(self.card('Courier'),attack=42,pool_tokens=['test'])
        target={'shop':[card,None,card],'hand_count':11}
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=target)
        self.assertEqual(server.player('human')['gold'],20)
        result=server.use_commander_skill(room,'human',target=dict(target,hand_count=10))
        self.assertEqual(result['spent'],7);self.assertEqual(result['indices'],[0,2]);self.assertEqual(len(result['cards']),2)
        self.assertTrue(all(u['attack']==42 and len(u['pool_tokens'])==1 for u in result['cards']))
        self.assertEqual(c['skill']['cost'],10)
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=target)
        server.commander_round_reward(room,'human');self.assertEqual(c['skill']['cost'],10)
        for rn in range(4,11):room['round']=rn;server.commander_round_reward(room,'human')
        self.assertEqual(c['skill']['cost'],0)
        result=server.use_commander_skill(room,'human',target=dict(target,hand_count=0));self.assertEqual(result['spent'],0)

    def test_russell_upgrade_caps_and_bloodbattle(self):
        room=server.arena_room('human');c={'id':'russell'};room['seats'][0]['commander']=c
        self.assertEqual(server.commander_upgrade(room,'human')['pending'],0)
        for level,choice in [(2,'attack'),(3,'attack'),(4,'health'),(5,'health')]:
            with server.db() as con:con.execute('UPDATE players SET shop_level=? WHERE id=?',(level,'human'))
            self.assertEqual(server.commander_upgrade(room,'human')['pending'],1)
            server.commander_upgrade(room,'human',choice)
        with server.db() as con:con.execute("UPDATE players SET shop_level=6 WHERE id='human'")
        self.assertEqual(server.commander_upgrade(room,'human')['pending'],0)
        with self.assertRaises(ValueError):server.commander_upgrade(room,'human','attack')
        unit=dict(self.card('Courier'),current_hp=10,max_hp=10,attack=10,legacy=None)
        token=server._battle_commanders.set({'left':c})
        try:
            events=[];server.resolve_bloodbattle(unit,0,'left',[unit],[],events)
            self.assertEqual((unit['attack'],unit['max_hp']),(13,13))
            self.assertTrue(any(e.get('type')=='permanent_buff' and e.get('from')=='统御号令' for e in events))
            unit['_death_confirmed']=True;server.resolve_bloodbattle(unit,0,'left',[unit],[],events)
            self.assertEqual(unit['attack'],13)
        finally:server._battle_commanders.reset(token)

    def test_justin_rewards_and_limits(self):
        room=server.arena_room('human');room['seats'][0]['commander']={'id':'justin'}
        room['round']=3
        self.assertEqual(server.commander_round_reward(room,'human')['fund_stage'],0)
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',choice='gold')
        room['round']=4;before=server.player('human')['gold']
        self.assertEqual(server.commander_round_reward(room,'human')['fund_stage'],1)
        result=server.use_commander_skill(room,'human',choice='gold')
        self.assertEqual(result['player']['gold'],before+3)
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',choice='gold')
        room['round']=7
        with server.db() as con:con.execute("UPDATE players SET shop_level=4 WHERE id='human'")
        result=server.use_commander_skill(room,'human',choice='units')
        self.assertEqual(len(result['cards']),2)
        self.assertTrue(all(server.card_tier(u)==4 and u['pool_tokens']==[] for u in result['cards']))
        room['round']=10;result=server.use_commander_skill(room,'human',choice='gold')
        self.assertEqual(result['gained'],9)
        self.assertEqual(server.commander_round_reward(room,'human')['fund_stage'],0)

    def test_necrass_draw_accelerates_unlock(self):
        room=server.arena_room('human');room['seats'][0]['commander']={'id':'necrass'};server.arena_save(room)
        self.submit_all(board=[]);server.arena_resolve('human',1)
        room=server.arena_room('human')
        self.assertEqual(room['seats'][0]['commander']['necrass_acceleration'],1)

    def test_necrass_unlock_once_and_acceleration(self):
        room=server.arena_room('human');c={'id':'necrass'};room['seats'][0]['commander']=c
        room['round']=10
        self.assertIsNone(server.commander_round_reward(room,'human')['card'])
        room['round']=11
        reward=server.commander_round_reward(room,'human')
        self.assertEqual(reward['card']['id'],'Necrass');self.assertEqual(reward['card']['faction'],'任意')
        self.assertEqual(c['skill']['name'],'折朽')
        self.assertIsNone(server.commander_round_reward(room,'human')['card'])
        room['round']=6;room['seats'][0]['commander']={'id':'necrass','necrass_acceleration':5}
        self.assertEqual(server.commander_round_reward(room,'human')['card']['id'],'Necrass')

    def test_necrass_shared_aura_and_summon_faction(self):
        commander={'id':'necrass','_shop_level':3};token=server._battle_commanders.set({'left':commander})
        try:
            unit=dict(self.card('Necrass'),current_hp=3);base=unit['attack'];events=[]
            server.apply_necrass_aura(unit,0,'left',events)
            self.assertEqual(unit['attack'],base+3)
            commander['necrass_awakened']=True
            server.apply_necrass_aura(unit,0,'left',events)
            self.assertEqual(unit['attack'],base+3);self.assertEqual(unit['faction'],'任意')
            commander['_shop_level']=4;server.apply_necrass_aura(unit,0,'left',events)
            self.assertEqual(unit['attack'],base+4)
            summoned=dict(self.card('Necrass'),current_hp=3)
            server.trigger_sea_summon_buff(summoned,0,'left',[summoned],[])
            self.assertEqual(summoned['faction'],'任意');self.assertEqual(summoned['attack'],base+4)
        finally:server._battle_commanders.reset(token)

    def test_jessica_unlock_discover_and_cost(self):
        room=server.arena_room('human');room['seats'][0]['commander']={'id':'jessica'}
        original=self.card('Courier');target={'zone':'shop','id':original['id']}
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=target)
        with server.db() as con:con.execute("UPDATE players SET shop_level=2,gold=8 WHERE id='human'")
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=dict(target,zone='board'))
        result=server.use_commander_skill(room,'human',target=target)
        self.assertTrue(result['removed']);self.assertEqual(server.player('human')['gold'],6)
        self.assertEqual(len(result['options']),3)
        for card in result['options']:
            self.assertNotEqual(card['id'],original['id']);self.assertLessEqual(server.card_tier(card),2)
            self.assertTrue(server.belongs_to_faction(card,original['faction']))
        pending=server.use_commander_skill(room,'human',target=target)
        self.assertEqual(pending['options'],result['options']);self.assertEqual(server.player('human')['gold'],6)
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',choice='invalid')
        claimed=server.use_commander_skill(room,'human',choice=result['options'][0]['id'])
        self.assertEqual(claimed['card']['pool_tokens'],[])
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=target)

    def test_yu_discovery_respects_shop_level(self):
        room=server.arena_room('human');room['seats'][0]['commander']={'id':'yu','isomorph_uses':3}
        with server.db() as con:con.execute("UPDATE players SET shop_level=2,gold=8 WHERE id='human'")
        result=server.use_commander_skill(room,'human')
        self.assertEqual(len(result['options']),3)
        self.assertTrue(all(server.card_tier(u)<=2 and u['golden'] for u in result['options']))

    def test_damazti_even_round_original_copy(self):
        room=server.arena_room('human');room['seats'][0]['commander']={'id':'damazti'}
        base=self.card('Courier');hand=[{'card_type':'skill'},dict(base,locked_until_round=6),dict(base,attack=100,max_hp=200,shield=True)]
        self.assertIsNone(server.use_commander_skill(room,'human',target={'hand':hand})['card'])
        room['round']=2
        result=server.use_commander_skill(room,'human',target={'hand':hand})
        self.assertEqual(result['index'],2);self.assertEqual(result['card']['attack'],1);self.assertEqual(result['card']['max_hp'],1)
        self.assertEqual(result['card'].get('shield'),base.get('shield'));self.assertEqual(result['card']['pool_tokens'],[])
        self.assertIsNone(server.use_commander_skill(room,'human',target={'hand':hand})['card'])
        room['round']=4
        self.assertIsNotNone(server.use_commander_skill(room,'human',target={'hand':hand})['card'])

    def test_tinman_upgrade_refresh_and_highest_buffed_card(self):
        room=server.arena_room('human');c={'id':'tinman','tinman_uses':8};room['seats'][0]['commander']=c
        low=dict(self.card('Courier'),tier=1,stars=1,attack=99,max_hp=99)
        high=dict(self.card('Courier'),tier=4,stars=4,attack=12,max_hp=15)
        target={'shop':[low,None,high],'hand_count':0}
        with patch.object(server.random,'choice',side_effect=lambda items:items[0]):
            first=server.use_commander_skill(room,'human',target=target)
        self.assertEqual(first['index'],0);self.assertTrue(c['tinman_upgraded']);self.assertIsNone(c['skill_used_round'])
        second=server.use_commander_skill(room,'human',target=target)
        self.assertEqual(second['index'],2);self.assertEqual(second['card']['attack'],24);self.assertEqual(second['card']['max_hp'],30)
        self.assertEqual(len(second['card']['pool_tokens']),1);self.assertEqual(server.player('human')['gold'],1)
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=target)
        room['round']+=1
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=dict(target,hand_count=12))
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=dict(target,shop=[]))
        self.assertEqual(server.player('human')['gold'],1)

    def test_goliath_survives_once_then_awakens(self):
        room=server.arena_room('human');room['seats'][0]['commander']={'id':'goliath'}
        room['seats'][0]['health']=1;server.arena_save(room)
        with server.db() as con:con.execute('UPDATE players SET health=1 WHERE id=?',('human',))
        unit=dict(self.card('Courier'),attack=40,max_hp=40,legacy=None)
        self.submit_all(board=[unit]);room=server.arena_room('human');room['seats'][0]['prepared']['board']=[];server.arena_save(room)
        server.arena_resolve('human',1);room=server.arena_room('human');seat=room['seats'][0]
        self.assertEqual(seat['health'],1);self.assertIsNone(seat['rank']);self.assertFalse(room['finished'])
        self.assertTrue(seat['commander']['lethal_immunity_used'])
        reward=server.commander_round_reward(room,'human')
        self.assertEqual(reward['goliath_buff'],8);self.assertTrue(seat['commander']['chen_activated'])
        self.assertEqual(seat['commander']['skill']['name'],'以己之长')
        self.assertNotIn('goliath_buff',server.commander_round_reward(room,'human'));server.arena_save(room)
        self.submit_all(round_number=2,board=[unit]);room=server.arena_room('human');room['seats'][0]['prepared']['board']=[];server.arena_save(room)
        server.arena_resolve('human',2);self.assertIsNotNone(server.arena_room('human')['seats'][0]['rank'])

    def test_goliath_activated_chen_aura(self):
        unit=dict(self.card('Courier'),attack=3,max_hp=20,current_hp=20,legacy=None)
        commander={'id':'goliath','chen_activated':True,'_shop_level':3};token=server._battle_commanders.set({'left':commander})
        try:
            server.apply_chen_aura(unit,0,'left',[])
            self.assertTrue(unit['_chen_aura']);self.assertEqual(unit['attack'],6)
        finally:server._battle_commanders.reset(token)

    def test_damazti_four_paid_uses_discover_and_repeat(self):
        room=server.arena_room('human');seat=room['seats'][0];seat['commander']={'id':'yu'}
        server.gain_gold(10,'human');initial=server.player('human')['gold']
        for use in range(1,9):
            room['round']=use
            result=server.use_commander_skill(room,'human')
            self.assertEqual(server.player('human')['gold'],initial-use)
            self.assertEqual(result['commander']['isomorph_uses'],use)
            if use%4:
                self.assertEqual(result['options'],[])
            else:
                options=result['options'];self.assertEqual(len(options),3)
                self.assertEqual(len({u['id'] for u in options}),3)
                self.assertTrue(all(u['golden'] and server.card_tier(u)==1 for u in options))
                self.assertEqual(server.use_commander_skill(room,'human')['options'],options)
                self.assertEqual(server.player('human')['gold'],initial-use)
                result=server.use_commander_skill(room,'human',choice=options[0]['id'])
                self.assertEqual(result['spent'],0);self.assertEqual(result['card'],options[0])
                with self.assertRaises(ValueError):server.use_commander_skill(room,'human',choice=options[0]['id'])
            with self.assertRaises(ValueError):server.use_commander_skill(room,'human')
        room['round']=9
        with server.db() as con:con.execute('UPDATE players SET gold=0 WHERE id=?',('human',))
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human')
        self.assertEqual(seat['commander']['isomorph_uses'],8)

    def test_muelsyse_discover_locked_golden_reward(self):
        room=server.arena_room('human');seat=room['seats'][0];seat['commander']={'id':'muelsyse'}
        result=server.commander_round_reward(room,'human');options=result['condensation_options']
        self.assertEqual(len(options),3);self.assertEqual(len({u['id'] for u in options}),3)
        self.assertEqual(server.commander_round_reward(room,'human')['condensation_options'],options)
        for unit in options:
            base=server.card_by_id(unit['id'])
            self.assertEqual(server.card_tier(unit),4);self.assertTrue(unit['golden'])
            self.assertEqual(unit['attack'],base['attack']*2+10)
            self.assertEqual(unit['max_hp'],base['max_hp']*2+10)
            self.assertEqual(unit['locked_until_round'],6);self.assertEqual(unit['pool_tokens'],[])
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',choice='invalid')
        chosen=server.use_commander_skill(room,'human',choice=options[0]['id'])['card']
        self.assertEqual(chosen,options[0])
        self.assertNotIn('condensation_options',server.commander_round_reward(room,'human'))
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',choice=options[0]['id'])

    def test_shamare_exchange_once_normal_only(self):
        room=server.arena_room('human');seat=room['seats'][0];seat['commander']={'id':'shamare'}
        unit=self.card('Courier');target={'unit':dict(unit,golden=True),'shop':[unit]}
        self.assertFalse(server.use_commander_skill(room,'human',target=target)['exchanged'])
        target['unit']=unit;gold=server.player('human')['gold']
        result=server.use_commander_skill(room,'human',target=target)
        self.assertTrue(result['exchanged']);self.assertEqual(len(result['card']['pool_tokens']),1)
        self.assertEqual(server.player('human')['gold'],gold)
        self.assertFalse(server.use_commander_skill(room,'human',target=target)['exchanged'])
        room['round']+=1
        self.assertTrue(server.use_commander_skill(room,'human',target=target)['exchanged'])

    def test_calendar_upgrade_discount_and_equal_copy_draw(self):
        self.assertEqual([server.round_upgrade_discount(r) for r in range(2,8)],[2,2,2,3,3,3])
        self.assertEqual(server.SHOP_UPGRADE_BASE_COSTS,[5,9,12,14,15])
        low=dict(self.card('Courier'),id='low',stars=1,tier=1)
        high=dict(low,id='high',stars=2,tier=2)
        with server.db() as con:con.execute('UPDATE players SET shop_level=2 WHERE id=?',('human',))
        with patch.object(server,'cards',return_value=[low,high]),patch.object(server,'player_match_factions',return_value=None),patch.object(server.random,'choices',return_value=[low]) as draw:
            server.shop(1,'human')
            self.assertEqual(draw.call_args.kwargs['weights'],[12,11])

    def test_kaltsit_spending_and_board_only(self):
        room=server.arena_room('human');seat=room['seats'][0];seat['commander']={'id':'kaltsit'}
        target={'zone':'board','id':self.card('Courier')['id']}
        for spent,amount in [(0,1),(6,1),(7,2),(14,3)]:
            with server.db() as con:con.execute('UPDATE players SET total_gold_spent=? WHERE id=?',(spent,'human'))
            self.assertEqual(server.use_commander_skill(room,'human',target=target)['amount'],amount)
            with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=target)
            room['round']+=1
        for zone in ('shop','bench'):
            with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=dict(target,zone=zone))

    def test_kaltsit_wild_faction_restore_preserves_buffs(self):
        unit=dict(self.card('Courier'),faction='任意',_kaltsit_original_faction='谢拉格',_kaltsit_expires=2,attack=12,max_hp=18,revive=True,shield=True,lock_hp=True)
        for faction in ('拉特兰','阿戈尔','卡西米尔'):
            self.assertTrue(server.belongs_to_faction(unit,faction))
        restored=server.arena_restore([unit],{'persistent_left':[dict(unit,attack=20)],'left':[None]})[0]
        self.assertEqual(restored['faction'],'谢拉格');self.assertEqual(restored['attack'],20)
        self.assertTrue(all(restored[k] for k in ('revive','shield','lock_hp')))
        self.assertNotIn('_kaltsit_original_faction',restored)

    def test_qalaisa_scaling_targets_and_once_per_round(self):
        room=server.arena_room('human');seat=room['seats'][0]
        seat['commander']={'id':'qalaisa','death_count':6}
        target={'zone':'board','id':self.card('Courier')['id']}
        result=server.use_commander_skill(room,'human',target=target)
        self.assertEqual(result['amount'],1)
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=target)
        room['round']+=1;seat['commander']['death_count']=14
        server.gain_gold(99,'human');server.upgrade_shop('human')
        target['zone']='shop'
        self.assertEqual(server.use_commander_skill(room,'human',target=target)['amount'],4)
        room['round']+=1;target['zone']='bench'
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target=target)
        self.assertNotEqual(seat['commander']['skill_used_round'],room['round'])

    def test_qalaisa_both_sides_deaths_persist_once(self):
        room=server.arena_room('human');room['seats'][0]['commander']={'id':'qalaisa','death_count':6};server.arena_save(room)
        unit=dict(self.card('Courier'),attack=1,max_hp=1,legacy=None)
        self.submit_all(board=[unit])
        server.arena_resolve('human',1)
        self.assertEqual(server.arena_room('human')['seats'][0]['commander']['death_count'],8)
        server.arena_resolve('human',1)
        self.assertEqual(server.arena_room('human')['seats'][0]['commander']['death_count'],8)

    def test_ermengard_confirmed_deaths_and_exact_shop_tier(self):
        commander={'id':'ermengard','death_count':6,'_shop_level':3}
        token=server._battle_commanders.set({'left':commander})
        events=[]
        try:
            for n in range(8):
                dead=dict(self.card('Courier'),legacy=None,current_hp=0)
                team=[dead]
                server.handle_unit_death(dead,0,'left',team,[],events)
                server.handle_unit_death(dead,0,'left',team,[],events)
            rewards=[e for e in events if e.get('source_effect')=='commander_deaths']
            self.assertEqual(commander['death_count'],14)
            self.assertEqual(len(rewards),2)
            self.assertTrue(all(server.card_tier(e['card'])==3 for e in rewards))
            self.assertTrue(all(not e['card'].get('summon_only') for e in rewards))
            alive=dict(self.card('Courier'),legacy=None,current_hp=1)
            server.handle_unit_death(alive,0,'left',[alive],[],events)
            enemy=dict(self.card('Courier'),legacy=None,current_hp=0)
            server.handle_unit_death(enemy,0,'right',[enemy],[],events)
            self.assertEqual(commander['death_count'],14)
        finally:server._battle_commanders.reset(token)

    def test_ermengard_counter_persists_once_per_round(self):
        room=server.arena_room('human')
        room['seats'][0]['commander']={'id':'ermengard','death_count':6}
        server.arena_save(room)
        self.submit_all(board=[])
        room=server.arena_room('human')
        room['seats'][0]['prepared']['board']=[dict(self.card('Courier'),attack=0,max_hp=1,legacy=None)]
        for seat in room['seats'][1:]:
            seat['prepared']['board']=[dict(self.card('Courier'),attack=20,max_hp=50,legacy=None)]
        server.arena_save(room)
        server.arena_resolve('human',1)
        self.assertEqual(server.arena_room('human')['seats'][0]['commander']['death_count'],7)
        server.arena_resolve('human',1)
        self.assertEqual(server.arena_room('human')['seats'][0]['commander']['death_count'],7)

    def test_mlynar_purchase_income_cap_and_reset(self):
        room=server.arena_room('human')
        room['seats'][0]['commander']=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='mlynar'))
        server.arena_save(room)
        card=next(u for u in server.unit_cards_from_db() if u.get('faction')=='卡西米尔' and server.card_tier(u)==1)
        server.gain_gold(20,'human')
        for _ in range(4):server.buy_card(card['id'],'human')
        gold=server.player('human')['gold']
        self.submit_all(board=[]);server.arena_resolve('human',1)
        self.assertEqual(server.player('human')['gold'],gold+server.round_income(1)+3)
        self.submit_all(round_number=2,board=[]);server.arena_resolve('human',2)
        self.assertEqual(server.player('human')['gold'],gold+server.round_income(1)+3+server.round_income(2))
        self.assertNotIn('mlynar',[c['id'] for c in server.available_commanders(server.COMMANDERS,['卡西米尔'])])

    def test_clementia_death_stars_any_faction_and_later_summons(self):
        def unit(faction,stars=1):return dict(self.card('Courier'),faction=faction,stars=stars,tier=stars,attack=2,max_hp=20,current_hp=20,legacy=None)
        dead=unit('任意',4);dead['current_hp']=0
        ally=unit('阿戈尔');wild=unit('任意');other=unit('炎')
        team=[dead,ally,wild,other];events=[]
        commander={'id':'clementia'};token=server._battle_commanders.set({'left':commander})
        try:
            server.handle_unit_death(dead,0,'left',team,[],events)
            self.assertEqual([u['attack'] for u in (ally,wild,other)],[6,6,2])
            server.handle_unit_death(dead,0,'left',team,[],events)
            self.assertEqual(commander['_clementia_attack'],4)
            summon=unit('阿戈尔');team[0]=summon
            server.trigger_sea_summon_buff(summon,0,'left',team,events)
            self.assertEqual(summon['attack'],6)
            other['current_hp']=0;server.handle_unit_death(other,3,'left',team,[],events)
            self.assertEqual(commander['_clementia_attack'],4)
            summon['current_hp']=0;server.handle_unit_death(summon,0,'left',team,[],events)
            self.assertEqual(ally['attack'],7)
        finally:server._battle_commanders.reset(token)
        self.assertNotIn('clementia',[c['id'] for c in server.available_commanders(server.COMMANDERS,['阿戈尔'])])

    def test_clementia_battle_aura_expires(self):
        dead=dict(self.card('Courier'),faction='阿戈尔',attack=0,max_hp=1,legacy=None)
        ally=dict(self.card('Courier'),faction='阿戈尔',attack=2,max_hp=200,legacy=None)
        enemy=dict(self.card('Courier'),attack=2,max_hp=100,legacy=None)
        with patch.object(server,'first_striker',return_value='right'):
            result=server.tavern_battle([dead,ally],[enemy],commanders={'left':{'id':'clementia'}})
        self.assertTrue(any(e.get('source_effect')=='clementia_aura' for e in result['events']))
        self.assertEqual(result['persistent_left'][1]['attack'],2)
        self.assertEqual(ally['attack'],2)

    def test_dobermann_aura_no_morale_or_persistent_gain(self):
        unit=dict(self.card('Courier'),attack=2,max_hp=100,legacy=None,morale={'attack':9,'max_hp':9},_dobermann_aura=3)
        unit['attack']+=3
        enemy=dict(self.card('Courier'),attack=0,max_hp=100,legacy=None)
        result=server.tavern_battle([unit],[enemy],round_number=4,commanders={'left':{'id':'dobermann','victories':2}})
        aura=next(e for e in result['events'] if e.get('source_effect')=='dobermann_aura')
        self.assertEqual(aura['attack'],8)
        self.assertEqual(aura['max_hp'],100)
        self.assertEqual(result['persistent_left'][0]['attack'],2)
        restored=server.arena_restore([unit],result)[0]
        self.assertEqual(restored['attack'],2)
        self.assertNotIn('_dobermann_aura',restored)

    def test_dobermann_counts_wins_once(self):
        room=server.arena_room('human')
        room['seats'][0]['commander']=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='dobermann'))
        server.arena_save(room)
        self.submit_all(board=[])
        room=server.arena_room('human')
        room['seats'][0]['prepared']['board']=[dict(self.card('Courier'),attack=50,max_hp=100)]
        server.arena_save(room)
        server.arena_resolve('human',1)
        self.assertEqual(server.arena_room('human')['seats'][0]['commander']['victories'],1)
        server.arena_resolve('human',1)
        self.assertEqual(server.arena_room('human')['seats'][0]['commander']['victories'],1)

    def test_quintus_transform_and_harold_restriction(self):
        room=server.arena_room('human');seat=room['seats'][0]
        seat['commander']=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='quintus'))
        source=self.card('Courier');base=dict(source,id='upgraded',stars=2,tier=2,attack=3,max_hp=4)
        with patch.object(server,'unit_cards_from_db',return_value=[source,base]),patch.object(server,'player_match_factions',return_value=None):
            for zone in ('board','shop'):
                seat['commander'].pop('skill_used_round',None)
                result=server.use_commander_skill(room,'human',target={'zone':zone,'id':source['id']})
                self.assertEqual(result['card']['attack'],3)
                self.assertEqual(result['card']['max_hp'],4)
                self.assertFalse(result['card'].get('golden'))
                self.assertEqual(result['card']['pool_tokens'],[])
                self.assertEqual(bool(result['card'].get('shop_limit_bypass')),zone=='shop')
                with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target={'zone':zone,'id':source['id']})
        seat['commander'].pop('skill_used_round',None)
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target={'zone':'bench','id':source['id']})
        with patch.object(server,'card_by_id',return_value=dict(source,stars=6,tier=6)):
            with self.assertRaises(ValueError):server.use_commander_skill(room,'human',target={'zone':'board','id':source['id']})
        self.assertNotIn('skill_used_round',seat['commander'])
        self.assertNotIn('harold',[c['id'] for c in server.available_commanders(server.COMMANDERS,['维多利亚'])])
        self.assertIn('harold',[c['id'] for c in server.available_commanders(server.COMMANDERS,[])])

    def test_chen_aura_first_attack_and_no_permanent_leak(self):
        unit=dict(self.card('Courier'),attack=2,max_hp=100,legacy=None,combo=True)
        enemy=dict(self.card('Courier'),attack=0,max_hp=100,legacy=None)
        result=server.tavern_battle([unit],[enemy],shop_level=3,commanders={'left':{'id':'chen'}})
        buffs=[e for e in result['events'] if e.get('source_effect')=='chen_first_attack']
        self.assertEqual(len(buffs),1)
        self.assertEqual(buffs[0]['attack'],10)
        hits=[e for e in result['events'] if e.get('damage_type')=='collision' and e.get('side')=='left']
        self.assertTrue(len(hits)>1)
        self.assertTrue(all(e['damage']==10 for e in hits))
        self.assertEqual(result['persistent_left'][0]['attack'],2)
        self.assertEqual(unit['attack'],2)

    def test_chen_summon_aura_and_enemy_level(self):
        unit=dict(self.card('Courier'),attack=2,max_hp=20,current_hp=20)
        token=server._battle_commanders.set({'right':{'id':'chen','_shop_level':5}})
        try:
            events=[];server.trigger_sea_summon_buff(unit,0,'right',[unit],events)
            self.assertEqual(unit['attack'],7)
            server.apply_chen_aura(unit,0,'right',events)
            self.assertEqual(unit['attack'],7)
            other=dict(self.card('Courier'),attack=2,max_hp=20,current_hp=20)
            server.apply_chen_aura(other,0,'left',events)
            self.assertEqual(other['attack'],2)
        finally:server._battle_commanders.reset(token)

    def test_harold_even_round_victoria_reward(self):
        room=server.arena_room('human')
        seat=room['seats'][0]
        seat['commander']=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='harold'))
        victoria=dict(self.card('Courier'),id='victoria-test',faction='维多利亚')
        invalid=[dict(victoria,summon_only=True),dict(victoria,cannot_gain=True),self.card('Courier')]
        with patch.object(server,'unit_cards_from_db',return_value=invalid+[victoria]):
            for rn in range(1,11):
                room['round']=rn
                reward=server.commander_round_reward(room,'human')['card']
                if rn>=4 and rn%2==0:
                    self.assertEqual(reward['id'],'victoria-test')
                    self.assertIsNot(reward,victoria)
                else:self.assertIsNone(reward)
                self.assertIsNone(server.commander_round_reward(room,'human')['card'])
            room['round']=12;seat['rank']=8
            self.assertIsNone(server.commander_round_reward(room,'human')['card'])
            seat['rank']=None;seat['prepared']={}
            self.assertIsNone(server.commander_round_reward(room,'human')['card'])
            seat['prepared']=None
        with patch.object(server,'unit_cards_from_db',return_value=[]):
            self.assertIsNone(server.commander_round_reward(room,'human')['card'])
        self.assertEqual(seat['commander']['victoria_reward_round'],10)

    def test_lee_escrow_and_third_round_reward(self):
        room=server.arena_room('human')
        room['seats'][0]['commander']=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='lee'))
        reward=server.commander_round_reward(room,'human');server.arena_save(room)
        self.assertEqual(reward['player']['gold'],0)
        self.assertEqual(server.player('human')['next_income'],0)
        server.commander_round_reward(room,'human')
        self.assertEqual(server.player('human')['gold'],0)
        server.gain_gold(2,'human')
        self.submit_all(board=[]);server.arena_resolve('human',1)
        self.assertEqual(server.player('human')['gold'],2)
        self.assertEqual(server.player('human')['next_income'],12)
        room=server.arena_room('human')
        self.assertEqual(server.commander_round_reward(room,'human')['cards'],[])
        self.submit_all(round_number=2,board=[]);server.arena_resolve('human',2)
        room=server.arena_room('human');reward=server.commander_round_reward(room,'human');server.arena_save(room)
        self.assertEqual(reward['player']['gold'],14) # 3+4+5 base gold, plus 2 extra.
        self.assertEqual(sorted(server.card_tier(c) for c in reward['cards']),[2,4])
        self.assertTrue(all(not c.get('pool_tokens') for c in reward['cards']))
        self.assertEqual(server.commander_round_reward(room,'human')['cards'],[])
        self.assertEqual(server.player('human')['gold'],14)
        self.submit_all(round_number=3,board=[]);server.arena_resolve('human',3)
        self.assertEqual(server.player('human')['gold'],20)

    def test_emperor_edges_scaling_and_single_unit(self):
        for count in (1,3):
            team=[dict(self.card('Courier'),current_hp=3,max_hp=3,attack=2,legacy=None) for _ in range(count)]
            team[0]['raid']={'hits':2}
            events=[];server.commander_expedite({'id':'emperor'},'left',team,[],6,events)
            self.assertEqual(team[0]['raid']['hits'],2)
            self.assertEqual(team[0]['attack'],8)
            self.assertEqual(team[-1]['attack'],8)
            if count==3:self.assertEqual(team[1]['attack'],2);self.assertNotIn('raid',team[1])
            self.assertEqual(len([e for e in events if e.get('source_effect')=='commander_expedite']),min(count,2))

    def test_emperor_raid_preserves_initiative_and_is_temporary(self):
        unit=dict(self.card('Courier'),attack=2,max_hp=100,legacy=None,initiative={'type':'team_buff','attack':1,'max_hp':1})
        enemy=dict(self.card('Courier'),attack=0,max_hp=20,legacy=None)
        result=server.tavern_battle([unit],[enemy],round_number=3,commanders={'left':{'id':'emperor','name':'大帝'}})
        self.assertTrue(any(e.get('source_effect')=='raid' for e in result['events']))
        self.assertTrue(any(e.get('source_effect')=='initiative' for e in result['events']))
        self.assertNotIn('raid',result['persistent_left'][0])
        self.assertEqual(result['persistent_left'][0]['attack'],3)

    def test_orchid_active_refresh_and_round_reward(self):
        room=server.arena_room('human')
        c=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='orchid'))
        room['seats'][0]['commander']=c;server.arena_save(room)
        for free in (False,True,True):
            result=server.refresh_shop('human',free=free)
            self.assertEqual(result['shop'][0]['id'],result['shop'][1]['id'])
            self.assertIsNot(result['shop'][0],result['shop'][1])
            self.assertEqual(result['spent'],0 if free else 1)
        room['round']=9
        self.assertIsNone(server.commander_round_reward(room,'human')['card'])
        room['round']=10
        self.assertEqual(server.commander_round_reward(room,'human')['card']['id'],'self_repair')
        self.assertIsNone(server.commander_round_reward(room,'human')['card'])
        room['round']=11
        self.assertIsNone(server.commander_round_reward(room,'human')['card'])

    def test_orchid_pair_respects_pool_supply(self):
        unit=dict(self.card('Courier'),id='pair-test',stars=1,tier=1)
        with patch.object(server,'cards',return_value=[unit]),patch.object(server,'player_match_factions',return_value=None),patch.dict(server.POOL_COPIES,{1:2}):
            result=server.shop(4,'human',guaranteed_pair=True)
            self.assertEqual(sum(c is not None for c in result),2)
            self.assertEqual(result[0]['id'],result[1]['id'])
        with patch.object(server,'cards',return_value=[unit]),patch.object(server,'player_match_factions',return_value=None),patch.dict(server.POOL_COPIES,{1:1}):
            result=server.shop(4,'human',guaranteed_pair=True)
            self.assertEqual(sum(c is not None for c in result),1)

    def test_confessor_choice_round_limit_and_spending(self):
        c=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='confessor'))
        room=server.arena_room('human');room['seats'][0]['commander']=c
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',choice='invalid')
        with patch.object(server,'player',return_value={'total_gold_spent':17}):
            result=server.use_commander_skill(room,'human',choice='middle')
        self.assertEqual(result['spent'],0);self.assertEqual(c['gold_spent'],17)
        self.assertEqual(c['examiner_mode'],'middle')
        with self.assertRaises(ValueError):server.use_commander_skill(room,'human',choice='left')
        room['round']=2
        server.use_commander_skill(room,'human',choice='right')
        self.assertEqual(c['examiner_mode'],'right')

    def test_confessor_three_targets_and_damage_thresholds(self):
        for count,mode,slots,spent,damage in [(7,'left',[1,2,3],7,3),(7,'middle',[3,4,5],8,5),(7,'right',[5,6,7],16,7),(6,'middle',[2,3,4],0,3),(2,'right',[1,2],0,3)]:
            left=[dict(self.card('Courier'),attack=10000,max_hp=10000,legacy=None)]
            right=[dict(self.card('Courier'),attack=0,max_hp=100,legacy=None) for _ in range(count)]
            c=dict(id='confessor',name='信仰搅拌机',skill_used_round=1,examiner_mode=mode,gold_spent=spent)
            result=server.tavern_battle(left,right,round_number=1,commanders={'left':c})
            shots=[e for e in result['events'] if e.get('source_effect')=='commander_initiative' and e.get('damage_type')=='bullet']
            self.assertEqual([e['to_slot'] for e in shots],slots)
            self.assertTrue(all(e['damage']==damage for e in shots))
            c['skill_used_round']=0
            stale=server.tavern_battle(left,right,round_number=1,commanders={'left':c})
            self.assertFalse(any(e.get('source_effect')=='commander_initiative' for e in stale['events']))

    def test_emergency_grant_choices_and_repeat_protection(self):
        room=server.arena_room('human')
        server.grant_emergency_support(room)
        self.assertNotIn('emergency_granted',room)
        for i,seat in enumerate(room['seats']):
            if i>=4:seat.update(rank=i+1,health=0)
        server.grant_emergency_support(room)
        for seat in room['seats']:
            result=server.commander_round_reward(room,seat['id'])
            self.assertEqual(len(result['cards']),1 if seat['rank'] is None else 0)
            if seat['rank'] is None:
                reward=result['cards'][0]
                self.assertTrue(reward['hand_limit_exempt'])
                self.assertEqual(len(reward['options']),4)
                self.assertTrue(all(c['hand_limit_exempt'] for c in reward['options']))
            self.assertEqual(server.commander_round_reward(room,seat['id'])['cards'],[])
        server.grant_emergency_support(room)
        self.assertEqual(room['seats'][0]['emergency_state'],'issued')
        pid=room['seats'][0]['id'];before=server.player(pid)['gold']
        server.use_emergency_card(room,pid,'precision_drop')
        server.use_emergency_card(room,pid,'precision_drop')
        self.assertEqual(server.player(pid)['gold'],before+4)
        with self.assertRaises(ValueError):server.use_emergency_card(room,pid,'precision_drop')
        special={'emergency_boost','precision_drop','tactical_delivery','life_equation','budget_saving'}
        self.assertFalse(any(c['id'] in special for c in server.cards()))

    def test_emergency_delivery_and_recurring_income(self):
        room=server.arena_room('human');seat=room['seats'][0];seat['emergency_state']='issued'
        server.use_emergency_card(room,'human','tactical_delivery')
        with self.assertRaises(ValueError):server.use_emergency_card(room,'human','tactical_delivery','not-a-card')
        unit=server.use_emergency_card(room,'human','tactical_delivery','Courier')['card']
        self.assertEqual(unit['locked_until_round'],2)
        self.assertTrue(unit['hand_limit_exempt']);self.assertNotIn('pool_tokens',unit)
        seat['emergency_state']='issued'
        server.use_emergency_card(room,'human','budget_saving')
        before=server.player('human')['gold']
        server.use_emergency_card(room,'human','budget_saving');server.arena_save(room)
        self.assertEqual(server.player('human')['gold'],before+2)
        self.assertEqual(server.player('human')['next_income'],server.round_income(1)+1)
        for rn in (1,2):
            self.submit_all(board=[],round_number=rn)
            before=server.player('human')['gold']
            server.arena_resolve('human',rn)
            self.assertEqual(server.player('human')['gold']-before,server.round_income(rn)+1)

    def test_delivery_skill_target_and_once_per_round(self):
        c=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='exusiai_alter'))
        room=dict(finished=False,round=1,seats=[dict(id='p',rank=None,prepared=None,commander=c)])
        with self.assertRaises(ValueError):server.use_commander_skill(room,'p')
        result=server.use_commander_skill(room,'p',target='chosen')
        self.assertEqual(result['spent'],0);self.assertEqual(c['delivery_target'],'chosen')
        with self.assertRaises(ValueError):server.use_commander_skill(room,'p',target='other')
        room['round']=2;server.use_commander_skill(room,'p',target='other')
        self.assertEqual(c['delivery_target'],'other')

    def test_delivery_returns_once_and_keeps_permanent_buff(self):
        unit=dict(self.card('Courier'),delivery_target_key='chosen',legacy=None,initiative={'type':'leftmost_set_hp','count':1})
        commander=dict(id='exusiai_alter',name='新约能天使',skill_used_round=1,delivery_target='chosen')
        ally=dict(self.card('Tin Man'),initiative_multiplier=3)
        result=server.tavern_battle([unit,ally],[dict(self.card('Courier'),attack=0,max_hp=80,legacy=None)],commanders={'left':commander})
        self.assertEqual(sum(e.get('type')=='delivery_store' for e in result['events']),1)
        self.assertEqual(sum(e.get('type')=='delivery_return' for e in result['events']),1)
        self.assertEqual(result['persistent_left'][0]['attack'],unit['attack']+1)
        self.assertEqual(result['persistent_left'][0]['max_hp'],unit['max_hp']+1)
        self.assertFalse(any(e.get('type')=='set_hp' and e.get('side')=='right' for e in result['events']))

    def test_delivery_waits_for_space_and_maps_permanent_gains(self):
        team=[dict(self.card('Courier'),current_hp=100,legacy=None,battle_position=i) for i in range(7)]
        selected=team[3];selected.update(delivery_target_key='chosen',revive=True,legacy={'type':'summon','summon_id':'Seaborn Slider','count':2})
        snapshot=copy.deepcopy(team);events=[];token=server._waiting_summons.set([])
        try:
            # Supply a known summon template so this test does not depend on roster naming.
            with patch.object(server,'card_by_id',return_value=dict(self.card('Courier'),legacy=None)):
                server.commander_delivery({'delivery_target':'chosen'},'left',team,[],events)
            server.drain_waiting_summons(events)
            self.assertNotIn(selected,[u for u in team if u is selected])
            self.assertFalse(any(e.get('type')=='delivery_return' for e in events))
            self.assertEqual(sum(e.get('type')=='death' for e in events),1)
            self.assertFalse(any(e.get('type')=='revive' for e in events))
            # Another slot opens, so return there but retain the original spatial position.
            team[0]=None;events.append(dict(type='death',side='left',slot=1))
            server.drain_waiting_summons(events)
            self.assertIsNot(team[0],selected);self.assertEqual(team[0]['battle_position'],3)
            self.assertTrue(team[0]['revive']);self.assertGreater(team[0]['current_hp'],0)
            self.assertFalse(any(e.get('type')=='revive' for e in events),'failed revival must not be queued')
            server.apply_persistent_battle_gains(snapshot,events)
            self.assertEqual(snapshot[3]['attack'],self.card('Courier')['attack']+1)
            self.assertEqual(snapshot[0]['attack'],self.card('Courier')['attack'])
            server.drain_waiting_summons(events)
            self.assertEqual(sum(e.get('type')=='delivery_return' for e in events),1)
        finally:server._waiting_summons.reset(token)

    def test_delivery_finishes_logos_legacies_before_return(self):
        unit=dict(self.card('Courier'),current_hp=5,delivery_target_key='chosen',legacy={'type':'summon','summon_id':'test','count':1})
        logos=dict(self.card('Logos'),current_hp=8,legacy_multiplier=2)
        team=[unit,logos]+[None]*5;events=[];token=server._waiting_summons.set([])
        try:
            with patch.object(server,'card_by_id',return_value=dict(self.card('Courier'),legacy=None)):
                server.commander_delivery({'delivery_target':'chosen'},'left',team,[],events)
            self.assertEqual(sum(e.get('type')=='summon' for e in events),2)
            self.assertFalse(any(e.get('type')=='delivery_return' for e in events))
            server.drain_waiting_summons(events)
            returned=next(i for i,e in enumerate(events) if e.get('type')=='delivery_return')
            self.assertTrue(all(i<returned for i,e in enumerate(events) if e.get('type')=='summon'))
            self.assertEqual(sum(bool(u and u.get('delivery_target_key')=='chosen') for u in team),1)
        finally:server._waiting_summons.reset(token)

    def test_delivery_death_revives_after_legacy_before_delivery_return(self):
        unit=dict(self.card('Courier'),current_hp=5,delivery_target_key='chosen',revive=True,legacy={'type':'summon','summon_id':'test','count':1})
        team=[unit]+[None]*6;events=[];token=server._waiting_summons.set([])
        try:
            with patch.object(server,'card_by_id',return_value=dict(self.card('Courier'),legacy=None)):
                server.commander_delivery({'delivery_target':'chosen'},'left',team,[],events)
            kinds=[e.get('type') for e in events]
            self.assertLess(kinds.index('death'),kinds.index('summon'))
            self.assertLess(kinds.index('summon'),kinds.index('revive'))
            self.assertNotIn('delivery_return',kinds)
            revived=next(e['unit'] for e in events if e.get('type')=='revive')
            self.assertFalse(server.has_revive(revived))
            self.assertEqual(revived['attack'],self.card('Courier')['attack'])
            server.drain_waiting_summons(events)
            self.assertEqual(sum(e.get('type')=='revive' for e in events),1)
            self.assertEqual(sum(e.get('type')=='delivery_return' for e in events),1)
        finally:server._waiting_summons.reset(token)

    def test_commander_overflow_hand_can_enter_battle(self):
        seat=dict(id='p',number=0,rank=None,commander=None,prepared=None)
        room=dict(finished=False,round=7,seats=[seat])
        hand=[dict(id='ordinary') for _ in range(12)]+[dict(id='reward',hand_limit_exempt=True)]
        with patch.object(server,'arena_room',return_value=room),patch.object(server,'arena_save'):
            self.assertTrue(server.arena_submit('p',dict(round=7,board=[],bench=hand))['ok'])
            with self.assertRaises(ValueError):server.arena_submit('p',dict(round=7,board=[],bench=hand+[dict(id='ordinary')]))
            # Empty overflow slots must not prevent subsequent battle submissions.
            self.assertTrue(server.arena_submit('p',dict(round=7,board=[],bench=[None]*15))['ok'])

    def test_angel_blessing_wait_reward_and_alternation(self):
        for kind,delay in [('X',1),('Y',2),('Z',3)]:
            c=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='fiammetta'))
            room=dict(finished=False,round=4,commanders_ready=True,seats=[dict(id='p',rank=None,prepared=None,commander=c)])
            self.assertEqual(server.use_commander_skill(room,'p')['options'],['X','Y','Z'])
            chosen=server.use_commander_skill(room,'p',kind)
            self.assertEqual(chosen['spent'],0)
            self.assertEqual(chosen['card']['due_round'],4+delay)
            self.assertTrue(chosen['card']['hand_limit_exempt'])
            with self.assertRaises(ValueError):server.use_commander_skill(room,'p','X')
            for round_number in range(4,4+delay):
                room['round']=round_number
                self.assertIsNone(server.commander_round_reward(room,'p')['card'])
            room['round']=4+delay
            reward=server.commander_round_reward(room,'p')
            self.assertEqual(reward['card']['blessing_kind'],kind)
            self.assertTrue(reward['reselect']);self.assertTrue(reward['card']['hand_limit_exempt'])
            self.assertIsNone(server.commander_round_reward(room,'p')['card'])
            with self.assertRaises(ValueError):server.use_commander_skill(room,'p',kind)
            next_kind=next(x for x in ('X','Y','Z') if x!=kind)
            server.use_commander_skill(room,'p',next_kind)
            self.assertEqual(c['blessing_pending']['due'],room['round']+{'X':1,'Y':2,'Z':3}[next_kind])

    @patch.object(server,'player',return_value={'total_gold_spent':54})
    def test_paganini_spending_golden_reward(self, player_state):
        c=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='paganini'))
        room=dict(finished=False,round=6,seats=[dict(id='p',rank=None,prepared=None,commander=c)])
        self.assertIsNone(server.commander_round_reward(room,'p')['card'])
        player_state.return_value={'total_gold_spent':55}
        observed=[]
        def choose(pool):
            observed.extend(pool)
            return next(u for u in pool if u['name']=='凯尔希')
        with patch.object(server.random,'choice',side_effect=choose):
            card=server.commander_round_reward(room,'p')['card']
        self.assertTrue(card['golden']);self.assertEqual(card['name'],'凯尔希')
        base=next(u for u in observed if u['name']=='凯尔希')
        self.assertEqual(card['attack'],base['attack']*2);self.assertEqual(card['max_hp'],base['max_hp']*2)
        self.assertTrue(all(u['faction'] in ('拉特兰','任意') and u['stars']>=4 and not u.get('summon_only') for u in observed))
        self.assertNotIn('pool_tokens',card)
        self.assertTrue(card['hand_limit_exempt'])
        self.assertIsNone(server.commander_round_reward(room,'p')['card'])
        room['round']=8;self.assertIsNone(server.commander_round_reward(room,'p')['card'])

    def test_exusiai_stacking_and_sequential_volley(self):
        c=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='exusiai'))
        c.update(skill_used_round=1,overload_upgrades=['charge','charge','barrage','barrage'])
        ally=dict(self.card('Plume'),max_hp=100)
        foes=[dict(self.card('Courier'),max_hp=100,legacy=None) for _ in range(2)]
        result=server.tavern_battle([ally],foes,commanders={'left':c})
        shots=[e for e in result['events'] if e.get('source_effect')=='commander_initiative' and e.get('damage_type')=='bullet']
        self.assertEqual(len(shots),5)
        self.assertTrue(all(e['damage']==13 for e in shots))
        self.assertEqual(sum(e.get('type')=='commander_volley_start' for e in result['events']),5)
        result=server.tavern_battle([ally],foes,round_number=2,commanders={'left':c})
        self.assertFalse(any(e.get('type')=='commander_volley_start' for e in result['events']))

    def test_exusiai_upgrade_choices_and_free_skill(self):
        c=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='exusiai'))
        room=dict(finished=False,round=1,commanders_ready=True,seats=[dict(id='p',rank=None,prepared=None,commander=c)])
        with patch.object(server,'player',return_value={'shop_level':3}):
            self.assertEqual(server.commander_upgrade(room,'p')['pending'],2)
            server.commander_upgrade(room,'p','charge');server.commander_upgrade(room,'p','charge')
            self.assertEqual(c['overload_upgrades'],['charge','charge'])
            with self.assertRaises(ValueError):server.commander_upgrade(room,'p','barrage')
        self.assertEqual(server.use_commander_skill(room,'p')['spent'],0)
        with self.assertRaises(ValueError):server.use_commander_skill(room,'p')
        room['round']=2
        server.use_commander_skill(room,'p')
        self.assertEqual(c['overload_upgrades'],['charge','charge'])

    def test_lemuen_passive_and_shop_strength(self):
        commander=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='lemuen'))
        for level in (1,3,6):
            ally=dict(self.card('Plume'),attack=0,max_hp=1)
            enemy=dict(self.card('Courier'),attack=10,max_hp=100,legacy=None)
            result=server.tavern_battle([ally],[enemy],shop_level=level,commanders={'left':commander})
            shots=[e for e in result['events'] if e.get('source_effect')=='commander_death_feud' and e.get('damage_type')=='bullet']
            self.assertEqual(len(shots),1)
            self.assertEqual(shots[0]['damage'],level+1)
            self.assertEqual(shots[0]['bullet_strength'],level)
            self.assertIsNone(server._battle_commanders.get())
        self.assertNotIn('bullet_strength_temp',commander)
        seat=dict(id='p',number=0,rank=None,prepared=None,commander=commander)
        with self.assertRaises(ValueError):
            server.use_commander_skill(dict(seats=[seat],finished=False,commanders_ready=True,round=1),'p')

    def test_lemuen_only_friendly_deaths_and_shield(self):
        commander=next(c for c in server.COMMANDERS if c['id']=='lemuen')
        a=dict(self.card('Courier'),attack=0,max_hp=1,legacy=None)
        b=dict(self.card('Courier'),attack=10,max_hp=100,legacy=None,shield=True)
        result=server.tavern_battle([a],[b],commanders={'left':commander})
        self.assertTrue(any(e.get('type')=='shield_block' and e.get('projectile')=='bullet' for e in result['events']))
        result=server.tavern_battle([b],[a],commanders={'left':commander})
        self.assertFalse(any(e.get('type')=='commander_volley_start' for e in result['events']))

    def test_typhon_volley_before_units_with_plume_strength(self):
        plume=self.card('Plume')
        foes=[dict(self.card('Courier'),name='Target '+str(i),max_hp=50,current_hp=50,legacy=None) for i in range(3)]
        commander=dict(server.COMMANDERS[0],skill_used_round=1)
        result=server.tavern_battle([plume],foes,shop_level=4,commanders={'left':commander})
        shots=[e for e in result['events'] if e.get('source_effect')=='commander_initiative' and e.get('damage_type')=='bullet']
        self.assertEqual(len(shots),3)
        self.assertTrue(all(e['damage']==5 and e['bullet_strength']==1 for e in shots))
        end=next(i for i,e in enumerate(result['events']) if e.get('type')=='commander_volley_end')
        self.assertFalse(any(e.get('damage_type')=='collision' for e in result['events'][:end]))
        result=server.tavern_battle([plume],foes,round_number=2,commanders={'left':commander})
        self.assertFalse(any(e.get('type')=='commander_volley_start' for e in result['events']))

    def test_typhon_simultaneous_shields_locks_and_two_commanders(self):
        a=dict(self.card('Plume'),golden=True,battle_start={'type':'team_bullet_strength','amount':2},max_hp=100)
        b=dict(self.card('Courier'),shield=True,max_hp=100,legacy=None)
        c=dict(self.card('Courier'),lock_hp=True,max_hp=1,legacy=None)
        commanders={side:dict(server.COMMANDERS[0],skill_used_round=1) for side in ('left','right')}
        result=server.tavern_battle([a],[b,c],shop_level=6,right_options={'shop_level':2},commanders=commanders)
        events=result['events'];starts=[e for e in events if e.get('type')=='commander_volley_start'];self.assertEqual(len(starts),2)
        self.assertTrue(any(e.get('type')=='shield_block' and e.get('damage_blocked')==8 for e in events))
        self.assertTrue(any(e.get('type')=='health_lock' for e in events))
        self.assertTrue(any(e.get('source_effect')=='commander_initiative' and e.get('side')=='right' and e['damage']==2 for e in events))

    def test_typhon_zero_cost_once_each_round(self):
        seat=dict(id='p',number=0,rank=None,prepared=None,commander=copy.deepcopy(server.COMMANDERS[0]))
        room=dict(seats=[seat],finished=False,commanders_ready=True,round=1)
        self.assertEqual(server.use_commander_skill(room,'p')['spent'],0)
        with self.assertRaises(ValueError):server.use_commander_skill(room,'p')
        room['round']=2;server.use_commander_skill(room,'p')
        self.assertEqual(seat['commander']['skill_used_round'],2)

    def test_combo_resolves_legacy_before_second_strike(self):
        attacker=dict(self.card('Courier'),attack=10,max_hp=100,current_hp=100,combo=True,legacy=None)
        victim=dict(self.card('Deepcolor'),current_hp=1)
        mine=[attacker]+[None]*6;foes=[victim]+[None]*6;events=[]
        with patch.object(server.random,'choice',side_effect=lambda values:values[0]):
            server.perform_attack_action(attacker,0,'left',mine,foes,events)
        second=next(i for i,e in enumerate(events) if e.get('type')=='combo_strike' and e['strike']==2)
        self.assertTrue(any(e.get('type')=='summon' for e in events[:second]))
        self.assertTrue(any(e.get('type')=='death' and e.get('from')==victim['name'] for e in events[:second]))

    def test_combo_enemy_buff_precedes_second_hit(self):
        a=dict(self.card('Courier'),attack=10,current_hp=100,max_hp=100,combo=True,legacy=None)
        v=dict(self.card('Courier'),current_hp=1,legacy={'type':'team_buff','attack':5,'max_hp':5})
        other=dict(self.card('Courier'),attack=1,current_hp=30,max_hp=30,legacy=None)
        events=[]
        with patch.object(server.random,'choice',side_effect=lambda values:values[0]):
            server.perform_attack_action(a,0,'left',[a]+[None]*6,[v,other]+[None]*5,events)
        hits=[e for e in events if e.get('damage_type')=='collision']
        self.assertEqual(len(hits),2);self.assertEqual(hits[1]['counter_damage'],6)

    def test_truesilver_cannot_be_selected_or_shot_but_can_be_blocked_and_poisoned(self):
        slash=dict(self.card('Truesilver Slash'),current_hp=7,offboard=True)
        owner=dict(self.card('SilverAsh the Reignfrost'),current_hp=20,max_hp=20,before_attack_assist=0)
        targets=[owner]+[None]*6+[slash]
        for _ in range(20):
            self.assertIs(server.choose_target(targets)[1],owner)
            self.assertIs(server.random_target(targets,True)[1],owner)
            self.assertIs(server.nearest_target(targets,7,True)[1],owner)
        self.assertIsNone(server.choose_target([slash]))
        self.assertIsNone(server.random_target([dict(slash,current_hp=-1)],True))
        source=dict(self.card('Courier'),current_hp=100,max_hp=100,attack=1,venom=True,legacy=None)
        events=[];server.deal_bullet_damage(source,0,'left',[source],targets,7,slash,100,events)
        self.assertEqual(slash['current_hp'],7);self.assertEqual(events,[])
        server.perform_single_attack(source,0,'left',[source],targets,events,source_effect='block',forced_target=(7,slash))
        self.assertTrue(slash.get('_venom_destroyed'));self.assertEqual(owner['current_hp'],20)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = patch.object(server, 'DB_PATH', Path(self.temp.name) / 'arena.sqlite')
        self.db.start()
        self.release=patch.object(server, "RELEASE_PATH", Path(self.temp.name)/"defaults.json")
        self.release.start()
        server.initialise_database()
        self.lobby = server.arena_start('human', '指挥官')['lobby']
        self.ids = [p['id'] for p in sorted(self.lobby['seats'], key=lambda p:p['number'])]
        room=server.arena_room('human');room.pop('active_factions',None);server.arena_save(room)

    def test_match_factions_preview_and_shared_pool(self):
        preview=server.arena_preview('new-owner')
        self.assertEqual(preview,server.arena_preview('new-owner'))
        self.assertEqual(len(preview['active_factions']),6)
        self.assertEqual(len(preview['banned_factions']),1)
        self.assertIn('中立',preview['active_factions'])
        lobby=server.arena_start('new-owner','test')['lobby']
        self.assertEqual(lobby['active_factions'],preview['active_factions'])
        banned=preview['banned_factions'][0]
        blocked=next(c for c in server.cards() if c.get('faction')==banned and not c.get('summon_only'))
        for seat in lobby['seats']:
            pid=seat['id']
            self.assertNotIn(banned,server.player_match_factions(pid))
            self.assertIn('任意',server.player_match_factions(pid))
            for c in server.shop(count=30,player_id=pid):
                if c:self.assertNotEqual(c['faction'],banned)
            with self.assertRaisesRegex(ValueError,'禁用'):
                server.buy_card(blocked['id'],pid,True)
        token=server._match_factions.set(server.player_match_factions('new-owner'))
        try:
            self.assertTrue(all(c.get('faction')!=banned for c in server.cards() if c.get('card_type')=='unit' and not c.get('summon_only')))
        finally:server._match_factions.reset(token)

    def test_request_receipt_prevents_duplicate_gold(self):
        import threading
        from urllib.request import Request,urlopen
        from urllib.error import HTTPError
        http=server.TavernHTTPServer(('127.0.0.1',0),server.Handler)
        thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
        base='http://127.0.0.1:'+str(http.server_port)
        def send(amount):
            request=Request(base+'/api/gain_gold',data=json.dumps({'amount':amount}).encode(),headers={'Content-Type':'application/json','X-Player-Id':'human','X-Request-Id':'repeat-action'})
            with urlopen(request) as response:return json.load(response)
        try:
            before=server.player('human')['gold'];first=send(2);second=send(2)
            self.assertEqual(first,second)
            self.assertEqual(server.player('human')['gold'],before+2)
            with self.assertRaises(HTTPError) as error:send(3)
            self.assertEqual(error.exception.code,409)
        finally:http.shutdown();http.server_close();thread.join()

    def tearDown(self):
        self.release.stop()
        self.db.stop()
        self.temp.cleanup()

    def card(self, cid):
        return copy.deepcopy(next(u for u in server.cards() if u['id']==cid))

    def submit_all(self, round_number=1, board=None):
        for pid in self.ids:
            server.arena_submit(pid, dict(round=round_number, board=copy.deepcopy(board or []), bench=[]))

    def test_shared_guides_merge_and_conflict(self):
        g=dict(id='default-0',faction='拉特兰',name='浏览器甲',note='保留',core=['W'],transition=[])
        first=server.shared_guides(dict(mode='import',guides=[g]))
        self.assertEqual(server.shared_guides()['guides'],first['guides'])
        second=server.shared_guides(dict(mode='import',guides=[dict(g,name='浏览器乙')]))
        self.assertEqual(len(second['guides']),2)
        self.assertEqual(len(server.shared_guides(dict(mode='import',guides=[g]))['guides']),2)
        old=first['guides'][0]
        server.shared_guides(dict(guide=dict(old,name='已修改')))
        with self.assertRaises(ValueError):server.shared_guides(dict(guide=dict(old,name='过期修改')))
        self.assertEqual(server.shared_guides()['guides'][0]['name'],'已修改')

    def test_delete_guide_and_prevent_old_browser_restore(self):
        g=dict(id='default-0',faction='拉特兰',name='待删除',note='',core=['W'],transition=[])
        saved=server.shared_guides(dict(mode='import',guides=[g]))['guides'][0]
        with self.assertRaises(ValueError):server.shared_guides(dict(mode='delete',id=saved['id'],revision=0))
        result=server.shared_guides(dict(mode='delete',id=saved['id'],revision=saved['revision']))
        self.assertEqual(result['guides'],[])
        self.assertTrue(result['initialized'])
        self.assertEqual(server.shared_guides(dict(mode='import',guides=[g]))['guides'],[])
        with self.assertRaises(ValueError):server.shared_guides(dict(guide=saved))
        self.assertEqual(len(server.shared_guides(dict(guide=dict(g,id='new-id')))['guides']),1)

    def test_shared_training_save_apply_and_conflict(self):
        cp=dict(version=1,generation=1,weights=[1]*6,history=[])
        initial=server.shared_training()
        saved=server.shared_training(dict(mode='save',revision=initial['revision'],checkpoint=cp))
        self.assertEqual(server.shared_training()['checkpoint'],cp)
        self.assertIsNone(saved['policy'])
        applied=server.shared_training(dict(mode='apply',revision=saved['revision']))
        self.assertEqual(server.shared_training()['policy']['weights'],[1]*6)
        with self.assertRaises(ValueError):server.shared_training(dict(mode='save',revision=saved['revision'],checkpoint=dict(cp,generation=2)))
        imported=server.shared_training(dict(mode='import',checkpoint=dict(cp,generation=99),policy=dict(weights=[2]*6)))
        self.assertEqual(imported['checkpoint']['generation'],1)
        self.assertEqual(imported['policy']['weights'],[1]*6)
        with self.assertRaises(ValueError):server.shared_training(dict(mode='save',revision=imported['revision'],checkpoint=dict(cp,weights=[True]*6)))
        self.assertEqual(server.shared_training(),imported)

    def test_import_existing_local_training(self):
        cp=dict(version=1,generation=5,weights=[1.5]*6,history=[])
        result=server.shared_training(dict(mode='import',checkpoint=cp,policy=dict(weights=[1.2]*6)))
        self.assertEqual(result['checkpoint'],cp)
        self.assertEqual(result['policy']['weights'],[1.2]*6)

    def test_release_defaults_and_owner_http_permissions(self):
        cp=dict(version=1,generation=15,weights=[1.5]*6,history=[])
        g=dict(id='release',revision=2,faction='炎',name='发布阵容',note='',core=['W'],transition=[])
        server.RELEASE_PATH.write_text(json.dumps(dict(guides=[g],training=dict(revision=2,checkpoint=cp,policy=dict(weights=[1.5]*6)))),encoding='utf-8')
        self.assertEqual(server.shared_guides()['guides'][0]['name'],'发布阵容')
        self.assertEqual(server.shared_training()['policy']['weights'],[1.5]*6)
        config=Path(self.temp.name)/'owner.json'
        with patch.object(server,'OWNER_EDIT_PATH',config):
            http=server.TavernHTTPServer(('127.0.0.1',0),server.Handler)
            thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            base='http://127.0.0.1:'+str(http.server_port)
            def request(body=None):
                req=Request(base+'/api/guides',data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
                with urlopen(req) as response:return json.load(response)
            try:
                self.assertFalse(request()['editable'])
                with self.assertRaises(HTTPError) as error:request(dict(mode='delete',id='release',revision=2))
                self.assertEqual(error.exception.code,403)
                config.write_text('{"enabled":true}',encoding='utf-8')
                self.assertTrue(request()['editable'])
                self.assertFalse(server.owner_can_edit('192.168.0.2'))
                self.assertFalse(server.owner_can_edit('127.0.0.1','http://evil.example','127.0.0.1'))
                self.assertEqual(request(dict(mode='delete',id='release',revision=2))['guides'],[])
                self.assertEqual(request()['guides'],[])  # defaults must not resurrect deletions
                for path in ['/data/owner-edit.json','/.git/config']:
                    with self.assertRaises(HTTPError) as error:urlopen(base+path)
                    self.assertEqual(error.exception.code,403)
            finally:http.shutdown();http.server_close();thread.join()

    def test_training_continues_after_owner_elimination(self):
        server.arena_start('human', '训练', training=True)
        room=server.arena_room('human')
        room['seats'][0]['health']=0
        with server.db() as con:
            con.execute("UPDATE players SET health=0 WHERE id='human'")
        server.arena_save(room)
        for seat in room['seats']:
            server.arena_submit(seat['id'],dict(round=1,board=[],bench=[]))
        result=server.arena_resolve('human',1)
        self.assertFalse(result['lobby']['finished'])
        self.assertEqual(next(p for p in result['lobby']['seats'] if p['id']=='human')['rank'],8)

    def test_shared_pool_and_isolated_rooms(self):
        for pid in self.ids:
            server.gain_gold(100,pid)
        for i in range(server.POOL_COPIES[1]):
            server.buy_card('Courier',self.ids[i%8])
        with self.assertRaises(ValueError):server.buy_card('Courier',self.ids[0])
        with patch.object(server,'draw_match_factions',return_value={'active_factions':['中立','谢拉格'],'banned_factions':[]}):
            server.arena_start('another','另一桌')
        self.assertEqual(server.buy_card('Courier','another')['card']['id'],'Courier')

    def test_minimum_repeat_pairing(self):
        room=server.arena_room('human')
        def all_pairings(ids):
            if not ids:
                yield []
                return
            for i in range(1,len(ids)):
                for rest in all_pairings(ids[1:i]+ids[i+1:]):
                    yield [(ids[0],ids[i])]+rest
        def cost(pairs):
            return sum(room['encounters'].get('|'.join(sorted(pair)),0)*100+
                       ('|'.join(sorted(pair)) in room['last_pairs']) for pair in pairs)
        for _ in range(10):
            pairs=server.arena_pairings(room)
            self.assertEqual(len(pairs),4)
            self.assertEqual(len({pid for pair in pairs for pid in pair}),8)
            # Greedy per-round optimal matching need not yield a seven-round round robin.
            self.assertEqual(cost(pairs),min(map(cost,all_pairings(self.ids))))
            room['last_pairs']=['|'.join(sorted(pair)) for pair in pairs]
            for key in room['last_pairs']:
                room['encounters'][key]=room['encounters'].get(key,0)+1

    def test_highest_dead_ghost(self):
        room=server.arena_room('human')
        for seat,rank in zip(room['seats'][-3:],[8,6,7]):seat['rank']=rank;seat['health']=-1
        paired=[p for pair in server.arena_pairings(room) for p in pair]
        self.assertEqual(len(paired),6)
        self.assertIn(room['seats'][-2]['id'],paired)
        self.assertNotIn(room['seats'][-3]['id'],paired)

    def test_snapshots_and_idempotent_income(self):
        board=[self.card('Courier')]
        self.submit_all(board=board)
        public=server.arena_public(server.arena_room('human'))
        self.assertTrue(all(not p['snapshot'] and 'prepared' not in p for p in public['seats']))
        result=server.arena_resolve('human',1)
        balances=[server.player(pid)['gold'] for pid in self.ids]
        self.assertEqual(result,server.arena_resolve('human',1))
        self.assertEqual(balances,[server.player(pid)['gold'] for pid in self.ids])
        snapshot=copy.deepcopy(result['lobby'])
        server.arena_submit('human',dict(round=2,board=[],bench=[]))
        self.assertEqual(snapshot,server.arena_public(server.arena_room('human')))

    def test_no_fourteen_round_limit(self):
        # Empty sides draw, allowing a deterministic long game.
        for n in range(1,17):
            self.submit_all(n)
            res=server.arena_resolve('human',n)
            self.assertFalse(res['lobby']['finished'])
        self.assertEqual(server.player('human')['round'],17)
        self.assertEqual(server.player('human')['next_income'],10)

    def test_both_sides_permanent_gains(self):
        l,r=self.card('Matterhorn'),self.card('Matterhorn')
        l['max_hp']=r['max_hp']=20
        res=server.tavern_battle([l],[r],snow_vanguard_effects=[2],right_options={'snow_vanguard_effects':[4],'shop_level':5})
        self.assertGreater(res['persistent_left'][0]['attack'],l['attack'])
        self.assertGreater(res['persistent_right'][0]['attack'],r['attack'])
        self.assertEqual(res['persistent_right'][0]['battle_shop_level'],5)
        flipped=server.arena_flip_result(res)
        self.assertEqual(flipped['persistent_left'],res['persistent_right'])
        res['aegir_attack_bonus']=3
        res['right_aegir_attack_bonus']=9
        flipped=server.arena_flip_result(res)
        self.assertEqual((flipped['aegir_attack_bonus'],flipped['right_aegir_attack_bonus']),(9,3))
        self.assertEqual(server.arena_flip_result(flipped),res)

    def test_simultaneous_death_order_and_finish(self):
        room=server.arena_room('human')
        pairs=list(zip(self.ids[::2],self.ids[1::2]))
        room['next_pairs']=pairs
        server.arena_save(room)
        # Human and three AIs lose in the same round, at differing negative HP.
        for pid,hp in zip(self.ids[::2],[1,2,3,4]):
            with server.db() as con:con.execute('UPDATE players SET health=? WHERE id=?',(hp,pid))
        unit=self.card('Courier');unit['stars']=6
        fake=dict(winner='right',events=[],left=[None]*7,right=[dict(unit,current_hp=2)]+[None]*6,
                  persistent_left=[None]*7,persistent_right=[None]*7,aegir_attack_bonus=0,right_aegir_attack_bonus=0)
        self.submit_all()
        with patch.object(server,'arena_pairings',return_value=pairs),patch.object(server,'tavern_battle',return_value=fake):
            res=server.arena_resolve('human',1)
        self.assertTrue(res['lobby']['finished'])
        byid={p['id']:p for p in res['lobby']['seats']}
        self.assertEqual([byid[pid]['rank'] for pid in self.ids[::2]],[8,7,6,5])
        self.assertEqual(byid['human']['health'],-6)
        self.assertEqual(sorted(p['rank'] for p in byid.values()),list(range(1,9)))

    def test_announced_pairing_and_live_shop_level(self):
        room=server.arena_room('human')
        announced=copy.deepcopy(room['next_pairs'])
        with server.db() as con:con.execute('UPDATE players SET shop_level=4 WHERE id=?',(self.ids[1],))
        public=server.arena_public(room)
        self.assertEqual(next(p for p in public['seats'] if p['id']==self.ids[1])['shop_level'],4)
        for a,b in announced:
            self.assertEqual(next(p for p in public['seats'] if p['id']==a)['opponent_id'],b)
        self.submit_all()
        result=server.arena_resolve('human',1)
        self.assertEqual(set(server.arena_room('human')['last_pairs']),{'|'.join(sorted(pair)) for pair in announced})

    def test_damage_cap_depends_on_living_seats_not_round(self):
        for count,round_number,expected in [(8,20,15),(4,1,24)]:
            with self.subTest(count=count):
                server.arena_start('human','测试')
                room=server.arena_room('human');room['round']=round_number
                ids=[p['id'] for p in room['seats']]
                for i,p in enumerate(room['seats']):
                    if i>=count:p.update(rank=i+1,health=-1)
                room['next_pairs']=list(zip(ids[:count:2],ids[1:count:2]));server.arena_save(room)
                with server.db() as con:
                    for pid in ids:con.execute('UPDATE players SET shop_level=6 WHERE id=?',(pid,))
                for pid in ids[:count]:server.arena_submit(pid,dict(round=round_number,board=[],bench=[]))
                u=self.card('Courier');u.update(stars=6,current_hp=1)
                fake=dict(winner='right',events=[],left=[None]*7,right=[copy.deepcopy(u) for _ in range(3)]+[None]*4,persistent_left=[None]*7,persistent_right=[None]*7,aegir_attack_bonus=0,right_aegir_attack_bonus=0)
                with patch.object(server,'tavern_battle',return_value=fake):res=server.arena_resolve('human',round_number)
                self.assertEqual(res['results']['human']['loss_damage'],expected)

    def test_mikaparato_summons_then_revives(self):
        for golden in (False,True):
            for multiplier in (1,2,3):
                for crowded in (False,True):
                    with self.subTest(golden=golden,multiplier=multiplier,crowded=crowded):
                        mixer=self.card('Sankta Mikaparato')
                        if golden:mixer=server.apply_golden_unit(mixer)
                        mixer.update(current_hp=0,attack=100,max_hp=100)
                        team=[mixer]+[None]*6
                        if multiplier>1:
                            logos=self.card('Logos');logos.update(current_hp=10,legacy_multiplier=multiplier);team[1]=logos
                        if crowded:
                            for i in range(1,7):
                                if not team[i]:team[i]=dict(self.card('Courier'),current_hp=10)
                        foes=[dict(self.card('Courier'),current_hp=1000,max_hp=1000)]+[None]*6;events=[]
                        server.handle_unit_death(mixer,0,'left',team,foes,events)
                        summons=[e for e in events if e.get('type')=='summon']
                        self.assertEqual(len(summons),1 if crowded else multiplier)
                        self.assertTrue(all(e['unit']['id']=='CONFESS_47' and server.has_revive(e['unit']) for e in summons))
                        revivals=[e for e in events if e.get('type')=='revive']
                        self.assertEqual(len(revivals),0 if crowded else 1)
                        if revivals:
                            u=revivals[0]['unit'];self.assertEqual(u['id'],mixer['id']);self.assertEqual(u['attack'],12 if golden else 6);self.assertFalse(server.has_revive(u))
                        self.assertTrue(all(e.get('source_removed') for e in events if e.get('damage_type')=='bullet'))


class ClosureCommanderTests(unittest.TestCase):
    def test_reignfrost_level_three_reward_once(self):
        c=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='silverash_reignfrost'))
        room=dict(finished=False,round=1,seats=[dict(id='r',rank=None,prepared=None,commander=c)])
        skill=dict(id='test_skill',card_type='skill',cost=3)
        with patch.object(server,'player',return_value={'shop_level':2}), patch.object(server,'cards',return_value=[skill]):
            self.assertIsNone(server.personal_commander_round_reward(room,'r')['card'])
        with patch.object(server,'player',return_value={'shop_level':3}), patch.object(server,'cards',return_value=[skill]):
            self.assertEqual(server.personal_commander_round_reward(room,'r')['card'],skill)
            self.assertIsNone(server.personal_commander_round_reward(room,'r')['card'])
        room['round']=2
        with patch.object(server,'player',return_value={'shop_level':4}):
            self.assertIsNone(server.personal_commander_round_reward(room,'r')['card'])

    def test_warfarin_selected_logistics_then_buff_and_scope(self):
        commander=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='warfarin'))
        room=dict(finished=False,round=1,seats=[dict(id='w',rank=None,prepared=None,commander=commander)])
        source=dict(id='a',name='A',card_type='unit',attack=2,max_hp=3,current_hp=3,
                    logistics={'attack':2,'max_hp':3},temporary_logistics_hp=4,
                    morale={'attack':1,'max_hp':1})
        other=dict(id='b',name='B',card_type='unit',attack=1,max_hp=1,current_hp=1,logistics={'attack':99})
        with patch.object(server,'player',return_value={'shop_level':3}):
            with self.assertRaises(ValueError):server.use_commander_skill(room,'w',target=dict(zone='shop',board=[source],index=0))
            result=server.use_commander_skill(room,'w',target=dict(zone='board',board=[source,other],index=0))
            # Three distinct gains (intrinsic, temporary, commander) each trigger morale.
            self.assertEqual((result['board'][0]['attack'],result['board'][0]['max_hp']),(8,14))
            self.assertEqual(result['board'][1]['attack'],1)
            self.assertEqual(source['attack'],2)
            with self.assertRaises(ValueError):server.use_commander_skill(room,'w',target=dict(zone='board',board=[source],index=0))
            room['round']=2
            plain=dict(other,logistics=None)
            result=server.use_commander_skill(room,'w',target=dict(zone='board',board=[plain],index=0))
            self.assertEqual((result['board'][0]['attack'],result['board'][0]['max_hp']),(2,2))

    def test_shu_purchase_threshold_and_round_limit(self):
        commander=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='shu'))
        room=dict(finished=False,round=1,seats=[dict(id='shu',rank=None,prepared=None,commander=commander)])
        target=dict(id='target',card_type='unit',faction='炎')
        for count,amount in [(0,1),(3,1),(4,2),(7,2),(8,3)]:
            with patch.object(server,'player',return_value={'purchased_units':count}),patch.object(server,'card_by_id',return_value=target):
                result=server.use_commander_skill(room,'shu',target='target')
                self.assertEqual(result['amount'],amount);self.assertEqual(result['faction'],'炎')
                self.assertEqual(result['spent'],0)
                with self.assertRaises(ValueError):server.use_commander_skill(room,'shu',target='target')
                room['round']+=1
        with patch.object(server,'card_by_id',return_value=None):
            with self.assertRaises(ValueError):server.use_commander_skill(room,'shu',target='missing')

    def test_du_yaoye_refresh_limits_and_faction_restrictions(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server,'DB_PATH',Path(directory)/'refresh.sqlite'):
            server.initialise_database();server.reset_player('du');server.gain_gold(20,'du')
            c=dict(id='du_yaoye')
            room=dict(round=1,seats=[dict(id='du',commander=c)],banned_factions=[])
            with patch.object(server,'arena_room',return_value=room),patch.object(server,'arena_save'),patch.object(server,'shop',return_value=[]) as draw:
                for expected,free in [('炎',False),('炎',True),(None,False)]:
                    server.refresh_shop('du',free=free)
                    self.assertEqual(draw.call_args.kwargs['priority_faction'],expected)
                room['round']=2;server.refresh_shop('du')
                self.assertEqual(draw.call_args.kwargs['priority_faction'],'炎')
                self.assertEqual(server.player('du')['total_gold_spent'],3)
            yan=dict(id='yan-test',card_type='unit',faction='炎',tier=1,stars=1)
            neutral=dict(id='neutral-test',card_type='unit',faction='中立',tier=1,stars=1)
            with patch.object(server,'cards',return_value=[yan,neutral]),patch.object(server,'player_match_factions',return_value=None):
                self.assertEqual(server.shop(4,'du',priority_faction='炎')[0]['id'],'yan-test')
                with patch.object(server,'cards',return_value=[neutral]):
                    self.assertTrue(all(c['id']=='neutral-test' for c in server.shop(4,'du',priority_faction='炎')))
            for banned,missing in [(['炎'],'du_yaoye'),(['拉特兰'],'paganini')]:
                ids=[c['id'] for c in server.available_commanders(server.COMMANDERS,banned)]
                self.assertNotIn(missing,ids)
                self.assertIn('closure',ids)

    def test_actual_spending_excludes_income_and_resets(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server,'DB_PATH',Path(directory)/'spending.sqlite'):
            server.initialise_database()
            server.reset_player('spender')
            server.gain_gold(100,'spender')
            self.assertEqual(server.player('spender')['total_gold_spent'],0)
            card=server.buy_card('U-Official','spender')['card']
            self.assertEqual(server.player('spender')['purchased_units'],1)
            server.refresh_shop('spender')
            upgrade=server.upgrade_shop('spender')
            expected=4+upgrade['spent']
            self.assertEqual(server.player('spender')['total_gold_spent'],expected)
            server.sell_unit('U-Official','spender',pool_tokens=card['pool_tokens'])
            self.assertEqual(server.player('spender')['purchased_units'],1)
            self.assertEqual(server.player('spender')['total_gold_spent'],expected)
            server.reset_player('spender')
            self.assertEqual(server.player('spender')['total_gold_spent'],0)
            self.assertEqual(server.player('spender')['purchased_units'],0)

    def test_upgrade_extra_use_stacking_and_rewards_once(self):
        commander=copy.deepcopy(next(c for c in server.COMMANDERS if c['id']=='closure'))
        seats=[dict(id=str(i),number=i,rank=None,prepared=None,commander=commander if i==0 else None) for i in range(8)]
        room=dict(finished=False,round=1,seats=seats)
        aid=dict(id='economic_aid',card_type='skill',effect='gain_gold',effect_value=1)
        with patch.object(server,'cards',return_value=[aid]):
            for turn in range(1,7):
                room['round']=turn
                for seat in seats:server.commander_round_reward(room,seat['id'])
                self.assertEqual(server.use_commander_skill(room,'0')['spent'],0)
                if turn<6:
                    with self.assertRaises(ValueError):server.use_commander_skill(room,'0')
            self.assertTrue(commander['dispatch_upgraded'])
            self.assertTrue(commander['skill']['icon'].endswith('s3.png'))
            self.assertIsNone(commander['skill_used_round'])
            server.use_commander_skill(room,'0')
            with self.assertRaises(ValueError):server.use_commander_skill(room,'0')
            self.assertEqual(server.commander_round_reward(room,'0')['cards'],[])
            room['round']=7
            for seat in seats:
                reward=server.commander_round_reward(room,seat['id'])['cards']
                self.assertEqual(len(reward),5 if seat['number']==0 else 2)
                self.assertTrue(all(c['hand_limit_exempt'] for c in reward))
                self.assertEqual(server.commander_round_reward(room,seat['id'])['cards'],[])
            server.use_commander_skill(room,'0')
            room['round']=8
            self.assertEqual(len(server.commander_round_reward(room,'0')['cards']),3)


class CommanderDraftTests(unittest.TestCase):
    def setUp(self):
        self.catalog=[dict(id=str(i),name='Test '+str(i),skill={}) for i in range(64)]
        self.seats=[dict(id=str(i),number=i,name=str(i)) for i in range(8)]
        self.room=dict(seats=self.seats,commander_draft=server.commander_draft(self.seats,self.catalog))

    def test_shared_pool_refresh_and_final_uniqueness(self):
        self.catalog=self.catalog[:36]
        self.room['commander_draft']=server.commander_draft(self.seats,self.catalog)
        drafts=self.room['commander_draft']
        self.assertEqual(len({x for d in drafts.values() for x in d['options']}),32)
        released=drafts['0']['options'][0]
        with patch.object(server,'COMMANDERS',self.catalog):
            server.commander_action(self.room,'0','refresh',0)
            with patch.object(server.random,'choice',return_value=released):
                server.commander_action(self.room,'1','refresh',0)
            self.assertEqual(drafts['1']['options'][0],released)
            for pid in drafts:
                for slot in range(4):
                    if not drafts[pid]['refreshed'][slot]:server.commander_action(self.room,pid,'refresh',slot)
                self.assertEqual(len(set(drafts[pid]['seen'])),8)
                with self.assertRaises(ValueError):server.commander_action(self.room,pid,'refresh',0)
            for p in self.seats:server.commander_action(self.room,p['id'],'confirm',0)
        self.assertTrue(self.room['commanders_ready'])
        self.assertEqual(len({p['commander']['id'] for p in self.seats}),8)

    def test_empty_catalog_and_locked_difficulty(self):
        with self.assertRaises(ValueError):server.commander_draft(self.seats,[])
        with self.assertRaises(ValueError):server.arena_start('test','test',difficulty='desperate')

if __name__=='__main__':unittest.main()
