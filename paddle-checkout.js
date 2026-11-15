// תשלום חד-פעמי לפרימיום דרך Paddle Checkout (overlay מאובטח של Paddle עצמו — פרטי
// אשראי לא נוגעים בשרת שלנו כלל). ה-API שלנו מחזיר רק טוקן ציבורי + מזהה מחיר.
(function () {
  const API = "https://security-bot-production-2c03.up.railway.app";
  let ready = null;

  function msg(text) {
    const el = document.getElementById("paddleMsg");
    if (el) el.textContent = text;
  }

  function validId(s) {
    return /^[0-9]{15,21}$/.test(s);
  }

  async function ensureReady() {
    if (ready) return ready;
    ready = (async () => {
      const res = await fetch(API + "/api/public/paddle/config", { credentials: "omit" });
      const cfg = await res.json();
      if (!res.ok || !cfg.ok) throw new Error("config");
      if (cfg.client_token.startsWith("test_")) {
        Paddle.Environment.set("sandbox");
      }
      Paddle.Initialize({ token: cfg.client_token });
      return cfg;
    })();
    return ready;
  }

  async function openCheckout() {
    msg("טוען...");
    let cfg;
    try {
      cfg = await ensureReady();
    } catch {
      msg("אירעה שגיאה בטעינת מערכת התשלומים. נסו שוב מאוחר יותר.");
      ready = null;
      return;
    }
    const guildId = (window.prompt(
      "לאיזה שרת דיסקורד (Guild ID) להפעיל את הפרימיום?\n" +
      "(בדיסקורד: הגדרות → מתקדם → מצב מפתח, קליק ימני על השרת ← Copy ID)"
    ) || "").trim();
    if (!validId(guildId)) { msg("Guild ID לא תקין (15–21 ספרות). נסו שוב."); return; }
    const userId = (window.prompt(
      "ומה ה-Discord ID שלכם? (כדי לשלוח לכם אישור ב-DM)"
    ) || "").trim();
    if (!validId(userId)) { msg("Discord ID לא תקין. נסו שוב."); return; }
    msg("");
    Paddle.Checkout.open({
      items: [{ priceId: cfg.price_onetime, quantity: 1 }],
      customData: { guild_id: guildId, user_discord_id: userId },
      settings: { displayMode: "overlay", theme: "dark" },
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("paddleBuy");
    if (btn) btn.addEventListener("click", openCheckout);
  });
})();
