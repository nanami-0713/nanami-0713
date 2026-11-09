#!/usr/bin/env python3
"""
生成 GitHub profile 像素 CRT 屏幕：screen.svg
- 头像：从 GitHub 下载 → 48×48 网格 → Game Boy 四色量化 → SVG 方块矩阵（逐行扫描入场）
- 信息：5×7 手写像素字模 → path 方块字（打字机入场）
改字段（年龄/语言/OS）→ 改 INFO dict → 重跑本脚本
"""
import urllib.request
from PIL import Image, ImageOps

AVATAR_URL = "https://avatars.githubusercontent.com/nanami-0713?v=4"
GRID = 48                 # 头像采样网格
S = 6                     # 头像像素块边长
# Game Boy 调色板（暗 → 亮）
PAL = ["#1d3d18", "#2d6023", "#65aa50", "#97c579"]
SCREEN_BG = "#ecf0d6"

INFO = [
    ("NAME", "NANAMI"),
    ("BORN", "2003"),
    ("LANG", "ZH·EN·TS·RUST"),
    ("OS",   "MACOS·ANDROID"),
]

F = {  # 5×7 像素字模
"A":"01110 10001 10001 11111 10001 10001 10001","B":"11110 10001 11110 10001 10001 10001 11110",
"C":"01111 10000 10000 10000 10000 10000 01111","D":"11110 10001 10001 10001 10001 10001 11110",
"E":"11111 10000 11110 10000 10000 10000 11111","F":"11111 10000 11110 10000 10000 10000 10000",
"G":"01111 10000 10000 10111 10001 10001 01110","H":"10001 10001 11111 10001 10001 10001 10001",
"I":"11111 00100 00100 00100 00100 00100 11111","J":"00111 00010 00010 00010 00010 10010 01100",
"K":"10001 10010 11100 10010 10001 10001 10001","L":"10000 10000 10000 10000 10000 10000 11111",
"M":"10001 11011 10101 10101 10001 10001 10001","N":"10001 11001 10101 10011 10001 10001 10001",
"O":"01110 10001 10001 10001 10001 10001 01110","P":"11110 10001 10001 11110 10000 10000 10000",
"Q":"01110 10001 10001 10001 10101 10010 01101","R":"11110 10001 10001 11110 10010 10001 10001",
"S":"01111 10000 10000 01110 00001 00001 11110","T":"11111 00100 00100 00100 00100 00100 00100",
"U":"10001 10001 10001 10001 10001 10001 01110","V":"10001 10001 10001 10001 10001 01010 00100",
"W":"10001 10001 10001 10101 10101 11011 10001","X":"10001 01010 00100 00100 01010 10001 10001",
"Y":"10001 10001 01010 00100 00100 00100 00100","Z":"11111 00001 00010 00100 01000 10000 11111",
"0":"01110 10001 10011 10101 11001 10001 01110","1":"00100 01100 00100 00100 00100 00100 01110",
"2":"01110 10001 00001 00110 01000 10000 11111","3":"11110 00001 00001 01110 00001 00001 11110",
"4":"00010 00110 01010 10010 11111 00010 00010","5":"11111 10000 11110 00001 00001 10001 01110",
"6":"01110 10000 11110 10001 10001 10001 01110","7":"11111 00001 00010 00100 01000 01000 01000",
"8":"01110 10001 10001 01110 10001 10001 01110","9":"01110 10001 10001 01111 00001 00001 01110",
"·":"00000 00000 00000 00100 00100 00000 00000","/":"00001 00010 00010 00100 01000 01000 10000",
"-":"00000 00000 00000 11111 00000 00000 00000"," ":"00000 00000 00000 00000 00000 00000 00000",
}

# ---------- 头像量化 ----------
def load_avatar():
    try:
        im = Image.open("/tmp/nanami_avatar.png").convert("RGB")
    except FileNotFoundError:
        urllib.request.urlretrieve(AVATAR_URL, "/tmp/nanami_avatar.png")
        im = Image.open("/tmp/nanami_avatar.png").convert("RGB")
    im = ImageOps.autocontrast(im.resize((GRID, GRID), Image.LANCZOS), cutoff=1)
    q = im.convert("L").quantize(colors=4)
    px = q.load()
    return [[min(px[x, y], 3) for x in range(GRID)] for y in range(GRID)]

# ---------- 像素字 → path 方块 ----------
def text_path(text, x, y, scale, fill):
    """返回 (path_d, width)：5×7 字模拼成一条 path"""
    cmds, cx = [], x
    for ch in text.upper():
        rows = F[ch].split()
        for r in range(7):
            run, start = 0, None
            line = rows[r] + "0"
            for c in range(6):
                if line[c] == "1" and start is None:
                    start = c
                elif line[c] == "0" and start is not None:
                    w = (c - start) * scale
                    bx, by = cx + start * scale, y + r * scale
                    cmds.append(f"M{bx} {by}h{w}v{scale}h-{w}z")
                    start = None
        cx += 6 * scale
    return f'fill="{fill}" d="{" ".join(cmds)}"', cx - x

# ---------- SVG 组装 ----------
def build():
    av = load_avatar()
    W, H = 960, 680
    # 头像矩阵：按行分组（扫描动画单元），行内 run-length 合并
    av_rows = []
    ax, ay = 120, 148          # 头像左上
    for r in range(GRID):
        runs, start = [], None
        row = av[r] + [-1]
        for c in range(GRID + 1):
            if row[c] != -1 and (start is None):
                start = c
            elif row[c] == -1 or (start is not None and row[c] != row[start]):
                if start is not None:
                    runs.append((start, c - start, row[start]))
                    start = c if row[c] != -1 else None
        paths = " ".join(
            f'<path fill="{PAL[v]}" d="M{ax+s*S} {ay+r*S}h{w*S}v{S}h-{w*S}z"/>' for s, w, v in runs)
        av_rows.append(f'<g class="arow" style="animation-delay:{r*24}ms">{paths}</g>')
    # 头像像素外框（描一层深色让头像和背景分离）
    av_frame = (f'<rect x="{ax-6}" y="{ay-6}" width="{GRID*S+12}" height="{GRID*S+12}" '
                f'fill="none" stroke="#1d3d18" stroke-width="6"/>')

    # 信息行
    info_svg, keyframes = [], []
    ix, iy0, lh, ts = 470, 172, 60, 3   # 信息区 x、首行 y、行距、字号倍率
    tx_delay = 1.5
    for k, (label, value) in enumerate(INFO):
        ly = iy0 + k * lh
        lw = len(label) * 6 * ts
        vw = len(value) * 6 * ts
        nsteps = max(len(value) * 2, 8)
        keyframes.append(
            f"@keyframes tx{k} {{ to {{ transform: scaleX(1); }} }}\n"
            f".tr{k} {{ transform: scaleX(0); transform-box: fill-box; transform-origin: 0 0; "
            f"animation: tx{k} {0.6+nsteps*0.012:.2f}s steps({nsteps}) {tx_delay + k*0.5:.2f}s forwards; }}")
        label_p, _ = text_path(label, ix + 10, ly + 2, ts, SCREEN_BG)
        value_p, _ = text_path(value, ix + lw + 34, ly, ts, "#1d3d18")
        info_svg.append(f'''
  <g>
    <rect x="{ix}" y="{ly-8}" width="{lw+20}" height="7*{ts}+16" fill="#2d6023"/>
    <path {label_p}/>
  </g>
  <g clip-path="url(#tc{k})"><path {value_p}/></g>'''.replace("7*3+16", str(7 * ts + 16)))
        # clipPath 供打字机
    # 光标（最后）
    cur_y = iy0 + len(INFO) * lh - 8
    # 正确拼 clipPath
    clips, info2 = [], []
    for k, (label, value) in enumerate(INFO):
        ly = iy0 + k * lh
        lw = len(label) * 6 * ts
        vw = len(value) * 6 * ts + 8
        clips.append(f'<clipPath id="tc{k}"><rect class="tr{k}" x="{ix+lw+30}" y="{ly-6}" width="{vw}" height="{7*ts+12}"/></clipPath>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="nanami 的像素 CRT 自介：头像 + NAME NANAMI / AGE FOREVER 18 / LANG ZH·EN·TS·RUST / OS MACOS·ANDROID">
  <style>
    .arow {{ opacity: 0; animation: rv .1s ease-out forwards; }}
    @keyframes rv {{ to {{ opacity: 1; }} }}
{chr(10).join("    " + l for l in keyframes)}
    .cur {{ opacity: 0; animation: curshow 3.9s forwards, blink 1.1s 3.9s steps(2) infinite; }}
    @keyframes curshow {{ 0%, 99% {{ opacity: 0; }} 100% {{ opacity: 1; }} }}
    @keyframes blink {{ 0% {{ opacity: 1; }} 50%, 100% {{ opacity: 0; }} }}
    @media (prefers-reduced-motion: reduce) {{
      .arow {{ opacity: 1; animation: none; }}
      .tr0,.tr1,.tr2,.tr3 {{ transform: scaleX(1); animation: none; }}
      .cur {{ opacity: 1; animation: none; }}
    }}
  </style>
  <defs>
{chr(10).join("    " + c for c in clips)}
  </defs>
  <!-- 复古 CRT 外壳 -->
  <rect x="40" y="24" width="880" height="556" rx="18" fill="#262218"/>
  <rect x="48" y="32" width="864" height="540" rx="14" fill="#ded7c5"/>
  <rect x="72" y="56" width="816" height="472" rx="10" fill="#1c1b16"/>
  <!-- 屏幕 -->
  <rect x="88" y="72" width="784" height="440" fill="{SCREEN_BG}"/>
  <!-- LCD 下右边缘阴影 -->
  <rect x="88" y="506" width="784" height="6" fill="#c9cf9f"/>
  <rect x="866" y="72" width="6" height="440" fill="#c9cf9f"/>
  <!-- 头像（逐行扫描入场） -->
  {av_frame}
{chr(10).join("  " + r for r in av_rows)}
  <!-- 信息（打字机入场） -->
{"".join(info_svg)}
  <!-- 光标 -->
  <rect class="cur" x="{ix + 30}" y="{cur_y}" width="{ts*2}" height="{7*ts+4}" fill="#2d6023"/>
  <!-- 扫描线（LCD 质感） -->
  <rect x="88" y="72" width="784" height="440" fill="url(#scan)"/>
  <defs><pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
    <rect width="4" height="2" fill="rgba(29,61,24,0.045)"/>
  </pattern></defs>
  <!-- 支架与底座 -->
  <rect x="440" y="580" width="80" height="46" fill="#b8b09c"/>
  <rect x="434" y="580" width="92" height="8" fill="#8f8874"/>
  <rect x="330" y="626" width="300" height="22" rx="8" fill="#ded7c5"/>
  <rect x="330" y="640" width="300" height="8" rx="4" fill="#262218"/>
</svg>
'''

if __name__ == "__main__":
    svg = build()
    out = __file__.rsplit("/", 1)[0] + "/screen.svg"
    open(out, "w").write(svg)
    print(f"written {out} ({len(svg)//1024} KB)")
