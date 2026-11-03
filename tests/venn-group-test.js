// SetPlotSVG 实验分组 / Set size 坐标轴回归测试（jsdom）
// 运行： node tests/venn-group-test.js
const { loadVenn } = require("./helpers/setplot-dom.js");

let pass = 0, fail = 0;
const check = (n, c, extra) => { if (c) { pass++; console.log("PASS", n, extra || ""); } else { fail++; console.log("FAIL", n, extra || ""); } };

const uniq = p => Array.from({ length: 10 }, (_, k) => p + (k + 1)).join("\n");

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
  const setGroup = (i, group, color) => {
    const g = d.getElementById("group" + i), c = d.getElementById("gcolor" + i);
    g.value = group; g.dispatchEvent(new window.Event("input", { bubbles: true }));
    if (color) { c.value = color; c.dispatchEvent(new window.Event("input", { bubbles: true })); }
  };
  const groupSwatches = () => Array.from(svg.querySelectorAll('rect[width="14"][height="14"]'));
  const textHas = t => Array.from(svg.querySelectorAll("text")).some(n => n.textContent.trim() === t);
  const vb = () => svg.getAttribute("viewBox").split(/\s+/).map(Number);

  /* ---------- 1) 每张卡片都有实验分组输入 + 颜色 ---------- */
  check("6 张卡片都有实验分组输入", cards().every((c, i) => !!c.querySelector('#group' + i)));
  check("6 张卡片都有分组颜色控件", [0, 1, 2, 3, 4, 5].every(i => !!d.getElementById("gcolor" + i)));
  check("默认分组颜色为 Nature 风格色板", d.getElementById("gcolor0").value.toLowerCase() === "#e69f00",
    d.getElementById("gcolor0").value);

  /* ---------- 2) Set size 坐标轴 ---------- */
  for (let i = 0; i < 5; i++) setList(i, "S" + (i + 1), uniq("abcde"[i]) + "\ncommon");
  check("Set size 轴标题存在", textHas("集合大小"));
  check("Set size 轴有 0 和多个整数刻度", textHas("0") && Array.from(svg.querySelectorAll("text")).filter(n => /^\d+$/.test(n.textContent.trim())).length >= 4);
  check("集合大小条使用学术蓝 #5B9BD5", svg.querySelectorAll('rect[fill="#5B9BD5"]').length === 5,
    String(svg.querySelectorAll('rect[fill="#5B9BD5"]').length));
  check("默认无分组时不绘制右侧色块", groupSwatches().length === 0, String(groupSwatches().length));

  /* ---------- 3) 分组色块与同名同色 ---------- */
  const baseW = vb()[2];
  setGroup(0, "LUAD");
  setGroup(1, "LCNEC");
  setGroup(2, "LUAD");              // 与第 1 组同名，应自动沿用橙色
  setGroup(3, "LUSC", "#CC79A7");
  setGroup(4, "SCLC", "#56B4E9");
  check("同名实验分组自动同色", d.getElementById("gcolor2").value.toLowerCase() === "#e69f00",
    d.getElementById("gcolor2").value);
  check("UpSet 右侧绘制 5 个分组色块", groupSwatches().length === 5, String(groupSwatches().length));
  const swatchColors = groupSwatches().map(n => n.getAttribute("fill").toLowerCase());
  check("分组色块颜色与输入一致", swatchColors.join(",") === "#e69f00,#56b4e9,#e69f00,#cc79a7,#56b4e9",
    swatchColors.join(","));
  check("UpSet 右侧显示分组名称", textHas("LUAD") && textHas("LCNEC") && textHas("LUSC") && textHas("SCLC"));
  check("UpSet 分组列不额外加标题（与参考图一致）", !textHas("实验分组"));
  check("分组列使画布加宽", vb()[2] > baseW, baseW + " → " + vb()[2]);

  /* ---------- 4) 长分组名完整显示 ---------- */
  const beforeLongW = vb()[2];
  const longGroup = "非小细胞肺癌-非特指型";
  setGroup(4, longGroup);
  check("长实验分组名完整显示（不截断）", svg.textContent.indexOf(longGroup) >= 0,
    svg.textContent.replace(/\s+/g, " ").slice(0, 140));
  const groupLongW = vb()[2];
  check("长分组名使右侧列继续加宽", groupLongW > beforeLongW, beforeLongW + " → " + groupLongW);

  /* ---------- 4b) Set size 放到右侧（分组位） ---------- */
  const selPos = d.getElementById("selUpsetSetPos");
  check("UpSet 提供集合大小位置控件", !!selPos && d.getElementById("upsetSetPosWrap").hidden === false);
  check("集合大小位置默认在左侧", selPos.value === "left");
  selPos.value = "right"; selPos.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("右侧模式：每个样本一根集合大小条", svg.querySelectorAll(".upset-set-bar").length === 5,
    String(svg.querySelectorAll(".upset-set-bar").length));
  const setVals = Array.from(svg.querySelectorAll("text.upset-set-value")).map(n => n.textContent.trim());
  check("右侧模式：柱子上显示各样本总数", setVals.length === 5 && setVals.every(v => v === "11"), setVals.join(","));
  check("右侧模式：不使用分组（无色块、无分组名）",
    groupSwatches().length === 0 && !textHas("LUAD") && !textHas("LUSC"),
    "swatches=" + groupSwatches().length);
  check("右侧模式：集合大小条向右延伸并留在画布内", (function () {
    const bars = Array.from(svg.querySelectorAll(".upset-set-bar"));
    const w = vb()[2];
    return bars.every(b => parseFloat(b.getAttribute("x")) + parseFloat(b.getAttribute("width")) <= w);
  })(), svg.getAttribute("viewBox"));
  check("右侧模式：集合大小轴与标题仍在", textHas("集合大小") &&
    svg.querySelectorAll('[data-grab="label:setaxis"]').length === 1);
  check("右侧模式：样本名紧贴点阵背景", (function () {
    const grid = svg.querySelector("#upset-grid rect");
    const nameX = parseFloat(svg.querySelector(".upset-sample-label").getAttribute("data-bx"));
    return !!grid && parseFloat(grid.getAttribute("x")) - nameX <= 12;
  })(), "名称右端=" + svg.querySelector(".upset-sample-label").getAttribute("data-bx") +
    " 点阵左边=" + svg.querySelector("#upset-grid rect").getAttribute("x"));
  check("右侧模式：集合大小条紧贴点阵背景", (function () {
    const grid = svg.querySelector("#upset-grid rect");
    const gridRight = parseFloat(grid.getAttribute("x")) + parseFloat(grid.getAttribute("width"));
    const bar = svg.querySelector(".upset-set-bar");
    return !!grid && !!bar && parseFloat(bar.getAttribute("x")) - gridRight <= 16;
  })(), "条起点=" + svg.querySelector(".upset-set-bar").getAttribute("x"));
  check("右侧模式：集合大小数值可拖动", (function () {
    const v = svg.querySelector("text.upset-set-value");
    return !!v && /^num:setcount:/.test(v.getAttribute("data-grab") || "");
  })());
  selPos.value = "left"; selPos.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("切回左侧：分组色块与集合大小条恢复",
    groupSwatches().length === 5 && svg.querySelectorAll('rect[fill="#5B9BD5"]').length === 5 &&
    svg.querySelectorAll("text.upset-set-value").length === 0,
    "swatches=" + groupSwatches().length);

  /* ---------- 5) 组排序时实验分组跟随 ---------- */
  cards()[1].querySelector(".move-up").click();
  check("上移后分组输入跟随组", d.getElementById("group0").value === "LCNEC" && d.getElementById("name0").value === "S2",
    d.getElementById("group0").value + "," + d.getElementById("name0").value);
  check("上移后 UpSet 右侧分组顺序同步", svg.textContent.indexOf("LCNEC") < svg.textContent.indexOf("LUAD"),
    "LCNEC@" + svg.textContent.indexOf("LCNEC") + " LUAD@" + svg.textContent.indexOf("LUAD"));
  d.getElementById("btnUndo").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("撤销后分组顺序恢复", d.getElementById("group0").value === "LUAD" && d.getElementById("name0").value === "S1");

  /* ---------- 6) 分享链接携带分组名与颜色 ---------- */
  const payload = {
    l: ["S1", "S2", "S3", "S4", "S5"].map((nm, i) => [
      nm, "x" + i + "\ncommon", "G" + i, ["#E69F00", "#56B4E9", "#009E73", "#CC79A7", "#F0E442"][i]
    ]),
    v: "upset", ap: 0, s: { m: "custom" }
  };
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const win2 = await loadVenn({ hash: "#v=" + b64 });
  const d2 = win2.document;
  const svg2 = d2.getElementById("vennSvg");
  check("分享：恢复分组名称", [0, 1, 2, 3, 4].every(i => d2.getElementById("group" + i).value === "G" + i));
  check("分享：恢复分组颜色", d2.getElementById("gcolor2").value.toLowerCase() === "#009e73",
    d2.getElementById("gcolor2").value);
  check("分享：UpSet 右侧色块恢复", svg2.querySelectorAll('rect[width="14"][height="14"]').length === 5,
    String(svg2.querySelectorAll('rect[width="14"][height="14"]').length));
  win2.close();

  const b64r = Buffer.from(JSON.stringify(Object.assign({}, payload, { sp: "right" })), "utf8").toString("base64");
  const win3 = await loadVenn({ hash: "#v=" + b64r });
  const d3 = win3.document;
  const svg3 = d3.getElementById("vennSvg");
  check("分享：集合大小改放到右侧的模式也能恢复",
    d3.getElementById("selUpsetSetPos").value === "right" &&
    svg3.querySelectorAll(".upset-set-bar").length === 5 &&
    svg3.querySelectorAll('rect[width="14"][height="14"]').length === 0,
    d3.getElementById("selUpsetSetPos").value + " bars=" + svg3.querySelectorAll(".upset-set-bar").length);
  win3.close();

  window.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });