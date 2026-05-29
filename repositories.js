const { query } = require("./db");

const normalizePostType = (type) => {
  const value = String(type || "").trim();
  if (value === "人设贴") return "素人贴";
  if (value === "讨论帖") return "话题贴";
  if (value === "营销贴") return "获客贴";
  return value || "素人贴";
};

const normalizeTrafficByType = (postType, traffic) => (
  normalizePostType(postType) === "获客贴" ? Number(traffic || 0) : 0
);

const mapUser = (row) => ({
  id: row.id,
  username: row.username,
  password: row.password,
  role: row.role,
  employeeId: row.employee_id,
  status: row.status
});

const mapEmployee = (row) => ({
  id: row.id,
  employeeCode: row.employee_code,
  name: row.name,
  phone: row.phone,
  hireDate: row.hire_date,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapAccount = (row) => ({
  id: row.id,
  employeeId: row.employee_id,
  platform: row.platform,
  profileUrl: row.profile_url,
  accountName: row.account_name,
  accountUid: row.account_uid,
  persona: row.persona,
  positioning: row.positioning,
  postingPlan: row.posting_plan || "",
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapPost = (row) => ({
  id: row.id,
  employeeId: row.employee_id,
  accountId: row.account_id,
  platform: row.platform,
  title: row.title,
  copywriting: row.copywriting || "",
  coverImageUrl: row.cover_image_url,
  postUrl: row.post_url,
  postType: normalizePostType(row.post_type),
  traffic: normalizeTrafficByType(row.post_type, row.traffic),
  likes: row.likes,
  comments: row.comments,
  favorites: row.favorites,
  metricsUpdatedAt: row.metrics_updated_at,
  publishedAt: row.published_at,
  note: row.note,
  supervisorSuggestion: row.supervisor_suggestion || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapLead = (row) => ({
  id: row.id,
  employeeId: row.employee_id,
  accountId: row.account_id,
  postId: row.post_id,
  platform: row.platform,
  contactInfo: row.contact_info,
  nickname: row.nickname,
  budget: row.budget,
  majorContent: row.major_content,
  ip: row.ip,
  status: row.status,
  dealAmount: row.deal_amount,
  note: row.note,
  captureImageUrl: row.capture_image_url,
  salesFeedback: row.sales_feedback,
  salesUpdatedAt: row.sales_updated_at,
  salesUserName: row.sales_user_name,
  assignedSalesUserId: row.assigned_sales_user_id,
  assignedSalesUserName: row.assigned_sales_user_name,
  processStatus: row.process_status,
  addStatus: row.add_status,
  intention: row.intention,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

async function findUserByUsername(username) {
  const rows = await query("SELECT * FROM users WHERE username = ? LIMIT 1", [username]);
  return rows[0] ? mapUser(rows[0]) : null;
}

async function findUserById(id) {
  const rows = await query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? mapUser(rows[0]) : null;
}

async function listUsers() {
  const rows = await query("SELECT * FROM users ORDER BY created_at DESC");
  return rows.map(mapUser);
}

async function listStaffUsers() {
  const rows = await query("SELECT * FROM users WHERE role = 'staff' ORDER BY created_at DESC");
  return rows.map(mapUser);
}

async function listEmployees() {
  const rows = await query("SELECT * FROM employees ORDER BY created_at DESC");
  return rows.map(mapEmployee);
}

async function createEmployee(employee) {
  await query(
    "INSERT INTO employees (id, employee_code, name, phone, hire_date, status) VALUES (?, ?, ?, ?, ?, ?)",
    [employee.id, employee.employeeCode, employee.name, employee.phone, employee.hireDate || null, employee.status]
  );
}

async function updateEmployee(employee) {
  await query(
    "UPDATE employees SET name = ?, phone = ?, hire_date = ?, status = ? WHERE id = ?",
    [employee.name, employee.phone, employee.hireDate || null, employee.status, employee.id]
  );
}

async function deleteEmployee(id) {
  await query("DELETE FROM employees WHERE id = ?", [id]);
}

async function listAccounts() {
  const rows = await query("SELECT * FROM accounts ORDER BY created_at DESC");
  return rows.map(mapAccount);
}

async function createAccount(account) {
  await query(
    "INSERT INTO accounts (id, employee_id, platform, profile_url, account_name, account_uid, persona, positioning, posting_plan, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [account.id, account.employeeId, account.platform, account.profileUrl, account.accountName, account.accountUid, account.persona, account.positioning, account.postingPlan || "", account.status]
  );
}

async function updateAccount(account) {
  await query(
    "UPDATE accounts SET employee_id = ?, platform = ?, profile_url = ?, account_name = ?, account_uid = ?, persona = ?, positioning = ?, posting_plan = ?, status = ? WHERE id = ?",
    [account.employeeId, account.platform, account.profileUrl, account.accountName, account.accountUid, account.persona, account.positioning, account.postingPlan || "", account.status, account.id]
  );
}

async function updateAccountPostingPlan(id, postingPlan) {
  await query(
    "UPDATE accounts SET posting_plan = ? WHERE id = ?",
    [postingPlan || "", id]
  );
}

async function deleteAccount(id) {
  await query("DELETE FROM accounts WHERE id = ?", [id]);
}

async function listPosts() {
  const rows = await query("SELECT * FROM posts ORDER BY published_at DESC, created_at DESC");
  return rows.map(mapPost);
}

async function listPostsByEmployee(employeeId) {
  const rows = await query(
    "SELECT * FROM posts WHERE employee_id = ? ORDER BY published_at DESC, created_at DESC",
    [employeeId]
  );
  return rows.map(mapPost);
}

async function findPostById(id) {
  const rows = await query("SELECT * FROM posts WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? mapPost(rows[0]) : null;
}

async function createPost(post) {
  await query(
    "INSERT INTO posts (id, employee_id, account_id, platform, title, copywriting, cover_image_url, post_url, post_type, traffic, likes, comments, favorites, metrics_updated_at, published_at, note, supervisor_suggestion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [post.id, post.employeeId, post.accountId, post.platform, post.title, post.copywriting || "", post.coverImageUrl, post.postUrl, post.postType, post.traffic, post.likes, post.comments, post.favorites, post.metricsUpdatedAt || null, post.publishedAt, post.note, post.supervisorSuggestion || ""]
  );
}

async function updatePost(post) {
  await query(
    "UPDATE posts SET account_id = ?, title = ?, copywriting = ?, cover_image_url = ?, post_url = ?, post_type = ?, traffic = ?, likes = ?, comments = ?, favorites = ?, metrics_updated_at = ?, published_at = ?, note = ?, supervisor_suggestion = ? WHERE id = ?",
    [post.accountId, post.title, post.copywriting || "", post.coverImageUrl, post.postUrl, post.postType, post.traffic, post.likes, post.comments, post.favorites, post.metricsUpdatedAt || null, post.publishedAt, post.note, post.supervisorSuggestion || "", post.id]
  );
}

async function updatePostSupervisorSuggestion(id, supervisorSuggestion) {
  await query(
    "UPDATE posts SET supervisor_suggestion = ? WHERE id = ?",
    [supervisorSuggestion || "", id]
  );
}

async function updatePostMetrics(id, metrics) {
  await query(
    "UPDATE posts SET likes = ?, comments = ?, favorites = ?, metrics_updated_at = ? WHERE id = ?",
    [metrics.likes, metrics.comments, metrics.favorites, metrics.metricsUpdatedAt || null, id]
  );
}

async function deletePost(id) {
  await query("DELETE FROM posts WHERE id = ?", [id]);
}

async function listLeads() {
  const rows = await query("SELECT * FROM leads ORDER BY created_at DESC");
  return rows.map(mapLead);
}

async function listLeadsByEmployee(employeeId) {
  const rows = await query(
    "SELECT * FROM leads WHERE employee_id = ? ORDER BY created_at DESC",
    [employeeId]
  );
  return rows.map(mapLead);
}

async function createLead(lead) {
  await query(
    "INSERT INTO leads (id, employee_id, account_id, post_id, platform, contact_info, nickname, budget, major_content, ip, status, deal_amount, note, capture_image_url, sales_feedback, sales_updated_at, sales_user_name, assigned_sales_user_id, assigned_sales_user_name, process_status, add_status, intention) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [lead.id, lead.employeeId, lead.accountId, lead.postId || null, lead.platform, lead.contactInfo, lead.nickname || "", lead.budget, lead.majorContent, lead.ip || "", lead.status, lead.dealAmount || null, lead.note, lead.captureImageUrl || "", lead.salesFeedback || "", lead.salesUpdatedAt || null, lead.salesUserName || "", lead.assignedSalesUserId || null, lead.assignedSalesUserName || "", lead.processStatus || "未接", lead.addStatus || "未添加", lead.intention || null]
  );
}

async function updateLead(lead) {
  await query(
    "UPDATE leads SET account_id = ?, post_id = ?, contact_info = ?, nickname = ?, budget = ?, major_content = ?, ip = ?, status = ?, deal_amount = ?, note = ?, capture_image_url = ?, sales_feedback = ?, sales_updated_at = ?, sales_user_name = ?, assigned_sales_user_id = ?, assigned_sales_user_name = ?, process_status = ?, add_status = ?, intention = ? WHERE id = ?",
    [lead.accountId, lead.postId || null, lead.contactInfo, lead.nickname || "", lead.budget, lead.majorContent, lead.ip || "", lead.status, lead.dealAmount || null, lead.note, lead.captureImageUrl || "", lead.salesFeedback || "", lead.salesUpdatedAt || null, lead.salesUserName || "", lead.assignedSalesUserId || null, lead.assignedSalesUserName || "", lead.processStatus || "未接", lead.addStatus || "未添加", lead.intention || null, lead.id]
  );
}

async function updateLeadBoardFields(lead) {
  await query(
    "UPDATE leads SET assigned_sales_user_id = ?, assigned_sales_user_name = ?, process_status = ?, add_status = ?, intention = ? WHERE id = ?",
    [lead.assignedSalesUserId || null, lead.assignedSalesUserName || "", lead.processStatus || "未接", lead.addStatus || "未添加", lead.intention || null, lead.id]
  );
}

async function deleteLead(id) {
  await query("DELETE FROM leads WHERE id = ?", [id]);
}

async function upsertStaffUser(user) {
  const existing = await query("SELECT id FROM users WHERE employee_id = ? AND role = 'staff' LIMIT 1", [user.employeeId]);
  if (existing[0]) {
    await query("UPDATE users SET username = ?, password = ?, status = ? WHERE employee_id = ? AND role = 'staff'", [user.username, user.password, user.status, user.employeeId]);
    return;
  }
  await query(
    "INSERT INTO users (id, username, password, role, employee_id, status) VALUES (?, ?, ?, 'staff', ?, ?)",
    [user.id, user.username, user.password, user.employeeId, user.status]
  );
}

async function nextEmployeeCode() {
  const rows = await query("SELECT employee_code FROM employees ORDER BY employee_code DESC LIMIT 1");
  const max = rows[0] ? Number(String(rows[0].employee_code).replace("EMP", "")) || 0 : 0;
  return `EMP${String(max + 1).padStart(4, "0")}`;
}

async function dashboardSummary(today) {
  const [
    updatedEmployees,
    updatedAccounts,
    xhsPosts,
    douyinPosts,
    xhsMetrics,
    douyinMetrics,
    leads,
    deals
  ] = await Promise.all([
    query("SELECT COUNT(DISTINCT employee_id) AS count FROM posts WHERE published_at = ?", [today]),
    query("SELECT COUNT(DISTINCT account_id) AS count FROM posts WHERE published_at = ?", [today]),
    query("SELECT COUNT(*) AS count FROM posts WHERE published_at = ? AND platform = '小红书'", [today]),
    query("SELECT COUNT(*) AS count FROM posts WHERE published_at = ? AND platform = '抖音'", [today]),
    query("SELECT COALESCE(SUM(likes), 0) AS likes, COALESCE(SUM(comments), 0) AS comments, COALESCE(SUM(favorites), 0) AS favorites, COALESCE(SUM(CASE WHEN post_type IN ('获客贴', '营销贴') THEN traffic ELSE 0 END), 0) AS traffic FROM posts WHERE published_at = ? AND platform = '小红书'", [today]),
    query("SELECT COALESCE(SUM(likes), 0) AS likes, COALESCE(SUM(comments), 0) AS comments, COALESCE(SUM(favorites), 0) AS favorites, COALESCE(SUM(CASE WHEN post_type IN ('获客贴', '营销贴') THEN traffic ELSE 0 END), 0) AS traffic FROM posts WHERE published_at = ? AND platform = '抖音'", [today]),
    query("SELECT COUNT(*) AS count FROM leads WHERE DATE(created_at) = ?", [today]),
    query("SELECT COUNT(*) AS count FROM leads WHERE DATE(created_at) = ? AND status = '已成交'", [today])
  ]);

  const xhsLikes = Number(xhsMetrics[0].likes || 0);
  const xhsComments = Number(xhsMetrics[0].comments || 0);
  const xhsFavorites = Number(xhsMetrics[0].favorites || 0);
  const douyinLikes = Number(douyinMetrics[0].likes || 0);
  const douyinComments = Number(douyinMetrics[0].comments || 0);
  const douyinFavorites = Number(douyinMetrics[0].favorites || 0);

  return {
    updatedEmployees: Number(updatedEmployees[0].count || 0),
    updatedAccounts: Number(updatedAccounts[0].count || 0),
    xhsPosts: xhsPosts[0].count || 0,
    douyinPosts: douyinPosts[0].count || 0,
    todayLeads: Number(leads[0].count || 0),
    todayDeals: Number(deals[0].count || 0),
    douyinLikes,
    douyinComments,
    douyinFavorites,
    xhsLikes,
    xhsComments,
    xhsFavorites,
    douyinTraffic: Number(douyinMetrics[0].traffic || 0),
    xhsTraffic: Number(xhsMetrics[0].traffic || 0)
  };
}

async function postTypeDistribution(today) {
  const rows = await query(
    "SELECT post_type, COUNT(*) AS count FROM posts WHERE published_at = ? GROUP BY post_type",
    [today]
  );
  const aggregated = rows.reduce((acc, item) => {
    const type = normalizePostType(item.post_type);
    acc[type] = (acc[type] || 0) + Number(item.count || 0);
    return acc;
  }, {});
  const total = Object.values(aggregated).reduce((sum, value) => sum + Number(value || 0), 0) || 1;
  return ["素人贴", "话题贴", "获客贴"].map((type) => {
    const count = Number(aggregated[type] || 0);
    return {
      type,
      count,
      ratio: `${Math.round((count / total) * 100)}%`
    };
  });
}

async function rankingRows(today) {
  const rows = await query(
    `
      SELECT
        e.id AS employee_id,
        e.name,
        (SELECT COUNT(*) FROM accounts a WHERE a.employee_id = e.id) AS account_count,
        (SELECT COUNT(*) FROM posts p WHERE p.employee_id = e.id AND p.published_at = ?) AS today_posts,
        (SELECT COUNT(*) FROM leads l WHERE l.employee_id = e.id AND DATE(l.created_at) = ?) AS today_leads,
        (SELECT COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴', '营销贴') THEN p.traffic ELSE 0 END), 0) FROM posts p WHERE p.employee_id = e.id AND p.published_at = ?) AS today_traffic,
        (SELECT COUNT(*) FROM leads l WHERE l.employee_id = e.id AND DATE(l.created_at) = ? AND l.status = '已成交') AS today_deals
      FROM employees e
      ORDER BY e.created_at DESC
    `,
    [today, today, today, today]
  );

  return rows.map((row) => ({
    employeeId: row.employee_id,
    name: row.name,
    accountCount: Number(row.account_count || 0),
    todayPosts: Number(row.today_posts || 0),
    todayLeads: Number(row.today_leads || 0),
    todayTraffic: Number(row.today_traffic || 0),
    todayDeals: Number(row.today_deals || 0)
  }));
}

module.exports = {
  findUserByUsername,
  findUserById,
  listUsers,
  listStaffUsers,
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listAccounts,
  createAccount,
  updateAccount,
  updateAccountPostingPlan,
  deleteAccount,
  listPosts,
  listPostsByEmployee,
  findPostById,
  createPost,
  updatePost,
  updatePostSupervisorSuggestion,
  updatePostMetrics,
  deletePost,
  listLeads,
  listLeadsByEmployee,
  createLead,
  updateLead,
  updateLeadBoardFields,
  deleteLead,
  upsertStaffUser,
  nextEmployeeCode,
  dashboardSummary,
  postTypeDistribution,
  rankingRows
};
