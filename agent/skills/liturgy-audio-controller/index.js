/**
 * Liturgy Audio Controller Skill
 *
 * Real-time audio processing for automatic liturgy page turning.
 * Listens to church audio, transcribes, matches to liturgy text, and controls pages.
 */

const mic = require('mic');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const Fuse = require('fuse.js');

class LiturgyAudioController {
  constructor(config = {}) {
    this.config = {
      apiEndpoint: config.apiEndpoint || 'http://localhost:5000',
      confidenceThreshold: config.confidenceThreshold || 0.85,
      language: config.language || 'armenian',
      sampleRate: config.sampleRate || 16000,
      bufferDuration: config.bufferDuration || 3000,
      trainingMode: config.trainingMode || false,
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
      const match = this.matchLiturgyText(transcription);

      if (match && match.confidence >= this.config.confidenceThreshold) {
        console.log(
          `[liturgy-audio] Matched to page ${match.page} (confidence: ${match.confidence})`,
        );

        // Send page turn command
        await this.setPage(match.page, transcription, match.confidence);
      } else if (match) {
        console.log(
          `[liturgy-audio] Low confidence match: page ${match.page} (${match.confidence})`,
        );
      }

      this.lastObservation = {
        transcription,
        rawAudio,
        timestamp: Date.now(),
        match: match || null,
      };

      if (this.config.trainingMode) {
        this.trainingData.push({
          audio: rawAudio.toString('base64'),
          transcription,
          timestamp: Date.now(),
          match: match || null,
        });
      }
    } catch (error) {
      console.error('[liturgy-audio] Error processing audio chunk:', error.message);
    }
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
  description: 'Real-time audio processing for automatic liturgy page turning',
  tools: [
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
