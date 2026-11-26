/**
 * Attendance Analyser – backend (Google Apps Script web app)
 *
 * Stores everything as JSON files in one Google Drive folder:
 *   users.json             - login users (passwords salted + hashed)
 *   periods.json           - list of saved attendance periods with counts
 *   period_<start>_<end>.json - the discrepancies of one period, with solutions and ticks
 *
 * Script Properties (Project Settings -> Script Properties):
 *   ADMIN_PASSWORD   (required) password for the built-in "admin" login
 *   DRIVE_FOLDER_ID  (optional) Drive folder for the JSON files; created automatically if empty
 *   TOKEN_SECRET     (automatic) signing key for login sessions; delete it to log everyone out
 *
 * Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone.
 */

const FOLDER_NAME = 'Attendance Analyser Data';
const TOKEN_HOURS = 12;
const ROLES = ['admin', 'office', 'supervisor'];

// ---------------------------------------------------------------- entry points

function doGet() {
  return json_({ ok: true, app: 'Attendance Analyser API', time: new Date().toISOString() });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Bad request' });
  }
  try {
    const fn = ACTIONS[req.action];
    if (!fn) throw new Error('Unknown action: ' + req.action);
    const user = req.action === 'login' ? null : auth_(req.token);
    return json_(Object.assign({ ok: true }, fn(req, user) || {}));
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/** Run once from the editor to check the setup (folder + admin password). */
function setupCheck() {
  const p = props_();
  if (!p.getProperty('ADMIN_PASSWORD')) throw new Error('Add ADMIN_PASSWORD in Project Settings -> Script Properties');
  const f = folder_();
  Logger.log('OK. Data folder: ' + f.getName() + ' (' + f.getUrl() + ')');
}

// ---------------------------------------------------------------- actions

const ACTIONS = {

  login: function (req) {
    const username = clean_(req.username).toLowerCase();
    const password = String(req.password || '');
    if (!username || !password) throw new Error('Enter username and password');

    if (username === 'admin') {
      const adminPw = props_().getProperty('ADMIN_PASSWORD');
      if (!adminPw) throw new Error('Admin password not set in Script Properties');
      if (!safeEqual_(password, adminPw)) { Utilities.sleep(600); throw new Error('Wrong username or password'); }
      const u = { username: 'admin', name: 'Administrator', role: 'admin', depts: [] };
      return { token: makeToken_(u), user: u };
    }

    const users = readJson_('users.json', []);
    const rec = users.find(function (x) { return x.username === username; });
    if (!rec || !rec.active || !safeEqual_(hash_(password, rec.salt), rec.hash)) {
      Utilities.sleep(600);
      throw new Error('Wrong username or password');
    }
    const u = publicUser_(rec);
    return { token: makeToken_(u), user: u };
  },

  me: function (req, user) {
    return { user: user };
  },

  changePassword: function (req, user) {
    if (user.role === 'admin' && user.username === 'admin') {
      throw new Error('The admin password is changed in Script Properties (ADMIN_PASSWORD)');
    }
    const np = String(req.newPassword || '');
    if (np.length < 6) throw new Error('New password must be at least 6 characters');
    return withLock_(function () {
      const users = readJson_('users.json', []);
      const rec = users.find(function (x) { return x.username === user.username; });
      if (!rec || !safeEqual_(hash_(String(req.oldPassword || ''), rec.salt), rec.hash)) throw new Error('Current password is wrong');
      rec.salt = Utilities.getUuid();
      rec.hash = hash_(np, rec.salt);
      rec.updatedAt = now_();
      writeJson_('users.json', users);
      return {};
    });
  },

  // ---- users (admin only)

  listUsers: function (req, user) {
    need_(user, ['admin']);
    return { users: readJson_('users.json', []).map(publicUser_) };
  },

  saveUser: function (req, user) {
    need_(user, ['admin']);
    const u = req.user || {};
    const username = clean_(u.username).toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Username: 3-30 letters, numbers, dot, dash or underscore');
    if (username === 'admin') throw new Error('"admin" is reserved for the built-in admin login');
    if (ROLES.indexOf(u.role) < 0) throw new Error('Pick a role');
    return withLock_(function () {
      const users = readJson_('users.json', []);
      let rec = users.find(function (x) { return x.username === username; });
      if (!rec) {
        if (!u.password || String(u.password).length < 6) throw new Error('Password must be at least 6 characters');
        rec = { username: username, createdAt: now_(), createdBy: user.username };
        users.push(rec);
      }
      rec.name = clean_(u.name) || username;
      rec.role = u.role;
      rec.depts = (u.depts || []).map(clean_).filter(String);
      rec.active = u.active !== false;
      if (u.password) {
        if (String(u.password).length < 6) throw new Error('Password must be at least 6 characters');
        rec.salt = Utilities.getUuid();
        rec.hash = hash_(String(u.password), rec.salt);
      }
      rec.updatedAt = now_();
      writeJson_('users.json', users);
      return { users: users.map(publicUser_) };
    });
  },

  deleteUser: function (req, user) {
    need_(user, ['admin']);
    const username = clean_(req.username).toLowerCase();
    return withLock_(function () {
      const users = readJson_('users.json', []).filter(function (x) { return x.username !== username; });
      writeJson_('users.json', users);
      return { users: users.map(publicUser_) };
    });
  },

  // ---- periods

  listPeriods: function (req, user) {
    const list = readJson_('periods.json', []);
    if (!limited_(user)) return { periods: list };
    // supervisors: counts for their departments only
    return {
      periods: list.map(function (p) {
        const c = { total: 0, open: 0, answered: 0, done: 0 };
        Object.keys(p.byDept || {}).forEach(function (d) {
          if (user.depts.indexOf(d) < 0) return;
          ['total', 'open', 'answered', 'done'].forEach(function (k) { c[k] += p.byDept[d][k] || 0; });
        });
        return Object.assign({}, p, { counts: c, byDept: undefined });
      })
    };
  },

  getPeriod: function (req, user) {
    const p = readJson_(periodFile_(req.id), null);
    if (!p) throw new Error('Period not found');
    if (limited_(user)) p.issues = p.issues.filter(function (i) { return user.depts.indexOf(i.department) >= 0; });
    return { period: p };
  },

  /** Save a new analysis. Re-saving the same period keeps solutions and ticks;
   *  discrepancies that are gone from the new upload are ticked automatically. */
  savePeriod: function (req, user) {
    need_(user, ['admin', 'office']);
    const inc = req.period || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inc.start) || !/^\d{4}-\d{2}-\d{2}$/.test(inc.end)) throw new Error('Period dates missing');
    if (!Array.isArray(inc.issues)) throw new Error('No discrepancies sent');
    const id = inc.start + '_' + inc.end;

    return withLock_(function () {
      const old = readJson_(periodFile_(id), null);
      const oldByKey = {};
      (old ? old.issues : []).forEach(function (i) { oldByKey[i.key] = i; });

      const seen = {};
      let added = 0, kept = 0, cleared = 0;
      const issues = inc.issues.map(function (n) {
        let key = [clean_(n.staffId), clean_(n.name).toLowerCase(), n.date || '', n.cat].join('|');
        seen[key] = (seen[key] || 0) + 1;
        if (seen[key] > 1) key += '#' + seen[key];
        const prev = oldByKey[key];
        const base = {
          key: key, name: clean_(n.name), staffId: clean_(n.staffId), department: clean_(n.department),
          date: n.date || '', cat: n.cat, issue: clean_(n.issue), action: clean_(n.action),
          auto: n.status === 'Auto-Resolved'
        };
        if (prev) {
          kept++;
          delete oldByKey[key];
          return Object.assign({}, prev, base, { id: prev.id });
        }
        added++;
        const item = Object.assign(base, {
          id: Utilities.getUuid().slice(0, 13),
          status: 'open', solution: '', log: [{ t: now_(), by: user.username, what: 'flagged' }]
        });
        if (base.auto) {   // absent the whole period -> "not in company", needs no answer
          item.status = 'done'; item.doneBy = 'auto'; item.doneAt = now_();
          item.solution = 'Not in company (auto)';
        }
        return item;
      });

      // left over: no longer in the attendance data -> fixed in Pagarbook
      Object.keys(oldByKey).forEach(function (k) {
        const i = oldByKey[k];
        if (i.status !== 'done') {
          cleared++;
          i.status = 'done';
          i.doneBy = 'auto';
          i.doneAt = now_();
          i.log = (i.log || []).concat([{ t: now_(), by: user.username, what: 'cleared - not in new upload' }]);
        }
        i.gone = true;
        issues.push(i);
      });

      const period = {
        id: id, start: inc.start, end: inc.end,
        label: clean_(inc.label) || id,
        sources: inc.sources || [],
        checks: inc.checks || [],
        staffCount: inc.staffCount || 0,
        createdAt: old ? old.createdAt : now_(),
        createdBy: old ? old.createdBy : user.username,
        updatedAt: now_(), updatedBy: user.username,
        uploads: (old ? old.uploads || [] : []).concat([{ t: now_(), by: user.username, sources: inc.sources || [] }]),
        issues: issues
      };
      writeJson_(periodFile_(id), period);
      updateIndex_(period);
      return { id: id, added: added, kept: kept, cleared: cleared };
    });
  },

  /** Enter / change a solution, tick as rectified in Pagarbook, or untick. */
  updateIssue: function (req, user) {
    return withLock_(function () {
      const period = readJson_(periodFile_(req.periodId), null);
      if (!period) throw new Error('Period not found');
      const i = period.issues.find(function (x) { return x.id === req.issueId; });
      if (!i) throw new Error('Discrepancy not found');
      if (limited_(user) && user.depts.indexOf(i.department) < 0) throw new Error('Not your department');
      const log = i.log || (i.log = []);

      if (req.solution !== undefined) {
        if (i.status === 'done' && user.role === 'supervisor') throw new Error('Already rectified');
        const s = clean_(req.solution).slice(0, 500);
        i.solution = s;
        i.solutionBy = user.username;
        i.solutionAt = now_();
        if (i.status !== 'done') i.status = s ? 'answered' : 'open';
        log.push({ t: now_(), by: user.username, what: s ? 'solution: ' + s : 'solution cleared' });
      }
      if (req.done !== undefined) {
        need_(user, ['admin', 'office']);
        if (req.done) {
          if (!i.solution && !i.auto) throw new Error('Enter the solution before ticking');
          i.status = 'done';
          i.doneBy = user.username;
          i.doneAt = now_();
          log.push({ t: now_(), by: user.username, what: 'rectified in Pagarbook' });
        } else {
          i.status = i.solution ? 'answered' : 'open';
          i.doneBy = ''; i.doneAt = '';
          log.push({ t: now_(), by: user.username, what: 'unticked' });
        }
      }
      period.updatedAt = now_();
      period.updatedBy = user.username;
      writeJson_(periodFile_(period.id), period);
      updateIndex_(period);
      return { issue: i };
    });
  },

  deletePeriod: function (req, user) {
    need_(user, ['admin']);
    return withLock_(function () {
      const it = folder_().getFilesByName(periodFile_(req.id));
      while (it.hasNext()) it.next().setTrashed(true);
      const list = readJson_('periods.json', []).filter(function (p) { return p.id !== req.id; });
      writeJson_('periods.json', list);
      return { periods: list };
    });
  }
};

// ---------------------------------------------------------------- helpers

function updateIndex_(period) {
  const counts = { total: 0, open: 0, answered: 0, done: 0 };
  const byDept = {};
  period.issues.forEach(function (i) {
    const d = byDept[i.department] || (byDept[i.department] = { total: 0, open: 0, answered: 0, done: 0 });
    counts.total++; d.total++;
    counts[i.status]++; d[i.status]++;
  });
  const list = readJson_('periods.json', []).filter(function (p) { return p.id !== period.id; });
  list.push({
    id: period.id, label: period.label, start: period.start, end: period.end,
    sources: period.sources, updatedAt: period.updatedAt, updatedBy: period.updatedBy,
    counts: counts, byDept: byDept
  });
  list.sort(function (a, b) { return a.start < b.start ? 1 : a.start > b.start ? -1 : 0; });
  writeJson_('periods.json', list);
}

function periodFile_(id) {
  if (!/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(String(id))) throw new Error('Bad period id');
  return 'period_' + id + '.json';
}

function props_() { return PropertiesService.getScriptProperties(); }

function folder_() {
  const p = props_();
  const id = p.getProperty('DRIVE_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* fall through and create */ }
  }
  const f = DriveApp.createFolder(FOLDER_NAME);
  p.setProperty('DRIVE_FOLDER_ID', f.getId());
  return f;
}

function readJson_(name, fallback) {
  const it = folder_().getFilesByName(name);
  if (!it.hasNext()) return fallback;
  const text = it.next().getBlob().getDataAsString();
  return text ? JSON.parse(text) : fallback;
}

function writeJson_(name, data) {
  const f = folder_();
  const it = f.getFilesByName(name);
  const text = JSON.stringify(data);
  if (it.hasNext()) it.next().setContent(text);
  else f.createFile(name, text, 'application/json');
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Server busy, try again');
  try { return fn(); } finally { lock.releaseLock(); }
}

function secret_() {
  const p = props_();
  let s = p.getProperty('TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); }
  return s;
}

function makeToken_(u) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify({ u: u.username, exp: Date.now() + TOKEN_HOURS * 3600 * 1000 }));
  return body + '.' + sign_(body);
}

function sign_(body) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret_()));
}

function auth_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !safeEqual_(sign_(parts[0]), parts[1])) throw new Error('LOGIN_REQUIRED');
  const data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (!data.exp || data.exp < Date.now()) throw new Error('LOGIN_REQUIRED');
  if (data.u === 'admin') return { username: 'admin', name: 'Administrator', role: 'admin', depts: [] };
  const rec = readJson_('users.json', []).find(function (x) { return x.username === data.u; });
  if (!rec || !rec.active) throw new Error('LOGIN_REQUIRED');
  return publicUser_(rec);
}

function need_(user, roles) {
  if (roles.indexOf(user.role) < 0) throw new Error('You do not have permission for this');
}

/** Supervisors with departments set only see those departments. */
function limited_(user) {
  return user.role === 'supervisor' && user.depts && user.depts.length > 0;
}

function publicUser_(r) {
  return { username: r.username, name: r.name || r.username, role: r.role, depts: r.depts || [], active: r.active !== false,
           createdAt: r.createdAt || '', updatedAt: r.updatedAt || '' };
}

function hash_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function clean_(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function now_() { return new Date().toISOString(); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
