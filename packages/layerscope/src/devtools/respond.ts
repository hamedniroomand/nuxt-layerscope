import type { H3Event } from 'h3';
import { getHeader, setResponseHeader, setResponseStatus } from 'h3';

import type { Snapshot } from './analyzer.ts';
import type { ReportResponse, SnapshotMeta } from './protocol.ts';
import { tabReport } from './report.ts';
import type { Session } from './session.ts';

const JSON_TYPE = 'application/json';

export function json(event: H3Event, status: number, body: unknown): string {
  setResponseStatus(event, status);
  setResponseHeader(event, 'content-type', JSON_TYPE);
  return JSON.stringify(body);
}

/** Sets the ETag and answers `true` when the client already has this version. */
export function notModified(event: H3Event, etag: string): boolean {
  setResponseHeader(event, 'etag', etag);
  if (getHeader(event, 'if-none-match') !== etag) {
    return false;
  }
  setResponseStatus(event, 304);
  return true;
}

export function meta(snapshot: Snapshot, session: Session): SnapshotMeta {
  const { id, rev, analyzedAt, durationMs } = snapshot;
  return { id, rev, marker: session.live.marker, analyzedAt, durationMs };
}

export async function withReport(snapshot: Snapshot, session: Session): Promise<ReportResponse> {
  const report = await tabReport(snapshot.result, session.live.keysOf(snapshot));
  return { ...meta(snapshot, session), report };
}
