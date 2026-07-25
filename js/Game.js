/* ===========================================================================
   Game — top-level orchestrator. Owns the renderer, scene, camera, input and
   the main loop, and wires Course / Player / UI / Effects together.

   State machine: 'start' -> 'playing' -> 'finished' (restart -> 'playing').
   ========================================================================= */

class Game {
  constructor(canvas) {
    if (!window.THREE) {
      throw new Error('Three.js failed to load.');
    }
    this.canvas = canvas;
    this.state = 'start';
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.raceTime = 0;

    this._setupRenderer();
    this._setupScene();
    this._setupInput();

    this.effects = new Effects(this.scene);
    this.course = new Course(this.scene, this.effects);
    this.course.build();
    this.player = new Player(this.scene, this.effects);

    this.ui = new UI();
    this.ui.onPlay = () => this.startRace();
    this.ui.onRestart = () => this.startRace();

    // Respawn state.
    this.respawnPoint = this.course.spawn.clone();
    this.checkpointsHit = 0;

    // Camera follow.
    this.camOffset = new THREE.Vector3(0, 6.2, 11);
    this.camLookOffset = new THREE.Vector3(0, 1.4, -4);
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();

    this.player.reset(this.course.spawn);
    this._placeCameraInstant();

    window.addEventListener('resize', () => this._onResize());
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.1, 600
    );
    this.camera.position.set(0, 8, 16);
  }

  _setupInput() {
    this.keys = {};
    this.edges = { jump: false, dive: false, respawn: false };

    const codeMap = {
      KeyW: 'up', ArrowUp: 'up',
      KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      Space: 'jump',
      ShiftLeft: 'dive', ShiftRight: 'dive',
      KeyR: 'respawn',
    };

    window.addEventListener('keydown', (e) => {
      const k = codeMap[e.code];
      if (!k) return;
      // Prevent page scroll on space/arrows.
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) {
        if (k === 'jump') this.edges.jump = true;
        if (k === 'dive') this.edges.dive = true;
        if (k === 'respawn') this.edges.respawn = true;
        // Space also starts / restarts from menus.
        if (k === 'jump') this._menuConfirm();
      }
      this.keys[k] = true;
    });

    window.addEventListener('keyup', (e) => {
      const k = codeMap[e.code];
      if (k) this.keys[k] = false;
    });
  }

  _menuConfirm() {
    if (this.state === 'start' || this.state === 'finished') {
      this.startRace();
    }
  }

  /* ---------------------- state transitions ---------------------- */
  startRace() {
    this.respawnPoint = this.course.spawn.clone();
    this.checkpointsHit = 0;
    for (const cp of this.course.checkpoints) cp.activated = false;
    this.edges.jump = this.edges.dive = this.edges.respawn = false;
    this.player.reset(this.course.spawn);
    this._placeCameraInstant();
    this.raceTime = 0;
    this.state = 'playing';
    this.ui.showHUD(this.course.checkpoints.length);
  }

  finishRace() {
    this.state = 'finished';
    this.effects.finish(new THREE.Vector3(this.player.position.x, this.player.position.y + 1, this.player.position.z));
    this.ui.showFinish(this.raceTime);
  }

  /* ---------------------- main loop ---------------------- */
  start() {
    this.ui.showStart();
    this._loop();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    // World always animates so menus feel alive.
    this.course.update(this.elapsed, dt);
    this.effects.update(dt);

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else {
      // Idle bob of the character while on menus.
      this.player.group.position.set(
        this.player.position.x,
        this.player.position.y + Math.sin(this.elapsed * 2) * 0.08,
        this.player.position.z
      );
      this.player.body.rotation.y += dt * 0.6;
    }

    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _updatePlaying(dt) {
    this.raceTime += dt;
    this.ui.updateTimer(this.raceTime);

    const input = {
      x: (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0),
      z: (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0),
      jumpPressed: this.edges.jump,
      jumpHeld: !!this.keys.jump,
      divePressed: this.edges.dive,
    };
    // Consume edge events.
    this.edges.jump = false;
    this.edges.dive = false;

    // Manual respawn.
    if (this.edges.respawn) {
      this.edges.respawn = false;
      this.player.respawn(this.respawnPoint);
    }

    this.player.update(dt, input, this.course);

    // Checkpoints & finish.
    for (const cp of this.course.checkpoints) {
      if (cp.tryActivate(this.player.position)) {
        if (cp.isFinish) {
          this.finishRace();
          return;
        }
        this.respawnPoint.copy(cp.respawn);
        this.checkpointsHit++;
        this.ui.updateCheckpoints(this.checkpointsHit);
        this.ui.showHint('Checkpoint! Keep going →');
        this.effects.checkpoint(new THREE.Vector3(cp.position.x, cp.position.y + 2.4, cp.position.z));
      }
    }

    // Fell off the course.
    if (this.player.hasFallen(this.course.KILL_Y)) {
      this.player.respawn(this.respawnPoint);
    }
  }

  /* ---------------------- camera ---------------------- */
  _desiredCamera() {
    this._camPos.set(
      this.player.position.x + this.camOffset.x,
      this.player.position.y + this.camOffset.y,
      this.player.position.z + this.camOffset.z
    );
    this._camLook.set(
      this.player.position.x + this.camLookOffset.x,
      this.player.position.y + this.camLookOffset.y,
      this.player.position.z + this.camLookOffset.z
    );
  }

  _placeCameraInstant() {
    this._desiredCamera();
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
  }

  _updateCamera(dt) {
    this._desiredCamera();
    // Smooth, frame-rate independent follow.
    const k = 1 - Math.exp(-6 * dt);
    this.camera.position.lerp(this._camPos, k);
    this.camera.lookAt(this._camLook);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

window.Game = Game;
