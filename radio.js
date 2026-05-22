(function () {
  "use strict";

  // Lingtai Radio: a semi-live study music stream.
  // Plays the newest track in data/tracks.json on loop, polls every POLL_MS
  // for a new top track, and switches over without stopping the user.

  var POLL_MS = 60 * 1000;

  var audio = document.getElementById("audio");
  var liveDot = document.getElementById("live-dot");
  var statusEl = document.getElementById("status");

  var titleEn = document.getElementById("np-title-en");
  var titleZh = document.getElementById("np-title-zh");
  var titleWy = document.getElementById("np-title-wy");
  var metaEl = document.getElementById("np-meta");
  var promptEn = document.getElementById("np-prompt-en");
  var promptZh = document.getElementById("np-prompt-zh");
  var promptWy = document.getElementById("np-prompt-wy");
  var recentEl = document.getElementById("recent-list");

  var currentId = null;
  var wasPlaying = false;
  var userPausedExplicitly = false;
  var autoplayBlocked = false;
  var suppressPauseEvent = false;

  audio.addEventListener("pause", function () {
    // Treat a pause as explicit if it wasn't us swapping the source.
    if (suppressPauseEvent) return;
    if (!audio.ended && audio.currentSrc) {
      userPausedExplicitly = true;
    }
  });
  audio.addEventListener("play", function () {
    userPausedExplicitly = false;
    autoplayBlocked = false;
    setStatus("");
  });

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso || "";
      return d.toLocaleString(undefined, {
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

  // --- i18n fallbacks ---------------------------------------------------
  // Records written before the trilingual generator update only have
  // {title, prompt, created_at}. Synthesize Chinese/Wenyan from the
  // timestamp so the UI is never blank in any language.

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
    // 12 two-hour blocks: 子 covers 23-1, etc. Simple mapping is fine.
    var h = d.getHours();
    var idx = Math.floor(((h + 1) % 24) / 2);
    return HOUR_ZH[idx];
  }

  function fallbackTitleZh(t) {
    if (!t.created_at) return "灵台一曲";
    var d = new Date(t.created_at);
    if (isNaN(d.getTime())) return "灵台一曲";
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

  function fallbackTitleWy(t) {
    if (!t.created_at) return "灵台之曲";
    var d = new Date(t.created_at);
    if (isNaN(d.getTime())) return "灵台之曲";
    return "灵台一曲 · " + hourLabelZh(d);
  }

  function fallbackPromptZh(t) {
    var d = t.created_at ? new Date(t.created_at) : null;
    var hour = d && !isNaN(d.getTime()) ? hourLabelZh(d) : "此刻";
    return hour + "学习音乐：以古琴、琵琶、竹笛与柔和铺底营造专注气氛，适合阅读、写作与深度工作。";
  }

  function fallbackPromptWy(t) {
    var d = t.created_at ? new Date(t.created_at) : null;
    var hour = d && !isNaN(d.getTime()) ? hourLabelZh(d) : "此刻";
    return hour + "清音：琴瑟笛箫，缓而不扰，可佐读书、属文、凝神。";
  }

  function display(t) {
    var d = t.display || {};
    return {
      title_en: (d.title && d.title.en) || t.title || t.id || "Lingtai broadcast",
      title_zh: (d.title && d.title.zh) || fallbackTitleZh(t),
      title_wy: (d.title && d.title.wy) || fallbackTitleWy(t),
      prompt_en: (d.prompt && d.prompt.en) || t.prompt || "",
      prompt_zh: (d.prompt && d.prompt.zh) || fallbackPromptZh(t),
      prompt_wy: (d.prompt && d.prompt.wy) || fallbackPromptWy(t),
    };
  }

  // --- rendering --------------------------------------------------------

  function renderCurrent(t) {
    var v = display(t);
    titleEn.textContent = v.title_en;
    titleZh.textContent = v.title_zh;
    titleWy.textContent = v.title_wy;
    metaEl.textContent = fmtDate(t.created_at);
    promptEn.textContent = v.prompt_en;
    promptZh.textContent = v.prompt_zh;
    promptWy.textContent = v.prompt_wy;
  }

  function renderRecent(tracks) {
    recentEl.innerHTML = "";
    // Skip the current piece; show up to 8 prior pieces.
    var prior = tracks.slice(1, 9);
    if (prior.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No earlier pieces yet. / 暂无 / 阙如。";
      recentEl.appendChild(empty);
      return;
    }

    prior.forEach(function (t) {
      var v = display(t);
      var li = document.createElement("li");

      var titleEnEl = document.createElement("div");
      titleEnEl.className = "recent-title";
      titleEnEl.textContent = v.title_en;

      var titleZhEl = document.createElement("div");
      titleZhEl.className = "recent-title-zh";
      titleZhEl.textContent = v.title_zh;

      var meta = document.createElement("div");
      meta.className = "recent-meta";
      meta.textContent = fmtDate(t.created_at);

      li.appendChild(titleEnEl);
      li.appendChild(titleZhEl);
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
    audio.loop = true;
    suppressPauseEvent = false;
    currentId = t.id;
    renderCurrent(t);

    var shouldPlay = opts.forcePlay || (hadSrc ? wasPlaying : true);
    if (!shouldPlay || userPausedExplicitly) return;

    var p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        autoplayBlocked = true;
        setStatus(
          "Tap play to start the broadcast. / 点击播放以开始 / 击之以闻其音。",
          "warn"
        );
      });
    }
  }

  function playSpecific(t) {
    // Manual selection from the recent list always tries to play.
    userPausedExplicitly = false;
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
          titleEn.textContent = "Standing by.";
          titleZh.textContent = "待播。";
          titleWy.textContent = "未起。";
          metaEl.textContent = "";
          promptEn.textContent = "";
          promptZh.textContent = "";
          promptWy.textContent = "";
          recentEl.innerHTML = "";
          var li = document.createElement("li");
          li.className = "empty";
          li.textContent = "No pieces yet. / 暂无 / 阙如。";
          recentEl.appendChild(li);
          return;
        }

        var top = tracks[0];
        wasPlaying = !audio.paused && !audio.ended;

        if (top.id !== currentId) {
          swapTo(top);
        } else {
          renderCurrent(top);
        }
        renderRecent(tracks);
      })
      .catch(function (err) {
        setLive(false);
        setStatus(
          "Could not refresh broadcasts (" +
            err.message +
            "). / 暂时无法刷新 / 暂未能新。",
          "warn"
        );
      });
  }

  tick();
  setInterval(tick, POLL_MS);
})();
