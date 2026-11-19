// Agent Substrate as a cartridge library: 16 actor cartridges, 3 warm worker docks,
// one gantry picker that resumes and suspends them, and an egress lockbox that holds the only key.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const KIT = join(homedir(), "skills-src/anatomy");
const k = await import(join(KIT, "kit/iso-kit.mjs"));
const { kitScript } = await import(join(KIT, "scripts/inline-kit.mjs"));

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const WIDTH = 600, HEIGHT = 390;

// ---- world ----
const PLATE = { x: -170, y: -34, w: 330, d: 78, r: 8 };
const PLATE_H = 9, FOOT_H = 5;

const SLOTS = 16, PITCH = 8;
const slotX = (i) => -134 + PITCH * i;
const TRAY = { x: -142, y: -15, w: 136, d: 30, r: 1.5 };
const TRAY_H = 5;
const CART = { w: 6, d: 22, h: 26 };
const RACK_Z = TRAY_H;

const DOCKS = [20, 58, 96];
const DRIVE = { w: 26, d: 34, h: 28 };
const DOCK_Z = DRIVE.h + 2;

const GATE = { x: 122, y: -12, w: 24, d: 34, r: 2.5 };
const GATE_H = 22;

const RAIL_Z = 104, RAIL_H = 6, RAIL_TOP = RAIL_Z + RAIL_H;
const RAIL_X0 = -150, RAIL_X1 = 114;
const POST_X = [-153, 117];
const TRAVEL_TOP = 90; // cartridge top while carried

const LANES = [32, 28, 24]; // drive 0 outermost so no drop crosses another lane
const GATE_IN = [138, 132, 126];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [RAIL_X0 - 6, -20, RAIL_TOP + 8], [RAIL_X1 + 6, 20, RAIL_TOP + 8], [GATE.x + GATE.w, GATE.y + GATE.d, 36]],
  WIDTH, HEIGHT, { pad: 26, azimuth: 58 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const seg = (a, b) => k.segment(a, b, P);
const closed = (pts) => pts.map((p, i) => seg(p, pts[(i + 1) % pts.length])).join("");
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// ---- parts ----
function cartridge(cx, z0, lit = false) {
  const plan = { x: cx - CART.w / 2, y: -CART.d / 2, w: CART.w, d: CART.d, r: 0.8 };
  const fx = cx + CART.w / 2; // visible +x face
  const fy = CART.d / 2;      // visible +y face
  const out = [];
  out.push(S(k.slabOf(plan, z0, CART.h, P, 3, 0.4), { tone: "hi", crease: "lo", lit, inner: L(k.sideSeam(plan, z0 + 4, P, 3), { tone: "faint" }) }));
  // label window on the +x face, with three rule lines standing for print
  out.push(L(closed([[fx, -7, z0 + 9], [fx, 7, z0 + 9], [fx, 7, z0 + 21], [fx, -7, z0 + 21]]), { tone: "lo" }));
  out.push(L(seg([fx, -5, z0 + 18], [fx, 5, z0 + 18]) + seg([fx, -5, z0 + 15], [fx, 2, z0 + 15]) + seg([fx, -5, z0 + 12], [fx, 3.5, z0 + 12]), { tone: "faint", free: true }));
  // grip notch on top and hub dot on the spine
  out.push(L(k.lineOnTop([cx - CART.w / 2, -3], [cx + CART.w / 2, -3], z0 + CART.h, P) + k.lineOnTop([cx - CART.w / 2, 3], [cx + CART.w / 2, 3], z0 + CART.h, P), { tone: "lo" }));
  out.push(D([at([cx, fy, z0 + 15])], { size: 0.55, tone: lit ? "lit" : "mid" }));
  return out.join("");
}

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -4, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // slot ruler in front of the rack: a major tick under every slot
  const strip = { x: -142, y: 19, w: 136, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(slotX(0) - 4, slotX(SLOTS - 1) + 4, 4, 2, strip.y + 0.6, 0.6, [1.8, 3.4], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3, 0.6]), at([strip.x + strip.w - 2, strip.y + 3, 0.6])], { size: 0.45 }));
  // label plate
  const lp = { x: -70, y: 30, w: 44, d: 8, r: 1.2 };
  out.push(S(k.slabOf(lp, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(lp, 1.4), 0.8, P, 3), { tone: "faint" }));
  out.push(L(k.lineOnTop([lp.x + 4, lp.y + 2.6], [lp.x + 30, lp.y + 2.6], 0.8, P) + k.lineOnTop([lp.x + 4, lp.y + 4.4], [lp.x + 22, lp.y + 4.4], 0.8, P) + k.lineOnTop([lp.x + 4, lp.y + 6.2], [lp.x + 26, lp.y + 6.2], 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([lp.x + lp.w - 3, lp.y + 2.6, 0.8]), at([lp.x + lp.w - 3, lp.y + 5.6, 0.8])], { size: 0.45 }));
  return out.join("");
}

// network cables on the plate: each drive to the egress box, in lanes that never cross
function wires() {
  return DOCKS.map((cx, i) => {
    const from = at([cx + 6, DRIVE.d / 2, 0]);
    const via = [at([cx + 6, LANES[i], 0]), at([GATE_IN[i], LANES[i], 0])];
    const to = at([GATE_IN[i], GATE.y + GATE.d, 0]);
    return `<g data-wire="${i}">${k.wireSvg(from, to, { via, tone: "lo", size: 0.9 })}<g data-flowing style="display:none">${L(`M${from.join(" ")}L${via.map((v) => v.join(" ")).join("L")}L${to.join(" ")}`, { tone: "hi", flow: true })}</g></g>`;
  }).join("");
}

function post(x, y) {
  const out = [];
  out.push(S(k.slabOf({ x: x - 6, y: y - 6, w: 12, d: 12, r: 1.5 }, 0, 3, P, 3, 0.4), { tone: "lo" }));
  out.push(D(k.corners({ x: x - 6, y: y - 6, w: 12, d: 12 }, 2).map(([a, b]) => at([a, b, 3])), { size: 0.45 }));
  out.push(S(k.slabOf({ x: x - 3, y: y - 3, w: 6, d: 6, r: 1 }, 3, RAIL_Z - 3, P, 3), { tone: "mid", crease: "none", inner: L(k.sideSeam({ x: x - 3, y: y - 3, w: 6, d: 6, r: 1 }, 60, P, 3), { tone: "faint" }) }));
  return out.join("");
}

function rail(y) {
  const plan = { x: RAIL_X0, y: y - 2, w: RAIL_X1 - RAIL_X0, d: 4, r: 0.8 };
  return S(k.slabOf(plan, RAIL_Z, RAIL_H, P, 3, 0.4), { tone: "mid" }) +
    D([RAIL_X0 + 8, -40, 60, RAIL_X1 - 8].map((x) => at([x, y, RAIL_TOP])), { size: 0.4, tone: "lo" });
}

function endBeam(x) {
  const plan = { x: x - 3, y: -20, w: 6, d: 40, r: 1 };
  return S(k.slabOf(plan, RAIL_Z, RAIL_H, P, 3, 0.4), { tone: "mid" }) +
    D([[x, -16], [x, 16]].map(([a, b]) => at([a, b, RAIL_TOP])), { size: 0.45 });
}

function rack() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(TRAY, 0, TRAY_H, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.slabOf(TRAY, 0, TRAY_H, P, 4, 0.6), { tone: "mid", inner: L(k.sideSeam(TRAY, 2, P, 4), { tone: "faint" }) }));
  const divider = (x) => S(k.slabOf({ x: x - 0.6, y: -13, w: 1.2, d: 26, r: 0.4 }, TRAY_H, 8, P, 2), { tone: "lo", crease: "none" });
  for (let i = 0; i < SLOTS; i++) {
    out.push(divider(slotX(i) - PITCH / 2));
    out.push(`<g data-slot="${i}" style="cursor:pointer"><g data-v="n">${cartridge(slotX(i), RACK_Z)}</g><g data-v="l" style="display:none">${cartridge(slotX(i), RACK_Z, true)}</g></g>`);
  }
  out.push(divider(slotX(SLOTS - 1) + PITCH / 2));
  return out.join("");
}

function drive(i) {
  const cx = DOCKS[i];
  const plan = { x: cx - DRIVE.w / 2, y: -DRIVE.d / 2, w: DRIVE.w, d: DRIVE.d, r: 2 };
  const fy = DRIVE.d / 2, fx = cx + DRIVE.w / 2;
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, DRIVE.h, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(plan, 0, DRIVE.h, P, 5, 0.8), { tone: "mid", inner: L(k.sideSeam(plan, 4, P, 5), { tone: "faint" }) }));
  // front bezel slot and status LED
  out.push(L(closed([[cx - 10, fy, 20], [cx + 4, fy, 20], [cx + 4, fy, 23], [cx - 10, fy, 23]]), { tone: "lo" }));
  out.push(`<g data-led="${i}"><g data-off>${D([at([cx + 9, fy, 21.5])], { size: 0.8, tone: "lo" })}</g><g data-on style="display:none">${D([at([cx + 9, fy, 21.5])], { size: 0.9, tone: "lit", pulse: true })}</g></g>`);
  out.push(L(closed([[cx + 7, fy, 20], [cx + 11, fy, 20], [cx + 11, fy, 23], [cx + 7, fy, 23]]), { tone: "faint" }));
  // vents on the +x face
  const vents = [];
  for (let y = -12; y <= 12; y += 3) for (const z of [8, 11, 14]) vents.push(at([fx, y, z]));
  out.push(D(vents, { size: 0.45, tone: "lo" }));
  // dock plate, back guide pins and top screws
  const dock = { x: cx - 7, y: -13, w: 14, d: 26, r: 1 };
  out.push(S(k.slabOf(dock, DRIVE.h, 2, P, 3, 0.3), { tone: "lo", crease: "none" }));
  out.push(D(k.corners(plan, 3).map(([a, b]) => at([a, b, DRIVE.h])), { size: 0.45 }));
  for (const px of [cx - 5, cx + 5]) {
    out.push(S(k.cylinder(px, -12.6, 0.9, DOCK_Z, 5, P, 12), { tone: "mid", crease: "none" }));
  }
  out.push(`<g data-dock="${i}" style="display:none"><g data-v="n">${cartridge(cx, DOCK_Z)}</g><g data-v="l" style="display:none">${cartridge(cx, DOCK_Z, true)}</g></g>`);
  return out.join("");
}

function gateway() {
  const out = [`<path class="iso-halo" d="${k.haloOf(GATE, 0, GATE_H, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(GATE, 0, GATE_H, P, 5, 0.8), { tone: "mid", inner: L(k.sideSeam(GATE, 17, P, 5), { tone: "lo" }) }));
  // hinges on the lid seam
  for (const x of [GATE.x + 5, GATE.x + 19]) out.push(S(k.slabOf({ x: x - 2, y: GATE.y + GATE.d - 0.2, w: 4, d: 1.4, r: 0.4 }, 15.5, 3, P, 2), { tone: "lo", crease: "none" }));
  out.push(k.faceTextSvg(k.sideMatrix([GATE.x + 12, GATE.y + GATE.d], 9, P, "left"), "EGRESS", { size: 3.2, tone: "lo", anchor: "middle" }));
  // key tray and the one key in the machine
  const tray = { x: GATE.x + 3, y: GATE.y + 14, w: 18, d: 14, r: 1.5 };
  out.push(L(k.planOutline(tray, GATE_H, P, 3), { tone: "lo" }));
  const kz = GATE_H;
  out.push(S(k.cylinder(GATE.x + 7, GATE.y + 21, 3, kz, 1.2, P, 24, 0.3), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(GATE.x + 7, GATE.y + 21, 1.1, kz + 1.2, P, 16), { tone: "lo" }));
  out.push(S(k.slabOf({ x: GATE.x + 9.8, y: GATE.y + 20.3, w: 9, d: 1.4, r: 0.4 }, kz, 1, P, 2), { tone: "hi", crease: "lo" }));
  out.push(S(k.slabOf({ x: GATE.x + 15, y: GATE.y + 21.7, w: 1.6, d: 2.2, r: 0.3 }, kz, 1, P, 2), { tone: "hi", crease: "lo" }));
  out.push(S(k.slabOf({ x: GATE.x + 17.2, y: GATE.y + 21.7, w: 1.4, d: 1.4, r: 0.3 }, kz, 1, P, 2), { tone: "hi", crease: "lo" }));
  // uplink mast: the only way out
  const [ux, uy] = [GATE.x + 17, GATE.y + 6];
  out.push(S(k.cylinder(ux, uy, 3, GATE_H, 1.5, P, 20), { tone: "lo" }));
  out.push(S(k.cylinder(ux, uy, 1.4, GATE_H + 1.5, 11, P, 16), { tone: "mid", crease: "none" }));
  out.push(L(k.sideArc(ux, uy, 1.4, GATE_H + 8, P, 10), { tone: "faint" }));
  out.push(S(k.cylinder(ux, uy, 2.6, GATE_H + 12.5, 2, P, 20, 0.3), { tone: "mid" }));
  out.push(D([[GATE.x + 3, GATE.y + 3], [GATE.x + GATE.w - 3, GATE.y + 3], [GATE.x + GATE.w - 3, GATE.y + 11]].map(([a, b]) => at([a, b, GATE_H])), { size: 0.45 }));
  return out.join("");
}

// moving parts, built at x = 0 and moved with translateAlong
function head() {
  const out = [];
  out.push(S(k.slabOf({ x: -6, y: -13.5, w: 12, d: 27, r: 1.2 }, 0, 5, P, 3, 0.5), { tone: "mid" }));
  out.push(D([at([-4, -11, 5]), at([4, 11, 5]), at([-4, 11, 5]), at([4, -11, 5])], { size: 0.4 }));
  out.push(S(k.slabOf({ x: -2.2, y: 11.2, w: 4.4, d: 1.6, r: 0.3 }, -4.5, 4.5, P, 2), { tone: "mid", crease: "none" }));
  return out.join("");
}

function carriage() {
  const plan = { x: -13, y: -21, w: 26, d: 42, r: 2 };
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(plan, 3), RAIL_TOP, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(plan, RAIL_TOP, 4, P, 4, 0.6), { tone: "mid", inner: L(k.sideSeam(plan, RAIL_TOP + 2, P, 4), { tone: "faint" }) }));
  out.push(D(k.corners(plan, 3).map(([a, b]) => at([a, b, RAIL_TOP + 4])), { size: 0.45 }));
  // hoist drum and motor
  out.push(S(k.slabOf({ x: -8, y: -8, w: 8, d: 16, r: 1 }, RAIL_TOP + 4, 5, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(6, 0, 5, RAIL_TOP + 4, 7, P, 32, 0.4), { tone: "mid" }));
  out.push(L(k.knurl(6, 0, 5, RAIL_TOP + 7, RAIL_TOP + 11, 30, P), { tone: "lo" }));
  out.push(L(k.lineOnTop([6, 0], [10, 0], RAIL_TOP + 11, P), { tone: "hi" }));
  out.push(D([at([6, 0, RAIL_TOP + 11])], { size: 0.5, tone: "hi" }));
  return out.join("");
}

const hoistAt = (gx, top) => [-6, 6].map((y) => k.segment([gx, y, top + 5], [gx, y, RAIL_Z], P)).join("");

const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: "A cartridge library on a bench. Sixteen cartridges stand in a rack: they are suspended agents. Three drives on the right are warm worker pods. A picker on an overhead gantry carries a cartridge to a free drive when a request arrives, and back to the rack when it has gone idle. Each drive's cable runs to a lockbox labelled egress, which holds the only key on the bench.",
  body: [
    plate(),
    `<g data-part="wires">${wires()}</g>`,
    post(POST_X[0], -16), post(POST_X[1], -16),
    endBeam(RAIL_X0 - 3),
    rail(-16),
    rack(),
    ...DOCKS.map((_, i) => drive(i)),
    `<g data-part="moving"><path data-part="hoist" class="iso-line" data-tone="lo" d="${hoistAt(slotX(0), TRAVEL_TOP)}"/>` +
      `<g data-part="carried" style="display:none">${cartridge(0, 0, true)}</g>` +
      `<g data-part="head">${head()}</g></g>`,
    post(POST_X[0], 16), post(POST_X[1], 16),
    gateway(),
    rail(16),
    endBeam(RAIL_X1 + 3),
    `<g data-part="carriage">${carriage()}</g>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const SLOTS = ${SLOTS}, PITCH = ${PITCH}, RACK_TOP = ${RACK_Z + CART.h}, DOCK_TOP = ${DOCK_Z + CART.h}, TRAVEL = ${TRAVEL_TOP}, CART_H = ${CART.h}, RAIL_Z = ${RAIL_Z};
const DOCKS = ${JSON.stringify(DOCKS)};
const slotX = (i) => -134 + PITCH * i;
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const q = (s) => svg.querySelector(s);
const slotEl = [...Array(SLOTS)].map((_, i) => q('[data-slot="' + i + '"]'));
const dockEl = DOCKS.map((_, i) => q('[data-dock="' + i + '"]'));
const ledEl = DOCKS.map((_, i) => q('[data-led="' + i + '"]'));
const wireEl = DOCKS.map((_, i) => q('[data-wire="' + i + '"] [data-flowing]'));
const head = q('[data-part="head"]'), carried = q('[data-part="carried"]'), hoist = q('[data-part="hoist"]'), carriage = q('[data-part="carriage"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const seg = (a, b) => { const p = iso(a, P), r = iso(b, P); return "M" + p[0].toFixed(1) + " " + p[1].toFixed(1) + "L" + r[0].toFixed(1) + " " + r[1].toFixed(1); };
const show = (el, on) => { el.style.display = on ? "" : "none"; };
const lit = (el, on) => { show(el.querySelector('[data-v="n"]'), !on); show(el.querySelector('[data-v="l"]'), on); };
const name = (a) => "#" + (a + 1);

// state: where each actor lives, what each dock holds, and how long it has been busy or idle
const where = [...Array(SLOTS)].map(() => "rack");
const dock = DOCKS.map(() => null);
const busyUntil = DOCKS.map(() => 0), idleSince = DOCKS.map(() => 0);
let gx = slotX(0), gz = TRAVEL, holding = null; // holding: { actor, at: "slot" | "dock" | "air", dock }
const queue = []; let job = null, parked = [], note = "idle", now = 0, resumes = 0;

const put = (fn) => queue.push(fn);
function plan(actor) {
  if (where[actor] !== "rack") { const d = where[actor]; busyUntil[d] = now + 4 + Math.random() * 3; note = name(actor) + " warm"; return; }
  if (job || queue.length) { if (!parked.includes(actor)) parked.push(actor); return; }
  let d = dock.indexOf(null);
  if (d < 0) {
    const idle = dock.map((a, i) => (a !== null && busyUntil[i] <= now ? i : -1)).filter((i) => i >= 0);
    if (!idle.length) { if (!parked.includes(actor)) parked.push(actor); note = name(actor) + " parked"; return; }
    d = idle.sort((a, b) => idleSince[a] - idleSince[b])[0];
    const out = dock[d];
    put({ x: DOCKS[d], say: "suspend " + name(out) });
    put({ z: DOCK_TOP, grab: { actor: out, at: "dock", dock: d } });
    put({ z: TRAVEL });
    put({ x: slotX(out) });
    put({ z: RACK_TOP, drop: { at: "slot" } });
    put({ z: TRAVEL });
  }
  put({ x: slotX(actor), say: "resume " + name(actor) });
  put({ z: RACK_TOP, grab: { actor, at: "slot" } });
  put({ z: TRAVEL });
  put({ x: DOCKS[d] });
  put({ z: DOCK_TOP, drop: { at: "dock", dock: d } });
  put({ z: TRAVEL });
}

function grab(g) {
  holding = g;
  if (g.at === "slot") { lit(slotEl[g.actor], true); where[g.actor] = "moving"; }
  else { lit(dockEl[g.dock], true); ledOff(g.dock); dock[g.dock] = null; where[g.actor] = "moving"; }
}
function drop(g) {
  const a = holding.actor;
  if (g.at === "dock") {
    holding = { ...holding, at: "dock", dock: g.dock };
    dock[g.dock] = a; where[a] = g.dock; busyUntil[g.dock] = now + 4 + Math.random() * 3; resumes++;
    lit(dockEl[g.dock], false); show(dockEl[g.dock], true); dockEl[g.dock].removeAttribute("transform");
    note = name(a) + " on worker " + (g.dock + 1);
  } else {
    where[a] = "rack"; lit(slotEl[a], false); show(slotEl[a], true); slotEl[a].removeAttribute("transform");
    note = name(a) + " snapshotted";
  }
  holding = null;
}
function ledOff(d) { show(ledEl[d].querySelector("[data-off]"), true); show(ledEl[d].querySelector("[data-on]"), false); show(wireEl[d], false); }

function place() {
  head.setAttribute("transform", translateAlong(P, [gx, 0, gz]));
  carriage.setAttribute("transform", translateAlong(P, [gx, 0, 0]));
  hoist.setAttribute("d", seg([gx, -6, gz + 5], [gx, -6, RAIL_Z]) + seg([gx, 6, gz + 5], [gx, 6, RAIL_Z]));
  show(carried, false);
  if (!holding) return;
  // while the picker is in a slot or on a dock the cartridge stays in that slot's place in the drawing order
  if (holding.at === "slot") { show(slotEl[holding.actor], true); slotEl[holding.actor].setAttribute("transform", translateAlong(P, [0, 0, gz - RACK_TOP])); }
  else if (holding.at === "dock") { show(dockEl[holding.dock], true); dockEl[holding.dock].setAttribute("transform", translateAlong(P, [0, 0, gz - DOCK_TOP])); }
  else { show(carried, true); carried.setAttribute("transform", translateAlong(P, [gx, 0, gz - CART_H])); }
}

function step(dt) {
  if (!job && queue.length) job = queue.shift();
  if (!job) {
    if (parked.length) { const a = parked.shift(); plan(a); }
    return;
  }
  if (job.say) { note = job.say; job.say = null; }
  if (job.x !== undefined) {
    if (holding && holding.at !== "air") {
      if (holding.at === "slot") { show(slotEl[holding.actor], false); slotEl[holding.actor].removeAttribute("transform"); }
      if (holding.at === "dock") { show(dockEl[holding.dock], false); dockEl[holding.dock].removeAttribute("transform"); }
      holding = { ...holding, at: "air" };
    }
    gx = still.matches ? job.x : gx + (job.x - gx) * (1 - Math.exp(-dt / 0.26));
    if (Math.abs(job.x - gx) < 0.05) { gx = job.x; job = null; }
  } else if (job.z !== undefined) {
    if (holding && holding.at === "air") {
      const d = DOCKS.indexOf(gx);
      holding = d >= 0 ? { ...holding, at: "dock", dock: d } : { ...holding, at: "slot" };
    }
    gz = still.matches ? job.z : gz + (job.z - gz) * (1 - Math.exp(-dt / 0.15));
    if (Math.abs(job.z - gz) < 0.05) {
      gz = job.z;
      if (job.grab) grab(job.grab);
      if (job.drop) drop(job.drop);
      job = null;
    }
  }
}

function tickDocks() {
  dock.forEach((a, d) => {
    const busy = a !== null && busyUntil[d] > now;
    if (a !== null && !busy && idleSince[d] < busyUntil[d]) idleSince[d] = now;
    show(ledEl[d].querySelector("[data-off]"), !busy); show(ledEl[d].querySelector("[data-on]"), busy); show(wireEl[d], busy);
  });
}

function draw() {
  place(); tickDocks();
  const running = dock.filter((a, d) => a !== null && busyUntil[d] > now).length;
  const asleep = where.filter((w) => w === "rack").length;
  const text = running + "/" + DOCKS.length + " busy · " + asleep + " asleep · " + note;
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}

let frame = 0, last = 0, visible = false, touring = !still.matches, nextTour = 1.2, idleTimer = 0;
function tour() {
  const asleep = where.map((w, i) => (w === "rack" ? i : -1)).filter((i) => i >= 0);
  const warm = dock.filter((a) => a !== null);
  const pick = warm.length && Math.random() < 0.25 ? warm[Math.floor(Math.random() * warm.length)] : asleep[Math.floor(Math.random() * asleep.length)];
  plan(pick);
}
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t; now += dt;
  if (touring && !job && !queue.length && now > nextTour) { tour(); nextTour = now + 2.2 + Math.random() * 1.5; }
  for (let i = 0; i < 3; i++) step(dt / 3);
  draw();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const hold = () => { touring = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { touring = !still.matches; nextTour = now + 0.5; }, 6000); };
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
slotEl.forEach((el, i) => el.addEventListener("click", () => { hold(); plan(i); run(); }));
stage.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault(); hold();
  const asleep = where.map((w, i) => (w === "rack" ? i : -1)).filter((i) => i >= 0);
  if (asleep.length) plan(asleep[Math.floor(Math.random() * asleep.length)]);
  run();
});
draw();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Agent Substrate",
  hint: "Click a cartridge",
  readout: "0/3 busy · 16 asleep · idle",
  keys: [
    { mark: "lit", label: "The cartridge being resumed or suspended" },
    { mark: "raised", label: "Cartridges: agents, with their memory and files" },
    { mark: "flat", label: "Drives: warm worker pods; lockbox: the egress gateway" },
  ],
  caption:
    "Agent Substrate as a cartridge library. Agents are idle most of the time, so they wait in the rack as snapshots, memory and files intact. When a request comes in, the picker loads that agent into any free drive, a warm sandboxed worker pod; when every drive is taken, it puts an idle agent back first, or parks the request until one goes idle. Each drive's only way out is the cable to the egress lockbox, which holds the one key on the bench and adds credentials to approved requests outside the sandbox. In the real system a resume takes under half a second, and one pool runs 10–30× more agents than it has pods; this bench shows 16 agents on 3.",
  body: `<div class="iso-stage" tabindex="0" role="img" aria-label="Agent Substrate cartridge library. Press Enter to send a request to a suspended agent.">${svg}</div>`,
});

const file = theme === "light" ? "substrate-light.html" : "substrate.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Agent Substrate", theme, body, script: kitScript() + live }));
console.log("wrote", file);
