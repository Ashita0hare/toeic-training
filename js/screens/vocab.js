import { getAll, put, getSetting } from '../db.js';
import { loadWords } from '../data.js';
import { sm2Update, toDateStr, isDue } from '../srs.js';
import { shuffle } from '../picker.js';
import { speak, cancelSpeech } from '../speech.js';

const BATCH_CAP = 20;

export async function renderVocabMenu(root, navigate) {
  const words = await loadWords();
  const srsRows = await getAll('srs');
  const today = toDateStr(new Date());
  const dueCount = words.filter((w) => {
    const card = srsRows.find((r) => r.id === w.id);
    return isDue(card, today);
  }).length;

  root.innerHTML = `
    <h1>単語学習</h1>
    <p class="hint">今日復習予定の単語：${dueCount}語（新しい単語で埋め合わせます）</p>
    <div class="menu-list">
      <button class="menu-item" id="m-en2ja">
        <span class="menu-icon">🔤</span>
        <span class="menu-text"><div class="menu-title">英語 → 日本語</div><div class="menu-sub">単語を見て意味を思い出す</div></span>
      </button>
      <button class="menu-item" id="m-audio2ja">
        <span class="menu-icon">🔊</span>
        <span class="menu-text"><div class="menu-title">音声 → 日本語</div><div class="menu-sub">聞いて意味を思い出す（文字は出ません）</div></span>
      </button>
    </div>
  `;
  document.getElementById('m-en2ja').addEventListener('click', () => navigate('vocab-practice', { mode: 'en2ja' }));
  document.getElementById('m-audio2ja').addEventListener('click', () => navigate('vocab-practice', { mode: 'audio2ja' }));
}

export async function renderVocabPractice(root, navigate, mode) {
  const accent = (await getSetting('accent', 'en-US')) || 'en-US';
  const rate = (await getSetting('rate', 1.0)) || 1.0;

  const words = await loadWords();
  const srsRows = await getAll('srs');
  const srsById = {};
  srsRows.forEach((r) => (srsById[r.id] = r));
  const today = toDateStr(new Date());

  const due = [];
  const fresh = [];
  for (const w of words) {
    const card = srsById[w.id];
    if (card) {
      if (isDue(card, today)) due.push(w);
    } else {
      fresh.push(w);
    }
  }
  shuffle(due);
  shuffle(fresh);
  const queue = due.slice(0, BATCH_CAP);
  if (queue.length < BATCH_CAP) queue.push(...fresh.slice(0, BATCH_CAP - queue.length));

  if (queue.length === 0) {
    root.innerHTML = `
      <div class="center">
        <h1>復習する単語がありません</h1>
        <p class="hint">また明日チェックしてみてください。</p>
      </div>
      <div class="bottom-bar"><button id="btn-back" class="btn btn-primary btn-wide btn-lg">単語メニューへ</button></div>
    `;
    document.getElementById('btn-back').addEventListener('click', () => navigate('vocab'));
    return;
  }

  let correct = 0;
  for (let i = 0; i < queue.length; i++) {
    const word = queue[i];
    await showCard(root, word, i, queue.length, mode, { accent, rate }, srsById, (quality) => {
      if (quality >= 3) correct += 1;
    });
  }

  root.innerHTML = `
    <div class="center">
      <h1>単語学習 終了</h1>
      <div class="card"><p style="font-size:22px; font-weight:700;">${correct} / ${queue.length} 覚えていた</p></div>
    </div>
    <div class="bottom-bar"><button id="btn-back" class="btn btn-primary btn-wide btn-lg">単語メニューへ</button></div>
  `;
  document.getElementById('btn-back').addEventListener('click', () => navigate('vocab'));
}

async function showCard(root, word, idx, total, mode, opts, srsById, onRated) {
  const headEn = mode === 'en2ja';
  root.innerHTML = `
    <p class="step-label">${idx + 1} / ${total}</p>
    <div class="center">
      <div class="card" style="width:100%;">
        ${
          headEn
            ? `<div class="audio-indicator">🔊</div><h1 style="text-align:center;">${escapeHtml(word.en)}</h1><p class="hint" style="text-align:center;">${escapeHtml(word.pos || '')}</p>`
            : `<div class="audio-indicator">🔊</div><p class="hint" style="text-align:center;">再生中…（音声のみ）</p>`
        }
        <div id="reveal-area"></div>
      </div>
    </div>
    <div class="bottom-bar" id="bottom-area">
      <button id="btn-reveal" class="btn btn-primary btn-wide btn-lg">答えを見る</button>
    </div>
  `;
  speak(word.en, { lang: opts.accent, rate: opts.rate }).catch(() => {});

  await new Promise((resolve) => {
    document.getElementById('btn-reveal').addEventListener(
      'click',
      () => {
        document.getElementById('reveal-area').innerHTML = `
          ${headEn ? '' : `<p style="font-size:22px; font-weight:700; text-align:center;">${escapeHtml(word.en)}</p>`}
          <p style="font-size:19px; font-weight:600; margin-top:10px;">${escapeHtml(word.ja)}</p>
          <p class="hint">${escapeHtml(word.exampleEn || '')}</p>
          <p class="hint">${escapeHtml(word.exampleJa || '')}</p>
        `;
        document.getElementById('bottom-area').innerHTML = `
          <button class="btn btn-bad" data-q="0">もう一度</button>
          <button class="btn btn-secondary" data-q="3">難しい</button>
          <button class="btn btn-secondary" data-q="4">良い</button>
          <button class="btn btn-good" data-q="5">簡単</button>
        `;
        document.querySelectorAll('#bottom-area [data-q]').forEach((btn) => {
          btn.addEventListener(
            'click',
            async () => {
              const quality = parseInt(btn.dataset.q, 10);
              const updated = sm2Update({ ...srsById[word.id], id: word.id }, quality);
              srsById[word.id] = updated;
              await put('srs', updated);
              onRated(quality);
              resolve();
            },
            { once: true }
          );
        });
      },
      { once: true }
    );
  });
  cancelSpeech();
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
