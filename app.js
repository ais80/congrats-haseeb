(() => {
  const root = document.documentElement;

  /* ── Soundtrack ──────────────────────────────────────────────
     The first track is the background theme. To swap the theme,
     move a different track to the top of this list. */
  const TRACKS = [
    { title: 'Horizon Burns Tonight', src: 'assets/audio/horizon-burns-tonight.mp3', len: '2:55' },
    { title: 'Wave It High',          src: 'assets/audio/wave-it-high.mp3',          len: '2:58' },
    { title: 'Titan of the Ages',     src: 'assets/audio/titan-of-the-ages.mp3',     len: '2:42' },
    { title: 'Tsar in Luxury',        src: 'assets/audio/tsar-in-luxury.mp3',        len: '3:01' },
    { title: 'Jään ja lumen yli',     src: 'assets/audio/jaan-ja-lumen-yli.mp3',     len: '3:03' },
    { title: 'Dharti Hildi',          src: 'assets/audio/dharti-hildi.mp3',          len: '3:00' },
    { title: 'Duniya Hilayenge',      src: 'assets/audio/duniya-hilayenge.mp3',      len: '3:01' },
  ];

  const audio = new Audio();
  audio.preload = 'auto';
  let current = -1;
  let resumeAfterVideo = false;

  const dock = document.getElementById('dock');
  const dockToggle = document.getElementById('dockToggle');
  const nowTitle = document.getElementById('nowTitle');
  const bar = document.getElementById('bar');
  const list = document.getElementById('tracks');

  const ICONS =
    '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>' +
    '<svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>';

  const rows = TRACKS.map((t, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'track';
    btn.innerHTML =
      `<span class="track__icon">${ICONS}</span>` +
      `<span class="track__title"></span>` +
      `<span class="track__meta">${i === 0 ? '<span class="track__tag">Theme</span>' : ''}${t.len}</span>`;
    btn.querySelector('.track__title').textContent = t.title;
    btn.setAttribute('aria-label', `Play ${t.title}`);
    btn.addEventListener('click', () => (i === current ? toggle() : play(i)));
    li.appendChild(btn);
    list.appendChild(li);
    return btn;
  });

  function load(i) {
    current = i;
    audio.src = TRACKS[i].src;
    audio.loop = i === 0; // the theme loops; other tracks hand back to it
    nowTitle.textContent = TRACKS[i].title;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: TRACKS[i].title,
        artist: 'Congratulations, Haseeb',
        artwork: [{ src: 'assets/og.jpg', sizes: '1200x630', type: 'image/jpeg' }],
      });
    }
    syncRows();
  }

  function play(i) {
    if (i !== current) load(i);
    resumeAfterVideo = false;
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  }

  function toggle() {
    if (current < 0) return play(0);
    if (audio.paused) play(current);
    else { resumeAfterVideo = false; audio.pause(); }
  }

  function syncRows() {
    rows.forEach((btn, i) => {
      btn.classList.toggle('is-current', i === current);
      btn.classList.toggle('is-playing', i === current && !audio.paused);
      btn.setAttribute('aria-label', `${i === current && !audio.paused ? 'Pause' : 'Play'} ${TRACKS[i].title}`);
    });
    dock.classList.toggle('is-paused', audio.paused);
    dockToggle.setAttribute('aria-label', audio.paused ? 'Play music' : 'Pause music');
  }

  audio.addEventListener('play', syncRows);
  audio.addEventListener('pause', syncRows);
  audio.addEventListener('ended', () => { if (current !== 0) play(0); });
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) bar.style.setProperty('--p', (audio.currentTime / audio.duration).toFixed(4));
  });
  dockToggle.addEventListener('click', toggle);

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => play(current < 0 ? 0 : current));
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => play((current + 1) % TRACKS.length));
    navigator.mediaSession.setActionHandler('previoustrack', () => play((current - 1 + TRACKS.length) % TRACKS.length));
  }

  /* ── Films: the music steps aside while a film plays ───────── */
  const videos = [...document.querySelectorAll('.act video')];
  videos.forEach((v) => {
    v.addEventListener('play', () => {
      videos.forEach((o) => { if (o !== v) o.pause(); });
      if (!audio.paused) { resumeAfterVideo = true; audio.pause(); }
    });
    const handBack = () => {
      if (videos.some((o) => !o.paused && !o.ended)) return;
      if (resumeAfterVideo) { resumeAfterVideo = false; const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
    };
    v.addEventListener('pause', handBack);
    v.addEventListener('ended', handBack);
  });

  /* ── Locked media ────────────────────────────────────────────
     Pictures and films are stored as AES-GCM ciphertext (m/*.bin). The key
     arrives in the QR link's #fragment, which browsers never send to a server.
     It is checked against a small test file, then kept for this tab only. */
  let cryptoKey = null;
  let manifestP = null;
  const blobs = new Map(); // logical name -> Promise<blob URL>

  const b64uToBytes = (str) => {
    let t = str.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  };

  function manifest() {
    if (!manifestP) {
      manifestP = fetch('manifest.json', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error('manifest');
        return r.json();
      });
    }
    return manifestP;
  }

  async function decryptEntry(name) {
    const entry = (await manifest())[name];
    if (!entry) throw new Error('missing ' + name);
    const res = await fetch(entry.f);
    if (!res.ok) throw new Error('fetch ' + name);
    const buf = await res.arrayBuffer();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, cryptoKey, buf.slice(12));
    return { plain, type: entry.t };
  }

  function blobUrl(name) {
    if (!blobs.has(name)) {
      const p = decryptEntry(name).then(({ plain, type }) => URL.createObjectURL(new Blob([plain], { type })));
      p.catch(() => blobs.delete(name));
      blobs.set(name, p);
    }
    return blobs.get(name);
  }

  // 'ok', 'bad' (wrong key), 'net' (could not fetch) or 'insecure' (no WebCrypto)
  async function tryKey(str) {
    if (!(window.crypto && crypto.subtle)) return 'insecure';
    try {
      const raw = b64uToBytes(str);
      if (raw.length !== 16) return 'bad';
      cryptoKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
      const { plain } = await decryptEntry('check');
      if (new TextDecoder().decode(plain) !== 'haseeb-ok') throw new DOMException('bad', 'OperationError');
      try { sessionStorage.setItem('hk', str); } catch (e) { /* private mode */ }
      return 'ok';
    } catch (e) {
      cryptoKey = null;
      return e instanceof DOMException ? 'bad' : 'net';
    }
  }

  // Pick the smaller or larger picture for this screen.
  function variant(base) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth;
    if (base === 'headliner') {
      // the opening poster: full width on phones, about 70% of the screen height on desktop
      const w = (vw >= 860 ? Math.min(vw * 0.5, window.innerHeight * 0.7) : vw) * dpr;
      return base + (w <= 640 ? '-700' : '-1400');
    }
    return base + (vw * dpr <= 1100 ? '-960' : '-1920');
  }

  function reveal(el) {
    if (!el._p) {
      el._p = (async () => {
        try {
          if (el.dataset.encBg) {
            el.style.setProperty('--bg-img', `url("${await blobUrl(el.dataset.encBg + '-960')}")`);
          } else if (el.tagName === 'VIDEO') {
            const [poster, src] = await Promise.all([blobUrl(el.dataset.enc + '-poster'), blobUrl(el.dataset.enc)]);
            el.poster = poster;
            el.src = src;
          } else {
            el.src = await blobUrl(variant(el.dataset.enc));
          }
        } catch (e) { el._p = null; }
      })();
    }
    return el._p;
  }

  function watchMedia() {
    const els = [...document.querySelectorAll('[data-enc], [data-enc-bg]')];
    if (!('IntersectionObserver' in window)) { els.forEach(reveal); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); reveal(en.target); } });
    }, { rootMargin: '1400px 0px' });
    els.forEach((el) => io.observe(el));
  }

  // Deterrent only: no context menu on pictures and films.
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest && e.target.closest('.hero, .scene, .act, .sound__bg')) e.preventDefault();
  });

  /* ── The cupboard ──────────────────────────────────────────── */
  const gate = document.getElementById('gate');
  const enter = document.getElementById('enter');
  const lockLabel = document.getElementById('lockLabel');
  const keyForm = document.getElementById('keyForm');
  const keyInput = document.getElementById('keyInput');
  const gateNote = document.getElementById('gateNote');
  const NOTE = gateNote.textContent;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let opened = false;
  let pendingTap = false;

  function say(msg, isError) {
    gateNote.textContent = msg;
    gateNote.classList.toggle('is-error', !!isError);
  }

  function setState(state) {
    gate.dataset.state = state;
    const locked = state === 'locked';
    keyForm.hidden = !locked;
    enter.disabled = locked;
    lockLabel.textContent = locked ? 'Locked' : 'Turn the key';
  }

  function finish() {
    if (!gate.isConnected) return;
    gate.remove();
    root.classList.remove('is-locked');
    window.scrollTo(0, 0);
    const main = document.getElementById('top');
    if (main) main.focus({ preventScroll: true });
  }

  function open() {
    opened = true;
    play(0);                       // inside the tap, so phones allow the sound
    dock.hidden = false;
    gate.classList.add('is-open');
    watchMedia();
    const hero = reveal(document.querySelector('.hero__img'));
    Promise.race([hero, new Promise((r) => setTimeout(r, 1500))]).then(() => root.classList.add('is-in'));
    const door = gate.querySelector('.gate__door--r');
    door.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, reduced ? 200 : 3000);
  }

  function readKey() {
    const m = /(?:^|[#&])k=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (m) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      return m[1];
    }
    try { return sessionStorage.getItem('hk'); } catch (e) { return null; }
  }

  function explain(result, hadKey) {
    if (result === 'bad') say(hadKey ? 'That key does not open this cupboard.' : NOTE, !!hadKey);
    else if (result === 'net') say('The locked files did not load. Check your connection and reload.', true);
    else if (result === 'insecure') say('This browser cannot unlock the pictures. Open the link over https in a current browser.', true);
    else say(NOTE);
  }

  enter.addEventListener('click', () => {
    if (opened) return;
    if (gate.dataset.state === 'checking') { pendingTap = true; return; }
    if (gate.dataset.state === 'ready') open();
  });

  keyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const typed = keyInput.value.trim();
    const m = /k=([A-Za-z0-9_-]+)/.exec(typed);       // also accept a pasted full link
    const result = await tryKey(m ? m[1] : typed);
    if (result === 'ok') { say(NOTE); setState('ready'); keyInput.value = ''; }
    else explain(result, true);
  });

  const startKey = readKey();
  if (startKey) {
    setState('checking');
    tryKey(startKey).then((result) => {
      if (result === 'ok') {
        setState('ready');
        if (pendingTap) open();
      } else {
        setState('locked');
        explain(result, true);
      }
    });
  } else {
    setState('locked');
  }
})();
