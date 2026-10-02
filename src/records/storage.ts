import type { MatchRecord } from './types';

export const PLAYER_ID_KEY = 'pirate-battle-player-id-v1';
export const PLAYER_NAME_KEY = 'pirate-battle-player-name-v1';
export const PENDING_RECORDS_KEY = 'pirate-battle-pending-records-v1';
export const CONFIRMED_RECORDS_KEY = 'pirate-battle-confirmed-records-v1';
export const NETWORK_SCENARIO_KEY = 'pirate-battle-network-scenario-v1';
export const PLAYER_SHIP_KEY = 'pirate-battle-player-ship-v1';

export function loadPlayerShipId() {
  return localStorage.getItem(PLAYER_SHIP_KEY) ?? 'ship_1';
}

export function savePlayerShipId(shipId: string) {
  localStorage.setItem(PLAYER_SHIP_KEY, shipId);
}

export function makeRecordId() {
  return globalThis.crypto?.randomUUID?.() ?? `match-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreatePlayerId() {
  const existing = localStorage.getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  const id = `captain-${makeRecordId()}`;
  localStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

export function loadPlayerName() {
  return localStorage.getItem(PLAYER_NAME_KEY) ?? 'Captain';
}

export function savePlayerName(name: string) {
  const normalized = name.trim().slice(0, 24) || 'Captain';
  localStorage.setItem(PLAYER_NAME_KEY, normalized);
  return normalized;
}

function parseRecordArray(value: string | null): MatchRecord[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((record): record is MatchRecord => (
      typeof record === 'object'
      && record !== null
      && typeof (record as MatchRecord).matchId === 'string'
      && typeof (record as MatchRecord).playerId === 'string'
      && typeof (record as MatchRecord).score === 'number'
    ));
  } catch {
    return [];
  }
}

export function loadPendingRecords() {
  return parseRecordArray(localStorage.getItem(PENDING_RECORDS_KEY));
}

export function savePendingRecords(records: MatchRecord[]) {
  localStorage.setItem(PENDING_RECORDS_KEY, JSON.stringify(records));
}

export function enqueuePendingRecord(record: MatchRecord) {
  const records = loadPendingRecords();
  const existing = records.find((pending) => pending.matchId === record.matchId);
  if (existing) return records;
  const next = [...records, record];
  savePendingRecords(next);
  return next;
}

export function removePendingRecord(matchId: string) {
  const next = loadPendingRecords().filter((record) => record.matchId !== matchId);
  savePendingRecords(next);
  return next;
}

export function resetRecordStorage() {
  localStorage.removeItem(PENDING_RECORDS_KEY);
  localStorage.removeItem(CONFIRMED_RECORDS_KEY);
}
