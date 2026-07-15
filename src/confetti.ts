import confetti from 'canvas-confetti';

declare global {
  interface Window {
    launchJudgeConfetti?: (origin: { x: number; y: number }) => void;
  }
}

/** The official canvas-confetti Basic Cannon, anchored near the streamed verdict. */
window.launchJudgeConfetti = origin => {
  void confetti({
    particleCount: 100,
    spread: 70,
    origin,
    zIndex: 1000,
    disableForReducedMotion: true
  });
};
