/* ===========================================================================
   Effects — pooled particle bursts for landing, checkpoint, dive, respawn,
   finish. Kept deliberately arcade-y and cheap (small glossy cubes).
   ========================================================================= */

class Effects {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.POOL_SIZE = 220;

    const geo = new THREE.BoxGeometry(1, 1, 1);

    for (let i = 0; i < this.POOL_SIZE; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.25,
        metalness: 0.1,
        emissive: 0x000000,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.castShadow = false;
      scene.add(mesh);
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        spin: new THREE.Vector3(),
        gravity: -30,
      });
    }
  }

  _get() {
    return this.pool.pop() || null;
  }

  /**
   * Spawn a burst of particles.
   * @param {THREE.Vector3} pos
   * @param {object} opts
   */
  burst(pos, opts = {}) {
    const {
      count = 14,
      colors = [0xffffff],
      speed = 8,
      up = 4,
      size = 0.28,
      life = 0.7,
      gravity = -30,
      spread = 1,
    } = opts;

    for (let i = 0; i < count; i++) {
      const p = this._get();
      if (!p) break;

      const color = colors[(Math.random() * colors.length) | 0];
      p.mesh.material.color.setHex(color);
      p.mesh.material.emissive.setHex(color);
      p.mesh.material.emissiveIntensity = 0.4;
      p.mesh.material.opacity = 1;

      const s = size * (0.6 + Math.random() * 0.8);
      p.mesh.scale.set(s, s, s);
      p.mesh.position.copy(pos);
      p.mesh.visible = true;

      const ang = Math.random() * Math.PI * 2;
      const radial = speed * (0.4 + Math.random() * 0.6) * spread;
      p.vel.set(
        Math.cos(ang) * radial,
        up * (0.5 + Math.random()),
        Math.sin(ang) * radial
      );
      p.spin.set(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16
      );
      p.gravity = gravity;
      p.life = 0;
      p.maxLife = life * (0.7 + Math.random() * 0.6);

      this.active.push(p);
    }
  }

  /* ---- Themed presets ---- */
  landing(pos) {
    this.burst(pos, { count: 12, colors: [0xffffff, 0xbfe9ff], speed: 6, up: 2.5, life: 0.45, size: 0.22 });
  }
  dive(pos) {
    this.burst(pos, { count: 16, colors: [0x29d3ff, 0x7b5cff], speed: 10, up: 3, life: 0.55, size: 0.26 });
  }
  checkpoint(pos) {
    this.burst(pos, { count: 30, colors: [0x46e6b0, 0xffd23f, 0xffffff], speed: 9, up: 8, life: 1.0, size: 0.3 });
  }
  respawn(pos) {
    this.burst(pos, { count: 24, colors: [0xff5da2, 0x7b5cff, 0xffffff], speed: 8, up: 6, life: 0.8, size: 0.28 });
  }
  bounce(pos) {
    this.burst(pos, { count: 14, colors: [0xffd23f, 0xff5da2], speed: 8, up: 5, life: 0.5, size: 0.24 });
  }
  finish(pos) {
    this.burst(pos, {
      count: 60, colors: [0xffd23f, 0x29d3ff, 0xff5da2, 0x46e6b0, 0xffffff],
      speed: 14, up: 14, life: 1.6, size: 0.34, gravity: -22,
    });
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life += dt;
      const t = p.life / p.maxLife;

      if (t >= 1) {
        p.mesh.visible = false;
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }

      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;

      // fade + shrink in the last third of life
      const fade = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      p.mesh.material.opacity = fade;
    }
  }
}

window.Effects = Effects;
