import { get, put, getSetting, setSetting, getAll } from '../db.js';
import { loadPart6, loadPart7, loadParaphrase } from '../data.js';
import { pickItems, statsMapByKey } from '../picker.js';

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

async function getFontSizeClass() {
  const size = (await getSetting('readingFontSize', 'medium')) || 'medium';
  return `reading-font-${size}`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stepHeader(stepNames, stepIndex, subLabel) {
  const dots = stepNames
    .map((_, i) => {
      const cls = i < stepIndex ? 'done' : i === stepIndex ? 'active' : '';
      return `<span class="${cls}"></span>`;
    })
    .join('');
  return `
    <div class="progress-dots">${dots}</div>
    <div class="step-label">ステップ ${stepIndex + 1}/${stepNames.length}：${stepNames[stepIndex]}${subLabel ? '　' + subLabel : ''}</div>
  `;
}

function fontSizeControls(current) {
  return `
    <div class="font-size-row">
      <button class="font-size-btn ${current === 'small' ? 'active' : ''}" data-size="small">文字小</button>
      <button class="font-size-btn ${current === 'medium' ? 'active' : ''}" data-size="medium">文字中</button>
      <button class="font-size-btn ${current === 'large' ? 'active' : ''}" data-size="large">文字大</button>
    </div>
  `;
}

function wireFontSizeControls(root, onChange) {
  const buttons = root.querySelectorAll('.font-size-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const size = btn.dataset.size;
      await setSetting('readingFontSize', size);
      buttons.forEach((b) => b.classList.toggle('active', b.dataset.size === size));
      onChange(size);
    });
  });
}

// =========================================================
// Part 6: long-passage fill-in-the-blank (segments + 4 blanks)
// =========================================================
export async function runPart6Step(root, result, count = 1, stepNames = ['Part6'], stepIndex = 0) {
  const all = await loadPart6();
  const statsByKey = statsMapByKey(await getAll('itemStats'));
  const queue = pickItems(all, statsByKey, 'part6', count);
  if (!result.part6) result.part6 = { correct: 0, total: 0, answerTimesMs: [] };

  for (let i = 0; i < queue.length; i++) {
    await showPart6Set(root, queue[i], i, queue.length, result, stepNames, stepIndex);
  }
}

function renderPassageFromSegments(set, answered) {
  return set.segments
    .map((seg) => {
      if (seg.type === 'text') return escapeHtml(seg.en).replace(/\n/g, '<br>');
      const a = answered[seg.num];
      if (!a) return `<span class="blank-badge pending">[${seg.num}]</span>`;
      const cls = a.isCorrect ? 'blank-badge correct' : 'blank-badge incorrect';
      return `<span class="${cls}">${escapeHtml(a.text)}</span>`;
    })
    .join('');
}

async function showPart6Set(root, set, idx, total, result, stepNames, stepIndex) {
  const fontClass = await getFontSizeClass();
  const answered = {};
  const blanks = set.segments.filter((s) => s.type === 'blank');

  for (let bi = 0; bi < blanks.length; bi++) {
    const blankNum = blanks[bi].num;
    const q = set.questions.find((x) => x.num === blankNum);
    const LETTERS = ['A', 'B', 'C', 'D'];

    root.innerHTML = `
      ${stepHeader(stepNames, stepIndex, `${idx + 1}/${total}セット・空欄${bi + 1}/${blanks.length}`)}
      ${fontSizeControls((await getSetting('readingFontSize', 'medium')) || 'medium')}
      <div class="card reading-passage ${fontClass}" id="passage-card">${renderPassageFromSegments(set, answered)}</div>
      <div class="choice-grid" id="choice-grid">
        ${q.choices.map((c, i) => `<button class="choice-btn" data-i="${i}">${LETTERS[i]}. ${escapeHtml(c)}</button>`).join('')}
      </div>
    `;
    wireFontSizeControls(root, (size) => {
      document.getElementById('passage-card').className = `card reading-passage reading-font-${size}`;
    });

    const startedAt = Date.now();
    const chosenIdx = await new Promise((resolve) => {
      document.querySelectorAll('#choice-grid [data-i]').forEach((btn) => {
        btn.addEventListener('click', () => resolve(parseInt(btn.dataset.i, 10)), { once: true });
      });
    });
    const elapsedMs = Date.now() - startedAt;
    const isCorrect = chosenIdx === q.answer;
    answered[blankNum] = { text: q.choices[chosenIdx], isCorrect };

    result.part6.total += 1;
    result.part6.answerTimesMs.push(elapsedMs);
    if (isCorrect) result.part6.correct += 1;

    document.querySelectorAll('#choice-grid [data-i]').forEach((btn) => {
      const i = parseInt(btn.dataset.i, 10);
      btn.disabled = true;
      if (i === q.answer) btn.classList.add('correct');
      else if (i === chosenIdx) btn.classList.add('incorrect');
    });
    document.getElementById('passage-card').innerHTML = renderPassageFromSegments(set, answered);

    root.insertAdjacentHTML(
      'beforeend',
      `<div class="card" style="text-align:left;">
        <p class="pill">${q.type === 'sentence-insertion' ? '文挿入' : q.type === 'grammar' ? '文法' : '語彙'}</p>
        <p style="margin-top:8px;">${escapeHtml(q.ja)}</p>
        <p class="hint">${escapeHtml(q.explanation)}</p>
      </div>
      <div class="bottom-bar"><button id="btn-next" class="btn btn-primary btn-wide btn-lg">次へ</button></div>`
    );
    await waitClick(document.getElementById('btn-next'));

    if (!isCorrect) {
      result.wrongItems.push({ type: 'part6', id: `${set.id}#${blankNum}`, en: q.choices[q.answer], ja: q.ja, explanation: q.explanation });
    }
  }
  await recordItemStat('part6', set.id, Object.values(answered).every((a) => a.isCorrect));
}

// =========================================================
// Part 7: single-passage reading comprehension
// =========================================================
export async function runPart7Step(root, result, targetQuestions = 4, maxDocs = 2, stepNames = ['Part7'], stepIndex = 0) {
  const all = await loadPart7();
  const statsByKey = statsMapByKey(await getAll('itemStats'));
  const candidates = pickItems(all, statsByKey, 'part7', Math.min(all.length, maxDocs * 3));

  const picked = [];
  let totalQ = 0;
  for (const doc of candidates) {
    if (picked.length >= maxDocs || totalQ >= targetQuestions) break;
    picked.push(doc);
    totalQ += doc.questions.length;
  }
  if (!result.part7) result.part7 = { correct: 0, total: 0, answerTimesMs: [], wpmSamples: [] };

  for (let i = 0; i < picked.length; i++) {
    await showPart7Doc(root, picked[i], i, picked.length, result, stepNames, stepIndex);
  }
}

function docTypeLabel(t) {
  return { chat: 'チャット', email: 'メール', notice: 'お知らせ', advertisement: '広告', article: '記事' }[t] || t;
}

async function showPart7Doc(root, doc, idx, total, result, stepNames, stepIndex) {
  let fontSize = (await getSetting('readingFontSize', 'medium')) || 'medium';
  let view = 'passage'; // 'passage' | 'questions'
  const readStartedAt = Date.now();
  let docAllCorrect = true;

  function renderShell(bodyHtml) {
    root.innerHTML = `
      ${stepHeader(stepNames, stepIndex, `${idx + 1}/${total}　${docTypeLabel(doc.docType)}`)}
      <div class="tab-row">
        <button class="tab-btn ${view === 'passage' ? 'active' : ''}" id="tab-passage">本文</button>
        <button class="tab-btn ${view === 'questions' ? 'active' : ''}" id="tab-questions">設問へ</button>
      </div>
      ${bodyHtml}
    `;
    document.getElementById('tab-passage').addEventListener('click', () => {
      view = 'passage';
      renderPassageView();
    });
    document.getElementById('tab-questions').addEventListener('click', () => {
      view = 'questions';
      proceedToQuestions();
    });
  }

  function renderPassageView(evidenceText) {
    const bodyText = evidenceText ? highlightEvidence(doc.passage, evidenceText) : escapeHtml(doc.passage).replace(/\n/g, '<br>');
    renderShell(`
      ${fontSizeControls(fontSize)}
      <div class="card reading-passage reading-font-${fontSize}" id="passage-card">${bodyText}</div>
      <div class="bottom-bar"><button id="btn-to-q" class="btn btn-primary btn-wide btn-lg">設問へ進む</button></div>
    `);
    wireFontSizeControls(root, (size) => {
      fontSize = size;
      document.getElementById('passage-card').className = `card reading-passage reading-font-${fontSize}`;
    });
    document.getElementById('btn-to-q').addEventListener('click', () => proceedToQuestions());
  }

  function highlightEvidence(passage, evidence) {
    const idx2 = passage.indexOf(evidence);
    if (idx2 === -1) return escapeHtml(passage).replace(/\n/g, '<br>');
    const before = passage.slice(0, idx2);
    const match = passage.slice(idx2, idx2 + evidence.length);
    const after = passage.slice(idx2 + evidence.length);
    return (escapeHtml(before) + `<mark class="evidence-mark">${escapeHtml(match)}</mark>` + escapeHtml(after)).replace(/\n/g, '<br>');
  }

  let proceeded = false;
  let resolveProceed;
  const proceedPromise = new Promise((resolve) => {
    resolveProceed = resolve;
  });
  function proceedToQuestions() {
    if (proceeded) return;
    proceeded = true;
    resolveProceed();
  }

  renderPassageView();
  await proceedPromise;

  const readSeconds = Math.max(1, (Date.now() - readStartedAt) / 1000);
  const wpm = Math.round((doc.wordCount || doc.passage.split(/\s+/).length) / (readSeconds / 60));
  result.part7.wpmSamples.push(wpm);

  for (let qi = 0; qi < doc.questions.length; qi++) {
    const q = doc.questions[qi];
    const LETTERS = ['A', 'B', 'C', 'D'];
    let qView = 'questions';

    function renderPassageRevisit() {
      root.innerHTML = `
        ${stepHeader(stepNames, stepIndex, `${idx + 1}/${total}　設問${qi + 1}/${doc.questions.length}`)}
        ${fontSizeControls(fontSize)}
        <div class="card reading-passage reading-font-${fontSize}" id="passage-card">${escapeHtml(doc.passage).replace(/\n/g, '<br>')}</div>
        <div class="bottom-bar"><button id="btn-back-to-q" class="btn btn-primary btn-wide btn-lg">質問に戻る</button></div>
      `;
      wireFontSizeControls(root, (size) => {
        fontSize = size;
        document.getElementById('passage-card').className = `card reading-passage reading-font-${fontSize}`;
      });
      document.getElementById('btn-back-to-q').addEventListener('click', () => renderQuestionShell());
    }

    function renderQuestionShell() {
      root.innerHTML = `
        ${stepHeader(stepNames, stepIndex, `${idx + 1}/${total}　設問${qi + 1}/${doc.questions.length}`)}
        <div class="tab-row">
          <button class="tab-btn" id="tab-passage-q">本文を見る</button>
          <button class="tab-btn active" id="tab-questions-q">設問</button>
        </div>
        <p class="pill">${q.qType}</p>
        <div class="card"><p style="font-size:17px; margin-top:8px;">${escapeHtml(q.q)}</p></div>
        <div class="choice-grid" id="choice-grid">
          ${q.choices.map((c, i) => `<button class="choice-btn" data-i="${i}">${LETTERS[i]}. ${escapeHtml(c)}</button>`).join('')}
        </div>
      `;
      document.getElementById('tab-passage-q').addEventListener('click', () => {
        renderPassageRevisit();
      });
    }
    renderQuestionShell();

    const startedAt = Date.now();
    const chosenIdx = await new Promise((resolve) => {
      document.querySelectorAll('#choice-grid [data-i]').forEach((btn) => {
        btn.addEventListener('click', () => resolve(parseInt(btn.dataset.i, 10)), { once: true });
      });
    });
    const elapsedMs = Date.now() - startedAt;
    const isCorrect = chosenIdx === q.answer;
    if (!isCorrect) docAllCorrect = false;
    result.part7.total += 1;
    result.part7.answerTimesMs.push(elapsedMs);
    if (isCorrect) result.part7.correct += 1;
    else result.wrongItems.push({ type: 'part7', id: `${doc.id}#${qi}`, en: q.q, ja: q.ja, explanation: q.explanation });

    document.querySelectorAll('#choice-grid [data-i]').forEach((btn) => {
      const i = parseInt(btn.dataset.i, 10);
      btn.disabled = true;
      if (i === q.answer) btn.classList.add('correct');
      else if (i === chosenIdx) btn.classList.add('incorrect');
    });

    function renderReveal() {
      root.innerHTML = `
        ${stepHeader(stepNames, stepIndex, `${idx + 1}/${total}　設問${qi + 1}/${doc.questions.length}`)}
        <p class="pill">${q.qType}</p>
        <div class="card"><p style="font-size:17px; margin-top:8px;">${escapeHtml(q.q)}</p></div>
        <div class="choice-grid">
          ${q.choices
            .map((c, i) => {
              const cls = i === q.answer ? 'correct' : i === chosenIdx ? 'incorrect' : '';
              return `<button class="choice-btn ${cls}" disabled>${LETTERS[i]}. ${escapeHtml(c)}</button>`;
            })
            .join('')}
        </div>
        <div class="card" style="text-align:left;">
          <p>${escapeHtml(q.ja)}</p>
          <p class="hint">${escapeHtml(q.explanation)}</p>
          <p class="hint"><a href="#" id="link-evidence">根拠箇所を本文で見る</a></p>
        </div>
        <div class="bottom-bar"><button id="btn-next-q" class="btn btn-primary btn-wide btn-lg">次へ</button></div>
      `;
      document.getElementById('link-evidence').addEventListener('click', (e) => {
        e.preventDefault();
        renderEvidenceRevisit();
      });
      document.getElementById('btn-next-q').addEventListener('click', () => resolveNext());
    }

    function renderEvidenceRevisit() {
      root.innerHTML = `
        ${stepHeader(stepNames, stepIndex, `${idx + 1}/${total}　設問${qi + 1}/${doc.questions.length}`)}
        ${fontSizeControls(fontSize)}
        <div class="card reading-passage reading-font-${fontSize}" id="passage-card">${highlightEvidence(doc.passage, q.evidence)}</div>
        <div class="bottom-bar"><button id="btn-back-to-reveal" class="btn btn-primary btn-wide btn-lg">解説に戻る</button></div>
      `;
      wireFontSizeControls(root, (size) => {
        fontSize = size;
        document.getElementById('passage-card').className = `card reading-passage reading-font-${fontSize}`;
      });
      document.getElementById('btn-back-to-reveal').addEventListener('click', () => renderReveal());
    }

    let resolveNext;
    const nextPromise = new Promise((resolve) => {
      resolveNext = resolve;
    });
    renderReveal();
    await nextPromise;
  }

  await recordItemStat('part7', doc.id, docAllCorrect);
}

// =========================================================
// Paraphrase drill (highlighted phrase -> closest-meaning choice)
// =========================================================
export async function runParaphraseStep(root, result, count = 5, stepNames = ['言い換え'], stepIndex = 0) {
  const all = await loadParaphrase();
  const statsByKey = statsMapByKey(await getAll('itemStats'));
  const queue = pickItems(all, statsByKey, 'paraphrase', count);
  if (!result.paraphrase) result.paraphrase = { correct: 0, total: 0, answerTimesMs: [] };

  for (let i = 0; i < queue.length; i++) {
    await showParaphraseItem(root, queue[i], i, queue.length, result, stepNames, stepIndex);
  }
}

function highlightInSentence(sentence, phrase) {
  const idx = sentence.indexOf(phrase);
  if (idx === -1) return escapeHtml(sentence);
  const before = sentence.slice(0, idx);
  const match = sentence.slice(idx, idx + phrase.length);
  const after = sentence.slice(idx + phrase.length);
  return escapeHtml(before) + `<mark class="evidence-mark">${escapeHtml(match)}</mark>` + escapeHtml(after);
}

async function showParaphraseItem(root, item, idx, total, result, stepNames, stepIndex) {
  root.innerHTML = `
    ${stepHeader(stepNames, stepIndex, `${idx + 1}/${total}`)}
    <div class="card"><p style="font-size:17px;">${highlightInSentence(item.original, item.highlight)}</p></div>
    <p class="hint" style="padding:0 2px;">ハイライト部分の言い換えとして最も適切なものを選んでください。</p>
    <div class="choice-grid" id="choice-grid">
      ${item.choices.map((c, i) => `<button class="choice-btn" data-i="${i}">${escapeHtml(c)}</button>`).join('')}
    </div>
  `;

  const startedAt = Date.now();
  const chosenIdx = await new Promise((resolve) => {
    document.querySelectorAll('#choice-grid [data-i]').forEach((btn) => {
      btn.addEventListener('click', () => resolve(parseInt(btn.dataset.i, 10)), { once: true });
    });
  });
  const elapsedMs = Date.now() - startedAt;
  const isCorrect = chosenIdx === item.answer;
  result.paraphrase.total += 1;
  result.paraphrase.answerTimesMs.push(elapsedMs);
  if (isCorrect) result.paraphrase.correct += 1;
  else result.wrongItems.push({ type: 'paraphrase', id: item.id, en: item.original, ja: item.ja, explanation: item.explanation });
  await recordItemStat('paraphrase', item.id, isCorrect);

  document.querySelectorAll('#choice-grid [data-i]').forEach((btn) => {
    const i = parseInt(btn.dataset.i, 10);
    btn.disabled = true;
    if (i === item.answer) btn.classList.add('correct');
    else if (i === chosenIdx) btn.classList.add('incorrect');
  });

  root.insertAdjacentHTML(
    'beforeend',
    `<div class="card" style="text-align:left;">
      <p>${escapeHtml(item.ja)}</p>
      <p class="hint">${escapeHtml(item.explanation)}</p>
    </div>
    <div class="bottom-bar"><button id="btn-next" class="btn btn-primary btn-wide btn-lg">次へ</button></div>`
  );
  await waitClick(document.getElementById('btn-next'));
}
