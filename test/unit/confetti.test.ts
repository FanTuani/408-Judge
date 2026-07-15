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
    const launch = (globalThis as unknown as { launchJudgeConfetti: () => void }).launchJudgeConfetti;
    launch();
    expect(confettiMock).toHaveBeenCalledWith({
      particleCount: 160,
      angle: 90,
      spread: 82,
      startVelocity: 52,
      gravity: 1.05,
      ticks: 240,
      scalar: 1.1,
      origin: { x: 0.5, y: 0.68 },
      colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'],
      zIndex: 1000,
      disableForReducedMotion: true
    });
  });
});
