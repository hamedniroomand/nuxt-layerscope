import type { H3Event } from 'h3';
import { readBody } from 'h3';

import { surplusKeyOf } from '#src/baseline/index.ts';
import type { AnalyzeResult } from '#src/types.ts';

import { hasToken } from './csrf.ts';
import { findingKey } from './finding-keys.ts';
import { json, withReport } from './respond.ts';
import { isSameOrigin } from './same-origin.ts';
import type { Session } from './session.ts';

export const BASELINE_WRITES = new Set([
  '/api/baseline/ignore',
  '/api/baseline/remove',
  '/api/baseline/undo',
]);

interface Reply {
  status: number;
  body: object;
}

interface EditBody {
  id: string;
  rev: number;
  keys: string[];
}

interface UndoBody {
  id: string;
  writeId: number;
}

function isEdit(body: Partial<EditBody> | null): body is EditBody {
  return (
    typeof body?.id === 'string' &&
    typeof body.rev === 'number' &&
    Array.isArray(body.keys) &&
    body.keys.length > 0 &&
    body.keys.every(key => typeof key === 'string')
  );
}

function isUndo(body: Partial<UndoBody> | null): body is UndoBody {
  return typeof body?.id === 'string' && typeof body.writeId === 'number';
}

/** Keys a request may name: findings for ignore; suppressed findings and stale entries for remove. */
function knownKeys(result: AnalyzeResult, path: string): Set<string> {
  const suppressed = result.baseline?.suppressed ?? [];
  const keyed = (list: AnalyzeResult['findings']): string[] =>
    list.map(finding => findingKey(finding, result.rootDir));
  if (path === '/api/baseline/ignore') {
    return new Set(keyed([...result.findings, ...suppressed]));
  }
  return new Set([
    ...keyed(suppressed),
    ...(result.baseline?.removable ?? []).map(entry => surplusKeyOf(entry)),
  ]);
}

async function edit(path: string, body: EditBody, session: Session): Promise<Reply> {
  const { analyzer, writes } = session;
  // A config edit can name another baseline file. A run in flight can have the old config, so a
  // change needs a new run. The rev check below then refuses a request whose findings changed.
  const changed = await analyzer.invalidateIfChanged();
  const snapshot = changed ? await analyzer.refresh() : await analyzer.get();
  if (body.id !== snapshot.id || body.rev !== snapshot.rev) {
    return {
      status: 409,
      body: { error: 'The findings changed', id: snapshot.id, rev: snapshot.rev },
    };
  }
  const known = knownKeys(snapshot.result, path);
  const unknown = body.keys.filter(key => !known.has(key));
  if (unknown.length > 0) {
    return { status: 400, body: { error: 'Unknown finding keys', keys: unknown } };
  }
  const { ignoreFindings, removeEntries } = await import('#src/baseline/edit.ts');
  // The config can change while the analysis runs. Then the snapshot can name an old baseline file.
  if (await analyzer.invalidateIfChanged()) {
    return {
      status: 409,
      body: { error: 'The findings changed', id: snapshot.id, rev: snapshot.rev },
    };
  }
  const { result } = snapshot;
  const file = analyzer.baselineFileOf(result);
  const all = [...result.findings, ...(result.baseline?.suppressed ?? [])];
  const change =
    path === '/api/baseline/ignore'
      ? ignoreFindings(file, body.keys, all, result.rootDir)
      : removeEntries(
          file,
          body.keys,
          new Map(
            (result.baseline?.removable ?? []).map(entry => [
              surplusKeyOf(entry),
              entry.count ?? 1,
            ]),
          ),
        );
  const writeId = writes.record(file, change.before);
  const next = await analyzer.rebaseline();
  return { status: 200, body: { ...(await withReport(next, session)), writeId } };
}

async function undo(body: UndoBody, session: Session): Promise<Reply> {
  const { analyzer, writes } = session;
  const snapshot = analyzer.current ?? (await analyzer.get());
  const last = writes.undoable(body.writeId);
  if (body.id !== snapshot.id || last === undefined) {
    return {
      status: 409,
      body: {
        error: 'Nothing to undo',
        id: snapshot.id,
        rev: snapshot.rev,
        writeId: writes.latest,
      },
    };
  }
  const { restoreBaseline } = await import('#src/baseline/edit.ts');
  restoreBaseline(last.file, last.before);
  writes.forget();
  const next = await analyzer.rebaseline();
  return { status: 200, body: { ...(await withReport(next, session)), writeId: writes.latest } };
}

/**
 * `POST /api/baseline/{ignore,remove,undo}`: the only routes that write a file. Checks run in a
 * fixed order: method, origin, token, body, then (inside the write queue) revision and keys.
 */
export async function baselineWrite(
  event: H3Event,
  path: string,
  session: Session,
): Promise<string> {
  if (event.method !== 'POST') {
    return json(event, 405, { error: 'Use POST' });
  }
  if (!isSameOrigin(event) || !hasToken(event, session.token)) {
    return json(event, 403, { error: 'Refused: the request did not come from this tab' });
  }
  const body = (await readBody(event).catch(() => null)) as Partial<EditBody & UndoBody> | null;
  const valid = path === '/api/baseline/undo' ? isUndo(body) : isEdit(body);
  if (!valid || body === null) {
    return json(event, 400, { error: 'Invalid request body' });
  }
  // The revision check runs in the queue, so it sees every write queued before this one.
  const reply = await session.writes.run(async () => {
    const done =
      path === '/api/baseline/undo'
        ? await undo(body as UndoBody, session)
        : await edit(path, body as EditBody, session);
    return done;
  });
  return json(event, reply.status, reply.body);
}
