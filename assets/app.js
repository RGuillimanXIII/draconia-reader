/* Comic reader. Written in plain ES5 (no arrow functions, template literals,
   fetch, Promises, optional chaining, modules or storage) so it runs in old
   and in-app WebViews such as the X / Twitter iOS browser.
   Data comes from comics.js (window.COMICS); comics.json is only a fallback. */
(function () {
  'use strict';
  var started = false, done = false, mode = null;

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function img(im, size) { return im.base + '?format=' + im.format + '&name=' + size; }
  function fmtDate(d) {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return String(d).slice(0, 10); }
  }
  function count(ch) { var n = 0; for (var i = 0; i < ch.parts.length; i++) n += ch.parts[i].images.length; return n; }
  function name(c) { return c.title ? c.label + ': ' + c.title : c.label; }
  function ext(href, txt) { return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + txt + '</a>'; }
  function enc(s) { return encodeURIComponent(s); }
  function chURL(s, c) { return 'read.html?s=' + enc(s.id) + '&ch=' + enc(c.key); }
  function linkify(t) { return esc(t).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); }
  function find(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i], i)) return arr[i]; return null; }
  function findIndex(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i], i)) return i; return -1; }
  function query(key) {
    var m = new RegExp('[?&]' + key + '(=([^&#]*))?(&|#|$)').exec(location.search);
    if (!m) return null;
    try { return decodeURIComponent((m[2] || '').replace(/\+/g, ' ')); } catch (e) { return m[2] || ''; }
  }
  function has(key) { return query(key) !== null; }

  /* ---------- error / loading UI ---------- */
  function target() { return $('#series') || $('#pages'); }
  function showError(why) {
    if (done) return;
    done = true;
    var el = target();
    if (!el) return;
    el.innerHTML = '<div class="error"><h2>The comic list didn\'t load</h2>' +
      '<p>' + esc(why || 'Something went wrong while loading the page.') + '</p>' +
      '<p><button type="button" class="btn primary" id="retryBtn">Try again</button></p>' +
      '<p class="s">Opened from the X app? Its built-in browser sometimes blocks pages. Tap <b>⋯</b> or the share icon and choose <b>Open in Safari</b> (or your browser), or copy this link:<br>' +
      '<a href="' + esc(location.href) + '">' + esc(location.href) + '</a></p></div>';
    var b = $('#retryBtn');
    if (b) b.onclick = function () {
      var u = location.href.replace(/([?&])_r=\d+&?/, '$1').replace(/[?&]$/, '');
      location.href = u + (u.indexOf('?') < 0 ? '?' : '&') + '_r=' + new Date().getTime();
    };
  }
  window.onerror = function (msg) { if (!done) showError('Script error: ' + msg); };

  /* ---------- data ---------- */
  function getData(cb) {
    if (window.COMICS && window.COMICS.series) return cb(null, window.COMICS);
    // Fallback: comics.js didn't load, so try comics.json with XHR (not fetch).
    var x;
    try { x = new XMLHttpRequest(); } catch (e) { return cb(new Error('This browser cannot load data.')); }
    var v = (window.COMICS_VERSION || '') + '-' + new Date().getTime();
    x.open('GET', 'comics.json?v=' + enc(v), true);
    x.timeout = 15000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status >= 200 && x.status < 300 || (x.status === 0 && x.responseText)) {
        var d;
        try { d = JSON.parse(x.responseText); } catch (e) { return cb(new Error('The comic data was damaged in transit.')); }
        cb(null, d);
      } else {
        cb(new Error('Couldn\'t download the comic data' + (x.status ? ' (HTTP ' + x.status + ')' : '') + '.'));
      }
    };
    x.ontimeout = function () { cb(new Error('Loading the comic data timed out.')); };
    try { x.send(); } catch (e) { cb(new Error('Couldn\'t download the comic data.')); }
  }
  function run(render) {
    if (started) return; started = true;
    setTimeout(function () { if (!done) showError('Loading is taking too long.'); }, 20000);
    getData(function (err, db) {
      if (done) return;
      if (err) return showError(err.message);
      try { render(db); done = true; }
      catch (e) { showError('Couldn\'t show the comics: ' + (e && e.message ? e.message : e)); }
    });
  }

  /* ---------- index ---------- */
  function storyCredit(s) {
    var st = s.story || {};
    var h = 'Story by ' + ext(st.author_url, '@' + esc(st.author));
    if (st.wattpad) h += ', read it on ' + ext(st.wattpad, 'Wattpad');
    if (st.source_post) h += ', read the original ' + ext(st.source_post, 'fic post on X');
    return h;
  }
  function seriesIndex(s, db) {
    var items = [], lastIdx = -1, i;
    for (i = 0; i < s.chapters.length; i++) {
      var key = s.chapters[i].key;
      var ti = findIndex(s.toc, function (t) { return t.key === key; });
      if (ti > lastIdx) lastIdx = ti;
    }
    for (i = 0; i < s.toc.length; i++) {
      var t = s.toc[i];
      var ch = find(s.chapters, function (c) { return c.key === t.key; });
      if (ch) {
        var first = ch.parts[0], last = ch.parts[ch.parts.length - 1];
        var range = fmtDate(first.date) + (String(first.date).slice(0, 10) !== String(last.date).slice(0, 10) ? ' – ' + fmtDate(last.date) : '');
        items.push('<li><a class="ch" href="' + chURL(s, ch) + '">' +
          '<img loading="lazy" referrerpolicy="no-referrer" src="' + img(first.images[0], 'small') + '" alt="">' +
          '<span><span class="t">' + esc(name(ch)) + '</span><br>' +
          '<span class="s">' + ch.parts.length + ' post' + (ch.parts.length > 1 ? 's' : '') + ' · ' + count(ch) + ' pages · posted ' + range + '</span></span></a></li>');
      } else if (s.parser === 'chapter_part' && i < lastIdx) {
        items.push('<li class="missing">' + esc(name(t)) + ', not adapted as a comic (skipped by the artist).' + (t.wattpad ? ' ' + ext(t.wattpad, 'Read the text on Wattpad') : '') + '</li>');
      }
    }
    var next = s.parser === 'chapter_part' ? s.toc[lastIdx + 1] : null;
    if (next) items.push('<li class="missing">Next in the story: ' + esc(name(next)) + ', not out as a comic yet.</li>');
    var pages = 0; for (i = 0; i < s.chapters.length; i++) pages += count(s.chapters[i]);
    var notes = '';
    if (s.notes && s.notes.length) {
      notes = '<div class="notes"><strong>Notes</strong><ul>';
      for (i = 0; i < s.notes.length; i++) notes += '<li>' + linkify(s.notes[i]) + '</li>';
      notes += '</ul></div>';
    }
    return '<section class="series" id="' + esc(s.id) + '">' +
      '<h2>' + esc(s.title) + '</h2>' +
      (s.subtitle ? '<p class="sub">' + esc(s.subtitle) + '</p>' : '') +
      '<p class="credit">Comic art by ' + ext(db.artist.url, '@' + esc(db.artist.handle)) + ' · ' + storyCredit(s) + '</p>' +
      '<p><a class="btn primary" href="read.html?s=' + enc(s.id) + '&all=1">Read ' + esc(s.short || s.title) + ' from the start</a> ' +
      '<span class="s meta">' + s.chapters.length + ' chapter' + (s.chapters.length === 1 ? '' : 's') + ' · ' + pages + ' pages</span></p>' +
      '<ol class="chapters">' + items.join('') + '</ol>' + notes + '</section>';
  }
  function renderIndex(db) {
    var total = 0, i, j, html = '', jump = '';
    for (i = 0; i < db.series.length; i++) for (j = 0; j < db.series[i].chapters.length; j++) total += count(db.series[i].chapters[j]);
    for (i = 0; i < db.series.length; i++) {
      html += seriesIndex(db.series[i], db);
      jump += '<a class="btn" href="#' + esc(db.series[i].id) + '">' + esc(db.series[i].title) + '</a>';
    }
    $('#series').innerHTML = html;
    if ($('#jump')) $('#jump').innerHTML = jump;
    if ($('#meta')) $('#meta').textContent = db.series.length + ' series · ' + total + ' pages · last updated ' + fmtDate(db.updated);
    if (location.hash) { var el = document.getElementById(location.hash.slice(1)); if (el && el.scrollIntoView) el.scrollIntoView(); }
  }

  /* ---------- reader ---------- */
  function pageLabels(part) {
    var m = /^(\d+)(?:-(\d+))?$/.exec(part.pages || ''), n = part.images.length, out = [], i;
    if (m) {
      var a = +m[1], b = m[2] ? +m[2] : a;
      if (b - a + 1 === n) { for (i = 0; i < n; i++) out.push('p. ' + (a + i)); return out; }
    }
    for (i = 0; i < n; i++) out.push('pp. ' + part.pages + ' (' + (i + 1) + '/' + n + ')');
    return out;
  }
  function chapterHTML(s, ch, db) {
    var t = find(s.toc, function (x) { return x.key === ch.key; }) || {};
    var src = t.wattpad ? ext(t.wattpad, 'read the chapter text') : (t.source ? ext(t.source, 'read the original fic') : '');
    var h = '<header class="chhead" id="ch-' + esc(ch.key) + '"><div class="s">' + esc(s.title) + '</div><h2>' + esc(name(ch)) + '</h2>' +
      '<div class="s">' + count(ch) + ' pages · art by ' + ext(db.artist.url, '@' + esc(db.artist.handle)) +
      ' · story by ' + ext(s.story.author_url, '@' + esc(s.story.author)) + (src ? ' · ' + src : '') + '</div></header>';
    for (var i = 0; i < ch.parts.length; i++) {
      var p = ch.parts[i], labels = pageLabels(p);
      for (var j = 0; j < p.images.length; j++) {
        var im = p.images[j];
        h += '<figure class="pg"><a href="' + im.orig + '" target="_blank" rel="noopener"><img loading="lazy" referrerpolicy="no-referrer" src="' + img(im, 'large') + '"' +
          (im.width ? ' width="' + im.width + '" height="' + im.height + '"' : '') +
          ' alt="' + esc(ch.label + ', Part ' + p.part + ', ' + labels[j]) + '"></a>' +
          '<figcaption><span>' + esc(ch.label) + ' · Part ' + esc(p.part) + ' · ' + labels[j] + '</span>' + ext(p.url, 'original post on X ↗') + '</figcaption></figure>';
      }
    }
    return h;
  }
  function renderReader(db) {
    var sid = query('s');
    var s = find(db.series, function (x) { return x.id === sid; }) || db.series[0];
    var chs = s.chapters, all = has('all');
    var ck = query('ch');
    var idx = all ? -1 : Math.max(0, findIndex(chs, function (c) { return c.key === ck; }));
    var prevA = $('#prevCh'), nextA = $('#nextCh');
    var sc = $('#storycredit'); if (sc) sc.innerHTML = ext(s.story.author_url, '@' + esc(s.story.author));
    var home = $('.bar .home'); if (home) home.href = 'index.html#' + s.id;
    if (all) {
      var html = '';
      for (var i = 0; i < chs.length; i++) html += chapterHTML(s, chs[i], db);
      $('#pages').innerHTML = html;
      $('#where').textContent = s.title + ': all chapters';
      document.title = 'Read all · ' + s.title;
      prevA.className += ' disabled'; nextA.className += ' disabled';
      $('#bottomnav').innerHTML = '<a class="btn" href="index.html#' + esc(s.id) + '">☰ Chapters</a><a class="btn" href="#">↑ Top</a>';
    } else {
      var ch = chs[idx], p = chs[idx - 1], n = chs[idx + 1];
      $('#pages').innerHTML = chapterHTML(s, ch, db);
      $('#where').textContent = (s.short || s.title) + ' · ' + name(ch);
      document.title = name(ch) + ' · ' + s.title;
      var link = function (a, c) { if (c) { a.href = chURL(s, c); a.title = name(c); } else a.className += ' disabled'; };
      link(prevA, p); link(nextA, n);
      $('#bottomnav').innerHTML = (p ? '<a class="btn" href="' + chURL(s, p) + '">‹ ' + esc(p.label) + '</a>' : '<span></span>') +
        (n ? '<a class="btn primary" href="' + chURL(s, n) + '">' + esc(name(n)) + ' ›</a>' : '<a class="btn" href="index.html#' + esc(s.id) + '">☰ All chapters</a>');
    }
    function figs() { return document.querySelectorAll('figure.pg'); }
    function current() {
      var f = figs();
      for (var i = 0; i < f.length; i++) if (f[i].getBoundingClientRect().bottom > 70) return i;
      return f.length - 1;
    }
    function go(i) {
      var f = figs(); if (!f[i]) return;
      try { f[i].scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { f[i].scrollIntoView(true); }
    }
    function hrefOf(a) { return a && a.getAttribute('href'); }
    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key || '', code = e.keyCode;
      var fwd = k === 'ArrowRight' || code === 39, back = k === 'ArrowLeft' || code === 37;
      if (!fwd && !back) return;
      if (e.preventDefault) e.preventDefault();
      if (e.shiftKey && !all) { var a = fwd ? nextA : prevA; if (hrefOf(a)) location.href = hrefOf(a); return; }
      var f = figs(); if (!f.length) return;
      var i = current(), top = f[i].getBoundingClientRect().top;
      if (fwd) { if (top > 62) go(i); else if (i + 1 < f.length) go(i + 1); else if (!all && hrefOf(nextA)) location.href = hrefOf(nextA); }
      else { if (top < 42) go(i); else if (i > 0) go(i - 1); else if (!all && hrefOf(prevA)) location.href = hrefOf(prevA); }
    });
  }

  window.Draconia = {
    index: function () { run(renderIndex); },
    reader: function () { run(renderReader); }
  };
})();
