(function () {
  "use strict";

  // Lingtai Radio: a semi-live study music stream.
  // Plays a queue derived from data/tracks.json (newest first), polls
  // every POLL_MS for a new top track, and switches over without
  // stopping the user. When a track ends naturally we advance to the
  // next track in the queue instead of looping the same MP3.
  // UI renders in a single chosen language at a time (en | zh | wy),
  // persisted in localStorage under LANG_KEY.

  var POLL_MS = 60 * 1000;
  var LANG_KEY = "lingtai-radio-lang";
  var SUPPORTED = ["en", "zh", "wy"];
  var DEFAULT_LANG = "en";

  var audio = document.getElementById("audio");
  var liveDot = document.getElementById("live-dot");
  var statusEl = document.getElementById("status");

  var titleEl = document.getElementById("np-title");
  var metaEl = document.getElementById("np-meta");
  var promptEl = document.getElementById("np-prompt");
  var recentEl = document.getElementById("recent-list");

  var currentId = null;
  var queueIndex = 0;
  var wasPlaying = false;
  var userPausedExplicitly = false;
  var autoplayBlocked = false;
  var suppressPauseEvent = false;
  var latestTracks = [];

  // --- language ---------------------------------------------------------

  function detectInitialLang() {
    try {
      var stored = window.localStorage.getItem(LANG_KEY);
      if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    } catch (e) {
      // localStorage may be blocked; fall through.
    }
    var nav = (navigator.language || "").toLowerCase();
    if (nav.indexOf("zh") === 0) return "zh";
    return DEFAULT_LANG;
  }

  var currentLang = detectInitialLang();

  function persistLang(lang) {
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch (e) {
      // ignore
    }
  }

  function applyStaticI18n(lang) {
    document.documentElement.setAttribute(
      "lang",
      lang === "en" ? "en" : lang === "zh" ? "zh-Hans" : "lzh"
    );

    var textNodes = document.querySelectorAll("[data-i18n-" + lang + "]");
    Array.prototype.forEach.call(textNodes, function (el) {
      // Skip nodes that also have a data-i18n-html-<lang>; those are handled below.
      if (el.hasAttribute("data-i18n-html-" + lang)) return;
      el.textContent = el.getAttribute("data-i18n-" + lang) || "";
    });

    var htmlNodes = document.querySelectorAll("[data-i18n-html-" + lang + "]");
    Array.prototype.forEach.call(htmlNodes, function (el) {
      el.innerHTML = el.getAttribute("data-i18n-html-" + lang) || "";
    });
  }

  function setLanguage(lang) {
    if (SUPPORTED.indexOf(lang) === -1) return;
    currentLang = lang;
    persistLang(lang);

    Array.prototype.forEach.call(
      document.querySelectorAll(".lang-btn"),
      function (btn) {
        var on = btn.getAttribute("data-lang") === lang;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      }
    );

    applyStaticI18n(lang);

    // Re-render dynamic regions in the new language.
    if (latestTracks && latestTracks.length) {
      var cur =
        latestTracks[queueIndex] || latestTracks[0];
      renderCurrent(cur);
      renderRecent(latestTracks);
    } else {
      renderStandby();
    }
  }

  Array.prototype.forEach.call(
    document.querySelectorAll(".lang-btn"),
    function (btn) {
      btn.addEventListener("click", function () {
        setLanguage(btn.getAttribute("data-lang"));
      });
    }
  );

  // --- audio events -----------------------------------------------------

  // Distinguish an explicit user pause from the `pause` event browsers
  // fire just before `ended`. We never use <audio loop>; instead the
  // `ended` handler advances the queue to the next track.
  function isNaturalEndPause() {
    if (audio.ended) return true;
    var dur = audio.duration;
    if (!isFinite(dur) || dur <= 0) return false;
    return dur - audio.currentTime < 0.5;
  }

  audio.addEventListener("pause", function () {
    if (suppressPauseEvent) return;
    if (!audio.currentSrc) return;
    if (isNaturalEndPause()) return;
    userPausedExplicitly = true;
  });

  audio.addEventListener("play", function () {
    userPausedExplicitly = false;
    autoplayBlocked = false;
    setStatus("");
  });

  audio.addEventListener("ended", function () {
    if (userPausedExplicitly) return;
    if (!latestTracks.length) return;
    // Advance through current + recent pieces. Wrap only after the
    // last entry so we don't immediately repeat the same MP3 unless
    // there is genuinely only one piece in the queue.
    queueIndex = (queueIndex + 1) % latestTracks.length;
    swapTo(latestTracks[queueIndex], { forcePlay: true });
  });

  // --- formatting helpers ----------------------------------------------

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso || "";
      var locale =
        currentLang === "en" ? "en-US" : currentLang === "zh" ? "zh-CN" : "zh-Hant";
      return d.toLocaleString(locale, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return iso || "";
    }
  }

  function setStatus(msg, level) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (level ? " " + level : "");
  }

  function setLive(isLive) {
    if (isLive) liveDot.classList.remove("stale");
    else liveDot.classList.add("stale");
  }

  // --- per-language strings --------------------------------------------

  var STR = {
    tuningIn: { en: "Tuning in…", zh: "正在接通…", wy: "方调清音……" },
    standby: { en: "Standing by.", zh: "待播。", wy: "未起。" },
    noRecent: {
      en: "No earlier pieces yet.",
      zh: "暂无近期曲目。",
      wy: "近曲阙如。",
    },
    noPieces: {
      en: "No pieces yet.",
      zh: "暂无曲目。",
      wy: "曲未起。",
    },
    tapPlay: {
      en: "Tap play to start the broadcast.",
      zh: "点击播放以开始。",
      wy: "击之以闻其音。",
    },
    couldNotRefresh: {
      en: "Could not refresh broadcasts",
      zh: "暂时无法刷新",
      wy: "暂未能新",
    },
  };

  function s(key) {
    return (STR[key] && STR[key][currentLang]) || (STR[key] && STR[key].en) || "";
  }

  // --- i18n fallbacks for legacy records --------------------------------

  var HOUR_ZH = [
    "子夜",
    "丑时",
    "寅时",
    "卯时",
    "辰时",
    "巳时",
    "午时",
    "未时",
    "申时",
    "酉时",
    "戌时",
    "亥时",
  ];

  function hourLabelZh(d) {
    var h = d.getHours();
    var idx = Math.floor(((h + 1) % 24) / 2);
    return HOUR_ZH[idx];
  }

  function fallbackTitle(t, lang) {
    if (lang === "en") return t.title || t.id || "Lingtai broadcast";
    var d = t.created_at ? new Date(t.created_at) : null;
    if (!d || isNaN(d.getTime())) {
      return lang === "zh" ? "灵台一曲" : "灵台之曲";
    }
    if (lang === "zh") {
      var stamp =
        d.getFullYear() +
        "年" +
        (d.getMonth() + 1) +
        "月" +
        d.getDate() +
        "日 " +
        String(d.getHours()).padStart(2, "0") +
        ":" +
        String(d.getMinutes()).padStart(2, "0");
      return "灵台播音 · " + stamp;
    }
    // wy
    return "灵台一曲 · " + hourLabelZh(d);
  }

  function fallbackPrompt(t, lang) {
    if (lang === "en") return t.prompt || "";
    var d = t.created_at ? new Date(t.created_at) : null;
    var hour = d && !isNaN(d.getTime()) ? hourLabelZh(d) : "此刻";
    if (lang === "zh") {
      return (
        hour +
        "学习音乐：以古琴、琵琶、竹笛与柔和铺底营造专注气氛，适合阅读、写作与深度工作。"
      );
    }
    return hour + "清音：琴瑟笛箫，缓而不扰，可佐读书、属文、凝神。";
  }

  function getTitle(t) {
    var d = t.display;
    if (d && d.title && d.title[currentLang]) return d.title[currentLang];
    return fallbackTitle(t, currentLang);
  }

  function getPrompt(t) {
    var d = t.display;
    if (d && d.prompt && d.prompt[currentLang]) return d.prompt[currentLang];
    return fallbackPrompt(t, currentLang);
  }

  // --- rendering --------------------------------------------------------

  function renderStandby() {
    titleEl.textContent = s("standby");
    metaEl.textContent = "";
    promptEl.textContent = "";
    recentEl.innerHTML = "";
    var li = document.createElement("li");
    li.className = "empty";
    li.textContent = s("noPieces");
    recentEl.appendChild(li);
  }

  function renderCurrent(t) {
    titleEl.textContent = getTitle(t);
    metaEl.textContent = fmtDate(t.created_at);
    promptEl.textContent = getPrompt(t);
  }

  function renderRecent(tracks) {
    recentEl.innerHTML = "";
    var prior = tracks.slice(1, 9);
    if (prior.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = s("noRecent");
      recentEl.appendChild(empty);
      return;
    }

    prior.forEach(function (t) {
      var li = document.createElement("li");

      var title = document.createElement("div");
      title.className = "recent-title";
      title.textContent = getTitle(t);

      var meta = document.createElement("div");
      meta.className = "recent-meta";
      meta.textContent = fmtDate(t.created_at);

      li.appendChild(title);
      li.appendChild(meta);

      li.addEventListener("click", function () {
        playSpecific(t);
      });

      recentEl.appendChild(li);
    });
  }

  // --- playback ---------------------------------------------------------

  function swapTo(t, opts) {
    opts = opts || {};
    var hadSrc = !!audio.currentSrc;
    suppressPauseEvent = true;
    audio.src = t.file;
    audio.loop = false;
    suppressPauseEvent = false;
    currentId = t.id;
    renderCurrent(t);

    var shouldPlay = opts.forcePlay || (hadSrc ? wasPlaying : true);
    if (!shouldPlay || userPausedExplicitly) return;

    var p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        autoplayBlocked = true;
        setStatus(s("tapPlay"), "warn");
      });
    }
  }

  function indexOfId(id) {
    for (var i = 0; i < latestTracks.length; i++) {
      if (latestTracks[i].id === id) return i;
    }
    return -1;
  }

  function playSpecific(t) {
    // Manual click in the recent list: play that piece and continue
    // the queue from the following entry on ended.
    userPausedExplicitly = false;
    var idx = indexOfId(t.id);
    if (idx >= 0) queueIndex = idx;
    swapTo(t, { forcePlay: true });
  }

  // --- polling ----------------------------------------------------------

  function fetchTracks() {
    var url = "data/tracks.json?ts=" + Date.now();
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function tick() {
    fetchTracks()
      .then(function (tracks) {
        setLive(true);
        if (!Array.isArray(tracks) || tracks.length === 0) {
          latestTracks = [];
          queueIndex = 0;
          renderStandby();
          return;
        }

        var prevTopId = latestTracks.length ? latestTracks[0].id : null;
        latestTracks = tracks;
        var top = tracks[0];
        wasPlaying = !audio.paused && !audio.ended;

        if (currentId == null) {
          // First fetch with content; start the station from the top.
          queueIndex = 0;
          swapTo(top);
        } else if (top.id !== prevTopId) {
          // A new hourly piece just arrived. Jump to it and resume
          // playback if the user was already listening.
          queueIndex = 0;
          swapTo(top);
        } else {
          // Same head; keep the listener wherever they are in the queue.
          // Reanchor queueIndex against the (possibly reshuffled) array.
          var idx = indexOfId(currentId);
          if (idx >= 0) queueIndex = idx;
          renderCurrent(latestTracks[queueIndex] || top);
        }
        renderRecent(tracks);
      })
      .catch(function (err) {
        setLive(false);
        setStatus(s("couldNotRefresh") + " (" + err.message + ").", "warn");
      });
  }

  // --- bootstrap --------------------------------------------------------

  setLanguage(currentLang);
  titleEl.textContent = s("tuningIn");
  tick();
  setInterval(tick, POLL_MS);
})();
