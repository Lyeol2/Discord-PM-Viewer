/* Reads the PM bot's SQLite file (Discord-PM-Public, bot/db.py) into plain objects.
 *
 * - Discord ids (snowflakes) are larger than 2^53, so they are read as text; as JS numbers they'd be wrong.
 * - Times are stored as UTC 'YYYY-MM-DDTHH:MM:SSZ'; vacation days are local 'YYYY-MM-DD'.
 * - Tables or columns an older bot version doesn't have yet come back empty instead of failing.
 */
(function () {
  'use strict';

  const SNOWFLAKE = new Set([
    'guild_id', 'assignee_id', 'creator_id', 'thread_id', 'card_message_id', 'channel_id', 'actor_id',
    'author_id', 'opener_id', 'user_id', 'decided_by', 'message_id', 'alt_id', 'main_id', 'created_by',
  ]);
  const TABLES = ['tasks', 'issues', 'milestones', 'events', 'activity', 'discussions', 'vacations',
    'voice_sessions', 'account_links', 'guild_config', 'bot_config'];

  function columns(db, table) {
    const res = db.exec(`PRAGMA table_info("${table}")`);
    return res.length ? res[0].values.map((v) => v[1]) : [];
  }

  function readTable(db, table) {
    const cols = columns(db, table);
    if (!cols.length) return [];
    const select = cols.map((c) => (SNOWFLAKE.has(c) ? `CAST("${c}" AS TEXT) AS "${c}"` : `"${c}"`)).join(', ');
    const stmt = db.prepare(`SELECT ${select} FROM "${table}"`);
    const rows = [];
    try {
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return rows;
  }

  function parseTime(value) {
    if (value == null || value === '') return null;
    let s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00Z';
    else if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = s.replace(' ', 'T') + 'Z';
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function stripNumber(title) {
    return String(title || '').replace(/^#\d+\s+/, '');
  }

  function byGuild(rows) {
    const out = new Map();
    for (const row of rows) {
      const g = row.guild_id || '';
      if (!out.has(g)) out.set(g, []);
      out.get(g).push(row);
    }
    return out;
  }

  /** bytes (Uint8Array of bot.db) -> model */
  function load(SQL, bytes) {
    const db = new SQL.Database(bytes);
    try {
      const raw = {};
      for (const t of TABLES) raw[t] = readTable(db, t);

      for (const t of raw.tasks) {
        t.title = stripNumber(t.title);
        t.due = parseTime(t.due_at);
        t.created = parseTime(t.created_at);
      }
      for (const i of raw.issues) { i.title = stripNumber(i.title); i.created = parseTime(i.created_at); }
      for (const m of raw.milestones) {
        m.due = parseTime(m.due_at); m.created = parseTime(m.created_at); m.closed = parseTime(m.closed_at);
      }
      for (const e of raw.events) { e.starts = parseTime(e.starts_at); }
      for (const a of raw.activity) { a.time = parseTime(a.at); }
      for (const d of raw.discussions) { d.created = parseTime(d.created_at); d.closed = parseTime(d.closed_at); }
      for (const v of raw.vacations) { v.created = parseTime(v.created_at); v.decided = parseTime(v.decided_at); }
      for (const s of raw.voice_sessions) {
        s.joined = parseTime(s.joined_at); s.left = parseTime(s.left_at); s.seen = parseTime(s.last_seen);
      }

      const botConfig = Object.fromEntries(raw.bot_config.map((r) => [r.key, r.value]));
      const grouped = {};
      for (const t of TABLES) if (raw[t].length && 'guild_id' in raw[t][0]) grouped[t] = byGuild(raw[t]);

      const guildIds = new Set();
      for (const t of Object.keys(grouped)) for (const g of grouped[t].keys()) if (g) guildIds.add(g);
      const weight = (g) => ['tasks', 'activity', 'issues'].reduce((n, t) => n + ((grouped[t] && grouped[t].get(g)) || []).length, 0);
      const guilds = [...guildIds].sort((a, b) => weight(b) - weight(a));

      function guild(id) {
        const get = (t) => (grouped[t] && grouped[t].get(id)) || [];
        const config = Object.fromEntries(get('guild_config').map((r) => [r.key, r.value]));
        const links = new Map(get('account_links').map((l) => [l.alt_id, l.main_id]));
        const tasks = get('tasks').sort((a, b) => a.id - b.id);
        const issues = get('issues').sort((a, b) => a.id - b.id);
        const milestones = get('milestones').sort((a, b) => (a.due || 0) - (b.due || 0));
        return {
          id,
          config,
          links,
          tasks,
          issues,
          milestones,
          events: get('events').sort((a, b) => (a.starts || 0) - (b.starts || 0)),
          activity: get('activity').sort((a, b) => (b.time || 0) - (a.time || 0) || b.id - a.id),
          discussions: get('discussions').sort((a, b) => b.id - a.id),
          vacations: get('vacations').sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))),
          voice: get('voice_sessions'),
          taskById: new Map(tasks.map((t) => [t.id, t])),
          issueById: new Map(issues.map((i) => [i.id, i])),
          milestoneById: new Map(milestones.map((m) => [m.id, m])),
          github: parsePeople(config.GITHUB_PEOPLE),
        };
      }

      return { guilds, guild, timezone: botConfig.BOT_TIMEZONE || null };
    } finally {
      db.close();
    }
  }

  /** 'login=discordId,login2=id2' -> Map(discordId -> login) */
  function parsePeople(value) {
    const out = new Map();
    for (const part of String(value || '').split(',')) {
      const [login, id] = part.split('=').map((s) => (s || '').trim());
      if (login && /^\d+$/.test(id)) out.set(id, login);
    }
    return out;
  }

  /* ---- time in the bot's time zone ---------------------------------------- */

  const formatters = new Map();
  function formatter(tz) {
    if (!formatters.has(tz)) {
      formatters.set(tz, new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23',
      }));
    }
    return formatters.get(tz);
  }

  function makeClock(tz) {
    const zone = (() => {
      try { formatter(tz).format(new Date()); return tz; } catch (_) { return 'Asia/Seoul'; }
    })();
    const parts = (d) => {
      const o = {};
      for (const p of formatter(zone).formatToParts(d)) o[p.type] = p.value;
      return o;
    };
    const keyOf = (d) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
    const keyDate = (key) => new Date(`${key}T00:00:00Z`);
    const addDays = (key, n) => { const d = keyDate(key); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const diffDays = (a, b) => Math.round((keyDate(b) - keyDate(a)) / 86400000);
    const weekday = (key) => keyDate(key).getUTCDay(); // 0 = Sunday
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    return {
      zone,
      keyOf,
      addDays,
      diffDays,
      weekday,
      today: () => keyOf(new Date()),
      time: (d) => { const p = parts(d); return `${p.hour}:${p.minute}`; },
      md: (key) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`,
      mdw: (key) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))} (${DOW[weekday(key)]})`,
      full: (d) => { const p = parts(d); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; },
      dow: DOW,
    };
  }

  window.PMData = { load, parseTime, makeClock };
})();
