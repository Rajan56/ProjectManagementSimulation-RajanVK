/*
 * Deadline Dynamics: decision cards
 * (c) Rajan Kumar V K. All rights reserved.
 *
 * One card reaches the project manager most months. Each option carries
 * effects that the engine applies to the model. Tokens in braces are filled
 * in when the card is drawn: {client}, {unit}, {lead}, {tired}, {a}, {b}.
 *
 * Effect keys:
 *   stake      change in stakeholder satisfaction
 *   fatigue    change in team fatigue (0 to 1)
 *   cost       one-off cost in thousand euro
 *   prod       { factor, weeks } temporary productivity multiplier
 *   err        { factor, weeks } error rate multiplier
 *   disc       { factor, weeks } multiplier on the time flaws stay hidden
 *   reveal     share of hidden flaws found at once
 *   contractors { n, weeks, rate } temporary experienced staff
 *   leave      { weeks } the most tired person takes time off
 *   quitRisk   true: raises the chance that the most tired person resigns
 *   scopeCut   share of remaining work dropped with the client's agreement
 *   train      weeks of experience added to every new team member
 *   trustDebt  one more optimistic report on record
 *   honest     one more honest report on record
 */
(function (root) {
  "use strict";

  var CARDS = {
    demo: {
      title: "{client} wants a live demo next week",
      text: "The client's executives want to see real progress. A polished demo would impress them, but it pulls people off the real work for several days.",
      options: [
        { label: "Prepare a polished demo", detail: "Several people stop building for a week to prepare it.", effects: { prod: { factor: 0.75, weeks: 1 }, stake: 6, fatigue: 0.04 }, note: "The polished demo impressed the client, at the price of a slower week." },
        { label: "Show honest work in progress", detail: "Show what exists today, rough edges included.", effects: { stake: 2, reveal: 0.15 }, note: "The client spotted a few problems early, while they were still cheap to fix." },
        { label: "Ask to postpone the demo", detail: "Protect the team's focus.", effects: { stake: -6 }, note: "The client was disappointed that the demo was postponed." }
      ]
    },
    refactor: {
      title: "{lead} wants time to clean up rushed work",
      text: "{lead}, one of your most experienced people, says part of the early work was rushed and keeps causing errors. A clean-up would slow progress for a short while.",
      options: [
        { label: "Approve two weeks of clean-up", detail: "Fix the root cause properly.", effects: { prod: { factor: 0.85, weeks: 2 }, err: { factor: 0.85, weeks: 99 }, reveal: 0.2 }, note: "The clean-up exposed old flaws and lowered the error rate for the rest of the project." },
        { label: "Allow one week", detail: "A partial fix.", effects: { prod: { factor: 0.92, weeks: 1 }, err: { factor: 0.93, weeks: 99 }, reveal: 0.08 }, note: "A short clean-up helped a little." },
        { label: "Refuse: there is no time", detail: "Keep everyone building.", effects: { err: { factor: 1.05, weeks: 99 }, fatigue: 0.03 }, note: "The rushed work stayed in place and keeps producing errors. {lead} was frustrated." }
      ]
    },
    contractors: {
      title: "An agency offers experienced contractors",
      text: "A staffing agency can place experienced contractors with you for two months. They start next week and need no coaching, but cost 60% more than your own people.",
      options: [
        { label: "Take three contractors", detail: "Fast extra capacity at a premium.", effects: { contractors: { n: 3, weeks: 8, rate: 1.6 } }, note: "Three contractors joined for two months." },
        { label: "Take one contractor", detail: "A smaller boost.", effects: { contractors: { n: 1, weeks: 8, rate: 1.6 } }, note: "One contractor joined for two months." },
        { label: "No, thank you", detail: "Keep the budget for your own team.", effects: {}, note: "You declined the contractors." }
      ]
    },
    testweek: {
      title: "QA asks for a full test week",
      text: "Your test lead wants one week in which everyone stops building and checks what has been finished so far, before the next milestone.",
      options: [
        { label: "Grant the test week", detail: "Building stops for a week.", effects: { prod: { factor: 0.35, weeks: 1 }, reveal: 0.4 }, note: "The test week found a large share of the hidden flaws." },
        { label: "Half the team tests for a week", detail: "A compromise.", effects: { prod: { factor: 0.7, weeks: 1 }, reveal: 0.2 }, note: "The partial test week found some hidden flaws." },
        { label: "Skip it and keep building", detail: "Protect the schedule.", effects: {}, note: "You skipped the test week. Hidden flaws stay hidden for now." }
      ]
    },
    status: {
      title: "The steering group wants a status report",
      text: "The sponsor's steering group meets this week. They ask a simple question: is the project on track?",
      options: [
        { label: "Report honestly, risks included", detail: "Show the real picture, even if it looks amber.", effects: { stake: -3, honest: 1 }, note: "The steering group appreciated the candour, if not the news." },
        { label: "Report green to keep confidence", detail: "Stay positive and sort out problems quietly.", effects: { stake: 4, trustDebt: 1 }, note: "The steering group left reassured. Your report is now on record." }
      ]
    },
    burnout: {
      title: "{tired} looks worn out",
      text: "{tired} has been carrying a heavy load and looks exhausted. Teammates are starting to worry.",
      options: [
        { label: "Give two weeks off", detail: "{tired} rests and comes back fresh.", effects: { leave: { weeks: 2 }, fatigue: -0.03 }, note: "{tired} took two weeks off. The team noticed you cared." },
        { label: "Lighter tasks for a month", detail: "Keep {tired} working, at a gentler pace.", effects: { prod: { factor: 0.96, weeks: 4 }, fatigue: -0.02 }, note: "{tired} moved to lighter tasks for a month." },
        { label: "Ask them to push through", detail: "The deadline comes first.", effects: { quitRisk: true }, note: "You asked {tired} to push through." }
      ]
    },
    automation: {
      title: "Invest in automated quality checks?",
      text: "A vendor offers automated checking tools for about €40k. Setting them up takes some effort, but flaws would surface much faster from then on.",
      options: [
        { label: "Invest €40k", detail: "Pay now, find flaws sooner for the rest of the project.", effects: { cost: 40, disc: { factor: 0.65, weeks: 99 }, prod: { factor: 0.9, weeks: 2 } }, note: "The automated checks are running." },
        { label: "Not now", detail: "Keep the money.", effects: {}, note: "You decided against automation for now." }
      ]
    },
    conflict: {
      title: "{a} and {b} clash",
      text: "{a} and {b} disagree sharply about how the work should be done. The tension is spreading to the rest of the team.",
      options: [
        { label: "Run a short mediation workshop", detail: "Half a day for the whole team.", effects: { prod: { factor: 0.92, weeks: 1 }, err: { factor: 0.96, weeks: 99 } }, note: "The workshop cleared the air and agreed on shared working rules." },
        { label: "Let them sort it out", detail: "Adults can handle this.", effects: { prod: { factor: 0.95, weeks: 6 }, err: { factor: 1.06, weeks: 6 } }, note: "The conflict simmered on for several weeks." }
      ]
    },
    scopecut: {
      title: "Trim the 'nice to have' items?",
      text: "Your analysis shows that about 5% of the remaining {unit} add little value. {client} might agree to drop them if you ask.",
      options: [
        { label: "Propose dropping them", detail: "A frank conversation about value.", effects: { scopeCut: 0.05, stake: -4 }, note: "{client} agreed, reluctantly, to drop the low-value items." },
        { label: "Keep the full scope", detail: "Deliver everything that was promised.", effects: {}, note: "You kept the full scope." }
      ]
    },
    training: {
      title: "Training for your newer staff",
      text: "A two-day course would help your newer people get up to speed faster. It costs about €2k per person and two days away from the work.",
      options: [
        { label: "Send the new staff", detail: "Short pain, faster learning.", effects: { trainCost: 2, prod: { factor: 0.95, weeks: 1 }, train: 4 }, note: "Your newer staff completed the course." },
        { label: "Skip it", detail: "They will learn on the job.", effects: {}, note: "You skipped the training." }
      ]
    },
    celebrate: {
      title: "A milestone is behind you",
      text: "The team has just passed a major milestone. Some people suggest an evening together to celebrate.",
      options: [
        { label: "Hold a team event (€8k)", detail: "A proper thank-you.", effects: { cost: 8, fatigue: -0.08 }, note: "The team event lifted spirits." },
        { label: "Send a personal thank-you note", detail: "Small, but sincere.", effects: { fatigue: -0.02 }, note: "Your thank-you note was appreciated." },
        { label: "Skip it and keep momentum", detail: "Celebrate at the end.", effects: {}, note: "No celebration this time." }
      ]
    }
  };

  var api = { CARDS: CARDS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DDCards = api;
})(typeof window !== "undefined" ? window : globalThis);
