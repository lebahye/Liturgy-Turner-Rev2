# ⚠️ CRITICAL: Page Number Reference

## ALWAYS USE PDF PAGE NUMBERS!

### What to Use ✅
**PDF Page Numbers:** 1, 2, 3, 4, ... 183
- Physical position in the PDF file
- What pdftotext -f X -l X uses
- What training sessions record
- What the page turner displays

### What to IGNORE ❌
**Book Page Numbers:** "Էջ/Page X" written in the PDF text
- References a separate liturgy book we don't have
- Not the same as PDF page numbers
- IGNORE THESE COMPLETELY

---

## Examples

### ✅ CORRECT
```javascript
// Extract PDF page 50 (50th physical page)
pdftotext -f 50 -l 50 liturgy.pdf

// Match to PDF page number
const result = matcher.matchPage(text);
console.log('Turn to PDF page', result.page); // 1-183
```

### ❌ WRONG
```javascript
// DON'T extract by book page number from text
const bookPage = text.match(/Էջ\/Page\s+(\d+)/)[1]; // ❌ WRONG!

// DON'T use book page numbers
console.log('Turn to book page', bookPage); // ❌ WRONG!
```

---

## Training Sessions

Both training sessions use **PDF page numbers:**

- **Session 1 (Feb 20):** PDF pages 3-21 (19 pages)
- **Session 2 (Feb 21):** PDF pages 4-36 (33 pages)

---

## Why This Matters

The liturgy book has its own page numbering system that doesn't match the PDF. The PDF we're working with has:
- **183 physical pages** (what we care about)
- Book page numbers written in the text (what we ignore)

Many physical PDF pages may reference the same book page number, or skip book page numbers entirely.

**We turn PDF pages, not book pages!**

---

## Memory Aid

💡 **Think of it like this:**
- PDF page = page number in Adobe Reader / page position in file
- Book page = page number printed in a physical book

We're building a **PDF page turner**, not a book page finder.

---

**Last updated:** 2026-02-21  
**Never forget:** PDF pages 1-183, ignore book page numbers! ✅
