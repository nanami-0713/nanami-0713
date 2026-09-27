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

// ── 块 1：仓库总览 ────────────────────────────────────────────
const stats = await block("stats", async () => {
  const repos = await gh(`/users/${OWNER}/repos?per_page=100`);
  const stars = repos.reduce((s, r) => s + r.stargazers_count, 0);
  const top = repos
    .filter(r => r.stargazers_count > 0)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5)
    .map(r => `[${r.name}](${r.html_url}) ×${r.stargazers_count}`);
  const langs = {};
  for (const r of repos) if (r.language) langs[r.language] = (langs[r.language] ?? 0) + 1;
  const langStr = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l]) => l).join(" · ");
  return [
    "### 📊 Overview",
    `**${repos.length}** public repos · **${stars}** stars total · Languages: ${langStr}`,
    top.length ? `Most starred: ${top.join(" · ")}` : "",
  ].filter(Boolean).join("\n");
});

// ── 块 2：最近发布（跨仓库 release 流）─────────────────────────
const releases = await block("releases", async () => {
  const repos = await gh(`/users/${OWNER}/repos?per_page=100&sort=updated`);
  const out = [];
  for (const r of repos) {
    try {
      const rel = await gh(`/repos/${OWNER}/${r.name}/releases/latest`);
      out.push({ repo: r.name, tag: rel.tag_name, name: rel.name, url: rel.html_url, date: fmtDate(rel.published_at) });
    } catch { /* 404 = 无 release，正常 */ }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  const lines = out.slice(0, 5)
    .map(x => `- **${x.date}** [${x.repo} · ${x.tag}](${x.url})${x.name ? ` — ${x.name}` : ""}`);
  return ["### 📦 Recent releases", ...(lines.length ? lines : ["(no recent releases)"])].join("\n");
});

// ── 块 3：近 7 天公开活动 ─────────────────────────────────────
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
  const lines = Object.entries(byRepo)
    .sort((a, b) => (b[1].commits + b[1].release) - (a[1].commits + a[1].release))
    .map(([repo, b]) => {
      const parts = [];
      if (b.commits) parts.push(`${b.commits} commits`);
      if (b.release) parts.push(`${b.release} releases`);
      if (b.other) parts.push(`${b.other} events`);
      return `- **${repo}** — ${parts.join(" · ")}`;
    });
  return ["### 🛰 Last 7 days", ...(lines.length ? lines : ["(quiet this week)"])].join("\n");
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
