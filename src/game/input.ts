import type { GameInput } from './types';

const GAME_KEYS = new Set([
  'KeyW', 'ArrowUp',
  'KeyS', 'ArrowDown',
  'KeyA', 'ArrowLeft',
  'KeyD', 'ArrowRight',
  'KeyQ', 'KeyE',
  'Space',
]);

export function attachKeyboardInput(target: Window = window, onPauseRequested: () => void = () => {}) {
  const pressedKeys = new Set<string>();

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) {
      event.preventDefault();
      onPauseRequested();
      return;
    }
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    pressedKeys.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent) => pressedKeys.delete(event.code);
  const onBlur = () => pressedKeys.clear();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    read(): GameInput {
      return {
        forward: pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp'),
        reverse: pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown'),
        turnLeft: pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft'),
        turnRight: pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight'),
        fireFront: pressedKeys.has('Space'),
        fireLeft: pressedKeys.has('KeyQ'),
        fireRight: pressedKeys.has('KeyE'),
      };
    },
    destroy() {
      pressedKeys.clear();
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
