/**
 * Liturgy Audio Controller Skill - Enhanced Version
 *
 * Real-time audio processing for automatic liturgy page turning.
 * Listens to church audio, transcribes, matches to liturgy text, and controls pages.
 * 
 * New Features:
 * - Audio quality validation
 * - Enhanced confidence scoring with sequential logic
 * - Impossible jump detection
 */

const mic = require('mic');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const Fuse = require('fuse.js');
const ffmpeg = require('fluent-ffmpeg');

class LiturgyAudioController {
  constructor(config = {}) {
    this.config = {
      apiEndpoint: config.apiEndpoint || 'http://localhost:5000',
      confidenceThreshold: config.confidenceThreshold || 0.85,
      language: config.language || 'armenian',
      sampleRate: config.sampleRate || 16000,
      bufferDuration: config.bufferDuration || 3000,
      trainingMode: config.trainingMode || false,
      sequentialBoost: config.sequentialBoost !== undefined ? config.sequentialBoost : 0.10,
      maxPageJump: config.maxPageJump || 5,
      ...config,
    };

    this.bytesPerSample = 2; // 16-bit PCM
    this.channels = config.channels || 1;
    this.audioBuffer = Buffer.alloc(0);
    this.isProcessing = false;
    this.updateTargetBytes();

    this.currentPage = null;
    this.trainingData = [];
    this.lastObservation = null;
    this.liturgyDatabase = null;
    this.fuzzyMatcher = null;
    this.dbPath = null;

    this.loadLiturgyDatabase();
  }

  updateTargetBytes() {
    const bytesPerSecond = this.config.sampleRate * this.channels * this.bytesPerSample;
    this.targetBytes = Math.max(1, Math.round(bytesPerSecond * (this.config.bufferDuration / 1000)));
  }

  /**
   * Load liturgy text database with page mappings
   */
  loadLiturgyDatabase() {
    const dbPath = path.join(__dirname, 'data', 'liturgy-database.json');
    this.dbPath = dbPath;

    try {
      this.liturgyDatabase = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

      // Initialize fuzzy search with Armenian liturgy phrases
      this.fuzzyMatcher = new Fuse(this.liturgyDatabase.entries, {
        keys: ['text', 'armenian', 'transliteration'],
        threshold: 0.3,
        includeScore: true,
      });

      console.log(
        `[liturgy-audio] Loaded ${this.liturgyDatabase.entries.length} liturgy entries`,
      );
    } catch (error) {
      console.error('[liturgy-audio] Failed to load liturgy database:', error.message);

      // Create empty database
      this.liturgyDatabase = { entries: [] };
      this.fuzzyMatcher = new Fuse([], { keys: ['text'] });
    }
  }

  /**
   * Validate audio file quality
   * NEW FEATURE: Audio Quality Validator
   */
  async validateAudioQuality(audioFilePath) {
    return new Promise((resolve) => {
      if (!fs.existsSync(audioFilePath)) {
        resolve({
          success: false,
          error: 'Audio file not found',
          quality: 'UNUSABLE',
          recommendation: 'File does not exist'
        });
        return;
      }

      const results = {
        success: true,
        quality: 'EXCELLENT',
        issues: [],
        recommendation: 'Proceed with training',
        filePath: audioFilePath,
        fileSize: fs.statSync(audioFilePath).size,
      };

      ffmpeg.ffprobe(audioFilePath, (err, metadata) => {
        if (err) {
          results.success = false;
          results.error = err.message;
          results.quality = 'UNUSABLE';
          results.recommendation = 'Cannot analyze audio file';
          resolve(results);
          return;
        }

        try {
          const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
          if (!audioStream) {
            results.success = false;
            results.quality = 'UNUSABLE';
            results.error = 'No audio stream found';
            results.recommendation = 'File contains no audio';
            resolve(results);
            return;
          }

          // Extract audio properties
          results.sampleRate = parseInt(audioStream.sample_rate) || 0;
          results.channels = audioStream.channels || 0;
          results.bitDepth = audioStream.bits_per_sample || audioStream.bits_per_raw_sample || 16;
          results.duration = parseFloat(metadata.format.duration) || 0;
          results.durationMinutes = (results.duration / 60).toFixed(2);
          results.bitrate = parseInt(metadata.format.bit_rate) || 0;
          results.codec = audioStream.codec_name || 'unknown';

          // Quality checks
          const checks = [];

          // Check 1: Sample rate
          if (results.sampleRate < 16000) {
            checks.push({
              check: 'Sample Rate',
              status: 'POOR',
              value: results.sampleRate,
              message: 'Sample rate too low (< 16kHz), may affect transcription accuracy'
            });
            results.issues.push(`Low sample rate: ${results.sampleRate} Hz`);
          } else if (results.sampleRate >= 44100) {
            checks.push({
              check: 'Sample Rate',
              status: 'EXCELLENT',
              value: results.sampleRate,
              message: 'High quality sample rate'
            });
          } else {
            checks.push({
              check: 'Sample Rate',
              status: 'GOOD',
              value: results.sampleRate,
              message: 'Adequate sample rate for speech'
            });
          }

          // Check 2: Duration
          const durationMin = results.duration / 60;
          if (durationMin < 30) {
            checks.push({
              check: 'Duration',
              status: 'WARNING',
              value: durationMin.toFixed(2) + ' min',
              message: 'Recording seems short for a full liturgy (< 30 min)'
            });
            results.issues.push(`Short duration: ${durationMin.toFixed(1)} minutes`);
          } else if (durationMin > 120) {
            checks.push({
              check: 'Duration',
              status: 'WARNING',
              value: durationMin.toFixed(2) + ' min',
              message: 'Recording seems long for typical liturgy (> 2 hours)'
            });
            results.issues.push(`Unusually long: ${durationMin.toFixed(1)} minutes`);
          } else {
            checks.push({
              check: 'Duration',
              status: 'GOOD',
              value: durationMin.toFixed(2) + ' min',
              message: 'Duration within expected range (30-120 min)'
            });
          }

          // Check 3: Channels
          if (results.channels === 1) {
            checks.push({
              check: 'Channels',
              status: 'GOOD',
              value: 'Mono',
              message: 'Mono is ideal for speech recognition'
            });
          } else if (results.channels === 2) {
            checks.push({
              check: 'Channels',
              status: 'GOOD',
              value: 'Stereo',
              message: 'Stereo is acceptable, will be converted to mono if needed'
            });
          } else {
            checks.push({
              check: 'Channels',
              status: 'WARNING',
              value: results.channels,
              message: 'Unusual channel configuration'
            });
          }

          // Check 4: Bitrate
          const bitrateKbps = results.bitrate / 1000;
          if (bitrateKbps < 64) {
            checks.push({
              check: 'Bitrate',
              status: 'POOR',
              value: bitrateKbps.toFixed(0) + ' kbps',
              message: 'Very low bitrate, quality may suffer'
            });
            results.issues.push(`Low bitrate: ${bitrateKbps.toFixed(0)} kbps`);
          } else if (bitrateKbps >= 128) {
            checks.push({
              check: 'Bitrate',
              status: 'EXCELLENT',
              value: bitrateKbps.toFixed(0) + ' kbps',
              message: 'High quality bitrate'
            });
          } else {
            checks.push({
              check: 'Bitrate',
              status: 'GOOD',
              value: bitrateKbps.toFixed(0) + ' kbps',
              message: 'Adequate bitrate for speech'
            });
          }

          results.checks = checks;

          // Determine overall quality
          const poorChecks = checks.filter(c => c.status === 'POOR').length;
          const warningChecks = checks.filter(c => c.status === 'WARNING').length;

          if (poorChecks > 0 || results.issues.length > 2) {
            results.quality = 'POOR';
            results.recommendation = 'Consider re-recording with better quality settings';
          } else if (warningChecks > 1) {
            results.quality = 'GOOD';
            results.recommendation = 'Acceptable for training, but could be improved';
          } else {
            results.quality = 'EXCELLENT';
            results.recommendation = 'Proceed with training';
          }

          // File size check
          const fileSizeMB = results.fileSize / (1024 * 1024);
          results.fileSizeMB = fileSizeMB.toFixed(2);
          
          if (fileSizeMB < 10 && durationMin > 30) {
            results.issues.push('File size seems small for duration - possibly heavily compressed');
            results.quality = Math.min(results.quality, 'GOOD');
          }

          resolve(results);
        } catch (parseError) {
          results.success = false;
          results.error = parseError.message;
          results.quality = 'UNUSABLE';
          results.recommendation = 'Error parsing audio metadata';
          resolve(results);
        }
      });
    });
  }

  /**
   * Start listening to microphone
   */
  async startListening(openai) {
    if (this.isListening) {
      return { success: false, message: 'Already listening' };
    }

    this.isListening = true;
    this.openai = openai;
    this.audioBuffer = Buffer.alloc(0);
    this.isProcessing = false;
    this.lastObservation = null;
    this.updateTargetBytes();

    const micInstance = mic({
      rate: this.config.sampleRate,
      channels: this.channels,
      bitwidth: this.bytesPerSample * 8,
      encoding: 'signed-integer',
      endian: 'little',
      fileType: 'raw',
      debug: false,
      exitOnSilence: 0,
    });

    const micInputStream = micInstance.getAudioStream();

    micInputStream.on('data', (data) => {
      this.audioBuffer = Buffer.concat([this.audioBuffer, data]);
      this.processPendingBuffer();
    });

    micInputStream.on('error', (error) => {
      console.error('[liturgy-audio] Microphone error:', error);
      this.stopListening();
    });

    micInstance.start();
    this.micInstance = micInstance;

    console.log('[liturgy-audio] Started listening...');

    return {
      success: true,
      message: 'Listening for liturgy audio',
      config: this.config,
    };
  }

  processPendingBuffer() {
    if (this.isProcessing || this.audioBuffer.length < this.targetBytes) {
      return;
    }

    this.isProcessing = true;

    (async () => {
      try {
        while (this.audioBuffer.length >= this.targetBytes && this.isListening) {
          const chunk = this.audioBuffer.slice(0, this.targetBytes);
          this.audioBuffer = this.audioBuffer.slice(this.targetBytes);
          await this.processAudioChunk(chunk);
        }
      } catch (error) {
        console.error('[liturgy-audio] Error processing audio:', error.message);
      } finally {
        this.isProcessing = false;
        if (this.audioBuffer.length >= this.targetBytes && this.isListening) {
          this.processPendingBuffer();
        }
      }
    })();
  }

  /**
   * Stop listening to microphone
   */
  stopListening() {
    if (!this.isListening) {
      return { success: false, message: 'Not currently listening' };
    }

    if (this.micInstance) {
      this.micInstance.stop();
      this.micInstance = null;
    }

    this.isListening = false;
    this.audioBuffer = Buffer.alloc(0);
    this.isProcessing = false;

    console.log('[liturgy-audio] Stopped listening');

    return { success: true, message: 'Stopped listening' };
  }

  /**
   * Process a single PCM chunk
   * ENHANCED with confidence scoring
   */
  async processAudioChunk(rawAudio) {
    if (!rawAudio || rawAudio.length === 0) {
      return;
    }

    try {
      const transcription = await this.transcribeAudio(rawAudio);

      if (!transcription || transcription.trim().length === 0) {
        return; // No speech detected
      }

      console.log('[liturgy-audio] Transcribed:', transcription);

      // Match transcription to liturgy database
      const fuzzyMatch = this.matchLiturgyText(transcription);

      if (!fuzzyMatch) {
        console.log('[liturgy-audio] No match found');
        return;
      }

      // ENHANCED: Evaluate confidence with sequential logic
      const enhancedMatch = this.evaluateConfidence(
        fuzzyMatch.page,
        fuzzyMatch.confidence,
        transcription
      );

      console.log(
        `[liturgy-audio] Page ${enhancedMatch.page}: ${enhancedMatch.confidence.toFixed(2)} confidence - ${enhancedMatch.reason}`
      );

      if (enhancedMatch.confidence >= this.config.confidenceThreshold) {
        console.log(`[liturgy-audio] Turning to page ${enhancedMatch.page}`);
        await this.setPage(enhancedMatch.page, transcription, enhancedMatch.confidence);
      } else {
        console.log(`[liturgy-audio] Confidence too low: ${enhancedMatch.confidence.toFixed(2)}`);
      }

      this.lastObservation = {
        transcription,
        rawAudio,
        timestamp: Date.now(),
        match: enhancedMatch,
      };

      if (this.config.trainingMode) {
        this.trainingData.push({
          audio: rawAudio.toString('base64'),
          transcription,
          timestamp: Date.now(),
          match: enhancedMatch,
        });
      }
    } catch (error) {
      console.error('[liturgy-audio] Error processing audio chunk:', error.message);
    }
  }

  /**
   * NEW FEATURE: Enhanced confidence evaluation with sequential logic
   */
  evaluateConfidence(detectedPage, fuzzyScore, transcription) {
    let confidence = fuzzyScore;
    let reason = `Base match: ${fuzzyScore.toFixed(2)}`;
    const adjustments = [];

    // Sequential boost
    if (this.currentPage !== null) {
      const pageGap = detectedPage - this.currentPage;

      if (pageGap === 1) {
        // Next page - strong boost
        const boost = this.config.sequentialBoost;
        confidence = Math.min(1.0, confidence + boost);
        adjustments.push(`+${(boost * 100).toFixed(0)}% sequential (next page)`);
      } else if (pageGap === 2) {
        // Page after next - small boost
        const boost = this.config.sequentialBoost * 0.5;
        confidence = Math.min(1.0, confidence + boost);
        adjustments.push(`+${(boost * 100).toFixed(0)}% sequential (page +2)`);
      } else if (pageGap < 0) {
        // Backwards - major penalty
        confidence = confidence * 0.1;
        adjustments.push('-90% (backwards jump)');
      } else if (pageGap > this.config.maxPageJump) {
        // Impossible jump - major penalty
        confidence = confidence * 0.3;
        adjustments.push(`-70% (jump too large: ${pageGap} pages)`);
      } else if (pageGap > 2) {
        // Large but possible jump - moderate penalty
        const penalty = 1 - (pageGap * 0.1);
        confidence = confidence * Math.max(0.3, penalty);
        adjustments.push(`-${((1 - penalty) * 100).toFixed(0)}% (gap: ${pageGap})`);
      }
    }

    // Build reason string
    if (adjustments.length > 0) {
      reason = `${fuzzyScore.toFixed(2)} base ${adjustments.join(', ')} = ${confidence.toFixed(2)} final`;
    }

    return {
      page: detectedPage,
      confidence: Math.max(0, Math.min(1, confidence)),
      reason,
      baseScore: fuzzyScore,
      currentPage: this.currentPage,
      transcription
    };
  }

  /**
   * Transcribe audio using OpenAI Whisper
   */
  async transcribeAudio(rawAudio) {
    if (!this.openai || !this.openai.audio || !this.openai.audio.transcriptions) {
      console.error('[liturgy-audio] OpenAI client not available for transcription');
      return null;
    }

    const tempFile = path.join(os.tmpdir(), `liturgy-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);

    try {
      const wavBuffer = this.encodeWavBuffer(rawAudio);
      fs.writeFileSync(tempFile, wavBuffer);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: 'whisper-1',
        language: this.config.language === 'armenian' ? 'hy' : 'en',
        response_format: 'text',
      });

      return transcription;
    } catch (error) {
      console.error('[liturgy-audio] Transcription error:', error.message);
      return null;
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlink(tempFile, () => {});
      }
    }
  }

  encodeWavBuffer(rawAudio) {
    const header = Buffer.alloc(44);
    const dataLength = rawAudio.length;
    const byteRate = this.config.sampleRate * this.channels * this.bytesPerSample;
    const blockAlign = this.channels * this.bytesPerSample;

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // PCM chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(this.channels, 22);
    header.writeUInt32LE(this.config.sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(this.bytesPerSample * 8, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);

    return Buffer.concat([header, rawAudio]);
  }

  /**
   * Match transcribed text to liturgy database
   */
  matchLiturgyText(text) {
    if (!this.fuzzyMatcher || !text) return null;

    const results = this.fuzzyMatcher.search(text);
    if (results.length === 0) return null;

    const bestMatch = results[0];

    return {
      page: bestMatch.item.page,
      matchedText: bestMatch.item.text,
      confidence: 1 - bestMatch.score, // Convert Fuse.js score to confidence
      section: bestMatch.item.section,
    };
  }

  /**
   * Send page turn command to Liturgy Turner API
   */
  async setPage(page, reason, confidence) {
    try {
      const response = await axios.post(
        `${this.config.apiEndpoint}/api/control/page/set`,
        {
          page: page,
          reason: reason,
          confidence: confidence,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        },
      );

      if (response.data.success) {
        this.currentPage = page;
        console.log(`[liturgy-audio] Successfully set page to ${page}`);
        return { success: true, page };
      }

      return { success: false, error: 'API returned unsuccessful' };
    } catch (error) {
      console.error('[liturgy-audio] Failed to set page:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Manually set page (for training/correction)
   */
  async manualSetPage(page) {
    const result = await this.setPage(page, 'manual override', 1.0);

    if (this.config.trainingMode && this.lastObservation && this.lastObservation.transcription) {
      this.learnFromFeedback(page, this.lastObservation);
    }

    return result;
  }

  learnFromFeedback(page, observation) {
    if (!this.liturgyDatabase || !Array.isArray(this.liturgyDatabase.entries)) {
      return;
    }

    const phrase = observation.transcription.trim();
    if (!phrase) return;

    const lowerPhrase = phrase.toLowerCase();
    const existing = this.liturgyDatabase.entries.find(
      (entry) => entry.page === page && entry.text && entry.text.toLowerCase() === lowerPhrase,
    );

    if (existing) {
      existing.keywords = this.mergeKeywords(existing.keywords || [], phrase);
      existing.updatedAt = new Date().toISOString();
      this.persistLiturgyDatabase();
      console.log(`[liturgy-audio] Reinforced existing phrase for page ${page}`);
      return;
    }

    const keywords = this.extractKeywords(phrase);
    const newEntry = {
      page,
      section: existingSectionForPage(this.liturgyDatabase.entries, page) || 'Training',
      armenian: phrase,
      transliteration: phrase,
      text: phrase,
      keywords,
      source: 'training',
      createdAt: new Date().toISOString(),
    };

    this.liturgyDatabase.entries.push(newEntry);
    this.sortDatabase();
    this.persistLiturgyDatabase();
    this.fuzzyMatcher.setCollection(this.liturgyDatabase.entries);
    console.log(`[liturgy-audio] Learned new phrase for page ${page}`);
  }

  extractKeywords(phrase) {
    return Array.from(
      new Set(
        phrase
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
          .split(/\s+/)
          .filter((token) => token.length > 2),
      ),
    ).slice(0, 12);
  }

  mergeKeywords(existingKeywords, phrase) {
    const keywords = new Set(existingKeywords || []);
    this.extractKeywords(phrase).forEach((word) => keywords.add(word));
    return Array.from(keywords).slice(0, 12);
  }

  sortDatabase() {
    this.liturgyDatabase.entries.sort((a, b) => {
      if (a.page !== b.page) {
        return a.page - b.page;
      }
      return (a.section || '').localeCompare(b.section || '');
    });
  }

  persistLiturgyDatabase() {
    if (!this.dbPath) return;

    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.liturgyDatabase, null, 2));
    } catch (error) {
      console.error('[liturgy-audio] Failed to persist liturgy database:', error.message);
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      listening: this.isListening,
      currentPage: this.currentPage,
      config: this.config,
      bufferSizeBytes: this.audioBuffer.length,
      databaseEntries: this.liturgyDatabase?.entries.length || 0,
      trainingDataCount: this.trainingData.length,
    };
  }

  /**
   * Save training data
   */
  saveTrainingData() {
    if (this.trainingData.length === 0) {
      return { success: true, count: 0, file: null, message: 'No training samples collected' };
    }

    const trainingFile = path.join(
      __dirname,
      'data',
      `training-${Date.now()}.json`,
    );

    fs.writeFileSync(trainingFile, JSON.stringify(this.trainingData, null, 2));
    console.log(
      `[liturgy-audio] Saved ${this.trainingData.length} training samples to ${trainingFile}`,
    );

    const count = this.trainingData.length;
    this.trainingData = [];

    return { success: true, count, file: trainingFile };
  }
}

function existingSectionForPage(entries, page) {
  const found = entries.find((entry) => entry.page === page);
  return found ? found.section : null;
}

// Export skill definition for Clawdbot
module.exports = {
  name: 'liturgy-audio-controller',
  description: 'Real-time audio processing for automatic liturgy page turning with audio quality validation',
  tools: [
    {
      name: 'validate_audio_quality',
      description: 'Validate audio file quality before training (checks sample rate, duration, bitrate, etc.)',
      parameters: {
        type: 'object',
        properties: {
          audioFile: {
            type: 'string',
            description: 'Path to audio file to validate (relative or absolute)',
          },
        },
        required: ['audioFile'],
      },
      handler: async (args, context) => {
        if (!context.liturgyController) {
          context.liturgyController = new LiturgyAudioController(context.skillConfig);
        }
        return await context.liturgyController.validateAudioQuality(args.audioFile);
      },
    },
    {
      name: 'start_liturgy_listening',
      description: 'Start listening to microphone for liturgy audio',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (args, context) => {
        if (!context.liturgyController) {
          context.liturgyController = new LiturgyAudioController(context.skillConfig);
        }
        return await context.liturgyController.startListening(context.openai);
      },
    },
    {
      name: 'stop_liturgy_listening',
      description: 'Stop listening to microphone',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (args, context) => {
        if (!context.liturgyController) {
          return { success: false, message: 'Not initialized' };
        }
        return context.liturgyController.stopListening();
      },
    },
    {
      name: 'set_liturgy_page',
      description: 'Manually set the current liturgy page',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Page number to set' },
        },
        required: ['page'],
      },
      handler: async (args, context) => {
        if (!context.liturgyController) {
          context.liturgyController = new LiturgyAudioController(context.skillConfig);
        }
        return await context.liturgyController.manualSetPage(args.page);
      },
    },
    {
      name: 'get_liturgy_status',
      description: 'Get current status of liturgy audio controller',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (args, context) => {
        if (!context.liturgyController) {
          return { listening: false, message: 'Not initialized' };
        }
        return context.liturgyController.getStatus();
      },
    },
    {
      name: 'save_liturgy_training',
      description: 'Save collected training data for later analysis',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async (args, context) => {
        if (!context.liturgyController) {
          return { success: false, message: 'Not initialized' };
        }
        return context.liturgyController.saveTrainingData();
      },
    },
  ],
};
