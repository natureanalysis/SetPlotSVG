// 算法冒烟测试：验证分类计数与区域多边形生成
/* polygon-clipping 取自 vendor/ 下那份 —— 就是页面实际加载的文件，
   测的就是应用真正在用的实现，顺带保证「测的库 = 页面跑的库」，不必再依赖 node_modules 里的副本。 */
const pc = require("../vendor/polygon-clipping.min.js");

function maskKey(m) { let s = ""; for (let i = 0; i < 4; i++) s += (m & (1 << i)) ? "1" : "0"; return "C" + s; }
function vKeyToMask(k) { let m = 0; for (let i = 0; i < 4; i++) if (k.charAt(i + 1) === "1") m |= (1 << i); return m; }
function parseSet(body) { const s = new Set(); body.split(/\r?\n/).forEach(r => { const t = r.trim(); if (t.length) s.add(t); }); return s; }

const GEOMS = {
  1: [{ kind: "circle", x: 200, y: 200, r: 92 }],
  2: [{ kind: "circle", x: 140, y: 200, r: 92 }, { kind: "circle", x: 260, y: 200, r: 92 }],
  3: [{ kind: "circle", x: 140, y: 148, r: 92 }, { kind: "circle", x: 260, y: 148, r: 92 }, { kind: "circle", x: 200, y: 252, r: 92 }],
  4: [{ kind: "ellipse", x: 133, y: 215, rx: 90, ry: 141, rot: -45 }, { kind: "ellipse", x: 193, y: 180, rx: 90, ry: 141, rot: -45 }, { kind: "ellipse", x: 207, y: 180, rx: 90, ry: 141, rot: 45 }, { kind: "ellipse", x: 267, y: 215, rx: 90, ry: 141, rot: 45 }]
};

function shapeToPolygon(shape, pts = 360) {
  const ring = [];
  for (let i = 0; i < pts; i++) {
    const t = i / pts * 2 * Math.PI;
    let x, y;
    if (shape.kind === "circle") { x = shape.x + shape.r * Math.cos(t); y = shape.y + shape.r * Math.sin(t); }
    else {
      const ex = shape.rx * Math.cos(t), ey = shape.ry * Math.sin(t);
      const rad = shape.rot * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
      x = shape.x + ex * c - ey * s; y = shape.y + ex * s + ey * c;
    }
    ring.push([x, y]);
  }
  return [ring];
}

function regionPoly(maskInt, shapes) {
  const inPolys = [], outPolys = [];
  for (let i = 0; i < shapes.length; i++) {
    const p = shapeToPolygon(shapes[i]);
    if (maskInt & (1 << i)) inPolys.push(p); else outPolys.push(p);
  }
  if (!inPolys.length) return null;
  let cur = inPolys[0];
  for (let a = 1; a < inPolys.length; a++) {
    const r = pc.intersection([cur], [inPolys[a]]);
    if (!r || !r.length) return null;
    cur = r[0];
  }
  for (let b = 0; b < outPolys.length; b++) {
    const d = pc.difference([cur], [outPolys[b]]);
    if (!d || !d.length) return null;
    cur = d[0];
  }
  return cur;
}

function ringArea(ring) { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i]; const [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; }
function polyArea(poly) { return poly.reduce((s, r, i) => s + (i === 0 ? ringArea(r) : -ringArea(r)), 0); }

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log("PASS", name); } else { fail++; console.log("FAIL", name); } }

// ---- 1. 分类计数：Venny 官方示例 ----
const lists = [
  ["Marilyn Monroe", "Arnold Schwarzenegger", "Jack Nicholson", "Barbra Streisand", "Robert de Niro", "Dean Martin", "Harrison Ford"],
  ["Freddy Mercury", "Barbra Streisand", "Dean Martin", "Ricky Martin", "Celine Dion", "Marilyn Monroe"]
];
const sets = lists.map(a => new Set(a));
const classified = new Map();
for (let i = 0; i < sets.length; i++) sets[i].forEach(el => classified.set(el, (classified.get(el) || 0) | (1 << i)));
const counts = {};
classified.forEach((m) => { const k = maskKey(m); counts[k] = (counts[k] || 0) + 1; });
check("交集 C1100 = 3", counts["C1100"] === 3);
check("C1000 = 4 (7-3)", counts["C1000"] === 4);
check("C0100 = 3 (6-3)", counts["C0100"] === 3);
check("total unique = 10", classified.size === 10);

// ---- 2. 区域多边形：全部有效坐标质量 ----
const PXmask = {
  1: ["C1000"],
  2: ["C1000", "C0100", "C1100"],
  3: ["C1000", "C0100", "C0010", "C1100", "C1010", "C0110", "C1110"],
  4: ["C1000", "C0100", "C0010", "C0001", "C1100", "C1010", "C1001", "C0110", "C0101", "C0011", "C0111", "C1011", "C1101", "C1110", "C1111"]
};
for (const g in GEOMS) {
  const shapes = GEOMS[g];
  PXmask[g].forEach(k => {
    const p = regionPoly(vKeyToMask(k), shapes);
    check(`${g}组 ${k} 多边形存在`, !!p);
    if (p) { const a = polyArea(p); check(`${g}组 ${k} 面积>0 (${a.toFixed(1)})`, a > 0); }
  });
}

// ---- 3. 面积合理性：独占区 + 交集区 ≈ πr²（整圆） ----
const aOnly = polyArea(regionPoly(0b01, GEOMS[2]));   // C1000
const aBoth = polyArea(regionPoly(0b11, GEOMS[2]));   // C1100
const whole = aOnly + aBoth;
check(`2组 C1000+C1100 ≈ π*92² (${whole.toFixed(1)} vs ${(Math.PI*92*92).toFixed(1)})`,
  Math.abs(whole - Math.PI * 92 * 92) / (Math.PI * 92 * 92) < 0.01);

// ---- 4. 4组全部 15 区域面积总和 ≤ 4个椭圆面积和，大于0 ----
let sum = 0;
PXmask[4].forEach(k => { const p = regionPoly(parseInt(k.slice(1), 2), GEOMS[4]); if (p) sum += polyArea(p); });
const el4 = polyArea(shapeToPolygon(GEOMS[4][0]));
check(`4组15区面积和>0 (sum=${sum.toFixed(0)})`, sum > 0);
check(`4组总面积 < 4椭圆 (${(4*el4).toFixed(0)})`, sum < 4 * el4);

console.log(`\n== ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);