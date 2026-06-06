const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data.json");
const SNAPSHOT_FILE = path.join(ROOT, "daily-snapshots.json");
const SEED_TAG = "[seed-demo]";
const TODAY = "2026-04-30";

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function makeIso(date, hour, minute) {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function buildSummary(db, date) {
  const posts = db.posts.filter((item) => item.publishedAt === date);
  const leads = db.leads.filter((item) => String(item.createdAt || "").startsWith(date));
  const deals = leads.filter((item) => item.status === "已成交");
  const douyinPosts = posts.filter((item) => item.platform === "抖音");
  const xhsPosts = posts.filter((item) => item.platform === "小红书");
  return {
    updatedEmployees: new Set(posts.map((item) => item.employeeId)).size,
    updatedAccounts: new Set(posts.map((item) => item.accountId)).size,
    douyinPosts: douyinPosts.length,
    xhsPosts: xhsPosts.length,
    todayLeads: leads.length,
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

function buildDistribution(db, date) {
  const posts = db.posts.filter((item) => item.publishedAt === date);
  const total = posts.length || 1;
  return ["获客贴"].map((type) => {
    const count = posts.filter((item) => item.postType === type).length;
    return {
      type,
      count,
      ratio: `${Math.round((count / total) * 100)}%`
    };
  });
}

function buildRankingRows(db, date) {
  return db.employees.map((employee) => {
    const employeePosts = db.posts.filter((item) => item.employeeId === employee.id && item.publishedAt === date);
    const employeeLeads = db.leads.filter((item) => item.employeeId === employee.id && String(item.createdAt || "").startsWith(date));
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
  const rows = buildRankingRows(db, date);
  const sortKeys = {
    leads: "todayLeads",
    posts: "todayPosts",
    traffic: "todayTraffic",
    deals: "todayDeals"
  };
  return Object.fromEntries(
    Object.entries(sortKeys).map(([key, field]) => [
      key,
      rows
        .slice()
        .sort((a, b) => b[field] - a[field])
        .map((item, index) => ({ rank: index + 1, ...item }))
    ])
  );
}

function enrichPost(db, post) {
  const employee = db.employees.find((item) => item.id === post.employeeId);
  const account = db.accounts.find((item) => item.id === post.accountId);
  return {
    ...post,
    employeeName: employee?.name || "",
    accountName: account?.accountName || ""
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
    captureImageUrl: lead.captureImageUrl || ""
  };
}

function rebuildSnapshots(db, snapshots, dates) {
  const bag = snapshots.snapshots || {};
  dates.forEach((date) => {
    bag[date] = {
      date,
      updatedAt: makeIso(date, 15, 30),
      summary: buildSummary(db, date),
      distribution: buildDistribution(db, date),
      rankings: buildRankings(db, date),
      postsMonitor: db.posts.filter((item) => item.publishedAt === date).map((item) => enrichPost(db, item)),
      leadsMonitor: db.leads.filter((item) => String(item.createdAt || "").startsWith(date)).map((item) => enrichLead(db, item))
    };
  });
  snapshots.snapshots = bag;
  return snapshots;
}

function main() {
  const db = readJson(DATA_FILE, {});
  const snapshots = readJson(SNAPSHOT_FILE, { snapshots: {} });

  db.posts = (db.posts || []).filter((item) => item.note !== SEED_TAG);
  db.leads = (db.leads || []).filter((item) => item.note !== SEED_TAG);
  db.notifications = (db.notifications || []).filter((item) => item.type !== "seed-demo");

  const activeEmployees = (db.employees || [])
    .filter((item) => item.status === "在职")
    .slice(-6);

  const accountPool = activeEmployees
    .map((employee) => ({
      employee,
      accounts: (db.accounts || []).filter((account) => account.employeeId === employee.id).slice(0, 4)
    }))
    .filter((item) => item.accounts.length >= 2);

  const coverPool = (db.posts || [])
    .map((item) => item.coverImageUrl)
    .filter(Boolean);

  const leadImagePool = [
    ...coverPool,
    ...(db.leads || []).map((item) => item.captureImageUrl).filter(Boolean)
  ];

  const dates = ["2026-04-24", "2026-04-25", "2026-04-26", "2026-04-27", "2026-04-28", "2026-04-29", TODAY];
  // v1.3：作品类型统一为获客贴，demo seed 也只生成获客贴以便验证运营默认口径
  const postType = "获客贴";
  const titleOptions = [
    "期刊加急见刊，有需要的来聊",
    "申博前想补一篇论文的同学可以看看",
    "主编急收稿，这几个方向最近比较稳"
  ];
  const xhsUrls = [
    "https://www.xiaohongshu.com/explore/69c63f5e0000000023021886",
    "https://www.xiaohongshu.com/explore/69cba931000000002302722d",
    "https://www.xiaohongshu.com/explore/69df62e1000000001d01dd73"
  ];
  const douyinUrls = [
    "https://www.douyin.com/note/7628510730996709797",
    "https://www.douyin.com/note/7628814607474560497",
    "https://v.douyin.com/IrE2wef2O6A/"
  ];

  const seededPosts = [];
  const seededLeads = [];

  dates.forEach((date, dateIndex) => {
    accountPool.forEach((group, employeeIndex) => {
      const accounts = group.accounts.slice(0, 2);
      accounts.forEach((account, accountIndex) => {
        const title = `${titleOptions[(dateIndex + employeeIndex) % titleOptions.length]} ${SEED_TAG}`;
        const platform = account.platform;
        const postUrl = platform === "小红书"
          ? xhsUrls[(dateIndex + accountIndex) % xhsUrls.length]
          : douyinUrls[(dateIndex + accountIndex) % douyinUrls.length];
        const coverImageUrl = coverPool[(dateIndex * 7 + employeeIndex * 3 + accountIndex) % coverPool.length] || "";
        // 获客贴专用互动/流量数值（按用户口径统一为获客贴）
        const likes = 6 + dateIndex;
        const comments = 3 + accountIndex + dateIndex;
        const favorites = 6 + dateIndex;
        const traffic = 120 + dateIndex * 25 + employeeIndex * 30 + accountIndex * 10;
        const createdHour = 2 + employeeIndex;
        const createdMinute = 10 + accountIndex * 7 + dateIndex;
        const createdAt = makeIso(date, createdHour, createdMinute);

        const post = {
          id: makeId("post"),
          employeeId: group.employee.id,
          accountId: account.id,
          platform,
          title,
          coverImageUrl,
          postUrl,
          postType,
          likes,
          comments,
          favorites,
          traffic,
          metricsUpdatedAt: createdAt,
          publishedAt: date,
          note: SEED_TAG,
          createdAt,
          updatedAt: createdAt
        };

        seededPosts.push(post);

        const shouldCreateLead = (dateIndex + employeeIndex + accountIndex) % 2 === 0;
        if (shouldCreateLead) {
          const statuses = ["新客资", "跟进中", "已成交"];
          const status = statuses[(dateIndex + employeeIndex) % statuses.length];
          const leadCreatedAt = makeIso(date, 9 + accountIndex, 18 + employeeIndex);
          seededLeads.push({
            id: makeId("lead"),
            employeeId: group.employee.id,
            accountId: account.id,
            postId: post.id,
            platform,
            contactInfo: `13${String(800000000 + dateIndex * 10000 + employeeIndex * 100 + accountIndex).padStart(9, "0")}`,
            nickname: `${group.employee.name}线索${dateIndex + 1}-${accountIndex + 1}`,
            budget: `${3000 + dateIndex * 800}`,
            majorContent: ["教育学", "医学", "材料", "管理学", "计算机"][(dateIndex + employeeIndex) % 5],
            ip: ["广东", "浙江", "上海", "江苏", "湖北", "重庆"][(employeeIndex + dateIndex) % 6],
            status,
            dealAmount: status === "已成交" ? `${6800 + dateIndex * 500}` : "",
            note: SEED_TAG,
            captureImageUrl: leadImagePool[(dateIndex * 5 + employeeIndex + accountIndex) % leadImagePool.length] || coverImageUrl,
            salesFeedback: status === "已成交" ? "已确认需求并完成签约" : status === "跟进中" ? "已加微信，正在沟通版面与见刊周期" : "",
            salesUpdatedAt: status === "新客资" ? "" : makeIso(date, 12, 30 + employeeIndex),
            salesUserName: status === "新客资" ? "" : "sales01",
            createdAt: leadCreatedAt,
            updatedAt: leadCreatedAt
          });
        }
      });
    });
  });

  db.posts = [...seededPosts, ...(db.posts || [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  db.leads = [...seededLeads, ...(db.leads || [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const noticeTimeBase = [
    makeIso(TODAY, 10, 5),
    makeIso(TODAY, 10, 20),
    makeIso(TODAY, 10, 45),
    makeIso(TODAY, 11, 10),
    makeIso(TODAY, 11, 25)
  ];
  const noticePayloads = [
    {
      title: "有新的作品录入",
      message: `${accountPool[0]?.employee.name || "运营"}刚刚录入了新的获客贴`,
      audienceRoles: ["admin", "sales", "staff"]
    },
    {
      title: "有新的客资录入",
      message: `${accountPool[1]?.employee.name || "运营"}新增了一条私域线索`,
      audienceRoles: ["admin", "sales", "staff"]
    },
    {
      title: "销售反馈了客资情况",
      message: "sales01 更新了一条客资的跟进状态",
      audienceRoles: ["admin", "staff"]
    },
    {
      title: "有新的作品录入",
      message: `${accountPool[2]?.employee.name || "运营"}补录了获客贴数据`,
      audienceRoles: ["admin", "sales", "staff"]
    },
    {
      title: "有新的客资录入",
      message: `${accountPool[3]?.employee.name || "运营"}上传了引流截图`,
      audienceRoles: ["admin", "sales", "staff"]
    }
  ];

  db.notifications = [
    ...noticePayloads.map((item, index) => ({
      id: makeId("notice"),
      type: "seed-demo",
      title: item.title,
      message: item.message,
      createdAt: noticeTimeBase[index],
      fromUserId: "",
      audienceRoles: item.audienceRoles,
      audienceEmployeeIds: [],
      excludeUserIds: [],
      readBy: []
    })),
    ...(db.notifications || [])
  ].slice(0, 300);

  const snapshotDates = Array.from(new Set([
    ...dates,
    ...Object.keys(snapshots.snapshots || {})
  ])).sort();
  rebuildSnapshots(db, snapshots, snapshotDates);

  writeJson(DATA_FILE, db);
  writeJson(SNAPSHOT_FILE, snapshots);

  console.log(JSON.stringify({
    addedPosts: seededPosts.length,
    addedLeads: seededLeads.length,
    notifications: noticePayloads.length,
    dates
  }, null, 2));
}

main();
