#!/usr/bin/env python3
"""
Rebuild text-matcher-db.json — THE SINGLE SOURCE OF TRUTH for the agent.

Reads from: SQLite page_sections (armenian_text, phonetic_text, english_text)
Outputs: training-data/text-matcher-db.json in MultiLanguageMatcher format
Also updates: SQLite word_dictionary table

Format required by MultiLanguageMatcher:
{
  "wordIndex":     { "armenian_word": [page1, page2, ...], ... },
  "phoneticIndex": { "phonetic_word": [page1, page2, ...], ... },
  "englishIndex":  { "english_word":  [page1, page2, ...], ... },
  "metadata": { ... }
}

Western Armenian pronunciation for Grabar liturgical text.
Reference: BGN/PCGN transliteration adapted for Western Armenian.
"""

import sqlite3
import json
import re
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.join(SCRIPT_DIR, '..')
DB_PATH = os.path.join(PROJECT_DIR, 'data', 'liturgy-turner.db')
OUTPUT_PATH = os.path.join(PROJECT_DIR, 'training-data', 'text-matcher-db.json')
DICT_JSON_PATH = os.path.join(PROJECT_DIR, 'training-data', 'clean-dictionary.json')

# ═══════════════════════════════════════════════════════════════
# Western Armenian Transliteration for Grabar
# BGN/PCGN base with Western Armenian consonant shifts
# ═══════════════════════════════════════════════════════════════

LIGS = {
    '\uFB13': '\u0574\u0576',
    '\uFB14': '\u0574\u0565',
    '\uFB15': '\u0574\u056B',
    '\uFB16': '\u057E\u0576',
    '\uFB17': '\u0574\u056D',
}

LOWER_MAP = {
    '\u0561': 'a',  '\u0562': 'p',  '\u0563': 'k',  '\u0564': 't',
    '\u0565': 'e',  '\u0566': 'z',  '\u0567': 'e',  '\u0568': 'u',
    '\u0569': 't',  '\u056A': 'zh', '\u056B': 'i',  '\u056C': 'l',
    '\u056D': 'kh', '\u056E': 'dz', '\u056F': 'g',  '\u0570': 'h',
    '\u0571': 'ts', '\u0572': 'gh', '\u0573': 'ch', '\u0574': 'm',
    '\u0575': 'y',  '\u0576': 'n',  '\u0577': 'sh', '\u0578': 'o',
    '\u0579': 'ch', '\u057A': 'b',  '\u057B': 'j',  '\u057C': 'r',
    '\u057D': 's',  '\u057E': 'v',  '\u057F': 'd',  '\u0580': 'r',
    '\u0581': 'ts', '\u0582': 'v',  '\u0583': 'p',  '\u0584': 'k',
    '\u0585': 'o',  '\u0586': 'f',
}

UPPER_MAP = {
    '\u0531': 'A',  '\u0532': 'P',  '\u0533': 'K',  '\u0534': 'T',
    '\u0535': 'Ye', '\u0536': 'Z',  '\u0537': 'E',  '\u0538': 'U',
    '\u0539': 'T',  '\u053A': 'Zh', '\u053B': 'I',  '\u053C': 'L',
    '\u053D': 'Kh', '\u053E': 'Dz', '\u053F': 'G',  '\u0540': 'H',
    '\u0541': 'Ts', '\u0542': 'Gh', '\u0543': 'Ch', '\u0544': 'M',
    '\u0545': 'Y',  '\u0546': 'N',  '\u0547': 'Sh', '\u0548': 'Vo',
    '\u0549': 'Ch', '\u054A': 'B',  '\u054B': 'J',  '\u054C': 'R',
    '\u054D': 'S',  '\u054E': 'V',  '\u054F': 'D',  '\u0550': 'R',
    '\u0551': 'Ts', '\u0552': 'V',  '\u0553': 'P',  '\u0554': 'K',
    '\u0555': 'O',  '\u0556': 'F',
}

ABBREVIATIONS = {
    '\u0534\u054A\u0550': 'Tpir',
    '\u054D\u0550\u053F': 'Srk',
    '\u0554\u0540\u0546': 'Khn',
    '\u053F\u0531\u0546\u0533\u0546\u053B\u053C': 'Gankneel',
    '\u0546\u054D\u054F\u053B\u053C': 'Nsdeel',
    '\u0548\u054F\u0554\u053B': 'Vodki',
}

ARMENIAN_VOWELS = {'\u0561', '\u0565', '\u056B', '\u0578', '\u0585', '\u0567', '\u0568'}


def decompose(text):
    for k, v in LIGS.items():
        text = text.replace(k, v)
    return text


def transliterate(word):
    text = decompose(word.rstrip('\u0589.:,;\u058A\u055D\u055E\u055B\u055C'))
    if text in ABBREVIATIONS:
        return ABBREVIATIONS[text]

    result = []
    i = 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else None
        aft = text[i + 2] if i + 2 < len(text) else None
        is_first = (i == 0)

        # olu digraph: before vowel = v, before consonant/end = oo
        if ch == '\u0578' and nxt == '\u0582':
            if aft and aft in ARMENIAN_VOWELS:
                result.append('vo' if is_first else 'v')
            else:
                result.append('oo')
            i += 2
            continue
        # ilu digraph = yoo
        if ch == '\u056B' and nxt == '\u0582':
            result.append('yoo')
            i += 2
            continue
        # ev digraph
        if ch == '\u0565' and nxt == '\u0582':
            result.append('yev' if is_first else 'ev')
            i += 2
            continue
        # Context-sensitive: e initial = ye
        if ch == '\u0565':
            result.append('ye' if is_first else 'e')
            i += 1
            continue
        # Context-sensitive: o initial = vo
        if ch == '\u0578':
            result.append('vo' if is_first else 'o')
            i += 1
            continue
        if ch == '\u0535':
            result.append('Ye' if is_first else 'E')
            i += 1
            continue
        if ch == '\u0548':
            result.append('Vo' if is_first else 'O')
            i += 1
            continue

        if ch in LOWER_MAP:
            result.append(LOWER_MAP[ch])
        elif ch in UPPER_MAP:
            result.append(UPPER_MAP[ch])
        i += 1

    return ''.join(result)


def extract_words(text, pattern):
    """Extract words from text, return list of (word, normalized) tuples."""
    words = pattern.findall(text or '')
    return [(w, w.lower().strip('.,;:!?\u0589\u058A\u055D\u055E\u055B\u055C'))
            for w in words if len(w) >= 2]


def main():
    db = sqlite3.connect(DB_PATH)

    rows = db.execute(
        "SELECT page_number, armenian_text, phonetic_text, english_text "
        "FROM page_sections ORDER BY page_number"
    ).fetchall()

    print(f"Processing {len(rows)} page sections...")

    ARM_WORD = re.compile(r'[\u0530-\u058F\uFB13-\uFB17]{2,}')
    LATIN_WORD = re.compile(r'[a-zA-ZûéèàâêîôùëïüöäÉ\']+')
    ENG_WORD = re.compile(r'[a-zA-Z]{2,}')

    word_index = {}      # armenian_lower → set of pages
    phonetic_index = {}  # phonetic_lower → set of pages
    english_index = {}   # english_lower → set of pages

    # Also build clean dictionary entries
    arm_word_data = {}   # armenian → {phonetic, pages, occurrences}

    for page_num, arm_text, phon_text, eng_text in rows:
        # Armenian words
        if arm_text:
            clean = decompose(arm_text)
            for raw_word, _ in extract_words(clean, ARM_WORD):
                cleaned = raw_word.rstrip('\u0589.:,;\u058A\u055D\u055E\u055B\u055C')
                if len(cleaned) < 2:
                    continue
                normalized = cleaned.lower()

                if normalized not in word_index:
                    word_index[normalized] = set()
                word_index[normalized].add(page_num)

                # Track for dictionary
                if cleaned not in arm_word_data:
                    arm_word_data[cleaned] = {'pages': set(), 'occ': 0}
                arm_word_data[cleaned]['pages'].add(page_num)
                arm_word_data[cleaned]['occ'] += 1

                # Generate phonetic and add to phonetic index
                phonetic = transliterate(cleaned).lower()
                if phonetic and len(phonetic) >= 2:
                    if phonetic not in phonetic_index:
                        phonetic_index[phonetic] = set()
                    phonetic_index[phonetic].add(page_num)

        # Phonetic text (already Latin)
        if phon_text:
            for raw_word, norm in extract_words(phon_text, LATIN_WORD):
                if len(norm) < 2 or norm in ('the', 'and', 'of', 'to', 'in', 'a', 'is', 'for', 'on', 'at'):
                    continue
                if norm not in phonetic_index:
                    phonetic_index[norm] = set()
                phonetic_index[norm].add(page_num)

        # English text
        if eng_text:
            for raw_word, norm in extract_words(eng_text, ENG_WORD):
                if len(norm) < 3:
                    continue
                if norm not in english_index:
                    english_index[norm] = set()
                english_index[norm].add(page_num)

    # Convert sets to sorted lists for JSON
    out = {
        'wordIndex': {k: sorted(v) for k, v in sorted(word_index.items())},
        'phoneticIndex': {k: sorted(v) for k, v in sorted(phonetic_index.items())},
        'englishIndex': {k: sorted(v) for k, v in sorted(english_index.items())},
        'metadata': {
            'totalPages': 183,
            'armenianWords': len(word_index),
            'phoneticWords': len(phonetic_index),
            'englishWords': len(english_index),
            'source': 'page_sections (SQLite)',
            'builtBy': 'rebuild-text-matcher-db.py',
            'builtAt': __import__('datetime').datetime.now().isoformat(),
        }
    }

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"\n═══ text-matcher-db.json REBUILT ═══")
    print(f"Armenian words (wordIndex): {len(word_index)}")
    print(f"Phonetic words (phoneticIndex): {len(phonetic_index)}")
    print(f"English words (englishIndex): {len(english_index)}")
    print(f"File size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB")
    print(f"Saved: {OUTPUT_PATH}")

    # Also rebuild word_dictionary in SQLite
    db.execute("DELETE FROM word_dictionary")
    pdf_id_row = db.execute("SELECT pdf_id FROM uploaded_files LIMIT 1").fetchone()
    pdf_id = pdf_id_row[0] if pdf_id_row else 'badarak-rev3.5'

    dict_output = []
    for word, data in sorted(arm_word_data.items()):
        phonetic = transliterate(word)
        entry = {
            'armenian': word,
            'phonetic': phonetic,
            'pages': sorted(data['pages']),
            'first_page': min(data['pages']),
            'occurrences': data['occ'],
            'page_count': len(data['pages']),
        }
        dict_output.append(entry)
        db.execute(
            "INSERT INTO word_dictionary (id, pdf_id, armenian, phonetic, page_number, occurrences, confidence) "
            "VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 1.0)",
            (pdf_id, word, phonetic, entry['first_page'], data['occ'])
        )

    db.commit()

    with open(DICT_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(dict_output, f, ensure_ascii=False, indent=2)

    print(f"\n═══ word_dictionary TABLE REBUILT ═══")
    print(f"Entries: {len(dict_output)}")
    print(f"Also saved: {DICT_JSON_PATH}")

    # Verify key words
    print(f"\n═══ KEY WORD VERIFICATION ═══")
    checks = [
        ('տէր', 'der', 'Lord'),
        ('աստուած', 'asdvadz', 'God'),
        ('սուրբ', 'soorp', 'Holy'),
        (' delays', 'amen', 'Amen'),
        ('delays', 'voghormea', 'Have mercy'),
        ('delays', 'park', 'Glory'),
        ('delays', 'yev', 'and'),
        ('delays', 'krisdos', 'Christ'),
        ('delays', 'hoki', 'spirit'),
        ('delays', 'hayr', 'father'),
    ]
    for arm, expected_phon, eng in checks:
        if arm in word_index:
            pages = word_index[arm]
            phonetic = transliterate(arm) if arm in arm_word_data else '?'
            match = expected_phon.lower() in phonetic.lower()
            status = '\u2705' if match else '\u274c'
            print(f"  {status} {arm:20} phon={phonetic:15} pages={len(pages):3d}  ({eng})")
        else:
            print(f"  \u26a0\ufe0f  {arm:20} NOT IN wordIndex")

    db.close()


if __name__ == '__main__':
    main()
