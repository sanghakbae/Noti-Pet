// 접속한 나라에 따라 한국어(/) · 영어(/en/) 페이지로 보낸다.
//  1) 사람이 고른 언어(상단 KO/EN)를 먼저 따른다 — localStorage "notipet-lang"
//  2) 없으면 Cloudflare가 알려 주는 접속 국가(/cdn-cgi/trace 의 loc=): 한국이면 한국어, 그 밖은 영어
//  3) 그것도 안 되면 브라우저 언어
// 검색 로봇은 옮기지 않는다(두 페이지 모두 검색에 나오도록 hreflang으로 서로 알려 둠).
(function () {
  var here = document.documentElement.lang === "en" ? "en" : "ko";
  var KEY = "notipet-lang";
  if (/bot|crawl|spider|slurp|facebookexternalhit|embedly|preview/i.test(navigator.userAgent)) return;

  function go(lang) {
    if (lang === here) return;
    location.replace((lang === "en" ? "/en/" : "/") + location.search.replace(/[?&]lang=(ko|en)/, "").replace(/^&/, "?") + location.hash);
  }
  function fromBrowser() {
    var list = navigator.languages || [navigator.language || ""];
    for (var i = 0; i < list.length; i++) if (/^ko/i.test(list[i])) return "ko";
    return "en";
  }
  var get = function (k, store) { try { return store.getItem(k); } catch (e) { return null; } };
  var set = function (k, v, store) { try { store.setItem(k, v); } catch (e) {} };

  // 상단 언어 버튼: 누르면 그 언어를 기억한다
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-set-lang]");
    if (a) set(KEY, a.getAttribute("data-set-lang"), localStorage);
  });

  var m = location.search.match(/[?&]lang=(ko|en)/);
  if (m) { set(KEY, m[1], localStorage); return go(m[1]); }
  var chosen = get(KEY, localStorage);
  if (chosen === "ko" || chosen === "en") return go(chosen);
  var auto = get(KEY, sessionStorage);
  if (auto === "ko" || auto === "en") return go(auto);

  var done = false;
  var decide = function (lang) { if (done) return; done = true; set(KEY, lang, sessionStorage); go(lang); };
  setTimeout(function () { decide(fromBrowser()); }, 1500);   // 느리면 브라우저 언어로
  fetch("/cdn-cgi/trace", { cache: "no-store" })
    .then(function (r) { return r.text(); })
    .then(function (t) { var c = (t.match(/^loc=([A-Z]{2})$/m) || [])[1]; decide(c ? (c === "KR" ? "ko" : "en") : fromBrowser()); })
    .catch(function () { decide(fromBrowser()); });
})();
