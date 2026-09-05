// Small date helpers used across the scheduling engine.
// We deliberately avoid a date library to keep the project dependency-light.

function toDateStr(date) {
  // Returns 'YYYY-MM-DD' in local time (not UTC) so "today" matches the student's day.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function diffDays(fromDate, toDate) {
  // Whole calendar days between two dates, ignoring time-of-day.
  const a = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const b = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function minutesToHHMM(totalMinutesFromMidnight) {
  const h = Math.floor(totalMinutesFromMidnight / 60) % 24;
  const m = totalMinutesFromMidnight % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

module.exports = { toDateStr, addDays, diffDays, minutesToHHMM };
