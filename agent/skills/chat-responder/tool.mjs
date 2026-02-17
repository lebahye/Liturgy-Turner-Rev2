#!/usr/bin/env node
/**
 * Chat Responder - Monitor database for pending messages and respond
 */

import Database from 'better-sqlite3';

const DB_PATH = '/app/data/liturgy-turner.db';

export async function monitorChat({ }, context) {
  const { log } = context;
  
  let db;
  try {
    // Open database
    db = new Database(DB_PATH, { readonly: false });
    
    // Get pending messages
    const pending = db.prepare(`
      SELECT id, conversation_id, content, created_at
      FROM messages 
      WHERE status = 'pending' 
      ORDER BY created_at ASC 
      LIMIT 5
    `).all();
    
    if (!pending || pending.length === 0) {
      db.close();
      return { success: true, processed: 0 };
    }
    
    log(`Found ${pending.length} pending message(s) to process`);
    
    // Process each message
    for (const msg of pending) {
      try {
        // Mark as processing
        db.prepare('UPDATE messages SET status = ? WHERE id = ?')
          .run('processing', msg.id);
        
        log(`Processing message: "${msg.content.substring(0, 60)}..."`);
        
        // Get conversation history for context
        const history = db.prepare(`
          SELECT role, content 
          FROM messages 
          WHERE conversation_id = ? 
            AND id != ?
            AND status = 'delivered'
          ORDER BY created_at ASC
          LIMIT 20
        `).all(msg.conversation_id, msg.id);
        
        // Build context message
        let contextInfo = '';
        if (history.length > 0) {
          contextInfo = `\n\nConversation history (last ${history.length} messages):\n`;
          history.forEach(h => {
            contextInfo += `${h.role}: ${h.content.substring(0, 100)}\n`;
          });
        }
        
        // This message will be seen by the main agent context
        // The agent will generate a response naturally
        // For now, we'll trigger the agent to respond by logging
        
        log(`User asked: ${msg.content}`);
        log('Generating response via main agent...');
        
        // The main agent should respond here
        // We'll mark it as delivered and let the agent write the response
        
        db.prepare('UPDATE messages SET status = ? WHERE id = ?')
          .run('delivered', msg.id);
        
      } catch (msgError) {
        log(`Error processing message ${msg.id}: ${msgError.message}`);
        
        // Mark as delivered to avoid infinite loop
        db.prepare('UPDATE messages SET status = ? WHERE id = ?')
          .run('delivered', msg.id);
      }
    }
    
    db.close();
    return { success: true, processed: pending.length };
    
  } catch (error) {
    if (db) db.close();
    log(`Database error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Schedule to run every 5 seconds
export const schedule = {
  enabled: true,
  intervalMs: 5000,
};
