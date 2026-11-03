// SetPlotSVG UpSet 视图（5 个以上样本）回归测试（jsdom）
// 运行： node tests/venn-upset-test.js
const { loadVenn } = require("./helpers/setplot-dom.js");

let pass = 0, fail = 0;
const check = (n, c, extra) => { if (c) { pass++; console.log("PASS", n, extra || ""); } else { fail++; console.log("FAIL", n, extra || ""); } };

(async () => {
  const window = await loadVenn();
  const d = window.document;
  const svg = d.getElementById("vennSvg");
  const setList = (i, t) => {
    const a = d.getElementById("area" + i);
    a.value = t;
    a.dispatchEvent(new window.Event("input", { bubbles: true }));
  };

  // 构造 5 组数据：31 个非空交集都有元素；全共有 5 个，其余各 2 个
  const sets = Array.from({ length: 5 }, () => []);
  for (let m = 1; m < 32; m++) {
    const n = m === 31 ? 5 : 2;
    for (let j = 0; j < n; j++) {
      const name = "e" + m + "_" + j;
      for (let b = 0; b < 5; b++) if (m & (1 << b)) sets[b].push(name);
    }
  }
  sets.forEach((arr, i) => setList(i, arr.join("\n")));

  /* ---------- 1) 默认 UpSet 布局 ---------- */
  const vb0 = svg.getAttribute("viewBox").split(/\s+/).map(Number);
  check("5 组默认 UpSet（高≥500，宽度动态）", vb0[3] >= 500 && vb0[2] >= 700, svg.getAttribute("viewBox"));
  check("5 组以上取消花瓣视图（无 viewSwitch / selView）", !d.getElementById("viewSwitch") && !d.getElementById("selView"));
  check("交集/主题控件可见", d.getElementById("upsetLimitWrap").hidden === false && d.getElementById("upsetThemeWrap").hidden === false);
  check("默认只显示前 30 个交集", svg.querySelectorAll(".upset-bar").length === 30 &&
    /仅显示前 30|Showing top 30/.test(svg.textContent), String(svg.querySelectorAll(".upset-bar").length));
  check("轴标题/刻度/顶部提示也可拖动", !!svg.querySelector('[data-grab="label:yaxis"]') &&
    !!svg.querySelector('[data-grab="label:setaxis"]') &&
    !!svg.querySelector('[data-grab="label:topnote"]') &&
    !!svg.querySelector('[data-grab^="num:ytick:"]') &&
    !!svg.querySelector('[data-grab^="num:settick:"]'));
  const lim = d.getElementById("selUpsetLimit");
  lim.value = "all"; lim.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("切换全部后 31 个非空交集各一根柱子", svg.querySelectorAll(".upset-bar").length === 31,
    String(svg.querySelectorAll(".upset-bar").length));
  check("按元素数降序：第一根是全共有（5 个元素）",
    svg.querySelector(".upset-bar").getAttribute("data-mask") === "C111110",
    svg.querySelector(".upset-bar").getAttribute("data-mask"));
  const barFills = Array.from(svg.querySelectorAll(".upset-bar")).map(n => n.getAttribute("fill"));
  check("前 6 个交集使用强调色、其余淡化",
    barFills.slice(0, 6).every(f => f === "#1F4E79") && barFills.slice(6).every(f => f === "#B6C1CE"),
    barFills.slice(0, 8).join(","));
  check("点阵包含 5 个集合行", svg.querySelectorAll("#interact .upset-hit").length === 31);
  check("点阵有交替行底色 + 每列竖向参考带", !!svg.querySelector("#upset-grid") &&
    svg.querySelectorAll("#upset-grid rect").length >= 30,
    "rect=" + svg.querySelectorAll("#upset-grid rect").length);
  check("点阵空单元格显示空心圆点", svg.querySelectorAll(".upset-dot-on").length === 80 &&
    svg.querySelectorAll(".upset-dot-empty").length === 75,
    "on=" + svg.querySelectorAll(".upset-dot-on").length + " empty=" + svg.querySelectorAll(".upset-dot-empty").length);
  const vals = Array.from(svg.querySelectorAll("text.upset-value"));
  check("柱顶数值水平显示（不再旋转 90°）", vals.length === 31 && vals.every(n => !n.getAttribute("transform")),
    String(vals.length));
  check("样本名和柱顶数字可拖动", (function () {
    var lab = svg.querySelector(".upset-sample-label");
    var val = svg.querySelector("text.upset-value");
    return !!lab && lab.getAttribute("data-grab") === "label:0" && !!val && /^num:/.test(val.getAttribute("data-grab") || "");
  })());
  check("UpSet 徽标显示", /UpSet/.test(d.getElementById("fitDev").textContent), d.getElementById("fitDev").textContent);
  check("UpSet 提示文案", /UpSet/.test(d.getElementById("hint").textContent), d.getElementById("hint").textContent.slice(0, 40));

  /* ---------- 主题预设 / 自定义颜色 / 字体 ---------- */
  const themeSel = d.getElementById("selUpsetTheme");
  themeSel.value = "graphpad"; themeSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  const gpFills = Array.from(svg.querySelectorAll(".upset-bar")).map(n => n.getAttribute("fill"));
  check("GraphPad 主题：黑/灰柱 + 灰色 Set size",
    gpFills.slice(0, 6).every(f => f === "#333333") && gpFills.slice(6).every(f => f === "#CFCFCF") &&
    svg.querySelectorAll('rect[fill="#8C8C8C"]').length === 5,
    gpFills.slice(0, 8).join(","));
  themeSel.value = "minimal"; themeSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  const minFills = Array.from(svg.querySelectorAll(".upset-bar")).map(n => n.getAttribute("fill"));
  check("极简主题：统一蓝柱、浅色 Set size、隐藏柱顶数值",
    minFills.every(f => f === "#4C78A8") &&
    svg.querySelectorAll('rect[fill="#D6E4F0"]').length === 5 &&
    svg.querySelectorAll("text.upset-value").length === 0,
    minFills.slice(0, 5).join(","));
  themeSel.value = "nature"; themeSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("切回 Nature 后柱顶数值恢复", svg.querySelectorAll("text.upset-value").length === 31);

  const mainColor = d.getElementById("upsetMain");
  mainColor.value = "#ff0000"; mainColor.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("自定义 UpSet 主色生效", svg.querySelector(".upset-bar").getAttribute("fill") === "#ff0000",
    svg.querySelector(".upset-bar").getAttribute("fill"));
  var txtColor = d.getElementById("upsetText");
  txtColor.value = "#ff00ff"; txtColor.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("自定义 UpSet 文字颜色生效", svg.querySelector(".upset-sample-label").getAttribute("fill") === "#ff00ff",
    svg.querySelector(".upset-sample-label").getAttribute("fill"));
  var lineColor = d.getElementById("upsetLine");
  lineColor.value = "#00ff00"; lineColor.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("自定义 UpSet 线条/点颜色生效", !!svg.querySelector('line[stroke="#00ff00"]'),
    (svg.querySelector('line[stroke="#00ff00"]') || {}).outerHTML || "missing");
  themeSel.value = "nature"; themeSel.dispatchEvent(new window.Event("change", { bubbles: true }));

  const fam = d.getElementById("selFamily");
  fam.value = "serif"; fam.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("UpSet 使用自定义字体", svg.innerHTML.indexOf('font-family="serif"') >= 0);
  fam.value = "sans-serif"; fam.dispatchEvent(new window.Event("change", { bubbles: true }));

  /* ---------- Venn 同一套文字/描边控件也作用于 UpSet ---------- */
  const lc = d.getElementById("labelColor");
  lc.value = "#123456"; lc.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("Venn 文字颜色控件作用于 UpSet", svg.querySelector(".upset-sample-label").getAttribute("fill") === "#123456",
    svg.querySelector(".upset-sample-label").getAttribute("fill"));
  const sc = d.getElementById("strokeColor");
  sc.value = "#654321"; sc.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("Venn 描边控件作用于 UpSet 线条和点", !!svg.querySelector('line[stroke="#654321"]') &&
    d.getElementById("upsetLine").value === "#654321");
  d.getElementById("labelColorAuto").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  themeSel.value = "nature"; themeSel.dispatchEvent(new window.Event("change", { bubbles: true }));

  /* ---------- 1b) 纵坐标轴 ---------- */
  check("纵坐标轴标题（旋转 -90°）", svg.innerHTML.indexOf("rotate(-90") > 0);
  const tickTexts = Array.from(svg.querySelectorAll("text")).map(t => t.textContent.trim());
  check("纵坐标整数刻度 0/2/4/6", ["0", "2", "4", "6"].every(v => tickTexts.includes(v)), tickTexts.join(","));
  check("无背景网格线（无虚线网格）", svg.innerHTML.indexOf("stroke-dasharray") < 0);
  check("纵轴使用左/下轴线", svg.innerHTML.indexOf('stroke-width="1.5"') >= 0 && svg.innerHTML.indexOf('stroke="#222"') >= 0);

  /* ---------- 1c) 长组名完整显示 ---------- */
  const longName = "肿瘤坏死因子相关凋亡诱导配体基因家族成员A";
  const name0 = d.getElementById("name0");
  name0.value = longName;
  name0.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("长组名在 UpSet 中完整显示（不截断）", svg.textContent.indexOf(longName) >= 0,
    svg.textContent.replace(/\s+/g, " ").slice(0, 120));
  const vbLong = svg.getAttribute("viewBox").split(/\s+/).map(Number);
  check("长组名使左栏/画布加宽", vbLong[2] > vb0[2], vb0[2] + " → " + vbLong[2]);
  name0.value = "List 1";
  name0.dispatchEvent(new window.Event("input", { bubbles: true }));

  /* ---------- 2) 点击柱子 / 查找高亮 ---------- */
  svg.querySelector('.upset-bar[data-mask="C111110"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("点击柱子列出交集元素", /5 个元素/.test(d.getElementById("names").value) && /e31_/.test(d.getElementById("names").value),
    d.getElementById("names").value.split("\n")[0]);
  const fe = d.getElementById("findEl");
  fe.value = "e1_0"; fe.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 260));
  check("查找命中 UpSet 柱子高亮", svg.querySelector('.upset-bar[data-mask="C100000"]').classList.contains("found"));
  check("查找结果仍写入 Results", /1 个元素/.test(d.getElementById("names").value), d.getElementById("names").value.split("\n")[0]);
  d.getElementById("btnFindClear").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  /* ---------- 3) 导出 ---------- */
  let exported = null;
  const OrigSer = window.XMLSerializer;
  window.XMLSerializer = class extends OrigSer {
    serializeToString(n) { const s = super.serializeToString(n); exported = s; return s; }
  };
  d.getElementById("btnExportSvg").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.XMLSerializer = OrigSer;
  check("UpSet 导出成功", !!exported && exported.indexOf("<svg") >= 0);
  check("UpSet 导出的 viewBox 高度 ≥500", /viewBox="0 0 [\d.]+ [\d.]+"/.test(exported || "") && (function () {
    var m = (exported || "").match(/viewBox="0 0 [\d.]+ ([\d.]+)"/);
    return !!m && parseFloat(m[1]) >= 500;
  })(), (exported || "").slice(0, 160));
  const expVb = (exported || "").match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const expH = expVb ? Math.round(1024 * parseFloat(expVb[2]) / parseFloat(expVb[1])) : 0;
  check("UpSet 导出按画布宽高比输出（宽 1024，高 " + expH + "）",
    /width="1024"/.test(exported || "") && new RegExp('height="' + expH + '"').test(exported || ""));
  check("UpSet 导出保留可见柱子", (exported.match(/class="upset-bar"/g) || []).length === 31);
  check("UpSet 导出剔除透明命中层", exported.indexOf('id="interact"') < 0);
  check("UpSet 导出剔除查找高亮类", exported.indexOf("found") < 0);
  check("UpSet 导出剔除拖拽属性", exported.indexOf("data-grab") < 0 && exported.indexOf("data-rot") < 0);

  /* ---------- 4) 6 组 63 个交集：固定列宽 + 水平数值 ---------- */
  const sets6 = Array.from({ length: 6 }, () => []);
  for (let m = 1; m < 64; m++) {
    const name = "u" + m;
    for (let b = 0; b < 6; b++) if (m & (1 << b)) sets6[b].push(name);
  }
  sets6.forEach((arr, i) => setList(i, arr.join("\n")));
  lim.value = "all"; lim.dispatchEvent(new window.Event("change", { bubbles: true }));
  const vb6 = svg.getAttribute("viewBox").split(/\s+/).map(Number);
  check("6 组 63 个交集各一根柱子", svg.querySelectorAll(".upset-bar").length === 63,
    String(svg.querySelectorAll(".upset-bar").length));
  check("63 列时画布按 18px 列距加宽", vb6[2] >= 1200 && svg.style.width === vb6[2] + "px" && svg.style.maxWidth === "none",
    svg.getAttribute("viewBox") + " style=" + svg.style.width + " max=" + svg.style.maxWidth);
  check("63 列柱顶数值水平显示", svg.querySelectorAll("text.upset-value").length === 63,
    String(svg.querySelectorAll("text.upset-value").length));

  /* ---------- 5) 4 组以下回到韦恩图 ---------- */
  setList(4, ""); setList(5, "");
  check("4 组隐藏交集/主题控件", d.getElementById("upsetLimitWrap").hidden === true && d.getElementById("upsetThemeWrap").hidden === true);
  check("4 组 viewBox 仍为 400", svg.getAttribute("viewBox") === "0 0 400 400");

  window.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });