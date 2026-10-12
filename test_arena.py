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


if __name__=='__main__':unittest.main()
