/* map3d.js — mapa 3D con relieve (MapLibre GL). Misma interfaz que minimap.js para que la app use uno u otro. */
(function (G) {
  "use strict";
  const DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

  function GLMap(el, opt) {
    const self = this;
    this.el = el; this.loaded = false; this.q = []; this.handlers = {}; this._n = 0; this.is3D = false;
    this.tileOK = 0; this.tileErr = 0; this.src = {};
    const style = {
      version: 8,
      sources: {
        dem: { type: "raster-dem", tiles: [DEM], tileSize: 256, maxzoom: 14, encoding: "terrarium", attribution: "Relieve: Mapzen/AWS Terrain Tiles" },
        hs: { type: "raster-dem", tiles: [DEM], tileSize: 256, maxzoom: 14, encoding: "terrarium" }
      },
      layers: [{ id: "bg", type: "background", paint: { "background-color": "#e8e2d4" } }]
    };
    this.map = new maplibregl.Map({
      container: el, style, center: [opt.center[1], opt.center[0]], zoom: opt.zoom || 10,
      minZoom: opt.minZoom || 7, maxZoom: opt.maxZoom || 18, maxPitch: 75,
      attributionControl: false, dragRotate: true, touchPitch: true, pitchWithRotate: true
    });
    const m = this.map;
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), "bottom-left");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 90 }), "bottom-left");
    m.on("load", () => { self.loaded = true; const q = self.q; self.q = []; q.forEach(f => { try { f(); } catch (e) { console.warn(e); } }); });
    m.on("dragstart", () => self._emit("dragstart"));
    m.on("rotatestart", () => self._emit("dragstart"));
    m.on("data", e => { if (e.dataType === "source" && e.tile) { self.tileOK++; const k = e.sourceId; (self.src[k] = self.src[k] || { ok: 0, err: 0 }).ok++; } });
    m.on("error", e => { self.tileErr++; const k = e && e.sourceId; if (k) (self.src[k] = self.src[k] || { ok: 0, err: 0 }).err++; });
  }
  const P = GLMap.prototype;
  P.on = function (ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); };
  P._emit = function (ev, a) { (this.handlers[ev] || []).forEach(f => f(a)); };
  P._do = function (f) { if (this.loaded) f(); else this.q.push(f); };
  P.invalidateSize = function () { this.map.resize(); };
  P.getZoom = function () { return this.map.getZoom(); };
  P.setView = function (ll, z) { this.map.jumpTo({ center: [ll[1], ll[0]], zoom: z == null ? this.map.getZoom() : z }); };
  P.panTo = function (ll) { this.map.easeTo({ center: [ll[1], ll[0]], duration: 500 }); };
  P.flyTo = function (ll, z, pitch, bearing) { this.map.flyTo({ center: [ll[1], ll[0]], zoom: z, pitch: pitch == null ? this.map.getPitch() : pitch, bearing: bearing == null ? this.map.getBearing() : bearing, duration: 1800, essential: true }); };
  P.fitBounds = function (pts, pad) {
    let a = 180, b = 90, c = -180, d = -90;
    pts.forEach(p => { a = Math.min(a, p[1]); b = Math.min(b, p[0]); c = Math.max(c, p[1]); d = Math.max(d, p[0]); });
    this.map.fitBounds([[a, b], [c, d]], { padding: pad || 40, maxZoom: 16, duration: 800 });
  };
  P.zoomIn = function () { this.map.zoomIn(); };
  P.zoomOut = function () { this.map.zoomOut(); };

  P.addTileLayer = function (url, o) {
    o = o || {};
    const id = "r" + (this._n++), sub = o.subdomains || "abc";
    const tiles = url.indexOf("{s}") >= 0 ? sub.split("").map(s => url.replace("{s}", s)) : [url];
    const L = { id, visible: true, attribution: o.attribution || "" };
    this._do(() => {
      this.map.addSource(id, { type: "raster", tiles, tileSize: 256, maxzoom: o.maxZoom || 18, attribution: o.attribution || "" });
      this.map.addLayer({ id, type: "raster", source: id, layout: { visibility: L.visible ? "visible" : "none" }, paint: { "raster-opacity": o.opacity == null ? 1 : o.opacity, "raster-fade-duration": 200 } }, (o.before && this.map.getLayer(o.before)) ? o.before : undefined);
    });
    return L;
  };
  P.layerStats = function (L) { return this.src[L.id] || { ok: 0, err: 0 }; };
  P.setLayerVisible = function (L, v) { L.visible = v; this._do(() => { if (this.map.getLayer(L.id)) this.map.setLayoutProperty(L.id, "visibility", v ? "visible" : "none"); }); };
  P.addHillshade = function () {
    this._do(() => this.map.addLayer({ id: "hill", type: "hillshade", source: "hs", paint: { "hillshade-exaggeration": 0.45, "hillshade-shadow-color": "#2a2416", "hillshade-highlight-color": "#fffaf0" } }));
  };
  P.setHillshade = function (v) { this._do(() => { if (this.map.getLayer("hill")) this.map.setLayoutProperty("hill", "visibility", v ? "visible" : "none"); }); };
  P.set3D = function (on) {
    this.is3D = on;
    this._do(() => {
      if (on) { this.map.setTerrain({ source: "dem", exaggeration: 1.6 }); this.map.easeTo({ pitch: 62, duration: 900 }); }
      else { this.map.setTerrain(null); this.map.easeTo({ pitch: 0, bearing: 0, duration: 700 }); }
    });
  };

  P.marker = function (ll, html, o) {
    o = o || {};
    const el = document.createElement("div");
    el.className = "gl-mk"; el.innerHTML = html; if (o.z) el.style.zIndex = o.z;
    if (o.onClick) el.addEventListener("click", e => { e.stopPropagation(); o.onClick(); });
    const ax = o.anchor ? o.anchor[0] : 0, ay = o.anchor ? o.anchor[1] : 0;
    const mk = new maplibregl.Marker({ element: el, anchor: "top-left", offset: [-ax, -ay] }).setLngLat([ll[1], ll[0]]).addTo(this.map);
    return {
      setLatLng: p => mk.setLngLat([p[1], p[0]]),
      setHTML: h => { el.innerHTML = h; },
      remove: () => mk.remove()
    };
  };
  function line(pts) { return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts.map(p => [p[1], p[0]]) } }; }
  function circlePoly(ll, r) {
    const c = [], n = 40, dLat = r / 111320, dLon = r / (111320 * Math.cos(ll[0] * Math.PI / 180));
    for (let k = 0; k <= n; k++) { const a = 2 * Math.PI * k / n; c.push([ll[1] + dLon * Math.cos(a), ll[0] + dLat * Math.sin(a)]); }
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [c] } };
  }
  P.polyline = function (pts, st) {
    st = st || {}; const id = "v" + (this._n++), self = this; let data = line(pts);
    this._do(() => {
      self.map.addSource(id, { type: "geojson", data });
      const paint = { "line-color": st.color || "#d0342c", "line-width": st.weight || 4, "line-opacity": st.opacity || 0.9 };
      if (st.dash) paint["line-dasharray"] = [2, 2];
      self.map.addLayer({ id, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint });
    });
    return {
      setPoints: p => { data = line(p); self._do(() => { const s = self.map.getSource(id); if (s) s.setData(data); }); },
      remove: () => self._do(() => { if (self.map.getLayer(id)) self.map.removeLayer(id); if (self.map.getSource(id)) self.map.removeSource(id); })
    };
  };
  P.circle = function (ll, r) {
    const id = "c" + (this._n++), self = this; let data = circlePoly(ll, r || 10);
    this._do(() => {
      self.map.addSource(id, { type: "geojson", data });
      self.map.addLayer({ id, type: "fill", source: id, paint: { "fill-color": "#1a73e8", "fill-opacity": 0.12 } });
    });
    return {
      set: (p, rr) => { data = circlePoly(p, rr || 10); self._do(() => { const s = self.map.getSource(id); if (s) s.setData(data); }); },
      remove: () => self._do(() => { if (self.map.getLayer(id)) self.map.removeLayer(id); if (self.map.getSource(id)) self.map.removeSource(id); })
    };
  };

  function webglOK() {
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
  }
  /* Carga MapLibre (queda guardado para usar sin cobertura). cb(true) si hay 3D, cb(false) si no. */
  function loadGL(cb) {
    if (G.maplibregl) return cb(true);
    if (!webglOK()) return cb(false);
    let done = false; const fin = ok => { if (!done) { done = true; cb(ok); } };
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
    s.onload = () => fin(!!G.maplibregl); s.onerror = () => fin(false);
    document.head.appendChild(s);
    setTimeout(() => fin(!!G.maplibregl), 9000);
  }
  G.GLMap = GLMap; G.loadGL = loadGL;
})(window);

/* --- senderos como líneas que se pueden tocar (3D) --- */
(function () {
  const P = window.GLMap && window.GLMap.prototype; if (!P) return;
  P.getCenter = function () { const c = this.map.getCenter(); return [c.lat, c.lng]; };
  P.setTrails = function (fc, onClick) {
    const self = this;
    this._do(() => {
      const m = self.map;
      if (m.getSource("trails")) { m.getSource("trails").setData(fc); return; }
      m.addSource("trails", { type: "geojson", data: fc });
      const w = (a, b) => ["interpolate", ["linear"], ["zoom"], 9, a, 15, b];
      m.addLayer({ id: "trails-case", type: "line", source: "trails", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": w(2.5, 8), "line-opacity": 0.85 } });
      m.addLayer({ id: "trails-hl", type: "line", source: "trails", filter: ["==", ["get", "id"], ""], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffd400", "line-width": w(6, 13), "line-opacity": 0.95 } });
      m.addLayer({ id: "trails-line", type: "line", source: "trails", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": w(1.5, 4.5) } });
      m.addLayer({ id: "trails-hit", type: "line", source: "trails", paint: { "line-color": "#000", "line-opacity": 0, "line-width": 22 } });
      m.on("click", "trails-hit", e => { if (e.features && e.features[0]) onClick(e.features[0].properties.id); });
      m.on("mouseenter", "trails-hit", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "trails-hit", () => { m.getCanvas().style.cursor = ""; });
    });
  };
  P.highlightTrail = function (id) { this._do(() => { if (this.map.getLayer("trails-hl")) this.map.setFilter("trails-hl", ["==", ["get", "id"], id || ""]); }); };
})();
