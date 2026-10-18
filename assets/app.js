/* Comic reader: everything is driven by comics.json ("series": [...]) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const img = (im, size) => `${im.base}?format=${im.format}&name=${size}`;
  const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const load = () => fetch('comics.json', { cache: 'no-cache' }).then(r => r.json());
  const count = ch => ch.parts.reduce((n, p) => n + p.images.length, 0);
  const name = c => c.title ? `${c.label}: ${c.title}` : c.label;
  const ext = (href, txt) => `<a href="${esc(href)}" target="_blank" rel="noopener">${txt}</a>`;
  const chURL = (s, c) => `read.html?s=${encodeURIComponent(s.id)}&ch=${encodeURIComponent(c.key)}`;
  const linkify = t => esc(t).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

  function storyCredit(s) {
    const st = s.story || {};
    let h = `Story by ${ext(st.author_url, '@' + esc(st.author))}`;
    if (st.wattpad) h += `, read it on ${ext(st.wattpad, 'Wattpad')}`;
    if (st.source_post) h += `, read the original ${ext(st.source_post, 'fic post on X')}`;
    return h;
  }

  function pageLabels(part) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.pages || '');
    const n = part.images.length;
    if (m) {
      const a = +m[1], b = m[2] ? +m[2] : a;
      if (b - a + 1 === n) return part.images.map((_, i) => 'p. ' + (a + i));
    }
    return part.images.map((_, i) => `pp. ${part.pages} (${i + 1}/${n})`);
  }

  function seriesIndex(s, db) {
    const items = [];
    const have = s.chapters.map(c => s.toc.findIndex(t => t.key === c.key));
    const lastIdx = Math.max(-1, ...have);
    s.toc.forEach((t, i) => {
      const ch = s.chapters.find(c => c.key === t.key);
      if (ch) {
        const first = ch.parts[0], last = ch.parts[ch.parts.length - 1];
        items.push(`<li><a class="ch" href="${chURL(s, ch)}">
          <img loading="lazy" referrerpolicy="no-referrer" src="${img(first.images[0], 'small')}" alt="">
          <span><span class="t">${esc(name(ch))}</span><br>
          <span class="s">${ch.parts.length} post${ch.parts.length > 1 ? 's' : ''} · ${count(ch)} pages · posted ${fmtDate(first.date)}${first.date.slice(0, 10) !== last.date.slice(0, 10) ? ' – ' + fmtDate(last.date) : ''}</span></span></a></li>`);
      } else if (s.parser === 'chapter_part' && i < lastIdx) {
        items.push(`<li class="missing">${esc(name(t))}, not adapted as a comic (skipped by the artist).${t.wattpad ? ' ' + ext(t.wattpad, 'Read the text on Wattpad') : ''}</li>`);
      }
    });
    const next = s.parser === 'chapter_part' ? s.toc[lastIdx + 1] : null;
    if (next) items.push(`<li class="missing">Next in the story: ${esc(name(next))}, not out as a comic yet.</li>`);
    const pages = s.chapters.reduce((n, c) => n + count(c), 0);
    return `<section class="series" id="${esc(s.id)}">
      <h2>${esc(s.title)}</h2>
      ${s.subtitle ? `<p class="sub">${esc(s.subtitle)}</p>` : ''}
      <p class="credit">Comic art by ${ext(db.artist.url, '@' + esc(db.artist.handle))} · ${storyCredit(s)}</p>
      <p><a class="btn primary" href="read.html?s=${encodeURIComponent(s.id)}&all=1">Read ${esc(s.short || s.title)} from the start</a>
      <span class="s meta">${s.chapters.length} chapter${s.chapters.length === 1 ? '' : 's'} · ${pages} pages</span></p>
      <ol class="chapters">${items.join('')}</ol>
      ${s.notes && s.notes.length ? '<div class="notes"><strong>Notes</strong><ul>' + s.notes.map(n => `<li>${linkify(n)}</li>`).join('') + '</ul></div>' : ''}
    </section>`;
  }

  function index() {
    load().then(db => {
      const total = db.series.reduce((n, s) => n + s.chapters.reduce((m, c) => m + count(c), 0), 0);
      $('#meta').textContent = `${db.series.length} series · ${total} pages · last updated ${fmtDate(db.updated)}`;
      $('#jump').innerHTML = db.series.map(s => `<a class="btn" href="#${esc(s.id)}">${esc(s.title)}</a>`).join('');
      $('#series').innerHTML = db.series.map(s => seriesIndex(s, db)).join('');
      if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
    });
  }

  function chapterHTML(s, ch, db) {
    const t = s.toc.find(x => x.key === ch.key) || {};
    const src = t.wattpad ? ext(t.wattpad, 'read the chapter text') : t.source ? ext(t.source, 'read the original fic') : '';
    let h = `<header class="chhead" id="ch-${esc(ch.key)}"><div class="s">${esc(s.title)}</div><h2>${esc(name(ch))}</h2>
      <div class="s">${count(ch)} pages · art by ${ext(db.artist.url, '@' + esc(db.artist.handle))} · story by ${ext(s.story.author_url, '@' + esc(s.story.author))}${src ? ' · ' + src : ''}</div></header>`;
    ch.parts.forEach(p => {
      const labels = pageLabels(p);
      p.images.forEach((im, i) => {
        h += `<figure class="pg"><a href="${im.orig}" target="_blank" rel="noopener"><img loading="lazy" referrerpolicy="no-referrer" src="${img(im, 'large')}" ${im.width ? `width="${im.width}" height="${im.height}"` : ''} alt="${esc(ch.label)}, Part ${esc(p.part)}, ${labels[i]}"></a>
          <figcaption><span>${esc(ch.label)} · Part ${esc(p.part)} · ${labels[i]}</span>${ext(p.url, 'original post on X ↗')}</figcaption></figure>`;
      });
    });
    return h;
  }

  function reader() {
    const q = new URLSearchParams(location.search);
    load().then(db => {
      const s = db.series.find(x => x.id === q.get('s')) || db.series[0];
      const chs = s.chapters;
      const all = q.has('all');
      const idx = all ? -1 : Math.max(0, chs.findIndex(c => c.key === q.get('ch')));
      const prevA = $('#prevCh'), nextA = $('#nextCh');
      const sc = $('#storycredit'); if (sc) sc.innerHTML = ext(s.story.author_url, '@' + esc(s.story.author));
      $('.bar .home').href = 'index.html#' + s.id;
      if (all) {
        $('#pages').innerHTML = chs.map(c => chapterHTML(s, c, db)).join('');
        $('#where').textContent = `${s.title}: all chapters`;
        document.title = `Read all · ${s.title}`;
        prevA.classList.add('disabled'); nextA.classList.add('disabled');
        $('#bottomnav').innerHTML = `<a class="btn" href="index.html#${esc(s.id)}">☰ Chapters</a><a class="btn" href="#">↑ Top</a>`;
      } else {
        const ch = chs[idx];
        $('#pages').innerHTML = chapterHTML(s, ch, db);
        $('#where').textContent = `${s.short || s.title} · ${name(ch)}`;
        document.title = `${name(ch)} · ${s.title}`;
        const link = (a, c) => { if (c) { a.href = chURL(s, c); a.title = name(c); } else a.classList.add('disabled'); };
        link(prevA, chs[idx - 1]); link(nextA, chs[idx + 1]);
        const p = chs[idx - 1], n = chs[idx + 1];
        $('#bottomnav').innerHTML = (p ? `<a class="btn" href="${chURL(s, p)}">‹ ${esc(p.label)}</a>` : '<span></span>') +
          (n ? `<a class="btn primary" href="${chURL(s, n)}">${esc(name(n))} ›</a>` : `<a class="btn" href="index.html#${esc(s.id)}">☰ All chapters</a>`);
      }
      const figs = () => Array.from(document.querySelectorAll('figure.pg'));
      const current = () => { const f = figs(); const i = f.findIndex(e => e.getBoundingClientRect().bottom > 70); return i < 0 ? f.length - 1 : i; };
      const go = i => { const f = figs(); if (f[i]) f[i].scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      document.addEventListener('keydown', e => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const fwd = e.key === 'ArrowRight';
        if (e.shiftKey && !all) { const a = fwd ? nextA : prevA; if (a.href) location.href = a.href; return; }
        const f = figs(); if (!f.length) return;
        const i = current(), top = f[i].getBoundingClientRect().top;
        if (fwd) { if (top > 62) go(i); else if (i + 1 < f.length) go(i + 1); else if (!all && nextA.href) location.href = nextA.href; }
        else { if (top < 42) go(i); else if (i > 0) go(i - 1); else if (!all && prevA.href) location.href = prevA.href; }
      });
    });
  }
  window.Draconia = { index, reader };
})();
