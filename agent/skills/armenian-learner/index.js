/**
 * Armenian Learner Skill
 * Main entry point for Clawdbot
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AudioPhonemeExtractor } from './lib/audio-phoneme-extractor.js';
import { TextWordParser } from './lib/text-word-parser.js';
import { AlignmentEngine } from './lib/alignment-engine.js';
import { PatternDatabase } from './lib/pattern-database.js';
import { LiveRecognizer } from './lib/live-recognizer.js';
import { PageMatcher } from './lib/page-matcher.js';
import { LiveRecognizerV2 } from './lib/live-recognizer-v2.js';
import { LiveRecognizerV3Hybrid } from './lib/live-recognizer-v3-hybrid.js';
import { AudioDiagnostics } from './lib/audio-diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRAINING_DATA_DIR = process.env.TRAINING_DATA_DIR || '/app/training-data';
const AGENT_DIR = process.env.AGENT_DIR || '/app/agent';

// Singleton instances
let patternDb = null;
let audioExtractor = null;
let textParser = null;
let alignmentEngine = null;
let liveRecognizer = null;
let pageMatcher = null;
let liveRecognizerV2 = null;
let liveRecognizerV3 = null;
let audioDiagnostics = null;
let trainingState = null;
let useV3 = true; // Use hybrid system by default

/**
 * Initialize components
 */
function initialize() {
  if (patternDb) return; // Already initialized
  
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  patternDb = new PatternDatabase(dataDir);
  audioExtractor = new AudioPhonemeExtractor();
  textParser = new TextWordParser();
  alignmentEngine = new AlignmentEngine(audioExtractor, textParser, patternDb);
  liveRecognizer = new LiveRecognizer(audioExtractor, patternDb);
  
  // New page-level matching approach
  pageMatcher = new PageMatcher();
  liveRecognizerV2 = new LiveRecognizerV2(audioExtractor, pageMatcher);
  
  // V3 Hybrid system (page + word + temporal)
  liveRecognizerV3 = new LiveRecognizerV3Hybrid(audioExtractor, pageMatcher, patternDb);
  
  // Diagnostics
  audioDiagnostics = new AudioDiagnostics();
  
  if (useV3) {
    console.log('[armenian-learner] ✨ Initialized with V3 HYBRID system (page + word + temporal)');
  } else {
    console.log('[armenian-learner] Initialized (with V2 page matcher + diagnostics)');
  }
}

/**
 * Start training from audio + text
 */
async function startTraining(params) {
  initialize();
  
  const {
    audioFile = `${AGENT_DIR}/full_service.wav`,
    textDbFile = `${TRAINING_DATA_DIR}/text-matcher-db.json`,
    timestampsFile = `${TRAINING_DATA_DIR}/page-timestamps-mapped.json`,
    testMode = false
  } = params || {};
  
  console.log('[armenian-learner] Starting training...');
  console.log(`  Audio: ${audioFile}`);
  console.log(`  Text: ${textDbFile}`);
  console.log(`  Timestamps: ${timestampsFile}`);
  console.log(`  Test mode: ${testMode}`);
  
  trainingState = {
    status: 'training',
    startTime: Date.now(),
    progress: 0,
    wordsLearned: 0,
    patternsStored: 0,
    currentActivity: 'Loading data...'
  };
  
  try {
    // Load text database
    trainingState.currentActivity = 'Loading text database...';
    const pages = textParser.loadTextDatabase(textDbFile);
    const pageWords = textParser.processAllPages(testMode ? pages.slice(0, 10) : pages);
    const vocab = textParser.getVocabulary(pageWords);
    
    console.log(`[armenian-learner] Vocabulary: ${vocab.size} unique words`);
    
    // Load timestamps
    trainingState.currentActivity = 'Loading timestamps...';
    const timestamps = JSON.parse(fs.readFileSync(timestampsFile, 'utf8'));
    
    // For now, we'll use the existing fingerprints as audio signatures
    // In a full implementation, we'd load and process the actual audio file
    // That requires WAV parsing which is complex
    
    trainingState.currentActivity = 'Loading audio fingerprints...';
    const fingerprintsFile = `${TRAINING_DATA_DIR}/fingerprints-v2.json`;
    const fingerprints = JSON.parse(fs.readFileSync(fingerprintsFile, 'utf8'));
    
    console.log(`[armenian-learner] Loaded ${fingerprints.length} audio fingerprints`);
    
    // Convert fingerprints to our signature format
    trainingState.currentActivity = 'Converting audio signatures...';
    const audioSignatures = fingerprints.map(fp => ({
      page: fp.pageNumber,
      start: fp.startTime,
      end: fp.endTime,
      signature: {
        mfcc: fp.features.mfcc,
        spectralCentroid: fp.features.spectralCentroid,
        spectralRolloff: fp.features.spectralRolloff,
        rms: fp.features.rms,
        zcr: fp.features.zcr,
        duration: fp.duration,
        spectralFingerprint: fp.features.mfcc.slice(0, 12),
        phonemes: []
      }
    }));
    
    trainingState.progress = 0.3;
    
    // Align audio to text
    trainingState.currentActivity = 'Aligning audio to text...';
    const rawPatterns = await alignmentEngine.alignAudioToText(audioSignatures, pageWords);
    
    trainingState.progress = 0.6;
    
    // Improve alignment with repetition
    trainingState.currentActivity = 'Improving patterns with repetition...';
    const improvedPatterns = alignmentEngine.improveWithRepetition(rawPatterns);
    
    trainingState.progress = 0.8;
    
    // Add patterns to database
    trainingState.currentActivity = 'Storing patterns in database...';
    improvedPatterns.forEach(pattern => {
      patternDb.addPattern(pattern);
    });
    
    // Save database
    patternDb.save();
    
    trainingState.progress = 1.0;
    trainingState.status = 'complete';
    trainingState.currentActivity = 'Training complete!';
    trainingState.wordsLearned = vocab.size;
    trainingState.patternsStored = patternDb.patterns.length;
    
    const duration = ((Date.now() - trainingState.startTime) / 1000 / 60).toFixed(1);
    
    console.log('[armenian-learner] Training complete!');
    console.log(`  Duration: ${duration} minutes`);
    console.log(`  Words learned: ${trainingState.wordsLearned}`);
    console.log(`  Patterns stored: ${trainingState.patternsStored}`);
    
    return {
      success: true,
      duration,
      wordsLearned: trainingState.wordsLearned,
      patternsStored: trainingState.patternsStored
    };
    
  } catch (error) {
    console.error('[armenian-learner] Training error:', error);
    trainingState.status = 'error';
    trainingState.currentActivity = `Error: ${error.message}`;
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get current training/recognition status
 */
function getStatus() {
  initialize();
  
  const dbStats = patternDb.getStats();
  
  if (trainingState) {
    return {
      mode: trainingState.status,
      ...trainingState,
      ...patternDb.getStats()
    };
  }
  
  if (liveRecognizerV3 && liveRecognizerV3.isRunning) {
    const diagnostics = audioDiagnostics ? audioDiagnostics.getReport() : {};
    return {
      mode: "recognizing",
      ...liveRecognizerV3.getStatus(),
      ...patternDb.getStats(),
      ...diagnostics,
      version: "v3-hybrid"
    };
  }

  if (liveRecognizerV2 && liveRecognizerV2.isRunning) {
    const diagnostics = audioDiagnostics ? audioDiagnostics.getReport() : {};
    return {
      mode: 'recognizing',
      ...liveRecognizerV2.getStatus(),
      ...patternDb.getStats(),
      ...diagnostics,
      version: 'v2-page-matcher'
    };
  }
  
  if (liveRecognizer && liveRecognizer.isRunning) {
    const diagnostics = audioDiagnostics ? audioDiagnostics.getReport() : {};
    return {
      mode: 'recognizing',
      ...liveRecognizer.getStatus(),
      ...patternDb.getStats(),
      ...diagnostics,
      version: 'v1-pattern-matcher'
    };
  }
  
  return {
    mode: 'idle',
    ...patternDb.getStats(),
    ready: dbStats.totalPatterns > 0
  };
}

/**
 * Start live recognition
 */
function startRecognition(params) {
  initialize();
  
  const { onPageDetected, startPage } = params || {};
  
  // Use V3 hybrid system by default (page + word + temporal)
  const recognizer = useV3 ? liveRecognizerV3 : liveRecognizerV2;
  
  recognizer.start((page, confidence) => {
    console.log(`[armenian-learner] 🎯 Page detected: ${page} (${(confidence * 100).toFixed(1)}%)`);
    
    if (onPageDetected) {
      onPageDetected(page, confidence);
    }
  });
  
  // If user tells us what page they're on, set it as context
  if (startPage) {
    recognizer.setCurrentPage(startPage);
  }
  
  return {
    success: true,
    message: useV3 ? 'Recognition started (V3 Hybrid: page + word + temporal)' : 'Recognition started (V2 page matcher)',
    system: useV3 ? 'v3-hybrid' : 'v2-page-only'
  };
}

/**
 * Stop recognition
 */
function stopRecognition() {
  if (liveRecognizer) {
    liveRecognizer.stop();
  }
  if (liveRecognizerV2) {
    liveRecognizerV2.stop();
  }
  if (liveRecognizerV3) {
    liveRecognizerV3.stop();
  }
  
  return {
    success: true,
    message: 'Recognition stopped'
  };
}

/**
 * Feed audio to recognizer
 */
function feedAudio(audioChunk) {
  initialize();
  
  // Record for diagnostics
  if (audioDiagnostics) {
    audioDiagnostics.recordChunk(audioChunk);
  }
  
  // Use V3 hybrid if available, fallback to V2
  if (liveRecognizerV3 && liveRecognizerV3.isRunning) {
    liveRecognizerV3.feedAudio(audioChunk);
  if (liveRecognizerV3 && liveRecognizerV3.isRunning) {
    const diagnostics = audioDiagnostics ? audioDiagnostics.getReport() : {};
    return {
      mode: "recognizing",
      ...liveRecognizerV3.getStatus(),
      ...patternDb.getStats(),
      ...diagnostics,
      version: "v3-hybrid"
    };
  }

  } else if (liveRecognizerV2 && liveRecognizerV2.isRunning) {
    liveRecognizerV2.feedAudio(audioChunk);
  } else if (liveRecognizer && liveRecognizer.isRunning) {
    liveRecognizer.feedAudio(audioChunk);
  } else {
    console.warn('[armenian-learner] ⚠️  feedAudio called but no recognizer is running!');
  }
}

/**
 * Set recognition sensitivity
 */
function setSensitivity(value) {
  initialize();
  if (liveRecognizerV3) {
    liveRecognizerV3.setSensitivity(value);
  }
  if (liveRecognizerV2) {
    liveRecognizerV2.setSensitivity(value);
  }
  if (liveRecognizer) {
    liveRecognizer.setSensitivity(value);
  }
  return {
    success: true,
    sensitivity: value
  };
}

/**
 * Set current page manually (for training context)
 */
function setCurrentPage(page) {
  initialize();
  if (liveRecognizerV3) {
    liveRecognizerV3.setCurrentPage(page);
  }
  if (liveRecognizerV2) {
    liveRecognizerV2.setCurrentPage(page);
  }
  return {
    success: true,
    currentPage: page,
    message: `Current page set to ${page}`
  };
}

/**
 * Get audio diagnostics
 */
function getDiagnostics() {
  initialize();
  if (!audioDiagnostics) {
    return {
      error: 'Diagnostics not initialized'
    };
  }
  
  return audioDiagnostics.getReport();
}

/**
 * Learn from correction
 */
function learnFromCorrection(params) {
  const { detectedPage, actualPage, audioContext } = params || {};
  
  if (liveRecognizer) {
    liveRecognizer.learnFromCorrection(detectedPage, actualPage, audioContext);
  }
  
  return {
    success: true,
    message: 'Learning from correction'
  };
}

// Export Clawdbot skill
export default {
  name: 'armenian-learner',
  description: 'Learn to read and listen to old Western Armenian liturgical language',
  
  // Expose functions for API use
  feedAudio,
  setSensitivity,
  setCurrentPage,
  getDiagnostics,
  
  tools: {
    start_armenian_training: {
      description: 'Start learning from audio and text data',
      parameters: {
        type: 'object',
        properties: {
          audioFile: { type: 'string', description: 'Path to audio file' },
          textDbFile: { type: 'string', description: 'Path to text database JSON' },
          timestampsFile: { type: 'string', description: 'Path to timestamps JSON' },
          testMode: { type: 'boolean', description: 'Test with first 10 pages only' }
        }
      },
      execute: async (params) => {
        return await startTraining(params);
      }
    },
    
    get_armenian_status: {
      description: 'Get current learning/recognition status',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        return getStatus();
      }
    },
    
    start_armenian_recognition: {
      description: 'Start live audio recognition',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (params) => {
        return startRecognition(params);
      }
    },
    
    stop_armenian: {
      description: 'Stop training or recognition',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        return stopRecognition();
      }
    },
    
    correct_armenian_prediction: {
      description: 'Teach the system from a correction',
      parameters: {
        type: 'object',
        properties: {
          detectedPage: { type: 'number' },
          actualPage: { type: 'number' }
        },
        required: ['detectedPage', 'actualPage']
      },
      execute: async (params) => {
        return learnFromCorrection(params);
      }
    },
    
    set_current_page: {
      description: 'Set the current page manually (for training context)',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Current page number' }
        },
        required: ['page']
      },
      execute: async (params) => {
        return setCurrentPage(params.page);
      }
    },
    
    get_audio_diagnostics: {
      description: 'Get audio stream diagnostics (to check if audio is being received)',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        return getDiagnostics();
      }
    }
  }
};

// Export functions for direct API access
export {
  feedAudio,
  startRecognition,
  stopRecognition,
  getStatus,
  setCurrentPage,
  getDiagnostics
};
