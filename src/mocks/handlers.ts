import { delay, http, HttpResponse } from 'msw';
import { DEFAULT_GAME_SETTINGS } from '../game/config';
import type { MatchRecord, NetworkScenario, PaginatedRecords } from '../records/types';
import { CONFIRMED_RECORDS_KEY, NETWORK_SCENARIO_KEY } from '../records/storage';
import { configKey } from '../api/records';

const validScenarios: NetworkScenario[] = ['normal', 'slow', 'slow-variable', 'out-of-order', 'empty', 'connection-error', 'client-error', 'ranking-error', 'history-error', 'submit-error', 'submit-timeout'];
const fixtureRecords: MatchRecord[] = Array.from({ length: 15 }, (_, index) => ({
  matchId: `fixture-${index + 1}`,
  playerId: `captain-fixture-${(index % 7) + 1}`,
  playerName: ['Blackbeard', 'Anne Bonny', 'Calico Jack', 'Mary Read', 'Long John', 'Silver Tide', 'Red Sails'][index % 7],
  createdAt: new Date(Date.UTC(2026, 0, 20 - index, 12 - (index % 8))).toISOString(),
  score: 23 - index,
  durationSeconds: 60 + index * 4,
  endReason: index % 3 === 0 ? 'time' : 'player-destroyed',
  settings: { ...DEFAULT_GAME_SETTINGS },
  phaseReached: (index < 3 ? 3 : index < 9 ? 2 : 1),
}));

function readConfirmedRecords(): MatchRecord[] {
  try {
    const value = localStorage.getItem(CONFIRMED_RECORDS_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed as MatchRecord[] : [];
  } catch {
    return [];
  }
}

function writeConfirmedRecords(records: MatchRecord[]) {
  localStorage.setItem(CONFIRMED_RECORDS_KEY, JSON.stringify(records));
}

function readScenario(): NetworkScenario {
  const value = localStorage.getItem(NETWORK_SCENARIO_KEY) as NetworkScenario | null;
  return value && validScenarios.includes(value) ? value : 'normal';
}

async function scenarioDelay(request: Request) {
  const scenario = readScenario();
  if (scenario === 'slow') await delay(1400);
  if (scenario === 'slow-variable') {
    const seed = localStorage.getItem('pirate-battle-test-seed-v1') ?? '2026';
    const input = `${seed}:${new URL(request.url).pathname}:${new URL(request.url).search}`;
    const hash = Array.from(input).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
    await delay([350, 850, 1450][hash % 3]);
  }
}

function pageRecords<T>(records: T[], page: number, pageSize: number): PaginatedRecords<T> {
  const totalItems = records.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.max(1, Math.min(totalPages, page));
  return { items: records.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, pageSize, totalItems, totalPages };
}

export const handlers = [
  http.get('/api/ranking', async ({ request }) => {
    const scenario = readScenario();
    if (scenario === 'connection-error') return HttpResponse.error();
    if (scenario === 'client-error') return HttpResponse.json({ message: 'The ranking query is invalid.' }, { status: 400 });
    if (scenario === 'ranking-error') return HttpResponse.json({ message: 'The ranking service is temporarily unavailable.' }, { status: 503 });
    await scenarioDelay(request);
    const query = new URL(request.url).searchParams;
    const page = Math.max(1, Number(query.get('page')) || 1);
    const pageSize = Math.max(1, Math.min(20, Number(query.get('pageSize')) || 6));
    if (scenario === 'out-of-order') await delay(page === 1 ? 1_500 : 100);
    const settings = {
      sessionTimeSeconds: Number(query.get('sessionTimeSeconds')) || DEFAULT_GAME_SETTINGS.sessionTimeSeconds,
      enemySpawnIntervalSeconds: Number(query.get('enemySpawnIntervalSeconds')) || DEFAULT_GAME_SETTINGS.enemySpawnIntervalSeconds,
    };
    const records = scenario === 'empty' ? [] : [...fixtureRecords, ...readConfirmedRecords()]
      .filter((record) => configKey(record.settings) === configKey(settings))
      .sort((first, second) => second.score - first.score
        || first.createdAt.localeCompare(second.createdAt)
        || first.matchId.localeCompare(second.matchId));
    const pageResult = pageRecords(records, page, pageSize);
    const startRank = (pageResult.page - 1) * pageResult.pageSize;
    return HttpResponse.json({ ...pageResult, items: pageResult.items.map((record, index) => ({ ...record, rank: startRank + index + 1 })) });
  }),

  http.get('/api/history', async ({ request }) => {
    const scenario = readScenario();
    if (scenario === 'connection-error') return HttpResponse.error();
    if (scenario === 'client-error') return HttpResponse.json({ message: 'The history query is invalid.' }, { status: 400 });
    if (scenario === 'history-error') return HttpResponse.json({ message: 'The match history service is temporarily unavailable.' }, { status: 503 });
    await scenarioDelay(request);
    const query = new URL(request.url).searchParams;
    const page = Math.max(1, Number(query.get('page')) || 1);
    const pageSize = Math.max(1, Math.min(20, Number(query.get('pageSize')) || 6));
    const playerId = query.get('playerId');
    const records = [...readConfirmedRecords()]
      .filter((record) => record.playerId === playerId)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt) || second.matchId.localeCompare(first.matchId));
    return HttpResponse.json(pageRecords(records, page, pageSize));
  }),

  http.post('/api/matches', async ({ request }) => {
    const scenario = readScenario();
    if (scenario === 'connection-error') return HttpResponse.error();
    if (scenario === 'client-error') return HttpResponse.json({ message: 'The match record is invalid.' }, { status: 400 });
    if (scenario === 'submit-error') return HttpResponse.json({ message: 'The match could not be submitted. Try again.' }, { status: 503 });
    const record = await request.json() as MatchRecord;
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (!record?.matchId || idempotencyKey !== record.matchId || !record.playerId || !record.playerName?.trim()
      || !Number.isFinite(record.score) || record.score < 0 || !Number.isFinite(record.durationSeconds)
      || record.durationSeconds < 0 || !Number.isFinite(Date.parse(record.createdAt))
      || !record.settings || !Number.isFinite(record.settings.sessionTimeSeconds)
      || !Number.isFinite(record.settings.enemySpawnIntervalSeconds)
      || ![1, 2, 3].includes(record.phaseReached)
      || !['time', 'player-destroyed'].includes(record.endReason)) {
      return HttpResponse.json({ message: 'Invalid match record.' }, { status: 400 });
    }
    const records = readConfirmedRecords();
    const existing = records.find((saved) => saved.matchId === record.matchId);
    if (existing) return HttpResponse.json(existing);
    records.push(record);
    writeConfirmedRecords(records);
    if (scenario === 'submit-timeout') await delay(8_500);
    else await scenarioDelay(request);
    return HttpResponse.json(record, { status: 201 });
  }),

  http.get('/api/scenario', () => HttpResponse.json({ scenario: readScenario() })),

  http.post('/api/scenario', async ({ request }) => {
    const body = await request.json() as { scenario?: NetworkScenario };
    if (!body.scenario || !validScenarios.includes(body.scenario)) {
      return HttpResponse.json({ message: 'Unknown network scenario.' }, { status: 400 });
    }
    localStorage.setItem(NETWORK_SCENARIO_KEY, body.scenario);
    return HttpResponse.json({ scenario: body.scenario });
  }),

  http.post('/api/reset', () => {
    writeConfirmedRecords([]);
    localStorage.removeItem(NETWORK_SCENARIO_KEY);
    return HttpResponse.json({ success: true });
  }),
];
