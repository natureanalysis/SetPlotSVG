// SetPlotSVG 新功能回归测试（jsdom）：权重模式 / 拖拽定位 / 配色 / 查找定位 / ? 占位 / 统计 / 紧凑布局
// 运行： node tests/venn-features-test.js
const { loadVenn } = require("./helpers/setplot-dom.js");

let pass = 0, fail = 0;
const check = (n, c, extra) => { if (c) { pass++; console.log("PASS", n, extra || ""); } else { fail++; console.log("FAIL", n, extra || ""); } };

const heavy = (n, p) => Array.from({ length: n }, (_, k) => p + (k + 1)).join("\n");

(async () => {
  // 页面装载交给共享 helper（剥掉 /auth.js 等根绝对路径脚本，见 helpers/venn-dom.js 顶部说明）
  const window = await loadVenn();
  const d = window.document;
  const svg = d.getElementById("vennSvg");
  const check2 = check;
  const setList = (i, t) => { const a = d.getElementById("area" + i); a.value = t; a.dispatchEvent(new window.Event("input", { bubbles: true })); };
  const fire = (el, type, init) => el.dispatchEvent(new window.MouseEvent(type, Object.assign({ bubbles: true, clientX: 0, clientY: 0 }, init || {})));
  const valText = k => svg.querySelector('text.val-text[data-mask="' + k + '"]');
  const valStr = k => { const t = valText(k); return t ? t.textContent.replace(/\(.*$/, "").trim() : null; };
  const hit = k => svg.querySelector('path.region-hit[data-mask="' + k + '"]');
  // 用鞋带公式把区域 path 的面积算回来（与应用内部一致的「外环 − 内环」口径）
  const svgArea = el => {
    if (!el) return 0;
    const rings = el.getAttribute("d").split("M").filter(s => s.trim());
    let tot = 0;
    rings.forEach((r, i) => {
      const nums = (r.replace(/Z/g, " ").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      const pts = [];
      for (let j = 0; j < nums.length; j += 2) pts.push([nums[j], nums[j + 1]]);
      let a = 0;
      for (let j = 0; j < pts.length; j++) { const p = pts[j], q = pts[(j + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
      tot += (i === 0 ? 1 : -1) * Math.abs(a) / 2;
    });
    return tot;
  };
  const devNum = () => parseFloat((d.getElementById("fitDev").textContent.match(/([0-9.]+)%/) || [])[1]);

  /* ---------- 1) 设置栏：常用一排 +「更多」折叠 ---------- */
  const extra = d.getElementById("toolbarExtra");
  check2("「更多」面板默认折叠", extra.hasAttribute("hidden"), String(extra.hidden));
  check2("常用区含 填充/线宽/文字 三组", d.querySelectorAll(".toolbar:not(.toolbar-extra) .tb-group").length === 3);
  d.getElementById("btnMore").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check2("点开后「更多」展开", !extra.hasAttribute("hidden") && d.getElementById("btnMore").getAttribute("aria-expanded") === "true");
  check2("字体/字号/颜色/自适应都在「更多」里", ["selFamily", "labelSizeBox", "labelColor", "numColor", "strokeColor", "fill0", "chkFit"].every(id => extra.contains(d.getElementById(id))));
  check2("数字字号留在常用区", !extra.contains(d.getElementById("numSizeBox")));
  check2("颜色控件齐全（名称/数字/描边/4 个填充 + 透明度）", ["labelColor", "numColor", "strokeColor", "fill0", "fill1", "fill2", "fill3", "alphaRange"].every(id => !!d.getElementById(id)));

  /* ---------- 2) 紧凑 / 宽松布局 ---------- */
  check2("默认紧凑（左栏窄）", d.body.classList.contains("compact"));
  d.getElementById("btnDensity").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check2("切换后为宽松", !d.body.classList.contains("compact"));
  d.getElementById("btnDensity").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check2("再切回紧凑", d.body.classList.contains("compact"));

  /* ---------- 3) 配色自定义（含「圈内填充不生效」的回归） ---------- */
  const labelColor = d.getElementById("labelColor");
  labelColor.value = "#008b8b"; labelColor.dispatchEvent(new window.Event("input", { bubbles: true }));
  check2("名称颜色可自定义", svg.querySelector("text.label").getAttribute("fill") === "#008b8b", svg.querySelector("text.label").getAttribute("fill"));
  d.getElementById("labelColorAuto").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check2("名称颜色可恢复自动（默认纯白填充 → 回黑）", svg.querySelector("text.label").getAttribute("fill") === "#000000", svg.querySelector("text.label").getAttribute("fill"));

  // 默认「自定义填充」模式下取色器就该直接生效（旧版本必须先把 Fill 切到 Colors，属于 bug）
  const sel = d.getElementById("selStyle");
  check2("默认填充模式 = 自定义填充", sel.value === "custom", sel.value);
  const f0 = d.getElementById("fill0");
  f0.value = "#7b2ff7"; f0.dispatchEvent(new window.Event("input", { bubbles: true }));
  check2("默认模式下圈内填充色即生效", svg.querySelector("#shapes circle").getAttribute("fill") === "rgba(123,47,247,0.5)", svg.querySelector("#shapes circle").getAttribute("fill"));
  const autoLabel = svg.querySelector("text.label").getAttribute("fill");
  check2("名称色自动跟随填充色（同色相深色）", autoLabel !== "#000000" && /^#[0-9a-f]{6}$/.test(autoLabel), autoLabel);
  const alpha = d.getElementById("alphaRange");
  alpha.value = "80"; alpha.dispatchEvent(new window.Event("input", { bubbles: true }));
  check2("透明度生效", svg.querySelector("#shapes circle").getAttribute("fill") === "rgba(123,47,247,0.8)");
  const strokeC = d.getElementById("strokeColor");
  strokeC.value = "#123456"; strokeC.dispatchEvent(new window.Event("input", { bubbles: true }));
  check2("描边色可自定义", svg.getElementById("strokes").getAttribute("stroke") === "#123456");
  const numC = d.getElementById("numColor");
  numC.value = "#0055aa"; numC.dispatchEvent(new window.Event("input", { bubbles: true }));
  check2("数字颜色可自定义", svg.querySelector("text.val-text").getAttribute("fill") === "#0055aa");
  d.getElementById("numColorAuto").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  d.getElementById("fillAuto").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check2("填充色 ↺ 恢复经典配色", svg.querySelector("#shapes circle").getAttribute("fill") === "rgba(0,0,255,0.8)", svg.querySelector("#shapes circle").getAttribute("fill"));
  // Colors / 自定义填充 现在是同一套取色器的两个入口：Colors 一键回到经典蓝黄绿红
  f0.value = "#7b2ff7"; f0.dispatchEvent(new window.Event("input", { bubbles: true }));
  sel.value = "colors"; sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  check2("切 Colors 一键回到经典配色", svg.querySelector("#shapes circle").getAttribute("fill") === "rgba(0,0,255,0.8)", svg.querySelector("#shapes circle").getAttribute("fill"));
  sel.value = "custom"; sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  check2("切回自定义填充后仍是同一套颜色（未被打乱）", svg.querySelector("#shapes circle").getAttribute("fill") === "rgba(0,0,255,0.8)");

  /* ---------- 4) 拖拽文字 / 数字位置 ---------- */
  setList(0, "a1\na2\na3\nshared");
  setList(1, "b1\nb2\nshared");
  const t0 = valText("C1000");
  const baseX = parseFloat(t0.getAttribute("data-bx")), baseY = parseFloat(t0.getAttribute("data-by"));
  check2("数字带拖拽标记与基准坐标", t0.getAttribute("data-grab") === "num:C1000" && isFinite(baseX) && isFinite(baseY));

  fire(t0, "pointerdown", { clientX: 0, clientY: 0 });
  fire(t0, "pointermove", { clientX: 30, clientY: -12 });
  check2("拖动过程中坐标实时跟随", Math.abs(parseFloat(t0.getAttribute("x")) - (baseX + 30)) < 0.01, t0.getAttribute("x"));
  fire(t0, "pointerup", { clientX: 30, clientY: -12 });
  const t1 = valText("C1000");
  check2("松手后偏移被提交（重渲染仍在新位置）", Math.abs(parseFloat(t1.getAttribute("x")) - (baseX + 30)) < 0.01, t1.getAttribute("x"));
  check2("拖动过就不触发区域选中", d.getElementById("names").value === "", JSON.stringify(d.getElementById("names").value.slice(0, 40)));
  check2("位置按钮显示已移动数量", /\(1\)/.test(d.getElementById("btnResetPos").textContent), d.getElementById("btnResetPos").textContent);

  // 集合名称也能拖
  const lb = svg.querySelector("text.label");
  const lbBase = parseFloat(lb.getAttribute("data-bx")), lbBaseY = parseFloat(lb.getAttribute("data-by"));
  fire(lb, "pointerdown", { clientX: 0, clientY: 0 });
  fire(lb, "pointermove", { clientX: -20, clientY: 25 });
  fire(lb, "pointerup", { clientX: -20, clientY: 25 });
  const lb2 = svg.querySelector("text.label");
  check2("集合名称可拖动", Math.abs(parseFloat(lb2.getAttribute("x")) - (lbBase - 20)) < 0.01 && Math.abs(parseFloat(lb2.getAttribute("y")) - (lbBaseY + 25)) < 0.01, lb2.getAttribute("x") + "," + lb2.getAttribute("y"));

  // 双击复位
  fire(lb2, "dblclick");
  const lb3 = svg.querySelector("text.label");
  check2("双击复位单个文字", Math.abs(parseFloat(lb3.getAttribute("x")) - lbBase) < 0.01, lb3.getAttribute("x"));
  // 一键重置全部
  d.getElementById("btnResetPos").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const t2 = valText("C1000");
  check2("一键重置全部位置", Math.abs(parseFloat(t2.getAttribute("x")) - baseX) < 0.01 && parseFloat(d.getElementById("btnResetPos").textContent.replace(/\D/g, "") || "0") === 0);

  /* ---------- 5) 面积正比（overlap weight）：区域面积 ∝ 所含元素数 ---------- */
  const cw = d.getElementById("chkWeight");
  const badge = d.getElementById("fitDev");
  const mkSet = (aFrom, aTo, p1, p1From, p1To, p2, p2From, p2To) => {
    const o = [];
    for (let k = aFrom; k <= aTo; k++) o.push("a" + k);
    for (let k = p1From; k <= p1To; k++) o.push(p1 + k);
    for (let k = p2From; k <= p2To; k++) o.push(p2 + k);
    return o.join("\n");
  };

  cw.checked = true; cw.dispatchEvent(new window.Event("change", { bubbles: true }));
  // 2 组：A=60（a1..a60）、B=a41..a60 + b1..b20 → A独有 40 / 交集 20 / B独有 20
  setList(0, mkSet(1, 60, null, 1, 0, null, 1, 0));
  setList(1, mkSet(41, 60, "b", 1, 20, null, 1, 0));
  setList(2, ""); setList(3, "");
  const ar = k => svgArea(hit(k));
  check2("面积正比：数字仍是元素个数（不是权重）", valStr("C1100") === "20", valStr("C1100"));
  check2("面积正比(2组)：A独有:交集 = 40:20 = 2:1", Math.abs(ar("C1000") / ar("C1100") - 2) < 0.08, (ar("C1000") / ar("C1100")).toFixed(3));
  check2("面积正比(2组)：交集:B独有 = 20:20 = 1:1", Math.abs(ar("C1100") / ar("C0100") - 1) < 0.06, (ar("C1100") / ar("C0100")).toFixed(3));
  check2("面积正比：徽标可见（2 组为精确解 → 偏差 0）", !badge.hidden && devNum() <= 1, badge.textContent);
  check2("面积正比：徽标带解释性 title", /%/.test(badge.getAttribute("title") || ""), (badge.getAttribute("title") || "").slice(0, 30));

  // 3 组：偏差应很小
  setList(0, mkSet(1, 60, null, 1, 0, null, 1, 0));
  setList(1, mkSet(41, 60, "b", 1, 20, null, 1, 0));
  setList(2, mkSet(51, 60, "b", 11, 20, "c", 1, 10));
  check2("面积正比(3组)：7 个区域全部生成", svg.querySelectorAll("path.region-hit").length === 7, svg.querySelectorAll("path.region-hit").length);
  check2("面积正比(3组)：实测最大偏差 ≤ 20%", isFinite(devNum()) && devNum() <= 20, badge.textContent);
  const a3 = ["C1000", "C1100", "C0100", "C0110", "C1110", "C0010"].map(ar);
  const worst3 = Math.max(...a3) / Math.min(...a3);
  check2("面积正比(3组)：相对大小与元素数一致（同量级的区域不至于差出量级）", worst3 < 4, worst3.toFixed(2));

  /* 有元素的区域绝不能「静默」消失（曾经的 bug：25 个元素、占比 14.8% 的区域整块消失，
     页面不作任何提示）。
     注意别把断言写成「8 个区域必须全部存在」：面积正比是时间预算内的数值拟合
     （setplotsvg.js FIT_BUDGET = 200ms），这组刻意悬殊的比例（1500/1200 vs 300/1200）本来就
     拟不出 8 块同时成立的多边形。应用对此有明确设计 —— 拟不出就丢掉最小的那几块、
     并在徽标上写「N empty regions」且加 warn 类（updateDevBadge 的 mode==="base" 分支同源）。
     实测：单独跑探针 100% 收敛、跑完整测试时机器较忙就拟不出来，两种结果都来自同一条
     时间预算路径，不是逻辑错误。
     所以这里断言的是真正的契约：有元素的区域若消失，必须伴随明确的降级提示 ——
     这既守住了「静默消失」这个真 bug，又不去断言一个性能预算做不到的强保证。 */
  const APPLY4 = () => {
    setList(0, heavy(1500, "a")); setList(1, heavy(1200, "a"));
    setList(2, heavy(300, "a") + "\n" + heavy(1200, "x"));
    setList(3, heavy(300, "a") + "\n" + heavy(1200, "y"));
  };
  const FOUR = ["C1000", "C1100", "C0110", "C1110", "C0010", "C0001", "C0011", "C0111"];
  const missing4 = () => FOUR.filter(k => !hit(k));
  APPLY4();
  const badgeTxt = badge.textContent.trim();
  const warned = badge.classList.contains("warn") || /empty region|空区域/i.test(badgeTxt);
  check2("面积正比：含元素的区域不静默消失（要么全在，要么明确提示降级）",
    missing4().length === 0 || warned,
    missing4().length === 0
      ? FOUR.map(k => k + "=" + (hit(k) ? Math.round(ar(k)) : "无")).join(" ")
      : `缺 ${missing4().join(",")} 但徽标有提示：「${badgeTxt}」warn=${badge.classList.contains("warn")}`);
  /* 页面默认语言为简体，断言不能只认英文措辞。 */
  check2("面积正比：徽标确实把空区域说了出来（缺区域时必须报数）",
    missing4().length === 0 || /empty region|空区域/i.test(badgeTxt), badgeTxt);

  cw.checked = false; cw.dispatchEvent(new window.Event("change", { bubbles: true }));
  check2("关掉面积正比后徽标隐藏", badge.hidden);
  // 当前是 4 组，固定几何是 4 个椭圆（rx=90 ry=141），不是圆
  const se = svg.querySelector("#shapes ellipse");
  check2("关掉面积正比后回到固定几何（4 组椭圆 rx=90 ry=141）",
    !!se && Math.abs(parseFloat(se.getAttribute("rx")) - 90) < 0.01 && Math.abs(parseFloat(se.getAttribute("ry")) - 141) < 0.01 && svg.querySelectorAll("#shapes ellipse").length === 4,
    se ? ("rx=" + se.getAttribute("rx") + " ry=" + se.getAttribute("ry") + " n=" + svg.querySelectorAll("#shapes ellipse").length) : "无椭圆");

  /* ---------- 6) 元素查找定位 ---------- */
  setList(0, "TP53\nBRCA1\nEGFR\nshared");
  setList(1, "TP53\nKRAS\nshared");
  const fe = d.getElementById("findEl");
  fe.value = "TP53"; fe.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 260));
  check2("查找命中区域被高亮", hit("C1100").classList.contains("found") && valText("C1100").classList.contains("found"));
  check2("未命中的区域不高亮", !hit("C1000").classList.contains("found"));
  check2("Results 输出查找结果", /(1 region|个区域)/.test(d.getElementById("names").value) && /(List 1|列表 1) ∩ (List 2|列表 2)/.test(d.getElementById("names").value), d.getElementById("names").value.split("\n")[0]);
  fe.value = "SHAR"; fe.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 260));
  check2("查找不区分大小写且支持部分匹配", /(1 element|个元素)/.test(d.getElementById("names").value), d.getElementById("names").value.split("\n")[0]);
  fe.value = "nothing-here"; fe.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 260));
  check2("查不到时给出提示并标记输入框", /No element matches|未找到包含/.test(d.getElementById("names").value) && fe.classList.contains("miss"));
  d.getElementById("btnFindClear").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check2("清除查找后高亮消失", !hit("C1100").classList.contains("found") && fe.value === "");
  // 点击区域会退出查找态
  fe.value = "TP53"; fe.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 260));
  hit("C1100").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check2("点区域后退出查找高亮", !hit("C1100").classList.contains("found") && fe.value === "");

  /* ---------- 7) 「?」占位（区域太小） ---------- */
  d.getElementById("numSizeBox").value = "16";
  d.getElementById("numSizeBox").dispatchEvent(new window.Event("input", { bubbles: true }));
  setList(0, heavy(1500, "a")); setList(1, heavy(1200, "a"));
  setList(2, heavy(300, "a") + "\n" + heavy(1200, "x"));
  setList(3, heavy(300, "a") + "\n" + heavy(1200, "y"));
  const qms = Array.from(svg.querySelectorAll("text.val-text.qm"));
  check2("极小区域用「?」占位", qms.length > 0, "count=" + qms.length);
  check2("「?」文本内容就是问号", qms.every(t => t.textContent.trim() === "?"), qms.map(t => t.textContent.trim()).slice(0, 3).join("|"));
  check2("「?」带真实值供悬停显示", qms.every(t => /^\d/.test(t.getAttribute("data-tip") || "")), (qms[0] || {}).getAttribute && qms[0].getAttribute("data-tip"));
  check2("「?」字号不超过用户字号", qms.every(t => parseFloat(t.getAttribute("font-size")) <= 16.01));
  // 2 组全放得下时不应出现「?」
  setList(0, heavy(20, "a")); setList(1, heavy(15, "a") + "\n" + heavy(5, "b"));
  setList(2, ""); setList(3, "");
  check2("区域够大时不出现「?」", svg.querySelectorAll("text.val-text.qm").length === 0);

  /* ---------- 8) 导出：剔除运行时状态与拖拽辅助属性 ---------- */
  let exported = null;
  const OrigSer = window.XMLSerializer;
  window.XMLSerializer = class extends OrigSer {
    serializeToString(n) { const s = super.serializeToString(n); exported = s; return s; }
  };
  // createObjectURL 的桩在 helpers/venn-dom.js 里已给到位，这里正常点即可（原先靠 try/catch 吞异常）
  d.getElementById("btnExportSvg").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.XMLSerializer = OrigSer;
  check2("导出串已生成", !!exported && exported.indexOf("<svg") >= 0);
  check2("导出串不含交互命中层", !!exported && exported.indexOf('id="interact"') < 0);
  check2("导出串不含查找高亮类", !!exported && exported.indexOf("found") < 0);
  check2("导出串不含拖拽辅助属性", !!exported && exported.indexOf("data-grab") < 0 && exported.indexOf("data-bx") < 0);
  check2("导出串保留文字位置（x/y 已烘焙）", !!exported && /class="label"/.test(exported));

  /* ---------- 9) 分享链接：#v= 载荷往返（面积正比 + 拖动 + 配色 + 字号） ---------- */
  const payload = {
    l: [["Actors", "x1\nx2\nx3"], ["Singers", "x1\nx2"], null, null],
    ap: 1,
    d: { label: { "0": [10, -5] }, num: { C1100: [20, 8] } },
    s: {
      m: "colors", p: 1, w: 5, ls: 30, ns: 20, ft: 1, fm: "serif",
      lc: "#112233", nc: "#00aa55", sc: "#999999",
      fl: ["#111111", "#222222", "#333333", "#444444"], al: 70
    }
  };
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const win2 = await loadVenn({ hash: "#v=" + b64 });
  const d2 = win2.document;
  const svg2 = d2.getElementById("vennSvg");
  check2("分享：恢复面积正比模式", d2.getElementById("chkWeight").checked === true);
  check2("分享：恢复样式/线宽/字号", d2.getElementById("selStyle").value === "colors"
    && d2.getElementById("widthBox").value === "5"
    && d2.getElementById("labelSizeBox").value === "30"
    && d2.getElementById("numSizeBox").value === "20"
    && d2.getElementById("selFamily").value === "serif");
  check2("分享：恢复自定义颜色", d2.getElementById("labelColor").value === "#112233"
    && d2.getElementById("numColor").value === "#00aa55"
    && d2.getElementById("strokeColor").value === "#999999"
    && d2.getElementById("fill1").value === "#222222"
    && d2.getElementById("alphaRange").value === "70");
  check2("分享：恢复圈内填充（含透明度）", svg2.querySelector("#shapes circle").getAttribute("fill") === "rgba(17,17,17,0.7)",
    svg2.querySelector("#shapes circle").getAttribute("fill"));
  // 位置断言改成「基准 + 偏移」：面积正比下基准是拟合出来的，写死数字毫无意义。
  // 容差 0.051：渲染时 x/y 会 r1() 保留 1 位小数，而 data-bx/by 存的是未取整的基准值。
  const near1 = (a, b) => Math.abs(a - b) < 0.051;
  const lbS = svg2.querySelector("text.label");
  const lbBx = parseFloat(lbS.getAttribute("data-bx")), lbBy = parseFloat(lbS.getAttribute("data-by"));
  check2("分享：恢复拖动后的名称位置", near1(parseFloat(lbS.getAttribute("x")), lbBx + 10)
    && near1(parseFloat(lbS.getAttribute("y")), lbBy - 5),
    lbS.getAttribute("x") + "," + lbS.getAttribute("y") + " 基准 " + lbBx + "," + lbBy);
  const numS = svg2.querySelector('text.val-text[data-mask="C1100"]');
  const nBx = parseFloat(numS.getAttribute("data-bx")), nBy = parseFloat(numS.getAttribute("data-by"));
  check2("分享：恢复拖动后的数字位置", near1(parseFloat(numS.getAttribute("x")), nBx + 20)
    && near1(parseFloat(numS.getAttribute("y")), nBy + 8),
    numS.getAttribute("x") + "," + numS.getAttribute("y") + " 基准 " + nBx + "," + nBy);
  check2("分享：列表名与内容一并恢复", d2.getElementById("name0").value === "Actors" && d2.getElementById("area0").value === "x1\nx2\nx3");
  check2("分享：整体成功（loadShared 未中途异常退出 → 提示 shown）",
    /Shared data loaded|已加载分享数据/.test(d2.getElementById("toast").textContent), JSON.stringify(d2.getElementById("toast").textContent));
  // 说明：jsdom 走 file:// 时 history.replaceState 会抛 SecurityError，hash 清不掉属预期；
  // 真实 http 环境下会清掉（venn-browser-check.js 里另有浏览器侧验证）。这里只保证 hash 至少存在过。
  check2("分享：hash 载荷存在（file:// 下 replaceState 受限）", String(win2.location.hash).indexOf("#v=") === 0);
  win2.close();

  /* ---------- 10) 旧版分享链接兼容：wt / "colored" 这两个旧取值必须还能认 ---------- */
  const legacy = Buffer.from(JSON.stringify({
    l: [["Old A", "p\nq\nr"], ["Old B", "q"], null, null],
    wt: 1,
    s: { m: "colored", w: 4, fm: "serif" }
  }), "utf8").toString("base64");
  const win3 = await loadVenn({ hash: "#v=" + legacy });
  const d3 = win3.document;
  check2("旧链接：wt 别名字段仍能开启面积正比", d3.getElementById("chkWeight").checked === true);
  check2("旧链接：m=\"colored\" 归一化为 colors（取色器不是失效态）", d3.getElementById("selStyle").value === "colors", d3.getElementById("selStyle").value);
  check2("旧链接：圈内填充仍有颜色（不是全透明）",
    /rgba\(0,0,255/.test(d3.querySelector("#shapes circle").getAttribute("fill")),
    d3.querySelector("#shapes circle").getAttribute("fill"));
  win3.close();

  window.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
