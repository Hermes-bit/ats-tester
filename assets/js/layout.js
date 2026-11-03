/* ATS Tester — analyse de la mise en page d'une fiche de poste (tableaux, colonnes, bandeaux)
 * Une fiche de poste est souvent un tableau : deux colonnes, bandeaux de titre colorés, cases à cocher.
 * Lue d'un bloc, ses colonnes se mélangent. Ici on repère les traits du tableau, on en déduit les cases,
 * on lit chaque case séparément puis on remet les blocs dans l'ordre de lecture :
 *   - sections en colonnes (« MISSIONS » | « CONDITIONS ») : colonne par colonne, titre puis contenu ;
 *   - tableau libellé / valeur (« Diplômes » | « Bac + 3… ») : « Diplômes : Bac + 3… ».
 * Sert à l'OCR des documents scannés (image de la page) et aux PDF texte qui contiennent des tableaux.
 * Fonctions pures sur des tableaux de pixels : testées avec Jest sur des images synthétiques.
 */
window.ATS = window.ATS || {};

(function () {
  /* ================= Pixels ================= */
  function toGray(rgba, w, h) {
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    return g;
  }

  /** Réduction ×2 en gardant le pixel le plus sombre : les traits fins restent visibles. */
  function minPool2(g, w, h) {
    const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2), o = new Uint8Array(w2 * h2);
    for (let y = 0; y < h2; y++) {
      const y0 = y * 2, y1 = Math.min(h - 1, y0 + 1);
      for (let x = 0; x < w2; x++) {
        const x0 = x * 2, x1 = Math.min(w - 1, x0 + 1);
        o[y * w2 + x] = Math.min(g[y0 * w + x0], g[y0 * w + x1], g[y1 * w + x0], g[y1 * w + x1]);
      }
    }
    return { g: o, w: w2, h: h2 };
  }

  /** Fermeture 3×3 : bouche les pixels clairs isolés (grain du scan, trame d'impression) dans les aplats. */
  function close3(D, w, h) {
    const t = new Uint8Array(D.length), dil = new Uint8Array(D.length), out = new Uint8Array(D.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; t[i] = D[i] | (x > 0 ? D[i - 1] : 0) | (x < w - 1 ? D[i + 1] : 0); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; dil[i] = t[i] | (y > 0 ? t[i - w] : 0) | (y < h - 1 ? t[i + w] : 0); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; t[i] = dil[i] & (x > 0 ? dil[i - 1] : 1) & (x < w - 1 ? dil[i + 1] : 1); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; out[i] = t[i] & (y > 0 ? t[i - w] : 1) & (y < h - 1 ? t[i + w] : 1); }
    return out;
  }

  /** Somme cumulée 2D (image intégrale) d'un masque 0/1. */
  function integral(M, w, h) {
    const I = new Uint32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += M[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
    }
    return I;
  }

  /**
   * Aplats (bandeaux colorés, zones pleines) : pixels où presque tout le voisinage est sombre.
   * Leur intérieur est retiré avant de chercher les traits ; leur contour est gardé, il sépare le bandeau
   * des cases voisines. Sans cela, le grain d'un bandeau scanné donne des dizaines de faux traits.
   */
  function hollowFills(D, w, h, r) {
    const C = close3(D, w, h);
    const I = integral(C, w, h), W = w + 1;
    const core = new Uint8Array(w * h);
    let any = 0;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        if (!C[y * w + x]) continue;
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const sum = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
        if (sum >= (x1 - x0) * (y1 - y0) * 0.85) { core[y * w + x] = 1; any = 1; }
      }
    }
    if (!any) return D;
    // Seul le cœur de l'aplat est retiré : il reste un bord net d'environ r pixels, continu même si
    // des lettres touchent le bandeau, qui forme le trait de séparation
    const out = new Uint8Array(D);
    for (let i = 0; i < out.length; i++) if (core[i]) out[i] = 0;
    return out;
  }

  // Un trait trop épais n'est pas un trait de tableau : on ne garde que ses deux bords
  function keepEdgesOfThickRuns(M, w, h, horizontal, maxThick, edge) {
    if (horizontal) { // épaisseur mesurée verticalement, colonne par colonne
      for (let x = 0; x < w; x++) {
        let y = 0;
        while (y < h) {
          if (!M[y * w + x]) { y++; continue; }
          const s0 = y;
          while (y < h && M[y * w + x]) y++;
          if (y - s0 > maxThick) for (let k = s0 + edge; k < y - edge; k++) M[k * w + x] = 0;
        }
      }
    } else { // épaisseur mesurée horizontalement, ligne par ligne
      for (let y = 0; y < h; y++) {
        const row = y * w;
        let x = 0;
        while (x < w) {
          if (!M[row + x]) { x++; continue; }
          const s0 = x;
          while (x < w && M[row + x]) x++;
          if (x - s0 > maxThick) M.fill(0, row + s0 + edge, row + x - edge);
        }
      }
    }
  }

  /**
   * Suites de pixels sombres d'au moins minLen, en tolérant des coupures de « gap » pixels.
   * Un trait est plein (≥ 90 % de pixels sombres) : la ligne de base d'un mot, pleine de petits blancs
   * entre les lettres, n'en est pas un.
   */
  function longRuns(C, w, h, horizontal, minLen, gap) {
    const out = new Uint8Array(C.length);
    const outer = horizontal ? h : w, inner = horizontal ? w : h;
    for (let a = 0; a < outer; a++) {
      let start = -1, last = -1, count = 0;
      for (let b = 0; b <= inner; b++) {
        const on = b < inner && C[horizontal ? a * w + b : b * w + a];
        if (on) { if (start < 0) { start = b; count = 0; } last = b; count++; }
        else if (start >= 0 && (b === inner || b - last > gap)) {
          const len = last - start + 1;
          if (len >= minLen && count >= len * 0.9) for (let k = start; k <= last; k++) out[horizontal ? a * w + k : k * w + a] = 1;
          start = -1;
        }
      }
    }
    return out;
  }

  /**
   * Trous d'un trait : là où des lettres touchent le bas d'un bandeau, l'évidement de l'aplat emporte aussi
   * le trait. Entre un morceau du trait et le morceau suivant, ou le trait perpendiculaire qui le borne (A),
   * le trait continue si les pixels d'origine (D0) restent sombres.
   */
  function bridgeRuns(M, A, D0, w, h, horizontal) {
    const outer = horizontal ? h : w, inner = horizontal ? w : h;
    const at = (a, b) => (horizontal ? a * w + b : b * w + a);
    for (let a = 0; a < outer; a++) {
      let prev = -1, prevM = false;
      for (let b = 0; b < inner; b++) {
        const i = at(a, b), m = M[i] === 1;
        if (!m && !A[i]) continue;
        if (prev >= 0 && b - prev > 1 && (m || prevM)) {
          let dark = 0;
          for (let k = prev + 1; k < b; k++) dark += D0[at(a, k)];
          if (dark >= (b - prev - 1) * 0.95) for (let k = prev + 1; k < b; k++) M[at(a, k)] = 2;
        }
        prev = b; prevM = m;
      }
    }
    for (let i = 0; i < M.length; i++) if (M[i]) M[i] = 1;
  }

  /**
   * Traits de tableau : suites sombres longues et fines, horizontales ou verticales. Tolère les coupures
   * d'un scan, une légère inclinaison et les lettres qui touchent les traits. Les aplats (bandeaux) sont
   * évidés : seul leur contour compte.
   * @returns Uint8Array (1 = pixel de trait)
   */
  function detectLines(g, w, h, opts) {
    const o = opts || {};
    const DARK = o.dark || 170;
    const minH = Math.max(20, Math.round(w * 0.06)), minV = Math.max(15, Math.round(h * 0.025));
    const gap = Math.max(1, Math.round(w / 1600));
    const maxThick = Math.max(3, Math.round(w * 0.006)), edge = Math.max(1, Math.round(w / 900));
    const n = w * h, D0 = new Uint8Array(n);
    for (let i = 0; i < n; i++) D0[i] = g[i] < DARK ? 1 : 0;
    const D = hollowFills(D0, w, h, Math.max(3, maxThick));
    const H = longRuns(D, w, h, true, minH, gap), V = longRuns(D, w, h, false, minV, gap);
    // Seuls les traits horizontaux sont réparés : c'est le long d'une ligne de texte que les lettres touchent un
    // trait. Prolonger un trait vertical à travers un bandeau couperait son titre en deux.
    if (D !== D0) bridgeRuns(H, V, D0, w, h, true);
    keepEdgesOfThickRuns(H, w, h, true, maxThick, edge);
    keepEdgesOfThickRuns(V, w, h, false, maxThick, edge);
    for (let i = 0; i < n; i++) H[i] |= V[i];
    return H;
  }

  /**
   * Cases délimitées par les traits : zones connexes hors traits, calculées sur une image réduite.
   * Les très petites zones (cases à cocher, espaces entre deux traits) sont rattachées à leur voisine.
   * @returns { f, lw, lh, labels (Int32Array réduit, 0 = trait), regions: [{ id, x0, y0, x1, y1, area }] }
   */
  function findRegions(L, w, h) {
    const f = Math.max(1, Math.round(w / 600));
    const lw = Math.ceil(w / f), lh = Math.ceil(h / f);
    const lm = new Uint8Array(lw * lh);
    for (let y = 0; y < h; y++) {
      const row = y * w, lrow = ((y / f) | 0) * lw;
      for (let x = 0; x < w; x++) if (L[row + x]) lm[lrow + ((x / f) | 0)] = 1;
    }
    // Dilatation d'un pixel réduit : referme les petites coupures des traits
    const dm = new Uint8Array(lm);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      if (!lm[y * lw + x]) continue;
      if (x > 0) dm[y * lw + x - 1] = 1;
      if (x < lw - 1) dm[y * lw + x + 1] = 1;
      if (y > 0) dm[(y - 1) * lw + x] = 1;
      if (y < lh - 1) dm[(y + 1) * lw + x] = 1;
    }
    const labels = new Int32Array(lw * lh);
    const queue = new Int32Array(lw * lh);
    const stats = [null];
    let next = 1;
    for (let i = 0; i < labels.length; i++) {
      if (dm[i] || labels[i]) continue;
      const id = next++;
      let head = 0, tail = 0;
      queue[tail++] = i; labels[i] = id;
      const s = { id, minx: lw, miny: lh, maxx: 0, maxy: 0, area: 0 };
      while (head < tail) {
        const p = queue[head++], px = p % lw, py = (p / lw) | 0;
        s.area++;
        if (px < s.minx) s.minx = px; if (px > s.maxx) s.maxx = px;
        if (py < s.miny) s.miny = py; if (py > s.maxy) s.maxy = py;
        if (px > 0 && !dm[p - 1] && !labels[p - 1]) { labels[p - 1] = id; queue[tail++] = p - 1; }
        if (px < lw - 1 && !dm[p + 1] && !labels[p + 1]) { labels[p + 1] = id; queue[tail++] = p + 1; }
        if (py > 0 && !dm[p - lw] && !labels[p - lw]) { labels[p - lw] = id; queue[tail++] = p - lw; }
        if (py < lh - 1 && !dm[p + lw] && !labels[p + lw]) { labels[p + lw] = id; queue[tail++] = p + lw; }
      }
      stats.push(s);
    }
    // Petites zones fermées : rattachées à la zone voisine la plus en contact
    const total = lw * lh;
    const small = (s) => s.area < total * 0.005 && Math.max(s.maxx - s.minx, s.maxy - s.miny) < lw * 0.08;
    const parent = stats.map((s, i) => i);
    const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const R = 3;
    for (let id = 1; id < stats.length; id++) {
      const s = stats[id];
      if (!small(s)) continue;
      const counts = new Map();
      for (let y = s.miny; y <= s.maxy; y++) for (let x = s.minx; x <= s.maxx; x++) {
        if (labels[y * lw + x] !== id) continue;
        for (const [dx, dy] of [[R, 0], [-R, 0], [0, R], [0, -R]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= lw || ny >= lh) continue;
          const o = labels[ny * lw + nx];
          if (o && o !== id) counts.set(o, (counts.get(o) || 0) + 1);
        }
      }
      let best = 0, bestN = 0;
      for (const [o, n] of counts) if (n > bestN && !small(stats[o])) { best = o; bestN = n; }
      if (best) parent[id] = find(best);
    }
    const merged = new Map();
    for (let i = 0; i < labels.length; i++) {
      if (!labels[i]) continue;
      const r = find(labels[i]);
      labels[i] = r;
      const px = i % lw, py = (i / lw) | 0;
      let m = merged.get(r);
      if (!m) merged.set(r, (m = { id: r, minx: px, miny: py, maxx: px, maxy: py, area: 0 }));
      m.area++;
      if (px < m.minx) m.minx = px; if (px > m.maxx) m.maxx = px;
      if (py < m.miny) m.miny = py; if (py > m.maxy) m.maxy = py;
    }
    const regions = [...merged.values()]
      .filter((m) => m.area >= total * 0.0004)
      .map((m) => ({ id: m.id, x0: m.minx * f, y0: m.miny * f, x1: Math.min(w, (m.maxx + 1) * f), y1: Math.min(h, (m.maxy + 1) * f), area: m.area / total }));
    return { f, lw, lh, labels, regions };
  }

  /**
   * Analyse d'une page entière : traits cherchés sur l'image réduite de moitié (plus rapide).
   * @returns { regions (coordonnées pleine taille), tableLike, F, lw, labels, L, w2 }
   */
  function analyzePage(g, w, h) {
    const half = minPool2(g, w, h);
    const L = detectLines(half.g, half.w, half.h);
    const lay = findRegions(L, half.w, half.h);
    const regions = lay.regions.map((r) => ({ ...r, x0: r.x0 * 2, y0: r.y0 * 2, x1: Math.min(w, r.x1 * 2), y1: Math.min(h, r.y1 * 2) }));
    return { regions, tableLike: regions.length >= 3, F: 2 * lay.f, lw: lay.lw, labels: lay.labels, L, w2: half.w };
  }

  /* ================= Préparation des zones pour l'OCR ================= */
  function otsu(hist, n) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; t = i; }
    }
    return t;
  }

  // Cases à cocher : carrés creux, effacés (la croix éventuelle, séparée du carré, reste lisible)
  function removeBoxes(bin, w, h, pageW) {
    const minS = pageW * 0.008, maxS = pageW * 0.06;
    const seen = new Uint8Array(w * h), queue = new Int32Array(w * h);
    for (let i = 0; i < bin.length; i++) {
      if (bin[i] || seen[i]) continue;
      let head = 0, tail = 0, minx = w, miny = h, maxx = 0, maxy = 0;
      queue[tail++] = i; seen[i] = 1;
      while (head < tail) {
        const p = queue[head++], px = p % w, py = (p / w) | 0;
        if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (!bin[q] && !seen[q]) { seen[q] = 1; queue[tail++] = q; }
        }
      }
      const bw = maxx - minx + 1, bh = maxy - miny + 1;
      if (bw < minS || bh < minS || bw > maxS || bh > maxS || bw / bh > 2 || bh / bw > 2) continue;
      if (tail / (bw * bh) > 0.3) continue;
      const t = Math.max(2, Math.round(Math.min(bw, bh) * 0.15));
      // Une case est fermée : ses quatre côtés sont tracés sur presque toute leur longueur
      // (un « C » est ouvert d'un côté, un « O » ne touche son cadre qu'en quatre points)
      const top = new Uint8Array(bw), bottom = new Uint8Array(bw), left = new Uint8Array(bh), right = new Uint8Array(bh);
      let nearEdge = 0, inner = 0;
      for (let k = 0; k < tail; k++) {
        const p = queue[k], px = p % w, py = (p / w) | 0;
        if (px - minx < t || maxx - px < t || py - miny < t || maxy - py < t) nearEdge++;
        if (px > minx + bw * 0.25 && px < maxx - bw * 0.25 && py > miny + bh * 0.25 && py < maxy - bh * 0.25) inner++;
        if (py - miny < t) top[px - minx] = 1;
        if (maxy - py < t) bottom[px - minx] = 1;
        if (px - minx < t) left[py - miny] = 1;
        if (maxx - px < t) right[py - miny] = 1;
      }
      if (nearEdge / tail < 0.85 || inner / tail > 0.05) continue;
      const cover = (a) => a.reduce((s2, v) => s2 + v, 0) / a.length;
      if (Math.min(cover(top), cover(bottom), cover(left), cover(right)) < 0.8) continue;
      for (let k = 0; k < tail; k++) bin[queue[k]] = 1;
    }
  }

  /**
   * Morceaux noir et blanc d'une zone, prêts pour l'OCR : pixels hors de la zone et traits blanchis,
   * fond coloré (bandeau) ramené au blanc, texte clair sur fond sombre inversé, cases à cocher effacées,
   * recadrés au plus près du texte. Une grande zone autour d'un tableau est découpée en bandes
   * (titre, pied de page…) pour que chaque bande reprenne sa place dans l'ordre de lecture.
   * @returns [{ w, h, bin (0 = encre, 1 = fond), x0, y0 (position dans la page), x1, y1, region }]
   */
  function prepareRegion(g, w, h, page, reg, split) {
    const x0 = reg.x0, y0 = reg.y0, cw = reg.x1 - reg.x0, ch = reg.y1 - reg.y0;
    const { F, lw, labels, L, w2 } = page;
    const inside = new Uint8Array(cw * ch);
    const hist = new Uint32Array(256);
    const colL = new Int32Array(cw), colH = new Int32Array(cw);
    for (let x = 0; x < cw; x++) { colL[x] = ((x0 + x) / F) | 0; colH[x] = (x0 + x) >> 1; }
    let n = 0;
    for (let y = 0; y < ch; y++) {
      const gy = y0 + y, lrow = ((gy / F) | 0) * lw, hrow = (gy >> 1) * w2, grow = gy * w + x0, irow = y * cw;
      for (let x = 0; x < cw; x++) {
        if (labels[lrow + colL[x]] !== reg.id || L[hrow + colH[x]]) continue;
        inside[irow + x] = 1;
        hist[g[grow + x]]++; n++;
      }
    }
    if (n < 50) return [];
    let t = otsu(hist, n);
    let dark = 0;
    for (let i = 0; i <= t; i++) dark += hist[i];
    const invert = dark / n > 0.5; // la classe majoritaire est le fond
    // Niveau du papier (médiane) et de l'encre (les 0,2 % de pixels les plus contrastés)
    const quantile = (q) => { let c = 0; for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= q * n) return i; } return 255; };
    const paper = quantile(0.5), inkLevel = invert ? quantile(1 - Math.max(0.0003, 30 / n)) : quantile(Math.max(0.0003, 30 / n));
    // Pas de vrai contraste encre / papier (case vide, grain du scan) : rien à lire
    if (Math.abs(paper - inkLevel) < 80) return [];
    // Seuil jamais plus près du papier que du milieu encre / papier : le grain reste du papier
    const mid = (paper + inkLevel) / 2;
    t = invert ? Math.max(t, mid) : Math.min(t, mid);
    const ink = new Uint8Array(cw * ch);
    const rowInk = new Uint32Array(ch);
    let total = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (!inside[y * cw + x]) continue;
      const v = g[(y0 + y) * w + x0 + x];
      if (invert ? v > t : v <= t) { ink[y * cw + x] = 1; rowInk[y]++; total++; }
    }
    if (total < Math.max(30, n * 0.0008) || total > n * 0.6) return [];
    // Bandes de texte : lignes séparées par un blanc suffisant (seulement pour les grandes zones)
    const stripes = [];
    const minGap = split ? Math.max(12, Math.round(h * 0.015)) : ch + 1;
    let s = -1, last = -1;
    for (let y = 0; y <= ch; y++) {
      const on = y < ch && rowInk[y] >= 2;
      if (on) { if (s < 0) s = y; last = y; }
      else if (s >= 0 && (y === ch || y - last > minGap)) { stripes.push([s, last]); s = -1; }
    }
    const pad = 16, out = [];
    for (const [sy, ey] of stripes) {
      let minx = cw, maxx = -1, count = 0;
      for (let y = sy; y <= ey; y++) for (let x = 0; x < cw; x++) if (ink[y * cw + x]) { count++; if (x < minx) minx = x; if (x > maxx) maxx = x; }
      if (count < 30) continue;
      const pw = maxx - minx + 1 + 2 * pad, ph = ey - sy + 1 + 2 * pad;
      const bin = new Uint8Array(pw * ph).fill(1);
      for (let y = sy; y <= ey; y++) for (let x = minx; x <= maxx; x++) if (ink[y * cw + x]) bin[(y - sy + pad) * pw + (x - minx + pad)] = 0;
      removeBoxes(bin, pw, ph, w);
      out.push({ w: pw, h: ph, bin, x0: x0 + minx - pad, y0: y0 + sy - pad, x1: x0 + maxx + 1, y1: y0 + ey + 1, region: reg });
    }
    return out;
  }

  /* ================= Ordre de lecture ================= */
  const isShort = (b) => b.lines <= 1 && b.text.length <= 60;
  function overlapX(a, b) { return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) / Math.max(1, Math.min(a.x1 - a.x0, b.x1 - b.x0)); }

  /** Regroupe les blocs côte à côte (qui se chevauchent verticalement) en bandes, de haut en bas. */
  function bands(blocks) {
    const sorted = blocks.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const out = [];
    for (const b of sorted) {
      const cur = out[out.length - 1];
      const ov = cur ? Math.min(cur.y1, b.y1) - Math.max(cur.y0, b.y0) : -1;
      if (cur && ov > 0.5 * Math.min(cur.y1 - cur.y0, b.y1 - b.y0)) {
        cur.items.push(b); cur.y0 = Math.min(cur.y0, b.y0); cur.y1 = Math.max(cur.y1, b.y1);
      } else out.push({ y0: b.y0, y1: b.y1, items: [b] });
    }
    // Dans une bande : colonne par colonne (bords gauches proches = même colonne), puis de haut en bas
    for (const bd of out) {
      const span = Math.max(...bd.items.map((b) => b.x1)) - Math.min(...bd.items.map((b) => b.x0));
      const tol = Math.max(8, span * 0.04);
      const cols = [];
      for (const b of bd.items.slice().sort((a, c) => a.x0 - c.x0)) {
        const col = cols.find((c) => Math.abs(c.x0 - b.x0) <= tol);
        if (col) col.items.push(b); else cols.push({ x0: b.x0, items: [b] });
      }
      bd.items = cols.flatMap((c) => c.items.sort((a, b2) => a.y0 - b2.y0));
    }
    return out;
  }
  function aligned(a, b) {
    return a.items.length === b.items.length && a.items.length >= 2 && a.items.every((x, i) => overlapX(x, b.items[i]) > 0.6);
  }
  const isHeaderBand = (bd) => bd.items.length >= 2 && bd.items.every(isShort);

  // Titre d'une ligne posé sur plusieurs colonnes (« MISSIONS   CONDITIONS… » d'un seul tenant) :
  // redécoupé selon les colonnes de la bande suivante, grâce à la position de chaque mot
  function splitHeaders(bs) {
    for (let i = 0; i + 1 < bs.length; i++) {
      const bd = bs[i], nx = bs[i + 1];
      if (bd.items.length !== 1 || nx.items.length < 2) continue;
      const b = bd.items[0];
      if (!isShort(b) || !b.words || b.words.length < 2) continue;
      const cols = nx.items.slice().sort((a, c) => a.x0 - c.x0);
      if (cols.some((c) => overlapX(c, b) < 0.5)) continue;
      const cuts = cols.slice(0, -1).map((c, k) => (c.x1 + cols[k + 1].x0) / 2);
      const parts = cols.map((c) => ({ text: "", lines: 1, x0: c.x0, x1: c.x1, y0: b.y0, y1: b.y1 }));
      for (const wd of b.words.slice().sort((a, c) => a.x0 - c.x0)) {
        const mid = (wd.x0 + wd.x1) / 2;
        let k = 0;
        while (k < cuts.length && mid > cuts[k]) k++;
        parts[k].text += (parts[k].text ? " " : "") + wd.text;
      }
      const kept = parts.filter((p) => p.text);
      if (kept.length >= 2) bd.items = kept;
    }
    return bs;
  }

  /**
   * Texte final à partir des blocs { text, lines, x0, y0, x1, y1, words? }.
   * Sections en colonnes : colonne par colonne. Tableau libellé / valeur : « libellé : valeur ».
   */
  function assemble(blocks) {
    const bs = splitHeaders(bands(blocks.filter((b) => b.text && b.text.trim())));
    const parts = [];
    const kv = (l, r) => l.text.replace(/\s*:\s*$/, "") + " : " + r.text;
    for (let i = 0; i < bs.length; i++) {
      const bd = bs[i];
      // Groupe de bandes alignées (même nombre de colonnes, mêmes positions)
      let j = i;
      while (j + 1 < bs.length && aligned(bs[j], bs[j + 1]) && !(j > i && isHeaderBand(bs[j + 1]) && !bs.slice(i, j + 2).every(isHeaderBand))) j++;
      // Lignes courtes puis contenu : seule la dernière ligne courte est le titre des colonnes,
      // les précédentes (« Diplômes | Bac + 3 ») forment un groupe à part
      const k = bs.slice(i, j + 1).findIndex((b2) => !isHeaderBand(b2));
      if (k >= 2) j = i + k - 2;
      const group = bs.slice(i, j + 1);
      if (group.length > 1) {
        const allShort = group.every((g2) => g2.items.every(isShort));
        const labels = group.every((g2) => g2.items.length === 2 && isShort(g2.items[0]));
        if (allShort && bd.items.length > 2) parts.push(group.map((g2) => g2.items.map((b) => b.text).join(" – ")).join("\n")); // tableau de données : ligne par ligne
        else if (labels) parts.push(group.map((g2) => kv(g2.items[0], g2.items[1])).join("\n")); // libellé / valeur
        else for (let c = 0; c < bd.items.length; c++) parts.push(group.map((g2) => g2.items[c].text).join("\n")); // sections en colonnes
        i = j;
        continue;
      }
      // Deux cases côte à côte, libellé court à gauche : « libellé : valeur »
      const [l, r] = bd.items;
      if (bd.items.length === 2 && isShort(l) && l.x1 <= r.x0 + 8 && r.lines <= 3) parts.push(kv(l, r));
      else parts.push(bd.items.map((b) => b.text).join("\n"));
    }
    return parts.join("\n\n");
  }

  /**
   * Tableau d'un document structuré (Word, OpenDocument, HTML) : mêmes règles de lecture que pour un scan,
   * à partir de la grille réelle. rows = [[{ text, span }]] (span = nombre de colonnes fusionnées).
   */
  function assembleGrid(rows) {
    const blocks = [];
    rows.forEach((cells, r) => {
      let col = 0;
      for (const c of cells) {
        const span = Math.max(1, c.span || 1);
        const text = (c.text || "").trim();
        if (text) blocks.push({ text, lines: text.split("\n").length, x0: col * 100, x1: (col + span) * 100 - 10, y0: r * 100, y1: r * 100 + 90 });
        col += span;
      }
    });
    return assemble(blocks);
  }

  /* ================= Nettoyage des mots reconnus ================= */
  const PUNCT = new Set([":", "-", "–", "—", "/", "•", "&", "+", "…", "?", "!", ";", "(", ")", "«", "»", "€", "%", "*"]);
  // Puce de liste : petit signe en tête de ligne, suivi d'un grand blanc. Tesseract la lit « e », « s », « « »,
  // « + » ou « * », souvent avec une confiance trop faible pour être gardée : on la reconnaît à sa forme.
  function isBullet(words) {
    const [b, next] = words;
    if (!next || !b.bbox || !next.bbox || b.text.trim().length > 2) return false;
    const hs = words.slice(1).filter((wd) => wd.bbox).map((wd) => wd.bbox.y1 - wd.bbox.y0).sort((x, y) => x - y);
    const ref = hs[hs.length >> 1];
    const bh = b.bbox.y1 - b.bbox.y0, bw = b.bbox.x1 - b.bbox.x0;
    return bh <= ref * 0.6 && bw <= ref * 0.6 && next.bbox.x0 - b.bbox.x1 >= ref;
  }

  /** Retire les restes de bordures (« | », « [ ») et les mots illisibles, garde le texte. */
  function cleanLines(lines) {
    const out = [];
    for (const line of lines || []) {
      const words = (line.words && line.words.length ? line.words : [{ text: line.text, confidence: line.confidence, bbox: line.bbox }])
        .map((wd) => ({ text: String(wd.text || "").replace(/[|¦]/g, "").replace(/^[\[\]]+|[\[\]]+$/g, ""), c: wd.confidence, bbox: wd.bbox }));
      if (isBullet(words)) words[0] = { text: "•", c: 99, bbox: words[0].bbox };
      const kept = words.filter((wd) => {
        if (!wd.text) return false;
        const letters = (wd.text.match(/[\p{L}\p{N}]/gu) || []).length;
        if (!letters) return PUNCT.has(wd.text) && wd.c >= 50;
        return wd.c >= 35 || (letters >= 3 && wd.c >= 20);
      });
      const letters = kept.reduce((a, wd) => a + (wd.text.match(/[\p{L}\p{N}]/gu) || []).length, 0);
      if (!letters) continue;
      const mean = kept.reduce((a, wd) => a + wd.c, 0) / kept.length;
      if (mean < 35 && letters < 4) continue;
      out.push({ text: kept.map((wd) => wd.text).join(" "), confidence: mean, bbox: line.bbox, paragraph: line.paragraph, words: kept });
    }
    return out;
  }

  /**
   * Texte des lignes d'un bloc. Une ligne alignée sur le texte d'une puce (et non sur la marge) est la suite
   * de cette puce, même si elle commence par une majuscule (« … de vie du projet / SIG »).
   * paragraphs : sépare les paragraphes de Tesseract par une ligne vide.
   */
  const ITEM = /^[-–—•·*▪●◦‣>»](\s|$)/;
  function linesText(lines, paragraphs) {
    let text = "", prev = null, itemX = null;
    for (const l of lines) {
      const ws = (l.words || []).filter((wd) => wd.bbox);
      const lh = l.bbox ? l.bbox.y1 - l.bbox.y0 : 0;
      const newPara = paragraphs && prev && l.paragraph !== prev.paragraph;
      const wrapped = prev && !newPara && itemX !== null && ws.length && l.bbox && prev.bbox && !ITEM.test(l.text) &&
        Math.abs(ws[0].bbox.x0 - itemX) <= lh * 0.6 && l.bbox.y0 - prev.bbox.y1 <= lh * 0.8;
      if (wrapped) text = /\p{L}-$/u.test(text) && /^\p{Ll}/u.test(l.text) ? text.slice(0, -1) + l.text : text + " " + l.text;
      else {
        text += (prev ? (newPara ? "\n\n" : "\n") : "") + l.text;
        itemX = ITEM.test(l.text) && ws.length > 1 ? ws[1].bbox.x0 : null;
      }
      prev = l;
    }
    return text;
  }

  /* ================= OCR d'une page entière ================= */
  // Assemble plusieurs morceaux les uns sous les autres dans une seule image (une seule lecture OCR)
  function composite(pieces, maxPixels) {
    const GAP = 48, out = [];
    let cur = null;
    for (const p of pieces) {
      if (!cur || (cur.h + p.h + GAP) * Math.max(cur.w, p.w) > maxPixels) { cur = { w: 0, h: 0, items: [] }; out.push(cur); }
      cur.items.push({ p, y: cur.h ? cur.h + GAP : 0 });
      cur.h = (cur.h ? cur.h + GAP : 0) + p.h;
      cur.w = Math.max(cur.w, p.w);
    }
    return out;
  }
  /** Image PBM binaire (format lu directement par Tesseract) contenant les morceaux placés en (0, y). */
  function toPBM(w, h, items) {
    const header = "P4\n" + w + " " + h + "\n", stride = (w + 7) >> 3;
    const out = new Uint8Array(header.length + stride * h);
    for (let i = 0; i < header.length; i++) out[i] = header.charCodeAt(i);
    const base = header.length;
    for (const { p, y: oy } of items) {
      for (let y = 0; y < p.h; y++) {
        const row = base + (oy + y) * stride, src = y * p.w;
        for (let x = 0; x < p.w; x++) if (!p.bin[src + x]) out[row + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return out;
  }

  /**
   * @param canvas      page dessinée (fond blanc)
   * @param recognize   async (image PBM, psm, onProgress) → { lines: [{ text, confidence, bbox, paragraph, words: [{ text, confidence, bbox }] }] }
   * @param onProgress  (0..1, étape)
   * @returns { text, confidence, regions }
   */
  async function ocrCanvas(canvas, recognize, onProgress) {
    if (onProgress) onProgress(0, "layout");
    await new Promise((r) => setTimeout(r, 0)); // laisse le navigateur afficher l'étape
    const w = canvas.width, h = canvas.height;
    const g = toGray(canvas.getContext("2d").getImageData(0, 0, w, h).data, w, h);
    const page = analyzePage(g, w, h);
    const blocks = [], confs = [];
    const report = (k, total) => (p, st) => onProgress && onProgress(st === "recognizing text" ? (k + p) / total : k / total, st);

    if (!page.tableLike) {
      // Page sans tableau : une seule lecture avec découpage automatique (colonnes, paragraphes)
      const pieces = page.regions.flatMap((reg) => prepareRegion(g, w, h, page, reg, false));
      for (let k = 0; k < pieces.length; k++) {
        const p = pieces[k];
        const res = await recognize(toPBM(p.w, p.h, [{ p, y: 0 }]), "3", report(k, pieces.length));
        const lines = cleanLines(res.lines);
        lines.forEach((l) => confs.push(l.confidence));
        const text = linesText(lines, true);
        if (text) blocks.push({ text: ATS.ocr.tidy(text), lines: 99, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 });
      }
    } else {
      // Tableau : chaque case (et chaque bande de texte autour) est un morceau ; tous lus en une fois
      const pieces = page.regions.flatMap((reg) => prepareRegion(g, w, h, page, reg, reg.area > 0.25));
      const sheets = composite(pieces, 12e6);
      for (let k = 0; k < sheets.length; k++) {
        const sh = sheets[k];
        const res = await recognize(toPBM(sh.w, sh.h, sh.items), "4", report(k, sheets.length));
        const per = sh.items.map(() => []);
        for (const l of cleanLines(res.lines)) {
          const cy = (l.bbox.y0 + l.bbox.y1) / 2;
          const idx = sh.items.findIndex((it) => cy >= it.y && cy < it.y + it.p.h);
          if (idx >= 0) per[idx].push(l);
        }
        sh.items.forEach((it, idx) => {
          const lines = per[idx];
          if (!lines.length) return;
          lines.forEach((l) => confs.push(l.confidence));
          const p = it.p;
          const words = lines.length === 1 ? lines[0].words.filter((wd) => wd.bbox).map((wd) => ({ text: wd.text, x0: p.x0 + wd.bbox.x0, x1: p.x0 + wd.bbox.x1 })) : null;
          const text = ATS.ocr.tidy(linesText(lines, false));
          // Une bande de la grande zone garde sa propre position ; une case prend celle de la case
          const box = p.region.area > 0.25 ? p : p.region;
          blocks.push({ text, lines: text.split("\n").length, words, x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 });
        });
      }
    }
    if (onProgress) onProgress(1, "recognizing text");
    const conf = confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : 0;
    return { text: assemble(blocks), confidence: conf, regions: page.regions.length };
  }

  /* ================= PDF texte avec tableaux ================= */
  /**
   * Remet dans l'ordre de lecture le texte d'une page PDF qui contient un tableau.
   * @param items   éléments de texte pdf.js : { str, hasEOL, x, y (ligne de base, en pixels de la toile), h, w }
   * @param canvas  page dessinée, pour repérer les traits
   * @returns texte, ou null si la page n'a pas de tableau (l'ordre d'origine est alors conservé)
   */
  function orderPdfItems(items, canvas) {
    const w = canvas.width, h = canvas.height;
    const g = toGray(canvas.getContext("2d").getImageData(0, 0, w, h).data, w, h);
    const page = analyzePage(g, w, h);
    if (!page.tableLike) return null;
    const regionAt = (x, y) => {
      const cx = Math.min(w - 1, Math.max(0, Math.round(x))), cy = Math.min(h - 1, Math.max(0, Math.round(y)));
      return page.labels[((cy / page.F) | 0) * page.lw + ((cx / page.F) | 0)] || 0;
    };
    const big = new Set(page.regions.filter((r) => r.area > 0.25).map((r) => r.id));
    const per = new Map();
    for (const it of items) {
      if (!it.str) continue;
      const id = regionAt(it.x, it.y - it.h * 0.35);
      if (!per.has(id)) per.set(id, []);
      per.get(id).push(it);
    }
    const blocks = [];
    for (const [id, its] of per) {
      const reg = page.regions.find((r) => r.id === id);
      if (!reg || big.has(id)) {
        // Hors tableau : regroupé en lignes, chacune à sa place
        const lines = [];
        for (const it of its.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
          const l = lines.find((x) => Math.abs(x.y - it.y) < it.h * 0.5);
          if (l) { l.items.push(it); l.x0 = Math.min(l.x0, it.x); l.x1 = Math.max(l.x1, it.x + it.w); }
          else lines.push({ y: it.y, h: it.h, x0: it.x, x1: it.x + it.w, items: [it] });
        }
        for (const l of lines) {
          const sorted = l.items.sort((a, b) => a.x - b.x);
          const text = sorted.map((x) => x.str).join(" ").replace(/\s+/g, " ").trim();
          if (text) blocks.push({ text, lines: 1, words: sorted.map((x) => ({ text: x.str.trim(), x0: x.x, x1: x.x + x.w })).filter((x) => x.text), x0: l.x0, y0: l.y - l.h, x1: l.x1, y1: l.y });
        }
        continue;
      }
      // Ordre d'origine dans la case ; nouvelle ligne dès que la position verticale change
      let text = "", prevY = null;
      for (const it of its) {
        if (prevY !== null && Math.abs(it.y - prevY) > it.h * 0.5 && !/\n$/.test(text)) text = text.replace(/ $/, "") + "\n";
        text += it.str + (it.hasEOL ? "\n" : it.str && !/\s$/.test(it.str) ? " " : "");
        prevY = it.y;
      }
      text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
      const nl = text.split("\n").length;
      if (text) blocks.push({ text, lines: nl, words: nl === 1 ? its.map((x) => ({ text: x.str.trim(), x0: x.x, x1: x.x + x.w })).filter((x) => x.text) : null, x0: reg.x0, y0: reg.y0, x1: reg.x1, y1: reg.y1 });
    }
    return assemble(blocks);
  }

  ATS.layout = { toGray, minPool2, close3, hollowFills, detectLines, findRegions, analyzePage, prepareRegion, removeBoxes, otsu, bands, splitHeaders, assemble, cleanLines, composite, toPBM, linesText, ocrCanvas, orderPdfItems, assembleGrid };
})();
