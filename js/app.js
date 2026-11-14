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

  var state = { view: "home", scenarioId: null, game: null, dialog: null, tour: null, selected: null, gameKey: 0 };

  /* ---------- Help texts ---------- */

  var HELP = {
    objectives: "Your three goals for this project. Each one you achieve earns a star. Green means on track, amber means at risk, red means already missed.",
    progress: "The share of the work your team reports as finished. It also counts work that looks done but contains hidden flaws, so it is usually more optimistic than the truth. The marker shows where the plan says you should be.",
    spent: "Money spent so far against the total budget. The marker shows the spend the plan expects by now. Salaries, overtime premiums, recruitment, severance and contractors all count.",
    team: "Everyone working on the project. Experienced people work at full speed. New hires work at about 40% while they learn, need coaching from experienced colleagues, and make more mistakes for about three months.",
    energy: "How rested the team is. Overtime drains energy over several weeks; normal hours restore it. Tired people work slower, make more mistakes and are more likely to resign. Below 50% counts as burnout.",
    defects: "Work that was counted as done last month but turned out to be flawed and went back on the to-do list. A rising number means hidden problems from earlier months are surfacing.",
    forecast: "What your team lead would say if asked when the project will finish. It extends the recent pace of reported progress, so it misses the hidden rework still to come.",
    floor: "Your team at their desks. Body colour shows experience: blue for experienced, green for new hires, amber for contractors. The ring at each person's feet shows energy: green is fresh, amber tired, red exhausted. Red crates stack up for rework that came back last month. The wall board shows reported progress. Drag to turn the view; click a person for details.",
    hire: "Add people (+) or release people (-). New hires arrive next month and need about three months to reach full speed. Each hire costs about €6k to recruit; each release costs about €10k in severance.",
    overtime: "Extra working hours for the whole team. Output rises at once, but fatigue builds over a few weeks and brings more errors and resignations. Overtime also costs a 25% premium.",
    qa: "The share of effort spent reviewing and testing work. It slows building a little, but catches many errors at the source, while they are cheap to fix, and makes hidden flaws surface sooner.",
    overlap: "How far later phases start before earlier ones are settled. More overlap is faster, but when an early flaw is found, more of the later work built on top of it must be redone."
  };

  function help(key, label) {
    return '<button type="button" class="help" data-help="' + key + '" aria-label="' + esc(label || "What is this?") + '">?</button>';
  }

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

  function recordBest(id, score, stars) {
    var b = bestScores();
    var prev = b[id];
    var prevScore = typeof prev === "number" ? prev : prev ? prev.score : 0;
    if (!prev || score > prevScore) { b[id] = { score: score, stars: stars }; store("dd.best", b); return true; }
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
  function starsHtml(n, total) {
    var s = "";
    for (var i = 0; i < (total || 3); i++) s += '<span class="star' + (i < n ? " on" : "") + '" aria-hidden="true">★</span>';
    return '<span class="stars" role="img" aria-label="' + n + " of " + (total || 3) + ' stars">' + s + "</span>";
  }
  function plural(n, one, many) { return n === 1 ? one : many; }

  /* ---------- Navigation ---------- */

  function go(view) {
    state.view = view;
    state.dialog = null;
    state.tour = null;
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
    hideTip();
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
    if (state.view === "play") { drawPlayCharts(); bindRanges(); mountFloor(); }
    if (state.view === "debrief") { drawDebriefCharts(); drawScoreCard(); }
    if (state.tour != null) placeTour();
    var first = app.querySelector(".dialog [data-autofocus], .tour [data-autofocus], .dialog .option, .dialog .btn-primary");
    if (first) first.focus({ preventScroll: true });
  }

  function toast(text) {
    var t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2300);
  }

  /* ---------- Help tooltip ---------- */

  var tipEl = null, tipFor = null;
  function showTip(btn) {
    var key = btn.getAttribute("data-help");
    if (!HELP[key]) return;
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "tooltip";
      tipEl.id = "dd-tooltip";
      tipEl.setAttribute("role", "tooltip");
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = HELP[key];
    tipEl.style.display = "block";
    btn.setAttribute("aria-describedby", "dd-tooltip");
    var r = btn.getBoundingClientRect();
    var w = Math.min(320, window.innerWidth - 24);
    tipEl.style.width = w + "px";
    var left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    var top = r.bottom + 8;
    tipEl.style.left = left + "px";
    tipEl.style.top = top + "px";
    var th = tipEl.offsetHeight;
    if (top + th > window.innerHeight - 8) tipEl.style.top = Math.max(8, r.top - th - 8) + "px";
    tipFor = btn;
  }
  function hideTip() {
    if (tipEl) tipEl.style.display = "none";
    if (tipFor) tipFor.removeAttribute("aria-describedby");
    tipFor = null;
  }
  document.addEventListener("mouseover", function (ev) { var b = ev.target.closest && ev.target.closest(".help"); if (b) showTip(b); });
  document.addEventListener("mouseout", function (ev) { var b = ev.target.closest && ev.target.closest(".help"); if (b && tipFor === b) hideTip(); });
  document.addEventListener("focusin", function (ev) { var b = ev.target.closest && ev.target.closest(".help"); if (b) showTip(b); });
  document.addEventListener("focusout", function (ev) { var b = ev.target.closest && ev.target.closest(".help"); if (b) hideTip(); });
  window.addEventListener("scroll", function () { hideTip(); if (state.tour != null) placeTour(); }, { passive: true });
  window.addEventListener("resize", function () { if (state.tour != null) placeTour(); });

  /* ---------- Home ---------- */

  function viewHome() {
    var best = bestScores();
    var saved = store("dd.current");
    var resume = "";
    if (saved && saved.game && !saved.game.finished && saved.game.team) {
      var ss = E.findScenario(saved.scenarioId);
      if (ss) {
        resume = '<div class="resume"><div><span class="eyebrow">Unfinished project</span><br><b>' + esc(ss.title) +
          "</b>, month " + saved.game.month + " of " + saved.game.deadline + '</div><div class="actions"><button class="btn btn-primary" data-action="resume">Resume</button><button class="btn" data-action="discard">Discard</button></div></div>';
      }
    }

    var cards = SCENARIOS.map(function (s) {
      var b = best[s.id];
      var bScore = typeof b === "number" ? b : b ? b.score : null;
      var bStars = b && typeof b === "object" ? b.stars : null;
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
        '<span class="best">' + (bScore != null ? "Your best: <strong>" + bScore + "/100</strong> " + (bStars != null ? starsHtml(bStars) : "") : "Not played yet") + "</span>" +
        "</button>";
    }).join("");

    return '<section class="hero">' +
      "<div>" +
      '<span class="eyebrow">Project management simulator &middot; system dynamics</span>' +
      "<h1>Ninety percent done.<em>Again.</em></h1>" +
      '<p class="hero-lede">You are the project manager. Lead a team of named people through a real project, month by month: hire, set overtime and testing, answer the client, look after your people. Your status reports will look fine for a while. <strong>The rework nobody can see yet is what decides how it ends.</strong></p>' +
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
      '<div class="section-head"><h2>Choose your project</h2><p>Four projects in four industries. Each one is fictional, and each one is built to go wrong in its own way. First time here? Start with the mobile banking app and take the guided tour.</p></div>' +
      '<div class="scenario-grid">' + cards + "</div>" +
      "</section>" +
      '<section class="section">' +
      '<div class="section-head"><h2>How a month works</h2><p>A game takes 15 to 20 minutes. Each month follows the same rhythm.</p></div>' +
      '<div class="steps steps-4">' +
      '<div class="step"><h3>Face a decision</h3><p>Most months bring a situation to handle: a demo request, a tired colleague, a change request, a status meeting. Pick your response.</p></div>' +
      '<div class="step"><h3>Read the dashboard</h3><p>Progress, spend, team energy, defects coming back, and your team in the 3D office. Reported progress counts work that only looks finished.</p></div>' +
      '<div class="step"><h3>Set your levers</h3><p>Hiring, overtime, reviews and testing, and phase overlap. Then run the month.</p></div>' +
      '<div class="step"><h3>Read the report</h3><p>A month report shows what your choices did and gives a coaching tip. At the end, a full debrief reveals the truth.</p></div>' +
      "</div></section>";
  }

  function drawHeroChart() {
    var host = document.getElementById("hero-chart");
    if (!host) return;
    var g = E.newGame("software");
    var guard = 0;
    while (!g.finished && g.month < 16 && guard++ < 60) {
      if (g.card) { E.respond(g, g.card.type === "change" ? "accept" : "0"); continue; }
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
      '<p class="brief-text"><b>Your role:</b> you are the project manager. ' + esc(s.brief) + "</p>" +
      '<div class="panel" style="margin-top:18px"><h3>Your three goals</h3><ul class="goal-list">' +
      "<li>" + starsHtml(1, 1) + " Deliver all " + n0(s.scope) + " " + esc(s.unit) + " by <b>month " + s.deadline + "</b></li>" +
      "<li>" + starsHtml(1, 1) + " Stay within the budget of <b>" + eur(s.budget) + "</b></li>" +
      "<li>" + starsHtml(1, 1) + " Keep your people healthy: <b>no burnout</b>, energy above 50%</li>" +
      '</ul><p class="hint" style="margin-top:8px">You also get an overall score out of 100 for schedule, budget, quality, stakeholders and team health.</p></div>' +
      '<p class="tip">Plan check: this scope needs about <b>' + requiredTeam(s) + " people</b> working at full speed. You start with " + (s.experienced + s.rookies) + ", of whom " + s.rookies + " are new.</p>" +
      '<div class="actions" style="margin-top:22px">' +
      '<button class="btn btn-primary btn-big" data-action="start" data-tour="1">Start with the guided tour</button>' +
      '<button class="btn btn-big" data-action="start" data-tour="0">Start without the tour</button>' +
      '<button class="btn btn-big" data-action="home">Back</button></div>' +
      "</div>" +
      '<div style="display:grid;gap:16px">' +
      '<div class="panel"><h2>Starting position</h2><div class="targets">' +
      '<div class="target"><div class="k">Scope</div><div class="v">' + n0(s.scope) + '</div><div class="s">' + esc(s.unit) + "</div></div>" +
      '<div class="target"><div class="k">Deadline</div><div class="v">' + s.deadline + '</div><div class="s">months</div></div>' +
      '<div class="target"><div class="k">Budget</div><div class="v">' + eur(s.budget) + '</div><div class="s">' + eur(s.costPerFte) + " per person per month</div></div>" +
      '<div class="target"><div class="k">Team</div><div class="v">' + s.experienced + " + " + s.rookies + '</div><div class="s">experienced + new</div></div>' +
      "</div></div>" +
      '<div class="panel"><h3>What you control</h3><ul class="lever-list">' +
      "<li><b>Decisions</b><span>Most months bring a situation to handle. Your answer has real effects.</span></li>" +
      "<li><b>Hiring</b><span>Recruits arrive a month later and need about three months to reach full speed.</span></li>" +
      "<li><b>Overtime</b><span>More hours now. Fatigue builds over weeks and brings mistakes and resignations.</span></li>" +
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

  function objectivesStrip(g, id) {
    var obj = E.objectives(g);
    var icon = { ok: "✓", risk: "!", fail: "✕", done: "★" };
    var word = { ok: "On track", risk: "At risk", fail: "Missed", done: "Achieved" };
    return '<div class="objectives"' + (id ? ' id="' + id + '"' : "") + '><span class="obj-title">Goals ' + help("objectives", "About your goals") + "</span>" +
      obj.map(function (o) {
        return '<span class="obj ' + o.status + '"><b aria-hidden="true">' + icon[o.status] + "</b>" + esc(o.label) + '<span class="sr">: ' + word[o.status] + "</span></span>";
      }).join("") + "</div>";
  }

  function viewPlay() {
    var g = state.game, s = scenario();
    var h = g.history, last = h[h.length - 1], prev = h.length > 1 ? h[h.length - 2] : null;
    var m = g.month;
    var planned = Math.min(1, m / g.deadline);
    var behind = planned - last.reported;
    var progChip = m === 0 ? '<span class="chip">Start</span>' : behind > 0.12 ? '<span class="chip bad">Behind</span>' : behind > 0.04 ? '<span class="chip warn">Slipping</span>' : '<span class="chip good">On plan</span>';
    var spendPlan = g.budget * Math.min(1, m / g.deadline);
    var spendChip = m === 0 ? "" : g.cost > g.budget ? '<span class="chip bad">Over</span>' : g.cost > spendPlan * 1.06 ? '<span class="chip warn">High</span>' : '<span class="chip good">OK</span>';
    var energy = 1 - g.fatigue;
    var energyChip = energy > 0.75 ? '<span class="chip good">Fresh</span>' : energy > 0.5 ? '<span class="chip warn">Tired</span>' : '<span class="chip bad">Exhausted</span>';
    var fc = E.naiveForecast(g);
    var arriving = g.team.filter(function (p) { return p.status === "arriving"; }).length;
    var onLeave = g.team.filter(function (p) { return p.status === "leave"; }).length;
    var foundTrend = prev && last.found > prev.found * 1.15 ? "rising" : prev && last.found < prev.found * 0.85 ? "falling" : "steady";

    var dlMonths = Math.max(g.deadline, m + 1);
    var monthMeter = '<div class="month-meter"><div class="row"><span>Month <b>' + m + "</b> completed</span><span>Deadline <b>month " + g.deadline + "</b></span></div>" +
      '<div class="timeline"><div class="fill" style="width:' + Math.min(100, (m / dlMonths) * 100) + '%"></div>' +
      (m > g.deadline ? '<div class="late" style="left:' + (g.deadline / dlMonths) * 100 + "%;width:" + ((m - g.deadline) / dlMonths) * 100 + '%"></div>' : "") +
      '<div class="dl" style="left:calc(' + (g.deadline / dlMonths) * 100 + '% - 1px)"></div></div></div>';

    var kpis = '<div class="kpis">' +
      kpi("kpi-progress", "Reported progress", "progress", progChip, pct(last.reported), "Plan: " + pct(planned), '<div class="bar-mini"><i style="width:' + last.reported * 100 + '%"></i><b style="left:' + planned * 100 + '%"></b></div>') +
      kpi("kpi-spent", "Spent", "spent", spendChip, eur(g.cost) + ' <small>/ ' + eur(g.budget) + "</small>", "Plan to date: " + eur(spendPlan), '<div class="bar-mini"><i style="width:' + Math.min(100, (g.cost / g.budget) * 100) + '%"></i><b style="left:' + Math.min(100, (spendPlan / g.budget) * 100) + '%"></b></div>') +
      kpi("kpi-team", "Team", "team", "", (g.exp + g.rook + g.contr) + " <small>working</small>", g.exp + " experienced, " + g.rook + " new" + (g.contr ? ", " + g.contr + " contractors" : "") + (arriving ? ", " + arriving + " arriving" : "") + (onLeave ? ", " + onLeave + " on leave" : ""), "") +
      kpi("kpi-energy", "Team energy", "energy", energyChip, pct(energy), m === 0 ? "Everyone is rested" : "Overtime last month: " + pct(last.overtime), "") +
      kpi("kpi-defects", "Defects found", "defects", m === 0 ? "" : '<span class="chip">' + foundTrend + "</span>", m === 0 ? "0" : n0(last.found), esc(s.unit) + " sent back for rework last month", "") +
      kpi("kpi-forecast", "Team lead's forecast", "forecast", "", fc ? "M" + Math.ceil(fc) : "&ndash;", fc ? "Based on reported pace" : "Too early to call", "") +
      "</div>";

    var teamCard = '<section class="chart-card team-card" id="team-card" aria-labelledby="team-h">' +
      '<div class="chart-card-head"><h3 id="team-h">Your team ' + help("floor", "About the team view") + "</h3>" +
      '<div class="legend"><span><i style="background:var(--accent)"></i>Experienced</span><span><i style="background:var(--truth)"></i>New</span><span><i style="background:var(--warn)"></i>Contractor</span><span class="ring-key"><i class="ring g"></i><i class="ring a"></i><i class="ring r"></i>Energy</span></div></div>' +
      '<div class="team-grid"><div class="floor-wrap" id="floor3d"></div>' +
      '<div class="roster" id="roster">' + rosterHtml() + "</div></div></section>";

    var charts = '<div class="chart-grid" style="margin-top:12px">' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Progress</h3><div class="legend"><span><i style="background:var(--accent)"></i>Reported</span><span><i class="dash"></i>Plan</span></div></div><div class="chart" id="c-progress"></div></div>' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Spend</h3><div class="legend"><span><i style="background:var(--ink)"></i>Spent</span><span><i class="dash"></i>Budget plan</span></div></div><div class="chart" id="c-spend"></div></div>' +
      "</div>";

    return '<section class="cockpit-head">' +
      '<div><span class="eyebrow">' + esc(s.sector) + " &middot; " + esc(s.client) + " &middot; You are the project manager</span><h1>" + esc(s.title) + "</h1></div>" +
      monthMeter +
      '<button class="btn btn-small" data-action="tour">Guided tour</button>' +
      "</section>" +
      objectivesStrip(g, "obj-strip") +
      '<div class="cockpit">' +
      "<div>" + kpis + teamCard + charts + '<h2 class="feed-h">Project log</h2><div class="feed" aria-live="polite">' + feedHtml() + "</div></div>" +
      '<aside class="decisions" id="decisions" aria-label="Settings for next month">' + decisionsHtml() + "</aside>" +
      "</div>" +
      '<div class="mobile-run"><a class="btn" href="#decisions" data-action="to-settings">Settings</a><button class="btn btn-primary" data-action="run">Run month ' + (m + 1) + "</button></div>";
  }

  function kpi(id, label, helpKey, chip, value, sub, extra) {
    return '<div class="kpi" id="' + id + '"><div class="k"><span>' + label + " " + help(helpKey, "About " + label.toLowerCase()) + "</span>" + (chip || "") + '</div><div class="v">' + value + '</div><div class="s">' + sub + "</div>" + (extra || "") + "</div>";
  }

  function personBadge(p) {
    if (p.status === "arriving") return '<span class="chip">Arriving</span>';
    if (p.status === "leave") return '<span class="chip warn">On leave</span>';
    if (p.kind === "contractor") return '<span class="chip warn">Contractor</span>';
    if (p.kind === "new") return '<span class="chip good">New</span>';
    return '<span class="chip accent">Experienced</span>';
  }

  function rosterHtml() {
    var g = state.game;
    var here = g.team.filter(function (p) { return p.status === "active" || p.status === "leave" || p.status === "arriving"; });
    var gone = g.team.filter(function (p) { return p.status === "left" || p.status === "released" || p.status === "ended"; });
    var sel = state.selected;
    var rows = here.map(function (p) {
      var e = p.status === "arriving" ? null : E.personEnergy(g, p);
      var tone = e == null ? "" : e > 0.75 ? "good" : e > 0.5 ? "warn" : "bad";
      return '<button type="button" role="listitem" class="person' + (sel === p.id ? " selected" : "") + '" data-action="person" data-id="' + p.id + '">' +
        '<span class="pname">' + esc(p.name) + '</span><span class="prole">' + esc(p.role) + "</span>" + personBadge(p) +
        '<span class="pbar" aria-label="Energy ' + (e == null ? "unknown" : pct(e)) + '"><i class="' + tone + '" style="width:' + (e == null ? 0 : e * 100) + '%"></i></span></button>';
    }).join("");
    var detail = "";
    var pSel = g.team.filter(function (p) { return p.id === sel; })[0];
    if (pSel) {
      var en = pSel.status === "arriving" ? null : E.personEnergy(g, pSel);
      var stat = { active: "Working", leave: "On leave", arriving: "Starts next month", left: pSel.reason, released: "Released", ended: "Contract ended" }[pSel.status];
      var exp = pSel.kind === "new" ? "Learning: " + Math.min(100, Math.round(pSel.weeks / E.P.assimilationWeeks * 100)) + "% up to speed" : pSel.kind === "contractor" ? "Experienced contractor" : "Fully experienced";
      detail = '<div class="pdetail"><b>' + esc(pSel.name) + "</b><span>" + esc(pSel.role) + " &middot; " + esc(stat) + "</span><span>" + esc(exp) + "</span>" +
        (en != null ? "<span>Energy " + pct(en) + "</span>" : "") + "<span>" + (pSel.joined ? "Joined in month " + pSel.joined : "On the team from the start") + "</span></div>";
    } else {
      detail = '<p class="hint pdetail-hint">Click a person in the list or in the 3D view to see their details.</p>';
    }
    return '<div class="roster-list" role="list" aria-label="Team members">' + rows + "</div>" + detail +
      (gone.length ? '<details class="gone"><summary>Left the project (' + gone.length + ")</summary><ul>" + gone.map(function (p) {
        return "<li><b>" + esc(p.name) + "</b>, " + esc(p.role) + ": " + esc(p.reason || p.status) + " in month " + p.left + "</li>";
      }).join("") + "</ul></details>" : "");
  }

  function mountFloor() {
    var host = document.getElementById("floor3d");
    if (!host) return;
    var F = window.DDFloor;
    if (!F || !window.THREE) {
      host.innerHTML = '<p class="floor-fallback">The 3D view could not load in this browser. The list shows your full team.</p>';
      return;
    }
    var ok = F.attach(host, function (id) {
      state.selected = id;
      var r = document.getElementById("roster");
      if (r) r.innerHTML = rosterHtml();
    });
    if (!ok) { host.innerHTML = '<p class="floor-fallback">3D graphics are switched off in this browser. The list shows your full team.</p>'; return; }
    var g = state.game, last = g.history[g.history.length - 1];
    F.update({
      key: state.gameKey,
      team: g.team,
      energy: function (p) { return E.personEnergy(g, p); },
      reported: last.reported,
      foundShare: last.found / g.scope,
      overtime: g.decisions.overtime
    });
    F.select(state.selected);
  }

  function feedHtml() {
    var g = state.game;
    var items = [];
    items.push('<div class="msg lead"><div class="who">Team lead &middot; start of month ' + (g.month + 1) + '</div><p class="quote">' + esc(leadMessage()) + "</p></div>");
    g.log.slice().reverse().slice(0, 8).forEach(function (e) {
      var label = e.kind === "change" ? "Client" : e.kind === "decision" ? "Your decision" : "News";
      items.push('<div class="msg ' + e.kind + '"><div class="who">' + label + " &middot; month " + e.m + "</div><h4>" + esc(e.title) + "</h4>" + (e.text ? "<p>" + esc(e.text) + "</p>" : "") + "</div>");
    });
    return items.join("");
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
    return parts.join(" ");
  }

  function decisionsHtml() {
    var g = state.game, s = scenario(), d = g.decisions;
    var heads = g.team.filter(function (p) { return p.kind !== "contractor" && (p.status === "active" || p.status === "leave"); }).length;
    var burn = heads * s.costPerFte * (1 + E.P.overtimePremium * d.overtime) + g.contr * s.costPerFte * 1.6 + Math.max(0, d.hire) * E.P.hiringCost + Math.max(0, -d.hire) * E.P.severanceCost;
    var hireHint = d.hire > 0 ? d.hire + " " + plural(d.hire, "recruit starts", "recruits start") + " next month. " + eur(E.P.hiringCost * d.hire) + " recruitment cost." :
      d.hire < 0 ? "Release " + -d.hire + plural(-d.hire, " person", " people") + " now. " + eur(E.P.severanceCost * -d.hire) + " severance." : "No change to the team.";
    var ovs = ["low", "medium", "high"].map(function (k) {
      return '<button type="button" data-action="overlap" data-v="' + k + '" aria-pressed="' + (d.overlap === k) + '">' + E.OVERLAP[k].label + "</button>";
    }).join("");
    var ots = [0, 0.1, 0.2, 0.3].map(function (v) {
      return '<button type="button" data-action="ot" data-v="' + v + '" aria-pressed="' + (Math.abs(d.overtime - v) < 1e-6) + '">' + Math.round(v * 100) + "%</button>";
    }).join("");
    var overlapHint = d.overlap === "low" ? "Phases mostly in sequence. Slower, fewer knock-on errors." : d.overlap === "high" ? "Phases run in parallel. Faster, but flaws spread into later work." : "Some overlap between phases. The usual compromise.";
    var otHint = d.overtime === 0 ? "Normal hours. Fatigue recovers." : d.overtime <= 0.1 ? "A light push. Fine for a month or two." : d.overtime <= 0.2 ? "Heavy. Fatigue and errors build within weeks." : "Crunch. Expect mistakes and resignations if it lasts.";
    var release = E.canRelease(g) ? '<button class="btn btn-danger" data-action="release-ask">Release now at ' + pct(g.history[g.history.length - 1].reported) + " reported</button>" : "";

    return "<h2>Month " + (g.month + 1) + " settings</h2>" +
      '<div class="field" id="lever-hire"><div class="field-label"><span class="lbl" id="lbl-hire">Hiring ' + help("hire", "About hiring") + "</span><output>" + (d.hire > 0 ? "+" : "") + d.hire + "</output></div>" +
      '<div class="stepper" role="group" aria-labelledby="lbl-hire"><button type="button" data-action="hire" data-v="-1" aria-label="One fewer">&minus;</button><div class="val">' + (d.hire > 0 ? "+" : "") + d.hire + '</div><button type="button" data-action="hire" data-v="1" aria-label="One more">+</button></div>' +
      '<span class="hint">' + hireHint + "</span></div>" +
      '<div class="field" id="lever-ot"><div class="field-label"><span class="lbl" id="lbl-ot">Overtime ' + help("overtime", "About overtime") + '</span></div><div class="seg" role="group" aria-labelledby="lbl-ot">' + ots + '</div><span class="hint">' + otHint + "</span></div>" +
      '<div class="field" id="lever-qa"><div class="field-label"><span class="lbl"><label for="qa">Reviews and testing</label> ' + help("qa", "About reviews and testing") + '</span><output id="qa-out">' + pct(d.qa) + "</output></div>" +
      '<input type="range" id="qa" min="5" max="30" step="5" value="' + Math.round(d.qa * 100) + '"><span class="hint">Share of effort spent checking work.</span></div>' +
      '<div class="field" id="lever-overlap"><div class="field-label"><span class="lbl" id="lbl-ov">Phase overlap ' + help("overlap", "About phase overlap") + '</span></div><div class="seg" role="group" aria-labelledby="lbl-ov">' + ovs + '</div><span class="hint">' + overlapHint + "</span></div>" +
      '<div class="run-row"><div class="burn"><span>Expected spend this month</span><b>' + eur(burn) + "</b></div>" +
      '<button class="btn btn-primary btn-big" id="run-btn" data-action="run">Run month ' + (g.month + 1) + "</button>" + release +
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
    if (g.card || g.finished) return;
    E.runMonth(g);
    if (g.finished) {
      store("dd.current", null);
      go("debrief");
      return;
    }
    state.dialog = "report";
    saveCurrent();
    render();
  }

  /* ---------- Dialogs ---------- */

  function dialogHtml() {
    var g = state.game;
    if (state.view !== "play" || !g) return "";
    if (state.tour != null) return tourHtml();
    if (state.dialog === "report" && g.report) return reportDialog();
    if (state.dialog === "release") return releaseDialog();
    if (g.card) return cardDialog();
    return "";
  }

  function cardDialog() {
    var c = state.game.card;
    var tagClass = c.type === "change" ? "warn" : "accent";
    return '<div class="overlay"><div class="dialog card-dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
      '<div class="dialog-top"><span class="chip ' + tagClass + '">' + esc(c.tag) + " &middot; month " + c.month + '</span><span class="hint">Your call as project manager</span></div>' +
      '<h2 id="dlg-title">' + esc(c.title) + "</h2><p>" + esc(c.text) + "</p>" +
      '<div class="options">' + c.options.map(function (o) {
        return '<button class="option" type="button" data-action="respond" data-v="' + esc(o.id) + '"><b>' + esc(o.label) + "</b>" + (o.detail ? "<span>" + esc(o.detail) + "</span>" : "") + "</button>";
      }).join("") + "</div></div></div>";
  }

  function reportDialog() {
    var g = state.game, s = scenario(), r = g.report;
    var bullets = [];
    if (r.overtime > 0) bullets.push(["Overtime", "+" + pct(r.overtime) + " hours gave about " + n0(r.extraWork) + " extra " + s.unit + " of output" + (r.fatigueErrors >= 1 ? ", but fatigue added about " + n0(r.fatigueErrors) + " hidden flaws." : ".")]);
    bullets.push(["Reviews and testing", "At " + pct(r.qa) + " effort, reviews caught about " + n0(r.caught) + " errors before they left the desk. About " + n0(r.flawed) + " flaws slipped through unnoticed and will surface later."]);
    if (r.knock >= 1) bullets.push(["Knock-on rework", "Flaws found in earlier work forced about " + n0(r.knock) + " finished " + s.unit + " to be redone" + (r.overlap === "high" ? ", amplified by the high phase overlap." : ".")]);
    var people = [];
    r.joined.forEach(function (n) { people.push('<li class="in">' + esc(n) + " joined the team</li>"); });
    r.back.forEach(function (n) { people.push('<li class="in">' + esc(n) + " is back from leave</li>"); });
    r.left.forEach(function (x) { people.push('<li class="out">' + esc(x.name) + ": " + esc(x.reason) + "</li>"); });
    r.onLeave.forEach(function (n) { people.push('<li class="mid">' + esc(n) + " is on leave</li>"); });
    if (r.arriving) people.push('<li class="mid">' + r.arriving + " " + plural(r.arriving, "recruit starts", "recruits start") + " next month</li>");
    var next = g.card ? '<p class="next-up">Next up: <b>' + esc(g.card.title) + "</b></p>" : "";
    return '<div class="overlay"><div class="dialog report" role="dialog" aria-modal="true" aria-labelledby="rep-title">' +
      '<span class="chip accent">Month report</span><h2 id="rep-title">Month ' + r.m + " in review</h2>" +
      '<div class="rep-stats">' +
      '<div><span class="k">Work done</span><b>' + n0(r.work) + "</b><span>" + esc(s.unit) + "</span></div>" +
      '<div><span class="k">Came back as rework</span><b class="bad-t">' + n0(r.found) + "</b><span>" + esc(s.unit) + "</span></div>" +
      '<div><span class="k">Reported progress</span><b>' + (r.netProgress >= 0 ? "+" : "") + Math.round(r.netProgress * 100) + " pts</b><span>now " + pct(g.history[g.history.length - 1].reported) + "</span></div>" +
      '<div><span class="k">Spent</span><b>' + eur(r.spent) + "</b><span>this month</span></div>" +
      "</div>" +
      '<h3>What your choices did</h3><dl class="rep-list">' + bullets.map(function (b) { return "<dt>" + b[0] + "</dt><dd>" + esc(b[1]) + "</dd>"; }).join("") + "</dl>" +
      (people.length ? '<h3>People</h3><ul class="people-list">' + people.join("") + "</ul>" : "") +
      '<div class="coach"><span class="eyebrow">Coach</span><p>' + esc(r.tip) + "</p></div>" +
      objectivesStrip(g) + next +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-primary" data-action="report-ok" data-autofocus>' + (g.card ? "Continue to the decision" : "Continue to month " + (g.month + 1)) + "</button></div>" +
      "</div></div>";
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

  /* ---------- Guided tour ---------- */

  var TOUR = [
    { sel: null, title: "Welcome, project manager", text: "You lead this project. Every month you handle a situation, read the dashboard, set four levers and run the month. This short tour shows you where everything is. You can reopen it any time with the Guided tour button." },
    { sel: "#obj-strip", title: "Your three goals", text: "Deliver on time, stay within budget and avoid burning out your people. Each goal you achieve earns a star. Green means on track, amber at risk, red missed." },
    { sel: "#kpi-progress", title: "Reported progress", text: "What your team reports as finished. It also counts work that only looks done but hides flaws, so it tends to run ahead of reality. The marker shows where the plan says you should be." },
    { sel: "#kpi-spent", title: "Spend", text: "Money spent against the budget. Overtime premiums, recruitment and contractors push it up." },
    { sel: "#team-card", title: "Your team", text: "These are your people. Blue are experienced, green are new hires still learning, amber are contractors. The ring at their feet shows energy. Click anyone to see their details; drag the 3D view to turn it." },
    { sel: "#kpi-energy", title: "Team energy", text: "Overtime drains energy over several weeks. Tired people make more mistakes, and exhausted people resign. Keep it above 50% to keep your third star." },
    { sel: "#kpi-defects", title: "Defects found", text: "Work that came back as flawed last month. This is the hidden rework surfacing. Watch it: it tells you how real your progress is." },
    { sel: "#lever-hire", title: "Lever 1: hiring", text: "Add or release people. Recruits arrive next month and take about three months to reach full speed, so hire early rather than late." },
    { sel: "#lever-ot", title: "Lever 2: overtime", text: "More hours now, more fatigue later. Short bursts help; long crunches backfire." },
    { sel: "#lever-qa", title: "Lever 3: reviews and testing", text: "Effort spent checking work. It slows building a little but catches errors while they are cheap to fix. Around 15 to 25% is usually sensible." },
    { sel: "#lever-overlap", title: "Lever 4: phase overlap", text: "Starting later work before earlier work is settled is faster, but flaws then spread into more of the project." },
    { sel: "#run-btn", title: "Run the month", text: "When your settings are ready, run the month. A short report follows, and from month 2 most months bring a decision card. A good first move here: hire 3 people and set testing to 20%." }
  ];

  function tourHtml() {
    var step = TOUR[state.tour];
    return '<div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title"><div class="tour-spot' + (step.sel ? "" : " none") + '" id="tour-spot"></div>' +
      '<div class="tour-pop" id="tour-pop"><span class="eyebrow">Guided tour &middot; ' + (state.tour + 1) + " of " + TOUR.length + "</span>" +
      '<h3 id="tour-title">' + esc(step.title) + "</h3><p>" + esc(step.text) + "</p>" +
      '<div class="actions"><button class="btn btn-primary" data-action="tour-next" data-autofocus>' + (state.tour === TOUR.length - 1 ? "Start playing" : "Next") + "</button>" +
      (state.tour > 0 ? '<button class="btn" data-action="tour-back">Back</button>' : "") +
      '<button class="btn btn-link" data-action="tour-skip">Skip tour</button></div></div></div>';
  }

  function placeTour() {
    var spot = document.getElementById("tour-spot");
    var pop = document.getElementById("tour-pop");
    if (!spot || !pop) return;
    var step = TOUR[state.tour];
    var target = step.sel ? document.querySelector(step.sel) : null;
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    if (!target) {
      spot.style.cssText = "left:50%;top:40%;width:0;height:0;";
      pop.style.left = Math.max(12, (window.innerWidth - pw) / 2) + "px";
      pop.style.top = Math.max(12, (window.innerHeight - ph) / 2) + "px";
      return;
    }
    var r = target.getBoundingClientRect();
    var pad = 8;
    spot.style.left = (r.left - pad) + "px";
    spot.style.top = (r.top - pad) + "px";
    spot.style.width = (r.width + pad * 2) + "px";
    spot.style.height = (r.height + pad * 2) + "px";
    var top, left;
    if (r.left > window.innerWidth * 0.55 && window.innerWidth > 980) {
      left = r.left - pw - 20;
      top = Math.min(Math.max(12, r.top), window.innerHeight - ph - 12);
    } else {
      top = r.bottom + 16;
      if (top + ph > window.innerHeight - 12) top = r.top - ph - 16;
      if (top < 12) top = Math.max(12, window.innerHeight - ph - 12);
      left = r.left + Math.min(r.width, 360) / 2 - pw / 2;
    }
    pop.style.left = Math.max(12, Math.min(window.innerWidth - pw - 12, left)) + "px";
    pop.style.top = Math.max(12, top) + "px";
  }

  function showTourStep(i) {
    state.tour = i;
    var step = TOUR[i];
    render();
    var target = step.sel ? document.querySelector(step.sel) : null;
    if (target) {
      var r = target.getBoundingClientRect();
      var tall = r.height > window.innerHeight * 0.6;
      target.scrollIntoView({ block: tall ? "start" : "center", behavior: "auto" });
      placeTour();
      setTimeout(placeTour, 60);
    }
  }

  function endTour() {
    state.tour = null;
    store("dd.tourDone", true);
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- Debrief ---------- */

  function viewDebrief() {
    var g = state.game, s = scenario();
    var sc = E.scores(g);
    var ins = E.insights(g);
    var isNewBest = recordBest(s.id, sc.overall, sc.stars);
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

    var objHtml = '<ul class="goal-list final">' + sc.objectives.map(function (o) {
      return '<li class="' + o.status + '">' + starsHtml(o.status === "done" ? 1 : 0, 1) + " " + esc(o.label) + " <b>" + (o.status === "done" ? "Achieved" : "Missed") + "</b></li>";
    }).join("") + "</ul>";

    var insHtml = ins.length ? ins.map(function (i) {
      var ico = i.tone === "warn" ? "!" : i.tone === "good" ? "+" : "i";
      return '<div class="insight ' + i.tone + '"><div class="ico">' + ico + "</div><div><h4>" + esc(i.title) + "</h4><p>" + esc(i.text) + "</p></div></div>";
    }).join("") : '<div class="insight info"><div class="ico">i</div><div><h4>A clean run</h4><p>No single pattern dominated this project. Try a harder scenario, or replay this one with a bolder strategy and compare.</p></div></div>';

    var logRows = g.cardLog.map(function (c) {
      return '<tr><td class="num">' + c.m + "</td><td>" + esc(c.title) + "</td><td>" + esc(c.choice) + "</td></tr>";
    }).join("");

    var top = window.self === window.top;
    return '<section class="debrief-hero">' + ring +
      '<div><span class="eyebrow">' + esc(s.title) + " &middot; " + esc(outcome) + "</span>" +
      "<h1>" + esc(sc.rank.title) + "</h1>" + '<div class="big-stars">' + starsHtml(sc.stars) + "</div><p>" + esc(sc.rank.text) + (isNewBest ? " This is your best result on this project so far." : "") + "</p>" +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-primary" data-action="replay">Play this project again</button><button class="btn" data-action="home">Try another project</button></div>' +
      "</div></section>" +
      '<div class="debrief-goals panel"><h3>Goals</h3>' + objHtml + "</div>" +
      '<div class="score-bars">' + bars + "</div>" +
      '<section class="section"><div class="section-head"><h2>What really happened</h2><p>During the game you only saw the reported figures. Here is the full picture.</p></div>' +
      '<div class="chart-grid">' +
      '<div class="chart-card" style="grid-column:1/-1"><div class="chart-card-head"><h3>Reported versus truly finished</h3><div class="legend"><span><i style="background:var(--accent)"></i>Reported</span><span><i style="background:var(--truth)"></i>Truly finished</span><span><i class="dash"></i>Plan</span></div></div>' +
      '<p class="chart-note">The shaded band is undiscovered rework: work that was counted as done but was flawed.</p><div class="chart" id="d-progress"></div></div>' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Rework found each month</h3></div><p class="chart-note">' + esc(s.unit.charAt(0).toUpperCase() + s.unit.slice(1)) + ' sent back after flaws came to light.</p><div class="chart" id="d-rework"></div></div>' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Spend</h3><div class="legend"><span><i style="background:var(--ink)"></i>Spent</span><span><i class="dash"></i>Budget plan</span></div></div><p class="chart-note">Cumulative cost against the budget, spread evenly to the deadline.</p><div class="chart" id="d-spend"></div></div>' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Team size</h3></div><p class="chart-note">Everyone working, including contractors.</p><div class="chart" id="d-staff"></div></div>' +
      '<div class="chart-card"><div class="chart-card-head"><h3>Team fatigue</h3></div><p class="chart-note">Builds with sustained overtime, recovers with normal hours.</p><div class="chart" id="d-fatigue"></div></div>' +
      "</div></section>" +
      '<section class="section"><div class="section-head"><h2>Your debrief</h2><p>The patterns that shaped this result, drawn from your own decisions.</p></div><div class="insights">' + insHtml + "</div></section>" +
      '<section class="section"><div class="section-head"><h2>Your decisions</h2><p>Every situation you handled, month by month. Useful for a team discussion or a workshop debrief.</p></div>' +
      (logRows ? '<div class="table-wrap"><table class="log-table"><thead><tr><th scope="col">Month</th><th scope="col">Situation</th><th scope="col">Your choice</th></tr></thead><tbody>' + logRows + "</tbody></table></div>" : "<p>No decisions were recorded.</p>") +
      '<div class="actions" style="margin-top:12px"><button class="btn" data-action="copy-log">Copy decision log</button>' + (top ? '<button class="btn" data-action="save-csv">Download game data (CSV)</button>' : "") + '</div><div class="status-line" id="log-status" role="status"></div></section>' +
      '<section class="section"><div class="section-head"><h2>Share your result</h2><p>Challenge your network. The score card and text below are ready for a LinkedIn post.</p></div>' +
      '<div class="share"><canvas id="scorecard" width="1200" height="630" aria-label="Score card image"></canvas>' +
      '<div style="display:grid;gap:10px"><label for="post" class="lbl" style="font-weight:600">Post text</label><textarea id="post">' + esc(postText(sc)) + "</textarea>" +
      '<div class="actions"><button class="btn btn-primary" data-action="copy-post">Copy post text</button>' +
      (top ? '<button class="btn" data-action="save-card">Save score card image</button>' : "") +
      '</div><div class="status-line" id="copy-status" role="status"></div>' +
      (top ? "" : '<p class="hint">To post the score card image, take a screenshot of it, or open the game from its own web address where the Save button is available.</p>') +
      "</div></div></section>";
  }

  function postText(sc) {
    var g = state.game, s = scenario();
    var line = g.outcome === "complete" ? "delivered in month " + g.finishMonth + " against a month " + g.deadline + " deadline" :
      g.outcome === "released" ? "released early in month " + g.finishMonth : "cancelled by the sponsor in month " + g.finishMonth;
    return "I just led the " + s.title + " project in Deadline Dynamics, a project management simulator built on system dynamics research.\n\n" +
      "Score: " + sc.overall + "/100 (" + sc.rank.title + "), " + sc.stars + " of 3 stars. The project was " + line + ", " +
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
      x.textAlign = "left";
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

      x.fillStyle = "#ffffff"; x.font = "700 200px 'IBM Plex Mono', monospace";
      x.fillText(String(sc.overall), 62, 350);
      var sw = x.measureText(String(sc.overall)).width;
      x.fillStyle = "#94a3ad"; x.font = "500 40px 'IBM Plex Mono', monospace";
      x.fillText("/100", 70 + sw, 350);

      x.font = "48px sans-serif";
      for (var st = 0; st < 3; st++) {
        x.fillStyle = st < sc.stars ? "#f2b632" : "rgba(255,255,255,0.18)";
        x.fillText("★", 70 + st * 56, 420);
      }

      x.fillStyle = "#7096ff"; x.font = "700 60px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      x.fillText(sc.rank.title.toUpperCase(), 70, 488);

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

      x.fillStyle = "rgba(255,255,255,0.12)"; x.fillRect(70, 530, W - 140, 1);
      x.fillStyle = "#e4eaed"; x.font = "600 28px 'IBM Plex Sans', sans-serif";
      x.fillText("Can you beat it?", 70, 580);
      x.fillStyle = "#94a3ad"; x.font = "500 22px 'IBM Plex Mono', monospace";
      x.textAlign = "right"; x.fillText("A simulator by Dr. Rajan Kumar V K", W - 70, 580); x.textAlign = "left";
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
      "<h2>People and decisions</h2>" +
      "<p>Your team is a roster of named individuals. Each person has a role, an experience level and a personal resilience, so fatigue does not hit everyone equally. When resignations happen, the most exhausted person leaves first. Most months also bring a decision card: a demo request, a burnout warning, a status meeting, an offer of contractors. Each option changes the model, for example by revealing hidden flaws early, lowering the error rate, or adding to the trust you will need if the project slips.</p>" +
      "<h2>How you are scored</h2>" +
      "<p>Three goals earn stars: deliver by the deadline, stay within budget, and avoid burnout (no exhausted resignations and team energy above 50%). The overall score out of 100 combines schedule (30%), budget (20%), quality (20%), stakeholder satisfaction (15%) and team health (15%). Quality reflects how much work was right the first time and how many flaws reached the client. Stakeholders react to your answers, to how reported progress tracks the plan, to the delivery date, and to whether your status reports were honest.</p>" +
      "<p>The model is deterministic: the same decisions always give the same result, so you can replay a project and compare strategies fairly. This also makes it suitable for workshops and courses, where groups play the same scenario and compare their decision logs.</p>" +
      "<h2>A note on realism</h2>" +
      "<p>This is a teaching model. Its parameters are illustrative and chosen so that the dynamics reported in the research appear clearly. They are not calibrated to any particular organisation, and the scenarios, companies and people are fictional.</p>" +
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

  function startGame(id, withTour) {
    state.scenarioId = id;
    state.game = E.newGame(id);
    state.gameKey = Date.now();
    state.selected = null;
    saveCurrent();
    state.view = "play";
    state.dialog = null;
    window.scrollTo(0, 0);
    if (withTour) showTourStep(0);
    else { state.tour = null; render(); }
  }

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest(".help");
    if (b) {
      ev.preventDefault();
      if (tipFor === b && tipEl && tipEl.style.display === "block") hideTip(); else showTip(b);
      return;
    }
    if (tipFor && !(ev.target.closest && ev.target.closest(".tooltip"))) hideTip();
    var t = ev.target.closest && ev.target.closest("[data-action]");
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
      case "start": startGame(state.scenarioId, t.getAttribute("data-tour") === "1"); break;
      case "resume":
        var saved = store("dd.current");
        if (saved && saved.game && saved.game.team) { state.scenarioId = saved.scenarioId; state.game = saved.game; state.gameKey = Date.now(); go("play"); }
        break;
      case "discard": store("dd.current", null); render(); break;
      case "hire":
        var heads = g.team.filter(function (p) { return p.status === "active" && p.kind !== "contractor"; }).length;
        var nv = Math.max(-Math.min(4, heads - 2), Math.min(8, g.decisions.hire + Number(v)));
        E.setDecisions(g, { hire: nv }); refreshDecisions(); saveCurrent();
        break;
      case "ot": E.setDecisions(g, { overtime: Number(v) }); refreshDecisions(); saveCurrent(); break;
      case "overlap": E.setDecisions(g, { overlap: v }); refreshDecisions(); saveCurrent(); break;
      case "run": runMonth(); break;
      case "to-settings":
        ev.preventDefault();
        var dEl = document.getElementById("decisions");
        if (dEl) dEl.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      case "respond":
        E.respond(g, v); saveCurrent(); render();
        toast("Decision recorded");
        break;
      case "report-ok": state.dialog = null; render(); break;
      case "person":
        state.selected = Number(t.getAttribute("data-id"));
        var r = document.getElementById("roster");
        if (r) r.innerHTML = rosterHtml();
        if (window.DDFloor && window.DDFloor.available) window.DDFloor.select(state.selected);
        break;
      case "tour": showTourStep(0); break;
      case "tour-next": if (state.tour >= TOUR.length - 1) endTour(); else showTourStep(state.tour + 1); break;
      case "tour-back": showTourStep(Math.max(0, state.tour - 1)); break;
      case "tour-skip": endTour(); break;
      case "release-ask": state.dialog = "release"; render(); break;
      case "release-no": state.dialog = null; render(); break;
      case "release-yes": E.release(g); store("dd.current", null); go("debrief"); break;
      case "leave": store("dd.current", null); state.game = null; go("home"); break;
      case "replay": startGame(state.scenarioId, false); break;
      case "copy-post": copyText(document.getElementById("post").value, "copy-status", "Copied. Paste it into a new LinkedIn post.", document.getElementById("post")); break;
      case "copy-log": copyText(logText(), "log-status", "Decision log copied.", null); break;
      case "save-card": saveCard(); break;
      case "save-csv": saveCsv(); break;
    }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (tipFor) { hideTip(); return; }
    if (state.tour != null) { endTour(); return; }
    if (state.dialog === "release") { state.dialog = null; render(); }
  });

  function logText() {
    var g = state.game, s = scenario();
    var lines = ["Deadline Dynamics: " + s.title, "Month | Situation | Your choice"];
    g.cardLog.forEach(function (c) { lines.push(c.m + " | " + c.title + " | " + c.choice); });
    var sc = E.scores(g);
    lines.push("Score: " + sc.overall + "/100, " + sc.stars + " of 3 stars (" + sc.rank.title + ")");
    return lines.join("\n");
  }

  function copyText(text, statusId, okMsg, selectEl) {
    var status = document.getElementById(statusId);
    var done = function () { if (status) status.textContent = okMsg; };
    var fail = function () {
      if (selectEl) { selectEl.focus(); selectEl.select(); }
      if (status) status.textContent = "Your browser blocked copying." + (selectEl ? " The text is selected: press Ctrl+C (or Cmd+C)." : "");
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
      else fail();
    } catch (e) { fail(); }
  }

  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function saveCard() {
    var cv = document.getElementById("scorecard");
    if (!cv) return;
    try { cv.toBlob(function (blob) { download(blob, "deadline-dynamics-score.png"); }); }
    catch (e) {
      var status = document.getElementById("copy-status");
      if (status) status.textContent = "Saving is blocked here. Take a screenshot of the score card instead.";
    }
  }

  function saveCsv() {
    var g = state.game;
    var cols = ["month", "reported_progress", "true_progress", "cost_keur", "budget_keur", "staff", "experienced", "new", "contractors", "fatigue", "overtime", "testing", "overlap", "hires", "rework_found", "decision", "choice"];
    var rows = [cols.join(",")];
    g.history.forEach(function (r) {
      var c = g.cardLog.filter(function (x) { return x.m === r.m; })[0];
      rows.push([r.m, r.reported.toFixed(3), r.truth.toFixed(3), r.cost.toFixed(1), r.budget.toFixed(0), r.staff, r.exp, r.rook, r.contr || 0, r.fatigue.toFixed(3), r.overtime, r.qa, r.overlap, r.hire, r.found.toFixed(1),
        c ? '"' + c.title.replace(/"/g, "'") + '"' : "", c ? '"' + c.choice.replace(/"/g, "'") + '"' : ""].join(","));
    });
    download(new Blob([rows.join("\n")], { type: "text/csv" }), "deadline-dynamics-" + g.scenarioId + ".csv");
    var st = document.getElementById("log-status");
    if (st) st.textContent = "Game data downloaded.";
  }

  /* ---------- Boot ---------- */

  function start(data) {
    if (data && data.view) {
      state.view = data.view;
      state.scenarioId = data.scenarioId || null;
      state.game = data.game && data.game.team ? data.game : null;
      state.dialog = data.dialog || null;
      state.gameKey = Date.now();
      if ((state.view === "play" || state.view === "debrief") && !state.game) state.view = "home";
      if (state.view === "brief" && !state.scenarioId) state.view = "home";
    }
    render();
  }

  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    window.claude.hot.snapshot(function () { return { view: state.view, scenarioId: state.scenarioId, game: state.game, dialog: state.dialog }; });
  }
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
  else start((window.claude && window.claude.hot && window.claude.hot.data) || {});
})();
