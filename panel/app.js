"use strict";
const API = "https://security-bot-production-2c03.up.railway.app";
const PATREON_URL = "";   // קישור ה-Patreon של כפתור השדרוג. אם השרת מחזיר upgrade_url הוא קודם.

/* ───────── עזרים ───────── */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mk = w => ({get: k => { try { return w().getItem(k); } catch { return null; } }, set: (k, v) => { try { w().setItem(k, v); } catch {} }, del: k => { try { w().removeItem(k); } catch {} }});
const ss = mk(() => sessionStorage), ls = mk(() => localStorage);
const UI_LANGS = ["he", "en", "ru", "es", "fr", "de", "pt", "tr", "it", "pl", "uk", "id", "hi"];
// עברית ואנגלית מובנות כאן. שאר השפות: הפאנל רץ באנגלית ומתורגם דרך i18n.js (window.SG_TR)
let uiLang = UI_LANGS.includes(ls.get("sg_lang")) ? ls.get("sg_lang") : "en";
let lang = uiLang === "he" ? "he" : "en";
let theme = ls.get("sg_theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
let token = ss.get("t"), role = ss.get("r"), G = null, gid = null, view = "ov", W = null, forcedPw = false, tmpPw = "";
const VALS = {}, PK = {}, DIRTY = new Set();
const lines = s => s.split("\n").map(x => x.trim()).filter(Boolean);
const locTag = () => uiLang === "he" ? "he-IL" : uiLang === "en" ? "en-GB" : uiLang;
const fmt = ts => ts ? new Date(ts * 1000).toLocaleString(locTag()) : "—";
const TRL = () => (lang === "en" && window.SG_TR && window.SG_TR[uiLang]) || null;
const t = k => { const v = (I18N[lang] && I18N[lang][k]) ?? I18N.he[k] ?? k; const L = TRL(); return (L && typeof v === "string" && L[v]) || v; };
/* תרגום טקסטים שלא עוברים דרך t() (שמות הגדרות, הסברים, אפשרויות, המלצות): מתרגמים את הטקסט כשהוא מגיע ל-DOM */
const TR_SET = new WeakMap();
function trText(v, L) {
  const s = v.trim(); if (!s) return v;
  if (L[s]) return v.replace(s, L[s]);
  const m = s.match(/^([^\p{L}\p{N}]+)(.+)$/u);           // קידומת אימוג'י/סימנים: "🛡️ Anti-Nuke"
  if (m && L[m[2].trim()]) return v.replace(m[2].trim(), L[m[2].trim()]);
  return v;
}
function trNode(n) {
  const L = TRL(); if (!L || !n) return;
  if (n.nodeType === 3) {
    const p = n.parentElement; if (!p || /^(SCRIPT|STYLE|TEXTAREA|CODE)$/.test(p.tagName)) return;
    if (TR_SET.get(n) === n.nodeValue) return;
    const r = trText(n.nodeValue, L); if (r !== n.nodeValue) { n.nodeValue = r; TR_SET.set(n, r); }
    return;
  }
  if (n.nodeType !== 1) return;
  for (const el of [n, ...n.querySelectorAll("[placeholder],[title]")]) {
    for (const a of ["placeholder", "title"]) { const v = el.getAttribute && el.getAttribute(a); if (v && L[v.trim()]) el.setAttribute(a, L[v.trim()]); }
  }
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) trNode(x);
}
/* הודעות שגיאה מהשרת מגיעות בעברית: מתרגמים לאנגלית (SG_ERR) ומשם לשפה שנבחרה (SG_TR) */
function trErr(msg) {
  if (lang === "he" || typeof msg !== "string" || !msg) return msg;
  const E = window.SG_ERR || [], L = TRL();
  const fill = (en, v) => ((L && L[en]) || en).replace("{a}", v.a ?? "").replace("{b}", v.b ?? "");
  const esc_ = x => x.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  const one = (s, depth = 0) => {
    s = s.trim(); if (!s || depth > 3) return s;
    for (const [he, en] of E) if (!he.includes("{") && he === s) return fill(en, {});
    for (const [he, en] of E) {
      if (!he.includes("{")) continue;
      const m = s.match(new RegExp("^" + esc_(he).replace("{a}", "(.+?)").replace("{b}", "(.+?)") + "$"));
      if (m) return fill(en, {a: one(m[1], depth + 1), b: m[2] && one(m[2], depth + 1)});
    }
    const i = s.indexOf(": ");                       // "שדה: הודעה" - מתרגמים כל חלק
    if (i > 0) return one(s.slice(0, i), depth + 1) + ": " + one(s.slice(i + 2), depth + 1);
    return s;
  };
  return one(msg);
}
new MutationObserver(ms => { if (!TRL()) return; for (const m of ms) { if (m.type === "characterData") trNode(m.target); else m.addedNodes.forEach(trNode); } })
  .observe(document.documentElement, {childList: true, subtree: true, characterData: true});
const fl = f => f.l[lang], tt = o => o[lang];
function applyPrefs() {
  setTimeout(() => trNode(document.body)); const d = document.documentElement; d.lang = uiLang; ["bl", "bl0"].forEach(i => { const e = document.getElementById(i); if (e) e.value = uiLang; }); d.dir = lang === "he" ? "rtl" : "ltr"; d.dataset.theme = theme;
  $$("[data-i]").forEach(e => e.textContent = t(e.dataset.i)); $$("[data-ip]").forEach(e => e.placeholder = t(e.dataset.ip));
}
class ApiErr extends Error { constructor(m, status, data) { super(m); this.status = status; this.data = data; } }
async function api(path, method = "GET", body) {
  const h = {}; if (body !== undefined) h["Content-Type"] = "application/json"; if (token) h.Authorization = "Bearer " + token;
  let r;
  try { r = await fetch(API + path, {method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined}); }
  catch { throw new ApiErr(t("noConn"), 0); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { logout(); throw new ApiErr(t("sessExp"), 401); }
  if (r.status === 403 && d.must_change && token) { forcedPw = true; pwModal(true); throw new ApiErr(trErr(d.error) || "403", 403, d); }
  if (!r.ok) throw new ApiErr(trErr(d.error) || "Error " + r.status, r.status, d);
  return d;
}
async function tryApi(path, method, body) {
  try { return {ok: true, d: await api(path, method, body)}; }
  catch (e) { return {ok: false, e, unsupported: [404, 405, 501].includes(e.status) && /^(Not Found|Method Not Allowed|Not Implemented)$/i.test(e.message)}; }
}
let ttm; function toast(m) { const e = $("#toast"); e.textContent = m; e.style.display = "block"; clearTimeout(ttm); ttm = setTimeout(() => e.style.display = "none", 3800); }
function modal(html) { $("#mbox").innerHTML = html + `<div style="margin-top:16px"><button id="mx">${esc(t("close"))}</button></div>`; $("#modal").style.display = "grid"; $("#mx").onclick = closeModal; }
function closeModal() { $("#modal").style.display = "none"; $("#mbox").onclick = null; }
$("#modal").onclick = e => { if (e.target.id === "modal" && !forcedPw) closeModal(); };
const leave = () => !DIRTY.size || confirm(t("unsaved"));
function logout() { ss.del("t"); ss.del("r"); ss.del("u"); token = role = null; tmpPw = ""; forcedPw = false; DIRTY.clear(); closeModal(); show(); }
function soon(eps) { return `<div class="glass pad soon"><b>🚧 ${esc(t("soon"))}</b><div class="muted">${esc(t("soonD"))}</div>${eps ? `<div class="eps">${eps.map(e => `<code>${esc(e)}</code>`).join("")}</div>` : ""}</div>`; }
function errBox(e) { return `<div class="glass pad"><span class="bad">${esc(e.message || e)}</span></div>`; }
function download(name, text, type = "application/json") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }

/* ───────── סכמת ההגדרות ───────── */
const ACT = [["kick", "קיק", "Kick"], ["ban", "באן", "Ban"], ["timeout", "טיימאאוט 28 יום", "Timeout (28 days)"]];
const F = (k, type, he, en, o = {}) => ({k, type, l: {he, en}, ...o});
const std = (id, i, he, en, f) => ({
  id, i, l: {he, en}, f, reset: true, vals: () => (G.settings || {})[id] || {},
  save: async b => { const r = await api(`/api/guilds/${gid}/settings/${id}`, "PUT", b); G.settings = r.settings; return r.settings[id] || {}; },
  doReset: async () => { const r = await api(`/api/guilds/${gid}/settings/${id}/reset`, "POST"); if (r.settings) G.settings = r.settings; else await reloadG(); return G.settings[id] || {}; }
});
const SECS = [
  std("general", "⚙️", "כללי", "General", [
    F("log_channel", "channel", "חדר לוגים (לשם יגיעו כל ההתראות)", "Log channel (all alerts go here)", {h: ["כל פעולות ההגנה והאזהרות נשלחות לחדר הזה. מומלץ חדר פרטי לצוות.", "Every protection action and warning is posted here. A staff-only channel is recommended."]}),
    F("whitelist", "ids", "וויטליסט: פטורים מכל ההגנות (Discord ID בכל שורה)", "Whitelist: exempt from all protections (one Discord ID per line)", {own: true, h: ["תן רק למי שסומכים עליו לגמרי.", "Only add people you fully trust."]})]),
  std("antinuke", "🛡️", "אנטי-ניוק", "Anti-Nuke", [
    F("nuke", "bool", "הגנת ניוק: מחיקות/יצירות/באנים המוניים עם שחזור", "Nuke protection: mass deletes/creates/bans with restore", {h: ["מזהה מי שמוחק או מבצע באנים המוניים, עוצר אותו ומשחזר.", "Detects anyone mass-deleting or mass-banning, stops them and restores."]}),
    F("botguard", "bool", "חסימה אוטומטית של בוטים לא מורשים ושל מי שהוסיף אותם", "Auto-block unauthorized bots and whoever added them", {h: ["בוט שלא ברשימת המורשים נבעט.", "Bots that are not on the allowed list are removed."]}),
    F("templates", "bool", "מחיקת טמפלייטים של השרת", "Delete server templates", {h: ["מונע שכפול של השרת באמצעות טמפלייט.", "Prevents your server from being cloned with a template."]}),
    F("selfrole", "bool", "הסרה וטיימאאוט למי שנותן לעצמו רול", "Remove + timeout anyone who gives themselves a role"),
    F("allowed_bots", "ids", "בוטים מורשים (ID בכל שורה)", "Allowed bots (one ID per line)")]),
  std("antiraid", "🚨", "אנטי-ריידים", "Anti-Raid", [
    F("enabled", "bool", "פעיל", "Enabled"),
    F("joins", "int", "כמה כניסות מפעילות מצב ריייד", "Joins that trigger raid mode", {r: [2, 50]}),
    F("seconds", "int", "בתוך כמה שניות", "Within how many seconds", {r: [2, 120]}),
    F("action", "choice", "פעולה על הנכנסים בריייד", "Action on raiders", {opts: ACT}),
    F("min_age_days", "int", "גיל חשבון מינימלי בימים (0 = כבוי)", "Minimum account age in days (0 = off)", {r: [0, 365]}),
    F("raid_minutes", "int", "משך מצב ריייד בדקות", "Raid mode duration (minutes)", {r: [1, 60]}),
    F("raise_verification", "bool", "להעלות זמנית את רמת האימות של השרת", "Temporarily raise the server verification level"),
    F("lockdown", "bool", "לנעול את כל החדרים בזמן ריייד", "Lock all channels during a raid")]),
  std("automod", "🧹", "אוטומוד", "AutoMod", [
    F("spam", "bool", "אנטי-ספאם", "Anti-spam"), F("invites", "bool", "חסימת קישורי הזמנה", "Block invite links"), F("mentions", "bool", "תיוגים המוניים", "Mass mentions"),
    F("badwords", "bool", "מילים אסורות", "Banned words"), F("caps", "bool", "צעקות (CAPS)", "Excessive CAPS"), F("emoji", "bool", "ספאם אימוג'ים", "Emoji spam"),
    F("duplicates", "bool", "הודעות כפולות", "Duplicate messages"), F("headers", "bool", "כותרות גדולות (# טקסט)", "Large headers (# text)"),
    F("spam_count", "int", "ספאם: כמה הודעות", "Spam: how many messages", {r: [3, 30]}), F("spam_seconds", "int", "ספאם: בתוך כמה שניות", "Spam: within how many seconds", {r: [2, 30]}),
    F("mention_limit", "int", "מקסימום תיוגים", "Max mentions", {r: [2, 30]}), F("emoji_limit", "int", "מקסימום אימוג'ים", "Max emojis", {r: [3, 50]}),
    F("caps_percent", "int", "אחוז אותיות גדולות", "Capital letters %", {r: [40, 100]}), F("duplicate_count", "int", "כמה הודעות זהות", "Identical messages", {r: [2, 10]}),
    F("strikes", "int", "אזהרות עד טיימאאוט", "Warnings before timeout", {r: [1, 10], h: ["אחרי כמה הפרות המשתמש מקבל טיימאאוט.", "How many violations before the user is timed out."]}),
    F("timeout_minutes", "int", "אורך טיימאאוט בדקות", "Timeout length (minutes)", {r: [1, 1440]}),
    F("badwords_list", "lines", "מילים אסורות (מילה בכל שורה)", "Banned words (one per line)"),
    F("exempt_channels", "chs", "חדרים פטורים", "Exempt channels"), F("exempt_roles", "rls", "רולים פטורים", "Exempt roles")]),
  std("joingate", "🚪", "שער כניסה", "Join Gate", [
    F("enabled", "bool", "פעיל", "Enabled"), F("no_avatar", "bool", "הסגר מיידי למי שאין לו תמונת פרופיל", "Instant quarantine for users without an avatar"),
    F("name_filter", "bool", "סינון שמות חשודים", "Filter suspicious names"),
    F("action", "choice", "פעולה על חשבון חשוד", "Action on suspicious accounts", {opts: [["quarantine", "הסגר", "Quarantine"], ["kick", "קיק", "Kick"], ["ban", "באן", "Ban"], ["log", "דיווח בלבד", "Log only"]]}),
    F("threshold", "int", "סף ניקוד (נמוך = מחמיר יותר)", "Score threshold (lower = stricter)", {r: [10, 200], h: ["כל חשבון מקבל ניקוד חשד. מעל הסף מתבצעת הפעולה.", "Every account gets a suspicion score; above the threshold the action runs."]}),
    F("min_age_days", "int", "חשבון חדש = פחות מכמה ימים", "New account = younger than (days)", {r: [1, 365]}),
    F("badnames", "lines", "מילים אסורות בשמות משתמשים", "Banned words in usernames"), F("allowed", "ids", "פטורים משער הכניסה (ID בכל שורה)", "Exempt from the gate (one ID per line)")]),
  std("logs", "📜", "לוגים", "Logs", [
    F("messages", "bool", "הודעות שנמחקו / נערכו", "Deleted / edited messages"), F("members", "bool", "כניסות, יציאות ושינויי רולים", "Joins, leaves and role changes"), F("server", "bool", "חדרים, רולים ובאנים", "Channels, roles and bans")]),
  std("welcome", "👋", "וולקם", "Welcome", [
    F("enabled", "bool", "פעיל", "Enabled"), F("channel_id", "channel", "חדר הוולקם", "Welcome channel"),
    F("display", "choice", "מצב תצוגה", "Display mode", {opts: [["both", "תמונה + טקסט", "Image + text"], ["image", "תמונה בלבד", "Image only"], ["text", "טקסט בלבד", "Text only"]]}),
    F("title", "text", "כותרת. משתנים: {name} {server} {count}", "Title. Variables: {name} {server} {count}", {max: 200}),
    F("description", "long", "הודעה. משתנים: {user} {name} {server} {count} {date} {created}", "Message. Variables: {user} {name} {server} {count} {date} {created}", {max: 1500}),
    F("background_url", "text0", "רקע: קישור ישיר לתמונה (ריק = ללא)", "Background: direct image link (empty = none)", {max: 400}),
    F("accent", "color", "צבע הדגשה", "Accent color"), F("name_color", "color", "צבע שם המשתמש בכרטיס", "Username color on the card"), F("text_color", "color", "צבע שאר הטקסט בכרטיס", "Other text color on the card"),
    F("border", "choice", "מסגרת", "Border", {opts: [[0, "ללא", "None"], [4, "דקה", "Thin"], [8, "בינונית", "Medium"], [14, "עבה", "Thick"]]}),
    F("ping", "bool", "לתייג את המצטרף", "Mention the new member"),
    F("delete_after", "int", "מחיקה אוטומטית אחרי כמה שניות (0 = לא)", "Auto-delete after N seconds (0 = never)", {r: [0, 3600]}),
    F("dm_text", "long", "הודעה פרטית למצטרף (ריק = כבוי)", "DM to the new member (empty = off)", {max: 1500}),
    F("autorole_id", "role", "רול אוטומטי למצטרפים (ללא רולים מסוכנים)", "Auto-role for new members (no dangerous roles)"),
    F("links", "links", "כפתורי קישור (שורה: טקסט|https://...) עד 5", "Link buttons (line: text|https://...) up to 5")])
];
const PICK = new Set(["channel", "chs", "role", "rls"]);
const fid = (d, f) => `f_${d.id}_${f.k}`;
const listFor = f => (f.type === "channel" || f.type === "chs" ? G.channels : G.roles) || [];

function normVal(f, v) {
  switch (f.type) {
    case "bool": return !!v;
    case "int": return v === "" || v == null ? null : Number(v);
    case "choice": return String(v ?? "");
    case "text": case "text0": case "long": return String(v ?? "").trim();
    case "color": return /^#[0-9a-f]{6}$/i.test(v || "") ? v.toUpperCase() : /^[0-9a-f]{6}$/i.test(v || "") ? "#" + v.toUpperCase() : "#5865F2";
    case "ids": case "lines": case "chs": case "rls": return (Array.isArray(v) ? v : []).map(String);
    case "channel": case "role": return v == null ? "" : String(v);
    case "links": return (Array.isArray(v) ? v : []).map(l => ({label: l.label, url: l.url}));
    default: return v;
  }
}
function disp(f, v) {
  if (f.type === "bool") return v ? "✔" : "✘";
  if (["ids", "lines", "chs", "rls", "links"].includes(f.type)) return (v || []).length + " " + t("items");
  if (f.type === "channel" || f.type === "role") { if (!v) return t("none"); const o = listFor(f).find(x => String(x.id) === String(v)); return (f.type === "channel" ? "#" : "@") + (o ? o.name : v); }
  if (f.type === "choice") { const o = f.opts.find(o => String(o[0]) === String(v)); return o ? o[lang === "en" ? 2 : 1] : v; }
  if (v === "" || v == null) return t("empty");
  const s = String(v); return s.length > 40 ? s.slice(0, 40) + "…" : s;
}

/* ───────── בורר חדרים / רולים עם חיפוש ───────── */
function pkHtml(id) { return `<div class="pk" id="${id}"><div class="chips"></div><input class="pf" type="search" autocomplete="off" placeholder="${esc(t("search"))}"><div class="pl" hidden></div></div>`; }
function pkInit(id, o) {
  const el = $("#" + id); if (!el) return;
  const st = PK[id] = {multi: o.multi, sel: new Set((o.sel || []).map(String))};
  const chips = $(".chips", el), pf = $(".pf", el), pl = $(".pl", el), by = new Map(o.list.map(x => [String(x.id), x]));
  const col = x => { let c = x && x.color; if (typeof c === "number") c = c ? "#" + c.toString(16).padStart(6, "0") : ""; return /^#[0-9a-f]{6}$/i.test(c || "") ? c : ""; };
  const drawChips = () => { chips.innerHTML = [...st.sel].map(i => { const x = by.get(i), c = col(x); return `<span class="chip"${c ? ` style="--c:${c}"` : ""}>${c ? '<i class="rd"></i>' : ""}${o.pre}${esc(x ? x.name : i)}<b data-x="${esc(i)}" title="${esc(t("remove"))}">×</b></span>`; }).join("") || `<span class="muted">${esc(t("none"))}</span>`; };
  const drawList = () => {
    const q = pf.value.trim().toLowerCase(); let last = null, h = "";
    if (!o.multi) h += `<div class="opt" data-id="">— ${esc(t("none"))} —</div>`;
    for (const x of o.list) {
      if (q && !String(x.name).toLowerCase().includes(q)) continue;
      const cat = x.category || ""; if (cat !== last) { if (cat) h += `<div class="grp">${esc(cat)}</div>`; last = cat; }
      const c = col(x); h += `<div class="opt${st.sel.has(String(x.id)) ? " on" : ""}" data-id="${esc(x.id)}">${c ? `<i class="rd" style="--c:${c}"></i>` : ""}${o.pre}${esc(x.name)}</div>`;
    }
    pl.innerHTML = h || `<div class="muted" style="padding:8px">${esc(t("nores"))}</div>`; pl.hidden = false;
  };
  const fire = () => { drawChips(); el.dispatchEvent(new Event("input", {bubbles: true})); };
  pf.onfocus = pf.oninput = drawList;
  pl.onmousedown = e => {
    e.preventDefault(); const op = e.target.closest(".opt"); if (!op) return; const i = op.dataset.id;
    if (o.multi) { st.sel.has(i) ? st.sel.delete(i) : st.sel.add(i); fire(); drawList(); }
    else { st.sel = new Set(i ? [i] : []); fire(); pl.hidden = true; pf.value = ""; pf.blur(); }
  };
  chips.onclick = e => { const b = e.target.closest("b[data-x]"); if (b) { st.sel.delete(b.dataset.x); fire(); } };
  drawChips();
}
document.addEventListener("mousedown", e => $$(".pl").forEach(p => { if (!p.parentElement.contains(e.target)) p.hidden = true; }));

/* ───────── שדות ───────── */
function fieldHtml(def, f) {
  const id = fid(def, f), v = (VALS[def.id] || {})[f.k], lab = esc(fl(f));
  const hint = (extra = "") => { const h = f.h ? f.h[lang === "en" ? 1 : 0] : ""; return (extra || h) ? `<div class="hint">${esc(extra)}${extra && h ? " · " : ""}${esc(h)}</div>` : ""; };
  const sk = esc((fl(f) + " " + (f.h ? f.h.join(" ") : "") + " " + f.k).toLowerCase());
  const W = (cls, inner) => `<div class="fld ${cls}" data-sk="${sk}">${inner}</div>`;
  const nv = normVal(f, v);
  switch (f.type) {
    case "bool": return W("bool", `<label class="sw"><input type="checkbox" id="${id}"${v ? " checked" : ""}><i></i></label><div><label for="${id}">${lab}</label>${hint()}</div>`);
    case "int": return W("", `<label for="${id}">${lab}</label><input type="number" id="${id}" value="${esc(v)}" min="${f.r[0]}" max="${f.r[1]}" step="1">${hint(f.r[0] + "–" + f.r[1])}`);
    case "choice": return W("", `<label for="${id}">${lab}</label><select id="${id}">${f.opts.map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(v) ? " selected" : ""}>${esc(o[lang === "en" ? 2 : 1])}</option>`).join("")}</select>${hint()}`);
    case "text": case "text0": return W("", `<label for="${id}">${lab}</label><input id="${id}" value="${esc(v)}"${f.max ? ` maxlength="${f.max}"` : ""}>${hint()}`);
    case "long": return W("", `<label for="${id}">${lab}</label><textarea id="${id}"${f.max ? ` maxlength="${f.max}"` : ""}>${esc(v)}</textarea>${hint()}`);
    case "color": return W("", `<label for="${id}">${lab}</label><input type="color" id="${id}" value="${esc(nv)}">${hint()}`);
    case "ids": case "lines": { const locked = f.own && !G.can_whitelist; return W("", `<label for="${id}">${lab}</label><textarea id="${id}"${locked ? " disabled" : ""}>${esc(nv.join("\n"))}</textarea>${locked ? `<div class="hint">${esc(t("ownerOnly"))}</div>` : hint()}`); }
    case "links": return W("", `<label for="${id}">${lab}</label><textarea id="${id}">${esc(nv.map(l => l.label + "|" + l.url).join("\n"))}</textarea>${hint()}`);
    default: return W("", `<label>${lab}</label>${pkHtml(id)}${hint()}`);
  }
}
function readField(def, f) {
  const id = fid(def, f), el = $("#" + id), L = fl(f);
  switch (f.type) {
    case "bool": return el.checked;
    case "int": { const s = el.value.trim(), n = Number(s); if (s === "" || !Number.isFinite(n)) throw new Error(t("badNum") + ": " + L); if (n < f.r[0] || n > f.r[1]) throw new Error(`"${L}": ${f.r[0]}–${f.r[1]}`); return Math.round(n); }
    case "choice": { const o = f.opts.find(o => String(o[0]) === el.value); if (!o) throw new Error(t("badChoice") + ": " + L); return o[0]; }
    case "text0": return el.value.trim() || null;
    case "text": case "long": return el.value.trim();
    case "ids": { const a = lines(el.value); if (a.some(x => !/^\d{15,22}$/.test(x))) throw new Error(t("badId") + ": " + L); return a; }
    case "lines": return lines(el.value);
    case "links": {
      const a = lines(el.value); if (a.length > 5) throw new Error(t("maxLinks"));
      return a.map(x => { const i = x.indexOf("|"), label = x.slice(0, i).trim(), url = x.slice(i + 1).trim(); if (i < 1 || !label || !/^https?:\/\/\S+$/i.test(url)) throw new Error(t("badLink") + ": " + x); return {label, url}; });
    }
    case "color": return el.value.toUpperCase();
    case "channel": case "role": return [...PK[id].sel][0] || "";
    default: return [...PK[id].sel];
  }
}
function collect(def) {
  const out = {body: {}, changes: [], errors: []};
  for (const f of def.f) {
    if (f.own && !G.can_whitelist) continue;
    const wrap = $("#" + fid(def, f))?.closest(".fld");
    let cur; try { cur = readField(def, f); } catch (e) { if (wrap && wrap.dataset.t) out.errors.push(e.message); continue; }
    const from = normVal(f, (VALS[def.id] || {})[f.k]), to = normVal(f, cur);
    if (JSON.stringify(from) !== JSON.stringify(to)) { out.body[f.k] = cur; out.changes.push({f, from, to}); }
  }
  return out;
}

/* ───────── כרטיס הגדרות (שמירה / ביטול / איפוס / diff) ───────── */
function secHtml(def, pre = "") {
  return `<form class="glass pad sec" id="sec_${def.id}" data-s="${def.id}" novalidate><h2>${def.i} ${esc(def.l[lang])}</h2>${pre}<div class="flds">${def.f.map(f => fieldHtml(def, f)).join("")}</div>
  <div class="diff" hidden></div><div class="sbar"><button class="pri" type="submit">💾 ${esc(t("save"))}</button><button type="button" data-a="revert">↩ ${esc(t("revert"))}</button>${def.reset ? `<button type="button" class="ghost" data-a="reset">⟲ ${esc(t("reset"))}</button>` : ""}<span class="dirty">● ${esc(t("dirty"))}</span></div></form>`;
}
function bindSec(def) {
  const form = $("#sec_" + def.id); if (!form) return;
  def.f.forEach(f => { if (PICK.has(f.type)) pkInit(fid(def, f), {multi: f.type === "chs" || f.type === "rls", list: listFor(f), sel: f.type === "chs" || f.type === "rls" ? ((VALS[def.id] || {})[f.k] || []) : [(VALS[def.id] || {})[f.k] ?? ""].filter(x => x !== ""), pre: f.type === "channel" || f.type === "chs" ? "#" : "@"}); });
  const on = e => { const w = e.target.closest && e.target.closest(".fld"); if (w) w.dataset.t = 1; refresh(def); };
  form.addEventListener("input", on); form.addEventListener("change", on);
  form.onsubmit = e => { e.preventDefault(); saveSec(def); };
  $('[data-a="revert"]', form).onclick = () => redrawSec(def);
  const rs = $('[data-a="reset"]', form); if (rs) rs.onclick = () => resetSec(def);
}
function redrawSec(def, pre = "") { const old = $("#sec_" + def.id); if (!old) return; old.outerHTML = secHtml(def, pre || old.dataset.pre || ""); DIRTY.delete(def.id); bindSec(def); }
function refresh(def) {
  const form = $("#sec_" + def.id); if (!form) return; const {changes} = collect(def), d = $(".diff", form);
  if (changes.length) { DIRTY.add(def.id); d.hidden = false; d.innerHTML = `<b>${esc(t("willSave"))}</b>` + changes.map(c => `<div class="df"><span>${esc(fl(c.f))}:</span><span class="from">${esc(disp(c.f, c.from))}</span> → <span class="to">${esc(disp(c.f, c.to))}</span></div>`).join(""); }
  else { DIRTY.delete(def.id); d.hidden = true; d.innerHTML = ""; }
  form.classList.toggle("isdirty", changes.length > 0);
}
async function saveSec(def) {
  const {body, changes, errors} = collect(def);
  if (errors.length) return toast("⚠️ " + errors[0]);
  if (!changes.length) return toast(t("noChanges"));
  const btn = $("#sec_" + def.id + " .pri"); btn.disabled = true;
  try {
    const before = {}; changes.forEach(c => before[c.f.k] = c.from);
    VALS[def.id] = await def.save(body); pushHist(def.id, before, body);
    redrawSec(def); toast("✅ " + t("saved"));
  } catch (e) { toast("❌ " + e.message); btn.disabled = false; }
}
async function resetSec(def) {
  if (!confirm(t("confirmReset"))) return;
  const r = await tryApi(`/api/guilds/${gid}/settings/${def.id}/reset`, "POST");
  if (r.unsupported) return toast("🚧 " + t("soon"));
  if (!r.ok) return toast("❌ " + r.e.message);
  if (r.d.settings) G.settings = r.d.settings; else await reloadG();
  VALS[def.id] = def.vals(); redrawSec(def); toast("✅ " + t("resetDone"));
}
async function reloadG() { G = await api("/api/guilds/" + gid); }
async function putSection(id, body) { const r = await api(`/api/guilds/${gid}/settings/${id}`, "PUT", body); G.settings = r.settings; return r; }

/* היסטוריה מקומית (גיבוי ל-endpoint של השרת) */
const hkey = () => "sg_hist_" + gid;
const getHist = () => { try { return JSON.parse(ls.get(hkey()) || "[]"); } catch { return []; } };
function pushHist(s, before, after) { const a = getHist(); a.unshift({ts: Math.floor(Date.now() / 1000), s, before, after}); ls.set(hkey(), JSON.stringify(a.slice(0, 40))); }

/* ───────── מסך שרתים ───────── */
async function showServers() {
  gid = null; G = null; DIRTY.clear();
  const v = $("#view"); v.innerHTML = `<div class="glass pad">${esc(t("loading"))}</div>`;
  let d; try { d = await api("/api/guilds"); } catch (e) { v.innerHTML = `<div class="glass pad"><p class="bad" style="margin-bottom:12px">${esc(e.message)}</p><button id="retry">${esc(t("retry"))}</button></div>`; $("#retry").onclick = showServers; return; }
  let inv = ""; try { inv = (await api("/api/invite")).url; } catch {}
  const add = inv ? `<a class="btn pri" href="${esc(inv)}" target="_blank" rel="noopener">➕ ${esc(t("addBot"))}</a>` : "";
  if (!d.guilds || !d.guilds.length) { v.innerHTML = `<div class="glass pad"><h2>${esc(t("noServer"))}</h2><p class="muted" style="margin-bottom:12px">${esc(t("noServerD"))}</p>${add}</div>`; return; }
  v.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h1>${esc(t("pickServer"))}</h1>${add}</div><div class="servers">` + d.guilds.map((g, i) => `<div class="glass srv" role="button" tabindex="0" data-id="${esc(g.id)}" style="animation-delay:${i * 40}ms">${g.icon ? `<img src="${esc(g.icon)}" alt="">` : `<div class="ph">${esc((g.name || "?")[0])}</div>`}<div><b>${esc(g.name)}</b><div class="muted">${Number(g.members || 0).toLocaleString()} ${esc(t("members"))}</div></div></div>`).join("") + "</div>";
  $$(".srv", v).forEach(e => { e.onclick = () => showGuild(e.dataset.id); e.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); showGuild(e.dataset.id); } }; });
}

/* ───────── מעטפת שרת ───────── */
const NAV = [["ov", "📊"], ["cfg", "⚙️"], ["live", "📡"], ["alerts", "🔔"], ["prem", "💎"], ["tools", "🧰"], ["help", "🆘"]];
async function showGuild(id, v = "ov") {
  if (!leave()) return;
  $("#view").innerHTML = `<div class="glass pad">${esc(t("loading"))}</div>`;
  try { G = await api("/api/guilds/" + id); } catch (e) { toast(e.message); return token ? showServers() : null; }
  gid = id; view = v; DIRTY.clear(); W = null;
  $("#view").innerHTML = `<div class="gshell"><nav class="glass gnav"><div class="gh"><button class="sm" id="back">${lang === "he" ? "→" : "←"} ${esc(t("back"))}</button><b style="margin-top:8px">${esc(G.name)}</b></div>${NAV.map(([k, i]) => `<button class="nv${k === view ? " on" : ""}" data-v="${k}">${i} <span>${esc(t("nav_" + k))}</span></button>`).join("")}</nav><section id="gc"></section></div>`;
  $("#back").onclick = () => { if (leave()) showServers(); };
  $$(".nv").forEach(b => b.onclick = () => go(b.dataset.v));
  renderView();
}
function go(v) { if (v !== view && !leave()) return; DIRTY.clear(); view = v; W = null; $$(".nv").forEach(b => b.classList.toggle("on", b.dataset.v === v)); renderView(); }
async function renderView() {
  const c = $("#gc"); if (!c) return; c.innerHTML = `<div class="glass pad">${esc(t("loading"))}</div>`;
  try { await ({ov: rOverview, cfg: rSettings, live: rLive, alerts: rAlerts, prem: rPremium, tools: rTools, help: rHelp})[view](c); } catch (e) { c.innerHTML = errBox(e); }
}

/* ───────── סקירה: ציון אבטחה, המלצות, פריסטים ───────── */
const PRESETS = {
  calm: {antinuke: {nuke: true, botguard: true, templates: false, selfrole: false}, antiraid: {enabled: true, joins: 20, seconds: 30, action: "timeout", min_age_days: 0, raid_minutes: 5, raise_verification: false, lockdown: false},
    automod: {spam: true, invites: true, mentions: true, badwords: false, caps: false, emoji: false, duplicates: false, headers: false, spam_count: 8, spam_seconds: 5, mention_limit: 10, emoji_limit: 30, caps_percent: 90, duplicate_count: 5, strikes: 5, timeout_minutes: 5}},
  balanced: {antinuke: {nuke: true, botguard: true, templates: true, selfrole: true}, antiraid: {enabled: true, joins: 10, seconds: 20, action: "kick", min_age_days: 3, raid_minutes: 10, raise_verification: true, lockdown: false},
    automod: {spam: true, invites: true, mentions: true, badwords: true, caps: true, emoji: true, duplicates: true, headers: false, spam_count: 5, spam_seconds: 5, mention_limit: 5, emoji_limit: 15, caps_percent: 70, duplicate_count: 3, strikes: 3, timeout_minutes: 10}},
  strict: {antinuke: {nuke: true, botguard: true, templates: true, selfrole: true}, antiraid: {enabled: true, joins: 5, seconds: 15, action: "ban", min_age_days: 14, raid_minutes: 30, raise_verification: true, lockdown: true},
    automod: {spam: true, invites: true, mentions: true, badwords: true, caps: true, emoji: true, duplicates: true, headers: true, spam_count: 4, spam_seconds: 4, mention_limit: 3, emoji_limit: 8, caps_percent: 55, duplicate_count: 2, strikes: 2, timeout_minutes: 60}}
};
function score() {
  const s = G.settings || {}, a = s.antinuke || {}, r = s.antiraid || {}, m = s.automod || {}, j = s.joingate || {}, l = s.logs || {}, g = s.general || {};
  const C = [
    {w: 10, ok: !!g.log_channel, he: "הגדר חדר לוגים כדי לקבל התראות", en: "Set a log channel to receive alerts", go: "general"},
    {w: 20, ok: !!a.nuke, he: "הפעל הגנת ניוק", en: "Enable nuke protection", fix: ["antinuke", {nuke: true}]},
    {w: 10, ok: !!a.botguard, he: "הפעל חסימת בוטים לא מורשים", en: "Enable unauthorized-bot blocking", fix: ["antinuke", {botguard: true}]},
    {w: 5, ok: !!a.selfrole, he: "הפעל הגנה מרול עצמי", en: "Enable self-role protection", fix: ["antinuke", {selfrole: true}]},
    {w: 5, ok: !!a.templates, he: "הפעל מחיקת טמפלייטים", en: "Enable template deletion", fix: ["antinuke", {templates: true}]},
    {w: 15, ok: !!r.enabled, he: "הפעל אנטי-ריידים", en: "Enable anti-raid", fix: ["antiraid", {enabled: true}]},
    {w: 5, ok: (r.min_age_days || 0) > 0, he: "דרוש גיל חשבון מינימלי בריידים", en: "Require a minimum account age during raids", fix: ["antiraid", {min_age_days: 3}]},
    {w: 5, ok: !!m.spam, he: "הפעל אנטי-ספאם", en: "Enable anti-spam", fix: ["automod", {spam: true}]},
    {w: 5, ok: !!m.invites, he: "חסום קישורי הזמנה", en: "Block invite links", fix: ["automod", {invites: true}]},
    {w: 5, ok: !!m.mentions, he: "הגבל תיוגים המוניים", en: "Limit mass mentions", fix: ["automod", {mentions: true}]},
    {w: 10, ok: !!j.enabled, he: "הפעל שער כניסה", en: "Enable the join gate", fix: ["joingate", {enabled: true}]},
    {w: 5, ok: !!(l.messages && l.members && l.server), he: "הפעל את כל סוגי הלוגים", en: "Enable all log types", fix: ["logs", {messages: true, members: true, server: true}]}
  ];
  const tot = C.reduce((x, c) => x + c.w, 0), got = C.filter(c => c.ok).reduce((x, c) => x + c.w, 0);
  return {pct: Math.round(got / tot * 100), C};
}
async function rOverview(c) {
  const st = G.stats || {}, sc = score(), col = sc.pct >= 80 ? "var(--ok)" : sc.pct >= 50 ? "var(--warn)" : "var(--bad)", R = 52, circ = 2 * Math.PI * R;
  const todo = sc.C.filter(x => !x.ok);
  c.innerHTML = `<div class="tiles"><div class="glass tile"><b>${Number(st.members || 0).toLocaleString()}</b><span class="muted">${esc(t("members"))}</span></div><div class="glass tile"><b>${Number(st.bot_bans || 0)}</b><span class="muted">${esc(t("botBans"))}</span></div><div class="glass tile"><b>${Number(st.quarantined || 0)}</b><span class="muted">${esc(t("quarantined"))}</span></div></div>
  <div class="glass pad"><div class="score"><div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--g2)" stroke-width="10"/><circle cx="60" cy="60" r="${R}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ * sc.pct / 100} ${circ}"/></svg><b style="color:${col}">${sc.pct}</b></div>
    <div style="flex:1;min-width:220px"><h2>${esc(t("secScore"))}</h2><div class="muted">${esc(t(sc.pct >= 80 ? "scoreGood" : sc.pct >= 50 ? "scoreMid" : "scoreBad"))}</div></div></div>
    ${todo.length ? `<h3>${esc(t("recs"))}</h3>` + todo.map((x, i) => `<div class="rec"><span>${esc(x[lang])}</span>${x.fix ? `<button class="sm pri" data-fix="${i}">${esc(t("applyNow"))}</button>` : `<button class="sm" data-go="${x.go}">${esc(t("goSet"))}</button>`}</div>`).join("") : `<p class="ok" style="margin-top:10px">✅ ${esc(t("allGood"))}</p>`}</div>
  <div class="glass pad"><h2>🎚️ ${esc(t("presets"))}</h2><p class="muted" style="margin-bottom:12px">${esc(t("presetsD"))}</p><div class="pres">${["calm", "balanced", "strict"].map(k => `<div class="glass"><b>${esc(t("pre_" + k))}</b><div class="muted" style="margin:4px 0 10px">${esc(t("pre_" + k + "_d"))}</div><button class="sm pri" data-pre="${k}">${esc(t("applyPreset"))}</button></div>`).join("")}</div></div>`;
  $$("[data-fix]", c).forEach(b => b.onclick = async () => { const [s, p] = todo[+b.dataset.fix].fix; b.disabled = true; try { await putSection(s, p); toast("✅ " + t("saved")); renderView(); } catch (e) { toast("❌ " + e.message); b.disabled = false; } });
  $$("[data-go]", c).forEach(b => b.onclick = () => go("cfg"));
  $$("[data-pre]", c).forEach(b => b.onclick = () => applyPreset(b.dataset.pre));
}
async function applyPreset(k) {
  if (!confirm(t("confirmPreset").replace("{p}", t("pre_" + k)))) return;
  const fails = [];
  for (const [s, body] of Object.entries(PRESETS[k])) { try { await putSection(s, body); } catch (e) { fails.push(s + ": " + e.message); } }
  toast(fails.length ? "⚠️ " + fails[0] : "✅ " + t("saved")); renderView();
}

/* ───────── הגדרות (כל הקטגוריות + חיפוש) ───────── */
function rSettings(c) {
  c.innerHTML = `<div class="glass searchbar"><input id="sq" type="search" placeholder="${esc(t("searchSettings"))}"><div class="jump">${SECS.map(s => `<a data-j="${s.id}">${s.i} ${esc(s.l[lang])}</a>`).join("")}</div></div><div id="secs"></div>`;
  SECS.forEach(def => { VALS[def.id] = def.vals(); $("#secs").insertAdjacentHTML("beforeend", secHtml(def)); bindSec(def); });
  $$(".jump a", c).forEach(a => a.onclick = () => $("#sec_" + a.dataset.j).scrollIntoView({behavior: "smooth"}));
  $("#sq").oninput = () => {
    const q = $("#sq").value.trim().toLowerCase();
    SECS.forEach(def => { const f = $("#sec_" + def.id); let any = false; $$(".fld", f).forEach(w => { const m = !q || w.dataset.sk.includes(q) || def.l[lang].toLowerCase().includes(q); w.classList.toggle("hide", !m); any = any || m; }); f.style.display = any ? "" : "none"; });
  };
}

/* ───────── פעילות חיה ───────── */
function barChart(rows, series) {
  const Wd = 600, H = 170, pad = 6, mx = Math.max(1, ...rows.flatMap(r => series.map(s => +r[s.k] || 0))), bw = (Wd - pad) / Math.max(1, rows.length); let b = "";
  rows.forEach((r, i) => series.forEach((s, j) => { const v = +r[s.k] || 0, h = v / mx * (H - 34), w = Math.max(2, bw / series.length - 2); b += `<rect x="${pad + i * bw + j * (w + 1)}" y="${H - 22 - h}" width="${w}" height="${h}" rx="2" fill="${s.c}"><title>${esc(r.label)} · ${esc(s.name)}: ${v}</title></rect>`; }));
  const lab = (i, a) => rows[i] ? `<text x="${a === "start" ? 2 : Wd - 2}" y="${H - 6}" text-anchor="${a}" font-size="11" fill="currentColor" opacity=".6">${esc(rows[i].label)}</text>` : "";
  return `<svg class="chart" viewBox="0 0 ${Wd} ${H}" preserveAspectRatio="none">${b}${lab(0, "start")}${lab(rows.length - 1, "end")}</svg>`;
}
async function rLive(c) {
  c.innerHTML = `<div class="glass pad" id="lv_c"></div><div class="grid2"><div class="glass pad" id="lv_q"></div><div class="glass pad" id="lv_b"></div></div><div class="glass pad" id="lv_e"></div>`;
  const base = `/api/guilds/${gid}`;
  const unsup = (el, title, ep) => { el.outerHTML = soon([ep]).replace('class="glass pad soon"', 'class="glass pad soon" id="' + el.id + '"').replace("<b>", `<b>${esc(title)} · `); };
  tryApi(base + "/stats/history").then(r => {
    const el = $("#lv_c"); if (!el) return; if (r.unsupported) return unsup(el, t("chartTitle"), "GET " + base + "/stats/history");
    if (!r.ok) return el.innerHTML = errBox(r.e);
    const rows = (r.d.days || []).map(d => ({...d, label: d.day}));
    el.innerHTML = `<h2>📈 ${esc(t("chartTitle"))}</h2>${rows.length ? barChart(rows, [{k: "joins", c: "#35e0a1", name: t("joins")}, {k: "leaves", c: "#8f97b5", name: t("leaves")}, {k: "bans", c: "#ff5d73", name: t("bans")}, {k: "raids", c: "#ffc857", name: t("raids")}]) + `<div class="row">${[["#35e0a1", "joins"], ["#8f97b5", "leaves"], ["#ff5d73", "bans"], ["#ffc857", "raids"]].map(([c2, k]) => `<span class="tag"><i class="rd" style="--c:${c2}"></i> ${esc(t(k))}</span>`).join("")}</div>` : `<p class="muted">${esc(t("noData"))}</p>`}`;
  });
  tryApi(base + "/quarantine").then(r => {
    const el = $("#lv_q"); if (!el) return; if (r.unsupported) return unsup(el, t("quarantined"), "GET " + base + "/quarantine");
    if (!r.ok) return el.innerHTML = errBox(r.e);
    const u = r.d.users || []; el.innerHTML = `<h2>🔒 ${esc(t("quarantined"))} (${u.length})</h2>` + (u.map(x => `<div class="rec"><span>${esc(x.name || t("user"))} <code>${esc(x.id)}</code><div class="muted">${esc(x.reason || "")} ${x.ts ? "· " + fmt(x.ts) : ""}</div></span></div>`).join("") || `<p class="muted">${esc(t("noData"))}</p>`);
  });
  tryApi(base + "/bans").then(r => {
    const el = $("#lv_b"); if (!el) return; if (r.unsupported) return unsup(el, t("botBans"), "GET " + base + "/bans");
    if (!r.ok) return el.innerHTML = errBox(r.e);
    const u = r.d.bans || []; el.innerHTML = `<h2>🚫 ${esc(t("botBans"))} (${r.d.total ?? u.length})</h2>` + (u.map(x => `<div class="rec"><span>${esc(x.name || t("user"))} <code>${esc(x.id)}</code></span><button class="sm" data-un="${esc(x.id)}">♻️ ${esc(t("unban"))}</button></div>`).join("") || `<p class="muted">${esc(t("noData"))}</p>`);
    $$("[data-un]", el).forEach(b => b.onclick = async () => { const q = await tryApi(`${base}/unban`, "POST", {user_id: b.dataset.un}); toast(q.ok ? "✅" : "❌ " + q.e.message); if (q.ok) rLive(c); });
  });
  tryApi(base + "/events").then(r => {
    const el = $("#lv_e"); if (!el) return; if (r.unsupported) return unsup(el, t("events"), "GET " + base + "/events");
    if (!r.ok) return el.innerHTML = errBox(r.e);
    const u = r.d.events || []; el.innerHTML = `<h2>🧾 ${esc(t("events"))}</h2>` + (u.map(x => `<div class="ev"><b>${esc(x.type || "")}</b> ${esc(x.text || "")} <span class="muted">· ${fmt(x.ts)}</span></div>`).join("") || `<p class="muted">${esc(t("noData"))}</p>`);
  });
}

/* ───────── טפסים עם endpoint משלהם (התראות / טיקטים) ───────── */
const ALERT_DEF = () => ({id: "alerts", i: "🔔", l: {he: "התראות", en: "Alerts"}, reset: false, f: [
  F("channel_id", "channel", "חדר התראות בדיסקורד", "Discord alert channel"), F("dm_owner", "bool", "שלח DM לבעל השרת", "DM the server owner"),
  F("on_raid", "bool", "ריייד זוהה", "Raid detected"), F("on_nuke", "bool", "ניסיון ניוק נחסם", "Nuke attempt blocked"), F("on_quarantine", "bool", "משתמש הוכנס להסגר", "User quarantined"), F("on_ban", "bool", "הבוט נתן באן", "Bot issued a ban")],
  save: async b => { const r = await api(`/api/guilds/${gid}/alerts`, "PUT", b); return r.config || r; }});
async function rAlerts(c) {
  const r = await tryApi(`/api/guilds/${gid}/alerts`);
  if (r.unsupported) return c.innerHTML = soon([`GET/PUT /api/guilds/${gid}/alerts`]);
  if (!r.ok) return c.innerHTML = errBox(r.e);
  const def = ALERT_DEF(); VALS.alerts = r.d.config || r.d; c.innerHTML = `<p class="muted" style="margin-bottom:12px">${esc(t("alertsD"))}</p>` + secHtml(def); bindSec(def);
}
const TICKET_DEF = () => ({id: "tickets", i: "🎫", l: {he: "הגדרות טיקטים", en: "Ticket settings"}, reset: false, f: [
  F("panel_channel_id", "channel", "חדר פאנל הטיקטים", "Ticket panel channel"), F("log_channel_id", "channel", "חדר לוגים של טיקטים", "Ticket log channel"),
  F("staff_role_id", "role", "רול צוות (מטפל בטיקטים)", "Staff role (handles tickets)"), F("ban_role_id", "role", "רול ניהול חסימות", "Block-management role"),
  F("banned_role_id", "role", "רול חסום (לא יכול לפתוח טיקטים)", "Blocked role (cannot open tickets)"), F("delete_all_role_id", "role", "רול מחיקת הכול", "Delete-all role"),
  F("durations_role_id", "role", "רול קביעת משך חסימה", "Block-duration role"),
  F("auto_close_hours", "int", "סגירה אוטומטית אחרי כמה שעות (0 = כבוי)", "Auto-close after hours (0 = off)", {r: [0, 168]}),
  F("topics", "lines", "נושאי טיקט (נושא בכל שורה)", "Ticket topics (one per line)", {h: ["שינוי שם נושא יוצר נושא חדש. קטגוריות דיסקורד ואימוג'ים נשמרים לנושאים קיימים ומנוהלים מ-/tickets config.", "Renaming a topic creates a new one. Discord categories and emojis are kept for existing topics and managed via /tickets config."]}),
  F("title", "text", "כותרת הפאנל", "Panel title", {max: 100}), F("description", "long", "תיאור הפאנל", "Panel description", {max: 1000}),
  F("background_url", "text0", "רקע הפאנל (קישור https לתמונה, ריק = ברירת מחדל)", "Panel background (https image link, empty = default)", {max: 380})],
  save: async b => { const r = await api(`/api/guilds/${gid}/tickets`, "PUT", b); return r.config || r; }});
async function rPremium(c) {
  const p = await tryApi(`/api/guilds/${gid}/premium`);
  const prem = p.ok ? p.d : (G.premium != null ? {active: !!G.premium} : null);
  if (!prem) return c.innerHTML = soon([`GET /api/guilds/${gid}/premium`]);
  const up = prem.upgrade_url || PATREON_URL, upBtn = up ? `<a class="btn pri" href="${esc(up)}" target="_blank" rel="noopener">💎 ${esc(t("upgrade"))}</a>` : "";
  if (!prem.active) { c.innerHTML = `<div class="glass pad lock"><div style="font-size:42px">🔒</div><h2>${esc(t("premOnly"))}</h2><p class="muted" style="margin-bottom:14px">${esc(t("premD"))}</p><ul class="muted" style="list-style:none;margin-bottom:16px"><li>🎫 ${esc(t("premF1"))}</li><li>📜 ${esc(t("premF2"))}</li><li>⭐ ${esc(t("premF3"))}</li></ul>${upBtn}</div>`; return; }
  const status = `<div class="glass pad row" style="justify-content:space-between"><div><b>💎 ${esc(t("premActive"))}</b><div class="muted">${prem.until ? esc(t("premUntil")) + " " + fmt(prem.until) : esc(t("premNoEnd"))}${prem.source ? " · " + esc(prem.source) : ""}</div></div></div>`;
  const tk = await tryApi(`/api/guilds/${gid}/tickets`);
  if (tk.unsupported) return c.innerHTML = status + soon([`GET/PUT /api/guilds/${gid}/tickets`, `POST /api/guilds/${gid}/tickets/publish`, `GET /api/guilds/${gid}/tickets/transcripts`]);
  if (!tk.ok) return c.innerHTML = status + errBox(tk.e);
  const def = TICKET_DEF(), s = tk.d.stats || {}; VALS.tickets = tk.d.config || {};
  c.innerHTML = status + (tk.d.stats ? `<div class="tiles"><div class="glass tile"><b>${Number(s.opened || 0)}</b><span class="muted">${esc(t("tkOpened"))}</span></div><div class="glass tile"><b>${Number(s.closed || 0)}</b><span class="muted">${esc(t("tkClosed"))}</span></div><div class="glass tile"><b>${s.avg_rating != null ? Number(s.avg_rating).toFixed(1) : "—"}</b><span class="muted">${esc(t("tkAvg"))}</span></div><div class="glass tile"><b>${Number(s.rated || 0)}</b><span class="muted">${esc(t("tkRated"))}</span></div></div>` : "") + secHtml(def) +
    `<div class="glass pad"><h2>📣 ${esc(t("tkPublish"))}</h2><p class="muted" style="margin-bottom:10px">${esc(t("tkPublishD"))}</p><button class="pri" id="tkp">${esc(t("tkPublishBtn"))}</button></div><div class="glass pad" id="tkt"><h2>📜 ${esc(t("tkTranscripts"))}</h2></div>`;
  bindSec(def);
  $("#tkp").onclick = async () => { if (DIRTY.size && !confirm(t("unsaved"))) return; const q = await tryApi(`/api/guilds/${gid}/tickets/publish`, "POST"); toast(q.ok ? "✅ " + t("tkPublished") : q.unsupported ? "🚧 " + t("soon") : "❌ " + q.e.message); };
  const tr = await tryApi(`/api/guilds/${gid}/tickets/transcripts`), box = $("#tkt");
  if (tr.unsupported) box.remove();
  else if (!tr.ok) box.innerHTML += errBox(tr.e);
  else { const L = tr.d.transcripts || []; box.innerHTML += L.length ? `<div class="scroll"><table><thead><tr><th>${esc(t("user"))}</th><th>${esc(t("closedAt"))}</th><th>⭐</th><th></th></tr></thead><tbody>${L.map(x => `<tr><td>${esc(x.user || "—")}</td><td>${fmt(x.closed_at)}</td><td>${x.rating ?? "—"}</td><td><button class="sm" data-tr="${esc(x.id)}">${esc(t("view"))}</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">${esc(t("noData"))}</p>`;
    $$("[data-tr]", box).forEach(b => b.onclick = async () => { const q = await tryApi(`/api/guilds/${gid}/tickets/transcripts/${encodeURIComponent(b.dataset.tr)}`); if (!q.ok) return toast("❌ " + q.e.message); modal(`<h2>📜 ${esc(t("tkTranscripts"))}</h2>` + ((q.d.messages || []).map(m => `<div class="ev"><b>${esc(m.author || "")}</b> <span class="muted">${fmt(m.ts)}</span><div>${esc(m.content || "")}</div></div>`).join("") || `<p class="muted">${esc(t("noData"))}</p>`)); }); }
}

/* ───────── כלים: אשף, ייצוא/ייבוא, העתקה, היסטוריה ───────── */
const ID_TYPES = new Set(["channel", "chs", "role", "rls"]);
function settingsPayload(src, {noIds}) {
  const out = {};
  for (const def of SECS) {
    const sv = src[def.id]; if (!sv || typeof sv !== "object") continue; const b = {};
    for (const f of def.f) { if (!(f.k in sv)) continue; if (f.own && !G.can_whitelist) continue; if (noIds && ID_TYPES.has(f.type)) continue; b[f.k] = sv[f.k]; }
    if (Object.keys(b).length) out[def.id] = b;
  }
  return out;
}
async function applyPayload(p) {
  const res = [];
  for (const [s, body] of Object.entries(p)) { try { await putSection(s, body); res.push([s, true, ""]); } catch (e) { res.push([s, false, e.message]); } }
  modal(`<h2>${esc(t("importRes"))}</h2>` + res.map(([s, ok, m]) => `<div class="rec"><span>${esc((SECS.find(x => x.id === s) || {l: {[lang]: s}}).l[lang])}</span><span class="${ok ? "ok" : "bad"}">${ok ? "✔" : "✘ " + esc(m)}</span></div>`).join(""));
}
async function rTools(c) {
  if (W) return rWizard(c);
  c.innerHTML = `<div class="glass pad"><h2>🧙 ${esc(t("wizTitle"))}</h2><p class="muted" style="margin-bottom:10px">${esc(t("wizD"))}</p><button class="pri" id="wz">${esc(t("wizStart"))}</button></div>
  <div class="grid2"><div class="glass pad"><h2>📤 ${esc(t("export"))}</h2><p class="muted" style="margin-bottom:10px">${esc(t("exportD"))}</p><button id="ex">${esc(t("exportBtn"))}</button></div>
  <div class="glass pad"><h2>📥 ${esc(t("import"))}</h2><input type="file" id="imf" accept="application/json,.json"><label class="row muted" style="margin:8px 0"><input type="checkbox" id="imn" checked style="width:auto"> ${esc(t("noIds"))}</label><button id="im">${esc(t("importBtn"))}</button></div></div>
  <div class="glass pad"><h2>📋 ${esc(t("copyFrom"))}</h2><div class="row"><select id="cps" style="max-width:320px"><option value="">…</option></select><button id="cp">${esc(t("copyBtn"))}</button></div><p class="muted" style="margin-top:6px">${esc(t("noIdsHint"))}</p></div>
  <div class="glass pad" id="hs"><h2>🕘 ${esc(t("history"))}</h2></div>`;
  $("#wz").onclick = () => { W = {step: 0, log: "", logs: true, level: "balanced", gate: true, gAct: "quarantine", noAv: true, wel: false, wch: ""}; rWizard(c); };
  $("#ex").onclick = () => download(`shield-guard-${(G.name || "server").replace(/[^\w֐-׿-]+/g, "_")}.json`, JSON.stringify({v: 1, guild: G.name, exported: new Date().toISOString(), settings: G.settings}, null, 2));
  $("#im").onclick = async () => { const f = $("#imf").files[0]; if (!f) return toast(t("pickFile")); try { const j = JSON.parse(await f.text()); if (!j.settings || typeof j.settings !== "object") throw 0; if (!confirm(t("confirmImport"))) return; await applyPayload(settingsPayload(j.settings, {noIds: $("#imn").checked})); renderView(); } catch (e) { if (e) toast("❌ " + (e.message || t("badFile"))); else toast("❌ " + t("badFile")); } };
  api("/api/guilds").then(d => { $("#cps").insertAdjacentHTML("beforeend", (d.guilds || []).filter(g => String(g.id) !== String(gid)).map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")); }).catch(() => {});
  $("#cp").onclick = async () => { const s = $("#cps").value; if (!s) return toast(t("pickServer")); if (!confirm(t("confirmImport"))) return; try { const src = await api("/api/guilds/" + s); await applyPayload(settingsPayload(src.settings || {}, {noIds: true})); renderView(); } catch (e) { toast("❌ " + e.message); } };
  loadHist($("#hs"));
}
async function loadHist(box) {
  const sv = await tryApi(`/api/guilds/${gid}/history`); let items, server = false;
  if (sv.ok) { items = sv.d.history || []; server = true; } else items = getHist();
  const sname = id => (SECS.find(x => x.id === id) || {l: {[lang]: id}}).l[lang];
  box.insertAdjacentHTML("beforeend", `<p class="muted" style="margin-bottom:8px">${esc(t(server ? "histServer" : "histLocal"))}</p>` + (items.map((h, i) => `<div class="rec"><span><b>${esc(sname(h.section || h.s))}</b> <span class="muted">${h.who ? esc(h.who) + " · " : ""}${fmt(h.ts)}</span><div class="muted">${esc(Object.keys(h.after || {}).join(", "))}</div></span><button class="sm" data-h="${i}">↩ ${esc(t("restore"))}</button></div>`).join("") || `<p class="muted">${esc(t("noData"))}</p>`));
  $$("[data-h]", box).forEach(b => b.onclick = async () => {
    const h = items[+b.dataset.h]; if (!confirm(t("confirmRestore"))) return;
    try { if (server) await api(`/api/guilds/${gid}/history/${encodeURIComponent(h.id)}/restore`, "POST"); else await putSection(h.s, h.before); toast("✅ " + t("saved")); renderView(); } catch (e) { toast("❌ " + e.message); }
  });
}

/* אשף התקנה */
function rWizard(c) {
  const steps = 5, s = W.step, bar = `<div class="steps">${Array.from({length: steps}, (_, i) => `<i class="${i <= s ? "on" : ""}"></i>`).join("")}</div>`;
  let body = "";
  if (s === 0) body = `<h2>1. ${esc(t("wz1"))}</h2><p class="muted" style="margin-bottom:10px">${esc(t("wz1d"))}</p>${pkHtml("wz_log")}<label class="row" style="margin-top:12px"><span class="sw"><input type="checkbox" id="wz_logs"${W.logs ? " checked" : ""}><i></i></span> ${esc(t("wz1l"))}</label>`;
  if (s === 1) body = `<h2>2. ${esc(t("wz2"))}</h2><div class="opts">${["calm", "balanced", "strict"].map(k => `<label class="${W.level === k ? "on" : ""}"><input type="radio" name="lv" value="${k}"${W.level === k ? " checked" : ""}><b>${esc(t("pre_" + k))}</b><div class="muted">${esc(t("pre_" + k + "_d"))}</div></label>`).join("")}</div>`;
  if (s === 2) body = `<h2>3. ${esc(t("wz3"))}</h2><p class="muted" style="margin-bottom:10px">${esc(t("wz3d"))}</p><label class="row"><span class="sw"><input type="checkbox" id="wz_g"${W.gate ? " checked" : ""}><i></i></span> ${esc(t("wz3e"))}</label><div class="fld" style="margin-top:12px"><label>${esc(t("wz3a"))}</label><select id="wz_ga">${SECS.find(x => x.id === "joingate").f.find(f => f.k === "action").opts.map(o => `<option value="${o[0]}"${W.gAct === o[0] ? " selected" : ""}>${esc(o[lang === "en" ? 2 : 1])}</option>`).join("")}</select></div><label class="row"><span class="sw"><input type="checkbox" id="wz_na"${W.noAv ? " checked" : ""}><i></i></span> ${esc(t("wz3n"))}</label>`;
  if (s === 3) body = `<h2>4. ${esc(t("wz4"))}</h2><label class="row"><span class="sw"><input type="checkbox" id="wz_w"${W.wel ? " checked" : ""}><i></i></span> ${esc(t("wz4e"))}</label><div class="fld" style="margin-top:12px"><label>${esc(t("wz4c"))}</label>${pkHtml("wz_wch")}</div>`;
  if (s === 4) body = `<h2>5. ${esc(t("wz5"))}</h2><div class="rec"><span>${esc(t("wz1"))}</span><span>${W.log ? "#" + esc((G.channels.find(x => String(x.id) === W.log) || {}).name || W.log) : "—"}</span></div><div class="rec"><span>${esc(t("wz2"))}</span><span>${esc(t("pre_" + W.level))}</span></div><div class="rec"><span>${esc(t("wz3"))}</span><span>${W.gate ? "✔ " + esc(W.gAct) : "✘"}</span></div><div class="rec"><span>${esc(t("wz4"))}</span><span>${W.wel && W.wch ? "✔ #" + esc((G.channels.find(x => String(x.id) === W.wch) || {}).name || W.wch) : "✘"}</span></div>`;
  c.innerHTML = `<div class="glass pad">${bar}${body}<div class="row" style="margin-top:18px;justify-content:space-between"><button id="wx">${esc(t("cancel"))}</button><div class="row">${s > 0 ? `<button id="wp">${esc(t("prev"))}</button>` : ""}<button class="pri" id="wn">${esc(s === steps - 1 ? t("wzApply") : t("next"))}</button></div></div></div>`;
  if (s === 0) pkInit("wz_log", {multi: false, list: G.channels || [], sel: W.log ? [W.log] : [], pre: "#"});
  if (s === 3) pkInit("wz_wch", {multi: false, list: G.channels || [], sel: W.wch ? [W.wch] : [], pre: "#"});
  const keep = () => {
    if (s === 0) { W.log = [...PK.wz_log.sel][0] || ""; W.logs = $("#wz_logs").checked; }
    if (s === 1) W.level = ($('input[name=lv]:checked') || {}).value || W.level;
    if (s === 2) { W.gate = $("#wz_g").checked; W.gAct = $("#wz_ga").value; W.noAv = $("#wz_na").checked; }
    if (s === 3) { W.wel = $("#wz_w").checked; W.wch = [...PK.wz_wch.sel][0] || ""; }
  };
  $("#wx").onclick = () => { W = null; renderView(); };
  if ($("#wp")) $("#wp").onclick = () => { keep(); W.step--; rWizard(c); };
  $("#wn").onclick = async () => {
    keep();
    if (s < steps - 1) { W.step++; return rWizard(c); }
    const jobs = [];
    if (W.log) jobs.push(["general", {log_channel: W.log}]);
    if (W.logs) jobs.push(["logs", {messages: true, members: true, server: true}]);
    for (const [k, b] of Object.entries(PRESETS[W.level])) jobs.push([k, b]);
    jobs.push(["joingate", {enabled: W.gate, action: W.gAct, no_avatar: W.noAv}]);
    if (W.wel && W.wch) jobs.push(["welcome", {enabled: true, channel_id: W.wch}]);
    $("#wn").disabled = true; const fails = [];
    for (const [k, b] of jobs) { try { await putSection(k, b); } catch (e) { fails.push(k + ": " + e.message); } }
    W = null; toast(fails.length ? "⚠️ " + fails.join(" | ") : "✅ " + t("wzDone")); renderView();
  };
}

/* ───────── תמיכה ───────── */
async function rHelp(c) {
  c.innerHTML = `<form class="glass pad" id="sp"><h2>🆘 ${esc(t("support"))}</h2><p class="muted" style="margin-bottom:10px">${esc(t("supportD"))}</p><div class="fld"><label>${esc(t("subject"))}</label><input id="sp_s" maxlength="100"></div><div class="fld"><label>${esc(t("message"))}</label><textarea id="sp_m" maxlength="1500"></textarea></div><button class="pri" type="submit">${esc(t("send"))}</button></form><div class="glass pad" id="sph"><h2>${esc(t("myReq"))}</h2></div>`;
  $("#sp").onsubmit = async e => { e.preventDefault(); const subject = $("#sp_s").value.trim(), message = $("#sp_m").value.trim(); if (!subject || !message) return toast(t("fillAll")); const r = await tryApi("/api/support", "POST", {subject, message, guild_id: gid}); if (r.unsupported) return toast("🚧 " + t("soon")); if (!r.ok) return toast("❌ " + r.e.message); toast("✅ " + t("sent")); $("#sp_s").value = $("#sp_m").value = ""; rHelp(c); };
  const h = await tryApi("/api/support"), box = $("#sph");
  if (h.unsupported) box.innerHTML += soon(["POST /api/support", "GET /api/support"]); else if (!h.ok) box.innerHTML += errBox(h.e);
  else box.innerHTML += (h.d.requests || []).map(x => `<div class="ev"><b>${esc(x.subject)}</b> <span class="tag ${x.status === "closed" ? "ok" : "ac"}">${esc(x.status || "open")}</span> <span class="muted">${fmt(x.ts)}</span>${x.reply ? `<div class="muted">↳ ${esc(x.reply)}</div>` : ""}</div>`).join("") || `<p class="muted">${esc(t("noData"))}</p>`;
}

/* ───────── סיסמה, איפוס ואימייל ───────── */
const authView = w => ["login", "forgot", "resetv"].forEach(i => $("#" + i).style.display = i === w ? "block" : "none");
function pwProblem(p, uid) {
  if (typeof p !== "string" || p.length < 10) return "pwShort";
  if (p.length > 128) return "pwLong";
  if (new Set(p).size < 5) return "pwWeak";
  if (uid && p.includes(String(uid))) return "pwHasId";
  if ([/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length < 2) return "pwMix";
  return "";
}
function pwModal(forced) {
  forcedPw = !!forced;
  const needOld = !(forced && tmpPw);
  $("#mbox").innerHTML = `<h2>🔑 ${esc(t(forced ? "pwForceT" : "pwChangeT"))}</h2><p class="muted" style="margin-bottom:10px">${esc(t(forced ? "pwForceD" : "pwChangeD"))}</p>
    <form id="pwf"><div class="fld"${needOld ? "" : ' style="display:none"'}><label for="pw0">${esc(t("pwOld"))}</label><input id="pw0" type="password" autocomplete="current-password"></div>
    <div class="fld"><label for="pw1">${esc(t("pwNew"))}</label><input id="pw1" type="password" autocomplete="new-password"></div>
    <div class="fld"><label for="pw2">${esc(t("pwNew2"))}</label><input id="pw2" type="password" autocomplete="new-password"></div>
    <div class="pwr">${esc(t("pwRules"))}</div><div id="pwe" class="bad" style="min-height:18px;margin:6px 0"></div>
    <div class="row"><button class="pri" type="submit" id="pws">${esc(t("setPw"))}</button>${forced ? `<button type="button" id="pwx">${esc(t("logout"))}</button>` : `<button type="button" id="pwc">${esc(t("cancel"))}</button>`}</div></form>`;
  $("#modal").style.display = "grid";
  if ($("#pwc")) $("#pwc").onclick = closeModal;
  if ($("#pwx")) $("#pwx").onclick = () => { closeModal(); logout(); };
  $("#pwf").onsubmit = async e => {
    e.preventDefault(); const old = needOld ? $("#pw0").value : tmpPw, n1 = $("#pw1").value, n2 = $("#pw2").value, uid = ss.get("u") || "";
    const err = m => $("#pwe").textContent = t(m);
    if (!old) return err("pwOldMissing"); if (n1 !== n2) return err("pwMismatch"); const pr = pwProblem(n1, uid); if (pr) return err(pr);
    $("#pws").disabled = true;
    try { const d = await api("/api/password", "POST", {old, new: n1}); token = d.token; ss.set("t", token); tmpPw = ""; forcedPw = false; closeModal(); toast("✅ " + t("pwDone")); show(); }
    catch (ex) { $("#pwe").textContent = ex.message; $("#pws").disabled = false; }
  };
}
let idleT; const IDLE_MS = 30 * 60 * 1000;
function idleReset() { clearTimeout(idleT); if (token) idleT = setTimeout(() => { if (token) { toast(t("idleOut")); logout(); } }, IDLE_MS); }
["click", "keydown", "touchstart", "mousemove"].forEach(ev => addEventListener(ev, idleReset, {passive: true}));

/* ───────── כניסה ───────── */
function show() {
  authView(token ? "" : "login"); $("#app").style.display = token ? "block" : "none"; idleReset();
  if (!token) return; $("#who").textContent = role === "admin" ? "👑 " + t("adminMode") : ""; $("#pwb").style.display = $("#secb").style.display = role === "admin" ? "none" : "";
  if (forcedPw) return;
  if (!window.__jump) showServers().catch(e => toast(e.message));
}
$("#pwb").onclick = () => pwModal(false);
async function secModal() {
  $("#mbox").innerHTML = `<h2>🔐 ${esc(t("secT"))}</h2><p class="muted" style="margin-bottom:10px">${esc(t("secD"))}</p><div id="seclist" class="muted">${esc(t("loading"))}</div>
    <div class="row" style="margin-top:12px"><button class="pri" id="seclo">${esc(t("secLogoutAll"))}</button><button type="button" id="secx">${esc(t("cancel"))}</button></div>`;
  $("#modal").style.display = "grid"; $("#secx").onclick = closeModal;
  $("#seclo").onclick = async () => { try { const d = await api("/api/security/logout-all", "POST", {}); token = d.token; ss.set("t", token); toast("✅ " + t("secDone")); closeModal(); } catch (e) { toast(e.message); } };
  try {
    const d = await api("/api/security/logins");
    const FL = {new_ip: t("fNewIp"), new_country: t("fNewCountry"), country_jump: t("fJump"), many_ips: t("fMany"), brute: t("fBrute"), tz_mismatch: t("fTz"), hosting: t("fHost")};
    const rows = (d.logins || []).map(x => {
      const loc = [x.city, x.region, x.country].filter(Boolean).join(", ") || t("secUnknown");
      const fl = (x.flags || []).map(f => FL[f]).filter(Boolean).join(" · ");
      return `<div style="border-bottom:1px solid var(--g2);padding:7px 0"><b>${x.ok ? "✅" : "❌"} ${esc(new Date(x.ts * 1000).toLocaleString(locTag()))}</b>
        <div>📍 ${esc(loc)} · 🌐 <span dir="ltr">${esc(x.ip)}</span></div><div class="muted">💻 ${esc([x.os, x.br, x.dev].filter(Boolean).join(" · "))}${x.isp ? " · " + esc(x.isp) : ""}</div>${fl ? `<div class="bad">⚠️ ${esc(fl)}</div>` : ""}</div>`;
    }).join("");
    $("#seclist").innerHTML = `<div style="max-height:46vh;overflow:auto">${rows || esc(t("secNone"))}</div><p class="muted" style="font-size:12px;margin-top:8px">${esc(t("secKeep").replace("{n}", d.keep_days))}</p>`;
  } catch (e) { $("#seclist").textContent = e.message; }
}
$("#secb").onclick = secModal;
$("#go").onclick = async () => {
  const b = $("#go"); $("#lerr").textContent = ""; b.disabled = true; const uid = $("#uid").value.trim(), pw = $("#pw").value;
  try {
    const d = await api("/api/login", "POST", {mode: "customer", user_id: uid, password: pw, tzo: -new Date().getTimezoneOffset()});
    token = d.token; role = d.role; ss.set("t", token); ss.set("r", role); ss.set("u", uid.replace(/\D/g, "")); $("#pw").value = "";
    if (d.must_change) { tmpPw = pw; forcedPw = true; show(); pwModal(true); } else show();
  } catch (e) { $("#lerr").textContent = e.message; } b.disabled = false;
};
$("#pw").onkeydown = e => { if (e.key === "Enter") $("#go").click(); };
$("#uid").onkeydown = e => { if (e.key === "Enter") $("#pw").focus(); };
$("#out").onclick = () => { if (leave()) logout(); };
$("#fg").onclick = () => { $("#fuid").value = $("#uid").value; $("#fmsg").textContent = ""; authView("forgot"); };
$("#rfg").onclick = () => { $("#fmsg").textContent = ""; authView("forgot"); };
$("#fbk").onclick = () => authView("login");
$("#fgo").onclick = async () => {
  const id = $("#fuid").value.trim().replace(/\D/g, ""), box = $("#fmsg"); box.className = ""; box.textContent = "";
  if (id.length < 15) { box.className = "bad"; box.textContent = t("badId"); return; }
  $("#fgo").disabled = true;
  try { await api("/api/forgot", "POST", {user_id: id}); box.className = "ok"; box.textContent = t("forgotSent"); } catch (e) { box.className = "bad"; box.textContent = e.message; }
  setTimeout(() => $("#fgo").disabled = false, 20000);
};
let RESET = null;
$("#rgo").onclick = async () => {
  const n1 = $("#np1").value, n2 = $("#np2").value, err = m => $("#rerr").textContent = t(m); $("#rerr").textContent = "";
  if (n1 !== n2) return err("pwMismatch"); const pr = pwProblem(n1, RESET.uid); if (pr) return err(pr);
  $("#rgo").disabled = true;
  try { const d = await api("/api/reset", "POST", {user_id: RESET.uid, token: RESET.tok, password: n1}); token = d.token; role = "customer"; ss.set("t", token); ss.set("r", role); ss.set("u", RESET.uid); RESET = null; $("#np1").value = $("#np2").value = ""; toast("✅ " + t("pwDone")); show(); }
  catch (e) { $("#rerr").textContent = e.message; $("#rgo").disabled = false; }
};
$("#np2").onkeydown = e => { if (e.key === "Enter") $("#rgo").click(); };
const toggleLang = ev => { if (!leave()) { ev.target.value = uiLang; return; } DIRTY.clear(); uiLang = ev.target.value; lang = uiLang === "he" ? "he" : "en"; ls.set("sg_lang", uiLang); applyPrefs(); if (token) { gid ? showGuild(gid, view) : showServers(); } };
const toggleTheme = () => { theme = theme === "dark" ? "light" : "dark"; ls.set("sg_theme", theme); applyPrefs(); };
["bl", "bl0"].forEach(i => { $("#" + i).onchange = toggleLang; $("#" + i).value = uiLang; }); ["bt", "bt0"].forEach(i => $("#" + i).onclick = toggleTheme);
window.addEventListener("beforeunload", e => { if (DIRTY.size) { e.preventDefault(); e.returnValue = ""; } });

/* ───────── תרגומים ───────── */
const I18N = {
  he: {appTitle: "WaveGuard — פאנל ניהול", loginSub: "התחבר עם המזהה והסיסמה שקיבלת ב-DM", uidPh: "מזהה (Discord ID)", pwPh: "סיסמה", login: "כניסה", logout: "התנתק", adminMode: "מצב מנהל",
    loading: "טוען…", retry: "נסה שוב", noConn: "אין חיבור לבוט. נסה שוב בעוד רגע", sessExp: "ההתחברות פגה, התחבר שוב", close: "סגור", back: "חזרה", search: "חיפוש…", none: "ללא", nores: "אין תוצאות", remove: "הסר", items: "פריטים", empty: "ריק",
    unsaved: "יש שינויים שלא נשמרו. לצאת בלי לשמור?", save: "שמור", revert: "בטל שינויים", reset: "אפס לברירת מחדל", dirty: "יש שינויים שלא נשמרו", willSave: "מה שיישמר:", noChanges: "אין שינויים לשמור", saved: "נשמר", resetDone: "אופס",
    confirmReset: "לאפס את הקטגוריה לברירת המחדל?", ownerOnly: "רק בעל השרת או מי שהכניס את הבוט יכולים לערוך את הוויטליסט", badNum: "חסר מספר תקין", badChoice: "בחירה לא תקינה", badId: "ID לא תקין (ספרות בלבד)", maxLinks: "מקסימום 5 כפתורי קישור", badLink: "קישור לא תקין",
    soon: "הפיצ'ר יופעל בקרוב", soonD: "הפיצ'ר הזה עדיין לא זמין. שאר הפאנל ממשיך לעבוד כרגיל.",
    addBot: "הוסף את הבוט לשרת", noServer: "עוד אין שרת מחובר", noServerD: "הפאנל מציג שרתים שאתה הבעלים שלהם והבוט נמצא בהם. הוסף את הבוט לשרת שלך ואז רענן.", pickServer: "בחר שרת לניהול", members: "חברים",
    secT: "אבטחה והתחברויות", secD: "הכניסות האחרונות לחשבון שלך. אם יש כניסה שאתה לא מזהה, החלף סיסמה ולחץ \"התנתק מכל המכשירים\".", secLogoutAll: "התנתק מכל המכשירים", secDone: "כל המכשירים נותקו", secNone: "אין עדיין כניסות", secUnknown: "מיקום לא ידוע",
    secKeep: "המיקום מחושב לפי כתובת ה-IP והוא משוער בלבד. הנתונים נשמרים מוצפנים {n} ימים ואז נמחקים.", privNote: "לצורכי אבטחה נשמרים כתובת ה-IP, המיקום המשוער וסוג המכשיר בכל כניסה, לתקופה של 90 יום.",
    fNewIp: "כתובת IP חדשה", fNewCountry: "מדינה חדשה", fJump: "קפיצה בין מדינות", fMany: "הרבה כתובות IP", fBrute: "ניסיונות כושלים", fTz: "אזור זמן לא תואם", fHost: "ספק אירוח/VPN",
    nav_ov: "סקירה", nav_cfg: "הגדרות", nav_live: "פעילות חיה", nav_alerts: "התראות", nav_prem: "פרימיום", nav_tools: "כלים", nav_help: "תמיכה",
    botBans: "באנים של הבוט", quarantined: "בהסגר", secScore: "ציון אבטחה", scoreGood: "השרת מוגן היטב.", scoreMid: "יש מה לשפר, ראה המלצות.", scoreBad: "ההגנה חלשה. מומלץ ליישם את ההמלצות.", recs: "המלצות", applyNow: "החל בלחיצה", goSet: "עבור להגדרות", allGood: "הכול מוגדר מצוין",
    presets: "הגדרות מוכנות", presetsD: "מגדירות יחד אנטי-ניוק, אנטי-ריידים ואוטומוד. אפשר לשנות אחר כך כל הגדרה.", pre_calm: "רגוע", pre_calm_d: "הגנה בסיסית עם מעט התערבות.", pre_balanced: "מאוזן", pre_balanced_d: "מומלץ לרוב השרתים.", pre_strict: "מחמיר", pre_strict_d: "הגנה מקסימלית לשרתים גדולים או תחת מתקפה.",
    applyPreset: "החל", confirmPreset: "להחיל את ההגדרה \"{p}\"? זה ידרוס הגדרות באנטי-ניוק, אנטי-ריידים ואוטומוד.", searchSettings: "🔎 חפש הגדרה (למשל: ריידים, ספאם, רקע)…",
    chartTitle: "פעילות לאורך זמן", joins: "כניסות", leaves: "יציאות", bans: "באנים", raids: "ריידים", noData: "אין נתונים.", user: "משתמש", release: "שחרר", unban: "בטל באן", events: "אירועים אחרונים",
    alertsD: "בחר מה תרצה לקבל כשמזוהה ריייד, ניסיון ניוק ועוד, בחדר בדיסקורד או ב-DM.",
    upgrade: "שדרג לפרימיום", premOnly: "אזור פרימיום", premD: "ההגדרות כאן זמינות רק לשרתים עם מנוי פרימיום.", premF1: "מערכת טיקטים מלאה", premF2: "מחולל לוגים לשרת FiveM", premF3: "הגדרות מתקדמות לטיקטים", premActive: "פרימיום פעיל", premUntil: "בתוקף עד", premNoEnd: "ללא תאריך סיום",
    tkOpened: "טיקטים שנפתחו", tkClosed: "טיקטים שנסגרו", tkAvg: "דירוג ממוצע", tkRated: "דורגו", tkPublish: "פרסום הפאנל", tkPublishD: "שולח או מעדכן את הודעת הפאנל בחדר שבחרת.", tkPublishBtn: "פרסם / עדכן פאנל", tkPublished: "הפאנל פורסם", tkTranscripts: "טרנסקריפטים", closedAt: "נסגר", view: "צפה",
    wizTitle: "אשף התקנה לשרת חדש", wizD: "5 שלבים קצרים: לוגים, רמת הגנה, שער כניסה ווולקם.", wizStart: "התחל", wz1: "חדר לוגים", wz1d: "לשם יגיעו כל ההתראות.", wz1l: "הפעל את כל סוגי הלוגים", wz2: "רמת הגנה", wz3: "שער כניסה", wz3d: "בודק חשבונות חשודים בכניסה.", wz3e: "הפעל שער כניסה", wz3a: "פעולה על חשבון חשוד", wz3n: "הסגר למי שאין לו תמונת פרופיל", wz4: "וולקם", wz4e: "הפעל הודעת וולקם", wz4c: "חדר הוולקם", wz5: "סיכום", wzApply: "החל הכול", wzDone: "ההתקנה הסתיימה", cancel: "ביטול", prev: "הקודם", next: "הבא",
    export: "ייצוא הגדרות", exportD: "מוריד קובץ JSON עם כל ההגדרות של השרת.", exportBtn: "הורד קובץ", import: "ייבוא הגדרות", noIds: "דלג על הגדרות שתלויות בשרת (חדרים ורולים)", importBtn: "ייבא", pickFile: "בחר קובץ", badFile: "קובץ לא תקין", confirmImport: "להחיל את ההגדרות על השרת הזה?", importRes: "תוצאות", copyFrom: "העתקת הגדרות משרת אחר", copyBtn: "העתק", noIdsHint: "חדרים ורולים לא מועתקים כי המזהים שונים בין שרתים.",
    history: "היסטוריית שינויים", histServer: "מי שינה מה ומתי (מהשרת).", histLocal: "שינויים שנעשו מהדפדפן הזה.", restore: "שחזר", confirmRestore: "לשחזר את הערכים הקודמים?",
    support: "פנייה לתמיכה", supportD: "נתקלת בבעיה או יש לך שאלה? כתוב לנו.", subject: "נושא", message: "הודעה", send: "שלח", sent: "הפנייה נשלחה", fillAll: "מלא נושא והודעה", myReq: "הפניות שלי", forgot: "שכחתי סיסמה", forgotT: "איפוס סיסמה", forgotD: "הכנס את המזהה שלך ונשלח קישור לאיפוס למייל שרשמת (או בהודעה פרטית מהבוט אם עוד לא רשמת אימייל).", sendLink: "שלח קישור איפוס", forgotSent: "אם המזהה רשום אצלנו, נשלח קישור איפוס. בדוק את המייל (וגם ספאם) או את ההודעות הפרטיות מהבוט.",
    resetT: "קביעת סיסמה חדשה", resetSub: "בחר סיסמה חדשה לחשבון", newPw: "סיסמה חדשה", newPw2: "אימות הסיסמה", setPw: "שמור סיסמה", pwRules: "לפחות 10 תווים, עם שילוב של אותיות ומספרים או סימנים.",
    pwShort: "הסיסמה חייבת להכיל לפחות 10 תווים", pwLong: "הסיסמה ארוכה מדי", pwWeak: "הסיסמה חלשה מדי", pwHasId: "אל תשתמש במזהה שלך בסיסמה", pwMix: "שלב אותיות עם מספרים או סימנים", pwMismatch: "הסיסמאות לא זהות", pwOld: "סיסמה נוכחית", pwOldMissing: "הכנס את הסיסמה הנוכחית",
    pwForceT: "קבע סיסמה אישית", pwForceD: "נכנסת עם סיסמה זמנית. כדי להמשיך, בחר סיסמה אישית.", pwChangeT: "החלפת סיסמה", pwChangeD: "אחרי ההחלפה תתנתק מכל המכשירים האחרים.", pwNew: "סיסמה חדשה", pwNew2: "אימות הסיסמה החדשה", pwDone: "הסיסמה עודכנה", idleOut: "נותקת בגלל חוסר פעילות"},
  en: {appTitle: "WaveGuard Bot Panel", loginSub: "Sign in with the ID and password you received by DM", uidPh: "Discord ID", pwPh: "Password", login: "Sign in", logout: "Sign out", adminMode: "Admin mode",
    loading: "Loading…", retry: "Retry", noConn: "Can't reach the bot. Try again in a moment", sessExp: "Session expired, please sign in again", close: "Close", back: "Back", search: "Search…", none: "None", nores: "No results", remove: "Remove", items: "items", empty: "empty",
    unsaved: "You have unsaved changes. Leave without saving?", save: "Save", revert: "Discard changes", reset: "Reset to default", dirty: "Unsaved changes", willSave: "Will be saved:", noChanges: "Nothing to save", saved: "Saved", resetDone: "Reset",
    confirmReset: "Reset this category to its defaults?", ownerOnly: "Only the server owner or whoever added the bot can edit the whitelist", badNum: "Missing a valid number", badChoice: "Invalid choice", badId: "Invalid ID (digits only)", maxLinks: "Up to 5 link buttons", badLink: "Invalid link",
    soon: "Coming soon", soonD: "This feature isn't available yet. The rest of the panel keeps working.",
    addBot: "Add the bot to a server", noServer: "No server connected yet", noServerD: "The panel lists servers you own that the bot is in. Add the bot to your server, then refresh.", pickServer: "Choose a server", members: "members",
    secT: "Security & sign-ins", secD: "Recent sign-ins to your account. If you don't recognise one, change your password and press \"Sign out everywhere\".", secLogoutAll: "Sign out everywhere", secDone: "Signed out of all devices", secNone: "No sign-ins yet", secUnknown: "Unknown location",
    secKeep: "Location is estimated from the IP address and is approximate. Data is stored encrypted for {n} days, then deleted.", privNote: "For security we store your IP address, approximate location and device type at each sign-in for 90 days.",
    fNewIp: "New IP", fNewCountry: "New country", fJump: "Country jump", fMany: "Many IPs", fBrute: "Failed attempts", fTz: "Time zone mismatch", fHost: "Hosting/VPN provider",
    nav_ov: "Overview", nav_cfg: "Settings", nav_live: "Live activity", nav_alerts: "Alerts", nav_prem: "Premium", nav_tools: "Tools", nav_help: "Support",
    botBans: "Bot bans", quarantined: "Quarantined", secScore: "Security score", scoreGood: "Your server is well protected.", scoreMid: "Room for improvement, see recommendations.", scoreBad: "Protection is weak. Apply the recommendations.", recs: "Recommendations", applyNow: "Apply now", goSet: "Go to settings", allGood: "Everything is configured",
    presets: "Ready-made presets", presetsD: "Configure anti-nuke, anti-raid and automod together. You can fine-tune everything afterwards.", pre_calm: "Calm", pre_calm_d: "Basic protection, minimal intervention.", pre_balanced: "Balanced", pre_balanced_d: "Recommended for most servers.", pre_strict: "Strict", pre_strict_d: "Maximum protection for big servers or under attack.",
    applyPreset: "Apply", confirmPreset: "Apply the \"{p}\" preset? It overwrites anti-nuke, anti-raid and automod settings.", searchSettings: "🔎 Search settings (e.g. raid, spam, background)…",
    chartTitle: "Activity over time", joins: "Joins", leaves: "Leaves", bans: "Bans", raids: "Raids", noData: "No data.", user: "User", release: "Release", unban: "Unban", events: "Recent events",
    alertsD: "Choose what you want to be notified about (raids, nuke attempts…) in a Discord channel or by DM.",
    upgrade: "Upgrade to Premium", premOnly: "Premium area", premD: "These settings are available only to servers with a Premium subscription.", premF1: "Full ticket system", premF2: "FiveM log resource generator", premF3: "Advanced ticket settings", premActive: "Premium active", premUntil: "Valid until", premNoEnd: "No end date",
    tkOpened: "Tickets opened", tkClosed: "Tickets closed", tkAvg: "Average rating", tkRated: "Rated", tkPublish: "Publish the panel", tkPublishD: "Sends or updates the panel message in the channel you chose.", tkPublishBtn: "Publish / update panel", tkPublished: "Panel published", tkTranscripts: "Transcripts", closedAt: "Closed", view: "View",
    wizTitle: "New-server setup wizard", wizD: "5 quick steps: logs, protection level, join gate and welcome.", wizStart: "Start", wz1: "Log channel", wz1d: "All alerts will be sent here.", wz1l: "Enable all log types", wz2: "Protection level", wz3: "Join gate", wz3d: "Checks suspicious accounts when they join.", wz3e: "Enable the join gate", wz3a: "Action on suspicious accounts", wz3n: "Quarantine users without an avatar", wz4: "Welcome", wz4e: "Enable the welcome message", wz4c: "Welcome channel", wz5: "Summary", wzApply: "Apply all", wzDone: "Setup finished", cancel: "Cancel", prev: "Previous", next: "Next",
    export: "Export settings", exportD: "Downloads a JSON file with all server settings.", exportBtn: "Download file", import: "Import settings", noIds: "Skip server-specific settings (channels and roles)", importBtn: "Import", pickFile: "Choose a file", badFile: "Invalid file", confirmImport: "Apply these settings to this server?", importRes: "Results", copyFrom: "Copy settings from another server", copyBtn: "Copy", noIdsHint: "Channels and roles are not copied because IDs differ between servers.",
    history: "Change history", histServer: "Who changed what and when (from the server).", histLocal: "Changes made from this browser.", restore: "Restore", confirmRestore: "Restore the previous values?",
    support: "Contact support", supportD: "Found a problem or have a question? Write to us.", subject: "Subject", message: "Message", send: "Send", sent: "Request sent", fillAll: "Fill in subject and message", myReq: "My requests", forgot: "Forgot password", forgotT: "Reset password", forgotD: "Enter your ID and we'll send a reset link to the email you registered (or a DM from the bot if you haven't registered one).", sendLink: "Send reset link", forgotSent: "If the ID is registered, a reset link was sent. Check your email (and spam) or the bot's DMs.",
    resetT: "Set a new password", resetSub: "Choose a new password for your account", newPw: "New password", newPw2: "Confirm password", setPw: "Save password", pwRules: "At least 10 characters, mixing letters with numbers or symbols.",
    pwShort: "Password must be at least 10 characters", pwLong: "Password is too long", pwWeak: "Password is too weak", pwHasId: "Don't use your ID in the password", pwMix: "Mix letters with numbers or symbols", pwMismatch: "Passwords don't match", pwOld: "Current password", pwOldMissing: "Enter your current password",
    pwForceT: "Set a personal password", pwForceD: "You signed in with a temporary password. Choose a personal one to continue.", pwChangeT: "Change password", pwChangeD: "After changing it you'll be signed out everywhere else.", pwNew: "New password", pwNew2: "Confirm new password", pwDone: "Password updated", idleOut: "Signed out due to inactivity"}
};

/* ───────── אתחול ───────── */
(async function boot() {
  applyPrefs();
  const hp = new URLSearchParams(location.hash.slice(1)), qp = new URLSearchParams(location.search);
  if (qp.get("u")) $("#uid").value = qp.get("u").replace(/\D/g, "");
  const jump = hp.get("g"), rs = hp.get("reset");
  try { history.replaceState(null, "", location.pathname); } catch {}   // מוריד קודים מהכתובת מיד
  try {
    if (hp.get("c")) { const d = await api("/api/handoff/exchange", "POST", {code: hp.get("c")}); token = d.token; role = d.role || "admin"; ss.set("t", token); ss.set("r", role); }
  } catch (e) { $("#lerr").textContent = e.message; }
  if (rs && /^\d{15,22}\.[A-Za-z0-9_-]{20,80}$/.test(rs) && !token) {
    const [uid, tok] = [rs.slice(0, rs.indexOf(".")), rs.slice(rs.indexOf(".") + 1)]; RESET = {uid, tok};
    $("#resetSub").textContent = t("resetSub") + " · " + uid; authView("resetv"); return;
  }
  window.__jump = !!(jump && token);
  show();
  if (window.__jump) showGuild(jump);
})();
