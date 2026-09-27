-- UTF-8
-- 棋子基础属性、阵营、描述及机制配置的唯一数据源。
-- 修改棋子后重启 server.py，数据会自动同步到 data/autochess.sqlite。

CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    gold INTEGER NOT NULL DEFAULT 3,
    health INTEGER NOT NULL DEFAULT 50,
    round INTEGER NOT NULL DEFAULT 1,
    shop_level INTEGER NOT NULL DEFAULT 1,
    shop_discount INTEGER NOT NULL DEFAULT 0,
    total_gold_earned INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS unit_cards (
    id TEXT PRIMARY KEY,              -- 英文名/稳定标识
    name TEXT NOT NULL,               -- 中文名
    role TEXT NOT NULL,
    faction TEXT NOT NULL,            -- 阵营
    tier INTEGER NOT NULL,            -- 星级
    max_hp INTEGER NOT NULL,          -- 初始血量
    attack INTEGER NOT NULL,          -- 初始攻击
    attack_range INTEGER NOT NULL DEFAULT 1,
    color TEXT NOT NULL,
    description TEXT NOT NULL,        -- 普通卡中文描述
    extras_json TEXT NOT NULL DEFAULT '{}' -- 机制、金卡描述与金卡机制（UTF-8 JSON）
);

-- CONFESS-47 / CONFESS_47
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('CONFESS_47','CONFESS-47','拉特兰干员','拉特兰',1,2,2,1,'#e53935','嘲讽；遗计：对最近的1个敌人造成1铳弹伤害，2次','{"mechanics":["guard","legacy","bullet_damage"],"guard":true,"legacy":{"type":"bullet_damage","damage":1,"hits":2,"target":"nearest"},"golden_description":"嘲讽；遗计：对最近的1个敌人造成1铳弹伤害，4次","golden_overrides":{"description":"嘲讽；遗计：对最近的1个敌人造成1铳弹伤害，4次","legacy":{"type":"bullet_damage","damage":1,"hits":4,"target":"nearest"}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 安比尔 / Ambriel
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Ambriel','安比尔','拉特兰干员','拉特兰',2,3,2,1,'#e53935','嘲讽；复活；遗计：随机对1个敌人造成2铳弹伤害','{"mechanics":["guard","revive","legacy","bullet_damage"],"guard":true,"revive":true,"legacy":{"type":"bullet_damage","damage":2,"hits":1,"target":"random"},"golden_description":"嘲讽；复活；遗计：随机对1个敌人造成2铳弹伤害，2次","golden_overrides":{"description":"嘲讽；复活；遗计：随机对1个敌人造成2铳弹伤害，2次","legacy":{"type":"bullet_damage","damage":2,"hits":2,"target":"random"}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 翎羽 / Plume
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Plume','翎羽','拉特兰干员','拉特兰',1,2,1,1,'#e53935','战斗开始：本回合战斗中，所有友方棋子获得+1铳弹强度','{"mechanics":["battle_start","bullet_strength"],"battle_start":{"type":"team_bullet_strength","amount":1},"golden_description":"战斗开始：本回合战斗中，所有友方棋子获得+2铳弹强度","golden_overrides":{"description":"战斗开始：本回合战斗中，所有友方棋子获得+2铳弹强度","battle_start":{"type":"team_bullet_strength","amount":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 芳汀 / Arene
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Arene','芳汀','拉特兰干员','拉特兰',2,2,2,1,'#e53935','上场：获得1张【铳弹协约】','{"mechanics":["on_deploy"],"on_deploy":{"type":"gain_ammo_pact"},"golden_description":"上场：获得2张【铳弹协约】","golden_overrides":{"description":"上场：获得2张【铳弹协约】","on_deploy":{"type":"gain_ammo_pact","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 空构 / Spuria
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Spuria','空构','拉特兰干员','拉特兰',3,2,2,1,'#e53935','上场：选择1个拉特兰棋子，使其获得+3/+3和复活','{"mechanics": ["on_deploy"], "on_deploy": {"type": "select_buff_revive", "faction": "拉特兰", "attack": 3, "max_hp": 3}, "golden_description": "上场：选择1个拉特兰棋子，使其获得+6/+6和复活", "golden_overrides": {"on_deploy": {"type": "select_buff_revive", "faction": "拉特兰", "attack": 6, "max_hp": 6}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 见行者 / Enforcer
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Enforcer','见行者','拉特兰干员','拉特兰',2,4,2,1,'#e53935','友方每累计造成3次伤害，自身永久获得+1/+1','{"mechanics":["cumulative","permanent"],"cumulative_damage":{"threshold":3,"attack":1,"max_hp":1,"counter_key":"cumulative_damage_count"},"golden_description":"友方每累计造成3次伤害，自身永久获得+2/+2","golden_overrides":{"description":"友方每累计造成3次伤害，自身永久获得+2/+2","cumulative_damage":{"threshold":3,"attack":2,"max_hp":2,"counter_key":"cumulative_damage_count"}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 能天使 / Exusiai
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Exusiai','能天使','拉特兰干员','拉特兰',3,2,3,1,'#e53935','先手：随机对1个敌人造成2铳弹伤害，3次','{"mechanics":["initiative","bullet_damage"],"initiative":{"type":"random_bullet_damage","damage":2,"hits":3},"golden_description":"先手：随机对1个敌人造成2铳弹伤害，6次","golden_overrides":{"description":"先手：随机对1个敌人造成2铳弹伤害，6次","initiative":{"type":"random_bullet_damage","damage":2,"hits":6}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 空弦 / Archetto
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Archetto','空弦','拉特兰干员','拉特兰',3,2,4,1,'#e53935','遗计：随机使1个友方拉特兰棋子获得复活','{"mechanics":["legacy"],"legacy":{"type":"grant_revive","target":"random_friendly_latteran"},"golden_description":"遗计：随机使2个友方拉特兰棋子获得复活","golden_overrides":{"description":"遗计：随机使2个友方拉特兰棋子获得复活","legacy":{"type":"grant_revive","target":"random_friendly_latteran","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 送葬人 / Executor
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Executor','送葬人','拉特兰干员','拉特兰',3,4,3,1,'#e53935','先手：获得1张【经济资助】','{"mechanics":["initiative"],"initiative":{"type":"gain_skill_card","card_id":"economic_aid"},"golden_description":"先手：获得2张【经济资助】","golden_overrides":{"description":"先手：获得2张【经济资助】","initiative":{"type":"gain_skill_card","card_id":"economic_aid","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 菲亚梅塔 / Fiammetta
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Fiammetta','菲亚梅塔','拉特兰干员','拉特兰',4,4,4,1,'#e53935','复活；遗计：随机对1个敌人造成2铳弹伤害，2次；后勤：获得+1/+1和+1铳弹伤害','{"mechanics":["revive","legacy","logistics","bullet_damage"],"revive":true,"legacy":{"type":"bullet_damage","damage":2,"hits":2,"target":"random"},"logistics":{"attack":1,"max_hp":1,"bullet_damage":1},"golden_description":"复活；遗计：随机对1个敌人造成2铳弹伤害，4次；后勤：获得+2/+2和+2铳弹伤害","golden_overrides":{"description":"复活；遗计：随机对1个敌人造成2铳弹伤害，4次；后勤：获得+2/+2和+2铳弹伤害","legacy":{"type":"bullet_damage","damage":2,"hits":4,"target":"random"},"logistics":{"attack":2,"max_hp":2,"bullet_damage":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 圣约送葬人 / Executor the Ex Foedere
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Executor the Ex Foedere','圣约送葬人','拉特兰干员','拉特兰',4,5,2,1,'#e53935','护盾；嘲讽；守护：对攻击者造成2铳弹伤害，1次','{"mechanics":["shield","guard","guardian","bullet_damage"],"guard":true,"shield":true,"guardian":{"type":"bullet_damage","damage":2,"hits":1},"golden_description":"护盾；嘲讽；守护：对攻击者造成2铳弹伤害，2次","golden_overrides":{"description":"护盾；嘲讽；守护：对攻击者造成2铳弹伤害，2次","guardian":{"type":"bullet_damage","damage":2,"hits":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 隐现 / Insider
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Insider','隐现','拉特兰干员','拉特兰',4,4,4,1,'#e53935','上场：使所有其他友方棋子获得+2铳弹强度和+2/+2','{"mechanics":["on_deploy","bullet_strength"],"on_deploy":{"type":"team_buff","exclude_self":true,"attack":2,"max_hp":2,"bullet_strength":2},"golden_description":"上场：使所有其他友方棋子获得+4铳弹强度和+4/+4","golden_overrides":{"description":"上场：使所有其他友方棋子获得+4铳弹强度和+4/+4","on_deploy":{"type":"team_buff","exclude_self":true,"attack":4,"max_hp":4,"bullet_strength":4}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 新约能天使 / Exusiai the New Covenant
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Exusiai the New Covenant','新约能天使','拉特兰干员','拉特兰',6,6,3,1,'#e53935','后勤&先手：使所有友方棋子获得+1铳弹强度和+3/+3','{"mechanics":["logistics","initiative","bullet_strength"],"logistics":{"type":"team_buff","attack":3,"max_hp":3,"bullet_strength":1},"initiative":{"type":"team_buff","attack":3,"max_hp":3,"bullet_strength":1},"golden_description":"后勤&先手：使所有友方获得+2铳弹强度和+6/+6","golden_overrides":{"description":"后勤&先手：使所有友方获得+2铳弹强度和+6/+6","logistics":{"type":"team_buff","attack":6,"max_hp":6,"bullet_strength":2},"initiative":{"type":"team_buff","attack":6,"max_hp":6,"bullet_strength":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 莫斯提马 / Mostima
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Mostima','莫斯提马','拉特兰干员','拉特兰',5,4,4,1,'#e53935','友方每累计造成2次伤害，所有友方棋子永久获得+1/+1','{"mechanics":["cumulative","permanent"],"cumulative_damage":{"type":"team_buff","threshold":2,"attack":1,"max_hp":1,"counter_key":"mostima_damage_count"},"golden_description":"友方每累计造成2次伤害，所有友方棋子永久获得+2/+2","golden_overrides":{"description":"友方每累计造成2次伤害，所有友方棋子永久获得+2/+2","cumulative_damage":{"type":"team_buff","threshold":2,"attack":2,"max_hp":2,"counter_key":"mostima_damage_count"}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 塑心 / Virtuosa
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Virtuosa','塑心','拉特兰干员','拉特兰',5,2,2,1,'#e53935','遗计：本回合战斗中，所有友方棋子获得+2铳弹强度和+2/+2','{"mechanics":["legacy","bullet_strength"],"legacy":{"type":"team_buff","attack":2,"max_hp":2,"bullet_strength":2,"round_aura":true},"golden_description":"遗计：本回合战斗中，所有友方棋子获得+4铳弹强度和+4/+4","golden_overrides":{"description":"遗计：本回合战斗中，所有友方棋子获得+4铳弹强度和+4/+4","legacy":{"type":"team_buff","attack":4,"max_hp":4,"bullet_strength":4,"round_aura":true}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 蕾缪安 / Lemuen
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Lemuen','蕾缪安','拉特兰干员','拉特兰',6,9,6,1,'#e53935','死仇(1)：随机对1个敌人造成2铳弹伤害，并自身本回合获得+1铳弹强度','{"mechanics":["death_feud","bullet_damage","bullet_strength"],"death_feud":{"threshold":1,"type":"random_bullet_damage","damage":2,"self_bullet_strength":1},"golden_description":"死仇(1)：随机对2个敌人造成2铳弹伤害，并自身本回合获得+2铳弹强度","golden_overrides":{"description":"死仇(1)：随机对2个敌人造成2铳弹伤害，并自身本回合获得+2铳弹强度","death_feud":{"threshold":1,"type":"random_bullet_damage","damage":2,"target_count":2,"self_bullet_strength":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 信仰搅拌机 / Sankta Mikaparato
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Sankta Mikaparato','信仰搅拌机','拉特兰干员','拉特兰',6,6,6,1,'#e53935','复活；遗计：召唤1个CONFESS-47使其获得复活，并随机对1个敌人造成2铳弹伤害','{"mechanics":["revive","legacy","bullet_damage"],"revive":true,"legacy":{"type":"summon_then_bullet","summon_id":"CONFESS_47","grant_revive":true,"damage":2,"hits":1,"target":"random","consume_revive":true},"golden_description":"复活；遗计：召唤1个金色的CONFESS-47使其获得复活，并随机对1个敌人造成2铳弹伤害2次","golden_overrides":{"description":"复活；遗计：召唤1个金色的CONFESS-47使其获得复活，并随机对1个敌人造成2铳弹伤害2次","legacy":{"type":"summon_then_bullet","summon_id":"CONFESS_47","summon_golden":true,"grant_revive":true,"damage":2,"hits":2,"target":"random","consume_revive":true}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 缪尔赛思 / Muelsyse
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Muelsyse','缪尔赛思','中立干员','中立',6,6,6,1,'#cfd4dc','上场：选择棋盘上的1个棋子，缪尔赛思将变形为该棋子的普通版本，并保留缪尔赛思的属性','{"mechanics":["on_deploy"],"on_deploy":{"type":"transform_select","target_golden":false},"golden_description":"上场：选择棋盘上的1个棋子，缪尔赛思将变形为该棋子的金卡版本，并保留缪尔赛思的属性","golden_overrides":{"description":"上场：选择棋盘上的1个棋子，缪尔赛思将变形为该棋子的金卡版本，并保留缪尔赛思的属性","on_deploy":{"type":"transform_select","target_golden":true}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 逻各斯 / Logos
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Logos','逻各斯','中立干员','中立',5,8,2,1,'#cfd4dc','友方遗计效果触发2次（多个逻各斯上场时，取最高效果）','{"mechanics":["legacy_amplifier"],"legacy_multiplier":2,"golden_description":"友方遗计效果触发3次（多个逻各斯上场时，取最高效果）","golden_overrides":{"description":"友方遗计效果触发3次（多个逻各斯上场时，取最高效果）","legacy_multiplier":3}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;
-- 傀影 / Phantom
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Phantom','傀影','任意干员','任意',3,4,2,1,'#c9b6ff','可以代替任意1个3星及以下的棋子进行三连','{"mechanics":["wildcard_faction","wildcard_merge"],"wildcard_merge_max_tier":3,"golden_description":"可以代替任意1个6星及以下的棋子进行三连（傀影除外）","golden_overrides":{"description":"可以代替任意1个6星及以下的棋子进行三连（傀影除外）","wildcard_merge_max_tier":6,"wildcard_exclude_ids":["Phantom"]}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;
-- U-Official
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('U-Official','U-Official','任意干员','任意',1,1,2,1,'#c9b6ff','上场：获得1张【经济资助】','{"mechanics":["on_deploy","wildcard_faction"],"on_deploy":{"type":"gain_skill_card","card_id":"economic_aid","count":1},"golden_description":"上场：获得2张【经济资助】","golden_overrides":{"description":"上场：获得2张【经济资助】","on_deploy":{"type":"gain_skill_card","card_id":"economic_aid","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;
-- 华法琳 / Warfarin
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Warfarin','华法琳','中立干员','中立',5,5,2,1,'#cfd4dc','友方后勤效果触发2次（多个华法琳上场时，取最高效果）','{"mechanics":["logistics_amplifier"],"logistics_multiplier":2,"golden_description":"友方后勤效果触发3次（多个华法琳上场时，取最高效果）","golden_overrides":{"description":"友方后勤效果触发3次（多个华法琳上场时，取最高效果）","logistics_multiplier":3}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;
-- 可露希尔 / Closure
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Closure','可露希尔','中立干员','中立',5,4,3,1,'#cfd4dc','友方上场效果触发2次（多个可露希尔上场时，取最高效果）','{"mechanics":["on_deploy_amplifier"],"on_deploy_multiplier":2,"golden_description":"友方上场效果触发3次（多个可露希尔上场时，取最高效果）","golden_overrides":{"description":"友方上场效果触发3次（多个可露希尔上场时，取最高效果）","on_deploy_multiplier":3}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 锡人 / Tin Man
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Tin Man','锡人','中立干员','中立',5,3,5,1,'#cfd4dc','友方先手效果触发2次（多个锡人上场时，取最高效果）','{"mechanics":["initiative_amplifier"],"initiative_multiplier":2,"golden_description":"友方先手效果触发3次（多个锡人上场时，取最高效果）","golden_overrides":{"description":"友方先手效果触发3次（多个锡人上场时，取最高效果）","initiative_multiplier":3}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 惊蛰 / Leizi
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Leizi','惊蛰','炎干员','炎',1,3,2,1,'#f2c94c','化境：自身永久获得+1/+1','{"mechanics":["morale","permanent"],"morale":{"attack":1,"max_hp":1},"golden_description":"化境：自身永久获得+2/+2","golden_overrides":{"description":"化境：自身永久获得+2/+2","morale":{"attack":2,"max_hp":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 乌有 / Mr.Nothing
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Mr.Nothing','乌有','炎干员','炎',1,2,1,1,'#f2c94c','上场：获得1张【天有四时】','{"mechanics":["on_deploy"],"on_deploy":{"type":"gain_four_seasons","count":1},"golden_description":"上场：获得2张【天有四时】","golden_overrides":{"description":"上场：获得2张【天有四时】","on_deploy":{"type":"gain_four_seasons","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 录武官 / Record Keeper
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Record Keeper','录武官','炎干员','炎',2,4,2,1,'#f2c94c','后勤：使相邻的棋子获得+2/+1','{"mechanics":["logistics"],"logistics":{"type":"adjacent_buff","attack":2,"max_hp":1,"repetitions":1},"golden_description":"后勤：使相邻的棋子获得+2/+1，2次","golden_overrides":{"description":"后勤：使相邻的棋子获得+2/+1，2次","logistics":{"type":"adjacent_buff","attack":2,"max_hp":1,"repetitions":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 矩 / Ju
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Ju','矩','炎干员','炎',2,2,2,1,'#f2c94c','支援：自身获得+1/+1；招募：获得1张【天有四时】','{"mechanics":["support","recruit"],"support":{"threshold":1,"attack":1,"max_hp":1},"recruit":{"type":"gain_four_seasons","count":1},"golden_description":"支援：自身获得+2/+2；招募：获得2张【天有四时】","golden_overrides":{"description":"支援：自身获得+2/+2；招募：获得2张【天有四时】","support":{"threshold":1,"attack":2,"max_hp":2},"recruit":{"type":"gain_four_seasons","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 夕 / Dusk
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Dusk','夕','炎干员','炎',2,2,3,1,'#f2c94c','护盾；化境：使1个友方其他棋子永久获得+2/+1','{"mechanics":["shield","morale","permanent"],"shield":true,"morale":{"type":"random_other_buff","attack":2,"max_hp":1},"golden_description":"护盾；化境：使1个友方其他棋子永久获得+4/+2","golden_overrides":{"description":"护盾；化境：使1个友方其他棋子永久获得+4/+2","morale":{"type":"random_other_buff","attack":4,"max_hp":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 黍 / Shu
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Shu','黍','炎干员','炎',3,2,2,1,'#f2c94c','后勤：使所有其他友方棋子获得+1/+1','{"mechanics":["logistics"],"logistics":{"type":"team_buff","exclude_self":true,"attack":1,"max_hp":1},"golden_description":"后勤：使所有其他友方棋子获得+2/+2","golden_overrides":{"description":"后勤：使所有其他友方棋子获得+2/+2","logistics":{"type":"team_buff","exclude_self":true,"attack":2,"max_hp":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 仇白 / Qiubai
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Qiubai','仇白','炎干员','炎',3,4,3,1,'#f2c94c','化境：使所有友方棋子永久获得+1生命','{"mechanics":["morale","permanent"],"morale":{"type":"team_hp_buff","max_hp":1},"golden_description":"化境：使所有友方棋子永久获得+2生命","golden_overrides":{"description":"化境：使所有友方棋子永久获得+2生命","morale":{"type":"team_hp_buff","max_hp":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 令 / Ling
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Ling','令','炎干员','炎',3,3,4,1,'#f2c94c','嘲讽；招募&遗计：获得1张【天有四时】','{"mechanics":["guard","recruit","legacy"],"guard":true,"recruit":{"type":"gain_four_seasons","count":1},"legacy":{"type":"gain_four_seasons","count":1},"golden_description":"嘲讽；招募&遗计：获得2张【天有四时】","golden_overrides":{"description":"嘲讽；招募&遗计：获得2张【天有四时】","recruit":{"type":"gain_four_seasons","count":2},"legacy":{"type":"gain_four_seasons","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 弑君者 / Crownslayer
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Crownslayer','弑君者','中立干员','中立',5,1,3,1,'#cfd4dc','鸩毒；遗计：对击杀者造成1铳弹伤害','{"mechanics":["venom","legacy","bullet_damage"],"venom":true,"legacy":{"type":"bullet_damage","damage":1,"hits":1,"target":"killer"},"golden_description":"鸩毒；遗计：对击杀者造成1铳弹伤害，2次","golden_overrides":{"description":"鸩毒；遗计：对击杀者造成1铳弹伤害，2次","legacy":{"type":"bullet_damage","damage":1,"hits":2,"target":"killer"}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 余 / Yu
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Yu','余','炎干员','炎',4,5,3,1,'#f2c94c','售出：获得1张【礼尚往来】，并将商店内的所有棋子替换为星级+1的随机棋子','{"mechanics":["sell"],"sell":{"type":"gift_exchange_and_upgrade_shop","count":1},"golden_description":"售出：获得2张【礼尚往来】，并将商店内的所有棋子替换为星级+1的随机棋子","golden_overrides":{"description":"售出：获得2张【礼尚往来】，并将商店内的所有棋子替换为星级+1的随机棋子","sell":{"type":"gift_exchange_and_upgrade_shop","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 左乐 / Zuo Le
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Zuo Le','左乐','炎干员','炎',4,6,4,1,'#f2c94c','护盾；突袭(1)；攻击前：使所有友方永久获得+1/+1','{"mechanics":["shield","raid","before_attack","permanent"],"shield":true,"raid":{"hits":1},"before_attack":{"type":"team_buff","attack":1,"max_hp":1,"repetitions":1},"golden_description":"护盾；突袭(2)；攻击前：使所有友方永久获得+1/+1，2次","golden_overrides":{"description":"护盾；突袭(2)；攻击前：使所有友方永久获得+1/+1，2次","raid":{"hits":2},"before_attack":{"type":"team_buff","attack":1,"max_hp":1,"repetitions":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 星熊 / Hoshiguma
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Hoshiguma','星熊','炎干员','炎',4,4,6,1,'#f2c94c','护盾；化境：自身永久获得+2/+2','{"mechanics":["shield","morale","permanent"],"shield":true,"morale":{"attack":2,"max_hp":2},"golden_description":"护盾；化境：自身永久获得+4/+4","golden_overrides":{"description":"护盾；化境：自身永久获得+4/+4","morale":{"attack":4,"max_hp":4}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 伊内丝 / Ines
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Ines','伊内丝','中立干员','中立',4,3,2,1,'#cfd4dc','售出：挑选对手的1个部将（无法挑选到伊内丝）','{"mechanics":["sell","pick"],"sell":{"type":"pick_enemy","count":1},"golden_description":"售出：挑选对手的2个部将（无法挑选到伊内丝）","golden_overrides":{"description":"售出：挑选对手的2个部将（无法挑选到伊内丝）","sell":{"type":"pick_enemy","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 赫德雷 / Hoederer
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Hoederer','赫德雷','中立干员','中立',4,2,2,1,'#cfd4dc','售出：挑选1个当前商店等级的棋子，并使其获得赫德雷的属性','{"mechanics":["sell","pick"],"sell":{"type":"pick_shop_tier_add_self_stats","count":1},"golden_description":"售出：挑选2个当前商店等级的棋子，并使其获得赫德雷的属性","golden_overrides":{"description":"售出：挑选2个当前商店等级的棋子，并使其获得赫德雷的属性","sell":{"type":"pick_shop_tier_add_self_stats","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 罗比菈塔 / Roberta
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Roberta','罗比菈塔','中立干员','中立',2,2,2,1,'#cfd4dc','上场：选择1个棋子，使其获得+2/+2，并获得嘲讽；若其被选择时已有嘲讽则移除嘲讽','{"mechanics":["on_deploy"],"on_deploy":{"type":"select_buff_toggle_guard","attack":2,"max_hp":2},"golden_description":"上场：选择1个棋子，使其获得+4/+4，并获得嘲讽；若其被选择时已有嘲讽则移除嘲讽","golden_overrides":{"description":"上场：选择1个棋子，使其获得+4/+4，并获得嘲讽；若其被选择时已有嘲讽则移除嘲讽","on_deploy":{"type":"select_buff_toggle_guard","attack":4,"max_hp":4}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 波登可 / Podenco
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Podenco','波登可','中立干员','中立',4,3,3,1,'#cfd4dc','上场：选择1个棋子，使其获得嘲讽，并使所有友方具有嘲讽的棋子获得+3/+3','{"mechanics":["on_deploy"],"on_deploy":{"type":"select_guard_then_buff_guards","attack":3,"max_hp":3},"golden_description":"上场：选择1个棋子，使其获得嘲讽，并使所有友方具有嘲讽的棋子获得+6/+6","golden_overrides":{"description":"上场：选择1个棋子，使其获得嘲讽，并使所有友方具有嘲讽的棋子获得+6/+6","on_deploy":{"type":"select_guard_then_buff_guards","attack":6,"max_hp":6}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 妮芙 / Nymph
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Nymph','妮芙','中立干员','中立',6,12,3,1,'#cfd4dc','先手：兼并左侧友方棋子，触发并获得其遗计','{"mechanics":["initiative","assimilate"],"initiative":{"type":"assimilate_left","count":1},"golden_description":"兼并左侧2个友方棋子，触发并获得其遗计","golden_overrides":{"description":"兼并左侧2个友方棋子，触发并获得其遗计","initiative":{"type":"assimilate_left","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 老鲤 / Lee
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Lee','老鲤','中立干员','中立',3,2,3,1,'#cfd4dc','上场：获得1张【和气生财】','{"mechanics":["on_deploy"],"on_deploy":{"type":"gain_harmony_prosperity","count":1},"golden_description":"上场：获得2张【和气生财】","golden_overrides":{"description":"上场：获得2张【和气生财】","on_deploy":{"type":"gain_harmony_prosperity","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- W
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('W','W','中立干员','中立',3,2,4,1,'#cfd4dc','遗计：对双方所有棋子造成2铳弹伤害','{"mechanics":["legacy","bullet_damage"],"legacy":{"type":"all_units_bullet_damage","damage":2,"hits":1},"golden_description":"遗计：对双方所有棋子造成2铳弹伤害，2次","golden_overrides":{"description":"遗计：对双方所有棋子造成2铳弹伤害，2次","legacy":{"type":"all_units_bullet_damage","damage":2,"hits":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 死芒 / Necrass
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Necrass','死芒','中立干员','中立',5,3,9,1,'#cfd4dc','嘲讽；遗计：召唤并获得1个友方存活最多阵营的随机棋子','{"mechanics":["guard","legacy"],"guard":true,"legacy":{"type":"summon_and_gain_dominant_faction","count":1},"golden_description":"嘲讽；遗计：召唤并获得2个友方存活最多阵营的随机棋子","golden_overrides":{"description":"嘲讽；遗计：召唤并获得2个友方存活最多阵营的随机棋子","legacy":{"type":"summon_and_gain_dominant_faction","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 刻俄柏 / Ceobe
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Ceobe','刻俄柏','中立干员','中立',5,6,3,1,'#cfd4dc','回营：兼并左侧的棋子，并获得其防御机制，同时获得3金币','{"mechanics":["return_camp","assimilate","defense_mechanism"],"return_camp":{"type":"assimilate_left_defenses_gain_gold","gold":3},"golden_description":"回营：兼并左侧的棋子，并获得其防御机制，同时获得6金币","golden_overrides":{"description":"回营：兼并左侧的棋子，并获得其防御机制，同时获得6金币","return_camp":{"type":"assimilate_left_defenses_gain_gold","gold":6}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 凯尔希 / Kal'tsit
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Kal''tsit','凯尔希','任意干员','任意',6,7,7,1,'#c9b6ff','协同(任意)：使所有友方棋子获得+2/+2','{"mechanics":["synergy","wildcard_faction"],"synergy":{"faction":"任意","type":"team_buff","attack":2,"max_hp":2,"repetitions":1},"golden_description":"协同(任意)：使所有友方棋子获得+2/+2，2次","golden_overrides":{"description":"协同(任意)：使所有友方棋子获得+2/+2，2次","synergy":{"faction":"任意","type":"team_buff","attack":2,"max_hp":2,"repetitions":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 阿米娅 / Amiya
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Amiya','阿米娅','中立干员','中立',5,5,5,1,'#cfd4dc','支援：使不同阵营的棋子获得+2/+2','{"mechanics":["support"],"support":{"threshold":1,"type":"different_faction_buff","attack":2,"max_hp":2,"repetitions":1},"golden_description":"支援：使不同阵营的棋子获得+2/+2，2次","golden_overrides":{"description":"支援：使不同阵营的棋子获得+2/+2，2次","support":{"threshold":1,"type":"different_faction_buff","attack":2,"max_hp":2,"repetitions":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 泥岩 / Mudrock
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Mudrock','泥岩','中立干员','中立',4,3,4,1,'#cfd4dc','招募&回营：获得1张【沃土予身】','{"mechanics":["recruit","return_camp"],"recruit":{"type":"gain_fertile_soil","count":1},"return_camp":{"type":"gain_fertile_soil","count":1},"golden_description":"招募&回营：获得2张【沃土予身】","golden_overrides":{"description":"招募&回营：获得2张【沃土予身】","recruit":{"type":"gain_fertile_soil","count":2},"return_camp":{"type":"gain_fertile_soil","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 魔王 / Civilight Eterna
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Civilight Eterna','魔王','中立干员','中立',6,6,4,1,'#cfd4dc','后勤：获得2张【过往尘埃】','{"mechanics":["logistics"],"logistics":{"type":"gain_past_dust","count":2},"golden_description":"后勤：获得4张【过往尘埃】","golden_overrides":{"description":"后勤：获得4张【过往尘埃】","logistics":{"type":"gain_past_dust","count":4}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 红豆 / Vigna
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Vigna','红豆','中立干员','中立',2,1,1,1,'#cfd4dc','上场：随机获得1张技能卡','{"mechanics":["on_deploy"],"on_deploy":{"type":"gain_random_skill_current_level","count":1},"golden_description":"上场：随机获得2张技能卡","golden_overrides":{"description":"上场：随机获得2张技能卡","on_deploy":{"type":"gain_random_skill_current_level","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 诗怀雅 / Swire
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Swire','诗怀雅','炎干员','炎',5,5,2,1,'#f2c94c','后勤：获得2枚金币','{"mechanics":["logistics"],"logistics":{"type":"gain_gold","amount":2},"golden_description":"后勤：获得4枚金币","golden_overrides":{"description":"后勤：获得4枚金币","logistics":{"type":"gain_gold","amount":4}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 陈 / Ch'en
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Ch''en','陈','炎干员','炎',5,5,7,1,'#f2c94c','横斩；化境：使所有友方棋子永久获得+1攻击力','{"mechanics":["cleave","morale","permanent"],"cleave":true,"morale":{"type":"team_attack_buff","attack":1},"golden_description":"横斩；化境：使所有友方棋子永久获得+2攻击力","golden_overrides":{"description":"横斩；化境：使所有友方棋子永久获得+2攻击力","morale":{"type":"team_attack_buff","attack":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 望 / Wang
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Wang','望','炎干员','炎',5,5,5,1,'#f2c94c','每累计消耗7枚金币，获得1张【天有四时】','{"mechanics":["cumulative"],"gold_spend":{"threshold":7,"type":"gain_four_seasons","count":1},"golden_description":"每累计消耗7枚金币，获得2张【天有四时】","golden_overrides":{"description":"每累计消耗7枚金币，获得2张【天有四时】","gold_spend":{"threshold":7,"type":"gain_four_seasons","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 烛煌 / Blaze the Igniting Spark
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Blaze the Igniting Spark','烛煌','炎干员','炎',5,5,6,1,'#f2c94c','当对方棋子攻击时，对其造成6铳弹伤害（每回合最多7次）','{"mechanics":["bullet_damage"],"opponent_attack":{"type":"bullet_damage","damage":6,"max_triggers":7},"golden_description":"当对方棋子攻击时，对其造成12铳弹伤害（每回合最多7次）","golden_overrides":{"description":"当对方棋子攻击时，对其造成12铳弹伤害（每回合最多7次）","opponent_attack":{"type":"bullet_damage","damage":12,"max_triggers":7}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;


-- 重岳 / Chongyue
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Chongyue','重岳','炎干员','炎',6,7,5,1,'#f2c94c','化境：使友方炎阵营棋子永久获得+1/+1','{"mechanics":["morale","permanent"],"morale":{"type":"faction_team_buff","faction":"炎","attack":1,"max_hp":1},"golden_description":"化境：使友方炎阵营棋子永久获得+2/+2","golden_overrides":{"description":"化境：使友方炎阵营棋子永久获得+2/+2","morale":{"type":"faction_team_buff","faction":"炎","attack":2,"max_hp":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 年 / Nian
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Nian','年','炎干员','炎',6,6,6,1,'#f2c94c','护盾；招募&后勤：获得1张【天有四时】','{"mechanics":["shield","recruit","logistics"],"shield":true,"recruit":{"type":"gain_four_seasons","count":1},"logistics":{"type":"gain_four_seasons","count":1},"golden_description":"护盾；招募&后勤：获得2张【天有四时】","golden_overrides":{"description":"护盾；招募&后勤：获得2张【天有四时】","recruit":{"type":"gain_four_seasons","count":2},"logistics":{"type":"gain_four_seasons","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 维多利亚
-- 格拉尼 / Grani
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Grani','格拉尼','维多利亚干员','维多利亚',1,2,3,1,'#5b2c83','血战：自身永久获得+1/+1','{"mechanics": ["bloodbattle", "permanent"], "bloodbattle": 1, "golden_description": "血战：自身永久获得+2/+2", "golden_overrides": {"bloodbattle": 2}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 谜图 / Puzzle
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Puzzle','谜图','维多利亚干员','维多利亚',1,1,3,1,'#5b2c83','先手：随机对1个敌人造成2铳弹伤害','{"mechanics": ["initiative", "bullet_damage"], "initiative": {"type": "random_bullet_damage", "damage": 2}, "golden_description": "先手：对随机1个敌人造成4铳弹伤害", "golden_overrides": {"description": "先手：对随机1个敌人造成4铳弹伤害", "initiative": {"type": "random_bullet_damage", "damage": 4}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 海蒂 / Heidi
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Heidi','海蒂','维多利亚干员','维多利亚',2,2,2,1,'#5b2c83','上场：选择1个友方，使其获得+2/+2并触发血战效果1次','{"mechanics": ["on_deploy"], "on_deploy": {"type": "select_buff_bloodbattle", "attack": 2, "max_hp": 2, "triggers": 1}, "golden_description": "上场：选择1个友方，使其获得+4/+4并触发2次血战效果", "golden_overrides": {"on_deploy": {"type": "select_buff_bloodbattle", "attack": 4, "max_hp": 4, "triggers": 2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 戴菲恩 / Delphine
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Delphine','戴菲恩','维多利亚干员','维多利亚',2,1,5,1,'#5b2c83','招募&售出：获得1张【挥斩敌愁】','{"mechanics": ["recruit", "sell"], "recruit": {"type": "gain_enemy_sorrow", "count": 1}, "sell": {"type": "gain_enemy_sorrow", "count": 1}, "golden_description": "招募&售出：获得2张【挥斩敌愁】", "golden_overrides": {"recruit": {"type": "gain_enemy_sorrow", "count": 2}, "sell": {"type": "gain_enemy_sorrow", "count": 2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 洛洛 / Rockrock
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Rockrock','洛洛','维多利亚干员','维多利亚',3,3,3,1,'#5b2c83','先手&血战：对最左侧的敌人造成3铳弹伤害，并自身永久获得+1/+1','{"mechanics": ["initiative", "bloodbattle", "permanent", "bullet_damage"], "initiative": {"type": "leftmost_bullet_growth", "damage": 3, "growth": 1}, "bloodbattle": {"type": "leftmost_bullet_growth", "damage": 3, "growth": 1}, "golden_description": "先手&血战：对最左侧的敌人造成4铳弹伤害，并自身永久获得+2/+2", "golden_overrides": {"initiative": {"type": "leftmost_bullet_growth", "damage": 4, "growth": 2}, "bloodbattle": {"type": "leftmost_bullet_growth", "damage": 4, "growth": 2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 琴柳 / Saileach
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Saileach','琴柳','维多利亚干员','维多利亚',3,4,2,1,'#5b2c83','上场&回营：获得1张【挥斩敌愁】','{"mechanics": ["on_deploy", "return_camp"], "on_deploy": {"type": "gain_enemy_sorrow", "count": 1}, "return_camp": {"type": "gain_enemy_sorrow", "count": 1}, "golden_description": "上场&回营：获得2张【挥斩敌愁】", "golden_overrides": {"on_deploy": {"type": "gain_enemy_sorrow", "count": 2}, "return_camp": {"type": "gain_enemy_sorrow", "count": 2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 薄绿 / Mint
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Mint','薄绿','维多利亚干员','维多利亚',3,3,2,1,'#5b2c83','后勤：使相邻的棋子获得+2/+2，并触发血战效果','{"mechanics": ["logistics"], "logistics": {"type": "adjacent_buff", "attack": 2, "max_hp": 2, "bloodbattle_triggers": 1}, "golden_description": "后勤：使相邻的棋子获得+4/+4，并触发2次血战效果", "golden_overrides": {"logistics": {"type": "adjacent_buff", "attack": 4, "max_hp": 4, "bloodbattle_triggers": 2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 哈洛德 / Harold
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Harold','哈洛德','维多利亚干员','维多利亚',3,4,3,1,'#5b2c83','光环：使所有友方棋子获得【血战：使自身获得+2/+2】','{"mechanics": ["aura"], "bloodbattle_aura": 2, "golden_description": "光环：使所有友方棋子获得【血战：使自身获得+4/+4】", "golden_overrides": {"bloodbattle_aura": 4}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 刺玫 / Vendela
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Vendela','刺玫','维多利亚干员','维多利亚',3,4,1,1,'#5b2c83','先手：将最左侧的敌方棋子变为1血','{"mechanics": ["initiative"], "initiative": {"type": "leftmost_set_hp", "count": 1}, "golden_description": "先手：将最左侧的2个敌方棋子变为1血", "golden_overrides": {"initiative": {"type": "leftmost_set_hp", "count": 2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 凯瑟琳 / Catherine
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Catherine','凯瑟琳','维多利亚干员','维多利亚',4,5,2,1,'#5b2c83','敌方棋子死亡后，获得一张其原始复制（每回合限定1次）','{"enemy_death_copy_limit": 1, "golden_description": "敌方棋子死亡后，获得一张其原始复制（每回合限定2次）", "golden_overrides": {"enemy_death_copy_limit": 2}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 风笛 / Bagpipe
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Bagpipe','风笛','维多利亚干员','维多利亚',4,6,4,1,'#5b2c83','血战：所有友方棋子永久获得+2/+2，维多利亚棋子额外获得+1/+1','{"mechanics": ["bloodbattle", "permanent"], "bloodbattle": {"type": "team_faction_growth", "amount": 2, "faction": "维多利亚", "extra": 1}, "golden_description": "血战：所有友方棋子永久获得+4/+4，维多利亚棋子额外获得+2/+2", "golden_overrides": {"bloodbattle": {"type": "team_faction_growth", "amount": 4, "faction": "维多利亚", "extra": 2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 焰影苇草 / Reed the Flame Shadow
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Reed the Flame Shadow','焰影苇草','维多利亚干员','维多利亚',4,5,3,1,'#5b2c83','先手：使相邻的棋子永久获得+2/+2，并触发血战效果','{"mechanics": ["initiative", "permanent"], "initiative": {"type": "adjacent_bloodbattle", "amount": 2, "triggers": 1}, "golden_description": "先手：使相邻的棋子永久获得+4/+4，并触发血战效果2次", "golden_overrides": {"initiative": {"type": "adjacent_bloodbattle", "amount": 4, "triggers": 2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 夜魔 / Nightmare
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Nightmare','夜魔','维多利亚干员','维多利亚',5,5,5,1,'#5b2c83','敌方棋子死亡时：使所有友方棋子永久获得+2/+2，并触发血战效果（每回合限定2次）','{"mechanics": ["permanent"], "enemy_death_growth": {"amount": 2, "limit": 2}, "golden_description": "敌方棋子死亡时：使所有友方棋子永久获得+4/+4，并触发血战效果（每回合限定4次）", "golden_overrides": {"enemy_death_growth": {"amount": 4, "limit": 4}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 号角 / Horn
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Horn','号角','维多利亚干员','维多利亚',5,4,6,1,'#5b2c83','血战：使所有友方棋子永久获得+1/+1，并对最左侧的敌人造成X铳弹伤害（随商店等级提升）','{"mechanics": ["bloodbattle", "permanent", "bullet_damage"], "bloodbattle": {"type": "team_growth_shop_bullet", "amount": 1, "multiplier": 1}, "golden_description": "血战：使所有友方棋子永久获得+2/+2，并对最左侧的敌人造成2X铳弹伤害（随商店等级提升）", "golden_overrides": {"bloodbattle": {"type": "team_growth_shop_bullet", "amount": 2, "multiplier": 2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 白铁 / Stainless
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Stainless','白铁','维多利亚干员','维多利亚',5,4,5,1,'#5b2c83','后勤&血战：获得1枚金币','{"mechanics": ["logistics", "bloodbattle"], "logistics": {"type": "gain_gold", "amount": 1}, "bloodbattle": {"type": "gain_gold", "amount": 1}, "golden_description": "后勤&血战：获得2枚金币", "golden_overrides": {"logistics": {"type": "gain_gold", "amount": 2}, "bloodbattle": {"type": "gain_gold", "amount": 2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 维娜·维多利亚 / Vina Victoria
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Vina Victoria','维娜·维多利亚','维多利亚干员','维多利亚',5,5,5,1,'#5b2c83','护盾；血战：获得护盾和永久获得+2/+2，若已有护盾则额外永久获得+5/+5','{"mechanics": ["shield", "bloodbattle", "permanent"], "shield": true, "bloodbattle": {"type": "shield_growth", "amount": 2, "extra": 5}, "golden_description": "护盾；血战：获得护盾和永久获得+4/+4，若已有护盾则额外永久获得+10/+10", "golden_overrides": {"bloodbattle": {"type": "shield_growth", "amount": 4, "extra": 10}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 澄闪 / Goldenglow
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Goldenglow','澄闪','维多利亚干员','维多利亚',6,7,7,1,'#5b2c83','先手：对最左侧的敌人造成等同于攻击力的铳弹伤害','{"mechanics":["initiative","bullet_damage"],"initiative":{"type":"leftmost_attack_bullet","multiplier":1},"golden_description":"先手：对最左侧的敌人造成等同于2倍攻击力的铳弹伤害","golden_overrides":{"initiative":{"type":"leftmost_attack_bullet","multiplier":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 酒神 / Victoria_Jiushen
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Victoria_Jiushen','酒神','维多利亚干员','维多利亚',6,4,4,1,'#5b2c83','遗计：使所有友方棋子永久获得+4/+4，并触发血战效果','{"mechanics":["legacy","permanent"],"legacy":{"type":"team_permanent_bloodbattle","amount":4,"triggers":1},"golden_description":"遗计：使所有友方棋子永久获得+8/+8，并触发2次血战效果","golden_overrides":{"legacy":{"type":"team_permanent_bloodbattle","amount":8,"triggers":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 阿戈尔

-- 深巡 / Underflow
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Underflow','深巡','阿戈尔干员','阿戈尔',3,3,3,1,'#153c72','锁血；上场：选择1个阿戈尔阵营棋子，使其获得+3/+3和锁血','{"mechanics":["lock_hp","on_deploy"],"lock_hp":true,"on_deploy":{"type":"select_buff_lock_hp","faction":"阿戈尔","attack":3,"max_hp":3},"golden_description":"锁血；上场：选择1个阿戈尔阵营棋子，使其获得+6/+6和锁血","golden_overrides":{"on_deploy":{"type":"select_buff_lock_hp","faction":"阿戈尔","attack":6,"max_hp":6}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 海霓 / Lucilla
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Lucilla','海霓','阿戈尔干员','阿戈尔',3,3,4,1,'#153c72','战斗中，友方棋子召唤海怪时，使其获得+4/+4','{"mechanics":[],"sea_summon_buff":4,"golden_description":"战斗中，友方棋子召唤海怪时，使其获得+8/+8","golden_overrides":{"sea_summon_buff":8}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 深海色 / Deepcolor
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Deepcolor','深海色','阿戈尔干员','阿戈尔',1,2,1,1,'#153c72','遗计：召唤2只底海滑动者','{"mechanics":["legacy"],"legacy":{"type":"summon","summon_id":"Deep Sea Slider","count":2},"golden_description":"遗计：召唤4只底海滑动者","golden_overrides":{"legacy":{"type":"summon","summon_id":"Deep Sea Slider","count":4}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 安哲拉 / Andreana
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Andreana','安哲拉','阿戈尔干员','阿戈尔',3,3,4,1,'#153c72','遗计：随机召唤2只海怪','{"mechanics":["legacy"],"legacy":{"type":"summon_random_sea_monsters","count":2},"golden_description":"遗计：随机召唤4只海怪","golden_overrides":{"legacy":{"type":"summon_random_sea_monsters","count":4}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 幽灵鲨 / Specter
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Specter','幽灵鲨','阿戈尔干员','阿戈尔',1,2,2,1,'#153c72','嘲讽；锁血','{"mechanics":["guard","lock_hp"],"guard":true,"lock_hp":true,"golden_description":"嘲讽；锁血","golden_overrides":{}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 歌蕾蒂娅 / Gladiia
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Gladiia','歌蕾蒂娅','阿戈尔干员','阿戈尔',4,4,5,1,'#153c72','战斗中，友方召唤阿戈尔阵营棋子时，使其获得歌蕾蒂娅的一半攻击力','{"mechanics":[],"aegir_summon_attack_ratio":0.5,"golden_description":"战斗中，友方召唤阿戈尔阵营棋子时，使其获得歌蕾蒂娅的1倍攻击力","golden_overrides":{"aegir_summon_attack_ratio":1}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 斯卡蒂 / Skadi
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Skadi','斯卡蒂','阿戈尔干员','阿戈尔',4,1,4,1,'#153c72','复活；遗计：永久使本场游戏的阿戈尔阵营棋子获得+1攻击力','{"mechanics":["revive","legacy","permanent"],"revive":true,"legacy":{"type":"aegir_game_attack","amount":1},"golden_description":"复活；遗计：永久使本场游戏的阿戈尔阵营棋子获得+2攻击力","golden_overrides":{"legacy":{"type":"aegir_game_attack","amount":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 乌尔比安 / Ulpianus
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Ulpianus','乌尔比安','阿戈尔干员','阿戈尔',6,6,6,1,'#153c72','遗计：随机召唤2个阿戈尔阵营棋子，并使其获得+3/+3','{"mechanics":["legacy"],"legacy":{"type":"summon_random_aegir","count":2,"amount":3},"golden_description":"遗计：随机召唤4个阿戈尔阵营棋子，并使其获得+6/+6","golden_overrides":{"legacy":{"type":"summon_random_aegir","count":4,"amount":6}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 浊心斯卡蒂 / Skadi the Corrupting Heart
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Skadi the Corrupting Heart','浊心斯卡蒂','阿戈尔干员','阿戈尔',6,9,6,1,'#153c72','锁血；战斗中，友方召唤阿戈尔阵营棋子时，使其获得+8/+8和锁血','{"mechanics":["lock_hp"],"lock_hp":true,"aegir_summon_lock_buff":8,"golden_description":"锁血；战斗中，友方召唤阿戈尔阵营棋子时，使其获得+16/+16和锁血","golden_overrides":{"aegir_summon_lock_buff":16}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 归溟幽灵鲨 / Specter the Unchained
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Specter the Unchained','归溟幽灵鲨','阿戈尔干员','阿戈尔',5,5,5,1,'#153c72','遗计：召唤3只具有嘲讽的始海穿刺者','{"mechanics":["legacy"],"legacy":{"type":"summon","summon_id":"Primal Sea Piercer","count":3},"golden_description":"遗计：召唤6只具有嘲讽的始海穿刺者","golden_overrides":{"legacy":{"type":"summon","summon_id":"Primal Sea Piercer","count":6}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 棘刺 / Thorns
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Thorns','棘刺','阿戈尔干员','阿戈尔',4,4,2,1,'#153c72','鸩毒；先手：召唤1只具有鸩毒的囊海爬行者','{"mechanics":["venom","initiative"],"venom":true,"initiative":{"type":"summon","summon_id":"Pocket Sea Crawler","count":1},"golden_description":"鸩毒；先手：召唤2只具有鸩毒的囊海爬行者","golden_overrides":{"initiative":{"type":"summon","summon_id":"Pocket Sea Crawler","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 引星棘刺 / Thorns the Lodestar
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Thorns the Lodestar','引星棘刺','阿戈尔干员','阿戈尔',5,8,4,1,'#153c72','友方召唤阿戈尔阵营棋子时，永久使本场游戏中的阿戈尔阵营棋子获得+1攻击力','{"mechanics":["permanent"],"aegir_summon_game_attack":1,"golden_description":"友方召唤阿戈尔阵营棋子时，永久使本场游戏中的阿戈尔阵营棋子获得+2攻击力","golden_overrides":{"aegir_summon_game_attack":2}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 流明 / Lumen
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Lumen','流明','阿戈尔干员','阿戈尔',5,6,3,1,'#153c72','死仇(1)：使自身及相邻的友方棋子永久获得+2/+2','{"mechanics":["death_feud","permanent"],"death_feud":{"type":"adjacent_permanent_buff","threshold":1,"amount":2},"golden_description":"死仇(1)：使自身及相邻的友方棋子永久获得+4/+4","golden_overrides":{"death_feud":{"type":"adjacent_permanent_buff","threshold":1,"amount":4}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 海沫 / Highmore
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Highmore','海沫','阿戈尔干员','阿戈尔',2,3,2,1,'#153c72','嘲讽；遗计：召唤1只具有连击的钵海收割者','{"mechanics":["guard","legacy"],"guard":true,"legacy":{"type":"summon","summon_id":"Basin Sea Reaper","count":1},"golden_description":"嘲讽；遗计：召唤2只具有连击的钵海收割者","golden_overrides":{"legacy":{"type":"summon","summon_id":"Basin Sea Reaper","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 絮雨 / Whisperain
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Whisperain','絮雨','阿戈尔干员','阿戈尔',2,3,1,1,'#153c72','上场：获得1张【生命塔台】','{"mechanics":["on_deploy"],"on_deploy":{"type":"gain_life_tower","count":1},"golden_description":"上场：获得2张【生命塔台】","golden_overrides":{"on_deploy":{"type":"gain_life_tower","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 格劳克斯 / Glaucus
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Glaucus','格劳克斯','阿戈尔干员','阿戈尔',2,2,2,1,'#153c72','上场：获得1张1/1的底海滑动者','{"mechanics":["on_deploy"],"on_deploy":{"type":"gain_card","card_id":"Deep Sea Slider","count":1},"golden_description":"上场：获得2张1/1的底海滑动者","golden_overrides":{"on_deploy":{"type":"gain_card","card_id":"Deep Sea Slider","count":2}}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 底海滑动者 / Deep Sea Slider（召唤专属）
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Deep Sea Slider','底海滑动者','海怪','阿戈尔',1,1,1,1,'#153c72','','{"summon_only": true, "sea_monster": true, "mechanics": [], "golden_description": "", "golden_overrides": {}}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 钵海收割者 / Basin Sea Reaper（召唤专属）
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Basin Sea Reaper','钵海收割者','海怪','阿戈尔',1,4,4,1,'#153c72','连击','{"summon_only": true, "sea_monster": true, "mechanics": ["combo"], "golden_description": "连击", "golden_overrides": {}, "combo": true}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 囊海爬行者 / Pocket Sea Crawler（召唤专属）
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Pocket Sea Crawler','囊海爬行者','海怪','阿戈尔',1,1,1,1,'#153c72','鸩毒','{"summon_only": true, "sea_monster": true, "mechanics": ["venom"], "golden_description": "鸩毒", "golden_overrides": {}, "venom": true}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;

-- 始海穿刺者 / Primal Sea Piercer（召唤专属）
INSERT INTO unit_cards
    (id,name,role,faction,tier,max_hp,attack,attack_range,color,description,extras_json)
VALUES ('Primal Sea Piercer','始海穿刺者','海怪','阿戈尔',1,5,5,1,'#153c72','嘲讽','{"summon_only": true, "sea_monster": true, "mechanics": ["guard"], "golden_description": "嘲讽", "golden_overrides": {}, "guard": true}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, role=excluded.role, faction=excluded.faction,
    tier=excluded.tier, max_hp=excluded.max_hp, attack=excluded.attack,
    attack_range=excluded.attack_range, color=excluded.color,
    description=excluded.description, extras_json=excluded.extras_json;
