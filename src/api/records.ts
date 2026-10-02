import axios from 'axios';
import type { GameSettings } from '../game/config';
import type { MatchRecord, NetworkScenario, PaginatedRecords } from '../records/types';

const client = axios.create({ baseURL: '/api', timeout: 7000 });

export function configKey(settings: GameSettings) {
  return `${settings.sessionTimeSeconds}s-${settings.enemySpawnIntervalSeconds}s`;
}

export async function fetchRanking(settings: GameSettings, page: number, signal?: AbortSignal): Promise<PaginatedRecords<MatchRecord & { rank: number }>> {
  const response = await client.get('/ranking', {
    params: { page, pageSize: 6, sessionTimeSeconds: settings.sessionTimeSeconds, enemySpawnIntervalSeconds: settings.enemySpawnIntervalSeconds },
    signal,
  });
  return response.data as PaginatedRecords<MatchRecord & { rank: number }>;
}

export async function fetchHistory(playerId: string, page: number, signal?: AbortSignal): Promise<PaginatedRecords<MatchRecord>> {
  const response = await client.get('/history', { params: { page, pageSize: 6, playerId }, signal });
  return response.data as PaginatedRecords<MatchRecord>;
}

export async function submitMatchRecord(record: MatchRecord) {
  const response = await client.post<MatchRecord>('/matches', record, { headers: { 'Idempotency-Key': record.matchId } });
  return response.data;
}

export async function fetchNetworkScenario() {
  const response = await client.get<{ scenario: NetworkScenario }>('/scenario');
  return response.data.scenario;
}

export async function setNetworkScenario(scenario: NetworkScenario) {
  const response = await client.post<{ scenario: NetworkScenario }>('/scenario', { scenario });
  return response.data.scenario;
}

export async function resetMockRecords() {
  await client.post('/reset');
}
