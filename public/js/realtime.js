// realtime.js — Socket.IO notification bridge
window.notificationSocket = window.notificationSocket || null;

// 9 个领域事件 + supervisor.suggestion —— 与后端 NOTIFICATION_TO_EVENT 对齐。
// 前端 listener 会按事件名做定向刷新（refresh 函数可缺失，缺失时静默忽略）。
const DOMAIN_EVENT_NAMES = [
  "lead.assigned",
  "collaboration.requested",
  "lead.customer_not_passed",
  "collaboration.handled",
  "lead.added_success",
  "order.created",
  "order.updated",
  "order.abnormal",
  "export.finished",
  "lead.deal_done",
  "supervisor.suggestion"
];

function initNotificationSocket() {
  if (!state.user?.id || typeof io !== "function") return;
  if (window.notificationSocket) {
    window.notificationSocket.disconnect();
    window.notificationSocket = null;
  }
  const wsPort = window.location.port === "3002" || window.location.port === "3003"
    ? "8090"
    : (window.location.port === "3000" || window.location.port === "3001" ? "8089" : window.location.port);
  const socketOrigin = `${window.location.protocol}//${window.location.hostname}${wsPort ? `:${wsPort}` : ""}`;
  const notificationSocket = io(`${socketOrigin}/notifications`, {
    auth: { userId: state.user.id },
    query: { userId: state.user.id },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  window.notificationSocket = notificationSocket;

  notificationSocket.on("connect", () => {
    notificationSocket.emit("notification.subscribe", { userId: state.user.id });
  });

	  notificationSocket.on("notification.created", (item) => {
	    if (!item) return;
	    state.notifications = [item, ...(state.notifications || []).filter((row) => row.id !== item.id)].slice(0, 30);
	    state.unreadNotificationCount = Number(state.unreadNotificationCount || 0) + 1;
	    refreshNotificationPanelDom();
	  });

  // 9 个领域事件 + supervisor.suggestion —— 命中后复用通用通道的合并与刷新逻辑。
  DOMAIN_EVENT_NAMES.forEach((evt) => {
    notificationSocket.on(evt, (payload) => {
      if (!payload) return;
      // 1) 通知列表合并 + 未读数 +1
      mergeIncomingNotification(payload);
      state.unreadNotificationCount = Number(state.unreadNotificationCount || 0) + 1;
      // 2) 按事件名做定向刷新
      if (typeof handleDomainEvent === "function") {
        try { handleDomainEvent(evt, payload); } catch (_e) { /* 静默 */ }
      }
      // 3) 顶部 toast（payload.title/content 是后端 Notification.title/content）
      try {
        if (typeof setFlash === "function") {
          setFlash("info", payload.title || evt, payload.content || payload.message || "");
        }
      } catch (_e) { /* 静默 */ }
      refreshNotificationPanelDom();
    });
  });
	}

function closeNotificationSocket() {
  if (!window.notificationSocket) return;
  window.notificationSocket.disconnect();
	window.notificationSocket = null;
}

function refreshNotificationPanelDom() {
  const container = document.querySelector(".workspace-actions");
  if (!container || typeof renderNotificationPanel !== "function") return;
  container.outerHTML = renderNotificationPanel();
  document.getElementById("notificationToggleBtn")?.addEventListener("click", () => {
    state.notificationPanelOpen = !state.notificationPanelOpen;
    refreshNotificationPanelDom();
  });
  document.getElementById("notificationCloseBtn")?.addEventListener("click", () => {
    state.notificationPanelOpen = false;
    refreshNotificationPanelDom();
  });
  document.getElementById("notificationMarkAllReadBtn")?.addEventListener("click", () => {
    if (typeof markAllNotificationsRead === "function") markAllNotificationsRead();
  });
  document.querySelectorAll(".js-notification-item").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      const notif = (state.notifications || []).find((n) => n.id === id);
      if (notif && typeof handleNotificationClick === "function") {
        handleNotificationClick(notif);
      } else if (id) {
        markNotificationRead(id);
      }
    });
  });
}
