import confetti from 'canvas-confetti';

declare global {
  interface Window {
    launchJudgeConfetti?: () => void;
  }
}

/** A stronger Basic Cannon fired straight up from the center of the view. */
window.launchJudgeConfetti = () => {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '1000'
  });
  document.body.appendChild(canvas);
  const cannon = confetti.create(canvas, {
    resize: true,
    useWorker: false,
    disableForReducedMotion: true
  });
  const animation = cannon({
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
  if (animation) void animation.finally(() => canvas.remove());
  else canvas.remove();
};
