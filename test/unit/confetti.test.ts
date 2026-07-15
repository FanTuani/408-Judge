import { afterEach, describe, expect, it, vi } from 'vitest';

const confettiMock = vi.hoisted(() => vi.fn());
vi.mock('canvas-confetti', () => ({ default: confettiMock }));

describe('correct verdict confetti', () => {
  afterEach(() => {
    confettiMock.mockReset();
    delete (globalThis as { window?: unknown }).window;
    vi.resetModules();
  });

  it('uses the official Basic Cannon parameters and respects reduced motion', async () => {
    (globalThis as { window?: unknown }).window = globalThis;
    await import('../../src/confetti.js');
    const launch = (globalThis as unknown as { launchJudgeConfetti: (origin: { x: number; y: number }) => void }).launchJudgeConfetti;
    launch({ x: 0.5, y: 0.6 });
    expect(confettiMock).toHaveBeenCalledWith({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.5, y: 0.6 },
      zIndex: 1000,
      disableForReducedMotion: true
    });
  });
});
