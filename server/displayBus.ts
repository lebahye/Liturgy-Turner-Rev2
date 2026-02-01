import type { Server } from 'http';
import { WebSocketServer } from 'ws';

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

const state: DisplayState = {
  pdfPath: null,
  pdfId: null,
  page: 1,
  totalPages: 1,
  mode: 'display',
  updatedAt: Date.now(),
};

let wss: WebSocketServer | null = null;

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

export function initDisplayBus(httpServer: Server) {
  if (wss) return;

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
}

export function setPageState(input: { page: number; reason?: string; confidence?: number }) {
  state.page = clampPage(Math.floor(input.page));
  state.updatedAt = Date.now();
  state.lastReason = input.reason;
  state.lastConfidence = input.confidence;
  broadcast('page_changed');
}

export function nextPage(reason?: string, confidence?: number) {
  setPageState({ page: state.page + 1, reason, confidence });
}

export function prevPage(reason?: string, confidence?: number) {
  setPageState({ page: state.page - 1, reason, confidence });
}
