"""经典酒馆模式：SQLite 数据与零依赖本地 API。运行：python server.py"""
from __future__ import annotations
import json, random, re, socket, sqlite3
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
DB_PATH = ROOT / "data" / "autochess.sqlite"
UNITS = [
 ("guard","铁卫","前排坦克","王国",1,180,18,1,"#82b1ff"),
 ("archer","游侠","远程输出","森林",1,90,24,3,"#74db9b"),
 ("mage","星术师","范围法师","学院",2,85,35,3,"#c492ff"),
 ("rogue","影刃","爆发刺客","森林",2,105,42,1,"#ff8ba0"),
 ("knight","圣骑士","前排战士","王国",3,245,34,1,"#ffc857"),
 ("oracle","先知","辅助施法","学院",3,110,31,3,"#67dce5")]
SKILLS = [
 ("rage","狂暴药剂","skill","药剂",1,12,"令一个棋子永久 +12 攻击","#ff9f43"),
 ("ward","生命符文","skill","法术",1,15,"令一个棋子永久 +15 初始血量","#5bbcff"),
 ("vitality","活力药水","skill","药剂",2,35,"令一个棋子永久 +35 生命","#75d69b")]
AI_POWER = [5,8,8,10,15,30,50,100,200,400,800,1600,2000,3000]
SHOP_UPGRADE_BASE_COSTS = [5,7,9,11,13]
MAX_SHOP_LEVEL = 6

def db():
    con=sqlite3.connect(DB_PATH); con.row_factory=sqlite3.Row; return con

def initialise_database():
    DB_PATH.parent.mkdir(exist_ok=True)
    with db() as con:
        # ??????????????? UNITS / SKILLS ???????????????????????
        con.execute("CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 10,health INTEGER NOT NULL DEFAULT 50,round INTEGER NOT NULL DEFAULT 1)")
        columns={row[1] for row in con.execute("PRAGMA table_info(players)")}
        if "shop_level" not in columns: con.execute("ALTER TABLE players ADD COLUMN shop_level INTEGER NOT NULL DEFAULT 1")
        if "shop_discount" not in columns: con.execute("ALTER TABLE players ADD COLUMN shop_discount INTEGER NOT NULL DEFAULT 0")
        con.execute("INSERT OR IGNORE INTO players(id,gold,health,round,shop_level,shop_discount) VALUES('local',10,50,1,1,0)")

def round_income(round_number):
    return 10+round_number

def shop_slot_count(level):
    return 4+(1 if level>=3 else 0)+(1 if level>=5 else 0)

def upgrade_cost_for(level, discount):
    if level >= MAX_SHOP_LEVEL: return None
    return max(0,SHOP_UPGRADE_BASE_COSTS[level-1]-discount)

def with_shop_status(row):
    data=dict(row)
    data["upgrade_cost"]=upgrade_cost_for(data.get("shop_level",1),data.get("shop_discount",0))
    data["next_income"]=round_income(data.get("round",1))
    data["shop_slots"]=shop_slot_count(data.get("shop_level",1))
    return data

def normalize_player_id(player_id):
    player_id=(player_id or "local").strip()[:80]
    return player_id if re.fullmatch(r"[A-Za-z0-9_.:-]+",player_id) else "local"

def ensure_player(player_id="local"):
    player_id=normalize_player_id(player_id)
    with db() as con:
        con.execute("INSERT OR IGNORE INTO players(id,gold,health,round,shop_level,shop_discount) VALUES(?,?,?,?,?,?)",(player_id,10,50,1,1,0))
    return player_id

def reset_player(player_id="local"):
    """?????????????"""
    player_id=normalize_player_id(player_id)
    with db() as con:
        con.execute("INSERT OR REPLACE INTO players(id,gold,health,round,shop_level,shop_discount) VALUES(?,?,?,?,?,?)",(player_id,10,50,1,1,0))
    return player(player_id)

def cards():
    """?????????????????????????????"""
    units=[{"id":u[0],"name":u[1],"card_type":"unit","role":u[2],"faction":u[3],"cost":u[4],"max_hp":u[5],"attack":u[6],"attack_range":u[7],"color":u[8],"effect_value":0,"description":f"{u[2]}\uff1a\u653b {u[6]} / \u8840 {u[5]}","unit_id":u[0],"stars":min(3,u[4])} for u in UNITS]
    skills=[{"id":s[0],"name":s[1],"card_type":s[2],"faction":s[3],"cost":s[4],"effect_value":s[5],"description":s[6],"color":s[7],"unit_id":None,"stars":0} for s in SKILLS]
    return sorted(units+skills,key=lambda card:(card["cost"],card["id"]))

def player(player_id="local"):
    player_id=ensure_player(player_id)
    with db() as con:
        row=con.execute("SELECT id,gold,health,round,shop_level,shop_discount FROM players WHERE id=?",(player_id,)).fetchone()
        if not row: raise ValueError("\u73a9\u5bb6\u4e0d\u5b58\u5728")
        return with_shop_status(row)

def shop(count=None, player_id="local"):
    # ?????????????????????????????
    level=player(player_id)["shop_level"]
    count=shop_slot_count(level) if count is None else count
    pool=[card for card in cards() if card["card_type"]=="unit" and card["cost"]<=level]
    if not pool: return [None]*count
    return [dict(random.choice(pool)) for _ in range(count)]

def buy_card(card_id, player_id="local"):
    with db() as con:
        card=next((card for card in cards() if card["id"]==card_id),None)
        row=con.execute("SELECT gold,shop_level FROM players WHERE id=?",(player_id,)).fetchone()
        if not card: raise ValueError("\u5361\u724c\u4e0d\u5b58\u5728")
        if card["card_type"] != "unit": raise ValueError("\u6280\u80fd\u5361\u4e0d\u80fd\u4ece\u5546\u5e97\u8d2d\u4e70")
        if not row: raise ValueError("\u73a9\u5bb6\u4e0d\u5b58\u5728")
        if card["cost"] > row["shop_level"]: raise ValueError("\u5546\u5e97\u7b49\u7ea7\u4e0d\u8db3\uff0c\u4e0d\u80fd\u8d2d\u4e70\u8be5\u68cb\u5b50")
        if row['gold']<card['cost']: raise ValueError("\u91d1\u5e01\u4e0d\u8db3")
        gold=row['gold']-card['cost']; con.execute("UPDATE players SET gold=? WHERE id=?",(gold,player_id))
    data=player(player_id); data["card"]=card; return data

def sell_unit(card_id, player_id="local", half=False):
    """????????????????????????????"""
    card=next((card for card in cards() if card["id"]==card_id),None)
    if not card or card["card_type"] != "unit": raise ValueError("\u53ea\u80fd\u51fa\u552e\u68cb\u5b50")
    with db() as con:
        row=con.execute("SELECT gold FROM players WHERE id=?",(player_id,)).fetchone()
        if not row: raise ValueError("\u73a9\u5bb6\u4e0d\u5b58\u5728")
        refund=(card["cost"]+1)//2 if half else card["cost"]
        gold=row["gold"]+refund; con.execute("UPDATE players SET gold=? WHERE id=?",(gold,player_id))
    data=player(player_id); data["refund"]=refund; return data

def refresh_shop(player_id="local"):
    with db() as con:
        row=con.execute("SELECT gold FROM players WHERE id=?",(player_id,)).fetchone()
        if not row or row['gold']<1: raise ValueError("\u91d1\u5e01\u4e0d\u8db3")
        gold=row['gold']-1; con.execute("UPDATE players SET gold=? WHERE id=?",(gold,player_id))
    data=player(player_id); data["shop"]=shop(player_id=player_id); return data

def upgrade_shop(player_id="local"):
    with db() as con:
        row=con.execute("SELECT gold,shop_level,shop_discount FROM players WHERE id=?",(player_id,)).fetchone()
        if not row: raise ValueError("\u73a9\u5bb6\u4e0d\u5b58\u5728")
        if row["shop_level"] >= MAX_SHOP_LEVEL: raise ValueError("\u5546\u5e97\u5df2\u6ee1\u7ea7")
        cost=upgrade_cost_for(row["shop_level"],row["shop_discount"])
        if row["gold"] < cost: raise ValueError("\u91d1\u5e01\u4e0d\u8db3")
        con.execute("UPDATE players SET gold=?,shop_level=?,shop_discount=0 WHERE id=?",(row["gold"]-cost,row["shop_level"]+1,player_id))
    data=player(player_id); data["spent"]=cost; return data

def first_striker(left, right):
    """先手规则：棋子数量多者优先；再比最左攻击；完全相同则随机。"""
    left_count=sum(unit is not None for unit in left)
    right_count=sum(unit is not None for unit in right)
    if left_count != right_count: return "left" if left_count > right_count else "right"
    la=next((u for u in left if u),None); ra=next((u for u in right if u),None)
    if not la: return "right"
    if not ra: return "left"
    if la['attack'] == ra['attack']: return random.choice(["left","right"])
    return "left" if la['attack'] > ra['attack'] else "right"

def tavern_battle(left, right, round_number=1):
    """经典横向战斗：先手方起，每方从左至右轮流攻击，目标随机。"""
    # 每场战斗开始时，所有上场棋子均从其初始血量开始。
    left=[dict(u,current_hp=u['max_hp']) if u else None for u in left[:7]]
    right=[dict(u,current_hp=u['max_hp']) if u else None for u in right[:7]]
    left += [None]*(7-len(left)); right += [None]*(7-len(right))
    turn=first_striker(left,right); cursor={"left":0,"right":0}; events=[]
    def living(team): return [(i,u) for i,u in enumerate(team) if u and u['current_hp']>0]
    while living(left) and living(right):
        mine,foes=(left,right) if turn=="left" else (right,left)
        choices=living(mine); index,attacker=next(((i,u) for i,u in choices if i>=cursor[turn]),choices[0])
        cursor[turn]=(index+1)%7
        target_index,target=random.choice(living(foes)); damage=attacker['attack']; target['current_hp']-=damage
        target_dead=target['current_hp'] <= 0
        events.append({"side":turn,"from":attacker['name'],"from_slot":index+1,"to":target['name'],"to_slot":target_index+1,"target_side":"right" if turn=="left" else "left","damage":damage,"target_hp":max(0,target['current_hp']),"target_dead":target_dead})
        if target_dead: foes[target_index]=None
        turn="right" if turn=="left" else "left"
    winner="left" if living(left) else "right"
    remaining_stars=sum(unit.get("stars",1) for _,unit in living(right))
    loss_damage=0 if winner=="left" else (min(remaining_stars,15) if round_number < 10 else remaining_stars)
    return {"winner":winner,"events":events,"left":left,"right":right,"remaining_stars":remaining_stars,"loss_damage":loss_damage}

def settle_battle(result, round_number, player_id="local"):
    """单人模式结算：未用完金币继承；进入下一回合时获得递增额外金币；失败仍按 AI 存活星级扣血。"""
    with db() as con:
        row=con.execute("SELECT gold,health FROM players WHERE id=?",(player_id,)).fetchone()
        if not row: raise ValueError("玩家不存在")
        income=round_income(round_number)
        victory_bonus=5 if result["winner"]=="left" else 0
        gold=row["gold"]+income+victory_bonus
        health=max(0,row["health"]-result["loss_damage"])
        con.execute("UPDATE players SET gold=?,health=?,round=?,shop_discount=shop_discount+1 WHERE id=?",(gold,health,round_number+1,player_id))
    data=player(player_id); data.update({"gold":gold,"health":health,"income":income,"victory_bonus":victory_bonus}); return data

def enemy_board(round_number):
    """14 轮单人出怪：数量固定曲线，属性在目标值 ±20% 内，高轮偏好高星。"""
    if not 1 <= round_number <= 14: return [None]*7
    amount = 1 if round_number <= 2 else 2 if round_number == 3 else 4 if round_number == 4 else 6 if round_number == 5 else 7
    pool=[c for c in cards() if c['card_type']=='unit']; board=[None]*7
    # 轮次越高，对 2/3 星棋子的权重越大；每张卡的攻血和都以本轮目标为基准。
    star_bias = 0.35 + round_number / 5
    for i in range(amount):
        base=random.choices(pool,weights=[1 + max(0,c['stars']-1)*star_bias for c in pool],k=1)[0]
        card=dict(base); target=AI_POWER[round_number-1]
        if round_number >= 5: attack_ratio=random.uniform(.35,.65)
        else: attack_ratio=random.uniform(.2,.8)
        card['attack']=max(1,round(target*attack_ratio)); card['max_hp']=max(1,target-card['attack']); card['current_hp']=card['max_hp']
        card['name']=f"{card['name']}·{card['stars']}星"
        board[i]=card
    return board

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT),**kw)
    def json(self,payload,status=200):
        raw=json.dumps(payload,ensure_ascii=False).encode(); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def body(self): return json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))) or b'{}')
    def player_id(self): return normalize_player_id(self.headers.get('X-Player-Id') or 'local')
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/api/cards': return self.json(cards())
        if path=='/api/shop': return self.json(shop(player_id=self.player_id()))
        if path=='/api/player': return self.json(player(self.player_id()))
        return super().do_GET()
    def do_POST(self):
        path,data=urlparse(self.path).path,self.body()
        try:
            if path=='/api/buy': return self.json(buy_card(data['card_id'], self.player_id()))
            if path=='/api/sell': return self.json(sell_unit(data['card_id'], self.player_id(), half=bool(data.get('half'))))
            if path=='/api/refresh': return self.json(refresh_shop(self.player_id()))
            if path=='/api/upgrade_shop': return self.json(upgrade_shop(self.player_id()))
            if path=='/api/reset': return self.json(reset_player(self.player_id()))
            if path=='/api/enemy': return self.json(enemy_board(int(data.get('round',1))))
            if path=='/api/battle':
                round_number=int(data.get('round',1)); result=tavern_battle(data.get('left',[]),data.get('right',[]),round_number); result.update(settle_battle(result,round_number,self.player_id())); return self.json(result)
            self.json({'error':'not found'},404)
        except (KeyError,ValueError) as e: self.json({'error':str(e)},400)

def local_play_urls(port=8000):
    urls=['http://127.0.0.1:8000']
    try:
        host=socket.gethostname()
        ips={ip for ip in socket.gethostbyname_ex(host)[2] if not ip.startswith('127.')}
        for ip in sorted(ips): urls.append(f'http://{ip}:{port}')
    except OSError:
        pass
    return urls

if __name__=='__main__':
    initialise_database()
    print('Tavern mode play URLs:')
    for url in local_play_urls(): print('  '+url)
    ThreadingHTTPServer(('0.0.0.0',8000),Handler).serve_forever()
