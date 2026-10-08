import { getAll, get, put, getSetting, setSetting } from '../db.js';
import { loadWords, loadPart2, loadPart5, loadDictation } from '../data.js';
import { sm2Update, toDateStr, isDue } from '../srs.js';
import { pickItems, shuffle, statsMapByKey } from '../picker.js';
import { speak, speakSequence, cancelSpeech } from '../speech.js';

const STEP_NAMES = ['単語', '応答問題', 'ディクテーション', '短文穴埋め'];

export async function renderSession(root, navigate) {
  cancelSpeech();
  const [accent, rate, dictationMode] = await Promise.all([
    getSetting('accent', 'en-US'),
    getSetting('rate', 1.0),
    getSetting('dictationMode', 'tap'),
  ]);
  const opts = { accent, rate, dictationMode };

  const result = {
    date: toDateStr(new Date()),
    startedAt: Date.now(),
    vocab: { correct: 0, total: 0 },
    part2: { correct: 0, total: 0 },
    dictation: { correct: 0, total: 0 },
    part5: { correct: 0, total: 0 },
    wrongItems: [],
  };

  try {
    await runVocabStep(root, opts, result);
    await runPart2Step(root, opts, result);
    await runDictationStep(root, opts, result);
    await runPart5Step(root, opts, result);
  } catch (e) {
    console.error('session error', e);
  }

  result.durationSec = Math.round((Date.now() - result.startedAt) / 1000);
  await put('sessionLog', { ...result });
  await updateStreak(result.date);
  const totalCorrect = result.vocab.correct + result.part2.correct + result.dictation.correct + result.part5.correct;
  const totalCount = result.vocab.total + result.part2.total + result.dictation.total + result.part5.total;
  const minutes = Math.max(1, Math.round(result.durationSec / 60));
  await setSetting('lastSessionSummary', `正答 ${totalCorrect}/${totalCount} ・ ${minutes}分`);

  navigate('result', { result });
}

function stepHeader(stepIndex) {
  const dots = STEP_NAMES.map((_, i) => {
    const cls = i < stepIndex ? 'done' : i === stepIndex ? 'active' : '';
    return `<span class="${cls}"></span>`;
  }).join('');
  return `
    <div class="progress-dots">${dots}</div>
    <div class="step-label">ステップ ${stepIndex + 1}/${STEP_NAMES.length}：${STEP_NAMES[stepIndex]}</div>
  `;
}

function waitClick(el) {
  return new Promise((resolve) => {
    el.addEventListener('click', () => resolve(), { once: true });
  });
}

// ---------- Step 1: Vocabulary (SM-2) ----------
async function runVocabStep(root, opts, result) {
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
  const CAP = 10;
  const queue = due.slice(0, CAP);
  if (queue.length < CAP) queue.push(...fresh.slice(0, CAP - queue.length));

  for (let i = 0; i < queue.length; i++) {
    const word = queue[i];
    await showVocabCard(root, word, i, queue.length, opts, srsById, result);
  }
}

async function showVocabCard(root, word, idx, total, opts, srsById, result) {
  root.innerHTML = `
    ${stepHeader(0)}
    <div class="center">
      <div class="hint">${idx + 1} / ${total}</div>
      <div class="card" style="width:100%;">
        <div class="audio-indicator">🔊</div>
        <h1 style="text-align:center;">${escapeHtml(word.en)}</h1>
        <p class="hint" style="text-align:center;">${escapeHtml(word.pos || '')}</p>
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
              result.vocab.total += 1;
              if (quality >= 3) result.vocab.correct += 1;
              else result.wrongItems.push({ type: 'vocab', id: word.id, en: word.en, ja: word.ja });
              resolve();
            },
            { once: true }
          );
        });
      },
      { once: true }
    );
  });
}

// ---------- Step 2: Part 2 (audio Q + A/B/C, audio only) ----------
async function runPart2Step(root, opts, result) {
  const all = await loadPart2();
  const statsRows = await getAll('itemStats');
  const statsByKey = statsMapByKey(statsRows);
  const queue = pickItems(all, statsByKey, 'part2', 10);

  for (let i = 0; i < queue.length; i++) {
    await showPart2Item(root, queue[i], i, queue.length, opts, result);
  }
}

async function showPart2Item(root, item, idx, total, opts, result) {
  root.innerHTML = `
    ${stepHeader(1)}
    <div class="center">
      <div class="hint">${idx + 1} / ${total}</div>
      <div class="audio-indicator" id="audio-indicator">🔊</div>
      <p class="hint" id="playing-label">再生中…（画面には表示されません）</p>
    </div>
    <div class="bottom-bar" id="bottom-area">
      <button class="btn btn-ghost" id="btn-replay">🔁 もう一度聴く</button>
      <button class="btn btn-secondary" data-ans="A">A</button>
      <button class="btn btn-secondary" data-ans="B">B</button>
      <button class="btn btn-secondary" data-ans="C">C</button>
    </div>
  `;

  let replayCount = 0;
  const playAll = () =>
    speakSequence([item.questionEn, ...item.choices.map((c) => `${c.label}. ${c.en}`)], {
      lang: opts.accent,
      rate: opts.rate,
      pauseMs: 450,
    }).catch(() => {});

  playAll();
  document.getElementById('btn-replay').addEventListener('click', () => {
    replayCount += 1;
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
  await recordItemStat('part2', item.id, isCorrect, replayCount);
  result.part2.total += 1;
  if (isCorrect) result.part2.correct += 1;
  else result.wrongItems.push({ type: 'part2', id: item.id, en: item.questionEn, ja: item.ja, explanation: item.explanation });

  document.getElementById('playing-label').textContent = '';
  document.getElementById('audio-indicator').textContent = isCorrect ? '✅' : '❌';
  root.querySelector('.center').insertAdjacentHTML(
    'beforeend',
    `<div class="card" style="width:100%; text-align:left;">
      <p><strong>Q:</strong> ${escapeHtml(item.questionEn)}</p>
      ${item.choices
        .map(
          (c) =>
            `<p class="${c.label === item.answer ? 'pill' : ''}" style="color:${c.label === item.answer ? 'var(--good)' : 'var(--text-dim)'}">${c.label}. ${escapeHtml(c.en)}${c.label === item.answer ? ' ✓' : ''}</p>`
        )
        .join('')}
      <p class="hint" style="margin-top:10px;">${escapeHtml(item.ja)}</p>
      <p class="hint">${escapeHtml(item.explanation)}</p>
    </div>`
  );
  document.getElementById('bottom-area').innerHTML = `<button id="btn-next" class="btn btn-primary btn-wide btn-lg">次へ</button>`;
  await waitClick(document.getElementById('btn-next'));
}

// ---------- Step 3: Dictation (tap-to-reorder, typed mode optional) ----------
async function runDictationStep(root, opts, result) {
  const all = await loadDictation();
  const statsRows = await getAll('itemStats');
  const statsByKey = statsMapByKey(statsRows);
  const queue = pickItems(all, statsByKey, 'dictation', 3);

  for (let i = 0; i < queue.length; i++) {
    await showDictationItem(root, queue[i], i, queue.length, opts, result);
  }
}

async function showDictationItem(root, item, idx, total, opts, result) {
  const correctWords = item.en.split(/\s+/);
  const shuffled = shuffle([...correctWords]);
  const picked = [];
  let replayCount = 0;

  function renderTapMode() {
    root.innerHTML = `
      ${stepHeader(2)}
      <div class="hint">${idx + 1} / ${total}</div>
      <div class="audio-indicator" style="text-align:center;">🔊</div>
      <div class="answer-strip" id="answer-strip"></div>
      <div class="chip-row" id="chip-row"></div>
      <p class="hint" id="type-toggle-hint" style="margin-top:14px;"><a href="#" id="link-type-mode">キーボード入力に切り替える</a></p>
      <div class="bottom-bar" id="bottom-area">
        <button class="btn btn-ghost" id="btn-replay">🔁 もう一度聴く</button>
        <button class="btn btn-primary" id="btn-submit" disabled>答え合わせ</button>
      </div>
    `;
    renderChips();
    document.getElementById('link-type-mode').addEventListener('click', (e) => {
      e.preventDefault();
      renderTypeMode();
    });
    document.getElementById('btn-submit').addEventListener('click', onSubmitTap);
    wireReplay();
  }

  function renderChips() {
    const chipRow = document.getElementById('chip-row');
    const strip = document.getElementById('answer-strip');
    chipRow.innerHTML = shuffled
      .map((w, i) => `<button class="chip" data-i="${i}" ${picked.includes(i) ? 'disabled' : ''}>${escapeHtml(w)}</button>`)
      .join('');
    strip.innerHTML = picked
      .map((i, pos) => `<button class="chip" data-pos="${pos}">${escapeHtml(shuffled[i])}</button>`)
      .join('');
    chipRow.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.i, 10);
        if (!picked.includes(i)) picked.push(i);
        renderChips();
        document.getElementById('btn-submit').disabled = picked.length !== shuffled.length;
      });
    });
    strip.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pos = parseInt(btn.dataset.pos, 10);
        picked.splice(pos, 1);
        renderChips();
        document.getElementById('btn-submit').disabled = picked.length !== shuffled.length;
      });
    });
  }

  function renderTypeMode() {
    root.innerHTML = `
      ${stepHeader(2)}
      <div class="hint">${idx + 1} / ${total}</div>
      <div class="audio-indicator" style="text-align:center;">🔊</div>
      <textarea id="type-input" class="text-input" rows="3" placeholder="聞いた英文を入力"></textarea>
      <p class="hint" style="margin-top:14px;"><a href="#" id="link-tap-mode">タップ並べ替えに戻す</a></p>
      <div class="bottom-bar" id="bottom-area">
        <button class="btn btn-ghost" id="btn-replay">🔁 もう一度聴く</button>
        <button class="btn btn-primary" id="btn-submit">答え合わせ</button>
      </div>
    `;
    document.getElementById('link-tap-mode').addEventListener('click', (e) => {
      e.preventDefault();
      renderTapMode();
    });
    document.getElementById('btn-submit').addEventListener('click', onSubmitType);
    wireReplay();
  }

  function wireReplay() {
    document.getElementById('btn-replay').addEventListener('click', () => {
      replayCount += 1;
      cancelSpeech();
      speak(item.en, { lang: opts.accent, rate: opts.rate }).catch(() => {});
    });
  }

  let resolveStep;
  const done = new Promise((resolve) => {
    resolveStep = resolve;
  });

  async function finish(userAnswerText) {
    cancelSpeech();
    const normalize = (s) => s.toLowerCase().replace(/[.,!?]/g, '').trim();
    const isCorrect = normalize(userAnswerText) === normalize(item.en);
    await recordItemStat('dictation', item.id, isCorrect, replayCount);
    result.dictation.total += 1;
    if (isCorrect) result.dictation.correct += 1;
    else result.wrongItems.push({ type: 'dictation', id: item.id, en: item.en, ja: item.ja });

    const correctWordsForTap = item.en.split(/\s+/);
    root.innerHTML = `
      ${stepHeader(2)}
      <div class="card" style="text-align:left;">
        <p style="color:${isCorrect ? 'var(--good)' : 'var(--bad)'}; font-weight:600;">${isCorrect ? '正解' : '不正解'}</p>
        <p><strong>正しい文:</strong></p>
        <div class="chip-row" id="unknown-row">
          ${correctWordsForTap.map((w, i) => `<button class="chip" data-w="${i}">${escapeHtml(w)}</button>`).join('')}
        </div>
        <p class="hint" style="margin-top:10px;">聞き取れなかった単語があればタップして記録できます。</p>
        <p class="hint" style="margin-top:14px;">${escapeHtml(item.ja)}</p>
      </div>
      <div class="bottom-bar">
        <button id="btn-next" class="btn btn-primary btn-wide btn-lg">次へ</button>
      </div>
    `;
    const unknown = new Set();
    document.querySelectorAll('#unknown-row .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = btn.dataset.w;
        if (unknown.has(i)) {
          unknown.delete(i);
          btn.classList.remove('unknown-marked');
        } else {
          unknown.add(i);
          btn.classList.add('unknown-marked');
        }
      });
    });
    document.getElementById('btn-next').addEventListener('click', async () => {
      if (unknown.size) {
        const words = [...unknown].map((i) => correctWordsForTap[parseInt(i, 10)]);
        await recordUnknownWords(item.id, words);
      }
      resolveStep();
    });
  }

  function onSubmitTap() {
    finish(picked.map((i) => shuffled[i]).join(' '));
  }
  function onSubmitType() {
    finish(document.getElementById('type-input').value);
  }

  if (opts.dictationMode === 'type') renderTypeMode();
  else renderTapMode();
  speak(item.en, { lang: opts.accent, rate: opts.rate }).catch(() => {});

  await done;
}

// ---------- Step 4: Part 5 (fill-in-the-blank, 20s timer) ----------
async function runPart5Step(root, opts, result) {
  const all = await loadPart5();
  const statsRows = await getAll('itemStats');
  const statsByKey = statsMapByKey(statsRows);
  const queue = pickItems(all, statsByKey, 'part5', 5);

  for (let i = 0; i < queue.length; i++) {
    await showPart5Item(root, queue[i], i, queue.length, result);
  }
}

async function showPart5Item(root, item, idx, total, result) {
  const LETTERS = ['A', 'B', 'C', 'D'];
  root.innerHTML = `
    ${stepHeader(3)}
    <div class="hint">${idx + 1} / ${total}</div>
    <div class="timer-bar-outer"><div class="timer-bar-inner" id="timer-bar" style="width:100%"></div></div>
    <div class="card"><p style="font-size:18px;">${escapeHtml(item.sentence)}</p></div>
    <div class="choice-grid" id="choice-grid">
      ${item.choices.map((c, i) => `<button class="choice-btn" data-i="${i}">${LETTERS[i]}. ${escapeHtml(c)}</button>`).join('')}
    </div>
  `;

  let answered = false;
  let timerId = null;
  let settle = null;
  const DURATION_MS = 20000;
  const startedAt = Date.now();

  function tick() {
    const elapsed = Date.now() - startedAt;
    const remainRatio = Math.max(0, 1 - elapsed / DURATION_MS);
    const bar = document.getElementById('timer-bar');
    if (bar) {
      bar.style.width = `${remainRatio * 100}%`;
      bar.classList.toggle('warn', remainRatio < 0.3);
    }
    if (elapsed >= DURATION_MS && !answered && settle) {
      settle(-1);
    }
  }

  const chosenIdx = await new Promise((resolve) => {
    settle = resolve;
    timerId = setInterval(tick, 150);
    document.querySelectorAll('#choice-grid [data-i]').forEach((btn) => {
      btn.addEventListener('click', () => resolve(parseInt(btn.dataset.i, 10)), { once: true });
    });
  });

  answered = true;
  clearInterval(timerId);

  const isCorrect = chosenIdx === item.answer;
  await recordItemStat('part5', item.id, isCorrect);
  result.part5.total += 1;
  if (isCorrect) result.part5.correct += 1;
  else
    result.wrongItems.push({
      type: 'part5',
      id: item.id,
      en: item.sentence,
      ja: item.ja,
      explanation: item.explanation,
    });

  document.querySelectorAll('#choice-grid [data-i]').forEach((btn) => {
    const i = parseInt(btn.dataset.i, 10);
    btn.disabled = true;
    if (i === item.answer) btn.classList.add('correct');
    else if (i === chosenIdx) btn.classList.add('incorrect');
  });

  root.insertAdjacentHTML(
    'beforeend',
    `<div class="card" style="text-align:left;">
      <p class="pill">${item.type === 'grammar' ? '文法' : '語彙'}</p>
      <p style="margin-top:8px;">${escapeHtml(item.ja)}</p>
      <p class="hint">${escapeHtml(item.explanation)}</p>
    </div>
    <div class="bottom-bar"><button id="btn-next" class="btn btn-primary btn-wide btn-lg">次へ</button></div>`
  );
  await waitClick(document.getElementById('btn-next'));
}

// ---------- shared helpers ----------
async function recordItemStat(type, itemId, isCorrect, replayCount = 0) {
  const key = `${type}:${itemId}`;
  const existing = await get('itemStats', key);
  const row = existing || { key, type, itemId, wrongCount: 0, shownCount: 0, replayCount: 0, unknownWords: [] };
  row.shownCount += 1;
  row.replayCount = (row.replayCount || 0) + replayCount;
  if (!isCorrect) row.wrongCount += 1;
  row.lastShown = Date.now();
  await put('itemStats', row);
}

async function recordUnknownWords(itemId, words) {
  const key = `dictation:${itemId}`;
  const existing = await get('itemStats', key);
  const row = existing || { key, type: 'dictation', itemId, wrongCount: 0, shownCount: 0, unknownWords: [] };
  const set = new Set(row.unknownWords || []);
  words.forEach((w) => set.add(w));
  row.unknownWords = [...set];
  await put('itemStats', row);
}

async function updateStreak(todayStr) {
  const lastDate = await getSetting('lastStreakDate', null);
  let streak = (await getSetting('streakCount', 0)) || 0;
  if (lastDate === todayStr) {
    // already counted today
  } else {
    const yesterday = toDateStr(new Date(Date.now() - 86400000));
    streak = lastDate === yesterday ? streak + 1 : 1;
    await setSetting('streakCount', streak);
    await setSetting('lastStreakDate', todayStr);
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
