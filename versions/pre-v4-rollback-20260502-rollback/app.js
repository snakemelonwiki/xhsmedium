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
  accountVizSelectedAccountId: "",
  postMonitorDate: new Date().toLocaleDateString("en-CA"),
  postMonitorWeek: getCurrentWeekString(),
  postMonitorMode: "day",
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
  rollbackSnapshotDate: getYesterdayDateString(),
  staffPostsDate: "",
  staffPostsAccountFilter: "",
  staffPostsTypeFilter: "",
  staffLeadsDate: new Date().toLocaleDateString("en-CA"),
  editingEmployeeId: "",
  editingAccountId: "",
  editingPostId: "",
  editingLeadId: "",
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
  postMonitorAccountFilter: "",
  postMonitorTypeFilter: "",
  postMonitorPlatformFilter: "",
  leadMonitorEmployeeFilter: "",
  leadMonitorAccountFilter: "",
  leadMonitorPlatformFilter: "",
  leadMonitorPostTypeFilter: "",
  leadMonitorStatusFilter: "",
  leadMonitorSalesFilter: "",
  leadMonitorProcessFilter: "",
  leadMonitorAddFilter: "",
  leadMonitorIntentionFilter: "",
  leadMonitorKeyword: ""
};

const POST_TYPES = ["素人贴", "话题贴", "获客贴"];
const ACCOUNT_STATUSES = ["正常", "停更", "限流", "禁言", "违规"];
const LEAD_PROCESS_STATUSES = ["未接", "已接"];
const LEAD_ADD_STATUSES = ["未添加", "已添加"];
const LEAD_INTENTIONS = ["", "强意向", "预算不够", "了解备用"];

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
        Promise.resolve({ snapshots: {} })
      ]
    : requests;

  const [summary, distribution, rankings, users, employees, accounts, posts, leads, analyticsSnapshots] = await Promise.all(normalizedRequests);
  state.summary = summary;
  state.distribution = distribution;
  state.rankings = rankings;
  state.users = users;
  state.employees = employees;
  state.accounts = accounts;
  state.posts = posts;
  state.leads = dedupeLeadRows(leads);
  state.analyticsSnapshots = analyticsSnapshots.snapshots || {};
  alignStateDatesToAvailableData();
  state.teamPosts = state.user.role === "staff" ? await api("/api/posts?scope=all") : posts;
  state.teamLeads = state.user.role === "staff"
    ? dedupeLeadRows(await api("/api/leads?scope=all"))
    : state.leads;
  state.staffLearningPostIds = state.user.role === "staff" ? loadStaffLearningPostIds() : [];
  if (state.user.role === "admin" || state.user.role === "owner") {
    state.reviewHighlights = loadReviewCollection("review_highlights");
    state.reviewSamples = loadReviewCollection("review_samples");
  }
}

function renderLogin() {
  const isOwnerPortal = window.location.port === "3001";
  const title = isOwnerPortal ? "总后台入口" : "运营协作中台";
  const subtitle = isOwnerPortal
    ? "先看整体规模、主管沉淀和销售推进，再决定今天优先盯哪条线。"
    : "把账号、作品、客资和复盘动作放进同一套工作台里，方便主管监管和团队协作。";
  const bullets = isOwnerPortal
    ? ["先看管理覆盖", "再看运营沉淀", "最后看销售推进"]
    : ["先录动作，再看结果", "主管顺着数据一路下钻", "作品、客资、复盘在同一套后台里闭环"];
  app.innerHTML = `
    <div class="login-shell">
      <div class="login-layout">
        <section class="login-aside">
          <span class="tag tag-soft">${isOwnerPortal ? "总后台" : "运营管理"}</span>
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
              <p class="muted">${isOwnerPortal ? "请输入总后台账号密码。" : "请输入主管或员工账号密码。"}</p>
            </div>
            <span class="tag">${isOwnerPortal ? "3001" : "3000"}</span>
          </div>
          <div class="login-fields">
            <input name="username" placeholder="用户名" required />
            <input name="password" type="password" placeholder="密码" required />
          </div>
          <button class="primary" type="submit">登录</button>
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

function getPlatformOverviewRows(posts, leads) {
  return ["小红书", "抖音"].map((platform) => {
    const platformPosts = posts.filter((item) => item.platform === platform);
    const platformLeads = leads.filter((item) => item.platform === platform);
    const totalPosts = platformPosts.length;
    const typeCounts = POST_TYPES.map((type) => {
      const count = platformPosts.filter((item) => item.postType === type).length;
      const ratio = totalPosts ? Math.round((count / totalPosts) * 100) : 0;
      return { type, count, ratio };
    });
    return {
      platform,
      totalPosts,
      leadCount: platformLeads.length,
      typeCounts
    };
  });
}

function getPostTypeTagClass(type) {
  if (type === "素人贴") return "tag-persona";
  if (type === "话题贴") return "tag-topic";
  if (type === "获客贴") return "tag-lead";
  return "tag-soft";
}

function renderPlatformOverviewSection(platformRows, periodLabel) {
  return `
    <section class="panel">
      <div class="section-head">
        <h3>双平台总览</h3>
        <span class="muted">小红书和抖音双栏展示，不看评论点赞播放量，只看作品结构、数量占比和客资数。</span>
      </div>
      <div class="platform-overview-grid">
        ${platformRows.map((platformRow) => `
          <article class="platform-overview-card">
            <div class="platform-overview-head">
              <div>
                <h4>${platformRow.platform}</h4>
                <p>总作品 ${platformRow.totalPosts} 条</p>
              </div>
              <span class="tag tag-soft">${periodLabel || "时段选择"}</span>
            </div>
            <div class="platform-overview-strip-wrap">
              <div class="platform-overview-strip-label">作品</div>
              <div class="platform-overview-bar platform-overview-bar-hero" aria-label="${platformRow.platform} 作品类型占比">
                ${platformRow.typeCounts.map((item) => `
                  <div
                    class="platform-overview-bar-segment platform-overview-bar-segment-hero platform-overview-bar-${item.type === "素人贴" ? "people" : item.type === "话题贴" ? "topic" : "lead"}"
                    style="width:${item.ratio || 0}%"
                    title="${item.type} ${item.count} 条，占比 ${item.ratio}%"
                  >
                    <span>${item.type} ${item.count}</span>
                  </div>
                `).join("")}
              </div>
              <div class="platform-overview-strip-total">${platformRow.totalPosts}条</div>
            </div>
            <div class="platform-overview-footer">
              <span>客资数</span>
              <strong>${platformRow.leadCount}</strong>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function getPlatformEmployeeBoardRows(platform, posts, leads) {
  const platformPosts = posts.filter((item) => item.platform === platform);
  const totalPlatformPosts = platformPosts.length;
  return state.employees.map((employee) => {
    const employeePosts = platformPosts.filter((item) => item.employeeId === employee.id);
    const employeeLeads = leads.filter((item) => item.employeeId === employee.id && item.platform === platform);
    const typeCounts = POST_TYPES.map((type) => ({
      type,
      count: employeePosts.filter((item) => item.postType === type).length
    }));
    const totalPosts = employeePosts.length;
    const share = totalPlatformPosts ? Math.round((totalPosts / totalPlatformPosts) * 100) : 0;
    return {
      employeeId: employee.id,
      name: employee.name,
      totalPosts,
      leadCount: employeeLeads.length,
      share,
      typeCounts
    };
  }).filter((item) => item.totalPosts > 0 || item.leadCount > 0)
    .sort((left, right) => {
      if (state.dashboardEmployeeSort === "leads" && right.leadCount !== left.leadCount) {
        return right.leadCount - left.leadCount;
      }
      if (right.totalPosts !== left.totalPosts) return right.totalPosts - left.totalPosts;
      return String(left.name || "").localeCompare(String(right.name || ""));
    });
}

function renderPlatformEmployeeBoard(platform, rows) {
  return `
    <article class="platform-overview-card">
      <div class="platform-overview-head">
        <div>
          <h4>${platform}</h4>
          <p>员工数据 · 左侧姓名，中间占比，右侧总条数</p>
        </div>
        <span class="tag tag-soft">${rows.length} 人</span>
      </div>
      <div class="employee-board-scroll">
        ${rows.length ? rows.map((item, index) => {
          return `
            <article class="employee-overview-row ${index < 3 ? "employee-overview-row-top" : ""}">
              <div class="employee-overview-name">
                <strong>${item.name}</strong>
                <span>${item.leadCount} 客资</span>
              </div>
              <div class="employee-overview-share">
                <span>${item.share}% 占比</span>
                <div class="platform-overview-bar employee-overview-bar" aria-label="${item.name} 在 ${platform} 的作品类型占比" title="${item.typeCounts.map((typeItem) => `${typeItem.type} ${typeItem.count} 条，占比 ${item.totalPosts ? Math.round((typeItem.count / item.totalPosts) * 100) : 0}%`).join("；")}">
                  ${item.typeCounts.map((typeItem) => `<div class="platform-overview-bar-segment platform-overview-bar-${typeItem.type === "素人贴" ? "people" : typeItem.type === "话题贴" ? "topic" : "lead"}" style="width:${item.totalPosts ? Math.round((typeItem.count / item.totalPosts) * 100) : 0}%"></div>`).join("")}
                </div>
              </div>
              <div class="employee-overview-total">
                <strong>${item.totalPosts}</strong>
                <span>总条数</span>
              </div>
            </article>
          `;
        }).join("") : `
          <div class="employee-overview-empty">
            ${renderEmptyState(`${platform} 暂无员工数据`, "当前范围内这个平台还没有可展示的员工作品数据。")}
          </div>
        `}
      </div>
    </article>
  `;
}

function getPlatformEfficiencyRows(platform, posts, leads) {
  return state.employees.map((employee) => {
    const employeePosts = posts.filter((item) => item.employeeId === employee.id && item.platform === platform);
    const employeeLeads = leads.filter((item) => item.employeeId === employee.id && item.platform === platform);
    const totalPosts = employeePosts.length;
    const leadPosts = employeePosts.filter((item) => item.postType === "获客贴").length;
    return {
      employeeId: employee.id,
      name: employee.name,
      totalPosts,
      leadPosts,
      leadCount: employeeLeads.length,
      postEfficiency: totalPosts ? (employeeLeads.length / totalPosts) : 0,
      leadPostEfficiency: leadPosts ? (employeeLeads.length / leadPosts) : 0
    };
  }).filter((item) => item.totalPosts > 0 || item.leadCount > 0);
}

function renderPlatformEfficiencyBoard(platform, rows) {
  const efficiencyRankRows = [...rows]
    .filter((item) => item.totalPosts > 0)
    .sort((left, right) => right.postEfficiency - left.postEfficiency || right.leadCount - left.leadCount)
    .slice(0, 8);
  const leadEfficiencyRankRows = [...rows]
    .filter((item) => item.leadPosts > 0)
    .sort((left, right) => right.leadPostEfficiency - left.leadPostEfficiency || right.leadCount - left.leadCount)
    .slice(0, 8);

  return `
    <article class="platform-overview-card">
      <div class="platform-overview-head">
        <div>
          <h4>${platform}</h4>
          <p>分平台查看获客效率榜和获客贴效率榜</p>
        </div>
        <span class="tag tag-soft">${rows.length} 人</span>
      </div>
      <div class="dashboard-rank-panels">
        <article class="dashboard-rank-panel">
          <div class="dashboard-rank-head">
            <strong>获客效率榜</strong>
            <span>客资数 / 作品总数</span>
          </div>
          ${efficiencyRankRows.length
            ? renderDashboardShortList(efficiencyRankRows.map((item, index) => ({
              rank: index + 1,
              tone: "good",
              title: item.name,
              summary: `总作品 ${item.totalPosts} · 客资 ${item.leadCount}`,
              meta: `效率 ${formatRatioNumber(item.postEfficiency)}`
            })))
            : renderEmptyState(`${platform} 暂无效率排行`, "有作品数据后，这里会自动生成获客效率榜。")}
        </article>
        <article class="dashboard-rank-panel">
          <div class="dashboard-rank-head">
            <strong>获客贴效率榜</strong>
            <span>客资数 / 获客贴数</span>
          </div>
          ${leadEfficiencyRankRows.length
            ? renderDashboardShortList(leadEfficiencyRankRows.map((item, index) => ({
              rank: index + 1,
              tone: "warn",
              title: item.name,
              summary: `获客贴 ${item.leadPosts} · 客资 ${item.leadCount}`,
              meta: `效率 ${formatRatioNumber(item.leadPostEfficiency)}`
            })))
            : renderEmptyState(`${platform} 暂无获客贴效率排行`, "有获客贴数据后，这里会自动生成榜单。")}
        </article>
      </div>
    </article>
  `;
}

function getEmployeeLeadEfficiency(employeeId, posts, leads) {
  const employeePosts = posts.filter((item) => item.employeeId === employeeId);
  const employeeLeads = leads.filter((item) => item.employeeId === employeeId);
  const totalPosts = employeePosts.length;
  const leadPosts = employeePosts.filter((item) => item.postType === "获客贴").length;
  return {
    totalPosts,
    leadPosts,
    leadCount: employeeLeads.length,
    postEfficiency: totalPosts ? (employeeLeads.length / totalPosts) : 0,
    leadPostEfficiency: leadPosts ? (employeeLeads.length / leadPosts) : 0
  };
}

function formatRatioNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function getEmployeePersonalBoardData(employeeId, monthString) {
  const monthDates = new Set(getMonthDates(monthString));
  const employeePosts = state.posts.filter((item) => item.employeeId === employeeId && item.publishedAt && monthDates.has(item.publishedAt));
  const employeeLeads = state.leads.filter((item) => item.employeeId === employeeId && monthDates.has(String(item.createdAt || "").slice(0, 10)));
  const platforms = ["小红书", "抖音"].map((platform) => {
    const platformPosts = employeePosts.filter((item) => item.platform === platform);
    const platformLeads = employeeLeads.filter((item) => item.platform === platform);
    const accounts = state.accounts.filter((item) => item.employeeId === employeeId && item.platform === platform);
    const accountInsights = accounts.map((account) => {
      const accountPosts = platformPosts.filter((item) => item.accountId === account.id);
      const accountLeads = platformLeads.filter((item) => item.accountId === account.id);
      const leadPostCount = accountPosts.filter((item) => item.postType === "获客贴").length;
      return {
        ...account,
        totalPosts: accountPosts.length,
        leadCount: accountLeads.length,
        leadPostCount,
        efficiency: accountPosts.length ? accountLeads.length / accountPosts.length : 0,
        leadEfficiency: leadPostCount ? accountLeads.length / leadPostCount : 0,
        posts: accountPosts
      };
    });
    const sortedByLead = [...accountInsights].sort((a, b) => b.leadCount - a.leadCount || b.totalPosts - a.totalPosts);
    const sortedByEfficiency = [...accountInsights].sort((a, b) => b.efficiency - a.efficiency || b.leadCount - a.leadCount);
    const sortedByLeadEfficiency = [...accountInsights].sort((a, b) => b.leadEfficiency - a.leadEfficiency || b.leadCount - a.leadCount);
    const totalPosts = platformPosts.length;
    const typeCounts = POST_TYPES.map((type) => {
      const count = platformPosts.filter((item) => item.postType === type).length;
      const ratio = totalPosts ? Math.round((count / totalPosts) * 100) : 0;
      return { type, count, ratio };
    });
    return {
      platform,
      posts: platformPosts,
      leads: platformLeads,
      accounts: accountInsights,
      totalPosts,
      totalLeads: platformLeads.length,
      typeCounts,
      bestLeadAccount: sortedByLead[0] || null,
      bestEfficiencyAccount: sortedByEfficiency[0] || null,
      bestLeadEfficiencyAccount: sortedByLeadEfficiency[0] || null,
      worstLeadAccount: [...sortedByLead].reverse().find((item) => item.totalPosts > 0) || null,
      worstEfficiencyAccount: [...sortedByEfficiency].reverse().find((item) => item.totalPosts > 0) || null,
      worstLeadEfficiencyAccount: [...sortedByLeadEfficiency].reverse().find((item) => item.totalPosts > 0) || null,
      workload: {
        today: platformPosts.filter((item) => item.publishedAt === todayString()).length,
        week: platformPosts.filter((item) => getDatesInWeek(getCurrentWeekString()).includes(item.publishedAt)).length,
        month: platformPosts.length
      }
    };
  });
  return {
    employeePosts,
    employeeLeads,
    platforms
  };
}

function renderApp() {
  const isOwner = state.user.role === "owner";
  const isAdmin = state.user.role === "admin";
  const isSales = state.user.role === "sales";
  const adminViews = [
    ["dashboard", "总览"],
    ["rankings", "排行榜"],
    ["posts", "作品监控"],
    ["account-viz", "账号更新可视化"],
    ["leads", "客资监控"],
    ["analytics", "分析看板"],
    ["employees", "员工管理"],
    ["accounts", "账号管理"]
  ];

  const staffViews = [
    ["post-entry", "作品录入"],
    ["my-posts", "我的作品"],
    ["gallery", "作品广场"],
    ["staff-rankings", "运营排行榜"],
    ["lead-entry", "客资录入"]
  ];

  const salesViews = [
    ["sales-leads", "销售客资"]
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

function renderCurrentView() {
  if (state.user.role === "admin" || state.user.role === "owner") {
    switch (state.currentView) {
      case "dashboard":
        return renderDashboard();
      case "rankings":
        return renderRankings();
      case "posts":
        return renderPostsMonitor();
      case "account-viz":
        return renderAccountVisualization();
      case "leads":
        return renderLeadsMonitor();
      case "analytics":
        return renderAnalyticsDashboard();
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
      default:
        return renderSalesLeads();
    }
  }

  switch (state.currentView) {
    case "post-entry":
      return renderPostEntry();
    case "my-posts":
      return renderMyPosts();
    case "gallery":
      return renderPostsGallery();
    case "staff-rankings":
      return renderStaffRankings();
    case "lead-entry":
      return renderLeadEntry();
    default:
      return renderPostEntry();
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
  const { label } = getDashboardPayload();
  const targetDates = getDashboardSnapshotDates().length
    ? getDashboardSnapshotDates()
    : state.dashboardMode === "day"
      ? [state.dashboardDate]
      : [];
  const postsInRange = state.posts.filter((item) => item.publishedAt && targetDates.includes(item.publishedAt));
  const leadsInRange = state.leads.filter((item) => {
    const leadDate = String(item.createdAt || "").slice(0, 10);
    return leadDate && targetDates.includes(leadDate);
  });
  const platformRows = getPlatformOverviewRows(postsInRange, leadsInRange);
  const xhsEmployeeRows = getPlatformEmployeeBoardRows("小红书", postsInRange, leadsInRange);
  const douyinEmployeeRows = getPlatformEmployeeBoardRows("抖音", postsInRange, leadsInRange);
  const xhsEfficiencyRows = getPlatformEfficiencyRows("小红书", postsInRange, leadsInRange);
  const douyinEfficiencyRows = getPlatformEfficiencyRows("抖音", postsInRange, leadsInRange);
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>总览</h2>
        <p class="page-desc">小红书和抖音双栏展示。上方看各类型作品总览和占比，条状图下方显示客资数；下方看员工数据和获客效率榜。</p>
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
      </div>
    </div>
    ${renderPlatformOverviewSection(platformRows, label)}
    <section class="panel panel-plain">
      <div class="section-head">
        <h3>员工数据区</h3>
        <div class="section-head-actions">
          <span class="muted">员工数据按小红书和抖音分栏展示，右上角支持按客资排序。</span>
          <select id="dashboardEmployeeSortInput">
            <option value="leads" ${state.dashboardEmployeeSort === "leads" ? "selected" : ""}>按客资排序</option>
            <option value="posts" ${state.dashboardEmployeeSort === "posts" ? "selected" : ""}>按总条数排序</option>
          </select>
        </div>
      </div>
      <div class="platform-employee-grid">
        ${renderPlatformEmployeeBoard("小红书", xhsEmployeeRows)}
        ${renderPlatformEmployeeBoard("抖音", douyinEmployeeRows)}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>获客效率榜</h3>
        <span class="muted">按小红书和抖音分栏展示，每个平台分别看两项效率。</span>
      </div>
      <div class="platform-employee-grid">
        ${renderPlatformEfficiencyBoard("小红书", xhsEfficiencyRows)}
        ${renderPlatformEfficiencyBoard("抖音", douyinEfficiencyRows)}
      </div>
    </section>
  `;
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
  const rows = getPostsForMonitor().filter((item) => {
    if (state.postMonitorEmployeeFilter && item.employeeId !== state.postMonitorEmployeeFilter) return false;
    if (state.postMonitorAccountFilter && item.accountId !== state.postMonitorAccountFilter) return false;
    if (state.postMonitorTypeFilter && item.postType !== state.postMonitorTypeFilter) return false;
    if (state.postMonitorPlatformFilter && item.platform !== state.postMonitorPlatformFilter) return false;
    return true;
  });
  const leadRows = rows.filter((item) => item.postType === "获客贴");
  const douyinRows = rows.filter((item) => item.platform === "抖音");
  const xhsRows = rows.filter((item) => item.platform === "小红书");
  const nextActions = [
    { view: "accounts", label: "去看账号管理", caption: "先回到账号侧，补齐归属和定位信息。" },
    { view: "leads", label: "去看客资监控", caption: "顺着结果看，这批作品后面有没有沉淀客资。" },
    { view: "analytics", label: "去看分析看板", caption: "做周期复盘时，再去分析页看账号和作品归因。" }
  ];
  const recentRows = [...rows]
    .sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")))
    .slice(0, 6);
  const leadFocusRows = [...leadRows]
    .sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")))
    .slice(0, 6);
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>作品监控</h2>
        <p class="page-desc">按作品卡片查看封面、文案、账号、发布时间、获客数、平台和原贴入口。</p>
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
        </select>
        ${state.postMonitorMode === "day"
          ? `<input id="postMonitorDateInput" type="date" value="${state.postMonitorDate}" />`
          : `<input id="postMonitorWeekInput" type="week" value="${state.postMonitorWeek}" />`}
        <select id="postMonitorEmployeeFilter">
          <option value="">全部账号所属人</option>
          ${state.employees.map((item) => `<option value="${item.id}" ${state.postMonitorEmployeeFilter === item.id ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
        <select id="postMonitorAccountFilter">
          <option value="">全部账号</option>
          ${state.accounts
            .filter((item) => !state.postMonitorEmployeeFilter || item.employeeId === state.postMonitorEmployeeFilter)
            .filter((item) => !state.postMonitorPlatformFilter || item.platform === state.postMonitorPlatformFilter)
            .map((item) => `<option value="${item.id}" ${state.postMonitorAccountFilter === item.id ? "selected" : ""}>${item.accountName} · ${item.platform}</option>`)
            .join("")}
        </select>
        <select id="postMonitorTypeFilter">
          <option value="">全部帖子类型</option>
          ${POST_TYPES.map((item) => `<option value="${item}" ${state.postMonitorTypeFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="postMonitorPlatformFilter">
          <option value="">全部平台</option>
          ${["小红书", "抖音"].map((item) => `<option value="${item}" ${state.postMonitorPlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </div>
    </div>
    ${renderViewContext()}
    <section class="panel dashboard-quick-panel">
      <div class="section-head">
        <h3>下一步去哪</h3>
        <span class="muted">看完作品现场后，再决定回账号、客资还是分析页。</span>
      </div>
      <div class="dashboard-next-grid">
        ${nextActions.map((item) => `
          <button class="ghost dashboard-next-card" data-view="${item.view}" type="button">
            <strong>${item.label}</strong>
            <span>${item.caption}</span>
          </button>
        `).join("")}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>监控重点</h3>
        <span class="muted">先判断有没有发、发在哪个平台、获客贴够不够。</span>
      </div>
      <div class="dashboard-decision-grid">
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">规模</span>
          <span>当前作品数</span>
          <strong>${rows.length}</strong>
          <p>当前范围内作品总数</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">平台</span>
          <span>平台重心</span>
          <strong>${douyinRows.length >= xhsRows.length ? "抖音" : "小红书"}</strong>
          <p>${douyinRows.length >= xhsRows.length ? `抖音 ${douyinRows.length} 条，小红书 ${xhsRows.length} 条` : `小红书 ${xhsRows.length} 条，抖音 ${douyinRows.length} 条`}</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">结构</span>
          <span>获客 / 素人 / 话题</span>
          <strong>${leadRows.length} / ${rows.filter((item) => item.postType === "素人贴").length} / ${rows.filter((item) => item.postType === "话题贴").length}</strong>
          <p>直接看当前内容结构是否均衡</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">参与</span>
          <span>参与员工</span>
          <strong>${new Set(rows.map((item) => item.employeeId).filter(Boolean)).size}</strong>
          <p>当前实际有发帖动作的运营人数</p>
        </article>
      </div>
    </section>
    <section class="grid-2">
      <div class="panel">
        <div class="section-head">
          <h3>优先关注作品</h3>
          <span class="muted">先看最近录入、最接近当日客资结果的作品，主管更容易判断今天内容方向有没有跑偏。</span>
        </div>
        ${recentRows.length
          ? renderDashboardShortList(recentRows.map((item, index) => ({
            tone: item.postType === "获客贴" ? "warn" : "good",
            rank: index + 1,
            title: item.title || "未命名作品",
            summary: `${item.employeeName || "-"} · ${item.platform || "-"} · ${item.postType || "-"}`,
            meta: item.publishedAt || "-"
          })))
          : renderEmptyState("当前没有优先关注作品", "当前范围内还没有符合条件的作品。")}
      </div>
      <div class="panel">
        <div class="section-head">
          <h3>获客贴优先复盘</h3>
          <span class="muted">重点看当前范围内的获客贴，方便主管快速判断哪批内容更接近客资结果。</span>
        </div>
        ${leadFocusRows.length
          ? renderDashboardShortList(leadFocusRows.map((item, index) => ({
            tone: "warn",
            rank: index + 1,
            title: item.title || "未命名作品",
            summary: `${item.employeeName || "-"} · ${item.platform || "-"} · 获客贴`,
            meta: item.publishedAt || "-"
          })))
          : renderEmptyState("当前没有获客贴可复盘", "这个范围内还没有获客贴，先回看平台动作和内容结构。")}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>作品卡片</h3>
        <span class="muted">按作品逐条看封面、文案、账号、发布时间、获客数和原贴入口，先按显示层调整，不混入互动指标。</span>
      </div>
      <div class="posts-monitor-grid">
        ${rows.length ? rows.map(renderPostMonitorCard).join("") : `<div class="empty">这一天没有符合条件的帖子。</div>`}
      </div>
    </section>
  `;
}

function renderPostMonitorCard(item) {
  const leadCount = state.leads.filter((lead) => lead.postId === item.id).length;
  const reviewPayload = buildReviewPayloadFromPost(item);
  const postMonth = String(item.publishedAt || "").slice(0, 7);
  return `
    <article class="post-monitor-card">
      <div class="post-monitor-cover">
        ${item.coverImageUrl ? `<button class="image-trigger js-open-image" data-src="${item.coverImageUrl}" type="button"><img src="${item.coverImageUrl}" alt="${item.title}" class="post-monitor-image" /></button>` : `<div class="post-monitor-placeholder">暂无封面</div>`}
      </div>
      <div class="post-monitor-body">
        <div class="post-card-main">
          <h3>${item.title || "未命名作品"}</h3>
          <p class="post-card-copy">${item.title || "当前作品暂未补充文案。前端先按文案位显示。"}</p>
        </div>
        <div class="post-monitor-tags">
          <span class="tag tag-soft">${item.accountName || "未绑定账号"}</span>
          <span class="tag">${item.platform}</span>
          <span class="tag ${getPostTypeTagClass(item.postType)}">${item.postType}</span>
        </div>
        <div class="post-card-metrics">
          <div><strong>所属人</strong><span>${item.employeeName || "-"}</span></div>
          <div><strong>发布时间</strong><span>${item.publishedAt || "-"}</span></div>
          <div><strong>获客数</strong><span>${leadCount}</span></div>
          <div><strong>平台</strong><span>${item.platform || "-"}</span></div>
        </div>
        <div class="post-card-actions">
          ${item.postUrl ? renderExternalLink(item.postUrl, "打开原贴") : `<span class="tag tag-soft">暂无原贴</span>`}
          <button class="ghost js-open-account-viz-context" data-employee="${escapeHtmlAttribute(item.employeeId || "")}" data-account="${escapeHtmlAttribute(item.accountId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-month="${escapeHtmlAttribute(postMonth || state.accountVizMonth || "")}" type="button">看账号节奏</button>
          <button class="ghost js-open-leads-context" data-employee="${escapeHtmlAttribute(item.employeeId || "")}" data-account="${escapeHtmlAttribute(item.accountId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-mode="day" data-date="${escapeHtmlAttribute(item.publishedAt || state.leadMonitorDate || "")}" type="button">看同账号客资</button>
        </div>
        ${renderReviewActionButtons(reviewPayload)}
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
  const selectedEmployeeId = state.accountVizEmployeeFilter || state.employees[0]?.id || "";
  if (!state.accountVizEmployeeFilter && selectedEmployeeId) {
    state.accountVizEmployeeFilter = selectedEmployeeId;
  }
  const selectedEmployee = state.employees.find((item) => item.id === selectedEmployeeId) || null;
  const personalBoard = selectedEmployee ? getEmployeePersonalBoardData(selectedEmployee.id, state.accountVizMonth) : { platforms: [] };
  const selectedRow = rows.find((item) => item.id === state.accountVizSelectedAccountId) || null;
  const dates = getMonthDates(state.accountVizMonth);
  const totalPosts = rows.reduce((sum, item) => sum + item.totalPosts, 0);
  const totalLeads = rows.reduce((sum, item) => sum + item.totalLeads, 0);
  const totalTypeCounts = POST_TYPES.reduce((acc, type) => {
    acc[type] = rows.reduce((sum, item) => sum + Number(item.typeCounts?.[type] || 0), 0);
    return acc;
  }, {});
  const reviewPayload = selectedRow ? buildReviewPayloadFromAccount(selectedRow) : null;
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>个人看板</h2>
        <p class="page-desc">按员工和月份查看双平台作品结构、账号卡片、效率分析和工作量。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${selectedEmployee?.name || "未选择员工"} · ${state.accountVizMonth}</span>
        ${renderAdminRefreshButton()}
      </div>
    </div>
    ${renderViewContext()}
    <div class="panel">
      <div class="filters filters-toolbar">
        <select id="accountVizEmployeeFilter">
          <option value="">全部员工</option>
          ${state.employees.map((item) => `<option value="${item.id}" ${state.accountVizEmployeeFilter === item.id ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
        <input id="accountVizMonthInput" type="month" value="${state.accountVizMonth}" />
        <select id="accountVizPlatformFilter">
          <option value="">全部平台</option>
          ${["小红书", "抖音"].map((item) => `<option value="${item}" ${state.accountVizPlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="accountVizAccountFilter">
          <option value="">全部账号趋势</option>
          ${rows.map((item) => `<option value="${item.id}" ${state.accountVizSelectedAccountId === item.id ? "selected" : ""}>${item.accountName || "未命名账号"} · ${item.employeeName || "-"}</option>`).join("")}
        </select>
      </div>
    </div>
    ${selectedEmployee ? `
      ${renderPlatformOverviewSection(personalBoard.platforms.map((item) => ({
        platform: item.platform,
        totalPosts: item.totalPosts,
        leadCount: item.totalLeads,
        typeCounts: item.typeCounts
      })))}
      <section class="grid-2">
        ${personalBoard.platforms.map((platformRow) => `
          <div class="panel">
            <div class="section-head">
              <h3>${platformRow.platform} 账号信息区</h3>
              <span class="muted">账号卡片左侧账号名，右侧按日期显示发帖类型，封禁或异常账号用红色边框提示。</span>
            </div>
            <div class="personal-account-grid">
              ${platformRow.accounts.length ? platformRow.accounts.map((account) => `
                <article class="personal-account-card ${["封禁", "禁言", "违规"].includes(account.status) ? "personal-account-card-risk" : ""}">
                  <div class="personal-account-head">
                    <div>
                      <strong>${account.accountName || "未命名账号"}</strong>
                      <span>${account.platform} · ${account.status || "正常"}</span>
                    </div>
                    <div class="personal-account-tags">
                      <span class="tag tag-soft">作品 ${account.totalPosts}</span>
                      <span class="tag tag-success">客资 ${account.leadCount}</span>
                    </div>
                  </div>
                  <div class="personal-account-schedule">
                    ${dates.map((date) => {
                      const entry = account.dayMap?.[date] || { types: [], leadCount: 0 };
                      const type = entry.types?.[0] || "";
                      return `<span class="personal-account-dot personal-account-dot-${type === "素人贴" ? "people" : type === "话题贴" ? "topic" : type === "获客贴" ? "lead" : "empty"}" title="${date} ${type || "未更新"}${entry.leadCount ? ` · 客资 ${entry.leadCount}` : ""}"></span>`;
                    }).join("")}
                  </div>
                  <div class="personal-account-copy">
                    <p><strong>人设：</strong>${account.persona || "待补充"}</p>
                    <p><strong>规划：</strong>${account.positioning || "待补充发帖规划"}</p>
                  </div>
                </article>
              `).join("") : renderEmptyState(`${platformRow.platform} 暂无账号`, "当前员工在这个平台下还没有可展示的账号卡片。")}
            </div>
          </div>
        `).join("")}
      </section>
      <section class="grid-2">
        ${personalBoard.platforms.map((platformRow) => {
          const totalEfficiency = platformRow.totalPosts ? platformRow.totalLeads / platformRow.totalPosts : 0;
          const totalLeadEfficiency = platformRow.posts.filter((item) => item.postType === "获客贴").length ? platformRow.totalLeads / platformRow.posts.filter((item) => item.postType === "获客贴").length : 0;
          return `
            <div class="panel">
              <div class="section-head">
                <h3>${platformRow.platform} 数据分析</h3>
                <span class="muted">顶部看总效率，下方左右对比最好和最弱账号。</span>
              </div>
              <section class="grid-3 stat-grid">
                ${stat("获客数", platformRow.totalLeads, "", "客资")}
                ${stat("获客效率", formatRatioNumber(totalEfficiency), "", "效率")}
                ${stat("获客贴效率", formatRatioNumber(totalLeadEfficiency), "", "效率")}
              </section>
              <div class="personal-analysis-grid">
                <article class="personal-analysis-card">
                  <strong>最佳账号</strong>
                  <p>获客最多：${platformRow.bestLeadAccount?.accountName || "-"}</p>
                  <p>获客效率最高：${platformRow.bestEfficiencyAccount?.accountName || "-"}</p>
                  <p>获客贴效率最高：${platformRow.bestLeadEfficiencyAccount?.accountName || "-"}</p>
                </article>
                <article class="personal-analysis-card personal-analysis-card-warn">
                  <strong>待提升账号</strong>
                  <p>获客最少：${platformRow.worstLeadAccount?.accountName || "-"}</p>
                  <p>获客效率最低：${platformRow.worstEfficiencyAccount?.accountName || "-"}</p>
                  <p>获客贴效率最低：${platformRow.worstLeadEfficiencyAccount?.accountName || "-"}</p>
                </article>
              </div>
            </div>
          `;
        }).join("")}
      </section>
      <section class="grid-2">
        ${personalBoard.platforms.map((platformRow) => `
          <div class="panel">
            <div class="section-head">
              <h3>${platformRow.platform} 工作量展示</h3>
              <span class="muted">分别看今日、本周、本月更新作品数。</span>
            </div>
            <section class="grid-3 stat-grid">
              ${stat("今日更新", platformRow.workload.today, "", "今日")}
              ${stat("本周更新", platformRow.workload.week, "", "本周")}
              ${stat("本月更新", platformRow.workload.month, "", "本月")}
            </section>
          </div>
        `).join("")}
      </section>
    ` : ""}
    <section class="panel">
      <div class="section-head">
        <h3>账号节奏矩阵</h3>
        <span class="muted">保留现有月度矩阵，方便从个人看板继续下钻到账号日历视图。</span>
      </div>
      <section class="grid-4 stat-grid">
        ${stat("可见账号", rows.length, "", "账号")}
        ${stat("月内作品 / 客资", `${totalPosts} / ${totalLeads}`, "", "结果")}
        ${stat("获客 / 素人 / 话题", `${totalTypeCounts["获客贴"]} / ${totalTypeCounts["素人贴"]} / ${totalTypeCounts["话题贴"]}`, "", "结构")}
        ${stat("当前焦点", selectedRow ? `${selectedRow.accountName} · ${selectedRow.totalLeads}客资` : "全部账号趋势", "", "账号")}
      </section>
    </section>
    ${selectedRow ? `
      <section class="panel">
        <div class="section-head">
          <h3>当前焦点账号</h3>
          <span class="muted">先看当前正在分析的账号，再往下看趋势图和更新矩阵。</span>
        </div>
        <div class="dashboard-decision-grid">
          <article class="focus-card dashboard-decision-card">
            <span class="dashboard-decision-label">账号</span>
            <span>当前账号</span>
            <strong>${selectedRow.accountName || "未命名账号"}</strong>
            <p>${selectedRow.employeeName || "-"} · ${selectedRow.platform || "-"}</p>
          </article>
          <article class="focus-card dashboard-decision-card">
            <span class="dashboard-decision-label">节奏</span>
            <span>月内作品 / 客资</span>
            <strong>${selectedRow.totalPosts} / ${selectedRow.totalLeads}</strong>
            <p>${selectedRow.activeDays} 天有更新</p>
          </article>
          <article class="focus-card dashboard-decision-card">
            <span class="dashboard-decision-label">结构</span>
            <span>获客 / 素人 / 话题</span>
            <strong>${selectedRow.typeCounts["获客贴"] || 0} / ${selectedRow.typeCounts["素人贴"] || 0} / ${selectedRow.typeCounts["话题贴"] || 0}</strong>
            <p>优先看这三个动作分布是否失衡</p>
          </article>
          <article class="focus-card dashboard-decision-card">
            <span class="dashboard-decision-label">沉淀</span>
            <span>主管动作</span>
            <strong>${reviewPayload ? "可标重点" : "暂无"}</strong>
            <p>当前账号可以直接加入重点或复盘样本。</p>
          </article>
        </div>
      </section>
    ` : ""}
    <section class="panel">
      <div class="section-head">
        <h3>重点账号客资趋势图</h3>
        <span class="muted">${selectedRow ? `当前查看 ${selectedRow.accountName} 的客资趋势和每日内容类型。` : "默认显示总客资趋势和客资最多的前 5 个账号，避免整张图太乱。点击矩阵中的账号或使用上方定位，会切到该账号趋势。"}</span>
      </div>
      ${reviewPayload ? renderReviewActionButtons(reviewPayload) : ""}
      <div id="accountVizChart" class="chart-box"></div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>更新矩阵</h3>
        <span class="muted">未更新灰色，素人贴绿色，话题贴金色，获客贴橙色，多类型同日用渐变显示。</span>
      </div>
      <div class="dashboard-activity-wrap">
        <table class="dashboard-activity-table">
          <thead>
            <tr>
              <th>账号</th>
              ${dates.map((date) => `<th>${date.slice(8)}</th>`).join("")}
              <th>合计</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((item) => `
              <tr class="${state.accountVizSelectedAccountId === item.id ? "dashboard-activity-row-selected" : ""}">
                <td>
                  <button class="ghost ${state.accountVizSelectedAccountId === item.id ? "active-filter" : ""} js-select-account-viz" data-id="${item.id}" type="button">${item.accountName || "未命名账号"}</button>
                  <div class="muted">${item.employeeName || "-"} · ${item.platform || "-"}</div>
                </td>
                ${dates.map((date) => `<td>${renderAccountVisualizationCell(item.dayMap[date] || { postCount: 0, leadCount: 0, typeLabel: "", types: [] })}</td>`).join("")}
                <td>
                  <div class="dashboard-activity-total">
                    <strong>${item.totalPosts} / ${item.totalLeads}</strong>
                    <span>${item.activeDays} 天有更新</span>
                  </div>
                </td>
              </tr>
            `).join("") : `<tr><td colspan="${dates.length + 2}">${renderEmptyState("当前月份没有可视化数据", "可以换月份、换平台，或者先去作品录入确认有没有落数据。")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAccountVizChart() {
  const chartEl = document.getElementById("accountVizChart");
  if (!chartEl || typeof window.echarts === "undefined") return;
  const dates = getMonthDates(state.accountVizMonth);
  const rows = getAccountVisualizationRows();
  const selectedRow = rows.find((item) => item.id === state.accountVizSelectedAccountId) || null;
  const chart = window.echarts.getInstanceByDom(chartEl) || window.echarts.init(chartEl);
  const xAxisData = dates.map((date) => date.slice(8));
  const baseOption = {
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 28, top: 48, bottom: 34 },
    xAxis: { type: "category", data: xAxisData },
    yAxis: [{ type: "value", minInterval: 1 }],
    legend: { top: 0 }
  };
  if (!selectedRow) {
    const topRows = rows.slice(0, 5);
    const totalSeries = dates.map((date) => rows.reduce((sum, item) => sum + Number(item.dayMap?.[date]?.leadCount || 0), 0));
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
          data: totalSeries
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
    return;
  }
  const leadSeries = dates.map((date) => Number(selectedRow.dayMap?.[date]?.leadCount || 0));
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
        data: leadSeries
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
  const rows = applyLeadMonitorFilters(getLeadsForMonitor());
  const freshRows = rows.filter((item) => item.status === "新客资");
  const followingRows = rows.filter((item) => item.status === "跟进中");
  const invalidRows = rows.filter((item) => item.status === "无效");
  const douyinRows = rows.filter((item) => item.platform === "抖音");
  const xhsRows = rows.filter((item) => item.platform === "小红书");
  const platformFocus = rows.length
    ? (douyinRows.length >= xhsRows.length ? "抖音" : "小红书")
    : "暂无来源";
  const salesUsers = state.users.filter((item) => item.role === "sales");
  const platformSummary = rows.length
    ? (douyinRows.length >= xhsRows.length
      ? `抖音 ${douyinRows.length} 条，小红书 ${xhsRows.length} 条`
      : `小红书 ${xhsRows.length} 条，抖音 ${douyinRows.length} 条`)
    : "当前筛选范围内还没有客资来源。";
  const nextActions = [
    { view: "posts", label: "去看作品监控", caption: "顺着来源作品回查，这批客资是被哪类内容带出来的。" },
    { view: "accounts", label: "去看账号管理", caption: "如果来源账号信息不清晰，先回到账号侧补齐归属和定位。" },
    { view: "analytics", label: "去看分析看板", caption: "做周期复盘时，再看账号、作品和客资的整体归因。" }
  ];
  const priorityRows = [
    ...freshRows.sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()),
    ...followingRows.sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime())
  ].slice(0, 6);
  const sourceRiskRows = rows.filter((item) => !item.sourcePostTitle && !item.sourcePostUrl).slice(0, 6);
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>客资监控</h2>
        <p class="page-desc">先看新增、跟进中和来源是否完整，再往下翻具体客资。</p>
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
        <select id="leadMonitorSalesFilter">
          <option value="">全部销售</option>
          ${salesUsers.map((item) => `<option value="${item.id}" ${state.leadMonitorSalesFilter === item.id ? "selected" : ""}>${item.username}</option>`).join("")}
        </select>
        <select id="leadMonitorProcessFilter">
          <option value="">全部处理状态</option>
          ${LEAD_PROCESS_STATUSES.map((item) => `<option value="${item}" ${state.leadMonitorProcessFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="leadMonitorAddFilter">
          <option value="">全部添加状态</option>
          ${LEAD_ADD_STATUSES.map((item) => `<option value="${item}" ${state.leadMonitorAddFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="leadMonitorIntentionFilter">
          <option value="">全部客资意向</option>
          ${LEAD_INTENTIONS.filter(Boolean).map((item) => `<option value="${item}" ${state.leadMonitorIntentionFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <input id="leadMonitorKeywordInput" type="search" placeholder="搜索运营 / 账号 / 联系方式 / 销售 / IP" value="${escapeHtmlAttribute(state.leadMonitorKeyword || "")}" />
      </div>
    </div>
    ${renderViewContext()}
    <section class="panel dashboard-quick-panel">
      <div class="section-head">
        <h3>下一步去哪</h3>
        <span class="muted">看完客资现场后，再决定回作品、账号还是分析页。</span>
      </div>
      <div class="dashboard-next-grid">
        ${nextActions.map((item) => `
          <button class="ghost dashboard-next-card" data-view="${item.view}" type="button">
            <strong>${item.label}</strong>
            <span>${item.caption}</span>
          </button>
        `).join("")}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>客资重点</h3>
        <span class="muted">先判断规模、平台来源、推进状态和风险。</span>
      </div>
      <div class="dashboard-decision-grid">
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">规模</span>
          <span>当前客资数</span>
          <strong>${rows.length}</strong>
          <p>当前范围内客资总数</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">平台</span>
          <span>平台来源</span>
          <strong>${platformFocus}</strong>
          <p>${platformSummary}</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">推进</span>
          <span>新客资 / 跟进中</span>
          <strong>${freshRows.length} / ${followingRows.length}</strong>
          <p>先判断是新进入多，还是在持续推进</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">风险</span>
          <span>无效客资</span>
          <strong>${invalidRows.length}</strong>
          <p>当前范围内已判定无效的客资</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">销售</span>
          <span>已接 / 已添加</span>
          <strong>${rows.filter((item) => (item.processStatus || "未接") === "已接").length} / ${rows.filter((item) => (item.addStatus || "未添加") === "已添加").length}</strong>
          <p>快速判断销售是否已经接住，以及是否已经加上联系方式。</p>
        </article>
      </div>
    </section>
    <section class="grid-2">
      <div class="panel">
        <div class="section-head">
          <h3>优先关注客资</h3>
          <span class="muted">先看最新进入和正在跟进的客资。</span>
        </div>
        ${priorityRows.length
          ? renderDashboardShortList(priorityRows.map((item, index) => ({
            tone: item.status === "新客资" ? "warn" : "good",
            rank: index + 1,
            title: item.nickname || item.contactInfo || "未命名客资",
            summary: `${item.employeeName || "-"} · ${item.platform || "-"} · ${item.status || "-"}`,
            meta: formatDate(item.createdAt)
          })))
          : renderEmptyState("当前没有需要优先关注的客资", "当前范围内没有新增或正在跟进的客资。")}
      </div>
      <div class="panel">
        <div class="section-head">
          <h3>来源缺失提醒</h3>
          <span class="muted">重点看哪些客资没有关联来源作品。</span>
        </div>
        ${sourceRiskRows.length
          ? renderDashboardShortList(sourceRiskRows.map((item, index) => ({
            tone: "warn",
            rank: index + 1,
            title: item.nickname || item.contactInfo || "未命名客资",
            summary: `${item.employeeName || "-"} · ${item.platform || "-"} · ${item.status || "-"}`,
            meta: "未关联来源作品"
          })))
          : renderEmptyState("当前客资来源关联比较完整", "当前范围内没有明显缺失来源作品的客资。")}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>客资现场</h3>
        <span class="muted">逐条回看联系方式、专业、备注、来源作品和截图，方便主管判断今天先催销售还是先回查来源内容。</span>
      </div>
      <div class="leads-monitor-grid">
        ${rows.length ? rows.map(renderLeadMonitorCard).join("") : `<div class="empty">暂无符合条件的客资。</div>`}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>客资明细表</h3>
        <span class="muted">这一屏更适合主管扫全量字段，直接看运营、销售、处理状态、添加状态和来源作品。</span>
      </div>
      ${renderSupervisorLeadTable(rows)}
    </section>
  `;
}

function renderSalesLeads() {
  const editing = state.leads.find((item) => item.id === state.editingLeadId);
  const rows = applyLeadMonitorFilters(getLeadsForMonitor());
  const freshRows = rows.filter((item) => item.status === "新客资");
  const followingRows = rows.filter((item) => item.status === "跟进中");
  const screenshotRows = rows.filter((item) => item.captureImageUrl);
  const feedbackRows = rows.filter((item) => item.salesFeedback);
  const priorityRows = [
    ...freshRows.sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()),
    ...followingRows.sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime())
  ].slice(0, 6);
  const platformFocus = rows.length
    ? (rows.filter((item) => item.platform === "抖音").length >= rows.filter((item) => item.platform === "小红书").length ? "抖音" : "小红书")
    : "暂无来源";
  const nextActions = [
    { view: "leads", label: "回到主管客资监控", caption: "先让主管确认这批客资当前的录入质量和来源完整度。" },
    { view: "posts", label: "去看来源作品现场", caption: "需要补语境时，直接回看作品现场和内容结构。" },
    { view: "account-viz", label: "去看账号节奏", caption: "如果同一批客资集中在少数账号，继续看账号月度动作。" },
    { view: "analytics", label: "去看分析看板", caption: "做周期复盘时，再回到账号、内容和客资归因。" }
  ];
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>销售客资</h2>
        <p class="page-desc">先看来源作品、引流截图和备注，再决定怎么跟进会更顺。</p>
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
        <select id="leadMonitorAccountFilter">
          <option value="">全部账号</option>
          ${state.accounts.map((item) => `<option value="${item.id}" ${state.leadMonitorAccountFilter === item.id ? "selected" : ""}>${item.accountName} · ${item.platform}</option>`).join("")}
        </select>
        <select id="leadMonitorPlatformFilter">
          <option value="">全部平台</option>
          ${["小红书", "抖音"].map((item) => `<option value="${item}" ${state.leadMonitorPlatformFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="leadMonitorStatusFilter">
          <option value="">全部状态</option>
          ${["新客资", "跟进中", "已成交", "无效"].map((item) => `<option value="${item}" ${state.leadMonitorStatusFilter === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </div>
    </div>
    ${renderViewContext()}
    <section class="panel dashboard-quick-panel">
      <div class="section-head">
        <h3>下一步去哪</h3>
        <span class="muted">看完销售现场后，再决定回主管监控、作品现场还是账号节奏。</span>
      </div>
      <div class="dashboard-next-grid">
        ${nextActions.map((item) => `
          <button class="ghost dashboard-next-card" data-view="${item.view}" type="button">
            <strong>${item.label}</strong>
            <span>${item.caption}</span>
          </button>
        `).join("")}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>销售现场概览</h3>
        <span class="muted">先判断今天是新客资多、跟进中的多，还是已经有很多带截图和反馈的客资可以快速推进。</span>
      </div>
      <section class="grid-4 stat-grid">
        ${stat("当前客资数", rows.length, "", "客资")}
        ${stat("新客资 / 跟进中", `${freshRows.length} / ${followingRows.length}`, "", "推进")}
        ${stat("有引流截图", screenshotRows.length, "", "截图")}
        ${stat("已有销售反馈", feedbackRows.length, "", "反馈")}
      </section>
    </section>
    <section class="grid-2">
      <div class="panel">
        <div class="section-head">
          <h3>优先跟进客资</h3>
          <span class="muted">先看最新进入和正在跟进的客资，销售更容易判断今天先回复谁、先补哪一批反馈。</span>
        </div>
        ${priorityRows.length
          ? renderDashboardShortList(priorityRows.map((item, index) => ({
            rank: index + 1,
            tone: item.status === "新客资" ? "warn" : "good",
            title: item.nickname || item.contactInfo || "未命名客资",
            summary: `${item.employeeName || "-"} · ${item.platform || "-"} · ${item.status || "-"}`,
            meta: formatDate(item.createdAt)
          })))
          : renderEmptyState("当前没有需要优先跟进的客资", "当前范围内没有新增或正在跟进的客资。")}
      </div>
      <div class="panel">
        <div class="section-head">
          <h3>带截图优先判断</h3>
          <span class="muted">这些客资上下文更完整，销售和主管都可以先看截图、看来源作品，再决定怎么推进。</span>
        </div>
        ${screenshotRows.length
          ? renderDashboardShortList(screenshotRows.slice(0, 6).map((item, index) => ({
            rank: index + 1,
            tone: "good",
            title: item.nickname || item.contactInfo || "未命名客资",
            summary: `${item.employeeName || "-"} · ${item.platform || "-"} · ${item.sourcePostType || "-"}`,
            meta: item.sourcePostTitle || "已上传引流截图"
          })))
          : renderEmptyState("当前没有带引流截图的客资", "等运营端继续补上传后，这里会优先沉淀更完整的客资语境。")}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h3>销售关注区</h3>
        <span class="muted">先看联系方式、截图和来源作品，再决定今天优先跟哪一批。</span>
      </div>
      <div class="dashboard-decision-grid">
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">新增</span>
          <span>先跟新客资</span>
          <strong>${freshRows.length}</strong>
          <p>优先建立第一轮沟通，不要让新客资沉下去。</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">跟进</span>
          <span>持续推进</span>
          <strong>${followingRows.length}</strong>
          <p>正在跟进中的客资，适合继续补反馈和阶段判断。</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">截图</span>
          <span>带引流截图</span>
          <strong>${screenshotRows.length}</strong>
          <p>这些客资上下文更完整，更容易快速进入语境。</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">平台</span>
          <span>来源平台重心</span>
          <strong>${platformFocus}</strong>
          <p>${rows.filter((item) => item.platform === "抖音").length} 条抖音，${rows.filter((item) => item.platform === "小红书").length} 条小红书。</p>
        </article>
        <article class="focus-card dashboard-decision-card">
          <span class="dashboard-decision-label">回写</span>
          <span>已留反馈</span>
          <strong>${feedbackRows.length}</strong>
          <p>方便主管回看销售推进质量和当前阶段。</p>
        </article>
      </div>
    </section>
    ${editing ? `<div class="panel entry-panel"><div class="staff-form-head"><h3>销售反馈</h3><span class="muted">更新状态、成交金额和跟进反馈；来源作品和引流截图可对照下面卡片查看。</span></div>${renderSalesLeadForm(editing)}</div>` : ""}
    <section class="panel">
      <div class="section-head">
        <h3>销售处理列表</h3>
        <span class="muted">按客资逐条看联系方式、引流截图、来源作品和最近反馈，减少销售来回展开查信息的成本。</span>
      </div>
      <div class="leads-monitor-grid">
        ${rows.length ? rows.map(renderLeadMonitorCard).join("") : `<div class="empty">暂无符合条件的客资。</div>`}
      </div>
    </section>
  `;
}

function getLeadProcessTagClass(status) {
  return status === "已接" ? "tag-success" : "tag-warn";
}

function getLeadAddTagClass(status) {
  return status === "已添加" ? "tag-success" : "tag-warn";
}

function getLeadIntentionTagClass(intention) {
  if (intention === "强意向") return "tag-success";
  if (intention === "预算不够") return "tag-warn";
  if (intention === "了解备用") return "tag-muted";
  return "tag-soft";
}

function renderLeadIntentionSelect(item, compact = false) {
  const sizeClass = compact ? " lead-intention-select-compact" : "";
  return `
    <label class="lead-inline-control">
      <span>客资意向</span>
      <select class="js-lead-intention${sizeClass}" data-id="${item.id}">
        ${LEAD_INTENTIONS.map((option) => `<option value="${option}" ${item.intention === option ? "selected" : ""}>${option || "未标记"}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderLeadMonitorCard(item) {
  const noteSummary = item.note || "暂无备注";
  const salesFeedbackSummary = item.salesFeedback ? String(item.salesFeedback).trim() : "";
  const showSalesContact = state.user?.role === "sales";
  const reviewPayload = buildReviewPayloadFromLead(item);
  const sourcePost = state.posts.find((post) => post.id === item.postId) || null;
  const sourcePostDate = sourcePost?.publishedAt || String(item.createdAt || "").slice(0, 10);
  const sourcePostMonth = sourcePostDate ? String(sourcePostDate).slice(0, 7) : String(item.createdAt || "").slice(0, 7);
  const canOpenSourcePost = Boolean(item.sourcePostTitle || item.sourcePostUrl || item.postId);
  const processStatus = item.processStatus || "未接";
  const addStatus = item.addStatus || "未添加";
  const assignedSales = item.assignedSalesUserName || "未分配";
  const reminderLogs = Array.isArray(item.reminderLogs) ? item.reminderLogs : [];
  const latestReminder = reminderLogs[0];

  if (showSalesContact) {
    return `
      <article class="lead-monitor-card sales-lead-card">
        <div class="sales-lead-upper">
          <div class="sales-lead-main">
            <div class="lead-monitor-head">
              <h3>${item.nickname || item.contactInfo || "未命名客资"}</h3>
              <div class="toolbar toolbar-end sales-lead-tags">
                <span class="tag ${getLeadProcessTagClass(processStatus)}">${processStatus}</span>
                <span class="tag ${getLeadAddTagClass(addStatus)}">${addStatus}</span>
                <span class="tag ${getLeadIntentionTagClass(item.intention)}">${item.intention || "未标记意向"}</span>
              </div>
            </div>
            <div class="sales-lead-grid">
              <div><strong>日期</strong><span>${formatDate(item.createdAt)}</span></div>
              <div><strong>平台</strong><span>${item.platform || "-"}</span></div>
              <div><strong>所属运营</strong><span>${item.employeeName || "-"}</span></div>
              <div><strong>运营账号</strong><span>${item.accountName || "-"}</span></div>
              <div><strong>联系方式</strong><span>${item.contactInfo || "-"}</span></div>
              <div><strong>IP 地址</strong><span>${item.ip || "-"}</span></div>
              <div><strong>来源作品</strong><span>${item.sourcePostTitle || "未关联作品"}</span></div>
              <div><strong>分配销售</strong><span>${assignedSales}</span></div>
            </div>
            <div class="sales-lead-inline-actions">
              ${item.contactInfo ? `<button class="ghost js-copy-contact" data-contact="${escapeHtmlAttribute(item.contactInfo)}" type="button">复制联系方式</button>` : ""}
              ${item.sourcePostUrl ? renderExternalLink(item.sourcePostUrl, "查看原贴") : `<span class="tag tag-soft">暂无原贴</span>`}
              ${item.captureImageUrl ? `<button class="ghost js-open-image" data-src="${item.captureImageUrl}" type="button">查看引流图</button>` : `<span class="tag tag-soft">暂无引流图</span>`}
              <button class="ghost js-toggle-lead-process" data-id="${item.id}" data-next="${processStatus === "已接" ? "未接" : "已接"}" type="button">${processStatus === "已接" ? "改回未接" : "标记已接"}</button>
              <button class="ghost js-toggle-lead-add" data-id="${item.id}" data-next="${addStatus === "已添加" ? "未添加" : "已添加"}" type="button">${addStatus === "已添加" ? "改回未添加" : "标记添加成功"}</button>
              <button class="ghost js-remind-lead" data-id="${item.id}" data-target="sales" type="button">提醒自己</button>
              <button class="ghost js-remind-lead" data-id="${item.id}" data-target="operator" type="button">提醒运营</button>
            </div>
            <div class="sales-lead-inline-controls">
              ${renderLeadIntentionSelect(item, true)}
              ${latestReminder ? `<div class="lead-reminder-chip"><strong>最近提醒</strong><span>${latestReminder.createdByName || "系统"} · ${formatDate(latestReminder.createdAt)}</span></div>` : `<div class="lead-reminder-chip"><strong>最近提醒</strong><span>暂无提醒记录</span></div>`}
            </div>
          </div>
          ${item.captureImageUrl ? `
            <button class="image-trigger image-trigger-inline sales-lead-media js-open-image" data-src="${item.captureImageUrl}" type="button">
              <img class="sales-lead-thumb" src="${item.captureImageUrl}" alt="引流截图" />
            </button>
          ` : ""}
        </div>
        <div class="sales-lead-lower">
          <div class="sales-lead-note">
            <strong>状态跟进备注</strong>
            <p>${salesFeedbackSummary || "暂未填写销售跟进备注。"}</p>
            <span>${item.salesUpdatedAt ? `${item.salesUserName || "销售"} · ${formatDate(item.salesUpdatedAt)}` : "可以点右侧按钮补充跟进反馈"}</span>
          </div>
          <div class="actions">
            <button class="primary js-edit-lead" data-id="${item.id}">更新跟进</button>
          </div>
        </div>
      </article>
    `;
  }

  return `
    <article class="lead-monitor-card">
      <div class="lead-monitor-head">
        <h3>${item.nickname || "未填写昵称"}</h3>
        <div class="toolbar toolbar-end">
          ${item.captureImageUrl ? `<span class="tag tag-soft">有引流截图</span>` : ""}
          <span class="tag">${item.status}</span>
          <span class="tag ${getLeadProcessTagClass(processStatus)}">${processStatus}</span>
          <span class="tag ${getLeadAddTagClass(addStatus)}">${addStatus}</span>
          ${item.intention ? `<span class="tag ${getLeadIntentionTagClass(item.intention)}">${item.intention}</span>` : ""}
        </div>
      </div>
      <div class="lead-monitor-meta">
        <span class="tag tag-soft">所属人：${item.employeeName || "-"}</span>
        <span class="tag">${item.platform || "-"}</span>
        <span class="tag tag-soft">账号：${item.accountName || "-"}</span>
        <span class="tag tag-soft">作品类型：${item.sourcePostType || "-"}</span>
        <span class="tag tag-soft">销售：${assignedSales}</span>
      </div>
      ${showSalesContact ? `
        <div class="lead-contact-strip">
          <div class="lead-contact-copy">
            <strong>联系方式</strong>
            <span>${item.contactInfo || "-"}</span>
          </div>
          ${item.contactInfo ? `<button class="ghost js-copy-contact" data-contact="${escapeHtmlAttribute(item.contactInfo)}" type="button">一键复制</button>` : ""}
        </div>
      ` : ""}
      <div class="lead-monitor-grid lead-insight-grid">
        <div><strong>专业</strong><span>${item.majorContent || "-"}</span></div>
        <div><strong>IP</strong><span>${item.ip || "-"}</span></div>
        <div><strong>录入时间</strong><span>${formatDate(item.createdAt)}</span></div>
        <div><strong>备注</strong><span>${noteSummary}</span></div>
        <div><strong>添加状态</strong><span>${addStatus}</span></div>
        <div><strong>客资意向</strong><span>${item.intention || "未标记"}</span></div>
      </div>
      ${item.captureImageUrl ? `
        <div class="lead-inline-media">
          <button class="image-trigger image-trigger-inline js-open-image" data-src="${item.captureImageUrl}" type="button">
            <img class="cover-thumb" src="${item.captureImageUrl}" alt="引流截图" />
          </button>
          <div class="lead-inline-media-copy">
            <strong>已上传引流截图</strong>
            <span>主管和销售都可以直接点开看原图。</span>
          </div>
        </div>
      ` : ""}
      ${state.user?.role === "sales" && salesFeedbackSummary ? `
        <div class="lead-feedback-brief">
          <strong>最近反馈</strong>
          <p>${salesFeedbackSummary}</p>
          <span>${item.salesUserName || "销售"} · ${item.salesUpdatedAt ? formatDate(item.salesUpdatedAt) : ""}</span>
        </div>
      ` : ""}
      ${(item.captureImageUrl || item.sourcePostTitle || item.sourcePostUrl)
        ? `<details class="detail-block">
            <summary>展开更多信息</summary>
            <div class="detail-block-body">
              ${item.captureImageUrl ? `<div class="lead-monitor-note"><strong>引流截图</strong><p><button class="image-trigger image-trigger-inline js-open-image" data-src="${item.captureImageUrl}" type="button"><img class="cover-thumb" src="${item.captureImageUrl}" alt="引流截图" /></button></p></div>` : ""}
            <div class="lead-monitor-note"><strong>来源作品</strong><p>${item.sourcePostTitle || "未关联作品"}</p></div>
            ${item.sourcePostUrl ? `<div class="lead-monitor-note"><strong>作品链接</strong><p>${renderExternalLink(item.sourcePostUrl, "打开对应作品")}</p></div>` : ""}
            ${item.salesFeedback ? `<div class="lead-monitor-note"><strong>销售反馈</strong><p>${item.salesFeedback}</p><p class="muted">${item.salesUserName || "销售"} · ${item.salesUpdatedAt ? formatDate(item.salesUpdatedAt) : ""}</p></div>` : ""}
          </div>
          </details>`
        : ""}
      <div class="actions">
        ${state.user?.role !== "sales" ? `
          <button class="ghost js-remind-lead" data-id="${item.id}" data-target="sales" type="button">提醒销售</button>
          <button class="ghost js-remind-lead" data-id="${item.id}" data-target="operator" type="button">提醒运营</button>
          <button class="ghost js-open-account-viz-context" data-employee="${escapeHtmlAttribute(item.employeeId || "")}" data-account="${escapeHtmlAttribute(item.accountId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-month="${escapeHtmlAttribute(sourcePostMonth || String(item.createdAt || "").slice(0, 7))}" type="button">看账号节奏</button>
          <button class="ghost js-open-leads-context" data-employee="${escapeHtmlAttribute(item.employeeId || "")}" data-account="${escapeHtmlAttribute(item.accountId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-mode="day" data-date="${escapeHtmlAttribute(String(item.createdAt || "").slice(0, 10))}" type="button">看同账号客资</button>
          ${canOpenSourcePost ? `<button class="ghost js-open-posts-context" data-employee="${escapeHtmlAttribute(item.employeeId || "")}" data-platform="${escapeHtmlAttribute(item.platform || "")}" data-post-type="${escapeHtmlAttribute(item.sourcePostType || "")}" data-mode="day" data-date="${escapeHtmlAttribute(sourcePostDate)}" type="button">看来源作品</button>` : ""}
        ` : ""}
        ${state.user?.role === "sales" ? `<button class="ghost js-edit-lead" data-id="${item.id}">更新反馈</button>` : ""}
        ${state.user?.role !== "sales" ? renderReviewActionButtons(reviewPayload) : ""}
      </div>
    </article>
  `;
}

function applyLeadMonitorFilters(rows) {
  const keyword = String(state.leadMonitorKeyword || "").trim().toLowerCase();
  return rows.filter((item) => {
    if (state.leadMonitorEmployeeFilter && item.employeeId !== state.leadMonitorEmployeeFilter) return false;
    if (state.leadMonitorAccountFilter && item.accountId !== state.leadMonitorAccountFilter) return false;
    if (state.leadMonitorPlatformFilter && item.platform !== state.leadMonitorPlatformFilter) return false;
    if (state.leadMonitorPostTypeFilter && item.sourcePostType !== state.leadMonitorPostTypeFilter) return false;
    if (state.leadMonitorStatusFilter && item.status !== state.leadMonitorStatusFilter) return false;
    if (state.leadMonitorSalesFilter && item.assignedSalesUserId !== state.leadMonitorSalesFilter) return false;
    if (state.leadMonitorProcessFilter && (item.processStatus || "未接") !== state.leadMonitorProcessFilter) return false;
    if (state.leadMonitorAddFilter && (item.addStatus || "未添加") !== state.leadMonitorAddFilter) return false;
    if (state.leadMonitorIntentionFilter && (item.intention || "") !== state.leadMonitorIntentionFilter) return false;
    if (keyword) {
      const target = [
        item.employeeName,
        item.accountName,
        item.contactInfo,
        item.nickname,
        item.ip,
        item.assignedSalesUserName,
        item.sourcePostTitle
      ].join(" ").toLowerCase();
      if (!target.includes(keyword)) return false;
    }
    return true;
  });
}

function renderSalesLeadForm(editing) {
  return `
    <form id="salesLeadForm" class="form-grid form-grid-tight">
      <input type="hidden" name="id" value="${editing?.id || ""}" />
      <div class="full lead-monitor-grid lead-insight-grid">
        <div><strong>客资对象</strong><span>${editing?.nickname || editing?.contactInfo || "-"}</span></div>
        <div><strong>联系方式</strong><span>${editing?.contactInfo || "-"}</span></div>
        <div><strong>所属账号</strong><span>${editing?.accountName || "-"}</span></div>
        <div><strong>来源作品</strong><span>${editing?.sourcePostTitle || "未关联作品"}</span></div>
        <div><strong>当前状态</strong><span>${editing?.status || "-"}</span></div>
        <div><strong>处理状态</strong><span>${editing?.processStatus || "未接"}</span></div>
      </div>
      <select name="status">
        ${["新客资", "跟进中", "已成交", "无效"].map((item) => `<option value="${item}" ${editing?.status === item ? "selected" : ""}>${item}</option>`).join("")}
      </select>
      <select name="processStatus">
        ${LEAD_PROCESS_STATUSES.map((item) => `<option value="${item}" ${String(editing?.processStatus || "未接") === item ? "selected" : ""}>${item}</option>`).join("")}
      </select>
      <select name="addStatus">
        ${LEAD_ADD_STATUSES.map((item) => `<option value="${item}" ${String(editing?.addStatus || "未添加") === item ? "selected" : ""}>${item}</option>`).join("")}
      </select>
      <select name="intention">
        ${LEAD_INTENTIONS.map((item) => `<option value="${item}" ${String(editing?.intention || "") === item ? "selected" : ""}>${item || "未标记意向"}</option>`).join("")}
      </select>
      <input name="dealAmount" placeholder="成交金额" value="${editing?.dealAmount || ""}" />
      <textarea class="full" name="salesFeedback" rows="4" placeholder="跟进反馈">${editing?.salesFeedback || ""}</textarea>
      <div class="actions full">
        <button class="primary" type="submit">保存反馈</button>
        <button class="ghost js-cancel-lead" type="button">取消编辑</button>
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
          <tr><th>时间</th><th>员工</th><th>平台</th><th>昵称</th><th>联系方式</th><th>所属销售</th><th>是否已接</th><th>添加状态</th><th>客资意向</th><th>IP</th><th>所属账号</th><th>来源作品</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${rows.map((item) => `<tr><td>${formatDate(item.createdAt)}</td><td>${item.employeeName}</td><td>${item.platform}</td><td>${item.nickname || ""}</td><td>${item.contactInfo}</td><td>${item.assignedSalesUserName || "未分配"}</td><td>${item.processStatus || "未接"}</td><td>${item.addStatus || "未添加"}</td><td>${item.intention || "未标记"}</td><td>${item.ip || ""}</td><td>${item.accountName}</td><td>${item.sourcePostUrl ? renderExternalLink(item.sourcePostUrl, item.sourcePostTitle || "查看作品") : (item.sourcePostTitle || "未关联作品")}</td><td>${item.status}</td><td><div class="actions"><button class="ghost js-edit-lead" data-id="${item.id}">编辑</button><button class="ghost danger js-delete-lead" data-id="${item.id}">删除</button></div></td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSupervisorLeadTable(rows) {
  if (!rows.length) return `<div class="empty">暂无符合筛选条件的客资明细</div>`;
  return `
    <div class="table-wrap supervisor-leads-table">
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>平台</th>
            <th>所属运营</th>
            <th>运营账号</th>
            <th>联系方式</th>
            <th>IP</th>
            <th>分配销售</th>
            <th>处理状态</th>
            <th>添加状态</th>
            <th>客资意向</th>
            <th>来源作品</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>${formatDate(item.createdAt)}</td>
              <td>${item.platform || "-"}</td>
              <td>${item.employeeName || "-"}</td>
              <td>${item.accountName || "-"}</td>
              <td>${item.contactInfo || "-"}</td>
              <td>${item.ip || "-"}</td>
              <td>${item.assignedSalesUserName || "未分配"}</td>
              <td><span class="tag ${getLeadProcessTagClass(item.processStatus || "未接")}">${item.processStatus || "未接"}</span></td>
              <td><span class="tag ${getLeadAddTagClass(item.addStatus || "未添加")}">${item.addStatus || "未添加"}</span></td>
              <td><span class="tag ${getLeadIntentionTagClass(item.intention || "")}">${item.intention || "未标记"}</span></td>
              <td>${item.sourcePostUrl ? renderExternalLink(item.sourcePostUrl, item.sourcePostTitle || "打开原贴") : (item.sourcePostTitle || "未关联作品")}</td>
              <td>
                <div class="actions">
                  <button class="ghost js-remind-lead" data-id="${item.id}" data-target="sales" type="button">提醒销售</button>
                  <button class="ghost js-remind-lead" data-id="${item.id}" data-target="operator" type="button">提醒运营</button>
                </div>
              </td>
            </tr>
          `).join("")}
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
  const leadRows = todayRows.filter((item) => item.postType === "获客贴");
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>作品录入</h2>
        <p class="page-desc">录完账号、类型和作品链接就可以提交。系统会尽量自动补标题和互动数据，不耽误今天发帖节奏。</p>
      </div>
      <div class="toolbar toolbar-end">
        <span class="tag">${editing ? "正在编辑作品" : "今日录入"}</span>
      </div>
    </div>
    <section class="grid-4">
      ${stat("今日已录作品", todayRows.length)}
      ${stat("获客贴", leadRows.length)}
      ${stat("已填播放量", leadRows.filter((item) => Number(item.traffic || 0) > 0).length)}
      ${stat("今日播放量", leadRows.reduce((sum, item) => sum + Number(item.traffic || 0), 0))}
    </section>
    <div class="panel entry-panel">
      <div class="staff-form-head">
        <h3>${editing ? "编辑作品" : "新增作品"}</h3>
        <span class="muted">提交后会立刻写入后台，主管端同步后马上能看到。</span>
      </div>
      ${renderPostForm(editing, { compact: true })}
    </div>
    <div class="panel">
      <div class="section-head">
        <h3>今日录入记录</h3>
        <span class="muted">提交后会直接写入后台数据库，主管端刷新后就能看到。</span>
      </div>
      <div class="staff-posts-grid">
        ${todayRows.length ? todayRows.map(renderStaffPostCard).join("") : renderEmptyState("今天还没有录入作品", "先选账号、填链接和作品类型，第一条录进去后这里就会出现作品卡片。")}
      </div>
    </div>
  `;
}

function renderMyPosts() {
  const rows = getStaffFilteredPosts();
  const leadRows = rows.filter((item) => item.postType === "获客贴");
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>我的作品</h2>
        <p class="page-desc">默认查看自己所有已发布作品。可以按发布日期、账号昵称和作品类型筛选，方便回看和复盘。</p>
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
      </div>
    </div>
    <div class="grid-4">
      ${stat("作品条数", rows.length)}
      ${stat("获客贴条数", leadRows.length)}
      ${stat("已填播放量作品", leadRows.filter((item) => Number(item.traffic || 0) > 0).length)}
      ${stat("筛选范围总播放量", leadRows.reduce((sum, item) => sum + Number(item.traffic || 0), 0))}
    </div>
    <div class="staff-posts-grid">
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
    <div class="staff-gallery-grid">
      ${rows.length ? rows.map(renderStaffGalleryPostCard).join("") : renderEmptyState("当前筛选条件下没有作品", "可以切到全部作品，或者放宽平台、类型和运营筛选。")}
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

function renderStaffRankings() {
  const rows = getStaffCompetitionRows();
  const currentName = state.user?.employeeName || "";
  const myRow = rows.find((item) => item.name === currentName);
  const previousRow = myRow && myRow.rank > 1 ? rows[myRow.rank - 2] : null;
  const leader = rows[0];
  const metricKey = state.staffRankingsType === "posts" ? "postCount" : state.staffRankingsType === "engagement" ? "engagement" : "leadCount";
  const metricLabel = state.staffRankingsType === "posts" ? "作品数" : state.staffRankingsType === "engagement" ? "互动值" : "客资数";
  return `
    <div class="page-header page-header-rich">
      <div>
        <h2>运营排行榜</h2>
        <p class="page-desc">公开看谁稳定、谁能出客资、谁的作品更有学习价值，让竞争和学习同时发生。</p>
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
        <button class="ghost js-staff-rank-switch ${state.staffRankingsType === "engagement" ? "active-filter" : ""}" data-type="engagement" type="button">互动排行</button>
      </div>
    </div>
    <section class="grid-4">
      ${stat("我的名次", myRow ? `第 ${myRow.rank}` : "未上榜")}
      ${stat("当前领跑", leader ? `${leader.name}` : "-")}
      ${stat(`我与前一名差距`, myRow && previousRow ? `${Math.max(Number(previousRow[metricKey] || 0) - Number(myRow[metricKey] || 0), 0)} ${metricLabel}` : "-")}
      ${stat("上榜人数", rows.length)}
    </section>
    <section class="panel ranking-podium-panel">
      <div class="section-head">
        <h3>本期前三</h3>
        <span class="muted">看谁现在领先，再直接去看他最近发了什么。</span>
      </div>
        <div class="ranking-podium-grid">
          ${rows.slice(0, 3).map((item) => `
          <article class="ranking-podium-card ${item.name === currentName ? "ranking-podium-card-self" : ""}">
            <span class="ranking-podium-rank">#${item.rank}</span>
            <strong>${item.name}</strong>
            <p>${metricLabel} ${item[metricKey]} · 作品 ${item.postCount} · 获客贴 ${item.leadPostCount}</p>
            <div class="actions"><button class="ghost js-open-ranking-owner" data-owner="${item.employeeId || item.name}" type="button">看作品样本</button></div>
            ${renderAdminRankingActions(item)}
          </article>
        `).join("")}
      </div>
    </section>
    <div class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>排名</th><th>运营</th><th>作品数</th><th>获客贴</th><th>客资数</th><th>互动值</th><th>动作</th></tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((item) => `
              <tr class="${item.name === currentName ? "table-row-self" : ""}">
                <td>${item.rank}</td>
                <td>${item.name}</td>
                <td>${item.postCount}</td>
                <td>${item.leadPostCount}</td>
                <td>${item.leadCount}</td>
                <td>${item.engagement}</td>
                <td><button class="ghost js-open-ranking-owner" data-owner="${item.employeeId || item.name}" type="button">看作品样本</button></td>
              </tr>
            `).join("") : `<tr><td colspan="7"><div class="empty">当前周期还没有排行数据。</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
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
    <section class="grid-4">
      ${stat("当日客资数", rows.length)}
      ${stat("新客资", rows.filter((item) => item.status === "新客资").length)}
      ${stat("跟进中", rows.filter((item) => item.status === "跟进中").length)}
      ${stat("已成交", rows.filter((item) => item.status === "已成交").length)}
    </section>
    <div class="panel entry-panel">
      <div class="staff-form-head">
        <h3>${editing ? "编辑客资" : "新增客资"}</h3>
        <span class="muted">先录必要信息，后续需要补充时可以在下方记录里继续编辑。</span>
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
      <input class="full" name="postUrl" placeholder="作品链接" value="${editing?.postUrl || ""}" />
      <div class="full" id="postTrafficField" style="${selectedType === "获客贴" ? "" : "display:none;"}">
        <input name="traffic" type="number" min="0" placeholder="获客贴播放量（仅获客贴填写，其他类型自动记为0）" value="${selectedType === "获客贴" ? (editing?.traffic ?? "") : ""}" />
      </div>
      <p class="muted full form-hint">${compact ? "员工端请填写发布账号、作品名、作品类型、封面和作品链接。只有获客贴需要补播放量；不填时会优先沿用前一天同作品的数据。" : "填写作品链接后，系统会尝试自动抓取标题、点赞、评论、收藏。播放量只取员工填写的获客贴播放量，其他类型自动记为 0。"}</p>
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
  const salesUsers = state.users.filter((item) => item.role === "sales");
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
      <input name="nickname" placeholder="昵称" value="${editing?.nickname || ""}" />
      <input name="majorContent" placeholder="专业内容" value="${editing?.majorContent || ""}" />
      <input name="ip" placeholder="IP" value="${editing?.ip || ""}" />
      <select name="status"><option ${editing?.status === "新客资" ? "selected" : ""}>新客资</option><option ${editing?.status === "跟进中" ? "selected" : ""}>跟进中</option><option ${editing?.status === "已成交" ? "selected" : ""}>已成交</option><option ${editing?.status === "无效" ? "selected" : ""}>无效</option></select>
      ${
        compact
          ? ""
          : `<select name="assignedSalesUserId"><option value="">未分配销售</option>${salesUsers.map((item) => `<option value="${item.id}" ${editing?.assignedSalesUserId === item.id ? "selected" : ""}>${item.username}</option>`).join("")}</select>`
      }
      ${
        compact
          ? ""
          : `<select name="processStatus">${LEAD_PROCESS_STATUSES.map((item) => `<option value="${item}" ${String(editing?.processStatus || "未接") === item ? "selected" : ""}>${item}</option>`).join("")}</select>`
      }
      ${
        compact
          ? ""
          : `<select name="addStatus">${LEAD_ADD_STATUSES.map((item) => `<option value="${item}" ${String(editing?.addStatus || "未添加") === item ? "selected" : ""}>${item}</option>`).join("")}</select>`
      }
      ${
        compact
          ? ""
          : `<select name="intention">${LEAD_INTENTIONS.map((item) => `<option value="${item}" ${String(editing?.intention || "") === item ? "selected" : ""}>${item || "未标记意向"}</option>`).join("")}</select>`
      }
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
            : `<p class="muted">上传聊天、评论区或私信引流截图后，主管端和销售端都会同步显示。</p>`}
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
      </div>
    </div>
    <section class="panel">
      <div class="section-head">
        <h3>核心归因</h3>
        <span class="muted">先看本周期作品、获客贴、客资和来源作品归因，再往下看趋势、账号和内容表现。</span>
      </div>
      <section class="grid-4 stat-grid">
        ${stat("抖音作品数", summary.douyinPosts || 0, "", "抖音")}
        ${stat("小红书作品数", summary.xhsPosts || 0, "", "小红书")}
        ${stat("获客贴数", leadPostCount, "", "获客")}
        ${stat("新增客资数", summary.todayLeads || 0, "", "客资")}
        ${stat("有客资来源作品/账号", `${postsWithLeads}/${accountsWithLeads}`, "", "归因")}
        ${stat("客资来源作品转化率", conversionRate, "", "转化")}
      </section>
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
    </section>
    <section class="panel">
      <div class="section-head"><h3>平台客资趋势</h3><span class="muted">拆开看抖音和小红书的客资起伏，更适合做周期判断。</span></div>
      <div id="platformLeadsTrendChart" class="chart-box chart-box-hero"></div>
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
  const likes = Number(item.likes || 0);
  const comments = Number(item.comments || 0);
  return `
    <article class="staff-post-card">
      <div class="staff-post-cover">
        ${item.coverImageUrl ? `<button class="image-trigger js-open-image" data-src="${item.coverImageUrl}" type="button"><img src="${item.coverImageUrl}" alt="${item.title || "作品封面"}" class="staff-post-image" /></button>` : `<div class="staff-post-placeholder">暂无封面</div>`}
      </div>
      <div class="staff-post-body">
        <div class="post-monitor-tags">
          <span class="tag tag-soft">${item.accountName || "未绑定账号"}</span>
          <span class="tag">${item.platform || "-"}</span>
          <span class="tag tag-warm">${item.postType || "-"}</span>
        </div>
        <h3>${item.title || "未命名作品"}</h3>
        <div class="post-monitor-meta">
          <span>发布时间：${item.publishedAt || "-"}</span>
          <span>${item.accountName || "未绑定账号"}</span>
        </div>
        <div class="post-monitor-engagement" aria-label="作品互动概览">
          <div class="post-monitor-engagement-item">
            <span>点赞</span>
            <strong>${likes}</strong>
          </div>
          <span class="post-monitor-engagement-divider" aria-hidden="true"></span>
          <div class="post-monitor-engagement-item">
            <span>评论</span>
            <strong>${comments}</strong>
          </div>
        </div>
        <div class="actions">
          <button class="ghost js-edit-post" data-id="${item.id}">编辑作品</button>
          <button class="ghost danger js-delete-post" data-id="${item.id}">删除作品</button>
          ${item.postUrl ? renderExternalLink(item.postUrl, "打开原帖") : ""}
        </div>
      </div>
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
        <div><strong>备注</strong><span>${noteSummary}</span></div>
      </div>
      ${(item.captureImageUrl || item.sourcePostTitle || item.sourcePostUrl)
        ? `<details class="detail-block">
            <summary>展开更多信息</summary>
            <div class="detail-block-body">
              <div class="lead-monitor-note"><strong>来源作品</strong><p>${item.sourcePostTitle || "未关联作品"}</p></div>
              ${item.sourcePostUrl ? `<div class="lead-monitor-note"><strong>作品链接</strong><p>${renderExternalLink(item.sourcePostUrl, "打开对应作品")}</p></div>` : ""}
              ${item.captureImageUrl ? `<div class="lead-monitor-note"><strong>引流截图</strong><p><button class="image-trigger image-trigger-inline js-open-image" data-src="${item.captureImageUrl}" type="button"><img class="cover-thumb" src="${item.captureImageUrl}" alt="引流截图" /></button></p></div>` : ""}
            </div>
          </details>`
        : ""}
      <div class="actions">
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
  if (snapshot?.leadsMonitor) return dedupeLeadRows(snapshot.leadsMonitor);
  return dedupeLeadRows(state.leads.filter((item) => String(item.createdAt).startsWith(date)));
}

function normalizeLeadDuplicateField(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getLeadDuplicateSignature(lead) {
  return [
    lead.employeeId || "",
    lead.accountId || "",
    lead.postId || "",
    normalizeLeadDuplicateField(lead.platform),
    normalizeLeadDuplicateField(lead.contactInfo),
    normalizeLeadDuplicateField(lead.nickname),
    normalizeLeadDuplicateField(lead.majorContent),
    normalizeLeadDuplicateField(lead.ip),
    normalizeLeadDuplicateField(lead.note),
    normalizeLeadDuplicateField(lead.status)
  ].join("|");
}

function dedupeLeadRows(rows = []) {
  const seen = new Set();
  const unique = [];
  rows.forEach((row) => {
    const createdAt = String(row?.createdAt || "");
    const secondKey = createdAt ? createdAt.slice(0, 19) : "";
    const signature = `${getLeadDuplicateSignature(row)}|${secondKey}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    unique.push(row);
  });
  return unique;
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
  const visibleLeads = applyLeadMonitorFilters(getLeadsForMonitor());
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

function bindViewEvents() {
  document.getElementById("employeeForm")?.addEventListener("submit", submitEmployee);
  document.getElementById("staffUserForm")?.addEventListener("submit", submitStaffUser);
  document.getElementById("accountForm")?.addEventListener("submit", submitAccount);
  document.getElementById("postForm")?.addEventListener("submit", submitPost);
  document.getElementById("leadForm")?.addEventListener("submit", submitLead);
  document.getElementById("salesLeadForm")?.addEventListener("submit", submitSalesLead);
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
  document.getElementById("accountVizAccountFilter")?.addEventListener("change", (event) => {
    state.accountVizSelectedAccountId = event.target.value;
    renderApp();
  });
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
  document.getElementById("staffLeadsDateInput")?.addEventListener("change", (event) => {
    state.staffLeadsDate = event.target.value;
    renderApp();
  });
  document.getElementById("postMonitorEmployeeFilter")?.addEventListener("change", (event) => {
    state.postMonitorEmployeeFilter = event.target.value;
    state.postMonitorAccountFilter = "";
    renderApp();
  });
  document.getElementById("postMonitorAccountFilter")?.addEventListener("change", (event) => {
    state.postMonitorAccountFilter = event.target.value;
    renderApp();
  });
  document.getElementById("postMonitorTypeFilter")?.addEventListener("change", (event) => {
    state.postMonitorTypeFilter = event.target.value;
    renderApp();
  });
  document.getElementById("postMonitorPlatformFilter")?.addEventListener("change", (event) => {
    state.postMonitorPlatformFilter = event.target.value;
    state.postMonitorAccountFilter = "";
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
  document.getElementById("leadMonitorSalesFilter")?.addEventListener("change", (event) => {
    state.leadMonitorSalesFilter = event.target.value;
    renderApp();
  });
  document.getElementById("leadMonitorProcessFilter")?.addEventListener("change", (event) => {
    state.leadMonitorProcessFilter = event.target.value;
    renderApp();
  });
  document.getElementById("leadMonitorAddFilter")?.addEventListener("change", (event) => {
    state.leadMonitorAddFilter = event.target.value;
    renderApp();
  });
  document.getElementById("leadMonitorIntentionFilter")?.addEventListener("change", (event) => {
    state.leadMonitorIntentionFilter = event.target.value;
    renderApp();
  });
  document.getElementById("leadMonitorKeywordInput")?.addEventListener("input", (event) => {
    state.leadMonitorKeyword = event.target.value;
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
  document.getElementById("rollbackSnapshotDateInput")?.addEventListener("change", (event) => {
    state.rollbackSnapshotDate = event.target.value;
  });
  document.getElementById("refreshScopedMetricsBtn")?.addEventListener("click", refreshScopedMetrics);
  document.getElementById("rollbackScopedMetricsBtn")?.addEventListener("click", rollbackScopedMetrics);
  document.querySelectorAll(".js-edit-lead").forEach((el) => el.addEventListener("click", () => { clearPendingLeadCapture(); state.editingLeadId = el.dataset.id; state.currentView = state.user.role === "admin" ? "leads" : state.user.role === "sales" ? "sales-leads" : "lead-entry"; renderApp(); }));
  document.querySelectorAll(".js-delete-lead").forEach((el) => el.addEventListener("click", () => deleteLead(el.dataset.id)));
  document.querySelectorAll(".js-toggle-lead-process").forEach((el) => el.addEventListener("click", () => updateLeadQuick(el.dataset.id, { processStatus: el.dataset.next || "已接" }, "处理状态已更新")));
  document.querySelectorAll(".js-toggle-lead-add").forEach((el) => el.addEventListener("click", () => updateLeadQuick(el.dataset.id, { addStatus: el.dataset.next || "已添加" }, "添加状态已更新")));
  document.querySelectorAll(".js-remind-lead").forEach((el) => el.addEventListener("click", () => sendLeadReminder(el.dataset.id, el.dataset.target || "sales")));
  document.querySelectorAll(".js-lead-intention").forEach((el) => el.addEventListener("change", () => updateLeadQuick(el.dataset.id, { intention: el.value }, "客资意向已更新")));
  document.querySelector(".js-cancel-employee")?.addEventListener("click", () => { state.editingEmployeeId = ""; renderApp(); });
  document.querySelector(".js-cancel-account")?.addEventListener("click", () => { state.editingAccountId = ""; renderApp(); });
  document.querySelector(".js-cancel-post")?.addEventListener("click", () => { clearPendingPostCover(); state.editingPostId = ""; renderApp(); });
  document.querySelector(".js-cancel-lead")?.addEventListener("click", () => { clearPendingLeadCapture(); state.editingLeadId = ""; renderApp(); });
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

  try {
    const result = await api("/api/posts/rollback-metrics", {
      method: "POST",
      body: JSON.stringify({
        postIds,
        snapshotDate: state.rollbackSnapshotDate
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

async function updateLeadQuick(id, payload, successTitle, successBody = "") {
  const target = state.leads.find((item) => item.id === id);
  if (!target) return;
  const formData = new FormData();
  formData.set("accountId", target.accountId || "");
  formData.set("postId", target.postId || "");
  formData.set("contactInfo", target.contactInfo || "");
  formData.set("nickname", target.nickname || "");
  formData.set("budget", target.budget || "");
  formData.set("majorContent", target.majorContent || "");
  formData.set("ip", target.ip || "");
  formData.set("status", payload.status ?? target.status ?? "新客资");
  formData.set("dealAmount", payload.dealAmount ?? target.dealAmount ?? "");
  formData.set("note", payload.note ?? target.note ?? "");
  formData.set("captureImageUrl", target.captureImageUrl || "");
  formData.set("salesFeedback", payload.salesFeedback ?? target.salesFeedback ?? "");
  formData.set("assignedSalesUserId", payload.assignedSalesUserId ?? target.assignedSalesUserId ?? "");
  formData.set("processStatus", payload.processStatus ?? target.processStatus ?? "未接");
  formData.set("addStatus", payload.addStatus ?? target.addStatus ?? "未添加");
  formData.set("intention", payload.intention ?? target.intention ?? "");
  await api(`/api/leads/${id}`, {
    method: "PUT",
    body: formData
  });
  if (successTitle) {
    setFlash("success", successTitle, successBody);
  }
  await loadData();
  renderApp();
}

async function sendLeadReminder(id, target) {
  await api(`/api/leads/${id}/remind`, {
    method: "POST",
    body: JSON.stringify({ target })
  });
  setFlash("success", target === "operator" ? "已提醒运营" : "已发送提醒", target === "operator" ? "对应运营会在消息里看到这条补充提醒。" : "销售端提醒已经记录，方便继续推进这条客资。");
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
  return getPostsByDate(state.postMonitorDate);
}

function getLeadsForMonitor() {
  if (state.leadMonitorMode === "week") {
    return getDatesInWeek(state.leadMonitorWeek).flatMap((date) => getLeadsByDate(date));
  }
  return getLeadsByDate(state.leadMonitorDate);
}

function getPostMonitorLabel() {
  return state.postMonitorMode === "week" ? state.postMonitorWeek : state.postMonitorDate;
}

function getLeadMonitorLabel() {
  return state.leadMonitorMode === "week" ? state.leadMonitorWeek : state.leadMonitorDate;
}

init();
