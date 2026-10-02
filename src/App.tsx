import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameLoadingState, PauseReason } from './GameCanvas';
import { GAME_LOADING_ASSET_TOTAL } from './game/loading';
import { DEFAULT_GAME_SETTINGS, GAME_CONFIG, type GameSettings } from './game/config';
import type { GameInput, GameSnapshot, MatchResult } from './game/types';
import menuSceneUrl from '../assets/ui_scene_background.png';
import menuPanelUrl from '../assets/png/default/ui/menu/panel_menu.png';
import menuTitleUrl from '../assets/png/default/ui/menu/title_pirate_battle.png';
import primaryButtonUrl from '../assets/png/default/ui/menu/button_primary_normal.png';
import secondaryButtonUrl from '../assets/png/default/ui/menu/button_secondary_normal.png';
import roundButtonUrl from '../assets/png/default/ui/controls/button_round_normal.png';
import iconForwardUrl from '../assets/png/default/ui/controls/icon_forward.png';
import iconTurnLeftUrl from '../assets/png/default/ui/controls/icon_turn_left.png';
import iconTurnRightUrl from '../assets/png/default/ui/controls/icon_turn_right.png';
import iconFireFrontUrl from '../assets/png/default/ui/controls/icon_fire_front.png';
import iconFireLeftUrl from '../assets/png/default/ui/controls/icon_fire_left.png';
import iconFireRightUrl from '../assets/png/default/ui/controls/icon_fire_right.png';
import iconPauseUrl from '../assets/png/default/ui/controls/icon_pause.png';
import iconPlusUrl from '../assets/png/default/ui/controls/icon_plus.png';
import iconMinusUrl from '../assets/png/default/ui/controls/icon_minus.png';
import iconHeartUrl from '../assets/png/default/ui/hud/icon_heart.png';
import iconScoreUrl from '../assets/png/default/ui/hud/icon_score.png';
import iconTimeUrl from '../assets/png/default/ui/hud/icon_time.png';
import healthFrameUrl from '../assets/png/default/ui/hud/health_frame.png';
import healthFillGreenUrl from '../assets/png/default/ui/hud/health_fill_green.png';
import healthFillAmberUrl from '../assets/png/default/ui/hud/health_fill_amber.png';
import healthFillRedUrl from '../assets/png/default/ui/hud/health_fill_red.png';
import counterPanelUrl from '../assets/png/default/ui/hud/counter_panel.png';
import { fetchHistory, fetchNetworkScenario, fetchRanking, resetMockRecords, setNetworkScenario, submitMatchRecord } from './api/records';
import { enqueuePendingRecord, getOrCreatePlayerId, loadPendingRecords, loadPlayerName, loadPlayerShipId, makeRecordId, removePendingRecord, resetRecordStorage, savePlayerName, savePlayerShipId } from './records/storage';
import type { MatchRecord, NetworkScenario } from './records/types';
import { getPlayerShip, PLAYABLE_SHIPS } from './game/ships';

const GameCanvas = lazy(() => import('./GameCanvas'));

const SETTINGS_STORAGE_KEY = 'pirate-battle-settings-v1';
const LAST_RESULT_STORAGE_KEY = 'pirate-battle-last-result-v1';
type Screen = 'menu' | 'options' | 'ranking' | 'history' | 'game' | 'result';
const EMPTY_GAME_INPUT: GameInput = {
  forward: false, reverse: false, turnLeft: false, turnRight: false,
  fireFront: false, fireLeft: false, fireRight: false,
};

type GameInputField = keyof GameInput;

function loadLastResult(): MatchResult | null {
  try {
    const saved = localStorage.getItem(LAST_RESULT_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as MatchResult;
    if (typeof parsed.score !== 'number' || typeof parsed.timePlayedSeconds !== 'number') return null;
    if (parsed.endReason !== 'time' && parsed.endReason !== 'player-destroyed') return null;
    return { ...parsed, phase: parsed.phase ?? 1 };
  } catch {
    return null;
  }
}

function loadSettings(): GameSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_GAME_SETTINGS };
    const values = JSON.parse(saved) as Partial<GameSettings>;
    return {
      sessionTimeSeconds: Math.min(
        GAME_CONFIG.session.maximumTimeSeconds,
        Math.max(GAME_CONFIG.session.minimumTimeSeconds, Number(values.sessionTimeSeconds) || DEFAULT_GAME_SETTINGS.sessionTimeSeconds),
      ),
      enemySpawnIntervalSeconds: Math.min(15, Math.max(1, Number(values.enemySpawnIntervalSeconds) || DEFAULT_GAME_SETTINGS.enemySpawnIntervalSeconds)),
    };
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

function formatTime(seconds: number) {
  const rounded = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(rounded / 60).toString().padStart(2, '0')}:${(rounded % 60).toString().padStart(2, '0')}`;
}

function formatElapsedTime(seconds: number) {
  const elapsed = Math.floor(Math.max(0, seconds));
  return `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;
}

interface ArtButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  onClick: () => void;
  type?: 'button' | 'submit';
}

function ArtButton({ children, variant = 'primary', onClick, type = 'button' }: ArtButtonProps) {
  return (
    <button
      className={`art-button art-button-${variant}`}
      style={{ backgroundImage: `url(${variant === 'primary' ? primaryButtonUrl : secondaryButtonUrl})` }}
      type={type}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface TouchButtonProps {
  input: GameInputField;
  label: string;
  icon: string;
  onInput: (input: GameInputField, pressed: boolean) => void;
}

function TouchButton({ input, label, icon, onInput }: TouchButtonProps) {
  return (
    <button
      className="touch-control"
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onInput(input, true);
      }}
      onPointerUp={() => onInput(input, false)}
      onPointerCancel={() => onInput(input, false)}
      onLostPointerCapture={() => onInput(input, false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <img className="touch-control-base" src={roundButtonUrl} alt="" draggable={false} />
      <img className="touch-control-icon" src={icon} alt="" draggable={false} />
    </button>
  );
}

function OptionStepper({
  label, value, unit, step, min, max, onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="option-stepper">
      <span className="option-label">{label}</span>
      <div className="stepper-row">
        <button type="button" className="stepper-button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}><img src={iconMinusUrl} alt="" /></button>
        <output aria-live="polite">{value}<small>{unit}</small></output>
        <button type="button" className="stepper-button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}><img src={iconPlusUrl} alt="" /></button>
      </div>
    </div>
  );
}

function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [activeSettings, setActiveSettings] = useState<GameSettings>(settings);
  const [draftSettings, setDraftSettings] = useState<GameSettings>(settings);
  const [paused, setPaused] = useState(false);
  const [pauseOptionsOpen, setPauseOptionsOpen] = useState(false);
  const [touchInput, setTouchInput] = useState<GameInput>(EMPTY_GAME_INPUT);
  const [gameLoading, setGameLoading] = useState<GameLoadingState>({ status: 'ready' });
  const [pauseReason, setPauseReason] = useState<PauseReason>('manual');
  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    score: 0,
    phase: 1,
    timeRemainingSeconds: settings.sessionTimeSeconds,
    playerHealth: 100,
    playerMaxHealth: 100,
  });
  const [result, setResult] = useState<MatchResult | null>(null);
  const [lastResult, setLastResult] = useState<MatchResult | null>(loadLastResult);
  const [gameInstance, setGameInstance] = useState(0);
  const queryClient = useQueryClient();
  const [playerId] = useState(getOrCreatePlayerId);
  const [playerName, setPlayerName] = useState(loadPlayerName);
  const [playerNameDraft, setPlayerNameDraft] = useState(loadPlayerName);
  const [playerShipId, setPlayerShipId] = useState(loadPlayerShipId);
  const [pendingRecords, setPendingRecords] = useState(loadPendingRecords);
  const [recordMessage, setRecordMessage] = useState('');
  const [phaseAnnouncement, setPhaseAnnouncement] = useState('');
  const [rankingPage, setRankingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [networkScenario, setNetworkScenarioValue] = useState<NetworkScenario>('normal');
  const matchIdRef = useRef('');
  const attemptedRecordRef = useRef<string | null>(null);
  const previousPhaseRef = useRef(1);
  const pausedRef = useRef(false);
  const pauseDialogRef = useRef<HTMLElement>(null);

  const rankingQuery = useQuery({
    queryKey: ['ranking', rankingPage, settings.sessionTimeSeconds, settings.enemySpawnIntervalSeconds],
    queryFn: ({ signal }) => fetchRanking(settings, rankingPage, signal),
    enabled: screen === 'ranking',
  });
  const historyQuery = useQuery({
    queryKey: ['history', playerId, historyPage],
    queryFn: ({ signal }) => fetchHistory(playerId, historyPage, signal),
    enabled: screen === 'history',
  });
  const scenarioQuery = useQuery({
    queryKey: ['network-scenario'],
    queryFn: fetchNetworkScenario,
  });
  const submitMutation = useMutation({
    mutationFn: submitMatchRecord,
    onSuccess: (savedRecord) => {
      const remaining = removePendingRecord(savedRecord.matchId);
      setPendingRecords(remaining);
      attemptedRecordRef.current = null;
      setRecordMessage('Score recorded in the ranking and match history.');
      void queryClient.invalidateQueries({ queryKey: ['ranking'] });
      void queryClient.invalidateQueries({ queryKey: ['history', playerId] });
    },
    onError: () => setRecordMessage('Score saved on this device and waiting to be sent.'),
  });
  const scenarioMutation = useMutation({
    mutationFn: setNetworkScenario,
    onSuccess: (scenario) => {
      setNetworkScenarioValue(scenario);
      void queryClient.invalidateQueries({ queryKey: ['network-scenario'] });
      void queryClient.invalidateQueries({ queryKey: ['ranking'] });
      void queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });
  const resetRecordsMutation = useMutation({
    mutationFn: resetMockRecords,
    onSuccess: () => {
      resetRecordStorage();
      setPendingRecords([]);
      setNetworkScenarioValue('normal');
      setRecordMessage('Local ranking and history records were reset.');
      setRankingPage(1);
      setHistoryPage(1);
      void queryClient.invalidateQueries({ queryKey: ['ranking'] });
      void queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });

  useEffect(() => {
    if (!pendingRecords.length || submitMutation.isPending) return;
    const next = pendingRecords[0];
    if (attemptedRecordRef.current === next.matchId) return;
    attemptedRecordRef.current = next.matchId;
    submitMutation.mutate(next);
  }, [pendingRecords, submitMutation.isPending]);

  useEffect(() => {
    if (scenarioQuery.data) setNetworkScenarioValue(scenarioQuery.data);
  }, [scenarioQuery.data]);

  useEffect(() => {
    if (snapshot.phase <= previousPhaseRef.current) {
      previousPhaseRef.current = snapshot.phase;
      return;
    }
    previousPhaseRef.current = snapshot.phase;
    setPhaseAnnouncement(`NEW WATERS · PHASE ${snapshot.phase}`);
    const timeout = window.setTimeout(() => setPhaseAnnouncement(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [snapshot.phase]);

  const changePauseState = useCallback((nextPaused: boolean, reason: PauseReason) => {
    pausedRef.current = nextPaused;
    setPaused(nextPaused);
    if (nextPaused) setPauseReason(reason);
    else setPauseOptionsOpen(false);
  }, []);

  const receiveSnapshot = useCallback((nextSnapshot: GameSnapshot) => {
    setSnapshot(nextSnapshot);
  }, []);

  const finishGame = useCallback((nextResult: MatchResult) => {
    const record: MatchRecord = {
      matchId: matchIdRef.current || makeRecordId(),
      playerId,
      playerName,
      createdAt: new Date().toISOString(),
      score: nextResult.score,
      durationSeconds: Math.floor(nextResult.timePlayedSeconds),
      endReason: nextResult.endReason,
      settings: { ...activeSettings },
      phaseReached: nextResult.phase,
    };
    const updatedPending = enqueuePendingRecord(record);
    setPendingRecords(updatedPending);
    setRecordMessage('Saving score to ranking and match history…');
    setResult(nextResult);
    setLastResult(nextResult);
    try {
      localStorage.setItem(LAST_RESULT_STORAGE_KEY, JSON.stringify(nextResult));
    } catch {
      // The result remains available for the current session if storage is unavailable.
    }
    pausedRef.current = false;
    setPaused(false);
    setTouchInput(EMPTY_GAME_INPUT);
    setScreen('result');
  }, [activeSettings, playerId, playerName]);

  const startGame = () => {
    const savedName = savePlayerName(playerNameDraft);
    savePlayerShipId(playerShipId);
    setPlayerName(savedName);
    setPlayerNameDraft(savedName);
    matchIdRef.current = makeRecordId();
    setResult(null);
    setActiveSettings({ ...settings });
    setSnapshot({ score: 0, phase: 1, timeRemainingSeconds: settings.sessionTimeSeconds, playerHealth: 100, playerMaxHealth: 100 });
    setGameInstance((instance) => instance + 1);
    setGameLoading({ status: 'loading', loaded: 0, total: GAME_LOADING_ASSET_TOTAL });
    setPauseOptionsOpen(false);
    setTouchInput(EMPTY_GAME_INPUT);
    changePauseState(false, 'manual');
    setScreen('game');
  };

  const savePlayerProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const savedName = savePlayerName(playerNameDraft);
    setPlayerName(savedName);
    setPlayerNameDraft(savedName);
    setRecordMessage(`Your captain name is saved as ${savedName}.`);
  };

  const retryPendingRecords = () => {
    attemptedRecordRef.current = null;
    setPendingRecords(loadPendingRecords());
    setRecordMessage('Retrying pending score uploads…');
  };

  const selectNetworkScenario = (scenario: NetworkScenario) => {
    scenarioMutation.mutate(scenario);
  };

  const retryGameLoad = () => {
    setGameLoading({ status: 'loading', loaded: 0, total: GAME_LOADING_ASSET_TOTAL });
    setGameInstance((instance) => instance + 1);
  };

  const showOptions = () => {
    setDraftSettings({ ...settings });
    setScreen('options');
  };

  const persistSettings = (nextSettings: GameSettings) => {
    setSettings(nextSettings);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
    } catch {
      // Current settings remain usable if storage is unavailable.
    }
  };

  const saveOptions = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextSettings = {
      sessionTimeSeconds: Math.min(
        GAME_CONFIG.session.maximumTimeSeconds,
        Math.max(GAME_CONFIG.session.minimumTimeSeconds, Math.round(draftSettings.sessionTimeSeconds)),
      ),
      enemySpawnIntervalSeconds: Math.min(15, Math.max(1, draftSettings.enemySpawnIntervalSeconds)),
    };
    persistSettings(nextSettings);
    setScreen('menu');
  };

  const savePausedOptions = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextSettings = {
      sessionTimeSeconds: Math.min(GAME_CONFIG.session.maximumTimeSeconds, Math.max(GAME_CONFIG.session.minimumTimeSeconds, Math.round(draftSettings.sessionTimeSeconds))),
      enemySpawnIntervalSeconds: Math.min(15, Math.max(1, draftSettings.enemySpawnIntervalSeconds)),
    };
    persistSettings(nextSettings);
    setPauseOptionsOpen(false);
  };

  const returnToMenu = () => {
    changePauseState(false, 'manual');
    setPauseOptionsOpen(false);
    setTouchInput(EMPTY_GAME_INPUT);
    setScreen('menu');
  };

  const updateTouchInput = (input: GameInputField, pressed: boolean) => {
    setTouchInput((previous) => previous[input] === pressed ? previous : { ...previous, [input]: pressed });
  };

  useEffect(() => {
    if (screen !== 'game' || paused) setTouchInput(EMPTY_GAME_INPUT);
  }, [screen, paused]);

  useEffect(() => {
    if (!paused || !pauseDialogRef.current) return;
    const dialog = pauseDialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ));
    // Keep the initial focus on the dialog itself. Focusing the first button
    // here can leave its keyboard-only outline visible when the pointer moves
    // over it as the pause menu opens.
    dialog.focus({ preventScroll: true });
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === dialog || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === dialog || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', keepFocusInside);
    return () => {
      dialog.removeEventListener('keydown', keepFocusInside);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [paused, pauseOptionsOpen]);

  return (
    <main className={`app-root screen-${screen}`}>
      {screen === 'game' && (
        <>
          <Suspense fallback={null}>
            <GameCanvas
              key={gameInstance}
              settings={activeSettings}
              playerShipId={playerShipId}
              touchInput={touchInput}
              paused={paused}
              onPauseChange={changePauseState}
              onSnapshot={receiveSnapshot}
              onGameOver={finishGame}
              onLoadingChange={setGameLoading}
            />
          </Suspense>
          <section className="game-hud" aria-label="Game status">
            <div className="hud-health-card" role="progressbar" aria-label="Player hull" aria-valuemin={0} aria-valuemax={snapshot.playerMaxHealth} aria-valuenow={snapshot.playerHealth}>
              <img className="hud-heart-icon" src={iconHeartUrl} alt="" />
              <span className="health-frame" style={{ backgroundImage: `url(${healthFrameUrl})` }}>
                <span className="health-fill" style={{ backgroundImage: `url(${snapshot.playerHealth / snapshot.playerMaxHealth > 0.6 ? healthFillGreenUrl : snapshot.playerHealth / snapshot.playerMaxHealth > 0.3 ? healthFillAmberUrl : healthFillRedUrl})`, width: `${Math.max(0, snapshot.playerHealth / snapshot.playerMaxHealth) * 80}%` }} />
              </span>
              <span className="hud-value">{snapshot.playerHealth}<small>/{snapshot.playerMaxHealth}</small></span>
            </div>
            <div className="hud-counters">
              <div className="hud-counter" role="group" aria-label={`Phase ${snapshot.phase}. Score ${snapshot.score}`} style={{ backgroundImage: `url(${counterPanelUrl})` }}><img src={iconScoreUrl} alt="" /><span><small>PHASE {snapshot.phase} · SCORE</small><strong>{snapshot.score}</strong></span></div>
              <div className="hud-counter" role="group" aria-label={`Time remaining ${formatTime(snapshot.timeRemainingSeconds)}`} style={{ backgroundImage: `url(${counterPanelUrl})` }}><img src={iconTimeUrl} alt="" /><span><small>TIME</small><strong>{formatTime(snapshot.timeRemainingSeconds)}</strong></span></div>
              <button className="pause-button" type="button" onClick={() => changePauseState(true, 'manual')} aria-label="Pause game"><img src={iconPauseUrl} alt="" /></button>
            </div>
          </section>
          {phaseAnnouncement && <div className="phase-announcement" role="status">{phaseAnnouncement}</div>}
          <div className="game-controls-hint" aria-label="Controls">
            <span><kbd>W</kbd><kbd>S</kbd> Sail</span>
            <span><kbd>A</kbd><kbd>D</kbd> Turn</span>
            <span><kbd>SPACE</kbd> Front</span>
            <span><kbd>Q</kbd><kbd>E</kbd> Broadside</span>
            <span><kbd>ESC</kbd> Pause</span>
          </div>
          <div className="touch-controls" aria-label="Touch controls">
            <div className="touch-control-cluster touch-movement">
              <TouchButton input="turnLeft" label="Turn left" icon={iconTurnLeftUrl} onInput={updateTouchInput} />
              <TouchButton input="forward" label="Move forward" icon={iconForwardUrl} onInput={updateTouchInput} />
              <TouchButton input="turnRight" label="Turn right" icon={iconTurnRightUrl} onInput={updateTouchInput} />
              <TouchButton input="reverse" label="Reverse" icon={iconForwardUrl} onInput={updateTouchInput} />
            </div>
            <div className="touch-control-cluster touch-attacks">
              <TouchButton input="fireLeft" label="Fire left broadside" icon={iconFireLeftUrl} onInput={updateTouchInput} />
              <TouchButton input="fireFront" label="Fire forward" icon={iconFireFrontUrl} onInput={updateTouchInput} />
              <TouchButton input="fireRight" label="Fire right broadside" icon={iconFireRightUrl} onInput={updateTouchInput} />
            </div>
          </div>
          {gameLoading.status === 'loading' && (
            <div className="screen-overlay loading-overlay" role="status" aria-live="polite">
              <section className="dialog-panel loading-panel"><h1>PREPARING THE SHIP</h1><p>Loading sea and ship assets…</p><progress max={gameLoading.total} value={gameLoading.loaded} /><strong>{Math.round(gameLoading.loaded / gameLoading.total * 100)}%</strong></section>
            </div>
          )}
          {gameLoading.status === 'error' && (
            <div className="screen-overlay loading-overlay">
              <section className="dialog-panel loading-panel" role="alert"><h1>THE SEA IS UNAVAILABLE</h1><p>Some game assets could not be loaded.</p><ArtButton onClick={retryGameLoad}>Retry Loading</ArtButton><ArtButton variant="secondary" onClick={returnToMenu}>Main Menu</ArtButton></section>
            </div>
          )}
          <p className="orientation-hint" aria-hidden="true">For the best sailing view, rotate your device to landscape.</p>
          {paused && (
            <div className="screen-overlay pause-overlay">
              <section ref={pauseDialogRef} className="dialog-panel" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="pause-title">
                {!pauseOptionsOpen ? <>
                  <h1 id="pause-title">VOYAGE PAUSED</h1>
                  <p>{pauseReason === 'focus' ? 'The game paused when this window lost focus.' : 'Take a moment, captain.'}</p>
                  <ArtButton onClick={() => changePauseState(false, 'manual')}>Resume Voyage</ArtButton>
                  <ArtButton variant="secondary" onClick={() => { setDraftSettings({ ...settings }); setPauseOptionsOpen(true); }}>Options</ArtButton>
                  <ArtButton variant="secondary" onClick={returnToMenu}>Return to Main Menu</ArtButton>
                  <small>Press ESC or P to resume</small>
                </> : <form className="pause-options-form" onSubmit={savePausedOptions}>
                  <h1 id="pause-title">VOYAGE OPTIONS</h1>
                  <OptionStepper label="Game session time" value={draftSettings.sessionTimeSeconds} unit="s" min={60} max={180} step={10} onChange={(value) => setDraftSettings((previous) => ({ ...previous, sessionTimeSeconds: value }))} />
                  <OptionStepper label="Enemy spawn time" value={draftSettings.enemySpawnIntervalSeconds} unit="s" min={1} max={15} step={0.5} onChange={(value) => setDraftSettings((previous) => ({ ...previous, enemySpawnIntervalSeconds: value }))} />
                  <ArtButton type="submit" onClick={() => {}}>Save for next voyage</ArtButton>
                  <ArtButton variant="secondary" onClick={() => setPauseOptionsOpen(false)}>Back to Pause</ArtButton>
                  <small>These settings apply to your next game.</small>
                </form>}
              </section>
            </div>
          )}
        </>
      )}

      {screen !== 'game' && screen !== 'result' && (
        <div className="menu-scene" style={{ backgroundImage: `linear-gradient(rgba(3, 25, 38, .52), rgba(3, 25, 38, .72)), url(${menuSceneUrl})` }}>
          <section className="menu-panel" style={{ backgroundImage: `url(${menuPanelUrl})` }}>
            {screen === 'menu' && <img className="menu-title" src={menuTitleUrl} alt="Pirate Battle" />}
            {screen === 'menu' && (
              <>
                <p className="menu-tagline">SET SAIL. TAKE COMMAND.</p>
                {lastResult && <button className="last-voyage-link" type="button" onClick={() => { setResult(lastResult); setScreen('result'); }}>Last voyage · {lastResult.score} points · {formatTime(lastResult.timePlayedSeconds)}</button>}
                <div className="menu-actions">
                  <ArtButton onClick={startGame}>Play</ArtButton>
                  <ArtButton onClick={showOptions}>Options</ArtButton>
                </div>
                <form className="player-profile" onSubmit={(event) => { event.preventDefault(); const savedName = savePlayerName(playerNameDraft); savePlayerShipId(playerShipId); setPlayerName(savedName); setPlayerNameDraft(savedName); }}>
                  <label htmlFor="player-name">Captain name (used in ranking)</label>
                  <input id="player-name" value={playerNameDraft} maxLength={24} onChange={(event) => setPlayerNameDraft(event.target.value)} />
                  <div className="ship-picker">
                    <img className="menu-ship" src={getPlayerShip(playerShipId).url} alt={getPlayerShip(playerShipId).label} />
                    <label htmlFor="player-ship">Your ship</label>
                    <select id="player-ship" value={playerShipId} onChange={(event) => setPlayerShipId(event.target.value)}>
                      {PLAYABLE_SHIPS.map((ship) => <option key={ship.id} value={ship.id}>{ship.label}</option>)}
                    </select>
                  </div>
                  <button className="record-action profile-save" type="submit">Save captain and ship</button>
                </form>
                <p className="menu-controls">W / S sail · A / D turn · Space fire · Q / E broadside · P pause</p>
                <nav className="menu-tabs" aria-label="Game records">
                  <ArtButton variant="secondary" onClick={() => { setRankingPage(1); setScreen('ranking'); }}>Ranking</ArtButton>
                  <ArtButton variant="secondary" onClick={() => { setHistoryPage(1); setScreen('history'); }}>Match History</ArtButton>
                </nav>
              </>
            )}

            {screen === 'options' && (
              <form className="options-form" onSubmit={saveOptions}>
                <h1 className="menu-screen-title">OPTIONS</h1>
                <OptionStepper label="Game session time" value={draftSettings.sessionTimeSeconds} unit="s" min={GAME_CONFIG.session.minimumTimeSeconds} max={GAME_CONFIG.session.maximumTimeSeconds} step={10} onChange={(value) => setDraftSettings((previous) => ({ ...previous, sessionTimeSeconds: value }))} />
                <OptionStepper label="Enemy spawn time" value={draftSettings.enemySpawnIntervalSeconds} unit="s" min={1} max={15} step={0.5} onChange={(value) => setDraftSettings((previous) => ({ ...previous, enemySpawnIntervalSeconds: value }))} />
                <p className="option-range-note">Session: 60–180 seconds. Spawn interval: 1–15 seconds.</p>
                <div className="form-actions">
                  <ArtButton type="submit" onClick={() => {}}>Save Options</ArtButton>
                  <ArtButton variant="secondary" onClick={() => setScreen('menu')}>Back</ArtButton>
                </div>
              </form>
            )}

            {(screen === 'ranking' || screen === 'history') && (
              <section className="records-page">
                <p className="menu-tagline">{screen === 'ranking' ? 'CAPTAINS OF THE SEA' : 'YOUR VOYAGES'}</p>
                <h1>{screen === 'ranking' ? 'Captain’s Ranking' : 'Match History'}</h1>
                {screen === 'ranking' ? (
                  <>
                    <form className="captain-profile" onSubmit={savePlayerProfile}>
                      <label htmlFor="captain-name">Captain name</label>
                      <div><input id="captain-name" value={playerNameDraft} maxLength={24} onChange={(event) => setPlayerNameDraft(event.target.value)} /><button className="record-action" type="submit">Save name</button></div>
                    </form>
                    <p className="record-context">Scores for {settings.sessionTimeSeconds}s voyages with a {settings.enemySpawnIntervalSeconds}s enemy interval.</p>
                    {rankingQuery.isPending ? <p className="records-state" role="status">Loading ranking…</p>
                      : rankingQuery.isError ? <div className="records-state" role="alert"><p>The ranking could not be loaded.</p><button className="record-action" type="button" onClick={() => void rankingQuery.refetch()}>Retry</button></div>
                        : rankingQuery.data?.items.length ? (
                          <ol className="record-list" aria-label="Paginated ranking">
                            {rankingQuery.data.items.map((record) => (
                              <li className="record-row" key={record.matchId}>
                                <span className="record-rank">{record.rank}</span>
                                <span className="record-name"><strong>{record.playerName}</strong><small>Phase {record.phaseReached} · {formatElapsedTime(record.durationSeconds)}</small></span>
                                <strong className="record-score">{record.score}</strong>
                              </li>
                            ))}
                          </ol>
                        ) : <p className="records-state">No scores yet for these match settings.</p>}
                    {rankingQuery.data && <div className="record-pagination"><button className="record-action" type="button" disabled={rankingPage <= 1} onClick={() => setRankingPage((page) => Math.max(1, page - 1))}>Previous</button><span>Page {rankingQuery.data.page} of {rankingQuery.data.totalPages}</span><button className="record-action" type="button" disabled={rankingPage >= rankingQuery.data.totalPages} onClick={() => setRankingPage((page) => page + 1)}>Next</button></div>}
                  </>
                ) : (
                  <>
                    {historyQuery.isPending ? <p className="records-state" role="status">Loading match history…</p>
                      : historyQuery.isError ? <div className="records-state" role="alert"><p>Match history could not be loaded.</p><button className="record-action" type="button" onClick={() => void historyQuery.refetch()}>Retry</button></div>
                        : historyQuery.data?.items.length ? (
                          <ol className="record-list history-list" aria-label="Paginated match history">
                            {historyQuery.data.items.map((record) => (
                              <li className="record-row" key={record.matchId}>
                                <span className="record-rank">{record.score}</span>
                                <span className="record-name"><strong>{new Date(record.createdAt).toLocaleDateString()}</strong><small>{record.settings.sessionTimeSeconds}s match · {record.endReason === 'time' ? 'Time up' : 'Ship destroyed'} · Phase {record.phaseReached}</small></span>
                                <strong className="record-score">{formatElapsedTime(record.durationSeconds)}</strong>
                              </li>
                            ))}
                          </ol>
                        ) : <p className="records-state">Your completed voyages will appear here.</p>}
                    {historyQuery.data && <div className="record-pagination"><button className="record-action" type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}>Previous</button><span>Page {historyQuery.data.page} of {historyQuery.data.totalPages}</span><button className="record-action" type="button" disabled={historyPage >= historyQuery.data.totalPages} onClick={() => setHistoryPage((page) => page + 1)}>Next</button></div>}
                  </>
                )}
                <div className="record-delivery" role="status">
                  <span>{pendingRecords.length ? `${pendingRecords.length} score upload${pendingRecords.length === 1 ? '' : 's'} pending. ${recordMessage}` : recordMessage}</span>
                  {pendingRecords.length > 0 && <button className="record-action" type="button" onClick={retryPendingRecords}>Retry pending</button>}
                </div>
                <details className="network-tools">
                  <summary>Local API demo and reset</summary>
                  <label htmlFor="network-scenario">Network scenario</label>
                  <select id="network-scenario" value={networkScenario} onChange={(event) => selectNetworkScenario(event.target.value as NetworkScenario)}>
                    <option value="normal">Normal response</option><option value="slow">Slow response</option><option value="slow-variable">Seeded variable latency</option><option value="out-of-order">Out-of-order pages</option><option value="empty">Empty ranking</option><option value="connection-error">Connection failure</option><option value="client-error">HTTP 400 failure</option><option value="ranking-error">Ranking error</option><option value="history-error">History error</option><option value="submit-error">Submission error</option><option value="submit-timeout">Save then timeout (idempotency)</option>
                  </select>
                  <button className="record-action" type="button" onClick={() => resetRecordsMutation.mutate()} disabled={resetRecordsMutation.isPending || submitMutation.isPending}>Reset local records</button>
                </details>
                <ArtButton variant="secondary" onClick={() => setScreen('menu')}>Back to Main Menu</ArtButton>
              </section>
            )}
          </section>
        </div>
      )}

      {screen === 'result' && (result || lastResult) && (
        <div className="menu-scene result-scene" style={{ backgroundImage: `linear-gradient(rgba(3, 25, 38, .52), rgba(3, 25, 38, .72)), url(${menuSceneUrl})` }}>
          <section className="menu-panel result-panel" style={{ backgroundImage: `url(${menuPanelUrl})` }}>
            <p className="menu-tagline">PIRATE BATTLE</p>
            <img className="result-ship" src={getPlayerShip(playerShipId).url} alt="" />
            <h1 className="result-heading">{(result ?? lastResult)!.endReason === 'time' ? 'VOYAGE COMPLETE' : 'SHIP DESTROYED'}</h1>
            <div className="result-score" aria-label={`${(result ?? lastResult)!.score} points`}>{new Intl.NumberFormat('en-US').format((result ?? lastResult)!.score)}</div>
            <p className="result-caption">POINTS SCORED</p>
            <div className="result-stats" aria-label="Match summary">
              <span><small>TIME PLAYED</small><strong>{formatElapsedTime((result ?? lastResult)!.timePlayedSeconds)}</strong></span>
              <span><small>PHASE / END</small><strong>{(result ?? lastResult)!.phase} · {(result ?? lastResult)!.endReason === 'time' ? 'TIME UP' : 'DEFEATED'}</strong></span>
            </div>
            <p className="result-record-status">{recordMessage || 'Latest result saved on this device.'}</p>
            {pendingRecords.length > 0 && <button className="last-voyage-link" type="button" onClick={retryPendingRecords}>Retry pending score upload</button>}
            <div className="menu-actions">
              <ArtButton onClick={startGame}>Play Again</ArtButton>
              <ArtButton variant="secondary" onClick={returnToMenu}>Main Menu</ArtButton>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
