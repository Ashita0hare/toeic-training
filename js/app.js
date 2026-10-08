import { renderHome } from './screens/home.js';
import { renderSession } from './screens/session.js';
import { renderResult } from './screens/result.js';
import { renderSettings } from './screens/settings.js';
import { renderListeningMenu, renderPart2Practice, renderPart34Practice, renderDictationPractice } from './screens/listening.js';
import { renderListenThrough } from './screens/listenthrough.js';
import { renderRecords } from './screens/records.js';
import { renderVocabMenu, renderVocabPractice } from './screens/vocab.js';
import { primeVoices, cancelSpeech } from './speech.js';
import { releaseWakeLock } from './wakelock.js';
import { openDB } from './db.js';

const screenEl = document.getElementById('screen');
const streakBadgeEl = document.getElementById('streak-badge');

export async function navigate(name, params = {}) {
  cancelSpeech();
  releaseWakeLock();
  screenEl.innerHTML = '';
  window.scrollTo(0, 0);
  if (name === 'home') return renderHome(screenEl, navigate, updateStreakBadge);
  if (name === 'session') return renderSession(screenEl, navigate);
  if (name === 'result') return renderResult(screenEl, navigate, params.result);
  if (name === 'settings') return renderSettings(screenEl, navigate);
  if (name === 'listening') return renderListeningMenu(screenEl, navigate);
  if (name === 'listening-part2') return renderPart2Practice(screenEl, navigate);
  if (name === 'listening-part34') return renderPart34Practice(screenEl, navigate);
  if (name === 'listening-dictation') return renderDictationPractice(screenEl, navigate);
  if (name === 'listen-through') return renderListenThrough(screenEl, navigate);
  if (name === 'records') return renderRecords(screenEl, navigate);
  if (name === 'vocab') return renderVocabMenu(screenEl, navigate);
  if (name === 'vocab-practice') return renderVocabPractice(screenEl, navigate, params.mode);
}

async function updateStreakBadge() {
  const { getSetting } = await import('./db.js');
  const streak = (await getSetting('streakCount', 0)) || 0;
  streakBadgeEl.textContent = streak > 0 ? `🔥 ${streak}日連続` : '';
}

document.getElementById('btn-settings').addEventListener('click', () => navigate('settings'));
document.getElementById('btn-listening').addEventListener('click', () => navigate('listening'));
document.getElementById('btn-records').addEventListener('click', () => navigate('records'));
document.getElementById('btn-vocab').addEventListener('click', () => navigate('vocab'));
document.getElementById('btn-home').addEventListener('click', () => navigate('home'));

async function boot() {
  await openDB();
  primeVoices();

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./service-worker.js');
    } catch (e) {
      console.warn('service worker registration failed', e);
    }
  }

  if (navigator.storage && navigator.storage.persist) {
    try {
      await navigator.storage.persist();
    } catch (e) {
      // ignore — not critical if the browser declines
    }
  }

  await updateStreakBadge();
  navigate('home');
}

boot();
