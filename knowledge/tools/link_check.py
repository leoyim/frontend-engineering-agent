#!/usr/bin/env python3
"""
link_check.py — 电子书链接与结构检查

用法:
    python link_check.py <book_root>

检查项:
    1. 所有相对 Markdown 链接的目标文件是否存在
    2. 是否存在空的 .md 文件
    3. 是否存在 TODO / 占位内容（TBD 仅在带冒号或方括号时算，见下方注释）
    4. 标题层级是否跳跃（例如 H2 直接跳到 H4）
    5. 图片引用路径是否存在
"""

import re
import sys
from pathlib import Path

LINK_RE = re.compile(r'\[([^\]]*)\]\(([^)]+)\)')
IMG_RE = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')
HEADING_RE = re.compile(r'^(#{1,6})\s+(.*)$')
# 说明：TBD 仅在带冒号或方括号时视为占位符。
# 原因：TBD 在本项目里也是「Trunk Based Development」的常用缩写
# （见 chapters/d1-02-commit-and-collaboration.md §2.5），裸词会误报。
PLACEHOLDER_RE = re.compile(r'(\[TODO|TODO:|\[TBD|TBD:|FIXME|XXX:)')

# 这些链接是外部地址或纯锚点，不检查
IGNORE_PREFIXES = ('http://', 'https://', 'mailto:', '#')


def check(book_root: Path):
    errors = []
    warnings = []
    stats = {'files': 0, 'links': 0, 'checked_links': 0,
             'external_links': 0, 'headings': 0, 'chars': 0}

    md_files = sorted(book_root.rglob('*.md'))
    if not md_files:
        print('没有找到 .md 文件')
        return 1

    for md in md_files:
        stats['files'] += 1
        rel = md.relative_to(book_root)
        text = md.read_text(encoding='utf-8')
        stats['chars'] += len(text)

        # 2. 空文件
        if not text.strip():
            errors.append(f'[空文件] {rel}')
            continue

        # 3. 占位内容
        for i, line in enumerate(text.splitlines(), 1):
            if PLACEHOLDER_RE.search(line):
                errors.append(f'[占位内容] {rel}:{i}  {line.strip()[:70]}')

        # 剥掉围栏代码块 —— 里面的 # 是注释（如 bash 的 "# .env"），不是标题
        # 注意：行号会因此错位，所以下面用原文重扫行号
        no_code = re.sub(r'```.*?```', lambda m: '\n' * m.group(0).count('\n'),
                         text, flags=re.DOTALL)

        # 4. 标题层级跳跃
        prev_level = 0
        first_heading_seen = False
        for i, line in enumerate(no_code.splitlines(), 1):
            m = HEADING_RE.match(line)
            if not m:
                continue
            level = len(m.group(1))
            stats['headings'] += 1
            if not first_heading_seen:
                first_heading_seen = True
                if level != 1:
                    warnings.append(
                        f'[首个标题非 H1] {rel}:{i}  {"#" * level} {m.group(2)[:50]}')
            else:
                if level > prev_level + 1:
                    warnings.append(
                        f'[标题跳级] {rel}:{i}  H{prev_level} -> H{level}  {m.group(2)[:40]}')
            prev_level = level

        # 1. 链接检查（去掉代码块，避免把示例代码里的链接算进来）
        stripped = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
        for m in LINK_RE.finditer(stripped):
            target = m.group(2).strip()
            stats['links'] += 1
            if target.startswith(IGNORE_PREFIXES):
                stats['external_links'] += 1
                continue
            stats['checked_links'] += 1
            path_part = target.split('#')[0]
            if not path_part:
                continue
            resolved = (md.parent / path_part).resolve()
            if not resolved.exists():
                errors.append(f'[死链] {rel}  ->  {target}')

        # 5. 图片检查
        for m in IMG_RE.finditer(stripped):
            target = m.group(2).strip()
            if target.startswith(IGNORE_PREFIXES):
                continue
            resolved = (md.parent / target).resolve()
            if not resolved.exists():
                errors.append(f'[图片缺失] {rel}  ->  {target}')

    # SUMMARY.md 覆盖检查：正文 .md 是否都在目录里被引用
    summary = book_root / 'SUMMARY.md'
    if summary.exists():
        s_text = summary.read_text(encoding='utf-8')
        for md in md_files:
            rel = md.relative_to(book_root).as_posix()
            if rel in ('SUMMARY.md', 'README.md'):
                continue
            if rel not in s_text and md.name not in s_text:
                warnings.append(f'[未收入目录] {rel}')

    # 输出
    print(f"检查目录: {book_root}")
    print(f"Markdown 文件: {stats['files']}")
    print(f"总字符数: {stats['chars']}")
    print(f"标题总数: {stats['headings']}")
    print(f"链接总数: {stats['links']}")
    print(f"  - 外部链接(跳过): {stats['external_links']}")
    print(f"  - 本地链接(已检查): {stats['checked_links']}")
    print()

    if warnings:
        print(f'⚠️  警告 {len(warnings)} 条:')
        for w in warnings:
            print('   ' + w)
        print()

    if errors:
        print(f'❌ 错误 {len(errors)} 条:')
        for e in errors:
            print('   ' + e)
        return 1

    print('✅ 未发现死链、空文件、占位内容或图片缺失')
    return 0


if __name__ == '__main__':
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
    sys.exit(check(root))
