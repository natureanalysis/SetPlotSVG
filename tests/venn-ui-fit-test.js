// SetPlotSVG 新版 UI / 自适应 / 导出 回归测试（jsdom，无浏览器依赖）
// 运行： node tests/venn-ui-fit-test.js
const { loadVenn } = require("./helpers/setplot-dom.js");

let pass = 0, fail = 0;
const check = (n, c, extra) => { if (c) { pass++; console.log("PASS", n, extra || ""); } else { fail++; console.log("FAIL", n, extra || ""); } };

const heavy = (n, p) => Array.from({ length: n }, (_, k) => p + (k + 1)).join("\n");

// —— 几何工具：把 path 的 d 按 M 切环，再算锚点到边界的最近距离（≈ 内切半径）——
const segDist = (px, py, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
};
const ringsOf = (svg, dm) => svg.querySelector('path[data-mask="' + dm + '"]').getAttribute("d")
  .split(/(?=[Mm])/).filter(s => s.trim()).map(seg => {
    const n = seg.match(/-?\d+(\.\d+)?/g).map(Number);
    const pts = [];
    for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    return pts;
  });
const clearance = (rings, x, y) => rings.reduce((m, r) =>
  Math.min(m, r.reduce((mm, a, i) => Math.min(mm, segDist(x, y, a, r[(i + 1) % r.length])), Infinity)), Infinity);
const textW = (s, fs) => Array.from(s).reduce((a, c) => a + (/[\u2E80-\u9FFF]/.test(c) ? 1 : 0.6) * fs, 0);

(async () => {
  // 页面装载交给共享 helper（剥掉 /auth.js 等根绝对路径脚本，见 helpers/venn-dom.js 顶部说明）
  const window = await loadVenn();
  const d = window.document;
  const svg = d.getElementById("vennSvg");
  const setList = (i, t) => { const a = d.getElementById("area" + i); a.value = t; a.dispatchEvent(new window.Event("input", { bubbles: true })); };
  const numSize = v => { const b = d.getElementById("numSizeBox"); b.value = String(v); b.dispatchEvent(new window.Event("input", { bubbles: true })); };
  const fit = v => { const c = d.getElementById("chkFit"); c.checked = v; c.dispatchEvent(new window.Event("change", { bubbles: true })); };

  // 每个数字相对「所在区域 + 锚点内切半径」是否越界
  const overflow = () => {
    const bad = [];
    svg.querySelectorAll("text.val-text").forEach(t => {
      const rings = ringsOf(svg, t.getAttribute("data-mask"));
      const tsp = t.querySelectorAll("tspan");
      const f1 = parseFloat(tsp[0] ? tsp[0].getAttribute("font-size") : t.getAttribute("font-size"));
      const f2 = tsp[1] ? parseFloat(tsp[1].getAttribute("font-size")) : 0;
      const needW = Math.max(tsp.length > 1 ? textW(tsp[0].textContent, f1) : textW(t.textContent, f1), tsp[1] ? textW(tsp[1].textContent, f2) : 0);
      const needH = tsp[1] ? f1 * 0.92 + f2 * 1.18 : f1 * 1.06;
      const cl = clearance(rings, parseFloat(t.getAttribute("x")), parseFloat(t.getAttribute("y")));
      if (Math.max(needW / 2, needH / 2) > cl + 0.6) bad.push(t.getAttribute("data-mask"));
    });
    return bad;
  };

  /* ---------- 1) 布局 / 文案结构 ---------- */
  const aside = d.querySelector("aside.inputs");
  const results = d.querySelector(".results-card");
  check("Results 在左栏输入区内", aside.contains(results));
  check("列表卡片为 2×2 网格容器", !!d.getElementById("listCards") && d.getElementById("listCards").className.indexOf("list-cards") >= 0);
  check("顶部不再有教程条", !d.querySelector("main > .intro"));
  check("教程位于页面下方", !!d.querySelector("main .tutorial .tut-steps"));
  check("语言为按钮组（无下拉框）", !!d.getElementById("langZh") && !!d.getElementById("langEn") && !d.getElementById("lang"));
  check("默认简体（与主站根语言一致）", d.documentElement.getAttribute("lang") === "zh-CN" && d.getElementById("langZh").classList.contains("active"));
  check("简体下的 Results 标题", d.querySelector('[data-i18n="results"]').textContent.trim() === "Results 结果");
  d.getElementById("langEn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("切英文生效", d.documentElement.getAttribute("lang") === "en" && d.querySelector('[data-i18n="results"]').textContent.trim() === "Results");
  d.getElementById("langZh").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("切回简体生效", d.documentElement.getAttribute("lang") === "zh-CN" && d.querySelector('[data-i18n="results"]').textContent.trim() === "Results 结果");
  check("字号控件分离（名称/数字各一）", !!d.getElementById("labelSizeBox") && !!d.getElementById("numSizeBox") && !d.getElementById("sizeBox"));

  /* ---------- 2) 导出产物：必须剔除透明交互层（否则导出图会变成黑团） ---------- */
  check("页面内保留交互命中层", !!svg.querySelector("#interact .region-hit"));
  let exported = null;
  const OrigSerializer = window.XMLSerializer;
  window.XMLSerializer = class extends OrigSerializer {
    serializeToString(node) { const s = super.serializeToString(node); exported = s; return s; }
  };
  // createObjectURL 的桩在 helpers/venn-dom.js 里已给到位，这里正常点即可（原先靠 try/catch 吞异常）
  d.getElementById("btnExportSvg").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.XMLSerializer = OrigSerializer;
  check("导出串已生成", !!exported && exported.indexOf("<svg") >= 0);
  check("导出串剔除了交互层", !!exported && exported.indexOf('id="interact"') < 0);
  check("导出串保留描边与区域数字", !!exported && exported.indexOf('id="strokes"') > 0 && exported.indexOf("val-text") > 0);

  /* ---------- 3) 字号分离 ---------- */
  setList(0, heavy(400, "a"));
  setList(1, heavy(300, "a") + "\n" + heavy(100, "b"));
  const lb = d.getElementById("labelSizeBox");
  lb.value = "34"; lb.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("名称字号可独立调到 34", svg.querySelector("text.label").getAttribute("font-size") === "34");
  const numFs = parseFloat(svg.querySelector("text.val-text tspan").getAttribute("font-size"));
  check("数字字号不受名称字号影响", numFs <= 16, String(numFs));

  /* ---------- 4) 自适应：2/3/4 组都不越界 ---------- */
  fit(true);
  setList(2, ""); setList(3, "");
  check("2 组：默认不越界", overflow().length === 0, overflow().join(","));
  numSize(30);
  check("2 组：字号 30 不越界", overflow().length === 0, overflow().join(","));

  setList(2, heavy(200, "a") + "\n" + heavy(300, "c"));
  numSize(16);
  check("3 组：默认不越界", overflow().length === 0, overflow().join(","));
  numSize(28);
  check("3 组：字号 28 不越界", overflow().length === 0, overflow().join(","));

  setList(0, heavy(1500, "a")); setList(1, heavy(1200, "a"));
  setList(2, heavy(300, "a") + "\n" + heavy(1200, "x"));
  setList(3, heavy(300, "a") + "\n" + heavy(1200, "y"));
  numSize(16);
  check("4 组 15 区域：默认不越界", overflow().length === 0, overflow().join(","));
  numSize(40);
  check("4 组：字号 40 仍不越界", overflow().length === 0, overflow().join(","));

  /* ---------- 5) 反例：关闭自适应必须复现越界（否则上面的断言没在测东西） ---------- */
  numSize(22); fit(false);
  const bad = overflow();
  check("反例成立：关闭自适应时确实有数字越界", bad.length > 0, bad.join(","));
  fit(true);
  check("重新开启后恢复不越界", overflow().length === 0, overflow().join(","));

  /* ---------- 6) 自适应只收缩、不放大 ---------- */
  const baseSize = parseFloat(d.getElementById("numSizeBox").value);
  const fonts = Array.from(svg.querySelectorAll("text.val-text")).map(t => {
    const s = t.querySelector("tspan");
    return parseFloat(s ? s.getAttribute("font-size") : t.getAttribute("font-size"));
  });
  check("自适应只收缩不放大（≤ 用户字号）", fonts.every(f => f <= baseSize + 0.01), `max=${Math.max(...fonts)} base=${baseSize}`);
  check("自适应确实发生了收缩（存在更小字号）", Math.min(...fonts) < baseSize, `min=${Math.min(...fonts)}`);

  window.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
