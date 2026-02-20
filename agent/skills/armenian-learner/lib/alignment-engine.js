/**
 * Alignment Engine
 * 
 * Aligns audio segments to text segments
 * Connects sounds to words
 */

export class AlignmentEngine {
  constructor(audioExtractor, textParser, patternDatabase) {
    this.audioExtractor = audioExtractor;
    this.textParser = textParser;
    this.patternDatabase = patternDatabase;
  }

  /**
   * Align audio segments to pages
   * @param {Array} audioSignatures - Array of {page, signature} from audio extractor
   * @param {Map} pageWords - Map of page → words from text parser
   * @returns {Array} Array of aligned patterns ready for database
   */
  async alignAudioToText(audioSignatures, pageWords) {
    console.log(`[alignment] Aligning ${audioSignatures.length} audio segments to text...`);
    
    const patterns = [];
    let alignedCount = 0;
    
    for (let i = 0; i < audioSignatures.length; i++) {
      const audioSeg = audioSignatures[i];
      const pageNum = audioSeg.page;
      const pageData = pageWords.get(pageNum);
      
      if (!pageData || pageData.words.length === 0) {
        console.log(`[alignment] Page ${pageNum}: No text, skipping`);
        continue;
      }
      
      // Strategy: Assign audio signature to all words on this page
      // More sophisticated: could try to segment audio further
      // For now: whole page audio → all words on page
      
      const wordsOnPage = pageData.words;
      
      // Distribute confidence across words (more words = lower confidence per word)
      const baseConfidence = 0.7 / Math.sqrt(wordsOnPage.length);
      
      wordsOnPage.forEach(wordObj => {
        const pattern = {
          armenianWord: wordObj.word,
          soundSignature: audioSeg.signature,
          confidence: Math.min(baseConfidence, 0.8),
          context: wordObj.context,
          learnedFrom: {
            page: pageNum,
            timestamp: audioSeg.start,
            source: 'training'
          }
        };
        
        patterns.push(pattern);
        alignedCount++;
      });
      
      if (i % 10 === 0) {
        console.log(`[alignment] Aligned ${i + 1}/${audioSignatures.length} segments, ${alignedCount} patterns created`);
      }
    }
    
    console.log(`[alignment] Complete: ${alignedCount} patterns from ${audioSignatures.length} segments`);
    
    return patterns;
  }

  /**
   * More sophisticated alignment: try to segment audio within a page
   * @param {Object} audioSeg - Audio segment for whole page
   * @param {Array} words - Words on this page
   * @returns {Array} Array of {word, signature} pairs
   */
  segmentWithinPage(audioSeg, words) {
    // This is where more advanced segmentation would go
    // For v1, we just assign the whole page audio to all words
    // Future: use speaker changes, pauses, energy levels to segment
    
    const duration = audioSeg.signature.duration;
    const timePerWord = duration / words.length;
    
    return words.map((wordObj, idx) => ({
      word: wordObj.word,
      signature: {
        ...audioSeg.signature,
        estimatedStart: audioSeg.start + (idx * timePerWord),
        estimatedDuration: timePerWord
      },
      confidence: 0.5 // Lower confidence for estimated segmentation
    }));
  }

  /**
   * Improve alignment based on repetition
   * If same word appears multiple times, merge their audio signatures
   * @param {Array} patterns - Raw patterns
   * @returns {Array} Improved patterns with merged signatures
   */
  improveWithRepetition(patterns) {
    const wordGroups = new Map();
    
    // Group patterns by word
    patterns.forEach(pattern => {
      const word = pattern.armenianWord;
      if (!wordGroups.has(word)) {
        wordGroups.set(word, []);
      }
      wordGroups.get(word).push(pattern);
    });
    
    // For words that appear multiple times, average their signatures
    const improvedPatterns = [];
    
    for (const [word, group] of wordGroups.entries()) {
      if (group.length === 1) {
        // Only one occurrence, use as-is
        improvedPatterns.push(group[0]);
      } else {
        // Multiple occurrences, merge signatures
        const mergedSignature = this.mergeSignatures(group.map(p => p.signature));
        const avgConfidence = group.reduce((sum, p) => sum + p.confidence, 0) / group.length;
        
        improvedPatterns.push({
          armenianWord: word,
          soundSignature: mergedSignature,
          confidence: Math.min(avgConfidence * 1.2, 0.95), // Boost confidence for repeated words
          contexts: group.map(p => p.context).filter(c => c),
          learnedFrom: group.map(p => p.learnedFrom)
        });
      }
    }
    
    console.log(`[alignment] Improved ${patterns.length} patterns → ${improvedPatterns.length} unique words`);
    
    return improvedPatterns;
  }

  /**
   * Merge multiple audio signatures into one
   * @param {Array} signatures - Array of sound signatures
   * @returns {Object} Merged signature
   */
  mergeSignatures(signatures) {
    if (signatures.length === 1) return signatures[0];
    
    // Filter out undefined/null signatures
    const validSignatures = signatures.filter(s => s && typeof s === 'object');
    if (validSignatures.length === 0) return signatures[0] || {};
    if (validSignatures.length === 1) return validSignatures[0];
    
    const merged = {
      mfcc: this.averageVectors(validSignatures.map(s => s.mfcc).filter(v => v)),
      spectralCentroid: this.average(validSignatures.map(s => s.spectralCentroid).filter(v => v !== undefined)),
      spectralRolloff: this.average(validSignatures.map(s => s.spectralRolloff).filter(v => v !== undefined)),
      rms: this.average(validSignatures.map(s => s.rms).filter(v => v !== undefined)),
      zcr: this.average(validSignatures.map(s => s.zcr).filter(v => v !== undefined)),
      spectralFlatness: this.average(validSignatures.map(s => s.spectralFlatness).filter(v => v !== undefined)),
      spectralKurtosis: this.average(validSignatures.map(s => s.spectralKurtosis).filter(v => v !== undefined)),
      duration: this.average(validSignatures.map(s => s.duration).filter(v => v !== undefined)),
      spectralFingerprint: this.averageVectors(validSignatures.map(s => s.spectralFingerprint).filter(v => v)),
      phonemes: validSignatures[0]?.phonemes || []
    };
    
    return merged;
  }

  averageVectors(vectors) {
    if (vectors.length === 0) return [];
    
    // Filter valid vectors
    const validVectors = vectors.filter(v => Array.isArray(v) && v.length > 0);
    if (validVectors.length === 0) return [];
    
    const len = validVectors[0].length;
    const avg = new Array(len).fill(0);
    
    validVectors.forEach(vec => {
      for (let i = 0; i < len; i++) {
        avg[i] += (vec[i] || 0);
      }
    });
    
    return avg.map(val => val / validVectors.length);
  }

  average(numbers) {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }
}
