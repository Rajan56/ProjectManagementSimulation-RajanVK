/*
 * Deadline Dynamics: small SVG chart helpers (no libraries)
 * (c) Rajan Kumar V K. All rights reserved.
 */
(function (root) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function niceStep(range, ticks) {
    var raw = range / ticks;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return step * mag;
  }

  /*
   * opts: {
   *   xMax, yMin, yMax, yTicks, yFmt, height,
   *   series: [{ values: [], cls, area, dot }],
   *   deadline, gap: { a: values, b: values }, annotations: [{x, y, text, cls, anchor}]
   * }
   */
  function lineChart(container, o) {
    container.innerHTML = "";
    var W = o.width || 640, H = o.height || 250;
    var pl = 46, pr = 16, pt = 14, pb = 28;
    var iw = W - pl - pr, ih = H - pt - pb;
    var xMax = Math.max(1, o.xMax);
    var yMin = o.yMin != null ? o.yMin : 0;
    var yMax = o.yMax;
    if (yMax == null) {
      yMax = 0;
      o.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null && v > yMax) yMax = v; }); });
      var st = niceStep(yMax - yMin || 1, o.yTicks || 4);
      yMax = Math.ceil(yMax / st) * st || 1;
    }
    var fx = function (x) { return pl + (x / xMax) * iw; };
    var fy = function (y) { return pt + ih - ((y - yMin) / (yMax - yMin)) * ih; };

    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": o.label || "chart" });
    container.appendChild(svg);

    // grid and y labels
    var step = o.yStep || niceStep(yMax - yMin, o.yTicks || 4);
    for (var y = yMin; y <= yMax + 1e-9; y += step) {
      el("line", { x1: pl, x2: W - pr, y1: fy(y), y2: fy(y), class: "grid" }, svg);
      var t = el("text", { x: pl - 8, y: fy(y) + 4, "text-anchor": "end", class: "axis-label" }, svg);
      t.textContent = o.yFmt ? o.yFmt(y) : String(Math.round(y));
    }
    // x labels
    var xs = xMax <= 14 ? 2 : xMax <= 24 ? 3 : 4;
    for (var x = 0; x <= xMax; x += xs) {
      var tx = el("text", { x: fx(x), y: H - 8, "text-anchor": "middle", class: "axis-label" }, svg);
      tx.textContent = x === 0 ? "M0" : "M" + x;
    }

    if (o.deadline != null && o.deadline <= xMax) {
      el("line", { x1: fx(o.deadline), x2: fx(o.deadline), y1: pt, y2: pt + ih, class: "deadline" }, svg);
      var dl = el("text", { x: fx(o.deadline) - 4, y: pt + 10, "text-anchor": "end", class: "deadline-label" }, svg);
      dl.textContent = "deadline";
    }

    // shaded gap between two series
    if (o.gap) {
      var top = [], bot = [];
      for (var i = 0; i < o.gap.a.length; i++) {
        if (o.gap.a[i] == null || o.gap.b[i] == null) continue;
        top.push([fx(i), fy(o.gap.a[i])]);
        bot.unshift([fx(i), fy(o.gap.b[i])]);
      }
      if (top.length > 1) {
        var d = "M" + top.concat(bot).map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L") + "Z";
        el("path", { d: d, class: "gap-band" }, svg);
      }
    }

    o.series.forEach(function (s) {
      var pts = [];
      s.values.forEach(function (v, i) { if (v != null) pts.push([fx(i), fy(v)]); });
      if (pts.length === 0) return;
      if (s.area && pts.length > 1) {
        var ad = "M" + pts[0][0] + "," + fy(yMin) + "L" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L") +
          "L" + pts[pts.length - 1][0] + "," + fy(yMin) + "Z";
        el("path", { d: ad, class: "a-" + s.cls }, svg);
      }
      if (pts.length > 1) {
        el("path", {
          d: "M" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L"),
          class: "s-" + s.cls,
          fill: "none",
          "stroke-width": s.width || 2.4,
          "stroke-linejoin": "round",
          "stroke-linecap": "round"
        }, svg);
      }
      if (s.dot !== false) {
        var last = pts[pts.length - 1];
        el("circle", { cx: last[0], cy: last[1], r: 4.5, class: "dot-" + s.cls }, svg);
      }
    });

    (o.annotations || []).forEach(function (a) {
      var t = el("text", { x: fx(a.x) + (a.dx || 0), y: fy(a.y) + (a.dy || 0), "text-anchor": a.anchor || "start", class: "annot " + (a.cls || "muted") }, svg);
      t.textContent = a.text;
    });
    return svg;
  }

  function barChart(container, o) {
    container.innerHTML = "";
    var W = o.width || 640, H = o.height || 230;
    var pl = 46, pr = 16, pt = 14, pb = 28;
    var iw = W - pl - pr, ih = H - pt - pb;
    var n = o.values.length;
    var yMax = Math.max.apply(null, o.values.concat([1]));
    var st = niceStep(yMax, 4);
    yMax = Math.ceil(yMax / st) * st;
    var fy = function (y) { return pt + ih - (y / yMax) * ih; };
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": o.label || "chart" });
    container.appendChild(svg);
    for (var y = 0; y <= yMax + 1e-9; y += st) {
      el("line", { x1: pl, x2: W - pr, y1: fy(y), y2: fy(y), class: "grid" }, svg);
      var t = el("text", { x: pl - 8, y: fy(y) + 4, "text-anchor": "end", class: "axis-label" }, svg);
      t.textContent = Math.round(y);
    }
    var bw = iw / Math.max(1, n);
    o.values.forEach(function (v, i) {
      var h = (v / yMax) * ih;
      el("rect", { x: pl + i * bw + bw * 0.18, y: pt + ih - h, width: bw * 0.64, height: Math.max(0, h), rx: 2, class: "bar" }, svg);
    });
    var xs = n <= 14 ? 2 : n <= 24 ? 3 : 4;
    for (var i = 0; i < n; i += xs) {
      var tx = el("text", { x: pl + i * bw + bw / 2, y: H - 8, "text-anchor": "middle", class: "axis-label" }, svg);
      tx.textContent = "M" + (i + 1);
    }
    return svg;
  }

  root.DDCharts = { lineChart: lineChart, barChart: barChart };
})(window);
