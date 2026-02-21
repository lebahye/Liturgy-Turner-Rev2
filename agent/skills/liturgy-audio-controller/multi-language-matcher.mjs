#!/usr/bin/env node
/**
 * MULTI-LANGUAGE PAGE MATCHER
 * Can match using Grapar, Phonetic, OR English
 */

export default class MultiLanguageMatcher {
  constructor(dictionary) {
    this.dict = dictionary;
    this.currentPage = null;
    this.lastUpdate = null;
    this.confidence = 0;
  }
  
  /**
   * Match page using any available language
   */
  matchPage(text, language = 'auto', useTemporalContext = true) {
    let result = null;
    
    if (language === 'auto') {
      // Try Grapar first (most accurate)
      if (/[\u0530-\u058F]{3,}/.test(text)) {
        result = this._matchByLanguage(text, 'grapar', useTemporalContext);
      }
      // Try English
      else if (/\b(the|and|Lord|God|holy)\b/i.test(text)) {
        result = this._matchByLanguage(text, 'english', useTemporalContext);
      }
      // Try Phonetic
      else {
        result = this._matchByLanguage(text, 'phonetic', useTemporalContext);
      }
    } else {
      result = this._matchByLanguage(text, language, useTemporalContext);
    }
    
    return result;
  }
  
  _matchByLanguage(text, language, useTemporalContext) {
    const index = language === 'grapar' ? this.dict.wordIndex :
                  language === 'phonetic' ? this.dict.phoneticIndex :
                  this.dict.englishIndex;
    
    const wordPattern = language === 'grapar' ? /[\u0530-\u058F]+/g :
                       /[a-zA-Zûétsó]+/g;
    
    const words = text.match(wordPattern) || [];
    const pageScores = new Map();
    
    words.forEach(word => {
      const normalized = word.toLowerCase();
      const pages = index[normalized] || [];
      
      if (pages.length > 0) {
        const weight = pages.length <= 3 ? 10 :
                      pages.length <= 10 ? 3 : 1;
        
        pages.forEach(pageNum => {
          pageScores.set(pageNum, (pageScores.get(pageNum) || 0) + weight);
        });
      }
    });
    
    if (pageScores.size === 0) return null;
    
    // Apply temporal boost
    if (useTemporalContext && this.currentPage !== null) {
      const nextPage = this.currentPage + 1;
      if (pageScores.has(nextPage)) {
        pageScores.set(nextPage, pageScores.get(nextPage) * 10);
      }
      if (pageScores.has(this.currentPage)) {
        pageScores.set(this.currentPage, pageScores.get(this.currentPage) * 2);
      }
    }
    
    const sorted = Array.from(pageScores.entries()).sort((a, b) => b[1] - a[1]);
    const topPage = sorted[0][0];
    const topScore = sorted[0][1];
    const secondScore = sorted[1] ? sorted[1][1] : 0;
    const confidence = secondScore > 0 ? topScore / secondScore : 10;
    
    return {
      page: topPage,
      score: topScore,
      confidence: confidence,
      language: language,
      alternatives: sorted.slice(0, 5).map(([p, s]) => ({ page: p, score: s }))
    };
  }
  
  turnToPage(pageNum, confidence) {
    this.currentPage = pageNum;
    this.confidence = confidence;
    this.lastUpdate = Date.now();
  }
  
  reset() {
    this.currentPage = null;
    this.lastUpdate = null;
    this.confidence = 0;
  }
}
