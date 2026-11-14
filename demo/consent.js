// Blocking terms/privacy gate for the demo page.
// Reuses the same key+version as the main site's consent gate (app.js), so a
// visitor who already accepted on the home page is not asked again here.
(function () {
  "use strict";
  var VER = "2026-11-11", KEY = "sg_consent";
  var gate = document.getElementById("consent");
  if (!gate) return;

  function accepted() {
    try { return localStorage.getItem(KEY) === VER; } catch (e) { return false; }
  }
  if (accepted()) return;

  gate.classList.add("show");
  document.body.style.overflow = "hidden";

  var btn = document.getElementById("cgAccept");
  btn.addEventListener("click", function () {
    try { localStorage.setItem(KEY, VER); } catch (e) { /* פרטי / חסום — בסדר */ }
    gate.classList.remove("show");
    document.body.style.overflow = "";
  });
  btn.focus();
})();
