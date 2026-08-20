"""Pull recipes out of the Google-Docs .docx export.

Each recipe is one table:
    row 0            title in cell 0
    optional rows    a subtitle, and an "Image" placeholder to skip
    final row        ingredients in cell 0, steps in cell 1

The .docx is used rather than the .md export because markdown tables cannot
contain newlines, so the .md collapsed every ingredient into one unbroken
string. In the .docx each ingredient is still its own <w:p>.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
DOC = '/private/tmp/claude-501/-Users-shinkhouse-Documents-Development-Projects/674da8ee-7491-4feb-8e78-f9db43917702/scratchpad/docx/word/document.xml'


def para_text(p):
    """Visible text of one paragraph, with tabs/breaks as spaces."""
    parts = []
    for node in p.iter():
        if node.tag == W + 't':
            parts.append(node.text or '')
        elif node.tag in (W + 'tab', W + 'br'):
            parts.append(' ')
    text = ''.join(parts)
    # The export is littered with zero-width no-break spaces.
    text = text.replace('﻿', '').replace(' ', ' ')
    return re.sub(r'\s+', ' ', text).strip()


def cell_lines(tc):
    """Non-empty paragraphs of a cell, in order."""
    out = []
    for p in tc.findall(W + 'p'):
        t = para_text(p)
        if t:
            out.append(t)
    return out


def is_placeholder(lines):
    if not lines:
        return True
    joined = ' '.join(lines).strip().lower()
    return joined in {'image', 'optional description', 'optional', ''}


SERVINGS_PATTERNS = [
    r'\bserves?\s+(\d+)',
    r'\b(\d+)\s*[-–]\s*(\d+)\s+servings?\b',
    r'\b(\d+)\s+servin[gos]{1,3}\b',   # the export contains "SERVINOS"
    r'\byield[s]?\s*:?\s*(\d+)',
    r'\bmakes\s+(\d+)',
]


def find_servings(lines):
    """Servings, plus the line it came from so the caller can drop it."""
    for i, line in enumerate(lines):
        low = line.lower()
        for pat in SERVINGS_PATTERNS:
            m = re.search(pat, low)
            if m:
                nums = [int(g) for g in m.groups() if g and g.isdigit()]
                if nums:
                    # A range means the upper bound, matching the parser's rule.
                    return max(nums), i
    return None, None


# A line that names a sub-component rather than an ingredient: "BRAISED
# CHICKEN", "Gumbo base", "STAPLE INGREDIENTS:". No digits, few words, and
# either all caps or ending in a colon.
def looks_like_group(line):
    if re.search(r'\d', line):
        return False
    words = line.split()
    if not (1 <= len(words) <= 6):
        return False
    letters = re.sub(r'[^A-Za-z]', '', line)
    if not letters:
        return False
    if line.rstrip().endswith(':'):
        return True
    upper_ratio = sum(c.isupper() for c in letters) / len(letters)
    return upper_ratio > 0.8


def main():
    tree = ET.parse(DOC)
    root = tree.getroot()
    body = root.find(W + 'body')

    recipes = []
    for tbl in body.iter(W + 'tbl'):
        rows = []
        for tr in tbl.findall(W + 'tr'):
            rows.append([cell_lines(tc) for tc in tr.findall(W + 'tc')])
        if not rows:
            continue

        title_cell = rows[0][0] if rows[0] else []
        title = ' '.join(title_cell).strip()
        if not title:
            continue

        subtitle = ''
        ingredients, steps = [], []

        for row in rows[1:]:
            populated = [c for c in row if not is_placeholder(c)]
            if len(populated) >= 2:
                ingredients, steps = populated[0], populated[1]
            elif len(populated) == 1 and not subtitle:
                subtitle = ' '.join(populated[0]).strip()

        recipes.append({
            'title': title,
            'subtitle': subtitle,
            'ingredientLines': ingredients,
            'stepLines': steps,
        })

    # Enrich + classify
    report = []
    for r in recipes:
        servings, drop_at = find_servings(r['ingredientLines'])
        lines = list(r['ingredientLines'])
        if drop_at is not None:
            lines.pop(drop_at)
        groups = [l for l in lines if looks_like_group(l)]
        real = [l for l in lines if not looks_like_group(l)]
        r.update(servings=servings, groups=groups, ingredients=real)
        report.append(r)

    json.dump(report, open(sys.argv[1], 'w'), indent=1)

    # ---- summary ----
    print(f'tables found: {len(report)}')
    templates = [r for r in report if 'template' in r['title'].lower()]
    empty = [r for r in report if not r['ingredients'] or not r['stepLines']]
    print(f'  "Recipe Template" stubs: {len(templates)}')
    print(f'  missing ingredients or steps: {len(empty)}')
    for r in empty:
        print(f'      - {r["title"][:60]}  (ing {len(r["ingredients"])}, steps {len(r["stepLines"])})')
    print(f'  with servings detected: {sum(1 for r in report if r["servings"])}')
    print(f'  with ingredient sub-groups: {sum(1 for r in report if r["groups"])}')
    print()
    print('sub-group examples:')
    for r in report:
        if r['groups']:
            print(f'    {r["title"][:38]:40s} {r["groups"][:4]}')
    print()
    print('ingredient / step counts:')
    for r in report[:8]:
        print(f'    {r["title"][:38]:40s} ing {len(r["ingredients"]):3d}  steps {len(r["stepLines"]):3d}  serves {r["servings"]}')


main()
