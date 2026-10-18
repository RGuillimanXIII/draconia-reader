/* Draconia reader: everything is driven by comics.json */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const img = (im, size) => `${im.base}?format=${im.format}&name=${size}`;
  const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const load = () => fetch('comics.json', { cache: 'no-cache' }).then(r => r.json());
  const count = ch => ch.parts.reduce((n, p) => n + p.images.length, 0);

  function pageLabels(part) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.pages || '');
    const n = part.images.length;
    if (m) {
      const a = +m[1], b = m[2] ? +m[2] : a;
      if (b - a + 1 === n) return part.images.map((_, i) => 'p. ' + (a + i));
    }
    return part.images.map((_, i) => `pp. ${part.pages} (${i + 1}/${n})`);
  }

  function index() {
    load().then(db => {
      const total = db.chapters.reduce((n, c) => n + count(c), 0);
      $('#meta').textContent = `${db.chapters.length} chapters · ${total} pages · last updated ${fmtDate(db.updated)}`;
      const have = new Set(db.chapters.map(c => c.key));
      const lastIdx = Math.max(...db.chapters.map(c => db.toc.findIndex(t => t.key === c.key)));
      const items = [];
      db.toc.forEach((t, i) => {
        const ch = db.chapters.find(c => c.key === t.key);
        if (ch) {
          const first = ch.parts[0], last = ch.parts[ch.parts.length - 1];
          items.push(`<li><a class="ch" href="read.html?ch=${encodeURIComponent(ch.key)}">
            <img loading="lazy" referrerpolicy="no-referrer" src="${img(first.images[0], 'small')}" alt="">
            <span><span class="t">${esc(ch.label)}: ${esc(ch.title)}</span><br>
            <span class="s">${ch.parts.length} posts · ${count(ch)} pages · posted ${fmtDate(first.date)}${first.date.slice(0, 10) !== last.date.slice(0, 10) ? ' – ' + fmtDate(last.date) : ''}</span></span></a></li>`);
        } else if (i < lastIdx) {
          items.push(`<li class="missing">${esc(t.label)}: ${esc(t.title)}, not adapted as a comic (skipped by the artist). <a href="${esc(t.wattpad)}" target="_blank" rel="noopener">Read the text on Wattpad</a></li>`);
        }
      });
      const next = db.toc[lastIdx + 1];
      if (next) items.push(`<li class="missing">Next in the story: ${esc(next.label)}: ${esc(next.title)}, not out as a comic yet.</li>`);
      $('#chapters').innerHTML = items.join('');
      if (db.notes && db.notes.length) $('#notes').innerHTML = '<h3>Notes</h3><ul>' + db.notes.map(n => `<li>${esc(n).replace(/(https:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')}</li>`).join('') + '</ul>';
    });
  }

  function chapterHTML(ch, db) {
    const t = db.toc.find(x => x.key === ch.key) || {};
    let h = `<header class="chhead" id="ch-${esc(ch.key)}"><div class="s">${esc(ch.label)}</div><h2>${esc(ch.title)}</h2>
      <div class="s">${count(ch)} pages · art by <a href="${db.artist.url}" target="_blank" rel="noopener">@${esc(db.artist.handle)}</a>${t.wattpad ? ` · <a href="${esc(t.wattpad)}" target="_blank" rel="noopener">read the chapter text</a>` : ''}</div></header>`;
    ch.parts.forEach(p => {
      const labels = pageLabels(p);
      p.images.forEach((im, i) => {
        h += `<figure class="pg"><a href="${im.orig}" target="_blank" rel="noopener"><img loading="lazy" referrerpolicy="no-referrer" src="${img(im, 'large')}" ${im.width ? `width="${im.width}" height="${im.height}"` : ''} alt="${esc(ch.label)}, Part ${esc(p.part)}, ${labels[i]}"></a>
          <figcaption><span>${esc(ch.label)} · Part ${esc(p.part)} · ${labels[i]}</span><a href="${p.url}" target="_blank" rel="noopener">original post on X ↗</a></figcaption></figure>`;
      });
    });
    return h;
  }

  function reader() {
    const q = new URLSearchParams(location.search);
    load().then(db => {
      const chs = db.chapters;
      const all = q.has('all');
      let idx = all ? -1 : Math.max(0, chs.findIndex(c => c.key === q.get('ch')));
      const pagesEl = $('#pages');
      const prevA = $('#prevCh'), nextA = $('#nextCh');
      if (all) {
        pagesEl.innerHTML = chs.map(c => chapterHTML(c, db)).join('');
        $('#where').textContent = 'All chapters in story order';
        document.title = 'Read all · Draconia Malfoy and the Boy Who Said No';
        prevA.classList.add('disabled'); nextA.classList.add('disabled');
        $('#bottomnav').innerHTML = `<a class="btn" href="index.html">☰ Chapters</a><a class="btn" href="#">↑ Top</a>`;
      } else {
        const ch = chs[idx];
        pagesEl.innerHTML = chapterHTML(ch, db);
        $('#where').textContent = `${ch.label}: ${ch.title}`;
        document.title = `${ch.label}: ${ch.title} · Draconia`;
        const link = (a, c, txt) => { if (c) { a.href = 'read.html?ch=' + encodeURIComponent(c.key); a.title = `${c.label}: ${c.title}`; } else a.classList.add('disabled'); };
        link(prevA, chs[idx - 1]); link(nextA, chs[idx + 1]);
        const p = chs[idx - 1], n = chs[idx + 1];
        $('#bottomnav').innerHTML = (p ? `<a class="btn" href="read.html?ch=${encodeURIComponent(p.key)}">‹ ${esc(p.label)}</a>` : '<span></span>') +
          (n ? `<a class="btn primary" href="read.html?ch=${encodeURIComponent(n.key)}">${esc(n.label)}: ${esc(n.title)} ›</a>` : `<a class="btn" href="index.html">☰ All chapters</a>`);
      }
      const figs = () => Array.from(document.querySelectorAll('figure.pg'));
      const current = () => { const f = figs(); const y = 60; let i = f.findIndex(e => e.getBoundingClientRect().bottom > y + 10); return i < 0 ? f.length - 1 : i; };
      const go = i => { const f = figs(); if (f[i]) f[i].scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      document.addEventListener('keydown', e => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const fwd = e.key === 'ArrowRight';
        if (e.shiftKey && !all) { const a = fwd ? nextA : prevA; if (a.href) location.href = a.href; return; }
        const i = current(), f = figs();
        if (!f.length) return;
        const top = f[i].getBoundingClientRect().top;
        if (fwd) { if (top > 62) go(i); else if (i + 1 < f.length) go(i + 1); else if (!all && nextA.href) location.href = nextA.href; }
        else { if (top < 42) go(i); else if (i > 0) go(i - 1); else if (!all && prevA.href) location.href = prevA.href; }
      });
    });
  }
  window.Draconia = { index, reader };
})();
