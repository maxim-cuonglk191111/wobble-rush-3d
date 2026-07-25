/* ===========================================================================
   Player — a chunky rounded character with responsive, forgiving arcade
   movement. Not a physics sim: acceleration, coyote time, jump buffering and
   generous snapping keep it fun and readable.

   position = the character's FEET/base point (world). The visual body sits
   above it. The course reports the surface height under the feet.
   ========================================================================= */

class Player {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;

    // --- tuning (arcade & forgiving) ---
    this.moveSpeed = 11;
    this.accelGround = 14;      // how fast we reach target speed on ground
    this.accelAir = 7;
    this.gravity = -40;
    this.jumpVel = 15.5;
    this.coyoteTime = 0.12;     // can still jump shortly after leaving ground
    this.jumpBufferTime = 0.12; // pressing jump slightly early still works
    this.diveSpeed = 18;
    this.diveTime = 0.32;
    this.diveCooldown = 0.55;
    this.radius = 0.62;         // horizontal collision radius

    // --- state ---
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.grounded = false;
    this.facing = new THREE.Vector3(0, 0, -1);
    this._coyote = 0;
    this._jumpBuffer = 0;
    this._diveTimer = 0;
    this._diveCd = 0;
    this._stun = 0;
    this._wasGrounded = false;
    this._wobble = 0;           // squash/stretch accumulator
    this._runCycle = 0;
    this._standPlatform = null;

    this._buildMesh();
  }

  _buildMesh() {
    this.group = new THREE.Group();

    // Body: a chunky rounded jelly bean (two spheres + middle).
    const bodyColor = 0xff5da2;
    const bodyMat = glossyMat(bodyColor, { roughness: 0.28, metalness: 0.1, emissive: 0x3a0020, emissiveIntensity: 0.25 });

    this.body = new THREE.Group();
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 20), bodyMat);
    belly.scale.set(1, 1.15, 1);
    belly.position.y = 0.8;
    belly.castShadow = true;
    this.body.add(belly);
    this.belly = belly;

    // Little rounded head-bump / hat.
    const hat = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 20, 16),
      glossyMat(0x29d3ff, { roughness: 0.2, emissive: 0x004055, emissiveIntensity: 0.3 })
    );
    hat.position.y = 1.55;
    hat.scale.set(1, 0.75, 1);
    hat.castShadow = true;
    this.body.add(hat);

    // Eyes (whites + pupils) facing forward (-Z).
    const eyeWhiteMat = glossyMat(0xffffff, { roughness: 0.1 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1c1240, roughness: 0.3 });
    for (const sx of [-0.24, 0.24]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), eyeWhiteMat);
      white.position.set(sx, 1.0, -0.56);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), pupilMat);
      pupil.position.set(sx, 1.0, -0.69);
      this.body.add(white, pupil);
    }

    // Little feet.
    const footMat = glossyMat(0xffd23f, { roughness: 0.25 });
    for (const sx of [-0.3, 0.3]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), footMat);
      foot.scale.set(1, 0.6, 1.3);
      foot.position.set(sx, 0.16, -0.08);
      foot.castShadow = true;
      this.body.add(foot);
    }

    this.group.add(this.body);

    // Soft round contact shadow blob under the character.
    const shadowTex = this._makeShadowTexture();
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 })
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.02;
    this.group.add(this.blob);

    this.scene.add(this.group);
  }

  _makeShadowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  /* ---------------------- lifecycle ---------------------- */
  reset(spawn) {
    this.position.copy(spawn);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.facing.set(0, 0, -1);
    this._coyote = this._jumpBuffer = this._diveTimer = this._diveCd = this._stun = 0;
    this._wobble = 0;
    this._standPlatform = null;
    this.group.position.copy(this.position);
    this.body.scale.set(1, 1, 1);
  }

  respawn(point) {
    this.effects.respawn(new THREE.Vector3(point.x, point.y + 0.5, point.z));
    this.reset(point);
  }

  /* ---------------------- external impulses ---------------------- */
  knockback(dir, horiz, vert) {
    this.velocity.set(dir.x * horiz, vert, dir.z * horiz);
    this.grounded = false;
    this._stun = 0.35;
  }

  launch(dir, horiz, vert) {
    this.velocity.set(dir.x * horiz, vert, dir.z * horiz);
    this.grounded = false;
    this._stun = 0.18;
  }

  /* ---------------------- per-frame update ---------------------- */
  /**
   * @param {number} dt
   * @param {object} input { x, z, jumpPressed, jumpHeld, divePressed }
   * @param {Course} course
   */
  update(dt, input, course) {
    dt = Math.min(dt, 1 / 30); // clamp to keep collisions stable on hitches

    // Timers.
    if (this._diveCd > 0) this._diveCd -= dt;
    if (this._diveTimer > 0) this._diveTimer -= dt;
    if (this._stun > 0) this._stun -= dt;
    if (this._jumpBuffer > 0) this._jumpBuffer -= dt;
    if (this.grounded) this._coyote = this.coyoteTime;
    else if (this._coyote > 0) this._coyote -= dt;

    const control = this._stun > 0 ? 0.25 : 1;

    // --- Desired horizontal velocity (world-aligned, camera sits behind) ---
    let ix = input.x, iz = input.z;
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }

    const target = new THREE.Vector3(ix * this.moveSpeed, 0, iz * this.moveSpeed);
    const accel = (this.grounded ? this.accelGround : this.accelAir) * control;
    const k = 1 - Math.exp(-accel * dt); // frame-rate independent smoothing
    this.velocity.x += (target.x - this.velocity.x) * k;
    this.velocity.z += (target.z - this.velocity.z) * k;

    // Track facing from movement (for lean + dive direction).
    if (len > 0.1 && this._stun <= 0) {
      this.facing.set(ix, 0, iz).normalize();
    }

    // --- Dive / boost ---
    if (input.divePressed && this._diveCd <= 0 && this._stun <= 0) {
      const d = this.facing.lengthSq() > 0 ? this.facing.clone() : new THREE.Vector3(0, 0, -1);
      this.velocity.x = d.x * this.diveSpeed;
      this.velocity.z = d.z * this.diveSpeed;
      if (this.grounded) this.velocity.y = 5.5; // small forward hop
      this._diveTimer = this.diveTime;
      this._diveCd = this.diveCooldown;
      this.grounded = false;
      this.effects.dive(new THREE.Vector3(this.position.x, this.position.y + 0.4, this.position.z));
    }

    // --- Jump (with buffering + coyote time) ---
    if (input.jumpPressed) this._jumpBuffer = this.jumpBufferTime;
    if (this._jumpBuffer > 0 && this._coyote > 0) {
      this.velocity.y = this.jumpVel;
      this.grounded = false;
      this._jumpBuffer = 0;
      this._coyote = 0;
      this._wobble = -0.6; // stretch up
    }
    // Variable jump height: release early -> cut the rise.
    if (!input.jumpHeld && this.velocity.y > 6) {
      this.velocity.y = 6;
    }

    // --- Gravity ---
    this.velocity.y += this.gravity * dt;
    if (this.velocity.y < -45) this.velocity.y = -45; // terminal

    // --- Integrate ---
    this.position.addScaledVector(this.velocity, dt);

    // --- Ground resolution ---
    this._wasGrounded = this.grounded;
    const support = course.getSupport(this.position.x, this.position.z, this.position.y);
    this.grounded = false;
    this._standPlatform = null;

    if (support && this.velocity.y <= 0 && this.position.y <= support.y + 0.05) {
      // Land / stand.
      this.position.y = support.y;
      this.velocity.y = 0;
      this.grounded = true;
      this._standPlatform = support.platform;

      // Carry with moving platforms.
      const delta = support.platform.carryDelta && support.platform.carryDelta();
      if (delta) {
        this.position.x += delta.x;
        this.position.z += delta.z;
      }

      // Landing effect on touchdown.
      if (!this._wasGrounded && this._fallSpeed > 6) {
        this.effects.landing(new THREE.Vector3(this.position.x, this.position.y + 0.05, this.position.z));
        this._wobble = Math.min(1, this._fallSpeed / 18); // squash
      }
    }
    this._fallSpeed = -this.velocity.y; // store for next frame's landing check

    // --- Obstacle interactions (sweepers knock, bumpers launch) ---
    for (const ob of course.obstacles) {
      if (ob.resolve) ob.resolve(this, this.effects);
    }

    // --- Kill plane -> caller handles respawn via hasFallen() ---

    // --- Visuals ---
    this._animate(dt, len);
    this.group.position.copy(this.position);
  }

  hasFallen(killY) {
    return this.position.y < killY;
  }

  _animate(dt, moveLen) {
    // Ease wobble back to rest.
    this._wobble += (0 - this._wobble) * Math.min(1, dt * 9);

    // Squash & stretch: positive wobble = squash (landing), negative = stretch (jump).
    const w = this._wobble;
    const sy = 1 - w * 0.35;
    const sxz = 1 + w * 0.25;
    this.body.scale.set(sxz, sy, sxz);

    // Run cycle bob when moving on the ground.
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && moveLen > 0.1) {
      this._runCycle += dt * (6 + speed);
      this.body.position.y = Math.abs(Math.sin(this._runCycle)) * 0.12;
    } else {
      this._runCycle = 0;
      this.body.position.y += (0 - this.body.position.y) * Math.min(1, dt * 8);
    }

    // Lean toward movement / velocity direction.
    if (speed > 0.3) {
      const targetYaw = Math.atan2(this.facing.x, this.facing.z) + Math.PI;
      // Smooth yaw toward target.
      let cur = this.body.rotation.y;
      let diff = targetYaw - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.body.rotation.y = cur + diff * Math.min(1, dt * 12);
      // Forward lean proportional to speed.
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, Math.min(speed / this.moveSpeed, 1) * 0.25, Math.min(1, dt * 8));
    } else {
      this.body.rotation.x += (0 - this.body.rotation.x) * Math.min(1, dt * 8);
    }

    // Contact shadow follows ground, fades with height above it.
    this.blob.position.set(0, 0.02 - 0, 0);
  }
}

window.Player = Player;
