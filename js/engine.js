/*
 * Deadline Dynamics: simulation engine
 * (c) Rajan Kumar V K. All rights reserved.
 *
 * A system dynamics model of a project, integrated in weekly steps with
 * monthly management decisions. The structure follows the rework cycle
 * and project dynamics literature (Cooper, 1980; Abdel-Hamid & Madnick,
 * 1991; Ford & Sterman, 1998; Lyneis & Ford, 2007), written from scratch.
 *
 * Work stocks: work to do, work done correctly, undiscovered rework.
 * People: a roster of named individuals (experienced, new, contractors),
 * with recruitment delay, learning, leave and resignations.
 * The model is deterministic, so the same decisions always give the same
 * result and players can compare strategies fairly.
 */
(function (root) {
  "use strict";

  var WEEKS = 4;

  var P = {
    rookieProductivity: 0.4, // a new hire works at 40% of an experienced person
    contractorProductivity: 0.85,
    mentoringLoad: 0.25, // each new hire takes 25% of an experienced person's time
    rookieErrorMult: 1.8, // new hires make more mistakes
    contractorErrorMult: 1.2,
    assimilationWeeks: 12, // time for a new hire to become experienced
    hiringDelayWeeks: 5, // recruitment lead time: hires start at the beginning of next month
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
    doneShareOfScope: 0.005,
    burnoutFatigue: 0.35 // a resignation above this fatigue counts as burnout
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

  var NAMES = [
    "Aino Korhonen", "Bikash Thapa", "Priya Raman", "Lucas Meyer", "Elena Rossi", "Omar Haddad",
    "Mei Chen", "Juho Nieminen", "Sanna Makela", "Tomas Garcia", "Fatima Noor", "Jonas Berg",
    "Sita Gurung", "Arjun Mehta", "Nora Lind", "Pekka Salo", "Anna Novak", "David Okafor",
    "Hanna Koski", "Ravi Shrestha", "Sofia Almeida", "Erik Holm", "Yuki Tanaka", "Leila Karimi",
    "Marco Bianchi", "Ines Duarte", "Kofi Mensah", "Maya Sharma", "Ville Heikkinen", "Emma Larsson",
    "Nikhil Rao", "Julia Weber", "Samir Khan", "Tiina Aalto", "Oskar Nilsson", "Lin Wei",
    "Ana Petrova", "Kalle Jokinen", "Grace Mwangi", "Mateo Silva", "Riya Kapoor", "Henrik Dahl",
    "Asha Pandey", "Felix Wagner", "Noor Aziz", "Lotta Hakala", "Diego Ramos", "Sara Lindqvist"
  ];

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function findScenario(id) {
    var list = root.DDScenarios.SCENARIOS;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- People ---------- */

  function newPerson(s, sc, kind, status, extra) {
    var id = s.nextId++;
    var offset = { software: 0, factory: 11, construction: 23, twin: 35 }[sc.id] || 0;
    var name = NAMES[(id + offset) % NAMES.length];
    if (id >= NAMES.length) name += " " + String.fromCharCode(65 + Math.floor(id / NAMES.length));
    var p = {
      id: id,
      name: name,
      role: kind === "contractor" ? "Contractor" : sc.roles[id % sc.roles.length],
      kind: kind, // senior | new | contractor
      status: status, // active | arriving | leave | left | released | ended
      weeks: kind === "new" ? 0 : 52,
      resilience: 0.8 + ((id * 37) % 41) / 100,
      wait: 0, // weeks until arrival, return from leave, or contract end
      rest: 0, // energy boost after leave
      joined: s.month + 1,
      left: null,
      reason: ""
    };
    if (extra) for (var k in extra) p[k] = extra[k];
    s.team.push(p);
    return p;
  }

  function activeOf(s, kind) {
    return s.team.filter(function (p) { return p.status === "active" && (!kind || p.kind === kind); });
  }

  function personEnergy(s, p) {
    return clamp(1 - s.fatigue * (2 - p.resilience) + p.rest, 0, 1);
  }

  function sync(s) {
    s.exp = activeOf(s, "senior").length;
    s.rook = activeOf(s, "new").length;
    s.contr = activeOf(s, "contractor").length;
  }

  function payroll(s) {
    return s.team.filter(function (p) {
      return p.kind !== "contractor" && (p.status === "active" || p.status === "leave");
    }).length;
  }

  /* ---------- Game setup ---------- */

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
      team: [],
      nextId: 0,
      exp: 0, rook: 0, contr: 0,
      quitAcc: 0,
      fatigue: 0,
      cost: 0,
      stake: 70,
      quits: 0,
      burnoutQuits: 0,
      released: 0,
      hiredTotal: 0,
      mods: [],
      trustDebt: 0,
      honest: 0,
      minEnergy: 1,
      decisions: { hire: 0, overtime: 0, qa: 0.15, overlap: "medium" },
      card: null,
      cardLog: [],
      log: [],
      history: [],
      crLog: [],
      report: null,
      finished: false,
      outcome: null,
      finishMonth: null,
      escaped: 0,
      sum: { work: 0, errors: 0, fatigueErrors: 0, knock: 0, found: 0, caught: 0, discWeeks: 0, weeks: 0 }
    };
    for (var i = 0; i < sc.experienced; i++) newPerson(s, sc, "senior", "active", { joined: 0 });
    for (var j = 0; j < sc.rookies; j++) newPerson(s, sc, "new", "active", { joined: 0, weeks: 4 });
    sync(s);
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
      contr: s.contr,
      staff: s.exp + s.rook + s.contr,
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
      caught: mo ? mo.caught : 0,
      flawed: mo ? mo.errSum : 0,
      fatigueErrors: mo ? mo.fatigueErrors : 0,
      knock: mo ? mo.knock : 0,
      discWeeks: mo ? mo.discWeeks : sc.discoveryWeeks,
      stake: s.stake,
      todo: s.todo,
      undisc: s.undisc,
      scope: s.scope
    };
  }

  /* ---------- Monthly events and decision cards ---------- */

  function fill(text, ctx) {
    return String(text).replace(/\{(\w+)\}/g, function (m, k) { return ctx[k] != null ? ctx[k] : m; });
  }

  function cardContext(s, sc) {
    var act = activeOf(s).filter(function (p) { return p.kind !== "contractor"; });
    var seniors = act.filter(function (p) { return p.kind === "senior"; });
    var tired = act.slice().sort(function (a, b) { return personEnergy(s, a) - personEnergy(s, b) || a.id - b.id; })[0];
    var lead = seniors.length ? seniors[0] : act[0];
    var a = act[(s.month * 3) % Math.max(1, act.length)];
    var b = act[(s.month * 3 + 2) % Math.max(1, act.length)];
    if (a && b && a.id === b.id && act.length > 1) b = act[(act.indexOf(a) + 1) % act.length];
    return {
      client: sc.client,
      unit: sc.unit,
      lead: lead ? lead.name : "Your lead",
      tired: tired ? tired.name : "A team member",
      tiredId: tired ? tired.id : null,
      a: a ? a.name : "Two people",
      b: b ? b.name : "another colleague"
    };
  }

  function enterMonth(s) {
    var sc = findScenario(s.scenarioId);
    var m = s.month + 1;
    var change = null;
    sc.events.forEach(function (ev, idx) {
      if (ev.month !== m) return;
      if (ev.type === "change") {
        change = { ev: ev, idx: idx };
      } else if (ev.type === "quit") {
        var seniors = activeOf(s, "senior");
        var n = Math.min(ev.count, Math.max(0, seniors.length - 1));
        var names = [];
        for (var i = 0; i < n; i++) {
          var p = seniors[i];
          p.status = "left"; p.left = m; p.reason = "Left for another job";
          names.push(p.name);
          s.quits += 1;
        }
        s.log.push({ m: m, kind: "bad", title: ev.title, text: ev.text + (names.length ? " Leaving: " + names.join(" and ") + "." : "") });
      } else if (ev.type === "supplier") {
        s.mods.push({ kind: "prod", factor: ev.factor, weeks: ev.weeks });
        s.log.push({ m: m, kind: "bad", title: ev.title, text: ev.text });
      } else if (ev.type === "rework") {
        var moved = s.correct * ev.share;
        s.correct -= moved;
        s.undisc += moved;
        s.log.push({ m: m, kind: "bad", title: ev.title, text: ev.text });
      }
    });
    sync(s);

    if (change) {
      var ev = change.ev;
      s.card = {
        type: "change",
        month: m,
        title: (function (x) { return x.charAt(0).toUpperCase() + x.slice(1); })(ev.title.replace(/^Change request: /, "")),
        text: ev.text,
        tag: "Change request",
        options: [
          { id: "accept", label: RESPONSES.accept.label, detail: "+" + ev.tasks + " " + sc.unit + " and +€" + ev.budgetAdd + "k budget. The deadline stays where it is. The client is delighted." },
          { id: "negotiate", label: RESPONSES.negotiate.label, detail: "+" + ev.tasks + " " + sc.unit + ", +€" + ev.budgetAdd + "k budget, and the deadline moves " + ev.extension + (ev.extension === 1 ? " month" : " months") + " later. The client agrees, a little grudgingly." },
          { id: "defer", label: RESPONSES.defer.label, detail: "Nothing changes in this project. The client is disappointed." },
          { id: "reject", label: RESPONSES.reject.label, detail: "Nothing changes. The client is unhappy and will remember it." }
        ],
        eventIdx: change.idx
      };
      s.log.push({ m: m, kind: "change", title: ev.title, text: ev.text });
      return;
    }

    var cardId = sc.cards && sc.cards[m];
    var C = root.DDCards && root.DDCards.CARDS;
    if (!cardId || !C || !C[cardId]) { s.card = null; return; }
    if (cardId === "training" && s.rook === 0) cardId = "celebrate";
    var def = C[cardId];
    var ctx = cardContext(s, sc);
    s.card = {
      type: "dilemma",
      id: cardId,
      month: m,
      title: fill(def.title, ctx),
      text: fill(def.text, ctx),
      tag: "Decision",
      tiredId: ctx.tiredId,
      ctx: ctx,
      options: def.options.map(function (o, i) {
        return { id: String(i), label: fill(o.label, ctx), detail: fill(o.detail || "", ctx) };
      })
    };
  }

  function applyEffects(s, sc, eff, card) {
    if (!eff) return;
    if (eff.stake) s.stake = clamp(s.stake + eff.stake, 0, 100);
    if (eff.fatigue) s.fatigue = clamp(s.fatigue + eff.fatigue, 0, 1);
    if (eff.cost) s.cost += eff.cost;
    if (eff.trainCost) s.cost += eff.trainCost * s.rook;
    if (eff.prod) s.mods.push({ kind: "prod", factor: eff.prod.factor, weeks: eff.prod.weeks });
    if (eff.err) s.mods.push({ kind: "err", factor: eff.err.factor, weeks: eff.err.weeks });
    if (eff.disc) s.mods.push({ kind: "disc", factor: eff.disc.factor, weeks: eff.disc.weeks });
    if (eff.reveal) {
      var r = s.undisc * eff.reveal;
      s.undisc -= r;
      s.todo += r;
      s.pendingFound = (s.pendingFound || 0) + r;
    }
    if (eff.contractors) {
      for (var i = 0; i < eff.contractors.n; i++) {
        newPerson(s, sc, "contractor", "active", { wait: eff.contractors.weeks, rate: eff.contractors.rate });
      }
    }
    if (eff.leave && card && card.tiredId != null) {
      var p = s.team.filter(function (x) { return x.id === card.tiredId; })[0];
      if (p && p.status === "active") { p.status = "leave"; p.wait = eff.leave.weeks; }
    }
    if (eff.quitRisk) s.quitAcc += 0.25 + 1.4 * s.fatigue;
    if (eff.scopeCut) {
      var cut = Math.min(s.todo * eff.scopeCut * 2, s.scope * eff.scopeCut, s.todo);
      s.todo -= cut;
      s.scope -= cut;
    }
    if (eff.train) activeOf(s, "new").forEach(function (q) { q.weeks += eff.train; });
    if (eff.trustDebt) s.trustDebt += eff.trustDebt;
    if (eff.honest) s.honest += eff.honest;
    sync(s);
  }

  function respond(s, optionId) {
    if (!s.card) return;
    var sc = findScenario(s.scenarioId);
    var card = s.card;
    var note = "";
    var label = "";
    if (card.type === "change") {
      var ev = sc.events[card.eventIdx];
      var r = RESPONSES[optionId];
      if (!r) return;
      if (optionId === "accept" || optionId === "negotiate") {
        s.scope += ev.tasks;
        s.todo += ev.tasks;
        s.budget += ev.budgetAdd;
      }
      if (optionId === "negotiate") s.deadline += ev.extension;
      s.stake = clamp(s.stake + r.stake, 0, 100);
      s.crLog.push({ m: card.month, title: ev.title, choice: optionId, tasks: ev.tasks, extension: ev.extension });
      label = r.label;
      note = "";
    } else {
      var def = root.DDCards.CARDS[card.id];
      var idx = Number(optionId);
      var opt = def.options[idx];
      if (!opt) return;
      applyEffects(s, sc, opt.effects, card);
      label = fill(opt.label, card.ctx);
      note = fill(opt.note || "", card.ctx);
    }
    s.cardLog.push({ m: card.month, id: card.id || "change", title: card.title, choice: label, note: note });
    s.log.push({ m: card.month, kind: "decision", title: card.title, text: "You chose: " + label + "." + (note ? " " + note : "") });
    s.card = null;
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

  /* ---------- Model ---------- */

  function modFactor(s, kind) {
    var f = 1;
    s.mods.forEach(function (m) { if (m.kind === kind && m.weeks > 0) f *= m.factor; });
    return f;
  }

  function effectiveStaff(s) {
    var team = s.exp + s.rook + s.contr;
    var comm = clamp(P.commOverheadPerHead * (team - 8), 0, 0.3);
    var core = Math.max(0, s.exp - P.mentoringLoad * s.rook) + P.rookieProductivity * s.rook + P.contractorProductivity * s.contr;
    return core * (1 - comm);
  }

  function errorFraction(s, sc, d) {
    var ov = OVERLAP[d.overlap];
    var rookWork = P.rookieProductivity * s.rook;
    var expWork = Math.max(0.01, s.exp - P.mentoringLoad * s.rook);
    var conWork = P.contractorProductivity * s.contr;
    var mix = (expWork + rookWork * P.rookieErrorMult + conWork * P.contractorErrorMult) / (expWork + rookWork + conWork);
    var qaMult = 1 - 0.8 * (d.qa - 0.15);
    var base = (sc.baseError + ov.errorAdd) * mix * qaMult * modFactor(s, "err");
    var fatMult = 1 + P.fatigueErrorHit * s.fatigue;
    return { e: clamp(base * fatMult, 0.02, 0.6), eRested: clamp(base, 0.02, 0.6) };
  }

  function runMonth(s) {
    if (s.finished || s.card) return s;
    var sc = findScenario(s.scenarioId);
    var d = s.decisions;
    var ov = OVERLAP[d.overlap];
    var m = s.month + 1;
    var joined = [], left = [], back = [];
    var costStart = s.cost;
    var repStart = (s.correct + s.undisc) / s.scope;

    // Staffing decision for this month
    if (d.hire > 0) {
      for (var i = 0; i < d.hire; i++) newPerson(s, sc, "new", "arriving", { wait: P.hiringDelayWeeks, joined: m + 1 });
      s.cost += d.hire * P.hiringCost;
      s.hiredTotal += d.hire;
    } else if (d.hire < 0) {
      var pool = s.team.filter(function (p) { return p.status === "active" && p.kind !== "contractor"; });
      var cut = Math.min(-d.hire, Math.max(0, pool.length - 2));
      pool.sort(function (a, b) { return (a.kind === "new" ? 0 : 1) - (b.kind === "new" ? 0 : 1) || b.id - a.id; });
      for (var c = 0; c < cut; c++) {
        pool[c].status = "released"; pool[c].left = m; pool[c].reason = "Released";
        left.push({ name: pool[c].name, reason: "released" });
      }
      s.released += cut;
      s.cost += cut * P.severanceCost;
    }
    sync(s);

    var mo = { overtime: d.overtime, qa: d.qa, overlap: d.overlap, hire: d.hire, found: s.pendingFound || 0, work: 0, errSum: 0, fatigueErrors: 0, knock: 0, discSum: 0, caught: 0, extraWork: 0 };
    s.pendingFound = 0;

    for (var w = 0; w < WEEKS; w++) {
      // Arrivals, returns from leave, contract ends
      s.team.forEach(function (p) {
        if (p.status === "arriving") {
          p.wait -= 1;
          if (p.wait <= 0) { p.status = "active"; joined.push(p.name); }
        } else if (p.status === "leave") {
          p.wait -= 1;
          if (p.wait <= 0) { p.status = "active"; p.rest = 0.3; back.push(p.name); }
        } else if (p.status === "active" && p.kind === "contractor") {
          p.wait -= 1;
          if (p.wait <= 0) { p.status = "ended"; p.left = m; p.reason = "Contract ended"; left.push({ name: p.name, reason: "contract ended" }); }
        }
        if (p.rest > 0) p.rest = Math.max(0, p.rest - 0.05);
      });
      sync(s);

      var prodMod = modFactor(s, "prod");
      var discMod = modFactor(s, "disc");
      var hours = 1 + d.overtime;
      var fatigueMult = 1 - P.fatigueProductivityHit * s.fatigue;
      var capacity = effectiveStaff(s) * hours * fatigueMult * ov.speed * prodMod * sc.productivity;
      var devCapacity = capacity * (1 - P.qaCapacityShare * d.qa);
      var ef = errorFraction(s, sc, d);
      var caughtShare = 1 - Math.exp(-P.reviewCatch * d.qa);
      var work = Math.min(s.todo, devCapacity / (1 + ef.e * caughtShare * P.reviewFixCost));
      var flawed = work * ef.e * (1 - caughtShare);
      s.todo -= work;
      s.correct += work - flawed;
      s.undisc += flawed;

      var reported = (s.correct + s.undisc) / s.scope;
      var disc = sc.discoveryWeeks * Math.pow(0.15 / d.qa, 0.7) * discMod / (1 + 1.5 * Math.pow(reported, 3));
      if (s.todo < 0.02 * s.scope) disc = Math.min(disc, P.finalTestWeeks);
      var found = s.undisc / Math.max(1, disc);
      s.undisc -= found;
      s.todo += found;
      var knock = Math.min(s.correct, found * ov.knock * (0.4 + 1.6 * reported));
      s.correct -= knock;
      s.todo += knock;

      // Fatigue
      var target = clamp(d.overtime / 0.3 * 0.9, 0, 1);
      var tau = target > s.fatigue ? P.fatigueRiseWeeks : P.fatigueRecoverWeeks;
      s.fatigue += (target - s.fatigue) / tau;

      // Resignations: the person with the least energy goes first
      var perm = s.team.filter(function (p) { return p.status === "active" && p.kind !== "contractor"; });
      var quitRate = P.baseQuitPerWeek + P.fatigueQuitPerWeek * s.fatigue * s.fatigue;
      s.quitAcc += perm.length * quitRate;
      while (s.quitAcc >= 1 && perm.length > 2) {
        perm.sort(function (a, b) { return personEnergy(s, a) - personEnergy(s, b) || a.id - b.id; });
        var q = perm.shift();
        var burnout = s.fatigue > P.burnoutFatigue;
        q.status = "left"; q.left = m; q.reason = burnout ? "Resigned, exhausted" : "Left for another job";
        left.push({ name: q.name, reason: burnout ? "resigned, exhausted" : "left for another job" });
        s.quits += 1;
        if (burnout) s.burnoutQuits += 1;
        s.quitAcc -= 1;
      }

      // Learning: new hires become experienced
      s.team.forEach(function (p) {
        if (p.status === "active" && p.kind === "new") {
          p.weeks += 1;
          if (p.weeks >= P.assimilationWeeks) p.kind = "senior";
        }
      });
      sync(s);

      // Cost
      s.cost += payroll(s) * (sc.costPerFte / WEEKS) * (1 + P.overtimePremium * d.overtime);
      s.team.forEach(function (p) {
        if (p.status === "active" && p.kind === "contractor") s.cost += (sc.costPerFte / WEEKS) * (p.rate || 1.6);
      });

      // Modifiers wear off
      s.mods.forEach(function (md) { md.weeks -= 1; });
      s.mods = s.mods.filter(function (md) { return md.weeks > 0; });

      var minE = activeOf(s).reduce(function (a, p) { return Math.min(a, personEnergy(s, p)); }, 1);
      s.minEnergy = Math.min(s.minEnergy, minE);

      mo.work += work;
      mo.errSum += flawed;
      mo.caught += work * ef.e * caughtShare;
      mo.fatigueErrors += work * (ef.e - ef.eRested) * (1 - caughtShare);
      mo.extraWork += work * (d.overtime / hours);
      mo.found += found;
      mo.knock += knock;
      mo.discSum += disc;
      s.sum.work += work;
      s.sum.errors += flawed;
      s.sum.caught += work * ef.e * caughtShare;
      s.sum.fatigueErrors += work * (ef.e - ef.eRested) * (1 - caughtShare);
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

    var planned = Math.min(1, s.month / s.deadline);
    var rep = (s.correct + s.undisc) / s.scope;
    if (planned - rep > 0.1) s.stake = clamp(s.stake - 2, 0, 100);
    else if (rep >= planned) s.stake = clamp(s.stake + 1, 0, 100);
    if (s.month > s.deadline) s.stake = clamp(s.stake - 5, 0, 100);

    s.history.push(snapshotRow(s, sc, mo));
    s.decisions.hire = 0;

    s.report = {
      m: s.month,
      work: mo.work,
      netProgress: rep - repStart,
      found: mo.found,
      knock: mo.knock,
      caught: mo.caught,
      flawed: mo.errSum,
      fatigueErrors: mo.fatigueErrors,
      extraWork: mo.extraWork,
      spent: s.cost - costStart,
      joined: joined,
      left: left,
      back: back,
      onLeave: s.team.filter(function (p) { return p.status === "leave"; }).map(function (p) { return p.name; }),
      arriving: s.team.filter(function (p) { return p.status === "arriving"; }).length,
      overtime: d.overtime,
      qa: d.qa,
      overlap: d.overlap,
      tip: coachTip(s, sc, mo)
    };

    if (s.todo <= 0.002 * s.scope && s.undisc < P.doneShareOfScope * s.scope) {
      finish(s, "complete");
    } else if (s.month >= Math.ceil(s.deadline * 1.75)) {
      finish(s, "cancelled");
    } else {
      enterMonth(s);
    }
    return s;
  }

  function coachTip(s, sc, mo) {
    var h = s.history;
    var last = h[h.length - 1];
    var prev = h.length > 2 ? h[h.length - 2] : null;
    var planned = Math.min(1, s.month / s.deadline);
    var behind = planned - last.reported;
    var arriving = s.team.filter(function (p) { return p.status === "arriving"; }).length;
    if (s.fatigue > 0.4) return "Your team is running on empty. Fatigue raises the error rate, and the flaws come back as rework later. Ease overtime for a month to let people recover.";
    if (behind > 0.06 && s.month <= s.deadline * 0.45 && arriving === 0) return "You are behind plan early on. Hiring now still pays off, because new people need about three months to reach full speed.";
    if (behind > 0.08 && s.month > s.deadline * 0.6) return "You are behind late in the project. New hires would mostly add coaching load now. A short overtime burst, a test week or a scope conversation may help more.";
    if (mo.qa < 0.1) return "Testing is thin. Flaws you do not catch now are not gone; they are waiting. They will return later, when fixing them costs more.";
    if (prev && last.found > prev.found * 1.4 && last.found > 0.02 * s.scope) return "Rework jumped this month. This is hidden work from earlier months coming to light, not new mistakes.";
    if (mo.overlap === "high" && mo.knock > 0.01 * s.scope) return "Running phases in parallel is knocking out finished work whenever an upstream flaw is found. Less overlap would cut that waste.";
    if (s.cost > s.budget * Math.min(1, s.month / s.deadline) * 1.1) return "Spending is running ahead of plan. Check overtime premiums and contractor costs.";
    return "A steady month. Keep watching the defects that come back: they tell you how much of your reported progress is real.";
  }

  function canRelease(s) {
    return !s.finished && !s.card && (s.correct + s.undisc) / s.scope >= 0.9;
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
    s.card = null;
  }

  /* ---------- Objectives (stars) ---------- */

  function objectives(s) {
    var h = s.history, last = h[h.length - 1];
    var planned = Math.min(1, s.month / s.deadline);
    var spendPlan = s.budget * Math.min(1, s.month / s.deadline);
    var energyNow = 1 - s.fatigue;
    var onTime, onBudget, healthy;

    if (s.finished) {
      onTime = s.outcome !== "cancelled" && s.finishMonth <= s.deadline ? "done" : "fail";
      onBudget = s.outcome !== "cancelled" && s.cost <= s.budget ? "done" : "fail";
      healthy = s.burnoutQuits === 0 && s.minEnergy >= 0.5 ? "done" : "fail";
    } else {
      onTime = s.month >= s.deadline ? "fail" : s.month === 0 ? "ok" : planned - last.reported > 0.06 ? "risk" : "ok";
      onBudget = s.cost > s.budget ? "fail" : s.month > 0 && s.cost > spendPlan * 1.06 ? "risk" : "ok";
      healthy = s.burnoutQuits > 0 || s.minEnergy < 0.5 ? "fail" : energyNow < 0.7 ? "risk" : "ok";
    }
    return [
      { id: "time", label: "Deliver by month " + s.deadline, status: onTime },
      { id: "budget", label: "Stay within €" + Math.round(s.budget).toLocaleString("en-US") + "k", status: onBudget },
      { id: "team", label: "No burnout: energy above 50%", status: healthy }
    ];
  }

  /* ---------- Scoring ---------- */

  function scores(s) {
    var sc = findScenario(s.scenarioId);
    var late = Math.max(0, s.finishMonth - s.deadline);
    var schedule = s.outcome === "cancelled" ? 0 : clamp(100 - 20 * late, 0, 100);

    var overPct = Math.max(0, (s.cost - s.budget) / s.budget * 100);
    var budget = clamp(100 - 3 * overPct, 0, 100);
    if (s.outcome === "cancelled") budget = Math.min(budget, 20);

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
    if (late > 0 || s.outcome === "cancelled") stakeEnd -= 6 * s.trustDebt;
    var stakeholders = clamp(stakeEnd, 0, 100);

    var avgFat = s.history.reduce(function (a, h) { return a + h.fatigue; }, 0) / Math.max(1, s.history.length);
    var team = clamp(100 - avgFat * 70 - s.quits * 3 - s.burnoutQuits * 6 - s.released * 4, 0, 100);

    var overall = 0.3 * schedule + 0.2 * budget + 0.2 * quality + 0.15 * stakeholders + 0.15 * team;
    var obj = objectives(s);
    return {
      overall: Math.round(overall),
      stars: obj.filter(function (o) { return o.status === "done"; }).length,
      objectives: obj,
      parts: [
        { id: "schedule", label: "Schedule", value: Math.round(schedule), note: late > 0 ? late + (late === 1 ? " month late" : " months late") : "On time" },
        { id: "budget", label: "Budget", value: Math.round(budget), note: overPct > 0 ? Math.round(overPct) + "% over budget" : "Within budget" },
        { id: "quality", label: "Quality", value: Math.round(quality), note: Math.round(fpy * 100) + "% right first time" },
        { id: "stakeholders", label: "Stakeholders", value: Math.round(stakeholders), note: stakeNote(stakeholders) },
        { id: "team", label: "Team health", value: Math.round(team), note: s.quits + " resigned, " + s.released + " released" }
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
          ". The share of flawed work rose from " + pct(errBefore) + " to " + pct(errPeak) + ", adding about " + round(extra) + " " + unit +
          " that had to be found and redone later. Tired people produce more hours, but not more finished work."
      });
    } else if (h.some(function (r) { return r.overtime > 0; }) && s.sum.fatigueErrors < 0.01 * s.scope) {
      out.push({ tone: "good", title: "Overtime used in short bursts", text: "You used overtime without letting fatigue build up. Short pushes followed by recovery gave you extra hours without the extra errors." });
    }

    if (s.burnoutQuits > 0) {
      var names = s.team.filter(function (p) { return p.reason === "Resigned, exhausted"; }).map(function (p) { return p.name; });
      out.push({ tone: "warn", title: "People burned out", text: names.join(", ") + " resigned while the team was exhausted. Each resignation took experience out of the team just when it was needed most." });
    }

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

    if (s.trustDebt > 0) {
      var lateNow = s.finishMonth > s.deadline || s.outcome === "cancelled";
      out.push({
        tone: lateNow ? "warn" : "info",
        title: lateNow ? "Green reports came back to haunt you" : "You reported green and got away with it",
        text: "You told the steering group the project was green " + s.trustDebt + (s.trustDebt === 1 ? " time" : " times") + ". " +
          (lateNow ? "When the delay became visible, the sponsor felt misled, and trust dropped further than the delay alone would explain." : "This time the project delivered, but optimistic reporting removes the early warnings that let sponsors help.")
      });
    } else if (s.honest > 0) {
      out.push({ tone: "good", title: "You reported honestly", text: "Every status report you gave showed the real picture. Honest amber reports cost a little goodwill at the time, but they keep trust intact when trouble arrives." });
    }

    var late = h.filter(function (r) { return r.hire > 0 && r.m > 0.6 * s.deadline; });
    var lateHires = late.reduce(function (a, r) { return a + r.hire; }, 0);
    var early = h.filter(function (r) { return r.hire > 0 && r.m <= 2; }).reduce(function (a, r) { return a + r.hire; }, 0);
    if (lateHires >= 4) {
      out.push({ tone: "warn", title: "Late hiring slowed the team down", text: "You added " + lateHires + " people from month " + late[0].m + " onward. Recruits arrive a month later, work at reduced pace while learning, and pull experienced people into coaching. Adding people late to a late project tends to make it later (Brooks, 1975)." });
    } else if (early >= 3) {
      out.push({ tone: "good", title: "You staffed up early", text: "Hiring " + early + " people in the first two months gave them time to become productive before the crunch. Early staffing is one of the strongest moves in this model." });
    }

    var avgQa = h.reduce(function (a, r) { return a + r.qa; }, 0) / Math.max(1, h.length);
    var avgDisc = s.sum.discWeeks / Math.max(1, s.sum.weeks);
    if (avgQa < 0.1) {
      out.push({ tone: "warn", title: "Thin testing let defects hide", text: "Average review and testing effort was " + pct(avgQa) + ". Flaws then took about " + avgDisc.toFixed(1) + " weeks on average to surface, so they piled up quietly and arrived together near the end, when they cost the most to fix." });
    } else if (avgQa >= 0.2) {
      out.push({ tone: "good", title: "Testing kept the surprises small", text: "With " + pct(avgQa) + " of effort on reviews and testing, about " + round(s.sum.caught) + " errors were caught at the source and hidden flaws surfaced in about " + avgDisc.toFixed(1) + " weeks on average." });
    }

    var highMonths = h.filter(function (r) { return r.overlap === "high"; }).length;
    if (highMonths >= 3 && s.sum.knock > 0.02 * s.scope) {
      out.push({ tone: "warn", title: "Fast-tracking multiplied the rework", text: "Running phases in parallel for " + highMonths + " months sped up early progress, but when upstream flaws were found, about " + round(s.sum.knock) + " " + unit + " of finished downstream work had to be redone with them." });
    }

    s.crLog.forEach(function (c) {
      if (c.choice === "accept") {
        out.push({ tone: "info", title: "Extra scope without extra time", text: "In month " + c.m + " you accepted " + c.tasks + " more " + unit + " without asking for more time. The client was pleased in the moment, but the deadline did not move while the work did." });
      } else if (c.choice === "negotiate") {
        out.push({ tone: "good", title: "You negotiated the change", text: "In month " + c.m + " you took on the new scope and secured " + c.extension + (c.extension === 1 ? " month" : " months") + " and extra budget for it. A short, uncomfortable talk early beats a long, painful one at the end." });
      }
    });

    if (s.outcome === "released" && s.escaped > 0.01 * s.scope) {
      out.push({ tone: "warn", title: "Shipped with defects inside", text: "You released in month " + s.finishMonth + " with about " + round(s.escaped) + " " + unit + " still flawed or unfinished. The date looked good. The client will find the rest." });
    }

    if (s.outcome === "cancelled") {
      out.unshift({ tone: "warn", title: "The sponsor pulled the plug", text: "By month " + s.finishMonth + " the project was still not delivered, and the sponsor cancelled it. Look at the reported versus truly finished chart to see when the hidden rework began to pile up." });
    }

    return out.slice(0, 7);
  }

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
    objectives: objectives,
    insights: insights,
    naiveForecast: naiveForecast,
    effectiveStaff: effectiveStaff,
    personEnergy: personEnergy
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DDEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
