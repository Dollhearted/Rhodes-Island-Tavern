# 酒馆自走棋（经典横向模式）

运行 `python server.py`，再打开 `http://127.0.0.1:11451`。

## 规则

- 双方各使用一张 `1 × 7` 横向棋盘；棋子仅能部署到自己的棋盘。
- 备战区有 12 格，棋子卡和技能卡共用格位。
- 先比较双方上场棋子的数量，数量更多者先手；数量相同时再比较最左侧非空棋子的攻击力；两项均相同时随机决定先手。
- 战斗中双方轮流行动，轮到的一方从己方棋盘由左至右寻找下一个存活棋子；攻击目标从敌方存活棋子中随机选择。
- 实际伤害直接等于攻击力，受击棋子执行“剩余血量 − 攻击力”；血量小于等于 0 时立刻从棋盘移除。每场战斗开始时，所有上场棋子恢复为初始血量。
- ??????? 50?????? 3?????????????????????????????? +1??????? 1 ???????? AI ?????????????? 1?9 ??????? 15 ??? 10 ????????
- 技能卡在备战区中选中，点击己方棋子使用。目前提供攻击与初始血量增益。
- ???????????? 3 ??????????????????????????????????????????????????????????????????????????????????
- 技能卡不会出现在商店，且后端拒绝购买技能卡；当前仅为后续“特定棋子产出技能卡”机制保留使用入口。

## 单人出怪与阶段

- 每轮备战倒计时结束后自动进入战斗；第 1–3 轮各 30 秒，第 4–5 轮各 45 秒，第 6–7 轮各 60 秒，第 8–14 轮各 90 秒。界面持续显示“第 N/14 轮”。
- 仅限单人模式：备战期间会预览下一轮 AI 的完整棋盘，包括具体棋子、星级、攻击和初始血量；该阵容在本轮战斗前保持不变。
- 第 1–2 轮 AI 上场 1 张，第 3 轮 2 张，第 4 轮 4 张，第 5 轮 6 张，第 6–14 轮均为 7 张。
- AI 单卡的攻击与初始血量之和按轮次依次约为：`5, 8, 8, 10, 15, 30, 50, 100, 200, 400, 800, 1600, 2000, 3000`。第 5 轮起攻击/血量会保持在合理区间，避免极端配比。
- 每张 AI 卡均从独立卡池随机选择；第1回合仅选取1星棋子；此后最高星级不超过“玩家当前商店等级 + 1”。商店刷新、购买和棋盘/备战区操作不会干扰 AI 的随机选取；本轮预览生成后保持锁定。第 14 轮结算后单人模式结束。

## 数据库

- `schema.sql` 是棋子配置的唯一数据源，使用 UTF-8 保存中文名、阵营、星级、攻击、血量、普通/金卡描述与机制 JSON。
- `server.py` 启动时执行 `schema.sql`，将棋子配置同步至 `data/autochess.sqlite` 的 `unit_cards` 表。
- `players` 表继续保存本地玩家的金币、生命、回合、商店等级与升级减免。
- 修改棋子时编辑 `schema.sql` 并重启服务即可，不再需要修改 `server.py` 中的棋子常量。

核心服务逻辑位于 `server.py`：`buy_card()`、`first_striker()`、`tavern_battle()` 和 `enemy_board()`。数据库结构见 `schema.sql`。

## 部署：保护服务器存档

`data/autochess.sqlite` 是**运行时数据**，里面存着服务器上所有玩家的金币、生命、回合与商店等级。它已在 `.gitignore` 中整目录忽略（`data/`），且从未被 git 跟踪，因此：

- `git pull` 只更新被跟踪的源码文件，**不会删除也不会覆盖**服务器上的存档；
- 首次部署时 `server.py` 会自动 `mkdir data/` 并用 `schema.sql` 建库，所以仓库里不需要预置空存档；
- 请**不要**用 `git add -f` 强行提交 `data/` 下的任何文件，那会让本地存档在服务器上覆盖线上存档。

备份线上存档时直接复制该文件即可（SQLite 单文件）：

```bash
cp data/autochess.sqlite data/autochess.sqlite.bak.$(date +%F)
```

`.gitignore` 同时忽略了 `*.sqlite` / `*.db` / `*.sqlite-*` / `*.db-*` / `saves/` 等模式，
所以即使把存档或备份放到 `data/` 以外的位置，也仍然不会被误提交。
部署前可用 `git add -A --dry-run` 确认待暂存清单里没有存档。

## 界面与立绘

- 界面采用移植适配后的 Stronghold-Protocol 视觉体系：近黑绿灰底、薄荷绿交互色、金色经济提示、括角按钮、雷达扫描与点阵徽记；保留本游戏的阵营配色、星级和机制图标。桌面宽屏使用左侧敌我棋盘、右侧商店、底部备战区布局。
- 每张棋子卡的卡面即该干员的立绘，取自 `assets/精二立绘/`（`_manifest.json` 为素材清单）。立绘映射表是 `index.html` 中的 `const ART={...}`，键为 `unit_cards.id`，覆盖当前全部棋子。
- 卡面结构：立绘 + 左上阵营标签 + 右上六边形星级标 + 等宽 `ATK / HP` 数据条 + 中文名牌与生命条；金卡为暖金描边，技能卡不配立绘，走几何切分版式。
- 稀有度统一按星级取色：I 灰、II 蓝、III 紫、IV 金、V 橙、VI 红，同时用于卡框、左侧色条与准星。
- 皮肤源文件与注入/检查脚本存放在 `.workbuddy/tmp/`，改皮肤的流程见 `.workbuddy/tmp/README.md`。


## Stronghold-Protocol 界面代码移植

2026-10-08：`index.html` 的新增界面代码直接移植并适配自 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol)，上游版本 `c2a2ef778cf728ff29b953b9842b2a39b1e9cbea`。

Copyright (C) 2026 Stronghold-Protocol contributors. GPL-3.0-or-later. 许可证全文：[docs/stronghold-LICENSE.txt](docs/stronghold-LICENSE.txt)。移植范围为 `public/css/theme.css` 的设计变量及括角框、`public/css/components.css` 的按钮、`public/css/screens/title.css` 的雷达与首页视觉、`public/js/screens/title.js` 的点阵徽记。修改包括像素尺寸适配、现有酒馆 DOM 与交互绑定、响应式商店/备战区、头像结算页面。

移植代码及其修改遵循 GPL-3.0-or-later；分发包含该代码的衍生前端时应保留署名与许可证并提供对应源码。本次没有引入上游 Release 的图片、模型、音乐或字体；原有明日方舟素材仍归各自权利人，不适用代码许可证。


## 背景音乐

菜单（开始、图鉴、玩法说明）使用 Stronghold-Protocol `tools/assets/plan.mjs` 的 `lobby` 配置：`sys.ON_ACTIVITY_LOADED.act2autochess`，官方音频表别名指向 `act1autochess`；先播放 `m_sys_act1autochess_intro`，随后循环 `m_sys_act1autochess_loop`。教程、备战、战斗及结算共用其默认 `prep/combat` 曲目 `m_bat_act1autochess_loop`。

文件位于 `assets/audio/`，沿用上游下载脚本的资源来源：
`https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/voice/assets/dyn/audio/sound_beta_2/music/act1autochess/`。
音频版权归明日方舟原权利人所有，不属于 GPL 代码授权范围，仅作本同人游戏的非商业使用。来源配置：https://github.com/sganggs/Stronghold-Protocol/blob/master/tools/assets/plan.mjs 。

受浏览器自动播放规则限制，首次点击或按键后才播放；音乐按钮和音量滑块可随时控制（包括教程中），设置保存在浏览器本地。页面隐藏时暂停，同组场景切换不重播，不同组淡入淡出。
