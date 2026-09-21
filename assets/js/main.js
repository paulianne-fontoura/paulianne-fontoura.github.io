import { Scene, F, COLORS, perspective, lookAt } from './scene.js';

const root = document.documentElement;
const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduce = reduceQuery.matches;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const els = {
  hero: $('#haut'),
  title: $('.hero__title'),
  words: $$('.hero__word'),
  about: $('#a-propos'),
  pin: $('.about__pin'),
  paras: $$('.about__p'),
  track: $('.about__track'),
  projets: $('#projets'),
  pubs: $('#publications'),
  pubsList: $('.pubs__list'),
  skills: $('#competences'),
  stage: $('.skills__stage'),
  contact: $('#contact'),
  mail: $('.contact__mail'),
  back: $('#scene-back'),
  front: $('#scene-front'),
  nav: $$('.hd__nav a'),
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------------ */
/* Nom du hero ajusté à la largeur disponible                          */
/* ------------------------------------------------------------------ */
function fitHero() {
  const t = els.title;
  t.style.fontSize = '100px';
  const avail = t.clientWidth;
  const widest = Math.max(...els.words.map((w) => w.offsetWidth));
  if (!widest) return;
  let size = (100 * avail) / widest;
  const room = Math.max(innerHeight - 250, 160);
  size = Math.min(size, room / 1.7);
  t.style.fontSize = `${Math.floor(size * 100) / 100}px`;
}

/* ------------------------------------------------------------------ */
/* Titres de section révélés par décodage                              */
/* ------------------------------------------------------------------ */
const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function prepScramble(el) {
  const text = el.textContent.trim();
  el.textContent = '';
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = text;
  const vis = document.createElement('span');
  vis.setAttribute('aria-hidden', 'true');
  el.append(sr, vis);
  el._scr = { text, vis };
  vis.textContent = text;
  el.classList.add('is-waiting');
}

function runScramble(el) {
  const { text, vis } = el._scr;
  const letters = [...text];
  vis.textContent = '';
  const spans = letters.map((c) => {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = c === ' ' ? ' ' : c;
    vis.appendChild(s);
    return s;
  });
  // largeur de chaque lettre figée pendant l'animation, pas de saut de ligne
  const widths = spans.map((s) => s.getBoundingClientRect().width);
  spans.forEach((s, i) => { s.style.width = `${widths[i]}px`; });
  el.classList.remove('is-waiting');
  const n = letters.length;
  const dur = 420 + n * 55;
  const start = performance.now();
  let last = 0;
  const tick = (now) => {
    const t = now - start;
    const swap = now - last > 55;
    if (swap) last = now;
    let done = true;
    spans.forEach((s, i) => {
      const c = letters[i];
      if (c === ' ') return;
      const at = 140 + (i / Math.max(n - 1, 1)) * (dur - 260);
      if (t >= at) {
        if (s.textContent !== c) { s.textContent = c; s.classList.remove('is-noise'); }
      } else {
        done = false;
        if (t > i * 22 && swap) {
          s.textContent = POOL[(Math.random() * POOL.length) | 0];
          s.classList.add('is-noise');
        }
      }
    });
    if (!done) requestAnimationFrame(tick);
    else vis.textContent = text; // texte d'origine, crénage rétabli
  };
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/* Apparitions au défilement                                           */
/* ------------------------------------------------------------------ */
function setupReveals() {
  const titles = $$('[data-scramble]');
  if (reduce || !('IntersectionObserver' in window)) {
    $$('.reveal').forEach((el) => el.classList.add('is-in'));
    return;
  }
  titles.forEach(prepScramble);
  const scr = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      scr.unobserve(e.target);
      runScramble(e.target);
    }
  }, { threshold: 0.6 });
  titles.forEach((t) => scr.observe(t));

  // décalage des éléments d'un même groupe
  const groups = new Map();
  $$('.reveal').forEach((el) => {
    const g = groups.get(el.parentElement) || [];
    g.push(el);
    groups.set(el.parentElement, g);
  });
  groups.forEach((list) => list.forEach((el, i) => el.style.setProperty('--d', `${i * 0.09}s`)));

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  $$('.reveal').forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------ */
/* Scène et défilement                                                 */
/* ------------------------------------------------------------------ */
// Caméra de chaque formation (angles en radians, distance au centre)
const CAM = {
  [F.SOURCES]: { yaw: 0.0, pitch: 0.06, dist: 10.5, fov: 40 },
  [F.BLOCK]: { yaw: 0.0, pitch: 0.46, dist: 13, fov: 26 },
  [F.PIPELINE]: { yaw: -0.45, pitch: 0.3, dist: 10.6, fov: 36 },
  [F.RECONCILE]: { yaw: 0.25, pitch: 0.46, dist: 13, fov: 26 },
  [F.LAYERS]: { yaw: -0.3, pitch: 0.36, dist: 10, fov: 36 },
  [F.WAVE]: { yaw: 0.15, pitch: 0.34, dist: 10, fov: 40 },
  [F.TRIO]: { yaw: 0.0, pitch: 0.12, dist: 11, fov: 36 },
  [F.LINE]: { yaw: 0.0, pitch: 0.0, dist: 10, fov: 36 },
};
// Placement à l'écran (décalage horizontal en coordonnées normalisées), agitation, ancrage
// Sur écran étroit, les formations passent derrière le texte, d'où une opacité réduite (narrow)
const PLACE = {
  [F.SOURCES]: { x: 0, y: 0, drift: 1, narrow: 0.9 },
  [F.BLOCK]: { x: 0.5, y: -0.16, drift: 0.25, narrow: 0.3 },
  [F.PIPELINE]: { x: 0.5, y: -0.14, drift: 0.2, narrow: 0.3 },
  [F.RECONCILE]: { x: 0.5, y: -0.16, drift: 0.15, narrow: 0.3 },
  [F.LAYERS]: { x: 0.46, y: 0, drift: 0.2, narrow: 0.3 },
  [F.WAVE]: { x: 0, drift: 0.3, anchor: 'pubs', narrow: 0.7 },
  [F.TRIO]: { x: 0, drift: 0.2, anchor: 'stage', narrow: 0.9 },
  [F.LINE]: { x: 0, drift: 0.12, anchor: 'mail', narrow: 0.9 },
};
const HOLD = 0.4;

const state = {
  scene: null,
  keys: [],
  pinned: true,
  aboutTop: 0,
  aboutRange: 1,
  k3: 0,
  heroH: 0,
  cssW: 0,
  cssH: 0,
  dpr: 1,
  smooth: 0,
  pointer: [0, 0],
  pointerSmooth: [0, 0],
  t0: performance.now(),
  introStart: null,
  last: performance.now(),
  frames: 0,
  slow: 0,
  downgraded: false,
  proj: new Float32Array(16),
  view: new Float32Array(16),
};

function docTop(el) {
  return el.getBoundingClientRect().top + scrollY;
}

function layout() {
  fitHero();
  const vh = innerHeight;
  state.pinned = getComputedStyle(els.pin).position === 'sticky';
  state.aboutTop = docTop(els.about);
  state.aboutRange = Math.max(1, els.about.offsetHeight - vh);
  let k1, k2, k3;
  if (state.pinned) {
    k1 = state.aboutTop;
    k2 = state.aboutTop + state.aboutRange * 0.36;
    k3 = state.aboutTop + state.aboutRange * 0.72;
  } else {
    [k1, k2, k3] = els.paras.map((p) => docTop(p) - vh * 0.55);
  }
  state.k3 = k3;
  const keys = [
    { s: 0, f: F.SOURCES },
    { s: k1, f: F.BLOCK },
    { s: k2, f: F.PIPELINE },
    { s: k3, f: F.RECONCILE },
    { s: docTop(els.projets) + vh * 0.1, f: F.LAYERS },
    { s: docTop(els.pubs) - vh * 0.05, f: F.WAVE },
    { s: docTop(els.skills) - vh * 0.05, f: F.TRIO },
    { s: docTop(els.contact) - vh * 0.3, f: F.LINE },
  ];
  for (let i = 1; i < keys.length; i++) keys[i].s = Math.max(keys[i].s, keys[i - 1].s + 1);
  state.keys = keys;
  state.heroH = els.hero.offsetHeight;

  if (state.scene) {
    const r = els.back.getBoundingClientRect();
    state.cssW = r.width;
    state.cssH = r.height;
    const cap = state.downgraded ? 1 : (innerWidth < 720 ? 1.75 : 2);
    state.dpr = Math.min(devicePixelRatio || 1, cap);
    state.scene.resize(Math.round(r.width * state.dpr), Math.round(r.height * state.dpr));
  }
}

function timeline(s) {
  const k = state.keys;
  if (s <= k[0].s) return { from: k[0].f, to: k[0].f, t: 0 };
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i];
    const b = k[i + 1];
    if (s < b.s) {
      const h = a.s + (b.s - a.s) * HOLD;
      const t = s <= h ? 0 : (s - h) / (b.s - h);
      return { from: a.f, to: b.f, t };
    }
  }
  const last = k[k.length - 1];
  return { from: last.f, to: last.f, t: 0 };
}

// Position verticale de la formation, fixe ou accrochée à un élément de la page
function anchorY(f, narrow) {
  const a = PLACE[f].anchor;
  if (!a) return narrow ? 0 : PLACE[f].y;
  let cy;
  if (a === 'stage') {
    const r = els.stage.getBoundingClientRect();
    cy = r.top + r.height / 2;
  } else if (a === 'pubs') {
    cy = els.pubsList.getBoundingClientRect().bottom + state.cssH * 0.24;
  } else {
    cy = els.mail.getBoundingClientRect().bottom + 30;
  }
  return 1 - (2 * cy) / state.cssH;
}

function updateAbout(s) {
  if (!state.pinned) return;
  const p = clamp((s - state.aboutTop) / state.aboutRange, 0, 1);
  els.track.style.setProperty('--p', p.toFixed(4));
  const active = p < 0.27 ? 0 : p < 0.62 ? 1 : 2;
  els.paras.forEach((el, i) => el.classList.toggle('is-active', i === active));
}

// En-tête masqué en descendant, visible en remontant
const header = $('.hd');
let lastScroll = scrollY;
function updateHeader() {
  const y = scrollY;
  if (y > lastScroll + 6 && y > 160) header.classList.add('is-hidden');
  else if (y < lastScroll - 6 || y <= 160) header.classList.remove('is-hidden');
  lastScroll = y;
}

function updateNav() {
  updateHeader();
  const probe = scrollY + innerHeight * 0.4;
  let current = null;
  for (const id of ['a-propos', 'projets', 'publications', 'competences', 'contact']) {
    const el = document.getElementById(id);
    if (docTop(el) <= probe) current = id;
  }
  els.nav.forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === `#${current}`));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - state.last) / 1000);
  state.last = now;
  const s = scrollY;
  const k = reduce ? 1 : 1 - Math.exp(-dt * 7);
  state.smooth += (s - state.smooth) * k;
  if (Math.abs(s - state.smooth) < 0.05) state.smooth = s;
  const sm = state.smooth;

  updateAbout(sm);
  if (!state.scene) return;

  // qualité adaptative, un seul palier
  if (!state.downgraded && state.introStart !== null) {
    state.frames++;
    if (dt > 0.028) state.slow++;
    if (state.frames === 120) {
      if (state.slow > 60) { state.downgraded = true; layout(); }
    }
  }

  const tl = timeline(sm);
  let t = tl.t;
  if (reduce) t = t < 0.5 ? 0 : 1;
  const e = ease(t);
  const ca = CAM[tl.from];
  const cb = CAM[tl.to];
  const aspect = state.cssW / state.cssH;
  const narrow = innerWidth < 900;

  state.pointerSmooth[0] += (state.pointer[0] - state.pointerSmooth[0]) * (reduce ? 0 : 1 - Math.exp(-dt * 3));
  state.pointerSmooth[1] += (state.pointer[1] - state.pointerSmooth[1]) * (reduce ? 0 : 1 - Math.exp(-dt * 3));

  const yaw = mix(ca.yaw, cb.yaw, e) + state.pointerSmooth[0] * 0.07;
  const pitch = mix(ca.pitch, cb.pitch, e) - state.pointerSmooth[1] * 0.04;
  let dist = mix(ca.dist, cb.dist, e);
  if (aspect < 1.25) dist *= 1 + (1.25 - aspect) * 0.75;
  const fov = (mix(ca.fov, cb.fov, e) * Math.PI) / 180;
  const eye = [dist * Math.sin(yaw) * Math.cos(pitch), dist * Math.sin(pitch), dist * Math.cos(yaw) * Math.cos(pitch)];
  lookAt(state.view, eye, [0, 0, 0]);
  perspective(state.proj, fov, aspect, 0.1, 80);

  const visW = 2 * dist * Math.tan(fov / 2) * aspect;
  const shiftX = narrow ? 0 : mix(PLACE[tl.from].x, PLACE[tl.to].x, e);
  const shiftY = mix(anchorY(tl.from, narrow), anchorY(tl.to, narrow), e);
  const trioSpread = narrow ? clamp(visW * 0.3, 1.1, 3.6) : clamp(visW * 0.31, 1.6, 3.8);
  const trioScale = clamp(visW / 9.5, 0.45, 1);

  // sous-avancement de la réconciliation
  const sub = clamp((sm - state.k3) / (state.aboutRange * 0.22), 0, 1);

  const time = reduce ? 14 : (now - state.t0) / 1000;
  let intro = 1;
  if (!reduce) intro = state.introStart === null ? 0 : clamp((now - state.introStart) / 2600, 0, 1);

  const inHero = sm < state.heroH * 0.75;
  const split = inHero && state.scene.front ? dist : 0;
  const opacity = narrow ? mix(PLACE[tl.from].narrow, PLACE[tl.to].narrow, e) : 0.9;
  const r = els.projets.getBoundingClientRect();
  const bandAmp = Math.min(150, state.cssH * 0.16, state.cssW * 0.11);
  const bandLead = Math.min(state.cssH * 0.06, state.cssW * 0.045);

  state.scene.render({
    u_time: time,
    u_intro: intro,
    u_from: { int: [tl.from] },
    u_to: { int: [tl.to] },
    u_t: t,
    u_sub: sub,
    u_proj: state.proj,
    u_view: state.view,
    u_shift: [shiftX, shiftY],
    u_size: (narrow ? 1.9 : 2.1) * state.dpr,
    u_drift: reduce ? 0 : mix(PLACE[tl.from].drift, PLACE[tl.to].drift, e),
    u_arc: reduce ? 0 : 1,
    u_fit: [aspect, trioSpread, trioScale, visW * 1.1],
    u_ink: COLORS.ink,
    u_paper: COLORS.paper,
    u_grey: COLORS.grey,
    u_accent: COLORS.accent,
    u_accent2: COLORS.accent2,
    u_split: split,
    u_opacity: opacity,
    u_res: [els.back.width, els.back.height],
    u_dpr: state.dpr,
    u_band: [r.top, r.bottom, bandAmp, bandLead],
    u_grain: reduce ? 0 : 0.022,
  }, split > 0);
  els.front.style.visibility = split > 0 ? 'visible' : 'hidden';
}

function startScene() {
  const small = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  const count = small ? 14000 : 36000;
  try {
    state.scene = new Scene(els.back, els.front, count);
  } catch (err) {
    console.warn('Scène 3D désactivée', err);
    root.classList.add('no-webgl');
    state.scene = null;
    return;
  }
  els.back.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    root.classList.add('no-webgl');
    state.scene = null;
  });
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */
function onReady() {
  layout();
  root.classList.add('is-ready');
  state.introStart = performance.now();
}

startScene();
setupReveals();
layout();
state.smooth = scrollY;
requestAnimationFrame(frame);

const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(onReady);

let resizeTimer = 0;
let lastW = innerWidth;
let lastH = innerHeight;
addEventListener('resize', () => {
  // la barre d'adresse mobile change la hauteur, seules les variations nettes comptent
  if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 120) return;
  lastW = innerWidth;
  lastH = innerHeight;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 120);
});
addEventListener('load', layout);
if ('ResizeObserver' in window) new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); }).observe(document.body);
addEventListener('scroll', updateNav, { passive: true });
updateNav();
addEventListener('pointermove', (ev) => {
  state.pointer[0] = (ev.clientX / innerWidth) * 2 - 1;
  state.pointer[1] = (ev.clientY / innerHeight) * 2 - 1;
}, { passive: true });
reduceQuery.addEventListener?.('change', (ev) => { reduce = ev.matches; });
