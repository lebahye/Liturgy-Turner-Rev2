/**
 * Compare Three Audio Recordings Against Same PDF Text
 * Learn word variance across recordings - Child → Adult reading
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { AudioPhonemeExtractor } from './skills/armenian-learner/lib/audio-phoneme-extractor.js';
import { TextWordParser } from './skills/armenian-learner/lib/text-word-parser.js';

console.log('=== COMPARE THREE AUDIOS: LEARNING TO READ ===\n');

const AUDIO_FILES = [
  '/app/agent/training-audio/youtube-liturgy.wav',     // Audio #2 (83 min)
  '/app/agent/training-audio/youtube-liturgy-2.wav',   // Audio #3 (68 min)
];

const TEXT_FILE = '/app/training-data/text-matcher-db.json';
const TIMESTAMPS_FILE = '/app/training-data/page-timestamps-mapped.json';

// Load text and timestamps
const textData = JSON.parse(fs.readFileSync(TEXT_FILE, 'utf8'));
const liturgyText = textData.pages;
const timestampsData = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, 'utf8'));
const pages = timestampsData.pages;

console.log('📚 Loaded Data:');
console.log(`  Text: ${liturgyText.length} pages`);
console.log(`  Audio files: ${AUDIO_FILES.length}`);
console.log(`  Timestamps: ${pages.length} pages\n`);

const extractor = new AudioPhonemeExtractor();
const textParser = new TextWordParser();

// Sample pages to compare (representative sample)
const SAMPLE_PAGES = [1, 5, 10, 20, 30, 50, 75, 100, 120, 150];

console.log(`🎯 Comparing ${SAMPLE_PAGES.length} sample pages across ${AUDIO_FILES.length} audio sources\n`);

async function loadAudioSegment(audioFile, startTime, duration) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', audioFile,
      '-ss', startTime.toString(),
      '-t', Math.min(duration, 60).toString(),
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '1',
      '-'
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    const chunks = [];
    ffmpeg.stdout.on('data', chunk => chunks.push(chunk));
    ffmpeg.on('close', code => {
      if (code === 0) {
        const buffer = Buffer.concat(chunks);
        const samples = new Float32Array(buffer.length / 2);
        for (let i = 0; i < samples.length; i++) {
          samples[i] = buffer.readInt16LE(i * 2) / 32768.0;
        }
        resolve(samples);
      } else {
        reject(new Error(`ffmpeg failed`));
      }
    });
  });
}

const wordVarianceDatabase = {}; // word → [audio1_features, audio2_features, audio3_features]

for (const pageNum of SAMPLE_PAGES) {
  console.log(`\n📖 PAGE ${pageNum}:`);
  
  // Get text for this page
  const pageData = liturgyText.find(p => p.pageNumber === pageNum);
  if (!pageData || !pageData.armenianText) {
    console.log('  ⚠️  No text available');
    continue;
  }
  
  const wordObjects = textParser.extractWords(pageData);
  const words = wordObjects.map(w => w.word);
  
  console.log(`  Text: ${words.length} words found`);
  console.log(`  Words: ${words.slice(0, 5).join(', ')}${words.length > 5 ? '...' : ''}`);
  
  // Get timestamp for this page
  const pageInfo = pages.find(p => p.pageNumber === pageNum);
  if (!pageInfo) {
    console.log('  ⚠️  No timestamp');
    continue;
  }
  
  const nextPage = pages.find(p => p.pageNumber === pageNum + 1);
  const duration = nextPage ? (nextPage.timestamp - pageInfo.timestamp) : 30;
  
  // Extract audio from each source
  const audioFeatures = [];
  
  for (let i = 0; i < AUDIO_FILES.length; i++) {
    const audioFile = AUDIO_FILES[i];
    const audioName = audioFile.includes('youtube-liturgy-2') ? 'Audio #3' : 'Audio #2';
    
    try {
      const audio = await loadAudioSegment(audioFile, pageInfo.timestamp, duration);
      const features = extractor.extractSignature(audio, 44100);
      
      audioFeatures.push({
        source: audioName,
        duration: features.duration,
        mfcc: features.mfcc,
        rms: features.rms,
        spectralCentroid: features.spectralCentroid
      });
      
      console.log(`  ${audioName}: ${features.duration.toFixed(1)}s audio`);
      
    } catch (error) {
      console.log(`  ${audioName}: ❌ ${error.message}`);
      audioFeatures.push(null);
    }
  }
  
  // For each word on this page, store audio features from all sources
  words.forEach(word => {
    if (!wordVarianceDatabase[word]) {
      wordVarianceDatabase[word] = {
        word,
        appearances: []
      };
    }
    
    wordVarianceDatabase[word].appearances.push({
      page: pageNum,
      audioFeatures: audioFeatures.filter(a => a !== null)
    });
  });
  
  // Compare audio similarity across sources
  if (audioFeatures.filter(a => a !== null).length >= 2) {
    const audio2 = audioFeatures[0];
    const audio3 = audioFeatures[1];
    
    if (audio2 && audio3) {
      // Simple similarity metric
      const durationDiff = Math.abs(audio2.duration - audio3.duration);
      const rmsDiff = Math.abs(audio2.rms - audio3.rms);
      
      console.log(`  Similarity: duration Δ=${durationDiff.toFixed(1)}s, rms Δ=${rmsDiff.toFixed(4)}`);
    }
  }
}

console.log('\n=== WORD VARIANCE ANALYSIS ===\n');

// Analyze words that appear in multiple audio sources
const multiSourceWords = Object.values(wordVarianceDatabase)
  .filter(entry => entry.appearances.length >= 2);

console.log(`📊 Words found in multiple recordings: ${multiSourceWords.length}\n`);

// Show top words with most variance
console.log('Top 20 words with cross-audio coverage:');
multiSourceWords
  .sort((a, b) => b.appearances.length - a.appearances.length)
  .slice(0, 20)
  .forEach((entry, i) => {
    const avgAudioSources = entry.appearances.reduce((sum, app) => 
      sum + app.audioFeatures.length, 0) / entry.appearances.length;
    console.log(`  ${i + 1}. "${entry.word}": ${entry.appearances.length} pages, ${avgAudioSources.toFixed(1)} audios avg`);
  });

// Save word variance database
const outputFile = '/app/agent/word-variance-database.json';
fs.writeFileSync(outputFile, JSON.stringify({
  timestamp: new Date().toISOString(),
  audioSources: AUDIO_FILES.length,
  pagesAnalyzed: SAMPLE_PAGES,
  totalWords: Object.keys(wordVarianceDatabase).length,
  multiSourceWords: multiSourceWords.length,
  words: wordVarianceDatabase
}, null, 2));

console.log(`\n💾 Saved to: ${outputFile}`);
console.log(`   Total unique words: ${Object.keys(wordVarianceDatabase).length}`);
console.log(`   Multi-source words: ${multiSourceWords.length}\n`);

console.log('🎓 LEARNING PROGRESSION:');
console.log('  Child: Recognized words in single audio');
console.log('  Teen: Now comparing same words across multiple audios');
console.log('  Adult: Next step - generalize word recognition across ANY audio\n');

console.log('📖 Next Steps:');
console.log('  1. Build cross-audio word recognizer');
console.log('  2. Train on variance patterns');
console.log('  3. Test recognition on new audio');
console.log('  4. Achieve professional page-turning accuracy');
