#!/usr/bin/env python3
"""跨章近似重复检测：找出「不同文件之间」句子级高度重合的对。

用途：全书 40+ 章由多次写作累积而成，同一判断常在不同章各写一遍。
人眼连读太慢，文本级 uniq 又抓不到"换了措辞"。这个脚本用 n-gram 做候选筛选，
再用 difflib 精确比对，只报跨文件的对（同文件内的重复通常是刻意的分层展开）。

用法：
    python3 tools/dup_check.py .              # 全量
    python3 tools/dup_check.py . --min 0.62   # 调阈值
    python3 tools/dup_check.py . --scope d0   # 只看某个领域

判定：ratio >= --min（默认 0.60）且来自不同文件。
已知的合理重复（同一判据需要在前向章给摘要）会出现在结果里 —— 需要人工判断，
脚本不替你决定删留。
"""

import argparse
import glob
import os
import re
import sys
from difflib import SequenceMatcher

# 归一化：去掉 markdown 装饰与标点，保留汉字与字母数字的骨架
STRIP = re.compile(r"[*`>|#\[\]()（）「」“”\"'·、，。；：！？,.;:!?\s\-—–/\\]+")


def norm(s: str) -> str:
    s = s.replace("\u3000", " ")
    s = STRIP.sub("", s)
    return s


def sentences(text: str):
    """按行与句末标点切句，保留行号。

    只取**正文散文**：跳过表格行（那是数据，不是论述）、跳过标题，
    因为表格行与标题在不同章之间天然会重合（如 `NODE_ENV` 那两行），
    那不是"同一判断讲了两遍"，而是同一份事实被两处引用。
    """
    out = []
    for lineno, line in enumerate(text.split("\n"), 1):
        line = line.rstrip("\r")
        s = line.strip()
        if not s or s.startswith("|") or s.startswith("#") or s.startswith("```"):
            continue
        for p in re.split(r"(?<=[。！？])", line):
            n = norm(p)
            if len(n) >= 30:  # 太短的不值得比对
                out.append((lineno, p.strip(), n))
    return out


def grams(s: str, k: int = 5):
    return {s[i : i + k] for i in range(max(0, len(s) - k + 1))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default=".")
    ap.add_argument("--min", type=float, default=0.60)
    ap.add_argument("--scope", default="")
    ap.add_argument("--top", type=int, default=40)
    a = ap.parse_args()

    files = sorted(
        glob.glob(os.path.join(a.root, "chapters", "d*.md"))
        + glob.glob(os.path.join(a.root, "chapters", "x*.md"))
    )
    if a.scope:
        files = [f for f in files if os.path.basename(f).startswith(a.scope)]

    items = []  # (file, lineno, raw, norm)
    for f in files:
        with open(f, encoding="utf-8") as fh:
            for lineno, raw, n in sentences(fh.read()):
                items.append((os.path.basename(f), lineno, raw, n))

    # 结构性模板过滤：全书统一的体例文字，不是内容重复。
    # 两道网：① 归一化后完全相同的句子出现在 >= 3 个文件（指针段、使用说明）；
    #         ② 含体例关键词的句子（章首声明会把节点号写进去，逐字并不相同，
    #            但同样不是论述重复）。
    BOILER = (
        "本章的来源与标注",
        "在知识地图中均为",
        "本章定位",
        "本章按",
        "核验日期",
        "覆盖节点",
        "待回链",
        "本章常见误区",
        "治理动作",
        "阅读约定",
    )
    where = {}
    for f, lineno, raw, n in items:
        where.setdefault(n, set()).add(f)
    template = {n for n, fs in where.items() if len(fs) >= 3}
    items = [
        it
        for it in items
        if it[3] not in template and not any(b in it[2] for b in BOILER)
    ]

    # 倒排索引：5-gram -> 句子下标
    idx = {}
    sets = []
    for i, (_, _, _, n) in enumerate(items):
        g = grams(n)
        sets.append(g)
        for x in g:
            idx.setdefault(x, []).append(i)

    seen = set()
    hits = []
    for i, g in enumerate(sets):
        cand = {}
        for x in g:
            for j in idx[x]:
                if j <= i:
                    continue
                cand[j] = cand.get(j, 0) + 1
        for j, shared in cand.items():
            if shared < 6:
                continue
            if items[i][0] == items[j][0]:
                continue  # 只看跨文件
            key = (i, j)
            if key in seen:
                continue
            seen.add(key)
            r = SequenceMatcher(None, items[i][3], items[j][3]).ratio()
            if r >= a.min:
                hits.append((r, i, j))

    hits.sort(reverse=True)
    print(f"扫描 {len(files)} 个文件 / {len(items)} 句；跨文件近似重复 {len(hits)} 对（ratio >= {a.min}）\n")
    for r, i, j in hits[: a.top]:
        f1, l1, raw1, _ = items[i]
        f2, l2, raw2, _ = items[j]
        print(f"[{r:.2f}] {f1}:{l1}  <->  {f2}:{l2}")
        print(f"   A: {raw1[:110]}")
        print(f"   B: {raw2[:110]}")
        print()
    if len(hits) > a.top:
        print(f"... 另有 {len(hits) - a.top} 对未显示，用 --top 调整。")


if __name__ == "__main__":
    sys.exit(main())
