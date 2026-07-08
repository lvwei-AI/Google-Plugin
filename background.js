// ============================================================
// background.js — Service Worker
// 功能：监听网络请求，管理点击会话数据
// ============================================================

const COLLECTION_WINDOW_MS = 5000; // 点击后采集网络请求的时间窗口（3 秒）
let clickSessions = [];

// ------------------------------------------------------------
// 启动时恢复数据
// ------------------------------------------------------------
chrome.storage.session.get('clickSessions').then(result => {
  if (result.clickSessions) clickSessions = result.clickSessions;
});

function persist() {
  chrome.storage.session.set({ clickSessions });
}

// ------------------------------------------------------------
// 工具函数 — 判断是否为扩展内部请求
// ------------------------------------------------------------
function isInternalRequest(details) {
  if (details.tabId === -1) return true; // 后台或扩展页面请求
  const extUrl = chrome.runtime.getURL('');
  if (details.documentUrl && details.documentUrl.startsWith(extUrl)) return true;
  if (details.initiator && details.initiator.startsWith(extUrl)) return true;
  return false;
}

// 获取精简 URL（去 ? 后参数）
function simplifyUrl(url) {
  const qIndex = url.indexOf('?');
  return qIndex === -1 ? url : url.slice(0, qIndex);
}

// ------------------------------------------------------------
// 消息处理 — 来自 content script 和 popup
// ------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const now = Date.now();

  if (message.type === 'CLICK_EVENT') {
    // 来自 content script：记录点击会话
    const session = {
      id: `click_${now}_${Math.random().toString(36).slice(2, 8)}`,
      clickedAt: now,
      element: message.element || {},
      requests: [],
      tabId: sender.tab?.id ?? -1
    };
    clickSessions.unshift(session);
    // 限制最大会话数，防止内存溢出
    if (clickSessions.length > 200) clickSessions.length = 200;
    persist();
    sendResponse({ success: true });

  } else if (message.type === 'GET_SESSIONS') {
    // 来自 popup：获取所有会话
    sendResponse({ sessions: clickSessions });

  } else if (message.type === 'CLEAR_ALL') {
    // 来自 popup：清空所有记录
    clickSessions = [];
    persist();
    sendResponse({ success: true });

  } else if (message.type === 'DELETE_SESSION') {
    // 来自 popup：删除单个会话
    clickSessions = clickSessions.filter(s => s.id !== message.sessionId);
    persist();
    sendResponse({ success: true });
  }

  return true; // 保持通道开放，支持异步 sendResponse
});

// ------------------------------------------------------------
// WebRequest 监听 — 捕获所有网络请求
// ------------------------------------------------------------
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // 跳过扩展自身请求
    if (isInternalRequest(details)) return;

    const now = Date.now();

    // 找当前 tab 最近的一个活跃会话（3 秒窗口内）
    let matchedSession = null;
    for (const session of clickSessions) {
      if (session.tabId !== details.tabId) continue;
      if (session.tabId === -1) continue; // 跳过无 tab 的请求
      const elapsed = now - session.clickedAt;
      if (elapsed <= COLLECTION_WINDOW_MS) {
        matchedSession = session;
        break; // 取最近一个（unshift 保证最新在前）
      }
    }

    if (matchedSession) {
      matchedSession.requests.push({
        url: simplifyUrl(details.url),
        fullUrl: details.url,
        method: details.method || 'GET',
        type: details.type || 'unknown',
        time: now
      });
      persist();
    }
  },
  { urls: ['<all_urls>'] },
  [] // 不需要 extraInfoSpec
);
