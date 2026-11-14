/* minimap.js — mapa ligero sin dependencias: teselas, marcadores, líneas, círculos, arrastrar y pellizcar */
(function (G) {
  "use strict";
  const TS = 256;
  function proj(lat, lon) {
    const s = Math.sin(lat * Math.PI / 180);
    return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
  }
  function unproj(mx, my) {
    const lon = mx * 360 - 180;
    const n = Math.PI - 2 * Math.PI * my;
    return [180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon];
  }

  function MiniMap(el, opt) {
    opt = opt || {};
    this.el = el; this.minZoom = opt.minZoom || 6; this.maxZoom = opt.maxZoom || 18;
    this.z = opt.zoom || 10;
    const c = proj(opt.center[0], opt.center[1]); this.mx = c[0]; this.my = c[1];
    this.layers = []; this.markers = []; this.vectors = []; this.handlers = {};
    el.classList.add("mm");
    el.innerHTML = "";
    this.tilePane = div("mm-tiles"); this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "mm-svg"); this.mkPane = div("mm-markers");
    this.attr = div("mm-attr"); this.scale = div("mm-scale");
    el.append(this.tilePane, this.svg, this.mkPane, this.attr, this.scale);
    this._bind(); this.invalidateSize();
  }
  function div(c) { const d = document.createElement("div"); d.className = c; return d; }
  const P = MiniMap.prototype;

  P.on = function (ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); };
  P._emit = function (ev, a) { (this.handlers[ev] || []).forEach(f => f(a)); };
  P.invalidateSize = function () { this.w = this.el.clientWidth; this.h = this.el.clientHeight; this.svg.setAttribute("width", this.w); this.svg.setAttribute("height", this.h); this.render(); };
  P.getZoom = function () { return this.z; };
  P.getCenter = function () { return unproj(this.mx, this.my); };
  P.setView = function (ll, z) { const c = proj(ll[0], ll[1]); this.mx = c[0]; this.my = c[1]; if (z != null) this.z = clampZ(this, z); this.render(); };
  P.panTo = function (ll) { this.setView(ll); };
  P.fitBounds = function (pts, pad) {
    if (!pts.length) return; pad = pad || 30;
    let a = 1, b = 1, c = 0, d = 0;
    pts.forEach(p => { const q = proj(p[0], p[1]); a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); });
    const dx = Math.max(c - a, 1e-9), dy = Math.max(d - b, 1e-9);
    const z = Math.log2(Math.min((this.w - 2 * pad) / (dx * TS), (this.h - 2 * pad) / (dy * TS)));
    this.mx = (a + c) / 2; this.my = (b + d) / 2; this.z = clampZ(this, Math.min(z, 16)); this.render();
  };
  function clampZ(m, z) { return Math.max(m.minZoom, Math.min(m.maxZoom, z)); }
  P.worldSize = function () { return TS * Math.pow(2, this.z); };
  P.toScreen = function (lat, lon) { const q = proj(lat, lon), W = this.worldSize(); return [(q[0] - this.mx) * W + this.w / 2, (q[1] - this.my) * W + this.h / 2]; };
  P.toLatLng = function (x, y) { const W = this.worldSize(); return unproj(this.mx + (x - this.w / 2) / W, this.my + (y - this.h / 2) / W); };
  P.metersPerPixel = function (lat) { return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, this.z); };

  /* capas de teselas */
  P.addTileLayer = function (url, o) {
    o = o || {};
    const L = { url, provider: o.provider || null, ok: 0, err: 0, sub: o.subdomains || "abc", maxZoom: o.maxZoom || 18, opacity: o.opacity == null ? 1 : o.opacity, attribution: o.attribution || "", visible: true, pane: div("mm-layer"), tiles: new Map(), z: 0 };
    L.pane.style.opacity = L.opacity;
    const before = o.below ? this.tilePane.firstChild : null;
    this.tilePane.insertBefore(L.pane, before);
    if (o.below) this.layers.unshift(L); else this.layers.push(L);
    this._attr(); this.render(); return L;
  };
  P.setLayerVisible = function (L, v) { L.visible = v; L.pane.style.display = v ? "" : "none"; this._attr(); this.render(); };
  P._attr = function () { this.attr.textContent = this.layers.filter(l => l.visible && l.attribution).map(l => l.attribution).join(" · "); };
  P._tileURL = function (L, z, x, y) {
    const s = L.sub[Math.abs(x + y) % L.sub.length];
    return L.url.replace("{s}", s).replace("{z}", z).replace("{x}", x).replace("{y}", y);
  };
  P._renderLayer = function (L) {
    if (!L.visible) return;
    const zi = Math.min(Math.round(this.z), L.maxZoom), n = Math.pow(2, zi);
    const s = TS * Math.pow(2, this.z - zi), W = this.worldSize();
    const ox = this.w / 2 - this.mx * W, oy = this.h / 2 - this.my * W;
    const x0 = Math.floor(-ox / s), x1 = Math.floor((this.w - ox) / s), y0 = Math.max(0, Math.floor(-oy / s)), y1 = Math.min(n - 1, Math.floor((this.h - oy) / s));
    const need = new Set();
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const wx = ((tx % n) + n) % n, key = zi + "/" + wx + "/" + ty; need.add(key + "@" + tx);
      let img = L.tiles.get(key + "@" + tx);
      if (!img) {
        img = new Image(); img.className = "mm-tile"; img.draggable = false; img.alt = "";
        img.onload = () => { img.classList.add("ok"); this.tileOK = (this.tileOK || 0) + 1; L.ok++; }; img.onerror = () => { img.style.visibility = "hidden"; this.tileErr = (this.tileErr || 0) + 1; L.err++; };
        if (L.provider) { const im2 = img; L.provider(zi, wx, ty).then(u => { if (u) im2.src = u; else im2.style.visibility = "hidden"; }).catch(() => { im2.style.visibility = "hidden"; }); } else img.src = this._tileURL(L, zi, wx, ty); L.pane.appendChild(img); L.tiles.set(key + "@" + tx, img);
      }
      img.style.width = img.style.height = (s + 0.5) + "px";
      img.style.transform = "translate(" + (ox + tx * s) + "px," + (oy + ty * s) + "px)";
    }
    // quitar las que no hacen falta (dejando las de otro zoom mientras cargan las nuevas)
    L.tiles.forEach((img, k) => { if (!need.has(k)) { img.remove(); L.tiles.delete(k); } });
  };

  /* marcadores, líneas y círculos */
  P.marker = function (ll, html, o) {
    o = o || {}; const m = { ll, el: div("mm-mk"), ax: o.anchor ? o.anchor[0] : 0, ay: o.anchor ? o.anchor[1] : 0, onClick: o.onClick, z: o.z || 0 };
    m.el.innerHTML = html; m.el.style.zIndex = m.z; m.el._mk = m; this.mkPane.appendChild(m.el); this.markers.push(m);
    const self = this;
    m.setLatLng = function (p) { m.ll = p; self._placeMk(m); };
    m.setHTML = function (h) { m.el.innerHTML = h; };
    m.remove = function () { m.el.remove(); self.markers = self.markers.filter(x => x !== m); };
    this._placeMk(m); return m;
  };
  P._placeMk = function (m) { const p = this.toScreen(m.ll[0], m.ll[1]); m.el.style.transform = "translate(" + (p[0] - m.ax) + "px," + (p[1] - m.ay) + "px)"; };
  P.polyline = function (pts, st) {
    const e = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    st = st || {}; e.setAttribute("fill", "none"); e.setAttribute("stroke", st.color || "#d0342c"); e.setAttribute("stroke-width", st.weight || 4);
    e.setAttribute("stroke-linecap", "round"); e.setAttribute("stroke-linejoin", "round"); e.setAttribute("opacity", st.opacity || 0.9);
    if (st.dash) e.setAttribute("stroke-dasharray", st.dash);
    this.svg.appendChild(e);
    const v = { type: "line", pts, e, bb: bbox(pts) }, self = this;
    v.setPoints = function (p) { v.pts = p; v.bb = bbox(p); self._drawVec(v); };
    v.remove = function () { e.remove(); self.vectors = self.vectors.filter(x => x !== v); };
    this.vectors.push(v); this._drawVec(v); return v;
  };
  P.circle = function (ll, r, st) {
    const e = document.createElementNS("http://www.w3.org/2000/svg", "circle"); st = st || {};
    e.setAttribute("fill", st.fill || "#1a73e8"); e.setAttribute("fill-opacity", st.fillOpacity || 0.1);
    e.setAttribute("stroke", st.color || "#1a73e8"); e.setAttribute("stroke-width", 1);
    this.svg.appendChild(e);
    const v = { type: "circle", ll, r, e }, self = this;
    v.set = function (p, rr) { v.ll = p; if (rr != null) v.r = rr; self._drawVec(v); };
    v.remove = function () { e.remove(); self.vectors = self.vectors.filter(x => x !== v); };
    this.vectors.push(v); this._drawVec(v); return v;
  };
  function bbox(pts) { let a = 90, b = 180, c = -90, d = -180; for (const p of pts) { if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0]; if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1]; } return [a, b, c, d]; }
  P._viewBB = function () { const a = this.toLatLng(0, this.h), b = this.toLatLng(this.w, 0); return [a[0], a[1], b[0], b[1]]; };
  P._drawVec = function (v) {
    if (v.type === "line" && v.bb) {
      const V = this._vb || this._viewBB(), m = 0.01;
      const out = v.bb[2] < V[0] - m || v.bb[0] > V[2] + m || v.bb[3] < V[1] - m || v.bb[1] > V[3] + m || (v.minZoom && this.z < v.minZoom);
      if (out) { if (!v.hidden) { v.e.style.display = "none"; v.hidden = true; } return; }
      if (v.hidden) { v.e.style.display = ""; v.hidden = false; }
    }
    if (v.type === "line") v.e.setAttribute("points", v.pts.map(p => this.toScreen(p[0], p[1]).map(n => n.toFixed(1)).join(",")).join(" "));
    else { const p = this.toScreen(v.ll[0], v.ll[1]); v.e.setAttribute("cx", p[0]); v.e.setAttribute("cy", p[1]); v.e.setAttribute("r", Math.max(0, v.r / this.metersPerPixel(v.ll[0]))); }
  };

  P.render = function () {
    if (!this.w) return;
    this.layers.forEach(L => this._renderLayer(L));
    this.markers.forEach(m => this._placeMk(m));
    this._vb = this._viewBB(); this.vectors.forEach(v => this._drawVec(v)); this._vb = null;
    // barra de escala
    const lat = this.getCenter()[0], mpp = this.metersPerPixel(lat);
    const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    let m = steps[0]; for (const s of steps) if (s / mpp <= 110) m = s;
    this.scale.style.width = Math.round(m / mpp) + "px"; this.scale.textContent = m >= 1000 ? (m / 1000) + " km" : m + " m";
  };

  /* gestos */
  P._zoomAround = function (nz, x, y) {
    nz = clampZ(this, nz);
    const W0 = this.worldSize(); const wx = this.mx + (x - this.w / 2) / W0, wy = this.my + (y - this.h / 2) / W0;
    this.z = nz; const W1 = this.worldSize();
    this.mx = wx - (x - this.w / 2) / W1; this.my = wy - (y - this.h / 2) / W1; this.render();
  };
  P._bind = function () {
    const el = this.el, pts = new Map(); let start = null, moved = 0, lastTap = 0, raf = 0;
    const self = this;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; self.render(); }); };
    const rel = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener("pointerdown", e => {
      if (e.target.closest(".mm-attr")) return;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      pts.set(e.pointerId, rel(e));
      if (pts.size === 1) { start = { p: rel(e), mx: this.mx, my: this.my, target: e.target }; moved = 0; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; start.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.z }; this._pinching = true; }
    });
    el.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId), cur = rel(e); pts.set(e.pointerId, cur);
      if (pts.size === 1) {
        const dx = cur[0] - prev[0], dy = cur[1] - prev[1]; moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 6 && !start.dragged) { start.dragged = true; this._emit("dragstart"); }
        const W = this.worldSize(); this.mx -= dx / W; this.my -= dy / W; this.my = Math.max(0, Math.min(1, this.my)); schedule();
      } else if (pts.size === 2 && start && start.pinch) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        moved += 20; if (!start.dragged) { start.dragged = true; this._emit("dragstart"); }
        // desplazamiento del punto medio
        if (start.mid) { const W = this.worldSize(); this.mx -= (mid[0] - start.mid[0]) / W; this.my -= (mid[1] - start.mid[1]) / W; }
        start.mid = mid;
        this._zoomAround(start.pinch.z + Math.log2(d / start.pinch.d), mid[0], mid[1]);
      }
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId); pts.delete(e.pointerId);
      if (this._pinching && pts.size < 2) { this._pinching = false; if (start) { start.pinch = null; start.mid = null; } this.render(); }
      if (pts.size === 0 && start) {
        if (moved < 8) {
          const mkEl = start.target && start.target.closest && start.target.closest(".mm-mk");
          const rid = start.target && start.target.getAttribute && start.target.getAttribute("data-rid");
          if (mkEl && mkEl._mk && mkEl._mk.onClick) mkEl._mk.onClick();
          else if (rid && this._trailClick) this._trailClick(rid);
          else {
            const now = Date.now();
            if (now - lastTap < 320) { this._zoomAround(Math.round(this.z) + 1, p[0], p[1]); lastTap = 0; }
            else { lastTap = now; this._emit("click", this.toLatLng(p[0], p[1])); }
          }
        }
        start = null;
      }
    };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", e => { e.preventDefault(); const p = rel(e); this._zoomAround(this.z + (e.deltaY < 0 ? 0.5 : -0.5), p[0], p[1]); }, { passive: false });
  };
  P.layerStats = function (L) { return { ok: L.ok, err: L.err }; };
  P.set3D = function () {}; P.setHillshade = function () {}; P.addHillshade = function () {};
  P.flyTo = function (ll, z) { this.setView(ll, Math.min(z, 16)); };
  P.zoomIn = function () { this._zoomAround(Math.round(this.z) + 1, this.w / 2, this.h / 2); };
  P.zoomOut = function () { this._zoomAround(Math.round(this.z) - 1, this.w / 2, this.h / 2); };

  G.MiniMap = MiniMap;
})(window);

/* --- senderos como líneas que se pueden tocar (2D) --- */
(function () {
  const P = window.MiniMap && window.MiniMap.prototype; if (!P) return;
  P.setTrails = function (fc, onClick) {
    (this._trails || []).forEach(v => v.remove()); this._trails = []; this._trailClick = onClick;
    fc.features.forEach(f => {
      f.geometry.coordinates.forEach(line => {
        const pts = line.map(c => [c[1], c[0]]);
        const hit = this.polyline(pts, { color: "#000", weight: 20, opacity: 0.001 }); hit.minZoom = 10;
        hit.e.setAttribute("data-rid", f.properties.id); hit.e.style.pointerEvents = "stroke";
        const v = this.polyline(pts, { color: f.properties.color, weight: 3.5, opacity: 0.95 }); v.minZoom = 10;
        v.rid = f.properties.id; v.color = f.properties.color; hit.rid = f.properties.id; hit.isHit = true;
        this._trails.push(hit, v);
      });
    });
  };
  P.highlightTrail = function (id) {
    (this._trails || []).forEach(v => { if (v.isHit) return; const on = v.rid === id; v.e.setAttribute("stroke", on ? "#ffd400" : v.color); v.e.setAttribute("stroke-width", on ? 7 : 3.5); });
  };
})();
