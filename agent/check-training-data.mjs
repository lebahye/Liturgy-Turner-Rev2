#!/usr/bin/env node
import Database from 'better-sqlite3';

const db = new Database('/app/data/liturgy-turner.db', { readonly: true });

console.log('📊 TRAINING SESSIONS AVAILABLE:');
console.log('═'.repeat(70));
console.log('');

const sessions = db.prepare('SELECT * FROM training_sessions ORDER BY created_at').all();

sessions.forEach(s => {
  console.log(`Session ${s.id}: ${s.notes || 'No notes'}`);
  console.log(`  Created: ${s.created_at}`);
  
  const markers = db.prepare(`
    SELECT COUNT(*) as count, MIN(page_number) as min, MAX(page_number) as max 
    FROM page_markers WHERE session_id = ?
  `).get(s.id);
  
  console.log(`  Pages: ${markers.min} to ${markers.max} (${markers.count} markers)`);
  
  // Get all page numbers
  const pages = db.prepare('SELECT DISTINCT page_number FROM page_markers WHERE session_id = ? ORDER BY page_number').all(s.id);
  console.log(`  Page numbers: ${pages.map(p => p.page_number).join(', ')}`);
  console.log('');
});

db.close();
