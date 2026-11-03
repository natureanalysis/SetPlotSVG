// 浏览器交互集成测试（jsdom）：输入→渲染→点击区域→Results
const { loadVenn } = require("./helpers/setplot-dom.js");

let pass = 0, fail = 0;
const check = (n, c, extra) => { if (c) { pass++; console.log("PASS", n, extra || ""); } else { fail++; console.log("FAIL", n, extra || ""); } };

(async () => {
  // 页面装载交给共享 helper：它会剥掉 /auth.js 这类根绝对路径脚本
  // （fromFile 会把它们解析成 file:///E:/auth.js 而读不到，整个测试崩掉）
  const window = await loadVenn();
  const d = window.document;

  const svg = d.getElementById("vennSvg");
  check("页面加载，SVG 已渲染 region path", !!svg.querySelector("path[data-mask]"));

  // 1) 输入两组示例，验证渲染与计数
  const setList = (i, text) => {
    const ta = d.getElementById("area" + i);
    ta.value = text;
    ta.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  setList(0, "Marilyn Monroe\nArnold Schwarzenegger\nJack Nicholson\nBarbra Streisand\nRobert de Niro\nDean Martin\nHarrison Ford");
  setList(1, "Freddy Mercury\nBarbra Streisand\nDean Martin\nRicky Martin\nCeline Dion\nMarilyn Monroe");

  const paths2 = svg.querySelectorAll("path[data-mask]");
  check("2 组时区域 path 数 = 3", paths2.length === 3, `got ${paths2.length}`);

  const v = m => svg.querySelector('[data-mask="' + m + '"]');
  check("C1100 path 存在", !!v("C1100"));
  check("C1000 path 存在", !!v("C1000"));
  check("C0100 path 存在", !!v("C0100"));

  // 数字文本：找出 values 中 data-mask=C1100 的文本内容（含 count）
  const texts = {};
  svg.querySelectorAll("text[data-mask='C1100']").forEach(t => texts[t.textContent.trim()] = 1);
  check("C1100 数字含 3", Object.keys(texts).some(s => /\b3\b/.test(s)), JSON.stringify(Object.keys(texts)));

  // 2) 点击 C1100 区域 → Results 更新
  const c1100 = svg.querySelector('path[data-mask="C1100"]');
  c1100.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const names = d.getElementById("names").value;
  check("Results 包含共享元素计数描述+元素", /3/.test(names) && names.includes("Barbra Streisand") && names.includes("Dean Martin") && names.includes("Marilyn Monroe"), names.split("\n")[0]);

  // 3) 点击单属区域
  svg.querySelector('path[data-mask="C1000"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const n2 = d.getElementById("names").value;
  check("C1000 独占 4 元素", /4/.test(n2) && n2.includes("Arnold Schwarzenegger") && !n2.includes("Ricky Martin"), n2.split("\n")[0]);

  // 4) 4 组 → 15 区域
  setList(2, "c1\nc2\nc3\nc4\nMarilyn Monroe\nBarbra Streisand");
  setList(3, "d1\nd2\nd3\nd4\nMarilyn Monroe\nRicky Martin");
  check("4 组时区域 path 数 = 15", svg.querySelectorAll("path[data-mask]").length === 15, `got ${svg.querySelectorAll("path[data-mask]").length}`);

  // 5) 样式切换 gray 后仍有点击 path
  const sel = d.getElementById("selStyle");
  sel.value = "gray";
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("gray 模式仍有 15 区域 path 且含 region-fill", svg.querySelectorAll("path.region-fill").length === 15);

  // 6) 深色主题切换（不报错）
  d.getElementById("themeBtn").dispatchEvent(new window.MouseEvent("click"));
  check("主题切换为 dark", d.documentElement.getAttribute("data-theme") === "dark");

  // 7) 导出 SVG 字符串可构造（DOM 序列化源头可用）
  check("SVG 可序列化", new window.XMLSerializer().serializeToString(svg).includes("<svg"));

  // 8) 小写转换
  d.getElementById("btnLower").dispatchEvent(new window.MouseEvent("click"));
  const v0 = d.getElementById("area0").value;
  check("lowercase 生效", v0 === v0.toLowerCase() && v0.includes("barbra streisand"));

  window.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });