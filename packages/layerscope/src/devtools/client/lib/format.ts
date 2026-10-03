export function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `14:02:31` in local time. */
export function clock(time: number): string {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function duration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function location(file: string, line: number, column: number): string {
  return `${file}:${line}:${column}`;
}

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** `3 Oct 2026, 14:02` in local time: when a snapshot was taken. */
export function dateTime(time: number): string {
  return DATE_TIME.format(time);
}
