# Liturgy Complete Dictionary

**File:** `liturgy-complete-dictionary.json`  
**Source:** Badarak-page-turner-V3-2-21-26.pdf  
**Created:** 2026-02-21

## Structure

The dictionary contains **paired Grapar (original Armenian) and Phonetic (transliteration)** text for all liturgy pages.

### Statistics

- **Total unique pages:** 33
- **Grapar pages:** 33
- **Phonetic pages:** 33
- **Grapar words indexed:** 1,100 unique words
- **Phonetic words indexed:** 950 unique words

### Coverage (Test Range: Pages 3-35)

- **Grapar:** 30/33 pages (90.9%)
- **Phonetic:** 30/33 pages (90.9%)
- **Missing both:** 27, 31, 32 (encoding issues)
- **Missing phonetic only:** 11

## JSON Structure

```json
{
  "created": "ISO timestamp",
  "source": "PDF filename",
  "totalPages": 33,
  "statistics": {
    "graparPages": 33,
    "phoneticPages": 33,
    "graparWords": 1100,
    "phoneticWords": 950
  },
  "pages": [
    {
      "page": 1,
      "grapar": "Armenian Unicode text...",
      "phonetic": "Transliterated text..."
    },
    ...
  ],
  "indexes": {
    "grapar": {
      "word": [page numbers],
      ...
    },
    "phonetic": {
      "word": [page numbers],
      ...
    }
  }
}
```

## Sample Page (Page 8)

**Grapar:**
```
ՔՀՆ. տաճարս այս սուրբ: Եւ արա ընդ ﬔզ եւ ընդ աղօթակիցս ﬔր
առատապէս զողորմութիւն քո եւ զգթութիւն: Զի քեզ վայել է փառք,
իշխանութիւն եւ պատիւ, այժմ եւ ﬕշտ եւ յաւիտեանս յաւիտենից։ Ամէն:
```

**Phonetic:**
```
CLB. dajarûs ays soorp. Yév ara ûnt méz yév ûnt aghotagitsûs mér
aradabés zoghormootyoon ko yév ûzkûtootyoon. Zi kéz vayélé park,
ishkhanootyoon yév badiv, ayzhm yév mishd yév havidyanûs havidénits. Amén.
```

## Top Words

### Grapar (Armenian)
| Word | Pages | Meaning |
|------|-------|---------|
| տէր | 30 | Lord |
| դպր | 28 | Deacon |
| սրկ | 28 | Deacon (abbrev) |
| քհն | 26 | Priest (abbrev) |
| աստուած | 25 | God |
| սուրբ | 22 | Holy |
| ողոր | 21 | Mercy |

### Phonetic (Transliteration)
| Word | Pages |
|------|-------|
| and | 33 |
| the | 33 |
| yév | 32 |
| lord | 29 |
| god | 28 |
| dér | 27 |
| holy | 26 |

## Speaker Labels

**Armenian:**
- **ՔՀՆ** = Քահանայ (Priest) → CLB (Celebrant)
- **ԴՊՐ** = Դպիր (Deacon) → DCN (Deacon)
- **ՍՐԿ** = Սարկաւագ (Deacon) → DCN (Deacon)
- **CHR** = Choir

**Phonetic:**
- **CLB** = Celebrant (Priest)
- **DCN** = Deacon
- **CHR** = Choir
- **PRS** = Priest
- **ACL** = Acolyte
- **TOGETHER** = Congregation

## Usage

### Search by Grapar word
```javascript
const dict = require('./liturgy-complete-dictionary.json');
const pages = dict.indexes.grapar['աստուած']; // Find "God"
// Returns: [1, 2, 3, 4, 5, 7, 8, 9, ...]
```

### Search by Phonetic word
```javascript
const pages = dict.indexes.phonetic['asdvadz']; // "God" in phonetic
// Returns: [1, 2, 3, 4, 5, 7, 8, 9, ...]
```

### Get page content
```javascript
const page8 = dict.pages.find(p => p.page === 8);
console.log(page8.grapar);    // Armenian text
console.log(page8.phonetic);  // Transliteration
```

## Missing Pages

Pages with encoding issues (garbled Armenian font):
- **27** - Both Grapar and Phonetic missing
- **31** - Both missing
- **32** - Both missing
- **11** - Phonetic only missing

These pages can be:
1. Manually transcribed
2. OCR'd from PDF
3. Handled via audio fingerprinting fallback

## Future Enhancements

- [ ] Add English translation section
- [ ] Fix encoding for pages 27, 31, 32
- [ ] Extract remaining 150 pages (if they exist)
- [ ] Build Grapar ↔ Phonetic word mapping
- [ ] Add pronunciation guide
- [ ] Link to audio timestamps

---

**Status:** ✅ Ready for text-based page matching!
