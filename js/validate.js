/*
 * Deadline Dynamics: model validation tests
 * (c) Rajan Kumar V K. All rights reserved.
 *
 * Standard system dynamics model tests (Sterman, 2000, chapter 21; Barlas, 1996):
 * structure checks, extreme-condition tests and behaviour-reproduction tests.
 * They run in the browser in a fraction of a second because the model is
 * deterministic.
 */
(function (root) {
  "use strict";

  function E() { return root.DDEngine; }

  function base(id, patch) {
    var src = E().findScenario("software");
    var sc = JSON.parse(JSON.stringify(src));
    sc.id = id;
    sc.cards = {};
    sc.events = [];
    for (var k in patch) sc[k] = patch[k];
    return sc;
  }

  function play(id, policy, months) {
    var s = E().newGame(id);
    var guard = 0;
    while (!s.finished && guard++ < 200 && (!months || s.month < months)) {
      if (s.card) { E().respond(s, s.card.type === "change" ? "negotiate" : "0"); continue; }
      E().setDecisions(s, policy(s));
      E().runMonth(s);
    }
    return s;
  }

  function steady(s) { return { hire: s.month === 0 ? 3 : 0, overtime: 0, qa: 0.15, overlap: "medium" }; }

  function pct(x) { return (x * 100).toFixed(1) + "%"; }

  function run() {
    var results = [];
    var add = function (group, name, pass, measured, expect) {
      results.push({ group: group, name: name, pass: !!pass, measured: measured, expect: expect });
    };
    var tests = [];

    // 1. Conservation of work in every scenario
    tests.push(function () {
      var worst = 0;
      E().findScenario && root.DDScenarios.SCENARIOS.filter(function (s) { return s.id.charAt(0) !== "_"; }).forEach(function (sc) {
        var g = play(sc.id, steady);
        g.history.forEach(function (r) {
          var sum = r.todo + r.truth * r.scope + r.undisc;
          worst = Math.max(worst, Math.abs(sum - r.scope) / r.scope);
        });
      });
      add("Structure", "Conservation of work: to do + done + hidden rework always equals scope", worst < 0.005, "largest error " + pct(worst), "below 0.5%");
    });

    // 2. Determinism
    tests.push(function () {
      var a = play("software", steady), b = play("software", steady);
      var same = JSON.stringify(a.history) === JSON.stringify(b.history);
      add("Structure", "Determinism: identical decisions give identical results", same, same ? "identical" : "different", "identical");
    });

    // 3. Replay fidelity
    tests.push(function () {
      var g = play("twin", function (s) { return { hire: s.month === 1 ? 4 : 0, overtime: s.month % 4 === 2 ? 0.2 : 0, qa: 0.2, overlap: s.month < 4 ? "high" : "medium" }; });
      var r = E().replay("twin", E().planOf(g));
      var same = JSON.stringify(r.history) === JSON.stringify(g.history);
      add("Structure", "Replay fidelity: a recorded game replays to exactly the same result", same, same ? "identical" : "different", "identical");
    });

    // 4. Extreme condition: no staff, no progress
    tests.push(function () {
      E().registerScenario(base("__empty", { experienced: 0, rookies: 0 }));
      var g = play("__empty", function () { return { hire: 0, overtime: 0, qa: 0.15, overlap: "medium" }; }, 6);
      E().unregisterScenario("__empty");
      var rep = g.history[g.history.length - 1].reported;
      add("Extreme conditions", "With no staff, no work gets done", rep === 0, "progress after 6 months: " + pct(rep), "0%");
    });

    // 5. Extreme condition: near-zero error rate removes the hidden-rework gap
    tests.push(function () {
      E().registerScenario(base("__perfect", { baseError: 0 }));
      var g = play("__perfect", steady);
      E().unregisterScenario("__perfect");
      var gap = 0;
      g.history.forEach(function (r) { gap = Math.max(gap, r.reported - r.truth); });
      add("Extreme conditions", "With (almost) no errors, reported and true progress coincide", gap < 0.02, "largest gap " + pct(gap), "below 2 points");
    });

    // 6. Extreme condition: endless overtime cannot be sustained
    tests.push(function () {
      var calm = play("software", function (s) { return { hire: 0, overtime: 0, qa: 0.15, overlap: "medium" }; }, 8);
      var crunch = play("software", function (s) { return { hire: 0, overtime: 0.3, qa: 0.15, overlap: "medium" }; }, 8);
      var wc = calm.history.slice(5, 9).reduce(function (a, r) { return a + r.work - r.flawed; }, 0);
      var wx = crunch.history.slice(5, 9).reduce(function (a, r) { return a + r.work - r.flawed; }, 0);
      add("Extreme conditions", "Sustained 30% overtime yields less sound output after a few months than normal hours", wx < wc,
        "months 5 to 8: " + Math.round(wx) + " vs " + Math.round(wc) + " sound features", "crunch below normal hours");
    });

    // 7. Behaviour reproduction: the 90% syndrome
    tests.push(function () {
      var g = play("software", function (s) { return { hire: s.month === 0 ? 8 : 0, overtime: s.month >= 4 ? 0.2 : 0, qa: 0.05, overlap: "high" }; });
      var stuck = g.history.filter(function (r) { return r.reported >= 0.8 && r.reported < 0.99; }).length;
      var gap = 0;
      g.history.forEach(function (r) { gap = Math.max(gap, r.reported - r.truth); });
      add("Behaviour reproduction", "The 90% syndrome: under pressure, reported progress stalls near completion for months", stuck >= 3 && gap >= 0.1,
        stuck + " months between 80% and 99% reported; largest gap " + pct(gap), "3 or more months, gap of 10 points or more");
    });

    // 8. Behaviour reproduction: Brooks' law drag
    tests.push(function () {
      var none = play("software", function () { return { hire: 0, overtime: 0, qa: 0.15, overlap: "medium" }; }, 10);
      var late = play("software", function (s) { return { hire: s.month === 8 ? 8 : 0, overtime: 0, qa: 0.15, overlap: "medium" }; }, 10);
      var r0 = none.history[10], r1 = late.history[10];
      var perHead0 = (r0.work - r0.flawed) / r0.staff, perHead1 = (r1.work - r1.flawed) / r1.staff;
      add("Behaviour reproduction", "Brooks' law: a large late hire lowers sound output per person in the month the recruits arrive", perHead1 < perHead0 * 0.85,
        (perHead1).toFixed(1) + " vs " + (perHead0).toFixed(1) + " sound features per person", "at least 15% lower");
    });

    // 9. Behaviour reproduction: testing keeps reports honest
    tests.push(function () {
      var thin = play("software", function (s) { return { hire: s.month === 0 ? 3 : 0, overtime: 0, qa: 0.05, overlap: "medium" }; });
      var thick = play("software", function (s) { return { hire: s.month === 0 ? 3 : 0, overtime: 0, qa: 0.25, overlap: "medium" }; });
      var g1 = 0, g2 = 0;
      thin.history.forEach(function (r) { g1 = Math.max(g1, r.reported - r.truth); });
      thick.history.forEach(function (r) { g2 = Math.max(g2, r.reported - r.truth); });
      add("Behaviour reproduction", "More reviews and testing shrink the gap between reported and true progress", g2 < g1 * 0.7,
        "largest gap " + pct(g2) + " with 25% testing vs " + pct(g1) + " with 5%", "at least 30% smaller");
    });

    // 10. Behaviour reproduction: overlap amplifies knock-on rework
    tests.push(function () {
      var lo = play("software", function (s) { return { hire: s.month === 0 ? 3 : 0, overtime: 0, qa: 0.15, overlap: "low" }; });
      var hi = play("software", function (s) { return { hire: s.month === 0 ? 3 : 0, overtime: 0, qa: 0.15, overlap: "high" }; });
      add("Behaviour reproduction", "Running phases in parallel multiplies knock-on rework", hi.sum.knock > lo.sum.knock * 2,
        Math.round(hi.sum.knock) + " vs " + Math.round(lo.sum.knock) + " features redone", "more than twice as much");
    });

    var t0 = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
    tests.forEach(function (t) {
      try { t(); } catch (e) { results.push({ group: "Error", name: String(e && e.message || e), pass: false, measured: "", expect: "" }); }
    });
    var t1 = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
    return { results: results, ms: Math.round(t1 - t0) };
  }

  var api = { run: run };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DDValidate = api;
})(typeof window !== "undefined" ? window : globalThis);
