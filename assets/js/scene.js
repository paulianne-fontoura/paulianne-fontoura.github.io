// Nuage de points en WebGL2. Chaque point calcule sa position dans le shader
// pour chacune des formations, la page choisit la formation de départ, celle
// d'arrivée et l'avancement de la transition selon le défilement.

export const F = {
  SOURCES: 0,   // trois sources hétérogènes
  BLOCK: 1,     // données modélisées, bloc régulier
  PIPELINE: 2,  // chaîne complète, un flux qui change de forme
  RECONCILE: 3, // réconciliation de deux blocs, écarts signalés
  LAYERS: 4,    // états successifs d'un jeu de données
  WAVE: 5,      // nappe calme
  TRIO: 6,      // trois familles de compétences
  LINE: 7,      // ligne de base
};

const COMMON = /* glsl */ `
const float PI = 3.14159265;
const float TAU = 6.28318531;
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

// Bande sombre à bords courbes, alignée sur la section Projets du DOM.
const BAND = /* glsl */ `
uniform vec2 u_res;
uniform float u_dpr;
uniform vec4 u_band; // haut, bas (px CSS depuis le haut de la fenêtre), amplitude, avance du liseré
struct Edges { float y; float eTop; float gTop; float eBot; float gBot; };
Edges bandEdges(vec2 fc) {
  float W = u_res.x / u_dpr;
  float H = u_res.y / u_dpr;
  float xn = clamp(fc.x / u_dpr / W, 0.0, 1.0);
  float y = (u_res.y - fc.y) / u_dpr;
  float b = sin(PI * xn) * (0.82 + 0.18 * sin(TAU * xn + 0.6));
  float kt = smoothstep(-0.05 * H, H, u_band.x);
  float kb = smoothstep(-0.05 * H, H, u_band.y);
  Edges e;
  e.y = y;
  e.eTop = u_band.x - u_band.z * kt * b;
  e.gTop = e.eTop - u_band.w * kt * (0.45 + 0.55 * b);
  e.eBot = u_band.y - u_band.z * kb * b;
  e.gBot = e.eBot + u_band.w * kb * (0.45 + 0.55 * b);
  return e;
}
`;

const VS_POINTS = /* glsl */ `#version 300 es
precision highp float;
in vec4 a_seed;
uniform float u_count;
uniform float u_time;
uniform float u_intro;
uniform int u_from;
uniform int u_to;
uniform float u_t;
uniform float u_sub;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec2 u_shift;
uniform float u_size;
uniform float u_drift;
uniform float u_arc;
uniform vec3 u_block;
uniform vec3 u_block2;
uniform vec4 u_fit; // x aspect, y écart du trio, z échelle du trio, w largeur de la ligne
out float v_alpha;
out float v_hi;
out float v_depth;
${COMMON}
struct Fm { vec3 p; float hi; float a; };

vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }

vec3 lattice(float id, vec3 d) {
  float ix = mod(id, d.x);
  float iy = mod(floor(id / d.x), d.y);
  float iz = floor(id / (d.x * d.y));
  return vec3(ix / max(d.x - 1.0, 1.0), iy / max(d.y - 1.0, 1.0), iz / max(d.z - 1.0, 1.0)) - 0.5;
}

// 0. Trois sources hétérogènes, disposées autour du nom
Fm fSources(float id, vec4 s, float T) {
  float k = clamp(u_fit.x / 1.6, 0.42, 1.0);
  float c = floor(s.x * 3.0);
  vec3 p;
  vec3 at;
  if (c < 0.5) {
    // API, structures imbriquées
    float shell = floor(s.y * 3.0);
    float r = 0.5 + shell * 0.36;
    float z = 1.0 - 2.0 * s.z;
    float rr = sqrt(max(0.0, 1.0 - z * z));
    float th = TAU * s.w;
    p = r * vec3(rr * cos(th), z, rr * sin(th));
    float dir = mod(shell, 2.0) < 0.5 ? 1.0 : -1.0;
    p = rotY(p, T * (0.09 + 0.05 * shell) * dir);
    p = rotX(p, 0.5 + 0.25 * shell);
    at = vec3(-3.35, 0.7, -0.6);
  } else if (c < 1.5) {
    // exports métier, tableau quadrillé aux cellules plus ou moins remplies
    float cols = 7.0;
    float rows = 11.0;
    vec2 size = vec2(2.6, 2.1);
    float u = fract(s.y * 2.0);
    if (s.y < 0.45) {
      // filets du tableau
      if (s.w < 0.5) {
        float r = floor(u * (rows + 1.0));
        p = vec3((s.z - 0.5) * size.x, (r / rows - 0.5) * size.y, 0.0);
      } else {
        float k2 = floor(u * (cols + 1.0));
        p = vec3((k2 / cols - 0.5) * size.x, (s.z - 0.5) * size.y, 0.0);
      }
    } else {
      // contenu des cellules, un trait par cellule
      float cell = floor(u * cols * rows);
      float ix = mod(cell, cols);
      float iy = floor(cell / cols);
      float fill = 0.15 + 0.6 * hash11(cell * 1.73 + 4.0);
      vec2 cs = size / vec2(cols, rows);
      p = vec3((ix + 0.14 + s.z * fill) * cs.x - size.x * 0.5, (iy + 0.5) * cs.y - size.y * 0.5, 0.0);
      p.y += (s.w - 0.5) * 0.016;
    }
    p.z += 0.05 * sin(p.x * 2.0 + T * 0.7);
    p = rotY(p, -0.66 + 0.06 * sin(T * 0.21));
    p = rotX(p, -0.24);
    p = rotZ(p, 0.08);
    // en format portrait, le tableau descend sous le titre du poste
    at = vec3(3.05, -0.55 - (1.0 - k) * 1.25, 1.25);
  } else {
    // fichiers plats, lignes de longueurs variables
    float lines = 22.0;
    float li = floor(s.y * lines);
    float len = 0.3 + 0.7 * hash11(li * 3.17 + 1.0);
    float x = s.z * len;
    float ci = floor(x * 64.0);
    x += step(hash11(ci * 7.13 + li * 61.0), 0.17) / 64.0;
    p = vec3((x - 0.5) * 3.3, (0.5 - li / (lines - 1.0)) * 2.0 + (s.w - 0.5) * 0.03, 0.0);
    p = rotY(p, 0.55 + 0.05 * sin(T * 0.17));
    p = rotX(p, 0.16);
    at = vec3(0.6, 2.05, -2.9);
  }
  p *= mix(0.62, 1.0, k) * 1.15;
  at.x *= k;
  at.y *= mix(2.1, 1.0, k);
  p += at;
  p += 0.05 * vec3(sin(T * 0.5 + s.w * TAU), cos(T * 0.4 + s.z * TAU), sin(T * 0.3 + s.y * TAU));
  return Fm(p, 0.0, 1.0);
}

// 1. Bloc régulier, lignes et colonnes. Plusieurs points par nœud, chaque nœud forme un point net
Fm fBlock(float id, vec4 s, float T) {
  vec3 d = vec3(11.0, 7.0, 11.0);
  float nid = mod(id, d.x * d.y * d.z);
  vec3 p = lattice(nid, d) * vec3(2.9, 1.75, 2.9);
  p += (s.xyz - 0.5) * 0.008;
  p = rotY(p, 0.62 + T * 0.035);
  return Fm(p, 0.0, 1.0);
}

// 2. Chaîne complète, quatre étapes reliées par un flux
//    collecte (nuage), modélisation (table), entrepôt (cylindre), restitution (histogramme)
vec3 station(float k, vec4 s, float T) {
  if (k < 0.5) {
    vec3 q = normalize(vec3(hash11(s.x * 17.3), s.y, s.z) - 0.5 + 0.0001) * pow(s.w, 0.6) * 0.62;
    q += 0.05 * vec3(sin(T * 0.8 + s.y * 31.0), cos(T * 0.7 + s.z * 29.0), sin(T * 0.6 + s.x * 23.0));
    return q;
  } else if (k < 1.5) {
    float n = 6.0;
    float line = floor(s.w * (n + 1.0)) / n - 0.5;
    float along = s.z - 0.5;
    vec2 q = hash11(s.x * 91.7) < 0.5 ? vec2(along, line) : vec2(line, along);
    return vec3(q * 1.05, 0.0);
  } else if (k < 2.5) {
    float disc = floor(s.w * 5.0);
    float a = TAU * s.z + T * 0.2;
    return vec3(0.42 * cos(a), (disc / 4.0 - 0.5) * 0.95, 0.42 * sin(a));
  }
  float b = floor(s.w * 5.0);
  float h = 0.3 + 0.75 * hash11(b * 5.3 + 2.0);
  return vec3((b - 2.0) * 0.23 + (s.z - 0.5) * 0.11, hash11(s.x * 57.1) * h - 0.5, 0.0);
}
Fm fPipeline(float id, vec4 s, float T) {
  float ph = fract(s.x * 0.97 + s.y * 0.03 + T * 0.028);
  float st = ph * 4.0;
  float k = floor(st);
  float f = fract(st);
  float gap = 1.55;
  vec3 A = vec3((k - 1.5) * gap, 0.0, 0.0) + station(k, s, T);
  vec3 p = A;
  float a = 1.0;
  if (f > 0.72) {
    float m = smoothstep(0.72, 1.0, f);
    vec3 B = vec3((k - 0.5) * gap, 0.0, 0.0) + station(mod(k + 1.0, 4.0), s, T);
    p = mix(A, B, m);
    p.yz *= 1.0 - 0.88 * sin(PI * m);
    if (k > 2.5) a = 1.0 - m;
  }
  if (k < 0.5 && f < 0.12) a = f / 0.12;
  p = rotY(p * 0.8, -0.35);
  return Fm(p, 0.0, a);
}

// 3. Deux blocs identiques se superposent, les cellules en écart restent visibles
Fm fReconcile(float id, vec4 s, float T) {
  vec3 d = vec3(9.0, 6.0, 9.0);
  float side = mod(id, 2.0);
  float nid = mod(floor(id / 2.0), d.x * d.y * d.z);
  vec3 p = lattice(nid, d) * vec3(2.3, 1.5, 2.3);
  p += (s.xyz - 0.5) * 0.008;
  float gap = mix(1.6, 0.0, smoothstep(0.0, 1.0, u_sub));
  p.x += side < 0.5 ? -gap : gap;
  float hi = 0.0;
  if (side > 0.5 && hash11(nid * 1.7 + 3.0) < 0.035) {
    hi = 1.0;
    p += normalize(vec3(hash11(nid * 1.31), hash11(nid * 2.17), hash11(nid * 3.71)) - 0.5) * 0.13;
  }
  p = rotY(p, 0.3 + 0.05 * sin(T * 0.1));
  p = rotX(p, 0.08);
  return Fm(p, hi, 1.0);
}

// 4. États successifs, des feuilles quadrillées empilées, quelques cellules corrigées
Fm fLayers(float id, vec4 s, float T) {
  float K = 7.0;
  float per = ceil(u_count / K);
  float layer = floor(id / per);
  float n = 10.0;
  float line = floor(s.y * (n + 1.0)) / n - 0.5;
  float along = s.z - 0.5;
  vec2 q = s.x < 0.5 ? vec2(along, line) : vec2(line, along);
  float hi = 0.0;
  if (s.w < 0.03) {
    // quatre cellules corrigées par état, remplies
    hi = 1.0;
    float k = floor(s.x * 4.0);
    vec2 cell = floor(vec2(hash11(layer * 7.1 + k * 3.3), hash11(layer * 5.3 + k * 1.7)) * n);
    q = (cell + 0.5) / n - 0.5 + (vec2(s.y, s.z) - 0.5) * 0.7 / n;
  }
  vec3 p = vec3(q.x * 3.0, 0.0, q.y * 3.0);
  float m = mod(layer + T * 0.08, K);
  float c = m - (K - 1.0) * 0.5;
  p.y = c * 0.5;
  p.x += c * 0.1;
  p = rotY(p, -0.55 + 0.05 * sin(T * 0.12));
  float a = smoothstep(0.0, 0.8, m) * smoothstep(K, K - 0.8, m);
  return Fm(p, hi, a);
}

// 5. Nappe calme
Fm fWave(float id, vec4 s, float T) {
  float g = ceil(sqrt(u_count));
  float ix = mod(id, g);
  float iz = floor(id / g);
  vec3 p = vec3(ix / (g - 1.0) - 0.5, 0.0, iz / (g - 1.0) - 0.5) * vec3(14.0, 0.0, 7.0);
  p.y = 0.3 * sin(p.x * 0.7 + T * 0.35) * cos(p.z * 0.7 - T * 0.25);
  float a = 0.5 * smoothstep(3.5, 1.0, p.z);
  return Fm(p, 0.0, a);
}

// 6. Trois familles, trois formes ordonnées
Fm fTrio(float id, vec4 s, float T) {
  float grp = floor(s.x * 3.0);
  vec3 p;
  if (grp < 0.5) {
    // données, treillis
    float n = 4.0;
    float axis = floor(s.y * 3.0);
    vec2 q = floor(vec2(s.z, s.w) * (n + 1.0)) / n - 0.5;
    float t = hash11(id * 0.37) - 0.5;
    p = axis < 0.5 ? vec3(t, q) : (axis < 1.5 ? vec3(q.x, t, q.y) : vec3(q, t));
    p *= 1.5;
    p = rotY(p, T * 0.12 + 0.6);
    p = rotX(p, 0.38);
  } else if (grp < 1.5) {
    // ingénierie, boucle d'intégration continue
    float a = TAU * s.y + T * 0.35;
    float b = TAU * s.z;
    float R = 0.84;
    float r = 0.15;
    p = vec3((R + r * cos(b)) * cos(a), (R + r * cos(b)) * sin(a), r * sin(b));
    p = rotX(p, 1.05);
    p = rotY(p, 0.35 * sin(T * 0.2));
  } else {
    // restitution, histogramme
    float b = floor(s.y * 6.0);
    float h = 0.35 + 1.2 * hash11(b * 3.1 + 7.0) * (0.93 + 0.07 * sin(T * 0.8 + b));
    p = vec3((b - 2.5) * 0.29 + (s.z - 0.5) * 0.17, s.w * h - 0.75, (hash11(id * 0.71) - 0.5) * 0.17);
    p = rotY(p, -0.35);
  }
  p *= u_fit.z;
  p.x += (grp - 1.0) * u_fit.y;
  return Fm(p, 0.0, 1.0);
}

// 7. Ligne de base
Fm fLine(float id, vec4 s, float T) {
  float x = (id / u_count - 0.5) * u_fit.w;
  float y = 0.045 * sin(x * 1.1 - T * 1.1) + (s.y - 0.5) * 0.01;
  // une petite partie des points suffit pour un trait fin, les autres s'effacent
  float a = hash11(id * 0.618) < 0.1 ? 0.75 : 0.0;
  return Fm(vec3(x, y, (s.z - 0.5) * 0.04), 0.0, a);
}

Fm formation(int k, float id, vec4 s, float T) {
  if (k == 0) return fSources(id, s, T);
  if (k == 1) return fBlock(id, s, T);
  if (k == 2) return fPipeline(id, s, T);
  if (k == 3) return fReconcile(id, s, T);
  if (k == 4) return fLayers(id, s, T);
  if (k == 5) return fWave(id, s, T);
  if (k == 6) return fTrio(id, s, T);
  return fLine(id, s, T);
}

void main() {
  float id = float(gl_VertexID);
  vec4 s = a_seed;
  float T = u_time;
  Fm A = formation(u_from, id, s, T);
  Fm B = A;
  if (u_to != u_from) B = formation(u_to, id, s, T);
  float st = clamp((u_t - s.w * 0.35) / 0.65, 0.0, 1.0);
  st = st * st * (3.0 - 2.0 * st);
  vec3 p = mix(A.p, B.p, st);
  float arc = sin(PI * st) * u_arc;
  p.y += arc * (0.2 + 0.8 * s.z);
  p += arc * 0.7 * (s.xyz - 0.5);
  p += u_drift * 0.035 * vec3(sin(T * 0.6 + s.x * TAU), sin(T * 0.5 + s.y * TAU), sin(T * 0.4 + s.z * TAU));

  float ti = clamp((u_intro - s.y * 0.4) / 0.6, 0.0, 1.0);
  ti = 1.0 - pow(1.0 - ti, 3.0);
  vec3 far = normalize(s.xyz - 0.5 + 0.001) * (10.0 + 9.0 * s.w);
  p = mix(far, p, ti);

  vec4 vp = u_view * vec4(p, 1.0);
  vec4 cp = u_proj * vp;
  cp.xy += u_shift * cp.w;
  gl_Position = cp;
  float dist = max(-vp.z, 0.1);
  v_hi = mix(A.hi, B.hi, st);
  gl_PointSize = clamp(u_size * (10.0 / dist) * (0.7 + 0.6 * s.z) * (1.0 + 0.9 * v_hi), 1.0, 48.0);
  v_depth = dist;
  v_alpha = mix(A.a, B.a, st) * ti * smoothstep(34.0, 9.0, dist) * smoothstep(3.0, 5.5, dist);
}
`;

const FS_POINTS = /* glsl */ `#version 300 es
precision highp float;
in float v_alpha;
in float v_hi;
in float v_depth;
uniform vec3 u_ink;
uniform vec3 u_paper;
uniform vec3 u_accent;
uniform vec3 u_accent2;
uniform float u_layer;   // 0 derrière le texte, 1 devant
uniform float u_split;   // distance du plan du titre, 0 si inactif
uniform float u_opacity;
out vec4 o;
${COMMON}
${BAND}
void main() {
  if (u_split > 0.0) {
    bool near = v_depth < u_split;
    if (u_layer < 0.5 && near) discard;
    if (u_layer > 0.5 && !near) discard;
  } else if (u_layer > 0.5) {
    discard;
  }
  vec2 c = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.3, length(c));
  if (m <= 0.0) discard;
  Edges e = bandEdges(gl_FragCoord.xy);
  float dark = step(e.eTop, e.y) * step(e.y, e.eBot);
  vec3 base = mix(u_ink, u_paper, dark);
  vec3 acc = mix(u_accent, u_accent2, dark);
  vec3 col = mix(base, acc, v_hi);
  float a = m * v_alpha * u_opacity * (1.0 + 0.15 * v_hi);
  a = clamp(a, 0.0, 1.0);
  o = vec4(col * a, a);
}
`;

const VS_BG = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FS_BG = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 u_ink;
uniform vec3 u_paper;
uniform vec3 u_grey;
uniform float u_time;
uniform float u_grain;
out vec4 o;
${COMMON}
${BAND}
void main() {
  Edges e = bandEdges(gl_FragCoord.xy);
  float aa = 0.9;
  float grey = smoothstep(e.gTop - aa, e.gTop + aa, e.y) * (1.0 - smoothstep(e.gBot - aa, e.gBot + aa, e.y));
  float dark = smoothstep(e.eTop - aa, e.eTop + aa, e.y) * (1.0 - smoothstep(e.eBot - aa, e.eBot + aa, e.y));
  vec3 col = mix(u_paper, u_grey, grey);
  col = mix(col, u_ink, dark);
  float n = hash12(gl_FragCoord.xy + floor(u_time * 18.0) * 37.0) - 0.5;
  col += n * u_grain * mix(1.0, 1.6, dark);
  o = vec4(col, 1.0);
}
`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const COLORS = {
  ink: hex('#0c0d0f'),
  paper: hex('#eeede8'),
  grey: hex('#d6d4cd'),
  accent: hex('#2340ff'),
  accent2: hex('#8e9bff'),
};

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function link(gl, vs, fs, attribs = []) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const loc = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    loc[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { p, loc };
}

// Affecte les uniformes présents dans le programme, selon la forme de la valeur
function setUniforms(gl, prog, u) {
  for (const k in u) {
    const l = prog.loc[k];
    if (l === undefined) continue;
    const v = u[k];
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v.int) gl.uniform1i(l, v.int[0]);
    else if (v.length === 16) gl.uniformMatrix4fv(l, false, v);
    else if (v.length === 2) gl.uniform2fv(l, v);
    else if (v.length === 3) gl.uniform3fv(l, v);
    else if (v.length === 4) gl.uniform4fv(l, v);
  }
}

class Layer {
  constructor(canvas, seeds, count, withBackground) {
    const gl = canvas.getContext('webgl2', {
      alpha: !withBackground,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl;
    this.canvas = canvas;
    this.count = count;
    this.points = link(gl, VS_POINTS, FS_POINTS, ['a_seed']);
    this.bg = withBackground ? link(gl, VS_BG, FS_BG) : null;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.emptyVao = gl.createVertexArray();
  }

  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  draw(u, layer) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.bg) {
      gl.disable(gl.BLEND);
      gl.useProgram(this.bg.p);
      setUniforms(gl, this.bg, u);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (layer === 1 && !(u.u_split > 0)) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.points.p);
    setUniforms(gl, this.points, u);
    gl.uniform1f(this.points.loc.u_layer, layer);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.bindVertexArray(null);
  }
}

// Générateur pseudo-aléatoire déterministe, même nuage à chaque visite
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function latticeDims(n) {
  const ny = Math.max(2, Math.round(Math.cbrt(n / 2.25)));
  const nx = Math.ceil(Math.sqrt(n / ny));
  return [nx, ny, nx];
}

export class Scene {
  constructor(back, front, count) {
    const rnd = mulberry32(20260921);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
    this.count = count;
    this.block = latticeDims(count);
    this.block2 = latticeDims(Math.floor(count / 2));
    this.back = new Layer(back, seeds, count, true);
    this.front = null;
    try { this.front = new Layer(front, seeds, count, false); } catch (e) { this.front = null; }
  }

  resize(w, h) {
    this.back.resize(w, h);
    if (this.front) this.front.resize(w, h);
  }

  render(u, frontVisible) {
    u.u_count = this.count;
    u.u_block = this.block;
    u.u_block2 = this.block2;
    this.back.draw(u, 0);
    if (this.front && frontVisible) this.front.draw(u, 1);
  }
}

// Outils de caméra
export function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function lookAt(out, eye, target) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  // up = (0, 1, 0)
  let xx = zz, xy = 0, xz = -zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}
