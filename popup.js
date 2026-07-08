// ============================================================
// popup.js — 弹出面板逻辑
// 功能：读取 background 数据，渲染会话与请求列表
// ============================================================

(function () {
  'use strict';

  // DOM 缓存
  const $ = (sel) => document.querySelector(sel);
  const sessionList = $('#sessionList');
  const clickCount = $('#clickCount');
  const requestCount = $('#requestCount');
  const btnRefresh = $('#btnRefresh');
  const btnClear = $('#btnClear');
  const btnExport = $('#btnExport');
  const showFullUrl = $('#showFullUrl');

  // 记录当前展开的会话 ID（刷新后恢复展开状态）
  let expandedSessions = new Set();

  // ------------------------------------------------------------
  // 格式化时间
  // ------------------------------------------------------------
  function formatTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // ------------------------------------------------------------
  // URL 精简：保留协议 + 域名 + 前 N 段路径，过长的路径截断
  // ------------------------------------------------------------
  function shortenUrl(url, maxSegments) {
    maxSegments = maxSegments || 4;
    try {
      const u = new URL(url);
      const pathParts = u.pathname.split('/').filter(Boolean);
      if (pathParts.length <= maxSegments) return url;
      const shortPath = '/' + pathParts.slice(0, maxSegments).join('/') + '/...';
      return u.origin + shortPath;
    } catch {
      return url; // 解析失败时返回原 URL
    }
  }
  function methodClass(method) {
    const m = (method || 'unknown').toUpperCase();
    return `method-${m}`;
  }

  // ------------------------------------------------------------
  // 获取请求类型的显示文本
  // ------------------------------------------------------------
  function typeLabel(type) {
    const map = {
      xmlhttprequest: 'XHR',
      fetch: 'Fetch',
      document: 'Doc',
      script: 'Script',
      stylesheet: 'CSS',
      image: 'Img',
      font: 'Font',
      media: 'Media',
      websocket: 'WS',
    };
    return map[type] || type || '?';
  }

  // ------------------------------------------------------------
  // 在主渲染前保存当前展开状态 和 滚动位置
  // ------------------------------------------------------------
  function saveState() {
    // 保存展开状态
    expandedSessions.clear();
    document.querySelectorAll('.session-card').forEach((card) => {
      const list = card.querySelector('.request-list');
      if (list && list.style.display !== 'none') {
        expandedSessions.add(card.dataset.id);
      }
    });
    // 保存滚动位置
    return sessionList.scrollTop;
  }

  // ------------------------------------------------------------
  // 渲染主列表
  // ------------------------------------------------------------
  function render() {
    // 在重绘前保存状态，得到滚动位置
    const savedScrollTop = saveState();

    chrome.runtime.sendMessage({ type: 'GET_SESSIONS' }, (response) => {
      if (chrome.runtime.lastError) {
        sessionList.innerHTML = `<div class="empty-state">后台服务未就绪，请刷新页面</div>`;
        return;
      }

      const sessions = response.sessions || [];
      let totalClicks = sessions.length;
      let totalRequests = sessions.reduce((sum, s) => sum + (s.requests?.length || 0), 0);

      clickCount.textContent = totalClicks;
      requestCount.textContent = totalRequests;

      if (totalClicks === 0) {
        sessionList.innerHTML = `<div class="empty-state">暂无记录，点击页面开始捕捉 ✨</div>`;
        return;
      }

      const showFull = showFullUrl.checked;
      let html = '';

      sessions.forEach((session) => {
        const reqs = session.requests || [];
        const elem = session.element || {};
        const elemLabel = elem.text
          ? `<${elem.tag.toLowerCase()}> ${escapeHtml(elem.text.slice(0, 40))}`
          : elem.id
            ? `#${elem.id}`
            : `<${elem.tag.toLowerCase()}>`;
        const timeStr = formatTime(session.clickedAt);
        const isExpired = Date.now() - session.clickedAt > 3000;
        const statusTag = isExpired ? '已完成' : '采集中...';

        // 恢复展开状态
        const isExpanded = expandedSessions.has(session.id);

        html += `<div class="session-card" data-id="${session.id}">
          <div class="session-header" data-toggle>
            <span class="session-arrow ${isExpanded ? 'open' : ''}">▶</span>
            <span class="session-tag">${escapeHtml(statusTag)}</span>
            <div class="session-info">
              <div class="session-element">${escapeHtml(elemLabel)}</div>
              <div class="session-time">${timeStr}</div>
            </div>
            <span class="session-count">${reqs.length} 个请求</span>
            <button class="session-delete" data-delete title="删除此会话">✕</button>
          </div>
          <div class="request-list" style="display:${isExpanded ? 'block' : 'none'}">
            ${reqs.length === 0
              ? '<div class="request-item" style="color:#999;font-family:inherit">等待请求中…</div>'
              : reqs.map(r => {
                  const displayUrl = showFull ? r.fullUrl : shortenUrl(r.url);
                  return `<div class="request-item">
                    <span class="request-method ${methodClass(r.method)}">${escapeHtml(r.method)}</span>
                    <button class="btn-copy" data-copy="${escapeHtml(showFull ? r.fullUrl : shortenUrl(r.url))}" title="复制 URL">📋</button>
                    <span class="request-url" title="${escapeHtml(r.fullUrl)}">${escapeHtml(displayUrl)}</span>
                    <span class="request-type">${escapeHtml(typeLabel(r.type))}</span>
                  </div>`;
                }).join('')
            }
          </div>
        </div>`;
      });

      sessionList.innerHTML = html;

      // 恢复滚动位置
      sessionList.scrollTop = savedScrollTop;

      // --- 事件绑定：展开/折叠 ---
      document.querySelectorAll('[data-toggle]').forEach((header) => {
        header.addEventListener('click', (e) => {
          // 点击删除/复制按钮不触发展开
          if (e.target.closest('[data-delete]')) return;
          if (e.target.closest('[data-copy]')) return;
          const card = header.closest('.session-card');
          const list = card.querySelector('.request-list');
          const arrow = header.querySelector('.session-arrow');
          const isOpen = list.style.display !== 'none';
          list.style.display = isOpen ? 'none' : 'block';
          arrow.classList.toggle('open', !isOpen);
        });
      });

      // --- 事件绑定：删除单条 ---
      document.querySelectorAll('[data-delete]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const card = btn.closest('.session-card');
          const sessionId = card.dataset.id;
          // 删除后也从展开记录中移除
          expandedSessions.delete(sessionId);
          chrome.runtime.sendMessage({ type: 'DELETE_SESSION', sessionId }, () => {
            render(); // 重新渲染
          });
        });
      });

      // --- 事件绑定：复制 URL ---
      document.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          copyUrl(btn);
        });
      });
    });
  }

  // ------------------------------------------------------------
  // 简单的转义，防止 XSS
  // ------------------------------------------------------------
  function escapeHtml(text) {
    if (typeof text !== 'string') return String(text || '');
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (c) => map[c]);
  }

  // ------------------------------------------------------------
  // 复制 URL 到剪贴板
  // ------------------------------------------------------------
  function copyUrl(btn) {
    const url = btn.getAttribute('data-copy') || '';
    navigator.clipboard.writeText(url).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✅';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove('copied');
      }, 1200);
    }).catch(() => {
      // 降级方案
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  }

  // ------------------------------------------------------------
  // 导出全部 URL 为文本文件
  // ------------------------------------------------------------
  function exportUrls() {
    chrome.runtime.sendMessage({ type: 'GET_SESSIONS' }, (response) => {
      if (!response || !response.sessions || response.sessions.length === 0) {
        alert('暂无数据可导出');
        return;
      }

      const sessions = response.sessions;
      const showFull = showFullUrl.checked;
      const modeLabel = showFull ? '完整 URL' : '简化 URL（已忽略 ? 后参数）';
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

      let lines = [];
      lines.push('========================================');
      lines.push('  API Tap - 接口导出报告');
      lines.push('========================================');
      lines.push(`  导出时间: ${dateStr}`);
      lines.push(`  URL 模式: ${modeLabel}`);
      lines.push(`  总计: ${sessions.length} 次点击`);
      lines.push('========================================');
      lines.push('');

      sessions.forEach((session, idx) => {
        const elem = session.element || {};
        const elemLabel = elem.text
          ? `<${elem.tag.toLowerCase()}> ${elem.text.slice(0, 40)}`
          : elem.id
            ? `#${elem.id}`
            : `<${elem.tag.toLowerCase()}>`;
        const time = new Date(session.clickedAt);
        const timeStr = `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}:${String(time.getSeconds()).padStart(2,'0')}`;
        const reqs = session.requests || [];

        lines.push('─'.repeat(56));
        lines.push(`  #${idx + 1} | ${elemLabel} | ${timeStr} | ${reqs.length} 个请求`);
        lines.push('─'.repeat(56));

        if (reqs.length === 0) {
          lines.push('  (无请求记录)');
        } else {
          reqs.forEach((r, ridx) => {
            const url = showFull ? r.fullUrl : shortenUrl(r.url);
            lines.push(`  ${String(ridx + 1).padStart(3)}. [${r.method}] ${url}`);
          });
        }
        lines.push('');
      });

      lines.push('========================================');
      const totalReqs = sessions.reduce((s, session) => s + (session.requests?.length || 0), 0);
      lines.push(`  总计: ${sessions.length} 次点击, ${totalReqs} 个请求`);
      lines.push('========================================');

      const content = lines.join('\n');
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `api-tap-export-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // ------------------------------------------------------------
  // 事件绑定
  // ------------------------------------------------------------

  // 刷新
  btnRefresh.addEventListener('click', render);

  // 导出
  btnExport.addEventListener('click', exportUrls);

  // 清空全部
  btnClear.addEventListener('click', () => {
    if (confirm('确定清空所有捕捉记录？')) {
      expandedSessions.clear();
      chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, () => render());
    }
  });

  // 切换完整 URL 模式
  showFullUrl.addEventListener('change', render);

  // ------------------------------------------------------------
  // 智能自动刷新 — 只更新活跃会话，已完成会话保持 DOM 稳定
  // ------------------------------------------------------------
  function softRefresh() {
    chrome.runtime.sendMessage({ type: 'GET_SESSIONS' }, (response) => {
      if (!response) return;
      const sessions = response.sessions || [];

      // 更新统计栏
      clickCount.textContent = sessions.length;
      requestCount.textContent = sessions.reduce((s, session) => s + (session.requests?.length || 0), 0);

      const showFull = showFullUrl.checked;

      // 遍历现有 DOM 卡片，只更新还在采集中的
      document.querySelectorAll('.session-card').forEach(card => {
        const sessionId = card.dataset.id;
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        const isExpired = Date.now() - session.clickedAt > 3000;
        const reqs = session.requests || [];

        // 更新状态标签
        const tag = card.querySelector('.session-tag');
        if (tag) tag.textContent = isExpired ? '已完成' : '采集中...';

        // 更新请求计数
        const count = card.querySelector('.session-count');
        if (count) count.textContent = `${reqs.length} 个请求`;

        if (!isExpired) {
          // 活跃会话：更新请求列表（仅当展开时）
          const list = card.querySelector('.request-list');
          if (list && list.style.display !== 'none') {
            list.innerHTML = reqs.length === 0
              ? '<div class="request-item" style="color:#999;font-family:inherit">等待请求中…</div>'
              : reqs.map(r => {
                  const displayUrl = showFull ? r.fullUrl : shortenUrl(r.url);
                  return `<div class="request-item">
                    <span class="request-method ${methodClass(r.method)}">${escapeHtml(r.method)}</span>
                    <button class="btn-copy" data-copy="${escapeHtml(showFull ? r.fullUrl : shortenUrl(r.url))}" title="复制 URL">📋</button>
                    <span class="request-url" title="${escapeHtml(r.fullUrl)}">${escapeHtml(displayUrl)}</span>
                    <span class="request-type">${escapeHtml(typeLabel(r.type))}</span>
                  </div>`;
                }).join('');
          }
        }
        // 已完成会话：不动 request-list 任何 DOM，保持绝对稳定
      });

      // 检测是否有新增会话（数据有但 DOM 没有）→ 触发全量渲染
      const existingIds = new Set();
      document.querySelectorAll('.session-card').forEach(c => existingIds.add(c.dataset.id));
      const hasNewSession = sessions.some(s => !existingIds.has(s.id));
      if (hasNewSession) render();
    });
  }

  // 自动刷新：每 2 秒智能刷新（只更新活跃会话）
  setInterval(softRefresh, 2000);

  // 初始渲染
  render();
})();
