#!/usr/bin/env node
/**
 * Load existing fingerprint training data into PostgreSQL database
 * This resolves the critical blocker where fingerprint data exists but isn't in the database
 */

import { readFileSync } from 'fs';
import pkg from 'pg';
const { Pool } = pkg;

// Database configuration from .env
const pool = new Pool({
  user: 'liturgy_user',
  host: 'localhost',
  database: 'liturgy_turner',
  password: 'liturgy_secure_2024',
  port: 5432,
});

async function loadFingerprints() {
  console.log('🔍 Loading fingerprint training data...');
  
  try {
    // Check current state
    const result = await pool.query('SELECT COUNT(*) FROM fingerprints');
    const currentCount = parseInt(result.rows[0].count);
    console.log(`📊 Current fingerprints in database: ${currentCount}`);
    
    if (currentCount > 0) {
      console.log('⚠️  Database already has fingerprints. Use --force to overwrite.');
      return;
    }

    // Load the best fingerprint data (fingerprints-v2.json is typically the most refined)
    let fingerprintData;
    const filesToTry = [
      './training-data/fingerprints-v2.json',
      './training-data/fingerprints.json'
    ];
    
    for (const filePath of filesToTry) {
      try {
        const data = readFileSync(filePath, 'utf8');
        fingerprintData = JSON.parse(data);
        console.log(`📂 Loaded ${fingerprintData.length} fingerprints from ${filePath}`);
        break;
      } catch (err) {
        console.log(`⚠️  Could not load ${filePath}: ${err.message}`);
      }
    }
    
    if (!fingerprintData) {
      throw new Error('No fingerprint data files found');
    }

    console.log('💾 Inserting fingerprints into PostgreSQL...');
    
    // Insert fingerprints into database
    let inserted = 0;
    for (const fingerprint of fingerprintData) {
      try {
        const insertQuery = `
          INSERT INTO fingerprints (
            page_number, 
            fingerprint_data, 
            audio_source, 
            timestamp_start, 
            timestamp_end, 
            confidence, 
            confirmed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        
        const values = [
          fingerprint.pageNumber || 1,
          JSON.stringify(fingerprint.features || fingerprint),
          fingerprint.source || 'training_data',
          fingerprint.startTime || 0,
          fingerprint.endTime || fingerprint.duration || 60,
          fingerprint.confidence || 0.8,  // High confidence for manually trained data
          true  // Mark as confirmed since this is manually trained
        ];
        
        await pool.query(insertQuery, values);
        inserted++;
        
        if (inserted % 100 === 0) {
          console.log(`📈 Inserted ${inserted}/${fingerprintData.length} fingerprints...`);
        }
      } catch (err) {
        console.error(`❌ Error inserting fingerprint for page ${fingerprint.pageNumber}: ${err.message}`);
      }
    }
    
    console.log(`✅ Successfully inserted ${inserted} fingerprints`);
    
    // Verify
    const verifyResult = await pool.query('SELECT COUNT(*) FROM fingerprints');
    const finalCount = parseInt(verifyResult.rows[0].count);
    console.log(`🎯 Database now contains ${finalCount} fingerprints`);
    
    // Show page distribution
    const pageResult = await pool.query(`
      SELECT page_number, COUNT(*) as count 
      FROM fingerprints 
      GROUP BY page_number 
      ORDER BY page_number 
      LIMIT 10
    `);
    
    console.log('📊 Fingerprint distribution by page:');
    for (const row of pageResult.rows) {
      console.log(`   Page ${row.page_number}: ${row.count} fingerprints`);
    }
    
  } catch (error) {
    console.error('❌ Error loading fingerprints:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
loadFingerprints().then(() => {
  console.log('🏁 Fingerprint loading complete');
});