import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server


class SaleTests(unittest.TestCase):
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
