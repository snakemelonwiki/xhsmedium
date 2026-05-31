// realtime.js — Socket.IO notification bridge
window.notificationSocket = window.notificationSocket || null;

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
  document.querySelectorAll(".js-notification-item").forEach((button) => {
    button.addEventListener("click", () => markNotificationRead(button.dataset.id));
  });
}
