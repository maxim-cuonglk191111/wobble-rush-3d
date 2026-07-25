/* ===========================================================================
   Obstacle — base class plus three arcade obstacle types:
     - Sweeper      : rotating bar you must jump over (knocks you back)
     - MovingPlatform: a solid platform that slides back and forth (carries you)
     - Bumper       : a springy pad that launches you away on contact

   Obstacles expose:
     update(elapsed, dt)  — animate
     support(x, z)        — top surface Y if (x,z) is over a standing surface,
                            else null  (only solid obstacles override this)
     carryDelta()         — world-space movement since last frame (for carrying)
     resolve(player, fx)  — apply hit / bounce reactions to the player
   ========================================================================= */

class Obstacle {
  constructor() {
    this.group = new THREE.Group();
    this.solid = false;
  }
  update(/* elapsed, dt */) {}
  support(/* x, z */) { return null; }
  carryDelta() { return null; }
  resolve(/* player, fx */) {}
}

/* --------------------------------------------------------------------------
   Materials helper — glossy toy look.
   ------------------------------------------------------------------------ */
function glossyMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness != null ? opts.roughness : 0.25,
    metalness: opts.metalness != null ? opts.metalness : 0.15,
    emissive: opts.emissive != null ? opts.emissive : 0x000000,
    emissiveIntensity: opts.emissiveIntensity != null ? opts.emissiveIntensity : 1,
  });
}

/* ==========================================================================
   Sweeper: a central hub with one or two bars rotating in the horizontal plane.
   ========================================================================== */
class Sweeper extends Obstacle {
  /**
   * @param {object} cfg { center:{x,y,z}, radius, speed, dir, barCount, height }
   */
  constructor(cfg) {
    super();
    this.center = new THREE.Vector3(cfg.center.x, cfg.center.y, cfg.center.z);
    this.radius = cfg.radius;
    this.speed = cfg.speed != null ? cfg.speed : 1.6;
    this.dir = cfg.dir != null ? cfg.dir : 1;
    this.barCount = cfg.barCount || 2;
    this.barHeight = cfg.height != null ? cfg.height : 1.1;
    this.angle = cfg.phase || 0;
    this.hitCooldown = 0;

    // Hub post
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, this.barHeight + 1.2, 16),
      glossyMat(0x3a2a6b, { metalness: 0.4 })
    );
    post.position.copy(this.center);
    post.position.y += (this.barHeight + 1.2) / 2 - 0.6;
    post.castShadow = true;
    this.group.add(post);

    // Rotating bars
    this.barsGroup = new THREE.Group();
    this.barsGroup.position.copy(this.center);
    this.barsGroup.position.y += this.barHeight * 0.5;
    this.group.add(this.barsGroup);

    const barGeo = new THREE.BoxGeometry(this.radius * 2, this.barHeight, 0.6);
    for (let i = 0; i < this.barCount; i++) {
      const bar = new THREE.Mesh(barGeo, glossyMat(0xff5da2, { emissive: 0x5a0030, emissiveIntensity: 0.6 }));
      bar.castShadow = true;
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / this.barCount) * Math.PI * 2;
      // Offset the bar so the hub is at one end -> full-length sweep across the path.
      bar.position.x = this.radius;
      // rounded caps
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 12, 12),
        glossyMat(0xffd23f, { emissive: 0x5a4600, emissiveIntensity: 0.5 })
      );
      cap.position.x = this.radius * 2;
      bar.add(cap);
      pivot.add(bar);
      this.barsGroup.add(pivot);
    }
  }

  update(elapsed, dt) {
    this.angle += this.speed * this.dir * dt;
    this.barsGroup.rotation.y = this.angle;
    if (this.hitCooldown > 0) this.hitCooldown -= dt;
  }

  resolve(player, fx) {
    if (this.hitCooldown > 0) return;
    // Only dangerous within the vertical band of the bars.
    const py = player.position.y;
    const barY = this.center.y + this.barHeight * 0.5;
    if (py < barY - this.barHeight || py > barY + this.barHeight) return;

    // Distance from player to each bar segment (hub -> tip), 2 * radius long.
    for (let i = 0; i < this.barCount; i++) {
      const a = this.angle + (i / this.barCount) * Math.PI * 2;
      // A rotation of `a` about Y sends the local +X axis to world (cos a, 0, -sin a).
      const dx = Math.cos(a);
      const dz = -Math.sin(a);
      // Closest point on the bar segment (hub -> tip, length 2*radius).
      const px = player.position.x - this.center.x;
      const pz = player.position.z - this.center.z;
      let t = px * dx + pz * dz;
      t = Math.max(0, Math.min(this.radius * 2, t));
      const cx = dx * t;
      const cz = dz * t;
      let ox = px - cx;
      let oz = pz - cz;
      const dist = Math.hypot(ox, oz);
      if (dist < player.radius + 0.55) {
        // Knock the player away from the bar, biased backward down the course.
        if (dist < 0.001) { ox = 0; oz = 1; }
        const knockDir = new THREE.Vector3(ox, 0, oz + 0.5).normalize();
        player.knockback(knockDir, 15, 6.5);
        this.hitCooldown = 0.5;
        if (fx) fx.bounce(player.position.clone());
        return;
      }
    }
  }
}

/* ==========================================================================
   MovingPlatform: solid box that slides between two points; carries the player.
   ========================================================================== */
class MovingPlatform extends Obstacle {
  /**
   * @param {object} cfg { from:{x,y,z}, to:{x,y,z}, size:{x,y,z}, speed, color, phase }
   */
  constructor(cfg) {
    super();
    this.solid = true;
    this.from = new THREE.Vector3(cfg.from.x, cfg.from.y, cfg.from.z);
    this.to = new THREE.Vector3(cfg.to.x, cfg.to.y, cfg.to.z);
    this.size = new THREE.Vector3(cfg.size.x, cfg.size.y, cfg.size.z);
    this.speed = cfg.speed != null ? cfg.speed : 0.6;
    this.phase = cfg.phase || 0;

    const mat = glossyMat(cfg.color != null ? cfg.color : 0x29d3ff, { roughness: 0.2, metalness: 0.2 });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(this.size.x, this.size.y, this.size.z), mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    // glossy top stripe for readability
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(this.size.x * 0.9, 0.08, this.size.z * 0.9),
      glossyMat(0xffffff, { emissive: 0x224466, emissiveIntensity: 0.4, roughness: 0.1 })
    );
    stripe.position.y = this.size.y * 0.5 + 0.02;
    this.mesh.add(stripe);

    this.pos = this.from.clone();
    this.prevPos = this.from.clone();
    this._delta = new THREE.Vector3();
    this._syncMesh();
  }

  _syncMesh() {
    this.mesh.position.copy(this.pos);
  }

  update(elapsed, dt) {
    this.prevPos.copy(this.pos);
    // Smooth ping-pong 0..1..0
    const s = (Math.sin(elapsed * this.speed + this.phase) + 1) * 0.5;
    this.pos.lerpVectors(this.from, this.to, s);
    this._delta.subVectors(this.pos, this.prevPos);
    this._syncMesh();
  }

  support(x, z) {
    const hx = this.size.x * 0.5;
    const hz = this.size.z * 0.5;
    if (x < this.pos.x - hx || x > this.pos.x + hx) return null;
    if (z < this.pos.z - hz || z > this.pos.z + hz) return null;
    return this.pos.y + this.size.y * 0.5;
  }

  carryDelta() {
    return this._delta;
  }
}

/* ==========================================================================
   Bumper: a springy cylinder pad. On contact it launches the player away + up.
   ========================================================================== */
class Bumper extends Obstacle {
  /**
   * @param {object} cfg { pos:{x,y,z}, radius, strength }
   */
  constructor(cfg) {
    super();
    this.pos = new THREE.Vector3(cfg.pos.x, cfg.pos.y, cfg.pos.z);
    this.radius = cfg.radius != null ? cfg.radius : 1.4;
    this.strength = cfg.strength != null ? cfg.strength : 20;
    this.height = 1.8;
    this.squash = 0;
    this.cooldown = 0;

    this.body = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius, this.radius * 0.85, this.height, 24),
      glossyMat(0xffd23f, { emissive: 0x5a3d00, emissiveIntensity: 0.5, roughness: 0.15 })
    );
    this.body.position.copy(this.pos);
    this.body.position.y += this.height * 0.5;
    this.body.castShadow = true;
    this.group.add(this.body);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(this.radius * 0.95, 0.16, 12, 28),
      glossyMat(0xff5da2, { emissive: 0x5a0030, emissiveIntensity: 0.6 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = this.height;
    this.body.add(ring);
  }

  update(elapsed, dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    // ease squash back to normal
    this.squash += (0 - this.squash) * Math.min(1, dt * 10);
    const sy = 1 - this.squash * 0.5;
    const sxz = 1 + this.squash * 0.35;
    this.body.scale.set(sxz, sy, sxz);
    // idle glow pulse
    const pulse = 0.5 + Math.sin(elapsed * 4 + this.pos.x) * 0.15;
    this.body.material.emissiveIntensity = pulse;
  }

  support(x, z) {
    // Standing on top of the bumper before it fires.
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (d > this.radius) return null;
    return this.pos.y + this.height;
  }

  resolve(player, fx) {
    if (this.cooldown > 0) return;
    const dx = player.position.x - this.pos.x;
    const dz = player.position.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const topY = this.pos.y + this.height;
    // Fire when the player is near the top surface (landing on it) or brushing the side.
    const nearTop = player.position.y <= topY + 0.8 && player.position.y >= this.pos.y;
    if (d < this.radius + player.radius && nearTop) {
      let dir;
      if (d < 0.4) dir = new THREE.Vector3(0, 0, -1);       // dead-centre -> forward
      else dir = new THREE.Vector3(dx / d, 0, dz / d);
      player.launch(dir, this.strength, this.strength * 1.05);
      this.squash = 1;
      this.cooldown = 0.35;
      if (fx) fx.bounce(new THREE.Vector3(this.pos.x, topY, this.pos.z));
    }
  }
}

window.Obstacle = Obstacle;
window.Sweeper = Sweeper;
window.MovingPlatform = MovingPlatform;
window.Bumper = Bumper;
window.glossyMat = glossyMat;
