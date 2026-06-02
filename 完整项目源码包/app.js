const STORAGE_KEYS = {
  orders: "paper-order-system-orders",
  user: "paper-order-system-user",
  teachers: "paper-order-system-teachers",
};

const demoUsers = [
  { username: "academic", password: "academic123", role: "academic", name: "王教务" },
];

const roleLabels = {
  supervisor: "主管端",
  academic: "教务端",
};

const roleEditableFields = {
  supervisor: "all",
  academic: "all",
};

const quickProgressOptions = ["待分配", "进行中", "待投稿", "已投稿", "返修中", "已录用"];
const quickJournalStatusOptions = ["未投稿", "Submitted", "With Editor", "Under Review", "Revision", "Accepted", "Proofing", "Online", "Indexed", "Rejected"];
const quickRegistrationOptions = ["未索要", "已索要", "已收到", "已传老师"];
const journalStages = ["Submitted", "With Editor", "Under Review", "Revision", "Accepted", "Proofing", "Online", "Indexed", "Rejected"];

const state = {
  currentUser: null,
  orders: [],
  teachers: [],
  currentOrderId: "",
  pendingAttachments: [],
  currentAuthors: [],
  activeView: "workbench",
};

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginHint = document.getElementById("loginHint");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserName = document.getElementById("currentUserName");
const currentUserRole = document.getElementById("currentUserRole");
const workbenchView = document.getElementById("workbenchView");
const formView = document.getElementById("formView");
const listView = document.getElementById("listView");
const teacherView = document.getElementById("teacherView");
const detailView = document.getElementById("detailView");
const workbenchViewTab = document.getElementById("workbenchViewTab");
const formViewTab = document.getElementById("formViewTab");
const listViewTab = document.getElementById("listViewTab");
const teacherViewTab = document.getElementById("teacherViewTab");
const detailViewTab = document.getElementById("detailViewTab");
const workbenchTitle = document.getElementById("workbenchTitle");
const workbenchBadge = document.getElementById("workbenchBadge");
const workbenchContent = document.getElementById("workbenchContent");
const orderForm = document.getElementById("orderForm");
const formTitle = document.getElementById("formTitle");
const submitBtn = document.getElementById("submitBtn");
const deleteBtn = document.getElementById("deleteBtn");
const resetFormBtn = document.getElementById("resetFormBtn");
const searchInput = document.getElementById("searchInput");
const progressFilter = document.getElementById("progressFilter");
const orderList = document.getElementById("orderList");
const orderCount = document.getElementById("orderCount");
const attachmentInput = document.getElementById("attachmentInput");
const authorRegistrationInput = document.getElementById("authorRegistrationInput");
const attachmentCategory = document.getElementById("attachmentCategory");
const attachmentList = document.getElementById("attachmentList");
const statusStageStrip = document.getElementById("statusStageStrip");
const authorsDataInput = document.getElementById("authorsData");
const authorsContainer = document.getElementById("authorsContainer");
const addAuthorBtn = document.getElementById("addAuthorBtn");
const teacherForm = document.getElementById("teacherForm");
const teacherList = document.getElementById("teacherList");
const teacherCount = document.getElementById("teacherCount");
const resetTeacherFormBtn = document.getElementById("resetTeacherFormBtn");
const detailTitle = document.getElementById("detailTitle");
const detailEmpty = document.getElementById("detailEmpty");
const detailContent = document.getElementById("detailContent");
const backToListBtn = document.getElementById("backToListBtn");
const editOrderBtn = document.getElementById("editOrderBtn");

init();

function init() {
  loadOrders();
  loadTeachers();
  restoreUser();
  bindEvents();
  seedOrders();
  seedTeachers();
  syncView();
}

function bindEvents() {
  loginForm.addEventListener("submit", handleLogin);
  logoutBtn.addEventListener("click", logout);
  workbenchViewTab.addEventListener("click", () => setActiveView("workbench"));
  formViewTab.addEventListener("click", () => setActiveView("form"));
  listViewTab.addEventListener("click", () => setActiveView("list"));
  teacherViewTab.addEventListener("click", () => setActiveView("teachers"));
  detailViewTab.addEventListener("click", () => state.currentOrderId && setActiveView("detail"));
  orderForm.addEventListener("submit", handleOrderSubmit);
  orderForm.elements.namedItem("operationMethod").addEventListener("change", updateSubmissionBlocks);
  orderForm.elements.namedItem("journalStatus").addEventListener("change", updateStatusStageStrip);
  addAuthorBtn.addEventListener("click", addAuthor);
  authorsContainer.addEventListener("input", handleAuthorInput);
  authorsContainer.addEventListener("click", handleAuthorAction);
  resetFormBtn.addEventListener("click", resetForm);
  deleteBtn.addEventListener("click", deleteCurrentOrder);
  searchInput.addEventListener("input", renderOrderList);
  progressFilter.addEventListener("change", renderOrderList);
  orderList.addEventListener("change", handleListQuickChange);
  orderList.addEventListener("click", handleListQuickClick);
  attachmentInput?.addEventListener("change", handleAttachmentsSelect);
  authorRegistrationInput.addEventListener("change", handleAuthorRegistrationSelect);
  attachmentList?.addEventListener("click", handleAttachmentActions);
  teacherForm.addEventListener("submit", handleTeacherSubmit);
  teacherList.addEventListener("click", handleTeacherListClick);
  resetTeacherFormBtn.addEventListener("click", resetTeacherForm);
  detailContent.addEventListener("click", handleDetailActions);
  detailContent.addEventListener("submit", handleDetailSubmit);
  backToListBtn.addEventListener("click", () => setActiveView("list"));
  editOrderBtn.addEventListener("click", () => state.currentOrderId && setActiveView("form"));
  ["orderAmount", "customerPaid", "teacherPrice", "teacherPaid"].forEach((name) => {
    orderForm.elements.namedItem(name).addEventListener("input", syncPaymentFields);
  });
}

function loadOrders() {
  const raw = localStorage.getItem(STORAGE_KEYS.orders);
  if (!raw) return;
  try {
    state.orders = JSON.parse(raw).map(normalizeOrder);
  } catch {
    state.orders = [];
  }
}

function saveOrders() {
  localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(state.orders));
}

function loadTeachers() {
  const raw = localStorage.getItem(STORAGE_KEYS.teachers);
  if (!raw) return;
  try {
    state.teachers = JSON.parse(raw);
  } catch {
    state.teachers = [];
  }
}

function saveTeachers() {
  localStorage.setItem(STORAGE_KEYS.teachers, JSON.stringify(state.teachers));
}

function restoreUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) return;
  try {
    state.currentUser = JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEYS.user);
  }
}

function seedOrders() {
  if (state.orders.length > 0) return;
  const now = new Date();
  const iso = now.toISOString();
  const plusHours = (hours) => new Date(now.getTime() + hours * 3600000).toISOString().slice(0, 16);
  const minusHours = (hours) => new Date(now.getTime() - hours * 3600000).toISOString().slice(0, 16);

  state.orders = [
    {
      id: crypto.randomUUID(),
      orderNumber: "LW-20260416-001",
      customerWechat: "wx_paper_001",
      customerName: "张敏",
      customerNickname: "张同学",
      customerPhone: "13800138000",
      schoolName: "华东师范大学",
      degreeLevel: "硕士",
      majorDirection: "教育管理",
      requiredZone: "北大核心",
      paperUse: "毕业",
      urgencyLevel: "加急",
      personalInfo: "硕士，已完成开题报告，急需6月底前录用。",
      acceptanceDate: "2026-06-30",
      keyMilestones: "4月20日前初稿，5月10日定稿，5月15日前投稿",
      operationMethod: "邮箱投稿",
      paperTitle: "高校教学质量提升路径研究",
      wordCount: "6000字",
      plagiarismRequirement: "10%以内",
      journalName: "现代教育研究",
      backupJournal: "教育观察",
      journalCredentials: "journal_demo / 123456",
      emailCredentials: "mail_demo / 888888",
      responsibleTeacher: "王教务",
      academicOwner: "王教务",
      paperProgress: "进行中",
      statusStage: "写作中",
      teacherStability: "新老师",
      registrationFormStatus: "已传老师",
      infoSentToTeacherAt: minusHours(48),
      innovationReviewStatus: "待审核",
      innovationReviewAt: "",
      firstDraftReviewStatus: "未提交",
      firstDraftReviewAt: "",
      editorReviewStatus: "未提交",
      editorReviewAt: "",
      authorInfoChecked: "未核对",
      authorInfoCheckedAt: "",
      assignedTeacher: "李老师",
      backupTeacher: "周老师",
      teacherPhone: "13911112222",
      salesContact: "陈销售",
      nextFollowUpAt: plusHours(10),
      lastTeacherUpdateAt: minusHours(36),
      riskLevel: "高风险",
      customerComplaint: "否",
      needsSupervisor: "是",
      emergencyStatus: "处理中",
      supervisorNote: "客户时间紧，老师反馈超24小时，需今晚前确认稿件进度。",
      submissionUrl: "",
      submissionAccount: "",
      submissionPassword: "",
      submittedAt: "",
      journalStatus: "未投稿",
      firstWeekCheckAt: "",
      nextJournalCheckAt: "",
      reminderLetterStatus: "不需要",
      revisionStatus: "无返修",
      revisionDueAt: "",
      pageFeeStatus: "未录用",
      proofingStatus: "未到校稿",
      onlineStatus: "未online",
      onlineAt: "",
      indexingStatus: "未检索",
      indexingAt: "",
      reviewReportStatus: "未开",
      orderAmount: "12800",
      customerPaid: "6800",
      customerPending: "6000",
      teacherPrice: "6500",
      teacherPaid: "3000",
      teacherPending: "3500",
      followUpLogs: [
        {
          id: crypto.randomUUID(),
          actor: "王教务",
          time: minusHours(20),
          type: "催办记录",
          content: "已提醒李老师今晚前反馈初稿完成度。",
        },
      ],
      attachments: [],
      createdAt: iso,
      updatedAt: iso,
    },
    {
      id: crypto.randomUUID(),
      orderNumber: "LW-20260416-002",
      customerWechat: "wx_paper_002",
      customerName: "刘涛",
      customerNickname: "刘老师",
      customerPhone: "13722223333",
      schoolName: "某职业学院",
      degreeLevel: "职称",
      majorDirection: "护理管理",
      requiredZone: "科技核心",
      paperUse: "评职称",
      urgencyLevel: "常规",
      personalInfo: "客户资料较全，需要包投稿。",
      acceptanceDate: "2026-08-20",
      keyMilestones: "4月建档，5月投稿",
      operationMethod: "账号代投",
      paperTitle: "护理质量管理优化研究",
      wordCount: "5000字",
      plagiarismRequirement: "15%以内",
      journalName: "中国护理管理",
      backupJournal: "",
      journalCredentials: "nurse_demo / 333333",
      emailCredentials: "nurse_mail / 333333",
      responsibleTeacher: "王教务",
      academicOwner: "王教务",
      paperProgress: "待投稿",
      statusStage: "待投稿",
      teacherStability: "稳定老师",
      registrationFormStatus: "已传老师",
      infoSentToTeacherAt: minusHours(72),
      innovationReviewStatus: "稳定老师跳过",
      innovationReviewAt: "",
      firstDraftReviewStatus: "已通过",
      firstDraftReviewAt: minusHours(30),
      editorReviewStatus: "已通过",
      editorReviewAt: minusHours(12),
      authorInfoChecked: "已核对无误",
      authorInfoCheckedAt: minusHours(10),
      assignedTeacher: "李老师",
      backupTeacher: "",
      teacherPhone: "13911112222",
      salesContact: "陈销售",
      nextFollowUpAt: plusHours(24),
      lastTeacherUpdateAt: minusHours(8),
      riskLevel: "提醒",
      customerComplaint: "否",
      needsSupervisor: "否",
      emergencyStatus: "正常",
      supervisorNote: "等待教务核对投稿材料。",
      submissionUrl: "https://journal.example.com/submit",
      submissionAccount: "nurse_demo",
      submissionPassword: "333333",
      submittedAt: "",
      journalStatus: "未投稿",
      firstWeekCheckAt: "",
      nextJournalCheckAt: "",
      reminderLetterStatus: "不需要",
      revisionStatus: "无返修",
      revisionDueAt: "",
      pageFeeStatus: "未录用",
      proofingStatus: "未到校稿",
      onlineStatus: "未online",
      onlineAt: "",
      indexingStatus: "未检索",
      indexingAt: "",
      reviewReportStatus: "未开",
      orderAmount: "9800",
      customerPaid: "9800",
      customerPending: "0",
      teacherPrice: "4200",
      teacherPaid: "2000",
      teacherPending: "2200",
      followUpLogs: [
        {
          id: crypto.randomUUID(),
          actor: "王教务",
          time: minusHours(6),
          type: "老师反馈",
          content: "已核对投稿材料，等待老师确认最终版本。",
        },
      ],
      attachments: [],
      createdAt: iso,
      updatedAt: iso,
    },
    {
      id: crypto.randomUUID(),
      orderNumber: "LW-20260416-003",
      customerWechat: "wx_paper_003",
      customerName: "赵悦",
      customerNickname: "赵博士",
      customerPhone: "13644445555",
      schoolName: "某医科大学",
      degreeLevel: "博士",
      majorDirection: "公共卫生",
      requiredZone: "SCI拓展",
      paperUse: "毕业",
      urgencyLevel: "较急",
      personalInfo: "客户已投诉一次，要求尽快给明确结果。",
      acceptanceDate: "2026-05-28",
      keyMilestones: "4月返修，4月25日前提交",
      operationMethod: "邮箱投稿",
      paperTitle: "公共卫生风险评估模型研究",
      wordCount: "8000字",
      plagiarismRequirement: "8%以内",
      journalName: "Global Health Review",
      backupJournal: "Public Health Trends",
      journalCredentials: "ghr / 666666",
      emailCredentials: "ghr_mail / 666666",
      responsibleTeacher: "王教务",
      academicOwner: "王教务",
      paperProgress: "返修中",
      statusStage: "异常处理中",
      teacherStability: "稳定老师",
      registrationFormStatus: "已传老师",
      infoSentToTeacherAt: minusHours(120),
      innovationReviewStatus: "稳定老师跳过",
      innovationReviewAt: "",
      firstDraftReviewStatus: "已通过",
      firstDraftReviewAt: minusHours(96),
      editorReviewStatus: "已通过",
      editorReviewAt: minusHours(84),
      authorInfoChecked: "已核对无误",
      authorInfoCheckedAt: minusHours(80),
      assignedTeacher: "刘老师",
      backupTeacher: "李老师",
      teacherPhone: "13688889999",
      salesContact: "孙销售",
      nextFollowUpAt: plusHours(4),
      lastTeacherUpdateAt: minusHours(60),
      riskLevel: "应急",
      customerComplaint: "是",
      needsSupervisor: "是",
      emergencyStatus: "待处理",
      supervisorNote: "老师返修超时且客户投诉，已列入应急处理。",
      submissionUrl: "https://globalhealth.example.com/login",
      submissionAccount: "ghr",
      submissionPassword: "666666",
      submittedAt: minusHours(240),
      journalStatus: "Revision",
      firstWeekCheckAt: minusHours(72),
      nextJournalCheckAt: "",
      reminderLetterStatus: "不需要",
      revisionStatus: "待提醒老师",
      revisionDueAt: new Date(now.getTime() + 18 * 3600000).toISOString().slice(0, 16),
      pageFeeStatus: "未录用",
      proofingStatus: "未到校稿",
      onlineStatus: "未online",
      onlineAt: "",
      indexingStatus: "未检索",
      indexingAt: "",
      reviewReportStatus: "未开",
      orderAmount: "16800",
      customerPaid: "10000",
      customerPending: "6800",
      teacherPrice: "9000",
      teacherPaid: "4500",
      teacherPending: "4500",
      followUpLogs: [
        {
          id: crypto.randomUUID(),
          actor: "王教务",
          time: minusHours(12),
          type: "应急催办",
          content: "返修超时，已电话联系老师并同步主管介入。",
        },
      ],
      attachments: [],
      createdAt: iso,
      updatedAt: iso,
    },
  ];

  state.orders = state.orders.map(normalizeOrder);
  saveOrders();
}

function seedTeachers() {
  if (state.teachers.length > 0) return;
  state.teachers = [
    {
      id: crypto.randomUUID(),
      name: "李老师",
      contact: "13800000001",
      capability: "医学统计、护理、公共卫生",
      directions: "医学, 护理, 公卫",
      stability: "稳定老师",
      rating: "A",
      note: "响应快，初稿质量稳定，适合急单和返修单。",
      updatedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: "陈老师",
      contact: "13800000002",
      capability: "教育管理、思政、职业教育",
      directions: "教育, 思政, 职教",
      stability: "观察中",
      rating: "B",
      note: "选题创新点不错，需加强格式和参考文献核对。",
      updatedAt: new Date().toISOString(),
    },
  ];
  saveTeachers();
}

function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const matchedUser = demoUsers.find((item) => item.username === username && item.password === password);

  if (!matchedUser) {
    loginHint.textContent = "账号或密码不正确，请检查后重试";
    loginHint.style.color = "#c64736";
    return;
  }

  state.currentUser = { username: matchedUser.username, role: matchedUser.role, name: matchedUser.name };
  state.activeView = "workbench";
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(state.currentUser));
  loginForm.reset();
  loginHint.textContent = "登录成功";
  loginHint.style.color = "#2f7a53";
  syncView();
}

function logout() {
  state.currentUser = null;
  state.currentOrderId = "";
  state.pendingAttachments = [];
  state.activeView = "workbench";
  localStorage.removeItem(STORAGE_KEYS.user);
  syncView();
}

function syncView() {
  if (!state.currentUser) {
    loginPanel.classList.remove("hidden");
    dashboard.classList.add("hidden");
    loginHint.textContent = "请输入账号和密码";
    loginHint.style.color = "";
    return;
  }

  loginPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
  currentUserName.textContent = state.currentUser.name;
  currentUserRole.textContent = roleLabels[state.currentUser.role];
  renderWorkbench();
  renderOrderList();
  renderOrderDetail();
  renderTeacherList();
  resetForm(false);
  setActiveView(state.activeView);
}

function getRoleScopedOrders() {
  if (!state.currentUser) return [];
  const { role, name } = state.currentUser;
  if (role === "supervisor") return [...state.orders];
  if (role === "academic") return state.orders.filter((item) => item.academicOwner === name || item.responsibleTeacher === name);
  return [];
}

function getVisibleOrders() {
  const keyword = searchInput.value.trim().toLowerCase();
  const progress = progressFilter.value;
  return getRoleScopedOrders()
    .filter((item) => !progress || item.paperProgress === progress)
    .filter((item) => {
      if (!keyword) return true;
      return [
        item.orderNumber, item.customerWechat, item.customerName, item.customerNickname,
        item.paperTitle, item.journalName, item.salesContact, item.assignedTeacher,
      ].join(" ").toLowerCase().includes(keyword);
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function renderWorkbench() {
  const orders = getRoleScopedOrders();
  const alerts = orders.flatMap((order) => deriveAlerts(order));
  workbenchTitle.textContent = `${roleLabels[state.currentUser.role]}工作台`;
  workbenchBadge.textContent = state.currentUser.role === "supervisor" ? "异常监控" : "待处理视图";

  if (state.currentUser.role === "supervisor") {
    workbenchContent.innerHTML = renderSupervisorWorkbench(orders, alerts);
    return;
  }
  if (state.currentUser.role === "academic") {
    workbenchContent.innerHTML = renderAcademicWorkbench(orders, alerts);
    return;
  }
  workbenchContent.innerHTML = "";
}

function renderSupervisorWorkbench(orders, alerts) {
  const totalAmount = orders.reduce((sum, item) => sum + toMoney(item.orderAmount), 0);
  const totalReceived = orders.reduce((sum, item) => sum + toMoney(item.customerPaid), 0);
  const totalPending = orders.reduce((sum, item) => sum + toMoney(item.customerPending), 0);
  const teacherPending = orders.reduce((sum, item) => sum + toMoney(item.teacherPending), 0);
  const complaint = orders.filter((item) => item.customerComplaint === "是").length;
  const emergency = orders.filter((item) => item.emergencyStatus && item.emergencyStatus !== "正常").length;

  return `
    <div class="metric-grid">
      ${renderMetricCard("订单总额", formatCurrency(totalAmount), "当前主管可见全部订单金额")}
      ${renderMetricCard("已收款", formatCurrency(totalReceived), "客户累计已付款")}
      ${renderMetricCard("待收款", formatCurrency(totalPending), "客户尚未支付")}
      ${renderMetricCard("老师待付款", formatCurrency(teacherPending), "待与老师结算")}
    </div>
    <div class="focus-grid">
      ${renderFocusCard("费用异常", getFinanceAlerts(orders).slice(0, 6), "暂无费用异常")}
      ${renderFocusCard("异常池", alerts.slice(0, 6), "暂无异常订单")}
      ${renderFocusCard("投诉与主管关注", orders.filter((item) => item.customerComplaint === "是" || item.needsSupervisor === "是").map((item) => ({
        title: `${item.orderNumber} / ${item.customerName || item.customerNickname}`,
        body: `${item.riskLevel} · 订单额 ${formatCurrency(item.orderAmount)} · ${item.supervisorNote || "待补充说明"}`,
        risk: item.riskLevel,
      })).slice(0, 6), "暂无投诉或主管关注")}
    </div>
    <section class="timeline-card">
      <h4>主管处理重点</h4>
      <div class="timeline-list">
        ${renderTimelineEntry(`当前应急订单 ${emergency} 单`, "优先核查已标记应急状态的订单处理进展")}
        ${renderTimelineEntry(`客户投诉订单 ${complaint} 单`, "优先核查返修超时、老师失联和已付款未推进订单")}
        ${renderTimelineEntry(`高金额未结清 ${orders.filter((item) => toMoney(item.customerPending) > 0 && toMoney(item.orderAmount) >= 10000).length} 单`, "优先看金额高且尾款未收的订单")}
        ${renderTimelineEntry(`老师超24小时未反馈 ${orders.filter((item) => isTeacherSilent(item)).length} 单`, "建议按老师维度逐一催办并指定备用老师")}
      </div>
    </section>
  `;
}

function renderAcademicWorkbench(orders, alerts) {
  const tasks = orders.flatMap((order) => getAcademicTasks(order));
  return `
    <div class="metric-grid">
      ${renderMetricCard("作者信息待补", tasks.filter((item) => item.type === "作者").length, "作者登记表/英文信息/投稿邮箱")}
      ${renderMetricCard("投稿信息待补", tasks.filter((item) => item.type === "投稿").length, "按一稿一投/多稿多投检查")}
      ${renderMetricCard("状态节点提醒", tasks.filter((item) => item.type === "状态").length, "真实阶段与预计产出时间")}
      ${renderMetricCard("老师与审核", tasks.filter((item) => item.type === "老师" || item.type === "审核").length, "派单、稳定性、审查节点")}
    </div>
    <div class="focus-grid">
      ${renderFocusCard("今日教务待办", tasks.slice(0, 8), "暂无待办")}
      ${renderFocusCard("投稿与状态", tasks.filter((item) => item.type === "投稿" || item.type === "状态").slice(0, 8), "暂无投稿状态问题")}
      ${renderFocusCard("老师催办清单", tasks.filter((item) => item.type === "老师" || item.type === "审核").slice(0, 8), "暂无老师催办")}
      ${renderFocusCard("需主管升级", alerts.filter((item) => item.level === "高风险" || item.level === "应急").slice(0, 6), "暂无升级项")}
    </div>
  `;
}

function renderMetricCard(label, value, tip) {
  return `<article class="metric-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(tip)}</small></article>`;
}

function renderFocusCard(title, items, emptyText) {
  return `
    <section class="focus-card">
      <h4>${escapeHtml(title)}</h4>
      <div class="focus-list">
        ${items.length ? items.map((item) => `
          <div class="focus-item">
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.body)}</small>
            <div class="risk-tag" data-risk="${escapeHtml(item.risk || "正常")}">${escapeHtml(item.risk || "正常")}</div>
          </div>
        `).join("") : `<div class="empty-state">${escapeHtml(emptyText)}</div>`}
      </div>
    </section>
  `;
}

function renderTimelineEntry(title, body) {
  return `<div class="timeline-entry"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(body)}</small></div>`;
}

function getAcademicTasks(order) {
  const tasks = [];
  const title = `${order.orderNumber || "未编号"} / ${order.customerName || order.customerNickname || "未填写客户"}`;
  const pushTask = (type, body, risk = "提醒") => {
    tasks.push({ type, title, body, risk });
  };

  if (order.registrationFormStatus !== "已传老师") {
    pushTask("作者", `作者登记表：${order.registrationFormStatus || "未索要"}，需收齐并传递给老师。`, "预警");
  }

  const missingAuthorFields = [
    ["作者姓名", order.authorName],
    ["作者邮箱", order.authorEmail],
    ["作者学历", order.authorDegree],
    ["作者学校", order.authorSchool],
    ["邮编", order.authorPostalCode],
    ["投稿邮箱", order.submissionEmail],
    ["投稿邮箱密码", order.submissionEmailPassword],
  ].filter(([, value]) => !value);
  if (missingAuthorFields.length) {
    pushTask("作者", `作者信息待补：${missingAuthorFields.map(([label]) => label).slice(0, 4).join("、")}${missingAuthorFields.length > 4 ? "等" : ""}。`, "预警");
  }

  if (!order.authorInfoEn) {
    pushTask("作者", "作者英文信息未填写，投稿前容易影响作者信息核对。", "提醒");
  }

  if (!order.assignedTeacher) {
    pushTask("老师", "尚未分配接单老师。", "预警");
  }

  const submissionCount = getSubmissionCount(order.operationMethod);
  for (let index = 1; index <= submissionCount; index += 1) {
    const suffix = index === 1 ? "" : String(index);
    const missing = [
      ["论文名", order[`paperTitle${suffix}`]],
      ["期刊", order[`journalName${suffix}`]],
      ["网址", order[`submissionUrl${suffix}`]],
      ["账号", order[`submissionAccount${suffix}`]],
      ["密码", order[`submissionPassword${suffix}`]],
    ].filter(([, value]) => !value);
    if (missing.length) {
      pushTask("投稿", `投稿信息${index}待补：${missing.map(([label]) => label).join("、")}。`, "预警");
    }
  }

  if (!order.plagiarismRequirement || order.plagiarismRequirement === "未确认") {
    pushTask("投稿", "是否查重未确认，投稿前建议明确。", "提醒");
  }

  if (order.teacherStability === "新老师" && !["已通过", "稳定老师跳过"].includes(order.innovationReviewStatus)) {
    pushTask("审核", `新老师需先提交创新点审核，当前：${order.innovationReviewStatus || "未提交"}。`, "高风险");
  }

  if (order.teacherStability === "稳定老师" && order.innovationReviewStatus !== "稳定老师跳过") {
    pushTask("老师", "稳定老师可跳过创新点审核，建议标记为“稳定老师跳过”。", "提醒");
  }

  if (order.firstDraftReviewStatus !== "已通过") {
    pushTask("审核", `初稿审核当前：${order.firstDraftReviewStatus || "未提交"}。`, "预警");
  }

  if (order.firstDraftReviewStatus === "已通过" && order.editorReviewStatus !== "已通过") {
    pushTask("审核", `需交编辑老师审查，当前：${order.editorReviewStatus || "未提交"}。`, "预警");
  }

  if (["待投稿", "已投稿"].includes(order.paperProgress) && order.authorInfoChecked !== "已核对无误") {
    pushTask("审核", `投稿前作者信息需核对，当前：${order.authorInfoChecked || "未核对"}。`, "高风险");
  }

  if (order.paperProgress === "已投稿" || order.submittedAt) {
    if (!order.submissionUrl || !order.submissionAccount || !order.submissionPassword) {
      pushTask("投稿", "投稿后需登记投稿网址、账号和密码。", "预警");
    }
    if (isFirstWeekCheckDue(order)) {
      pushTask("状态", `投稿满一周需查是否进入 Under Review，当前：${order.journalStatus || "未登记"}。`, "高风险");
    }
    if (isWeeklyJournalCheckDue(order)) {
      pushTask("状态", `本周需查看稿件状态，当前：${order.journalStatus || "未登记"}。`, "提醒");
    }
    if (isFirstWeekCheckDue(order) && order.journalStatus !== "Under Review") {
      pushTask("状态", "首周未进入 Under Review，需提醒老师发催稿信。", "高风险");
    }
  }

  const expectedField = getExpectedFieldForStage(order.journalStatus);
  if (expectedField && isExpectedDateDue(order[expectedField])) {
    pushTask("状态", `${order.journalStatus} 预计产出时间已到，请核对真实稿件状态。`, "高风险");
  }

  if (order.journalStatus === "Revision" || order.revisionStatus === "待提醒老师") {
    pushTask("状态", `返修需及时提醒老师处理，返修状态：${order.revisionStatus || "未登记"}。`, "应急");
  }

  if (order.journalStatus === "Accepted" && order.pageFeeStatus !== "客户已缴纳") {
    pushTask("状态", `录用后需提醒客户缴纳版面费，当前：${order.pageFeeStatus || "未登记"}。`, "预警");
  }

  if (order.journalStatus === "Proofing" || ["待客户确认", "客户有修改需求", "老师校稿中"].includes(order.proofingStatus)) {
    pushTask("状态", `校稿阶段需客户确认并同步老师修改，当前：${order.proofingStatus || "未登记"}。`, "预警");
  }

  if (order.onlineStatus === "已online待提醒作者") {
    pushTask("状态", "文章已 online，需提醒作者并保存 online 截图。", "提醒");
  }

  if (order.indexingStatus === "已检索待开报告") {
    pushTask("状态", "文章已检索，需提醒开检索审查报告并保存检索截图。", "提醒");
  }

  if (order.onlineAt && !order.indexingAt && isTwoWeekCheckDue(order.onlineAt)) {
    pushTask("状态", "online 后每 2 周需查看是否检索。", "提醒");
  }

  return tasks;
}

function renderAcademicTaskList(order) {
  const tasks = getAcademicTasks(order);
  if (!tasks.length) {
    return '<div class="empty-state">当前无待办，按下次查稿时间持续跟进即可</div>';
  }

  return tasks
    .map((task) => `
      <div class="timeline-entry">
        <strong>${escapeHtml(task.type)} · ${escapeHtml(task.risk || "提醒")}</strong>
        <small>${escapeHtml(task.title)}</small>
        <p>${escapeHtml(task.body)}</p>
      </div>
    `)
    .join("");
}

function isFirstWeekCheckDue(order) {
  if (!order.submittedAt) return false;
  const submittedAt = new Date(order.submittedAt).getTime();
  if (Number.isNaN(submittedAt)) return false;
  if (Date.now() - submittedAt < 7 * 24 * 3600000) return false;
  if (!order.firstWeekCheckAt) return true;
  return new Date(order.firstWeekCheckAt).getTime() <= Date.now();
}

function isWeeklyJournalCheckDue(order) {
  if (!order.submittedAt) return false;
  if (!order.nextJournalCheckAt) return true;
  return new Date(order.nextJournalCheckAt).getTime() <= Date.now();
}

function isTwoWeekCheckDue(value) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time >= 14 * 24 * 3600000;
}

function getExpectedFieldForStage(stage) {
  return {
    Submitted: "submittedExpectedAt",
    "With Editor": "withEditorExpectedAt",
    "Under Review": "underReviewExpectedAt",
    Revision: "revisionExpectedAt",
    Accepted: "acceptedExpectedAt",
    Proofing: "proofingExpectedAt",
    Online: "onlineExpectedAt",
    Indexed: "indexedExpectedAt",
  }[stage] || "";
}

function isExpectedDateDue(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  return time <= Date.now();
}

function renderOrderList() {
  const orders = getVisibleOrders();
  orderList.innerHTML = "";
  orderCount.textContent = `${orders.length} 条订单`;

  if (orders.length === 0) {
    orderList.innerHTML = '<div class="empty-state">暂无符合条件的订单</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  orders.forEach((order) => {
    const row = document.createElement("article");
    row.className = `order-row order-row-item ${order.id === state.currentOrderId ? "active" : ""}`;
    row.dataset.orderId = order.id;
    row.innerHTML = `
      <div class="order-cell">
        <strong>${escapeHtml(order.orderNumber || "未命名订单")}</strong>
        <small>${escapeHtml(order.statusStage || "-")}</small>
      </div>
      <div class="order-cell">
        <span>${escapeHtml(order.customerName || order.customerNickname || "-")}</span>
        <small>${escapeHtml(order.customerWechat || "-")}</small>
      </div>
      <div class="order-cell">
        <span>${escapeHtml(order.paperTitle || "未填写论文名称")}</span>
        <small>${escapeHtml(order.requiredZone || "未填写区位")}</small>
      </div>
      <div class="order-cell">
        <label class="quick-field">
          <span>论文进度</span>
          <select data-quick-field="paperProgress" data-order-id="${escapeHtml(order.id)}">
            ${renderOptions(quickProgressOptions, order.paperProgress || "待分配")}
          </select>
        </label>
      </div>
      <div class="order-cell">
        <label class="quick-field">
          <span>接单老师</span>
          <input type="text" value="${escapeHtml(order.assignedTeacher || "")}" placeholder="填写老师" data-quick-field="assignedTeacher" data-order-id="${escapeHtml(order.id)}">
        </label>
        <small>教务：${escapeHtml(order.academicOwner || order.responsibleTeacher || "-")}</small>
      </div>
      <div class="order-cell">
        <div class="quick-stack">
          <label class="quick-field">
            <span>稿件状态</span>
            <select data-quick-field="journalStatus" data-order-id="${escapeHtml(order.id)}">
              ${renderOptions(quickJournalStatusOptions, order.journalStatus || "未投稿")}
            </select>
          </label>
          <label class="quick-field">
            <span>登记表</span>
            <select data-quick-field="registrationFormStatus" data-order-id="${escapeHtml(order.id)}">
              ${renderOptions(quickRegistrationOptions, order.registrationFormStatus || "未索要")}
            </select>
          </label>
        </div>
      </div>
      <div class="order-cell">
        <label class="quick-field">
          <span>下次跟进</span>
          <input type="datetime-local" value="${escapeHtml(order.nextFollowUpAt || "")}" data-quick-field="nextFollowUpAt" data-order-id="${escapeHtml(order.id)}">
        </label>
        <div class="quick-actions">
          <button class="text-btn" type="button" data-list-action="detail" data-order-id="${escapeHtml(order.id)}">详情</button>
          <button class="text-btn" type="button" data-list-action="edit" data-order-id="${escapeHtml(order.id)}">编辑</button>
        </div>
      </div>
    `;
    fragment.appendChild(row);
  });
  orderList.appendChild(fragment);
}

function renderOptions(options, selectedValue) {
  return options
    .map((option) => `<option value="${escapeHtml(option)}" ${option === selectedValue ? "selected" : ""}>${escapeHtml(option)}</option>`)
    .join("");
}

function handleListQuickChange(event) {
  const target = event.target.closest("[data-quick-field]");
  if (!target) return;
  const orderId = target.dataset.orderId;
  const field = target.dataset.quickField;
  updateOrderQuickField(orderId, field, target.value);
}

function handleListQuickClick(event) {
  const button = event.target.closest("[data-list-action]");
  if (!button) return;
  const orderId = button.dataset.orderId;
  if (!orderId) return;
  if (button.dataset.listAction === "detail") {
    openOrderDetail(orderId);
    return;
  }
  if (button.dataset.listAction === "edit") {
    loadOrderToForm(orderId);
    setActiveView("form");
  }
}

function updateOrderQuickField(orderId, field, value) {
  const order = findExistingOrder(orderId);
  if (!order || !field) return;
  const nextOrder = {
    ...order,
    [field]: value,
    updatedAt: new Date().toISOString(),
  };
  syncWorkflowFields(nextOrder);
  upsertOrder(nextOrder);
  if (state.currentOrderId === orderId) {
    loadOrderToForm(orderId);
    renderWorkbench();
    renderTeacherList();
  } else {
    renderOrderList();
    renderWorkbench();
    renderTeacherList();
  }
}

function openOrderDetail(orderId) {
  loadOrderToForm(orderId);
  setActiveView("detail");
}

function loadOrderToForm(orderId) {
  const order = findExistingOrder(orderId);
  if (!order) return;
  state.currentOrderId = orderId;
  state.pendingAttachments = Array.isArray(order.attachments) ? [...order.attachments] : [];
  state.currentAuthors = getAuthorsForOrder(order);
  Array.from(orderForm.elements).forEach((element) => {
    if (element.name && element.name in order) {
      element.value = order[element.name] ?? "";
    }
  });
  syncPaymentFields();
  formTitle.textContent = "编辑订单";
  submitBtn.textContent = "保存订单";
  deleteBtn.disabled = state.currentUser.role !== "supervisor";
  applyRolePermissions();
  renderAttachments();
  renderAuthors();
  updateSubmissionBlocks();
  updateStatusStageStrip();
  renderOrderList();
  renderOrderDetail();
}

function resetForm(shouldRender = true) {
  orderForm.reset();
  orderForm.elements.namedItem("id").value = "";
  state.currentOrderId = "";
  state.pendingAttachments = [];
  state.currentAuthors = getDefaultAuthors();
  formTitle.textContent = "新建订单";
  submitBtn.textContent = "保存订单";
  deleteBtn.disabled = state.currentUser?.role !== "supervisor";
  syncPaymentFields();
  applyRolePermissions();
  renderAttachments();
  renderAuthors();
  updateSubmissionBlocks();
  updateStatusStageStrip();
  if (shouldRender) {
    renderOrderList();
    renderOrderDetail();
  }
}

function applyRolePermissions() {
  const editable = roleEditableFields[state.currentUser?.role];
  const canCreate = true;

  Array.from(orderForm.elements).forEach((element) => {
    if (!element.name) return;
    const canEdit = editable === "all" || editable?.has(element.name) || element.name === "id";
    const shouldDisable = !state.currentUser || (!state.currentOrderId && !canCreate && element.name !== "id") || !canEdit;
    element.disabled = Boolean(shouldDisable);
    element.closest?.(".field")?.classList.toggle("role-readonly", Boolean(shouldDisable));
  });

  submitBtn.disabled = !state.currentUser || (!state.currentOrderId && !canCreate);
  if (attachmentInput) attachmentInput.disabled = false;
}

function handleOrderSubmit(event) {
  event.preventDefault();
  if (!state.currentUser) return;

  const now = new Date().toISOString();
  const payload = Object.fromEntries(new FormData(orderForm).entries());
  const existing = payload.id ? findExistingOrder(payload.id) : null;
  const baseOrder = existing ? { ...existing } : buildBlankOrder();
  const allowed = roleEditableFields[state.currentUser.role];
  syncAuthorsData();

  Object.keys(payload).forEach((key) => {
    if (allowed === "all" || allowed.has(key) || !existing) {
      baseOrder[key] = payload[key];
    }
  });

  if (!existing) {
    if (!baseOrder.academicOwner && state.currentUser.role === "academic") baseOrder.academicOwner = state.currentUser.name;
  }

  baseOrder.id = payload.id || crypto.randomUUID();
  baseOrder.authors = parseAuthorsData(authorsDataInput.value);
  syncPrimaryAuthorFields(baseOrder);
  baseOrder.attachments = [...state.pendingAttachments];
  baseOrder.updatedAt = now;
  if (!existing) baseOrder.createdAt = now;
  syncPendingFields(baseOrder);
  syncWorkflowFields(baseOrder);
  upsertOrder(baseOrder);
  loadOrderToForm(baseOrder.id);
  renderWorkbench();
  renderTeacherList();
  setActiveView(state.currentUser.role === "supervisor" ? "detail" : "workbench");
}

function buildBlankOrder() {
  return {
    orderNumber: "",
    customerWechat: "",
    customerName: "",
    customerNickname: "",
    customerPhone: "",
    schoolName: "",
    degreeLevel: "",
    majorDirection: "",
    requiredZone: "",
    paperUse: "",
    authorInfoEn: "",
    authorName: "",
    authorEmail: "",
    authorDegree: "",
    authorSchool: "",
    authorPostalCode: "",
    fundInfo: "",
    submissionEmail: "",
    submissionEmailPassword: "",
    authors: getDefaultAuthors(),
    authorsData: "",
    urgencyLevel: "常规",
    personalInfo: "",
    acceptanceDate: "",
    keyMilestones: "",
    operationMethod: "一稿一投",
    paperTitle: "",
    wordCount: "",
    plagiarismRequirement: "",
    journalName: "",
    backupJournal: "",
    journalCredentials: "",
    emailCredentials: "",
    responsibleTeacher: "",
    academicOwner: "",
    paperProgress: "待分配",
    statusStage: "销售建单",
    teacherStability: "新老师",
    registrationFormStatus: "未索要",
    infoSentToTeacherAt: "",
    innovationReviewStatus: "未提交",
    innovationReviewAt: "",
    firstDraftReviewStatus: "未提交",
    firstDraftReviewAt: "",
    editorReviewStatus: "未提交",
    editorReviewAt: "",
    authorInfoChecked: "未核对",
    authorInfoCheckedAt: "",
    assignedTeacher: "",
    backupTeacher: "",
    teacherPhone: "",
    salesContact: "",
    nextFollowUpAt: "",
    lastTeacherUpdateAt: "",
    riskLevel: "正常",
    customerComplaint: "否",
    needsSupervisor: "否",
    emergencyStatus: "正常",
    supervisorNote: "",
    submissionUrl: "",
    submissionAccount: "",
    submissionPassword: "",
    submittedAt: "",
    paperTitle2: "",
    journalName2: "",
    submissionUrl2: "",
    submissionAccount2: "",
    submissionPassword2: "",
    submittedAt2: "",
    paperTitle3: "",
    journalName3: "",
    submissionUrl3: "",
    submissionAccount3: "",
    submissionPassword3: "",
    submittedAt3: "",
    journalStatus: "未投稿",
    submittedExpectedAt: "",
    withEditorExpectedAt: "",
    underReviewExpectedAt: "",
    revisionExpectedAt: "",
    acceptedExpectedAt: "",
    proofingExpectedAt: "",
    onlineExpectedAt: "",
    indexedExpectedAt: "",
    firstWeekCheckAt: "",
    nextJournalCheckAt: "",
    reminderLetterStatus: "不需要",
    revisionStatus: "无返修",
    revisionDueAt: "",
    pageFeeStatus: "未录用",
    proofingStatus: "未到校稿",
    onlineStatus: "未online",
    onlineAt: "",
    indexingStatus: "未检索",
    indexingAt: "",
    reviewReportStatus: "未开",
    orderAmount: "0",
    customerPaid: "0",
    customerPending: "0",
    teacherPrice: "0",
    teacherPaid: "0",
    teacherPending: "0",
    followUpLogs: [],
    attachments: [],
  };
}

function normalizeOrder(order) {
  const normalized = {
    ...buildBlankOrder(),
    ...order,
    followUpLogs: Array.isArray(order.followUpLogs) ? order.followUpLogs : [],
    attachments: Array.isArray(order.attachments) ? order.attachments : [],
  };
  normalized.authors = getAuthorsForOrder(normalized);
  normalized.authorsData = JSON.stringify(normalized.authors);
  if (!["一稿一投", "两稿两投", "三稿三投"].includes(normalized.operationMethod)) {
    normalized.operationMethod = "一稿一投";
  }
  return normalized;
}

function deleteCurrentOrder() {
  if (state.currentUser?.role !== "supervisor" || !state.currentOrderId) return;
  if (!window.confirm("确定删除当前订单吗？删除后将无法恢复。")) return;
  state.orders = state.orders.filter((item) => item.id !== state.currentOrderId);
  saveOrders();
  resetForm();
  renderWorkbench();
  setActiveView("list");
}

function upsertOrder(order) {
  const index = state.orders.findIndex((item) => item.id === order.id);
  if (index >= 0) state.orders[index] = order;
  else state.orders.unshift(order);
  saveOrders();
}

function findExistingOrder(orderId) {
  return state.orders.find((item) => item.id === orderId);
}

function renderOrderDetail() {
  const order = findExistingOrder(state.currentOrderId);
  if (!order) {
    detailTitle.textContent = "请选择订单";
    detailEmpty.classList.remove("hidden");
    detailContent.classList.add("hidden");
    detailContent.innerHTML = "";
    detailViewTab.classList.add("hidden");
    editOrderBtn.disabled = true;
    return;
  }

  const alerts = deriveAlerts(order);
  const financeAlerts = getFinanceAlerts([order]);
  detailTitle.textContent = order.orderNumber || "订单详情";
  detailEmpty.classList.add("hidden");
  detailContent.classList.remove("hidden");
  detailViewTab.classList.remove("hidden");
  editOrderBtn.disabled = false;
  const showFinance = state.currentUser?.role === "supervisor";
  const visibleAlerts = showFinance ? [...alerts, ...financeAlerts] : alerts;
  detailContent.innerHTML = `
    <section class="detail-card">
      <h4>基础信息</h4>
      <div class="detail-grid">
        ${renderDetailItem("订单编号", order.orderNumber)}
        ${renderDetailItem("客户姓名", order.customerName)}
        ${renderDetailItem("学历层级", order.degreeLevel)}
        ${renderDetailItem("专业方向", order.majorDirection)}
        ${renderDetailItem("文章用途", order.paperUse)}
        ${renderDetailItem("所需区位", order.requiredZone)}
      </div>
    </section>
    <section class="detail-card">
      <h4>作者信息</h4>
      <div class="detail-grid">
        ${renderAuthorsDetail(order)}
        ${renderDetailItem("基金信息", order.fundInfo, true)}
        ${renderDetailItem("投稿邮箱", order.submissionEmail)}
        ${renderDetailItem("投稿邮箱密码", order.submissionEmailPassword)}
        ${renderDetailItem("个人信息登记表", order.registrationFormStatus)}
        ${renderDetailItem("传递给老师时间", formatDateTime(order.infoSentToTeacherAt))}
      </div>
    </section>
    <section class="detail-card">
      <h4>执行与投稿</h4>
      <div class="detail-grid">
        ${renderDetailItem("订单阶段", order.statusStage)}
        ${renderDetailItem("论文进度", order.paperProgress)}
        ${renderDetailItem("操作方式", order.operationMethod)}
        ${renderDetailItem("是否查重", order.plagiarismRequirement)}
        ${renderSubmissionDetail(order, 1)}
        ${renderSubmissionDetail(order, 2)}
        ${renderSubmissionDetail(order, 3)}
      </div>
    </section>
    <section class="detail-card">
      <h4>教务流程进度</h4>
      <div class="detail-grid">
        ${renderDetailItem("老师稳定性", order.teacherStability)}
        ${renderDetailItem("创新点审核", order.innovationReviewStatus)}
        ${renderDetailItem("创新点审核时间", formatDateTime(order.innovationReviewAt))}
        ${renderDetailItem("初稿审核", order.firstDraftReviewStatus)}
        ${renderDetailItem("初稿审核时间", formatDateTime(order.firstDraftReviewAt))}
        ${renderDetailItem("编辑老师审查", order.editorReviewStatus)}
        ${renderDetailItem("编辑审查时间", formatDateTime(order.editorReviewAt))}
        ${renderDetailItem("作者信息核对", order.authorInfoChecked)}
        ${renderDetailItem("核对时间", formatDateTime(order.authorInfoCheckedAt))}
      </div>
    </section>
    <section class="detail-card">
      <h4>投稿后跟进</h4>
      <div class="status-stage-strip">
        ${renderStatusStageChips(order.journalStatus)}
      </div>
      <div class="detail-grid">
        ${renderDetailItem("当前稿件状态", order.journalStatus)}
        ${renderDetailItem("Submitted预计产出", formatDateTime(order.submittedExpectedAt))}
        ${renderDetailItem("With Editor预计产出", formatDateTime(order.withEditorExpectedAt))}
        ${renderDetailItem("Under Review预计产出", formatDateTime(order.underReviewExpectedAt))}
        ${renderDetailItem("Revision预计产出", formatDateTime(order.revisionExpectedAt))}
        ${renderDetailItem("Accepted预计产出", formatDateTime(order.acceptedExpectedAt))}
        ${renderDetailItem("Proofing预计产出", formatDateTime(order.proofingExpectedAt))}
        ${renderDetailItem("Online预计产出", formatDateTime(order.onlineExpectedAt))}
        ${renderDetailItem("Indexed预计产出", formatDateTime(order.indexedExpectedAt))}
        ${renderDetailItem("首周查稿时间", formatDateTime(order.firstWeekCheckAt))}
        ${renderDetailItem("下次查稿时间", formatDateTime(order.nextJournalCheckAt))}
        ${renderDetailItem("催稿信状态", order.reminderLetterStatus)}
        ${renderDetailItem("返修状态", order.revisionStatus)}
        ${renderDetailItem("返修截止时间", formatDateTime(order.revisionDueAt))}
        ${renderDetailItem("版面费状态", order.pageFeeStatus)}
        ${renderDetailItem("校稿状态", order.proofingStatus)}
        ${renderDetailItem("Online状态", order.onlineStatus)}
        ${renderDetailItem("Online时间", formatDateTime(order.onlineAt))}
        ${renderDetailItem("检索状态", order.indexingStatus)}
        ${renderDetailItem("检索时间", formatDateTime(order.indexingAt))}
        ${renderDetailItem("检索审查报告", order.reviewReportStatus)}
      </div>
    </section>
    <section class="detail-card">
      <h4>下一步教务待办</h4>
      <div class="timeline-list">
        ${renderAcademicTaskList(order)}
      </div>
    </section>
    <section class="detail-card">
      <h4>角色责任</h4>
      <div class="detail-grid">
        ${renderDetailItem("销售", order.salesContact)}
        ${renderDetailItem("教务", order.academicOwner)}
        ${renderDetailItem("派单老师", order.responsibleTeacher)}
        ${renderDetailItem("接单老师", order.assignedTeacher)}
        ${renderDetailItem("备用老师", order.backupTeacher)}
        ${renderDetailItem("老师电话", order.teacherPhone)}
        ${renderDetailItem("下次跟进", formatDateTime(order.nextFollowUpAt))}
        ${renderDetailItem("老师最近反馈", formatDateTime(order.lastTeacherUpdateAt))}
      </div>
    </section>
    ${showFinance ? `
      <section class="detail-card">
        <h4>财务与风控</h4>
        <div class="detail-grid">
          ${renderDetailItem("订单额", formatCurrency(order.orderAmount))}
          ${renderDetailItem("客户已付款", formatCurrency(order.customerPaid))}
          ${renderDetailItem("客户待支付", formatCurrency(order.customerPending))}
          ${renderDetailItem("老师结算价", formatCurrency(order.teacherPrice))}
          ${renderDetailItem("老师已付款", formatCurrency(order.teacherPaid))}
          ${renderDetailItem("老师待付款", formatCurrency(order.teacherPending))}
          ${renderDetailItem("毛利估算", formatCurrency(toMoney(order.orderAmount) - toMoney(order.teacherPrice)))}
          ${renderDetailItem("风险等级", order.riskLevel)}
          ${renderDetailItem("应急状态", order.emergencyStatus)}
          ${renderDetailItem("是否投诉", order.customerComplaint)}
          ${renderDetailItem("主管关注", order.needsSupervisor)}
          ${renderDetailItem("主管备注", order.supervisorNote, true)}
        </div>
      </section>
    ` : `
      <section class="detail-card">
        <h4>跟进与风控</h4>
        <div class="detail-grid">
          ${renderDetailItem("风险等级", order.riskLevel)}
          ${renderDetailItem("应急状态", order.emergencyStatus)}
          ${renderDetailItem("是否投诉", order.customerComplaint)}
          ${renderDetailItem("主管关注", order.needsSupervisor)}
          ${renderDetailItem("主管备注", order.supervisorNote, true)}
        </div>
      </section>
    `}
    <section class="detail-card">
      <h4>异常提醒</h4>
      <div class="detail-attachments">
        ${visibleAlerts.length ? visibleAlerts.map((item) => `
          <div class="detail-attachment">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.body)}</small>
            </div>
            <span class="risk-tag" data-risk="${escapeHtml(item.level)}">${escapeHtml(item.level)}</span>
          </div>
        `).join("") : '<div class="empty-state">当前无异常提醒</div>'}
      </div>
    </section>
    <section class="detail-card">
      <h4>附件信息</h4>
      <div class="detail-attachments">
        ${renderDetailAttachments(order.attachments)}
      </div>
    </section>
    <section class="detail-card">
      <h4>催办记录时间轴</h4>
      <p class="subsection-title">催办记录</p>
      <div class="timeline-list">
        ${renderFollowUpLogs(order.followUpLogs, "follow_up")}
      </div>
      <p class="subsection-title">老师反馈</p>
      <div class="timeline-list">
        ${renderFollowUpLogs(order.followUpLogs, "teacher_feedback")}
      </div>
      ${state.currentUser?.role === "academic" ? `
        <form class="inline-form" data-follow-up-form="true">
          <input type="hidden" name="orderId" value="${escapeHtml(order.id)}">
          <select name="followUpType" required>
            <option value="催办记录">催办记录</option>
            <option value="电话沟通">电话沟通</option>
            <option value="查稿记录">查稿记录</option>
            <option value="节点确认">节点确认</option>
            <option value="老师反馈">老师反馈</option>
          </select>
          <textarea name="followUpContent" rows="3" placeholder="填写本次催办内容、老师反馈或需要升级的问题" required></textarea>
          <div class="inline-form-actions">
            <button class="primary-btn" type="submit">新增催办记录</button>
          </div>
        </form>
      ` : ""}
    </section>
  `;
}

function renderDetailItem(label, value, full = false) {
  return `<div class="detail-item ${full ? "full" : ""}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || "-")}</span></div>`;
}

function renderAuthorsDetail(order) {
  return getAuthorsForOrder(order).map((author) => `
    ${renderDetailItem(`${author.role}姓名`, author.name)}
    ${renderDetailItem(`${author.role}邮箱`, author.email)}
    ${renderDetailItem(`${author.role}学历`, author.degree)}
    ${renderDetailItem(`${author.role}学校`, author.school)}
    ${renderDetailItem(`${author.role}邮编`, author.postalCode)}
    ${renderDetailItem(`${author.role}英文信息`, author.infoEn, true)}
  `).join("");
}

function renderStatusStageChips(current) {
  return journalStages.map((stage) => `
    <span class="stage-chip ${stage === current ? "active" : ""}" data-stage="${escapeHtml(stage)}">${escapeHtml(stage)}</span>
  `).join("");
}

function renderSubmissionDetail(order, index) {
  const suffix = index === 1 ? "" : String(index);
  const title = order[`paperTitle${suffix}`];
  const journal = order[`journalName${suffix}`];
  const url = order[`submissionUrl${suffix}`];
  const account = order[`submissionAccount${suffix}`];
  const password = order[`submissionPassword${suffix}`];
  const submittedAt = order[`submittedAt${suffix}`];
  if (index > getSubmissionCount(order.operationMethod) && !title && !journal && !url && !account && !password && !submittedAt) return "";
  return `
    ${renderDetailItem(`投稿${index}论文名`, title, true)}
    ${renderDetailItem(`投稿${index}期刊`, journal)}
    ${renderDetailItem(`投稿${index}网址`, url, true)}
    ${renderDetailItem(`投稿${index}账号`, account)}
    ${renderDetailItem(`投稿${index}密码`, password)}
    ${renderDetailItem(`投稿${index}时间`, formatDateTime(submittedAt))}
  `;
}

function renderDetailAttachments(attachments = []) {
  if (!attachments.length) return '<div class="empty-state">暂无附件</div>';
  return attachments.map((item, index) => `
    <div class="detail-attachment">
      <div><strong>${escapeHtml(item.category || "客户资料")} · ${escapeHtml(item.name)}</strong><small>${escapeHtml(formatFileSize(item.size))}</small></div>
      <button class="text-btn" type="button" data-detail-download="${index}">下载</button>
    </div>
  `).join("");
}

function handleDetailActions(event) {
  const button = event.target.closest("[data-detail-download]");
  if (!button) return;
  const order = findExistingOrder(state.currentOrderId);
  const item = order?.attachments?.[Number(button.dataset.detailDownload)];
  if (!item) return;
  const link = document.createElement("a");
  link.href = item.dataUrl;
  link.download = item.name;
  link.click();
}

function handleDetailSubmit(event) {
  const form = event.target.closest("[data-follow-up-form]");
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  const orderId = String(formData.get("orderId") || "");
  const followUpType = String(formData.get("followUpType") || "").trim();
  const followUpContent = String(formData.get("followUpContent") || "").trim();
  if (!orderId || !followUpType || !followUpContent) return;

  const order = findExistingOrder(orderId);
  if (!order) return;

  const nextOrder = {
    ...order,
    updatedAt: new Date().toISOString(),
    lastTeacherUpdateAt: followUpType === "老师反馈" ? toLocalInputValue(new Date()) : order.lastTeacherUpdateAt,
    nextJournalCheckAt: followUpType === "查稿记录" ? toLocalInputValue(addDays(new Date(), 7)) : order.nextJournalCheckAt,
    followUpLogs: [
      {
        id: crypto.randomUUID(),
        actor: state.currentUser.name,
        time: new Date().toISOString(),
        type: followUpType,
        content: followUpContent,
      },
      ...(order.followUpLogs || []),
    ],
  };

  upsertOrder(nextOrder);
  loadOrderToForm(orderId);
}

function handleAttachmentsSelect(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const category = attachmentCategory?.value || "客户资料";
  Promise.all(files.map((file) => readFileAsAttachment(file, category))).then((attachments) => {
    state.pendingAttachments.push(...attachments);
    renderAttachments();
    if (attachmentInput) attachmentInput.value = "";
  });
}

function handleAuthorRegistrationSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  Promise.all([
    readFileAsAttachment(file, "作者登记表"),
    extractAuthorInfoFromFile(file),
  ]).then(([attachment, extracted]) => {
    state.pendingAttachments.push(attachment);
    orderForm.elements.namedItem("registrationFormStatus").value = "已收到";
    if (Object.keys(extracted).length) {
      applyExtractedAuthorInfo(extracted);
    }
    Object.entries(extracted).forEach(([name, value]) => {
      const element = orderForm.elements.namedItem(name);
      if (element && value) element.value = value;
    });
    renderAttachments();
    authorRegistrationInput.value = "";
  });
}

function getDefaultAuthors() {
  return [
    buildBlankAuthor("第一作者"),
    buildBlankAuthor("第二作者"),
  ];
}

function buildBlankAuthor(role = "") {
  return {
    role,
    name: "",
    email: "",
    degree: "",
    school: "",
    postalCode: "",
    infoEn: "",
  };
}

function getAuthorsForOrder(order) {
  if (Array.isArray(order.authors) && order.authors.length) {
    return order.authors.map((author, index) => ({
      ...buildBlankAuthor(getAuthorRole(index)),
      ...author,
      role: author.role || getAuthorRole(index),
    }));
  }
  const authors = getDefaultAuthors();
  authors[0] = {
    ...authors[0],
    name: order.authorName || "",
    email: order.authorEmail || "",
    degree: order.authorDegree || "",
    school: order.authorSchool || "",
    postalCode: order.authorPostalCode || "",
    infoEn: order.authorInfoEn || "",
  };
  return authors;
}

function renderAuthors() {
  if (!authorsContainer) return;
  if (!state.currentAuthors.length) state.currentAuthors = getDefaultAuthors();
  authorsContainer.innerHTML = state.currentAuthors.map((author, index) => `
    <section class="author-card" data-author-index="${index}">
      <div class="author-card-head">
        <strong>${escapeHtml(author.role || getAuthorRole(index))}</strong>
        ${index > 1 ? `<button class="text-btn" type="button" data-author-action="remove" data-author-index="${index}">删除</button>` : ""}
      </div>
      <div class="form-grid">
        ${renderAuthorInput(index, "name", "作者姓名", author.name)}
        ${renderAuthorInput(index, "email", "作者邮箱", author.email, "email")}
        ${renderAuthorInput(index, "degree", "作者学历", author.degree)}
        ${renderAuthorInput(index, "school", "作者学校", author.school)}
        ${renderAuthorInput(index, "postalCode", "邮编", author.postalCode)}
        <label class="field field-wide">
          <span>作者信息（英文）</span>
          <textarea rows="2" data-author-field="infoEn" data-author-index="${index}" placeholder="Author name, affiliation, address, email...">${escapeHtml(author.infoEn)}</textarea>
        </label>
      </div>
    </section>
  `).join("");
  syncAuthorsData();
}

function renderAuthorInput(index, field, label, value, type = "text") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input type="${type}" value="${escapeHtml(value || "")}" data-author-field="${field}" data-author-index="${index}">
    </label>
  `;
}

function addAuthor() {
  state.currentAuthors.push(buildBlankAuthor(getAuthorRole(state.currentAuthors.length)));
  renderAuthors();
}

function handleAuthorInput(event) {
  const target = event.target.closest("[data-author-field]");
  if (!target) return;
  const index = Number(target.dataset.authorIndex);
  const field = target.dataset.authorField;
  if (!state.currentAuthors[index]) return;
  state.currentAuthors[index][field] = target.value;
  syncAuthorsData();
}

function handleAuthorAction(event) {
  const button = event.target.closest("[data-author-action]");
  if (!button) return;
  const index = Number(button.dataset.authorIndex);
  if (button.dataset.authorAction === "remove" && index > 1) {
    state.currentAuthors.splice(index, 1);
    state.currentAuthors = state.currentAuthors.map((author, authorIndex) => ({ ...author, role: getAuthorRole(authorIndex) }));
    renderAuthors();
  }
}

function syncAuthorsData() {
  if (!authorsDataInput) return;
  authorsDataInput.value = JSON.stringify(state.currentAuthors);
}

function parseAuthorsData(value) {
  try {
    const authors = JSON.parse(value || "[]");
    if (Array.isArray(authors) && authors.length) {
      return authors.map((author, index) => ({ ...buildBlankAuthor(getAuthorRole(index)), ...author, role: author.role || getAuthorRole(index) }));
    }
  } catch {
    return getDefaultAuthors();
  }
  return getDefaultAuthors();
}

function syncPrimaryAuthorFields(order) {
  const primary = order.authors?.[0] || buildBlankAuthor("第一作者");
  order.authorName = primary.name || "";
  order.authorEmail = primary.email || "";
  order.authorDegree = primary.degree || "";
  order.authorSchool = primary.school || "";
  order.authorPostalCode = primary.postalCode || "";
  order.authorInfoEn = primary.infoEn || "";
  order.authorsData = JSON.stringify(order.authors || []);
}

function applyExtractedAuthorInfo(extracted) {
  if (!state.currentAuthors.length) state.currentAuthors = getDefaultAuthors();
  state.currentAuthors[0] = {
    ...state.currentAuthors[0],
    name: extracted.authorName || state.currentAuthors[0].name,
    email: extracted.authorEmail || state.currentAuthors[0].email,
    degree: extracted.authorDegree || state.currentAuthors[0].degree,
    school: extracted.authorSchool || state.currentAuthors[0].school,
    postalCode: extracted.authorPostalCode || state.currentAuthors[0].postalCode,
    infoEn: extracted.authorInfoEn || state.currentAuthors[0].infoEn,
  };
  renderAuthors();
}

function getAuthorRole(index) {
  if (index === 0) return "第一作者";
  if (index === 1) return "第二作者";
  return `第${index + 1}作者`;
}

function extractAuthorInfoFromFile(file) {
  const textTypes = ["text/plain", "application/json", "text/csv"];
  const canReadAsText = textTypes.includes(file.type) || /\.(txt|json|csv)$/i.test(file.name);
  if (!canReadAsText) return Promise.resolve({});
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(parseAuthorInfo(String(reader.result || "")));
    reader.onerror = () => resolve({});
    reader.readAsText(file);
  });
}

function parseAuthorInfo(text) {
  const tryJson = tryParseJson(text);
  if (tryJson) return tryJson;
  return {
    authorName: pickField(text, ["作者姓名", "姓名", "name", "author"]),
    authorEmail: pickField(text, ["作者邮箱", "邮箱", "email", "e-mail"]),
    authorDegree: pickField(text, ["学历", "degree", "education"]),
    authorSchool: pickField(text, ["学校", "单位", "school", "affiliation"]),
    authorPostalCode: pickField(text, ["邮编", "postal", "zip"]),
    fundInfo: pickField(text, ["基金", "fund", "funding"]),
    submissionEmail: pickField(text, ["投稿邮箱", "submission email"]),
    submissionEmailPassword: pickField(text, ["投稿邮箱密码", "邮箱密码", "password"]),
    authorInfoEn: pickField(text, ["英文作者信息", "author info", "english"]),
  };
}

function tryParseJson(text) {
  try {
    const data = JSON.parse(text);
    return {
      authorName: data.authorName || data.name || "",
      authorEmail: data.authorEmail || data.email || "",
      authorDegree: data.authorDegree || data.degree || "",
      authorSchool: data.authorSchool || data.school || data.affiliation || "",
      authorPostalCode: data.authorPostalCode || data.postalCode || data.zip || "",
      fundInfo: data.fundInfo || data.fund || "",
      submissionEmail: data.submissionEmail || "",
      submissionEmailPassword: data.submissionEmailPassword || data.emailPassword || "",
      authorInfoEn: data.authorInfoEn || data.authorInfo || "",
    };
  } catch {
    return null;
  }
}

function pickField(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：,，]\\s*([^\\n\\r;；]+)`, "i");
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function renderAttachments() {
  if (!attachmentList) return;
  if (!state.pendingAttachments.length) {
    attachmentList.className = "attachment-list empty-state";
    attachmentList.textContent = "暂无上传文件";
    return;
  }
  attachmentList.className = "attachment-list";
  attachmentList.innerHTML = state.pendingAttachments.map((item, index) => `
    <div class="attachment-item">
      <div><strong>${escapeHtml(item.name)}</strong><div>${escapeHtml(item.category || "客户资料")} · ${escapeHtml(formatFileSize(item.size))}</div></div>
      <div class="attachment-actions">
        <button class="text-btn" type="button" data-action="download" data-index="${index}">下载</button>
        <button class="text-btn" type="button" data-action="remove" data-index="${index}">移除</button>
      </div>
    </div>
  `).join("");
}

function handleAttachmentActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const index = Number(button.dataset.index);
  const item = state.pendingAttachments[index];
  if (!item) return;
  if (button.dataset.action === "remove") {
    state.pendingAttachments.splice(index, 1);
    renderAttachments();
    return;
  }
  const link = document.createElement("a");
  link.href = item.dataUrl;
  link.download = item.name;
  link.click();
}

function updateSubmissionBlocks() {
  const count = getSubmissionCount(orderForm.elements.namedItem("operationMethod")?.value);
  document.querySelectorAll("[data-submission-index]").forEach((block) => {
    const index = Number(block.dataset.submissionIndex);
    block.classList.toggle("hidden", index > count);
  });
}

function getSubmissionCount(operationMethod = "一稿一投") {
  if (operationMethod === "三稿三投") return 3;
  if (operationMethod === "两稿两投") return 2;
  return 1;
}

function updateStatusStageStrip() {
  if (!statusStageStrip) return;
  const current = orderForm.elements.namedItem("journalStatus")?.value || "未投稿";
  statusStageStrip.innerHTML = renderStatusStageChips(current);
}

function setActiveView(view) {
  state.activeView = view;
  const showWorkbench = view === "workbench";
  const showForm = view === "form";
  const showList = view === "list";
  const showTeachers = view === "teachers";
  const showDetail = view === "detail";
  workbenchView.classList.toggle("hidden", !showWorkbench);
  formView.classList.toggle("hidden", !showForm);
  listView.classList.toggle("hidden", !showList);
  teacherView.classList.toggle("hidden", !showTeachers);
  detailView.classList.toggle("hidden", !showDetail);
  workbenchViewTab.classList.toggle("active", showWorkbench);
  formViewTab.classList.toggle("active", showForm);
  listViewTab.classList.toggle("active", showList);
  teacherViewTab.classList.toggle("active", showTeachers);
  detailViewTab.classList.toggle("active", showDetail);
  detailViewTab.classList.toggle("hidden", !state.currentOrderId);
  if (showForm) {
    updateSubmissionBlocks();
    updateStatusStageStrip();
  }
  if (showTeachers) renderTeacherList();
}

function deriveAlerts(order) {
  const alerts = [];
  if (order.customerComplaint === "是") {
    alerts.push({ title: `${order.orderNumber} 客户投诉`, body: "客户已投诉，需要主管和教务联合处理。", level: "应急", risk: "应急", source: "客户" });
  }
  if (isTeacherSilent(order)) {
    alerts.push({ title: `${order.orderNumber} 老师超时未反馈`, body: "接单老师超过24小时未更新进度。", level: "高风险", risk: "高风险", source: "老师" });
  }
  if (isDeadlineNear(order)) {
    alerts.push({ title: `${order.orderNumber} 临近关键节点`, body: "录用/投稿时间接近，需确认稿件与投稿资料。", level: "预警", risk: "预警", source: "节点" });
  }
  if (isFollowUpDue(order)) {
    alerts.push({ title: `${order.orderNumber} 到期未跟进`, body: "已到下次跟进时间，需立即催办。", level: "提醒", risk: "提醒", source: "流程" });
  }
  if (toMoney(order.customerPaid) > 0 && ["销售建单", "待教务审核", "待分配老师"].includes(order.statusStage)) {
    alerts.push({ title: `${order.orderNumber} 已付款但推进慢`, body: "客户已付款，但订单尚未进入实质执行阶段。", level: "预警", risk: "预警", source: "财务" });
  }
  if (order.needsSupervisor === "是" && !alerts.some((item) => item.level === "应急")) {
    alerts.push({ title: `${order.orderNumber} 主管关注`, body: order.supervisorNote || "已被标记为主管重点关注订单。", level: order.riskLevel || "提醒", risk: order.riskLevel || "提醒", source: "主管" });
  }
  return alerts;
}

function getFinanceAlerts(orders) {
  return orders.flatMap((order) => {
    const alerts = [];
    if (toMoney(order.customerPaid) >= 5000 && ["销售建单", "待教务审核", "待分配老师"].includes(order.statusStage)) {
      alerts.push({
        title: `${order.orderNumber} 已收款但推进慢`,
        body: `已收 ${formatCurrency(order.customerPaid)}，当前仍处于 ${order.statusStage}。`,
        level: "预警",
        risk: "预警",
      });
    }
    if (toMoney(order.customerPending) >= 5000) {
      alerts.push({
        title: `${order.orderNumber} 尾款较高`,
        body: `客户待支付 ${formatCurrency(order.customerPending)}，建议主管关注回款风险。`,
        level: "提醒",
        risk: "提醒",
      });
    }
    if (toMoney(order.teacherPending) >= 3000 && order.paperProgress !== "已录用") {
      alerts.push({
        title: `${order.orderNumber} 老师待付款较高`,
        body: `老师待付款 ${formatCurrency(order.teacherPending)}，但订单尚未完成。`,
        level: "高风险",
        risk: "高风险",
      });
    }
    if (toMoney(order.orderAmount) >= 12000 && order.riskLevel !== "正常") {
      alerts.push({
        title: `${order.orderNumber} 高金额风险订单`,
        body: `订单额 ${formatCurrency(order.orderAmount)}，当前风险等级为 ${order.riskLevel}。`,
        level: order.riskLevel === "应急" ? "应急" : "高风险",
        risk: order.riskLevel,
      });
    }
    if (order.emergencyStatus && order.emergencyStatus !== "正常") {
      alerts.push({
        title: `${order.orderNumber} 应急状态`,
        body: `当前应急状态为 ${order.emergencyStatus}，需持续跟进处理结果。`,
        level: order.emergencyStatus === "已解决" ? "提醒" : "应急",
        risk: order.emergencyStatus === "已解决" ? "提醒" : "应急",
      });
    }
    return alerts;
  });
}

function renderFollowUpLogs(logs = [], mode = "all") {
  const filtered = logs.filter((log) => {
    const isTeacherFeedback = log.type === "老师反馈";
    if (mode === "teacher_feedback") return isTeacherFeedback;
    if (mode === "follow_up") return !isTeacherFeedback;
    return true;
  });

  if (!filtered.length) {
    return '<div class="empty-state">暂无记录</div>';
  }

  return [...filtered]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .map((log) => `
      <div class="timeline-entry">
        <strong>${escapeHtml(log.type || "跟进记录")}</strong>
        <small>${escapeHtml(log.actor || "-")} · ${escapeHtml(formatDateTime(log.time))}</small>
        <p>${escapeHtml(log.content || "-")}</p>
      </div>
    `)
    .join("");
}

function isTeacherSilent(order) {
  if (!order.lastTeacherUpdateAt) return Boolean(order.assignedTeacher);
  return Date.now() - new Date(order.lastTeacherUpdateAt).getTime() > 24 * 3600000;
}

function isDeadlineNear(order) {
  if (!order.acceptanceDate) return false;
  const diff = new Date(order.acceptanceDate).getTime() - Date.now();
  return diff > 0 && diff <= 48 * 3600000;
}

function isFollowUpDue(order) {
  if (!order.nextFollowUpAt) return false;
  return new Date(order.nextFollowUpAt).getTime() <= Date.now();
}

function syncPaymentFields() {
  const orderAmount = toMoney(orderForm.elements.namedItem("orderAmount").value);
  const customerPaid = toMoney(orderForm.elements.namedItem("customerPaid").value);
  const teacherPrice = toMoney(orderForm.elements.namedItem("teacherPrice").value);
  const teacherPaid = toMoney(orderForm.elements.namedItem("teacherPaid").value);
  orderForm.elements.namedItem("customerPending").value = Math.max(orderAmount - customerPaid, 0).toFixed(2);
  orderForm.elements.namedItem("teacherPending").value = Math.max(teacherPrice - teacherPaid, 0).toFixed(2);
}

function syncPendingFields(order) {
  order.customerPending = Math.max(toMoney(order.orderAmount) - toMoney(order.customerPaid), 0).toFixed(2);
  order.teacherPending = Math.max(toMoney(order.teacherPrice) - toMoney(order.teacherPaid), 0).toFixed(2);
}

function syncWorkflowFields(order) {
  if (order.teacherStability === "稳定老师" && order.innovationReviewStatus === "未提交") {
    order.innovationReviewStatus = "稳定老师跳过";
  }

  if (order.submittedAt) {
    if (!order.journalStatus || order.journalStatus === "未投稿") {
      order.journalStatus = "Submitted";
    }
    if (!order.firstWeekCheckAt) {
      order.firstWeekCheckAt = toLocalInputValue(addDays(order.submittedAt, 7));
    }
    if (!order.nextJournalCheckAt) {
      order.nextJournalCheckAt = toLocalInputValue(addDays(order.submittedAt, 7));
    }
  }

  if (order.journalStatus === "Revision" && order.revisionStatus === "无返修") {
    order.revisionStatus = "待提醒老师";
  }
  if (order.journalStatus === "Accepted" && order.pageFeeStatus === "未录用") {
    order.pageFeeStatus = "待提醒客户缴纳";
  }
  if (order.journalStatus === "Proofing" && order.proofingStatus === "未到校稿") {
    order.proofingStatus = "待客户确认";
  }
  if (order.journalStatus === "Online" && order.onlineStatus === "未online") {
    order.onlineStatus = "已online待提醒作者";
  }
  if (order.journalStatus === "Indexed" && order.indexingStatus === "未检索") {
    order.indexingStatus = "已检索待开报告";
  }
}

function handleTeacherSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(teacherForm).entries());
  const teacher = {
    id: payload.id || crypto.randomUUID(),
    name: payload.name || "",
    contact: payload.contact || "",
    capability: payload.capability || "",
    directions: payload.directions || "",
    stability: payload.stability || "稳定老师",
    rating: payload.rating || "A",
    note: payload.note || "",
    updatedAt: new Date().toISOString(),
  };
  const index = state.teachers.findIndex((item) => item.id === teacher.id);
  if (index >= 0) state.teachers[index] = teacher;
  else state.teachers.unshift(teacher);
  saveTeachers();
  resetTeacherForm();
  renderTeacherList();
}

function resetTeacherForm() {
  teacherForm.reset();
  teacherForm.elements.namedItem("id").value = "";
}

function renderTeacherList() {
  if (!teacherList) return;
  teacherCount.textContent = `${state.teachers.length} 位老师`;
  if (!state.teachers.length) {
    teacherList.innerHTML = '<div class="empty-state">暂无老师资料</div>';
    return;
  }
  teacherList.innerHTML = state.teachers.map((teacher) => {
    const stats = getTeacherOrderStats(teacher);
    return `
      <article class="teacher-card">
        <div>
          <h4>${escapeHtml(teacher.name || "未命名老师")}</h4>
          <p>${escapeHtml(teacher.capability || "未登记专业能力")}</p>
          <div class="teacher-stats">
            <span>接单状态：${escapeHtml(stats.status)}</span>
            <span>当前接单：${stats.activeCount} 单</span>
            <span>累计接单：${stats.totalCount} 单</span>
          </div>
          <small>接单方向：${escapeHtml(teacher.directions || "-")}</small>
          <small>联系方式：${escapeHtml(teacher.contact || "-")}</small>
          <small>备注：${escapeHtml(teacher.note || "-")}</small>
        </div>
        <div class="teacher-card-side">
          <span class="risk-tag" data-risk="${stats.risk}">${escapeHtml(stats.status)}</span>
          <span class="risk-tag" data-risk="${teacher.stability === "稳定老师" ? "正常" : "提醒"}">${escapeHtml(teacher.stability)}</span>
          <strong>${escapeHtml(teacher.rating || "A")}</strong>
          <button class="text-btn" type="button" data-teacher-action="edit" data-teacher-id="${escapeHtml(teacher.id)}">编辑</button>
          <button class="text-btn" type="button" data-teacher-action="assign" data-teacher-id="${escapeHtml(teacher.id)}">派给当前订单</button>
          <button class="text-btn" type="button" data-teacher-action="delete" data-teacher-id="${escapeHtml(teacher.id)}">删除</button>
        </div>
      </article>
    `;
  }).join("");
}

function getTeacherOrderStats(teacher) {
  const name = String(teacher.name || "").trim();
  const related = state.orders.filter((order) => String(order.assignedTeacher || "").trim() === name);
  const active = related.filter((order) => !isOrderClosed(order));
  if (!name) return { totalCount: 0, activeCount: 0, status: "未登记", risk: "提醒" };
  if (active.length >= 4) return { totalCount: related.length, activeCount: active.length, status: "满载", risk: "高风险" };
  if (active.length > 0) return { totalCount: related.length, activeCount: active.length, status: "接单中", risk: "提醒" };
  return { totalCount: related.length, activeCount: 0, status: "空闲", risk: "正常" };
}

function isOrderClosed(order) {
  return ["已录用"].includes(order.paperProgress) || ["Indexed", "Rejected"].includes(order.journalStatus) || order.statusStage === "已完成";
}

function handleTeacherListClick(event) {
  const button = event.target.closest("[data-teacher-action]");
  if (!button) return;
  const teacher = state.teachers.find((item) => item.id === button.dataset.teacherId);
  if (!teacher) return;
  if (button.dataset.teacherAction === "edit") {
    Array.from(teacherForm.elements).forEach((element) => {
      if (element.name && element.name in teacher) element.value = teacher[element.name] || "";
    });
    return;
  }
  if (button.dataset.teacherAction === "assign") {
    if (state.currentOrderId) {
      const order = findExistingOrder(state.currentOrderId);
      if (order) {
        const nextOrder = {
          ...order,
          assignedTeacher: teacher.name || "",
          teacherPhone: teacher.contact || "",
          teacherStability: teacher.stability === "稳定老师" ? "稳定老师" : "新老师",
          updatedAt: new Date().toISOString(),
        };
        syncWorkflowFields(nextOrder);
        upsertOrder(nextOrder);
        loadOrderToForm(nextOrder.id);
      }
    }
    orderForm.elements.namedItem("assignedTeacher").value = teacher.name || "";
    orderForm.elements.namedItem("teacherPhone").value = teacher.contact || "";
    orderForm.elements.namedItem("teacherStability").value = teacher.stability === "稳定老师" ? "稳定老师" : "新老师";
    setActiveView("form");
    return;
  }
  if (button.dataset.teacherAction === "delete") {
    state.teachers = state.teachers.filter((item) => item.id !== teacher.id);
    saveTeachers();
    renderTeacherList();
  }
}

function readFileAsAttachment(file, category = "客户资料") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, size: file.size, type: file.type, category, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(toMoney(value));
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function addDays(value, days) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  return new Date(date.getTime() + days * 24 * 3600000);
}

function toLocalInputValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function formatFileSize(size) {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
