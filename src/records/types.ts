import type { GameSettings } from '../game/config';
import type { MatchResult } from '../game/types';

export type MatchRecord = {
  matchId: string;
  playerId: string;
  playerName: string;
  createdAt: string;
  score: number;
  durationSeconds: number;
  endReason: MatchResult['endReason'];
  settings: GameSettings;
  phaseReached: 1 | 2 | 3;
};

export interface PaginatedRecords<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type NetworkScenario = 'normal' | 'slow' | 'slow-variable' | 'out-of-order' | 'empty' | 'connection-error' | 'client-error' | 'ranking-error' | 'history-error' | 'submit-error' | 'submit-timeout';
