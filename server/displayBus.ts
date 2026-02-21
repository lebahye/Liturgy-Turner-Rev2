import type { Server } from 'http';
import { WebSocketServer } from 'ws';
import { promises as fs } from 'fs';
import path from 'path';

export type DisplayMode = 'live' | 'training' | 'display';

export type DisplayState = {
  pdfPath: string | null;
  pdfId: string | null;
  page: number;
  totalPages: number;
  mode: DisplayMode;
  updatedAt: number;
  lastReason?: string;
  lastConfidence?: number;
};

const STATE_FILE = process.env.STATE_FILE || '/app/data/display-state.json';

// Initialize with defaults
const state: DisplayState = {
  pdfPath: null,
  pdfId: null,
  page: 1,
  totalPages: 1,
  mode: 'display',
  updatedAt: Date.now(),
};

let wss: WebSocketServer | null = null;
let saveTimer: NodeJS.Timeout | null = null;

// Load state from disk on startup
async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    const loaded = JSON.parse(data);
    // Merge loaded state with current state
    Object.assign(state, loaded);
    console.log('[displayBus] State loaded from disk:', state);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.log('[displayBus] No saved state found, using defaults');
    } else {
      console.error('[displayBus] Error loading state:', err);
    }
  }
}

// Save state to disk (debounced)
async function saveState() {
  // Clear any pending save
  if (saveTimer) clearTimeout(saveTimer);
  
  // Debounce: save 500ms after last change
  saveTimer = setTimeout(async () => {
    try {
      await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
      await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      console.log('[displayBus] State saved to disk');
    } catch (err) {
      console.error('[displayBus] Error saving state:', err);
    }
  }, 500);
}

function clampPage(page: number) {
  const max = Math.max(1, state.totalPages || 1);
  return Math.max(1, Math.min(page, max));
}

function broadcast(type: 'state' | 'page_changed') {
  if (!wss) return;
  const msg = JSON.stringify({ type, state });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

export async function initDisplayBus(httpServer: Server) {
  if (wss) return;

  // Load saved state first
  await loadState();

  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'state', state }));
  });
}

export function getDisplayState(): DisplayState {
  return state;
}

export function setPdfState(input: { pdfPath: string; pdfId?: string | null; totalPages?: number }) {
  state.pdfPath = input.pdfPath;
  state.pdfId = input.pdfId ?? null;
  if (typeof input.totalPages === 'number' && Number.isFinite(input.totalPages)) {
    state.totalPages = Math.max(1, Math.floor(input.totalPages));
    state.page = clampPage(state.page);
  }
  state.updatedAt = Date.now();
  broadcast('state');
  saveState(); // Persist to disk
}

export function setPageState(input: { page: number; reason?: string; confidence?: number }) {
  state.page = clampPage(Math.floor(input.page));
  state.updatedAt = Date.now();
  state.lastReason = input.reason;
  state.lastConfidence = input.confidence;
  broadcast('page_changed');
  saveState(); // Persist to disk
}

export function nextPage(reason?: string, confidence?: number) {
  setPageState({ page: state.page + 1, reason, confidence });
}

export function prevPage(reason?: string, confidence?: number) {
  setPageState({ page: state.page - 1, reason, confidence });
}

export function setDisplayMode(mode: DisplayMode) {
  state.mode = mode;
  state.updatedAt = Date.now();
  broadcast('state');
  saveState(); // Persist to disk
}
