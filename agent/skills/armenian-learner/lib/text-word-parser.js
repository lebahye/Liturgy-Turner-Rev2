/**
 * Text Word Parser
 * 
 * Parses Armenian text from PDF and extracts words
 * Handles old Western Armenian with special characters
 */

import fs from 'fs';

export class TextWordParser {
  constructor() {
    // Armenian Unicode range: U+0530 to U+058F
    this.armenianRegex = /[\u0530-\u058F]+/g;
  }

  /**
   * Load text database (already extracted from PDF)
   * @param {string} textDbPath - Path to text-matcher-db.json
   * @returns {Array} Array of page objects with text
   */
  loadTextDatabase(textDbPath) {
    try {
      const data = JSON.parse(fs.readFileSync(textDbPath, 'utf8'));
      console.log(`[text-parser] Loaded ${data.pages.length} pages`);
      return data.pages;
    } catch (error) {
      console.error('[text-parser] Error loading text database:', error.message);
      return [];
    }
  }

  /**
   * Extract all Armenian words from a page
   * @param {Object} page - Page object from database
   * @returns {Array} Array of {word, position} objects
   */
  extractWords(page) {
    const armenianText = page.armenianText || '';
    const words = [];
    let match;
    
    // Use regex to find all Armenian words
    const regex = new RegExp(this.armenianRegex, 'g');
    
    while ((match = regex.exec(armenianText)) !== null) {
      const word = match[0];
      const position = match.index;
      
      // Filter out very short words (likely fragments)
      if (word.length > 1) {
        words.push({
          word,
          position,
          page: page.pageNumber
        });
      }
    }
    
    return words;
  }

  /**
   * Build word sequences with context
   * @param {Array} words - Array of word objects
   * @returns {Array} Words with before/after context
   */
  buildWordSequences(words) {
    return words.map((wordObj, idx) => {
      const before = idx > 0 ? words[idx - 1].word : null;
      const after = idx < words.length - 1 ? words[idx + 1].word : null;
      
      return {
        ...wordObj,
        context: { before, after }
      };
    });
  }

  /**
   * Process all pages and extract words with context
   * @param {Array} pages - All pages from text database
   * @returns {Map} Map of page number → array of word objects
   */
  processAllPages(pages) {
    console.log(`[text-parser] Processing ${pages.length} pages...`);
    
    const pageWords = new Map();
    let totalWords = 0;
    
    pages.forEach((page, idx) => {
      const words = this.extractWords(page);
      const wordsWithContext = this.buildWordSequences(words);
      
      pageWords.set(page.pageNumber, {
        words: wordsWithContext,
        speakers: page.speakers || [],
        englishText: page.englishText || ''
      });
      
      totalWords += words.length;
      
      if (idx % 20 === 0) {
        console.log(`[text-parser] Processed ${idx + 1}/${pages.length} pages, ${totalWords} words so far`);
      }
    });
    
    console.log(`[text-parser] Total: ${totalWords} words across ${pages.length} pages`);
    
    return pageWords;
  }

  /**
   * Get unique vocabulary across all pages
   * @param {Map} pageWords - Map from processAllPages
   * @returns {Set} Set of unique Armenian words
   */
  getVocabulary(pageWords) {
    const vocab = new Set();
    
    for (const pageData of pageWords.values()) {
      pageData.words.forEach(wordObj => {
        vocab.add(wordObj.word);
      });
    }
    
    return vocab;
  }

  /**
   * Find all occurrences of a specific word
   * @param {Map} pageWords - Map from processAllPages
   * @param {string} targetWord - Armenian word to find
   * @returns {Array} Array of occurrences with page and context
   */
  findWord(pageWords, targetWord) {
    const occurrences = [];
    
    for (const [pageNum, pageData] of pageWords.entries()) {
      pageData.words.forEach(wordObj => {
        if (wordObj.word === targetWord) {
          occurrences.push({
            page: pageNum,
            word: wordObj.word,
            context: wordObj.context,
            speakers: pageData.speakers
          });
        }
      });
    }
    
    return occurrences;
  }

  /**
   * Normalize Armenian text (remove diacritics if needed, lowercase)
   * @param {string} text - Armenian text
   * @returns {string} Normalized text
   */
  normalize(text) {
    // For now, just trim whitespace
    // Could add diacritic removal or case normalization if needed
    return text.trim();
  }

  /**
   * Split text into syllables (approximate for Armenian)
   * @param {string} word - Armenian word
   * @returns {Array} Array of syllables
   */
  splitSyllables(word) {
    // Simplified syllable splitting
    // Real Armenian syllabification is complex
    
    // Armenian vowels (approximate)
    const vowels = 'աեէըիոօւ';
    const syllables = [];
    let currentSyllable = '';
    
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      currentSyllable += char;
      
      // If we hit a vowel, end syllable
      if (vowels.includes(char)) {
        syllables.push(currentSyllable);
        currentSyllable = '';
      }
    }
    
    // Add remaining consonants to last syllable
    if (currentSyllable.length > 0) {
      if (syllables.length > 0) {
        syllables[syllables.length - 1] += currentSyllable;
      } else {
        syllables.push(currentSyllable);
      }
    }
    
    return syllables;
  }
}
