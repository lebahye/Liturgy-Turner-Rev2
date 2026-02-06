/**
 * Liturgy Audio Controller Skill
 *
 * Real-time audio processing for automatic liturgy page turning.
 * Listens to church audio, transcribes, matches to liturgy text, and controls pages.
 */

const mic = require('mic');
const fs = require('fs');
const path = require('path');
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

    this.isListening = false;
    this.currentPage = null;
    this.audioBuffer = [];
    this.trainingData = [];
    this.liturgyDatabase = null;
    this.fuzzyMatcher = null;

    this.loadLiturgyDatabase();
  }

  /**
   * Load liturgy text database with page mappings
   */
  loadLiturgyDatabase() {
    const dbPath = path.join(__dirname, 'data', 'liturgy-database.json');

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

    // Configure microphone
    const micInstance = mic({
      rate: this.config.sampleRate,
      channels: 1,
      debug: false,
      exitOnSilence: 0,
    });

    const micInputStream = micInstance.getAudioStream();

    micInputStream.on('data', async (data) => {
      this.audioBuffer.push(data);

      // Process buffer when it reaches configured duration
      const bufferSize = (this.config.sampleRate * this.config.bufferDuration) / 1000;
      if (this.audioBuffer.length >= bufferSize) {
        await this.processAudioBuffer();
      }
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
    this.audioBuffer = [];

    console.log('[liturgy-audio] Stopped listening');

    return { success: true, message: 'Stopped listening' };
  }

  /**
   * Process accumulated audio buffer
   */
  async processAudioBuffer() {
    if (this.audioBuffer.length === 0) return;

    try {
      // Combine audio chunks into single buffer
      const audioData = Buffer.concat(this.audioBuffer);
      this.audioBuffer = [];

      // Transcribe audio using Whisper
      const transcription = await this.transcribeAudio(audioData);

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

      // Store for training if in training mode
      if (this.config.trainingMode) {
        this.trainingData.push({
          audio: audioData,
          transcription,
          timestamp: Date.now(),
          match: match,
        });
      }
    } catch (error) {
      console.error('[liturgy-audio] Error processing audio:', error.message);
    }
  }

  /**
   * Transcribe audio using OpenAI Whisper
   */
  async transcribeAudio(audioData) {
    try {
      // Save audio to temp file (Whisper API requires file input)
      const tempFile = path.join('/tmp', `liturgy-${Date.now()}.wav`);
      fs.writeFileSync(tempFile, audioData);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: 'whisper-1',
        language: this.config.language === 'armenian' ? 'hy' : 'en',
        response_format: 'text',
      });

      // Clean up temp file
      fs.unlinkSync(tempFile);

      return transcription;
    } catch (error) {
      console.error('[liturgy-audio] Transcription error:', error.message);
      return null;
    }
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
    return this.setPage(page, 'manual override', 1.0);
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      listening: this.isListening,
      currentPage: this.currentPage,
      config: this.config,
      databaseEntries: this.liturgyDatabase?.entries.length || 0,
      trainingDataCount: this.trainingData.length,
    };
  }

  /**
   * Save training data
   */
  saveTrainingData() {
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
