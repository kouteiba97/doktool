#!/usr/bin/env python3
"""Builds the DokTool learning book (English and Arabic) as HTML, then PDF with headless Chrome.

    python3 docs/learning-book/build.py            # both languages, HTML + PDF
    python3 docs/learning-book/build.py --html     # HTML only (no Chrome needed)

Chapters are written by hand in content/<lang>/NN-*.html. Code shown in the book is never
copied by hand: the chapters name it with placeholders that are filled from the sources at
build time, so the book always matches the code.

    [[code PATH | ANCHOR | N]]   N lines from the first line containing ANCHOR (with the comment
                                 and decorators just above it). N = "block" takes the whole
                                 brace-delimited block.
    [[file PATH]]                the whole file.
    [[file PATH | FROM | TO]]    lines FROM..TO of the file (1-based, inclusive).

Appendix A (every file, every documented function and button) is generated from the comments
in the code; folder introductions come from folders.json.
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SOURCES = ['apps/api/src', 'apps/admin/src', 'apps/mobile/lib']
SKIPPED_DIRS = ('generated', 'node_modules')
SKIPPED_FILES = ('schema.d.ts', 'doktool_tokens.dart')

TEXT = {
    'en': {
        'title': 'DokTool — the learning book',
        'subtitle': 'Every application, module, screen and button of the DokTool code, explained so you can read it as if you had written it.',
        'edition': 'Edition of 26 October 2026 · branch feature/medicalcul-and-pregnancy-import',
        'contents': 'Contents',
        'appendix': 'Appendix A — Every file, function and button',
        'appendix_intro': 'This appendix is generated from the code itself. For each folder: what it is for; for each file: every documented declaration (its first line) and every commented button, with the comment written in the code. Read it next to the source: the order is the order of the file.',
        'line_no': 'line',
        'button': 'button / action',
        'parts': {'api': 'The API (apps/api)', 'admin': 'Admin Web (apps/admin)', 'mobile': 'The mobile app (apps/mobile)'},
    },
    'ar': {
        'title': 'DokTool — كتاب التعلّم',
        'subtitle': 'كل تطبيق ووحدة وشاشة وزرّ في شيفرة DokTool، مشروحًا حتى تقرأه وكأنك أنت من كتبه.',
        'edition': 'إصدار 26 أكتوبر 2026 · الفرع feature/medicalcul-and-pregnancy-import',
        'contents': 'الفهرس',
        'appendix': 'الملحق أ — كل ملف ودالة وزر',
        'appendix_intro': 'هذا الملحق مولَّد آليًا من الشيفرة نفسها. لكل مجلد: ما وظيفته؛ ولكل ملف: كل تعريف موثَّق (سطره الأول) وكل زر عليه تعليق، مع التعليق كما هو مكتوب في الشيفرة (بالإنجليزية، لأن التعليقات جزء من الشيفرة). اقرأه بجانب الملف المصدر: الترتيب هو ترتيب الملف.',
        'line_no': 'السطر',
        'button': 'زر / إجراء',
        'parts': {'api': 'الخادم API ‏(apps/api)', 'admin': 'لوحة الإدارة Admin Web ‏(apps/admin)', 'mobile': 'تطبيق الهاتف ‏(apps/mobile)'},
    },
}


# ───────────────────────────── reading the sources ─────────────────────────────

def read_lines(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as handle:
        return handle.read().split('\n')


def comment_start(lines, index):
    """First line of the comment / decorator block directly above lines[index]."""
    start = index
    k = index - 1
    while k >= 0:
        s = lines[k].strip()
        if s.startswith(('//', '/**', '*', '*/', '@', '{/*')) or s.endswith('*/') or s.endswith('*/}'):
            start = k
            k -= 1
            continue
        break
    return start


def block_end(lines, index):
    """Last line of the brace-delimited block opened on or after lines[index]."""
    depth = 0
    opened = False
    for k in range(index, len(lines)):
        code = re.sub(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`|//.*$", '', lines[k])
        for ch in code:
            if ch in '{(':
                depth += 1
                opened = True
            elif ch in '})':
                depth -= 1
        if opened and depth <= 0:
            return k
        if not opened and lines[k].rstrip().endswith(';'):
            return k
    return len(lines) - 1


def excerpt(spec):
    parts = [p.strip() for p in spec.split('|')]
    path = parts[0]
    lines = read_lines(path)
    if len(parts) == 1:
        return path, 1, lines
    anchor = parts[1]
    if anchor.isdigit() and len(parts) == 3 and parts[2].isdigit():
        first, last = int(anchor), int(parts[2])
        return path, first, lines[first - 1:last]
    hits = [i for i, line in enumerate(lines) if anchor in line]
    if not hits:
        raise SystemExit(f'anchor not found: {path} | {anchor}')
    index = hits[0]
    start = comment_start(lines, index)
    count = parts[2] if len(parts) > 2 else 'block'
    end = block_end(lines, index) if count == 'block' else index + int(count) - 1
    return path, start + 1, lines[start:end + 1]


def highlight(code, dart):
    """HTML-escapes code and colours comments and strings (enough for reading on paper)."""
    out = []
    in_block = False
    for line in code:
        escaped = html.escape(line)
        if in_block:
            if '*/' in line:
                head, tail = escaped.split('*/', 1)
                out.append(f'<span class="c">{head}*/</span>{tail}')
                in_block = False
            else:
                out.append(f'<span class="c">{escaped}</span>')
            continue
        stripped = line.strip()
        if stripped.startswith('/*') and '*/' not in stripped:
            out.append(f'<span class="c">{escaped}</span>')
            in_block = True
            continue
        match = re.search(r'(^|\s)(//.*)$', escaped)
        if match and escaped[:match.start(2)].count('&#x27;') % 2 == 0 and escaped[:match.start(2)].count('&quot;') % 2 == 0:
            body, comment = escaped[:match.start(2)], match.group(2)
        else:
            body, comment = escaped, ''
        body = re.sub(r'(\{/\*.*?\*/\})', r'<span class="c">\1</span>', body)
        body = re.sub(r'(/\*\*?.*?\*/)', r'<span class="c">\1</span>', body)
        body = re.sub(r'(&#x27;(?:[^&]|&(?!#x27;))*?&#x27;|&quot;(?:[^&]|&(?!quot;))*?&quot;)', r'<span class="s">\1</span>', body)
        out.append(body + (f'<span class="c">{comment}</span>' if comment else ''))
    return '\n'.join(out)


def render_code(spec):
    path, first, lines = excerpt(spec)
    while lines and not lines[-1].strip():
        lines = lines[:-1]
    numbers = '\n'.join(str(first + i) for i in range(len(lines)))
    body = highlight(lines, path.endswith('.dart'))
    return (f'<figure class="code"><figcaption>{html.escape(path)}</figcaption>'
            f'<div class="listing"><pre class="ln">{numbers}</pre><pre class="src">{body}</pre></div></figure>')


# ───────────────────────────── appendix A ─────────────────────────────

def source_files():
    found = []
    for base in SOURCES:
        for directory, _, names in os.walk(os.path.join(ROOT, base)):
            if any(s in directory for s in SKIPPED_DIRS):
                continue
            for name in names:
                if name in SKIPPED_FILES or name.endswith('.g.dart') or name.startswith('app_localizations'):
                    continue
                if name.endswith(('.ts', '.tsx', '.dart')):
                    found.append(os.path.relpath(os.path.join(directory, name), ROOT))
    return sorted(found)


def clean_comment(raw):
    words = []
    for line in raw:
        s = line.strip()
        s = re.sub(r'^\{/\*\s?', '', s)
        s = re.sub(r'\s?\*/\}$', '', s)
        s = re.sub(r'^/\*\*\s?', '', s)
        s = re.sub(r'\s?\*/$', '', s)
        s = re.sub(r'^\*\s?', '', s)
        s = re.sub(r'^///?\s?', '', s)
        if s:
            words.append(s)
    return ' '.join(words)


def documented(path):
    """Every commented declaration or button of a file: (line, kind, comment, first code line)."""
    lines = read_lines(path)
    items = []
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith('/**'):
            j = i
            while j < len(lines) and '*/' not in lines[j]:
                j += 1
            raw, kind, i = lines[i:j + 1], 'doc', j + 1
        elif s.startswith('///'):
            j = i
            while j < len(lines) and lines[j].strip().startswith('///'):
                j += 1
            raw, kind, i = lines[i:j], 'doc', j
        elif s.startswith('{/*'):
            j = i
            while j < len(lines) and '*/}' not in lines[j]:
                j += 1
            raw, kind, i = lines[i:j + 1], 'act', j + 1
        elif s.startswith('//') and not s.startswith(('// ignore', '// eslint', '// @ts-', '// ──', '// ─')):
            j = i
            while j < len(lines) and lines[j].strip().startswith('//') and not lines[j].strip().startswith('///'):
                j += 1
            raw, kind, i = lines[i:j], 'act', j
        else:
            i += 1
            continue
        k = i
        while k < len(lines) and lines[k].strip().startswith('@'):
            k = block_end(lines, k) + 1 if lines[k].count('(') > lines[k].count(')') else k + 1
        if k >= len(lines) or not lines[k].strip():
            continue
        signature = lines[k].strip()
        if kind == 'act' and not re.search(r'[A-Z]\w*[(<]|onPressed|onTap|onClick|onSelect|onChanged|label:|href=|<Button|<button|<a\b', signature):
            kind = 'note'
        if len(signature) > 118:
            signature = signature[:115] + '…'
        items.append((k + 1, kind, clean_comment(raw), signature))
    return items


def appendix(lang, folders):
    t = TEXT[lang]
    out = [f'<section class="chapter appendix"><h2 id="appendix-a">{t["appendix"]}</h2><p>{t["appendix_intro"]}</p>']
    current_part = None
    current_folder = None
    for path in source_files():
        part = path.split('/')[1]
        if part != current_part:
            current_part = part
            out.append(f'<h3 class="part">{html.escape(t["parts"][part])}</h3>')
        folder = os.path.dirname(path)
        if folder != current_folder:
            current_folder = folder
            intro = folders.get(folder, {}).get(lang, '')
            out.append(f'<h4 class="folder">{html.escape(folder)}/</h4>')
            if intro:
                out.append(f'<p class="folder-intro">{intro}</p>')
        items = documented(path)
        count = len(read_lines(path))
        out.append(f'<div class="file"><div class="fname">{html.escape(os.path.basename(path))} '
                   f'<span class="meta">· {count} {t["line_no"]}s</span></div>' if lang == 'en' else
                   f'<div class="file"><div class="fname">{html.escape(os.path.basename(path))} '
                   f'<span class="meta">· {count} سطرًا</span></div>')
        for line, kind, comment, signature in items:
            if kind == 'note':
                continue
            css = 'it act' if kind == 'act' else 'it'
            out.append(f'<div class="{css}"><code><span class="lno">{line}</span>{html.escape(signature)}</code>'
                       f'<span class="doc" dir="ltr">{html.escape(comment)}</span></div>')
        out.append('</div>')
    out.append('</section>')
    return '\n'.join(out)


# ───────────────────────────── assembling the book ─────────────────────────────

def fill(text):
    text = re.sub(r'\[\[code ([^\]]+)\]\]', lambda m: render_code(m.group(1)), text)
    text = re.sub(r'\[\[file ([^\]]+)\]\]', lambda m: render_code(m.group(1)), text)
    return text


def contents(chapters, lang):
    items = []
    for body in chapters:
        for level, ident, title in re.findall(r'<h([23]) id="([^"]+)"[^>]*>(.*?)</h\1>', body, re.S):
            title = re.sub(r'<[^>]+>', '', title)
            items.append(f'<li class="toc{level}"><a href="#{ident}">{title}</a></li>')
    items.append(f'<li class="toc2"><a href="#appendix-a">{TEXT[lang]["appendix"]}</a></li>')
    return f'<section class="toc"><h2>{TEXT[lang]["contents"]}</h2><ol>{"".join(items)}</ol></section>'


def build(lang):
    t = TEXT[lang]
    folder = os.path.join(HERE, 'content', lang)
    chapters = [fill(open(os.path.join(folder, name), encoding='utf-8').read())
                for name in sorted(os.listdir(folder)) if name.endswith('.html')]
    folders = json.load(open(os.path.join(HERE, 'folders.json'), encoding='utf-8'))
    css = open(os.path.join(HERE, 'book.css'), encoding='utf-8').read()
    direction = 'rtl' if lang == 'ar' else 'ltr'
    cover = (f'<section class="cover"><div class="mark">DokTool</div><h1>{t["title"]}</h1>'
             f'<p class="sub">{t["subtitle"]}</p><p class="edition">{t["edition"]}</p></section>')
    page = (f'<!doctype html><html lang="{lang}" dir="{direction}"><head><meta charset="utf-8">'
            f'<title>{t["title"]}</title>'
            '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700'
            '&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">'
            f'<style>{css}</style></head><body class="{lang}">{cover}{contents(chapters, lang)}'
            + ''.join(chapters) + appendix(lang, folders) + '</body></html>')
    out = os.path.join(HERE, f'DokTool-Learning-Book-{lang.upper()}.html')
    with open(out, 'w', encoding='utf-8') as handle:
        handle.write(page)
    return out


def chrome():
    for candidate in ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                      'C:/Program Files/Google/Chrome/Application/chrome.exe',
                      shutil.which('google-chrome') or '', shutil.which('chromium') or '']:
        if candidate and os.path.exists(candidate):
            return candidate
    raise SystemExit('Chrome not found: open the HTML file and print it to PDF.')


def to_pdf(html_path):
    pdf = html_path[:-5] + '.pdf'
    subprocess.run([chrome(), '--headless=new', '--no-pdf-header-footer', '--virtual-time-budget=20000',
                    f'--print-to-pdf={pdf}', 'file://' + html_path], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return pdf


if __name__ == '__main__':
    for language in ('en', 'ar'):
        page = build(language)
        print('wrote', os.path.relpath(page, ROOT))
        if '--html' not in sys.argv:
            print('wrote', os.path.relpath(to_pdf(page), ROOT))
