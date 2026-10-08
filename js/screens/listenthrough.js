import { get, put, getSetting } from '../db.js';
import { loadPart2 } from '../data.js';
import { shuffle } from '../picker.js';
import { speak, cancelSpeech, getVoices, primeVoices } from '../speech.js';
import { acquireWakeLock, releaseWakeLock } from '../wakelock.js';

const BATCH_SIZE = 20;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasJapaneseVoice() {
  return getVoices().some((v) => v.lang && v.lang.toLowerCase().startsWith('ja'));
}

async function recordItemStat(type, itemId) {
  const key = `${type}:${itemId}`;
  const existing = await get('itemStats', key);
  const row = existing || { key, type, itemId, wrongCount: 0, shownCount: 0, replayCount: 0, unknownWords: [] };
  row.shownCount += 1;
  row.lastShown = Date.now();
  await put('itemStats', row);
}

export async function renderListenThrough(root, navigate) {
  const [accent, rate] = await Promise.all([getSetting('accent', 'en-US'), getSetting('rate', 1.0)]);
  await primeVoices();
  const jaAvailable = hasJapaneseVoice();

  const all = await loadPart2();
  const queue = shuffle([...all]).slice(0, BATCH_SIZE);

  const state = { playing: false, idx: 0, stopped: false };

  function render() {
    const item = queue[state.idx];
    root.innerHTML = `
      <div class="center">
        <h1>聞き流しモード</h1>
        <p class="hint">${state.idx + 1} / ${queue.length}　${jaAvailable ? '' : '（日本語音声が無いため解説は読み上げません）'}</p>
        <div class="audio-indicator">${state.playing ? '🔊' : '⏸️'}</div>
        <button id="btn-toggle" class="playpause-btn">${state.playing ? '⏸' : '▶'}</button>
        <p class="hint" style="margin-top:18px;">画面を見なくても、音声だけで「問題 → 正解 → 解説」の順に自動再生されます。</p>
      </div>
      <div class="bottom-bar">
        <button id="btn-stop" class="btn btn-secondary btn-wide">メニューに戻る</button>
      </div>
    `;
    document.getElementById('btn-toggle').addEventListener('click', onToggle);
    document.getElementById('btn-stop').addEventListener('click', onStop);
  }

  async function onToggle() {
    if (state.playing) {
      state.playing = false;
      cancelSpeech();
      render();
    } else {
      state.playing = true;
      render();
      runLoop();
    }
  }

  async function onStop() {
    state.stopped = true;
    state.playing = false;
    cancelSpeech();
    await releaseWakeLock();
    navigate('listening');
  }

  async function runLoop() {
    await acquireWakeLock();
    while (state.playing && !state.stopped && state.idx < queue.length) {
      const item = queue[state.idx];
      render();
      try {
        await speak(item.questionEn, { lang: accent, rate });
        if (!state.playing) break;
        await delay(500);
        for (const c of item.choices) {
          if (!state.playing) break;
          await speak(`${c.label}. ${c.en}`, { lang: accent, rate });
          await delay(250);
        }
        if (!state.playing) break;
        await delay(1200); // 間（考える時間）
        const correctChoice = item.choices.find((c) => c.label === item.answer);
        if (jaAvailable) {
          await speak(`正解は ${item.answer} です。`, { lang: 'ja-JP', rate: 1.0 });
          await delay(200);
          await speak(item.explanation, { lang: 'ja-JP', rate: 1.0 });
        } else {
          await speak(`The correct answer is ${item.answer}. ${correctChoice ? correctChoice.en : ''}`, { lang: accent, rate });
        }
        await recordItemStat('part2', item.id);
      } catch (e) {
        // speech error — skip to next item rather than getting stuck
      }
      if (!state.playing || state.stopped) break;
      await delay(900);
      state.idx += 1;
    }
    if (state.idx >= queue.length && !state.stopped) {
      state.playing = false;
      await releaseWakeLock();
      root.innerHTML = `
        <div class="center">
          <h1>聞き流し終了</h1>
          <p class="hint">${queue.length}問 再生しました。</p>
        </div>
        <div class="bottom-bar"><button id="btn-done" class="btn btn-primary btn-wide btn-lg">リスニングメニューへ</button></div>
      `;
      document.getElementById('btn-done').addEventListener('click', () => navigate('listening'));
    }
  }

  render();
}
