// SetPlotSVG 组顺序调整回归测试（jsdom）
// 运行： node tests/venn-reorder-test.js
const { loadVenn } = require("./helpers/setplot-dom.js");

let pass = 0, fail = 0;
const check = (n, c, extra) => { if (c) { pass++; console.log("PASS", n, extra || ""); } else { fail++; console.log("FAIL", n, extra || ""); } };

(async () => {
  const window = await loadVenn();
  const d = window.document;
  const svg = d.getElementById("vennSvg");
  const cards = () => Array.from(d.querySelectorAll("#listCards .list-card"));
  const setList = (i, name, body) => {
    const n = d.getElementById("name" + i), a = d.getElementById("area" + i);
    n.value = name; n.dispatchEvent(new window.Event("input", { bubbles: true }));
    a.value = body; a.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const labels = () => Array.from(svg.querySelectorAll("text.label")).map(t => t.textContent);

  /* ---------- 1) 排序按钮 ---------- */
  check("6 张卡片都有上移/下移按钮", cards().every(c => c.querySelector(".move-up") && c.querySelector(".move-down")));
  check("第一张上移禁用", cards()[0].querySelector(".move-up").disabled === true);
  check("最后一张下移禁用", cards()[5].querySelector(".move-down").disabled === true);

  /* ---------- 2) 3 组：组顺序变化，颜色按位置保留 ---------- */
  setList(0, "Alpha", "a1\na2");
  setList(1, "Beta", "b1");
  setList(2, "Gamma", "c1\nc2\nc3");
  check("初始标签顺序 Alpha/Beta/Gamma", labels().join(",") === "Alpha,Beta,Gamma", labels().join(","));
  const f0 = d.getElementById("fill0"), f1 = d.getElementById("fill1");
  f0.value = "#ff0000"; f0.dispatchEvent(new window.Event("input", { bubbles: true }));
  f1.value = "#00ff00"; f1.dispatchEvent(new window.Event("input", { bubbles: true }));
  const shapesBefore = Array.from(svg.querySelectorAll("#shapes circle")).map(n => n.getAttribute("fill"));

  cards()[1].querySelector(".move-up").click();
  check("上移后输入框顺序 Beta/Alpha/Gamma",
    d.getElementById("name0").value === "Beta" && d.getElementById("name1").value === "Alpha" && d.getElementById("name2").value === "Gamma",
    [d.getElementById("name0").value, d.getElementById("name1").value, d.getElementById("name2").value].join(","));
  check("上移后内容跟随组", d.getElementById("area0").value === "b1" && d.getElementById("area1").value === "a1\na2",
    JSON.stringify([d.getElementById("area0").value, d.getElementById("area1").value]));
  check("上移后图中标签顺序 Beta/Alpha/Gamma", labels().join(",") === "Beta,Alpha,Gamma", labels().join(","));
  const numOf = k => {
    const n = svg.querySelector('text.val-text[data-mask="' + k + '"]');
    return n ? n.textContent.replace(/\(.*$/, "").trim() : null;
  };
  check("上移后区域元素数随组重排", numOf("C1000") === "1" && numOf("C0100") === "2",
    numOf("C1000") + "|" + numOf("C0100"));
  const shapesAfter = Array.from(svg.querySelectorAll("#shapes circle")).map(n => n.getAttribute("fill"));
  check("颜色按位置保留（不随组移动）", JSON.stringify(shapesBefore) === JSON.stringify(shapesAfter),
    JSON.stringify(shapesAfter));

  /* ---------- 3) 撤销恢复原顺序 ---------- */
  d.getElementById("btnUndo").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("撤销后恢复 Alpha/Beta/Gamma", labels().join(",") === "Alpha,Beta,Gamma", labels().join(","));
  check("撤销后输入框也恢复", d.getElementById("name0").value === "Alpha" && d.getElementById("name1").value === "Beta");

  /* ---------- 4) UpSet 里的组顺序同步 ---------- */
  setList(3, "Delta", "d1");
  setList(4, "Epsilon", "e1");
  check("5 组进入 UpSet 视图", (function () {
    var v = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    return v[3] >= 500 && v[2] >= 340;
  })(), svg.getAttribute("viewBox"));
  check("UpSet 初始行顺序 S1..S5", /Alpha[\s\S]*Beta[\s\S]*Gamma[\s\S]*Delta[\s\S]*Epsilon/.test(svg.textContent),
    svg.textContent.replace(/\s+/g, " ").slice(0, 120));
  cards()[1].querySelector(".move-up").click();
  check("UpSet 行顺序同步为 Beta/Alpha/...", /Beta[\s\S]*Alpha[\s\S]*Gamma[\s\S]*Delta[\s\S]*Epsilon/.test(svg.textContent),
    svg.textContent.replace(/\s+/g, " ").slice(0, 120));
  check("UpSet 视图下移动按钮仍可用", cards()[1].querySelector(".move-up").disabled === false);

  /* ---------- 5) 6 组最后一位上移 ---------- */
  setList(5, "Zeta", "z1");
  check("6 组画 6 个集合行", svg.textContent.indexOf("Zeta") > 0);
  cards()[5].querySelector(".move-up").click();
  check("第 6 位上移后 Zeta 在 Epsilon 前",
    svg.textContent.indexOf("Zeta") < svg.textContent.indexOf("Epsilon"),
    "Zeta@" + svg.textContent.indexOf("Zeta") + " Epsilon@" + svg.textContent.indexOf("Epsilon"));

  window.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });