/* SetPlotSVG 的 jsdom 装载器 —— 全部回归测试共用。
 *
 * 直接从仓库根的 index.html 构造 DOM。页面里的脚本都是相对路径
 * （vendor/polygon-clipping.min.js、setplotsvg.js），jsdom 以 file:// 加载即可，
 * 不依赖任何站点级全局脚本。
 *
 * 用法：
 *   const { loadVenn } = require("./helpers/setplot-dom.js");
 *   const window = await loadVenn();          // 等首帧渲染完成
 *   const window2 = await loadVenn({ hash: "#v=..." });  // 分享链接往返测试
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const PAGE = path.join(__dirname, "..", "..", "index.html");
const PAGE_URL = pathToFileURL(PAGE).href;

function prepareHtml() {
  return fs.readFileSync(PAGE, "utf8");
}

/**
 * 装载 SetPlotSVG 页面并等它初始化完成。
 * @param {object} [opt]
 * @param {string} [opt.hash] 追加到 URL 上的 hash（分享链接往返测试用）
 * @returns {Promise<import("jsdom").DOMWindow>} 已初始化好的 window
 */
async function loadVenn(opt) {
  const html = prepareHtml();
  const dom = new JSDOM(html, {
    url: (opt && opt.hash ? PAGE_URL + opt.hash : PAGE_URL),
    runScripts: "dangerously",
    resources: "usable",
  });
  const win = dom.window;
  stubCreateObjectURL(win);
  /* 等 setplotsvg.js 跑完首帧渲染：判据是 SVG 里出现了 path[data-mask]。 */
  for (let i = 0; i < 100; i++) {
    const svg = win.document.getElementById("vennSvg");
    if (svg && svg.querySelector("path[data-mask]")) return win;
    await new Promise(r => setTimeout(r, 20));
  }
  return win;
}

/* jsdom 没实现 URL.createObjectURL / revokeObjectURL，而导出按钮会调它。
 * 不补桩时，监听器里抛出的异常会被 jsdom 当成未捕获错误重新抛到进程上：
 * 断言全部跑完、末尾打出「N passed, 0 failed」，进程却以退出码 1 结束。
 *
 * 还要顺手掐掉 <a download> 的点击导航：a.click() 在 jsdom 里等于导航到另一个
 * Document，而 blob: 这个 URL 它解析不了，会抛 "Not implemented: navigation"。
 * 真实浏览器里带 download 的链接是直接下载、不导航，所以这里只把「带 download
 * 属性」的 click 换成空实现，普通 <a> 的跳转行为保持原样。 */
function stubCreateObjectURL(win) {
  const u = win.URL;
  if (u) {
    if (typeof u.createObjectURL !== "function") u.createObjectURL = () => "blob:stub";
    if (typeof u.revokeObjectURL !== "function") u.revokeObjectURL = () => {};
  }
  const Anchor = win.HTMLAnchorElement;
  if (Anchor && Anchor.prototype) {
    const origClick = Anchor.prototype.click;
    Anchor.prototype.click = function () {
      if (this.hasAttribute("download")) return;
      return origClick.apply(this, arguments);
    };
  }
}

module.exports = { loadVenn, PAGE, PAGE_URL, prepareHtml };