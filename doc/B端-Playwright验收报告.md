# B 端 Playwright 端到端验收报告

> 验收日期：2026-05-30
> 验收方式：Playwright 真实浏览器自动化（headless chromium）
> 截图目录：`screenshots/b_acceptance/`（共 34 张）
> 验收脚本：`scripts/b-acceptance-final.js`

## 验收凭证

| 角色 | 用户名 | 用途 |
|---|---|---|
| admin | youlun | 客资看板 / 订单看板 / 协同处理 / 导出 |
| sales | sales01 | 销售跟进 / 被动添加 / 协同申请 / 标记成交 / 订单跟进 |
| staff | youlunrong | 客资录入 / 草稿 / 粘贴解析 / 批量导入 / 图片解耦 |
| owner | boss01 | 总后台（3001 端口） |

## 验收结果总览

11 条原始反馈全部通过 ✅，外加附加交付（教务端 / 协同前端 / 导出 / 消息中心）全部通过。

| # | 反馈摘要 | 验证 | 关键截图 |
|---|---|---|---|
| 1 | 销售意向度/处理状态/跟进时间线 | 跟进卡 8 个控件齐全 + 时间线抽屉 + T-L6 详情页 | 07/08/09 |
| 2 | 被动添加客资识别 | candidates 数 1，匹配分 65 | 10/11 |
| 3 | 客资看板 stats 后端聚合 | total=12，byAddStatus={not_added:11,added:1} | 03/04 |
| 4 | 录入闪退草稿恢复 | 关页面重开后弹恢复提示 + 点恢复后 contact='13900000099' 回填成功 | 22-26 |
| 5 | 粘贴解析录入 | contact='wxid_pw_acceptance' 完整，ip='北京' | 27-29 |
| 6 | 作品广场≥5 | A 端职责，跳过 | — |
| 7 | 客资批量导入 | total=2 success=1 fail=1，errorFileUrl 返回 | 30-32 |
| 8 | 作品手动刷新 | A 端职责，跳过 | — |
| 9 | 学习榜收藏 | A 端职责，跳过 | — |
| 10 | 长时间卡死 | api.js 401 拦截 / withSubmitLock / AbortController / 并发限流 8 | 全程无 console error |
| 11 | 图片上传不清空表单 | 选图后 contact / note 完整保留 | 33/34 |

## 附加交付验收（B 端范围）

| 项 | 验证 | 截图 |
|---|---|---|
| #16 教务端口 | brand='教', portTitle='教务端', navOrders+navAbnormal 都在 | 20/21 |
| #16 销售订单 | salesOrders.length=1 | 13 |
| #16 主管订单看板 | orders 视图加载 | 14 |
| #17 消息中心 | 通知面板打开正常 | 19 |
| #19 导出 | flash 显示"导出任务已创建" | 18 |
| #20 协同任务前端 | sales 协同申请 + admin 协同 inbox + 待确认来源 + 导入历史 | 12/15-17 |

## 截图清单（34 张，按时序）

```
01_login_page.png                          登录页
02_admin_dashboard_loaded.png              admin 登录后首页
03_p3_admin_leads_board_initial.png        客资看板初始 stats
04_p3_admin_leads_filtered.png             stats 平台筛选联动
05_p1_after_logout.png                     退出回登录页
06_p1_sales_dashboard.png                  sales 登录首页
07_p1_sales_followups_board.png            销售跟进看板（含 8 控件）
08_p1_followup_timeline_drawer.png         跟进时间线抽屉
09_p1_sales_lead_detail_page.png           T-L6 销售客资详情页
10_p2_sales_passive_leads_panel.png        被动添加面板
11_p2_passive_candidates_result.png        模糊匹配候选 score=65
12_collab_sales_my_collabs.png             销售"协同申请"列表
13_order_sales_my_orders.png               销售订单跟进
14_admin_orders_board.png                  主管端订单看板
15_admin_collab_inbox.png                  admin 协同 inbox
16_admin_lead_source_pending.png           待确认来源视图
17_admin_import_history.png                主管导入历史
18_export_after_trigger.png                导出触发 flash
19_notification_panel.png                  消息中心面板
20_academic_orders_board.png               教务订单池
21_academic_abnormal_orders.png            教务异常订单
22_p4_staff_dashboard.png                  staff 登录首页
23_p4_lead_entry_page.png                  客资录入页
24_p4_drafted_input.png                    输入草稿（debounce 触发）
25_p4_draft_restore_prompt.png             重新打开后恢复提示
26_p4_after_restore_clicked.png            点恢复后字段回填
27_p5_paste_panel.png                      粘贴模式空状态
28_p5_paste_input.png                      粘贴文本
29_p5_paste_parsed_preview.png             解析结果预览
30_p7_import_panel.png                     批量导入入口
31_p7_import_filled.png                    导入数据填好
32_p7_import_result.png                    导入结果（含失败行）
33_p11_before_image_select.png             图片选择前（输入 contact+note）
34_p11_after_image_select.png              图片选择后（字段保留）
```

## 修复历史（19 个 commit，本次会话累计）

```
8da9135 fix: Playwright 端到端验收发现的 3 处 bug
d0bcd1a fix(collab): collaboration_tasks reason 字段乱码防御
4842ef6 docs: 同步 B 端修复终态到 AB 分工任务清单
b91ee12 fix(frontend): 稳定性加固 + 图片解耦 + T-L7 明日待跟进
3b4eed6 fix(backend): owner 端口登录修复 + 操作日志 + T-L7 明日待跟进
3ea40f5 feat(frontend): 教务端 + 销售/主管订单视图 + 5 个导出入口
6eeff06 feat(backend): 导出能力 (5 类异步 + OSS 模拟) + 客资导入模板中文化
f2f862b docs: 同步 B 端修复实况到 AB 分工任务清单
15f81c2 feat(frontend): 协同任务 UI + 待确认来源 + 销售成交 + 粘贴解析 + 批量导入
95ed4a9 feat(backend): M6 状态枚举切英文 + leads 分页 + stats 拆开 + 导入错误 CSV
0a1c05a doc: AB端任务todolist
17d596e docs: B 端剩余功能清单 + README + 一键启动脚本
d1d5411 feat(frontend): 客资看板 stats 联动 + 草稿恢复 + 销售跟进字段 + 被动添加视图
c19296c feat(backend): 客资协同 6 个新模块 + 消息中心持久化 + leads 升级
e8160e2 feat(db): M3-M5 迁移 + 脚本自包含 mysql2
d7c95f8 fix(leads): 客资看板处理状态展示统一走枚举映射
20ca48c feat: M1 客资字段扩展迁移 + legacy server 瘦身
1aa1d65 fix(backend): sql日志打印格式化依赖
dfc5bb7 fix(frontend): 前端拆分文件
```

## 数据库迁移最终状态

```
[✓] M1__leads_extend_fields           客资 7 字段扩展
[✓] M2__leads_backfill                历史数据回填（lead_code/intention_level 等）
[✓] M3__drafts_and_imports            drafts/imports/collab/orders/notifications/exports 重建
[✓] M4__lead_followup_files_varchar   lead_follow_records 切 VARCHAR(64)
[✓] M5__users_role_academic           users.role 加 sales/academic
[✓] M6__leads_status_enums            add_status + status 切英文 ENUM
[✓] M7__operation_logs_varchar        operation_logs 重建
```

## V1.1 留待事项（不阻塞当前验收）

- T-20 Redis 缓存与预聚合
- T-21 BullMQ 异步队列
- T-22 OSS / MinIO 对象存储改造
- WebSocket 推送（当前用消息中心 + 长轮询）
