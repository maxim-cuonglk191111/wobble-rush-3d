/* ===========================================================================
   UI — owns all DOM screens (start, HUD, finish, error) and reports player
   intent (play / restart) back to the Game via callbacks.
   ========================================================================= */

class UI {
  constructor() {
    this.el = {
      loading: document.getElementById('loading'),
      start: document.getElementById('start-screen'),
      hud: document.getElementById('hud'),
      finish: document.getElementById('finish-screen'),
      error: document.getElementById('error-overlay'),
      errorMsg: document.getElementById('error-message'),
      playBtn: document.getElementById('play-button'),
      restartBtn: document.getElementById('restart-button'),
      timer: document.getElementById('hud-timer'),
      cpCount: document.getElementById('hud-checkpoint-count'),
      cpTotal: document.getElementById('hud-checkpoint-total'),
      hint: document.getElementById('hud-hint'),
      finishTime: document.getElementById('finish-time'),
      finishBest: document.getElementById('finish-best'),
    };

    this.onPlay = null;
    this.onRestart = null;

    this.el.playBtn.addEventListener('click', () => this.onPlay && this.onPlay());
    this.el.restartBtn.addEventListener('click', () => this.onRestart && this.onRestart());
  }

  _hideAll() {
    this.el.loading.classList.add('hidden');
    this.el.start.classList.add('hidden');
    this.el.finish.classList.add('hidden');
    this.el.hud.classList.add('hidden');
  }

  showLoading() {
    this._hideAll();
    this.el.loading.classList.remove('hidden');
  }

  showStart() {
    this._hideAll();
    this.el.start.classList.remove('hidden');
  }

  showHUD(totalCheckpoints) {
    this._hideAll();
    this.el.hud.classList.remove('hidden');
    this.el.cpTotal.textContent = totalCheckpoints;
    this.el.cpCount.textContent = '0';
    this.el.timer.textContent = '0.00';
    this.showHint('Reach the glowing gate!');
  }

  showFinish(timeSeconds) {
    this._hideAll();
    this.el.finish.classList.remove('hidden');
    this.el.finishTime.textContent = timeSeconds.toFixed(2) + 's';

    // Best time via localStorage.
    let best = parseFloat(localStorage.getItem('wobble-rush-best'));
    if (isNaN(best) || timeSeconds < best) {
      best = timeSeconds;
      localStorage.setItem('wobble-rush-best', String(best));
      this.el.finishBest.textContent = '🏆 New best time!';
    } else {
      this.el.finishBest.textContent = 'Best: ' + best.toFixed(2) + 's';
    }
  }

  /** Fatal, unrecoverable error — replaces everything. */
  showError(message) {
    this._hideAll();
    this.el.errorMsg.textContent = message;
    this.el.error.classList.remove('hidden');
  }

  updateTimer(seconds) {
    this.el.timer.textContent = seconds.toFixed(2);
  }

  updateCheckpoints(count) {
    this.el.cpCount.textContent = count;
  }

  showHint(text) {
    this.el.hint.textContent = text;
    this.el.hint.classList.remove('fade');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.el.hint.classList.add('fade'), 3200);
  }
}

window.UI = UI;
