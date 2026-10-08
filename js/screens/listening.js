import { getAll, get, put, getSetting } from '../db.js';
import { loadPart2, loadPart34, loadDictation } from '../data.js';
import { pickItems, shuffle, statsMapByKey } from '../picker.js';
import { speak, speakSequence, cancelSpeech } from '../speech.js';

export async function renderListeningMenu(root, navigate) {
  root.innerHTML = `
    <h1>リスニング練習</h1>
    <p class="hint">好きな形式を選んで練習できます（今日のセッションとは別に、何度でも）。</p>
    <div class="menu-list">
      <button class="menu-item" id="m-part2">
        <span class="menu-icon">🗣️</span>
        <span class="menu-text"><div class="menu-title">Part2形式（応答問題）</div><div class="menu-sub">音声のみ・15問</div></span>
      </button>
      <button class="menu-item" id="m-part34">
        <span class="menu-icon">🎙️</span>
        <span class="menu-text"><div class="menu-title">Part3/4形式（会話・トーク）</div><div class="menu-sub">5セット・各3問</div></span>
      </button>
      <button class="menu-item" id="m-dictation">
        <span class="menu-icon">⌨️</span>
        <span class="menu-text"><div class="menu-title">ディクテーション</div><div class="menu-sub">5文</div></span>
      </button>
      <button class="menu-item" id="m-flow">
        <span class="menu-icon">🌊</span>
        <span class="menu-text"><div class="menu-title">聞き流しモード</div><div class="menu-sub">画面を見ずに自動再生</div></span>
      </button>
      <button class="menu-item" id="m-settings">
        <span class="menu-icon">🎚️</span>
        <span class="menu-text"><div class="menu-title">アクセント・速度の設定</div><div class="menu-sub">米・英・豪 / 0.8〜1.2倍</div></span>
      </button>
    </div>
  `;
  document.getElementById('m-part2').addEventListener('click', () => navigate('listening-part2'));
  document.getElementById('m-part34').addEventListener('click', () => navigate('listening-part34'));
  document.getElementById('m-dictation').addEventListener('click', () => navigate('listening-dictation'));
  document.getElementById('m-flow').addEventListener('click', () => navigate('listen-through'));
  document.getElementById('m-settings').addEventListener('click', () => navigate('settings'));
}

async function getOpts() {
  const [accent, rate, dictationMode] = await Promise.all([
    getSetting('accent', 'en-US'),
    getSetting('rate', 1.0),
    getSetting('dictationMode', 'tap'),
  ]);
  return { accent, rate, dictationMode };
}

function waitClick(el) {
  return new Promise((resolve) => el.addEventListener('click', () => resolve(), { once: true }));
}

async function recordItemStat(type, itemId, isCorrect) {
  const key = `${type}:${itemId}`;
  const existing = await get('itemStats', key);
  const row = existing || { key, type, itemId, wrongCount: 0, shownCount: 0, replayCount: 0, unknownWords: [] };
  row.shownCount += 1;
  if (!isCorrect) row.wrongCount += 1;
  row.lastShown = Date.now();
  await put('itemStats', row);
}

function miniHeader(idx, total, label) {
  return `<p class="step-label">${label}（${idx + 1} / ${total}）</p>`;
}

function summaryScreen(root, navigate, correct, total, label) {
  root.innerHTML = `
    <div class="center">
      <h1>練習終了</h1>
      <p class="hint">${label}</p>
      <div class="card"><p style="font-size:22px; font-weight:700;">${correct} / ${total} 正解</p></div>
    </div>
    <div class="bottom-bar"><button id="btn-back" class="btn btn-primary btn-wide btn-lg">リスニングメニューへ</button></div>
  `;
  document.getElementById('btn-back').addEventListener('click', () => navigate('listening'));
}

// ---------- Part 2 standalone practice ----------
export async function renderPart2Practice(root, navigate) {
  const opts = await getOpts();
  const all = await loadPart2();
  const statsByKey = statsMapByKey(await getAll('itemStats'));
  const queue = pickItems(all, statsByKey, 'part2', 15);
  let correct = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    root.innerHTML = `
      ${miniHeader(i, queue.length, 'Part2形式')}
      <div class="center">
        <div class="audio-indicator" id="audio-indicator">🔊</div>
        <p class="hint">再生中…（画面には表示されません）</p>
      </div>
      <div class="bottom-bar" id="bottom-area">
        <button class="btn btn-ghost" id="btn-replay">🔁 もう一度聴く</button>
        <button class="btn btn-secondary" data-ans="A">A</button>
        <button class="btn btn-secondary" data-ans="B">B</button>
        <button class="btn btn-secondary" data-ans="C">C</button>
      </div>
    `;
    const playAll = () =>
      speakSequence([item.questionEn, ...item.choices.map((c) => `${c.label}. ${c.en}`)], {
        lang: opts.accent,
        rate: opts.rate,
        pauseMs: 450,
      }).catch(() => {});
    playAll();
    document.getElementById('btn-replay').addEventListener('click', () => {
      cancelSpeech();
      playAll();
    });
    const chosen = await new Promise((resolve) => {
      document.querySelectorAll('#bottom-area [data-ans]').forEach((btn) => {
        btn.addEventListener('click', () => resolve(btn.dataset.ans), { once: true });
      });
    });
    cancelSpeech();
    const isCorrect = chosen === item.answer;
    if (isCorrect) correct += 1;
    await recordItemStat('part2', item.id, isCorrect);

    document.getElementById('audio-indicator').textContent = isCorrect ? '✅' : '❌';
    root.querySelector('.center').insertAdjacentHTML(
      'beforeend',
      `<div class="card" style="width:100%; text-align:left;">
        <p><strong>Q:</strong> ${escapeHtml(item.questionEn)}</p>
        ${item.choices.map((c) => `<p style="color:${c.label === item.answer ? 'var(--good)' : 'var(--text-dim)'}">${c.label}. ${escapeHtml(c.en)}${c.label === item.answer ? ' ✓' : ''}</p>`).join('')}
        <p class="hint" style="margin-top:10px;">${escapeHtml(item.ja)}</p>
        <p class="hint">${escapeHtml(item.explanation)}</p>
      </div>`
    );
    document.getElementById('bottom-area').innerHTML = `<button id="btn-next" class="btn btn-primary btn-wide btn-lg">次へ</button>`;
    await waitClick(document.getElementById('btn-next'));
  }
  summaryScreen(root, navigate, correct, queue.length, 'Part2形式');
}

// ---------- Part 3/4 standalone practice ----------
export async function renderPart34Practice(root, navigate) {
  const opts = await getOpts();
  const all = await loadPart34();
  const statsByKey = statsMapByKey(await getAll('itemStats'));
  const queue = pickItems(all, statsByKey, 'part34', 5);
  let correct = 0;
  let total = 0;

  for (let i = 0; i < queue.length; i++) {
    const set = queue[i];
    let anyWrong = false;

    root.innerHTML = `
      ${miniHeader(i, queue.length, set.type === '3' ? 'Part3形式（会話）' : 'Part4形式（トーク）')}
      <div class="center">
        <div class="audio-indicator">🔊</div>
        <p class="hint">再生中…</p>
      </div>
      <div class="bottom-bar"><button id="btn-replay" class="btn btn-secondary btn-wide">🔁 もう一度聴く</button></div>
    `;
    const playScript = () =>
      speakSequence(set.script.map((s) => s.en), { lang: opts.accent, rate: opts.rate, pauseMs: 400 }).catch(() => {});
    document.getElementById('btn-replay').addEventListener('click', () => {
      cancelSpeech();
      playScript();
    });
    await playScript();
    root.querySelector('.bottom-bar').innerHTML = `<button id="btn-to-questions" class="btn btn-primary btn-wide btn-lg">設問へ進む</button>`;
    await waitClick(document.getElementById('btn-to-questions'));

    for (let qi = 0; qi < set.questions.length; qi++) {
      const q = set.questions[qi];
      const LETTERS = ['A', 'B', 'C', 'D'];
      root.innerHTML = `
        ${miniHeader(i, queue.length, `設問 ${qi + 1}/3`)}
        <div class="card"><p style="font-size:17px;">${escapeHtml(q.q)}</p></div>
        <div class="choice-grid" id="choice-grid">
          ${q.choices.map((c, ci) => `<button class="choice-btn" data-i="${ci}">${LETTERS[ci]}. ${escapeHtml(c)}</button>`).join('')}
        </div>
      `;
      const chosenIdx = await new Promise((resolve) => {
        document.querySelectorAll('#choice-grid [data-i]').forEach((btn) => {
          btn.addEventListener('click', () => resolve(parseInt(btn.dataset.i, 10)), { once: true });
        });
      });
      const isCorrect = chosenIdx === q.answer;
      total += 1;
      if (isCorrect) correct += 1;
      else anyWrong = true;

      document.querySelectorAll('#choice-grid [data-i]').forEach((btn) => {
        const ci = parseInt(btn.dataset.i, 10);
        btn.disabled = true;
        if (ci === q.answer) btn.classList.add('correct');
        else if (ci === chosenIdx) btn.classList.add('incorrect');
      });
      root.insertAdjacentHTML(
        'beforeend',
        `<div class="card" style="text-align:left;">
          <p>${escapeHtml(q.ja)}</p>
          <p class="hint">${escapeHtml(q.explanation)}</p>
        </div>
        <div class="bottom-bar"><button id="btn-next-q" class="btn btn-primary btn-wide btn-lg">次へ</button></div>`
      );
      await waitClick(document.getElementById('btn-next-q'));
    }
    await recordItemStat('part34', set.id, !anyWrong);
  }
  summaryScreen(root, navigate, correct, total, 'Part3/4形式');
}

// ---------- Dictation standalone practice ----------
export async function renderDictationPractice(root, navigate) {
  const opts = await getOpts();
  const all = await loadDictation();
  const statsByKey = statsMapByKey(await getAll('itemStats'));
  const queue = pickItems(all, statsByKey, 'dictation', 5);
  let correct = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const correctWords = item.en.split(/\s+/);
    const shuffled = shuffle([...correctWords]);
    const picked = [];

    function renderChips() {
      const chipRow = document.getElementById('chip-row');
      const strip = document.getElementById('answer-strip');
      chipRow.innerHTML = shuffled.map((w, wi) => `<button class="chip" data-i="${wi}" ${picked.includes(wi) ? 'disabled' : ''}>${escapeHtml(w)}</button>`).join('');
      strip.innerHTML = picked.map((wi, pos) => `<button class="chip" data-pos="${pos}">${escapeHtml(shuffled[wi])}</button>`).join('');
      chipRow.querySelectorAll('.chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const wi = parseInt(btn.dataset.i, 10);
          if (!picked.includes(wi)) picked.push(wi);
          renderChips();
          document.getElementById('btn-submit').disabled = picked.length !== shuffled.length;
        });
      });
      strip.querySelectorAll('.chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          picked.splice(parseInt(btn.dataset.pos, 10), 1);
          renderChips();
          document.getElementById('btn-submit').disabled = picked.length !== shuffled.length;
        });
      });
    }

    root.innerHTML = `
      ${miniHeader(i, queue.length, 'ディクテーション')}
      <div class="audio-indicator" style="text-align:center;">🔊</div>
      <div class="answer-strip" id="answer-strip"></div>
      <div class="chip-row" id="chip-row"></div>
      <div class="bottom-bar" id="bottom-area">
        <button class="btn btn-ghost" id="btn-replay">🔁 もう一度聴く</button>
        <button class="btn btn-primary" id="btn-submit" disabled>答え合わせ</button>
      </div>
    `;
    renderChips();
    speak(item.en, { lang: opts.accent, rate: opts.rate }).catch(() => {});
    document.getElementById('btn-replay').addEventListener('click', () => {
      cancelSpeech();
      speak(item.en, { lang: opts.accent, rate: opts.rate }).catch(() => {});
    });

    await new Promise((resolve) => {
      document.getElementById('btn-submit').addEventListener('click', () => resolve(), { once: true });
    });
    cancelSpeech();
    const normalize = (s) => s.toLowerCase().replace(/[.,!?]/g, '').trim();
    const isCorrect = normalize(picked.map((wi) => shuffled[wi]).join(' ')) === normalize(item.en);
    if (isCorrect) correct += 1;
    await recordItemStat('dictation', item.id, isCorrect);

    root.innerHTML = `
      ${miniHeader(i, queue.length, 'ディクテーション')}
      <div class="card" style="text-align:left;">
        <p style="color:${isCorrect ? 'var(--good)' : 'var(--bad)'}; font-weight:600;">${isCorrect ? '正解' : '不正解'}</p>
        <p>${escapeHtml(item.en)}</p>
        <p class="hint">${escapeHtml(item.ja)}</p>
      </div>
      <div class="bottom-bar"><button id="btn-next" class="btn btn-primary btn-wide btn-lg">次へ</button></div>
    `;
    await waitClick(document.getElementById('btn-next'));
  }
  summaryScreen(root, navigate, correct, queue.length, 'ディクテーション');
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
