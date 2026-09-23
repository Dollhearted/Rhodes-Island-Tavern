import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server


class SaleTests(unittest.TestCase):
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
