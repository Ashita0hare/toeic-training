// SM-2 spaced-repetition scheduler for vocabulary review.
// quality: 0 = again (forgot), 3 = hard, 4 = good, 5 = easy
export function sm2Update(card, quality) {
  const prev = card || { repetition: 0, interval: 0, ef: 2.5, wrongCount: 0 };
  let { repetition, interval, ef, wrongCount } = {
    repetition: prev.repetition || 0,
    interval: prev.interval || 0,
    ef: prev.ef || 2.5,
    wrongCount: prev.wrongCount || 0,
  };

  if (quality < 3) {
    repetition = 0;
    interval = 1;
    wrongCount += 1;
  } else {
    repetition += 1;
    if (repetition === 1) interval = 1;
    else if (repetition === 2) interval = 6;
    else interval = Math.round(interval * ef);
  }

  ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  const due = addDays(new Date(), interval);
  return {
    id: prev.id,
    repetition,
    interval,
    ef: Math.round(ef * 100) / 100,
    wrongCount,
    due: toDateStr(due),
    lastReviewed: toDateStr(new Date()),
  };
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

export function isDue(card, todayStr) {
  if (!card || !card.due) return true; // never studied = due now
  return card.due <= todayStr;
}
