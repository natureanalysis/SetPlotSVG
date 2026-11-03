// SetPlotSVG 5–6 组支持回归测试（UpSet 专用，花瓣视图已取消）
// 运行： node tests/venn-sixsets-test.js
const { loadVenn } = require("./helpers/setplot-dom.js");

let pass = 0, fail = 0;
const check = (n, c, extra) => { if (c) { pass++; console.log("PASS", n, extra || ""); } else { fail++; console.log("FAIL", n, extra || ""); } };

const uniq = p => Array.from({ length: 10 }, (_, k) => p + (k + 1)).join("\n");

(async () => {
  const window = await loadVenn();
  const d = window.document;
  const svg = d.getElementById("vennSvg");
  const setList = (i, t) => {
    const a = d.getElementById("area" + i);
    a.value = t;
    a.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const clickBar = k => {
    const bar = svg.querySelector('.upset-bar[data-mask="' + k + '"]') || svg.querySelector('.upset-hit[data-mask="' + k + '"]');
    if (bar) bar.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    return !!bar;
  };

  /* ---------- 1) 输入区提供 6 个列表 ---------- */
  check("输入区有 6 个列表卡片", d.querySelectorAll("#listCards .list-card").length === 6);
  check("第 6 个列表输入框存在", !!d.getElementById("area5") && !!d.getElementById("name5"));
  check("填充色控件覆盖 6 组", ["fill0", "fill1", "fill2", "fill3", "fill4", "fill5"].every(id => !!d.getElementById(id)));
  check("统计条配色覆盖 6 组（第 6 张卡有强调色）", /^#/.test(d.querySelector("#listCards .list-card:last-child").style.getPropertyValue("--c")));

  /* ---------- 2) 6 组数据：UpSet，无花瓣视图 ---------- */
  for (let i = 0; i < 6; i++) setList(i, uniq("abcdef"[i]) + "\nshared1\nshared2");
  check("5 组以上没有花瓣视图切换控件", !d.getElementById("viewSwitch") && !d.getElementById("selView"));
  check("6 组绘制 UpSet（高≥500、宽动态）", (function () {
    var v = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    return v[3] >= 500 && v[2] >= 400;
  })(), svg.getAttribute("viewBox"));
  check("6 组显示 7 个非空交集", svg.querySelectorAll(".upset-bar").length === 7,
    String(svg.querySelectorAll(".upset-bar").length));
  check("6 组绘制 6 个样本标签", svg.querySelectorAll("text.upset-sample-label").length === 6);
  check("6 组不再绘制花瓣椭圆", svg.querySelectorAll("#shapes ellipse").length === 0);
  check("6 组区域使用 6 位成员键", svg.querySelector(".upset-bar").getAttribute("data-mask").length === 7,
    svg.querySelector(".upset-bar").getAttribute("data-mask"));
  check("6 组提示 UpSet", /UpSet/.test(d.getElementById("hint").textContent));
  check("6 组徽标说明 UpSet", /UpSet/.test(d.getElementById("fitDev").textContent));

  /* ---------- 3) 点击交集柱查看元素 ---------- */
  check("全共有交集可点击", clickBar("C111111"));
  check("全共有交集列出 2 个元素", /2 个元素/.test(d.getElementById("names").value) && /shared1/.test(d.getElementById("names").value),
    d.getElementById("names").value.split("\n")[0]);
  check("第 1 组独有交集可点击", clickBar("C100000"));
  check("第 1 组独有交集列出 10 个元素", /10 个元素/.test(d.getElementById("names").value) && /a1/.test(d.getElementById("names").value),
    d.getElementById("names").value.split("\n")[0]);

  /* ---------- 4) 面积正比在 5 组以上不生效 ---------- */
  const cw = d.getElementById("chkWeight");
  cw.checked = true; cw.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("6 组勾选面积正比后仍是 UpSet", svg.querySelectorAll(".upset-bar").length === 7 && svg.querySelectorAll("#shapes ellipse").length === 0);
  check("6 组面积正比下徽标仍是 UpSet", /UpSet/.test(d.getElementById("fitDev").textContent));
  cw.checked = false; cw.dispatchEvent(new window.Event("change", { bubbles: true }));

  /* ---------- 5) 导出：6 组同样可用 ---------- */
  let exported = null;
  const OrigSer = window.XMLSerializer;
  window.XMLSerializer = class extends OrigSer {
    serializeToString(n) { const s = super.serializeToString(n); exported = s; return s; }
  };
  d.getElementById("btnExportSvg").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.XMLSerializer = OrigSer;
  check("6 组导出 SVG 成功", !!exported && exported.indexOf("<svg") >= 0);
  check("6 组导出含 6 个样本标签", (exported.match(/class="label upset-sample-label"/g) || []).length === 6);
  check("6 组导出不含交互层", exported.indexOf('id="interact"') < 0);

  /* ---------- 6) 5 组：始终 UpSet ---------- */
  setList(5, "");
  check("5 组仍为 UpSet", svg.querySelectorAll(".upset-bar").length === 6 && svg.querySelectorAll("#shapes ellipse").length === 0,
    String(svg.querySelectorAll(".upset-bar").length));
  check("5 组样本标签只有 5 个", svg.querySelectorAll("text.upset-sample-label").length === 5);
  check("5 组全共有交集使用 6 位键", !!svg.querySelector('.upset-bar[data-mask="C111110"]'),
    Array.from(svg.querySelectorAll(".upset-bar")).slice(0, 3).map(n => n.getAttribute("data-mask")).join(","));

  /* ---------- 6b) 中间交集（4 组共有）也完整画在 UpSet 上 ---------- */
  setList(0, uniq("a") + "\ncommon5");
  for (let i = 1; i <= 4; i++) setList(i, uniq("bcde"[i - 1]) + "\nx\ncommon5");
  check("5 组：4 组共有交集有柱子", !!svg.querySelector('.upset-bar[data-mask="C011110"]'));
  check("5 组：全共有交集有柱子", !!svg.querySelector('.upset-bar[data-mask="C111110"]'));
  check("5 组：点击 4 组共有交集", clickBar("C011110"));
  check("5 组：4 组共有交集列出元素", /共有/.test(d.getElementById("names").value) && /x/.test(d.getElementById("names").value),
    d.getElementById("names").value.split("\n")[0]);
  check("5 组：百分比开关自动置灰", d.getElementById("chkPerc").disabled === true);

  /* ---------- 7) 分享链接：6 组载荷往返（始终 UpSet） ---------- */
  const payload = {
    l: Array.from({ length: 6 }, (_, i) => ["Set " + (i + 1), "x" + i + "\ncommon"]),
    ap: 0,
    s: { m: "custom", fl: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"] }
  };
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const win2 = await loadVenn({ hash: "#v=" + b64 });
  const d2 = win2.document;
  const svg2 = d2.getElementById("vennSvg");
  check("分享：6 个列表全部恢复", [0, 1, 2, 3, 4, 5].every(i => d2.getElementById("name" + i).value === "Set " + (i + 1)
    && d2.getElementById("area" + i).value === "x" + i + "\ncommon"));
  check("分享：恢复 UpSet 视图", (function () {
    var v = svg2.getAttribute("viewBox").split(/\s+/).map(Number);
    return v[3] >= 500 && v[2] >= 400;
  })() && svg2.querySelectorAll(".upset-bar").length > 0,
    svg2.getAttribute("viewBox") + " bars=" + svg2.querySelectorAll(".upset-bar").length);
  check("分享：无花瓣视图控件", !d2.getElementById("selView") && !d2.getElementById("viewSwitch"));
  check("分享：第 6 组自定义填充色恢复", d2.getElementById("fill5").value === "#666666", d2.getElementById("fill5").value);
  win2.close();

  window.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });