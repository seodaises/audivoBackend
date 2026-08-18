'use strict';
const fs = require('fs');
const { fetch: undiciFetch, FormData, Agent } = require('undici');
const { resolveAudioPath, mimeForKey } = require('../config/storage');

const TRANSCRIPTION_SERVICE_URL = process.env.TRANSCRIPTION_SERVICE_URL || 'http://localhost:8001';
const transcriptionDispatcher = new Agent({
  headersTimeout: 20 * 60 * 1000, // 20 min ceiling -- generous for CPU-only hardware
  bodyTimeout: 20 * 60 * 1000,
});

const transcribeSong = async (storageKey) => {
  const filePath = resolveAudioPath(storageKey);
  const buffer = fs.readFileSync(filePath);
  const mimeType = mimeForKey(storageKey);

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), storageKey);

  const response = await undiciFetch(`${TRANSCRIPTION_SERVICE_URL}/transcribe`, {
    method: 'POST',
    body: form,
    dispatcher: transcriptionDispatcher,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Transcription service responded ${response.status}: ${body}`);
  }

  return response.json();
};

module.exports = { transcribeSong };