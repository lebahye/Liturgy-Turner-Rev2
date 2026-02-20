/**
 * Pattern Database - The "Brain"
 * 
 * Stores and retrieves learned sound→word mappings
 */

import fs from 'fs';
import path from 'path';

export class PatternDatabase {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.patternsFile = path.join(dataDir, 'learned-patterns.json');
    this.patterns = [];
    this.wordIndex = new Map(); // Quick lookup: armenian word → patterns
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.patternsFile)) {
        const data = JSON.parse(fs.readFileSync(this.patternsFile, 'utf8'));
        this.patterns = data.patterns || [];
        this.rebuildIndex();
        console.log(`[pattern-db] Loaded ${this.patterns.length} patterns`);
      } else {
        console.log('[pattern-db] No existing patterns, starting fresh');
        this.patterns = [];
      }
    } catch (error) {
      console.error('[pattern-db] Error loading patterns:', error.message);
      this.patterns = [];
    }
  }

  save() {
    try {
      const data = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        patternCount: this.patterns.length,
        patterns: this.patterns
      };
      
      fs.writeFileSync(this.patternsFile, JSON.stringify(data, null, 2));
      console.log(`[pattern-db] Saved ${this.patterns.length} patterns`);
    } catch (error) {
      console.error('[pattern-db] Error saving patterns:', error.message);
    }
  }

  rebuildIndex() {
    this.wordIndex.clear();
    this.patterns.forEach((pattern, idx) => {
      const word = pattern.armenianWord;
      if (!this.wordIndex.has(word)) {
        this.wordIndex.set(word, []);
      }
      this.wordIndex.get(word).push(idx);
    });
  }

  addPattern(pattern) {
    // Check if similar pattern already exists
    const existing = this.findSimilarPattern(pattern);
    
    if (existing) {
      // Merge with existing pattern (increase frequency, update confidence)
      existing.frequency += 1;
      existing.confidence = (existing.confidence + pattern.confidence) / 2;
      
      // Add context if new
      if (pattern.context && !existing.contexts.some(c => 
        c.before === pattern.context.before && c.after === pattern.context.after
      )) {
        existing.contexts.push(pattern.context);
      }
      
      // Add learned source
      if (pattern.learnedFrom) {
        existing.learnedFrom.push(pattern.learnedFrom);
      }
      
      console.log(`[pattern-db] Updated pattern for "${pattern.armenianWord}" (freq: ${existing.frequency})`);
    } else {
      // Add new pattern
      const newPattern = {
        armenianWord: pattern.armenianWord,
        soundSignature: pattern.soundSignature,
        confidence: pattern.confidence || 0.5,
        frequency: 1,
        contexts: pattern.context ? [pattern.context] : [],
        learnedFrom: pattern.learnedFrom ? [pattern.learnedFrom] : [],
        createdAt: new Date().toISOString()
      };
      
      this.patterns.push(newPattern);
      
      // Update index
      if (!this.wordIndex.has(newPattern.armenianWord)) {
        this.wordIndex.set(newPattern.armenianWord, []);
      }
      this.wordIndex.get(newPattern.armenianWord).push(this.patterns.length - 1);
      
      console.log(`[pattern-db] Added new pattern for "${pattern.armenianWord}"`);
    }
  }

  findSimilarPattern(pattern) {
    // Get all patterns for this word
    const indices = this.wordIndex.get(pattern.armenianWord) || [];
    
    for (const idx of indices) {
      const existing = this.patterns[idx];
      
      // Compare sound signatures
      if (this.soundSignaturesMatch(existing.soundSignature, pattern.soundSignature)) {
        return existing;
      }
    }
    
    return null;
  }

  soundSignaturesMatch(sig1, sig2, threshold = 0.85) {
    // Compare MFCC features if available
    if (sig1.mfcc && sig2.mfcc) {
      const similarity = this.cosineSimilarity(sig1.mfcc, sig2.mfcc);
      return similarity > threshold;
    }
    
    // Fallback: compare duration and phonemes
    const durationMatch = Math.abs(sig1.duration - sig2.duration) < 0.2;
    const phonemeMatch = sig1.phonemes?.join('') === sig2.phonemes?.join('');
    
    return durationMatch && phonemeMatch;
  }

  cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }
    
    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  findMatchingPatterns(soundSignature, topK = 5) {
    // Score all patterns against this sound signature
    const scores = this.patterns.map((pattern, idx) => ({
      pattern,
      idx,
      score: this.scorePattern(pattern, soundSignature)
    }));
    
    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);
    
    // Return top K
    return scores.slice(0, topK).filter(s => s.score > 0.3);
  }

  scorePattern(pattern, soundSignature) {
    let score = 0;
    
    // MFCC similarity (most important)
    if (pattern.soundSignature.mfcc && soundSignature.mfcc) {
      const mfccSim = this.cosineSimilarity(
        pattern.soundSignature.mfcc,
        soundSignature.mfcc
      );
      score += mfccSim * 0.5; // 50% weight
    }
    
    // Duration similarity
    if (pattern.soundSignature.duration && soundSignature.duration) {
      const durationDiff = Math.abs(
        pattern.soundSignature.duration - soundSignature.duration
      );
      const durationScore = Math.max(0, 1 - durationDiff / 2);
      score += durationScore * 0.2; // 20% weight
    }
    
    // Spectral similarity
    if (pattern.soundSignature.spectralFingerprint && soundSignature.spectralFingerprint) {
      const spectralSim = this.cosineSimilarity(
        pattern.soundSignature.spectralFingerprint,
        soundSignature.spectralFingerprint
      );
      score += spectralSim * 0.2; // 20% weight
    }
    
    // Frequency boost (more common = more likely)
    const freqBoost = Math.min(pattern.frequency / 100, 0.1);
    score += freqBoost;
    
    return score;
  }

  /**
   * Find best matching word for given audio features
   * Used by LiveRecognizerV3 for word recognition
   */
  findBestMatch(soundSignature) {
    const matches = this.findMatchingPatterns(soundSignature, 1);
    
    if (matches.length === 0) {
      return null;
    }
    
    const best = matches[0];
    return {
      word: best.pattern.armenianWord,
      confidence: best.score,
      frequency: best.pattern.frequency
    };
  }

  getStats() {
    const uniqueWords = new Set(this.patterns.map(p => p.armenianWord)).size;
    const totalFrequency = this.patterns.reduce((sum, p) => sum + p.frequency, 0);
    const avgConfidence = this.patterns.reduce((sum, p) => sum + p.confidence, 0) / this.patterns.length || 0;
    
    return {
      totalPatterns: this.patterns.length,
      uniqueWords,
      totalFrequency,
      averageConfidence: avgConfidence
    };
  }
}
