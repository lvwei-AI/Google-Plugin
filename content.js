// ============================================================
// content.js — 内容脚本
// 功能：捕获页面点击事件，通知 background
// ============================================================

(function () {
  'use strict';

  // 防抖：同一元素 500ms 内不重复发送
  let lastClickedTarget = null;
  let lastClickedTime = 0;

  document.addEventListener('click', (event) => {
    const target = event.target;
    const now = Date.now();

    // 简单防抖
    if (target === lastClickedTarget && now - lastClickedTime < 500) return;
    lastClickedTarget = target;
    lastClickedTime = now;

    // 提取元素关键信息
    const element = {
      tag: target.tagName || '',
      id: target.id || '',
      classes: Array.from(target.classList || []),
      text: (target.textContent || '').trim().slice(0, 60),
      href: target.href || (target.closest?.('a')?.href) || ''
    };

    // 发送到 background
    chrome.runtime.sendMessage({ type: 'CLICK_EVENT', element }).catch(() => {
      // service worker 可能尚未就绪，静默忽略
    });
  }, true); // capture 阶段监听，确保先于页面脚本

})();
