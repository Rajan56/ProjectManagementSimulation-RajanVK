/*
 * Deadline Dynamics: user interface
 * (c) Rajan Kumar V K. All rights reserved.
 */
(function () {
  "use strict";

  var E = window.DDEngine;
  var C = window.DDCharts;
  var SCENARIOS = window.DDScenarios.SCENARIOS;
  var PAGES_URL = "https://rajan56.github.io/ProjectManagementSimulation-RajanVK/";
  var app = document.getElementById("app");

  var state = { view: "home", scenarioId: null, game: null, dialog: null };

  /* ---------- Storage (one viewer's conveniences only) ---------- */

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { return null; }
    return null;
  }

  function saveCurrent() {
    if (state.game && !state.game.finished) store("dd.current", { scenarioId: state.scenarioId, game: state.game });
    else store("dd.current", null);
  }

  function bestScores() { return store("dd.best") || {}; }

  function recordBest(id, score) {
    var b = bestScores();
    if (!b[id] || score > b[id]) { b[id] = score; store("dd.best", b); return true; }
    return false;
  }

  /* ---------- Formatting ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pct(x) { return Math.round(x * 100) + "%"; }
  function eur(k) { return "€" + Math.round(k).toLocaleString("en-US") + "k"; }
  function n0(x) { return Math.round(x).toLocaleString("en-US"); }
  function scenario() { return E.findScenario(state.scenarioId); }
  function shareUrl() {
    if (/github\.io$/.test(location.hostname)) return location.origin + location.pathname;
    return PAGES_URL;
  }

  /* ---------- Navigation ---------- */

  function go(view) {
    state.view = view;
    state.dialog = null;
    render();
    window.scrollTo(0, 0);
  }

  function setNav() {
    var navMap = { home: "home", brief: "home", play: "home", debrief: "home", method: "method" };
    document.querySelectorAll("[data-nav]").forEach(function (b) {
      if (b.getAttribute("data-nav") === navMap[state.view]) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }

  function render() {
    setNav();
    var html = "";
    if (state.view === "home") html = viewHome();
    else if (state.view === "brief") html = viewBrief();
    else if (state.view === "play") html = viewPlay();
    else if (state.view === "debrief") html = viewDebrief();
    else if (state.view === "method") html = viewMethod();
    app.innerHTML = '<div class="view">' + html + "</div>" + dialogHtml();
    afterRender();
  }

  function afterRender() {
    if (state.view === "home") drawHeroChart();
    if (state.view === "play") { drawPlayCharts(); bindRanges(); }
    if (state.view === "debrief") { drawDebriefCharts(); drawScoreCard(); }
    var first = app.querySelector(".dialog .option, .dialog .btn-primary");
    if (first) first.focus();
  }

  function toast(text) {
    var t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2300);
  }

  /* ---------- Home ---------- */

  function viewHome() {
    var best = bestScores();
    var saved = store("dd.current");
    var resume = "";
    if (saved && saved.game && !saved.game.finished) {
      var ss = E.findScenario(saved.scenarioId);
      if (ss) {
        resume = '<div class="resume"><div><span class="eyebrow">Unfinished project</span><br><b>' + esc(ss.title) +
          "</b>, month " + saved.game.month + " of " + saved.game.deadline + '</div><div class="actions"><button class="btn btn-primary" data-action="resume">Resume</button><button class="btn" data-action="discard">Discard</button></div></div>';
      }
    }

    var cards = SCENARIOS.map(function (s) {
      var b = best[s.id];
      return '<button class="scenario" type="button" data-action="pick" data-id="' + s.id + '">' +
        '<div class="scenario-top"><span class="chip accent">' + esc(s.sector) + '</span><span class="chip ' + (s.difficulty === "Hard" ? "warn" : "") + '">' + esc(s.difficulty) + "</span></div>" +
        "<h3>" + esc(s.title) + "</h3>" +
        "<p>" + esc(s.summary) + "</p>" +
        '<dl class="spec">' +
        "<div><dt>Scope</dt><dd>" + n0(s.scope) + "</dd></div>" +
        "<div><dt>Deadline</dt><dd>" + s.deadline + " mo</dd></div>" +
        "<div><dt>Budget</dt><dd>" + eur(s.budget) + "</dd></div>" +
        "<div><dt>Team</dt><dd>" + (s.experienced + s.rookies) + "</dd></div>" +
        "</dl>" +
        '<span class="best">' + (b ? "Your best score: <strong>" + b + "/100</strong>" : "Not played yet") + "</span>" +
        "</button>";
    }).join("");

    return '<section class="hero">' +
      "<div>" +
      '<span class="eyebrow">Project management simulator &middot; system dynamics</span>' +
      "<h1>Ninety percent done.<em>Again.</em></h1>" +
      '<p class="hero-lede">Run a real project month by month. Hire people, push overtime, invest in testing and answer change requests. Your status reports will look fine for a while. <strong>The rework nobody can see yet is what decides how it ends.</strong></p>' +
      '<div class="hero-actions"><button class="btn btn-primary btn-big" data-action="scroll-scenarios">Choose a project</button><button class="btn btn-big" data-action="method">How the model works</button></div>' +
      resume +
      "</div>" +
      '<figure class="hero-chart" style="margin:0">' +
      '<div class="hero-chart-head"><h2>What the status report hid</h2><span class="chip">Example run</span></div>' +
      '<div class="legend"><span><i style="background:var(--accent)"></i>Reported progress</span><span><i style="background:var(--truth)"></i>Truly finished</span><span><i class="dash"></i>Plan</span></div>' +
      '<div class="chart" id="hero-chart"></div>' +
      "<figcaption>A run of the mobile banking app with a big early hiring push, heavy overtime and almost no testing. The shaded band is undiscovered rework: work everyone believed was done.</figcaption>" +
      "</figure>" +
      "</section>" +
      '<section class="section" id="scenarios">' +
      '<div class="section-head"><h2>Choose your project</h2><p>Four projects in four industries. Each one is fictional, and each one is built to go wrong in its own way.</p></div>' +
      '<div class="scenario-grid">' + cards + "</div>" +
      "</section>" +
      '<section class="section">' +
      '<div class="section-head"><h2>How a month works</h2><p>A game takes 10 to 15 minutes. Every month you see the dashboard, make your calls and let four weeks play out.</p></div>' +
      '<div class="steps">' +
      '<div class="step"><h3>Read the dashboard</h3><p>Progress, spend, team energy and defects found. Keep in mind that reported progress also counts work that only looks finished.</p></div>' +
      '<div class="step"><h3>Make your calls</h3><p>Set hiring, overtime, testing effort and how far project phases overlap. Answer change requests when the client sends them.</p></div>' +
      '<div class="step"><h3>Face the debrief</h3><p>When the project ends you get a score on five dimensions and charts that show what really drove the result, month by month.</p></div>' +
      "</div></section>";
  }

  function drawHeroChart() {
    var host = document.getElementById("hero-chart");
    if (!host) return;
    var g = E.newGame("software");
    var guard = 0;
    while (!g.finished && g.month < 16 && guard++ < 40) {
      if (g.pendingChoice) E.respond(g, "accept");
      E.setDecisions(g, { hire: g.month === 0 ? 8 : 0, overtime: g.month >= 4 ? 0.2 : 0, qa: 0.05, overlap: "high" });
      E.runMonth(g);
    }
    var h = g.history;
    var rep = h.map(function (r) { return r.reported * 100; });
    var tru = h.map(function (r) { return r.truth * 100; });
    var plan = h.map(function (r) { return Math.min(100, (r.m / 12) * 100); });
    var gi = 0;
    h.forEach(function (r, i) { if (r.reported >= 0.8 && r.reported - r.truth > h[gi].reported - h[gi].truth) gi = i; });
    C.lineChart(host, {
      xMax: h.length - 1, yMin: 0, yMax: 100, yStep: 25, yFmt: function (v) { return v + "%"; }, height: 300, width: 520,
      deadline: 12,
      gap: { a: rep, b: tru },
      series: [
        { values: plan, cls: "plan", dot: false, width: 1.6 },
        { values: tru, cls: "truth" },
        { values: rep, cls: "reported" }
      ],
      annotations: [
        { x: gi, y: rep[gi], text: "Report: " + Math.round(rep[gi]) + "%", cls: "reported", dy: -10, anchor: "end" },
        { x: gi, y: tru[gi], text: "Truth: " + Math.round(tru[gi]) + "%", cls: "truth", dy: 18, anchor: "start", dx: 6 }
      ],
      label: "Example run: reported progress against truly finished work"
    });
  }

  /* ---------- Briefing ---------- */

  function viewBrief() {
    var s = scenario();
    return '<section class="brief">' +
      "<div>" +
      '<span class="eyebrow">' + esc(s.sector) + " &middot; Client: " + esc(s.client) + "</span>" +
      "<h1>" + esc(s.title) + "</h1>" +
      '<p class="brief-text">' + esc(s.brief) + "</p>" +
      '<p class="tip">Plan check: delivering ' + n0(s.scope) + " " + esc(s.unit) + " in " + s.deadline + " months, with some rework, needs about <b>" + requiredTeam(s) +
      " people</b> working at full speed. You start with " + (s.experienced + s.rookies) + ", of whom " + s.rookies + " are new. Budget covers salaries, recruitment and overtime.</p>" +
      '<div class="actions" style="margin-top:22px"><button class="btn btn-primary btn-big" data-action="start">Start month 1</button><button class="btn btn-big" data-action="home">Back to projects</button></div>' +
      "</div>" +
      '<div style="display:grid;gap:16px">' +
      '<div class="panel"><h2>Targets</h2><div class="targets">' +
      '<div class="target"><div class="k">Scope</div><div class="v">' + n0(s.scope) + '</div><div class="s">' + esc(s.unit) + "</div></div>" +
      '<div class="target"><div class="k">Deadline</div><div class="v">' + s.deadline + '</div><div class="s">months</div></div>' +
      '<div class="target"><div class="k">Budget</div><div class="v">' + eur(s.budget) + '</div><div class="s">' + eur(s.costPerFte) + " per person per month</div></div>" +
      '<div class="target"><div class="k">Team</div><div class="v">' + s.experienced + " + " + s.rookies + '</div><div class="s">experienced + new</div></div>' +
      "</div></div>" +
      '<div class="panel"><h3>Your levers each month</h3><ul class="lever-list">' +
      "<li><b>Hiring</b><span>Recruits arrive a month later and need about three months to reach full speed.</span></li>" +
      "<li><b>Overtime</b><span>More hours now. Fatigue builds over weeks and brings mistakes.</span></li>" +
      "<li><b>Testing</b><span>Reviews take capacity but catch errors early, when they are cheap to fix.</span></li>" +
      "<li><b>Phase overlap</b><span>Running phases in parallel is faster, but flaws spread into later work.</span></li>" +
      "<li><b>Release</b><span>Once reports reach 90% you may ship early. Hidden flaws ship too.</span></li>" +
      "</ul></div>" +
      "</div></section>";
  }

  function requiredTeam(s) {
    var gross = s.scope * 1.25;
    var perPersonMonth = s.productivity * 4 * 0.92;
    return Math.round(gross / (s.deadline * perPersonMonth));
  }

  /* ---------- Cockpit ---------- */

  function viewPlay() {
    var g = state.game, s = scenario();
    var h = g.history, last = h[h.length - 1], prev = h.length > 1 ? h[h.length - 2] : null;
    var m = g.month;
    var planned = Math.min(1, m / g.deadline);
    var behind = planned - last.reported;
    var progChip = m === 0 ? '<span class="chip">Start</span>' : behind > 0.12 ? '<span class="chip bad">Behind</span>' : behind > 0.04 ? '<span class="chip warn">Slipping</span>' : '<span class="chip good">On plan</span>';
    var spendPlan = g.budget * Math.min(1, m / g.deadline);
    var spendChip = m === 0 ? "" : g.cost > g.budget ? '<span class="chip bad">Over</span>' : g.cost > spendPlan * 1.08 ? '<span class="chip warn">High</span>' : '<span class="chip good">OK</span>';
    var energy = 1 - g.fatigue;
    var energyChip = energy > 0.75 ? '<span class="chip good">Fresh</span>' : energy > 0.5 ? '<span class="chip warn">Tired</span>' : '<span class="chip bad">Exhausted</span>';
    var fc = E.naiveForecast(g);
    var arriving = g.pipeline.reduce(function (a, p) { return a + p.n; }, 0);
    var foundTrend = prev && last.found > prev.found * 1.15 ? "rising" : prev && last.found < prev.found * 0.85 ? "falling" : "steady";

    var dlMonths = Math.max(g.deadline, m + 1);
    var monthMeter = '<div class="month-meter"><div class="row"><span>Month <b>' + m + "</b> completed</span><span>Deadline <b>month " + g.deadline + "</b></span></div>" +
      '<div class="timeline"><div class="fill" style="width:' + Math.min(100, (m / dlMonths) * 100) + '%"></div>' +
      (m > g.deadline ? '<div class="late" style="left:' + (g.deadline / dlMonths) * 100 + "%;width:" + ((m - g.deadline) / dlMonths) * 100 + '%"></div>' : "") +
      '<div class="dl" style="left:calc(' + (g.deadline / dlMonths) * 100 + '% - 1px)"></div></div></div>';

    var kpis = '<div class="kpis">' +
      kpi("Reported progress", progChip, pct(last.reported), "Plan: " + pct(planned), '<div class="bar-mini"><i style="width:' + last.reported * 100 + '%"></i><b style="left:' + planned * 100 + '%"></b></div>') +
      kpi("Spent", spendChip, eur(g.cost) + ' <small>/ ' + eur(g.budget) + "</small>", "Plan to date: " + eur(spendPlan), '<div class="bar-mini"><i style="width:' + Math.min(100, (g.cost / g.budget) * 100) + '%"></i><b style="left:' + Math.min(100, (spendPlan / g.budget) * 100) + '%"></b></div>') +
      kpi("Team", "", Math.round(g.exp + g.rook) + " <small>people</small>", Math.round(g.exp) + " experienced, " + Math.round(g.rook) + " new" + (arriving ? ", " + arriving + " arriving" : ""), "") +
      kpi("Team energy", energyChip, pct(energy), m === 0 ? "Everyone is rested" : "Overtime last month: " + pct(last.overtime), "") +
      kpi("Defects found", m === 0 ? "" : '<span class="chip">' + foundTrend + "</span>", m === 0 ? "0" : n0(last.found), esc(s.unit) + " sent back for rework last month", "") +
      kpi("Team lead's forecast", "", fc ? "M" + Math.ceil(fc) : "&ndash;", fc ? "Based on reported pace" : "Too early to call", "") +
      "</div>";

    var charts = '<div class="chart-grid" style="margin-top:12px">' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Progress</h3><div class="legend"><span><i style="background:var(--accent)"></i>Reported</span><span><i class="dash"></i>Plan</span></div></div><div class="chart" id="c-progress"></div></div>' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Spend</h3><div class="legend"><span><i style="background:var(--ink)"></i>Spent</span><span><i class="dash"></i>Budget plan</span></div></div><div class="chart" id="c-spend"></div></div>' +
      "</div>";

    return '<section class="cockpit-head">' +
      '<div><span class="eyebrow">' + esc(s.sector) + " &middot; " + esc(s.client) + "</span><h1>" + esc(s.title) + "</h1></div>" +
      monthMeter +
      "</section>" +
      '<div class="cockpit">' +
      "<div>" + kpis + charts + '<div class="feed" aria-live="polite">' + feedHtml() + "</div></div>" +
      '<aside class="decisions" id="decisions" aria-label="Decisions for next month">' + decisionsHtml() + "</aside>" +
      "</div>";
  }

  function kpi(label, chip, value, sub, extra) {
    return '<div class="kpi"><div class="k"><span>' + label + "</span>" + (chip || "") + '</div><div class="v">' + value + '</div><div class="s">' + sub + "</div>" + (extra || "") + "</div>";
  }

  function leadMessage() {
    var g = state.game, s = scenario();
    var h = g.history, last = h[h.length - 1], prev = h.length > 2 ? h[h.length - 2] : null;
    if (g.month === 0) {
      return "Kick-off is done. The plan is " + n0(s.scope) + " " + s.unit + " in " + s.deadline + " months. My estimate says we need around " + requiredTeam(s) +
        " people working at full speed, and we start with " + (s.experienced + s.rookies) + ".";
    }
    var parts = ["By our tracking we are " + pct(last.reported) + " done."];
    var fc = E.naiveForecast(g);
    if (fc) parts.push("At this pace we should finish around month " + Math.ceil(fc) + ".");
    if (g.fatigue > 0.45) parts.push("People are worn out, and I am seeing careless mistakes.");
    else if (g.fatigue > 0.25) parts.push("The team is starting to feel the long hours.");
    if (prev && last.found > prev.found * 1.3 && last.found > 0.02 * g.scope) parts.push("Testing keeps turning up problems in work we had already signed off.");
    if (g.rook > g.exp * 0.4) parts.push("The new people are keen, but the seniors spend a lot of time showing them the ropes.");
    var arriving = g.pipeline.reduce(function (a, p) { return a + p.n; }, 0);
    if (arriving) parts.push(arriving + (arriving === 1 ? " new hire starts" : " new hires start") + " next month.");
    return parts.join(" ");
  }

  function feedHtml() {
    var g = state.game;
    var items = [];
    items.push('<div class="msg lead"><div class="who">Team lead &middot; start of month ' + (g.month + 1) + '</div><p class="quote">' + esc(leadMessage()) + "</p></div>");
    var log = g.log.slice().reverse().slice(0, 6);
    log.forEach(function (e) {
      var label = e.kind === "change" ? "Client" : e.kind === "decision" ? "You" : "News";
      items.push('<div class="msg ' + e.kind + '"><div class="who">' + label + " &middot; month " + e.m + "</div><h4>" + esc(e.title) + "</h4>" + (e.text ? "<p>" + esc(e.text) + "</p>" : "") + "</div>");
    });
    return items.join("");
  }

  function decisionsHtml() {
    var g = state.game, s = scenario(), d = g.decisions;
    var heads = g.exp + g.rook;
    var burn = heads * s.costPerFte * (1 + E.P.overtimePremium * d.overtime) + Math.max(0, d.hire) * E.P.hiringCost + Math.max(0, -d.hire) * E.P.severanceCost;
    var hireHint = d.hire > 0 ? d.hire + " recruit" + (d.hire > 1 ? "s" : "") + " start next month. " + eur(E.P.hiringCost * d.hire) + " recruitment cost." :
      d.hire < 0 ? "Release " + -d.hire + (d.hire === -1 ? " person" : " people") + " now. " + eur(E.P.severanceCost * -d.hire) + " severance." : "No change to the team.";
    var ovs = ["low", "medium", "high"].map(function (k) {
      return '<button type="button" data-action="overlap" data-v="' + k + '" aria-pressed="' + (d.overlap === k) + '">' + E.OVERLAP[k].label + "</button>";
    }).join("");
    var ots = [0, 0.1, 0.2, 0.3].map(function (v) {
      return '<button type="button" data-action="ot" data-v="' + v + '" aria-pressed="' + (Math.abs(d.overtime - v) < 1e-6) + '">' + Math.round(v * 100) + "%</button>";
    }).join("");
    var overlapHint = d.overlap === "low" ? "Phases mostly in sequence. Slower, fewer knock-on errors." : d.overlap === "high" ? "Phases run in parallel. Faster, but flaws spread into later work." : "Some overlap between phases. The usual compromise.";
    var otHint = d.overtime === 0 ? "Normal hours. Fatigue recovers." : d.overtime <= 0.1 ? "A light push. Fine for a month or two." : d.overtime <= 0.2 ? "Heavy. Fatigue and errors build within weeks." : "Crunch. Expect mistakes and resignations if it lasts.";
    var release = E.canRelease(g) ? '<button class="btn btn-danger" data-action="release-ask">Release now at ' + pct(g.history[g.history.length - 1].reported) + " reported</button>" : "";

    return "<h2>Month " + (g.month + 1) + " decisions</h2>" +
      '<div class="field"><div class="field-label"><span class="lbl" id="lbl-hire">Hiring</span><output>' + (d.hire > 0 ? "+" : "") + d.hire + "</output></div>" +
      '<div class="stepper" role="group" aria-labelledby="lbl-hire"><button type="button" data-action="hire" data-v="-1" aria-label="One fewer">&minus;</button><div class="val">' + (d.hire > 0 ? "+" : "") + d.hire + '</div><button type="button" data-action="hire" data-v="1" aria-label="One more">+</button></div>' +
      '<span class="hint">' + hireHint + "</span></div>" +
      '<div class="field"><div class="field-label"><span class="lbl" id="lbl-ot">Overtime</span></div><div class="seg" role="group" aria-labelledby="lbl-ot">' + ots + '</div><span class="hint">' + otHint + "</span></div>" +
      '<div class="field"><div class="field-label"><label for="qa">Reviews and testing</label><output id="qa-out">' + pct(d.qa) + "</output></div>" +
      '<input type="range" id="qa" min="5" max="30" step="5" value="' + Math.round(d.qa * 100) + '"><span class="hint">Share of effort spent checking work. Catches errors while they are cheap to fix.</span></div>' +
      '<div class="field"><div class="field-label"><span class="lbl" id="lbl-ov">Phase overlap</span></div><div class="seg" role="group" aria-labelledby="lbl-ov">' + ovs + '</div><span class="hint">' + overlapHint + "</span></div>" +
      '<div class="run-row"><div class="burn"><span>Expected spend this month</span><b>' + eur(burn) + "</b></div>" +
      '<button class="btn btn-primary btn-big" data-action="run">Run month ' + (g.month + 1) + "</button>" + release +
      '<button class="btn" data-action="leave">Leave project</button></div>';
  }

  function refreshDecisions() {
    var host = document.getElementById("decisions");
    if (host) { host.innerHTML = decisionsHtml(); bindRanges(); }
  }

  function bindRanges() {
    var r = document.getElementById("qa");
    if (!r) return;
    r.addEventListener("input", function () {
      E.setDecisions(state.game, { qa: Number(r.value) / 100 });
      var o = document.getElementById("qa-out");
      if (o) o.textContent = r.value + "%";
    });
    r.addEventListener("change", function () { saveCurrent(); });
  }

  function drawPlayCharts() {
    var g = state.game;
    var h = g.history;
    var xMax = Math.max(g.deadline, h.length - 1) + 1;
    var plan = [];
    for (var i = 0; i <= xMax; i++) plan.push(Math.min(100, (i / g.deadline) * 100));
    C.lineChart(document.getElementById("c-progress"), {
      xMax: xMax, yMin: 0, yMax: 100, yStep: 25, yFmt: function (v) { return v + "%"; }, height: 250, width: 420, deadline: g.deadline,
      series: [
        { values: plan, cls: "plan", dot: false, width: 1.6 },
        { values: h.map(function (r) { return r.reported * 100; }), cls: "reported", area: true }
      ],
      label: "Reported progress against plan"
    });
    var bplan = [];
    for (var j = 0; j <= xMax; j++) bplan.push(g.budget * Math.min(1, j / g.deadline));
    C.lineChart(document.getElementById("c-spend"), {
      xMax: xMax, yMin: 0, height: 250, width: 420, deadline: g.deadline,
      yMax: Math.max(g.budget, g.cost) * 1.1,
      yFmt: function (v) { return v >= 1000 ? "€" + (v / 1000).toFixed(1) + "M" : "€" + Math.round(v) + "k"; },
      series: [
        { values: bplan, cls: "budget", dot: false, width: 1.6 },
        { values: h.map(function (r) { return r.cost; }), cls: "cost" }
      ],
      label: "Spend against budget plan"
    });
  }

  function runMonth() {
    var g = state.game;
    if (g.pendingChoice || g.finished) return;
    E.runMonth(g);
    if (g.finished) {
      store("dd.current", null);
      go("debrief");
      return;
    }
    saveCurrent();
    render();
    toast("Month " + g.month + " complete");
  }

  /* ---------- Dialogs ---------- */

  function dialogHtml() {
    var g = state.game;
    if (state.view === "play" && g && g.pendingChoice) return changeDialog();
    if (state.dialog === "release") return releaseDialog();
    return "";
  }

  function changeDialog() {
    var g = state.game, s = scenario();
    var ev = s.events[g.pendingChoice.idx];
    var ext = ev.extension + (ev.extension === 1 ? " month" : " months");
    var opts = [
      ["accept", "+" + ev.tasks + " " + s.unit + " and +" + eur(ev.budgetAdd) + " budget. The deadline stays where it is. The client is delighted."],
      ["negotiate", "+" + ev.tasks + " " + s.unit + ", +" + eur(ev.budgetAdd) + " budget, and the deadline moves " + ext + " later. The client agrees, a little grudgingly."],
      ["defer", "Nothing changes in this project. The client is disappointed."],
      ["reject", "Nothing changes. The client is unhappy and will remember it."]
    ];
    return '<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
      '<span class="chip warn">Change request &middot; month ' + g.pendingChoice.month + "</span>" +
      '<h2 id="dlg-title">' + esc(ev.title.replace(/^Change request: /, "")) + "</h2><p>" + esc(ev.text) + "</p>" +
      '<div class="options">' + opts.map(function (o) {
        return '<button class="option" type="button" data-action="respond" data-v="' + o[0] + '"><b>' + esc(E.RESPONSES[o[0]].label) + "</b><span>" + esc(o[1]) + "</span></button>";
      }).join("") + "</div></div></div>";
  }

  function releaseDialog() {
    var g = state.game, s = scenario();
    var last = g.history[g.history.length - 1];
    return '<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rel-title">' +
      '<span class="chip bad">Early release</span><h2 id="rel-title">Ship it now?</h2>' +
      "<p>Reports say " + pct(last.reported) + " of the " + esc(s.unit) + " are done. Anything still unfinished or quietly flawed goes to " + esc(s.client) + " as it is. The project ends here.</p>" +
      '<div class="actions" style="margin-top:18px"><button class="btn btn-primary" data-action="release-yes">Release now</button><button class="btn" data-action="release-no">Keep working</button></div>' +
      "</div></div>";
  }

  /* ---------- Debrief ---------- */

  function viewDebrief() {
    var g = state.game, s = scenario();
    var sc = E.scores(g);
    var ins = E.insights(g);
    var isNewBest = recordBest(s.id, sc.overall);
    var outcome = g.outcome === "complete" ? "Delivered in month " + g.finishMonth + ", deadline month " + g.deadline :
      g.outcome === "released" ? "Released early in month " + g.finishMonth + ", deadline month " + g.deadline :
      "Cancelled by the sponsor in month " + g.finishMonth;
    var C2 = 2 * Math.PI * 80;
    var ring = '<div class="score-ring"><svg viewBox="0 0 190 190" aria-hidden="true"><circle class="track" cx="95" cy="95" r="80" fill="none" stroke-width="14"></circle>' +
      '<circle class="val" cx="95" cy="95" r="80" fill="none" stroke-width="14" stroke-dasharray="' + (C2 * sc.overall / 100).toFixed(1) + " " + C2.toFixed(1) + '"></circle></svg>' +
      '<div class="center"><b>' + sc.overall + "</b><span>out of 100</span></div></div>";

    var bars = sc.parts.map(function (p) {
      var tone = p.value >= 75 ? "good" : p.value >= 45 ? "warn" : "bad";
      return '<div class="score-bar"><div class="k">' + p.label + '</div><div class="v">' + p.value + '</div><div class="bar-mini"><i class="' + tone + '" style="width:' + p.value + '%"></i></div><div class="s">' + esc(p.note) + "</div></div>";
    }).join("");

    var insHtml = ins.length ? ins.map(function (i) {
      var ico = i.tone === "warn" ? "!" : i.tone === "good" ? "+" : "i";
      return '<div class="insight ' + i.tone + '"><div class="ico">' + ico + "</div><div><h4>" + esc(i.title) + "</h4><p>" + esc(i.text) + "</p></div></div>";
    }).join("") : '<div class="insight info"><div class="ico">i</div><div><h4>A clean run</h4><p>No single pattern dominated this project. Try a harder scenario, or replay this one with a bolder strategy and compare.</p></div></div>';

    return '<section class="debrief-hero">' + ring +
      '<div><span class="eyebrow">' + esc(s.title) + " &middot; " + esc(outcome) + "</span>" +
      "<h1>" + esc(sc.rank.title) + "</h1><p>" + esc(sc.rank.text) + (isNewBest ? " This is your best score on this project so far." : "") + "</p>" +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-primary" data-action="replay">Play this project again</button><button class="btn" data-action="home">Try another project</button></div>' +
      "</div></section>" +
      '<div class="score-bars">' + bars + "</div>" +
      '<section class="section"><div class="section-head"><h2>What really happened</h2><p>During the game you only saw the reported figures. Here is the full picture.</p></div>' +
      '<div class="chart-grid">' +
      '<div class="chart-card" style="grid-column:1/-1"><div class="chart-card-head"><h3>Reported versus truly finished</h3><div class="legend"><span><i style="background:var(--accent)"></i>Reported</span><span><i style="background:var(--truth)"></i>Truly finished</span><span><i class="dash"></i>Plan</span></div></div>' +
      '<p class="chart-note">The shaded band is undiscovered rework: work that was counted as done but was flawed.</p><div class="chart" id="d-progress"></div></div>' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Rework found each month</h3></div><p class="chart-note">' + esc(s.unit.charAt(0).toUpperCase() + s.unit.slice(1)) + " sent back after flaws came to light.</p><div class=\"chart\" id=\"d-rework\"></div></div>" +
      '<div class="chart-card"><div class="chart-card-head"><h3>Spend</h3><div class="legend"><span><i style="background:var(--ink)"></i>Spent</span><span><i class="dash"></i>Budget plan</span></div></div><p class="chart-note">Cumulative cost against the budget, spread evenly to the deadline.</p><div class="chart" id="d-spend"></div></div>' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Team size</h3></div><p class="chart-note">Experienced and new staff together.</p><div class="chart" id="d-staff"></div></div>' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Team fatigue</h3></div><p class="chart-note">Builds with sustained overtime, recovers with normal hours.</p><div class="chart" id="d-fatigue"></div></div>' +
      "</div></section>" +
      '<section class="section"><div class="section-head"><h2>Your debrief</h2><p>The patterns that shaped this result, drawn from your own decisions.</p></div><div class="insights">' + insHtml + "</div></section>" +
      '<section class="section"><div class="section-head"><h2>Share your result</h2><p>Challenge your network. The score card and text below are ready for a LinkedIn post.</p></div>' +
      '<div class="share"><canvas id="scorecard" width="1200" height="630" aria-label="Score card image"></canvas>' +
      '<div style="display:grid;gap:10px"><label for="post" class="lbl" style="font-weight:600">Post text</label><textarea id="post">' + esc(postText(sc)) + "</textarea>" +
      '<div class="actions"><button class="btn btn-primary" data-action="copy-post">Copy post text</button>' +
      (window.self === window.top ? '<button class="btn" data-action="save-card">Save score card image</button>' : "") +
      '</div><div class="status-line" id="copy-status" role="status"></div>' +
      (window.self === window.top ? "" : '<p class="hint">To post the score card image, take a screenshot of it, or open the game from its own web address where the Save button is available.</p>') +
      "</div></div></section>";
  }

  function postText(sc) {
    var g = state.game, s = scenario();
    var line = g.outcome === "complete" ? "delivered in month " + g.finishMonth + " against a month " + g.deadline + " deadline" :
      g.outcome === "released" ? "released early in month " + g.finishMonth : "cancelled by the sponsor in month " + g.finishMonth;
    return "I just ran the " + s.title + " project in Deadline Dynamics, a project management simulator built on system dynamics research.\n\n" +
      "Score: " + sc.overall + "/100 (" + sc.rank.title + "). The project was " + line + ", " +
      (sc.overPct > 0 ? Math.round(sc.overPct) + "% over budget" : "within budget") + ", with " + Math.round(sc.fpy * 100) + "% of work right the first time.\n\n" +
      "The lesson that stayed with me: status reports count work that only looks finished. Can you beat my score?\n\n" +
      shareUrl() + "\n\n#ProjectManagement #SystemsThinking #Leadership";
  }

  function drawDebriefCharts() {
    var g = state.game;
    var h = g.history;
    var xMax = Math.max(g.deadline, h.length - 1);
    var rep = h.map(function (r) { return r.reported * 100; });
    var tru = h.map(function (r) { return r.truth * 100; });
    var plan = [];
    for (var i = 0; i <= xMax; i++) plan.push(Math.min(100, (i / g.deadline) * 100));
    var gi = 0;
    h.forEach(function (r, i) { if (r.reported - r.truth > h[gi].reported - h[gi].truth) gi = i; });
    var ann = [];
    if (h[gi].reported - h[gi].truth > 0.05) {
      ann.push({ x: gi, y: rep[gi], text: "Report " + Math.round(rep[gi]) + "%", cls: "reported", dy: -10, anchor: "end" });
      ann.push({ x: gi, y: tru[gi], text: "Truth " + Math.round(tru[gi]) + "%", cls: "truth", dy: 18, dx: 6 });
    }
    C.lineChart(document.getElementById("d-progress"), {
      xMax: xMax, yMin: 0, yMax: 100, yStep: 25, yFmt: function (v) { return v + "%"; }, height: 300, width: 900, deadline: g.deadline,
      gap: { a: rep, b: tru },
      series: [
        { values: plan, cls: "plan", dot: false, width: 1.6 },
        { values: tru, cls: "truth" },
        { values: rep, cls: "reported" }
      ],
      annotations: ann,
      label: "Reported progress against truly finished work"
    });
    C.barChart(document.getElementById("d-rework"), { values: h.slice(1).map(function (r) { return r.found; }), height: 250, width: 420, label: "Rework found per month" });
    var bplan = [];
    for (var j = 0; j <= xMax; j++) bplan.push(g.budget * Math.min(1, j / g.deadline));
    C.lineChart(document.getElementById("d-spend"), {
      xMax: xMax, yMin: 0, height: 250, width: 420, deadline: g.deadline, yMax: Math.max(g.budget, g.cost) * 1.1,
      yFmt: function (v) { return v >= 1000 ? "€" + (v / 1000).toFixed(1) + "M" : "€" + Math.round(v) + "k"; },
      series: [{ values: bplan, cls: "budget", dot: false, width: 1.6 }, { values: h.map(function (r) { return r.cost; }), cls: "cost" }],
      label: "Spend against budget"
    });
    C.lineChart(document.getElementById("d-staff"), {
      xMax: xMax, yMin: 0, height: 250, width: 420, deadline: g.deadline,
      series: [{ values: h.map(function (r) { return r.staff; }), cls: "staff", area: true }],
      label: "Team size"
    });
    C.lineChart(document.getElementById("d-fatigue"), {
      xMax: xMax, yMin: 0, yMax: 100, yStep: 25, height: 250, width: 420, deadline: g.deadline, yFmt: function (v) { return v + "%"; },
      series: [{ values: h.map(function (r) { return r.fatigue * 100; }), cls: "fatigue", area: true }],
      label: "Team fatigue"
    });
  }

  function drawScoreCard() {
    var cv = document.getElementById("scorecard");
    if (!cv) return;
    var paint = function () {
      var g = state.game, s = scenario(), sc = E.scores(g);
      var x = cv.getContext("2d");
      var W = 1200, H = 630;
      x.fillStyle = "#0f1a24"; x.fillRect(0, 0, W, H);
      x.strokeStyle = "rgba(255,255,255,0.05)"; x.lineWidth = 1;
      for (var gx = 0; gx < W; gx += 48) { x.beginPath(); x.moveTo(gx + 0.5, 0); x.lineTo(gx + 0.5, H); x.stroke(); }
      for (var gy = 0; gy < H; gy += 48) { x.beginPath(); x.moveTo(0, gy + 0.5); x.lineTo(W, gy + 0.5); x.stroke(); }
      x.fillStyle = "#7096ff"; x.fillRect(0, 0, 12, H);

      x.fillStyle = "#e4eaed";
      x.font = "800 34px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      x.fillText("DEADLINE", 70, 86);
      var w1 = x.measureText("DEADLINE").width;
      x.fillStyle = "#7096ff"; x.fillText("/", 70 + w1 + 4, 86);
      x.fillStyle = "#e4eaed"; x.fillText("DYNAMICS", 70 + w1 + 22, 86);

      x.fillStyle = "#94a3ad"; x.font = "500 24px 'IBM Plex Mono', monospace";
      x.fillText((s.sector + " / " + s.title).toUpperCase(), 70, 150);

      x.fillStyle = "#ffffff"; x.font = "700 210px 'IBM Plex Mono', monospace";
      x.fillText(String(sc.overall), 62, 360);
      var sw = x.measureText(String(sc.overall)).width;
      x.fillStyle = "#94a3ad"; x.font = "500 40px 'IBM Plex Mono', monospace";
      x.fillText("/100", 70 + sw, 360);

      x.fillStyle = "#7096ff"; x.font = "700 64px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      x.fillText(sc.rank.title.toUpperCase(), 70, 440);

      var bx = 690, by = 140;
      sc.parts.forEach(function (p, i) {
        var y = by + i * 74;
        x.fillStyle = "#94a3ad"; x.font = "500 22px 'IBM Plex Sans', sans-serif";
        x.fillText(p.label.toUpperCase(), bx, y);
        x.fillStyle = "#e4eaed"; x.font = "600 26px 'IBM Plex Mono', monospace";
        x.textAlign = "right"; x.fillText(String(p.value), bx + 440, y); x.textAlign = "left";
        x.fillStyle = "rgba(255,255,255,0.1)"; x.fillRect(bx, y + 14, 440, 10);
        x.fillStyle = p.value >= 75 ? "#3fbf7f" : p.value >= 45 ? "#e5a23a" : "#f07067";
        x.fillRect(bx, y + 14, 440 * p.value / 100, 10);
      });

      x.fillStyle = "rgba(255,255,255,0.12)"; x.fillRect(70, 520, W - 140, 1);
      x.fillStyle = "#e4eaed"; x.font = "600 28px 'IBM Plex Sans', sans-serif";
      x.fillText("Can you beat it?", 70, 572);
      x.fillStyle = "#94a3ad"; x.font = "500 22px 'IBM Plex Mono', monospace";
      x.textAlign = "right"; x.fillText("A simulator by Dr. Rajan Kumar V K", W - 70, 572); x.textAlign = "left";
    };
    paint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
  }

  /* ---------- Method ---------- */

  function viewMethod() {
    return '<section class="method"><div class="prose">' +
      '<span class="eyebrow">Method</span><h1>How the model works</h1>' +
      "<p>Deadline Dynamics runs a system dynamics model of a project. Every week of simulated time it moves work between a few stocks: work still to do, work done correctly, and work that looks done but is flawed. That last stock is the heart of the model. It is invisible on any status report, and it is why projects so often sit at 90% for months.</p>" +
      "<h2>The rework cycle</h2>" +
      "<p>When the team completes a piece of work, a share of it contains errors. Some errors are caught right away by reviews and testing. The rest slip through and are counted as finished. Weeks or months later they surface, usually when later work depends on them, and go back on the to-do list. If phases overlap, the work built on top of a flaw often has to be redone too. This loop was first described from shipbuilding disputes (Cooper, 1980) and has since been studied across software, construction and product development (Lyneis &amp; Ford, 2007).</p>" +
      "<h2>What drives errors and speed</h2>" +
      "<ul>" +
      "<li><b>Fatigue.</b> Overtime adds hours at once, but fatigue builds over several weeks. Tired people work slower and make more mistakes, and some resign. Short bursts help; long crunches hurt.</li>" +
      "<li><b>Experience.</b> New hires arrive after a recruitment delay, work at reduced speed while they learn, make more errors, and take time from experienced colleagues who coach them. Hiring late can make a late project later (Brooks, 1975; Abdel-Hamid &amp; Madnick, 1991).</li>" +
      "<li><b>Team size.</b> Bigger teams spend more of their time coordinating.</li>" +
      "<li><b>Reviews and testing.</b> Effort spent checking work slows building, but it catches errors at the source and brings hidden flaws to light sooner, when they are cheaper to fix.</li>" +
      "<li><b>Phase overlap.</b> Starting downstream work before upstream work is settled saves time but spreads flaws into more of the project (Ford &amp; Sterman, 1998).</li>" +
      "</ul>" +
      "<h2>How you are scored</h2>" +
      "<p>Five scores out of 100 are combined into one: schedule (30%), budget (20%), quality (20%), stakeholder satisfaction (15%) and team health (15%). Quality reflects how much work was right the first time and how many flaws reached the client. Stakeholders react to your answers to change requests, to how reported progress tracks the plan, and to the delivery date. Team health reflects fatigue, resignations and layoffs.</p>" +
      "<p>The model is deterministic: the same decisions always give the same result, so you can replay a project and compare strategies fairly.</p>" +
      "<h2>A note on realism</h2>" +
      "<p>This is a teaching model. Its parameters are illustrative and chosen so that the dynamics reported in the research appear clearly. They are not calibrated to any particular organisation, and the scenarios are fictional.</p>" +
      '<h2>References</h2><div class="refs">' +
      "<p>Abdel-Hamid, T. K., &amp; Madnick, S. E. (1991). <i>Software project dynamics: An integrated approach</i>. Prentice Hall.</p>" +
      "<p>Brooks, F. P. (1975). <i>The mythical man-month: Essays on software engineering</i>. Addison-Wesley.</p>" +
      "<p>Cooper, K. G. (1980). Naval ship production: A claim settled and a framework built. <i>Interfaces, 10</i>(6), 20&ndash;36. https://doi.org/10.1287/inte.10.6.20</p>" +
      "<p>Ford, D. N., &amp; Sterman, J. D. (1998). Dynamic modeling of product development processes. <i>System Dynamics Review, 14</i>(1), 31&ndash;68.</p>" +
      "<p>Lyneis, J. M., &amp; Ford, D. N. (2007). System dynamics applied to project management: A survey, assessment, and directions for future research. <i>System Dynamics Review, 23</i>(2&ndash;3), 157&ndash;189. https://doi.org/10.1002/sdr.377</p>" +
      "<p>Sterman, J. D. (2000). <i>Business dynamics: Systems thinking and modeling for a complex world</i>. Irwin/McGraw-Hill.</p>" +
      "</div></div>" +
      '<aside style="display:grid;gap:16px;position:sticky;top:84px">' +
      '<div class="panel loop-card"><h3>The core loop</h3>' + loopSvg() + '<p class="hint" style="margin-top:8px">More schedule pressure leads to more overtime, more fatigue and more errors. The errors return later as rework, which adds to the pressure. A reinforcing loop.</p></div>' +
      '<div class="panel"><h3>About</h3><p style="font-size:0.94rem">Designed and built by Dr. Rajan Kumar V K, D.Sc. in Industrial Engineering and Management (LUT University). His work covers performance management, digital transformation and sustainability in industry.</p>' +
      '<div class="actions" style="margin-top:14px"><button class="btn btn-primary" data-action="home">Play a project</button></div></div>' +
      "</aside></section>";
  }

  function loopSvg() {
    var nodes = [
      { x: 150, y: 30, t: "Schedule pressure" },
      { x: 262, y: 100, t: "Overtime" },
      { x: 240, y: 205, t: "Fatigue" },
      { x: 150, y: 255, t: "Errors" },
      { x: 52, y: 205, t: "Hidden rework" },
      { x: 38, y: 100, t: "Work to do" }
    ];
    var s = '<svg viewBox="-20 0 340 290" role="img" aria-label="Reinforcing loop: schedule pressure, overtime, fatigue, errors, hidden rework, work to do, back to schedule pressure">' +
      '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="currentColor" style="color:var(--muted)"></path></marker></defs>';
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i], b = nodes[(i + 1) % nodes.length];
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var cx = mx + (mx - 150) * 0.25, cy = my + (my - 145) * 0.25;
      var sx = a.x + (b.x - a.x) * 0.22, sy = a.y + (b.y - a.y) * 0.22;
      var ex = a.x + (b.x - a.x) * 0.78, ey = a.y + (b.y - a.y) * 0.78;
      s += '<path class="arrow" d="M' + sx + "," + sy + "Q" + cx + "," + cy + " " + ex + "," + ey + '" marker-end="url(#ah)"></path>';
      s += '<text class="pol" x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle">+</text>';
    }
    nodes.forEach(function (n) {
      var w = n.t.length * 6.6 + 18;
      s += '<rect class="node" x="' + (n.x - w / 2) + '" y="' + (n.y - 13) + '" width="' + w + '" height="26" rx="13"></rect>';
      s += '<text x="' + n.x + '" y="' + (n.y + 4) + '" text-anchor="middle">' + n.t + "</text>";
    });
    s += '<text class="loopname" x="150" y="150" text-anchor="middle">R</text><text class="loopname" x="150" y="166" text-anchor="middle">rework spiral</text></svg>';
    return s;
  }

  /* ---------- Actions ---------- */

  function startGame(id) {
    state.scenarioId = id;
    state.game = E.newGame(id);
    saveCurrent();
    go("play");
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-action]");
    if (!t) return;
    var a = t.getAttribute("data-action");
    var v = t.getAttribute("data-v");
    var g = state.game;
    switch (a) {
      case "home": go("home"); break;
      case "method": go("method"); break;
      case "scroll-scenarios":
        var sEl = document.getElementById("scenarios");
        if (sEl) sEl.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      case "pick": state.scenarioId = t.getAttribute("data-id"); go("brief"); break;
      case "start": startGame(state.scenarioId); break;
      case "resume":
        var saved = store("dd.current");
        if (saved && saved.game) { state.scenarioId = saved.scenarioId; state.game = saved.game; go("play"); }
        break;
      case "discard": store("dd.current", null); render(); break;
      case "hire":
        var heads = Math.round(g.exp + g.rook);
        var nv = Math.max(-Math.min(4, heads - 2), Math.min(8, g.decisions.hire + Number(v)));
        E.setDecisions(g, { hire: nv }); refreshDecisions(); saveCurrent();
        break;
      case "ot": E.setDecisions(g, { overtime: Number(v) }); refreshDecisions(); saveCurrent(); break;
      case "overlap": E.setDecisions(g, { overlap: v }); refreshDecisions(); saveCurrent(); break;
      case "run": runMonth(); break;
      case "respond":
        E.respond(g, v); saveCurrent(); render();
        toast("Answer sent to the client");
        break;
      case "release-ask": state.dialog = "release"; render(); break;
      case "release-no": state.dialog = null; render(); break;
      case "release-yes": E.release(g); store("dd.current", null); go("debrief"); break;
      case "leave": store("dd.current", null); state.game = null; go("home"); break;
      case "replay": startGame(state.scenarioId); break;
      case "copy-post": copyPost(); break;
      case "save-card": saveCard(); break;
    }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && state.dialog === "release") { state.dialog = null; render(); }
  });

  function copyPost() {
    var ta = document.getElementById("post");
    var status = document.getElementById("copy-status");
    var text = ta ? ta.value : "";
    var done = function () { if (status) status.textContent = "Copied. Paste it into a new LinkedIn post."; };
    var fail = function () {
      if (ta) { ta.focus(); ta.select(); }
      if (status) status.textContent = "Your browser blocked copying. The text is selected: press Ctrl+C (or Cmd+C).";
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
      else fail();
    } catch (e) { fail(); }
  }

  function saveCard() {
    var cv = document.getElementById("scorecard");
    if (!cv) return;
    try {
      cv.toBlob(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "deadline-dynamics-score.png";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      });
    } catch (e) {
      var status = document.getElementById("copy-status");
      if (status) status.textContent = "Saving is blocked here. Take a screenshot of the score card instead.";
    }
  }

  /* ---------- Boot ---------- */

  function start(data) {
    if (data && data.view) {
      state.view = data.view;
      state.scenarioId = data.scenarioId || null;
      state.game = data.game || null;
      if ((state.view === "play" || state.view === "debrief") && !state.game) state.view = "home";
      if (state.view === "brief" && !state.scenarioId) state.view = "home";
    }
    render();
  }

  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    window.claude.hot.snapshot(function () { return { view: state.view, scenarioId: state.scenarioId, game: state.game }; });
  }
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
  else start((window.claude && window.claude.hot && window.claude.hot.data) || {});
})();
