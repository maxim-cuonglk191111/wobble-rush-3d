/* ===========================================================================
   main — bootstrap. Verifies dependencies loaded and starts the Game. No
   silent fallbacks: any startup failure is surfaced in a clear error overlay.
   ========================================================================= */

(function boot() {
  const errorOverlay = document.getElementById('error-overlay');
  const errorMessage = document.getElementById('error-message');

  function fatal(message, err) {
    // Prefer the styled overlay; fall back to alert if the DOM is broken.
    try {
      document.querySelectorAll('.overlay').forEach((o) => o.classList.add('hidden'));
      errorMessage.textContent = message;
      errorOverlay.classList.remove('hidden');
    } catch (e) {
      alert('Wobble Rush 3D failed to start: ' + message);
    }
    if (err) console.error(err);
  }

  // Catch anything that escapes during startup or the loop.
  window.addEventListener('error', (e) => {
    fatal('Unexpected error: ' + (e.message || 'unknown'), e.error);
  });

  function init() {
    if (!window.THREE) {
      fatal('Three.js could not be loaded from the CDN. Check your internet connection and reload.');
      return;
    }
    const required = ['Effects', 'Obstacle', 'Sweeper', 'MovingPlatform', 'Bumper', 'Checkpoint', 'Course', 'Player', 'UI', 'Game'];
    const missing = required.filter((n) => !window[n]);
    if (missing.length) {
      fatal('A game module failed to load: ' + missing.join(', '));
      return;
    }

    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
      fatal('Game canvas element is missing.');
      return;
    }

    let game;
    try {
      game = new Game(canvas);
    } catch (err) {
      fatal('Could not start the game: ' + err.message, err);
      return;
    }

    // Verify WebGL actually initialised.
    if (!game.renderer || !game.renderer.getContext()) {
      fatal('WebGL is not available in this browser.');
      return;
    }

    game.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
