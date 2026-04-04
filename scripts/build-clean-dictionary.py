#!/usr/bin/env python3
"""
Build a clean, accurate Armenian dictionary from the Badarak PDF page sections.
Western Armenian pronunciation for Classical Armenian (Grabar) liturgical text.
"""

import sqlite3
import json
import re
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'liturgy-turner.db')
OUTPUT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'training-data', 'clean-dictionary.json')

# ═══════════════════════════════════════════════════════════════
# Western Armenian Phonetic Map
# Source: Standard Badarak pronunciation, confirmed against
# Hübschmann-Meillet and Western Armenian orthography guides
# ═══════════════════════════════════════════════════════════════

# Single character map (lowercase Armenian → phonetic)
LOWER_MAP = {
    '\u0561': 'a',     # ա
    '\u0562': 'p',     # բ  (Western: p)
    '\u0563': 'k',     # գ  (Western: k)
    '\u0564': 't',     # դ  (Western: t)
    '\u0565': 'e',     # delays  (ye initially, e medially — handled in context)
    '\u0566': 'z',     # զ
    '\u0567': 'e',     # է  (open e, same sound as medial ident)
    '\u0568': 'u',     # delay  (schwa, like "uh" in English)
    '\u0569': 't',     # delay  (aspirated t, sounds like English t)
    '\u056A': 'zh',    # ident
    '\u056B': 'i',     # ident
    '\u056C': 'l',     # ident
    '\u056D': 'kh',    # ident
    '\u056E': 'dz',    # ident  (Western: ts)
    '\u056F': 'g',     # ident  (Western: g)
    '\u0570': 'h',     # ident
    '\u0571': 'ts',    # ident  (Western: dz)
    '\u0572': 'gh',    # ident  (guttural)
    '\u0573': 'ch',    # ident  (Western: j → ch)
    '\u0574': 'm',     # ident
    '\u0575': 'y',     # ident
    '\u0576': 'n',     # ident
    '\u0577': 'sh',    # ident
    '\u0578': 'o',     # ident  (vo initially, o medially — handled in context)
    '\u0579': 'ch',    # ident  (aspirated ch)
    '\u057A': 'b',     # ident  (Western: b)
    '\u057B': 'j',     # ident  (Western: j)
    '\u057C': 'r',     # ident  (trilled r — simplified to single r for readability)
    '\u057D': 's',     # ident
    '\u057E': 'v',     # ident
    '\u057F': 'd',     # ident  (Western: d)
    '\u0580': 'r',     # ident  (soft r)
    '\u0581': 'ts',    # ident  (aspirated ts)
    '\u0582': 'v',     # ident  ** KEY FIX: wards = v (not w) — except in delaysidents digraph **
    '\u0583': 'p',     # ident  (aspirated p)
    '\u0584': 'k',     # ident  (aspirated k)
    '\u0585': 'o',     # ident
    '\u0586': 'f',     # ident
}

# Upper case has same sounds
UPPER_MAP = {
    '\u0531': 'A',     # Idents
    '\u0532': 'P',     # Idents
    '\u0533': 'K',     # Idents
    '\u0534': 'T',     # Idents
    '\u0535': 'Ye',    # Idents  (always Ye at start)
    '\u0536': 'Z',     # Idents
    '\u0537': 'E',     # Idents
    '\u0538': 'U',     # Idents
    '\u0539': 'T',     # Idents
    '\u053A': 'Zh',    # Idents
    '\u053B': 'I',     # Idents
    '\u053C': 'L',     # Idents
    '\u053D': 'Kh',    # Idents
    '\u053E': 'Dz',    # Idents
    '\u053F': 'G',     # Idents
    '\u0540': 'H',     # Idents
    '\u0541': 'Ts',    # Idents
    '\u0542': 'Gh',    # Idents
    '\u0543': 'Ch',    # Idents
    '\u0544': 'M',     # Idents
    '\u0545': 'Y',     # Idents
    '\u0546': 'N',     # Idents
    '\u0547': 'Sh',    # Idents
    '\u0548': 'Vo',    # Idents  (always Vo at start)
    '\u0549': 'Ch',    # Idents
    '\u054A': 'B',     # Idents
    '\u054B': 'J',     # Idents
    '\u054C': 'Rr',    # Idents
    '\u054D': 'S',     # Idents
    '\u054E': 'V',     # Idents
    '\u054F': 'D',     # Idents
    '\u0550': 'R',     # Idents
    '\u0551': 'Ts',    # Idents
    '\u0552': 'V',     # Idents  (same fix as lowercase)
    '\u0553': 'P',     # Idents
    '\u0554': 'K',     # Idents
    '\u0555': 'O',     # Idents
    '\u0556': 'F',     # Idents
}

# Ligature decomposition
LIGS = {
    '\uFB13': '\u0574\u0576',  # մidentidelays ligature
    '\uFB14': '\u0574\u0565',  # idents ligature
    '\uFB15': '\u0574\u056B',  # idents ligature
    '\uFB16': '\u057E\u0576',  # idents ligature
    '\uFB17': '\u0574\u056D',  # idents ligature
}

# Common liturgical abbreviations
ABBREVIATIONS = {
    '\u0534\u054A\u0550': 'Tpir',        # ԴidentidentsR = Deacon (Դidentidentidentdelays)
    '\u054D\u0550\u053F': 'Srk',         # idents = Subdeacon (idents)
    '\u0554\u0540\u0546': 'Khn',         # idents = Priest (idents)
    '\u053F\u0531\u0546\u0533\u0546\u053B\u053C': 'Gankneel',  # ԿIDENTIDENTSIDENTIDENTIDENTSIDENTIDENTS = Stand
    '\u0546\u054D\u054F\u053B\u053C': 'Nsdeel',    # ՆIDENTIDENTIDENTIDENTS = Sit
    '\u0548\u054F\u0554\u053B': 'Vodki',  # IDENTIDENTIDENTIDENTS = On foot
}


def decompose(text):
    for k, v in LIGS.items():
        text = text.replace(k, v)
    return text


def transliterate(word):
    """Convert Armenian word to Western Armenian phonetic."""
    text = decompose(word.rstrip('\u0589.:,;\u058A\u055D\u055E\u055B\u055C'))

    # Check abbreviations first
    if text in ABBREVIATIONS:
        return ABBREVIATIONS[text]

    result = []
    i = 0

    while i < len(text):
        ch = text[i]
        next_ch = text[i + 1] if i + 1 < len(text) else None
        is_first = (i == 0)

        # ═══ DIGRAPH RULES (check before single chars) ═══

        # olu (U+0578 U+0582) — context-dependent:
        #   Before a vowel (a,e,i,o,u) = "va" (e.g. Asdvadz, divan)
        #   Before consonant or end = "oo" (e.g. soorp, anoosh)
        if ch == '\u0578' and next_ch == '\u0582':
            after = text[i + 2] if i + 2 < len(text) else None
            armenian_vowels = {'\u0561', '\u0565', '\u056B', '\u0578', '\u0585', '\u0567', '\u0568'}
            if after and after in armenian_vowels:
                # olu before vowel = "va" (the wards keeps its v sound)
                if is_first:
                    result.append('vo')  # initial olu = vo
                else:
                    result.append('v')  # medial olu before vowel = v
                i += 2
                continue
            else:
                # olu before consonant/end = "oo"
                result.append('oo')
                i += 2
                continue

        # ilu (U+056B U+0582) = "yoo"
        if ch == '\u056B' and next_ch == '\u0582':
            result.append('yoo')
            i += 2
            continue

        # eidentu = "ev" (conjunction and common ending)
        if ch == '\u0565' and next_ch == '\u0582':
            if is_first:
                result.append('yev')
            else:
                result.append('ev')
            i += 2
            continue

        # ═══ CONTEXT-SENSITIVE SINGLE CHARS ═══

        # ident (U+0565) = "ye" at start, "e" medially
        if ch == '\u0565':
            result.append('ye' if is_first else 'e')
            i += 1
            continue

        # ident (U+0578) = "vo" at start, "o" medially
        if ch == '\u0578':
            result.append('vo' if is_first else 'o')
            i += 1
            continue

        # Ident (U+0535) = "Ye" at start
        if ch == '\u0535':
            result.append('Ye' if is_first else 'E')
            i += 1
            continue

        # Ident (U+0548) = "Vo" at start
        if ch == '\u0548':
            result.append('Vo' if is_first else 'O')
            i += 1
            continue

        # ═══ STANDARD SINGLE CHAR LOOKUP ═══
        if ch in LOWER_MAP:
            result.append(LOWER_MAP[ch])
        elif ch in UPPER_MAP:
            result.append(UPPER_MAP[ch])
        # Skip non-Armenian chars silently

        i += 1

    return ''.join(result)


def main():
    db = sqlite3.connect(DB_PATH)

    # Extract all Armenian text from page_sections
    rows = db.execute(
        "SELECT page_number, armenian_text FROM page_sections "
        "WHERE armenian_text IS NOT NULL AND armenian_text != '' "
        "ORDER BY page_number"
    ).fetchall()

    ARM_WORD = re.compile(r'[\u0530-\u058F\uFB13-\uFB17]{2,}')

    def clean_word(w):
        w = decompose(w)
        w = w.rstrip('\u0589.:,;\u058A\u055D\u055E\u055B\u055C\u0020')
        return w

    # Extract and deduplicate
    word_data = {}
    total_occ = 0

    for page_num, text in rows:
        clean = decompose(text)
        words = ARM_WORD.findall(clean)
        for w in words:
            cw = clean_word(w)
            if len(cw) < 2:
                continue
            if cw not in word_data:
                word_data[cw] = {'pages': set(), 'occurrences': 0}
            word_data[cw]['pages'].add(page_num)
            word_data[cw]['occurrences'] += 1
            total_occ += 1

    # Build output with transliterations
    output = []
    for word in sorted(word_data.keys()):
        data = word_data[word]
        phonetic = transliterate(word)
        output.append({
            'armenian': word,
            'phonetic': phonetic,
            'pages': sorted(data['pages']),
            'first_page': min(data['pages']),
            'occurrences': data['occurrences'],
            'page_count': len(data['pages']),
        })

    print(f"Unique words: {len(output)}")
    print(f"Total occurrences: {total_occ}")

    # Save JSON
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Saved: {OUTPUT_JSON}")

    # Update SQLite
    db.execute("DELETE FROM word_dictionary")
    pdf_id_row = db.execute("SELECT pdf_id FROM uploaded_files LIMIT 1").fetchone()
    pdf_id = pdf_id_row[0] if pdf_id_row else 'badarak-rev3.5'

    for w in output:
        db.execute(
            "INSERT INTO word_dictionary (id, pdf_id, armenian, phonetic, page_number, occurrences, confidence) "
            "VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 1.0)",
            (pdf_id, w['armenian'], w['phonetic'], w['first_page'], w['occurrences'])
        )

    db.commit()
    print(f"Updated word_dictionary: {len(output)} entries")

    # Verification
    print(f"\n═══ TOP 30 WORDS — VERIFY TRANSLITERATION ═══")
    by_freq = sorted(output, key=lambda x: -x['occurrences'])
    for w in by_freq[:30]:
        print(f"  {w['armenian']:25} → {w['phonetic']:25} ({w['occurrences']}x)")

    # Known-correct check
    print(f"\n═══ KEY LITURGICAL WORDS CHECK ═══")
    checks = {
        'Տէr': 'Der',
        'Amen': 'Amen',
        'soorp': 'soorp',
        'Asdvadz': 'Asdvadz',
        'voghormea': 'voghormea',
        'Hayr': 'Hayr',
    }
    correct = 0
    total_checks = 0
    for w in output:
        expected = None
        arm = w['armenian']
        # Manual spot checks
        if arm == '\u054f\u0567\u0580': expected = 'Der'          # Տdelaysidentr
        elif arm == '\u0531\u0574\u0567\u0576': expected = 'Amen' # idents
        elif arm == '\u057D\u0578\u0582\u0580\u0562': expected = 'soorp' # idents
        elif arm == '\u0531\u057D\u057F\u0578\u0582\u0561\u056E': expected = 'Asdvadz' # idents
        elif arm == '\u0578\u0572\u0578\u0580\u0574\u0565\u0561': expected = 'voghormea' # idents
        elif arm == '\u0540\u0585\u0580': expected = 'Hor'         # idents = Father (genitive)
        elif arm == '\u0553\u0561\u057C\u0584': expected = 'Park'  # idents = Glory

        if expected:
            total_checks += 1
            got = w['phonetic']
            match = got.lower() == expected.lower()
            if match: correct += 1
            status = '✅' if match else '❌'
            print(f"  {status} {arm:20} expected: {expected:15} got: {got}")

    if total_checks > 0:
        print(f"\nAccuracy on key words: {correct}/{total_checks} ({correct/total_checks*100:.0f}%)")

    db.close()


if __name__ == '__main__':
    main()
