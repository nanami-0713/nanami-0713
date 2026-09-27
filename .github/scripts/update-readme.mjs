// 活文档生成器：抓取公开 GitHub 数据，注入 README 的 AUTO 标记区。
// 纪律：单块失败保留旧内容（宁可陈旧，不可洗白）；无变化不写文件。
import { readFile, writeFile } from "node:fs/promises";

const OWNER = "nanami-0713";
const headers = {
  "User-Agent": "nanami-readme-bot",
  Accept: "application/vnd.github+json",
};
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

const fmtDate = (iso) => (iso ?? "").slice(0, 10);
const esc = (s) => (s ?? "").replace(/\|/g, "\\|").trim();
const withRetry = async (fn, n = 3) => {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= n) throw e;
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
};

async function block(name, gen) {
  try {
    const body = await withRetry(gen);
    return `<!-- AUTO:${name} 开始 -->\n${body}\n<!-- AUTO:${name} 结束 -->`;
  } catch (e) {
    console.error(`[跳过] ${name}: ${e.message}`);
    return null;
  }
}

const md = await readFile("README.md", "utf8");

// ── 块 1：Overview（迷你表格 + 语言行）────────────────────────
const stats = await block("stats", async () => {
  const repos = await gh(`/users/${OWNER}/repos?per_page=100`);
  const stars = repos.reduce((s, r) => s + r.stargazers_count, 0);
  const top = repos
    .filter(r => r.stargazers_count > 0)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 3)
    .map(r => `[${r.name}](${r.html_url}) ×${r.stargazers_count}`);
  const langs = {};
  for (const r of repos) if (r.language) langs[r.language] = (langs[r.language] ?? 0) + 1;
  const langStr = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l]) => l).join(" · ");
  return [
    "| Repos | Stars | Most starred |",
    "|:-:|:-:|:-:|",
    `| **${repos.length}** | **${stars}** | ${top.length ? top.join(" · ") : "—"} |`,
    "",
    `Languages: ${langStr}`,
  ].join("\n");
});

// ── 块 2：Recent releases（日期表）────────────────────────────
const releases = await block("releases", async () => {
  const repos = await gh(`/users/${OWNER}/repos?per_page=100&sort=updated`);
  const out = [];
  for (const r of repos) {
    try {
      const rel = await gh(`/repos/${OWNER}/${r.name}/releases/latest`);
      let note = esc(rel.name);
      // 去掉与 repo·tag 重复的前缀，表格里不重复占宽
      try {
        note = note
          .replace(new RegExp(`^${r.name}\\s*`, "i"), "")
          .replace(new RegExp(`^${rel.tag_name}\\s*[—–-]*\\s*`, "i"), "")
          .replace(/^[—–-]+\s*/, "");
      } catch { /* 正则元字符时保留原文 */ }
      out.push({ repo: r.name, tag: rel.tag_name, note, url: rel.html_url, date: fmtDate(rel.published_at) });
    } catch { /* 404 = 无 release，正常 */ }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows = out.slice(0, 5).map(x =>
    `| **${x.date}** | [${x.repo} · ${x.tag}](${x.url}) | ${x.note || "—"} |`);
  return [
    "### 📦 Recent releases",
    ...(rows.length ? [
      "| Date | Release | Notes |",
      "|---|---|---|",
      ...rows,
    ] : ["(no recent releases)"]),
  ].join("\n");
});

// ── 块 3：Last 7 days（横条图 + 折叠长尾）─────────────────────
const activity = await block("activity", async () => {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const events = [];
  for (let page = 1; page <= 3; page++) {
    const evs = await gh(`/users/${OWNER}/events/public?per_page=100&page=${page}`);
    events.push(...evs);
    if (evs.length < 100) break;
  }
  const byRepo = {};
  for (const e of events.filter(e => e.created_at >= since)) {
    const repo = e.repo.name.split("/")[1];
    const b = (byRepo[repo] ??= { commits: 0, release: 0, other: 0 });
    if (e.type === "PushEvent") { b.commits += e.payload.size ?? 1; }
    else if (e.type === "ReleaseEvent") { b.release++; }
    else { b.other++; }
  }
  const rows = Object.entries(byRepo)
    .map(([repo, b]) => ({ repo, b, score: b.commits + b.release * 2 + b.other }))
    .sort((a, b) => b.score - a.score);
  if (!rows.length) {
    return ["### 🛰 Last 7 days", "(quiet this week)"].join("\n");
  }
  const max = Math.max(...rows.map(r => r.score), 1);
  const bar = (s) => { const n = Math.min(10, Math.max(1, Math.round((s / max) * 10))); return "█".repeat(n) + "░".repeat(10 - n); };
  const link = (repo) => `[${repo}](/${OWNER}/${repo})`;
  const totals = rows.reduce((t, r) => ({ c: t.c + r.b.commits, e: t.e + r.b.release + r.b.other }), { c: 0, e: 0 });
  const row = (r) => `| ${link(r.repo)} | ${bar(r.score)} | ${r.b.commits} | ${r.b.release + r.b.other} |`;
  const table = (items) => [
    "| Repository | Activity | Commits | Events |",
    "|---|---|:-:|:-:|",
    ...items.map(row),
  ];
  const head = [
    "### 🛰 Last 7 days",
    `**${rows.length}** repos active · **${totals.c}** commits · **${totals.e}** events`,
    "",
    ...table(rows.slice(0, 8)),
  ];
  const rest = rows.slice(8);
  if (rest.length) {
    head.push(
      "",
      "<details>",
      `<summary>…and ${rest.length} more active repos</summary>`,
      "",
      ...table(rest),
      "",
      "</details>",
    );
  }
  return head.join("\n");
});

let out = md;
for (const [name, blk] of [["stats", stats], ["releases", releases], ["activity", activity]]) {
  if (!blk) continue; // 失败的块保留旧内容
  const re = new RegExp(`<!-- AUTO:${name} 开始 -->[\\s\\S]*?<!-- AUTO:${name} 结束 -->`);
  out = re.test(out)
    ? out.replace(re, blk)
    : out.replace(/\n## 联系/, `\n${blk}\n\n## 联系`); // 首次装载：插到「联系」之前
}

if (out !== md) {
  await writeFile("README.md", out);
  console.log("README 已更新");
} else {
  console.log("内容无变化");
}
