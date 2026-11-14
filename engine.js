/*
 * Deadline Dynamics: simulation engine
 * (c) Rajan Kumar V K. All rights reserved.
 *
 * A system dynamics model of a project, integrated in weekly steps with
 * monthly management decisions. The structure follows the rework cycle
 * and project dynamics literature (Cooper, 1980; Abdel-Hamid & Madnick,
 * 1991; Ford & Sterman, 1998; Lyneis & Ford, 2007), written from scratch.
 *
 * Stocks: work to do, work done correctly, undiscovered rework,
 * experienced staff, new staff, staff in recruitment, fatigue, cost.
 * The model is deterministic, so the same decisions always give the same
 * result and players can compare strategies fairly.
 */
(function (root) {
  "use strict";

  var WEEKS = 4;

  var P = {
    rookieProductivity: 0.4, // a new hire works at 40% of an experienced person
    mentoringLoad: 0.25, // each new hire takes 25% of an experienced person's time
    rookieErrorMult: 1.8, // new hires make more mistakes
    assimilationWeeks: 12, // time for a new hire to become experienced
    hiringDelayWeeks: 4, // recruitment lead time
    commOverheadPerHead: 0.004, // coordination cost per person above 8
    fatigueProductivityHit: 0.35, // full fatigue removes 35% of output
    fatigueErrorHit: 1.2, // full fatigue more than doubles the error rate
    fatigueRiseWeeks: 6,
    fatigueRecoverWeeks: 4,
    baseQuitPerWeek: 0.002,
    fatigueQuitPerWeek: 0.012,
    overtimePremium: 1.25,
    hiringCost: 6, // thousand euro per hire
    severanceCost: 10, // thousand euro per release
    finalTestWeeks: 2,
    qaCapacityShare: 0.6, // part of review and test effort that comes out of build capacity
    reviewCatch: 3.5, // how strongly reviews catch errors at the source
    reviewFixCost: 0.3, // effort to fix an error caught in review, relative to a task
    doneShareOfScope: 0.005
  };

  var OVERLAP = {
    low: { label: "Low", speed: 0.86, errorAdd: -0.02, knock: 0.15 },
    medium: { label: "Medium", speed: 1.0, errorAdd: 0.0, knock: 0.35 },
    high: { label: "High", speed: 1.14, errorAdd: 0.05, knock: 0.7 }
  };

  var RESPONSES = {
    accept: { label: "Accept as asked", stake: 8 },
    negotiate: { label: "Accept, with more time and budget", stake: -3 },
    defer: { label: "Defer to a later phase", stake: -6 },
    reject: { label: "Reject the request", stake: -14 }
  };

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function findScenario(id) {
    var list = root.DDScenarios.SCENARIOS;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function newGame(scenarioId) {
    var sc = findScenario(scenarioId);
    if (!sc) throw new Error("Unknown scenario " + scenarioId);
    var s = {
      scenarioId: sc.id,
      month: 0,
      scope: sc.scope,
      deadline: sc.deadline,
      budget: sc.budget,
      todo: sc.scope,
      correct: 0,
      undisc: 0,
      exp: sc.experienced,
      rook: sc.rookies,
      pipeline: [], // {weeksLeft, n}
      fatigue: 0,
      cost: 0,
      stake: 70,
      quits: 0,
      released: 0,
      hiredTotal: 0,
      prodShock: { factor: 1, weeks: 0 },
      decisions: { hire: 0, overtime: 0, qa: 0.15, overlap: "medium" },
      pendingChoice: null,
      log: [],
      history: [],
      crLog: [],
      finished: false,
      outcome: null, // "complete" | "released" | "cancelled"
      finishMonth: null,
      escaped: 0,
      sum: { work: 0, errors: 0, fatigueErrors: 0, knock: 0, found: 0, discWeeks: 0, weeks: 0 }
    };
    s.history.push(snapshotRow(s, sc, null));
    enterMonth(s);
    return s;
  }

  function snapshotRow(s, sc, mo) {
    var total = s.scope;
    return {
      m: s.month,
      exp: s.exp,
      rook: s.rook,
      staff: s.exp + s.rook,
      arriving: s.pipeline.reduce(function (a, p) { return a + p.n; }, 0),
      fatigue: s.fatigue,
      reported: clamp((s.correct + s.undisc) / total, 0, 1),
      truth: clamp(s.correct / total, 0, 1),
      cost: s.cost,
      budget: s.budget,
      deadline: s.deadline,
      overtime: mo ? mo.overtime : 0,
      qa: mo ? mo.qa : 0.15,
      overlap: mo ? mo.overlap : "medium",
      hire: mo ? mo.hire : 0,
      err: mo ? mo.err : sc.baseError,
      found: mo ? mo.found : 0,
      work: mo ? mo.work : 0,
      fatigueErrors: mo ? mo.fatigueErrors : 0,
      knock: mo ? mo.knock : 0,
      discWeeks: mo ? mo.discWeeks : sc.discoveryWeeks,
      stake: s.stake,
      todo: s.todo,
      undisc: s.undisc,
      scope: s.scope
    };
  }

  /* Fire the events that belong to the month about to start. */
  function enterMonth(s) {
    var sc = findScenario(s.scenarioId);
    var m = s.month + 1;
    sc.events.forEach(function (ev, idx) {
      if (ev.month !== m) return;
      if (ev.type === "change") {
        s.pendingChoice = { idx: idx, month: m };
        s.log.push({ m: m, kind: "change", title: ev.title, text: ev.text });
      } else if (ev.type === "quit") {
        var n = Math.min(ev.count, Math.max(0, s.exp - 1));
        s.exp -= n;
        s.quits += n;
        s.log.push({ m: m, kind: "bad", title: ev.title, text: ev.text });
      } else if (ev.type === "supplier") {
        s.prodShock = { factor: ev.factor, weeks: ev.weeks };
        s.log.push({ m: m, kind: "bad", title: ev.title, text: ev.text });
      } else if (ev.type === "rework") {
        var moved = s.correct * ev.share;
        s.correct -= moved;
        s.undisc += moved;
        s.hiddenShock = (s.hiddenShock || 0) + moved;
        s.log.push({ m: m, kind: "bad", title: ev.title, text: ev.text });
      }
    });
  }

  function respond(s, optionId) {
    if (!s.pendingChoice) return;
    var sc = findScenario(s.scenarioId);
    var ev = sc.events[s.pendingChoice.idx];
    var r = RESPONSES[optionId];
    if (!r) return;
    if (optionId === "accept" || optionId === "negotiate") {
      s.scope += ev.tasks;
      s.todo += ev.tasks;
      s.budget += ev.budgetAdd;
    }
    if (optionId === "negotiate") s.deadline += ev.extension;
    s.stake = clamp(s.stake + r.stake, 0, 100);
    s.crLog.push({ m: s.pendingChoice.month, title: ev.title, choice: optionId, tasks: ev.tasks, extension: ev.extension });
    s.log.push({ m: s.pendingChoice.month, kind: "decision", title: "Your answer: " + r.label.toLowerCase(), text: "" });
    s.pendingChoice = null;
  }

  function setDecisions(s, d) {
    var cur = s.decisions;
    s.decisions = {
      hire: d.hire != null ? Math.round(d.hire) : cur.hire,
      overtime: d.overtime != null ? d.overtime : cur.overtime,
      qa: d.qa != null ? d.qa : cur.qa,
      overlap: d.overlap || cur.overlap
    };
  }

  /* Current team capacity in effective full-time people. */
  function effectiveStaff(s) {
    var team = s.exp + s.rook;
    var comm = clamp(P.commOverheadPerHead * (team - 8), 0, 0.3);
    var core = Math.max(0, s.exp - P.mentoringLoad * s.rook) + P.rookieProductivity * s.rook;
    return core * (1 - comm);
  }

  function errorFraction(s, sc, d) {
    var ov = OVERLAP[d.overlap];
    var rookWork = P.rookieProductivity * s.rook;
    var expWork = Math.max(0.01, s.exp - P.mentoringLoad * s.rook);
    var mix = (expWork + rookWork * P.rookieErrorMult) / (expWork + rookWork);
    var qaMult = 1 - 0.8 * (d.qa - 0.15);
    var base = (sc.baseError + ov.errorAdd) * mix * qaMult;
    var fatMult = 1 + P.fatigueErrorHit * s.fatigue;
    return { e: clamp(base * fatMult, 0.02, 0.6), eRested: clamp(base, 0.02, 0.6) };
  }

  function runMonth(s) {
    if (s.finished || s.pendingChoice) return s;
    var sc = findScenario(s.scenarioId);
    var d = s.decisions;
    var ov = OVERLAP[d.overlap];

    // Staffing decision for this month
    if (d.hire > 0) {
      s.pipeline.push({ weeksLeft: P.hiringDelayWeeks, n: d.hire });
      s.cost += d.hire * P.hiringCost;
      s.hiredTotal += d.hire;
    } else if (d.hire < 0) {
      var cut = Math.min(-d.hire, Math.max(0, s.exp + s.rook - 2));
      var fromRook = Math.min(cut, s.rook);
      s.rook -= fromRook;
      s.exp -= cut - fromRook;
      s.released += cut;
      s.cost += cut * P.severanceCost;
    }

    var mo = { overtime: d.overtime, qa: d.qa, overlap: d.overlap, hire: d.hire, found: 0, work: 0, errSum: 0, fatigueErrors: 0, knock: 0, discSum: 0 };

    for (var w = 0; w < WEEKS; w++) {
      // Arrivals from recruitment
      s.pipeline.forEach(function (p) { p.weeksLeft -= 1; });
      s.pipeline = s.pipeline.filter(function (p) {
        if (p.weeksLeft <= 0) { s.rook += p.n; return false; }
        return true;
      });

      var shock = 1;
      if (s.prodShock.weeks > 0) { shock = s.prodShock.factor; s.prodShock.weeks -= 1; }

      var hours = 1 + d.overtime;
      var fatigueMult = 1 - P.fatigueProductivityHit * s.fatigue;
      var capacity = effectiveStaff(s) * hours * fatigueMult * ov.speed * shock * sc.productivity;
      var devCapacity = capacity * (1 - P.qaCapacityShare * d.qa);
      var ef = errorFraction(s, sc, d);
      // Reviews catch part of the errors at once; fixing those is cheap
      var caught = 1 - Math.exp(-P.reviewCatch * d.qa);
      var work = Math.min(s.todo, devCapacity / (1 + ef.e * caught * P.reviewFixCost));
      var flawed = work * ef.e * (1 - caught);
      s.todo -= work;
      s.correct += work - flawed;
      s.undisc += flawed;

      // Rework discovery: testing effort and progress both speed it up
      var reported = (s.correct + s.undisc) / s.scope;
      var disc = sc.discoveryWeeks * Math.pow(0.15 / d.qa, 0.7) / (1 + 1.5 * Math.pow(reported, 3));
      if (s.todo < 0.02 * s.scope) disc = Math.min(disc, P.finalTestWeeks);
      var found = s.undisc / Math.max(1, disc);
      s.undisc -= found;
      s.todo += found;
      // Knock-on rework: overlapping phases built on flawed work. Flaws found
      // late have more finished work resting on them, so they cost more.
      var knock = Math.min(s.correct, found * ov.knock * (0.4 + 1.6 * reported));
      s.correct -= knock;
      s.todo += knock;

      // Fatigue
      var target = clamp(d.overtime / 0.3 * 0.9, 0, 1);
      var tau = target > s.fatigue ? P.fatigueRiseWeeks : P.fatigueRecoverWeeks;
      s.fatigue += (target - s.fatigue) / tau;

      // Attrition and assimilation
      var quitRate = P.baseQuitPerWeek + P.fatigueQuitPerWeek * s.fatigue * s.fatigue;
      var leaving = s.exp * quitRate;
      s.exp -= leaving;
      s.quits += leaving;
      var learned = s.rook / P.assimilationWeeks;
      s.rook -= learned;
      s.exp += learned;

      // Cost
      var heads = s.exp + s.rook;
      s.cost += heads * (sc.costPerFte / WEEKS) * (1 + P.overtimePremium * d.overtime);

      mo.work += work;
      mo.errSum += flawed;
      mo.fatigueErrors += work * (ef.e - ef.eRested) * (1 - caught);
      mo.found += found;
      mo.knock += knock;
      mo.discSum += disc;
      s.sum.work += work;
      s.sum.errors += flawed;
      s.sum.fatigueErrors += work * (ef.e - ef.eRested) * (1 - caught);
      s.sum.knock += knock;
      s.sum.found += found;
      s.sum.discWeeks += disc;
      s.sum.weeks += 1;

      if (s.todo < 0.002 * s.scope && s.undisc < P.doneShareOfScope * s.scope) {
        s.todo = 0;
        break;
      }
    }

    s.month += 1;
    mo.err = mo.work > 0 ? mo.errSum / mo.work : errorFraction(s, sc, d).e;
    mo.discWeeks = mo.discSum / WEEKS;

    // Sponsor mood follows reported progress against plan
    var planned = Math.min(1, s.month / s.deadline);
    var rep = (s.correct + s.undisc) / s.scope;
    if (planned - rep > 0.1) s.stake = clamp(s.stake - 2, 0, 100);
    else if (rep >= planned) s.stake = clamp(s.stake + 1, 0, 100);
    if (s.month > s.deadline) s.stake = clamp(s.stake - 5, 0, 100);

    s.history.push(snapshotRow(s, sc, mo));
    s.decisions.hire = 0;

    if (s.todo <= 0.002 * s.scope && s.undisc < P.doneShareOfScope * s.scope) {
      finish(s, "complete");
    } else if (s.month >= Math.ceil(s.deadline * 1.75)) {
      finish(s, "cancelled");
    } else {
      enterMonth(s);
    }
    return s;
  }

  function canRelease(s) {
    return !s.finished && (s.correct + s.undisc) / s.scope >= 0.9;
  }

  function release(s) {
    if (!canRelease(s)) return;
    finish(s, "released");
  }

  function finish(s, outcome) {
    s.finished = true;
    s.outcome = outcome;
    s.finishMonth = s.month;
    s.escaped = outcome === "complete" ? s.undisc : s.undisc + s.todo;
    s.pendingChoice = null;
  }

  /* ---------- Scoring ---------- */

  function scores(s) {
    var sc = findScenario(s.scenarioId);
    var late = Math.max(0, s.finishMonth - s.deadline);
    var schedule = s.outcome === "cancelled" ? 0 : clamp(100 - 20 * late, 0, 100);

    var overPct = Math.max(0, (s.cost - s.budget) / s.budget * 100);
    var budget = clamp(100 - 3 * overPct, 0, 100);
    if (s.outcome === "cancelled") budget = Math.min(budget, 20); // money spent, nothing delivered

    var fpy = s.sum.work > 0 ? 1 - s.sum.errors / s.sum.work : 1 - sc.baseError;
    var fpyScore = clamp((fpy - 0.65) / (0.9 - 0.65) * 100, 0, 100);
    var escShare = s.escaped / s.scope;
    var escScore = clamp(100 - escShare * 1000, 0, 100);
    var quality = s.outcome === "cancelled" ? Math.min(30, 0.4 * fpyScore) : 0.6 * escScore + 0.4 * fpyScore;

    var stakeEnd = s.stake;
    if (s.outcome === "complete" || s.outcome === "released") {
      if (late === 0) stakeEnd += 8;
      if (s.outcome === "released") stakeEnd -= escShare * 300;
    } else {
      stakeEnd -= 30;
    }
    var stakeholders = clamp(stakeEnd, 0, 100);

    var avgFat = s.history.reduce(function (a, h) { return a + h.fatigue; }, 0) / Math.max(1, s.history.length);
    var team = clamp(100 - avgFat * 70 - s.quits * 3 - s.released * 4, 0, 100);

    var overall = 0.3 * schedule + 0.2 * budget + 0.2 * quality + 0.15 * stakeholders + 0.15 * team;
    return {
      overall: Math.round(overall),
      parts: [
        { id: "schedule", label: "Schedule", value: Math.round(schedule), note: late > 0 ? late + (late === 1 ? " month late" : " months late") : "On time" },
        { id: "budget", label: "Budget", value: Math.round(budget), note: overPct > 0 ? Math.round(overPct) + "% over budget" : "Within budget" },
        { id: "quality", label: "Quality", value: Math.round(quality), note: Math.round(fpy * 100) + "% right first time" },
        { id: "stakeholders", label: "Stakeholders", value: Math.round(stakeholders), note: stakeNote(stakeholders) },
        { id: "team", label: "Team health", value: Math.round(team), note: Math.round(s.quits) + " resigned, " + s.released + " released" }
      ],
      rank: rankFor(overall),
      fpy: fpy,
      late: late,
      overPct: overPct,
      escaped: s.escaped
    };
  }

  function stakeNote(v) {
    if (v >= 80) return "Sponsor delighted";
    if (v >= 60) return "Sponsor satisfied";
    if (v >= 40) return "Sponsor uneasy";
    return "Sponsor lost trust";
  }

  function rankFor(v) {
    if (v >= 85) return { title: "Systems Thinker", text: "You read the hidden dynamics and steered with them, not against them." };
    if (v >= 70) return { title: "Steady Hand", text: "A solid delivery. A few feedback loops still caught you out." };
    if (v >= 55) return { title: "Firefighter", text: "You kept the project alive, mostly by reacting to fires your earlier choices helped start." };
    if (v >= 40) return { title: "Overrun Survivor", text: "The project limped home. The debrief shows where the trouble began." };
    return { title: "Hard Lessons", text: "This one got away. Most first attempts do. Read the debrief and try again." };
  }

  /* ---------- Debrief insights ---------- */

  function pct(x) { return Math.round(x * 100) + "%"; }
  function round(x) { return Math.round(x); }

  function insights(s) {
    var sc = findScenario(s.scenarioId);
    var h = s.history.slice(1);
    var out = [];
    var unit = sc.unit;

    // 1. Sustained overtime
    var best = null, start = null;
    h.forEach(function (r, i) {
      if (r.overtime >= 0.2) {
        if (start === null) start = i;
        var len = i - start + 1;
        if (!best || len > best.len) best = { a: start, b: i, len: len };
      } else start = null;
    });
    if (best && best.len >= 3) {
      var seg = h.slice(best.a, best.b + 1);
      var peakFat = Math.max.apply(null, seg.map(function (r) { return r.fatigue; }));
      var errBefore = best.a > 0 ? h[best.a - 1].err : h[0].err;
      var errPeak = Math.max.apply(null, seg.map(function (r) { return r.err; }));
      var extra = h.slice(best.a).reduce(function (a, r) { return a + r.fatigueErrors; }, 0);
      out.push({
        tone: "warn",
        title: "Overtime turned into hidden rework",
        text: "Overtime of 20% or more in months " + h[best.a].m + " to " + h[best.b].m + " pushed team fatigue to " + pct(peakFat) +
          ". The error rate climbed from " + pct(errBefore) + " to " + pct(errPeak) + ", adding about " + round(extra) + " " + unit +
          " of flawed work that had to be found and redone later. Tired people produce more hours, but not more finished work."
      });
    } else if (h.some(function (r) { return r.overtime > 0; }) && s.sum.fatigueErrors < 0.01 * s.scope) {
      out.push({
        tone: "good",
        title: "Overtime used in short bursts",
        text: "You used overtime without letting fatigue build up. Short pushes followed by recovery gave you the extra hours without the extra errors."
      });
    }

    // 2. The ninety percent syndrome
    var gapRow = null;
    h.forEach(function (r) { if (!gapRow || r.reported - r.truth > gapRow.reported - gapRow.truth) gapRow = r; });
    if (gapRow && gapRow.reported - gapRow.truth > 0.04) {
      out.push({
        tone: "info",
        title: "Reports ran ahead of reality",
        text: "In month " + gapRow.m + " the status report said " + pct(gapRow.reported) + " complete, but only " + pct(gapRow.truth) +
          " was truly finished. The difference was undiscovered rework: work everyone believed was done. This is why so many projects sit at \"90% done\" for months."
      });
    }

    // 3. Hiring and Brooks' law
    var late = h.filter(function (r) { return r.hire > 0 && r.m > 0.6 * s.deadline; });
    var lateHires = late.reduce(function (a, r) { return a + r.hire; }, 0);
    var early = h.filter(function (r) { return r.hire > 0 && r.m <= 2; }).reduce(function (a, r) { return a + r.hire; }, 0);
    if (lateHires >= 4) {
      out.push({
        tone: "warn",
        title: "Late hiring slowed the team down",
        text: "You added " + lateHires + " people from month " + late[0].m + " onward. Recruits arrive a month later, work at reduced pace while learning, and pull experienced people into mentoring. Adding people late to a late project tends to make it later (Brooks, 1975)."
      });
    } else if (early >= 3) {
      out.push({
        tone: "good",
        title: "You staffed up early",
        text: "Hiring " + early + " people in the first two months gave new staff time to become productive before the crunch. Early staffing is one of the strongest moves in this model."
      });
    }

    // 4. Testing effort
    var avgQa = h.reduce(function (a, r) { return a + r.qa; }, 0) / Math.max(1, h.length);
    var avgDisc = s.sum.discWeeks / Math.max(1, s.sum.weeks);
    if (avgQa < 0.1) {
      out.push({
        tone: "warn",
        title: "Thin testing let defects hide",
        text: "Average testing and review effort was " + pct(avgQa) + ". Flaws then took about " + avgDisc.toFixed(1) +
          " weeks on average to surface, so they piled up quietly and arrived together near the end, when they cost the most to fix."
      });
    } else if (avgQa >= 0.2) {
      out.push({
        tone: "good",
        title: "Testing kept the surprises small",
        text: "With " + pct(avgQa) + " of effort on reviews and testing, flaws surfaced in about " + avgDisc.toFixed(1) +
          " weeks on average. You paid in speed early and gained it back by avoiding a late wave of rework."
      });
    }

    // 5. Phase overlap
    var highMonths = h.filter(function (r) { return r.overlap === "high"; }).length;
    if (highMonths >= 3 && s.sum.knock > 0.02 * s.scope) {
      out.push({
        tone: "warn",
        title: "Fast-tracking multiplied the rework",
        text: "Running phases in parallel for " + highMonths + " months sped up early progress, but when upstream flaws were found, about " + round(s.sum.knock) + " " + unit +
          " of finished downstream work had to be redone with them."
      });
    }

    // 6. Change requests
    s.crLog.forEach(function (c) {
      if (c.choice === "accept") {
        out.push({
          tone: "info",
          title: "Extra scope without extra time",
          text: "In month " + c.m + " you accepted " + c.tasks + " more " + unit + " without asking for more time. The client was pleased in the moment, but the deadline did not move while the work did."
        });
      } else if (c.choice === "negotiate") {
        out.push({
          tone: "good",
          title: "You negotiated the change",
          text: "In month " + c.m + " you took on the new scope and secured " + c.extension + (c.extension === 1 ? " month" : " months") + " and extra budget for it. A short, uncomfortable talk early beats a long, painful one at the end."
        });
      }
    });

    // 7. Early release
    if (s.outcome === "released" && s.escaped > 0.01 * s.scope) {
      out.push({
        tone: "warn",
        title: "Shipped with defects inside",
        text: "You released in month " + s.finishMonth + " with about " + round(s.escaped) + " " + unit + " still flawed or unfinished. The date looked good. The client will find the rest."
      });
    }

    if (s.released > 0) {
      out.push({
        tone: "info",
        title: "Releasing staff",
        text: "You released " + s.released + " people. It cut monthly cost, but each exit costs severance and lowers the morale of those who stay."
      });
    }

    if (s.outcome === "cancelled") {
      out.unshift({
        tone: "warn",
        title: "The sponsor pulled the plug",
        text: "By month " + s.finishMonth + " the project was still not delivered, and the sponsor cancelled it. Look at the reported versus true progress chart to see when the hidden rework began to pile up."
      });
    }

    return out.slice(0, 6);
  }

  /* A naive forecast, the kind a team lead might give: remaining reported work divided by recent reported pace. */
  function naiveForecast(s) {
    var h = s.history;
    if (h.length < 2) return null;
    var last = h[h.length - 1];
    var prev = h[Math.max(0, h.length - 3)];
    var months = Math.max(1, last.m - prev.m);
    var pace = (last.reported - prev.reported) / months;
    if (pace <= 0.002) return null;
    return last.m + (1 - last.reported) / pace;
  }

  var api = {
    P: P,
    OVERLAP: OVERLAP,
    RESPONSES: RESPONSES,
    findScenario: findScenario,
    newGame: newGame,
    setDecisions: setDecisions,
    respond: respond,
    runMonth: runMonth,
    canRelease: canRelease,
    release: release,
    scores: scores,
    insights: insights,
    naiveForecast: naiveForecast,
    effectiveStaff: effectiveStaff
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DDEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
