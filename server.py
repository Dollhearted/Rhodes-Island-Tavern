"""???????SQLite ???????? API????python server.py"""
from __future__ import annotations
import copy, json, math, random, re, socket, sqlite3
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
DB_PATH = ROOT / "data" / "autochess.sqlite"
SCHEMA_PATH = ROOT / "schema.sql"
PORT = 11451
SKILLS = [
 (f"ammo_pact_{lv}",f"\u94f3\u5f39\u534f\u7ea6.{lv}","skill","\u94f3\u5f39\u534f\u7ea6",lv,lv,f"\u9009\u62e91\u4e2a\u68cb\u5b50\uff0c\u4f7f\u5176\u83b7\u5f97+{lv}/+{lv}\u548c{(lv+1)//2}\u70b9\u94f3\u5f39\u5f3a\u5ea6","#9b6dff",(lv+1)//2) for lv in range(1,7)
]
AI_POWER = [4,4,4,7,9,15,30,50,70,80,100,150,200,300]
SHOP_UPGRADE_BASE_COSTS = [5,7,9,11,13]
MAX_SHOP_LEVEL = 6
UNIT_CARD_COST = 3
UNIT_SELL_REFUND = 1
LATTERAN_BORDER_COLOR = "#e53935"
NEUTRAL_BORDER_COLOR = "#cfd4dc"
def unit_border_color(faction): return NEUTRAL_BORDER_COLOR if faction=="\u4e2d\u7acb" else LATTERAN_BORDER_COLOR

def belongs_to_faction(unit, faction):
    return bool(unit and unit.get("faction") in (faction,"\u4efb\u610f"))
@contextmanager
def db():
    con=sqlite3.connect(DB_PATH)
    con.row_factory=sqlite3.Row
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

def initialise_database():
    DB_PATH.parent.mkdir(exist_ok=True)
    schema=SCHEMA_PATH.read_text(encoding="utf-8")
    with db() as con:
        # Keep compatibility with databases created by older schema versions.
        con.execute("CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 3,health INTEGER NOT NULL DEFAULT 50,round INTEGER NOT NULL DEFAULT 1)")
        cols={row[1] for row in con.execute("PRAGMA table_info(players)")}
        if "shop_level" not in cols: con.execute("ALTER TABLE players ADD COLUMN shop_level INTEGER NOT NULL DEFAULT 1")
        if "shop_discount" not in cols: con.execute("ALTER TABLE players ADD COLUMN shop_discount INTEGER NOT NULL DEFAULT 0")
        if "total_gold_earned" not in cols: con.execute("ALTER TABLE players ADD COLUMN total_gold_earned INTEGER NOT NULL DEFAULT 3")
        con.executescript(schema)
        con.execute("INSERT OR IGNORE INTO players(id,gold,health,round,shop_level,shop_discount,total_gold_earned) VALUES('local',3,50,1,1,0,3)")

def unit_cards_from_db():
    with db() as con:
        try:
            rows=con.execute("SELECT * FROM unit_cards ORDER BY tier,id").fetchall()
        except sqlite3.OperationalError:
            initialise_database(); rows=con.execute("SELECT * FROM unit_cards ORDER BY tier,id").fetchall()
    units=[]
    for r in rows:
        data={"id":r["id"],"name":r["name"],"card_type":"unit","role":r["role"],"faction":r["faction"],"tier":r["tier"],"max_hp":r["max_hp"],"attack":r["attack"],"attack_range":r["attack_range"],"color":r["color"],"effect_value":0,"description":r["description"],"unit_id":r["id"],"stars":r["tier"]}
        try: extra=json.loads(r["extras_json"] or "{}")
        except json.JSONDecodeError: extra={}
        data.update(extra)
        data["description"]=r["description"]
        units.append(data)
    return units

def round_income(round_number): return 3+round_number
def shop_slot_count(level): return 4+(1 if level>=3 else 0)+(1 if level>=5 else 0)
def upgrade_cost_for(level, discount): return None if level>=MAX_SHOP_LEVEL else max(0,SHOP_UPGRADE_BASE_COSTS[level-1]-discount)

def with_shop_status(row):
    data=dict(row); data["upgrade_cost"]=upgrade_cost_for(data.get("shop_level",1),data.get("shop_discount",0)); data["next_income"]=round_income(data.get("round",1)); data["shop_slots"]=shop_slot_count(data.get("shop_level",1)); return data

def normalize_player_id(player_id):
    player_id=(player_id or "local").strip()[:80]
    return player_id if re.fullmatch(r"[A-Za-z0-9_.:-]+",player_id) else "local"

def ensure_player(player_id="local"):
    player_id=normalize_player_id(player_id)
    with db() as con: con.execute("INSERT OR IGNORE INTO players(id,gold,health,round,shop_level,shop_discount,total_gold_earned) VALUES(?,?,?,?,?,?,?)",(player_id,3,50,1,1,0,3))
    return player_id

def reset_player(player_id="local"):
    player_id=normalize_player_id(player_id)
    with db() as con: con.execute("INSERT OR REPLACE INTO players(id,gold,health,round,shop_level,shop_discount,total_gold_earned) VALUES(?,?,?,?,?,?,?)",(player_id,3,50,1,1,0,3))
    return player(player_id)

def cards():
    units=unit_cards_from_db()
    skills=[{"id":s[0],"name":s[1],"card_type":s[2],"faction":s[3],"cost":s[4],"effect_value":s[5],"description":s[6],"color":s[7],"bullet_strength":s[8],"target_scope":"single_unit","unit_id":None,"stars":0} for s in SKILLS]
    skills.append({"id":"economic_aid","name":"\u7ecf\u6d4e\u8d44\u52a9","card_type":"skill","faction":"\u6280\u80fd","cost":1,"effect_value":1,"description":"\u83b7\u5f971\u679a\u91d1\u5e01","color":"#f2c14e","bullet_strength":0,"target_scope":"self","effect":"gain_gold","universal_skill_pool":True,"unit_id":None,"stars":0})
    for lv in range(1,MAX_SHOP_LEVEL+1):
        skills.append({"id":f"four_seasons_{lv}","name":f"\u5929\u6709\u56db\u65f6.{lv}","card_type":"skill","faction":"\u6280\u80fd","cost":lv,"effect_value":lv,"description":f"\u9009\u62e91\u4e2a\u53cb\u65b9\u68cb\u5b50\u4f7f\u5176\u83b7\u5f97+{lv}/+{lv}\uff0c\u5e76\u83b7\u5f971\u56de\u5408\u3010\u540e\u52e4\uff1a\u81ea\u8eab\u83b7\u5f97+{lv}\u751f\u547d\u3011","color":"#f2c94c","bullet_strength":0,"target_scope":"single_unit","effect":"four_seasons","temporary_logistics_hp":lv,"mechanics":["logistics"],"unit_id":None,"stars":0})
    for lv in range(1,MAX_SHOP_LEVEL+1):
        skills.append({"id":f"harmony_prosperity_{lv}","name":f"和气生财.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":lv,"description":f"使用后使不同阵营的棋子获得+{lv}/+{lv}","color":"#63c7a6","bullet_strength":0,"target_scope":"board","effect":"harmony_prosperity","unit_id":None,"stars":0})
    skills.extend([
        {"id":"sincere_expectation","name":"诚挚期许","card_type":"skill","faction":"技能","cost":1,"effect_value":2,"description":"商店升级费用-2","color":"#76c7c0","bullet_strength":0,"target_scope":"board","effect":"reduce_upgrade_cost","reduce_upgrade_cost":2,"universal_skill_pool":True,"unit_id":None,"stars":0},
        {"id":"extreme_dispatch","name":"极限调度","card_type":"skill","faction":"技能","cost":1,"effect_value":0,"description":"随机从商店内获得1个棋子","color":"#e09f3e","bullet_strength":0,"target_scope":"board","effect":"take_random_shop_unit","universal_skill_pool":True,"unit_id":None,"stars":0},
        {"id":"anticipate_enemy","name":"料敌机先","card_type":"skill","faction":"技能","cost":1,"effect_value":0,"description":"本回合战斗如果胜利获得3金币，如果平局获得1金币","color":"#6c8ae4","bullet_strength":0,"target_scope":"board","effect":"battle_wager","win_gold":3,"draw_gold":1,"universal_skill_pool":True,"unit_id":None,"stars":0},
    ])
    tactical_values=[2,2,4,6,8,10]
    for lv,value in enumerate(tactical_values,1):
        skills.append({"id":f"tactical_armor_{lv}","name":f"战术装甲.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":value,"description":f"选择1个棋子使其获得+{value}/+{value}和嘲讽","color":"#788fbc","bullet_strength":0,"target_scope":"single_unit","effect":"tactical_armor","tactical_attack":value,"tactical_hp":value,"unit_id":None,"stars":0})
    skills.extend([
        {"id":"self_repair","name":"自我修复","card_type":"skill","faction":"技能","cost":1,"effect_value":0,"description":"选择1个友方棋子将其移除，挑选1个同星级的其他棋子","color":"#68b0ab","bullet_strength":0,"target_scope":"board_unit","effect":"self_repair","mechanics":["pick"],"universal_skill_pool":True,"unit_id":None,"stars":0},
        {"id":"emergency_defibrillation","name":"紧急除颤","card_type":"skill","faction":"技能","cost":1,"effect_value":0,"description":"选择1个友方棋子将其移除，获得一张原始复制","color":"#e76f51","bullet_strength":0,"target_scope":"board_unit","effect":"emergency_defibrillation","universal_skill_pool":True,"unit_id":None,"stars":0},
        {"id":"angel_blessing","name":"天使的祝福","card_type":"skill","faction":"技能","cost":1,"effect_value":0,"description":"选择1个商店内的棋子，使其攻击或生命翻倍","color":"#f4d35e","bullet_strength":0,"target_scope":"shop_unit","effect":"angel_blessing","universal_skill_pool":True,"unit_id":None,"stars":0},
        {"id":"kick_when_down","name":"落井下石","card_type":"skill","faction":"技能","cost":1,"effect_value":3,"description":"选择1个友方棋子，将其移除并获得3金币","color":"#9d4edd","bullet_strength":0,"target_scope":"board_unit","effect":"remove_for_gold","gold":3,"universal_skill_pool":True,"unit_id":None,"stars":0},
        {"id":"prepared_future","name":"有备无患","card_type":"skill","faction":"技能","cost":1,"effect_value":2,"description":"下回合获得2枚金币","color":"#5aa9e6","bullet_strength":0,"target_scope":"board","effect":"next_round_gold","next_round_gold":2,"universal_skill_pool":True,"unit_id":None,"stars":0},
        {"id":"strategic_command","name":"运筹帷幄","card_type":"skill","faction":"技能","cost":1,"effect_value":1,"description":"使全体友方棋子获得1回合【先手：自身获得+1/+1】","color":"#b86bff","bullet_strength":0,"target_scope":"board","effect":"team_temporary_initiative_buff","temporary_initiative_attack":1,"temporary_initiative_hp":1,"mechanics":["initiative"],"universal_skill_pool":True,"unit_id":None,"stars":0},
        {"id":"law_of_jungle","name":"弱肉强食","card_type":"skill","faction":"技能","cost":1,"effect_value":1,"description":"移除1个友方棋子，获得1金币，并使其他4个友方棋子获得其20%的属性","color":"#9b5d3f","bullet_strength":0,"target_scope":"board_unit","effect":"sacrifice_share_stats","gold":1,"share_ratio":0.2,"share_count":4,"rounding":"ceil","universal_skill_pool":True,"unit_id":None,"stars":0},
        {"id":"initiative_support","name":"先手支援","card_type":"skill","faction":"技能","cost":4,"effect_value":0,"description":"挑选1张先手棋子，商店4级解锁","color":"#ff3fd1","bullet_strength":0,"target_scope":"board","effect":"discover_unit_mechanic","discover_mechanic":"initiative","discover_label":"先手","mechanics":["pick"],"universal_skill_pool":True,"min_shop_level":4,"available_from_unlock":True,"unit_id":None,"stars":0},
        {"id":"guard_support","name":"嘲讽支援","card_type":"skill","faction":"技能","cost":4,"effect_value":0,"description":"挑选1张嘲讽棋子，商店4级解锁","color":"#66d9ff","bullet_strength":0,"target_scope":"board","effect":"discover_unit_mechanic","discover_mechanic":"guard","discover_label":"嘲讽","mechanics":["pick"],"universal_skill_pool":True,"min_shop_level":4,"available_from_unlock":True,"unit_id":None,"stars":0},
        {"id":"logistics_support","name":"后勤支援","card_type":"skill","faction":"技能","cost":4,"effect_value":0,"description":"挑选1张后勤棋子，商店4级解锁","color":"#a6e22e","bullet_strength":0,"target_scope":"board","effect":"discover_unit_mechanic","discover_mechanic":"logistics","discover_label":"后勤","mechanics":["pick"],"universal_skill_pool":True,"min_shop_level":4,"available_from_unlock":True,"unit_id":None,"stars":0},
        {"id":"legacy_support","name":"遗计支援","card_type":"skill","faction":"技能","cost":4,"effect_value":0,"description":"挑选1张遗计棋子，商店4级解锁","color":"#c792ea","bullet_strength":0,"target_scope":"board","effect":"discover_unit_mechanic","discover_mechanic":"legacy","discover_label":"遗计","mechanics":["pick"],"universal_skill_pool":True,"min_shop_level":4,"available_from_unlock":True,"unit_id":None,"stars":0},
        {"id":"spend_to_avoid_disaster","name":"破财消灾","card_type":"skill","faction":"技能","cost":1,"effect_value":2,"description":"获得2次刷新免费","color":"#57c7a3","bullet_strength":0,"target_scope":"board","effect":"grant_free_refreshes","free_refreshes":2,"universal_skill_pool":True,"unit_id":None,"stars":0},
    ])
    chosen_values=[1,2,2,3,3,4]
    for lv,value in enumerate(chosen_values,1):
        skills.extend([
            {"id":f"cherish_companions_{lv}","name":f"手足相惜.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":[2,2,4,6,8,10][lv-1],"description":f"使最左侧和最右侧的棋子获得+{[2,2,4,6,8,10][lv-1]}/+{[2,2,4,6,8,10][lv-1]}","color":"#e9c46a","bullet_strength":0,"target_scope":"board","effect":"edge_team_buff","unit_id":None,"stars":0},
            {"id":f"valor_army_{lv}","name":f"勇冠三军.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":math.ceil(lv/2),"description":f"使全体友方棋子获得+{math.ceil(lv/2)}/+{math.ceil(lv/2)}","color":"#d1495b","bullet_strength":0,"target_scope":"board","effect":"team_permanent_buff","unit_id":None,"stars":0},
            {"id":f"link_protocol_{lv}","name":f"链路协议.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":lv,"description":f"选择1个友方棋子，使其与其相邻的两个棋子获得+{lv}/+{lv}","color":"#4bb3fd","bullet_strength":0,"target_scope":"single_unit","effect":"adjacent_team_buff","unit_id":None,"stars":0},
            {"id":f"fading_afterglow_{lv}","name":f"回光黯淡.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":1,"description":f"随机给1个棋子+1/+1，重复{lv+1}次","color":"#8ecae6","bullet_strength":0,"target_scope":"board","effect":"random_repeated_buff","repetitions":lv+1,"unit_id":None,"stars":0},
            {"id":f"lamp_dream_{lv}","name":f"挑灯问梦.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":lv,"description":f"选择1个商店棋子，保留其属性并变为星级+1的棋子，并获得+{lv}/+{lv}","color":"#a173c2","bullet_strength":0,"target_scope":"shop_unit","effect":"upgrade_shop_unit_transform","transform_buff":lv,"unit_id":None,"stars":0},
            {"id":f"mirror_phantom_{lv}","name":f"镜中虚影.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":0,"description":f"挑选1张不超过{lv}星的棋子","color":"#7785ac","bullet_strength":0,"target_scope":"board","effect":"discover_unit_upto","discover_max_star":lv,"mechanics":["pick"],"unit_id":None,"stars":0},
            {"id":f"candle_shadow_{lv}","name":f"秉烛照影.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":lv,"description":f"使全体友方棋子获得1回合【后勤：自身获得+{lv}/+{lv}】","color":"#d98c4f","bullet_strength":0,"target_scope":"board","effect":"team_temporary_logistics","temporary_logistics_attack":lv,"temporary_logistics_hp":lv,"mechanics":["logistics"],"unit_id":None,"stars":0},
            {"id":f"chosen_one_{lv}","name":f"受选之人.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":value,"description":f"随机获得1个不超过{lv}星的棋子，并使其获得+{value}/+{value}","color":"#c7a44b","bullet_strength":0,"target_scope":"board","effect":"gain_random_unit_upto","max_star":lv,"unit_id":None,"stars":0},
            {"id":f"swallow_suffering_{lv}","name":f"吞咽苦厄.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":lv,"description":f"选择一个棋子，使其获得【受伤时：永久获得+{lv}/+{lv}（最多4次）】","color":"#8d5a97","bullet_strength":0,"target_scope":"single_unit","effect":"grant_injury_growth","injury_growth":lv,"injury_growth_limit":4,"mechanics":["permanent"],"unit_id":None,"stars":0},
        ])
    for lv in range(1,MAX_SHOP_LEVEL+1):
        skills.append({"id":f"past_dust_{lv}","name":f"过往尘埃.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":0,"description":f"挑选一张{lv}星技能卡","color":"#8d7cc7","bullet_strength":0,"target_scope":"board","effect":"discover_skill","discover_skill_star":lv,"mechanics":["pick"],"unit_id":None,"stars":0})
    fertile_values=[2,2,4,6,8,10]
    for lv,value in enumerate(fertile_values,1):
        skills.append({"id":f"fertile_soil_{lv}","name":f"沃土予身.{lv}","card_type":"skill","faction":"技能","cost":lv,"effect_value":value,"base_effect_value":value,"description":f"选择1个友方棋子，使其获得+{value}/+{value}，并永久提升【沃土予身】+2/+2","color":"#9b8a63","bullet_strength":0,"target_scope":"single_unit","effect":"fertile_soil","growth_per_use":2,"unit_id":None,"stars":0})
    gift_debuff=[1,2,3,4,5,6]; gift_logistics=[(1,1),(2,2),(2,2),(3,3),(3,3),(4,4)]
    for lv in range(1,MAX_SHOP_LEVEL+1):
        debuff=gift_debuff[lv-1]; atk,hp=gift_logistics[lv-1]
        skills.append({"id":f"gift_exchange_{lv}","name":f"\u793c\u5c1a\u5f80\u6765.{lv}","card_type":"skill","faction":"\u6280\u80fd","cost":lv,"effect_value":0,"description":f"\u9009\u62e91\u4e2a\u90e8\u5c06\uff0c\u4f7f\u5176-{debuff}/-{debuff}\uff0c\u5e76\u83b7\u5f97\u3010\u540e\u52e4\uff1a\u81ea\u8eab\u83b7\u5f97+{atk}/+{hp}\u3011","color":"#e6a94a","bullet_strength":0,"target_scope":"single_unit","effect":"gift_exchange","stat_penalty":debuff,"permanent_logistics_attack":atk,"permanent_logistics_hp":hp,"mechanics":["logistics"],"unit_id":None,"stars":0})
    return sorted(units+skills,key=lambda c:(card_tier(c),c["id"]))

def card_tier(card): return card["tier"] if card.get("card_type")=="unit" else card["cost"]
def card_purchase_cost(card): return UNIT_CARD_COST if card.get("card_type")=="unit" else card["cost"]

def player(player_id="local"):
    player_id=ensure_player(player_id)
    with db() as con:
        row=con.execute("SELECT id,gold,health,round,shop_level,shop_discount,total_gold_earned FROM players WHERE id=?",(player_id,)).fetchone()
        if not row: raise ValueError("\u73a9\u5bb6\u4e0d\u5b58\u5728")
        return with_shop_status(row)

def shop(count=None, player_id="local"):
    level=player(player_id)["shop_level"]; count=shop_slot_count(level) if count is None else count
    pool=[c for c in cards() if c["card_type"]=="unit" and card_tier(c)<=level]
    return [dict(random.choice(pool)) for _ in range(count)] if pool else [None]*count

def buy_card(card_id, player_id="local", bypass_shop_level=False):
    with db() as con:
        card=next((c for c in cards() if c["id"]==card_id),None); row=con.execute("SELECT gold,shop_level FROM players WHERE id=?",(player_id,)).fetchone()
        if not card: raise ValueError("\u5361\u724c\u4e0d\u5b58\u5728")
        if card["card_type"]!="unit": raise ValueError("\u6280\u80fd\u5361\u4e0d\u80fd\u4ece\u5546\u5e97\u8d2d\u4e70")
        if not row: raise ValueError("\u73a9\u5bb6\u4e0d\u5b58\u5728")
        if card_tier(card)>row["shop_level"] and not bypass_shop_level: raise ValueError("\u5546\u5e97\u7b49\u7ea7\u4e0d\u8db3\uff0c\u4e0d\u80fd\u8d2d\u4e70\u8be5\u68cb\u5b50")
        cost=card_purchase_cost(card)
        if row["gold"]<cost: raise ValueError("\u91d1\u5e01\u4e0d\u8db3")
        con.execute("UPDATE players SET gold=? WHERE id=?",(row["gold"]-cost,player_id))
    data=player(player_id); data["card"]=card; data["spent"]=cost; return data

def sell_unit(card_id, player_id="local", half=False):
    card=next((c for c in cards() if c["id"]==card_id),None)
    if not card or card["card_type"]!="unit": raise ValueError("\u53ea\u80fd\u51fa\u552e\u68cb\u5b50")
    with db() as con:
        row=con.execute("SELECT gold FROM players WHERE id=?",(player_id,)).fetchone()
        if not row: raise ValueError("\u73a9\u5bb6\u4e0d\u5b58\u5728")
        refund=UNIT_SELL_REFUND; con.execute("UPDATE players SET gold=?,total_gold_earned=total_gold_earned+? WHERE id=?",(row["gold"]+refund,refund,player_id))
    data=player(player_id); data["refund"]=refund; return data

def refresh_shop(player_id="local"):
    with db() as con:
        row=con.execute("SELECT gold FROM players WHERE id=?",(player_id,)).fetchone()
        if not row or row["gold"]<1: raise ValueError("\u91d1\u5e01\u4e0d\u8db3")
        con.execute("UPDATE players SET gold=? WHERE id=?",(row["gold"]-1,player_id))
    data=player(player_id); data["shop"]=shop(player_id=player_id); data["spent"]=1; return data

def gain_gold(amount=1, player_id="local"):
    amount=max(0,int(amount or 0))
    with db() as con:
        row=con.execute("SELECT gold FROM players WHERE id=?",(player_id,)).fetchone()
        if not row: raise ValueError("\u73a9\u5bb6\u4e0d\u5b58\u5728")
        con.execute("UPDATE players SET gold=?,total_gold_earned=total_gold_earned+? WHERE id=?",(row["gold"]+amount,amount,player_id))
    data=player(player_id); data["gained"]=amount; return data

def reduce_upgrade_cost(amount=2, player_id="local"):
    amount=max(0,int(amount or 0))
    with db() as con:
        row=con.execute("SELECT shop_discount FROM players WHERE id=?",(player_id,)).fetchone()
        if not row: raise ValueError("玩家不存在")
        con.execute("UPDATE players SET shop_discount=shop_discount+? WHERE id=?",(amount,player_id))
    data=player(player_id);data["reduced"]=amount;return data

def upgrade_shop(player_id="local"):
    with db() as con:
        row=con.execute("SELECT gold,shop_level,shop_discount FROM players WHERE id=?",(player_id,)).fetchone()
        if not row: raise ValueError("\u73a9\u5bb6\u4e0d\u5b58\u5728")
        if row["shop_level"]>=MAX_SHOP_LEVEL: raise ValueError("\u5546\u5e97\u5df2\u6ee1\u7ea7")
        cost=upgrade_cost_for(row["shop_level"],row["shop_discount"])
        if row["gold"]<cost: raise ValueError("\u91d1\u5e01\u4e0d\u8db3")
        con.execute("UPDATE players SET gold=?,shop_level=?,shop_discount=0 WHERE id=?",(row["gold"]-cost,row["shop_level"]+1,player_id))
    data=player(player_id); data["spent"]=cost; return data

def first_striker(left,right):
    lc=sum(u is not None for u in left); rc=sum(u is not None for u in right)
    if lc!=rc: return "left" if lc>rc else "right"
    la=next((u for u in left if u),None); ra=next((u for u in right if u),None)
    if not la: return "right"
    if not ra: return "left"
    return random.choice(["left","right"]) if la["attack"]==ra["attack"] else ("left" if la["attack"]>ra["attack"] else "right")

def bullet_base_damage(unit):
    for k in ("bullet_damage","bullet_base_damage","ammo_damage","gun_damage"):
        v=unit.get(k,0)
        if v: return int(v)
    return 0

def bullet_strength(unit):
    # Strength belongs to the source unit itself. Legacy effects trigger after
    # death, so do not discard the source's stored strength merely because its
    # current_hp is already 0.
    if not unit:
        return 0
    total=0
    for k in ("bullet_strength","bullet_strength_temp","bullet_power","ammo_strength","ammo_power","gun_strength","gun_power"):
        total+=int(unit.get(k,0) or 0)
    return total

def bullet_condition_met(unit,mine,foes,round_number):
    if str(unit.get("bullet_trigger","")).lower()=="always": return True
    return any(bool(unit.get(k)) for k in ("bullet_ready","bullet_triggered","bullet_condition_met"))

def is_guard(unit): return bool(unit and (unit.get("guard") or "guard" in unit.get("mechanics",[])))
def has_shield(unit): return bool(unit and (unit.get("shield") or "shield" in unit.get("mechanics",[])))
def has_guardian(unit): return bool(unit and (unit.get("guardian") or "guardian" in unit.get("mechanics",[])))
def consume_shield(unit):
    if not has_shield(unit): return False
    unit["shield"]=False
    unit["mechanics"]=[m for m in unit.get("mechanics",[]) if m!="shield"]
    return True

def has_venom(unit): return bool(unit and (unit.get("venom") or "venom" in unit.get("mechanics",[])))

def apply_venom_after_damage(source, target, damage):
    if damage<=0 or not has_venom(source) or source.get("venom_consumed"): return False
    source["venom_consumed"]=True
    target["current_hp"]=0
    target["_venom_destroyed"]=True
    return True

def mark_killer(unit, killer_index):
    unit["_killer_index"]=int(killer_index)

def choose_target(foes):
    living=[(i,u) for i,u in enumerate(foes) if u and u.get("current_hp",0)>0]; guards=[(i,u) for i,u in living if is_guard(u)]; return random.choice(guards or living)
def nearest_target(foes, origin_index, include_dead=False):
    living=[(i,u) for i,u in enumerate(foes) if u and u.get("current_hp",0)>0]
    candidates=[(i,u) for i,u in living if is_guard(u)] or living
    if not candidates and include_dead:
        candidates=[(i,u) for i,u in enumerate(foes) if u and u.get("current_hp",0)<=0]
    if not candidates: return None
    dist=min(abs(i-origin_index) for i,_ in candidates); return random.choice([(i,u) for i,u in candidates if abs(i-origin_index)==dist])

def random_target(foes, include_dead=False):
    living=[(i,u) for i,u in enumerate(foes) if u and u.get("current_hp",0)>0]
    if living: return random.choice(living)
    if include_dead:
        dead=[(i,u) for i,u in enumerate(foes) if u and u.get("current_hp",0)<=0]
        return random.choice(dead) if dead else None
    return None

def queue_pending_death(pending_deaths, unit, unit_index, side, team, foes):
    if not any(existing is unit for existing, *_ in pending_deaths):
        pending_deaths.append((unit,unit_index,side,team,foes))

ROUND_AURA_KEYS=("_round_aura_attack","_round_aura_hp","_round_aura_bullet_strength")

def round_aura_values(team, source=None):
    units=[u for u in team if u]
    if source is not None: units.append(source)
    return tuple(max([0]+[int(u.get(k,0) or 0) for u in units]) for k in ROUND_AURA_KEYS)

def register_round_aura(team, attack=0, hp=0, bullet_strength_gain=0, source=None):
    gains=(int(attack or 0),int(hp or 0),int(bullet_strength_gain or 0))
    units=[u for u in team if u]
    if source is not None and all(u is not source for u in units): units.append(source)
    for u in units:
        for key,gain in zip(ROUND_AURA_KEYS,gains):
            u[key]=int(u.get(key,0) or 0)+gain

def apply_round_aura_to_unit(unit, team, source=None):
    attack,hp,bs=round_aura_values(team,source)
    if attack: unit["attack"]=int(unit.get("attack",0) or 0)+attack
    if hp:
        unit["max_hp"]=int(unit.get("max_hp",1) or 1)+hp
        unit["current_hp"]=int(unit.get("current_hp",unit["max_hp"]-hp) or 0)+hp
    if bs: unit["bullet_strength_temp"]=int(unit.get("bullet_strength_temp",0) or 0)+bs
    for key,value in zip(ROUND_AURA_KEYS,(attack,hp,bs)): unit[key]=value
    return unit

def make_revived_unit(unit, team=None):
    if unit.get("revive_consumed_by_summon"): return None
    if not (unit.get("revive") or "revive" in unit.get("mechanics",[])): return None
    # Return as an unbuffed initial copy, preserving card quality. Round-long
    # auras are then reapplied because they remain active for the whole battle.
    base = next((copy.deepcopy(c) for c in cards() if c.get("card_type")=="unit" and c.get("id")==unit.get("id")), None)
    revived = base or copy.deepcopy(unit)
    if unit.get("golden"):
        revived=apply_golden_unit(revived)
        revived["attack"]=int(base.get("attack",0) or 0)*2 if base else int(revived.get("attack",0) or 0)
        revived["max_hp"]=int(base.get("max_hp",1) or 1)*2 if base else int(revived.get("max_hp",1) or 1)
    revived["current_hp"] = revived.get("max_hp", 1)
    revived.pop("revive", None)
    revived["mechanics"] = [m for m in revived.get("mechanics", []) if m != "revive"]
    for k in ("bullet_strength","bullet_strength_temp","bullet_power","ammo_strength","ammo_power","gun_strength","gun_power","summoned_by_phase"):
        revived.pop(k, None)
    apply_round_aura_to_unit(revived,team or [],unit)
    revived["summoned_by_revival"] = True
    return revived

def trigger_death_feud(dead_unit, dead_index, side, allies, foes, events):
    for idx,u in enumerate(allies):
        if not u or u.get("current_hp",0)<=0: continue
        if idx==dead_index: continue
        eff=u.get("death_feud") or {}
        if not eff: continue
        threshold=max(1,int(eff.get("threshold",1) or 1))
        count=int(u.get("death_feud_count",0) or 0)+1; triggers=count//threshold; u["death_feud_count"]=count%threshold
        events.append({"type":"death_feud_counter","side":side,"slot":idx+1,"from":u["name"],"count":u["death_feud_count"],"threshold":threshold,"dead":dead_unit.get("name","")})
        for _ in range(triggers):
            if u.get("current_hp",0)<=0: break
            if eff.get("type")=="random_bullet_damage":
                target_count=max(1,int(eff.get("target_count",1) or 1))
                living=[(i,t) for i,t in enumerate(foes) if t and t.get("current_hp",0)>0]
                for ti,target in random.sample(living,min(target_count,len(living))) if living else []:
                    if u.get("current_hp",0)<=0: break
                    deal_bullet_damage(u,idx,side,allies,foes,ti,target,eff.get("damage",0),events,source_effect="death_feud")
                gain=int(eff.get("self_bullet_strength",0) or 0)
                if gain:
                    u["bullet_strength_temp"]=int(u.get("bullet_strength_temp",0) or 0)+gain
                    trigger_morale(u,idx,side,events,"death_feud",allies)
                    events.append({"type":"death_feud_buff","side":side,"slot":idx+1,"from":u["name"],"bullet_strength_gain":gain,"bullet_strength_temp":u.get("bullet_strength_temp",0),"bullet_strength":bullet_strength(u),"source_effect":"death_feud"})

def friendly_legacy_trigger_count(team):
    # A Logos only amplifies friendly legacies while it is alive. Multiple
    # copies do not stack; the strongest (normal 2 / golden 3) wins.
    return max(
        [1]
        + [
            max(1, int(u.get("legacy_multiplier", 1) or 1))
            for u in team
            if u and int(u.get("current_hp", u.get("max_hp", 1)) or 0) > 0
        ]
    )


def handle_unit_death(unit, unit_index, side, team, foes, events):
    team[unit_index]=None
    legacy_trigger_index = 0
    while legacy_trigger_index < friendly_legacy_trigger_count(team):
        trigger_legacy(unit,unit_index,side,team,foes,events)
        legacy_trigger_index += 1
    trigger_death_feud(unit,unit_index,side,team,foes,events)
    revived=make_revived_unit(unit,team)
    if revived and team[unit_index] is None:
        team[unit_index]=revived
        events.append({"type":"revive","side":side,"slot":unit_index+1,"from":unit["name"],"unit":copy.deepcopy(revived)})


def resolve_pending_deaths(pending_deaths, events):
    for unit,unit_index,side,team,foes in pending_deaths:
        # Damage effects settle as one atomic initiative/legacy effect. A unit
        # remains targetable until the effect ends, and dies only if it is
        # still at 0 HP then (an in-effect permanent HP gain may save it).
        if 0<=unit_index<len(team) and team[unit_index] is unit and unit.get("current_hp",0)<=0:
            handle_unit_death(unit,unit_index,side,team,foes,events)

def cumulative_damage_effect(unit):
    if not unit: return None
    eff=unit.get("cumulative_damage")
    if eff: return eff
    return {"threshold":3,"attack":1,"max_hp":1,"counter_key":"cumulative_damage_count"} if unit.get("id")=="Enforcer" else None

def record_damage_instance(side, team, events):
    for idx,u in enumerate(team):
        # Units that are still present but have just been reduced to 0 HP by the
        # same damage exchange may still receive/trigger cumulative permanent
        # buffs before death is finalized. Already-dead units are removed as None.
        if not u: continue
        eff=cumulative_damage_effect(u)
        if not eff: continue
        key=eff.get("counter_key","cumulative_damage_count"); threshold=max(1,int(eff.get("threshold",3) or 3))
        count=int(u.get(key,0) or 0)+1; triggers=count//threshold; count=count%threshold; u[key]=count
        events.append({"type":"cumulative_counter","side":side,"slot":idx+1,"from":u["name"],"mechanic":"cumulative","count":count,"threshold":threshold,"counter_key":key})
        if triggers:
            atk_gain=int(eff.get("attack",1) or 0)*triggers; hp_gain=int(eff.get("max_hp",1) or 0)*triggers; bs_gain=int(eff.get("bullet_strength",0) or 0)*triggers
            if eff.get("type")=="team_buff":
                apply_team_buff(u,idx,side,team,{"attack":atk_gain,"max_hp":hp_gain,"bullet_strength":bs_gain},events,source_effect="permanent")
            else:
                apply_unit_buff(u,atk_gain,hp_gain,bs_gain,unit_index=idx,side=side,events=events,source_effect="permanent",team=team)
                events.append({"type":"permanent_buff","side":side,"slot":idx+1,"from":u["name"],"mechanic":"permanent","attack_gain":atk_gain,"max_hp_gain":hp_gain,"bullet_strength_gain":bs_gain,"attack":u["attack"],"max_hp":u["max_hp"],"current_hp":u["current_hp"],"bullet_strength":u.get("bullet_strength",0),"count":count,"threshold":threshold,"counter_key":key})

def trigger_injury_growth(unit, unit_index, side, team, events, actual_damage):
    effect=unit.get("injury_growth") or {}
    if actual_damage<=0 or not effect: return
    used=int(unit.get("injury_growth_count",0) or 0); limit=max(1,int(effect.get("limit",4) or 4))
    if used>=limit: return
    amount=int(effect.get("amount",0) or 0); unit["injury_growth_count"]=used+1
    apply_unit_buff(unit,amount,amount,unit_index=unit_index,side=side,events=events,source_effect="permanent",team=team)
    events.append({"type":"permanent_buff","side":side,"slot":unit_index+1,"from":unit["name"],"to":unit["name"],"mechanic":"injury_growth","source_effect":"permanent","attack_gain":amount,"max_hp_gain":amount,"attack":unit.get("attack",0),"max_hp":unit.get("max_hp",1),"current_hp":unit.get("current_hp",0),"injury_growth_count":unit["injury_growth_count"]})

def deal_bullet_damage(source, source_index, side, allies, foes, target_index, target, base, events, source_effect=None, pending_deaths=None):
    strength=bullet_strength(source); dmg=int(base)+strength
    target_side="right" if side=="left" else "left"
    if dmg>0 and consume_shield(target):
        events.append({"type":"shield_block","side":target_side,"slot":target_index+1,"from":target["name"],"source":source.get("name",""),"source_side":side,"damage_blocked":dmg})
        record_damage_instance(side,allies,events)
        return False
    target["current_hp"]-=dmg
    trigger_injury_growth(target,target_index,target_side,foes,events,dmg)
    venom_triggered=apply_venom_after_damage(source,target,dmg)
    dead=target["current_hp"]<=0
    if dead: mark_killer(target,source_index)
    event={"side":side,"from":source["name"],"from_slot":source_index+1,"to":target["name"],"to_slot":target_index+1,"target_side":target_side,"damage_type":"bullet","damage":dmg,"bullet_base_damage":int(base),"bullet_strength":strength,"counter_damage":0,"target_hp":max(0,target["current_hp"]),"attacker_hp":max(0,source.get("current_hp",source.get("max_hp",0))),"target_dead":dead,"attacker_dead":False,"venom_triggered":venom_triggered}
    if source_effect: event["source_effect"]=source_effect
    events.append(event)
    if dmg>0:
        record_damage_instance(side,allies,events)
    if target.get("_venom_destroyed"):
        target["current_hp"]=0; dead=True; event["target_hp"]=0; event["target_dead"]=True
    if dead:
        if pending_deaths is None:
            handle_unit_death(target,target_index,target_side,foes,allies,events)
        elif foes[target_index] is target:
            queue_pending_death(pending_deaths,target,target_index,target_side,foes,allies)
    return dead

def deal_spell_damage(source, source_index, side, allies, foes, target_index, target, base, events, source_effect=None, pending_deaths=None):
    dmg=int(base); target_side="right" if side=="left" else "left"
    if dmg>0 and consume_shield(target):
        events.append({"type":"shield_block","side":target_side,"slot":target_index+1,"from":target["name"],"source":source.get("name",""),"source_side":side,"damage_blocked":dmg})
        return False
    target["current_hp"]-=dmg
    trigger_injury_growth(target,target_index,target_side,foes,events,dmg)
    venom_triggered=apply_venom_after_damage(source,target,dmg)
    dead=target["current_hp"]<=0
    if dead: mark_killer(target,source_index)
    event={"side":side,"from":source["name"],"from_slot":source_index+1,"to":target["name"],"to_slot":target_index+1,"target_side":target_side,"damage_type":"spell","damage":dmg,"spell_base_damage":int(base),"counter_damage":0,"target_hp":max(0,target["current_hp"]),"attacker_hp":max(0,source.get("current_hp",source.get("max_hp",0))),"target_dead":dead,"attacker_dead":False,"venom_triggered":venom_triggered}
    if source_effect: event["source_effect"]=source_effect
    events.append(event)
    if dmg>0:
        record_damage_instance(side,allies,events)
    if target.get("_venom_destroyed"):
        target["current_hp"]=0; dead=True; event["target_hp"]=0; event["target_dead"]=True
    if dead:
        if pending_deaths is None:
            handle_unit_death(target,target_index,target_side,foes,allies,events)
        elif foes[target_index] is target:
            # Keep the defeated unit in place until the complete effect ends.
            queue_pending_death(pending_deaths,target,target_index,target_side,foes,allies)
    return dead

def card_by_id(card_id):
    card=next((c for c in cards() if c["id"]==card_id),None)
    return copy.deepcopy(card) if card else None

def apply_golden_unit(unit):
    if not unit: return unit
    overrides=copy.deepcopy(unit.get("golden_overrides") or {})
    unit.update(overrides)
    if unit.get("golden_description"): unit["description"]=unit["golden_description"]
    unit["golden"]=True
    unit["current_hp"]=unit.get("max_hp",1)
    return unit

def trigger_morale(unit, unit_index, side, events, source_effect=None, team=None):
    effect=unit.get("morale") or {}
    if not effect or source_effect=="morale": return
    atk=int(effect.get("attack",0) or 0); hp=int(effect.get("max_hp",0) or effect.get("hp",0) or 0)
    if not (atk or hp): return
    targets=[(unit_index,unit)]
    if effect.get("type")=="random_other_buff":
        candidates=[(i,u) for i,u in enumerate(team or []) if i!=unit_index and u and u.get("current_hp",u.get("max_hp",1))>0]
        if not candidates: return
        targets=[random.choice(candidates)]
    elif effect.get("type") in ("team_hp_buff","team_attack_buff","team_buff"):
        targets=[(i,u) for i,u in enumerate(team or []) if u and u.get("current_hp",u.get("max_hp",1))>0]
    elif effect.get("type")=="faction_team_buff":
        faction=effect.get("faction")
        targets=[(i,u) for i,u in enumerate(team or []) if u and u.get("current_hp",u.get("max_hp",1))>0 and belongs_to_faction(u,faction)]
    for target_index,target in targets:
        apply_unit_buff(target,atk,hp,unit_index=target_index,side=side,events=events,source_effect="morale",team=team)
        events.append({"type":"permanent_buff","side":side,"slot":target_index+1,"from":unit["name"],"from_slot":unit_index+1,"to":target["name"],"mechanic":"morale","source_effect":"morale","attack_gain":atk,"max_hp_gain":hp,"attack":target.get("attack",0),"max_hp":target.get("max_hp",1),"current_hp":target.get("current_hp",target.get("max_hp",1))})


def apply_unit_buff(unit, atk=0, hp=0, bullet_strength_gain=0, bullet_damage_gain=0, *, unit_index=None, side=None, events=None, source_effect=None, team=None):
    improved=any(int(v or 0)>0 for v in (atk,hp,bullet_strength_gain,bullet_damage_gain))
    if atk: unit["attack"]=int(unit.get("attack",0) or 0)+int(atk)
    if hp:
        old_hp=int(unit.get("max_hp",1) or 1)
        unit["max_hp"]=old_hp+int(hp)
        unit["current_hp"]=int(unit.get("current_hp",old_hp) or 0)+int(hp)
    if bullet_strength_gain: unit["bullet_strength"]=int(unit.get("bullet_strength",0) or 0)+int(bullet_strength_gain)
    if bullet_damage_gain: unit["bullet_damage"]=int(unit.get("bullet_damage",0) or 0)+int(bullet_damage_gain)
    if improved and events is not None and unit_index is not None and side is not None:
        trigger_morale(unit,unit_index,side,events,source_effect,team)


def apply_team_buff(source, source_index, side, team, effect, events, source_effect=None):
    atk=int(effect.get("attack",0) or 0); hp=int(effect.get("max_hp",0) or effect.get("hp",0) or 0); bs=int(effect.get("bullet_strength",0) or 0)
    exclude_self=bool(effect.get("exclude_self"))
    for ti,target in enumerate(team):
        if not target or target.get("current_hp",target.get("max_hp",1))<=0: continue
        if exclude_self and ti==source_index: continue
        apply_unit_buff(target,atk,hp,bs,unit_index=ti,side=side,events=events,source_effect=source_effect,team=team)
        ev={"type":"team_buff","side":side,"slot":ti+1,"from":source["name"],"from_slot":source_index+1,"to":target["name"],"attack_gain":atk,"max_hp_gain":hp,"bullet_strength_gain":bs,"attack":target.get("attack",0),"max_hp":target.get("max_hp",1),"current_hp":target.get("current_hp",target.get("max_hp",1)),"bullet_strength":target.get("bullet_strength",0)}
        if source_effect: ev["source_effect"]=source_effect
        events.append(ev)

def friendly_initiative_trigger_count(team):
    # Only living Tin Man auras contribute. Multiple copies use the highest
    # value; a death during one effect can cancel the remaining repeats.
    return max([1]+[max(1,int(u.get("initiative_multiplier",1) or 1))
                    for u in team if u and u.get("current_hp",0)>0])


def resolve_one_precombat_effect(phase, unit, idx, team, foes, side, events):
    effect=unit.get(phase) or {}
    pending_deaths=[]
    if effect.get("type")=="random_bullet_damage":
        for _ in range(max(1,int(effect.get("hits",1) or 1))):
            if team[idx] is not unit or unit.get("current_hp",0)<=0: break
            pair=random_target(foes,include_dead=True)
            if not pair: break
            deal_bullet_damage(unit,idx,side,team,foes,pair[0],pair[1],effect.get("damage",0),events,source_effect=phase,pending_deaths=pending_deaths)
    elif effect.get("type")=="team_buff":
        apply_team_buff(unit,idx,side,team,effect,events,source_effect=phase)
    elif effect.get("type")=="gain_skill_card":
        card=card_by_id(effect.get("card_id")); count=max(1,int(effect.get("count",1) or 1))
        if card:
            for _ in range(count):
                events.append({"type":"gain_card","side":side,"from":unit["name"],"from_slot":idx+1,"card":copy.deepcopy(card),"card_id":card["id"],"card_name":card["name"],"source_effect":phase})
    # All hits of this single effect finish before legacies and revivals.
    resolve_pending_deaths(pending_deaths,events)


def legacy_effects_of(unit):
    effects=[]
    if unit.get("legacy"): effects.append(copy.deepcopy(unit["legacy"]))
    effects.extend(copy.deepcopy(unit.get("inherited_legacies") or []))
    return effects

def resolve_assimilation_initiative(unit, idx, team, foes, side, events):
    effect=unit.get("initiative") or {}
    per_trigger=max(1,int(effect.get("count",1) or 1))
    consumed=[]; repetition=0
    # Re-evaluate Tin Man after every trigger. If it is assimilated, its aura
    # immediately stops granting further initiative repetitions.
    while team[idx] is unit and unit.get("current_hp",0)>0:
        if repetition>=friendly_initiative_trigger_count(team): break
        targets=[(i,team[i]) for i in range(idx-1,-1,-1) if team[i] and team[i].get("current_hp",0)>0]
        if not targets: break
        for victim_index,victim in targets[:per_trigger]:
            team[victim_index]=None
            unit["attack"]=int(unit.get("attack",0))+int(victim.get("attack",0))
            hp_gain=int(victim.get("max_hp",0) or 0)
            unit["max_hp"]=int(unit.get("max_hp",1))+hp_gain
            unit["current_hp"]=int(unit.get("current_hp",unit["max_hp"]-hp_gain))+hp_gain
            inherited=legacy_effects_of(victim)
            if inherited:
                unit.setdefault("inherited_legacies",[]).extend(copy.deepcopy(inherited))
                unit["mechanics"]=[*dict.fromkeys([*(unit.get("mechanics") or []),"legacy"])]
            consumed.append((victim_index,victim))
            events.append({"type":"assimilate","side":side,"slot":idx+1,"from":unit["name"],"from_slot":idx+1,"to":victim["name"],"to_slot":victim_index+1,"target_side":side,"attack_gain":int(victim.get("attack",0)),"max_hp_gain":hp_gain,"attack":unit["attack"],"max_hp":unit["max_hp"],"current_hp":unit["current_hp"],"legacy_count":len(inherited)})
        repetition+=1
    # Nearest units were collected first (right to left). Resolve every legacy
    # completely before moving on; none of the victims receives another
    # assimilated unit's legacy. Revival is deliberately deferred until all
    # assimilated legacies have finished.
    for victim_index,victim in consumed:
        legacy_repeat=0
        while legacy_repeat<friendly_legacy_trigger_count(team):
            trigger_legacy(victim,victim_index,side,team,foes,events)
            legacy_repeat+=1
        trigger_death_feud(victim,victim_index,side,team,foes,events)
        events.append({"type":"assimilate_remove","side":side,"slot":victim_index+1,"from":unit["name"],"to":victim["name"]})
        # This victim's legacy is now complete; resolve its revival before the
        # next assimilated victim begins resolving its legacy.
        revived=make_revived_unit(victim,team)
        if not revived: continue
        revive_slot=victim_index if team[victim_index] is None else summon_slot_for(team,victim_index)
        if revive_slot is None:
            events.append({"type":"revive_failed","side":side,"slot":victim_index+1,"from":victim["name"],"reason":"board_full_after_assimilation"})
            continue
        team[revive_slot]=revived
        events.append({"type":"revive","side":side,"slot":revive_slot+1,"from":victim["name"],"unit":copy.deepcopy(revived),"source_effect":"assimilate"})

def resolve_temporary_initiative_buffs(unit, idx, team, side, events):
    effect_count=max(0,int(unit.get("temporary_initiative_effects",0) or 0))
    if not effect_count: return
    repetition=0
    while team[idx] is unit and unit.get("current_hp",0)>0:
        if repetition>=friendly_initiative_trigger_count(team): break
        for _ in range(effect_count):
            if team[idx] is not unit or unit.get("current_hp",0)<=0: break
            apply_unit_buff(unit,1,1,unit_index=idx,side=side,events=events,source_effect="temporary_initiative",team=team)
            events.append({"type":"temporary_initiative_buff","side":side,"slot":idx+1,"from":unit["name"],"from_slot":idx+1,"to":unit["name"],"mechanic":"initiative","source_effect":"temporary_initiative","attack_gain":1,"max_hp_gain":1,"attack":unit.get("attack",0),"max_hp":unit.get("max_hp",1),"current_hp":unit.get("current_hp",unit.get("max_hp",1))})
        repetition+=1


def resolve_precombat_phase(phase, left, right, start_side, events):
    # Raid is a special initiative action. Both mechanics share one left-to-right,
    # alternating queue; raid attacks are never repeated by Tin Man.
    teams={"left":left,"right":right}; cursors={"left":0,"right":0}; side=start_side
    def eligible(u):
        return bool(u and u.get("current_hp",0)>0 and (u.get("raid") or u.get("initiative") or u.get("temporary_initiative_effects")) and not u.get("summoned_by_phase") and not u.get("summoned_by_revival"))
    def has_pending(which): return any(eligible(u) for u in teams[which][cursors[which]:])
    while has_pending("left") or has_pending("right"):
        if has_pending(side):
            team=teams[side]; foes=teams["right" if side=="left" else "left"]
            while cursors[side]<len(team):
                idx=cursors[side]; cursors[side]+=1; unit=team[idx]
                if not eligible(unit): continue
                if unit.get("raid"):
                    raid=unit.get("raid") or {}; hits=max(1,int(raid.get("hits",1) if isinstance(raid,dict) else raid))
                    for _ in range(hits):
                        if team[idx] is not unit or unit.get("current_hp",0)<=0: break
                        if not perform_attack_action(unit,idx,side,team,foes,events,source_effect="raid"): break
                elif (unit.get("initiative") or {}).get("type")=="assimilate_left":
                    resolve_assimilation_initiative(unit,idx,team,foes,side,events)
                elif unit.get("initiative"):
                    repetition=0
                    while team[idx] is unit and unit.get("current_hp",0)>0:
                        if repetition>=friendly_initiative_trigger_count(team): break
                        resolve_one_precombat_effect("initiative",unit,idx,team,foes,side,events); repetition+=1
                resolve_temporary_initiative_buffs(unit,idx,team,side,events)
                break
        side="right" if side=="left" else "left"

def apply_battle_start_effects(team, side, events):
    for idx,u in enumerate(team):
        if not u: continue
        eff=u.get("battle_start") or {}
        if eff.get("type")=="team_bullet_strength":
            amount=int(eff.get("amount",0) or 0); affected=[]
            if not amount: continue
            for ai,ally in enumerate(team):
                if ally and ally.get("current_hp",ally.get("max_hp",1))>0:
                    ally["bullet_strength_temp"]=int(ally.get("bullet_strength_temp",0) or 0)+amount
                    trigger_morale(ally,ai,side,events,"battle_start",team)
                    affected.append(ai+1)
            register_round_aura(team,bullet_strength_gain=amount,source=u)
            events.append({"type":"battle_start","side":side,"from":u["name"],"from_slot":idx+1,"effect":"bullet_strength","amount":amount,"affected_slots":affected,"affected":[{"slot":ai+1,"bullet_strength_temp":int(ally.get("bullet_strength_temp",0) or 0),"bullet_strength":bullet_strength(ally)} for ai,ally in enumerate(team) if ally and ai+1 in affected]})

def has_revive(unit):
    return bool(unit and (unit.get("revive") or "revive" in unit.get("mechanics",[])))

def summon_slot_for(team, origin_index):
    order=list(range(origin_index-1,-1,-1))+[origin_index]+list(range(origin_index+1,len(team)))
    for i in order:
        if 0<=i<len(team) and team[i] is None: return i
    return None

def summon_unit_from_legacy(source, source_index, side, team, summon_id, grant_revive=False, events=None, summon_golden=False):
    slot=summon_slot_for(team,source_index)
    if slot is None: return None
    unit=card_by_id(summon_id)
    if not unit: return None
    if summon_golden:
        base_attack=int(unit.get("attack",0) or 0); base_hp=int(unit.get("max_hp",1) or 1)
        unit=apply_golden_unit(unit); unit["attack"]=base_attack*2; unit["max_hp"]=base_hp*2
    unit["current_hp"]=unit.get("max_hp",1)
    apply_round_aura_to_unit(unit,team,source)
    unit["summoned_by_phase"]=True
    unit["summoned_by_legacy"]=True
    if grant_revive:
        unit["revive"]=True
        mechs=list(unit.get("mechanics",[]))
        if "revive" not in mechs: mechs.append("revive")
        unit["mechanics"]=mechs
    team[slot]=unit
    if events is not None:
        events.append({"type":"summon","side":side,"slot":slot+1,"from":source["name"],"from_slot":source_index+1,"unit":copy.deepcopy(unit),"consume_revive_slot":source_index+1})
    return slot,unit

def deal_friendly_bullet_damage(source, source_index, side, allies, foes, target_index, target, base, events, pending_deaths):
    # Friendly fire never receives the source's bullet strength. Bullet strength
    # is added only when a friendly unit damages an enemy unit.
    dmg=int(base)
    if dmg>0 and consume_shield(target):
        events.append({"type":"shield_block","side":side,"slot":target_index+1,"from":target["name"],"source":source.get("name",""),"source_side":side,"damage_blocked":dmg})
        record_damage_instance(side,allies,events)
        return
    target["current_hp"]-=dmg; trigger_injury_growth(target,target_index,side,allies,events,dmg); dead=target["current_hp"]<=0
    event={"side":side,"from":source["name"],"from_slot":source_index+1,"to":target["name"],"to_slot":target_index+1,"target_side":side,"damage_type":"bullet","damage":dmg,"bullet_base_damage":int(base),"bullet_strength":0,"counter_damage":0,"target_hp":max(0,target["current_hp"]),"attacker_hp":max(0,source.get("current_hp",0)),"target_dead":dead,"attacker_dead":True,"source_effect":"legacy","friendly_fire":True}
    events.append(event)
    if dmg>0:
        record_damage_instance(side,allies,events)
    if dead and allies[target_index] is target:
        queue_pending_death(pending_deaths,target,target_index,side,allies,foes)

def dominant_faction_pool(allies):
    living=[u for u in allies if u and u.get("current_hp",0)>0]
    concrete=[u.get("faction") for u in living if u.get("faction") and u.get("faction")!="任意"]
    if concrete:
        counts={f:concrete.count(f) for f in set(concrete)};best=max(counts.values());dominant=random.choice([f for f,n in counts.items() if n==best])
        return [c for c in cards() if c.get("card_type")=="unit" and c.get("faction") in (dominant,"任意")]
    return [c for c in cards() if c.get("card_type")=="unit"]

def summon_and_gain_dominant(source, source_index, side, allies, events, count):
    for _ in range(max(1,int(count or 1))):
        pool=dominant_faction_pool(allies)
        if not pool: break
        gained=copy.deepcopy(random.choice(pool));gained["current_hp"]=gained.get("max_hp",1)
        slot=source_index if allies[source_index] is None else summon_slot_for(allies,source_index)
        if slot is not None:
            summoned=copy.deepcopy(gained);summoned["summoned_by_phase"]=True;summoned["summoned_by_legacy"]=True;allies[slot]=summoned
            events.append({"type":"summon","side":side,"slot":slot+1,"from":source["name"],"from_slot":source_index+1,"unit":copy.deepcopy(summoned)})
        events.append({"type":"gain_card","side":side,"from":source["name"],"from_slot":source_index+1,"card":copy.deepcopy(gained),"card_id":gained["id"],"card_name":gained["name"],"source_effect":"legacy"})

def trigger_legacy_effect(unit, unit_index, side, allies, foes, events, legacy):
    legacy=legacy or {}
    pending_deaths=[]
    if legacy.get("type")=="all_units_bullet_damage":
        for _ in range(max(1,int(legacy.get("hits",1) or 1))):
            ally_targets=[(ti,target) for ti,target in enumerate(allies) if target and target.get("current_hp",0)>0]
            if not ally_targets:
                corpse=random_target(allies,include_dead=True)
                ally_targets=[corpse] if corpse else []
            for ti,target in ally_targets:
                deal_friendly_bullet_damage(unit,unit_index,side,allies,foes,ti,target,legacy.get("damage",0),events,pending_deaths)
            foe_targets=[(ti,target) for ti,target in enumerate(foes) if target and target.get("current_hp",0)>0]
            if not foe_targets:
                corpse=random_target(foes,include_dead=True)
                foe_targets=[corpse] if corpse else []
            for ti,target in foe_targets:
                deal_bullet_damage(unit,unit_index,side,allies,foes,ti,target,legacy.get("damage",0),events,source_effect="legacy",pending_deaths=pending_deaths)
    elif legacy.get("type")=="summon_and_gain_dominant_faction":
        summon_and_gain_dominant(unit,unit_index,side,allies,events,legacy.get("count",1))
    elif legacy.get("type")=="bullet_damage":
        hits=int(legacy.get("hits",1)); base=int(legacy.get("damage",0))+int(unit.get("bullet_damage",0) or 0)
        for _ in range(hits):
            if legacy.get("target")=="killer":
                killer_index=unit.get("_killer_index")
                pair=(killer_index,foes[killer_index]) if isinstance(killer_index,int) and 0<=killer_index<len(foes) and foes[killer_index] and foes[killer_index].get("current_hp",0)>0 else random_target(foes,include_dead=True)
            else:
                pair=random_target(foes,include_dead=True) if legacy.get("target")=="random" else nearest_target(foes,unit_index,include_dead=True)
            if not pair: break
            deal_bullet_damage(unit,unit_index,side,allies,foes,pair[0],pair[1],base,events,source_effect="legacy",pending_deaths=pending_deaths)
    elif legacy.get("type")=="spell_damage":
        hits=int(legacy.get("hits",1)); base=int(legacy.get("damage",0))
        for _ in range(hits):
            pair=random_target(foes,include_dead=True) if legacy.get("target")=="random" else nearest_target(foes,unit_index,include_dead=True)
            if not pair: break
            deal_spell_damage(unit,unit_index,side,allies,foes,pair[0],pair[1],base,events,source_effect="legacy",pending_deaths=pending_deaths)
    elif legacy.get("type")=="team_buff":
        apply_team_buff(unit,unit_index,side,allies,legacy,events,source_effect="legacy")
        if legacy.get("round_aura"):
            register_round_aura(allies,legacy.get("attack",0),legacy.get("max_hp",legacy.get("hp",0)),legacy.get("bullet_strength",0),source=unit)
    elif legacy.get("type")=="summon_then_bullet":
        summoned=summon_unit_from_legacy(unit,unit_index,side,allies,legacy.get("summon_id"),bool(legacy.get("grant_revive")),events,bool(legacy.get("summon_golden")))
        if summoned and legacy.get("consume_revive"):
            unit["revive_consumed_by_summon"]=True
        if summoned and summoned[1].get("raid"):
            summoned_index,summoned_unit=summoned; raid=summoned_unit.get("raid") or {}
            raid_hits=max(1,int(raid.get("hits",1) if isinstance(raid,dict) else raid))
            for _ in range(raid_hits):
                if allies[summoned_index] is not summoned_unit or summoned_unit.get("current_hp",0)<=0: break
                if not perform_attack_action(summoned_unit,summoned_index,side,allies,foes,events,source_effect="raid"): break
        hits=int(legacy.get("hits",1)); base=int(legacy.get("damage",0))+int(unit.get("bullet_damage",0) or 0)
        for _ in range(hits):
            pair=random_target(foes,include_dead=True) if legacy.get("target")=="random" else nearest_target(foes,unit_index,include_dead=True)
            if not pair: break
            deal_bullet_damage(unit,unit_index,side,allies,foes,pair[0],pair[1],base,events,source_effect="legacy",pending_deaths=pending_deaths)
    elif legacy.get("type")=="gain_four_seasons":
        count=max(1,int(legacy.get("count",1) or 1)); level=max(1,min(MAX_SHOP_LEVEL,int(unit.get("battle_shop_level",1) or 1)))
        card=card_by_id(f"four_seasons_{level}")
        if card:
            for _ in range(count):
                events.append({"type":"gain_card","side":side,"from":unit["name"],"from_slot":unit_index+1,"card":copy.deepcopy(card),"card_id":card["id"],"card_name":card["name"],"source_effect":"legacy"})
    elif legacy.get("type")=="grant_revive":
        count=max(1,int(legacy.get("count",1) or 1))
        for _ in range(count):
            candidates=[(i,u) for i,u in enumerate(allies) if u and u.get("current_hp",0)>0 and belongs_to_faction(u,"\u62c9\u7279\u5170") and not has_revive(u)]
            if not candidates: break
            ti,target=random.choice(candidates)
            target["revive"]=True
            mechs=list(target.get("mechanics",[]))
            if "revive" not in mechs: mechs.append("revive")
            target["mechanics"]=mechs
            target["temporary_revive"]=True
            events.append({"type":"grant_revive","side":side,"from":unit["name"],"from_slot":unit_index+1,"to":target["name"],"to_slot":ti+1,"target_side":side,"mechanic":"revive"})
    resolve_pending_deaths(pending_deaths,events)

def trigger_legacy(unit, unit_index, side, allies, foes, events):
    effects=[]
    if unit.get("legacy"): effects.append(unit.get("legacy"))
    effects.extend(unit.get("inherited_legacies") or [])
    for effect in effects:
        trigger_legacy_effect(unit,unit_index,side,allies,foes,events,effect)

def friendly_logistics_trigger_count(team):
    # Warfarin auras do not stack; the strongest normal/golden value wins.
    return max(
        [1]
        + [
            max(1,int(u.get("logistics_multiplier",1) or 1))
            for u in team
            if u and int(u.get("current_hp",u.get("max_hp",1)) or 0)>0
        ]
    )


def apply_logistics_effects(team, side, events):
    trigger_count=friendly_logistics_trigger_count(team)
    for idx,u in enumerate(team):
        if not u or u.get("current_hp",u.get("max_hp",1))<=0: continue
        eff=u.get("logistics") or {}
        if not eff: continue
        for _ in range(trigger_count):
            if eff.get("type")=="gain_four_seasons":
                level=max(1,min(MAX_SHOP_LEVEL,int(u.get("battle_shop_level",1) or 1)))
                card=card_by_id(f"four_seasons_{level}")
                if card:
                    for _ in range(max(1,int(eff.get("count",1) or 1))):
                        events.append({"type":"gain_card","side":side,"from":u["name"],"from_slot":idx+1,"card":copy.deepcopy(card),"card_id":card["id"],"card_name":card["name"],"source_effect":"logistics"})
                continue
            if eff.get("type")=="gain_gold":
                amount=max(0,int(eff.get("amount",0) or 0))
                if amount:
                    events.append({"type":"gain_gold","side":side,"slot":idx+1,"from":u["name"],"from_slot":idx+1,"amount":amount,"source_effect":"logistics"})
                continue
            if eff.get("type")=="gain_past_dust":
                level=max(1,min(MAX_SHOP_LEVEL,int(u.get("battle_shop_level",1) or 1)))
                card=card_by_id(f"past_dust_{level}")
                if card:
                    for _ in range(max(1,int(eff.get("count",1) or 1))):
                        events.append({"type":"gain_card","side":side,"from":u["name"],"from_slot":idx+1,"card":copy.deepcopy(card),"card_id":card["id"],"card_name":card["name"],"source_effect":"logistics"})
                continue
            if eff.get("type")=="team_buff":
                apply_team_buff(u,idx,side,team,eff,events,source_effect="logistics")
                continue
            if eff.get("type")=="adjacent_buff":
                atk=int(eff.get("attack",0) or 0); hp=int(eff.get("max_hp",0) or eff.get("hp",0) or 0)
                for _ in range(max(1,int(eff.get("repetitions",1) or 1))):
                    for ti in (idx-1,idx+1):
                        if not 0<=ti<len(team): continue
                        target=team[ti]
                        if not target or target.get("current_hp",target.get("max_hp",1))<=0: continue
                        apply_unit_buff(target,atk,hp,unit_index=ti,side=side,events=events,source_effect="logistics",team=team)
                        events.append({"type":"logistics_buff","side":side,"slot":ti+1,"from":u["name"],"from_slot":idx+1,"to":target["name"],"mechanic":"logistics","source_effect":"logistics","attack_gain":atk,"max_hp_gain":hp,"attack":target.get("attack",0),"max_hp":target.get("max_hp",1),"current_hp":target.get("current_hp",target.get("max_hp",1))})
                continue
            atk=int(eff.get("attack",0) or 0); hp=int(eff.get("max_hp",0) or eff.get("hp",0) or 0); bd=int(eff.get("bullet_damage",0) or 0)
            apply_unit_buff(u,atk,hp,bullet_damage_gain=bd,unit_index=idx,side=side,events=events,source_effect="logistics",team=team)
            events.append({"type":"logistics_buff","side":side,"slot":idx+1,"from":u["name"],"to":u["name"],"mechanic":"logistics","source_effect":"logistics","attack_gain":atk,"max_hp_gain":hp,"bullet_damage_gain":bd,"attack":u.get("attack",0),"max_hp":u.get("max_hp",1),"current_hp":u.get("current_hp",u.get("max_hp",1)),"bullet_damage":u.get("bullet_damage",0)})
    # Permanent logistics granted by skill cards coexists with intrinsic
    # logistics and is repeated by Warfarin's strongest aura.
    for idx,u in enumerate(team):
        if not u or u.get("current_hp",u.get("max_hp",1))<=0: continue
        atk=int(u.get("permanent_logistics_attack",0) or 0); hp=int(u.get("permanent_logistics_hp",0) or 0)
        if not (atk or hp): continue
        for _ in range(trigger_count):
            apply_unit_buff(u,atk,hp,unit_index=idx,side=side,events=events,source_effect="logistics",team=team)
            events.append({"type":"logistics_buff","side":side,"slot":idx+1,"from":u["name"],"to":u["name"],"mechanic":"logistics","source_effect":"logistics","attack_gain":atk,"max_hp_gain":hp,"attack":u.get("attack",0),"max_hp":u.get("max_hp",1),"current_hp":u.get("current_hp",u.get("max_hp",1))})


def apply_temporary_logistics_effects(team, side, events):
    trigger_count=friendly_logistics_trigger_count(team)
    for idx,u in enumerate(team):
        if not u or u.get("current_hp",u.get("max_hp",1))<=0: continue
        atk=int(u.get("temporary_logistics_attack",0) or 0); hp=int(u.get("temporary_logistics_hp",0) or 0)
        if not (atk or hp): continue
        for _ in range(trigger_count):
            apply_unit_buff(u,atk=atk,hp=hp,unit_index=idx,side=side,events=events,source_effect="temporary_logistics",team=team)
            events.append({"type":"temporary_logistics_buff","side":side,"slot":idx+1,"from":u["name"],"to":u["name"],"mechanic":"logistics","source_effect":"temporary_logistics","attack_gain":atk,"max_hp_gain":hp,"attack":u.get("attack",0),"max_hp":u.get("max_hp",1),"current_hp":u.get("current_hp",u.get("max_hp",1))})

def apply_persistent_battle_gains(snapshot, events, start_index=0):
    for event in events[start_index:]:
        if event.get("side")!="left": continue
        source_effect=event.get("source_effect")
        if not (event.get("type")=="permanent_buff" or source_effect in ("initiative","permanent")):
            continue
        slot=int(event.get("slot",0) or 0)-1
        if not 0<=slot<len(snapshot) or not snapshot[slot]: continue
        unit=snapshot[slot]
        attack_gain=int(event.get("attack_gain",0) or 0)
        hp_gain=int(event.get("max_hp_gain",0) or 0)
        strength_gain=int(event.get("bullet_strength_gain",0) or 0)
        bullet_damage_gain=int(event.get("bullet_damage_gain",0) or 0)
        if attack_gain: unit["attack"]=int(unit.get("attack",0) or 0)+attack_gain
        if hp_gain: unit["max_hp"]=int(unit.get("max_hp",1) or 1)+hp_gain
        if strength_gain: unit["bullet_strength"]=int(unit.get("bullet_strength",0) or 0)+strength_gain
        if bullet_damage_gain: unit["bullet_damage"]=int(unit.get("bullet_damage",0) or 0)+bullet_damage_gain
        if event.get("injury_growth_count") is not None: unit["injury_growth_count"]=int(event.get("injury_growth_count",0) or 0)


def apply_before_attack(attacker, attacker_index, side, team, events):
    effect=attacker.get("before_attack") or {}
    if not effect: return
    for _ in range(max(1,int(effect.get("repetitions",1) or 1))):
        if effect.get("type")=="team_buff":
            apply_team_buff(attacker,attacker_index,side,team,effect,events,source_effect="permanent")


def trigger_opponent_attack_reactions(attacker, attacker_index, side, mine, foes, events):
    target_side="right" if side=="left" else "left"; pending=[]
    for ri,reactor in enumerate(foes):
        if mine[attacker_index] is not attacker or attacker.get("current_hp",0)<=0: break
        if not reactor or reactor.get("current_hp",0)<=0: continue
        effect=reactor.get("opponent_attack") or {}
        if effect.get("type")!="bullet_damage": continue
        used=int(reactor.get("opponent_attack_trigger_count",0) or 0); cap=max(0,int(effect.get("max_triggers",7) or 7))
        if used>=cap: continue
        reactor["opponent_attack_trigger_count"]=used+1
        deal_bullet_damage(reactor,ri,target_side,foes,mine,attacker_index,attacker,effect.get("damage",0),events,source_effect="opponent_attack",pending_deaths=pending)
    resolve_pending_deaths(pending,events)

def deal_cleave_damage(source, source_index, side, allies, foes, target_index, target, damage, events, pending_deaths):
    target_side="right" if side=="left" else "left"; dmg=max(0,int(damage or 0)); blocked=False
    if dmg>0 and consume_shield(target):
        blocked=True
        events.append({"type":"shield_block","side":target_side,"slot":target_index+1,"from":target["name"],"source":source["name"],"source_side":side,"damage_blocked":dmg})
        dealt=0
    else:
        dealt=dmg;target["current_hp"]-=dealt
        trigger_injury_growth(target,target_index,target_side,foes,events,dealt)
    dead=target.get("current_hp",0)<=0
    if dead: mark_killer(target,source_index)
    events.append({"type":"cleave","side":side,"from":source["name"],"from_slot":source_index+1,"to":target["name"],"to_slot":target_index+1,"target_side":target_side,"damage_type":"cleave","damage":dealt,"attempted_damage":dmg,"shield_blocked":blocked,"counter_damage":0,"target_hp":max(0,target.get("current_hp",0)),"attacker_hp":max(0,source.get("current_hp",0)),"target_dead":dead,"attacker_dead":source.get("current_hp",0)<=0})
    if dead and foes[target_index] is target:
        queue_pending_death(pending_deaths,target,target_index,target_side,foes,allies)

def perform_attack_action(attacker, idx, side, mine, foes, events, round_number=1, source_effect=None):
    if idx>=len(mine) or mine[idx] is not attacker or attacker.get("current_hp",0)<=0: return False
    if not any(u and u.get("current_hp",0)>0 for u in foes): return False
    apply_before_attack(attacker,idx,side,mine,events)
    pair=choose_target(foes)
    if not pair: return False
    ti,target=pair; base=bullet_base_damage(attacker); target_side="right" if side=="left" else "left"
    if base and bullet_condition_met(attacker,mine,foes,round_number):
        deal_bullet_damage(attacker,idx,side,mine,foes,ti,target,base,events,source_effect=source_effect)
        return True
    trigger_opponent_attack_reactions(attacker,idx,side,mine,foes,events)
    if mine[idx] is not attacker or attacker.get("current_hp",0)<=0:
        events.append({"type":"collision_cancelled","side":side,"from":attacker["name"],"from_slot":idx+1,"to":target["name"],"to_slot":ti+1,"target_side":target_side,"reason":"opponent_attack_reaction_death","source_effect":source_effect})
        return False
    if has_guardian(target):
        guardian=target.get("guardian") or {}
        if not isinstance(guardian,dict): guardian={"type":"bullet_damage","damage":2,"hits":1}
        if guardian.get("type","bullet_damage")=="bullet_damage":
            pending_deaths=[]
            for _ in range(max(1,int(guardian.get("hits",1) or 1))):
                if mine[idx] is not attacker or foes[ti] is not target or attacker.get("current_hp",0)<=0 or target.get("current_hp",0)<=0: break
                deal_bullet_damage(target,ti,target_side,foes,mine,idx,attacker,guardian.get("damage",2),events,source_effect="guardian",pending_deaths=pending_deaths)
            resolve_pending_deaths(pending_deaths,events)
    if mine[idx] is not attacker or foes[ti] is not target or attacker.get("current_hp",0)<=0 or target.get("current_hp",0)<=0:
        events.append({"type":"collision_cancelled","side":side,"from":attacker["name"],"from_slot":idx+1,"to":target["name"],"to_slot":ti+1,"target_side":target_side,"reason":"pre_collision_death","source_effect":source_effect})
        return False
    dmg=attacker["attack"]; counter=target["attack"]; active_hit_attempted=dmg>0
    if dmg>0 and consume_shield(target):
        events.append({"type":"shield_block","side":target_side,"slot":ti+1,"from":target["name"],"source":attacker["name"],"source_side":side,"damage_blocked":dmg}); dmg=0
    if counter>0 and consume_shield(attacker):
        events.append({"type":"shield_block","side":side,"slot":idx+1,"from":attacker["name"],"source":target["name"],"source_side":target_side,"damage_blocked":counter}); counter=0
    target["current_hp"]-=dmg; attacker["current_hp"]-=counter
    trigger_injury_growth(target,ti,target_side,foes,events,dmg);trigger_injury_growth(attacker,idx,side,mine,events,counter)
    target_venom=apply_venom_after_damage(attacker,target,dmg); attacker_venom=apply_venom_after_damage(target,attacker,counter)
    target_dead=target["current_hp"]<=0; attacker_dead=attacker["current_hp"]<=0
    if target_dead: mark_killer(target,idx)
    if attacker_dead: mark_killer(attacker,ti)
    attack_event={"side":side,"from":attacker["name"],"from_slot":idx+1,"to":target["name"],"to_slot":ti+1,"target_side":target_side,"damage_type":"collision","damage":dmg,"counter_damage":counter,"target_hp":max(0,target["current_hp"]),"attacker_hp":max(0,attacker["current_hp"]),"target_dead":target_dead,"attacker_dead":attacker_dead,"target_venom_triggered":target_venom,"attacker_venom_triggered":attacker_venom}
    if source_effect: attack_event["source_effect"]=source_effect
    events.append(attack_event)
    if active_hit_attempted: record_damage_instance(side,mine,events)
    if counter>0: record_damage_instance(target_side,foes,events)
    cleave_deaths=[]
    if attacker.get("cleave") or "cleave" in attacker.get("mechanics",[]):
        for ci in (ti-1,ti+1):
            adjacent=foes[ci] if 0<=ci<len(foes) else None
            if adjacent and adjacent.get("current_hp",0)>0:
                deal_cleave_damage(attacker,idx,side,mine,foes,ci,adjacent,attacker.get("attack",0),events,cleave_deaths)
    resolve_pending_deaths(cleave_deaths,events)
    if target.get("_venom_destroyed"): target["current_hp"]=0
    if attacker.get("_venom_destroyed"): attacker["current_hp"]=0
    target_dead=target["current_hp"]<=0; attacker_dead=attacker["current_hp"]<=0
    attack_event.update({"target_hp":max(0,target["current_hp"]),"attacker_hp":max(0,attacker["current_hp"]),"target_dead":target_dead,"attacker_dead":attacker_dead})
    if target_dead and foes[ti] is target: handle_unit_death(target,ti,target_side,foes,mine,events)
    attacker_dead=attacker.get("current_hp",0)<=0
    if attacker_dead and mine[idx] is attacker: handle_unit_death(attacker,idx,side,mine,foes,events)
    return True


def tavern_battle(left,right,round_number=1,shop_level=1):
    left=[dict(u,current_hp=u["max_hp"]) if u else None for u in left[:7]]; right=[dict(u,current_hp=u["max_hp"]) if u else None for u in right[:7]]
    left += [None]*(7-len(left)); right += [None]*(7-len(right))
    for team in (left,right):
        for unit in team:
            if unit:
                unit["battle_shop_level"]=max(1,min(MAX_SHOP_LEVEL,int(shop_level or 1)))
                unit.pop("opponent_attack_trigger_count",None)
    turn=first_striker(left,right); cursor={"left":0,"right":0}; events=[]
    apply_logistics_effects(left,"left",events); apply_logistics_effects(right,"right",events)
    # Preserve a snapshot before temporary battle effects or deaths. The player
    # receives these permanent logistics gains even when the unit later dies.
    persistent_left=copy.deepcopy(left)
    persistent_event_start=len(events)
    apply_temporary_logistics_effects(left,"left",events); apply_temporary_logistics_effects(right,"right",events)
    apply_battle_start_effects(left,"left",events); apply_battle_start_effects(right,"right",events)
    resolve_precombat_phase("initiative",left,right,turn,events)
    def living(team): return [(i,u) for i,u in enumerate(team) if u and u["current_hp"]>0]
    while living(left) and living(right):
        mine,foes=(left,right) if turn=="left" else (right,left)
        choices=living(mine); idx,attacker=next(((i,u) for i,u in choices if i>=cursor[turn]),choices[0]); cursor[turn]=(idx+1)%7
        perform_attack_action(attacker,idx,turn,mine,foes,events,round_number)
        turn="right" if turn=="left" else "left"
    left_alive=living(left); right_alive=living(right)
    winner="left" if left_alive and not right_alive else ("right" if right_alive and not left_alive else "draw")
    remaining_stars=sum(u.get("stars",1) for _,u in right_alive); loss_damage=0 if winner!="right" else (min(remaining_stars,15) if round_number<10 else remaining_stars)
    apply_persistent_battle_gains(persistent_left,events,persistent_event_start)
    logistics_gold=sum(int(e.get("amount",0) or 0) for e in events if e.get("type")=="gain_gold" and e.get("side")=="left")
    # Assimilated legacies belong only to this battle copy. Never expose them
    # through the persistent snapshot used to rebuild the preparation board.
    for saved in persistent_left:
        if saved:
            saved.pop("inherited_legacies",None)
            if not saved.get("legacy"):
                saved["mechanics"]=[m for m in saved.get("mechanics",[]) if m!="legacy"]
    return {"winner":winner,"events":events,"left":left,"right":right,"persistent_left":persistent_left,"remaining_stars":remaining_stars,"loss_damage":loss_damage,"logistics_gold":logistics_gold}

def settle_battle(result, round_number, player_id="local"):
    with db() as con:
        row=con.execute("SELECT gold,health FROM players WHERE id=?",(player_id,)).fetchone()
        if not row: raise ValueError("\u73a9\u5bb6\u4e0d\u5b58\u5728")
        income=round_income(round_number); victory_bonus=1 if result["winner"]=="left" else 0; logistics_gold=int(result.get("logistics_gold",0) or 0); gold=row["gold"]+income+victory_bonus+logistics_gold; health=max(0,row["health"]-result["loss_damage"])
        con.execute("UPDATE players SET gold=?,health=?,round=?,shop_discount=shop_discount+2,total_gold_earned=total_gold_earned+? WHERE id=?",(gold,health,round_number+1,income+victory_bonus+logistics_gold,player_id))
    data=player(player_id); data.update({"gold":gold,"health":health,"income":income,"victory_bonus":victory_bonus,"logistics_gold":logistics_gold}); return data

def enemy_board(round_number, shop_level=1):
    if not 1<=round_number<=14: return [None]*7
    amount=1 if round_number<=2 else 2 if round_number==3 else 4 if round_number==4 else 6 if round_number==5 else 7
    # AI selection only reads the shop level snapshot taken when the preview is
    # generated. Shop refreshes, purchases and board/bench operations neither
    # alter this pool nor consume this independent random source.
    max_stars=1 if round_number==1 else max(1,min(MAX_SHOP_LEVEL,int(shop_level or 1)+1))
    pool=[c for c in cards() if c["card_type"]=="unit" and int(c.get("stars",c.get("tier",1)) or 1)<=max_stars]
    board=[None]*7; star_bias=0.35+round_number/5; ai_random=random.SystemRandom()
    for i in range(amount):
        base=ai_random.choices(pool,weights=[1+max(0,c["stars"]-1)*star_bias for c in pool],k=1)[0]
        card=dict(base)
        # Keep the chosen unit's original attack and HP as hard floors; low
        # early-round targets may need to rise to the unit's base stat total.
        target=max(AI_POWER[round_number-1],int(base["attack"])+int(base["max_hp"]))
        ratio=ai_random.uniform(.35,.65) if round_number>=5 else ai_random.uniform(.2,.8)
        card["attack"]=min(target-int(base["max_hp"]),max(int(base["attack"]),round(target*ratio)))
        card["max_hp"]=target-card["attack"]
        card["current_hp"]=card["max_hp"]; card["name"]=f"{card['name']}\u00b7{card['stars']}\u661f"; board[i]=card
    return board

class Handler(SimpleHTTPRequestHandler):
    extensions_map={**SimpleHTTPRequestHandler.extensions_map,".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8"}
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT),**kw)
    def end_headers(self):
        self.send_header("Cache-Control","no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma","no-cache")
        self.send_header("Expires","0")
        super().end_headers()
    def json(self,payload,status=200):
        raw=json.dumps(payload,ensure_ascii=False).encode(); self.send_response(status); self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Content-Length",str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def body(self): return json.loads(self.rfile.read(int(self.headers.get("Content-Length",0))) or b"{}")
    def player_id(self): return normalize_player_id(self.headers.get("X-Player-Id") or "local")
    def do_GET(self):
        path=urlparse(self.path).path
        if path=="/api/cards": return self.json(cards())
        if path=="/api/shop": return self.json(shop(player_id=self.player_id()))
        if path=="/api/player": return self.json(player(self.player_id()))
        return super().do_GET()
    def do_POST(self):
        path,data=urlparse(self.path).path,self.body()
        try:
            if path=="/api/buy": return self.json(buy_card(data["card_id"],self.player_id(),bool(data.get("bypass_shop_level"))))
            if path=="/api/sell": return self.json(sell_unit(data["card_id"],self.player_id(),half=bool(data.get("half"))))
            if path=="/api/refresh": return self.json(refresh_shop(self.player_id()))
            if path=="/api/gain_gold": return self.json(gain_gold(int(data.get("amount",1)),self.player_id()))
            if path=="/api/reduce_upgrade_cost": return self.json(reduce_upgrade_cost(int(data.get("amount",2)),self.player_id()))
            if path=="/api/upgrade_shop": return self.json(upgrade_shop(self.player_id()))
            if path=="/api/reset": return self.json(reset_player(self.player_id()))
            if path=="/api/enemy":
                current=player(self.player_id())
                return self.json(enemy_board(int(data.get("round",1)),current["shop_level"]))
            if path=="/api/battle":
                rn=int(data.get("round",1)); current=player(self.player_id()); result=tavern_battle(data.get("left",[]),data.get("right",[]),rn,current["shop_level"]); result.update(settle_battle(result,rn,self.player_id())); return self.json(result)
            return self.json({"error":"not found"},404)
        except (KeyError,ValueError) as e: return self.json({"error":str(e)},400)

def local_play_urls(port=PORT):
    urls=[f"http://127.0.0.1:{port}"]
    try:
        host=socket.gethostname(); ips={ip for ip in socket.gethostbyname_ex(host)[2] if not ip.startswith("127.")}
        urls += [f"http://{ip}:{port}" for ip in sorted(ips)]
    except OSError: pass
    return urls

if __name__=="__main__":
    initialise_database(); print("Tavern mode play URLs:"); [print("  "+u) for u in local_play_urls()]; ThreadingHTTPServer(("0.0.0.0",PORT),Handler).serve_forever()
