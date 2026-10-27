#!/usr/bin/env python3
"""
日檢 N5 單字總整理 PDF → JSON（給 App 的「匯入」頁使用）

版面觀察（data/n5.pdf，16 頁、535 個單字）：
  每頁是一個 5 欄表格：編號 | 讀音（平假名／片假名） | 漢字表記 | 中文意思 | 例句
  - 漢字欄可能空白（外來語、只用假名寫的字），或寫成「開く(自V)」「（お爺さん）」「叔(伯)父さん」
  - 讀音可能帶「（な）」（な形容詞）、「いい/よい」（兩種讀法）、「～えん」（接尾詞）
  - 例句欄偶爾有第二行例句，或括號附註（例如「（與ついたち同字異音）」）
  - PDF 沒有詞性欄和例句翻譯欄 → 詞性用規則推測（報告會列出），例句翻譯留空

解析策略：
  1. 優先用 pdfplumber 的 extract_tables()（這份 PDF 有表格線，最準）
  2. 該頁抽不到表格時，改用文字座標分欄（依表頭位置推算欄界）
  3. 每列驗證：編號要是數字、讀音要是假名，不符合的列進報告

用法：
  python scripts/import_pdf.py data/n5.pdf -o data/out/n5.json
  python scripts/import_pdf.py data/n5.pdf -o out.json --pages 12-15     # 只轉部分頁
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import pdfplumber
except ImportError:  # pragma: no cover
    sys.exit('請先安裝 pdfplumber：pip install pdfplumber')

KANA_RE = re.compile(r'^[぀-ヿー～~（）()/／・\s]+$')
KANJI_RE = re.compile(r'[㐀-鿿々]')
VERB_ENDINGS = 'うくぐすつぬぶむる'
# 結尾是「い」但其實是な形容詞的常見例外
NA_ADJ_EXCEPTIONS = {'嫌い', '綺麗', '奇麗', '有名', '大嫌い'}
# 結尾是「い」的名詞
NOUNS_ENDING_I = {'お手洗い', '手洗い', '間違い', '小遣い', 'お祝い'}

# 文字座標分欄的預設欄界（x0），依這份 PDF 的表頭位置量測
DEFAULT_COLUMNS = [40, 75, 145, 210, 295]


def clean(s: str | None) -> str:
    return re.sub(r'[ \t　]+', ' ', (s or '')).strip()


def guess_pos(reading: str, kanji_raw: str, core_k: str) -> tuple[str, bool]:
    """回傳（詞性, 是否為推測）。kanji_raw 是原始欄位，core_k 是整理過的漢字表記。"""
    if re.search(r'[（(][自他]V[）)]', kanji_raw):
        return '動詞', False
    if re.search(r'[（(]な[）)]', reading) or re.search(r'[（(]な[）)]', kanji_raw):
        return 'な形容詞', True
    if reading.startswith(('～', '~')) or kanji_raw.startswith(('～', '~')):
        return '接尾詞', True
    if re.fullmatch(r'[゠-ヿー]+', reading):
        return '名詞', True
    if core_k in NA_ADJ_EXCEPTIONS:
        return 'な形容詞', True
    if core_k and KANJI_RE.search(core_k):
        if core_k.endswith('い') and reading.endswith('い') and len(core_k) >= 2 and core_k not in NOUNS_ENDING_I:
            return 'い形容詞', True
        if core_k[-1] in VERB_ENDINGS and reading.endswith(core_k[-1]):
            return '動詞', True
    elif reading.endswith('い') and len(reading) >= 3 and reading not in ('きれい', 'とけい'):
        return 'い形容詞', True
    return '名詞', True


def parse_kanji(raw: str) -> tuple[str, list[str], list[str]]:
    """「開く(自V)」→ ('開く', ['自動詞'], [])；「（お爺さん）」→ ('お爺さん', ['少用漢字'], [...])"""
    k = clean(raw)
    tags: list[str] = []
    notes: list[str] = []
    m = re.search(r'[（(](自V|他V)[）)]', k)
    if m:
        tags.append('自動詞' if m.group(1) == '自V' else '他動詞')
        k = (k[: m.start()] + k[m.end():]).strip()
    # な形容詞的「（な）」只留在讀音欄
    k = re.sub(r'\s*[（(]な[）)]\s*$', '', k)
    # 「（一昨日)」這種括號全形半形混用的也算整個括起來
    whole = re.fullmatch(r'[（(](.+)[）)]', k)
    if whole:
        k = whole.group(1).strip()
        tags.append('少用漢字')
        notes.append('漢字表記較少使用，通常寫假名')
    return k, tags, notes


def parse_example(raw: str) -> tuple[str, list[str]]:
    """例句欄：第一行是例句；括號附註抽出來當備註；第二行以後保留為補充例句。"""
    text = (raw or '').replace('\r', '')
    notes: list[str] = []

    def take_note(m: re.Match) -> str:
        inner = m.group(1)
        # 例句裡的假名注音（例如「走（はし）る」）保留，其他中文附註抽出
        if KANA_RE.match(inner):
            return m.group(0)
        notes.append(inner)
        return ''

    text = re.sub(r'[（(]([^（）()]*[一-鿿][^（）()]*)[）)]', take_note, text)
    lines = [clean(x) for x in text.split('\n') if clean(x)]
    return '\n'.join(lines), notes


def rows_from_words(page) -> list[list[str]]:
    """備援：用文字座標分欄（抽不到表格時）"""
    words = page.extract_words(x_tolerance=1.5, keep_blank_chars=False)
    lines: dict[int, list] = {}
    for w in words:
        lines.setdefault(round(w['top'] / 4), []).append(w)
    rows = []
    for _, ws in sorted(lines.items()):
        cols = [''] * 5
        for w in sorted(ws, key=lambda x: x['x0']):
            idx = max(i for i, x in enumerate(DEFAULT_COLUMNS) if w['x0'] >= x - 2) if w['x0'] >= DEFAULT_COLUMNS[0] - 2 else 0
            cols[idx] = (cols[idx] + ' ' + w['text']).strip()
        if cols[0].isdigit():
            rows.append(cols)
        elif rows:  # 續行（例句換行）
            rows[-1][4] += '\n' + ' '.join(c for c in cols if c)
    return rows


def parse_pdf(path: Path, page_range: tuple[int, int] | None = None):
    words, failures, warnings = [], [], []
    stats = {'pages': 0, 'tableRows': 0, 'fallbackPages': []}
    with pdfplumber.open(str(path)) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            if page_range and not (page_range[0] <= pno <= page_range[1]):
                continue
            stats['pages'] += 1
            tables = page.extract_tables()
            rows = [r for t in tables for r in t if r]
            if not rows:
                rows = rows_from_words(page)
                stats['fallbackPages'].append(pno)
            for r in rows:
                stats['tableRows'] += 1
                r = [(c or '') for c in r] + [''] * (5 - len(r))
                no, reading, kanji_raw, meaning, example_raw = r[:5]
                no = clean(no)
                reading = clean(reading).replace(' ', '')
                raw_line = ' | '.join(clean(c) for c in r[:5])
                if not no.isdigit():
                    if no or reading:
                        failures.append({'page': pno, 'line': raw_line, 'reason': '編號不是數字（可能是表頭或跨頁殘行）'})
                    continue
                if not reading or not KANA_RE.match(reading):
                    failures.append({'page': pno, 'no': int(no), 'line': raw_line, 'reason': '讀音欄不是假名'})
                    continue
                kanji, tags, notes = parse_kanji(kanji_raw)
                example, ex_notes = parse_example(example_raw)
                notes += ex_notes
                pos, guessed = guess_pos(reading, kanji_raw, kanji)
                missing = []
                if not clean(meaning):
                    missing.append('中文意思')
                if not example:
                    missing.append('例句')
                if missing:
                    warnings.append({'page': pno, 'no': int(no), 'word': kanji or reading, 'missing': missing})
                words.append(
                    {
                        'no': int(no),
                        'kanji': kanji,
                        'reading': reading,
                        'pos': pos,
                        'posGuessed': guessed,
                        'meaning': clean(meaning).replace('\n', ''),
                        'example': example,
                        'exampleTranslation': '',
                        'page': pno,
                        'tags': ['N5', *tags],
                        'note': '；'.join(notes),
                    }
                )
    # 編號連續性檢查
    nos = sorted(w['no'] for w in words)
    if nos:
        gaps = sorted(set(range(nos[0], nos[-1] + 1)) - set(nos))
        for g in gaps:
            failures.append({'no': g, 'reason': '編號缺號（這一列可能沒解析到）'})
        dups = sorted({n for n in nos if nos.count(n) > 1})
        for d in dups:
            failures.append({'no': d, 'reason': '編號重複'})
    return words, failures, warnings, stats


def write_report(path: Path, src: Path, words, failures, warnings, stats):
    guessed = sum(1 for w in words if w['posGuessed'])
    no_kanji = [w for w in words if not w['kanji']]
    lines = [
        f'# 匯入報告：{src.name}',
        f'產生時間：{datetime.now():%Y-%m-%d %H:%M}',
        '',
        f'- 頁數：{stats["pages"]}',
        f'- 成功解析：{len(words)} 筆',
        f'- 解析失敗：{len(failures)} 筆',
        f'- 欄位缺漏：{len(warnings)} 筆',
        f'- 沒有漢字表記（外來語或習慣寫假名）：{len(no_kanji)} 筆（正常，這些字不會出「漢字→讀音」題）',
        f'- 詞性為自動推測：{guessed} 筆（PDF 沒有詞性欄；可在 App 的單字列表修改）',
        '- 例句翻譯：PDF 沒有這一欄，全部留空',
    ]
    if stats['fallbackPages']:
        lines.append(f'- 這些頁抽不到表格，改用文字座標分欄（請特別檢查）：{stats["fallbackPages"]}')
    lines += ['', '## 解析失敗（需要手動修正）', '']
    lines += [f'- p.{f.get("page", "?")} #{f.get("no", "?")}：{f["reason"]}　{f.get("line", "")}' for f in failures] or ['（沒有）']
    lines += ['', '## 欄位缺漏', '']
    lines += [f'- p.{w["page"]} #{w["no"]} {w["word"]}：缺 {"、".join(w["missing"])}' for w in warnings] or ['（沒有）']
    lines += ['', '## 詞性推測統計', '']
    from collections import Counter

    for pos, n in Counter(w['pos'] for w in words).most_common():
        lines.append(f'- {pos}：{n}')
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main(argv=None):
    ap = argparse.ArgumentParser(description='N5 單字 PDF → JSON')
    ap.add_argument('pdf', type=Path)
    ap.add_argument('-o', '--output', type=Path, default=None, help='輸出 JSON（預設：與 PDF 同名 .json）')
    ap.add_argument('--report', type=Path, default=None, help='報告檔（預設：輸出檔名 .report.md）')
    ap.add_argument('--pages', default=None, help='只轉某些頁，例如 12-15')
    a = ap.parse_args(argv)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    out = a.output or a.pdf.with_suffix('.json')
    report = a.report or out.with_suffix('.report.md')
    pr = None
    if a.pages:
        lo, _, hi = a.pages.partition('-')
        pr = (int(lo), int(hi or lo))
    words, failures, warnings, stats = parse_pdf(a.pdf, pr)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps({'source': a.pdf.name, 'generatedAt': datetime.now().isoformat(timespec='seconds'), 'words': words}, ensure_ascii=False, indent=1),
        encoding='utf-8',
    )
    write_report(report, a.pdf, words, failures, warnings, stats)
    print(f'成功 {len(words)} 筆、失敗 {len(failures)} 筆、欄位缺漏 {len(warnings)} 筆')
    print(f'輸出：{out}')
    print(f'報告：{report}')
    return 0 if words else 1


if __name__ == '__main__':
    sys.exit(main())
