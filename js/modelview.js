/*
 * Deadline Dynamics: model view
 * (c) Rajan Kumar V K. All rights reserved.
 *
 * Draws the model's stock and flow structure with the values of one month,
 * and ranks the feedback loops by how much of that month's effort they
 * affected. Pipe width follows the size of each flow.
 */
(function (root) {
  "use strict";

  var LOOPS = [
    { id: "rework", code: "R1", name: "Rework cycle", text: "Flawed work is counted as done, hides, then surfaces and returns to the to-do pile." },
    { id: "fatigue", code: "R2", name: "Fatigue spiral", text: "Overtime builds fatigue; tired people work slower and make more mistakes." },
    { id: "knock", code: "R3", name: "Knock-on rework", text: "When flaws surface, later work built on top of them has to be redone too." },
    { id: "brooks", code: "R4", name: "Coaching drag", text: "New hires work slowly while learning and take time from experienced staff." },
    { id: "testing", code: "B1", name: "Quality control", text: "Reviews and testing catch errors at the source, before they can hide.", balancing: true }
  ];

  function fmt(x) { return Math.round(x).toLocaleString("en-US"); }
  function pct(x) { return Math.round(x * 100) + "%"; }

  function strengths(row) { return root.DDEngine.loopStrengths(row); }

  function dominant(row) {
    var st = strengths(row);
    var best = null;
    LOOPS.forEach(function (l) { if (!l.balancing && (!best || st[l.id] > st[best.id])) best = l; });
    return { loop: best, value: st[best.id], all: st };
  }

  function stock(x, y, w, h, title, value, sub, cls) {
    return '<g class="sfd-stock ' + (cls || "") + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4"></rect>' +
      '<text class="sfd-title" x="' + (x + 12) + '" y="' + (y + 22) + '">' + title + "</text>" +
      '<text class="sfd-value" x="' + (x + 12) + '" y="' + (y + 50) + '">' + value + "</text>" +
      (sub ? '<text class="sfd-sub" x="' + (x + w - 10) + '" y="' + (y + 50) + '" text-anchor="end">' + sub + "</text>" : "") + "</g>";
  }

  function pipe(d, width, cls, hot, label, lx, ly, anchor) {
    return '<path class="sfd-pipe ' + cls + (hot ? " hot" : "") + '" d="' + d + '" stroke-width="' + width.toFixed(1) + '" marker-end="url(#sfd-arrow)"></path>' +
      '<text class="sfd-flow" x="' + lx + '" y="' + ly + '" text-anchor="' + (anchor || "middle") + '">' + label + "</text>";
  }

  /*
   * game: engine state; idx: history index (month). unit: e.g. "features".
   * Renders into container and returns the dominant loop for that month.
   */
  function diagram(container, game, idx) {
    var h = game.history;
    idx = Math.max(0, Math.min(h.length - 1, idx == null ? h.length - 1 : idx));
    var row = h[idx];
    var sc = root.DDEngine.findScenario(game.scenarioId);
    var unit = sc ? sc.unit : "tasks";
    var correctFlow = Math.max(0, row.work - row.flawed);
    var flows = { correct: correctFlow, flawed: row.flawed, found: row.found, knock: row.knock };
    var maxF = Math.max(1, flows.correct, flows.flawed, flows.found, flows.knock);
    var wOf = function (v) { return 2 + 20 * (v / maxF); };
    var dom = idx > 0 ? dominant(row) : null;
    var hot = dom ? dom.loop.id : null;
    var done = row.truth * row.scope;

    var svg = '<svg viewBox="0 0 860 520" role="img" aria-label="Stock and flow diagram of the project model for month ' + row.m + '">' +
      '<defs><marker id="sfd-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="sfd-arrowhead"></path></marker>' +
      '<marker id="sfd-link" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="sfd-linkhead"></path></marker></defs>';

    // flows between work stocks
    svg += pipe("M212,196 C 420,196 440,78 628,78", wOf(flows.correct), "p-correct", false, "Sound work " + fmt(flows.correct), 420, 128);
    svg += pipe("M212,232 C 420,232 440,338 628,338", wOf(flows.flawed), "p-flawed", hot === "fatigue" || hot === "rework", "Flawed work " + fmt(flows.flawed), 420, 300);
    svg += pipe("M640,378 C 520,450 220,440 140,268", wOf(flows.found), "p-found", hot === "rework", "Rework found " + fmt(flows.found), 380, 446);
    svg += pipe("M640,40 C 520,-4 220,8 140,168", wOf(flows.knock), "p-knock", hot === "knock", "Knock-on " + fmt(flows.knock), 380, 22);

    // stocks
    svg += stock(40, 168, 172, 100, "Work to do", fmt(row.todo), unit, "s-todo");
    svg += stock(640, 28, 190, 100, "Done correctly", fmt(done), pct(row.truth), "s-done");
    svg += stock(640, 288, 190, 100, "Hidden rework", fmt(row.undisc), "not visible", "s-hidden" + (hot === "rework" ? " hot" : ""));
    svg += stock(640, 158, 190, 100, "Team fatigue", pct(row.fatigue), "", "s-fatigue" + (hot === "fatigue" ? " hot" : ""));

    // reported progress bracket
    svg += '<text class="sfd-note" x="836" y="432" text-anchor="end">Reported progress = done + hidden = ' + pct(row.reported) + "</text>";

    // people row
    svg += stock(40, 420, 172, 84, "New staff", String(row.rook), "learning", "s-people" + (hot === "brooks" ? " hot" : ""));
    svg += stock(300, 420, 190, 84, "Experienced", String(row.exp), row.contr ? "+" + row.contr + " contractors" : "", "s-people");
    svg += '<path class="sfd-pipe p-learn" d="M212,462 L292,462" stroke-width="6" marker-end="url(#sfd-arrow)"></path>';
    svg += '<text class="sfd-flow" x="252" y="452" text-anchor="middle">learning</text>';

    // causal links (thin)
    svg += '<path class="sfd-link" d="M395,420 C 360,360 300,320 260,250" marker-end="url(#sfd-link)"></path>';
    svg += '<text class="sfd-aux" x="300" y="372">capacity</text>';
    svg += '<path class="sfd-link' + (hot === "fatigue" ? " hot" : "") + '" d="M640,215 C 560,230 520,260 470,300" marker-end="url(#sfd-link)"></path>';
    svg += '<text class="sfd-aux" x="535" y="238">more errors</text>';
    svg += '<path class="sfd-link' + (hot === "brooks" ? " hot" : "") + '" d="M150,420 C 170,380 190,330 200,275" marker-end="url(#sfd-link)"></path>';
    svg += '<text class="sfd-aux" x="96" y="392">coaching load</text>';

    // decisions (aux)
    svg += '<text class="sfd-dec" x="836" y="456" text-anchor="end">Month ' + row.m + " settings: overtime " + pct(row.overtime) + ", testing " + pct(row.qa) + ", overlap " + row.overlap + "</text>";
    svg += '<text class="sfd-dec" x="836" y="480" text-anchor="end">Caught in review: ' + fmt(row.caught) + " " + unit + "</text>";
    svg += "</svg>";

    container.innerHTML = svg;
    return dom;
  }

  function loopBars(row) {
    var st = strengths(row);
    var max = 0;
    LOOPS.forEach(function (l) { max = Math.max(max, st[l.id]); });
    var dom = dominant(row);
    return '<ul class="loop-list">' + LOOPS.map(function (l) {
      var v = st[l.id];
      var w = max > 0 ? Math.max(2, (v / max) * 100) : 2;
      var isDom = !l.balancing && dom.loop.id === l.id && v > 0.005;
      return '<li class="loop-item l-' + l.id + (isDom ? " dom" : "") + '"><div class="loop-head"><b>' + l.code + " " + l.name + "</b><span>" + pct(v) + "</span></div>" +
        '<div class="loop-bar"><i style="width:' + w + '%"></i></div><p>' + l.text + "</p></li>";
    }).join("") + "</ul>";
  }

  function series(game) {
    var h = game.history.slice(1);
    var out = {};
    LOOPS.forEach(function (l) { out[l.id] = [0]; });
    h.forEach(function (r) {
      var st = strengths(r);
      LOOPS.forEach(function (l) { out[l.id].push(Math.round(st[l.id] * 1000) / 10); });
    });
    return out;
  }

  var api = { LOOPS: LOOPS, diagram: diagram, loopBars: loopBars, dominant: dominant, series: series };
  root.DDModel = api;
})(window);
