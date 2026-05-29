const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();
const multer = require("multer");
const repositories = require("./repositories");
const { fetchMetricsFromUrl, openLoginBrowser } = require("./metricsFetcher");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const OWNER_PORT = Number(process.env.OWNER_PORT || 3001);
const DATA_FILE = path.join(__dirname, "data.json");
const SNAPSHOT_FILE = path.join(__dirname, "daily-snapshots.json");
const BACKUP_DIR = path.join(__dirname, "backups");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const MAX_BACKUPS_PER_FILE = 40;

const sessions = new Map();
const DEMO_MARK = "__DEMO_SEED__";
const DEMO_EMPLOYEE_NAME = "测试员工A";
const DEMO_ACCOUNT_NAME = "测试账号A";
const DEMO_STAFF_USERNAME = "demo_staff";
const DEMO_STAFF_PASSWORD = "123456";
const DEFAULT_SALES_USERNAME = "sales01";
const DEFAULT_SALES_PASSWORD = "123456";
const DEFAULT_OWNER_USERNAME = "boss01";
const DEFAULT_OWNER_PASSWORD = "123456";

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
if (!fs.existsSync(SNAPSHOT_FILE)) {
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({ snapshots: {} }, null, 2), "utf8");
}

function sanitizeBackupStamp(value) {
  return String(value || "")
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
}

function listBackups(label) {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter((file) => file.startsWith(`${label}-`) && file.endsWith(".json"))
    .sort()
    .map((file) => path.join(BACKUP_DIR, file));
}

function trimBackups(label) {
  const backups = listBackups(label);
  if (backups.length <= MAX_BACKUPS_PER_FILE) return;
  backups.slice(0, backups.length - MAX_BACKUPS_PER_FILE).forEach((file) => {
    try {
      fs.unlinkSync(file);
    } catch {}
  });
}

function backupJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) return;
  const backupName = `${label}-${sanitizeBackupStamp(nowIso())}.json`;
  fs.copyFileSync(filePath, path.join(BACKUP_DIR, backupName));
  trimBackups(label);
}

function latestBackupPath(label) {
  const backups = listBackups(label);
  return backups.length ? backups[backups.length - 1] : "";
}

function atomicWriteJson(filePath, data, label) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const serialized = JSON.stringify(data, null, 2);
  backupJsonFile(filePath, label);
  fs.writeFileSync(tempPath, serialized, "utf8");
  fs.renameSync(tempPath, filePath);
}

function readJsonWithFallback(filePath, label, normalize, createEmpty) {
  const emptyPayload = createEmpty();
  if (!fs.existsSync(filePath)) {
    atomicWriteJson(filePath, emptyPayload, label);
    return emptyPayload;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const normalized = normalize(raw);
    if (normalized.changed) {
      atomicWriteJson(filePath, normalized.data, label);
    }
    return normalized.data;
  } catch (error) {
    const backupPath = latestBackupPath(label);
    if (backupPath) {
      const restored = JSON.parse(fs.readFileSync(backupPath, "utf8"));
      const normalized = normalize(restored);
      atomicWriteJson(filePath, normalized.data, label);
      return normalized.data;
    }

    atomicWriteJson(filePath, emptyPayload, label);
    return emptyPayload;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({ storage });

app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

function normalizePostType(type) {
  const value = String(type || "").trim();
  if (value === "人设贴") return "素人贴";
  if (value === "讨论帖") return "话题贴";
  if (value === "营销贴") return "获客贴";
  return value || "素人贴";
}

function normalizeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

function normalizeTrafficByType(postType, traffic) {
  return normalizePostType(postType) === "获客贴"
    ? Number(traffic || 0)
    : 0;
}

function normalizeNotifications(items) {
  return (items || []).map((item) => ({
    id: item.id || makeId("notice"),
    type: item.type || "system",
    title: item.title || "系统消息",
    message: item.message || "",
    createdAt: item.createdAt || nowIso(),
    fromUserId: item.fromUserId || "",
    audienceRoles: Array.isArray(item.audienceRoles) ? item.audienceRoles : [],
    audienceEmployeeIds: Array.isArray(item.audienceEmployeeIds) ? item.audienceEmployeeIds : [],
    excludeUserIds: Array.isArray(item.excludeUserIds) ? item.excludeUserIds : [],
    readBy: Array.isArray(item.readBy) ? item.readBy : []
  }));
}

function ensureDefaultSalesUser(db) {
  const users = Array.isArray(db.users) ? db.users.slice() : [];
  const exists = users.some((item) => item.role === "sales");
  if (exists) {
    return { changed: false, users };
  }

  users.push({
    id: "user-sales-1",
    username: DEFAULT_SALES_USERNAME,
    password: DEFAULT_SALES_PASSWORD,
    role: "sales",
    employeeId: null,
    status: "active"
  });

  return { changed: true, users };
}

function ensureDefaultOwnerUser(db) {
  const users = Array.isArray(db.users) ? db.users.slice() : [];
  const exists = users.some((item) => item.role === "owner");
  if (exists) {
    return { changed: false, users };
  }

  users.push({
    id: "user-owner-1",
    username: DEFAULT_OWNER_USERNAME,
    password: DEFAULT_OWNER_PASSWORD,
    role: "owner",
    employeeId: null,
    status: "active"
  });

  return { changed: true, users };
}

function normalizeLocalDb(db) {
  let changed = false;
  const { changed: salesChanged, users } = ensureDefaultSalesUser(db);
  if (salesChanged) changed = true;
  const { changed: ownerChanged, users: ownerUsers } = ensureDefaultOwnerUser({ ...db, users });
  if (ownerChanged) changed = true;
  const posts = (db.posts || []).map((post) => {
    const postType = normalizePostType(post.postType);
    const traffic = normalizeTrafficByType(postType, post.traffic);
    if (postType !== post.postType || traffic !== Number(post.traffic || 0) || typeof post.copywriting !== "string" || typeof post.supervisorSuggestion !== "string") {
      changed = true;
    }
    return {
      ...post,
      postType,
      traffic,
      copywriting: typeof post.copywriting === "string" ? post.copywriting : "",
      supervisorSuggestion: typeof post.supervisorSuggestion === "string" ? post.supervisorSuggestion : ""
    };
  });
  const accounts = (db.accounts || []).map((account) => {
    const postingPlan = typeof account.postingPlan === "string" ? account.postingPlan : "";
    if (postingPlan !== (account.postingPlan || "")) changed = true;
    return {
      ...account,
      postingPlan
    };
  });
  const leads = (db.leads || []).map((lead) => {
    const next = {
      ...lead,
      assignedSalesUserId: typeof lead.assignedSalesUserId === "string" ? lead.assignedSalesUserId : "",
      assignedSalesUserName: typeof lead.assignedSalesUserName === "string" ? lead.assignedSalesUserName : "",
      processStatus: typeof lead.processStatus === "string" ? lead.processStatus : "未接",
      addStatus: typeof lead.addStatus === "string" ? lead.addStatus : "未添加",
      intention: typeof lead.intention === "string" ? lead.intention : ""
    };
    if (
      next.assignedSalesUserId !== (lead.assignedSalesUserId || "") ||
      next.assignedSalesUserName !== (lead.assignedSalesUserName || "") ||
      next.processStatus !== (lead.processStatus || "未接") ||
      next.addStatus !== (lead.addStatus || "未添加") ||
      next.intention !== (lead.intention || "")
    ) {
      changed = true;
    }
    return next;
  });

  return {
    changed,
    data: {
      ...db,
      users: ownerUsers,
      accounts,
      posts,
      leads,
      notifications: normalizeNotifications(db.notifications)
    }
  };
}

function normalizeSnapshotsPayload(payload) {
  let changed = false;
  const snapshots = Object.fromEntries(
    Object.entries(payload.snapshots || {}).map(([date, snapshot]) => {
      const distribution = (snapshot.distribution || []).map((item) => {
        const type = normalizePostType(item.type);
        if (type !== item.type) changed = true;
        return { ...item, type };
      });

      const postsMonitor = (snapshot.postsMonitor || []).map((post) => {
        const postType = normalizePostType(post.postType);
        const traffic = normalizeTrafficByType(postType, post.traffic);
        if (postType !== post.postType || traffic !== Number(post.traffic || 0) || typeof post.copywriting !== "string" || typeof post.supervisorSuggestion !== "string") {
          changed = true;
        }
        return {
          ...post,
          postType,
          traffic,
          copywriting: typeof post.copywriting === "string" ? post.copywriting : "",
          supervisorSuggestion: typeof post.supervisorSuggestion === "string" ? post.supervisorSuggestion : ""
        };
      });

      return [date, {
        ...snapshot,
        distribution,
        postsMonitor
      }];
    })
  );

  return {
    changed,
    data: {
      ...payload,
      snapshots
    }
  };
}

function readDb() {
  return readJsonWithFallback(
    DATA_FILE,
    "data",
    normalizeLocalDb,
    () => ({ users: [], employees: [], accounts: [], posts: [], leads: [] })
  );
}

function writeDb(data) {
  const normalized = normalizeLocalDb(data);
  atomicWriteJson(DATA_FILE, normalized.data, "data");
  persistDailySnapshots(normalized.data);
}

function readSnapshots() {
  return readJsonWithFallback(
    SNAPSHOT_FILE,
    "snapshots",
    normalizeSnapshotsPayload,
    () => ({ snapshots: {} })
  );
}

function writeSnapshots(data) {
  const normalized = normalizeSnapshotsPayload(data);
  atomicWriteJson(SNAPSHOT_FILE, normalized.data, "snapshots");
}

function nowIso() {
  return new Date().toISOString();
}

function todayString() {
  return new Date().toLocaleDateString("en-CA");
}

function parseDateOnly(value) {
  const matched = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
}

function formatDateOnly(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getDatesInWeek(weekValue) {
  const matched = String(weekValue || "").match(/^(\d{4})-W(\d{2})$/);
  if (!matched) return [];
  const year = Number(matched[1]);
  const week = Number(matched[2]);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - jan4Day + 1 + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return formatDateOnly(day);
  });
}

function getMonthDays(monthValue) {
  const matched = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
  if (!matched) return [];
  const year = Number(matched[1]);
  const monthIndex = Number(matched[2]) - 1;
  const cursor = new Date(year, monthIndex, 1);
  const days = [];
  while (cursor.getMonth() === monthIndex) {
    days.push(formatDateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function getLeadDatesForExport(query) {
  const mode = String(query.mode || "day");
  if (mode === "week") return getDatesInWeek(query.week);
  if (mode === "month") return getMonthDays(query.month);
  const day = String(query.date || todayString()).trim();
  return day ? [day] : [];
}

function filterLeadRows(rows, query) {
  const selectedDates = new Set(getLeadDatesForExport(query));
  return rows.filter((item) => {
    const createdDate = String(item.createdAt || "").slice(0, 10);
    if (selectedDates.size && !selectedDates.has(createdDate)) return false;
    if (query.employeeId && item.employeeId !== query.employeeId) return false;
    if (query.accountId && item.accountId !== query.accountId) return false;
    if (query.platform && item.platform !== query.platform) return false;
    if (query.postType && item.sourcePostType !== query.postType) return false;
    if (query.status && item.status !== query.status) return false;
    return true;
  });
}

function leadExportFileName(query) {
  const mode = String(query.mode || "day");
  const label = mode === "week"
    ? String(query.week || "week")
    : mode === "month"
      ? String(query.month || "month")
      : String(query.date || todayString());
  return `客资导出-${label}.xls`;
}

function buildLeadExportContent(rows) {
  const header = ["录入时间", "所属运营", "平台", "账号", "昵称", "联系方式", "预算", "专业", "IP", "来源作品", "作品链接", "状态", "销售反馈", "销售更新时间", "成交金额", "备注"];
  const body = rows.map((item) => [
    item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false }) : "",
    item.employeeName || "",
    item.platform || "",
    item.accountName || "",
    item.nickname || "",
    item.contactInfo || "",
    item.budget || "",
    item.majorContent || "",
    item.ip || "",
    item.sourcePostTitle || "",
    item.sourcePostUrl || "",
    item.status || "",
    item.salesFeedback || "",
    item.salesUpdatedAt ? new Date(item.salesUpdatedAt).toLocaleString("zh-CN", { hour12: false }) : "",
    item.dealAmount || "",
    item.note || ""
  ]);
  return ["\ufeff" + header.join("\t"), ...body.map((row) => row.map((item) => String(item).replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))].join("\n");
}

function yesterdayString() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString("en-CA");
}

function nextEmployeeCode(db) {
  const max = db.employees.reduce((acc, item) => {
    const value = Number(String(item.employeeCode || "").replace("EMP", "")) || 0;
    return Math.max(acc, value);
  }, 0);
  return `EMP${String(max + 1).padStart(4, "0")}`;
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function buildDemoPosts(employeeId, accountId, platform, today) {
  return [
    {
      id: makeId("post"),
      employeeId,
      accountId,
      platform,
      title: "素人分享：这个方向我今天这样发",
      coverImageUrl: "",
      postUrl: "https://example.com/demo-post-1",
      postType: "素人贴",
      traffic: 0,
      likes: 36,
      comments: 8,
      favorites: 12,
      metricsUpdatedAt: nowIso(),
      publishedAt: today,
      note: DEMO_MARK
    },
    {
      id: makeId("post"),
      employeeId,
      accountId,
      platform,
      title: "话题讨论：最近大家都在聊这个点",
      coverImageUrl: "",
      postUrl: "https://example.com/demo-post-2",
      postType: "话题贴",
      traffic: 0,
      likes: 52,
      comments: 14,
      favorites: 21,
      metricsUpdatedAt: nowIso(),
      publishedAt: today,
      note: DEMO_MARK
    },
    {
      id: makeId("post"),
      employeeId,
      accountId,
      platform,
      title: "获客贴：今天这条带来了几个咨询",
      coverImageUrl: "",
      postUrl: "https://example.com/demo-post-3",
      postType: "获客贴",
      traffic: 680,
      likes: 43,
      comments: 10,
      favorites: 16,
      metricsUpdatedAt: nowIso(),
      publishedAt: today,
      note: DEMO_MARK
    }
  ];
}

function buildDemoLeads(employeeId, accountId, platform, postId) {
  return [
    {
      id: makeId("lead"),
      employeeId,
      accountId,
      postId,
      platform,
      contactInfo: "13800138000",
      nickname: "咨询用户A",
      budget: "5000-8000",
      majorContent: "教育学",
      ip: "广东",
      status: "新客资",
      dealAmount: "",
      note: DEMO_MARK,
      createdAt: nowIso(),
      updatedAt: nowIso()
    },
    {
      id: makeId("lead"),
      employeeId,
      accountId,
      postId,
      platform,
      contactInfo: "wechat_demo_02",
      nickname: "咨询用户B",
      budget: "8000+",
      majorContent: "医学",
      ip: "江苏",
      status: "跟进中",
      dealAmount: "",
      note: DEMO_MARK,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ];
}

function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "") || String(req.query.token || "").trim();
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ message: "未登录" });
  }
  req.session = sessions.get(token);
  const requestPort = Number(req.socket?.localPort || PORT);
  if (requestPort === OWNER_PORT && req.session.role !== "owner") {
    return res.status(403).json({ message: "当前入口仅允许总后台账号登录" });
  }
  if (requestPort !== OWNER_PORT && req.session.role === "owner") {
    return res.status(403).json({ message: "总后台账号请从 3001 端口登录" });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ message: "无权限" });
    }
    next();
  };
}

function pickVisibleEmployeeId(req) {
  return req.session.role === "staff" ? req.session.employeeId : null;
}

function isMysqlEnabled() {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

function normalizeCoverImage(req) {
  if (req.file) {
    return `/uploads/${req.file.filename}`;
  }
  return req.body.coverImageUrl || "";
}

async function tryFetchPostMetrics(postUrl) {
  const url = String(postUrl || "").trim();
  if (!url) return { metrics: null, error: "" };

  try {
    const metrics = await fetchMetricsFromUrl(url);
    return { metrics, error: "" };
  } catch (error) {
    return { metrics: null, error: error.message || "互动数据抓取失败" };
  }
}

function enrichAccount(db, account) {
  const employee = db.employees.find((item) => item.id === account.employeeId);
  return {
    ...account,
    employeeName: employee?.name || "",
    employeeCode: employee?.employeeCode || "",
    postingPlan: typeof account.postingPlan === "string" ? account.postingPlan : ""
  };
}

function enrichPost(db, post) {
  const employee = db.employees.find((item) => item.id === post.employeeId);
  const account = db.accounts.find((item) => item.id === post.accountId);
  return {
    ...post,
    employeeName: employee?.name || "",
    accountName: account?.accountName || "",
    postingPlan: typeof account?.postingPlan === "string" ? account.postingPlan : ""
  };
}

function enrichLead(db, lead) {
  const employee = db.employees.find((item) => item.id === lead.employeeId);
  const account = db.accounts.find((item) => item.id === lead.accountId);
  const post = db.posts.find((item) => item.id === lead.postId);
  return {
    ...lead,
    employeeName: employee?.name || "",
    accountName: account?.accountName || "",
    sourcePostTitle: post?.title || "",
    sourcePostUrl: post?.postUrl || "",
    sourcePostType: post?.postType || "",
    salesFeedback: lead.salesFeedback || "",
    salesUpdatedAt: lead.salesUpdatedAt || "",
    salesUserName: lead.salesUserName || "",
    captureImageUrl: lead.captureImageUrl || "",
    assignedSalesUserId: lead.assignedSalesUserId || "",
    assignedSalesUserName: lead.assignedSalesUserName || "",
    processStatus: lead.processStatus || "未接",
    addStatus: lead.addStatus || "未添加",
    intention: lead.intention || ""
  };
}

function createNotification(db, payload) {
  const row = {
    id: makeId("notice"),
    type: payload.type || "system",
    title: payload.title || "系统消息",
    message: payload.message || "",
    createdAt: nowIso(),
    fromUserId: payload.fromUserId || "",
    audienceRoles: payload.audienceRoles || [],
    audienceEmployeeIds: payload.audienceEmployeeIds || [],
    excludeUserIds: payload.excludeUserIds || [],
    readBy: []
  };
  db.notifications = [row, ...(db.notifications || [])].slice(0, 300);
  return row;
}

function listNotificationsForSession(db, session) {
  const userId = session.userId || "";
  const role = session.role || "";
  const employeeId = session.employeeId || "";
  return (db.notifications || [])
    .filter((item) => {
      if (item.excludeUserIds?.includes(userId)) return false;
      const roleMatch = !item.audienceRoles?.length || item.audienceRoles.includes(role);
      const employeeScopedRoles = new Set(["staff"]);
      const shouldMatchEmployee = employeeScopedRoles.has(role);
      const employeeMatch = !shouldMatchEmployee
        || !item.audienceEmployeeIds?.length
        || item.audienceEmployeeIds.includes(employeeId);
      return roleMatch && employeeMatch;
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((item) => ({
      ...item,
      unread: !(item.readBy || []).includes(userId)
    }));
}

function markNotificationRead(db, notificationId, userId) {
  let changed = false;
  db.notifications = (db.notifications || []).map((item) => {
    if (item.id !== notificationId) return item;
    if ((item.readBy || []).includes(userId)) return item;
    changed = true;
    return {
      ...item,
      readBy: [...(item.readBy || []), userId]
    };
  });
  return changed;
}

function normalizePlayCount(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function previousDateFromString(dateString) {
  const date = new Date(dateString);
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString("en-CA");
}

function resolveInheritedPlayCount(posts, accountId, postUrl, publishedAt, excludeId = "") {
  const previousDate = previousDateFromString(publishedAt || todayString());
  const normalizedUrl = String(postUrl || "").trim();
  const exactYesterday = posts.find((item) =>
    item.id !== excludeId
    && item.accountId === accountId
    && item.publishedAt === previousDate
    && normalizedUrl
    && item.postUrl === normalizedUrl
    && Number(item.traffic || 0) > 0
  );
  if (exactYesterday) return Number(exactYesterday.traffic || 0);

  const latestSameUrl = posts
    .filter((item) =>
      item.id !== excludeId
      && item.accountId === accountId
      && normalizedUrl
      && item.postUrl === normalizedUrl
      && Number(item.traffic || 0) > 0
    )
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];

  return latestSameUrl ? Number(latestSameUrl.traffic || 0) : 0;
}

function resolvePostTraffic(postType, trafficInput, posts, accountId, postUrl, publishedAt, excludeId = "") {
  if (normalizePostType(postType) !== "获客贴") return 0;
  const normalized = normalizePlayCount(trafficInput);
  if (normalized !== null) return normalized;
  return resolveInheritedPlayCount(posts, accountId, postUrl, publishedAt, excludeId);
}

function buildDailySummary(db, date) {
  const todayPosts = db.posts.filter((item) => item.publishedAt === date);
  const todayLeads = db.leads.filter((item) => String(item.createdAt).startsWith(date));
  const deals = todayLeads.filter((item) => item.status === "已成交");
  const douyinPosts = todayPosts.filter((item) => item.platform === "抖音");
  const xhsPosts = todayPosts.filter((item) => item.platform === "小红书");
  return {
    updatedEmployees: new Set(todayPosts.map((item) => item.employeeId)).size,
    updatedAccounts: new Set(todayPosts.map((item) => item.accountId)).size,
    douyinPosts: douyinPosts.length,
    xhsPosts: xhsPosts.length,
    todayLeads: todayLeads.length,
    todayDeals: deals.length,
    douyinLikes: douyinPosts.reduce((sum, item) => sum + Number(item.likes || 0), 0),
    douyinComments: douyinPosts.reduce((sum, item) => sum + Number(item.comments || 0), 0),
    douyinFavorites: douyinPosts.reduce((sum, item) => sum + Number(item.favorites || 0), 0),
    xhsLikes: xhsPosts.reduce((sum, item) => sum + Number(item.likes || 0), 0),
    xhsComments: xhsPosts.reduce((sum, item) => sum + Number(item.comments || 0), 0),
    xhsFavorites: xhsPosts.reduce((sum, item) => sum + Number(item.favorites || 0), 0),
    douyinTraffic: douyinPosts.reduce((sum, item) => sum + Number(item.traffic || 0), 0),
    xhsTraffic: xhsPosts.reduce((sum, item) => sum + Number(item.traffic || 0), 0)
  };
}

function buildDailyDistribution(db, date) {
  const todayPosts = db.posts.filter((item) => item.publishedAt === date);
  const total = todayPosts.length || 1;
  return ["素人贴", "话题贴", "获客贴"].map((type) => {
    const count = todayPosts.filter((item) => item.postType === type).length;
    return {
      type,
      count,
      ratio: `${Math.round((count / total) * 100)}%`
    };
  });
}

function buildDailyRankingRows(db, date) {
  return db.employees.map((employee) => {
    const employeePosts = db.posts.filter((item) => item.employeeId === employee.id && item.publishedAt === date);
    const employeeLeads = db.leads.filter((item) => item.employeeId === employee.id && String(item.createdAt).startsWith(date));
    return {
      employeeId: employee.id,
      name: employee.name,
      accountCount: db.accounts.filter((item) => item.employeeId === employee.id).length,
      todayPosts: employeePosts.length,
      todayLeads: employeeLeads.length,
      todayTraffic: employeePosts.reduce((sum, item) => sum + Number(item.traffic || 0), 0),
      todayDeals: employeeLeads.filter((item) => item.status === "已成交").length
    };
  });
}

function buildRankings(db, date) {
  const rows = buildDailyRankingRows(db, date);
  const keyMap = {
    leads: "todayLeads",
    posts: "todayPosts",
    traffic: "todayTraffic",
    deals: "todayDeals"
  };
  return Object.fromEntries(
    Object.entries(keyMap).map(([type, key]) => [
      type,
      rows
        .slice()
        .sort((a, b) => b[key] - a[key])
        .map((item, index) => ({ rank: index + 1, ...item }))
    ])
  );
}

function buildPostsMonitorSnapshot(db, date) {
  return db.posts
    .filter((item) => item.publishedAt === date)
    .map((item) => enrichPost(db, item));
}

function buildLeadsMonitorSnapshot(db, date) {
  return db.leads
    .filter((item) => String(item.createdAt).startsWith(date))
    .map((item) => enrichLead(db, item));
}

function persistDailySnapshots(db, date = todayString()) {
  const snapshots = readSnapshots();
  snapshots.snapshots[date] = {
    date,
    updatedAt: nowIso(),
    summary: buildDailySummary(db, date),
    distribution: buildDailyDistribution(db, date),
    rankings: buildRankings(db, date),
    postsMonitor: buildPostsMonitorSnapshot(db, date),
    leadsMonitor: buildLeadsMonitorSnapshot(db, date)
  };
  writeSnapshots(snapshots);
}

function findSnapshotPost(snapshotPosts, post) {
  return snapshotPosts.find((item) => item.id === post.id)
    || snapshotPosts.find((item) => item.postUrl && post.postUrl && item.postUrl === post.postUrl);
}

async function persistDailySnapshotsFromRepositories(date = todayString()) {
  const [employees, accounts, posts, leads] = await Promise.all([
    repositories.listEmployees(),
    repositories.listAccounts(),
    repositories.listPosts(),
    repositories.listLeads()
  ]);

  const db = { employees, accounts, posts, leads };
  persistDailySnapshots(db, date);
}

function migrateLocalStorageFiles() {
  if (fs.existsSync(DATA_FILE)) {
    const normalizedDb = normalizeLocalDb(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
    if (normalizedDb.changed) {
      atomicWriteJson(DATA_FILE, normalizedDb.data, "data");
    }
  }

  if (fs.existsSync(SNAPSHOT_FILE)) {
    const normalizedSnapshots = normalizeSnapshotsPayload(JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")));
    if (normalizedSnapshots.changed) {
      atomicWriteJson(SNAPSHOT_FILE, normalizedSnapshots.data, "snapshots");
    }
  }
}

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const requestPort = Number(req.socket?.localPort || PORT);

  if (isMysqlEnabled()) {
    const user = await repositories.findUserByUsername(username);
    if (!user || user.password !== password || user.status !== "active") {
      return res.status(401).json({ message: "用户名或密码错误" });
    }
    if (requestPort === OWNER_PORT && user.role !== "owner") {
      return res.status(403).json({ message: "这个入口是总后台，请使用总后台账号登录" });
    }
    if (requestPort !== OWNER_PORT && user.role === "owner") {
      return res.status(403).json({ message: "总后台账号请从 3001 端口登录" });
    }

    const employees = await repositories.listEmployees();
    const employee = user.employeeId ? employees.find((item) => item.id === user.employeeId) : null;
    const token = crypto.randomUUID();
    sessions.set(token, {
      userId: user.id,
      role: user.role,
      employeeId: user.employeeId,
      username: user.username
    });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.employeeId,
        employeeName: employee?.name || ""
      }
    });
  }

  const db = readDb();
  const user = db.users.find(
    (item) => item.username === username && item.password === password && item.status === "active"
  );

  if (!user) {
    return res.status(401).json({ message: "用户名或密码错误" });
  }
  if (requestPort === OWNER_PORT && user.role !== "owner") {
    return res.status(403).json({ message: "这个入口是总后台，请使用总后台账号登录" });
  }
  if (requestPort !== OWNER_PORT && user.role === "owner") {
    return res.status(403).json({ message: "总后台账号请从 3001 端口登录" });
  }

  const employee = user.employeeId ? db.employees.find((item) => item.id === user.employeeId) : null;
  const token = crypto.randomUUID();
  sessions.set(token, {
    userId: user.id,
    role: user.role,
    employeeId: user.employeeId,
    username: user.username
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
      employeeName: employee?.name || ""
    }
  });
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  if (isMysqlEnabled()) {
    const user = await repositories.findUserById(req.session.userId);
    const employees = await repositories.listEmployees();
    const employee = user?.employeeId ? employees.find((item) => item.id === user.employeeId) : null;
    return res.json({
      user: {
        id: user?.id,
        username: user?.username,
        role: user?.role,
        employeeId: user?.employeeId || null,
        employeeName: employee?.name || ""
      }
    });
  }

  const db = readDb();
  const user = db.users.find((item) => item.id === req.session.userId);
  const employee = user?.employeeId ? db.employees.find((item) => item.id === user.employeeId) : null;
  res.json({
    user: {
      id: user?.id,
      username: user?.username,
      role: user?.role,
      employeeId: user?.employeeId || null,
      employeeName: employee?.name || ""
    }
  });
});

app.post("/api/auth/logout", authRequired, (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  sessions.delete(token);
  res.json({ ok: true });
});

app.get("/api/notifications", authRequired, (req, res) => {
  const db = readDb();
  const items = listNotificationsForSession(db, req.session);
  res.json({
    items: items.slice(0, 30),
    unreadCount: items.filter((item) => item.unread).length
  });
});

app.post("/api/notifications/:id/read", authRequired, (req, res) => {
  const db = readDb();
  const changed = markNotificationRead(db, req.params.id, req.session.userId);
  if (changed) {
    writeDb(db);
  }
  res.json({ ok: true });
});

app.post("/api/tools/fetch-metrics", authRequired, async (req, res) => {
  const url = String(req.body.url || "").trim();
  if (!url) {
    return res.status(400).json({ message: "请先输入作品链接" });
  }

  try {
    const metrics = await fetchMetricsFromUrl(url);
    res.json(metrics);
  } catch (error) {
    res.status(400).json({ message: error.message || "抓取失败" });
  }
});

async function handleOpenLoginBrowser(req, res) {
  const platform = String(req.body?.platform || req.query?.platform || "").trim();
  try {
    await openLoginBrowser(platform);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message || "打开登录浏览器失败" });
  }
}

app.post("/api/tools/open-login-browser", authRequired, handleOpenLoginBrowser);
app.get("/api/tools/open-login-browser", authRequired, handleOpenLoginBrowser);

app.post("/api/tools/seed-demo", authRequired, requireRole("admin", "owner"), async (_req, res) => {
  const today = todayString();

  if (isMysqlEnabled()) {
    const [employees, accounts, posts, leads] = await Promise.all([
      repositories.listEmployees(),
      repositories.listAccounts(),
      repositories.listPosts(),
      repositories.listLeads()
    ]);

    let employee = employees.find((item) => item.name === DEMO_EMPLOYEE_NAME);
    if (!employee) {
      employee = {
        id: makeId("emp"),
        employeeCode: await repositories.nextEmployeeCode(),
        name: DEMO_EMPLOYEE_NAME,
        phone: "13800138000",
        hireDate: today,
        status: "在职"
      };
      await repositories.createEmployee(employee);
    }

    let account = accounts.find((item) => item.employeeId === employee.id && item.accountName === DEMO_ACCOUNT_NAME);
    if (!account) {
      account = {
        id: makeId("acc"),
        employeeId: employee.id,
        platform: "小红书",
        profileUrl: "https://example.com/demo-account",
        accountName: DEMO_ACCOUNT_NAME,
        accountUid: "demo-account-001",
        persona: "素人分享",
        positioning: "测试演示号",
        status: "正常"
      };
      await repositories.createAccount(account);
    }

    await repositories.upsertStaffUser({
      id: makeId("user"),
      employeeId: employee.id,
      username: DEMO_STAFF_USERNAME,
      password: DEMO_STAFF_PASSWORD,
      status: "active"
    });

    const existingTodayDemoPosts = posts.filter((item) =>
      item.employeeId === employee.id
      && item.publishedAt === today
      && item.note === DEMO_MARK
    );

    let demoPosts = existingTodayDemoPosts;
    if (!demoPosts.length) {
      demoPosts = buildDemoPosts(employee.id, account.id, account.platform, today);
      for (const post of demoPosts) {
        await repositories.createPost(post);
      }
    }

    const targetLeadPost = demoPosts.find((item) => item.postType === "获客贴") || demoPosts[0];
    const existingTodayDemoLeads = leads.filter((item) =>
      item.employeeId === employee.id
      && String(item.createdAt).startsWith(today)
      && item.note === DEMO_MARK
    );

    if (!existingTodayDemoLeads.length && targetLeadPost) {
      const demoLeads = buildDemoLeads(employee.id, account.id, account.platform, targetLeadPost.id);
      for (const lead of demoLeads) {
        await repositories.createLead(lead);
      }
    }

    await persistDailySnapshotsFromRepositories();
    return res.json({
      ok: true,
      employeeName: DEMO_EMPLOYEE_NAME,
      accountName: DEMO_ACCOUNT_NAME,
      username: DEMO_STAFF_USERNAME,
      password: DEMO_STAFF_PASSWORD
    });
  }

  const db = readDb();

  let employee = db.employees.find((item) => item.name === DEMO_EMPLOYEE_NAME);
  if (!employee) {
    employee = {
      id: makeId("emp"),
      employeeCode: nextEmployeeCode(db),
      name: DEMO_EMPLOYEE_NAME,
      phone: "13800138000",
      hireDate: today,
      status: "在职",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    db.employees.unshift(employee);
  }

  let account = db.accounts.find((item) => item.employeeId === employee.id && item.accountName === DEMO_ACCOUNT_NAME);
  if (!account) {
    account = {
      id: makeId("acc"),
      employeeId: employee.id,
      platform: "小红书",
      profileUrl: "https://example.com/demo-account",
      accountName: DEMO_ACCOUNT_NAME,
      accountUid: "demo-account-001",
      persona: "素人分享",
      positioning: "测试演示号",
      status: "正常",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    db.accounts.unshift(account);
  }

  const existingUser = db.users.find((item) => item.username === DEMO_STAFF_USERNAME && item.role === "staff");
  if (existingUser) {
    existingUser.employeeId = employee.id;
    existingUser.password = DEMO_STAFF_PASSWORD;
    existingUser.status = "active";
  } else {
    db.users.unshift({
      id: makeId("user"),
      username: DEMO_STAFF_USERNAME,
      password: DEMO_STAFF_PASSWORD,
      role: "staff",
      employeeId: employee.id,
      status: "active"
    });
  }

  let demoPosts = db.posts.filter((item) =>
    item.employeeId === employee.id
    && item.publishedAt === today
    && item.note === DEMO_MARK
  );
  if (!demoPosts.length) {
    demoPosts = buildDemoPosts(employee.id, account.id, account.platform, today).map((item) => ({
      ...item,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));
    db.posts.unshift(...demoPosts);
  }

  const existingDemoLeads = db.leads.filter((item) =>
    item.employeeId === employee.id
    && String(item.createdAt).startsWith(today)
    && item.note === DEMO_MARK
  );
  if (!existingDemoLeads.length) {
    const targetLeadPost = demoPosts.find((item) => item.postType === "获客贴") || demoPosts[0];
    const demoLeads = buildDemoLeads(employee.id, account.id, account.platform, targetLeadPost.id);
    db.leads.unshift(...demoLeads);
  }

  writeDb(db);
  return res.json({
    ok: true,
    employeeName: DEMO_EMPLOYEE_NAME,
    accountName: DEMO_ACCOUNT_NAME,
    username: DEMO_STAFF_USERNAME,
    password: DEMO_STAFF_PASSWORD
  });
});

app.get("/api/employees", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    const [employees, accounts, staffUsers] = await Promise.all([
      repositories.listEmployees(),
      repositories.listAccounts(),
      repositories.listStaffUsers()
    ]);
    const rows = employees.map((employee) => ({
      ...employee,
      accountCount: accounts.filter((item) => item.employeeId === employee.id).length,
      loginUsername: staffUsers.find((item) => item.employeeId === employee.id)?.username || "",
      loginStatus: staffUsers.find((item) => item.employeeId === employee.id)?.status || ""
    }));
    return res.json(rows);
  }

  const db = readDb();
  const rows = db.employees.map((employee) => ({
    ...employee,
    accountCount: db.accounts.filter((item) => item.employeeId === employee.id).length,
    loginUsername: db.users.find((item) => item.employeeId === employee.id && item.role === "staff")?.username || "",
    loginStatus: db.users.find((item) => item.employeeId === employee.id && item.role === "staff")?.status || ""
  }));
  res.json(rows);
});

app.post("/api/employees", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    const row = {
      id: makeId("emp"),
      employeeCode: await repositories.nextEmployeeCode(),
      name: req.body.name,
      phone: req.body.phone || "",
      hireDate: req.body.hireDate || "",
      status: req.body.status || "在职"
    };
    await repositories.createEmployee(row);
    await persistDailySnapshotsFromRepositories();
    return res.json(row);
  }

  const db = readDb();
  const row = {
    id: makeId("emp"),
    employeeCode: nextEmployeeCode(db),
    name: req.body.name,
    phone: req.body.phone || "",
    hireDate: req.body.hireDate || "",
    status: req.body.status || "在职",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.employees.unshift(row);
  writeDb(db);
  res.json(row);
});

app.put("/api/employees/:id", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    await repositories.updateEmployee({
      id: req.params.id,
      name: req.body.name,
      phone: req.body.phone || "",
      hireDate: req.body.hireDate || "",
      status: req.body.status || "在职"
    });
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true });
  }

  const db = readDb();
  db.employees = db.employees.map((item) =>
    item.id === req.params.id
      ? {
          ...item,
          name: req.body.name,
          phone: req.body.phone || "",
          hireDate: req.body.hireDate || "",
          status: req.body.status || item.status,
          updatedAt: nowIso()
        }
      : item
  );
  writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/employees/:id", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    await repositories.deleteEmployee(req.params.id);
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true });
  }

  const db = readDb();
  db.users = db.users.filter((item) => item.employeeId !== req.params.id);
  db.accounts = db.accounts.filter((item) => item.employeeId !== req.params.id);
  db.posts = db.posts.filter((item) => item.employeeId !== req.params.id);
  db.leads = db.leads.filter((item) => item.employeeId !== req.params.id);
  db.employees = db.employees.filter((item) => item.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/users/staff", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    return res.json(await repositories.listStaffUsers());
  }

  const db = readDb();
  const rows = db.users
    .filter((item) => item.role === "staff")
    .map((user) => {
      const employee = db.employees.find((item) => item.id === user.employeeId);
      return {
        id: user.id,
        username: user.username,
        employeeId: user.employeeId,
        employeeName: employee?.name || "",
        status: user.status
      };
  });
  res.json(rows);
});

app.get("/api/users", authRequired, requireRole("admin", "owner"), async (_req, res) => {
  if (isMysqlEnabled()) {
    const users = await repositories.listUsers();
    return res.json(users.map((item) => ({
      id: item.id,
      username: item.username,
      role: item.role,
      employeeId: item.employeeId,
      status: item.status
    })));
  }

  const db = readDb();
  res.json((db.users || []).map((item) => ({
    id: item.id,
    username: item.username,
    role: item.role,
    employeeId: item.employeeId,
    status: item.status
  })));
});

app.post("/api/users/staff", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    const { employeeId, username, password, status } = req.body;
    if (!employeeId || !username || !password) {
      return res.status(400).json({ message: "员工、用户名和密码不能为空" });
    }

    const duplicated = await repositories.findUserByUsername(username);
    if (duplicated && duplicated.employeeId !== employeeId) {
      return res.status(400).json({ message: "用户名已存在" });
    }

    await repositories.upsertStaffUser({
      id: makeId("user"),
      employeeId,
      username,
      password,
      status: status || "active"
    });
    return res.json({ ok: true });
  }

  const db = readDb();
  const { employeeId, username, password, status } = req.body;

  if (!employeeId || !username || !password) {
    return res.status(400).json({ message: "员工、用户名和密码不能为空" });
  }

  const duplicated = db.users.find(
    (item) => item.username === username && item.employeeId !== employeeId
  );
  if (duplicated) {
    return res.status(400).json({ message: "用户名已存在" });
  }

  const existing = db.users.find((item) => item.employeeId === employeeId && item.role === "staff");
  if (existing) {
    existing.username = username;
    existing.password = password;
    existing.status = status || existing.status || "active";
  } else {
    db.users.unshift({
      id: makeId("user"),
      username,
      password,
      role: "staff",
      employeeId,
      status: status || "active"
    });
  }

  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/accounts", authRequired, async (req, res) => {
  if (isMysqlEnabled()) {
    const [accounts, employees] = await Promise.all([
      repositories.listAccounts(),
      repositories.listEmployees()
    ]);
    const visibleEmployeeId = pickVisibleEmployeeId(req);
    const rows = accounts
      .filter((item) => !visibleEmployeeId || item.employeeId === visibleEmployeeId)
      .map((item) => ({
        ...item,
        employeeName: employees.find((employee) => employee.id === item.employeeId)?.name || "",
        employeeCode: employees.find((employee) => employee.id === item.employeeId)?.employeeCode || ""
      }));
    return res.json(rows);
  }

  const db = readDb();
  const visibleEmployeeId = pickVisibleEmployeeId(req);
  const rows = db.accounts
    .filter((item) => !visibleEmployeeId || item.employeeId === visibleEmployeeId)
    .map((item) => enrichAccount(db, item));
  res.json(rows);
});

app.post("/api/accounts", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    const row = {
      id: makeId("acc"),
      employeeId: req.body.employeeId,
      platform: req.body.platform,
      profileUrl: normalizeExternalUrl(req.body.profileUrl || ""),
      accountName: req.body.accountName,
      accountUid: req.body.accountUid || "",
      persona: req.body.persona || "",
      positioning: req.body.positioning || "",
      postingPlan: req.body.postingPlan || "",
      status: req.body.status || "正常"
    };
    await repositories.createAccount(row);
    await persistDailySnapshotsFromRepositories();
    const employees = await repositories.listEmployees();
    return res.json({
      ...row,
      employeeName: employees.find((item) => item.id === row.employeeId)?.name || "",
      employeeCode: employees.find((item) => item.id === row.employeeId)?.employeeCode || ""
    });
  }

  const db = readDb();
  const row = {
    id: makeId("acc"),
    employeeId: req.body.employeeId,
    platform: req.body.platform,
    profileUrl: normalizeExternalUrl(req.body.profileUrl || ""),
    accountName: req.body.accountName,
    accountUid: req.body.accountUid || "",
    persona: req.body.persona || "",
    positioning: req.body.positioning || "",
    postingPlan: req.body.postingPlan || "",
    status: req.body.status || "正常",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.accounts.unshift(row);
  writeDb(db);
  res.json(enrichAccount(db, row));
});

app.put("/api/accounts/:id", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    await repositories.updateAccount({
      id: req.params.id,
      employeeId: req.body.employeeId,
      platform: req.body.platform,
      profileUrl: normalizeExternalUrl(req.body.profileUrl || ""),
      accountName: req.body.accountName,
      accountUid: req.body.accountUid || "",
      persona: req.body.persona || "",
      positioning: req.body.positioning || "",
      postingPlan: req.body.postingPlan || "",
      status: req.body.status || "正常"
    });
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true });
  }

  const db = readDb();
  db.accounts = db.accounts.map((item) =>
    item.id === req.params.id
      ? {
          ...item,
          employeeId: req.body.employeeId,
          platform: req.body.platform,
          profileUrl: normalizeExternalUrl(req.body.profileUrl || ""),
          accountName: req.body.accountName,
          accountUid: req.body.accountUid || "",
          persona: req.body.persona || "",
          positioning: req.body.positioning || "",
          postingPlan: req.body.postingPlan || "",
          status: req.body.status || item.status,
          updatedAt: nowIso()
        }
      : item
  );
  writeDb(db);
  res.json({ ok: true });
});

app.put("/api/accounts/:id/posting-plan", authRequired, async (req, res) => {
  const postingPlan = String(req.body.postingPlan || "");
  if (isMysqlEnabled()) {
    const accounts = await repositories.listAccounts();
    const current = accounts.find((item) => item.id === req.params.id);
    if (!current) {
      return res.status(404).json({ message: "账号不存在" });
    }
    if (req.session.role === "staff" && current.employeeId !== req.session.employeeId) {
      return res.status(403).json({ message: "无权限" });
    }
    if (!["staff", "admin", "owner"].includes(req.session.role)) {
      return res.status(403).json({ message: "无权限" });
    }
    await repositories.updateAccountPostingPlan(req.params.id, postingPlan);
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true });
  }

  const db = readDb();
  const current = db.accounts.find((item) => item.id === req.params.id);
  if (!current) {
    return res.status(404).json({ message: "账号不存在" });
  }
  if (req.session.role === "staff" && current.employeeId !== req.session.employeeId) {
    return res.status(403).json({ message: "无权限" });
  }
  if (!["staff", "admin", "owner"].includes(req.session.role)) {
    return res.status(403).json({ message: "无权限" });
  }
  db.accounts = db.accounts.map((item) => (
    item.id === req.params.id
      ? {
          ...item,
          postingPlan,
          updatedAt: nowIso()
        }
      : item
  ));
  writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/accounts/:id", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    await repositories.deleteAccount(req.params.id);
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true });
  }

  const db = readDb();
  db.posts = db.posts.filter((item) => item.accountId !== req.params.id);
  db.leads = db.leads.filter((item) => item.accountId !== req.params.id);
  db.accounts = db.accounts.filter((item) => item.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/posts", authRequired, async (req, res) => {
  const shouldShowAllPosts = req.query.scope === "all";
  if (isMysqlEnabled()) {
    await persistDailySnapshotsFromRepositories();
    const visibleEmployeeId = shouldShowAllPosts ? null : pickVisibleEmployeeId(req);
    const [posts, employees, accounts] = await Promise.all([
      visibleEmployeeId ? repositories.listPostsByEmployee(visibleEmployeeId) : repositories.listPosts(),
      repositories.listEmployees(),
      repositories.listAccounts()
    ]);
    const rows = posts.map((item) => ({
      ...item,
      employeeName: employees.find((employee) => employee.id === item.employeeId)?.name || "",
      accountName: accounts.find((account) => account.id === item.accountId)?.accountName || "",
      postingPlan: accounts.find((account) => account.id === item.accountId)?.postingPlan || ""
    }));
    return res.json(rows);
  }

  const db = readDb();
  persistDailySnapshots(db);
  const visibleEmployeeId = shouldShowAllPosts ? null : pickVisibleEmployeeId(req);
  const rows = db.posts
    .filter((item) => !visibleEmployeeId || item.employeeId === visibleEmployeeId)
    .map((item) => enrichPost(db, item));
  res.json(rows);
});

app.post("/api/posts", authRequired, upload.single("coverImage"), async (req, res) => {
  if (isMysqlEnabled()) {
    const accounts = await repositories.listAccounts();
    const posts = await repositories.listPosts();
    const account = accounts.find((item) => item.id === req.body.accountId);
    const employeeId = req.session.role === "staff" ? req.session.employeeId : req.body.employeeId;
    const postUrl = normalizeExternalUrl(req.body.postUrl || "");
    const likes = Number(req.body.likes || 0);
    const comments = Number(req.body.comments || 0);
    const favorites = Number(req.body.favorites || 0);
    const postType = normalizePostType(req.body.postType || "素人贴");
    const publishedAt = req.body.publishedAt || todayString();
    const row = {
      id: makeId("post"),
      employeeId,
      accountId: req.body.accountId,
      platform: account?.platform || req.body.platform || "",
      title: req.body.title || "未命名作品",
      copywriting: req.body.copywriting || "",
      coverImageUrl: normalizeCoverImage(req),
      postUrl,
      postType,
      likes,
      comments,
      favorites,
      traffic: resolvePostTraffic(postType, req.body.traffic, posts, req.body.accountId, postUrl, publishedAt),
      metricsUpdatedAt: null,
      publishedAt,
      note: req.body.note || "",
      supervisorSuggestion: req.body.supervisorSuggestion || ""
    };
    await repositories.createPost(row);
    await persistDailySnapshotsFromRepositories();
    const employees = await repositories.listEmployees();
    return res.json({
      ...row,
      employeeName: employees.find((item) => item.id === row.employeeId)?.name || "",
      accountName: account?.accountName || "",
      metricsSyncError: ""
    });
  }

  const db = readDb();
  const account = db.accounts.find((item) => item.id === req.body.accountId);
  const employeeId = req.session.role === "staff" ? req.session.employeeId : req.body.employeeId;
  const postUrl = normalizeExternalUrl(req.body.postUrl || "");
  const likes = Number(req.body.likes || 0);
  const comments = Number(req.body.comments || 0);
  const favorites = Number(req.body.favorites || 0);
  const row = {
    id: makeId("post"),
    employeeId,
    accountId: req.body.accountId,
    platform: account?.platform || req.body.platform || "",
    title: req.body.title || "未命名作品",
    copywriting: req.body.copywriting || "",
    coverImageUrl: normalizeCoverImage(req),
    postUrl,
    postType: normalizePostType(req.body.postType || "素人贴"),
    likes,
    comments,
    favorites,
    traffic: resolvePostTraffic(req.body.postType || "素人贴", req.body.traffic, db.posts, req.body.accountId, postUrl, req.body.publishedAt || todayString()),
    metricsUpdatedAt: null,
    publishedAt: req.body.publishedAt || todayString(),
    note: req.body.note || "",
    supervisorSuggestion: req.body.supervisorSuggestion || "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.posts.unshift(row);
  createNotification(db, {
    type: "post_created",
    title: "有新的作品录入",
    message: `${enrichPost(db, row).employeeName || "运营"}录入了作品《${row.title || "未命名作品"}》`,
    fromUserId: req.session.userId,
    audienceRoles: ["admin", "sales", "staff", "owner"],
    excludeUserIds: [req.session.userId]
  });
  writeDb(db);
  res.json({
    ...enrichPost(db, row),
    metricsSyncError: ""
  });
});

app.put("/api/posts/:id", authRequired, upload.single("coverImage"), async (req, res) => {
  if (isMysqlEnabled()) {
    const current = await repositories.findPostById(req.params.id);
    const posts = await repositories.listPosts();
    if (!current) {
      return res.status(404).json({ message: "作品不存在" });
    }
    if (req.session.role === "staff" && current.employeeId !== req.session.employeeId) {
      return res.status(403).json({ message: "无权限" });
    }
    const postUrl = normalizeExternalUrl(req.body.postUrl || "");
    const likes = Number(req.body.likes || current.likes || 0);
    const comments = Number(req.body.comments || current.comments || 0);
    const favorites = Number(req.body.favorites || current.favorites || 0);
    const postType = normalizePostType(req.body.postType || current.postType || "素人贴");
    const publishedAt = req.body.publishedAt || current.publishedAt;
    await repositories.updatePost({
      id: req.params.id,
      accountId: req.body.accountId,
      title: req.body.title || current.title || "未命名作品",
      copywriting: req.body.copywriting || current.copywriting || "",
      coverImageUrl: req.file ? normalizeCoverImage(req) : (req.body.coverImageUrl || current.coverImageUrl || ""),
      postUrl,
      postType,
      likes,
      comments,
      favorites,
      traffic: resolvePostTraffic(postType, req.body.traffic, posts, req.body.accountId, postUrl, publishedAt, req.params.id),
      metricsUpdatedAt: current.metricsUpdatedAt || null,
      publishedAt,
      note: req.body.note || "",
      supervisorSuggestion: req.body.supervisorSuggestion || current.supervisorSuggestion || ""
    });
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true, metricsSyncError: "" });
  }

  const db = readDb();
  const current = db.posts.find((item) => item.id === req.params.id);
  if (!current) {
    return res.status(404).json({ message: "作品不存在" });
  }
  if (req.session.role === "staff" && current.employeeId !== req.session.employeeId) {
    return res.status(403).json({ message: "无权限" });
  }
  const postUrl = normalizeExternalUrl(req.body.postUrl || "");
  const likes = Number(req.body.likes || current.likes || 0);
  const comments = Number(req.body.comments || current.comments || 0);
  const favorites = Number(req.body.favorites || current.favorites || 0);
  const postType = normalizePostType(req.body.postType || current.postType || "素人贴");
  const publishedAt = req.body.publishedAt || current.publishedAt;
  db.posts = db.posts.map((item) => {
    if (item.id !== req.params.id) return item;
      return {
        ...item,
        accountId: req.body.accountId,
        title: req.body.title || item.title || "未命名作品",
        copywriting: req.body.copywriting || item.copywriting || "",
        coverImageUrl: req.file ? normalizeCoverImage(req) : (req.body.coverImageUrl || item.coverImageUrl || ""),
      postUrl,
      postType,
      likes,
      comments,
      favorites,
      traffic: resolvePostTraffic(postType, req.body.traffic, db.posts, req.body.accountId, postUrl, publishedAt, req.params.id),
      metricsUpdatedAt: item.metricsUpdatedAt || null,
      publishedAt,
      note: req.body.note || "",
      supervisorSuggestion: req.body.supervisorSuggestion || item.supervisorSuggestion || "",
      updatedAt: nowIso()
    };
  });
  writeDb(db);
  res.json({ ok: true, metricsSyncError: "" });
});

app.put("/api/posts/:id/supervisor-suggestion", authRequired, requireRole("admin", "owner"), async (req, res) => {
  const supervisorSuggestion = String(req.body.supervisorSuggestion || "");
  if (isMysqlEnabled()) {
    const current = await repositories.findPostById(req.params.id);
    if (!current) return res.status(404).json({ message: "作品不存在" });
    await repositories.updatePostSupervisorSuggestion(req.params.id, supervisorSuggestion);
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true });
  }

  const db = readDb();
  const current = db.posts.find((item) => item.id === req.params.id);
  if (!current) return res.status(404).json({ message: "作品不存在" });
  db.posts = db.posts.map((item) => (
    item.id === req.params.id
      ? { ...item, supervisorSuggestion, updatedAt: nowIso() }
      : item
  ));
  writeDb(db);
  res.json({ ok: true });
});

app.post("/api/posts/:id/fetch-metrics", authRequired, async (req, res) => {
  if (isMysqlEnabled()) {
    const current = await repositories.findPostById(req.params.id);
    if (!current) return res.status(404).json({ message: "作品不存在" });
    if (req.session.role === "staff" && current.employeeId !== req.session.employeeId) {
      return res.status(403).json({ message: "无权限" });
    }
    if (!current.postUrl) {
      return res.status(400).json({ message: "请先填写作品链接" });
    }

    try {
      const metrics = await fetchMetricsFromUrl(current.postUrl);
      await repositories.updatePostMetrics(req.params.id, metrics);
      await persistDailySnapshotsFromRepositories();
      return res.json({ ok: true, metrics });
    } catch (error) {
      return res.status(400).json({ message: error.message || "抓取失败" });
    }
  }

  const db = readDb();
  const current = db.posts.find((item) => item.id === req.params.id);
  if (!current) return res.status(404).json({ message: "作品不存在" });
  if (req.session.role === "staff" && current.employeeId !== req.session.employeeId) {
    return res.status(403).json({ message: "无权限" });
  }
  if (!current.postUrl) {
    return res.status(400).json({ message: "请先填写作品链接" });
  }

  try {
    const metrics = await fetchMetricsFromUrl(current.postUrl);
    db.posts = db.posts.map((item) =>
      item.id === req.params.id
        ? {
            ...item,
            likes: metrics.likes,
            comments: metrics.comments,
            favorites: metrics.favorites,
            metricsUpdatedAt: metrics.metricsUpdatedAt,
            updatedAt: nowIso()
          }
        : item
    );
    writeDb(db);
    res.json({ ok: true, metrics });
  } catch (error) {
    res.status(400).json({ message: error.message || "抓取失败" });
  }
});

app.post("/api/posts/refresh-metrics", authRequired, requireRole("admin", "owner"), async (req, res) => {
  const postIds = Array.isArray(req.body.postIds)
    ? Array.from(new Set(req.body.postIds.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];

  if (!postIds.length) {
    return res.status(400).json({ message: "当前范围内没有可刷新的作品" });
  }

  if (isMysqlEnabled()) {
    const posts = await repositories.listPosts();
    const targets = posts.filter((item) => postIds.includes(item.id));
    let refreshed = 0;
    let skipped = 0;
    const failed = [];

    for (const post of targets) {
      if (!post.postUrl) {
        skipped += 1;
        continue;
      }
      try {
        const metrics = await fetchMetricsFromUrl(post.postUrl);
        await repositories.updatePostMetrics(post.id, metrics);
        refreshed += 1;
      } catch (error) {
        failed.push({
          id: post.id,
          title: post.title,
          message: error.message || "抓取失败"
        });
      }
    }

    await persistDailySnapshotsFromRepositories();
    return res.json({
      ok: true,
      total: targets.length,
      refreshed,
      skipped,
      failed
    });
  }

  const db = readDb();
  const targets = db.posts.filter((item) => postIds.includes(item.id));
  let refreshed = 0;
  let skipped = 0;
  const failed = [];

  for (const post of targets) {
    if (!post.postUrl) {
      skipped += 1;
      continue;
    }
      try {
        const metrics = await fetchMetricsFromUrl(post.postUrl);
        Object.assign(post, {
          likes: metrics.likes,
          comments: metrics.comments,
          favorites: metrics.favorites,
        metricsUpdatedAt: metrics.metricsUpdatedAt,
        updatedAt: nowIso()
      });
      refreshed += 1;
    } catch (error) {
      failed.push({
        id: post.id,
        title: post.title,
        message: error.message || "抓取失败"
      });
    }
  }

  writeDb(db);
  res.json({
    ok: true,
    total: targets.length,
    refreshed,
    skipped,
    failed
  });
});

app.post("/api/dashboard/refresh-entered-data", authRequired, requireRole("admin", "owner"), async (_req, res) => {
  if (isMysqlEnabled()) {
    await persistDailySnapshotsFromRepositories();
    const [posts, leads] = await Promise.all([
      repositories.listPosts(),
      repositories.listLeads()
    ]);
    return res.json({
      ok: true,
      postCount: posts.length,
      leadCount: leads.length
    });
  }

  const db = readDb();
  persistDailySnapshots(db);
  return res.json({
    ok: true,
    postCount: db.posts.length,
    leadCount: db.leads.length
  });
});

app.post("/api/posts/rollback-metrics", authRequired, requireRole("admin", "owner"), async (req, res) => {
  const postIds = Array.isArray(req.body.postIds)
    ? Array.from(new Set(req.body.postIds.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];
  const snapshotDate = String(req.body.snapshotDate || yesterdayString()).trim();
  const password = String(req.body.password || "").trim();

  if (!password) {
    return res.status(400).json({ message: "请输入当前账号密码后再执行回退" });
  }

  if (!postIds.length) {
    return res.status(400).json({ message: "当前范围内没有可回退的作品" });
  }

  const snapshots = readSnapshots();
  const snapshot = snapshots.snapshots?.[snapshotDate];
  if (!snapshot?.postsMonitor?.length) {
    return res.status(404).json({ message: `未找到 ${snapshotDate} 的作品快照` });
  }

  if (isMysqlEnabled()) {
    const currentUser = await repositories.findUserById(req.session.userId);
    if (!currentUser || String(currentUser.password || "") !== password) {
      return res.status(403).json({ message: "密码错误，回退已取消" });
    }
    const posts = await repositories.listPosts();
    const targets = posts.filter((item) => postIds.includes(item.id));
    let restored = 0;
    let skipped = 0;
    const failed = [];

    for (const post of targets) {
      const snapshotPost = findSnapshotPost(snapshot.postsMonitor, post);
      if (!snapshotPost) {
        skipped += 1;
        continue;
      }
      try {
        await repositories.updatePostMetrics(post.id, {
          likes: Number(snapshotPost.likes || 0),
          comments: Number(snapshotPost.comments || 0),
          favorites: Number(snapshotPost.favorites || 0),
          metricsUpdatedAt: snapshotPost.metricsUpdatedAt || snapshot.updatedAt || nowIso()
        });
        restored += 1;
      } catch (error) {
        failed.push({
          id: post.id,
          title: post.title,
          message: error.message || "回退失败"
        });
      }
    }

    await persistDailySnapshotsFromRepositories();
    return res.json({
      ok: true,
      snapshotDate,
      total: targets.length,
      restored,
      skipped,
      failed
    });
  }

  const db = readDb();
  const currentUser = (db.users || []).find((item) => item.id === req.session.userId);
  if (!currentUser || String(currentUser.password || "") !== password) {
    return res.status(403).json({ message: "密码错误，回退已取消" });
  }
  const targets = db.posts.filter((item) => postIds.includes(item.id));
  let restored = 0;
  let skipped = 0;

  db.posts = db.posts.map((post) => {
    if (!postIds.includes(post.id)) return post;
    const snapshotPost = findSnapshotPost(snapshot.postsMonitor, post);
    if (!snapshotPost) {
      skipped += 1;
      return post;
    }
    restored += 1;
    return {
      ...post,
      likes: Number(snapshotPost.likes || 0),
      comments: Number(snapshotPost.comments || 0),
      favorites: Number(snapshotPost.favorites || 0),
      traffic: Number(snapshotPost.traffic || 0),
      metricsUpdatedAt: snapshotPost.metricsUpdatedAt || snapshot.updatedAt || nowIso(),
      updatedAt: nowIso()
    };
  });

  writeDb(db);
  res.json({
    ok: true,
    snapshotDate,
    total: targets.length,
    restored,
    skipped,
    failed: []
  });
});

app.delete("/api/posts/:id", authRequired, async (req, res) => {
  if (isMysqlEnabled()) {
    const posts = await repositories.listPosts();
    const current = posts.find((item) => item.id === req.params.id);
    if (!current) return res.status(404).json({ message: "作品不存在" });
    if (req.session.role === "staff" && current.employeeId !== req.session.employeeId) {
      return res.status(403).json({ message: "无权限" });
    }
    await repositories.deletePost(req.params.id);
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true });
  }

  const db = readDb();
  const target = db.posts.find((item) => item.id === req.params.id);
  if (!target) return res.status(404).json({ message: "作品不存在" });
  if (req.session.role === "staff" && target.employeeId !== req.session.employeeId) {
    return res.status(403).json({ message: "无权限" });
  }
  db.posts = db.posts.filter((item) => item.id !== req.params.id);
  db.leads = db.leads.filter((item) => item.postId !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/leads", authRequired, async (req, res) => {
  const shouldShowAllLeads = req.query.scope === "all";
  if (isMysqlEnabled()) {
    await persistDailySnapshotsFromRepositories();
    const visibleEmployeeId = shouldShowAllLeads ? null : pickVisibleEmployeeId(req);
    const [leads, employees, accounts, posts] = await Promise.all([
      visibleEmployeeId ? repositories.listLeadsByEmployee(visibleEmployeeId) : repositories.listLeads(),
      repositories.listEmployees(),
      repositories.listAccounts(),
      repositories.listPosts()
    ]);
    const rows = leads.map((item) => ({
      ...item,
      employeeName: employees.find((employee) => employee.id === item.employeeId)?.name || "",
      accountName: accounts.find((account) => account.id === item.accountId)?.accountName || "",
      sourcePostTitle: posts.find((post) => post.id === item.postId)?.title || "",
      sourcePostUrl: posts.find((post) => post.id === item.postId)?.postUrl || "",
      sourcePostType: posts.find((post) => post.id === item.postId)?.postType || ""
    }));
    return res.json(rows);
  }

  const db = readDb();
  persistDailySnapshots(db);
  const visibleEmployeeId = shouldShowAllLeads ? null : pickVisibleEmployeeId(req);
  const rows = db.leads
    .filter((item) => !visibleEmployeeId || item.employeeId === visibleEmployeeId)
    .map((item) => enrichLead(db, item));
  res.json(rows);
});

app.get("/api/leads/export", authRequired, async (req, res) => {
  let rows = [];

  if (isMysqlEnabled()) {
    await persistDailySnapshotsFromRepositories();
    const visibleEmployeeId = pickVisibleEmployeeId(req);
    const [leads, employees, accounts, posts] = await Promise.all([
      visibleEmployeeId ? repositories.listLeadsByEmployee(visibleEmployeeId) : repositories.listLeads(),
      repositories.listEmployees(),
      repositories.listAccounts(),
      repositories.listPosts()
    ]);
    rows = leads.map((item) => ({
      ...item,
      employeeName: employees.find((employee) => employee.id === item.employeeId)?.name || "",
      accountName: accounts.find((account) => account.id === item.accountId)?.accountName || "",
      sourcePostTitle: posts.find((post) => post.id === item.postId)?.title || "",
      sourcePostUrl: posts.find((post) => post.id === item.postId)?.postUrl || "",
      sourcePostType: posts.find((post) => post.id === item.postId)?.postType || ""
    }));
  } else {
    const db = readDb();
    persistDailySnapshots(db);
    const visibleEmployeeId = pickVisibleEmployeeId(req);
    rows = db.leads
      .filter((item) => !visibleEmployeeId || item.employeeId === visibleEmployeeId)
      .map((item) => enrichLead(db, item));
  }

  const filteredRows = filterLeadRows(rows, req.query);
  const content = buildLeadExportContent(filteredRows);
  const fileName = encodeURIComponent(leadExportFileName(req.query));
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${fileName}`);
  res.send(content);
});

app.post("/api/leads", authRequired, upload.single("captureImage"), async (req, res) => {
  if (isMysqlEnabled()) {
    const accounts = await repositories.listAccounts();
    const account = accounts.find((item) => item.id === req.body.accountId);
    const employeeId = req.session.role === "staff" ? req.session.employeeId : req.body.employeeId;
    const row = {
      id: makeId("lead"),
      employeeId,
      accountId: req.body.accountId,
      postId: req.body.postId || "",
      platform: account?.platform || req.body.platform || "",
      contactInfo: req.body.contactInfo || "",
      nickname: req.body.nickname || "",
      budget: req.body.budget || "",
      majorContent: req.body.majorContent || "",
      ip: req.body.ip || "",
      status: req.body.status || "新客资",
      dealAmount: req.body.dealAmount || "",
      note: req.body.note || "",
      captureImageUrl: req.file ? `/uploads/${req.file.filename}` : (req.body.captureImageUrl || ""),
      salesFeedback: req.body.salesFeedback || "",
      salesUpdatedAt: req.body.salesUpdatedAt || "",
      salesUserName: req.body.salesUserName || "",
      assignedSalesUserId: req.body.assignedSalesUserId || "",
      assignedSalesUserName: req.body.assignedSalesUserName || "",
      processStatus: req.body.processStatus || "未接",
      addStatus: req.body.addStatus || "未添加",
      intention: req.body.intention || ""
    };
    await repositories.createLead(row);
    await persistDailySnapshotsFromRepositories();
    const employees = await repositories.listEmployees();
    const posts = await repositories.listPosts();
    return res.json({
      ...row,
      employeeName: employees.find((item) => item.id === row.employeeId)?.name || "",
      accountName: account?.accountName || "",
      sourcePostTitle: posts.find((item) => item.id === row.postId)?.title || "",
      sourcePostUrl: posts.find((item) => item.id === row.postId)?.postUrl || "",
      sourcePostType: posts.find((item) => item.id === row.postId)?.postType || ""
    });
  }

  const db = readDb();
  const account = db.accounts.find((item) => item.id === req.body.accountId);
  const employeeId = req.session.role === "staff" ? req.session.employeeId : req.body.employeeId;
    const row = {
      id: makeId("lead"),
      employeeId,
    accountId: req.body.accountId,
    postId: req.body.postId || "",
    platform: account?.platform || req.body.platform || "",
    contactInfo: req.body.contactInfo || "",
    nickname: req.body.nickname || "",
    budget: req.body.budget || "",
    majorContent: req.body.majorContent || "",
    ip: req.body.ip || "",
    status: req.body.status || "新客资",
    dealAmount: req.body.dealAmount || "",
      note: req.body.note || "",
      captureImageUrl: req.file ? `/uploads/${req.file.filename}` : (req.body.captureImageUrl || ""),
      salesFeedback: req.body.salesFeedback || "",
      salesUpdatedAt: req.body.salesUpdatedAt || "",
      salesUserName: req.body.salesUserName || "",
      assignedSalesUserId: req.body.assignedSalesUserId || "",
      assignedSalesUserName: req.body.assignedSalesUserName || "",
      processStatus: req.body.processStatus || "未接",
      addStatus: req.body.addStatus || "未添加",
      intention: req.body.intention || "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  db.leads.unshift(row);
  createNotification(db, {
    type: "lead_created",
    title: "有新的客资录入",
    message: `${enrichLead(db, row).employeeName || "运营"}录入了客资 ${row.contactInfo || row.nickname || ""}`.trim(),
    fromUserId: req.session.userId,
    audienceRoles: ["admin", "sales", "staff", "owner"],
    excludeUserIds: [req.session.userId]
  });
  writeDb(db);
  res.json(enrichLead(db, row));
});

app.put("/api/leads/:id", authRequired, upload.single("captureImage"), async (req, res) => {
  const bodyHas = (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key);
  if (isMysqlEnabled()) {
    const leads = await repositories.listLeads();
    const current = leads.find((item) => item.id === req.params.id);
    if (!current) {
      return res.status(404).json({ message: "客资不存在" });
    }
    if (req.session.role === "staff" && current.employeeId !== req.session.employeeId) {
      return res.status(403).json({ message: "无权限" });
    }
    await repositories.updateLead({
      id: req.params.id,
      accountId: bodyHas("accountId") ? req.body.accountId : current.accountId,
      postId: bodyHas("postId") ? (req.body.postId || "") : (current.postId || ""),
      contactInfo: bodyHas("contactInfo") ? (req.body.contactInfo || "") : (current.contactInfo || ""),
      nickname: bodyHas("nickname") ? (req.body.nickname || "") : (current.nickname || ""),
      budget: bodyHas("budget") ? (req.body.budget || "") : (current.budget || ""),
      majorContent: bodyHas("majorContent") ? (req.body.majorContent || "") : (current.majorContent || ""),
      ip: bodyHas("ip") ? (req.body.ip || "") : (current.ip || ""),
      status: bodyHas("status") ? (req.body.status || current.status) : current.status,
      dealAmount: bodyHas("dealAmount") ? (req.body.dealAmount || "") : (current.dealAmount || ""),
      note: bodyHas("note") ? (req.body.note || "") : (current.note || ""),
      captureImageUrl: req.file ? `/uploads/${req.file.filename}` : (req.body.captureImageUrl || current.captureImageUrl || ""),
      salesFeedback: req.body.salesFeedback ?? current.salesFeedback ?? "",
      salesUpdatedAt: req.session.role === "sales" ? nowIso() : (current.salesUpdatedAt || ""),
      salesUserName: req.session.role === "sales" ? (req.session.username || "") : (current.salesUserName || ""),
      assignedSalesUserId: req.body.assignedSalesUserId ?? current.assignedSalesUserId ?? "",
      assignedSalesUserName: req.body.assignedSalesUserName ?? current.assignedSalesUserName ?? "",
      processStatus: req.body.processStatus ?? current.processStatus ?? "未接",
      addStatus: req.body.addStatus ?? current.addStatus ?? "未添加",
      intention: req.body.intention ?? current.intention ?? ""
    });
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true });
  }

  const db = readDb();
  const current = db.leads.find((item) => item.id === req.params.id);
  if (!current) {
    return res.status(404).json({ message: "客资不存在" });
  }
  db.leads = db.leads.map((item) => {
    if (item.id !== req.params.id) return item;
    if (req.session.role === "staff" && item.employeeId !== req.session.employeeId) return item;
    return {
      ...item,
      accountId: bodyHas("accountId") ? req.body.accountId : item.accountId,
      postId: bodyHas("postId") ? (req.body.postId || "") : (item.postId || ""),
      contactInfo: bodyHas("contactInfo") ? (req.body.contactInfo || "") : (item.contactInfo || ""),
      nickname: bodyHas("nickname") ? (req.body.nickname || "") : (item.nickname || ""),
      budget: bodyHas("budget") ? (req.body.budget || "") : (item.budget || ""),
      majorContent: bodyHas("majorContent") ? (req.body.majorContent || "") : (item.majorContent || ""),
      ip: bodyHas("ip") ? (req.body.ip || "") : (item.ip || ""),
      status: bodyHas("status") ? (req.body.status || item.status) : item.status,
      dealAmount: bodyHas("dealAmount") ? (req.body.dealAmount || "") : (item.dealAmount || ""),
      note: bodyHas("note") ? (req.body.note || "") : (item.note || ""),
      captureImageUrl: req.file ? `/uploads/${req.file.filename}` : (req.body.captureImageUrl || item.captureImageUrl || ""),
      salesFeedback: req.body.salesFeedback ?? item.salesFeedback ?? "",
      salesUpdatedAt: req.session.role === "sales" ? nowIso() : (item.salesUpdatedAt || ""),
      salesUserName: req.session.role === "sales" ? (req.session.username || "") : (item.salesUserName || ""),
      assignedSalesUserId: req.body.assignedSalesUserId ?? item.assignedSalesUserId ?? "",
      assignedSalesUserName: req.body.assignedSalesUserName ?? item.assignedSalesUserName ?? "",
      processStatus: req.body.processStatus ?? item.processStatus ?? "未接",
      addStatus: req.body.addStatus ?? item.addStatus ?? "未添加",
      intention: req.body.intention ?? item.intention ?? "",
      updatedAt: nowIso()
    };
  });
  if (req.session.role === "sales") {
    createNotification(db, {
      type: "lead_sales_feedback",
      title: "销售反馈了客资情况",
      message: `${req.session.username || "销售"}更新了 ${current.contactInfo || current.nickname || "一条客资"} 的跟进状态`,
      fromUserId: req.session.userId,
      audienceRoles: ["admin", "staff", "owner"],
      audienceEmployeeIds: current.employeeId ? [current.employeeId] : [],
      excludeUserIds: [req.session.userId]
    });
  }
  writeDb(db);
  res.json({ ok: true });
});

app.put("/api/leads/:id/board", authRequired, async (req, res) => {
  const payload = {
    assignedSalesUserId: req.body.assignedSalesUserId || "",
    assignedSalesUserName: req.body.assignedSalesUserName || "",
    processStatus: req.body.processStatus || "未接",
    addStatus: req.body.addStatus || "未添加",
    intention: req.body.intention || ""
  };

  if (isMysqlEnabled()) {
    const leads = await repositories.listLeads();
    const current = leads.find((item) => item.id === req.params.id);
    if (!current) {
      return res.status(404).json({ message: "客资不存在" });
    }
    await repositories.updateLeadBoardFields({
      id: req.params.id,
      assignedSalesUserId: payload.assignedSalesUserId || current.assignedSalesUserId || "",
      assignedSalesUserName: payload.assignedSalesUserName || current.assignedSalesUserName || "",
      processStatus: payload.processStatus || current.processStatus || "未接",
      addStatus: payload.addStatus || current.addStatus || "未添加",
      intention: payload.intention || current.intention || ""
    });
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true });
  }

  const db = readDb();
  const current = db.leads.find((item) => item.id === req.params.id);
  if (!current) {
    return res.status(404).json({ message: "客资不存在" });
  }
  db.leads = db.leads.map((item) => {
    if (item.id !== req.params.id) return item;
    return {
      ...item,
      assignedSalesUserId: payload.assignedSalesUserId || item.assignedSalesUserId || "",
      assignedSalesUserName: payload.assignedSalesUserName || item.assignedSalesUserName || "",
      processStatus: payload.processStatus || item.processStatus || "未接",
      addStatus: payload.addStatus || item.addStatus || "未添加",
      intention: payload.intention || item.intention || "",
      updatedAt: nowIso()
    };
  });
  writeDb(db);
  res.json({ ok: true });
});

app.post("/api/leads/:id/remind", authRequired, async (req, res) => {
  const target = String(req.body.target || "").trim();
  if (!["sales", "operator"].includes(target)) {
    return res.status(400).json({ message: "提醒目标不正确" });
  }

  const db = readDb();
  const sourceDb = isMysqlEnabled() ? null : db;
  let lead = null;
  let employeeName = "";

  if (isMysqlEnabled()) {
    const [leads, employees] = await Promise.all([
      repositories.listLeads(),
      repositories.listEmployees()
    ]);
    lead = leads.find((item) => item.id === req.params.id) || null;
    employeeName = employees.find((item) => item.id === lead?.employeeId)?.name || "";
  } else {
    lead = db.leads.find((item) => item.id === req.params.id) || null;
    employeeName = db.employees.find((item) => item.id === lead?.employeeId)?.name || "";
  }

  if (!lead) {
    return res.status(404).json({ message: "客资不存在" });
  }

  const label = lead.contactInfo || lead.nickname || "这条客资";
  createNotification(db, {
    type: target === "sales" ? "lead_remind_sales" : "lead_remind_operator",
    title: target === "sales" ? "请及时添加" : "微信未同意",
    message: target === "sales"
      ? "请及时添加"
      : `微信${label}未同意`,
    fromUserId: req.session.userId,
    audienceRoles: target === "sales" ? ["sales", "owner", "admin"] : ["staff", "owner", "admin"],
    audienceEmployeeIds: target === "operator" && lead.employeeId ? [lead.employeeId] : [],
    excludeUserIds: [req.session.userId]
  });
  writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/leads/:id", authRequired, async (req, res) => {
  if (isMysqlEnabled()) {
    const leads = await repositories.listLeads();
    const current = leads.find((item) => item.id === req.params.id);
    if (!current) return res.status(404).json({ message: "客资不存在" });
    if (req.session.role === "staff" && current.employeeId !== req.session.employeeId) {
      return res.status(403).json({ message: "无权限" });
    }
    await repositories.deleteLead(req.params.id);
    await persistDailySnapshotsFromRepositories();
    return res.json({ ok: true });
  }

  const db = readDb();
  const target = db.leads.find((item) => item.id === req.params.id);
  if (!target) return res.status(404).json({ message: "客资不存在" });
  if (req.session.role === "staff" && target.employeeId !== req.session.employeeId) {
    return res.status(403).json({ message: "无权限" });
  }
  db.leads = db.leads.filter((item) => item.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/dashboard/summary", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    await persistDailySnapshotsFromRepositories();
    return res.json(await repositories.dashboardSummary(todayString()));
  }

  const db = readDb();
  persistDailySnapshots(db);
  const today = todayString();
  const todayPosts = db.posts.filter((item) => item.publishedAt === today);
  const todayLeads = db.leads.filter((item) => String(item.createdAt).startsWith(today));
  const deals = todayLeads.filter((item) => item.status === "已成交");
  const douyinPosts = todayPosts.filter((item) => item.platform === "抖音");
  const xhsPosts = todayPosts.filter((item) => item.platform === "小红书");
  res.json({
    updatedEmployees: new Set(todayPosts.map((item) => item.employeeId)).size,
    updatedAccounts: new Set(todayPosts.map((item) => item.accountId)).size,
    douyinPosts: douyinPosts.length,
    xhsPosts: xhsPosts.length,
    todayLeads: todayLeads.length,
    todayDeals: deals.length,
    douyinLikes: douyinPosts.reduce((sum, item) => sum + Number(item.likes || 0), 0),
    douyinComments: douyinPosts.reduce((sum, item) => sum + Number(item.comments || 0), 0),
    douyinFavorites: douyinPosts.reduce((sum, item) => sum + Number(item.favorites || 0), 0),
    xhsLikes: xhsPosts.reduce((sum, item) => sum + Number(item.likes || 0), 0),
    xhsComments: xhsPosts.reduce((sum, item) => sum + Number(item.comments || 0), 0),
    xhsFavorites: xhsPosts.reduce((sum, item) => sum + Number(item.favorites || 0), 0),
    douyinTraffic: douyinPosts.reduce((sum, item) => sum + Number(item.traffic || 0), 0),
    xhsTraffic: xhsPosts.reduce((sum, item) => sum + Number(item.traffic || 0), 0)
  });
});

app.get("/api/dashboard/post-type-distribution", authRequired, requireRole("admin", "owner"), async (req, res) => {
  if (isMysqlEnabled()) {
    await persistDailySnapshotsFromRepositories();
    return res.json(await repositories.postTypeDistribution(todayString()));
  }

  const db = readDb();
  persistDailySnapshots(db);
  const today = todayString();
  const todayPosts = db.posts.filter((item) => item.publishedAt === today);
  const total = todayPosts.length || 1;
  const types = ["素人贴", "话题贴", "获客贴"].map((type) => {
    const count = todayPosts.filter((item) => item.postType === type).length;
    return {
      type,
      count,
      ratio: `${Math.round((count / total) * 100)}%`
    };
  });
  res.json(types);
});

app.get("/api/rankings", authRequired, async (req, res) => {
  if (isMysqlEnabled()) {
    await persistDailySnapshotsFromRepositories();
    const type = req.query.type || "posts";
    const rows = await repositories.rankingRows(todayString());
    const keyMap = {
      leads: "todayLeads",
      posts: "todayPosts",
      traffic: "todayTraffic",
      deals: "todayDeals"
    };
    const sorted = rows.sort((a, b) => b[keyMap[type]] - a[keyMap[type]]).map((item, index) => ({
      rank: index + 1,
      ...item
    }));
    return res.json(sorted);
  }

  const db = readDb();
  persistDailySnapshots(db);
  const today = todayString();
  const type = req.query.type || "posts";

  const rows = db.employees.map((employee) => {
    const employeePosts = db.posts.filter((item) => item.employeeId === employee.id && item.publishedAt === today);
    const employeeLeads = db.leads.filter((item) => item.employeeId === employee.id && String(item.createdAt).startsWith(today));
    return {
      employeeId: employee.id,
      name: employee.name,
      accountCount: db.accounts.filter((item) => item.employeeId === employee.id).length,
      todayPosts: employeePosts.length,
      todayLeads: employeeLeads.length,
      todayTraffic: employeePosts.reduce((sum, item) => sum + Number(item.traffic || 0), 0),
      todayDeals: employeeLeads.filter((item) => item.status === "已成交").length
    };
  });

  const keyMap = {
    leads: "todayLeads",
    posts: "todayPosts",
    traffic: "todayTraffic",
    deals: "todayDeals"
  };

  const sorted = rows.sort((a, b) => b[keyMap[type]] - a[keyMap[type]]).map((item, index) => ({
    rank: index + 1,
    ...item
  }));
  res.json(sorted);
});

app.get("/api/analytics/snapshots", authRequired, requireRole("admin", "owner"), (_req, res) => {
  const snapshots = readSnapshots();
  res.json(snapshots);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

async function bootstrapSnapshots() {
  if (isMysqlEnabled()) {
    await persistDailySnapshotsFromRepositories();
    return;
  }
  persistDailySnapshots(readDb());
}

migrateLocalStorageFiles();

bootstrapSnapshots()
  .catch((error) => {
    console.error("初始化日报快照失败:", error.message);
  })
  .finally(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`局域网系统已启动: http://0.0.0.0:${PORT}`);
    });
    if (OWNER_PORT !== PORT) {
      app.listen(OWNER_PORT, "0.0.0.0", () => {
        console.log(`总后台已启动: http://0.0.0.0:${OWNER_PORT}`);
      });
    }
  });
