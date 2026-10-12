import unittest
import json
import threading
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
import server


def unit(name, **extra):
    return dict(id=name, name=name, attack=1, max_hp=100, current_hp=100, **extra)


class TheoreticalSummonTests(unittest.TestCase):
    def test_theoretical_counts_with_limited_slots(self):
        import copy
        for kind in ['summon','summon_random_sea_monsters','summon_random_aegir','initiative']:
            for spaces in [0,1,3]:
                for amount in [1,2]:
                    with self.subTest(kind=kind,spaces=spaces,amount=amount):
                        token=server._aegir_game_attack.set({'left':0,'right':0})
                        try:
                            watcher=unit('Watcher',faction='阿戈尔',aegir_summon_game_attack=amount)
                            source=unit('Source',faction='阿戈尔')
                            team=[watcher]+[unit('Filler') for _ in range(6-spaces)]+[None]*spaces
                            monster=unit('Monster',faction='阿戈尔',card_type='unit',sea_monster=True)
                            events=[];effect={'type':'summon' if kind=='initiative' else kind,'count':3,'summon_id':'Monster'}
                            with patch.object(server,'card_by_id',side_effect=lambda _:copy.deepcopy(monster)),patch.object(server,'cards',return_value=[monster]):
                                if kind=='initiative':
                                    source['initiative']=effect
                                    server.resolve_one_precombat_effect('initiative',source,0,team,[],'left',events)
                                else:server.trigger_legacy_effect(source,0,'left',team,[],events,effect)
                            counts=[e for e in events if e.get('type')=='aegir_game_attack']
                            self.assertEqual(len(counts),3)
                            self.assertEqual(sum(e['amount'] for e in counts),3*amount)
                            self.assertEqual(sum(e.get('type')=='summon' for e in events),spaces)
                        finally:server._aegir_game_attack.reset(token)

    def test_blocked_summons_require_aegir_and_living_watcher(self):
        for faction in ['炎','阿戈尔']:
            for dead in [False,True]:
                watcher=unit('Watcher',aegir_summon_game_attack=1)
                if dead:watcher['_death_confirmed']=True
                events=[];token=server._aegir_game_attack.set({'left':0,'right':0})
                try:
                    server.count_blocked_aegir_summon(unit('Summon',faction=faction),'left',[watcher],events)
                    self.assertEqual(sum(e.get('type')=='aegir_game_attack' for e in events),int(faction=='阿戈尔' and not dead))
                finally:server._aegir_game_attack.reset(token)



class KjeragMechanicsTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        from pathlib import Path
        self.tmp=tempfile.TemporaryDirectory()
        self.db_patch=patch.object(server,'DB_PATH',Path(self.tmp.name)/'kjerag.sqlite')
        self.db_patch.start();server.initialise_database()
        self.addCleanup(self.tmp.cleanup);self.addCleanup(self.db_patch.stop)

    def test_snowdevil_raid_frees_only_slot_before_next_summon(self):
        for counter,expected in [(1,2),(0,1)]:
            courier=server.apply_golden_unit(server.card_by_id('Courier'))
            team=[None]+[unit('Filler') for _ in range(6)]
            enemy=unit('Enemy');enemy['attack']=counter;events=[]
            server.trigger_legacy_effect(courier,0,'left',team,[enemy],events,courier['legacy'])
            sequence=[e.get('type') or e.get('damage_type') for e in events if e.get('type') in ('summon','death') or e.get('damage_type')=='collision']
            self.assertEqual(sequence,['summon','collision','death','summon','collision','death'] if counter else ['summon','collision'])
            self.assertEqual(sum(e.get('type')=='summon' for e in events),expected)
            self.assertEqual(team[0] is None,bool(counter))

    def test_raid_cumulative_health_gain_can_save_snowdevil(self):
        courier=server.apply_golden_unit(server.card_by_id('Courier'))
        mostima=server.card_by_id('Mostima');mostima['current_hp']=mostima['max_hp'];mostima['mostima_damage_count']=1
        team=[None,mostima]+[unit('Filler') for _ in range(5)];enemy=unit('Enemy');events=[]
        server.trigger_legacy_effect(courier,0,'left',team,[enemy],events,courier['legacy'])
        self.assertEqual(sum(e.get('type')=='summon' for e in events),1)
        self.assertIsNotNone(team[0]);self.assertGreater(team[0]['current_hp'],0)
        self.assertFalse(any(e.get('type')=='death' and e.get('from')=='山雪鬼' for e in events))

    def test_aurora_raid_death_legacy_chain_before_next_courier(self):
        token=server._waiting_summons.set([]);self.addCleanup(server._waiting_summons.reset,token)
        aurora=server.apply_golden_unit(server.card_by_id('Aurora'));aurora['current_hp']=aurora['max_hp']
        team=[aurora]+[unit('Filler') for _ in range(5)]+[None]
        enemy=unit('Enemy');events=[]
        server.resolve_one_precombat_effect('initiative',aurora,0,team,[enemy],'left',events)
        sequence=[(e.get('type') or e.get('damage_type'),e.get('unit',{}).get('id') or e.get('from')) for e in events if e.get('type') in ('summon','death') or e.get('damage_type')=='collision']
        cycle=[('summon','Courier'),('collision','讯使'),('death','讯使'),('summon','Mountain Snowdevil'),('collision','山雪鬼'),('death','山雪鬼')]
        self.assertEqual(sequence,cycle*2)
        self.assertIsNone(team[6]);self.assertFalse(server._waiting_summons.get())
        self.assertTrue(aurora['guard'])

    def test_aurora_full_board_waits_and_remaining_summon_survives(self):
        token=server._waiting_summons.set([]);self.addCleanup(server._waiting_summons.reset,token)
        aurora=server.apply_golden_unit(server.card_by_id('Aurora'));aurora['current_hp']=aurora['max_hp']
        team=[aurora]+[unit('Filler') for _ in range(6)];enemy=unit('Enemy');enemy['attack']=0;events=[]
        server.resolve_one_precombat_effect('initiative',aurora,0,team,[enemy],'left',events)
        self.assertFalse(any(e.get('type')=='summon' for e in events))
        team[6]['current_hp']=0
        # The atomic effect boundary completes the existing death before draining the queue.
        server.perform_attack_action(team[1],1,'left',team,[enemy],events)
        # A pre-existing zero-HP card is not automatically a confirmed death.
        self.assertFalse(any(e.get('type')=='summon' for e in events))
        team[6]=None
        server.drain_waiting_summons(events)
        self.assertEqual(sum(e.get('type')=='summon' for e in events),1)
        self.assertEqual(team[6]['id'],'Courier');self.assertEqual(team[6]['raid']['hits'],1)
        self.assertEqual(server._waiting_summons.get()[0]['count'],1)
        team[5]['current_hp']=1;enemy['attack']=1
        with patch.object(server,'choose_target',side_effect=lambda foes:(5,team[5]) if foes is team else (0,enemy)):
            server.perform_attack_action(enemy,0,'right',[enemy],team,events)
        self.assertFalse(server._waiting_summons.get())
        self.assertEqual(sum(e.get('type')=='summon' and e['unit']['id']=='Courier' for e in events),2)

    def test_matterhorn_steward_before_attack_and_permanence(self):
        for golden in (False,True):
            attacker=server.card_by_id('Matterhorn');steward=server.card_by_id('Steward')
            if golden:attacker=server.apply_golden_unit(attacker);steward=server.apply_golden_unit(steward)
            attacker['current_hp']=attacker['max_hp'];steward['current_hp']=steward['max_hp']
            base=(attacker['attack'],attacker['max_hp']);events=[];team=[attacker,steward]
            server.apply_before_attack(attacker,0,'left',team,events)
            factor=2 if golden else 1
            self.assertEqual((attacker['attack'],attacker['max_hp']),(base[0]+3*factor,base[1]+factor))
            import copy
            saved=copy.deepcopy(team);saved[0]['attack'],saved[0]['max_hp']=base
            server.apply_persistent_battle_gains(saved,events)
            self.assertEqual((saved[0]['attack'],saved[0]['max_hp']),(attacker['attack'],attacker['max_hp']))
            steward['current_hp']=0;before=attacker['attack'];hp=attacker['max_hp']
            server.apply_before_attack(attacker,0,'left',team,[])
            self.assertEqual(attacker['attack'],before+factor);self.assertEqual(attacker['max_hp'],hp)

    def test_snow_hunter_neighbors_and_raid_not_combo(self):
        for golden in (False,True):
            hunter=server.card_by_id('Snow Hunter')
            if golden:hunter=server.apply_golden_unit(hunter)
            hunter['current_hp']=hunter['max_hp'];left=unit('Left');right=unit('Right')
            team=[left,None,hunter,right];enemy=unit('Enemy');enemy['attack']=0;events=[]
            server.resolve_one_precombat_effect('initiative',hunter,2,team,[enemy],'left',events)
            server.resolve_one_precombat_effect('initiative',hunter,2,team,[enemy],'left',events)
            self.assertTrue(left['combo']);self.assertEqual(bool(right.get('combo')),golden)
            self.assertEqual(left['mechanics'].count('combo'),1)
            self.assertTrue(hunter['shield'] and hunter['combo'])
            events=[];server.perform_attack_action(left,0,'left',team,[enemy],events,source_effect='raid')
            self.assertEqual(sum(e.get('damage_type')=='collision' for e in events),1)
            events=[];server.perform_attack_action(left,0,'left',team,[enemy],events)
            self.assertEqual(sum(e.get('damage_type')=='collision' for e in events),2)

    def test_silverash_offboard_attacks_same_target_and_leaves(self):
        for golden in (False,True):
            for hp,count in [(100,2 if golden else 1),(1,1)]:
                silver=server.card_by_id('SilverAsh')
                if golden:silver=server.apply_golden_unit(silver)
                silver['current_hp']=silver['max_hp'];team=[silver]+[unit('Filler') for _ in range(6)];original=list(team)
                target=unit('Target');target['attack']=0;target['current_hp']=target['max_hp']=hp;events=[]
                def verify_space(*args):self.assertIsNone(server.summon_slot_for(team,0))
                with patch.object(server,'trigger_sea_summon_buff',side_effect=verify_space):
                    server.perform_attack_action(silver,0,'left',team,[target],events)
                summons=[e for e in events if e.get('type')=='offboard_summon']
                self.assertEqual(len(summons),count);self.assertTrue(all(e['slot']>7 for e in summons))
                self.assertEqual(sum(e.get('type')=='offboard_leave' for e in events),count)
                self.assertEqual(len(team),7);self.assertTrue(all(a is b for a,b in zip(team,original)))
                hits=[e for e in events if e.get('damage_type')=='collision']
                self.assertTrue(all(e['to']=='Target' for e in hits))
                self.assertEqual(len(hits),count+(hp>1))

    def test_pramanix_charge_growth_and_snow_vanguard(self):
        for golden in (False,True):
            p=server.card_by_id('Pramanix')
            if golden:p=server.apply_golden_unit(p)
            p['current_hp']=p['max_hp'];base=(p['attack'],p['max_hp']);events=[]
            server.record_charge_attack('left',[p],events);server.record_charge_attack('left',[p],events)
            amount=4 if golden else 2
            self.assertEqual((p['attack'],p['max_hp']),(base[0]+amount,base[1]+amount))
            self.assertFalse(any(e.get('type')=='gain_card' for e in events))
        silver=server.card_by_id('SilverAsh');silver['current_hp']=silver['max_hp'];enemy=unit('Enemy');enemy['attack']=0
        token=server._snow_vanguard.set({'left':[2,1],'right':[]});self.addCleanup(server._snow_vanguard.reset,token)
        events=[];team=[silver]+[None]*6;server.perform_attack_action(silver,0,'left',team,[enemy],events)
        gains=[e for e in events if e.get('from')=='雪境先驱' and e.get('type')=='permanent_buff']
        self.assertEqual(len(gains),4) # two separate cards on SilverAsh and his temporary summon
        self.assertEqual(silver['attack'],5)
        self.assertTrue(any(e['slot']>7 for e in gains))
        snapshot=[server.card_by_id('SilverAsh')]+[None]*6;server.apply_persistent_battle_gains(snapshot,events)
        self.assertEqual(snapshot[0]['attack'],5)

    def test_kjera_summon_sequence_and_new_card_templates(self):
        for golden,count in [(False,3),(True,6)]:
            k=server.card_by_id('Kjera')
            if golden:k=server.apply_golden_unit(k)
            for damage,expected in [(0,1),(1,count)]:
                enemy=unit('Enemy');enemy['attack']=damage;team=[None]+[unit('Filler') for _ in range(6)];events=[]
                server.trigger_legacy_effect(k,0,'left',team,[enemy],events,k['legacy'])
                self.assertEqual(sum(e.get('type')=='summon' for e in events),expected)
        for level,value in enumerate([1,2,2,3,3,4],1):
            card=server.card_by_id('snow_vanguard_'+str(level));self.assertEqual(card['effect_value'],value)
            self.assertIn('+'+str(value)+'/+'+str(value),card['description'])
        cliff=server.card_by_id('Cliffheart');self.assertEqual(cliff['on_deploy']['attack'],3)
        self.assertEqual(server.apply_golden_unit(cliff)['on_deploy']['attack'],6)
        gnosis=server.apply_golden_unit(server.card_by_id('Gnosis'))
        self.assertEqual(gnosis['recruit']['count'],2);self.assertEqual(gnosis['return_camp']['count'],2)

    def test_degenbrecher_shield_limit_and_growth(self):
        for golden,limit,growth in [(False,1,1),(True,2,2)]:
            d=server.card_by_id('Degenbrecher')
            if golden:d=server.apply_golden_unit(d)
            d['current_hp']=d['max_hp'];base=(d['attack'],d['max_hp']);events=[]
            for turn in range(4):
                server.apply_before_attack(d,0,'left',[d],events)
                self.assertEqual(server.consume_shield(d),turn<limit)
            self.assertEqual(d['before_attack_shield_count'],limit)
            self.assertEqual((d['attack'],d['max_hp']),(base[0]+growth*4,base[1]+growth*4))
            d['before_attack_shield_count']=99
            enemy=unit('Enemy');enemy['attack']=0;enemy['max_hp']=enemy['current_hp']=1
            result=server.tavern_battle([d],[enemy])
            self.assertTrue(any(e.get('type')=='grant_shield' for e in result['events']))

    def test_prerita_faction_growth_has_separate_buff_events(self):
        for golden,factor in [(False,1),(True,2)]:
            p=server.card_by_id('Pramanix the Prerita')
            if golden:p=server.apply_golden_unit(p)
            p['current_hp']=p['max_hp'];k=unit('K',faction='谢拉格');wild=unit('Wild',faction='任意');other=unit('Other',faction='炎');team=[p,k,wild,other];events=[]
            server.record_charge_attack('left',team,events);server.record_charge_attack('left',team,events)
            for u,amount in [(k,4),(wild,4),(other,3)]:self.assertEqual(u['attack'],1+amount*factor)
            gains=[e for e in events if e.get('type')=='permanent_buff']
            self.assertEqual([e['attack_gain'] for e in gains if e['to']=='K'],[3*factor,1*factor])
            self.assertEqual(len(gains),7)

    def test_truesilver_inherits_buffed_attack_and_credits_owner(self):
        for golden in (False,True):
            source=server.card_by_id('SilverAsh the Reignfrost')
            if golden:source=server.apply_golden_unit(source)
            source['current_hp']=source['max_hp'];source['bloodbattle']=3;base=source['attack']
            team=[source]+[unit('Filler') for _ in range(6)];enemy=unit('Target');enemy['attack']=0;events=[]
            token=server._snow_vanguard.set({'left':[2],'right':[]})
            try:server.perform_attack_action(source,0,'left',team,[enemy],events)
            finally:server._snow_vanguard.reset(token)
            summons=[e for e in events if e.get('type')=='offboard_summon'];self.assertEqual(len(summons),2 if golden else 1)
            self.assertTrue(all(e['unit']['attack']==base+2 and e['unit']['max_hp']==7 for e in summons))
            ghost_hits=[e for e in events if e.get('damage_type')=='collision' and e.get('from')=='真银斩']
            self.assertTrue(all(e['damage']==base+4 for e in ghost_hits))
            self.assertEqual(len(team),7)
        source=server.apply_golden_unit(server.card_by_id('SilverAsh the Reignfrost'));source['current_hp']=source['max_hp'];source['bloodbattle']=3;base=source['attack'];enemy=unit('Target');enemy['attack']=0;enemy['current_hp']=1;events=[]
        server.perform_attack_action(source,0,'left',[source]+[None]*6,[enemy],events)
        self.assertEqual(source['attack'],base+3)
        self.assertEqual(sum(e.get('type')=='offboard_summon' for e in events),1)
        self.assertEqual([e['from'] for e in events if e.get('mechanic')=='bloodbattle'],['凛御银灰'])
        slash=server.card_by_id('Truesilver Slash')
        self.assertEqual((slash['tier'],slash['attack'],slash['max_hp']),(1,7,7))
        self.assertTrue(slash['cannot_gain'] and slash['summon_only'])
        with self.assertRaises(ValueError):server.buy_card(slash['id'],bypass_shop_level=True)

    def test_aurora_summons_at_leftmost_free_slot_and_position(self):
        token=server._waiting_summons.set([]);self.addCleanup(server._waiting_summons.reset,token)
        aurora=server.card_by_id('Aurora');aurora['current_hp']=aurora['max_hp'];aurora['battle_position']=3
        team=[unit('First',battle_position=0),None,None,aurora,None,None,None];enemy=unit('Enemy');enemy['attack']=0;events=[]
        server.resolve_one_precombat_effect('initiative',aurora,3,team,[enemy],'left',events)
        self.assertEqual(team[1]['id'],'Courier')
        self.assertLess(team[1]['battle_position'],0)
        self.assertEqual(next(u for _,u in server.battle_entries(team) if u)['id'],'Courier')

    def test_kjera_does_not_inherit_summoned_snowdevil_growth(self):
        import copy
        k=server.card_by_id('Kjera');k['current_hp']=0;team=[k]+[None]*6;enemy=unit('Enemy');enemy['attack']=1;events=[]
        saved=[copy.deepcopy(k)]+[None]*6
        token=server._snow_vanguard.set({'left':[1],'right':[]})
        try:server.handle_unit_death(k,0,'left',team,[enemy],events)
        finally:server._snow_vanguard.reset(token)
        self.assertTrue(any(e.get('type')=='permanent_buff' and e.get('to')=='山雪鬼' for e in events))
        server.apply_persistent_battle_gains(saved,events)
        self.assertEqual((saved[0]['attack'],saved[0]['max_hp']),(6,3))
        self.assertTrue(all(u['attack']==3 for u in team if u))
        # Gains earned by Kjera before death still persist, unlike later slot occupants.
        before=dict(type='permanent_buff',side='left',slot=1,attack_gain=2,max_hp_gain=2)
        saved=[copy.deepcopy(k)]+[None]*6
        server.apply_persistent_battle_gains(saved,[before]+events)
        self.assertEqual((saved[0]['attack'],saved[0]['max_hp']),(8,5))

    def test_courier_summons_and_immediate_raid(self):
        for golden,count in [(False,1),(True,2)]:
            courier=server.card_by_id('Courier')
            if golden:courier=server.apply_golden_unit(courier)
            team=[None]*7;enemy=unit('Enemy');enemy['attack']=0;events=[]
            server.trigger_legacy_effect(courier,0,'left',team,[enemy],events,courier['legacy'])
            self.assertEqual(sum(e.get('type')=='summon' for e in events),count)
            self.assertEqual(sum(e.get('source_effect')=='raid' and e.get('damage_type')=='collision' for e in events),count)
            self.assertEqual(enemy['current_hp'],100-count*2)
        ghost=server.card_by_id('Mountain Snowdevil')
        self.assertEqual((ghost['tier'],ghost['attack'],ghost['max_hp']),(1,2,1))
        self.assertEqual(server.apply_golden_unit(ghost)['raid']['hits'],2)
        with self.assertRaises(ValueError):server.buy_card(ghost['id'])
        watcher=unit('Catherine',enemy_death_copy_limit=2);events=[]
        server.trigger_enemy_death_copy(ghost,'right',[watcher],events)
        self.assertFalse(events);self.assertNotIn('enemy_death_copy_count',watcher)

    def test_block_interrupts_cleave_and_runs_before_attack(self):
        attacker=unit('Attacker',cleave=True,charge={'threshold':4})
        blocker=server.card_by_id('Leto');blocker['current_hp']=blocker['max_hp'];blocker['charge']={'threshold':4}
        original=unit('Original');left=[attacker,unit('L2'),unit('L3')];right=[unit('R1'),blocker,original];events=[]
        with patch.object(server,'choose_target',return_value=(2,original)):
            server.perform_attack_action(attacker,0,'left',left,right,events)
        self.assertEqual(original['current_hp'],100)
        self.assertEqual(blocker['attack'],2);self.assertEqual(blocker['max_hp'],8)
        self.assertEqual(attacker['charge_count'],1);self.assertEqual(blocker['charge_count'],1)
        self.assertFalse(any(e.get('damage_type')=='cleave' for e in events))
        collision=next(e for e in events if e.get('damage_type')=='collision')
        self.assertEqual((collision['from'],collision['to'],collision['source_effect']),('烈夏','Attacker','block'))
        snapshot=[None,server.card_by_id('Leto'),None]
        server.apply_persistent_battle_gains(snapshot,[dict(e,side='left') for e in events])
        self.assertEqual((snapshot[1]['attack'],snapshot[1]['max_hp']),(2,8))

    def test_blocker_bloodbattle_but_not_interrupted_counter(self):
        for blocker_kills in [True,False]:
            attacker=unit('Attacker',bloodbattle=5,cleave=True)
            blocker=unit('Blocker',block=True,bloodbattle=2)
            attacker['attack']=1 if blocker_kills else 9
            attacker['current_hp']=1 if blocker_kills else 100
            blocker['current_hp']=100 if blocker_kills else 1
            target=unit('Target');left=[attacker,unit('L2'),unit('L3')];right=[unit('R1'),blocker,target];events=[]
            with patch.object(server,'choose_target',return_value=(2,target)):
                server.perform_attack_action(attacker,0,'left',left,right,events)
            gains=[e for e in events if e.get('mechanic')=='bloodbattle']
            self.assertEqual(len(gains),1 if blocker_kills else 0)
            if gains:self.assertEqual(gains[0]['from'],'Blocker')

    def test_block_geometry_uses_centered_order_and_not_slot_holes(self):
        attacker=unit('A',battle_position=0);left=[None,attacker,None,unit('L',battle_position=2)]
        blocker=unit('B',block=True,battle_position=1);target=unit('T',battle_position=2)
        right=[target,None,blocker,unit('R',battle_position=0)]
        self.assertEqual(server.crossing_blocker(attacker,left,target,right),(2,blocker))
        self.assertIsNone(server.crossing_blocker(attacker,left,blocker,right))
        blocker['current_hp']=0
        self.assertIsNone(server.crossing_blocker(attacker,left,target,right))

    def test_charge_ignores_bullets_and_counters_and_repeats(self):
        harold=server.card_by_id('Harold');harold['current_hp']=harold['max_hp'];attacker=unit('A');enemy=unit('Enemy');enemy['attack']=0
        left=[attacker,harold];events=[]
        with patch.object(server,'cards',return_value=[server.card_by_id('Courier'),server.card_by_id('Mountain Snowdevil')]):
            for _ in range(8):server.perform_attack_action(attacker,0,'left',left,[enemy],events)
        gained=[e for e in events if e.get('source_effect')=='charge' and e.get('type')=='gain_card']
        self.assertEqual(len(gained),2);self.assertTrue(all(e['card_id']=='Courier' for e in gained))
        self.assertEqual(harold['charge_count'],0)
        server.deal_bullet_damage(attacker,0,'left',left,[enemy],0,enemy,1,events)
        server.perform_attack_action(enemy,0,'right',[enemy],left,events)
        self.assertEqual(harold['charge_count'],0)
        attacker['bullet_damage']=1;attacker['bullet_trigger']='always'
        server.perform_attack_action(attacker,0,'left',left,[enemy],events)
        self.assertEqual(harold['charge_count'],0)

    def test_golden_charge_and_reset_each_battle(self):
        harold=server.apply_golden_unit(server.card_by_id('Harold'));harold['current_hp']=harold['max_hp'];harold['charge_count']=3;events=[]
        server.record_charge_attack('left',[harold],events)
        self.assertEqual(sum(e.get('type')=='gain_card' for e in events),2)
        harold['charge_count']=3;enemy=unit('Enemy');enemy['current_hp']=enemy['max_hp']=1;enemy['attack']=0
        result=server.tavern_battle([harold],[enemy])
        counters=[e for e in result['events'] if e.get('type')=='charge_counter']
        self.assertEqual(counters[0]['count'],1)
        self.assertFalse(any(e.get('type')=='gain_card' for e in result['events']))


class BulletBatchTests(unittest.TestCase):
    def test_crownslayer_legacy_venom_after_bullet_kill(self):
        attacker=unit('Attacker');crown=unit('Crownslayer',venom=True,legacy={'type':'bullet_damage','damage':1,'hits':1,'target':'killer'})
        crown['current_hp']=1;left=[attacker];right=[crown];events=[]
        server.deal_bullet_damage(attacker,0,'left',left,right,0,crown,1,events)
        self.assertIsNone(left[0]);self.assertIsNone(right[0])
        self.assertTrue(crown['venom_consumed'])
        self.assertTrue(any(e.get('source_effect')=='legacy' and e.get('damage_type')=='bullet' for e in events))

    def test_venom_requires_actual_outgoing_damage(self):
        for kind in ['bullet','cleave']:
            attacker=unit('Attacker');poison=unit('Poison',venom=True)
            if kind=='bullet':server.deal_bullet_damage(attacker,0,'left',[attacker],[poison],0,poison,1,[])
            else:server.deal_cleave_damage(attacker,0,'left',[attacker],[poison],0,poison,1,[],[])
            self.assertFalse(poison.get('venom_consumed'));self.assertFalse(attacker.get('_venom_destroyed'))
        poison=unit('Poison',venom=True);target=unit('Shield',shield=True)
        server.deal_bullet_damage(poison,0,'left',[poison],[target],0,target,3,[])
        self.assertFalse(poison.get('venom_consumed'))
        server.deal_bullet_damage(poison,0,'left',[poison],[target],0,target,3,[])
        self.assertTrue(poison['venom_consumed']);self.assertTrue(target['_venom_destroyed'])

    def test_health_lock_once_and_counterattack(self):
        for kind in ('bullet','spell','friendly','cleave','collision'):
            attacker=unit('Attacker');attacker['attack']=10
            target=unit('Specter',lock_hp=True,mechanics=['lock_hp']);target['current_hp']=2
            allies=[attacker];foes=[target];events=[]
            if kind=='bullet':server.deal_bullet_damage(attacker,0,'left',allies,foes,0,target,10,events)
            elif kind=='spell':server.deal_spell_damage(attacker,0,'left',allies,foes,0,target,10,events)
            elif kind=='friendly':server.deal_friendly_bullet_damage(attacker,0,'left',foes,allies,0,target,10,events,[])
            elif kind=='cleave':server.deal_cleave_damage(attacker,0,'left',allies,foes,0,target,10,events,[])
            else:server.perform_attack_action(attacker,0,'left',allies,foes,events)
            self.assertEqual(target['current_hp'],1,kind)
            self.assertFalse(target['lock_hp']);self.assertNotIn('lock_hp',target['mechanics'])
            self.assertEqual(len([e for e in events if e.get('type')=='health_lock']),1)
            server.deal_bullet_damage(attacker,0,'left',allies,foes,0,target,10,events)
            self.assertIsNone(foes[0],kind)
        attacker=unit('Specter',lock_hp=True);attacker['current_hp']=1
        server.perform_attack_action(attacker,0,'left',[attacker],[unit('Enemy')],[])
        self.assertEqual(attacker['current_hp'],1)
        self.assertFalse(attacker['lock_hp'])

    def test_combo_two_strikes_unique_and_raid_excluded(self):
        for effect, expected in [(None,2),('raid',1)]:
            attacker=unit('Reaper',combo=True,mechanics=['combo','combo'])
            enemy=unit('Enemy');events=[]
            server.perform_attack_action(attacker,0,'left',[attacker],[enemy],events,source_effect=effect)
            self.assertEqual(len([e for e in events if e.get('damage_type')=='collision']),expected)
            self.assertEqual([e['strike'] for e in events if e.get('type')=='combo_strike'],[1,2] if effect is None else [])

    def test_combo_stops_on_death_and_retargets_after_kill(self):
        attacker=unit('Reaper',combo=True);attacker['current_hp']=1
        events=[];team=[attacker]
        server.perform_attack_action(attacker,0,'left',team,[unit('Enemy')],events)
        self.assertIsNone(team[0])
        self.assertEqual(len([e for e in events if e.get('damage_type')=='collision']),1)
        attacker=unit('Reaper',combo=True);first=unit('First',guard=True);first['current_hp']=1
        foes=[first,unit('Second')];events=[]
        server.perform_attack_action(attacker,0,'left',[attacker],foes,events)
        self.assertEqual([e['to'] for e in events if e.get('damage_type')=='collision'],['First','Second'])

    def test_goldenglow_tinman_fills_shots_and_prefers_living(self):
        for repeats in (2,3):
            g=unit('Goldenglow',initiative={'type':'leftmost_attack_bullet','multiplier':2});g['attack']=4
            tin=unit('Tin',initiative_multiplier=repeats);enemies=[unit('E1'),unit('E2')]
            for u in enemies: u['current_hp']=1
            events=[]
            server.resolve_precombat_phase('initiative',[g,tin],enemies,'left',events)
            shots=[e for e in events if e.get('damage_type')=='bullet']
            self.assertEqual(len(shots),repeats)
            self.assertEqual([e['to_slot'] for e in shots],[1,2] if repeats==2 else [1,2,1])
            self.assertTrue(all(e['bullet_base_damage']==8 for e in shots))

    def test_jiushen_logos_permanent_and_repeated_bloodbattle(self):
        dead=unit('Jiushen',legacy={'type':'team_permanent_bloodbattle','amount':8,'triggers':2});dead['current_hp']=0
        ally=unit('Grani',bloodbattle=1);logos=unit('Logos',legacy_multiplier=3);events=[]
        team=[dead,ally,logos]
        server.handle_unit_death(dead,0,'left',team,[],events)
        self.assertEqual(ally['attack'],31)
        self.assertEqual(logos['attack'],25)
        self.assertIsNone(team[0])

    def test_stainless_logistics_and_bloodbattle_gold(self):
        for amount in (1,2):
            u=unit('Stainless',logistics={'type':'gain_gold','amount':amount},bloodbattle={'type':'gain_gold','amount':amount});events=[]
            server.apply_logistics_effects([u],'left',events)
            server.resolve_bloodbattle(u,0,'left',[u],[],events)
            self.assertEqual([e['amount'] for e in events if e.get('type')=='gain_gold'],[amount,amount])

    def test_horn_shop_damage_and_strength(self):
        for level in range(1,7):
            for multiplier in (1,2):
                u=unit('Horn',battle_shop_level=level,bullet_strength=5,bloodbattle={'type':'team_growth_shop_bullet','amount':multiplier,'multiplier':multiplier});events=[]
                enemy=unit('Enemy');server.resolve_bloodbattle(u,0,'left',[u],[enemy],events)
                shot=next(e for e in events if e.get('damage_type')=='bullet')
                self.assertEqual(shot['bullet_base_damage'],level*multiplier)
                self.assertEqual(shot['damage'],level*multiplier+5)
                self.assertEqual(u['attack'],1+multiplier)

    def test_vina_buffs_before_shield_and_existing_shield_bonus(self):
        for shield in (False,True):
            u=unit('Vina',shield=shield,bloodbattle={'type':'shield_growth','amount':2,'extra':5});events=[]
            server.resolve_bloodbattle(u,0,'left',[u],[],events)
            self.assertEqual(u['attack'],8 if shield else 3)
            self.assertTrue(server.has_shield(u))
            self.assertEqual(events[-2]['type'],'grant_shield')
            self.assertEqual([e['attack_gain'] for e in events if e.get('type')=='permanent_buff'],[2,5] if shield else [2])

    def test_nightmare_death_sources_and_limit(self):
        for mode in ('counter','attack','bullet','legacy'):
            n=unit('Nightmare',enemy_death_growth={'amount':2,'limit':2});ally=unit('Ally',bloodbattle=1)
            team=[ally,n];events=[]
            for _ in range(3):
                enemy=unit('Enemy');enemy['current_hp']=1
                if mode=='counter': server.perform_attack_action(enemy,0,'right',[enemy],team,events)
                elif mode=='attack': server.perform_attack_action(ally,0,'left',team,[enemy],events)
                else: server.deal_bullet_damage(ally,0,'left',team,[enemy],0,enemy,1,events,source_effect='legacy' if mode=='legacy' else None)
            self.assertEqual(n['enemy_death_growth_count'],2,mode)
            self.assertEqual(n['attack'],5,mode)
            self.assertGreaterEqual(ally['attack'],7,mode)

    def test_nightmare_chain_kills_capped(self):
        n=unit('Nightmare',enemy_death_growth={'amount':4,'limit':4})
        r=unit('Rockrock',bloodbattle={'type':'leftmost_bullet_growth','damage':3,'growth':1})
        team=[n,r];foes=[unit('Enemy') for _ in range(7)];events=[]
        for enemy in foes: enemy['current_hp']=1
        server.deal_bullet_damage(n,0,'left',team,foes,0,foes[0],1,events)
        self.assertEqual(n['enemy_death_growth_count'],4)
        self.assertTrue(all(x is None for x in foes))

    def test_nightmare_no_trigger_when_dead_or_enemy_saved(self):
        n=unit('Nightmare',enemy_death_growth={'amount':2,'limit':2});n['current_hp']=0
        events=[];enemy=unit('Enemy');enemy['current_hp']=0
        server.handle_unit_death(enemy,0,'right',[enemy],[n],events)
        self.assertNotIn('enemy_death_growth_count',n)
        n['current_hp']=100;enemy=unit('Enemy');pending=[(enemy,0,'right',[enemy],[n])]
        server.resolve_pending_deaths(pending,events)
        self.assertNotIn('enemy_death_growth_count',n)

    def test_catherine_limit_alive_and_base_copy(self):
        for limit in (1,2):
            c=unit('Catherine',enemy_death_copy_limit=limit);events=[]
            template=unit('Enemy');template['attack']=3
            with patch.object(server,'card_by_id',return_value=dict(template)):
                for _ in range(3):
                    victim=unit('Enemy');victim.update(current_hp=0,attack=999,golden=True)
                    server.handle_unit_death(victim,0,'right',[victim],[c],events)
            copies=[e['card'] for e in events if e.get('type')=='gain_card']
            self.assertEqual(len(copies),limit)
            self.assertTrue(all(x['attack']==3 and not x.get('golden') for x in copies))
        c=unit('Catherine',enemy_death_copy_limit=2);c['current_hp']=0;events=[]
        with patch.object(server,'card_by_id',return_value=unit('Enemy')):
            server.trigger_enemy_death_copy(unit('Enemy'),'right',[c],events)
        self.assertEqual(events,[])

    def test_bagpipe_faction_growth_separate_permanent_gains(self):
        a=unit('Bagpipe',faction='维多利亚',bloodbattle={'type':'team_faction_growth','amount':2,'faction':'维多利亚','extra':1})
        b=unit('Other',faction='拉特兰');events=[]
        server.resolve_bloodbattle(a,0,'left',[a,b],[],events)
        self.assertEqual((a['attack'],b['attack']),(4,3))
        self.assertEqual([e['attack_gain'] for e in events if e.get('type')=='permanent_buff'],[2,1,2])

    def test_reed_neighbors_and_two_bloodbattle_triggers(self):
        a=unit('A',bloodbattle=1);b=unit('B',bloodbattle=2);far=unit('Far',bloodbattle=9)
        reed=unit('Reed',initiative={'type':'adjacent_bloodbattle','amount':4,'triggers':2});events=[]
        server.resolve_one_precombat_effect('initiative',reed,1,[a,reed,b,far],[],'left',events)
        self.assertEqual((a['attack'],b['attack'],far['attack']),(7,9,1))

    def test_rockrock_chained_bullet_kills(self):
        effect={'type':'leftmost_bullet_growth','damage':3,'growth':1}
        a=unit('Rockrock',bloodbattle=effect,initiative=effect)
        foes=[unit('E1'),unit('E2'),unit('E3')]
        for b in foes: b['current_hp']=2
        events=[]
        server.resolve_one_precombat_effect('initiative',a,0,[a],foes,'left',events)
        self.assertTrue(all(b is None for b in foes))
        self.assertEqual(a['attack'],5) # initiative + 3 kills
        shots=[e for e in events if e.get('damage_type')=='bullet']
        self.assertEqual([e['to_slot'] for e in shots],[1,2,3])

    def test_harold_aura_removed_and_not_permanent(self):
        a=unit('Ally');h=unit('Harold',bloodbattle_aura=2);team=[a,h];events=[]
        server.resolve_bloodbattle(a,0,'left',team,[],events)
        self.assertEqual(a['attack'],3)
        saved=[unit('Ally')];server.apply_persistent_battle_gains(saved,events)
        self.assertEqual(saved[0]['attack'],1)
        h['current_hp']=0
        server.handle_unit_death(h,1,'left',team,[],events)
        server.resolve_bloodbattle(a,0,'left',team,[],events)
        self.assertEqual(a['attack'],3)

    def test_logistics_bloodbattle_keeps_growth_without_bullets(self):
        for golden in [False,True]:
            amount=2 if golden else 1
            horn=unit('Horn',bloodbattle={'type':'team_growth_shop_bullet','amount':amount,'multiplier':amount},battle_shop_level=4)
            rock=unit('Rockrock',bloodbattle={'type':'leftmost_bullet_growth','damage':4,'growth':amount})
            mint=unit('Mint',logistics={'type':'adjacent_buff','attack':2,'max_hp':2,'bloodbattle_triggers':2})
            enemy=unit('Enemy',shield=True,lock_hp=True)
            events=[];team=[horn,mint,rock]
            server.apply_logistics_effects(team,'left',events,[enemy])
            self.assertEqual(enemy['current_hp'],100)
            self.assertTrue(enemy['shield']);self.assertTrue(enemy['lock_hp'])
            self.assertFalse(any(e.get('damage_type')=='bullet' or e.get('type') in ['shield_block','cumulative_counter'] for e in events))
            self.assertEqual(horn['attack'],3+2*amount)
            self.assertEqual(rock['attack'],3+4*amount)
            self.assertFalse(server._logistics_active.get())
            enemy.pop('shield');enemy.pop('lock_hp');events=[]
            server.resolve_bloodbattle(horn,0,'left',team,[enemy],events)
            self.assertTrue(any(e.get('damage_type')=='bullet' for e in events))
            self.assertLess(enemy['current_hp'],100)

    def test_logistics_context_restored_after_failure(self):
        @server.logistics_phase
        def fail():
            self.assertTrue(server._logistics_active.get())
            raise ValueError('test')
        with self.assertRaises(ValueError):fail()
        self.assertFalse(server._logistics_active.get())

    def test_mint_adjacent_bloodbattle_repetitions(self):
        a=unit('A',bloodbattle=1);b=unit('B',bloodbattle=2);far=unit('Far',bloodbattle=9)
        mint=unit('Mint',logistics={'type':'adjacent_buff','attack':4,'max_hp':4,'bloodbattle_triggers':2})
        server.apply_logistics_effects([a,mint,b,far],'left',[])
        self.assertEqual((a['attack'],b['attack'],far['attack']),(7,9,1))

    def test_vendela_repeats_same_leftmost_targets(self):
        for count in (1,2):
            a=unit('Vendela',initiative={'type':'leftmost_set_hp','count':count});foes=[unit('E1'),unit('E2'),unit('E3')];events=[]
            for _ in range(3):server.resolve_one_precombat_effect('initiative',a,0,[a],foes,'left',events)
            self.assertEqual([b['current_hp'] for b in foes],[1]*count+[100]*(3-count))
            self.assertEqual(sum(e.get('type')=='set_hp' for e in events),count*3)

    def test_temporary_bloodbattle_stacks_and_persists_stats(self):
        a=unit('Grani',bloodbattle=1,temporary_bloodbattle=[2,3]);b=unit('Enemy');b['current_hp']=1
        events=[];saved=[dict(a)]
        server.perform_attack_action(a,0,'left',[a],[b],events)
        self.assertEqual(a['attack'],7)
        self.assertEqual([e['attack_gain'] for e in events if e.get('mechanic')=='bloodbattle'],[1,2,3])
        server.apply_persistent_battle_gains(saved,events)
        self.assertEqual(saved[0]['attack'],7)


    def test_bloodbattle_attack_and_persistence(self):
        for amount in (1,2):
            a=unit('Grani',bloodbattle=amount);b=unit('Enemy');b['current_hp']=1
            events=[];saved=[dict(a)]
            server.perform_attack_action(a,0,'left',[a],[b],events)
            self.assertEqual(a['attack'],1+amount)
            server.apply_persistent_battle_gains(saved,events)
            self.assertEqual(saved[0]['attack'],1+amount)
            self.assertEqual(saved[0]['max_hp'],100+amount)

    def test_bloodbattle_saves_nonpositive_attacker(self):
        for hp,amount,expected in ((1,1,1),(1,2,2),(1,1,0),(1,1,-2)):
            a=unit('Grani',bloodbattle=amount);a['current_hp']=hp
            b=unit('Enemy');b['current_hp']=1;b['attack']=hp+amount-expected
            allies=[a];events=[]
            server.perform_attack_action(a,0,'left',allies,[b],events)
            self.assertEqual(a['current_hp'],expected)
            self.assertEqual(a['attack'],1+amount)
            self.assertEqual(allies[0] is a,expected>0)
            self.assertEqual(sum(e.get('mechanic')=='bloodbattle' for e in events),1)

    def test_negative_health_preserved_and_saved_during_effect(self):
        for hp_gain in (3,4,5):
            a=unit('Shooter');b=unit('Target');b['current_hp']=1
            allies=[a];foes=[b];events=[]
            @server.atomic_effect
            def action(source,idx,side,mine,enemies,events):
                server.deal_spell_damage(source,idx,side,mine,enemies,0,b,5,events)
                self.assertEqual(b['current_hp'],-4)
                self.assertEqual(next(e for e in events if e.get('damage_type')=='spell')['target_hp'],-4)
                server.apply_team_buff(b,0,'right',enemies,{'max_hp':hp_gain},events)
            action(a,0,'left',allies,foes,events)
            self.assertEqual(foes[0] is b,hp_gain>4)

    def test_bloodbattle_exclusions(self):
        for mode in ('counter','legacy','rescued'):
            a=unit('Grani',bloodbattle=1);b=unit('Enemy');events=[]
            if mode=='counter':
                b['current_hp']=1
                server.perform_attack_action(b,0,'right',[b],[a],events)
            elif mode=='mutual':
                a['current_hp']=b['current_hp']=1
                server.perform_attack_action(a,0,'left',[a],[b],events)
            elif mode=='legacy':
                b['current_hp']=1
                server.deal_bullet_damage(a,0,'left',[a],[b],0,b,2,events,source_effect='legacy')
            else:
                b['current_hp']=1;pending=[];foes=[b]
                server.deal_spell_damage(a,0,'left',[a],foes,0,b,2,events,pending_deaths=pending)
                b['current_hp']=2
                server.resolve_pending_deaths(pending,events)
            self.assertFalse(any(e.get('mechanic')=='bloodbattle' for e in events),mode)

    def test_bloodbattle_skill_kills_count_separately(self):
        for damage in (server.deal_bullet_damage,server.deal_spell_damage):
            a=unit('Grani',bloodbattle=1);foes=[unit('E1'),unit('E2')];events=[];pending=[]
            for i,b in enumerate(foes):
                b['current_hp']=1
                damage(a,0,'left',[a],foes,i,b,2,events,pending_deaths=pending)
            server.resolve_pending_deaths(pending,events)
            self.assertEqual(a['attack'],3)
            self.assertEqual(sum(e.get('mechanic')=='bloodbattle' for e in events),2)

    def test_collision_can_save_legacy_unit_before_death(self):
        for venom in (False,True):
            attacker=unit('Enemy',venom=venom);attacker['attack']=2
            victim=unit('W',guard=True,legacy={'type':'all_units_bullet_damage','damage':1,'hits':1});victim['current_hp']=1
            mostima=unit('Mostima',cumulative_damage={'type':'team_buff','threshold':1,'attack':0,'max_hp':2})
            allies=[victim,mostima];events=[]
            server.perform_attack_action(attacker,0,'right',[attacker],allies,events)
            if venom:
                self.assertIsNone(allies[0])
                self.assertTrue(victim['_death_confirmed'])
                self.assertTrue(any(e.get('type')=='w_barrage_start' for e in events))
            else:
                self.assertIs(allies[0],victim)
                self.assertEqual(victim['current_hp'],1)
                self.assertFalse(any(e.get('type') in ('death','w_barrage_start') for e in events))

    def test_legacy_source_excluded_after_confirmed_death(self):
        victim=unit('W',legacy={'type':'all_units_bullet_damage','damage':1,'hits':1},cumulative_damage={'threshold':1,'attack':9,'max_hp':9})
        victim['current_hp']=0
        mostima=unit('Mostima',cumulative_damage={'type':'team_buff','threshold':1,'attack':1,'max_hp':2})
        allies=[victim,mostima];events=[]
        server.handle_unit_death(victim,0,'left',allies,[unit('Enemy')],events)
        self.assertIsNone(allies[0]);self.assertTrue(victim['_death_confirmed'])
        self.assertEqual(victim['current_hp'],0)
        self.assertNotIn('cumulative_damage_count',victim)
        self.assertFalse(any(e.get('slot')==1 and e.get('type') in ('team_buff','cumulative_counter','permanent_buff') for e in events))
        server.apply_unit_buff(victim,atk=100,hp=100)
        self.assertEqual(victim['current_hp'],0);self.assertEqual(victim['attack'],1)
        server.handle_unit_death(victim,0,'left',allies,[],events)
        self.assertEqual(sum(e.get('type')=='w_barrage_start' for e in events),1)

    def test_w_buff_saves_zero_hp_units_and_triggers_morale(self):
        source=unit('W');source['current_hp']=0
        mostima=unit('Mostima',cumulative_damage={'type':'team_buff','threshold':1,'attack':1,'max_hp':1})
        saved=unit('Saved',morale={'max_hp':1})
        mostima['current_hp']=saved['current_hp']=1
        allies=[None,mostima,saved];foes=[unit('Enemy')];events=[]
        server.trigger_legacy_effect(source,0,'left',allies,foes,events,{'type':'all_units_bullet_damage','hits':1,'damage':1})
        self.assertIs(allies[1],mostima)
        self.assertIs(allies[2],saved)
        self.assertEqual(mostima['current_hp'],3)
        self.assertEqual(saved['current_hp'],6)
        self.assertEqual(len([e for e in events if e.get('mechanic')=='morale']),3)
        self.assertEqual(events[-1]['type'],'effect_end')

    def test_initiative_recovery_and_venom_exception(self):
        for venom in (False,True):
            source=unit('Source',venom=venom,initiative={'type':'random_bullet_damage','damage':2,'hits':1})
            target=unit('Target');target['current_hp']=1
            team=[source];foes=[target];events=[]
            def recover(*args):
                server.apply_team_buff(source,0,'right',foes,{'max_hp':3},events)
                # Even a direct HP gain cannot override venom's forced death.
                if venom: server.apply_unit_buff(target,hp=3)
            with patch.object(server,'record_damage_instances',side_effect=recover):
                server.resolve_one_precombat_effect('initiative',source,0,team,foes,'left',events)
            if venom:
                self.assertIsNone(foes[0]);self.assertEqual(target['current_hp'],0)
            else:
                self.assertIs(foes[0],target);self.assertEqual(target['current_hp'],2)

    def test_insufficient_recovery_still_dies_at_effect_end(self):
        source=unit('Source',initiative={'type':'random_bullet_damage','damage':4,'hits':1})
        target=unit('Target');target['current_hp']=1
        foes=[target];events=[]
        with patch.object(server,'record_damage_instances',side_effect=lambda *args:server.apply_team_buff(source,0,'right',foes,{'max_hp':1},events)):
            server.resolve_one_precombat_effect('initiative',source,0,[source],foes,'left',events)
        self.assertIsNone(foes[0])

    def test_collision_shields_both_sides(self):
        for side in ('left','right'):
            attacker=unit('Attacker',shield=True)
            target=unit('Target',shield=True)
            mine=[None,attacker];foes=[None,None,target];events=[]
            self.assertTrue(server.perform_attack_action(attacker,1,side,mine,foes,events))
            blocks=[e for e in events if e.get('type')=='shield_block']
            self.assertEqual([(e['source_slot'],e['slot']) for e in blocks],[(2,3),(3,2)])
            self.assertEqual(attacker['current_hp'],100)
            self.assertEqual(target['current_hp'],100)
            self.assertFalse(server.has_shield(attacker))
            self.assertFalse(server.has_shield(target))
            server.perform_attack_action(attacker,1,side,mine,foes,events)
            self.assertEqual(attacker['current_hp'],99)
            self.assertEqual(target['current_hp'],99)

    def test_battle_http_response(self):
        class QuietHandler(server.Handler):
            def log_message(self,*args): pass
        httpd=server.ThreadingHTTPServer(('127.0.0.1',0),QuietHandler)
        worker=threading.Thread(target=httpd.serve_forever,daemon=True);worker.start()
        payload=json.dumps({'left':[unit('Attacker')],'right':[unit('Shield',shield=True)]}).encode()
        request=Request(f'http://127.0.0.1:{httpd.server_port}/api/battle',data=payload,headers={'Content-Type':'application/json'})
        try:
            with patch.object(server,'player',return_value={'shop_level':1}),patch.object(server,'settle_battle',return_value={}) as settle:
                with urlopen(request,timeout=5) as response:
                    self.assertEqual(response.status,200)
                    result=json.load(response)
                self.assertIn(result['winner'],('left','right','draw'))
                self.assertTrue(any(e.get('type')=='shield_block' for e in result['events']))
                settle.assert_called_once()
                settle.reset_mock()
                with patch.object(server,'tavern_battle',side_effect=RuntimeError('test failure')),self.assertLogs(level='ERROR'):
                    with self.assertRaises(HTTPError) as raised: urlopen(request,timeout=5)
                    self.assertEqual(raised.exception.code,500)
                    self.assertIn('error',json.load(raised.exception))
                settle.assert_not_called()
        finally:
            httpd.shutdown();httpd.server_close();worker.join(timeout=5)

    def run_effect(self, kind, hits=7, shield=False):
        source=unit('W')
        mostima=unit('Mostima', cumulative_damage=dict(type='team_buff', threshold=3, attack=1, max_hp=1))
        morale=unit('Morale', morale=dict(attack=2))
        team=[source,mostima,morale]
        foes=[unit('Target', shield=shield)]
        events=[]
        if kind=='initiative':
            source['initiative']=dict(type='random_bullet_damage',hits=hits,damage=1)
            server.resolve_one_precombat_effect('initiative',source,0,team,foes,'left',events)
        else:
            server.trigger_legacy_effect(source,0,'left',team,foes,events,dict(type=kind,hits=hits,damage=1))
        counter=next(i for i,e in enumerate(events) if e.get('type')=='cumulative_counter')
        shots=[i for i,e in enumerate(events) if e.get('damage_type')=='bullet' or e.get('projectile')=='bullet']
        self.assertLess(max(shots),counter)
        count=events[counter]['added']
        self.assertEqual(mostima['cumulative_damage_count'],count%3)
        self.assertEqual(len([e for e in events if e.get('mechanic')=='morale']),count//3)
        self.assertEqual(morale['attack'],1+3*(count//3))
        return events

    def test_legacy(self): self.run_effect('bullet_damage')
    def test_initiative(self): self.run_effect('initiative')
    def test_w(self):
        for hits in (1,2):
            events=self.run_effect('all_units_bullet_damage',hits)
            starts=[i for i,e in enumerate(events) if e.get('type')=='w_barrage_start']
            ends=[i for i,e in enumerate(events) if e.get('type')=='w_barrage_end']
            self.assertEqual(len(starts),hits)
            self.assertEqual(len(ends),hits)
            for n,(start,end) in enumerate(zip(starts,ends)):
                self.assertLess(start,end)
                self.assertEqual(events[start]['volley'],n+1)
                self.assertEqual(events[end]['damage_instances'],4)
                if n: self.assertLess(ends[n-1],start)
            counter=next(e for e in events if e.get('type')=='cumulative_counter')
            self.assertEqual(counter['added'],hits*4)
    def test_shield(self):
        events=self.run_effect('bullet_damage',shield=True)
        self.assertTrue(any(e.get('projectile')=='bullet' for e in events))


if __name__=='__main__': unittest.main()
