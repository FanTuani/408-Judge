import { afterEach, describe, expect, it, vi } from 'vitest';

const { confettiMock, cannonMock } = vi.hoisted(() => {
  const cannonMock = vi.fn(() => Promise.resolve());
  return { confettiMock: Object.assign(vi.fn(), { create: vi.fn(() => cannonMock) }), cannonMock };
});
vi.mock('canvas-confetti', () => ({ default: confettiMock }));

describe('correct verdict confetti', () => {
  afterEach(() => {
    confettiMock.mockReset();
    confettiMock.create.mockClear();
    cannonMock.mockClear();
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
    vi.resetModules();
  });

  it('uses the official Basic Cannon parameters and respects reduced motion', async () => {
    (globalThis as { window?: unknown }).window = globalThis;
    const canvas = { style: {}, setAttribute: vi.fn(), remove: vi.fn() };
    (globalThis as { document?: unknown }).document = {
      createElement: vi.fn(() => canvas),
      body: { appendChild: vi.fn() }
    };
    await import('../../src/confetti.js');
    const launch = (globalThis as unknown as { launchJudgeConfetti: () => void }).launchJudgeConfetti;
    launch();
    expect(confettiMock.create).toHaveBeenCalledWith(canvas, {
      resize: true,
      useWorker: false,
      disableForReducedMotion: true
    });
    expect(cannonMock).toHaveBeenCalledWith({
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
    await Promise.resolve();
    expect(canvas.remove).toHaveBeenCalledOnce();
  });
});
