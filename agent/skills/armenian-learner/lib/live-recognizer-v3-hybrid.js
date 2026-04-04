/**
 * Live Recognizer V3 - Hybrid System
 * 
 * Combines:
 * 1. Page-level audio matching (30%)
 * 2. Word recognition (50%)
 * 3. Temporal context (20%)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LiveRecognizerV3Hybrid {
  constructor(audioExtractor, pageMatcher, patternDb) {
    this.audioExtractor = audioExtractor;
    this.pageMatcher = pageMatcher;
    this.patternDb = patternDb;
    
    this.isRunning = false;
    this.audioBuffer = [];
    this.bufferDuration = 5.0; // seconds
    this.sampleRate = 44100;
    this.maxBufferSamples = this.bufferDuration * this.sampleRate;
    this.onPageDetected = null;
    this.currentPage = null;
    this.lastTriggerTime = 0;
    this.minTimeBetweenTriggers = 2000; // ms
    
    // Load word-to-page index
    const indexPath = path.join(__dirname, '../../../memory/armenian-word-index.json');
    if (fs.existsSync(indexPath)) {
      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      this.wordToPages = indexData.wordToPages;
      console.log('[live-recognizer-v3] Loaded word index:', Object.keys(this.wordToPages).length, 'words');
    } else {
      this.wordToPages = {};
      console.warn('[live-recognizer-v3] ⚠️  Word index not found, word matching disabled');
    }
    
    // Weights for fusion
    this.weights = {
      pageLevel: 0.30,
      wordRecognition: 0.50,
      temporal: 0.20
    };
    
    // History for temporal smoothing
    this.recentPredictions = [];
    this.historySize = 3;
  }

  start(callback) {
    this.isRunning = true;
    this.onPageDetected = callback;
    this.audioBuffer = [];
    this.recentPredictions = [];
    this.pageMatcher.reset();
    
    console.log('[live-recognizer-v3] 🚀 Started - Hybrid system active');
    console.log('  Page-level weight:', this.weights.pageLevel);
    console.log('  Word recognition weight:', this.weights.wordRecognition);
    console.log('  Temporal weight:', this.weights.temporal);
  }

  stop() {
    this.isRunning = false;
    this.audioBuffer = [];
    this.recentPredictions = [];
    this.currentPage = null;
    
    console.log('[live-recognizer-v3] Stopped');
  }

  feedAudio(audioChunk) {
    if (!this.isRunning) return;
    
    if (!audioChunk || audioChunk.length === 0) {
      console.warn('[live-recognizer-v3] ⚠️  Empty audio chunk');
      return;
    }
    
    try {
      // Add to buffer
      // Fix: Avoid spread operator stack overflow with large chunks
      if (audioChunk.length > 10000) {
        // For large chunks, use concat instead of spread
        this.audioBuffer = this.audioBuffer.concat(Array.from(audioChunk));
      } else {
        // Small chunks can still use push
        this.audioBuffer.push(...audioChunk);
      }
      
      // Trim if too long
      if (this.audioBuffer.length > this.maxBufferSamples) {
        const excess = this.audioBuffer.length - this.maxBufferSamples;
        this.audioBuffer.splice(0, excess);
      }
      
      // Process when full
      if (this.audioBuffer.length >= this.maxBufferSamples) {
        this.processBuffer();
      } else {
        const pct = (this.audioBuffer.length / this.maxBufferSamples * 100).toFixed(0);
        if (this.audioBuffer.length % 22050 === 0) {
          console.log(`[live-recognizer-v3] Buffer: ${pct}%`);
        }
      }
    } catch (error) {
      console.error('[live-recognizer-v3] Error feeding audio:', error.message);
    }
  }

  processBuffer() {
    try {
      const audioArray = new Float32Array(this.audioBuffer);
      
      // STAGE 1: Page-level matching
      const features = this.audioExtractor.extractSignature(audioArray, this.sampleRate);
      if (!features || !features.mfcc) {
        console.error('[live-recognizer-v3] ⚠️  Invalid features');
        return;
      }
      
      const pageMatch = this.pageMatcher.matchAudio(features);
      const pageLevelScore = pageMatch.confidence;
      const pageLevelCandidates = pageMatch.topMatches.slice(0, 10); // Top 10
      
      // STAGE 2: Word recognition
      const recognizedWords = this.recognizeWords(audioArray);
      const wordMatches = this.matchWordsToPages(recognizedWords);
      
      // STAGE 3: Temporal context
      const temporalScores = this.applyTemporalContext(
        pageMatch.topMatches.slice(0, 20),
        this.currentPage
      );
      
      // STAGE 4: Fusion
      const fusedScores = this.fuseScores(
        pageMatch.topMatches.slice(0, 20),
        wordMatches,
        temporalScores
      );
      
      // Get best match
      const bestMatch = fusedScores[0];
      
      // Log results
      console.log('[live-recognizer-v3] 📊 Hybrid Analysis:');
      console.log(`  Page-level: Page ${pageMatch.page} (${(pageLevelScore * 100).toFixed(1)}%)`);
      console.log(`  Words found: ${recognizedWords.length} words`);
      if (recognizedWords.length > 0) {
        console.log(`    ${recognizedWords.slice(0, 3).map(w => w.word).join(', ')}`);
      }
      console.log(`  Word matches: ${wordMatches.length} page candidates`);
      console.log(`  Best fusion: Page ${bestMatch.page} (${(bestMatch.score * 100).toFixed(1)}%)`);
      console.log(`    Components: page=${(bestMatch.pageScore * 100).toFixed(0)}%, word=${(bestMatch.wordScore * 100).toFixed(0)}%, temporal=${(bestMatch.temporalScore * 100).toFixed(0)}%`);
      console.log(`  Top 5: ${fusedScores.slice(0, 5).map(m => `p${m.page}:${(m.score * 100).toFixed(0)}%`).join(', ')}`);
      
      // Add to history
      this.recentPredictions.push(bestMatch.page);
      if (this.recentPredictions.length > this.historySize) {
        this.recentPredictions.shift();
      }
      
      // Should we trigger?
      const now = Date.now();
      const enoughTimePassed = (now - this.lastTriggerTime) > this.minTimeBetweenTriggers;
      const pageChanged = bestMatch.page !== this.currentPage;
      const highConfidence = bestMatch.score > this.pageMatcher.sensitivity;
      
      if (highConfidence && enoughTimePassed && pageChanged) {
        this.currentPage = bestMatch.page;
        this.lastTriggerTime = now;
        
        console.log(`[live-recognizer-v3] 🎯 TRIGGERED! Advancing to page ${bestMatch.page}`);
        
        if (this.onPageDetected) {
          try {
            this.onPageDetected(bestMatch.page, bestMatch.score);
          } catch (err) {
            console.error('[live-recognizer-v3] Callback error:', err.message);
          }
        }
      } else if (!enoughTimePassed && pageChanged) {
        const wait = ((this.minTimeBetweenTriggers - (now - this.lastTriggerTime)) / 1000).toFixed(1);
        console.log(`[live-recognizer-v3] ⏱️  Page ${bestMatch.page} detected, waiting ${wait}s`);
      } else if (!highConfidence) {
        console.log(`[live-recognizer-v3] ⚠️  Low confidence (${(bestMatch.score * 100).toFixed(1)}%), not triggering`);
      }
      
    } catch (error) {
      console.error('[live-recognizer-v3] Error processing buffer:', error.message);
      console.error(error.stack);
    }
  }

  /**
   * Recognize Armenian words in audio buffer
   */
  recognizeWords(audioBuffer) {
    const words = [];
    const windowSize = 1.0; // 1 second windows
    const stepSize = 0.5; // 50% overlap
    const windowSamples = windowSize * this.sampleRate;
    const stepSamples = stepSize * this.sampleRate;
    
    for (let i = 0; i < audioBuffer.length - windowSamples; i += stepSamples) {
      const segment = audioBuffer.slice(i, i + windowSamples);
      const features = this.audioExtractor.extractSignature(segment, this.sampleRate);
      
      if (!features || !features.mfcc) continue;
      
      // Match against learned patterns
      const match = this.patternDb.findBestMatch(features);
      
      if (match && match.confidence > 0.3) { // Lower threshold for scanning
        words.push({
          word: match.word,
          confidence: match.confidence,
          position: i / this.sampleRate
        });
      }
    }
    
    return words;
  }

  /**
   * Match recognized words to pages
   */
  matchWordsToPages(recognizedWords) {
    const pageScores = {};
    
    recognizedWords.forEach(({word, confidence}) => {
      const pages = this.wordToPages[word] || [];
      
      pages.forEach(page => {
        if (!pageScores[page]) {
          pageScores[page] = { matches: 0, totalConfidence: 0 };
        }
        pageScores[page].matches++;
        pageScores[page].totalConfidence += confidence;
      });
    });
    
    return Object.entries(pageScores)
      .map(([page, {matches, totalConfidence}]) => ({
        page: parseInt(page),
        wordMatches: matches,
        avgConfidence: totalConfidence / matches,
        score: (matches * totalConfidence) / (matches + 1) // Normalize
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Apply temporal context to page candidates
   */
  applyTemporalContext(candidates, currentPage) {
    if (!currentPage) {
      // No context yet, all equally likely
      return candidates.map(c => ({ page: c.page, temporalScore: 1.0 }));
    }
    
    return candidates.map(candidate => {
      const distance = Math.abs(candidate.page - currentPage);
      
      let temporalScore;
      if (distance === 1) temporalScore = 1.0;        // Next/prev page: full score
      else if (distance <= 3) temporalScore = 0.9;    // Nearby: slight penalty
      else if (distance <= 10) temporalScore = 0.7;   // Medium: moderate penalty
      else temporalScore = 0.3;                       // Far: strong penalty
      
      return {
        page: candidate.page,
        temporalScore
      };
    });
  }

  /**
   * Fuse all scores with weights
   */
  fuseScores(pageCandidates, wordMatches, temporalScores) {
    const allPages = new Set([
      ...pageCandidates.map(p => p.page),
      ...wordMatches.map(w => w.page),
      ...temporalScores.map(t => t.page)
    ]);
    
    const fusedScores = [];
    
    allPages.forEach(page => {
      // Find scores from each system
      const pageMatch = pageCandidates.find(p => p.page === page);
      const wordMatch = wordMatches.find(w => w.page === page);
      const temporalMatch = temporalScores.find(t => t.page === page);
      
      const pageScore = pageMatch ? pageMatch.score : 0;
      const wordScore = wordMatch ? wordMatch.score : 0;
      const temporalScore = temporalMatch ? temporalMatch.temporalScore : 0.3;
      
      // Weighted fusion
      const finalScore = (
        pageScore * this.weights.pageLevel +
        wordScore * this.weights.wordRecognition +
        temporalScore * this.weights.temporal
      );
      
      fusedScores.push({
        page,
        score: finalScore,
        pageScore,
        wordScore,
        temporalScore
      });
    });
    
    return fusedScores.sort((a, b) => b.score - a.score);
  }

  setSensitivity(value) {
    this.pageMatcher.setSensitivity(value);
  }

  setCurrentPage(page) {
    this.currentPage = page;
    console.log(`[live-recognizer-v3] Current page set to ${page}`);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      bufferSize: this.audioBuffer.length,
      bufferDuration: (this.audioBuffer.length / this.sampleRate).toFixed(1),
      currentPage: this.currentPage,
      recentPredictions: this.recentPredictions,
      wordIndexSize: Object.keys(this.wordToPages).length,
      system: 'hybrid-v3',
      weights: this.weights
    };
  }
}
