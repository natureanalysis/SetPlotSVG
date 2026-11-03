// SetPlotSVG 任意样本数（无上限）/ 添加删除样本 / CSV 多列 回归测试
const { loadVenn } = require("./helpers/setplot-dom.js");

let pass = 0, fail = 0;
const check = (n, c, extra) => { if (c) { pass++; console.log("PASS", n, extra || ""); } else { fail++; console.log("FAIL", n, extra || ""); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const window = await loadVenn();
  const d = window.document;
  const svg = d.getElementById("vennSvg");
  const setList = (i, name, body) => {
    const n = d.getElementById("name" + i), a = d.getElementById("area" + i);
    n.value = name; n.dispatchEvent(new window.Event("input", { bubbles: true }));
    a.value = body; a.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const setGroup = (i, group) => {
    const g = d.getElementById("group" + i);
    g.value = group; g.dispatchEvent(new window.Event("input", { bubbles: true }));
  };

  /* ---------- 1) 添加样本到 19 个（无上限） ---------- */
  check("初始 6 张卡片", d.querySelectorAll("#listCards .list-card").length === 6);
  check("存在添加样本按钮", !!d.getElementById("btnAddSample"));
  for (let k = 0; k < 13; k++) d.getElementById("btnAddSample").click();
  check("可添加到 19 张卡片", d.querySelectorAll("#listCards .list-card").length === 19,
    String(d.querySelectorAll("#listCards .list-card").length));

  for (let i = 0; i < 19; i++) {
    setList(i, "Sample " + (i + 1), "u" + i + "a\nu" + i + "b\nu" + i + "c\ncommon");
    setGroup(i, i % 2 ? "Control" : "Case");
  }
  check("19 个样本进入 UpSet", (function () {
    var v = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    return v[3] > 500;
  })(), svg.getAttribute("viewBox"));
  check("19 个样本显示在点阵/集合行中", svg.textContent.indexOf("Sample 19") >= 0);
  check("19 个样本的键不再受 6/32 位限制", svg.querySelector(".upset-bar").getAttribute("data-mask").length === 20,
    (svg.querySelector(".upset-bar").getAttribute("data-mask") || "").length + " chars");
  check("19 独有 + 1 共有 = 20 根柱子", svg.querySelectorAll(".upset-bar").length === 20,
    String(svg.querySelectorAll(".upset-bar").length));
  check("柱顶数值水平显示", svg.querySelectorAll("text.upset-value").length === 20,
    String(svg.querySelectorAll("text.upset-value").length));
  check("19 个实验分组色块", svg.querySelectorAll('rect[width="14"][height="14"]').length === 19,
    String(svg.querySelectorAll('rect[width="14"][height="14"]').length));
  var setBars = Array.from(svg.querySelectorAll('rect[fill="#5B9BD5"]'));
  var barRights = setBars.map(function (r) { return +(parseFloat(r.getAttribute("x")) + parseFloat(r.getAttribute("width"))).toFixed(1); });
  check("Set size 条右端对齐到 0 点（0 在右）", setBars.length === 19 && barRights.every(function (x) { return Math.abs(x - barRights[0]) < 0.2; }),
    barRights.slice(0, 3).join(","));
  var name19 = Array.from(svg.querySelectorAll("text")).find(function (n) { return n.textContent === "Sample 19"; });
  check("样本名位于 0 点右侧", !!name19 && parseFloat(name19.getAttribute("x")) > barRights[0],
    name19 ? name19.getAttribute("x") + " > " + barRights[0] : "missing");
  check("点阵含激活黑点与空圆点", svg.querySelectorAll(".upset-dot-on").length === 38 &&
    svg.querySelectorAll(".upset-dot-empty").length === 380 - 38,
    "on=" + svg.querySelectorAll(".upset-dot-on").length + " empty=" + svg.querySelectorAll(".upset-dot-empty").length);
  check("Set size 轴仍存在", Array.from(svg.querySelectorAll("text")).some(t => t.textContent.trim() === "集合大小"));
  check("5 组以上没有花瓣视图控件", !d.getElementById("selView") && !d.getElementById("viewSwitch"));
  check("超过 6 个样本仍可点击交集", !!svg.querySelector(".upset-bar"));

  /* ---------- 2) 删除样本 ---------- */
  window.confirm = function () { return true; };
  var cards = d.querySelectorAll("#listCards .list-card");
  cards[cards.length - 1].querySelector("[data-remove]").click();
  check("删除样本后剩 18 张卡片", d.querySelectorAll("#listCards .list-card").length === 18,
    String(d.querySelectorAll("#listCards .list-card").length));
  check("删除后 UpSet 柱子同步减少", svg.querySelectorAll(".upset-bar").length === 19,
    String(svg.querySelectorAll(".upset-bar").length));
  window.close();

  /* ---------- 3) 分享链接 8 个样本 ---------- */
  const lists8 = Array.from({ length: 8 }, (_, i) => ["S" + i, "x" + i + "\nshared", "G" + (i % 2), "#009E73"]);
  const b64 = Buffer.from(JSON.stringify({ l: lists8, v: "upset", ap: 0, s: { m: "custom" } }), "utf8").toString("base64");
  const win2 = await loadVenn({ hash: "#v=" + b64 });
  const d2 = win2.document, svg2 = d2.getElementById("vennSvg");
  check("分享链接恢复 8 张卡片", d2.querySelectorAll("#listCards .list-card").length === 8,
    String(d2.querySelectorAll("#listCards .list-card").length));
  check("分享链接恢复 8 个样本的 UpSet", (function () {
    var v = svg2.getAttribute("viewBox").split(/\s+/).map(Number);
    return v[3] > 500 && svg2.textContent.indexOf("S7") >= 0;
  })(), svg2.getAttribute("viewBox"));
  check("分享链接恢复 8 个分组色块", svg2.querySelectorAll('rect[width="14"][height="14"]').length === 8);
  win2.close();

  /* ---------- 4) CSV 多列导入自动增加样本 ---------- */
  const win3 = await loadVenn();
  const d3 = win3.document;
  const csv = ["A,B,C,D,E,F,G,H,I,J"].concat(
    Array.from({ length: 5 }, (_, r) => Array.from({ length: 10 }, (_, c) => "e" + r + "_" + c).join(","))
  ).join("\n");
  const fi = d3.getElementById("fileInput");
  const file = new win3.File([csv], "samples.csv", { type: "text/csv" });
  Object.defineProperty(fi, "files", { value: [file], configurable: true });
  fi.dispatchEvent(new win3.Event("change", { bubbles: true }));
  await sleep(120);
  check("CSV 10 列自动创建 10 张卡片", d3.querySelectorAll("#listCards .list-card").length === 10,
    String(d3.querySelectorAll("#listCards .list-card").length));
  check("CSV 表头成为样本名", d3.getElementById("name0").value === "A" && d3.getElementById("name9").value === "J",
    d3.getElementById("name0").value + " / " + d3.getElementById("name9").value);
  check("CSV 导入后 UpSet 正常", d3.getElementById("vennSvg").querySelectorAll(".upset-bar").length > 0);
  win3.close();

  /* ---------- 5) 40 个样本：验证不受 31/32 位掩码上限影响 ---------- */
  const win4 = await loadVenn();
  const d4 = win4.document, svg4 = d4.getElementById("vennSvg");
  for (let k = 0; k < 34; k++) d4.getElementById("btnAddSample").click();
  for (let i = 0; i < 40; i++) {
    const n = d4.getElementById("name" + i), a = d4.getElementById("area" + i);
    n.value = "Sample " + (i + 1); n.dispatchEvent(new win4.Event("input", { bubbles: true }));
    a.value = "u" + i + "\ncommon"; a.dispatchEvent(new win4.Event("input", { bubbles: true }));
  }
  check("可添加到 40 个样本", d4.querySelectorAll("#listCards .list-card").length === 40,
    String(d4.querySelectorAll("#listCards .list-card").length));
  check("40 样本默认只画前 30 个交集", svg4.querySelectorAll(".upset-bar").length === 30,
    String(svg4.querySelectorAll(".upset-bar").length));
  const lim4 = d4.getElementById("selUpsetLimit");
  lim4.value = "all"; lim4.dispatchEvent(new win4.Event("change", { bubbles: true }));
  check("40 个样本的成员键长度 41（超过 32 位）", svg4.querySelector(".upset-bar").getAttribute("data-mask").length === 41,
    (svg4.querySelector(".upset-bar").getAttribute("data-mask") || "").length + " chars");
  check("切换全部后 40 独有 + 1 共有 = 41 根柱子", svg4.querySelectorAll(".upset-bar").length === 41,
    String(svg4.querySelectorAll(".upset-bar").length));
  check("40 个样本 UpSet 不崩溃且画布加高", (function () {
    var v = svg4.getAttribute("viewBox").split(/\s+/).map(Number);
    return v[3] > 1000 && svg4.textContent.indexOf("Sample 40") >= 0;
  })(), svg4.getAttribute("viewBox"));
  win4.close();

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });