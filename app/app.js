/* PM Viewer UI. Everything renders from the model data.js builds; nothing here writes to bot.db. */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- vocabulary (matches the bot's bot/views.py) ------------------------ */

  const VIEWS = [
    { id: 'overview', label: '개요', ico: '📊' },
    { id: 'tasks', label: '작업', ico: '✅' },
    { id: 'issues', label: '이슈', ico: '🐞' },
    { id: 'milestones', label: '마일스톤', ico: '🏁' },
    { id: 'calendar', label: '캘린더', ico: '📅' },
    { id: 'activity', label: '활동 기록', ico: '📜' },
    { id: 'worktime', label: '작업시간', ico: '🎧' },
    { id: 'vacations', label: '휴가', ico: '🌴' },
    { id: 'discussions', label: '토론', ico: '💬' },
    null,
    { id: 'settings', label: '설정', ico: '⚙️' },
  ];
  const TASK_STATUS = {
    todo: { label: '할 일', cls: '' },
    doing: { label: '진행 중', cls: 'blue' },
    done: { label: '완료', cls: 'green' },
  };
  const ISSUE_STATUS = {
    new: { label: '열림', cls: 'amber' },
    doing: { label: '진행 중', cls: 'blue' },
    resolved: { label: '해결', cls: 'green' },
    hold: { label: '보류', cls: '' },
  };
  const MS_STATUS = { open: { label: '진행 중', cls: 'blue' }, done: { label: '달성', cls: 'green' }, cancelled: { label: '취소', cls: '' } };
  const VAC_STATUS = {
    pending: { label: '승인 대기', cls: 'amber' }, approved: { label: '승인', cls: 'green' },
    rejected: { label: '반려', cls: 'red' }, cancelled: { label: '취소', cls: '' },
  };
  const DISC_STATUS = { open: { label: '진행 중', cls: 'blue' }, closed: { label: '회의록 완료', cls: 'green' } };
  const KINDS = {
    task_created: ['작업 생성', 'task'], task_status: ['상태 변경', 'task'], task_assigned: ['담당 변경', 'task'],
    task_due: ['마감 변경', 'task'], task_edited: ['작업 수정', 'task'], task_deleted: ['작업 삭제', 'task'],
    task_milestone: ['마일스톤 지정', 'task'], task_worklog: ['작업 기록', 'task'],
    issue_created: ['이슈 등록', 'issue'], issue_status: ['이슈 상태', 'issue'], issue_handoff: ['작업으로 넘김', 'issue'],
    issue_deleted: ['이슈 삭제', 'issue'],
    milestone_created: ['마일스톤 생성', 'milestone'], milestone_edited: ['마일스톤 수정', 'milestone'],
    milestone_closed: ['마일스톤 닫힘', 'milestone'],
    discussion_opened: ['토론 시작', 'discussion'], discussion_closed: ['토론 종료', 'discussion'],
    event_created: ['일정 추가', 'event'], event_cancelled: ['일정 취소', 'event'],
    github_activity: ['GitHub', 'github'],
  };
  const GROUPS = [['all', '전체'], ['task', '작업'], ['issue', '이슈'], ['milestone', '마일스톤'], ['event', '일정'],
    ['discussion', '토론'], ['github', 'GitHub'], ['other', '기타']];
  const GROUP_CLS = { task: 'blue', issue: 'amber', milestone: 'green', event: 'violet', discussion: 'violet', github: '', other: '' };
  const TIMEZONES = ['Asia/Seoul', 'Asia/Tokyo', 'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];
  const ACTIVE_VOICE_MS = 5 * 60 * 1000;
  const MAC_INSTALL = 'curl -fsSL https://raw.githubusercontent.com/Lyeol2/Discord-PM-Viewer/main/install-mac.sh | bash';

  /* ---- state --------------------------------------------------------------- */

  const S = {
    SQL: null, info: {}, settings: {}, model: null, g: null, clock: PMData.makeClock('Asia/Seoul'),
    path: null, loadedAt: null, error: null, retry: 0, update: null,
    view: 'overview', search: '',
    task: { status: 'open', who: 'all', ms: 'all', sort: 'due', mode: 'list' },
    issue: { status: 'open' },
    ms: { status: 'open' },
    cal: { month: null },
    act: { group: 'all', who: 'all', range: '7', limit: 300 },
    wt: { range: 'thisweek' },
    vac: { status: 'upcoming' },
    drawer: null,
  };

  /* ---- small helpers -------------------------------------------------------- */

  const chip = (map, key) => {
    const s = map[key] || { label: key || '?', cls: '' };
    return `<span class="chip ${s.cls}"><span class="dot"></span>${esc(s.label)}</span>`;
  };
  const mainOf = (id) => (S.g && id && S.g.links.get(id)) || id;
  function nameOf(id) {
    if (!id) return '미지정';
    const names = S.settings.names || {};
    if (names[id]) return names[id];
    const gh = S.g && S.g.github.get(id);
    if (gh) return `@${gh}`;
    return `사용자 …${String(id).slice(-4)}`;
  }
  function person(id) {
    if (!id) return '<span class="muted">미지정</span>';
    const main = mainOf(id);
    const own = (S.settings.names || {})[id];
    const alt = main !== id && !own ? ' <span class="alt">부계정</span>' : '';
    return `<span class="person" title="${esc(id)}">${esc(nameOf(own ? id : main))}${alt}</span>`;
  }
  const guildName = (id) => (S.settings.names || {})[id] || `서버 …${String(id).slice(-4)}`;
  const fmtDur = (min) => {
    const m = Math.round(min);
    const h = Math.floor(m / 60);
    return h ? `${h}시간 ${m % 60 ? `${m % 60}분` : ''}`.trim() : `${m}분`;
  };
  const plural = (n, unit) => `${n}${unit}`;
  const isOpenTask = (t) => t.status !== 'done';
  const isOver = (t) => isOpenTask(t) && t.due && t.due < new Date();
  function isSoon(t) {
    if (!isOpenTask(t) || !t.due || t.due < new Date()) return false;
    return S.clock.diffDays(S.clock.today(), S.clock.keyOf(t.due)) <= 7;
  }
  const discordUrl = (channelId) => `https://discord.com/channels/${S.g.id}/${channelId}`;
  const notionUrl = (pageId) => `https://www.notion.so/${String(pageId).replace(/-/g, '')}`;
  const ext = (url, label) => `<a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;

  function dueHtml(t, compact) {
    if (!t.due) return '<span class="muted">—</span>';
    const c = S.clock;
    const key = c.keyOf(t.due);
    const d = c.diffDays(c.today(), key);
    const text = compact ? c.md(key) : `${c.mdw(key)} ${c.time(t.due)}`;
    if (!isOpenTask(t)) return `<span class="due muted">${esc(text)}</span>`;
    if (t.due < new Date()) {
      return `<span class="due over" title="마감 지남">${esc(text)} · ${d === 0 ? '지남' : `${-d}일 지남`}</span>`;
    }
    if (d === 0) return `<span class="due soon">${esc(text)} · 오늘</span>`;
    return `<span class="due${d <= 2 ? ' soon' : ''}">${esc(text)} · D-${d}</span>`;
  }

  function ddayOf(m) {
    if (!m.due) return '';
    const d = S.clock.diffDays(S.clock.today(), S.clock.keyOf(m.due));
    if (m.status !== 'open') return '';
    if (d === 0) return '<span class="ms-dday" style="color:var(--warn)">D-day</span>';
    if (d < 0) return `<span class="ms-dday" style="color:var(--crit)">D+${-d}</span>`;
    return `<span class="ms-dday">D-${d}</span>`;
  }

  function taskRef(id) {
    const t = S.g.taskById.get(id);
    return t ? `<a href="#" data-open-task="${t.id}">#${t.id} ${esc(t.title)}</a>` : `<span class="muted">#${esc(id)} (삭제됨)</span>`;
  }
  function issueRef(id) {
    const i = S.g.issueById.get(id);
    return i ? `<a href="#" data-open-issue="${i.id}">이슈 #${i.id} ${esc(i.title)}</a>` : `<span class="muted">이슈 #${esc(id)}</span>`;
  }

  function matchesSearch(...texts) {
    const q = S.search.trim().toLowerCase();
    if (!q) return true;
    return texts.some((t) => String(t == null ? '' : t).toLowerCase().includes(q));
  }

  function seg(path, options, current) {
    return `<div class="seg">${options.map(([v, label]) =>
      `<button type="button" data-set="${path}" data-value="${esc(v)}" class="${String(current) === String(v) ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
  }
  function select(path, options, current, label) {
    return `<select class="field" data-set="${path}" aria-label="${esc(label)}">${options.map(([v, l]) =>
      `<option value="${esc(v)}"${String(current) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }
  function peopleOptions(ids) {
    const mains = [...new Set(ids.filter(Boolean).map(mainOf))];
    mains.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ko'));
    return mains.map((id) => [id, nameOf(id)]);
  }

  /* ---- derived data ----------------------------------------------------------- */

  function voiceSessions() {
    const now = Date.now();
    return S.g.voice.filter((s) => s.joined).map((s) => {
      let end = s.left;
      let active = false;
      if (!end) {
        active = !!s.seen && now - s.seen.getTime() < ACTIVE_VOICE_MS;
        end = active ? new Date(now) : (s.seen || s.joined);
      }
      return {
        user: mainOf(s.user_id), raw: s.user_id, joined: s.joined, active,
        minutes: Math.max(0, (end - s.joined) / 60000), day: S.clock.keyOf(s.joined),
      };
    });
  }

  function filteredTasks() {
    const f = S.task;
    let list = S.g.tasks.filter((t) => {
      if (f.status === 'open' && !isOpenTask(t)) return false;
      if (['todo', 'doing', 'done'].includes(f.status) && t.status !== f.status) return false;
      if (f.status === 'over' && !isOver(t)) return false;
      if (f.status === 'soon' && !isSoon(t)) return false;
      if (f.who === 'none' && t.assignee_id) return false;
      if (f.who !== 'all' && f.who !== 'none' && mainOf(t.assignee_id) !== f.who) return false;
      if (f.ms === 'none' && t.milestone_id) return false;
      if (f.ms !== 'all' && f.ms !== 'none' && String(t.milestone_id) !== String(f.ms)) return false;
      return matchesSearch(t.title, t.description, `#${t.id}`);
    });
    const far = new Date(8.64e15);
    if (f.sort === 'due') list.sort((a, b) => (a.due || far) - (b.due || far) || a.id - b.id);
    else if (f.sort === 'new') list.sort((a, b) => b.id - a.id);
    else list.sort((a, b) => a.id - b.id);
    return list;
  }

  function msProgress(m) {
    const tasks = S.g.tasks.filter((t) => String(t.milestone_id) === String(m.id));
    const done = tasks.filter((t) => t.status === 'done').length;
    const doing = tasks.filter((t) => t.status === 'doing').length;
    return { tasks, total: tasks.length, done, doing, todo: tasks.length - done - doing, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  }

  function progressBar(p) {
    if (!p.total) return '<div class="progress"></div>';
    return `<div class="progress" data-tip="완료 ${p.done} · 진행 중 ${p.doing} · 할 일 ${p.todo}">
      <span class="p-done" style="width:${(p.done / p.total) * 100}%"></span>
      <span class="p-doing" style="width:${(p.doing / p.total) * 100}%"></span></div>`;
  }

  /* ---- views ----------------------------------------------------------------- */

  function viewOverview() {
    const g = S.g;
    const c = S.clock;
    const open = g.tasks.filter(isOpenTask);
    const over = open.filter(isOver);
    const soon = open.filter(isSoon);
    const openIssues = g.issues.filter((i) => i.status === 'new' || i.status === 'doing');
    const active = voiceSessions().filter((s) => s.active);
    const today = c.today();

    const tile = (label, value, hint, goto, extra = '') =>
      `<button type="button" class="tile ${extra}" ${goto}><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></button>`;

    const urgent = [...over, ...soon].sort((a, b) => a.due - b.due).slice(0, 10);
    const upcomingMs = g.milestones.filter((m) => m.status === 'open');
    const events = g.events.filter((e) => e.starts && c.diffDays(today, c.keyOf(e.starts)) >= 0 && c.diffDays(today, c.keyOf(e.starts)) <= 14);
    const vacs = g.vacations.filter((v) => ['approved', 'pending'].includes(v.status) && v.end_date >= today && c.diffDays(today, v.start_date) <= 14);

    return `
      <div class="page-head"><h1>개요</h1><span class="sub">${esc(c.mdw(today))} 기준</span></div>
      <div class="tiles">
        ${tile('🔨 진행 중', g.tasks.filter((t) => t.status === 'doing').length, '진행 중인 작업', 'data-goto="tasks" data-task-status="doing"')}
        ${tile('📋 할 일', g.tasks.filter((t) => t.status === 'todo').length, '아직 시작 안 함', 'data-goto="tasks" data-task-status="todo"')}
        ${tile('⏰ 마감 지남', over.length, '완료 안 된 작업', 'data-goto="tasks" data-task-status="over"', over.length ? 'crit' : '')}
        ${tile('📆 7일 안 마감', soon.length, '이번 주 챙길 것', 'data-goto="tasks" data-task-status="soon"')}
        ${tile('🐞 열린 이슈', openIssues.length, `전체 ${g.issues.length}건`, 'data-goto="issues"')}
        ${tile('🎧 작업방', active.length, active.length ? active.map((s) => nameOf(s.user)).join(', ') : '지금 아무도 없음', 'data-goto="worktime"')}
      </div>
      <div class="grid two">
        <section class="card"><h2>마감 챙기기 <a class="more" href="#" data-goto="tasks" data-task-status="open">작업 전체 →</a></h2>
          ${urgent.length ? `<div class="list">${urgent.map((t) => `
            <div class="row click" data-open-task="${t.id}">
              <span class="grow"><span class="muted">#${t.id}</span> ${esc(t.title)}</span>
              ${person(t.assignee_id)} ${dueHtml(t, true)}
            </div>`).join('')}</div>` : '<div class="empty">7일 안에 마감인 작업이 없어요.</div>'}
        </section>
        <section class="card"><h2>마일스톤 <a class="more" href="#" data-view="milestones">전체 →</a></h2>
          ${upcomingMs.length ? upcomingMs.map((m) => {
            const p = msProgress(m);
            return `<div style="margin-bottom:14px">
              <div class="ms-head"><strong>${esc(m.title)}</strong><span class="muted small">${m.due ? esc(c.mdw(c.keyOf(m.due))) : ''}</span>${ddayOf(m)}</div>
              ${progressBar(p)}<div class="legend">${p.pct}% · 완료 ${p.done}/${p.total}</div></div>`;
          }).join('') : '<div class="empty">진행 중인 마일스톤이 없어요.</div>'}
        </section>
        <section class="card"><h2>다가오는 일정 <a class="more" href="#" data-view="calendar">캘린더 →</a></h2>
          ${events.length || vacs.length ? `<div class="list">
            ${vacs.map((v) => `<div class="row"><span class="time">${esc(c.md(v.start_date))}${v.end_date !== v.start_date ? `~${esc(c.md(v.end_date))}` : ''}</span>
              <span class="grow">🌴 ${person(v.user_id)} 휴가 <span class="muted">${esc(v.reason)}</span></span>${chip(VAC_STATUS, v.status)}</div>`).join('')}
            ${events.map((e) => `<div class="row"><span class="time">${esc(c.mdw(c.keyOf(e.starts)))} ${esc(c.time(e.starts))}</span>
              <span class="grow">📌 ${esc(e.title)}</span></div>`).join('')}
          </div>` : '<div class="empty">2주 안에 잡힌 일정이 없어요.</div>'}
        </section>
        <section class="card"><h2>최근 활동 <a class="more" href="#" data-view="activity">전체 →</a></h2>
          ${activityRows(g.activity.slice(0, 12), true)}
        </section>
      </div>`;
  }

  function viewTasks() {
    const g = S.g;
    const f = S.task;
    const list = filteredTasks();
    const msOptions = [['all', '마일스톤 전체'], ['none', '마일스톤 없음'], ...g.milestones.map((m) => [String(m.id), m.title])];
    const head = `
      <div class="page-head"><h1>작업</h1><span class="sub">${list.length}건${S.search ? ` · "${esc(S.search)}" 검색` : ''}</span>
        <div class="toolbar">
          ${select('task.who', [['all', '담당 전체'], ['none', '미지정'], ...peopleOptions(g.tasks.map((t) => t.assignee_id))], f.who, '담당')}
          ${select('task.ms', msOptions, f.ms, '마일스톤')}
          ${select('task.sort', [['due', '마감순'], ['id', '번호순'], ['new', '최근 만든 순']], f.sort, '정렬')}
          ${seg('task.mode', [['list', '목록'], ['board', '보드']], f.mode)}
        </div></div>
      <div style="margin-bottom:14px">${seg('task.status', [['open', '열린 작업'], ['all', '전체'], ['todo', '할 일'], ['doing', '진행 중'], ['done', '완료'], ['over', '마감 지남'], ['soon', '7일 안 마감']], f.status)}</div>`;

    if (!list.length) return `${head}<div class="card empty">조건에 맞는 작업이 없어요.</div>`;

    if (f.mode === 'board') {
      const cols = ['todo', 'doing', 'done'].map((st) => {
        const items = list.filter((t) => t.status === st);
        return `<div class="col"><h3>${chip(TASK_STATUS, st)}<span class="muted">${items.length}</span></h3>
          ${items.map((t) => `<div class="kcard" data-open-task="${t.id}"><div class="t"><span class="muted">#${t.id}</span> ${esc(t.title)}</div>
            <div class="meta">${person(t.assignee_id)}${t.due ? dueHtml(t) : ''}${t.milestone_id && g.milestoneById.get(t.milestone_id) ? `<span>🏁 ${esc(g.milestoneById.get(t.milestone_id).title)}</span>` : ''}</div></div>`).join('')
            || '<div class="muted small" style="padding:4px">없음</div>'}</div>`;
      });
      return `${head}<div class="board">${cols.join('')}</div>`;
    }

    return `${head}<div class="card table-wrap" style="padding:4px 8px"><table class="table">
      <thead><tr><th>#</th><th>제목</th><th>상태</th><th>담당</th><th>마감</th><th>마일스톤</th><th>이슈</th></tr></thead>
      <tbody>${list.map((t) => {
        const ms = t.milestone_id && g.milestoneById.get(t.milestone_id);
        return `<tr class="click${t.status === 'done' ? ' done-row' : ''}" data-open-task="${t.id}">
          <td class="id">${t.id}</td><td class="title">${esc(t.title)}</td><td>${chip(TASK_STATUS, t.status)}</td>
          <td>${person(t.assignee_id)}</td><td>${dueHtml(t)}</td>
          <td>${ms ? esc(ms.title) : '<span class="muted">—</span>'}</td>
          <td>${t.issue_id ? `<span class="chip amber">#${t.issue_id}</span>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function viewIssues() {
    const g = S.g;
    const f = S.issue;
    const list = g.issues.filter((i) => {
      if (f.status === 'open' && !(i.status === 'new' || i.status === 'doing')) return false;
      if (!['open', 'all'].includes(f.status) && i.status !== f.status) return false;
      return matchesSearch(i.title, `#${i.id}`);
    }).sort((a, b) => b.id - a.id);
    const c = S.clock;
    return `
      <div class="page-head"><h1>이슈</h1><span class="sub">${list.length}건</span>
        <div class="toolbar">${seg('issue.status', [['open', '열린 이슈'], ['all', '전체'], ['new', '열림'], ['doing', '진행 중'], ['resolved', '해결'], ['hold', '보류']], f.status)}</div></div>
      ${list.length ? `<div class="card table-wrap" style="padding:4px 8px"><table class="table">
        <thead><tr><th>#</th><th>제목</th><th>상태</th><th>올린 사람</th><th>등록</th><th>넘긴 작업</th></tr></thead>
        <tbody>${list.map((i) => {
          const linked = g.tasks.filter((t) => t.issue_id === i.id);
          return `<tr class="click" data-open-issue="${i.id}"><td class="id">${i.id}</td><td class="title">${esc(i.title)}</td>
            <td>${chip(ISSUE_STATUS, i.status)}</td><td>${person(i.author_id)}</td>
            <td class="muted">${i.created ? esc(c.md(c.keyOf(i.created))) : ''}</td>
            <td>${linked.map((t) => `<span class="chip ${TASK_STATUS[t.status] ? TASK_STATUS[t.status].cls : ''} link" data-open-task="${t.id}"><span class="dot"></span>#${t.id}</span>`).join(' ')}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<div class="card empty">조건에 맞는 이슈가 없어요.</div>'}`;
  }

  function viewMilestones() {
    const g = S.g;
    const c = S.clock;
    const list = g.milestones.filter((m) => S.ms.status === 'all' || m.status === 'open');
    return `
      <div class="page-head"><h1>마일스톤</h1><span class="sub">${list.length}개</span>
        <div class="toolbar">${seg('ms.status', [['open', '진행 중'], ['all', '전체']], S.ms.status)}</div></div>
      ${list.length ? `<div class="milestones">${list.map((m) => {
        const p = msProgress(m);
        const openTasks = p.tasks.filter(isOpenTask).sort((a, b) => (a.due || 8.64e15) - (b.due || 8.64e15));
        return `<section class="card">
          <div class="ms-head"><h3>${esc(m.title)}</h3>${chip(MS_STATUS, m.status)}${ddayOf(m)}</div>
          <div class="muted small">목표일 ${m.due ? esc(c.mdw(c.keyOf(m.due))) : '—'}${m.closed ? ` · 닫음 ${esc(c.md(c.keyOf(m.closed)))}` : ''}</div>
          ${m.description ? `<div class="ms-desc">${esc(m.description)}</div>` : '<div style="height:12px"></div>'}
          <div style="display:flex;align-items:baseline;gap:8px"><span class="ms-pct">${p.pct}%</span><span class="muted small">작업 ${p.done}/${p.total} 완료</span></div>
          ${progressBar(p)}
          <div class="legend"><span><i style="background:var(--good)"></i>완료 ${p.done}</span><span><i style="background:var(--accent)"></i>진행 중 ${p.doing}</span><span><i style="background:var(--surface-2);border:1px solid var(--border)"></i>할 일 ${p.todo}</span></div>
          ${openTasks.length ? `<div class="list" style="margin-top:10px">${openTasks.slice(0, 6).map((t) => `
            <div class="row click" data-open-task="${t.id}"><span class="grow"><span class="muted">#${t.id}</span> ${esc(t.title)}</span>${person(t.assignee_id)}</div>`).join('')}</div>` : ''}
          <div class="links">
            <button type="button" class="btn small" data-goto="tasks" data-task-ms="${m.id}">작업 ${p.total}개 보기</button>
            ${m.retro_url ? ext(m.retro_url, '회고 문서') : ''}
          </div></section>`;
      }).join('')}</div>` : '<div class="card empty">마일스톤이 없어요.</div>'}`;
  }

  function viewCalendar() {
    const g = S.g;
    const c = S.clock;
    const today = c.today();
    const month = S.cal.month || today.slice(0, 7);
    const first = `${month}-01`;
    const items = new Map();
    const add = (key, item) => { if (!items.has(key)) items.set(key, []); items.get(key).push(item); };

    for (const m of g.milestones) if (m.due) add(c.keyOf(m.due), { order: 0, cls: 'ms', text: `🏁 ${m.title}`, tip: `마일스톤: ${m.title}` });
    for (const v of g.vacations) {
      if (!['approved', 'pending'].includes(v.status)) continue;
      const span = Math.min(c.diffDays(v.start_date, v.end_date), 60);
      for (let i = 0; i <= span; i++) {
        add(c.addDays(v.start_date, i), {
          order: 1, cls: `vac${v.status === 'pending' ? ' pending' : ''}`, text: `🌴 ${nameOf(mainOf(v.user_id))}`,
          tip: `${nameOf(mainOf(v.user_id))} 휴가 (${VAC_STATUS[v.status].label})\n${v.reason}`,
        });
      }
    }
    for (const e of g.events) if (e.starts) add(c.keyOf(e.starts), { order: 2, cls: 'event', text: `${c.time(e.starts)} ${e.title}`, tip: `일정: ${e.title}\n${c.full(e.starts)}` });
    for (const t of g.tasks) {
      if (!t.due) continue;
      add(c.keyOf(t.due), {
        order: 3, cls: `task${t.status === 'done' ? ' done' : isOver(t) ? ' over' : ''} click`, task: t.id,
        text: `#${t.id} ${t.title}`, tip: `#${t.id} ${t.title}\n${TASK_STATUS[t.status] ? TASK_STATUS[t.status].label : t.status} · ${nameOf(mainOf(t.assignee_id))} · ${c.time(t.due)} 마감`,
      });
    }

    let day = c.addDays(first, -c.weekday(first));
    const cells = [];
    do {
      for (let i = 0; i < 7; i++) {
        const list = (items.get(day) || []).sort((a, b) => a.order - b.order);
        const wd = c.weekday(day);
        const shown = list.slice(0, 5);
        cells.push(`<div class="day${day.slice(0, 7) !== month ? ' out' : ''}${day === today ? ' today' : ''}${wd === 0 ? ' sun' : wd === 6 ? ' sat' : ''}">
          <div class="dnum">${Number(day.slice(8))}</div>
          ${shown.map((it) => `<div class="ev ${it.cls}" data-tip="${esc(it.tip)}"${it.task ? ` data-open-task="${it.task}"` : ''}>${esc(it.text)}</div>`).join('')}
          ${list.length > 5 ? `<div class="more" data-tip="${esc(list.slice(5).map((it) => it.text).join('\n'))}">+${list.length - 5}개 더</div>` : ''}
        </div>`);
        day = c.addDays(day, 1);
      }
    } while (day.slice(0, 7) === month);

    const [y, mo] = month.split('-').map(Number);
    return `
      <div class="page-head"><h1>${y}년 ${mo}월</h1>
        <div class="toolbar">
          <div class="legend" style="margin:0 8px 0 0"><span><i style="background:var(--good)"></i>마일스톤</span><span><i style="background:var(--warn)"></i>휴가</span><span><i style="background:var(--violet)"></i>일정</span><span><i style="background:var(--accent)"></i>작업 마감</span></div>
          <button type="button" class="btn" data-action="cal-prev" aria-label="이전 달">◀</button>
          <button type="button" class="btn" data-action="cal-today">오늘</button>
          <button type="button" class="btn" data-action="cal-next" aria-label="다음 달">▶</button>
        </div></div>
      <div class="cal">${c.dow.map((d, i) => `<div class="dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${d}</div>`).join('')}${cells.join('')}</div>`;
  }

  function activityRows(rows, compact) {
    if (!rows.length) return '<div class="empty">기록이 없어요.</div>';
    const c = S.clock;
    let lastDay = null;
    const out = [];
    for (const a of rows) {
      const [label, group] = KINDS[a.kind] || [a.kind, 'other'];
      const day = a.time ? c.keyOf(a.time) : '';
      if (!compact && day !== lastDay) {
        out.push(`<div class="day-head">${esc(day ? c.mdw(day) : '날짜 없음')}${day === c.today() ? ' · 오늘' : ''}</div>`);
        lastDay = day;
      }
      const ref = a.task_id ? taskRef(a.task_id) : a.issue_id ? issueRef(a.issue_id) : '';
      if (compact) {
        out.push(`<div class="row"><span class="time">${a.time ? esc(c.md(day)) + ' ' + esc(c.time(a.time)) : ''}</span>
          <span class="grow">${person(a.actor_id)} · ${ref || esc(label)} <span class="muted">${esc(a.detail || '')}</span></span></div>`);
      } else {
        out.push(`<div class="act"><span class="time">${a.time ? esc(c.time(a.time)) : ''}</span><span class="who">${person(a.actor_id)}</span>
          <span class="kind"><span class="chip ${GROUP_CLS[group] || ''}"><span class="dot"></span>${esc(label)}</span></span>
          <span class="what">${ref}${ref && a.detail ? ' · ' : ''}<span class="detail">${esc(a.detail || '')}</span></span></div>`);
      }
    }
    return compact ? `<div class="list">${out.join('')}</div>` : out.join('');
  }

  function viewActivity() {
    const g = S.g;
    const c = S.clock;
    const f = S.act;
    const today = c.today();
    const all = g.activity.filter((a) => {
      const group = (KINDS[a.kind] || [null, 'other'])[1];
      if (f.group !== 'all' && group !== f.group) return false;
      if (f.who !== 'all' && mainOf(a.actor_id) !== f.who) return false;
      if (f.range !== 'all' && a.time && c.diffDays(c.keyOf(a.time), today) >= Number(f.range)) return false;
      const t = a.task_id && g.taskById.get(a.task_id);
      return matchesSearch(a.detail, t && t.title, (KINDS[a.kind] || [a.kind])[0]);
    });
    const shown = all.slice(0, f.limit);
    return `
      <div class="page-head"><h1>활동 기록</h1><span class="sub">${all.length}건</span>
        <div class="toolbar">
          ${select('act.who', [['all', '사람 전체'], ...peopleOptions(g.activity.map((a) => a.actor_id))], f.who, '사람')}
          ${seg('act.range', [['1', '오늘'], ['7', '7일'], ['30', '30일'], ['all', '전체']], f.range)}
        </div></div>
      <div style="margin-bottom:8px">${seg('act.group', GROUPS, f.group)}</div>
      ${activityRows(shown, false)}
      ${all.length > shown.length ? `<div style="text-align:center;margin-top:16px"><button type="button" class="btn" data-action="more-activity">더 보기 (${all.length - shown.length}건 남음)</button></div>` : ''}`;
  }

  function rangeKeys(range) {
    const c = S.clock;
    const today = c.today();
    const monday = c.addDays(today, -((c.weekday(today) + 6) % 7));
    switch (range) {
      case 'thisweek': return [monday, c.addDays(monday, 6)];
      case 'lastweek': return [c.addDays(monday, -7), c.addDays(monday, -1)];
      case 'thismonth': {
        const first = `${today.slice(0, 7)}-01`;
        let last = first;
        while (c.addDays(last, 1).slice(0, 7) === first.slice(0, 7)) last = c.addDays(last, 1);
        return [first, last];
      }
      case 'last30': return [c.addDays(today, -29), today];
      default: return [null, null];
    }
  }

  function viewWorktime() {
    const c = S.clock;
    const [from, to] = rangeKeys(S.wt.range);
    const sessions = voiceSessions().filter((s) => (!from || s.day >= from) && (!to || s.day <= to));
    const people = new Map();
    for (const s of sessions) {
      if (!people.has(s.user)) people.set(s.user, { id: s.user, minutes: 0, count: 0, days: new Map() });
      const p = people.get(s.user);
      p.minutes += s.minutes;
      p.count += 1;
      p.days.set(s.day, (p.days.get(s.day) || 0) + s.minutes);
    }
    const rows = [...people.values()].sort((a, b) => b.minutes - a.minutes);
    const max = Math.max(1, ...rows.map((r) => r.minutes));
    const total = rows.reduce((n, r) => n + r.minutes, 0);
    const active = voiceSessions().filter((s) => s.active);

    let heat = '';
    if (from && to && rows.length) {
      const days = [];
      for (let d = from; d <= to; d = c.addDays(d, 1)) days.push(d);
      const cellMax = Math.max(1, ...rows.flatMap((r) => [...r.days.values()]));
      heat = `<section class="card" style="margin-top:16px"><h2>날짜별 (시간)</h2><div class="table-wrap"><table class="heat">
        <thead><tr><th class="name"></th>${days.map((d) => `<th class="small muted">${esc(c.md(d))}<br>${c.dow[c.weekday(d)]}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="name">${person(r.id)}</td>${days.map((d) => {
          const m = r.days.get(d) || 0;
          if (!m) return '<td class="cell muted">·</td>';
          const pct = Math.round(18 + (m / cellMax) * 72);
          return `<td class="cell" style="background:color-mix(in srgb, var(--bar) ${pct}%, transparent);${pct > 55 ? 'color:#fff' : ''}" data-tip="${esc(`${nameOf(r.id)} · ${c.mdw(d)}\n${fmtDur(m)}`)}">${(m / 60).toFixed(1)}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    }

    return `
      <div class="page-head"><h1>작업시간</h1><span class="sub">🎧 작업방에 있던 시간${from ? ` · ${esc(c.md(from))} ~ ${esc(c.md(to))}` : ''}</span>
        <div class="toolbar">${seg('wt.range', [['thisweek', '이번 주'], ['lastweek', '지난 주'], ['thismonth', '이번 달'], ['last30', '최근 30일'], ['all', '전체']], S.wt.range)}</div></div>
      ${active.length ? `<div class="card" style="margin-bottom:16px"><h2>지금 작업방에 있음</h2><div class="list">${active.map((s) => `
        <div class="row"><span class="grow">${person(s.raw)}</span><span class="time">${esc(c.time(s.joined))}부터 · ${esc(fmtDur(s.minutes))}</span></div>`).join('')}</div></div>` : ''}
      <section class="card"><h2>사람별 합계 <span class="muted small" style="font-weight:500">총 ${esc(fmtDur(total))}</span></h2>
        ${rows.length ? `<div class="bars">${rows.map((r) => `
          <div class="bar-row"><div>${person(r.id)}</div>
            <div class="bar-track" data-tip="${esc(`${nameOf(r.id)}\n${fmtDur(r.minutes)} · ${plural(r.count, '회')} · ${plural(r.days.size, '일')}\n하루 평균 ${fmtDur(r.minutes / Math.max(1, r.days.size))}`)}"><div class="bar-fill" style="width:${(r.minutes / max) * 100}%"></div></div>
            <div class="val">${esc(fmtDur(r.minutes))}</div></div>`).join('')}</div>` : '<div class="empty">이 기간에 작업방 기록이 없어요.</div>'}
      </section>${heat}
      <p class="muted small" style="margin-top:12px">부계정 시간은 본계정에 합쳐서 보여줘요. 하루를 넘긴 접속은 들어온 날로 셉니다.</p>`;
  }

  function viewVacations() {
    const c = S.clock;
    const today = c.today();
    const f = S.vac.status;
    const list = S.g.vacations.filter((v) => {
      if (f === 'upcoming') return v.end_date >= today && ['approved', 'pending'].includes(v.status);
      if (f === 'all') return true;
      return v.status === f;
    });
    if (f !== 'upcoming') list.sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
    return `
      <div class="page-head"><h1>휴가</h1><span class="sub">${list.length}건</span>
        <div class="toolbar">${seg('vac.status', [['upcoming', '예정·진행 중'], ['pending', '승인 대기'], ['all', '전체']], f)}</div></div>
      ${list.length ? `<div class="card table-wrap" style="padding:4px 8px"><table class="table">
        <thead><tr><th>사람</th><th>기간</th><th class="num">일수</th><th>사유</th><th>상태</th><th>처리</th></tr></thead>
        <tbody>${list.map((v) => {
          const days = c.diffDays(v.start_date, v.end_date) + 1;
          const now = v.status === 'approved' && v.start_date <= today && v.end_date >= today;
          return `<tr><td>${person(v.user_id)}${now ? ' <span class="chip green"><span class="dot"></span>휴가 중</span>' : ''}</td>
            <td>${esc(c.mdw(v.start_date))}${days > 1 ? ` ~ ${esc(c.mdw(v.end_date))}` : ''}</td><td class="num">${days}</td>
            <td>${esc(v.reason)}${v.note ? `<div class="muted small">${esc(v.note)}</div>` : ''}</td><td>${chip(VAC_STATUS, v.status)}</td>
            <td class="small">${v.decided_by ? `${person(v.decided_by)} <span class="muted">${v.decided ? esc(c.md(c.keyOf(v.decided))) : ''}</span>` : '<span class="muted">—</span>'}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<div class="card empty">해당하는 휴가가 없어요.</div>'}`;
  }

  function viewDiscussions() {
    const c = S.clock;
    const list = S.g.discussions.filter((d) => matchesSearch(d.title));
    return `
      <div class="page-head"><h1>토론</h1><span class="sub">${list.length}건</span></div>
      ${list.length ? `<div class="card table-wrap" style="padding:4px 8px"><table class="table">
        <thead><tr><th>#</th><th>제목</th><th>상태</th><th>연 사람</th><th>시작</th><th>종료</th><th></th></tr></thead>
        <tbody>${list.map((d) => `<tr><td class="id">${d.id}</td><td class="title">${esc(d.title)}</td><td>${chip(DISC_STATUS, d.status)}</td>
          <td>${person(d.opener_id)}</td><td class="muted">${d.created ? esc(c.md(c.keyOf(d.created))) : ''}</td>
          <td class="muted">${d.closed ? esc(c.md(c.keyOf(d.closed))) : '—'}</td>
          <td><div class="links" style="margin:0">${d.thread_id ? ext(discordUrl(d.thread_id), 'Discord') : ''}${d.notion_url ? ext(d.notion_url, '회의록') : ''}</div></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="card empty">토론이 없어요.</div>'}`;
  }

  function viewSettings() {
    const g = S.g;
    const c = S.clock;
    const counts = new Map();
    const bump = (id, what) => {
      if (!id) return;
      if (!counts.has(id)) counts.set(id, {});
      const o = counts.get(id);
      o[what] = (o[what] || 0) + 1;
    };
    if (g) {
      g.tasks.forEach((t) => { bump(t.assignee_id, '담당'); bump(t.creator_id, '생성'); });
      g.activity.forEach((a) => bump(a.actor_id, '활동'));
      g.voice.forEach((v) => bump(v.user_id, '작업방'));
      g.vacations.forEach((v) => bump(v.user_id, '휴가'));
      g.issues.forEach((i) => bump(i.author_id, '이슈'));
    }
    const ids = [...counts.keys()].sort((a, b) => Object.values(counts.get(b)).reduce((x, y) => x + y, 0) - Object.values(counts.get(a)).reduce((x, y) => x + y, 0));
    const names = S.settings.names || {};
    const auto = S.model && S.model.timezone;
    const u = S.update;

    return `
      <div class="page-head"><h1>설정</h1></div>
      <div class="grid">
        <section class="card"><h2>봇 DB 파일</h2>
          <div class="form-row"><code class="mono" style="flex:1;word-break:break-all">${esc(S.path || '선택 안 됨')}</code>
            <button type="button" class="btn" data-action="choose-db">다른 파일 열기</button></div>
          <p class="muted small">PM 봇 폴더의 <code>data/bot.db</code>예요 (<code>.env</code>의 <code>DATABASE_PATH</code>로 바꿨다면 그 위치). 읽기만 하고 고치지 않아요.
          ${S.info.platform !== 'browser' ? '파일이 바뀌면 자동으로 다시 읽어요.' : ''}
          ${S.loadedAt ? `마지막으로 읽은 시각 ${esc(c.full(S.loadedAt))}.` : ''}</p>
        </section>
        <section class="card"><h2>시간대</h2>
          <div class="form-row">
            <select id="tz" class="field" style="max-width:320px">
              <option value="">자동${auto ? ` (봇 설정: ${esc(auto)})` : ' (Asia/Seoul)'}</option>
              ${TIMEZONES.map((z) => `<option value="${z}"${S.settings.tz === z ? ' selected' : ''}>${z}</option>`).join('')}
            </select></div>
          <p class="muted small">마감·일정 시각과 날짜 구분을 이 시간대로 보여줘요.</p>
        </section>
        ${g ? `<section class="card"><h2>이름 붙이기</h2>
          <p class="muted small" style="margin-top:-6px">봇 DB에는 디스코드 사용자 ID만 있어서, 여기서 이름을 붙여 두면 화면에 이름으로 나와요. 이 컴퓨터에만 저장돼요.</p>
          <table class="table names"><thead><tr><th>디스코드 ID</th><th>기록</th><th style="width:40%">이름</th></tr></thead><tbody>
            <tr><td class="mono">${esc(g.id)}</td><td class="muted small">서버</td>
              <td><input class="field" data-name-id="${esc(g.id)}" value="${esc(names[g.id] || '')}" placeholder="서버 이름"></td></tr>
            ${ids.map((id) => `<tr><td class="mono">${esc(id)}${g.links.has(id) ? ` <span class="muted small">→ ${esc(nameOf(g.links.get(id)))}의 부계정</span>` : ''}</td>
              <td class="muted small">${esc(Object.entries(counts.get(id)).map(([k, v]) => `${k} ${v}`).join(' · '))}</td>
              <td><input class="field" data-name-id="${esc(id)}" value="${esc(names[id] || '')}" placeholder="${esc(g.github.get(id) ? `@${g.github.get(id)}` : '이름')}"></td></tr>`).join('')}
          </tbody></table></section>` : ''}
        <section class="card"><h2>앱 정보</h2>
          <div class="form-row"><span>버전 <strong>${esc(S.info.version || '')}</strong></span>
            ${Bridge.desktop ? '<button type="button" class="btn" data-action="check-update">업데이트 확인</button>' : ''}
            <button type="button" class="btn ghost" data-action="open-releases">릴리즈 노트</button></div>
          ${u ? `<p class="small ${u.state === 'error' ? 'muted' : ''}">${esc(updateText(u))}</p>` : ''}
        </section>
      </div>`;
  }

  function viewWelcome() {
    const desktop = Bridge.desktop;
    return `<div class="welcome">
      <div class="brand-mark">PM</div>
      <h1>PM 봇 데이터 보기</h1>
      <p>Discord PM 봇이 쌓은 작업·이슈·마일스톤·일정·활동·작업시간을 한 화면에서 정리해 봐요.<br>
      봇 폴더의 <code>data/bot.db</code> 파일을 열어 주세요${desktop ? '. 한 번 열면 기억하고, 파일이 바뀌면 자동으로 새로 읽어요.' : '.'}</p>
      ${S.error ? `<p style="color:var(--crit)">${esc(S.error)}</p>` : ''}
      <div class="actions"><button type="button" class="btn primary" data-action="choose-db">bot.db 열기</button></div>
      <p class="muted small" style="margin-top:16px">파일을 이 창에 끌어다 놓아도 돼요. 파일은 읽기만 해요.</p>
    </div>`;
  }

  /* ---- drawer ------------------------------------------------------------------ */

  function drawerTask(id) {
    const g = S.g;
    const c = S.clock;
    const t = g.taskById.get(id);
    if (!t) return '<p class="muted">삭제된 작업이에요.</p>';
    const ms = t.milestone_id && g.milestoneById.get(t.milestone_id);
    const acts = g.activity.filter((a) => a.task_id === t.id);
    return `<div class="muted small">작업 #${t.id}</div><h2>${esc(t.title)}</h2>${chip(TASK_STATUS, t.status)}
      <div class="kv">
        <span class="k">담당</span><span>${person(t.assignee_id)}</span>
        <span class="k">마감</span><span>${dueHtml(t)}</span>
        <span class="k">마일스톤</span><span>${ms ? `🏁 ${esc(ms.title)}` : '<span class="muted">—</span>'}</span>
        <span class="k">이슈</span><span>${t.issue_id ? issueRef(t.issue_id) : '<span class="muted">—</span>'}</span>
        <span class="k">만든 사람</span><span>${person(t.creator_id)}</span>
        <span class="k">만든 날</span><span>${t.created ? esc(c.full(t.created)) : ''}</span>
      </div>
      <div class="links">${t.thread_id ? ext(discordUrl(t.thread_id), 'Discord에서 보기') : ''}${t.notion_page_id ? ext(notionUrl(t.notion_page_id), '노션에서 보기') : ''}</div>
      ${t.description ? `<div class="desc">${esc(t.description)}</div>` : ''}
      <h3>활동 기록 ${acts.length}건</h3>${activityRows(acts, true)}`;
  }

  function drawerIssue(id) {
    const g = S.g;
    const c = S.clock;
    const i = g.issueById.get(id);
    if (!i) return '<p class="muted">삭제된 이슈예요.</p>';
    const linked = g.tasks.filter((t) => t.issue_id === i.id);
    const acts = g.activity.filter((a) => a.issue_id === i.id);
    return `<div class="muted small">이슈 #${i.id}</div><h2>${esc(i.title)}</h2>${chip(ISSUE_STATUS, i.status)}
      <div class="kv">
        <span class="k">올린 사람</span><span>${person(i.author_id)}</span>
        <span class="k">등록</span><span>${i.created ? esc(c.full(i.created)) : ''}</span>
      </div>
      <div class="links">${i.thread_id ? ext(discordUrl(i.thread_id), 'Discord에서 보기') : ''}</div>
      <h3>넘긴 작업 ${linked.length}개</h3>
      ${linked.length ? `<div class="list">${linked.map((t) => `<div class="row click" data-open-task="${t.id}"><span class="grow"><span class="muted">#${t.id}</span> ${esc(t.title)}</span>${chip(TASK_STATUS, t.status)}</div>`).join('')}</div>` : '<div class="empty">없음</div>'}
      <h3>활동 기록 ${acts.length}건</h3>${activityRows(acts, true)}`;
  }

  /* ---- render -------------------------------------------------------------------- */

  const RENDER = {
    overview: viewOverview, tasks: viewTasks, issues: viewIssues, milestones: viewMilestones, calendar: viewCalendar,
    activity: viewActivity, worktime: viewWorktime, vacations: viewVacations, discussions: viewDiscussions, settings: viewSettings,
  };

  function updateText(u) {
    switch (u.state) {
      case 'checking': return '업데이트 확인 중…';
      case 'none': return '최신 버전이에요.';
      case 'available': return u.manual ? `새 버전 v${u.version}이 나왔어요. 지금은 v${S.info.version}이에요.` : `새 버전 v${u.version} 내려받는 중…`;
      case 'progress': return `새 버전 내려받는 중… ${u.percent || 0}%`;
      case 'ready': return `새 버전 v${u.version} 준비 완료. 재시작하면 적용돼요.`;
      case 'error': return `업데이트 확인 실패: ${u.message || ''}`;
      default: return '';
    }
  }

  function renderUpdateBar() {
    const bar = $('#update');
    const u = S.update;
    if (!u || !['available', 'ready'].includes(u.state)) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = `<span>⬆️ ${esc(updateText(u))}</span>
      ${u.state === 'ready' ? '<button type="button" class="btn small primary" data-action="install-update">지금 재시작</button>' : ''}
      ${u.state === 'available' && u.manual ? `<button type="button" class="btn small primary" data-action="copy-install">업데이트 명령 복사</button>
        <span class="small muted" id="copy-hint">복사해서 터미널에 붙여 넣으면 업데이트돼요</span>` : ''}
      <button type="button" class="btn small ghost" data-action="dismiss-update" style="margin-left:auto">닫기</button>`;
  }

  function renderNav() {
    const g = S.g;
    const counts = g ? {
      tasks: g.tasks.filter(isOpenTask).length,
      issues: g.issues.filter((i) => i.status === 'new' || i.status === 'doing').length,
      milestones: g.milestones.filter((m) => m.status === 'open').length,
      vacations: g.vacations.filter((v) => v.status === 'pending').length || '',
      discussions: g.discussions.filter((d) => d.status === 'open').length || '',
    } : {};
    $('#nav').innerHTML = VIEWS.map((v) => (v ? `<button type="button" data-view="${v.id}" class="${S.view === v.id ? 'active' : ''}" ${!g && v.id !== 'settings' ? 'disabled' : ''}>
      <span class="ico">${v.ico}</span><span class="label">${v.label}</span><span class="count">${counts[v.id] != null ? counts[v.id] : ''}</span></button>` : '<div class="sep"></div>')).join('');
  }

  function renderTop() {
    const sel = $('#guild');
    const guilds = S.model ? S.model.guilds : [];
    sel.hidden = guilds.length < 2;
    sel.innerHTML = guilds.map((id) => `<option value="${esc(id)}"${S.g && S.g.id === id ? ' selected' : ''}>${esc(guildName(id))}</option>`).join('');
    const status = $('#status');
    status.classList.toggle('warn', !!S.error && !!S.model);
    if (S.error && S.model) status.textContent = `⚠️ 다시 읽기 실패 (${S.error}) · 이전 데이터 표시 중`;
    else if (S.loadedAt) status.textContent = `${S.path ? S.path.split(/[\\/]/).pop() : ''} · ${S.clock.time(S.loadedAt)} 갱신`;
    else status.textContent = '';
  }

  function render() {
    const main = $('#main');
    const sameView = main.dataset.view === S.view;
    const scroll = main.scrollTop;
    renderTop();
    renderNav();
    renderUpdateBar();
    if (!S.g) {
      main.innerHTML = S.view === 'settings' && S.model ? viewSettings() : viewWelcome();
      if (S.model && !S.model.guilds.length && S.view !== 'settings') {
        main.innerHTML = `<div class="welcome"><h1>데이터가 없어요</h1><p>이 파일에는 PM 봇의 작업·이슈 기록이 없어요. 봇의 <code>data/bot.db</code>가 맞는지 확인해 주세요.</p>
          <div class="actions"><button type="button" class="btn primary" data-action="choose-db">다른 파일 열기</button></div></div>`;
      }
    } else {
      main.innerHTML = RENDER[S.view]();
    }
    main.dataset.view = S.view;
    if (sameView) main.scrollTop = scroll;
    renderDrawer();
  }

  function renderDrawer() {
    const el = $('#drawer');
    if (!S.drawer || !S.g) { el.hidden = true; return; }
    el.hidden = false;
    const body = S.drawer.type === 'task' ? drawerTask(S.drawer.id) : drawerIssue(S.drawer.id);
    el.innerHTML = `<button type="button" class="btn ghost close" data-action="close-drawer" aria-label="닫기">✕</button>${body}`;
  }

  /* ---- loading ---------------------------------------------------------------------- */

  function useGuild(id) {
    S.g = id ? S.model.guild(id) : null;
    S.clock = PMData.makeClock(S.settings.tz || (S.model && S.model.timezone) || 'Asia/Seoul');
  }

  let retryTimer = null;
  async function reload() {
    clearTimeout(retryTimer);
    let res;
    try {
      res = await Bridge.readDb();
    } catch (e) {
      res = { path: S.path, error: e.message || String(e) };
    }
    if (!res) {
      S.model = null; S.g = null; S.path = null; S.error = null;
      render();
      return false;
    }
    S.path = res.path;
    if (res.error) {
      S.error = res.error;
    } else {
      try {
        S.model = PMData.load(S.SQL, res.bytes);
        S.error = null;
        S.retry = 0;
        S.loadedAt = new Date();
        const keep = S.g ? S.g.id : S.settings.guild;
        useGuild(S.model.guilds.includes(keep) ? keep : S.model.guilds[0]);
      } catch (e) {
        // The bot may have been writing the file while we read it; try again shortly and keep the old data.
        S.error = e.message || String(e);
      }
    }
    if (S.error && S.retry < 3) {
      S.retry += 1;
      retryTimer = setTimeout(reload, 1500);
    }
    if (S.error && !S.model) { S.g = null; }
    render();
    return !S.error;
  }

  let changeTimer = null;
  function scheduleReload() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(reload, 400);
  }

  function setPath(path, value) {
    const [group, key] = path.split('.');
    if (!S[group]) return;
    S[group][key] = value;
    if (path === 'task.mode') Bridge.saveSettings({ taskMode: value });
    if (group === 'act') S.act.limit = 300;
  }

  function setView(view) {
    S.view = view;
    S.drawer = null;
    Bridge.saveSettings({ view });
    render();
    $('#main').scrollTop = 0;
  }

  /* ---- events --------------------------------------------------------------------- */

  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-open-task],[data-open-issue],[data-view],[data-goto],[data-set],[data-action]');
    if (!el || el.tagName === 'SELECT') return;
    if (el.tagName === 'A' && !el.getAttribute('target')) ev.preventDefault();

    if (el.dataset.openTask) { S.drawer = { type: 'task', id: Number(el.dataset.openTask) }; renderDrawer(); return; }
    if (el.dataset.openIssue) { S.drawer = { type: 'issue', id: Number(el.dataset.openIssue) }; renderDrawer(); return; }
    if (el.dataset.view) { setView(el.dataset.view); return; }
    if (el.dataset.goto) {
      if (el.dataset.taskStatus) { S.task.status = el.dataset.taskStatus; S.task.who = 'all'; S.task.ms = 'all'; }
      if (el.dataset.taskMs) { S.task.ms = el.dataset.taskMs; S.task.status = 'all'; S.task.who = 'all'; }
      setView(el.dataset.goto);
      return;
    }
    if (el.dataset.set) { setPath(el.dataset.set, el.dataset.value); render(); return; }

    const c = S.clock;
    switch (el.dataset.action) {
      case 'close-drawer': S.drawer = null; renderDrawer(); break;
      case 'choose-db': { const p = await Bridge.chooseDb(); if (p) { S.g = null; await reload(); } break; }
      case 'cal-prev': case 'cal-next': {
        const month = S.cal.month || c.today().slice(0, 7);
        let key = `${month}-01`;
        key = el.dataset.action === 'cal-next' ? c.addDays(key, 32) : c.addDays(key, -1);
        S.cal.month = key.slice(0, 7);
        render();
        break;
      }
      case 'cal-today': S.cal.month = null; render(); break;
      case 'more-activity': S.act.limit += 300; render(); break;
      case 'check-update': S.update = { state: 'checking' }; render(); Bridge.checkUpdate(); break;
      case 'install-update': Bridge.installUpdate(); break;
      case 'open-releases': Bridge.openReleases(); break;
      case 'copy-install': {
        const hint = $('#copy-hint');
        try {
          await navigator.clipboard.writeText(MAC_INSTALL);
          if (hint) hint.textContent = '복사했어요. 터미널에 붙여 넣고 Enter를 누르세요.';
        } catch (_) {
          if (hint) hint.textContent = MAC_INSTALL;
        }
        break;
      }
      case 'dismiss-update': $('#update').hidden = true; break;
      default: break;
    }
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.matches('select[data-set]')) { setPath(el.dataset.set, el.value); render(); return; }
    if (el.id === 'guild') {
      S.drawer = null;
      useGuild(el.value);
      Bridge.saveSettings({ guild: el.value });
      render();
      return;
    }
    if (el.id === 'tz') {
      S.settings.tz = el.value || null;
      Bridge.saveSettings({ tz: S.settings.tz });
      useGuild(S.g && S.g.id);
      render();
      return;
    }
    if (el.dataset.nameId) {
      const names = Object.assign({}, S.settings.names);
      const v = el.value.trim();
      if (v) names[el.dataset.nameId] = v; else delete names[el.dataset.nameId];
      S.settings.names = names;
      Bridge.saveSettings({ names });
      renderTop();
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.target.dataset && ev.target.dataset.nameId && ev.key === 'Enter') ev.target.blur();
    if (ev.key === 'Escape' && S.drawer) { S.drawer = null; renderDrawer(); }
    if (ev.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { ev.preventDefault(); $('#search').focus(); }
  });

  $('#search').addEventListener('input', (ev) => {
    S.search = ev.target.value;
    if (!['tasks', 'issues', 'activity', 'discussions'].includes(S.view) && S.search) { S.view = 'tasks'; S.task.status = 'all'; }
    render();
  });
  $('#reload').addEventListener('click', () => { S.retry = 0; reload(); });

  // tooltips for [data-tip]
  const tip = $('#tip');
  document.addEventListener('mouseover', (ev) => {
    const el = ev.target.closest('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
  });
  document.addEventListener('mousemove', (ev) => {
    if (tip.hidden) return;
    const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    const y = ev.clientY + 18 + tip.offsetHeight > window.innerHeight ? ev.clientY - tip.offsetHeight - 10 : ev.clientY + 18;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });

  // drag and drop a bot.db onto the window
  const drop = $('#drop');
  let dragDepth = 0;
  const hasFiles = (ev) => ev.dataTransfer && [...ev.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', (ev) => { if (hasFiles(ev)) { dragDepth++; drop.hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.hidden = true; });
  window.addEventListener('dragover', (ev) => { if (hasFiles(ev)) ev.preventDefault(); });
  window.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    dragDepth = 0;
    drop.hidden = true;
    const file = ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (file) { await Bridge.dropFile(file); S.g = null; await reload(); }
  });

  Bridge.onChange(scheduleReload);
  Bridge.onUpdate((u) => { S.update = u; renderUpdateBar(); if (S.view === 'settings') render(); });
  Bridge.onMenu(async (m) => {
    if (m === 'open') { const p = await Bridge.chooseDb(); if (p) { S.g = null; await reload(); } }
    if (m === 'reload') reload();
  });

  /* ---- start ------------------------------------------------------------------------- */

  async function smokeTest() {
    // Desktop CI check: load the sample database and render every view and both drawers.
    const report = { ok: false };
    try {
      if (!S.g) throw new Error(S.error || 'no data loaded');
      for (const v of Object.keys(RENDER)) { S.view = v; render(); }
      S.task.mode = 'board'; S.view = 'tasks'; render();
      if (S.g.tasks[0]) { S.drawer = { type: 'task', id: S.g.tasks[0].id }; renderDrawer(); }
      if (S.g.issues[0]) { S.drawer = { type: 'issue', id: S.g.issues[0].id }; renderDrawer(); }
      const sample = S.g.tasks.find((t) => t.assignee_id);
      Object.assign(report, {
        ok: true, guilds: S.model.guilds.length, tasks: S.g.tasks.length, issues: S.g.issues.length,
        activity: S.g.activity.length, voice: S.g.voice.length, sampleAssignee: sample ? sample.assignee_id : null,
      });
    } catch (e) {
      report.error = e.stack || String(e);
    }
    Bridge.smokeReport(report);
  }

  async function start() {
    S.info = await Bridge.info();
    S.settings = (await Bridge.getSettings()) || {};
    if (S.settings.view && RENDER[S.settings.view]) S.view = S.settings.view;
    if (S.settings.taskMode) S.task.mode = S.settings.taskMode;
    try {
      S.SQL = await Bridge.initSql();
    } catch (e) {
      S.error = `SQLite 엔진을 불러오지 못했어요: ${e.message || e}`;
      render();
      if (S.info.smoke) Bridge.smokeReport({ ok: false, error: S.error });
      return;
    }
    await reload();
    if (S.info.smoke) smokeTest();
  }

  window.addEventListener('error', (ev) => { if (S.info.smoke) Bridge.smokeReport({ ok: false, error: String(ev.message) }); });
  start();
})();
