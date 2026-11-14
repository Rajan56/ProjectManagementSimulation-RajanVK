/*
 * Deadline Dynamics: 3D team office (three.js r128)
 * (c) Rajan Kumar V K. All rights reserved.
 *
 * Shows the project team at their desks. Body colour shows experience
 * (experienced, new, contractor); the ring at each person's feet shows
 * energy. New hires walk in through the door, leavers walk out. Red crates
 * stack up for the rework that came back last month, and the wall board
 * shows reported progress. Click a person to see their details.
 */
(function (root) {
  "use strict";

  var THREE = root.THREE;
  var api = { available: false };
  root.DDFloor = api;
  if (!THREE) return;

  var canvas, renderer, scene, camera, raycaster, pointer;
  var people = {}; // id -> { group, body, ring, head, slot, target, leaving, state }
  var slots = []; // slot index -> person id
  var crates = [];
  var lamps = [];
  var board = null, boardFill = null;
  var hemi, sun, floorMesh, wallMesh;
  var gameKey = null;
  var selectedId = null;
  var hoverId = null;
  var onSelect = null;
  var running = false;
  var visible = true;
  var azimuth = 0.35, targetAzimuth = 0.35;
  var drag = null;
  var reduced = false;
  var lastTime = 0;
  var COLS = 6;
  var DOOR = new THREE.Vector3(10.5, 0, 5.5);

  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduced = false; }

  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function colorOf(name, fallback) {
    var c = new THREE.Color();
    try { c.setStyle(css(name, fallback)); } catch (e) { c.setStyle(fallback); }
    return c;
  }

  function init() {
    canvas = document.createElement("canvas");
    canvas.className = "floor-canvas";
    canvas.setAttribute("aria-label", "3D view of your project team at their desks. The team list next to it holds the same information.");
    canvas.setAttribute("role", "img");
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      renderer = null;
    }
    if (!renderer) return false;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.75);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(-8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
    scene.add(sun);

    floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 17), new THREE.MeshStandardMaterial({ color: 0xdfe5e4, roughness: 0.95 }));
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // floor grid lines
    var grid = new THREE.GridHelper(26, 26, 0xb8c2c4, 0xc8d0d2);
    grid.position.y = 0.002;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    scene.add(grid);

    // back wall with progress board
    wallMesh = new THREE.Mesh(new THREE.BoxGeometry(26, 3.2, 0.2), new THREE.MeshStandardMaterial({ color: 0xeef1f0, roughness: 0.9 }));
    wallMesh.position.set(0, 1.6, -8.5);
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);
    board = new THREE.Mesh(new THREE.BoxGeometry(10, 1.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x1b2631 }));
    board.position.set(-3, 2.1, -8.36);
    scene.add(board);
    boardFill = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.1), new THREE.MeshStandardMaterial({ color: 0x1f4fd8, emissive: 0x1f4fd8, emissiveIntensity: 0.35 }));
    boardFill.position.set(-7.8, 2.1, -8.3);
    scene.add(boardFill);

    // door frame
    var frameMat = new THREE.MeshStandardMaterial({ color: 0x5a6872 });
    var post1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), frameMat);
    var post2 = post1.clone();
    var lintel = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.6), frameMat);
    post1.position.set(12.4, 1.2, 4.7); post2.position.set(12.4, 1.2, 6.3); lintel.position.set(12.4, 2.4, 5.5);
    scene.add(post1, post2, lintel);

    // desks
    var deskMat = new THREE.MeshStandardMaterial({ color: 0xc9b79c, roughness: 0.7 });
    var legMat = new THREE.MeshStandardMaterial({ color: 0x6c7a84 });
    var screenMat = new THREE.MeshStandardMaterial({ color: 0x22303b, emissive: 0x3a6cff, emissiveIntensity: 0.18 });
    for (var i = 0; i < 30; i++) {
      var pos = slotPos(i);
      var desk = new THREE.Group();
      var top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.9), deskMat);
      top.position.y = 0.76; top.castShadow = true; top.receiveShadow = true;
      var base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.72, 0.08), legMat);
      base.position.set(0, 0.36, -0.3);
      var screen = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), screenMat);
      screen.position.set(0, 1.08, -0.25); screen.castShadow = true;
      desk.add(top, base, screen);
      desk.position.set(pos.x, 0, pos.z);
      desk.visible = false;
      desk.userData.slot = i;
      scene.add(desk);
      slots.push(null);
      lamps.push(desk);
    }

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointermove", onHover);
    canvas.addEventListener("pointerleave", function () { hoverId = null; canvas.style.cursor = "grab"; });
    canvas.style.cursor = "grab";

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; if (visible) loop(); }).observe(canvas);
    }
    return true;
  }

  function slotPos(i) {
    var col = i % COLS, row = Math.floor(i / COLS);
    return { x: -8.5 + col * 3.1, z: -5.2 + row * 2.75 };
  }

  function makePerson(p) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.75, 16), new THREE.MeshStandardMaterial({ color: 0x1f4fd8, roughness: 0.6, transparent: true }));
    body.position.y = 0.62; body.castShadow = true;
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14), new THREE.MeshStandardMaterial({ color: skinTone(p.id), roughness: 0.7, transparent: true }));
    head.position.y = 1.2; head.castShadow = true;
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 32), new THREE.MeshStandardMaterial({ color: 0x1d8a52, emissive: 0x1d8a52, emissiveIntensity: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.04;
    var halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    halo.rotation.x = Math.PI / 2; halo.position.y = 0.05;
    g.add(body, head, ring, halo);
    g.userData.personId = p.id;
    body.userData.personId = p.id; head.userData.personId = p.id; ring.userData.personId = p.id;
    scene.add(g);
    return { group: g, body: body, head: head, ring: ring, halo: halo, slot: -1, target: null, leaving: false, phase: (p.id * 1.7) % 6.28 };
  }

  function skinTone(id) {
    var tones = [0xf1c9a5, 0xd9a47a, 0xb67b52, 0x8d5a3b, 0xe8b88e, 0x6b4430, 0xc68e63];
    return tones[(id * 5) % tones.length];
  }

  function freeSlot() {
    for (var i = 0; i < slots.length; i++) if (slots[i] === null) return i;
    return slots.length - 1;
  }

  function seatPos(slot) {
    var p = slotPos(slot);
    return new THREE.Vector3(p.x, 0, p.z + 0.75);
  }

  function energyColor(e) {
    if (e > 0.75) return colorOf("--good", "#1d8a52");
    if (e > 0.5) return colorOf("--warn", "#b86e00");
    return colorOf("--bad", "#c0352d");
  }

  function applyTheme() {
    var dark = (document.documentElement.getAttribute("data-theme") === "dark") ||
      (document.documentElement.getAttribute("data-theme") !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    floorMesh.material.color.set(dark ? 0x1a242c : 0xdfe5e4);
    wallMesh.material.color.set(dark ? 0x141c23 : 0xf4f6f5);
    boardFill.material.color.copy(colorOf("--accent", "#1f4fd8"));
    boardFill.material.emissive.copy(colorOf("--accent", "#1f4fd8"));
    return dark;
  }

  api.attach = function (container, handler) {
    if (!canvas && !init()) { api.available = false; return false; }
    api.available = true;
    onSelect = handler;
    container.appendChild(canvas);
    resize();
    if (!api._ro && "ResizeObserver" in window) {
      api._ro = new ResizeObserver(function () { resize(); });
    }
    if (api._ro) { api._ro.disconnect(); api._ro.observe(container); }
    loop();
    return true;
  };

  function resize() {
    if (!canvas || !canvas.parentNode) return;
    var w = canvas.parentNode.clientWidth || 600;
    var h = Math.round(Math.max(240, Math.min(420, w * 0.52)));
    renderer.setSize(w, h, false);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    placeCamera();
    renderOnce();
  }

  function placeCamera() {
    var r = 15;
    camera.position.set(Math.sin(azimuth) * r + 0.5, 11.5, Math.cos(azimuth) * r - 0.5);
    camera.lookAt(0.3, 0, -1.4);
  }

  /*
   * state: { key, team: [...], energy(p), reported, foundShare, overtime }
   */
  api.update = function (st) {
    if (!api.available) return;
    var instant = st.key !== gameKey || reduced;
    if (st.key !== gameKey) {
      Object.keys(people).forEach(function (id) { scene.remove(people[id].group); });
      people = {};
      for (var i = 0; i < slots.length; i++) slots[i] = null;
      gameKey = st.key;
      selectedId = null;
    }
    var dark = applyTheme();
    var shown = {};
    st.team.forEach(function (p) {
      var inside = p.status === "active" || p.status === "leave";
      var waiting = p.status === "arriving";
      if (!inside && !waiting) return;
      shown[p.id] = true;
      var rec = people[p.id];
      if (!rec) {
        rec = people[p.id] = makePerson(p);
        rec.group.position.copy(DOOR);
        if (!waiting && instant) {
          rec.slot = freeSlot(); slots[rec.slot] = p.id;
          rec.group.position.copy(seatPos(rec.slot));
        }
      }
      if (inside && rec.slot < 0) {
        rec.slot = freeSlot(); slots[rec.slot] = p.id;
        rec.target = seatPos(rec.slot);
        if (instant) { rec.group.position.copy(rec.target); rec.target = null; }
      }
      if (waiting) {
        rec.group.position.set(DOOR.x + 2.9, 0, DOOR.z - 0.9 + (p.id % 4) * 0.6);
      }
      var bodyColor = p.kind === "contractor" ? colorOf("--warn", "#b86e00") : p.kind === "new" ? colorOf("--truth", "#0b8a63") : colorOf("--accent", "#1f4fd8");
      rec.body.material.color.copy(bodyColor);
      var e = st.energy(p);
      var ec = energyColor(e);
      rec.ring.material.color.copy(ec);
      rec.ring.material.emissive.copy(ec);
      var faded = p.status === "leave" || waiting;
      rec.body.material.opacity = faded ? 0.35 : 1;
      rec.head.material.opacity = faded ? 0.35 : 1;
      rec.ring.visible = !waiting;
      rec.state = p.status;
    });

    Object.keys(people).forEach(function (id) {
      if (shown[id]) return;
      var rec = people[id];
      if (rec.leaving) return;
      rec.leaving = true;
      if (rec.slot >= 0) slots[rec.slot] = null;
      rec.slot = -1;
      if (instant) { scene.remove(rec.group); delete people[id]; }
      else rec.target = DOOR.clone().add(new THREE.Vector3(2.5, 0, 0));
    });

    lamps.forEach(function (desk, i) { desk.visible = slots[i] !== null; });

    // progress board
    var w = Math.max(0.05, Math.min(1, st.reported)) * 9.4;
    boardFill.scale.x = w;
    boardFill.position.x = -7.7 + w / 2;

    // rework crates
    crates.forEach(function (c) { scene.remove(c); });
    crates = [];
    var n = Math.max(0, Math.min(36, Math.round(st.foundShare * 400)));
    var crateMat = new THREE.MeshStandardMaterial({ color: colorOf("--bad", "#c0352d"), roughness: 0.6 });
    for (var k = 0; k < n; k++) {
      var c = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), crateMat);
      var layer = Math.floor(k / 9), idx = k % 9;
      c.position.set(-11.4 + (idx % 3) * 0.6, 0.28 + layer * 0.56, 5.0 + Math.floor(idx / 3) * 0.6);
      c.castShadow = true;
      scene.add(c);
      crates.push(c);
    }

    // overtime: the office works into the evening
    var late = st.overtime >= 0.2;
    hemi.intensity = late ? 0.45 : 0.75;
    sun.intensity = late ? 0.35 : 0.75;
    sun.color.set(late ? 0xffb36b : 0xffffff);
    renderOnce();
    loop();
  };

  api.select = function (id) { selectedId = id; renderOnce(); };

  function pick(ev) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var objs = [];
    Object.keys(people).forEach(function (id) { objs.push(people[id].body, people[id].head, people[id].ring); });
    var hit = raycaster.intersectObjects(objs, false)[0];
    return hit ? hit.object.userData.personId : null;
  }

  function onDown(ev) { drag = { x: ev.clientX, az: targetAzimuth, moved: false }; canvas.style.cursor = "grabbing"; }
  function onMove(ev) {
    if (!drag) return;
    var dx = ev.clientX - drag.x;
    if (Math.abs(dx) > 3) drag.moved = true;
    targetAzimuth = Math.max(-0.9, Math.min(0.9, drag.az - dx * 0.006));
    loop();
  }
  function onUp(ev) {
    if (!drag) return;
    var clicked = !drag.moved;
    drag = null;
    if (canvas) canvas.style.cursor = "grab";
    if (clicked && ev.target === canvas) {
      var id = pick(ev);
      selectedId = id;
      if (onSelect) onSelect(id);
      renderOnce();
    }
  }
  function onHover(ev) {
    if (drag) return;
    var id = pick(ev);
    if (id !== hoverId) { hoverId = id; canvas.style.cursor = id != null ? "pointer" : "grab"; renderOnce(); }
  }

  function renderOnce() {
    if (!renderer) return;
    Object.keys(people).forEach(function (id) {
      var rec = people[id];
      var on = String(selectedId) === id || String(hoverId) === id;
      rec.halo.material.opacity = String(selectedId) === id ? 0.95 : String(hoverId) === id ? 0.5 : 0;
      rec.halo.visible = on;
    });
    renderer.render(scene, camera);
  }

  function loop() {
    if (running || !renderer) return;
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(tick);
  }

  function tick(t) {
    var dt = Math.min(0.05, (t - lastTime) / 1000);
    lastTime = t;
    var busy = false;
    if (Math.abs(targetAzimuth - azimuth) > 0.001) {
      azimuth += (targetAzimuth - azimuth) * Math.min(1, dt * 8);
      placeCamera();
      busy = true;
    }
    Object.keys(people).forEach(function (id) {
      var rec = people[id];
      if (rec.target) {
        var d = rec.target.clone().sub(rec.group.position);
        var dist = d.length();
        if (dist < 0.05) {
          rec.group.position.copy(rec.target);
          rec.target = null;
          if (rec.leaving) { scene.remove(rec.group); delete people[id]; return; }
        } else {
          rec.group.position.add(d.normalize().multiplyScalar(Math.min(dist, dt * 4.5)));
          rec.group.position.y = Math.abs(Math.sin(t / 90)) * 0.08;
          busy = true;
        }
      } else if (!reduced && rec.state === "active") {
        rec.head.position.y = 1.2 + Math.sin(t / 700 + rec.phase) * 0.02;
      }
    });
    renderOnce();
    var connected = canvas && canvas.isConnected;
    if (connected && visible && (busy || !reduced)) {
      requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }
})(window);
