/* ===========================================================================
   Course — builds the whole level: platforms, obstacles, checkpoints, sky,
   lighting and animated background pieces. Also answers ground-support queries
   used by the Player for arcade collision.

   World convention: +Y up, the course runs toward -Z ("forward").
   ========================================================================= */

class Course {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;

    this.solids = [];       // things you can stand on: { support(x,z), carryDelta(), mesh }
    this.obstacles = [];    // animated obstacles (sweepers, moving platforms, bumpers)
    this.checkpoints = [];  // Checkpoint gates (last one is the finish)
    this.background = [];    // animated decorative pieces

    this.STEP_TOLERANCE = 0.6;   // how high a ledge you can walk straight onto
    this.KILL_Y = -14;           // below this you fall out and respawn

    // Player spawn / initial respawn (feet rest just above the start pad).
    this.spawn = new THREE.Vector3(0, 0.15, 4);
    this.finish = null;
  }

  /* ----------------------------------------------------------------------
     Public build entry point.
     -------------------------------------------------------------------- */
  build() {
    this._buildLighting();
    this._buildSky();
    this._buildLayout();
    this._buildBackground();
  }

  /* ---------------------- Lighting & sky ---------------------- */
  _buildLighting() {
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a3a7a, 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(24, 46, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 80;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.sun = sun;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  }

  _buildSky() {
    // Gradient sky dome (top -> horizon).
    const uniforms = {
      top: { value: new THREE.Color(0x7b5cff) },
      bottom: { value: new THREE.Color(0x29d3ff) },
      offset: { value: 20 },
      exponent: { value: 0.7 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 bottom;
        uniform float offset;
        uniform float exponent;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos + vec3(0.0, offset, 0.0)).y;
          float t = max(pow(max(h, 0.0), exponent), 0.0);
          gl_FragColor = vec4(mix(bottom, top, t), 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
    this.scene.add(sky);

    this.scene.fog = new THREE.Fog(0x59b7ff, 90, 320);
  }

  /* ---------------------- Static platform helper ---------------------- */
  _addPlatform(cx, cy, cz, sx, sy, sz, color, opts = {}) {
    const mat = glossyMat(color, { roughness: 0.22, metalness: 0.15 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(cx, cy, cz);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);

    // glossy inset top for the toy look
    if (opts.stripe !== false) {
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(sx * 0.92, 0.06, sz * 0.92),
        glossyMat(opts.stripeColor != null ? opts.stripeColor : 0xffffff,
          { roughness: 0.08, metalness: 0.1, emissive: 0x1a2a4a, emissiveIntensity: 0.25 })
      );
      top.position.set(cx, cy + sy * 0.5 + 0.02, cz);
      top.receiveShadow = true;
      this.scene.add(top);
    }

    const topY = cy + sy * 0.5;
    const hx = sx * 0.5, hz = sz * 0.5;
    const solid = {
      mesh,
      carryDelta: () => null,
      support: (x, z) => {
        if (x < cx - hx || x > cx + hx) return null;
        if (z < cz - hz || z > cz + hz) return null;
        return topY;
      },
    };
    this.solids.push(solid);
    return solid;
  }

  /* ---------------------- Ramp helper (sloped, walkable) ---------------------- */
  _addRamp(x, zLow, zHigh, yLow, yHigh, width, color) {
    const length = Math.abs(zHigh - zLow);
    const rise = yHigh - yLow;
    const slopeLen = Math.hypot(length, rise);
    const mat = glossyMat(color, { roughness: 0.2, metalness: 0.18 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.8, slopeLen), mat);
    // Center of the ramp.
    const cz = (zLow + zHigh) / 2;
    const cy = (yLow + yHigh) / 2;
    mesh.position.set(x, cy, cz);
    // Rotate so it climbs from zLow(low) to zHigh(high). Forward is -Z.
    const angle = Math.atan2(rise, length) * (zHigh < zLow ? 1 : -1);
    mesh.rotation.x = angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // arrow chevrons for readability
    for (let i = 0; i < 3; i++) {
      const chev = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.4, 0.05, 0.6),
        glossyMat(0xffffff, { emissive: 0x224466, emissiveIntensity: 0.5 })
      );
      const f = (i + 1) / 4;
      chev.position.set(x, THREE.MathUtils.lerp(yLow, yHigh, f) + 0.45, THREE.MathUtils.lerp(zLow, zHigh, f));
      chev.rotation.x = angle;
      this.scene.add(chev);
    }

    const minZ = Math.min(zLow, zHigh), maxZ = Math.max(zLow, zHigh);
    const hx = width * 0.5;
    const solid = {
      mesh,
      carryDelta: () => null,
      support: (px, pz) => {
        if (px < x - hx || px > x + hx) return null;
        if (pz < minZ || pz > maxZ) return null;
        const t = (pz - zLow) / (zHigh - zLow);
        return THREE.MathUtils.lerp(yLow, yHigh, t) + 0.4; // +half thickness
      },
    };
    this.solids.push(solid);
    return solid;
  }

  _addObstacle(ob) {
    this.scene.add(ob.group);
    this.obstacles.push(ob);
    if (ob.solid) this.solids.push(ob);
    return ob;
  }

  _addCheckpoint(cfg) {
    const cp = new Checkpoint(cfg);
    this.scene.add(cp.group);
    this.checkpoints.push(cp);
    if (cp.isFinish) this.finish = cp;
    return cp;
  }

  /* ======================================================================
     The actual level layout.
     ====================================================================== */
  _buildLayout() {
    const C = {
      start: 0xff7ab8,
      sweep: 0x7b5cff,
      mid: 0x46e6b0,
      bridge: 0xffa24d,
      finish: 0xffd23f,
    };

    // 1) Starting platform ------------------------------------------------
    this._addPlatform(0, -0.5, 2, 14, 1, 16, C.start, { stripeColor: 0xffd7ec });
    // Decorative start arch (non-collidable).
    this._startBanner(0, 0, 8);

    // 2) Sweeper run ------------------------------------------------------
    this._addPlatform(0, -0.5, -21, 14, 1, 30, C.sweep, { stripeColor: 0xd9ccff });
    this._addObstacle(new Sweeper({
      center: { x: 0, y: 0, z: -14 }, radius: 4.6, speed: 1.5, dir: 1, barCount: 2, height: 0.9, phase: 0,
    }));
    this._addObstacle(new Sweeper({
      center: { x: 0, y: 0, z: -28 }, radius: 4.6, speed: 1.7, dir: -1, barCount: 2, height: 0.9, phase: Math.PI / 2,
    }));
    // Checkpoint at the start of the sweeper run.
    this._addCheckpoint({ index: 0, pos: { x: 0, y: 0, z: -8 }, respawn: { x: 0, y: 0.3, z: -8 } });

    // 3) Moving-platform crossing over a pit ------------------------------
    this._addObstacle(new MovingPlatform({
      from: { x: -5, y: 0, z: -40 }, to: { x: 5, y: 0, z: -40 },
      size: { x: 5.5, y: 0.7, z: 6 }, speed: 1.1, color: 0x29d3ff, phase: 0,
    }));
    this._addObstacle(new MovingPlatform({
      from: { x: 5, y: 0, z: -47 }, to: { x: -5, y: 0, z: -47 },
      size: { x: 5.5, y: 0.7, z: 6 }, speed: 1.1, color: 0x29d3ff, phase: Math.PI,
    }));

    // 4) Bumper garden ----------------------------------------------------
    this._addPlatform(0, -0.5, -60, 18, 1, 18, C.mid, { stripeColor: 0xc9fff0 });
    this._addCheckpoint({ index: 1, pos: { x: 0, y: 0, z: -52 }, respawn: { x: 0, y: 0.3, z: -53 } });
    this._addObstacle(new Bumper({ pos: { x: -4.5, y: 0, z: -58 }, radius: 1.5, strength: 17 }));
    this._addObstacle(new Bumper({ pos: { x: 4.5, y: 0, z: -60 }, radius: 1.5, strength: 17 }));
    this._addObstacle(new Bumper({ pos: { x: 0, y: 0, z: -64 }, radius: 1.6, strength: 18 }));

    // 5) Narrow bridge ----------------------------------------------------
    this._addPlatform(0, -0.5, -80, 4, 1, 26, C.bridge, { stripeColor: 0xffe0bf });
    this._addCheckpoint({ index: 2, pos: { x: 0, y: 0, z: -70 }, respawn: { x: 0, y: 0.3, z: -70 } });
    // A single sweeper mid-bridge — get the timing right or get knocked off!
    this._addObstacle(new Sweeper({
      center: { x: 0, y: 0, z: -82 }, radius: 3.4, speed: 1.9, dir: 1, barCount: 1, height: 0.9, phase: 0,
    }));

    // 6) Final ramp + finish zone ----------------------------------------
    this._addRamp(0, -93, -101, 0, 4, 8, C.finish);
    this._addPlatform(0, 3.5, -110, 16, 1, 16, C.finish, { stripeColor: 0xfff2c2 });
    this._addCheckpoint({
      index: 3, isFinish: true,
      pos: { x: 0, y: 4, z: -108 }, respawn: { x: 0, y: 4.3, z: -108 }, radius: 4,
    });
  }

  _startBanner(x, y, z) {
    const g = new THREE.Group();
    const postMat = glossyMat(0x2a1f5c, { metalness: 0.4 });
    const postGeo = new THREE.CylinderGeometry(0.3, 0.34, 6, 14);
    const l = new THREE.Mesh(postGeo, postMat); l.position.set(-6.4, 3, 0);
    const r = new THREE.Mesh(postGeo, postMat); r.position.set(6.4, 3, 0);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(13.6, 1.2, 0.6),
      glossyMat(0xff5da2, { emissive: 0x5a0030, emissiveIntensity: 0.5 }));
    bar.position.set(0, 6, 0);
    l.castShadow = r.castShadow = bar.castShadow = true;
    g.add(l, r, bar);
    // checkered flags on top
    for (let i = -1; i <= 1; i += 2) {
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4),
        glossyMat(0xffd23f, { emissive: 0x5a4600, emissiveIntensity: 0.5 }));
      flag.position.set(i * 6.4, 6.9, 0);
      g.add(flag);
    }
    g.position.set(x, y, z);
    this.scene.add(g);
    this.startBanner = g;
  }

  /* ---------------------- Animated background ---------------------- */
  _buildBackground() {
    const palette = [0xff5da2, 0x7b5cff, 0x29d3ff, 0xffd23f, 0x46e6b0, 0xff9a3d];
    const shapeMakers = [
      () => new THREE.IcosahedronGeometry(1, 0),
      () => new THREE.ConeGeometry(1, 2, 5),
      () => new THREE.TorusGeometry(1, 0.4, 10, 20),
      () => new THREE.BoxGeometry(1.6, 1.6, 1.6),
      () => new THREE.SphereGeometry(1.1, 16, 12),
    ];

    // Floating toy shapes drifting around the course.
    for (let i = 0; i < 44; i++) {
      const geo = shapeMakers[(Math.random() * shapeMakers.length) | 0]();
      const color = palette[(Math.random() * palette.length) | 0];
      const mesh = new THREE.Mesh(geo, glossyMat(color, {
        roughness: 0.3, emissive: color, emissiveIntensity: 0.15,
      }));
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (24 + Math.random() * 60);
      const y = 4 + Math.random() * 40;
      const z = 10 - Math.random() * 140;
      mesh.position.set(x, y, z);
      const s = 1 + Math.random() * 3;
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      this.background.push({
        mesh,
        baseY: y,
        bob: 0.4 + Math.random() * 1.2,
        bobSpeed: 0.4 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.6
        ),
      });
    }

    // Big slow rotating rings framing the scene.
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(30 + i * 14, 0.8, 12, 48),
        glossyMat(palette[i % palette.length], { emissive: palette[i % palette.length], emissiveIntensity: 0.25 })
      );
      ring.position.set(0, 18, -55);
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5);
      ring.rotation.y = Math.random();
      this.scene.add(ring);
      this.background.push({
        mesh: ring, baseY: 18, bob: 0, bobSpeed: 0, phase: 0,
        spin: new THREE.Vector3(0, 0, (0.05 + i * 0.03) * (i % 2 ? -1 : 1)),
      });
    }

    // Puffy clouds (clustered spheres) low on the horizon.
    for (let i = 0; i < 10; i++) {
      const cloud = new THREE.Group();
      const cmat = glossyMat(0xffffff, { roughness: 0.9, metalness: 0, emissive: 0xdfe9ff, emissiveIntensity: 0.15 });
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1.4 + Math.random(), 12, 10), cmat);
        puff.position.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 3);
        cloud.add(puff);
      }
      cloud.position.set((Math.random() - 0.5) * 160, 22 + Math.random() * 26, -30 - Math.random() * 130);
      cloud.scale.setScalar(1.4 + Math.random() * 1.6);
      this.scene.add(cloud);
      this.background.push({
        mesh: cloud, baseY: cloud.position.y, bob: 0.6, bobSpeed: 0.2 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2, spin: new THREE.Vector3(0, 0, 0),
        drift: 0.4 + Math.random() * 0.5,
      });
    }
  }

  /* ======================================================================
     Per-frame updates.
     ====================================================================== */
  update(elapsed, dt) {
    for (const ob of this.obstacles) ob.update(elapsed, dt);
    for (const cp of this.checkpoints) cp.update(dt);

    for (const b of this.background) {
      if (b.bob) b.mesh.position.y = b.baseY + Math.sin(elapsed * b.bobSpeed + b.phase) * b.bob;
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      b.mesh.rotation.z += b.spin.z * dt;
      if (b.drift) {
        b.mesh.position.x += b.drift * dt;
        if (b.mesh.position.x > 90) b.mesh.position.x = -90;
      }
    }
  }

  /* ----------------------------------------------------------------------
     Ground query: highest supporting surface under (x,z) that the feet at
     feetY can stand on (within STEP_TOLERANCE above the feet). Returns
     { y, platform } or null over a pit.
     -------------------------------------------------------------------- */
  getSupport(x, z, feetY) {
    let best = null;
    let bestPlatform = null;
    for (const s of this.solids) {
      const top = s.support(x, z);
      if (top == null) continue;
      if (top <= feetY + this.STEP_TOLERANCE) {
        if (best == null || top > best) {
          best = top;
          bestPlatform = s;
        }
      }
    }
    if (best == null) return null;
    return { y: best, platform: bestPlatform };
  }
}

window.Course = Course;
