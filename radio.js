(function () {
  "use strict";

  var audio = document.getElementById("audio");
  var tracksEl = document.getElementById("tracks");
  var npTitle = document.querySelector("#now-playing .np-title");
  var npMeta = document.querySelector("#now-playing .np-meta");

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return iso;
    }
  }

  function render(tracks) {
    tracksEl.innerHTML = "";

    if (!tracks || tracks.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent =
        "No tracks yet. Check back at the top of the hour.";
      tracksEl.appendChild(empty);
      npTitle.textContent = "Standing by.";
      npMeta.textContent = "";
      return;
    }

    tracks.forEach(function (t, idx) {
      var li = document.createElement("li");
      li.dataset.index = String(idx);

      var title = document.createElement("div");
      title.className = "track-title";
      title.textContent = t.title || t.id || "Untitled";

      var meta = document.createElement("div");
      meta.className = "track-meta";
      meta.textContent = fmtDate(t.created_at);

      var prompt = document.createElement("div");
      prompt.className = "track-prompt";
      prompt.textContent = t.prompt || "";

      li.appendChild(title);
      li.appendChild(meta);
      if (t.prompt) li.appendChild(prompt);

      li.addEventListener("click", function () {
        play(tracks, idx);
      });

      tracksEl.appendChild(li);
    });

    play(tracks, 0);
  }

  function play(tracks, idx) {
    var t = tracks[idx];
    if (!t || !t.file) return;

    audio.src = t.file;
    audio.play().catch(function () {
      // Autoplay may be blocked; user can press play.
    });

    npTitle.textContent = t.title || t.id || "Untitled";
    npMeta.textContent = fmtDate(t.created_at);

    Array.prototype.forEach.call(tracksEl.children, function (li, i) {
      if (i === idx) li.classList.add("active");
      else li.classList.remove("active");
    });
  }

  fetch("data/tracks.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(render)
    .catch(function (err) {
      npTitle.textContent = "Could not load broadcasts.";
      npMeta.textContent = String(err);
    });
})();
