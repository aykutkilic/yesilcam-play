#!/usr/bin/env node

// src/agent/cli.ts
import { readFileSync } from "node:fs";
import { deflateRawSync as deflateRawSync2 } from "node:zlib";

// src/engine/util.ts
var clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
var lerp = (a, b, t) => a + (b - a) * t;
var easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
var DEG = Math.PI / 180;
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return Object.assign(next, {
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p
  });
}
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
}
function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((x, i) => Math.round(lerp(x, B[i], t) * 255));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
function shade(hex, t) {
  return t >= 0 ? mixHex(hex, "#ffffff", t) : mixHex(hex, "#000000", -t);
}
var wakeHolds = 0;
var wakeLock = null;
var wakeSync = async () => {
  const want = wakeHolds > 0 && document.visibilityState === "visible";
  const nav = navigator;
  if (want && !wakeLock && nav.wakeLock) {
    try {
      const l = await nav.wakeLock.request("screen");
      l.addEventListener("release", () => {
        if (wakeLock === l) wakeLock = null;
      });
      wakeLock = l;
      if (wakeHolds <= 0) void wakeSync();
    } catch {
    }
  } else if (!want && wakeLock) {
    const l = wakeLock;
    wakeLock = null;
    await l.release().catch(() => {
    });
  }
};
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => void wakeSync());

// src/engine/paint.ts
function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}
function rgrad(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}
function glow(ctx, x, y, r, color, alpha2 = 0.6) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = rgrad(ctx, x, y, 0, r, [
    [0, hexA(color, alpha2)],
    [0.35, hexA(color, alpha2 * 0.35)],
    [1, hexA(color, 0)]
  ]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
function hexA(hex, a) {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${Math.max(0, Math.min(1, a))})`;
}
function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
function rrect(ctx, x, y, w, h, r) {
  const rr4 = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr4, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr4);
  ctx.arcTo(x + w, y + h, x, y + h, rr4);
  ctx.arcTo(x, y + h, x, y, rr4);
  ctx.arcTo(x, y, x + w, y, rr4);
  ctx.closePath();
}
function poly(ctx, pts2, fill) {
  ctx.beginPath();
  pts2.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function cloud(ctx, x, y, w, color, shadow, seed = 1) {
  const r = rng(seed);
  const n = 4 + Math.floor(r() * 3);
  const h = w * 0.32;
  const draw = (dy, fill) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const cx = x + (t - 0.5) * w * 0.8;
      const rad = h * (0.45 + 0.55 * Math.sin(t * Math.PI)) * r.range(0.8, 1.1);
      ctx.moveTo(cx + rad, y + dy - rad * 0.4);
      ctx.arc(cx, y + dy - rad * 0.4, rad, 0, Math.PI * 2);
    }
    ctx.rect(x - w * 0.45, y + dy - h * 0.4, w * 0.9, h * 0.4);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  if (shadow) draw(h * 0.12, shadow);
  r.range(0, 1);
  draw(0, color);
}
function palm(ctx, x, y, h, trunk, leaf, r) {
  const lean = r.range(-0.25, 0.25);
  const tx = x + lean * h;
  const ty = y - h;
  const segs = 9;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const x0 = x + (tx - x) * t0 * t0;
    const x1 = x + (tx - x) * t1 * t1;
    const w0 = h * 0.05 * (1 - t0 * 0.45);
    const w1 = h * 0.05 * (1 - t1 * 0.45);
    poly(ctx, [[x0 - w0, y - h * t0], [x0 + w0, y - h * t0], [x1 + w1 * 1.1, y - h * t1], [x1 - w1 * 1.1, y - h * t1]], i % 2 ? trunk : shade(trunk, -0.1));
  }
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = -Math.PI / 2 + (i - (fronds - 1) / 2) * 0.48 + r.range(-0.1, 0.1);
    const len = h * r.range(0.42, 0.56);
    const ex = tx + Math.cos(a) * len;
    const ey = ty + Math.sin(a) * len * 0.55 + len * 0.35;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.5, ty + Math.sin(a) * len * 0.6 - len * 0.18, ex, ey);
    ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.45, ty + Math.sin(a) * len * 0.3, tx, ty + len * 0.06);
    ctx.fillStyle = i % 2 ? leaf : shade(leaf, -0.12);
    ctx.fill();
  }
  ellipse(ctx, tx, ty + h * 0.02, h * 0.035, h * 0.03, shade(trunk, -0.25));
}
function cypress(ctx, x, y, h, color) {
  const w = h * 0.16;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.bezierCurveTo(x + w * 1.1, y - h * 0.7, x + w * 0.9, y - h * 0.15, x + w * 0.35, y);
  ctx.lineTo(x - w * 0.35, y);
  ctx.bezierCurveTo(x - w * 0.9, y - h * 0.15, x - w * 1.1, y - h * 0.7, x, y - h);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.bezierCurveTo(x + w * 1.1, y - h * 0.7, x + w * 0.9, y - h * 0.15, x + w * 0.35, y);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = shade(color, -0.15);
  ctx.fill();
}
function roundTree(ctx, x, y, h, trunk, leaf, r, lit2) {
  const tw = h * 0.07;
  poly(ctx, [[x - tw, y], [x + tw, y], [x + tw * 0.6, y - h * 0.55], [x - tw * 0.4, y - h * 0.55]], trunk);
  ctx.strokeStyle = trunk;
  ctx.lineWidth = tw * 0.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.45);
  ctx.lineTo(x - h * 0.18, y - h * 0.7);
  ctx.moveTo(x, y - h * 0.5);
  ctx.lineTo(x + h * 0.2, y - h * 0.72);
  ctx.stroke();
  const blobs = 6;
  for (let i = 0; i < blobs; i++) {
    const a = i / blobs * Math.PI * 2;
    const bx = x + Math.cos(a) * h * 0.2 + r.range(-0.04, 0.04) * h;
    const by = y - h * 0.72 + Math.sin(a) * h * 0.13;
    ellipse(ctx, bx, by, h * r.range(0.16, 0.22), h * r.range(0.13, 0.17), leaf);
  }
  ellipse(ctx, x, y - h * 0.74, h * 0.26, h * 0.2, leaf);
  if (lit2) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ellipse(ctx, x - h * 0.12, y - h * 0.86, h * 0.2, h * 0.12, lit2);
    ctx.restore();
  }
}
function pine(ctx, x, y, h, color, snow, r) {
  const w = h * 0.36;
  const tiers = 4;
  poly(ctx, [[x - h * 0.03, y], [x + h * 0.03, y], [x + h * 0.03, y - h * 0.2], [x - h * 0.03, y - h * 0.2]], shade(color, -0.35));
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const by = y - h * 0.12 - t * h * 0.62;
    const tw = w * (1 - t * 0.62);
    const top = by - h * 0.38;
    poly(ctx, [[x - tw, by], [x, top], [x + tw, by]], color);
    poly(ctx, [[x, by], [x, top], [x + tw, by]], shade(color, -0.12));
    if (snow) {
      const sh = h * 0.06;
      const pts2 = [[x - tw * 0.55, top + (by - top) * 0.55], [x, top], [x + tw * 0.55, top + (by - top) * 0.55]];
      pts2.push([x + tw * 0.25, top + (by - top) * 0.55 + sh * (r ? r.range(0.3, 0.8) : 0.5)], [x - tw * 0.2, top + (by - top) * 0.55 + sh * 0.2]);
      poly(ctx, pts2, snow);
      poly(ctx, [[x - tw * 1.02, by + 1], [x - tw * 0.6, by - sh * 0.9], [x - tw * 0.2, by + 2]], snow);
    }
  }
}
function cactus(ctx, x, y, h, color) {
  const w = h * 0.13;
  const arm = (side, at2, len) => {
    const ax = x + side * w * 0.5;
    const ay = y - h * at2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + side * len * 0.55, ay);
    ctx.lineTo(ax + side * len * 0.55, ay - len);
    ctx.strokeStyle = color;
    ctx.lineWidth = w * 0.75;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  arm(-1, 0.45, h * 0.32);
  arm(1, 0.6, h * 0.26);
  rrect(ctx, x - w / 2, y - h, w, h, w / 2);
  ctx.fillStyle = color;
  ctx.fill();
  rrect(ctx, x, y - h, w / 2, h, w / 4);
  ctx.fillStyle = shade(color, -0.12);
  ctx.fill();
}
function grassTufts(ctx, x0, x1, y, color, r, density = 0.05, hgt = 18) {
  ctx.fillStyle = color;
  for (let x = x0; x < x1; x += 1 / density) {
    const bx = x + r.range(-8, 8);
    const hh = hgt * r.range(0.5, 1.2);
    ctx.beginPath();
    ctx.moveTo(bx - 4, y);
    ctx.quadraticCurveTo(bx - 3, y - hh * 0.6, bx - 6, y - hh);
    ctx.quadraticCurveTo(bx, y - hh * 0.5, bx + 1, y - hh * 0.9);
    ctx.quadraticCurveTo(bx + 2, y - hh * 0.4, bx + 7, y - hh * 0.8);
    ctx.quadraticCurveTo(bx + 3, y - hh * 0.3, bx + 4, y);
    ctx.fill();
  }
}
function sea(ctx, x, y, w, h, top, bottom, streak, r, reflectX, reflectColor) {
  ctx.fillStyle = vgrad(ctx, y, y + h, [[0, top], [1, bottom]]);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = streak;
  for (let i = 0; i < w * h * 7e-4; i++) {
    const sy = y + Math.pow(r(), 1.6) * h;
    const len = r.range(10, 60) * (0.4 + (sy - y) / h);
    ctx.globalAlpha = r.range(0.15, 0.5);
    ctx.fillRect(x + r() * w, sy, len, 1.5 + (sy - y) / h * 2);
  }
  ctx.globalAlpha = 1;
  if (reflectX !== void 0 && reflectColor) {
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const sy = y + t * h;
      const spread2 = 20 + t * 140;
      const len = r.range(20, 70) * (0.5 + t);
      ctx.globalAlpha = (1 - t) * r.range(0.3, 0.8);
      ctx.fillStyle = reflectColor;
      ctx.fillRect(reflectX + r.range(-spread2, spread2) - len / 2, sy, len, 2 + t * 3);
    }
    ctx.globalAlpha = 1;
  }
}
function dish(ctx, x, y, s, o) {
  const a = o.angle ?? -0.6;
  ctx.strokeStyle = o.dark;
  ctx.lineWidth = s * 0.035;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.3, y);
  ctx.lineTo(x, y - s * 0.55);
  ctx.lineTo(x + s * 0.3, y);
  ctx.moveTo(x - s * 0.15, y - s * 0.27);
  ctx.lineTo(x + s * 0.15, y - s * 0.27);
  ctx.stroke();
  ctx.fillStyle = o.dark;
  ctx.fillRect(x - s * 0.06, y - s * 0.62, s * 0.12, s * 0.12);
  ctx.save();
  ctx.translate(x, y - s * 0.62);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.12, s * 0.55, s * 0.17, 0, 0, Math.PI);
  ctx.lineTo(-s * 0.55, -s * 0.12);
  ctx.fillStyle = o.metal;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.12, s * 0.55, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(o.metal, 0.12);
  ctx.fill();
  ctx.strokeStyle = shade(o.metal, -0.15);
  ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s * 0.075, -s * 0.12 - s * 0.085 * Math.sqrt(1 - (i / 7.3) ** 2));
    ctx.lineTo(i * s * 0.075, -s * 0.12 + s * 0.085 * Math.sqrt(1 - (i / 7.3) ** 2));
    ctx.stroke();
  }
  ctx.strokeStyle = o.dark;
  ctx.lineWidth = s * 0.012;
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, -s * 0.12);
  ctx.lineTo(0, -s * 0.5);
  ctx.lineTo(s * 0.45, -s * 0.12);
  ctx.stroke();
  ctx.fillStyle = o.dark;
  ctx.fillRect(-s * 0.03, -s * 0.56, s * 0.06, s * 0.08);
  ctx.restore();
}
function star4(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = color;
  ctx.fill();
}
function text(ctx, s, x, y, size, color, align = "center", weight = 700) {
  ctx.font = `${weight} ${size}px Fredoka, Nunito, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

// src/props/kit.ts
function fillOut(c, fill, line9 = 0, lw = 3) {
  c.fillStyle = fill;
  c.fill();
  if (line9 >= 0 && lw > 0) {
    c.strokeStyle = typeof fill === "string" ? shade(fill, -0.45 - line9) : "rgba(0,0,0,0.35)";
    c.lineWidth = lw;
    c.lineJoin = "round";
    c.stroke();
  }
}
function box(c, x, y, w, h, color, r = 6, outline2 = true) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = color;
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = shade(color, -0.14);
  c.fillRect(x, y + h * 0.82, w, h * 0.18);
  c.fillStyle = shade(color, 0.12);
  c.fillRect(x, y, w, Math.min(6, h * 0.08));
  c.restore();
  if (outline2) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.strokeStyle = shade(color, -0.5);
    c.lineWidth = 2.5;
    c.stroke();
  }
}
function shape(c, pts2, color, outline2 = true) {
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.fillStyle = color;
  c.fill();
  if (outline2) {
    c.strokeStyle = shade(color, -0.5);
    c.lineWidth = 2.5;
    c.lineJoin = "round";
    c.stroke();
  }
}
function disc(c, x, y, r, color, outline2 = true) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  if (outline2) {
    c.strokeStyle = shade(color, -0.5);
    c.lineWidth = 2.5;
    c.stroke();
  }
}
function wheel(c, x, y, r, rim = "#c9ccd6", tyre = "#1d1d24") {
  disc(c, x, y, r, tyre);
  disc(c, x, y, r * 0.62, rim, false);
  disc(c, x, y, r * 0.22, shade(rim, -0.3), false);
  c.strokeStyle = shade(rim, -0.25);
  c.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22);
    c.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
    c.stroke();
  }
}
function planks(c, x, y, w, h, color, n = 5) {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
  c.strokeStyle = shade(color, -0.25);
  c.lineWidth = 2;
  for (let i = 1; i < n; i++) {
    c.beginPath();
    c.moveTo(x, y + h * i / n);
    c.lineTo(x + w, y + h * i / n);
    c.stroke();
  }
}
function bricks(c, x, y, w, h, color, bw = 40, bh = 20) {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
  c.strokeStyle = shade(color, -0.22);
  c.lineWidth = 2;
  for (let row3 = 0, yy = y; yy < y + h; row3++, yy += bh) {
    c.beginPath();
    c.moveTo(x, yy);
    c.lineTo(x + w, yy);
    c.stroke();
    for (let xx = x + (row3 % 2 ? bw / 2 : 0); xx < x + w; xx += bw) {
      c.beginPath();
      c.moveTo(xx, yy);
      c.lineTo(xx, Math.min(y + h, yy + bh));
      c.stroke();
    }
  }
}
function windowPane(c, x, y, w, h, frame2, lit2, glass2 = "#9fd2ee") {
  c.fillStyle = frame2;
  c.fillRect(x - 4, y - 4, w + 8, h + 8);
  c.fillStyle = lit2 ? "#ffd77a" : glass2;
  c.fillRect(x, y, w, h);
  if (!lit2) {
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.beginPath();
    c.moveTo(x + w * 0.15, y + h);
    c.lineTo(x + w * 0.55, y);
    c.lineTo(x + w * 0.75, y);
    c.lineTo(x + w * 0.35, y + h);
    c.fill();
  }
  c.fillStyle = frame2;
  c.fillRect(x + w / 2 - 2, y, 4, h);
  c.fillRect(x, y + h / 2 - 2, w, 4);
}
function dome(c, x, y, r, color, finial = "#d9b25f") {
  c.beginPath();
  c.ellipse(x, y, r, r * 0.95, 0, Math.PI, Math.PI * 2);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.fillStyle = shade(color, -0.12);
  c.beginPath();
  c.ellipse(x, y, r, r * 0.95, 0, Math.PI * 1.5, Math.PI * 2);
  c.lineTo(x, y);
  c.closePath();
  c.fill();
  c.strokeStyle = finial;
  c.lineWidth = Math.max(2, r * 0.05);
  c.beginPath();
  c.moveTo(x, y - r * 0.95);
  c.lineTo(x, y - r * 1.25);
  c.stroke();
  c.beginPath();
  c.arc(x, y - r * 1.3, r * 0.08, 0.6, Math.PI * 2 - 0.6);
  c.stroke();
}
function minaret(c, x, y, h, color) {
  const w = h * 0.06;
  c.fillStyle = color;
  c.fillRect(x - w / 2, y - h, w, h);
  c.fillStyle = shade(color, -0.12);
  c.fillRect(x, y - h, w / 2, h);
  c.fillStyle = shade(color, 0.08);
  c.fillRect(x - w * 0.8, y - h * 0.72, w * 1.6, h * 0.04);
  c.fillRect(x - w * 0.7, y - h * 0.45, w * 1.4, h * 0.03);
  c.beginPath();
  c.moveTo(x - w * 0.6, y - h);
  c.lineTo(x, y - h * 1.22);
  c.lineTo(x + w * 0.6, y - h);
  c.closePath();
  c.fillStyle = "#5c6e8a";
  c.fill();
}
function floorShadow(c, w, y = 0, a = 0.22) {
  c.fillStyle = `rgba(0,0,0,${a})`;
  c.beginPath();
  c.ellipse(0, y, w / 2, Math.max(6, w * 0.06), 0, 0, Math.PI * 2);
  c.fill();
}

// src/sets/types.ts
var MARGIN = 500;
var BOTTOM = 1200;
var TOD = {
  dawn: { skyTop: "#6d7fc4", skyLow: "#ffc7a8", sun: "#ffd7a0", light: "#f4e2dc", dark: 0.3 },
  day: { skyTop: "#5fb3f0", skyLow: "#d9f1ff", sun: "#fff4c2", light: "#ffffff", dark: 0 },
  dusk: { skyTop: "#3b3a7a", skyLow: "#ff9a6b", sun: "#ff7b4a", light: "#ffd2b0", dark: 0.55 },
  night: { skyTop: "#0b1030", skyLow: "#26325e", sun: "#f4f1d0", light: "#7d8ac4", dark: 1 }
};

// src/sets/medieval.ts
var DARK_WOOD = "#4a2c1a";
var LIT = "#ffd77a";
var FLOOR_TOP = 790;
function timber(c, s, base, sh, lit2, seed) {
  const top = base - s.storeys * sh;
  const x0 = s.x;
  const x1 = s.x + s.w;
  const roofH = s.w * 0.55;
  const nWin = s.w > 190 ? 3 : 2;
  const winW = Math.max(13, s.w * 0.13);
  const winH = sh * 0.42;
  const winX = (i) => x0 + (i + 0.5) / nWin * s.w - winW / 2;
  const winY = (st) => base - st * sh - sh * 0.2 - winH;
  const doorI = Math.floor(nWin / 2);
  const doorCx = x0 + (doorI + 0.5) / nWin * s.w;
  const doorW = Math.max(18, s.w * 0.19);
  const isLit = (st, i) => (seed * 7 + st * 5 + i * 3) % 5 < 3;
  if (lit2) {
    for (let st = 0; st < s.storeys; st++) {
      for (let i = 0; i < nWin; i++) {
        if (st === 0 && i === doorI) continue;
        if (isLit(st, i)) windowPane(c, winX(i), winY(st), winW, winH, DARK_WOOD, true);
      }
    }
    if (s.torch) flame(c, doorCx - doorW / 2 - 14, base - sh * 0.6);
    return;
  }
  c.fillStyle = s.wall;
  c.fillRect(x0, top, s.w, s.storeys * sh);
  for (let st = 1; st < s.storeys; st++) c.fillRect(x0 - 9, base - (st + 1) * sh, s.w + 18, sh);
  c.fillStyle = shade(s.wall, -0.14);
  c.fillRect(x1 - s.w * 0.2, top, s.w * 0.2, s.storeys * sh);
  c.fillStyle = DARK_WOOD;
  for (let k = 0; k <= s.storeys; k++) {
    const y = base - k * sh;
    c.fillRect(x0 - (k && k < s.storeys ? 9 : 0), y - 6, s.w + (k && k < s.storeys ? 18 : 0), 6);
  }
  for (let i = 0; i <= nWin; i++) {
    const px = i === nWin ? x1 - 6 : x0 + i / nWin * s.w;
    c.fillRect(px, top, 6, s.storeys * sh);
  }
  for (let st = 0; st < s.storeys; st++) {
    for (let i = 0; i < nWin; i++) {
      if (st === 0 && i === doorI) continue;
      windowPane(c, winX(i), winY(st), winW, winH, DARK_WOOD, false, "#8fb8c4");
    }
  }
  const doorTop = base - sh * 0.78;
  c.fillStyle = "#5a3a24";
  c.beginPath();
  c.roundRect(doorCx - doorW / 2, doorTop, doorW, base - doorTop, [doorW / 2, doorW / 2, 0, 0]);
  c.fill();
  c.fillStyle = DARK_WOOD;
  c.fillRect(doorCx - 1.5, doorTop + 8, 3, base - doorTop - 8);
  if (s.torch) bracket(c, doorCx - doorW / 2 - 14, base - sh * 0.6);
  c.beginPath();
  c.moveTo(x0 - 14, top + 2);
  c.lineTo(x0 + s.w / 2, top - roofH);
  c.lineTo(x1 + 14, top + 2);
  c.closePath();
  c.fillStyle = s.roof;
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = shade(s.roof, -0.2);
  c.fillRect(x0 + s.w / 2, top - roofH, s.w, roofH);
  c.fillStyle = shade(s.roof, -0.3);
  for (let y = top - 8; y > top - roofH; y -= 11) c.fillRect(x0 - 20, y, s.w + 40, 2);
  c.restore();
  c.strokeStyle = shade(s.roof, -0.45);
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x0 - 14, top + 2);
  c.lineTo(x0 + s.w / 2, top - roofH);
  c.lineTo(x1 + 14, top + 2);
  c.stroke();
  c.fillStyle = "#8a5a48";
  c.fillRect(x0 + s.w * 0.68, top - roofH * 0.85, 14, roofH * 0.55);
  c.fillStyle = shade("#8a5a48", -0.25);
  c.fillRect(x0 + s.w * 0.68 + 9, top - roofH * 0.85, 5, roofH * 0.55);
}
function bracket(c, x, y) {
  c.fillStyle = "#2b2b30";
  c.fillRect(x - 2, y - 2, 4, 18);
  c.fillRect(x - 8, y - 4, 16, 6);
  c.fillStyle = "#8a4a2b";
  c.fillRect(x - 6, y - 16, 12, 12);
}
function flame(c, x, y) {
  glow(c, x, y - 6, 110, "#ff9a3c", 0.55);
  c.fillStyle = "#ff8a2a";
  c.beginPath();
  c.ellipse(x, y - 14, 7, 12, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#fff1b0";
  c.beginPath();
  c.ellipse(x, y - 10, 3.5, 6, 0, 0, Math.PI * 2);
  c.fill();
}
var WALLS = ["#eadcc0", "#e8c58e", "#d9a085", "#f0e4cc", "#c9d4c0"];
var ROOFS = ["#b5482f", "#8a4a2b", "#5b5f70", "#a8432e"];
function rowSpecs(x0, x1, seed, skip, torchEvery = 3) {
  const r = rng(seed);
  const out = [];
  let x = x0;
  let i = 0;
  while (x < x1) {
    const w = Math.round(r.range(140, 200));
    if (skip && x + w > skip[0] && x < skip[1]) {
      x = skip[1];
      continue;
    }
    out.push({
      x,
      w,
      storeys: r() < 0.75 ? 2 : 1,
      wall: WALLS[i % WALLS.length],
      roof: ROOFS[i * 3 % ROOFS.length],
      torch: i % torchEvery === 1
    });
    x += w + 4;
    i++;
  }
  return out;
}
var BACK = rowSpecs(-520, 3720, 11, [1330, 1670], 99);
var NEAR_LEFT = rowSpecs(-520, 760, 21, void 0, 2);
var NEAR_RIGHT = rowSpecs(2640, 3720, 33, void 0, 2);
function backRow(c, lit2) {
  for (const s of BACK) timber(c, s, 800, 221, lit2, Math.round(s.x));
  church(c, 1500, 800, lit2);
}
function nearRow(c, lit2) {
  for (const s of NEAR_LEFT) timber(c, s, 830, 262, lit2, Math.round(s.x) + 3);
  for (const s of NEAR_RIGHT) timber(c, s, 830, 262, lit2, Math.round(s.x) + 5);
}
function church(c, x, base, lit2) {
  const w = 220;
  const bodyTop = base - 330;
  const apex = base - 650;
  if (lit2) {
    for (const wx of [x - 60, x + 30]) windowPane(c, wx, base - 300, 16, 46, "#8c8170", true);
    windowPane(c, x - 8, bodyTop + 16, 16, 48, "#8c8170", true);
    return;
  }
  c.fillStyle = "#b9b1a0";
  c.fillRect(x - w / 2, bodyTop, w, base - bodyTop);
  c.fillStyle = shade("#b9b1a0", -0.14);
  c.fillRect(x + w * 0.2, bodyTop, w * 0.3, base - bodyTop);
  c.fillStyle = "#4f6480";
  c.beginPath();
  c.moveTo(x - w * 0.42, bodyTop - 20);
  c.lineTo(x, apex);
  c.lineTo(x + w * 0.42, bodyTop - 20);
  c.closePath();
  c.fill();
  c.fillStyle = shade("#4f6480", -0.18);
  c.beginPath();
  c.moveTo(x, apex);
  c.lineTo(x + w * 0.42, bodyTop - 20);
  c.lineTo(x, bodyTop - 20);
  c.closePath();
  c.fill();
  ellipse(c, x, bodyTop + 40, 26, 26, "#f4efe2");
  c.strokeStyle = DARK_WOOD;
  c.lineWidth = 3;
  c.stroke();
  for (const wx of [x - 60, x + 30]) windowPane(c, wx, base - 300, 16, 46, "#8c8170", false, "#7a94a0");
  windowPane(c, x - 8, bodyTop + 16 + 80, 16, 48, "#8c8170", false, "#7a94a0");
  c.fillStyle = "#5a3a24";
  c.beginPath();
  c.roundRect(x - 22, base - 80, 44, 80, [22, 22, 0, 0]);
  c.fill();
  c.fillStyle = "#e6b84d";
  c.fillRect(x - 2, apex - 26, 4, 22);
  c.fillRect(x - 7, apex - 20, 14, 4);
}
function castle(c, lit2) {
  const stone = "#cfc3a8";
  const stoneSh = shade(stone, -0.16);
  const towers2 = [
    [1150, 110, 230],
    [1380, 84, 300],
    [1800, 170, 130],
    [2220, 84, 300],
    [2450, 110, 230]
  ];
  if (lit2) {
    for (const [tx, tw, ty] of towers2) {
      for (let k = 0; k < 2; k++) {
        if ((tx + k) % 3 === 0) continue;
        c.fillStyle = LIT;
        c.fillRect(tx + tw / 2 - 3, ty + 60 + k * 70, 6, 16);
      }
    }
    c.fillStyle = "#ffb347";
    c.beginPath();
    c.roundRect(1780, 700, 40, 100, [20, 20, 0, 0]);
    c.fill();
    glow(c, 1800, 720, 160, "#ffb347", 0.35);
    return;
  }
  c.fillStyle = "#6e9a5a";
  c.beginPath();
  c.moveTo(900, 820);
  c.quadraticCurveTo(1300, 600, 1800, 620);
  c.quadraticCurveTo(2300, 600, 2700, 820);
  c.closePath();
  c.fill();
  c.fillStyle = "#5a8449";
  c.beginPath();
  c.moveTo(1800, 620);
  c.quadraticCurveTo(2300, 600, 2700, 820);
  c.lineTo(1800, 820);
  c.closePath();
  c.fill();
  c.fillStyle = stone;
  c.fillRect(1180, 560, 1240, 260);
  c.fillStyle = stoneSh;
  c.fillRect(1180, 560, 1240, 26);
  c.fillStyle = stone;
  for (let mx = 1180; mx < 2420; mx += 30) c.fillRect(mx, 540, 16, 22);
  c.fillStyle = "#3b3a4a";
  for (let wx = 1240; wx < 2400; wx += 90) c.fillRect(wx, 620, 6, 34);
  for (const [tx, tw, ty] of towers2) {
    c.fillStyle = stone;
    c.fillRect(tx - tw / 2, ty, tw, 560 - ty);
    c.fillStyle = stoneSh;
    c.fillRect(tx + tw * 0.18, ty, tw * 0.32, 560 - ty);
    for (let mx = tx - tw / 2; mx < tx + tw / 2 - 12; mx += 22) {
      c.fillStyle = stone;
      c.fillRect(mx, ty - 18, 14, 20);
    }
    c.fillStyle = "#3b3a4a";
    c.fillRect(tx - 3, ty + 40, 6, 30);
    c.fillRect(tx - 3, ty + 110, 6, 30);
  }
  const keep = towers2[2];
  c.fillStyle = "#3d4a7a";
  c.beginPath();
  c.moveTo(keep[0] - keep[1] * 0.62, keep[2] - 14);
  c.lineTo(keep[0], keep[2] - 110);
  c.lineTo(keep[0] + keep[1] * 0.62, keep[2] - 14);
  c.closePath();
  c.fill();
  c.fillStyle = "#2a3560";
  c.beginPath();
  c.moveTo(keep[0], keep[2] - 110);
  c.lineTo(keep[0] + keep[1] * 0.62, keep[2] - 14);
  c.lineTo(keep[0], keep[2] - 14);
  c.closePath();
  c.fill();
  c.fillStyle = "#3b2c22";
  c.beginPath();
  c.roundRect(keep[0] - 22, 700, 44, 100, [22, 22, 0, 0]);
  c.fill();
  for (const [tx, , ty] of [towers2[0], towers2[4]]) banner(c, tx, ty - 18);
  banner(c, keep[0], keep[2] - 110);
}
function banner(c, x, y) {
  const top = y - 62;
  c.fillStyle = "#2b2b30";
  c.fillRect(x - 2, top, 4, y - top);
  const bw = 46;
  poly(c, [[x + 2, top + 2], [x + 2 + bw, top + 8], [x + 2 + bw * 0.88, top + 26], [x + 2 + bw, top + 44], [x + 2, top + 40]], "#b3262e");
  ellipse(c, x + 2 + bw * 0.45, top + 22, 8, 8, "#f2c14e");
  c.fillStyle = shade("#b3262e", -0.2);
  c.fillRect(x + 2, top + 30, bw * 0.4, 10);
}
function moon(c) {
  glow(c, 2640, 150, 150, "#fff4d6", 0.3);
  ellipse(c, 2640, 150, 44, 44, "#fff4d6");
  ellipse(c, 2656, 140, 38, 38, "#0b1030");
}
function hills(c, L2) {
  c.fillStyle = "#7fa0a0";
  c.beginPath();
  c.moveTo(-MARGIN, 820);
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 40) c.lineTo(x, 650 + Math.sin(x / 380) * 40 + Math.sin(x / 150) * 12);
  c.lineTo(L2.width + MARGIN, 820);
  c.lineTo(-MARGIN, 820);
  c.fill();
  c.fillStyle = "#6a8f8e";
  c.beginPath();
  c.moveTo(-MARGIN, 820);
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 40) c.lineTo(x, 720 + Math.sin(x / 260 + 2) * 26);
  c.lineTo(L2.width + MARGIN, 820);
  c.lineTo(-MARGIN, 820);
  c.fill();
}
function square(c, L2) {
  const W17 = L2.width + MARGIN * 2;
  c.fillStyle = "#8c7b62";
  c.fillRect(-MARGIN, FLOOR_TOP, W17, BOTTOM - FLOOR_TOP);
  for (let y = FLOOR_TOP + 14, row3 = 0; y < BOTTOM; y += 20 + row3 * 2.2, row3++) {
    for (let x = -MARGIN + row3 % 2 * 16; x < L2.width + MARGIN; x += 34 + row3 * 2.5) {
      ellipse(c, x, y, 13 + row3 * 0.9, 7 + row3 * 0.5, shade("#8c7b62", (x * 13 + y) % 7 / 50 - 0.06));
    }
  }
  well(c, 1350, 872);
  c.fillStyle = "#a79679";
  c.fillRect(-MARGIN, FLOOR_TOP, W17, 14);
  c.fillStyle = "#6b5b47";
  c.fillRect(-MARGIN, FLOOR_TOP + 14, W17, 3);
}
function well(c, x, base) {
  c.fillStyle = "#5a4a3a";
  c.fillRect(x - 74, base - 170, 12, 170);
  c.fillRect(x + 62, base - 170, 12, 170);
  bricks(c, x - 84, base - 110, 168, 110, "#b9ad98", 30, 18);
  ellipse(c, x, base - 110, 74, 16, "#2f4a55");
  c.strokeStyle = "#6e8c96";
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(x, base - 110, 74, 16, 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = "#c99a5b";
  c.fillRect(x - 84, base - 116, 168, 8);
  c.fillStyle = "#4a2c1a";
  c.fillRect(x - 70, base - 190, 140, 10);
  c.beginPath();
  c.moveTo(x - 100, base - 180);
  c.lineTo(x, base - 250);
  c.lineTo(x + 100, base - 180);
  c.closePath();
  c.fillStyle = "#a8432e";
  c.fill();
  c.fillStyle = shade("#a8432e", -0.25);
  c.beginPath();
  c.moveTo(x, base - 250);
  c.lineTo(x + 100, base - 180);
  c.lineTo(x, base - 180);
  c.closePath();
  c.fill();
  c.strokeStyle = "#6a5a48";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x + 4, base - 190);
  c.lineTo(x + 4, base - 120);
  c.stroke();
  box(c, x - 10, base - 120, 30, 26, "#8a6a4a", 4);
}
function tavernSign(c, x, lit2) {
  if (lit2) {
    glow(c, x + 40, 520, 90, "#ffb347", 0.4);
    return;
  }
  c.fillStyle = "#4a2c1a";
  c.fillRect(x, 430, 10, 350);
  c.fillRect(x + 8, 470, 90, 8);
  box(c, x + 52, 490, 72, 66, "#e6c48a", 6);
  c.fillStyle = "#8a4a2b";
  c.fillRect(x + 72, 508, 26, 32);
  c.fillStyle = "#fff6dc";
  c.fillRect(x + 72, 508, 26, 8);
  c.fillStyle = "#c99a5b";
  c.fillRect(x + 98, 516, 6, 14);
}
function foreground(c, L2) {
  barrel(c, 690, 1160, 120, 180);
  barrel(c, 820, 1170, 100, 150);
  c.fillStyle = "#7a5a3a";
  c.fillRect(2250, 1040, 150, 140);
  c.strokeStyle = DARK_WOOD;
  c.lineWidth = 4;
  c.strokeRect(2250, 1040, 150, 140);
  c.beginPath();
  c.moveTo(2250, 1040);
  c.lineTo(2400, 1180);
  c.stroke();
  c.fillStyle = DARK_WOOD;
  c.fillRect(L2.width - 40, 900, 30, 300);
  c.fillStyle = "#6a4a2c";
  c.fillRect(L2.width - 40, 900, 10, 300);
}
function barrel(c, x, base, w, h) {
  box(c, x, base - h, w, h, "#9a6236", 14);
  c.strokeStyle = DARK_WOOD;
  c.lineWidth = 5;
  for (const t of [0.2, 0.8]) {
    c.beginPath();
    c.moveTo(x + 1, base - h * t);
    c.lineTo(x + w - 1, base - h * t);
    c.stroke();
  }
  ellipse(c, x + w / 2, base - h, w / 2, 10, "#c49a63");
}
var medieval = {
  id: "medieval",
  name: "Medieval Town",
  icon: "\u{1F3F0}",
  blurb: "A half-timbered market square under a castle on the hill, with a stone well and torches by the doors.",
  width: 3200,
  interior: false,
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: (tod) => {
    const night = TOD[tod].dark > 0.4;
    const out = [
      { depth: 6e3, fog: 0.3, band: [330, 820], draw: hills },
      { depth: 2500, fog: 0.18, band: [120, 820], draw: (c) => castle(c, false) },
      { depth: 900, band: [120, 840], draw: (c) => backRow(c, false) },
      { depth: 600, band: [150, 850], draw: (c) => nearRow(c, false) },
      { depth: 300, band: [400, 500], draw: (c) => tavernSign(c, 2030, false) },
      { depth: 0, band: [FLOOR_TOP - 10, BOTTOM], draw: square },
      { depth: -380, band: [880, BOTTOM], draw: foreground }
    ];
    if (night) {
      out.push(
        { depth: 9e3, emissive: true, band: [0, 300], draw: moon },
        { depth: 2500, emissive: true, band: [120, 820], draw: (c) => castle(c, true) },
        { depth: 900, emissive: true, band: [120, 840], draw: (c) => backRow(c, true) },
        { depth: 600, emissive: true, band: [150, 850], draw: (c) => nearRow(c, true) },
        { depth: 300, emissive: true, band: [400, 600], draw: (c) => tavernSign(c, 2030, true) }
      );
    }
    return out;
  },
  marks: { left: 300, door1: 620, well: 1350, centre: 1600, church: 1500, door2: 2080, right: 2800 },
  ambience: "city-old",
  music: "epic",
  suggest: ["torch", "banner", "market-tent", "hay-cart", "armor-stand", "stocks", "barrel", "cauldron", "goblet", "anvil"]
};

// src/sets/bazaar.ts
var SANDSTONE = ["#e2b98a", "#d9a86c", "#efd3a4", "#c98e5a", "#e9c896"];
var AWN = ["#c8402b", "#f6ecd6", "#2f8a8a", "#f6ecd6", "#e0a53a", "#f6ecd6"];
var CARPET = ["#9b2d2d", "#2f5f8a", "#e2b04a", "#2c6b4f", "#b8472e"];
var GOLD = "#f2d28a";
var LIT2 = "#ffc86b";
var DOOR_DARK = "#4d3320";
var FLOOR_TOP2 = 790;
var MAIN = [];
var NEAR_LEFT2 = [];
var NEAR_RIGHT2 = [];
function row(x0, x1, seed, skip, out) {
  const r = rng(seed);
  let x = x0;
  let i = 0;
  while (x < x1) {
    const w = Math.round(r.range(160, 220));
    if (skip && x + w > skip[0] && x < skip[1]) {
      x = skip[1];
      continue;
    }
    out.push({
      x,
      w,
      storeys: 2,
      wall: SANDSTONE[i % SANDSTONE.length],
      dome: i % 3 === 1,
      minaret: i === 4,
      carpet: i % 2 === 0 ? CARPET[i % CARPET.length] : void 0
    });
    x += w + 4;
    i++;
  }
  return out;
}
row(-520, 3920, 13, [1280, 2120], MAIN);
row(-520, 820, 27, null, NEAR_LEFT2);
row(2400, 3920, 31, null, NEAR_RIGHT2);
function arch(c, x, y, w, h, fill) {
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y + w / 2);
  c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  c.lineTo(x + w, y + h);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}
function facade(c, f, base, sh, lit2) {
  const top = base - f.storeys * sh;
  const cols = Math.max(2, Math.round(f.w / 66));
  const cw = f.w / cols;
  const ww = Math.max(14, cw * 0.36);
  const wh = sh * 0.5;
  const ow = cw * 0.6;
  const oh = sh * 0.78;
  const cx = (i) => f.x + (i + 0.5) * cw;
  const litWin = (st, i) => (i * 5 + st * 3 + Math.round(f.x)) % 4 < 2;
  const litDoor = (i) => (i * 7 + Math.round(f.x)) % 3 === 0;
  if (lit2) {
    for (let st = 1; st < f.storeys; st++) {
      for (let i = 0; i < cols; i++) {
        if (litWin(st, i)) arch(c, cx(i) - ww / 2, base - st * sh - sh * 0.22 - wh, ww, wh, LIT2);
      }
    }
    for (let i = 0; i < cols; i++) {
      if (litDoor(i)) arch(c, cx(i) - ow / 2, base - oh, ow, oh, LIT2);
    }
    return;
  }
  c.fillStyle = f.wall;
  c.fillRect(f.x, top, f.w, base - top);
  c.fillStyle = shade(f.wall, -0.14);
  c.fillRect(f.x + f.w * 0.82, top, f.w * 0.18, base - top);
  c.fillStyle = shade(f.wall, -0.08);
  c.fillRect(f.x - 6, top - 12, f.w + 12, 14);
  c.fillStyle = shade(f.wall, 0.1);
  c.fillRect(f.x - 6, top - 12, f.w + 12, 3);
  for (let st = 1; st < f.storeys; st++) {
    for (let i = 0; i < cols; i++) {
      const wx = cx(i) - ww / 2;
      const wy = base - st * sh - sh * 0.22 - wh;
      arch(c, wx - 3, wy - 3, ww + 6, wh + 6, shade(f.wall, -0.3));
      arch(c, wx, wy, ww, wh, "#3a2c24");
      c.fillStyle = "#6b4628";
      c.fillRect(wx - 2, base - st * sh - sh * 0.22, ww + 4, 6);
    }
    if (f.carpet && st === 1) {
      const kx = f.x + f.w * 0.3;
      c.fillStyle = f.carpet;
      c.fillRect(kx, top + 16, f.w * 0.4, sh * 0.8);
      c.strokeStyle = GOLD;
      c.lineWidth = 3;
      c.strokeRect(kx + 6, top + 22, f.w * 0.4 - 12, sh * 0.8 - 12);
      poly(c, [[kx + f.w * 0.2, top + 26], [kx + f.w * 0.3, top + 16 + sh * 0.4], [kx + f.w * 0.2, top + 16 + sh * 0.8 - 6], [kx + f.w * 0.1, top + 16 + sh * 0.4]], GOLD);
    }
  }
  for (let i = 0; i < cols; i++) {
    arch(c, cx(i) - ow / 2, base - oh, ow, oh, DOOR_DARK);
    if (i % 2 === 0) {
      c.fillStyle = CARPET[(i + Math.round(f.x)) % CARPET.length];
      c.fillRect(cx(i) - ow * 0.3, base - oh * 0.8, ow * 0.6, oh * 0.6);
      c.fillStyle = GOLD;
      c.fillRect(cx(i) - ow * 0.3, base - oh * 0.8, ow * 0.6, 3);
    } else {
      c.fillStyle = shade(f.wall, -0.42);
      for (let k = 0; k < 4; k++) c.fillRect(cx(i) - ow * 0.4, base - oh * 0.75 + k * (oh * 0.17), ow * 0.8, 3);
    }
  }
  c.fillStyle = shade(f.wall, 0.08);
  for (let i = 0; i <= cols; i++) c.fillRect(f.x + i * cw - cw * 0.2 - 3, base - oh, 6, oh);
  c.fillStyle = shade(f.wall, -0.2);
  c.fillRect(f.x, base - 12, f.w, 12);
  if (f.dome) dome(c, f.x + f.w / 2, top - 12, Math.min(f.w * 0.3, 56), shade(f.wall, 0.06), "#d9b25f");
  if (f.minaret) minaret(c, f.x + f.w - 26, base, 520, shade(f.wall, 0.04));
}
function dunes(c, L2) {
  c.fillStyle = "#e8cb94";
  c.beginPath();
  c.moveTo(-MARGIN, 820);
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 40) c.lineTo(x, 640 + Math.sin(x / 420) * 40 + Math.sin(x / 150 + 1) * 10);
  c.lineTo(L2.width + MARGIN, 820);
  c.lineTo(-MARGIN, 820);
  c.fill();
  c.fillStyle = "#d9b26f";
  c.beginPath();
  c.moveTo(-MARGIN, 820);
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 40) c.lineTo(x, 720 + Math.sin(x / 300 + 2) * 30);
  c.lineTo(L2.width + MARGIN, 820);
  c.lineTo(-MARGIN, 820);
  c.fill();
}
function skyline(c, L2) {
  const r = rng(41);
  const base = 740;
  const col = "#d7b07a";
  const shadeCol = "#b98b56";
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 90) {
    const h = 60 + r() * 70;
    c.fillStyle = r() < 0.5 ? col : shadeCol;
    c.fillRect(x, base - h, 90, h + 60);
  }
  const mx = 1600;
  c.fillStyle = col;
  c.fillRect(mx - 130, base - 80, 260, 80);
  dome(c, mx, base - 80, 84, "#e9c896", "#d9b25f");
  dome(c, mx - 150, base - 40, 36, col, "#d9b25f");
  dome(c, mx + 150, base - 40, 36, col, "#d9b25f");
  minaret(c, mx - 190, base, 360, col);
  minaret(c, mx + 190, base, 360, col);
  dome(c, 1e3, base - 20, 46, col, "#d9b25f");
  dome(c, 2300, base - 20, 52, col, "#d9b25f");
  dome(c, 480, base - 30, 40, shadeCol, "#d9b25f");
  minaret(c, 2740, base, 300, shadeCol);
  for (const [px, ph] of [[320, 240], [880, 200], [2050, 230], [2700, 250], [3180, 210]]) {
    palm(c, px, base + 10, ph, "#8a6a3a", "#3f7a3a", rng(px));
  }
}
function nearShops(c, lit2) {
  const base = 830;
  const sh = 262;
  for (const f of NEAR_LEFT2) facade(c, f, base, sh, lit2);
  for (const f of NEAR_RIGHT2) facade(c, f, base, sh, lit2);
  if (!lit2) for (const f of NEAR_LEFT2) awningsFor(c, f, base, sh);
  if (!lit2) for (const f of NEAR_RIGHT2) awningsFor(c, f, base, sh);
}
function awningsFor(c, f, base, sh) {
  const cols = Math.max(2, Math.round(f.w / 66));
  const cw = f.w / cols;
  const y = base - sh * 0.82;
  for (let i = 0; i < cols; i += 2) {
    const x0 = f.x + i * cw + cw * 0.05;
    const aw = cw * 1.8;
    const n = 6;
    for (let k = 0; k < n; k++) {
      const sx = x0 + k * aw / n;
      const sw = aw / n;
      c.fillStyle = AWN[(k + i) % AWN.length];
      c.fillRect(sx, y, sw, 32);
      ellipse(c, sx + sw / 2, y + 32, sw / 2, 9, AWN[(k + i) % AWN.length]);
    }
    c.fillStyle = shade(AWN[0], -0.2);
    c.fillRect(x0, y - 4, aw, 5);
  }
}
function floor(c, L2) {
  const W17 = L2.width + MARGIN * 2;
  c.fillStyle = "#d7b07a";
  c.fillRect(-MARGIN, FLOOR_TOP2, W17, BOTTOM - FLOOR_TOP2);
  c.strokeStyle = "#b98b56";
  c.lineWidth = 2;
  for (let y = FLOOR_TOP2 + 8, row3 = 0; y < BOTTOM; y += 18 + row3 * 2.4, row3++) {
    c.beginPath();
    c.moveTo(-MARGIN, y);
    c.lineTo(L2.width + MARGIN, y);
    c.stroke();
    for (let x = -MARGIN + row3 % 2 * 40; x < L2.width + MARGIN; x += 80 + row3 * 5) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 18 + row3 * 2.4);
      c.stroke();
    }
  }
  c.fillStyle = "#9b2d2d";
  c.fillRect(-MARGIN, 930, W17, 46);
  c.fillStyle = GOLD;
  c.fillRect(-MARGIN, 936, W17, 4);
  c.fillRect(-MARGIN, 966, W17, 4);
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 56) {
    poly(c, [[x, 953], [x + 22, 942], [x + 44, 953], [x + 22, 964]], x % 112 < 56 ? "#2f5f8a" : "#e2b04a");
  }
  for (const [px, s] of [[260, 1], [2990, 1.2], [1020, 0.8]]) {
    ellipse(c, px, 842, 34 * s, 11 * s, "#7a4a2a");
    c.fillStyle = "#b8642e";
    c.beginPath();
    c.moveTo(px - 30 * s, 842);
    c.quadraticCurveTo(px - 36 * s, 800, px - 12 * s, 790);
    c.lineTo(px + 12 * s, 790);
    c.quadraticCurveTo(px + 36 * s, 800, px + 30 * s, 842);
    c.closePath();
    c.fill();
    c.fillStyle = "#e09a5a";
    c.fillRect(px - 14 * s, 786, 28 * s, 6 * s);
  }
}
function canopies(c) {
  const poles = [700, 1250, 2150, 2700];
  c.fillStyle = "#4a2c1a";
  for (const px of poles) c.fillRect(px - 5, 150, 10, 700);
  canopy(c, -MARGIN, 700, 100);
  canopy(c, 700, 1250, 90);
  canopy(c, 1250, 2150, 60);
  canopy(c, 2150, 2700, 90);
  canopy(c, 2700, 3900, 100);
  c.strokeStyle = "#8a1f1f";
  c.lineWidth = 3;
  for (const px of poles) {
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.moveTo(px - 22 + k * 15, 176);
      c.lineTo(px - 22 + k * 15, 200);
      c.stroke();
    }
  }
}
function canopy(c, x0, x1, y) {
  const sw = 34;
  for (let x = x0, k = 0; x < x1; x += sw, k++) {
    const w = Math.min(sw, x1 - x);
    c.fillStyle = k % 2 ? AWN[1] : AWN[0];
    c.fillRect(x, y, w, 70);
    c.beginPath();
    c.arc(x + w / 2, y + 70, w / 2, 0, Math.PI);
    c.fill();
  }
  c.fillStyle = "rgba(0,0,0,0.12)";
  c.fillRect(x0, y + 66, x1 - x0, 6);
}
function lanterns(c, lit2) {
  const xs = [420, 900, 1380, 1860, 2340, 2820];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = 360;
    if (lit2) {
      glow(c, x, y + 20, 110, "#ffb347", 0.55);
      c.fillStyle = "#ffe49a";
      c.fillRect(x - 12, y, 24, 36);
      continue;
    }
    c.strokeStyle = "#3b2a1c";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - 240, 240);
    c.quadraticCurveTo(x - 120, 300, x, y - 6);
    c.quadraticCurveTo(x + 120, 300, x + 240, 240);
    c.stroke();
    c.fillStyle = "#b8862e";
    c.beginPath();
    c.moveTo(x - 14, y + 10);
    c.lineTo(x - 22, y + 24);
    c.lineTo(x + 22, y + 24);
    c.lineTo(x + 14, y + 10);
    c.closePath();
    c.fill();
    c.fillStyle = i % 2 ? "#e0603a" : "#2f8a8a";
    c.fillRect(x - 12, y + 14, 24, 28);
    c.fillStyle = "#b8862e";
    c.fillRect(x - 16, y + 42, 32, 6);
    c.beginPath();
    c.moveTo(x - 14, y + 48);
    c.lineTo(x, y + 58);
    c.lineTo(x + 14, y + 48);
    c.closePath();
    c.fill();
  }
}
function foreground2(c, L2) {
  for (let k = 0; k < 3; k++) {
    c.fillStyle = CARPET[k];
    c.fillRect(L2.width - 300, 1020 - k * 34, 260, 34);
    c.fillStyle = GOLD;
    c.fillRect(L2.width - 300, 1032 - k * 34, 260, 3);
  }
  c.fillStyle = "#7a3a1a";
  c.beginPath();
  c.ellipse(L2.width - 300, 1003, 16, 34, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#c99a3a";
  c.beginPath();
  c.ellipse(340, 1110, 150, 26, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#e2b04a";
  c.beginPath();
  c.ellipse(340, 1104, 120, 18, 0, 0, Math.PI * 2);
  c.fill();
}
var bazaar = {
  id: "bazaar",
  name: "Middle-East Bazaar",
  icon: "\u{1F54C}",
  blurb: "A sandstone bazaar of arcaded shops under striped awnings, lanterns strung across the street and palms beyond the dunes.",
  width: 3400,
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: (tod) => {
    const dim = TOD[tod].dark > 0.4;
    const out = [
      { depth: 6e3, fog: 0.22, band: [520, 830], draw: dunes },
      { depth: 3e3, fog: 0.3, band: [180, 830], draw: skyline },
      { depth: 900, band: [120, 840], draw: (c) => mainRow(c, false) },
      { depth: 600, band: [260, 860], draw: (c) => nearShops(c, false) },
      { depth: 300, band: [90, 900], draw: (c) => canopies(c) },
      { depth: 300, band: [280, 420], draw: (c) => lanterns(c, false) },
      { depth: 0, band: [FLOOR_TOP2 - 10, BOTTOM], draw: floor },
      { depth: -380, band: [880, BOTTOM], draw: foreground2 }
    ];
    if (dim) {
      out.push(
        { depth: 900, emissive: true, band: [120, 840], draw: (c) => mainRow(c, true) },
        { depth: 600, emissive: true, band: [260, 860], draw: (c) => nearShops(c, true) },
        { depth: 300, emissive: true, band: [280, 420], draw: (c) => lanterns(c, true) }
      );
    }
    return out;
  },
  marks: { left: 420, arch: 900, lanterns: 1380, centre: 1700, shop: 2340, carpet: 2820, right: 3050 },
  ambience: "market",
  music: "bazaar",
  suggest: ["spice-stall", "carpet-stall", "lantern-stall", "copper-pots", "hookah", "pottery", "tea-tray", "cezve", "fruit-stall", "camel"]
};
function mainRow(c, lit2) {
  for (const f of MAIN) facade(c, f, 800, 221, lit2);
}

// src/sets/city.ts
var LIT3 = "#ffd77a";
var NEON = ["#ff4fa3", "#41e0ff", "#ffe14d", "#7dff8a"];
var SIGN = ["#e63946", "#2a9d8f", "#f4a261", "#264653", "#8338ec", "#ffb703"];
var PAVE = "#c9ccd2";
var KERB = "#e8e8ea";
var ASPHALT = "#4a4e57";
var GLASS = "#6f97ad";
var GLASS_DARK = "#4f7185";
var CONCRETE = ["#b9c0c8", "#c7ccd2", "#a9b1bb", "#d6d9de"];
var PAVE_TOP = 780;
var ROAD_TOP = 912;
function skyline2(c, L2, lit2) {
  const r = rng(71);
  const base = 780;
  if (lit2) {
    for (let x = -MARGIN; x < L2.width + MARGIN; x += 14) {
      for (let y = 300; y < base - 20; y += 16) {
        if (r() < 0.12) {
          c.fillStyle = r() < 0.5 ? LIT3 : "#bfe4ff";
          c.fillRect(x + (r() * 6 | 0), y, 4, 6);
        }
      }
    }
    return;
  }
  c.fillStyle = "#8ea3bb";
  c.fillRect(-MARGIN, base - 60, L2.width + MARGIN * 2, 70);
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 36 + Math.floor(r() * 40)) {
    const w = 36 + r() * 60;
    const h = 150 + r() * 260;
    c.fillStyle = r() < 0.5 ? "#8ea3bb" : "#7a90aa";
    c.fillRect(x, base - h, w, h + 40);
    if (r() < 0.2) {
      c.fillStyle = "#7a90aa";
      c.fillRect(x + w * 0.3, base - h - 50, w * 0.4, 50);
    }
  }
  c.fillStyle = "#6f84a0";
  c.fillRect(1540, 200, 70, 600);
  c.fillRect(1572, 110, 6, 100);
}
var r2000 = rng(93);
var TOWERS = [];
for (let x = -520, i = 0; x < 3920; i++) {
  const w = 170 + r2000() * 170;
  TOWERS.push({ x, w, h: 430 + r2000() * 300, kind: i % 3 === 1 ? "concrete" : "glass", col: CONCRETE[i % CONCRETE.length] });
  x += w + 2;
}
function towers(c, lit2) {
  const base = 830;
  for (const t of TOWERS) {
    const top = base - t.h;
    if (lit2) {
      const cols = Math.max(3, Math.floor(t.w / 24));
      const rows = Math.floor(t.h / 26);
      for (let row3 = 0; row3 < rows; row3++) {
        for (let k = 0; k < cols; k++) {
          if ((row3 * 7 + k * 13 + Math.round(t.x)) % 11 < 4) {
            c.fillStyle = (row3 + k) % 5 === 0 ? "#ffe9a8" : LIT3;
            c.fillRect(t.x + 12 + k * ((t.w - 24) / cols), top + 14 + row3 * 26, 9, 11);
          }
        }
      }
      continue;
    }
    c.fillStyle = t.kind === "glass" ? GLASS : t.col;
    c.fillRect(t.x, top, t.w, t.h);
    c.fillStyle = shade(t.kind === "glass" ? GLASS : t.col, -0.16);
    c.fillRect(t.x + t.w * 0.7, top, t.w * 0.3, t.h);
    if (t.kind === "glass") {
      c.fillStyle = GLASS_DARK;
      for (let y = top + 26; y < base; y += 26) c.fillRect(t.x, y, t.w, 3);
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.fillRect(t.x + t.w * 0.12, top, t.w * 0.08, t.h);
    } else {
      const cols = Math.max(3, Math.floor(t.w / 30));
      const rows = Math.floor(t.h / 32);
      c.fillStyle = "#5d7b92";
      for (let row3 = 0; row3 < rows; row3++)
        for (let k = 0; k < cols; k++) c.fillRect(t.x + 10 + k * ((t.w - 20) / cols), top + 14 + row3 * 32, 12, 16);
    }
    if (t.h > 500) {
      c.fillStyle = shade(t.col, -0.05);
      c.fillRect(t.x + t.w * 0.2, top - 40, t.w * 0.6, 40);
      c.fillRect(t.x + t.w * 0.48, top - 90, 4, 50);
    }
  }
}
function shopfront(c, x, w, seed, lit2) {
  const base = 800;
  const sh = 247;
  const upperTop = base - 2 * sh;
  const groundTop = base - sh;
  const wall2 = ["#ece4d4", "#d8dde3", "#b5664a", "#e6d7bd"][seed % 4];
  const sign = SIGN[seed % SIGN.length];
  const neon = NEON[seed % NEON.length];
  if (lit2) {
    for (let k = 0; k < 2; k++) {
      if ((seed + k) % 3 !== 0) {
        c.fillStyle = LIT3;
        c.fillRect(x + w * (0.16 + k * 0.42), upperTop + 40, w * 0.26, 110);
      }
    }
    c.fillStyle = seed % 2 ? "#ffe9b0" : LIT3;
    c.fillRect(x + 12, groundTop + 36, w - 24, sh - 60);
    c.fillStyle = neon;
    c.fillRect(x + w * 0.18, groundTop - 40, w * 0.64, 6);
    glow(c, x + w / 2, groundTop - 36, 110, neon, 0.35);
    return;
  }
  c.fillStyle = wall2;
  c.fillRect(x, upperTop, w, 2 * sh);
  c.fillStyle = shade(wall2, -0.14);
  c.fillRect(x + w * 0.84, upperTop, w * 0.16, 2 * sh);
  c.fillStyle = shade(wall2, -0.25);
  c.fillRect(x - 3, upperTop - 10, w + 6, 12);
  for (let k = 0; k < 2; k++) {
    const wx = x + w * (0.16 + k * 0.42);
    c.fillStyle = "#4c3b33";
    c.fillRect(wx - 4, upperTop + 36, w * 0.26 + 8, 118);
    c.fillStyle = GLASS;
    c.fillRect(wx, upperTop + 40, w * 0.26, 110);
    c.fillStyle = "rgba(255,255,255,0.3)";
    c.beginPath();
    c.moveTo(wx + w * 0.04, upperTop + 150);
    c.lineTo(wx + w * 0.12, upperTop + 40);
    c.lineTo(wx + w * 0.16, upperTop + 40);
    c.lineTo(wx + w * 0.08, upperTop + 150);
    c.fill();
  }
  if (seed % 2 === 0) {
    c.fillStyle = "#3d3d44";
    c.fillRect(x + 4, upperTop + 2 * sh - 8 - 170, w - 8, 3);
    for (let px = x + 4; px < x + w - 4; px += 10) c.fillRect(px, upperTop + 2 * sh - 8 - 170 - 22, 2, 22);
  }
  box(c, x + 8, groundTop - 38, w - 16, 30, sign, 4);
  c.fillStyle = "rgba(255,255,255,0.85)";
  for (let k = 0; k < 3; k++) c.fillRect(x + 22 + k * ((w - 60) / 3), groundTop - 28, (w - 60) / 3 - 12, 9);
  c.fillStyle = "#2d3440";
  c.fillRect(x + 6, groundTop + 6, w - 12, sh - 6);
  c.fillStyle = "#9dd0e4";
  c.fillRect(x + 12, groundTop + 14, w - 24, sh - 22);
  c.fillStyle = "rgba(255,255,255,0.4)";
  c.beginPath();
  c.moveTo(x + 20, groundTop + sh - 12);
  c.lineTo(x + w * 0.4, groundTop + 14);
  c.lineTo(x + w * 0.5, groundTop + 14);
  c.lineTo(x + 30, groundTop + sh - 12);
  c.fill();
  c.fillStyle = "#2d3440";
  c.fillRect(x + w / 2 - 2, groundTop + 14, 4, sh - 22);
  c.fillStyle = shade(wall2, -0.35);
  c.fillRect(x + 4, base - 10, w - 8, 10);
}
function cafe(c, x, w, lit2) {
  const groundTop = 800 - 247;
  if (lit2) {
    c.fillStyle = "#ffe2a0";
    c.fillRect(x + 12, groundTop + 36, w - 24, 247 - 60);
    for (let k = 0; k < 4; k++) {
      c.fillStyle = k % 2 ? "#ffd77a" : "#ffb347";
      c.beginPath();
      c.arc(x + 30 + k * ((w - 60) / 3), groundTop + 22, 7, 0, Math.PI * 2);
      c.fill();
    }
    glow(c, x + w / 2, groundTop + 60, 150, "#ffd77a", 0.35);
    return;
  }
  c.fillStyle = "#2d3440";
  c.fillRect(x + 6, groundTop + 6, w - 12, 247 - 6);
  c.fillStyle = "#f5e7c4";
  c.fillRect(x + 12, groundTop + 14, w - 24, 247 - 22);
  c.fillStyle = "#4f8f6a";
  c.fillRect(x + 12, groundTop + 14, w - 24, 3);
  for (let k = 0; k < 8; k++) {
    const sw = (w + 16) / 8;
    const sx = x - 8 + k * sw;
    c.fillStyle = k % 2 ? "#f5efe0" : "#2f7d55";
    c.fillRect(sx, groundTop - 6, sw, 44);
    ellipse(c, sx + sw / 2, groundTop + 38, sw / 2, 8, k % 2 ? "#f5efe0" : "#2f7d55");
  }
  for (const tx of [x + w * 0.28, x + w * 0.74]) {
    c.fillStyle = "#4a4e57";
    c.fillRect(tx - 2, 760, 4, 28);
    ellipse(c, tx, 760, 22, 6, "#f5efe0");
    c.fillStyle = "#2f7d55";
    c.fillRect(tx - 34, 780, 10, 22);
    c.fillRect(tx + 24, 780, 10, 22);
  }
}
function shops(c, lit2) {
  for (const s of SHOPS) {
    if (s.cafe) cafe(c, s.x, s.w, lit2);
    else shopfront(c, s.x, s.w, s.seed, lit2);
  }
  if (lit2) {
    const cafeShop = SHOPS.find((s) => s.cafe);
    const cx = cafeShop.x + cafeShop.w / 2;
    c.fillStyle = "#ff4fa3";
    c.fillRect(cx - 70, 510, 140, 6);
    glow(c, cx, 514, 90, "#ff4fa3", 0.4);
  }
}
var SHOPS = [];
{
  const r = rng(51);
  let x = -520;
  let i = 0;
  let cafeDone = false;
  while (x < 3920) {
    if (!cafeDone && x > 900) {
      SHOPS.push({ x, w: 230, seed: i, cafe: true });
      cafeDone = true;
      x += 234;
      i++;
      continue;
    }
    const w = Math.round(170 + r() * 60);
    SHOPS.push({ x, w, seed: i });
    x += w + 4;
    i++;
  }
}
function street(c, lit2) {
  const base = 840;
  if (lit2) {
    for (const x of [300, 1100, 1900, 2700, 3400]) {
      glow(c, x + 44, 544, 130, "#ffe49a", 0.5);
      c.fillStyle = "#fff4c8";
      c.fillRect(x + 32, 534, 26, 12);
    }
    return;
  }
  const r = rng(19);
  for (const [tx, th] of [[600, 440], [2080, 430], [3040, 460]]) {
    tree(c, tx, base, th, r);
  }
  for (const x of [300, 1100, 1900, 2700, 3400]) {
    c.fillStyle = "#3d4149";
    c.fillRect(x - 5, 540, 10, 300);
    c.fillRect(x - 18, 826, 36, 14);
    c.fillRect(x, 540, 40, 7);
    c.fillStyle = "#e8ecf2";
    c.fillRect(x + 30, 534, 26, 12);
  }
}
function tree(c, x, base, h, r) {
  roundTree(c, x, base - 30, h, "#6b4a2e", "#4f9a4a", r, "#7fc27a");
  c.fillStyle = "#b9b3a6";
  c.fillRect(x - 60, base - 40, 120, 40);
  c.fillStyle = shade("#b9b3a6", -0.2);
  c.fillRect(x - 60, base - 8, 120, 8);
}
function ground(c, L2) {
  const W17 = L2.width + MARGIN * 2;
  c.fillStyle = PAVE;
  c.fillRect(-MARGIN, PAVE_TOP, W17, ROAD_TOP - PAVE_TOP);
  c.strokeStyle = "#b0b5bd";
  c.lineWidth = 2;
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 90) {
    c.beginPath();
    c.moveTo(x, PAVE_TOP);
    c.lineTo(x, ROAD_TOP);
    c.stroke();
  }
  c.fillStyle = KERB;
  c.fillRect(-MARGIN, ROAD_TOP - 12, W17, 12);
  c.fillStyle = "#9ea4ad";
  c.fillRect(-MARGIN, ROAD_TOP - 2, W17, 3);
  c.fillStyle = ASPHALT;
  c.fillRect(-MARGIN, ROAD_TOP, W17, BOTTOM - ROAD_TOP);
  c.fillStyle = "rgba(255,255,255,0.05)";
  const r = rng(5);
  for (let i = 0; i < 260; i++) c.fillRect(-MARGIN + r() * W17, ROAD_TOP + 10 + r() * (BOTTOM - ROAD_TOP), 3 + r() * 4, 2);
  c.fillStyle = "#f2efe6";
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 120) c.fillRect(x, 1040, 60, 7);
  for (let x = 1500; x < 1800; x += 40) c.fillRect(x, ROAD_TOP + 14, 22, 150);
  ellipse(c, 2300, 1120, 60, 10, "#3d4048");
}
function foreground3(c) {
  c.fillStyle = "#ff7a2f";
  c.beginPath();
  c.moveTo(2220, 1160);
  c.lineTo(2246, 1080);
  c.lineTo(2274, 1080);
  c.lineTo(2300, 1160);
  c.closePath();
  c.fill();
  c.fillStyle = "#f5f5f5";
  c.fillRect(2236, 1110, 48, 8);
  c.fillStyle = "#2a2d34";
  c.fillRect(2430, 1040, 24, 130);
  c.fillStyle = "#e8e8ea";
  c.fillRect(2430, 1060, 24, 14);
}
var city = {
  id: "city",
  name: "Modern City",
  icon: "\u{1F3D9}\uFE0F",
  blurb: "A glass-and-concrete street with a caf\xE9 under a striped awning, a zebra crossing and towers fading into haze.",
  width: 3600,
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: (tod) => {
    const dim = TOD[tod].dark > 0.4;
    const out = [
      { depth: 7e3, fog: 0.4, band: [100, 800], draw: (c, L2) => skyline2(c, L2, false) },
      { depth: 2e3, fog: 0.12, band: [90, 830], draw: (c) => towers(c, false) },
      { depth: 700, band: [100, 860], draw: (c) => shops(c, false) },
      { depth: 300, band: [100, 900], draw: (c) => street(c, false) },
      { depth: 0, band: [PAVE_TOP - 10, BOTTOM], draw: ground },
      { depth: -380, band: [1020, BOTTOM], draw: (c) => foreground3(c) }
    ];
    if (dim) {
      out.push(
        { depth: 7e3, emissive: true, band: [100, 800], draw: (c, L2) => skyline2(c, L2, true) },
        { depth: 2e3, emissive: true, band: [90, 830], draw: (c) => towers(c, true) },
        { depth: 700, emissive: true, band: [100, 860], draw: (c) => shops(c, true) },
        { depth: 300, emissive: true, band: [480, 600], draw: (c) => street(c, true) }
      );
    }
    return out;
  },
  marks: { left: 420, shop: 700, cafe: 1e3, centre: 1700, crossing: 1650, shop2: 2400, right: 2950 },
  ambience: "city",
  music: "action",
  suggest: ["bus-stop", "bench", "taxi", "car-modern", "newspaper-stand", "neon-sign", "cafe-table", "billboard", "atm", "trash-can"]
};

// src/sets/istanbul.ts
var HOUSE_COLS = ["#c96f4a", "#e3b25e", "#7fa7a0", "#d98c8c", "#b7a07a", "#8fa6c9", "#e2d4b5"];
function skyline3(c, L2) {
  const base = 600;
  const col = L2.tod === "night" ? "#2a3150" : L2.tod === "dusk" ? "#6b4f6e" : "#8a98b8";
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(-MARGIN, base);
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 40) c.lineTo(x, base - 40 - Math.sin(x / 520) * 30 - Math.sin(x / 170) * 8);
  c.lineTo(L2.width + MARGIN, base + 20);
  c.lineTo(-MARGIN, base + 20);
  c.fill();
  for (const [mx, s] of [[300, 1], [1250, 1.35], [2350, 1.1], [3300, 0.9]]) {
    const y = base - 70;
    c.fillStyle = col;
    c.fillRect(mx - 120 * s, y - 30 * s, 240 * s, 40 * s);
    dome(c, mx, y - 30 * s, 75 * s, shade(col, 0.05), shade(col, 0.2));
    dome(c, mx - 110 * s, y - 20 * s, 30 * s, col, shade(col, 0.2));
    dome(c, mx + 110 * s, y - 20 * s, 30 * s, col, shade(col, 0.2));
    minaret(c, mx - 170 * s, y + 10, 230 * s, shade(col, 0.05));
    minaret(c, mx + 170 * s, y + 10, 230 * s, shade(col, 0.05));
    if (s > 1.2) {
      minaret(c, mx - 230 * s, y + 10, 180 * s, shade(col, 0.05));
      minaret(c, mx + 230 * s, y + 10, 180 * s, shade(col, 0.05));
    }
  }
  const gx = 1900;
  c.fillStyle = shade(col, 0.04);
  c.fillRect(gx - 34, base - 270, 68, 230);
  poly(c, [[gx - 44, base - 270], [gx, base - 350], [gx + 44, base - 270]], shade(col, -0.1));
  c.fillStyle = shade(col, -0.15);
  for (let i = 0; i < 4; i++) c.fillRect(gx - 26 + i * 16, base - 255, 8, 18);
}
function sea2(c, L2) {
  const y0 = 560;
  const p = TOD[L2.tod];
  c.fillStyle = vgrad(c, y0, 760, [[0, L2.tod === "night" ? "#1b2a4a" : shade(p.skyLow, -0.25)], [1, L2.tod === "night" ? "#0f1a33" : "#2e6f9e"]]);
  c.fillRect(-MARGIN, y0, L2.width + MARGIN * 2, 220);
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.lineWidth = 2;
  for (let i = 0; i < 90; i++) {
    const x = L2.r() * (L2.width + MARGIN * 2) - MARGIN;
    const y = y0 + 10 + L2.r() * 190;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 20 + L2.r() * 40, y);
    c.stroke();
  }
  const fx = L2.width * 0.62;
  const fy = y0 + 60;
  poly(c, [[fx - 120, fy], [fx + 130, fy], [fx + 100, fy + 28], [fx - 100, fy + 28]], "#f4f1ea");
  c.fillStyle = "#2b3a5c";
  c.fillRect(fx - 100, fy + 18, 200, 8);
  c.fillStyle = "#f4f1ea";
  c.fillRect(fx - 70, fy - 30, 140, 30);
  c.fillStyle = "#2b3a5c";
  for (let i = 0; i < 7; i++) c.fillRect(fx - 62 + i * 19, fy - 24, 11, 10);
  c.fillStyle = "#1b1b22";
  c.fillRect(fx - 8, fy - 60, 16, 30);
  c.strokeStyle = L2.tod === "night" ? "#8a90b0" : "#f4f6ff";
  c.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const x = L2.r() * L2.width;
    const y = 250 + L2.r() * 240;
    c.beginPath();
    c.moveTo(x - 14, y);
    c.quadraticCurveTo(x - 7, y - 9, x, y);
    c.quadraticCurveTo(x + 7, y - 9, x + 14, y);
    c.stroke();
  }
}
function house(c, x, w, col, L2, lit2) {
  const ground4 = 850;
  const h = 470 + Math.abs(x) * 7 % 90;
  const top = ground4 - h;
  const wood2 = col;
  c.fillStyle = wood2;
  c.fillRect(x, top, w, h);
  c.strokeStyle = shade(wood2, -0.2);
  c.lineWidth = 2;
  for (let xx = x + 12; xx < x + w; xx += 14) {
    c.beginPath();
    c.moveTo(xx, top);
    c.lineTo(xx, ground4);
    c.stroke();
  }
  bricks(c, x, ground4 - 210, w, 210, "#b9ad98", 56, 28);
  poly(c, [[x - 24, top + 6], [x + w / 2, top - 70], [x + w + 24, top + 6]], "#a8432e");
  c.fillStyle = "#7d2f20";
  c.fillRect(x - 24, top, w + 48, 10);
  const bx = x + w * 0.12;
  const bw = w * 0.76;
  const by = top + 30;
  c.fillStyle = shade(wood2, 0.08);
  c.fillRect(bx, by, bw, 170);
  poly(c, [[bx, by + 170], [bx + 30, by + 215], [bx + bw - 30, by + 215], [bx + bw, by + 170]], shade(wood2, -0.15));
  for (let i = 0; i < 3; i++) windowPane(c, bx + 16 + i * ((bw - 32) / 3), by + 18, (bw - 32) / 3 - 14, 125, "#f4efe2", lit2 && (i + Math.floor(Math.abs(x))) % 2 === 0);
  c.fillStyle = "#5a3a24";
  c.beginPath();
  c.roundRect(x + w * 0.62 - 42, ground4 - 195, 84, 195, [40, 40, 0, 0]);
  c.fill();
  c.fillStyle = "#4a2e1c";
  c.fillRect(x + w * 0.62 - 2, ground4 - 170, 4, 170);
  ellipse(c, x + w * 0.62 + 24, ground4 - 95, 5, 5, "#d9b25f");
  windowPane(c, x + w * 0.1, ground4 - 175, 70, 100, "#f4efe2", lit2 && Math.abs(x) % 3 < 1.5);
  if (Math.abs(Math.round(x / 10)) % 3 === 0) {
    const aw = w * 0.9;
    for (let i = 0; i < 8; i++) {
      const col2 = i % 2 ? "#f4f1ea" : "#c81d25";
      poly(c, [[x + w * 0.05 + i * aw / 8, ground4 - 225], [x + w * 0.05 + (i + 1) * aw / 8, ground4 - 225], [x + w * 0.05 + (i + 1) * aw / 8 + 6, ground4 - 190], [x + w * 0.05 + i * aw / 8 + 6, ground4 - 190]], col2);
    }
  }
  void L2;
}
function houses(c, L2) {
  const lit2 = TOD[L2.tod].dark > 0.5;
  let x = -MARGIN + 20;
  let i = 0;
  while (x < L2.width + MARGIN) {
    const w = 300 + i * 53 % 90;
    if (x + w > 1950 && x < 2950) {
      x = 2950;
      continue;
    }
    house(c, x, w, HOUSE_COLS[i % HOUSE_COLS.length], L2, lit2);
    x += w + 6;
    i++;
  }
}
function street2(c, L2) {
  const W17 = L2.width + MARGIN * 2;
  c.fillStyle = "#b8b0a2";
  c.fillRect(-MARGIN, 800, W17, 50);
  c.fillStyle = "#8c8578";
  c.fillRect(-MARGIN, 846, W17, 8);
  c.fillStyle = vgrad(c, 850, BOTTOM, [[0, "#7d766b"], [1, "#5f594f"]]);
  c.fillRect(-MARGIN, 852, W17, BOTTOM - 852);
  for (let y = 860, row3 = 0; y < BOTTOM; y += 22 + row3 * 2, row3++) {
    for (let x = -MARGIN + row3 % 2 * 18; x < L2.width + MARGIN; x += 36 + row3 * 2) {
      ellipse(c, x, y, 15 + row3, 8 + row3 * 0.6, shade("#8a8276", (x * 13 + y) % 7 / 60 - 0.05));
    }
  }
  c.strokeStyle = "#c9ccd6";
  c.lineWidth = 4;
  for (const y of [960, 1010]) {
    c.beginPath();
    c.moveTo(-MARGIN, y);
    c.lineTo(L2.width + MARGIN, y);
    c.stroke();
  }
  for (let x = 200; x < L2.width; x += 900) {
    c.fillStyle = "#2a2d34";
    c.fillRect(x - 5, 560, 10, 270);
    c.fillRect(x - 16, 822, 32, 12);
    c.beginPath();
    c.moveTo(x - 22, 560);
    c.lineTo(x + 22, 560);
    c.lineTo(x + 14, 520);
    c.lineTo(x - 14, 520);
    c.fill();
  }
}
function quay(c) {
  c.fillStyle = "#c9c1b0";
  c.fillRect(1900, 760, 1100, 60);
  c.fillStyle = "#a89f8c";
  c.fillRect(1900, 690, 1100, 14);
  for (let x = 1915; x < 3e3; x += 34) {
    c.beginPath();
    c.moveTo(x, 704);
    c.quadraticCurveTo(x - 10, 732, x, 760);
    c.lineTo(x + 14, 760);
    c.quadraticCurveTo(x + 24, 732, x + 14, 704);
    c.closePath();
    c.fillStyle = "#d8d0bf";
    c.fill();
  }
}
function lamps(c, L2) {
  if (TOD[L2.tod].dark < 0.5) return;
  for (let x = 200; x < L2.width; x += 900) {
    const g = c.createRadialGradient(x, 540, 4, x, 540, 120);
    g.addColorStop(0, "rgba(255,220,140,0.9)");
    g.addColorStop(0.15, "rgba(255,210,120,0.45)");
    g.addColorStop(1, "rgba(255,200,120,0)");
    c.fillStyle = g;
    c.fillRect(x - 130, 420, 260, 240);
  }
}
function foreground4(c, L2) {
  c.fillStyle = "#6b655a";
  c.fillRect(-MARGIN, 1130, L2.width + MARGIN * 2, BOTTOM - 1130);
  for (let x = -200; x < L2.width + MARGIN; x += 1400) {
    poly(c, [[x - 50, 1080], [x + 50, 1080], [x + 38, 1160], [x - 38, 1160]], "#b5562d");
    for (let i = 0; i < 6; i++) ellipse(c, x - 40 + i * 16, 1060 - i % 2 * 14, 18, 14, "#3e8c3a");
    for (let i = 0; i < 4; i++) ellipse(c, x - 30 + i * 20, 1040 - i % 2 * 10, 9, 9, "#e63946");
  }
}
var istanbul = {
  id: "istanbul",
  name: "Istanbul",
  icon: "\u{1F54C}",
  blurb: "A cobbled street of wooden Ottoman houses above the Bosphorus, domes and minarets across the water.",
  width: 3200,
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 9e3, draw: skyline3, fog: 0.35, band: [0, 640] },
    { depth: 4500, draw: sea2, fog: 0.15, band: [200, 780] },
    { depth: 900, draw: houses, band: [200, 900] },
    { depth: 300, draw: quay, band: [660, 840] },
    { depth: 0, draw: street2, band: [500, BOTTOM] },
    { depth: 0, draw: lamps, emissive: true, band: [400, 680] },
    { depth: -380, draw: foreground4, band: [1e3, BOTTOM] }
  ],
  marks: { left: 500, door1: 900, centre: 1600, door2: 2100, right: 2700, lamp: 1100 },
  ambience: "city-old",
  music: "nostalgia",
  suggest: ["simit-cart", "tea-glass", "street-cat", "bench", "vintage-car", "tram", "shoeshine-box"]
};

// src/sets/apartment.ts
var W = 3200;
var WALL = "#e2cfae";
var WALL_PATTERN = "#cdb48c";
var DADO = "#8c6a4a";
var TRIM = "#f1e7d0";
var SKIRT = "#5a4030";
var CURTAIN = "#b8643a";
var WALL_BASE = 800;
var HOLE_TOP = 560;
var WIN = { x: 1400, y: 240, w: 320, h: 280 };
var HALL = { x: 150, w: 240 };
var KITCHEN = { x: 2680, w: 240 };
var BULB = { x: 1600, y: 140 };
function cut(c, x, y, w, h) {
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.fillRect(x, y, w, h);
  c.restore();
}
function casing(c, x, y, w, h) {
  c.fillStyle = TRIM;
  c.fillRect(x - 10, y - 10, w + 20, 10);
  c.fillRect(x - 10, y, 10, h);
  c.fillRect(x + w, y, 10, h);
  c.fillStyle = shade(TRIM, -0.15);
  c.fillRect(x - 10, y + h - 6, 10, 6);
  c.fillRect(x + w, y + h - 6, 10, 6);
}
function curtain(c, x0, x1, top, bottom) {
  poly(c, [[x0, top], [x1, top], [x1 - 4, bottom], [x0 - 4, bottom]], CURTAIN);
  c.fillStyle = shade(CURTAIN, -0.25);
  for (let i = 1; i < 4; i++) {
    const x = x0 + (x1 - x0) * i / 4;
    c.fillRect(x - 2, top, 4, bottom - top);
  }
}
function hand(c, x, y, a, len, lw) {
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len);
  c.stroke();
}
function backWall(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = WALL;
  c.fillRect(-MARGIN, -420, w, WALL_BASE + 470);
  c.fillStyle = WALL_PATTERN;
  for (let row3 = 0, y = -400; y < WALL_BASE; y += 56, row3++) {
    for (let x = -MARGIN + row3 % 2 * 34; x < L2.width + MARGIN; x += 68) {
      c.beginPath();
      c.moveTo(x, y - 12);
      c.lineTo(x + 10, y);
      c.lineTo(x, y + 12);
      c.lineTo(x - 10, y);
      c.closePath();
      c.fill();
    }
  }
  poly(c, [[2196, 214], [2250, 206], [2300, 222], [2338, 214], [2350, 246], [2330, 272], [2292, 268], [2268, 292], [2238, 282], [2212, 296], [2196, 262]], "rgba(150, 112, 72, 0.34)");
  poly(c, [[2226, 236], [2262, 230], [2296, 244], [2310, 258], [2284, 254], [2262, 262], [2236, 258]], "rgba(150, 112, 72, 0.22)");
  c.fillStyle = DADO;
  c.fillRect(-MARGIN, 644, w, WALL_BASE - 644 - 10);
  c.fillStyle = "#6b4e36";
  c.fillRect(-MARGIN, 636, w, 10);
  c.strokeStyle = "#6f5238";
  c.lineWidth = 3;
  for (let x = -MARGIN + 30; x < L2.width + MARGIN; x += 240) c.strokeRect(x, 668, 200, 96);
  c.fillStyle = SKIRT;
  c.fillRect(-MARGIN, WALL_BASE - 10, w, 90);
  c.save();
  c.translate(940, 350);
  c.rotate(-0.07);
  c.fillStyle = "#6e4a2c";
  c.fillRect(-66, -52, 132, 104);
  c.fillStyle = "#cfe2e6";
  c.fillRect(-56, -42, 112, 84);
  ellipse(c, 26, -18, 12, 12, "#f0c24a");
  poly(c, [[-56, -4], [-22, -22], [10, 0], [56, -18], [56, 10], [-56, 10]], "#7d9a6a");
  c.fillStyle = "#3f6f8a";
  c.fillRect(-56, 10, 112, 32);
  c.restore();
  cut(c, WIN.x, WIN.y, WIN.w, WIN.h);
  cut(c, HALL.x, HOLE_TOP, HALL.w, WALL_BASE - HOLE_TOP);
  cut(c, KITCHEN.x, HOLE_TOP, KITCHEN.w, WALL_BASE - HOLE_TOP);
  c.fillStyle = TRIM;
  c.fillRect(WIN.x - 12, WIN.y - 12, WIN.w + 24, 12);
  c.fillRect(WIN.x - 12, WIN.y, 12, WIN.h);
  c.fillRect(WIN.x + WIN.w, WIN.y, 12, WIN.h);
  c.fillRect(WIN.x + WIN.w / 2 - 5, WIN.y, 10, WIN.h);
  c.fillRect(WIN.x, WIN.y + WIN.h * 0.45 - 5, WIN.w, 10);
  c.fillStyle = "#c9b48e";
  c.fillRect(WIN.x - 26, WIN.y + WIN.h, WIN.w + 52, 16);
  c.fillStyle = "#6e5a48";
  c.fillRect(WIN.x - 74, WIN.y - 28, WIN.w + 148, 8);
  curtain(c, WIN.x - 70, WIN.x - 12, WIN.y - 20, WIN.y + WIN.h + 40);
  curtain(c, WIN.x + WIN.w + 12, WIN.x + WIN.w + 70, WIN.y - 20, WIN.y + WIN.h + 40);
  const rx = 1440;
  const ry = 716;
  const rw = 260;
  const rh = WALL_BASE - ry;
  c.fillStyle = "#f2efe6";
  c.fillRect(rx, ry, rw, rh);
  c.strokeStyle = "#a39a8a";
  c.lineWidth = 2;
  for (let x = rx + 8; x < rx + rw; x += 16) {
    c.beginPath();
    c.moveTo(x, ry + 6);
    c.lineTo(x, ry + rh - 6);
    c.stroke();
  }
  c.strokeRect(rx, ry, rw, rh);
  casing(c, HALL.x, HOLE_TOP, HALL.w, WALL_BASE - HOLE_TOP);
  casing(c, KITCHEN.x, HOLE_TOP, KITCHEN.w, WALL_BASE - HOLE_TOP);
  c.fillStyle = "#6b4a30";
  c.fillRect(40, 448, 100, 9);
  c.fillStyle = "#9a8a72";
  for (const hx of [62, 100]) {
    c.fillRect(hx - 2, 456, 4, 10);
    ellipse(c, hx, 456, 4, 4, "#9a8a72");
  }
  poly(c, [[38, 468], [84, 468], [90, 566], [32, 566]], "#2c3e5c");
  poly(c, [[52, 468], [70, 468], [61, 492]], "#1d2a40");
  poly(c, [[92, 462], [108, 462], [110, 522], [90, 522]], "#b3413a");
  c.fillStyle = "#f7f3ea";
  c.fillRect(412, 632, 24, 32);
  c.strokeStyle = "#8a8070";
  c.lineWidth = 2;
  c.strokeRect(412, 632, 24, 32);
  c.fillStyle = "#8a8070";
  c.fillRect(420, 638, 8, 10);
  const cx = 2e3;
  const cy = 330;
  ellipse(c, cx, cy, 36, 36, "#6b4a2a");
  ellipse(c, cx, cy, 29, 29, "#f4ead8");
  c.strokeStyle = "#2a1f18";
  c.lineCap = "round";
  c.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    c.beginPath();
    c.moveTo(cx + Math.sin(a) * 22, cy - Math.cos(a) * 22);
    c.lineTo(cx + Math.sin(a) * 26, cy - Math.cos(a) * 26);
    c.stroke();
  }
  hand(c, cx, cy, 0.7, 14, 4);
  hand(c, cx, cy, 4.9, 22, 2.5);
  ellipse(c, cx, cy, 3, 3, "#2a1f18");
}
function ceiling(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = "#efe6d3";
  c.fillRect(-MARGIN, -420, w, 610);
  c.fillStyle = "#ddd0b4";
  c.fillRect(-MARGIN, 150, w, 26);
  c.fillStyle = "#c9b893";
  c.fillRect(-MARGIN, 176, w, 14);
  c.strokeStyle = "#b9ab8e";
  c.lineWidth = 2;
  const r = rng(41);
  for (let i = 0; i < 9; i++) {
    let x = r.range(-MARGIN, L2.width + MARGIN);
    let y = r.range(-400, 60);
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += r.range(-18, 18);
      y += r.range(8, 22);
      c.lineTo(x, y);
    }
    c.stroke();
  }
  c.strokeStyle = "#5a4a3a";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(BULB.x, -420);
  c.lineTo(BULB.x, 100);
  c.stroke();
  c.fillStyle = "#8c7f6c";
  c.fillRect(BULB.x - 10, 98, 20, 20);
  ellipse(c, BULB.x, BULB.y, 20, 26, "#fff6d8");
}
function bulbLight(c, L2) {
  if (L2.pal.dark < 0.4) return;
  glow(c, BULB.x, BULB.y + 10, 300, "#ffd77a", 0.55);
  ellipse(c, BULB.x, BULB.y, 20, 26, "#fff2b8");
}
function hallway(c) {
  const x0 = -200;
  const x1 = 600;
  c.fillStyle = vgrad(c, 360, WALL_BASE - 10, [[0, "#3c4642"], [1, "#56635d"]]);
  c.fillRect(x0, 360, x1 - x0, WALL_BASE - 10 - 360);
  c.fillStyle = "#4a3424";
  c.fillRect(x0, WALL_BASE - 10, x1 - x0, 60);
  c.fillStyle = "#c8b08a";
  c.fillRect(186, 584, 116, 212);
  c.fillStyle = "#7b4a2c";
  c.fillRect(196, 592, 96, 200);
  c.fillStyle = "#64391f";
  c.fillRect(208, 610, 72, 74);
  c.fillRect(208, 700, 72, 80);
  ellipse(c, 244, 668, 4, 4, "#e8dcc0");
  ellipse(c, 214, 722, 6, 6, "#d9b25f");
}
function kitchen(c) {
  const x0 = 2300;
  const x1 = 3200;
  c.fillStyle = "#cfe2d4";
  c.fillRect(x0, 360, x1 - x0, WALL_BASE - 10 - 360);
  c.strokeStyle = "#b5cbbd";
  c.lineWidth = 2;
  for (let x = x0; x < x1; x += 60) {
    c.beginPath();
    c.moveTo(x, 360);
    c.lineTo(x, WALL_BASE - 10);
    c.stroke();
  }
  for (let y = 400; y < WALL_BASE - 10; y += 40) {
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x1, y);
    c.stroke();
  }
  c.fillStyle = "#8e9689";
  c.fillRect(x0, WALL_BASE - 10, x1 - x0, 60);
  c.fillStyle = "#c9b48d";
  c.fillRect(2680, 712, 112, 80);
  c.fillStyle = "#e6dccb";
  c.fillRect(2672, 702, 128, 12);
  c.strokeStyle = "#9c8a6a";
  c.lineWidth = 2;
  c.strokeRect(2686, 724, 48, 60);
  c.strokeRect(2742, 724, 42, 60);
  c.fillStyle = "#eef1f2";
  c.fillRect(2800, 612, 84, 180);
  c.fillStyle = shade("#eef1f2", -0.15);
  c.fillRect(2870, 612, 14, 180);
  c.strokeStyle = "#8c949a";
  c.strokeRect(2800, 612, 84, 180);
  c.beginPath();
  c.moveTo(2800, 672);
  c.lineTo(2884, 672);
  c.stroke();
  c.fillStyle = "#7a8288";
  c.fillRect(2810, 634, 4, 26);
  c.fillRect(2810, 690, 4, 60);
}
var CITY_COLS = ["#c9936e", "#d9b48a", "#b9aa9c", "#a7b6bf", "#c99a7d", "#9fb3a2"];
function cityBlocks(L2) {
  const r = rng(31);
  const out = [];
  for (let x = -MARGIN, i = 0; x < L2.width + MARGIN; i++) {
    const w = 150 + r() * 120;
    out.push({ i, x, w, top: 300 + r() * 120, col: CITY_COLS[Math.floor(r() * CITY_COLS.length)], dish: r() < 0.45 });
    x += w;
  }
  return out;
}
function eachWindow(b, fn) {
  for (let row3 = 0, y = b.top + 26; y < 800; row3++, y += 42) {
    for (let col = 0, x = b.x + 14; x < b.x + b.w - 26; col++, x += 36) {
      fn(x, y, (row3 * 7 + col * 5 + b.i * 3) % 11 < 3);
    }
  }
}
function laundry(c, x0, y0, x1, y1, sag, colours) {
  const cy = (y0 + y1) / 2 + sag;
  c.strokeStyle = "#4a4a4a";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo((x0 + x1) / 2, cy, x1, y1);
  c.stroke();
  colours.forEach((col, i) => {
    const t = (i + 0.5) / colours.length;
    const x = x0 + (x1 - x0) * t;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    c.fillStyle = col;
    c.fillRect(x - 6, y, 12, 16 + i % 2 * 6);
  });
}
function city2(c, L2) {
  for (const b of cityBlocks(L2)) {
    c.fillStyle = b.col;
    c.fillRect(b.x, b.top, b.w, 830 - b.top);
    c.fillStyle = shade(b.col, -0.22);
    c.fillRect(b.x + b.w - 10, b.top, 10, 830 - b.top);
    c.fillStyle = shade(b.col, -0.12);
    c.fillRect(b.x, b.top, b.w, 8);
    eachWindow(b, (x, y) => {
      c.fillStyle = "#56646f";
      c.fillRect(x, y, 18, 24);
    });
    for (let y = b.top + 52; y < 800; y += 42) {
      c.fillStyle = shade(b.col, -0.3);
      c.fillRect(b.x, y, b.w, 4);
    }
    if (b.dish) dish(c, b.x + b.w * 0.7, b.top, 26, { metal: "#e9e9ec", dark: "#7d838c", angle: -0.5 });
  }
  dome(c, 1470, 430, 34, "#a9c6c4");
  minaret(c, 1625, 700, 370, "#ece4d2");
  laundry(c, 1420, 378, 1710, 384, 26, ["#f4f4f0", "#d95b4b", "#4f8fc9", "#f4f4f0", "#e0b43a"]);
  laundry(c, 1500, 440, 1640, 442, 16, ["#7fb77e", "#f4f4f0"]);
}
function cityLights(c, L2) {
  if (L2.pal.dark < 0.4) return;
  for (const b of cityBlocks(L2)) {
    eachWindow(b, (x, y, lit2) => {
      if (!lit2) return;
      c.fillStyle = "#ffd77a";
      c.fillRect(x, y, 18, 24);
    });
  }
  ellipse(c, 1625, 330, 4, 4, "#ff6b5b");
}
function sky(c, L2) {
  if (L2.pal.dark > 0.4) {
    glow(c, 1540, 262, 150, "#e8e4c8", 0.35);
    ellipse(c, 1540, 262, 26, 26, "#f4f0d4");
    ellipse(c, 1533, 257, 5, 4, "#dcd6b4");
  } else {
    cloud(c, 1520, 290, 130, "#ffffff", "#d3e4f2", 5);
  }
}
function floor2(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, WALL_BASE, BOTTOM, [[0, "#b07a46"], [1, "#8a5a30"]]);
  c.fillRect(-MARGIN, WALL_BASE, w, BOTTOM - WALL_BASE);
  c.strokeStyle = "rgba(70,40,18,0.45)";
  c.lineWidth = 2;
  let y = WALL_BASE + 6;
  for (let row3 = 0; y < BOTTOM; row3++) {
    const h = 22 + row3 * 4;
    c.beginPath();
    c.moveTo(-MARGIN, y);
    c.lineTo(L2.width + MARGIN, y);
    c.stroke();
    for (let x = -MARGIN + row3 % 2 * 120; x < L2.width + MARGIN; x += 240) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + h);
      c.stroke();
    }
    y += h;
  }
  const rx = 760;
  const ry = 842;
  const rw = 1680;
  const rh = 170;
  rrect(c, rx, ry, rw, rh, 18);
  c.fillStyle = "#8e3434";
  c.fill();
  rrect(c, rx + 16, ry + 14, rw - 32, rh - 28, 10);
  c.strokeStyle = "#d6b46e";
  c.lineWidth = 10;
  c.stroke();
  for (let x = rx + 90; x < rx + rw - 80; x += 110) {
    poly(c, [[x, ry + 52], [x + 26, ry + 85], [x, ry + 118], [x - 26, ry + 85]], "#6e2424");
  }
  for (const [px, py] of [[1100, 930], [1900, 960], [2200, 905]]) {
    ellipse(c, px, py, 70, 20, "rgba(215,170,140,0.35)");
  }
}
var apartment = {
  id: "apartment",
  name: "Apartment",
  icon: "\u{1F6CB}\uFE0F",
  blurb: "A lived-in Istanbul flat shared by two bachelors: faded wallpaper, a crooked picture, a window onto the blocks and a minaret.",
  width: W,
  interior: true,
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 8e3, emissive: true, band: [0, 640], draw: sky },
    { depth: 2500, fog: 0.3, band: [240, 840], draw: city2 },
    { depth: 2500, emissive: true, band: [240, 840], draw: cityLights },
    { depth: 1e3, band: [360, 830], draw: hallway },
    { depth: 1e3, band: [360, 830], draw: kitchen },
    { depth: 600, band: [-420, 880], draw: backWall },
    { depth: 300, band: [-420, 190], draw: ceiling },
    { depth: 300, emissive: true, band: [-420, 190], draw: bulbLight },
    { depth: 0, band: [WALL_BASE, BOTTOM], draw: floor2 }
  ],
  marks: { "front-door": 245, hallway: 380, sofa: 1150, window: 1560, centre: 1600, kitchen: 2800 },
  ambience: "city",
  music: "comedy",
  suggest: ["sofa", "coffee-table", "tv-retro", "armchair", "floor-lamp", "bookshelf", "plant-pot", "radio-old", "telephone-rotary", "coat-rack"]
};

// src/sets/ww2.ts
var PLASTER = ["#c9c0ae", "#b8ad98", "#d2c8b4", "#a99d89"];
var BRICK = "#9b6a55";
var HOLE = "#231f1d";
var FIRE = "#ff8a3a";
var MUD = "#6f5e46";
var SAND = "#b9a77e";
var FLOOR_TOP3 = 740;
function outline(r, R2, base) {
  const top = base - R2.h;
  const n = Math.max(5, Math.round(R2.w / 26));
  const pts2 = [[R2.x, base]];
  for (let i = 0; i <= n; i++) {
    const px = R2.x + i / n * R2.w;
    const jag = R2.tall ? 120 : 70;
    const dip = r() < 0.3 ? jag : r() * jag * 0.35;
    pts2.push([px, top + dip]);
  }
  pts2.push([R2.x + R2.w, base]);
  return pts2;
}
function ruin(c, R2, base, sh, lit2, seed) {
  const r = rng(seed);
  const pts2 = outline(r, R2, base);
  const top = base - R2.h;
  if (lit2) {
    const cols2 = Math.max(2, Math.round(R2.w / 60));
    for (let st = 0; st < Math.floor(R2.h / sh); st++) {
      for (let k = 0; k < cols2; k++) {
        if ((seed + st * 3 + k * 7) % 5 === 0) {
          const wx = R2.x + (k + 0.5) / cols2 * R2.w - 9;
          const wy = base - (st + 0.5) * sh - 10;
          c.fillStyle = FIRE;
          c.beginPath();
          c.ellipse(wx + 9, wy + 10, 8, 12, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#ffe08a";
          c.beginPath();
          c.ellipse(wx + 9, wy + 14, 4, 7, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    return;
  }
  poly(c, pts2, R2.wall);
  c.save();
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.clip();
  c.fillStyle = shade(R2.wall, -0.16);
  c.fillRect(R2.x + R2.w * 0.8, top - 10, R2.w * 0.2 + 4, R2.h + 20);
  if (R2.brick) {
    c.strokeStyle = shade(BRICK, -0.2);
    c.lineWidth = 2;
    for (let y = base - 30; y > top; y -= 22) {
      c.beginPath();
      c.moveTo(R2.x - 4, y);
      c.lineTo(R2.x + R2.w + 4, y);
      c.stroke();
    }
  }
  c.fillStyle = "rgba(0,0,0,0.12)";
  c.fillRect(R2.x + R2.w * 0.35, top, R2.w * 0.2, 36);
  c.restore();
  const cols = Math.max(2, Math.round(R2.w / 60));
  for (let st = 0; st < Math.floor((R2.h - 40) / sh); st++) {
    for (let k = 0; k < cols; k++) {
      if (r() < 0.2) continue;
      const wx = R2.x + (k + 0.5) / cols * R2.w - 9;
      const wy = base - (st + 0.5) * sh - 12;
      c.fillStyle = HOLE;
      c.fillRect(wx, wy, 18, 24);
      c.fillStyle = shade(R2.wall, -0.4);
      c.fillRect(wx - 3, wy + 24, 24, 3);
      if (r() < 0.4) {
        c.strokeStyle = shade(R2.wall, -0.4);
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(wx - 2, wy + 22);
        c.lineTo(wx + 14, wy - 3);
        c.stroke();
      }
    }
  }
  if (r() < 0.45) {
    const bx = R2.x + R2.w * (0.3 + r() * 0.4);
    const len = 120 + r() * 60;
    c.save();
    c.translate(bx, top + 40);
    c.rotate(-0.5 - r() * 0.4);
    c.fillStyle = "#3d2c22";
    c.fillRect(-9, -len, 18, len);
    c.fillStyle = "#2a1e17";
    c.fillRect(2, -len, 7, len);
    c.restore();
  }
  c.lineCap = "butt";
  for (let i = 0; i < 9; i++) {
    const rx = R2.x + r() * R2.w;
    ellipse(c, rx, base - 6 + r() * 6, 8 + r() * 14, 5 + r() * 4, shade("#8a7d6c", (r() - 0.5) * 0.3));
  }
}
function smoke(c, lit2) {
  const cols = [[520, 470], [1900, 520], [2980, 430]];
  for (const [x, h] of cols) {
    if (lit2) {
      const g = c.createRadialGradient(x, 760, 4, x, 760, 160);
      g.addColorStop(0, "rgba(255,140,60,0.8)");
      g.addColorStop(1, "rgba(255,140,60,0)");
      c.fillStyle = g;
      c.fillRect(x - 160, 600, 320, 200);
      continue;
    }
    const r = rng(x);
    for (let k = 0; k < 7; k++) {
      const t = k / 7;
      const y = 780 - t * h;
      const w = 60 + t * 200 + r() * 40;
      cloud(c, x + Math.sin(t * 3) * 40 * t, y, w, k % 2 ? "#7d7770" : "#6b6660", "#55504b", 5 + k + Math.round(x));
    }
  }
}
function treeline(c, L2) {
  c.fillStyle = "#6d7567";
  c.beginPath();
  c.moveTo(-MARGIN, 800);
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 30) c.lineTo(x, 640 + Math.sin(x / 230) * 30 + Math.sin(x / 90) * 10);
  c.lineTo(L2.width + MARGIN, 800);
  c.lineTo(-MARGIN, 800);
  c.fill();
  c.fillStyle = "#4d5547";
  const r = rng(9);
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 20 + r() * 20) {
    const h = 30 + r() * 40;
    const base = 740;
    c.fillStyle = "#4d5547";
    c.fillRect(x, base - h, 3, h);
    if (r() < 0.5) {
      c.beginPath();
      c.moveTo(x - 8, base - h * 0.5);
      c.lineTo(x + 1, base - h * 0.5 - 22);
      c.lineTo(x + 10, base - h * 0.5);
      c.fill();
    }
  }
}
var RUINS_FAR = [];
var RUINS_NEAR = [];
var RUINS_CHURCH = { x: 2080, w: 300, h: 560, wall: "#c9c0ae", brick: true, tall: true };
function rowOf(out, x0, x1, seed, hMin, hMax, gaps) {
  const r = rng(seed);
  let x = x0;
  let i = 0;
  while (x < x1) {
    const w = Math.round(r.range(180, 260));
    if (gaps.some(([a, b]) => x + w > a && x < b)) {
      x += w + 10;
      continue;
    }
    out.push({ x, w, h: r.range(hMin, hMax), wall: PLASTER[i % PLASTER.length], brick: i % 3 === 1, tall: i % 5 === 4 });
    x += w + 4;
    i++;
  }
}
rowOf(RUINS_FAR, -520, 3920, 13, 340, 420, [[1300, 1600]]);
rowOf(RUINS_NEAR, -520, 1980, 27, 470, 560, [[700, 780]]);
rowOf(RUINS_NEAR, 2420, 3920, 31, 470, 560, []);
function farRuins(c, lit2) {
  for (const [i, R2] of RUINS_FAR.entries()) ruin(c, R2, 800, 191, lit2, i + 3);
}
function nearRuins(c, lit2) {
  for (const [i, R2] of RUINS_NEAR.entries()) ruin(c, R2, 840, 262, lit2, i + 17);
  ruin(c, RUINS_CHURCH, 840, 262, lit2, 77);
}
function mud(c, L2) {
  const W17 = L2.width + MARGIN * 2;
  c.fillStyle = MUD;
  c.fillRect(-MARGIN, FLOOR_TOP3, W17, BOTTOM - FLOOR_TOP3);
  c.fillStyle = shade(MUD, -0.12);
  const r = rng(12);
  for (let i = 0; i < 120; i++) {
    c.fillRect(-MARGIN + r() * W17, FLOOR_TOP3 + 6 + r() * (BOTTOM - FLOOR_TOP3), 14 + r() * 26, 2);
  }
  for (const [x, y, rx, ry] of [[360, 790, 90, 10], [1020, 812, 70, 8], [2300, 800, 110, 11], [2680, 860, 60, 6]]) {
    ellipse(c, x, y, rx, ry, "#55636b");
    ellipse(c, x - rx * 0.3, y - 2, rx * 0.4, ry * 0.3, "rgba(220,226,230,0.35)");
  }
  for (const [x, y] of [[1280, 780], [1860, 800]]) {
    ellipse(c, x, y, 58, 12, shade(MUD, -0.25));
    ellipse(c, x, y, 46, 8, shade(MUD, -0.35));
  }
}
function trench(c, L2) {
  const W17 = L2.width + MARGIN * 2;
  c.fillStyle = "#4a3b2b";
  c.fillRect(-MARGIN, 960, W17, BOTTOM - 960);
  c.fillStyle = "#3a2d20";
  c.fillRect(-MARGIN, 960, W17, 14);
  c.fillStyle = shade("#4a3b2b", -0.2);
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 150) c.fillRect(x, 1040, 60, 8);
  for (let row3 = 0; row3 < 2; row3++) {
    for (let x = -MARGIN + row3 % 2 * 18; x < L2.width + MARGIN; x += 40) {
      ellipse(c, x, 934 - row3 * 22, 26, 15, SAND);
      ellipse(c, x + 4, 938 - row3 * 22, 14, 6, shade(SAND, -0.18));
    }
  }
  c.strokeStyle = "#3b3b3b";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-MARGIN, 1110);
  c.lineTo(L2.width + MARGIN, 1100);
  c.stroke();
  c.lineWidth = 2.5;
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 36) {
    c.beginPath();
    c.moveTo(x - 9, 1116);
    c.lineTo(x + 9, 1094);
    c.moveTo(x + 9, 1116);
    c.lineTo(x - 9, 1094);
    c.stroke();
  }
}
function foreground5(c) {
  c.fillStyle = "#3b3026";
  c.fillRect(2880, 1010, 36, 190);
  c.fillStyle = "#2d241c";
  c.fillRect(2880, 1010, 10, 190);
  c.beginPath();
  c.moveTo(2890, 1020);
  c.lineTo(2850, 960);
  c.lineTo(2846, 966);
  c.lineTo(2884, 1026);
  c.fill();
  for (let row3 = 0; row3 < 3; row3++) {
    for (let k = 0; k < 4 - row3; k++) ellipse(c, 2280 + k * 46 + row3 * 22, 1186 - row3 * 26, 26, 15, SAND);
  }
}
function sky2(tod) {
  switch (tod) {
    case "day":
      return ["#8a9096", "#d3d6d8"];
    case "dawn":
      return ["#6d7480", "#d8c3ae"];
    case "dusk":
      return ["#3b3a48", "#c57a55"];
    default:
      return [TOD.night.skyTop, TOD.night.skyLow];
  }
}
var ww2 = {
  id: "ww2",
  name: "WW2 Front",
  icon: "\u{1FA96}",
  blurb: "A bombed village under a grey sky: broken walls, a church with its tower shot away, smoke on the horizon and a sandbagged trench at the front.",
  width: 3400,
  sky: sky2,
  layers: (tod) => {
    const dim = TOD[tod].dark > 0.4;
    const out = [
      { depth: 6e3, fog: 0.25, band: [150, 800], draw: (c) => smoke(c, false) },
      { depth: 3e3, fog: 0.3, band: [420, 800], draw: treeline },
      { depth: 1200, band: [180, 830], draw: (c) => farRuins(c, false) },
      { depth: 600, band: [200, 860], draw: (c) => nearRuins(c, false) },
      { depth: 0, band: [FLOOR_TOP3 - 10, BOTTOM], draw: mud },
      { depth: -200, band: [930, BOTTOM], draw: trench },
      { depth: -380, band: [960, BOTTOM], draw: (c) => foreground5(c) }
    ];
    if (dim) {
      out.push(
        { depth: 6e3, emissive: true, band: [560, 800], draw: (c) => smoke(c, true) },
        { depth: 1200, emissive: true, band: [180, 830], draw: (c) => farRuins(c, true) },
        { depth: 600, emissive: true, band: [200, 860], draw: (c) => nearRuins(c, true) }
      );
    }
    return out;
  },
  marks: { left: 420, ruin: 900, wall: 1400, centre: 1700, church: 2230, trench: 1650, right: 2900 },
  ambience: "war",
  music: "sad",
  suggest: ["sandbags", "barbed-wire", "ammo-crate", "field-radio", "army-tent", "oil-drum", "searchlight", "trench-ladder", "map-table", "gas-mask"]
};

// src/sets/stoneage.ts
var WALLS2 = ["#e8c79a", "#d9ad7c", "#f0d7a8", "#cfa27a", "#e3bd8a"];
var THATCH = "#c98f3e";
var STONE_ROOF = "#9b927f";
var GLASS2 = "#8fd3e8";
var LIT4 = "#ffd77a";
var GRASS = "#6cc24a";
var GRASS_DARK = "#4fae3e";
var ROAD = ["#b9ad9a", "#aea28e", "#c4b8a4"];
var BONE = "#f4f0e6";
var FLOOR_TOP4 = 800;
function hut(c, H, base, lit2) {
  const wallTop = base - H.h;
  const domeH = H.w * 0.42;
  const cx = H.x + H.w / 2;
  const winR = Math.max(7, H.w * 0.09);
  const winX = cx + H.w * 0.2;
  const winY = wallTop + H.h * 0.35;
  const dw = H.w * 0.26;
  const dh = H.h * 0.5;
  if (lit2) {
    for (const [wx, wy] of [[winX, winY], [cx - H.w * 0.22, winY + 10]]) {
      c.fillStyle = LIT4;
      c.beginPath();
      c.arc(wx, wy, winR * 0.8, 0, Math.PI * 2);
      c.fill();
    }
    return;
  }
  bricks(c, H.x, wallTop, H.w, base - wallTop, H.wall, 30, 18);
  c.fillStyle = shade(H.wall, -0.18);
  c.fillRect(H.x + H.w * 0.82, wallTop, H.w * 0.18, base - wallTop);
  c.beginPath();
  c.ellipse(cx, wallTop, H.w / 2 + 6, domeH, 0, Math.PI, Math.PI * 2);
  c.closePath();
  c.fillStyle = H.thatch ? THATCH : STONE_ROOF;
  c.fill();
  c.save();
  c.clip();
  if (H.thatch) {
    c.strokeStyle = shade(THATCH, -0.25);
    c.lineWidth = 3;
    for (let k = -8; k <= 8; k++) {
      c.beginPath();
      c.moveTo(cx + k * 12, wallTop - domeH);
      c.lineTo(cx + k * 12 + 14, wallTop);
      c.stroke();
    }
  } else {
    c.fillStyle = shade(STONE_ROOF, -0.15);
    c.fillRect(cx + 2, wallTop - domeH, H.w, domeH);
    c.strokeStyle = shade(STONE_ROOF, -0.3);
    c.lineWidth = 3;
    for (const f of [0.35, 0.7]) {
      c.beginPath();
      c.moveTo(cx - H.w / 2, wallTop - domeH * f);
      c.lineTo(cx + H.w / 2, wallTop - domeH * f);
      c.stroke();
    }
  }
  c.restore();
  c.fillStyle = "#6b4a2e";
  c.beginPath();
  c.arc(winX, winY, winR + 4, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = GLASS2;
  c.beginPath();
  c.arc(winX, winY, winR, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#6b4a2e";
  c.fillRect(winX - winR, winY - 2, winR * 2, 4);
  c.fillRect(winX - 2, winY - winR, 4, winR * 2);
  c.fillStyle = "#6b4a2e";
  c.beginPath();
  c.arc(cx - H.w * 0.22, winY + 10, winR * 0.6 + 3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = GLASS2;
  c.beginPath();
  c.arc(cx - H.w * 0.22, winY + 10, winR * 0.6, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#6b4228";
  c.beginPath();
  c.roundRect(cx - dw / 2, base - dh, dw, dh, [dw / 2, dw / 2, 0, 0]);
  c.fill();
  c.fillStyle = "#4a2c1a";
  c.fillRect(cx - 1.5, base - dh + 10, 3, dh - 10);
}
function row2(out, x0, x1, seed, hMin, hMax, skip) {
  const r = rng(seed);
  let x = x0;
  let i = 0;
  while (x < x1) {
    const w = Math.round(r.range(200, 260));
    if (skip && x + w > skip[0] && x < skip[1]) {
      x = skip[1];
      continue;
    }
    out.push({ x, w, h: r.range(hMin, hMax), wall: WALLS2[i % WALLS2.length], thatch: i % 3 === 1, seed: seed * 10 + i });
    x += w + 8;
    i++;
  }
  return out;
}
var HUTS_BACK = [];
var HUTS_NEAR = [];
row2(HUTS_BACK, -520, 3920, 5, 150, 185, [1280, 1720]);
row2(HUTS_NEAR, -520, 1040, 9, 200, 230, null);
row2(HUTS_NEAR, 2260, 3920, 14, 200, 230, null);
function hutsBack(c, lit2) {
  for (const H of HUTS_BACK) hut(c, H, 800, lit2);
}
function hutsNear(c, lit2) {
  for (const H of HUTS_NEAR) hut(c, H, 840, lit2);
  if (!lit2) tusks(c, 1600, 840);
}
function tusks(c, x, base) {
  c.lineCap = "round";
  for (const side of [-1, 1]) {
    c.strokeStyle = shade(BONE, -0.2);
    c.lineWidth = 30;
    c.beginPath();
    c.moveTo(x + side * 110, base);
    c.quadraticCurveTo(x + side * 150, base - 230, x + side * 40, base - 330);
    c.stroke();
    c.strokeStyle = BONE;
    c.lineWidth = 22;
    c.beginPath();
    c.moveTo(x + side * 110, base);
    c.quadraticCurveTo(x + side * 150, base - 230, x + side * 40, base - 330);
    c.stroke();
  }
  c.lineCap = "butt";
}
function campfire(c, x, base, lit2) {
  if (lit2) {
    const g = c.createRadialGradient(x, base - 30, 6, x, base - 30, 170);
    g.addColorStop(0, "rgba(255,170,70,0.75)");
    g.addColorStop(1, "rgba(255,170,70,0)");
    c.fillStyle = g;
    c.fillRect(x - 170, base - 200, 340, 220);
    c.fillStyle = "#ff9a2e";
    c.beginPath();
    c.ellipse(x, base - 36, 26, 40, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffe07a";
    c.beginPath();
    c.ellipse(x, base - 28, 12, 22, 0, 0, Math.PI * 2);
    c.fill();
    return;
  }
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    ellipse(c, x + Math.cos(a) * 34, base + Math.sin(a) * 9 - 6, 12, 9, "#7d7466");
  }
  ellipse(c, x, base - 4, 30, 8, "#4a3a2a");
}
function clouds(c, L2) {
  const r = rng(3);
  for (let i = 0; i < 9; i++) {
    cloud(c, r() * (L2.width + 400) - 200, 120 + r() * 170, 220 + r() * 160, "#ffffff", "#dfe9f5", 20 + i);
  }
}
function volcano(c) {
  const vx = 1700;
  const base = 660;
  poly(c, [[vx - 360, base], [vx - 20, 290], [vx + 360, base]], "#b5533a");
  poly(c, [[vx - 20, 290], [vx + 360, base], [vx - 20, base]], "#8f3f2c");
  ellipse(c, vx - 10, 296, 70, 14, "#ffb347");
  ellipse(c, vx - 10, 296, 40, 7, "#ffe07a");
  for (let i = 0; i < 4; i++) cloud(c, vx - 10 + (i - 1.5) * 50, 250 - i * 40, 160 + i * 30, "#cfc6bd", "#b8ada2", 60 + i);
  for (const [mx, mw, mh, col] of [[220, 420, 170, "#e09a5b"], [1e3, 300, 120, "#c97b4a"], [2400, 360, 150, "#e09a5b"], [3050, 420, 190, "#c97b4a"]]) {
    poly(c, [[mx - mw / 2, base], [mx - mw / 2 + 30, base - mh], [mx + mw / 2 - 30, base - mh], [mx + mw / 2, base]], col);
    c.strokeStyle = shade(col, -0.2);
    c.lineWidth = 3;
    for (let k = 1; k < 4; k++) {
      const y = base - mh * k / 4;
      c.beginPath();
      c.moveTo(mx - mw / 2 + 12 + k * 4, y);
      c.lineTo(mx + mw / 2 - 12 - k * 4, y);
      c.stroke();
    }
  }
}
function palms(c) {
  const r = rng(77);
  for (const [px, ph] of [[200, 360], [640, 300], [1200, 330], [2200, 300], [2760, 350], [3300, 320]]) {
    palm(c, px, 820, ph, "#8a6a3a", "#3e9e4a", r);
  }
}
function ground2(c, L2) {
  const W17 = L2.width + MARGIN * 2;
  c.fillStyle = GRASS;
  c.fillRect(-MARGIN, FLOOR_TOP4 - 40, W17, 60);
  grassTufts(c, -MARGIN, L2.width + MARGIN, FLOOR_TOP4 + 20, GRASS_DARK, rng(8), 0.07, 22);
  c.fillStyle = ROAD[0];
  c.fillRect(-MARGIN, FLOOR_TOP4 + 20, W17, BOTTOM - FLOOR_TOP4 - 20);
  const r = rng(21);
  for (let y = FLOOR_TOP4 + 26, row3 = 0; y < BOTTOM + 30; y += 26 + row3 * 3, row3++) {
    for (let x = -MARGIN + row3 % 2 * 40 - 60; x < L2.width + MARGIN; x += 120 + row3 * 6) {
      const w = 110 + row3 * 6 + r() * 14;
      const h = 22 + row3 * 2.6;
      const j = r() * 4;
      poly(c, [[x + j, y], [x + w - j, y - 2], [x + w, y + h * 0.5], [x + w - j * 2, y + h], [x + j * 2, y + h - 1], [x - 2, y + h * 0.4]], ROAD[(row3 + Math.round(x)) % ROAD.length]);
    }
  }
  c.strokeStyle = shade(ROAD[0], -0.3);
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-MARGIN, FLOOR_TOP4 + 20);
  c.lineTo(L2.width + MARGIN, FLOOR_TOP4 + 20);
  c.stroke();
  bone(c, 2330, 960, 120, -0.25);
  bone(c, 2480, 1030, 90, 0.4);
}
function bone(c, x, y, len, rot) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.lineCap = "round";
  c.strokeStyle = shade(BONE, -0.45);
  c.lineWidth = 22;
  c.beginPath();
  c.moveTo(-len / 2, 0);
  c.lineTo(len / 2, 0);
  c.stroke();
  c.strokeStyle = BONE;
  c.lineWidth = 14;
  c.stroke();
  for (const s of [-1, 1]) {
    ellipse(c, s * len / 2, -7, 10, 10, BONE);
    ellipse(c, s * len / 2, 7, 10, 10, BONE);
  }
  c.restore();
}
function foreground6(c, L2) {
  const r = rng(99);
  palm(c, -20, 1200, 460, "#7a5a2a", "#4fae4a", r);
  palm(c, L2.width + 30, 1200, 440, "#7a5a2a", "#58b84f", r);
  ellipse(c, 2820, 1120, 110, 60, "#9b927f");
  ellipse(c, 2790, 1100, 40, 20, "#b8ae9a");
}
var stoneage = {
  id: "stoneage",
  name: "Stone Age Village",
  icon: "\u{1F995}",
  blurb: "A cheerful prehistoric village of round stone houses, a mammoth-tusk arch, palms, a volcano and a campfire.",
  width: 3200,
  times: ["dawn", "day", "dusk"],
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: (tod) => {
    const dim = TOD[tod].dark > 0.4;
    const out = [
      { depth: 6500, band: [60, 330], draw: clouds },
      { depth: 6e3, fog: 0.15, band: [240, 700], draw: (c) => volcano(c) },
      { depth: 2e3, fog: 0.1, band: [300, 830], draw: (c) => palms(c) },
      { depth: 900, band: [480, 840], draw: (c) => hutsBack(c, false) },
      { depth: 600, band: [240, 860], draw: (c) => hutsNear(c, false) },
      { depth: 600, band: [560, 880], draw: (c) => campfire(c, 880, 820, false) },
      { depth: 0, band: [FLOOR_TOP4 - 40, BOTTOM], draw: ground2 },
      { depth: -380, band: [900, BOTTOM], draw: foreground6 }
    ];
    if (dim) {
      out.push(
        { depth: 900, emissive: true, band: [480, 840], draw: (c) => hutsBack(c, true) },
        { depth: 600, emissive: true, band: [240, 860], draw: (c) => hutsNear(c, true) },
        { depth: 600, emissive: true, band: [560, 880], draw: (c) => campfire(c, 880, 820, true) }
      );
    }
    return out;
  },
  marks: { left: 380, hut: 880, arch: 1600, centre: 1600, campfire: 880, hut2: 2100, bones: 2330, right: 2850 },
  ambience: "jungle",
  music: "comedy",
  suggest: ["dino-longneck", "mammoth", "stone-wheel", "bone-pile", "campfire", "cave-painting", "stone-table", "dino-egg", "pterodactyl", "shell-phone"]
};

// src/sets/skycity.ts
var W2 = 3200;
var PODS = ["#f6c6d9", "#bfe9d9", "#c9c3f0", "#fbe7a1", "#ffd1b3", "#a8d8f0", "#f3ecff"];
var STEM = "#9aa6c0";
var STEM_SHADE = "#7d89a6";
var GLASS3 = "#5d7fa3";
var LIT5 = "#ffe27a";
var CLOUD = "#ffffff";
var CLOUD_SHADE = "#dbe6f6";
function makeTowers(seed, xs, topMin, topMax, base, podW, podH, stem, litP) {
  const r = rng(seed);
  return xs.map((x) => {
    const top = r.range(topMin, topMax);
    const pods = [];
    for (let y = top; y < base - 24; ) {
      const h = r.range(podH[0], podH[1]);
      const w = podW * r.range(0.8, 1.12);
      const n = Math.max(2, Math.round(w / 22));
      pods.push({ y, h, w, col: r.pick(PODS), lit: Array.from({ length: n }, () => r.chance(litP)) });
      y += h + r.range(5, 10);
    }
    return { x, top, base, stem, pods };
  });
}
function spread(n, a, b, seed) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => a + (i + 0.5) / n * (b - a) + r.range(-40, 40));
}
var FAR = makeTowers(11, spread(20, -400, W2 + 400, 5), 150, 330, 760, 58, [26, 34], 10, 0.35);
var MID = makeTowers(23, [170, 960, 1700, 2480, 3080], 50, 140, 800, 124, [46, 58], 16, 0.6);
var SAUCERS = [
  [520, 300, 140, "#c9c3f0"],
  [1380, 230, 118, "#bfe9d9"],
  [2040, 340, 150, "#f6c6d9"],
  [2880, 270, 128, "#fbe7a1"]
];
var LANES = [360, 452];
var CARS = (() => {
  const r = rng(44);
  const out = [];
  for (const y of LANES) for (let i = 0; i < 6; i++) out.push({ x: r.range(-MARGIN, W2 + MARGIN), y, col: r.pick(PODS) });
  return out;
})();
function rimPoints(x, y, r) {
  const pts2 = [];
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9;
    pts2.push([x - r * 0.78 + t * r * 1.56, y + r * 0.2 * Math.sin(Math.PI * t)]);
  }
  return pts2;
}
function drawTowers(c, ts) {
  for (const t of ts) {
    c.fillStyle = STEM;
    c.fillRect(t.x - t.stem / 2, t.top, t.stem, t.base - t.top);
    c.fillStyle = STEM_SHADE;
    c.fillRect(t.x + t.stem * 0.1, t.top, t.stem * 0.4, t.base - t.top);
    c.fillStyle = "#5b6680";
    c.fillRect(t.x - 1.5, t.top - 36, 3, 36);
    ellipse(c, t.x, t.top - 38, 5, 5, "#ff7aa2");
    for (const p of t.pods) {
      const x0 = t.x - p.w / 2;
      rrect(c, x0, p.y, p.w, p.h, p.h * 0.5);
      c.fillStyle = p.col;
      c.fill();
      c.save();
      c.clip();
      c.fillStyle = shade(p.col, -0.16);
      c.fillRect(x0 + p.w * 0.7, p.y, p.w, p.h);
      c.restore();
      const n = p.lit.length;
      for (let k = 0; k < n; k++) ellipse(c, x0 + (k + 0.5) / n * p.w, p.y + p.h * 0.5, p.h * 0.2, p.h * 0.2, GLASS3);
    }
  }
}
function towerLights(c, ts, halo) {
  for (const t of ts)
    for (const p of t.pods) {
      const n = p.lit.length;
      p.lit.forEach((on, k) => {
        if (!on) return;
        const px = t.x - p.w / 2 + (k + 0.5) / n * p.w;
        const py = p.y + p.h * 0.5;
        if (halo) glow(c, px, py, 30, "#ffd76a", 0.3);
        ellipse(c, px, py, p.h * 0.2, p.h * 0.2, LIT5);
      });
    }
}
function bank(c, y, bottom, seed) {
  const from = -MARGIN - 80;
  const to = W2 + MARGIN + 80;
  c.fillStyle = CLOUD;
  c.fillRect(from, y, to - from, bottom - y);
  for (let x = from; x < to; x += 230) cloud(c, x + 60, y, 300 + x * 7 % 140, CLOUD, CLOUD_SHADE, seed + Math.round(x));
}
function sunMoon(c, L2) {
  const night = L2.pal.dark > 0.4;
  const x = night ? 900 : 2520;
  const y = 150;
  const col = night ? "#f4f1d0" : "#fff4c2";
  glow(c, x, y, 320, col, 0.35);
  ellipse(c, x, y, 70, 70, col);
  c.strokeStyle = night ? "rgba(244,241,208,0.5)" : "rgba(255,255,255,0.8)";
  c.lineWidth = 6;
  c.beginPath();
  c.arc(x, y, 98, 0, Math.PI * 2);
  c.stroke();
}
function highClouds(c) {
  for (let i = 0; i < 8; i++) cloud(c, -300 + i * 470, 500 + i % 2 * 70, 380 + i % 3 * 40, CLOUD, CLOUD_SHADE, 60 + i);
}
function farCity(c) {
  drawTowers(c, FAR);
}
function farCityLights(c, L2) {
  if (L2.pal.dark < 0.4) return;
  towerLights(c, FAR, false);
}
function saucerLayer(c) {
  c.strokeStyle = "rgba(255,255,255,0.85)";
  c.lineWidth = 3;
  c.setLineDash([28, 20]);
  for (const y of LANES) {
    c.beginPath();
    c.moveTo(-MARGIN, y);
    c.lineTo(W2 + MARGIN, y);
    c.stroke();
  }
  c.setLineDash([]);
  for (const car of CARS) {
    rrect(c, car.x - 26, car.y - 9, 52, 18, 9);
    c.fillStyle = car.col;
    c.fill();
    rrect(c, car.x - 10, car.y - 16, 22, 10, 4);
    c.fillStyle = "#eef9ff";
    c.fill();
  }
  for (const [x, y, r, col] of SAUCERS) {
    c.fillStyle = STEM;
    c.fillRect(x - 5, y, 10, 330);
    ellipse(c, x, y + r * 0.1, r, r * 0.22, shade(col, -0.28));
    ellipse(c, x, y, r, r * 0.22, col);
    ellipse(c, x, y - r * 0.05, r * 0.86, r * 0.1, shade(col, 0.14));
    c.beginPath();
    c.ellipse(x, y, r * 0.5, r * 0.42, 0, Math.PI, 0);
    c.fillStyle = "#e6f8ff";
    c.fill();
    c.strokeStyle = shade(col, -0.1);
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(x, y, r * 0.25, r * 0.42, 0, Math.PI, Math.PI * 2);
    c.stroke();
    ellipse(c, x - r * 0.22, y - r * 0.22, r * 0.09, r * 0.05, "rgba(255,255,255,0.95)");
    for (const [px, py] of rimPoints(x, y, r)) ellipse(c, px, py, 3.5, 3.5, GLASS3);
  }
}
function saucerLights(c, L2) {
  if (L2.pal.dark < 0.4) return;
  for (const y of LANES)
    for (let x = -MARGIN; x < W2 + MARGIN; x += 140) ellipse(c, x, y, 3, 3, "#ffffff");
  for (const car of CARS) ellipse(c, car.x + 26, car.y, 4, 4, "#fff8d0");
  for (const [x, y, r] of SAUCERS) {
    glow(c, x, y + r * 0.2, r * 1.2, "#ffe9a8", 0.25);
    for (const [px, py] of rimPoints(x, y, r)) ellipse(c, px, py, 4, 4, LIT5);
  }
}
function midTowers(c) {
  drawTowers(c, MID);
}
function midLights(c, L2) {
  if (L2.pal.dark < 0.4) return;
  towerLights(c, MID, true);
}
function domes(c) {
  for (const [x, r] of [
    [1420, 118],
    [2300, 112]
  ]) {
    c.fillStyle = "#d7ccee";
    c.fillRect(x - r - 26, 716, r * 2 + 52, 52);
    c.fillStyle = shade("#d7ccee", -0.12);
    c.fillRect(x + r * 0.2, 716, r * 1.2 + 26, 52);
    c.beginPath();
    c.arc(x, 716, r, Math.PI, 0);
    c.fillStyle = "rgba(224,246,255,0.92)";
    c.fill();
    c.strokeStyle = "#b5d8e8";
    c.lineWidth = 3;
    for (const s of [0.5, 0.25]) {
      c.beginPath();
      c.ellipse(x, 716, r * s, r, 0, Math.PI, Math.PI * 2);
      c.stroke();
    }
    ellipse(c, x - r * 0.42, 716 - r * 0.5, r * 0.16, r * 0.08, "rgba(255,255,255,0.95)");
    c.strokeStyle = "#c9b8e6";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(x, 716, r, Math.PI, 0);
    c.stroke();
  }
}
function domeLights(c, L2) {
  if (L2.pal.dark < 0.4) return;
  for (const x of [1420, 2300]) glow(c, x, 650, 150, "#9fe3ff", 0.3);
}
function nearClouds(c) {
  bank(c, 744, 860, 900);
}
function rail(c) {
  c.fillStyle = "rgba(214,240,255,0.72)";
  c.fillRect(-MARGIN, 712, W2 + MARGIN * 2, 42);
  c.fillStyle = "#ffffff";
  c.fillRect(-MARGIN, 706, W2 + MARGIN * 2, 8);
  c.fillStyle = "#dfeaf5";
  for (let x = -MARGIN; x < W2 + MARGIN; x += 110) c.fillRect(x - 3, 712, 6, 52);
}
function railLights(c, L2) {
  if (L2.pal.dark < 0.4) return;
  for (let x = -MARGIN + 60; x < W2 + MARGIN; x += 220) {
    glow(c, x, 700, 110, "#ffd98a", 0.35);
    ellipse(c, x, 700, 8, 8, "#ffe9a8");
  }
}
function terrace(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, 740, 1010, [[0, "#f4fbff"], [1, "#cde8f4"]]);
  c.fillRect(-MARGIN, 740, w, 270);
  c.strokeStyle = "#b3d6e6";
  c.lineWidth = 2;
  for (let y = 790, row3 = 0; y < 1010; y += 40, row3++) {
    c.beginPath();
    c.moveTo(-MARGIN, y);
    c.lineTo(L2.width + MARGIN, y);
    c.stroke();
    for (let x = -MARGIN + row3 % 2 * 60; x < L2.width + MARGIN; x += 120) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 40);
      c.stroke();
    }
  }
  c.strokeStyle = "#f6c6d9";
  c.lineWidth = 8;
  c.beginPath();
  c.ellipse(1600, 900, 320, 44, 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = "#fbe7a1";
  c.fillRect(-MARGIN, 938, w, 22);
  c.fillStyle = "#ffffff";
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 90) c.fillRect(x, 946, 46, 5);
  c.fillStyle = "#b9a7de";
  c.fillRect(-MARGIN, 1010, w, 34);
  c.fillStyle = "#9d8fc4";
  c.fillRect(-MARGIN, 1044, w, 14);
  bank(c, 1100, BOTTOM, 300);
}
function planters(c, L2) {
  for (const x of [150, 1620, L2.width - 150]) {
    poly(c, [[x - 70, 1110], [x + 70, 1110], [x + 56, 1200], [x - 56, 1200]], "#f6c6d9");
    poly(c, [[x + 14, 1110], [x + 70, 1110], [x + 56, 1200], [x + 14, 1200]], "#e5a9c4");
    c.fillStyle = "#ffffff";
    c.fillRect(x - 74, 1100, 148, 14);
    c.fillStyle = "#9aa6c0";
    c.fillRect(x - 5, 1040, 10, 72);
    ellipse(c, x, 1010, 74, 62, "#bfe9d9");
    ellipse(c, x + 16, 1e3, 40, 38, "#9fd9c2");
    ellipse(c, x - 24, 990, 14, 10, "#e6fbef");
  }
}
var skycity = {
  id: "skycity",
  name: "Sky City 2062",
  icon: "\u{1F6F8}",
  blurb: "Apartment pods ride up stalks through the clouds, saucer halls hover over glass domes, and cars glide down the sky lanes.",
  width: W2,
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 9e3, emissive: true, band: [0, 420], draw: sunMoon },
    { depth: 6500, fog: 0.15, band: [240, 700], draw: highClouds },
    { depth: 4e3, fog: 0.25, band: [120, 780], draw: farCity },
    { depth: 4e3, emissive: true, band: [120, 780], draw: farCityLights },
    { depth: 2400, fog: 0.1, band: [240, 640], draw: saucerLayer },
    { depth: 2400, emissive: true, band: [240, 640], draw: saucerLights },
    { depth: 1600, band: [520, 840], draw: (c) => bank(c, 690, 840, 500) },
    { depth: 900, band: [40, 790], draw: midTowers },
    { depth: 900, band: [580, 790], draw: domes },
    { depth: 900, emissive: true, band: [40, 790], draw: midLights },
    { depth: 900, emissive: true, band: [560, 760], draw: domeLights },
    { depth: 500, band: [620, 860], draw: nearClouds },
    { depth: 300, band: [660, 780], draw: rail },
    { depth: 300, emissive: true, band: [660, 780], draw: railLights },
    { depth: 0, band: [720, BOTTOM], draw: terrace },
    { depth: -380, band: [960, BOTTOM], draw: planters }
  ],
  marks: { left: 420, dome1: 1e3, centre: 1600, dome2: 2300, pad: 2700, right: 2950 },
  ambience: "city",
  music: "space",
  suggest: ["hover-car", "flying-saucer", "robot-retro", "cafe-table", "umbrella-table", "street-lamp", "bench", "satellite-dish", "fountain"]
};

// src/sets/haunted.ts
var W3 = 3e3;
var WALL2 = "#3b2a3c";
var DAMASK = "#4d3a50";
var WAINSCOT = "#2a1d2b";
var GILT = "#c9a24a";
var CANDLE = "#f4ead0";
var FLAME = "#ffd27a";
var WEB = "rgba(232,232,242,0.7)";
function archPath(c, x, y, w, h) {
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y + w / 2);
  c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  c.lineTo(x + w, y + h);
  c.closePath();
}
var WIN2 = { x: 1330, y: 160, w: 230, h: 460 };
function cobweb(c, x, y, r, a0) {
  c.strokeStyle = WEB;
  c.lineWidth = 2;
  const angle = (i) => a0 + (i / 6 - 0.5) * (Math.PI / 2);
  for (let i = 0; i <= 6; i++) {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(angle(i)) * r, y + Math.sin(angle(i)) * r);
    c.stroke();
  }
  for (const k of [0.3, 0.55, 0.8, 1]) {
    c.beginPath();
    for (let i = 0; i <= 6; i++) {
      const px = x + Math.cos(angle(i)) * r * k;
      const py = y + Math.sin(angle(i)) * r * k + (i > 0 && i < 6 ? r * 0.03 * k : 0);
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.stroke();
  }
}
function portrait(c, x, y, w, h, bg, skin, cloth) {
  c.fillStyle = GILT;
  c.fillRect(x - w / 2 - 12, y - 12, w + 24, h + 24);
  c.fillStyle = shade(GILT, -0.25);
  c.fillRect(x - w / 2 - 12, y + h + 6, w + 24, 12);
  c.fillStyle = bg;
  c.fillRect(x - w / 2, y, w, h);
  c.save();
  c.beginPath();
  c.rect(x - w / 2, y, w, h);
  c.clip();
  c.fillStyle = "rgba(0,0,0,0.2)";
  c.fillRect(x - w / 2, y, w * 0.22, h);
  c.beginPath();
  c.moveTo(x - w * 0.5, y + h);
  c.quadraticCurveTo(x - w * 0.42, y + h * 0.62, x - w * 0.18, y + h * 0.58);
  c.lineTo(x + w * 0.18, y + h * 0.58);
  c.quadraticCurveTo(x + w * 0.42, y + h * 0.62, x + w * 0.5, y + h);
  c.closePath();
  c.fillStyle = cloth;
  c.fill();
  c.fillStyle = "#e9e4d8";
  c.beginPath();
  c.moveTo(x - w * 0.12, y + h * 0.58);
  c.lineTo(x, y + h * 0.78);
  c.lineTo(x + w * 0.12, y + h * 0.58);
  c.closePath();
  c.fill();
  c.fillStyle = skin;
  c.fillRect(x - w * 0.07, y + h * 0.5, w * 0.14, h * 0.1);
  ellipse(c, x, y + h * 0.36, w * 0.19, h * 0.15, skin);
  c.fillStyle = shade(cloth, -0.35);
  c.beginPath();
  c.ellipse(x, y + h * 0.27, w * 0.23, h * 0.13, 0, Math.PI, 0);
  c.fill();
  c.restore();
}
function wallpaper(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = WALL2;
  c.fillRect(-MARGIN, -420, w, 1240);
  c.strokeStyle = DAMASK;
  c.lineWidth = 3;
  for (let y = -400, row3 = 0; y < 760; y += 60, row3++) {
    for (let x = -MARGIN + row3 % 2 * 40; x < L2.width + MARGIN; x += 80) {
      c.beginPath();
      c.moveTo(x, y - 22);
      c.lineTo(x + 20, y);
      c.lineTo(x, y + 22);
      c.lineTo(x - 20, y);
      c.closePath();
      c.stroke();
    }
  }
  const r = rng(77);
  c.strokeStyle = "#1d141f";
  c.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    let x = r.range(-MARGIN, L2.width + MARGIN);
    let y = r.range(-400, 600);
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += r.range(-30, 30);
      y += r.range(10, 40);
      c.lineTo(x, y);
    }
    c.stroke();
  }
  c.fillStyle = "#6f5a4a";
  for (const [px, py, pw, ph] of [[640, 300, 70, 90], [2400, 380, 110, 60], [2600, 140, 60, 120]]) {
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + pw, py + 8);
    c.lineTo(px + pw * 0.7, py + ph);
    c.lineTo(px, py + ph * 0.5);
    c.closePath();
    c.fill();
  }
  c.fillStyle = WAINSCOT;
  c.fillRect(-MARGIN, 640, w, 170);
  c.strokeStyle = "#3e2c3e";
  c.lineWidth = 3;
  for (let x = -MARGIN + 20; x < L2.width + MARGIN; x += 200) c.strokeRect(x, 668, 160, 110);
  c.fillStyle = "#5a4152";
  c.fillRect(-MARGIN, 630, w, 12);
}
function wallDetails(c) {
  const { x, y, w, h } = WIN2;
  c.save();
  c.globalCompositeOperation = "destination-out";
  archPath(c, x, y, w, h);
  c.fill();
  c.restore();
  c.strokeStyle = "#8a7a72";
  c.lineWidth = 22;
  archPath(c, x - 6, y - 6, w + 12, h + 6);
  c.stroke();
  c.strokeStyle = "#c9b89a";
  c.lineWidth = 8;
  archPath(c, x, y, w, h);
  c.stroke();
  c.fillStyle = "#c9b89a";
  c.fillRect(x + w / 2 - 4, y + w / 2, 8, h - w / 2);
  c.fillRect(x, y + h * 0.58, w, 7);
  c.fillRect(x + 6, y + h * 0.28, w - 12, 6);
  c.fillStyle = "#8a7a72";
  c.fillRect(x - 24, y + h, w + 48, 20);
  c.fillStyle = "#5a1620";
  poly(c, [[x - 40, y - 10], [x - 4, y - 10], [x + 20, y + h * 0.7], [x - 40, y + h + 14]], "#5a1620");
  c.fillStyle = "#3f0f17";
  c.fillRect(x - 40, y - 10, 10, h + 24);
  const fx = 2250;
  c.fillStyle = "#8a7a72";
  c.fillRect(fx - 20, 580, 440, 230);
  c.fillStyle = "#a79a8f";
  c.fillRect(fx - 40, 556, 480, 26);
  c.fillStyle = "#5b4b44";
  c.fillRect(fx - 40, 580, 480, 6);
  c.beginPath();
  c.roundRect(fx + 70, 640, 240, 150, [120, 120, 0, 0]);
  c.fillStyle = "#120b0e";
  c.fill();
  c.strokeStyle = "#5b4b44";
  c.lineWidth = 6;
  c.stroke();
  for (const cx of [fx + 40, fx + 420]) {
    c.fillStyle = CANDLE;
    c.fillRect(cx - 7, 500, 14, 56);
    c.fillStyle = shade(CANDLE, -0.15);
    c.fillRect(cx + 2, 500, 5, 56);
  }
  const dx = 2900;
  c.fillStyle = "#2b1a14";
  c.fillRect(dx - 12, 540, 154, 262);
  c.fillStyle = "#4a2c20";
  c.fillRect(dx, 552, 130, 250);
  c.strokeStyle = "#2b1a14";
  c.lineWidth = 4;
  c.strokeRect(dx + 14, 572, 44, 96);
  c.strokeRect(dx + 72, 572, 44, 96);
  c.strokeRect(dx + 14, 690, 44, 96);
  c.strokeRect(dx + 72, 690, 44, 96);
  ellipse(c, dx + 110, 680, 7, 7, GILT);
  for (const sx of [1e3, 1820]) {
    c.fillStyle = GILT;
    c.fillRect(sx - 4, 438, 8, 44);
    c.fillRect(sx - 18, 470, 36, 8);
    c.fillStyle = CANDLE;
    c.fillRect(sx - 8, 400, 16, 70);
    c.fillStyle = shade(CANDLE, -0.15);
    c.fillRect(sx + 2, 400, 6, 70);
  }
}
function wallPortraits(c) {
  portrait(c, 420, 230, 110, 150, "#2c3a3d", "#d8c3a5", "#2b2b38");
  portrait(c, 1950, 280, 120, 160, "#3e2a2a", "#e0cdb5", "#5b1b26");
  portrait(c, 2700, 226, 100, 136, "#262a40", "#cbb598", "#1f3b2e");
}
function lights(c, L2) {
  if (L2.pal.dark < 0.4) return;
  const flame2 = (x, y, s) => {
    glow(c, x, y, 70 * s, FLAME, 0.45);
    ellipse(c, x, y, 5 * s, 9 * s, "#ffe9a8");
  };
  for (const sx of [1e3, 1820]) flame2(sx, 396, 1);
  for (const cx of [2290, 2660]) flame2(cx, 494, 0.8);
  glow(c, 2390, 720, 170, "#ff8a3a", 0.4);
  for (let i = 0; i < 6; i++) {
    const fx = 2320 + i * 28 + i % 2 * 8;
    poly(c, [[fx - 16, 790], [fx + 4, 740 - i % 3 * 14], [fx + 16, 790]], i % 2 ? "#ff9a3a" : "#ffd25a");
  }
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    flame2(1950 + Math.cos(a) * 92, 150 + Math.sin(a) * 12, 0.75);
  }
  const eyes = [
    [420, 258],
    [1950, 310],
    [2700, 254]
  ];
  for (const [px, py] of eyes) {
    ellipse(c, px - 8, py, 3, 2.5, "#9dff9d");
    ellipse(c, px + 8, py, 3, 2.5, "#9dff9d");
  }
}
function skyThroughWindow(c, L2) {
  const night = L2.pal.dark > 0.4;
  glow(c, 1445, 340, 260, "#e8e4c8", 0.35);
  ellipse(c, 1445, 340, 92, 92, night ? "#f4f0d4" : "#ffe9b5");
  ellipse(c, 1420, 318, 16, 12, "#dcd6b4");
  ellipse(c, 1468, 372, 12, 9, "#dcd6b4");
  ellipse(c, 1462, 316, 8, 7, "#dcd6b4");
  if (!night) return;
  const r = rng(9);
  for (let i = 0; i < 90; i++) {
    const x = WIN2.x - 60 + r() * (WIN2.w + 120);
    const y = WIN2.y - 80 + r() * 560;
    ellipse(c, x, y, 2 + r() * 1.5, 2 + r() * 1.5, "#fff8e6");
  }
}
function lightning(c, L2) {
  if (L2.pal.dark < 0.9) return;
  c.strokeStyle = "#eef6ff";
  c.lineWidth = 4;
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(1392, 60);
  c.lineTo(1420, 210);
  c.lineTo(1388, 270);
  c.lineTo(1430, 390);
  c.lineTo(1404, 470);
  c.stroke();
  glow(c, 1420, 260, 200, "#cfe2ff", 0.25);
}
function deadTrees(c, L2) {
  c.fillStyle = "#1f1a2c";
  c.beginPath();
  c.moveTo(-MARGIN, 640);
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 60) c.lineTo(x, 610 - Math.sin(x / 300) * 18 - Math.sin(x / 110) * 6);
  c.lineTo(L2.width + MARGIN, 800);
  c.lineTo(-MARGIN, 800);
  c.fill();
  const tree2 = (x, base, h, seed) => {
    const r = rng(seed);
    c.strokeStyle = "#17131f";
    c.lineCap = "round";
    c.lineWidth = h * 0.05;
    c.beginPath();
    c.moveTo(x, base);
    c.lineTo(x + r.range(-8, 8), base - h * 0.55);
    c.stroke();
    const stack2 = [[x, base - h * 0.5, -0.5, h * 0.35, 0]];
    while (stack2.length) {
      const [sx, sy, a, len, d] = stack2.pop();
      const ex = sx + Math.sin(a) * len;
      const ey = sy - Math.cos(a) * len;
      c.lineWidth = Math.max(1.5, len * 0.12);
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(ex, ey);
      c.stroke();
      if (d < 3 && len > 8) {
        stack2.push([ex, ey, a - r.range(0.3, 0.6), len * 0.68, d + 1]);
        stack2.push([ex, ey, a + r.range(0.3, 0.6), len * 0.68, d + 1]);
      }
    }
  };
  tree2(1170, 650, 270, 3);
  tree2(1310, 640, 230, 4);
  tree2(1520, 648, 300, 5);
  tree2(1680, 646, 210, 6);
  tree2(950, 650, 260, 7);
  tree2(2350, 650, 240, 8);
}
function staircase(c) {
  const x0 = 60;
  const N = 14;
  const rise = 27;
  const run = 56;
  const top = (i) => 770 - i * rise;
  c.beginPath();
  c.moveTo(x0, 800);
  for (let i = 0; i <= N; i++) {
    c.lineTo(x0 + i * run, top(i));
    if (i < N) c.lineTo(x0 + (i + 1) * run, top(i));
  }
  c.lineTo(x0 + N * run, 800);
  c.closePath();
  c.fillStyle = "#6b3f2a";
  c.fill();
  for (let i = 0; i < N; i++) {
    c.fillStyle = "#8a5a3e";
    c.fillRect(x0 + i * run, top(i), run, 6);
    c.fillStyle = "#4b2b1c";
    c.fillRect(x0 + i * run + run - 7, top(i), 7, 800 - top(i));
  }
  c.fillStyle = "#6b3f2a";
  c.fillRect(x0 + N * run - 4, 385, 260, 30);
  c.fillStyle = "#8a5a3e";
  c.fillRect(x0 + N * run - 4, 385, 260, 7);
  c.fillStyle = "#4b2b1c";
  c.fillRect(x0 + N * run - 4, 415, 260, 400);
  c.fillStyle = "#8a5a3e";
  c.fillRect(x0 + N * run - 4, 352, 260, 8);
  for (let bx = x0 + N * run; bx < x0 + N * run + 256; bx += 22) c.fillRect(bx, 360, 6, 25);
  c.fillStyle = "#3a2214";
  for (let bx = x0 + N * run + 20; bx < x0 + N * run + 240; bx += 110) c.fillRect(bx, 470, 64, 120);
  c.strokeStyle = "#7a1f2b";
  c.lineWidth = 16;
  c.beginPath();
  c.moveTo(x0 + 20, 776);
  for (let i = 0; i < N; i++) c.lineTo(x0 + i * run + run * 0.5, top(i) - 1);
  c.stroke();
  const railY = (x) => 690 - (x - x0) / (N * run) * 330;
  c.strokeStyle = "#8a5a3e";
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(x0, railY(x0));
  c.lineTo(x0 + N * run, railY(x0 + N * run));
  c.stroke();
  c.lineWidth = 4;
  for (let i = 0; i <= N; i++) {
    const px = x0 + i * run;
    const foot = top(Math.min(i, N - 1)) - 2;
    c.beginPath();
    c.moveTo(px, railY(px));
    c.lineTo(px, foot);
    c.stroke();
  }
  c.fillStyle = "#5b3420";
  c.fillRect(x0 - 18, 560, 36, 240);
  ellipse(c, x0, 554, 22, 22, "#8a5a3e");
}
function ceiling2(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, -420, 150, [[0, "#1d1624"], [1, "#2e2338"]]);
  c.fillRect(-MARGIN, -420, w, 570);
  c.fillStyle = "#5b4a5e";
  c.fillRect(-MARGIN, 112, w, 24);
  c.fillStyle = "#3e3046";
  c.fillRect(-MARGIN, 136, w, 14);
  for (let x = -MARGIN + 10; x < L2.width + MARGIN; x += 44) {
    c.fillStyle = "#4f3f55";
    c.fillRect(x, 96, 22, 16);
  }
  c.strokeStyle = "#140e1a";
  c.lineWidth = 2;
  const r = rng(21);
  for (let i = 0; i < 14; i++) {
    let x = r.range(0, L2.width);
    let y = -400 + r() * 200;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += r.range(-20, 20);
      y += r.range(8, 26);
      c.lineTo(x, y);
    }
    c.stroke();
  }
  c.strokeStyle = "#5b4a5e";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(1950, -420);
  c.lineTo(1950, 136);
  c.stroke();
  c.strokeStyle = GILT;
  c.lineWidth = 6;
  c.beginPath();
  c.ellipse(1950, 150, 110, 24, 0, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    c.beginPath();
    c.moveTo(1950, 150);
    c.lineTo(1950 + Math.cos(a) * 92, 150 + Math.sin(a) * 12);
    c.stroke();
    c.fillStyle = CANDLE;
    c.fillRect(1950 + Math.cos(a) * 92 - 5, 130 + Math.sin(a) * 12, 10, 22);
  }
  cobweb(c, 1270, -420, 170, Math.PI / 2 + 0.5);
  cobweb(c, 2750, -420, 150, Math.PI / 2 - 0.5);
}
function floor3(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, 740, BOTTOM, [[0, "#6e4a30"], [1, "#4d3221"]]);
  c.fillRect(-MARGIN, 740, w, BOTTOM - 740);
  c.strokeStyle = "rgba(30,18,10,0.55)";
  c.lineWidth = 2;
  for (let y = 780, row3 = 0; y < BOTTOM; y += 34 + row3 * 5, row3++) {
    c.beginPath();
    c.moveTo(-MARGIN, y);
    c.lineTo(L2.width + MARGIN, y);
    c.stroke();
    for (let x = -MARGIN + row3 % 2 * 150; x < L2.width + MARGIN; x += 300) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 34 + row3 * 5);
      c.stroke();
    }
  }
  const cx = 1500;
  poly(c, [[cx - 120, 790], [cx + 120, 790], [cx + 300, BOTTOM], [cx - 300, BOTTOM]], "#7a1f2b");
  poly(c, [[cx - 134, 790], [cx - 120, 790], [cx - 300, BOTTOM], [cx - 322, BOTTOM]], GILT);
  poly(c, [[cx + 120, 790], [cx + 134, 790], [cx + 322, BOTTOM], [cx + 300, BOTTOM]], GILT);
}
function foreground7(c, L2) {
  cobweb(c, -20, -20, 260, Math.PI / 4);
  cobweb(c, L2.width + 20, -20, 240, 3 * Math.PI / 4);
  c.strokeStyle = WEB;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, 200);
  c.quadraticCurveTo(70, 230, 120, 180);
  c.stroke();
}
var haunted = {
  id: "haunted",
  name: "Haunted House",
  icon: "\u{1F3DA}\uFE0F",
  blurb: "A mansion hall with a grand staircase, peeling damask, watchful portraits and a moonlit arched window.",
  width: W3,
  interior: true,
  times: ["dusk", "night"],
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 8e3, fog: 0, band: [0, 640], draw: skyThroughWindow, emissive: true },
    { depth: 8e3, band: [0, 640], draw: lightning, emissive: true },
    { depth: 3e3, fog: 0.3, band: [380, 820], draw: deadTrees },
    { depth: 600, band: [-420, 810], draw: (c, L2) => {
      wallpaper(c, L2);
      wallDetails(c);
      wallPortraits(c);
    } },
    { depth: 600, band: [380, 810], draw: lights, emissive: true },
    { depth: 450, band: [360, 820], draw: staircase },
    { depth: 300, band: [-420, 200], draw: ceiling2 },
    { depth: 0, band: [740, BOTTOM], draw: floor3 },
    { depth: -380, band: [-420, 320], draw: foreground7 }
  ],
  marks: { stairs: 300, portrait: 1e3, window: 1445, chandelier: 1950, fire: 2390, door: 2960 },
  ambience: "spooky",
  music: "spooky",
  suggest: ["candelabra", "coffin", "haunted-portrait", "skeleton", "potion-shelf", "ghost-sheet", "cobweb", "crystal-ball", "armchair", "grandfather-clock"]
};

// src/sets/farm.ts
var W4 = 3200;
var RED = "#b8432f";
var RED_SHADE = "#8f3223";
var CREAM = "#f1e3c4";
var ROOF = "#4a3b35";
var GRASS2 = "#86b35f";
var GRASS_DARK2 = "#74a751";
var WHEAT = "#e2c66c";
function hillLine(c, base, amp, seed, bottom, col, width) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(-MARGIN, bottom);
  for (let x = -MARGIN; x <= width + MARGIN; x += 40) {
    const y = base - Math.sin((x + seed) / 420) * amp - Math.sin((x + seed * 2) / 180) * amp * 0.25 - Math.cos((x * 0.7 + seed) / 900) * amp * 0.4;
    c.lineTo(x, y);
  }
  c.lineTo(width + MARGIN, bottom);
  c.closePath();
  c.fill();
}
function hillY(base, amp, seed, x) {
  return base - Math.sin((x + seed) / 420) * amp - Math.sin((x + seed * 2) / 180) * amp * 0.25 - Math.cos((x * 0.7 + seed) / 900) * amp * 0.4;
}
function farHills(c, L2) {
  hillLine(c, 600, 70, 30, 820, "#7fa493", L2.width);
  hillLine(c, 640, 40, 310, 820, "#6d9a7e", L2.width);
}
function clouds2(c) {
  for (let i = 0; i < 7; i++) cloud(c, -200 + i * 520, 420 + i % 3 * 50, 300 + i % 2 * 90, "#ffffff", "#dfe9f2", 90 + i);
}
function windmillRidge(c, L2) {
  hillLine(c, 650, 44, 720, 800, "#6e9c5e", L2.width);
  const x = 2400;
  const base = hillY(650, 44, 720, x) + 4;
  const top = base - 300;
  c.fillStyle = "#ece6da";
  poly(c, [[x - 26, base], [x + 26, base], [x + 16, top + 40], [x - 16, top + 40]], "#ece6da");
  poly(c, [[x + 4, base], [x + 26, base], [x + 16, top + 40], [x + 4, top + 40]], "#cfc7b6");
  c.fillStyle = "#8c9cae";
  c.fillRect(x - 10, base - 40, 20, 40);
  poly(c, [[x - 30, top + 46], [x + 30, top + 46], [x, top + 6]], "#a33a2a");
  c.strokeStyle = "#3b3b44";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x + 30, top + 40);
  c.lineTo(x + 80, top + 20);
  c.stroke();
  const hx = x - 4;
  const hy = top + 30;
  for (let i = 0; i < 4; i++) {
    const a = 0.5 + i * Math.PI / 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const nx = -dy;
    const ny = dx;
    const len = 150;
    c.strokeStyle = "#4a4a52";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(hx + dx * len, hy + dy * len);
    c.stroke();
    poly(
      c,
      [
        [hx + dx * 30 + nx * 4, hy + dy * 30 + ny * 4],
        [hx + dx * len * 0.95 + nx * 4, hy + dy * len * 0.95 + ny * 4],
        [hx + dx * len * 0.95 - nx * 26, hy + dy * len * 0.95 - ny * 26],
        [hx + dx * 30 - nx * 26, hy + dy * 30 - ny * 26]
      ],
      "#f5f1e6"
    );
  }
  ellipse(c, hx, hy, 9, 9, "#3b3b44");
}
function fields(c, L2) {
  const r = rng(12);
  hillLine(c, 610, 30, 150, 820, GRASS2, L2.width);
  for (let k = 0; k < 14; k++) {
    const x0 = -MARGIN + k * 260 + r.range(-40, 40);
    const x1 = x0 + 260;
    for (let y = 640; y < 800; y += 22) {
      const col = (k + Math.floor(y / 22)) % 3 === 0 ? WHEAT : (k + Math.floor(y / 22)) % 2 ? GRASS2 : GRASS_DARK2;
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y - 4);
      c.lineTo(x1, y + 18);
      c.lineTo(x0, y + 22);
      c.closePath();
      c.fill();
    }
  }
  for (let x = 120; x < L2.width; x += 330) {
    const y = hillY(610, 30, 150, x) + 6;
    roundTree(c, x + r.range(-30, 30), y, 150, "#6b4d33", "#3f7a3a", r, "#7fb36a");
  }
}
function buildings(c) {
  c.save();
  c.translate(450, 0);
  c.fillStyle = RED;
  c.fillRect(150, 480, 560, 320);
  c.fillStyle = RED_SHADE;
  c.fillRect(560, 480, 150, 320);
  c.fillStyle = "#f5f1e6";
  for (let x = 170; x < 690; x += 58) c.fillRect(x, 480, 3, 320);
  poly(c, [[120, 486], [190, 404], [660, 404], [730, 486]], ROOF);
  poly(c, [[190, 404], [660, 404], [640, 412], [212, 412]], "#2e2420");
  c.fillStyle = "#f5f1e6";
  c.fillRect(398, 440, 54, 40);
  c.strokeStyle = RED;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(398, 440);
  c.lineTo(452, 480);
  c.moveTo(452, 440);
  c.lineTo(398, 480);
  c.stroke();
  c.fillStyle = "#f5f1e6";
  c.fillRect(352, 560, 150, 240);
  c.fillStyle = "#7d2b20";
  c.fillRect(360, 568, 66, 232);
  c.fillRect(434, 568, 66, 232);
  c.strokeStyle = "#f5f1e6";
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(364, 572);
  c.lineTo(422, 796);
  c.moveTo(422, 572);
  c.lineTo(364, 796);
  c.moveTo(438, 572);
  c.lineTo(496, 796);
  c.moveTo(496, 572);
  c.lineTo(438, 796);
  c.stroke();
  c.restore();
  c.save();
  c.translate(350, 0);
  c.fillStyle = CREAM;
  c.fillRect(1e3, 560, 480, 240);
  c.fillStyle = "#d9c8a6";
  c.fillRect(1340, 560, 140, 240);
  poly(c, [[968, 566], [1240, 430], [1512, 566]], "#8b3a2a");
  poly(c, [[1240, 430], [1512, 566], [1240, 566]], "#6f2c20");
  c.fillStyle = "#9a5a48";
  c.fillRect(1360, 440, 36, 84);
  c.fillStyle = "#5b3a2a";
  c.fillRect(1362, 440, 32, 6);
  for (const wx of [1034, 1372]) {
    c.fillStyle = "#ffffff";
    c.fillRect(wx - 6, 600 - 6, 80, 92);
    c.fillStyle = "#9fd2ee";
    c.fillRect(wx, 600, 68, 80);
    c.fillStyle = "#ffffff";
    c.fillRect(wx + 32, 600, 4, 80);
    c.fillRect(wx, 638, 68, 4);
    c.fillStyle = "#4f7a4a";
    c.fillRect(wx - 16, 600, 10, 80);
    c.fillRect(wx + 74, 600, 10, 80);
  }
  c.fillStyle = "#7a4a2a";
  c.fillRect(1200, 660, 60, 140);
  c.fillStyle = "#5a3620";
  c.fillRect(1250, 720, 4, 4);
  poly(c, [[1150, 660], [1310, 660], [1330, 636], [1130, 636]], "#8b3a2a");
  c.fillStyle = "#ffffff";
  c.fillRect(1160, 660, 12, 140);
  c.fillRect(1288, 660, 12, 140);
  c.fillRect(1130, 796, 220, 8);
  c.fillStyle = "#d9c8a6";
  c.fillRect(1182, 800, 96, 10);
  c.restore();
  c.save();
  c.translate(-120, 0);
  c.fillStyle = "#c9cdd2";
  c.fillRect(2220, 380, 160, 420);
  c.fillStyle = "#9aa3ab";
  c.fillRect(2300, 380, 80, 420);
  c.strokeStyle = "#8a929a";
  c.lineWidth = 3;
  for (let y = 420; y < 800; y += 36) {
    c.beginPath();
    c.moveTo(2220, y);
    c.lineTo(2380, y);
    c.stroke();
  }
  c.beginPath();
  c.arc(2300, 380, 80, Math.PI, 0);
  c.fillStyle = "#7d868f";
  c.fill();
  c.fillStyle = "#5b636b";
  c.fillRect(2296, 300, 8, 16);
  c.restore();
}
function lights2(c, L2) {
  if (L2.pal.dark < 0.4) return;
  for (const wx of [1384, 1722]) {
    c.fillStyle = "#ffd77a";
    c.fillRect(wx, 600, 68, 80);
    c.fillStyle = "#ffffff";
    c.fillRect(wx + 32, 600, 4, 80);
    c.fillRect(wx, 638, 68, 4);
    glow(c, wx + 34, 640, 110, "#ffcf70", 0.5);
  }
  glow(c, 1630, 700, 140, "#ffcf70", 0.4);
  c.fillStyle = "#ffd77a";
  c.fillRect(868, 500, 14, 18);
  glow(c, 875, 508, 120, "#ffd77a", 0.55);
}
function fence(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = "#e0d3b5";
  c.fillRect(-MARGIN, 706, w, 12);
  c.fillRect(-MARGIN, 752, w, 12);
  c.strokeStyle = "#bfae88";
  c.lineWidth = 2;
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 150) {
    c.fillStyle = "#e0d3b5";
    c.fillRect(x - 7, 668, 14, 150);
    poly(c, [[x - 7, 668], [x, 654], [x + 7, 668]], "#e0d3b5");
    c.beginPath();
    c.moveTo(x + 3, 668);
    c.lineTo(x + 3, 818);
    c.stroke();
  }
}
function yard(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, 760, BOTTOM, [[0, "#c99c66"], [1, "#9c7143"]]);
  c.fillRect(-MARGIN, 760, w, BOTTOM - 760);
  c.fillStyle = "#6aa04a";
  c.fillRect(-MARGIN, 756, w, 16);
  grassTufts(c, -MARGIN, L2.width + MARGIN, 770, "#5f9a45", rng(41), 0.03, 26);
  c.strokeStyle = "rgba(110,74,40,0.55)";
  c.lineWidth = 14;
  for (const y of [900, 935]) {
    c.beginPath();
    c.moveTo(-MARGIN, y + 20);
    c.lineTo(L2.width + MARGIN, y - 10);
    c.stroke();
  }
  const r = rng(5);
  for (let i = 0; i < 120; i++) {
    const x = r.range(-MARGIN, L2.width + MARGIN);
    const y = r.range(800, BOTTOM);
    ellipse(c, x, y, 4 + r() * 6, 2.5 + r() * 3, r() < 0.5 ? "#b5a58e" : "#7b6a55");
  }
  c.fillStyle = "#e8cf7e";
  for (let i = 0; i < 60; i++) c.fillRect(r.range(-MARGIN, L2.width + MARGIN), r.range(800, BOTTOM), 10, 3);
}
function foreground8(c, L2) {
  const stalk = (x, lean) => {
    c.strokeStyle = "#6d8f3a";
    c.lineWidth = 12;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(x, BOTTOM);
    c.quadraticCurveTo(x + lean * 0.3, 1100, x + lean, 960);
    c.stroke();
    for (let i = 0; i < 6; i++) {
      const y = BOTTOM - 40 - i * 36;
      const dir = i % 2 ? 1 : -1;
      poly(
        c,
        [
          [x, y],
          [x + dir * 110, y - 40],
          [x + dir * 120, y - 20],
          [x, y + 16]
        ],
        i % 2 ? "#7fa445" : "#5f8a35"
      );
    }
    poly(c, [[x + lean - 14, 960], [x + lean + 14, 960], [x + lean + 6, 1010], [x + lean - 6, 1010]], "#c9a84a");
  };
  stalk(70, -30);
  stalk(180, 22);
  stalk(L2.width - 80, 26);
  stalk(L2.width - 190, -22);
  const bx = 1640;
  ellipse(c, bx, 1150, 120, 60, "#e2b84a");
  ellipse(c, bx, 1150, 80, 36, "#c99a33");
  c.strokeStyle = "#b8862a";
  c.lineWidth = 4;
  c.beginPath();
  c.ellipse(bx, 1150, 80, 36, 0, 0, Math.PI * 2);
  c.stroke();
}
var farm = {
  id: "farm",
  name: "Farm",
  icon: "\u{1F404}",
  blurb: "A red barn, a porch-fronted farmhouse and a silo on the striped fields, with a windmill turning on the far ridge.",
  width: W4,
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 7e3, fog: 0.1, band: [180, 620], draw: clouds2 },
    { depth: 6e3, fog: 0.35, band: [480, 820], draw: farHills },
    { depth: 3500, fog: 0.2, band: [200, 820], draw: windmillRidge },
    { depth: 2e3, fog: 0.1, band: [520, 820], draw: fields },
    { depth: 900, band: [380, 810], draw: (c) => buildings(c) },
    { depth: 900, emissive: true, band: [400, 720], draw: lights2 },
    { depth: 300, band: [640, 830], draw: fence },
    { depth: 0, band: [750, BOTTOM], draw: yard },
    { depth: -380, band: [940, BOTTOM], draw: foreground8 }
  ],
  marks: { left: 560, barn: 890, house: 1580, silo: 2180, windmill: 2400, gate: 2750 },
  ambience: "farm",
  music: "country",
  suggest: ["cow", "chicken", "haystack", "scarecrow", "well", "tractor", "wheelbarrow", "watering-can", "beehive"]
};

// src/sets/airplane.ts
var W5 = 3200;
var WALL3 = "#eef3f8";
var DADO2 = "#b8c9dc";
var BIN = "#ead9bd";
var SEAT = "#3b5b8c";
var SEAT_DARK = "#2a4670";
var CURTAIN2 = "#2f5d8a";
var CARPET2 = "#5b76a0";
var WIN_Y = 380;
var WIN_RX = 70;
var WIN_RY = 92;
var WINDOWS = [620, 980, 1340, 1700, 2060, 2420, 2780];
function cabinWall(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = WALL3;
  c.fillRect(-MARGIN, -420, w, 1240);
  c.strokeStyle = "#d6dfea";
  c.lineWidth = 3;
  for (let x = -MARGIN + 60; x < L2.width + MARGIN; x += 180) {
    c.beginPath();
    c.moveTo(x, 150);
    c.lineTo(x, 640);
    c.stroke();
  }
  c.fillStyle = DADO2;
  c.fillRect(-MARGIN, 560, w, 80);
  c.fillStyle = shade(DADO2, 0.1);
  c.fillRect(-MARGIN, 556, w, 6);
  c.fillStyle = "#c9dcef";
  c.fillRect(-MARGIN, 262, w, 8);
  c.save();
  c.globalCompositeOperation = "destination-out";
  for (const x of WINDOWS) {
    c.beginPath();
    c.ellipse(x, WIN_Y, WIN_RX, WIN_RY, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  for (const x of WINDOWS) {
    c.strokeStyle = "#9fb1c6";
    c.lineWidth = 12;
    c.beginPath();
    c.ellipse(x, WIN_Y, WIN_RX + 6, WIN_RY + 6, 0, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = "#ffffff";
    c.lineWidth = 4;
    c.beginPath();
    c.ellipse(x, WIN_Y, WIN_RX + 1, WIN_RY + 1, 0, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    if (x % 3 === 0) {
      c.fillStyle = "#f4f6fa";
      c.fillRect(x - WIN_RX - 4, WIN_Y - WIN_RY - 6, WIN_RX * 2 + 8, WIN_RY * 0.5);
    }
  }
}
function cloudSea(c, L2) {
  c.fillStyle = vgrad(c, 300, 780, [[0, "#8fc4ec"], [1, "#c8e6fa"]]);
  c.fillRect(-MARGIN, 300, L2.width + MARGIN * 2, 480);
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 240) {
    cloud(c, x + 80, 470 + x * 3 % 90, 360 + x * 7 % 120, "#ffffff", "#d7e6f5", 40 + Math.round(x));
  }
  c.fillStyle = "#ffffff";
  c.fillRect(-MARGIN, 540, L2.width + MARGIN * 2, 240);
}
function stars(c, L2) {
  if (L2.pal.dark < 0.4) return;
  const r = rng(13);
  c.fillStyle = "#fff8e6";
  for (let i = 0; i < 260; i++) {
    const x = r.range(-MARGIN, L2.width + MARGIN);
    const y = r.range(-420, 520);
    ellipse(c, x, y, 1.5 + r() * 1.8, 1.5 + r() * 1.8, "#fff8e6");
  }
}
function overheadBins(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, -420, 70, [[0, "#f8fafd"], [1, "#e1e8f1"]]);
  c.fillRect(-MARGIN, -420, w, 490);
  for (let x = -MARGIN + 20; x < L2.width + MARGIN; x += 300) {
    rrect(c, x, 64, 280, 136, 22);
    c.fillStyle = BIN;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = shade(BIN, -0.12);
    c.fillRect(x, 170, 280, 40);
    c.fillStyle = shade(BIN, 0.1);
    c.fillRect(x, 64, 280, 10);
    c.restore();
    c.strokeStyle = shade(BIN, -0.45);
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = "#b9a47f";
    rrect(c, x + 120, 128, 40, 14, 6);
    c.fill();
    c.strokeStyle = "#8c7a5a";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + 10, 140);
    c.lineTo(x + 270, 140);
    c.stroke();
  }
  c.fillStyle = "#c7d2df";
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 90) c.fillRect(x, 36, 52, 8);
}
function readingLights(c, L2) {
  if (L2.pal.dark < 0.4) return;
  c.fillStyle = "#fffbe8";
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 300) {
    c.fillRect(x + 110, 200, 60, 6);
    glow(c, x + 140, 206, 80, "#fff1c2", 0.35);
  }
  c.fillStyle = "#ffffff";
  for (let x = -MARGIN + 150; x < L2.width + MARGIN; x += 300) {
    c.fillRect(x, 264, 10, 4);
  }
}
function galleyCurtain(c, L2) {
  const x0 = L2.width - 320;
  const x1 = L2.width + 120;
  c.fillStyle = "#21283a";
  c.fillRect(x0 - 14, -420, 14, 1240);
  c.fillStyle = "#8c94a6";
  c.fillRect(x0 - 16, 66, x1 - x0 + 32, 8);
  const n = 9;
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * step;
    const col = i % 2 ? CURTAIN2 : "#27507a";
    poly(c, [[xa, 74], [xa + step, 74], [xa + step + 6, 800], [xa + 6, 800]], col);
    c.fillStyle = shade(col, -0.2);
    c.fillRect(xa + step * 0.72, 74, step * 0.28, 726);
  }
  c.fillStyle = shade(CURTAIN2, -0.35);
  c.fillRect(x0, 720, x1 - x0, 80);
}
function seats(c, L2) {
  for (let x = -MARGIN + 40; x < L2.width + MARGIN; x += 380) {
    rrect(c, x, 712, 300, 96, 26);
    c.fillStyle = SEAT;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = SEAT_DARK;
    c.fillRect(x + 200, 712, 120, 96);
    c.restore();
    rrect(c, x + 66, 690, 168, 44, 16);
    c.fillStyle = SEAT_DARK;
    c.fill();
    c.strokeStyle = shade(SEAT, -0.4);
    c.lineWidth = 2;
    c.stroke();
    c.strokeStyle = shade(SEAT, -0.25);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x + 18, 752);
    c.lineTo(x + 282, 752);
    c.stroke();
    rrect(c, x - 14, 790, 22, 36, 8);
    c.fillStyle = "#7d8aa0";
    c.fill();
    rrect(c, x + 292, 790, 22, 36, 8);
    c.fill();
  }
}
function aisle(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = CARPET2;
  c.fillRect(-MARGIN, 800, w, BOTTOM - 800);
  for (let row3 = 0, y = 830; y < BOTTOM; row3++, y += 26 + row3 * 3) {
    c.strokeStyle = row3 % 2 ? "#4d6896" : "#6d89b0";
    c.lineWidth = 6 + row3 * 0.5;
    c.beginPath();
    for (let x = -MARGIN; x <= L2.width + MARGIN; x += 60) {
      const yy = y + (x / 60 % 2 ? 14 : 0) + row3 * 2;
      x === -MARGIN ? c.moveTo(x, yy) : c.lineTo(x, yy);
    }
    c.stroke();
  }
  c.fillStyle = "rgba(255,255,255,0.08)";
  c.fillRect(L2.width * 0.38, 800, L2.width * 0.24, BOTTOM - 800);
  c.fillStyle = "#334d74";
  c.fillRect(-MARGIN, 796, w, 8);
}
function foreground9(c, L2) {
  for (const x of [-60, L2.width - 200]) {
    rrect(c, x, 990, 260, 170, 40);
    c.fillStyle = "#25395a";
    c.fill();
    c.fillStyle = "#334d74";
    c.fillRect(x + 20, 990, 220, 18);
    c.fillStyle = "#18253d";
    c.fillRect(x, 1140, 260, 60);
  }
}
var airplane = {
  id: "airplane",
  name: "Airliner Cabin",
  icon: "\u2708\uFE0F",
  blurb: "Inside a passenger jet: oval windows over a sea of clouds, overhead bins, a row of seats and the aisle carpet.",
  width: W5,
  interior: true,
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 8e3, emissive: true, band: [0, 640], draw: stars },
    { depth: 4500, fog: 0.15, band: [280, 800], draw: cloudSea },
    { depth: 600, band: [-420, 810], draw: cabinWall },
    { depth: 300, band: [-420, 300], draw: overheadBins },
    { depth: 300, emissive: true, band: [-420, 300], draw: readingLights },
    { depth: 450, band: [-420, 810], draw: galleyCurtain },
    { depth: 250, band: [680, 810], draw: seats },
    { depth: 0, band: [790, BOTTOM], draw: aisle },
    { depth: -380, band: [960, BOTTOM], draw: foreground9 }
  ],
  marks: { left: 560, window1: 980, centre: 1600, window2: 2060, galley: 2900, right: 2420 },
  ambience: "cabin",
  music: "jazz",
  suggest: ["airplane-cart", "suitcase", "coffee-table", "bottle", "tea-glass", "radio-old", "gift-box", "telephone-rotary", "umbrella"]
};

// src/sets/mars.ts
var W6 = 3200;
var SAND2 = "#c4642f";
var SAND_DARK = "#8a3f22";
var ROCK_LIGHT = "#c77a4d";
var DOME_GLASS = "#cfe7ee";
var LIT6 = "#ffd77a";
var HAB = [
  { x: 1300, r: 150, base: 800 },
  { x: 1960, r: 100, base: 800 }
];
var ROCKET_X = 2560;
var SKY = {
  dawn: ["#b87a4a", "#f0c58e"],
  day: ["#d69a5a", "#f6d7a4"],
  dusk: ["#a8643a", "#e9ab72"],
  night: ["#5e3d2a", "#a77650"]
};
function mesa(c, x, w, top, base, col) {
  poly(c, [[x, base], [x + w * 0.12, top + 20], [x + w * 0.2, top], [x + w * 0.8, top], [x + w * 0.9, top + 24], [x + w, base]], col);
  poly(c, [[x + w * 0.5, base], [x + w * 0.5, top + 4], [x + w * 0.8, top], [x + w * 0.9, top + 24], [x + w, base]], shade(col, -0.16));
}
function skyMoons(c, L2) {
  const sun = L2.pal.dark > 0.4 ? "#c7d6ff" : "#dfeaff";
  glow(c, 2480, 150, 280, "#ffe6c2", 0.35);
  ellipse(c, 2480, 150, 44, 44, sun);
  ellipse(c, 900, 140, 24, 20, "#a58a78");
  ellipse(c, 910, 136, 12, 9, "#8a7262");
  ellipse(c, 1880, 210, 11, 9, "#a58a78");
}
function moonGlow(c, L2) {
  if (L2.pal.dark < 0.4) return;
  ellipse(c, 900, 140, 24, 20, "#e9dccd");
  ellipse(c, 1880, 210, 11, 9, "#e9dccd");
  glow(c, 2480, 150, 160, "#d7e4ff", 0.3);
}
function farVolcano(c) {
  const cx = 1700;
  const peak = 330;
  const base = 720;
  c.fillStyle = "#9e5232";
  c.beginPath();
  c.moveTo(cx - 1e3, base);
  for (let x = cx - 1e3; x <= cx + 1e3; x += 20) {
    const t = Math.abs(x - cx) / 1e3;
    const y = peak + (base - peak) * Math.pow(t, 1.8);
    c.lineTo(x, Math.min(base, y));
  }
  c.lineTo(cx + 1e3, base + 40);
  c.lineTo(cx - 1e3, base + 40);
  c.closePath();
  c.fill();
  c.fillStyle = "#b86a42";
  c.beginPath();
  c.moveTo(cx - 1e3, base);
  for (let x = cx - 1e3; x <= cx; x += 20) {
    const t = Math.abs(x - cx) / 1e3;
    c.lineTo(x, Math.min(base, peak + (base - peak) * Math.pow(t, 1.8)));
  }
  c.lineTo(cx, base);
  c.closePath();
  c.fill();
  ellipse(c, cx, peak + 6, 120, 16, "#7a3f26");
}
function mesas(c, L2) {
  const r = rng(31);
  c.fillStyle = "#b8623a";
  c.fillRect(-MARGIN, 690, L2.width + MARGIN * 2, 60);
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 320) {
    const w = r.range(220, 420);
    mesa(c, x + r.range(-60, 60), w, r.range(560, 620), 740, r.chance(0.5) ? "#b8623a" : "#a95633");
  }
}
function ridgeLine(c, L2) {
  c.fillStyle = "#b15a31";
  c.beginPath();
  c.moveTo(-MARGIN, 800);
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 40) {
    c.lineTo(x, 690 - Math.abs(Math.sin(x / 260)) * 36 - Math.sin(x / 90) * 10 - Math.sin(x / 700) * 30);
  }
  c.lineTo(L2.width + MARGIN, 800);
  c.closePath();
  c.fill();
  c.fillStyle = "#9b4c29";
  c.beginPath();
  c.moveTo(-MARGIN, 800);
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 40) {
    c.lineTo(x, 730 - Math.abs(Math.sin(x / 220 + 1)) * 26);
  }
  c.lineTo(L2.width + MARGIN, 800);
  c.closePath();
  c.fill();
}
function crater(c, x, y, rx, ry) {
  ellipse(c, x, y + ry * 0.25, rx, ry, ROCK_LIGHT);
  ellipse(c, x + rx * 0.08, y + ry * 0.3, rx * 0.82, ry * 0.78, SAND_DARK);
  ellipse(c, x + rx * 0.1, y + ry * 0.5, rx * 0.6, ry * 0.5, shade(SAND_DARK, -0.15));
}
function plain(c, L2) {
  c.fillStyle = vgrad(c, 720, 820, [[0, "#c26a3d"], [1, "#b05a32"]]);
  c.fillRect(-MARGIN, 720, L2.width + MARGIN * 2, 100);
  const r = rng(57);
  for (let i = 0; i < 16; i++) crater(c, r.range(-MARGIN, L2.width + MARGIN), r.range(770, 800), r.range(60, 120), r.range(14, 26));
}
function habitatBase(c, x, base, r) {
  c.fillStyle = "#d9d4c8";
  c.fillRect(x - r * 0.95, base - 58, r * 1.9, 58);
  c.fillStyle = shade("#d9d4c8", -0.18);
  c.fillRect(x + r * 0.45, base - 58, r * 0.5, 58);
  c.beginPath();
  c.arc(x, base - 58, r, Math.PI, 0);
  c.fillStyle = DOME_GLASS;
  c.fill();
  c.strokeStyle = "#8ea9b3";
  c.lineWidth = 3;
  for (const k of [0.5, 0.25]) {
    c.beginPath();
    c.ellipse(x, base - 58, r * k, r, 0, Math.PI, Math.PI * 2);
    c.stroke();
  }
  c.beginPath();
  c.arc(x, base - 58, r, Math.PI, 0);
  c.stroke();
  ellipse(c, x - r * 0.42, base - 58 - r * 0.45, r * 0.16, r * 0.08, "rgba(255,255,255,0.9)");
  c.fillStyle = "#5c6c78";
  c.fillRect(x - 18, base - 44, 36, 44);
}
function habitats(c) {
  for (const h of HAB) habitatBase(c, h.x, h.base, h.r);
  for (const px of [1700, 1800]) {
    c.fillStyle = "#7d8592";
    c.fillRect(px + 40, 690, 8, 120);
    c.save();
    c.translate(px + 44, 690);
    c.rotate(-0.25);
    c.fillStyle = "#2d3f6e";
    c.fillRect(-70, -70, 140, 60);
    c.strokeStyle = "#6f88b8";
    c.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(-70 + i * 35, -70);
      c.lineTo(-70 + i * 35, -10);
      c.stroke();
    }
    c.restore();
  }
  c.fillStyle = "#9aa3ad";
  c.fillRect(2100, 420, 6, 380);
  c.beginPath();
  c.ellipse(2103, 420, 30, 10, 0, Math.PI, Math.PI * 2);
  c.fillStyle = "#c8cdd3";
  c.fill();
  c.strokeStyle = "#5a6068";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(2103, 420);
  c.lineTo(2103, 360);
  c.stroke();
}
function habitatLights(c, L2) {
  if (L2.pal.dark < 0.4) return;
  for (const h of HAB) {
    glow(c, h.x, h.base - 90, h.r * 1.4, LIT6, 0.35);
    for (let i = -2; i <= 2; i++) {
      const wx = h.x + i * (h.r * 0.32);
      c.fillStyle = LIT6;
      c.fillRect(wx - 9, h.base - 42, 18, 16);
    }
  }
  c.fillStyle = "#ff5a4a";
  c.beginPath();
  c.arc(2103, 360, 5, 0, Math.PI * 2);
  c.fill();
  glow(c, 2103, 360, 60, "#ff5a4a", 0.5);
  glow(c, ROCKET_X + 8, 560, 80, LIT6, 0.45);
}
function rocket(c) {
  const x = ROCKET_X;
  const base = 810;
  c.strokeStyle = "#6a6f78";
  c.lineWidth = 8;
  c.beginPath();
  c.moveTo(x - 60, base - 60);
  c.lineTo(x - 110, base);
  c.moveTo(x + 60, base - 60);
  c.lineTo(x + 110, base);
  c.stroke();
  c.fillStyle = "#4b4f57";
  c.fillRect(x - 124, base - 6, 36, 10);
  c.fillRect(x + 98, base - 6, 36, 10);
  const top = base - 360;
  c.fillStyle = "#eef0f2";
  c.fillRect(x - 44, top + 70, 88, 240);
  c.fillStyle = "#d6dadf";
  c.fillRect(x + 14, top + 70, 30, 240);
  c.fillStyle = "#c63e2a";
  c.fillRect(x - 44, top + 140, 88, 22);
  poly(c, [[x - 44, top + 70], [x + 44, top + 70], [x, top]], "#f5f6f8");
  poly(c, [[x + 14, top + 70], [x + 44, top + 70], [x, top]], "#c9ced6");
  poly(c, [[x - 44, top + 240], [x - 88, base - 10], [x - 44, base - 10]], "#c63e2a");
  poly(c, [[x + 44, top + 240], [x + 88, base - 10], [x + 44, base - 10]], "#a92f1e");
  poly(c, [[x - 30, base - 40], [x + 30, base - 40], [x + 40, base], [x - 40, base]], "#3a3d43");
  ellipse(c, x, top + 100, 12, 12, "#2a3550");
  ellipse(c, x, top + 100, 7, 7, "#7fa7c8");
}
function rocketLights(c, L2) {
  if (L2.pal.dark < 0.4) return;
  ellipse(c, ROCKET_X, 460, 7, 7, "#ffd77a");
}
function sand(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, 760, BOTTOM, [[0, "#cf7140"], [0.5, SAND2], [1, SAND_DARK]]);
  c.fillRect(-MARGIN, 760, w, BOTTOM - 760);
  c.strokeStyle = "rgba(120,50,25,0.45)";
  c.lineWidth = 3;
  for (let y = 790, row3 = 0; y < BOTTOM; y += 26 + row3 * 4, row3++) {
    c.beginPath();
    for (let x = -MARGIN; x <= L2.width + MARGIN; x += 90) {
      const yy = y + Math.sin((x + row3 * 37) / 70) * 4;
      x === -MARGIN ? c.moveTo(x, yy) : c.lineTo(x, yy);
    }
    c.stroke();
  }
  const r = rng(63);
  for (let i = 0; i < 90; i++) ellipse(c, r.range(-MARGIN, L2.width + MARGIN), r.range(800, BOTTOM), 3 + r() * 6, 2 + r() * 3, r.chance(0.5) ? "#7a3a22" : "#b5623a");
  c.strokeStyle = "rgba(90,35,18,0.5)";
  c.lineWidth = 9;
  for (const y of [930, 952]) {
    c.beginPath();
    c.moveTo(-MARGIN, y + 16);
    c.lineTo(L2.width + MARGIN, y - 8);
    c.stroke();
  }
}
function foreground10(c, L2) {
  const rock2 = (x, y, w, h) => {
    poly(c, [[x - w / 2, y], [x - w * 0.42, y - h * 0.6], [x - w * 0.1, y - h], [x + w * 0.3, y - h * 0.85], [x + w / 2, y]], "#7b3a22");
    poly(c, [[x - w * 0.1, y - h], [x + w * 0.3, y - h * 0.85], [x + w / 2, y], [x + w * 0.05, y]], "#5a2a18");
    poly(c, [[x - w * 0.1, y - h], [x - w * 0.42, y - h * 0.6], [x - w * 0.2, y - h * 0.5]], "#a4532e");
  };
  rock2(60, BOTTOM + 10, 340, 230);
  rock2(L2.width - 40, BOTTOM + 10, 380, 260);
  rock2(1280, BOTTOM + 20, 220, 140);
}
var mars = {
  id: "mars",
  name: "Mars Base",
  icon: "\u{1F680}",
  blurb: "A domed habitat, a landed rocket and solar panels on the rust-red dunes, under a butterscotch Martian sky.",
  width: W6,
  sky: (tod) => SKY[tod],
  layers: () => [
    { depth: 9e3, emissive: true, band: [0, 400], draw: skyMoons },
    { depth: 8e3, emissive: true, band: [80, 260], draw: moonGlow },
    { depth: 6e3, fog: 0.2, band: [280, 740], draw: (c) => farVolcano(c) },
    { depth: 4e3, fog: 0.3, band: [520, 760], draw: mesas },
    { depth: 2500, fog: 0.1, band: [600, 820], draw: ridgeLine },
    { depth: 1500, band: [700, 820], draw: plain },
    { depth: 900, band: [520, 820], draw: habitats },
    { depth: 900, emissive: true, band: [520, 820], draw: habitatLights },
    { depth: 600, band: [340, 830], draw: (c) => rocket(c) },
    { depth: 600, emissive: true, band: [340, 830], draw: rocketLights },
    { depth: 0, band: [740, BOTTOM], draw: sand },
    { depth: -380, band: [1e3, BOTTOM], draw: foreground10 }
  ],
  marks: { left: 560, habitat: 1300, panels: 1750, antenna: 2100, rocket: ROCKET_X, right: 2420 },
  ambience: "space",
  music: "space",
  suggest: ["rover-wheel", "mars-rover", "flag-mars", "oxygen-tank", "solar-panel", "dome-habitat", "robot-butler", "satellite", "oil-drum", "alien"]
};

// src/sets/observatory.ts
var W7 = 2800;
var WALL4 = "#dccaa0";
var WAINS = "#9a7a55";
var SEPIA = "#6b4b30";
var WALNUT = "#5a3a24";
var BRASS = "#c9a04a";
var CREAM2 = "#f1e6c8";
var VELVET = "#7a3b2e";
var TRIM2 = "#e4d6b4";
var INK_HATCH = "rgba(40,28,18,0.32)";
function hatch(c, pts2, gap = 5, col = INK_HATCH, ang = 0.6) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts2) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  c.save();
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.clip();
  c.strokeStyle = col;
  c.lineWidth = 1.2;
  c.beginPath();
  const H = y1 - y0;
  for (let x = x0 - H * ang; x < x1; x += gap) {
    c.moveTo(x, y1);
    c.lineTo(x + H * ang, y0);
  }
  c.stroke();
  c.restore();
}
function hatchRect(c, x, y, w, h, gap = 5, col = INK_HATCH) {
  hatch(c, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], gap, col);
}
function rect(c, x, y, w, h, fill) {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}
function line(c, x0, y0, x1, y1, col, lw = 2) {
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}
function archPath2(c, x, y, w, h) {
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y + w / 2);
  c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  c.lineTo(x + w, y + h);
  c.closePath();
}
var WINDOWS2 = [
  { x: 1640, y: 150, w: 170, h: 410 },
  { x: 2e3, y: 150, w: 170, h: 410 }
];
var DOOR_L = { x: 190, w: 120 };
var DOOR_R = { x: 2690, w: 120 };
var BOARD = { x: 420, y: 256, w: 560, h: 208 };
var GLOBE = { x: 1420, y: 300, r: 135 };
var SCOPE = { x0: 2270, y0: 440, x1: 2740, y1: 170 };
var SHELVES = [
  { x: 1040, w: 200 },
  { x: 2200, w: 240 }
];
var GALLERY_TOP = 466;
var GALLERY_FLOOR = 530;
var GALLERY_SOFFIT = 556;
function bookshelf(c, x, y, w, h, r) {
  rect(c, x - 8, y - 8, w + 16, h + 16, "#3f2a1b");
  rect(c, x, y, w, h, WALNUT);
  const books = ["#8c3b2e", "#3f5f6e", "#c9a04a", "#5b6b4f", "#e0cfa8", "#6e4a7a", "#a0684e"];
  const rows = 4;
  const rowH = h / rows;
  for (let row3 = 0; row3 < rows; row3++) {
    const y0 = y + row3 * rowH;
    rect(c, x, y0 + rowH - 6, w, 6, "#3f2a1b");
    let bx = x + 6;
    while (bx < x + w - 14) {
      const bw = 8 + r() * 10;
      const bh = rowH * (0.62 + r() * 0.3);
      rect(c, bx, y0 + rowH - 6 - bh, bw - 1.5, bh, books[Math.floor(r() * books.length)]);
      bx += bw;
    }
  }
  hatchRect(c, x + w * 0.7, y, w * 0.3, h, 6, "rgba(20,12,6,0.25)");
}
function door(c, x, w) {
  rect(c, x - 10, 550, w + 20, 270, TRIM2);
  rect(c, x, 560, w, 250, WALNUT);
  c.strokeStyle = "#3f2a1b";
  c.lineWidth = 3;
  c.strokeRect(x + 14, 580, w - 28, 92);
  c.strokeRect(x + 14, 690, w - 28, 98);
  ellipse(c, x + w - 16, 688, 6, 6, BRASS);
  hatchRect(c, x + w * 0.6, 560, w * 0.4, 250, 6, "rgba(20,12,6,0.22)");
}
function chalkboard(c) {
  rect(c, BOARD.x - 12, BOARD.y - 12, BOARD.w + 24, BOARD.h + 24, SEPIA);
  rect(c, BOARD.x - 4, BOARD.y - 4, BOARD.w + 8, BOARD.h + 8, "#4a3220");
  rect(c, BOARD.x, BOARD.y, BOARD.w, BOARD.h, "#2f3d40");
  hatchRect(c, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 9, "rgba(255,255,255,0.05)");
  const cx = BOARD.x + BOARD.w / 2;
  const cy = BOARD.y + BOARD.h * 0.52;
  const chalk = "#e9e4cf";
  for (const [rx, ry] of [[210, 60], [150, 42], [92, 26]]) {
    c.strokeStyle = chalk;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, -0.12, 0, Math.PI * 2);
    c.stroke();
  }
  ellipse(c, cx, cy, 16, 16, "#f0c24a");
  ellipse(c, cx + 150 * Math.cos(0.6), cy + 42 * Math.sin(0.6), 6, 6, chalk);
  ellipse(c, cx - 92 * Math.cos(1.9), cy - 26 * Math.sin(1.9), 5, 5, chalk);
  c.strokeStyle = "rgba(233,228,207,0.8)";
  c.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(BOARD.x + 30, BOARD.y + 26 + i * 16);
    c.lineTo(BOARD.x + 30 + 90 + i * 37 % 60, BOARD.y + 26 + i * 16 + (i % 2 ? 3 : -2));
    c.stroke();
  }
}
function globe(c) {
  const { x, y, r } = GLOBE;
  line(c, x, y + r, x, GALLERY_TOP, "#8d7030", 8);
  c.fillStyle = BRASS;
  c.beginPath();
  c.ellipse(x, GALLERY_TOP - 4, 46, 9, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = rgrad(c, x - 45, y - 50, 10, r * 1.5, [[0, "#8fa6b8"], [1, "#2e4456"]]);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.clip();
  const land = "#b99a5b";
  ellipse(c, x - 40, y - 30, 56, 34, land, 0.3);
  ellipse(c, x + 52, y + 20, 40, 26, land, -0.4);
  ellipse(c, x - 10, y + 70, 36, 18, land, 0.1);
  ellipse(c, x + 20, y - 80, 22, 14, land, 0);
  c.restore();
  hatchRect(c, x + r * 0.2, y - r, r * 1.2, r * 2, 5, "rgba(10,20,30,0.25)");
  c.strokeStyle = BRASS;
  c.lineWidth = 6;
  c.beginPath();
  c.ellipse(x, y, r + 14, 36, 0, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.ellipse(x, y, 42, r + 14, 0, 0, Math.PI * 2);
  c.stroke();
}
function telescope(c) {
  const { x0, y0, x1, y1 } = SCOPE;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const hw = 26;
  const P4 = (t, o) => [x0 + dx * t + nx * o, y0 + dy * t + ny * o];
  rect(c, x0 - 14, y0, 28, GALLERY_TOP - y0, "#7d6030");
  ellipse(c, x0, y0, 22, 12, "#8d7030");
  poly(c, [P4(0.12, hw), P4(0.9, hw), P4(0.9, -hw), P4(0.12, -hw)], BRASS);
  poly(c, [P4(0.12, -hw * 0.25), P4(0.9, -hw * 0.25), P4(0.9, -hw), P4(0.12, -hw)], "#8d6e30");
  hatch(c, [P4(0.12, -hw * 0.25), P4(0.9, -hw * 0.25), P4(0.9, -hw), P4(0.12, -hw)], 4, "rgba(60,40,10,0.35)");
  poly(c, [P4(0, hw * 0.55), P4(0.12, hw * 0.55), P4(0.12, -hw * 0.55), P4(0, -hw * 0.55)], "#8d7030");
  poly(c, [P4(0.9, hw * 1.3), P4(0.98, hw * 1.3), P4(0.98, -hw * 1.3), P4(0.9, -hw * 1.3)], "#a88a40");
  ellipse(c, x1, y1, 12, 30, "#2d4256", Math.atan2(dy, dx));
  ellipse(c, x1, y1, 8, 20, "#7aa6c0", Math.atan2(dy, dx));
  c.strokeStyle = "#8d7030";
  c.lineWidth = 3;
  for (const t of [0.38, 0.62]) {
    const [ax, ay] = P4(t, hw);
    const [bx, by] = P4(t, -hw);
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.stroke();
  }
}
function banner2(c, x, top, w, h, motif) {
  rect(c, x - 6, top - 4, w + 12, 8, BRASS);
  rect(c, x, top, w, h, VELVET);
  hatchRect(c, x + w * 0.66, top, w * 0.34, h, 5, "rgba(30,10,8,0.3)");
  rect(c, x - 4, top + h - 6, w + 8, 6, BRASS);
  const cx = x + w / 2;
  if (motif === "saturn") {
    ellipse(c, cx, top + h * 0.3, w * 0.26, w * 0.26, "#e0cfa0");
    c.strokeStyle = BRASS;
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(cx, top + h * 0.3, w * 0.44, w * 0.11, -0.25, 0, Math.PI * 2);
    c.stroke();
    hatchRect(c, cx, top + h * 0.3 - w * 0.26, w * 0.26, w * 0.52, 4, "rgba(60,40,10,0.3)");
  } else if (motif === "jupiter") {
    ellipse(c, cx, top + h * 0.3, w * 0.3, w * 0.3, "#d9a878");
    for (let i = -1; i <= 1; i++) rect(c, cx - w * 0.3, top + h * 0.3 + i * w * 0.12 - 2, w * 0.6, 4, "#8c5a3a");
  } else {
    ellipse(c, cx, top + h * 0.3, w * 0.12, w * 0.12, CREAM2);
  }
  for (let i = 0; i < 3; i++) star4(c, x + w * (0.25 + i * 0.25), top + h * (0.62 + i % 2 * 0.12), 9, "#f0c24a");
}
function wall(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, -420, 840, [[0, "#d2bf93"], [0.55, WALL4], [1, "#c9b48a"]]);
  c.fillRect(x0, -420, w, 1260);
  for (let x = x0 + 150; x < x0 + w; x += 620) hatchRect(c, x, 150, 90, 120, 9, "rgba(90,70,40,0.12)");
  rect(c, x0, 630, w, 214, WAINS);
  c.strokeStyle = "#7e6244";
  c.lineWidth = 3;
  for (let x = x0 + 20; x < x0 + w; x += 230) c.strokeRect(x, 664, 190, 118);
  rect(c, x0, 622, w, 12, "#7e6244");
  c.save();
  c.globalCompositeOperation = "destination-out";
  for (const { x, y, w: ww, h } of WINDOWS2) {
    archPath2(c, x, y, ww, h);
    c.fill();
  }
  c.restore();
  for (const { x, y, w: ww, h } of WINDOWS2) {
    c.strokeStyle = "#8a7a6a";
    c.lineWidth = 22;
    archPath2(c, x - 6, y - 6, ww + 12, h + 6);
    c.stroke();
    c.strokeStyle = CREAM2;
    c.lineWidth = 8;
    archPath2(c, x, y, ww, h);
    c.stroke();
    rect(c, x + ww / 2 - 3, y + ww / 2, 6, h - ww / 2, CREAM2);
    rect(c, x + 6, y + h * 0.5, ww - 12, 6, CREAM2);
    rect(c, x - 26, y + h, ww + 52, 20, "#8a7a6a");
  }
  for (const s of SHELVES) bookshelf(c, s.x, 560, s.w, 250, rng(Math.floor(s.x)));
  door(c, DOOR_L.x, DOOR_L.w);
  door(c, DOOR_R.x, DOOR_R.w);
  chalkboard(c);
  globe(c);
  telescope(c);
}
function outside(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, 100, 600, [[0, "#a9c3d4"], [1, "#e4e0c8"]]);
  c.fillRect(x0, 100, w, 500);
  c.fillStyle = "#8fa083";
  c.beginPath();
  c.moveTo(x0, 470);
  for (let x = x0; x <= x0 + w; x += 40) c.lineTo(x, 430 - Math.sin(x / 260) * 26 - Math.sin(x / 90) * 8);
  c.lineTo(x0 + w, 600);
  c.lineTo(x0, 600);
  c.fill();
  dome(c, 1725, 470, 110, "#6b7f8e", "#d9b25f");
  dome(c, 2085, 470, 70, "#7d8fa0", "#d9b25f");
  rect(c, 1600, 456, 250, 40, "#55697a");
}
function gallery(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  rect(c, x0, GALLERY_TOP, w, 10, "#7d6a52");
  for (let x = x0; x < x0 + w; x += 26) {
    rect(c, x, GALLERY_TOP + 10, 9, GALLERY_FLOOR - GALLERY_TOP - 10, "#8f7c5e");
  }
  rect(c, x0, GALLERY_FLOOR, w, GALLERY_SOFFIT - GALLERY_FLOOR, "#9b8a6c");
  rect(c, x0, GALLERY_SOFFIT, w, 22, "#4f4234");
  hatchRect(c, x0, GALLERY_SOFFIT, w, 22, 5, "rgba(10,6,2,0.4)");
}
function ceiling3(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, -420, 130, [[0, "#46566b"], [1, "#8d9db0"]]);
  c.fillRect(x0, -420, w, 550);
  hatchRect(c, x0, -420, w, 300, 7, "rgba(20,28,40,0.2)");
  c.strokeStyle = "rgba(30,36,50,0.75)";
  c.lineWidth = 5;
  for (const cx of [350, 1100, 1800, 2500]) {
    c.beginPath();
    c.arc(cx, 130, 420, Math.PI, 0);
    c.stroke();
  }
  const r = rng(11);
  for (let i = 0; i < 140; i++) {
    ellipse(c, x0 + r() * w, -400 + r() * 480, 1.2 + r() * 1.6, 1.2 + r() * 1.6, "rgba(241,230,200,0.75)");
  }
  rect(c, x0, 96, w, 16, "#c9ad72");
  for (let x = x0; x < x0 + w; x += 26) rect(c, x, 112, 12, 10, "#c9ad72");
  rect(c, x0, 124, w, 6, "#8c7448");
}
function banners(c) {
  banner2(c, 1030, 110, 80, 210, "saturn");
  banner2(c, 1880, 110, 80, 200, "jupiter");
  banner2(c, 2480, 110, 70, 170, "stars");
}
function dais(c) {
  poly(c, [[1170, 732], [1830, 732], [1862, 784], [1138, 784]], "#c8b08a");
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    line(c, 1170 + 660 * t - 16 * t, 732, 1170 + 660 * t - 32 * t + 16 * (1 - t) * 0, 784, "#9d8256", 1.6);
  }
  rect(c, 1138, 784, 724, 36, VELVET);
  hatchRect(c, 1138, 784, 724, 36, 6, "rgba(30,10,8,0.35)");
  rect(c, 1138, 784, 724, 5, BRASS);
}
function floor4(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, 820, BOTTOM, [[0, "#b48d5f"], [1, "#8a6844"]]);
  c.fillRect(x0, 820, w, BOTTOM - 820);
  rect(c, x0, 820, w, 8, "#5d4530");
  c.strokeStyle = "rgba(70,46,26,0.5)";
  c.lineWidth = 2;
  for (let y = 836, row3 = 0; y < BOTTOM; y += 22 + row3 * 4, row3++) {
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x0 + w, y);
    c.stroke();
    for (let x = x0 + row3 % 2 * 120; x < x0 + w; x += 240) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 22 + row3 * 4);
      c.stroke();
    }
  }
}
function rail2(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  rect(c, x0, 1e3, w, 14, BRASS);
  rect(c, x0, 1014, w, 6, "#8d7030");
  for (let x = x0 + 40; x < x0 + w; x += 240) rect(c, x, 1020, 12, 60, "#8d7030");
}
var observatory = {
  id: "observatory",
  name: "Astronomers' Club",
  icon: "\u{1F52D}",
  blurb: "A lecture hall of the astronomy society: a chalkboard of orbits, a great globe, a brass telescope and a dais.",
  width: W7,
  interior: true,
  times: ["day"],
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 3e3, fog: 0.2, band: [100, 600], draw: outside },
    { depth: 600, band: [-420, 840], draw: wall },
    { depth: 450, band: [440, 600], draw: gallery },
    { depth: 350, band: [96, 330], draw: (c) => banners(c) },
    { depth: 300, band: [-420, 130], draw: ceiling3 },
    { depth: 300, band: [720, 830], draw: (c) => dais(c) },
    { depth: 0, band: [820, BOTTOM], draw: floor4 },
    { depth: -380, band: [1e3, BOTTOM], draw: rail2 }
  ],
  marks: { dais: 1500, blackboard: 700, "door-left": 250, "bench-left": 1050, "bench-right": 1950, "door-right": 2750 },
  ambience: "city-old",
  music: "nostalgia",
  suggest: ["bench", "bookshelf", "chandelier", "books-stack", "table-lamp", "armchair", "grandfather-clock", "wall-clock", "telephone-rotary", "painting"]
};

// src/sets/foundry.ts
var W8 = 3e3;
var BRICK2 = "#a8604a";
var BRICK_DARK = "#7c4636";
var SLATE = "#5b6470";
var IRON = "#4e5560";
var WOOD = "#8a6a48";
function hatch2(c, pts2, gap = 5, col = "rgba(30,22,18,0.32)", ang = 0.6) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts2) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  c.save();
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.clip();
  c.strokeStyle = col;
  c.lineWidth = 1.2;
  c.beginPath();
  const H = y1 - y0;
  for (let x = x0 - H * ang; x < x1; x += gap) {
    c.moveTo(x, y1);
    c.lineTo(x + H * ang, y0);
  }
  c.stroke();
  c.restore();
}
function hatchRect2(c, x, y, w, h, gap = 5, col) {
  hatch2(c, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], gap, col);
}
function ellipse2(c, x, y, r, fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
function rect2(c, x, y, w, h, fill) {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}
function line2(c, x0, y0, x1, y1, col, lw = 2) {
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}
function stack(c, x, top, base, w, r, smoke2, smokeShade) {
  const left = x - w / 2;
  rect2(c, left, top, w, base - top, BRICK2);
  bricks(c, left, top + 14, w, base - top - 14, BRICK2, 18, 9);
  rect2(c, left + w * 0.7, top, w * 0.3, base - top, BRICK_DARK);
  hatchRect2(c, left + w * 0.6, top, w * 0.4, base - top, 4, "rgba(30,14,8,0.3)");
  rect2(c, left - 8, top - 14, w + 16, 16, "#6e4032");
  rect2(c, left - 4, top - 4, w + 8, 6, "#5a3226");
  let sx = x;
  let sy = top - 14;
  for (let i = 0; i < 7; i++) {
    const rr4 = 50 + i * 18 + r() * 20;
    cloud(c, sx + i * 26, sy - i * 62, rr4 * 2.6, smoke2, smokeShade, Math.floor(r() * 90) + 1);
    sx += (r() - 0.2) * 22;
  }
}
function distance(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, 380, 760, [[0, "#8e8a92"], [1, "#6e6a70"]]);
  c.beginPath();
  c.moveTo(x0, 760);
  for (let x = x0; x <= x0 + w; x += 40) c.lineTo(x, 560 - Math.sin(x / 210) * 24 - Math.sin(x / 80) * 8);
  c.lineTo(x0 + w, 780);
  c.lineTo(x0, 780);
  c.fill();
  const r = rng(31);
  for (let i = 0; i < 16; i++) {
    const x = x0 + r() * w;
    const h = 120 + r() * 120;
    rect2(c, x, 560 - h, 22 + r() * 20, h + 40, "#77737b");
  }
  c.globalAlpha = 0.5;
  for (let i = 0; i < 9; i++) cloud(c, -200 + i * 420 + r() * 120, 230 + r() * 120, 620 + r() * 300, "#a39b98", "#8a817e", 40 + i);
  c.globalAlpha = 1;
}
function works(c, L2) {
  const r = rng(12);
  const smoke2 = L2.tod === "night" ? "#6d6670" : "#8f8783";
  const smokeShade = L2.tod === "night" ? "#4d4750" : "#6d6460";
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 300) {
    const sw = 300;
    poly(c, [[x, 760], [x, 560], [x + sw * 0.5, 470], [x + sw * 0.5, 560], [x + sw, 470], [x + sw, 760]], SLATE);
    hatchRect2(c, x + sw * 0.5, 470, sw * 0.5, 290, 6, "rgba(15,20,30,0.3)");
  }
  rect2(c, -MARGIN, 700, L2.width + MARGIN * 2, 80, "#4f4a52");
  stack(c, 260, 130, 720, 110, r, smoke2, smokeShade);
  stack(c, 1250, 90, 720, 130, r, smoke2, smokeShade);
  stack(c, 2480, 150, 720, 100, r, smoke2, smokeShade);
  stack(c, 2880, 60, 720, 120, r, smoke2, smokeShade);
}
function sheds(c) {
  for (let x = -MARGIN; x < W8 + MARGIN; x += 260) {
    const w = 260;
    rect2(c, x, 420, w, 460, BRICK_DARK);
    hatchRect2(c, x + w * 0.6, 420, w * 0.4, 460, 6, "rgba(20,8,4,0.3)");
    for (let i = 0; i < 2; i++) {
      const wx = x + 40 + i * 110;
      rect2(c, wx - 4, 470 - 4, 78, 96 + 8, "#5b4a44");
      rect2(c, wx, 470, 70, 96, "#8fb0bc");
      line2(c, wx + 35, 470, wx + 35, 566, "#5b4a44", 4);
    }
  }
}
function ironwork(c, L2) {
  rect2(c, -MARGIN, 290, L2.width + MARGIN * 2, 14, IRON);
  rect2(c, -MARGIN, 304, L2.width + MARGIN * 2, 4, "#2e333b");
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 180) rect2(c, x, 304, 6, 150, IRON);
  rect2(c, 1220, 300, 60, 24, "#3a3f48");
  for (let y = 324; y < 470; y += 12) {
    c.strokeStyle = IRON;
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(1250, y, 4, 7, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.strokeStyle = "#2e333b";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(1250, 484, 14, 0.4, Math.PI * 1.9);
  c.stroke();
  for (const x of [2050, 2110]) {
    for (let y = 304; y < 540; y += 12) {
      c.strokeStyle = IRON;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(x, y, 4, 7, 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
}
function scaffold(c) {
  const x0 = 1560;
  const x1 = 1860;
  const top = 380;
  const base = 800;
  for (let x = x0; x <= x1; x += 40) rect2(c, x - 3, top, 6, base - top, IRON);
  for (let y = top + 80; y < base; y += 110) rect2(c, x0, y - 3, x1 - x0, 6, IRON);
  c.strokeStyle = IRON;
  c.lineWidth = 4;
  for (let x = x0; x < x1; x += 80) {
    c.beginPath();
    c.moveTo(x, base);
    c.lineTo(x + 40, top + 80);
    c.lineTo(x + 80, base);
    c.stroke();
  }
  for (const y of [top + 80, top + 190]) {
    rect2(c, x0 - 14, y - 12, x1 - x0 + 28, 12, WOOD);
    hatchRect2(c, x0 - 14, y - 12, x1 - x0 + 28, 12, 5, "rgba(40,24,10,0.35)");
  }
  rect2(c, x0 - 20, top + 40, 4, base - top - 40, "#3a3f48");
  rect2(c, x0 - 4, top + 40, 4, base - top - 40, "#3a3f48");
}
function furnace(c) {
  const x0 = 500;
  const x1 = 800;
  const base = 820;
  rect2(c, x0, 520, x1 - x0, base - 520, BRICK2);
  bricks(c, x0, 530, x1 - x0, base - 530, BRICK2, 30, 15);
  rect2(c, x0 + (x1 - x0) * 0.7, 520, (x1 - x0) * 0.3, base - 520, BRICK_DARK);
  hatchRect2(c, x0 + (x1 - x0) * 0.6, 520, (x1 - x0) * 0.4, base - 520, 5, "rgba(30,12,6,0.32)");
  rect2(c, x0 - 8, 580, x1 - x0 + 16, 10, "#2e333b");
  rect2(c, x0 - 8, 720, x1 - x0 + 16, 10, "#2e333b");
  rect2(c, 610, 430, 80, 100, BRICK_DARK);
  rect2(c, 598, 420, 104, 14, "#5a3226");
  c.beginPath();
  c.moveTo(570, base);
  c.lineTo(570, 730);
  c.arc(650, 730, 80, Math.PI, 0);
  c.lineTo(730, base);
  c.closePath();
  c.fillStyle = "#1c1210";
  c.fill();
  c.strokeStyle = "#2e333b";
  c.lineWidth = 8;
  c.stroke();
  c.fillStyle = "#3a3f48";
  c.beginPath();
  c.ellipse(460, 812, 36, 14, 0, 0, Math.PI * 2);
  c.fill();
  rect2(c, 420, 790, 80, 8, "#2e333b");
}
function furnaceGlow(c, L2) {
  if (L2.pal.dark < 0.4) return;
  const glowR = 260;
  const g = c.createRadialGradient(650, 760, 10, 650, 760, glowR);
  g.addColorStop(0, "rgba(255,170,80,0.7)");
  g.addColorStop(0.35, "rgba(255,120,50,0.25)");
  g.addColorStop(1, "rgba(255,100,40,0)");
  c.fillStyle = g;
  c.fillRect(650 - glowR, 760 - glowR, glowR * 2, glowR * 2);
  c.fillStyle = "#ff9a3a";
  c.beginPath();
  c.moveTo(580, 820);
  c.lineTo(580, 740);
  c.arc(650, 740, 70, Math.PI, 0);
  c.lineTo(720, 820);
  c.closePath();
  c.fill();
  c.fillStyle = "#ffd25a";
  c.beginPath();
  c.ellipse(650, 790, 44, 26, 0, 0, Math.PI * 2);
  c.fill();
}
function workshop(c) {
  rect2(c, 1e3, 420, 330, 120, WOOD);
  hatchRect2(c, 1e3, 420, 330, 120, 7, "rgba(40,24,10,0.3)");
  for (let x = 1016; x < 1320; x += 34) for (let y = 436; y < 530; y += 34) ellipse2(c, x, y, 3, "#2a1d12");
  const hammer = (x, y, a) => {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    rect2(c, -4, 0, 8, 70, "#8a5a30");
    rect2(c, -20, -12, 40, 14, "#3a3f48");
    c.restore();
  };
  hammer(1040, 452, 0.1);
  hammer(1100, 448, -0.05);
  c.save();
  c.translate(1180, 470);
  c.rotate(0.2);
  rect2(c, -4, -2, 8, 56, "#3a3f48");
  c.strokeStyle = "#3a3f48";
  c.lineWidth = 9;
  c.beginPath();
  c.arc(0, -4, 12, 0.8, Math.PI * 2 - 0.8);
  c.stroke();
  c.restore();
  c.save();
  c.translate(1270, 440);
  c.rotate(-0.12);
  rect2(c, -3, 0, 6, 26, "#6e4a2a");
  rect2(c, -40, 26, 80, 30, "#5a5f69");
  c.fillStyle = "#4a4f58";
  for (let i = 0; i < 9; i++) poly(c, [[-40 + i * 9, 56], [-35 + i * 9, 66], [-30 + i * 9, 56]], "#4a4f58");
  c.restore();
  const cx = 1880;
  const cy = 360;
  c.fillStyle = "#4e5560";
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    rect2(c, -18, -150, 36, 40, "#4e5560");
    c.restore();
  }
  c.beginPath();
  c.arc(cx, cy, 128, 0, Math.PI * 2);
  c.fillStyle = "#4e5560";
  c.fill();
  c.beginPath();
  c.arc(cx, cy, 110, 0, Math.PI * 2);
  c.fillStyle = "#5f6774";
  c.fill();
  hatchRect2(c, cx, cy - 120, 120, 240, 6, "rgba(10,14,18,0.3)");
  c.beginPath();
  c.arc(cx, cy, 26, 0, Math.PI * 2);
  c.fillStyle = "#2e333b";
  c.fill();
  for (const wx of [1600, 2200]) {
    rect2(c, wx - 6, 236 - 6, 92, 70 + 12, "#4a4450");
    rect2(c, wx, 236, 80, 70, "#8fb0bc");
    line2(c, wx + 40, 236, wx + 40, 306, "#4a4450", 4);
    line2(c, wx, 271, wx + 80, 271, "#4a4450", 4);
  }
  const dx = 2340;
  rect2(c, dx - 12, 548, 144, 274, "#3a3f48");
  rect2(c, dx, 560, 120, 250, "#55606d");
  for (let y = 572; y < 810; y += 14) line2(c, dx, y, dx + 120, y, "#444c57", 2);
  hatchRect2(c, dx + 70, 560, 50, 250, 5, "rgba(10,14,18,0.3)");
  rect2(c, dx + 100, 680, 8, 40, "#2e333b");
}
function yard2(c) {
  const x0 = -MARGIN;
  const w = W8 + MARGIN * 2;
  c.fillStyle = vgrad(c, 800, BOTTOM, [[0, "#7c7268"], [1, "#554d46"]]);
  c.fillRect(x0, 800, w, BOTTOM - 800);
  const r = rng(90);
  for (let i = 0; i < 260; i++) {
    const y = 830 + r() * (BOTTOM - 830);
    const x = x0 + r() * w;
    c.fillStyle = `rgba(${40 + r() * 30},${36 + r() * 24},${32 + r() * 20},0.55)`;
    c.beginPath();
    c.ellipse(x, y, 10 + r() * 12, 4 + r() * 4, 0, 0, Math.PI * 2);
    c.fill();
  }
  for (const y of [960, 1010]) {
    rect2(c, x0, y, w, 5, "#8a8f98");
    for (let x = x0; x < x0 + w; x += 60) rect2(c, x, y - 3, 14, 15, "#6b4a2e");
  }
}
function foreground11(c) {
  for (const x of [40, 2820]) {
    rect2(c, x, 1040, 150, 40, "#3e4048");
    rect2(c, x + 16, 1024, 118, 20, "#4a4d56");
    rect2(c, x + 36, 1008, 80, 18, "#58595f");
    hatchRect2(c, x, 1040, 150, 40, 6, "rgba(10,10,14,0.3)");
  }
}
function lights3(c, L2) {
  if (L2.pal.dark < 0.4) return;
  for (let x = -MARGIN + 40; x < L2.width + MARGIN; x += 260) {
    for (let i = 0; i < 2; i++) rect2(c, x + 40 + i * 110, 470, 70, 96, "#ffd77a");
  }
}
var foundry = {
  id: "foundry",
  name: "Foundry & Workshop",
  icon: "\u{1F3ED}",
  blurb: "A 1900s iron foundry yard: brick smokestacks, a glowing smelting furnace, a scaffold, rails and a hoist.",
  width: W8,
  times: ["day", "dusk", "night"],
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 6e3, fog: 0.35, band: [60, 800], draw: distance },
    { depth: 1500, band: [-420, 820], draw: works },
    { depth: 900, band: [400, 830], draw: sheds },
    { depth: 900, band: [460, 580], draw: lights3, emissive: true },
    { depth: 600, band: [-420, 840], draw: (c) => workshop(c) },
    { depth: 300, band: [280, 520], draw: ironwork },
    { depth: 260, band: [360, 820], draw: scaffold },
    { depth: 250, band: [410, 830], draw: (c) => furnace(c) },
    { depth: 250, band: [520, 830], draw: furnaceGlow, emissive: true },
    { depth: 0, band: [800, BOTTOM], draw: (c) => yard2(c) },
    { depth: -380, band: [1e3, BOTTOM], draw: (c) => foreground11(c) }
  ],
  marks: { furnace: 650, scaffold: 1700, centre: 1400, door: 2400 },
  ambience: "city-old",
  music: "tension",
  suggest: ["crate", "barrel", "ladder", "stove", "fire-hydrant", "trash-can", "bucket", "floor-lamp", "sack", "street-lamp"]
};

// src/sets/rooftops.ts
var W9 = 3e3;
var SLATE2 = "#5e6672";
var SLATE_DARK = "#444b57";
var STONE = "#b3aa98";
var STONE_DARK = "#7d7568";
var WALLS3 = ["#c9a77a", "#9aa58a", "#c9a0a0", "#a8a6a0", "#b48a64", "#8f9aa8"];
var FLAG = ["#a4483a", "#e3d7b8", "#4f6b58"];
function hatch3(c, pts2, gap = 5, col = "rgba(20,18,24,0.3)", ang = 0.6) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts2) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  c.save();
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.clip();
  c.strokeStyle = col;
  c.lineWidth = 1.2;
  c.beginPath();
  const H = y1 - y0;
  for (let x = x0 - H * ang; x < x1; x += gap) {
    c.moveTo(x, y1);
    c.lineTo(x + H * ang, y0);
  }
  c.stroke();
  c.restore();
}
function rect3(c, x, y, w, h, fill) {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}
function pot(c, x, base, h, col) {
  rect3(c, x - 14, base - h, 28, h, col);
  hatch3(c, [[x, base - h], [x + 14, base - h], [x + 14, base], [x, base]], 4);
  rect3(c, x - 19, base - h - 8, 38, 10, shade2(col, -0.12));
}
function shade2(hex, t) {
  const v = parseInt(hex.replace("#", ""), 16);
  const ch = (k) => {
    const n = v >> k & 255;
    const m = t < 0 ? n * (1 + t) : n + (255 - n) * t;
    return Math.round(Math.max(0, Math.min(255, m)));
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function flag(c, x, base, top, cloth) {
  rect3(c, x - 2, top, 4, base - top, "#3c3a40");
  const w = 60;
  const h = 34;
  for (let i = 0; i < 3; i++) {
    c.fillStyle = cloth[i];
    c.beginPath();
    c.moveTo(x + 2, top + i * (h / 3));
    c.quadraticCurveTo(x + w * 0.5, top + i * (h / 3) - 6, x + w, top + i * (h / 3) + 2);
    c.lineTo(x + w, top + (i + 1) * (h / 3) + 2);
    c.quadraticCurveTo(x + w * 0.5, top + (i + 1) * (h / 3) - 4, x + 2, top + (i + 1) * (h / 3));
    c.closePath();
    c.fill();
  }
}
function heavens(c, L2) {
  if (L2.pal.dark < 0.4) return;
  const r = rng(5);
  for (let i = 0; i < 110; i++) ellipse(c, r() * W9, r() * 360, 1 + r() * 1.5, 1 + r() * 1.5, "#fff8e6");
  ellipse(c, 2620, 150, 62, 62, "rgba(244,240,208,0.25)");
  ellipse(c, 2620, 150, 44, 44, "#f4f0d0");
}
function church2(c) {
  const col = "#8f9aa8";
  rect3(c, 1960, 470, 380, 330, col);
  c.beginPath();
  c.ellipse(2150, 470, 150, 150, 0, Math.PI, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  c.beginPath();
  c.ellipse(2150, 470, 150, 150, 0, Math.PI * 1.5, Math.PI * 2);
  c.lineTo(2150, 470);
  c.fillStyle = "#7a8594";
  c.fill();
  rect3(c, 2146, 300, 8, 34, col);
  for (const tx of [1860, 2440]) {
    rect3(c, tx - 40, 360, 80, 440, col);
    poly(c, [[tx - 44, 362], [tx + 44, 362], [tx, 230]], "#7a8594");
    rect3(c, tx - 8, 330, 16, 20, "#e3d7b8");
  }
}
function farRoofs(c) {
  const r = rng(22);
  c.fillStyle = "#7d7f92";
  for (let x = -MARGIN; x < W9 + MARGIN; x += 150) {
    const h = 60 + r() * 60;
    poly(c, [[x, 800], [x, 560 - h], [x + 75, 500 - h], [x + 150, 560 - h], [x + 150, 800]], "#7d7f92");
    hatch3(c, [[x + 75, 500 - h], [x + 150, 560 - h], [x + 150, 800], [x + 75, 800]], 6, "rgba(20,20,30,0.2)");
  }
}
function houses2(c) {
  const r = rng(40);
  let x = -MARGIN;
  let i = 0;
  while (x < W9 + MARGIN) {
    const w = 180 + r() * 150;
    const top = 330 + r() * 110;
    const col = WALLS3[i % WALLS3.length];
    rect3(c, x, top + 70, w, 800 - top - 70, col);
    hatch3(c, [[x + w * 0.62, top + 70], [x + w, top + 70], [x + w, 830], [x + w * 0.62, 830]], 6, "rgba(30,24,20,0.2)");
    poly(c, [[x - 10, top + 74], [x + 24, top], [x + w - 24, top], [x + w + 10, top + 74]], SLATE2);
    hatch3(c, [[x + w * 0.55, top], [x + w - 24, top], [x + w + 10, top + 74], [x + w * 0.55, top + 74]], 5, "rgba(10,14,20,0.35)");
    rect3(c, x - 10, top + 70, w + 20, 8, shade2(col, -0.2));
    for (let k = 0; k < 2; k++) rect3(c, x + 26 + k * (w - 80), top - 36, 22, 40, "#8a5a48");
    for (let d = 0; d < 2; d++) {
      const dx = x + 40 + d * (w * 0.45);
      poly(c, [[dx - 4, top + 56], [dx + 22, top + 22], [dx + 48, top + 56]], SLATE_DARK);
      rect3(c, dx, top + 56, 44, 26, "#3c3f4c");
    }
    for (let row3 = 0; row3 < 2; row3++) {
      for (let k = 0; k < 2; k++) {
        const wx = x + 24 + k * (w * 0.42);
        rect3(c, wx - 3, top + 130 + row3 * 110 - 3, 38, 58, "#3e3a44");
        rect3(c, wx, top + 130 + row3 * 110, 32, 52, "#5a6a78");
      }
    }
    x += w + 6;
    i++;
  }
}
function lit(c, L2) {
  if (L2.pal.dark < 0.4) return;
  const r = rng(40);
  let x = -MARGIN;
  let i = 0;
  while (x < W9 + MARGIN) {
    const w = 180 + r() * 150;
    const top = 330 + r() * 110;
    for (let row3 = 0; row3 < 2; row3++) {
      for (let k = 0; k < 2; k++) {
        const wx = x + 24 + k * (w * 0.42);
        if ((i + row3 * 2 + k) % 3 !== 0) rect3(c, wx, top + 130 + row3 * 110, 32, 52, "#ffd77a");
      }
    }
    x += w + 6;
    i++;
  }
  for (const tx of [1860, 2440]) rect3(c, tx - 10, 520, 20, 40, "#ffd77a");
  rect3(c, 2140, 540, 20, 44, "#ffd77a");
}
function crowd(c) {
  const r = rng(60);
  rect3(c, 0, 770, 1200, 34, "#8a8072");
  for (let x = 0; x < 1200; x += 40) rect3(c, x, 752, 22, 20, "#8a8072");
  hatch3(c, [[0, 770], [1200, 770], [1200, 804], [0, 804]], 6, "rgba(20,16,12,0.25)");
  for (let i = 0; i < 46; i++) {
    const x = 20 + r() * 1170;
    const base = 790 - r() * 8;
    const h = 130 + r() * 50;
    const col = ["#2f2c3a", "#3c3848", "#4a4458"][Math.floor(r() * 3)];
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x - 14, base);
    c.lineTo(x - 16, base - h * 0.5);
    c.quadraticCurveTo(x, base - h * 0.62, x + 16, base - h * 0.5);
    c.lineTo(x + 14, base);
    c.closePath();
    c.fill();
    ellipse(c, x, base - h * 0.7, 10, 11, col);
    if (r() < 0.25) {
      rect3(c, x - 13, base - h * 0.78, 26, 4, col);
      rect3(c, x - 9, base - h * 0.86, 18, 8, col);
    }
    if (r() < 0.2) {
      c.strokeStyle = col;
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(x + 14, base - h * 0.45);
      c.lineTo(x + 26, base - h * 1.05);
      c.stroke();
    }
  }
}
function flags(c) {
  flag(c, 420, 420, 160, FLAG);
  flag(c, 1560, 380, 110, [FLAG[2], FLAG[1], FLAG[0]]);
  flag(c, 2300, 360, 190, FLAG);
  flag(c, 2850, 400, 130, [FLAG[1], FLAG[0], FLAG[2]]);
}
function roof(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, 806, BOTTOM, [[0, "#6a7280"], [1, "#4f5561"]]);
  c.fillRect(x0, 806, w, BOTTOM - 806);
  rect3(c, x0, 790, w, 16, STONE);
  rect3(c, x0, 804, w, 4, STONE_DARK);
  c.strokeStyle = "rgba(30,34,42,0.45)";
  c.lineWidth = 2;
  for (let y = 820, row3 = 0; y < BOTTOM; y += 20 + row3 * 6, row3++) {
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x0 + w, y);
    c.stroke();
    for (let x = x0 + row3 % 3 * 150; x < x0 + w; x += 420 + row3 * 40) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 20 + row3 * 6);
      c.stroke();
    }
    hatch3(c, [[x0, y], [x0 + w, y], [x0 + w, y + 14], [x0, y + 14]], 9, "rgba(255,255,255,0.05)");
  }
  pot(c, 120, 810, 90, "#8a5a48");
  pot(c, 210, 810, 70, "#a4644e");
  rect3(c, 300, 760, 110, 50, "#3c4450");
  rect3(c, 300, 758, 110, 6, STONE);
  pot(c, 470, 812, 110, "#8a5a48");
  pot(c, 540, 812, 80, "#a4644e");
  pot(c, 700, 812, 60, "#8a5a48");
}
function foreground12(c) {
  rect3(c, 30, 960, 190, 140, "#6e4a40");
  hatch3(c, [[120, 960], [220, 960], [220, 1100], [120, 1100]], 6, "rgba(20,10,8,0.3)");
  rect3(c, 16, 940, 218, 26, "#8a5a48");
  rect3(c, 16, 930, 218, 12, "#a4644e");
}
var rooftops = {
  id: "rooftops",
  name: "Launch Rooftops",
  icon: "\u{1F3D9}\uFE0F",
  blurb: "The slate roofs of an old European city at dusk, a church dome in the haze, and a flat roof for the great cannon.",
  width: W9,
  times: ["dusk", "night", "day"],
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 9e3, band: [0, 400], draw: heavens, emissive: true },
    { depth: 6e3, fog: 0.3, band: [220, 800], draw: (c) => church2(c) },
    { depth: 2500, fog: 0.2, band: [480, 820], draw: (c) => farRoofs(c) },
    { depth: 1200, band: [240, 840], draw: (c) => houses2(c) },
    { depth: 1200, band: [330, 700], draw: lit, emissive: true },
    { depth: 1100, band: [100, 480], draw: (c) => flags(c) },
    { depth: 900, band: [560, 810], draw: (c) => crowd(c) },
    { depth: 0, band: [780, BOTTOM], draw: roof },
    { depth: -380, band: [920, BOTTOM], draw: (c) => foreground12(c) }
  ],
  marks: { crowd: 400, ramp: 1300, cannon: 2e3, centre: 1400 },
  ambience: "city-old",
  music: "epic",
  suggest: ["barrel", "crate", "bucket", "street-lamp", "radio-old", "satellite-dish", "plant-pot", "umbrella", "ladder", "sack"]
};

// src/sets/harbor.ts
var W10 = 3e3;
var SLATE3 = "#5c6470";
var CREAM3 = "#efe4c8";
var BLIND = "#4f7a62";
var IRON2 = "#2e3238";
var WALLS4 = ["#d8b77e", "#e8d9b8", "#a9b59a", "#d89a7a", "#c9c0a8", "#b8c4c4"];
var BUNTING = ["#b8483a", "#efe4c8", "#4f7a62", "#d9a84a"];
function hatch4(c, pts2, gap = 5, col = "rgba(30,24,18,0.28)", ang = 0.6) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts2) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  c.save();
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.clip();
  c.strokeStyle = col;
  c.lineWidth = 1.2;
  c.beginPath();
  const H = y1 - y0;
  for (let x = x0 - H * ang; x < x1; x += gap) {
    c.moveTo(x, y1);
    c.lineTo(x + H * ang, y0);
  }
  c.stroke();
  c.restore();
}
function rect4(c, x, y, w, h, fill) {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}
function line3(c, x0, y0, x1, y1, col, lw = 2) {
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}
function townhouses() {
  const r = rng(7);
  const out = [];
  for (const [from, to] of [[-MARGIN, 1150], [1550, W10 + MARGIN]]) {
    let x = from;
    let i = 0;
    while (x < to) {
      const w = Math.min(to - x, 170 + r() * 70);
      out.push({ x, w, top: 300 + r() * 110, col: WALLS4[(out.length + i) % WALLS4.length], balcony: (out.length + i) % 2 === 0 });
      x += w;
      i++;
    }
  }
  return out;
}
function harbourSea(c) {
  const r = rng(3);
  c.fillStyle = "#c7d8d8";
  c.fillRect(-MARGIN, 380, W10 + MARGIN * 2, 250);
  sea(c, -MARGIN, 620, W10 + MARGIN * 2, 180, "#8fb3c4", "#5e8aa0", "#e8f0f0", r);
  c.fillStyle = "#8a9a86";
  c.beginPath();
  c.moveTo(-MARGIN, 620);
  for (let x = -MARGIN; x <= W10 + MARGIN; x += 40) c.lineTo(x, 600 - Math.sin(x / 300) * 18 - Math.sin(x / 90) * 6);
  c.lineTo(W10 + MARGIN, 630);
  c.lineTo(-MARGIN, 630);
  c.fill();
}
function sailingShip(c, cx, hullY, scale) {
  const hw = 170 * scale;
  poly(c, [[cx - hw, hullY], [cx + hw, hullY], [cx + hw * 0.8, hullY + 40 * scale], [cx - hw * 0.8, hullY + 40 * scale]], "#3c3a48");
  rect4(c, cx - hw * 0.9, hullY + 10 * scale, hw * 1.8, 8 * scale, "#b8483a");
  for (const mx of [-0.5, 0, 0.5]) {
    const x = cx + mx * hw;
    const top = hullY - 300 * scale;
    rect4(c, x - 3 * scale, top, 6 * scale, hullY - top, "#4a4a52");
    for (const [y, span] of [[top + 40 * scale, 0.42], [top + 130 * scale, 0.36]]) {
      line3(c, x - span * hw, y, x + span * hw, y, "#4a4a52", 4 * scale);
      poly(c, [[x - span * hw * 0.92, y + 2], [x + span * hw * 0.92, y + 2], [x + span * hw * 0.75, y + 90 * scale], [x - span * hw * 0.75, y + 90 * scale]], CREAM3);
      hatch4(c, [[x + span * hw * 0.1, y + 2], [x + span * hw * 0.92, y + 2], [x + span * hw * 0.75, y + 90 * scale], [x + span * hw * 0.2, y + 90 * scale]], 5, "rgba(60,50,40,0.25)");
    }
  }
}
function steamer(c, x, hullY) {
  poly(c, [[x - 150, hullY], [x + 150, hullY], [x + 120, hullY + 40], [x - 120, hullY + 40]], "#2b2d34");
  rect4(c, x - 150, hullY + 8, 300, 8, "#b8483a");
  rect4(c, x - 90, hullY - 40, 180, 40, CREAM3);
  rect4(c, x - 34, hullY - 170, 68, 130, "#2b2d34");
  rect4(c, x - 34, hullY - 130, 68, 14, CREAM3);
  rect4(c, x - 38, hullY - 176, 76, 10, "#b8483a");
  line3(c, x - 80, hullY - 40, x - 34, hullY - 170, "#4a4a52", 3);
}
function ships(c) {
  sailingShip(c, 1350, 650, 1);
  steamer(c, 1930, 650);
  sailingShip(c, 2680, 660, 0.6);
}
function fronts(c) {
  for (const h of townhouses()) {
    const { x, w, top, col } = h;
    rect4(c, x, top + 40, w, 820 - top - 40, col);
    hatch4(c, [[x + w * 0.66, top + 40], [x + w, top + 40], [x + w, 830], [x + w * 0.66, 830]], 6);
    poly(c, [[x - 6, top + 44], [x + 18, top], [x + w - 18, top], [x + w + 6, top + 44]], SLATE3);
    hatch4(c, [[x + w * 0.6, top], [x + w - 18, top], [x + w + 6, top + 44], [x + w * 0.6, top + 44]], 5, "rgba(10,14,20,0.3)");
    rect4(c, x - 6, top + 40, w + 12, 8, "#f2ead8");
    rect4(c, x + w * 0.4, top + 10, 30, 26, "#3c4450");
    for (const fy of [top + 80, top + 190]) {
      for (let k = 0; k < 2; k++) {
        const wx = x + w * (0.2 + k * 0.42);
        rect4(c, wx - 4, fy - 4, 40, 84, "#f2ead8");
        rect4(c, wx, fy, 32, 76, "#4a6070");
        rect4(c, wx - 12, fy, 8, 76, BLIND);
        rect4(c, wx + 32, fy, 8, 76, BLIND);
        line3(c, wx + 16, fy, wx + 16, fy + 76, "#f2ead8", 2);
      }
    }
    if (h.balcony) {
      const by = top + 170;
      rect4(c, x + w * 0.12, by, w * 0.76, 8, IRON2);
      for (let bx = x + w * 0.12 + 4; bx < x + w * 0.88; bx += 10) rect4(c, bx, by + 8, 3, 22, IRON2);
      rect4(c, x + w * 0.5 - 1, by - 40, 2, 40, IRON2);
      poly(c, [[x + w * 0.5 + 1, by - 40], [x + w * 0.5 + 26, by - 34], [x + w * 0.5 + 1, by - 26]], BUNTING[Math.round(x) % 3 + 0]);
    }
    rect4(c, x + 12, 700, w - 24, 130, "#3c3a40");
    rect4(c, x + 22, 712, w - 44, 116, "#6f8a9a");
    if (Math.round(x) % 2 === 0) {
      for (let i = 0; i < 6; i++) {
        poly(c, [[x + 8 + i * (w - 16) / 6, 668], [x + 8 + (i + 1) * (w - 16) / 6, 668], [x + 8 + (i + 1) * (w - 16) / 6 + 4, 700], [x + 8 + i * (w - 16) / 6 + 4, 700]], i % 2 ? CREAM3 : "#b8483a");
      }
    }
  }
}
function bunting(c) {
  const strings = [
    [0, 900, 380],
    [1800, 3e3, 360],
    [2300, 2950, 430]
  ];
  for (const [x0, x1, y] of strings) {
    c.strokeStyle = "#3c3a40";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0, y);
    c.quadraticCurveTo((x0 + x1) / 2, y + 60, x1, y);
    c.stroke();
    const n = Math.floor((x1 - x0) / 34);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t;
      const yy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y + 60) + t * t * y;
      poly(c, [[x - 9, yy], [x + 9, yy], [x, yy + 22]], BUNTING[i % BUNTING.length]);
    }
  }
}
function crowd2(c) {
  const r = rng(77);
  for (let i = 0; i < 40; i++) {
    const x = 1880 + r() * 900;
    const base = 800 - r() * 30;
    const h = 170 + r() * 36;
    const cloth = ["#4d4a5c", "#7a5b3e", "#5b6b80", "#8a6a4e", "#3b3a40", "#a0553f", "#e8dcc0"][Math.floor(r() * 7)];
    c.fillStyle = cloth;
    c.beginPath();
    c.moveTo(x - 12, base - h * 0.5);
    c.quadraticCurveTo(x - 20, base - h * 0.62, x - 10, base - h * 0.6);
    c.lineTo(x + 10, base - h * 0.6);
    c.quadraticCurveTo(x + 20, base - h * 0.62, x + 12, base - h * 0.5);
    c.lineTo(x + 16, base);
    c.lineTo(x - 16, base);
    c.closePath();
    c.fill();
    ellipse(c, x, base - h * 0.7, 10, 11, "#c8a688");
    if (r() < 0.4) {
      rect4(c, x - 14, base - h * 0.8, 28, 5, cloth === "#e8dcc0" ? "#b8483a" : "#2b2b30");
      rect4(c, x - 9, base - h * 0.92, 18, 10, cloth === "#e8dcc0" ? "#b8483a" : "#2b2b30");
    }
    if (r() < 0.12) {
      line3(c, x + 14, base - h * 0.45, x + 26, base - h * 1.02, cloth, 5);
    }
  }
}
function quay2(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, 800, BOTTOM, [[0, "#c4b9a2"], [1, "#a2977f"]]);
  c.fillRect(x0, 800, w, BOTTOM - 800);
  rect4(c, x0, 800, w, 10, "#7d7262");
  c.strokeStyle = "rgba(70,60,46,0.45)";
  c.lineWidth = 2;
  for (let y = 830, row3 = 0; y < BOTTOM; y += 26 + row3 * 8, row3++) {
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x0 + w, y);
    c.stroke();
    for (let x = x0 + row3 % 3 * 120; x < x0 + w; x += 420 + row3 * 40) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 26 + row3 * 8);
      c.stroke();
    }
  }
  for (const bx of [380, 2640]) {
    rect4(c, bx - 14, 786, 28, 24, "#2b2d34");
    ellipse(c, bx, 786, 14, 5, "#3c3f48");
  }
}
function lampPosts(c) {
  for (const x of [380, 2620]) {
    rect4(c, x - 4, 420, 8, 420, IRON2);
    rect4(c, x - 14, 830, 28, 12, IRON2);
    poly(c, [[x - 14, 420], [x + 14, 420], [x + 8, 400], [x - 8, 400]], IRON2);
    rect4(c, x - 9, 380, 18, 22, "#f5e6b0");
  }
}
function lampGlow(c, L2) {
  if (L2.pal.dark < 0.4) return;
  for (const x of [380, 2620]) {
    const g = c.createRadialGradient(x, 390, 4, x, 390, 150);
    g.addColorStop(0, "rgba(255,220,140,0.9)");
    g.addColorStop(0.2, "rgba(255,210,120,0.4)");
    g.addColorStop(1, "rgba(255,200,120,0)");
    c.fillStyle = g;
    c.fillRect(x - 160, 240, 320, 300);
  }
}
function windowsLit(c, L2) {
  if (L2.pal.dark < 0.4) return;
  townhouses().forEach((h, i) => {
    for (const fy of [h.top + 80, h.top + 190]) {
      for (let k = 0; k < 2; k++) {
        if ((i + k + (fy > h.top + 150 ? 1 : 0)) % 3 === 0) continue;
        const wx = h.x + h.w * (0.2 + k * 0.42);
        rect4(c, wx, fy, 32, 76, "#ffd77a");
      }
    }
  });
}
function foreground13(c) {
  for (const x of [20, 2800]) {
    rect4(c, x, 1010, 150, 70, "#2b2d34");
    ellipse(c, x + 75, 1010, 75, 14, "#3c3f48");
    ellipse(c, x + 75, 1080, 75, 12, "#2b2d34");
  }
}
var harbor = {
  id: "harbor",
  name: "Harbour Square",
  icon: "\u26F5",
  blurb: "A 1900 harbour square: a stone quay, townhouses hung with bunting, masts and a steamer behind the roofs.",
  width: W10,
  times: ["day", "dusk"],
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 5e3, fog: 0.25, band: [380, 800], draw: (c) => harbourSea(c) },
    { depth: 2e3, fog: 0.1, band: [40, 800], draw: (c) => ships(c) },
    { depth: 900, band: [-420, 840], draw: (c) => fronts(c) },
    { depth: 900, band: [240, 700], draw: windowsLit, emissive: true },
    { depth: 800, band: [240, 420], draw: (c) => bunting(c) },
    { depth: 700, band: [540, 820], draw: (c) => crowd2(c) },
    { depth: 0, band: [380, 840], draw: (c) => lampPosts(c) },
    { depth: 0, band: [240, 640], draw: lampGlow, emissive: true },
    { depth: 0, band: [780, BOTTOM], draw: quay2 },
    { depth: -380, band: [960, BOTTOM], draw: (c) => foreground13(c) }
  ],
  marks: { quay: 500, plinth: 1500, crowd: 2300, centre: 1500 },
  ambience: "city-old",
  music: "nostalgia",
  suggest: ["statue", "bench", "lantern-stall", "umbrella-table", "balloons", "bus-stop", "street-lamp", "newspaper-stand", "barrel"]
};

// src/sets/kahvehane.ts
var W11 = 3200;
var INK = "#2a1c18";
var PLASTER2 = "#a9c09e";
var PLASTER_DEEP = "#8fa888";
var PLASTER_LIGHT = "#c3d5b8";
var DADO3 = "#5c3c2a";
var DADO_DARK = "#3d2719";
var CEIL = "#d8c89a";
var CEIL_STAIN = "#b9a574";
var WOOD2 = "#7b4f2e";
var WOOD_DARK = "#4b2d1c";
var BRASS2 = "#c9a24a";
var CREAM4 = "#f1e6c8";
var TILE_A = "#e4d3ac";
var TILE_B = "#cfa37a";
var GLASS4 = "#e9f2ef";
var TEA = "#c46a2c";
var WALL_BASE2 = 800;
var BOTTOM_OF_WALL = 830;
var DOOR = { x: 262, y: 560, w: 170 };
var WIN3 = { x: 660, y: 330, w: 280, h: 200 };
var SHELF_A = 440;
var SHELF_B = 540;
var COUNTER_TOP = 668;
var TV = { x: 2832, y: 300, w: 176, h: 140 };
var BULBS = [500, 1600, 2750];
var FANS = [1e3, 2300];
function inked(c, pts2, fill, seed, lw = 3, jit = 1.1) {
  const r = rng(seed);
  c.beginPath();
  pts2.forEach(([x, y], i) => {
    const px = x + r.range(-jit, jit);
    const py = y + r.range(-jit, jit);
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  });
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.lineJoin = "round";
  c.stroke();
}
function inkRect(c, x, y, w, h, fill, seed, lw = 3) {
  inked(c, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, seed, lw);
}
function inkRound(c, x, y, w, h, r, fill, lw = 3) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.stroke();
}
function inkEllipse(c, x, y, rx, ry, fill, lw = 2.5, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.stroke();
}
function hatch5(c, x, y, w, h, gap, color) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.strokeStyle = color;
  c.lineWidth = 1.6;
  c.beginPath();
  for (let t = -h; t < w; t += gap) {
    c.moveTo(x + t, y + h);
    c.lineTo(x + t + h, y);
  }
  c.stroke();
  c.restore();
}
function stipple(c, x, y, w, h, n, seed, color, rad = 1.3) {
  const r = rng(seed);
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    c.beginPath();
    c.arc(x + r() * w, y + r() * h, rad * (0.6 + r() * 0.6), 0, Math.PI * 2);
    c.fill();
  }
}
function cutOut(c, x, y, w, h) {
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.fillRect(x, y, w, h);
  c.restore();
}
function at(c, x, y, a, fn) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  fn();
  c.restore();
}
function label(c, s, x, y, size, color, align = "center") {
  c.font = `bold ${size}px Georgia, serif`;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.fillText(s, x, y);
}
function hand2(c, x, y, a, len, lw) {
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len);
  c.stroke();
}
function hash(a, b, k = 0) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(k, 2246822519);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function laundry2(c, x0, y0, x1, y1, sag, colours) {
  const cy = (y0 + y1) / 2 + sag;
  c.strokeStyle = "#4a4a4a";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo((x0 + x1) / 2, cy, x1, y1);
  c.stroke();
  colours.forEach((col, i) => {
    const t = (i + 0.5) / colours.length;
    const x = x0 + (x1 - x0) * t;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    c.fillStyle = col;
    c.fillRect(x - 6, y, 12, 16 + i % 2 * 6);
  });
}
function frame(c, x, y, w, h, a, seed, inside) {
  at(c, x, y, a, () => {
    inkRect(c, -w / 2, -h / 2, w, h, WOOD2, seed, 2.5);
    c.save();
    c.beginPath();
    c.rect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
    c.clip();
    inside(c);
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.strokeRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
  });
}
function shipPicture(c) {
  frame(c, 440, 300, 130, 100, -0.06, 11, (k) => {
    k.fillStyle = "#e9dfc8";
    k.fillRect(-57, -42, 114, 84);
    k.fillStyle = "#4f7f98";
    k.fillRect(-57, 4, 114, 38);
    k.strokeStyle = "#dfeef2";
    k.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      k.beginPath();
      k.moveTo(-46 + i * 24, 16 + i * 6);
      k.lineTo(-30 + i * 24, 16 + i * 6);
      k.stroke();
    }
    inked(k, [[-34, 4], [34, 4], [24, 20], [-24, 20]], "#7b3d2a", 12, 2, 0.4);
    k.strokeStyle = INK;
    k.lineWidth = 2;
    k.beginPath();
    k.moveTo(0, 4);
    k.lineTo(0, -32);
    k.stroke();
    inked(k, [[3, -30], [3, 2], [28, 2]], "#fbf7ee", 13, 1.5, 0.3);
    inked(k, [[-2, -22], [-2, 2], [-22, 2]], "#fbf7ee", 14, 1.5, 0.3);
    inked(k, [[1, -34], [12, -30], [1, -26]], "#c8402f", 15, 1.5, 0.2);
  });
}
function mountainPicture(c) {
  frame(c, 1070, 300, 140, 100, 0.05, 16, (k) => {
    k.fillStyle = "#cfe3ea";
    k.fillRect(-56, -42, 112, 84);
    k.fillStyle = "#f2c94c";
    k.beginPath();
    k.arc(28, -22, 10, 0, Math.PI * 2);
    k.fill();
    k.fillStyle = "#7d97a8";
    k.beginPath();
    k.moveTo(-56, 16);
    k.lineTo(-22, -28);
    k.lineTo(6, 2);
    k.lineTo(26, -14);
    k.lineTo(56, 16);
    k.closePath();
    k.fill();
    k.fillStyle = "#fbf7ee";
    k.beginPath();
    k.moveTo(-26, -14);
    k.lineTo(-22, -28);
    k.lineTo(-18, -14);
    k.lineTo(-22, -17);
    k.closePath();
    k.fill();
    k.fillStyle = "#4f6a7d";
    k.beginPath();
    k.moveTo(-56, 30);
    k.lineTo(-28, -2);
    k.lineTo(-4, 30);
    k.closePath();
    k.fill();
    k.fillStyle = "#6f9461";
    k.fillRect(-56, 26, 112, 20);
  });
}
function teamPhoto(c) {
  frame(c, 1700, 300, 210, 110, -0.03, 18, (k) => {
    k.fillStyle = "#c9b48a";
    k.fillRect(-97, -47, 194, 94);
    k.fillStyle = "#5d4a3a";
    k.fillRect(-97, -47, 194, 50);
    const shirts = ["#2e5f9e", "#c9402f", "#e9e4d8"];
    for (let i = 0; i < 6; i++) {
      const x = -75 + i * 30;
      k.fillStyle = "#d6aa86";
      k.beginPath();
      k.ellipse(x, -22, 5.5, 6, 0, 0, Math.PI * 2);
      k.fill();
      k.fillStyle = shirts[i % 3];
      k.fillRect(x - 7, -16, 14, 14);
    }
    for (let i = 0; i < 5; i++) {
      const x = -60 + i * 30;
      k.fillStyle = "#d6aa86";
      k.beginPath();
      k.ellipse(x, 6, 6, 7, 0, 0, Math.PI * 2);
      k.fill();
      k.fillStyle = shirts[(i + 1) % 3];
      k.fillRect(x - 7, 13, 14, 18);
    }
    k.fillStyle = "#9c8a62";
    k.fillRect(-97, 36, 194, 11);
    inkEllipse(k, -70, 40, 3.5, 3.5, "#fbf7ee", 1.5);
  });
}
function clock(c) {
  const x = 1380;
  const y = 330;
  inkEllipse(c, x, y, 46, 46, WOOD2, 2.5);
  inkEllipse(c, x, y, 38, 38, "#f4ecd6", 2);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    c.beginPath();
    c.moveTo(x + Math.sin(a) * 30, y - Math.cos(a) * 30);
    c.lineTo(x + Math.sin(a) * 35, y - Math.cos(a) * 35);
    c.stroke();
  }
  hand2(c, x, y, -1.047, 20, 3.5);
  hand2(c, x, y, 1.047, 28, 2.5);
  inkEllipse(c, x, y, 3, 3, INK, 1);
}
function notice(c) {
  at(c, 1250, 410, 0.03, () => {
    inkRect(c, -60, -26, 120, 52, "#fbf7ee", 81, 2.5);
    c.strokeStyle = "#b3261e";
    c.lineWidth = 3;
    c.strokeRect(-52, -18, 104, 36);
    label(c, "T\xDCK\xDCRMEK", 0, -6, 13, "#b3261e");
    label(c, "YASAK", 0, 10, 16, "#b3261e");
  });
}
function calendar(c) {
  at(c, 2010, 370, 0.05, () => {
    inkRect(c, -46, -62, 92, 124, "#f7f2e4", 82, 2.5);
    c.fillStyle = "#c8402f";
    c.fillRect(-42, -58, 84, 22);
    label(c, "N\u0130SAN", 0, -47, 12, "#fff8e6");
    c.fillStyle = "#8a7f72";
    for (let r = 0; r < 5; r++) {
      for (let k = 0; k < 7; k++) c.fillRect(-36 + k * 11, -26 + r * 14, 5, 4);
    }
  });
}
function corkBoard(c) {
  inkRect(c, 40, 360, 150, 118, "#a77c4e", 83, 3);
  const slips = [
    [60, 380, 40, 30, -0.1],
    [112, 372, 46, 34, 0.08],
    [72, 420, 52, 26, 0.05],
    [140, 410, 36, 40, -0.12]
  ];
  slips.forEach(([x, y, w, h, a], i) => {
    at(c, x + w / 2, y + h / 2, a, () => {
      inkRect(c, -w / 2, -h / 2, w, h, "#fbf7ee", 90 + i, 1.5);
      c.fillStyle = "rgba(42,28,24,0.45)";
      for (let k = 0; k < 3; k++) c.fillRect(-w / 2 + 5, -h / 2 + 7 + k * 7, w - 12, 2);
    });
    c.fillStyle = "#b3261e";
    c.beginPath();
    c.arc(x + 4, y + 4, 3, 0, Math.PI * 2);
    c.fill();
  });
}
function signBoard(c) {
  inkRect(c, 232, 494, 230, 40, "#1f5a3d", 91, 3);
  label(c, "KAHVEHANE", 347, 514, 22, CREAM4);
}
function windowFrame(c) {
  const { x, y, w, h } = WIN3;
  inked(c, [[x - 16, y - 14], [x + 30, y - 14], [x + 16, y + h * 0.85], [x - 16, y + h * 0.9]], "#a8483a", 11, 2.5);
  inked(c, [[x + w + 16, y - 14], [x + w - 30, y - 14], [x + w - 16, y + h * 0.85], [x + w + 16, y + h * 0.9]], "#a8483a", 12, 2.5);
  inkRect(c, x - 14, y - 16, w + 28, 16, WOOD_DARK, 21, 2.5);
  inkRect(c, x - 14, y, 14, h, WOOD_DARK, 22, 2.5);
  inkRect(c, x + w, y, 14, h, WOOD_DARK, 23, 2.5);
  inkRect(c, x + w / 2 - 4, y, 8, h, WOOD2, 24, 2);
  inkRect(c, x, y + h / 2 - 4, w, 8, WOOD2, 25, 2);
  inkRect(c, x - 22, y + h, w + 44, 16, WOOD2, 26, 2.5);
  inkRect(c, x + w - 52, y + h - 30, 26, 30, "#b5603a", 27, 2);
  inkEllipse(c, x + w - 39, y + h - 40, 12, 10, "#5f9a4e", 2);
  inkEllipse(c, x + w - 52, y + h - 44, 9, 7, "#6fa95c", 2, -0.5);
  inkEllipse(c, x + w - 26, y + h - 46, 9, 7, "#6fa95c", 2, 0.5);
}
function doorFrame(c) {
  const { x, w } = DOOR;
  const top = DOOR.y;
  c.fillStyle = "rgba(190,232,234,0.2)";
  c.fillRect(x, top, w, 160);
  c.fillStyle = "rgba(255,255,255,0.3)";
  c.beginPath();
  c.moveTo(x + 18, top);
  c.lineTo(x + 34, top);
  c.lineTo(x + 12, top + 160);
  c.lineTo(x - 4, top + 160);
  c.closePath();
  c.fill();
  inkRect(c, x - 12, top - 14, w + 24, 14, WOOD_DARK, 33, 2.5);
  inkRect(c, x - 12, top, 12, WALL_BASE2 - top + 2, WOOD_DARK, 31, 2.5);
  inkRect(c, x + w, top, 12, WALL_BASE2 - top + 2, WOOD_DARK, 32, 2.5);
  inkRect(c, x, top + 84, w, 8, WOOD_DARK, 34, 2);
  inkRect(c, x + w / 2 - 4, top, 8, 160, WOOD_DARK, 35, 2);
  inkRect(c, x - 12, top + 160, w + 24, WALL_BASE2 - top - 160, WOOD2, 36, 2.5);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.strokeRect(x + 14, top + 172, w - 28, 50);
  inkRect(c, x + w - 26, top + 110, 16, 6, BRASS2, 37, 2);
  inkRect(c, x + 22, top + 26, 62, 26, "#fbf7ee", 38, 2);
  label(c, "A\xC7IK", x + 53, top + 40, 14, "#b3261e");
}
function backsplash(c) {
  c.fillStyle = "#efe5cc";
  c.fillRect(2318, 600, 792, 68);
  c.strokeStyle = "rgba(60,40,30,0.3)";
  c.lineWidth = 2;
  for (let x = 2318; x < 3110; x += 32) {
    c.beginPath();
    c.moveTo(x, 600);
    c.lineTo(x, 668);
    c.stroke();
  }
  for (let y = 617; y < 668; y += 17) {
    c.beginPath();
    c.moveTo(2318, y);
    c.lineTo(3110, y);
    c.stroke();
  }
}
function sugarBox(c, x, base, w, h, col, seed, text3) {
  inkRect(c, x, base - h, w, h, col, seed, 2.5);
  c.fillStyle = shade(col, 0.18);
  c.fillRect(x + 3, base - h + 3, w - 6, 5);
  c.fillStyle = CREAM4;
  c.fillRect(x + w * 0.18, base - h * 0.7, w * 0.64, h * 0.42);
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.strokeRect(x + w * 0.18, base - h * 0.7, w * 0.64, h * 0.42);
  label(c, text3, x + w / 2, base - h * 0.49, Math.max(8, h * 0.2), "#8c2a1e");
}
function tulip(c, x, base, s, seed) {
  const P4 = (dx, dy) => [x + dx * s, base + dy * s];
  inked(c, [P4(-8, 0), P4(8, 0), P4(2, -10), P4(2, -14), P4(10, -20), P4(12, -30), P4(11, -38), P4(-11, -38), P4(-12, -30), P4(-10, -20), P4(-2, -14), P4(-2, -10)], GLASS4, seed, 2, 0.3);
  c.fillStyle = TEA;
  c.beginPath();
  [P4(-9, -17), P4(9, -17), P4(10, -28), P4(9, -34), P4(-9, -34), P4(-10, -28)].forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py));
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.7)";
  c.lineWidth = 1.5 * s;
  c.beginPath();
  c.moveTo(...P4(-6, -25));
  c.lineTo(...P4(-6, -19));
  c.stroke();
}
function shelves(c) {
  hatch5(c, 2330, SHELF_A + 12, 790, 14, 7, "rgba(60,40,30,0.3)");
  hatch5(c, 2330, SHELF_B + 12, 790, 14, 7, "rgba(60,40,30,0.25)");
  inkRect(c, 2330, SHELF_A, 790, 12, WOOD_DARK, 41, 2.5);
  inkRect(c, 2330, SHELF_B, 790, 12, WOOD_DARK, 42, 2.5);
  for (const x of [2360, 3070]) {
    inked(c, [[x, SHELF_A + 12], [x + 18, SHELF_A + 12], [x, SHELF_A + 40]], WOOD_DARK, 43 + x, 2, 0.3);
    inked(c, [[x, SHELF_B + 12], [x + 18, SHELF_B + 12], [x, SHELF_B + 40]], WOOD_DARK, 44 + x, 2, 0.3);
  }
  const boxes = [
    [2340, 58, 58, "#c8402f", "\u015EEKER"],
    [2404, 46, 44, "#3b78a8", "\u015EEKER"],
    [2456, 74, 70, "#e9dcb8", "K\xDCP"],
    [2536, 60, 48, "#4f8a4f", "\u015EEKER"],
    [2602, 66, 62, "#d8a632", "\u015EEKER"],
    [2674, 52, 40, "#c8402f", "K\xDCP"]
  ];
  boxes.forEach(([x, w, h, col, text3], i) => sugarBox(c, x, SHELF_A, w, h, col, 100 + i, text3));
  inkRect(c, 2748, SHELF_A - 44, 34, 44, "#8c9aa6", 110, 2.5);
  for (let i = 0; i < 6; i++) tulip(c, 2356 + i * 34, SHELF_B, 1, 120 + i);
  inkRect(c, 2566, SHELF_B - 44, 40, 44, "#a7d28f", 130, 2.5);
  inkRect(c, 2564, SHELF_B - 50, 44, 8, "#c8402f", 131, 2);
  tulip(c, 2630, SHELF_B, 1, 132);
  tulip(c, 2664, SHELF_B, 1, 133);
  inkRect(c, 2716, SHELF_B - 34, 60, 34, "#2f6f5a", 134, 2.5);
  label(c, "\xC7AY", 2746, SHELF_B - 17, 12, CREAM4);
}
function tvSet(c) {
  const { x, y, w, h } = TV;
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x + 88, y);
  c.lineTo(x + 56, y - 62);
  c.moveTo(x + 88, y);
  c.lineTo(x + 122, y - 62);
  c.stroke();
  inkEllipse(c, x + 56, y - 62, 4, 4, BRASS2, 1.5);
  inkEllipse(c, x + 122, y - 62, 4, 4, BRASS2, 1.5);
  inkRound(c, x, y, w, h, 14, "#c2b38f", 3);
  inkRound(c, x + 14, y + 14, 116, 100, 10, "#2f3a3a", 2.5);
  c.fillStyle = "rgba(255,255,255,0.14)";
  c.beginPath();
  c.moveTo(x + 30, y + 26);
  c.lineTo(x + 48, y + 26);
  c.lineTo(x + 34, y + 102);
  c.lineTo(x + 20, y + 102);
  c.closePath();
  c.fill();
  inkEllipse(c, x + 150, y + 30, 6, 6, "#6b5a40", 2);
  inkEllipse(c, x + 150, y + 52, 6, 6, "#6b5a40", 2);
  c.strokeStyle = "#8c7a5c";
  c.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.moveTo(x + 22, y + 122 + i * 3);
    c.lineTo(x + 100, y + 122 + i * 3);
    c.stroke();
  }
}
function samovar(c, x, base) {
  inkRound(c, x - 34, base - 46, 68, 46, 20, "#b5452c", 2.5);
  c.fillStyle = "rgba(255,230,200,0.5)";
  c.fillRect(x - 24, base - 40, 6, 30);
  inkRound(c, x - 22, base - 80, 44, 36, 16, "#c84d33", 2.5);
  inkEllipse(c, x, base - 82, 16, 5, "#d9b25f", 2);
  inkEllipse(c, x, base - 88, 4, 4, "#d9b25f", 1.5);
  inked(c, [[x - 22, base - 64], [x - 40, base - 76], [x - 42, base - 70], [x - 22, base - 56]], "#c84d33", 61, 2.5, 0.3);
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(x + 30, base - 62, 11, -Math.PI / 2, Math.PI / 2);
  c.stroke();
  inkRect(c, x + 30, base - 24, 10, 8, "#d9b25f", 62, 2);
}
function cat(c) {
  const x = 2950;
  const base = COUNTER_TOP;
  c.strokeStyle = "#7f7d86";
  c.lineWidth = 6;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x + 24, base - 4);
  c.quadraticCurveTo(x + 46, base - 8, x + 42, base - 30);
  c.stroke();
  inkEllipse(c, x, base - 14, 24, 14, "#7f7d86", 2.5);
  inkEllipse(c, x - 20, base - 32, 12, 11, "#7f7d86", 2.5);
  inked(c, [[x - 28, base - 38], [x - 26, base - 50], [x - 18, base - 41]], "#7f7d86", 63, 2, 0.2);
  inked(c, [[x - 16, base - 41], [x - 10, base - 50], [x - 8, base - 38]], "#7f7d86", 64, 2, 0.2);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x - 26, base - 32);
  c.lineTo(x - 17, base - 32);
  c.stroke();
}
function counter(c) {
  inkRect(c, 2318, COUNTER_TOP, 792, 16, "#e7dcc3", 51, 2.5);
  c.strokeStyle = "rgba(120,100,80,0.6)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(2400, 672);
  c.lineTo(2480, 678);
  c.lineTo(2540, 674);
  c.moveTo(2900, 678);
  c.lineTo(2980, 672);
  c.stroke();
  inkRect(c, 2326, COUNTER_TOP + 16, 776, WALL_BASE2 - COUNTER_TOP - 16, WOOD2, 52, 2.5);
  c.strokeStyle = WOOD_DARK;
  c.lineWidth = 2;
  for (let i = 0; i < 3; i++) c.strokeRect(2344 + i * 256, 704, 226, 84);
  inkRect(c, 2613, 714, 200, 36, CREAM4, 53, 2);
  label(c, "\xC7AY OCA\u011EI", 2713, 732, 20, "#8c2a1e");
  samovar(c, 2440, COUNTER_TOP);
  inkRect(c, 2566, COUNTER_TOP - 10, 176, 10, BRASS2, 54, 2.5);
  for (let i = 0; i < 5; i++) tulip(c, 2586 + i * 30, COUNTER_TOP - 8, 0.85, 140 + i);
}
function wallLayer(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  c.fillStyle = PLASTER2;
  c.fillRect(x0, -420, w, BOTTOM_OF_WALL + 420);
  c.globalAlpha = 0.5;
  c.fillStyle = PLASTER_LIGHT;
  for (const [px, py, pw, ph] of [[300, -80, 520, 220], [1880, 60, 620, 180], [2500, -200, 700, 240]]) {
    c.beginPath();
    c.ellipse(px, py, pw / 2, ph / 2, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  stipple(c, x0, -420, w, BOTTOM_OF_WALL + 420, 2600, 61, PLASTER_DEEP, 1.3);
  c.fillStyle = DADO3;
  c.fillRect(x0, 642, w, 144);
  c.fillStyle = DADO_DARK;
  c.fillRect(x0, 630, w, 12);
  c.fillRect(x0, 786, w, 14);
  c.strokeStyle = DADO_DARK;
  c.lineWidth = 3;
  for (let x = x0 + 30; x < x0 + w; x += 240) c.strokeRect(x, 664, 196, 100);
  corkBoard(c);
  shipPicture(c);
  mountainPicture(c);
  clock(c);
  notice(c);
  teamPhoto(c);
  calendar(c);
  signBoard(c);
  cutOut(c, WIN3.x, WIN3.y, WIN3.w, WIN3.h);
  cutOut(c, DOOR.x, DOOR.y, DOOR.w, WALL_BASE2 - DOOR.y);
  windowFrame(c);
  doorFrame(c);
  backsplash(c);
  shelves(c);
  tvSet(c);
  counter(c);
  cat(c);
}
function wallGlow(c, L2) {
  if (L2.pal.dark < 0.4) return;
  c.fillStyle = "#5f9a4e";
  c.fillRect(TV.x + 14, TV.y + 14, 116, 100);
  c.strokeStyle = "#e8f4e0";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(TV.x + 72, TV.y + 64, 16, 0, Math.PI * 2);
  c.moveTo(TV.x + 72, TV.y + 14);
  c.lineTo(TV.x + 72, TV.y + 114);
  c.stroke();
  glow(c, TV.x + 72, TV.y + 64, 120, "#9ad6ff", 0.3);
  glow(c, 347, 514, 130, "#ffd27a", 0.35);
  label(c, "KAHVEHANE", 347, 514, 22, "#fff1b8");
}
function ceiling4(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  c.fillStyle = CEIL;
  c.fillRect(x0, -420, w, 538);
  stipple(c, x0, -420, w, 500, 900, 13, CEIL_STAIN, 1.4);
  c.globalAlpha = 0.45;
  c.fillStyle = CEIL_STAIN;
  for (const [sx, sy, rx, ry] of [[700, 40, 110, 36], [2100, 70, 150, 40], [1300, -120, 90, 50]]) {
    c.beginPath();
    c.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  inkRect(c, x0, 40, w, 16, WOOD_DARK, 81, 2.5);
  c.fillStyle = CEIL_STAIN;
  c.fillRect(x0, 96, w, 22);
  c.fillStyle = "#a58d5c";
  for (let x = x0 + 6; x < x0 + w; x += 20) c.fillRect(x, 102, 10, 10);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x0, 118);
  c.lineTo(x0 + w, 118);
  c.stroke();
  for (const x of FANS) {
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(x, 56);
    c.lineTo(x, 146);
    c.stroke();
    for (const rot of [0.15, 0.15 + Math.PI / 2]) {
      c.beginPath();
      c.ellipse(x, 150, 74, 8, rot, 0, Math.PI * 2);
      c.fillStyle = "#9b7a52";
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.stroke();
    }
    inkEllipse(c, x, 150, 12, 10, "#e9e2cf", 2.5);
  }
  for (const x of BULBS) {
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, 118);
    c.lineTo(x, 152);
    c.stroke();
    c.beginPath();
    c.moveTo(x - 28, 170);
    c.quadraticCurveTo(x, 130, x + 28, 170);
    c.closePath();
    c.fillStyle = "#2f7d5b";
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.stroke();
    inkEllipse(c, x, 176, 9, 10, "#fff3c8", 2);
  }
}
function bulbGlow(c, L2) {
  if (L2.pal.dark < 0.4) return;
  for (const x of BULBS) glow(c, x, 176, 84, "#ffd98a", 0.5);
}
var BLOCK_COLS = ["#d9c8a3", "#c3b08f", "#b8c3ac", "#d8a58a", "#a8b5c3", "#e5d9bf", "#c9a4a0"];
function blocks() {
  const r = rng(404);
  const out = [];
  for (let x = -560, i = 0; x < W11 + 560; i++) {
    const w = r.range(170, 260);
    out.push({ x, w, top: r.range(120, 250), col: r.pick(BLOCK_COLS), seed: i + 1, dish: r.chance(0.5) });
    x += w;
  }
  return out;
}
function eachWindow2(b, fn) {
  const floors = Math.floor((660 - b.top - 40) / 56);
  const cols = Math.floor((b.w - 24) / 46);
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) fn(b.x + 14 + col * 46 + 6, b.top + 30 + f * 56, f, col);
  }
}
var litWindow = (b, f, col) => hash(b.seed, f, col) < 0.4;
function city3(c) {
  for (const b of blocks()) {
    c.fillStyle = b.col;
    c.fillRect(b.x, b.top, b.w, 660 - b.top);
    c.fillStyle = shade(b.col, -0.2);
    c.fillRect(b.x + b.w - 10, b.top, 10, 660 - b.top);
    c.fillStyle = shade(b.col, -0.1);
    c.fillRect(b.x, b.top, b.w, 6);
    hatch5(c, b.x, 600, b.w, 60, 8, "rgba(60,40,30,0.25)");
    eachWindow2(b, (x, y, f, col) => {
      c.fillStyle = "#4f5f6a";
      c.fillRect(x, y, 24, 28);
      c.fillStyle = "rgba(255,255,255,0.25)";
      c.fillRect(x + 3, y + 3, 6, 9);
      if (hash(b.seed, f, col + 50) < 0.3) {
        c.fillStyle = shade(b.col, -0.35);
        c.fillRect(x - 6, y + 30, 36, 4);
        for (let k = 0; k < 4; k++) c.fillRect(x - 6 + k * 10, y + 34, 2, 10);
      }
    });
    if (b.dish) dish(c, b.x + b.w * 0.72, b.top, 22, { metal: "#e9e9ec", dark: "#7d838c", angle: -0.5 });
  }
  laundry2(c, 700, 338, 920, 346, 16, ["#f4f4f0", "#d95b4b", "#4f8fc9", "#e0b43a"]);
  laundry2(c, 1300, 370, 1480, 366, 14, ["#7fb77e", "#f4f4f0"]);
}
function cityLights2(c, L2) {
  if (L2.pal.dark < 0.4) return;
  for (const b of blocks()) {
    eachWindow2(b, (x, y, f, col) => {
      if (!litWindow(b, f, col)) return;
      c.fillStyle = "#ffd77a";
      c.fillRect(x, y, 24, 28);
    });
  }
  glow(c, 806, 440, 26, "#fff3c4", 0.5);
}
function taxi(c, cx, base) {
  const Y = "#f2c230";
  inkRound(c, cx - 92, base - 58, 184, 46, 10, Y, 2.5);
  inkRound(c, cx - 56, base - 80, 112, 28, 10, Y, 2.5);
  inkRect(c, cx - 48, base - 74, 42, 18, "#3c4a55", 71, 2);
  inkRect(c, cx + 2, base - 74, 42, 18, "#3c4a55", 72, 2);
  inkRect(c, cx - 14, base - 90, 28, 11, "#fbf7ee", 73, 1.5);
  label(c, "TAKS\u0130", cx, base - 84, 7, INK);
  for (let i = 0; i < 18; i++) {
    c.fillStyle = i % 2 ? INK : "#fbf7ee";
    c.fillRect(cx - 92 + i * 10, base - 30, 10, 4);
  }
  for (const wx of [cx - 54, cx + 54]) {
    inkEllipse(c, wx, base, 13, 13, "#2a2a2a", 2);
    inkEllipse(c, wx, base, 5, 5, "#c9ccd6", 1.5);
  }
  inkEllipse(c, cx + 90, base - 44, 4, 4, "#fff6d0", 1.5);
}
function farRoad(c) {
  c.fillStyle = "#4a4753";
  c.fillRect(-MARGIN, 506, W11 + MARGIN * 2, 60);
  taxi(c, 812, 530);
}
function street3(c) {
  c.fillStyle = "#b7b0a2";
  c.fillRect(-MARGIN, 560, W11 + MARGIN * 2, 40);
  c.strokeStyle = "rgba(60,55,50,0.4)";
  c.lineWidth = 1.5;
  for (let x = -MARGIN; x < W11 + MARGIN; x += 60) {
    c.beginPath();
    c.moveTo(x, 560);
    c.lineTo(x - 6, 600);
    c.stroke();
  }
  c.fillStyle = "#8c867a";
  c.fillRect(-MARGIN, 598, W11 + MARGIN * 2, 5);
  c.fillStyle = "#4e4a52";
  c.fillRect(-MARGIN, 603, W11 + MARGIN * 2, 130);
  c.fillStyle = "#e8e2c8";
  for (let x = -MARGIN; x < W11 + MARGIN; x += 150) c.fillRect(x, 662, 70, 6);
}
function cube(c, x, y, seed) {
  inkRect(c, x, y, 16, 12, "#fbfaf3", seed, 2);
  c.fillStyle = "#d8d2c0";
  c.fillRect(x + 2, y + 8, 12, 2);
}
function paper(c, x, y, a, seed) {
  at(c, x, y, a, () => {
    inkRect(c, -80, -44, 160, 88, "#efe9d8", seed, 2.5);
    c.fillStyle = "#3c3430";
    c.fillRect(-68, -34, 136, 10);
    c.fillStyle = "rgba(42,28,24,0.55)";
    for (let i = 0; i < 3; i++) c.fillRect(-68, -16 + i * 7, 136 - i * 30, 2.5);
    c.fillStyle = "#9c9383";
    c.fillRect(-68, 4, 52, 34);
    c.fillStyle = "rgba(42,28,24,0.55)";
    for (let i = 0; i < 5; i++) c.fillRect(-4, 4 + i * 7, 70, 2.5);
  });
}
function floorLayer(c, L2) {
  const x0 = -MARGIN;
  const w = L2.width + MARGIN * 2;
  c.fillStyle = TILE_A;
  c.fillRect(x0, WALL_BASE2, w, BOTTOM - WALL_BASE2);
  c.strokeStyle = "rgba(42,28,24,0.35)";
  c.lineWidth = 2;
  let y = WALL_BASE2;
  for (let row3 = 0; y < BOTTOM; row3++) {
    const h = 30 + row3 * 7;
    const tw = 100 + row3 * 12;
    const off = row3 % 2 * (tw / 2);
    for (let k = -1; ; k++) {
      const x = x0 + off + k * tw;
      if (x > x0 + w) break;
      c.fillStyle = hash(row3, k, 7) < 0.3 ? TILE_B : TILE_A;
      c.fillRect(x, y, tw, h);
      c.strokeRect(x, y, tw, h);
    }
    y += h;
  }
  stipple(c, x0, WALL_BASE2, w, 400, 900, 9, "rgba(90,60,40,0.22)", 1.5);
  cube(c, 96, 1e3, 201);
  cube(c, 118, 1012, 202);
  cube(c, 106, 1024, 203);
  cube(c, 3062, 934, 204);
  cube(c, 3084, 950, 205);
  cube(c, 3050, 962, 206);
  paper(c, 240, 1040, 0.12, 211);
  paper(c, 2950, 1100, -0.22, 212);
}
var kahvehane = {
  id: "kahvehane",
  name: "Kahvehane",
  icon: "\u2615",
  blurb: "A traditional coffeehouse: green plaster and a wood dado, a tea counter with a samovar and a cat, a TV on a high shelf, and a glass door onto the street.",
  width: W11,
  interior: true,
  times: ["day", "dusk", "night"],
  sky: (tod) => [TOD[tod].skyTop, TOD[tod].skyLow],
  layers: () => [
    { depth: 2500, fog: 0.25, band: [120, 660], draw: city3 },
    { depth: 2500, emissive: true, band: [120, 660], draw: cityLights2 },
    { depth: 2e3, band: [380, 560], draw: farRoad },
    { depth: 1800, band: [556, 740], draw: street3 },
    { depth: 600, band: [-420, BOTTOM_OF_WALL], draw: wallLayer },
    { depth: 600, emissive: true, band: [200, 700], draw: wallGlow },
    { depth: 300, band: [-420, 200], draw: ceiling4 },
    { depth: 300, emissive: true, band: [80, 280], draw: bulbGlow },
    { depth: 0, band: [WALL_BASE2, BOTTOM], draw: floorLayer }
  ],
  marks: { door: 350, window: 800, centre: 1600, tables: 1300, counter: 2600, tv: 2900 },
  ambience: "city-old",
  music: "nostalgia",
  suggest: ["tavla-table", "plastic-stool", "marble-table", "tea-glass", "tea-tray", "newspaper", "worry-beads", "coal-stove", "hanging-bulb"]
};

// src/sets/space.ts
var W12 = 2800;
var INK2 = "#120c2c";
var STAR_TINTS = ["#ffffff", "#ffffff", "#dfe7ff", "#fff3d6", "#ffd6e4"];
function hatchIn(c, build, box2, color, gap = 4, slope = 0.5, alpha2 = 0.35) {
  const [x0, y0, x1, y1] = box2;
  c.save();
  c.beginPath();
  build();
  c.clip();
  c.strokeStyle = color;
  c.globalAlpha = alpha2;
  c.lineWidth = 1;
  c.beginPath();
  const H = y1 - y0;
  for (let s = x0 - H * slope - gap; s < x1 + gap; s += gap) {
    c.moveTo(s, y0);
    c.lineTo(s + H * slope, y1);
  }
  c.stroke();
  c.restore();
}
function scatter(c, r, n, x0, x1, y0, y1, maxR) {
  for (let i = 0; i < n; i++) {
    const s = Math.pow(r(), 3) * maxR + 0.5;
    ellipse(c, r.range(x0, x1), r.range(y0, y1), s, s, r.pick(STAR_TINTS));
  }
}
function starfield(c, L2) {
  const r = rng(12);
  scatter(c, r, 900, -MARGIN, L2.width + MARGIN, -420, BOTTOM, 2);
  for (let i = 0; i < 24; i++) star4(c, r.range(-MARGIN, L2.width + MARGIN), r.range(-400, 900), r.range(7, 16), "#f7f9ff");
}
function brightStars(c, L2) {
  const r = rng(29);
  for (let i = 0; i < 46; i++) {
    const x = r.range(-MARGIN, L2.width + MARGIN);
    const y = r.range(-400, 960);
    const s = 2.2 + r() * 2.2;
    glow(c, x, y, s * 6, "#cfe0ff", 0.45);
    ellipse(c, x, y, s, s, "#ffffff");
  }
}
function swirl(c, r, cx, cy, rMax, color, arms) {
  for (let a = 0; a < arms; a++) {
    const phase = a / arms * Math.PI * 2 + r.range(-0.3, 0.3);
    for (let t = 0.2; t < 3.2; t += 0.022) {
      const rr4 = rMax * (t / 3.2);
      const ang = phase + t * 1.8;
      const x = cx + Math.cos(ang) * rr4 + r.range(-rMax * 0.05, rMax * 0.05);
      const y = cy + Math.sin(ang) * rr4 * 0.42 + r.range(-6, 6);
      c.globalAlpha = r.range(0.15, 0.5) * (0.4 + t / 3.2);
      ellipse(c, x, y, r.range(1, 3.2) * (0.5 + t / 3.2), r.range(1, 2.6), color);
    }
  }
  c.globalAlpha = 1;
}
function nebula(c) {
  const r = rng(40);
  glow(c, 700, 360, 520, "#5b3a9c", 0.2);
  glow(c, 2e3, 180, 480, "#2c5f8a", 0.18);
  glow(c, 1500, 640, 420, "#7a3f78", 0.14);
  swirl(c, r, 720, 360, 340, "#8f7ad6", 3);
  swirl(c, r, 2080, 200, 280, "#6aa9c9", 2);
  swirl(c, r, 1450, 700, 220, "#b07fb8", 2);
  c.save();
  c.globalAlpha = 0.5;
  c.strokeStyle = INK2;
  c.lineWidth = 14;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(1150, 120);
  c.bezierCurveTo(1300, 260, 1420, 330, 1600, 300);
  c.stroke();
  c.restore();
}
function planet(c, x, y, r0, body, shadow, ring) {
  if (ring) {
    c.strokeStyle = ring;
    c.lineWidth = r0 * 0.16;
    c.beginPath();
    c.ellipse(x, y, r0 * 1.9, r0 * 0.46, -0.25, Math.PI, Math.PI * 2);
    c.stroke();
  }
  ellipse(c, x, y, r0, r0, body);
  c.save();
  c.beginPath();
  c.arc(x, y, r0, 0, Math.PI * 2);
  c.clip();
  ellipse(c, x + r0 * 0.5, y + r0 * 0.1, r0 * 1.02, r0 * 1.05, shadow);
  c.restore();
  hatchIn(c, () => c.arc(x, y, r0, 0, Math.PI * 2), [x - r0, y - r0, x + r0, y + r0], INK2, 3, 0.9, 0.22);
  if (ring) {
    c.strokeStyle = ring;
    c.lineWidth = r0 * 0.16;
    c.beginPath();
    c.ellipse(x, y, r0 * 1.9, r0 * 0.46, -0.25, 0, Math.PI);
    c.stroke();
  }
}
function planets(c) {
  planet(c, 430, 250, 34, "#b98a58", "#7b5636", "#d8bb8a");
  planet(c, 2110, 150, 22, "#5d9a9a", "#33605f");
  planet(c, 1960, 610, 13, "#b5776e", "#7a4a45");
}
function comet(c) {
  const hx = 2300;
  const hy = 300;
  const tx = 1560;
  const ty = 530;
  const g = c.createLinearGradient(hx, hy, tx, ty);
  g.addColorStop(0, "rgba(230,240,255,0.85)");
  g.addColorStop(0.35, "rgba(160,190,255,0.35)");
  g.addColorStop(1, "rgba(120,150,230,0)");
  c.save();
  c.globalCompositeOperation = "lighter";
  poly(c, [[hx - 4, hy - 6], [tx, ty - 18], [tx + 6, ty + 12], [hx + 4, hy + 6]], g);
  c.restore();
  glow(c, hx, hy, 70, "#dfeaff", 0.6);
  ellipse(c, hx, hy, 9, 9, "#ffffff");
  const r = rng(77);
  c.strokeStyle = "rgba(200,215,255,0.45)";
  c.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const oy = r.range(-14, 14);
    c.beginPath();
    c.moveTo(hx - 10, hy + oy * 0.2);
    c.lineTo(tx + r.range(-30, 30), ty + oy);
    c.stroke();
  }
}
function floorBank(c, L2) {
  glow(c, 700, 1e3, 700, "#4b2f8a", 0.14);
  glow(c, 2100, 1010, 620, "#24506e", 0.1);
  const r = rng(53);
  for (let i = 0; i < 16; i++) {
    const x = r.range(-MARGIN, L2.width + MARGIN);
    const y = r.range(900, 980);
    const w = r.range(240, 520);
    cloud(c, x, y, w, r.chance(0.5) ? "#2b1f55" : "#1f2a4f", "#150f33", 100 + i);
  }
  c.fillStyle = "#08061a";
  c.fillRect(-MARGIN, 1040, L2.width + MARGIN * 2, BOTTOM - 1040);
  c.fillStyle = shade("#08061a", 0.12);
  c.fillRect(-MARGIN, 1040, L2.width + MARGIN * 2, 4);
  const s = rng(88);
  c.strokeStyle = "rgba(120,100,200,0.22)";
  c.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const x = s.range(-MARGIN, L2.width + MARGIN);
    const y = s.range(1040, BOTTOM);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + s.range(60, 200), y - s.range(4, 16));
    c.stroke();
  }
}
var space = {
  id: "space",
  name: "Outer Space",
  icon: "\u{1F30C}",
  blurb: "A black-indigo void of painted stars, dust swirls, small distant planets and a comet, with a dark nebula bank below.",
  width: W12,
  sky: () => ["#03040e", "#16123a"],
  layers: () => [
    { depth: 9e3, emissive: true, band: [-420, BOTTOM], draw: starfield },
    { depth: 8e3, emissive: true, band: [-420, 1e3], draw: nebula },
    { depth: 7e3, emissive: true, band: [100, 600], draw: comet },
    { depth: 6e3, fog: 0.15, band: [40, 660], draw: planets },
    { depth: 3e3, emissive: true, band: [-420, 1e3], draw: brightStars },
    { depth: 0, band: [840, BOTTOM], draw: floorBank }
  ],
  marks: { left: 600, centre: 1500, right: 2400 },
  ambience: "space",
  music: "mystery",
  suggest: ["rocket", "satellite", "alien", "flying-saucer", "robot-butler", "crystal", "hologram", "space-console"]
};

// src/sets/moon.ts
var W13 = 2800;
var CLIFF = 2900;
var SUN = "#cfcdc5";
var SHADE = "#a6a4ab";
var DEEP = "#72717b";
var INK3 = "#2f3040";
var RIM = "#f7f5ee";
function hatchIn2(c, build, box2, color, gap = 5, slope = 0.5, alpha2 = 0.45) {
  const [x0, y0, x1, y1] = box2;
  c.save();
  c.beginPath();
  build();
  c.clip();
  c.strokeStyle = color;
  c.globalAlpha = alpha2;
  c.lineWidth = 1.1;
  c.beginPath();
  const H = y1 - y0;
  for (let s = x0 - H * slope - gap; s < x1 + gap; s += gap) {
    c.moveTo(s, y0);
    c.lineTo(s + H * slope, y1);
  }
  c.stroke();
  c.restore();
}
function hatchPoly(c, pts2, color, gap = 5, slope = 0.5, alpha2 = 0.45) {
  const xs = pts2.map((p) => p[0]);
  const ys = pts2.map((p) => p[1]);
  hatchIn2(
    c,
    () => {
      pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
      c.closePath();
    },
    [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    color,
    gap,
    slope,
    alpha2
  );
}
function range(c, r, o) {
  const coarse = [[o.x0, o.base - r.range(0, o.hMin * 0.3)]];
  let x = o.x0;
  while (x < o.x1) {
    const st = o.step * r.range(0.6, 1.4);
    coarse.push([x + st * r.range(0.3, 0.7), o.base - r.range(o.hMin, o.hMax)]);
    x += st;
    coarse.push([x, o.base - r.range(0, o.hMin * 0.35)]);
  }
  const jag = (a, b) => {
    const out = [];
    for (const t of [0.22, 0.45, 0.7]) {
      const y = a[1] + (b[1] - a[1]) * t + r.range(-1, 1) * o.hMin * 0.8;
      out.push([a[0] + (b[0] - a[0]) * t, y]);
    }
    return out;
  };
  const low = o.base + 60;
  const sky3 = [[o.x0 - 20, low], coarse[0]];
  const faces = [];
  for (let i = 1; i < coarse.length - 1; i += 2) {
    const v0 = coarse[i - 1];
    const p = coarse[i];
    const v1 = coarse[i + 1];
    const left = jag(v0, p);
    const right = jag(p, v1);
    sky3.push(...left, p, ...right, v1);
    faces.push([p, ...right, v1, [v1[0], low], [p[0], low]]);
  }
  sky3.push([x + 20, low]);
  poly(c, sky3, o.light);
  for (const face of faces) {
    poly(c, face, o.dark);
    hatchPoly(c, face, INK3, 5, 0.7, 0.32);
  }
}
function crater2(c, x, y, rx, ry) {
  ellipse(c, x, y, rx * 1.12, ry * 1.12, RIM);
  ellipse(c, x, y + ry * 0.08, rx * 1.02, ry * 1.02, SUN);
  ellipse(c, x, y, rx, ry, "#bdbcc0");
  const sx = x + rx * 0.18;
  const sy = y + ry * 0.2;
  ellipse(c, sx, sy, rx * 0.8, ry * 0.76, SHADE);
  hatchIn2(c, () => c.ellipse(sx, sy, rx * 0.8, ry * 0.76, 0, 0, Math.PI * 2), [x - rx, y - ry, x + rx, y + ry], INK3, 4, 0.4, 0.3);
}
function boulder(c, x, y, w, h) {
  const body = [
    [x - w / 2, y],
    [x - w * 0.42, y - h * 0.6],
    [x - w * 0.1, y - h],
    [x + w * 0.3, y - h * 0.82],
    [x + w / 2, y]
  ];
  poly(c, body, SUN);
  const dark = [
    [x - w * 0.1, y - h],
    [x + w * 0.3, y - h * 0.82],
    [x + w / 2, y],
    [x + w * 0.05, y]
  ];
  poly(c, dark, DEEP);
  hatchPoly(c, dark, INK3, 4, 0.6, 0.4);
}
function starfield2(c, L2) {
  const r = rng(11);
  for (let i = 0; i < 900; i++) {
    const s = Math.pow(r(), 3) * 2.2 + 0.5;
    ellipse(c, r.range(-MARGIN, L2.width + MARGIN), r.range(-420, BOTTOM), s, s, r.chance(0.2) ? "#c9d4ff" : "#ffffff");
  }
  for (let i = 0; i < 26; i++) star4(c, r.range(-MARGIN, L2.width + MARGIN), r.range(-400, 700), r.range(6, 15), "#f4f6ff");
}
function farPeaks(c) {
  range(c, rng(21), { x0: -MARGIN, x1: W13 + MARGIN, base: 760, hMin: 70, hMax: 250, step: 250, light: "#c4c5d0", dark: "#8c8ea0" });
}
function midPeaks(c) {
  range(c, rng(33), { x0: -MARGIN, x1: W13 + MARGIN, base: 800, hMin: 40, hMax: 160, step: 190, light: "#d6d5cf", dark: "#9e9da4" });
}
function horizon(c) {
  const r = rng(45);
  c.fillStyle = "#c9c7c0";
  c.fillRect(-MARGIN, 800, W13 + MARGIN * 2, 60);
  range(c, r, { x0: -MARGIN, x1: W13 + MARGIN, base: 840, hMin: 14, hMax: 50, step: 130, light: "#e4e2da", dark: "#a9a7ad" });
  for (let i = 0; i < 9; i++) crater2(c, r.range(-MARGIN, W13 + MARGIN), r.range(826, 834), r.range(40, 80), r.range(10, 16));
}
function nearRocks(c, L2) {
  const r = rng(52);
  for (let i = 0; i < 12; i++) boulder(c, r.range(-MARGIN, L2.width + MARGIN), r.range(800, 850), r.range(40, 90), r.range(30, 70));
}
function ground3(c, L2) {
  const topY = (x) => 792 + Math.sin(x / 170) * 6 + Math.sin(x / 61 + 1) * 4;
  const pts2 = [[-MARGIN, BOTTOM + 40]];
  for (let x = -MARGIN; x <= CLIFF; x += 30) pts2.push([x, topY(x)]);
  pts2.push([CLIFF - 20, 900], [CLIFF - 50, 990], [CLIFF - 40, 1060], [CLIFF - 70, 1140], [CLIFF - 70, BOTTOM + 40]);
  poly(c, pts2, "#dcdad2");
  c.save();
  c.fillStyle = "rgba(70,70,84,0.16)";
  c.fillRect(-MARGIN, 900, L2.width + MARGIN * 2, BOTTOM - 900);
  c.restore();
  const face = [
    [CLIFF - 150, 812],
    [CLIFF, 800],
    [CLIFF - 20, 900],
    [CLIFF - 50, 990],
    [CLIFF - 40, 1060],
    [CLIFF - 70, 1140],
    [CLIFF - 70, BOTTOM + 40],
    [CLIFF - 150, BOTTOM + 40]
  ];
  poly(c, face, DEEP);
  hatchPoly(c, face, INK3, 6, 0.25, 0.4);
  c.strokeStyle = "rgba(40,40,52,0.6)";
  c.lineWidth = 2;
  for (const y of [880, 940, 1010, 1090]) {
    c.beginPath();
    c.moveTo(CLIFF - 130, y - 10);
    c.lineTo(CLIFF - 90 - (y - 880) * 0.05, y + 8);
    c.stroke();
  }
  c.strokeStyle = RIM;
  c.lineWidth = 3;
  c.beginPath();
  for (let x = CLIFF - 150; x <= CLIFF; x += 10) (x === CLIFF - 150 ? c.moveTo : c.lineTo).call(c, x, topY(x) + 2);
  c.stroke();
  const r = rng(61);
  crater2(c, 700, 846, 170, 44);
  crater2(c, 1240, 908, 110, 30);
  crater2(c, 2140, 826, 92, 22);
  for (let i = 0; i < 9; i++) crater2(c, r.range(0, CLIFF - 200), r.range(810, 880), r.range(30, 70), r.range(10, 20));
  for (let i = 0; i < 16; i++) boulder(c, r.range(-MARGIN, CLIFF - 120), r.range(900, 1150), r.range(24, 70), r.range(16, 44));
}
function foreground14(c) {
  boulder(c, 60, BOTTOM + 30, 360, 230);
  boulder(c, 300, BOTTOM + 30, 200, 120);
}
var moon2 = {
  id: "moon",
  name: "Moon Surface",
  icon: "\u{1F311}",
  blurb: "Grey-white craters and jagged peaks under a black, starry sky, ending at a cliff that drops into the void.",
  width: W13,
  sky: () => ["#000003", "#0a0b1f"],
  layers: () => [
    { depth: 9e3, emissive: true, band: [-420, BOTTOM], draw: starfield2 },
    { depth: 5e3, fog: 0.25, band: [180, 860], draw: farPeaks },
    { depth: 2800, fog: 0.1, band: [400, 820], draw: midPeaks },
    { depth: 1200, band: [600, 860], draw: horizon },
    { depth: 500, band: [700, 880], draw: nearRocks },
    { depth: 0, band: [740, BOTTOM], draw: ground3 },
    { depth: -380, band: [1020, BOTTOM], draw: foreground14 }
  ],
  marks: { landing: 1300, crater: 700, edge: 2850, centre: 1500 },
  ambience: "space",
  music: "mystery",
  suggest: ["rocket", "satellite", "alien", "flag-mars", "robot-butler", "boulder", "rock", "space-console"]
};

// src/sets/mooncave.ts
var W14 = 3e3;
var ROCK = "#4a3f6b";
var ROCK_LIGHT2 = "#6e6293";
var ROCK_DARK = "#2b2442";
var INK4 = "#120d20";
var DEEP2 = "#0c0918";
var GLOW = "#9d8dff";
var GLOW_PALE = "#c9f3ff";
var STEM2 = "#b7b0d8";
var STEM_SH = "#837aa8";
var CAP = "#8c7bd6";
var GILL = "#5a4e9a";
var TUNNEL_L = 300;
var TUNNEL_R = 2600;
function hatchIn3(c, build, box2, color, gap = 5, slope = 0.5, alpha2 = 0.4) {
  const [x0, y0, x1, y1] = box2;
  c.save();
  c.beginPath();
  build();
  c.clip();
  c.strokeStyle = color;
  c.globalAlpha = alpha2;
  c.lineWidth = 1.1;
  c.beginPath();
  const H = y1 - y0;
  for (let s = x0 - H * slope - gap; s < x1 + gap; s += gap) {
    c.moveTo(s, y0);
    c.lineTo(s + H * slope, y1);
  }
  c.stroke();
  c.restore();
}
function hatchPoly2(c, pts2, color, gap = 5, slope = 0.5, alpha2 = 0.4) {
  const xs = pts2.map((p) => p[0]);
  const ys = pts2.map((p) => p[1]);
  hatchIn3(
    c,
    () => {
      pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
      c.closePath();
    },
    [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    color,
    gap,
    slope,
    alpha2
  );
}
function rockMass(c, r, x0, x1, top, base, col, step = 110, amp = 60) {
  const pts2 = [[x0, base]];
  for (let x = x0; x <= x1; x += step) pts2.push([x, top + r.range(-amp, amp)]);
  pts2.push([x1, base]);
  poly(c, pts2, col);
  const shadowPts = [[x0 + (x1 - x0) * 0.55, base], ...pts2.filter((p) => p[0] >= x0 + (x1 - x0) * 0.55), [x1, base]];
  poly(c, shadowPts, ROCK_DARK);
  hatchPoly2(c, shadowPts, INK4, 6, 0.4, 0.35);
}
function stalactite(c, x, top, len, w, col = ROCK) {
  const tipY = top + len;
  c.beginPath();
  c.moveTo(x - w, top);
  c.quadraticCurveTo(x - w * 0.5, top + len * 0.5, x, tipY);
  c.quadraticCurveTo(x + w * 0.6, top + len * 0.5, x + w, top);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  const shade1 = [[x, top], [x + w, top], [x, tipY]];
  c.beginPath();
  c.moveTo(x, top);
  c.lineTo(x + w, top);
  c.quadraticCurveTo(x + w * 0.6, top + len * 0.5, x, tipY);
  c.closePath();
  c.fillStyle = ROCK_DARK;
  c.fill();
  hatchPoly2(c, shade1, INK4, 4, 0.8, 0.4);
}
function stalagmite(c, x, base, len, w, col = ROCK_LIGHT2) {
  const tipY = base - len;
  c.beginPath();
  c.moveTo(x - w, base);
  c.quadraticCurveTo(x - w * 0.5, base - len * 0.5, x, tipY);
  c.quadraticCurveTo(x + w * 0.6, base - len * 0.5, x + w, base);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  const shadowPts = [[x, tipY], [x + w, base], [x, base]];
  poly(c, shadowPts, ROCK_DARK);
  hatchPoly2(c, shadowPts, INK4, 4, 0.8, 0.4);
}
function mushroom(c, x, base, h) {
  const capY = base - h * 0.62;
  const capRx = h * 0.42;
  const capRy = h * 0.38;
  const stemW = h * 0.09;
  const stem = [
    [x - stemW, base],
    [x - stemW * 0.6, capY],
    [x + stemW * 0.6, capY],
    [x + stemW, base]
  ];
  poly(c, stem, STEM2);
  poly(c, [[x + stemW * 0.1, base], [x + stemW * 0.6, capY], [x + stemW, base]], STEM_SH);
  hatchPoly2(c, [[x + stemW * 0.1, base], [x + stemW * 0.6, capY], [x + stemW, base]], INK4, 3, 0.3, 0.35);
  ellipse(c, x, capY + capRy * 0.05, capRx * 0.96, capRy * 0.22, GILL);
  c.beginPath();
  c.ellipse(x, capY, capRx, capRy, 0, Math.PI, Math.PI * 2);
  c.closePath();
  c.fillStyle = CAP;
  c.fill();
  hatchIn3(
    c,
    () => c.ellipse(x + capRx * 0.25, capY, capRx * 0.85, capRy, 0, Math.PI, Math.PI * 2),
    [x - capRx, capY - capRy, x + capRx, capY],
    INK4,
    5,
    0.5,
    0.3
  );
  c.strokeStyle = shade(CAP, -0.4);
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(x, capY, capRx, capRy, 0, Math.PI, Math.PI * 2);
  c.stroke();
}
function mushroomGlow(c, x, base, h, seed) {
  const r = rng(seed);
  const capY = base - h * 0.62;
  const capRx = h * 0.42;
  const capRy = h * 0.38;
  glow(c, x, capY - capRy * 0.2, capRx * 1.2, GLOW, 0.22);
  for (let i = 0; i < 7; i++) {
    const sx = x + r.range(-0.6, 0.6) * capRx;
    const sy = capY - r.range(0.15, 0.85) * capRy;
    ellipse(c, sx, sy, h * 0.012 + r() * 3, h * 0.01 + r() * 2, GLOW_PALE);
  }
}
function backWall2(c, L2) {
  const r = rng(14);
  c.fillStyle = ROCK_DARK;
  c.fillRect(-MARGIN, -420, L2.width + MARGIN * 2, 1200);
  for (let i = 0; i < 22; i++) {
    const x = r.range(-MARGIN, L2.width + MARGIN);
    const y = r.range(-420, 720);
    const w = r.range(180, 420);
    const h = r.range(120, 260);
    poly(c, [[x, y + h * 0.3], [x + w * 0.3, y], [x + w * 0.8, y + h * 0.1], [x + w, y + h * 0.7], [x + w * 0.5, y + h], [x + w * 0.1, y + h * 0.8]], r.chance(0.5) ? ROCK : "#3a3157");
  }
  ellipse(c, 1500, 300, 1100, 380, DEEP2);
  hatchIn3(c, () => c.ellipse(1500, 300, 1100, 380, 0, 0, Math.PI * 2), [400, -80, 2600, 680], INK4, 12, 0.2, 0.25);
}
function backGlow(c) {
  glow(c, 1500, 420, 1050, "#7c6cff", 0.32);
  glow(c, 600, 620, 520, "#6f9bff", 0.16);
  glow(c, 2400, 620, 520, "#6f9bff", 0.16);
}
function sideWalls(c, L2) {
  const r = rng(26);
  rockMass(c, r, -MARGIN, L2.width + MARGIN, 40, 840, ROCK, 150, 80);
  for (const tx of [TUNNEL_L, TUNNEL_R]) {
    c.beginPath();
    c.moveTo(tx - 190, 840);
    c.lineTo(tx - 190, 300);
    c.arc(tx, 300, 190, Math.PI, 0);
    c.lineTo(tx + 190, 840);
    c.closePath();
    c.fillStyle = ROCK_LIGHT2;
    c.fill();
    c.beginPath();
    c.moveTo(tx - 150, 840);
    c.lineTo(tx - 150, 300);
    c.arc(tx, 300, 150, Math.PI, 0);
    c.lineTo(tx + 150, 840);
    c.closePath();
    c.fillStyle = DEEP2;
    c.fill();
    hatchPoly2(c, [[tx - 150, 840], [tx - 150, 300], [tx + 150, 300], [tx + 150, 840]], INK4, 5, 0.2, 0.3);
  }
}
function tunnelGlow(c) {
  for (const tx of [TUNNEL_L, TUNNEL_R]) {
    glow(c, tx, 520, 230, GLOW, 0.3);
    ellipse(c, tx, 470, 26, 14, GLOW_PALE);
  }
}
function ceiling5(c, L2) {
  const r = rng(38);
  rockMass(c, r, -MARGIN, L2.width + MARGIN, -420, -240, ROCK_DARK, 120, 40);
  for (let x = -MARGIN + 40; x < L2.width + MARGIN; x += r.range(150, 240)) {
    stalactite(c, x, -260, r.range(260, 420), r.range(50, 90), ROCK);
  }
}
function cavern(c, L2) {
  const r = rng(44);
  for (let x = -MARGIN + 60; x < L2.width + MARGIN; x += r.range(220, 330)) {
    stalactite(c, x, -120, r.range(120, 220), r.range(24, 42), ROCK_DARK);
  }
  for (let x = 200; x < L2.width; x += r.range(260, 360)) {
    stalagmite(c, x, 800, r.range(90, 170), r.range(28, 46), ROCK_LIGHT2);
  }
}
var BACK_MUSH = [
  { x: 1500, h: 640 },
  { x: 900, h: 520 },
  { x: 2200, h: 560 }
];
function backMushrooms(c) {
  for (const m of BACK_MUSH) mushroom(c, m.x, 800, m.h);
}
function backMushroomGlow(c) {
  BACK_MUSH.forEach((m, i) => mushroomGlow(c, m.x, 800, m.h, 70 + i));
}
function sideMushrooms(c) {
  mushroom(c, 40, 880, 620);
  mushroom(c, 2960, 880, 600);
}
function sideMushroomGlow(c) {
  mushroomGlow(c, 40, 880, 620, 91);
  mushroomGlow(c, 2960, 880, 600, 92);
}
function floor5(c, L2) {
  const r = rng(58);
  c.fillStyle = "#3a3159";
  c.fillRect(-MARGIN, 740, L2.width + MARGIN * 2, BOTTOM - 740);
  c.strokeStyle = "rgba(15,10,30,0.5)";
  c.lineWidth = 2;
  for (let y = 780; y < BOTTOM; y += 36) {
    c.beginPath();
    c.moveTo(-MARGIN, y);
    for (let x = -MARGIN; x <= L2.width + MARGIN; x += 120) c.lineTo(x, y + r.range(-4, 4));
    c.stroke();
  }
  for (const [px, py, pw] of [[700, 820, 260], [1900, 860, 320], [2500, 1e3, 220]]) {
    ellipse(c, px, py, pw, pw * 0.1, "#7a86c9");
    ellipse(c, px - pw * 0.2, py - 2, pw * 0.5, pw * 0.04, "#b8c4ff");
  }
  for (let i = 0; i < 24; i++) {
    const x = r.range(-MARGIN, L2.width + MARGIN);
    const y = r.range(800, BOTTOM);
    ellipse(c, x, y, 6 + r() * 12, 3 + r() * 6, r.chance(0.5) ? "#5a4f80" : "#2b2442");
  }
}
function nearFloor(c, L2) {
  const r = rng(63);
  stalagmite(c, 1050, 880, 180, 40, ROCK_LIGHT2);
  stalagmite(c, 1960, 900, 230, 46, ROCK_LIGHT2);
  stalagmite(c, 1240, 920, 120, 30, ROCK);
  for (let i = 0; i < 6; i++) {
    const x = r.range(0, L2.width);
    stalagmite(c, x, 1e3 + r() * 80, r.range(60, 110), r.range(20, 30), ROCK);
  }
}
function foreground15(c, L2) {
  stalactite(c, -20, -420, 360, 120, ROCK_DARK);
  stalactite(c, L2.width + 20, -420, 320, 110, ROCK_DARK);
  stalactite(c, 700, -420, 180, 60, ROCK_DARK);
  stalactite(c, 2280, -420, 220, 70, ROCK_DARK);
}
var mooncave = {
  id: "mooncave",
  name: "Moon Grotto",
  icon: "\u{1F344}",
  blurb: "An underground lunar cavern glowing blue-violet, with giant luminous mushrooms, stalactites and tunnel mouths.",
  width: W14,
  sky: () => ["#0a0818", "#1a1538"],
  layers: () => [
    { depth: 8e3, band: [-420, 800], draw: backWall2 },
    { depth: 8e3, emissive: true, band: [-420, 800], draw: (c) => backGlow(c) },
    { depth: 2600, band: [-420, 880], draw: sideWalls },
    { depth: 2600, emissive: true, band: [-420, 880], draw: (c) => tunnelGlow(c) },
    { depth: 1500, band: [-420, 720], draw: cavern },
    { depth: 900, band: [120, 820], draw: (c) => backMushrooms(c) },
    { depth: 900, emissive: true, band: [120, 820], draw: (c) => backMushroomGlow(c) },
    { depth: 350, band: [60, 900], draw: (c) => sideMushrooms(c) },
    { depth: 350, emissive: true, band: [60, 900], draw: (c) => sideMushroomGlow(c) },
    { depth: 300, band: [-420, 240], draw: ceiling5 },
    { depth: 0, band: [740, BOTTOM], draw: floor5 },
    { depth: 0, band: [780, BOTTOM], draw: nearFloor },
    { depth: -380, band: [-420, 320], draw: foreground15 }
  ],
  marks: { "tunnel-left": TUNNEL_L, mushrooms: 1500, "tunnel-right": TUNNEL_R, centre: 1500 },
  ambience: "spooky",
  music: "mystery",
  suggest: ["crystal", "crystal-ball", "mushroom", "alien", "candelabra", "skeleton", "cobweb", "potion-shelf"]
};

// src/sets/selenitepalace.ts
var W15 = 3200;
var WALL5 = "#8f7fa6";
var WALL_DARK = "#5d4f7a";
var RECESS = "#3b3058";
var COL = "#c9b8dc";
var COL_SH = "#8e7fa6";
var FLOOR = "#6e5f8f";
var FLOOR_DARK = "#4a3e66";
var INK5 = "#261d3d";
var TEAL = "#8fe6e0";
var PINK = "#ffb3e6";
var GLOW_TEAL = "#7ff5ea";
var BANNER_RED = "#b5624f";
var BANNER_TEAL = "#4f8f86";
var BANNER_GOLD = "#c9a24a";
var DAIS_X0 = 1140;
var DAIS_X1 = 1860;
function hatchIn4(c, build, box2, color, gap = 5, slope = 0.5, alpha2 = 0.35) {
  const [x0, y0, x1, y1] = box2;
  c.save();
  c.beginPath();
  build();
  c.clip();
  c.strokeStyle = color;
  c.globalAlpha = alpha2;
  c.lineWidth = 1.1;
  c.beginPath();
  const H = y1 - y0;
  for (let s = x0 - H * slope - gap; s < x1 + gap; s += gap) {
    c.moveTo(s, y0);
    c.lineTo(s + H * slope, y1);
  }
  c.stroke();
  c.restore();
}
function hatchPoly3(c, pts2, color, gap = 5, slope = 0.5, alpha2 = 0.35) {
  const xs = pts2.map((p) => p[0]);
  const ys = pts2.map((p) => p[1]);
  hatchIn4(
    c,
    () => {
      pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
      c.closePath();
    },
    [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    color,
    gap,
    slope,
    alpha2
  );
}
function spike(c, x, y, angle, len, w, col) {
  poly(c, [[x - w, y], [x + w, y], [x + Math.cos(angle) * len, y + Math.sin(angle) * len]], col);
}
function spikyArch(c, x, w, spring, top, base, col, recess) {
  const half = w / 2;
  const outline2 = (c2, inset) => {
    c2.moveTo(x - half + inset, base);
    c2.lineTo(x - half + inset, spring);
    c2.quadraticCurveTo(x - half + inset, top + (spring - top) * 0.25, x, top + inset * 1.5);
    c2.quadraticCurveTo(x + half - inset, top + (spring - top) * 0.25, x + half - inset, spring);
    c2.lineTo(x + half - inset, base);
    c2.closePath();
  };
  c.beginPath();
  outline2(c, 0);
  c.fillStyle = col;
  c.fill();
  c.beginPath();
  outline2(c, w * 0.16);
  c.fillStyle = recess;
  c.fill();
  for (const sx of [x - half, x + half]) {
    spike(c, sx, spring + 20, sx < x ? -Math.PI * 0.8 : -Math.PI * 0.2, w * 0.22, 9, col);
    spike(c, sx, spring - 60, sx < x ? -Math.PI * 0.85 : -Math.PI * 0.15, w * 0.18, 8, col);
  }
  spike(c, x, top - 2, -Math.PI / 2, w * 0.32, 12, col);
}
function column(c, r, x, top, base, w) {
  const N = 14;
  const left = [];
  const right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = top + (base - top) * t;
    const half = w * (0.5 + 0.45 * Math.abs(Math.sin(t * Math.PI * 2.5))) * (1 - 0.18 * t);
    left.push([x - half, y]);
    right.push([x + half, y]);
  }
  const body = [...left, ...right.reverse()];
  poly(c, body, COL);
  const shadow = [[x + w * 0.1, top], ...right.slice(0, N + 1).filter((p) => p[0] > x + w * 0.1), [x + w * 0.1, base]];
  poly(c, shadow, COL_SH);
  hatchPoly3(c, shadow, INK5, 4, 0.2, 0.3);
  for (let i = 2; i < N; i += 3) {
    const y = top + (base - top) * (i / N);
    c.strokeStyle = shade(COL, -0.35);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - w * 0.6, y);
    c.quadraticCurveTo(x, y + 6, x + w * 0.6, y);
    c.stroke();
  }
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.42 + r.range(-0.08, 0.08);
    spike(c, x + (k - 2) * w * 0.2, top + 16, a, w * r.range(0.7, 1.05), w * 0.12, COL);
  }
}
function banner3(c, x, top, w, len, col, sigil) {
  c.fillStyle = shade(INK5, 0.1);
  c.fillRect(x - w * 0.6, top - 6, w * 1.2, 8);
  const pts2 = [
    [x - w / 2, top],
    [x + w / 2, top],
    [x + w / 2, top + len],
    [x, top + len - w * 0.28],
    [x - w / 2, top + len]
  ];
  poly(c, pts2, col);
  const right = [[x, top], [x + w / 2, top], [x + w / 2, top + len], [x, top + len - w * 0.28]];
  poly(c, right, shade(col, -0.22));
  hatchPoly3(c, right, INK5, 5, 0.3, 0.25);
  const cy = top + len * 0.35;
  ellipse(c, x, cy, w * 0.32, w * 0.32, sigil);
  ellipse(c, x, cy, w * 0.2, w * 0.2, col);
  ellipse(c, x, cy, w * 0.08, w * 0.08, sigil);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    spike(c, x + Math.cos(a) * w * 0.32, cy + Math.sin(a) * w * 0.32, a, w * 0.22, 3, sigil);
  }
}
function crystals(c, r, x, y, s, col) {
  for (let k = 0; k < 5; k++) {
    const dx = (k - 2) * s * 0.22 + r.range(-s * 0.05, s * 0.05);
    const h = s * r.range(0.55, 1);
    const w = s * 0.11;
    poly(c, [[x + dx - w, y], [x + dx, y - h], [x + dx + w, y]], k % 2 ? col : shade(col, -0.2));
    poly(c, [[x + dx, y - h], [x + dx + w, y], [x + dx + w * 0.2, y]], shade(col, -0.4));
  }
}
function backWall3(c, L2) {
  const r = rng(19);
  c.fillStyle = WALL_DARK;
  c.fillRect(-MARGIN, -420, L2.width + MARGIN * 2, 1260);
  for (let x = -MARGIN; x < L2.width + MARGIN; x += 120) {
    c.fillStyle = r.chance(0.5) ? WALL5 : shade(WALL5, -0.08);
    c.fillRect(x, 120, 60, 720);
  }
  const arches = [
    [300, 360, 240, 800],
    [900, 320, 160, 780],
    [1500, 640, -240, 800],
    [2100, 320, 160, 780],
    [2900, 360, 240, 800]
  ];
  for (const [x, w, top, base] of arches) {
    const spring = top + w * 0.7;
    spikyArch(c, x, w, spring, top, base, COL_SH, RECESS);
  }
  glow(c, 300, 560, 220, "#e9d3ff", 0.18);
  hatchIn4(c, () => c.rect(1220, 120, 560, 700), [1220, 120, 1780, 820], INK5, 10, 0.1, 0.12);
}
function backCrystals(c) {
  const r = rng(23);
  crystals(c, r, 380, 760, 150, TEAL);
  crystals(c, r, 1500, 520, 110, PINK);
  crystals(c, r, 2800, 760, 150, TEAL);
  crystals(c, r, 1030, 820, 90, PINK);
  crystals(c, r, 2250, 820, 90, TEAL);
}
function banners2(c) {
  banner3(c, 620, 40, 120, 420, BANNER_RED, BANNER_GOLD);
  banner3(c, 1700, 20, 110, 440, BANNER_TEAL, BANNER_GOLD);
  banner3(c, 2560, 60, 130, 390, BANNER_GOLD, BANNER_RED);
}
function columns(c) {
  const r = rng(31);
  column(c, r, 150, -260, 880, 58);
  column(c, r, 760, -240, 860, 46);
  column(c, r, 2420, -240, 860, 46);
  column(c, r, 3050, -260, 880, 58);
}
function columnCrystals(c) {
  const r = rng(37);
  glow(c, 760, 560, 200, GLOW_TEAL, 0.25);
  glow(c, 2420, 560, 200, GLOW_TEAL, 0.25);
  crystals(c, r, 760, 856, 120, TEAL);
  crystals(c, r, 2420, 856, 120, PINK);
  crystals(c, r, 150, 880, 90, TEAL);
  crystals(c, r, 3050, 880, 90, PINK);
}
function floor6(c, L2) {
  const vx = 1600;
  c.fillStyle = FLOOR;
  c.fillRect(-MARGIN, 740, L2.width + MARGIN * 2, BOTTOM - 740);
  c.fillStyle = FLOOR_DARK;
  c.fillRect(-MARGIN, 740, L2.width + MARGIN * 2, 14);
  c.strokeStyle = "rgba(38,29,61,0.55)";
  c.lineWidth = 2;
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 240) {
    c.beginPath();
    c.moveTo(vx + (x - vx) * 0.35, 754);
    c.lineTo(x, BOTTOM);
    c.stroke();
  }
  for (let y = 790, row3 = 0; y < BOTTOM; y += 40 + row3 * 8, row3++) {
    c.beginPath();
    c.moveTo(-MARGIN, y);
    c.lineTo(L2.width + MARGIN, y);
    c.stroke();
  }
  const top = [
    [DAIS_X0 + 80, 790],
    [DAIS_X1 - 80, 790],
    [DAIS_X1, 872],
    [DAIS_X0, 872]
  ];
  const face = [
    [DAIS_X0, 872],
    [DAIS_X1, 872],
    [DAIS_X1 + 30, 906],
    [DAIS_X0 - 30, 906]
  ];
  poly(c, face, shade(WALL_DARK, 0.1));
  hatchPoly3(c, face, INK5, 5, 0.2, 0.3);
  poly(c, top, shade(COL, -0.12));
  c.strokeStyle = shade(WALL5, 0.1);
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(DAIS_X0 + 80, 790);
  c.lineTo(DAIS_X1 - 80, 790);
  c.stroke();
  c.strokeStyle = BANNER_GOLD;
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(1500, 830, 230, 20, 0, 0, Math.PI * 2);
  c.stroke();
}
function foreground16(c, L2) {
  spike(c, -20, -420, Math.PI / 2 + 0.25, 360, 60, WALL_DARK);
  spike(c, L2.width + 40, -420, Math.PI / 2 - 0.2, 300, 52, WALL_DARK);
  spike(c, 1260, -420, Math.PI / 2 + 0.05, 180, 30, WALL_DARK);
}
var TOD_LIGHT = ["dusk", "night"];
var selenitepalace = {
  id: "selenitepalace",
  name: "Selenite Palace",
  icon: "\u{1F3F0}",
  blurb: "The throne hall of the moon-people: spiky pale columns and arches, banners, a raised dais and crystals that glow at night.",
  width: W15,
  sky: (tod) => TOD_LIGHT.includes(tod) ? ["#2b2350", "#8c78b0"] : ["#3d3568", "#a08cc4"],
  layers: (tod) => {
    const lit2 = TOD_LIGHT.includes(tod);
    const out = [
      { depth: 1400, band: [-420, 840], draw: backWall3 },
      { depth: 1400, emissive: true, band: [-420, 840], draw: (c) => {
        if (lit2) backCrystals(c);
      } },
      { depth: 900, band: [-420, 860], draw: (c) => banners2(c) },
      { depth: 600, band: [-420, 860], draw: (c) => columns(c) },
      { depth: 600, emissive: true, band: [-420, 860], draw: (c) => {
        if (lit2) columnCrystals(c);
      } },
      { depth: 0, band: [740, BOTTOM], draw: floor6 },
      { depth: -380, band: [-420, 340], draw: foreground16 }
    ];
    return out;
  },
  marks: { throne: 1500, "guard-left": 900, "guard-right": 2100, entrance: 300 },
  ambience: "spooky",
  music: "epic",
  suggest: ["throne", "alien", "robot-butler", "crystal", "crystal-ball", "candelabra", "banner", "tapestry"]
};

// src/sets/seabed.ts
var W16 = 3e3;
var INK6 = "#0e2a33";
var SAND3 = "#dcc79c";
var SAND_DARK2 = "#a99470";
var ROCK2 = "#6c7f84";
var ROCK_LIGHT3 = "#8fa3a5";
var KELP = "#3f7d5e";
var KELP_DARK = "#245244";
var CORAL = ["#d07a6c", "#e09a7e", "#b8708f", "#d9a36a"];
function hatchIn5(c, build, box2, color, gap = 5, slope = 0.5, alpha2 = 0.35) {
  const [x0, y0, x1, y1] = box2;
  c.save();
  c.beginPath();
  build();
  c.clip();
  c.strokeStyle = color;
  c.globalAlpha = alpha2;
  c.lineWidth = 1.1;
  c.beginPath();
  const H = y1 - y0;
  for (let s = x0 - H * slope - gap; s < x1 + gap; s += gap) {
    c.moveTo(s, y0);
    c.lineTo(s + H * slope, y1);
  }
  c.stroke();
  c.restore();
}
function hatchPoly4(c, pts2, color, gap = 5, slope = 0.5, alpha2 = 0.35) {
  const xs = pts2.map((p) => p[0]);
  const ys = pts2.map((p) => p[1]);
  hatchIn5(
    c,
    () => {
      pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
      c.closePath();
    },
    [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    color,
    gap,
    slope,
    alpha2
  );
}
function rock(c, x, y, w, h, col = ROCK2) {
  const body = [
    [x - w / 2, y],
    [x - w * 0.42, y - h * 0.55],
    [x - w * 0.12, y - h],
    [x + w * 0.28, y - h * 0.86],
    [x + w / 2, y]
  ];
  poly(c, body, col);
  const flank = [
    [x - w * 0.12, y - h],
    [x + w * 0.28, y - h * 0.86],
    [x + w / 2, y],
    [x + w * 0.02, y]
  ];
  poly(c, flank, shade(col, -0.25));
  hatchPoly4(c, flank, INK6, 4, 0.6, 0.35);
}
function rays(c, L2, k) {
  if (k <= 0) return;
  const r = rng(12);
  c.save();
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 9; i++) {
    const x0 = r.range(-200, L2.width + 200);
    const w0 = r.range(30, 70);
    const drift = r.range(120, 260);
    const g = c.createLinearGradient(x0, -420, x0 + drift, 900);
    g.addColorStop(0, `rgba(255,250,214,${0.2 * k})`);
    g.addColorStop(0.7, `rgba(255,250,214,${0.06 * k})`);
    g.addColorStop(1, "rgba(255,250,214,0)");
    poly(c, [[x0, -420], [x0 + w0, -420], [x0 + drift + w0 * 2.2, 900], [x0 + drift, 900]], g);
  }
  c.restore();
}
function wreck(c) {
  const x = 2150;
  const y = 780;
  c.save();
  c.translate(x, y);
  c.scale(1.5, 1.5);
  c.translate(-x, -y);
  const hull = [
    [x - 170, y - 60],
    [x + 150, y - 70],
    [x + 200, y - 26],
    [x + 120, y],
    [x - 150, y],
    [x - 200, y - 30]
  ];
  poly(c, hull, "#6b5a4a");
  poly(c, [[x + 30, y - 66], [x + 150, y - 70], [x + 200, y - 26], [x + 120, y], [x + 30, y]], "#4d3f33");
  c.strokeStyle = "rgba(40,30,22,0.7)";
  c.lineWidth = 2;
  for (let i = -3; i <= 3; i++) {
    c.beginPath();
    c.moveTo(x + i * 45, y - 60);
    c.lineTo(x + i * 45 + 6, y - 6);
    c.stroke();
  }
  c.strokeStyle = "#5a4a3c";
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(x - 60, y - 70);
  c.lineTo(x - 96, y - 230);
  c.stroke();
  poly(c, [[x - 92, y - 200], [x - 60, y - 210], [x - 78, y - 150]], "#c9bfa8");
  for (let i = 0; i < 5; i++) {
    c.strokeStyle = KELP;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(x - 120 + i * 60, y - 60);
    c.quadraticCurveTo(x - 110 + i * 60, y - 120, x - 130 + i * 60, y - 150 - i * 6);
    c.stroke();
  }
  c.restore();
}
function farReef(c, L2) {
  const r = rng(35);
  const pts2 = [[-MARGIN, 860]];
  for (let x = -MARGIN; x <= L2.width + MARGIN; x += 60) pts2.push([x, 690 + Math.sin(x / 210) * 40 + Math.sin(x / 73) * 16 + r.range(-10, 10)]);
  pts2.push([L2.width + MARGIN, 860]);
  poly(c, pts2, "#4f6d74");
  for (let x = -MARGIN; x < L2.width + MARGIN; x += r.range(180, 300)) {
    rock(c, x, 820, r.range(120, 240), r.range(80, 150), "#5a7a80");
  }
}
function kelp(c, r, x, base, h, w, col) {
  const phase = r.range(0, 6.28);
  const N = 18;
  const left = [];
  const right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const cx = x + Math.sin(t * 4 + phase) * w * 1.1 * t;
    const y = base - h * t;
    const hw = w * (0.5 + 0.5 * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5)) * (1 - t * 0.5);
    left.push([cx - hw, y]);
    right.push([cx + hw, y]);
  }
  const body = [...left, ...right.reverse()];
  poly(c, body, col);
  const shadow = right.slice(Math.floor(N / 2)).map((p) => [p[0] - w * 0.35, p[1]]);
  poly(c, [...right.slice(Math.floor(N / 2)), ...shadow.slice().reverse()], KELP_DARK);
  for (let i = 3; i < N; i += 2) {
    const [lx, ly] = left[i];
    const [rx, ry] = right[i];
    ellipse(c, lx - w * 0.6, ly - 6, w * 0.7, w * 0.25, col, -0.4);
    ellipse(c, rx + w * 0.6, ry - 10, w * 0.7, w * 0.25, KELP_DARK, 0.4);
  }
}
function coral(c, r, x, base, h, col) {
  const stack2 = [[x, base, -Math.PI / 2 + r.range(-0.15, 0.15), h * 0.32, 0]];
  c.lineCap = "round";
  while (stack2.length) {
    const [sx, sy, a, len, d] = stack2.pop();
    const ex = sx + Math.cos(a) * len;
    const ey = sy + Math.sin(a) * len;
    c.strokeStyle = d > 2 ? shade(col, 0.12) : col;
    c.lineWidth = Math.max(3, h * 0.07 * (1 - d * 0.22));
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(ex, ey);
    c.stroke();
    if (d < 3 && len > 10) {
      stack2.push([ex, ey, a - r.range(0.3, 0.7), len * 0.68, d + 1]);
      stack2.push([ex, ey, a + r.range(0.3, 0.7), len * 0.68, d + 1]);
      if (d === 1 && r.chance(0.5)) stack2.push([ex, ey, a + r.range(-0.2, 0.2), len * 0.5, d + 1]);
    }
  }
}
function backKelp(c, L2) {
  const r = rng(41);
  for (let x = -MARGIN + 60; x < L2.width + MARGIN; x += r.range(180, 260)) {
    kelp(c, r, x, 880, r.range(340, 560), r.range(20, 30), KELP);
  }
}
function backCorals(c, L2) {
  const r = rng(47);
  for (let i = 0; i < 9; i++) {
    const x = r.range(-MARGIN + 80, L2.width + MARGIN - 80);
    coral(c, r, x, 830, r.range(160, 260), r.pick(CORAL));
  }
  for (let i = 0; i < 5; i++) rock(c, r.range(-MARGIN, L2.width + MARGIN), r.range(840, 880), r.range(120, 200), r.range(70, 130), ROCK_LIGHT3);
}
function sandFloor(c, L2) {
  const w = L2.width + MARGIN * 2;
  c.fillStyle = vgrad(c, 760, BOTTOM, [[0, SAND3], [1, SAND_DARK2]]);
  c.fillRect(-MARGIN, 760, w, BOTTOM - 760);
  c.strokeStyle = "rgba(120,96,60,0.35)";
  c.lineWidth = 3;
  for (let y = 800, row3 = 0; y < BOTTOM; y += 28 + row3 * 5, row3++) {
    c.beginPath();
    for (let x = -MARGIN; x <= L2.width + MARGIN; x += 80) {
      const yy = y + Math.sin((x + row3 * 41) / 64) * 4;
      x === -MARGIN ? c.moveTo(x, yy) : c.lineTo(x, yy);
    }
    c.stroke();
  }
  const r = rng(63);
  for (let i = 0; i < 80; i++) ellipse(c, r.range(-MARGIN, L2.width + MARGIN), r.range(800, BOTTOM), 3 + r() * 6, 2 + r() * 3, r.chance(0.5) ? "#8a7757" : "#b9a57c");
}
function frontRocks(c, L2) {
  const r = rng(71);
  rock(c, 260, 930, 240, 160);
  rock(c, 1080, 960, 180, 110, ROCK_LIGHT3);
  rock(c, 2e3, 920, 220, 140);
  rock(c, 2780, 950, 260, 170);
  coral(c, r, 820, 960, 170, CORAL[0]);
  coral(c, r, 2560, 960, 200, CORAL[2]);
}
function bubbles(c) {
  const r = rng(83);
  for (let i = 0; i < 60; i++) {
    const t = r();
    const x = 1360 + Math.sin(t * 9) * 60 * t + r.range(-14, 14);
    const y = 900 - t * 1100 + r.range(-20, 20);
    const s = 4 + r() * 12 * (1 - t * 0.4);
    c.strokeStyle = "rgba(230,250,255,0.85)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, s, 0, Math.PI * 2);
    c.stroke();
    ellipse(c, x - s * 0.35, y - s * 0.35, s * 0.25, s * 0.18, "rgba(255,255,255,0.9)", -0.6);
  }
  for (let i = 0; i < 14; i++) {
    const x = r.range(-MARGIN, W16 + MARGIN);
    const y = r.range(-400, 700);
    const s = r.range(3, 7);
    c.strokeStyle = "rgba(230,250,255,0.6)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x, y, s, 0, Math.PI * 2);
    c.stroke();
  }
}
function foreground17(c, L2) {
  const r = rng(91);
  kelp(c, r, -30, BOTTOM + 40, 620, 46, KELP);
  kelp(c, r, L2.width + 40, BOTTOM + 40, 560, 42, KELP);
}
var LIGHT_LEVEL = { dawn: 0.7, day: 1, dusk: 0.35, night: 0.2 };
var SKY2 = {
  dawn: ["#7fb7c4", "#2b6f80"],
  day: ["#7fd9d0", "#1f7f8f"],
  dusk: ["#3a7a84", "#15434f"],
  night: ["#1c4a62", "#0b2233"]
};
var seabed = {
  id: "seabed",
  name: "Sea Bed",
  icon: "\u{1F41A}",
  blurb: "The ocean floor: light shafts through blue-green water, a sandy bed, coral and swaying kelp, and a far-off sunken wreck.",
  width: W16,
  sky: (tod) => SKY2[tod],
  layers: (tod) => [
    { depth: 2600, emissive: true, band: [-420, 900], draw: (c, L2) => rays(c, L2, LIGHT_LEVEL[tod]) },
    { depth: 3200, fog: 0.2, band: [240, 840], draw: (c) => wreck(c) },
    { depth: 2e3, fog: 0.3, band: [440, 880], draw: farReef },
    { depth: 900, band: [260, 900], draw: backKelp },
    { depth: 600, band: [560, 900], draw: backCorals },
    { depth: 200, band: [-420, 960], draw: (c) => bubbles(c) },
    { depth: 0, band: [740, BOTTOM], draw: sandFloor },
    { depth: 0, band: [820, BOTTOM], draw: frontRocks },
    { depth: -380, band: [-420, BOTTOM], draw: foreground17 }
  ],
  marks: { left: 600, centre: 1500, right: 2400 },
  ambience: "wind",
  music: "mystery",
  suggest: ["treasure-chest", "rock", "boulder", "reeds", "bone-pile", "log"]
};

// src/sets/index.ts
var SETS = [istanbul, apartment, kahvehane, city, bazaar, medieval, ww2, stoneage, skycity, haunted, farm, airplane, mars, observatory, foundry, rooftops, space, moon2, mooncave, selenitepalace, seabed, harbor];
var byId = new Map(SETS.map((s) => [s.id, s]));
var setById = (id) => byId.get(id) ?? istanbul;

// src/props/home.ts
var P = (id, name, cat2, w, h, draw, extra = {}) => ({
  id,
  name,
  cat: cat2,
  w,
  h,
  draw,
  ...extra
});
var WOOD3 = "#9a6334";
var WOOD_D = "#5d3a1e";
var WOOD_L = "#c08a52";
var RED2 = "#c8432f";
var TEAL2 = "#2f8f83";
var MUSTARD = "#e0a526";
var BLUE = "#2f5f9e";
var CREAM5 = "#f3ead2";
var WHITE = "#f6f6f2";
var CHROME = "#c9ccd6";
var BRASS3 = "#d9a441";
var COPPER = "#b8673a";
var GREEN = "#3f8f4f";
var INK7 = "#2b2b33";
var rect5 = (c, x, y, w, h, col) => {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
};
var line4 = (c, pts2, col, lw) => {
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
};
var oval = (c, x, y, rx, ry, col) => {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  c.strokeStyle = shade(col, -0.5);
  c.lineWidth = 2;
  c.stroke();
};
var legs = (c, xs, y0, y1, col = WOOD_D, w = 12) => xs.forEach((x) => rect5(c, x - w / 2, y0, w, y1 - y0, col));
var kilim = (c, x, y, w, h, base, acc, alt = MUSTARD) => {
  rect5(c, x, y, w, h, base);
  rect5(c, x, y + h * 0.1, w, h * 0.1, acc);
  rect5(c, x, y + h * 0.8, w, h * 0.1, acc);
  for (let i = 0; i < 4; i++) {
    const cx = x + w * (0.15 + i * 0.233);
    poly(c, [[cx, y + h * 0.3], [cx + w * 0.05, y + h * 0.5], [cx, y + h * 0.7], [cx - w * 0.05, y + h * 0.5]], i % 2 ? acc : alt);
  }
};
var shine = (c, pts2) => {
  c.fillStyle = "rgba(255,255,255,0.35)";
  poly(c, pts2, "rgba(255,255,255,0.35)");
};
var HOME_PROPS = [
  // ───────────────────────── furniture ─────────────────────────
  P("sofa", "Sofa", "furniture", 420, 190, (c) => {
    floorShadow(c, 400);
    legs(c, [-196, 196], -26, 0, WOOD_D, 14);
    box(c, -170, -150, 340, 100, shade(RED2, -0.06), 14);
    box(c, -212, -124, 52, 112, shade(RED2, -0.1), 16);
    box(c, 160, -124, 52, 112, shade(RED2, -0.1), 16);
    box(c, -212, -80, 424, 64, RED2, 12);
    box(c, -158, -78, 154, 50, shade(RED2, 0.14), 10);
    box(c, 4, -78, 154, 50, shade(RED2, 0.14), 10);
  }),
  P("armchair", "Armchair", "furniture", 200, 200, (c) => {
    floorShadow(c, 190);
    legs(c, [-86, 86], -22, 0, WOOD_D, 12);
    box(c, -74, -196, 148, 120, shade(TEAL2, -0.05), 16);
    box(c, -100, -124, 34, 112, TEAL2, 14);
    box(c, 66, -124, 34, 112, TEAL2, 14);
    box(c, -100, -70, 200, 56, TEAL2, 12);
    box(c, -64, -68, 124, 40, shade(TEAL2, 0.14), 10);
    rect5(c, -60, -180, 16, 60, "rgba(255,255,255,0.18)");
  }),
  P("chair", "Chair", "furniture", 110, 190, (c) => {
    floorShadow(c, 90);
    legs(c, [-40, 40], -92, 0, WOOD_D, 10);
    rect5(c, -50, -90, 100, 6, WOOD_D);
    box(c, -48, -180, 96, 22, WOOD3, 6);
    rect5(c, -44, -160, 9, 66, WOOD3);
    rect5(c, 35, -160, 9, 66, WOOD3);
    box(c, -55, -94, 110, 18, WOOD_L, 6);
    rect5(c, -44, -94, 8, 94, WOOD_D);
  }),
  P("stool", "Stool", "furniture", 80, 120, (c) => {
    floorShadow(c, 70);
    line4(c, [[-28, 0], [-12, -92]], WOOD_D, 8);
    line4(c, [[28, 0], [12, -92]], WOOD_D, 8);
    line4(c, [[0, 0], [0, -92]], shade(WOOD_D, 0.1), 8);
    oval(c, 0, -96, 38, 14, WOOD_L);
    rect5(c, -38, -96, 76, 10, WOOD3);
  }),
  P("dining-table", "Dining table", "furniture", 360, 150, (c) => {
    floorShadow(c, 330);
    legs(c, [-150, 150], -124, 0, WOOD_D, 16);
    rect5(c, -140, -134, 280, 14, shade(WOOD_D, 0.1));
    box(c, -180, -150, 360, 26, WOOD3, 6);
    rect5(c, -180, -128, 360, 6, WOOD_D);
    shine(c, [[-170, -148], [-100, -148], [-130, -126], [-170, -126]]);
  }),
  P("coffee-table", "Coffee table", "furniture", 220, 80, (c) => {
    floorShadow(c, 200);
    legs(c, [-92, 92], -30, 0, WOOD_D, 10);
    rect5(c, -86, -28, 172, 6, WOOD_D);
    box(c, -110, -56, 220, 22, WOOD_L, 6);
    rect5(c, -100, -54, 200, 4, "rgba(0,0,0,0.12)");
    ellipse(c, 40, -66, 14, 10, MUSTARD);
    ellipse(c, 40, -64, 9, 6, shade(MUSTARD, -0.2));
  }),
  P("desk", "Desk", "furniture", 300, 160, (c) => {
    floorShadow(c, 280);
    legs(c, [-136, 136], -110, 0, WOOD_D, 14);
    box(c, -150, -128, 300, 22, WOOD3, 6);
    box(c, -140, -108, 100, 108, WOOD_L, 4);
    box(c, 40, -108, 100, 108, WOOD_L, 4);
    for (let i = 0; i < 3; i++) {
      rect5(c, -116, -100 + i * 34, 52, 2.5, WOOD_D);
      rect5(c, 64, -100 + i * 34, 52, 2.5, WOOD_D);
    }
    rect5(c, -28, -40, 16, 4, WOOD_D);
  }),
  P("bed", "Bed", "furniture", 420, 200, (c) => {
    floorShadow(c, 400);
    legs(c, [-196, 196], -22, 0, WOOD_D, 14);
    box(c, -210, -130, 16, 130, WOOD3, 6);
    box(c, -196, -90, 392, 52, WOOD_L, 6);
    box(c, -190, -100, 370, 46, WHITE, 10);
    box(c, -58, -102, 110, 24, WHITE, 10);
    box(c, -18, -96, 210, 40, BLUE, 8);
    rect5(c, -18, -96, 210, 6, shade(BLUE, 0.2));
  }),
  P("bookshelf", "Bookshelf", "furniture", 220, 380, (c) => {
    floorShadow(c, 200);
    box(c, -110, -380, 220, 380, WOOD3, 6);
    rect5(c, -96, -364, 192, 350, WOOD_D);
    const cols = [RED2, TEAL2, MUSTARD, BLUE, CREAM5, GREEN];
    for (let s = 0; s < 4; s++) {
      const top = -364 + s * 88;
      let x = -92;
      for (let b = 0; x < 88; b++) {
        const bw = 9 + (b * 7 + s * 3) % 5;
        const bh = 60 + (b * 13 + s) % 16;
        rect5(c, x, top + 84 - bh, bw - 1, bh, cols[(b + s) % cols.length]);
        x += bw;
      }
      rect5(c, -96, top + 84, 192, 6, WOOD3);
    }
  }),
  P("wardrobe", "Wardrobe", "furniture", 220, 420, (c) => {
    floorShadow(c, 210);
    rect5(c, -100, -6, 200, 6, WOOD_D);
    box(c, -110, -420, 220, 420, WOOD_L, 6);
    rect5(c, -96, -404, 88, 380, WOOD3);
    rect5(c, 8, -404, 88, 380, WOOD3);
    rect5(c, -90, -398, 76, 368, WOOD_L);
    rect5(c, 14, -398, 76, 368, WOOD_L);
    rect5(c, -96, -404, 88, 10, "rgba(255,255,255,0.15)");
    disc(c, -20, -220, 6, BRASS3);
    disc(c, 20, -220, 6, BRASS3);
    box(c, -110, -430, 220, 12, WOOD3, 4);
  }),
  P("dresser", "Dresser", "furniture", 220, 200, (c) => {
    floorShadow(c, 210);
    legs(c, [-96, 96], -22, 0, WOOD_D, 12);
    box(c, -110, -200, 220, 178, WOOD3, 6);
    for (let r = 0; r < 3; r++) {
      const y = -190 + r * 56;
      rect5(c, -100, y, 200, 48, WOOD_L);
      rect5(c, -100, y + 46, 200, 2, WOOD_D);
      disc(c, 0, y + 22, 4.5, BRASS3);
    }
    rect5(c, -110, -200, 220, 6, "rgba(255,255,255,0.18)");
  }),
  P("rug", "Rug", "furniture", 400, 20, (c) => {
    c.beginPath();
    rrect(c, -200, -20, 400, 20, 6);
    c.fillStyle = RED2;
    c.fill();
    c.strokeStyle = shade(RED2, -0.5);
    c.lineWidth = 2;
    c.stroke();
    rect5(c, -190, -16, 380, 3, MUSTARD);
    rect5(c, -190, -6, 380, 3, MUSTARD);
    for (let i = 0; i < 8; i++) {
      const x = -170 + i * 48;
      poly(c, [[x, -10], [x + 10, -15], [x + 20, -10], [x + 10, -5]], i % 2 ? TEAL2 : CREAM5);
    }
  }),
  P("floor-lamp", "Floor lamp", "furniture", 90, 330, (c) => {
    floorShadow(c, 60);
    rect5(c, -2.5, -270, 5, 260, CHROME);
    oval(c, 0, -4, 34, 9, CHROME);
    poly(c, [[-40, -330], [40, -330], [22, -262], [-22, -262]], MUSTARD);
    poly(c, [[10, -330], [40, -330], [22, -262], [12, -262]], shade(MUSTARD, -0.15));
    rect5(c, -40, -332, 80, 5, shade(MUSTARD, 0.2));
  }),
  P("table-lamp", "Table lamp", "furniture", 60, 110, (c) => {
    floorShadow(c, 40, -2, 0.18);
    poly(c, [[-14, -40], [14, -40], [22, -2], [-22, -2]], COPPER);
    poly(c, [[6, -40], [14, -40], [22, -2], [8, -2]], shade(COPPER, -0.2));
    rect5(c, -2, -62, 4, 24, shade(COPPER, -0.2));
    poly(c, [[-28, -62], [28, -62], [16, -102], [-16, -102]], CREAM5);
    poly(c, [[8, -62], [28, -62], [16, -102], [10, -102]], shade(CREAM5, -0.12));
  }),
  P("chandelier", "Chandelier", "furniture", 220, 200, (c) => {
    floorShadow(c, 120);
    rect5(c, -3, -150, 6, 140, BRASS3);
    oval(c, 0, -4, 46, 10, BRASS3);
    rect5(c, -90, -156, 180, 6, BRASS3);
    for (const x of [-90, -45, 0, 45, 90]) {
      rect5(c, x - 2, -170, 4, 16, BRASS3);
      rect5(c, x - 6, -158, 12, 20, CREAM5);
      poly(c, [[x - 4, -170], [x + 4, -170], [x, -182]], "#ffe9a8");
    }
    poly(c, [[-100, -158], [-80, -150], [-120, -110]], "rgba(200,230,255,0.6)");
    for (const x of [-90, 90]) poly(c, [[x - 6, -150], [x + 6, -150], [x, -128]], "rgba(200,230,255,0.7)");
    glow(c, 0, -170, 70, "#ffd77a", 0.4);
  }),
  P("fireplace", "Fireplace", "furniture", 300, 300, (c) => {
    floorShadow(c, 280);
    box(c, -150, -300, 300, 300, "#d9ccb0", 4);
    rect5(c, -150, -300, 300, 6, "rgba(255,255,255,0.3)");
    box(c, -150, -230, 300, 14, WOOD_D, 4);
    rect5(c, -120, -212, 240, 4, "rgba(0,0,0,0.2)");
    rect5(c, -100, -170, 200, 168, "#3a2a24");
    rect5(c, -90, -40, 180, 28, "#4b3830");
    poly(c, [[-40, -40], [-22, -110], [-8, -60], [0, -130], [12, -60], [30, -110], [40, -40]], "#ff8a2a");
    poly(c, [[-18, -40], [-6, -90], [4, -60], [10, -40]], "#ffd24a");
    glow(c, 0, -80, 130, "#ff8a2a", 0.45);
    rect5(c, -150, -86, 300, 4, "rgba(0,0,0,0.2)");
    rect5(c, -160, 0, 320, 0.1, INK7);
  }),
  P("piano", "Piano", "furniture", 340, 280, (c) => {
    floorShadow(c, 320);
    legs(c, [-150, 150], -40, 0, "#1a1a20", 14);
    box(c, -170, -150, 340, 40, "#1d1d24", 6);
    rect5(c, -160, -150, 320, 4, "#3a3a46");
    box(c, -160, -110, 320, 80, "#23232b", 6);
    rect5(c, -150, -88, 300, 42, WHITE);
    for (let x = -150; x < 150; x += 12) rect5(c, x, -88, 1.5, 42, "#9a9aa6");
    for (let x = -144; x < 150; x += 24) rect5(c, x, -88, 9, 24, "#222");
    box(c, -90, -190, 180, 36, "#1d1d24", 4);
    rect5(c, -80, -184, 160, 22, WHITE);
    disc(c, -100, -60, 0.1, BRASS3);
    rect5(c, -150, -20, 300, 4, "rgba(0,0,0,0.2)");
  }),
  P("grandfather-clock", "Grandfather clock", "furniture", 110, 420, (c) => {
    floorShadow(c, 90);
    poly(c, [[-46, -330], [46, -330], [56, 0], [-56, 0]], WOOD3);
    poly(c, [[10, -330], [46, -330], [56, 0], [18, 0]], shade(WOOD3, -0.15));
    box(c, -44, -420, 88, 90, WOOD_L, 10);
    rect5(c, -36, -408, 72, 74, "#2a1c14");
    rect5(c, -18, -360, 36, 50, "#f2e6b8");
    rect5(c, -4, -354, 2, 22, INK7);
    rect5(c, -4, -340, 14, 2, INK7);
    box(c, -36, -224, 72, 76, "#2a1c14", 6);
    disc(c, -22, -340, 0.1, BRASS3);
    disc(c, 0, -180, 14, BRASS3);
    disc(c, 0, -180, 6, shade(BRASS3, -0.3));
    rect5(c, -46, -150, 92, 4, BRASS3);
    rect5(c, -56, -4, 112, 4, WOOD_D);
  }),
  P("door", "Door", "furniture", 200, 420, (c) => {
    box(c, -110, -420, 220, 420, "#d9ccb0", 4);
    rect5(c, -96, -420, 192, 14, "#c9bb9c");
    rect5(c, -96, -406, 192, 406, RED2);
    rect5(c, -90, -400, 180, 394, shade(RED2, -0.06));
    for (const [y, h] of [[-390, 130], [-240, 140], [-86, 70]]) {
      rect5(c, -66, y, 52, h, shade(RED2, -0.18));
      rect5(c, 14, y, 52, h, shade(RED2, -0.18));
    }
    rect5(c, -90, -400, 180, 6, shade(RED2, 0.15));
    disc(c, 60, -190, 8, BRASS3);
    rect5(c, -80, 0, 160, 0.1, INK7);
  }),
  P("window-frame", "Window", "furniture", 220, 260, (c) => {
    rect5(c, -110, -260, 220, 260, "#d9ccb0");
    rect5(c, -110, -260, 220, 6, "rgba(255,255,255,0.3)");
    windowPane(c, -88, -234, 176, 200, WHITE, false, "#9fd2ee");
    rect5(c, -120, -34, 240, 14, "#eadfc4");
    rect5(c, -120, -34, 240, 3, shade("#eadfc4", -0.2));
  }),
  P("curtain", "Curtain", "furniture", 160, 420, (c) => {
    rect5(c, -86, -404, 172, 8, BRASS3);
    disc(c, -86, -400, 6, BRASS3);
    disc(c, 86, -400, 6, BRASS3);
    const drape = (x0, x1) => {
      c.beginPath();
      c.moveTo(x0, -396);
      c.lineTo(x1, -396);
      c.bezierCurveTo(x1 + 8, -200, x1 + 4, -100, x1 + 10, 0);
      c.lineTo(x0 - 10, 0);
      c.bezierCurveTo(x0 - 4, -100, x0 - 8, -200, x0, -396);
      c.fillStyle = RED2;
      c.fill();
      c.strokeStyle = shade(RED2, -0.5);
      c.lineWidth = 2.5;
      c.stroke();
      for (let i = 1; i < 4; i++) {
        const x = x0 + (x1 - x0) * i / 4;
        line4(c, [[x, -380], [x + (i % 2 ? 4 : -4), -200], [x, -10]], shade(RED2, -0.25), 4);
      }
    };
    drape(-78, -6);
    drape(6, 78);
    rect5(c, -86, -10, 172, 10, MUSTARD);
  }, { idle: "sway" }),
  P("coat-rack", "Coat rack", "furniture", 100, 330, (c) => {
    floorShadow(c, 90);
    oval(c, 0, -6, 44, 10, WOOD_D);
    rect5(c, -3, -300, 6, 300, WOOD_D);
    disc(c, 0, -300, 7, WOOD3);
    for (const a of [-1, 1]) line4(c, [[0, -290], [a * 36, -270]], WOOD_D, 5);
    for (const a of [-1, 1]) disc(c, a * 36, -268, 4, WOOD_D);
    poly(c, [[-22, -260], [22, -260], [30, -170], [-30, -170]], TEAL2);
    poly(c, [[10, -260], [22, -260], [30, -170], [14, -170]], shade(TEAL2, -0.2));
    disc(c, 0, -266, 6, shade(TEAL2, -0.3));
  }),
  P("cradle", "Cradle", "furniture", 160, 140, (c) => {
    floorShadow(c, 140);
    c.beginPath();
    c.moveTo(-74, -10);
    c.quadraticCurveTo(0, -30, 74, -10);
    c.strokeStyle = WOOD_D;
    c.lineWidth = 10;
    c.lineCap = "round";
    c.stroke();
    box(c, -60, -90, 120, 52, WOOD_L, 14);
    rect5(c, -48, -86, 96, 44, WOOD3);
    rect5(c, -60, -92, 120, 6, WOOD_D);
    poly(c, [[-62, -90], [-40, -140], [40, -140], [62, -90]], CREAM5);
    poly(c, [[10, -90], [40, -140], [62, -90]], shade(CREAM5, -0.12));
    box(c, -36, -86, 72, 26, TEAL2, 10);
  }),
  P("divan", "Divan", "furniture", 400, 130, (c) => {
    floorShadow(c, 390);
    legs(c, [-184, 184], -20, 0, WOOD_D, 12);
    box(c, -200, -92, 400, 74, shade(RED2, -0.02), 22);
    box(c, -200, -102, 400, 26, RED2, 14);
    kilim(c, -186, -88, 150, 56, CREAM5, RED2, TEAL2);
    kilim(c, 36, -88, 150, 56, CREAM5, TEAL2, MUSTARD);
    box(c, -200, -100, 400, 12, shade(RED2, 0.15), 6);
  }),
  // ───────────────────────── home ─────────────────────────
  P("tv-retro", "Retro TV", "home", 140, 140, (c) => {
    floorShadow(c, 120);
    box(c, -68, -120, 136, 112, WOOD3, 14);
    rect5(c, -56, -108, 92, 84, "#3a3a46");
    rrect(c, -50, -102, 80, 72, 22);
    c.fillStyle = "#7fb3a8";
    c.fill();
    rect5(c, -44, -96, 40, 8, "rgba(255,255,255,0.35)");
    rect5(c, -32, -60, 60, 3, "rgba(255,255,255,0.25)");
    box(c, -36, -18, 80, 4, WOOD_D, 1);
    disc(c, 50, -86, 6, BRASS3);
    disc(c, 50, -64, 6, BRASS3);
    disc(c, 50, -42, 6, BRASS3);
    line4(c, [[-6, -120], [-30, -140]], INK7, 3);
    line4(c, [[6, -120], [30, -140]], INK7, 3);
    disc(c, -30, -142, 3, INK7);
    disc(c, 30, -142, 3, INK7);
    rect5(c, -20, -8, 10, 8, WOOD_D);
    rect5(c, 10, -8, 10, 8, WOOD_D);
  }),
  P("radio-old", "Old radio", "home", 120, 90, (c) => {
    floorShadow(c, 100);
    box(c, -60, -90, 120, 74, WOOD3, 14);
    rect5(c, -48, -78, 60, 50, "#d9b25f");
    for (let i = 0; i < 6; i++) rect5(c, -44, -74 + i * 8, 52, 2.5, shade("#d9b25f", -0.35));
    disc(c, 32, -50, 13, CREAM5);
    rect5(c, 30, -51, 14, 2, INK7);
    disc(c, 32, -22, 3, RED2);
    rect5(c, -62, -24, 124, 8, WOOD_D);
  }),
  P("phonograph", "Phonograph", "home", 110, 160, (c) => {
    floorShadow(c, 100);
    box(c, -50, -62, 100, 60, WOOD_D, 6);
    rect5(c, -50, -62, 100, 4, WOOD_L);
    oval(c, 0, -62, 36, 8, "#2a2a30");
    disc(c, 0, -62, 4, BRASS3);
    line4(c, [[30, -62], [42, -80], [38, -90]], CHROME, 3);
    c.beginPath();
    c.moveTo(-8, -66);
    c.lineTo(-20, -118);
    c.quadraticCurveTo(-4, -146, 28, -150);
    c.lineTo(34, -140);
    c.quadraticCurveTo(0, -132, -3, -70);
    c.closePath();
    c.fillStyle = BRASS3;
    c.fill();
    c.strokeStyle = shade(BRASS3, -0.5);
    c.lineWidth = 2;
    c.stroke();
    oval(c, 30, -144, 12, 6, shade(BRASS3, 0.15));
    rect5(c, -6, -66, 6, 6, WOOD_D);
  }),
  P("telephone-rotary", "Rotary telephone", "home", 60, 50, (c) => {
    floorShadow(c, 50, 0, 0.18);
    box(c, -26, -22, 52, 22, RED2, 6);
    rrect(c, -26, -40, 52, 14, 6);
    c.fillStyle = shade(RED2, -0.1);
    c.fill();
    disc(c, 0, -22, 14, "#eeeeea");
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.6;
      disc(c, Math.cos(a) * 8, -22 + Math.sin(a) * 8, 2.4, INK7, false);
    }
    rect5(c, -26, -26, 52, 4, shade(RED2, 0.15));
    rrect(c, -20, -50, 40, 10, 4);
    c.fillStyle = INK7;
    c.fill();
  }),
  P("wall-clock", "Wall clock", "home", 70, 70, (c) => {
    disc(c, 0, -35, 34, WOOD3, true);
    disc(c, 0, -35, 28, CREAM5, false);
    c.strokeStyle = INK7;
    c.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      line4(c, [[Math.cos(a) * 22 - 0, -35 + Math.sin(a) * 22], [Math.cos(a) * 25, -35 + Math.sin(a) * 25]], INK7, 2);
    }
    line4(c, [[0, -35], [0, -50]], INK7, 3);
    line4(c, [[0, -35], [14, -30]], RED2, 2.5);
    disc(c, 0, -35, 3, INK7);
  }),
  P("mirror", "Standing mirror", "home", 120, 260, (c) => {
    floorShadow(c, 100);
    legs(c, [-40, 40], -20, 0, WOOD_D, 10);
    rect5(c, -62, -244, 124, 230, BRASS3);
    rect5(c, -54, -236, 108, 214, "#b9d8e6");
    poly(c, [[-40, -236], [-10, -236], [-50, -180], [-54, -190]], "rgba(255,255,255,0.6)");
    poly(c, [[-18, -236], [0, -236], [-42, -150], [-54, -160]], "rgba(255,255,255,0.4)");
    rect5(c, -62, -18, 124, 0.1, INK7);
  }),
  P("painting", "Painting", "home", 200, 160, (c) => {
    rect5(c, -100, -160, 200, 160, "#8a5a2a");
    rect5(c, -90, -150, 180, 140, "#e8dcc0");
    rect5(c, -90, -150, 180, 80, "#9fd2ee");
    oval(c, 50, -110, 14, 14, MUSTARD);
    poly(c, [[-90, -70], [-40, -110], [0, -80], [40, -120], [90, -70], [90, -10], [-90, -10]], "#3f8f4f");
    poly(c, [[-90, -60], [-40, -100], [-20, -90], [-60, -40], [-90, -40]], "#2d6b3a");
    rect5(c, -90, -18, 180, 8, "#2e6e9e");
  }),
  P("plant-pot", "Plant pot", "home", 110, 200, (c) => {
    floorShadow(c, 80);
    poly(c, [[-38, -62], [38, -62], [28, 0], [-28, 0]], COPPER);
    poly(c, [[10, -62], [38, -62], [28, 0], [16, 0]], shade(COPPER, -0.2));
    rect5(c, -44, -70, 88, 12, shade(COPPER, 0.1));
    rect5(c, -2, -150, 4, 84, "#4a7a3a");
    const leaves = [
      [-30, -110, -0.9, 34],
      [30, -120, 0.8, 36],
      [-22, -146, -0.6, 32],
      [24, -150, 0.7, 30],
      [0, -180, 0, 34],
      [-6, -130, -1.4, 26],
      [8, -90, 1.3, 26]
    ];
    for (const [x, y, a, s] of leaves) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.beginPath();
      c.ellipse(0, -s * 0.5, s * 0.3, s * 0.55, 0, 0, Math.PI * 2);
      c.fillStyle = GREEN;
      c.fill();
      c.strokeStyle = shade(GREEN, -0.5);
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
    }
    rect5(c, -18, -150, 2, 10, "#3e6a2f");
  }),
  P("stove", "Stove", "home", 180, 190, (c) => {
    floorShadow(c, 170);
    box(c, -90, -190, 180, 190, "#e9e6dc", 8);
    rect5(c, -90, -186, 180, 16, "#cfcbbd");
    rect5(c, -90, -170, 180, 2, shade("#cfcbbd", -0.2));
    for (const [x, y] of [[-44, -120], [44, -120]]) oval(c, x, y, 20, 10, "#2a2a30");
    rect5(c, -62, -108, 124, 2, "#9a9aa6");
    disc(c, -60, -150, 5, INK7);
    disc(c, -36, -150, 5, INK7);
    disc(c, 36, -150, 5, INK7);
    disc(c, 60, -150, 5, INK7);
    rect5(c, -70, -92, 140, 74, "#2a2a30");
    rect5(c, -62, -84, 124, 58, "#3a3a46");
    rect5(c, -48, -78, 96, 40, "rgba(255,190,90,0.5)");
    rect5(c, -62, -18, 124, 8, shade("#e9e6dc", -0.3));
    rect5(c, -80, -12, 16, 12, "#2a2a30");
    rect5(c, 64, -12, 16, 12, "#2a2a30");
  }),
  P("fridge", "Fridge", "home", 160, 360, (c) => {
    floorShadow(c, 150);
    box(c, -80, -360, 160, 360, "#eaf0f2", 12);
    rect5(c, -80, -226, 160, 3, "#9aa6ae");
    rect5(c, -72, -352, 144, 6, "rgba(255,255,255,0.7)");
    rect5(c, 56, -330, 10, 90, "#9aa6ae");
    rect5(c, 56, -222, 10, 180, "#9aa6ae");
    rect5(c, -62, -200, 2, 40, "rgba(255,255,255,0.2)");
    rect5(c, -44, -100, 88, 20, "rgba(0,0,0,0.04)");
    disc(c, -20, -190, 6, RED2, false);
  }),
  P("kitchen-counter", "Kitchen counter", "home", 300, 190, (c) => {
    floorShadow(c, 290);
    box(c, -150, -170, 300, 170, "#e7d7b3", 4);
    rect5(c, -150, -10, 300, 10, WOOD_D);
    rect5(c, -140, -162, 130, 140, shade("#e7d7b3", -0.06));
    rect5(c, 10, -162, 130, 140, shade("#e7d7b3", -0.06));
    for (const x of [-132, 18]) rect5(c, x, -162, 2, 140, shade("#e7d7b3", -0.3));
    disc(c, -76, -96, 5, BRASS3);
    disc(c, 76, -96, 5, BRASS3);
    box(c, -160, -186, 320, 22, "#8c6a4f", 4);
    rect5(c, -150, -186, 300, 4, "rgba(255,255,255,0.3)");
    poly(c, [[-110, -186], [-70, -186], [-68, -230], [-112, -230]], "#b8b8c0");
    rect5(c, -112, -228, 42, 4, "#9a9aa6");
    rect5(c, -60, -210, 12, 10, RED2);
  }),
  P("sink", "Kitchen sink", "home", 160, 190, (c) => {
    floorShadow(c, 150);
    box(c, -80, -150, 160, 150, "#e7d7b3", 4);
    rect5(c, -80, -8, 160, 8, WOOD_D);
    rect5(c, -76, -140, 2, 130, shade("#e7d7b3", -0.3));
    box(c, -86, -162, 172, 16, "#8c6a4f", 4);
    rrect(c, -58, -172, 116, 12, 4);
    c.fillStyle = "#c9ccd6";
    c.fill();
    c.beginPath();
    rrect(c, -50, -170, 100, 6, 3);
    c.fillStyle = "#6d7480";
    c.fill();
    c.fillStyle = "#6d7480";
    c.fill();
    line4(c, [[0, -162], [0, -190], [22, -190], [22, -176]], CHROME, 6);
    disc(c, 22, -174, 4, CHROME);
    disc(c, 52, -110, 3, "#6d7480");
  }),
  P("samovar", "Samovar", "home", 90, 170, (c) => {
    floorShadow(c, 80);
    oval(c, 0, -6, 34, 6, shade(BRASS3, -0.2));
    box(c, -30, -110, 60, 104, BRASS3, 22);
    rect5(c, -26, -106, 12, 96, shade(BRASS3, 0.3));
    rect5(c, -10, -6, 6, 2, WOOD_D);
    line4(c, [[30, -66], [48, -58], [46, -42]], shade(BRASS3, -0.2), 5);
    rect5(c, 40, -46, 12, 10, shade(BRASS3, -0.2));
    rect5(c, -36, -62, 72, 3, shade(BRASS3, -0.35));
    rect5(c, -34, -88, 68, 3, shade(BRASS3, -0.35));
    rect5(c, -20, -130, 40, 22, BRASS3);
    disc(c, 0, -134, 16, shade(BRASS3, 0.1));
    c.beginPath();
    c.arc(-38, -104, 8, Math.PI * 0.5, Math.PI * 1.5);
    c.arc(38, -104, 8, Math.PI * 1.5, Math.PI * 2.5);
    c.strokeStyle = shade(BRASS3, -0.4);
    c.lineWidth = 3;
    c.stroke();
    poly(c, [[-14, -152], [14, -152], [10, -168], [-10, -168]], COPPER);
    disc(c, 0, -170, 6, shade(COPPER, 0.1));
    line4(c, [[-14, -158], [-24, -168]], COPPER, 3);
    rect5(c, -20, -153, 40, 3, shade(COPPER, -0.25));
  }),
  P("typewriter", "Typewriter", "home", 110, 70, (c) => {
    floorShadow(c, 100);
    rect5(c, -28, -66, 56, 14, WHITE);
    for (let i = 0; i < 4; i++) rect5(c, -22, -62 + i * 3.5, 44, 1, "#8a8a92");
    box(c, -50, -46, 100, 22, "#2e3038", 6);
    rect5(c, -44, -34, 88, 2.5, shade("#2e3038", 0.4));
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 8; k++) disc(c, -38 + k * 11 + r * 3, -40 + r * 6, 2.6, CREAM5, false);
    }
    rect5(c, -52, -24, 104, 8, "#1c1d22");
    rect5(c, -40, -16, 80, 16, "#1c1d22");
  }),
  P("sewing-machine", "Sewing machine", "home", 130, 110, (c) => {
    floorShadow(c, 120);
    box(c, -60, -30, 120, 30, "#1f1f26", 8);
    rect5(c, -58, -22, 116, 6, BRASS3);
    box(c, -58, -92, 46, 64, "#1f1f26", 10);
    rrect(c, -40, -100, 40, 14, 6);
    c.fillStyle = "#1f1f26";
    c.fill();
    disc(c, 30, -40, 22, "#1f1f26", false);
    disc(c, 30, -40, 10, BRASS3, true);
    rect5(c, -8, -64, 8, 36, "#1f1f26");
    rect5(c, -28, -64, 26, 2.5, BRASS3);
    rect5(c, -48, -78, 10, 10, RED2);
    line4(c, [[-40, -70], [-18, -70], [-14, -54]], BRASS3, 2.5);
    line4(c, [[-26, -52], [-26, -22]], CHROME, 2);
  }),
  P("suitcase", "Suitcase", "home", 140, 110, (c) => {
    floorShadow(c, 130);
    rrect(c, -40, -108, 80, 14, 6);
    c.strokeStyle = shade(COPPER, -0.2);
    c.lineWidth = 6;
    c.stroke();
    box(c, -70, -96, 140, 96, COPPER, 10);
    rect5(c, -60, -90, 120, 3, shade(COPPER, 0.2));
    rect5(c, -70, -48, 140, 10, shade(COPPER, -0.25));
    rect5(c, -48, -96, 8, 96, shade(COPPER, -0.15));
    rect5(c, 40, -96, 8, 96, shade(COPPER, -0.15));
    rect5(c, -6, -110, 0.1, 0.1, INK7);
    disc(c, -62, -22, 4, BRASS3);
    disc(c, 62, -22, 4, BRASS3);
    rect5(c, -70, -8, 140, 8, WOOD_D);
    box(c, -6, -36, 12, 14, BRASS3, 2);
  }),
  P("umbrella", "Umbrella", "home", 60, 200, (c) => {
    floorShadow(c, 30, 0, 0.14);
    rect5(c, -1.5, -200, 3, 196, CHROME);
    poly(c, [[-14, -180], [14, -180], [6, -150], [-6, -150]], RED2);
    c.beginPath();
    c.moveTo(-9, -178);
    c.quadraticCurveTo(0, -200, 9, -178);
    c.lineTo(10, -158);
    c.quadraticCurveTo(0, -162, -10, -158);
    c.closePath();
    c.fillStyle = RED2;
    c.fill();
    c.strokeStyle = shade(RED2, -0.5);
    c.lineWidth = 2;
    c.stroke();
    line4(c, [[2, -192], [4, -158]], shade(RED2, -0.4), 1.5);
    c.beginPath();
    c.arc(-6, -202, 6, Math.PI * 0.2, Math.PI * 1.2, false);
    c.strokeStyle = WOOD_D;
    c.lineWidth = 4;
    c.stroke();
    rect5(c, -1.5, -200, 3, 4, WOOD_D);
    rect5(c, -6, -2, 12, 2, shade(CHROME, -0.4));
  }),
  P("broom", "Broom", "home", 50, 280, (c) => {
    floorShadow(c, 40, 0, 0.14);
    rect5(c, -2.5, -260, 5, 260, WOOD_L);
    c.beginPath();
    c.moveTo(-22, -40);
    c.lineTo(-18, -4);
    c.lineTo(18, -4);
    c.lineTo(22, -40);
    c.closePath();
    c.fillStyle = MUSTARD;
    c.fill();
    c.strokeStyle = shade(MUSTARD, -0.5);
    c.lineWidth = 2;
    c.stroke();
    for (let x = -14; x <= 14; x += 7) line4(c, [[x, -36], [x * 1.1, -6]], shade(MUSTARD, -0.25), 1.5);
    box(c, -18, -54, 36, 16, WOOD_D, 4);
    rect5(c, -20, -54, 40, 3, shade(WOOD_D, 0.2));
    disc(c, 0, -262, 3, WOOD_D);
  }),
  P("bucket", "Bucket", "home", 70, 70, (c) => {
    floorShadow(c, 60);
    c.beginPath();
    c.arc(0, -56, 26, Math.PI * 1.05, Math.PI * 1.95, false);
    c.strokeStyle = CHROME;
    c.lineWidth = 3;
    c.stroke();
    poly(c, [[-30, -60], [30, -60], [22, 0], [-22, 0]], "#3f7fb8");
    poly(c, [[12, -60], [30, -60], [22, 0], [14, 0]], shade("#3f7fb8", -0.2));
    rect5(c, -32, -62, 64, 6, shade("#3f7fb8", 0.2));
    rect5(c, -26, -40, 52, 3, CHROME);
    rect5(c, -26, -20, 52, 3, CHROME);
  }),
  P("laundry-basket", "Laundry basket", "home", 100, 80, (c) => {
    floorShadow(c, 90);
    box(c, -26, -76, 22, 40, TEAL2, 6);
    box(c, 6, -82, 24, 46, MUSTARD, 6);
    poly(c, [[-50, -48], [50, -48], [40, 0], [-40, 0]], "#c49a5a");
    poly(c, [[20, -48], [50, -48], [40, 0], [28, 0]], shade("#c49a5a", -0.18));
    for (let y = -40; y < 0; y += 9) line4(c, [[-46 + (y + 40) * 0.1, y], [46 - (y + 40) * 0.1, y]], shade("#c49a5a", -0.35), 2);
    rect5(c, -52, -50, 104, 6, shade("#c49a5a", -0.1));
    box(c, -20, -56, 40, 16, CREAM5, 6);
  }),
  P("guitar", "Guitar", "home", 70, 200, (c) => {
    floorShadow(c, 60, 0, 0.14);
    rect5(c, -5, -178, 10, 110, WOOD_D);
    box(c, -10, -196, 20, 24, WOOD_D, 3);
    for (const y of [-188, -180]) disc(c, 0, y, 2, BRASS3);
    c.beginPath();
    c.moveTo(0, -70);
    c.bezierCurveTo(-34, -70, -36, -100, -22, -112);
    c.bezierCurveTo(-34, -124, -30, -150, 0, -150);
    c.bezierCurveTo(30, -150, 34, -124, 22, -112);
    c.bezierCurveTo(36, -100, 34, -70, 0, -70);
    c.closePath();
    c.fillStyle = RED2;
    c.fill();
    c.strokeStyle = shade(RED2, -0.5);
    c.lineWidth = 2.5;
    c.stroke();
    c.beginPath();
    c.moveTo(0, -70);
    c.bezierCurveTo(34, -70, 36, -100, 22, -112);
    c.lineTo(10, -112);
    c.closePath();
    c.fillStyle = shade(RED2, -0.2);
    c.fill();
    disc(c, 0, -116, 9, "#1d1d24");
    rect5(c, -12, -102, 24, 4, WOOD_L);
    rect5(c, -14, -88, 28, 4, shade(WOOD_L, -0.1));
  }),
  P("candle", "Candle", "home", 30, 60, (c) => {
    floorShadow(c, 24, 0, 0.14);
    box(c, -10, -40, 20, 40, CREAM5, 3);
    rect5(c, -10, -6, 20, 6, shade(CREAM5, -0.12));
    rect5(c, -1, -46, 2, 7, INK7);
    poly(c, [[0, -66], [7, -48], [0, -40], [-7, -48]], "#ffb347");
    poly(c, [[0, -60], [3, -48], [0, -44], [-3, -48]], "#fff2b0");
    glow(c, 0, -52, 36, "#ffb347", 0.5);
  }, { idle: "flicker" }),
  P("bathtub", "Bathtub", "home", 360, 170, (c) => {
    floorShadow(c, 340);
    disc(c, -150, -18, 9, "#8a8a92");
    disc(c, 150, -18, 9, "#8a8a92");
    box(c, -180, -132, 360, 124, WHITE, 40);
    rect5(c, -160, -132, 320, 8, shade(WHITE, -0.12));
    oval(c, 0, -132, 150, 16, "#7cc5e0");
    oval(c, 0, -134, 130, 9, "#a9dff2");
    rect5(c, -60, -132, 12, 2, "rgba(255,255,255,0.7)");
    disc(c, 150, -146, 6, CHROME);
    line4(c, [[160, -150], [160, -170], [146, -170]], CHROME, 5);
    rect5(c, -170, -20, 340, 6, shade(WHITE, -0.25));
  }),
  P("gift-box", "Gift box", "home", 70, 70, (c) => {
    floorShadow(c, 60);
    box(c, -30, -50, 60, 50, RED2, 3);
    rect5(c, -6, -50, 12, 50, MUSTARD);
    rect5(c, -30, -30, 60, 10, MUSTARD);
    oval(c, -10, -58, 8, 6, MUSTARD);
    oval(c, 10, -58, 8, 6, MUSTARD);
    disc(c, 0, -54, 3, MUSTARD, false);
  }),
  P("balloons", "Balloons", "home", 110, 330, (c) => {
    const bal = [
      [-22, -230, 30, RED2],
      [22, -250, 32, MUSTARD],
      [-2, -170, 28, TEAL2],
      [28, -200, 24, BLUE]
    ];
    for (const [x, y] of [[-22, -230], [22, -250], [-2, -170], [28, -200]]) {
      line4(c, [[x, y + 30], [x * 0.6, -60], [x * 0.4, 0]], "rgba(40,40,50,0.6)", 1.5);
    }
    for (const [x, y, r, col] of bal) {
      c.beginPath();
      c.ellipse(x, y, r * 0.86, r, 0, 0, Math.PI * 2);
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = shade(col, -0.5);
      c.lineWidth = 2;
      c.stroke();
      c.beginPath();
      c.ellipse(x - r * 0.3, y - r * 0.35, r * 0.2, r * 0.3, 0.4, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,255,255,0.4)";
      c.fill();
      poly(c, [[x - 4, y + r], [x + 4, y + r], [x, y + r + 6]], shade(col, -0.3));
    }
  }, { idle: "float" }),
  P("birdcage", "Birdcage", "home", 80, 160, (c) => {
    floorShadow(c, 60);
    rect5(c, -2, -40, 4, 40, BRASS3);
    for (let i = 0; i < 3; i++) rect5(c, -30 + i * 30 - 2, -40, 4, 4, BRASS3);
    oval(c, 0, -40, 34, 6, BRASS3);
    c.beginPath();
    c.ellipse(0, -90, 34, 50, 0, Math.PI, Math.PI * 2);
    c.lineTo(34, -40);
    c.lineTo(-34, -40);
    c.closePath();
    c.fillStyle = "rgba(220,230,220,0.35)";
    c.fill();
    c.strokeStyle = BRASS3;
    c.lineWidth = 2.5;
    c.stroke();
    for (let x = -26; x <= 26; x += 8) line4(c, [[x, -40], [x * 0.9, -92 + Math.abs(x) * 0.2]], BRASS3, 1.5);
    oval(c, 0, -146, 5, 6, BRASS3);
    oval(c, 2, -66, 10, 8, MUSTARD);
    disc(c, -6, -72, 5, MUSTARD);
    poly(c, [[-11, -72], [-16, -70], [-11, -68]], RED2);
    rect5(c, 0, -58, 2, 8, WOOD_D);
  }),
  P("books-stack", "Stack of books", "home", 70, 60, (c) => {
    floorShadow(c, 64);
    box(c, -34, -16, 68, 16, RED2, 2);
    box(c, -30, -32, 60, 16, TEAL2, 2);
    box(c, -36, -46, 66, 14, MUSTARD, 2);
    rect5(c, -30, -26, 60, 2, CREAM5);
    rect5(c, -34, -10, 66, 2, CREAM5);
    rect5(c, -28, -40, 56, 2, CREAM5);
  }),
  // ───────────────────────── food ─────────────────────────
  P("tea-glass", "Tea glass", "food", 25, 40, (c) => {
    oval(c, 0, -4, 13, 4, "#e9e4d6");
    c.beginPath();
    c.moveTo(-5, -6);
    c.quadraticCurveTo(-11, -20, -8, -26);
    c.quadraticCurveTo(-4, -34, 0, -34);
    c.quadraticCurveTo(4, -34, 8, -26);
    c.quadraticCurveTo(11, -20, 5, -6);
    c.closePath();
    c.fillStyle = "rgba(230,240,245,0.55)";
    c.fill();
    c.strokeStyle = "rgba(40,60,70,0.6)";
    c.lineWidth = 1.5;
    c.stroke();
    c.beginPath();
    c.moveTo(-6, -8);
    c.quadraticCurveTo(-9, -18, -7, -25);
    c.quadraticCurveTo(-3, -30, 0, -30);
    c.quadraticCurveTo(3, -30, 7, -25);
    c.quadraticCurveTo(9, -18, 6, -8);
    c.closePath();
    c.fillStyle = "#b3201e";
    c.fill();
    rect5(c, -6, -8, 12, 3, "#e3524a");
    rect5(c, -4, -26, 2, 8, "rgba(255,255,255,0.7)");
  }),
  P("tea-tray", "Tea tray", "food", 120, 60, (c) => {
    floorShadow(c, 60, 0, 0.14);
    rect5(c, -8, -22, 16, 22, shade(BRASS3, -0.3));
    oval(c, 0, -24, 58, 9, BRASS3);
    oval(c, 0, -26, 50, 6, shade(BRASS3, 0.2));
    const xs = [-34, 0, 34];
    for (const x of xs) {
      oval(c, x, -28, 8, 3, "#e9e4d6");
      c.beginPath();
      c.moveTo(x - 6, -28);
      c.quadraticCurveTo(x - 7, -42, x - 4, -48);
      c.lineTo(x + 4, -48);
      c.quadraticCurveTo(x + 7, -42, x + 6, -28);
      c.closePath();
      c.fillStyle = "#b3201e";
      c.fill();
      c.strokeStyle = "rgba(40,20,20,0.5)";
      c.lineWidth = 1.2;
      c.stroke();
      rect5(c, x - 3, -44, 2, 8, "rgba(255,255,255,0.5)");
    }
  }),
  P("cezve", "Cezve", "food", 40, 45, (c) => {
    oval(c, 0, -2, 16, 3, shade(COPPER, -0.3));
    c.beginPath();
    c.moveTo(-14, -34);
    c.quadraticCurveTo(-16, -6, 0, -6);
    c.quadraticCurveTo(16, -6, 14, -34);
    c.closePath();
    c.fillStyle = COPPER;
    c.fill();
    c.strokeStyle = shade(COPPER, -0.5);
    c.lineWidth = 2;
    c.stroke();
    oval(c, 0, -34, 14, 4, "#7a3f1f");
    oval(c, 0, -36, 9, 2.5, "#c9824a");
    rect5(c, 5, -18, 4, 10, shade(COPPER, 0.3));
    line4(c, [[10, -28], [22, -40], [28, -44]], shade(COPPER, -0.3), 3);
    rect5(c, -9, -28, 4, 18, shade(COPPER, 0.3));
  }),
  P("plate-food", "Plate of food", "food", 70, 25, (c) => {
    oval(c, 0, -4, 34, 9, WHITE);
    oval(c, 0, -5, 27, 6, shade(WHITE, -0.08));
    c.beginPath();
    c.ellipse(0, -10, 22, 10, 0, Math.PI, Math.PI * 2);
    c.closePath();
    c.fillStyle = "#e0b04f";
    c.fill();
    c.strokeStyle = shade("#e0b04f", -0.5);
    c.lineWidth = 2;
    c.stroke();
    for (const [x, y] of [[-10, -12], [4, -15], [12, -10], [-2, -8], [-16, -8]]) {
      oval(c, x, y, 3.5, 2.5, GREEN);
    }
    oval(c, 8, -16, 3, 2, RED2);
  }),
  P("cake", "Cake", "food", 90, 80, (c) => {
    floorShadow(c, 80, 0, 0.14);
    oval(c, 0, -4, 42, 9, WHITE);
    box(c, -36, -40, 72, 36, "#f4c6b8", 4);
    rect5(c, -36, -40, 72, 6, "#fff4ef");
    box(c, -28, -62, 56, 22, "#fbe6d6", 4);
    rect5(c, -28, -62, 56, 5, "#ffffff");
    for (let i = 0; i < 6; i++) disc(c, -22 + i * 9, -60, 3, "#ffffff", false);
    disc(c, 0, -74, 6, RED2);
    rect5(c, -2, -80, 4, 6, GREEN);
    for (let i = 0; i < 5; i++) disc(c, -24 + i * 12, -44, 2.5, MUSTARD, false);
  }),
  P("fruit-bowl", "Fruit bowl", "food", 90, 55, (c) => {
    floorShadow(c, 80, 0, 0.14);
    oval(c, -10, -36, 16, 14, "#e0432f");
    oval(c, 14, -38, 14, 14, MUSTARD);
    oval(c, -2, -46, 12, 12, "#9cd44a");
    for (const [x, y] of [[-16, -34], [-6, -30], [6, -44], [24, -36]]) oval(c, x, y, 3, 3, shade("#e0432f", -0.2));
    c.beginPath();
    c.moveTo(-44, -30);
    c.quadraticCurveTo(-44, 0, 0, 0);
    c.quadraticCurveTo(44, 0, 44, -30);
    c.closePath();
    c.fillStyle = "#9a5a33";
    c.fill();
    c.strokeStyle = shade("#9a5a33", -0.5);
    c.lineWidth = 2.5;
    c.stroke();
    rect5(c, -44, -30, 88, 6, shade("#9a5a33", 0.2));
    rect5(c, -38, -22, 14, 4, shade("#9a5a33", 0.2));
  }),
  P("bread-basket", "Bread basket", "food", 90, 55, (c) => {
    floorShadow(c, 80, 0, 0.14);
    oval(c, -16, -36, 18, 12, "#d9962e");
    oval(c, 16, -34, 18, 12, "#e3a84a");
    oval(c, 0, -44, 16, 10, "#c9852a");
    for (const x of [-22, -8, 10, 22]) line4(c, [[x - 2, -38], [x + 2, -32]], shade("#d9962e", -0.3), 2);
    c.beginPath();
    c.moveTo(-44, -26);
    c.lineTo(44, -26);
    c.quadraticCurveTo(40, 0, 0, 0);
    c.quadraticCurveTo(-40, 0, -44, -26);
    c.closePath();
    c.fillStyle = "#b07a46";
    c.fill();
    c.strokeStyle = shade("#b07a46", -0.5);
    c.lineWidth = 2.5;
    c.stroke();
    for (let x = -36; x < 40; x += 10) line4(c, [[x, -24], [x + 4, -4]], shade("#b07a46", -0.3), 2);
  }),
  P("bottle", "Bottle", "food", 30, 90, (c) => {
    floorShadow(c, 26, 0, 0.14);
    c.beginPath();
    c.moveTo(-14, 0);
    c.lineTo(-14, -56);
    c.quadraticCurveTo(-14, -62, -6, -66);
    c.lineTo(-6, -82);
    c.lineTo(6, -82);
    c.lineTo(6, -66);
    c.quadraticCurveTo(14, -62, 14, -56);
    c.lineTo(14, 0);
    c.closePath();
    c.fillStyle = "rgba(70,160,110,0.9)";
    c.fill();
    c.strokeStyle = shade(GREEN, -0.6);
    c.lineWidth = 2;
    c.stroke();
    rect5(c, -6, -88, 12, 8, RED2);
    rect5(c, -14, -50, 28, 26, CREAM5);
    rect5(c, -10, -44, 20, 3, RED2);
    rect5(c, -10, -36, 20, 2, shade(CREAM5, -0.4));
    rect5(c, -11, -58, 4, 40, "rgba(255,255,255,0.35)");
  }),
  P("simit-tray", "Simit tray", "food", 140, 40, (c) => {
    floorShadow(c, 120, 0, 0.14);
    rect5(c, -62, -10, 124, 10, WOOD_D);
    const simit = (x, y) => {
      c.beginPath();
      c.ellipse(x, y, 18, 10, 0, 0, Math.PI * 2);
      c.fillStyle = "#c9852a";
      c.fill();
      c.strokeStyle = shade("#c9852a", -0.5);
      c.lineWidth = 2;
      c.stroke();
      c.beginPath();
      c.ellipse(x, y, 9, 4.5, 0, 0, Math.PI * 2);
      c.fillStyle = "#f5ead0";
      c.fill();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        disc(c, x + Math.cos(a) * 13, y + Math.sin(a) * 6, 1.5, "#f3e6c4", false);
      }
    };
    simit(-36, -14);
    simit(0, -14);
    simit(36, -14);
    simit(-18, -26);
    simit(18, -26);
    simit(0, -36);
    c.strokeStyle = "rgba(255,230,160,0.3)";
    c.lineWidth = 1.2;
  }),
  P("baklava", "Baklava", "food", 70, 20, (c) => {
    floorShadow(c, 64, 0, 0.14);
    for (let i = 0; i < 3; i++) {
      const y = -4 - i * 6;
      c.beginPath();
      c.moveTo(0, y - 9);
      c.lineTo(30 - i * 2, y - 2);
      c.lineTo(0, y + 5);
      c.lineTo(-30 + i * 2, y - 2);
      c.closePath();
      c.fillStyle = i === 2 ? "#e0a53a" : "#c9852a";
      c.fill();
      c.strokeStyle = shade("#c9852a", -0.5);
      c.lineWidth = 1.8;
      c.stroke();
    }
    for (const [x, y] of [[-8, -22], [4, -20], [-2, -26], [10, -24]]) oval(c, x, y, 2.5, 1.5, "#8fb85a");
  }),
  P("watermelon", "Watermelon", "food", 80, 55, (c) => {
    floorShadow(c, 76, 0, 0.14);
    c.beginPath();
    c.arc(-14, -28, 26, Math.PI, 0);
    c.closePath();
    c.fillStyle = "#3f8f4f";
    c.fill();
    c.beginPath();
    c.arc(-14, -28, 24, Math.PI, 0);
    c.fillStyle = "#e65a5a";
    c.fill();
    c.beginPath();
    c.arc(-14, -28, 20, Math.PI, 0);
    c.fillStyle = "#ff7a6a";
    c.fill();
    for (const [x, y] of [[-24, -36], [-14, -40], [-4, -36], [-18, -30], [-8, -28]]) oval(c, x, y, 1.5, 2.5, "#2a2a2a");
    c.beginPath();
    c.arc(24, -26, 26, Math.PI, 0);
    c.closePath();
    c.fillStyle = "#3f8f4f";
    c.fill();
    c.strokeStyle = shade("#3f8f4f", -0.5);
    c.lineWidth = 2;
    c.stroke();
    for (const x of [14, 24, 34]) line4(c, [[x, -48], [x - 2, -28]], shade("#3f8f4f", -0.5), 2.5);
  }),
  P("kebab-plate", "Kebab plate", "food", 90, 30, (c) => {
    floorShadow(c, 84, 0, 0.12);
    oval(c, 0, -5, 42, 11, WHITE);
    oval(c, 0, -6, 34, 8, shade(WHITE, -0.08));
    line4(c, [[-36, -18], [36, -20]], CHROME, 2);
    for (const x of [-18, -4, 10, 24]) {
      oval(c, x, -16, 8, 5, "#8a4a22");
      oval(c, x - 1, -18, 5, 2.5, "#b9703a");
    }
    oval(c, 30, -12, 4, 3, "#e0432f");
    oval(c, -28, -12, 4, 3, "#9cd44a");
    oval(c, -30, -6, 6, 3, "#e3a84a");
    oval(c, 30, -4, 6, 3, "#e3a84a");
  })
];

// src/props/street.ts
var P2 = (id, name, cat2, w, h, draw, extra = {}) => ({
  id,
  name,
  cat: cat2,
  w,
  h,
  draw,
  ...extra
});
var IRON3 = "#3d4350";
var IRON_L = "#6d7480";
var WOOD4 = "#9a6334";
var WOOD_D2 = "#5d3a1e";
var WOOD_L2 = "#c08a52";
var RED3 = "#c8432f";
var TEAL3 = "#2f8f83";
var MUSTARD2 = "#e0a526";
var BLUE2 = "#2f5f9e";
var CREAM6 = "#f3ead2";
var WHITE2 = "#f6f6f2";
var CHROME2 = "#c9ccd6";
var BRASS4 = "#d9a441";
var COPPER2 = "#b8673a";
var GREEN2 = "#3f8f4f";
var INK8 = "#2b2b33";
var ORANGE = "#e8772e";
var PINK2 = "#ff4fa3";
var rect6 = (c, x, y, w, h, col) => {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
};
var line5 = (c, pts2, col, lw) => {
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
};
var oval2 = (c, x, y, rx, ry, col) => {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  c.strokeStyle = shade(col, -0.5);
  c.lineWidth = 2;
  c.stroke();
};
var legs2 = (c, xs, y0, y1, col = IRON3, w = 10) => xs.forEach((x) => rect6(c, x - w / 2, y0, w, y1 - y0, col));
var awning = (c, x, y, w, h, a, b, n = 6) => {
  const pw = w / n;
  for (let i = 0; i < n; i++) rect6(c, x + i * pw, y, pw, h, i % 2 ? a : b);
  for (let i = 0; i < n; i++) {
    c.beginPath();
    c.arc(x + i * pw + pw / 2, y + h, pw / 2, 0, Math.PI);
    c.fillStyle = i % 2 ? a : b;
    c.fill();
  }
  rect6(c, x, y, w, 3, shade(a, -0.3));
};
var counter2 = (c, x, y, w, h, wood2 = WOOD4) => {
  box(c, x, y, w, h, wood2, 4);
  rect6(c, x + 4, y + h * 0.5, w - 8, 2, shade(wood2, -0.25));
};
var pole = (c, x, y0, y1, w, col = IRON3) => rect6(c, x - w / 2, y0, w, y1 - y0, col);
var STREET_PROPS = [
  // ───────────────────────── street ─────────────────────────
  P2("street-lamp", "Street lamp", "street", 90, 520, (c) => {
    floorShadow(c, 60);
    poly(c, [[-14, 0], [14, 0], [10, -22], [-10, -22]], IRON3);
    pole(c, 0, -22, -480, 8);
    rect6(c, -5, -480, 4, 480, IRON_L);
    rect6(c, -10, -370, 10, 14, IRON3);
    line5(c, [[0, -480], [0, -494], [-30, -500]], IRON3, 6);
    poly(c, [[-40, -508], [-18, -514], [-18, -494], [-40, -490]], IRON3);
    poly(c, [[-36, -506], [-22, -508], [-22, -498], [-36, -496]], "#ffe9a8");
    rrect(c, -18, -506, 18, 22, 4);
    c.fillStyle = "#4a4f5a";
    c.fill();
    rrect(c, -15, -503, 12, 16, 3);
    c.fillStyle = "#ffd77a";
    c.fill();
    c.fillStyle = IRON3;
    c.beginPath();
    c.moveTo(-22, -514);
    c.lineTo(-6, -514);
    c.lineTo(-10, -526);
    c.lineTo(-18, -526);
    c.closePath();
    c.fill();
  }),
  P2("bench", "Bench", "street", 300, 150, (c) => {
    floorShadow(c, 280);
    for (const x of [-120, 120]) {
      poly(c, [[x - 6, -110], [x + 6, -110], [x + 10, 0], [x - 10, 0]], IRON3);
    }
    for (let i = 0; i < 3; i++) rect6(c, -140, -118 + i * 16, 280, 10, WOOD4);
    for (let i = 0; i < 3; i++) box(c, -150, -58 + i * 14, 300, 12, WOOD_L2, 3);
    rect6(c, -152, -136, 12, 6, IRON3);
    rect6(c, 140, -136, 12, 6, IRON3);
  }),
  P2("bus-stop", "Bus stop", "street", 300, 380, (c) => {
    floorShadow(c, 280);
    rect6(c, -120, -270, 240, 240, "rgba(170,215,235,0.55)");
    rect6(c, -120, -270, 240, 240, "rgba(255,255,255,0.12)");
    poly(c, [[-100, -260], [-60, -260], [-110, -40], [-140, -40]], "rgba(255,255,255,0.0)");
    rect6(c, -120, -270, 6, 240, IRON3);
    rect6(c, 114, -270, 6, 240, IRON3);
    rect6(c, -120, -270, 240, 6, IRON3);
    rect6(c, -100, -60, 200, 10, WOOD_L2);
    rect6(c, -100, -60, 200, 2, WOOD4);
    rect6(c, -90, -50, 6, 50, IRON3);
    rect6(c, 84, -50, 6, 50, IRON3);
    box(c, -150, -296, 300, 30, TEAL3, 6);
    rect6(c, -150, -296, 300, 6, shade(TEAL3, 0.25));
    rect6(c, 130, -340, 6, 340, IRON3);
    rrect(c, 96, -378, 74, 40, 6);
    c.fillStyle = MUSTARD2;
    c.fill();
    c.strokeStyle = shade(MUSTARD2, -0.5);
    c.lineWidth = 2;
    c.stroke();
    text(c, "DURAK", 133, -358, 14, INK8, "center", 800);
  }),
  P2("mailbox", "Mailbox", "street", 80, 180, (c) => {
    floorShadow(c, 60);
    rect6(c, -4, -70, 8, 70, IRON3);
    box(c, -36, -150, 72, 84, "#e0b02a", 12);
    rect6(c, -36, -150, 72, 30, shade("#e0b02a", 0.12));
    rect6(c, -28, -110, 56, 6, INK8);
    rect6(c, -24, -100, 48, 3, shade("#e0b02a", -0.3));
    rect6(c, -30, -70, 60, 6, shade("#e0b02a", -0.25));
    rect6(c, 20, -172, 6, 22, RED3);
    rect6(c, 14, -172, 6, 8, RED3);
  }),
  P2("fire-hydrant", "Fire hydrant", "street", 60, 100, (c) => {
    floorShadow(c, 52, 0, 0.18);
    rect6(c, -14, -10, 28, 10, shade(RED3, -0.25));
    box(c, -18, -72, 36, 66, RED3, 10);
    rect6(c, -26, -56, 52, 10, shade(RED3, -0.2));
    rect6(c, -26, -62, 52, 8, "#ff6a4a");
    disc(c, -22, -40, 6, RED3);
    disc(c, 22, -40, 6, RED3);
    rect6(c, -30, -78, 60, 8, shade(RED3, 0.1));
    disc(c, 0, -84, 7, shade(RED3, 0.1));
    rect6(c, -24, -4, 48, 4, IRON3);
  }),
  P2("trash-can", "Trash can", "street", 80, 130, (c) => {
    floorShadow(c, 70);
    poly(c, [[-34, -120], [34, -120], [28, 0], [-28, 0]], IRON_L);
    poly(c, [[12, -120], [34, -120], [28, 0], [16, 0]], shade(IRON_L, -0.2));
    rect6(c, -22, -100, 44, 3, shade(IRON_L, 0.25));
    rect6(c, -22, -64, 44, 3, shade(IRON_L, 0.25));
    rect6(c, -22, -30, 44, 3, shade(IRON_L, 0.25));
    box(c, -40, -132, 80, 16, IRON3, 6);
    disc(c, 0, -134, 4, IRON3);
    rect6(c, -10, -92, 20, 16, MUSTARD2);
  }),
  P2("traffic-light", "Traffic light", "street", 80, 520, (c) => {
    floorShadow(c, 60);
    poly(c, [[-14, 0], [14, 0], [9, -26], [-9, -26]], IRON3);
    pole(c, 0, -26, -500, 10);
    box(c, -26, -500, 52, 120, IRON3, 10);
    disc(c, 0, -470, 14, "#5a1a18");
    disc(c, 0, -470, 12, "#ff4f3f");
    disc(c, 0, -440, 12, "#3a3a2a");
    disc(c, 0, -410, 12, "#3a3a2a");
    line5(c, [[0, -500], [0, -520], [-30, -520]], IRON3, 4);
    box(c, -26, -520, 52, 10, IRON3, 3);
  }),
  P2("phone-booth", "Phone booth", "street", 130, 400, (c) => {
    floorShadow(c, 120);
    box(c, -60, -400, 120, 400, RED3, 6);
    rect6(c, -60, -400, 120, 10, shade(RED3, 0.2));
    rect6(c, -48, -330, 96, 150, "rgba(180,220,235,0.65)");
    rect6(c, -48, -330, 96, 150, "rgba(255,255,255,0.12)");
    rect6(c, -48, -330, 6, 150, shade(RED3, -0.3));
    rect6(c, 42, -330, 6, 150, shade(RED3, -0.3));
    rect6(c, -48, -330, 96, 6, shade(RED3, -0.3));
    rect6(c, -22, -256, 44, 14, INK8);
    rrect(c, -26, -250, 52, 8, 3);
    c.fillStyle = shade(INK8, 0.1);
    c.fill();
    rect6(c, -26, -250, 52, 2, WHITE2);
    rect6(c, -40, -388, 80, 26, CREAM6);
    text(c, "TELEFON", 0, -375, 12, RED3, "center", 800);
    rect6(c, -52, -90, 104, 8, shade(RED3, -0.4));
    rect6(c, -60, -90, 120, 6, shade(RED3, -0.3));
  }),
  P2("newspaper-stand", "Newspaper stand", "street", 220, 280, (c) => {
    floorShadow(c, 210);
    box(c, -100, -170, 200, 170, "#2f6f8a", 6);
    rect6(c, -92, -160, 184, 150, shade("#2f6f8a", -0.25));
    for (let i = 0; i < 4; i++) {
      rect6(c, -84 + i * 42, -152, 36, 60, CREAM6);
      for (let j = 0; j < 5; j++) rect6(c, -80 + i * 42, -146 + j * 10, 28, 2, shade(CREAM6, -0.4));
    }
    rect6(c, -92, -90, 184, 4, IRON_L);
    rect6(c, -92, -40, 184, 8, WOOD_D2);
    awning(c, -116, -208, 232, 36, RED3, CREAM6, 8);
    rect6(c, -110, -210, 220, 6, shade(RED3, -0.3));
    text(c, "GAZETE", 0, -190, 14, CREAM6, "center", 800);
    rect6(c, -96, -170, 8, 170, shade("#2f6f8a", -0.5));
  }),
  P2("fountain", "Fountain", "street", 340, 300, (c) => {
    floorShadow(c, 320);
    oval2(c, 0, -40, 160, 34, "#c4c0b6");
    oval2(c, 0, -46, 146, 26, "#7cc5e0");
    oval2(c, 0, -52, 120, 18, "#9fdcf0");
    box(c, -26, -150, 52, 96, "#d8d1c2", 6);
    oval2(c, 0, -152, 84, 18, "#c4c0b6");
    oval2(c, 0, -156, 70, 12, "#7cc5e0");
    box(c, -10, -230, 20, 80, "#d8d1c2", 4);
    oval2(c, 0, -236, 38, 10, "#c4c0b6");
    for (const a of [-0.9, -0.45, 0.45, 0.9]) {
      line5(c, [[0, -240], [a * 40, -270], [a * 90, -200]], "rgba(200,240,255,0.85)", 3);
    }
    disc(c, 0, -262, 6, "rgba(200,240,255,0.9)", false);
    oval2(c, -60, -66, 6, 4, "#4f8fb0");
    oval2(c, 55, -74, 4, 3, "#4f8fb0");
  }),
  P2("statue", "Statue", "street", 160, 460, (c) => {
    floorShadow(c, 150);
    box(c, -68, -70, 136, 70, "#cdc6b6", 4);
    box(c, -56, -170, 112, 104, "#dcd5c5", 4);
    rect6(c, -56, -170, 112, 6, shade("#dcd5c5", 0.2));
    c.beginPath();
    c.arc(0, -300, 18, 0, Math.PI * 2);
    c.fillStyle = "#bdb5a4";
    c.fill();
    c.strokeStyle = shade("#bdb5a4", -0.5);
    c.lineWidth = 2.5;
    c.stroke();
    poly(c, [[-32, -282], [32, -282], [28, -180], [-28, -180]], "#bdb5a4");
    poly(c, [[12, -282], [32, -282], [28, -180], [16, -180]], shade("#bdb5a4", -0.14));
    poly(c, [[-32, -278], [-48, -220], [-40, -212], [-26, -244]], "#bdb5a4");
    poly(c, [[32, -278], [46, -236], [38, -232], [28, -256]], "#bdb5a4");
    rect6(c, -20, -186, 18, 14, "#bdb5a4");
    rect6(c, 2, -186, 18, 14, "#bdb5a4");
    rect6(c, -8, -282, 16, 4, shade("#bdb5a4", -0.3));
    line5(c, [[-10, -250], [-4, -226]], "rgba(0,0,0,0.12)", 2);
    line5(c, [[14, -240], [18, -214]], "rgba(0,0,0,0.12)", 2);
    box(c, -68, -70, 136, 10, "#b9b1a0", 2);
  }),
  P2("fence", "Fence", "street", 300, 150, (c) => {
    floorShadow(c, 290, 0, 0.18);
    rect6(c, -150, -116, 300, 10, WOOD_L2);
    rect6(c, -150, -58, 300, 10, WOOD_L2);
    for (let x = -146; x < 150; x += 24) {
      poly(c, [[x, -150], [x + 18, -150], [x + 18, -140], [x + 9, -134], [x, -140]], WOOD4);
      rect6(c, x, -140, 18, 140, WOOD4);
      rect6(c, x + 12, -140, 6, 140, shade(WOOD4, -0.2));
      rect6(c, x, -140, 18, 2, shade(WOOD4, 0.25));
    }
  }),
  P2("gate", "Gate", "street", 260, 330, (c) => {
    floorShadow(c, 250, 0, 0.18);
    box(c, -130, -330, 40, 330, "#d6cdb8", 4);
    box(c, 90, -330, 40, 330, "#d6cdb8", 4);
    poly(c, [[-138, -330], [-82, -330], [-94, -350], [-126, -350]], shade("#d6cdb8", -0.1));
    poly(c, [[82, -330], [138, -330], [126, -350], [94, -350]], shade("#d6cdb8", -0.1));
    rect6(c, -90, -326, 180, 4, IRON3);
    for (let x = -86; x <= 86; x += 16) rect6(c, x, -290, 5, 290, IRON3);
    rect6(c, -90, -290, 180, 8, IRON3);
    rect6(c, -90, -170, 180, 8, IRON3);
    rect6(c, -90, -40, 180, 8, IRON3);
    for (let x = -86; x <= 86; x += 16) poly(c, [[x - 4, -328], [x + 2, -340], [x + 8, -328]], IRON3);
    disc(c, 0, -210, 9, MUSTARD2);
  }),
  P2("barrier", "Road barrier", "street", 300, 120, (c) => {
    floorShadow(c, 290, 0, 0.18);
    poly(c, [[-130, -10], [-118, -10], [-112, 0], [-136, 0]], IRON3);
    poly(c, [[118, -10], [130, -10], [136, 0], [112, 0]], IRON3);
    rect6(c, -124, -10, 8, 10, IRON3);
    rect6(c, 116, -10, 8, 10, IRON3);
    for (let i = 0; i < 6; i++) {
      rect6(c, -150 + i * 50, -96, 50, 26, i % 2 ? WHITE2 : RED3);
    }
    rect6(c, -150, -96, 300, 3, shade(RED3, 0.2));
    rect6(c, -150, -70, 300, 2, shade(WHITE2, -0.3));
    rect6(c, -120, -40, 240, 0, RED3);
    rect6(c, -152, -98, 8, 30, shade(RED3, -0.2));
    rect6(c, 144, -98, 8, 30, shade(RED3, -0.2));
    rect6(c, -130, -70, 10, 66, IRON3);
    rect6(c, 120, -70, 10, 66, IRON3);
    rect6(c, -140, -4, 30, 4, shade(IRON3, 0.2));
    rect6(c, 110, -4, 30, 4, shade(IRON3, 0.2));
  }),
  P2("traffic-cone", "Traffic cone", "street", 50, 90, (c) => {
    floorShadow(c, 46, 0, 0.18);
    box(c, -24, -8, 48, 8, "#2b2b33", 2);
    poly(c, [[-18, -8], [18, -8], [5, -82], [-5, -82]], ORANGE);
    poly(c, [[6, -8], [18, -8], [5, -82], [0, -82]], shade(ORANGE, -0.2));
    poly(c, [[-12, -40], [12, -40], [10, -52], [-10, -52]], WHITE2);
    poly(c, [[-14, -22], [14, -22], [12, -30], [-12, -30]], WHITE2);
    rect6(c, -5, -84, 10, 6, shade(ORANGE, -0.3));
  }),
  P2("ladder", "Ladder", "street", 100, 400, (c) => {
    floorShadow(c, 80, 0, 0.14);
    rect6(c, -38, -400, 9, 400, WOOD_L2);
    rect6(c, 29, -400, 9, 400, WOOD_L2);
    rect6(c, -38, -400, 9, 4, WOOD_D2);
    for (let y = -370; y < 0; y += 38) rect6(c, -30, y, 60, 7, WOOD4);
    rect6(c, -38, -400, 2, 400, shade(WOOD_L2, 0.2));
    rect6(c, 29, -400, 2, 400, shade(WOOD_L2, 0.2));
  }),
  P2("crate", "Wooden crate", "street", 120, 110, (c) => {
    floorShadow(c, 116);
    box(c, -60, -110, 120, 110, WOOD4, 4);
    for (let i = 1; i < 4; i++) rect6(c, -56, -110 + i * 26, 112, 4, WOOD_D2);
    rect6(c, -60, -110, 12, 110, WOOD_L2);
    rect6(c, 48, -110, 12, 110, WOOD_L2);
    rect6(c, -60, -110, 120, 4, shade(WOOD4, 0.2));
    line5(c, [[-56, -110], [56, 0]], shade(WOOD_D2, 0.1), 3);
    line5(c, [[56, -110], [-56, 0]], shade(WOOD_D2, 0.1), 3);
    rect6(c, -34, -92, 68, 4, WOOD_D2);
  }),
  P2("barrel", "Barrel", "street", 100, 140, (c) => {
    floorShadow(c, 92);
    c.beginPath();
    c.moveTo(-44, -132);
    c.quadraticCurveTo(-54, -66, -44, -6);
    c.lineTo(44, -6);
    c.quadraticCurveTo(54, -66, 44, -132);
    c.closePath();
    c.fillStyle = WOOD4;
    c.fill();
    c.strokeStyle = shade(WOOD4, -0.5);
    c.lineWidth = 2.5;
    c.stroke();
    c.beginPath();
    c.moveTo(20, -132);
    c.quadraticCurveTo(38, -66, 20, -6);
    c.lineTo(44, -6);
    c.quadraticCurveTo(54, -66, 44, -132);
    c.closePath();
    c.fillStyle = shade(WOOD4, -0.18);
    c.fill();
    for (const y of [-112, -36]) {
      rect6(c, -52, y, 104, 8, shade(IRON3, 0.25));
      rect6(c, -52, y + 2, 104, 2, shade(IRON3, 0.45));
    }
    oval2(c, 0, -132, 44, 8, WOOD_L2);
    rect6(c, -44, -132, 88, 3, shade(WOOD_L2, -0.2));
  }),
  P2("sack", "Sack", "street", 80, 100, (c) => {
    floorShadow(c, 72);
    c.beginPath();
    c.moveTo(-30, -6);
    c.quadraticCurveTo(-42, -60, -22, -82);
    c.quadraticCurveTo(-14, -90, -6, -86);
    c.lineTo(6, -86);
    c.quadraticCurveTo(14, -90, 22, -82);
    c.quadraticCurveTo(42, -60, 30, -6);
    c.quadraticCurveTo(0, 2, -30, -6);
    c.closePath();
    c.fillStyle = "#c9ad7c";
    c.fill();
    c.strokeStyle = shade("#c9ad7c", -0.5);
    c.lineWidth = 2.5;
    c.stroke();
    c.beginPath();
    c.moveTo(12, -60);
    c.quadraticCurveTo(38, -40, 30, -8);
    c.quadraticCurveTo(10, -6, 4, -20);
    c.fillStyle = shade("#c9ad7c", -0.16);
    c.fill();
    rect6(c, -18, -92, 36, 10, "#a68754");
    line5(c, [[-16, -60], [-6, -30]], shade("#c9ad7c", -0.35), 2);
    line5(c, [[8, -50], [18, -26]], shade("#c9ad7c", -0.35), 2);
    rect6(c, -24, -40, 4, 3, "#6b4f2a");
  }),
  P2("shoeshine-box", "Shoeshine box", "street", 90, 80, (c) => {
    floorShadow(c, 84);
    box(c, -42, -36, 84, 36, WOOD_D2, 6);
    rect6(c, -40, -36, 80, 4, shade(WOOD_D2, 0.2));
    poly(c, [[-40, -36], [40, -36], [46, -48], [-46, -48]], WOOD_L2);
    oval2(c, -18, -48, 12, 6, "#2b1a10");
    oval2(c, 18, -48, 12, 6, "#2b1a10");
    rect6(c, -48, -52, 16, 6, BRASS4);
    rect6(c, 32, -52, 16, 6, BRASS4);
    rect6(c, -26, -20, 52, 6, shade(WOOD4, -0.1));
    disc(c, -12, -22, 6, INK8, false);
    disc(c, 8, -22, 6, "#8a2a18", false);
    rect6(c, -42, -2, 84, 2, WOOD_D2);
    text(c, "BOYA", 0, -28, 9, CREAM6, "center", 800);
  }),
  P2("cafe-table", "Caf\xE9 table", "street", 160, 200, (c) => {
    floorShadow(c, 130);
    const chair = (x) => {
      rect6(c, x - 2, -90, 4, 90, IRON3);
      rect6(c, x - 22, -110, 4, 110, IRON3);
      rect6(c, x + 14, -110, 4, 110, IRON3);
      box(c, x - 22, -120, 44, 6, IRON3, 2);
      oval2(c, x, -92, 22, 6, IRON3);
    };
    chair(-60);
    chair(60);
    rect6(c, -3, -70, 6, 70, IRON3);
    oval2(c, 0, -4, 30, 6, IRON3);
    oval2(c, 0, -74, 58, 16, "#f1efe6");
    oval2(c, 0, -74, 58, 16, "rgba(0,0,0,0)");
    c.beginPath();
    c.ellipse(0, -76, 56, 14, 0, 0, Math.PI * 2);
    c.fillStyle = WHITE2;
    c.fill();
    c.strokeStyle = shade(WHITE2, -0.4);
    c.lineWidth = 2;
    c.stroke();
    oval2(c, 14, -86, 4, 3, RED3);
  }),
  P2("umbrella-table", "Umbrella table", "street", 300, 320, (c) => {
    floorShadow(c, 220);
    rect6(c, -3, -300, 6, 240, IRON3);
    c.beginPath();
    c.moveTo(-150, -224);
    c.quadraticCurveTo(-120, -296, 0, -308);
    c.quadraticCurveTo(120, -296, 150, -224);
    c.lineTo(110, -210);
    c.lineTo(80, -224);
    c.lineTo(40, -206);
    c.lineTo(0, -224);
    c.lineTo(-40, -206);
    c.lineTo(-80, -224);
    c.lineTo(-110, -210);
    c.closePath();
    c.fillStyle = RED3;
    c.fill();
    c.strokeStyle = shade(RED3, -0.5);
    c.lineWidth = 2.5;
    c.stroke();
    for (const x of [-60, 0, 60]) {
      c.beginPath();
      c.moveTo(x, -306);
      c.quadraticCurveTo(x + 30, -262, x + 20, -220);
      c.lineTo(x + 40, -224);
      c.quadraticCurveTo(x + 40, -266, x + 30, -300);
      c.closePath();
      c.fillStyle = CREAM6;
      c.fill();
    }
    disc(c, 0, -306, 6, BRASS4);
    rect6(c, -3, -84, 6, 84, IRON3);
    oval2(c, 0, -4, 36, 7, IRON3);
    oval2(c, 0, -90, 70, 16, WHITE2);
    c.beginPath();
    c.ellipse(0, -92, 68, 16, 0, 0, Math.PI * 2);
    c.fillStyle = WHITE2;
    c.fill();
    c.strokeStyle = shade(WHITE2, -0.4);
    c.lineWidth = 2;
    c.stroke();
    oval2(c, -20, -100, 6, 3, CREAM6);
  }),
  P2("tram-stop", "Tram stop", "street", 200, 400, (c) => {
    floorShadow(c, 190);
    pole(c, 0, -400, -300, 10, IRON3);
    rrect(c, -4, -400, 8, 8, 2);
    c.fillStyle = IRON3;
    c.fill();
    disc(c, 0, -340, 30, RED3, true);
    rect6(c, -18, -344, 36, 6, WHITE2);
    rect6(c, -16, -330, 32, 4, WHITE2);
    text(c, "DURAK", 0, -312, 11, CREAM6, "center", 800);
    rect6(c, -76, -168, 152, 6, WOOD_L2);
    rect6(c, -76, -162, 152, 4, WOOD_D2);
    rect6(c, -70, -162, 8, 162, IRON3);
    rect6(c, 62, -162, 8, 162, IRON3);
    box(c, -90, -200, 180, 24, MUSTARD2, 6);
    rect6(c, -90, -200, 180, 5, shade(MUSTARD2, 0.25));
  }),
  P2("manhole", "Manhole cover", "street", 120, 12, (c) => {
    oval2(c, 0, -6, 58, 6, "#3d3d46");
    oval2(c, 0, -8, 52, 4.5, "#505060");
    c.strokeStyle = shade("#505060", -0.4);
    c.lineWidth = 1.5;
    for (let x = -36; x <= 36; x += 12) line5(c, [[x, -12], [x, -4]], shade("#505060", -0.3), 1.5);
  }),
  // ───────────────────────── market ─────────────────────────
  P2("simit-cart", "Simit cart", "market", 260, 260, (c) => {
    floorShadow(c, 240);
    wheel(c, -90, -28, 28, "#c9ccd6", "#1d1d24");
    wheel(c, 90, -28, 28, "#c9ccd6", "#1d1d24");
    box(c, -120, -150, 240, 90, RED3, 8);
    rect6(c, -112, -134, 224, 6, shade(RED3, 0.15));
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 6; i++) {
        const x = -88 + i * 30 + r % 2 * 14;
        const y = -116 + r * 18;
        c.beginPath();
        c.ellipse(x, y, 13, 8, 0, 0, Math.PI * 2);
        c.fillStyle = "#d28b2c";
        c.fill();
        c.strokeStyle = shade("#d28b2c", -0.5);
        c.lineWidth = 1.5;
        c.stroke();
        c.beginPath();
        c.ellipse(x, y, 5, 3, 0, 0, Math.PI * 2);
        c.fillStyle = "#7b4a1e";
        c.fill();
        for (let k = 0; k < 4; k++) disc(c, x + Math.cos(k * 1.6) * 9, y + Math.sin(k * 1.6) * 5, 1.2, "#f3e6c4", false);
      }
    }
    awning(c, -140, -208, 280, 40, WHITE2, RED3, 7);
    rect6(c, -136, -170, 272, 14, shade(RED3, -0.2));
    rect6(c, -134, -170, 8, 170, IRON3);
    rect6(c, 126, -170, 8, 170, IRON3);
    rrect(c, -58, -252, 116, 40, 6);
    c.fillStyle = MUSTARD2;
    c.fill();
    c.strokeStyle = shade(MUSTARD2, -0.5);
    c.lineWidth = 2;
    c.stroke();
    text(c, "S\u0130M\u0130T", 0, -232, 22, INK8, "center", 900);
    rect6(c, -140, -32, 8, 4, IRON3);
  }),
  P2("ice-cream-cart", "Ice cream cart", "market", 260, 300, (c) => {
    floorShadow(c, 240);
    wheel(c, -86, -30, 30, "#c9ccd6", "#1d1d24");
    wheel(c, 86, -30, 30, "#c9ccd6", "#1d1d24");
    box(c, -110, -150, 220, 100, TEAL3, 10);
    rect6(c, -100, -140, 200, 12, shade(TEAL3, 0.25));
    box(c, -110, -170, 220, 22, WHITE2, 8);
    rect6(c, -110, -162, 220, 6, RED3);
    rect6(c, -3, -290, 6, 150, IRON3);
    c.beginPath();
    c.moveTo(-130, -210);
    c.quadraticCurveTo(-100, -300, 0, -300);
    c.quadraticCurveTo(100, -300, 130, -210);
    c.closePath();
    c.fillStyle = PINK2;
    c.fill();
    c.beginPath();
    c.moveTo(0, -300);
    c.quadraticCurveTo(100, -300, 130, -210);
    c.lineTo(80, -214);
    c.quadraticCurveTo(60, -270, 0, -296);
    c.closePath();
    c.fillStyle = shade(PINK2, -0.14);
    c.fill();
    for (const x of [-96, -48, 0, 48, 96]) rect6(c, x - 3, -212, 6, 6, WHITE2);
    for (let i = 0; i < 5; i++) {
      const x = -92 + i * 46;
      poly(c, [[x - 12, -174], [x + 12, -174], [x, -146]], "#d9a04a");
      rect6(c, x - 13, -184, 26, 12, [MUSTARD2, PINK2, "#ffb3d1", "#9fd2ee", WHITE2][i]);
    }
    text(c, "DONDURMA", 0, -110, 16, WHITE2, "center", 900);
  }),
  P2("fruit-stall", "Fruit stall", "market", 320, 300, (c) => {
    floorShadow(c, 300);
    counter2(c, -150, -120, 300, 110, WOOD4);
    const colors = [RED3, ORANGE, MUSTARD2, "#9cd44a"];
    for (let i = 0; i < 4; i++) {
      const x = -140 + i * 74;
      rect6(c, x, -150, 64, 32, WOOD_L2);
      for (let k = 0; k < 4; k++) disc(c, x + 10 + k * 14, -140, 7, colors[(i + k) % colors.length], true);
    }
    for (let i = 0; i < 9; i++) {
      disc(c, -120 + i % 5 * 26 + (i > 4 ? 12 : 0), -128 - Math.floor(i / 5) * 6, 9, colors[i % colors.length], true);
    }
    awning(c, -170, -230, 340, 48, RED3, CREAM6, 8);
    rect6(c, -166, -184, 8, 184, IRON3);
    rect6(c, 158, -184, 8, 184, IRON3);
    rrect(c, -50, -206, 100, 24, 4);
    c.fillStyle = CREAM6;
    c.fill();
    text(c, "MEYVE", 0, -194, 14, RED3, "center", 900);
  }),
  P2("carpet-stall", "Carpet stall", "market", 320, 340, (c) => {
    floorShadow(c, 300);
    rect6(c, -150, -340, 8, 340, WOOD_D2);
    rect6(c, 142, -340, 8, 340, WOOD_D2);
    rect6(c, -150, -340, 300, 8, WOOD_D2);
    const rugs = [
      [-120, RED3, TEAL3],
      [-56, TEAL3, MUSTARD2],
      [8, MUSTARD2, RED3],
      [72, BLUE2, CREAM6]
    ];
    for (const [x, base, acc] of rugs) {
      rect6(c, x - 2, -330, 4, 10, WOOD_D2);
      rect6(c, x, -330, 56, 180, base);
      rect6(c, x + 4, -322, 48, 164, shade(base, -0.08));
      rect6(c, x + 4, -300, 48, 6, acc);
      rect6(c, x + 4, -160, 48, 6, acc);
      for (let k = 0; k < 3; k++) poly(c, [[x + 28, -280 + k * 50], [x + 40, -254 + k * 50], [x + 28, -228 + k * 50], [x + 16, -254 + k * 50]], acc);
      rect6(c, x, -150, 56, 8, shade(base, -0.3));
    }
    box(c, -150, -66, 300, 66, "#a7603a", 10);
    rect6(c, -140, -60, 280, 6, MUSTARD2);
    rect6(c, -140, -26, 280, 6, TEAL3);
    for (let x = -132; x < 140; x += 26) poly(c, [[x, -46], [x + 8, -40], [x, -34], [x - 8, -40]], RED3);
  }),
  P2("spice-stall", "Spice stall", "market", 300, 280, (c) => {
    floorShadow(c, 280);
    counter2(c, -140, -120, 280, 120, WOOD4);
    const heaps = [[-110, RED3], [-60, MUSTARD2], [-10, "#b8432a"], [40, "#7a9a2a"], [90, "#d9782a"]];
    for (const [x, col] of heaps) {
      c.beginPath();
      c.arc(x, -124, 22, Math.PI, 0);
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = shade(col, -0.5);
      c.lineWidth = 2;
      c.stroke();
      oval2(c, x, -124, 22, 5, shade(col, -0.2));
      for (let k = 0; k < 4; k++) disc(c, x - 10 + k * 7, -130 - k % 2 * 4, 2, shade(col, 0.25), false);
    }
    for (let i = 0; i < 4; i++) {
      box(c, -130 + i * 36, -200, 26, 40, CREAM6, 6);
      rect6(c, -128 + i * 36, -186, 22, 14, [RED3, MUSTARD2, GREEN2, BLUE2][i]);
    }
    awning(c, -160, -240, 320, 40, MUSTARD2, RED3, 8);
    rect6(c, -156, -220, 8, 220, IRON3);
    rect6(c, 148, -220, 8, 220, IRON3);
    text(c, "BAHARAT", 0, -208, 11, INK8, "center", 900);
  }),
  P2("lantern-stall", "Lantern stall", "market", 300, 340, (c) => {
    floorShadow(c, 280);
    rect6(c, -140, -330, 280, 8, WOOD_D2);
    const cols = [RED3, MUSTARD2, TEAL3, PINK2, ORANGE];
    for (let i = 0; i < 5; i++) {
      const x = -110 + i * 55;
      const y = -250 + i % 2 * 30;
      line5(c, [[x, -330], [x, y - 22]], INK8, 1.5);
      c.beginPath();
      c.moveTo(x - 10, y - 20);
      c.lineTo(x + 10, y - 20);
      c.lineTo(x + 16, y);
      c.lineTo(x + 10, y + 22);
      c.lineTo(x - 10, y + 22);
      c.lineTo(x - 16, y);
      c.closePath();
      c.fillStyle = cols[i];
      c.fill();
      c.strokeStyle = shade(cols[i], -0.5);
      c.lineWidth = 2;
      c.stroke();
      rect6(c, x - 9, y - 4, 4, 8, "rgba(255,255,255,0.5)");
      rect6(c, x - 12, y - 24, 24, 4, WOOD_D2);
    }
    counter2(c, -130, -120, 260, 120, WOOD4);
    for (let i = 0; i < 3; i++) {
      box(c, -120 + i * 80, -150, 66, 30, CREAM6, 6);
      rect6(c, -116 + i * 80, -144, 58, 4, MUSTARD2);
    }
    rect6(c, -146, -220, 8, 220, IRON3);
    rect6(c, 138, -220, 8, 220, IRON3);
  }),
  P2("pottery", "Pottery", "market", 200, 120, (c) => {
    floorShadow(c, 190);
    rect6(c, -96, -40, 8, 40, WOOD_D2);
    rect6(c, 88, -40, 8, 40, WOOD_D2);
    rect6(c, -100, -100, 200, 12, WOOD4);
    box(c, -100, -42, 200, 12, WOOD_L2, 4);
    const jug = (x, y, s, col) => {
      c.beginPath();
      c.moveTo(x - s * 0.5, y);
      c.quadraticCurveTo(x - s * 0.9, y - s * 0.6, x - s * 0.4, y - s);
      c.lineTo(x + s * 0.4, y - s);
      c.quadraticCurveTo(x + s * 0.9, y - s * 0.6, x + s * 0.5, y);
      c.closePath();
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = shade(col, -0.5);
      c.lineWidth = 2;
      c.stroke();
      rect6(c, x - s * 0.22, y - s * 1.1, s * 0.44, s * 0.12, shade(col, -0.2));
      rect6(c, x + s * 0.2, y - s * 0.8, s * 0.22, s * 0.04, shade(col, -0.4));
      rect6(c, x - s * 0.3, y - s * 0.55, s * 0.6, s * 0.06, shade(col, 0.25));
    };
    jug(-72, -98, 20, "#c46a3a");
    jug(-30, -98, 18, "#2f8f83");
    jug(14, -98, 22, "#d9a04a");
    jug(60, -98, 19, "#c8432f");
    jug(-70, -40, 40, "#2f5f9e");
    jug(-20, -40, 44, "#e0a526");
    jug(34, -40, 36, "#c8432f");
    jug(80, -40, 30, "#c46a3a");
  }),
  P2("hookah", "Hookah", "market", 70, 150, (c) => {
    floorShadow(c, 60, 0, 0.18);
    c.beginPath();
    c.moveTo(-16, -4);
    c.quadraticCurveTo(-30, -60, -10, -80);
    c.lineTo(10, -80);
    c.quadraticCurveTo(30, -60, 16, -4);
    c.closePath();
    c.fillStyle = BRASS4;
    c.fill();
    c.strokeStyle = shade(BRASS4, -0.5);
    c.lineWidth = 2;
    c.stroke();
    rect6(c, -10, -62, 20, 8, RED3);
    rect6(c, -6, -80, 12, 6, shade(BRASS4, -0.2));
    rect6(c, -4, -100, 8, 22, shade(BRASS4, -0.1));
    c.beginPath();
    c.moveTo(-18, -100);
    c.lineTo(18, -100);
    c.lineTo(10, -118);
    c.lineTo(-10, -118);
    c.closePath();
    c.fillStyle = shade(BRASS4, 0.05);
    c.fill();
    rect6(c, -12, -116, 24, 4, shade(BRASS4, -0.3));
    line5(c, [[16, -70], [40, -60], [44, -30], [30, -10]], INK8, 3);
    disc(c, 30, -10, 4, RED3);
    oval2(c, 0, -120, 9, 3, "#ff8a2a");
  }),
  P2("copper-pots", "Copper pots", "market", 160, 120, (c) => {
    floorShadow(c, 150);
    const pot2 = (x, y, rw, hh) => {
      c.beginPath();
      c.moveTo(x - rw, y - hh);
      c.lineTo(x + rw, y - hh);
      c.lineTo(x + rw * 0.8, y);
      c.lineTo(x - rw * 0.8, y);
      c.closePath();
      c.fillStyle = COPPER2;
      c.fill();
      c.strokeStyle = shade(COPPER2, -0.5);
      c.lineWidth = 2;
      c.stroke();
      oval2(c, x, y - hh, rw, 5, shade(COPPER2, 0.25));
      rect6(c, x + rw * 0.2, y - hh, rw * 0.5, hh, shade(COPPER2, -0.15));
      rect6(c, x - rw * 1.2, y - hh * 0.6, rw * 2.4, 3, shade(COPPER2, -0.4));
    };
    pot2(-40, -36, 34, 40);
    pot2(38, -36, 30, 34);
    pot2(-40, -76, 22, 26);
    line5(c, [[40, -68], [60, -110], [62, -116]], shade(COPPER2, -0.3), 3);
    oval2(c, 62, -116, 8, 6, shade(COPPER2, 0.1));
    c.beginPath();
    c.ellipse(-4, -112, 22, 6, 0, 0, Math.PI * 2);
    c.fillStyle = shade(COPPER2, 0.15);
    c.fill();
    c.strokeStyle = shade(COPPER2, -0.5);
    c.lineWidth = 2;
    c.stroke();
    disc(c, -4, -114, 4, WOOD_D2, false);
  }),
  P2("fish-stall", "Fish stall", "market", 300, 260, (c) => {
    floorShadow(c, 290);
    box(c, -140, -90, 280, 90, "#dfe9ee", 6);
    rect6(c, -134, -84, 268, 10, "#f7fbfd");
    rect6(c, -140, -40, 280, 14, shade("#dfe9ee", -0.1));
    const fish = (x, y, col, s) => {
      c.beginPath();
      c.ellipse(x, y, 20 * s, 9 * s, 0, 0, Math.PI * 2);
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = shade(col, -0.5);
      c.lineWidth = 1.5;
      c.stroke();
      poly(c, [[x + 16 * s, y], [x + 30 * s, y - 8 * s], [x + 30 * s, y + 8 * s]], col);
      disc(c, x - 10 * s, y - 2 * s, 1.8 * s, INK8, false);
    };
    fish(-100, -80, "#7a9ec0", 1);
    fish(-40, -84, "#9aaec0", 0.9);
    fish(20, -80, "#5f8fb0", 1.1);
    fish(80, -82, "#8ab0c8", 0.95);
    awning(c, -150, -230, 300, 42, BLUE2, WHITE2, 8);
    rect6(c, -146, -190, 8, 190, IRON3);
    rect6(c, 138, -190, 8, 190, IRON3);
    rrect(c, -52, -206, 104, 24, 4);
    c.fillStyle = CREAM6;
    c.fill();
    text(c, "BALIK", 0, -194, 14, BLUE2, "center", 900);
  }),
  // ───────────────────────── sign ─────────────────────────
  P2("shop-sign", "Shop sign", "sign", 240, 120, (c) => {
    rect6(c, -90, -120, 4, 14, IRON3);
    rect6(c, 86, -120, 4, 14, IRON3);
    box(c, -120, -106, 240, 100, TEAL3, 10);
    rect6(c, -110, -96, 220, 80, shade(TEAL3, -0.08));
    rect6(c, -120, -106, 240, 6, shade(TEAL3, 0.25));
    rect6(c, -110, -96, 220, 4, MUSTARD2);
    rect6(c, -110, -22, 220, 4, MUSTARD2);
    text(c, "BAKKAL", 0, -56, 32, CREAM6, "center", 900);
  }),
  P2("billboard", "Billboard", "sign", 600, 420, (c) => {
    floorShadow(c, 300, 0, 0.14);
    legs2(c, [-170, 170], -110, 0, IRON3, 14);
    rect6(c, -190, -110, 380, 10, IRON_L);
    rect6(c, -300, -420, 600, 320, "#f0e7cc");
    box(c, -300, -420, 600, 320, MUSTARD2, 8);
    rect6(c, -284, -404, 568, 288, "#fbf4dc");
    rect6(c, -284, -404, 568, 60, RED3);
    text(c, "S\u0130NEMA", 0, -374, 46, CREAM6, "center", 900);
    rect6(c, -284, -344, 568, 150, "#9fd2ee");
    disc(c, 190, -320, 36, MUSTARD2, false);
    poly(c, [[-284, -220], [-120, -300], [-40, -250], [60, -320], [284, -210], [284, -190], [-284, -190]], GREEN2);
    rect6(c, -284, -196, 568, 36, BLUE2);
    text(c, "YE\u015E\u0130L\xC7AM", 0, -116, 40, RED3, "center", 900);
    rect6(c, -200, -92, 400, 10, shade("#fbf4dc", -0.2));
  }),
  P2("neon-sign", "Neon sign", "sign", 300, 140, (c) => {
    rrect(c, -150, -140, 300, 140, 12);
    c.fillStyle = "#23232b";
    c.fill();
    rrect(c, -150, -140, 300, 140, 12);
    c.strokeStyle = "#5a5a66";
    c.lineWidth = 3;
    c.stroke();
    glow(c, 0, -70, 150, PINK2, 0.4);
    text(c, "CAFE", 0, -70, 64, shade(PINK2, 0.25), "center", 900);
    text(c, "CAFE", 0, -70, 64, PINK2, "center", 900);
    rect6(c, -120, -28, 240, 3, "#ff9ed0");
  }, { idle: "flicker" }),
  P2("street-sign", "Street sign", "sign", 80, 330, (c) => {
    floorShadow(c, 60);
    pole(c, 0, -330, 0, 8, IRON3);
    rect6(c, -1.5, -330, 3, 330, IRON_L);
    box(c, -36, -300, 72, 40, BLUE2, 4);
    text(c, "SOKAK", 0, -280, 13, WHITE2, "center", 900);
    box(c, -36, -248, 72, 30, WHITE2, 4);
    text(c, "\u2191", 0, -233, 18, INK8, "center", 900);
    c.beginPath();
    c.moveTo(-30, -226);
    c.lineTo(10, -226);
    c.lineTo(10, -236);
    c.lineTo(30, -220);
    c.closePath();
    c.fillStyle = RED3;
    c.fill();
    box(c, -26, -200, 52, 26, MUSTARD2, 3);
    text(c, "\xC7AY", 0, -187, 12, INK8, "center", 900);
  }),
  P2("cinema-poster", "Cinema poster", "sign", 160, 230, (c) => {
    floorShadow(c, 120, 0, 0.14);
    line5(c, [[-40, 0], [-6, -10]], WOOD_D2, 5);
    line5(c, [[40, 0], [6, -10]], WOOD_D2, 5);
    line5(c, [[0, -4], [0, -20]], WOOD_D2, 4);
    box(c, -80, -230, 160, 220, WOOD4, 6);
    rect6(c, -70, -220, 140, 200, "#f3e8cc");
    rect6(c, -70, -220, 140, 66, RED3);
    text(c, "F\u0130LM", 0, -188, 24, CREAM6, "center", 900);
    oval2(c, 0, -116, 26, 28, "#f1c89c");
    poly(c, [[-26, -126], [0, -150], [26, -126], [18, -128], [0, -138], [-18, -128]], INK8);
    disc(c, -10, -118, 3, INK8, false);
    disc(c, 10, -118, 3, INK8, false);
    rect6(c, -44, -86, 88, 4, RED3);
    text(c, "YILDIZ", 0, -62, 16, INK8, "center", 900);
    rect6(c, -62, -46, 124, 10, MUSTARD2);
    rect6(c, -62, -28, 124, 4, "#8a6a4a");
  }),
  P2("arrow-sign", "Arrow sign", "sign", 200, 300, (c) => {
    floorShadow(c, 60, 0, 0.14);
    rect6(c, -6, -300, 12, 300, IRON3);
    rect6(c, -4, -300, 3, 300, IRON_L);
    c.beginPath();
    c.moveTo(-96, -262);
    c.lineTo(44, -262);
    c.lineTo(70, -240);
    c.lineTo(44, -218);
    c.lineTo(-96, -218);
    c.closePath();
    c.fillStyle = RED3;
    c.fill();
    c.strokeStyle = shade(RED3, -0.5);
    c.lineWidth = 2.5;
    c.stroke();
    text(c, "OTEL", -20, -240, 20, CREAM6, "center", 900);
    c.beginPath();
    c.moveTo(-96, -190);
    c.lineTo(20, -190);
    c.lineTo(-20, -168);
    c.lineTo(-96, -168);
    c.closePath();
    c.fillStyle = BLUE2;
    c.fill();
    c.strokeStyle = shade(BLUE2, -0.5);
    c.stroke();
    text(c, "AKTAR", -40, -180, 16, CREAM6, "center", 900);
    c.beginPath();
    c.moveTo(-96, -120);
    c.lineTo(-14, -120);
    c.lineTo(-14, -110);
    c.lineTo(-96, -110);
    c.closePath();
    c.fillStyle = MUSTARD2;
    c.fill();
  }),
  // ───────────────────────── tech ─────────────────────────
  P2("computer", "Computer", "tech", 140, 130, (c) => {
    floorShadow(c, 130, 0, 0.18);
    rect6(c, -12, -30, 24, 26, "#d8dbe2");
    rect6(c, -40, -6, 80, 6, "#d8dbe2");
    box(c, -70, -124, 140, 100, "#e2e5eb", 8);
    rect6(c, -58, -112, 116, 78, "#2c2f38");
    rrect(c, -50, -106, 100, 66, 8);
    c.fillStyle = "#7fd0a0";
    c.fill();
    rect6(c, -42, -96, 60, 4, "#e8f6ec");
    rect6(c, -42, -84, 40, 4, "#e8f6ec");
    rect6(c, -42, -72, 52, 4, "#e8f6ec");
    rect6(c, -42, -60, 28, 4, "#e8f6ec");
    disc(c, 46, -100, 3, "#4fd16b", false);
    rect6(c, 30, -114, 16, 4, "#9aa0ac");
    box(c, -58, -28, 116, 8, "#9aa0ac", 2);
    rect6(c, -48, -22, 96, 2, "#7a7f8a");
  }),
  P2("laptop", "Laptop", "tech", 90, 60, (c) => {
    floorShadow(c, 84, 0, 0.14);
    c.beginPath();
    c.moveTo(-40, -52);
    c.lineTo(40, -52);
    c.lineTo(42, -6);
    c.lineTo(-42, -6);
    c.closePath();
    c.fillStyle = "#d8dbe2";
    c.fill();
    c.strokeStyle = shade("#d8dbe2", -0.5);
    c.lineWidth = 2;
    c.stroke();
    rect6(c, -34, -46, 68, 34, "#2c2f38");
    rect6(c, -30, -42, 60, 26, "#5fb0ff");
    rect6(c, -26, -36, 30, 3, "rgba(255,255,255,0.7)");
    rect6(c, -26, -30, 40, 3, "rgba(255,255,255,0.5)");
    box(c, -50, -6, 100, 6, "#b8bcc6", 3);
    rect6(c, -8, -6, 16, 2, "#7a7f8a");
  }),
  P2("movie-camera", "Movie camera", "tech", 160, 330, (c) => {
    floorShadow(c, 120, 0, 0.18);
    line5(c, [[-44, 0], [-12, -150]], WOOD_D2, 6);
    line5(c, [[44, 0], [12, -150]], WOOD_D2, 6);
    line5(c, [[0, 0], [0, -150]], WOOD_D2, 6);
    rect6(c, -28, -152, 56, 12, IRON3);
    box(c, -58, -250, 110, 100, "#2c2f38", 10);
    rect6(c, -58, -250, 110, 8, BRASS4);
    disc(c, -6, -270, 36, "#3a3f4c", true);
    disc(c, -6, -270, 26, "#1e2028", false);
    disc(c, -6, -270, 8, BRASS4, false);
    rect6(c, 52, -230, 46, 30, "#22252e");
    disc(c, 96, -215, 24, "#1e2028", true);
    disc(c, 96, -215, 14, "#4a6a8a", false);
    disc(c, 92, -220, 4, "rgba(255,255,255,0.7)", false);
    rect6(c, -50, -230, 30, 18, shade("#2c2f38", 0.12));
    line5(c, [[-58, -200], [-74, -200]], shade("#2c2f38", -0.3), 6);
  }),
  P2("clapperboard", "Clapperboard", "tech", 60, 55, (c) => {
    floorShadow(c, 56, 0, 0.14);
    box(c, -28, -40, 56, 40, "#2c2f38", 3);
    for (let i = 0; i < 4; i++) {
      poly(c, [[-28 + i * 16, -40], [-20 + i * 16, -40], [-28 + i * 16 + 8, -48], [-28 + i * 16 + 0, -48]], i % 2 ? WHITE2 : INK8);
    }
    poly(c, [[-30, -48], [30, -48], [30, -40], [-30, -40]], "#2c2f38");
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(-28 + i * 16, -48);
      c.lineTo(-20 + i * 16, -48);
      c.lineTo(-12 + i * 16, -40);
      c.lineTo(-20 + i * 16, -40);
      c.closePath();
      c.fillStyle = i % 2 ? INK8 : WHITE2;
      c.fill();
    }
    rect6(c, -22, -30, 44, 2, WHITE2);
    rect6(c, -22, -24, 30, 2, WHITE2);
    rect6(c, -22, -18, 36, 2, WHITE2);
    rect6(c, -22, -12, 26, 2, WHITE2);
    rect6(c, -22, -6, 26, 2, WHITE2);
  }),
  P2("spotlight", "Spotlight", "tech", 120, 330, (c) => {
    floorShadow(c, 80, 0, 0.18);
    line5(c, [[-30, 0], [0, -150]], IRON3, 6);
    line5(c, [[30, 0], [0, -150]], IRON3, 6);
    line5(c, [[0, 0], [0, -150]], IRON3, 6);
    rect6(c, -3, -150, 6, 140, IRON_L);
    c.beginPath();
    c.moveTo(-40, -330);
    c.lineTo(40, -330);
    c.lineTo(20, -250);
    c.lineTo(-20, -250);
    c.closePath();
    c.fillStyle = "#2c2f38";
    c.fill();
    c.strokeStyle = shade("#2c2f38", -0.5);
    c.lineWidth = 2;
    c.stroke();
    disc(c, 0, -330, 40, "#dfe3ea", true);
    disc(c, 0, -330, 30, "#fff8dc", false);
    disc(c, 0, -330, 12, "#ffffff", false);
    rect6(c, -36, -254, 72, 4, "#8a909c");
    rect6(c, -12, -256, 24, 2, "#8a909c");
    poly(c, [[-38, -328], [38, -328], [120, -20], [-120, -20]], "rgba(255,240,180,0.12)");
    line5(c, [[-36, -252], [-28, -280]], shade(IRON3, 0.3), 2);
  }),
  P2("microphone-stand", "Microphone stand", "tech", 70, 300, (c) => {
    floorShadow(c, 60, 0, 0.18);
    line5(c, [[-28, 0], [0, -20]], IRON3, 4);
    line5(c, [[28, 0], [0, -20]], IRON3, 4);
    line5(c, [[0, -20], [0, -270]], IRON3, 5);
    line5(c, [[0, -20], [-6, -22]], IRON3, 4);
    disc(c, 0, -270, 18, "#2c2f38", true);
    box(c, -14, -290, 28, 28, "#6a7080", 12);
    rect6(c, -10, -286, 20, 4, shade("#6a7080", 0.25));
    rect6(c, -8, -272, 16, 4, shade("#6a7080", -0.15));
    disc(c, 0, -262, 2, INK8, false);
    rect6(c, -12, -266, 24, 2, "#3a3f4c");
  }),
  P2("jukebox", "Jukebox", "tech", 160, 260, (c) => {
    floorShadow(c, 150);
    box(c, -76, -40, 152, 40, "#2c2f38", 6);
    box(c, -76, -200, 152, 166, RED3, 14);
    rect6(c, -66, -190, 132, 26, shade(RED3, -0.1));
    rect6(c, -60, -150, 120, 80, "#2c2f38");
    rrect(c, -54, -144, 108, 70, 14);
    c.fillStyle = "#7fb9d6";
    c.fill();
    for (let i = 0; i < 4; i++) {
      rect6(c, -44 + i * 26, -140, 10, 60, ["#ffd77a", "#ff9e3a", "#fff2c0", "#ffd77a"][i]);
      rect6(c, -44 + i * 26 + 2, -140, 2, 60, "rgba(255,255,255,0.8)");
    }
    for (let i = 0; i < 6; i++) rect6(c, -66 + i * 20, -64, 14, 14, CREAM6);
    c.beginPath();
    c.arc(0, -200, 68, Math.PI, 0);
    c.closePath();
    c.fillStyle = CHROME2;
    c.fill();
    c.strokeStyle = shade(CHROME2, -0.5);
    c.lineWidth = 2;
    c.stroke();
    rect6(c, -40, -230, 80, 6, shade(CHROME2, -0.2));
    rect6(c, -60, -200, 120, 4, BRASS4);
  }),
  P2("arcade-cabinet", "Arcade cabinet", "tech", 140, 300, (c) => {
    floorShadow(c, 130);
    box(c, -66, -40, 132, 40, "#2c2f38", 4);
    poly(c, [[-70, -40], [70, -40], [60, -170], [-60, -170]], "#2c2f38");
    box(c, -68, -300, 136, 128, "#2c2f38", 10);
    rect6(c, -58, -290, 116, 100, "#171920");
    rect6(c, -50, -282, 100, 84, "#3a1a4a");
    rect6(c, -42, -220, 84, 6, "#5fe0ff");
    poly(c, [[-4, -236], [6, -236], [14, -232], [0, -218], [-14, -232]], "#5fe0ff");
    for (let i = 0; i < 5; i++) rect6(c, -40 + i * 16, -268, 10, 10, ["#ff6a4a", "#ffd77a", "#5fe0ff", "#a6ff6a", "#ff6ad8"][i]);
    rect6(c, -58, -190, 116, 14, shade("#2c2f38", 0.2));
    box(c, -62, -170, 124, 26, RED3, 6);
    disc(c, -30, -157, 7, INK8);
    disc(c, 0, -157, 4, "#3a3f4c");
    disc(c, 24, -160, 5, MUSTARD2);
    disc(c, 42, -150, 5, "#4fd16b");
    rect6(c, -62, -144, 124, 4, shade(RED3, -0.3));
    rect6(c, -60, -140, 120, 140, "#2c2f38");
    rect6(c, -46, -120, 92, 8, "#4a505c");
    for (let i = 0; i < 4; i++) rect6(c, -46 + i * 24, -112, 16, 4, shade("#4a505c", 0.2));
    text(c, "OYUN", 0, -66, 14, MUSTARD2, "center", 900);
  }),
  P2("atm", "Cash machine", "tech", 120, 280, (c) => {
    floorShadow(c, 110);
    box(c, -56, -280, 112, 280, "#3a4a6a", 10);
    rect6(c, -56, -280, 112, 8, shade("#3a4a6a", 0.2));
    rect6(c, -48, -250, 96, 14, "#c9ccd6");
    text(c, "ATM", 0, -243, 10, "#3a4a6a", "center", 900);
    rect6(c, -40, -222, 80, 50, "#1d1d24");
    rect6(c, -36, -218, 72, 42, "#7fd0a0");
    rect6(c, -30, -212, 50, 4, "#e8f6ec");
    rect6(c, -30, -202, 32, 4, "#e8f6ec");
    rect6(c, -30, -192, 60, 4, "#e8f6ec");
    rect6(c, -28, -162, 56, 6, "#1d1d24");
    rect6(c, -24, -150, 48, 6, "#1d1d24");
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) rect6(c, -30 + k * 20, -130 + r * 16, 14, 11, shade("#c9ccd6", r === 3 ? -0.2 : 0));
    rect6(c, -40, -60, 80, 8, "#1d1d24");
    rect6(c, -36, -52, 72, 3, MUSTARD2);
    box(c, -56, -40, 112, 40, "#3a4a6a", 4);
    rect6(c, -40, -26, 80, 4, shade("#3a4a6a", -0.3));
  }),
  P2("vending-machine", "Vending machine", "tech", 170, 330, (c) => {
    floorShadow(c, 160);
    box(c, -85, -330, 170, 330, "#2c5a8a", 12);
    rect6(c, -76, -318, 152, 220, "#2c3a4a");
    rect6(c, -66, -308, 132, 200, "#8fd0ea");
    const cols = [RED3, GREEN2, MUSTARD2, BLUE2, ORANGE, TEAL3];
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 5; k++) {
        const x = -58 + k * 26;
        const y = -296 + r * 46;
        rrect(c, x, y, 18, 34, 5);
        c.fillStyle = cols[(r * 5 + k) % cols.length];
        c.fill();
        c.strokeStyle = shade(INK8, 0.1);
        c.lineWidth = 1;
        c.stroke();
        rect6(c, x + 4, y - 4, 10, 4, WHITE2);
      }
    }
    rect6(c, 56, -308, 36, 80, "#2c3a4a");
    disc(c, 74, -290, 5, MUSTARD2);
    disc(c, 74, -272, 5, RED3);
    disc(c, 74, -254, 5, GREEN2);
    rect6(c, -66, -88, 132, 52, "#1d2330");
    rect6(c, -56, -78, 50, 30, "#0e1218");
    rect6(c, -48, -72, 34, 4, "#8fd0ea");
    rect6(c, 30, -68, 30, 22, "#3a3f4c");
    rect6(c, -76, -28, 152, 28, "#2c5a8a");
    rect6(c, -60, -22, 120, 4, shade("#2c5a8a", -0.3));
  }),
  P2("satellite-dish", "Satellite dish", "tech", 200, 220, (c) => {
    floorShadow(c, 120, 0, 0.18);
    dish(c, 0, 0, 180, { metal: "#e9ecf1", dark: "#4a505c", angle: -0.9 });
  }),
  P2("robot-retro", "Retro robot", "tech", 180, 300, (c) => {
    floorShadow(c, 150);
    rect6(c, -40, -70, 26, 70, "#8a909c");
    rect6(c, 14, -70, 26, 70, "#8a909c");
    box(c, -52, -22, 42, 22, "#4a505c", 6);
    box(c, 10, -22, 42, 22, "#4a505c", 6);
    box(c, -62, -160, 124, 96, "#c9a14a", 14);
    rect6(c, -48, -146, 96, 34, "#3a4a6a");
    disc(c, -28, -130, 6, "#ff6a4a");
    disc(c, 0, -130, 6, "#ffd77a");
    disc(c, 28, -130, 6, "#4fd16b");
    rect6(c, -36, -100, 72, 16, "#8a6a2a");
    for (let i = 0; i < 4; i++) rect6(c, -30 + i * 16, -98, 8, 12, "#3a2a14");
    line5(c, [[-64, -140], [-96, -110], [-94, -80]], "#8a909c", 10);
    line5(c, [[64, -140], [96, -110], [94, -80]], "#8a909c", 10);
    disc(c, -94, -76, 10, "#c9a14a");
    disc(c, 94, -76, 10, "#c9a14a");
    rect6(c, -12, -170, 24, 12, "#8a909c");
    box(c, -46, -236, 92, 70, "#d8dbe2", 18);
    rect6(c, -34, -224, 68, 30, "#1d1d24");
    rect6(c, -28, -218, 56, 18, "#7fd0ea");
    disc(c, -14, -210, 3, INK8, false);
    disc(c, 14, -210, 3, INK8, false);
    line5(c, [[0, -236], [0, -262]], "#8a909c", 4);
    disc(c, 0, -268, 8, "#ff6a4a");
  }),
  P2("server-rack", "Server rack", "tech", 140, 380, (c) => {
    floorShadow(c, 130);
    box(c, -70, -380, 140, 380, "#2c2f38", 8);
    rect6(c, -60, -370, 120, 360, "#1e2028");
    for (let u = 0; u < 9; u++) {
      const y = -360 + u * 38;
      rect6(c, -56, y, 112, 30, "#2c3240");
      rect6(c, -52, y + 4, 60, 3, "#4a505c");
      rect6(c, -52, y + 10, 40, 3, "#4a505c");
      rect6(c, -52, y + 16, 50, 3, "#4a505c");
      disc(c, 40, y + 9, 3, u % 3 === 0 ? "#ff6a4a" : "#4fd16b", false);
      disc(c, 50, y + 9, 3, "#4fd16b", false);
      disc(c, 40, y + 20, 3, "#ffd77a", false);
    }
    rect6(c, -70, -380, 140, 6, shade("#2c2f38", 0.25));
  }),
  P2("megaphone", "Megaphone", "tech", 60, 40, (c) => {
    floorShadow(c, 50, 0, 0.14);
    c.beginPath();
    c.moveTo(-18, -26);
    c.lineTo(10, -40);
    c.lineTo(10, -8);
    c.lineTo(-18, -18);
    c.closePath();
    c.fillStyle = RED3;
    c.fill();
    c.strokeStyle = shade(RED3, -0.5);
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.moveTo(10, -40);
    c.lineTo(26, -48);
    c.lineTo(26, 0);
    c.lineTo(10, -8);
    c.closePath();
    c.fillStyle = shade(RED3, 0.1);
    c.fill();
    c.stroke();
    rect6(c, 26, -48, 4, 48, shade(RED3, -0.2));
    rect6(c, -26, -20, 12, 8, "#2c2f38");
    box(c, -30, -22, 6, 14, INK8, 2);
    for (let i = 1; i <= 2; i++) {
      c.beginPath();
      c.arc(30, -24, 6 + i * 6, -0.6, 0.6);
      c.strokeStyle = "rgba(40,40,50,0.5)";
      c.lineWidth = 2;
      c.stroke();
    }
  })
];

// src/props/nature.ts
function item(id, name, cat2, w, h, draw, idle) {
  return idle ? { id, name, cat: cat2, w, h, idle, draw } : { id, name, cat: cat2, w, h, draw };
}
function ell(c, x, y, rx, ry, col, outline2 = true) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  c.fillStyle = vgrad(c, y - ry, y + ry, [
    [0, shade(col, 0.12)],
    [1, shade(col, -0.16)]
  ]);
  c.fill();
  if (outline2) {
    c.strokeStyle = shade(col, -0.55);
    c.lineWidth = 2.5;
    c.stroke();
  }
}
function strokePts(c, pts2, col, lw) {
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
}
function limb(c, pts2, col, lw) {
  strokePts(c, pts2, shade(col, -0.5), lw + 5);
  strokePts(c, pts2, col, lw);
}
function qpts(a, b, k, n = 14) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * k[0] + t * t * b[0], u * u * a[1] + 2 * u * t * k[1] + t * t * b[1]]);
  }
  return out;
}
function eye(c, x, y, r) {
  disc(c, x, y, r, "#ffffff");
  disc(c, x + r * 0.18, y + r * 0.12, r * 0.55, "#1d1d24", false);
  disc(c, x + r * 0.02, y - r * 0.28, r * 0.22, "#ffffff", false);
}
function legs3(c, xs, len, w, col, hoof = "#2b2a2e") {
  for (const x of xs) {
    box(c, x - w / 2, -len, w, len, col, w * 0.4);
    box(c, x - w / 2 - 1, -len * 0.16, w + 2, len * 0.16, hoof, w * 0.3);
  }
}
function plume(c, pts2, col) {
  shape(c, pts2, col);
}
function treeBare(c) {
  const r = rng(31);
  const branch = (x, y, ang, len, lw, depth) => {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    strokePts(c, [[x, y], [x2, y2]], "#5b3d22", lw);
    if (depth > 0) {
      branch(x2, y2, ang - 0.42 - r() * 0.3, len * 0.72, lw * 0.7, depth - 1);
      branch(x2, y2, ang + 0.42 + r() * 0.3, len * 0.72, lw * 0.7, depth - 1);
      if (depth > 2) branch(x2, y2, ang + (r() - 0.5) * 0.5, len * 0.55, lw * 0.6, depth - 2);
    }
  };
  floorShadow(c, 300);
  branch(0, 0, -Math.PI / 2 + 0.04, 300, 44, 4);
  ell(c, -14, -120, 9, 14, "#4a301a", false);
  ell(c, 12, -220, 7, 10, "#4a301a", false);
}
function treeBlossom(c) {
  const r = rng(21);
  floorShadow(c, 300);
  roundTree(c, 0, 0, 700, "#7a4f2a", "#f29ac2", r, "#ffd6ea");
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 150;
    disc(c, Math.cos(a) * d, -520 + Math.sin(a) * d * 0.8, 4 + r() * 3, r() < 0.5 ? "#ffffff" : "#ff7fb0", false);
  }
}
function bushShape(c) {
  floorShadow(c, 220);
  ell(c, -62, -40, 58, 40, "#3f9b4e");
  ell(c, 58, -42, 60, 42, "#3f9b4e");
  ell(c, 0, -62, 72, 60, "#58bd62");
  ell(c, -20, -84, 34, 20, "#7ad37a", false);
  disc(c, 40, -74, 6, "#e8483e", false);
  disc(c, -48, -52, 5, "#e8483e", false);
}
function flowerBed(c) {
  const r = rng(5);
  floorShadow(c, 300);
  for (let i = 0; i < 14; i++) {
    const x = -135 + i * 20 + r.range(-4, 4);
    ell(c, x, -40 + r.range(-6, 4), 13, 9, "#3f9b4e", false);
  }
  const cols = ["#ff6b8a", "#ffd23f", "#ffffff", "#b07cff"];
  for (let i = 0; i < 12; i++) {
    const x = -132 + r.range(0, 264);
    const y = -62 - r.range(0, 24);
    strokePts(c, [[x, -36], [x, y]], "#3f9b4e", 3);
    disc(c, x, y, 8, cols[i % 4], true);
  }
  box(c, -150, -34, 300, 34, "#6b4a2e", 8);
  strokePts(c, [[-140, -22], [140, -22]], "#4a301a", 2);
}
function flowersPot(c) {
  floorShadow(c, 70);
  const heads = [
    [-18, -94, "#ff6b8a"],
    [4, -106, "#ffd23f"],
    [22, -88, "#b07cff"]
  ];
  for (const [x, y] of heads) strokePts(c, [[0, -52], [x * 0.5, -72], [x, y]], "#3f9b4e", 3);
  ell(c, -22, -66, 10, 6, "#4caf5a");
  ell(c, 20, -70, 10, 6, "#4caf5a");
  for (const [x, y, col] of heads) disc(c, x, y, 11, col);
  shape(c, [[-30, -52], [30, -52], [24, 0], [-24, 0]], "#c8673a");
  box(c, -36, -60, 72, 14, "#d97a4a", 4);
}
function rockSmall(c) {
  floorShadow(c, 150);
  shape(c, [[-80, 0], [-74, -38], [-44, -74], [8, -88], [48, -70], [80, -30], [78, 0]], "#9097a2");
  shape(c, [[8, -88], [48, -70], [80, -30], [78, 0], [30, 0], [40, -44]], "#6e7580");
  strokePts(c, [[-52, -58], [-20, -74], [0, -76]], "rgba(255,255,255,0.55)", 4);
}
function boulder2(c) {
  floorShadow(c, 340);
  shape(c, [[-160, 0], [-150, -90], [-100, -200], [-20, -250], [60, -236], [130, -170], [165, -80], [160, 0]], "#9097a2");
  shape(c, [[-20, -250], [60, -236], [130, -170], [165, -80], [160, 0], [40, 0], [70, -120]], "#6e7580");
  strokePts(c, [[-120, -150], [-80, -206], [-40, -222]], "rgba(255,255,255,0.5)", 6);
  ell(c, -70, -212, 46, 18, "#4caf5a", false);
  ell(c, 22, -238, 30, 11, "#4caf5a", false);
}
function cactusPlant(c) {
  floorShadow(c, 160);
  cactus(c, 0, 0, 300, "#5fa35a");
  disc(c, 0, -300, 9, "#ff8fb1");
}
function logPiece(c) {
  floorShadow(c, 260);
  box(c, -128, -62, 240, 58, "#8a5a34", 26);
  ell(c, 116, -33, 16, 27, "#e0b070");
  ell(c, 116, -33, 8, 14, "#b9834a", false);
  strokePts(c, [[-100, -48], [-40, -44]], "#6b4a2e", 2);
  strokePts(c, [[-10, -22], [60, -20]], "#6b4a2e", 2);
}
function stumpPiece(c) {
  floorShadow(c, 120);
  box(c, -54, -72, 108, 72, "#7a4f2a", 10);
  ell(c, 0, -72, 54, 18, "#d9a86a");
  c.beginPath();
  c.ellipse(0, -72, 34, 10, 0, 0, Math.PI * 2);
  c.strokeStyle = "#9a6a3c";
  c.lineWidth = 2;
  c.stroke();
}
function mushroomCap(c, x, s, col) {
  box(c, x - 6 * s, -22 * s, 12 * s, 22 * s, "#f3e6cf", 3);
  c.beginPath();
  c.moveTo(x - 22 * s, -20 * s);
  c.quadraticCurveTo(x - 24 * s, -46 * s, x, -46 * s);
  c.quadraticCurveTo(x + 24 * s, -46 * s, x + 22 * s, -20 * s);
  c.closePath();
  fillOut(c, col);
  disc(c, x - 9 * s, -36 * s, 3.5 * s, "#ffffff", false);
  disc(c, x + 7 * s, -40 * s, 4 * s, "#ffffff", false);
  disc(c, x + 10 * s, -28 * s, 2.5 * s, "#ffffff", false);
}
function mushrooms(c) {
  floorShadow(c, 60);
  mushroomCap(c, -12, 1, "#e8483e");
  mushroomCap(c, 16, 0.7, "#f5a623");
}
function pondPiece(c) {
  floorShadow(c, 400, 0, 0.12);
  ell(c, -200, -14, 16, 9, "#9097a2");
  ell(c, 200, -14, 16, 9, "#9097a2");
  ell(c, 0, -18, 200, 18, "#3f8fc8");
  c.save();
  c.globalAlpha = 0.6;
  strokePts(c, [[-120, -24], [-60, -24]], "#dff3ff", 3);
  strokePts(c, [[40, -12], [110, -12]], "#dff3ff", 3);
  c.restore();
}
function grassPatch(c) {
  grassTufts(c, -36, 36, 0, "#4caf5a", rng(3), 0.14, 34);
  grassTufts(c, -36, 36, 0, "#2f8a48", rng(8), 0.2, 22);
}
function reedsPatch(c) {
  const r = rng(6);
  floorShadow(c, 120);
  for (let i = 0; i < 9; i++) {
    const x = -56 + i * 14 + r.range(-4, 4);
    const top = -150 - r.range(0, 46);
    const bend = r.range(-10, 10);
    strokePts(c, [[x, 0], [x + bend * 0.4, top * 0.5], [x + bend, top + 14]], "#5f9a3c", 4);
    if (i % 3 === 0) {
      ell(c, x + bend, top + 4, 6, 16, "#7a4a24", false);
    }
    const bx = x + r.range(-16, 16);
    strokePts(c, [[bx, 0], [bx + 16, -70], [bx + 40, -110]], "#73ad4c", 3);
  }
}
function haystackPath(c) {
  c.beginPath();
  c.moveTo(-150, 0);
  c.bezierCurveTo(-172, -150, -80, -232, 0, -232);
  c.bezierCurveTo(80, -232, 172, -150, 150, 0);
  c.closePath();
}
function haystack(c) {
  floorShadow(c, 320);
  haystackPath(c);
  c.fillStyle = vgrad(c, -232, 0, [
    [0, "#f7dc7a"],
    [1, "#d9a441"]
  ]);
  c.fill();
  c.save();
  haystackPath(c);
  c.clip();
  c.fillStyle = "rgba(120,70,20,0.22)";
  c.fillRect(30, -240, 160, 260);
  c.restore();
  haystackPath(c);
  c.strokeStyle = "#8a5e1c";
  c.lineWidth = 2.5;
  c.stroke();
  const r = rng(12);
  c.save();
  haystackPath(c);
  c.clip();
  for (let i = 0; i < 70; i++) {
    const x = r.range(-150, 150);
    const y = r.range(-200, -10);
    strokePts(c, [[x, y], [x + r.range(-14, 14), y + r.range(6, 14)]], "#b07f2e", 2);
  }
  c.restore();
}
function scarecrowPiece(c) {
  floorShadow(c, 220);
  box(c, -6, -326, 12, 326, "#8a5a34", 3);
  strokePts(c, [[-100, -262], [100, -262]], "#8a5a34", 14);
  strokePts(c, [[-100, -262], [-100, -248]], "#e8cf98", 10);
  strokePts(c, [[100, -262], [100, -248]], "#e8cf98", 10);
  box(c, -46, -178, 92, 62, "#3f5fa8", 8);
  box(c, -34, -120, 30, 118, "#3f5fa8", 8);
  box(c, 4, -120, 30, 118, "#3f5fa8", 8);
  box(c, -36, -18, 34, 18, "#5b3d22", 6);
  box(c, 2, -18, 34, 18, "#5b3d22", 6);
  box(c, -56, -266, 112, 92, "#d9534f", 12);
  strokePts(c, [[-56, -240], [56, -240]], "#f6e27a", 4);
  strokePts(c, [[-20, -266], [-20, -174]], "#f6e27a", 3);
  disc(c, 0, -302, 36, "#e8cf98");
  disc(c, -13, -306, 4, "#1d1d24", false);
  disc(c, 13, -306, 4, "#1d1d24", false);
  strokePts(c, [[-12, -286], [0, -280], [12, -286]], "#7a3d1e", 2.5);
  ell(c, 0, -336, 58, 11, "#5b3d22");
  box(c, -34, -376, 68, 42, "#5b3d22", 8);
  strokePts(c, [[-34, -358], [34, -358]], "#c9a24a", 4);
}
function wellPiece(c) {
  floorShadow(c, 200);
  box(c, -90, -112, 180, 112, "#a9a39a", 10);
  bricks(c, -90, -112, 180, 112, "#a9a39a", 30, 18);
  ell(c, 0, -112, 90, 24, "#7d776f");
  ell(c, 0, -112, 66, 15, "#2b3a46", false);
  box(c, -88, -240, 14, 130, "#8a5a34", 4);
  box(c, 74, -240, 14, 130, "#8a5a34", 4);
  box(c, -70, -236, 140, 10, "#6b4a2e", 3);
  shape(c, [[-112, -240], [0, -292], [112, -240]], "#b5523a");
  strokePts(c, [[0, -236], [0, -150]], "#c9a24a", 2);
  shape(c, [[-16, -150], [16, -150], [12, -124], [-12, -124]], "#6b9ad6");
}
function windmillPiece(c) {
  floorShadow(c, 200);
  shape(c, [[-72, 0], [72, 0], [40, -432], [-40, -432]], "#f1ead8");
  shape(c, [[30, 0], [72, 0], [40, -432], [14, -432]], "#d9ccb0", false);
  shape(c, [[-52, -432], [0, -482], [52, -432]], "#b5523a");
  box(c, -16, -62, 32, 62, "#7a4f2a", 12);
  box(c, -8, -220, 16, 26, "#5b7a8a", 4);
  box(c, -8, -330, 16, 26, "#5b7a8a", 4);
  for (let i = 0; i < 4; i++) {
    c.save();
    c.translate(0, -456);
    c.rotate(Math.PI / 4 + i * Math.PI / 2);
    box(c, -10, -6, 20, 156, "#8a5a34", 4);
    c.fillStyle = "rgba(255,255,255,0.8)";
    c.fillRect(-40, 10, 26, 118);
    c.strokeStyle = "#8a5a34";
    c.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.moveTo(-40, 10 + k * 30);
      c.lineTo(-14, 10 + k * 30);
      c.stroke();
    }
    c.restore();
  }
  disc(c, 0, -456, 16, "#8a5a34");
}
function woodenFence(c) {
  floorShadow(c, 320);
  const col = "#d9b07a";
  box(c, -160, -94, 320, 16, shade(col, -0.05), 4);
  box(c, -160, -42, 320, 16, shade(col, -0.05), 4);
  for (let i = 0; i < 8; i++) {
    const x = -150 + i * 42;
    shape(c, [[x - 16, 0], [x - 16, -108], [x, -126], [x + 16, -108], [x + 16, 0]], col);
  }
}
function pumpkin(c) {
  floorShadow(c, 90);
  ell(c, 0, -34, 44, 34, "#f08a24");
  for (const k of [-22, 0, 22]) {
    strokePts(c, [[k * 0.4, -66], [k, -40], [k * 0.4, -4]], "#c86a18", 2.5);
  }
  box(c, -5, -78, 10, 16, "#4c7a2e", 3);
  ell(c, 16, -70, 12, 5, "#4caf5a");
}
function vegCrate(c) {
  floorShadow(c, 120);
  disc(c, -30, -84, 18, "#4caf5a");
  disc(c, 8, -88, 17, "#5fc063");
  shape(c, [[30, -80], [42, -66], [30, -62]], "#f5822a");
  shape(c, [[-10, -80], [0, -66], [-4, -62]], "#f5822a");
  box(c, -60, -70, 120, 70, "#b98552", 6);
  strokePts(c, [[-60, -52], [60, -52]], "#8a5a34", 2.5);
  strokePts(c, [[-60, -34], [60, -34]], "#8a5a34", 2.5);
}
function wateringCan(c) {
  floorShadow(c, 70);
  c.beginPath();
  c.arc(-2, -42, 17, Math.PI, 0);
  c.strokeStyle = shade("#3f9b4e", -0.5);
  c.lineWidth = 6;
  c.stroke();
  c.strokeStyle = "#3f9b4e";
  c.lineWidth = 3;
  c.stroke();
  strokePts(c, [[20, -22], [36, -48]], shade("#3f9b4e", -0.5), 9);
  strokePts(c, [[20, -22], [36, -48]], "#3f9b4e", 5);
  shape(c, [[30, -50], [44, -58], [40, -44]], "#3f9b4e");
  box(c, -26, -40, 50, 40, "#3f9b4e", 10);
}
function beehivePiece(c) {
  floorShadow(c, 90);
  box(c, -46, -12, 92, 12, "#8a5a34", 3);
  c.beginPath();
  c.moveTo(-42, -12);
  c.bezierCurveTo(-52, -70, -30, -104, 0, -106);
  c.bezierCurveTo(30, -104, 52, -70, 42, -12);
  c.closePath();
  fillOut(c, "#e8c46a");
  for (const y of [-72, -50, -30]) strokePts(c, [[-44, y], [44, y]], "#b98a3a", 3);
  ell(c, 0, -14, 12, 6, "#3b2a14", false);
}
function troughPiece(c) {
  floorShadow(c, 220);
  box(c, -110, -56, 220, 56, "#8c9097", 8);
  ell(c, 0, -56, 100, 11, "#4fa8d8");
  strokePts(c, [[-60, -58], [-20, -58]], "#dff3ff", 3);
}
function wheelbarrow(c) {
  floorShadow(c, 220);
  strokePts(c, [[-108, -74], [-60, -24]], "#8a5a34", 9);
  strokePts(c, [[-108, -74], [-64, -96]], "#8a5a34", 6);
  strokePts(c, [[-44, -40], [-56, 0]], "#8a5a34", 6);
  shape(c, [[-70, -82], [70, -82], [36, -36], [-40, -36]], "#3f7fd6");
  ell(c, -4, -86, 50, 10, "#7a5230");
  strokePts(c, [[-70, -82], [70, -82]], "#2a5aa0", 5);
  wheel(c, 56, -28, 28, "#c9ccd6", "#1d1d24");
}
function chickenPart(c, o) {
  c.save();
  c.scale(o.s, o.s);
  strokePts(c, [[-4, -22], [-4, 0]], o.beak, 3.5);
  strokePts(c, [[9, -22], [9, 0]], o.beak, 3.5);
  plume(c, [[-20, -40], [-42, -66], [-40, -52]], o.tail[0]);
  plume(c, [[-22, -40], [-46, -54], [-42, -40]], o.tail[1]);
  plume(c, [[-22, -36], [-38, -30], [-26, -24]], o.tail[2]);
  ell(c, -2, -36, 26, 22, o.body);
  ell(c, -6, -36, 14, 10, o.wing, false);
  disc(c, 14, -60, 15, o.body);
  shape(c, [[9, -72], [12, -84], [16, -75], [20, -86], [24, -72]], o.comb);
  shape(c, [[27, -64], [38, -59], [27, -55]], o.beak);
  disc(c, 22, -50, 5, o.comb, false);
  eye(c, 19, -63, 4);
  c.restore();
}
function chicken(c) {
  floorShadow(c, 60);
  chickenPart(c, { body: "#fbfaf5", wing: "#e0dbcf", tail: ["#e9e4da", "#d8d2c4", "#e9e4da"], comb: "#e8483e", beak: "#f5a623", s: 0.93 });
}
function rooster(c) {
  floorShadow(c, 70);
  chickenPart(c, { body: "#d9663f", wing: "#8a3d2a", tail: ["#2f7d4a", "#3fa35a", "#f5a623"], comb: "#e8483e", beak: "#f5a623", s: 1.1 });
}
function cowPiece(c) {
  floorShadow(c, 360);
  strokePts(c, [[-130, -176], [-166, -150], [-170, -92]], "#fbfbf7", 7);
  disc(c, -170, -86, 8, "#2b2d36", false);
  ell(c, 16, -84, 22, 11, "#f2a7b5", false);
  legs3(c, [-96, -48, 50, 96], 96, 28, "#fbfbf7");
  c.save();
  c.beginPath();
  c.ellipse(-10, -150, 130, 72, 0, 0, Math.PI * 2);
  c.fillStyle = vgrad(c, -222, -78, [
    [0, "#ffffff"],
    [1, "#dcdfe6"]
  ]);
  c.fill();
  c.clip();
  ell(c, -74, -170, 38, 30, "#2b2d36", false);
  ell(c, 36, -132, 30, 26, "#2b2d36", false);
  ell(c, -16, -206, 28, 14, "#2b2d36", false);
  c.restore();
  c.beginPath();
  c.ellipse(-10, -150, 130, 72, 0, 0, Math.PI * 2);
  c.strokeStyle = shade("#ffffff", -0.55);
  c.lineWidth = 2.5;
  c.stroke();
  ell(c, 160, -196, 52, 46, "#fbfbf7");
  ell(c, 136, -226, 22, 16, "#2b2d36", false);
  ell(c, 198, -176, 28, 20, "#f2a7b5");
  disc(c, 190, -178, 3, "#7a4a52", false);
  disc(c, 205, -178, 3, "#7a4a52", false);
  strokePts(c, [[138, -232], [128, -252]], "#e0d6b8", 6);
  strokePts(c, [[178, -236], [188, -256]], "#e0d6b8", 6);
  eye(c, 170, -212, 9);
}
function sheepPiece(c) {
  floorShadow(c, 180);
  legs3(c, [-48, -18, 22, 48], 50, 14, "#3b3b44");
  const puffs = [
    [-44, -66, 28],
    [-6, -88, 34],
    [34, -78, 30],
    [-18, -42, 26],
    [22, -44, 26],
    [58, -58, 20]
  ];
  for (const [x, y, r] of puffs) disc(c, x, y, r, shade("#f7f5ee", x > 20 ? -0.08 : 0));
  ell(c, 78, -96, 26, 22, "#3b3b44");
  shape(c, [[66, -106], [56, -118], [70, -112]], "#3b3b44");
  eye(c, 84, -100, 6);
  disc(c, 92, -88, 3, "#1d1d24", false);
}
function goatPiece(c) {
  floorShadow(c, 160);
  strokePts(c, [[-44, -78], [-58, -92]], "#d9c9a6", 6);
  legs3(c, [-38, -14, 14, 38], 56, 12, "#8a7760");
  ell(c, -10, -84, 50, 34, "#d9c9a6");
  strokePts(c, [[30, -92], [52, -58]], "#c9b68e", 1);
  ell(c, 62, -112, 24, 22, "#d9c9a6");
  shape(c, [[60, -134], [46, -136], [56, -124]], "#d9c9a6", false);
  strokePts(c, [[56, -130], [42, -160]], "#8a7760", 5);
  strokePts(c, [[70, -128], [76, -156]], "#8a7760", 5);
  shape(c, [[58, -92], [70, -68], [50, -82]], "#8a7760");
  shape(c, [[78, -106], [96, -100], [78, -94]], "#8a7760", false);
  eye(c, 68, -116, 6);
}
function horsePiece(c) {
  c.save();
  c.scale(0.9, 0.9);
  floorShadow(c, 380);
  const body = "#9a5f36";
  const dark = "#5a3620";
  strokePts(c, [[-124, -200], [-150, -130], [-140, -70]], "#2b1d14", 14);
  legs3(c, [-96, -62, 62, 96], 130, 30, body, "#2b1d14");
  limb(c, [[90, -200], [126, -260], [150, -312]], body, 58);
  ell(c, -10, -172, 120, 62, body);
  limb(c, [[110, -240], [140, -290], [160, -340]], dark, 16);
  ell(c, 176, -312, 44, 32, body);
  ell(c, 210, -298, 22, 16, "#c8905a");
  shape(c, [[156, -340], [164, -370], [178, -344]], body);
  disc(c, 220, -304, 3, "#2b1d14", false);
  eye(c, 184, -322, 7);
  c.restore();
}
function donkeyPiece(c) {
  c.save();
  c.scale(0.85, 0.85);
  floorShadow(c, 260);
  const body = "#a7a7ad";
  strokePts(c, [[-80, -150], [-100, -100], [-90, -60]], "#4a4a52", 9);
  legs3(c, [-60, -30, 40, 66], 100, 22, body, "#3b3b44");
  limb(c, [[60, -150], [100, -186], [116, -220]], body, 40);
  ell(c, -10, -140, 84, 46, body);
  strokePts(c, [[-10, -150], [-10, -96]], "#4a4a52", 3);
  ell(c, 124, -230, 30, 22, body);
  ell(c, 146, -216, 14, 12, "#e6e3dc");
  shape(c, [[106, -240], [96, -296], [120, -248]], body);
  shape(c, [[122, -246], [134, -296], [136, -244]], body);
  strokePts(c, [[104, -274], [112, -250]], "#4a4a52", 2);
  eye(c, 130, -236, 6);
  c.restore();
}
function pigPiece(c) {
  floorShadow(c, 200);
  strokePts(c, [[-82, -70], [-100, -96], [-88, -110]], "#f08aa0", 4);
  legs3(c, [-50, -18, 26, 56], 34, 24, "#f08aa0", "#c35d78");
  ell(c, -6, -66, 80, 50, "#f4a6b7");
  shape(c, [[36, -104], [56, -124], [62, -88]], "#f08aa0");
  ell(c, 80, -62, 20, 16, "#f08aa0");
  disc(c, 84, -62, 3, "#c35d78", false);
  disc(c, 76, -62, 3, "#c35d78", false);
  eye(c, 56, -86, 6);
}
function dogPiece(c) {
  floorShadow(c, 160);
  limb(c, qpts([-64, -74], [-88, -124], [-70, -124]), "#b5763c", 12);
  legs3(c, [-40, -18, 22, 42], 34, 18, "#b5763c", "#2b2a2e");
  ell(c, -10, -62, 56, 34, "#c48a4e");
  ell(c, -4, -48, 34, 18, "#f3e2c4", false);
  ell(c, 56, -96, 32, 30, "#c48a4e");
  ell(c, 36, -88, 14, 26, "#8a5a34", true);
  ell(c, 82, -84, 18, 13, "#f3e2c4");
  disc(c, 98, -90, 6, "#1d1d24", false);
  eye(c, 66, -106, 6);
}
function streetCatPiece(c) {
  floorShadow(c, 90);
  limb(c, qpts([-24, -12], [-40, -46], [-14, -56]), "#f0a040", 8);
  ell(c, -4, -30, 26, 30, "#f0a040");
  strokePts(c, [[-14, -40], [-8, -28]], "#b87020", 3);
  strokePts(c, [[2, -44], [6, -30]], "#b87020", 3);
  ell(c, 4, -4, 14, 5, "#f0a040");
  ell(c, 6, -62, 19, 18, "#f0a040");
  shape(c, [[-6, -72], [-2, -92], [10, -78]], "#f0a040");
  shape(c, [[14, -78], [24, -92], [24, -70]], "#f0a040");
  eye(c, 12, -64, 5);
  disc(c, 12, -64, 2.5, "#2e8a4a", false);
  disc(c, 5, -54, 2.5, "#f08aa0", false);
  strokePts(c, [[-2, -54], [-18, -58]], "#4a4a52", 1.5);
  strokePts(c, [[-2, -50], [-18, -48]], "#4a4a52", 1.5);
}
function duckPiece(c) {
  floorShadow(c, 70);
  shape(c, [[-26, -32], [-40, -46], [-30, -38]], "#f5f5ef");
  ell(c, 0, -28, 30, 18, "#fbfbf7");
  ell(c, -2, -30, 16, 9, "#e4e6ea", false);
  disc(c, 22, -48, 13, "#fbfbf7");
  shape(c, [[30, -52], [44, -47], [30, -43]], "#f5a623");
  disc(c, 26, -54, 3, "#1d1d24", false);
  strokePts(c, [[-6, -10], [-8, 0]], "#f5a623", 3);
  strokePts(c, [[6, -10], [8, 0]], "#f5a623", 3);
}
function crowPiece(c) {
  floorShadow(c, 60);
  shape(c, [[-18, -28], [-40, -22], [-34, -14], [-16, -20]], "#2b2d36");
  ell(c, 0, -26, 22, 15, "#2b2d36");
  ell(c, -4, -30, 12, 8, "#444a55", false);
  ell(c, 16, -42, 12, 11, "#2b2d36");
  shape(c, [[26, -44], [40, -39], [26, -35]], "#5a6170");
  disc(c, 19, -45, 3, "#ffd23f", false);
  strokePts(c, [[-4, -10], [-6, 0]], "#5a5a62", 2.5);
  strokePts(c, [[6, -10], [8, 0]], "#5a5a62", 2.5);
}
function owlPiece(c) {
  floorShadow(c, 70);
  shape(c, [[-22, -88], [-26, -106], [-10, -92]], "#7a4d2a");
  shape(c, [[22, -88], [26, -106], [10, -92]], "#7a4d2a");
  ell(c, 0, -52, 32, 46, "#9a6b3f");
  ell(c, 0, -38, 20, 28, "#e6cfa4", false);
  ell(c, -22, -48, 9, 26, "#7a4d2a");
  ell(c, 22, -48, 9, 26, "#7a4d2a");
  disc(c, -12, -82, 13, "#ffffff");
  disc(c, 12, -82, 13, "#ffffff");
  disc(c, -10, -80, 7, "#1d1d24", false);
  disc(c, 10, -80, 7, "#1d1d24", false);
  shape(c, [[-4, -72], [4, -72], [0, -62]], "#f5a623");
  strokePts(c, [[-10, 0], [-10, 6]], "#f5a623", 3);
  strokePts(c, [[10, 0], [10, 6]], "#f5a623", 3);
}
function batPiece(c) {
  floorShadow(c, 60, 0, 0.12);
  const wing = (s) => shape(
    c,
    [
      [s * 6, -34],
      [s * 46, -58],
      [s * 40, -44],
      [s * 50, -36],
      [s * 36, -28],
      [s * 40, -20],
      [s * 14, -18]
    ],
    "#4a3a6a"
  );
  wing(-1);
  wing(1);
  ell(c, 0, -30, 13, 15, "#2e2540");
  shape(c, [[-8, -42], [-12, -54], [-2, -44]], "#2e2540");
  shape(c, [[8, -42], [12, -54], [2, -44]], "#2e2540");
  disc(c, -5, -34, 3.5, "#ffd23f", false);
  disc(c, 5, -34, 3.5, "#ffd23f", false);
}
function camelPiece(c) {
  floorShadow(c, 400);
  legs3(c, [-120, -80, 80, 120], 130, 30, "#b8864c", "#4a301a");
  limb(c, [[100, -220], [130, -270], [158, -310]], "#c49a5a", 46);
  ell(c, -10, -190, 150, 72, "#c49a5a");
  ell(c, -40, -262, 42, 44, "#c49a5a");
  ell(c, 40, -258, 40, 40, "#c49a5a");
  ell(c, 176, -330, 50, 32, "#c49a5a");
  shape(c, [[160, -350], [170, -374], [180, -352]], "#b8864c");
  shape(c, [[196, -326], [226, -320], [198, -312]], "#b8864c");
  strokePts(c, [[-160, -200], [-176, -150]], "#8a5a34", 6);
  eye(c, 180, -336, 6);
}
function parrotPiece(c) {
  floorShadow(c, 50);
  strokePts(c, [[-26, -4], [26, -4]], "#8a5a34", 6);
  shape(c, [[-6, -20], [-14, 0], [0, -4]], "#e8483e");
  ell(c, 0, -42, 15, 26, "#3fb86a");
  ell(c, 2, -36, 9, 14, "#f5e27a", false);
  shape(c, [[-12, -48], [-24, -26], [-8, -22]], "#2f7fd6");
  disc(c, 6, -72, 13, "#e8483e");
  shape(c, [[16, -76], [28, -72], [18, -62]], "#f5a623");
  eye(c, 10, -74, 4);
}
function fishBowl(c) {
  floorShadow(c, 80);
  box(c, -22, -10, 44, 10, "#8a5a34", 3);
  c.beginPath();
  c.arc(0, -42, 36, 0, Math.PI * 2);
  c.fillStyle = "rgba(180,225,245,0.45)";
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = "rgba(79,168,216,0.6)";
  c.fillRect(-40, -40, 80, 40);
  c.restore();
  c.beginPath();
  c.arc(0, -42, 36, 0, Math.PI * 2);
  c.strokeStyle = "rgba(70,110,140,0.9)";
  c.lineWidth = 2.5;
  c.stroke();
  ell(c, -4, -36, 14, 8, "#ff8a3d");
  shape(c, [[10, -36], [20, -44], [20, -28]], "#ff8a3d", false);
  disc(c, -8, -38, 2.5, "#1d1d24", false);
  c.strokeStyle = "rgba(255,255,255,0.8)";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(-18, -50, 20, -2.4, -1.5);
  c.stroke();
}
function seagull(c) {
  floorShadow(c, 80);
  strokePts(c, [[-4, -10], [-6, 0]], "#f5a623", 3);
  strokePts(c, [[8, -10], [10, 0]], "#f5a623", 3);
  shape(c, [[-24, -22], [-40, -18], [-24, -14]], "#b8c6d6");
  ell(c, 0, -22, 28, 13, "#fbfbfb");
  ell(c, -8, -26, 20, 8, "#b8c6d6", false);
  disc(c, 26, -36, 11, "#fbfbfb");
  shape(c, [[34, -41], [48, -37], [34, -33]], "#f5a623");
  disc(c, 44, -36, 1.8, "#e8483e", false);
  eye(c, 29, -39, 3.5);
}
var DINO = "#4fb08a";
function dinoLongneck(c) {
  floorShadow(c, 500);
  for (const x of [-140, -60, 60, 140]) box(c, x - 30, -200, 60, 200, shade(DINO, -0.08), 22);
  limb(c, qpts([-150, -290], [-330, -250], [-250, -300]), DINO, 56);
  limb(c, qpts([-280, -262], [-340, -240], [-310, -262]), DINO, 26);
  ell(c, 0, -290, 200, 120, DINO);
  ell(c, 10, -250, 160, 56, "#a8e0b8", false);
  limb(c, qpts([130, -320], [260, -430], [220, -628]), DINO, 80);
  ell(c, 216, -646, 60, 46, DINO);
  ell(c, 252, -636, 26, 18, "#a8e0b8", false);
  strokePts(c, [[236, -626], [262, -622]], "#2b2d36", 3);
  eye(c, 226, -654, 12);
  ell(c, 236, -624, 10, 6, "#ff9ab0", false);
  for (const [x, y, r] of [
    [-90, -320, 15],
    [20, -340, 18],
    [120, -300, 10],
    [-160, -250, 12],
    [-30, -250, 11],
    [200, -460, 8]
  ]) {
    disc(c, x, y, r, "#3a8a6e", false);
  }
}
function sabertooth(c) {
  floorShadow(c, 300);
  const body = "#e8973a";
  strokePts(c, [[-110, -110], [-146, -100], [-130, -44]], "#8a4a1e", 14);
  legs3(c, [-64, -24, 36, 70], 70, 24, body, "#8a4a1e");
  ell(c, -12, -100, 98, 56, body);
  for (const x of [-70, -40, -10]) limb(c, [[x, -150], [x + 10, -110]], "#8a4a1e", 6);
  ell(c, 108, -128, 50, 42, body);
  shape(c, [[90, -162], [96, -190], [110, -168]], body);
  shape(c, [[122, -170], [134, -190], [138, -164]], body);
  strokePts(c, [[106, -102], [146, -110]], "#2b1d14", 4);
  shape(c, [[118, -104], [130, -104], [125, -60]], "#fbfbf7");
  shape(c, [[134, -106], [142, -106], [139, -76]], "#fbfbf7");
  eye(c, 124, -136, 8);
  disc(c, 150, -126, 4, "#2b1d14", false);
}
function mammothPiece(c) {
  floorShadow(c, 500);
  const fur = "#8a5a3a";
  const dark = "#5a3620";
  strokePts(c, [[-200, -260], [-236, -190], [-226, -150]], dark, 8);
  legs3(c, [-150, -90, 40, 100], 140, 56, dark, "#2b1d14");
  const r = rng(41);
  for (let i = 0; i < 16; i++) {
    const x = -200 + i * 26 + r.range(-6, 6);
    shape(c, [[x - 14, -150], [x + 14, -150], [x + r.range(-4, 4), -100 - r.range(0, 22)]], dark, false);
  }
  ell(c, -30, -240, 180, 116, fur);
  ell(c, -30, -330, 120, 60, shade(fur, 0.05));
  ell(c, 150, -292, 92, 86, fur);
  ell(c, 110, -248, 42, 54, dark);
  ell(c, 118, -300, 26, 36, dark);
  limb(c, qpts([204, -262], [250, -190], [214, -92]), fur, 34);
  limb(c, [[214, -92], [206, -70]], fur, 22);
  limb(c, qpts([218, -240], [320, -230], [270, -132]), "#e6dcc0", 18);
  eye(c, 176, -312, 9);
  strokePts(c, [[160, -332], [196, -340]], dark, 4);
}
function pterodactyl(c) {
  floorShadow(c, 60, 0, 0.12);
  const wingPts = (s) => [
    [s * 4, -102],
    [s * 58, -146],
    [s * 130, -162],
    [s * 150, -132],
    [s * 110, -110],
    [s * 130, -96],
    [s * 80, -88],
    [s * 40, -84]
  ];
  shape(c, wingPts(-1), "#e88aa0");
  shape(c, wingPts(1), "#f19ab0");
  strokePts(c, [[0, -100], [-66, -150]], "#c46a8a", 2);
  strokePts(c, [[0, -100], [66, -150]], "#c46a8a", 2);
  shape(c, [[-10, -110], [-40, -138], [-18, -102]], "#c46a8a");
  ell(c, 0, -96, 30, 16, "#c46a8a");
  shape(c, [[22, -106], [78, -112], [22, -92]], "#f5a623");
  eye(c, 18, -106, 4);
  strokePts(c, [[-6, -84], [-10, -68]], "#c46a8a", 4);
  strokePts(c, [[8, -84], [12, -68]], "#c46a8a", 4);
}
function stoneWheel(c) {
  floorShadow(c, 120);
  disc(c, 0, -70, 68, "#8d8f97");
  disc(c, 0, -70, 50, "#6d6f78", false);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    strokePts(c, [[Math.cos(a) * 16, -70 + Math.sin(a) * 16], [Math.cos(a) * 46, -70 + Math.sin(a) * 46]], "#4a4c54", 5);
  }
  disc(c, 0, -70, 14, "#3a3c44");
  c.beginPath();
  c.arc(0, -70, 60, Math.PI * 1.15, Math.PI * 1.55);
  c.strokeStyle = "rgba(255,255,255,0.45)";
  c.lineWidth = 5;
  c.stroke();
  strokePts(c, [[30, -110], [40, -94], [34, -84]], "#4a4c54", 2.5);
}
function bone2(c, x1, y1, x2, y2) {
  strokePts(c, [[x1, y1], [x2, y2]], shade("#f2e8cf", -0.4), 14);
  strokePts(c, [[x1, y1], [x2, y2]], "#f2e8cf", 9);
  disc(c, x1, y1, 8, "#f2e8cf");
  disc(c, x2, y2, 8, "#f2e8cf");
}
function bonePile(c) {
  floorShadow(c, 160);
  bone2(c, -60, -18, 52, -42);
  bone2(c, -46, -44, 40, -12);
  bone2(c, -8, -30, 36, -58);
}
function campfire2(c) {
  floorShadow(c, 160);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    disc(c, Math.cos(a) * 64, -10 + Math.sin(a) * 14, 12, "#8a8f99");
  }
  strokePts(c, [[-52, -22], [50, -6]], "#6b4a2e", 16);
  strokePts(c, [[-42, -6], [44, -28]], "#5b3d22", 14);
  glow(c, 0, -70, 110, "#ffb347", 0.55);
  c.beginPath();
  c.moveTo(-34, -24);
  c.quadraticCurveTo(-42, -70, -10, -100);
  c.quadraticCurveTo(-4, -80, 6, -114);
  c.quadraticCurveTo(28, -74, 34, -24);
  c.closePath();
  fillOut(c, "#ff7a2a");
  c.beginPath();
  c.moveTo(-16, -24);
  c.quadraticCurveTo(-16, -56, 0, -70);
  c.quadraticCurveTo(10, -50, 14, -24);
  c.closePath();
  fillOut(c, "#ffd23f");
}
function cavePaintingPiece(c) {
  floorShadow(c, 260);
  shape(c, [[-126, 0], [-132, -120], [-96, -170], [0, -180], [92, -168], [128, -120], [122, 0]], "#b89272");
  shape(c, [[30, -180], [92, -168], [128, -120], [122, 0], [60, 0], [70, -110]], "#9a7558", false);
  strokePts(c, [[-100, -140], [-60, -120], [-40, -90]], "#8a6446", 3);
  shape(
    c,
    [
      [-70, -58],
      [-44, -104],
      [0, -112],
      [40, -100],
      [70, -84],
      [60, -72],
      [40, -62],
      [10, -56],
      [-20, -54],
      [-40, -44],
      [-62, -40]
    ],
    "#c4502e",
    false
  );
  strokePts(c, [[-44, -100], [-54, -120]], "#c4502e", 5);
  strokePts(c, [[-60, -40], [-62, -18]], "#c4502e", 6);
  strokePts(c, [[-30, -46], [-30, -18]], "#c4502e", 6);
  strokePts(c, [[30, -60], [30, -22]], "#c4502e", 6);
  for (const [hx, hy] of [
    [-86, -146],
    [-70, -150]
  ]) {
    disc(c, hx, hy, 9, "#c4502e", false);
    for (let k = 0; k < 4; k++) disc(c, hx - 8 + k * 5, hy - 13, 2.5, "#c4502e", false);
  }
  for (let i = 0; i < 9; i++) disc(c, 52 + i % 3 * 14, -150 + Math.floor(i / 3) * 12, 3, "#7a4a2e", false);
}
function stoneTable(c) {
  floorShadow(c, 260);
  shape(c, [[-112, -96], [-78, -96], [-84, 0], [-120, 0]], "#8a8377");
  shape(c, [[112, -96], [78, -96], [84, 0], [120, 0]], "#8a8377");
  box(c, -130, -130, 260, 36, "#a39c92", 10);
  strokePts(c, [[-110, -116], [-40, -118]], "#7a7368", 2.5);
  strokePts(c, [[30, -112], [110, -114]], "#7a7368", 2.5);
  disc(c, -60, -140, 10, "#c9c2b6", false);
  disc(c, 60, -140, 8, "#c9c2b6", false);
  disc(c, 0, -141, 6, "#c9c2b6", false);
}
function shellPhone(c) {
  floorShadow(c, 70);
  strokePts(c, [[-26, -50], [-30, -30], [-20, -14]], "#6b4a2e", 4);
  c.beginPath();
  c.arc(0, -52, 22, Math.PI * 1.05, Math.PI * 1.95);
  c.strokeStyle = shade("#6b4a2e", -0.2);
  c.lineWidth = 9;
  c.lineCap = "round";
  c.stroke();
  disc(c, -22, -52, 6, "#6b4a2e");
  disc(c, 22, -52, 6, "#6b4a2e");
  ell(c, 0, -24, 28, 22, "#f7a7a0");
  c.beginPath();
  c.arc(0, -24, 14, 0, Math.PI * 1.6);
  c.strokeStyle = "#d97a70";
  c.lineWidth = 2;
  c.stroke();
  strokePts(c, [[-18, -24], [-6, -36], [10, -34]], "#d97a70", 2);
}
function dinoEgg(c) {
  floorShadow(c, 70);
  c.beginPath();
  c.moveTo(0, -90);
  c.bezierCurveTo(30, -90, 34, -40, 30, -24);
  c.bezierCurveTo(26, -6, -26, -6, -30, -24);
  c.bezierCurveTo(-34, -40, -30, -90, 0, -90);
  c.closePath();
  c.fillStyle = vgrad(c, -90, 0, [
    [0, "#f7eedb"],
    [1, "#d8c79f"]
  ]);
  c.fill();
  c.strokeStyle = "#8a7a58";
  c.lineWidth = 2.5;
  c.stroke();
  const r = rng(9);
  for (let i = 0; i < 10; i++) disc(c, r.range(-18, 18), r.range(-78, -18), 3 + r() * 2, "#b8a47c", false);
  strokePts(c, [[-16, -74], [-8, -66], [0, -76], [8, -66], [16, -74]], "#8a7a58", 2);
}
function tarPit(c) {
  floorShadow(c, 360, 0, 0.1);
  ell(c, -170, -14, 14, 8, "#8a8f99");
  ell(c, 170, -14, 14, 8, "#8a8f99");
  ell(c, 0, -18, 170, 22, "#2b2530");
  ell(c, -40, -26, 80, 6, "#5b5070", false);
  for (const [x, y, r] of [
    [-90, -20, 6],
    [-20, -28, 9],
    [70, -18, 7],
    [120, -24, 4]
  ]) {
    disc(c, x, y, r, "#4a4560", false);
    disc(c, x - r * 0.3, y - r * 0.3, r * 0.3, "#8a80a8", false);
  }
  bone2(c, 40, -20, 96, -34);
}
var NATURE_PROPS = [
  // nature
  item("tree-oak", "Oak tree", "nature", 520, 760, (c) => {
    floorShadow(c, 400);
    roundTree(c, 0, 0, 760, "#7a4f2a", "#3f9b4e", rng(11), "#8fd46a");
  }, "sway"),
  item("tree-pine", "Pine tree", "nature", 360, 800, (c) => {
    floorShadow(c, 300);
    c.save();
    c.scale(0.62, 1);
    pine(c, 0, 0, 800, "#2f7d4a", void 0, rng(4));
    c.restore();
  }, "sway"),
  item("palm-tree", "Palm tree", "nature", 380, 800, (c) => {
    floorShadow(c, 300);
    c.save();
    c.scale(0.5, 1);
    palm(c, 0, 0, 800, "#9a6a3c", "#3c9a4a", rng(9));
    c.restore();
  }, "sway"),
  item("cypress", "Cypress", "nature", 140, 720, (c) => {
    floorShadow(c, 120);
    c.save();
    c.scale(0.62, 1);
    cypress(c, 0, 0, 720, "#2e6b45");
    c.restore();
  }, "sway"),
  item("tree-bare", "Bare tree", "nature", 420, 700, treeBare),
  item("tree-blossom", "Blossom tree", "nature", 460, 700, treeBlossom, "sway"),
  item("bush", "Bush", "nature", 220, 140, bushShape, "sway"),
  item("flower-bed", "Flower bed", "nature", 300, 90, flowerBed, "sway"),
  item("flowers-pot", "Flowers in a pot", "nature", 80, 110, flowersPot, "sway"),
  item("rock", "Rock", "nature", 160, 90, rockSmall),
  item("boulder", "Boulder", "nature", 340, 260, boulder2),
  item("cactus", "Cactus", "nature", 160, 300, cactusPlant),
  item("log", "Log", "nature", 260, 70, logPiece),
  item("stump", "Tree stump", "nature", 120, 90, stumpPiece),
  item("mushroom", "Mushrooms", "nature", 60, 60, mushrooms),
  item("pond", "Pond", "nature", 400, 40, pondPiece),
  item("grass-tuft", "Grass tuft", "nature", 80, 40, grassPatch, "sway"),
  item("reeds", "Reeds", "nature", 140, 200, reedsPatch, "sway"),
  // farm
  item("haystack", "Haystack", "farm", 300, 230, haystack),
  item("scarecrow", "Scarecrow", "farm", 220, 380, scarecrowPiece),
  item("well", "Well", "farm", 200, 300, wellPiece),
  item("windmill", "Windmill", "farm", 300, 700, windmillPiece),
  item("wooden-fence", "Wooden fence", "farm", 320, 140, woodenFence),
  item("pumpkin", "Pumpkin", "farm", 90, 70, pumpkin),
  item("vegetable-crate", "Vegetable crate", "farm", 120, 80, vegCrate),
  item("watering-can", "Watering can", "farm", 70, 60, wateringCan),
  item("beehive", "Straw beehive", "farm", 90, 110, beehivePiece),
  item("trough", "Water trough", "farm", 220, 80, troughPiece),
  item("wheelbarrow", "Wheelbarrow", "farm", 220, 110, wheelbarrow),
  // animals
  item("chicken", "Hen", "animal", 70, 80, chicken),
  item("rooster", "Rooster", "animal", 80, 100, rooster),
  item("cow", "Cow", "animal", 360, 260, cowPiece),
  item("sheep", "Sheep", "animal", 180, 140, sheepPiece),
  item("goat", "Goat", "animal", 160, 150, goatPiece),
  item("horse", "Horse", "animal", 380, 330, horsePiece),
  item("donkey", "Donkey", "animal", 260, 250, donkeyPiece),
  item("pig", "Pig", "animal", 200, 130, pigPiece),
  item("dog", "Dog", "animal", 160, 130, dogPiece, "wag"),
  item("street-cat", "Street cat", "animal", 90, 80, streetCatPiece),
  item("duck", "Duck", "animal", 70, 70, duckPiece),
  item("crow", "Crow", "animal", 60, 60, crowPiece),
  item("owl", "Owl", "animal", 70, 110, owlPiece),
  item("bat", "Bat", "animal", 100, 60, batPiece),
  item("camel", "Camel", "animal", 400, 380, camelPiece),
  item("parrot", "Parrot", "animal", 50, 90, parrotPiece),
  item("fish-bowl", "Fish bowl", "animal", 80, 80, fishBowl),
  item("seagull", "Seagull", "animal", 80, 50, seagull),
  // prehistoric (original cartoon designs)
  item("dino-longneck", "Long-necked dino pet", "prehistoric", 700, 700, dinoLongneck),
  item("sabertooth", "Sabre-tooth cat", "prehistoric", 300, 200, sabertooth),
  item("mammoth", "Woolly mammoth", "prehistoric", 520, 460, mammothPiece),
  item("pterodactyl", "Pterodactyl", "prehistoric", 300, 160, pterodactyl),
  item("stone-wheel", "Stone wheel", "prehistoric", 140, 140, stoneWheel),
  item("bone-pile", "Bone pile", "prehistoric", 160, 70, bonePile),
  item("campfire", "Campfire", "prehistoric", 160, 120, campfire2, "flicker"),
  item("cave-painting", "Cave painting", "prehistoric", 260, 180, cavePaintingPiece),
  item("stone-table", "Stone table", "prehistoric", 260, 130, stoneTable),
  item("shell-phone", "Shell telephone", "prehistoric", 70, 60, shellPhone),
  item("dino-egg", "Dino egg", "prehistoric", 70, 90, dinoEgg),
  item("tar-pit", "Tar pit", "prehistoric", 360, 50, tarPit)
];

// src/props/vehicles.ts
var GLASS5 = "#a9e2f7";
var CHROME3 = "#c9ccd6";
var TYRE = "#1d1d24";
var LIGHT = "#fff3b0";
var TAIL = "#e8483e";
function item2(id, name, w, h, draw, idle) {
  const d = { id, name, cat: "vehicle", w, h, vehicle: true, draw };
  if (idle) d.idle = idle;
  return d;
}
function line6(c, pts2, col, lw) {
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
}
function ell2(c, x, y, rx, ry, col) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = vgrad(c, y - ry, y + ry, [
    [0, shade(col, 0.12)],
    [1, shade(col, -0.16)]
  ]);
  c.fill();
  c.strokeStyle = shade(col, -0.55);
  c.lineWidth = 2.5;
  c.stroke();
}
function glass(c, pts2, tint = GLASS5) {
  shape(c, pts2, tint);
  const [x0, y0] = pts2[0];
  const [x1, y1] = pts2[1];
  line6(c, [[x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.2 + 6], [x0 + (x1 - x0) * 0.5, y0 + (y1 - y0) * 0.5 + 6]], "rgba(255,255,255,0.6)", 3);
}
function windowR(c, x, y, w, h, tint = GLASS5) {
  c.beginPath();
  rrect(c, x, y, w, h, 6);
  c.fillStyle = tint;
  c.fill();
  c.strokeStyle = shade(tint, -0.5);
  c.lineWidth = 2;
  c.stroke();
  line6(c, [[x + w * 0.18, y + h * 0.8], [x + w * 0.45, y + h * 0.25]], "rgba(255,255,255,0.6)", 3);
}
function carShell(c, o) {
  floorShadow(c, o.L * 0.95);
  box(c, -o.L / 2, o.y0, o.L, o.y1 - o.y0, o.col, 18);
  shape(c, o.cabin, o.roof);
  for (const g of o.glass) glass(c, g);
  const midY = (o.y0 + o.y1) / 2;
  disc(c, o.L / 2 - 8, midY - 4, 10, o.head ?? LIGHT);
  disc(c, -o.L / 2 + 8, midY - 4, 9, o.tail ?? TAIL);
  box(c, -o.L / 2 - 4, o.y1 - 16, o.L + 8, 16, "#2b2d36", 5);
  wheel(c, -o.wx, -o.wr, o.wr);
  wheel(c, o.wx, -o.wr, o.wr);
}
var carModern = (c) => carShell(c, {
  L: 560,
  wr: 40,
  wx: 170,
  y0: -150,
  y1: -62,
  col: "#3f8fd6",
  roof: "#2f6fb8",
  cabin: [[-150, -150], [-98, -200], [120, -200], [172, -150]],
  glass: [[[-134, -152], [-92, -192], [-20, -192], [-20, -152]], [[-10, -152], [-10, -192], [108, -192], [156, -152]]]
});
var taxi2 = (c) => {
  carShell(c, {
    L: 560,
    wr: 40,
    wx: 170,
    y0: -150,
    y1: -62,
    col: "#f6c531",
    roof: "#e0a820",
    cabin: [[-150, -150], [-98, -188], [120, -188], [172, -150]],
    glass: [[[-134, -152], [-92, -180], [-20, -180], [-20, -152]], [[-10, -152], [-10, -180], [108, -180], [156, -152]]]
  });
  for (let x = -270, i = 0; x < 270; x += 14, i++) {
    c.fillStyle = i % 2 ? "#1d1d24" : "#fbfbf7";
    c.fillRect(x, -116, 14, 12);
  }
  box(c, -28, -210, 56, 22, LIGHT, 4);
  line6(c, [[0, -210], [0, -188]], "#8a6a20", 2);
};
var policeCar = (c) => {
  carShell(c, {
    L: 560,
    wr: 40,
    wx: 170,
    y0: -150,
    y1: -62,
    col: "#f4f4f4",
    roof: "#f4f4f4",
    cabin: [[-150, -150], [-98, -186], [120, -186], [172, -150]],
    glass: [[[-134, -152], [-92, -178], [-20, -178], [-20, -152]], [[-10, -152], [-10, -178], [108, -178], [156, -152]]]
  });
  box(c, -280, -114, 560, 14, "#2b3fa8", 0);
  box(c, -44, -204, 88, 14, "#2b2d36", 5);
  disc(c, -20, -198, 10, TAIL);
  disc(c, 20, -198, 10, "#3f7fd6");
};
var vintageCar = (c) => {
  floorShadow(c, 540);
  shape(c, [[-250, -130], [-300, -176], [-280, -120]], "#e8483e");
  c.beginPath();
  c.ellipse(0, -112, 270, 62, 0, 0, Math.PI * 2);
  c.fillStyle = vgrad(c, -176, -50, [
    [0, "#f2c14e"],
    [1, "#c98f1c"]
  ]);
  c.fill();
  c.strokeStyle = shade("#f2c14e", -0.6);
  c.lineWidth = 2.5;
  c.stroke();
  c.beginPath();
  c.ellipse(10, -186, 128, 52, 0, Math.PI, Math.PI * 2);
  c.lineTo(138, -136);
  c.lineTo(-118, -136);
  c.closePath();
  fillOut(c, "#e8b23a");
  glass(c, [[-108, -140], [-70, -206], [-6, -206], [-6, -140]]);
  glass(c, [[4, -140], [4, -206], [84, -200], [118, -140]]);
  box(c, -290, -72, 580, 8, CHROME3, 4);
  disc(c, 262, -124, 16, CHROME3);
  disc(c, 262, -124, 11, LIGHT);
  disc(c, -262, -120, 12, TAIL);
  wheel(c, -170, -58, 58, "#c9ccd6", TYRE);
  wheel(c, 170, -58, 58, "#c9ccd6", TYRE);
};
var dolmus = (c) => {
  floorShadow(c, 600);
  box(c, -300, -240, 600, 176, "#f6c531", 18);
  box(c, -294, -252, 588, 16, "#e0a820", 8);
  box(c, -300, -118, 600, 12, "#2b5fa8", 0);
  for (let i = 0; i < 5; i++) windowR(c, -270 + i * 62, -220, 50, 62);
  glass(c, [[212, -222], [280, -222], [286, -150], [226, -150]]);
  line6(c, [[196, -210], [196, -80]], "#8a6a20", 3);
  box(c, -86, -272, 170, 22, LIGHT, 6);
  disc(c, 290, -102, 10, LIGHT);
  wheel(c, -180, -44, 44);
  wheel(c, 190, -44, 44);
};
var bus = (c) => {
  floorShadow(c, 980);
  box(c, -480, -340, 960, 250, "#2e7bd1", 22);
  box(c, -480, -210, 960, 18, "#fff7e0", 4);
  for (let i = 0; i < 6; i++) windowR(c, -440 + i * 96, -326, 76, 96);
  glass(c, [[348, -326], [448, -326], [462, -226], [352, -226]]);
  box(c, -100, -354, 200, 22, "#ffb000", 5);
  disc(c, 480, -100, 9, LIGHT);
  wheel(c, -330, -52, 52);
  wheel(c, 300, -52, 52);
};
var tram = (c) => {
  floorShadow(c, 940);
  line6(c, [[-500, -2], [500, -2]], "#8a8f99", 5);
  line6(c, [[60, -336], [110, -414]], "#2b2d36", 6);
  line6(c, [[92, -414], [140, -424]], "#2b2d36", 8);
  box(c, -470, -322, 940, 242, "#c8382f", 24);
  box(c, -470, -244, 940, 14, "#f3e3c0", 4);
  box(c, -460, -338, 920, 20, "#8a2a24", 8);
  for (let i = 0; i < 7; i++) windowR(c, -430 + i * 110, -302, 84, 82, "#cfeaf7");
  glass(c, [[392, -302], [456, -302], [460, -204], [396, -204]]);
  box(c, -470, -92, 940, 14, "#2b2d36", 4);
  wheel(c, -340, -40, 40, "#9aa0aa");
  wheel(c, 340, -40, 40, "#9aa0aa");
};
var truck = (c) => {
  floorShadow(c, 880);
  box(c, -430, -340, 560, 300, "#f0c040", 14);
  box(c, -430, -200, 560, 12, TAIL, 0);
  shape(c, [[140, -150], [140, -330], [300, -330], [400, -240], [412, -150]], "#e8483e");
  glass(c, [[160, -310], [290, -310], [368, -238], [160, -238]]);
  box(c, -430, -120, 860, 28, "#2b2d36", 4);
  disc(c, 412, -118, 9, LIGHT);
  wheel(c, -330, -56, 56);
  wheel(c, -262, -56, 56);
  wheel(c, 300, -56, 56);
};
var pickup = (c) => {
  floorShadow(c, 580);
  box(c, -290, -130, 580, 58, "#3f7fd6", 14);
  box(c, -290, -204, 150, 76, "#3f7fd6", 8);
  c.fillStyle = "#2a4f8c";
  c.fillRect(-270, -190, 110, 50);
  shape(c, [[-140, -130], [-118, -208], [110, -208], [196, -130]], "#2f6fb8");
  glass(c, [[-124, -132], [-104, -198], [100, -198], [158, -132]]);
  disc(c, 286, -108, 10, LIGHT);
  wheel(c, -180, -48, 48);
  wheel(c, 180, -48, 48);
};
var motorbike = (c) => {
  floorShadow(c, 240);
  line6(c, [[-85, -40], [-20, -70], [60, -70], [85, -40]], "#2b2d36", 8);
  line6(c, [[-30, -62], [-78, -50]], CHROME3, 8);
  box(c, -30, -80, 72, 36, "#5a5f6b", 8);
  shape(c, [[-22, -102], [28, -122], [70, -106], [58, -88], [-22, -86]], "#e8483e");
  box(c, -70, -124, 70, 16, "#2b2d36", 6);
  line6(c, [[86, -40], [100, -122]], "#2b2d36", 6);
  line6(c, [[92, -124], [80, -144], [106, -150]], "#2b2d36", 5);
  disc(c, 112, -124, 12, LIGHT);
  wheel(c, -85, -40, 40);
  wheel(c, 85, -40, 40);
};
var scooter = (c) => {
  floorShadow(c, 200);
  line6(c, [[60, -120], [66, -152]], CHROME3, 6);
  line6(c, [[52, -152], [76, -154]], "#2b2d36", 6);
  shape(c, [[20, -124], [56, -100], [50, -58], [24, -58]], "#e0e4ea");
  box(c, -46, -110, 110, 56, "#3fb8a8", 26);
  box(c, -70, -132, 84, 14, "#2b2d36", 6);
  box(c, -34, -56, 64, 12, CHROME3, 4);
  disc(c, 70, -134, 10, LIGHT);
  line6(c, [[-40, -70], [-74, -30]], "#2b2d36", 6);
  wheel(c, -74, -30, 30);
  wheel(c, 74, -30, 30);
};
var bicycle = (c) => {
  floorShadow(c, 220);
  wheel(c, -70, -46, 46, CHROME3, TYRE);
  wheel(c, 70, -46, 46, CHROME3, TYRE);
  const red = "#d6312b";
  line6(c, [[-70, -46], [-6, -50], [70, -46]], "#2b2d36", 4);
  line6(c, [[-70, -46], [-30, -100], [56, -104]], red, 6);
  line6(c, [[-30, -100], [-6, -50]], red, 6);
  line6(c, [[56, -104], [70, -46]], red, 6);
  line6(c, [[56, -104], [62, -128], [80, -126]], "#2b2d36", 5);
  box(c, -48, -116, 34, 10, "#2b2d36", 4);
  disc(c, -6, -50, 8, "#8a8f99");
};
var horseCart = (c) => {
  floorShadow(c, 600);
  line6(c, [[120, -110], [320, -70]], "#6b4a2e", 12);
  box(c, -260, -150, 380, 40, "#a06a3a", 6);
  box(c, -260, -110, 380, 22, "#8a5a34", 4);
  for (let x = -230; x < 110; x += 60) line6(c, [[x, -150], [x, -112]], "#6b4a2e", 2);
  box(c, 110, -190, 14, 82, "#8a5a34", 4);
  ell2(c, -80, -170, 120, 32, "#e8c060");
  wheel(c, -120, -100, 100, "#c9a24a", "#6b4a2e");
  wheel(c, 210, -100, 100, "#c9a24a", "#6b4a2e");
};
var carriage = (c) => {
  floorShadow(c, 520);
  box(c, -260, -110, 520, 14, TYRE, 4);
  box(c, -240, -240, 480, 130, "#2a2f5a", 18);
  line6(c, [[-240, -190], [240, -190]], "#e0b050", 6);
  shape(c, [[-250, -240], [-200, -336], [200, -336], [250, -240]], "#2a2f5a");
  glass(c, [[-190, -246], [-160, -318], [-60, -318], [-60, -246]]);
  glass(c, [[-50, -246], [-50, -318], [70, -318], [170, -246]]);
  box(c, -60, -236, 120, 118, "#2a2f5a", 8);
  disc(c, 0, -176, 20, "#e0b050");
  disc(c, 0, -176, 8, "#2a2f5a", false);
  wheel(c, -170, -80, 80, "#e0b050", "#2b2b2b");
  wheel(c, 170, -80, 80, "#e0b050", "#2b2b2b");
};
var tractor = (c) => {
  floorShadow(c, 400);
  box(c, -100, -110, 300, 22, TYRE, 4);
  box(c, 30, -172, 160, 92, "#e3572f", 14);
  box(c, 0, -118, 200, 40, "#c94a26", 8);
  box(c, 62, -248, 14, 78, "#2b2d36", 4);
  box(c, -120, -300, 128, 14, "#e3572f", 6);
  line6(c, [[-112, -288], [-112, -160]], "#c94a26", 8);
  line6(c, [[-12, -288], [-12, -160]], "#c94a26", 8);
  glass(c, [[-106, -286], [-16, -286], [-16, -170], [-106, -170]]);
  box(c, -84, -186, 44, 14, TYRE, 4);
  wheel(c, -110, -150, 150, "#f3c33c", TYRE);
  wheel(c, 160, -70, 70, "#f3c33c", TYRE);
};
var armyJeep = (c) => {
  floorShadow(c, 500);
  box(c, -220, -130, 440, 50, "#6b7a4a", 10);
  box(c, 110, -160, 100, 40, "#6b7a4a", 10);
  glass(c, [[98, -218], [122, -220], [118, -162], [92, -162]]);
  shape(c, [[-150, -180], [-150, -224], [-10, -224], [-50, -180]], "#55623c");
  box(c, -60, -170, 70, 40, "#4a5a3a", 6);
  disc(c, -60, -110, 14, "#f5f5f0", false);
  wheel(c, -230, -98, 36, CHROME3, TYRE);
  wheel(c, -150, -52, 52);
  wheel(c, 160, -52, 52);
};
var tank = (c) => {
  floorShadow(c, 800);
  box(c, -400, -70, 800, 70, TYRE, 30);
  for (let i = 0; i < 10; i++) disc(c, -380 + i * 80, -36, 19, "#4a4d58");
  box(c, -330, -190, 520, 118, "#5f7a4a", 22);
  box(c, -140, -292, 220, 112, "#5f7a4a", 40);
  disc(c, -30, -292, 16, "#3a4a2e");
  box(c, 70, -250, 260, 22, "#4a5d3a", 6);
  box(c, 318, -258, 22, 36, TYRE, 4);
  line6(c, [[-300, -150], [-260, -150]], "#3f4a32", 4);
};
var sidecar = (c) => {
  floorShadow(c, 320);
  box(c, -160, -112, 120, 62, "#d9534f", 20);
  line6(c, [[-110, -110], [-60, -60]], "#2b2d36", 6);
  wheel(c, -120, -34, 34);
  line6(c, [[-40, -92], [40, -42]], "#2b2d36", 8);
  line6(c, [[70, -40], [100, -92], [140, -40]], "#2b2d36", 8);
  shape(c, [[80, -110], [120, -130], [140, -110], [110, -96]], TAIL);
  box(c, 56, -122, 44, 12, "#2b2d36", 4);
  line6(c, [[140, -40], [150, -130]], "#2b2d36", 6);
  disc(c, 160, -120, 11, LIGHT);
  wheel(c, 70, -40, 40);
  wheel(c, 150, -40, 40);
};
var ambulance = (c) => {
  floorShadow(c, 620);
  box(c, -300, -240, 600, 176, "#f5f5f5", 20);
  box(c, -300, -150, 600, 16, TAIL, 0);
  box(c, 196, -200, 100, 126, "#f5f5f5", 18);
  glass(c, [[238, -226], [280, -226], [288, -180], [236, -180]]);
  shape(c, [[-148, -210], [-124, -210], [-124, -190], [-102, -190], [-102, -170], [-124, -170], [-124, -150], [-148, -150]], TAIL);
  for (let i = 0; i < 4; i++) windowR(c, -260 + i * 50, -226, 38, 42);
  box(c, -60, -262, 120, 14, "#3f7fd6", 6);
  disc(c, 0, -255, 7, TAIL, false);
  wheel(c, -190, -50, 50);
  wheel(c, 200, -50, 50);
};
var fireTruck = (c) => {
  floorShadow(c, 900);
  line6(c, [[-380, -272], [260, -272]], CHROME3, 7);
  line6(c, [[-380, -294], [260, -294]], CHROME3, 7);
  for (let x = -370; x < 250; x += 36) line6(c, [[x, -294], [x, -272]], shade(CHROME3, -0.3), 3);
  box(c, -400, -250, 690, 180, "#d7312b", 18);
  box(c, -400, -160, 690, 14, "#f6c531", 0);
  box(c, 262, -220, 130, 150, "#d7312b", 22);
  glass(c, [[294, -204], [360, -204], [372, -146], [292, -146]]);
  box(c, -120, -316, 110, 20, LIGHT, 6);
  disc(c, -60, -308, 8, TAIL, false);
  disc(c, -300, -170, 20, CHROME3);
  wheel(c, -300, -58, 58);
  wheel(c, -190, -58, 58);
  wheel(c, 300, -58, 58);
};
var rowboat = (c) => {
  floorShadow(c, 420, 0, 0.12);
  shape(c, [[-200, -96], [200, -96], [150, -30], [-150, -30]], "#c8382f");
  line6(c, [[-186, -66], [186, -66]], "#fbfbf7", 6);
  shape(c, [[-200, -96], [200, -96], [196, -106], [-196, -106]], "#8a5a34");
  box(c, -40, -112, 80, 10, "#8a5a34", 4);
  line6(c, [[-60, -100], [-150, -60], [-196, -36]], "#8a5a34", 6);
  shape(c, [[-196, -36], [-170, -28], [-190, -20]], "#8a5a34");
};
var sailboat = (c) => {
  floorShadow(c, 480, 0, 0.12);
  shape(c, [[-8, -552], [-8, -110], [-200, -110]], "#f3ece0");
  shape(c, [[10, -566], [10, -100], [226, -100]], "#fbfbf7");
  shape(c, [[10, -566], [10, -100], [60, -100], [60, -420]], shade("#fbfbf7", -0.1), false);
  box(c, -6, -580, 12, 500, CHROME3, 4);
  shape(c, [[0, -592], [54, -580], [0, -568]], TAIL);
  shape(c, [[-236, -102], [236, -102], [190, -40], [-200, -40]], "#2b5fa8");
  line6(c, [[-222, -84], [222, -84]], "#fbfbf7", 6);
  box(c, -130, -160, 140, 60, "#f5f5f5", 8);
  glass(c, [[-112, -150], [-80, -150], [-80, -120], [-112, -120]]);
  glass(c, [[-64, -150], [-30, -150], [-30, -120], [-64, -120]]);
  shape(c, [[-30, -40], [30, -40], [20, -6], [-20, -6]], "#3a4a5a");
};
var hotAirBalloon = (c) => {
  floorShadow(c, 120);
  c.save();
  c.beginPath();
  c.ellipse(0, -440, 170, 180, 0, 0, Math.PI * 2);
  c.fillStyle = "#e8483e";
  c.fill();
  c.clip();
  c.fillStyle = "#f6c531";
  for (let i = 0; i < 4; i++) c.fillRect(-170 + i * 86 + 20, -640, 44, 420);
  c.fillStyle = "rgba(0,0,0,0.12)";
  c.fillRect(60, -640, 120, 420);
  c.restore();
  c.beginPath();
  c.ellipse(0, -440, 170, 180, 0, 0, Math.PI * 2);
  c.strokeStyle = shade("#e8483e", -0.55);
  c.lineWidth = 2.5;
  c.stroke();
  line6(c, [[-50, -296], [-42, -72]], "#6b4a2e", 2.5);
  line6(c, [[50, -296], [42, -72]], "#6b4a2e", 2.5);
  line6(c, [[0, -262], [0, -72]], "#6b4a2e", 2.5);
  box(c, -50, -72, 100, 72, "#8a5a34", 10);
  line6(c, [[-50, -48], [50, -48]], "#5a3a22", 3);
};
var propellerPlane = (c) => {
  floorShadow(c, 620);
  shape(c, [[-60, -112], [90, -112], [120, -62], [-40, -62]], "#b6c2d0");
  shape(c, [[-330, -170], [-370, -268], [-300, -268], [-270, -170]], TAIL);
  box(c, -340, -170, 640, 96, "#e7edf3", 42);
  line6(c, [[-330, -120], [290, -120]], "#2f7fd6", 7);
  for (let i = 0; i < 7; i++) windowR(c, -292 + i * 60, -158, 40, 26);
  line6(c, [[-120, -74], [-120, -40]], "#6b7480", 6);
  line6(c, [[120, -74], [120, -40]], "#6b7480", 6);
  wheel(c, -120, -22, 22, CHROME3, TYRE);
  wheel(c, 120, -22, 22, CHROME3, TYRE);
  c.beginPath();
  c.ellipse(310, -150, 8, 76, 0, 0, Math.PI * 2);
  c.fillStyle = "rgba(40,40,50,0.55)";
  c.fill();
  disc(c, 310, -150, 14, "#8a8f99");
};
var fighterPlane = (c) => {
  floorShadow(c, 620);
  line6(c, [[-40, -70], [-40, -26]], "#4a4d58", 6);
  line6(c, [[120, -70], [120, -26]], "#4a4d58", 6);
  wheel(c, -40, -12, 12, CHROME3, TYRE);
  wheel(c, 120, -12, 12, CHROME3, TYRE);
  shape(c, [[-300, -140], [-350, -214], [-300, -214], [-240, -140]], "#5f6a78");
  shape(c, [[-80, -112], [80, -112], [-10, -40], [-110, -50]], "#6f7a88");
  shape(c, [[-360, -110], [-300, -142], [200, -142], [340, -112], [330, -94], [-320, -82]], "#8f9aa6");
  shape(c, [[120, -142], [170, -190], [210, -166], [200, -142]], GLASS5);
  disc(c, -338, -104, 8, "#2b2d36");
  line6(c, [[-290, -118], [290, -118]], "#c8382f", 4);
};
var helicopter = (c) => {
  floorShadow(c, 560);
  line6(c, [[-8, -8], [140, -8]], TYRE, 8);
  line6(c, [[-90, -8], [-90, -90]], TYRE, 6);
  line6(c, [[90, -8], [90, -90]], TYRE, 6);
  shape(c, [[-120, -220], [-340, -200], [-340, -170], [-120, -160]], TAIL);
  shape(c, [[-320, -200], [-350, -262], [-332, -264], [-300, -210]], TAIL);
  ell2(c, 0, -190, 160, 100, TAIL);
  ell2(c, 118, -190, 66, 68, GLASS5);
  line6(c, [[-340, -300], [340, -300]], TYRE, 7);
  line6(c, [[-40, -300], [40, -300]], TYRE, 5);
  line6(c, [[0, -292], [0, -260]], "#3a3f48", 8);
  disc(c, 0, -292, 12, "#3a3f48");
};
var rocket2 = (c) => {
  floorShadow(c, 200);
  shape(c, [[-70, -220], [-120, -40], [-70, -64]], TAIL);
  shape(c, [[70, -220], [120, -40], [70, -64]], TAIL);
  box(c, -70, -740, 140, 540, "#f5f5f5", 22);
  shape(c, [[-70, -740], [0, -900], [70, -740]], TAIL);
  box(c, -70, -520, 140, 20, TAIL, 0);
  disc(c, 0, -620, 30, GLASS5);
  disc(c, 0, -620, 30, shade(GLASS5, -0.3), false);
  shape(c, [[-40, -200], [40, -200], [60, -150], [-60, -150]], "#8a8f99");
};
var flyingSaucer = (c) => {
  glow(c, 0, -40, 150, "#9fe9ff", 0.35);
  c.beginPath();
  c.arc(0, -112, 110, Math.PI, 0);
  c.closePath();
  fillOut(c, "#bfe7f7");
  c.beginPath();
  c.ellipse(0, -100, 240, 48, 0, 0, Math.PI * 2);
  c.fillStyle = vgrad(c, -148, -52, [
    [0, "#dfe6ef"],
    [1, "#9aa6b8"]
  ]);
  c.fill();
  c.strokeStyle = shade("#9aa6b8", -0.55);
  c.lineWidth = 2.5;
  c.stroke();
  for (let i = 0; i < 7; i++) disc(c, -180 + i * 60, -96 + (i % 2 ? 6 : 0), 7, i % 2 ? "#ffd23f" : "#7bd36a", false);
};
var hoverCar = (c) => {
  glow(c, -160, -10, 60, "#ff9a3d", 0.4);
  glow(c, 160, -10, 60, "#ff9a3d", 0.4);
  shape(c, [[-260, -120], [-300, -100], [-260, -80]], "#4fb8d6");
  shape(c, [[260, -120], [300, -100], [260, -80]], "#4fb8d6");
  box(c, -260, -130, 520, 60, "#7ad0e8", 28);
  c.beginPath();
  c.ellipse(10, -130, 132, 62, 0, Math.PI, Math.PI * 2);
  c.closePath();
  fillOut(c, "#bfe9ff");
  disc(c, -160, -22, 14, "#3a4a6b");
  disc(c, 160, -22, 14, "#3a4a6b");
  disc(c, 262, -104, 10, LIGHT);
  line6(c, [[-220, -102], [220, -102]], "#ffffff", 3);
};
var marsRover = (c) => {
  floorShadow(c, 500);
  line6(c, [[-170, -92], [-170, -46]], "#6b7480", 5);
  line6(c, [[150, -92], [150, -46]], "#6b7480", 5);
  box(c, -190, -150, 300, 70, "#c0c0c8", 14);
  shape(c, [[-180, -150], [-150, -240], [-40, -240], [-70, -150]], "#2f5fa8");
  line6(c, [[-140, -150], [-110, -240]], "#7aa0d6", 2);
  line6(c, [[-100, -150], [-80, -240]], "#7aa0d6", 2);
  line6(c, [[60, -150], [60, -262]], CHROME3, 6);
  box(c, 36, -284, 40, 26, TAIL, 6);
  disc(c, 76, -270, 12, "#2b2d36");
  wheel(c, -170, -46, 46, "#9aa0aa", TYRE);
  wheel(c, -60, -46, 46, "#9aa0aa", TYRE);
  wheel(c, 60, -46, 46, "#9aa0aa", TYRE);
  wheel(c, 150, -46, 46, "#9aa0aa", TYRE);
};
var stoneCar = (c) => {
  floorShadow(c, 500);
  box(c, -180, -170, 300, 70, "#8a5a34", 30);
  ell2(c, -176, -135, 14, 34, "#d9a86a");
  line6(c, [[-140, -150], [60, -150]], "#6b4a2e", 2);
  line6(c, [[-120, -120], [40, -120]], "#6b4a2e", 2);
  box(c, -40, -220, 80, 50, "#9097a2", 12);
  line6(c, [[120, -168], [150, -226]], "#6b4a2e", 8);
  disc(c, 150, -232, 12, "#9097a2");
  line6(c, [[60, -110], [96, -58]], "#6b4a2e", 8);
  for (const x of [-170, 120]) {
    disc(c, x, -60, 58, "#8d8f97");
    disc(c, x, -60, 40, "#6d6f78", false);
    disc(c, x, -60, 12, "#3a3c44", false);
    line6(c, [[x - 8, -66], [x + 26, -92]], "#4a4c54", 3);
  }
};
var sled = (c) => {
  floorShadow(c, 240);
  line6(c, [[-120, -6], [120, -6]], "#4a3a2a", 8);
  line6(c, [[120, -6], [136, -22], [130, -42]], "#4a3a2a", 8);
  line6(c, [[-120, -6], [-130, -20]], "#4a3a2a", 6);
  box(c, -110, -62, 220, 40, "#b98552", 8);
  line6(c, [[-100, -44], [100, -44]], "#8a5a34", 3);
  line6(c, [[-110, -62], [-132, -92]], "#6b4a2e", 4);
};
var shoppingCart = (c) => {
  floorShadow(c, 140);
  line6(c, [[-60, -120], [-80, -144], [-50, -146]], CHROME3, 6);
  shape(c, [[-60, -120], [70, -120], [52, -50], [-46, -50]], "#c9ccd6");
  for (let x = -40; x < 70; x += 22) line6(c, [[x, -120], [x - 12, -50]], "#8a8f99", 2);
  for (let y = -100; y < -50; y += 20) line6(c, [[-56, y], [66, y]], "#8a8f99", 2);
  line6(c, [[-46, -50], [-40, -18]], "#8a8f99", 5);
  line6(c, [[52, -50], [48, -18]], "#8a8f99", 5);
  disc(c, -40, -10, 11, TYRE);
  disc(c, 40, -10, 11, TYRE);
};
var airlineCart = (c) => {
  floorShadow(c, 120);
  line6(c, [[52, -126], [58, -192], [-14, -196]], CHROME3, 6);
  box(c, -60, -128, 120, 110, "#f5f5f5", 10);
  box(c, -60, -100, 120, 12, "#2f7fd6", 0);
  for (let y = -80; y < -26; y += 16) line6(c, [[-54, y], [54, y]], "#b6c2d0", 2);
  box(c, -50, -116, 22, 10, "#e8483e", 3);
  disc(c, -40, -10, 12, TYRE);
  disc(c, 40, -10, 12, TYRE);
};
var VEHICLES_PROPS = [
  item2("car-modern", "Modern car", 560, 200, carModern),
  item2("vintage-car", "Round 1950s car", 600, 230, vintageCar),
  item2("taxi", "Taxi", 560, 210, taxi2),
  item2("police-car", "Police car", 560, 220, policeCar),
  item2("dolmus", "Dolmu\u015F minibus", 640, 280, dolmus),
  item2("bus", "City bus", 1e3, 380, bus),
  item2("tram", "Old tram", 1e3, 420, tram),
  item2("truck", "Truck", 900, 420, truck),
  item2("pickup", "Pickup truck", 600, 240, pickup),
  item2("motorbike", "Motorbike", 260, 170, motorbike),
  item2("scooter", "Scooter", 220, 170, scooter),
  item2("bicycle", "Bicycle", 220, 140, bicycle),
  item2("horse-cart", "Horse cart", 620, 300, horseCart),
  item2("carriage", "Royal coach", 560, 380, carriage),
  item2("tractor", "Tractor", 440, 320, tractor),
  item2("army-jeep", "Army jeep", 520, 230, armyJeep),
  item2("tank", "Tank", 820, 340, tank),
  item2("sidecar", "Motorbike with sidecar", 330, 170, sidecar),
  item2("ambulance", "Ambulance", 640, 300, ambulance),
  item2("fire-truck", "Fire truck", 900, 380, fireTruck),
  item2("rowboat", "Rowboat", 420, 120, rowboat, "bob"),
  item2("sailboat", "Sailboat", 520, 620, sailboat, "bob"),
  item2("hot-air-balloon", "Hot-air balloon", 360, 620, hotAirBalloon, "float"),
  item2("propeller-plane", "Propeller plane", 760, 300, propellerPlane),
  item2("fighter-plane", "Fighter plane", 720, 230, fighterPlane),
  item2("helicopter", "Helicopter", 760, 320, helicopter),
  item2("rocket", "Rocket", 260, 900, rocket2),
  item2("flying-saucer", "Flying saucer", 520, 200, flyingSaucer, "float"),
  item2("hover-car", "Hover car", 560, 200, hoverCar, "float"),
  item2("mars-rover", "Mars rover", 520, 300, marsRover),
  item2("stone-car", "Stone car", 520, 240, stoneCar),
  item2("sled", "Sled", 260, 80, sled),
  item2("shopping-cart", "Shopping cart", 160, 150, shoppingCart),
  item2("airplane-cart", "Airline trolley", 140, 200, airlineCart)
];

// src/props/eras.ts
var CHROME4 = "#c9ccd6";
function item3(id, name, cat2, w, h, draw, idle) {
  return idle ? { id, name, cat: cat2, w, h, idle, draw } : { id, name, cat: cat2, w, h, draw };
}
function line7(c, pts2, col, lw) {
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
}
function ell3(c, x, y, rx, ry, col) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  c.fillStyle = vgrad(c, y - ry, y + ry, [
    [0, shade(col, 0.12)],
    [1, shade(col, -0.16)]
  ]);
  c.fill();
  c.strokeStyle = shade(col, -0.55);
  c.lineWidth = 2.5;
  c.stroke();
}
function lens(c, x, y, rx, ry, col) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
}
function pane(c, x, y, w, h, tint, r = 6) {
  c.beginPath();
  rrect(c, x, y, w, h, r);
  c.fillStyle = tint;
  c.fill();
  c.strokeStyle = shade(tint, -0.5);
  c.lineWidth = 2;
  c.stroke();
  line7(c, [[x + w * 0.2, y + h * 0.78], [x + w * 0.45, y + h * 0.25]], "rgba(255,255,255,0.6)", 3);
}
function wood(c, x, y, w, h, col = "#8a5a34") {
  box(c, x, y, w, h, col, 6);
}
function throne(c) {
  floorShadow(c, 240);
  const wd = "#6b4428";
  box(c, -130, -30, 260, 30, "#7a5a3a", 4);
  box(c, -100, -380, 200, 250, wd, 18);
  box(c, -92, -368, 184, 200, "#8b1e2e", 16);
  disc(c, 0, -268, 18, "#e0b050");
  box(c, -128, -200, 48, 80, wd, 12);
  box(c, 80, -200, 48, 80, wd, 12);
  box(c, -92, -150, 184, 120, "#8b1e2e", 14);
  box(c, -92, -150, 184, 12, "#e0b050", 0);
  shape(c, [[-46, -380], [-40, -412], [-20, -392], [0, -420], [20, -392], [40, -412], [46, -380]], "#e0b050");
  for (const x of [-100, 100]) disc(c, x, -300, 6, "#e0b050");
}
function banner4(c) {
  floorShadow(c, 80, 0, 0.14);
  box(c, -4, -420, 8, 420, "#8a5a34", 3);
  disc(c, 0, -424, 7, "#e0b050");
  c.beginPath();
  c.moveTo(4, -398);
  c.quadraticCurveTo(40, -412, 72, -394);
  c.lineTo(70, -262);
  c.quadraticCurveTo(38, -252, 4, -270);
  c.closePath();
  fillOut(c, "#b3202c");
  star4(c, 36, -332, 20, "#f6c531");
  line7(c, [[14, -372], [60, -364]], "#f6c531", 4);
  line7(c, [[14, -290], [60, -282]], "#f6c531", 4);
}
function torch(c) {
  floorShadow(c, 40);
  glow(c, 0, -150, 80, "#ffb347", 0.5);
  box(c, -6, -120, 12, 120, "#6b4a2e", 3);
  shape(c, [[-14, -120], [14, -120], [8, -100], [-8, -100]], "#5a5a64");
  c.beginPath();
  c.moveTo(-14, -120);
  c.quadraticCurveTo(-20, -148, -4, -172);
  c.quadraticCurveTo(0, -150, 4, -184);
  c.quadraticCurveTo(22, -150, 14, -120);
  c.closePath();
  fillOut(c, "#ff7a2a");
  c.beginPath();
  c.moveTo(-6, -120);
  c.quadraticCurveTo(-8, -140, 0, -152);
  c.quadraticCurveTo(8, -136, 6, -120);
  c.closePath();
  fillOut(c, "#ffd23f");
}
function weaponRack(c) {
  floorShadow(c, 220);
  box(c, -100, -270, 10, 270, "#6b4a2e", 3);
  box(c, 90, -270, 10, 270, "#6b4a2e", 3);
  box(c, -106, -274, 212, 12, "#8a5a34", 4);
  box(c, -106, -150, 212, 10, "#8a5a34", 4);
  for (const x of [-60, -30]) {
    box(c, x - 4, -236, 8, 80, "#c9ccd6", 2);
    box(c, x - 14, -160, 28, 8, "#8a5a34", 3);
  }
  for (const x of [20, 50]) {
    line7(c, [[x, -270], [x, -6]], "#8a5a34", 6);
    shape(c, [[x - 8, -270], [x, -300], [x + 8, -270]], "#c9ccd6");
  }
  shape(c, [[70, -210], [100, -224], [100, -190], [70, -200]], "#9aa0aa");
  line7(c, [[78, -206], [78, -110]], "#6b4a2e", 4);
}
function armorStand(c) {
  floorShadow(c, 160);
  box(c, -50, -18, 100, 18, "#5a3a22", 5);
  box(c, -6, -330, 12, 316, "#5a3a22", 3);
  box(c, -36, -170, 30, 170, "#b8c0cc", 10);
  box(c, 6, -170, 30, 170, "#b8c0cc", 10);
  shape(c, [[-46, -262], [46, -262], [36, -150], [-36, -150]], "#c9d0da");
  line7(c, [[0, -254], [0, -162]], "#8a929e", 3);
  disc(c, -48, -258, 16, "#c9d0da");
  disc(c, 48, -258, 16, "#c9d0da");
  disc(c, 0, -296, 28, "#c9d0da");
  box(c, -16, -302, 32, 6, "#2b2d36", 3);
  shape(c, [[-96, -270], [-60, -270], [-60, -200], [-78, -170], [-96, -200]], "#8b1e2e");
  line7(c, [[-78, -260], [-78, -190]], "#e0b050", 4);
}
function catapult(c) {
  floorShadow(c, 500);
  wood(c, -210, -120, 340, 40, "#8a5a34");
  line7(c, [[-180, -120], [-120, -20]], "#6b4a2e", 10);
  line7(c, [[-30, -120], [-90, -20]], "#6b4a2e", 10);
  line7(c, [[-120, -110], [120, -300]], "#a06a3a", 16);
  shape(c, [[110, -320], [146, -300], [128, -270], [102, -282]], "#6b4a2e");
  disc(c, 118, -302, 9, "#9097a2");
  disc(c, 132, -310, 8, "#9097a2");
  wheel(c, -170, -60, 60, "#8a5a34", "#2b2b2b");
  wheel(c, 90, -60, 60, "#8a5a34", "#2b2b2b");
  line7(c, [[-120, -110], [-40, -110]], "#c9a24a", 3);
}
function treasureChest(c) {
  floorShadow(c, 160);
  box(c, -80, -80, 160, 80, "#8a5a34", 10);
  box(c, -80, -122, 160, 50, "#a06a3a", 22);
  for (const x of [-50, 50]) box(c, x - 5, -122, 10, 122, "#c9ccd6", 2);
  disc(c, 0, -72, 10, "#f6c531");
  for (let i = 0; i < 5; i++) disc(c, -40 + i * 20, -126 - i % 2 * 6, 7, "#f6c531");
}
function marketTent(c) {
  floorShadow(c, 380);
  box(c, -180, -236, 360, 136, "#f2e2b8", 4);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x0 = -190 + i * 380 / n;
    const x1 = x0 + 380 / n;
    shape(c, [[x0, -230], [x0 * 0.4, -340], [x1 * 0.4, -340], [x1, -230]], i % 2 ? "#fbfbf7" : "#c8382f");
    if (i % 2 === 0) shape(c, [[x0, -230], [x1, -230], [x1, -112], [x0, -112]], "#c8382f", false);
    disc(c, x0 + 24, -104, 14, i % 2 ? "#fbfbf7" : "#c8382f", false);
  }
  box(c, -150, -120, 300, 16, "#8a5a34", 4);
  box(c, -196, -236, 8, 236, "#6b4a2e", 2);
  box(c, 188, -236, 8, 236, "#6b4a2e", 2);
}
function hayCart(c) {
  floorShadow(c, 400);
  box(c, -180, -150, 260, 26, "#8a5a34", 4);
  box(c, -180, -190, 260, 40, "#a06a3a", 6);
  for (let x = -160; x < 80; x += 40) line7(c, [[x, -190], [x, -150]], "#6b4a2e", 2);
  ell3(c, -60, -200, 110, 30, "#e8c060");
  line7(c, [[80, -150], [200, -100]], "#6b4a2e", 10);
  wheel(c, 100, -80, 80, "#8a5a34", "#2b2b2b");
  wheel(c, -110, -80, 80, "#8a5a34", "#2b2b2b");
}
function stocks(c) {
  floorShadow(c, 200);
  box(c, -100, 0, 14, 200, "#6b4a2e", 3);
  box(c, 86, 0, 14, 200, "#6b4a2e", 3);
  planks(c, -100, -150, 200, 40, "#8a5a34", 2);
  planks(c, -100, -80, 200, 40, "#8a5a34", 2);
  disc(c, -50, -132, 12, "#2b2d36", false);
  disc(c, 50, -132, 12, "#2b2d36", false);
  disc(c, -50, -62, 12, "#2b2d36", false);
  disc(c, 50, -62, 12, "#2b2d36", false);
}
function anvil(c) {
  floorShadow(c, 120);
  shape(c, [[-46, -30], [46, -30], [30, 0], [-30, 0]], "#3a3f48");
  shape(c, [[-40, -36], [40, -36], [30, -30], [-30, -30]], "#3a3f48");
  box(c, -60, -70, 120, 36, "#4a505a", 8);
  shape(c, [[-60, -70], [-102, -82], [-60, -56]], "#4a505a");
  line7(c, [[-40, -66], [30, -66]], "#7a8290", 3);
}
function goblet(c) {
  floorShadow(c, 30, 0, 0.14);
  shape(c, [[-13, -50], [13, -50], [8, -30], [-8, -30]], "#e0b050");
  box(c, -2, -30, 4, 24, "#c9a24a", 1);
  ell3(c, 0, -2, 10, 3, "#e0b050");
  lens(c, 0, -48, 10, 2.5, "#8b1e2e");
}
function scroll(c) {
  floorShadow(c, 60, 0, 0.14);
  box(c, -26, -32, 52, 28, "#f2e2b8", 4);
  ell3(c, -26, -18, 6, 14, "#e0cc90");
  ell3(c, 26, -18, 6, 14, "#e0cc90");
  line7(c, [[-16, -26], [16, -26]], "#b8a06a", 2);
  line7(c, [[-16, -18], [16, -18]], "#b8a06a", 2);
  disc(c, 0, -12, 6, "#b3202c");
}
function roundTable(c) {
  floorShadow(c, 380);
  c.beginPath();
  c.moveTo(-180, -122);
  c.lineTo(180, -122);
  c.lineTo(170, -26);
  c.quadraticCurveTo(0, 6, -170, -26);
  c.closePath();
  fillOut(c, "#8b1e2e");
  ell3(c, 0, -122, 180, 36, "#a06a3a");
  box(c, -18, -86, 36, 84, "#6b4428", 6);
  ell3(c, 0, -6, 92, 12, "#6b4428");
  disc(c, -60, -140, 11, "#e0b050");
  disc(c, 60, -140, 11, "#c9ccd6");
}
function cauldron(c) {
  floorShadow(c, 160);
  glow(c, 0, -30, 90, "#ff7a2a", 0.4);
  c.beginPath();
  c.moveTo(-30, -6);
  c.quadraticCurveTo(-34, -36, -8, -48);
  c.quadraticCurveTo(-2, -28, 6, -52);
  c.quadraticCurveTo(30, -30, 30, -6);
  c.closePath();
  fillOut(c, "#ff7a2a");
  line7(c, [[-40, -6], [40, -6]], "#6b4a2e", 6);
  ell3(c, 0, -72, 66, 52, "#2b2d36");
  box(c, -52, -40, 14, 36, "#2b2d36", 4);
  box(c, 38, -40, 14, 36, "#2b2d36", 4);
  ell3(c, 0, -120, 70, 14, "#3a3d46");
  ell3(c, 0, -120, 58, 8, "#7bd36a");
}
function tapestry(c) {
  box(c, -135, -360, 270, 10, "#8a5a34", 4);
  box(c, -120, -352, 240, 330, "#7a2a3a", 4);
  c.save();
  c.beginPath();
  c.rect(-120, -352, 240, 330);
  c.clip();
  c.strokeStyle = "#e0b050";
  c.lineWidth = 6;
  c.strokeRect(-108, -340, 216, 306);
  for (let y = -300; y < -60; y += 60) {
    for (let x = -80; x <= 80; x += 80) {
      shape(c, [[x, y - 20], [x + 20, y], [x, y + 20], [x - 20, y]], "#e0b050", false);
    }
  }
  line7(c, [[0, -150], [0, -60]], "#2f7d4a", 8);
  for (const [x, y] of [
    [-22, -180],
    [22, -180],
    [0, -210]
  ]) {
    disc(c, x, y, 26, "#3f9b4e", false);
  }
  c.restore();
}
function sandbags(c) {
  floorShadow(c, 320);
  const sand2 = "#c8b07a";
  for (let i = 0; i < 4; i++) box(c, -150 + i * 76, -50, 74, 50, sand2, 22);
  for (let i = 0; i < 3; i++) box(c, -112 + i * 76, -100, 74, 50, shade(sand2, 0.04), 22);
  box(c, -74, -140, 74, 40, sand2, 20);
  box(c, 0, -140, 74, 40, sand2, 20);
}
function barbedWire(c) {
  floorShadow(c, 320, 0, 0.14);
  for (const x of [-150, -50, 50, 150]) box(c, x - 5, -100, 10, 100, "#6b4a2e", 2);
  for (const y of [-74, -40]) {
    c.beginPath();
    for (let x = -160; x <= 160; x += 20) {
      c.lineTo(x, y + ((x / 20 | 0) % 2 ? 6 : -6));
    }
    c.strokeStyle = "#5a5f68";
    c.lineWidth = 3;
    c.stroke();
  }
  for (let x = -150; x < 160; x += 30) {
    line7(c, [[x - 6, -80], [x + 6, -64]], "#5a5f68", 2.5);
    line7(c, [[x + 6, -80], [x - 6, -64]], "#5a5f68", 2.5);
  }
}
function ammoCrate(c) {
  floorShadow(c, 140);
  box(c, -70, -80, 140, 80, "#5d6b3a", 8);
  planks(c, -70, -80, 140, 80, "#5d6b3a", 4);
  box(c, -40, -58, 80, 26, "#e8d87a", 3);
  line7(c, [[-30, -46], [30, -46]], "#5d6b3a", 2);
  for (let i = 0; i < 4; i++) disc(c, -40 + i * 22, -90, 5, "#c9a24a");
}
function fieldRadio(c) {
  floorShadow(c, 110);
  line7(c, [[30, -70], [50, -112]], "#2b2d36", 3);
  box(c, -50, -72, 100, 72, "#4a5a3a", 10);
  box(c, -40, -60, 60, 22, "#c9ccd6", 4);
  disc(c, 30, -40, 10, "#2b2d36");
  disc(c, -16, -20, 8, "#2b2d36");
  for (let i = 0; i < 3; i++) line7(c, [[-30, -22 + i * 12], [16, -22 + i * 12]], "#2b2d36", 2);
  line7(c, [[-40, -90], [-50, -110]], "#2b2d36", 4);
}
function searchlight(c) {
  floorShadow(c, 160);
  line7(c, [[0, -150], [-40, 0]], "#4a4d58", 6);
  line7(c, [[0, -150], [40, 0]], "#4a4d58", 6);
  line7(c, [[0, -150], [0, 0]], "#4a4d58", 6);
  shape(c, [[30, -150], [80, -184], [80, -118]], "rgba(255,240,180,0.6)", false);
  ell3(c, 0, -160, 50, 40, "#c8cad0");
  disc(c, 40, -160, 22, "#fff3b0");
  disc(c, 40, -160, 12, "#ffffff", false);
}
function armyTent(c) {
  floorShadow(c, 460);
  shape(c, [[-220, 0], [-220, -120], [0, -290], [220, -120], [220, 0]], "#6b7a4a");
  shape(c, [[0, -290], [220, -120], [220, 0], [0, 0]], shade("#6b7a4a", -0.14), false);
  shape(c, [[-50, 0], [0, -130], [50, 0]], "#3f4a2e");
  line7(c, [[-220, -120], [-240, -102]], "#4a4d58", 4);
  line7(c, [[220, -120], [240, -102]], "#4a4d58", 4);
  line7(c, [[-120, -200], [-120, -150]], "#55623c", 2);
  line7(c, [[120, -200], [120, -150]], "#55623c", 2);
}
function flagPole(c) {
  floorShadow(c, 120, 0, 0.14);
  box(c, -4, -600, 8, 600, CHROME4, 3);
  disc(c, 0, -604, 8, "#f6c531");
  c.beginPath();
  c.moveTo(4, -580);
  c.quadraticCurveTo(50, -596, 100, -570);
  c.lineTo(104, -490);
  c.quadraticCurveTo(54, -506, 4, -480);
  c.closePath();
  fillOut(c, "#3d5a3a");
  line7(c, [[10, -530], [96, -520]], "#f5f5f0", 3);
}
function mapTable(c) {
  floorShadow(c, 300);
  box(c, -150, -100, 300, 20, "#6b4a2e", 6);
  box(c, -140, -80, 16, 80, "#6b4a2e", 3);
  box(c, 124, -80, 16, 80, "#6b4a2e", 3);
  box(c, -120, -150, 150, 46, "#e8dcae", 3);
  for (let y = -140; y < -110; y += 10) line7(c, [[-110, y], [20, y + 2]], "#b8a06a", 1.5);
  disc(c, -60, -128, 6, "#b3202c");
  disc(c, -10, -118, 6, "#2f5fa8");
  line7(c, [[40, -108], [120, -96]], "#6b4a2e", 5);
}
function trenchLadder(c) {
  floorShadow(c, 100);
  box(c, -40, -330, 8, 330, "#8a5a34", 2);
  box(c, 32, -330, 8, 330, "#8a5a34", 2);
  for (let y = -300; y < -10; y += 36) box(c, -40, y, 80, 8, "#a06a3a", 2);
}
function gasMask(c) {
  floorShadow(c, 50, 0, 0.12);
  line7(c, [[-20, -36], [-30, -10], [-8, -4]], "#2b2d36", 4);
  box(c, -14, -18, 28, 18, "#4a5a3a", 6);
  c.beginPath();
  c.ellipse(0, -36, 22, 26, 0, 0, Math.PI * 2);
  c.fillStyle = vgrad(c, -62, -10, [
    [0, "#5d6b3a"],
    [1, "#3a4526"]
  ]);
  c.fill();
  c.strokeStyle = "#2b2d36";
  c.lineWidth = 2.5;
  c.stroke();
  disc(c, -9, -40, 7, "#9fd8f0");
  disc(c, 9, -40, 7, "#9fd8f0");
  line7(c, [[-12, -20], [12, -20]], "#2b2d36", 2);
}
function oilDrum(c) {
  floorShadow(c, 100);
  box(c, -50, -150, 100, 150, "#2d5a9a", 14);
  lens(c, 0, -150, 50, 9, shade("#2d5a9a", 0.12));
  for (const y of [-120, -60]) line7(c, [[-50, y], [50, y]], shade("#2d5a9a", -0.3), 4);
  line7(c, [[-34, -150], [-34, -10]], "rgba(255,255,255,0.25)", 4);
  disc(c, 26, -100, 6, "#c9ccd6", false);
}
function bunkerDoor(c) {
  floorShadow(c, 260, 0, 0.14);
  box(c, -140, -300, 280, 300, "#4a4f58", 10);
  box(c, -120, -284, 240, 268, "#6b7078", 6);
  for (const [x, y] of [
    [-100, -264],
    [100, -264],
    [-100, -40],
    [100, -40]
  ]) {
    disc(c, x, y, 6, "#4a4f58", false);
  }
  disc(c, 0, -160, 34, "#4a4f58");
  for (let a = 0; a < 6; a++) {
    const t = a / 6 * Math.PI * 2;
    line7(c, [[0, -160], [Math.cos(t) * 30, -160 + Math.sin(t) * 30]], "#3a3d44", 4);
  }
  box(c, -80, -210, 160, 16, "#3a3d44", 4);
}
function controlPanel(c) {
  floorShadow(c, 300);
  box(c, -150, -120, 300, 120, "#3b4a6b", 14);
  shape(c, [[-150, -120], [-130, -170], [130, -170], [150, -120]], "#4a5c84");
  for (const x of [-100, 0]) box(c, x, -160, 100, 34, "#1f3a5a", 6);
  line7(c, [[-90, -146], [-60, -152], [-30, -140], [-6, -150]], "#7fe8ff", 2.5);
  line7(c, [[10, -150], [50, -140], [90, -152]], "#7fe8ff", 2.5);
  const cols = ["#ff6b8a", "#ffd23f", "#7bd36a", "#7fe8ff"];
  for (let i = 0; i < 8; i++) disc(c, -120 + i * 34, -90 + i % 2 * 14, 8, cols[i % 4]);
  box(c, -120, -60, 240, 10, "#2b3a55", 4);
}
function spaceConsole(c) {
  floorShadow(c, 200);
  box(c, -40, -80, 80, 80, "#5a6478", 8);
  box(c, -100, -120, 200, 46, "#3b4a6b", 12);
  shape(c, [[-100, -120], [-80, -230], [80, -230], [100, -120]], "#4a5c84");
  box(c, -70, -214, 140, 90, "#1f3a5a", 10);
  line7(c, [[-56, -196], [-30, -150], [0, -180], [30, -150], [56, -200]], "#7bd36a", 3);
  for (let i = 0; i < 5; i++) disc(c, -70 + i * 36, -100, 9, ["#ff6b8a", "#ffd23f", "#7fe8ff", "#7bd36a", "#ffffff"][i]);
}
function robotButler(c) {
  floorShadow(c, 160);
  ell3(c, 0, -12, 60, 12, "#3a3f48");
  box(c, -52, -190, 104, 180, "#c9ccd6", 30);
  box(c, -36, -150, 72, 60, "#3b4a6b", 8);
  disc(c, -14, -126, 6, "#7fe8ff", false);
  disc(c, 14, -126, 6, "#7fe8ff", false);
  line7(c, [[-50, -160], [-100, -110], [-88, -80]], "#8a929e", 12);
  line7(c, [[50, -160], [96, -130], [84, -100]], "#8a929e", 12);
  box(c, -44, -282, 88, 80, "#dfe3ea", 20);
  disc(c, -18, -248, 10, "#7fe8ff", false);
  disc(c, 18, -248, 10, "#7fe8ff", false);
  line7(c, [[0, -282], [0, -312]], "#8a929e", 4);
  disc(c, 0, -316, 7, "#ff6b8a");
  line7(c, [[-22, -224], [22, -224]], "#3b4a6b", 4);
}
function alien(c) {
  floorShadow(c, 140);
  ell3(c, 0, -60, 36, 46, "#7bd36a");
  box(c, -26, -20, 18, 20, "#5fae52", 6);
  box(c, 8, -20, 18, 20, "#5fae52", 6);
  ell3(c, 0, -170, 78, 70, "#7bd36a");
  line7(c, [[10, -236], [24, -262]], "#5fae52", 4);
  disc(c, 26, -264, 8, "#ff6b8a");
  for (const x of [-30, 30]) {
    disc(c, x, -168, 24, "#1d1d24", false);
    disc(c, x + 6, -176, 7, "#ffffff", false);
  }
  line7(c, [[-14, -132], [0, -124], [14, -132]], "#2b5a2a", 3);
  line7(c, [[-34, -90], [-60, -64]], "#5fae52", 8);
  line7(c, [[34, -90], [60, -64]], "#5fae52", 8);
}
function alienPlant(c) {
  floorShadow(c, 160);
  for (const [x, lean, col] of [
    [-40, -20, "#3f9b6e"],
    [10, 14, "#5fae52"],
    [54, -10, "#3f9b6e"]
  ]) {
    line7(c, [[x, 0], [x + lean * 0.5, -120], [x + lean, -220]], col, 12);
    ell3(c, x + lean, -226, 26, 34, "#c24fb0");
    for (let k = 0; k < 3; k++) disc(c, x + lean - 10 + k * 10, -236 + k * 6, 4, "#ffd6f2", false);
  }
  shape(c, [[-70, -8], [-30, -48], [-62, -70]], "#3f9b6e");
  shape(c, [[60, -8], [96, -60], [70, -90]], "#3f9b6e");
}
function crystal(c) {
  floorShadow(c, 140);
  shape(c, [[-50, 0], [-70, -90], [-30, -190], [30, -190], [70, -90], [50, 0]], "#9b6bd6");
  shape(c, [[30, -190], [70, -90], [50, 0], [10, 0], [30, -100]], "#6e46ad", false);
  shape(c, [[-30, -190], [10, -110], [30, -190]], "#c7a6f2", false);
  line7(c, [[-40, -130], [-22, -150]], "rgba(255,255,255,0.7)", 4);
  glow(c, 0, -110, 90, "#c7a6f2", 0.25);
}
function hologram(c) {
  floorShadow(c, 200, 0, 0.1);
  lens(c, 0, -8, 70, 14, "#3a4a6b");
  shape(c, [[-60, -10], [60, -10], [36, -220], [-36, -220]], hexA("#7fe8ff", 0.22), false);
  c.beginPath();
  c.arc(0, -210, 22, 0, Math.PI * 2);
  c.fillStyle = hexA("#7fe8ff", 0.55);
  c.fill();
  c.beginPath();
  c.moveTo(-34, -180);
  c.lineTo(34, -180);
  c.lineTo(42, -60);
  c.lineTo(-42, -60);
  c.closePath();
  c.fillStyle = hexA("#7fe8ff", 0.45);
  c.fill();
  for (let y = -190; y < -40; y += 14) line7(c, [[-40, y], [40, y]], hexA("#dff9ff", 0.35), 2);
}
function cryoPod(c) {
  floorShadow(c, 180);
  box(c, -70, -30, 140, 30, "#3a4150", 6);
  box(c, -60, -360, 120, 332, "#2b3446", 22);
  pane(c, -48, -340, 96, 290, hexA("#9fe9ff", 0.75), 18);
  ell3(c, 0, -110, 26, 30, "#3b5a8a");
  disc(c, 0, -180, 14, "#3b5a8a");
  for (const y of [-336, -296]) disc(c, 40, y, 4, "#7bd36a", false);
  box(c, -66, -364, 132, 12, "#5a6478", 4);
}
function oxygenTank(c) {
  floorShadow(c, 70);
  box(c, -30, -140, 60, 140, "#e8e8ec", 20);
  box(c, -14, -162, 28, 22, "#3a3f48", 4);
  box(c, -30, -84, 60, 14, "#f5822a", 0);
  disc(c, 0, -52, 10, "#c9ccd6");
  line7(c, [[-24, -120], [-24, -30]], "rgba(255,255,255,0.7)", 4);
}
function spaceDoor(c) {
  floorShadow(c, 260, 0, 0.14);
  box(c, -130, -420, 260, 420, "#5a6478", 12);
  box(c, -112, -402, 224, 398, "#8a94a8", 8);
  pane(c, -40, -330, 80, 100, "#7fe8ff", 12);
  for (let x = -110; x < 110; x += 44) {
    c.beginPath();
    c.moveTo(x, -18);
    c.lineTo(x + 22, -18);
    c.lineTo(x + 40, -40);
    c.lineTo(x + 18, -40);
    c.closePath();
    c.fillStyle = x / 44 % 2 ? "#f6c531" : "#2b2d36";
    c.fill();
  }
  box(c, -112, -260, 224, 10, "#5a6478", 0);
}
function roverWheel(c) {
  floorShadow(c, 120);
  disc(c, 0, -62, 58, "#3a3f48");
  disc(c, 0, -62, 42, "#f5822a", false);
  disc(c, 0, -62, 18, "#5a6478", false);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    line7(c, [[Math.cos(a) * 20, -62 + Math.sin(a) * 20], [Math.cos(a) * 40, -62 + Math.sin(a) * 40]], "#3a3f48", 4);
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    disc(c, Math.cos(a) * 52, -62 + Math.sin(a) * 52, 4, "#8a929e", false);
  }
}
function flagMars(c) {
  floorShadow(c, 100, 0, 0.14);
  box(c, -4, -330, 8, 330, CHROME4, 3);
  c.beginPath();
  c.moveTo(4, -320);
  c.quadraticCurveTo(44, -334, 90, -312);
  c.lineTo(90, -232);
  c.quadraticCurveTo(44, -246, 4, -226);
  c.closePath();
  fillOut(c, "#c8532f");
  disc(c, 46, -278, 14, "#f6c531", false);
}
function domeHabitat(c) {
  floorShadow(c, 600);
  box(c, -300, -46, 600, 46, "#8a94a8", 10);
  c.beginPath();
  c.moveTo(-280, -46);
  c.bezierCurveTo(-290, -220, 290, -220, 280, -46);
  c.closePath();
  c.fillStyle = hexA("#9fe9ff", 0.45);
  c.fill();
  c.save();
  c.clip();
  for (const x of [-200, -120, 80, 170]) disc(c, x, -60, 20, "#5fae52", false);
  glow(c, 0, -110, 180, "#ffe08a", 0.2);
  for (let x = -240; x <= 240; x += 60) line7(c, [[x, -46], [x * 0.3, -280]], "rgba(255,255,255,0.45)", 3);
  c.restore();
  c.beginPath();
  c.moveTo(-280, -46);
  c.bezierCurveTo(-290, -220, 290, -220, 280, -46);
  c.strokeStyle = shade("#9fe9ff", -0.5);
  c.lineWidth = 3;
  c.stroke();
  box(c, -40, -110, 80, 64, "#5a6478", 6);
}
function solarPanel(c) {
  floorShadow(c, 300);
  line7(c, [[0, 0], [0, -110]], "#6b7480", 10);
  line7(c, [[-10, -110], [70, -110]], "#6b7480", 8);
  c.save();
  c.translate(0, -140);
  c.rotate(-0.25);
  box(c, -140, -60, 280, 120, "#2f5fa8", 6);
  for (let x = -120; x < 140; x += 40) line7(c, [[x, -58], [x, 58]], "#7aa0d6", 2);
  for (let y = -40; y < 60; y += 40) line7(c, [[-138, y], [138, y]], "#7aa0d6", 2);
  c.restore();
}
function satellite(c) {
  floorShadow(c, 240);
  line7(c, [[0, -70], [0, -20]], "#6b7480", 8);
  box(c, -40, -120, 80, 60, CHROME4, 8);
  shape(c, [[-120, -110], [-40, -100], [-40, -60], [-110, -56]], "#2f5fa8");
  shape(c, [[40, -100], [120, -110], [110, -56], [40, -60]], "#2f5fa8");
  line7(c, [[-40, -90], [-120, -90]], "#7aa0d6", 2);
  line7(c, [[40, -90], [120, -90]], "#7aa0d6", 2);
  c.beginPath();
  c.arc(0, -150, 46, Math.PI * 1.05, Math.PI * 1.95);
  c.strokeStyle = "#b8c6d6";
  c.lineWidth = 12;
  c.stroke();
  c.strokeStyle = shade("#b8c6d6", -0.5);
  c.lineWidth = 2;
  c.stroke();
  line7(c, [[0, -120], [0, -170]], "#6b7480", 4);
  disc(c, 0, -176, 6, "#ff6b8a");
}
function coffin(c) {
  floorShadow(c, 160);
  shape(c, [[-50, -360], [50, -360], [70, -260], [60, -40], [30, 0], [-30, 0], [-60, -40], [-70, -260]], "#4a3424");
  shape(c, [[-40, -350], [40, -350], [54, -260], [46, -48], [22, -10], [-22, -10], [-46, -48], [-54, -260]], "#5a4030", false);
  line7(c, [[-30, -300], [30, -300]], "#2b1d14", 3);
  line7(c, [[-30, -220], [30, -220]], "#2b1d14", 3);
  line7(c, [[0, -330], [0, -150]], "#2b1d14", 6);
  line7(c, [[-26, -270], [26, -270]], "#2b1d14", 6);
  disc(c, 0, -110, 7, "#c9a24a");
}
function tombstone(c) {
  floorShadow(c, 120, 0, 0.12);
  c.beginPath();
  c.moveTo(-52, 0);
  c.lineTo(-52, -100);
  c.arc(0, -100, 52, Math.PI, 0);
  c.lineTo(52, 0);
  c.closePath();
  c.fillStyle = vgrad(c, -152, 0, [
    [0, "#b8bec8"],
    [1, "#7d8592"]
  ]);
  c.fill();
  c.strokeStyle = "#3a3f48";
  c.lineWidth = 3;
  c.stroke();
  line7(c, [[0, -130], [0, -76]], "#5a6068", 4);
  line7(c, [[-16, -110], [16, -110]], "#5a6068", 4);
  ell3(c, -30, -8, 22, 8, "#4caf5a");
  ell3(c, 30, -8, 18, 7, "#4caf5a");
}
function crossGrave(c) {
  floorShadow(c, 100, 0, 0.12);
  ell3(c, 0, -4, 60, 10, "#5b7a3a");
  box(c, -8, -170, 16, 170, "#6b4a2e", 3);
  box(c, -40, -124, 80, 16, "#6b4a2e", 3);
  line7(c, [[0, -170], [0, -174]], "#6b4a2e", 2);
}
function bone3(c, pts2, lw) {
  line7(c, pts2, "#5a5a66", lw + 3);
  line7(c, pts2, "#f2ecd9", lw);
}
function skeleton(c) {
  floorShadow(c, 140);
  bone3(c, [[-14, -150], [-20, -70], [-22, -6]], 10);
  bone3(c, [[14, -150], [20, -70], [22, -6]], 10);
  ell3(c, 0, -156, 20, 12, "#f2ecd9");
  bone3(c, [[0, -170], [0, -240]], 10);
  for (let y = -226; y <= -190; y += 12) bone3(c, [[-30, y], [30, y + 4]], 4);
  bone3(c, [[-6, -236], [-44, -200], [-50, -150]], 9);
  bone3(c, [[6, -236], [44, -200], [50, -150]], 9);
  disc(c, 0, -292, 28, "#f2ecd9");
  disc(c, -10, -296, 8, "#2b2d36", false);
  disc(c, 10, -296, 8, "#2b2d36", false);
  line7(c, [[-10, -276], [10, -276]], "#2b2d36", 3);
  bone3(c, [[0, -272], [0, -260]], 8);
}
function ghostSheet(c) {
  floorShadow(c, 160, 0, 0.1);
  c.beginPath();
  c.moveTo(-72, -40);
  c.lineTo(-72, -200);
  c.arc(0, -200, 72, Math.PI, 0);
  c.lineTo(72, -40);
  c.quadraticCurveTo(54, -20, 36, -40);
  c.quadraticCurveTo(18, -60, 0, -40);
  c.quadraticCurveTo(-18, -20, -36, -40);
  c.quadraticCurveTo(-54, -60, -72, -40);
  c.closePath();
  c.fillStyle = vgrad(c, -272, -20, [
    [0, "#ffffff"],
    [1, "#c9d0e0"]
  ]);
  c.fill();
  c.strokeStyle = "#7d8aa6";
  c.lineWidth = 2.5;
  c.stroke();
  ell3(c, -26, -196, 12, 16, "#1d1d24");
  ell3(c, 26, -196, 12, 16, "#1d1d24");
  disc(c, -22, -202, 3, "#ffffff", false);
  disc(c, 30, -202, 3, "#ffffff", false);
  ell3(c, 0, -160, 10, 12, "#1d1d24");
}
function candelabra(c) {
  floorShadow(c, 90);
  glow(c, 0, -120, 70, "#ffd27a", 0.4);
  ell3(c, 0, -6, 40, 8, "#c9a24a");
  box(c, -6, -120, 12, 116, "#c9a24a", 4);
  line7(c, [[0, -90], [-34, -110], [-34, -128]], "#c9a24a", 4);
  line7(c, [[0, -90], [34, -110], [34, -128]], "#c9a24a", 4);
  for (const [x, y] of [
    [0, -134],
    [-34, -134],
    [34, -134]
  ]) {
    box(c, x - 4, y, 8, 22, "#f2ecd9", 2);
    shape(c, [[x - 4, y], [x, y - 12], [x + 4, y]], "#ffd23f", false);
  }
}
function cobweb2(c) {
  c.save();
  c.beginPath();
  c.rect(-110, -200, 220, 200);
  c.clip();
  const ox = -100;
  const oy = -200;
  for (let k = 0; k <= 5; k++) {
    const a = k / 5 * (Math.PI / 2);
    line7(c, [[ox, oy], [ox + Math.cos(a) * 300, oy + Math.sin(a) * 300]], "#7d7d8c", 1.6);
  }
  for (const r of [40, 80, 120, 160, 200]) {
    c.beginPath();
    c.arc(ox, oy, r, 0, Math.PI / 2);
    c.strokeStyle = "#7d7d8c";
    c.lineWidth = 1.6;
    c.stroke();
  }
  c.restore();
}
function jackOLantern(c) {
  floorShadow(c, 90);
  glow(c, 0, -40, 90, "#ffd23f", 0.45);
  shape(c, [[-6, -74], [6, -74], [6, -90], [-6, -90]], "#4c7a2e");
  ell3(c, 0, -40, 42, 36, "#f08a24");
  for (const k of [-22, 0, 22]) line7(c, [[k * 0.5, -72], [k, -40], [k * 0.5, -8]], "#c86a18", 2.5);
  shape(c, [[-26, -50], [-12, -58], [-18, -40]], "#fff3b0", false);
  shape(c, [[26, -50], [12, -58], [18, -40]], "#fff3b0", false);
  shape(c, [[-20, -22], [-10, -10], [0, -22], [10, -10], [20, -22], [22, -10], [-22, -10]], "#fff3b0", false);
}
function spookyTree(c) {
  const r = rng(77);
  const bark = "#3a2a22";
  const branch = (x, y, ang, len, lw, depth) => {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    line7(c, [[x, y], [x2, y2]], bark, lw);
    if (depth > 0) {
      branch(x2, y2, ang - 0.5 - r() * 0.4, len * 0.7, lw * 0.68, depth - 1);
      branch(x2, y2, ang + 0.5 + r() * 0.4, len * 0.7, lw * 0.68, depth - 1);
    }
  };
  floorShadow(c, 300);
  c.save();
  c.scale(1.5, 1.5);
  shape(c, [[-46, 0], [-30, -180], [-20, -210], [20, -210], [30, -180], [46, 0]], bark);
  branch(0, -200, -Math.PI / 2 - 0.3, 130, 26, 4);
  branch(0, -200, -Math.PI / 2 + 0.6, 120, 24, 4);
  branch(0, -170, -Math.PI + 0.4, 90, 16, 3);
  branch(0, -150, -0.2, 90, 16, 3);
  c.restore();
}
function broomstick(c) {
  floorShadow(c, 220, 0, 0.14);
  line7(c, [[-60, -40], [90, -40]], "#8a5a34", 12);
  shape(c, [[-60, -42], [-112, -66], [-120, -36], [-112, -12], [-60, -34]], "#c9a24a");
  for (let i = 0; i < 4; i++) line7(c, [[-70, -40], [-112, -30 - i * 9]], "#8a6a20", 2);
  box(c, -74, -50, 22, 20, "#6b4a2e", 4);
}
function crystalBall(c) {
  floorShadow(c, 80);
  box(c, -30, -22, 60, 22, "#4a2f1c", 6);
  box(c, -12, -40, 24, 20, "#4a2f1c", 4);
  glow(c, 0, -70, 60, "#b89cff", 0.35);
  c.beginPath();
  c.arc(0, -70, 36, 0, Math.PI * 2);
  c.fillStyle = vgrad(c, -106, -34, [
    [0, "#d8c8ff"],
    [1, "#6e4aa8"]
  ]);
  c.fill();
  c.strokeStyle = "#3a2a5a";
  c.lineWidth = 2.5;
  c.stroke();
  line7(c, [[-20, -94], [-8, -102]], "rgba(255,255,255,0.8)", 4);
  line7(c, [[-6, -58], [10, -44]], "rgba(200,180,255,0.6)", 5);
}
function gargoyle(c) {
  floorShadow(c, 160);
  box(c, -70, -36, 140, 36, "#8a8f99", 6);
  shape(c, [[-30, -110], [-80, -180], [-60, -90]], "#6e737e");
  shape(c, [[30, -110], [80, -180], [60, -90]], "#6e737e");
  ell3(c, 0, -90, 42, 46, "#8a8f99");
  ell3(c, 0, -160, 36, 30, "#8a8f99");
  shape(c, [[-30, -170], [-48, -196], [-24, -186]], "#c9ccd6");
  shape(c, [[30, -170], [48, -196], [24, -186]], "#c9ccd6");
  disc(c, -12, -166, 6, "#ffd23f", false);
  disc(c, 12, -166, 6, "#ffd23f", false);
  shape(c, [[-14, -146], [-8, -136], [-2, -146]], "#fbfbf7", false);
  shape(c, [[14, -146], [8, -136], [2, -146]], "#fbfbf7", false);
  line7(c, [[-12, -128], [-30, -110]], "#6e737e", 6);
}
function potionShelf(c) {
  floorShadow(c, 220);
  box(c, -110, -300, 220, 300, "#6b4a2e", 6);
  for (const y of [-240, -170, -100]) box(c, -102, y, 204, 10, "#8a5a34", 2);
  const colors = ["#7bd36a", "#ff6b8a", "#7fe8ff", "#b89cff", "#ffd23f", "#f5822a"];
  for (let row3 = 0; row3 < 3; row3++) {
    for (let i = 0; i < 6; i++) {
      const x = -96 + i * 33;
      const y = -290 + row3 * 70;
      const col = colors[(i + row3) % colors.length];
      box(c, x, y + 26, 22, 30, col, 6);
      box(c, x + 6, y + 18, 10, 8, "#c9a24a", 2);
    }
  }
}
function hauntedPortrait(c) {
  floorShadow(c, 180, 0, 0.12);
  box(c, -90, -240, 180, 240, "#c9a24a", 6);
  box(c, -72, -222, 144, 204, "#3b3f4a", 4);
  ell3(c, 0, -130, 40, 52, "#c9d6c0");
  ell3(c, -14, -140, 6, 10, "#1d1d24");
  ell3(c, 14, -140, 6, 10, "#1d1d24");
  line7(c, [[-10, -104], [0, -98], [10, -104]], "#5a6a5a", 3);
  glow(c, 0, -130, 90, "#7bd36a", 0.25);
  box(c, -12, -16, 24, 12, "#c9a24a", 3);
}
function ironGate(c) {
  floorShadow(c, 320, 0, 0.14);
  box(c, -160, -380, 26, 380, "#3a3f48", 4);
  box(c, 134, -380, 26, 380, "#3a3f48", 4);
  for (const [x, y] of [
    [-148, -300],
    [148, -300]
  ]) disc(c, x, y, 10, "#2b2d36");
  for (const x of [-120, -80, -40, 0, 40, 80, 120]) {
    box(c, x - 3, -350, 6, 350, "#3a3f48", 2);
    shape(c, [[x - 8, -350], [x, -368], [x + 8, -350]], "#2b2d36");
  }
  for (const y of [-230, -40]) box(c, -134, y, 268, 8, "#3a3f48", 2);
  disc(c, 0, -200, 16, "#2b2d36", false);
  c.beginPath();
  c.arc(0, -200, 12, 0, Math.PI * 2);
  c.strokeStyle = "#4a4f58";
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  c.moveTo(-160, -380);
  c.quadraticCurveTo(0, -440, 160, -380);
  c.strokeStyle = "#3a3f48";
  c.lineWidth = 6;
  c.stroke();
}
function raven(c) {
  floorShadow(c, 60, 0, 0.12);
  line7(c, [[-6, -10], [-8, 0]], "#2b2d36", 3);
  line7(c, [[8, -10], [10, 0]], "#2b2d36", 3);
  shape(c, [[-20, -36], [-40, -20], [-26, -14]], "#1d1d24");
  ell3(c, 0, -30, 26, 20, "#1d1d24");
  lens(c, -4, -34, 14, 10, "#2b2d36");
  disc(c, 20, -48, 14, "#1d1d24");
  shape(c, [[30, -52], [46, -46], [30, -42]], "#3a3a44");
  disc(c, 24, -50, 4, "#ffd23f", false);
  disc(c, 25, -50, 1.8, "#1d1d24", false);
}
var ERAS_PROPS = [
  // medieval
  item3("throne", "Throne", "medieval", 260, 380, throne),
  item3("banner", "Banner", "medieval", 140, 420, banner4, "sway"),
  item3("torch", "Torch", "medieval", 50, 190, torch, "flicker"),
  item3("weapon-rack", "Weapon rack", "medieval", 220, 280, weaponRack),
  item3("armor-stand", "Armour stand", "medieval", 160, 330, armorStand),
  item3("catapult", "Catapult", "medieval", 520, 380, catapult),
  item3("treasure-chest", "Treasure chest", "medieval", 160, 120, treasureChest),
  item3("market-tent", "Market tent", "medieval", 380, 360, marketTent),
  item3("hay-cart", "Hay cart", "medieval", 400, 240, hayCart),
  item3("stocks", "Stocks", "medieval", 200, 200, stocks),
  item3("anvil", "Anvil", "medieval", 120, 90, anvil),
  item3("goblet", "Goblet", "medieval", 30, 50, goblet),
  item3("scroll", "Scroll", "medieval", 60, 40, scroll),
  item3("round-table", "Round table", "medieval", 380, 140, roundTable),
  item3("cauldron", "Cauldron", "medieval", 160, 140, cauldron, "flicker"),
  item3("tapestry", "Tapestry", "medieval", 260, 360, tapestry),
  // military
  item3("sandbags", "Sandbags", "military", 320, 140, sandbags),
  item3("barbed-wire", "Barbed wire", "military", 320, 110, barbedWire),
  item3("ammo-crate", "Ammo crate", "military", 140, 90, ammoCrate),
  item3("field-radio", "Field radio", "military", 110, 110, fieldRadio),
  item3("searchlight", "Searchlight", "military", 160, 260, searchlight),
  item3("army-tent", "Army tent", "military", 460, 300, armyTent),
  item3("flag-pole", "Flag pole", "military", 120, 600, flagPole, "sway"),
  item3("map-table", "Map table", "military", 300, 170, mapTable),
  item3("trench-ladder", "Trench ladder", "military", 100, 330, trenchLadder),
  item3("gas-mask", "Gas mask", "military", 50, 60, gasMask),
  item3("oil-drum", "Oil drum", "military", 100, 150, oilDrum),
  item3("bunker-door", "Bunker door", "military", 260, 300, bunkerDoor),
  // space
  item3("control-panel", "Control panel", "space", 300, 200, controlPanel),
  item3("space-console", "Space console", "space", 200, 260, spaceConsole),
  item3("robot-butler", "Robot butler", "space", 160, 330, robotButler),
  item3("alien", "Friendly alien", "space", 160, 230, alien),
  item3("alien-plant", "Alien plant", "space", 200, 280, alienPlant, "sway"),
  item3("crystal", "Crystal", "space", 140, 200, crystal),
  item3("hologram", "Hologram", "space", 200, 300, hologram, "flicker"),
  item3("cryo-pod", "Cryo pod", "space", 180, 380, cryoPod),
  item3("oxygen-tank", "Oxygen tank", "space", 70, 160, oxygenTank),
  item3("space-door", "Space door", "space", 260, 420, spaceDoor),
  item3("rover-wheel", "Rover wheel", "space", 120, 120, roverWheel),
  item3("flag-mars", "Mars flag", "space", 100, 330, flagMars, "sway"),
  item3("dome-habitat", "Dome habitat", "space", 600, 320, domeHabitat),
  item3("solar-panel", "Solar panel", "space", 300, 200, solarPanel),
  item3("satellite", "Satellite", "space", 260, 200, satellite),
  // spooky
  item3("coffin", "Coffin", "spooky", 160, 360, coffin),
  item3("tombstone", "Tombstone", "spooky", 120, 150, tombstone),
  item3("cross-grave", "Grave cross", "spooky", 100, 170, crossGrave),
  item3("skeleton", "Skeleton", "spooky", 140, 320, skeleton),
  item3("ghost-sheet", "Ghost sheet", "spooky", 160, 260, ghostSheet, "float"),
  item3("candelabra", "Candelabra", "spooky", 90, 160, candelabra, "flicker"),
  item3("cobweb", "Cobweb", "spooky", 220, 200, cobweb2),
  item3("jack-o-lantern", "Jack-o-lantern", "spooky", 90, 80, jackOLantern, "flicker"),
  item3("spooky-tree", "Dead tree", "spooky", 480, 720, spookyTree),
  item3("broomstick", "Broomstick", "spooky", 220, 60, broomstick),
  item3("crystal-ball", "Crystal ball", "spooky", 80, 110, crystalBall),
  item3("gargoyle", "Gargoyle", "spooky", 160, 200, gargoyle),
  item3("potion-shelf", "Potion shelf", "spooky", 220, 300, potionShelf),
  item3("haunted-portrait", "Haunted portrait", "spooky", 180, 240, hauntedPortrait),
  item3("iron-gate", "Iron gate", "spooky", 320, 380, ironGate),
  item3("raven", "Raven", "spooky", 70, 80, raven)
];

// src/props/moon.ts
var INK9 = "#2b2622";
var PAPER = "#ece4c6";
function item4(id, name, cat2, w, h, draw, idle, vehicle = false) {
  const d = { id, name, cat: cat2, w, h, draw };
  if (idle) d.idle = idle;
  if (vehicle) d.vehicle = true;
  return d;
}
var circ = (x, y, r) => (c) => c.arc(x, y, r, 0, Math.PI * 2);
var ell4 = (x, y, rx, ry, rot = 0) => (c) => c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
var rr = (x, y, w, h, r = 4) => (c) => c.roundRect(x, y, w, h, r);
var rect7 = (x, y, w, h) => (c) => c.rect(x, y, w, h);
var pts = (p, close = true) => (c) => {
  p.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  if (close) c.closePath();
};
function solid(c, p, fill, lw = 2.5, ink2) {
  c.beginPath();
  p(c);
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) {
    c.strokeStyle = ink2 ?? shade(fill, -0.55);
    c.lineWidth = lw;
    c.lineJoin = "round";
    c.stroke();
  }
}
function stroke(c, p, col, lw) {
  c.beginPath();
  p(c);
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
}
function hatch6(c, clips, o = {}) {
  const gap = o.gap ?? 5;
  const ang = o.ang ?? Math.PI / 4;
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  const R2 = 900;
  c.save();
  for (const p of clips) {
    c.beginPath();
    p(c);
    c.clip();
  }
  c.beginPath();
  for (let t = -R2; t <= R2; t += gap) {
    const px = -sn * t;
    const py = cs * t;
    c.moveTo(px - cs * R2, py - sn * R2);
    c.lineTo(px + cs * R2, py + sn * R2);
  }
  c.strokeStyle = o.ink ?? INK9;
  c.globalAlpha = o.alpha ?? 0.45;
  c.lineWidth = o.lw ?? 1;
  c.stroke();
  c.restore();
}
function rivets(c, list2, r = 3, col = "#4a505a") {
  for (const [x, y] of list2) solid(c, circ(x, y, r), col, 1, INK9);
}
function chain(c, x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const n = Math.max(1, Math.floor(len / 13));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    c.beginPath();
    c.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 6, 4.2, i % 2 ? ang + Math.PI / 2 : ang, 0, Math.PI * 2);
    c.strokeStyle = "#4a4e58";
    c.lineWidth = 2.6;
    c.stroke();
  }
}
function blob(c, cx, cy, rx, ry, seed, col) {
  const r = rng(seed);
  const p1 = r() * 6;
  const p2 = r() * 6;
  c.beginPath();
  for (let i = 0; i <= 14; i++) {
    const t = i / 14 * Math.PI * 2;
    const k = 1 + 0.16 * Math.sin(3 * t + p1) + 0.1 * Math.sin(5 * t + p2);
    const x = cx + Math.cos(t) * rx * k;
    const y = cy + Math.sin(t) * ry * k;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.strokeStyle = shade(col, -0.45);
  c.lineWidth = 1.6;
  c.stroke();
}
var CRATERS = [
  [-300, -650, 38],
  [260, -660, 26],
  [-330, -420, 30],
  [325, -415, 20],
  [-262, -250, 24],
  [292, -232, 34],
  [-120, -792, 18],
  [122, -806, 22],
  [-40, -828, 13],
  [-345, -548, 14],
  [352, -562, 18],
  [-190, -150, 16],
  [192, -162, 14],
  [60, -800, 10],
  [-228, -742, 18],
  [232, -748, 14]
];
function craters(c, list2) {
  for (const [x, y, r] of list2) {
    solid(c, ell4(x, y, r, r * 0.84), shade(PAPER, -0.2), 1.2, shade(PAPER, -0.5));
    stroke(c, (c2) => c2.arc(x, y + r * 0.1, r * 0.78, 0.25, Math.PI - 0.25), "#fbf7e8", Math.max(1.5, r * 0.18));
  }
}
var NOSE = (c) => {
  c.moveTo(-34, -488);
  c.bezierCurveTo(-62, -455, -78, -410, -44, -398);
  c.bezierCurveTo(-18, -388, 18, -388, 44, -398);
  c.bezierCurveTo(78, -410, 62, -455, 34, -488);
  c.closePath();
};
function shellBody(c, open) {
  const hull = (c2) => {
    c2.moveTo(-96, 0);
    c2.lineTo(-96, -300);
    c2.bezierCurveTo(-96, -362, -30, -404, 0, -420);
    c2.bezierCurveTo(30, -404, 96, -362, 96, -300);
    c2.lineTo(96, 0);
    c2.closePath();
  };
  solid(c, hull, "#9aa3ad", 2.5);
  hatch6(c, [hull, rect7(16, -430, 120, 440)], { alpha: 0.5, gap: 5 });
  stroke(c, pts([[-62, -300], [-62, -60]], false), "rgba(255,255,255,0.55)", 9);
  rivets(c, [-78, -52, -26, 0, 26, 52, 78].map((x) => [x, -276]));
  rivets(c, [-78, -52, -26, 0, 26, 52, 78].map((x) => [x, -30]));
  solid(c, rr(-104, -18, 208, 18, 4), "#6d747e", 2.5);
  rivets(c, [-92, -69, -46, -23, 0, 23, 46, 69, 92].map((x) => [x, -9]), 2.5, "#c4cad2");
  solid(c, circ(0, -226, 34), "#b58a3e", 2.5);
  solid(c, circ(0, -226, 25), open ? "#1b1816" : "#9fd2ee", 1.5);
  if (!open) stroke(c, pts([[-14, -242], [-2, -234]], false), "rgba(255,255,255,0.8)", 4);
  if (!open) {
    solid(c, rr(-50, -166, 100, 124, 10), "#b7bfc9", 2.5);
    rivets(c, [[-38, -150], [-38, -58], [38, -150], [38, -58]], 3.5);
    solid(c, circ(36, -108, 9), "#8a8f98", 2);
    hatch6(c, [rr(-50, -166, 100, 124, 10), rect7(20, -170, 60, 140)], { alpha: 0.3, gap: 4 });
  } else {
    solid(c, rr(-50, -166, 100, 124, 10), "#1b1816", 2.5);
    stroke(c, pts([[-26, -128], [-10, -70]], false), "rgba(230,200,140,0.35)", 3);
    solid(c, pts([[-50, -166], [-88, -150], [-88, -56], [-50, -42]]), "#b7bfc9", 2.5);
    rivets(c, [[-72, -134], [-72, -62]], 3);
    hatch6(c, [pts([[-50, -166], [-88, -150], [-88, -56], [-50, -42]])], { alpha: 0.35, gap: 4 });
  }
}
function moonFace(c, hit) {
  const cy = -450;
  const R2 = 400;
  const disc2 = circ(0, cy, R2);
  solid(c, disc2, PAPER, 3.5, INK9);
  solid(c, ell4(-130, -505, 64, 48), shade(PAPER, -0.1), 0);
  solid(c, ell4(130, -505, 64, 48), shade(PAPER, -0.1), 0);
  solid(c, ell4(0, -440, 62, 60), shade(PAPER, -0.06), 0);
  craters(c, CRATERS);
  c.beginPath();
  c.arc(0, cy, R2, 0, Math.PI * 2);
  c.moveTo(-60 + R2, cy - 60);
  c.arc(-60, cy - 60, R2, 0, Math.PI * 2);
  c.fillStyle = shade(PAPER, -0.14);
  c.fill("evenodd");
  hatch6(c, [disc2, rect7(0, cy, R2 + 40, R2 + 40)], { alpha: 0.28, gap: 5 });
  stroke(c, (c2) => c2.arc(0, cy, R2 - 14, Math.PI * 1.05, Math.PI * 1.45), "rgba(255,255,255,0.7)", 7);
  for (const s of [-1, 1]) {
    const ex = s * 128;
    const ey = -508;
    if (hit) {
      stroke(c, pts([[ex - s * 24, ey - 24], [ex + s * 22, ey], [ex - s * 24, ey + 24]], false), INK9, 6);
    } else {
      solid(c, ell4(ex, ey, 42, 27), "#fffdf2", 2.5, INK9);
      solid(c, circ(ex + s * 8, ey + 3, 13), INK9, 0);
      c.save();
      c.beginPath();
      ell4(ex, ey, 42, 27)(c);
      c.clip();
      c.fillStyle = shade(PAPER, -0.1);
      c.fillRect(ex - 50, ey - 40, 100, 33);
      c.restore();
      stroke(c, pts([[ex - 42, ey - 8], [ex + 42, ey - 8]], false), INK9, 3.5);
    }
    const brow = hit ? [[s * 200, -552], [s * 160, -598], [s * 104, -606], [s * 72, -586], [s * 112, -580], [s * 160, -572]] : [[s * 200, -548], [s * 160, -580], [s * 110, -588], [s * 68, -566], [s * 112, -562], [s * 160, -552]];
    solid(c, pts(brow), "#5b4b3a", 2, INK9);
    for (let k = 0; k < 4; k++) {
      const [bx, by] = brow[1 + k % 3];
      stroke(c, pts([[bx, by], [bx + s * 6, by - 12]], false), INK9, 1.6);
    }
  }
  solid(c, NOSE, "#eab09a", 3, INK9);
  hatch6(c, [NOSE, rect7(4, -500, 90, 120)], { alpha: 0.5, gap: 4 });
  solid(c, ell4(-18, -396, 8, 5), "#5a3428", 0);
  solid(c, ell4(18, -396, 8, 5), "#5a3428", 0);
  solid(c, ell4(-214, -420, 38, 24), hexA("#e39a8a", 0.5), 0);
  solid(c, ell4(214, -420, 38, 24), hexA("#e39a8a", 0.5), 0);
  if (!hit) {
    const mouth = (c2) => {
      c2.moveTo(-178, -362);
      c2.quadraticCurveTo(0, -334, 178, -362);
      c2.quadraticCurveTo(0, -262, -178, -362);
      c2.closePath();
    };
    solid(c, mouth, "#4a2828", 3);
    c.save();
    c.beginPath();
    mouth(c);
    c.clip();
    solid(c, ell4(10, -300, 72, 22), "#d97a7e", 0);
    c.fillStyle = "#fbf6e6";
    for (let x = -150; x <= 130; x += 24) c.fillRect(x, -352, 18, 15);
    c.restore();
  } else {
    solid(c, ell4(0, -338, 112, 62), "#3e1f22", 3);
    c.save();
    c.beginPath();
    ell4(0, -338, 112, 62)(c);
    c.clip();
    solid(c, ell4(0, -292, 74, 30), "#d97a7e", 0);
    c.fillStyle = "#fbf6e6";
    for (let x = -100; x <= 90; x += 24) c.fillRect(x, -400, 18, 20);
    c.restore();
    for (const s of [-1, 1]) {
      stroke(c, pts([[s * 118, -478], [s * 124, -420], [s * 116, -380]], false), "rgba(170,205,230,0.9)", 6);
    }
  }
}
function goo(c) {
  const col = "#e7f0d4";
  solid(c, ell4(-150, -522, 60, 42), col, 2, "#7f8f6c");
  solid(c, ell4(-188, -488, 34, 24), col, 2, "#7f8f6c");
  solid(c, ell4(-118, -488, 28, 20), col, 2, "#7f8f6c");
  solid(c, ell4(-172, -454, 9, 17), col, 1.6, "#7f8f6c");
  solid(c, ell4(-138, -444, 7, 14), col, 1.6, "#7f8f6c");
  solid(c, ell4(-204, -424, 6, 12), col, 1.4, "#7f8f6c");
}
function moonFaceHit(c) {
  moonFace(c, true);
  goo(c);
  c.save();
  c.translate(-225, -555);
  c.rotate(Math.PI / 2 + 0.3);
  c.scale(0.42, 0.42);
  shellBody(c, false);
  c.restore();
}
function moonShell(c, open) {
  floorShadow(c, 200, 0, 0.16);
  shellBody(c, open);
}
function cannon(c) {
  floorShadow(c, 1530);
  const a = -0.436;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const P4 = [-60, -120];
  const W17 = (x, y) => [P4[0] + x * cs - y * sn, P4[1] + x * sn + y * cs];
  const L2 = (list2) => (c2) => {
    list2.forEach(([x, y], i) => {
      const [wx, wy] = W17(x, y);
      if (i) c2.lineTo(wx, wy);
      else c2.moveTo(wx, wy);
    });
    c2.closePath();
  };
  solid(c, pts([[-772, -250], [-738, -250], [-846, -8], [-884, -8]]), "#6b4428", 2.5);
  wheel(c, -600, -128, 125, "#8a6a44", "#2b2622");
  wheel(c, -238, -128, 125, "#8a6a44", "#2b2622");
  planks(c, -790, -272, 700, 50, "#7a5230", 3);
  for (const x of [-640, -420, -190]) solid(c, rect7(x, -272, 12, 50), "#3f444e", 1.5, INK9);
  const low1 = W17(240, 120);
  const low2 = W17(640, 110);
  stroke(c, pts([[-250, -222], low1], false), INK9, 26);
  stroke(c, pts([[-250, -222], low1], false), "#3d424c", 20);
  stroke(c, pts([[-130, -222], low2], false), INK9, 22);
  stroke(c, pts([[-130, -222], low2], false), "#3d424c", 16);
  solid(c, rect7(-96, -232, 56, 118), "#3d424c", 2);
  solid(c, L2([[120, 62], [780, 56], [780, 104], [120, 124]]), "#4a505b", 2.5);
  rivets(c, [240, 420, 600].flatMap((x) => [W17(x, 70), W17(x, 116)]), 3, "#8d939e");
  const barrel2 = L2([[0, -82], [900, -64], [900, 64], [0, 84]]);
  solid(c, barrel2, "#5c6370", 2.5);
  hatch6(c, [L2([[0, 0], [900, 0], [900, 64], [0, 84]])], { alpha: 0.45, gap: 4 });
  stroke(c, L2([[40, -50], [880, -40]]), "rgba(255,255,255,0.35)", 6);
  for (const bx2 of [160, 420, 700]) {
    solid(c, L2([[bx2 - 16, -88], [bx2 + 16, -66], [bx2 + 16, 66], [bx2 - 16, 90]]), "#3e434d", 2);
    rivets(c, [-60, -30, 0, 30, 60].map((k) => W17(bx2, k)), 3, "#8d939e");
  }
  const [bx, by] = W17(0, 0);
  solid(c, circ(bx, by, 92), "#4f5561", 2.5);
  hatch6(c, [circ(bx, by, 92), rect7(bx, by - 100, 120, 200)], { alpha: 0.4, gap: 5 });
  const [mx, my] = W17(900, 0);
  c.beginPath();
  c.ellipse(mx, my, 18, 66, a, 0, Math.PI * 2);
  c.fillStyle = "#8d939e";
  c.fill();
  c.strokeStyle = INK9;
  c.lineWidth = 2.5;
  c.stroke();
  c.beginPath();
  c.ellipse(mx + 4 * cs, my + 4 * sn, 10, 52, a, 0, Math.PI * 2);
  c.fillStyle = "#1b1d22";
  c.fill();
}
function crucible(c) {
  for (const s of [-1, 1]) chain(c, s * 26, -322, s * 118, -200);
  solid(c, rr(-40, -328, 80, 12, 5), "#5b5f6b", 2);
  const bowl = (c2) => {
    c2.moveTo(-118, -190);
    c2.bezierCurveTo(-116, -92, -84, -36, 0, -34);
    c2.bezierCurveTo(84, -36, 116, -92, 118, -190);
    c2.closePath();
  };
  solid(c, bowl, "#6b6661", 2.8);
  hatch6(c, [bowl, rect7(20, -200, 140, 200)], { alpha: 0.5, gap: 4 });
  rivets(c, [-96, -72, -48, -24, 0, 24, 48, 72, 96].map((x) => [x, -136]), 3.2, "#8d8780");
  rivets(c, [-84, -56, -28, 0, 28, 56, 84].map((x) => [x, -92]), 3, "#8d8780");
  solid(c, ell4(-120, -196, 10, 8), "#5b5f6b", 2);
  solid(c, ell4(120, -196, 10, 8), "#5b5f6b", 2);
  solid(c, ell4(0, -190, 118, 24), "#8b8580", 2.5);
  solid(c, ell4(0, -190, 104, 18), "#ff9d3c", 1.5, "#7a3a14");
  solid(c, ell4(-14, -193, 62, 8), "#ffe08a", 0);
  glow(c, 0, -190, 170, "#ff9a3a", 0.55);
  solid(c, ell4(-112, -166, 6, 12), "#ff8a3a", 1.5, "#7a3a14");
  solid(c, ell4(102, -172, 5, 10), "#ff8a3a", 1.5, "#7a3a14");
}
function workbench(c) {
  floorShadow(c, 288);
  for (const x of [-146, 122]) solid(c, rect7(x, -74, 24, 74), "#6b4428", 2);
  solid(c, rect7(-150, -38, 300, 10), "#5a3b22", 2);
  planks(c, 64, -168, 96, 80, "#8a5a34", 4);
  solid(c, rect7(76, -158, 72, 58), "#f4ead2", 1.5, "#6b5c44");
  stroke(c, (c2) => c2.arc(112, -128, 15, 0, Math.PI * 2), "#4a6f9a", 1.6);
  stroke(c, pts([[112, -142], [112, -114]], false), "#4a6f9a", 1.4);
  stroke(c, pts([[98, -128], [126, -128]], false), "#4a6f9a", 1.4);
  stroke(c, pts([[84, -150], [130, -150]], false), "rgba(74,111,154,0.5)", 1);
  planks(c, -160, -92, 320, 20, "#a8733f", 3);
  stroke(c, pts([[-160, -92], [160, -92], [160, -72], [-160, -72]]), INK9, 2);
  solid(c, rect7(-98, -98, 74, 8), "#b07a44", 1.5);
  solid(c, rect7(-114, -110, 22, 22), "#6f7480", 1.8);
  stroke(c, pts([[-20, -100], [30, -100]], false), INK9, 11);
  stroke(c, pts([[-20, -100], [30, -100]], false), "#9aa1ac", 6);
  solid(c, rr(26, -112, 16, 24, 4), "#9aa1ac", 1.8);
  solid(c, rr(-158, -114, 52, 18, 8), "#efe3c4", 1.8);
  rivets(c, [[-60, -98], [-50, -104], [-40, -98], [-30, -106]], 3, "#8d939e");
}
function telescope2(c) {
  floorShadow(c, 160);
  const py = -190;
  const leg = (x0, y0, x1, y1) => {
    stroke(c, pts([[x0, y0], [x1, y1]], false), INK9, 16);
    stroke(c, pts([[x0, y0], [x1, y1]], false), "#8a5e36", 11);
  };
  leg(0, py, 22, -4);
  stroke(c, pts([[-60, -116], [60, -116]], false), INK9, 10);
  stroke(c, pts([[-60, -116], [60, -116]], false), "#7a5230", 6);
  c.save();
  c.translate(0, py);
  c.rotate(-0.87);
  solid(c, rect7(-52, -13, 44, 26), "#b08a3e", 2);
  solid(c, rect7(-10, -18, 150, 36), "#cfae56", 2.5);
  hatch6(c, [rect7(-10, 0, 150, 20)], { alpha: 0.4, gap: 4 });
  stroke(c, pts([[-4, -12], [132, -12]], false), "rgba(255,255,255,0.5)", 3);
  for (const bx of [28, 70]) solid(c, rect7(bx, -22, 8, 44), "#8d6c2e", 1.5);
  solid(c, pts([[140, -22], [172, -34], [172, 34], [140, 22]]), "#c9a64a", 2.5);
  solid(c, ell4(172, 0, 5, 30), "#5e8fa8", 2);
  c.restore();
  solid(c, circ(0, py, 16), "#6b4e2a", 2);
  solid(c, circ(0, py, 6), "#b08a3e", 1.5);
  leg(0, py, -86, -2);
  leg(0, py, 86, -2);
}
function blackboard(c) {
  floorShadow(c, 342, 0, 0.2);
  const leg = (x0, y0, x1, y1) => {
    stroke(c, pts([[x0, y0], [x1, y1]], false), INK9, 18);
    stroke(c, pts([[x0, y0], [x1, y1]], false), "#7a5230", 13);
  };
  leg(-110, -96, -160, 0);
  leg(110, -96, 160, 0);
  stroke(c, pts([[-148, -40], [148, -40]], false), "#6b4428", 8);
  solid(c, rr(-178, -308, 356, 216, 6), "#8a5a34", 3);
  hatch6(c, [rr(-178, -308, 356, 216, 6), rect7(90, -320, 120, 240)], { alpha: 0.3, gap: 5 });
  solid(c, rr(-160, -290, 320, 180, 3), "#2f3d38", 1.5, "#15201c");
  const chalk = "#e9f0e4";
  stroke(c, circ(-98, -212, 46), chalk, 3);
  blob(c, -116, -222, 16, 12, 3, "rgba(160,220,170,0.45)");
  stroke(c, pts([[-82, -196], [-72, -206], [-64, -198]], false), "#b8e0a8", 2.5);
  stroke(c, circ(106, -232, 20), chalk, 2.5);
  stroke(c, circ(100, -238, 5), chalk, 1.4);
  stroke(c, circ(112, -224, 3), chalk, 1.2);
  c.setLineDash([3, 7]);
  stroke(c, (c2) => {
    c2.moveTo(-48, -206);
    c2.quadraticCurveTo(10, -318, 84, -236);
  }, "#f2e7b0", 2.5);
  c.setLineDash([]);
  c.save();
  c.font = "italic 15px Georgia, serif";
  c.fillStyle = "rgba(236,240,230,0.92)";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillText("v\xB2 = 2gR", -150, -132);
  c.fillText("d = \xBD g t\xB2", 20, -130);
  c.fillText("E = mc\xB2", 96, -168);
  c.restore();
  stroke(c, (c2) => {
    c2.moveTo(-160, -160);
    c2.quadraticCurveTo(-40, -150, 40, -160);
  }, "rgba(230,236,226,0.12)", 10);
  solid(c, rr(-150, -100, 300, 12, 3), "#6e4a2a", 2);
}
function lectern(c) {
  floorShadow(c, 126);
  solid(c, pts([[-64, 0], [64, 0], [56, -22], [-56, -22]]), "#5e3d22", 2.5);
  solid(c, pts([[-22, -22], [22, -22], [16, -128], [-16, -128]]), "#7a5230", 2.5);
  hatch6(c, [pts([[-22, -22], [22, -22], [16, -128], [-16, -128]]), rect7(4, -140, 40, 140)], { alpha: 0.4, gap: 4 });
  const desk = pts([[-74, -128], [74, -128], [66, -166], [-66, -166]]);
  solid(c, desk, "#8a5a34", 2.5);
  hatch6(c, [desk, rect7(20, -180, 80, 60)], { alpha: 0.35, gap: 4 });
  solid(c, pts([[-66, -166], [66, -166], [84, -208], [-84, -208]]), "#a06f40", 2.5);
  stroke(c, pts([[-80, -204], [80, -204]], false), "rgba(255,255,255,0.35)", 3);
  solid(c, pts([[-44, -190], [-4, -198], [36, -192], [36, -200], [-4, -206], [-44, -198]]), "#f4ead2", 1.6, "#6b5c44");
  stroke(c, pts([[-4, -198], [-4, -206]], false), "#6b5c44", 1.2);
}
function mushroom2(c, s) {
  c.save();
  c.scale(s, s);
  const stem = (c2) => {
    c2.moveTo(-58, -222);
    c2.bezierCurveTo(-50, -150, -46, -70, -66, 0);
    c2.lineTo(66, 0);
    c2.bezierCurveTo(46, -70, 50, -150, 58, -222);
    c2.closePath();
  };
  solid(c, stem, "#e6dcc2", 3);
  hatch6(c, [stem, rect7(10, -230, 90, 240)], { alpha: 0.4, gap: 5 });
  stroke(c, (c2) => {
    c2.moveTo(-62, -196);
    c2.quadraticCurveTo(0, -174, 62, -196);
  }, "#b9af96", 9);
  const cap = (c2) => {
    c2.moveTo(-168, -214);
    c2.bezierCurveTo(-184, -340, -116, -444, 0, -444);
    c2.bezierCurveTo(116, -444, 184, -340, 168, -214);
    for (let i = 0; i < 6; i++) {
      const xa = 168 - i * 56;
      c2.quadraticCurveTo(xa - 28, -186, xa - 56, -214);
    }
    c2.closePath();
  };
  solid(c, cap, "#d6cde0", 3);
  c.save();
  c.beginPath();
  cap(c);
  c.clip();
  c.fillStyle = "#8f88a2";
  c.fillRect(-200, -226, 400, 20);
  c.restore();
  hatch6(c, [cap, rect7(40, -460, 200, 260)], { alpha: 0.45, gap: 5 });
  for (const [x, y, r] of [[-96, -356, 24], [-14, -402, 18], [70, -352, 28], [-132, -262, 14], [118, -290, 17], [16, -316, 11]]) {
    solid(c, circ(x, y, r), "#f7f2e4", 1.6);
  }
  stroke(c, (c2) => {
    c2.moveTo(-132, -300);
    c2.quadraticCurveTo(-120, -388, -40, -420);
  }, "rgba(255,255,255,0.55)", 9);
  c.restore();
}
function umbrella(c) {
  floorShadow(c, 160, 0, 0.18);
  stroke(c, pts([[0, -296], [0, -14]], false), "#5b5f6b", 6);
  stroke(c, (c2) => {
    c2.moveTo(0, -20);
    c2.lineTo(0, -14);
    c2.arc(-14, -14, 14, 0, Math.PI, false);
  }, "#5b5f6b", 6);
  const canopy2 = (c2) => {
    c2.moveTo(-102, -196);
    c2.quadraticCurveTo(-100, -292, 0, -302);
    c2.quadraticCurveTo(100, -292, 102, -196);
    for (let i = 0; i < 4; i++) {
      const xa = 102 - i * 51;
      c2.quadraticCurveTo(xa - 25.5, -178, xa - 51, -196);
    }
    c2.closePath();
  };
  solid(c, canopy2, "#25262d", 2.5, "#0c0c10");
  hatch6(c, [canopy2, rect7(10, -310, 110, 130)], { alpha: 0.45, ink: "#8a90a4", gap: 4 });
  stroke(c, (c2) => {
    c2.moveTo(-74, -214);
    c2.quadraticCurveTo(-82, -270, -20, -292);
  }, "rgba(255,255,255,0.35)", 6);
  for (const x of [-102, -51, 0, 51, 102]) stroke(c, pts([[0, -302], [x, -196]], false), "#3a3c46", 2);
  solid(c, circ(0, -300, 6), "#3a3c46", 1.5);
}
function starFace(c) {
  const cx = 0;
  const cy = -86;
  const star = (c2) => {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 34 : 80;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i) c2.lineTo(x, y);
      else c2.moveTo(x, y);
    }
    c2.closePath();
  };
  solid(c, star, "#f1c95c", 3);
  hatch6(c, [star, rect7(10, -180, 90, 180)], { alpha: 0.3, gap: 5 });
  stroke(c, (c2) => c2.arc(-24, -90, 9, Math.PI, Math.PI * 2), INK9, 3);
  stroke(c, (c2) => c2.arc(24, -90, 9, Math.PI, Math.PI * 2), INK9, 3);
  stroke(c, (c2) => c2.arc(0, -72, 14, 0.2, Math.PI - 0.2), INK9, 3);
  solid(c, ell4(-38, -70, 8, 5), hexA("#e0786a", 0.6), 0);
  solid(c, ell4(38, -70, 8, 5), hexA("#e0786a", 0.6), 0);
}
var CRESCENT = (c) => {
  c.moveTo(143.8, -109.1);
  c.arc(0, -190, 165, 0.51, 4.517, false);
  c.arc(55, -230, 150, 4.085, 0.9385, true);
  c.closePath();
};
function crescentFace(c) {
  solid(c, CRESCENT, "#f3e6a0", 3);
  hatch6(c, [CRESCENT, rect7(-220, -400, 110, 400)], { alpha: 0.35, gap: 5 });
  solid(c, pts([[-96, -240], [-68, -212], [-96, -196]]), "#f3e6a0", 2.5);
  stroke(c, (c2) => c2.arc(-122, -226, 8, 0, Math.PI), INK9, 3);
  stroke(c, (c2) => c2.arc(-104, -172, 7, 0.5, Math.PI * 0.8), INK9, 2.5);
  stroke(c, pts([[-110, -256], [-96, -262]], false), INK9, 2.5);
}
function saturn(c) {
  const cy = -140;
  const RING = "#c99d62";
  const band = (c2) => {
    c2.ellipse(0, 0, 210, 52, 0, 0, Math.PI * 2);
    c2.moveTo(150, 0);
    c2.ellipse(0, 0, 150, 36, 0, 0, Math.PI * 2, true);
  };
  const ringHalf = (upper) => {
    c.save();
    c.translate(0, cy);
    c.rotate(-0.14);
    c.beginPath();
    if (upper) c.rect(-260, -200, 520, 200);
    else c.rect(-260, 0, 520, 200);
    c.clip();
    c.beginPath();
    band(c);
    c.fillStyle = RING;
    c.fill("evenodd");
    hatch6(c, [band, rect7(-260, 0, 520, 200)], { alpha: 0.35, gap: 4 });
    c.beginPath();
    c.ellipse(0, 0, 210, 52, 0, 0, Math.PI * 2);
    c.strokeStyle = INK9;
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.ellipse(0, 0, 150, 36, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  };
  ringHalf(true);
  const disc2 = circ(0, cy, 96);
  solid(c, disc2, "#dcb878", 2.8);
  c.save();
  c.beginPath();
  disc2(c);
  c.clip();
  c.fillStyle = "rgba(185,143,83,0.5)";
  c.fillRect(-120, cy - 124, 240, 14);
  c.fillRect(-120, cy - 94, 240, 10);
  c.fillRect(-120, cy - 152, 240, 7);
  c.restore();
  hatch6(c, [disc2, rect7(30, cy - 120, 120, 240)], { alpha: 0.4, gap: 5 });
  stroke(c, pts([[-70, cy - 44], [-20, cy - 20]], false), INK9, 7);
  stroke(c, pts([[70, cy - 44], [20, cy - 20]], false), INK9, 7);
  solid(c, ell4(-36, cy, 13, 9), "#3b2a22", 0);
  solid(c, ell4(36, cy, 13, 9), "#3b2a22", 0);
  stroke(c, pts([[-50, cy - 4], [-22, cy - 1]], false), INK9, 3);
  stroke(c, pts([[50, cy - 4], [22, cy - 1]], false), INK9, 3);
  stroke(c, (c2) => {
    c2.moveTo(-40, cy + 40);
    c2.quadraticCurveTo(0, cy + 16, 40, cy + 40);
  }, INK9, 5);
  ringHalf(false);
}
function earth(c) {
  const cx = 0;
  const cy = -160;
  const R2 = 148;
  const disc2 = circ(cx, cy, R2);
  c.beginPath();
  c.arc(cx, cy, R2, 0, Math.PI * 2);
  c.fillStyle = vgrad(c, cy - R2, cy + R2, [[0, "#9cc8e0"], [1, "#3f6e9b"]]);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(cx, cy, R2, 0, Math.PI * 2);
  c.clip();
  blob(c, -40, -200, 52, 36, 3, "#93ad6c");
  blob(c, 40, -120, 40, 34, 7, "#b9a66c");
  blob(c, -62, -112, 26, 18, 11, "#93ad6c");
  blob(c, 56, -222, 22, 16, 5, "#93ad6c");
  blob(c, -10, -60, 30, 20, 9, "#b9a66c");
  cloud(c, -70, -236, 120, "#f6f2e6", void 0, 4);
  cloud(c, 66, -150, 110, "#f6f2e6", void 0, 9);
  cloud(c, -30, -92, 130, "#f6f2e6", void 0, 13);
  c.beginPath();
  c.arc(cx, cy, R2, 0, Math.PI * 2);
  c.moveTo(cx - 60 + R2, cy - 60);
  c.arc(cx - 60, cy - 60, R2, 0, Math.PI * 2);
  c.fillStyle = "rgba(12,28,56,0.35)";
  c.fill("evenodd");
  hatch6(c, [disc2, rect7(cx + 20, cy - R2, R2 + 20, 2 * R2)], { alpha: 0.22, gap: 5 });
  c.restore();
  stroke(c, circ(cx, cy, R2), INK9, 3);
  stroke(c, (c2) => c2.arc(cx, cy, R2 - 14, Math.PI * 1.1, Math.PI * 1.4), "rgba(255,255,255,0.45)", 8);
}
function comet2(c) {
  const hx = 122;
  const hy = -64;
  const hr = 28;
  const g = c.createLinearGradient(hx, 0, -210, 0);
  g.addColorStop(0, "rgba(255,246,206,0.95)");
  g.addColorStop(1, "rgba(210,226,255,0)");
  c.beginPath();
  c.moveTo(hx - 8, hy - 24);
  c.quadraticCurveTo(-40, hy - 40, -210, hy - 56);
  c.quadraticCurveTo(-60, hy - 6, hx - 8, hy + 18);
  c.closePath();
  c.fillStyle = g;
  c.fill();
  stroke(c, (c2) => {
    c2.moveTo(hx - 10, hy - 6);
    c2.quadraticCurveTo(-60, hy - 18, -205, hy - 4);
  }, "rgba(170,200,255,0.6)", 3);
  for (let k = 0; k < 5; k++) {
    stroke(c, pts([[hx - 14, hy - 14 + k * 7], [-150 + k * 8, hy - 30 + k * 12]], false), "rgba(255,255,240,0.35)", 1.6);
  }
  glow(c, hx, hy, 84, "#ffe9a0", 0.6);
  c.beginPath();
  c.arc(hx, hy, hr, 0, Math.PI * 2);
  c.fillStyle = rgrad(c, hx - 6, hy - 6, 2, hr, [[0, "#ffffff"], [0.55, "#fff1b8"], [1, "#e8a14e"]]);
  c.fill();
  c.strokeStyle = INK9;
  c.lineWidth = 2;
  c.stroke();
}
function throne2(c) {
  floorShadow(c, 300, 0, 0.18);
  const CR = "#e3f0ea";
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.92 + i * Math.PI * 0.84 / 8;
    const bx = Math.cos(a) * 92;
    const by = -250 + Math.sin(a) * 118;
    const tx = Math.cos(a) * (150 + i % 3 * 22);
    const ty = -250 + Math.sin(a) * (176 + i % 2 * 30);
    const px = -Math.sin(a) * 12;
    const py = Math.cos(a) * 12;
    solid(c, pts([[bx + px, by + py], [tx, ty], [bx - px, by - py]]), i % 2 ? CR : shade(CR, -0.1), 2);
  }
  const mound = (c2) => {
    c2.moveTo(-150, 0);
    c2.bezierCurveTo(-160, -60, -120, -70, -100, -80);
    c2.lineTo(100, -80);
    c2.bezierCurveTo(120, -70, 160, -60, 150, 0);
    c2.closePath();
  };
  solid(c, mound, "#a9c7bc", 2.5);
  for (const s of [-1, 1]) {
    const horn = pts([[s * 112, -110], [s * 150, -140], [s * 172, -186]], false);
    stroke(c, horn, INK9, 24);
    stroke(c, horn, "#c4ddd2", 17);
  }
  const back = (c2) => {
    c2.moveTo(-100, -100);
    c2.bezierCurveTo(-130, -200, -120, -300, -70, -330);
    c2.bezierCurveTo(-40, -360, -10, -380, 0, -390);
    c2.bezierCurveTo(10, -380, 40, -360, 70, -330);
    c2.bezierCurveTo(120, -300, 130, -200, 100, -100);
    c2.closePath();
  };
  solid(c, back, "#9fc3b5", 2.8);
  hatch6(c, [back, rect7(10, -400, 130, 320)], { alpha: 0.4, gap: 5 });
  glow(c, 0, -230, 120, "#b9a6ff", 0.2);
  solid(c, ell4(0, -96, 116, 42), "#c4ddd2", 2.5);
  stroke(c, pts([[-80, -110], [60, -112]], false), "rgba(255,255,255,0.5)", 5);
  stroke(c, pts([[-30, -320], [-60, -200]], false), "rgba(255,255,255,0.45)", 3);
  stroke(c, pts([[30, -330], [56, -210]], false), "rgba(255,255,255,0.35)", 2);
}
function lunarRock(c) {
  const rock2 = pts([
    [-125, 0],
    [-110, -40],
    [-124, -80],
    [-80, -130],
    [-62, -170],
    [-20, -150],
    [10, -196],
    [50, -170],
    [78, -184],
    [110, -120],
    [98, -72],
    [126, -30],
    [104, 0]
  ]);
  solid(c, rock2, "#d9d2bd", 2.8);
  hatch6(c, [rock2, rect7(0, -200, 140, 200)], { alpha: 0.45, gap: 4 });
  solid(c, ell4(-40, -90, 14, 9), shade("#d9d2bd", -0.16), 1.2, shade("#d9d2bd", -0.5));
  solid(c, ell4(60, -120, 10, 7), shade("#d9d2bd", -0.16), 1.2, shade("#d9d2bd", -0.5));
  solid(c, ell4(-6, -40, 18, 10), shade("#d9d2bd", -0.16), 1.2, shade("#d9d2bd", -0.5));
  stroke(c, pts([[-60, -150], [-30, -110], [-44, -70]], false), "rgba(90,80,60,0.45)", 1.6);
  stroke(c, (c2) => {
    c2.moveTo(-84, -110);
    c2.quadraticCurveTo(-74, -144, -40, -158);
  }, "rgba(255,255,255,0.6)", 5);
}
function professorStatue(c) {
  floorShadow(c, 252);
  const STAT = "#7d9c8c";
  const HI = "#a9c4b3";
  solid(c, rect7(-120, -22, 240, 22), "#b7b0a0", 2.5);
  solid(c, rect7(-100, -90, 200, 68), "#c4bdab", 2.5);
  hatch6(c, [rect7(-100, -90, 200, 68), rect7(30, -90, 100, 68)], { alpha: 0.35, gap: 5 });
  solid(c, rect7(-112, -108, 224, 18), "#b7b0a0", 2.5);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) solid(c, ell4(s * (88 + k % 2 * 4), -94 + k * 10, 8, 3.5, s * (0.9 - k * 0.2)), "#8fae7c", 1, "#2f4a38");
  }
  solid(c, rect7(-74, -96, 148, 44), "#5f7f6d", 2.5);
  stroke(c, rect7(-68, -90, 136, 32), "#d8cfa8", 1);
  c.save();
  c.font = "bold 11px Georgia, serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#ece3c4";
  c.fillText("LABOR OMNIA VINCIT", 0, -74);
  c.restore();
  const robe = (c2) => {
    c2.moveTo(-52, -370);
    c2.bezierCurveTo(-64, -300, -80, -200, -92, -110);
    c2.lineTo(92, -110);
    c2.bezierCurveTo(80, -200, 64, -300, 52, -370);
    c2.closePath();
  };
  solid(c, robe, STAT, 2.8);
  hatch6(c, [robe, rect7(8, -380, 110, 280)], { alpha: 0.4, gap: 6, ang: Math.PI / 2 });
  for (const x of [-40, -12, 22]) stroke(c, pts([[x, -300], [x * 1.25, -140]], false), "rgba(40,60,50,0.35)", 2);
  const armL = pts([[-50, -356], [-70, -284], [-74, -222]], false);
  stroke(c, armL, INK9, 30);
  stroke(c, armL, STAT, 24);
  solid(c, circ(-74, -210, 11), HI, 1.8);
  const armR = pts([[48, -352], [92, -404], [100, -462]], false);
  stroke(c, armR, INK9, 30);
  stroke(c, armR, STAT, 24);
  solid(c, circ(102, -476, 12), HI, 1.8);
  solid(c, pts([[-24, -414], [0, -372], [24, -414], [14, -400], [0, -400], [-14, -400]]), "#b9cfc3", 2, INK9);
  hatch6(c, [pts([[-24, -414], [0, -372], [24, -414]])], { alpha: 0.4, gap: 3 });
  solid(c, circ(0, -420, 30), HI, 2);
  solid(c, circ(-10, -424, 2.4), INK9, 0);
  solid(c, circ(10, -424, 2.4), INK9, 0);
  solid(c, pts([[-40, -452], [4, -552], [40, -452]]), "#6a8a7b", 2.5);
  hatch6(c, [pts([[-40, -452], [4, -552], [40, -452]]), rect7(4, -560, 60, 120)], { alpha: 0.35, gap: 4 });
  solid(c, ell4(0, -452, 52, 10), "#6a8a7b", 2.2);
  stroke(c, (c2) => c2.arc(0, -454, 50, Math.PI * 1.05, Math.PI * 1.95), "rgba(255,255,255,0.3)", 2);
}
function tugboat(c) {
  floorShadow(c, 648, 0, 0.2);
  const hull = pts([[-330, -130], [326, -130], [342, -88], [290, -30], [-258, -30], [-318, -62]]);
  solid(c, hull, "#2f4f4a", 3);
  c.save();
  c.beginPath();
  hull(c);
  c.clip();
  c.fillStyle = "#8a3b32";
  c.fillRect(-400, -52, 800, 22);
  c.restore();
  hatch6(c, [hull, rect7(120, -140, 240, 140)], { alpha: 0.35, gap: 5 });
  solid(c, rr(-330, -146, 656, 16, 4), "#d9c9a3", 2);
  for (const x of [-252, -208, -164, 186, 230]) {
    solid(c, circ(x, -88, 9), "#e7dcc0", 2);
    solid(c, circ(x, -88, 5), "#2a3640", 0);
  }
  solid(c, rr(-206, -232, 132, 86, 6), "#e7dcc0", 2.5);
  for (const x of [-190, -160, -130]) solid(c, rr(x, -214, 22, 26, 3), "#2f3f4c", 1.5);
  solid(c, rr(-214, -244, 148, 16, 5), "#2b2b2f", 2);
  solid(c, pts([[38, -146], [52, -286], [108, -286], [122, -146]]), "#22262a", 2.5);
  solid(c, pts([[46, -232], [114, -232], [116, -214], [44, -214]]), "#d4a04a", 2);
  solid(c, rr(44, -296, 72, 14, 4), "#c9a24a", 2);
  stroke(c, pts([[-180, -240], [-180, -304]], false), INK9, 6);
  solid(c, pts([[-180, -304], [-150, -296], [-180, -288]]), "#b8473c", 1.5);
  cloud(c, 96, -292, 130, "#d3d7da", "#a7aeb5", 6);
  cloud(c, 170, -272, 90, "#e4e7ea", "#aeb5bb", 2);
}
function fishA(c) {
  const body = (c2) => c2.ellipse(4, -35, 42, 26, 0, 0, Math.PI * 2);
  solid(c, pts([[-38, -35], [-64, -60], [-60, -35], [-64, -10]]), "#d2653a", 2);
  solid(c, pts([[-6, -58], [6, -82], [22, -56]]), "#d2653a", 2);
  solid(c, body, "#f0a050", 2.5);
  c.save();
  c.beginPath();
  body(c);
  c.clip();
  c.fillStyle = "#f6e7c8";
  for (const x of [-8, 14]) c.fillRect(x, -70, 7, 80);
  c.restore();
  hatch6(c, [body, rect7(-40, -6, 100, 20)], { alpha: 0.4, gap: 4 });
  solid(c, circ(28, -42, 6), "#fffdf2", 1.6);
  solid(c, circ(29, -42, 3), INK9, 0);
  stroke(c, (c2) => c2.arc(42, -28, 4, 0.3, 1.4), INK9, 2);
}
function fishB(c) {
  const body = (c2) => c2.ellipse(2, -30, 34, 24, 0, 0, Math.PI * 2);
  solid(c, pts([[-30, -30], [-54, -50], [-50, -30], [-54, -10]]), "#4f6fb8", 2);
  solid(c, pts([[-10, -54], [-2, -70], [18, -54]]), "#4f6fb8", 2);
  solid(c, body, "#6d8fd0", 2.5);
  c.save();
  c.beginPath();
  body(c);
  c.clip();
  c.fillStyle = "#e9e2c6";
  for (const x of [-18, 2, 22]) c.fillRect(x, -60, 6, 70);
  c.restore();
  hatch6(c, [body, rect7(-30, -4, 80, 20)], { alpha: 0.4, gap: 4 });
  solid(c, circ(20, -36, 5), "#fffdf2", 1.4);
  solid(c, circ(21, -36, 2.5), INK9, 0);
}
function octopus(c) {
  floorShadow(c, 198, 0, 0.2);
  for (let i = 0; i < 6; i++) {
    const x0 = -52 + i * 21;
    const s = i % 2 ? 1 : -1;
    const tp = (c2) => {
      c2.moveTo(x0, -76);
      c2.bezierCurveTo(x0 + s * 26, -40, x0 - s * 22, -28, x0 + s * 30, -4);
    };
    stroke(c, tp, INK9, 17);
    stroke(c, tp, "#8f6a9e", 12);
    solid(c, circ(x0 + s * 8, -44, 2.4), "#e9d7ee", 0);
  }
  const head = (c2) => {
    c2.moveTo(-66, -92);
    c2.bezierCurveTo(-74, -196, 74, -196, 66, -92);
    c2.bezierCurveTo(56, -70, -56, -70, -66, -92);
    c2.closePath();
  };
  solid(c, head, "#a582b5", 2.8);
  hatch6(c, [head, rect7(12, -220, 80, 160)], { alpha: 0.35, gap: 4 });
  stroke(c, (c2) => {
    c2.moveTo(-44, -160);
    c2.quadraticCurveTo(-30, -190, 4, -188);
  }, "rgba(255,255,255,0.4)", 7);
  for (const s of [-1, 1]) {
    solid(c, ell4(s * 24, -112, 15, 17), "#f7f2e4", 2);
    solid(c, circ(s * 24 + 2, -108, 7), INK9, 0);
    stroke(c, pts([[s * 24 - 15, -118], [s * 24 + 15, -118]], false), INK9, 3);
  }
}
function seaweed(c) {
  const strand = (x0, sway, hgt, col, seed) => {
    const centre = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      centre.push([x0 + Math.sin(t * 4.2 + seed) * sway * t, -t * hgt]);
    }
    stroke(c, pts(centre, false), INK9, 9);
    stroke(c, pts(centre, false), col, 5);
    for (let j = 0; j < 7; j++) {
      const [lx, ly] = centre[2 + j * 2];
      const side = j % 2 ? 1 : -1;
      solid(c, ell4(lx + side * 16, ly, 22, 7, side * -0.5), j % 2 ? col : shade(col, -0.14), 1.4, INK9);
    }
  };
  strand(-30, 14, 300, "#3b6e4a", 1);
  strand(30, -12, 290, "#4f8a5a", 2);
  strand(0, 10, 318, "#5a9a64", 3);
}
function seaShell(c) {
  const fan = (c2) => {
    c2.moveTo(0, -2);
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + i / 12 * Math.PI;
      const r = 44 + (i % 2 ? -3 : 0);
      c2.lineTo(Math.cos(a) * r, -2 + Math.sin(a) * r);
    }
    c2.closePath();
  };
  solid(c, fan, "#f2c4a8", 2.2);
  c.save();
  c.beginPath();
  fan(c);
  c.clip();
  c.strokeStyle = "#c98f6c";
  c.lineWidth = 1.4;
  c.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + i / 8 * Math.PI;
    c.moveTo(0, -2);
    c.lineTo(Math.cos(a) * 50, -2 + Math.sin(a) * 50);
  }
  c.stroke();
  c.restore();
  hatch6(c, [fan, rect7(10, -50, 40, 50)], { alpha: 0.35, gap: 4 });
}
function bunting2(c) {
  floorShadow(c, 630, 0, 0.14);
  const P0 = [-340, -128];
  const P1 = [0, -40];
  const P22 = [340, -128];
  const at2 = (t) => [
    (1 - t) * (1 - t) * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P22[0],
    (1 - t) * (1 - t) * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P22[1]
  ];
  for (const x of [-340, 340]) {
    solid(c, rect7(x - 6, -146, 12, 146), "#7a5230", 2);
    solid(c, circ(x, -148, 6), "#c9a24a", 1.5);
  }
  stroke(c, (c2) => {
    c2.moveTo(P0[0], P0[1]);
    c2.quadraticCurveTo(P1[0], P1[1], P22[0], P22[1]);
  }, "#4a3a2a", 2);
  const cols = ["#b8473c", "#efe2b8", "#3f7d78", "#d0a24e", "#7a4e6b"];
  const N = 13;
  for (let i = 0; i < N; i++) {
    const t = 0.05 + i * 0.9 / (N - 1);
    const [x, y] = at2(t);
    const tx = 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P22[0] - P1[0]);
    const ty = 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P22[1] - P1[1]);
    const L2 = Math.hypot(tx, ty);
    const ux = tx / L2 * 22;
    const uy = ty / L2 * 22;
    const col = cols[i % cols.length];
    solid(c, pts([[x - ux, y - uy], [x + ux, y + uy], [x + 2, y + 56]]), col, 2);
  }
}
function crowd3(c) {
  floorShadow(c, 810, 0, 0.16);
  const r = rng(42);
  const person = (x, s, body) => {
    const H = 300 * s;
    const hy = -H + 26 * s;
    const hr = 25 * s;
    const kind = Math.floor(r() * 3);
    const raise = r() < 0.5;
    if (raise) {
      const arm = pts([[x - 40 * s, -H + 62 * s], [x - 58 * s, -H - 30 * s]], false);
      stroke(c, arm, INK9, 16 * s);
      stroke(c, arm, body, 11 * s);
      solid(c, circ(x - 58 * s, -H - 34 * s, 7 * s), "#dcb896", 1, INK9);
    }
    const torso = (c2) => {
      c2.moveTo(x - 42 * s, -H + 56 * s);
      c2.lineTo(x + 42 * s, -H + 56 * s);
      c2.lineTo(x + 58 * s, 0);
      c2.lineTo(x - 58 * s, 0);
      c2.closePath();
    };
    solid(c, torso, body, 1.6);
    hatch6(c, [torso, rect7(x + 4 * s, -H, 60 * s, H)], { alpha: 0.35, gap: 4 });
    solid(c, circ(x, hy, hr), "#dcb896", 1.6);
    if (kind === 0) {
      solid(c, rect7(x - 26 * s, hy - 14 * s, 52 * s, 6 * s), INK9, 1);
      solid(c, rect7(x - 17 * s, hy - 40 * s, 34 * s, 28 * s), INK9, 1);
    } else if (kind === 1) {
      solid(c, (c2) => c2.arc(x, hy + 2 * s, 31 * s, Math.PI, Math.PI * 2), "#c25a6a", 1.4);
    } else {
      solid(c, rect7(x - hr - 2 * s, hy - hr * 0.9, hr * 2 + 4 * s, 6 * s), "#4a3f3a", 1.2);
    }
  };
  const back = ["#b7a7b4", "#9fb0c0", "#c7b58e", "#a9b59a"];
  for (let x = -440; x <= 440; x += 58) person(x + r.range(-8, 8), 0.8, back[Math.floor(r() * back.length)]);
  const front = ["#4e3f5a", "#2f3f57", "#6e4a2e", "#3c5a4f", "#7a3f3f"];
  for (let x = -420; x <= 420; x += 96) person(x + r.range(-10, 10), 0.92, front[Math.floor(r() * front.length)]);
}
var MOON_PROPS = [
  item4("moon-face", "Man in the Moon", "cosmic", 900, 900, (c) => moonFace(c, false), "float"),
  item4("moon-face-hit", "Man in the Moon, hurt", "cosmic", 900, 900, (c) => moonFaceHit(c), "float"),
  item4("moon-shell", "Moon shell", "cosmic", 240, 420, (c) => moonShell(c, false)),
  item4("moon-shell-open", "Moon shell, hatch open", "cosmic", 240, 420, (c) => moonShell(c, true)),
  item4("moon-cannon", "Moon cannon", "military", 1700, 520, (c) => cannon(c)),
  item4("foundry-crucible", "Molten crucible", "tech", 260, 320, (c) => crucible(c), "flicker"),
  item4("workbench", "Workbench", "tech", 320, 170, (c) => workbench(c)),
  item4("telescope-brass", "Brass telescope", "tech", 180, 400, (c) => telescope2(c)),
  item4("blackboard-moon", "Blackboard", "tech", 380, 320, (c) => blackboard(c)),
  item4("lectern", "Lectern", "furniture", 140, 230, (c) => lectern(c)),
  item4("giant-mushroom", "Giant lunar mushroom", "nature", 320, 440, (c) => {
    floorShadow(c, 288);
    mushroom2(c, 1);
  }, "sway"),
  item4("mushroom-small", "Small lunar mushroom", "nature", 120, 150, (c) => {
    floorShadow(c, 108);
    mushroom2(c, 0.34);
  }, "sway"),
  item4("umbrella-open", "Open umbrella", "home", 200, 300, (c) => umbrella(c)),
  item4("star-face", "Sleepy star", "cosmic", 170, 170, (c) => starFace(c), "float"),
  item4("crescent-moon-face", "Crescent moon", "cosmic", 380, 380, (c) => crescentFace(c), "float"),
  item4("saturn-face", "Grumpy Saturn", "cosmic", 440, 280, (c) => saturn(c), "float"),
  item4("earth-globe", "The Earth", "cosmic", 320, 320, (c) => earth(c), "float"),
  item4("comet", "Comet", "cosmic", 420, 130, (c) => comet2(c), "float"),
  item4("selenite-throne", "Selenite throne", "cosmic", 320, 400, (c) => throne2(c)),
  item4("lunar-rock", "Lunar rock", "nature", 260, 200, (c) => lunarRock(c)),
  item4("professor-statue", "Professor statue", "street", 280, 560, (c) => professorStatue(c)),
  item4("tugboat", "Tugboat", "vehicle", 720, 320, (c) => tugboat(c), "bob", true),
  item4("fish-a", "Orange fish", "animal", 130, 70, (c) => fishA(c), "wag"),
  item4("fish-b", "Blue fish", "animal", 100, 60, (c) => fishB(c)),
  item4("octopus", "Octopus", "animal", 220, 200, (c) => octopus(c), "wag"),
  item4("seaweed", "Seaweed", "nature", 120, 320, (c) => seaweed(c), "sway"),
  item4("sea-shell", "Sea shell", "nature", 80, 50, (c) => seaShell(c)),
  item4("bunting", "Festival bunting", "street", 700, 140, (c) => bunting2(c), "sway"),
  item4("crowd-flat", "Cheering crowd", "street", 900, 330, (c) => crowd3(c))
];

// src/props/caricature.ts
var TAU = Math.PI * 2;
var INK_LINE = "#2a1c18";
var WOOD5 = "#a8703a";
var WOOD_D3 = "#6e4424";
var WOOD_L3 = "#c8924f";
var RED4 = "#c8432f";
var ORANGE2 = "#e8553a";
var MAROON = "#8e3b3b";
var MAROON_L = "#a84c4c";
var BLUE3 = "#3a72b8";
var GOLD2 = "#d9a441";
var BRASS5 = "#b8973e";
var COPPER3 = "#b8673a";
var IRON4 = "#4b4f57";
var CHROME5 = "#c9ccd6";
var CREAM7 = "#f3e8cc";
var WHITE3 = "#f7f4ea";
var GREEN3 = "#4f9a4f";
var AMBER = "#c5651c";
var TAN = "#b89a5c";
var DARKRED = "#8a2e22";
function ell5(cx, cy, rx, ry, n = 22, a0 = 0, a1 = TAU, rot = 0) {
  const out = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return out;
}
function rr2(x, y, w, h, r = 0) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  if (k === 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return [
    ...ell5(x + w - k, y + k, k, k, 4, -Math.PI / 2, 0),
    ...ell5(x + w - k, y + h - k, k, k, 4, 0, Math.PI / 2),
    ...ell5(x + k, y + h - k, k, k, 4, Math.PI / 2, Math.PI),
    ...ell5(x + k, y + k, k, k, 4, Math.PI, Math.PI * 1.5)
  ];
}
function capsule(x1, y1, x2, y2, r) {
  const t = Math.atan2(y2 - y1, x2 - x1);
  return [...ell5(x2, y2, r, r, 6, t - Math.PI / 2, t + Math.PI / 2), ...ell5(x1, y1, r, r, 6, t + Math.PI / 2, t + Math.PI * 1.5)];
}
function scallopEdge(x0, x1, y, depth, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const xa = x0 + (x1 - x0) * k / n, xb = x0 + (x1 - x0) * (k + 1) / n;
    out.push(...ell5((xa + xb) / 2, y, Math.abs(xb - xa) / 2, depth, 6, Math.PI, 0).slice(0, 6));
  }
  out.push([x1, y]);
  return out;
}
function doilyPts(cx, cy, rx, ry, bumps, depth) {
  const out = [];
  for (let i = 0; i <= 72; i++) {
    const a = i / 72 * TAU;
    const k = 1 + depth * Math.abs(Math.sin(bumps * a / 2));
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}
function zig(x0, x1, y, amp, step) {
  const out = [];
  let k = 0;
  for (let x = x0; x <= x1; x += step, k++) out.push([x, y + (k % 2 ? amp : -amp)]);
  return out;
}
function ink(c, pts2, closed, color, seed, lw = 3) {
  const r = rng(seed);
  c.beginPath();
  pts2.forEach(([x, y], i) => {
    const jx = x + r.range(-0.7, 0.7), jy = y + r.range(-0.7, 0.7);
    if (i) c.lineTo(jx, jy);
    else c.moveTo(jx, jy);
  });
  if (closed) {
    c.closePath();
    c.fillStyle = color;
    c.fill();
  }
  c.strokeStyle = closed ? INK_LINE : color;
  c.lineWidth = lw;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.stroke();
}
function hatch7(c, x, y, w, h, angle, gap) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const nx = -dy, ny = dx;
  const corners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
  const ps = corners.map((p) => p[0] * nx + p[1] * ny);
  const lo = Math.min(...ps), hi = Math.max(...ps);
  c.save();
  c.strokeStyle = "rgba(42,28,24,0.7)";
  c.lineWidth = 1.4;
  c.lineCap = "round";
  c.beginPath();
  for (let t = lo; t <= hi; t += gap) {
    const bx = nx * t, by = ny * t;
    let s0 = -1e4, s1 = 1e4;
    const slab = (b, d, a, z) => {
      if (Math.abs(d) < 1e-9) {
        if (b < a || b > z) {
          s0 = 1;
          s1 = -1;
        }
        return;
      }
      let t1 = (a - b) / d, t2 = (z - b) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      s0 = Math.max(s0, t1);
      s1 = Math.min(s1, t2);
    };
    slab(bx, dx, x, x + w);
    slab(by, dy, y, y + h);
    if (s1 > s0) {
      c.moveTo(bx + dx * s0, by + dy * s0);
      c.lineTo(bx + dx * s1, by + dy * s1);
    }
  }
  c.stroke();
  c.restore();
}
function stipple2(c, x, y, w, h, n, seed, color = "rgba(42,28,24,0.8)") {
  const r = rng(seed);
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    c.beginPath();
    c.arc(x + r() * w, y + r() * h, 0.7 + r() * 0.7, 0, TAU);
    c.fill();
  }
}
function hl(c, x1, y1, x2, y2, a = 0.9) {
  c.save();
  c.strokeStyle = `rgba(255,255,255,${a})`;
  c.lineWidth = 2.2;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  c.restore();
}
function clipTo(c, pts2) {
  c.save();
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.clip();
}
function grain(c, x, y, w, h, seed, n, color) {
  const r = rng(seed);
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 1.2;
  c.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const yy = y + (i + 0.5) / n * h;
    const ph = r() * 6;
    c.beginPath();
    for (let k = 0; k <= 8; k++) {
      const xx = x + k / 8 * w;
      const yj = yy + Math.sin(k * 0.9 + ph) * 1.6;
      if (k) c.lineTo(xx, yj);
      else c.moveTo(xx, yj);
    }
    c.stroke();
  }
  c.restore();
}
function tri(c, pts2, color) {
  c.beginPath();
  pts2.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.strokeStyle = INK_LINE;
  c.lineWidth = 0.8;
  c.stroke();
}
function die(c, x, y, s, v, seed) {
  ink(c, rr2(x - s / 2, y - s / 2, s, s, s * 0.2), true, WHITE3, seed, 1.5);
  const pips = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
  };
  c.fillStyle = INK_LINE;
  for (const [i, j] of pips[v] ?? []) {
    c.beginPath();
    c.arc(x + i * s * 0.27, y + j * s * 0.27, s * 0.09, 0, TAU);
    c.fill();
  }
}
function teaGlass(c, x, y, seed) {
  ink(c, ell5(x, y, 16, 5), true, GOLD2, seed);
  const g = [[x - 5, y - 3], [x - 3, y - 12], [x - 2, y - 16], [x - 10, y - 26], [x - 9, y - 34], [x + 9, y - 34], [x + 10, y - 26], [x + 2, y - 16], [x + 3, y - 12], [x + 5, y - 3]];
  ink(c, g, true, "#f4f7ef", seed + 1, 2);
  clipTo(c, g);
  c.fillStyle = AMBER;
  c.fillRect(x - 12, y - 30, 24, 30);
  c.restore();
  ink(c, g, false, INK_LINE, seed + 2, 2.4);
  hl(c, x - 6, y - 29, x - 5, y - 17);
}
function orange(c, x, y, r, seed, leaf = true) {
  ink(c, ell5(x, y, r, r, 16), true, "#f08a24", seed, 2.2);
  stipple2(c, x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4, 9, seed + 1);
  hl(c, x - r * 0.55, y - r * 0.1, x - r * 0.25, y - r * 0.6);
  if (leaf) ink(c, ell5(x + 2, y - r + 1, 4, 2, 8, 0, TAU, -0.5), true, GREEN3, seed + 2, 1.6);
}
function shirt(c, ax, ay, w, len, color, seed) {
  const pts2 = [
    [ax - w * 0.22, ay],
    [ax - w * 0.5, ay + 4],
    [ax - w * 0.85, ay + len * 0.38],
    [ax - w * 0.6, ay + len * 0.46],
    [ax - w * 0.46, ay + len * 0.36],
    [ax - w * 0.46, ay + len],
    [ax + w * 0.46, ay + len],
    [ax + w * 0.46, ay + len * 0.36],
    [ax + w * 0.6, ay + len * 0.46],
    [ax + w * 0.85, ay + len * 0.38],
    [ax + w * 0.5, ay + 4],
    [ax + w * 0.22, ay]
  ];
  ink(c, pts2, true, color, seed);
  clipTo(c, pts2);
  hatch7(c, ax + w * 0.2, ay, w * 0.4, len, 1.1, 4);
  c.restore();
  ink(c, ell5(ax, ay, w * 0.22, 5, 10, 0, Math.PI), false, INK_LINE, seed + 1, 2);
  c.fillStyle = INK_LINE;
  for (let k = 0; k < 3; k++) {
    c.beginPath();
    c.arc(ax, ay + 14 + k * 14, 1.3, 0, TAU);
    c.fill();
  }
}
function sock(c, ax, ay, color, seed) {
  const pts2 = [[ax - 5, ay], [ax + 5, ay], [ax + 5, ay + 20], [ax + 13, ay + 26], [ax + 13, ay + 34], [ax - 6, ay + 34], [ax - 6, ay + 20]];
  ink(c, pts2, true, color, seed);
  ink(c, [[ax - 6, ay + 8], [ax + 5, ay + 8]], false, INK_LINE, seed + 1, 1.4);
}
function shoe(c, x, y, len, color, seed) {
  ink(c, [[x - len / 2, y], [x - len / 2, y - len * 0.32], [x - len * 0.2, y - len * 0.44], [x + len * 0.1, y - len * 0.3], [x + len / 2, y - len * 0.1], [x + len / 2, y]], true, color, seed);
  ink(c, [[x - len / 2, y - 3], [x + len / 2, y - 3]], false, "#e6dcc0", seed + 1, 2);
  ink(c, [[x - len * 0.2, y - len * 0.3], [x + len * 0.02, y - len * 0.18]], false, INK_LINE, seed + 2, 1.2);
}
function slipper(c, x, y, color, seed) {
  ink(c, ell5(x, y - 8, 17, 8, 18), true, color, seed);
  ink(c, ell5(x + 12, y - 15, 4, 4, 8), true, WHITE3, seed + 1, 1.2);
  hl(c, x - 10, y - 13, x - 4, y - 14);
}
function tavla(c) {
  floorShadow(c, 176, 0, 0.18);
  ink(c, rr2(-100, -12, 200, 12, 3), true, WOOD_D3, 11);
  ink(c, rr2(-102, -40, 204, 30, 4), true, WOOD5, 12);
  grain(c, -100, -38, 200, 26, 13, 3, WOOD_D3);
  for (const x0 of [-94, 4]) {
    ink(c, rr2(x0, -34, 90, 22, 1), true, "#e9dcb8", 14 + (x0 > 0 ? 1 : 0), 1.4);
    for (let i = 0; i < 6; i++) {
      const xa = x0 + i * 15, xb = xa + 15, xm = xa + 7.5;
      tri(c, [[xa, -34], [xb, -34], [xm, -23]], i % 2 ? TAN : DARKRED);
      tri(c, [[xa, -12], [xb, -12], [xm, -23]], i % 2 ? DARKRED : TAN);
    }
  }
  for (const [x, y, col] of [[-71.5, -17, "#2a2a30"], [-71.5, -22, "#2a2a30"], [71.5, -16, "#f6f1e2"], [71.5, -21, "#f6f1e2"]]) {
    ink(c, ell5(x, y, 3.6, 3.6, 10), true, col, 20 + x + y, 1.2);
  }
  die(c, -20, -27, 11, 4, 31);
  die(c, -7, -22, 11, 6, 32);
  hl(c, -102, -38, -60, -38);
}
function tavlaTable(c) {
  floorShadow(c, 150, 0, 0.2);
  ink(c, ell5(0, -6, 52, 9), true, IRON4, 31);
  ink(c, rr2(-7, -104, 14, 96, 4), true, IRON4, 32);
  hl(c, -4, -96, -4, -22, 0.6);
  ink(c, ell5(0, -100, 120, 26), true, WOOD_D3, 33);
  const top = ell5(0, -110, 120, 26);
  ink(c, top, true, WOOD_L3, 34);
  clipTo(c, top);
  for (const y of [-124, -112, -100]) {
    c.strokeStyle = WOOD_D3;
    c.lineWidth = 1.2;
    c.beginPath();
    for (let x = -120; x <= 120; x += 12) (x === -120 ? c.moveTo : c.lineTo).call(c, x, y + Math.sin(x * 0.05 + y) * 2);
    c.stroke();
  }
  c.restore();
  ink(c, [[-62, -124], [62, -124], [68, -100], [-68, -100]], true, WOOD_D3, 35);
  ink(c, [[-58, -121], [58, -121], [63, -103], [-63, -103]], true, CREAM7, 36, 1.4);
  for (let i = 0; i < 6; i++) {
    const xa = -58 + i * 19.3, xb = xa + 19.3, xm = xa + 9.6;
    tri(c, [[xa, -121], [xb, -121], [xm, -112]], i % 2 ? TAN : DARKRED);
    const ya = -63 + i * 21, yb = ya + 21;
    tri(c, [[ya, -103], [yb, -103], [ya + 10.5, -112]], i % 2 ? DARKRED : TAN);
  }
  ink(c, ell5(-38, -108, 4, 3.5, 10), true, "#2a2a30", 37, 1.2);
  ink(c, ell5(38, -108, 4, 3.5, 10), true, "#f6f1e2", 38, 1.2);
  teaGlass(c, -92, -110, 41);
  teaGlass(c, 92, -110, 51);
}
function doilyArmchair(c) {
  floorShadow(c, 220, 0, 0.2);
  for (const x of [-104, 90]) ink(c, rr2(x, -28, 14, 28, 3), true, WOOD_D3, 401 + x);
  ink(c, rr2(-96, -232, 192, 140, 56), true, MAROON, 402);
  ink(c, rr2(-118, -112, 236, 90, 26), true, MAROON, 403);
  ink(c, rr2(-122, -156, 44, 134, 20), true, MAROON_L, 404);
  ink(c, rr2(78, -156, 44, 134, 20), true, MAROON_L, 405);
  ink(c, rr2(-74, -122, 148, 46, 16), true, "#9a4848", 406);
  c.setLineDash([5, 4]);
  ink(c, rr2(-68, -116, 136, 38, 12), false, "#e8c9a0", 407, 1.2);
  ink(c, rr2(-116, -150, 32, 122, 14), false, "#e8c9a0", 408, 1.2);
  ink(c, rr2(84, -150, 32, 122, 14), false, "#e8c9a0", 409, 1.2);
  c.setLineDash([]);
  hatch7(c, 84, -110, 30, 84, 1.1, 4);
  hatch7(c, 66, -226, 26, 130, 1.1, 5);
  ink(c, doilyPts(0, -172, 54, 50, 12, 0.12), true, "#f7f3e6", 410, 2);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU;
    for (const rad of [22, 38]) {
      c.fillStyle = MAROON;
      c.beginPath();
      c.arc(Math.cos(a) * rad, -172 + Math.sin(a) * rad * 0.9, 2.4, 0, TAU);
      c.fill();
    }
  }
  ink(c, ell5(0, -172, 14, 13, 14), false, "#b9a57f", 411, 1.4);
  ink(c, doilyPts(-100, -152, 22, 12, 10, 0.1), true, "#f7f3e6", 412, 2);
  ink(c, doilyPts(100, -152, 22, 12, 10, 0.1), true, "#f7f3e6", 413, 2);
  c.fillStyle = "rgba(42,28,24,0.7)";
  for (const [x, y] of [[-50, -212], [50, -212], [-66, -110], [66, -110], [-30, -70], [30, -70]]) {
    c.beginPath();
    c.arc(x, y, 2.2, 0, TAU);
    c.fill();
  }
  hl(c, -84, -206, -86, -176);
  hl(c, -106, -96, -90, -100);
  hl(c, 96, -200, 98, -180, 0.5);
}
function plasticStool(c) {
  floorShadow(c, 84, 0, 0.2);
  ink(c, capsule(-30, -90, -36, -2, 4), true, "#9aa1ad", 501);
  ink(c, capsule(30, -90, 36, -2, 4), true, "#9aa1ad", 502);
  ink(c, capsule(-14, -90, -16, -2, 4.5), true, "#c3c9d3", 503);
  ink(c, capsule(14, -90, 16, -2, 4.5), true, "#c3c9d3", 504);
  ink(c, capsule(-33, -42, 33, -42, 3), true, "#9aa1ad", 505);
  ink(c, ell5(0, -94, 44, 12, 24), true, shade(ORANGE2, -0.3), 506);
  ink(c, ell5(0, -100, 44, 12, 24), true, ORANGE2, 507);
  stipple2(c, -36, -108, 72, 14, 46, 508);
  hatch7(c, 18, -104, 26, 10, 0.8, 3);
  hl(c, -30, -104, -18, -108);
  hl(c, -34, -98, -28, -95, 0.7);
}
function marbleTable(c) {
  floorShadow(c, 140, 0, 0.2);
  ink(c, ell5(0, -12, 62, 13, 24), true, IRON4, 601);
  ink(c, ell5(-58, -10, 15, 9, 14), true, IRON4, 602);
  ink(c, ell5(58, -10, 15, 9, 14), true, IRON4, 603);
  ink(c, rr2(-9, -164, 18, 140, 5), true, "#5b5f68", 604);
  ink(c, [[-4, -156], [-4, -30]], false, "#3a3e46", 605, 1.6);
  ink(c, [[4, -156], [4, -30]], false, "#3a3e46", 606, 1.6);
  ink(c, ell5(0, -160, 22, 6, 14), true, IRON4, 607);
  const edge = ell5(0, -158, 88, 24);
  ink(c, edge, true, "#8b8e95", 608);
  const top = ell5(0, -170, 88, 24);
  ink(c, top, true, "#eeebe4", 609);
  clipTo(c, top);
  c.strokeStyle = "#8f8b86";
  c.lineWidth = 1.3;
  const veins = [
    [-90, -184, -40, -170, 0, -190, 90, -178],
    [-60, -158, -20, -166, 30, -152, 70, -160],
    [-30, -196, 10, -184, 40, -200, 60, -192]
  ];
  for (const [a, b, cc, d, e, f, g, h] of veins) {
    c.beginPath();
    c.moveTo(a, b);
    c.bezierCurveTo(cc, d, e, f, g, h);
    c.stroke();
  }
  stipple2(c, -80, -190, 160, 40, 40, 610, "rgba(90,90,96,0.5)");
  c.restore();
  hl(c, -60, -188, -34, -194);
  hatch7(c, 40, -176, 46, 30, 1, 5);
}
function gasCylinder(c) {
  floorShadow(c, 56, 0, 0.22);
  ink(c, rr2(-30, -16, 60, 16, 6), true, "#3a3e46", 701);
  ink(c, rr2(-25, -108, 50, 96, 14), true, BLUE3, 702);
  clipTo(c, rr2(-25, -108, 50, 96, 14));
  hatch7(c, 12, -108, 20, 96, 1, 4);
  c.restore();
  ink(c, rr2(-14, -120, 28, 16, 4), true, "#a9adb5", 703);
  ink(c, rr2(-6, -134, 12, 16, 2), true, BRASS5, 704);
  ink(c, [[0, -140], [0, -130]], false, INK_LINE, 705, 2);
  ink(c, ell5(0, -140, 14, 6), true, RED4, 706);
  c.fillStyle = INK_LINE;
  c.beginPath();
  c.arc(0, -140, 1.6, 0, TAU);
  c.fill();
  ink(c, rr2(-25, -66, 50, 22, 2), true, CREAM7, 707);
  ink(c, zig(-19, 19, -58, 1.4, 4), false, INK_LINE, 708, 1.4);
  ink(c, zig(-19, 13, -52, 1.2, 4), false, INK_LINE, 709, 1.4);
  c.fillStyle = "#8a8e96";
  for (const x of [-22, -11, 0, 11, 22]) {
    c.beginPath();
    c.arc(x, -8, 2, 0, TAU);
    c.fill();
  }
  hl(c, -18, -100, -18, -72);
  hl(c, -20, -52, -20, -40, 0.7);
}
function coalStove(c) {
  floorShadow(c, 130, 0, 0.22);
  for (const x of [-54, 40, -7]) ink(c, rr2(x, -20, 14, 20, 3), true, IRON4, 801 + x);
  const body = [[-56, -22], [-60, -100], [-54, -160], [-40, -188], [0, -196], [40, -188], [54, -160], [60, -100], [56, -22]];
  ink(c, body, true, "#3f434c", 802);
  clipTo(c, body);
  hatch7(c, 30, -196, 40, 190, 1, 4);
  c.restore();
  ink(c, ell5(0, -60, 58, 9, 16, 0, Math.PI), false, INK_LINE, 803, 2);
  ink(c, ell5(0, -120, 58, 9, 16, 0, Math.PI), false, INK_LINE, 804, 2);
  ink(c, ell5(0, -196, 42, 9, 18), true, "#2a2d33", 805);
  const door2 = rr2(-30, -100, 60, 50, 6);
  ink(c, door2, true, "#1c1e22", 806);
  clipTo(c, door2);
  glow(c, 0, -74, 70, "#ff8a3c", 0.5);
  ink(c, [[-18, -54], [-9, -82], [-3, -64], [4, -88], [14, -54]], true, "#ff7a2a", 807, 1.2);
  ink(c, [[-8, -54], [-2, -70], [4, -54]], true, "#ffd36a", 808, 1);
  c.fillStyle = "#6b707a";
  for (const x of [-20, -10, 0, 10, 20]) c.fillRect(x - 1, -54, 2, 6);
  c.restore();
  ink(c, rr2(-40, -30, 80, 10, 3), true, "#5a5f68", 809);
  ink(c, rr2(12, -300, 16, 100, 2), true, "#5a5e67", 810);
  ink(c, rr2(8, -206, 24, 8, 2), true, IRON4, 811);
  ink(c, ell5(20, -300, 10, 4), true, "#3a3e46", 812);
  ink(c, [[-34, -216], [-48, -232], [-40, -234], [-30, -220]], true, COPPER3, 813);
  ink(c, ell5(-16, -212, 20, 14), true, COPPER3, 814);
  ink(c, ell5(-16, -226, 13, 9, 12, Math.PI, TAU), false, INK_LINE, 815, 2.4);
  ink(c, ell5(-16, -226, 10, 3), true, "#8a4a22", 816, 1.6);
  hl(c, -44, -160, -44, -120);
  hl(c, -30, -186, -14, -188);
  hl(c, -26, -214, -24, -202, 0.8);
}
function stringBag(c) {
  floorShadow(c, 56, 0, 0.2);
  ink(c, capsule(-16, -84, -22, -104, 3), true, "#f4f1e3", 901, 1.5);
  ink(c, capsule(-22, -104, -25, -110, 3), true, GREEN3, 902, 1.5);
  ink(c, capsule(-6, -84, -3, -106, 3), true, "#f4f1e3", 903, 1.5);
  ink(c, capsule(-3, -106, -1, -110, 3), true, GREEN3, 904, 1.5);
  ink(c, capsule(-32, -78, 22, -98, 6), true, "#c98a3d", 905, 1.8);
  ink(c, ell5(8, -54, 16, 15, 16), true, "#5ba85a", 906);
  ink(c, [[-4, -60], [18, -66]], false, "#2f6a33", 907, 1.2);
  ink(c, [[-2, -48], [20, -46]], false, "#2f6a33", 908, 1.2);
  const bag = [[-30, -80], [30, -80], [34, -40], [26, -6], [0, 0], [-26, -6], [-34, -40]];
  ink(c, bag, true, "rgba(232,218,170,0.5)", 909);
  clipTo(c, bag);
  hatch7(c, -40, -100, 80, 100, 0.8, 4);
  hatch7(c, -40, -100, 80, 100, -0.8, 4);
  c.restore();
  ink(c, ell5(-12, -80, 12, 14, 14, Math.PI, TAU), false, INK_LINE, 910, 2.4);
  ink(c, ell5(12, -80, 12, 14, 14, Math.PI, TAU), false, INK_LINE, 911, 2.4);
  ink(c, bag, false, INK_LINE, 912, 2.6);
  hl(c, -26, -62, -26, -40, 0.7);
}
function newspaper(c) {
  floorShadow(c, 100, 0, 0.16);
  const paper2 = [[-54, -76], [56, -80], [54, -2], [-52, 0]];
  ink(c, paper2, true, "#efe9d6", 1001);
  clipTo(c, paper2);
  hatch7(c, 36, -82, 22, 84, 1.1, 3);
  c.restore();
  ink(c, rr2(-46, -70, 92, 9, 1), true, "#2a2a2e", 1002, 1.5);
  for (let i = 0; i < 7; i++) hl(c, -42 + i * 13, -65, -37 + i * 13, -65, 0.8);
  ink(c, zig(-46, 22, -54, 1.6, 4), false, INK_LINE, 1003, 2);
  ink(c, zig(-46, 6, -46, 1.6, 4), false, INK_LINE, 1004, 2.4);
  ink(c, rr2(-46, -38, 40, 30, 1), true, "#c9c2ad", 1005, 1.8);
  stipple2(c, -46, -38, 40, 30, 40, 1006);
  ink(c, ell5(-34, -30, 6, 6, 10), true, "#e0b040", 1007, 1.4);
  for (let i = 0; i < 7; i++) ink(c, zig(2, 48, -36 + i * 5, 1.1, 3), false, INK_LINE, 1010 + i, 1.2);
  ink(c, zig(-46, -6, -4, 1, 4), false, INK_LINE, 1020, 1.2);
}
function worryBeads(c) {
  ink(c, ell5(0, -86, 5, 3, 10), false, "#8a6a3a", 1101, 2);
  ink(c, ell5(0, -56, 14, 30, 40), false, INK_LINE, 1102, 1.4);
  const cols = [GOLD2, "#b63a2a", CREAM7];
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * TAU;
    const bx = Math.cos(a) * 14, by = -56 + Math.sin(a) * 30;
    ink(c, ell5(bx, by, 4, 4, 10), true, cols[i % 3], 1110 + i, 1.8);
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.beginPath();
    c.arc(bx - 1.2, by - 1.2, 0.9, 0, TAU);
    c.fill();
  }
  ink(c, capsule(0, -24, 0, -14, 2.5), true, "#7a2a22", 1130, 1.2);
  for (let k = -2; k <= 2; k++) ink(c, [[0, -13], [k * 1.8, -4]], false, "#7a2a22", 1140 + k + 2, 1.2);
}
function pickleJars(c) {
  floorShadow(c, 140, 0, 0.2);
  const lids = [RED4, "#d8a72e", "#e8e4d8"];
  [-46, 0, 46].forEach((cx, j) => {
    const jar = rr2(cx - 20, -86, 40, 84, 12);
    ink(c, jar, true, "#d5e6a8", 1201 + j, 2.4);
    clipTo(c, jar);
    c.fillStyle = "rgba(160,200,90,0.55)";
    c.fillRect(cx - 20, -68, 40, 70);
    for (let k = 0; k < 3; k++) {
      const px = cx - 10 + k * 10;
      ink(c, capsule(px, -30 - k % 2 * 4, px + 3, -58 - k % 2 * 6, 4.5), true, k === 1 ? "#3f7a34" : "#4f8a3a", 1210 + j * 3 + k, 1.4);
    }
    ink(c, zig(cx - 22, cx + 22, -68, 1.2, 4), false, "#e7f0c4", 1220 + j, 2);
    c.restore();
    ink(c, jar, false, INK_LINE, 1230 + j, 2.6);
    ink(c, rr2(cx - 17, -50, 34, 20, 2), true, CREAM7, 1240 + j, 1.6);
    ink(c, zig(cx - 12, cx + 12, -40, 1, 4), false, INK_LINE, 1250 + j, 1);
    ink(c, rr2(cx - 22, -96, 44, 12, 3), true, lids[j], 1260 + j, 2);
    hatch7(c, cx - 22, -96, 44, 12, 1.5708, 3);
    hl(c, cx - 14, -80, cx - 14, -58);
  });
}
function teaStove(c) {
  floorShadow(c, 120, 0, 0.2);
  ink(c, ell5(0, -18, 52, 9), true, "#3a3e46", 1301);
  stipple2(c, -44, -22, 88, 6, 14, 1302, INK_LINE);
  glow(c, 0, -26, 70, "#ffb347", 0.35);
  [-30, -12, 6, 24].forEach((x, i) => {
    const h = [14, 18, 16, 12][i];
    ink(c, [[x - 6, -20], [x - 2, -20 - h * 0.5], [x, -20 - h], [x + 3, -20 - h * 0.45], [x + 6, -20]], true, "#ff9a3c", 1310 + i, 1.4);
  });
  const bottom = [[0, -36], [30, -36], [50, -50], [56, -80], [46, -106], [30, -116], [-30, -116], [-46, -106], [-56, -80], [-50, -50], [-30, -36]];
  ink(c, bottom, true, RED4, 1320);
  clipTo(c, bottom);
  hatch7(c, 26, -120, 36, 90, 1, 4);
  c.restore();
  ink(c, ell5(-56, -84, 8, 12, 12, Math.PI / 2, Math.PI * 3 / 2), false, INK_LINE, 1321, 3);
  hl(c, -36, -94, -36, -70);
  const topPot = [[-30, -116], [30, -116], [38, -130], [40, -146], [32, -158], [-32, -158], [-40, -146], [-38, -130]];
  ink(c, topPot, true, CHROME5, 1330);
  clipTo(c, topPot);
  hatch7(c, 22, -160, 22, 46, 1, 4);
  c.restore();
  ink(c, ell5(-40, -138, 8, 12, 12, Math.PI / 2, Math.PI * 3 / 2), false, INK_LINE, 1331, 3);
  ink(c, ell5(40, -138, 8, 12, 12, -Math.PI / 2, Math.PI / 2), false, INK_LINE, 1332, 3);
  ink(c, ell5(0, -158, 30, 7), true, "#b4b8c2", 1333);
  ink(c, ell5(0, -168, 6, 4), true, RED4, 1334, 1.6);
  hl(c, -24, -142, -24, -122);
}
function hangingBulb(c) {
  ink(c, [[0, -330], [1, -318], [-1, -308], [0, -312]], false, "#2a2a2e", 1401, 2.4);
  ink(c, rr2(-9, -312, 18, 14, 3), true, BRASS5, 1402);
  const bulb = [[-9, -300], [9, -300], [16, -290], [27, -268], [28, -240], [18, -214], [0, -204], [-18, -214], [-28, -240], [-27, -268], [-16, -290]];
  ink(c, bulb, true, "#f7f1d4", 1403);
  clipTo(c, bulb);
  hatch7(c, 12, -300, 22, 100, 1, 3);
  c.restore();
  ink(c, [[-3, -298], [-4, -262]], false, INK_LINE, 1404, 1.2);
  ink(c, [[3, -298], [4, -262]], false, INK_LINE, 1405, 1.2);
  ink(c, [[-6, -262], [-3, -252], [0, -262], [3, -252], [6, -262]], false, "#c9782c", 1406, 1.6);
  hl(c, -18, -272, -22, -246);
}
function laundryLine(c) {
  const yLine = (x) => -236 + 46 * (1 - (x / 290) ** 2);
  for (const x of [-290, 290]) {
    ink(c, rr2(x - 14, -18, 28, 18, 3), true, "#b8b4aa", 1501 + (x > 0 ? 1 : 0));
    ink(c, rr2(x - 7, -248, 14, 232, 3), true, "#8a6a4a", 1503 + (x > 0 ? 1 : 0));
    ink(c, rr2(x - 18, -252, 36, 8, 3), true, "#7a5a3a", 1505 + (x > 0 ? 1 : 0), 2);
  }
  const x0 = -40, x1 = 120;
  const sheetTop = [];
  for (let x = x0; x <= x1; x += 10) sheetTop.push([x, yLine(x) + 3]);
  const sheetBot = [];
  for (let x = x1; x >= x0; x -= 10) sheetBot.push([x, -92 + 4 * Math.sin(x * 0.09)]);
  const sheet = [...sheetTop, ...sheetBot];
  ink(c, sheet, true, "#f4f7fb", 1510, 2.4);
  clipTo(c, sheet);
  c.fillStyle = "#9fc9e8";
  for (let gx = x0; gx < x1; gx += 22) {
    for (let gy = -190; gy < -90; gy += 22) {
      c.beginPath();
      c.arc(gx + gy / 22 % 2 * 11, gy, 3, 0, TAU);
      c.fill();
    }
  }
  c.restore();
  const curve = [];
  for (let x = -290; x <= 290; x += 10) curve.push([x, yLine(x)]);
  ink(c, curve, false, INK_LINE, 1511, 2.2);
  shirt(c, -200, yLine(-200), 58, 84, RED4, 1520);
  shirt(c, -110, yLine(-110), 56, 76, BLUE3, 1530);
  shirt(c, 170, yLine(170), 56, 70, "#f2c230", 1540);
  sock(c, -250, yLine(-250), "#e8553a", 1550);
  sock(c, -238, yLine(-238), "#e8553a", 1551);
  sock(c, 230, yLine(230), GREEN3, 1552);
  sock(c, 244, yLine(244), GREEN3, 1553);
  for (const x of [-200, -110, 170, -250, -238, 230, 244, -40, 120]) {
    ink(c, rr2(x - 3, yLine(x) - 4, 6, 9, 2), true, RED4, 1560 + Math.round(x + 300), 1.2);
  }
}
function satelliteDishes(c) {
  floorShadow(c, 60, 0, 0.2);
  ink(c, rr2(-34, -28, 68, 28, 4), true, "#b8b4aa", 1601);
  stipple2(c, -34, -28, 68, 28, 30, 1602);
  ink(c, rr2(-4, -124, 8, 100, 2), true, "#7d8189", 1603);
  ink(c, [[-30, -30], [-4, -86]], false, INK_LINE, 1604, 2);
  ink(c, ell5(-20, -112, 50, 38, 26, 0, TAU, -0.5), true, "#e9ecf1", 1605);
  ink(c, ell5(-16, -108, 40, 28, 22, 0, TAU, -0.5), true, "#b9bfca", 1606, 2.2);
  clipTo(c, ell5(-16, -108, 40, 28, 22, 0, TAU, -0.5));
  hatch7(c, -40, -150, 40, 80, 0.9, 5);
  c.restore();
  ink(c, [[-20, -108], [-6, -132], [-2, -140]], false, INK_LINE, 1607, 2);
  ink(c, rr2(-5, -146, 10, 8, 2), true, IRON4, 1608, 1.6);
  ink(c, ell5(34, -130, 30, 24, 22, 0, TAU, 0.4), true, "#f4f1ea", 1609);
  ink(c, ell5(38, -126, 22, 16, 18, 0, TAU, 0.4), true, "#c7ccd6", 1610, 2);
  ink(c, [[34, -128], [24, -98]], false, INK_LINE, 1611, 2);
  hl(c, -40, -124, -36, -100, 0.8);
}
function shoeRack(c) {
  floorShadow(c, 150, 0, 0.18);
  ink(c, rr2(-78, -120, 8, 120, 2), true, WOOD5, 1701);
  ink(c, rr2(70, -120, 8, 120, 2), true, WOOD5, 1702);
  shoe(c, -56, -104, 38, "#3c2a20", 1710);
  slipper(c, -20, -104, "#e8553a", 1711);
  shoe(c, 16, -104, 36, "#2a4f7a", 1712);
  slipper(c, 50, -104, "#e77fb0", 1713);
  shoe(c, -54, -64, 40, "#7a4a2a", 1720);
  shoe(c, -6, -64, 36, "#2a2a30", 1721);
  shoe(c, 34, -64, 34, "#b8462f", 1722);
  slipper(c, -40, -24, "#f2c230", 1730);
  slipper(c, 18, -24, "#3f8f83", 1731);
  for (const y of [-104, -64, -24]) {
    ink(c, rr2(-80, y, 160, 8, 2), true, WOOD_L3, 1740 + y, 2.4);
  }
  hatch7(c, -80, -104, 160, 2, 0, 3);
  hl(c, -76, -116, -76, -6, 0.6);
}
function radiator(c) {
  floorShadow(c, 200, 0, 0.16);
  ink(c, rr2(-100, -98, 200, 90, 6), true, "#8f8674", 1801);
  for (let i = 0; i < 12; i++) {
    const x = -96 + i * 16;
    ink(c, rr2(x, -96, 14, 84, 6), true, "#ece4cf", 1810 + i, 2.4);
    hatch7(c, x + 10, -92, 4, 76, 1.2, 3);
    hl(c, x + 3, -90, x + 3, -22, 0.6);
  }
  ink(c, rr2(-102, -104, 204, 10, 4), true, "#d9d0b8", 1830, 2.4);
  ink(c, rr2(-102, -16, 204, 8, 3), true, "#bdb39a", 1831, 2.4);
  ink(c, rr2(-98, -8, 16, 8, 2), true, IRON4, 1832);
  ink(c, rr2(84, -8, 16, 8, 2), true, IRON4, 1833);
  ink(c, ell5(-40, -60, 7, 9), true, "#8a5a32", 1840, 1.4);
  ink(c, ell5(52, -40, 6, 7), true, "#8a5a32", 1841, 1.4);
  stipple2(c, -46, -70, 14, 20, 12, 1842, "rgba(90,50,20,0.7)");
  ink(c, rr2(-124, -40, 26, 9, 3), true, CHROME5, 1850, 2.4);
  ink(c, [[-100, -106], [-100, -110]], false, INK_LINE, 1851, 2);
  ink(c, ell5(-100, -112, 9, 4), true, RED4, 1852, 1.8);
}
function tvAntenna(c) {
  floorShadow(c, 170, 0, 0.2);
  ink(c, rr2(-80, -10, 16, 10, 2), true, WOOD_D3, 1901);
  ink(c, rr2(64, -10, 16, 10, 2), true, WOOD_D3, 1902);
  const body = rr2(-90, -120, 180, 112, 10);
  ink(c, body, true, WOOD5, 1903);
  clipTo(c, body);
  grain(c, -90, -120, 180, 112, 1904, 7, WOOD_D3);
  hatch7(c, 50, -120, 40, 112, 1, 5);
  c.restore();
  ink(c, rr2(-74, -106, 112, 90, 14), true, "#2e3a36", 1905);
  hl(c, -64, -96, -46, -78, 0.6);
  hl(c, -40, -98, -28, -90, 0.4);
  ink(c, ell5(64, -94, 9, 9, 14), true, CHROME5, 1906, 2);
  ink(c, [[64, -94], [64, -88]], false, INK_LINE, 1907, 1.6);
  ink(c, ell5(64, -68, 7, 7, 12), true, CHROME5, 1908, 2);
  ink(c, [[64, -68], [70, -68]], false, INK_LINE, 1909, 1.6);
  ink(c, rr2(48, -52, 32, 26, 4), true, "#7a4a22", 1910, 1.4);
  stipple2(c, 50, -50, 28, 22, 40, 1911, INK_LINE);
  ink(c, [[0, -138], [-30, -158]], false, INK_LINE, 1912, 2.6);
  ink(c, [[0, -138], [26, -160]], false, INK_LINE, 1913, 2.6);
  ink(c, ell5(-30, -158, 3, 3, 8), true, CHROME5, 1914, 1.6);
  ink(c, ell5(26, -160, 3, 3, 8), true, CHROME5, 1915, 1.6);
  ink(c, rr2(-7, -140, 14, 6, 2), true, IRON4, 1916, 1.6);
  const runner = [[-102, -134], [102, -134], [102, -124], ...scallopEdge(102, -102, -124, 12, 12), [-102, -124]];
  ink(c, runner, true, "#fbf8f0", 1917, 2);
  c.fillStyle = "#e0d6c0";
  for (let gx = -92; gx <= 92; gx += 12) {
    c.beginPath();
    c.arc(gx, -129, 2, 0, TAU);
    c.fill();
  }
}
function broomBucket(c) {
  floorShadow(c, 100, 0, 0.2);
  const bucket = [[-50, -112], [50, -112], [42, -10], [32, 0], [-32, 0], [-42, -10]];
  ink(c, bucket, true, BLUE3, 2001);
  clipTo(c, bucket);
  hatch7(c, 26, -110, 40, 110, 1, 4);
  c.restore();
  stipple2(c, -40, -90, 36, 60, 18, 2002, "rgba(20,40,70,0.6)");
  ink(c, ell5(0, -112, 48, 9, 22), true, "#2a4c7a", 2003);
  const head = [[-20, -114], [18, -114], [26, -100], [-26, -100]];
  ink(c, head, true, "#d6b06a", 2004);
  clipTo(c, head);
  hatch7(c, -26, -114, 52, 16, 1.4, 3);
  c.restore();
  ink(c, capsule(-2, -108, 30, -262, 4), true, WOOD_L3, 2005);
  ink(c, ell5(30, -262, 6, 6, 10), true, "#f0e6c8", 2006, 1.6);
  ink(c, ell5(0, -112, 50, 10, 26), false, INK_LINE, 2007, 2.6);
  ink(c, rr2(-30, -138, 60, 8, 3), true, CHROME5, 2008, 2.4);
  ink(c, rr2(-30, -132, 6, 22, 2), true, "#8f939c", 2009, 2);
  ink(c, rr2(24, -132, 6, 22, 2), true, "#8f939c", 2010, 2);
  hl(c, -36, -100, -32, -30, 0.8);
}
function crateOfOranges(c) {
  floorShadow(c, 130, 0, 0.2);
  for (const [x, y] of [[-38, -76], [-12, -78], [14, -76], [40, -78]]) orange(c, x, y, 12, 2101 + x + y);
  for (const [x, y] of [[-52, -60], [-26, -62], [0, -60], [26, -62], [52, -60]]) orange(c, x, y, 12, 2201 + x + y);
  ink(c, rr2(-66, -56, 132, 50, 3), true, "#b97d43", 2301);
  ink(c, [[-66, -46], [66, -46]], false, INK_LINE, 2302, 2);
  ink(c, [[-66, -30], [66, -30]], false, INK_LINE, 2303, 2);
  ink(c, [[-22, -56], [-22, -6]], false, INK_LINE, 2304, 1.6);
  ink(c, [[22, -56], [22, -6]], false, INK_LINE, 2305, 1.6);
  clipTo(c, rr2(-66, -56, 132, 50, 3));
  hatch7(c, 40, -56, 26, 50, 1, 4);
  c.restore();
  c.fillStyle = INK_LINE;
  for (const [x, y] of [[-60, -50], [60, -50], [-60, -12], [60, -12]]) {
    c.beginPath();
    c.arc(x, y, 1.6, 0, TAU);
    c.fill();
  }
}
function kebabSkewer(c) {
  floorShadow(c, 80, 0, 0.2);
  glow(c, 30, -120, 70, "#ff6a2a", 0.5);
  ink(c, rr2(24, -236, 12, 216, 5), true, "#e0552a", 2401);
  ink(c, rr2(-3, -290, 6, 276, 2), true, "#9a9ea8", 2402);
  ink(c, ell5(0, -8, 38, 9), true, IRON4, 2403);
  ink(c, rr2(-30, -22, 60, 14, 5), true, IRON4, 2404);
  const sides = [[-40, -22], [-38, -90], [-30, -150], [-18, -210], [-7, -256], [7, -256], [18, -210], [30, -150], [38, -90], [40, -22]];
  const cone = [...sides, ...ell5(0, -22, 40, 8, 10, 0, Math.PI)];
  ink(c, cone, true, "#a85a2a", 2405);
  clipTo(c, cone);
  hatch7(c, 18, -260, 30, 250, 1, 4);
  c.restore();
  for (const [i, y] of [-50, -80, -110, -140, -170, -200, -230].entries()) {
    const hw = 40 - (-y - 22) * 0.15;
    ink(c, ell5(0, y, hw, hw * 0.3, 14, 0, Math.PI), false, "#5a2e14", 2410 + i, 1.8);
  }
  stipple2(c, -22, -248, 44, 30, 30, 2420, "rgba(80,36,12,0.7)");
  hl(c, -26, -200, -22, -140);
  ink(c, ell5(0, -258, 7, 4), true, IRON4, 2421, 1.6);
}
function lotteryStand(c) {
  floorShadow(c, 130, 0, 0.2);
  ink(c, rr2(-3, -292, 6, 146, 2), true, IRON4, 2501);
  const arch2 = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    arch2.push([-74 + 148 * t, -236 - 54 * Math.sin(Math.PI * t)]);
  }
  const canopy2 = [...arch2, ...scallopEdge(74, -74, -236, 8, 8)];
  clipTo(c, canopy2);
  for (let i = 0; i < 8; i++) {
    c.fillStyle = i % 2 ? RED4 : "#f7f3e6";
    c.fillRect(-80 + i * 20, -300, 20, 80);
  }
  c.restore();
  ink(c, canopy2, false, INK_LINE, 2502, 2.4);
  ink(c, ell5(0, -292, 4, 4, 8), true, GOLD2, 2503, 1.4);
  hl(c, -46, -268, -30, -256, 0.8);
  ink(c, rr2(-58, -150, 116, 150, 6), true, "#f2c230", 2504);
  ink(c, rr2(-58, -150, 116, 18, 6), true, RED4, 2505, 2.4);
  ink(c, rr2(-44, -124, 88, 50, 5), true, "#2f3f5e", 2506);
  ink(c, rr2(-38, -118, 76, 38, 4), true, "#ffd77a", 2507, 1.6);
  c.fillStyle = "#2f3f5e";
  c.fillRect(-1, -118, 2, 38);
  ink(c, rr2(-50, -86, 100, 12, 3), true, WOOD_L3, 2508, 2.4);
  const tickets = [[-44, -68, "#f7a6b2"], [-24, -60, "#fff3c4"], [4, -66, "#a9e0c6"], [24, -58, "#f7a6b2"], [-16, -44, "#fff3c4"], [18, -40, "#a9e0c6"]];
  tickets.forEach(([x, y, col], i) => {
    ink(c, rr2(x, y, 12, 8, 1), true, col, 2510 + i, 1.4);
    stipple2(c, x + 2, y + 2, 8, 4, 4, 2520 + i, "rgba(42,28,24,0.5)");
  });
  hatch7(c, 40, -72, 18, 72, 1, 4);
  hl(c, -52, -140, -52, -112);
}
function shopAwningSign(c) {
  floorShadow(c, 300, 0, 0.2);
  ink(c, rr2(-148, -88, 12, 88, 2), true, WOOD_D3, 2601);
  ink(c, rr2(136, -88, 12, 88, 2), true, WOOD_D3, 2602);
  ink(c, rr2(-160, -150, 320, 64, 6), true, "#e8b040", 2603);
  ink(c, rr2(-150, -142, 300, 48, 4), false, RED4, 2604, 2.2);
  text(c, "BAKKAL", 0, -118, 40, "#b8312a", "center", 800);
  hatch7(c, 120, -150, 40, 64, 1, 5);
  const canopy2 = [[-178, -198], [178, -198], [190, -152], ...scallopEdge(190, -190, -152, 10, 12), [-190, -152]];
  clipTo(c, canopy2);
  for (let i = 0; i < 14; i++) {
    c.fillStyle = i % 2 ? RED4 : "#f7f3e6";
    c.fillRect(-190 + i * 28, -210, 28, 70);
  }
  c.restore();
  ink(c, canopy2, false, INK_LINE, 2605, 2.6);
  ink(c, rr2(-184, -206, 368, 10, 3), true, IRON4, 2606, 2.4);
  hl(c, -170, -190, 40, -190, 0.8);
}
function simitTrayHead(c) {
  ink(c, ell5(0, -16, 64, 14), true, "#7a4e26", 2701);
  ink(c, ell5(0, -22, 64, 14), true, WOOD_L3, 2702);
  clipTo(c, ell5(0, -22, 64, 14));
  grain(c, -64, -36, 128, 28, 2703, 4, WOOD_D3);
  c.restore();
  const simits = [
    [-30, -34],
    [0, -36],
    [30, -34],
    [-44, -22],
    [-16, -24],
    [14, -24],
    [42, -22],
    [-30, -12],
    [0, -10],
    [30, -12],
    [-22, -46],
    [6, -48],
    [28, -44]
  ];
  simits.sort((a, b) => a[1] - b[1]);
  simits.forEach(([x, y], i) => {
    ink(c, ell5(x, y, 13, 9, 18), true, "#c98a3a", 2710 + i, 1.8);
    stipple2(c, x - 10, y - 6, 20, 12, 14, 2740 + i, "rgba(243,230,192,0.95)");
    ink(c, ell5(x, y, 5, 3.5, 10), true, WOOD_D3, 2770 + i, 1.2);
    hl(c, x - 8, y - 4, x - 3, y - 6, 0.85);
  });
}
var P3 = (id, name, cat2, w, h, draw, extra = {}) => ({
  id,
  name,
  cat: cat2,
  w,
  h,
  draw,
  ...extra
});
var CARICATURE_PROPS = [
  P3("tavla", "Tavla board", "home", 200, 40, tavla),
  P3("tavla-table", "Tavla table", "furniture", 260, 170, tavlaTable),
  P3("doily-armchair", "Doily armchair", "furniture", 230, 230, doilyArmchair),
  P3("plastic-stool", "Plastic stool", "furniture", 90, 110, plasticStool),
  P3("marble-table", "Marble caf\xE9 table", "furniture", 180, 190, marbleTable),
  P3("gas-cylinder", "Gas cylinder", "home", 70, 120, gasCylinder),
  P3("coal-stove", "Coal stove", "home", 150, 300, coalStove, { idle: "flicker" }),
  P3("string-bag", "String bag", "home", 70, 110, stringBag),
  P3("newspaper", "Newspaper", "home", 110, 80, newspaper),
  P3("worry-beads", "Worry beads", "home", 40, 90, worryBeads),
  P3("pickle-jars", "Pickle jars", "food", 150, 120, pickleJars),
  P3("tea-stove", "\xC7aydanl\u0131k stove", "home", 150, 200, teaStove, { idle: "flicker" }),
  P3("hanging-bulb", "Hanging bulb", "home", 60, 330, hangingBulb),
  P3("laundry-line", "Laundry line", "street", 600, 260, laundryLine, { idle: "sway" }),
  P3("satellite-dishes", "Satellite dishes", "street", 200, 160, satelliteDishes),
  P3("shoe-rack", "Shoe rack", "furniture", 160, 120, shoeRack),
  P3("radiator", "Radiator", "home", 200, 110, radiator),
  P3("tv-antenna", "Old TV", "tech", 240, 160, tvAntenna),
  P3("broom-bucket", "Mop bucket", "home", 120, 280, broomBucket),
  P3("crate-of-oranges", "Crate of oranges", "market", 140, 90, crateOfOranges),
  P3("kebab-skewer", "Kebab skewer", "food", 90, 300, kebabSkewer, { idle: "flicker" }),
  P3("lottery-stand", "Lottery stand", "street", 150, 300, lotteryStand),
  P3("shop-awning-sign", "Shop sign with awning", "sign", 400, 200, shopAwningSign),
  P3("simit-tray-head", "Simit tray", "food", 140, 60, simitTrayHead)
];

// src/props/index.ts
var PROPS = [...HOME_PROPS, ...STREET_PROPS, ...NATURE_PROPS, ...VEHICLES_PROPS, ...ERAS_PROPS, ...MOON_PROPS, ...CARICATURE_PROPS];
var byId2 = null;
function propById(id) {
  if (!byId2) byId2 = new Map(PROPS.map((p) => [p.id, p]));
  return byId2.get(id);
}

// src/props/types.ts
var CAT_NAMES = {
  cosmic: "Moon & stars",
  furniture: "Furniture",
  home: "Home & kitchen",
  food: "Food & drink",
  nature: "Plants & rocks",
  animal: "Animals",
  street: "Street",
  vehicle: "Vehicles",
  tech: "Tech & gadgets",
  military: "Wartime",
  medieval: "Medieval",
  space: "Space",
  spooky: "Spooky",
  farm: "Farm",
  market: "Bazaar & market",
  prehistoric: "Stone age",
  sign: "Signs",
  fx: "Effects props"
};

// src/core/types.ts
var NARRATOR = "@narrator";

// src/face/core/math.js
var TAU2 = Math.PI * 2;
var clamp2 = (v, lo = 0, hi = 1) => v < lo ? lo : v > hi ? hi : v;
var bump = (t) => Math.sin(clamp2(t) * Math.PI);
var c1 = 1.70158;
var c3 = c1 + 1;
var ease = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inExpo: (t) => t === 0 ? 0 : 2 ** (10 * t - 10),
  outExpo: (t) => t === 1 ? 1 : 1 - 2 ** (-10 * t),
  inOutExpo: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  outBack: (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  inBack: (t) => c3 * t * t * t - c1 * t * t,
  outElastic: (t) => t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (TAU2 / 3)) + 1,
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  hold: (t) => t < 1 ? 0 : 1
};

// src/face/expressions.js
var EXPRESSIONS = {
  notr: { desc: "n\xF6tr", normal: {} },
  // ───────────── sevinç ─────────────
  mutlu: {
    desc: "mutlu \u2013 ne\u015Feli \u2013 \xE7ok ne\u015Feli \u2013 sevin\xE7ten u\xE7uyor",
    hafif: { lid: [0.08, 0.08], low: 0.15, brow: [-0.05, 2], mouth: { base: "smile", w: 0.5, corner: -6 }, blush: 0.1 },
    normal: { lid: [0.06, 0.06], low: 0.3, brow: [-0.1, 4], mouth: "smile", blush: 0.3 },
    cok: { low: 0.45, brow: [-0.12, 6], mouth: "bigsmile", blush: 0.45, sparkle: 0.4 },
    asiri: { eyes: "happy", brow: [-0.15, 9], mouth: { base: "laugh", open: 26 }, blush: 0.6, sparkle: 0.8, chin: -3 }
  },
  memnun: {
    desc: "halinden memnun, keyifli",
    hafif: { lid: [0.14, 0.14], mouth: { base: "smile", w: 0.46, corner: -5 } },
    normal: { lid: [0.3, 0.3], low: 0.25, brow: [-0.05, 2], mouth: { base: "smile", w: 0.52, corner: -8 }, blush: 0.15 },
    cok: { lid: [0.42, 0.42], low: 0.35, mouth: "smile", blush: 0.3, chin: -2 },
    asiri: { eyes: "closed", mouth: { base: "smile", corner: -13 }, blush: 0.4, chin: -5, tilt: 0.05 }
  },
  guluyor: {
    desc: "k\u0131k\u0131rdama \u2013 g\xFClme \u2013 kat\u0131la kat\u0131la \u2013 g\xF6z\xFCnden ya\u015F gelene kadar kahkaha",
    hafif: { eyes: "happy", brow: [-0.1, 4], mouth: { base: "grin", w: 0.52, open: 8 }, blush: 0.3 },
    normal: { eyes: "happy", brow: [-0.15, 7], mouth: "laugh", blush: 0.55 },
    cok: { brow: [-0.2, 9], mouth: { base: "laugh", open: 36, w: 0.7 }, blush: 0.7, tear: 0.35, chin: -5 },
    asiri: { arc: 0, squeeze: 1, mouth: { base: "laugh", open: 44, w: 0.74, low: 1 }, blush: 0.85, red: 0.2, tear: 0.75, chin: -8, shake: 0.4 }
  },
  sirit: {
    desc: "s\u0131r\u0131tma, di\u015Fleri g\xF6stererek",
    hafif: { lid: [0.15, 0.15], low: 0.15, mouth: { base: "grin", w: 0.5, open: 8, corner: -8 } },
    normal: { lid: [0.18, 0.18], low: 0.3, brow: [-0.05, 3], mouth: "grin" },
    cok: { low: 0.45, brow: [-0.05, 5], mouth: { base: "grin", w: 0.74, open: 18, corner: -16 }, blush: 0.2 },
    asiri: { eyes: "happy", mouth: { base: "grin", w: 0.84, open: 22, corner: -20 }, blush: 0.3, chin: -2 }
  },
  heyecanli: {
    desc: "heyecanl\u0131, sab\u0131rs\u0131z sevin\xE7",
    hafif: { open: 1.06, brow: [-0.05, 6], mouth: { base: "smile", w: 0.56 }, sparkle: 0.4 },
    normal: { open: 1.14, lid: [0, 0], brow: [-0.1, 10], mouth: "bigsmile", sparkle: 0.8, pupil: 1.12, blush: 0.25 },
    cok: { open: 1.2, brow: [-0.12, 14], mouth: { base: "laugh", open: 26 }, sparkle: 1, pupil: 1.2, blush: 0.4 },
    asiri: { open: 1.28, iris: "yildiz", brow: [-0.14, 18], mouth: { base: "laugh", open: 34, w: 0.72 }, sparkle: 1, blush: 0.5, shake: 0.3 }
  },
  gururlu: {
    desc: "gururlu, g\xF6\u011Fs\xFC kabarm\u0131\u015F",
    hafif: { lid: [0.15, 0.15], mouth: { base: "smile", w: 0.46, corner: -6 }, chin: -3 },
    normal: { lid: [0.3, 0.3], low: 0.2, brow: [0, 4], mouth: { base: "smile", w: 0.5, corner: -9 }, chin: -7, blush: 0.15 },
    cok: { lid: [0.45, 0.45], low: 0.25, brow: [0, 7], mouth: { base: "smile", corner: -12 }, chin: -11, sparkle: 0.3, nostril: 0.3 },
    asiri: { eyes: "closed", brow: [-0.05, 10], mouth: { base: "bigsmile", w: 0.6 }, chin: -15, nostril: 0.6, blush: 0.3 }
  },
  rahatlamis: {
    desc: "rahatlam\u0131\u015F \u2013 oh be!",
    hafif: { lid: [0.2, 0.2], brow: [-0.18, 3], mouth: { base: "smile", w: 0.44, corner: -5 } },
    normal: { lid: [0.5, 0.5], brow: [-0.28, 5], mouth: { base: "smile", w: 0.5, corner: -8 }, blush: 0.15 },
    cok: { eyes: "closed", brow: [-0.32, 6], mouth: { base: "smile", w: 0.54, corner: -10, open: 6 }, sweat: 0.4, chin: -3 },
    asiri: { brow: [-0.36, 8], mouth: { base: "o", w: 0.3, open: 16, corner: -4 }, sweat: 0.7, chin: -6, tilt: 0.06 }
  },
  minnettar: {
    desc: "minnettar \u2013 duygulanm\u0131\u015F, sevin\xE7 g\xF6zya\u015F\u0131",
    hafif: { lid: [0.15, 0.15], brow: [-0.2, 4], mouth: { base: "smile", w: 0.46, corner: -6 }, sparkle: 0.3 },
    normal: { lid: [0.2, 0.25], brow: [-0.32, 6], mouth: "smile", tear: 0.3, sparkle: 0.6, blush: 0.25 },
    cok: { low: 0.25, brow: [-0.42, 8], mouth: { base: "smile", wavy: 0.4 }, tear: 0.55, sparkle: 0.8, blush: 0.4 },
    asiri: { eyes: "happy", brow: [-0.5, 10], mouth: { base: "cry", corner: -6 }, tear: 0.9, blush: 0.6 }
  },
  umutlu: {
    desc: "umutlu, g\xF6zleri yukar\u0131da",
    hafif: { brow: [-0.15, 4], look: [0, -0.2], mouth: { base: "smile", w: 0.42, corner: -4 } },
    normal: { brow: [-0.25, 8], look: [0, -0.4], open: 1.06, mouth: { base: "smile", w: 0.46, corner: -6 }, sparkle: 0.5, pupil: 1.1 },
    cok: { brow: [-0.32, 11], look: [0, -0.5], open: 1.1, mouth: { base: "small-o", corner: -6, open: 8 }, sparkle: 0.9, pupil: 1.2, chin: -4 },
    asiri: { brow: [-0.36, 14], look: [0, -0.6], open: 1.16, mouth: { base: "bigsmile", w: 0.5 }, sparkle: 1, pupil: 1.3, chin: -6, tear: 0.3 }
  },
  sakin: {
    desc: "sakin \u2013 huzurlu",
    hafif: { lid: [0.2, 0.2], mouth: { base: "smile", w: 0.42, corner: -3 } },
    normal: { lid: [0.4, 0.4], brow: [-0.05, 1], mouth: { base: "smile", w: 0.44, corner: -5 } },
    cok: { lid: [0.6, 0.6], mouth: { base: "smile", w: 0.46, corner: -6 }, chin: -2 },
    asiri: { eyes: "closed", mouth: { base: "smile", w: 0.48, corner: -8 }, chin: -4, blush: 0.15 }
  },
  asik: {
    desc: "ho\u015Flanma \u2013 a\u015F\u0131k \u2013 kalp g\xF6zler",
    hafif: { lid: [0.2, 0.2], low: 0.2, brow: [-0.2, 4], mouth: { base: "smile", w: 0.5, corner: -7 }, blush: 0.5, sparkle: 0.5 },
    normal: { eyes: "happy", brow: [-0.28, 7], mouth: "smile", blush: 0.95 },
    cok: { arc: 0, lid: [0, 0], low: 0, open: 1.1, iris: "kalp", brow: [-0.3, 9], mouth: "bigsmile", blush: 1, tilt: 0.06 },
    asiri: { open: 1.2, brow: [-0.35, 12], mouth: { base: "bigsmile", open: 20 }, blush: 1, red: 0.3, sparkle: 1, tilt: 0.1 }
  },
  hayran: {
    desc: "hayran, b\xFCy\xFClenmi\u015F",
    hafif: { open: 1.04, brow: [-0.12, 5], mouth: { base: "smile", w: 0.42, open: 4 }, sparkle: 0.5 },
    normal: { open: 1.1, brow: [-0.2, 9], mouth: { base: "small-o", corner: -4 }, sparkle: 1, pupil: 1.15, blush: 0.3 },
    cok: { open: 1.16, brow: [-0.24, 12], mouth: { base: "bigsmile", open: 18 }, pupil: 1.25, blush: 0.5, chin: -3 },
    asiri: { open: 1.24, iris: "yildiz", brow: [-0.28, 15], mouth: { base: "o", corner: -6 }, blush: 0.7, chin: -5, tear: 0.35 }
  },
  hirsli: {
    desc: "a\xE7g\xF6zl\xFC, g\xF6zleri parl\u0131yor",
    hafif: { open: 1.04, sparkle: 0.5, mouth: { base: "smile", w: 0.5 } },
    normal: { open: 1.1, pupil: 1.1, sparkle: 0.8, brow: [0.1, 4], mouth: { base: "grin", w: 0.6 } },
    cok: { open: 1.16, iris: "para", brow: [0.15, 6], mouth: { base: "grin", w: 0.7, corner: -16, open: 16 } },
    asiri: { open: 1.22, brow: [0.2, 9], mouth: { base: "laugh", w: 0.72, tongue: 1 }, sparkle: 1, sweat: 0.3 }
  },
  // ───────────── öfke ─────────────
  kizgin: {
    desc: "sinirli \u2013 k\u0131zg\u0131n \u2013 \xE7ok k\u0131zg\u0131n (di\u015F s\u0131kar) \u2013 k\xF6p\xFCrm\xFC\u015F (buhar, damar)",
    hafif: { lid: [0.25, 0.08], brow: [0.22, -2], knit: 0.25, mouth: { base: "flat", corner: 3, press: 1 } },
    normal: { lid: [0.42, 0.08], brow: [0.42, -5], knit: 0.5, mouth: "frown", pupil: 0.85, nostril: 0.3 },
    cok: { lid: [0.45, 0.05], brow: [0.55, -8], knit: 0.8, mouth: "grit", pupil: 0.75, nostril: 0.7, red: 0.35, vein: 0.6 },
    asiri: { open: 1.15, lid: [0.38, 0], brow: [0.65, -10], knit: 1, mouth: "roar", pupil: 0.55, nostril: 1, red: 0.85, vein: 1, steam: 1, shake: 0.6 }
  },
  ofkeli: {
    desc: "\xF6fkeyle ba\u011F\u0131ran",
    hafif: { lid: [0.35, 0.05], brow: [0.45, -5], knit: 0.5, mouth: { base: "shout", open: 18 }, pupil: 0.8, nostril: 0.4 },
    normal: { eyes: "wide", lid: [0.38, 0], brow: [0.55, -7], knit: 0.7, mouth: "shout", pupil: 0.68, red: 0.4, nostril: 0.6 },
    cok: { open: 1.2, brow: [0.62, -9], mouth: "roar", pupil: 0.55, red: 0.65, vein: 0.8, shake: 0.4 },
    asiri: { open: 1.28, brow: [0.7, -11], knit: 1, mouth: { base: "roar", open: 54 }, pupil: 0.42, red: 1, vein: 1, steam: 1, shake: 0.9 }
  },
  kararli: {
    desc: "kararl\u0131, azimli",
    hafif: { lid: [0.18, 0.1], brow: [0.15, -1], mouth: { base: "flat", press: 0.6 } },
    normal: { lid: [0.3, 0.12], brow: [0.25, -3], knit: 0.3, mouth: { base: "flat", press: 1 } },
    cok: { lid: [0.34, 0.14], brow: [0.35, -4], knit: 0.5, mouth: { base: "grit", w: 0.44, open: 10, corner: 2 }, nostril: 0.4, chin: 3 },
    asiri: { lid: [0.3, 0.05], open: 1.06, brow: [0.45, -6], knit: 0.7, mouth: "grit", nostril: 0.8, sparkle: 0.6, red: 0.15, chin: 4 }
  },
  ciddi: {
    desc: "ciddi \u2013 sert \u2013 buz gibi",
    hafif: { lid: [0.15, 0.12], brow: [0.08, -1], mouth: { base: "flat", w: 0.4 } },
    normal: { lid: [0.25, 0.2], brow: [0.15, -3], knit: 0.2, mouth: { base: "flat", press: 1, corner: 2 } },
    cok: { lid: [0.32, 0.25], brow: [0.22, -5], knit: 0.4, mouth: { base: "frown", w: 0.4, corner: 5, press: 1 }, chin: 3 },
    asiri: { lid: [0.4, 0.3], brow: [0.3, -7], knit: 0.6, pupil: 0.75, mouth: { base: "frown", w: 0.38, corner: 6, press: 1 }, chin: 5 }
  },
  bikkin: {
    desc: "b\u0131kk\u0131n, g\xF6z deviren",
    hafif: { lid: [0.35, 0.35], brow: [0.05, -1], mouth: { base: "flat", w: 0.4, skew: 0.2 } },
    normal: { lid: [0.55, 0.55], brow: [-0.05, 0], look: [0, -0.5], mouth: "side" },
    cok: { lid: [0.5, 0.5], look: [0.2, -0.9], brow: [0.15, -3], knit: 0.3, mouth: { base: "flat", w: 0.46, corner: 6, skew: 0.3 }, tilt: 0.08 },
    asiri: { lid: [0.4, 0.4], look: [0, -1], pupil: 0.7, brow: [0.2, -4], knit: 0.5, mouth: { base: "grit", w: 0.52, open: 10 }, gloom: 0.5, vein: 0.5, tilt: 0.12 }
  },
  kiskanc: {
    desc: "k\u0131skan\xE7 (k\u0131skan\xE7l\u0131ktan ye\u015Fillenir)",
    hafif: { lid: [0.3, 0.25], look: [0.6, 0], mouth: { base: "pout", w: 0.28, pout: 0.5 } },
    normal: { lid: [0.45, 0.4], low: 0.25, look: [0.8, 0], brow: [0.25, -2], knit: 0.4, mouth: "pout", cheek: 0.3 },
    cok: { lid: [0.5, 0.45], low: 0.35, look: [0.9, 0], brow: [0.35, -3], knit: 0.6, mouth: { base: "grit", w: 0.42, open: 8 }, cheek: 0, sick: 0.3 },
    asiri: { lid: [0.55, 0.5], look: [1, 0], brow: [0.45, -5], knit: 0.8, mouth: { base: "grit", w: 0.5, open: 12, wavy: 0.4 }, sick: 0.7, vein: 0.4, shake: 0.3 }
  },
  kuskun: {
    desc: "k\xFCsk\xFCn, somurtkan (yanaklar \u015Fi\u015Fer)",
    hafif: { lid: [0.2, 0.2], brow: [0.1, 0], look: [0.5, 0], mouth: { base: "pout", pout: 0.6 } },
    normal: { lid: [0.35, 0.35], brow: [0.2, -2], look: [0.7, 0], mouth: "pout", cheek: 0.6, chin: -3, blush: 0.2 },
    cok: { eyes: "closed", brow: [0.25, -1], mouth: { base: "pout", w: 0.3 }, cheek: 1, chin: -6, tilt: -0.08, red: 0.2, blush: 0.3 },
    asiri: { brow: [0.35, -3], knit: 0.5, mouth: { base: "pout", w: 0.34, pout: 1.4 }, cheek: 1.4, chin: -9, tilt: -0.12, red: 0.4, blush: 0.4, steam: 0.4 }
  },
  igrenmis: {
    desc: "i\u011Frenmi\u015F \u2013 midesi bulanm\u0131\u015F",
    hafif: { lid: [0.22, 0.18], low: 0.2, brow: [0.15, -1], sneer: 0.3, mouth: { base: "flat", corner: 4, smirk: 3 } },
    normal: { lid: [0.36, 0.3], low: 0.35, brow: [0.32, -3], knit: 0.3, sneer: 0.6, mouth: "sneer" },
    cok: { lid: [0.42, 0.36], low: 0.5, knit: 0.5, sneer: 0.9, mouth: { base: "sneer", smirk: 14, open: 10 }, tilt: -0.06, chin: 4 },
    asiri: { lid: [0.5, 0.45], low: 0.6, knit: 0.7, sneer: 1, mouth: { base: "tongue", corner: 10, wavy: 0.4 }, sick: 0.8, sweat: 0.3 }
  },
  // ───────────── şaşkınlık / korku ─────────────
  saskin: {
    desc: "\u015Fa\u015F\u0131rm\u0131\u015F \u2013 \xE7ok \u015Fa\u015Fk\u0131n \u2013 \u015Fok",
    hafif: { open: 1.06, lid: [0.04, 0.04], brow: [-0.06, 8], mouth: "small-o" },
    normal: { open: 1.14, lid: [0, 0], brow: [-0.12, 15], mouth: "o", pupil: 0.62, forehead: 0.3 },
    cok: { open: 1.24, brow: [-0.14, 20], mouth: "gasp", pupil: 0.5, forehead: 0.6 },
    asiri: { open: 1.34, brow: [-0.16, 26], mouth: { base: "gasp", open: 46, drop: 1 }, pupil: 0.36, forehead: 0.9, pale: 0.3, shake: 0.2 }
  },
  afallamis: {
    desc: "afallam\u0131\u015F, a\u011Fz\u0131 a\xE7\u0131k kalm\u0131\u015F",
    hafif: { open: 1.04, brow: [0, 5], mouth: { base: "flat", open: 6, w: 0.34 } },
    normal: { open: 1.1, lid: [0.05, 0.05], pupil: 0.5, brow: [0, 8], mouth: { base: "o", w: 0.3, open: 20, round: 0.5, drop: 0.5 } },
    cok: { open: 1.16, pupil: 0.38, brow: [0.02, 12], mouth: { base: "gasp", w: 0.36, open: 40, round: 0.4, drop: 1 }, chin: 4 },
    asiri: { open: 1.22, pupil: 0.26, brow: [0, 14], mouth: { base: "gasp", open: 56, drop: 1.5, round: 0.4 }, pale: 0.5, gloom: 0.7, chin: 6 }
  },
  merakli: {
    desc: "merakl\u0131, tek ka\u015F kalk\u0131k",
    hafif: { asym: 0.25, brow: [-0.05, 4], pupil: 1.05, mouth: { base: "flat", w: 0.32 } },
    normal: { asym: 0.45, brow: [-0.08, 7], open: 1.06, mouth: "small-o", pupil: 1.1, tilt: 0.06 },
    cok: { asym: 0.55, brow: [-0.1, 10], open: 1.12, mouth: { base: "small-o", open: 14 }, pupil: 1.15, tilt: 0.1, sparkle: 0.4 },
    asiri: { asym: 0.4, brow: [-0.12, 14], open: 1.2, mouth: "o", pupil: 1.2, tilt: 0.12, sparkle: 0.8, chin: -3 }
  },
  korkmus: {
    desc: "tedirgin \u2013 korkmu\u015F \u2013 \xE7ok korkmu\u015F \u2013 deh\u015Fet",
    hafif: { open: 1.04, lid: [0.04, 0.1], brow: [-0.3, 6], mouth: { base: "wavy", w: 0.36 } },
    normal: { open: 1.14, lid: [0, 0], brow: [-0.45, 12], mouth: "wavy", pupil: 0.55, forehead: 0.4, sweat: 0.4 },
    cok: { open: 1.22, brow: [-0.52, 16], mouth: { base: "grimace", corner: 8, wavy: 0.6 }, pupil: 0.45, forehead: 0.6, sweat: 0.7, pale: 0.4, shake: 0.4 },
    asiri: { open: 1.32, brow: [-0.6, 22], mouth: "scream", pupil: 0.32, forehead: 0.9, sweat: 1, pale: 0.8, gloom: 0.6, shake: 0.8 }
  },
  endiseli: {
    desc: "endi\u015Feli \u2013 kayg\u0131l\u0131 (dudak \u0131s\u0131r\u0131r) \u2013 panik",
    hafif: { brow: [-0.22, 4], forehead: 0.2, mouth: { base: "flat", corner: 3, w: 0.38 } },
    normal: { lid: [0.05, 0.12], brow: [-0.38, 7], forehead: 0.5, look: [0.3, 0], mouth: { base: "wavy", w: 0.4 } },
    cok: { open: 1.06, brow: [-0.48, 9], forehead: 0.7, pupil: 0.8, sweat: 0.5, mouth: "bite" },
    asiri: { open: 1.24, brow: [-0.55, 14], forehead: 0.9, pupil: 0.45, sweat: 1, pale: 0.4, shake: 0.6, mouth: { base: "grimace", wavy: 0.8 } }
  },
  mahcup: {
    desc: "mahcup, utan\u0131p terleyen (gergin s\u0131r\u0131tma)",
    hafif: { brow: [-0.2, 5], look: [0.4, 0], mouth: { base: "nervous", w: 0.46, open: 6 }, blush: 0.3 },
    normal: { brow: [-0.3, 7], look: [0.5, 0], mouth: "nervous", blush: 0.5, sweat: 0.5 },
    cok: { open: 1.06, brow: [-0.38, 10], look: [0.6, -0.2], mouth: { base: "nervous", w: 0.62, open: 12 }, blush: 0.7, red: 0.3, sweat: 0.8 },
    asiri: { open: 1.1, pupil: 0.6, brow: [-0.42, 12], mouth: { base: "nervous", w: 0.7, open: 14, wavy: 0.9 }, blush: 1, red: 0.6, sweat: 1, gloom: 0.3, shake: 0.25 }
  },
  utangac: {
    desc: "utanga\xE7, k\u0131zaran",
    hafif: { lid: [0.25, 0.25], look: [0.5, 0.4], brow: [-0.12, 2], mouth: { base: "smile", w: 0.36, corner: -4 }, blush: 0.4 },
    normal: { lid: [0.35, 0.35], look: [0.6, 0.6], brow: [-0.2, 4], mouth: { base: "smile", w: 0.34, corner: -6 }, blush: 0.75, chin: 4, tilt: 0.06 },
    cok: { eyes: "happy", mouth: { base: "grin", w: 0.4, open: 6, corner: -6, wavy: 0.3 }, blush: 1, red: 0.25, chin: 6, tilt: 0.1 },
    asiri: { arc: 0, squeeze: 1, mouth: { base: "wavy", w: 0.4 }, blush: 1, red: 0.6, chin: 8, tilt: 0.12, sweat: 0.3, shake: 0.15 }
  },
  suclu: {
    desc: "su\xE7lu, g\xF6z\xFCn\xFC ka\xE7\u0131ran",
    hafif: { look: [0.6, 0.3], brow: [-0.2, 3], mouth: { base: "flat", corner: 3, w: 0.36 } },
    normal: { lid: [0.2, 0.3], look: [0.7, 0.4], brow: [-0.32, 5], mouth: { base: "nervous", w: 0.44, open: 6, corner: 2 }, sweat: 0.35, chin: 3 },
    cok: { lid: [0.3, 0.4], look: [0.8, 0.5], brow: [-0.4, 6], mouth: "wavy", sweat: 0.7, chin: 6, blush: 0.2 },
    asiri: { lid: [0.2, 0.3], look: [0.9, 0.6], brow: [-0.5, 8], mouth: "sob", sweat: 1, chin: 9, gloom: 0.5, pale: 0.3 }
  },
  // ───────────── üzüntü ─────────────
  uzgun: {
    desc: "buruk \u2013 \xFCzg\xFCn \u2013 g\xF6zleri dolu \u2013 h\xFCng\xFCr h\xFCng\xFCr",
    hafif: { lid: [0.1, 0.3], brow: [-0.25, 3], mouth: { base: "frown", corner: 5, w: 0.4 } },
    normal: { lid: [0.12, 0.45], brow: [-0.45, 6], mouth: "frown", tear: 0.25 },
    cok: { lid: [0.15, 0.5], low: 0.2, brow: [-0.55, 8], forehead: 0.4, mouth: "sob", tear: 0.6, blush: 0.2 },
    asiri: { lid: [0.3, 0.6], brow: [-0.65, 10], mouth: "cry", tear: 1, red: 0.25, gloom: 0.4, shake: 0.3 }
  },
  "hayal-kirikligi": {
    desc: "hayal k\u0131r\u0131kl\u0131\u011F\u0131",
    hafif: { lid: [0.2, 0.25], brow: [-0.12, 1], mouth: { base: "flat", corner: 3 } },
    normal: { lid: [0.4, 0.45], brow: [-0.2, 0], look: [0, 0.4], mouth: { base: "frown", w: 0.44, corner: 6 }, chin: 3 },
    cok: { lid: [0.5, 0.55], brow: [-0.28, 0], look: [0.2, 0.6], mouth: { base: "side", corner: 8 }, chin: 6, gloom: 0.3 },
    asiri: { lid: [0.55, 0.6], brow: [-0.35, 2], look: [0, 0.8], mouth: "sob", chin: 9, gloom: 0.8, pale: 0.25 }
  },
  aci: {
    desc: "ac\u0131 \xE7eken \u2013 feryat",
    hafif: { lid: [0.3, 0.3], brow: [-0.2, 2], knit: 0.4, mouth: { base: "grit", w: 0.44, open: 8 } },
    normal: { lid: [0.6, 0.6], low: 0.4, brow: [-0.3, 2], knit: 0.6, forehead: 0.4, mouth: "grimace" },
    cok: { squeeze: 1, brow: [-0.35, 0], knit: 0.8, forehead: 0.6, mouth: { base: "grimace", open: 22, w: 0.66 }, sweat: 0.5, red: 0.3 },
    asiri: { brow: [-0.45, 4], knit: 1, mouth: { base: "roar", corner: 14, wavy: 0.4 }, tear: 0.8, sweat: 0.8, red: 0.6, shake: 0.6 }
  },
  // ───────────── kurnazlık / kibir ─────────────
  kurnaz: {
    desc: "kurnaz \u2013 sinsi \u2013 \u015Feytani s\u0131r\u0131t\u0131\u015F",
    hafif: { lid: [0.35, 0.28], brow: [0.15, 0], look: [0.4, 0], mouth: { base: "smirk", smirk: 6 } },
    normal: { lid: [0.52, 0.4], brow: [0.28, -1], asym: 0.3, look: [0.7, 0], mouth: "smirk" },
    cok: { lid: [0.55, 0.45], brow: [0.38, -2], asym: 0.5, look: [0.8, 0], mouth: { base: "grin", w: 0.6, corner: -12, smirk: 8 } },
    asiri: { lid: [0.55, 0.35], brow: [0.6, -6], asym: 0, knit: 0.6, arch: 0.6, pupil: 0.6, look: [0.6, 0], mouth: { base: "grin", w: 0.74, corner: -18, open: 16 }, chin: 4 }
  },
  kibirli: {
    desc: "kibirli, burnu havada",
    hafif: { lid: [0.3, 0.3], brow: [0.05, 3], chin: -3, mouth: { base: "smirk", smirk: 5 } },
    normal: { lid: [0.48, 0.48], brow: [0.12, 6], asym: 0.3, chin: -6, mouth: "smirk" },
    cok: { lid: [0.56, 0.56], brow: [0.12, 9], asym: 0.5, chin: -10, look: [0, 0.3], mouth: { base: "smirk", smirk: 14, corner: 0 } },
    asiri: { lid: [0.62, 0.62], brow: [0.15, 12], asym: 0.6, chin: -14, tilt: -0.06, look: [0, 0.4], nostril: 0.4, mouth: { base: "smirk", w: 0.4, smirk: 16, corner: 2 } }
  },
  alayci: {
    desc: "alayc\u0131 \u2013 alay ederek g\xFClen",
    hafif: { lid: [0.25, 0.25], asym: 0.2, mouth: { base: "smirk", smirk: 7 } },
    normal: { lid: [0.4, 0.35], asym: 0.5, brow: [0.05, 3], look: [0.3, 0], mouth: { base: "smirk", smirk: 12, w: 0.52 } },
    cok: { lid: [0.45, 0.4], asym: 0.7, chin: -4, mouth: { base: "grin", w: 0.6, smirk: 12, corner: -8, open: 10 } },
    asiri: { eyes: "happy", asym: 0.4, chin: -8, blush: 0.3, mouth: { base: "laugh", w: 0.7, smirk: 10 } }
  },
  supheli: {
    desc: "\u015F\xFCpheli, k\u0131s\u0131k g\xF6zle yan bakan",
    hafif: { lid: [0.3, 0.25], low: 0.2, asym: 0.3, look: [0.4, 0], mouth: { base: "flat", w: 0.38, skew: 0.2 } },
    normal: { lid: [0.5, 0.45], low: 0.35, brow: [0.15, 0], asym: 0.6, look: [0.7, 0], mouth: "side" },
    cok: { lid: [0.6, 0.55], low: 0.45, brow: [0.25, -2], asym: 0.8, knit: 0.3, look: [0.9, 0], tilt: -0.06, mouth: { base: "pout", w: 0.24 } },
    asiri: { lid: [0.68, 0.62], low: 0.5, brow: [0.35, -3], asym: 1, knit: 0.5, look: [1, 0], pupil: 0.7, chin: 4, tilt: -0.1, mouth: { base: "pout", w: 0.2, skew: 0.6 } }
  },
  dusunceli: {
    desc: "d\xFC\u015F\xFCnceli \u2013 kafa patlatan (beyni t\xFCt\xFCyor)",
    hafif: { look: [0.4, -0.4], mouth: { base: "flat", w: 0.36, skew: 0.2 } },
    normal: { look: [0.6, -0.7], lid: [0.2, 0.15], brow: [0.1, 2], asym: 0.3, knit: 0.2, mouth: "side" },
    cok: { look: [0.7, -0.8], lid: [0.3, 0.2], asym: 0.4, knit: 0.4, forehead: 0.3, tilt: 0.06, mouth: { base: "pout", w: 0.24, skew: 0.5 } },
    asiri: { look: [0.5, -1], lid: [0.4, 0.3], brow: [0.3, -2], knit: 0.8, forehead: 0.6, sweat: 0.4, steam: 0.3, tilt: 0.08, mouth: { base: "bite", w: 0.4, skew: 0.4 } }
  },
  // ───────────── yorgunluk / sersemlik ─────────────
  uykulu: {
    desc: "uykulu \u2013 esneyen \u2013 uyuyor (zzz)",
    hafif: { lid: [0.4, 0.4], brow: [0, -0.5] },
    normal: { lid: [0.66, 0.66], brow: [0, -1], bags: 0.4 },
    cok: { lid: [0.8, 0.8], bags: 0.6, brow: [-0.1, 2], tilt: 0.08, mouth: { base: "flat", open: 4, w: 0.34 } },
    asiri: { eyes: "closed", bags: 0.6, tilt: 0.14, chin: 6, zzz: 1, mouth: { base: "o", open: 10, w: 0.2 } }
  },
  sikilmis: {
    desc: "s\u0131k\u0131lm\u0131\u015F \u2013 esneyen",
    hafif: { lid: [0.3, 0.3], look: [0.4, 0], mouth: { base: "flat", w: 0.36 } },
    normal: { lid: [0.5, 0.5], look: [0.6, -0.2], brow: [0, -1], tilt: 0.06, mouth: "side" },
    cok: { lid: [0.62, 0.62], look: [0.6, -0.5], tilt: 0.12, bags: 0.2, mouth: { base: "flat", w: 0.34, corner: 4, skew: 0.5 } },
    asiri: { lid: [0.72, 0.72], look: [0, -0.8], tilt: 0.14, bags: 0.4, tear: 0.3, mouth: "yawn" }
  },
  yorgun: {
    desc: "yorgun \u2013 bitap",
    hafif: { lid: [0.28, 0.3], bags: 0.3, brow: [-0.05, 0] },
    normal: { lid: [0.45, 0.5], bags: 0.6, brow: [-0.15, 1], chin: 3, mouth: { base: "frown", corner: 4, w: 0.38 } },
    cok: { lid: [0.58, 0.62], bags: 0.85, brow: [-0.2, 1], chin: 6, tilt: 0.08, pale: 0.2, mouth: { base: "flat", open: 6, w: 0.34 } },
    asiri: { lid: [0.7, 0.72], bags: 1, look: [0, 0.4], chin: 9, tilt: 0.14, pale: 0.35, gloom: 0.4, mouth: { base: "o", open: 12, w: 0.22, corner: 6 } }
  },
  zorlaniyor: {
    desc: "zorlanan, \u0131k\u0131nan",
    hafif: { lid: [0.3, 0.25], knit: 0.4, brow: [0.2, -2], cheek: 0.3, mouth: { base: "flat", press: 1 } },
    normal: { lid: [0.5, 0.45], low: 0.3, knit: 0.6, brow: [0.25, -3], cheek: 0, red: 0.3, sweat: 0.3, mouth: "grit" },
    cok: { squeeze: 1, knit: 0.8, red: 0.6, sweat: 0.6, vein: 0.6, shake: 0.4, mouth: { base: "grit", w: 0.64, open: 16 } },
    asiri: { knit: 1, red: 1, sweat: 1, vein: 1, shake: 0.9, steam: 0.5, mouth: { base: "grit", w: 0.72, open: 20, corner: 10 } }
  },
  aptal: {
    desc: "saf \u2013 b\xF6n \u2013 ahmak \u2013 dili d\u0131\u015Far\u0131da",
    hafif: { lid: [0.18, 0.18], brow: [-0.1, 3], cross: 0.15, mouth: { base: "dopey", open: 6, tongue: 0 } },
    normal: { lid: [0.22, 0.22], brow: [-0.18, 5], mouth: "dopey", pupil: 0.78, cross: 0.35 },
    cok: { lid: [0.3, 0.3], cross: 0.6, pupil: 0.7, tilt: 0.08, mouth: { base: "dopey", open: 16 } },
    asiri: { lid: [0.15, 0.15], open: 1.1, brow: [-0.3, 10], cross: 1, pupil: 0.6, tilt: 0.14, mouth: { base: "tongue", buck: 1 } }
  },
  sersem: {
    desc: "sersemlemi\u015F \u2013 ba\u015F\u0131 d\xF6nen (spiral g\xF6zler, y\u0131ld\u0131zlar)",
    hafif: { lid: [0.2, 0.2], cross: 0.2, brow: [-0.1, 3], mouth: { base: "flat", open: 4, w: 0.32 } },
    normal: { cross: 0.5, pupil: 0.7, tilt: 0.08, mouth: { base: "dopey", buck: 0 } },
    cok: { iris: "spiral", tilt: 0.12, stars: 0.6, mouth: { base: "dopey", buck: 0, open: 14, tongue: 1 } },
    asiri: { open: 1.1, brow: [-0.2, 8], tilt: 0.18, stars: 1, mouth: "tongue" }
  },
  sarhos: {
    desc: "\xE7ak\u0131rkeyif \u2013 sarho\u015F (k\u0131rm\u0131z\u0131 burun)",
    hafif: { lid: [0.3, 0.3], blush: 0.4, mouth: { base: "smile", w: 0.48, corner: -6 } },
    normal: { lid: [0.48, 0.5], cross: 0.2, blush: 0.7, noseRed: 0.5, tilt: 0.08, mouth: { base: "dopey", buck: 0, open: 6, corner: -6 } },
    cok: { lid: [0.55, 0.6], cross: 0.4, blush: 0.9, red: 0.2, noseRed: 0.8, tilt: 0.14, mouth: { base: "smile", w: 0.56, corner: -8, wavy: 0.5, open: 6 } },
    asiri: { lid: [0.62, 0.7], cross: 0.6, blush: 1, red: 0.35, noseRed: 1, tilt: 0.2, stars: 0.4, mouth: { base: "tongue", corner: -4 } }
  }
};
Object.assign(EXPRESSIONS, {
  deadpan: {
    desc: "deadpan \u2014 the flat, heavy-lidded stare",
    hafif: { lid: [0.5, 0.5], brow: [0.04, -2], mouth: { base: "flat", w: 0.28 } },
    normal: { lid: [0.64, 0.64], brow: [0.06, -3], pupil: 0.8, mouth: { base: "flat", w: 0.2 } },
    cok: { lid: [0.72, 0.72], brow: [0.08, -4], pupil: 0.7, mouth: { base: "flat", w: 0.17 }, dots: 0.6 },
    asiri: { lid: [0.78, 0.78], brow: [0.08, -5], pupil: 0.6, mouth: { base: "flat", w: 0.14 }, dots: 1 }
  },
  "yan-bakis": {
    desc: "side-eye \u2014 suspicious or complicit",
    hafif: { lid: [0.3, 0.25], look: [0.6, 0], mouth: { base: "flat", w: 0.32 } },
    normal: { lid: [0.45, 0.4], look: [0.85, 0.05], brow: [0.12, -2], asym: 0.4, mouth: "side" },
    cok: { lid: [0.55, 0.5], look: [0.95, 0.1], brow: [0.2, -3], asym: 0.6, mouth: { base: "side", skew: 0.8 } },
    asiri: { lid: [0.62, 0.55], look: [1, 0.15], brow: [0.25, -4], asym: 0.8, mouth: { base: "smirk", skew: 0.9 }, dots: 0.6 }
  },
  "agzi-acik": {
    desc: "gobsmacked \u2014 jaw on the floor",
    hafif: { open: 1.12, pupil: 0.7, brow: [-0.12, 8], mouth: { base: "small-o", open: 14 } },
    normal: { open: 1.22, pupil: 0.5, brow: [-0.2, 14], mouth: "gasp", excl: 0.6 },
    cok: { open: 1.3, pupil: 0.4, brow: [-0.25, 20], mouth: { base: "gasp", open: 46, drop: 1 }, excl: 1, tension: 0.6 },
    asiri: { open: 1.4, pupil: 0.3, brow: [-0.3, 26], mouth: { base: "scream", open: 56 }, excl: 1, tension: 1, chin: -6 }
  },
  bagiran: {
    desc: "yelling \u2014 mouth half the face, head thrown back",
    hafif: { brow: [0.35, -4], mouth: { base: "shout", open: 24 }, tension: 0.3 },
    normal: { brow: [0.5, -6], knit: 0.6, mouth: "shout", chin: -6, tension: 0.7, red: 0.3 },
    cok: { brow: [0.6, -8], knit: 0.8, mouth: { base: "roar", open: 52 }, chin: -10, tension: 1, shakeLines: 0.6, red: 0.5, vein: 0.6, spit: 0.6 },
    asiri: { open: 1.2, pupil: 0.5, brow: [0.7, -10], mouth: { base: "roar", open: 60 }, chin: -14, tension: 1, shakeLines: 1, red: 0.8, vein: 1, steam: 0.8, spit: 1 }
  },
  inanmaz: {
    desc: "disbelief \u2014 one brow up, mouth pulled aside",
    hafif: { asym: 0.5, lid: [0.2, 0.15], mouth: { base: "side", skew: 0.4 } },
    normal: { asym: 1, lid: [0.3, 0.2], brow: [0.05, 2], mouth: { base: "side", skew: 0.7 }, quest: 0.5 },
    cok: { asym: 1.2, lid: [0.38, 0.25], mouth: { base: "side", skew: 0.9, open: 6 }, quest: 0.9, chin: 3 },
    asiri: { asym: 1.2, lid: [0.45, 0.3], mouth: { base: "sneer", skew: 0.9 }, quest: 1, excl: 0.5, chin: 5 }
  },
  telasli: {
    desc: "flustered \u2014 sweating, grinning nervously, eyes darting",
    hafif: { sweat: 0.3, mouth: { base: "nervous", open: 6 }, look: [0.4, 0] },
    normal: { sweat: 0.6, blush: 0.4, brow: [-0.2, 6], mouth: "nervous", look: [0.6, 0.1], tension: 0.4 },
    cok: { sweat: 0.85, blush: 0.6, brow: [-0.28, 9], mouth: { base: "grimace", wavy: 0.6 }, look: [0.8, 0], tension: 0.7, shakeLines: 0.4 },
    asiri: { sweat: 1, blush: 0.8, open: 1.15, pupil: 0.55, brow: [-0.32, 12], mouth: { base: "grimace", wavy: 1 }, tension: 1, shakeLines: 0.8 }
  },
  masum: {
    desc: "innocent \u2014 whistling, looking up and away",
    hafif: { look: [0.3, -0.4], brow: [-0.1, 4], mouth: { base: "small-o", open: 6 } },
    normal: { look: [0.45, -0.65], brow: [-0.15, 7], lid: [0.15, 0.15], mouth: { base: "kiss", open: 4 }, blush: 0.2 },
    cok: { look: [0.55, -0.8], brow: [-0.2, 10], lid: [0.25, 0.25], mouth: "kiss", sweat: 0.3, blush: 0.3 },
    asiri: { look: [0.65, -0.9], brow: [-0.22, 12], lid: [0.3, 0.3], mouth: "kiss", sweat: 0.6, dots: 0.6 }
  },
  utanc: {
    desc: "cringe \u2014 squeezing the face away",
    hafif: { lid: [0.35, 0.35], brow: [0.15, -2], mouth: { base: "grimace", open: 8 } },
    normal: { squeeze: 0.6, brow: [0.3, -4], knit: 0.6, mouth: "grimace", tilt: -0.06, shakeLines: 0.4 },
    cok: { squeeze: 1, brow: [0.35, -6], knit: 0.8, mouth: { base: "grimace", open: 20 }, tilt: -0.1, shakeLines: 0.7, sweat: 0.4 },
    asiri: { squeeze: 1, brow: [0.4, -8], knit: 1, mouth: { base: "grit", w: 0.7 }, tilt: -0.14, shakeLines: 1, sweat: 0.7, pale: 0.3 }
  },
  bos: {
    desc: "blank \u2014 nothing behind the eyes",
    hafif: { pupil: 0.6, mouth: { base: "flat", w: 0.25 } },
    normal: { pupil: 0.42, open: 1.05, mouth: { base: "flat", w: 0.16 }, dots: 0.7 },
    cok: { pupil: 0.3, open: 1.08, mouth: { base: "small-o", open: 5 }, dots: 1 },
    asiri: { pupil: 0.25, open: 1.12, mouth: { base: "dopey", open: 8 }, dots: 1, tilt: 0.08 }
  },
  "kafasi-karisik": {
    desc: "puzzled \u2014 head tilted, brow up, question mark",
    hafif: { asym: 0.4, brow: [-0.05, 3], mouth: { base: "side", skew: 0.3 }, tilt: 0.04 },
    normal: { asym: 0.8, brow: [-0.1, 5], mouth: { base: "side", skew: 0.5 }, tilt: 0.07, quest: 1 },
    cok: { asym: 1, brow: [-0.12, 8], look: [0.3, -0.3], mouth: { base: "side", skew: 0.7, open: 6 }, tilt: 0.1, quest: 1 },
    asiri: { asym: 1.2, open: 1.1, brow: [-0.15, 10], mouth: { base: "small-o" }, tilt: 0.14, quest: 1, stars: 0.4 }
  },
  surat: {
    desc: "pouting \u2014 sulky lips, cheeks puffed, looking away",
    hafif: { mouth: { base: "pout", w: 0.3 }, look: [0.4, 0.1] },
    normal: { brow: [0.2, -2], mouth: "pout", cheek: 0.4, look: [0.6, 0.1], lid: [0.2, 0.15] },
    cok: { brow: [0.28, -3], mouth: { base: "pout", pout: 1.3 }, cheek: 0.8, look: [0.8, 0.1], lid: [0.3, 0.2], chin: -3 },
    asiri: { brow: [0.32, -4], mouth: { base: "pout", pout: 1.5 }, cheek: 1.2, look: [0.9, 0.1], lid: [0.35, 0.25], chin: -6, red: 0.3 }
  },
  "midesi-bulanik": {
    desc: "nauseous \u2014 green, wobbly, cheeks bulging",
    hafif: { sick: 0.35, lid: [0.25, 0.25], mouth: { base: "wavy", w: 0.36 } },
    normal: { sick: 0.65, lid: [0.4, 0.4], mouth: "wavy", cheek: 0.5, sweat: 0.3, stink: 0.3 },
    cok: { sick: 0.9, lid: [0.5, 0.5], mouth: { base: "wavy", press: 1 }, cheek: 1, sweat: 0.6, stink: 0.6 },
    asiri: { sick: 1, squeeze: 0.6, mouth: { base: "wavy", press: 1 }, cheek: 1.3, sweat: 0.9, stink: 1, shakeLines: 0.5 }
  },
  "kotu-plan": {
    desc: "scheming \u2014 narrowed eyes, crooked grin",
    hafif: { lid: [0.35, 0.15], brow: [0.25, -2], mouth: { base: "smirk", smirk: 8 } },
    normal: { lid: [0.5, 0.2], brow: [0.4, -4], knit: 0.3, mouth: { base: "grin", w: 0.6, smirk: 12 } },
    cok: { lid: [0.55, 0.2], brow: [0.5, -6], knit: 0.5, mouth: { base: "grin", w: 0.72, smirk: 16, open: 10 }, look: [0.4, 0.1], gloom: 0.3 },
    asiri: { lid: [0.6, 0.15], brow: [0.6, -8], knit: 0.7, mouth: { base: "laugh", w: 0.74, smirk: 14 }, look: [0.5, 0.1], gloom: 0.6, chin: 4 }
  },
  "yerin-dibi": {
    desc: "mortified \u2014 pale, gloom cloud, wishing to vanish",
    hafif: { pale: 0.3, brow: [-0.25, 4], mouth: { base: "wavy", w: 0.34 }, sweat: 0.3 },
    normal: { pale: 0.55, brow: [-0.35, 6], open: 1.1, pupil: 0.6, mouth: { base: "wavy", open: 8 }, sweat: 0.5, cloud: 0.6, gloom: 0.4 },
    cok: { pale: 0.75, brow: [-0.42, 8], open: 1.15, pupil: 0.45, mouth: { base: "cry", open: 16 }, sweat: 0.7, cloud: 1, gloom: 0.7 },
    asiri: { pale: 0.9, brow: [-0.48, 10], squeeze: 1, mouth: { base: "cry", open: 24 }, sweat: 0.9, cloud: 1, gloom: 1, shakeLines: 0.6, tear: 0.6 }
  },
  // ikinci geçiş: kısık göz (dikkatle bakmak) ve hüngür hüngür ağlamak
  kisik: {
    desc: "squinting \u2014 peering hard at something small or far",
    hafif: { lid: [0.4, 0.45], low: 0.25, brow: [0.15, -3], mouth: { base: "side", skew: 0.3 } },
    normal: { lid: [0.55, 0.6], low: 0.45, brow: [0.25, -5], knit: 0.5, mouth: { base: "side", skew: 0.5 }, asym: 0.3 },
    cok: { lid: [0.65, 0.72], low: 0.6, brow: [0.3, -6], knit: 0.7, mouth: { base: "grimace", open: 6 }, asym: 0.5, chin: -3 },
    asiri: { lid: [0.72, 0.8], low: 0.7, brow: [0.32, -7], knit: 0.9, mouth: { base: "grimace", open: 10 }, asym: 0.6, chin: -5, tension: 0.4 }
  },
  bereli: {
    desc: "bruised \u2014 a bump on the head, seeing stars",
    hafif: { lump: 0.5, lid: [0.25, 0.25], mouth: { base: "wavy", w: 0.3 } },
    normal: { lump: 1, lid: [0.3, 0.35], brow: [-0.2, 4], mouth: "wavy", stars: 0.5, tilt: 0.06 },
    cok: { lump: 1, iris: "spiral", brow: [-0.25, 6], mouth: { base: "wavy", open: 8 }, stars: 0.9, tilt: 0.1, chin: 3 },
    asiri: { lump: 1, iris: "spiral", squeeze: 0, brow: [-0.3, 8], mouth: { base: "dopey", open: 14, tongue: 1 }, stars: 1, tilt: 0.14, chin: 5 }
  },
  hungur: {
    desc: "bawling \u2014 mouth wide open, tears streaming",
    hafif: { lid: [0.2, 0.5], brow: [-0.5, 8], mouth: "sob", tear: 0.7 },
    normal: { squeeze: 0.5, brow: [-0.6, 10], mouth: { base: "cry", open: 34 }, tear: 0.95, red: 0.3, chin: -6, shake: 0.2 },
    cok: { squeeze: 0.8, brow: [-0.65, 12], mouth: { base: "cry", open: 46 }, tear: 1, red: 0.45, chin: -10, shake: 0.35, spit: 0.4 },
    asiri: { squeeze: 1, brow: [-0.7, 14], mouth: { base: "scream", open: 56 }, tear: 1, red: 0.6, chin: -14, shake: 0.5, spit: 0.7, shakeLines: 0.6 }
  },
  "aklina-geldi": {
    desc: "eureka \u2014 the light bulb",
    hafif: { open: 1.06, brow: [-0.1, 6], mouth: { base: "smile", w: 0.5 }, idea: 0.6 },
    normal: { open: 1.14, brow: [-0.15, 11], mouth: "bigsmile", idea: 1, sparkle: 0.7 },
    cok: { open: 1.2, brow: [-0.2, 15], mouth: { base: "laugh", open: 22 }, idea: 1, sparkle: 1, excl: 0.6 },
    asiri: { open: 1.26, brow: [-0.22, 18], iris: "yildiz", mouth: { base: "laugh", open: 30 }, idea: 1, sparkle: 1, excl: 1, tension: 0.5 }
  }
});
var ALIASES = {
  neseli: "cok mutlu",
  sevincli: "cok mutlu",
  keyifli: "memnun",
  hosnut: "memnun",
  kikirdama: "hafif guluyor",
  kahkaha: "asiri guluyor",
  sinirli: "hafif kizgin",
  kopurmus: "asiri kizgin",
  azimli: "kararli",
  sert: "cok ciddi",
  tedirgin: "hafif korkmus",
  dehset: "asiri korkmus",
  panik: "asiri endiseli",
  kaygili: "cok endiseli",
  sok: "asiri saskin",
  buruk: "hafif uzgun",
  aglamakli: "cok uzgun",
  agliyor: "asiri uzgun",
  huzunlu: "uzgun",
  sinsi: "cok kurnaz",
  seytani: "asiri kurnaz",
  burnu_havada: "cok kibirli",
  alay: "alayci",
  esniyor: "asiri sikilmis",
  uyuyor: "asiri uykulu",
  bitap: "asiri yorgun",
  huzur: "asiri sakin",
  // English
  neutral: "notr",
  happy: "mutlu",
  content: "memnun",
  laughing: "guluyor",
  grin: "sirit",
  excited: "heyecanli",
  proud: "gururlu",
  relieved: "rahatlamis",
  grateful: "minnettar",
  hopeful: "umutlu",
  calm: "sakin",
  "in-love": "asik",
  love: "asik",
  awe: "hayran",
  greedy: "hirsli",
  angry: "kizgin",
  furious: "ofkeli",
  determined: "kararli",
  serious: "ciddi",
  annoyed: "hafif kizgin",
  exasperated: "bikkin",
  jealous: "kiskanc",
  sulky: "kuskun",
  disgusted: "igrenmis",
  surprised: "saskin",
  stunned: "afallamis",
  curious: "merakli",
  scared: "korkmus",
  afraid: "korkmus",
  worried: "endiseli",
  embarrassed: "mahcup",
  shy: "utangac",
  guilty: "suclu",
  sad: "uzgun",
  disappointed: "hayal-kirikligi",
  pain: "aci",
  sly: "kurnaz",
  smug: "kibirli",
  arrogant: "kibirli",
  mocking: "alayci",
  suspicious: "supheli",
  thoughtful: "dusunceli",
  sleepy: "uykulu",
  bored: "sikilmis",
  tired: "yorgun",
  straining: "zorlaniyor",
  silly: "aptal",
  dazed: "sersem",
  drunk: "sarhos",
  "side-eye": "yan-bakis",
  gobsmacked: "agzi-acik",
  yelling: "bagiran",
  disbelief: "inanmaz",
  flustered: "telasli",
  innocent: "masum",
  squinting: "kisik",
  bawling: "hungur",
  bruised: "bereli",
  cringe: "utanc",
  blank: "bos",
  puzzled: "kafasi-karisik",
  pouting: "surat",
  nauseous: "midesi-bulanik",
  scheming: "kotu-plan",
  mortified: "yerin-dibi",
  eureka: "aklina-geldi"
};
for (const k of Object.keys(ALIASES)) if (k.includes("_")) {
  ALIASES[k.replace(/_/g, "-")] = ALIASES[k];
  delete ALIASES[k];
}

// src/face/face.js
var MOUTH0 = { w: 0.42, open: 0, corner: 0, round: 0, teeth: 0, low: 0, tongue: 0, out: 0, buck: 0, press: 0, bite: 0, wavy: 0, smirk: 0, grit: 0, pout: 0, skew: 0, drop: 0 };
var NEUTRAL = Object.freeze({
  open: 1,
  lid: [0.1, 0.1],
  low: 0,
  closed: 0,
  arc: 0,
  squeeze: 0,
  pupil: 1,
  look: [0, 0],
  cross: 0,
  sparkle: 0,
  tear: 0,
  bags: 0,
  brow: [0, 0],
  arch: 0,
  knit: 0,
  asym: 0,
  nostril: 0,
  sneer: 0,
  noseRed: 0,
  blush: 0,
  red: 0,
  pale: 0,
  sick: 0,
  gloom: 0,
  sweat: 0,
  vein: 0,
  forehead: 0,
  cheek: 0,
  steam: 0,
  zzz: 0,
  stars: 0,
  shake: 0,
  chin: 0,
  tilt: 0,
  // caricature emanata (yesilcam): tension lines, shake lines, ? ! marks, idea bulb, silent dots, gloom cloud, stink lines
  tension: 0,
  shakeLines: 0,
  quest: 0,
  excl: 0,
  idea: 0,
  dots: 0,
  cloud: 0,
  stink: 0,
  spit: 0,
  lump: 0,
  mouth: MOUTH0,
  iris: null
});

// src/face/sprite.ts
var EXPR_NAMES = [
  "neutral",
  "happy",
  "content",
  "laughing",
  "grin",
  "excited",
  "proud",
  "relieved",
  "grateful",
  "hopeful",
  "calm",
  "in-love",
  "awe",
  "greedy",
  "angry",
  "furious",
  "determined",
  "serious",
  "annoyed",
  "exasperated",
  "jealous",
  "sulky",
  "disgusted",
  "surprised",
  "stunned",
  "curious",
  "scared",
  "worried",
  "embarrassed",
  "shy",
  "guilty",
  "sad",
  "disappointed",
  "pain",
  "sly",
  "smug",
  "mocking",
  "suspicious",
  "thoughtful",
  "sleepy",
  "bored",
  "tired",
  "straining",
  "silly",
  "dazed",
  "drunk",
  // caricature (docs/CARICATURE.md)
  "deadpan",
  "side-eye",
  "gobsmacked",
  "yelling",
  "disbelief",
  "flustered",
  "innocent",
  "cringe",
  "blank",
  "puzzled",
  "pouting",
  "nauseous",
  "scheming",
  "mortified",
  "eureka",
  "squinting",
  "bawling",
  "bruised"
];
var EXPR_LEVELS = ["slightly", "", "very", "extreme"];

// src/face/poses.js
var S = Math.sin;
var POSES = {
  dur: (lt) => ({ F: [0.14 + 0.02 * S(lt * 1.3), 0.12], B: [0.14 + 0.02 * S(lt * 1.1 + 1), 0.12] }),
  // konuşurken yakın kol (B) jest yapar — 3/4 açıda gövdenin önünde kalır
  konus: (lt) => ({
    B: [0.62 + 0.22 * S(lt * 2.7), -1.25 + 0.4 * S(lt * 3.9 + 0.5)],
    F: [0.2 + 0.05 * S(lt * 1.9), 0.1],
    armsFront: true,
    headTilt: 0.04 * S(lt * 2.3)
  }),
  anlat: (lt) => ({
    F: [0.75 + 0.25 * S(lt * 2.4), -1.1 + 0.35 * S(lt * 3.3)],
    B: [0.75 + 0.25 * S(lt * 2.4 + 2.2), -1.1 + 0.35 * S(lt * 3.1 + 1.7)],
    headTilt: 0.05 * S(lt * 2)
  }),
  isaret: (lt) => ({ F: [1.5 + 0.06 * S(lt * 7) * Math.exp(-lt * 2), 0.02], B: [0.16, 0.1], lean: -0.03 }),
  "el-salla": (lt) => ({ F: [2.55, -0.15 + 0.45 * S(lt * 10)], B: [0.15, 0.1], headTilt: 0.06 }),
  bel: () => ({ F: [0.62, -1.95], B: [0.62, -1.95], fistF: true, fistB: true }),
  kavustur: () => ({ F: [0.18, -1.9], B: [0.22, -2.05], armsFront: true, headTilt: -0.03 }),
  "omuz-silk": (lt) => {
    const k = ease.outBack(clamp2(lt / 0.3));
    return { F: [0.2 + 0.55 * k, 0.1 + 1.45 * k], B: [0.2 + 0.55 * k, 0.1 + 1.45 * k], bodyY: -5 * k, headTilt: 0.12 * k };
  },
  "eller-havada": (lt) => ({
    F: [2.65 + 0.08 * S(lt * 14), 0.2],
    B: [2.65 + 0.08 * S(lt * 14 + 1.5), 0.2],
    bodyY: -4
  }),
  dusun: (lt) => ({ reach: { F: ["cene", 0, 2 * S(lt * 2)] }, B: [0.62, -1.95], headTilt: 0.08, armsFront: true, fistF: true, fistB: true }),
  "kafa-kasi": (lt) => ({ reach: { F: ["kafa", 0, 7 * S(lt * 16)] }, B: [0.15, 0.1], headTilt: -0.08, armsFront: true }),
  // Osmanlı temennası: el göğse, sonra alına, hafif eğilme
  temenna: (lt) => {
    const p = clamp2(lt / 1.1);
    const up = ease.inOut(clamp2((p - 0.25) / 0.5));
    return {
      reach: { F: { at: "gogus", to: "alin", u: up, dx: -6 } },
      B: [0.14, 0.1],
      headY: 10 * bump(p),
      bodyY: 6 * bump(p),
      headTilt: 0.12 * bump(p),
      armsFront: true
    };
  },
  selam: () => ({ F: [1.05, -2.55], B: [0.12, 0.08], armsFront: true }),
  yalvar: (lt) => ({ F: [0.42, -1.48 + 0.08 * S(lt * 12)], B: [0.42, -1.48 + 0.08 * S(lt * 12)], bodyY: 8, armsFront: true, headTilt: 0.1 }),
  kizgin: (lt) => ({
    F: [0.5, -1.45 + 0.15 * S(lt * 22)],
    B: [0.5, -1.45 + 0.15 * S(lt * 22 + 2)],
    fistF: true,
    fistB: true,
    jitter: 1.5
  }),
  titre: (lt) => ({ F: [0.55, -2.35], B: [0.55, -2.35], bodyY: 6, jitter: 3, armsFront: true }),
  otur: (lt) => ({ F: [0.25, -0.9], B: [0.25, -0.9], legs: "sit", bodyY: 0, armsFront: true }),
  egil: (lt) => {
    const k = ease.out(clamp2(lt / 0.4));
    return { F: [0.1, 0.05], B: [0.1, 0.05], headY: 18 * k, bodyY: 10 * k, headTilt: 0.05 * k };
  },
  zipla: (lt) => {
    const p = clamp2(lt / 0.5);
    return {
      F: [2.5 * bump(p) + 0.2, 0.3],
      B: [2.5 * bump(p) + 0.2, 0.3],
      jump: 95 * bump(p),
      squash: lt < 0.06 ? 0.12 : p >= 1 ? 0.1 * Math.exp(-(lt - 0.5) * 12) : -0.06
    };
  },
  bayil: (lt) => {
    const p = ease.inQuad(clamp2(lt / 0.55));
    return { F: [1.2 * p + 0.2, 0.4], B: [1.2 * p + 0.2, 0.4], rot: Math.PI / 2 * p + 0.06 * S(clamp2((lt - 0.55) * 6) * Math.PI) * (lt > 0.55 ? 1 : 0) };
  },
  oku: () => ({ F: [0.42, -1.35], B: [0.42, -1.35], armsFront: true, headTilt: 0.1, headY: 4 }),
  tespih: (lt) => ({ F: [0.26, -0.85 + 0.06 * S(lt * 3)], B: [0.14, 0.12] }),
  "el-cirp": (lt) => {
    const c = (S(lt * 14) + 1) / 2;
    return { F: [0.5, -1.25 - 0.35 * c], B: [0.5, -1.25 - 0.35 * c], armsFront: true };
  },
  dans: (lt) => ({
    F: [2.4 + 0.25 * S(lt * 6), -0.5 + 0.4 * S(lt * 6)],
    B: [2.4 + 0.25 * S(lt * 6 + Math.PI), -0.5 + 0.4 * S(lt * 6 + Math.PI)],
    lean: 0.07 * S(lt * 6),
    bodyY: 4 * Math.abs(S(lt * 6)),
    headTilt: 0.06 * S(lt * 6 + 1)
  }),
  kos: (lt) => ({ F: [0.5, -1.6], B: [0.5, -1.6], lean: 0.08, fistF: true, fistB: true }),
  "kollari-ac": () => ({ F: [1.25, 0.2], B: [1.25, 0.2], headTilt: -0.04 }),
  "tufek-tut": () => ({ F: [0.5, -0.42], B: [0.15, 0.1], fistF: true }),
  // ───────────── beden dili jestleri (body.js duyguya ve kişiliğe göre seçer) ─────────────
  // sevinç
  sek: (lt) => ({ F: [2.2 + 0.3 * S(lt * 14), 0.3], B: [2.2 + 0.3 * S(lt * 14 + 1.4), 0.3], jump: 26 * Math.abs(S(lt * 7)) }),
  sevin: (lt) => ({ F: [2.5, -0.9 + 0.5 * S(lt * 12)], B: [0.3, 0.05], fistF: true, fistB: true, jump: 8 * Math.abs(S(lt * 6)) }),
  "eller-gobekte": (lt) => ({ reach: { F: "gobek", B: ["gobek", 0, 2 * S(lt * 1.6)] }, armsFront: true }),
  gobek: (lt) => ({ reach: { F: "gobek", B: "gobek" }, armsFront: true, bodyY: 3 * Math.abs(S(lt * 14)), lean: -0.06, headTilt: -0.06 }),
  kikirda: (lt) => ({ reach: { F: "agiz", B: "gobek" }, armsFront: true, bodyY: 2 * Math.abs(S(lt * 16)), headTilt: 0.06 }),
  "dizini-dov": (lt) => ({ F: [0.3 + 0.12 * S(lt * 11), -0.15], reach: { B: "gobek" }, armsFront: true, lean: 0.14, bodyY: 6, headY: 4 }),
  alay: (lt) => ({ F: [1.45, 0.02 + 0.06 * S(lt * 16)], reach: { B: "gobek" }, bodyY: 2 * Math.abs(S(lt * 14)), lean: -0.04 }),
  "el-gogus": (lt) => ({ reach: { F: ["gogus", -10, 0] }, B: [0.15, 0.1], armsFront: true, headTilt: 0.05 + 0.02 * S(lt * 1.5) }),
  "eller-birlesik": (lt) => ({ reach: { F: ["gogus", -12, -6], B: ["gogus", -12, -6] }, armsFront: true, fistF: true, fistB: true, headTilt: -0.04 + 0.02 * S(lt * 1.8) }),
  "el-ele": (lt) => ({ F: [0.18, -0.8], B: [0.18, -0.8 + 0.04 * S(lt * 2)], armsFront: true }),
  "eller-yanakta": () => ({ reach: { F: "yanak", B: "yanak" }, armsFront: true, bodyY: -2 }),
  "alin-sil": (lt) => ({ reach: { F: ["alin", 14 * S(lt * 5), 0] }, B: [0.15, 0.1], armsFront: true, headTilt: 0.06 }),
  // kibir / kurnazlık
  "gogus-kabart": () => ({ F: [0.62, -1.95], B: [0.62, -1.95], fistF: true, fistB: true, chest: 1, lean: -0.06, headTilt: -0.05 }),
  "el-ovustur": (lt) => ({ reach: { F: ["gogus", -14, 8 + 5 * S(lt * 12)], B: ["gogus", -14, 8 - 5 * S(lt * 12)] }, armsFront: true, lean: 0.03, shrug: 3 }),
  fisilda: (lt) => ({ reach: { F: ["agiz", 26, 0] }, B: [0.2, 0.1], armsFront: true, lean: 0.1, headTilt: 0.1 + 0.02 * S(lt * 3) }),
  // öfke
  "yumruk-salla": (lt) => ({ F: [2, -1.4 + 0.3 * S(lt * 16)], B: [0.3, 0.05], fistF: true, fistB: true, lean: 0.05, jitter: 1 }),
  "parmak-salla": (lt) => ({ F: [1.7, -1.9 + 0.25 * S(lt * 12)], B: [0.62, -1.95], fistB: true, lean: 0.03 }),
  "ayak-vur": (lt) => ({ F: [0.3, 0.05 + 0.1 * S(lt * 9)], B: [0.3, 0.05 - 0.1 * S(lt * 9)], fistF: true, fistB: true, tap: 1, bodyY: 3 * Math.abs(S(lt * 9)), jitter: 1.5 }),
  "yumruk-sik": () => ({ F: [0.22, 0.05], B: [0.22, 0.05], fistF: true, fistB: true }),
  "yumruk-kaldir": () => ({ F: [2.3, -1.9], B: [0.22, 0.05], fistF: true, fistB: true }),
  "el-kaldir": (lt) => ({ F: [1.35, -1.7 + 0.05 * S(lt * 6)], B: [0.15, 0.1], lean: -0.05 }),
  "agiz-kapat": () => ({ reach: { F: "agiz", B: "gobek" }, armsFront: true, headY: 3 }),
  // korku / üzüntü / yorgunluk
  "kollari-sark": (lt) => ({ F: [0.04 + 0.02 * S(lt * 1.2), 0], B: [0.04 + 0.02 * S(lt * 1.1 + 1), 0] }),
  savun: (lt) => ({ reach: { F: ["yuz", 34, 18 + 3 * S(lt * 9)], B: ["yuz", 34, 22] }, armsFront: true, lean: -0.05 }),
  sin: () => ({ reach: { F: ["kafa", 10, -16], B: ["kafa", 10, -16] }, armsFront: true, bodyY: 16, lean: -0.06, headY: 6, jitter: 3, shrug: 6 }),
  "kafa-tut": (lt) => ({ reach: { F: ["kafa", 0, 2 * S(lt * 7)], B: "kafa" }, armsFront: true }),
  "yuz-kapat": (lt) => ({ reach: { F: "goz", B: "goz" }, armsFront: true, headY: 6, bodyY: 3 * Math.abs(S(lt * 3)) }),
  esne: (lt) => {
    const up = ease.inOut(clamp2(lt / 0.6)) * (1 - ease.inOut(clamp2((lt - 1.6) / 0.6)));
    return { F: [0.2 + 2.7 * up, 0.1 + 0.2 * up], B: [0.2 + 2.7 * up, 0.1 + 0.2 * up], fistF: up > 0.5, fistB: up > 0.5, lean: -0.05 * up, headTilt: -0.08 * up };
  },
  sallan: (lt) => ({ F: [0.2 + 0.1 * S(lt * 1.6), 0.1], B: [0.2 + 0.1 * S(lt * 1.6 + 2), 0.1], lean: 0.1 * S(lt * 1.6), headTilt: 0.12 * S(lt * 1.6 + 0.6) })
};

// src/face/body.js
var MOD0 = { lean: 0, slump: 0, chest: 0, shrug: 0, knees: 0, bounce: 0, sway: 0, tremble: 0, fidget: 0, tap: 0, stance: 0, headTilt: 0, headY: 0, startle: 0, gest: 0 };

// src/engine/motion.ts
var S2 = Math.sin;
var bump2 = (t) => Math.sin(clamp(t, 0, 1) * Math.PI);
var ramp = (t, d) => clamp(t / d, 0, 1);
var easeO = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
var easeIO = (t) => {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
function take(lt) {
  if (lt < 0.12) {
    const a = easeO(ramp(lt, 0.12));
    return { squash: 0.18 * a, bodyY: 10 * a, LF: [0.1 * a, -0.35 * a], LB: [0.1 * a, -0.35 * a], F: [0.14 + 0.2 * a, 0.5 * a], B: [0.14 + 0.2 * a, 0.5 * a], headY: 6 * a };
  }
  const e = easeO(ramp(lt - 0.12, 0.08)) * (1 - 0.65 * easeIO(ramp(lt - 0.95, 0.5)));
  const buzz = Math.sin(lt * 48) * Math.exp(-Math.max(0, lt - 0.2) * 6);
  return { squash: -0.24 * e * (1 + 0.25 * buzz), jump: 12 * e, F: [0.4 + 2.2 * e, 0.25], B: [0.4 + 2.2 * e, 0.25], headY: -8 * e, chest: 0.3 * e, jitter: lt < 0.9 ? 1.2 * e : 0 };
}
var KUKLA_NAMES = {
  rest: "dur",
  idle: "dur",
  talk: "konus",
  explain: "anlat",
  point: "isaret",
  wave: "el-salla",
  "hands-on-hips": "bel",
  "arms-crossed": "kavustur",
  shrug: "omuz-silk",
  "hands-up": "eller-havada",
  think: "dusun",
  "scratch-head": "kafa-kasi",
  temenna: "temenna",
  salute: "selam",
  beg: "yalvar",
  "angry-arms": "kizgin",
  tremble: "titre",
  sit: "otur",
  "bow-head": "egil",
  jump: "zipla",
  faint: "bayil",
  read: "oku",
  "prayer-beads": "tespih",
  clap: "el-cirp",
  dance: "dans",
  "run-arms": "kos",
  "open-arms": "kollari-ac",
  "hold-rifle": "tufek-tut",
  "hop-for-joy": "sek",
  celebrate: "sevin",
  "hands-on-belly": "eller-gobekte",
  "belly-laugh": "gobek",
  giggle: "kikirda",
  "slap-knee": "dizini-dov",
  mock: "alay",
  "hand-on-heart": "el-gogus",
  "hands-together": "eller-birlesik",
  "hands-clasped": "el-ele",
  "hands-on-cheeks": "eller-yanakta",
  "wipe-brow": "alin-sil",
  "puff-chest": "gogus-kabart",
  "rub-hands": "el-ovustur",
  whisper: "fisilda",
  "shake-fist": "yumruk-salla",
  "wag-finger": "parmak-salla",
  stomp: "ayak-vur",
  "clench-fists": "yumruk-sik",
  "raise-fist": "yumruk-kaldir",
  "hand-up": "el-kaldir",
  "cover-mouth": "agiz-kapat",
  "arms-hang": "kollari-sark",
  defend: "savun",
  cower: "sin",
  "hold-head": "kafa-tut",
  "cover-face": "yuz-kapat",
  yawn: "esne",
  sway: "sallan"
};
var EXTRA = {
  salute: () => ({ reach: { F: ["brow", 16, -2] }, B: [0.12, 0.08], chest: 0.5, headTilt: -0.03 }),
  "wag-finger": (lt) => ({ F: [1.7, -1.9 + 0.25 * S2(lt * 12)], B: [0.62, -1.95], fistB: true, pointF: true, lean: 0.03 }),
  "point-at-self": () => ({ reach: { F: ["chest", 0, 0] }, B: [0.15, 0.1], pointF: true, armsFront: true, headTilt: 0.05 }),
  facepalm: (lt) => ({ reach: { F: ["face", 4, 6] }, B: [0.12, 0.1], armsFront: true, headY: 6 + 2 * S2(lt * 2), headTilt: 0.06 }),
  type: (lt) => ({ F: [0.55, -1.1 + 0.08 * S2(lt * 23)], B: [0.55, -1.1 + 0.08 * S2(lt * 21 + 1)], armsFront: true, lean: 0.05, headY: 4 }),
  hug: (lt) => ({ F: [1.25, -1.15 + 0.05 * S2(lt * 2)], B: [1.2, -1.25], armsFront: true, lean: 0.06, headTilt: 0.06 }),
  "point-up": (lt) => ({ F: [2.75, -0.05], B: [0.15, 0.1], pointF: true, headTilt: -0.06, headY: -3 + 0 * lt }),
  "point-down": () => ({ F: [0.65, 0.05], B: [0.15, 0.1], pointF: true, headY: 5, lean: 0.04 }),
  beckon: (lt) => ({ F: [1.25, -0.5 - 0.7 * Math.abs(S2(lt * 6))], B: [0.15, 0.1], pointF: true, headTilt: 0.05 }),
  stop: () => ({ F: [1.5, -0.25], B: [0.2, 0.1], lean: -0.04, headTilt: -0.03 }),
  phone: (lt) => ({ reach: { F: "ear" }, B: [0.55, -1.6], armsFront: true, headTilt: 0.08 + 0.02 * S2(lt * 2), fistF: true }),
  drink: (lt) => ({ reach: { F: ["mouth", 10, 4] }, B: [0.15, 0.1], headTilt: -0.12 * easeO(ramp(lt, 0.6)), headY: -3, armsFront: true }),
  eat: (lt) => ({ reach: { F: ["mouth", 12 + 6 * S2(lt * 6), 0] }, B: [0.45, -1.3], armsFront: true, headY: 2 }),
  "look-far": (lt) => ({ reach: { F: ["brow", 18, -4] }, B: [0.15, 0.1], lean: 0.05, headY: -4, headTilt: 0.03 * S2(lt * 0.8) }),
  "cover-ears": () => ({ reach: { F: "ear", B: "ear" }, armsFront: true, headY: 4, jitter: 1 }),
  "blow-kiss": (lt) => {
    const k = easeIO(ramp(lt - 0.5, 0.4));
    return lt < 0.5 ? { reach: { F: "mouth" }, B: [0.15, 0.1], armsFront: true } : { F: [0.9 + 0.7 * k, -1.6 + 1.5 * k], B: [0.15, 0.1], headTilt: 0.08 };
  },
  conduct: (lt) => ({ F: [1.6 + 0.5 * S2(lt * 5), -0.9 + 0.5 * S2(lt * 10)], B: [1.4 + 0.3 * S2(lt * 5 + 1), -0.6], pointF: true, lean: 0.03 * S2(lt * 2.5), headTilt: 0.05 * S2(lt * 5) }),
  stretch: (lt) => {
    const k = bump2(ramp(lt, 2.2));
    return { F: [0.2 + 2.7 * k, 0.1], B: [0.2 + 2.7 * k, 0.1], fistF: k > 0.5, fistB: k > 0.5, lean: -0.08 * k, headTilt: -0.1 * k, jump: 6 * k };
  },
  kneel: () => ({ legs: "kneel", F: [0.3, -0.6], B: [0.3, -0.6], lean: 0.03, armsFront: true }),
  "kneel-propose": (lt) => ({ legs: "kneel", F: [1.35, -0.25], B: [0.2, 0.1], headTilt: -0.06, headY: -2 + 0 * lt }),
  "sit-floor": () => ({ legs: "floor", F: [0.35, -0.9], B: [0.35, -0.9], armsFront: true }),
  lie: () => ({ legs: "lie", rot: Math.PI / 2, F: [0.2, 0.05], B: [0.2, 0.05] }),
  "fall-down": (lt) => {
    const p = easeO(ramp(lt, 0.35));
    return { F: [0.6 + 1.8 * p, 0.3], B: [0.6 + 1.8 * p, 0.3], rot: -(Math.PI / 2) * p, jump: 30 * bump2(ramp(lt, 0.35)), legs: p > 0.9 ? "lie" : "stand" };
  },
  "trip-fall": (lt) => {
    const p = easeO(ramp(lt - 0.15, 0.45));
    return { F: [1.2 + 1.2 * p, 0.2], B: [1.2 + 1.4 * p, 0.2], rot: Math.PI / 2 * p, lean: 0.3 * (1 - p), LF: [0.6 * bump2(ramp(lt, 0.3)), -0.6], legs: p > 0.9 ? "lie" : "stand" };
  },
  punch: (lt) => {
    const wind = lt < 0.18 ? lt / 0.18 : 0;
    const hit = lt >= 0.18 ? Math.exp(-(lt - 0.18) * 5) : 0;
    return { F: [0.6 + 1 * hit - 0.4 * wind, -1.9 + 1.85 * hit + 0.3 * wind], B: [0.6, -1.9], fistF: true, fistB: true, lean: 0.12 * hit - 0.06 * wind, armsFront: true };
  },
  uppercut: (lt) => {
    const hit = lt >= 0.2 ? Math.exp(-(lt - 0.2) * 4) : 0;
    return { F: [0.4 + 2.2 * hit, -1.6 + 1.3 * hit], B: [0.6, -1.9], fistF: true, fistB: true, bodyY: 10 * (1 - hit) * ramp(lt, 0.2), jump: 18 * hit };
  },
  slap: (lt) => {
    const swing = lt < 0.25 ? -0.6 * (lt / 0.25) : 1.1 * Math.exp(-(lt - 0.25) * 6);
    return { F: [1.35 + swing * 0.4, -0.3 - swing * 0.6], B: [0.15, 0.1], lean: 0.05 * swing };
  },
  push: (lt) => {
    const k = easeO(ramp(lt - 0.1, 0.25)) * (1 - easeIO(ramp(lt - 0.9, 0.5)));
    return { F: [1.45, -1.2 + 1.1 * k], B: [1.4, -1.25 + 1.05 * k], armsFront: true, lean: 0.06 + 0.1 * k, LF: [0.25 * k, -0.1], LB: [-0.25 * k, -0.05] };
  },
  pull: (lt) => ({ F: [1.35, -0.3 - 0.6 * Math.abs(S2(lt * 3))], B: [1.3, -0.5 - 0.6 * Math.abs(S2(lt * 3 + 0.4))], fistF: true, fistB: true, armsFront: true, lean: -0.18, LF: [0.35, -0.1], LB: [-0.15, -0.2] }),
  throw: (lt) => {
    const back = lt < 0.35 ? easeO(lt / 0.35) : 0;
    const go = lt >= 0.35 ? Math.exp(-(lt - 0.35) * 5) : 0;
    return { F: [2.2 * back + 1.6 * go + 0.2, -1.8 * back + 0.2 * go], B: [0.6, -0.4], fistF: back > 0.2, lean: -0.1 * back + 0.14 * go };
  },
  catch: (lt) => ({ F: [1.35, -0.45 + 0.15 * S2(lt * 8)], B: [1.3, -0.5], armsFront: true, lean: 0.04, bodyY: 4 }),
  lift: (lt) => {
    const k = easeIO(ramp(lt, 0.8));
    return { F: [0.6 + 2 * k, -1.2 + 1.1 * k], B: [0.6 + 2 * k, -1.2 + 1.1 * k], armsFront: true, bodyY: 14 * (1 - k), jitter: 1.2 * (1 - k) };
  },
  carry: (lt) => ({ F: [0.95, -1.35], B: [0.95, -1.35], armsFront: true, lean: -0.05, jitter: 0.3 * Math.abs(S2(lt * 6)) }),
  give: (lt) => ({ F: [0.95 + 0.4 * easeO(ramp(lt, 0.5)), -0.9 + 0.75 * easeO(ramp(lt, 0.5))], B: [0.15, 0.1], lean: 0.06, headTilt: 0.04 }),
  receive: (lt) => ({ F: [1.1 + 0.2 * easeO(ramp(lt, 0.5)), -0.7], B: [1, -0.8], armsFront: true, lean: 0.04 }),
  nod: (lt) => ({ headY: 6 * Math.max(0, S2(lt * 9)) * Math.exp(-lt * 0.8), F: [0.14, 0.12], B: [0.14, 0.12] }),
  "shake-head": (lt) => ({ headTilt: 0.12 * S2(lt * 11) * Math.exp(-lt * 0.6), F: [0.14, 0.12], B: [0.14, 0.12] }),
  "look-around": (lt) => ({ headTilt: 0.1 * S2(lt * 1.4), lean: 0.03 * S2(lt * 0.7), F: [0.16, 0.1], B: [0.16, 0.1] }),
  tiptoe: (lt) => ({ F: [0.9, -1.7], B: [0.9, -1.7], armsFront: true, jump: 8 + 2 * S2(lt * 4), lean: 0.08, headY: -2 }),
  "jumping-jacks": (lt) => {
    const k = Math.abs(S2(lt * 4.5));
    return { F: [0.2 + 2.6 * k, 0.1], B: [0.2 + 2.6 * k, 0.1], stance: k, jump: 16 * k };
  },
  disco: (lt) => {
    const up = S2(lt * 4) > 0;
    return { F: up ? [2.6, -0.05] : [0.6, 0.05], B: [0.62, -1.95], fistB: true, pointF: true, lean: up ? -0.05 : 0.05, headTilt: up ? -0.06 : 0.06, bodyY: 4 * Math.abs(S2(lt * 8)), LF: [up ? 0.2 : -0.1, -0.2], LB: [0, -0.1] };
  },
  robot: (lt) => {
    const st = Math.floor(lt * 2) % 4;
    const F = [[1.57, -1.57], [1.57, 0], [0.2, -1.57], [2.6, 0]][st];
    const B = [[0.2, -1.57], [1.57, -1.57], [1.57, 0], [0.2, 0]][st];
    return { F, B, headTilt: [0.1, -0.1, 0, 0.1][st], armsFront: true };
  },
  flex: (lt) => ({ F: [1.55, -2.1 - 0.15 * S2(lt * 6)], B: [1.55, -2.1 - 0.15 * S2(lt * 6 + 1)], fistF: true, fistB: true, chest: 1, lean: -0.04 }),
  cry: (lt) => ({ reach: { F: ["eye", 0, 0], B: ["eye", 0, 0] }, armsFront: true, headY: 6, jitter: 1.2, bodyY: 3 * Math.abs(S2(lt * 9)) }),
  sneeze: (lt) => {
    const a = lt < 0.9 ? easeO(lt / 0.9) : 0;
    const go = lt >= 0.9 ? Math.exp(-(lt - 0.9) * 6) : 0;
    return { lean: -0.12 * a + 0.22 * go, headTilt: -0.15 * a + 0.12 * go, reach: { F: ["mouth", 14, 0] }, armsFront: true, jump: 8 * go };
  },
  "laugh-hard": (lt) => ({ reach: { F: "belly", B: "belly" }, armsFront: true, lean: 0.15 + 0.06 * S2(lt * 14), bodyY: 4 * Math.abs(S2(lt * 14)), headTilt: 0.08 }),
  sigh: (lt) => ({ F: [0.06, 0], B: [0.06, 0], shrug: 6 * bump2(ramp(lt, 1.6)) - 4, headY: 6 * easeO(ramp(lt - 0.8, 0.8)), lean: 0.04 }),
  "thumbs-up": () => ({ F: [0.95, -1.6], B: [0.15, 0.1], fistF: true, headTilt: 0.06 }),
  bow: (lt) => {
    const k = bump2(ramp(lt, 1.6));
    return { lean: 0.55 * k, headY: 6 * k, F: [0.14 + 0.15 * k, -0.2 * k], B: [0.6 * k, -0.4 * k], armsFront: false };
  },
  curtsy: (lt) => {
    const k = bump2(ramp(lt, 1.4));
    return { bodyY: 26 * k, lean: 0.08 * k, F: [0.5 * k, 0.2], B: [0.5 * k, 0.2], LF: [-0.2 * k, -0.6 * k], LB: [0.3 * k, -0.7 * k], headY: 4 * k };
  },
  "wave-both": (lt) => ({ F: [2.6, -0.2 + 0.4 * S2(lt * 10)], B: [2.6, -0.2 + 0.4 * S2(lt * 10 + 1.5)], jump: 6 * Math.abs(S2(lt * 5)) }),
  "hands-behind": () => ({ F: [-0.3, 0.3], B: [-0.3, 0.3], chest: 0.3, lean: -0.02 }),
  "lean-on": () => ({ lean: -0.08, F: [0.62, -1.95], B: [0.2, 0.1], fistF: true, LF: [0.2, 0], LB: [-0.1, 0] }),
  sleep: (lt) => ({ lean: 0.04, headY: 9, headTilt: 0.1 + 0.02 * S2(lt * 1.3), F: [0.06, 0], B: [0.06, 0], bodyY: 2 * S2(lt * 1.3) }),
  "hide-behind": () => ({ bodyY: 40, lean: 0.1, F: [0.9, -1.8], B: [0.9, -1.8], armsFront: true, jitter: 1.5, legs: "stand" }),
  "scared-jump": (lt) => ({ F: [2.6, 0.3], B: [2.6, 0.3], jump: 90 * bump2(ramp(lt, 0.45)), squash: lt < 0.05 ? 0.15 : 0, jitter: 2 }),
  karate: (lt) => ({ F: [1.55, -0.05], B: [0.6, -2], fistB: true, LF: [0.9 * bump2(ramp(lt, 0.6)), -0.2], LB: [-0.05, -0.1], lean: -0.1 }),
  kick: (lt) => ({ LF: [1.2 * bump2(ramp(lt, 0.5)), -0.3 + 0.3 * bump2(ramp(lt, 0.5))], F: [0.6, -0.4], B: [1.1, 0.2], lean: -0.12 * bump2(ramp(lt, 0.5)) }),
  "tap-foot": (lt) => ({ tap: 1, F: [0.62, -1.95], B: [0.62, -1.95], fistF: true, fistB: true, headTilt: 0.04 * S2(lt * 2) }),
  pray: (lt) => ({ reach: { F: ["chest", -6, -16], B: ["chest", -6, -16] }, armsFront: true, headY: 5, headTilt: 0.03 * S2(lt * 0.9) }),
  toast: (lt) => ({ F: [1.9 + 0.1 * S2(lt * 3), -0.6], B: [0.15, 0.1], fistF: true, headTilt: -0.04 }),
  "comfort-reach": () => ({ F: [1.3, -0.35], B: [0.15, 0.1], lean: 0.08, headTilt: 0.08 }),
  "high-five": (lt) => ({ F: [2.35, -0.1], B: [0.15, 0.1], jump: 10 * bump2(ramp(lt - 0.3, 0.4)) }),
  shake: (lt) => ({ F: [1.2, -0.35 + 0.18 * S2(lt * 14)], B: [0.15, 0.1], lean: 0.05 }),
  reel: (lt) => {
    const k = Math.exp(-lt * 3);
    return { lean: -0.35 * k, headTilt: -0.25 * k, F: [1.2 * k + 0.2, 0.2], B: [1.4 * k + 0.2, 0.2], jitter: 2 * k };
  },
  "knocked-back": (lt) => ({ lean: -0.4 * Math.exp(-lt * 2), F: [2 * Math.exp(-lt * 2) + 0.3, 0.3], B: [2.2 * Math.exp(-lt * 2) + 0.3, 0.3], jump: 30 * bump2(ramp(lt, 0.4)) }),
  shiver: (lt) => ({ reach: { F: ["chest", 8, 4], B: ["chest", 8, 4] }, armsFront: true, jitter: 3, bodyY: 4, headY: 4, shrug: 6 + S2(lt * 40) }),
  // ── caricature poses (docs/CARICATURE.md): strong lines of action, sag and puff ──
  // slumped in an armchair: legs apart, arms dropped along the armrests, chin sunk
  slump: (lt) => ({ legs: "sit", lean: -0.16, bodyY: 10, F: [0.75, -0.15], B: [0.75, -0.15], headY: 7, headTilt: 0.05 + 0.01 * S2(lt * 0.9), LF: [1.45, -1.25], LB: [1.3, -1.45], shrug: -3, chest: 0 }),
  // on a kerb or step hugging the knees
  "hug-knees": (lt) => ({ legs: "floor", F: [0.9, -1.15], B: [0.9, -1.15], armsFront: true, lean: 0.12, headY: 5, headTilt: 0.04 * S2(lt * 0.7) }),
  "hands-in-pockets": (lt) => ({ reach: { F: ["hip", 4, 14], B: ["hip", 4, 14] }, shrug: 2, lean: -0.02, headTilt: 0.03 * S2(lt * 0.6), LF: [0.06, 0], LB: [-0.04, 0] }),
  // both hands thrown up: "what do you want from me?"
  exasperated: (lt) => {
    const p = easeO(ramp(lt, 0.3));
    return { F: [0.3 + 1.05 * p, 0.15 + 1.55 * p], B: [0.3 + 1.05 * p, 0.15 + 1.55 * p], lean: -0.05 * p, headTilt: -0.1 * p, shrug: 8 * p, jump: 6 * bump2(ramp(lt, 0.3)) };
  },
  // the accusing lean: whole body bent toward the target, finger out
  accuse: (lt) => ({ F: [1.55, 0.02 + 0.05 * S2(lt * 9)], B: [0.4, -1.8], fistB: true, pointF: true, lean: 0.16 + 0.02 * S2(lt * 9), headTilt: -0.04, LF: [0.35, -0.15], LB: [-0.25, -0.05], stance: 0.6 }),
  "collar-grab": (lt) => ({ F: [1.3, -0.55], B: [1.25, -0.6], fistF: true, fistB: true, armsFront: true, lean: 0.12, jitter: 0.6 + 0.4 * S2(lt * 12), headTilt: -0.04, chest: 0.4 }),
  // peeking from behind something: low, leaning sideways, fingers at the edge
  peek: (lt) => ({ bodyY: 30, lean: 0.2, rot: 0.08, F: [1.1, -1.4], B: [1, -1.6], armsFront: true, headTilt: 0.12 + 0.04 * S2(lt * 1.5), LF: [0.25, -0.5], LB: [0.1, -0.6] }),
  // flat on the floor, face down (after a fall)
  "face-down": (lt) => ({ legs: "lie", rot: Math.PI / 2, F: [2.8, 0.1], B: [2.6, 0.2], headY: 2, jitter: lt < 0.6 ? 1.5 : 0 }),
  // falling upside down
  "fall-upside-down": (lt) => {
    const p = easeIO(ramp(lt, 0.6));
    return { rot: Math.PI * p, jump: 90 * bump2(ramp(lt, 0.6)) + 330 * p, F: [2.4, 0.2 + 0.3 * S2(lt * 20)], B: [2.2, 0.3 + 0.3 * S2(lt * 20 + 1)], LF: [0.6 * S2(lt * 18), -0.5], LB: [-0.5 * S2(lt * 18), -0.4] };
  },
  // the deadpan: flat-footed, arms dead, perfectly still
  "deadpan-stare": () => ({ F: [0.04, 0], B: [0.04, 0], shrug: -2, headY: 1, lean: 0, LF: [0, 0], LB: [0, 0] }),
  // a tulip tea glass held by the rim, sipped with the pinky out
  "sip-tea": (lt) => {
    const sip = bump2(ramp(lt % 4 - 1.5, 1.2));
    return { reach: { F: ["mouth", 12 + 14 * (1 - sip), 10 + 26 * (1 - sip)] }, B: [0.45, -1.4], armsFront: true, headTilt: -0.05 * sip, chest: 0.15 };
  },
  "read-paper": (lt) => ({ reach: { F: ["chin", 22, -4], B: ["chin", -2, -4] }, armsFront: true, headY: 4, headTilt: 0.04 + 0.03 * S2(lt * 0.5), lean: 0.03 }),
  // the phone clamped between ear and a raised shoulder, both hands busy
  "phone-shoulder": (lt) => ({ reach: { F: "ear" }, B: [0.7, -1.4 + 0.1 * S2(lt * 6)], armsFront: true, shrug: 10, headTilt: 0.16, fistF: true }),
  // whispering behind a cupped hand, leaning in
  "cupped-whisper": (lt) => ({ reach: { F: ["mouth", 14, -2] }, B: [0.15, 0.1], lean: 0.1, headTilt: 0.1, bodyY: 4, shrug: 3 + 0 * lt }),
  // the eureka finger: one finger up beside the head
  eureka: (lt) => ({ F: [2.45, -0.75], B: [0.15, 0.1], pointF: true, jump: 8 * bump2(ramp(lt, 0.25)), headTilt: -0.05, chest: 0.4 }),
  // pear-shaped puffing up: belly out, hands on it
  "belly-out": (lt) => ({ reach: { F: ["belly", 6, -4], B: ["belly", 6, 4] }, armsFront: true, lean: -0.1, chest: 0.6, headTilt: -0.04 + 0.02 * S2(lt * 1.2) }),
  // pleading bow with clasped hands
  plead: (lt) => ({ reach: { F: ["chest", 14, -6], B: ["chest", 14, -6] }, armsFront: true, lean: 0.18, headY: -2, bodyY: 6, jitter: 0.6, headTilt: 0.05 * S2(lt * 3) }),
  // recoiling in shock: leaning back, hands up and open
  recoil: (lt) => {
    const p = easeO(ramp(lt, 0.2));
    return { lean: -0.2 * p, F: [0.25 + 1.1 * p, 0.15 + 1.5 * p], B: [0.25 + 1 * p, 0.15 + 1.6 * p], LF: [0.35 * p, -0.1], LB: [-0.2 * p, -0.25], jump: 14 * bump2(ramp(lt, 0.25)), jitter: 1.2 };
  },
  // ── from the second pass through the caricatures ──
  // windmilling panic: arms flung everywhere, hopping
  "panic-flail": (lt) => ({ F: [2.2 + 0.9 * S2(lt * 13), 0.4 * S2(lt * 17)], B: [2 + 0.9 * S2(lt * 13 + 2), 0.4 * S2(lt * 15 + 1)], jump: 14 * Math.abs(S2(lt * 9)), lean: 0.08 * S2(lt * 6), headTilt: 0.12 * S2(lt * 11), LF: [0.5 * S2(lt * 9), -0.6], LB: [-0.4 * S2(lt * 9), -0.4], jitter: 1.5 }),
  // lounging: hands laced behind the head, leaning back
  "hands-behind-head": (lt) => ({ reach: { F: ["head", -18, 4], B: ["head", -18, 4] }, lean: -0.1, chest: 0.4, headTilt: -0.06 + 0.02 * S2(lt * 0.8) }),
  // sitting stiff and formal, hands flat on the knees
  "hands-on-knees": () => ({ legs: "sit", F: [0.45, -0.85], B: [0.45, -0.85], armsFront: true, lean: 0, chest: 0.2, headY: 0 }),
  // bent double, hands on the knees, searching the floor
  // the Tex Avery "take" (docs/CARTOON.md): a dip of anticipation, then a snap to an extreme stretched pose a
  // frame or two long, a vibrating hold, and a settle
  take: (lt) => take(lt),
  // the double take: a casual glance and nod… then it registers
  "double-take": (lt) => lt < 0.75 ? { headTilt: 0.12 * bump2(ramp(lt, 0.6)), headY: 3 * bump2(ramp(lt, 0.6)) } : take(lt - 0.75),
  // picking up / putting down: anticipation (a small rise), a bend from the hips with bent knees, a beat at
  // contact, then up again with the weight (docs/CARTOON.md)
  "pick-up": (lt) => {
    const d = easeIO(ramp(lt - 0.08, 0.42)) * (1 - easeIO(ramp(lt - 0.75, 0.45)));
    const up = bump2(ramp(lt, 0.12)) * 0.06;
    return { lean: 0.72 * d - up, bodyY: 18 * d, LF: [0.32 * d, -0.62 * d], LB: [0.22 * d, -0.68 * d], F: [0.5 + 0.3 * d, -0.15], B: [0.2 + 0.25 * d, -0.25 * d], headTilt: 0.08 * d, headY: -4 * d, armsFront: false };
  },
  "put-down": (lt) => {
    const d = easeIO(ramp(lt, 0.45)) * (1 - easeIO(ramp(lt - 0.7, 0.45)));
    return { lean: 0.7 * d, bodyY: 18 * d, LF: [0.32 * d, -0.62 * d], LB: [0.22 * d, -0.68 * d], F: [0.5 + 0.3 * d, -0.15], B: [0.2 + 0.25 * d, -0.25 * d], headTilt: 0.06 * d, headY: -4 * d };
  },
  "search-floor": (lt) => ({ lean: 0.62, F: [0.35, -0.15], B: [0.35, -0.15], armsFront: true, headY: -6, headTilt: 0.08 * S2(lt * 1.2), LF: [0.25, -0.35], LB: [0.15, -0.4], bodyY: 14 }),
  // on all fours
  crawl: (lt) => ({ legs: "kneel", lean: 1.35, bodyY: 18, F: [-1.15 + 0.25 * S2(lt * 5), 0.05], B: [-1.15 - 0.25 * S2(lt * 5), 0.05], headY: -10, headTilt: -0.25 }),
  // straining to lift something heavy: squat, bowed legs, trembling
  "strain-lift": (lt) => {
    const up = easeIO(ramp(lt % 3, 1.4)) * (lt % 3 < 2.2 ? 1 : 0);
    return { bodyY: 46 - 30 * up, lean: 0.15 - 0.1 * up, F: [0.55, -0.1], B: [0.55, -0.1], armsFront: true, fistF: true, fistB: true, LF: [0.75 - 0.4 * up, -1.3 + 0.7 * up], LB: [0.45 - 0.3 * up, -1.2 + 0.7 * up], stance: 0.9, jitter: 2.2, headTilt: -0.08 };
  },
  "chin-stroke": (lt) => ({ reach: { F: ["chin", 6, 4 + 3 * S2(lt * 4)] }, B: [0.45, -1.5], armsFront: true, headTilt: -0.05, lean: -0.02 }),
  // the bored cheek on a fist (elbow on a table)
  "cheek-on-fist": (lt) => ({ reach: { F: ["cheek", 4, 10] }, B: [0.5, -1.3], fistF: true, armsFront: true, lean: 0.12, headTilt: 0.12 + 0.01 * S2(lt * 0.6), headY: 3, shrug: 4 }),
  // peering forward, squinting at something small
  peer: (lt) => ({ lean: 0.22, headY: -2, headTilt: -0.04 + 0.03 * S2(lt * 1.6), reach: { F: ["brow", 14, 2] }, B: [-0.2, 0.3], LF: [0.15, -0.1], LB: [-0.1, -0.1] }),
  // head down on the table, arms folded under it (asleep, or despair)
  "head-on-table": (lt) => ({ legs: "sit", lean: 0.95, headY: 6, F: [0.35, -1.25], B: [0.3, -1.3], armsFront: true, bodyY: 2 * S2(lt * 1.3) }),
  // an elbow in the ribs, twice: "eh? eh?"
  nudge: (lt) => {
    const j = Math.max(0, S2(lt * 9)) * (lt < 1.4 ? 1 : 0);
    return { F: [0.75 + 0.55 * j, -2.1 + 0.3 * j], B: [0.15, 0.1], fistF: true, lean: 0.06 * j, headTilt: 0.1, shrug: 4 * j };
  },
  // sprawled on the sofa: one arm on the backrest, legs out
  sprawl: (lt) => ({ legs: "sit", lean: -0.22, bodyY: 14, F: [2, -0.6], B: [1.9, 0.1], LF: [1.6, -0.6], LB: [1.5, -0.4], headTilt: -0.08 + 0.02 * S2(lt * 0.7), chest: 0.1 })
};
var POSES2 = { ...POSES, ...EXTRA };
var POSE_NAMES = [...Object.keys(KUKLA_NAMES), ...Object.keys(EXTRA)];
var GAITS = ["walk", "run", "jog", "sneak", "tiptoe", "march", "skip", "limp", "strut", "stagger", "waddle", "shuffle", "hop"];
var TRAIT_NAMES = {
  naive: "saf",
  lucky: "sansli",
  "kind-hearted": "iyi-kalpli",
  confused: "saskin",
  greedy: "hirsli",
  sly: "kurnaz",
  "show-off": "gosterisci",
  flustered: "telasli",
  sneaky: "sinsi",
  "cool-headed": "sogukkanli",
  stingy: "cimri",
  bossy: "otoriter",
  loud: "gurultulu",
  "secretly-kind": "aslinda-sefkatli",
  clever: "zeki",
  romantic: "romantik",
  brave: "cesur",
  dandy: "zuppe",
  coward: "korkak",
  conceited: "kendini-begenmis",
  pompous: "makam-duskunu",
  sleepy: "uykucu",
  glutton: "obur",
  fussy: "titiz",
  anxious: "evhamli",
  flatterer: "dalkavuk",
  big: "iri",
  loyal: "sadik",
  tough: "kabadayi",
  gossip: "dedikoducu",
  cheerful: "neseli",
  protective: "koruyucu",
  haggler: "pazarlikci",
  chatty: "konuskan",
  calm: "sakin",
  curious: "merakli",
  shy: "utangac",
  "short-tempered": "asabi"
};
var TRAITS2 = Object.keys(TRAIT_NAMES);
var NEUTRAL_BODY = { pose: null, talk: null, settle: null, mods: { ...MOD0 }, family: null, level: 0 };

// src/engine/puppet.ts
var GESTURE_LIST = ["rest", "point", "up", "shrug", "wave", "think", "hold", "cheer", "facepalm", "type", "scared", "fist", "bow", "hug", "clap", "salute"];
var MOOD_LIST = ["neutral", "happy", "angry", "surprised", "sad", "smug", "scared"];
var HAT_KINDS = ["beanie", "wreath", "headband", "cap", "fedora", "headlamp", "cloth", "crown", "tiara", "tophat", "party", "wizard", "cowboy", "chef", "fez", "turban", "helmet", "spacehelmet", "hood", "knight", "bandana", "strawhat", "pilot", "witch", "bone", "antenna", "selenite", "sailor"];
var TOP_KINDS = ["puffer", "toga", "robe", "coat", "blouse", "hoodie", "tweed", "shirt", "tunic", "labcoat", "tee", "vest", "suit", "fur", "spacesuit", "armor", "uniform", "overalls", "kaftan", "dress", "selenite", "sailor", "starrobe"];

// src/core/util.ts
var counter3 = 0;
var uid = (p = "x") => `${p}${Date.now().toString(36).slice(-4)}${(counter3++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// src/core/looks.ts
var SKINS = ["#f6dcc6", "#f3d0b5", "#efc8a4", "#e0ac7e", "#c98c5a", "#b07246", "#8d5524", "#5c3a21", "#9fd8a8", "#a9b8ff"];
var HAIRS = ["short", "fringe", "side", "slick", "bob", "bun", "curly", "wild", "bald"];
var HAIR_COLORS = ["#1b1310", "#3b2a1e", "#6b3e26", "#a0522d", "#d9b25f", "#e8e8ee", "#8a8a94", "#c0392b", "#ff5d8f", "#5fd4ff"];
var BEARDS = ["none", "stubble", "mustache", "goatee", "full", "mutton", "long"];
var HATS = ["none", ...HAT_KINDS];
var TOPS = [...TOP_KINDS];
var BOTTOMS = ["pants", "skirt", "robe", "shorts"];
var GLASSES = ["none", "round", "square", "cat"];
var NOSES = ["auto", "button", "round", "big", "pointy", "hook", "potato", "long", "beak"];
var EYE_STYLES = ["normal", "heavy", "dots", "big", "touching"];
var MOUTHS2 = ["smile", "flat", "smirk", "grin"];
var COLORS = ["#c81d25", "#ef476f", "#ff7a2b", "#ffb703", "#f4d35e", "#06d6a0", "#16b3a3", "#3d8c40", "#5fd4ff", "#3d5a80", "#2b3a5c", "#8338ec", "#7b2d3b", "#8a5a3a", "#5a4a3a", "#2a2d34", "#f4f1ea", "#c9ccd6", "#1d1d2b", "#d9b25f"];
var DEFAULT_LOOK = {
  skin: "#efc8a4",
  hair: "short",
  hairColor: "#3b2a1e",
  beard: "none",
  hat: "none",
  hatColor: "#c81d25",
  glasses: "none",
  top: "shirt",
  topColor: "#3d5a80",
  accent: "#f4f1ea",
  print: "",
  bottom: "pants",
  bottomColor: "#2a2d34",
  shoes: "#1d1d2b",
  height: 1,
  build: 1,
  head: 1,
  mouth: "smile",
  holding: ""
};
var DEFAULT_VOICE = { kind: "babble", pitch: 150, rate: 1, voice: "", style: "" };
var L = (o) => ({ ...DEFAULT_LOOK, ...o });
var V = (o) => ({ ...DEFAULT_VOICE, ...o });
var PRESETS = [
  {
    name: "Saf Bekir",
    tag: "the naive hero",
    color: "#5fd4ff",
    bio: "a kind, naive village boy in the big city; honest to a fault, clumsy, brave when it counts",
    look: L({ hair: "fringe", hairColor: "#3b2a1e", top: "vest", topColor: "#7b2d3b", accent: "#f4f1ea", bottomColor: "#5a4a3a", hat: "cap", hatColor: "#5a4a3a", mouth: "grin" }),
    voice: V({ pitch: 165, rate: 1.05, voice: "Puck", style: "a cheerful, naive young man, a little breathless" })
  },
  {
    name: "Zengin R\u0131fat",
    tag: "the rich villain",
    color: "#ff7b7b",
    bio: "a scheming rich businessman, smug, greedy, twirls his moustache",
    look: L({ hair: "slick", hairColor: "#1b1310", beard: "mustache", top: "suit", topColor: "#2a2d34", accent: "#f4f1ea", print: "#c81d25", bottomColor: "#1d1d2b", mouth: "smirk", build: 1.2, hat: "fedora", hatColor: "#2a2d34" }),
    voice: V({ pitch: 105, rate: 0.92, voice: "Algenib", style: "a smug, scheming rich villain, slow and oily" })
  },
  {
    name: "Nazl\u0131",
    tag: "the lovely lead",
    color: "#ff9ec2",
    bio: "a bright, stubborn young woman who sees through everyone",
    look: L({ hair: "bob", hairColor: "#1b1310", top: "dress", topColor: "#ef476f", accent: "#f4f1ea", bottom: "skirt", bottomColor: "#ef476f", shoes: "#c81d25", mouth: "smile", build: 0.9 }),
    voice: V({ pitch: 250, rate: 1, voice: "Leda", style: "a bright, witty young woman" })
  },
  {
    name: "Hayriye Nine",
    tag: "the wise grandma",
    color: "#ffcf3f",
    bio: "a sharp-tongued, loving grandmother who has seen it all",
    look: L({ hair: "bun", hairColor: "#e8e8ee", top: "blouse", topColor: "#8a5a3a", bottom: "skirt", bottomColor: "#3d8c40", glasses: "round", height: 0.9, hat: "cloth", hatColor: "#f4f1ea" }),
    voice: V({ pitch: 215, rate: 0.85, voice: "Sulafat", style: "a warm, sharp-tongued old grandmother" })
  },
  {
    name: "Kabaday\u0131 Hasan",
    tag: "the tough guy",
    color: "#ffb703",
    bio: "a big-hearted neighbourhood tough with a short fuse",
    look: L({ hair: "short", hairColor: "#1b1310", beard: "stubble", top: "tee", topColor: "#1d1d2b", accent: "#f4f1ea", build: 1.3, mouth: "flat", hat: "fedora", hatColor: "#5a4a3a" }),
    voice: V({ pitch: 95, rate: 0.95, voice: "Fenrir", style: "a gruff neighbourhood tough" })
  },
  {
    name: "Profes\xF6r Cemal",
    tag: "the absent-minded scientist",
    color: "#c3a6ff",
    bio: "an inventor who forgets everything except formulas",
    look: L({ hair: "wild", hairColor: "#e8e8ee", top: "labcoat", topColor: "#f4f1ea", accent: "#c9ccd6", glasses: "round", beard: "goatee" }),
    voice: V({ pitch: 140, rate: 1.15, voice: "Charon", style: "an excitable absent-minded professor" })
  },
  {
    name: "Sir Gareth",
    tag: "the knight",
    color: "#9ad7ff",
    bio: "a noble but vain knight",
    look: L({ hair: "side", hairColor: "#d9b25f", top: "armor", topColor: "#2b3a5c", accent: "#d9b25f", bottomColor: "#5a4a3a", beard: "full" }),
    voice: V({ pitch: 120, rate: 0.95, voice: "Orus", style: "a pompous medieval knight" })
  },
  {
    name: "Grok",
    tag: "the caveman",
    color: "#e0ac7e",
    bio: "a stone-age family man who loves his dinosaur",
    look: L({ hair: "wild", hairColor: "#1b1310", top: "fur", topColor: "#d9913b", accent: "#5a3320", bottom: "shorts", bottomColor: "#d9913b", shoes: "#8a5a3a", beard: "stubble", build: 1.25, hat: "bone", hatColor: "#f4f1ea" }),
    voice: V({ pitch: 100, rate: 1, voice: "Fenrir", style: "a loud, warm-hearted caveman" })
  },
  {
    name: "Captain Nova",
    tag: "the astronaut",
    color: "#6ef0a8",
    bio: "a calm, fearless space pilot",
    look: L({ hair: "bob", hairColor: "#c0392b", top: "spacesuit", topColor: "#f4f1ea", accent: "#ff7a2b", bottomColor: "#f4f1ea", shoes: "#c9ccd6", hat: "spacehelmet", hatColor: "#c9ccd6" }),
    voice: V({ pitch: 210, rate: 1, voice: "Leda", style: "a calm, confident astronaut on the radio" })
  },
  {
    name: "Sergeant Kaya",
    tag: "the soldier",
    color: "#80ed99",
    bio: "a tired, brave sergeant who keeps his squad laughing",
    look: L({ top: "uniform", topColor: "#5d6b3a", accent: "#d9b25f", bottomColor: "#4a5530", shoes: "#2a2118", hat: "helmet", hatColor: "#5d6b3a", beard: "stubble" }),
    voice: V({ pitch: 115, rate: 1, voice: "Orus", style: "a weary but warm army sergeant" })
  },
  {
    name: "Farmer Ay\u015Fe",
    tag: "the farmer",
    color: "#f4d35e",
    bio: "a hard-working farmer who talks to her cows",
    look: L({ hair: "bun", hairColor: "#6b3e26", top: "overalls", topColor: "#3d5a80", accent: "#ef476f", bottomColor: "#3d5a80", hat: "strawhat", hatColor: "#e3c16f", shoes: "#5a3a24" }),
    voice: V({ pitch: 230, rate: 1, voice: "Leda", style: "a cheerful country farmer" })
  },
  {
    name: "Ghost of Selim",
    tag: "the ghost",
    color: "#dfe8ff",
    bio: "a lonely old ghost who just wants company",
    look: L({ skin: "#dfe8ff", hair: "side", hairColor: "#c9ccd6", top: "kaftan", topColor: "#c9d6ee", accent: "#9aa6c9", bottom: "robe", bottomColor: "#c9d6ee", shoes: "#c9d6ee", hat: "fez", hatColor: "#9aa6c9", ghost: true, beard: "long" }),
    voice: V({ pitch: 130, rate: 0.8, voice: "Charon", style: "a hollow, sad, echoing ghost" })
  },
  {
    name: "Sultan Ahmet",
    tag: "the sultan",
    color: "#d9b25f",
    bio: "a whimsical, spoiled sultan",
    look: L({ top: "kaftan", topColor: "#7b2d3b", accent: "#d9b25f", bottom: "robe", bottomColor: "#7b2d3b", hat: "turban", hatColor: "#f4f1ea", beard: "full", hairColor: "#1b1310", build: 1.2 }),
    voice: V({ pitch: 115, rate: 0.9, voice: "Algenib", style: "a whimsical, pompous sultan" })
  },
  {
    name: "Pilot Leyla",
    tag: "the pilot",
    color: "#5fd4ff",
    bio: "a dashing pilot with nerves of steel",
    look: L({ hair: "bob", hairColor: "#3b2a1e", top: "coat", topColor: "#8a5a3a", accent: "#f4f1ea", hat: "pilot", hatColor: "#6b3e26", bottomColor: "#5a4a3a" }),
    voice: V({ pitch: 225, rate: 1.05, voice: "Leda", style: "a dashing, confident pilot" })
  }
];
function randomLook(seed = Math.random()) {
  let s = Math.floor(seed * 1e9) | 0;
  const r = () => (s = s * 1103515245 + 12345 & 2147483647) / 2147483647;
  const pick = (a) => a[Math.floor(r() * a.length)];
  return L({
    skin: pick(SKINS.slice(0, 8)),
    hair: pick(HAIRS),
    hairColor: pick(HAIR_COLORS),
    beard: r() < 0.6 ? "none" : pick(BEARDS),
    hat: r() < 0.6 ? "none" : pick(["cap", "fedora", "beanie", "fez", "strawhat", "cowboy", "tophat", "bandana"]),
    hatColor: pick(COLORS),
    glasses: r() < 0.7 ? "none" : pick(GLASSES),
    top: pick(["shirt", "tee", "hoodie", "vest", "coat", "suit", "blouse", "puffer", "dress"]),
    topColor: pick(COLORS),
    accent: pick(COLORS),
    bottom: pick(["pants", "pants", "skirt", "shorts"]),
    bottomColor: pick(COLORS),
    shoes: pick(["#1d1d2b", "#5a3a24", "#c81d25", "#f4f1ea"]),
    height: 0.88 + r() * 0.24,
    build: 0.85 + r() * 0.4,
    head: 0.92 + r() * 0.2,
    mouth: pick(MOUTHS2)
  });
}
var REST_FACES = [
  { id: "plain", eyes: "normal", label: "plain" },
  { id: "sleepy", eyes: "heavy", label: "sleepy" },
  { id: "deadpan", eyes: "heavy", label: "deadpan" },
  { id: "worried", eyes: "normal", label: "worried" },
  { id: "dreamy", eyes: "normal", label: "dreamy" },
  { id: "cocky", eyes: "normal", label: "cocky" },
  { id: "sly", eyes: "normal", label: "sly" },
  { id: "grumpy", eyes: "normal", label: "grumpy" },
  { id: "wide-eyed", eyes: "big", label: "wide-eyed" },
  { id: "beady", eyes: "dots", label: "beady" },
  { id: "goggle", eyes: "touching", label: "goggle-eyed" }
];
var ACCESSORIES = [
  { id: "tie", slot: "neck", label: "tie" },
  { id: "bowtie", slot: "neck", label: "bow tie" },
  { id: "scarf", slot: "neck", label: "scarf" },
  { id: "necklace", slot: "neck", label: "necklace" },
  { id: "medal", slot: "chest", label: "medal" },
  { id: "badge", slot: "chest", label: "badge" },
  { id: "flower", slot: "chest", label: "lapel flower" },
  { id: "pen", slot: "chest", label: "pen in pocket" },
  { id: "suspenders", slot: "chest", label: "braces" },
  { id: "strap", slot: "chest", label: "bag strap" },
  { id: "monocle", slot: "face", label: "monocle" },
  { id: "eyepatch", slot: "face", label: "eyepatch" },
  { id: "mask", slot: "face", label: "face mask" },
  { id: "mole", slot: "face", label: "mole" },
  { id: "scar", slot: "face", label: "scar" },
  { id: "freckles", slot: "face", label: "freckles" },
  { id: "earrings", slot: "ears", label: "earrings" }
];
function characterFromCode(code, id) {
  const m = /YSC1:([A-Za-z0-9+/=]+)/.exec(code.trim());
  if (!m) throw new Error("That is not a character code (it starts with YSC1:).");
  const bin = atob(m[1]);
  const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
  if (!d.look || typeof d.look !== "object") throw new Error("The code has no look in it.");
  return {
    id,
    name: String(d.name ?? "Guest").slice(0, 40),
    color: typeof d.color === "string" ? d.color : "#5fd4ff",
    bio: String(d.bio ?? ""),
    traits: Array.isArray(d.traits) ? d.traits.filter((x) => typeof x === "string") : [],
    expressive: typeof d.expressive === "number" ? d.expressive : void 0,
    look: { ...DEFAULT_LOOK, ...d.look },
    voice: { ...DEFAULT_VOICE, ...d.voice ?? {} }
  };
}
function lookFromSpec(o) {
  const look = {};
  const warnings = [];
  const W17 = look;
  const COLOR = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
  const ENUMS = {
    hair: HAIRS,
    beard: BEARDS,
    hat: HATS,
    glasses: GLASSES,
    top: TOPS,
    bottom: BOTTOMS,
    mouth: MOUTHS2,
    nose: NOSES,
    eyes: EYE_STYLES,
    rest: REST_FACES.map((r) => r.id)
  };
  const NUMS = { height: [0.8, 1.2], build: [0.8, 1.3], head: [0.85, 1.25], noseSize: [0.8, 2], belly: [0, 1], shoeSize: [1, 1.6] };
  const COLORS_ = ["skin", "hairColor", "hatColor", "topColor", "accent", "bottomColor", "shoes"];
  for (const [k, v] of Object.entries(o)) {
    if (ENUMS[k]) {
      if (typeof v === "string" && ENUMS[k].includes(v)) W17[k] = v;
      else warnings.push(`look.${k}: "${String(v)}" is not one of ${ENUMS[k].join(", ")}`);
    } else if (NUMS[k]) {
      const [lo, hi] = NUMS[k];
      if (typeof v === "number" && isFinite(v)) W17[k] = Math.max(lo, Math.min(hi, v));
      else warnings.push(`look.${k}: a number from ${lo} to ${hi}`);
    } else if (COLORS_.includes(k)) {
      if (typeof v === "string" && COLOR.test(v)) W17[k] = v;
      else warnings.push(`look.${k}: a colour like "#c81d25"`);
    } else if (k === "acc") {
      const ok = ACCESSORIES.map((a) => a.id);
      const list2 = (Array.isArray(v) ? v : [v]).filter((x) => typeof x === "string");
      for (const x of list2) if (!ok.includes(x)) warnings.push(`look.acc: "${x}" is not one of ${ok.join(", ")}`);
      W17.acc = list2.filter((x) => ok.includes(x));
    } else if (k === "print" && typeof v === "string") W17.print = v.slice(0, 12);
    else if (k === "holding" && typeof v === "string") {
      if (!v || propById(v)) W17.holding = v;
      else warnings.push(`look.holding: no object "${v}" in the library`);
    } else if (k === "ghost") W17.ghost = !!v;
    else warnings.push(`look.${k}: not a look field`);
  }
  return { look, warnings };
}

// src/core/extras.ts
var EXTRA2 = "extra:";
function spanOf(role, facing) {
  if (role === "pair") return [-70, 165 + 70];
  if (role === "typist") return facing > 0 ? [-70, 190] : [-190, 70];
  return [-70, 70];
}
var SET_MIX = {
  city: "street",
  istanbul: "street",
  bazaar: "street",
  harbor: "street",
  medieval: "street",
  rooftops: "street",
  farm: "street",
  skycity: "street",
  ww2: "street",
  stoneage: "street",
  kahvehane: "cafe",
  apartment: "indoor",
  observatory: "indoor",
  foundry: "office",
  haunted: "indoor",
  airplane: "cafe",
  selenitepalace: "indoor",
  mars: "street",
  moon: "street",
  mooncave: "indoor",
  space: "indoor",
  seabed: "street"
};
var ROLES = {
  auto: [],
  street: [["walker", 5], ["loiter", 2], ["pair", 2], ["sitter", 1]],
  indoor: [["loiter", 3], ["pair", 3], ["sitter", 2], ["walker", 1]],
  cafe: [["sitter", 5], ["pair", 2], ["loiter", 1], ["walker", 1]],
  office: [["typist", 4], ["walker", 2], ["pair", 2], ["loiter", 1]]
};
var MUTED = ["#6b6f7a", "#7a6a58", "#5a6b5e", "#6e5a6b", "#8a7f6a", "#4f5f73", "#7d6e5d", "#5e5a50", "#8c8478", "#68707a"];
function rng3(seed) {
  let s = seed * 2654435761 >>> 0 || 1;
  return () => (s = Math.imul(s ^ s >>> 15, 2246822519) + 1013904223 >>> 0) / 4294967296;
}
function crowdOf(scene, width) {
  const cr = scene.crowd;
  const n = Math.max(0, Math.min(14, Math.round(cr?.n ?? 0)));
  if (!n) return [];
  const r = rng3(7919 + (cr.seed ?? 0) * 104729 + scene.id.length * 31);
  const mix2 = cr.mix && cr.mix !== "auto" ? cr.mix : SET_MIX[scene.set] ?? "indoor";
  const roles = ROLES[mix2];
  const total = roles.reduce((a, [, w]) => a + w, 0);
  const quota = roles.map(([k, w]) => ({ k, q: n * w / total }));
  const plan = [];
  for (const x of quota) for (let j = 0; j < Math.floor(x.q); j++) plan.push(x.k);
  for (const x of [...quota].sort((p1, p2) => p2.q % 1 - p1.q % 1)) if (plan.length < n) plan.push(x.k);
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  let pi = 0;
  const pickRole = () => plan[pi++] ?? roles[0][0];
  const out = [];
  const lo = 160;
  const hi = width - 160;
  const used = [];
  const GAP = 60;
  const spot = (span) => {
    for (let k = 0; k < 40; k++) {
      const x = lo - span[0] + r() * Math.max(0, hi - lo - (span[1] - span[0]));
      const iv = [x + span[0], x + span[1]];
      if (used.every(([u0, u1]) => iv[1] + GAP < u0 || iv[0] - GAP > u1)) {
        used.push(iv);
        return x;
      }
    }
    return null;
  };
  let lane = 0;
  const walker = (i) => {
    const from = r() < 0.5 ? -1 : 1;
    const z = 300 + lane++ % 7 * 12;
    out.push(mk(i, "walker", from < 0 ? -260 : width + 260, z, from < 0 ? 1 : -1));
  };
  const mk = (i, role, x, z, facing) => {
    const look = randomLook(r());
    look.topColor = MUTED[Math.floor(r() * MUTED.length)];
    look.bottomColor = MUTED[Math.floor(r() * MUTED.length)];
    look.hatColor = MUTED[Math.floor(r() * MUTED.length)];
    if (role === "sitter" && r() < 0.3) look.holding = "tea-glass";
    const id = `${EXTRA2}${i}`;
    const props = [];
    if (role === "sitter") props.push({ obj: mix2 === "cafe" ? "plastic-stool" : mix2 === "street" ? "bench" : "chair", dx: -facing * 6, dz: 6 });
    if (role === "typist") props.push({ obj: "chair", dx: -facing * 8, dz: 6 }, { obj: "desk", dx: facing * 105, dz: -14 }, { obj: "typewriter", dx: facing * 95, dz: -16, y: 150 });
    return { id, role, x, z, facing, props, ch: { id, name: "extra", color: "#888", bio: "", look, voice: { ...DEFAULT_VOICE }, traits: [] } };
  };
  for (let i = 0; i < n; i++) {
    const role = pickRole();
    const z = 390 + r() * 170;
    if (role === "pair" && i + 1 < n) {
      const x2 = spot(spanOf("pair", 1));
      if (x2 === null) {
        walker(i);
        continue;
      }
      const a = mk(i, "pair", x2, z, 1);
      const b = mk(i + 1, "pair", x2 + 165, z + 6, -1);
      a.mate = b.id;
      b.mate = a.id;
      out.push(a, b);
      i++;
      continue;
    }
    if (role === "walker") {
      walker(i);
      continue;
    }
    const ro = role === "pair" ? "loiter" : role;
    const facing = r() < 0.5 ? 1 : -1;
    const x = spot(spanOf(ro, facing));
    if (x === null) walker(i);
    else out.push(mk(i, ro, x, z, facing));
  }
  for (const e of out) {
    if (e.role !== "loiter") continue;
    const [s0, s1] = spanOf("loiter", e.facing);
    const left = Math.max(120, ...used.filter(([, u1]) => u1 < e.x + s0).map(([, u1]) => u1 + GAP - s0));
    const right = Math.min(width - 120, ...used.filter(([u0]) => u0 > e.x + s1).map(([u0]) => u0 - GAP - s1));
    e.room = [Math.min(e.x, left), Math.max(e.x, right)];
  }
  return out;
}
var IDLE = ["look-around", "phone", "arms-crossed", "hands-in-pockets", "chin-stroke", "scratch-head", "stretch", "hands-behind", "tap-foot", "rest", "rest"];
var SIT = ["read-paper", "sip-tea", "prayer-beads", "cheek-on-fist", "think", "rest", "rest", "yawn"];
var TALK = ["talk", "explain", "talk", "open-arms", "shrug", "wag-finger"];
var LISTEN = ["nod", "rest", "arms-crossed", "chin-stroke", "hands-on-hips"];
var LAUGH = ["belly-laugh", "slap-knee", "giggle"];
var MOODS = [null, null, "content", "bored", "thoughtful", "slightly happy"];
function crowdTracks(scene, extras, dur, width, speed) {
  const out = /* @__PURE__ */ new Map();
  const r = rng3(31337 + (scene.crowd?.seed ?? 0) * 7 + extras.length);
  const track = (e) => ({
    who: e.id,
    x0: e.x,
    z0: e.z,
    legs: [],
    facing: [{ t: 0, v: e.facing }],
    mood: [{ t: 0, v: "neutral" }],
    gesture: [{ t: 0, v: "rest" }],
    visible: [{ t: 0, v: true }],
    sit: [{ t: 0, v: e.role === "sitter" || e.role === "typist" }],
    talks: [],
    expr: [{ t: 0, v: null }],
    pose: [{ t: 0, v: null }]
  });
  const between = (a, b) => a + r() * (b - a);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  for (const e of extras) out.set(e.id, track(e));
  const stations = extras.filter((e) => e.role !== "walker").map((e) => e.x);
  for (const e of extras) {
    const tr = out.get(e.id);
    let t = between(0, 2.5);
    if (e.role === "walker") {
      let x2 = e.x;
      let dir = e.facing;
      while (t < dur + 2) {
        const gait = pick(["walk", "walk", "walk", "shuffle", "strut", "jog", "march"]);
        const v = speed * ({ shuffle: 0.45, strut: 0.85, jog: 1.6, march: 1.05 }[gait] ?? 1);
        const x1 = dir > 0 ? width + 260 : -260;
        tr.facing.push({ t, v: dir });
        if (r() < 0.45) {
          let xm = between(width * 0.25, width * 0.75);
          for (let k = 0; k < 12 && stations.some((sx) => Math.abs(sx - xm) < 120); k++) xm = between(width * 0.2, width * 0.8);
          const d1 = Math.abs(xm - x2) / v;
          tr.legs.push({ t0: t, t1: t + d1, x0: x2, z0: e.z, x1: xm, z1: e.z, run: false, y0: 0, y1: 0, hop: 0, gait });
          t += d1;
          const hold = between(1.5, 3.5);
          tr.pose.push({ t, v: { name: pick(["look-around", "phone", "scratch-head", "wave"]) } }, { t: t + hold, v: null });
          t += hold;
          x2 = xm;
        }
        const d = Math.abs(x1 - x2) / v;
        tr.legs.push({ t0: t, t1: t + d, x0: x2, z0: e.z, x1, z1: e.z, run: gait === "jog", y0: 0, y1: 0, hop: 0, gait });
        t += d;
        x2 = x1;
        t += between(2, 7);
        dir = dir * -1;
      }
      continue;
    }
    if (e.role === "pair") {
      if (!e.mate || e.facing < 0) continue;
      const mate = out.get(e.mate);
      let speaker = r() < 0.5;
      while (t < dur) {
        const d = between(2.2, 4.2);
        const [s, l] = speaker ? [tr, mate] : [mate, tr];
        if (r() < 0.15) {
          const lp = pick(LAUGH);
          s.pose.push({ t, v: { name: lp } });
          l.pose.push({ t: t + 0.25, v: { name: pick(LAUGH) } });
          s.expr.push({ t, v: "laughing" });
          l.expr.push({ t: t + 0.25, v: "laughing" });
        } else {
          s.pose.push({ t, v: { name: pick(TALK) } });
          l.pose.push({ t, v: { name: pick(LISTEN) } });
          s.expr.push({ t, v: pick(MOODS) });
          l.expr.push({ t, v: pick(MOODS) });
        }
        t += d;
        speaker = !speaker;
      }
      continue;
    }
    const list2 = e.role === "sitter" ? SIT : e.role === "typist" ? ["type", "type", "type", "cheek-on-fist", "sip-tea", "stretch", "scratch-head"] : IDLE;
    let x = e.x;
    while (t < dur) {
      const d = e.role === "typist" ? between(4, 9) : between(3, 7);
      tr.pose.push({ t, v: { name: pick(list2) } });
      if (r() < 0.25) tr.expr.push({ t, v: pick(MOODS) });
      t += d;
      if (e.role === "loiter" && r() < 0.35) {
        const [r0, r1] = e.room ?? [120, width - 120];
        const x1 = Math.max(r0, Math.min(r1, x + between(-160, 160)));
        const dd = Math.abs(x1 - x) / (speed * 0.8);
        tr.pose.push({ t, v: null });
        tr.facing.push({ t, v: x1 > x ? 1 : -1 });
        tr.legs.push({ t0: t, t1: t + dd, x0: x, z0: e.z, x1, z1: e.z, run: false, y0: 0, y1: 0, hop: 0, gait: "walk" });
        t += dd + 0.3;
        x = x1;
      } else if (r() < 0.2) tr.facing.push({ t, v: r() < 0.5 ? 1 : -1 });
    }
  }
  return out;
}

// src/core/timeline.ts
var WALK_SPEED = 230;
var GAIT_SPEED = { walk: 1, run: 1, jog: 1.6, sneak: 0.55, tiptoe: 0.6, march: 1.05, skip: 1.35, limp: 0.55, strut: 0.85, stagger: 0.7, waddle: 0.6, shuffle: 0.45, hop: 1 };
var RUN_SPEED = 520;
var STRIDE = 11 / 260;
function ease2(e, u) {
  u = clamp(u, 0, 1);
  switch (e) {
    case "linear":
      return u;
    case "in":
      return u * u * u;
    case "out":
      return 1 - Math.pow(1 - u, 3);
    case "bounce": {
      const n = 7.5625, d = 2.75;
      if (u < 1 / d) return n * u * u;
      if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
      if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
      return n * (u -= 2.625 / d) * u + 0.984375;
    }
    case "back": {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
    }
    case "elastic":
      return u === 0 || u === 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
    default:
      return easeInOut(u);
  }
}
function estimateDur(text3, rate = 1) {
  const t = text3.replace(/[*_]/g, "").trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  return Math.max(1.1, (t.length * 0.062 + words * 0.04) / rate + 0.25);
}
function takeFor(p, b) {
  if (b.kind !== "say" || !b.take) return void 0;
  const t = p.takes[b.take];
  return t && t.text === b.text ? t : void 0;
}
function compileScene(p, scene) {
  const chars = new Map(p.characters.map((c) => [c.id, c]));
  const actors = /* @__PURE__ */ new Map();
  for (const c of scene.cast) {
    actors.set(c.who, {
      who: c.who,
      x0: c.x,
      z0: c.z,
      legs: [],
      facing: [{ t: 0, v: c.facing }],
      mood: [{ t: 0, v: "neutral" }],
      gesture: [{ t: 0, v: "rest" }],
      visible: [{ t: 0, v: c.visible !== false }],
      sit: [{ t: 0, v: !!c.sit }],
      talks: [],
      expr: [{ t: 0, v: null }],
      pose: [{ t: 0, v: null }]
    });
  }
  const posAt = (a, t) => {
    let x = a.x0;
    let z = a.z0;
    let y = 0;
    for (const l of a.legs) {
      if (t >= l.t1) {
        x = l.x1;
        z = l.z1;
        y = l.y1;
      } else if (t > l.t0) {
        const u = (t - l.t0) / (l.t1 - l.t0);
        x = l.x0 + (l.x1 - l.x0) * u;
        z = l.z0 + (l.z1 - l.z0) * u;
        y = l.y0 + (l.y1 - l.y0) * u;
      }
    }
    return { x, z, y };
  };
  const push = (arr, t, v) => {
    while (arr.length && arr[arr.length - 1].t > t) arr.pop();
    arr.push({ t, v });
  };
  const beats = /* @__PURE__ */ new Map();
  const drives = [];
  const tweens = [];
  const sfx = [];
  const vfx = [];
  const titles = [];
  const talks = [];
  const objX = new Map(scene.objects.map((o) => [o.id, o.x]));
  const holds = [];
  const hits = [];
  const objAt = (id, t) => {
    const h = holds.find((x) => x.obj === id && t >= x.t0 && t < x.t1);
    const o = scene.objects.find((x) => x.id === id);
    if (h) {
      const tr = actors.get(h.who);
      const p2 = posAt(tr, t);
      return { x: p2.x + 60 * facingAt(tr, t), z: p2.z };
    }
    if (!o) return null;
    const ps = objectPose({ drives, tweens }, o, t);
    return { x: ps.x, z: ps.z };
  };
  let cursor = 0.4;
  let prevStart = cursor;
  let end = cursor;
  for (const b of scene.beats) {
    const t0 = b.at !== void 0 ? Math.max(0, b.at) : b.with ? prevStart : cursor;
    let dur2 = 0;
    const a = "who" in b ? actors.get(b.who) : void 0;
    switch (b.kind) {
      case "say": {
        const ch = chars.get(b.who);
        const take2 = takeFor(p, b);
        dur2 = take2 ? take2.dur : estimateDur(b.text, ch?.voice.rate ?? (b.who === NARRATOR ? p.narrator?.rate ?? 0.95 : 1));
        if (b.who === NARRATOR) {
          talks.push({ t0, t1: t0 + dur2, text: b.text, who: NARRATOR, take: take2, beat: b.id });
        } else if (a) {
          if (b.mood) push(a.mood, t0, b.mood);
          if (b.expr) push(a.expr, t0, b.expr);
          const ps = b.pose ?? b.gesture;
          if (ps) {
            push(a.gesture, t0, b.gesture ?? "rest");
            push(a.gesture, t0 + dur2, "rest");
            push(a.pose, t0, { name: ps });
            push(a.pose, t0 + dur2, null);
          }
          const me = posAt(a, t0);
          const other2 = b.to ? actors.get(b.to) : void 0;
          if (other2) push(a.facing, t0, posAt(other2, t0).x >= me.x ? 1 : -1);
          for (const o of actors.values()) {
            if (o === a) continue;
            const op = posAt(o, t0);
            const moving = o.legs.some((l) => l.t0 <= t0 && l.t1 > t0);
            if (!moving && Math.abs(op.x - me.x) > 40) push(o.facing, t0 + 0.15, me.x >= op.x ? 1 : -1);
          }
          const talk = { t0, t1: t0 + dur2, text: b.text, who: b.who, take: take2, beat: b.id };
          a.talks.push(talk);
          talks.push(talk);
        }
        dur2 += b.gap ?? 0.35;
        break;
      }
      case "move": {
        if (a) {
          const from = posAt(a, t0);
          const z1 = b.z ?? from.z;
          const y1 = b.y ?? from.y;
          const hop = b.hop ?? 0;
          const dist = Math.hypot(b.x - from.x, z1 - from.z);
          dur2 = b.dur ?? Math.max(hop ? 0.7 : 0.4, Math.max(dist, Math.abs(y1 - from.y) * 1.5) / ((b.run || b.style === "run" ? RUN_SPEED : WALK_SPEED) * (GAIT_SPEED[b.style ?? ""] ?? 1)));
          if (dist > 2 || Math.abs(y1 - from.y) > 2 || hop) {
            a.legs.push({ t0, t1: t0 + dur2, x0: from.x, z0: from.z, x1: b.x, z1, run: !!b.run || b.style === "run", y0: from.y, y1, hop, gait: b.style ?? (b.run ? "run" : "walk") });
            if (Math.abs(b.x - from.x) > 4) push(a.facing, t0, b.x > from.x ? 1 : -1);
            push(a.sit, t0, false);
            if (a.front?.length) push(a.front, t0, false);
          }
        }
        break;
      }
      case "act": {
        if (a) {
          if (b.mood) push(a.mood, t0, b.mood);
          if (b.expr !== void 0) push(a.expr, t0, b.expr || null);
          if (b.gesture) push(a.gesture, t0, b.gesture);
          const ps = b.pose ?? b.gesture;
          if (ps) {
            push(a.pose, t0, ps === "rest" ? null : { name: ps });
            if (b.dur) push(a.pose, t0 + b.dur, null);
          }
          if (b.sit !== void 0) push(a.sit, t0, b.sit);
          if (b.visible !== void 0) push(a.visible, t0, b.visible);
          if (b.face) {
            if (b.face === "front" || a.front?.length) push(a.front ??= [], t0, b.face === "front");
            if (b.face === "front") {
            } else if (b.face === "left") push(a.facing, t0, -1);
            else if (b.face === "right") push(a.facing, t0, 1);
            else {
              const o = actors.get(b.face);
              if (o) push(a.facing, t0, posAt(o, t0).x >= posAt(a, t0).x ? 1 : -1);
            }
          }
        }
        dur2 = b.kind === "act" && b.dur ? Math.min(b.dur, 0.5) : 0.5;
        break;
      }
      case "interact": {
        const o = actors.get(b.other);
        if (a && o) dur2 = interact(b.type, a, o, t0, b.dur, { posAt, push, sfx, vfx, hits });
        break;
      }
      case "handle": {
        if (a) dur2 = handle(b, a, t0, { posAt, push, sfx, vfx, hits, holds, tweens, objAt, actors, objects: scene.objects });
        break;
      }
      case "wait":
        dur2 = b.dur;
        break;
      case "sfx":
        sfx.push({ t: t0, name: b.name });
        dur2 = 0.1;
        break;
      case "drive": {
        const x0 = objX.get(b.obj) ?? 0;
        dur2 = b.dur ?? Math.max(0.8, Math.abs(b.x - x0) / 600);
        drives.push({ obj: b.obj, t0, t1: t0 + dur2, x0, x1: b.x });
        objX.set(b.obj, b.x);
        break;
      }
      case "vfx":
        dur2 = b.dur ?? 2;
        vfx.push({ name: b.name, t0, t1: t0 + dur2, x: b.x });
        dur2 = Math.min(dur2, 0.6);
        break;
      case "tween": {
        dur2 = b.dur ?? 1;
        tweens.push({ obj: b.obj, t0, t1: t0 + Math.max(0.01, dur2), to: { x: b.x, y: b.y, z: b.z, scale: b.scale, rot: b.rot, alpha: b.alpha }, ease: b.ease ?? "inout", arc: b.arc ?? 0 });
        break;
      }
      case "title":
        dur2 = b.dur ?? 3;
        titles.push({ text: b.text, sub: b.sub, style: b.style ?? "card", t0, t1: t0 + dur2 });
        break;
    }
    beats.set(b.id, { t0, t1: t0 + dur2 });
    prevStart = t0;
    cursor = Math.max(cursor, t0 + dur2);
    end = Math.max(end, cursor);
  }
  for (const f of vfx) end = Math.max(end, f.t0 + 0.5);
  const dur = Math.max(2, end + 0.8);
  if (scene.crowd?.n) {
    const W17 = setById(scene.set).width;
    for (const [id, tr] of crowdTracks(scene, crowdOf(scene, W17), dur, W17, WALK_SPEED)) actors.set(id, tr);
  }
  const shots = [];
  const list2 = scene.shots.length ? scene.shots : [];
  const starts = list2.map((s, i) => {
    if (i === 0 || !s.at) return 0;
    const bt = beats.get(s.at);
    return clamp((bt?.t0 ?? 0) + (s.offset ?? 0), 0, dur - 0.2);
  });
  const order = list2.map((s, i) => ({ s, t: starts[i] })).sort((x, y) => x.t - y.t);
  order.forEach((o, i) => {
    const t1 = i + 1 < order.length ? order[i + 1].t : dur;
    if (t1 - o.t > 0.05) shots.push({ shot: o.s, t0: o.t, t1 });
  });
  return { scene, dur, beats, actors, drives, tweens, sfx, vfx, titles, talks, shots, holds, hits };
}
var facingAt = (tr, t) => {
  let v = tr.facing[0]?.v ?? 1;
  for (const s of tr.facing) if (s.t <= t) v = s.v;
  return v;
};
var REACH = 92;
function handle(b, a, t0, c) {
  let t = t0;
  const walkTo = (x, z) => {
    const p = c.posAt(a, t);
    const dist = Math.hypot(x - p.x, z - p.z);
    if (Math.abs(x - p.x) > 4) c.push(a.facing, t, x > p.x ? 1 : -1);
    if (dist > 24) {
      const d = Math.max(0.5, dist / WALK_SPEED);
      a.legs.push({ t0: t, t1: t + d, x0: p.x, z0: p.z, x1: x, z1: z, run: false, y0: p.y, y1: p.y, hop: 0, gait: "walk" });
      t += d;
    }
    c.push(a.sit, t, false);
  };
  const held = (who) => c.holds.find((h) => h.who === who && h.obj === b.obj && h.t1 === Infinity);
  const free = (cands) => {
    const p = c.posAt(a, t);
    for (const [x, z] of cands) {
      const arrive = t + Math.hypot(x - p.x, z - p.z) / WALK_SPEED;
      const clash = [...c.actors.values()].some((o) => {
        if (o === a) return false;
        const q = c.posAt(o, arrive);
        return Math.abs(q.x - x) < 115 && Math.abs(q.z - z) < 70;
      });
      if (!clash) return [x, z];
    }
    return [cands[0][0], cands[0][1] + 80];
  };
  switch (b.act) {
    case "pick": {
      const o = c.objAt(b.obj, t);
      if (!o) return 0.5;
      const other2 = c.holds.find((h) => h.obj === b.obj && h.t1 === Infinity && h.who !== a.who);
      const p = c.posAt(a, t);
      const near = o.x >= p.x ? 1 : -1;
      const [sx, sz] = free([[o.x - near * REACH, o.z], [o.x + near * REACH, o.z], [o.x - near * (REACH + 70), o.z]]);
      walkTo(sx, sz);
      const side = o.x >= sx ? 1 : -1;
      c.push(a.facing, t, side);
      const dur = b.dur ?? 1.3;
      c.push(a.pose, t, { name: "pick-up", reach: "obj", obj: b.obj });
      const contact = t + Math.min(0.55, dur * 0.45);
      if (other2) other2.t1 = contact;
      c.holds.push({ obj: b.obj, who: a.who, t0: contact, t1: Infinity });
      c.sfx.push({ t: contact, name: "pop" });
      c.push(a.pose, t + dur, null);
      return t + dur - t0;
    }
    case "put": {
      const h = held(a.who);
      if (!h) return 0.3;
      const p = c.posAt(a, t);
      if (b.x !== void 0) {
        const near = b.x >= p.x ? 1 : -1;
        const [sx, sz] = free([[b.x - near * REACH, p.z], [b.x + near * REACH, p.z]]);
        walkTo(sx, sz);
        c.push(a.facing, t, b.x >= sx ? 1 : -1);
      }
      const q = c.posAt(a, t);
      let f = 1;
      for (const s of a.facing) if (s.t <= t) f = s.v;
      const x = b.x ?? q.x + f * REACH;
      const dur = b.dur ?? 1.2;
      c.push(a.pose, t, { name: (b.y ?? 0) > 120 ? "give" : "put-down" });
      const contact = t + Math.min(0.55, dur * 0.45);
      h.t1 = contact;
      c.tweens.push({ obj: b.obj, t0: contact, t1: contact + 0.01, to: { x, y: b.y ?? 0, z: q.z }, ease: "linear", arc: 0 });
      c.sfx.push({ t: contact, name: "pop" });
      c.push(a.pose, t + dur, null);
      return t + dur - t0;
    }
    case "give": {
      const h = held(a.who);
      const o = b.to ? c.actors.get(b.to) : void 0;
      if (!h || !o) return 0.3;
      const pb = c.posAt(o, t);
      const p = c.posAt(a, t);
      const near = pb.x >= p.x ? 1 : -1;
      const [sx, sz] = free([[pb.x - near * 200, pb.z], [pb.x + near * 200, pb.z]]);
      walkTo(sx, sz);
      const side = pb.x >= sx ? 1 : -1;
      c.push(a.facing, t, side);
      c.push(o.facing, t, -side);
      const dur = b.dur ?? 1.8;
      c.push(a.pose, t, { name: "give" });
      c.push(o.pose, t + 0.35, { name: "receive" });
      const contact = t + 0.75;
      h.t1 = contact;
      c.holds.push({ obj: b.obj, who: o.who, t0: contact, t1: Infinity });
      c.push(a.pose, t + dur, null);
      c.push(o.pose, t + dur, null);
      return t + dur - t0;
    }
  }
  return 0.5;
}
var INTERACTIONS = {
  handshake: { gap: 240, dur: 2.2, desc: "they shake hands" },
  hug: { gap: 150, dur: 2.6, desc: "a warm hug" },
  "high-five": { gap: 230, dur: 1.4, desc: "a high five" },
  slap: { gap: 210, dur: 1.6, desc: "the first slaps the other, who reels" },
  punch: { gap: 220, dur: 1.8, desc: "a cartoon punch; the other is knocked back" },
  push: { gap: 200, dur: 1.6, desc: "a shove; the other stumbles back" },
  whisper: { gap: 150, dur: 2.4, desc: "the first whispers in the other's ear" },
  kiss: { gap: 140, dur: 1.8, desc: "a kiss on the cheek (hearts)" },
  comfort: { gap: 200, dur: 2.6, desc: "a comforting hand on the shoulder" },
  give: { gap: 240, dur: 2, desc: "the first hands something over" },
  bow: { gap: 320, dur: 2.2, desc: "they bow to each other" },
  toast: { gap: 240, dur: 2, desc: "they raise their glasses (clink)" },
  dance: { gap: 260, dur: 4, desc: "they dance together" },
  argue: { gap: 280, dur: 4, desc: "a heated argument: finger-wagging and fist-shaking" },
  scare: { gap: 220, dur: 1.8, desc: "the first jumps out \u2014 boo! \u2014 the other leaps in fright" },
  tickle: { gap: 180, dur: 2.4, desc: "the first tickles the other, who laughs helplessly" },
  "point-at": { gap: 0, dur: 1.6, desc: "the first points at the other" },
  "wave-goodbye": { gap: 0, dur: 2, desc: "they wave goodbye" },
  chase: { gap: 0, dur: 3, desc: "the second runs away, the first runs after" },
  lead: { gap: 160, dur: 3, desc: "they walk off together, side by side" },
  // caricature staging (docs/CARICATURE.md)
  "collar-grab": { gap: 170, dur: 2.4, desc: "the first grabs the other by the collar and yells in his face" },
  "arm-around": { gap: 120, dur: 3, desc: "an arm around the other's shoulders, matey" },
  nudge: { gap: 130, dur: 1.8, desc: 'an elbow in the ribs: "eh? eh?"' },
  "deadpan-look": { gap: 0, dur: 2.4, desc: "they turn and stare at each other, deadpan (the joke lands)" }
};
function interact(type, a, b, t0, durIn, c) {
  const I = INTERACTIONS[type] ?? INTERACTIONS.handshake;
  const dur = durIn ?? I.dur;
  const pa = c.posAt(a, t0);
  const pb = c.posAt(b, t0);
  const side = pa.x <= pb.x ? 1 : -1;
  let t = t0;
  if (I.gap > 0) {
    const tx = pb.x - side * I.gap;
    const dist = Math.abs(tx - pa.x);
    if (dist > 30) {
      const d = Math.max(0.5, dist / WALK_SPEED);
      a.legs.push({ t0: t, t1: t + d, x0: pa.x, z0: pa.z, x1: tx, z1: pb.z, run: false, y0: pa.y, y1: pa.y, hop: 0, gait: "walk" });
      c.push(a.facing, t, side);
      t += d;
    }
  }
  c.push(a.facing, t, side);
  c.push(b.facing, t, -side);
  const pose = (tr, at2, v) => c.push(tr.pose, at2, v);
  const expr = (tr, at2, e) => c.push(tr.expr, at2, e);
  const end = t + dur;
  switch (type) {
    case "handshake":
      pose(a, t, { name: "shake", with: b.who, reach: "mid" });
      pose(b, t, { name: "shake", with: a.who, reach: "mid" });
      expr(a, t, "happy");
      expr(b, t, "happy");
      break;
    case "hug":
      pose(a, t, { name: "hug", with: b.who, reach: "back", both: true });
      pose(b, t, { name: "hug", with: a.who, reach: "back", both: true });
      expr(a, t, "very content");
      expr(b, t, "very content");
      break;
    case "high-five":
      pose(a, t, { name: "high-five", with: b.who, reach: "mid-high" });
      pose(b, t, { name: "high-five", with: a.who, reach: "mid-high" });
      expr(a, t, "excited");
      expr(b, t, "excited");
      c.sfx.push({ t: t + 0.45, name: "slap" });
      break;
    case "slap":
      pose(a, t, { name: "slap", with: b.who, reach: "cheek" });
      expr(a, t, "angry");
      pose(b, t + 0.32, { name: "reel" });
      expr(b, t + 0.32, "very surprised");
      c.sfx.push({ t: t + 0.3, name: "slap" });
      c.hits.push({ t: t + 0.3, d: 0.1, who: [a.who, b.who] });
      c.vfx.push({ name: "dizzy", t0: t + 0.35, t1: t + 1.8, x: pb.x });
      break;
    case "punch": {
      pose(a, t, { name: "punch" });
      expr(a, t, "furious");
      pose(b, t + 0.22, { name: "knocked-back" });
      expr(b, t + 0.22, "extreme surprised");
      c.sfx.push({ t: t + 0.2, name: "punch" });
      c.hits.push({ t: t + 0.2, d: 0.15, who: [a.who, b.who] });
      c.vfx.push({ name: "impact", t0: t + 0.2, t1: t + 0.8, x: pb.x - side * 40 });
      const bx = pb.x + side * 170;
      b.legs.push({ t0: t + 0.22, t1: t + 0.8, x0: pb.x, z0: pb.z, x1: bx, z1: pb.z, run: true, y0: 0, y1: 0, hop: 50, gait: "hop" });
      break;
    }
    case "push": {
      pose(a, t, { name: "push" });
      expr(a, t, "angry");
      pose(b, t + 0.3, { name: "reel" });
      expr(b, t + 0.3, "surprised");
      const bx = pb.x + side * 200;
      b.legs.push({ t0: t + 0.3, t1: t + 1.1, x0: pb.x, z0: pb.z, x1: bx, z1: pb.z, run: false, y0: 0, y1: 0, hop: 0, gait: "stagger" });
      c.push(b.facing, t + 0.3, -side);
      c.sfx.push({ t: t + 0.3, name: "whoosh" });
      break;
    }
    case "whisper":
      pose(a, t, { name: "whisper" });
      expr(a, t, "sly");
      pose(b, t, { name: "nod" });
      expr(b, t + 0.6, "very surprised");
      break;
    case "kiss":
      pose(a, t, { name: "comfort-reach", with: b.who, reach: "shoulder" });
      expr(a, t, "in-love");
      expr(b, t + 0.5, "very embarrassed");
      pose(b, t + 0.5, { name: "hands-on-cheeks" });
      c.sfx.push({ t: t + 0.45, name: "kiss" });
      c.vfx.push({ name: "hearts", t0: t + 0.5, t1: t + 2.2, x: (pa.x + pb.x) / 2 });
      break;
    case "comfort":
      pose(a, t, { name: "comfort-reach", with: b.who, reach: "shoulder" });
      expr(a, t, "grateful");
      expr(b, t, "sad");
      expr(b, t + dur * 0.6, "slightly hopeful");
      break;
    case "give":
      pose(a, t, { name: "give" });
      pose(b, t + 0.4, { name: "receive" });
      expr(b, t + 0.4, "happy");
      break;
    case "bow":
      pose(a, t, { name: "bow" });
      pose(b, t + 0.5, { name: "bow" });
      break;
    case "toast":
      pose(a, t, { name: "toast", with: b.who, reach: "mid-high" });
      pose(b, t, { name: "toast", with: a.who, reach: "mid-high" });
      expr(a, t, "happy");
      expr(b, t, "happy");
      c.sfx.push({ t: t + 0.5, name: "ding" });
      break;
    case "dance":
      pose(a, t, { name: "dance" });
      pose(b, t, { name: "disco" });
      expr(a, t, "very happy");
      expr(b, t, "excited");
      break;
    case "argue":
      for (let k = 0; k < 4; k++) {
        const tt = t + k * dur / 4;
        pose(k % 2 ? b : a, tt, { name: k % 2 ? "shake-fist" : "wag-finger" });
        pose(k % 2 ? a : b, tt, { name: "hands-on-hips" });
        expr(a, tt, k > 1 ? "furious" : "angry");
        expr(b, tt, k > 1 ? "very angry" : "annoyed");
      }
      break;
    case "scare":
      pose(a, t, { name: "hands-up" });
      expr(a, t, "extreme happy");
      pose(b, t + 0.15, { name: "scared-jump" });
      expr(b, t + 0.15, "extreme scared");
      c.sfx.push({ t: t + 0.12, name: "gasp-crowd" });
      break;
    case "tickle":
      pose(a, t, { name: "shake", with: b.who, reach: "belly" });
      expr(a, t, "very grin");
      pose(b, t + 0.3, { name: "laugh-hard" });
      expr(b, t + 0.3, "extreme laughing");
      break;
    case "point-at":
      c.push(a.facing, t, side);
      pose(a, t, { name: "point" });
      expr(b, t + 0.2, "surprised");
      break;
    case "wave-goodbye":
      pose(a, t, { name: "wave" });
      pose(b, t + 0.2, { name: "wave" });
      expr(a, t, "slightly sad");
      expr(b, t, "slightly sad");
      break;
    case "chase": {
      const away = pb.x + side * 900;
      b.legs.push({ t0: t, t1: t + dur, x0: pb.x, z0: pb.z, x1: away, z1: pb.z, run: true, y0: 0, y1: 0, hop: 0, gait: "run" });
      a.legs.push({ t0: t + 0.4, t1: t + dur + 0.4, x0: pa.x, z0: pa.z, x1: away - side * 260, z1: pb.z, run: true, y0: 0, y1: 0, hop: 0, gait: "run" });
      c.push(b.facing, t, side);
      expr(b, t, "scared");
      expr(a, t, "angry");
      break;
    }
    case "collar-grab":
      pose(a, t, { name: "collar-grab", with: b.who, reach: "collar", both: true });
      expr(a, t, "very yelling");
      pose(b, t + 0.15, { name: "tremble" });
      expr(b, t + 0.15, "very flustered");
      c.sfx.push({ t: t + 0.1, name: "whoosh" });
      break;
    case "arm-around":
      pose(a, t, { name: "comfort-reach", with: b.who, reach: "far-shoulder" });
      expr(a, t, "grin");
      expr(b, t + 0.3, "slightly side-eye");
      break;
    case "nudge":
      pose(a, t, { name: "nudge" });
      expr(a, t, "scheming");
      expr(b, t + 0.25, "slightly surprised");
      expr(b, t + 0.9, "grin");
      break;
    case "deadpan-look":
      expr(a, t, "deadpan");
      expr(b, t + 0.2, "deadpan");
      pose(a, t, { name: "deadpan-stare" });
      pose(b, t + 0.2, { name: "deadpan-stare" });
      break;
    case "lead": {
      const go = pb.x + side * 700;
      a.legs.push({ t0: t, t1: t + dur, x0: c.posAt(a, t).x, z0: pa.z, x1: go - side * 160, z1: pa.z, run: false, y0: 0, y1: 0, hop: 0, gait: "walk" });
      b.legs.push({ t0: t, t1: t + dur, x0: pb.x, z0: pb.z, x1: go, z1: pb.z, run: false, y0: 0, y1: 0, hop: 0, gait: "walk" });
      c.push(b.facing, t, side);
      expr(a, t, "content");
      expr(b, t, "content");
      break;
    }
  }
  pose(a, end, null);
  pose(b, end + (type === "bow" ? 0.5 : 0), null);
  if (type !== "chase" && type !== "lead") {
    expr(a, end + 0.4, null);
    expr(b, end + 0.6, null);
  }
  return end - t0;
}
function objectX(cs, objId, x0, t) {
  let x = x0;
  let moving = false;
  let dir = 0;
  for (const d of cs.drives) {
    if (d.obj !== objId) continue;
    if (t >= d.t1) x = d.x1;
    else if (t > d.t0) {
      const u = easeInOut((t - d.t0) / (d.t1 - d.t0));
      x = d.x0 + (d.x1 - d.x0) * u;
      moving = true;
      dir = Math.sign(d.x1 - d.x0);
    }
  }
  return { x, moving, dir };
}
function objectPose(cs, o, t) {
  const st = { x: o.x, y: o.y ?? 0, z: o.z, scale: o.scale, rot: o.rot ?? 0, alpha: o.alpha ?? 1 };
  const dx = objectX(cs, o.id, o.x, t);
  st.x = dx.x;
  let moving = dx.moving;
  let dir = dx.dir;
  for (const tw of cs.tweens) {
    if (tw.obj !== o.id || t < tw.t0) continue;
    const from = { ...st };
    const u = tw.t1 <= tw.t0 ? 1 : ease2(tw.ease, (t - tw.t0) / (tw.t1 - tw.t0));
    const raw = clamp((t - tw.t0) / Math.max(1e-6, tw.t1 - tw.t0), 0, 1);
    for (const k of Object.keys(tw.to)) {
      const v = tw.to[k];
      if (v === void 0) continue;
      st[k] = from[k] + (v - from[k]) * u;
    }
    if (tw.arc && raw < 1) st.y += 4 * tw.arc * raw * (1 - raw);
    if (t < tw.t1) {
      moving = moving || tw.to.x !== void 0 && tw.to.x !== from.x;
      if (tw.to.x !== void 0 && tw.to.x !== from.x) dir = Math.sign(tw.to.x - from.x);
    }
  }
  return { ...st, moving, dir };
}

// src/cinema/library.ts
var SIZES = [
  { id: "ews", abbr: "EWS", name: "Extreme wide shot", desc: "The place dominates; people are small in it.", use: "Open a scene or a film, show isolation, scale, a journey." },
  { id: "ws", abbr: "WS", name: "Wide (long) shot", desc: "Everyone head to toe with plenty of room around them.", use: "Establish where everyone stands; physical comedy; group action." },
  { id: "fs", abbr: "FS", name: "Full shot", desc: "One or two people head to toe, filling the frame height.", use: "Show a whole body acting: a walk, a dance, a fall." },
  { id: "mls", abbr: "MLS", name: "Medium long (American) shot", desc: "From the knees up \u2014 the cowboy shot.", use: "Confrontations and stand-offs; conversation with body language." },
  { id: "ms", abbr: "MS", name: "Medium shot", desc: "From the waist up.", use: "The workhorse of dialogue: face and hands both read." },
  { id: "mcu", abbr: "MCU", name: "Medium close-up", desc: "From the chest up.", use: "Conversation that matters; the listener's reaction." },
  { id: "cu", abbr: "CU", name: "Close-up", desc: "The face fills the frame.", use: "Emotion, a decision, a secret. Use sparingly so it counts." },
  { id: "ecu", abbr: "ECU", name: "Extreme close-up", desc: "Only the eyes and mouth.", use: "Shock, suspicion, the big comic take, a ticking moment." }
];
var ANGLES = [
  { id: "eye", name: "Eye level", desc: "The camera at the subject's eye height: neutral, honest.", use: "Most dialogue." },
  { id: "low", name: "Low angle", desc: "From below, looking up: the subject looms.", use: "Power, threat, heroism \u2014 the villain's entrance." },
  { id: "worm", name: "Worm's eye", desc: "From the floor, steeply up.", use: "Giants, towers, a comic exaggeration of power." },
  { id: "high", name: "High angle", desc: "From above, looking down: the subject shrinks.", use: "Vulnerability, defeat, being watched." },
  { id: "bird", name: "Bird's eye", desc: "From high above, almost straight down.", use: "Show a pattern, a chase, or fate looking on." },
  { id: "dutch", name: "Dutch angle", desc: "The horizon tilted.", use: "Unease, madness, a world off balance." },
  { id: "shoulder", name: "Shoulder level", desc: "Slightly below eye level, at the shoulder.", use: "Heroic but grounded; action cinema." }
];
var LENSES = [
  { id: "wide", name: "Wide lens", desc: "Close camera, wide view: depth is exaggerated, backgrounds rush past when the camera moves.", use: "Energy, comedy, claustrophobia, big spaces." },
  { id: "normal", name: "Normal lens", desc: "Close to how the eye sees.", use: "Everyday scenes." },
  { id: "tele", name: "Long lens", desc: "Far camera, narrow view: layers flatten together, the background looks close.", use: "Romance, surveillance, heat-haze drama, a crowd pressing in." }
];
var MOVES = [
  { id: "static", name: "Static", desc: "A locked-off camera.", use: "Let the acting do the work; deadpan comedy." },
  { id: "push", name: "Push in (dolly in)", desc: "The camera moves toward the subject.", use: "Growing importance, a realisation, rising tension." },
  { id: "pull", name: "Pull out (dolly out)", desc: "The camera moves away.", use: "Reveal the surroundings, loneliness, an ending." },
  { id: "zoomin", name: "Zoom in", desc: "The lens narrows without moving: the space flattens as it tightens.", use: "70s style emphasis; a slow ominous zoom." },
  { id: "zoomout", name: "Zoom out", desc: "The lens widens from a detail to the scene.", use: "Reveal context from a detail." },
  { id: "crash", name: "Crash zoom", desc: "A violent, fast zoom into a face.", use: 'The Ye\u015Fil\xE7am shock zoom; comedy beats; "what did you say?!"' },
  { id: "dollyzoom", name: "Dolly zoom (vertigo)", desc: "The camera pulls back while the lens zooms in: the subject stays the same size, the world stretches behind.", use: "The floor falling away \u2014 terror, epiphany." },
  { id: "pan", name: "Pan", desc: "The camera turns sideways on its spot.", use: "Follow action across the set; scan a crowd; a reveal." },
  { id: "tilt", name: "Tilt", desc: "The camera tilts up or down.", use: "Reveal a tall thing or person from shoes to face." },
  { id: "truck", name: "Truck (tracking)", desc: "The camera travels sideways alongside the action.", use: "Walk-and-talk; parallax that shows the depth of the set." },
  { id: "follow", name: "Follow", desc: "The camera keeps the subject framed as they move.", use: "Chases, entrances, walking with a character." },
  { id: "arc", name: "Arc / parallax slide", desc: "A slow lateral move with a slight push: the layers slide past each other.", use: "Make a still moment feel alive and deep." },
  { id: "crane-up", name: "Crane up", desc: "The camera rises and looks down.", use: "Endings, leaving the characters to their fate." },
  { id: "crane-down", name: "Crane down", desc: "The camera descends into the scene.", use: "Openings: arrive from the sky into the street." },
  { id: "handheld", name: "Handheld", desc: "A loose, breathing camera.", use: "Documentary realism, panic, intimacy." },
  { id: "shake", name: "Impact shake", desc: "A sharp shake that settles.", use: "Explosions, a slammed door, a punch, an earthquake." },
  { id: "whip", name: "Whip pan out", desc: "A blur-fast pan at the end of the shot.", use: 'Energy between scenes; comic "meanwhile\u2026".' },
  { id: "rack", name: "Rack focus", desc: "Focus shifts from the background to the subject.", use: "Redirect attention; reveal who is listening." },
  { id: "reveal", name: "Rise and reveal", desc: "Starts low, rises to the subject.", use: "Grand entrances." }
];
var COMPS = [
  { id: "auto", name: "Automatic", desc: "Single for one person, two-shot for two, group for more.", use: "A safe default." },
  { id: "single", name: "Single", desc: "One person, on a third of the frame, with look room in front of their face.", use: "Dialogue coverage." },
  { id: "two", name: "Two-shot", desc: "Two people sharing the frame.", use: "Relationships, banter, a shared moment." },
  { id: "ots", name: "Over the shoulder", desc: "We look at one person past the other's shoulder.", use: "Conversation that keeps both people present." },
  { id: "group", name: "Group", desc: "Everyone listed in frame.", use: "Ensemble beats, tableaux." },
  { id: "set", name: "The set", desc: "The whole place, not tied to a person.", use: "Establishing shots." }
];
var TRANSITIONS = [
  { id: "cut", name: "Cut", desc: "An instant change of shot.", use: "Almost always. Invisible when it follows the action." },
  { id: "dissolve", name: "Dissolve", desc: "One shot melts into the next.", use: "Time passing, a soft change of place, a memory." },
  { id: "fade", name: "Fade through black", desc: "Down to black and up again.", use: "The end of an act; a long passage of time." },
  { id: "flash", name: "White flash", desc: "Through a burst of white.", use: "Flashbacks, shocks, dreams, a camera flash." },
  { id: "iris", name: "Iris", desc: "A closing circle, then an opening one.", use: "Silent-film charm; comic endings." },
  { id: "heart", name: "Heart iris", desc: "The iris as a heart.", use: "Romance, cheekily." },
  { id: "wipe", name: "Wipe", desc: "The new shot sweeps across.", use: 'Adventure serial energy; "meanwhile".' },
  { id: "wipe-up", name: "Vertical wipe", desc: "Sweeps from bottom to top.", use: "A lighter variant of the wipe." },
  { id: "clock", name: "Clock wipe", desc: "Sweeps round like a clock hand.", use: "Time passing." },
  { id: "whip", name: "Whip pan", desc: "A motion-blurred slide.", use: "High energy; linking two places." },
  { id: "zoom", name: "Zoom through", desc: "Punch in through white into the next shot.", use: "Music-video energy, sudden travel." },
  { id: "glitch", name: "Glitch", desc: "Digital tearing.", use: "Sci-fi, a hacked screen, a broken memory." },
  { id: "blinds", name: "Venetian blinds", desc: "Stripes flip to the new shot.", use: "Retro TV style." },
  { id: "pixel", name: "Pixelate", desc: "Blocks grow then resolve.", use: "Video-game feel; a teleport." },
  { id: "burn", name: "Film burn", desc: "The film melts in a hot hole.", use: "A projector breaking \u2014 nostalgia, a violent cut." },
  { id: "ripple", name: "Ripple", desc: "The picture ripples like water.", use: "Dreams, daydreams, a wish." }
];
var cam = (o) => ({ size: "ms", angle: "eye", on: [], comp: "auto", move: "static", lens: "normal", ...o });
var shot = (at2, c, note = "", trans = "cut", dur = 0.6, fx = [], offset) => ({
  id: uid("h"),
  at: at2,
  cam: cam(c),
  trans: { kind: trans, dur: trans === "cut" ? 0 : dur },
  fx,
  note,
  offset
});
var says = (s) => s.beats.filter((b) => b.kind === "say");
var speakers = (s) => [...new Set(says(s).map((b) => b.who))];
var castIds = (s) => s.cast.map((c) => c.who);
var other = (s, who) => castIds(s).find((w) => w !== who) ?? who;
var strong = (m) => m === "angry" || m === "surprised" || m === "scared";
function establishing(s, note = "Establishing shot: where are we, who is here.") {
  return shot(null, { size: "ews", comp: "set", on: castIds(s), move: "push", amount: 0.5 }, note);
}
var TECHNIQUES = [
  {
    id: "master",
    name: "Master shot",
    group: "Coverage",
    desc: "One wide shot holds the whole scene, like a stage play.",
    how: "A single WS on everyone, with a gentle drift so it breathes.",
    example: "Silent comedies and long Ye\u015Fil\xE7am dialogues in a living room.",
    apply: ({ scene }) => [shot(null, { size: "ws", comp: "group", on: castIds(scene), move: "arc", amount: 0.4 }, "Master shot over the whole scene.")]
  },
  {
    id: "srs",
    name: "Shot / reverse shot",
    group: "Coverage",
    desc: "Cut back and forth between two speakers, each framed facing the other.",
    how: "An establishing two-shot, then a single on whoever speaks; OTS for the first exchange.",
    example: "Any conversation in any film: the grammar of dialogue.",
    apply: ({ scene }) => {
      const out = [shot(null, { size: "ms", comp: "two", on: castIds(scene).slice(0, 2) }, "Two-shot to set up the geography.")];
      let first = true;
      let last = "";
      for (const b of says(scene)) {
        if (b.who === last) continue;
        last = b.who;
        out.push(shot(b.id, first ? { size: "ms", comp: "ots", on: [b.who, other(scene, b.who)] } : { size: strong(b.mood) ? "cu" : "mcu", comp: "single", on: [b.who] }, first ? "Over the shoulder onto the speaker." : "Reverse: on the speaker."));
        first = false;
      }
      return out;
    }
  },
  {
    id: "reaction",
    name: "Reaction shots",
    group: "Coverage",
    desc: "Show the listener rather than the speaker for the line that lands.",
    how: "On each strong line, cut to the other person a moment into it.",
    example: "The audience laughs at the face that hears the news, not the mouth that says it.",
    apply: ({ scene }) => {
      const out = [shot(null, { size: "ws", comp: "group", on: castIds(scene) })];
      for (const b of says(scene)) {
        out.push(shot(b.id, { size: "ms", comp: "single", on: [b.who] }, "On the speaker."));
        if (strong(b.mood) || /[!?]$/.test(b.text.trim())) out.push(shot(b.id, { size: "mcu", comp: "single", on: [other(scene, b.who)] }, "Reaction: the listener takes it in.", "cut", 0, [], 1));
      }
      return out;
    }
  },
  {
    id: "yesilcam-zoom",
    name: "The Ye\u015Fil\xE7am shock zoom",
    group: "Emphasis",
    desc: "A crash zoom into a shocked face on the big revelation, often twice in a row.",
    how: "Before the shocking line: a medium shot that crash-zooms into a close-up; repeat on the listener.",
    example: '70s Turkish melodrama: "Your father\u2026 is not your father!" \u2014 zoom, zoom, zoom.',
    apply: ({ scene }) => {
      const out = [shot(null, { size: "ws", comp: "group", on: castIds(scene) })];
      const bs = says(scene);
      const big = bs.find((b) => strong(b.mood)) ?? bs[bs.length - 1];
      for (const b of bs) {
        if (b === big) {
          out.push(shot(b.id, { size: "ms", comp: "single", on: [b.who], move: "crash", amount: 1 }, "Crash zoom on the line."));
          out.push(shot(b.id, { size: "ms", comp: "single", on: [other(scene, b.who)], move: "crash", amount: 1.2 }, "And on the one who hears it.", "cut", 0, [], Math.max(0.8, b.text.length * 0.04)));
        } else out.push(shot(b.id, { size: "mcu", comp: "single", on: [b.who] }));
      }
      return out;
    }
  },
  {
    id: "push-realisation",
    name: "Slow push to a realisation",
    group: "Emphasis",
    desc: "The camera creeps toward a face as an idea dawns.",
    how: "A long medium shot that pushes in through the last lines.",
    example: "The detective understands; the lover decides.",
    apply: ({ scene }) => {
      const bs = says(scene);
      const last = bs[bs.length - 1];
      return [establishing(scene), shot(bs[0]?.id ?? null, { size: "ms", comp: "single", on: [last?.who ?? castIds(scene)[0]], move: "push", amount: 1.4, dof: true }, "A slow push in over the whole exchange.")];
    }
  },
  {
    id: "vertigo",
    name: "Vertigo moment (dolly zoom)",
    group: "Emphasis",
    desc: "The world stretches behind a frozen face.",
    how: "On the strongest line: a medium close-up with a dolly zoom.",
    example: "The moment of falling, of terrible recognition.",
    apply: ({ scene }) => {
      const bs = says(scene);
      const big = bs.find((b) => strong(b.mood)) ?? bs[Math.floor(bs.length / 2)];
      const out = [establishing(scene)];
      for (const b of bs) out.push(shot(b.id, b === big ? { size: "mcu", comp: "single", on: [other(scene, b.who)], move: "dollyzoom", amount: 1, lens: "wide" } : { size: "ms", comp: "single", on: [b.who] }, b === big ? "Dolly zoom on the listener." : ""));
      return out;
    }
  },
  {
    id: "hero-low",
    name: "Hero (or villain) from below",
    group: "Mood",
    desc: "Low angles make a character loom.",
    how: "Every line of the strongest character from a low angle, the others from slightly high.",
    example: "The villain's entrance; the underdog's stand.",
    apply: ({ scene }) => {
      const sp = speakers(scene);
      const boss = sp[0];
      return [establishing(scene), ...says(scene).map((b) => shot(b.id, { size: "mls", comp: "single", on: [b.who], angle: b.who === boss ? "low" : "high" }, b.who === boss ? "From below: power." : "From above: smaller."))];
    }
  },
  {
    id: "tension",
    name: "Dutch tension",
    group: "Mood",
    desc: "Tilted, tight, handheld framings make a calm scene unsettling.",
    how: "Close-ups with dutch angles that alternate direction, handheld.",
    example: "Interrogations, nightmares, madness.",
    apply: ({ scene }) => says(scene).map((b, i) => shot(i === 0 ? null : b.id, { size: "cu", comp: "single", on: [b.who], angle: "dutch", dir: i % 2 ? 1 : -1, move: "handheld" }, "Tilted and tight."))
  },
  {
    id: "walk-talk",
    name: "Walk and talk",
    group: "Movement",
    desc: "Track alongside characters as they walk and speak.",
    how: "A follow shot on whoever moves, two-shots with a truck when they talk.",
    example: "Corridors, streets, markets \u2014 dialogue that keeps moving.",
    apply: ({ scene }) => {
      const out = [shot(null, { size: "fs", comp: "group", on: castIds(scene), move: "truck", amount: 0.6 })];
      for (const b of scene.beats) {
        if (b.kind === "move") out.push(shot(b.id, { size: "fs", comp: "single", on: [b.who], move: "follow" }, "Follow the walk."));
        if (b.kind === "say") out.push(shot(b.id, { size: "ms", comp: "two", on: [b.who, other(scene, b.who)], move: "truck", amount: 0.4 }));
      }
      return out;
    }
  },
  {
    id: "oner",
    name: "The long take (oner)",
    group: "Movement",
    desc: "No cuts: one camera move carries the whole scene.",
    how: "One shot that starts wide, follows the first speaker and arcs through the scene.",
    example: "The bravura single take that makes you feel you were there.",
    apply: ({ scene }) => [shot(null, { size: "fs", comp: "group", on: castIds(scene), move: "arc", amount: 1.2, lens: "wide" }, "One continuous take.")]
  },
  {
    id: "cutaway",
    name: "Cutaway / insert",
    group: "Editing",
    desc: "Cut briefly to a detail or the place, then back.",
    how: "Midway through, a wide of the set for a beat, then back to the speakers.",
    example: "The clock on the wall; the street outside; the cat watching.",
    apply: ({ scene }) => {
      const bs = says(scene);
      const mid = bs[Math.floor(bs.length / 2)];
      const out = [shot(null, { size: "ms", comp: "two", on: castIds(scene).slice(0, 2) })];
      for (const b of bs) {
        if (b === mid) out.push(shot(b.id, { size: "ews", comp: "set", move: "pan", amount: 0.4 }, "Cutaway to the place."));
        else out.push(shot(b.id, { size: "mcu", comp: "single", on: [b.who] }));
      }
      return out;
    }
  },
  {
    id: "jcut",
    name: "J-cut and L-cut",
    group: "Editing",
    desc: "Sound leads or trails the picture: we hear the next speaker before we see them (J) or keep hearing them after we cut away (L).",
    how: "Each cut lands half a second after the line starts.",
    example: "Smooth, natural conversation editing.",
    apply: ({ scene }) => [shot(null, { size: "ms", comp: "two", on: castIds(scene).slice(0, 2) }), ...says(scene).slice(1).map((b) => shot(b.id, { size: "mcu", comp: "single", on: [b.who] }, "Cut lands after the line has begun (J-cut).", "cut", 0, [], 0.6))]
  },
  {
    id: "jump",
    name: "Jump cuts",
    group: "Editing",
    desc: "Cuts between nearly identical framings, so time jumps.",
    how: "The same single, re-cut on every line with small size changes.",
    example: "Restless energy, vlogs, comic impatience.",
    apply: ({ scene }) => says(scene).map((b, i) => shot(i === 0 ? null : b.id, { size: ["ms", "mcu", "ms", "cu"][i % 4], comp: "single", on: [b.who], nudge: [i % 3 * 30 - 30, 0] }, "Jump cut."))
  },
  {
    id: "smash",
    name: "Smash cut",
    group: "Editing",
    desc: "An abrupt cut from calm to chaos (or the reverse) for contrast or a joke.",
    how: "Quiet wide shots, then a hard cut to an extreme close-up on the last line.",
    example: '"Nothing could possibly go wrong." \u2014 CUT TO: everything going wrong.',
    apply: ({ scene }) => {
      const bs = says(scene);
      const last = bs[bs.length - 1];
      return [shot(null, { size: "ws", comp: "group", on: castIds(scene), move: "static" }, "Calm."), ...last ? [shot(last.id, { size: "ecu", comp: "single", on: [last.who], move: "shake" }, "SMASH.")] : []];
    }
  },
  {
    id: "pov",
    name: "Point of view",
    group: "Coverage",
    desc: "See what a character sees.",
    how: "A close-up of the looker, then a shot from their place onto what they look at.",
    example: "The hero spots the treasure; the villain watches from a window.",
    apply: ({ scene }) => {
      const [a, b] = castIds(scene);
      return [establishing(scene), shot(says(scene)[0]?.id ?? null, { size: "cu", comp: "single", on: [a] }, "The look."), shot(says(scene)[1]?.id ?? null, { size: "ms", comp: "single", on: [b ?? a], lens: "tele", move: "handheld" }, "What they see.")];
    }
  },
  {
    id: "kuleshov",
    name: "Kuleshov effect",
    group: "Editing",
    desc: "The same neutral face reads differently depending on what we cut to around it.",
    how: "Alternate a neutral close-up of one character with the other character and the place.",
    example: "A face + a bowl of soup = hunger; the same face + a coffin = grief.",
    apply: ({ scene }) => {
      const [a, b] = castIds(scene);
      return says(scene).flatMap((x, i) => [shot(i === 0 ? null : x.id, { size: "cu", comp: "single", on: [a] }, "The neutral face."), shot(x.id, i % 2 ? { size: "ews", comp: "set" } : { size: "ms", comp: "single", on: [b ?? a] }, 'What the face "means".', "cut", 0, [], 1.2)]);
    }
  },
  {
    id: "montage",
    name: "Montage",
    group: "Editing",
    desc: "A rhythm of short shots that compresses time.",
    how: "A new framing every beat, dissolves, music carries it.",
    example: "Training, falling in love, building the shop \u2014 in a minute.",
    apply: ({ scene }) => scene.beats.map((b, i) => shot(i === 0 ? null : b.id, { size: ["ws", "ms", "cu", "fs", "mcu", "ews"][i % 6], comp: "auto", on: "who" in b ? [b.who] : castIds(scene), move: ["arc", "push", "static", "truck", "pull", "pan"][i % 6] }, "Montage beat.", i === 0 ? "cut" : "dissolve", 0.5))
  },
  {
    id: "flashback",
    name: "Flashback",
    group: "Mood",
    desc: "The past: warm sepia, grain, a dream-soft edge, entered through a white flash or ripple.",
    how: "Sets the scene look to sepia and opens with a ripple transition.",
    example: '"Twenty years ago, in this very street\u2026"',
    apply: ({ scene }) => [shot(null, { size: "ws", comp: "group", on: castIds(scene), move: "push", amount: 0.5 }, "Into the past.", "ripple", 1.4, ["sepia"]), ...says(scene).map((b) => shot(b.id, { size: "ms", comp: "single", on: [b.who], move: "arc", amount: 0.3 }, "", "dissolve", 0.6, ["sepia"]))]
  },
  {
    id: "dream",
    name: "Dream sequence",
    group: "Mood",
    desc: "Soft glow, wobble, slow moves, dissolves.",
    how: "Dream look on every shot, slow arcs and dissolves.",
    example: "The hero dreams of the wedding that will never happen.",
    apply: ({ scene }) => [shot(null, { size: "ws", comp: "group", on: castIds(scene), move: "arc" }, "Drift in.", "flash", 1.2, ["dream", "stars"]), ...says(scene).map((b) => shot(b.id, { size: "mcu", comp: "single", on: [b.who], move: "push", amount: 0.6, dof: true }, "", "dissolve", 0.9, ["dream"]))]
  },
  {
    id: "establish-crane",
    name: "Crane down into the scene",
    group: "Openings & endings",
    desc: "Open from the sky and descend onto the characters.",
    how: "An extreme wide crane-down, then coverage.",
    example: "The opening of a town story.",
    apply: ({ scene }) => [shot(null, { size: "ews", comp: "set", move: "crane-down", amount: 1 }, "Descend into the place.", "fade", 1.2), ...says(scene).map((b) => shot(b.id, { size: "ms", comp: "single", on: [b.who] }))]
  },
  {
    id: "iris-out",
    name: "Iris-out ending",
    group: "Openings & endings",
    desc: "End on a wide and close an iris on the main character.",
    how: "Coverage, then a wide with a crane up; the next shot comes in through an iris.",
    example: "Silent comedies end with an iris on the hero's wink.",
    apply: ({ scene }) => [shot(null, { size: "ms", comp: "two", on: castIds(scene).slice(0, 2) }), ...says(scene).slice(1).map((b) => shot(b.id, { size: "mcu", comp: "single", on: [b.who] })), shot(says(scene).slice(-1)[0]?.id ?? null, { size: "ws", comp: "group", on: castIds(scene), move: "crane-up" }, "Rise away at the end.", "iris", 1, [], 1.5)]
  },
  {
    id: "rack-reveal",
    name: "Rack-focus reveal",
    group: "Emphasis",
    desc: "Focus pulls from the background to someone who was there all along.",
    how: "Opens on a shallow-focus shot with a rack to the subject.",
    example: "The killer was standing behind them the whole time.",
    apply: ({ scene }) => [shot(null, { size: "mcu", comp: "single", on: [castIds(scene)[0]], move: "rack", dof: true, lens: "tele" }, "Focus pulls to the face."), ...says(scene).slice(1).map((b) => shot(b.id, { size: "ms", comp: "single", on: [b.who] }))]
  },
  {
    id: "action",
    name: "Action coverage",
    group: "Movement",
    desc: "Wide for geography, tight for impact, shakes on hits.",
    how: "Wides on moves, crash zooms on shouts, shakes on effects.",
    example: "A chase through the bazaar; a fight in the castle yard.",
    apply: ({ scene }) => {
      const out = [shot(null, { size: "ws", comp: "group", on: castIds(scene), lens: "wide", move: "handheld" })];
      for (const b of scene.beats) {
        if (b.kind === "move") out.push(shot(b.id, { size: "fs", comp: "single", on: [b.who], move: "follow", lens: "wide" }));
        else if (b.kind === "vfx" || b.kind === "sfx") out.push(shot(b.id, { size: "ws", comp: "group", on: castIds(scene), move: "shake" }, "Impact."));
        else if (b.kind === "say") out.push(shot(b.id, { size: strong(b.mood) ? "cu" : "ms", comp: "single", on: [b.who], angle: strong(b.mood) ? "low" : "eye", move: strong(b.mood) ? "crash" : "handheld" }));
      }
      return out;
    }
  },
  {
    id: "sitcom",
    name: "Multi-camera sitcom",
    group: "Coverage",
    desc: 'The studio-audience look: a wide master from the "fourth wall", two-shots for banter, singles on punchlines, and a reaction right after each joke lands.',
    how: "Wide on entrances and moves, two-shots for exchanges, a medium single on each punchline (lines ending in ! or ?), then the listener's reaction.",
    example: "Two flatmates arguing on the sofa while the neighbour barges in.",
    apply: ({ scene }) => {
      const cast = castIds(scene);
      const out = [shot(null, { size: "ws", comp: "group", on: cast }, "The master: the whole room from the fourth wall.")];
      let n = 0;
      for (const b of scene.beats) {
        if (b.kind === "act" && b.visible) out.push(shot(b.id, { size: "ws", comp: "group", on: cast }, "Back to the master for the entrance."));
        else if (b.kind === "move") out.push(shot(b.id, { size: "fs", comp: "single", on: [b.who], move: "follow" }, "Follow the cross."));
        else if (b.kind === "say") {
          const punch = /[!?]$/.test(b.text.trim()) || strong(b.mood);
          if (punch) {
            out.push(shot(b.id, { size: "ms", comp: "single", on: [b.who] }, "Punchline single."));
            out.push(shot(b.id, { size: "mcu", comp: "single", on: [other(scene, b.who)] }, "The reaction sells the joke.", "cut", 0, [], Math.max(0.8, b.text.length * 0.05)));
          } else if (n++ % 3 === 0) out.push(shot(b.id, { size: "ms", comp: "two", on: [b.who, other(scene, b.who)] }, "Two-shot for the banter."));
        }
      }
      return out;
    }
  },
  {
    id: "deadpan",
    name: "Deadpan single-camera comedy",
    group: "Mood",
    desc: "A locked-off, centred, patient camera: the joke is in the stillness and the awkward pause, then a hard cut to a blank face.",
    how: "Static wide frames held through the exchange; on the last line a centred, still close-up.",
    example: "Two friends staring at a broken TV for far too long.",
    apply: ({ scene }) => {
      const bs = says(scene);
      const last = bs[bs.length - 1];
      return [
        shot(null, { size: "ws", comp: "group", on: castIds(scene), move: "static" }, "Locked off. Let it play."),
        ...bs.filter((_, i) => i % 3 === 2).map((b) => shot(b.id, { size: "fs", comp: "two", on: [b.who, other(scene, b.who)] }, "A flat, centred two-shot.")),
        ...last ? [shot(last.id, { size: "cu", comp: "single", on: [other(scene, last.who)] }, "The blank stare.", "cut", 0, [], Math.max(0.6, last.text.length * 0.055))] : []
      ];
    }
  }
];

// src/audio/sfx.ts
var midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function tone(k, f0, f1, dur, type = "sine", vol = 0.3, delay = 0, attack = 8e-3) {
  const { ctx, out } = k;
  const t = k.t + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}
var noiseBuf = null;
function noiseBuffer(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < len; i++) {
    s = s * 1103515245 + 12345 & 2147483647;
    d[i] = s / 2147483647 * 2 - 1;
  }
  noiseBuf = b;
  return b;
}
function noise(k, dur, f0, f1, vol = 0.3, q = 1, delay = 0, type = "bandpass", attack = 0.3) {
  const { ctx, out } = k;
  const t = k.t + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.max(3e-3, dur * attack));
  g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, k.rand() * 1.5);
  s.stop(t + dur + 0.05);
}
function call(k, f0, f1, dur, formants, vol = 0.3, delay = 0, vib = 0) {
  const { ctx, out } = k;
  const t = k.t + delay;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (vib) {
    const l = ctx.createOscillator();
    l.frequency.value = 6;
    const lg = ctx.createGain();
    lg.gain.value = vib;
    l.connect(lg).connect(o.frequency);
    l.start(t);
    l.stop(t + dur + 0.1);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.15);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  for (const f of formants) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = 5;
    o.connect(bp).connect(g);
  }
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function bell(k, f, vol = 0.15, delay = 0, dur = 1.6) {
  tone(k, f, f, dur, "sine", vol, delay, 4e-3);
  tone(k, f * 2.76, f * 2.76, dur * 0.5, "sine", vol * 0.35, delay, 4e-3);
  tone(k, f * 5.4, f * 5.4, dur * 0.25, "sine", vol * 0.15, delay, 4e-3);
}
var steps = (k, n, gap, vol = 0.35) => {
  for (let i = 0; i < n; i++) noise(k, 0.09, 900, 200, vol, 1.2, i * gap, "lowpass", 0.05);
};
var SFX = {
  "door-knock": ["Knock knock", "\u{1F6AA}", 1, (k) => [0, 0.22, 0.44].forEach((d) => {
    noise(k, 0.08, 500, 150, 0.6, 2, d, "lowpass", 0.02);
    tone(k, 140, 90, 0.08, "sine", 0.4, d);
  })],
  "door-slam": ["Door slam", "\u{1F4A5}", 1.2, (k) => {
    noise(k, 0.5, 600, 60, 0.8, 0.8, 0, "lowpass", 0.01);
    tone(k, 90, 40, 0.4, "sine", 0.6);
  }],
  "door-creak": ["Creaky door", "\u{1F6AA}", 1.8, (k) => {
    call(k, 180, 520, 1.5, [900, 2200], 0.25, 0, 30);
  }],
  footsteps: ["Footsteps", "\u{1F45E}", 2.2, (k) => steps(k, 6, 0.36)],
  running: ["Running feet", "\u{1F3C3}", 1.6, (k) => steps(k, 9, 0.16, 0.3)],
  applause: ["Applause", "\u{1F44F}", 3.5, (k) => {
    for (let i = 0; i < 160; i++) noise(k, 0.04, 2500, 1500, 0.08 + k.rand() * 0.06, 1, k.rand() * 3, "bandpass", 0.05);
  }],
  "laugh-crowd": ["Audience laugh", "\u{1F602}", 2.8, (k) => {
    for (let p = 0; p < 7; p++) for (let i = 0; i < 6; i++) call(k, 160 + p * 35, 140 + p * 30, 0.16, [700 + p * 60, 1300], 0.05, 0.3 + i * 0.26 + k.rand() * 0.1);
  }],
  "gasp-crowd": ["Crowd gasp", "\u{1F62E}", 1.5, (k) => {
    noise(k, 1, 1200, 2400, 0.25, 0.7, 0, "bandpass", 0.2);
    for (let p = 0; p < 5; p++) call(k, 200 + p * 40, 320 + p * 40, 0.5, [800, 1600], 0.04, 0.05);
  }],
  cheer: ["Crowd cheer", "\u{1F389}", 3, (k) => {
    noise(k, 2.6, 1500, 1e3, 0.25, 0.6, 0, "bandpass", 0.2);
    for (let p = 0; p < 6; p++) call(k, 260 + p * 30, 380 + p * 20, 1.4, [900, 2e3], 0.04, k.rand() * 0.6, 20);
  }],
  boo: ["Booing", "\u{1F44E}", 2.5, (k) => {
    for (let p = 0; p < 6; p++) call(k, 130 + p * 15, 100 + p * 10, 2, [500, 900], 0.06, k.rand() * 0.3, 8);
  }],
  "phone-ring": ["Old phone ring", "\u260E\uFE0F", 2.4, (k) => [0, 1.2].forEach((d) => {
    for (let i = 0; i < 16; i++) tone(k, 1200, 1200, 0.03, "square", 0.06, d + i * 0.05);
  })],
  doorbell: ["Doorbell", "\u{1F514}", 1.6, (k) => {
    bell(k, midi(76), 0.2);
    bell(k, midi(72), 0.2, 0.45);
  }],
  "clock-tick": ["Clock ticking", "\u{1F570}\uFE0F", 3, (k) => {
    for (let i = 0; i < 6; i++) tone(k, i % 2 ? 2200 : 1800, 1600, 0.03, "square", 0.08, i * 0.5);
  }],
  "clock-chime": ["Clock chime", "\u{1F55B}", 4, (k) => [0, 1, 2].forEach((i) => bell(k, midi(60), 0.2, i * 1.1, 2))],
  "glass-break": ["Glass breaking", "\u{1F377}", 1.5, (k) => {
    noise(k, 0.6, 6e3, 3e3, 0.4, 2, 0, "highpass", 0.01);
    for (let i = 0; i < 12; i++) tone(k, 2500 + k.rand() * 3e3, 2e3, 0.15, "sine", 0.06, k.rand() * 0.5);
  }],
  crash: ["Crash!", "\u{1F4A5}", 1.8, (k) => {
    noise(k, 1.2, 3e3, 300, 0.6, 0.5, 0, "lowpass", 0.01);
    for (let i = 0; i < 8; i++) noise(k, 0.15, 1500, 600, 0.3, 2, k.rand() * 0.8, "bandpass", 0.05);
  }],
  punch: ["Punch", "\u{1F44A}", 0.6, (k) => {
    noise(k, 0.15, 1200, 100, 0.8, 1, 0, "lowpass", 0.02);
    tone(k, 120, 50, 0.2, "sine", 0.7);
  }],
  slap: ["Slap", "\u{1F590}\uFE0F", 0.5, (k) => noise(k, 0.12, 4e3, 1500, 0.8, 0.7, 0, "highpass", 0.02)],
  boing: ["Boing", "\u{1F300}", 1.2, (k) => {
    const o = tone(k, 180, 180, 1, "triangle", 0.35);
    const l = k.ctx.createOscillator();
    l.frequency.value = 9;
    const g = k.ctx.createGain();
    g.gain.setValueAtTime(90, k.t);
    g.gain.exponentialRampToValueAtTime(1, k.t + 1);
    l.connect(g).connect(o.frequency);
    l.start(k.t);
    l.stop(k.t + 1.1);
  }],
  "slide-whistle": ["Slide whistle", "\u{1F3BA}", 1.4, (k) => {
    tone(k, 500, 1800, 0.5, "sine", 0.25);
    tone(k, 1800, 400, 0.6, "sine", 0.25, 0.55);
  }],
  "drum-roll": ["Drum roll", "\u{1F941}", 2.6, (k) => {
    for (let i = 0; i < 70; i++) noise(k, 0.05, 2e3, 900, 0.1 + i * 3e-3, 1, i * 0.032, "bandpass", 0.1);
    noise(k, 0.6, 2500, 600, 0.6, 0.6, 2.25, "bandpass", 0.02);
  }],
  rimshot: ["Ba-dum-tss", "\u{1F941}", 1.6, (k) => {
    tone(k, 180, 90, 0.15, "sine", 0.5);
    tone(k, 120, 60, 0.2, "sine", 0.6, 0.18);
    noise(k, 0.8, 9e3, 6e3, 0.25, 0.5, 0.42, "highpass", 0.01);
  }],
  "sad-trombone": ["Sad trombone", "\u{1F3BA}", 2.6, (k) => {
    [67, 66, 65].forEach((n, i) => call(k, midi(n - 12), midi(n - 12), 0.45, [600, 1200], 0.25, i * 0.5, 0));
    call(k, midi(52), midi(51), 1.2, [600, 1200], 0.25, 1.5, 6);
  }],
  "ta-da": ["Ta-da!", "\u{1F38A}", 1.6, (k) => {
    [60, 64, 67].forEach((n) => tone(k, midi(n), midi(n), 0.15, "sawtooth", 0.08));
    [60, 64, 67, 72].forEach((n) => tone(k, midi(n), midi(n), 1.2, "sawtooth", 0.07, 0.2));
  }],
  explosion: ["Explosion", "\u{1F4A3}", 3, (k) => {
    noise(k, 2.6, 1200, 40, 0.9, 0.5, 0, "lowpass", 0.01);
    tone(k, 80, 25, 2, "sine", 0.8);
  }],
  cannon: ["Cannon / gunshot", "\u{1F52B}", 1.6, (k) => {
    noise(k, 0.8, 3e3, 100, 0.9, 0.5, 0, "lowpass", 5e-3);
    tone(k, 150, 40, 0.5, "sine", 0.6);
  }],
  thunder: ["Thunder", "\u26C8\uFE0F", 4, (k) => {
    noise(k, 0.3, 4e3, 1500, 0.5, 0.5, 0, "highpass", 0.01);
    noise(k, 3.6, 400, 50, 0.8, 0.4, 0.15, "lowpass", 0.08);
  }],
  "wind-gust": ["Wind gust", "\u{1F32C}\uFE0F", 3, (k) => noise(k, 2.8, 300, 900, 0.4, 3, 0, "bandpass", 0.5)],
  "car-horn": ["Car horn", "\u{1F697}", 1.2, (k) => [0, 0.45].forEach((d) => {
    tone(k, 420, 420, 0.32, "square", 0.1, d);
    tone(k, 530, 530, 0.32, "square", 0.08, d);
  })],
  "car-engine": ["Car engine", "\u{1F699}", 3, (k) => {
    const o = tone(k, 45, 70, 2.8, "sawtooth", 0.3, 0, 0.3);
    void o;
    noise(k, 2.8, 300, 500, 0.15, 2, 0, "lowpass", 0.3);
  }],
  "tram-bell": ["Tram bell", "\u{1F68B}", 1.4, (k) => [0, 0.25].forEach((d) => bell(k, midi(81), 0.2, d, 0.8))],
  "ship-horn": ["Ship horn", "\u{1F6A2}", 3.2, (k) => {
    tone(k, 110, 108, 2.8, "sawtooth", 0.18, 0, 0.2);
    tone(k, 165, 162, 2.8, "sawtooth", 0.12, 0, 0.2);
  }],
  "plane-flyby": ["Plane fly-by", "\u2708\uFE0F", 4, (k) => {
    noise(k, 3.8, 200, 1800, 0.4, 1.5, 0, "bandpass", 0.5);
    tone(k, 140, 90, 3.8, "sawtooth", 0.08, 0, 1.5);
  }],
  "rocket-launch": ["Rocket launch", "\u{1F680}", 4, (k) => {
    noise(k, 3.8, 200, 2e3, 0.7, 0.4, 0, "lowpass", 0.3);
    tone(k, 60, 200, 3.5, "sawtooth", 0.15, 0, 0.5);
  }],
  laser: ["Laser zap", "\u{1F52B}", 0.6, (k) => tone(k, 2400, 200, 0.35, "square", 0.15)],
  teleport: ["Teleport", "\u{1F300}", 1.5, (k) => {
    for (let i = 0; i < 10; i++) tone(k, 400 + i * 180, 900 + i * 220, 0.12, "sine", 0.1, i * 0.08);
  }],
  "robot-beep": ["Robot beeps", "\u{1F916}", 1.2, (k) => {
    for (let i = 0; i < 6; i++) tone(k, 600 + i * 7 % 5 * 220, 600 + i * 7 % 5 * 220, 0.09, "square", 0.08, i * 0.13);
  }],
  "magic-chime": ["Magic chime", "\u2728", 2.2, (k) => [72, 76, 79, 84, 88, 91].forEach((n, i) => bell(k, midi(n), 0.12, i * 0.08, 1.4))],
  "ghost-wail": ["Ghost wail", "\u{1F47B}", 3, (k) => call(k, 300, 520, 2.8, [700, 1100], 0.22, 0, 25)],
  "owl-hoot": ["Owl hoot", "\u{1F989}", 2, (k) => [0, 0.5, 0.8].forEach((d) => tone(k, 420, 380, 0.3, "sine", 0.2, d, 0.05))],
  "wolf-howl": ["Wolf howl", "\u{1F43A}", 3.5, (k) => call(k, 350, 700, 3.2, [800, 1600], 0.22, 0, 12)],
  rooster: ["Rooster", "\u{1F413}", 2, (k) => {
    call(k, 500, 800, 0.3, [1200, 2600], 0.25);
    call(k, 800, 900, 0.8, [1400, 2800], 0.25, 0.35, 15);
    call(k, 900, 500, 0.4, [1200, 2400], 0.2, 1.15);
  }],
  moo: ["Cow moo", "\u{1F404}", 2, (k) => call(k, 110, 95, 1.6, [400, 800], 0.35, 0, 3)],
  bark: ["Dog bark", "\u{1F415}", 1.2, (k) => [0, 0.35].forEach((d) => call(k, 380, 260, 0.16, [700, 1700], 0.4, d))],
  meow: ["Cat meow", "\u{1F408}", 1.2, (k) => call(k, 600, 850, 0.7, [1e3, 2400], 0.25, 0, 8)],
  baa: ["Sheep baa", "\u{1F411}", 1.2, (k) => call(k, 300, 280, 0.8, [800, 1800], 0.25, 0, 40)],
  "bird-chirp": ["Birds chirping", "\u{1F426}", 2, (k) => {
    for (let i = 0; i < 8; i++) tone(k, 3e3 + k.rand() * 1500, 4200 + k.rand() * 800, 0.07, "sine", 0.08, k.rand() * 1.6);
  }],
  seagulls: ["Seagulls", "\u{1F54A}\uFE0F", 2.4, (k) => {
    for (let i = 0; i < 4; i++) call(k, 1200, 800, 0.35, [2e3, 3200], 0.12, i * 0.5 + k.rand() * 0.2);
  }],
  splash: ["Splash", "\u{1F4A6}", 1.4, (k) => {
    noise(k, 1, 3e3, 500, 0.6, 0.6, 0, "lowpass", 0.02);
    for (let i = 0; i < 6; i++) tone(k, 800 + k.rand() * 900, 1500, 0.06, "sine", 0.08, 0.1 + k.rand() * 0.6);
  }],
  whoosh: ["Whoosh", "\u{1F4A8}", 1, (k) => noise(k, 0.7, 300, 2400, 0.45, 0.8, 0, "bandpass", 0.5)],
  pop: ["Pop", "\u{1FAE7}", 0.4, (k) => tone(k, 500, 1100, 0.09, "sine", 0.35)],
  heartbeat: ["Heartbeat", "\u{1F493}", 2.4, (k) => [0, 1.1].forEach((d) => {
    tone(k, 70, 40, 0.15, "sine", 0.8, d);
    tone(k, 60, 35, 0.15, "sine", 0.6, d + 0.22);
  })],
  typewriter: ["Typewriter", "\u2328\uFE0F", 2.4, (k) => {
    for (let i = 0; i < 16; i++) noise(k, 0.03, 3e3, 2e3, 0.35, 3, i * 0.12 + k.rand() * 0.04, "bandpass", 0.05);
    bell(k, 2100, 0.12, 2.1, 0.5);
  }],
  "camera-shutter": ["Camera click", "\u{1F4F8}", 0.6, (k) => {
    noise(k, 0.04, 4e3, 3e3, 0.5, 2, 0, "bandpass", 0.1);
    noise(k, 0.05, 3e3, 2e3, 0.4, 2, 0.12, "bandpass", 0.1);
  }],
  ding: ["Ding!", "\u{1F6CE}\uFE0F", 1.4, (k) => bell(k, midi(84), 0.2, 0, 1.2)],
  kiss: ["Smooch", "\u{1F48B}", 0.6, (k) => {
    noise(k, 0.08, 1800, 900, 0.4, 2, 0, "bandpass", 0.2);
    tone(k, 900, 1400, 0.08, "sine", 0.15, 0.04);
  }],
  snore: ["Snore", "\u{1F634}", 3, (k) => [0, 1.5].forEach((d) => {
    noise(k, 0.9, 150, 300, 0.4, 3, d, "lowpass", 0.5);
    tone(k, 70, 80, 0.9, "sawtooth", 0.1, d, 0.4);
  })],
  siren: ["Siren", "\u{1F6A8}", 3, (k) => {
    for (let i = 0; i < 3; i++) {
      tone(k, 650, 950, 0.5, "square", 0.05, i);
      tone(k, 950, 650, 0.5, "square", 0.05, i + 0.5);
    }
  }],
  "church-bell": ["Big bell", "\u{1F514}", 4, (k) => [0, 1.3].forEach((d) => bell(k, midi(48), 0.3, d, 2.6))],
  coin: ["Coin", "\u{1FA99}", 0.6, (k) => {
    tone(k, midi(83), midi(83), 0.08, "square", 0.08);
    tone(k, midi(88), midi(88), 0.3, "square", 0.08, 0.08);
  }],
  "record-scratch": ["Record scratch", "\u{1F4BF}", 0.8, (k) => {
    noise(k, 0.3, 800, 3e3, 0.5, 4, 0, "bandpass", 0.1);
    noise(k, 0.25, 2500, 600, 0.5, 4, 0.3, "bandpass", 0.1);
  }],
  gong: ["Gong", "\u{1F941}", 4, (k) => {
    bell(k, 90, 0.35, 0, 3.6);
    noise(k, 3, 400, 200, 0.12, 2, 0, "bandpass", 0.05);
  }]
};
var SFX_NAMES = Object.keys(SFX);

// src/audio/music.ts
var MAJOR = [0, 2, 4, 5, 7, 9, 11];
var MINOR = [0, 2, 3, 5, 7, 8, 10];
var HICAZ = [0, 1, 4, 5, 7, 8, 10];
var DORIAN = [0, 2, 3, 5, 7, 9, 10];
var WHOLE = [0, 2, 4, 6, 8, 10];
var PENTA = [0, 2, 4, 7, 9];
var STYLES = {
  nostalgia: { name: "Ye\u015Fil\xE7am nostalgia", bpm: 92, root: 57, scale: MINOR, prog: [0, 3, 6, 4], beats: 3, three: true, lead: "square", bass: "triangle", pad: "sawtooth", drums: "waltz", busy: 0.55, vibrato: 6, bright: 0.45 },
  comedy: { name: "Comedy bounce", bpm: 132, root: 60, scale: MAJOR, prog: [0, 4, 5, 3], beats: 4, lead: "square", bass: "triangle", pad: null, drums: "soft", busy: 0.75, bright: 0.7 },
  romance: { name: "Romance", bpm: 76, root: 62, scale: MAJOR, prog: [0, 5, 3, 4], beats: 4, lead: "sine", bass: "sine", pad: "sawtooth", drums: "none", busy: 0.35, vibrato: 5, bright: 0.4 },
  tension: { name: "Tension", bpm: 100, root: 45, scale: MINOR, prog: [0, 0, 5, 4], beats: 4, lead: "sawtooth", bass: "sawtooth", pad: "sawtooth", drums: "pulse", busy: 0.25, bright: 0.25 },
  action: { name: "Action chase", bpm: 152, root: 50, scale: DORIAN, prog: [0, 6, 5, 6], beats: 4, lead: "sawtooth", bass: "square", pad: null, drums: "rock", busy: 0.8, bright: 0.65 },
  sad: { name: "Sad piano", bpm: 66, root: 57, scale: MINOR, prog: [0, 5, 2, 6], beats: 4, lead: "triangle", bass: "sine", pad: "sine", drums: "none", busy: 0.3, bright: 0.3 },
  mystery: { name: "Mystery", bpm: 84, root: 52, scale: WHOLE, prog: [0, 1, 0, 2], beats: 4, lead: "triangle", bass: "sine", pad: "sine", drums: "soft", busy: 0.35, bright: 0.35 },
  epic: { name: "Epic", bpm: 96, root: 48, scale: MINOR, prog: [0, 5, 2, 6], beats: 4, lead: "sawtooth", bass: "sawtooth", pad: "sawtooth", drums: "march", busy: 0.45, bright: 0.6 },
  space: { name: "Space synth", bpm: 110, root: 52, scale: PENTA, prog: [0, 3, 1, 2], beats: 4, lead: "square", bass: "sawtooth", pad: "sine", drums: "pulse", busy: 0.9, bright: 0.55 },
  spooky: { name: "Spooky", bpm: 72, root: 50, scale: [0, 1, 3, 6, 7, 8, 11], prog: [0, 1, 0, 3], beats: 4, lead: "sine", bass: "triangle", pad: "square", drums: "none", busy: 0.4, vibrato: 18, bright: 0.3 },
  jazz: { name: "Caf\xE9 jazz", bpm: 120, root: 55, scale: DORIAN, prog: [1, 4, 0, 5], beats: 4, lead: "triangle", bass: "triangle", pad: "sine", drums: "swing", busy: 0.6, bright: 0.5 },
  bazaar: { name: "Bazaar (Hicaz)", bpm: 116, root: 57, scale: HICAZ, prog: [0, 0, 6, 0], beats: 4, lead: "sawtooth", bass: "triangle", pad: null, drums: "darbuka", busy: 0.7, vibrato: 7, bright: 0.55 },
  ragtime: { name: "Silent-film piano (ragtime)", bpm: 116, root: 60, scale: MAJOR, prog: [0, 3, 0, 4, 5, 1, 4, 0], beats: 4, lead: "triangle", bass: "triangle", pad: null, drums: "none", stride: true, busy: 0.85, bright: 0.65 },
  "silent-drama": { name: "Silent-film piano (drama)", bpm: 84, root: 57, scale: MINOR, prog: [0, 3, 4, 0, 5, 3, 4, 4], beats: 4, lead: "triangle", bass: "triangle", pad: null, drums: "none", stride: true, busy: 0.55, vibrato: 3, bright: 0.45 },
  country: { name: "Country fiddle", bpm: 124, root: 55, scale: MAJOR, prog: [0, 3, 4, 0], beats: 4, lead: "sawtooth", bass: "triangle", pad: null, drums: "soft", busy: 0.7, vibrato: 5, bright: 0.6 }
};
var MUSIC_MOODS = Object.keys(STYLES);

// src/render/fx.ts
var R = (seed) => {
  let s = seed * 2654435761 >>> 0 || 1;
  return () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296;
};
function field(c, info, n, fn, vx, vy) {
  const r = R(info.seed + 11);
  const { W: W17, H, t } = info;
  for (let i = 0; i < n; i++) {
    const x0 = r() * W17;
    const y0 = r() * H;
    const sp = 0.6 + r() * 0.8;
    const x = ((x0 + vx * sp * t) % W17 + W17) % W17;
    const y = ((y0 + vy * sp * t) % H + H) % H;
    fn(i, r, x, y);
  }
}
var FX = [
  // ——— looks ———
  { id: "sepia", name: "Sepia flashback", kind: "look", icon: "\u{1F4DC}", desc: "Warm brown memories: the classic flashback.", grade: (g) => {
    g.uSepia = 0.9;
    g.uVignette += 0.35;
    g.uGrain += 0.05;
  } },
  { id: "noir", name: "Film noir", kind: "look", icon: "\u{1F575}\uFE0F", desc: "Black and white with crushed shadows: crime, rain, secrets.", grade: (g) => {
    g.uBW = 1;
    g.uCon *= 1.35;
    g.uVignette += 0.5;
    g.uGrain += 0.06;
  } },
  { id: "bw", name: "Black & white", kind: "look", icon: "\u{1F39E}\uFE0F", desc: "Old Ye\u015Fil\xE7am stock, no colour.", grade: (g) => {
    g.uBW = 1;
    g.uGrain += 0.04;
  } },
  { id: "seventies", name: "70s film", kind: "look", icon: "\u{1F7E0}", desc: "Faded, warm, grainy colour stock with flicker and dust \u2014 Ye\u015Fil\xE7am in its golden age.", grade: (g) => {
    g.uWarm += 0.6;
    g.uSat *= 0.8;
    g.uCon *= 0.92;
    g.uBri += 0.03;
    g.uGrain += 0.08;
    g.uScratch = 0.7;
    g.uFlicker = 1;
    g.uVignette += 0.3;
  } },
  { id: "oldfilm", name: "Silent film", kind: "look", icon: "\u{1F3A9}", desc: "Scratched, flickering black and white from the 1920s.", grade: (g) => {
    g.uBW = 1;
    g.uSepia = 0.25;
    g.uScratch = 1;
    g.uFlicker = 2;
    g.uGrain += 0.12;
    g.uVignette += 0.6;
  } },
  { id: "handtint", name: "Hand-tinted 1900s", kind: "look", icon: "\u{1F58C}\uFE0F", desc: "Early cinema stock coloured by hand: soft sepia, gentle washed colours, flicker, dust and scratches.", grade: (g) => {
    g.uSepia = 0.45;
    g.uSat *= 0.85;
    g.uCon *= 1.05;
    g.uScratch = 0.6;
    g.uFlicker = 1.4;
    g.uGrain += 0.06;
    g.uVignette += 0.3;
    g.uWarm += 0.2;
  } },
  { id: "dream", name: "Dream", kind: "look", icon: "\u2601\uFE0F", desc: "Soft glow, lifted blacks, a little wobble.", grade: (g) => {
    g.uBloom += 1.4;
    g.uBri += 0.06;
    g.uCon *= 0.85;
    g.uSat *= 1.1;
    g.uWave = 0.6;
    g.uVignette += 0.2;
  } },
  { id: "vhs", name: "VHS tape", kind: "look", icon: "\u{1F4FC}", desc: "Scan lines, colour bleed and tracking noise.", grade: (g) => {
    g.uScan = 1;
    g.uChroma += 1.2;
    g.uSat *= 1.15;
    g.uGrain += 0.04;
  } },
  { id: "cold", name: "Cold blue", kind: "look", icon: "\u{1F9CA}", desc: "Steel-blue grade for loneliness, night, sci-fi.", grade: (g) => {
    g.uWarm -= 0.8;
    g.uSat *= 0.85;
  } },
  { id: "warm", name: "Golden hour", kind: "look", icon: "\u{1F305}", desc: "Warm, saturated, romantic.", grade: (g) => {
    g.uWarm += 0.8;
    g.uSat *= 1.15;
    g.uBloom += 0.4;
  } },
  { id: "bleach", name: "Bleach bypass", kind: "look", icon: "\u2694\uFE0F", desc: "Low saturation, high contrast: war films.", grade: (g) => {
    g.uSat *= 0.45;
    g.uCon *= 1.3;
    g.uGrain += 0.05;
  } },
  { id: "technicolor", name: "Technicolor", kind: "look", icon: "\u{1F308}", desc: "Candy-bright colour of old musicals.", grade: (g) => {
    g.uSat *= 1.5;
    g.uCon *= 1.1;
  } },
  { id: "nightvision", name: "Night vision", kind: "look", icon: "\u{1F7E2}", desc: "Green goggles with sensor noise.", grade: (g) => {
    g.uNight = 1;
    g.uVignette += 0.8;
  } },
  { id: "thermal", name: "Thermal camera", kind: "look", icon: "\u{1F321}\uFE0F", desc: "Heat-map colours.", grade: (g) => {
    g.uThermal = 1;
  } },
  { id: "underwater", name: "Underwater", kind: "look", icon: "\u{1F30A}", desc: "Wavy, blue-green, dim.", grade: (g) => {
    g.uWave = 2.5;
    g.uTint = [0.4, 0.85, 1];
    g.uTintAmt = 0.45;
    g.uBri -= 0.05;
  } },
  { id: "comic", name: "Comic book", kind: "look", icon: "\u{1F4A5}", desc: "Posterised colours with halftone dots.", grade: (g) => {
    g.uPosterize = 1;
    g.uHalftone = 0.7;
    g.uSat *= 1.3;
  } },
  { id: "horror", name: "Horror", kind: "look", icon: "\u{1FA78}", desc: "Sick green-grey, deep vignette.", grade: (g) => {
    g.uSat *= 0.55;
    g.uTint = [0.75, 1, 0.75];
    g.uTintAmt = 0.25;
    g.uVignette += 0.8;
    g.uCon *= 1.15;
  } },
  { id: "negative", name: "Negative", kind: "look", icon: "\u{1F504}", desc: "Inverted colours (a vision, a shock).", grade: (g) => {
    g.uInvert = 1;
  } },
  { id: "glow", name: "Soft glow", kind: "look", icon: "\u2728", desc: "Bright parts bleed light.", grade: (g) => {
    g.uBloom += 1.1;
  } },
  // ——— particles ———
  {
    id: "rain",
    name: "Rain",
    kind: "particles",
    icon: "\u{1F327}\uFE0F",
    desc: "Slanted rain streaks over the frame.",
    grade: (g) => {
      g.uSat *= 0.85;
      g.uBri -= 0.04;
    },
    draw: (c, i) => {
      c.strokeStyle = "rgba(220,232,255,0.45)";
      c.lineWidth = Math.max(1, i.W / 900);
      field(c, i, 220, (_, __, x, y) => {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - i.H * 0.02, y + i.H * 0.07);
        c.stroke();
      }, -i.W * 0.25, i.H * 2.2);
    }
  },
  {
    id: "storm",
    name: "Thunderstorm",
    kind: "particles",
    icon: "\u26C8\uFE0F",
    desc: "Heavy rain with lightning flashes now and then.",
    grade: (g, i) => {
      g.uSat *= 0.7;
      g.uBri -= 0.08;
      const k = i.t % 7.3;
      g.uFlash = k < 0.12 ? 0.75 : k > 0.25 && k < 0.33 ? 0.4 : 0;
    },
    draw: (c, i) => {
      c.strokeStyle = "rgba(220,232,255,0.5)";
      c.lineWidth = Math.max(1, i.W / 800);
      field(c, i, 340, (_, __, x, y) => {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - i.H * 0.03, y + i.H * 0.09);
        c.stroke();
      }, -i.W * 0.35, i.H * 2.8);
    }
  },
  { id: "snow", name: "Snow", kind: "particles", icon: "\u2744\uFE0F", desc: "Gentle snowfall.", draw: (c, i) => {
    field(c, i, 160, (k, r, x, y) => {
      const s = (1 + k % 3) * i.W / 900;
      c.fillStyle = "rgba(255,255,255,0.85)";
      c.beginPath();
      c.arc(x + Math.sin(i.t * 1.3 + k) * 10, y, s * 2, 0, 7);
      c.fill();
      void r;
    }, i.W * 0.02, i.H * 0.12);
  } },
  { id: "dust", name: "Dust motes", kind: "particles", icon: "\u{1F32B}\uFE0F", desc: "Specks of dust floating in a sunbeam.", draw: (c, i) => {
    field(c, i, 70, (k, _, x, y) => {
      c.fillStyle = `rgba(255,240,200,${0.25 + k % 3 * 0.12})`;
      c.beginPath();
      c.arc(x + Math.sin(i.t * 0.7 + k) * 20, y + Math.cos(i.t * 0.5 + k) * 14, i.W / 700, 0, 7);
      c.fill();
    }, i.W * 0.01, -i.H * 0.01);
  } },
  { id: "embers", name: "Embers", kind: "particles", icon: "\u{1F525}", desc: "Glowing sparks rising (fire, battle, a forge).", draw: (c, i) => {
    field(c, i, 90, (k, _, x, y) => {
      c.fillStyle = k % 2 ? "rgba(255,170,60,0.9)" : "rgba(255,90,30,0.85)";
      c.beginPath();
      c.arc(x + Math.sin(i.t * 2 + k) * 16, y, i.W / 650, 0, 7);
      c.fill();
    }, i.W * 0.02, -i.H * 0.18);
  } },
  { id: "leaves", name: "Falling leaves", kind: "particles", icon: "\u{1F342}", desc: "Autumn leaves drifting down.", draw: (c, i) => {
    field(c, i, 40, (k, _, x, y) => {
      c.save();
      c.translate(x + Math.sin(i.t + k) * 40, y);
      c.rotate(i.t * 2 + k);
      c.fillStyle = ["#d9822b", "#c0392b", "#e9b949", "#8a5a2b"][k % 4];
      c.beginPath();
      c.ellipse(0, 0, i.W / 160, i.W / 320, 0, 0, 7);
      c.fill();
      c.restore();
    }, i.W * 0.05, i.H * 0.15);
  } },
  { id: "confetti", name: "Confetti", kind: "particles", icon: "\u{1F389}", desc: "A party! Colourful paper falling.", draw: (c, i) => {
    field(c, i, 140, (k, _, x, y) => {
      c.save();
      c.translate(x, y);
      c.rotate(i.t * 4 + k);
      c.fillStyle = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#c3a6ff"][k % 5];
      c.fillRect(-i.W / 300, -i.W / 700, i.W / 150, i.W / 350);
      c.restore();
    }, 0, i.H * 0.25);
  } },
  { id: "petals", name: "Rose petals", kind: "particles", icon: "\u{1F339}", desc: "Romance: petals drifting through the air.", draw: (c, i) => {
    field(c, i, 50, (k, _, x, y) => {
      c.save();
      c.translate(x + Math.sin(i.t * 1.2 + k) * 30, y);
      c.rotate(i.t + k);
      c.fillStyle = k % 2 ? "#ff6f91" : "#ff9ec2";
      c.beginPath();
      c.ellipse(0, 0, i.W / 200, i.W / 330, 0, 0, 7);
      c.fill();
      c.restore();
    }, i.W * 0.06, i.H * 0.1);
  } },
  { id: "bubbles", name: "Bubbles", kind: "particles", icon: "\u{1FAE7}", desc: "Rising bubbles (underwater, magic, soap).", draw: (c, i) => {
    c.strokeStyle = "rgba(220,245,255,0.75)";
    c.lineWidth = 2;
    field(c, i, 50, (k, _, x, y) => {
      c.beginPath();
      c.arc(x + Math.sin(i.t * 2 + k) * 10, y, i.W / 300 + k % 4 * i.W / 600, 0, 7);
      c.stroke();
    }, 0, -i.H * 0.2);
  } },
  { id: "fog", name: "Fog", kind: "particles", icon: "\u{1F301}", desc: "Low rolling fog banks.", draw: (c, i) => {
    for (let k = 0; k < 7; k++) {
      const x = ((k * 0.31 + i.t * 0.02 * (1 + k % 3)) % 1.4 - 0.2) * i.W;
      const y = i.H * (0.6 + k % 3 * 0.12);
      const g = c.createRadialGradient(x, y, 0, x, y, i.W * 0.35);
      g.addColorStop(0, "rgba(225,230,240,0.45)");
      g.addColorStop(1, "rgba(225,230,240,0)");
      c.fillStyle = g;
      c.fillRect(x - i.W * 0.35, y - i.W * 0.35, i.W * 0.7, i.W * 0.7);
    }
  } },
  { id: "stars", name: "Twinkling stars", kind: "particles", icon: "\u2B50", desc: "Sparkles across the screen (magic, wonder).", draw: (c, i) => {
    field(c, i, 60, (k, _, x, y) => {
      const a = 0.5 + 0.5 * Math.sin(i.t * 3 + k * 1.7);
      c.fillStyle = `rgba(255,250,210,${a})`;
      const s = i.W / 300 * a;
      c.beginPath();
      c.moveTo(x, y - s * 2);
      c.lineTo(x + s * 0.5, y);
      c.lineTo(x, y + s * 2);
      c.lineTo(x - s * 0.5, y);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(x - s * 2, y);
      c.lineTo(x, y + s * 0.5);
      c.lineTo(x + s * 2, y);
      c.lineTo(x, y - s * 0.5);
      c.closePath();
      c.fill();
    }, 0, 0);
  } },
  { id: "speedlines", name: "Speed lines", kind: "particles", icon: "\u{1F4A8}", desc: "Anime-style lines for speed and shock.", draw: (c, i) => {
    const r = R(Math.floor(i.t * 12));
    c.strokeStyle = "rgba(255,255,255,0.7)";
    for (let k = 0; k < 40; k++) {
      const a = r() * Math.PI * 2;
      const r0 = i.W * (0.28 + r() * 0.15);
      c.lineWidth = 1 + r() * 3;
      c.beginPath();
      c.moveTo(i.W / 2 + Math.cos(a) * r0, i.H / 2 + Math.sin(a) * r0);
      c.lineTo(i.W / 2 + Math.cos(a) * i.W, i.H / 2 + Math.sin(a) * i.W);
      c.stroke();
    }
  } },
  // ——— events ———
  {
    id: "explosion",
    name: "Explosion",
    kind: "event",
    icon: "\u{1F4A5}",
    desc: "A cartoon blast with a white flash and smoke.",
    grade: (g, i) => {
      g.uFlash = Math.max(g.uFlash, Math.max(0, 1 - i.local * 4) * 0.8);
      g.uFlashCol = [1, 0.95, 0.8];
    },
    draw: (c, i) => {
      const [x, y] = i.at ?? [i.W / 2, i.H * 0.6];
      const k = Math.min(1, i.local / 0.5);
      const fade = Math.max(0, 1 - (i.local - 0.4) / Math.max(0.4, i.dur - 0.4));
      const s = i.W / 1920;
      const r = R(i.seed);
      for (let p = 0; p < 18; p++) {
        const a = r() * Math.PI * 2;
        const d = (60 + r() * 220) * k * s;
        const rad = (70 + r() * 80) * s * (0.6 + k * 0.6);
        c.fillStyle = p % 3 === 0 ? `rgba(255,220,90,${fade})` : p % 3 === 1 ? `rgba(255,120,40,${fade})` : `rgba(90,80,80,${fade * 0.8})`;
        c.beginPath();
        c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7 - i.local * 80 * s, rad, 0, 7);
        c.fill();
      }
    }
  },
  {
    id: "lightning",
    name: "Lightning strike",
    kind: "event",
    icon: "\u26A1",
    desc: "A bolt from the sky and a flash.",
    grade: (g, i) => {
      g.uFlash = Math.max(g.uFlash, i.local < 0.1 ? 0.85 : i.local > 0.2 && i.local < 0.28 ? 0.5 : 0);
      g.uFlashCol = [0.9, 0.93, 1];
    },
    draw: (c, i) => {
      if (i.local > 0.45) return;
      const [x0] = i.at ?? [i.W * 0.5, 0];
      const r = R(i.seed);
      c.strokeStyle = "#ffffff";
      c.lineWidth = i.W / 300;
      c.shadowColor = "#a8c8ff";
      c.shadowBlur = 20;
      c.beginPath();
      let x = x0 + (r() - 0.5) * i.W * 0.2;
      let y = 0;
      c.moveTo(x, y);
      while (y < i.H * 0.75) {
        x += (r() - 0.5) * i.W * 0.06;
        y += i.H * 0.05;
        c.lineTo(x, y);
      }
      c.stroke();
      c.shadowBlur = 0;
    }
  },
  { id: "magic", name: "Magic sparkle", kind: "event", icon: "\u{1FA84}", desc: "A swirl of sparkles (spells, wishes, appearing).", draw: (c, i) => {
    const [x, y] = i.at ?? [i.W / 2, i.H / 2];
    const s = i.W / 1920;
    for (let k = 0; k < 40; k++) {
      const a = k * 0.6 + i.local * 5;
      const d = (40 + k * 6) * s * Math.min(1, i.local * 2);
      const al = Math.max(0, 1 - i.local / i.dur);
      c.fillStyle = `rgba(${200 + k % 3 * 25},${180 + k % 5 * 15},255,${al})`;
      c.beginPath();
      c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - i.local * 60 * s, (3 + k % 3 * 2) * s, 0, 7);
      c.fill();
    }
  } },
  { id: "smoke", name: "Smoke puff", kind: "event", icon: "\u{1F4A8}", desc: "A cartoon puff of smoke (vanish, appear, crash).", draw: (c, i) => {
    const [x, y] = i.at ?? [i.W / 2, i.H * 0.7];
    const s = i.W / 1920;
    const al = Math.max(0, 1 - i.local / i.dur);
    const r = R(i.seed);
    for (let k = 0; k < 12; k++) {
      const a = r() * Math.PI * 2;
      const d = (30 + r() * 120) * s * Math.min(1, i.local * 3);
      c.fillStyle = `rgba(230,230,235,${al * 0.9})`;
      c.beginPath();
      c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6 - i.local * 40 * s, (50 + r() * 50) * s, 0, 7);
      c.fill();
    }
  } },
  { id: "hearts", name: "Floating hearts", kind: "event", icon: "\u{1F495}", desc: "Love at first sight.", draw: (c, i) => {
    const [x, y] = i.at ?? [i.W / 2, i.H * 0.4];
    const s = i.W / 1920;
    for (let k = 0; k < 8; k++) {
      const t = i.local - k * 0.15;
      if (t < 0) continue;
      const hx = x + Math.sin(t * 3 + k) * 40 * s + (k - 4) * 20 * s;
      const hy = y - t * 160 * s;
      const al = Math.max(0, 1 - t / i.dur);
      const r = (14 + k % 3 * 6) * s;
      c.fillStyle = `rgba(255,80,120,${al})`;
      c.beginPath();
      c.moveTo(hx, hy + r);
      c.bezierCurveTo(hx - r * 2, hy - r * 0.5, hx - r * 0.6, hy - r * 1.8, hx, hy - r * 0.6);
      c.bezierCurveTo(hx + r * 0.6, hy - r * 1.8, hx + r * 2, hy - r * 0.5, hx, hy + r);
      c.fill();
    }
  } },
  { id: "dizzy", name: "Dizzy stars", kind: "event", icon: "\u{1F635}\u200D\u{1F4AB}", desc: "Stars circling a bonked head.", draw: (c, i) => {
    const [x, y] = i.at ?? [i.W / 2, i.H * 0.3];
    const s = i.W / 1920;
    for (let k = 0; k < 5; k++) {
      const a = i.local * 5 + k * Math.PI * 2 / 5;
      c.fillStyle = "#ffd166";
      c.font = `${36 * s}px sans-serif`;
      c.textAlign = "center";
      c.fillText("\u2605", x + Math.cos(a) * 70 * s, y + Math.sin(a) * 18 * s);
    }
  } },
  { id: "impact", name: "Comic impact", kind: "event", icon: "\u{1F4A2}", desc: "POW! A comic burst.", draw: (c, i) => {
    const [x, y] = i.at ?? [i.W / 2, i.H * 0.4];
    const s = i.W / 1920 * (1 + Math.min(1, i.local * 6) * 0.3);
    if (i.local > i.dur) return;
    c.save();
    c.translate(x, y);
    c.rotate(-0.15);
    c.fillStyle = "#ffd166";
    c.strokeStyle = "#1b1b22";
    c.lineWidth = 6 * s;
    c.beginPath();
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      const rr4 = (k % 2 ? 90 : 150) * s;
      c.lineTo(Math.cos(a) * rr4, Math.sin(a) * rr4 * 0.75);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#c81d25";
    c.font = `900 ${70 * s}px Fredoka, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("POW!", 0, 0);
    c.restore();
  } },
  { id: "flashbang", name: "White flash", kind: "event", icon: "\u26AA", desc: "A blinding white-out (memory, shock, a camera flash).", grade: (g, i) => {
    g.uFlash = Math.max(g.uFlash, Math.max(0, 1 - i.local / Math.max(0.2, i.dur)));
    g.uFlashCol = [1, 1, 1];
  } },
  { id: "blackout", name: "Blackout", kind: "event", icon: "\u26AB", desc: "The lights go out.", grade: (g, i) => {
    g.uFlash = Math.max(g.uFlash, i.local < 0.1 ? i.local * 10 : i.local > i.dur - 0.3 ? Math.max(0, (i.dur - i.local) / 0.3) : 1);
    g.uFlashCol = [0, 0, 0];
  } }
];
var byId3 = new Map(FX.map((f) => [f.id, f]));

// src/agent/tools.ts
var str = (description) => ({ type: "string", description });
var num = (description) => ({ type: "number", description });
var TOOLS = [
  {
    name: "guide",
    local: true,
    description: "How to make a film in Ye\u015Fil\xE7am Studio, or one reference page: get-started, screenplay, sets, objects, characters, acting, camera, sound, mcp. Read get-started and screenplay first.",
    inputSchema: { type: "object", properties: { topic: str("get-started | screenplay | sets | objects | characters | acting | camera | sound | mcp") }, required: ["topic"] }
  },
  {
    name: "check_screenplay",
    local: true,
    description: "Import a screenplay the way the studio does, without changing anything, and report what it found (acts, scenes, lines, characters, shots) and every warning (unknown names, unreadable cues, empty scenes). Fix all warnings before importing.",
    inputSchema: { type: "object", properties: { text: str("the screenplay") }, required: ["text"] }
  },
  {
    name: "screenplay_link",
    local: true,
    description: "A link that opens Ye\u015Fil\xE7am Studio with this screenplay ready to import (for users without the MCP connection, or to share).",
    inputSchema: { type: "object", properties: { text: str("the screenplay") }, required: ["text"] }
  },
  {
    name: "connect_studio",
    local: true,
    description: "The link the user opens to connect their studio tab to this server (pairing). Give it to the user, then wait for studio_status to say connected.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "studio_status",
    local: true,
    description: "Whether a studio tab is connected, and which film it has open.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_film",
    description: "The film open in the studio: title, characters (ids, names, looks), acts and their scenes (ids, titles, sets, times, beat and shot counts, length in seconds).",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_scene",
    description: "One scene as the studio's JSON: set, tod, music, fx, cast, objects, beats, shots (see the mcp guide for the beat and shot shapes).",
    inputSchema: { type: "object", properties: { scene: str("scene id, or its title, or its number in the film (1-based)") }, required: ["scene"] }
  },
  {
    name: "import_screenplay",
    description: `Import a screenplay into the studio. mode "new" starts a new film, "append" adds its acts to the open film, "replace" replaces the open film's script (characters are kept and matched by name). Returns the import report.`,
    inputSchema: { type: "object", properties: { text: str("the screenplay"), mode: { type: "string", enum: ["new", "append", "replace"], description: 'default "new"' }, direct: { type: "boolean", description: "lay out shots for scenes without [SHOT:] notes (default true)" } }, required: ["text"] }
  },
  {
    name: "update_scene",
    description: "Change a scene: the fields given replace the scene's own (title, logline, set, tod, music, ambience, fx, cast, objects, beats, shots, crowd). Beats and shots without ids get new ones. Returns the scene and any warnings. One undo step in the studio.",
    inputSchema: { type: "object", properties: { scene: str("scene id, title or number"), patch: { type: "object", description: "scene fields to replace" } }, required: ["scene", "patch"] }
  },
  {
    name: "add_scene",
    description: 'Add an empty scene to an act (then fill it with update_scene), or write it as a screenplay and use import_screenplay with mode "append".',
    inputSchema: { type: "object", properties: { title: str("the scene title"), set: str("a set id"), act: str("act title or number (default: the last act)") }, required: ["title", "set"] }
  },
  {
    name: "set_character",
    description: "Create or change a character by name or id: look fields (characters guide), voice {pitch, rate}, bio, traits. Unknown look values are reported, not applied.",
    inputSchema: { type: "object", properties: { character: str("name or id (a new name creates the character)"), look: { type: "object" }, preset: str("a stock character name for the whole look"), voice: { type: "object" }, bio: { type: "string" }, traits: { type: "array", items: { type: "string" } } }, required: ["character"] }
  },
  {
    name: "direct_scene",
    description: "Have the studio director lay out the shots of a scene (coverage from the blocking), or apply a cinema-school technique (ids in the camera guide).",
    inputSchema: { type: "object", properties: { scene: str("scene id, title or number"), technique: str("a technique id (optional)") }, required: ["scene"] }
  },
  {
    name: "render_frame",
    description: "A picture of the film at a moment: a time in the film (seconds), or a scene and a time in it. Returns a JPEG.",
    inputSchema: { type: "object", properties: { t: num("film time in seconds"), scene: str("scene id, title or number"), at: num("seconds into the scene (default: its middle)"), width: num("pixels (default 640)") } }
  },
  {
    name: "contact_sheet",
    description: "One picture with a frame from every shot of a scene (or of the whole film when no scene is given), labelled, to review the camera work and staging.",
    inputSchema: { type: "object", properties: { scene: str("scene id, title or number (optional)") } }
  },
  {
    name: "play",
    description: "Play the film in the user's studio from a time or the start of a scene, or stop it.",
    inputSchema: { type: "object", properties: { scene: str("scene id, title or number"), t: num("film time in seconds"), stop: { type: "boolean" } } }
  },
  {
    name: "undo",
    description: "Undo the last change in the studio (each tool call that changes the film is one step).",
    inputSchema: { type: "object", properties: {} }
  }
];
var toolByName = (n) => TOOLS.find((t) => t.name === n);

// src/agent/docs.ts
var SITE = "https://aykutkilic.github.io/yesilcam-play";
var REPO = "aykutkilic/yesilcam-play";
var NPX = `npx -y github:${REPO}`;
var list = (xs) => xs.map((x) => `\`${x}\``).join(", ");
function referencePages(site2 = SITE) {
  return {
    "agent/screenplay.md": ["Screenplay format", "The text format the studio imports: acts, scenes, lines, stage directions, cues, camera notes, exact cues for looks, sets, objects, moves and acts", screenplayDoc()],
    "agent/sets.md": ["Sets", `The ${SETS.length} sets (plateaus): ids, size, marks to walk to, times of day, music, objects that suit them`, setsDoc()],
    "agent/objects.md": ["Objects & vehicles", `The ${PROPS.length} objects that can be placed on a set, by category`, objectsDoc()],
    "agent/characters.md": ["Characters", "Look fields and their values, accessories, resting faces, voices, personality traits, the stock characters", charactersDoc()],
    "agent/acting.md": ["Acting", `Moods, gestures, ${EXPR_NAMES.length} expressions \xD7 levels, ${POSE_NAMES.length} poses, ${GAITS.length} walks, ${Object.keys(INTERACTIONS).length} two-person interactions`, actingDoc()],
    "agent/camera.md": ["Camera & editing", "Shot sizes, angles, lenses, moves, compositions, transitions and the cinema-school techniques", cameraDoc()],
    "agent/sound.md": ["Sound, music & effects", `${SFX_NAMES.length} sound effects, ${MUSIC_MOODS.length} music moods, film looks, weather and events`, soundDoc()],
    "agent/mcp.md": ["MCP server", "Connect an agent to the studio open in the browser: install, pairing, tools", mcpDoc(site2)]
  };
}
function getStarted(site2 = SITE) {
  return `# Make a film with Ye\u015Fil\xE7am Studio

You are helping a user make a short animated film in Ye\u015Fil\xE7am Studio, a movie studio that runs in their browser (${site2}/). You write the film as a **screenplay** in the studio's text format; the studio turns it into acts, scenes, characters, acting, camera shots, sound and music, and the user watches, tweaks and exports it there.

Work through these steps in order. Report what you did at the end.

## 1. Find out what to make

- Use the idea in the user's prompt. If there is none, ask for one in a sentence (who, where, what happens) and a rough length (default: 1 to 3 scenes, under two minutes).
- If the prompt describes the film open in their studio (its title, cast, sets), ask whether to **add to it** or **start a new film**, unless they said.
- Ask nothing else up front: pick the sets, looks, shots and music yourself.

## 2. Read the format and the catalogs

- Read ${site2}/agent/screenplay.md (required).
- Look up what you use, from the pages listed in ${site2}/llms.txt: sets (ids and marks), characters (look values, stock characters), acting (expressions, poses, walks), camera, sound, objects.
- If you can run commands, \`${NPX} catalog <sets|objects|characters|acting|camera|sound>\` prints the same pages.
- Use only ids and names that are in those pages. Do not invent sets, objects, poses, expressions or sounds.

## 3. Write the screenplay

- Start with \`TITLE:\` and one \`[LOOK: NAME \u2026]\` per character (a stock character with \`preset=\`, or look fields as JSON), then \`# ACT ONE\` and the scenes.
- Give every scene a heading and an exact \`[SET: id]\` and \`[TIME: dawn|day|dusk|night]\`. Dress it with a few \`[OBJECT: id x=\u2026 z=\u2026]\` from the set's suggested objects. Place people with \`[PLACE: NAME x=\u2026]\` when it matters.
- Write lines as \`NAME (direction): Line.\` Use the parenthetical for acting: a mood word, \`expr=\` (an expression with a level, e.g. \`very surprised\`, \`smug + guilty\`), \`pose=\` (a pose name).
- Block the action with \`[MOVE: NAME to=<mark> run]\`, \`[ACT: NAME pose=\u2026 expr=\u2026 face=front sit]\`, \`[PICK: NAME <object>]\` / \`[GIVE: NAME <object> to=OTHER]\` (objects placed with [OBJECT:]) and \`[INTERACT: NAME hug with=OTHER]\`, or plain stage directions ("SEDAT enters.", "Nermin sits.").
- Add camera notes \`[SHOT: CU Sedat, low angle, push in]\` where they tell the story; scenes without them are shot by the studio's director. Add \`[SFX: \u2026]\`, \`[MUSIC: \u2026]\`, \`[FX: rain]\`, \`[PAUSE 1.5]\`, \`[TRANSITION: dissolve]\`.
- Keep lines short: one or two sentences each, as in a cartoon.
- Save it as a file (for example \`film.txt\`) if you can write files.

## 4. Check it

- If you can run node 18+: \`${NPX} check film.txt\`. It imports the screenplay the way the studio does and lists every warning (unknown names, cues it could not read, scenes with nobody in them). Fix them all and check again.
- Without a shell: check every id you used against the catalog pages yourself.

## 5. Open it in the user's studio

Use the first of these that you can:

1. **MCP tools** (tools named like \`import_screenplay\`, \`render_frame\` from the "yesilcam" server): if \`studio_status\` says the studio is not connected, give the user the link from \`connect_studio\` and wait until they have opened it. Then call \`import_screenplay\` with the text (\`mode\`: "new", "append" or "replace").
2. **A link**: \`${NPX} link film.txt\` prints a link that opens the studio with the screenplay ready to import. Give the user that link. Without a shell, build it yourself: \`${site2}/#script=\` followed by the screenplay URL-encoded (encodeURIComponent); keep it under about 30 000 characters.
3. **A file**: tell the user to drop \`film.txt\` onto the studio window (or paste it in Script \u2192 \u{1F4E5} Import screenplay).

## 6. Review and improve (when you have the MCP tools)

- \`get_film\` lists the acts and scenes; \`contact_sheet\` shows a picture of every shot of a scene; \`render_frame\` shows one moment.
- Look at the pictures. Fix what reads badly: people hidden behind objects, a shot on the wrong person, a scene that is too long or too static. Change scenes with \`update_scene\` (beats, shots, objects, cast), looks with \`set_character\`, or re-import.
- \`play\` starts the film in the user's studio.

## 7. Report

Tell the user, in a few lines: what the film is (title, scenes, characters), how to open it (the link, or that it is in their studio now), anything the checker still warned about, and what they might want to do next in the studio (record voices in the Voices tab, tweak looks in Cast, export the MP4).

## Rules

- Write **original** dialogue and stories. Do not reproduce copyrighted scripts, lyrics or dialogue, and do not recreate a real artist's or a show's characters; an homage in spirit is fine.
- Keep it family-friendly unless the user asks otherwise; the studio also cleans profanity on import.
- Do not invent catalog names, and do not ask the user to edit files by hand to fix your mistakes: run the checker.
- Do not install anything globally. \`npx -y\` runs the CLI once; the MCP server is optional and only for when the user wants you to see and refine the film.
- The studio keeps everything in the user's browser. There is no account, API key or server to set up.
`;
}
function screenplayDoc() {
  return `# Screenplay format

The studio imports a forgiving screenplay format (also: Script \u2192 \u{1F4E5} Import screenplay). One cue or line per line. Turkish headings and directions work too.

## Structure

\`\`\`
TITLE: The Lost Cezve                    the film's title
[LOOK: SEDAT preset=Saf Bekir]           a character's look (see Characters below)
# ACT ONE                                an act (also: ACT ONE, B\xD6L\xDCM 1)
INT. KAHVEHANE - MORNING                 a scene: INT./EXT./SCENE:/\u0130\xC7./DI\u015E. + words (the set is guessed from them)
[SET: kahvehane]                         \u2026or set exactly (an id from sets.md)
[TIME: dawn]                             dawn | day | dusk | night (also guessed from MORNING/NIGHT/\u2026)
Sedat polishes cups behind the counter.  action: becomes the scene's description (and simple blocking)
SEDAT (worried): Where is my cezve?      a line: NAME (parenthetical): text
NERMIN                                   classic layout also works: NAME on its own line,
(innocently)                             an optional (parenthetical),
I have not seen any cezve.               then the text up to a blank line
\`\`\`

## Characters

Characters are created from the names that speak or appear (a name is 1\u20133 capitalised words). Give each one a look before the first scene:

\`\`\`
[LOOK: SEDAT preset=Saf Bekir]                                   a stock character's look (names in characters.md)
[LOOK: NERMIN {"hair":"bun","hairColor":"#3b2a1e","top":"dress","topColor":"#06d6a0","acc":["necklace"],"rest":"cocky"}]
[LOOK: AHMET YSC1:eyJuYW1l\u2026]                                     a character code copied from the studio (\u{1F517} code)
[VOICE: NERMIN pitch=210 rate=1.1]                               the studio voice: pitch 90\u2013320, rate 0.7\u20131.4
[BIO: NERMIN Runs the bakery across the street; never admits a mistake.]
\`\`\`

Look JSON may set any of the fields in characters.md; fields you leave out keep the defaults. A name that is already in the user's film keeps its look unless you give one.

## Acting in a line

The parenthetical takes a mood word, and exact names as key=value, separated by ; or ,:

\`\`\`
SEDAT (angry): \u2026                                   a mood: ${list(MOOD_LIST)} (or words like furious, crying, laughing)
SEDAT (very surprised): \u2026                          an expression on its own (level + name, see acting.md)
SEDAT (worried; expr=very worried; pose=wipe-brow): \u2026
SEDAT (expr=smug + guilty, gesture=shrug): \u2026       expressions mix with +; gestures: ${list(GESTURE_LIST)}
\`\`\`

## Stage directions and blocking

Plain sentences that start with a name are blocked: "SEDAT enters." (from the set's door), "Sedat leaves.", "Nermin walks to the counter." (a mark), "Sedat sits.", "Nermin stands up.", "Sedat sighs." (a mood beat). Anything else is description. For exact control:

\`\`\`
[PLACE: SEDAT x=900 z=0 facing=right]        where they stand when the scene starts (x on the set, z depth: 0 front \u2026 300 back)
[MOVE: SEDAT to=counter]                      walk to a mark of the set (marks are in sets.md) or to=<another name>
[MOVE: SEDAT x=1500 run]                      \u2026or to an x; flags: run, with (at the same time as the previous beat); style=<walk>
[MOVE: NERMIN to=door style=sneak]            walks: ${list(GAITS)}
[ACT: SEDAT pose=facepalm expr=extreme sad]   strike a pose / pull a face (names in acting.md); dur=<seconds>
[ACT: NERMIN face=front]                      face=left | right | front | <name>; flags: sit, stand, appear, disappear, with
[PICK: SEDAT cezve]                           walk to an object placed with [OBJECT:] and pick it up (it stays in the hand)
[GIVE: SEDAT cezve to=NERMIN]                 hand it over; [PUT: NERMIN cezve x=1400] puts it down (x, y optional)
[INTERACT: SEDAT handshake with=NERMIN]       a two-person interaction (acting.md): ${Object.keys(INTERACTIONS).slice(0, 6).join(", ")}\u2026
\`\`\`

## Cues

\`\`\`
[OBJECT: cezve x=1300 z=60 scale=1.2 flip]   an object from objects.md on the set (x, z depth, y lift, scale, flip)
[SFX: door-knock]                            a sound (ids in sound.md; words are matched too)
[MUSIC: comedy]                              the scene's music: ${list(MUSIC_MOODS)}, none
[FX: rain]                                   a look or weather over the scene (sound.md)
[VFX: explosion]                             an event at that moment (sound.md)
[PAUSE 1.5]                                  a pause in seconds
[TITLE: Later that night\u2026]                   a caption
[SHOT: CU Sedat, low angle, push in]         the next beat starts with this shot (camera.md)
[TRANSITION: dissolve]                       the transition into the next shot; also CUT TO: / DISSOLVE TO: / FADE OUT.
\`\`\`

Scenes with no [SHOT:] notes are covered by the studio director (establishing shot, singles, reactions). With notes, the scene uses exactly your shots, starting each where you put it.

## A complete example

\`\`\`
TITLE: The Lost Cezve
[LOOK: SEDAT preset=Saf Bekir]
[LOOK: NERMIN {"hair":"bun","top":"dress","topColor":"#06d6a0","bottom":"skirt","bottomColor":"#06d6a0","rest":"cocky"}]
[VOICE: NERMIN pitch=220]

# ACT ONE
INT. KAHVEHANE - MORNING
[SET: kahvehane]
[TIME: dawn]
[MUSIC: comedy]
[OBJECT: cezve x=1500 z=40]
[PLACE: SEDAT x=1100]
Sedat searches every shelf of the coffeehouse.
[SHOT: WS everyone]
SEDAT (worried; pose=scratch-head): Where is my cezve? It was right here!
NERMIN enters.
[SHOT: MS Nermin]
NERMIN (expr=innocent): Good morning, neighbour. Lost something?
[SHOT: CU Sedat, push in]
SEDAT (expr=suspicious): Why are you smiling?
[ACT: NERMIN pose=hands-behind]
[SFX: crash]
[SHOT: CU Nermin, crash zoom]
NERMIN (expr=very embarrassed): That was not me.
[TRANSITION: iris]
\`\`\`
`;
}
function setsDoc() {
  return `# Sets

Use the id in \`[SET: id]\`. x runs from 0 to the width; people usually stand between 300 and width\u2212300. Marks are named x positions for \`[MOVE: NAME to=<mark>]\`.

${SETS.map((s) => `## ${s.icon} ${s.name} \u2014 \`${s.id}\`

${s.blurb}

- width: ${s.width}${s.interior ? " (interior)" : ""}; times: ${(s.times ?? ["dawn", "day", "dusk", "night"]).join(", ")}; music: ${s.music ?? "none"}
- marks: ${Object.entries(s.marks).map(([k, x]) => `\`${k}\` ${x}`).join(", ") || "none"}
- suits: ${s.suggest?.filter((id) => propById(id)).length ? list(s.suggest.filter((id) => propById(id))) : "any objects"}
`).join("\n")}`;
}
function objectsDoc() {
  const cats = Object.keys(CAT_NAMES);
  return `# Objects & vehicles

Use the id in \`[OBJECT: id x=\u2026 z=\u2026 scale=\u2026]\`. Sizes are in set units (a person is about 330 tall). z is depth: 0 is the actors' line, negative is in front of them, 60 is just behind, 300 far back. Vehicles can drive (drive beats in the studio).

${cats.map((c) => {
    const ps = PROPS.filter((d) => d.cat === c);
    return ps.length ? `## ${CAT_NAMES[c]}

${ps.map((d) => `- \`${d.id}\` ${d.name} (${d.w}\xD7${d.h}${d.vehicle ? ", vehicle" : ""}${d.sets?.length ? `; sets: ${d.sets.join(", ")}` : ""})`).join("\n")}
` : "";
  }).join("\n")}`;
}
function charactersDoc() {
  return `# Characters

## Look fields

A look is JSON in \`[LOOK: NAME {\u2026}]\` (or \`set_character\` over MCP). Every field is optional; the defaults are:

\`\`\`json
${JSON.stringify(DEFAULT_LOOK)}
\`\`\`

| field | values |
|---|---|
| skin, hairColor, hatColor, topColor, accent, bottomColor, shoes | a colour, "#rrggbb" |
| hair | ${list(HAIRS)} |
| beard | ${list(BEARDS)} |
| hat | ${list(HATS)} |
| glasses | ${list(GLASSES)} |
| top | ${list(TOPS)} |
| print | a short word printed on a tee (\u2264 12 letters) |
| bottom | ${list(BOTTOMS)} |
| mouth | ${list(MOUTHS2)} |
| nose | ${list(NOSES)} |
| noseSize | 0.8 \u2026 2 |
| eyes | ${list(EYE_STYLES)} |
| rest (the resting face) | ${REST_FACES.map((r) => `\`${r.id}\` (${r.label})`).join(", ")} |
| acc (a list, several at once) | ${ACCESSORIES.map((a) => `\`${a.id}\``).join(", ")} |
| height | 0.8 \u2026 1.2 |
| build | 0.8 \u2026 1.3 (thin \u2026 stocky) |
| head | 0.85 \u2026 1.25 |
| belly | 0 \u2026 1 (a pot belly) |
| shoeSize | 1 \u2026 1.6 |
| holding | an object id carried in the hand (small objects from objects.md), or "" |
| ghost | true for a see-through ghost |

## Stock characters

\`[LOOK: NAME preset=<name>]\` gives a character one of these looks:

${PRESETS.map((p) => `- **${p.name}**: ${p.tag}`).join("\n")}

## Voice

\`[VOICE: NAME pitch=150 rate=1]\`: the studio's built-in voice reads unrecorded lines (English lines get a neural voice when the user's browser can run it). pitch 90 (deep) \u2026 320 (squeaky), rate 0.7 \u2026 1.4. The user can record real voices in the Voices tab.

## Personality

Traits shape body language (set in the studio, or \`set_character\` over MCP): ${list(TRAITS2)}.
`;
}
function actingDoc() {
  return `# Acting

## Moods (a line's parenthetical, or mood=)

${list(MOOD_LIST)}

## Gestures (gesture=)

${list(GESTURE_LIST)}

## Expressions (expr=)

An expression is a name, optionally after a level (${EXPR_LEVELS.filter(Boolean).map((l) => `\`${l}\``).join(", ")}), and several mix with +: \`very sad\`, \`slightly smug\`, \`extreme surprised + scared\`.

${list(EXPR_NAMES)}

## Poses (pose=)

Held body poses and gestures from the motion library; each plays out and settles.

${list(POSE_NAMES)}

## Walks (style= in a move)

${list(GAITS)}

## Two-person interactions

In a screenplay: \`[INTERACT: A <type> with=B]\`; over MCP, the beat \`{"kind":"interact","who":A,"other":B,"type":\u2026}\`.

${Object.entries(INTERACTIONS).map(([k, v]) => `- \`${k}\`: ${v.desc}`).join("\n")}
`;
}
function cameraDoc() {
  const terms = (xs) => xs.map((t) => `- \`${t.id}\`${t.abbr && t.abbr.toLowerCase() !== t.id ? ` (${t.abbr})` : ""} ${t.name}: ${t.desc} Use: ${t.use}`).join("\n");
  return `# Camera & editing

A \`[SHOT: \u2026]\` note is read for words: a size (EWS, WS, FS, MLS, MS, MCU, CU, ECU, "establishing", "close-up"), names of who it is on, "two-shot" / "over the shoulder" / "everyone", an angle ("low angle", "high angle", "bird's eye", "dutch"), a move ("push in", "pull out", "crash zoom", "dolly zoom", "pan", "tilt", "follow", "handheld", "crane up", "rack focus"), a lens ("wide lens", "telephoto") and "shallow focus". Over MCP a shot is JSON: \`{"at": <beat id or null>, "cam": {"size","angle","on":[ids],"comp","move","lens","dof"}, "trans": {"kind","dur"}}\`.

## Sizes

${terms(SIZES)}

## Angles

${terms(ANGLES)}

## Lenses

${terms(LENSES)}

## Moves

${terms(MOVES)}

## Compositions

${terms(COMPS)}

## Transitions ([TRANSITION: \u2026])

${terms(TRANSITIONS)}

## Techniques (the cinema school)

Whole shot plans the studio can apply to a scene (\`direct_scene\` with \`technique\` over MCP):

${TECHNIQUES.map((t) => `- \`${t.id}\` **${t.name}** (${t.group}): ${t.desc}`).join("\n")}
`;
}
function soundDoc() {
  return `# Sound, music & effects

## Sound effects ([SFX: id])

${SFX_NAMES.map((n) => `- \`${n}\` ${SFX[n][1]} ${SFX[n][0]}`).join("\n")}

## Music ([MUSIC: mood])

${MUSIC_MOODS.map((m) => `- \`${m}\` ${STYLES[m].name}`).join("\n")}
- \`none\` silence

## Looks and weather over a scene ([FX: id])

${FX.filter((f) => f.kind !== "event").map((f) => `- \`${f.id}\` ${f.icon} ${f.name}: ${f.desc}`).join("\n")}

## Events at a moment ([VFX: id])

${FX.filter((f) => f.kind === "event").map((f) => `- \`${f.id}\` ${f.icon} ${f.name}: ${f.desc}`).join("\n")}
`;
}
function mcpDoc(site2 = SITE) {
  const cfg = { mcpServers: { yesilcam: { command: "npx", args: ["-y", `github:${REPO}`, "mcp"] } } };
  return `# The Ye\u015Fil\xE7am MCP server

A small local MCP server (stdio, no dependencies) that lets an agent work in the studio the user has open in their browser: import screenplays, read and change scenes, dress characters, and look at the result as pictures. It runs on the user's computer; the studio tab connects to it over localhost after the user opens a pairing link.

## Install

- Claude Code: \`claude mcp add yesilcam -- ${NPX} mcp\`
- Codex: \`codex mcp add yesilcam -- ${NPX} mcp\`
- Cursor, VS Code, Windsurf, Claude Desktop and others (mcp.json):

\`\`\`json
${JSON.stringify(cfg, null, 2)}
\`\`\`

- Claude Code plugin (the server and the skill): \`/plugin marketplace add ${REPO}\`, then \`/plugin install yesilcam@yesilcam\`.
- Without npx: download ${site2}/yesilcam.mjs and use \`node /path/to/yesilcam.mjs mcp\` as the command.

## Pairing

The studio lives in a browser tab, so the server needs the tab to connect to it:

1. Call \`connect_studio\`. It returns a link like \`${site2}/#agent=5198:K7Q2XM\`.
2. Give the link to the user. They open it in the browser where they use the studio and click **Connect**; the browser may ask once whether the site may access apps on this device (local network access): they choose Allow. The studio then shows "\u{1F916} agent connected".
3. \`studio_status\` tells you when the tab is connected. The tab stays connected while it is open.

The server listens only on 127.0.0.1 and only accepts the studio's pages with the pairing code.

## Tools

${TOOLS.map((t) => `### \`${t.name}\`${t.local ? " (works without the studio)" : ""}

${t.description}

Arguments: ${Object.keys(t.inputSchema.properties ?? {}).length ? Object.entries(t.inputSchema.properties).map(([k, v]) => `\`${k}\`${t.inputSchema.required?.includes(k) ? "" : "?"} ${v.description ?? ""}`).join("; ") : "none"}.`).join("\n\n")}

## Scene JSON

\`get_scene\` and \`update_scene\` use the studio's own JSON. A scene has \`set\`, \`tod\`, \`music\`, \`fx\` (ids), \`cast\` (\`{who, x, z, facing, visible}\`), \`objects\` (\`{id, obj, x, z, y?, scale, flip?}\`), \`beats\` and \`shots\`. Beats run top to bottom (\`with: true\` starts a beat together with the one before):

- \`{"kind":"say","who":id,"text":"\u2026","mood"?,"gesture"?,"expr"?,"pose"?,"to"?:id}\`
- \`{"kind":"move","who":id,"x":1200,"run"?,"style"?,"y"?,"hop"?}\`
- \`{"kind":"act","who":id,"mood"?,"gesture"?,"expr"?,"pose"?,"face"?:"left|right|front|<id>","sit"?,"visible"?,"dur"?}\`
- \`{"kind":"wait","dur":1}\`, \`{"kind":"sfx","name":id}\`, \`{"kind":"vfx","name":id,"x"?,"dur"?}\`, \`{"kind":"title","text":"\u2026","style":"lower|card|big","dur":3}\`
- \`{"kind":"interact","who":id,"other":id,"type":<interaction>}\`, \`{"kind":"handle","who":id,"obj":<placement id>,"act":"pick|put|give","to"?:id}\`
- \`{"kind":"tween","obj":<placement id>,"x"?,"y"?,"z"?,"scale"?,"rot"?,"opacity"?,"dur":1.5,"ease":"inout"}\`, \`{"kind":"drive","obj":<placement id>,"x":\u2026}\`

Shots: \`{"at": <beat id, null for the first>, "cam": {"size","angle","on":[character ids],"comp","move","lens","dof"?}, "trans": {"kind":"cut","dur":0}}\` (values in camera.md). Leave ids out of new beats and shots; the studio adds them.
`;
}
function catalogPage(topic, site2 = SITE) {
  const t = topic.toLowerCase().replace(/s$/, "");
  if (t === "get-started" || t === "start" || t === "guide") return getStarted(site2);
  const pages = referencePages(site2);
  const key2 = Object.keys(pages).find((p) => p.replace(/^agent\//, "").replace(/s?\.md$/, "") === t || p.includes(t));
  return key2 ? pages[key2][2] : null;
}

// src/core/project.ts
var DEFAULT_GRADE = { look: "", grain: 0.03, vignette: 0.25, letterbox: 0, saturation: 1, contrast: 1, brightness: 0, warmth: 0 };
function newScene(set = "istanbul", title = "New scene") {
  const s = setById(set);
  return { id: uid("s"), title, set: s.id, tod: "day", cast: [], objects: [], beats: [], shots: [], music: s.music ?? "none", ambience: true, fx: [] };
}
function newSection(title = "Act I") {
  return { id: uid("a"), title, scenes: [] };
}
function newProject(title = "My First Film") {
  return {
    v: 1,
    id: uid("p"),
    title,
    director: "",
    characters: [],
    sections: [newSection("Act I")],
    grade: { ...DEFAULT_GRADE },
    cues: [],
    takes: {},
    subtitles: true,
    titleCard: true,
    credits: true,
    res: "720p",
    fps: 30,
    created: Date.now(),
    updated: Date.now()
  };
}

// src/ai/director.ts
var RX = [
  [/(!{2,}|\b(how dare|never|get out|enough|liar|damn|idiot|shut up)\b)/i, "angry"],
  [/\b(what\?!|really\?!|no way|impossible|you\?!|oh!)/i, "surprised"],
  [/\?!/, "surprised"],
  [/\b(help|ghost|monster|run|afraid|scared|danger)\b/i, "scared"],
  [/\b(sorry|alone|miss you|cry|lost|goodbye|sad|dead)\b/i, "sad"],
  [/\b(love|wonderful|great|yay|hooray|thank|happy|beautiful|ha ha|haha)\b/i, "happy"],
  [/\b(of course|obviously|naturally|my dear|as i said)\b/i, "smug"]
];
var GX = [
  [/\b(hello|hi|hey|merhaba|goodbye|bye)\b/i, "wave"],
  [/\b(you|that one|there|look)\b.*[!]/i, "point"],
  [/\b(hmm|maybe|i wonder|perhaps|let me think)\b/i, "think"],
  [/\b(i don't know|who knows|whatever|so\?)\b/i, "shrug"],
  [/\b(hooray|yay|we did it|victory|bravo)\b/i, "cheer"],
  [/\b(oh no|ugh|not again)\b/i, "facepalm"],
  [/\b(help|ghost|monster)\b/i, "scared"],
  [/\b(sir|yes sir|commander)\b/i, "salute"],
  [/\b(come here|my friend|darling)\b/i, "hug"]
];
function guessMood(text3) {
  for (const [r, m] of RX) if (r.test(text3)) return m;
  return void 0;
}
function guessGesture(text3, mood) {
  for (const [r, g] of GX) if (r.test(text3)) return g;
  if (mood === "angry") return "fist";
  if (/\?$/.test(text3.trim())) return "shrug";
  if (/!$/.test(text3.trim())) return "point";
  return void 0;
}
var EXPR_RX = [
  [/\b(ha ?ha|hahaha|hehe|lol)\b/i, "laughing"],
  [/\b(love you|darling|my heart|sweetheart)\b/i, "in-love"],
  [/\b(thank you|thanks|bless you)\b/i, "grateful"],
  [/\b(ew|yuck|disgusting|gross)\b/i, "disgusted"],
  [/\b(hmm|let me think|i wonder|perhaps)\b/i, "thoughtful"],
  [/\b(ouch|ow|it hurts)\b/i, "pain"],
  [/\b(sorry|my fault|forgive)\b/i, "guilty"],
  [/\b(boring|bored)\b/i, "bored"],
  [/\b(tired|exhausted)\b/i, "tired"],
  [/\b(suspicious|really\?|are you sure)\b/i, "suspicious"],
  [/\b(of course|obviously|as i said)\b/i, "smug"],
  [/\b(i will|we must|never give up)\b/i, "determined"],
  [/\b(oh no|careful|what if)\b/i, "worried"]
];
function guessExpr(text3, mood) {
  let name;
  for (const [r, e] of EXPR_RX) if (r.test(text3)) {
    name = e;
    break;
  }
  if (!name && mood && mood !== "neutral") name = { happy: "happy", angry: "angry", surprised: "surprised", sad: "sad", smug: "smug", scared: "scared" }[mood];
  if (!name) return void 0;
  const bangs = (text3.match(/!/g) ?? []).length;
  const caps = /\b[A-ZÇĞİÖŞÜ]{4,}\b/.test(text3);
  const level = text3.includes("?!") || bangs >= 2 || caps ? "very " : bangs === 0 && /\.\.\.|…/.test(text3) ? "slightly " : "";
  return `${level}${name}`;
}
var POSE_RX = [
  [/\b(hello|hi|hey|goodbye|bye)\b/i, "wave"],
  [/\b(look|there|that one)\b/i, "point"],
  [/\b(me\?|myself|i am the)\b/i, "point-at-self"],
  [/\b(i don't know|who knows|whatever)\b/i, "shrug"],
  [/\b(hmm|let me think|i wonder)\b/i, "think"],
  [/\b(oh no|not again|ugh)\b/i, "facepalm"],
  [/\b(please|i beg)\b/i, "beg"],
  [/\b(shh|secret|between us)\b/i, "whisper"],
  [/\b(stop|wait!|halt)\b/i, "stop"],
  [/\b(come here|this way)\b/i, "beckon"],
  [/\b(hooray|we did it|yes!|victory)\b/i, "celebrate"],
  [/\b(cheers|to us)\b/i, "toast"],
  [/\b(thank you|bless)\b/i, "hand-on-heart"]
];
function guessPose(text3, mood) {
  for (const [r, p] of POSE_RX) if (r.test(text3)) return p;
  void mood;
  return void 0;
}
function autoBlock(scene) {
  const s = structuredClone(scene);
  const pos = new Map(s.cast.map((c) => [c.who, c.x]));
  const out = [];
  let lastSpeaker = "";
  for (const b of s.beats) {
    if (b.kind === "move") pos.set(b.who, b.x);
    if (b.kind === "say") {
      if (!b.mood) b.mood = guessMood(b.text);
      if (!b.expr) b.expr = guessExpr(b.text, b.mood);
      if (!b.gesture && !b.pose) b.pose = guessPose(b.text, b.mood);
      if (!b.to) {
        const listener = lastSpeaker && lastSpeaker !== b.who ? lastSpeaker : s.cast.find((c) => c.who !== b.who)?.who;
        if (listener) b.to = listener;
      }
      if (b.to) {
        const me = pos.get(b.who);
        const them = pos.get(b.to);
        if (me !== void 0 && them !== void 0 && Math.abs(me - them) > 650) {
          const x = them + (me < them ? -260 : 260);
          out.push({ id: uid("b"), kind: "move", who: b.who, x });
          pos.set(b.who, x);
        }
      }
      lastSpeaker = b.who;
    }
    out.push(b);
  }
  s.beats = out;
  return s;
}
function autoShots(scene, opts = {}) {
  const cast = scene.cast.map((c) => c.who);
  const shots = [];
  const says2 = scene.beats.filter((b) => b.kind === "say");
  const nSpeakers = new Set(says2.map((b) => b.kind === "say" ? b.who : "")).size;
  shots.push(shot(null, { size: "ews", comp: "set", on: cast, move: opts.first ? "crane-down" : "push", amount: 0.5 }, "Establishing shot.", opts.first ? "fade" : "dissolve", opts.first ? 1.2 : 0.8));
  let last = null;
  let firstExchange = true;
  let lineN = 0;
  for (const b of scene.beats) {
    if (b.kind === "move") {
      const dist = Math.abs(b.x - (scene.cast.find((c) => c.who === b.who)?.x ?? b.x));
      if (dist > 300 || b.run) shots.push(shot(b.id, { size: "fs", comp: "single", on: [b.who], move: "follow", lens: b.run ? "wide" : "normal" }, "Follow the move."));
      last = null;
    } else if (b.kind === "vfx") {
      shots.push(shot(b.id, { size: "ws", comp: "group", on: cast, move: b.name === "explosion" || b.name === "lightning" ? "shake" : "static" }, "Wide for the effect."));
      last = null;
    } else if (b.kind === "drive") {
      shots.push(shot(b.id, { size: "ws", comp: "set", move: "pan", dir: 1, amount: 0.6 }, "Pan with the vehicle."));
      last = null;
    } else if (b.kind === "say") {
      lineN++;
      const m = b.mood;
      const other2 = b.to ?? cast.find((w) => w !== b.who);
      let c;
      let note = "";
      if (m === "surprised" || m === "scared") {
        c = { size: "ms", comp: "single", on: [b.who], move: "crash", amount: 1 };
        note = "Shock: crash zoom (the Ye\u015Fil\xE7am zoom).";
      } else if (m === "angry") {
        c = { size: "mcu", comp: "single", on: [b.who], angle: "low", move: "push", amount: 0.6 };
        note = "Anger from below, pushing in.";
      } else if (m === "sad") {
        c = { size: "cu", comp: "single", on: [b.who], move: "push", amount: 0.4, dof: true, lens: "tele" };
        note = "A soft, close, long-lens close-up for sadness.";
      } else if (m === "smug") {
        c = { size: "ms", comp: "single", on: [b.who], angle: "low" };
        note = "Smugness from a little below.";
      } else if (nSpeakers >= 2 && firstExchange && other2) {
        c = { size: "ms", comp: "ots", on: [b.who, other2] };
        note = "Over the shoulder to open the conversation.";
        firstExchange = false;
      } else if (lineN % 5 === 0 && cast.length > 1) {
        c = { size: "ws", comp: "group", on: cast, move: "arc", amount: 0.4 };
        note = "Back to a wide to breathe.";
      } else {
        c = { size: b.text.length > 90 ? "ms" : "mcu", comp: "single", on: [b.who] };
        note = "Coverage on the speaker.";
      }
      if (last && last.who === b.who && last.size === c.size && !(c.move === "crash")) continue;
      shots.push(shot(b.id, c, note));
      last = { who: b.who, size: c.size };
      if ((m === "surprised" || m === "angry") && other2 && other2 !== b.who) {
        shots.push(shot(b.id, { size: "mcu", comp: "single", on: [other2] }, "Reaction shot.", "cut", 0, [], Math.min(2.5, Math.max(0.9, b.text.length * 0.045))));
        last = { who: other2, size: "mcu" };
      }
    } else if (b.kind === "title" && b.style === "card") {
      shots.push(shot(b.id, { size: "ews", comp: "set" }, "Title card.", "fade", 0.8));
    }
  }
  const firstBeat = scene.beats[0]?.id;
  const second = shots[1];
  if (second && second.at === firstBeat && !second.offset) second.offset = opts.first ? 2.6 : 1.8;
  if (opts.last) shots.push(shot(says2[says2.length - 1]?.id ?? null, { size: "ws", comp: "group", on: cast, move: "crane-up" }, "Rise away for the ending.", "dissolve", 0.8, [], 1.8));
  return shots;
}

// src/core/screenplay.ts
var PROFANITY = [
  ["motherfucker", "scoundrel"],
  ["fucking", "flipping"],
  ["fucked", "messed up"],
  ["fuck", "fudge"],
  ["shit", "shoot"],
  ["bullshit", "nonsense"],
  ["asshole", "jerk"],
  ["bitch", "witch"],
  ["bastard", "rascal"],
  ["damn", "darn"],
  ["goddamn", "gosh darn"],
  ["dick", "jerk"],
  ["crap", "junk"],
  ["piss off", "buzz off"],
  ["am\u0131na koyay\u0131m", "Allah Allah"],
  ["am\u0131na koyim", "Allah Allah"],
  ["am\u0131na koyim", "Allah Allah"],
  ["amk", "yahu"],
  ["aq", "yahu"],
  ["amq", "yahu"],
  ["mk", "yahu"],
  ["siktir git", "defol git"],
  ["siktir", "defol"],
  ["sikerim", "g\xF6r\xFCrs\xFCn sen"],
  ["sikeyim", "neyse"],
  ["sik", "\u015Fey"],
  ["orospu \xE7ocu\u011Fu", "kerata"],
  ["orospu", "kerata"],
  ["o\xE7", "kerata"],
  ["pi\xE7", "kerata"],
  ["yav\u015Fak", "s\xFCnepe"],
  ["pu\u015Ft", "herif"],
  ["ibne", "herif"],
  ["g\xF6t", "k\u0131\xE7"],
  ["g\xF6tveren", "al\xE7ak"],
  ["kahpe", "hain"],
  ["gavat", "herif"],
  ["dangalak", "sersem"],
  ["\u015Ferefsiz", "vicdans\u0131z"],
  ["pezevenk", "\xFC\xE7ka\u011F\u0131t\xE7\u0131"]
];
var isName = (n) => {
  const w = n.trim().split(/\s+/);
  return w.length <= 3 && w.every((x) => /^[\p{Lu}]/u.test(x)) && !/[.!?,]$/.test(n.trim()) && !/^(THE|A|AN|INT|EXT|CUT|FADE)$/i.test(w[0]);
};
var esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var PROF_RX = PROFANITY.map(([w, r]) => [new RegExp(`(?<![\\p{L}])${esc(w)}(?![\\p{L}])`, "giu"), r]);
function cleanProfanity(text3) {
  let n = 0;
  let out = text3;
  for (const [rx, rep] of PROF_RX)
    out = out.replace(rx, (m) => {
      n++;
      return m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? rep[0].toUpperCase() + rep.slice(1) : rep;
    });
  return { text: out, n };
}
var SET_WORDS = [
  [/apartment|flat|living ?room|kitchen|bedroom|salon|oturma|mutfak|daire|\bev\b|evi\b|home/i, "apartment"],
  [/bazaar|market|souk|çarşı|pazar/i, "bazaar"],
  [/castle|medieval|kingdom|tavern|kale|şato/i, "medieval"],
  [/war|trench|front|battle|savaş|cephe|siper/i, "ww2"],
  [/cave|stone ?age|prehistoric|mağara|taş devri/i, "stoneage"],
  [/future|sky ?city|spaceship|robot|gelecek/i, "skycity"],
  [/haunted|ghost|mansion|graveyard|perili|hayalet|konak/i, "haunted"],
  [/farm|barn|village|field|çiftlik|köy|tarla|ahır/i, "farm"],
  [/plane|airplane|flight|cabin|uçak/i, "airplane"],
  [/mars|planet|space ?base|gezegen/i, "mars"],
  [/office|café|cafe|city|downtown|bank|ofis|şirket|kafe|banka|plaza/i, "city"],
  [/street|road|square|bosphorus|ferry|sokak|cadde|meydan|boğaz|vapur|mahalle/i, "istanbul"]
];
function guessSet(heading, interior) {
  for (const [rx, id] of SET_WORDS) if (rx.test(heading) && SETS.some((s) => s.id === id)) return id;
  return interior && SETS.some((s) => s.id === "apartment") ? "apartment" : "istanbul";
}
function guessTod(heading) {
  if (/night|midnight|gece/i.test(heading)) return "night";
  if (/evening|dusk|sunset|akşam|gün batımı/i.test(heading)) return "dusk";
  if (/morning|dawn|sunrise|sabah|şafak/i.test(heading)) return "dawn";
  return "day";
}
var MOOD_WORDS = [
  [/angr|furious|shout|yell|scream|mad|kızgın|öfke|bağır|sinirli/i, "angry"],
  [/surpris|shock|astonish|gasp|şaşkın|şaşır|hayret/i, "surprised"],
  [/scared|afraid|terrified|panic|nervous|korku|korkmuş|tedirgin|panik/i, "scared"],
  [/sad|cry|tearful|sorrow|sob|üzgün|ağla|hüzün/i, "sad"],
  [/smug|sarcas|ironic|sly|smirk|alaycı|ironik|kurnaz|imalı/i, "smug"],
  [/happy|laugh|cheer|excit|joy|smil|grin|mutlu|gül|sevinç|neşe|heyecan/i, "happy"]
];
var GESTURE_WORDS = [
  [/point|işaret/i, "point"],
  [/shrug|omuz silk/i, "shrug"],
  [/wav|el salla/i, "wave"],
  [/think|ponder|düşün/i, "think"],
  [/cheer|celebrat|sevinç/i, "cheer"],
  [/facepalm|head in hands|eliyle yüzünü/i, "facepalm"],
  [/typ|yaz/i, "type"],
  [/fist|yumruk/i, "fist"],
  [/bow|eğil/i, "bow"],
  [/hug|sarıl/i, "hug"],
  [/clap|alkış/i, "clap"],
  [/salut|selam dur/i, "salute"],
  [/hold|tutar/i, "hold"],
  [/scared|cower|sin/i, "scared"]
];
var PHRASE = /* @__PURE__ */ new Set(["expr", "preset", "style", "voice", "mood", "gesture"]);
function kv(s) {
  const map = {};
  const words = [];
  const key2 = /([A-Za-z]\w*)\s*=\s*/y;
  let i = 0;
  const endAt = (rx) => {
    rx.lastIndex = i;
    const m = rx.exec(s);
    return m ? m.index : s.length;
  };
  while (i < s.length) {
    while (i < s.length && /[\s,;]/.test(s[i])) i++;
    if (i >= s.length) break;
    key2.lastIndex = i;
    const m = key2.exec(s);
    if (m) {
      const k = m[1].toLowerCase();
      i = key2.lastIndex;
      let v;
      if (s[i] === '"') {
        const j = s.indexOf('"', i + 1);
        v = s.slice(i + 1, j < 0 ? s.length : j);
        i = j < 0 ? s.length : j + 1;
      } else {
        const end = endAt(PHRASE.has(k) ? /[,;]|\s+[A-Za-z]\w*\s*=/g : /[\s,;]/g);
        v = s.slice(i, end).trim();
        i = end;
      }
      map[k] = v;
    } else {
      const end = endAt(/[\s,;]/g);
      words.push(s.slice(i, end));
      i = end;
    }
  }
  return { map, flags: words.map((w) => w.toLowerCase()), rest: words.join(" ") };
}
function exprOk(spec) {
  return spec.split("+").every((part) => {
    const w = part.trim().split(/\s+/);
    const lvl = EXPR_LEVELS.includes(w[0]) && w.length > 1 ? w.shift() : null;
    return lvl !== void 0 && EXPR_NAMES.includes(w.join(" "));
  });
}
var poseOk = (p) => POSE_NAMES.includes(p) || GESTURE_LIST.includes(p);
function parenthetical(p, warn) {
  let mood;
  let gesture;
  let expr;
  let pose;
  const { map, rest: rest2 } = kv(p);
  if (map.mood) {
    if (MOOD_LIST.includes(map.mood)) mood = map.mood;
    else warn?.(`mood "${map.mood}" is not one of ${MOOD_LIST.join(", ")}`);
  }
  if (map.gesture) {
    if (GESTURE_LIST.includes(map.gesture)) gesture = map.gesture;
    else warn?.(`gesture "${map.gesture}" is not one of ${GESTURE_LIST.join(", ")}`);
  }
  if (map.expr) {
    if (exprOk(map.expr)) expr = map.expr;
    else warn?.(`expression "${map.expr}" is not known (levels ${EXPR_LEVELS.filter(Boolean).join("/")} + one of the 46 names, joined with +)`);
  }
  if (map.pose) {
    if (poseOk(map.pose)) pose = map.pose;
    else warn?.(`pose "${map.pose}" is not in the motion library`);
  }
  if (!expr && rest2 && exprOk(rest2) && !MOOD_LIST.includes(rest2)) expr = rest2;
  if (!mood) {
    for (const [rx, m] of MOOD_WORDS) if (rx.test(rest2)) {
      mood = m;
      break;
    }
  }
  if (!gesture) {
    for (const [rx, g] of GESTURE_WORDS) if (rx.test(rest2)) {
      gesture = g;
      break;
    }
  }
  return { mood, gesture, expr, pose };
}
function sfxFor(name) {
  const n = name.toLowerCase().trim();
  if (SFX[n.replace(/\s+/g, "-")]) return n.replace(/\s+/g, "-");
  const words = n.split(/[\s-]+/);
  let best = null;
  let score = 0;
  for (const id of SFX_NAMES) {
    const hay = `${id} ${SFX[id][0]}`.toLowerCase();
    const s = words.filter((w) => w.length > 2 && hay.includes(w)).length;
    if (s > score) {
      score = s;
      best = id;
    }
  }
  if (!best) {
    if (/knock|kapı/i.test(n)) best = "door-knock";
    else if (/laugh|güler/i.test(n)) best = "laugh-crowd";
    else if (/phone|telefon/i.test(n)) best = "phone-ring";
    else if (/bell|zil/i.test(n)) best = "doorbell";
  }
  return best;
}
function parseShot(note, names, at2) {
  const t = ` ${note.toLowerCase()} `;
  const has = (...w) => w.some((x) => t.includes(x));
  const c = { on: [] };
  c.size = has(" ecu", "extreme close") ? "ecu" : has(" mcu", "medium close") ? "mcu" : has(" cu ", " cu,", "close-up", "close up", "closeup", "yak\u0131n") ? "cu" : has(" mls", "cowboy", "american", "knee") ? "mls" : has(" ms ", " ms,", "medium", "mid shot", "waist", "bel plan") ? "ms" : has(" fs ", " fs,", "full shot", "full body", "boy plan") ? "fs" : has(" ews", "extreme wide", "establishing", "genel plan") ? "ews" : has(" ws", "wide", "long shot", "master", "uzak") ? "ws" : "ms";
  c.angle = has("low angle", "from below", "alt a\xE7\u0131") ? "low" : has("worm") ? "worm" : has("high angle", "from above", "\xFCst a\xE7\u0131") ? "high" : has("bird", "overhead", "top shot", "ku\u015F bak\u0131\u015F\u0131") ? "bird" : has("dutch", "tilted", "canted") ? "dutch" : "eye";
  c.move = has("crash zoom", "snap zoom") ? "crash" : has("dolly zoom", "vertigo") ? "dollyzoom" : has("zoom in") ? "zoomin" : has("zoom out") ? "zoomout" : has("push in", "push", "dolly in", "creep in") ? "push" : has("pull out", "pull back", "dolly out") ? "pull" : has("whip") ? "whip" : has("pan") ? "pan" : has("tilt") ? "tilt" : has("handheld", "shaky") ? "handheld" : has("shake") ? "shake" : has("follow", "tracking") ? "follow" : has("truck") ? "truck" : has("crane up", "rise") ? "crane-up" : has("crane down", "descend") ? "crane-down" : has("rack focus", "focus pull") ? "rack" : has("arc", "slide") ? "arc" : "static";
  c.lens = has("wide lens", "fisheye") ? "wide" : has("long lens", "telephoto", " tele") ? "tele" : "normal";
  c.dof = has("shallow", "bokeh", "focus");
  for (const [lower, id] of names) if (t.includes(lower)) c.on.push(id);
  c.comp = has("over the shoulder", " ots", "omuz") ? "ots" : has("two-shot", "two shot", "2-shot", "ikili") ? "two" : has("group", "everyone", "all of them") ? "group" : c.on.length === 0 ? c.size === "ews" || c.size === "ws" ? "set" : "auto" : c.on.length === 1 ? "single" : "auto";
  const trans = has("dissolve") ? "dissolve" : has("fade") ? "fade" : has("flash") ? "flash" : has("iris") ? "iris" : has("wipe") ? "wipe" : has("whip pan") ? "whip" : has("smash") ? "cut" : "cut";
  return shot(at2, c, `From the script: ${note.trim()}`, trans, trans === "cut" ? 0 : 0.8);
}
var HEADING = /^(?:\d+[.)]?\s*)?(INT\.?|EXT\.?|INT\.?\/EXT\.?|İÇ\.?|IÇ\.?|DIŞ\.?|DIS\.?|SCENE\s*\d*[:.-]|SAHNE\s*\d*[:.-])\s*(.*)$/i;
var ACT = /^(?:#+\s*(.+)|(ACT|BÖLÜM|PERDE|PART)\b\s*(.*))$/i;
var CUE = /^\[(\w[\w\s]*?)\s*[:\s]\s*(.*?)\]$/;
var NAME_LINE = /^([\p{Lu}][\p{Lu}\p{Ll}'.\s-]{0,30}?)\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/u;
var NAME_ONLY = /^([\p{Lu}][\p{Lu}'.\s-]{1,30}?)\s*(?:\(([^)]*)\))?$/u;
function importScreenplay(p, src, opts) {
  const report = { acts: 0, scenes: 0, lines: 0, characters: [], newCharacters: [], cleaned: 0, shots: 0, warnings: [] };
  const chars = new Map(p.characters.map((c) => [c.name.toLowerCase(), c]));
  const newChars = [];
  const sections = [];
  let sec = null;
  let scene = null;
  let pendingShot = null;
  let pendingTrans = null;
  let hadCamera = /* @__PURE__ */ new Set();
  let lastWho = null;
  let pendingParen = "";
  const sceneDesc = /* @__PURE__ */ new Map();
  const updates = /* @__PURE__ */ new Map();
  const warn = (w) => report.warnings.push(w);
  const change = (c, f) => {
    if (newChars.includes(c)) {
      if (f.look) c.look = { ...c.look, ...f.look };
      if (f.voice) c.voice = { ...c.voice, ...f.voice };
      if (f.bio !== void 0) c.bio = f.bio;
      return;
    }
    const u = updates.get(c.id) ?? { id: c.id };
    if (f.look) u.look = { ...u.look, ...f.look };
    if (f.voice) u.voice = { ...u.voice, ...f.voice };
    if (f.bio !== void 0) u.bio = f.bio;
    updates.set(c.id, u);
  };
  const who = (arg) => {
    const words = arg.trim().split(/\s+/);
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const name = words.slice(0, n).join(" ");
      if (/[={]/.test(name) || /^YSC1:/.test(name)) continue;
      const known = [...chars.values()].find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (known || n === 1) return { c: known ?? character(name), rest: words.slice(n).join(" ") };
    }
    return null;
  };
  const num2 = (v) => v === void 0 || v === "" || !isFinite(+v) ? void 0 : +v;
  const character = (rawName) => {
    const name = rawName.trim().replace(/\s+/g, " ");
    const pretty = name === name.toUpperCase() ? name.toLowerCase().replace(new RegExp("(^|\\s|-)(\\p{L})", "gu"), (_, a, b) => a + b.toLocaleUpperCase("tr")) : name;
    const key2 = pretty.toLowerCase();
    let c = chars.get(key2);
    if (!c) {
      let h = 0;
      for (const ch of key2) h = h * 31 + ch.charCodeAt(0) >>> 0;
      c = { id: uid("c"), name: pretty, color: ["#5fd4ff", "#ff7b7b", "#ffcf3f", "#c3a6ff", "#6ef0a8", "#ff9ec2", "#ffb703", "#9ad7ff"][h % 8], bio: "", look: randomLook(h % 9973 / 9973), voice: { ...DEFAULT_VOICE, pitch: 105 + h % 160 } };
      chars.set(key2, c);
      newChars.push(c);
      report.newCharacters.push(pretty);
    }
    if (!report.characters.includes(c.name)) report.characters.push(c.name);
    return c;
  };
  const ensureScene = () => {
    if (!scene) startScene("Scene", false);
    return scene;
  };
  const ensureCast = (sc, who2, visible = true) => {
    if (sc.cast.some((c) => c.who === who2)) return;
    const W17 = setById(sc.set).width;
    const n = sc.cast.length;
    const x = Math.round(W17 / 2 + (n % 2 ? 1 : -1) * (200 + Math.floor(n / 2) * 330) - (n === 0 ? 0 : 0));
    sc.cast.push({ who: who2, x: Math.max(250, Math.min(W17 - 250, x)), z: n > 3 ? 120 : 0, facing: x < W17 / 2 ? 1 : -1, visible });
  };
  const push = (b) => {
    const sc = ensureScene();
    sc.beats.push(b);
    if (pendingShot !== null || pendingTrans) {
      const sh = parseShot(pendingShot ?? "ms", nameMap(), sc.beats.length === 1 ? null : b.id);
      if (pendingTrans) sh.trans = { kind: pendingTrans, dur: pendingTrans === "cut" ? 0 : 0.8 };
      sc.shots.push(sh);
      hadCamera.add(sc);
      report.shots++;
      pendingShot = null;
      pendingTrans = null;
    }
  };
  const nameMap = () => new Map([...chars.values()].map((c) => [c.name.toLowerCase(), c.id]));
  const clean = (t) => {
    if (!opts.clean) return t;
    const r = cleanProfanity(t);
    report.cleaned += r.n;
    return r.text;
  };
  function startScene(heading, interior) {
    if (!sec) {
      sec = newSection(`Act ${sections.length + 1}`);
      sections.push(sec);
      report.acts++;
    }
    const set = guessSet(heading, interior);
    scene = newScene(set, heading.replace(/\s+/g, " ").trim().slice(0, 60) || `Scene ${report.scenes + 1}`);
    scene.tod = guessTod(heading);
    scene.music = setById(set).music ?? "none";
    sec.scenes.push(scene);
    sceneDesc.set(scene, []);
    report.scenes++;
    lastWho = null;
  }
  const lines = src.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.match(HEADING) || l.match(CUE) || /^(TITLE|BAŞLIK)\s*:/i.test(l)) continue;
    let m = l.match(NAME_LINE);
    if (m && isName(m[1])) character(m[1]);
    else if ((m = l.match(NAME_ONLY)) && m[1] === m[1].toUpperCase() && new RegExp("\\p{Lu}{2}", "u").test(m[1]) && lines[i + 1]?.trim() && !/^(ACT|BÖLÜM|PERDE|PART|CUT TO|FADE|DISSOLVE|KESME)/i.test(l)) character(m[1]);
  }
  report.characters = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line9 = raw.trim();
    if (!line9) {
      lastWho = null;
      continue;
    }
    let m;
    if ((m = line9.match(/^TITLE\s*:\s*(.+)$/i)) || (m = line9.match(/^BAŞLIK\s*:\s*(.+)$/i))) {
      report.title = m[1].trim();
      continue;
    }
    if ((m = line9.match(ACT)) && !line9.match(HEADING)) {
      const title = (m[1] ?? `${m[2]} ${m[3] ?? ""}`).trim();
      sec = newSection(title.charAt(0) + title.slice(1).toLowerCase());
      sections.push(sec);
      report.acts++;
      scene = null;
      continue;
    }
    if (m = line9.match(HEADING)) {
      const interior = /^(INT|İÇ|IÇ)/i.test(m[1]) || /^(SCENE|SAHNE)/i.test(m[1]);
      startScene(m[2] || m[1], interior);
      continue;
    }
    if (m = line9.match(CUE)) {
      const [, kindRaw, arg] = m;
      const kind = kindRaw.toUpperCase().trim();
      if (/^(LOOK|VOICE|BIO|CHARACTER)$/.test(kind)) {
        characterCue(kind, arg);
        continue;
      }
      const sc2 = ensureScene();
      if (/^(SFX|SOUND|SES)$/.test(kind)) {
        const s = sfxFor(arg);
        if (s) push({ id: uid("b"), kind: "sfx", name: s });
        else report.warnings.push(`No sound for "${arg}"`);
      } else if (/^(VFX|EFFECT)$/.test(kind)) {
        const f = FX.find((x) => x.kind === "event" && (x.id === arg.toLowerCase().trim() || x.name.toLowerCase().includes(arg.toLowerCase().trim())));
        if (f) push({ id: uid("b"), kind: "vfx", name: f.id, dur: 2 });
      } else if (/^(FX|LOOK|WEATHER)$/.test(kind)) {
        const f = FX.find((x) => x.kind !== "event" && (x.id === arg.toLowerCase().trim() || x.name.toLowerCase().includes(arg.toLowerCase().trim())));
        if (f && !sc2.fx.includes(f.id)) sc2.fx.push(f.id);
      } else if (/^(MUSIC|MÜZİK|MUZIK)$/.test(kind)) {
        const mood = arg.toLowerCase().trim();
        sc2.music = MUSIC_MOODS.includes(mood) ? mood : /none|no|yok|silence/.test(mood) ? "none" : sc2.music;
      } else if (/^(PAUSE|BEAT|WAIT|DURAKSAMA)$/.test(kind)) {
        push({ id: uid("b"), kind: "wait", dur: Math.max(0.3, parseFloat(arg) || 1) });
      } else if (/^(TITLE|CAPTION|YAZI)$/.test(kind)) {
        push({ id: uid("b"), kind: "title", text: clean(arg).slice(0, 80), style: "lower", dur: 3 });
      } else if (/^(SHOT|CAMERA|CAM|CUT TO|PLAN|KAMERA)$/.test(kind)) {
        pendingShot = arg || "ms";
      } else if (/^(SET|PLATEAU|SETTING)$/.test(kind)) {
        const id = arg.trim().toLowerCase();
        const s2 = SETS.find((x) => x.id === id || x.name.toLowerCase() === id);
        if (s2) {
          sc2.set = s2.id;
          sc2.music = s2.music ?? sc2.music;
        } else warn(`[SET: ${arg}]: no such set (${SETS.map((x) => x.id).join(", ")})`);
      } else if (/^(TIME|TOD)$/.test(kind)) {
        const t = arg.trim().toLowerCase();
        if (t === "dawn" || t === "day" || t === "dusk" || t === "night") sc2.tod = t;
        else warn(`[TIME: ${arg}]: dawn, day, dusk or night`);
      } else if (/^(OBJECT|PROP)$/.test(kind)) {
        const { map, flags: flags2, rest: rest2 } = kv(arg);
        const key2 = rest2.toLowerCase();
        const d = propById(key2.split(" ")[0]) ?? PROPS.find((x) => x.name.toLowerCase() === key2);
        if (!d) warn(`[OBJECT: ${arg}]: no such object in the library`);
        else {
          const W17 = setById(sc2.set).width;
          const n = sc2.objects.length;
          sc2.objects.push({ id: uid("o"), obj: d.id, x: num2(map.x) ?? Math.round(W17 / 2 + (n % 2 ? 1 : -1) * (150 + n * 90)), z: num2(map.z) ?? (d.vehicle ? 150 : 60), y: num2(map.y), scale: num2(map.scale) ?? 1, flip: flags2.includes("flip") || void 0 });
        }
      } else if (/^(PLACE|POSITION)$/.test(kind)) {
        const w = who(arg);
        if (w) {
          ensureCast(sc2, w.c.id);
          const pl = sc2.cast.find((x) => x.who === w.c.id);
          const { map } = kv(w.rest);
          pl.x = num2(map.x) ?? pl.x;
          pl.z = num2(map.z) ?? pl.z;
          if (map.facing === "left" || map.facing === "right") pl.facing = map.facing === "right" ? 1 : -1;
        }
      } else if (/^(MOVE|WALK)$/.test(kind)) {
        const w = who(arg);
        if (w) {
          ensureCast(sc2, w.c.id);
          const { map, flags: flags2 } = kv(w.rest);
          let x = num2(map.x);
          if (x === void 0 && map.to) {
            const t = map.to.toLowerCase();
            const mark = Object.entries(setById(sc2.set).marks).find(([k]) => k.toLowerCase() === t);
            const other2 = [...chars.values()].find((o) => o.name.toLowerCase() === t);
            x = mark?.[1] ?? (other2 ? (sc2.cast.find((c) => c.who === other2.id)?.x ?? 0) - 240 : void 0);
            if (x === void 0) warn(`[MOVE: ${arg}]: "${map.to}" is not a mark of ${sc2.set} (${Object.keys(setById(sc2.set).marks).join(", ")}) or a character`);
          }
          const style = map.style && GAITS.includes(map.style) ? map.style : void 0;
          if (map.style && !style) warn(`[MOVE]: style "${map.style}" is not one of ${GAITS.join(", ")}`);
          if (x !== void 0) push({ id: uid("b"), kind: "move", who: w.c.id, x, run: flags2.includes("run") || void 0, style, y: num2(map.y), with: flags2.includes("with") || void 0 });
        }
      } else if (/^(ACT|DO)$/.test(kind)) {
        const w = who(arg);
        if (w) {
          ensureCast(sc2, w.c.id);
          const { map, flags: flags2 } = kv(w.rest);
          const pr = parenthetical(w.rest, warn);
          const face = map.face ? ["left", "right", "front"].includes(map.face) ? map.face : [...chars.values()].find((o) => o.name.toLowerCase() === map.face.toLowerCase())?.id : void 0;
          if (map.face && !face) warn(`[ACT]: face "${map.face}" is left, right, front or a character`);
          push({
            id: uid("b"),
            kind: "act",
            who: w.c.id,
            mood: pr.mood,
            gesture: pr.gesture,
            expr: pr.expr,
            pose: pr.pose,
            face,
            sit: flags2.includes("sit") ? true : flags2.includes("stand") ? false : void 0,
            visible: flags2.includes("appear") || flags2.includes("appears") ? true : flags2.includes("disappear") || flags2.includes("disappears") ? false : void 0,
            dur: num2(map.dur),
            with: flags2.includes("with") || void 0
          });
        }
      } else if (/^(PICK|PUT|GIVE|HANDLE)$/.test(kind)) {
        const w = who(arg);
        if (w) {
          ensureCast(sc2, w.c.id);
          const { map, flags: flags2 } = kv(w.rest);
          const act2 = kind === "HANDLE" ? flags2.find((f) => f === "pick" || f === "put" || f === "give") ?? "pick" : kind.toLowerCase();
          const key2 = flags2.filter((f) => !["pick", "put", "give", "with"].includes(f)).join(" ");
          const o = sc2.objects.find((x) => x.id === key2 || x.obj === key2) ?? sc2.objects.find((x) => propById(x.obj)?.name.toLowerCase() === key2);
          const other2 = map.to ? [...chars.values()].find((c) => c.name.toLowerCase() === map.to.toLowerCase()) : void 0;
          if (!o) warn(`[${kind}: ${arg}]: no object "${key2}" on this set (place it first with [OBJECT: ${key2 || "id"} \u2026])`);
          else if (act2 === "give" && !other2) warn(`[GIVE: ${arg}]: give it to=<a character>`);
          else push({ id: uid("b"), kind: "handle", who: w.c.id, obj: o.id, act: act2, to: other2?.id, x: num2(map.x), y: num2(map.y), with: flags2.includes("with") || void 0 });
        }
      } else if (/^(INTERACT|TOGETHER)$/.test(kind)) {
        const w = who(arg);
        if (w) {
          const { map, flags: flags2 } = kv(w.rest);
          const type = flags2.find((f) => f in INTERACTIONS) ?? map.type;
          const other2 = map.with ? [...chars.values()].find((c) => c.name.toLowerCase() === map.with.toLowerCase()) : void 0;
          if (!type || !(type in INTERACTIONS)) warn(`[INTERACT: ${arg}]: the interaction is one of ${Object.keys(INTERACTIONS).join(", ")}`);
          else if (!other2) warn(`[INTERACT: ${arg}]: with=<another character>`);
          else {
            ensureCast(sc2, w.c.id);
            ensureCast(sc2, other2.id);
            push({ id: uid("b"), kind: "interact", who: w.c.id, other: other2.id, type, dur: num2(map.dur) });
          }
        }
      } else if (/^(TRANSITION|GEÇİŞ|GECIS)$/.test(kind)) {
        pendingTrans = ["dissolve", "fade", "flash", "iris", "heart", "wipe", "clock", "whip", "zoom", "glitch", "burn", "ripple"].find((k) => arg.toLowerCase().includes(k)) ?? "dissolve";
      } else report.warnings.push(`Unknown cue [${kind}]`);
      continue;
    }
    if (/^(CUT TO|DISSOLVE TO|FADE (IN|OUT|TO)|KESME|SMASH CUT)/i.test(line9)) {
      if (/DISSOLVE/i.test(line9)) pendingTrans = "dissolve";
      else if (/FADE/i.test(line9)) pendingTrans = "fade";
      continue;
    }
    if ((m = line9.match(NAME_LINE)) && isName(m[1])) {
      const c = character(m[1]);
      const sc2 = ensureScene();
      ensureCast(sc2, c.id);
      const { mood, gesture, expr, pose } = parenthetical(m[2] ?? "", warn);
      const text3 = clean(m[3].trim());
      push({ id: uid("b"), kind: "say", who: c.id, text: text3, mood: mood ?? guessMood(text3), gesture: gesture ?? guessGesture(text3, mood), expr, pose });
      report.lines++;
      lastWho = null;
      continue;
    }
    if ((m = line9.match(NAME_ONLY)) && m[1] === m[1].toUpperCase() && new RegExp("\\p{Lu}{2}", "u").test(m[1]) && i + 1 < lines.length && lines[i + 1].trim()) {
      const c = character(m[1]);
      ensureCast(ensureScene(), c.id);
      lastWho = c.id;
      pendingParen = m[2] ?? "";
      continue;
    }
    if (lastWho && /^\(.*\)$/.test(line9)) {
      pendingParen = line9.slice(1, -1);
      continue;
    }
    if (lastWho) {
      let text3 = line9;
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^\(.*\)$/.test(lines[i + 1].trim()) && !lines[i + 1].trim().match(NAME_ONLY)?.[1]?.match(new RegExp("^\\p{Lu}{2}", "u"))) text3 += " " + lines[++i].trim();
      const { mood, gesture, expr, pose } = parenthetical(pendingParen, warn);
      const t = clean(text3);
      push({ id: uid("b"), kind: "say", who: lastWho, text: t, mood: mood ?? guessMood(t), gesture: gesture ?? guessGesture(t, mood), expr, pose });
      report.lines++;
      pendingParen = "";
      continue;
    }
    const sc = ensureScene();
    const act = clean(line9);
    sceneDesc.get(sc).push(act);
    blocking(act, sc);
  }
  function characterCue(kind, arg) {
    const w = who(arg);
    if (!w) return;
    const rest2 = w.rest.trim();
    if (kind === "BIO") return change(w.c, { bio: rest2.slice(0, 600) });
    if (kind === "VOICE") {
      const { map } = kv(rest2);
      const voice = {};
      if (num2(map.pitch) !== void 0) voice.pitch = Math.max(90, Math.min(320, num2(map.pitch)));
      if (num2(map.rate) !== void 0) voice.rate = Math.max(0.7, Math.min(1.4, num2(map.rate)));
      if (map.voice) voice.voice = map.voice;
      if (map.style) voice.style = map.style;
      return change(w.c, { voice });
    }
    let m;
    if (m = rest2.match(/^preset\s*=\s*"?([^"]+?)"?$/i)) {
      const pr = PRESETS.find((x) => x.name.toLowerCase() === m[1].trim().toLowerCase());
      if (pr) change(w.c, { look: structuredClone(pr.look) });
      else warn(`[LOOK: ${arg}]: no stock character "${m[1]}" (${PRESETS.map((x) => x.name).join(", ")})`);
    } else if (/YSC1:/.test(rest2)) {
      try {
        change(w.c, { look: characterFromCode(rest2, w.c.id).look });
      } catch (e) {
        warn(`[LOOK: ${w.c.name}]: ${e.message}`);
      }
    } else if (rest2.startsWith("{")) {
      try {
        const r = lookFromSpec(JSON.parse(rest2));
        r.warnings.forEach((x) => warn(`[LOOK: ${w.c.name}] ${x}`));
        change(w.c, { look: r.look });
      } catch {
        warn(`[LOOK: ${w.c.name}]: the look is not valid JSON`);
      }
    } else if (rest2) warn(`[LOOK: ${arg}]: use preset=<name>, a YSC1: code or {"field": value, \u2026}`);
  }
  function blocking(text3, sc) {
    const set = setById(sc.set);
    const marks = Object.entries(set.marks);
    for (const c of chars.values()) {
      const n = esc(c.name);
      const rx = (verbs) => new RegExp(`\\b${n}\\b[^.]*?\\b(${verbs})\\b(.*)`, "iu");
      let m;
      if (m = text3.match(rx("enters|comes in|arrives|walks in|bursts in|girer|gelir|i\xE7eri girer"))) {
        const first = !sc.cast.some((x) => x.who === c.id);
        ensureCast(sc, c.id, !first);
        const door2 = marks.find(([k]) => /door|kapı|entr|hallway/i.test(k))?.[1];
        const placed = sc.cast.find((x) => x.who === c.id);
        if (first && door2 !== void 0) {
          const target = placed.x;
          placed.x = door2;
          push({ id: uid("b"), kind: "act", who: c.id, visible: true });
          push({ id: uid("b"), kind: "move", who: c.id, x: target });
        } else push({ id: uid("b"), kind: "act", who: c.id, visible: true });
      } else if (m = text3.match(rx("leaves|exits|storms out|goes out|walks out|\xE7\u0131kar|gider|terk eder"))) {
        ensureCast(sc, c.id);
        const door2 = marks.find(([k]) => /door|kapı|entr|hallway|left/i.test(k))?.[1] ?? 100;
        push({ id: uid("b"), kind: "move", who: c.id, x: door2, run: /storms|runs|koşar/i.test(m[0]) });
        push({ id: uid("b"), kind: "act", who: c.id, visible: false });
      } else if (m = text3.match(rx("walks to|goes to|crosses to|runs to|moves to|heads to|y\xFCr\xFCr|gider|ko\u015Far"))) {
        ensureCast(sc, c.id);
        const rest2 = m[2].toLowerCase();
        const mark = marks.find(([k]) => rest2.includes(k.toLowerCase()));
        const other2 = [...chars.values()].find((o) => o !== c && rest2.includes(o.name.toLowerCase()));
        const ox = other2 ? sc.cast.find((x2) => x2.who === other2.id)?.x : void 0;
        const x = mark?.[1] ?? (ox !== void 0 ? ox - 240 : void 0);
        if (x !== void 0) push({ id: uid("b"), kind: "move", who: c.id, x, run: /runs|koşar/i.test(m[1]) });
      } else if (m = text3.match(rx("sits|sits down|oturur"))) {
        ensureCast(sc, c.id);
        push({ id: uid("b"), kind: "act", who: c.id, sit: true });
      } else if (m = text3.match(rx("stands up|gets up|jumps up|kalkar|aya\u011Fa kalkar"))) {
        ensureCast(sc, c.id);
        push({ id: uid("b"), kind: "act", who: c.id, sit: false });
      } else if ((m = text3.match(rx("[a-z]+s"))) && new RegExp(`^\\s*${n}\\b`, "iu").test(text3)) {
        const { mood, gesture } = parenthetical(text3);
        if (mood || gesture) {
          ensureCast(sc, c.id);
          push({ id: uid("b"), kind: "act", who: c.id, mood, gesture });
        }
      }
    }
  }
  for (const s of sections) {
    for (const sc of s.scenes) {
      const d = sceneDesc.get(sc) ?? [];
      if (d.length) sc.logline = d.join(" ").slice(0, 1200);
      if (!sc.cast.length) report.warnings.push(`"${sc.title}" has nobody in it`);
      if (hadCamera.has(sc)) {
        if (sc.shots[0]) sc.shots[0].at = null;
        else sc.shots = [];
      }
    }
  }
  if (opts.direct) {
    const all = sections.flatMap((s) => s.scenes);
    all.forEach((sc, i) => {
      if (hadCamera.has(sc)) return;
      const blocked = autoBlock(sc);
      sc.beats = blocked.beats;
      sc.shots = autoShots(sc, { first: i === 0, last: i === all.length - 1 });
      sc.directedBy = "Studio director";
    });
  }
  hadCamera = /* @__PURE__ */ new Set();
  return { sections, characters: newChars, updates: [...updates.values()], report };
}

// src/agent/report.ts
function emptyProject() {
  const p = newProject("");
  p.sections = [];
  return p;
}
function checkScreenplay(text3) {
  const p = emptyProject();
  const r = importScreenplay(p, text3, { clean: true, direct: true });
  const rep = r.report;
  p.characters = r.characters;
  p.sections = r.sections;
  const scenes = r.sections.flatMap((s) => s.scenes);
  const lines = [];
  lines.push(`${rep.title ? `"${rep.title}"` : "Untitled"}: ${rep.acts} act${rep.acts === 1 ? "" : "s"}, ${rep.scenes} scene${rep.scenes === 1 ? "" : "s"}, ${rep.lines} line${rep.lines === 1 ? "" : "s"}, ${rep.shots} camera note${rep.shots === 1 ? "" : "s"}`);
  lines.push(`Characters: ${r.characters.map((c) => c.name).join(", ") || "none"}`);
  r.sections.forEach((sec) => {
    lines.push(`${sec.title}:`);
    for (const sc of sec.scenes) {
      let dur = 0;
      try {
        dur = compileScene(p, sc).dur;
      } catch {
      }
      lines.push(`  ${scenes.indexOf(sc) + 1}. ${sc.title}: set ${sc.set}, ${sc.tod}, ${sc.cast.length} on stage, ${sc.objects.length} objects, ${sc.beats.length} beats, ${sc.shots.length} shots${dur ? `, ${dur.toFixed(1)} s` : ""}`);
    }
  });
  if (rep.cleaned) lines.push(`Profanity cleaned: ${rep.cleaned} word${rep.cleaned === 1 ? "" : "s"}`);
  const ok = rep.scenes > 0 || rep.lines > 0;
  if (!ok) lines.push("Nothing was found: no scenes or lines. Check the format (agent/screenplay.md).");
  if (rep.warnings.length) lines.push(`Warnings (${rep.warnings.length}):`, ...rep.warnings.map((w) => `  - ${w}`));
  else if (ok) lines.push("No warnings.");
  return { ok, text: lines.join("\n"), warnings: rep.warnings };
}
function scriptLink(site2, text3, deflate) {
  if (deflate) {
    const z = deflate(new TextEncoder().encode(text3));
    let bin = "";
    for (const b of z) bin += String.fromCharCode(b);
    return `${site2}/#script=z:${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  }
  return `${site2}/#script=${encodeURIComponent(text3)}`;
}

// src/agent/mcp.ts
import http from "node:http";
import { randomBytes } from "node:crypto";
import { deflateRawSync } from "node:zlib";
var ORIGINS = [/^https:\/\/aykutkilic\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
var VERSION = "1.0.0";
async function runMcp(site2 = process.env.YESILCAM_SITE || SITE) {
  const code = Array.from(randomBytes(6), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  const log = (...a) => process.stderr.write(`[yesilcam] ${a.join(" ")}
`);
  let lastPoll = 0;
  let film = "";
  let seq = 0;
  const queue = [];
  const waiting = [];
  const pending = /* @__PURE__ */ new Map();
  const connected = () => Date.now() - lastPoll < 35e3;
  const cors = (req, res) => {
    const o = req.headers.origin ?? "";
    if (o && ORIGINS.some((rx) => rx.test(o))) {
      res.setHeader("Access-Control-Allow-Origin", o);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    return !o || ORIGINS.some((rx) => rx.test(o));
  };
  const send = (res, c) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(c));
  };
  const server = http.createServer((req, res) => {
    const okOrigin = cors(req, res);
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!okOrigin || url.searchParams.get("code") !== code) return void res.writeHead(403).end("pairing code or origin not accepted");
    lastPoll = Date.now();
    if (url.pathname === "/poll" && req.method === "GET") {
      film = url.searchParams.get("film") ?? film;
      const c = queue.shift();
      if (c) return send(res, c);
      waiting.push(res);
      const t = setTimeout(() => {
        const i = waiting.indexOf(res);
        if (i >= 0) waiting.splice(i, 1);
        res.writeHead(204).end();
      }, 2e4);
      res.on("close", () => clearTimeout(t));
      return;
    }
    if (url.pathname === "/result" && req.method === "POST") {
      let body = "";
      req.on("data", (d) => body += d);
      req.on("end", () => {
        try {
          const r = JSON.parse(body);
          pending.get(r.id)?.(r);
          pending.delete(r.id);
          res.writeHead(204).end();
        } catch {
          res.writeHead(400).end();
        }
      });
      return;
    }
    if (url.pathname === "/hello") return void res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ name: "yesilcam", version: VERSION }));
    res.writeHead(404).end();
  });
  let port = +(process.env.YESILCAM_PORT || 5198);
  for (let tries = 0; ; tries++) {
    const ok = await new Promise((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => resolve(true));
    });
    if (ok) break;
    if (tries > 10) throw new Error("no free port for the studio link");
    port++;
  }
  const pairLink = `${site2}/#agent=${port}:${code}`;
  log(`listening on 127.0.0.1:${port}; pair a studio tab with ${pairLink}`);
  const toStudio = (tool, args) => new Promise((resolve) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ content: [{ type: "text", text: `The studio did not answer ${tool} in time (is the tab still open?).` }], isError: true });
    }, 24e4);
    pending.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    const c = { id, tool, args };
    const w = waiting.shift();
    if (w) send(w, c);
    else queue.push(c);
  });
  const text3 = (t, isError = false) => ({ content: [{ type: "text", text: t }], isError });
  async function call2(name, args) {
    const def = toolByName(name);
    if (!def) return text3(`No tool "${name}".`, true);
    switch (name) {
      case "guide": {
        const page = catalogPage(String(args.topic ?? "get-started"), site2);
        return page ? text3(page) : text3("Topics: get-started, screenplay, sets, objects, characters, acting, camera, sound, mcp.", true);
      }
      case "check_screenplay": {
        const r = checkScreenplay(String(args.text ?? ""));
        return text3(r.text, !r.ok);
      }
      case "screenplay_link":
        return text3(scriptLink(site2, String(args.text ?? ""), (b) => deflateRawSync(b)));
      case "connect_studio":
        return text3(connected() ? `A studio tab is already connected${film ? ` ("${film}" is open)` : ""}.` : `Ask the user to open this link in the browser where they use the studio and click Connect:
${pairLink}
If the browser asks whether the site may access apps on this device, they should choose Allow. Then call studio_status.`);
      case "studio_status":
        return text3(connected() ? `Connected${film ? `: "${film}" is open in the studio` : ""}.` : `Not connected. Give the user this link to open: ${pairLink}`);
    }
    if (!connected()) return text3(`The studio is not connected. Ask the user to open ${pairLink} in their browser, then try again.`, true);
    return toStudio(name, args);
  }
  const out = (m) => process.stdout.write(JSON.stringify(m) + "\n");
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line9 = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line9) void handle2(line9);
    }
  });
  process.stdin.on("end", () => process.exit(0));
  async function handle2(line9) {
    let m;
    try {
      m = JSON.parse(line9);
    } catch {
      return out({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    }
    const reply = (result) => m.id !== void 0 && out({ jsonrpc: "2.0", id: m.id, result });
    try {
      switch (m.method) {
        case "initialize":
          return reply({
            protocolVersion: m.params?.protocolVersion ?? "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "yesilcam", version: VERSION },
            instructions: `Ye\u015Fil\xE7am Studio: make animated films in the user's browser studio. Read guide("get-started") and guide("screenplay") first. Write a screenplay, check_screenplay it, then connect_studio (give the user the link) and import_screenplay; review with contact_sheet.`
          });
        case "ping":
          return reply({});
        case "tools/list":
          return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
        case "tools/call":
          return reply(await call2(String(m.params?.name), m.params?.arguments ?? {}));
        default:
          if (m.id !== void 0) out({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `no method ${m.method}` } });
      }
    } catch (e) {
      if (m.id !== void 0) out({ jsonrpc: "2.0", id: m.id, result: text3(`Error: ${e.message}`, true) });
    }
  }
}

// src/agent/cli.ts
var site = process.env.YESILCAM_SITE || SITE;
var [cmd = "help", ...rest] = process.argv.slice(2);
var read = (f) => {
  if (!f || f === "-") return readFileSync(0, "utf8");
  return readFileSync(f, "utf8");
};
var HELP = `Ye\u015Fil\xE7am Studio for agents (${site}/)

  check <file|->      check a screenplay: what the studio will make of it, and every warning
  link <file|->       a link that opens the studio with the screenplay ready to import
  catalog <topic>     a reference page: get-started, screenplay, sets, objects, characters, acting, camera, sound, mcp
  mcp                 run the MCP server (for Claude Code, Codex, Cursor\u2026): ${NPX} mcp

Agents: start with ${site}/get-started.md`;
switch (cmd) {
  case "check": {
    const r = checkScreenplay(read(rest[0]));
    console.log(r.text);
    process.exitCode = !r.ok ? 2 : r.warnings.length ? 1 : 0;
    break;
  }
  case "link": {
    const text3 = read(rest[0]);
    const url = scriptLink(site, text3, (b) => deflateRawSync2(b));
    console.log(url);
    if (url.length > 3e4) console.error(`The link is ${url.length} characters long; some apps cut long links. If it fails, drop the file on the studio window instead.`);
    break;
  }
  case "catalog": {
    const page = catalogPage(rest[0] ?? "get-started", site);
    if (page) console.log(page);
    else {
      console.error("Topics: get-started, screenplay, sets, objects, characters, acting, camera, sound, mcp");
      process.exitCode = 1;
    }
    break;
  }
  case "mcp":
    await runMcp(site);
    break;
  default:
    console.log(HELP);
}
