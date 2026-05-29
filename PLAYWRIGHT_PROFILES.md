# Playwright Profiles 数据说明

## 目录概述

`.playwright-profiles/` 是 Playwright 浏览器自动化使用的持久化用户数据目录，用于在爬取小红书和抖音平台数据时保持登录状态。代码入口为 `metricsFetcher.js` 第 6 行：

```js
const PROFILE_ROOT = path.join(__dirname, ".playwright-profiles");
```

## 目录结构

```
.playwright-profiles/
├── douyin/                  # 抖音浏览器 Profile
│   └── Default/
│       ├── Cookies          # 登录 Cookie（保持抖音登录态）
│       ├── Local Storage/   # 本地存储（登录 token 等）
│       ├── IndexedDB/       # 抖音站点的 IndexedDB 数据
│       ├── Session Storage/ # 会话级存储
│       ├── Preferences      # 浏览器偏好设置
│       ├── Cache/Cache_Data/  ⛔ 可删除 — HTTP 缓存
│       ├── Code Cache/        ⛔ 可删除 — JS/WASM 编译缓存
│       ├── GPUCache/          ⛔ 可删除 — GPU 着色器缓存
│       ├── DawnGraphiteCache/ ⛔ 可删除 — 渲染缓存
│       └── DawnWebGPUCache/  ⛔ 可删除 — WebGPU 缓存
│
└── xiaohongshu/             # 小红书浏览器 Profile
│   ├── Local State          # 浏览器全局状态
│   ├── Last Version         # 版本标记
│   └── Default/
│       ├── Cookies          # 登录 Cookie（保持小红书登录态）
│       ├── Local Storage/   # 本地存储（登录 token 等）
│       ├── IndexedDB/       # 小红书站点的 IndexedDB 数据
│       ├── Session Storage/ # 会话级存储
│       ├── Preferences      # 浏览器偏好设置
│       ├── History          # 浏览历史
│       ├── Login Data       # 保存的登录凭据
│       ├── Favicons         # 网站图标缓存
│       ├── Web Data         # 自动填充等数据
│       ├── Cache/Cache_Data/  ⛔ 可删除 — HTTP 缓存
│       ├── Code Cache/        ⛔ 可删除 — JS/WASM 编译缓存
│       ├── GPUCache/          ⛔ 可删除 — GPU 着色器缓存
│       ├── DawnGraphiteCache/ ⛔ 可删除 — 渲染缓存
│       ├── DawnWebGPUCache/  ⛔ 可删除 — WebGPU 缓存
│       ├── Service Worker/    ⛔ 可删除 — Service Worker 缓存
│       ├── AutofillAiModelCache/ ⛔ 可删除
│       ├── AutofillStrikeDatabase/ ⛔ 可删除
│       ├── BudgetDatabase/       ⛔ 可删除
│       ├── ClientCertificates/   ⛔ 可删除
│       ├── Extension Rules/      ⛔ 可删除
│       ├── Extension Scripts/    ⛔ 可删除
│       ├── Extension State/      ⛔ 可删除
│       ├── Feature Engagement Tracker/ ⛔ 可删除
│       ├── File System/          ⛔ 可删除
│       ├── GCM Store/            ⛔ 可删除
│       ├── PersistentOriginTrials/ ⛔ 可删除
│       ├── Segmentation Platform/ ⛔ 可删除
│       ├── Shared Dictionary/    ⛔ 可删除
│       ├── Site Characteristics Database/ ⛔ 可删除
│       ├── Sync Data/            ⛔ 可删除
│       ├── WebStorage/           ⛔ 可删除
│       ├── shared_proto_db/      ⛔ 可删除
│       └── 各种 .db/.bf 文件     ⛔ 可删除
│   ├── GrShaderCache/           ⛔ 可删除 — 着色器缓存
│   ├── GraphiteDawnCache/       ⛔ 可删除 — 渲染缓存
│   ├── ShaderCache/             ⛔ 可删除 — 着色器缓存
│   ├── component_crx_cache/     ⛔ 可删除 — 扩展缓存
│   ├── extensions_crx_cache/    ⛔ 可删除 — 扩展缓存
│   └── segmentation_platform/   ⛔ 可删除
```

## 功能性数据（必须保留）

以下数据维持平台的登录状态和会话信息，删除后需重新手动登录：

| 数据 | 作用 | 大小 |
|------|------|------|
| `Cookies` + `Cookies-journal` | 存储登录 Cookie，保持抖音/小红书登录态 | ~56KB |
| `Local Storage/leveldb/` | 存储 localStorage 数据（含登录 token、用户信息） | ~149KB |
| `IndexedDB/` | 平台站点的结构化数据 | ~24KB |
| `Session Storage/` | 会话级临时数据 | ~44KB |
| `Preferences` / `Secure Preferences` | 浏览器配置偏好 | ~数KB |
| `Local State` | 浏览器全局状态（全局配置） | ~数KB |
| `Network Persistent State` | 网络连接状态 | ~数KB |

**功能性数据总量约 300KB**，删除后会丢失登录态，需要重新使用 `openLoginBrowser()` 手动登录。

## 可安全删除的数据（缓存类）

以下数据均为 Chromium 自动生成的缓存，会在下次运行时自动重建，删除不影响功能：

| 缓存类型 | 作用 | 大小 | 文件数 |
|----------|------|------|--------|
| `Cache/Cache_Data/` | HTTP 资源缓存（图片、CSS、JS 等） | ~169MB | 4343 |
| `Code Cache/js/` + `Code Cache/wasm/` | V8 编译后的 JS/WASM 字节码缓存 | ~141MB | 1191 |
| `GPUCache/` | GPU 着色器编译缓存 | ~2.1MB | ~20 |
| `DawnGraphiteCache/` / `DawnWebGPUCache/` | Dawn 渲染引擎缓存 | ~1.6MB | ~20 |
| `GrShaderCache/` / `GraphiteDawnCache/` / `ShaderCache/` | 着色器缓存（小红书 profile） | ~7MB | ~22 |
| `Service Worker/` | Service Worker 脚本和数据缓存 | ~数KB | ~10 |
| 其他 .db / .bf 等杂项 | 各种 Chromium 内部数据库 | ~数MB | ~数十 |

**缓存数据总量约 320MB**，删除后节省大量空间，且下次爬取时自动重建。

## 注意事项

1. **不要删除整个 `.playwright-profiles/` 目录** — 会导致登录态丢失，需要重新手动登录平台
2. **建议在 `.gitignore` 中添加** `.playwright-profiles/` — 该目录不应提交到 Git（含敏感登录凭据）
3. **定期清理缓存** — 可定期删除 Cache/Code Cache/GPU Cache 等目录释放磁盘空间，功能性数据不受影响
4. **部署时排除** — `deploy/package-code-only.sh` 应排除此目录（运行环境需独立登录）