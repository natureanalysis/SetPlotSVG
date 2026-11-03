/* 跑 tests/ 下全部 jsdom 回归测试并汇总红/绿。
   用法：node tools/test.mjs [文件名 ...]      不给参数就跑全部
   退出码：有失败即 1（可直接用于 CI）。 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DIR = path.join(ROOT, "tests");

const want = process.argv.slice(2).filter(a => !a.startsWith("--"));
const files = fs.readdirSync(TEST_DIR)
  .filter(f => f.endsWith(".js") && (want.length ? want.includes(f) : true))
  .sort();

const bad = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(TEST_DIR, f)], { cwd: ROOT, encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const last = out.trim().split("\n").filter(Boolean).pop() || "";
  const fails = out.split("\n").filter(l => /^(FAIL|✗)/.test(l));
  const ok = r.status === 0;
  console.log(`${ok ? "✓" : "✗"} ${f.padEnd(26)} ${last.slice(0, 70)}`);
  if (!ok) {
    bad.push(f);
    fails.slice(0, 8).forEach(l => console.log("    " + l.slice(0, 160)));
    if (!fails.length && out) console.log(out.trim().split("\n").slice(-12).map(l => "    " + l).join("\n"));
  }
}
console.log(bad.length
  ? `\n失败 ${bad.length}/${files.length}：${bad.join(", ")}`
  : `\n全部通过（${files.length} 个测试文件）`);
process.exit(bad.length ? 1 : 0);