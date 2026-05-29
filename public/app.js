const state = {
  token: localStorage.getItem("lan_system_token") || "",
  user: null,
  currentView: "dashboard",
  dashboardDate: new Date().toLocaleDateString("en-CA"),
  dashboardMonth: new Date().toLocaleDateString("en-CA").slice(0, 7),
  dashboardWeek: getCurrentWeekString(),
  dashboardMode: "day",
  dashboardEmployeeSort: "leads",
  rankingsDate: new Date().toLocaleDateString("en-CA"),
  rankingsMonth: new Date().toLocaleDateString("en-CA").slice(0, 7),
  rankingsWeek: getCurrentWeekString(),
  rankingsType: "leads",
  rankingsMode: "day",
  analyticsDate: new Date().toLocaleDateString("en-CA"),
  analyticsMonth: new Date().toLocaleDateString("en-CA").slice(0, 7),
  analyticsWeek: getCurrentWeekString(),
  analyticsMode: "day",
  accountVizMonth: new Date().toLocaleDateString("en-CA").slice(0, 7),
  accountVizEmployeeFilter: "",
  accountVizPlatformFilter: "",
  accountVizComparePlatformFilter: "",
  accountVizSelectedAccountId: "",
  personalBoardEmployeeId: "",
  personalBoardMonth: new Date().toLocaleDateString("en-CA").slice(0, 7),
  personalBoardPlatform: "小红书",
  personalBoardAccountFilter: "",
  postMonitorDate: new Date().toLocaleDateString("en-CA"),
  postMonitorMonth: new Date().toLocaleDateString("en-CA").slice(0, 7),
  postMonitorWeek: getCurrentWeekString(),
  postMonitorMode: "day",
  postMonitorSort: "time",
  leadMonitorDate: new Date().toLocaleDateString("en-CA"),
  leadMonitorWeek: getCurrentWeekString(),
  leadMonitorMode: "day",
  staffGalleryDate: new Date().toLocaleDateString("en-CA"),
  staffGalleryMonth: new Date().toLocaleDateString("en-CA").slice(0, 7),
  staffGalleryWeek: getCurrentWeekString(),
  staffGalleryMode: "week",
  staffGalleryScope: "all",
  staffGalleryPlatformFilter: "",
  staffGalleryTypeFilter: "",
  staffGalleryEmployeeFilter: "",
  staffRankingsDate: new Date().toLocaleDateString("en-CA"),
  staffRankingsMonth: new Date().toLocaleDateString("en-CA").slice(0, 7),
  staffRankingsWeek: getCurrentWeekString(),
  staffRankingsMode: "week",
  staffRankingsType: "leads",
  staffRankingsAccountFilter: "",
  staffRankingsLeadFilter: "",
  staffRankingsPostSort: "time",
  rollbackSnapshotDate: getYesterdayDateString(),
  staffPostsDate: "",
  staffPostsAccountFilter: "",
  staffPostsTypeFilter: "",
  staffLeadsDate: new Date().toLocaleDateString("en-CA"),
  editingEmployeeId: "",
  editingAccountId: "",
  editingPostId: "",
  editingLeadId: "",
  editingLeadNoteId: "",
  editingSalesLeadProfileId: "",
  previewImageUrl: "",
  postCoverFile: null,
  postCoverPreviewUrl: "",
  leadCaptureFile: null,
  leadCapturePreviewUrl: "",
  flash: null,
  viewContext: null,
  summary: null,
  distribution: [],
  rankings: [],
  users: [],
  employees: [],
  accounts: [],
  posts: [],
  teamPosts: [],
  leads: [],
  teamLeads: [],
  analyticsSnapshots: {},
  staffLearningPostIds: [],
  reviewHighlights: [],
  reviewSamples: [],
  reviewObjectFilter: "all",
  reviewSampleFilter: "all",
  reviewStatusFilter: "all",
  reviewNoteDialog: null,
  employeeSearch: "",
  employeeStatusFilter: "",
  accountSearch: "",
  accountPlatformFilter: "",
  accountEmployeeFilter: "",
  postMonitorEmployeeFilter: "",
  postMonitorTypeFilter: "",
  postMonitorPlatformFilter: "",
  postMonitorAccountFilter: "",
  leadMonitorEmployeeFilter: "",
  leadMonitorAccountFilter: "",
  leadMonitorPlatformFilter: "",
  leadMonitorPostTypeFilter: "",
  leadMonitorStatusFilter: "",
  salesFollowupIntentionFilter: "",
  salesFollowupPlatformFilter: "",
  salesFollowupAccountFilter: "",
  salesLeadLocalProfiles: {},
  salesTomorrowFollowupIds: [],
  salesTomorrowFollowupPanelOpen: false,
  notifications: [],
  unreadNotificationCount: 0,
  notificationPanelOpen: false
};

const POST_TYPES = ["素人贴", "话题贴", "获客贴"];
const ACCOUNT_STATUSES = ["正常", "停更", "限流", "禁言", "违规"];

const app = document.getElementById("app");
let delegatedEventsBound = false;

function clearPendingPostCover() {
  if (state.postCoverPreviewUrl) {
    URL.revokeObjectURL(state.postCoverPreviewUrl);
  }
  state.postCoverFile = null;
  state.postCoverPreviewUrl = "";
}

function clearPendingLeadCapture() {
  if (state.leadCapturePreviewUrl) {
    URL.revokeObjectURL(state.leadCapturePreviewUrl);
  }
  state.leadCaptureFile = null;
  state.leadCapturePreviewUrl = "";
}

function setPendingPostCover(file) {
  if (!(file instanceof File)) return;
  if (!String(file.type || "").startsWith("image/")) {
    alert("请粘贴或选择图片文件作为封面。");
    return;
  }
  clearPendingPostCover();
  state.postCoverFile = file;
  state.postCoverPreviewUrl = URL.createObjectURL(file);
}

function setPendingLeadCapture(file) {
  if (!(file instanceof File)) return;
  if (!String(file.type || "").startsWith("image/")) {
    alert("请上传图片文件作为引流截图。");
    return;
  }
  clearPendingLeadCapture();
  state.leadCaptureFile = file;
  state.leadCapturePreviewUrl = URL.createObjectURL(file);
}

function getStaffLearningStorageKey() {
  return `lan_system_learning_posts_${state.user?.id || state.user?.username || "guest"}`;
}

function getSalesLeadLocalProfilesStorageKey() {
  return `lan_system_sales_lead_profiles_${state.user?.id || state.user?.username || "guest"}`;
}

function getSalesTomorrowFollowupsStorageKey() {
  return `lan_system_sales_tomorrow_followups_${state.user?.id || state.user?.username || "guest"}`;
}

function loadStaffLearningPostIds() {
  try {
    const raw = localStorage.getItem(getStaffLearningStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveStaffLearningPostIds() {
  localStorage.setItem(getStaffLearningStorageKey(), JSON.stringify(state.staffLearningPostIds));
}

function loadSalesLeadLocalProfiles() {
  try {
    const raw = localStorage.getItem(getSalesLeadLocalProfilesStorageKey());
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSalesLeadLocalProfiles() {
  localStorage.setItem(getSalesLeadLocalProfilesStorageKey(), JSON.stringify(state.salesLeadLocalProfiles || {}));
}

function loadSalesTomorrowFollowupIds() {
  try {
    const raw = localStorage.getItem(getSalesTomorrowFollowupsStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveSalesTomorrowFollowupIds() {
  localStorage.setItem(getSalesTomorrowFollowupsStorageKey(), JSON.stringify(state.salesTomorrowFollowupIds || []));
}

function toggleStaffLearningPost(postId) {
  if (!postId) return;
  const exists = state.staffLearningPostIds.includes(postId);
  state.staffLearningPostIds = exists
    ? state.staffLearningPostIds.filter((item) => item !== postId)
    : [postId, ...state.staffLearningPostIds];
  saveStaffLearningPostIds();
  setFlash("success", exists ? "已移出学习清单" : "已加入学习清单", exists ? "这条作品已经从你的学习清单里移除。" : "这条作品已经加入学习清单，后面可以反复回看。");
  renderApp();
}

function getReviewStorageKey(name) {
  const scope = state.user?.role === "owner" ? "owner" : "admin";
  return `lan_system_${name}_${scope}`;
}

function loadReviewCollection(name) {
  try {
    const raw = localStorage.getItem(getReviewStorageKey(name));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReviewCollection(name, items) {
  localStorage.setItem(getReviewStorageKey(name), JSON.stringify(items));
}

function createReviewEntry(kind, payload) {
  return {
    id: `${kind}-${payload.type}-${payload.itemId}`,
    kind,
    type: payload.type,
    itemId: payload.itemId,
    title: payload.title || "未命名对象",
    subtitle: payload.subtitle || "",
    context: payload.context || "",
    ownerId: payload.ownerId || "",
    ownerName: payload.ownerName || "",
    accountId: payload.accountId || "",
    employeeId: payload.employeeId || payload.ownerId || "",
    platform: payload.platform || "",
    postType: payload.postType || "",
    statusLabel: payload.statusLabel || "",
    date: payload.date || "",
    sampleType: payload.sampleType || "",
    note: payload.note || "",
    status: payload.status || "pending",
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function ensureReviewStateLoaded() {
  if (state.user?.role !== "admin" && state.user?.role !== "owner") return;
  if (!state.reviewHighlights.length && !localStorage.getItem(getReviewStorageKey("review_highlights_loaded"))) {
    state.reviewHighlights = loadReviewCollection("review_highlights");
    state.reviewSamples = loadReviewCollection("review_samples");
    localStorage.setItem(getReviewStorageKey("review_highlights_loaded"), "1");
  }
}

function persistReviewState() {
  saveReviewCollection("review_highlights", state.reviewHighlights);
  saveReviewCollection("review_samples", state.reviewSamples);
}

function toggleReviewHighlight(payload) {
  ensureReviewStateLoaded();
  const entryId = `highlight-${payload.type}-${payload.itemId}`;
  const exists = state.reviewHighlights.some((item) => item.id === entryId);
  state.reviewHighlights = exists
    ? state.reviewHighlights.filter((item) => item.id !== entryId)
    : [createReviewEntry("highlight", payload), ...state.reviewHighlights];
  persistReviewState();
  setFlash("success", exists ? "已取消重点标记" : "已标记重点对象", exists ? "这条对象已经从重点沉淀里移除。" : "这条对象已经加入重点沉淀，后面可以继续跟进。");
  renderApp();
}

function toggleReviewSample(payload) {
  ensureReviewStateLoaded();
  const entryId = `sample-${payload.type}-${payload.itemId}-${payload.sampleType}`;
  const exists = state.reviewSamples.some((item) => item.id === entryId);
  state.reviewSamples = exists
    ? state.reviewSamples.filter((item) => item.id !== entryId)
    : [createReviewEntry("sample", payload), ...state.reviewSamples];
  persistReviewState();
  setFlash("success", exists ? "已移出复盘样本" : "已加入复盘样本", exists ? "这条样本已经从复盘池移除。" : `这条对象已经加入${payload.sampleType === "good" ? "好样本" : "问题样本"}。`);
  renderApp();
}

function updateReviewStatus(kind, id, status) {
  ensureReviewStateLoaded();
  const sourceKey = kind === "highlight" ? "reviewHighlights" : "reviewSamples";
  state[sourceKey] = state[sourceKey].map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item);
  persistReviewState();
  setFlash("success", status === "done" ? "已标为已处理" : "已设为待复盘");
  renderApp();
}

function openReviewNoteDialog(kind, id) {
  ensureReviewStateLoaded();
  const sourceKey = kind === "highlight" ? "reviewHighlights" : "reviewSamples";
  const current = state[sourceKey].find((item) => item.id === id);
  if (!current) return;
  state.reviewNoteDialog = {
    kind,
    id,
    title: current.title || "重点对象",
    note: current.note || ""
  };
  renderApp();
}

function closeReviewNoteDialog() {
  state.reviewNoteDialog = null;
}

function updateReviewNote(kind, id, value) {
  ensureReviewStateLoaded();
  const sourceKey = kind === "highlight" ? "reviewHighlights" : "reviewSamples";
  state[sourceKey] = state[sourceKey].map((item) => item.id === id ? { ...item, note: String(value).trim(), updatedAt: new Date().toISOString() } : item);
  persistReviewState();
  closeReviewNoteDialog();
  setFlash("success", "备注已保存");
  renderApp();
}

function buildReviewPayloadFromPost(item) {
  return {
    type: "post",
    itemId: item.id,
    title: item.title || "未命名作品",
    subtitle: `${item.employeeName || "-"} · ${item.platform || "-"} · ${item.postType || "-"}`,
    context: item.publishedAt || "",
    employeeId: item.employeeId || "",
    accountId: item.accountId || "",
    platform: item.platform || "",
    postType: item.postType || "",
    date: item.publishedAt || "",
    ownerId: item.employeeId || "",
    ownerName: item.employeeName || ""
  };
}

function buildReviewPayloadFromLead(item) {
  return {
    type: "lead",
    itemId: item.id,
    title: item.nickname || item.contactInfo || "未命名客资",
    subtitle: `${item.employeeName || "-"} · ${item.platform || "-"} · ${item.status || "-"}`,
    context: item.accountName || "",
    employeeId: item.employeeId || "",
    accountId: item.accountId || "",
    platform: item.platform || "",
    statusLabel: item.status || "",
    date: String(item.createdAt || "").slice(0, 10),
    ownerId: item.employeeId || "",
    ownerName: item.employeeName || ""
  };
}

function buildReviewPayloadFromAccount(item) {
  return {
    type: "account",
    itemId: item.id,
    title: item.accountName || "未命名账号",
    subtitle: `${item.employeeName || "-"} · ${item.platform || "-"}`,
    context: item.positioning || "",
    employeeId: item.employeeId || "",
    accountId: item.id,
    platform: item.platform || "",
    ownerId: item.employeeId || "",
    ownerName: item.employeeName || ""
  };
}

function buildReviewPayloadFromEmployee(item) {
  return {
    type: "employee",
    itemId: item.employeeId || item.id || item.name,
    title: item.name || "未命名运营",
    subtitle: `作品 ${item.todayPosts ?? item.postCount ?? 0} · 客资 ${item.todayLeads ?? item.leadCount ?? 0}`,
    context: `账号 ${item.accountCount ?? 0}`,
    employeeId: item.employeeId || item.id || "",
    ownerId: item.employeeId || item.id || "",
    ownerName: item.name || ""
  };
}

function getFilteredReviewItems(items, sampleFilter = "all") {
  return items.filter((item) => {
    if (state.reviewObjectFilter !== "all" && item.type !== state.reviewObjectFilter) return false;
    if (sampleFilter !== "all" && item.sampleType !== sampleFilter) return false;
    if (state.reviewStatusFilter !== "all" && item.status !== state.reviewStatusFilter) return false;
    return true;
  });
}

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "请求失败" }));
    throw new Error(data.message || "请求失败");
  }
  return response.json();
}

async function init() {
  bindDelegatedEvents();
  if (!state.token) {
    renderLogin();
    return;
  }

  try {
    const me = await api("/api/auth/me");
    state.user = me.user;
    await loadData();
    renderApp();
  } catch {
    localStorage.removeItem("lan_system_token");
    state.token = "";
    renderLogin();
  }
}

async function loadData() {
  const requests = state.user.role === "admin" || state.user.role === "owner"
    ? [
        api("/api/dashboard/summary"),
        api("/api/dashboard/post-type-distribution"),
        api("/api/rankings?type=posts"),
        api("/api/users"),
        api("/api/employees"),
        api("/api/accounts"),
        api("/api/posts"),
        api("/api/leads"),
        api("/api/analytics/snapshots")
      ]
    : [
        Promise.resolve(null),
        Promise.resolve([]),
        Promise.resolve([]),
        Promise.resolve([]),
        Promise.resolve([]),
        api("/api/accounts"),
        api("/api/posts"),
        api("/api/leads"),
        Promise.resolve({ snapshots: {} })
      ];
  const normalizedRequests = state.user.role === "sales"
    ? [
        Promise.resolve(null),
        Promise.resolve([]),
        Promise.resolve([]),
        Promise.resolve([]),
        Promise.resolve([]),
        api("/api/accounts"),
        api("/api/posts"),
        api("/api/leads"),
        Promise.resolve({ snapshots: {} }),
        api("/api/notifications")
      ]
    : [...requests, api("/api/notifications")];

  const [summary, distribution, rankings, users, employees, accounts, posts, leads, analyticsSnapshots, notifications] = await Promise.all(normalizedRequests);
  state.summary = summary;
  state.distribution = distribution;
  state.rankings = rankings;
  state.users = users || [];
  state.employees = employees;
  state.accounts = accounts;
  state.posts = posts;
  state.leads = leads;
  state.analyticsSnapshots = analyticsSnapshots.snapshots || {};
  state.notifications = notifications?.items || [];
  state.unreadNotificationCount = Number(notifications?.unreadCount || 0);
  alignStateDatesToAvailableData();
  state.teamPosts = state.user.role === "staff" ? await api("/api/posts?scope=all") : posts;
  state.teamLeads = state.user.role === "staff" ? await api("/api/leads?scope=all") : leads;
  state.staffLearningPostIds = state.user.role === "staff" ? loadStaffLearningPostIds() : [];
  state.salesLeadLocalProfiles = state.user.role === "sales" ? loadSalesLeadLocalProfiles() : {};
  state.salesTomorrowFollowupIds = state.user.role === "sales" ? loadSalesTomorrowFollowupIds() : [];
  if (state.user.role === "admin" || state.user.role === "owner") {
    state.reviewHighlights = loadReviewCollection("review_highlights");
    state.reviewSamples = loadReviewCollection("review_samples");
  }
}

function renderLogin() {
  const isOwnerPortal = window.location.port === "3001";
  const title = isOwnerPortal ? "总后台入口" : "运营协作中台";
  const subtitle = isOwnerPortal
    ? "查看整体经营、主管管理和销售推进。"
    : "统一管理员工、账号、作品和客资。";
  const bullets = isOwnerPortal
    ? ["总后台登录", "适合负责人查看全局"]
    : ["运营、主管、销售共用一套数据", "登录后直接进入对应工作台"];
  app.innerHTML = `
    <div class="login-shell">
      <div class="login-layout">
        <section class="login-aside">
          <span class="login-kicker">${isOwnerPortal ? "总后台" : "运营管理"}</span>
          <h1>${title}</h1>
          <p>${subtitle}</p>
          <div class="login-bullets">
            ${bullets.map((item) => `
              <div class="login-bullet">
                <span class="login-bullet-dot"></span>
                <span>${item}</span>
              </div>
            `).join("")}
          </div>
        </section>
        <form class="login-card" id="loginForm">
          <div class="login-card-head">
            <div>
              <h2>${isOwnerPortal ? "登录总后台" : "登录工作台"}</h2>
              <p class="muted">${isOwnerPortal ? "请输入账号和密码。" : "请输入账号和密码。"}</p>
            </div>
            <span class="login-port-tag">${isOwnerPortal ? "3001" : "3000"}</span>
          </div>
          <div class="login-fields">
            <input name="username" placeholder="用户名" required />
            <input name="password" type="password" placeholder="密码" required />
          </div>
          <button class="primary login-submit" type="submit">登录</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: String(formData.get("username")).trim(),
          password: String(formData.get("password")).trim()
        })
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem("lan_system_token", state.token);
      await loadData();
      renderApp();
    } catch (error) {
      alert(error.message);
    }
  });
}

function renderDashboardShortList(items) {
  return `
    <div class="dashboard-short-list">
      ${items.map((item) => `
        <article class="dashboard-short-item dashboard-short-item-${item.tone || "good"}">
          <div class="dashboard-short-rank">${item.rank}</div>
          <div class="dashboard-short-copy">
            <strong>${item.title}</strong>
            <p>${item.summary}</p>
            ${item.actions?.length ? `<div class="dashboard-short-actions">${item.actions.join("")}</div>` : ""}
          </div>
          <div class="dashboard-short-meta">${item.meta}</div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderApp() {
  const isOwner = state.user.role === "owner";
  const isAdmin = state.user.role === "admin";
  const isSales = state.user.role === "sales";
  const adminViews = [
    ["dashboard", "总览"],
    ["personal-board", "个人看板"],
    ["posts", "作品看板"],
    ["account-viz", "分析看板"],
    ["leads", "客资看板"],
    ["employees", "员工管理"],
    ["accounts", "账号管理"]
  ];

  const staffViews = [
    ["staff-rankings", "运营排行榜"],
    ["personal-board", "个人看板"],
    ["post-entry", "作品录入"],
    ["staff-leads-board", "客资看板"],
    ["lead-entry", "客资录入"],
    ["my-posts", "我的作品"],
  ];

  const salesViews = [
    ["sales-leads", "客资看板"],
    ["sales-followups", "跟进看板"]
  ];

  const navItems = (isAdmin || isOwner) ? adminViews : isSales ? salesViews : staffViews;
  if (!navItems.some(([key]) => key === state.currentView)) {
    state.currentView = navItems[0][0];
  }

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-mark">${isOwner ? "总" : isAdmin ? "管" : isSales ? "销" : "员"}</div>
          <div>
            <h1>${isOwner ? "总后台" : isAdmin ? "主管端" : isSales ? "销售端" : "员工端"}</h1>
            <p class="muted">${state.user.employeeName || state.user.username}</p>
          </div>
        </div>
        <div class="sidebar-user">
          <span class="sidebar-role">${isOwner ? "总后台管理" : isAdmin ? "运营主管" : isSales ? "销售跟进" : "运营员工"}</span>
          <p class="sidebar-copy">${isOwner ? "查看全局录入、客资来源和团队动作。" : isAdmin ? "查看团队录入、作品表现和客资转化。" : isSales ? "查看来源作品、引流截图和当前客资状态。" : "录作品、记客资、回看当天数据。"}</p>
        </div>
        <div class="nav">
          ${navItems.map(([key, label]) => `<button data-view="${key}" class="${state.currentView === key ? "active" : ""}">${label}</button>`).join("")}
        </div>
        <button class="ghost sidebar-logout" id="logoutBtn">退出登录</button>
      </aside>
      <main class="main">
        <section class="workspace-banner">
          <div class="workspace-banner-copy">
            <span class="mini-tag">${isOwner ? "总后台工作台" : isAdmin ? "主管工作台" : isSales ? "销售工作台" : "员工工作台"}</span>
            <strong>${isOwner ? "全局客资、来源作品和引流截图都集中在这里查看。" : isAdmin ? "今天的录入、快照和看板都在本机持续保存。" : isSales ? "引流截图和来源作品会跟着客资一起展示，方便快速判断怎么跟进。" : "录入后会直接写入本地数据库，主管端同步后就能看到。"}</strong>
            <p>${isOwner ? "从总后台也能直接进入作品和客资现场，避免信息在不同端口之间断层。" : isAdmin ? "系统现在会同时保留原始数据文件、日报快照和自动备份，临时出问题也尽量不影响当天大盘。" : isSales ? "先看来源作品，再看引流截图和备注，能更快建立跟进语境。" : "作品、客资、当天记录都会按日期保存，回看和修改会更稳。"} </p>
          </div>
          <div class="workspace-banner-meta">
            <div class="workspace-pulse">
              <span class="workspace-pulse-dot"></span>
              <span>${isOwner || isSales ? "来源信息可追溯" : "自动保存开启"}</span>
            </div>
            <span class="tag tag-soft">${isOwner ? "全局上下文完整" : isAdmin ? "已启用日报快照" : isSales ? "客资上下文完整" : "录入即写入"}</span>
            ${renderNotificationPanel()}
          </div>
        </section>
        ${renderFlash()}
        ${renderCurrentView()}
        ${renderImageViewer()}
        ${renderReviewNoteDialog()}
      </main>
    </div>
  `;

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentView = button.dataset.view;
      renderApp();
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    localStorage.removeItem("lan_system_token");
    state.token = "";
    state.user = null;
    renderLogin();
  });

  bindViewEvents();
  document.getElementById("reviewNoteForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.reviewNoteDialog) return;
    const formData = new FormData(event.currentTarget);
    updateReviewNote(state.reviewNoteDialog.kind, state.reviewNoteDialog.id, formData.get("note") || "");
  });
  if (state.reviewNoteDialog) {
    window.requestAnimationFrame(() => {
      const input = document.getElementById("reviewNoteInput");
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  }
  if (state.user.role === "admin" && state.currentView === "analytics") {
    window.requestAnimationFrame(() => renderAnalyticsCharts());
  }
  if ((state.user.role === "admin" || state.user.role === "owner") && state.currentView === "account-viz") {
    window.requestAnimationFrame(() => renderAccountVizChart());
  }
}

function renderFlash() {
  if (!state.flash) return "";
  return `
    <div class="flash flash-${state.flash.type || "success"}">
      <div class="flash-copy">
        <strong>${state.flash.title || "操作成功"}</strong>
        ${state.flash.message ? `<p>${state.flash.message}</p>` : ""}
      </div>
      <button class="flash-close ghost" id="flashCloseBtn" type="button">知道了</button>
    </div>
  `;
}

function renderNotificationPanel() {
  const hasUnread = state.unreadNotificationCount > 0;
  return `
    <div class="workspace-actions">
      <button class="ghost notification-toggle ${hasUnread ? "has-unread" : ""}" id="notificationToggleBtn" type="button">
        消息
        ${hasUnread ? `<span class="notification-badge">${state.unreadNotificationCount}</span>` : ""}
      </button>
      ${state.notificationPanelOpen ? `
        <div class="notification-panel">
          <div class="notification-panel-head">
            <strong>消息提醒</strong>
            <button class="ghost" id="notificationCloseBtn" type="button">关闭</button>
          </div>
          <div class="notification-list">
            ${state.notifications.length
              ? state.notifications.map((item) => `
                  <button class="notification-item ${item.unread ? "unread" : ""} js-notification-item" data-id="${item.id}" type="button">
                    <strong>${item.title || "系统消息"}</strong>
                    <p>${item.message || ""}</p>
                    <span>${item.createdAt ? formatDate(item.createdAt) : ""}</span>
                  </button>
                `).join("")
              : `<div class="notification-item"><strong>暂无消息</strong><p>当前还没有新的提醒。</p></div>`}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderCurrentView() {
  if (state.user.role === "admin" || state.user.role === "owner") {
    switch (state.currentView) {
      case "dashboard":
        return renderDashboard();
      case "personal-board":
        return renderPersonalBoard();
      case "posts":
        return renderPostsMonitor();
      case "account-viz":
        return renderAccountVisualization();
      case "leads":
        return renderLeadsMonitor();
      case "employees":
        return renderEmployees();
      case "accounts":
        return renderAccounts();
      default:
        return renderDashboard();
    }
  }

  if (state.user.role === "sales") {
    switch (state.currentView) {
      case "sales-leads":
        return renderSalesLeads();
      case "sales-followups":
        return renderSalesFollowupBoard();
      default:
        return renderSalesLeads();
    }
  }

  switch (state.currentView) {
    case "staff-rankings":
      return renderStaffRankings();
    case "personal-board":
      return renderStaffPersonalBoard();
    case "post-entry":
      return renderPostEntry();
    case "staff-leads-board":
      return renderStaffLeadsBoard();
    case "lead-entry":
      return renderLeadEntry();
    case "my-posts":
      return renderMyPosts();
    default:
      return renderStaffRankings();
  }
}

function renderImageViewer() {
  if (!state.previewImageUrl) return "";
  return `
    <div class="image-viewer">
      <div class="image-viewer-backdrop js-close-image-viewer"></div>
      <div class="image-viewer-dialog" role="dialog" aria-modal="true" aria-label="封面预览">
        <button class="ghost image-viewer-close js-close-image-viewer" type="button">关闭</button>
        <img src="${state.previewImageUrl}" alt="封面预览" class="image-viewer-image" />
      </div>
    </div>
  `;
}

function renderReviewNoteDialog() {
  if (!state.reviewNoteDialog) return "";
  return `
    <div class="supervisor-dialog-layer">
      <div class="supervisor-dialog-backdrop js-close-review-note-dialog"></div>
      <div class="supervisor-dialog" role="dialog" aria-modal="true" aria-label="主管备注">
        <div class="supervisor-dialog-header">
          <h3>主管备注</h3>
          <p>给 <strong>${state.reviewNoteDialog.title}</strong> 留下一句判断，方便后面复盘时快速回忆为什么把它列为重点。</p>
        </div>
        <form id="reviewNoteForm" class="supervisor-note-form">
          <textarea id="reviewNoteInput" name="note" rows="5" placeholder="例如：这条获客贴的评论承接很顺，适合复刻标题结构。">${state.reviewNoteDialog.note || ""}</textarea>
          <div class="supervisor-dialog-actions">
            <button class="ghost js-close-review-note-dialog" type="button">取消</button>
            <button class="primary" type="submit">保存备注</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderExternalLink(url, label) {
  const normalized = normalizeExternalUrl(url);
  if (!normalized) return "";
  return `<a class="ghost link-like external-link" href="${normalized}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function setViewContext(items = []) {
  state.viewContext = items.length ? items : null;
}

function renderViewContext() {
  if (!state.viewContext?.length) return "";
  return `
    <section class="panel view-context-panel">
      <div class="section-head">
        <h3>当前查看上下文</h3>
        <button class="ghost js-clear-view-context" type="button">清空上下文</button>
      </div>
      <div class="post-monitor-tags">
        ${state.viewContext.map((item) => `<span class="tag tag-soft">${item.label}：${item.value}</span>`).join("")}
      </div>
    </section>
  `;
}

function getReviewStateSummary() {
  ensureReviewStateLoaded();
  const today = new Date().toLocaleDateString("en-CA");
  const highlightsToday = state.reviewHighlights.filter((item) => String(item.createdAt || "").slice(0, 10) === today).length;
  const samplesToday = state.reviewSamples.filter((item) => String(item.createdAt || "").slice(0, 10) === today).length;
  const pendingCount = [...state.reviewHighlights, ...state.reviewSamples].filter((item) => item.status !== "done").length;
  const doneCount = [...state.reviewHighlights, ...state.reviewSamples].filter((item) => item.status === "done").length;
  return { highlightsToday, samplesToday, pendingCount, doneCount };
}

function renderReviewStatusTag(item) {
  return `<span class="tag ${item.status === "done" ? "" : "tag-warm"}">${item.status === "done" ? "已处理" : "待复盘"}</span>`;
}

function getCurrentAdminPeriodContext() {
  if (state.currentView === "posts") {
    return {
      mode: state.postMonitorMode,
      date: state.postMonitorDate,
      week: state.postMonitorWeek,
      month: state.postMonitorMode === "day" ? String(state.postMonitorDate || "").slice(0, 7) : String(state.postMonitorWeek || "").slice(0, 7)
    };
  }
  if (state.currentView === "leads" || state.currentView === "sales-leads") {
    return {
      mode: state.leadMonitorMode,
      date: state.leadMonitorDate,
      week: state.leadMonitorWeek,
      month: state.leadMonitorMode === "day" ? String(state.leadMonitorDate || "").slice(0, 7) : String(state.leadMonitorWeek || "").slice(0, 7)
    };
  }
  if (state.currentView === "analytics") {
    return {
      mode: state.analyticsMode,
      date: state.analyticsDate,
      week: state.analyticsWeek,
      month: state.analyticsMode === "month"
        ? state.analyticsMonth
        : state.analyticsMode === "day"
          ? String(state.analyticsDate || "").slice(0, 7)
          : String(state.analyticsWeek || "").slice(0, 7)
    };
  }
  if (state.currentView === "rankings") {
    return {
      mode: state.rankingsMode,
      date: state.rankingsDate,
      week: state.rankingsWeek,
      month: state.rankingsMode === "month"
        ? state.rankingsMonth
        : state.rankingsMode === "day"
          ? String(state.rankingsDate || "").slice(0, 7)
          : String(state.rankingsWeek || "").slice(0, 7)
    };
  }
  if (state.currentView === "dashboard") {
    return {
      mode: state.dashboardMode,
      date: state.dashboardDate,
      week: state.dashboardWeek,
      month: state.dashboardMode === "month"
        ? state.dashboardMonth
        : state.dashboardMode === "day"
          ? String(state.dashboardDate || "").slice(0, 7)
          : String(state.dashboardWeek || "").slice(0, 7)
    };
  }
  return {
    mode: "month",
    date: "",
    week: "",
    month: state.accountVizMonth || new Date().toLocaleDateString("en-CA").slice(0, 7)
  };
}

function renderReviewDrillActions(item) {
  const period = getCurrentAdminPeriodContext();
  if (item.type === "account") {
    return `
      <button class="ghost js-open-account-viz-context" data-employee="${escapeHtmlAttribute(item.employeeId || item.ownerId || "")}" data-account="${escapeHtmlAttribute(item.accountId || item.itemId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-month="${escapeHtmlAttribute(item.date ? String(item.date).slice(0, 7) : (period.month || ""))}" type="button">看账号节奏</button>
      <button class="ghost js-open-leads-context" data-employee="${escapeHtmlAttribute(item.employeeId || item.ownerId || "")}" data-account="${escapeHtmlAttribute(item.accountId || item.itemId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-mode="${escapeHtmlAttribute(period.mode || "day")}" data-date="${escapeHtmlAttribute(period.date || "")}" data-week="${escapeHtmlAttribute(period.week || "")}" type="button">看同账号客资</button>
    `;
  }
  if (item.type === "post") {
    return `
      <button class="ghost js-open-posts-context" data-employee="${escapeHtmlAttribute(item.employeeId || item.ownerId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-post-type="${escapeHtmlAttribute(item.postType || "")}" data-mode="day" data-date="${escapeHtmlAttribute(item.date || period.date || "")}" type="button">看作品现场</button>
      <button class="ghost js-open-account-viz-context" data-employee="${escapeHtmlAttribute(item.employeeId || item.ownerId || "")}" data-account="${escapeHtmlAttribute(item.accountId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-month="${escapeHtmlAttribute(item.date ? String(item.date).slice(0, 7) : (period.month || ""))}" type="button">看账号节奏</button>
    `;
  }
  if (item.type === "lead") {
    return `
      <button class="ghost js-open-leads-context" data-employee="${escapeHtmlAttribute(item.employeeId || item.ownerId || "")}" data-account="${escapeHtmlAttribute(item.accountId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-status="${escapeHtmlAttribute(item.statusLabel || "")}" data-mode="day" data-date="${escapeHtmlAttribute(item.date || period.date || "")}" type="button">看客资现场</button>
      <button class="ghost js-open-account-viz-context" data-employee="${escapeHtmlAttribute(item.employeeId || item.ownerId || "")}" data-account="${escapeHtmlAttribute(item.accountId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-month="${escapeHtmlAttribute(item.date ? String(item.date).slice(0, 7) : (period.month || ""))}" type="button">看账号节奏</button>
    `;
  }
  if (item.type === "employee") {
    return `
      <button class="ghost js-open-posts-context" data-employee="${escapeHtmlAttribute(item.employeeId || item.ownerId || item.itemId || "")}" data-mode="${escapeHtmlAttribute(period.mode || "day")}" data-date="${escapeHtmlAttribute(period.date || "")}" data-week="${escapeHtmlAttribute(period.week || "")}" type="button">看作品</button>
      <button class="ghost js-open-leads-context" data-employee="${escapeHtmlAttribute(item.employeeId || item.ownerId || item.itemId || "")}" data-mode="${escapeHtmlAttribute(period.mode || "day")}" data-date="${escapeHtmlAttribute(period.date || "")}" data-week="${escapeHtmlAttribute(period.week || "")}" type="button">看客资</button>
    `;
  }
  return "";
}

function renderReviewActionButtons(payload) {
  if (!payload || (state.user?.role !== "admin" && state.user?.role !== "owner")) return "";
  const highlightId = `highlight-${payload.type}-${payload.itemId}`;
  const highlightExists = state.reviewHighlights.some((item) => item.id === highlightId);
  const goodExists = state.reviewSamples.some((item) => item.id === `sample-${payload.type}-${payload.itemId}-good`);
  const badExists = state.reviewSamples.some((item) => item.id === `sample-${payload.type}-${payload.itemId}-bad`);
  return `
    <div class="review-inline-actions">
      <button class="ghost js-review-highlight" data-review='${escapeHtmlAttribute(JSON.stringify(payload))}' type="button">${highlightExists ? "取消重点" : "标记重点"}</button>
      <button class="ghost js-review-sample-good" data-review='${escapeHtmlAttribute(JSON.stringify(payload))}' type="button">${goodExists ? "移出好样本" : "加入好样本"}</button>
      <button class="ghost js-review-sample-bad" data-review='${escapeHtmlAttribute(JSON.stringify(payload))}' type="button">${badExists ? "移出问题样本" : "加入问题样本"}</button>
    </div>
  `;
}

function renderReviewCollectionSection(title, items, kind, emptyTitle, emptyDescription) {
  const filteredItems = getFilteredReviewItems(items, kind === "sample" ? state.reviewSampleFilter : "all");
  return `
    <section class="panel">
      <div class="section-head">
        <h3>${title}</h3>
        <span class="muted">${kind === "highlight" ? "被主管继续盯的重点对象。" : "被主管加入复盘池的好样本和问题样本。"}</span>
      </div>
      <div class="filters filters-toolbar">
        <select id="reviewObjectFilter">
          <option value="all" ${state.reviewObjectFilter === "all" ? "selected" : ""}>全部对象</option>
          <option value="employee" ${state.reviewObjectFilter === "employee" ? "selected" : ""}>员工</option>
          <option value="account" ${state.reviewObjectFilter === "account" ? "selected" : ""}>账号</option>
          <option value="post" ${state.reviewObjectFilter === "post" ? "selected" : ""}>作品</option>
          <option value="lead" ${state.reviewObjectFilter === "lead" ? "selected" : ""}>客资</option>
        </select>
        <select id="reviewStatusFilter">
          <option value="all" ${state.reviewStatusFilter === "all" ? "selected" : ""}>全部状态</option>
          <option value="pending" ${state.reviewStatusFilter === "pending" ? "selected" : ""}>只看待复盘</option>
          <option value="done" ${state.reviewStatusFilter === "done" ? "selected" : ""}>只看已处理</option>
        </select>
        ${kind === "sample" ? `
          <select id="reviewSampleFilter">
            <option value="all" ${state.reviewSampleFilter === "all" ? "selected" : ""}>全部样本</option>
            <option value="good" ${state.reviewSampleFilter === "good" ? "selected" : ""}>好样本</option>
            <option value="bad" ${state.reviewSampleFilter === "bad" ? "selected" : ""}>问题样本</option>
          </select>
        ` : ""}
      </div>
      ${filteredItems.length ? `
        <div class="dashboard-short-list">
          ${filteredItems.map((item, index) => `
            <article class="dashboard-short-item dashboard-short-item-${item.status === "done" ? "good" : "warn"}">
              <div class="dashboard-short-rank">${index + 1}</div>
              <div class="dashboard-short-copy">
                <strong>${item.title}</strong>
                <p>${item.subtitle || item.context || "暂无补充信息"}</p>
                <div class="post-monitor-tags">
                  <span class="tag tag-soft">${item.type === "employee" ? "员工" : item.type === "account" ? "账号" : item.type === "post" ? "作品" : "客资"}</span>
                  ${item.sampleType ? `<span class="tag ${item.sampleType === "good" ? "" : "tag-warm"}">${item.sampleType === "good" ? "好样本" : "问题样本"}</span>` : ""}
                  ${renderReviewStatusTag(item)}
                </div>
                ${item.note ? `<p>${item.note}</p>` : ""}
                <div class="dashboard-short-actions">
                  ${renderReviewDrillActions(item)}
                  <button class="ghost js-review-note" data-kind="${kind}" data-id="${item.id}" type="button">${item.note ? "改备注" : "写备注"}</button>
                  ${item.status === "done"
                    ? `<button class="ghost js-review-status" data-kind="${kind}" data-id="${item.id}" data-status="pending" type="button">设为待复盘</button>`
                    : `<button class="ghost js-review-status" data-kind="${kind}" data-id="${item.id}" data-status="done" type="button">标为已处理</button>`}
                </div>
              </div>
              <div class="dashboard-short-meta">${item.ownerName || "-"}</div>
            </article>
          `).join("")}
        </div>
      ` : renderEmptyState(emptyTitle, emptyDescription)}
    </section>
  `;
}

function openPostsMonitorWithContext({ employeeId = "", platform = "", postType = "", mode = "day", date = "", week = "" } = {}) {
  state.currentView = "posts";
  state.postMonitorEmployeeFilter = employeeId;
  state.postMonitorPlatformFilter = platform;
  state.postMonitorTypeFilter = postType;
  state.postMonitorMode = mode;
  if (mode === "week" && week) state.postMonitorWeek = week;
  if (mode === "day" && date) state.postMonitorDate = date;
  setViewContext([
    employeeId ? { label: "员工", value: state.employees.find((item) => item.id === employeeId)?.name || employeeId } : null,
    platform ? { label: "平台", value: platform } : null,
    postType ? { label: "类型", value: postType } : null
  ].filter(Boolean));
  renderApp();
}

function openLeadsMonitorWithContext({ employeeId = "", accountId = "", platform = "", status = "", mode = "day", date = "", week = "" } = {}) {
  state.currentView = "leads";
  state.leadMonitorEmployeeFilter = employeeId;
  state.leadMonitorAccountFilter = accountId;
  state.leadMonitorPlatformFilter = platform;
  state.leadMonitorStatusFilter = status;
  state.leadMonitorMode = mode;
  if (mode === "week" && week) state.leadMonitorWeek = week;
  if (mode === "day" && date) state.leadMonitorDate = date;
  setViewContext([
    employeeId ? { label: "员工", value: state.employees.find((item) => item.id === employeeId)?.name || employeeId } : null,
    accountId ? { label: "账号", value: state.accounts.find((item) => item.id === accountId)?.accountName || accountId } : null,
    platform ? { label: "平台", value: platform } : null,
    status ? { label: "状态", value: status } : null
  ].filter(Boolean));
  renderApp();
}

function openAccountVisualizationWithContext({ employeeId = "", accountId = "", platform = "", month = "" } = {}) {
  state.currentView = "account-viz";
  state.accountVizEmployeeFilter = employeeId;
  state.accountVizSelectedAccountId = accountId;
  state.accountVizPlatformFilter = platform;
  if (month) state.accountVizMonth = month;
  setViewContext([
    employeeId ? { label: "员工", value: state.employees.find((item) => item.id === employeeId)?.name || employeeId } : null,
    accountId ? { label: "账号", value: state.accounts.find((item) => item.id === accountId)?.accountName || accountId } : null,
    platform ? { label: "平台", value: platform } : null,
    { label: "月份", value: state.accountVizMonth }
  ].filter(Boolean));
  renderApp();
}

function renderDashboard() {
  const targetDates = getDashboardSnapshotDates().length
    ? getDashboardSnapshotDates()
    : state.dashboardMode === "day"
      ? [state.dashboardDate]
      : [];
  const label = state.dashboardMode === "week"
    ? state.dashboardWeek
    : state.dashboardMode === "month"
      ? state.dashboardMonth
      : state.dashboardMode === "all"
        ? "累计到今天"
        : state.dashboardDate;
  const postsInRange = state.posts.filter((item) => item.publishedAt && targetDates.includes(item.publishedAt));
  const leadsInRange = state.leads.filter((item) => {
    const leadDate = String(item.createdAt || "").slice(0, 10);
    return leadDate && targetDates.includes(leadDate);
  });
  const platformRows = buildDashboardPlatformRows(postsInRange, leadsInRange);
  const xhsEmployeeRows = buildDashboardEmployeeRows("小红书", postsInRange, leadsInRange);
  const douyinEmployeeRows = buildDashboardEmployeeRows("抖音", postsInRange, leadsInRange);
  const xhsEfficiencyRows = buildDashboardEfficiencyRows("小红书", postsInRange, leadsInRange);
  const douyinEfficiencyRows = buildDashboardEfficiencyRows("抖音", postsInRange, leadsInRange);
  return `
    <div class="page-header page-header-rich rankings-page-header">
      <div>
        <h2>总览</h2>
        <p class="page-desc">小红书和抖音双栏展示。最上方看各类型作品总览和占比，条状图下方显示客资数；下方看每个员工的具体数据和获客效率榜。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${label}</span>
        ${renderAdminRefreshButton()}
      </div>
    </div>
    <div class="panel">
      <div class="filters filters-toolbar">
        <select id="dashboardModeInput">
          <option value="day" ${state.dashboardMode === "day" ? "selected" : ""}>按天</option>
          <option value="week" ${state.dashboardMode === "week" ? "selected" : ""}>按周</option>
          <option value="month" ${state.dashboardMode === "month" ? "selected" : ""}>按月</option>
          <option value="all" ${state.dashboardMode === "all" ? "selected" : ""}>累计到今天</option>
        </select>
        ${state.dashboardMode === "day"
          ? `<input id="dashboardDateInput" type="date" value="${state.dashboardDate}" />`
          : ""}
        ${state.dashboardMode === "week"
          ? `<input id="dashboardWeekInput" type="week" value="${state.dashboardWeek}" />`
          : ""}
        ${state.dashboardMode === "month"
          ? `<input id="dashboardMonthInput" type="month" value="${state.dashboardMonth}" />`
          : ""}
        ${renderTimeQuickActions("dashboard", [
          { action: "today", label: "今天" },
          { action: "week", label: "本周" },
          { action: "month", label: "本月" },
          { action: "all", label: "累计" }
        ])}
      </div>
    </div>
    <section class="panel">
      <div class="section-head">
        <h3>双平台总览</h3>
        <span class="muted">顶部按小红书和抖音双栏展示，只看作品类型、数量占比和客资数，不看评论点赞播放量。</span>
      </div>
      <div class="overview-platform-grid">
        ${platformRows.map(renderDashboardPlatformCard).join("")}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>员工数据区</h3>
        <div class="section-head-actions">
          <select id="dashboardEmployeeSortInput">
            <option value="leads" ${state.dashboardEmployeeSort === "leads" ? "selected" : ""}>按客资排序</option>
            <option value="people" ${state.dashboardEmployeeSort === "people" ? "selected" : ""}>按素人排序</option>
            <option value="topic" ${state.dashboardEmployeeSort === "topic" ? "selected" : ""}>按话题排序</option>
            <option value="lead" ${state.dashboardEmployeeSort === "lead" ? "selected" : ""}>按获客排序</option>
            <option value="posts" ${state.dashboardEmployeeSort === "posts" ? "selected" : ""}>按总条数排序</option>
          </select>
        </div>
      </div>
      <div class="overview-platform-grid">
        ${renderDashboardEmployeeBoard("小红书", xhsEmployeeRows)}
        ${renderDashboardEmployeeBoard("抖音", douyinEmployeeRows)}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>获客效率榜</h3>
        <span class="muted">每个平台分别看两项效率：获客数 / 作品总数，以及获客数 / 获客贴数。</span>
      </div>
      <div class="overview-platform-grid">
        ${renderDashboardEfficiencyBoard("小红书", xhsEfficiencyRows)}
        ${renderDashboardEfficiencyBoard("抖音", douyinEfficiencyRows)}
      </div>
    </section>
  `;
}

function buildDashboardPlatformRows(posts, leads) {
  return ["小红书", "抖音"].map((platform) => {
    const platformPosts = posts.filter((item) => item.platform === platform);
    const platformLeads = leads.filter((item) => item.platform === platform);
    const totalPosts = platformPosts.length;
    const types = POST_TYPES.map((type) => {
      const count = platformPosts.filter((item) => item.postType === type).length;
      const ratio = totalPosts ? Math.round((count / totalPosts) * 100) : 0;
      return { type, count, ratio };
    });
    return {
      platform,
      totalPosts,
      leadCount: platformLeads.length,
      types
    };
  });
}

function buildDashboardEmployeeRows(platform, posts, leads) {
  return state.employees
    .map((employee) => {
      const employeePosts = posts.filter((item) => item.platform === platform && item.employeeId === employee.id);
      const employeeLeads = leads.filter((item) => item.platform === platform && item.employeeId === employee.id);
      const totalPosts = employeePosts.length;
      const types = POST_TYPES.map((type) => {
        const count = employeePosts.filter((item) => item.postType === type).length;
        const ratio = totalPosts ? Math.round((count / totalPosts) * 100) : 0;
        return { type, count, ratio };
      });
      return {
        employeeId: employee.id,
        name: employee.name,
        totalPosts,
        leadCount: employeeLeads.length,
        peopleCount: types.find((item) => item.type === "素人贴")?.count || 0,
        topicCount: types.find((item) => item.type === "话题贴")?.count || 0,
        leadPostCount: types.find((item) => item.type === "获客贴")?.count || 0,
        types
      };
    })
    .filter((item) => item.totalPosts > 0 || item.leadCount > 0)
    .sort((left, right) => {
      const sortKeyMap = {
        leads: "leadCount",
        people: "peopleCount",
        topic: "topicCount",
        lead: "leadPostCount",
        posts: "totalPosts"
      };
      const sortKey = sortKeyMap[state.dashboardEmployeeSort] || "leadCount";
      if (right[sortKey] !== left[sortKey]) return right[sortKey] - left[sortKey];
      if (right.leadCount !== left.leadCount) return right.leadCount - left.leadCount;
      return right.totalPosts - left.totalPosts;
    });
}

function buildDashboardEfficiencyRows(platform, posts, leads) {
  return state.employees
    .map((employee) => {
      const employeePosts = posts.filter((item) => item.platform === platform && item.employeeId === employee.id);
      const leadPosts = employeePosts.filter((item) => item.postType === "获客贴");
      const leadCount = leads.filter((item) => item.platform === platform && item.employeeId === employee.id).length;
      const totalPosts = employeePosts.length;
      const leadPostCount = leadPosts.length;
      return {
        employeeId: employee.id,
        name: employee.name,
        totalPosts,
        leadPostCount,
        leadCount,
        overallEfficiency: totalPosts ? leadCount / totalPosts : 0,
        leadPostEfficiency: leadPostCount ? leadCount / leadPostCount : 0
      };
    })
    .filter((item) => item.totalPosts > 0 || item.leadCount > 0)
    .sort((left, right) => {
      if (right.overallEfficiency !== left.overallEfficiency) return right.overallEfficiency - left.overallEfficiency;
      if (right.leadPostEfficiency !== left.leadPostEfficiency) return right.leadPostEfficiency - left.leadPostEfficiency;
      return right.leadCount - left.leadCount;
    });
}

function renderDashboardPlatformCard(item) {
  return `
    <article class="overview-platform-card overview-platform-card-compact">
      <div class="overview-platform-head">
        <div>
          <h4>${item.platform}</h4>
          <p>总作品 ${item.totalPosts} 条</p>
        </div>
      </div>
      <div class="overview-platform-strip-wrap">
        <div class="overview-platform-strip-label">作品</div>
        <div class="overview-platform-strip" aria-label="${item.platform}作品类型占比">
          ${item.types.map((type) => `
            <div
              class="overview-platform-segment overview-platform-segment-${getDashboardTypeTone(type.type)}"
              style="width:${type.ratio || 0}%"
              title="${type.type} ${type.count} 条，占比 ${type.ratio}%"
            ><span class="overview-segment-count">${type.count}</span></div>
          `).join("")}
        </div>
        <div class="overview-platform-total">${item.totalPosts}条</div>
      </div>
      <div class="overview-platform-footer">
        <span>客资数</span>
        <strong>${item.leadCount}</strong>
      </div>
    </article>
  `;
}

function renderDashboardEmployeeBoard(platform, rows) {
  return `
    <article class="overview-platform-card">
      <div class="overview-platform-head">
        <div>
          <h4>${platform}</h4>
          <p>左侧员工姓名，中间占比，右侧总条数</p>
        </div>
        <span class="tag tag-soft">${rows.length} 人</span>
      </div>
      <div class="overview-type-legend">
        ${POST_TYPES.map((type) => `
          <span class="overview-type-chip overview-type-chip-${getDashboardTypeTone(type)}">${type}</span>
        `).join("")}
      </div>
      <div class="overview-employee-scroll">
        ${rows.length
          ? rows.map((row) => `
            <article class="overview-employee-row">
              <div class="overview-employee-name">
                <strong>${row.name}</strong>
                <span>${row.leadCount} 客资</span>
              </div>
              <div class="overview-employee-strip" title="${row.types.map((item) => `${item.type} ${item.count} 条，占比 ${item.ratio}%`).join("；")}">
                ${row.types.map((item) => `
                  <div
                    class="overview-platform-segment overview-platform-segment-${getDashboardTypeTone(item.type)}"
                    style="width:${item.ratio || 0}%"
                  ><span class="overview-segment-count">${item.count}</span></div>
                `).join("")}
              </div>
              <div class="overview-employee-total">
                <strong>${row.totalPosts}</strong>
                <span>总条数</span>
              </div>
            </article>
          `).join("")
          : `<div class="empty">当前范围暂无员工数据</div>`}
      </div>
    </article>
  `;
}

function renderDashboardEfficiencyBoard(platform, rows) {
  return `
    <article class="overview-platform-card">
      <div class="overview-platform-head">
        <div>
          <h4>${platform}</h4>
          <p>第一个看获客数 / 作品总数，第二个看获客数 / 获客贴数</p>
        </div>
      </div>
      <div class="overview-efficiency-stack">
        ${renderDashboardEfficiencyList("获客效率榜", "客资数 / 作品总数", rows, "overallEfficiency", "totalPosts")}
        ${renderDashboardEfficiencyList("获客贴效率榜", "客资数 / 获客贴数", rows, "leadPostEfficiency", "leadPostCount")}
      </div>
    </article>
  `;
}

function renderDashboardEfficiencyList(title, hint, rows, key, baseKey) {
  return `
    <section class="overview-efficiency-panel">
      <div class="overview-efficiency-head">
        <strong>${title}</strong>
        <span>${hint}</span>
      </div>
      <div class="overview-efficiency-list">
        ${rows.length
          ? rows.map((row, index) => `
            <article class="overview-efficiency-row">
              <span class="overview-efficiency-rank">${index + 1}</span>
              <div class="overview-efficiency-person">
                <strong>${row.name}</strong>
                <span>${baseKey === "totalPosts" ? `总作品 ${row.totalPosts}` : `获客贴 ${row.leadPostCount}`} · 客资 ${row.leadCount}</span>
              </div>
              <strong class="overview-efficiency-value">${row[key].toFixed(2)}</strong>
            </article>
          `).join("")
          : `<div class="empty">当前范围暂无效率数据</div>`}
      </div>
    </section>
  `;
}

function getEmployeePersonalBoardRows(employeeId, month, platform = "", accountId = "") {
  const monthDates = new Set(getMonthDates(month));
  return state.accounts
    .filter((account) => account.employeeId === employeeId)
    .filter((account) => !platform || account.platform === platform)
    .filter((account) => !accountId || account.id === accountId)
    .map((account) => {
      const posts = state.posts.filter((post) => post.accountId === account.id && post.publishedAt && monthDates.has(post.publishedAt));
      const leads = state.leads.filter((lead) => lead.accountId === account.id && monthDates.has(String(lead.createdAt || "").slice(0, 10)));
      const typeCounts = POST_TYPES.reduce((acc, type) => {
        acc[type] = posts.filter((item) => item.postType === type).length;
        return acc;
      }, {});
      const dayMap = Object.fromEntries(getMonthDates(month).map((date) => [date, {
        postCount: 0,
        leadCount: 0,
        typeLabel: "",
        types: []
      }]));
      posts.forEach((post) => {
        if (!dayMap[post.publishedAt]) return;
        dayMap[post.publishedAt].postCount += 1;
        dayMap[post.publishedAt].typeLabel = post.postType || dayMap[post.publishedAt].typeLabel;
        if (post.postType && !dayMap[post.publishedAt].types.includes(post.postType)) {
          dayMap[post.publishedAt].types.push(post.postType);
        }
      });
      leads.forEach((lead) => {
        const leadDate = String(lead.createdAt || "").slice(0, 10);
        if (dayMap[leadDate]) dayMap[leadDate].leadCount += 1;
      });
      const totalPosts = posts.length;
      const totalLeads = leads.length;
      const leadPostCount = typeCounts["获客贴"] || 0;
      return {
        ...account,
        posts,
        leads,
        dayMap,
        typeCounts,
        totalPosts,
        totalLeads,
        leadPostCount,
        overallEfficiency: totalPosts ? totalLeads / totalPosts : 0,
        leadPostEfficiency: leadPostCount ? totalLeads / leadPostCount : 0
      };
    })
    .sort((left, right) => {
      if (right.totalLeads !== left.totalLeads) return right.totalLeads - left.totalLeads;
      if (right.totalPosts !== left.totalPosts) return right.totalPosts - left.totalPosts;
      return String(left.accountName || "").localeCompare(String(right.accountName || ""));
    });
}

function buildPersonalPlatformSummary(rows) {
  const totalPosts = rows.reduce((sum, item) => sum + item.totalPosts, 0);
  const totalLeads = rows.reduce((sum, item) => sum + item.totalLeads, 0);
  const typeCounts = POST_TYPES.reduce((acc, type) => {
    acc[type] = rows.reduce((sum, item) => sum + Number(item.typeCounts?.[type] || 0), 0);
    return acc;
  }, {});
  return {
    totalPosts,
    totalLeads,
    typeCounts,
    ratios: POST_TYPES.map((type) => ({
      type,
      count: typeCounts[type] || 0,
      percent: totalPosts ? Math.round(((typeCounts[type] || 0) / totalPosts) * 100) : 0
    })),
    overallEfficiency: totalPosts ? totalLeads / totalPosts : 0,
    leadPostEfficiency: typeCounts["获客贴"] ? totalLeads / typeCounts["获客贴"] : 0
  };
}

function findMetricAccount(rows, mode, direction = "max") {
  const list = rows.filter((item) => {
    if (mode === "leads") return item.totalPosts > 0;
    if (mode === "overallEfficiency") return item.totalPosts > 0;
    return item.leadPostCount > 0;
  });
  if (!list.length) return null;
  const sorted = [...list].sort((left, right) => {
    const leftValue = mode === "leads" ? left.totalLeads : Number(left[mode] || 0);
    const rightValue = mode === "leads" ? right.totalLeads : Number(right[mode] || 0);
    if (direction === "max") {
      if (rightValue !== leftValue) return rightValue - leftValue;
    } else if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
    return String(left.accountName || "").localeCompare(String(right.accountName || ""));
  });
  return sorted[0];
}

function renderPersonalMetricCard(label, value, hint = "") {
  return `
    <article class="personal-metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
      ${hint ? `<small>${hint}</small>` : ""}
    </article>
  `;
}

function renderPersonalSummaryCard(platform, summary, month) {
  return `
    <section class="panel personal-platform-panel">
      <div class="section-head">
        <h3>${platform}</h3>
        <span class="muted">${month} 作品结构与客资概览</span>
      </div>
      <div class="personal-summary-bar" title="${summary.ratios.map((item) => `${item.type} ${item.count} (${item.percent}%)`).join(" / ")}">
        ${summary.ratios.map((item) => `
          <div class="overview-segment overview-segment-${getPostTypeTone(item.type)}" style="width:${summary.totalPosts ? `${Math.max(item.percent, item.count > 0 ? 8 : 0)}%` : "33.33%"}">
            <strong>${item.count}</strong>
          </div>
        `).join("")}
      </div>
      <div class="overview-legend">
        ${summary.ratios.map((item) => `<span class="legend-item legend-${getPostTypeTone(item.type)}">${item.type} ${item.count} / ${item.percent}%</span>`).join("")}
      </div>
      <div class="personal-summary-footer">
        <span>客资数：${summary.totalLeads}</span>
        <span>总作品：${summary.totalPosts}</span>
      </div>
    </section>
  `;
}

function renderPersonalAccountCard(account, month) {
  const dates = getMonthDates(month);
  const blocked = ["禁言", "违规"].includes(account.status);
  return `
    <article class="personal-account-card">
      <div class="personal-account-head">
        <div class="personal-account-name-wrap">
          <button
            class="personal-account-name ${blocked ? "is-blocked" : ""}"
            type="button"
            title="人设：${escapeHtmlAttribute(account.persona || "未填写")}｜定位：${escapeHtmlAttribute(account.positioning || "未填写")}｜状态：${escapeHtmlAttribute(account.status || "正常")}"
          >
            ${account.accountName || "未命名账号"}
          </button>
          <div class="personal-account-hover-card">
            <span>人设：${account.persona || "未填写"}</span>
            <span>定位：${account.positioning || "未填写"}</span>
            <span>状态：${account.status || "正常"}</span>
          </div>
        </div>
        <div class="personal-account-days-scroll">
          <div class="personal-account-days">
          ${dates.map((date) => `<div class="personal-day-cell">${renderAccountVisualizationCell(account.dayMap[date] || { postCount: 0, leadCount: 0, typeLabel: "", types: [] })}</div>`).join("")}
          </div>
        </div>
      </div>
      <details class="personal-account-plan">
        <summary>发帖规划</summary>
        <div class="personal-account-plan-body">${account.postingPlan || "未填写发帖规划"}</div>
      </details>
    </article>
  `;
}

function getPersonalMetricRankingRows(rows, metricKey) {
  const valueOf = (item) => {
    if (metricKey === "totalLeads") return item.totalLeads || 0;
    if (metricKey === "overallEfficiency") return item.overallEfficiency || 0;
    if (metricKey === "leadPostEfficiency") return item.leadPostEfficiency || 0;
    return 0;
  };
  return [...rows]
    .sort((a, b) => {
      const diff = valueOf(b) - valueOf(a);
      if (diff !== 0) return diff;
      return (b.totalPosts || 0) - (a.totalPosts || 0);
    })
    .filter((item) => {
      if (metricKey === "leadPostEfficiency") {
        return (item.totalPosts || 0) > 0;
      }
      return (item.totalPosts || 0) > 0;
    });
}

function renderPersonalRankingList(title, subtitle, rows, metricKey, formatter) {
  const rankingRows = getPersonalMetricRankingRows(rows, metricKey).slice(0, 8);
  return `
    <div class="personal-analysis-column">
      <h4>${title}</h4>
      <span class="personal-analysis-subtitle">${subtitle}</span>
      <div class="personal-ranking-list">
        ${rankingRows.length ? rankingRows.map((item, index) => `
          <div class="personal-ranking-item">
            <span class="personal-ranking-badge">${index + 1}</span>
            <div class="personal-ranking-account">
              <strong>${item.accountName}</strong>
              <span>${item.totalLeads || 0}客资 · ${item.totalPosts || 0}作品</span>
            </div>
            <span class="personal-ranking-score">${formatter(item)}</span>
          </div>
        `).join("") : `<div class="empty compact">当前暂无可排行账号。</div>`}
      </div>
    </div>
  `;
}

function renderPersonalPlatformAnalysis(platform, rows) {
  const summary = buildPersonalPlatformSummary(rows);
  return `
    <section class="panel personal-platform-panel">
      <div class="section-head">
        <h3>${platform}数据分析</h3>
        <span class="muted">先看整体效率，再看账号榜单排行。</span>
      </div>
      <div class="personal-metric-grid">
        ${renderPersonalMetricCard("获客数", summary.totalLeads)}
        ${renderPersonalMetricCard("获客效率", formatRatio(summary.overallEfficiency), "客资数 / 作品总数")}
        ${renderPersonalMetricCard("获客贴效率", formatRatio(summary.leadPostEfficiency), "客资数 / 获客贴数")}
      </div>
      <div class="personal-analysis-grid">
        ${renderPersonalRankingList("获客数榜", "按账号获客数排行", rows, "totalLeads", (item) => `${item.totalLeads || 0}`)}
        ${renderPersonalRankingList("获客效率榜", "客资数 / 作品总数", rows, "overallEfficiency", (item) => `${formatRatio(item.overallEfficiency)}`)}
        ${renderPersonalRankingList("获客贴效率榜", "客资数 / 获客贴数", rows, "leadPostEfficiency", (item) => `${formatRatio(item.leadPostEfficiency)}`)}
      </div>
    </section>
  `;
}

function renderPersonalWorkloadPanel(platform, employeeId, month) {
  const today = new Date().toLocaleDateString("en-CA");
  const weekDates = new Set(getDatesInWeek(getCurrentWeekString()));
  const monthDates = new Set(getMonthDates(month));
  const rows = state.posts.filter((post) => post.employeeId === employeeId && post.platform === platform);
  const todayCount = rows.filter((post) => post.publishedAt === today).length;
  const weekCount = rows.filter((post) => weekDates.has(post.publishedAt)).length;
  const monthCount = rows.filter((post) => monthDates.has(post.publishedAt)).length;
  return `
    <section class="panel personal-platform-panel">
      <div class="section-head">
        <h3>${platform}工作量</h3>
        <span class="muted">按今日、本周、本月看更新作品数。</span>
      </div>
      <div class="personal-metric-grid">
        ${renderPersonalMetricCard("今日更新作品数", todayCount)}
        ${renderPersonalMetricCard("本周更新作品数", weekCount)}
        ${renderPersonalMetricCard("本月更新作品数", monthCount)}
      </div>
    </section>
  `;
}

function getCurrentUserEmployee() {
  const userEmployeeId = state.user?.employeeId || "";
  const userEmployeeName = state.user?.employeeName || "";
  return state.employees.find((item) => item.id === userEmployeeId)
    || state.employees.find((item) => item.name === userEmployeeName)
    || state.employees.find((item) => {
      const hasAccount = state.accounts.some((account) => account.employeeId === item.id && item.id === userEmployeeId);
      const hasPost = state.posts.some((post) => post.employeeId === item.id && item.id === userEmployeeId);
      const hasLead = state.leads.some((lead) => lead.employeeId === item.id && item.id === userEmployeeId);
      return hasAccount || hasPost || hasLead;
    })
    || state.employees.find((item) => {
      const hasAccount = userEmployeeName && state.accounts.some((account) => account.employeeId === item.id && account.employeeName === userEmployeeName);
      const hasPost = userEmployeeName && state.posts.some((post) => post.employeeId === item.id && post.employeeName === userEmployeeName);
      const hasLead = userEmployeeName && state.leads.some((lead) => lead.employeeId === item.id && lead.employeeName === userEmployeeName);
      return hasAccount || hasPost || hasLead;
    })
    || null;
}

function renderPersonalBoard(options = {}) {
  const lockedEmployeeId = options.lockedEmployeeId || "";
  const employeeId = lockedEmployeeId || state.personalBoardEmployeeId || state.employees[0]?.id || "";
  if (!lockedEmployeeId && !state.personalBoardEmployeeId && employeeId) {
    state.personalBoardEmployeeId = employeeId;
  }
  const employee = state.employees.find((item) => item.id === employeeId);
  const selectedPlatform = state.personalBoardPlatform || "小红书";
  const accountFilter = state.personalBoardAccountFilter || "";
  const xhsRows = getEmployeePersonalBoardRows(employeeId, state.personalBoardMonth, "小红书", accountFilter);
  const douyinRows = getEmployeePersonalBoardRows(employeeId, state.personalBoardMonth, "抖音", accountFilter);
  const selectedRows = getEmployeePersonalBoardRows(employeeId, state.personalBoardMonth, selectedPlatform, accountFilter);
  const accountOptions = state.accounts.filter((item) => item.employeeId === employeeId);
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>个人看板</h2>
        <p class="page-desc">${options.selfOnly ? "这里只看你自己的小红书和抖音数据，方便回看账号更新、获客效率和本月工作量。" : "先看员工在小红书和抖音的作品结构，再看账号更新、获客效率和本月工作量。"}</p>
      </div>
      <div class="toolbar toolbar-end">
        ${options.selfOnly
          ? `<span class="tag tag-soft">${employee?.name || state.user?.employeeName || state.user?.username || "当前员工"}</span>`
          : `
            <select id="personalBoardEmployeeInput">
              ${state.employees.map((item) => `<option value="${item.id}" ${employeeId === item.id ? "selected" : ""}>${item.name}</option>`).join("")}
            </select>
          `}
      </div>
    </div>
    <div class="panel">
      <div class="filters filters-toolbar">
        <input id="personalBoardMonthInput" type="month" value="${state.personalBoardMonth}" />
        ${renderTimeQuickActions("personal-board-month", [
          { action: "this-month", label: "本月" },
          { action: "last-month", label: "上月" }
        ])}
      </div>
    </div>
    ${renderViewContext()}
    <section class="personal-board-grid">
      ${renderPersonalSummaryCard("小红书", buildPersonalPlatformSummary(xhsRows), state.personalBoardMonth)}
      ${renderPersonalSummaryCard("抖音", buildPersonalPlatformSummary(douyinRows), state.personalBoardMonth)}
    </section>
    <section class="personal-board-grid personal-board-grid-single">
      <section class="panel personal-platform-panel">
        <div class="section-head">
          <h3>${selectedPlatform}账号信息</h3>
          <div class="section-head-actions">
            <span class="muted">${employee?.name || "该员工"} · ${state.personalBoardMonth}</span>
            <select id="personalBoardPlatformInput" class="personal-account-filter-select">
              <option value="小红书" ${selectedPlatform === "小红书" ? "selected" : ""}>小红书</option>
              <option value="抖音" ${selectedPlatform === "抖音" ? "selected" : ""}>抖音</option>
            </select>
            <select class="personal-account-filter-select js-personal-account-filter">
              <option value="">下拉选择账号</option>
              ${accountOptions.filter((item) => item.platform === selectedPlatform).map((item) => `<option value="${item.id}" ${accountFilter === item.id ? "selected" : ""}>${item.accountName}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="personal-account-list">
          ${selectedRows.length ? selectedRows.map((item) => renderPersonalAccountCard(item, state.personalBoardMonth)).join("") : `<div class="empty">当前筛选下暂无${selectedPlatform}账号数据。</div>`}
        </div>
      </section>
    </section>
    <section class="personal-board-grid">
      ${renderPersonalPlatformAnalysis("小红书", xhsRows)}
      ${renderPersonalPlatformAnalysis("抖音", douyinRows)}
    </section>
    <section class="personal-board-grid">
      ${renderPersonalWorkloadPanel("小红书", employeeId, state.personalBoardMonth)}
      ${renderPersonalWorkloadPanel("抖音", employeeId, state.personalBoardMonth)}
    </section>
  `;
}

function renderStaffPersonalBoard() {
  const employee = getCurrentUserEmployee()
    || (state.accounts[0]?.employeeId ? state.employees.find((item) => item.id === state.accounts[0].employeeId) : null)
    || (state.posts[0]?.employeeId ? state.employees.find((item) => item.id === state.posts[0].employeeId) : null)
    || (state.leads[0]?.employeeId ? state.employees.find((item) => item.id === state.leads[0].employeeId) : null)
    || (state.accounts[0]?.employeeName ? state.employees.find((item) => item.name === state.accounts[0].employeeName) : null)
    || (state.posts[0]?.employeeName ? state.employees.find((item) => item.name === state.posts[0].employeeName) : null)
    || (state.leads[0]?.employeeName ? state.employees.find((item) => item.name === state.leads[0].employeeName) : null);
  const lockedEmployeeId = employee?.id
    || state.accounts[0]?.employeeId
    || state.posts[0]?.employeeId
    || state.leads[0]?.employeeId
    || "";
  if (!lockedEmployeeId) {
    return renderEmptyState("当前还没有可展示的个人数据", "先录入账号、作品或客资后，这里会自动按你自己的数据生成个人看板。");
  }
  return renderPersonalBoard({
    lockedEmployeeId,
    selfOnly: true
  });
}

function getDashboardTypeTone(type) {
  if (type === "素人贴") return "people";
  if (type === "话题贴") return "topic";
  return "lead";
}

function renderRankings() {
  const rankingRows = getRankingRows(state.rankingsMode, state.rankingsType);
  const metricLabel = state.rankingsType === "leads" ? "客资" : "发布";
  const topThree = rankingRows.slice(0, 3);
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>排行榜</h2>
        <p class="page-desc">先看谁真正把客资做出来，再决定今天重点跟谁学获客动作。</p>
      </div>
      <div class="toolbar">
        ${renderAdminRefreshButton()}
        <button class="ghost rank-switch ${state.rankingsType === "leads" ? "active-filter" : ""}" data-type="leads">客资排行</button>
        <button class="ghost rank-switch ${state.rankingsType === "posts" ? "active-filter" : ""}" data-type="posts">发布排行</button>
      </div>
    </div>
    <div class="panel">
      <div class="filters filters-toolbar">
        <select id="rankingsModeInput">
          <option value="day" ${state.rankingsMode === "day" ? "selected" : ""}>按天</option>
          <option value="week" ${state.rankingsMode === "week" ? "selected" : ""}>按周</option>
          <option value="month" ${state.rankingsMode === "month" ? "selected" : ""}>按月</option>
          <option value="all" ${state.rankingsMode === "all" ? "selected" : ""}>累计到今天</option>
        </select>
        ${state.rankingsMode === "day"
          ? `<input id="rankingsDateInput" type="date" value="${state.rankingsDate}" />`
          : ""}
        ${state.rankingsMode === "week"
          ? `<input id="rankingsWeekInput" type="week" value="${state.rankingsWeek}" />`
          : ""}
        ${state.rankingsMode === "month"
          ? `<input id="rankingsMonthInput" type="month" value="${state.rankingsMonth}" />`
          : ""}
      </div>
    </div>
    <section class="panel">
      <div class="section-head">
        <h3>当前榜单重点</h3>
        <span class="muted">先看谁真正把${metricLabel}做出来，再决定今天重点跟谁学动作。</span>
      </div>
      <div class="ranking-podium-grid">
        ${topThree.map((item, index) => {
          const badgeClass = index === 0 ? "ranking-podium-gold" : index === 1 ? "ranking-podium-silver" : "ranking-podium-bronze";
          const mainMetric = state.rankingsType === "leads" ? item.todayLeads : item.todayPosts;
          return `
            <article class="ranking-podium-card ranking-podium ${badgeClass}">
              <span class="ranking-podium-rank">第 ${index + 1} 名</span>
              <strong>${item.name}</strong>
              <p>${metricLabel}数 ${mainMetric}，发布 ${item.todayPosts}，获客贴 ${item.leadPostCount}</p>
              ${renderAdminRankingActions(item)}
            </article>
          `;
        }).join("")}
        <article class="ranking-podium-card">
          <span class="ranking-podium-rank">当前主指标</span>
          <strong>${metricLabel}</strong>
          <p>${rankingRows.length} 位运营进入当前统计范围</p>
        </article>
      </div>
    </section>
    <div class="panel">
      ${renderRankingTable(rankingRows)}
    </div>
  `;
}

function renderAdminRankingActions(item) {
  if (state.user?.role !== "admin" && state.user?.role !== "owner") return "";
  const payload = buildReviewPayloadFromEmployee(item);
  const period = getCurrentAdminPeriodContext();
  return `
    <div class="dashboard-short-actions">
      <button class="ghost js-open-posts-context" data-employee="${escapeHtmlAttribute(item.employeeId || "")}" data-mode="${escapeHtmlAttribute(period.mode || "day")}" data-date="${escapeHtmlAttribute(period.date || "")}" data-week="${escapeHtmlAttribute(period.week || "")}" type="button">看作品</button>
      <button class="ghost js-open-leads-context" data-employee="${escapeHtmlAttribute(item.employeeId || "")}" data-mode="${escapeHtmlAttribute(period.mode || "day")}" data-date="${escapeHtmlAttribute(period.date || "")}" data-week="${escapeHtmlAttribute(period.week || "")}" type="button">看客资</button>
      <button class="ghost js-open-account-viz-context" data-employee="${escapeHtmlAttribute(item.employeeId || "")}" data-month="${escapeHtmlAttribute(period.month || "")}" type="button">看账号节奏</button>
      ${renderReviewActionButtons(payload)}
    </div>
  `;
}

function renderRankingTable(rows) {
  if (!rows.length) return `<div class="empty">暂无排行数据</div>`;
  const metricKey = state.rankingsType === "leads" ? "todayLeads" : "todayPosts";
  const metricLabel = state.rankingsType === "leads" ? "客资数" : "发布数";
  const metricHint = state.rankingsType === "leads"
    ? "先看谁真正把客资做出来，再对照发布量和获客贴量。"
    : "先看谁动作最多，再对照获客贴和客资结果。";
  return `
    <div class="table-wrap ranking-table">
      <div class="ranking-table-head">
        <div>
          <strong>完整榜单</strong>
          <p>${metricHint}</p>
        </div>
        <span class="ranking-table-focus">当前主指标：${metricLabel}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>运营</th>
            <th>平台作品</th>
            <th>获客贴</th>
            <th class="${metricKey === "todayPosts" ? "ranking-col-active" : ""}">发布</th>
            <th class="${metricKey === "todayLeads" ? "ranking-col-active" : ""}">客资</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr class="${item.rank <= 3 ? "ranking-row-top" : ""}">
              <td><span class="ranking-badge ranking-badge-${Math.min(item.rank, 3)}">${item.rank}</span></td>
              <td>
                <div class="ranking-person-cell">
                  <strong>${item.name}</strong>
                  <span>名下 ${item.accountCount} 个账号</span>
                </div>
              </td>
              <td>
                <div class="ranking-platform-split">
                  <span>抖音 ${item.douyinPosts}</span>
                  <span>小红书 ${item.xhsPosts}</span>
                </div>
              </td>
              <td class="ranking-count-cell">${item.leadPostCount}</td>
              <td class="${metricKey === "todayPosts" ? "ranking-metric-cell" : ""}">${item.todayPosts}</td>
              <td class="${metricKey === "todayLeads" ? "ranking-metric-cell" : ""}">${item.todayLeads}</td>
              <td>${renderAdminRankingActions(item)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPostsMonitor() {
  const visibleAccounts = state.accounts.filter((account) => {
    if (state.postMonitorEmployeeFilter && account.employeeId !== state.postMonitorEmployeeFilter) return false;
    if (state.postMonitorPlatformFilter && account.platform !== state.postMonitorPlatformFilter) return false;
    return true;
  });
  const rows = getPostsForMonitor()
    .filter((item) => {
      if (state.postMonitorEmployeeFilter && item.employeeId !== state.postMonitorEmployeeFilter) return false;
      if (state.postMonitorTypeFilter && item.postType !== state.postMonitorTypeFilter) return false;
      if (state.postMonitorPlatformFilter && item.platform !== state.postMonitorPlatformFilter) return false;
      if (state.postMonitorAccountFilter && item.accountId !== state.postMonitorAccountFilter) return false;
      return true;
    })
    .sort((left, right) => {
      if (state.postMonitorSort === "leads") {
        const leadDiff = getLeadCountForPost(right) - getLeadCountForPost(left);
        if (leadDiff !== 0) return leadDiff;
      }
      return new Date(right.publishedAt || right.createdAt || 0) - new Date(left.publishedAt || left.createdAt || 0);
    });
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>作品看板</h2>
        <p class="page-desc">右上方按时间、平台、员工、账号筛选；下方用卡片查看封面、文案、账号信息、获客数和主管建议。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${getPostMonitorLabel()}</span>
        ${renderAdminRefreshButton()}
      </div>
    </div>
    <div class="panel">
      <div class="filters filters-toolbar">
        <select id="postMonitorModeInput">
          <option value="day" ${state.postMonitorMode === "day" ? "selected" : ""}>按天</option>
          <option value="week" ${state.postMonitorMode === "week" ? "selected" : ""}>按周</option>
          <option value="month" ${state.postMonitorMode === "month" ? "selected" : ""}>按月</option>
        </select>
        ${state.postMonitorMode === "day"
          ? `<input id="postMonitorDateInput" type="date" value="${state.postMonitorDate}" />`
          : ""}
        ${state.postMonitorMode === "week"
          ? `<input id="postMonitorWeekInput" type="week" value="${state.postMonitorWeek}" />`
          : ""}
        ${state.postMonitorMode === "month"
          ? `<input id="postMonitorMonthInput" type="month" value="${state.postMonitorMonth}" />`
          : ""}
        <select id="postMonitorPlatformFilter">
          <option value="">全部平台</option>
          ${["小红书", "抖音"].map((item) => `<option value="${item}" ${state.postMonitorPlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="postMonitorEmployeeFilter">
          <option value="">全部账号所属人</option>
          ${state.employees.map((item) => `<option value="${item.id}" ${state.postMonitorEmployeeFilter === item.id ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
        <select id="postMonitorAccountFilter">
          <option value="">全部所属账号</option>
          ${visibleAccounts.map((item) => `<option value="${item.id}" ${state.postMonitorAccountFilter === item.id ? "selected" : ""}>${item.accountName} · ${item.platform}</option>`).join("")}
        </select>
        <select id="postMonitorSortInput">
          <option value="time" ${state.postMonitorSort === "time" ? "selected" : ""}>按时间排序</option>
          <option value="leads" ${state.postMonitorSort === "leads" ? "selected" : ""}>按客资排序</option>
        </select>
        ${renderTimeQuickActions("post-monitor", [
          { action: "today", label: "今天" },
          { action: "week", label: "本周" },
          { action: "month", label: "本月" }
        ])}
      </div>
    </div>
    ${renderViewContext()}
    <div class="posts-monitor-grid">
      ${rows.length ? rows.map(renderPostMonitorCard).join("") : `<div class="empty">这一天没有符合条件的帖子。</div>`}
    </div>
  `;
}

function renderPostMonitorCard(item) {
  const canEditSuggestion = state.user?.role === "admin" || state.user?.role === "owner";
  const copywriting = item.copywriting || item.title || "暂无作品文案";
  return `
    <article class="post-monitor-card post-board-card">
      <div class="post-monitor-cover">
        ${item.coverImageUrl ? `<button class="image-trigger js-open-image" data-src="${item.coverImageUrl}" type="button"><img src="${item.coverImageUrl}" alt="${item.title}" class="post-monitor-image" /></button>` : `<div class="post-monitor-placeholder">暂无封面</div>`}
      </div>
      <div class="post-monitor-body post-board-copy">
        <span class="mini-tag">作品文案</span>
        <h3>${item.title || "未命名作品"}</h3>
        <p class="post-board-copywriting">${escapeHtml(copywriting)}</p>
      </div>
      <div class="post-monitor-body post-board-meta">
        <div class="post-monitor-tags">
          <span class="tag tag-soft">${item.accountName || "未绑定账号"}</span>
          <span class="tag">${item.platform || "-"}</span>
          <span class="tag tag-warm">${item.postType || "-"}</span>
        </div>
        <div class="post-monitor-meta">
          <span>所属运营：${item.employeeName || "-"}</span>
          <span>账号名：${item.accountName || "-"}</span>
          <span>发布时间：${item.publishedAt || "-"}</span>
          <span>获客数：${getLeadCountForPost(item)}</span>
          <span>平台：${item.platform || "-"}</span>
          <span>帖子类型：${item.postType || "-"}</span>
        </div>
        <div class="post-board-plan">
          <span class="mini-tag">账号规划</span>
          <div class="post-board-plan-readonly">${item.postingPlan ? escapeHtml(item.postingPlan) : "暂未填写账号规划"}</div>
        </div>
        ${item.postUrl ? `<div class="post-monitor-link">${renderExternalLink(item.postUrl, "打开原帖")}</div>` : ""}
      </div>
      <div class="post-monitor-body post-board-suggestion">
        <span class="mini-tag">主管建议</span>
        ${canEditSuggestion
          ? `
            <textarea class="post-board-suggestion-input" data-id="${item.id}" placeholder="输入这条作品的建议，员工端会同步看到。">${escapeHtml(item.supervisorSuggestion || "")}</textarea>
            <button class="primary js-save-post-suggestion" data-id="${item.id}" type="button">保存建议</button>
          `
          : `
            <div class="post-board-suggestion-readonly">${item.supervisorSuggestion ? escapeHtml(item.supervisorSuggestion) : "主管暂未填写建议"}</div>
          `}
      </div>
    </article>
  `;
}

function getMonthDates(monthString) {
  if (!monthString) return [];
  const [year, month] = String(monthString).split("-").map(Number);
  if (!year || !month) return [];
  const lastDay = new Date(year, month, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => `${monthString}-${String(index + 1).padStart(2, "0")}`);
}

function getAccountVisualizationRows() {
  const dates = new Set(getMonthDates(state.accountVizMonth));
  const visibleAccounts = state.accounts.filter((account) => {
    if (state.accountVizEmployeeFilter && account.employeeId !== state.accountVizEmployeeFilter) return false;
    if (state.accountVizPlatformFilter && account.platform !== state.accountVizPlatformFilter) return false;
    return true;
  });

  return visibleAccounts.map((account) => {
    const posts = state.posts.filter((post) => {
      if (post.accountId !== account.id) return false;
      if (!post.publishedAt || !dates.has(post.publishedAt)) return false;
      return true;
    });
    const leads = state.leads.filter((lead) => {
      if (lead.accountId !== account.id) return false;
      const leadDate = String(lead.createdAt || "").slice(0, 10);
      return leadDate && dates.has(leadDate);
    });
    const typeCounts = POST_TYPES.reduce((acc, type) => {
      acc[type] = posts.filter((item) => item.postType === type).length;
      return acc;
    }, {});
    const dayMap = Object.fromEntries(getMonthDates(state.accountVizMonth).map((date) => [date, {
      postCount: 0,
      leadPostCount: 0,
      leadCount: 0,
      typeLabel: "",
      types: []
    }]));
    posts.forEach((post) => {
      if (!dayMap[post.publishedAt]) return;
      dayMap[post.publishedAt].postCount += 1;
      if (post.postType === "获客贴") {
        dayMap[post.publishedAt].leadPostCount += 1;
      }
      dayMap[post.publishedAt].typeLabel = post.postType || dayMap[post.publishedAt].typeLabel;
      if (post.postType && !dayMap[post.publishedAt].types.includes(post.postType)) {
        dayMap[post.publishedAt].types.push(post.postType);
      }
    });
    leads.forEach((lead) => {
      const leadDate = String(lead.createdAt || "").slice(0, 10);
      if (!dayMap[leadDate]) return;
      dayMap[leadDate].leadCount += 1;
    });
    return {
      ...account,
      totalPosts: posts.length,
      totalLeads: leads.length,
      activeDays: Object.values(dayMap).filter((item) => item.postCount > 0).length,
      typeCounts,
      dayMap
    };
  }).sort((left, right) => {
    if (right.totalLeads !== left.totalLeads) return right.totalLeads - left.totalLeads;
    if (right.totalPosts !== left.totalPosts) return right.totalPosts - left.totalPosts;
    return String(left.accountName || "").localeCompare(String(right.accountName || ""));
  });
}

function renderAccountVisualizationCell(entry) {
  const types = entry.types || [];
  if (!entry.postCount && !entry.leadCount) {
    return `<div class="dashboard-activity-dot dashboard-activity-dot-empty" title="未更新"></div>`;
  }
  if (types.length > 1) {
    return `
      <div class="dashboard-activity-stack" title="同日多类型更新，客资 ${entry.leadCount}">
        <div class="dashboard-activity-dot dashboard-activity-dot-multi"></div>
        ${entry.leadCount > 0 ? `<span class="dashboard-activity-lead-count">${entry.leadCount}</span>` : ""}
      </div>
    `;
  }
  const typeClassMap = {
    "素人贴": "dashboard-activity-dot-people",
    "话题贴": "dashboard-activity-dot-topic",
    "获客贴": "dashboard-activity-dot-lead"
  };
  return `
    <div class="dashboard-activity-stack" title="${types[0] || "有更新"} · 客资 ${entry.leadCount}">
      <div class="dashboard-activity-dot ${typeClassMap[types[0]] || "dashboard-activity-dot-lead"}"></div>
      ${entry.leadCount > 0 ? `<span class="dashboard-activity-lead-count">${entry.leadCount}</span>` : ""}
    </div>
  `;
}

function renderAccountVisualization() {
  const rows = getAccountVisualizationRows();
  if (state.accountVizSelectedAccountId && !rows.some((item) => item.id === state.accountVizSelectedAccountId)) {
    state.accountVizSelectedAccountId = "";
  }
  const selectedRow = rows.find((item) => item.id === state.accountVizSelectedAccountId) || null;
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>分析看板</h2>
        <p class="page-desc">按员工、平台、账号和月份聚焦看重点账号趋势，同时补回每日作品和获客贴对照客资的变化。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${state.accountVizMonth}</span>
        ${renderAdminRefreshButton()}
      </div>
    </div>
    ${renderViewContext()}
    <div class="panel">
      <div class="filters filters-toolbar">
        <input id="accountVizMonthInput" type="month" value="${state.accountVizMonth}" />
        <select id="accountVizEmployeeFilter">
          <option value="">全部员工</option>
          ${state.employees.map((item) => `<option value="${item.id}" ${state.accountVizEmployeeFilter === item.id ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
        <select id="accountVizPlatformFilter">
          <option value="">全部平台</option>
          ${["小红书", "抖音"].map((item) => `<option value="${item}" ${state.accountVizPlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="accountVizAccountFilter">
          <option value="">全部账号趋势</option>
          ${rows.map((item) => `<option value="${item.id}" ${state.accountVizSelectedAccountId === item.id ? "selected" : ""}>${item.accountName || "未命名账号"} · ${item.employeeName || "-"}</option>`).join("")}
        </select>
        ${renderTimeQuickActions("account-viz-month", [
          { action: "this-month", label: "本月" },
          { action: "last-month", label: "上月" }
        ])}
      </div>
    </div>
    <section class="panel">
      <div class="section-head">
        <h3>重点账号客资趋势图</h3>
        <span class="muted">${selectedRow ? `当前查看 ${selectedRow.accountName} 的客资趋势和每日内容类型。` : "默认显示总客资趋势和客资最多的前 5 个账号，避免整张图太乱。点击矩阵中的账号或使用上方定位，会切到该账号趋势。"}</span>
      </div>
      <div id="accountVizChart" class="chart-box"></div>
    </section>
    <section class="panel">
      <div class="section-head section-head-inline">
        <div>
          <h3>平台对照图</h3>
        </div>
        <div class="section-head-actions">
          <select id="accountVizComparePlatformFilter">
            <option value="" ${state.accountVizComparePlatformFilter === "" ? "selected" : ""}>全平台</option>
            ${["抖音", "小红书"].map((item) => `<option value="${item}" ${state.accountVizComparePlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="grid-2 analytics-grid">
        <div>
          <div class="section-head section-head-single">
            <h3>每日作品数 vs 每日客资数</h3>
          </div>
          <div id="accountVizPostsVsLeadsChart" class="chart-box"></div>
        </div>
        <div>
          <div class="section-head section-head-single">
            <h3>每日获客贴数 vs 每日客资数</h3>
          </div>
          <div id="accountVizLeadPostsVsLeadsChart" class="chart-box"></div>
        </div>
      </div>
    </section>
  `;
}

function renderAccountVizChart() {
  const chartEl = document.getElementById("accountVizChart");
  const postsVsLeadsEl = document.getElementById("accountVizPostsVsLeadsChart");
  const leadPostsVsLeadsEl = document.getElementById("accountVizLeadPostsVsLeadsChart");
  if (!chartEl || !postsVsLeadsEl || !leadPostsVsLeadsEl || typeof window.echarts === "undefined") return;
  const dates = getMonthDates(state.accountVizMonth);
  const rows = getAccountVisualizationRows();
  const selectedRow = rows.find((item) => item.id === state.accountVizSelectedAccountId) || null;
  const chart = window.echarts.getInstanceByDom(chartEl) || window.echarts.init(chartEl);
  const postsVsLeadsChart = window.echarts.getInstanceByDom(postsVsLeadsEl) || window.echarts.init(postsVsLeadsEl);
  const leadPostsVsLeadsChart = window.echarts.getInstanceByDom(leadPostsVsLeadsEl) || window.echarts.init(leadPostsVsLeadsEl);
  const xAxisData = dates.map((date) => date.slice(8));
  const compareRows = state.accountVizComparePlatformFilter
    ? rows.filter((item) => item.platform === state.accountVizComparePlatformFilter)
    : rows;
  const baseOption = {
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 28, top: 48, bottom: 34 },
    xAxis: { type: "category", data: xAxisData },
    yAxis: [{ type: "value", minInterval: 1 }],
    legend: { top: 0 }
  };
  const totals = dates.map((date) => rows.reduce((sum, item) => sum + Number(item.dayMap?.[date]?.leadCount || 0), 0));
  const postsSeries = dates.map((date) => compareRows.reduce((sum, item) => sum + Number(item.dayMap?.[date]?.postCount || 0), 0));
  const leadPostsSeries = dates.map((date) => compareRows.reduce((sum, item) => sum + Number(item.dayMap?.[date]?.leadPostCount || 0), 0));
  const leadsSeries = dates.map((date) => compareRows.reduce((sum, item) => sum + Number(item.dayMap?.[date]?.leadCount || 0), 0));
  const compareBaseOption = {
    ...baseOption,
    color: ["#4d6fd6", "#ef6a6a"],
    legend: { top: 0, data: ["客资数"] }
  };
  if (!selectedRow) {
    const topRows = rows.slice(0, 5);
    chart.setOption({
      ...baseOption,
      color: ["#4d6fd6", "#8ac36d", "#f6b93b", "#ef6a6a", "#74b9ff", "#2e9b64"],
      legend: { top: 0, data: ["全部账号总客资", ...topRows.map((item) => item.accountName || "未命名账号")] },
      series: [
        {
          name: "全部账号总客资",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: { width: 4 },
          data: totals
        },
        ...topRows.map((item) => ({
          name: item.accountName || "未命名账号",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          data: dates.map((date) => Number(item.dayMap?.[date]?.leadCount || 0))
        }))
      ]
    }, true);
  } else {
    const typeLevels = { "素人贴": 1, "话题贴": 2, "获客贴": 3 };
    chart.setOption({
      ...baseOption,
      color: ["#4d6fd6", "#6fbf73", "#f2b134", "#f57c33"],
      legend: { top: 0, data: ["客资数", "素人贴", "话题贴", "获客贴"] },
      yAxis: [
        { type: "value", minInterval: 1, name: "客资" },
        { type: "value", min: 0, max: 4, show: false }
      ],
      series: [
        {
          name: "客资数",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: { width: 4 },
          data: leadsSeries
        },
        ...POST_TYPES.map((type) => ({
          name: type,
          type: "scatter",
          symbol: "rect",
          symbolSize: 12,
          yAxisIndex: 1,
          data: dates.map((date, index) => {
            const dayTypes = selectedRow.dayMap?.[date]?.types || [];
            return dayTypes.includes(type) ? [index, typeLevels[type]] : [index, null];
          })
        }))
      ]
    }, true);
  }
  postsVsLeadsChart.setOption({
    ...compareBaseOption,
    color: ["#4d6fd6", "#ef6a6a"],
    legend: { top: 0, data: ["作品数", "客资数"] },
    series: [
      {
        name: "作品数",
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 8,
        data: postsSeries
      },
      {
        name: "客资数",
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 8,
        data: leadsSeries
      }
    ]
  }, true);
  leadPostsVsLeadsChart.setOption({
    ...compareBaseOption,
    color: ["#f2b134", "#ef6a6a"],
    legend: { top: 0, data: ["获客贴数", "客资数"] },
    series: [
      {
        name: "获客贴数",
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 8,
        data: leadPostsSeries
      },
      {
        name: "客资数",
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 8,
        data: leadsSeries
      }
    ]
  }, true);
}

function renderPostsTable(rows) {
  if (!rows.length) return `<div class="empty">暂无作品数据</div>`;
  const actionButtons = (item) => {
    const buttons = [
      `<button class="ghost js-edit-post" data-id="${item.id}">编辑</button>`,
      `<button class="ghost danger js-delete-post" data-id="${item.id}">删除</button>`
    ];
    return `<div class="actions">${buttons.join("")}</div>`;
  };
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>封面</th><th>标题</th><th>账号</th><th>员工</th><th>平台</th><th>类型</th><th>发布时间</th><th>点赞</th><th>评论</th><th>互动更新时间</th><th>链接</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${rows.map((item) => `<tr><td>${item.coverImageUrl ? `<button class="image-trigger image-trigger-inline js-open-image" data-src="${item.coverImageUrl}" type="button"><img class="cover-thumb" src="${item.coverImageUrl}" alt="封面" /></button>` : ""}</td><td>${item.title}</td><td>${item.accountName}</td><td>${item.employeeName}</td><td>${item.platform}</td><td>${item.postType}</td><td>${item.publishedAt}</td><td>${Number(item.likes || 0)}</td><td>${Number(item.comments || 0)}</td><td>${item.metricsUpdatedAt ? formatDate(item.metricsUpdatedAt) : "未抓取"}</td><td>${item.postUrl ? renderExternalLink(item.postUrl, "打开") : ""}</td><td>${actionButtons(item)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLeadsMonitor() {
  const rows = getLeadsForMonitor().filter((item) => {
    if (state.leadMonitorEmployeeFilter && item.employeeId !== state.leadMonitorEmployeeFilter) return false;
    if (state.leadMonitorAccountFilter && item.accountId !== state.leadMonitorAccountFilter) return false;
    if (state.leadMonitorPlatformFilter && item.platform !== state.leadMonitorPlatformFilter) return false;
    if (state.leadMonitorPostTypeFilter && item.sourcePostType !== state.leadMonitorPostTypeFilter) return false;
    if (state.leadMonitorStatusFilter && item.status !== state.leadMonitorStatusFilter) return false;
    return true;
  });
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>客资看板</h2>
        <p class="page-desc">按日期、平台、所属运营和账号筛选，下面直接看每条客资的处理进度、提醒动作和来源作品。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${getLeadMonitorLabel()}</span>
        ${renderAdminRefreshButton()}
      </div>
    </div>
    <div class="panel">
      <div class="filters filters-toolbar">
        <select id="leadMonitorModeInput">
          <option value="day" ${state.leadMonitorMode === "day" ? "selected" : ""}>按天</option>
          <option value="week" ${state.leadMonitorMode === "week" ? "selected" : ""}>按周</option>
        </select>
        ${state.leadMonitorMode === "day"
          ? `<input id="leadMonitorDateInput" type="date" value="${state.leadMonitorDate}" />`
          : `<input id="leadMonitorWeekInput" type="week" value="${state.leadMonitorWeek}" />`}
        <select id="leadMonitorEmployeeFilter">
          <option value="">全部所属人</option>
          ${state.employees.map((item) => `<option value="${item.id}" ${state.leadMonitorEmployeeFilter === item.id ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
        <select id="leadMonitorAccountFilter">
          <option value="">全部账号</option>
          ${state.accounts
            .filter((item) => !state.leadMonitorEmployeeFilter || item.employeeId === state.leadMonitorEmployeeFilter)
            .filter((item) => !state.leadMonitorPlatformFilter || item.platform === state.leadMonitorPlatformFilter)
            .map((item) => `<option value="${item.id}" ${state.leadMonitorAccountFilter === item.id ? "selected" : ""}>${item.accountName} · ${item.platform}</option>`)
            .join("")}
        </select>
        <select id="leadMonitorPlatformFilter">
          <option value="">全部平台</option>
          ${["小红书", "抖音"].map((item) => `<option value="${item}" ${state.leadMonitorPlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="leadMonitorPostTypeFilter">
          <option value="">全部作品类型</option>
          ${POST_TYPES.map((item) => `<option value="${item}" ${state.leadMonitorPostTypeFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="leadMonitorStatusFilter">
          <option value="">全部状态</option>
          ${["新客资", "跟进中", "已成交", "无效"].map((item) => `<option value="${item}" ${state.leadMonitorStatusFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        ${renderTimeQuickActions("lead-monitor", [
          { action: "today", label: "今天" },
          { action: "week", label: "本周" }
        ])}
      </div>
    </div>
    ${renderViewContext()}
    <div class="leads-monitor-grid">
      ${rows.length ? rows.map(renderLeadMonitorCard).join("") : `<div class="empty">暂无符合条件的客资。</div>`}
    </div>
  `;
}

function renderSalesLeads() {
  const rows = getLeadsForMonitor().filter((item) => {
    if ((item.addStatus || "未添加") === "已添加") return false;
    if (state.leadMonitorEmployeeFilter && item.employeeId !== state.leadMonitorEmployeeFilter) return false;
    if (state.leadMonitorAccountFilter && item.accountId !== state.leadMonitorAccountFilter) return false;
    if (state.leadMonitorPlatformFilter && item.platform !== state.leadMonitorPlatformFilter) return false;
    if (state.leadMonitorPostTypeFilter && item.sourcePostType !== state.leadMonitorPostTypeFilter) return false;
    if (state.leadMonitorStatusFilter && item.status !== state.leadMonitorStatusFilter) return false;
    return true;
  });
  const pendingUnreceivedCount = rows.filter((item) => (item.processStatus || "未接") !== "已接").length;
  const pendingUnaddedCount = rows.filter((item) => (item.addStatus || "未添加") !== "已添加").length;
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>客资看板</h2>
        <p class="page-desc">按日期、平台、所属运营和账号筛选，下面直接看每条客资的处理进度、来源作品和销售反馈。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${getLeadMonitorLabel()}</span>
      </div>
    </div>
    <div class="panel">
      <div class="filters filters-toolbar">
        <select id="leadMonitorModeInput">
          <option value="day" ${state.leadMonitorMode === "day" ? "selected" : ""}>按天</option>
          <option value="week" ${state.leadMonitorMode === "week" ? "selected" : ""}>按周</option>
        </select>
        ${state.leadMonitorMode === "day"
          ? `<input id="leadMonitorDateInput" type="date" value="${state.leadMonitorDate}" />`
          : `<input id="leadMonitorWeekInput" type="week" value="${state.leadMonitorWeek}" />`}
        <select id="leadMonitorEmployeeFilter">
          <option value="">全部所属人</option>
          ${state.employees.map((item) => `<option value="${item.id}" ${state.leadMonitorEmployeeFilter === item.id ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
        <select id="leadMonitorAccountFilter">
          <option value="">全部账号</option>
          ${state.accounts
            .filter((item) => !state.leadMonitorEmployeeFilter || item.employeeId === state.leadMonitorEmployeeFilter)
            .filter((item) => !state.leadMonitorPlatformFilter || item.platform === state.leadMonitorPlatformFilter)
            .map((item) => `<option value="${item.id}" ${state.leadMonitorAccountFilter === item.id ? "selected" : ""}>${item.accountName} · ${item.platform}</option>`)
            .join("")}
        </select>
        <select id="leadMonitorPlatformFilter">
          <option value="">全部平台</option>
          ${["小红书", "抖音"].map((item) => `<option value="${item}" ${state.leadMonitorPlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="leadMonitorPostTypeFilter">
          <option value="">全部作品类型</option>
          ${POST_TYPES.map((item) => `<option value="${item}" ${state.leadMonitorPostTypeFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="leadMonitorStatusFilter">
          <option value="">全部状态</option>
          ${["新客资", "跟进中", "已成交", "无效"].map((item) => `<option value="${item}" ${state.leadMonitorStatusFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        ${renderTimeQuickActions("lead-monitor", [
          { action: "today", label: "今天" },
          { action: "week", label: "本周" }
        ])}
      </div>
    </div>
    <section class="grid-4 rankings-stats-grid">
      ${stat("待处理客资", rows.length)}
      ${stat("未接", pendingUnreceivedCount)}
      ${stat("未添加", pendingUnaddedCount)}
      ${stat("已接待添加", Math.max(rows.length - pendingUnreceivedCount, 0))}
    </section>
    ${renderViewContext()}
    <div class="leads-monitor-grid">
      ${rows.length ? rows.map(renderLeadMonitorCard).join("") : `<div class="empty">暂无符合条件的客资。</div>`}
    </div>
  `;
}

function renderSalesFollowupBoard() {
  const rows = getLeadsForMonitor().filter((item) => {
    if ((item.addStatus || "未添加") !== "已添加") return false;
    if (state.salesFollowupIntentionFilter && (item.intention || "") !== state.salesFollowupIntentionFilter) return false;
    return true;
  }).sort((left, right) => {
    const intentionOrder = { "强意向": 3, "了解备用": 2, "弱": 1, "": 0 };
    const diff = (intentionOrder[right.intention || ""] || 0) - (intentionOrder[left.intention || ""] || 0);
    if (diff !== 0) return diff;
    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  });
  const total = rows.length;
  const strongCount = rows.filter((item) => item.intention === "强意向").length;
  const standbyCount = rows.filter((item) => item.intention === "了解备用").length;
  const weakCount = rows.filter((item) => item.intention === "弱").length;
  const tomorrowRows = state.salesTomorrowFollowupIds
    .map((id) => state.leads.find((item) => item.id === id))
    .filter(Boolean);
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>跟进看板</h2>
        <p class="page-desc">按客资意向度快速筛选，记录每条客资的跟进措施，方便销售持续跟进，也方便主管后续检查优化。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${getLeadMonitorLabel()}</span>
      </div>
    </div>
    <div class="panel">
      <div class="filters filters-toolbar">
        <select id="leadMonitorModeInput">
          <option value="day" ${state.leadMonitorMode === "day" ? "selected" : ""}>按天</option>
          <option value="week" ${state.leadMonitorMode === "week" ? "selected" : ""}>按周</option>
        </select>
        ${state.leadMonitorMode === "day"
          ? `<input id="leadMonitorDateInput" type="date" value="${state.leadMonitorDate}" />`
          : `<input id="leadMonitorWeekInput" type="week" value="${state.leadMonitorWeek}" />`}
        <select id="salesFollowupIntentionFilter">
          <option value="">全部意向度</option>
          <option value="强意向" ${state.salesFollowupIntentionFilter === "强意向" ? "selected" : ""}>强意向</option>
          <option value="了解备用" ${state.salesFollowupIntentionFilter === "了解备用" ? "selected" : ""}>了解备用</option>
          <option value="弱" ${state.salesFollowupIntentionFilter === "弱" ? "selected" : ""}>弱</option>
        </select>
        ${renderTimeQuickActions("lead-monitor", [
          { action: "today", label: "今天" },
          { action: "week", label: "本周" }
        ])}
      </div>
    </div>
    <section class="grid-4 rankings-stats-grid">
      <button class="stat stat-action js-toggle-tomorrow-followups" type="button">
        <div class="stat-top">
          <span class="muted">明日待跟进</span>
          ${tomorrowRows.length ? `<span class="mini-tag">待办</span>` : ""}
        </div>
        <strong>${tomorrowRows.length}</strong>
      </button>
      ${stat("强意向", strongCount)}
      ${stat("了解备用", standbyCount)}
      ${stat("弱意向", weakCount)}
    </section>
    ${state.salesTomorrowFollowupPanelOpen ? renderSalesTomorrowFollowupPanel(tomorrowRows) : ""}
    <div class="leads-monitor-grid">
      ${rows.length ? rows.map(renderSalesFollowupCard).join("") : `<div class="empty">当前筛选下暂无需要跟进的客资。</div>`}
    </div>
  `;
}

function renderSalesTomorrowFollowupPanel(rows) {
  return `
    <section class="panel sales-tomorrow-panel">
      <div class="section-head">
        <h3>明日待跟进</h3>
        <div class="section-head-actions">
          <button class="ghost js-close-tomorrow-followups" type="button">关闭</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>客户</th><th>联系方式</th><th>意向</th><th>来源账号</th><th>操作</th></tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((item) => {
              const localProfile = state.salesLeadLocalProfiles?.[item.id] || {};
              const customerProfileLabel = String(localProfile.customerLabel || "").trim() || item.accountName || "未命名客户";
              return `
                <tr>
                  <td>${customerProfileLabel}</td>
                  <td>${item.contactInfo || "-"}</td>
                  <td>${item.intention || "-"}</td>
                  <td>${item.accountName || "-"}</td>
                  <td><button class="ghost js-complete-tomorrow-followup" data-id="${item.id}" type="button">完成</button></td>
                </tr>
              `;
            }).join("") : `<tr><td colspan="5"><div class="empty">明日待跟进已清空。</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSalesFollowupCard(item) {
  const isEditing = state.editingLeadId === item.id;
  const isEditingNote = state.editingLeadNoteId === item.id;
  const feedback = String(item.salesFeedback || "").trim();
  const noteSummary = item.note ? String(item.note).trim() : "";
  const sourceTitle = item.sourcePostTitle || "未关联作品";
  const localProfile = state.salesLeadLocalProfiles?.[item.id] || {};
  const customerProfileLabel = String(localProfile.customerLabel || "").trim() || item.accountName || "未命名客户";
  const scheduledForTomorrow = state.salesTomorrowFollowupIds.includes(item.id);
  return `
    <article class="lead-monitor-card lead-monitor-card-info sales-followup-card">
      <div class="lead-monitor-main">
        <div class="lead-monitor-head">
          <div>
            <h3>${item.nickname || item.contactInfo || "未命名客资"}</h3>
            <p class="muted">日期：${String(item.createdAt || "").slice(0, 10) || "-"} · 所属运营：${item.employeeName || "-"}</p>
            <div class="lead-local-profile-row">
              <strong>客户信息</strong>
              <form class="lead-local-profile-form js-sales-local-profile-form">
                <input type="hidden" name="id" value="${item.id}" />
                <input class="lead-local-profile-input" type="text" name="customerLabel" value="${escapeHtmlAttribute(localProfile.customerLabel || "")}" placeholder="${escapeHtmlAttribute(item.accountName || "填写销售沟通后的客户信息")}" />
                <button class="sr-only-submit" type="submit" aria-hidden="true" tabindex="-1">保存</button>
              </form>
            </div>
          </div>
          <div class="lead-monitor-head-actions">
            <label class="lead-check-chip ${scheduledForTomorrow ? "is-good" : ""}">
              <input class="js-toggle-tomorrow-followup" data-id="${item.id}" type="checkbox" ${scheduledForTomorrow ? "checked" : ""} />
              <span>明天跟进</span>
            </label>
            <span class="lead-status-chip ${getLeadIntentionChipClass(item.intention || "-")}">客资意向 · ${item.intention || "-"}</span>
            <span class="lead-status-chip ${item.processStatus === "已接" ? "is-good" : "is-warn"}">处理状态 · ${item.processStatus || "未接"}</span>
            <span class="lead-status-chip ${item.addStatus === "已添加" ? "is-good" : "is-danger"}">是否添加 · ${item.addStatus === "已添加" ? "添加" : "未添加"}</span>
          </div>
        </div>
        <div class="lead-board-grid lead-board-grid-compact">
          <div><strong>平台</strong><span>${item.platform || "-"}</span></div>
          <div><strong>运营账号</strong><span>${item.accountName || "-"}</span></div>
          <button class="lead-info-card lead-copy-card ${item.contactInfo ? "js-copy-contact" : ""}" ${item.contactInfo ? `data-contact="${escapeHtmlAttribute(item.contactInfo)}"` : ""} type="button">
            <strong>联系方式</strong>
            <span>${item.contactInfo || "-"}</span>
          </button>
          <div><strong>来源作品</strong><span>${sourceTitle}${item.sourcePostType ? ` · ${item.sourcePostType}` : ""}</span></div>
        </div>
      </div>
      <div class="lead-feedback-row">
        <div class="lead-feedback-brief lead-feedback-panel">
          <strong>客资备注</strong>
          ${isEditingNote
            ? renderInlineLeadNoteForm(item)
            : `
              <p>${noteSummary || "暂未填写客资备注。"}</p>
              <span>${noteSummary ? "可继续补充客户顾虑、沟通判断和下一步动作。" : "可记录沟通情况、客户顾虑、下一步动作。"}
              </span>
              <div class="actions"><button class="ghost js-edit-lead-note" data-id="${item.id}" type="button">${noteSummary ? "改备注" : "写备注"}</button></div>
            `}
        </div>
      </div>
      <div class="lead-feedback-row">
        <div class="lead-feedback-brief lead-feedback-panel">
          <strong>跟进措施记录</strong>
          ${isEditing
            ? renderInlineSalesFeedbackForm(item)
            : `
              <p>${feedback || "暂未记录跟进措施。"}</p>
              <span>${item.salesUpdatedAt ? `最近更新：${formatDate(item.salesUpdatedAt)}` : "建议及时补充本次跟进动作和结果。"}</span>
              <div class="actions"><button class="ghost js-edit-followup" data-id="${item.id}" type="button">${feedback ? "编辑跟进" : "记录跟进"}</button></div>
            `}
        </div>
      </div>
    </article>
  `;
}

function renderStaffLeadsBoard() {
  const visibleAccounts = state.accounts.filter((item) => {
    if (state.leadMonitorPlatformFilter && item.platform !== state.leadMonitorPlatformFilter) return false;
    return true;
  });
  const rows = getLeadsForMonitor().filter((item) => {
    if (state.leadMonitorAccountFilter && item.accountId !== state.leadMonitorAccountFilter) return false;
    if (state.leadMonitorPlatformFilter && item.platform !== state.leadMonitorPlatformFilter) return false;
    if (state.leadMonitorPostTypeFilter && item.sourcePostType !== state.leadMonitorPostTypeFilter) return false;
    if (state.leadMonitorStatusFilter && item.status !== state.leadMonitorStatusFilter) return false;
    return true;
  });
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>客资看板</h2>
        <p class="page-desc">这里只看你自己获得的客资，按日期、平台、账号和作品类型快速筛选，直接跟进销售反馈和添加状态。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${getLeadMonitorLabel()}</span>
      </div>
    </div>
    <div class="panel">
      <div class="filters filters-toolbar">
        <select id="leadMonitorModeInput">
          <option value="day" ${state.leadMonitorMode === "day" ? "selected" : ""}>按天</option>
          <option value="week" ${state.leadMonitorMode === "week" ? "selected" : ""}>按周</option>
        </select>
        ${state.leadMonitorMode === "day"
          ? `<input id="leadMonitorDateInput" type="date" value="${state.leadMonitorDate}" />`
          : `<input id="leadMonitorWeekInput" type="week" value="${state.leadMonitorWeek}" />`}
        <select id="leadMonitorPlatformFilter">
          <option value="">全部平台</option>
          ${["小红书", "抖音"].map((item) => `<option value="${item}" ${state.leadMonitorPlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="leadMonitorAccountFilter">
          <option value="">全部账号</option>
          ${visibleAccounts.map((item) => `<option value="${item.id}" ${state.leadMonitorAccountFilter === item.id ? "selected" : ""}>${item.accountName} · ${item.platform}</option>`).join("")}
        </select>
        <select id="leadMonitorPostTypeFilter">
          <option value="">全部作品类型</option>
          ${POST_TYPES.map((item) => `<option value="${item}" ${state.leadMonitorPostTypeFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="leadMonitorStatusFilter">
          <option value="">全部状态</option>
          ${["新客资", "跟进中", "已成交", "无效"].map((item) => `<option value="${item}" ${state.leadMonitorStatusFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        ${renderTimeQuickActions("lead-monitor", [
          { action: "today", label: "今天" },
          { action: "week", label: "本周" }
        ])}
      </div>
    </div>
    ${renderViewContext()}
    <div class="leads-monitor-grid">
      ${rows.length ? rows.map(renderLeadMonitorCard).join("") : `<div class="empty">当前筛选下暂无你的客资。</div>`}
    </div>
  `;
}

function renderLeadMonitorCard(item) {
  const salesUsers = (state.users || []).filter((user) => user.role === "sales" && user.status !== "disabled");
  const assignedSalesName = item.assignedSalesUserName || item.salesUserName || "-";
  const processStatus = item.processStatus || "未接";
  const addStatus = item.addStatus || "未添加";
  const addStatusLabel = addStatus === "已添加" ? "添加" : "未添加";
  const intention = item.intention || "-";
  const sourceTitle = item.sourcePostTitle || "未关联作品";
  const canOpenSourcePost = Boolean(item.sourcePostUrl);
  const isSales = state.user?.role === "sales";
  const isAdminLike = state.user?.role === "admin" || state.user?.role === "owner";
  const salesFeedbackSummary = item.salesFeedback ? String(item.salesFeedback).trim() : "";
  const isEditingFeedback = isSales && state.editingLeadId === item.id;
  const cardToneClass = addStatus === "已添加"
    ? "lead-monitor-card-good"
    : processStatus === "已接"
      ? "lead-monitor-card-info"
      : "lead-monitor-card-warn";
  return `
    <article class="lead-monitor-card ${cardToneClass}">
      <div class="lead-monitor-main">
        <div class="lead-monitor-head">
          <div>
            <h3>${item.nickname || item.contactInfo || "未命名客资"}</h3>
            <p class="muted">日期：${String(item.createdAt || "").slice(0, 10) || "-"}</p>
          </div>
          <div class="lead-monitor-head-actions">
            ${isSales
              ? `
                <label class="lead-check-chip ${processStatus === "已接" ? "is-good" : ""}">
                  <input class="js-sales-process-toggle" data-id="${item.id}" type="checkbox" ${processStatus === "已接" ? "checked" : ""} />
                  <span>处理状态：已接</span>
                </label>
                <label class="lead-check-chip ${addStatus === "已添加" ? "is-good" : ""}">
                  <input class="js-sales-add-toggle" data-id="${item.id}" type="checkbox" ${addStatus === "已添加" ? "checked" : ""} />
                  <span>是否添加：已添加</span>
                </label>
                <label class="lead-chip-select-wrap lead-chip-select-inline ${getLeadIntentionChipClass(intention)}">
                  <span>客资意向</span>
                  <select class="lead-chip-select js-lead-intention" data-id="${item.id}">
                    <option value="">未选择</option>
                    <option value="强意向" ${intention === "强意向" ? "selected" : ""}>强</option>
                    <option value="了解备用" ${intention === "了解备用" ? "selected" : ""}>了解备用</option>
                    <option value="弱" ${intention === "弱" ? "selected" : ""}>弱</option>
                  </select>
                </label>
              `
              : `<span class="lead-status-chip ${processStatus === "已接" ? "is-good" : "is-warn"}">处理状态 · ${processStatus}</span>`}
            ${isSales ? "" : `<span class="lead-status-chip ${addStatus === "已添加" ? "is-good" : "is-danger"}">是否添加 · ${addStatusLabel}</span>`}
            ${isSales ? "" : `<span class="lead-status-chip ${getLeadIntentionChipClass(intention)}">客资意向 · ${intention}</span>`}
          </div>
        </div>
        <div class="lead-board-grid lead-board-grid-compact">
          <div><strong>平台</strong><span>${item.platform || "-"}</span></div>
          <div><strong>所属运营</strong><span>${item.employeeName || "-"}</span></div>
          <div><strong>运营账号</strong><span>${item.accountName || "-"}</span></div>
          <button class="lead-info-card lead-copy-card ${item.contactInfo ? "js-copy-contact" : ""}" ${item.contactInfo ? `data-contact="${escapeHtmlAttribute(item.contactInfo)}"` : ""} type="button">
            <strong>联系方式</strong>
            <span>${item.contactInfo || "-"}</span>
          </button>
          <div><strong>IP</strong><span>${item.ip || "-"}</span></div>
          <div>
            <strong>分配销售</strong>
            ${isAdminLike
              ? `<select class="lead-inline-select js-lead-sales-assign" data-id="${item.id}">
                  <option value="">未分配</option>
                  ${salesUsers.map((user) => `<option value="${escapeHtmlAttribute(user.id || "")}" data-name="${escapeHtmlAttribute(user.username || "")}" ${(item.assignedSalesUserId === user.id || (!item.assignedSalesUserId && assignedSalesName === user.username)) ? "selected" : ""}>${user.username}</option>`).join("")}
                </select>`
              : `<span>${assignedSalesName}</span>`}
          </div>
          <div>
            <strong>来源作品</strong>
            <span>${sourceTitle}${item.sourcePostType ? ` · ${item.sourcePostType}` : ""}</span>
          </div>
          <button class="lead-info-card ${item.captureImageUrl ? "js-open-image lead-info-card-actionable" : "lead-info-card-disabled"}" ${item.captureImageUrl ? `data-src="${escapeHtmlAttribute(item.captureImageUrl)}"` : ""} type="button">
            <strong>引流细节</strong>
            <span>${item.captureImageUrl ? "查看细节" : "暂无引流图"}</span>
          </button>
          <button class="lead-info-card ${canOpenSourcePost ? "js-open-external" : ""}" ${canOpenSourcePost ? `data-url="${escapeHtmlAttribute(item.sourcePostUrl || "")}"` : ""} type="button">
            <strong>打开原贴</strong>
            <span>${canOpenSourcePost ? "点击打开原贴" : "暂无原贴链接"}</span>
          </button>
          ${isSales ? `
            <button class="lead-info-card lead-info-card-actionable js-remind-lead" data-id="${item.id}" data-target="operator" type="button">
              <strong>提醒运营</strong>
              <span>提醒运营没通过</span>
            </button>
          ` : ""}
          ${isAdminLike || state.user?.role === "staff" ? `
            <button class="lead-info-card lead-info-card-actionable js-remind-lead" data-id="${item.id}" data-target="sales" type="button">
              <strong>提醒销售</strong>
              <span>提醒销售及时添加</span>
            </button>
          ` : ""}
        </div>
      </div>
      ${(isSales || isEditingFeedback || salesFeedbackSummary)
        ? `
          <div class="lead-feedback-row">
            <div class="lead-feedback-brief lead-feedback-panel">
              <strong>销售意见反馈</strong>
              ${isEditingFeedback
                ? renderInlineSalesFeedbackForm(item)
                : `
                  <p>${salesFeedbackSummary || "暂未填写销售反馈。"}</p>
                  <span>${salesFeedbackSummary ? `${item.salesUserName || assignedSalesName || "销售"}${item.salesUpdatedAt ? ` · ${formatDate(item.salesUpdatedAt)}` : ""}` : "销售填写后，运营端和主管端会同步看到。"}
                  </span>
                  ${isSales ? `<div class="actions"><button class="ghost js-edit-lead" data-id="${item.id}">${salesFeedbackSummary ? "编辑反馈" : "填写反馈"}</button></div>` : ""}
                `}
            </div>
          </div>
        `
        : ""}
    </article>
  `;
}

function renderInlineSalesFeedbackForm(editing) {
  return `
    <form class="form-grid form-grid-tight js-sales-feedback-form">
      <input type="hidden" name="id" value="${editing?.id || ""}" />
      <textarea class="full" name="salesFeedback" rows="4" placeholder="跟进反馈">${editing?.salesFeedback || ""}</textarea>
      <div class="actions full">
        <button class="primary" type="submit">保存反馈</button>
        <button class="ghost js-cancel-lead" type="button">取消编辑</button>
      </div>
    </form>
  `;
}

function renderInlineLeadNoteForm(editing) {
  return `
    <form class="form-grid form-grid-tight js-lead-note-form">
      <input type="hidden" name="id" value="${editing?.id || ""}" />
      <textarea class="full" name="note" rows="4" placeholder="客资备注">${editing?.note || ""}</textarea>
      <div class="actions full">
        <button class="primary" type="submit">保存备注</button>
        <button class="ghost js-cancel-lead-note" type="button">取消编辑</button>
      </div>
    </form>
  `;
}

function renderLeadsTable(rows) {
  if (!rows.length) return `<div class="empty">暂无客资数据</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>时间</th><th>员工</th><th>平台</th><th>昵称</th><th>联系方式</th><th>预算</th><th>专业</th><th>IP</th><th>所属账号</th><th>来源作品</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${rows.map((item) => `<tr><td>${formatDate(item.createdAt)}</td><td>${item.employeeName}</td><td>${item.platform}</td><td>${item.nickname || ""}</td><td>${item.contactInfo}</td><td>${item.budget}</td><td>${item.majorContent}</td><td>${item.ip || ""}</td><td>${item.accountName}</td><td>${item.sourcePostUrl ? renderExternalLink(item.sourcePostUrl, item.sourcePostTitle || "查看作品") : (item.sourcePostTitle || "未关联作品")}</td><td>${item.status}</td><td><div class="actions"><button class="ghost js-edit-lead" data-id="${item.id}">编辑</button><button class="ghost danger js-delete-lead" data-id="${item.id}">删除</button></div></td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmployees() {
  const editing = state.employees.find((item) => item.id === state.editingEmployeeId);
  const filteredEmployees = state.employees.filter((item) => {
    const keyword = state.employeeSearch.trim().toLowerCase();
    if (keyword) {
      const target = [item.employeeCode, item.name, item.phone, item.loginUsername].join(" ").toLowerCase();
      if (!target.includes(keyword)) return false;
    }
    if (state.employeeStatusFilter && item.status !== state.employeeStatusFilter) return false;
    return true;
  });
  const activeEmployees = state.employees.filter((item) => item.status === "在职").length;
  const enabledUsers = state.employees.filter((item) => item.loginUsername).length;
  const totalAccounts = state.employees.reduce((sum, item) => sum + Number(item.accountCount || 0), 0);
  const pausedEmployees = state.employees.filter((item) => item.status !== "在职").length;
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>员工管理</h2>
        <p class="page-desc">先把员工和登录账号管清楚，后面作品、客资、完成情况才会跟着稳定沉淀。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${filteredEmployees.length} / ${state.employees.length} 人</span>
      </div>
    </div>
    <section class="grid-4">
      ${stat("在职员工", activeEmployees, "当前状态为在职的员工数量。", "人员")}
      ${stat("已开通登录", enabledUsers, "已经可以直接登录员工端的人员数量。", "权限")}
      ${stat("名下账号总数", totalAccounts, "当前所有员工已绑定的账号总和。", "账号")}
      ${stat("离职 / 停用", pausedEmployees, "当前不在正常在职状态的员工数量。", "状态")}
    </section>
    <section class="grid-2">
      <div class="panel">
        <h3>${editing ? "编辑员工" : "新增员工"}</h3>
        <form id="employeeForm" class="form-grid">
          <input type="hidden" name="id" value="${editing?.id || ""}" />
          <input name="name" placeholder="员工姓名" value="${editing?.name || ""}" required />
          <input name="phone" placeholder="联系方式" value="${editing?.phone || ""}" />
          <input name="hireDate" type="date" value="${editing?.hireDate || ""}" />
          <select name="status">
            <option value="在职" ${editing?.status === "在职" ? "selected" : ""}>在职</option>
            <option value="离职" ${editing?.status === "离职" ? "selected" : ""}>离职</option>
            <option value="停用" ${editing?.status === "停用" ? "selected" : ""}>停用</option>
          </select>
          <div class="actions full">
            <button class="primary" type="submit">${editing ? "保存员工" : "新增员工"}</button>
            ${editing ? `<button class="ghost js-cancel-employee" type="button">取消编辑</button>` : ""}
          </div>
        </form>
      </div>
      <div class="panel">
        <h3>创建员工登录账号</h3>
        <form id="staffUserForm" class="form-grid">
          <select name="employeeId" required>
            ${state.employees.map((item) => `<option value="${item.id}">${item.name}</option>`).join("")}
          </select>
          <input name="username" placeholder="登录用户名" required />
          <input name="password" placeholder="初始密码" required />
          <select name="status">
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
          <button class="primary full" type="submit">保存登录账号</button>
        </form>
      </div>
    </section>
    <div class="panel">
      <div class="filters filters-toolbar management-toolbar">
        <input id="employeeSearchInput" placeholder="搜索员工姓名 / 编号 / 手机 / 登录账号" value="${state.employeeSearch}" />
        <select id="employeeStatusFilter">
          <option value="">全部状态</option>
          ${["在职", "离职", "停用"].map((item) => `<option value="${item}" ${state.employeeStatusFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>编号</th><th>姓名</th><th>电话</th><th>入职时间</th><th>状态</th><th>登录账号</th><th>账号数</th><th>操作</th></tr></thead>
          <tbody>${filteredEmployees.length ? filteredEmployees.map((item) => `<tr><td>${item.employeeCode}</td><td><div class="cell-stack"><strong>${item.name}</strong><span class="muted">${item.phone || "未填写联系方式"}</span></div></td><td>${item.phone || "-"}</td><td>${item.hireDate || "-"}</td><td><span class="tag ${item.status === "在职" ? "" : "tag-soft"}">${item.status}</span></td><td>${item.loginUsername ? `<span class="tag tag-soft">${item.loginUsername}</span>` : "未创建"}</td><td>${item.accountCount}</td><td><div class="actions"><button class="ghost js-edit-employee" data-id="${item.id}">编辑</button><button class="ghost danger js-delete-employee" data-id="${item.id}">删除</button></div></td></tr>`).join("") : `<tr><td colspan="8"><div class="empty">当前筛选条件下没有员工。</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAccounts() {
  const editing = state.accounts.find((item) => item.id === state.editingAccountId);
  const filteredAccounts = state.accounts.filter((item) => {
    const keyword = state.accountSearch.trim().toLowerCase();
    if (keyword) {
      const target = [item.accountName, item.accountUid, item.employeeName, item.persona, item.positioning].join(" ").toLowerCase();
      if (!target.includes(keyword)) return false;
    }
    if (state.accountPlatformFilter && item.platform !== state.accountPlatformFilter) return false;
    if (state.accountEmployeeFilter && item.employeeId !== state.accountEmployeeFilter) return false;
    return true;
  });
  const xhsCount = state.accounts.filter((item) => item.platform === "小红书").length;
  const douyinCount = state.accounts.filter((item) => item.platform === "抖音").length;
  const healthyCount = state.accounts.filter((item) => item.status === "正常").length;
  const riskCount = state.accounts.filter((item) => item.status !== "正常").length;
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>账号管理</h2>
        <p class="page-desc">主管先把账号归属、平台和状态管清楚，员工录入时就能少选错、少返工。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${filteredAccounts.length} / ${state.accounts.length} 个账号</span>
      </div>
    </div>
    <section class="grid-4">
      ${stat("账号总数", state.accounts.length, "当前系统里已纳管的全部账号。", "账号")}
      ${stat("小红书账号", xhsCount, "当前纳入管理的小红书账号数。", "小红书")}
      ${stat("抖音账号", douyinCount, "当前纳入管理的抖音账号数。", "抖音")}
      ${stat("风险账号", riskCount, `正常账号 ${healthyCount} 个，风险状态账号 ${riskCount} 个。`, "状态")}
    </section>
    <div class="panel">
      <form id="accountForm" class="form-grid">
        <input type="hidden" name="id" value="${editing?.id || ""}" />
        <select name="employeeId" required>${state.employees.map((item) => `<option value="${item.id}" ${editing?.employeeId === item.id ? "selected" : ""}>${item.name}</option>`).join("")}</select>
        <select name="platform"><option ${editing?.platform === "小红书" ? "selected" : ""}>小红书</option><option ${editing?.platform === "抖音" ? "selected" : ""}>抖音</option></select>
        <input name="accountName" placeholder="账号名称" value="${editing?.accountName || ""}" required />
        <input name="accountUid" placeholder="账号ID" value="${editing?.accountUid || ""}" />
        <input class="full" name="profileUrl" placeholder="账号主页链接" value="${editing?.profileUrl || ""}" />
        <input name="persona" placeholder="账号人设" value="${editing?.persona || ""}" />
        <input name="positioning" placeholder="账号定位" value="${editing?.positioning || ""}" />
        <textarea class="full" name="postingPlan" rows="3" placeholder="发帖规划">${editing?.postingPlan || ""}</textarea>
        <select name="status">${ACCOUNT_STATUSES.map((item) => `<option value="${item}" ${editing?.status === item ? "selected" : ""}>${item}</option>`).join("")}</select>
        <div class="actions full">
          <button class="primary" type="submit">${editing ? "保存账号" : "新增账号"}</button>
          ${editing ? `<button class="ghost js-cancel-account" type="button">取消编辑</button>` : ""}
        </div>
      </form>
    </div>
    <div class="panel">
      <div class="filters filters-toolbar management-toolbar">
        <input id="accountSearchInput" placeholder="搜索账号名称 / 账号ID / 员工 / 人设 / 定位" value="${state.accountSearch}" />
        <select id="accountEmployeeFilter">
          <option value="">全部员工</option>
          ${state.employees.map((item) => `<option value="${item.id}" ${state.accountEmployeeFilter === item.id ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
        <select id="accountPlatformFilter">
          <option value="">全部平台</option>
          ${["小红书", "抖音"].map((item) => `<option value="${item}" ${state.accountPlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>账号</th><th>员工</th><th>平台</th><th>账号ID</th><th>人设</th><th>定位</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>${filteredAccounts.length ? filteredAccounts.map((item) => `<tr><td><div class="cell-stack"><strong>${item.accountName}</strong><span class="muted">${item.profileUrl ? "已配置主页链接" : "未配置主页链接"}</span></div></td><td>${item.employeeName}</td><td><span class="tag ${item.platform === "抖音" ? "tag-warm" : ""}">${item.platform}</span></td><td>${item.accountUid || "-"}</td><td>${item.persona || "-"}</td><td>${item.positioning || "-"}</td><td><span class="tag ${item.status === "正常" ? "" : "tag-soft"}">${item.status}</span></td><td><div class="actions"><button class="ghost js-edit-account" data-id="${item.id}">编辑</button><button class="ghost danger js-delete-account" data-id="${item.id}">删除</button></div></td></tr>`).join("") : `<tr><td colspan="8"><div class="empty">当前筛选条件下没有账号。</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderPostEntry() {
  const editing = state.posts.find((item) => item.id === state.editingPostId);
  const todayRows = getTodayStaffPosts();
  return `
    <div class="page-header page-header-rich entry-page-header">
      <div>
        <h2>作品录入</h2>
        <p class="page-desc">录完账号、类型和作品链接就可以提交。系统会尽量自动补标题和互动数据，不耽误今天发帖节奏。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${editing ? "正在编辑作品" : "今日录入"}</span>
      </div>
    </div>
    <div class="panel entry-panel entry-panel-compact">
      <div class="staff-form-head">
        <h3>${editing ? "编辑作品" : "新增作品"}</h3>
        <span class="muted">提交后会立刻写入后台，主管端同步后马上能看到。</span>
      </div>
      ${renderPostForm(editing, { compact: true })}
    </div>
    <div class="panel staff-entry-records">
      <div class="section-head section-head-single section-head-compact">
        <h3>今日录入记录</h3>
      </div>
      <div class="staff-posts-grid staff-posts-grid-compact">
        ${todayRows.length ? todayRows.map(renderStaffPostCard).join("") : renderEmptyState("今天还没有录入作品", "先选账号、填链接和作品类型，第一条录进去后这里就会出现作品卡片。")}
      </div>
    </div>
  `;
}

function renderMyPosts() {
  const rows = getStaffFilteredPosts();
  return `
    <div class="page-header page-header-rich entry-page-header">
      <div>
        <h2>我的作品</h2>
        <p class="page-desc">按日期、账号和作品类型筛选，下面直接查看我的作品，并在对应账号下填写发帖规划。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${state.staffPostsDate || "全部日期"}</span>
      </div>
    </div>
    <div class="panel filter-panel">
      <div class="filters filters-toolbar">
        <input id="staffPostsDateInput" type="date" value="${state.staffPostsDate}" />
        <select id="staffPostsAccountFilter">
          <option value="">全部账号昵称</option>
          ${getStaffAccountsForFilter().map((item) => `<option value="${item.accountName}" ${state.staffPostsAccountFilter === item.accountName ? "selected" : ""}>${item.accountName}</option>`).join("")}
        </select>
        <select id="staffPostsTypeFilter">
          <option value="">全部作品类型</option>
          ${POST_TYPES.map((item) => `<option value="${item}" ${state.staffPostsTypeFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        ${renderTimeQuickActions("staff-posts-date", [
          { action: "today", label: "今天" },
          { action: "yesterday", label: "昨天" }
        ])}
      </div>
    </div>
    <div class="posts-monitor-grid">
      ${rows.length ? rows.map(renderStaffPostCard).join("") : renderEmptyState("当前筛选条件下没有作品", "可以清空日期筛选查看全部作品，也可以调整账号昵称和作品类型。")}
    </div>
  `;
}

function getStaffTeamPosts() {
  return state.teamPosts?.length ? state.teamPosts : state.posts;
}

function getStaffTeamLeads() {
  return state.teamLeads?.length ? state.teamLeads : state.leads;
}

function getStaffGalleryDates() {
  const allDates = Array.from(new Set(getStaffTeamPosts().map((item) => item.publishedAt).filter(Boolean))).sort();
  if (state.staffGalleryMode === "day") return state.staffGalleryDate ? [state.staffGalleryDate] : [];
  if (state.staffGalleryMode === "week") {
    const weekDates = new Set(getDatesInWeek(state.staffGalleryWeek));
    return allDates.filter((date) => weekDates.has(date));
  }
  if (state.staffGalleryMode === "month") {
    return allDates.filter((date) => date.startsWith(`${state.staffGalleryMonth}-`));
  }
  return allDates;
}

function getStaffRankingsDates() {
  const allDates = Array.from(new Set(getStaffTeamPosts().map((item) => item.publishedAt).filter(Boolean))).sort();
  if (state.staffRankingsMode === "day") return state.staffRankingsDate ? [state.staffRankingsDate] : [];
  if (state.staffRankingsMode === "week") {
    const weekDates = new Set(getDatesInWeek(state.staffRankingsWeek));
    return allDates.filter((date) => weekDates.has(date));
  }
  if (state.staffRankingsMode === "month") {
    return allDates.filter((date) => date.startsWith(`${state.staffRankingsMonth}-`));
  }
  return allDates;
}

function getGalleryOwnerOptions() {
  return Array.from(new Map(
    getStaffTeamPosts()
      .filter((item) => item.employeeName)
      .map((item) => [item.employeeId || item.employeeName, { id: item.employeeId || item.employeeName, name: item.employeeName }])
  ).values());
}

function leadMatchesPost(lead, post) {
  if (!lead || !post) return false;
  if (post.id && lead.postId === post.id) return true;
  if (post.postUrl && lead.sourcePostUrl && lead.sourcePostUrl === post.postUrl) return true;
  if (post.title && lead.sourcePostTitle && lead.sourcePostTitle === post.title && lead.accountId === post.accountId) return true;
  return false;
}

function getLeadCountForPost(post, leadPool = getStaffTeamLeads()) {
  return leadPool.filter((item) => leadMatchesPost(item, post)).length;
}

function getLeadSourcePosts(leadPool = state.leads) {
  const seen = new Set();
  return leadPool.reduce((rows, lead) => {
    const matchedPost = state.posts.find((post) => leadMatchesPost(lead, post));
    if (!matchedPost || seen.has(matchedPost.id)) return rows;
    seen.add(matchedPost.id);
    rows.push(matchedPost);
    return rows;
  }, []);
}

function getStaffGalleryRows() {
  const targetDates = new Set(getStaffGalleryDates());
  return getStaffTeamPosts()
    .filter((item) => {
      if (targetDates.size && item.publishedAt && !targetDates.has(item.publishedAt)) return false;
      if (state.staffGalleryScope === "others" && item.employeeName === state.user?.employeeName) return false;
      if (state.staffGalleryScope === "learning" && !state.staffLearningPostIds.includes(item.id)) return false;
      if (state.staffGalleryPlatformFilter && item.platform !== state.staffGalleryPlatformFilter) return false;
      if (state.staffGalleryTypeFilter && item.postType !== state.staffGalleryTypeFilter) return false;
      if (state.staffGalleryEmployeeFilter && (item.employeeId || item.employeeName) !== state.staffGalleryEmployeeFilter) return false;
      return true;
    })
    .sort((left, right) => {
      const rightScore = getLeadCountForPost(right) * 4 + Number(right.likes || 0) + Number(right.comments || 0) * 2;
      const leftScore = getLeadCountForPost(left) * 4 + Number(left.likes || 0) + Number(left.comments || 0) * 2;
      if (rightScore !== leftScore) return rightScore - leftScore;
      const leftTime = new Date(left.publishedAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.publishedAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
}

function getStaffLearningRows() {
  const learningIds = new Set(state.staffLearningPostIds);
  return getStaffTeamPosts()
    .filter((item) => learningIds.has(item.id))
    .sort((left, right) => state.staffLearningPostIds.indexOf(left.id) - state.staffLearningPostIds.indexOf(right.id));
}

function renderStaffGalleryPostCard(item) {
  const likes = Number(item.likes || 0);
  const comments = Number(item.comments || 0);
  const leadCount = getLeadCountForPost(item);
  const isSaved = state.staffLearningPostIds.includes(item.id);
  const isMine = item.employeeName && item.employeeName === state.user?.employeeName;
  return `
    <article class="staff-gallery-card">
      <div class="staff-gallery-cover">
        ${item.coverImageUrl ? `<button class="image-trigger js-open-image" data-src="${item.coverImageUrl}" type="button"><img src="${item.coverImageUrl}" alt="${item.title || "作品封面"}" class="staff-gallery-image" /></button>` : `<div class="staff-gallery-placeholder">暂无封面</div>`}
      </div>
      <div class="staff-gallery-body">
        <div class="post-monitor-tags">
          <span class="tag tag-soft">${item.employeeName || "未署名运营"}</span>
          <span class="tag">${item.platform || "-"}</span>
          <span class="tag tag-warm">${item.postType || "-"}</span>
          ${isMine ? `<span class="tag tag-soft">我的作品</span>` : ""}
          ${isSaved ? `<span class="tag tag-soft">已加入学习清单</span>` : ""}
        </div>
        <h3>${item.title || "未命名作品"}</h3>
        <div class="post-monitor-meta">
          <span>${item.accountName || "未绑定账号"}</span>
          <span>发布时间：${item.publishedAt || "-"}</span>
        </div>
        <div class="gallery-card-score">
          <div class="gallery-card-score-item">
            <span>点赞</span>
            <strong>${likes}</strong>
          </div>
          <div class="gallery-card-score-item">
            <span>评论</span>
            <strong>${comments}</strong>
          </div>
          <div class="gallery-card-score-item gallery-card-score-item-accent">
            <span>客资</span>
            <strong>${leadCount}</strong>
          </div>
        </div>
        <div class="actions">
          <button class="ghost js-toggle-learning-post" data-id="${item.id}" type="button">${isSaved ? "移出学习清单" : "加入学习清单"}</button>
          <button class="ghost js-filter-gallery-owner" data-owner="${item.employeeId || item.employeeName}" type="button">看这位运营</button>
          ${item.postUrl ? renderExternalLink(item.postUrl, "打开原帖") : ""}
        </div>
      </div>
    </article>
  `;
}

function renderPostsGallery() {
  const rows = getStaffGalleryRows();
  const learningRows = getStaffLearningRows();
  const ownerOptions = getGalleryOwnerOptions();
  const spotlightRows = [...rows]
    .filter((item) => item.employeeName !== state.user?.employeeName)
    .slice(0, 4);
  const leadRichRows = rows.filter((item) => getLeadCountForPost(item) > 0);
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>作品广场</h2>
        <p class="page-desc">看团队最近发了什么、谁的内容更值得拆、哪些作品应该加入自己的学习清单。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${state.staffGalleryMode === "day" ? state.staffGalleryDate : state.staffGalleryMode === "week" ? state.staffGalleryWeek : state.staffGalleryMode === "month" ? state.staffGalleryMonth : "全部沉淀"}</span>
      </div>
    </div>
    <section class="grid-4">
      ${stat("可学习作品", rows.length)}
      ${stat("学习清单", learningRows.length)}
      ${stat("可见运营", new Set(rows.map((item) => item.employeeName).filter(Boolean)).size)}
      ${stat("有客资作品", leadRichRows.length)}
    </section>
    <div class="panel filter-panel">
      <div class="filters filters-toolbar">
        <select id="staffGalleryModeInput">
          <option value="day" ${state.staffGalleryMode === "day" ? "selected" : ""}>按天</option>
          <option value="week" ${state.staffGalleryMode === "week" ? "selected" : ""}>按周</option>
          <option value="month" ${state.staffGalleryMode === "month" ? "selected" : ""}>按月</option>
          <option value="all" ${state.staffGalleryMode === "all" ? "selected" : ""}>全部</option>
        </select>
        ${state.staffGalleryMode === "day" ? `<input id="staffGalleryDateInput" type="date" value="${state.staffGalleryDate}" />` : ""}
        ${state.staffGalleryMode === "week" ? `<input id="staffGalleryWeekInput" type="week" value="${state.staffGalleryWeek}" />` : ""}
        ${state.staffGalleryMode === "month" ? `<input id="staffGalleryMonthInput" type="month" value="${state.staffGalleryMonth}" />` : ""}
        <select id="staffGalleryScopeInput">
          <option value="all" ${state.staffGalleryScope === "all" ? "selected" : ""}>全部作品</option>
          <option value="others" ${state.staffGalleryScope === "others" ? "selected" : ""}>只看他人作品</option>
          <option value="learning" ${state.staffGalleryScope === "learning" ? "selected" : ""}>只看学习清单</option>
        </select>
        <select id="staffGalleryPlatformFilter">
          <option value="">全部平台</option>
          ${["小红书", "抖音"].map((item) => `<option value="${item}" ${state.staffGalleryPlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="staffGalleryTypeFilter">
          <option value="">全部类型</option>
          ${POST_TYPES.map((item) => `<option value="${item}" ${state.staffGalleryTypeFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="staffGalleryEmployeeFilter">
          <option value="">全部运营</option>
          ${ownerOptions.map((item) => `<option value="${item.id}" ${state.staffGalleryEmployeeFilter === item.id ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
        ${renderTimeQuickActions("staff-gallery", [
          { action: "today", label: "今天" },
          { action: "week", label: "本周" },
          { action: "month", label: "本月" },
          { action: "all", label: "全部" }
        ])}
      </div>
    </div>
    ${learningRows.length ? `
      <section class="panel">
        <div class="section-head">
          <h3>我的学习清单</h3>
          <span class="muted">把值得复刻的作品先收进来，后面就能反复对照标题、结构和客资结果。</span>
        </div>
        <div class="staff-gallery-grid">
          ${learningRows.slice(0, 3).map(renderStaffGalleryPostCard).join("")}
        </div>
      </section>
    ` : ""}
    <section class="panel">
      <div class="section-head">
        <h3>这期值得学习</h3>
        <span class="muted">先看同事最近跑出来的好样本，再决定自己今天要模仿哪种结构。</span>
      </div>
      ${spotlightRows.length ? renderDashboardShortList(spotlightRows.map((item, index) => ({
        rank: index + 1,
        title: item.title || "未命名作品",
        summary: `${item.employeeName || "-"} · ${item.platform || "-"} · ${item.postType || "-"} · 客资 ${getLeadCountForPost(item)}`,
        meta: `${Number(item.likes || 0)} 赞 · ${Number(item.comments || 0)} 评`,
        actions: [`<button class="ghost js-filter-gallery-owner" data-owner="${item.employeeId || item.employeeName}" type="button">看这位运营</button>`]
      }))) : renderEmptyState("暂时还没有值得学习的样本", "等团队作品逐步沉淀后，这里会自动出现更值得拆的作品。")}
    </section>
    <div class="posts-monitor-grid">
      ${rows.length ? rows.map(renderStaffPostCard).join("") : renderEmptyState("当前筛选条件下没有作品", "可以切到全部作品，或者放宽平台、类型和运营筛选。")}
    </div>
  `;
}

function getStaffCompetitionRows() {
  const dates = new Set(getStaffRankingsDates());
  const employeeMap = new Map();
  getStaffTeamPosts().forEach((post) => {
    if (dates.size && post.publishedAt && !dates.has(post.publishedAt)) return;
    const key = post.employeeId || post.employeeName || "unknown";
    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        employeeId: post.employeeId || "",
        name: post.employeeName || "未署名运营",
        postCount: 0,
        leadPostCount: 0,
        leadCount: 0,
        engagement: 0
      });
    }
    const target = employeeMap.get(key);
    target.postCount += 1;
    if (post.postType === "获客贴") target.leadPostCount += 1;
    target.engagement += Number(post.likes || 0) + Number(post.comments || 0);
  });
  getStaffTeamLeads().forEach((lead) => {
    const leadDate = String(lead.createdAt || "").slice(0, 10);
    if (dates.size && leadDate && !dates.has(leadDate)) return;
    const key = lead.employeeId || lead.employeeName || "unknown";
    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        employeeId: lead.employeeId || "",
        name: lead.employeeName || "未署名运营",
        postCount: 0,
        leadPostCount: 0,
        leadCount: 0,
        engagement: 0
      });
    }
    employeeMap.get(key).leadCount += 1;
  });
  const keyMap = {
    posts: "postCount",
    leads: "leadCount",
    engagement: "engagement"
  };
  return Array.from(employeeMap.values())
    .sort((left, right) => {
      const diff = Number(right[keyMap[state.staffRankingsType]] || 0) - Number(left[keyMap[state.staffRankingsType]] || 0);
      if (diff) return diff;
      return right.postCount - left.postCount;
    })
    .map((item, index) => ({ rank: index + 1, ...item }));
}

function getStaffRankingGalleryRows() {
  const targetDates = new Set(getStaffRankingsDates());
  return getStaffTeamPosts()
    .filter((item) => {
      if (targetDates.size && item.publishedAt && !targetDates.has(item.publishedAt)) return false;
      return true;
    })
    .sort((left, right) => {
      const rightScore = getLeadCountForPost(right) * 4 + Number(right.likes || 0) + Number(right.comments || 0) * 2;
      const leftScore = getLeadCountForPost(left) * 4 + Number(left.likes || 0) + Number(left.comments || 0) * 2;
      if (rightScore !== leftScore) return rightScore - leftScore;
      const leftTime = new Date(left.publishedAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.publishedAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
}

function renderStaffRankings() {
  const rows = getStaffCompetitionRows();
  const galleryRows = getStaffRankingGalleryRows();
  const galleryAccountOptions = Array.from(new Map(galleryRows
    .filter((item) => item.accountId || item.accountName)
    .map((item) => [item.accountId || item.accountName, {
      id: item.accountId || item.accountName,
      label: `${item.accountName || "未命名账号"} · ${item.platform || "-"}`
    }])).values());
  const filteredGalleryRows = galleryRows
    .filter((item) => {
      if (state.staffRankingsAccountFilter && (item.accountId || item.accountName) !== state.staffRankingsAccountFilter) return false;
      const leadCount = getLeadCountForPost(item);
      if (state.staffRankingsLeadFilter === "has-leads" && leadCount <= 0) return false;
      if (state.staffRankingsLeadFilter === "no-leads" && leadCount > 0) return false;
      return true;
    })
    .sort((left, right) => {
      if (state.staffRankingsPostSort === "leads") {
        const leadDiff = getLeadCountForPost(right) - getLeadCountForPost(left);
        if (leadDiff !== 0) return leadDiff;
      }
      if (state.staffRankingsPostSort === "account") {
        const accountDiff = String(left.accountName || "").localeCompare(String(right.accountName || ""), "zh-Hans-CN");
        if (accountDiff !== 0) return accountDiff;
      }
      if (state.staffRankingsPostSort === "employee") {
        const employeeDiff = String(left.employeeName || "").localeCompare(String(right.employeeName || ""), "zh-Hans-CN");
        if (employeeDiff !== 0) return employeeDiff;
      }
      return new Date(right.publishedAt || right.createdAt || 0).getTime() - new Date(left.publishedAt || left.createdAt || 0).getTime();
    });
  const spotlightPostRows = [...galleryRows]
    .map((item) => ({ ...item, leadCount: getLeadCountForPost(item) }))
    .filter((item) => item.employeeName !== state.user?.employeeName)
    .filter((item) => item.leadCount > 0)
    .sort((left, right) => {
      if (right.leadCount !== left.leadCount) return right.leadCount - left.leadCount;
      return new Date(right.publishedAt || right.createdAt || 0).getTime() - new Date(left.publishedAt || left.createdAt || 0).getTime();
    })
    .slice(0, 6);
  const spotlightAccountRows = Array.from(galleryRows.reduce((map, item) => {
    const key = item.accountId || item.accountName || "unknown";
    if (!map.has(key)) {
      map.set(key, {
        accountId: item.accountId || "",
        accountName: item.accountName || "未命名账号",
        employeeName: item.employeeName || "-",
        platform: item.platform || "-",
        leadCount: 0,
        postCount: 0
      });
    }
    const target = map.get(key);
    target.postCount += 1;
    target.leadCount += getLeadCountForPost(item);
    return map;
  }, new Map()).values())
    .filter((item) => item.leadCount > 0)
    .sort((left, right) => {
      if (right.leadCount !== left.leadCount) return right.leadCount - left.leadCount;
      return right.postCount - left.postCount;
    })
    .slice(0, 6);
  const currentName = state.user?.employeeName || "";
  const myRow = rows.find((item) => item.name === currentName);
  const previousRow = myRow && myRow.rank > 1 ? rows[myRow.rank - 2] : null;
  const leader = rows[0];
  const metricKey = state.staffRankingsType === "posts" ? "postCount" : state.staffRankingsType === "engagement" ? "engagement" : "leadCount";
  const metricLabel = state.staffRankingsType === "posts" ? "作品数" : state.staffRankingsType === "engagement" ? "互动值" : "客资数";
  const maxMetricValue = Math.max(...rows.map((item) => Number(item[metricKey] || 0)), 0);
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>运营排行榜</h2>
        <p class="page-desc">把排名、差距和领先优势直接摆出来，让每个人都知道自己现在在哪、还差多少。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${state.staffRankingsMode === "day" ? state.staffRankingsDate : state.staffRankingsMode === "week" ? state.staffRankingsWeek : state.staffRankingsMode === "month" ? state.staffRankingsMonth : "累计到今天"}</span>
      </div>
    </div>
    <div class="panel filter-panel">
      <div class="filters filters-toolbar">
        <select id="staffRankingsModeInput">
          <option value="day" ${state.staffRankingsMode === "day" ? "selected" : ""}>按天</option>
          <option value="week" ${state.staffRankingsMode === "week" ? "selected" : ""}>按周</option>
          <option value="month" ${state.staffRankingsMode === "month" ? "selected" : ""}>按月</option>
          <option value="all" ${state.staffRankingsMode === "all" ? "selected" : ""}>累计到今天</option>
        </select>
        ${state.staffRankingsMode === "day" ? `<input id="staffRankingsDateInput" type="date" value="${state.staffRankingsDate}" />` : ""}
        ${state.staffRankingsMode === "week" ? `<input id="staffRankingsWeekInput" type="week" value="${state.staffRankingsWeek}" />` : ""}
        ${state.staffRankingsMode === "month" ? `<input id="staffRankingsMonthInput" type="month" value="${state.staffRankingsMonth}" />` : ""}
        <button class="ghost js-staff-rank-switch ${state.staffRankingsType === "posts" ? "active-filter" : ""}" data-type="posts" type="button">作品排行</button>
        <button class="ghost js-staff-rank-switch ${state.staffRankingsType === "leads" ? "active-filter" : ""}" data-type="leads" type="button">客资排行</button>
        ${renderTimeQuickActions("staff-rankings", [
          { action: "today", label: "今天" },
          { action: "week", label: "本周" },
          { action: "month", label: "本月" },
          { action: "all", label: "累计" }
        ])}
      </div>
    </div>
    <section class="grid-4 rankings-stats-grid">
      ${stat("我的名次", myRow ? `第 ${myRow.rank}` : "未上榜")}
      ${stat("当前领跑", leader ? `${leader.name}` : "-")}
      ${stat(`榜首${metricLabel}`, leader ? leader[metricKey] : 0)}
      ${stat(`我与前一名差距`, myRow && previousRow ? `${Math.max(Number(previousRow[metricKey] || 0) - Number(myRow[metricKey] || 0), 0)} ${metricLabel}` : "-")}
    </section>
    <section class="panel ranking-podium-panel">
      <div class="section-head">
        <h3>本期前三</h3>
        <span class="muted">前三直接亮出来，谁在领跑、差多少，一眼就能看出来。</span>
      </div>
        <div class="ranking-podium-grid">
          ${rows.slice(0, 3).map((item) => `
          <article class="ranking-podium-card ranking-podium-card-rank-${item.rank} ${item.name === currentName ? "ranking-podium-card-self" : ""}">
            <span class="ranking-podium-rank">#${item.rank}</span>
            <strong>${item.name}</strong>
            <div class="ranking-podium-score">${item[metricKey]}</div>
            <p>${metricLabel} · 作品 ${item.postCount} · 获客贴 ${item.leadPostCount}</p>
            <span class="ranking-gap-pill">${item.rank === 1 ? "当前领跑" : `距榜首 ${Math.max(Number(leader?.[metricKey] || 0) - Number(item[metricKey] || 0), 0)}`}</span>
            ${renderAdminRankingActions(item)}
          </article>
        `).join("")}
      </div>
    </section>
    <div class="panel">
      <div class="ranking-table-head">
        <div>
          <strong>${metricLabel}总榜</strong>
          <p>每个人的当前成绩、进度和与榜首差距都放在同一张榜里。</p>
        </div>
        <span class="ranking-table-focus">当前主指标：${metricLabel}</span>
      </div>
      <div class="table-wrap">
        <table class="ranking-table">
          <thead>
            <tr><th>排名</th><th>运营</th><th>当前成绩</th><th>作品数</th><th>获客贴</th><th>与榜首差距</th><th>动作</th></tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((item) => `
              <tr class="${item.name === currentName ? "table-row-self" : ""} ${item.rank <= 3 ? "ranking-row-top" : ""}">
                <td><span class="ranking-badge ranking-badge-${Math.min(item.rank, 3)}">${item.rank}</span></td>
                <td>
                  <div class="ranking-person-cell">
                    <strong>${item.name}</strong>
                    <span>${item.rank === 1 ? "当前领跑" : `距离前一名 ${Math.max(Number((rows[item.rank - 2]?.[metricKey] || 0)) - Number(item[metricKey] || 0), 0)} ${metricLabel}`}</span>
                  </div>
                </td>
                <td class="ranking-metric-cell">
                  <div class="ranking-metric-strong">${item[metricKey]}</div>
                  <div class="ranking-progress"><span style="width:${maxMetricValue ? Math.max((Number(item[metricKey] || 0) / maxMetricValue) * 100, 6) : 0}%"></span></div>
                </td>
                <td>${item.postCount}</td>
                <td>${item.leadPostCount}</td>
                <td><span class="ranking-gap-pill">${item.rank === 1 ? "0" : Math.max(Number(leader?.[metricKey] || 0) - Number(item[metricKey] || 0), 0)}</span></td>
                <td>-</td>
              </tr>
            `).join("") : `<tr><td colspan="7"><div class="empty">当前周期还没有排行数据。</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <section class="panel">
      <div class="section-head">
        <h3>这期值得学习</h3>
        <span class="muted">左边看账号，右边看作品，统一按客资结果排序。</span>
      </div>
      <div class="grid-2">
        <div>
          <div class="section-head section-head-single section-head-compact">
            <h3>账号榜</h3>
          </div>
          ${spotlightAccountRows.length ? renderDashboardShortList(spotlightAccountRows.map((item, index) => ({
            rank: index + 1,
            title: item.accountName,
            summary: `${item.employeeName} · ${item.platform} · 客资 ${item.leadCount}`,
            meta: `当前周期作品 ${item.postCount} 条`
          }))) : renderEmptyState("暂时还没有上榜账号", "等当前周期账号带来客资后，这里会自动按客资排序展示。")}
        </div>
        <div>
          <div class="section-head section-head-single section-head-compact">
            <h3>作品榜</h3>
          </div>
          ${spotlightPostRows.length ? renderDashboardShortList(spotlightPostRows.map((item, index) => ({
            rank: index + 1,
            title: item.title || "未命名作品",
            summary: `${item.accountName || "-"} · ${item.platform || "-"} · ${item.postType || "-"} · 客资 ${item.leadCount}`,
            meta: `${item.employeeName || "-"}`
          }))) : renderEmptyState("暂时还没有上榜作品", "等当前周期作品带来客资后，这里会自动按客资排序展示。")}
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>所有作品</h3>
        <span class="muted">这里展示当前排行榜周期内的全部作品，直接顺着榜单往下看样本。</span>
      </div>
      <div class="filters filters-toolbar">
        <select id="staffRankingsAccountFilter">
          <option value="">全部所属账号</option>
          ${galleryAccountOptions.map((item) => `<option value="${item.id}" ${state.staffRankingsAccountFilter === item.id ? "selected" : ""}>${item.label}</option>`).join("")}
        </select>
        <select id="staffRankingsLeadFilter">
          <option value="">全部客资状态</option>
          <option value="has-leads" ${state.staffRankingsLeadFilter === "has-leads" ? "selected" : ""}>有客资</option>
          <option value="no-leads" ${state.staffRankingsLeadFilter === "no-leads" ? "selected" : ""}>无客资</option>
        </select>
        <select id="staffRankingsPostSort">
          <option value="time" ${state.staffRankingsPostSort === "time" ? "selected" : ""}>按时间排序</option>
          <option value="leads" ${state.staffRankingsPostSort === "leads" ? "selected" : ""}>按客资数排序</option>
          <option value="account" ${state.staffRankingsPostSort === "account" ? "selected" : ""}>按账号排序</option>
          <option value="employee" ${state.staffRankingsPostSort === "employee" ? "selected" : ""}>按账号所属人排序</option>
        </select>
      </div>
      <div class="posts-monitor-grid">
        ${filteredGalleryRows.length ? filteredGalleryRows.map(renderStaffPostCard).join("") : renderEmptyState("当前筛选下还没有作品", "换个所属账号或客资筛选试试，作品会按时间从新到旧展示。")}
      </div>
    </section>
  `;
}

function renderLeadEntry() {
  const editing = state.leads.find((item) => item.id === state.editingLeadId);
  const rows = getStaffLeadsByDate();
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>客资录入</h2>
        <p class="page-desc">把今天新增的客资快速录进去，主管后面就能直接看人、看平台、看转化。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${editing ? "正在编辑客资" : "今日录入"}</span>
      </div>
    </div>
    <div class="panel entry-panel">
      <div class="staff-form-head">
        <h3>${editing ? "编辑客资" : "新增客资"}</h3>
      </div>
      ${renderLeadForm(editing, { compact: true })}
    </div>
    <div class="panel">
      <div class="section-head">
        <h3>客资记录</h3>
        <span class="muted">按日期回看自己录入的客资，支持继续编辑。</span>
      </div>
      <div class="filters filters-toolbar lead-record-toolbar">
        <input id="staffLeadsDateInput" type="date" value="${state.staffLeadsDate}" />
        ${renderTimeQuickActions("staff-leads-date", [
          { action: "today", label: "今天" },
          { action: "yesterday", label: "昨天" }
        ])}
      </div>
      <div class="staff-leads-grid">
        ${rows.length ? rows.map(renderStaffLeadCard).join("") : renderEmptyState("这一天还没有录入客资", "先把今天新增的客资录进去，下面就会自动沉淀成可编辑记录。")}
      </div>
    </div>
  `;
}

function renderEmptyState(title, description) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">空</div>
      <div>
        <h4>${title}</h4>
        <p>${description}</p>
      </div>
    </div>
  `;
}

function renderPostForm(editing, options = {}) {
  const compact = Boolean(options.compact);
  const selectedType = editing?.postType || "素人贴";
  return `
    <form id="postForm" class="form-grid form-grid-tight">
      <input type="hidden" name="id" value="${editing?.id || ""}" />
      <input type="hidden" name="coverImageUrl" value="${editing?.coverImageUrl || ""}" />
      <select name="accountId" required>${state.accounts.map((item) => `<option value="${item.id}" data-platform="${item.platform}" ${editing?.accountId === item.id ? "selected" : ""}>${item.accountName} · ${item.platform}</option>`).join("")}</select>
      <select name="postType">${POST_TYPES.map((item) => `<option value="${item}" ${editing?.postType === item ? "selected" : ""}>${item}</option>`).join("")}</select>
      <div class="full field-block">
        <label class="field-label">封面上传</label>
        <input name="coverImage" id="postCoverInput" type="file" accept="image/*" />
        <div class="paste-cover-hint" id="postCoverPasteHint" tabindex="0">可直接按 Command/Ctrl + V 粘贴封面截图，也可点击上方选择图片。</div>
        ${state.postCoverPreviewUrl ? `<div class="cover-preview-wrap"><span class="muted">当前待上传封面</span><button class="image-trigger image-trigger-inline js-open-image" data-src="${state.postCoverPreviewUrl}" type="button"><img class="cover-thumb" src="${state.postCoverPreviewUrl}" alt="待上传封面" /></button></div>` : editing?.coverImageUrl ? `<div class="cover-preview-wrap"><span class="muted">当前封面</span><button class="image-trigger image-trigger-inline js-open-image" data-src="${editing.coverImageUrl}" type="button"><img class="cover-thumb" src="${editing.coverImageUrl}" alt="当前封面" /></button></div>` : ""}
      </div>
      <input class="full" name="title" placeholder="作品名 / 标题" value="${editing?.title || ""}" />
      <textarea class="full" name="copywriting" rows="4" placeholder="作品文案">${editing?.copywriting || ""}</textarea>
      <input class="full" name="postUrl" placeholder="作品链接" value="${editing?.postUrl || ""}" />
      <div class="full" id="postTrafficField" style="${selectedType === "获客贴" ? "" : "display:none;"}">
        <input name="traffic" type="number" min="0" placeholder="获客贴播放量（仅获客贴填写，其他类型自动记为0）" value="${selectedType === "获客贴" ? (editing?.traffic ?? "") : ""}" />
      </div>
      ${
        compact
          ? ""
          : `
            <input name="likes" type="number" min="0" placeholder="点赞数" value="${editing?.likes ?? ""}" />
            <input name="comments" type="number" min="0" placeholder="评论数" value="${editing?.comments ?? ""}" />
            <input name="favorites" type="number" min="0" placeholder="收藏数" value="${editing?.favorites ?? ""}" />
            <input name="publishedAt" type="date" value="${editing?.publishedAt || ""}" />
            <textarea class="full" name="note" rows="3" placeholder="备注">${editing?.note || ""}</textarea>
          `
      }
      <div class="actions full">
        <button class="primary" type="submit">${editing ? "保存作品" : "提交作品"}</button>
        ${editing ? `<button class="ghost js-cancel-post" type="button">取消编辑</button>` : ""}
      </div>
    </form>
  `;
}

function getAccountSourcePosts(accountId) {
  return state.posts
    .filter((item) => item.accountId === accountId)
    .sort((left, right) => new Date(right.publishedAt || right.createdAt || 0) - new Date(left.publishedAt || left.createdAt || 0));
}

function renderLeadForm(editing, options = {}) {
  const compact = Boolean(options.compact);
  const selectedAccountId = editing?.accountId || state.accounts[0]?.id || "";
  const availablePosts = getAccountSourcePosts(selectedAccountId);
  const selectedPostId = availablePosts.some((item) => item.id === editing?.postId)
    ? editing?.postId
    : availablePosts[0]?.id || "";
  return `
    <form id="leadForm" class="form-grid form-grid-tight">
      <input type="hidden" name="id" value="${editing?.id || ""}" />
      <input type="hidden" name="captureImageUrl" value="${editing?.captureImageUrl || ""}" />
      <select name="accountId" required>${state.accounts.map((item) => `<option value="${item.id}" ${selectedAccountId === item.id ? "selected" : ""}>${item.accountName} · ${item.platform}</option>`).join("")}</select>
      <select name="postId" id="leadPostSelect" required>
        ${availablePosts.length
          ? availablePosts.map((item) => `<option value="${item.id}" ${selectedPostId === item.id ? "selected" : ""}>${item.title || "未命名作品"} · ${item.postType}</option>`).join("")
          : `<option value="">该账号下暂无作品，请先录入作品</option>`}
      </select>
      <input name="contactInfo" placeholder="联系方式" value="${editing?.contactInfo || ""}" required />
      <input name="ip" placeholder="IP" value="${editing?.ip || ""}" />
      <select name="status"><option ${editing?.status === "新客资" ? "selected" : ""}>新客资</option><option ${editing?.status === "跟进中" ? "selected" : ""}>跟进中</option><option ${editing?.status === "已成交" ? "selected" : ""}>已成交</option><option ${editing?.status === "无效" ? "selected" : ""}>无效</option></select>
      ${
        compact
          ? `<textarea class="full" name="note" rows="3" placeholder="备注">${editing?.note || ""}</textarea>`
          : `
            <input name="dealAmount" placeholder="成交金额" value="${editing?.dealAmount || ""}" />
            <textarea class="full" name="note" rows="3" placeholder="备注">${editing?.note || ""}</textarea>
          `
      }
      <div class="full">
        <label class="muted" for="leadCaptureInput">引流截图</label>
        <input id="leadCaptureInput" name="captureImage" type="file" accept="image/*" />
        ${state.leadCapturePreviewUrl
          ? `<div class="cover-preview-wrap"><span class="muted">当前待上传截图</span><button class="image-trigger image-trigger-inline js-open-image" data-src="${state.leadCapturePreviewUrl}" type="button"><img class="cover-thumb" src="${state.leadCapturePreviewUrl}" alt="待上传引流截图" /></button></div>`
          : editing?.captureImageUrl
            ? `<div class="cover-preview-wrap"><span class="muted">当前引流截图</span><button class="image-trigger image-trigger-inline js-open-image" data-src="${editing.captureImageUrl}" type="button"><img class="cover-thumb" src="${editing.captureImageUrl}" alt="当前引流截图" /></button></div>`
            : ``}
      </div>
      <div class="actions full">
        <button class="primary" type="submit">${editing ? "保存客资" : "提交客资"}</button>
        ${editing ? `<button class="ghost js-cancel-lead" type="button">取消编辑</button>` : ""}
      </div>
    </form>
  `;
}

function renderAnalyticsDashboard() {
  const { snapshots, summary, label } = getAnalyticsPayload();
  const reviewSummary = getReviewStateSummary();
  const dates = getAnalyticsSnapshotDates();
  const dateSet = new Set(dates);
  const postsInRange = state.posts.filter((item) => item.publishedAt && dateSet.has(item.publishedAt));
  const leadsInRange = state.leads.filter((item) => {
    const leadDate = String(item.createdAt || "").slice(0, 10);
    return leadDate && dateSet.has(leadDate);
  });
  const sourcePostsInRange = getLeadSourcePosts(leadsInRange);
  const accountInsights = getAnalyticsAccountInsights(postsInRange, leadsInRange);
  const topAccounts = accountInsights.filter((item) => item.leadCount > 0).slice(0, 5);
  const riskAccounts = accountInsights.filter((item) => item.postCount > 0 && item.leadCount === 0).slice(0, 5);
  const topPosts = sourcePostsInRange
    .map((post) => ({ ...post, leadCount: getLeadCountForPost(post, leadsInRange) }))
    .filter((post) => post.leadCount > 0)
    .sort((left, right) => {
      if (right.leadCount !== left.leadCount) return right.leadCount - left.leadCount;
      return new Date(right.publishedAt || right.createdAt || 0).getTime() - new Date(left.publishedAt || left.createdAt || 0).getTime();
    })
    .slice(0, 5);
  const leadPostCount = postsInRange.filter((item) => item.postType === "获客贴").length;
  const postsWithLeads = sourcePostsInRange.length;
  const accountsWithLeads = new Set(leadsInRange.map((lead) => lead.accountId).filter(Boolean)).size;
  const conversionRate = leadPostCount ? `${Math.round((postsWithLeads / leadPostCount) * 100)}%` : "0%";
  const zeroLeadAccounts = accountInsights.filter((item) => item.postCount > 0 && item.leadCount === 0).length;
  const bestAccount = topAccounts[0];
  const platformFocus = Number(summary.douyinPosts || 0) >= Number(summary.xhsPosts || 0) ? "抖音更强" : "小红书更强";
  const typeSummary = POST_TYPES.map((type) => {
    const scopedPosts = postsInRange.filter((item) => item.postType === type);
    const scopedSourcePosts = sourcePostsInRange.filter((item) => item.postType === type);
    const scopedLeadCount = leadsInRange.filter((lead) => scopedSourcePosts.some((post) => leadMatchesPost(lead, post))).length;
    const leadPosts = scopedSourcePosts.length;
    const zeroLeadRatio = scopedPosts.length ? `${Math.round(((scopedPosts.length - leadPosts) / scopedPosts.length) * 100)}%` : "0%";
    return {
      type,
      douyinPosts: scopedPosts.filter((item) => item.platform === "抖音").length,
      xhsPosts: scopedPosts.filter((item) => item.platform === "小红书").length,
      leadCount: scopedLeadCount,
      leadPosts,
      zeroLeadRatio
    };
  });
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>分析看板</h2>
        <p class="page-desc">围绕发帖、获客贴、客资和账号归因做周期复盘，不再把成交和播放量混进来。</p>
      </div>
      <div class="toolbar toolbar-end"><span class="tag">${label}</span>${renderAdminRefreshButton()}</div>
    </div>
    <div class="panel">
      <div class="filters filters-toolbar">
        <select id="analyticsModeInput">
          <option value="day" ${state.analyticsMode === "day" ? "selected" : ""}>按天</option>
          <option value="week" ${state.analyticsMode === "week" ? "selected" : ""}>按周</option>
          <option value="month" ${state.analyticsMode === "month" ? "selected" : ""}>按月</option>
          <option value="all" ${state.analyticsMode === "all" ? "selected" : ""}>累计到今天</option>
        </select>
        ${state.analyticsMode === "day"
          ? `<input id="analyticsDateInput" type="date" value="${state.analyticsDate}" />`
          : ""}
        ${state.analyticsMode === "week"
          ? `<input id="analyticsWeekInput" type="week" value="${state.analyticsWeek}" />`
          : ""}
        ${state.analyticsMode === "month"
          ? `<input id="analyticsMonthInput" type="month" value="${state.analyticsMonth}" />`
          : ""}
        ${renderTimeQuickActions("analytics", [
          { action: "today", label: "今天" },
          { action: "week", label: "本周" },
          { action: "month", label: "本月" },
          { action: "all", label: "累计" }
        ])}
      </div>
    </div>
    <section class="grid-4 stat-grid">
      ${stat("抖音作品数", summary.douyinPosts || 0, "", "抖音")}
      ${stat("小红书作品数", summary.xhsPosts || 0, "", "小红书")}
      ${stat("获客贴数", leadPostCount, "", "获客")}
      ${stat("新增客资数", summary.todayLeads || 0, "", "客资")}
      ${stat("有客资来源作品/账号", `${postsWithLeads}/${accountsWithLeads}`, "", "归因")}
      ${stat("客资来源作品转化率", conversionRate, "", "转化")}
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>主管关注区</h3>
        <span class="muted">先看本周期最值得放大和最需要介入的方向。</span>
      </div>
      <div class="dashboard-decision-grid">
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">账号</span>
          <span>客资最多账号</span>
          <strong>${bestAccount ? bestAccount.accountName : "暂无"}</strong>
          <p>${bestAccount ? `${bestAccount.employeeName || "-"} · 客资 ${bestAccount.leadCount} 条，获客贴 ${bestAccount.postCount} 条` : "当前范围内还没有明显领先账号。"}</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">风险</span>
          <span>连续更新无客资</span>
          <strong>${zeroLeadAccounts} 个账号</strong>
          <p>这些账号当前周期有更新动作，但还没有带来客资，建议优先复盘选题和承接。</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">平台</span>
          <span>平台侧重点</span>
          <strong>${platformFocus}</strong>
          <p>抖音 ${summary.douyinPosts || 0} 条作品，小红书 ${summary.xhsPosts || 0} 条作品。</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">内容</span>
          <span>内容方向提醒</span>
          <strong>获客贴</strong>
          <p>获客贴当前贡献客资 ${(typeSummary.find((item) => item.type === "获客贴") || {}).leadCount || 0} 条，零客资作品占比 ${(typeSummary.find((item) => item.type === "获客贴") || {}).zeroLeadRatio || "0%"}。</p>
        </article>
      </div>
    </section>
    <section class="grid-2 analytics-grid">
      <div class="panel">
        <div class="section-head"><h3>每日作品数 vs 每日客资数</h3><span class="muted">把抖音和小红书作品拆开看，再对照客资变化。</span></div>
        <div id="dailyPostsLeadsChart" class="chart-box"></div>
      </div>
      <div class="panel">
        <div class="section-head"><h3>每日获客贴数 vs 每日客资数</h3><span class="muted">比总作品数更能看出真正的获客动作质量。</span></div>
        <div id="leadPostsLeadsChart" class="chart-box"></div>
      </div>
      <div class="panel">
        <div class="section-head"><h3>平台客资趋势</h3><span class="muted">拆开看抖音和小红书的客资起伏。</span></div>
        <div id="platformLeadsTrendChart" class="chart-box"></div>
      </div>
    </section>
    <section class="grid-2">
      <div class="panel">
        <div class="section-head">
          <h3>值得放大的账号</h3>
          <span class="muted">这个周期里既有动作又有客资的账号，优先继续加量。</span>
        </div>
        ${topAccounts.length
          ? renderDashboardShortList(topAccounts.map((item, index) => ({
            rank: index + 1,
            tone: "good",
            title: item.accountName || "未命名账号",
            summary: `${item.employeeName || "-"} · ${item.platform || "-"} · 来源作品 ${item.sourcePostCount || item.postCount} · 客资 ${item.leadCount}`,
            meta: item.sourcePostCount
              ? `${item.sourceActiveDays || 0} 天来源作品有贡献`
              : `${item.activeDays} 天有更新`,
            actions: [
              `<button class="ghost js-open-account-viz-context" data-employee="${item.employeeId}" data-account="${item.accountId}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-month="${escapeHtmlAttribute(state.analyticsMonth || String(state.analyticsDate || "").slice(0, 7))}" type="button">看账号节奏</button>`,
              `<button class="ghost js-open-leads-context" data-employee="${item.employeeId}" data-account="${item.accountId}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-mode="${escapeHtmlAttribute(state.analyticsMode)}" data-date="${escapeHtmlAttribute(state.analyticsDate || "")}" data-week="${escapeHtmlAttribute(state.analyticsWeek || "")}" type="button">看同账号客资</button>`
            ]
          })))
          : renderEmptyState("当前没有值得放大的账号", "这个周期里还没有账号同时跑出作品和客资。")}
      </div>
      <div class="panel">
        <div class="section-head">
          <h3>需要介入的账号</h3>
          <span class="muted">有持续更新但没沉淀客资的账号，优先回查作品结构。</span>
        </div>
        ${riskAccounts.length
          ? renderDashboardShortList(riskAccounts.map((item, index) => ({
            rank: index + 1,
            tone: "warn",
            title: item.accountName || "未命名账号",
            summary: `${item.employeeName || "-"} · ${item.platform || "-"} · 作品 ${item.postCount} · 暂无客资`,
            meta: `${item.activeDays} 天有更新`,
            actions: [
              `<button class="ghost js-open-account-viz-context" data-employee="${item.employeeId}" data-account="${item.accountId}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-month="${escapeHtmlAttribute(state.analyticsMonth || String(state.analyticsDate || "").slice(0, 7))}" type="button">查账号节奏</button>`,
              `<button class="ghost js-open-posts-context" data-employee="${item.employeeId}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-mode="${escapeHtmlAttribute(state.analyticsMode)}" data-date="${escapeHtmlAttribute(state.analyticsDate || "")}" data-week="${escapeHtmlAttribute(state.analyticsWeek || "")}" type="button">查作品</button>`
            ]
          })))
          : renderEmptyState("当前没有需要介入的账号", "这个周期里暂时没有明显空转账号。")}
      </div>
    </section>
    <section class="grid-2">
      <div class="panel">
        <div class="section-head">
          <h3>内容归因</h3>
          <span class="muted">看什么类型的内容有效，什么类型在空转，方便主管调整选题方向。</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>作品类型</th><th>抖音作品</th><th>小红书作品</th><th>客资数</th><th>有客资作品数</th><th>零客资占比</th><th>动作</th></tr></thead>
            <tbody>
              ${typeSummary.map((item) => `
                <tr>
                  <td>${item.type}</td>
                  <td>${item.douyinPosts}</td>
                  <td>${item.xhsPosts}</td>
                  <td>${item.leadCount}</td>
                  <td>${item.leadPosts}</td>
                  <td>${item.zeroLeadRatio}</td>
                  <td>
                    <div class="actions">
                      <button class="ghost js-open-posts-context" data-post-type="${escapeHtmlAttribute(item.type)}" data-mode="${escapeHtmlAttribute(state.analyticsMode)}" data-date="${escapeHtmlAttribute(state.analyticsDate || "")}" data-week="${escapeHtmlAttribute(state.analyticsWeek || "")}" type="button">看这类作品</button>
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="section-head">
          <h3>值得复刻的作品</h3>
          <span class="muted">直接看哪些作品已经带来客资，适合拿去复盘和复制。</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>作品</th><th>账号</th><th>平台</th><th>类型</th><th>客资数</th><th>发布时间</th><th>动作</th></tr></thead>
            <tbody>
              ${topPosts.length
                ? topPosts.map((item) => `
                  <tr>
                    <td>${item.title || "未命名作品"}</td>
                    <td>${item.accountName || "-"}</td>
                    <td>${item.platform || "-"}</td>
                    <td>${item.postType || "-"}</td>
                    <td>${item.leadCount}</td>
                    <td>${item.publishedAt || "-"}</td>
                    <td>
                      <div class="actions">
                        <button class="ghost js-open-posts-context" data-employee="${escapeHtmlAttribute(item.employeeId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-post-type="${escapeHtmlAttribute(item.postType || "")}" data-mode="day" data-date="${escapeHtmlAttribute(item.publishedAt || "")}" type="button">看作品现场</button>
                        <button class="ghost js-open-account-viz-context" data-employee="${escapeHtmlAttribute(item.employeeId || "")}" data-account="${escapeHtmlAttribute(item.accountId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-month="${escapeHtmlAttribute(String(item.publishedAt || "").slice(0, 7))}" type="button">看账号节奏</button>
                      </div>
                    </td>
                  </tr>
                `).join("")
                : `<tr><td colspan="7">当前还没有值得复刻的作品</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </section>
    ${renderReviewCollectionSection("本周期复盘样本", state.reviewSamples, "sample", "当前还没有复盘样本", "你可以从作品监控、客资监控或账号页把对象加入复盘池。")}
  `;
}

function renderAnalyticsCharts() {
  if (!window.echarts) return;
  const payload = getAnalyticsPayload();
  const snapshots = payload.snapshots;
  if (!snapshots.length) return;
  const dates = snapshots.map((item) => item.date);
  const dailyPostsEl = document.getElementById("dailyPostsLeadsChart");
  const leadPostsEl = document.getElementById("leadPostsLeadsChart");
  const platformLeadsEl = document.getElementById("platformLeadsTrendChart");
  if (!dailyPostsEl || !leadPostsEl || !platformLeadsEl) return;
  const baseChartOption = {
    tooltip: { trigger: "axis" },
    grid: { left: 40, right: 20, top: 44, bottom: 28 },
    xAxis: { type: "category", data: dates },
    yAxis: { type: "value", minInterval: 1 },
    legend: { top: 0 }
  };
  const dailyPostsChart = window.echarts.getInstanceByDom(dailyPostsEl) || window.echarts.init(dailyPostsEl);
  dailyPostsChart.setOption({
    ...baseChartOption,
    color: ["#4d6fd6", "#7bc67b", "#f6b93b"],
    legend: { top: 0, data: ["抖音作品数", "小红书作品数", "客资数"] },
    series: [
      { name: "抖音作品数", type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: snapshots.map((item) => item.summary?.douyinPosts || 0) },
      { name: "小红书作品数", type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: snapshots.map((item) => item.summary?.xhsPosts || 0) },
      { name: "客资数", type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: snapshots.map((item) => item.summary?.todayLeads || 0) }
    ]
  }, true);
  const leadPostsChart = window.echarts.getInstanceByDom(leadPostsEl) || window.echarts.init(leadPostsEl);
  leadPostsChart.setOption({
    ...baseChartOption,
    color: ["#4d6fd6", "#7bc67b"],
    legend: { top: 0, data: ["获客贴数", "客资数"] },
    series: [
      { name: "获客贴数", type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: snapshots.map((item) => Number((item.distribution || []).find((row) => row.type === "获客贴")?.count || 0)) },
      { name: "客资数", type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: snapshots.map((item) => item.summary?.todayLeads || 0) }
    ]
  }, true);
  const platformLeadsChart = window.echarts.getInstanceByDom(platformLeadsEl) || window.echarts.init(platformLeadsEl);
  platformLeadsChart.setOption({
    ...baseChartOption,
    color: ["#4d6fd6", "#7bc67b"],
    legend: { top: 0, data: ["抖音客资", "小红书客资"] },
    series: [
      { name: "抖音客资", type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: dates.map((date) => state.leads.filter((item) => String(item.createdAt || "").startsWith(date) && item.platform === "抖音").length) },
      { name: "小红书客资", type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: dates.map((date) => state.leads.filter((item) => String(item.createdAt || "").startsWith(date) && item.platform === "小红书").length) }
    ]
  }, true);
}

function getAnalyticsSnapshotDates() {
  const allDates = Object.keys(state.analyticsSnapshots || {}).sort();
  if (state.analyticsMode === "day") return state.analyticsDate ? [state.analyticsDate] : [];
  if (state.analyticsMode === "week") {
    const weekDates = new Set(getDatesInWeek(state.analyticsWeek));
    return allDates.filter((date) => weekDates.has(date));
  }
  if (state.analyticsMode === "month") {
    return allDates.filter((date) => date.startsWith(`${state.analyticsMonth}-`));
  }
  return allDates;
}

function getAnalyticsPayload() {
  const dates = getAnalyticsSnapshotDates();
  const snapshots = dates
    .map((date) => state.analyticsSnapshots?.[date])
    .filter(Boolean)
    .map((item) => ({ ...item, date: item.date || "" }));

  const summary = snapshots.reduce((acc, item) => {
    acc.updatedEmployees += Number(item.summary?.updatedEmployees || 0);
    acc.updatedAccounts += Number(item.summary?.updatedAccounts || 0);
    acc.douyinPosts += Number(item.summary?.douyinPosts || 0);
    acc.xhsPosts += Number(item.summary?.xhsPosts || 0);
    acc.todayLeads += Number(item.summary?.todayLeads || 0);
    acc.todayDeals += Number(item.summary?.todayDeals || 0);
    acc.douyinLikes += Number(item.summary?.douyinLikes || 0);
    acc.douyinComments += Number(item.summary?.douyinComments || 0);
    acc.douyinFavorites += Number(item.summary?.douyinFavorites || 0);
    acc.xhsLikes += Number(item.summary?.xhsLikes || 0);
    acc.xhsComments += Number(item.summary?.xhsComments || 0);
    acc.xhsFavorites += Number(item.summary?.xhsFavorites || 0);
    acc.douyinTraffic += Number(item.summary?.douyinTraffic || 0);
    acc.xhsTraffic += Number(item.summary?.xhsTraffic || 0);
    return acc;
  }, {
    updatedEmployees: 0,
    updatedAccounts: 0,
    douyinPosts: 0,
    xhsPosts: 0,
    todayLeads: 0,
    todayDeals: 0,
    douyinLikes: 0,
    douyinComments: 0,
    douyinFavorites: 0,
    xhsLikes: 0,
    xhsComments: 0,
    xhsFavorites: 0,
    douyinTraffic: 0,
    xhsTraffic: 0
  });

  return {
    snapshots,
    summary,
    label: state.analyticsMode === "day"
      ? state.analyticsDate
      : state.analyticsMode === "week"
        ? state.analyticsWeek
      : state.analyticsMode === "month"
        ? state.analyticsMonth
        : "累计到今天"
  };
}

function getAnalyticsAccountInsights(postsInRange, leadsInRange) {
  const accountMap = new Map();
  state.accounts.forEach((account) => {
    accountMap.set(account.id, {
      accountId: account.id,
      accountName: account.accountName || "未命名账号",
      employeeId: account.employeeId || "",
      employeeName: account.employeeName || "",
      platform: account.platform || "",
      postCount: 0,
      leadCount: 0,
      activeDays: 0,
      sourcePostCount: 0,
      sourceActiveDays: 0
    });
  });
  const activeDayMap = new Map();
  const sourceActiveDayMap = new Map();
  postsInRange.forEach((post) => {
    const target = accountMap.get(post.accountId);
    if (!target) return;
    target.postCount += 1;
    const activeKey = `${post.accountId}-${post.publishedAt}`;
    if (!activeDayMap.has(activeKey)) {
      activeDayMap.set(activeKey, true);
      target.activeDays += 1;
    }
  });
  leadsInRange.forEach((lead) => {
    const target = accountMap.get(lead.accountId);
    if (!target) return;
    target.leadCount += 1;
    const sourcePost = state.posts.find((post) => leadMatchesPost(lead, post));
    if (!sourcePost) return;
    target.sourcePostCount += 1;
    const sourceActiveKey = `${sourcePost.accountId}-${sourcePost.publishedAt || sourcePost.createdAt || sourcePost.id}`;
    if (!sourceActiveDayMap.has(sourceActiveKey)) {
      sourceActiveDayMap.set(sourceActiveKey, true);
      target.sourceActiveDays += 1;
    }
  });
  return Array.from(accountMap.values()).sort((left, right) => {
    if (right.leadCount !== left.leadCount) return right.leadCount - left.leadCount;
    if (right.sourcePostCount !== left.sourcePostCount) return right.sourcePostCount - left.sourcePostCount;
    if (right.postCount !== left.postCount) return right.postCount - left.postCount;
    return String(left.accountName || "").localeCompare(String(right.accountName || ""));
  });
}

function renderAccountsMini() {
  if (!state.accounts.length) return `<div class="empty">暂无账号</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>账号</th><th>平台</th><th>定位</th></tr></thead>
        <tbody>${state.accounts.map((item) => `<tr><td>${item.accountName}</td><td>${item.platform}</td><td>${item.positioning || ""}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function getTodayStaffPosts() {
  const today = new Date().toLocaleDateString("en-CA");
  return state.posts.filter((item) => item.publishedAt === today);
}

function getStaffAccountsForFilter() {
  return Array.from(
    new Map(
      state.accounts
        .filter((item) => item.accountName)
        .map((item) => [item.accountName, item])
    ).values()
  );
}

function getStaffFilteredPosts() {
  return state.posts
    .filter((item) => {
      if (state.staffPostsDate && item.publishedAt !== state.staffPostsDate) return false;
      if (state.staffPostsAccountFilter && item.accountName !== state.staffPostsAccountFilter) return false;
      if (state.staffPostsTypeFilter && item.postType !== state.staffPostsTypeFilter) return false;
      return true;
    })
    .sort((left, right) => {
      const leftTime = new Date(left.publishedAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.publishedAt || right.createdAt || 0).getTime();
      if (rightTime !== leftTime) return rightTime - leftTime;
      return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
    });
}

function renderStaffPostCard(item) {
  return `
    <article class="post-monitor-card post-board-card">
      <div class="post-monitor-cover">
        ${item.coverImageUrl ? `<button class="image-trigger js-open-image" data-src="${item.coverImageUrl}" type="button"><img src="${item.coverImageUrl}" alt="${item.title || "作品封面"}" class="post-monitor-image" /></button>` : `<div class="post-monitor-placeholder">暂无封面</div>`}
      </div>
      <div class="post-monitor-body post-board-copy">
        <span class="mini-tag">作品文案</span>
        <h3>${item.title || "未命名作品"}</h3>
        <p class="post-board-copywriting">${escapeHtml(item.copywriting || item.title || "暂无作品文案")}</p>
      </div>
      <div class="post-monitor-body post-board-meta">
        <div class="post-monitor-tags">
          <span class="tag tag-soft">${item.accountName || "未绑定账号"}</span>
          <span class="tag">${item.platform || "-"}</span>
          <span class="tag tag-warm">${item.postType || "-"}</span>
        </div>
        <div class="post-monitor-meta">
          <span>所属运营：${item.employeeName || "-"}</span>
          <span>账号名：${item.accountName || "未绑定账号"}</span>
          <span>发布时间：${item.publishedAt || "-"}</span>
          <span>获客数：${getLeadCountForPost(item)}</span>
          <span>平台：${item.platform || "-"}</span>
          <span>帖子类型：${item.postType || "-"}</span>
        </div>
        ${item.postUrl ? `<div class="post-monitor-link">${renderExternalLink(item.postUrl, "打开原帖")}</div>` : ""}
      </div>
      <div class="post-monitor-body post-board-suggestion">
        <span class="mini-tag">主管建议</span>
        <div class="post-board-suggestion-readonly">${item.supervisorSuggestion ? escapeHtml(item.supervisorSuggestion) : "主管暂未填写建议"}</div>
      </div>
      <details class="post-board-plan-editor">
        <summary>发帖规划</summary>
        <form class="js-staff-posting-plan-form">
          <input type="hidden" name="id" value="${item.accountId || ""}" />
          <textarea class="post-board-plan-input" name="postingPlan" rows="4" placeholder="填写这个账号近期的发帖规划，主管端作品看板会同步看到。">${escapeHtml(item.postingPlan || "")}</textarea>
          <div class="actions">
            <button class="primary" type="submit">保存账号规划</button>
          </div>
        </form>
      </details>
    </article>
  `;
}

function getStaffLeadsByDate() {
  return state.leads.filter((item) => String(item.createdAt).startsWith(state.staffLeadsDate));
}

function renderStaffLeadCard(item) {
  const noteSummary = item.note || "暂无备注";
  return `
    <article class="staff-lead-card">
      <div class="staff-lead-head">
        <div>
          <h3>${item.nickname || "未填写昵称"}</h3>
          <p class="muted">${item.accountName || "未绑定账号"} · ${item.platform || "-"}</p>
        </div>
        <span class="tag">${item.status}</span>
      </div>
      <div class="staff-lead-grid">
        <div><strong>专业</strong><span>${item.majorContent || "-"}</span></div>
        <div><strong>IP</strong><span>${item.ip || "-"}</span></div>
        <div><strong>录入时间</strong><span>${formatDate(item.createdAt)}</span></div>
        <div>
          <strong>联系方式</strong>
          <span>${item.contactInfo || "-"}</span>
          ${item.contactInfo ? `<button class="ghost lead-inline-copy js-copy-contact" data-contact="${escapeHtmlAttribute(item.contactInfo)}" type="button">一键复制</button>` : ""}
        </div>
      </div>
      ${(item.captureImageUrl || item.sourcePostTitle || item.sourcePostUrl)
        ? `<details class="detail-block">
            <summary>展开更多信息</summary>
            <div class="detail-block-body">
              <div class="lead-monitor-note"><strong>备注</strong><p>${noteSummary}</p></div>
              <div class="lead-monitor-note"><strong>来源作品</strong><p>${item.sourcePostTitle || "未关联作品"}</p><p class="lead-source-actions">${item.sourcePostUrl ? `<button class="ghost js-open-external" data-url="${escapeHtmlAttribute(item.sourcePostUrl || "")}" type="button">打开原贴</button>` : ""}${item.captureImageUrl ? `<button class="ghost js-open-image" data-src="${item.captureImageUrl}" type="button">引流细节</button>` : ""}</p></div>
            </div>
          </details>`
        : `<div class="lead-monitor-note"><strong>备注</strong><p>${noteSummary}</p></div>`}
      <div class="actions">
        <button class="ghost js-remind-lead" data-id="${item.id}" data-target="sales" type="button">提醒销售及时添加</button>
        <button class="ghost js-edit-lead" data-id="${item.id}">编辑客资</button>
      </div>
    </article>
  `;
}

function buildStaffCompletionRows() {
  const { label } = getDashboardPayload();
  const availableDates = getAllAvailableDataDates();
  const targetDates = state.dashboardMode === "day"
    ? [state.dashboardDate]
    : state.dashboardMode === "week"
      ? getDatesInWeek(state.dashboardWeek)
      : state.dashboardMode === "month"
        ? availableDates.filter((date) => date.startsWith(`${state.dashboardMonth}-`))
        : availableDates;

  return state.employees.map((employee) => {
    const posts = state.posts.filter((item) => item.employeeId === employee.id && targetDates.includes(item.publishedAt));
    const leads = state.leads.filter((item) => item.employeeId === employee.id && targetDates.some((date) => String(item.createdAt).startsWith(date)));
    const leadPosts = posts.filter((item) => item.postType === "获客贴");
    return {
      employeeId: employee.id,
      name: employee.name,
      label,
      postCount: posts.length,
      leadPostCount: leadPosts.length,
      playCountFilled: leadPosts.filter((item) => Number(item.traffic || 0) > 0).length,
      leadCount: leads.length
    };
  });
}

function renderAdminRefreshButton() {
  if (state.user?.role !== "admin") return "";
  if (!["dashboard", "rankings", "posts", "leads", "analytics"].includes(state.currentView)) return "";
  return `
    <input id="rollbackSnapshotDateInput" type="date" value="${state.rollbackSnapshotDate}" />
    <button class="ghost" id="refreshScopedMetricsBtn">同步看板数据</button>
    <button class="ghost" id="rollbackScopedMetricsBtn">回退到所选日期</button>
  `;
}

function getSnapshotByDate(date) {
  return state.analyticsSnapshots?.[date] || null;
}

function getAllAvailableDataDates() {
  const dates = new Set(Object.keys(state.analyticsSnapshots || {}));
  state.posts.forEach((item) => {
    if (item.publishedAt) dates.add(item.publishedAt);
  });
  state.leads.forEach((item) => {
    const leadDate = String(item.createdAt || "").slice(0, 10);
    if (leadDate) dates.add(leadDate);
  });
  return Array.from(dates).sort();
}

function getLatestActiveDataDate() {
  const activeDates = new Set();
  state.posts.forEach((item) => {
    if (item.publishedAt) activeDates.add(item.publishedAt);
  });
  state.leads.forEach((item) => {
    const leadDate = String(item.createdAt || "").slice(0, 10);
    if (leadDate) activeDates.add(leadDate);
  });
  Object.entries(state.analyticsSnapshots || {}).forEach(([date, snapshot]) => {
    const postCount = Number(snapshot?.summary?.douyinPosts || 0) + Number(snapshot?.summary?.xhsPosts || 0);
    const leadCount = Number(snapshot?.summary?.todayLeads || 0);
    if (postCount > 0 || leadCount > 0 || (snapshot?.postsMonitor || []).length || (snapshot?.leadsMonitor || []).length) {
      activeDates.add(date);
    }
  });
  const sorted = Array.from(activeDates).sort();
  return sorted[sorted.length - 1] || "";
}

function hasMeaningfulDataForDate(date) {
  if (!date) return false;
  const hasPosts = state.posts.some((item) => item.publishedAt === date);
  if (hasPosts) return true;

  const hasLeads = state.leads.some((item) => String(item.createdAt || "").slice(0, 10) === date);
  if (hasLeads) return true;

  const snapshot = (state.analyticsSnapshots || {})[date];
  if (!snapshot) return false;
  const postCount = Number(snapshot?.summary?.douyinPosts || 0) + Number(snapshot?.summary?.xhsPosts || 0);
  const leadCount = Number(snapshot?.summary?.todayLeads || 0);
  return postCount > 0 || leadCount > 0 || (snapshot?.postsMonitor || []).length > 0 || (snapshot?.leadsMonitor || []).length > 0;
}

function hasMeaningfulDataForMonth(month) {
  if (!month) return false;
  return getAllAvailableDataDates().some((date) => date.startsWith(`${month}-`) && hasMeaningfulDataForDate(date));
}

function hasMeaningfulDataForWeek(week) {
  if (!week) return false;
  return getDatesInWeek(week).some((date) => hasMeaningfulDataForDate(date));
}

function alignStateDatesToAvailableData() {
  const allDates = getAllAvailableDataDates();
  if (!allDates.length) return;

  const latestDate = getLatestActiveDataDate() || allDates[allDates.length - 1];
  const latestMonth = latestDate.slice(0, 7);
  const latestWeek = getCurrentWeekString(new Date(latestDate));
  const availableDates = new Set(allDates);
  const availableMonths = new Set(allDates.map((date) => date.slice(0, 7)));
  const availableWeeks = new Set(allDates.map((date) => getCurrentWeekString(new Date(date))));

  const ensureDate = (key) => {
    if (!availableDates.has(state[key]) || !hasMeaningfulDataForDate(state[key])) state[key] = latestDate;
  };
  const ensureMonth = (key) => {
    if (!availableMonths.has(state[key]) || !hasMeaningfulDataForMonth(state[key])) state[key] = latestMonth;
  };
  const ensureWeek = (key) => {
    if (!availableWeeks.has(state[key]) || !hasMeaningfulDataForWeek(state[key])) state[key] = latestWeek;
  };

  ensureDate("dashboardDate");
  ensureMonth("dashboardMonth");
  ensureWeek("dashboardWeek");

  ensureDate("rankingsDate");
  ensureMonth("rankingsMonth");
  ensureWeek("rankingsWeek");

  ensureDate("analyticsDate");
  ensureMonth("analyticsMonth");
  ensureWeek("analyticsWeek");

  ensureDate("postMonitorDate");
  ensureMonth("postMonitorMonth");
  ensureWeek("postMonitorWeek");

  ensureDate("leadMonitorDate");
  ensureWeek("leadMonitorWeek");

  ensureDate("staffGalleryDate");
  ensureMonth("staffGalleryMonth");
  ensureWeek("staffGalleryWeek");

  ensureDate("staffRankingsDate");
  ensureMonth("staffRankingsMonth");
  ensureWeek("staffRankingsWeek");

  ensureDate("staffLeadsDate");
  ensureMonth("accountVizMonth");
  ensureMonth("personalBoardMonth");
  if (!availableDates.has(state.rollbackSnapshotDate)) state.rollbackSnapshotDate = latestDate;
}

function getDashboardSnapshotDates() {
  const allDates = getAllAvailableDataDates();
  if (state.dashboardMode === "day") return state.dashboardDate ? [state.dashboardDate] : [];
  if (state.dashboardMode === "week") {
    const weekDates = new Set(getDatesInWeek(state.dashboardWeek));
    return allDates.filter((date) => weekDates.has(date));
  }
  if (state.dashboardMode === "month") {
    return allDates.filter((date) => date.startsWith(`${state.dashboardMonth}-`));
  }
  return allDates;
}

function getDashboardPayload() {
  if (state.dashboardMode === "day") {
    const snapshot = getSnapshotByDate(state.dashboardDate);
    return {
      summary: snapshot?.summary || state.summary || {},
      distribution: snapshot?.distribution || state.distribution || [],
      label: state.dashboardDate
    };
  }

  const dates = getDashboardSnapshotDates();
  const summary = {
    updatedEmployees: 0,
    updatedAccounts: 0,
    douyinPosts: 0,
    xhsPosts: 0,
    todayLeads: 0,
    todayDeals: 0,
    douyinLikes: 0,
    douyinComments: 0,
    douyinFavorites: 0,
    xhsLikes: 0,
    xhsComments: 0,
    xhsFavorites: 0,
    douyinTraffic: 0,
    xhsTraffic: 0
  };
  const typeCounts = { "素人贴": 0, "话题贴": 0, "获客贴": 0 };

  dates.forEach((date) => {
    const snapshot = state.analyticsSnapshots?.[date];
    if (!snapshot) return;
    summary.updatedEmployees += Number(snapshot.summary?.updatedEmployees || 0);
    summary.updatedAccounts += Number(snapshot.summary?.updatedAccounts || 0);
    summary.douyinPosts += Number(snapshot.summary?.douyinPosts || 0);
    summary.xhsPosts += Number(snapshot.summary?.xhsPosts || 0);
    summary.todayLeads += Number(snapshot.summary?.todayLeads || 0);
    summary.todayDeals += Number(snapshot.summary?.todayDeals || 0);
    summary.douyinLikes += Number(snapshot.summary?.douyinLikes || 0);
    summary.douyinComments += Number(snapshot.summary?.douyinComments || 0);
    summary.douyinFavorites += Number(snapshot.summary?.douyinFavorites || 0);
    summary.xhsLikes += Number(snapshot.summary?.xhsLikes || 0);
    summary.xhsComments += Number(snapshot.summary?.xhsComments || 0);
    summary.xhsFavorites += Number(snapshot.summary?.xhsFavorites || 0);
    summary.douyinTraffic += Number(snapshot.summary?.douyinTraffic || 0);
    summary.xhsTraffic += Number(snapshot.summary?.xhsTraffic || 0);
    (snapshot.distribution || []).forEach((item) => {
      typeCounts[item.type] = (typeCounts[item.type] || 0) + Number(item.count || 0);
    });
  });

  const totalTypes = Object.values(typeCounts).reduce((sum, value) => sum + value, 0) || 1;
  const distribution = POST_TYPES.map((type) => ({
    type,
    count: typeCounts[type] || 0,
    ratio: `${Math.round(((typeCounts[type] || 0) / totalTypes) * 100)}%`
  }));

  return {
    summary,
    distribution,
    label: state.dashboardMode === "week"
      ? state.dashboardWeek
      : state.dashboardMode === "month"
        ? state.dashboardMonth
        : "累计到今天"
  };
}

function getPostsByDate(date) {
  const snapshot = getSnapshotByDate(date);
  if (snapshot?.postsMonitor) return snapshot.postsMonitor;
  return state.posts.filter((item) => item.publishedAt === date);
}

function getLeadsByDate(date) {
  const snapshot = getSnapshotByDate(date);
  if (snapshot?.leadsMonitor) return snapshot.leadsMonitor;
  return state.leads.filter((item) => String(item.createdAt).startsWith(date));
}

function getSnapshotDatesByMode(mode) {
  const allDates = getAllAvailableDataDates();
  if (mode === "day") return state.rankingsDate ? [state.rankingsDate] : [];
  if (mode === "week") {
    const weekDates = new Set(getDatesInWeek(state.rankingsWeek));
    return allDates.filter((date) => weekDates.has(date));
  }
  if (mode === "month") {
    return allDates.filter((date) => date.startsWith(`${state.rankingsMonth}-`));
  }
  return allDates;
}

function getRankingRows(mode, type) {
  const dates = getSnapshotDatesByMode(mode);
  const postsInRange = state.posts.filter((item) => item.publishedAt && dates.includes(item.publishedAt));
  const leadsInRange = state.leads.filter((item) => {
    const leadDate = String(item.createdAt || "").slice(0, 10);
    return leadDate && dates.includes(leadDate);
  });
  const employeeMap = new Map(
    state.employees.map((employee) => [employee.id, {
      employeeId: employee.id,
      name: employee.name,
      accountCount: state.accounts.filter((account) => account.employeeId === employee.id).length,
      douyinPosts: 0,
      xhsPosts: 0,
      leadPostCount: 0,
      todayPosts: 0,
      todayLeads: 0
    }])
  );
  postsInRange.forEach((post) => {
    const target = employeeMap.get(post.employeeId);
    if (!target) return;
    target.todayPosts += 1;
    if (post.platform === "抖音") target.douyinPosts += 1;
    if (post.platform === "小红书") target.xhsPosts += 1;
    if (post.postType === "获客贴") target.leadPostCount += 1;
  });
  leadsInRange.forEach((lead) => {
    const target = employeeMap.get(lead.employeeId);
    if (!target) return;
    target.todayLeads += 1;
  });
  const keyMap = {
    leads: "todayLeads",
    posts: "todayPosts"
  };

  return Array.from(employeeMap.values())
    .filter((item) => item.todayPosts > 0 || item.todayLeads > 0)
    .sort((a, b) => b[keyMap[type]] - a[keyMap[type]])
    .map((item, index) => ({ rank: index + 1, ...item }));
}

function getPostsByDates(dates) {
  return Array.from(new Map(
    dates
      .flatMap((date) => getPostsByDate(date))
      .map((item) => [item.id, item])
  ).values());
}

function getDashboardRefreshPosts() {
  return getPostsByDates(getDashboardSnapshotDates());
}

function getRankingRefreshPosts() {
  return getPostsByDates(getSnapshotDatesByMode(state.rankingsMode));
}

function getAnalyticsRefreshPosts() {
  return getPostsByDates(getAnalyticsSnapshotDates());
}

function getLeadRefreshPosts() {
  const visibleLeads = getLeadsForMonitor().filter((item) => {
    if (state.leadMonitorEmployeeFilter && item.employeeId !== state.leadMonitorEmployeeFilter) return false;
    if (state.leadMonitorAccountFilter && item.accountId !== state.leadMonitorAccountFilter) return false;
    if (state.leadMonitorPlatformFilter && item.platform !== state.leadMonitorPlatformFilter) return false;
    if (state.leadMonitorPostTypeFilter && item.sourcePostType !== state.leadMonitorPostTypeFilter) return false;
    if (state.leadMonitorStatusFilter && item.status !== state.leadMonitorStatusFilter) return false;
    return true;
  });
  const postIds = new Set(visibleLeads.map((item) => item.postId).filter(Boolean));
  if (postIds.size) {
    return state.posts.filter((item) => postIds.has(item.id));
  }
  return getPostsByDates(
    state.leadMonitorMode === "week"
      ? getDatesInWeek(state.leadMonitorWeek)
      : [state.leadMonitorDate]
  );
}

function getScopedRefreshPostIds() {
  const viewPosts = {
    dashboard: getDashboardRefreshPosts(),
    rankings: getRankingRefreshPosts(),
    posts: getPostsForMonitor().filter((item) => {
      if (state.postMonitorEmployeeFilter && item.employeeId !== state.postMonitorEmployeeFilter) return false;
      if (state.postMonitorTypeFilter && item.postType !== state.postMonitorTypeFilter) return false;
      if (state.postMonitorPlatformFilter && item.platform !== state.postMonitorPlatformFilter) return false;
      return true;
    }),
    leads: getLeadRefreshPosts(),
    analytics: getAnalyticsRefreshPosts()
  }[state.currentView] || [];

  return Array.from(new Set(
    viewPosts
      .filter(Boolean)
      .map((item) => item.id)
  ));
}

function applyQuickTimeShortcut(scope, action) {
  const today = new Date().toLocaleDateString("en-CA");
  const currentWeek = getCurrentWeekString();
  const currentMonth = today.slice(0, 7);
  const yesterday = getYesterdayDateString();
  const previousMonth = getPreviousMonthString(currentMonth);

  switch (scope) {
    case "dashboard":
      if (action === "today") {
        state.dashboardMode = "day";
        state.dashboardDate = today;
      } else if (action === "week") {
        state.dashboardMode = "week";
        state.dashboardWeek = currentWeek;
      } else if (action === "month") {
        state.dashboardMode = "month";
        state.dashboardMonth = currentMonth;
      } else if (action === "all") {
        state.dashboardMode = "all";
      }
      break;
    case "post-monitor":
      if (action === "today") {
        state.postMonitorMode = "day";
        state.postMonitorDate = today;
      } else if (action === "week") {
        state.postMonitorMode = "week";
        state.postMonitorWeek = currentWeek;
      } else if (action === "month") {
        state.postMonitorMode = "month";
        state.postMonitorMonth = currentMonth;
      }
      break;
    case "lead-monitor":
      if (action === "today") {
        state.leadMonitorMode = "day";
        state.leadMonitorDate = today;
      } else if (action === "week") {
        state.leadMonitorMode = "week";
        state.leadMonitorWeek = currentWeek;
      }
      break;
    case "analytics":
      if (action === "today") {
        state.analyticsMode = "day";
        state.analyticsDate = today;
      } else if (action === "week") {
        state.analyticsMode = "week";
        state.analyticsWeek = currentWeek;
      } else if (action === "month") {
        state.analyticsMode = "month";
        state.analyticsMonth = currentMonth;
      } else if (action === "all") {
        state.analyticsMode = "all";
      }
      break;
    case "staff-gallery":
      if (action === "today") {
        state.staffGalleryMode = "day";
        state.staffGalleryDate = today;
      } else if (action === "week") {
        state.staffGalleryMode = "week";
        state.staffGalleryWeek = currentWeek;
      } else if (action === "month") {
        state.staffGalleryMode = "month";
        state.staffGalleryMonth = currentMonth;
      } else if (action === "all") {
        state.staffGalleryMode = "all";
      }
      break;
    case "staff-rankings":
      if (action === "today") {
        state.staffRankingsMode = "day";
        state.staffRankingsDate = today;
      } else if (action === "week") {
        state.staffRankingsMode = "week";
        state.staffRankingsWeek = currentWeek;
      } else if (action === "month") {
        state.staffRankingsMode = "month";
        state.staffRankingsMonth = currentMonth;
      } else if (action === "all") {
        state.staffRankingsMode = "all";
      }
      break;
    case "account-viz-month":
      state.accountVizMonth = action === "last-month" ? previousMonth : currentMonth;
      break;
    case "personal-board-month":
      state.personalBoardMonth = action === "last-month" ? previousMonth : currentMonth;
      break;
    case "staff-posts-date":
      state.staffPostsDate = action === "yesterday" ? yesterday : today;
      break;
    case "staff-leads-date":
      state.staffLeadsDate = action === "yesterday" ? yesterday : today;
      break;
    default:
      return;
  }

  renderApp();
}

function bindViewEvents() {
  document.getElementById("employeeForm")?.addEventListener("submit", submitEmployee);
  document.getElementById("staffUserForm")?.addEventListener("submit", submitStaffUser);
  document.getElementById("accountForm")?.addEventListener("submit", submitAccount);
  document.getElementById("postForm")?.addEventListener("submit", submitPost);
  document.getElementById("leadForm")?.addEventListener("submit", submitLead);
  document.querySelectorAll(".js-staff-posting-plan-form").forEach((form) => form.addEventListener("submit", submitStaffPostingPlan));
  document.querySelectorAll(".js-sales-feedback-form").forEach((form) => form.addEventListener("submit", submitSalesLead));
  document.querySelectorAll(".js-lead-note-form").forEach((form) => form.addEventListener("submit", submitLeadNote));
  document.querySelectorAll(".js-sales-local-profile-form").forEach((form) => form.addEventListener("submit", submitSalesLocalProfile));
  document.getElementById("leadCaptureInput")?.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    setPendingLeadCapture(file);
    renderApp();
  });
  document.querySelector('#leadForm select[name="accountId"]')?.addEventListener("change", (event) => {
    const postSelect = document.getElementById("leadPostSelect");
    if (!postSelect) return;
    const posts = getAccountSourcePosts(event.target.value);
    postSelect.innerHTML = posts.length
      ? posts.map((item, index) => `<option value="${item.id}" ${index === 0 ? "selected" : ""}>${item.title || "未命名作品"} · ${item.postType}</option>`).join("")
      : `<option value="">该账号下暂无作品，请先录入作品</option>`;
  });
  document.getElementById("flashCloseBtn")?.addEventListener("click", () => {
    clearFlash();
    renderApp();
  });
  document.getElementById("notificationToggleBtn")?.addEventListener("click", () => {
    state.notificationPanelOpen = !state.notificationPanelOpen;
    renderApp();
  });
  document.getElementById("notificationCloseBtn")?.addEventListener("click", () => {
    state.notificationPanelOpen = false;
    renderApp();
  });
  document.getElementById("dashboardDateInput")?.addEventListener("change", (event) => {
    state.dashboardDate = event.target.value;
    renderApp();
  });
  document.getElementById("dashboardMonthInput")?.addEventListener("change", (event) => {
    state.dashboardMonth = event.target.value;
    renderApp();
  });
  document.getElementById("dashboardWeekInput")?.addEventListener("change", (event) => {
    state.dashboardWeek = event.target.value;
    renderApp();
  });
  document.getElementById("dashboardModeInput")?.addEventListener("change", (event) => {
    state.dashboardMode = event.target.value;
    renderApp();
  });
  document.getElementById("dashboardEmployeeSortInput")?.addEventListener("change", (event) => {
    state.dashboardEmployeeSort = event.target.value;
    renderApp();
  });
  document.getElementById("rankingsDateInput")?.addEventListener("change", (event) => {
    state.rankingsDate = event.target.value;
    renderApp();
  });
  document.getElementById("rankingsMonthInput")?.addEventListener("change", (event) => {
    state.rankingsMonth = event.target.value;
    renderApp();
  });
  document.getElementById("rankingsWeekInput")?.addEventListener("change", (event) => {
    state.rankingsWeek = event.target.value;
    renderApp();
  });
  document.getElementById("rankingsModeInput")?.addEventListener("change", (event) => {
    state.rankingsMode = event.target.value;
    renderApp();
  });
  document.getElementById("postMonitorModeInput")?.addEventListener("change", (event) => {
    state.postMonitorMode = event.target.value;
    renderApp();
  });
  document.getElementById("postMonitorDateInput")?.addEventListener("change", (event) => {
    state.postMonitorDate = event.target.value;
    renderApp();
  });
  document.getElementById("postMonitorMonthInput")?.addEventListener("change", (event) => {
    state.postMonitorMonth = event.target.value;
    renderApp();
  });
  document.getElementById("postMonitorWeekInput")?.addEventListener("change", (event) => {
    state.postMonitorWeek = event.target.value;
    renderApp();
  });
  document.getElementById("leadMonitorModeInput")?.addEventListener("change", (event) => {
    state.leadMonitorMode = event.target.value;
    renderApp();
  });
  document.getElementById("leadMonitorDateInput")?.addEventListener("change", (event) => {
    state.leadMonitorDate = event.target.value;
    renderApp();
  });
  document.getElementById("leadMonitorWeekInput")?.addEventListener("change", (event) => {
    state.leadMonitorWeek = event.target.value;
    renderApp();
  });
  document.getElementById("analyticsDateInput")?.addEventListener("change", (event) => {
    state.analyticsDate = event.target.value;
    renderApp();
  });
  document.getElementById("analyticsMonthInput")?.addEventListener("change", (event) => {
    state.analyticsMonth = event.target.value;
    renderApp();
  });
  document.getElementById("analyticsWeekInput")?.addEventListener("change", (event) => {
    state.analyticsWeek = event.target.value;
    renderApp();
  });
  document.getElementById("analyticsModeInput")?.addEventListener("change", (event) => {
    state.analyticsMode = event.target.value;
    renderApp();
  });
  document.getElementById("reviewObjectFilter")?.addEventListener("change", (event) => {
    state.reviewObjectFilter = event.target.value;
    renderApp();
  });
  document.getElementById("reviewStatusFilter")?.addEventListener("change", (event) => {
    state.reviewStatusFilter = event.target.value;
    renderApp();
  });
  document.getElementById("reviewSampleFilter")?.addEventListener("change", (event) => {
    state.reviewSampleFilter = event.target.value;
    renderApp();
  });
  document.getElementById("accountVizMonthInput")?.addEventListener("change", (event) => {
    state.accountVizMonth = event.target.value;
    renderApp();
  });
  document.getElementById("accountVizEmployeeFilter")?.addEventListener("change", (event) => {
    state.accountVizEmployeeFilter = event.target.value;
    state.accountVizSelectedAccountId = "";
    renderApp();
  });
  document.getElementById("accountVizPlatformFilter")?.addEventListener("change", (event) => {
    state.accountVizPlatformFilter = event.target.value;
    state.accountVizSelectedAccountId = "";
    renderApp();
  });
  document.getElementById("accountVizComparePlatformFilter")?.addEventListener("change", (event) => {
    state.accountVizComparePlatformFilter = event.target.value;
    renderApp();
  });
  document.getElementById("accountVizAccountFilter")?.addEventListener("change", (event) => {
    state.accountVizSelectedAccountId = event.target.value;
    renderApp();
  });
  document.getElementById("personalBoardEmployeeInput")?.addEventListener("change", (event) => {
    state.personalBoardEmployeeId = event.target.value;
    state.personalBoardAccountFilter = "";
    renderApp();
  });
  document.getElementById("personalBoardMonthInput")?.addEventListener("change", (event) => {
    state.personalBoardMonth = event.target.value;
    renderApp();
  });
  document.getElementById("personalBoardPlatformInput")?.addEventListener("change", (event) => {
    state.personalBoardPlatform = event.target.value;
    state.personalBoardAccountFilter = "";
    renderApp();
  });
  document.querySelectorAll(".js-personal-account-filter").forEach((el) => el.addEventListener("change", () => {
    state.personalBoardAccountFilter = el.value || "";
    renderApp();
  }));
  document.getElementById("staffPostsDateInput")?.addEventListener("change", (event) => {
    state.staffPostsDate = event.target.value;
    renderApp();
  });
  document.getElementById("staffPostsAccountFilter")?.addEventListener("change", (event) => {
    state.staffPostsAccountFilter = event.target.value;
    renderApp();
  });
  document.getElementById("staffPostsTypeFilter")?.addEventListener("change", (event) => {
    state.staffPostsTypeFilter = event.target.value;
    renderApp();
  });
  document.getElementById("staffGalleryModeInput")?.addEventListener("change", (event) => {
    state.staffGalleryMode = event.target.value;
    renderApp();
  });
  document.getElementById("staffGalleryDateInput")?.addEventListener("change", (event) => {
    state.staffGalleryDate = event.target.value;
    renderApp();
  });
  document.getElementById("staffGalleryWeekInput")?.addEventListener("change", (event) => {
    state.staffGalleryWeek = event.target.value;
    renderApp();
  });
  document.getElementById("staffGalleryMonthInput")?.addEventListener("change", (event) => {
    state.staffGalleryMonth = event.target.value;
    renderApp();
  });
  document.getElementById("staffGalleryScopeInput")?.addEventListener("change", (event) => {
    state.staffGalleryScope = event.target.value;
    renderApp();
  });
  document.getElementById("staffGalleryPlatformFilter")?.addEventListener("change", (event) => {
    state.staffGalleryPlatformFilter = event.target.value;
    renderApp();
  });
  document.getElementById("staffGalleryTypeFilter")?.addEventListener("change", (event) => {
    state.staffGalleryTypeFilter = event.target.value;
    renderApp();
  });
  document.getElementById("staffGalleryEmployeeFilter")?.addEventListener("change", (event) => {
    state.staffGalleryEmployeeFilter = event.target.value;
    renderApp();
  });
  document.getElementById("staffRankingsModeInput")?.addEventListener("change", (event) => {
    state.staffRankingsMode = event.target.value;
    state.staffRankingsAccountFilter = "";
    state.staffRankingsLeadFilter = "";
    renderApp();
  });
  document.getElementById("staffRankingsDateInput")?.addEventListener("change", (event) => {
    state.staffRankingsDate = event.target.value;
    renderApp();
  });
  document.getElementById("staffRankingsWeekInput")?.addEventListener("change", (event) => {
    state.staffRankingsWeek = event.target.value;
    renderApp();
  });
  document.getElementById("staffRankingsMonthInput")?.addEventListener("change", (event) => {
    state.staffRankingsMonth = event.target.value;
    renderApp();
  });
  document.getElementById("staffRankingsAccountFilter")?.addEventListener("change", (event) => {
    state.staffRankingsAccountFilter = event.target.value;
    renderApp();
  });
  document.getElementById("staffRankingsLeadFilter")?.addEventListener("change", (event) => {
    state.staffRankingsLeadFilter = event.target.value;
    renderApp();
  });
  document.getElementById("staffRankingsPostSort")?.addEventListener("change", (event) => {
    state.staffRankingsPostSort = event.target.value;
    renderApp();
  });
  document.getElementById("staffLeadsDateInput")?.addEventListener("change", (event) => {
    state.staffLeadsDate = event.target.value;
    renderApp();
  });
  document.getElementById("postMonitorEmployeeFilter")?.addEventListener("change", (event) => {
    state.postMonitorEmployeeFilter = event.target.value;
    state.postMonitorAccountFilter = "";
    renderApp();
  });
  document.getElementById("postMonitorPlatformFilter")?.addEventListener("change", (event) => {
    state.postMonitorPlatformFilter = event.target.value;
    state.postMonitorAccountFilter = "";
    renderApp();
  });
  document.getElementById("postMonitorAccountFilter")?.addEventListener("change", (event) => {
    state.postMonitorAccountFilter = event.target.value;
    renderApp();
  });
  document.getElementById("postMonitorSortInput")?.addEventListener("change", (event) => {
    state.postMonitorSort = event.target.value;
    renderApp();
  });
  document.getElementById("leadMonitorEmployeeFilter")?.addEventListener("change", (event) => {
    state.leadMonitorEmployeeFilter = event.target.value;
    state.leadMonitorAccountFilter = "";
    renderApp();
  });
  document.getElementById("leadMonitorAccountFilter")?.addEventListener("change", (event) => {
    state.leadMonitorAccountFilter = event.target.value;
    renderApp();
  });
  document.getElementById("leadMonitorPlatformFilter")?.addEventListener("change", (event) => {
    state.leadMonitorPlatformFilter = event.target.value;
    state.leadMonitorAccountFilter = "";
    renderApp();
  });
  document.getElementById("leadMonitorPostTypeFilter")?.addEventListener("change", (event) => {
    state.leadMonitorPostTypeFilter = event.target.value;
    renderApp();
  });
  document.getElementById("leadMonitorStatusFilter")?.addEventListener("change", (event) => {
    state.leadMonitorStatusFilter = event.target.value;
    renderApp();
  });
  document.getElementById("salesFollowupIntentionFilter")?.addEventListener("change", (event) => {
    state.salesFollowupIntentionFilter = event.target.value;
    renderApp();
  });
  document.getElementById("salesFollowupPlatformFilter")?.addEventListener("change", (event) => {
    state.salesFollowupPlatformFilter = event.target.value;
    state.salesFollowupAccountFilter = "";
    renderApp();
  });
  document.getElementById("salesFollowupAccountFilter")?.addEventListener("change", (event) => {
    state.salesFollowupAccountFilter = event.target.value;
    renderApp();
  });
  document.querySelector('#postForm select[name="postType"]')?.addEventListener("change", (event) => {
    const trafficField = document.getElementById("postTrafficField");
    const trafficInput = document.querySelector('#postForm input[name="traffic"]');
    const isLeadPost = event.target.value === "获客贴";
    if (trafficField) {
      trafficField.style.display = isLeadPost ? "" : "none";
    }
    if (!isLeadPost && trafficInput) {
      trafficInput.value = "";
    }
  });
  document.getElementById("postCoverInput")?.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setPendingPostCover(file);
    renderApp();
  });
  document.getElementById("postCoverPasteHint")?.addEventListener("paste", (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => String(item.type || "").startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setPendingPostCover(file);
    setFlash("success", "封面已粘贴", "可以继续填写其他信息，提交时会一起上传这张封面。");
    renderApp();
  });
  document.getElementById("postForm")?.addEventListener("paste", (event) => {
    const active = document.activeElement;
    if (active && ["INPUT", "TEXTAREA"].includes(active.tagName) && active !== document.getElementById("postCoverPasteHint")) return;
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => String(item.type || "").startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setPendingPostCover(file);
    setFlash("success", "封面已粘贴", "可以继续填写其他信息，提交时会一起上传这张封面。");
    renderApp();
  });
  document.getElementById("employeeSearchInput")?.addEventListener("input", (event) => {
    state.employeeSearch = event.target.value;
    renderApp();
  });
  document.getElementById("employeeStatusFilter")?.addEventListener("change", (event) => {
    state.employeeStatusFilter = event.target.value;
    renderApp();
  });
  document.getElementById("accountSearchInput")?.addEventListener("input", (event) => {
    state.accountSearch = event.target.value;
    renderApp();
  });
  document.getElementById("accountEmployeeFilter")?.addEventListener("change", (event) => {
    state.accountEmployeeFilter = event.target.value;
    renderApp();
  });
  document.getElementById("accountPlatformFilter")?.addEventListener("change", (event) => {
    state.accountPlatformFilter = event.target.value;
    renderApp();
  });
  document.querySelectorAll(".js-edit-employee").forEach((el) => el.addEventListener("click", () => { state.editingEmployeeId = el.dataset.id; renderApp(); }));
  document.querySelectorAll(".js-delete-employee").forEach((el) => el.addEventListener("click", () => deleteEmployee(el.dataset.id)));
  document.querySelectorAll(".js-edit-account").forEach((el) => el.addEventListener("click", () => { state.editingAccountId = el.dataset.id; renderApp(); }));
  document.querySelectorAll(".js-delete-account").forEach((el) => el.addEventListener("click", () => deleteAccount(el.dataset.id)));
  document.querySelectorAll(".js-edit-post").forEach((el) => el.addEventListener("click", () => { clearPendingPostCover(); state.editingPostId = el.dataset.id; state.currentView = state.user.role === "admin" ? "posts" : "post-entry"; renderApp(); }));
  document.querySelectorAll(".js-delete-post").forEach((el) => el.addEventListener("click", () => deletePost(el.dataset.id)));
  document.querySelectorAll(".js-save-post-suggestion").forEach((el) => el.addEventListener("click", () => savePostSuggestion(el.dataset.id)));
  document.getElementById("rollbackSnapshotDateInput")?.addEventListener("change", (event) => {
    state.rollbackSnapshotDate = event.target.value;
  });
  document.getElementById("refreshScopedMetricsBtn")?.addEventListener("click", refreshScopedMetrics);
  document.getElementById("rollbackScopedMetricsBtn")?.addEventListener("click", rollbackScopedMetrics);
  document.querySelectorAll(".js-edit-lead").forEach((el) => el.addEventListener("click", () => { clearPendingLeadCapture(); state.editingLeadId = el.dataset.id; state.currentView = state.user.role === "admin" ? "leads" : state.user.role === "sales" ? "sales-leads" : "lead-entry"; renderApp(); }));
  document.querySelectorAll(".js-edit-followup").forEach((el) => el.addEventListener("click", () => {
    clearPendingLeadCapture();
    state.editingLeadId = el.dataset.id;
    state.currentView = "sales-followups";
    renderApp();
  }));
  document.querySelectorAll(".js-edit-sales-local-profile").forEach((el) => el.addEventListener("click", () => {
    state.editingSalesLeadProfileId = el.dataset.id;
    state.currentView = "sales-followups";
    renderApp();
  }));
  document.querySelectorAll(".js-edit-lead-note").forEach((el) => el.addEventListener("click", () => {
    clearPendingLeadCapture();
    state.editingLeadNoteId = el.dataset.id;
    state.currentView = "sales-followups";
    renderApp();
  }));
  document.querySelectorAll(".js-delete-lead").forEach((el) => el.addEventListener("click", () => deleteLead(el.dataset.id)));
  document.querySelectorAll(".js-remind-lead").forEach((el) => el.addEventListener("click", () => remindLead(el.dataset.id, el.dataset.target)));
  document.querySelectorAll(".js-update-lead-process").forEach((el) => el.addEventListener("click", () => updateLeadBoardState(el.dataset.id, { processStatus: el.dataset.status || "未接" })));
  document.querySelectorAll(".js-update-lead-add").forEach((el) => el.addEventListener("click", () => updateLeadBoardState(el.dataset.id, { addStatus: el.dataset.status || "未添加" })));
  document.querySelectorAll(".js-lead-intention").forEach((el) => el.addEventListener("change", () => updateLeadBoardState(el.dataset.id, { intention: el.value || "" })));
  document.querySelectorAll(".js-sales-process-select").forEach((el) => el.addEventListener("change", () => updateLeadBoardState(el.dataset.id, { processStatus: el.value || "未接" })));
  document.querySelectorAll(".js-sales-process-toggle").forEach((el) => el.addEventListener("change", () => updateLeadBoardState(el.dataset.id, { processStatus: el.checked ? "已接" : "未接" })));
  document.querySelectorAll(".js-sales-add-toggle").forEach((el) => el.addEventListener("change", () => updateLeadBoardState(el.dataset.id, { addStatus: el.checked ? "已添加" : "未添加" })));
  document.querySelectorAll(".js-lead-sales-assign").forEach((el) => el.addEventListener("change", () => {
    const selected = el.options[el.selectedIndex];
    updateLeadBoardState(el.dataset.id, {
      assignedSalesUserId: el.value || "",
      assignedSalesUserName: selected?.dataset?.name || ""
    });
  }));
  document.querySelector(".js-cancel-employee")?.addEventListener("click", () => { state.editingEmployeeId = ""; renderApp(); });
  document.querySelector(".js-cancel-account")?.addEventListener("click", () => { state.editingAccountId = ""; renderApp(); });
  document.querySelector(".js-cancel-post")?.addEventListener("click", () => { clearPendingPostCover(); state.editingPostId = ""; renderApp(); });
  document.querySelector(".js-cancel-lead")?.addEventListener("click", () => { clearPendingLeadCapture(); state.editingLeadId = ""; renderApp(); });
  document.querySelector(".js-cancel-lead-note")?.addEventListener("click", () => { clearPendingLeadCapture(); state.editingLeadNoteId = ""; renderApp(); });
  document.querySelector(".js-cancel-sales-local-profile")?.addEventListener("click", () => { state.editingSalesLeadProfileId = ""; renderApp(); });
  document.querySelectorAll(".js-toggle-tomorrow-followup").forEach((el) => el.addEventListener("change", () => toggleTomorrowFollowup(el.dataset.id, el.checked)));
  document.querySelector(".js-toggle-tomorrow-followups")?.addEventListener("click", () => {
    if (!state.salesTomorrowFollowupIds.length) return;
    state.salesTomorrowFollowupPanelOpen = !state.salesTomorrowFollowupPanelOpen;
    renderApp();
  });
  document.querySelector(".js-close-tomorrow-followups")?.addEventListener("click", () => {
    state.salesTomorrowFollowupPanelOpen = false;
    renderApp();
  });
  document.querySelectorAll(".js-complete-tomorrow-followup").forEach((el) => el.addEventListener("click", () => completeTomorrowFollowup(el.dataset.id)));
  document.querySelectorAll(".rank-switch").forEach((button) => {
    button.addEventListener("click", async () => {
      state.rankingsType = button.dataset.type;
      state.rankings = await api(`/api/rankings?type=${button.dataset.type}`);
      renderApp();
    });
  });
  document.querySelectorAll(".js-staff-rank-switch").forEach((button) => {
    button.addEventListener("click", () => {
      state.staffRankingsType = button.dataset.type;
      renderApp();
    });
  });
  document.querySelectorAll(".js-time-quick").forEach((button) => {
    button.addEventListener("click", () => applyQuickTimeShortcut(button.dataset.scope, button.dataset.action));
  });
  document.querySelectorAll(".js-notification-item").forEach((button) => {
    button.addEventListener("click", () => markNotificationRead(button.dataset.id));
  });
  document.querySelectorAll(".js-toggle-learning-post").forEach((button) => {
    button.addEventListener("click", () => toggleStaffLearningPost(button.dataset.id));
  });
  document.querySelectorAll(".js-filter-gallery-owner, .js-open-ranking-owner").forEach((button) => {
    button.addEventListener("click", () => {
      state.staffGalleryEmployeeFilter = button.dataset.owner || "";
      state.staffGalleryScope = "all";
      state.currentView = "gallery";
      renderApp();
    });
  });
}

function bindDelegatedEvents() {
  if (delegatedEventsBound) return;
  delegatedEventsBound = true;

  app.addEventListener("click", (event) => {
    const imageTrigger = event.target.closest(".js-open-image");
    if (imageTrigger) {
      event.preventDefault();
      state.previewImageUrl = imageTrigger.dataset.src || "";
      renderApp();
      return;
    }

    const closeImageTrigger = event.target.closest(".js-close-image-viewer");
    if (closeImageTrigger) {
      event.preventDefault();
      state.previewImageUrl = "";
      renderApp();
      return;
    }

    const externalTrigger = event.target.closest(".js-open-external");
    if (externalTrigger) {
      event.preventDefault();
      const url = normalizeExternalUrl(externalTrigger.dataset.url || "");
      if (!url) return;
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (!popup) {
        window.location.href = url;
      }
      return;
    }

    const copyContactTrigger = event.target.closest(".js-copy-contact");
    if (copyContactTrigger) {
      event.preventDefault();
      copyContactInfo(copyContactTrigger.dataset.contact || "");
      return;
    }

    const clearContextTrigger = event.target.closest(".js-clear-view-context");
    if (clearContextTrigger) {
      event.preventDefault();
      state.viewContext = null;
      renderApp();
      return;
    }

    const selectAccountVizTrigger = event.target.closest(".js-select-account-viz");
    if (selectAccountVizTrigger) {
      event.preventDefault();
      state.accountVizSelectedAccountId = selectAccountVizTrigger.dataset.id || "";
      renderApp();
      return;
    }

    const openPostsContextTrigger = event.target.closest(".js-open-posts-context");
    if (openPostsContextTrigger) {
      event.preventDefault();
      openPostsMonitorWithContext({
        employeeId: openPostsContextTrigger.dataset.employee || "",
        platform: openPostsContextTrigger.dataset.platform || "",
        postType: openPostsContextTrigger.dataset.postType || "",
        mode: openPostsContextTrigger.dataset.mode || "day",
        date: openPostsContextTrigger.dataset.date || "",
        week: openPostsContextTrigger.dataset.week || ""
      });
      return;
    }

    const openLeadsContextTrigger = event.target.closest(".js-open-leads-context");
    if (openLeadsContextTrigger) {
      event.preventDefault();
      openLeadsMonitorWithContext({
        employeeId: openLeadsContextTrigger.dataset.employee || "",
        accountId: openLeadsContextTrigger.dataset.account || "",
        platform: openLeadsContextTrigger.dataset.platform || "",
        status: openLeadsContextTrigger.dataset.status || "",
        mode: openLeadsContextTrigger.dataset.mode || "day",
        date: openLeadsContextTrigger.dataset.date || "",
        week: openLeadsContextTrigger.dataset.week || ""
      });
      return;
    }

    const openAccountVizContextTrigger = event.target.closest(".js-open-account-viz-context");
    if (openAccountVizContextTrigger) {
      event.preventDefault();
      openAccountVisualizationWithContext({
        employeeId: openAccountVizContextTrigger.dataset.employee || "",
        accountId: openAccountVizContextTrigger.dataset.account || "",
        platform: openAccountVizContextTrigger.dataset.platform || "",
        month: openAccountVizContextTrigger.dataset.month || ""
      });
      return;
    }

    const reviewHighlightTrigger = event.target.closest(".js-review-highlight");
    if (reviewHighlightTrigger) {
      event.preventDefault();
      const payload = JSON.parse(reviewHighlightTrigger.dataset.review || "{}");
      toggleReviewHighlight(payload);
      return;
    }

    const reviewGoodTrigger = event.target.closest(".js-review-sample-good");
    if (reviewGoodTrigger) {
      event.preventDefault();
      const payload = JSON.parse(reviewGoodTrigger.dataset.review || "{}");
      toggleReviewSample({ ...payload, sampleType: "good" });
      return;
    }

    const reviewBadTrigger = event.target.closest(".js-review-sample-bad");
    if (reviewBadTrigger) {
      event.preventDefault();
      const payload = JSON.parse(reviewBadTrigger.dataset.review || "{}");
      toggleReviewSample({ ...payload, sampleType: "bad" });
      return;
    }

    const reviewStatusTrigger = event.target.closest(".js-review-status");
    if (reviewStatusTrigger) {
      event.preventDefault();
      updateReviewStatus(reviewStatusTrigger.dataset.kind, reviewStatusTrigger.dataset.id, reviewStatusTrigger.dataset.status);
      return;
    }

    const reviewNoteTrigger = event.target.closest(".js-review-note");
    if (reviewNoteTrigger) {
      event.preventDefault();
      openReviewNoteDialog(reviewNoteTrigger.dataset.kind, reviewNoteTrigger.dataset.id);
      return;
    }

    const closeReviewNoteDialogTrigger = event.target.closest(".js-close-review-note-dialog");
    if (closeReviewNoteDialogTrigger) {
      event.preventDefault();
      closeReviewNoteDialog();
      renderApp();
    }
  });
}

async function submitEmployee(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const id = String(formData.get("id") || "");
  await api(id ? `/api/employees/${id}` : "/api/employees", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify({
      name: String(formData.get("name")).trim(),
      phone: String(formData.get("phone")).trim(),
      hireDate: String(formData.get("hireDate")).trim(),
      status: String(formData.get("status")).trim()
    })
  });
  state.editingEmployeeId = "";
  setFlash("success", id ? "员工信息已更新" : "员工已创建", "现在可以继续给员工绑定账号，或直接创建登录账号。");
  await loadData();
  renderApp();
}

async function submitAccount(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());
  const id = String(payload.id || "");
  delete payload.id;
  await api(id ? `/api/accounts/${id}` : "/api/accounts", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  state.editingAccountId = "";
  setFlash("success", id ? "账号信息已更新" : "账号已创建", "账号已经进入主管端管理范围，员工录作品时就能选择它。");
  await loadData();
  renderApp();
}

async function submitStaffPostingPlan(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const id = String(formData.get("id") || "");
  await api(`/api/accounts/${id}/posting-plan`, {
    method: "PUT",
    body: JSON.stringify({
      postingPlan: String(formData.get("postingPlan") || "")
    })
  });
  setFlash("success", "账号规划已保存", "主管端作品看板现在可以同步查看这条账号规划。");
  await loadData();
  renderApp();
}

async function deleteEmployee(id) {
  if (!window.confirm("确认删除该员工及其关联数据吗？")) return;
  await api(`/api/employees/${id}`, { method: "DELETE" });
  state.editingEmployeeId = state.editingEmployeeId === id ? "" : state.editingEmployeeId;
  await loadData();
  renderApp();
}

async function deleteAccount(id) {
  if (!window.confirm("确认删除该账号及其关联作品/客资吗？")) return;
  await api(`/api/accounts/${id}`, { method: "DELETE" });
  state.editingAccountId = state.editingAccountId === id ? "" : state.editingAccountId;
  await loadData();
  renderApp();
}

async function deletePost(id) {
  if (!window.confirm("确认删除该作品吗？")) return;
  await api(`/api/posts/${id}`, { method: "DELETE" });
  state.editingPostId = state.editingPostId === id ? "" : state.editingPostId;
  await loadData();
  renderApp();
}

async function deleteLead(id) {
  if (!window.confirm("确认删除该客资吗？")) return;
  await api(`/api/leads/${id}`, { method: "DELETE" });
  state.editingLeadId = state.editingLeadId === id ? "" : state.editingLeadId;
  await loadData();
  renderApp();
}

async function submitStaffUser(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  await api("/api/users/staff", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(formData.entries()))
  });
  setFlash("success", "员工登录账号已创建", "把用户名和密码发给对应员工，他就可以开始录作品和客资。");
  await loadData();
  renderApp();
}

async function submitPost(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const id = String(formData.get("id") || "");
  if (state.postCoverFile) {
    formData.set("coverImage", state.postCoverFile, state.postCoverFile.name || "pasted-cover.png");
  }
  const result = await api(id ? `/api/posts/${id}` : "/api/posts", {
    method: id ? "PUT" : "POST",
    body: formData
  });
  clearPendingPostCover();
  state.editingPostId = "";
  setFlash("success", id ? "作品已更新" : "作品已提交", "这条作品已经写入后台，主管端同步看板后会立刻看到。");
  await loadData();
  renderApp();
  if (result.metricsSyncError) {
    alert(`作品已保存，但互动数据暂未自动抓到：${result.metricsSyncError}`);
  }
}

async function savePostSuggestion(id) {
  const input = document.querySelector(`.post-board-suggestion-input[data-id="${id}"]`);
  if (!input) return;
  await api(`/api/posts/${id}/supervisor-suggestion`, {
    method: "PUT",
    body: JSON.stringify({
      supervisorSuggestion: input.value || ""
    })
  });
  setFlash("success", "主管建议已保存", "员工端这条作品会同步显示这条建议。");
  await loadData();
  renderApp();
}

async function refreshScopedMetrics() {
  try {
    const result = await api("/api/dashboard/refresh-entered-data", { method: "POST" });
    setFlash("success", "看板数据已同步", `已按员工当前录入的数据同步作品 ${result.postCount} 条、客资 ${result.leadCount} 条。`);
    await loadData();
    renderApp();
  } catch (error) {
    alert(error.message);
  }
}

async function rollbackScopedMetrics() {
  const postIds = getScopedRefreshPostIds();
  if (!postIds.length) {
    alert("当前范围内没有可回退的作品。");
    return;
  }

  if (!state.rollbackSnapshotDate) {
    alert("请先选择一个回退日期。");
    return;
  }

  if (!window.confirm(`确认将当前范围内作品的互动数据回退到 ${state.rollbackSnapshotDate} 的快照吗？`)) {
    return;
  }

  const password = window.prompt("请输入当前账号密码后再执行回退：", "");
  if (password === null) {
    return;
  }
  if (!String(password).trim()) {
    alert("未输入密码，已取消回退。");
    return;
  }

  try {
    const result = await api("/api/posts/rollback-metrics", {
      method: "POST",
      body: JSON.stringify({
        postIds,
        snapshotDate: state.rollbackSnapshotDate,
        password: String(password)
      })
    });
    await loadData();
    renderApp();
    const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
    alert(`已按 ${result.snapshotDate} 快照回退，成功 ${result.restored} 条，跳过 ${result.skipped} 条，失败 ${failedCount} 条。`);
  } catch (error) {
    alert(error.message);
  }
}

async function submitLead(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  if (state.leadCaptureFile) {
    formData.set("captureImage", state.leadCaptureFile, state.leadCaptureFile.name || "lead-capture.png");
  }
  if (!String(formData.get("postId") || "")) {
    alert("请选择这条客资对应的作品。");
    return;
  }
  const id = String(formData.get("id") || "");
  formData.delete("id");
  await api(id ? `/api/leads/${id}` : "/api/leads", {
    method: id ? "PUT" : "POST",
    body: formData
  });
  clearPendingLeadCapture();
  state.editingLeadId = "";
  setFlash("success", id ? "客资已更新" : "客资已录入", "这条客资已经保存到后台数据库，下方记录和主管端监控都会同步更新。");
  await loadData();
  renderApp();
}

async function submitSalesLead(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const id = String(formData.get("id") || "");
  formData.delete("id");
  await api(`/api/leads/${id}`, {
    method: "PUT",
    body: formData
  });
  state.editingLeadId = "";
  setFlash("success", "销售反馈已更新", "这条客资的状态和跟进反馈已经保存，主管端刷新后会同步看到。");
  await loadData();
  renderApp();
}

async function submitLeadNote(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const id = String(formData.get("id") || "");
  formData.delete("id");
  await api(`/api/leads/${id}`, {
    method: "PUT",
    body: formData
  });
  state.editingLeadNoteId = "";
  setFlash("success", "客资备注已更新", "这条客资的备注已经保存，后续跟进和主管复盘时都能看到。");
  await loadData();
  renderApp();
}

function submitSalesLocalProfile(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const id = String(formData.get("id") || "");
  const customerLabel = String(formData.get("customerLabel") || "").trim();
  state.salesLeadLocalProfiles = {
    ...(state.salesLeadLocalProfiles || {}),
    [id]: {
      customerLabel
    }
  };
  saveSalesLeadLocalProfiles();
  state.editingSalesLeadProfileId = "";
  renderApp();
}

function toggleTomorrowFollowup(id, checked) {
  const next = new Set(state.salesTomorrowFollowupIds || []);
  if (checked) next.add(id);
  else next.delete(id);
  state.salesTomorrowFollowupIds = Array.from(next);
  if (!state.salesTomorrowFollowupIds.length) {
    state.salesTomorrowFollowupPanelOpen = false;
  }
  saveSalesTomorrowFollowupIds();
  renderApp();
}

function completeTomorrowFollowup(id) {
  state.salesTomorrowFollowupIds = (state.salesTomorrowFollowupIds || []).filter((item) => item !== id);
  if (!state.salesTomorrowFollowupIds.length) {
    state.salesTomorrowFollowupPanelOpen = false;
  }
  saveSalesTomorrowFollowupIds();
  renderApp();
}

async function updateLeadBoardState(id, patch) {
  const current = state.leads.find((item) => item.id === id);
  if (!current) return;
  const payload = {
    assignedSalesUserId: patch.assignedSalesUserId ?? current.assignedSalesUserId ?? "",
    assignedSalesUserName: patch.assignedSalesUserName ?? current.assignedSalesUserName ?? (state.user?.role === "sales" ? (state.user.employeeName || state.user.username || "") : ""),
    processStatus: patch.processStatus ?? current.processStatus ?? "未接",
    addStatus: patch.addStatus ?? current.addStatus ?? "未添加",
    intention: patch.intention ?? current.intention ?? ""
  };
  if (state.user?.role === "sales" && !payload.assignedSalesUserName) {
    payload.assignedSalesUserName = state.user.employeeName || state.user.username || "";
    payload.assignedSalesUserId = state.user.id || "";
  }
  await api(`/api/leads/${id}/board`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  setFlash("success", "客资状态已更新", "这条客资的处理状态已经同步到看板。");
  await loadData();
  renderApp();
}

async function remindLead(id, target) {
  await api(`/api/leads/${id}/remind`, {
    method: "POST",
    body: JSON.stringify({ target })
  });
  await loadData();
  setFlash("success", "提醒已发送", target === "sales" ? "请及时添加" : "微信未同意提醒已发送给运营");
  renderApp();
}

async function markNotificationRead(id) {
  if (!id) return;
  await api(`/api/notifications/${id}/read`, {
    method: "POST"
  });
  await loadData();
  renderApp();
}

async function copyContactInfo(text) {
  const value = String(text || "").trim();
  if (!value) {
    setFlash("warn", "暂无可复制的联系方式");
    renderApp();
    return;
  }
  const fallbackCopy = () => {
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "readonly");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    helper.style.pointerEvents = "none";
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    helper.setSelectionRange(0, helper.value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(helper);
    return copied;
  };
  try {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        copied = fallbackCopy();
      }
    } else {
      copied = fallbackCopy();
    }
    if (!copied) {
      throw new Error("copy-failed");
    }
    setFlash("success", "联系方式已复制", value);
  } catch {
    setFlash("warn", "复制失败", "当前浏览器环境没有成功复制，请手动复制这条联系方式。");
  }
  renderApp();
}

function setFlash(type, title, message = "") {
  state.flash = { type, title, message };
}

function clearFlash() {
  state.flash = null;
}

function formatDate(value) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getYesterdayDateString() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString("en-CA");
}

function getPreviousMonthString(monthString = new Date().toLocaleDateString("en-CA").slice(0, 7)) {
  const [yearPart, monthPart] = String(monthString || "").split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!year || !month) return new Date().toLocaleDateString("en-CA").slice(0, 7);
  const current = new Date(year, month - 1, 1);
  current.setMonth(current.getMonth() - 1);
  return current.toLocaleDateString("en-CA").slice(0, 7);
}

function renderTimeQuickActions(scope, items) {
  if (!items?.length) return "";
  return `
    <div class="time-quick-actions">
      ${items.map((item) => `<button class="ghost js-time-quick" data-scope="${scope}" data-action="${item.action}" type="button">${item.label}</button>`).join("")}
    </div>
  `;
}

function stat(label, value, detail = "", badge = "") {
  const safeDetail = detail ? detail.replace(/"/g, "&quot;") : "";
  return `
    <article class="stat" ${safeDetail ? `title="${safeDetail}"` : ""}>
      <div class="stat-top">
        <span class="muted">${label}</span>
        ${badge ? `<span class="mini-tag">${badge}</span>` : ""}
      </div>
      <strong>${value}</strong>
    </article>
  `;
}

function escapeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getPostTypeTone(type) {
  if (type === "素人贴") return "people";
  if (type === "话题贴") return "topic";
  return "lead";
}

function getLeadIntentionChipClass(value) {
  if (value === "强意向") return "is-good";
  if (value === "弱") return "is-warn";
  if (value === "了解备用") return "is-info";
  return "is-muted";
}

function formatRatio(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0.00";
  return numeric.toFixed(2);
}

function buildTrafficDetail(summary, platform) {
  const value = platform === "douyin" ? Number(summary?.douyinTraffic || 0) : Number(summary?.xhsTraffic || 0);
  return value > 0
    ? "来源：员工录入的获客贴播放量汇总，不包含素人贴和话题贴。"
    : "当前暂无获客贴播放量录入，统计口径只读取员工填写的获客贴播放量。";
}

function getPostTraffic(post) {
  return post.postType === "获客贴" ? Number(post.traffic || 0) : "-";
}

function normalizeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

function getCurrentWeekString(date = new Date()) {
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);
  const day = current.getDay() || 7;
  current.setDate(current.getDate() + 4 - day);
  const yearStart = new Date(current.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((current - yearStart) / 86400000) + 1) / 7);
  return `${current.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getDatesInWeek(weekString) {
  if (!weekString) return [];
  const [yearPart, weekPart] = weekString.split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);
  if (!year || !week) return [];

  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - jan4Day + 1 + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(monday);
    current.setDate(monday.getDate() + index);
    return current.toLocaleDateString("en-CA");
  });
}

function getPostsForMonitor() {
  if (state.postMonitorMode === "week") {
    return getDatesInWeek(state.postMonitorWeek).flatMap((date) => getPostsByDate(date));
  }
  if (state.postMonitorMode === "month") {
    return getMonthDates(state.postMonitorMonth).flatMap((date) => getPostsByDate(date));
  }
  return getPostsByDate(state.postMonitorDate);
}

function getLeadsForMonitor() {
  if (state.leadMonitorMode === "week") {
    return getDatesInWeek(state.leadMonitorWeek).flatMap((date) => getLeadsByDate(date));
  }
  return getLeadsByDate(state.leadMonitorDate);
}

function getPostMonitorLabel() {
  if (state.postMonitorMode === "week") return state.postMonitorWeek;
  if (state.postMonitorMode === "month") return state.postMonitorMonth;
  return state.postMonitorDate;
}

function getLeadMonitorLabel() {
  return state.leadMonitorMode === "week" ? state.leadMonitorWeek : state.leadMonitorDate;
}

init();
