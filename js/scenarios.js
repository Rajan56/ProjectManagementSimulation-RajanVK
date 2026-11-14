/*
 * Deadline Dynamics: scenario library
 * (c) Rajan Kumar V K. All rights reserved.
 *
 * Each scenario sets the starting conditions of the model and a list of
 * disruptions. All companies, products and people are fictional.
 */
(function (root) {
  "use strict";

  var SCENARIOS = [
    {
      id: "software",
      title: "Mobile Banking App",
      sector: "Software",
      difficulty: "Moderate",
      client: "Northbay Savings Bank",
      unit: "features",
      unitSingular: "feature",
      summary:
        "Ship a new mobile banking app before the bank's spring campaign. Requirements move, and bugs hide well in code.",
      brief:
        "Northbay Savings Bank has promised customers a new mobile app in time for its spring campaign. Your team of developers is capable but small, the regulator is watching, and the marketing date cannot slide without public embarrassment.",
      scope: 2500,
      deadline: 12,
      budget: 1800,
      experienced: 10,
      rookies: 2,
      productivity: 6.0,
      baseError: 0.2,
      discoveryWeeks: 16,
      costPerFte: 9,
      events: [
        {
          month: 3,
          type: "quit",
          count: 2,
          title: "Two senior developers resign",
          text: "A fintech start-up has hired away two of your most experienced developers. Their notice period has already been spent on handover."
        },
        {
          month: 5,
          type: "change",
          title: "Change request: biometric login",
          text: "The bank's security office now wants fingerprint and face login in version 1. It adds roughly 260 features of work.",
          tasks: 260,
          extension: 1,
          budgetAdd: 120
        },
        {
          month: 8,
          type: "rework",
          share: 0.06,
          title: "Payment rules were misread",
          text: "A compliance review shows the team built part of the payments flow on an outdated interpretation of the rules. Some finished features are not actually right. Nobody yet knows how many."
        }
      ]
    },
    {
      id: "factory",
      title: "Packaging Line Retrofit",
      sector: "Manufacturing",
      difficulty: "Moderate",
      client: "Kallio Foods",
      unit: "work packages",
      unitSingular: "work package",
      summary:
        "Upgrade a running packaging line with sensors, robots and a new control system. Faults surface late, at commissioning.",
      brief:
        "Kallio Foods is converting its main packaging line to an automated, sensor-equipped line. Production stops for the cut-over in month 10, and every week of delay after that costs the plant dearly. Faults in mechanical and control work tend to stay hidden until commissioning.",
      scope: 1750,
      deadline: 10,
      budget: 1450,
      experienced: 8,
      rookies: 1,
      productivity: 5.8,
      baseError: 0.15,
      discoveryWeeks: 20,
      costPerFte: 10,
      events: [
        {
          month: 4,
          type: "supplier",
          factor: 0.6,
          weeks: 4,
          title: "Robot cells delivered late",
          text: "The robot supplier has a component shortage. Installation crews will be partly idle for about four weeks."
        },
        {
          month: 6,
          type: "change",
          title: "Change request: camera inspection station",
          text: "Quality management asks for a machine vision station to catch label errors. It adds about 200 work packages.",
          tasks: 200,
          extension: 1,
          budgetAdd: 110
        },
        {
          month: 8,
          type: "quit",
          count: 1,
          title: "Automation engineer leaves",
          text: "Your lead PLC programmer has accepted a job closer to home and leaves at the end of the month."
        }
      ]
    },
    {
      id: "construction",
      title: "Distribution Warehouse",
      sector: "Construction",
      difficulty: "Hard",
      client: "Meridian Logistics",
      unit: "work packages",
      unitSingular: "work package",
      summary:
        "Build a 20,000 m2 warehouse for a logistics client. Weather, inspections and a demanding client test your plan.",
      brief:
        "Meridian Logistics needs its new distribution centre ready for the peak season. The site is large, the crews are big, and the client has a habit of changing its mind. Inspection findings late in the job are expensive to fix.",
      scope: 3800,
      deadline: 14,
      budget: 2450,
      experienced: 13,
      rookies: 2,
      productivity: 5.6,
      baseError: 0.12,
      discoveryWeeks: 22,
      costPerFte: 9,
      events: [
        {
          month: 2,
          type: "supplier",
          factor: 0.7,
          weeks: 6,
          title: "Heavy rain stalls groundworks",
          text: "Weeks of rain have turned the site to mud. Groundworks and steel erection will run at reduced pace for about six weeks."
        },
        {
          month: 7,
          type: "change",
          title: "Change request: cold storage hall",
          text: "Meridian has won a frozen-food contract and wants a cold storage hall added. It adds about 320 work packages.",
          tasks: 320,
          extension: 2,
          budgetAdd: 210
        },
        {
          month: 10,
          type: "rework",
          share: 0.05,
          title: "Fire inspector raises findings",
          text: "A pre-inspection finds fire separation details that do not match the approved drawings. Some finished work will have to be opened up again."
        }
      ]
    },
    {
      id: "twin",
      title: "Digital Twin Rollout",
      sector: "Industry 4.0",
      difficulty: "Hard",
      client: "Saimaa Pulp & Paper",
      unit: "tasks",
      unitSingular: "task",
      summary:
        "Connect sensors, data and models into a working digital twin of a pulp mill. Data quality and IT/OT security bite.",
      brief:
        "Saimaa Pulp & Paper wants a digital twin of its fibre line to cut energy use and support sustainability reporting. Your team mixes data engineers, process experts and new graduates. Plant data is messier than anyone admitted at the kick-off.",
      scope: 2200,
      deadline: 12,
      budget: 1750,
      experienced: 9,
      rookies: 3,
      productivity: 5.8,
      baseError: 0.22,
      discoveryWeeks: 14,
      costPerFte: 9.5,
      events: [
        {
          month: 3,
          type: "rework",
          share: 0.08,
          title: "Sensor data is not what it seemed",
          text: "Several flow and temperature sensors turn out to be badly calibrated. Models already built on that data may be wrong."
        },
        {
          month: 6,
          type: "change",
          title: "Change request: energy and emissions dashboard",
          text: "The sustainability team needs energy and CO2 indicators for its CSRD report. It adds about 260 tasks.",
          tasks: 260,
          extension: 1,
          budgetAdd: 130
        },
        {
          month: 9,
          type: "supplier",
          factor: 0.75,
          weeks: 3,
          title: "IT/OT security review",
          text: "Group IT freezes all new connections to the plant network for a security audit. Integration work slows for about three weeks."
        },
        {
          month: 9,
          type: "quit",
          count: 1,
          title: "Data scientist resigns",
          text: "Your best modeller is leaving for a research post abroad."
        }
      ]
    }
  ];

  var api = { SCENARIOS: SCENARIOS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DDScenarios = api;
})(typeof window !== "undefined" ? window : globalThis);
