/* ============================================================================
 * SetPlotSVG (setplotsvg.js) v2
 * 在线韦恩图 / UpSet 集合绘图工具
 * 参考兼容 Venny 2.1 (Oliveros, J.C. BioinfoGP CNB-CSIC)
 * 借鉴 jvenn (Bardou et al. 2014, BMC Bioinformatics 15:293) 的交互：
 *   · 元素查找并高亮其所在区域（Find an element）
 *   · 区域太小放不下数字时用「?」占位，悬停弹出真实值
 *   · 图下方的「各列表规模 / 交集分布」统计小图表
 * 本版新增：面积正比模式（overlap weight：各区域面积 ∝ 元素数）、文字与数字拖拽定位、
 *           自定义配色、紧凑/宽松布局、常用设置一排 + 「更多」折叠
 * 技术：SVG 渲染 + polygon-clipping 区域布尔运算 + 鞋带公式面积
 * 许可证：MIT（见 LICENSE）
 * ========================================================================== */
(function () {
  "use strict";

  /* ======================== 常量 ======================== */
  var NS = "http://www.w3.org/2000/svg";

  var INITIAL_SETS = 6;   // 初始卡片数；样本数量本身不设上限

  // 5/6 组：干净花瓣图 —— 一个公共中心圆 + 各组一片互不重叠的外瓣。
  // 每个集合形状 = 中心圆 ∪ 外瓣，所以：
  //   中心圆 = 所有组共有；
  //   外瓣减去中心圆 = 该组独有。
  // 外瓣之间不重叠，因此图上只有「各组独有」和「全部共有」两类区域，
  // 不会出现区域互相覆盖；其余交集只在统计/查找/CSV 中列出。
  function petalGeom(g) {
    var r0 = 36;
    var d = g === 5 ? 86 : 84;
    var rx = d - r0 + 6;           // 瓣根伸入中心圆 6px，视觉上与圆连成一体
    var ry = g === 5 ? 30 : 26;
    var out = [];
    for (var i = 0; i < g; i++) {
      var a = i * 360 / g;
      var rad = a * Math.PI / 180;
      out.push({
        kind: "petal",
        x: 200, y: 200, rot: a,
        r0: r0, d: d, rx: rx, ry: ry,
        cx: 200 + d * Math.cos(rad),
        cy: 200 + d * Math.sin(rad)
      });
    }
    return out;
  }

  // Venny 原始几何（400x400 逻辑空间）
  var GEOMS = {
    1: [{ kind: "circle", x: 200, y: 200, r: 92 }],
    2: [
      { kind: "circle", x: 140, y: 200, r: 92 },
      { kind: "circle", x: 260, y: 200, r: 92 }
    ],
    3: [
      { kind: "circle", x: 140, y: 148, r: 92 },
      { kind: "circle", x: 260, y: 148, r: 92 },
      { kind: "circle", x: 200, y: 252, r: 92 }
    ],
    4: [
      { kind: "ellipse", x: 133, y: 215, rx: 90, ry: 141, rot: -45 },
      { kind: "ellipse", x: 193, y: 180, rx: 90, ry: 141, rot: -45 },
      { kind: "ellipse", x: 207, y: 180, rx: 90, ry: 141, rot: 45 },
      { kind: "ellipse", x: 267, y: 215, rx: 90, ry: 141, rot: 45 }
    ],
    // 5/6 组用互不重叠的花瓣图：中心为所有组共有，各花瓣向外伸展。
    // 圆/椭圆无法完整表达 5 组以上的所有交集，页面会明确提示这一点。
    5: petalGeom(5),
    6: petalGeom(6)
  };

  // 集合名称标签位置（Venny 坐标表，g=组数，i=集合索引）
  var XLABEL = {
    1: [200, 215, 160, 315],
    2: [120, 280, 200, 315],
    3: [120, 280, 200, 315],
    4: [70, 120, 280, 330]
  };
  var YLABEL = {
    1: [83, -1880, -3500, -1850],
    2: [83, 83, -3500, -1850],
    3: [27, 27, 373, -1850],
    4: [320, 40, 40, 320]
  };

  // 区域数字位置（Venny 坐标表）：xpos / ypos
  var PX = {
    1: { C1000: 200, C0100: 260, C1100: 185, C0010: 185, C1010: 140, C0110: 230, C1110: 185, C0001: 310, C1001: 180, C0101: 250, C0011: 260, C0111: 220, C1011: 212, C1101: 161, C1111: 180 },
    2: { C1000: 120, C0100: 280, C1100: 200, C0010: 185, C1010: 140, C0110: 230, C1110: 185, C0001: 310, C1001: 180, C0101: 250, C0011: 260, C0111: 220, C1011: 212, C1101: 161, C1111: 180 },
    3: { C1000: 120, C0100: 280, C1100: 200, C0010: 200, C1010: 150, C0110: 250, C1110: 200, C0001: 310, C1001: 180, C0101: 250, C0011: 260, C0111: 220, C1011: 212, C1101: 161, C1111: 180 },
    4: { C1000: 70, C0100: 140, C1100: 110, C0010: 260, C1010: 125, C0110: 200, C1110: 151, C0001: 330, C1001: 200, C0101: 275, C0011: 290, C0111: 249, C1011: 170, C1101: 230, C1111: 200 }
  };
  var PY = {
    1: { C1000: 200, C0100: -1850, C1100: -1850, C0010: -2700, C1010: -2000, C0110: -2000, C1110: -1750, C0001: -1900, C1001: -2950, C0101: -2450, C0011: -1370, C0111: -1830, C1011: -2670, C1101: -2670, C1111: -2450 },
    2: { C1000: 200, C0100: 200, C1100: 200, C0010: -2700, C1010: -2000, C0110: -2000, C1110: -1750, C0001: -1190, C1001: -2950, C0101: -2450, C0011: -1370, C0111: -1830, C1011: -2670, C1101: -2670, C1111: -2450 },
    3: { C1000: 128, C0100: 128, C1100: 128, C0010: 272, C1010: 210, C0110: 210, C1110: 182, C0001: -1900, C1001: -2950, C0101: -2450, C0011: -1370, C0111: -1830, C1011: -2670, C1101: -2670, C1111: -2450 },
    4: { C1000: 180, C0100: 95, C1100: 140, C0010: 95, C1010: 245, C0110: 137, C1110: 190, C0001: 180, C1001: 300, C0101: 245, C0011: 140, C0111: 190, C1011: 271, C1101: 271, C1111: 235 }
  };

  var DEFAULT_FILLS = ["#0000ff", "#ffff00", "#00ff00", "#ff0000", "#8e44ad", "#00bcd4"]; // 经典 Venny 配色 + 第 5/6 组
  var WHITE_FILLS = ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"];   // 默认填充＝纯白，与旧版 "Solid White" 观感一致
  var COLLECT_COLOR = ["#2563eb", "#8a8a00", "#168016", "#d32f2f", "#7c3aed", "#0e7490"]; // 列表名输入框强调色 / 统计条
  // 样本的实验分组色板（色盲友好，接近 Nature 常用配色）
  var GROUP_COLORS = ["#E69F00", "#56B4E9", "#009E73", "#CC79A7", "#F0E442", "#0072B2"];

  function makeList(i) {
    return {
      name: "List " + (i + 1), body: "", group: "",
      groupColor: GROUP_COLORS[i % GROUP_COLORS.length]
    };
  }
  var DEFAULT_NUM_COLOR = "#d33333"; // 区域数字默认颜色（与 Venny 一致的红）
  var DEFAULT_STROKE = "#000000";
  var FLOOR_NUM = 7;    // 数字最小可读字号，低于它改用「?」占位
  var FLOOR_QM = 4;     // 「?」的最小字号，再小就不画（区域太小）

  /* ======================== i18n ======================== */
  var I18N = {
    zh: {
      appName: "SetPlotSVG — 韦恩图 / UpSet 集合绘图",
      appSub: "在线集合绘图 · 不限样本数 · UpSet 图 · SVG / PNG 导出",
      tutTitle: "使用教程",
      step1: "在左侧粘贴样本列表（每行一个元素），可用「添加样本」继续增加",
      step2: "点击图中数字，左侧 Results 面板会显示该区域的所有元素",
      step3: "选择样式后，一键导出 SVG / PNG 图片",
      step4: "图上任意名称或数字都可以直接拖动换位；双击该文字即可复位，工具栏也有「重置位置」",
      step5: "勾选「面积正比」，各区域面积会按所含元素数量缩放（2 组为精确解，3–4 组为数值拟合，偏差显示在图上；5 组以上使用 UpSet 图，不支持面积正比）",
      step6: "用输入卡片右侧的 ↑↓ 调整组的顺序，韦恩图 / UpSet 与导出会同步更新",
      step7: "可选：在每张卡片填写「实验分组」并选颜色，UpSet 右侧会显示分组色块与名称；「集合大小」默认在左侧坐标轴显示每个样本的总数，也可在顶部下拉里改放到右侧（此时不显示分组，柱子上标数值）",
      privacy: "🔒 纯前端处理，数据不离开浏览器",
      upper: "UPPERCASE",
      lower: "lowercase",
      example: "载入示例",
      clearAll: "清空全部",
      undo: "↶ 撤销",
      redo: "↷ 重做",
      share: "🔗 复制分享链接",
      importHint: "💡 可拖拽 .txt / .csv 文件到任意列表框；CSV 每列会拆分为一个列表。列表元素自动去重排序。",
      importHintW: "⚖️ 面积正比已开启：各区域面积按所含元素数量缩放（2 组为精确解；3–4 组用数值拟合，图上会显示最大面积偏差）。元素写法不变，仍是每行一个。",
      importHintPetal: "🌸 5–6 组使用花瓣布局：中心为所有组共有，花瓣为各组独有，其余交集不画在图上（可在「交集分布」统计、元素查找或导出 CSV 中查看）。该布局不支持面积正比。",
      weightMode: "⚖️ 面积正比（overlap weight）",
      areaDev: "面积偏差",
      areaEmpty: "个空区域",
      areaEmpty1: "个空区域",
      areaPetal: "🌸 花瓣布局 · 5–6 组",
      areaPetalMissing: "另有 {N} 个含元素的交集未画出",
      areaPetalTitle: "5–6 组使用花瓣布局：中心为所有组共有、各花瓣为各组独有；圆/椭圆无法完整表达 5–6 组的所有交集，因此其余交集不画在图上，但统计、元素查找和 CSV 导出仍包含全部交集。面积正比模式对 5–6 组不可用。",
      viewLabel: "视图：",
      viewUpset: "UpSet 图",
      viewPetal: "花瓣图",
      viewTitle: "5–6 组可切换 UpSet 图 / 花瓣图；7 组以上只使用 UpSet 图",
      upsetLimitLabel: "交集：",
      upsetLimitTop: "前 30",
      upsetLimitAll: "全部",
      upsetTopNote: "仅显示前 {S} 个交集（共 {N} 个）",
      upsetThemeLabel: "主题：",
      themeNature: "Nature",
      themeGraphpad: "GraphPad",
      themeMinimal: "极简",
      upsetSetPosLabel: "集合大小：",
      upsetSetPosLeft: "左侧",
      upsetSetPosRight: "右侧（无分组）",
      groupPlaceholder: "实验分组",
      upsetGroup: "实验分组",
      upsetBadge: "📊 UpSet 图 · 5+ 组",
      upsetBadgeTitle: "每根柱子代表一个非空交集，高度为元素数量；底部点阵表示该交集包含哪些列表。点击柱子可在 Results 面板查看该交集的所有元素。",
      upsetEmpty: "没有非空交集",
      upsetSetSize: "集合大小",
      upsetIntersections: "交集大小",
      importHintUpset: "📊 UpSet 图：每根柱子是一个非空交集（按元素数排序），底部点阵表示它包含哪些列表；点击柱子查看元素。左侧「集合大小」轴对应每个样本的条长（可在「集合大小」下拉里把条改放到右侧，此时不显示分组、柱子上标数值），右侧色块是样本的实验分组。图中文字和数字均可拖动（双击复位）；「更多设置 → UpSet 配色」可改字体、线条和颜色。",
      areaDevTitle: "面积偏差 ≤ {D}%：只统计含元素的区域，即「各区域实测面积占比」与「元素数占比」的最大相对差。另有 {E} 个不含元素的区域仍占可见面积 —— 圆/椭圆的交叠无法压成零面积，这是本布局的固有极限。",
      areaSetwise: "当前用的是保拓扑的兜底布局：各圈面积 ∝ 各自集合规模（大集合一定大圈），区域级比例只能是近似。",
      areaBase: "⚠ 面积正比：已退回固定布局",
      areaBaseTitle: "这份数据没法在「保住每一个含元素的区域」的前提下拟合出保比例的布局，已退回原始固定几何 —— 图仍是正确的韦恩图，但面积不保证正比。取消勾选「面积正比」可关掉本条提示。",
      more: "更多",
      grpFill: "填充",
      grpText: "文字",
      grpTextColor: "文字颜色",
      grpStroke: "描边",
      grpUpset: "UpSet 配色",
      grpFillColor: "圈内填充",
      alpha: "透明度",
      line: "线宽",
      labelFont: "名称字号",
      numFont: "数字字号",
      fitNums: "数字自适应",
      family: "字体",
      transBg: "透明底",
      showPerc: "显示 %",
      pctTitle: "数字下方显示百分比",
      pctPetal: "5 组以上 UpSet 图只显示计数；百分比见悬停提示与统计面板",
      style: "样式：",
      styleColored: "Colors 彩色",
      styleCustom: "自定义填充",
      styleGray: "By % 按百分比灰度",
      styleTrans: "Transparent 透明",
      noteClick: "👆 点击区域或数字看元素；拖动文字可换位，双击复位",
      results: "Results 结果",
      copy: "复制",
      exportCsv: "导出 CSV",
      credit: "本工具参考并兼容 Venny 2.1（Oliveros, J.C. 2007-2015, BioinfoGP CNB-CSIC），并借鉴 jvenn（Bardou et al. 2014）的元素查找、? 占位与统计图表，另新增 SVG/PNG 导出、面积正比模式、拖拽排版等。",
      elements: "个元素",
      element: "个元素",
      exclusiveIn: '仅存在于 "{NAME}" 的 {N} 个元素',
      commonIn2: '"{A}" 与 "{B}" 共有的 {N} 个元素',
      commonIn3: '"{A}"、"{B}" 与 "{C}" 共有的 {N} 个元素',
      commonIn4: '"{A}"、"{B}"、"{C}" 与 "{D}" 共有的 {N} 个元素',
      commonIn5: '"{A}"、"{B}"、"{C}"、"{D}" 与 "{E}" 共有的 {N} 个元素',
      commonIn6: '"{A}"、"{B}"、"{C}"、"{D}"、"{E}" 与 "{F}" 共有的 {N} 个元素',
      commonMany: '"{NAMES}" 共有的 {N} 个元素',
      listDefault: "列表 ",
      toastCopied: "✓ 已复制到剪贴板",
      toastFailed: "✗ 操作失败",
      toastRestored: "已恢复上次会话数据",
      toastShared: "已加载分享数据",
      toastImported: "已导入文件：",
      toastUndo: "已撤销",
      toastRedo: "已重做",
      toastPosReset: "已复位文字位置",
      toastPosAllReset: "已复位全部文字位置",
      pngFail: "PNG 导出失败，请重试",
      clearConfirm: "确定清空全部列表？",
      removeConfirm: "删除这个样本？",
      keepOneSample: "至少保留一个样本",
      addSample: "添加样本",
      viewTitleNoPetal: "7 个以上样本只支持 UpSet 图",
      importList: "导入文件",
      clearList: "清除",
      resetPos: "重置位置",
      stats: "统计",
      statLists: "各列表规模",
      statRegions: "交集分布",
      statOnly1: "仅 1 组独有",
      statShared: "{N} 组共有",
      findPh: "🔍 查找元素（如 TP53 / Marilyn）",
      findHead: '查找 "{Q}"：命中 {N} 个元素，分布在 {M} 个区域',
      findNone: '未找到包含 "{Q}" 的元素',
      qmTip: "区域太小，完整数字放不下",
      densCompact: "▥ 紧凑",
      densWide: "▤ 宽松"
    },
    en: {
      appName: "SetPlotSVG",
      appSub: "Unlimited samples · UpSet for 5+ · SVG / PNG export",
      tutTitle: "How it works",
      step1: "Paste sample lists on the left (one element per row); click \"Add sample\" to add more",
      step2: "Click a number in the diagram to list its elements in the Results panel",
      step3: "Pick a style then export SVG / PNG in one click",
      step4: "Drag any label or number to reposition it; double-click it to reset, or use \"Positions\" in the toolbar",
      step5: "Tick \"Area-proportional\": every region is scaled so its area matches the number of elements it holds (exact for 2 lists, numeric fit for 3–4, with the max area error shown on the canvas; 5+ lists use an UpSet plot, which does not support area-proportional scaling)",
      step6: "Use ↑/↓ on each list card to reorder groups; the Venn / UpSet views and exports follow the new order",
      step7: "Optional: set an experimental group and colour on each card; the UpSet plot shows the colour swatch and group name on the right, and the Set size axis shows each sample's total. The Set size menu can move those bars to the right instead, which hides the groups and prints each total on its bar",
      privacy: "🔒 100% client-side, data never leaves your browser",
      upper: "UPPERCASE",
      lower: "lowercase",
      example: "Load example",
      clearAll: "Clear all",
      undo: "↶ Undo",
      redo: "↷ Redo",
      share: "🔗 Copy share link",
      importHint: "💡 Drag a .txt / .csv file onto any list box; CSV columns are split into separate lists. Duplicate elements are auto-removed.",
      importHintW: "⚖️ Area-proportional is on: each region's area is scaled to the number of elements it holds (exact for 2 lists; numeric fit for 3–4, with the max area error shown on the canvas). Element syntax is unchanged — one element per row.",
      importHintPetal: "🌸 5–6 lists use a petal layout: the centre is shared by all lists and each petal is specific to one list. Other intersections are not drawn, but remain available in the intersection statistics, element search and CSV export. Area-proportional scaling is not available in this layout.",
      weightMode: "⚖️ Area-proportional",
      areaDev: "Area error",
      areaEmpty: "empty regions",
      areaEmpty1: "empty region",
      areaPetal: "🌸 Petal layout · 5–6 lists",
      areaPetalMissing: "{N} element-bearing intersections not drawn",
      areaPetalTitle: "5–6 lists use a petal layout: the centre is shared by all lists and each petal is specific to one list. Circles/ellipses cannot express every intersection of 5–6 sets, so the remaining intersections are not drawn — but they are still included in the statistics, element search and CSV export. Area-proportional scaling is not available for 5–6 lists.",
      viewLabel: "View:",
      viewUpset: "UpSet plot",
      viewPetal: "Petal layout",
      viewTitle: "Switch between UpSet and petal layout for 5–6 lists; 7+ lists use UpSet only",
      upsetLimitLabel: "Intersections:",
      upsetLimitTop: "Top 30",
      upsetLimitAll: "All",
      upsetTopNote: "Showing top {S} of {N} intersections",
      upsetThemeLabel: "Theme:",
      themeNature: "Nature",
      themeGraphpad: "GraphPad",
      themeMinimal: "Minimal",
      upsetSetPosLabel: "Set size:",
      upsetSetPosLeft: "Left",
      upsetSetPosRight: "Right (no groups)",
      groupPlaceholder: "Group",
      upsetGroup: "Group",
      upsetBadge: "📊 UpSet plot · 5+ samples",
      upsetBadgeTitle: "Each bar is one non-empty intersection, its height is the element count, and the dot matrix shows which lists it contains. Click a bar to list its elements in Results.",
      upsetEmpty: "No non-empty intersections",
      upsetSetSize: "Set size",
      upsetIntersections: "Intersection size",
      importHintUpset: "📊 UpSet plot: each bar is a non-empty intersection (sorted by element count) and the dot matrix shows which lists it contains. Click a bar to list its elements. The Set size axis gives each sample's total (switch the Set size menu to move the bars to the right, which hides the groups and prints each total on its bar), and the colour swatches on the right show its experimental group. Every text label and number can be dragged (double-click to reset); More → UpSet colors controls font, lines and colors.",
      areaDevTitle: "Area error ≤ {D}%: measured over regions that contain elements only — the largest relative gap between a region's real area share and its element share. {E} {EW} still occupy visible area, because circle/ellipse overlaps cannot be squeezed to zero; that is an inherent limit of this layout.",
      areaSetwise: "The topology-safe fallback layout is in use: each shape's area is proportional to its own set size (a bigger set always draws a bigger circle), so region-level areas are approximate only.",
      areaBase: "⚠ Area-proportional: fixed layout used",
      areaBaseTitle: "For this data, no proportional layout could be fitted without losing a region that contains elements, so the original fixed geometry is used — the diagram is still a correct Venn diagram, but its areas are not proportional. Untick \"Area-proportional\" to hide this notice.",
      more: "More",
      grpFill: "Fill",
      grpText: "Text",
      grpTextColor: "Text color",
      grpStroke: "Stroke",
      grpUpset: "UpSet colors",
      grpFillColor: "Circle fill",
      alpha: "Opacity",
      line: "Line",
      labelFont: "Label size",
      numFont: "Number size",
      fitNums: "Fit numbers",
      family: "Font",
      transBg: "Transp. bg",
      showPerc: "Show %",
      pctTitle: "Show percentage under the count",
      pctPetal: "5+ sets show counts only in the UpSet plot; hover or use Statistics for percentages",
      style: "Style:",
      styleColored: "Colors",
      styleCustom: "Custom fill",
      styleGray: "By % (gray)",
      styleTrans: "Transparent",
      noteClick: "👆 Click a region or number for its elements; drag a text to move it, double-click to reset",
      results: "Results",
      copy: "Copy",
      exportCsv: "Export CSV",
      credit: "Inspired by & compatible with Venny 2.1 (Oliveros, J.C. 2007-2015, BioinfoGP CNB-CSIC); borrows element search, \"?\" placeholders and the statistics charts from jvenn (Bardou et al. 2014). Adds SVG/PNG export, area-proportional layout, draggable labels.",
      elements: "elements",
      element: "element",
      exclusiveIn: '{N} element{s} included exclusively in "{NAME}"',
      commonIn2: '{N} common element{s} in "{A}" and "{B}"',
      commonIn3: '{N} common element{s} in "{A}", "{B}" and "{C}"',
      commonIn4: '{N} common element{s} in "{A}", "{B}", "{C}" and "{D}"',
      commonIn5: '{N} common element{s} in "{A}", "{B}", "{C}", "{D}" and "{E}"',
      commonIn6: '{N} common element{s} in "{A}", "{B}", "{C}", "{D}", "{E}" and "{F}"',
      commonMany: '{N} common element{s} in {NAMES}',
      listDefault: "List ",
      toastCopied: "✓ Copied!",
      toastFailed: "✗ Failed",
      toastRestored: "Last session restored",
      toastShared: "Shared data loaded",
      toastImported: "Imported: ",
      toastUndo: "Undone",
      toastRedo: "Redone",
      toastPosReset: "Position reset",
      toastPosAllReset: "All positions reset",
      pngFail: "PNG export failed, please retry",
      clearConfirm: "Clear all lists?",
      removeConfirm: "Remove this sample?",
      keepOneSample: "Keep at least one sample",
      addSample: "Add sample",
      viewTitleNoPetal: "UpSet plot only for 7 or more samples",
      importList: "Import file",
      clearList: "Clear",
      resetPos: "Positions",
      stats: "Statistics",
      statLists: "Size of each list",
      statRegions: "Intersection distribution",
      statOnly1: "specific to 1 list",
      statShared: "shared by {N}",
      findPh: "🔍 Find an element (e.g. TP53)",
      findHead: 'Find "{Q}": {N} element(s) in {M} region(s)',
      findNone: 'No element matches "{Q}"',
      qmTip: "too small for the full number",
      densCompact: "▥ Compact",
      densWide: "▤ Wide"
    }
  };

  /* ======================== 状态 ======================== */
  var pc = window.polygonClipping;
  var state = {
    lists: Array.from({ length: INITIAL_SETS }, function (_, i) {
      return { name: "List " + (i + 1), body: "", group: "", groupColor: GROUP_COLORS[i % GROUP_COLORS.length] };
    }),
    active: [],                 // 有内容的样本在 lists 中的下标（按卡片顺序）
    samples: [],                // active 对应的样本对象，图表按它绘制
    activeCount: 0,
    counts: [],                 // 各样本元素个数（只含有内容的样本）
    listCounts: [],             // 每张输入卡片的元素个数（含空卡片，用于卡片计数）
    hasList: [],
    classified: new Map(),      // element -> 成员位串键 'C101…'
    regionCounts: {},           // 'C101…' -> 元素个数
    totalUnique: 0,
    groups: 1,
    regionPolys: {},            // 'C1100' -> polygon (ring array) | null
    regionAreas: {},            // 'C1100' -> area
    regionAnchors: {},          // 'C1100' -> [x,y]（面积正比模式按区域真实形状算；否则 null → 用 PX/PY 表）
    layout: null,               // 当前布局 { shapes, labels, dynamic }
    fitDev: 0,                  // 面积正比模式实测的最大面积偏差（0.03 = 3%）
    fitEmpty: 0,                // 面积正比模式中「不含元素却仍有可见面积」的区域个数
    areaProp: false,            // 面积正比模式（overlap weight）
    style: {
      mode: "custom", perc: true, width: 3,
      labelSize: 22,   // 集合名称字号（400 逻辑坐标空间）
      numSize: 16,     // 区域数字字号
      fit: true,       // 数字自适应：超出所在区域时自动等比缩小，缩不下则用「?」
      family: "sans-serif",
      labelColor: "",                 // "" = 自动（彩色模式跟随圈内填充色，否则黑色）
      numColor: DEFAULT_NUM_COLOR,
      stroke: DEFAULT_STROKE,
      fills: WHITE_FILLS.slice(),     // 各列表圈内填充色（默认纯白）
      alpha: 50,                      // 填充透明度（%）
      // UpSet 可自定义配色（主题会重置这 5 个值，之后可手动改）
      upsetMain: "#1F4E79",
      upsetDim: "#B6C1CE",
      upsetSet: "#5B9BD5",
      upsetText: "#222",
      upsetLine: "#222"
    },
    drag: { label: {}, num: {} }, // 文字位置偏移：label:i / num:C1100 -> [dx,dy]
    selected: null,
    found: [],                    // 查找命中的区域 key
    search: "",

    upsetLimit: 30,               // UpSet 默认只画前 30 个交集；0 = 全部
    upsetTheme: "nature",         // UpSet 主题：nature | graphpad | minimal
    upsetSetPos: "left"           // Set size 条位置：left（左侧轴）| right（右侧分组位，不显示分组）
  };
  var ui = { compact: true, more: false, stats: true };
  var hist = { undo: [], redo: [] };
  var histTimer = null;
  var LANG = "zh";
  var fileTarget = null; // 文件导入目标列表索引

  var $ = function (id) { return document.getElementById(id); };
  var el = document.documentElement;

  /* ======================== 集合解析 ======================== */
  // 成员键：'C'+位串。1–4 组沿用 Venny 4 位键；5–6 组用 6 位键；
// 7 个以上样本只在 UpSet 中使用，键长 = 样本数，不依赖 32 位整数掩码。
  function maskWidth(g) { return g <= 4 ? 4 : (g <= 6 ? 6 : g); }
  function maskKeyFor(mask, g) {
    var w = maskWidth(g), s = "";
    for (var i = 0; i < w; i++) s += (mask & (1 << i)) ? "1" : "0";
    return "C" + s;
  }
  function maskKey(mask) { return maskKeyFor(mask, state.groups); }
  function regionCard(key) {
    var c = 0;
    for (var i = 1; i < key.length; i++) if (key.charAt(i) === "1") c++;
    return c;
  }

  // 解析一个列表：每行一个元素（自动去重）
  function parseSet(body) {
    var s = new Set();
    body.split(/\r?\n/).forEach(function (raw) {
      var t = raw.trim();
      if (t.length) s.add(t);
    });
    return s;
  }

  function sampleAt(i) {
    if (state.samples && state.samples[i]) return state.samples[i];
    return { name: "", body: "", group: "", groupColor: GROUP_COLORS[i % GROUP_COLORS.length] };
  }
  function sampleName(i) {
    var s = sampleAt(i);
    return (s.name || "").trim() || (LANG === "zh" ? "列表 " + (i + 1) : "List " + (i + 1));
  }

  function classify() {
    // 只把「有内容」的卡片视为样本；空卡片不进入图，也不占交集位。
    var allSets = state.lists.map(function (l) { return parseSet(l.body); });
    var active = [];
    for (var i = 0; i < state.lists.length; i++) {
      if (allSets[i].size) active.push(i);
    }
    var sets = active.map(function (idx) { return allSets[idx]; });
    var g = active.length;
    var displayG = Math.max(1, g);
    var width = maskWidth(displayG);
    var members = new Map();     // element -> 样本位置数组
    sets.forEach(function (set, pos) {
      set.forEach(function (name) {
        var arr = members.get(name);
        if (!arr) { arr = []; members.set(name, arr); }
        arr.push(pos);
      });
    });
    var classified = new Map(), countsMap = {}, total = 0;
    var bits = new Array(width);
    members.forEach(function (arr, name) {
      for (var b = 0; b < width; b++) bits[b] = "0";
      for (var q = 0; q < arr.length; q++) bits[arr[q]] = "1";
      var k = "C" + bits.join("");
      classified.set(name, k);
      countsMap[k] = (countsMap[k] || 0) + 1;
      total++;
    });
    state.active = active;
    state.samples = active.map(function (idx) { return state.lists[idx]; });
    state.activeCount = g;
    state.listCounts = allSets.map(function (s) { return s.size; });
    state.counts = sets.map(function (s) { return s.size; });
    state.hasList = sets.map(function (s) { return s.size > 0; });
    state.classified = classified;
    state.regionCounts = countsMap;
    state.totalUnique = total;
    state.groups = displayG;
  }

  /* ======================== 数值显示 ======================== */
  function fmtNum(v) {
    if (!isFinite(v)) return "0";
    var r = Math.round(v * 100) / 100;
    return Number.isInteger(r) ? String(r) : String(r);
  }
  function regionValue(key) { return state.regionCounts[key] || 0; }
  function regionBase() { return state.totalUnique; }
  function regionPct(key) {
    var base = regionBase();
    return base ? Math.round(regionValue(key) / base * 1000) / 10 : 0;
  }
  function regionTitle(key) {
    var names = [];
    for (var i = 1; i < key.length; i++) {
      if (key.charAt(i) === "1") names.push(sampleName(i - 1));
    }
    return names.join(" ∩ ");
  }

  /* ======================== 颜色工具 ======================== */
  function hexToRgb(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    if (!isFinite(n)) return { r: 0, g: 0, b: 0 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")";
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var h = 0, s = 0, l = (mx + mn) / 2;
    var d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h, s: s, l: l };
  }
  function hslToHex(h, s, l) {
    function f(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (!s) r = g = b = l;
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
    }
    function to(v) { var x = Math.round(v * 255).toString(16); return x.length < 2 ? "0" + x : x; }
    return "#" + to(r) + to(g) + to(b);
  }
  // 由圈内填充色推导可读的名称颜色（同色相、压暗到深色）
  // 默认填充是纯白，无色相可跟随 → 直接回黑，避免出现「洗掉」的灰字
  function autoLabelColor(i) {
    var fill = (state.style.fills && state.style.fills[i]) || DEFAULT_FILLS[i];
    var c = hexToRgb(fill);
    var hsl = rgbToHsl(c.r, c.g, c.b);
    if (hsl.s < 0.15) return hsl.l > 0.55 ? "#000000" : "#f2f2f2";
    return hslToHex(hsl.h, Math.min(0.95, hsl.s * 1.1), 0.34);
  }
  function labelFill(i) {
    if (state.style.labelColor) return state.style.labelColor;
    return (state.style.mode === "colors" || state.style.mode === "custom") ? autoLabelColor(i) : "#000000";
  }
  function numFill() { return state.style.numColor || DEFAULT_NUM_COLOR; }

  // 填充模式取值归一化。旧版用 "BW"（Solid White）/"colored"，新版为 "custom"/"colors"，
  // 本地缓存与分享链接里都可能还是旧值，必须映射，否则取色器会「看起来没生效」。
  var MODES = ["custom", "colors", "gray", "transparent"];
  function normalizeMode(m) {
    if (m === "colored") return "colors";
    if (m === "BW") return "custom";
    return MODES.indexOf(m) >= 0 ? m : "custom";
  }

  /* ======================== 几何 / 布尔运算 ======================== */
  function ringOfCircle(cx, cy, r, pts) {
    var ring = [];
    for (var i = 0; i < pts; i++) {
      var t = i / pts * 2 * Math.PI;
      ring.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    return ring;
  }
  function ringOfEllipse(cx, cy, rx, ry, rot, pts) {
    var ring = [], rad = (rot || 0) * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    for (var i = 0; i < pts; i++) {
      var t = i / pts * 2 * Math.PI;
      var ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      ring.push([cx + ex * c - ey * s, cy + ex * s + ey * c]);
    }
    return ring;
  }
  // 统一返回 MultiPolygon：普通形状是 1 个 polygon；花瓣形状是「中心圆 + 外瓣」两个 polygon
  function shapeToPolygon(shape, pts) {
    pts = pts || 360;
    if (shape.kind === "petal") {
      return [
        [ringOfCircle(shape.x, shape.y, shape.r0, pts)],
        [ringOfEllipse(shape.cx, shape.cy, shape.rx, shape.ry, shape.rot, pts)]
      ];
    }
    if (shape.kind === "circle") return [[ringOfCircle(shape.x, shape.y, shape.r, pts)]];
    return [[ringOfEllipse(shape.x, shape.y, shape.rx, shape.ry, shape.rot, pts)]];
  }

  // 区域 = (∩ in-set polys) − (∪ out-set polys)
  // 返回 MultiPolygon（数组的数组的数组）：花瓣布局的一个区域可能被切成多块，
  // 中间结果不能只取 [0]，否则会丢掉其余连通块（曾被吞掉整片「独有」区域）。
  function regionPoly(maskInt, groupShapes) {
    var inPolys = [], outPolys = [];
    for (var i = 0; i < groupShapes.length; i++) {
      var p = shapeToPolygon(groupShapes[i]);
      if (maskInt & (1 << i)) inPolys.push(p); else outPolys.push(p);
    }
    if (!inPolys.length) return null;
    var cur = inPolys[0];
    for (var a = 1; a < inPolys.length; a++) {
      var r = pc.intersection(cur, inPolys[a]);
      if (!r || !r.length) return null;
      cur = r;
    }
    for (var b = 0; b < outPolys.length; b++) {
      var d = pc.difference(cur, outPolys[b]);
      if (!d || !d.length) return null;
      cur = d;
    }
    return cur;
  }

  function ringArea(ring) {
    var a = 0;
    for (var i = 0; i < ring.length; i++) {
      var x1 = ring[i][0], y1 = ring[i][1];
      var x2 = ring[(i + 1) % ring.length][0], y2 = ring[(i + 1) % ring.length][1];
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
  }
  // poly 统一为 MultiPolygon：每个 polygon 的第一个环是外环，其余是洞
  function polyArea(poly) {
    var total = 0;
    for (var p = 0; p < poly.length; p++) {
      var rings = poly[p];
      for (var i = 0; i < rings.length; i++) total += (i === 0 ? ringArea(rings[i]) : -ringArea(rings[i]));
    }
    return total;
  }
  function polyToPath(poly) {
    return poly.map(function (polygon) {
      return polygon.map(function (ring) {
        return ring.map(function (p, i) {
          return (i === 0 ? "M" : "L") + p[0].toFixed(2) + " " + p[1].toFixed(2);
        }).join("") + "Z";
      }).join("");
    }).join("");
  }

  /* ==================== 面积正比布局（overlap weight） ====================
   * 让每个区域的多边形面积正比于该区域的元素数：
   *   2 组：解析解 —— r1/r2 由两个集合的总量唯一确定，圆心距 d 由交集面积二分求出，精确。
   *   3 组：圆有 9 个参数、去掉平移与缩放的 3 个规范自由度后是 6，对 7 个区域面积超定 → 数值拟合。
   *   4 组：沿用 Venny 的 ±45° 椭圆，只调位置与半轴 → 数值拟合。
   * 拟合用「网格采样」估面积（比 polygon-clipping 快两个数量级），最终偏差用真实多边形实测。
   * 只有面积比例有意义，所以最后统一缩放到固定跨度并居中，与元素总量无关。
   */
  var FIT_GRID = 96;      // 采样网格 N×N（拟合用；最终偏差仍按真实多边形实测）
  var FIT_BUDGET = 200;   // 单次拟合时间预算（ms）。实测再加预算对 4 组几乎没有改善，不必拖着输入卡顿
  var FIT_STARTS = 4;     // 多起点次数（避开局部极小）
  var FIT_ROT_SPREAD = 28;// 椭圆旋转角相对基座的最大偏移（度）。给太大反而会把 4 组的拓扑搞散
  var FIT_SIMPLEX = 36;   // 单纯形初始步长（逻辑坐标单位）
  var FIT_MIN_REL = 0.02; // 偏差评估的占比下限（更小的区域无法按比例表达）
  var fitSeed = {};       // 上次拟合结果 → 作为下次起点，连续输入时逐步收敛

  function LAY() {
    var g = state.groups;
    return state.layout || { shapes: GEOMS[g], labels: g > 4 ? labelPositionsFor(GEOMS[g]) : null, dynamic: false };
  }

  // 两圆交叠面积（lens），关于圆心距 d 单调递减
  function circleLensArea(r1, r2, d) {
    if (d >= r1 + r2) return 0;
    var rm = Math.min(r1, r2);
    if (d <= Math.abs(r1 - r2)) return Math.PI * rm * rm;
    var c1 = Math.max(-1, Math.min(1, (d * d + r1 * r1 - r2 * r2) / (2 * d * r1)));
    var c2 = Math.max(-1, Math.min(1, (d * d + r2 * r2 - r1 * r1) / (2 * d * r2)));
    var tri = (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2);
    return r1 * r1 * Math.acos(c1) + r2 * r2 * Math.acos(c2) - 0.5 * Math.sqrt(Math.max(0, tri));
  }

  function shapeHalfExtents(s) {
    if (s.kind === "petal") {
      var pe = Math.max(s.r0, s.d + s.rx);
      return [pe, pe];
    }
    if (s.kind === "circle") return [s.r, s.r];
    var rad = (s.rot || 0) * Math.PI / 180;
    var c = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
    return [Math.sqrt(s.rx * s.rx * c * c + s.ry * s.ry * sn * sn),
            Math.sqrt(s.rx * s.rx * sn * sn + s.ry * s.ry * c * c)];
  }

  function shapesBBox(shapes) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    shapes.forEach(function (s) {
      var h = shapeHalfExtents(s);
      if (s.x - h[0] < x0) x0 = s.x - h[0];
      if (s.x + h[0] > x1) x1 = s.x + h[0];
      if (s.y - h[1] < y0) y0 = s.y - h[1];
      if (s.y + h[1] > y1) y1 = s.y + h[1];
    });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // 统一缩放到最大跨度 300 并居中（等比缩放不改变面积比例）
  function normalizeShapes(shapes) {
    var b = shapesBBox(shapes);
    var span = Math.max(b.x1 - b.x0, b.y1 - b.y0);
    if (!(span > 0)) return shapes;
    var k = 300 / span;
    var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    return shapes.map(function (s) {
      var o = { kind: s.kind, x: (s.x - cx) * k + 200, y: (s.y - cy) * k + 200 };
      if (s.kind === "circle") o.r = s.r * k;
      else { o.rx = s.rx * k; o.ry = s.ry * k; o.rot = s.rot; }
      return o;
    });
  }

  function setInside(s, x, y) {
    var dx = x - s.x, dy = y - s.y;
    if (s.kind === "petal") {
      if (dx * dx + dy * dy <= s.r0 * s.r0) return true;
      var edx = x - s.cx, edy = y - s.cy;
      var era = (s.rot || 0) * Math.PI / 180, ec = Math.cos(era), es = Math.sin(era);
      var eu = (ec * edx + es * edy) / s.rx, ev = (-es * edx + ec * edy) / s.ry;
      return eu * eu + ev * ev <= 1;
    }
    if (s.kind === "circle") return dx * dx + dy * dy <= s.r * s.r;
    var rad = (s.rot || 0) * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad);
    var u = (c * dx + sn * dy) / s.rx, v = (-sn * dx + c * dy) / s.ry;
    return u * u + v * v <= 1;
  }

  // 网格采样：返回「掩码 -> 面积」（不做布尔运算，比真实多边形快得多）
  function sampleAreas(shapes, g) {
    var N = FIT_GRID, cell = (400 / N) * (400 / N);
    var sums = new Array(1 << g);
    for (var z = 0; z < sums.length; z++) sums[z] = 0;
    for (var iy = 0; iy < N; iy++) {
      var y = (iy + 0.5) * 400 / N;
      for (var ix = 0; ix < N; ix++) {
        var x = (ix + 0.5) * 400 / N, m = 0;
        for (var k = 0; k < g; k++) if (setInside(shapes[k], x, y)) m |= 1 << k;
        sums[m] += cell;
      }
    }
    return sums;
  }

  // 从形状中心沿 (dx,dy) 到轮廓的距离
  function shapeRadiusAlong(s, dx, dy) {
    if (s.kind === "petal") return Math.max(s.r0, s.d + s.rx);
    if (s.kind === "circle") return s.r;
    var rad = (s.rot || 0) * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad);
    var ex = c * dx + sn * dy, ey = -sn * dx + c * dy;
    var q = Math.sqrt((ex / s.rx) * (ex / s.rx) + (ey / s.ry) * (ey / s.ry));
    return q > 1e-9 ? 1 / q : 0;
  }

  // 点是否落在形状内（圆/椭圆通用：比较「到中心的距离」与「沿该方向到轮廓的距离」）
  function shapeCovers(s, px, py) {
    var vx = px - s.x, vy = py - s.y, len = Math.sqrt(vx * vx + vy * vy);
    if (len < 1e-6) return true;
    return len <= shapeRadiusAlong(s, vx / len, vy / len) + 0.001;
  }

  // 集合名称的象限偏好（角度；SVG 坐标 y 向下，负角＝向上），与固定几何的 XLABEL/YLABEL 一致
  var LABEL_DIR = { 2: [180, 0], 3: [215, 325, 90], 4: [135, 225, 315, 45] };

  // 集合名称位置：沿偏好方向「一直走到所有形状之外」再落名字。
  // 早先只挑「离其它形状最远」的方向，遇到嵌套/大面积重叠的 4 组时，名字仍落在别的圈里
  // （内层形状往外挪 24px 依然在外层椭圆内部）——现在改为射线步进，走到全部形状之外为止。
  function labelPositionsFor(shapes) {
    var g = shapes.length;
    if (g === 1) {
      var only = shapes[0];
      return [[Math.max(24, Math.min(376, only.x)), Math.max(14, only.y - only.r - 24)]];
    }
    // 花瓣图：名称固定放在每片花瓣的外侧，不会互相挤压
    if (shapes[0] && shapes[0].kind === "petal") {
      return shapes.map(function (s) {
        var rad = (s.rot || 0) * Math.PI / 180, dist = s.d + s.rx + 16;
        return [
          Math.max(26, Math.min(374, 200 + Math.cos(rad) * dist)),
          Math.max(16, Math.min(386, 200 + Math.sin(rad) * dist))
        ];
      });
    }
    var pref = LABEL_DIR[g] || [];
    var placed = [];
    return shapes.map(function (s, i) {
      var want = (pref[i] !== undefined ? pref[i] : 360 / g * i) * Math.PI / 180;
      var best = null, bestScore = -Infinity;
      for (var k = -4; k <= 4; k++) {                       // 偏好方向 ±40° 内找
        var t = want + k * 10 * Math.PI / 180;
        var dx = Math.cos(t), dy = Math.sin(t);
        var reach = shapeRadiusAlong(s, dx, dy) + 22, steps = 0;
        while (steps < 90 && shapes.some(function (o) { return shapeCovers(o, s.x + dx * reach, s.y + dy * reach); })) {
          reach += 4; steps++;
        }
        var px = s.x + dx * reach, py = s.y + dy * reach;
        var clearMin = Infinity;
        for (var j = 0; j < g; j++) {
          var o2 = shapes[j];
          var vx = px - o2.x, vy = py - o2.y, len = Math.sqrt(vx * vx + vy * vy);
          var rj = len < 1e-6 ? 0 : shapeRadiusAlong(o2, vx / len, vy / len);
          if (len - rj < clearMin) clearMin = len - rj;
        }
        var score = (clearMin >= 8 ? 1000 : 0) + clearMin * 2;   // 必须真的在圈外
        score -= Math.abs(k) * 12;                               // 别偏离偏好方向
        score -= reach * 0.05;                                   // 别推得太远
        for (var q = 0; q < placed.length; q++) {                // 别和已放好的名字挤在一起
          var dd = Math.sqrt((px - placed[q][0]) * (px - placed[q][0]) + (py - placed[q][1]) * (py - placed[q][1]));
          if (dd < 58) score -= (58 - dd) * 6;
        }
        score -= (Math.max(0, 26 - px) + Math.max(0, px - 374) +
                  Math.max(0, 16 - py) + Math.max(0, py - 386)) * 3;  // 别被画布边界裁掉
        if (score > bestScore) { bestScore = score; best = [px, py]; }
      }
      if (!best) best = [200, 40];
      var out = [Math.max(26, Math.min(374, best[0])), Math.max(16, Math.min(386, best[1]))];
      placed.push(out);
      return out;
    });
  }

  // 2 组解析解
  function twoSetExact(targets) {
    var a1 = targets[1] || 0, a2 = targets[2] || 0, a12 = targets[3] || 0;
    var totA = a1 + a12, totB = a2 + a12;
    if (!(totA > 0) || !(totB > 0)) return null;
    var r1 = Math.sqrt(totA / Math.PI), r2 = Math.sqrt(totB / Math.PI);
    var rm = Math.min(r1, r2), d;
    if (a12 >= Math.PI * rm * rm - 1e-9) {
      d = Math.abs(r1 - r2);                       // 一个集合完全包含另一个
    } else {
      var lo = Math.abs(r1 - r2), hi = r1 + r2;
      for (var it = 0; it < 90; it++) {
        var mid = (lo + hi) / 2;
        if (circleLensArea(r1, r2, mid) > a12) lo = mid; else hi = mid;
      }
      d = (lo + hi) / 2;
    }
    return [
      { kind: "circle", x: -d / 2, y: 0, r: r1 },
      { kind: "circle", x: d / 2, y: 0, r: r2 }
    ];
  }

  // 3/4 组数值拟合：多起点 + 坐标轮换模式搜索 + 逐步收缩步长，带时间预算
  // 椭圆的旋转角也作为自由参数：4 组有 15 个区域，若把 rot 钉死在 ±45°，
  // 可调自由度（13）少于方程数（14），数学上就无解，怎么拟合都会有区域严重失真。
  function numericFit(g, targets, total) {
    var base = GEOMS[g];
    var offsets = [], off = 0;
    base.forEach(function (s) {
      offsets.push(off);
      off += (s.kind === "circle") ? 3 : 5;   // x, y, rx, ry, rot
    });
    var N = off;
    function pack(shapes) {
      var q = [];
      shapes.forEach(function (s) {
        q.push(s.x, s.y, s.kind === "circle" ? s.r : s.rx);
        if (s.kind !== "circle") q.push(s.ry, s.rot);
      });
      return q;
    }
    var pInit = pack(base);

    var tp = [];
    for (var m = 0; m < (1 << g); m++) tp[m] = (targets[m] || 0) / total;
    var minPos = 1;
    for (var m2 = 1; m2 < (1 << g); m2++) if (tp[m2] > 0 && tp[m2] < minPos) minPos = tp[m2];
    var ref = Math.max(minPos, FIT_MIN_REL);

    function toShapes(q) {
      var out = [];
      for (var i = 0; i < g; i++) {
        var o = offsets[i];
        if (base[i].kind === "circle") {
          out.push({ kind: "circle", x: q[o], y: q[o + 1], r: Math.max(4, q[o + 2]) });
        } else {
          // 旋转角夹在基座附近：自由度需要它，但放太开会让 4 组的 15 区域拓扑散掉（区域塌成 0 面积）
          var rot = base[i].rot;
          if (FIT_ROT_SPREAD > 0) {
            rot = Math.max(base[i].rot - FIT_ROT_SPREAD, Math.min(base[i].rot + FIT_ROT_SPREAD, q[o + 4]));
          }
          out.push({ kind: "ellipse", x: q[o], y: q[o + 1], rx: Math.max(4, q[o + 2]), ry: Math.max(4, q[o + 3]), rot: rot });
        }
      }
      return out;
    }
    function err(q) {
      var sums = sampleAreas(toShapes(q), g);
      var tot = 0;
      for (var i = 1; i < sums.length; i++) tot += sums[i];
      if (!(tot > 0)) return 1e9;
      var e = 0;
      for (var i2 = 1; i2 < sums.length; i2++) {
        var act = sums[i2] / tot, tg = tp[i2];
        if (tg <= 0) { var z = act / ref; e += z * z; continue; }   // 本该为空：尽量压掉
        var rel = (act - tg) / Math.max(tg, ref);
        // 非对称惩罚：区域「塌陷」比「偏大」严重得多 —— 塌了这块区域就不存在了，
        // 数字无处安放、图形也不再是那张韦恩图；偏大只是比例失真。所以宁可略大不可消失。
        e += rel * rel * (act < tg ? 2.5 : 1);
        if (act < tg * 0.1) e += 1.2;
      }
      // 轻微倾向居中，避免整体漂出画布（不影响面积比例）
      var cx = 0, cy = 0;
      for (var i3 = 0; i3 < g; i3++) { cx += q[offsets[i3]]; cy += q[offsets[i3] + 1]; }
      cx /= g; cy /= g;
      e += 1e-4 * ((cx - 200) * (cx - 200) + (cy - 200) * (cy - 200)) / 100;
      return e;
    }

    // 起点 ①上次拟合结果（连续输入时通常已经很近）
    //      ②基座（拓扑正确，但尺寸完全不理数据）
    //      ③尺度先验：把每个形状的半轴按「该集合目标占比 ÷ 基座占比」的平方根缩放，保持拓扑
    //      ④⑤基座的温和扰动（幅度刻意收小 —— 把 4 组拓扑搞散比拟合不足更糟）
    var starts = [];
    var seed = fitSeed[g];
    if (seed && seed.length === N) starts.push(seed.slice());
    starts.push(pInit.slice());

    var baseAreas = sampleAreas(base, g);
    var baseTotal = 0;
    for (var m7 = 1; m7 < (1 << g); m7++) baseTotal += baseAreas[m7];
    var prior = pInit.slice();
    for (var i8 = 0; i8 < g; i8++) {
      var bs = 0, tset = 0, o8 = offsets[i8];
      for (var m8 = 1; m8 < (1 << g); m8++) {
        if (m8 & (1 << i8)) { bs += baseAreas[m8]; tset += targets[m8] || 0; }
      }
      var k = (bs > 0 && baseTotal > 0 && tset > 0)
        ? Math.max(0.5, Math.min(2, Math.sqrt((tset / total) / (bs / baseTotal)))) : 1;
      prior[o8 + 2] *= k;
      if (base[i8].kind !== "circle") prior[o8 + 3] *= k;
    }
    starts.push(prior);

    var lcg = (function () { var s = 20260921; return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
    while (starts.length < FIT_STARTS) {
      var q0 = pInit.slice();
      for (var i10 = 0; i10 < N; i10++) {
        var w = i10 % 5;
        if (w === 4) q0[i10] += (lcg() - 0.5) * 14;                 // 旋转角
        else if (w === 0 || w === 1) q0[i10] += (lcg() - 0.5) * 18; // 位置
        else q0[i10] *= 1 + (lcg() - 0.5) * 0.26;                    // 半轴
      }
      starts.push(q0);
    }

    // Nelder–Mead 单纯形法逐起点下降。
    // 为什么不用坐标轮换：4 组的参数高度耦合，坐标轮换几乎不动（实测 5s 仍偏差 ~98%），
    // 单纯形能沿对角线方向同时调多个参数，同一预算下质量高一个数量级。
    function nelderMead(x0, budget) {
      var n = x0.length;
      var sim = [x0.slice()], val = [err(x0)];
      for (var fi = 0; fi < n; fi++) {
        var p = x0.slice();
        p[fi] += (fi % 5 === 4) ? FIT_SIMPLEX * 1.2 : FIT_SIMPLEX;
        sim.push(p); val.push(err(p));
      }
      var deadline = Date.now() + budget;
      while (Date.now() < deadline) {
        var ord = val.map(function (_, k) { return k; }).sort(function (a, b) { return val[a] - val[b]; });
        sim = ord.map(function (k) { return sim[k]; });
        val = ord.map(function (k) { return val[k]; });
        // 单纯形已经很小 → 收敛，提前退出（省预算给别的起点）
        var span = 0;
        for (var sk = 0; sk < n; sk++) span += Math.abs(sim[n][sk] - sim[0][sk]);
        if (span < 0.03 * n) return sim[0];
        var c = new Array(n);
        for (var j2 = 0; j2 < n; j2++) {
          var s = 0;
          for (var k2 = 0; k2 < n; k2++) s += sim[k2][j2];
          c[j2] = s / n;
        }
        var xr = new Array(n), xe = new Array(n), xc = new Array(n);
        for (var j3 = 0; j3 < n; j3++) {
          xr[j3] = c[j3] + (c[j3] - sim[n][j3]);            // 反射
          xe[j3] = c[j3] + 2 * (c[j3] - sim[n][j3]);        // 扩张
          xc[j3] = c[j3] + 0.5 * (sim[n][j3] - c[j3]);      // 收缩
        }
        var fr = err(xr);
        if (fr < val[n - 1] && fr >= val[0]) { sim[n] = xr; val[n] = fr; continue; }
        if (fr < val[0]) {
          var fe = err(xe);
          if (fe < fr) { sim[n] = xe; val[n] = fe; } else { sim[n] = xr; val[n] = fr; }
          continue;
        }
        var fc = err(xc);
        if (fc < val[n]) { sim[n] = xc; val[n] = fc; continue; }
        for (var k3 = 1; k3 <= n; k3++) {                   // 整体向最优收缩
          var w = new Array(n);
          for (var j4 = 0; j4 < n; j4++) w[j4] = sim[0][j4] + 0.5 * (sim[k3][j4] - sim[0][j4]);
          sim[k3] = w; val[k3] = err(w);
        }
      }
      var bi = 0;
      for (var k4 = 1; k4 <= n; k4++) if (val[k4] < val[bi]) bi = k4;
      return sim[bi];
    }

    var deadline = Date.now() + FIT_BUDGET;
    var best = null, bestE = Infinity;
    for (var si = 0; si < starts.length; si++) {
      var stop = si === starts.length - 1 ? deadline : Date.now() + Math.round(FIT_BUDGET / starts.length);
      var budget = Math.max(0, stop - Date.now());
      if (bestE < 1e-4) break;                              // 已经贴住目标，不必再花时间
      var r = nelderMead(starts[si], budget);
      var e = err(r);
      if (e < bestE) { bestE = e; best = r.slice(); }
    }
    // 候选打分：既看最大偏差（徽标口径），也看「显著区域有没有被拟合掉」。
    // 后者是硬伤 —— 一个占 36% 元素数的区域在图上整块消失，比「面积偏 80%」严重得多，
    // 这种情况宁可换布局，也不能交出去。
    function score(q) {
      var sums = sampleAreas(toShapes(q), g);
      var tot = 0;
      for (var i = 1; i < sums.length; i++) tot += sums[i];
      if (!(tot > 0)) return { ok: false, dev: 9 };
      var worst = 0, extra = 0, ok = true;
      for (var i2 = 1; i2 < sums.length; i2++) {
        var act = sums[i2] / tot, tg = tp[i2];
        if (tg <= 0) { if (act > ref) extra++; continue; }
        var dv = Math.abs(act - tg) / Math.max(tg, ref);
        if (dv > worst) worst = dv;
        // 占比 ≥ 2% 的区域，实测面积不得低于应得的 1/4（0 面积也算不合格）
        if (tg >= FIT_MIN_REL && act < 0.25 * tg) ok = false;
      }
      return { ok: ok, dev: worst + 0.15 * extra };
    }

    var sFit = score(best), sPrior = score(prior);
    var pickPrior = sPrior.ok && (!sFit.ok || sPrior.dev < sFit.dev);
    if (pickPrior) {
      fitSeed[g] = prior.slice();
      return { shapes: toShapes(prior), setwise: true };
    }
    if (!sFit.ok) return { shapes: null, setwise: false };  // 两个候选都保不住区域 → 上层退回固定布局
    fitSeed[g] = best.slice();
    return { shapes: toShapes(best), setwise: false };
  }

  function fitAreaProportional(g) {
    // 5–6 组：花瓣布局的形状自由度过低，无法在保住所有区域的前提下拟合面积比例，
    // 硬拟合只会把图搞散。直接固定布局，并在徽标上说明。
    if (g > 4) {
      return { shapes: GEOMS[g], labels: labelPositionsFor(GEOMS[g]), dynamic: false, mode: "petal" };
    }
    var targets = [], total = 0;
    for (var m = 0; m < (1 << g); m++) { targets[m] = state.regionCounts[maskKeyFor(m, g)] || 0; total += targets[m]; }
    if (!total) return { shapes: GEOMS[g], labels: null, dynamic: true, empty: true, mode: "none" };
    var mode = "fit", shapes = g === 2 ? twoSetExact(targets) : null;
    if (shapes) mode = "exact";
    else {
      var res = numericFit(g, targets, total);
      if (res.shapes) { shapes = res.shapes; mode = res.setwise ? "setwise" : "fit"; }
      else { shapes = GEOMS[g]; mode = "base"; }   // 保不住区域就别硬掰，退回固定布局
    }
    if (!shapes) return { shapes: GEOMS[g], labels: null, dynamic: true, failed: true, mode: "none" };
    shapes = normalizeShapes(shapes);
    return { shapes: shapes, labels: labelPositionsFor(shapes), dynamic: true, mode: mode };
  }

  /* ---- 区域数字锚点 ---- */
  function pointInRing(x, y, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function pointInPoly(x, y, poly) {
    for (var p = 0; p < poly.length; p++) {
      var rings = poly[p];
      if (!pointInRing(x, y, rings[0])) continue;
      var inHole = false;
      for (var r = 1; r < rings.length; r++) {
        if (pointInRing(x, y, rings[r])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }

  // 区域内「离边界最远」的点（pole of inaccessibility 的粗网格 + 局部细化近似）。
  // 比质心可靠：月牙形、细长交集的质心常常落在区域外。
  function poleOfInaccessibility(poly) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var pz = 0; pz < poly.length; pz++) {
      var ringsB = poly[pz];
      for (var r = 0; r < ringsB.length; r++) {
        var ring = ringsB[r];
        for (var i = 0; i < ring.length; i++) {
          var p = ring[i];
          if (p[0] < x0) x0 = p[0];
          if (p[0] > x1) x1 = p[0];
          if (p[1] < y0) y0 = p[1];
          if (p[1] > y1) y1 = p[1];
        }
      }
    }
    var w = x1 - x0, h = y1 - y0;
    if (!(w > 0) || !(h > 0)) return [200, 200];
    var step = Math.max(w, h) / 8;
    var best = null, bestD = -1;
    var probe = function (x, y) {
      if (!pointInPoly(x, y, poly)) return;
      var d = clearance(poly, x, y);
      if (d > bestD) { bestD = d; best = [x, y]; }
    };
    var xx, yy;
    for (yy = y0; yy <= y1 + 1e-9; yy += step) {
      for (xx = x0; xx <= x1 + 1e-9; xx += step) probe(xx, yy);
    }
    if (!best) {   // 细长到网格踩不进内部：退回所有顶点的重心
      var sx = 0, sy = 0, n = 0;
      for (var r2 = 0; r2 < poly.length; r2++) {
        for (var q2 = 0; q2 < poly[r2].length; q2++) {
          for (var i2 = 0; i2 < poly[r2][q2].length; i2++) {
            sx += poly[r2][q2][i2][0]; sy += poly[r2][q2][i2][1]; n++;
          }
        }
      }
      return n ? [sx / n, sy / n] : [200, 200];
    }
    for (var it = 0; it < 4; it++) {
      step /= 2;
      var bx = best[0], by = best[1];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) probe(bx + dx * step, by + dy * step);
    }
    return best;
  }

  // 实测偏差：只统计「含元素」的区域 —— 空区域本来就不可能被圆/椭圆表达成零面积，
  // 把它们算进来只会得到一个没意义的大数字。空区域里面积仍然明显的，单独计数上报。
  function measureAreaDeviation(g, areas) {
    var tp = [], total = 0, measured = 0;
    for (var m = 1; m < (1 << g); m++) { tp[m] = state.regionCounts[maskKeyFor(m, g)] || 0; total += tp[m]; }
    for (var k in areas) measured += areas[k];
    if (!total || !measured) return { dev: 0, empty: 0 };
    var worst = 0, empty = 0;
    for (var m2 = 1; m2 < (1 << g); m2++) {
      var share = tp[m2] / total;
      var act = (areas[maskKeyFor(m2, g)] || 0) / measured;
      if (share <= 0) { if (act > FIT_MIN_REL) empty++; continue; }
      var d = Math.abs(act - share) / Math.max(share, FIT_MIN_REL);
      if (d > worst) worst = d;
    }
    return { dev: worst, empty: empty };
  }

  var geoCache = { key: "", val: null };

  function countsSignature(g) {
    var s = String(g);
    for (var m = 1; m < (1 << g); m++) s += "|" + (state.regionCounts[maskKeyFor(m, g)] || 0);
    return s;
  }

  // 区域数字锚点：面积正比模式用实测锚点，否则用 Venny 坐标表
  function regionAnchor(key, g) {
    var a = state.regionAnchors[key];
    if (a) return a;
    var t = PX[g] && PX[g][key];
    if (t === undefined || t === null || t <= 0 || PY[g][key] <= 0) return null;
    return [t, PY[g][key]];
  }

  // 按给定几何算全部区域（含面积、数字锚点）
  function regionsFor(g, shapes) {
    var out = {}, areas = {}, anchors = {}, totalA = 0;
    var hasTable = !!(PX[g] && PY[g]);
    for (var m = 1; m < (1 << g); m++) {
      var key = maskKeyFor(m, g);
      var poly = regionPoly(m, shapes);
      if (!poly || !poly.length) continue;
      var a = polyArea(poly);
      if (!(a > 0.01)) continue;
      out[key] = poly;
      areas[key] = a;
      totalA += a;
      // 1–4 组用 Venny 固定坐标表；5–6 组（和面积正比布局）按区域真实形状算锚点
      anchors[key] = (shapes === GEOMS[g] && hasTable) ? null : poleOfInaccessibility(poly);
    }
    return { polys: out, areas: areas, anchors: anchors, totalA: totalA };
  }

  function computeRegions() {
    var g = state.groups;
    // 5 个以上样本只用 UpSet：不做 2^g 区域多边形计算（会指数爆炸），也没有花瓣图
    if (g > 4) {
      state.regionPolys = {}; state.regionAreas = {}; state.regionAnchors = {};
      state.layout = null; state.fitDev = 0; state.fitEmpty = 0;
      return;
    }
    var sig = (state.areaProp ? "A" : "B") + g + "|" + countsSignature(g);
    if (geoCache.key === sig) {
      var c = geoCache.val;
      state.regionPolys = c.polys; state.regionAreas = c.areas;
      state.regionAnchors = c.anchors; state.layout = c.layout; state.fitDev = c.dev; state.fitEmpty = c.empty;
      return;
    }
    var fixedLabels = g > 4 ? labelPositionsFor(GEOMS[g]) : null;
    var layout = state.areaProp ? fitAreaProportional(g) : { shapes: GEOMS[g], labels: fixedLabels, dynamic: false, mode: g > 4 ? "petal" : "off" };
    var r = regionsFor(g, layout.shapes), shapes = layout.shapes;
    // 硬兜底：拟合结果里若有「含元素」的区域整个不存在（细长区域连布尔运算都算不出来），
    // 就退回固定几何 —— 图会退回普通韦恩图（面积不再正比），但绝不会少掉一个区域。
    // 抽样打分挡不住这种情况（网格会把细缝算成有面积），只有真实多边形说了算。
    if (layout.dynamic) {
      var missingKey = null;
      for (var mv = 1; mv < (1 << g); mv++) {
        var kv = maskKeyFor(mv, g);
        if ((state.regionCounts[kv] || 0) > 0 && !r.polys[kv]) { missingKey = kv; break; }
      }
      if (missingKey) {
        layout = { shapes: GEOMS[g], labels: fixedLabels, dynamic: false, mode: "base", lost: missingKey };
        shapes = layout.shapes;
        r = regionsFor(g, shapes);
      }
    }
    var out = r.polys, areas = r.areas, anchors = r.anchors, totalA = r.totalA;
    // 面积正比模式：面积可忽略的「空区域」不画、不承载数字（否则数字会飘到图形外）。
    // 有元素的区域绝不剔除 —— 宁可数字用「?」占位，也不能让一个区域凭空消失。
    if (layout.dynamic && totalA > 0) {
      var minA = totalA * 0.004;
      for (var k2 in areas) {
        if (areas[k2] < minA && !(state.regionCounts[k2] > 0)) {
          delete out[k2]; delete areas[k2]; delete anchors[k2];
        }
      }
    }
    var dev = layout.dynamic ? measureAreaDeviation(g, areas) : { dev: 0, empty: 0 };
    geoCache = { key: sig, val: { polys: out, areas: areas, anchors: anchors, layout: layout, dev: dev.dev, empty: dev.empty } };
    state.regionPolys = out;
    state.regionAreas = areas;
    state.regionAnchors = anchors;
    state.layout = layout;
    state.fitDev = dev.dev;
    state.fitEmpty = dev.empty;
  }


  /* ======================== 拖拽偏移 ======================== */
  function dragOff(kind, key) {
    var bucket = state.drag[kind];
    var o = bucket && bucket[key];
    return (o && o.length === 2) ? o : [0, 0];
  }
  function setDrag(kind, key, dx, dy) {
    if (!state.drag[kind]) state.drag[kind] = {};
    if (Math.abs(dx) < 0.6 && Math.abs(dy) < 0.6) delete state.drag[kind][key];
    else state.drag[kind][key] = [Math.round(dx * 10) / 10, Math.round(dy * 10) / 10];
  }
  function dragCount() {
    return Object.keys(state.drag.label || {}).length + Object.keys(state.drag.num || {}).length;
  }
  function resetDragAll() {
    state.drag = { label: {}, num: {} };
    render(); persist();
    toast(I18N[LANG].toastPosAllReset);
  }

  /* ======================== 渲染 ======================== */
  var svg = null;

  function labelFontPx() { return Math.max(6, state.style.labelSize); }
  function numFontPx() { return Math.max(6, state.style.numSize); }
  function pctFontPx(fs) { return Math.max(5, Math.round(fs * 0.72)); }

  // 文本宽度估算（CJK 记 1em，其余字符记 0.6em）
  function textWidth(str, fs) {
    var units = 0;
    for (var i = 0; i < str.length; i++) {
      units += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60]/.test(str.charAt(i)) ? 1 : 0.6;
    }
    return units * fs;
  }

  function polyBBox(poly) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var pz = 0; pz < poly.length; pz++) {
      var ringsB = poly[pz];
      for (var r = 0; r < ringsB.length; r++) {
        var ring = ringsB[r];
        for (var i = 0; i < ring.length; i++) {
          var p = ring[i];
          if (p[0] < x0) x0 = p[0];
          if (p[0] > x1) x1 = p[0];
          if (p[1] < y0) y0 = p[1];
          if (p[1] > y1) y1 = p[1];
        }
      }
    }
    return { w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }

  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var qx = ax + t * dx, qy = ay + t * dy;
    return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
  }
  function clearance(poly, x, y) {
    var d = Infinity;
    for (var pz = 0; pz < poly.length; pz++) {
      var ringsB = poly[pz];
      for (var r = 0; r < ringsB.length; r++) {
        var ring = ringsB[r];
        for (var i = 0; i < ring.length; i++) {
          var a = ring[i], b = ring[(i + 1) % ring.length];
          var dd = segDist(x, y, a[0], a[1], b[0], b[1]);
          if (dd < d) d = dd;
        }
      }
    }
    return d === Infinity ? 999 : d;
  }

  /* 数字排版：用户字号为上限，超出所在区域时按「包围盒 + 锚点内切半径」等比缩小；
   * 区域太小连最小字号都放不下时：
   *   · 先尝试去掉百分比行只留数字；
   *   · 仍放不下 → 用「?」占位（悬停浮层显示真实值，借鉴 jvenn）；
   *   · 连「?」都放不下 → 不画（区域已小于 4px 级别的可用空间）。 */
  function regionNumberLayout(poly, value, pct, showPct, cx, cy) {
    var base = numFontPx();
    var doFit = !!(state.style.fit && poly && poly.length);
    if (!doFit) return { fs: base, ps: showPct ? pctFontPx(base) : 0, slim: false, qm: false, hide: false };
    var box = polyBBox(poly), cl = clearance(poly, cx, cy);
    function fitFor(str, withPct) {
      var small = pctFontPx(base);
      var needW = textWidth(str, base);
      var needH = base * 1.06;
      if (withPct) {
        needW = Math.max(needW, textWidth("(" + pct + "%)", small));
        needH = base * 0.92 + small * 1.18;
      }
      var s = Math.min(1,
        (box.w * 0.92) / Math.max(1, needW),
        (box.h * 0.86) / Math.max(1, needH),
        (2 * cl * 0.9) / Math.max(1, needW),
        (2 * cl * 0.9) / Math.max(1, needH));
      return base * s;
    }
    var vstr = fmtNum(value);
    var full = fitFor(vstr, showPct);
    var slim = false;
    if (showPct && full < base * 0.62) {
      var only = fitFor(vstr, false);
      if (only > full * 1.15) { full = only; slim = true; }
    }
    if (full >= FLOOR_NUM) {
      return { fs: full, ps: (showPct && !slim) ? pctFontPx(full) : 0, slim: slim, qm: false, hide: false };
    }
    var qs = fitFor("?", false);
    if (qs >= FLOOR_QM) return { fs: Math.min(base, qs), ps: 0, slim: false, qm: true, hide: false };
    return { fs: 0, ps: 0, slim: false, qm: false, hide: true };
  }

  // 集合名称自动缩放：仅在会超出画布边界时收缩
  function regionLabelFont(name, x) {
    var base = labelFontPx();
    if (!state.style.fit) return base;
    var avail = Math.max(40, 2 * Math.min(x, 400 - x) - 8);
    var need = textWidth(String(name), base);
    if (need <= avail) return base;
    return Math.max(6, base * Math.max(0.45, avail / need));
  }

  function grayColor(value) {
    var base = regionBase();
    var pct = base ? value / base * 100 : 0;
    var v = 255 - Math.round(Math.min(100, pct) / 100 * 255);
    var hex = (v.toString(16).padStart(2, "0"));
    return "#" + hex + hex + hex;
  }

  /* ==================== UpSet 视图（5–6 组） ====================
   * 标准 UpSet 布局：上方交集柱状图、下方组合点阵、左侧集合大小。
   * 只画非空交集，按元素数从多到少排序；柱子/整列都可点击查看元素。
   * 5–6 组默认使用此视图，可切回花瓣图。
   */
  var UPSET_W = 860, UPSET_H = 500;

  // UpSet 一键主题：Nature / GraphPad / Minimal
  var UPSET_THEMES = {
    nature: {
      font: "Arial, Helvetica, sans-serif", text: "#222", axis: "#222",
      topBar: "#1F4E79", dimBar: "#B6C1CE", topText: "#1F4E79", dimText: "#6B7280",
      setBar: "#5B9BD5", dot: "#1a1a1a", line: "#8a99aa",
      emphasize: 6, showValues: true
    },
    graphpad: {
      font: "Arial, Helvetica, sans-serif", text: "#111111", axis: "#111111",
      topBar: "#333333", dimBar: "#CFCFCF", topText: "#333333", dimText: "#777777",
      setBar: "#8C8C8C", dot: "#111111", line: "#9A9A9A",
      emphasize: 6, showValues: true
    },
    minimal: {
      font: "Arial, Helvetica, sans-serif", text: "#64748B", axis: "#E2E8F0",
      topBar: "#4C78A8", dimBar: "#4C78A8", topText: "#4C78A8", dimText: "#4C78A8",
      setBar: "#D6E4F0", dot: "#94A3B8", line: "#E2E8F0",
      emphasize: 0, showValues: false
    }
  };

  function applyUpsetTheme(key) {
    var th = UPSET_THEMES[key] || UPSET_THEMES.nature;
    state.style.upsetMain = th.topBar;
    state.style.upsetDim = th.dimBar;
    state.style.upsetSet = th.setBar;
    state.style.upsetText = th.text;
    state.style.upsetLine = th.axis;
    ["upsetMain", "upsetDim", "upsetSet", "upsetText", "upsetLine"].forEach(function (id) {
      var el = $ (id);
      if (el) el.value = state.style[id];
    });
  }

  function upsetKeys() {
    var keys = [];
    for (var k in state.regionCounts) {
      if ((state.regionCounts[k] || 0) > 0) keys.push(k);
    }
    keys.sort(function (a, b) {
      var d = (state.regionCounts[b] || 0) - (state.regionCounts[a] || 0);
      return d || a.localeCompare(b);
    });
    return keys;
  }

  function buildUpSetSVG() {
    var g = state.groups, L = I18N[LANG];
    var allKeys = upsetKeys();
    var shown = state.upsetLimit > 0 ? Math.min(state.upsetLimit, allKeys.length) : allKeys.length;
    var keys = allKeys.slice(0, shown);
    if (!keys.length) {
      return {
        html: '<text x="' + (UPSET_W / 2) + '" y="' + (UPSET_H / 2) + '" text-anchor="middle" font-size="16" fill="#6b7280">' + esc(L.upsetEmpty) + "</text>",
        w: UPSET_W, h: UPSET_H
      };
    }
    // 组名完整显示：按最长名称动态计算左栏宽度（CJK 按 1em 估算），不再截断
    var nameTextW = 0;
    for (var ni = 0; ni < g; ni++) {
      var nName = sampleName(ni);
      nameTextW = Math.max(nameTextW, textWidth(nName, 12));
    }
    // 参考 Nature 布局：Set size 0 点在右，蓝色条向左延伸；样本名紧贴条右侧和点阵左侧
    // setOnRight：把 Set size 条改放到右侧（原实验分组列的位置），此时不显示分组。
    var setOnRight = state.upsetSetPos === "right";
    var barMaxW = 110, barLeft = 8, barRight = barLeft + barMaxW;
    // 右侧模式的左栏宽度只需容下样本名与交集大小刻度（刻度在柱状区左侧，不与名称行重叠）
    var countDigits = String(state.regionCounts[keys[0]] || 0).length;
    var leftW = setOnRight
      ? Math.max(56, nameTextW + 8, 20 + countDigits * 8 + 6)
      : Math.max(140, barRight + 4 + nameTextW);
    // 名称紧贴点阵左侧；左模式保留 Set size 条与名称之间的间距
    var rightX = leftW + (setOnRight ? 10 : 8);
    var nameX = leftW;
    // 右侧实验分组：优先用色块 + 图例，减少逐行重复文字（Set size 在右侧时不使用分组）
    var groupList = [], groupSeen = {};
    if (!setOnRight) {
      for (var gj = 0; gj < g; gj++) {
        var gjn = (sampleAt(gj).group || "").trim();
        if (!gjn || groupSeen[gjn]) continue;
        groupSeen[gjn] = true;
        groupList.push({ name: gjn, color: sampleAt(gj).groupColor || GROUP_COLORS[gj % GROUP_COLORS.length] });
      }
    }
    var groupNameW = 0;
    groupList.forEach(function (gr) { groupNameW = Math.max(groupNameW, textWidth(gr.name, 12)); });
    // 列距紧凑：少列时封顶 32px，多列时最小 18px；不整体缩小
    var colWTarget = Math.max(18, Math.min(32, 560 / keys.length));
    var rightW = Math.round(keys.length * colWTarget);
    var groupX = rightX + rightW + 24;
    var groupColW = groupNameW ? (14 + 8 + groupNameW + 16) : 0;
    var setX0 = rightX + rightW + 14;
    // 右侧数值最多 5–6 位，按最长数字预留，避免长计数被画布裁掉
    var setValW = Math.max(34, Math.min(96, String(Math.max.apply(null, state.counts.concat([1]))).length * 9 + 12));
    var rowH = g <= 8 ? 24 : (g <= 20 ? 21 : 18);
    var barTop = 54;
    var barH = Math.max(250, Math.round(g * rowH * 1.15));
    var matrixTop = barTop + barH + 40;
    var barBottom = matrixTop - 40, maxBarH = barH;
    var W = setOnRight ? Math.round(setX0 + barMaxW + setValW) : Math.round(groupX + groupColW);
    var H = matrixTop + (g - 1) * rowH + 12 + 48;
    var colW = rightW / keys.length;
    var barW = Math.max(2, Math.min(32, colW * 0.66));
    var valuePx = Math.max(8, Math.min(numPx, Math.round(colW * 0.45)));
    var maxCount = state.regionCounts[keys[0]] || 1;
    var maxSet = Math.max.apply(null, state.counts.concat([1]));
    var theme = UPSET_THEMES[state.upsetTheme] || UPSET_THEMES.nature;
    var st = state.style;
    var setBarColor = st.upsetSet || theme.setBar;
    var axisColor = st.upsetLine || theme.axis;
    var textColor = st.labelColor || st.upsetText || theme.text;
    var topLightColor = st.upsetMain || theme.topBar, dimColor = st.upsetDim || theme.dimBar;
    var fontFamily = st.family || theme.font;
    var labelPx = Math.max(10, Math.min(16, Math.round((st.labelSize || 22) * 0.55)));
    var numPx = Math.max(8, Math.min(14, Math.round((st.numSize || 16) * 0.6)));
    var useGroupLegend = groupList.length > 0 && groupList.length * 16 + 20 <= barH - 10;
    var intTicks = function (max) {
      var raw = max / 4;
      var pow = Math.pow(10, Math.floor(Math.log10(raw)));
      var n = raw / pow;
      var stp = Math.max(1, Math.round((n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow));
      while (max / stp > 6) stp *= 2;
      return { step: stp, top: Math.ceil(max / stp) * stp || stp };
    };
    var tickInfo = intTicks(maxCount);
    var tickStep = tickInfo.step, tickTop = tickInfo.top;
    var setTickInfo = intTicks(maxSet);
    var setStep = setTickInfo.step, setTop = setTickInfo.top;
    var setAxisY = matrixTop + (g - 1) * rowH + 12;
    var setAxisX1 = setOnRight ? setX0 : barLeft;
    var setAxisX2 = setOnRight ? setX0 + barMaxW : barRight;
    var parts = [];
    parts.push('<g font-family="' + fontFamily + '">');
    // 点阵背景/参考线：交替行底色 + 每列一条较宽的竖向底色带（参考 Nature 图的棋盘格）
    var matrixBottom = matrixTop + (g - 1) * rowH + rowH / 2;
    var colBandW = Math.max(10, Math.min(16, colW * 0.55));
    parts.push('<g id="upset-grid">');
    for (var bi = 0; bi < g; bi++) {
      if (bi % 2 === 1) continue;
      parts.push('<rect x="' + rightX + '" y="' + (matrixTop + bi * rowH - rowH / 2).toFixed(1) +
        '" width="' + rightW + '" height="' + rowH.toFixed(1) + '" fill="' + axisColor + '" fill-opacity="0.05"/>');
    }
    for (var gc = 0; gc < keys.length; gc++) {
      var gx = rightX + (gc + 0.5) * colW;
      parts.push('<rect x="' + (gx - colBandW / 2).toFixed(1) + '" y="' + (matrixTop - rowH / 2).toFixed(1) +
        '" width="' + colBandW.toFixed(1) + '" height="' + (matrixBottom - (matrixTop - rowH / 2)).toFixed(1) +
        '" fill="' + axisColor + '" fill-opacity="0.11"/>');
    }
    parts.push('</g>');
    // Y 轴：轴线 + 向外刻度 + 数值 + 轴标题
    parts.push('<line x1="' + rightX + '" y1="' + barTop + '" x2="' + rightX + '" y2="' + barBottom + '" stroke="' + axisColor + '" stroke-width="1.5"/>');
    for (var tv = 0; tv <= tickTop + 1e-9; tv += tickStep) {
      var ty = barBottom - (tv / tickTop) * maxBarH;
      parts.push('<line x1="' + (rightX - 9) + '" y1="' + ty.toFixed(1) + '" x2="' + rightX + '" y2="' + ty.toFixed(1) + '" stroke="' + axisColor + '" stroke-width="2"/>');
      var ytKey = "ytick:" + tv;
      var ytOff = dragOff("num", ytKey);
      var ytX = rightX - 13, ytY = ty + 3.8;
      parts.push('<text class="upset-tick" data-grab="num:' + ytKey + '" data-bx="' + ytX + '" data-by="' + ytY.toFixed(1) + '" x="' + (ytX + ytOff[0]) + '" y="' + (ytY + ytOff[1]).toFixed(1) + '" text-anchor="end" font-size="' + numPx + '" fill="' + textColor + '">' + fmtNum(tv) + "</text>");
    }
    var yMid = (barTop + barBottom) / 2;
    var yTitleX = rightX - 50, yTitleY = yMid;
    var yTitleOff = dragOff("label", "yaxis");
    var ytx = yTitleX + yTitleOff[0], yty = yTitleY + yTitleOff[1];
    parts.push('<text class="upset-axis-title" data-grab="label:yaxis" data-rot="-90" data-bx="' + yTitleX + '" data-by="' + yTitleY.toFixed(1) + '" x="' + ytx.toFixed(1) + '" y="' + yty.toFixed(1) + '" text-anchor="middle" font-size="' + labelPx + '" font-weight="700" fill="' + textColor + '" transform="rotate(-90 ' + ytx.toFixed(1) + " " + yty.toFixed(1) + ')">' + esc(L.upsetIntersections) + "</text>");
    // X 轴基线（学术风格：只画左轴和下轴，不画背景网格）
    parts.push('<line x1="' + rightX + '" y1="' + barBottom + '" x2="' + (rightX + rightW) + '" y2="' + barBottom + '" stroke="' + axisColor + '" stroke-width="1.5"/>');
    if (allKeys.length > keys.length) {
      var noteOff = dragOff("label", "topnote");
      parts.push('<text class="upset-note" data-grab="label:topnote" data-bx="' + rightX + '" data-by="24" x="' + (rightX + noteOff[0]) + '" y="' + (24 + noteOff[1]) + '" font-size="' + numPx + '" fill="' + textColor + '">' +
        esc(L.upsetTopNote.replace("{S}", keys.length).replace("{N}", allKeys.length)) + "</text>");
    }
    // 分组图例（只列唯一分组，右侧行内不再重复写名称）
    if (useGroupLegend) {
      for (var lg = 0; lg < groupList.length; lg++) {
        var ly = 22 + lg * 16;
        var gLo = dragOff("label", "g:" + groupList[lg].name);
        parts.push('<rect x="' + groupX + '" y="' + (ly - 7) + '" width="12" height="12" rx="2" fill="' + groupList[lg].color + '"/>');
        parts.push('<text class="upset-group-label" data-grab="label:g:' + esc(groupList[lg].name) + '" data-bx="' + (groupX + 18) + '" data-by="' + (ly + 3) + '" x="' + (groupX + 18 + gLo[0]) + '" y="' + (ly + 3 + gLo[1]) + '" font-size="' + labelPx + '" fill="' + textColor + '">' + esc(groupList[lg].name) + "</text>");
      }
    }

    // 集合大小条：默认在左（0 在右、向左延伸），也可放到右侧分组位（0 在左、向右延伸）并标数值
    for (var i = 0; i < g; i++) {
      var rowY = matrixTop + i * rowH;
      var cnt = state.counts[i] || 0;
      var nm = sampleName(i);
      if (!setOnRight) {
        var setW = cnt ? Math.max(2, (cnt / setTop) * barMaxW) : 0;
        parts.push('<rect x="' + (barRight - setW).toFixed(1) + '" y="' + (rowY - 4).toFixed(1) + '" width="' + setW.toFixed(1) + '" height="8" fill="' + setBarColor + '"/>');
      }
      var nLo = dragOff("label", i);
      parts.push('<text class="label upset-sample-label" text-anchor="end" data-grab="label:' + i + '" data-bx="' + nameX + '" data-by="' + (rowY + 4).toFixed(1) + '" x="' + (nameX + nLo[0]) + '" y="' + (rowY + 4 + nLo[1]).toFixed(1) + '" font-size="' + labelPx + '" fill="' + textColor + '">' + esc(nm) + "</text>");
      if (setOnRight) {
        var setWr = cnt ? Math.max(2, (cnt / setTop) * barMaxW) : 0;
        if (setWr > 0) {
          parts.push('<rect class="upset-set-bar" x="' + setX0.toFixed(1) + '" y="' + (rowY - 4).toFixed(1) + '" width="' + setWr.toFixed(1) + '" height="8" fill="' + setBarColor + '"/>');
        }
        // 条末端标出该样本的总数
        var svKey = "setcount:" + i;
        var svOff = dragOff("num", svKey);
        var svX = setX0 + setWr + 4, svY = rowY + Math.round(numPx * 0.36);
        parts.push('<text class="upset-value upset-set-value" data-grab="num:' + svKey + '" data-bx="' + svX.toFixed(1) + '" data-by="' + svY.toFixed(1) + '" x="' + (svX + svOff[0]).toFixed(1) + '" y="' + (svY + svOff[1]).toFixed(1) + '" text-anchor="start" font-size="' + numPx + '" fill="' + textColor + '">' + fmtNum(cnt) + "</text>");
      } else {
        // 右侧实验分组色块；若图例放得下则不再逐行写文字
        var gname = (sampleAt(i).group || "").trim();
        if (gname) {
          var gcolor = sampleAt(i).groupColor || GROUP_COLORS[i % GROUP_COLORS.length];
          parts.push('<rect x="' + groupX + '" y="' + (rowY - 7).toFixed(1) + '" width="14" height="14" fill="' + gcolor + '"/>');
          if (!useGroupLegend) {
            var rLo = dragOff("label", "g:" + gname);
            parts.push('<text class="upset-group-label" data-grab="label:g:' + esc(gname) + '" data-bx="' + (groupX + 22) + '" data-by="' + (rowY + 4).toFixed(1) + '" x="' + (groupX + 22 + rLo[0]) + '" y="' + (rowY + 4 + rLo[1]).toFixed(1) + '" font-size="' + labelPx + '" fill="' + textColor + '">' + esc(gname) + "</text>");
          }
        }
      }
    }

    // 集合大小坐标轴：左侧模式 0 在右向左增大；右侧模式 0 在左向右增大
    var setAxisBase = setOnRight ? setX0 : barRight;
    var setAxisDir = setOnRight ? 1 : -1;
    parts.push('<line x1="' + setAxisX1 + '" y1="' + setAxisY.toFixed(1) + '" x2="' + setAxisX2 + '" y2="' + setAxisY.toFixed(1) + '" stroke="' + axisColor + '" stroke-width="1.5"/>');
    for (var sv = 0; sv <= setTop + 1e-9; sv += setStep) {
      var sx = setAxisBase + setAxisDir * (sv / setTop) * barMaxW;
      parts.push('<line x1="' + sx.toFixed(1) + '" y1="' + setAxisY.toFixed(1) + '" x2="' + sx.toFixed(1) + '" y2="' + (setAxisY + 5).toFixed(1) + '" stroke="' + axisColor + '" stroke-width="1.5"/>');
      var stKey = "settick:" + sv;
      var stOff = dragOff("num", stKey);
      var stX = sx, stY = setAxisY + 17;
      parts.push('<text class="upset-tick" data-grab="num:' + stKey + '" data-bx="' + stX.toFixed(1) + '" data-by="' + stY.toFixed(1) + '" x="' + (stX + stOff[0]).toFixed(1) + '" y="' + (stY + stOff[1]).toFixed(1) + '" text-anchor="middle" font-size="' + numPx + '" fill="' + textColor + '">' + fmtNum(sv) + "</text>");
    }
    var setTitleX = (setAxisX1 + setAxisX2) / 2, setTitleY = setAxisY + 30;
    var setTitleOff = dragOff("label", "setaxis");
    parts.push('<text class="upset-axis-title" data-grab="label:setaxis" data-bx="' + setTitleX.toFixed(1) + '" data-by="' + setTitleY.toFixed(1) + '" x="' + (setTitleX + setTitleOff[0]).toFixed(1) + '" y="' + (setTitleY + setTitleOff[1]).toFixed(1) + '" text-anchor="middle" font-size="' + labelPx + '" font-weight="700" fill="' + textColor + '">' + esc(L.upsetSetSize) + "</text>");

    // 每列：连接线、点阵、交集柱
    var topN = Math.min(theme.emphasize || 0, keys.length);
    for (var c = 0; c < keys.length; c++) {
      var key = keys[c], val = state.regionCounts[key] || 0;
      var cx = rightX + (c + 0.5) * colW;
      var isTop = c < topN;
      var onRows = [];
      for (var b = 0; b < g; b++) if (key.charAt(b + 1) === "1") onRows.push(b);
      if (onRows.length > 1) {
        parts.push('<line x1="' + cx.toFixed(1) + '" y1="' + (matrixTop + onRows[0] * rowH).toFixed(1) +
          '" x2="' + cx.toFixed(1) + '" y2="' + (matrixTop + onRows[onRows.length - 1] * rowH).toFixed(1) +
          '" stroke="' + theme.line + '" stroke-width="1"/>');
      }
      for (var r = 0; r < g; r++) {
        var on = key.charAt(r + 1) === "1";
        if (on) {
          parts.push('<circle class="upset-dot-on" cx="' + cx.toFixed(1) + '" cy="' + (matrixTop + r * rowH).toFixed(1) +
            '" r="3.8" fill="' + theme.dot + '"/>');
        } else {
          parts.push('<circle class="upset-dot-empty" cx="' + cx.toFixed(1) + '" cy="' + (matrixTop + r * rowH).toFixed(1) +
            '" r="3.2" fill="none" stroke="' + axisColor + '" stroke-opacity="0.32" stroke-width="1"/>');
        }
      }
      var h = tickTop ? (val / tickTop) * maxBarH : 0;
      if (h > 0) {
        parts.push('<rect class="upset-bar" data-mask="' + key + '" x="' + (cx - barW / 2).toFixed(1) +
          '" y="' + (barBottom - h).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) +
          '" fill="' + (isTop ? topLightColor : dimColor) + '"/>');
        if (theme.showValues) {
          var ly = barBottom - h - 5;
          var nOff = dragOff("num", key);
          parts.push('<text class="upset-value" data-mask="' + key + '" data-grab="num:' + key +
            '" data-bx="' + cx.toFixed(1) + '" data-by="' + ly.toFixed(1) +
            '" x="' + (cx + nOff[0]).toFixed(1) + '" y="' + (ly + nOff[1]).toFixed(1) +
            '" text-anchor="middle" font-size="' + valuePx + '" font-weight="700" fill="' + textColor + '">' + fmtNum(val) + "</text>");
        }
      }
    }

    // 透明整列命中层：柱子很窄时也能点击/悬停
    var hits = [];
    for (var hc = 0; hc < keys.length; hc++) {
      var hx = rightX + hc * colW;
      hits.push('<rect class="region-hit upset-hit" data-mask="' + keys[hc] + '" x="' + hx.toFixed(1) +
        '" y="' + barTop + '" width="' + colW.toFixed(1) + '" height="' +
        (matrixTop + (g - 1) * rowH + 16 - barTop).toFixed(1) + '" fill="transparent"/>');
    }
    parts.push("</g>");
    parts.push('<g id="interact">' + hits.join("") + "</g>");
    return { html: parts.join(""), w: W, h: H };
  }

  function syncViewControl() {
    var g = state.groups, inUpset = g >= 5;
    var limitWrap = $("upsetLimitWrap"), limitSel = $("selUpsetLimit");
    if (limitWrap) limitWrap.hidden = !inUpset;
    if (limitSel) limitSel.value = state.upsetLimit === 0 ? "all" : "30";
    var themeWrap = $("upsetThemeWrap"), themeSel = $("selUpsetTheme");
    if (themeWrap) themeWrap.hidden = !inUpset;
    if (themeSel) themeSel.value = UPSET_THEMES[state.upsetTheme] ? state.upsetTheme : "nature";
    var posWrap = $("upsetSetPosWrap"), posSel = $("selUpsetSetPos");
    if (posWrap) posWrap.hidden = !inUpset;
    if (posSel) posSel.value = state.upsetSetPos === "right" ? "right" : "left";
  }

  function renderUpSet() {
    var built = buildUpSetSVG();
    svg.setAttribute("viewBox", "0 0 " + built.w + " " + built.h);
    svg.innerHTML = built.html;
    // 固定列宽，画布比卡片宽时横向滚动，避免整体缩小把字压小
    svg.style.width = built.w + "px";
    svg.style.height = built.h + "px";
    svg.style.maxWidth = "none";
    svg.style.display = "block";
    svg.style.margin = "0 auto";
    var stage = $("stage");
    if (stage) stage.classList.toggle("transparent", state.style.mode === "transparent");
    updateListCounts();
    syncHint();
    updateDevBadge();
    if (state.selected) hotMask(state.selected);
    applyFoundClasses();
    renderStats();
    updatePosBtn();
  }

  function render() {
    classify();
    computeRegions();
    if (!svg) return;
    var g = state.groups;
    var st = state.style;
    // 5–6 组默认 UpSet；可切回花瓣图。1–4 组始终为韦恩图。
    var pctBox = $("chkPerc");
    if (pctBox) {
      pctBox.disabled = g > 4;
      pctBox.title = g > 4 ? I18N[LANG].pctPetal : I18N[LANG].pctTitle;
    }
    syncViewControl();
    if (g >= 5) {
      renderUpSet();
      return;
    }
    svg.setAttribute("viewBox", "0 0 400 400");
    svg.style.width = ""; svg.style.height = ""; svg.style.maxWidth = "";
    svg.style.display = ""; svg.style.margin = "";
    // 5–6 组图面密集，区域数字只显示计数（百分比仍在悬停提示、统计面板和 CSV 里）。
    // 否则中心附近「4 组共有 / 5 组共有」这类相邻区域的百分比文字会叠在一起。
    var percAllowed = st.perc && g <= 4;
    var alpha = Math.max(5, Math.min(95, st.alpha || 50)) / 100;
    var filled = st.mode === "custom" || st.mode === "colors";
    var grayMode = st.mode === "gray";
    var parts = [];

    // 1) 区域灰度填充层（仅 gray 模式；位于最底层）
    if (grayMode) {
      var grayPaths = [];
      for (var k0 in state.regionPolys) {
        var poly0 = state.regionPolys[k0];
        if (!poly0) continue;
        grayPaths.push('<path class="region-fill" d="' + polyToPath(poly0) + '" fill="' + grayColor(regionValue(k0)) + '" stroke="none"/>');
      }
      parts.push('<g id="grayLayer">' + grayPaths.join("") + "</g>");
    }

    // 2) 集合形状（填充模式下半透明叠加，其它不填充）
    var shapes = LAY().shapes;
    parts.push('<g id="shapes">');
    shapes.forEach(function (sh, i) {
      var fill = filled ? rgba((st.fills && st.fills[i]) || DEFAULT_FILLS[i], alpha) : "rgba(0,0,0,0)";
      if (sh.kind === "petal") {
        parts.push('<circle cx="' + sh.x + '" cy="' + sh.y + '" r="' + sh.r0 + '" fill="' + fill + '" stroke="none"/>');
        parts.push('<ellipse cx="' + sh.cx + '" cy="' + sh.cy + '" rx="' + sh.rx + '" ry="' + sh.ry +
          '" transform="rotate(' + sh.rot + " " + sh.cx + " " + sh.cy + ')" fill="' + fill + '" stroke="none"/>');
        return;
      }
      var tag = sh.kind === "circle" ? "circle" : "ellipse";
      var extra = sh.kind === "ellipse"
        ? ' rx="' + sh.rx + '" ry="' + sh.ry + '" transform="rotate(' + sh.rot + " " + sh.x + " " + sh.y + ')"'
        : ' r="' + sh.r + '"';
      parts.push('<' + tag + ' cx="' + sh.x + '" cy="' + sh.y + '"' + extra + ' fill="' + fill + '" stroke="none"/>');
    });
    parts.push("</g>");

    // 3) 集合描边（double-draw，保证轮廓完整可见）
    parts.push('<g id="strokes" fill="none" stroke="' + (st.stroke || DEFAULT_STROKE) + '" stroke-width="' + st.width + '">');
    shapes.forEach(function (sh) {
      if (sh.kind === "petal") {
        parts.push('<circle cx="' + sh.x + '" cy="' + sh.y + '" r="' + sh.r0 + '"/>');
        parts.push('<ellipse cx="' + sh.cx + '" cy="' + sh.cy + '" rx="' + sh.rx + '" ry="' + sh.ry +
          '" transform="rotate(' + sh.rot + " " + sh.cx + " " + sh.cy + ')"/>');
        return;
      }
      if (sh.kind === "circle") {
        parts.push('<circle cx="' + sh.x + '" cy="' + sh.y + '" r="' + sh.r + '"/>');
      } else {
        parts.push('<ellipse cx="' + sh.x + '" cy="' + sh.y + '" rx="' + sh.rx + '" ry="' + sh.ry + '" transform="rotate(' + sh.rot + " " + sh.x + " " + sh.y + ')"/>');
      }
    });
    parts.push("</g>");

    // 3.5) 交互层（透明 path，置于最上层用于悬停高亮与点击命中）
    parts.push('<g id="interact">');
    for (var ki in state.regionPolys) {
      var pol = state.regionPolys[ki];
      if (!pol) continue;
      parts.push('<path class="region-hit" data-mask="' + ki + '" d="' + polyToPath(pol) + '"/>');
    }
    parts.push("</g>");

    // 4) 集合标签（名称字号 / 颜色独立设置，可拖拽）
    var lays = LAY().labels;
    for (var li = 0; li < g; li++) {
      var baseX = lays && lays[li] ? lays[li][0] : (XLABEL[g] ? XLABEL[g][li] : 200);
      var baseY = lays && lays[li] ? lays[li][1] : (YLABEL[g] ? YLABEL[g][li] : 40);
      if (baseX <= 0 || baseY <= 0 || baseX > 400 || baseY > 400) continue;
      var offL = dragOff("label", li);
      var lx = baseX + offL[0], ly = baseY + offL[1];
      var nm = sampleName(li);
      parts.push(
        '<text class="label" data-grab="label:' + li + '" data-bx="' + baseX + '" data-by="' + baseY + '"' +
        ' x="' + r1(lx) + '" y="' + r1(ly) + '" text-anchor="middle" font-family="' + st.family + '"' +
        ' font-size="' + r1(regionLabelFont(nm, lx)) + '" font-weight="bold" fill="' + labelFill(li) + '">' + esc(nm) + "</text>"
      );
    }

    // 5) 区域数字（可拖拽；自适应开启时按区域大小收缩，缩不下用「?」）
    parts.push('<g id="values">');
    // 5–6 组会有几十个碎片区域：只给「有元素的」和「面积占比 ≥1% 的」区域标数字，
    // 并按面积从大到小放置；与已放数字挤在一起的小区域直接不标（仍可点击/悬停）。
    // 1–4 组沿用原行为（保持 Venny 固定坐标表的完整标注）。
    var valKeys = Object.keys(state.regionPolys), placedNums = [], totalArea = 0;
    if (g > 4) {
      for (var ak = 0; ak < valKeys.length; ak++) totalArea += state.regionAreas[valKeys[ak]] || 0;
      valKeys = valKeys.filter(function (k) {
        return regionValue(k) > 0 || (state.regionAreas[k] || 0) >= totalArea * 0.01;
      }).sort(function (a, b) { return (state.regionAreas[b] || 0) - (state.regionAreas[a] || 0); });
    }
    for (var vk = 0; vk < valKeys.length; vk++) {
      var k2 = valKeys[vk];
      var anc = regionAnchor(k2, g);
      if (!anc) continue;
      var baseNx = anc[0], baseNy = anc[1];
      var offN = dragOff("num", k2);
      var ex = baseNx + offN[0], ey = baseNy + offN[1];
      var value = regionValue(k2);
      var pct = regionPct(k2);
      var lay = regionNumberLayout(state.regionPolys[k2], value, pct, percAllowed, ex, ey);
      if (lay.hide) continue;
      // 5–6 组中心附近常有「少一个集合」的相邻交集（如 4 组共有 vs 5 组共有），
      // 锚点只差十几像素。按文字实际宽高做碰撞检测；挤不下的小数字直接不标（仍可点击）。
      var valTxt = fmtNum(value);
      var showPct = percAllowed && !lay.slim && !lay.qm;
      var numW = textWidth(showPct ? valTxt + " (" + pct + "%)" : (lay.qm ? "?" : valTxt), lay.fs) * 0.92;
      var numH = showPct ? lay.fs * 0.92 + lay.ps * 1.18 : lay.fs * 1.06;
      var overlapsNums = function (x, y, w, h) {
        for (var pn = 0; pn < placedNums.length; pn++) {
          var b = placedNums[pn];
          if (Math.abs(x - b.x) < (w + b.w) / 2 + 1 && Math.abs(y - b.y) < (h + b.h) / 2 + 1) return true;
        }
        return false;
      };
      if (g > 4 && placedNums.length && overlapsNums(ex, ey, numW, numH)) continue;
      if (g > 4) placedNums.push({ x: ex, y: ey, w: numW, h: numH });
      var tip = esc(fmtNum(value)) + (st.perc ? " (" + pct + "%)" : "");
      var open = '<text class="val-text' + (lay.qm ? " qm" : "") + '" data-mask="' + k2 + '" data-grab="num:' + k2 + '"' +
        ' data-bx="' + baseNx + '" data-by="' + baseNy + '" data-tip="' + tip + '"' +
        ' x="' + r1(ex) + '" y="' + r1(ey) + '" text-anchor="middle" dominant-baseline="middle"' +
        ' font-family="' + st.family + '" fill="' + numFill() + '"';
      if (showPct) {
        var ysep = Math.round(lay.fs / 2);
        parts.push(open + ">" +
          '<tspan x="' + r1(ex) + '" dy="' + (-ysep - 1) + '" font-size="' + r1(lay.fs) + '" font-weight="bold">' + fmtNum(value) + "</tspan>" +
          '<tspan x="' + r1(ex) + '" dy="' + (2 * ysep + 2) + '" font-size="' + r1(lay.ps) + '">(' + pct + "%)</tspan>" +
          "</text>");
      } else {
        parts.push(open + ' font-size="' + r1(lay.fs) + '" font-weight="bold">' + (lay.qm ? "?" : fmtNum(value)) + "</text>");
      }
    }
    parts.push("</g>");

    svg.innerHTML = parts.join("");
    var stage = $("stage");
    if (stage) stage.classList.toggle("transparent", st.mode === "transparent");
    updateListCounts();

    syncHint();
    updateDevBadge();
    applyFoundClasses();
    renderStats();
    updatePosBtn();
    if (state.selected && !state.search) select(state.selected, true);
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function r1(v) { return Math.round(v * 10) / 10; }

  /* ======================== 交互 ======================== */
  function hotMask(mask) {
    document.querySelectorAll("#vennSvg [data-mask].hot").forEach(function (n) { n.classList.remove("hot"); });
    if (!mask) return;
    document.querySelectorAll('#vennSvg [data-mask="' + mask + '"]').forEach(function (n) { n.classList.add("hot"); });
  }

  function describeRegion(mask) {
    var count = state.regionCounts[mask] || 0;
    var bits = [];
    for (var i = 1; i < mask.length; i++) if (mask.charAt(i) === "1") bits.push(i - 1);
    var names = bits.map(function (b) { return sampleName(b); });
    var L = I18N[LANG];
    var out = "";
    if (bits.length === 1) {
      out = L.exclusiveIn.replace("{N}", count).replace("{s}", count === 1 ? "" : "s").replace("{NAME}", names[0]);
    } else if (bits.length <= 6) {
      var tpl = L["commonIn" + bits.length];
      if (tpl) {
        out = tpl.replace("{N}", count).replace("{s}", count === 1 ? "" : "s");
        var slots = ["A", "B", "C", "D", "E", "F"];
        for (var s = 0; s < bits.length && s < slots.length; s++) out = out.replace("{" + slots[s] + "}", names[s]);
      }
    } else {
      out = L.commonMany.replace("{N}", count).replace("{s}", count === 1 ? "" : "s")
        .replace("{NAMES}", names.join(LANG === "zh" ? "、" : ", "));
    }
    return out;
  }

  function select(mask, silent) {
    state.selected = mask;
    hotMask(mask);
    var ta = $("names");
    if (!mask) { if (!silent) ta.value = ""; return; }
    var items = [];
    state.classified.forEach(function (k, name) {
      if (k === mask) items.push(name);
    });
    items.sort(function (a, b) { return a.localeCompare(b); });
    ta.value = describeRegion(mask) + "\n" + items.join("\n");
    ta.scrollTop = 0;
  }

  /* ---- 元素查找（借鉴 jvenn 的 Find an element） ---- */
  function applyFoundClasses() {
    if (!svg) return;
    var set = {};
    (state.found || []).forEach(function (k) { set[k] = 1; });
    svg.querySelectorAll("[data-mask]").forEach(function (n) {
      n.classList.toggle("found", !!set[n.getAttribute("data-mask")]);
    });
  }

  function findElements(q) {
    state.search = q || "";
    var found = new Map();
    if (state.search) {
      var needle = state.search.toLowerCase();
      state.classified.forEach(function (k, name) {
        if (String(name).toLowerCase().indexOf(needle) < 0) return;
        if (!found.has(k)) found.set(k, []);
        found.get(k).push(name);
      });
    }
    state.found = [];
    found.forEach(function (arr, k) { state.found.push(k); });
    applyFoundClasses();
    var ta = $("names"), L = I18N[LANG], inp = $("findEl");
    var total = 0;
    found.forEach(function (arr) { total += arr.length; });
    if (inp) inp.classList.toggle("miss", !!state.search && total === 0);
    if (!state.search) {
      if (state.selected) select(state.selected, true); else ta.value = "";
      return total;
    }
    var lines = [];
    if (!total) {
      lines.push(L.findNone.replace("{Q}", state.search));
    } else {
      lines.push(L.findHead.replace("{Q}", state.search).replace("{N}", total).replace("{M}", found.size));
      Array.from(found.keys()).sort().forEach(function (k) {
        var arr = found.get(k).slice().sort(function (a, b) { return a.localeCompare(b); });
        lines.push("");
        lines.push("── " + regionTitle(k) + " (" + arr.length + ")");
        lines.push(arr.join("\n"));
      });
    }
    ta.value = lines.join("\n");
    ta.scrollTop = 0;
    return total;
  }

  /* ---- 拖拽位置 ---- */
  function svgUnits(ev) {
    var r = svg.getBoundingClientRect ? svg.getBoundingClientRect() : { left: 0, top: 0, width: 400, height: 400 };
    var vb = (svg.getAttribute("viewBox") || "0 0 400 400").trim().split(/\s+/).map(Number);
    var vw = vb[2] || 400, vh = vb[3] || 400;
    var rw = r.width || svg.clientWidth || vw;
    var rh = r.height || svg.clientHeight || vh;
    var sx = vw / rw, sy = vh / rh;
    return { x: (ev.clientX - (r.left || 0)) * sx, y: (ev.clientY - (r.top || 0)) * sy };
  }
  function moveNode(node, dx, dy) {
    var bx = parseFloat(node.getAttribute("data-bx")), by = parseFloat(node.getAttribute("data-by"));
    if (!isFinite(bx) || !isFinite(by)) return;
    var nx = r1(bx + dx), ny = r1(by + dy);
    node.setAttribute("x", nx);
    node.setAttribute("y", ny);
    var rot = node.getAttribute("data-rot");
    if (rot) node.setAttribute("transform", "rotate(" + rot + " " + nx + " " + ny + ")");
    node.querySelectorAll("tspan").forEach(function (ts) { ts.setAttribute("x", nx); });
  }
  function tipShow(ev, text) {
    var tip = $("tip");
    if (!tip) return;
    var stage = $("stage");
    var sr = stage.getBoundingClientRect ? stage.getBoundingClientRect() : { left: 0, top: 0, width: 400 };
    tip.textContent = text;
    tip.hidden = false;
    // 夹在卡片内，避免被 .diagram-card 的 overflow:hidden 裁掉
    var sw = sr.width || 400;
    var tw = tip.offsetWidth || 60;
    var px = ev.clientX - (sr.left || 0);
    if (px - tw / 2 < 8) px = 8 + tw / 2;
    if (px + tw / 2 > sw - 8) px = sw - 8 - tw / 2;
    tip.style.left = Math.round(px) + "px";
    tip.style.top = Math.round(ev.clientY - (sr.top || 0)) + "px";
  }
  function tipHide() { var tip = $("tip"); if (tip) tip.hidden = true; }

  /* ======================== 计数显示 ======================== */
  function updateDevBadge() {
    var node = $("fitDev");
    if (!node) return;
    // 5 个以上样本只用 UpSet，不存在「花瓣布局未画出交集」的问题
    if (state.groups > 4) {
      node.hidden = false;
      node.textContent = I18N[LANG].upsetBadge;
      node.title = I18N[LANG].upsetBadgeTitle;
      node.classList.remove("warn");
      return;
    }
    if (!state.areaProp || !state.layout || !state.layout.dynamic || !state.totalUnique) {
      node.hidden = true; node.textContent = ""; node.removeAttribute("title"); node.classList.remove("warn");
      return;
    }
    var L = I18N[LANG];
    var mode = (state.layout && state.layout.mode) || "";
    // 拟合保不住区域 → 退回固定布局：这时没有「偏差」可言，别拿一个百分比糊弄人
    if (mode === "base") {
      node.hidden = false;
      node.textContent = L.areaBase;
      node.title = L.areaBaseTitle;
      node.classList.add("warn");
      return;
    }
    var dev = Math.round(state.fitDev * 1000) / 10;
    var empty = state.fitEmpty || 0;
    node.hidden = false;
    node.textContent = L.areaDev + " ≤ " + dev + "%" +
      (empty ? " · " + empty + " " + (empty === 1 ? L.areaEmpty1 : L.areaEmpty) : "");
    node.title = L.areaDevTitle.replace("{D}", dev).replace("{E}", empty)
      .replace("{EW}", empty === 1 ? L.areaEmpty1 : L.areaEmpty) +
      ((mode === "setwise") ? " " + L.areaSetwise : "");
    // 偏差大（>12%）或存在明显的空区域时用警示色，别让人以为图是精确的
    node.classList.toggle("warn", dev > 12 || empty > 0);
  }

  function updateListCounts() {
    for (var i = 0; i < state.lists.length; i++) {
      var node = $("count" + i);
      if (!node) continue;
      var n = state.listCounts[i] || 0;
      var unit = (n === 1 && LANG === "en") ? I18N.en.element : (LANG === "zh" ? "个元素" : " elements");
      node.textContent = n + unit;
    }
  }

  /* ======================== 统计小图表（借鉴 jvenn） ======================== */
  function barRow(name, value, max, color, sub) {
    var w = max > 0 ? Math.max(2, Math.round(value / max * 100)) : 0;
    return '<div class="bar-row" title="' + esc(name) + '">' +
      '<span class="bar-name">' + esc(name) + "</span>" +
      '<span class="bar-track"><i style="width:' + w + "%;background:" + color + '"></i></span>' +
      '<span class="bar-val">' + fmtNum(value) + (sub ? " (" + sub + ")" : "") + "</span></div>";
  }
  function renderStats() {
    var hostL = $("statLists"), hostR = $("statRegions");
    if (!hostL || !hostR) return;
    var L = I18N[LANG], g = state.groups;
    var rows = [], maxL = 0;
    for (var i = 0; i < g; i++) {
      var v = state.counts[i];
      if (v > maxL) maxL = v;
      rows.push({
        name: sampleName(i),
        v: v, c: COLLECT_COLOR[i], sub: ""
      });
    }
    hostL.innerHTML = rows.map(function (r) { return barRow(r.name, r.v, maxL, r.c, r.sub); }).join("") ||
      '<div class="bar-row"><span class="bar-val">—</span></div>';

    var buckets = [];
    for (var k = 1; k <= g; k++) buckets.push(0);
    for (var key in state.regionCounts) {
      var card = regionCard(key);
      if (card >= 1 && card <= g) buckets[card - 1] += (state.regionCounts[key] || 0);
    }
    var maxB = 0;
    buckets.forEach(function (v) { if (v > maxB) maxB = v; });
    hostR.innerHTML = buckets.map(function (v, idx) {
      var label = idx === 0 ? L.statOnly1 : L.statShared.replace("{N}", idx + 1);
      return barRow(label, v, maxB, idx === 0 ? "#94a3b8" : "#3b82f6");
    }).join("");
  }

  /* ======================== 历史 / 持久化 ======================== */
  function snapshot() {
    return state.lists.map(function (l) {
      return { name: l.name, body: l.body, group: l.group || "", groupColor: l.groupColor || "" };
    });
  }
  function applySnapshot(s) {
    state.lists = (s || []).map(function (it, i) {
      return {
        name: it.name, body: it.body,
        group: it.group || "", groupColor: it.groupColor || GROUP_COLORS[i % GROUP_COLORS.length]
      };
    });
    if (!state.lists.length) state.lists = [makeList(0)];
    buildInputs();
    render();
  }
  function pushHistory() {
    var snap = snapshot();
    var last = hist.undo[hist.undo.length - 1];
    var same = last && JSON.stringify(last) === JSON.stringify(snap);
    if (same) return;
    hist.undo.push(snap);
    if (hist.undo.length > 50) hist.undo.shift();
    hist.redo = [];
  }
  function markChanged(autoHist) {
    if (autoHist !== false) {
      clearTimeout(histTimer);
      histTimer = setTimeout(pushHistory, 700);
    }
    render();
    persist();
  }
  function undo() {
    if (!hist.undo.length) return toast(I18N[LANG].toastUndo);
    hist.redo.push(snapshot());
    applySnapshot(hist.undo.pop());
    toast(I18N[LANG].toastUndo);
  }
  function redo() {
    if (!hist.redo.length) return;
    pushHistory();
    applySnapshot(hist.redo.pop());
    toast(I18N[LANG].toastRedo);
  }

  function persist() {
    try {
      localStorage.setItem("setplotsvg-state-v1", JSON.stringify({
        lists: snapshot(), style: state.style, areaProp: state.areaProp,
        drag: state.drag, ui: ui, upsetLimit: state.upsetLimit, upsetTheme: state.upsetTheme,
        upsetSetPos: state.upsetSetPos, ts: Date.now()
      }));
    } catch (e) { /* ignore */ }
  }
  function restore() {
    var raw = null;
    try { raw = localStorage.getItem("setplotsvg-state-v1"); } catch (e) { /* ignore */ }
    if (!raw) return;
    try {
      var o = JSON.parse(raw);
      if (Array.isArray(o.lists) && o.lists.length) {
        state.lists = o.lists.map(function (item, i) {
          return {
            name: item.name || "List " + (i + 1),
            body: item.body || "",
            group: item.group || "",
            groupColor: item.groupColor || GROUP_COLORS[i % GROUP_COLORS.length]
          };
        });
      }
      if (!state.lists.length) state.lists = [makeList(0)];
      if (o.style) {
        Object.assign(state.style, o.style);
        if (o.style.stroke && !o.style.upsetLine) state.style.upsetLine = o.style.stroke;
        // 兼容旧版单一字号字段：迁移为名称字号，数字字号沿用新的较小默认值
        if (!o.style.labelSize && o.style.size) state.style.labelSize = Math.round(o.style.size * 0.8);
        delete state.style.size;
        // 旧版模式迁移：BW（Solid White）原本忽略取色器 → 置纯白 custom，保持原本观感；
        // colored → colors（经典配色，fills 里本就是经典色，直接沿用）
        var wasBW = state.style.mode === "BW";
        state.style.mode = normalizeMode(state.style.mode);
        if (wasBW) state.style.fills = WHITE_FILLS.slice();
        if (!Array.isArray(state.style.fills) || state.style.fills.length < 4) {
          state.style.fills = (state.style.mode === "colors" ? DEFAULT_FILLS : WHITE_FILLS).slice();
        } else if (state.style.fills.length < DEFAULT_FILLS.length) {
          // 旧版只存了 4 个颜色 → 保留自定义的前 4 个，补足第 5/6 组的默认色
          var fillBase = (state.style.mode === "colors" ? DEFAULT_FILLS : WHITE_FILLS);
          state.style.fills = state.style.fills.concat(fillBase.slice(state.style.fills.length));
        }
      }
      if (o.areaProp !== undefined) state.areaProp = !!o.areaProp;
      else if (o.weight !== undefined) state.areaProp = !!o.weight; // 旧版字段名
      if (o.drag && o.drag.label && o.drag.num) state.drag = { label: o.drag.label, num: o.drag.num };

      if (o.upsetLimit !== undefined) state.upsetLimit = o.upsetLimit === 0 ? 0 : 30;
      if (UPSET_THEMES[o.upsetTheme]) state.upsetTheme = o.upsetTheme;
      if (o.upsetSetPos === "right") state.upsetSetPos = "right";
      else if (o.upsetSetPos === "left") state.upsetSetPos = "left";
      if (!o.style || !o.style.upsetMain) applyUpsetTheme(state.upsetTheme);
      if (o.ui) { ui.compact = o.ui.compact !== false; ui.more = !!o.ui.more; ui.stats = o.ui.stats !== false; }
    } catch (e) { /* ignore */ }
  }

  /* ======================== 导出 ======================== */
  function buildExportSVG(transBg) {
    var clone = svg.cloneNode(true);
    var vb = (svg.getAttribute("viewBox") || "0 0 400 400").trim().split(/\s+/);
    var vw = parseFloat(vb[2]) || 400, vh = parseFloat(vb[3]) || 400;
    var outW = 1024, outH = Math.max(1, Math.round(outW * vh / vw));
    if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", NS);
    clone.setAttribute("viewBox", "0 0 " + vw + " " + vh);
    clone.setAttribute("width", String(outW));
    clone.setAttribute("height", String(outH));
    clone.style.width = ""; clone.style.height = ""; clone.style.maxWidth = "";
    clone.style.display = ""; clone.style.margin = "";
    clone.setAttribute("shape-rendering", "geometricPrecision");
    clone.removeAttribute("id");
    // 去掉运行时状态类（hover 高亮 / 查找高亮 / 拖拽中）与拖拽辅助属性
    clone.querySelectorAll(".hot, .found, .dragging").forEach(function (n) {
      n.classList.remove("hot"); n.classList.remove("found"); n.classList.remove("dragging");
    });
    clone.querySelectorAll("[data-grab]").forEach(function (n) {
      n.removeAttribute("data-grab"); n.removeAttribute("data-bx"); n.removeAttribute("data-by"); n.removeAttribute("data-tip"); n.removeAttribute("data-rot");
    });
    // 剔除交互命中层：它的透明填充来自页面 CSS，脱离页面（SVG/PNG 导出）会被渲染成黑色
    var interact = clone.querySelector("#interact");
    if (interact) interact.parentNode.removeChild(interact);

    if (!transBg) {
      var r = document.createElementNS(NS, "rect");
      r.setAttribute("x", "-20"); r.setAttribute("y", "-20");
      r.setAttribute("width", String(vw + 40)); r.setAttribute("height", String(vh + 40));
      r.setAttribute("fill", "#ffffff");
      clone.insertBefore(r, clone.firstChild);
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1200);
  }

  function doExportSVG() {
    var trans = $("chkTransBg").checked || state.style.mode === "transparent";
    var str = buildExportSVG(trans);
    triggerDownload(new Blob([str], { type: "image/svg+xml;charset=utf-8" }), "setplotsvg-diagram.svg");
    toast("✓ SVG");
  }

  function doExportPNG() {
    var size = parseInt($("pngSize").value, 10) || 1024;
    var trans = $("chkTransBg").checked || state.style.mode === "transparent";
    var vb = (svg.getAttribute("viewBox") || "0 0 400 400").trim().split(/\s+/);
    var vw = parseFloat(vb[2]) || 400, vh = parseFloat(vb[3]) || 400;
    var outH = Math.max(1, Math.round(size * vh / vw));
    var str = buildExportSVG(true); // 先全部透明背景，最后按需填白
    var blob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = outH;
      var ctx = canvas.getContext("2d");
      if (!trans) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, outH); }
      ctx.drawImage(img, 0, 0, size, outH);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (b) {
        if (b) { triggerDownload(b, "setplotsvg-diagram.png"); toast("✓ PNG " + size + "px"); }
        else toast(I18N[LANG].pngFail);
      }, "image/png");
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast(I18N[LANG].pngFail); };
    img.src = url;
  }

  function exportCSV() {
    var rows = [];
    rows.push("\ufeffregion,count,elements");
    for (var k in state.regionCounts) {
      var desc = regionTitle(k).replace(/"/g, '""') || "?";
      var items = [];
      state.classified.forEach(function (m, name) { if (m === k) items.push(name); });
      rows.push(['"' + desc + '"', state.regionCounts[k], '"' + items.join("; ") + '"'].join(","));
    }
    var blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, "setplotsvg-regions.csv");
    toast("✓ CSV");
  }

  /* ======================== 文件导入 ======================== */
  function importText(text, filename, target) {
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    var isCsv = /\.csv$/i.test(filename || "");
    if (!filename && text.indexOf("\t") >= 0 && lines.length > 1) isCsv = true;
    if (isCsv) {
      var cols = [];
      lines.forEach(function (ln, idx) {
        var cells = ln.split(/[,\t]/).map(function (c) { return c.trim(); });
        var used = cells.filter(function (c) { return c.length; });
        if (!used.length) return;
        cells.forEach(function (c, ci) {
          if (!c.length) return;
          if (!cols[ci]) cols[ci] = [];
          if (idx === 0 && /^[\d\s.]*$/.test(c)) return; // 表头数字行跳过
          cols[ci].push(c);
        });
      });
      var n = cols.length;
      ensureLists(n);
      var headCells = lines[0] ? lines[0].split(/[,\t]/).map(function (c) { return c.trim(); }) : [];
      for (var j = 0; j < state.lists.length; j++) {
        state.lists[j].body = (cols[j] && cols[j].length) ? cols[j].join("\n") : "";
        var head = headCells[j];
        if (head && !/^[\d\s.]*$/.test(head)) state.lists[j].name = head;
      }
      buildInputs();
      toast(I18N[LANG].toastImported + n + " samples");
    } else {
      state.lists[target].body = text;
      toast(I18N[LANG].toastImported + filename);
      syncListInputs();
    }
    pushHistory();
    render();
    persist();
  }

  /* ======================== URL 分享 ======================== */
  function shareLink() {
    var st = state.style;
    var payload = {
      l: state.lists.map(function (l) { return [l.name, l.body, l.group || "", l.groupColor || ""]; }),
      ap: state.areaProp ? 1 : 0,

      ul: state.upsetLimit === 0 ? 0 : 30,
      ut: state.upsetTheme,
      sp: state.upsetSetPos,
      d: state.drag,
      s: {
        m: st.mode, p: st.perc ? 1 : 0, w: st.width, ls: st.labelSize, ns: st.numSize,
        ft: st.fit ? 1 : 0, fm: st.family, lc: st.labelColor, nc: st.numColor,
        sc: st.stroke, fl: st.fills, al: st.alpha,
        um: st.upsetMain, ud: st.upsetDim, us: st.upsetSet, utx: st.upsetText, uln: st.upsetLine
      }
    };
    var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    var url = location.origin + location.pathname + "#v=" + b64;
    var copy = function () {
      return navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject();
    };
    copy().then(function () { toast(I18N[LANG].toastCopied); })
      .catch(function () { prompt(I18N.zh.appName + " URL", url); });
  }
  function loadShared() {
    var m = /[#&]v=([^&]+)/.test(location.hash) ? location.hash.match(/[#&]v=([^&]+)/)[1] : null;
    if (!m) return false;
    try {
      var data = JSON.parse(decodeURIComponent(escape(atob(m))));
      if (!data.l) return false;
      state.lists = data.l.map(function (pair, i) {
        var p = pair || [];
        return {
          name: p[0] || "List " + (i + 1),
          body: p[1] || "",
          group: p[2] || "",
          groupColor: p[3] || GROUP_COLORS[i % GROUP_COLORS.length]
        };
      });
      if (!state.lists.length) state.lists = [makeList(0)];
      if (data.ap !== undefined) state.areaProp = !!data.ap;
      else if (data.wt !== undefined) state.areaProp = !!data.wt; // 旧版字段名
      if (data.d && data.d.label && data.d.num) state.drag = { label: data.d.label, num: data.d.num };

      if (data.ul !== undefined) state.upsetLimit = data.ul === 0 ? 0 : 30;
      if (UPSET_THEMES[data.ut]) state.upsetTheme = data.ut;
      state.upsetSetPos = data.sp === "right" ? "right" : "left";
      var s = data.s || {};
      if (!s.upsetMain) applyUpsetTheme(state.upsetTheme);
      if (s.m) state.style.mode = normalizeMode(s.m); // 旧分享链接可能是 "colored"/"BW"
      if (s.p !== undefined) state.style.perc = !!s.p;
      if (s.w) state.style.width = s.w;
      if (s.ls) state.style.labelSize = s.ls;
      if (s.ns) state.style.numSize = s.ns;
      if (s.ft !== undefined) state.style.fit = !!s.ft;
      if (s.fm) state.style.family = s.fm;
      if (s.lc !== undefined) state.style.labelColor = s.lc;
      if (s.nc) state.style.numColor = s.nc;
      if (s.sc) {
        state.style.stroke = s.sc;
        if (!s.uln) state.style.upsetLine = s.sc;
      }
      if (s.um) state.style.upsetMain = s.um;
      if (s.ud) state.style.upsetDim = s.ud;
      if (s.us) state.style.upsetSet = s.us;
      if (s.utx) state.style.upsetText = s.utx;
      if (s.uln) state.style.upsetLine = s.uln;
      if (Array.isArray(s.fl) && s.fl.length >= 4) {
        state.style.fills = s.fl.slice(0, DEFAULT_FILLS.length);
        if (state.style.fills.length < DEFAULT_FILLS.length) {
          var flBase = (state.style.mode === "colors" ? DEFAULT_FILLS : WHITE_FILLS);
          state.style.fills = state.style.fills.concat(flBase.slice(state.style.fills.length));
        }
      } else {
        // 旧链接（m="colored" / "BW"）没有逐色数组：按归一化后的模式补一套默认色，
        // 否则 "colors" 会顶着白填充渲染，取色器看着像失效。
        state.style.fills = (state.style.mode === "colors" ? DEFAULT_FILLS : WHITE_FILLS).slice();
      }
      if (s.al) state.style.alpha = s.al;
      buildInputs();
      pushHistory();
      syncControls();
      render();
      // 清理 hash，避免刷新又弹提示。注意必须放在同步/渲染之后并单独 try：
      // file:// 直接双击打开时 replaceState 会抛 SecurityError，若放在前面会把后面的同步整段吞掉。
      try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ }
      return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  /* ======================== i18n / 主题 / 布局 ======================== */
  function syncHint() {
    var h = $("hint");
    if (!h) return;
    if (state.groups > 4) h.innerHTML = I18N[LANG].importHintUpset + "<br>" + I18N[LANG].importHint;
    else h.innerHTML = state.areaProp ? I18N[LANG].importHintW : I18N[LANG].importHint;
  }
  function applyLang(l) {
    LANG = l;
    el.setAttribute("lang", l === "zh" ? "zh-CN" : "en");
    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      var k = node.getAttribute("data-i18n");
      if (I18N[l] && I18N[l][k] !== undefined) node.textContent = I18N[l][k];
    });
    var zb = $("langZh"), eb = $("langEn");
    if (zb) { zb.classList.toggle("active", l === "zh"); zb.setAttribute("aria-pressed", l === "zh" ? "true" : "false"); }
    if (eb) { eb.classList.toggle("active", l === "en"); eb.setAttribute("aria-pressed", l === "en" ? "true" : "false"); }
    var fe = $("findEl");
    if (fe) fe.setAttribute("placeholder", I18N[l].findPh);
    // 输入框占位与「导入/清除」文案跟随语言（这些元素是动态构建的，不在 data-i18n 里）
    for (var bi = 0; bi < state.lists.length; bi++) {
      var a2 = $("area" + bi);
      if (a2) {
        a2.setAttribute("placeholder", l === "zh"
          ? "列表 " + (bi + 1) + "，每行一个元素"
          : "List " + (bi + 1) + ", one element per row");
      }
      var dz = document.querySelector('.drop-zone[data-target="' + bi + '"]');
      if (dz) dz.textContent = "📁 " + I18N[l].importList;
      var clr = document.querySelector('.clear-link[data-target="' + bi + '"]');
      if (clr) clr.textContent = "✕ " + I18N[l].clearList;
      var g2 = $("group" + bi);
      if (g2) g2.setAttribute("placeholder", I18N[l].groupPlaceholder);
    }
    setDensity(ui.compact, true);
    syncHint();
    render();
  }
  function setLang(l) {
    try { localStorage.setItem("setplotsvg-lang", l); } catch (e) { /* ignore */ }
    applyLang(l);
  }
  function setTheme(dark) {
    el.setAttribute("data-theme", dark ? "dark" : "light");
    $("themeBtn").textContent = dark ? "☀️" : "🌙";
    try { localStorage.setItem("setplotsvg-theme", dark ? "dark" : "light"); } catch (e) { /* ignore */ }
  }
  function setDensity(compact, silent) {
    ui.compact = !!compact;
    document.body.classList.toggle("compact", ui.compact);
    var t = $("densityText");
    if (t) t.textContent = ui.compact ? I18N[LANG].densCompact : I18N[LANG].densWide;
    var b = $("btnDensity");
    if (b) b.setAttribute("aria-pressed", ui.compact ? "true" : "false");
    if (!silent) persist();
  }
  function toast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  /* ======================== UI 构建 ======================== */
  function ensureLists(n) {
    while (state.lists.length < n) state.lists.push(makeList(state.lists.length));
  }

  function syncMoveButtons() {
    var btns = document.querySelectorAll("#listCards .move-btn");
    Array.prototype.forEach.call(btns, function (b) {
      var i = parseInt(b.getAttribute("data-list"), 10);
      b.disabled = (b.getAttribute("data-move") === "up" && i === 0) ||
        (b.getAttribute("data-move") === "down" && i === state.lists.length - 1);
    });
  }

  function syncListInputs() {
    for (var i = 0; i < state.lists.length; i++) {
      var n = $("name" + i), a = $("area" + i), gr = $("group" + i), gc = $("gcolor" + i);
      if (n) n.value = state.lists[i].name;
      if (a) a.value = state.lists[i].body;
      if (gr) gr.value = state.lists[i].group;
      if (gc) gc.value = state.lists[i].groupColor;
    }
    syncMoveButtons();
  }

  // 调整整组顺序：只交换列表数据（名称/内容），颜色与填充按位置保留。
  // 区域掩码、拖拽位置、查找/选中都依赖旧位序，重排后清空。
  function moveList(idx, dir) {
    var j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= state.lists.length) return;
    pushHistory();
    var tmp = state.lists[idx];
    state.lists[idx] = state.lists[j];
    state.lists[j] = tmp;
    state.drag = { label: {}, num: {} };
    state.selected = null;
    state.found = [];
    state.search = "";
    var fe = $("findEl"); if (fe) { fe.value = ""; fe.classList.remove("miss"); }
    var names = $("names"); if (names) names.value = "";
    syncListInputs();
    render();
    persist();
  }

  function addSample() {
    pushHistory();
    state.lists.push(makeList(state.lists.length));
    buildInputs();
    render(); persist();
    var cards = document.querySelectorAll("#listCards .list-card");
    if (cards.length && cards[cards.length - 1].scrollIntoView) {
      cards[cards.length - 1].scrollIntoView({ block: "nearest" });
    }
  }

  function removeSample(idx) {
    if (idx < 0 || idx >= state.lists.length) return;
    if (state.lists.length <= 1) { toast(I18N[LANG].keepOneSample); return; }
    if ((state.lists[idx].body || "").trim() && !confirm(I18N[LANG].removeConfirm)) return;
    pushHistory();
    state.lists.splice(idx, 1);
    state.drag = { label: {}, num: {} };
    state.selected = null;
    state.found = [];
    state.search = "";
    var fe = $("findEl"); if (fe) { fe.value = ""; fe.classList.remove("miss"); }
    var names = $("names"); if (names) names.value = "";
    buildInputs();
    render(); persist();
  }

  function buildInputs() {
    var wrap = $("listCards");
    wrap.innerHTML = "";
    for (var i = 0; i < state.lists.length; i++) {
      var card = document.createElement("div");
      card.className = "list-card";
      card.style.setProperty("--c", COLLECT_COLOR[i % COLLECT_COLOR.length]);
      card.innerHTML =
        '<div class="list-head">' +
        '  <input type="text" id="name' + i + '" maxlength="24" value="' + esc(state.lists[i].name) + '" aria-label="List name">' +
        '  <span class="list-moves">' +
        '    <button type="button" class="move-btn move-up" data-move="up" data-list="' + i + '" title="上移 / Move up" aria-label="Move up">↑</button>' +
        '    <button type="button" class="move-btn move-down" data-move="down" data-list="' + i + '" title="下移 / Move down" aria-label="Move down">↓</button>' +
        "  </span>" +
        '  <span class="list-count" id="count' + i + '">0</span>' +
        "</div>" +
        '<textarea id="area' + i + '" rows="5" placeholder="' + esc(LANG === "zh" ? "列表 " + (i + 1) + "，每行一个元素" : "List " + (i + 1) + ", one element per row") + '" aria-label="List ' + (i + 1) + '"></textarea>' +
        '<div class="list-group-row">' +
        '  <input type="text" id="group' + i + '" maxlength="24" value="' + esc(state.lists[i].group || "") + '" placeholder="' + esc(I18N[LANG].groupPlaceholder) + '" aria-label="Experimental group">' +
        '  <input type="color" id="gcolor' + i + '" value="' + (state.lists[i].groupColor || GROUP_COLORS[i % GROUP_COLORS.length]) + '" title="实验分组颜色 / Group color">' +
        "</div>" +
        '<div class="list-foot">' +
        '  <label class="drop-zone" data-target="' + i + '">📁 ' + esc(I18N[LANG].importList) + "</label>" +
        '  <span class="clear-link" data-target="' + i + '">✕ ' + esc(I18N[LANG].clearList) + "</span>" +
        '  <span class="remove-sample" data-remove="' + i + '" title="删除样本 / Remove sample">🗑</span>' +
        "</div>";
      wrap.appendChild(card);
      var nameEl = card.querySelector("#name" + i);
      var areaEl = card.querySelector("#area" + i);
      areaEl.value = state.lists[i].body;
      nameEl.addEventListener("input", function (idx, ev) {
        state.lists[idx].name = ev.target.value;
        markChanged();
      }.bind(null, i));
      areaEl.addEventListener("input", function (idx, ev) {
        state.lists[idx].body = ev.target.value;
        markChanged();
      }.bind(null, i));
      var groupEl = card.querySelector("#group" + i);
      var gcolorEl = card.querySelector("#gcolor" + i);
      groupEl.addEventListener("input", function (idx, ev) {
        var v = ev.target.value;
        state.lists[idx].group = v;
        // 同名分组自动沿用已有颜色，避免同一实验分组显示成两种颜色
        var gn = v.trim();
        if (gn) {
          for (var j = 0; j < state.lists.length; j++) {
            if (j !== idx && (state.lists[j].group || "").trim() === gn) {
              state.lists[idx].groupColor = state.lists[j].groupColor || GROUP_COLORS[idx % GROUP_COLORS.length];
              var gc = $("gcolor" + idx);
              if (gc) gc.value = state.lists[idx].groupColor;
              break;
            }
          }
        }
        markChanged();
      }.bind(null, i));
      gcolorEl.addEventListener("input", function (idx, ev) {
        state.lists[idx].groupColor = ev.target.value;
        markChanged();
      }.bind(null, i));
    }
    if (!wrap._bound) {
      wrap._bound = true;
      wrap.addEventListener("click", function (ev) {
        var rm = ev.target.closest("[data-remove]");
        if (rm) {
          removeSample(parseInt(rm.getAttribute("data-remove"), 10));
          return;
        }
        var mv = ev.target.closest("[data-move]");
        if (mv) {
          moveList(parseInt(mv.getAttribute("data-list"), 10), mv.getAttribute("data-move"));
          return;
        }
        var drop = ev.target.closest("[data-target]");
        if (!drop) return;
        var idx = parseInt(drop.getAttribute("data-target"), 10);
        if (drop.classList.contains("clear-link")) {
          state.lists[idx].body = "";
          var a = $("area" + idx); if (a) a.value = "";
          pushHistory();
          render(); persist();
        } else if (drop.classList.contains("drop-zone")) {
          fileTarget = idx;
          $("fileInput").click();
        }
      });
    }
    if (!ui.inputGlobalsBound) {
      ui.inputGlobalsBound = true;
      document.addEventListener("dragover", function (ev) { ev.preventDefault(); document.body.classList.add("dragging-file"); });
      document.addEventListener("dragleave", function (ev) {
        if (!ev.relatedTarget) document.body.classList.remove("dragging-file");
      });
      document.addEventListener("drop", function (ev) {
        ev.preventDefault();
        document.body.classList.remove("dragging-file");
        var files = ev.dataTransfer && ev.dataTransfer.files;
        if (files && files.length) readFile(files[0], fileTarget ?? 0);
      });
      var fi = $("fileInput");
      fi.addEventListener("change", function () {
        var f = fi.files && fi.files[0];
        if (f) readFile(f, fileTarget ?? 0);
        fi.value = "";
      });
    }
    syncMoveButtons();
  }

  function readFile(file, target) {
    var reader = new FileReader();
    reader.onload = function () { importText(String(reader.result || ""), file.name, target); };
    reader.readAsText(file);
  }

  function updatePosBtn() {
    var b = $("btnResetPos");
    if (!b) return;
    var n = dragCount();
    var sp = b.querySelector("span");
    b.disabled = n === 0;
    b.style.opacity = n === 0 ? "0.5" : "";
    b.title = n ? (LANG === "zh" ? "已移动 " + n + " 处，点击全部复位" : n + " moved — click to reset all") : (LANG === "zh" ? "没有移动过的文字" : "Nothing moved yet");
    if (sp) sp.textContent = I18N[LANG].resetPos + (n ? " (" + n + ")" : "");
  }

  /* ======================== 控制绑定 ======================== */
  // 取色器与透明度回填（切「经典配色」后也要立刻刷新，保证控件与图一致）
  function syncFillInputs() {
    for (var i = 0; i < DEFAULT_FILLS.length; i++) {
      var f = $("fill" + i);
      if (f) f.value = (state.style.fills && state.style.fills[i]) || WHITE_FILLS[i % WHITE_FILLS.length];
    }
    var ar = $("alphaRange");
    if (ar) ar.value = state.style.alpha;
  }

  function syncControls() {
    $("selStyle").value = state.style.mode;
    $("chkPerc").checked = state.style.perc;
    $("widthBox").value = state.style.width;
    $("labelSizeBox").value = state.style.labelSize;
    $("numSizeBox").value = state.style.numSize;
    $("chkFit").checked = state.style.fit;
    $("selFamily").value = state.style.family;
    $("chkWeight").checked = state.areaProp;

    $("labelColor").value = state.style.labelColor || "#000000";
    $("numColor").value = state.style.numColor || DEFAULT_NUM_COLOR;
    $("strokeColor").value = state.style.stroke || DEFAULT_STROKE;
    ["upsetMain", "upsetDim", "upsetSet", "upsetText", "upsetLine"].forEach(function (id) {
      var el = $(id); if (el) el.value = state.style[id];
    });
    syncFillInputs();
    $("btnMore").setAttribute("aria-expanded", ui.more ? "true" : "false");
    $("toolbarExtra").hidden = !ui.more;
    $("btnStats").setAttribute("aria-expanded", ui.stats ? "true" : "false");
    $("btnStats").setAttribute("aria-pressed", ui.stats ? "true" : "false");
    $("statsPanel").hidden = !ui.stats;
    syncHint();
    updatePosBtn();
  }

  function bindControls() {
    syncControls();
    var st = state.style;
    var re = function () { render(); persist(); };
    // 常用一排
    $("selStyle").addEventListener("change", function () {
      // 选「经典配色」时把取色器同步成经典 Venny 蓝/黄/绿/红，切回「自定义填充」还能接着调
      if (this.value === "colors") { st.fills = DEFAULT_FILLS.slice(); syncFillInputs(); }
      st.mode = this.value; re();
    });
    $("chkPerc").addEventListener("change", function () { st.perc = this.checked; re(); });
    $("widthBox").addEventListener("input", function () { st.width = Math.max(1, Math.min(20, parseInt(this.value, 10) || 1)); re(); });
    $("numSizeBox").addEventListener("input", function () { st.numSize = Math.max(6, Math.min(80, parseInt(this.value, 10) || 6)); re(); });
    $("widthMinus").addEventListener("click", function () { $("widthBox").value = Math.max(1, st.width - 1); st.width = parseInt($("widthBox").value, 10); re(); });
    $("widthPlus").addEventListener("click", function () { $("widthBox").value = Math.min(20, st.width + 1); st.width = parseInt($("widthBox").value, 10); re(); });
    $("numMinus").addEventListener("click", function () { $("numSizeBox").value = Math.max(6, st.numSize - 1); st.numSize = parseInt($("numSizeBox").value, 10); re(); });
    $("numPlus").addEventListener("click", function () { $("numSizeBox").value = Math.min(80, st.numSize + 1); st.numSize = parseInt($("numSizeBox").value, 10); re(); });
    $("btnMore").addEventListener("click", function () {
      ui.more = !ui.more;
      this.setAttribute("aria-expanded", ui.more ? "true" : "false");
      $("toolbarExtra").hidden = !ui.more;
      persist();
    });
    // 更多面板
    $("selFamily").addEventListener("change", function () { st.family = this.value; re(); });
    $("labelSizeBox").addEventListener("input", function () { st.labelSize = Math.max(6, Math.min(80, parseInt(this.value, 10) || 6)); re(); });
    $("labelMinus").addEventListener("click", function () { $("labelSizeBox").value = Math.max(6, st.labelSize - 2); st.labelSize = parseInt($("labelSizeBox").value, 10); re(); });
    $("labelPlus").addEventListener("click", function () { $("labelSizeBox").value = Math.min(80, st.labelSize + 2); st.labelSize = parseInt($("labelSizeBox").value, 10); re(); });
    $("chkFit").addEventListener("change", function () { st.fit = this.checked; re(); });
    $("labelColor").addEventListener("input", function () { st.labelColor = this.value; re(); });
    $("labelColorAuto").addEventListener("click", function () {
      st.labelColor = "";
      $("labelColor").value = "#000000";
      re();
    });
    $("numColor").addEventListener("input", function () { st.numColor = this.value; re(); });
    $("numColorAuto").addEventListener("click", function () {
      st.numColor = DEFAULT_NUM_COLOR;
      $("numColor").value = DEFAULT_NUM_COLOR;
      re();
    });
    $("strokeColor").addEventListener("input", function () {
      st.stroke = this.value;
      st.upsetLine = this.value;   // 与 UpSet 线条/点颜色联动
      var ul = $("upsetLine"); if (ul) ul.value = this.value;
      re();
    });
    ["upsetMain", "upsetDim", "upsetSet", "upsetText", "upsetLine"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", function () { st[id] = this.value; re(); });
    });
    for (var i = 0; i < DEFAULT_FILLS.length; i++) {
      (function (idx) {
        var f = $("fill" + idx);
        if (f) f.addEventListener("input", function () { st.fills[idx] = this.value; re(); });
      })(i);
    }
    $("fillAuto").addEventListener("click", function () {
      st.fills = DEFAULT_FILLS.slice();   // ↺ 回到经典 Venny 蓝/黄/绿/红
      syncFillInputs();
      re();
    });
    $("alphaRange").addEventListener("input", function () { st.alpha = parseInt(this.value, 10) || 50; re(); });

    // 权重模式
    $("chkWeight").addEventListener("change", function () {
      state.areaProp = this.checked;
      fitSeed = {};   // 换模式重新拟合，别把上次的起点带过来
      syncHint();
      re();
    });

    // UpSet 显示数量 / 主题切换
    var selLimit = $("selUpsetLimit");
    if (selLimit) selLimit.addEventListener("change", function () {
      state.upsetLimit = this.value === "all" ? 0 : 30;
      render();
      persist();
    });
    var selTheme = $("selUpsetTheme");
    if (selTheme) selTheme.addEventListener("change", function () {
      state.upsetTheme = UPSET_THEMES[this.value] ? this.value : "nature";
      applyUpsetTheme(state.upsetTheme);
      render();
      persist();
    });
    var selSetPos = $("selUpsetSetPos");
    if (selSetPos) selSetPos.addEventListener("change", function () {
      state.upsetSetPos = this.value === "right" ? "right" : "left";
      render();
      persist();
    });

    // 输入区操作
    $("btnUpper").addEventListener("click", function () { pushHistory(); transformLists("upper"); });
    $("btnLower").addEventListener("click", function () { pushHistory(); transformLists("lower"); });
    $("btnExample").addEventListener("click", loadExample);
    $("btnAddSample").addEventListener("click", addSample);
    $("btnClearAll").addEventListener("click", function () {
      if (!confirm(I18N[LANG].clearConfirm)) return;
      pushHistory();
      for (var k = 0; k < state.lists.length; k++) {
        state.lists[k].body = "";
        state.lists[k].name = "List " + (k + 1);
        state.lists[k].group = "";
        state.lists[k].groupColor = GROUP_COLORS[k % GROUP_COLORS.length];
      }
      syncListInputs();
      render(); persist();
    });
    $("btnUndo").addEventListener("click", undo);
    $("btnRedo").addEventListener("click", redo);
    $("btnShare").addEventListener("click", shareLink);
    $("btnCopy").addEventListener("click", function () {
      var ta = $("names");
      if (!ta.value) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(ta.value).then(function () { toast(I18N[LANG].toastCopied); }, function () { fallbackCopy(ta); });
      } else fallbackCopy(ta);
    });
    $("btnCsv").addEventListener("click", exportCSV);
    $("btnExportSvg").addEventListener("click", doExportSVG);
    $("btnExportPng").addEventListener("click", doExportPNG);
    $("themeBtn").addEventListener("click", function () { setTheme(el.getAttribute("data-theme") !== "dark"); });
    $("langZh").addEventListener("click", function () { setLang("zh"); });
    $("langEn").addEventListener("click", function () { setLang("en"); });
    $("btnDensity").addEventListener("click", function () { setDensity(!ui.compact); });
    $("btnStats").addEventListener("click", function () {
      ui.stats = !ui.stats;
      $("statsPanel").hidden = !ui.stats;
      this.setAttribute("aria-expanded", ui.stats ? "true" : "false");
      this.setAttribute("aria-pressed", ui.stats ? "true" : "false");
      persist();
    });
    $("btnResetPos").addEventListener("click", resetDragAll);

    // 元素查找
    var findTimer = null;
    $("findEl").addEventListener("input", function () {
      var v = this.value;
      clearTimeout(findTimer);
      findTimer = setTimeout(function () { findElements(v.trim()); }, 160);
    });
    $("findEl").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { clearTimeout(findTimer); findElements(this.value.trim()); }
      if (ev.key === "Escape") { this.value = ""; clearTimeout(findTimer); findElements(""); }
    });
    $("btnFindClear").addEventListener("click", function () {
      var fe = $("findEl");
      fe.value = ""; fe.classList.remove("miss");
      clearTimeout(findTimer);
      findElements("");
    });

    // SVG 交互：悬停高亮 / 点击选中 / 拖拽 / 双击复位
    var dragAct = null;
    var suppressClickUntil = 0;

    svg.addEventListener("pointerdown", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-grab]") : null;
      if (!t || (ev.button !== undefined && ev.button > 0)) return;
      var id = t.getAttribute("data-grab");
      var sp = id.indexOf(":");
      var kind = id.slice(0, sp), key = id.slice(sp + 1);
      dragAct = {
        kind: kind, key: key, node: t, moved: false,
        start: svgUnits(ev), base: dragOff(kind, key), cur: dragOff(kind, key)
      };
      t.classList.add("dragging");
      tipHide();
      if (t.setPointerCapture && ev.pointerId !== undefined) { try { t.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } }
      if (ev.preventDefault) ev.preventDefault();
    });

    function endDrag() {
      if (!dragAct) return;
      var a = dragAct;
      dragAct = null;
      a.node.classList.remove("dragging");
      if (!a.moved) return;
      setDrag(a.kind, a.key, a.cur[0], a.cur[1]);
      suppressClickUntil = Date.now() + 300;
      render();
      persist();
    }

    svg.addEventListener("pointermove", function (ev) {
      if (dragAct) {
        var p = svgUnits(ev);
        var dx = a2(dragAct.base[0] + (p.x - dragAct.start.x));
        var dy = a2(dragAct.base[1] + (p.y - dragAct.start.y));
        if (Math.abs(dx - dragAct.base[0]) > 0.6 || Math.abs(dy - dragAct.base[1]) > 0.6) dragAct.moved = true;
        dragAct.cur = [dx, dy];
        moveNode(dragAct.node, dx, dy);
        return;
      }
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-mask]") : null;

      var note = $("stageNote");
      if (!note) return;
      if (t) {
        var k = t.getAttribute("data-mask");
        note.textContent = describeRegion(k);
        if (ev.target.classList && ev.target.classList.contains("qm")) tipShow(ev, ev.target.getAttribute("data-tip") + " · " + I18N[LANG].qmTip);
        else tipHide();
      } else {
        note.textContent = I18N[LANG].noteClick;
        tipHide();
      }
    });
    svg.addEventListener("pointerleave", function () {
      if (dragAct) return;
      tipHide();
      var note = $("stageNote");
      if (note) note.textContent = state.search ? note.textContent : I18N[LANG].noteClick;
    });
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", function () {
      if (!dragAct) return;
      dragAct.node.classList.remove("dragging");
      dragAct = null;
      render();
    });
    if (typeof window !== "undefined") window.addEventListener("pointerup", endDrag);

    svg.addEventListener("click", function (ev) {
      if (Date.now() < suppressClickUntil) return;
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-mask]") : null;
      if (!t) return;
      if (state.search) { // 点区域=明确想看图，退出查找高亮
        state.search = ""; state.found = [];
        var fe = $("findEl");
        if (fe) { fe.value = ""; fe.classList.remove("miss"); }
        applyFoundClasses();
      }
      select(t.getAttribute("data-mask"));
    });
    svg.addEventListener("dblclick", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-grab]") : null;
      if (!t) return;
      var id = t.getAttribute("data-grab");
      var sp = id.indexOf(":");
      var kind = id.slice(0, sp), key = id.slice(sp + 1);
      if (state.drag[kind] && state.drag[kind][key]) {
        delete state.drag[kind][key];
        render(); persist();
        toast(I18N[LANG].toastPosReset);
      }
    });

    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (!(e.ctrlKey || e.metaKey)) return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) { e.preventDefault(); redo(); }
        else { e.preventDefault(); undo(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    });
  }

  function a2(v) { return Math.round(v * 10) / 10; }

  function fallbackCopy(ta) {
    ta.removeAttribute("readonly");
    ta.select();
    try { document.execCommand("copy"); toast(I18N[LANG].toastCopied); } catch (e) { toast(I18N[LANG].toastFailed); }
    ta.setAttribute("readonly", "");
    ta.setSelectionRange(0, 0);
  }

  function transformLists(mode) {
    for (var i = 0; i < state.lists.length; i++) {
      state.lists[i].body = mode === "upper" ? state.lists[i].body.toUpperCase() : state.lists[i].body.toLowerCase();
      var a = $("area" + i); if (a) a.value = state.lists[i].body;
    }
    render(); persist();
  }

  function loadExample() {
    pushHistory();
    var names = ["Control A", "Control B", "Control C", "Control D",
      "Treatment A", "Treatment B", "Treatment C", "Treatment D"];
    var ex = names.map(function (name, i) {
      var items = [];
      for (var n = 1; n <= 120; n++) {
        var included = n <= 12 ||
          (n <= 36 && (n + i * 2) % 5 !== 0) ||
          (n <= 60 && (n + i) % 4 < 2) ||
          (n <= 84 && (n * 3 + i) % 7 < 3) ||
          (n > 84 && n % 8 === i);
        if (included) items.push("Gene-" + String(n).padStart(3, "0"));
      }
      return {
        name: name,
        body: items.join("\n"),
        group: i < 4 ? "Control" : "Treatment",
        groupColor: GROUP_COLORS[i % GROUP_COLORS.length]
      };
    });
    state.lists = ex;
    state.drag = { label: {}, num: {} };
    state.selected = null;
    state.found = [];
    state.search = "";
    buildInputs();
    render(); persist();
  }

  /* ======================== 初始化 ======================== */
  function init() {
    svg = $("vennSvg");

    var savedTheme = null;
    try { savedTheme = localStorage.getItem("setplotsvg-theme") || localStorage.getItem("theme"); } catch (e) { /* ignore */ }
    if (savedTheme) setTheme(savedTheme === "dark");
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme(true);
    else setTheme(false);

    var savedLang = null;
    try { savedLang = localStorage.getItem("setplotsvg-lang"); } catch (e) { /* ignore */ }
    if (savedLang !== "zh" && savedLang !== "en") savedLang = "zh";

    restore();
    buildInputs();
    bindControls();
    applyLang(savedLang);

    var shared = loadShared();
    if (shared) toast(I18N[LANG].toastShared);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
