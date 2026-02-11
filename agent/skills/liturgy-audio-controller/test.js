#!/usr/bin/env node

/**
 * Test script for Liturgy Audio Controller
 *
 * Runs a series of checks without requiring Clawdbot.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');

const config = {
  apiEndpoint: process.env.LITURGY_API || 'http://localhost:5000',
  testTimeout: 5000,
};

async function testDependencies() {
  console.log('5️⃣ Checking dependencies...');
  const required = ['mic', 'axios', 'fuse.js'];
  let allPresent = true;
  for (const dep of required) {
    try {
      require.resolve(dep);
      console.log(` ✅ ${dep} installed`);
    } catch {
      console.log(` ❌ ${dep} missing – run: npm install ${dep}`);
      allPresent = false;
    }
  }
  return allPresent;
}

async function testLiturgyDatabase() {
  console.log('3️⃣ Testing liturgy database...');
  try {
    const dbPath = path.join(__dirname, 'data', 'liturgy-database.json');
    if (!fs.existsSync(dbPath)) {
      console.log(' ❌ Database file not found');
      return false;
    }
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    console.log(` ✅ Database loaded: ${db.entries.length} entries`);
    if (db.entries.length > 0) {
      console.log(` Sample entry: ${JSON.stringify(db.entries[0], null, 2)}`);
    }
    return true;
  } catch (error) {
    console.log(' ❌ Database error:', error.message);
    return false;
  }
}

async function testFuzzyMatching() {
  console.log('4️⃣ Testing fuzzy text matching...');
  try {
    const dbPath = path.join(__dirname, 'data', 'liturgy-database.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const fuse = new Fuse(db.entries, {
      keys: ['text', 'armenian', 'transliteration'],
      threshold: 0.3,
      includeScore: true,
    });

    const testQueries = ['holy god', 'our father', 'peace be with you'];
    console.log(' Testing sample phrases:');
    for (const query of testQueries) {
      const results = fuse.search(query);
      if (results.length > 0) {
        const match = results[0];
        console.log(
          ` ✅ "${query}" → Page ${match.item.page} (confidence ${(1 - match.score).toFixed(2)})`,
        );
      } else {
        console.log(` ⚠️ "${query}" → No match found`);
      }
    }
    return true;
  } catch (error) {
    console.log(' ❌ Matching error:', error.message);
    return false;
  }
}

async function testAPIConnection() {
  console.log('1️⃣ Testing API connection...');
  try {
    const response = await axios.get(`${config.apiEndpoint}/api/control/state`, {
      timeout: config.testTimeout,
    });
    console.log(' ✅ API is reachable');
    console.log(' Current state:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log(' ❌ API connection failed:', error.message);
    console.log(' Make sure Liturgy Turner app is running on port 5000');
    return false;
  }
}

async function testSetPage(page) {
  console.log(`2️⃣ Testing page set to ${page}...`);
  try {
    const response = await axios.post(
      `${config.apiEndpoint}/api/control/page/set`,
      { page, reason: 'test script', confidence: 1.0 },
      { headers: { 'Content-Type': 'application/json' }, timeout: config.testTimeout },
    );
    if (response.data.success) {
      console.log(' ✅ Page set successfully');
      console.log(' Response:', JSON.stringify(response.data, null, 2));
      return true;
    }
    console.log(' ❌ Page set failed');
    return false;
  } catch (error) {
    console.log(' ❌ Request failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🧪 Testing Liturgy Audio Controller Skill');
  console.log('═══════════════════════════════════════════════════════');

  const results = {
    dependencies: await testDependencies(),
    database: await testLiturgyDatabase(),
    fuzzyMatch: await testFuzzyMatching(),
    apiConnection: await testAPIConnection(),
  };

  if (results.apiConnection) {
    results.pageTurn = await testSetPage(5);
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 Test Results:');
  console.log(' Dependencies:', results.dependencies ? '✅' : '❌');
  console.log(' Liturgy Database:', results.database ? '✅' : '❌');
  console.log(' Fuzzy Matching:', results.fuzzyMatch ? '✅' : '❌');
  console.log(' API Connection:', results.apiConnection ? '✅' : '❌');
  if (results.pageTurn !== undefined) {
    console.log(' Page Turn Test:', results.pageTurn ? '✅' : '❌');
  }

  const allPassed = Object.values(results).every((val) => val === true);

  console.log();
  if (allPassed) {
    console.log('✅ All tests passed! Skill is ready to use.');
    console.log(' Next steps:');
    console.log(' 1. Restart embedded gateway');
    console.log(' 2. Send "start listening" via the bot');
  } else {
    console.log('⚠️ Some tests failed. Review messages above.');
    console.log(' Common fixes:');
    console.log('  • Run npm install');
    console.log('  • Start Liturgy Turner app (npm run dev)');
    console.log('  • Check data/liturgy-database.json exists');
  }
  console.log('═══════════════════════════════════════════════════════');
}

runAllTests().catch((error) => {
  console.error('Test failed:', error);
  process.exitCode = 1;
});
