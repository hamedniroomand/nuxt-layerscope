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
