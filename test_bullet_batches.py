import unittest
import json
import threading
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
import server


def unit(name, **extra):
    return dict(id=name, name=name, attack=1, max_hp=100, current_hp=100, **extra)


class BulletBatchTests(unittest.TestCase):
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
