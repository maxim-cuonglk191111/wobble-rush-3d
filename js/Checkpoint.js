/* ===========================================================================
   Checkpoint — a glowing gate the player passes through. The latest activated
   checkpoint becomes the respawn point. The finish is a special checkpoint.
   ========================================================================= */

class Checkpoint {
  /**
   * @param {object} cfg { pos:{x,y,z}, respawn:{x,y,z}, isFinish, index }
   */
  constructor(cfg) {
    this.index = cfg.index;
    this.isFinish = !!cfg.isFinish;
    this.position = new THREE.Vector3(cfg.pos.x, cfg.pos.y, cfg.pos.z);
    // Where the player respawns if they fall after reaching this checkpoint.
    this.respawn = new THREE.Vector3(
      cfg.respawn ? cfg.respawn.x : cfg.pos.x,
      cfg.respawn ? cfg.respawn.y : cfg.pos.y + 1.2,
      cfg.respawn ? cfg.respawn.z : cfg.pos.z
    );
    this.triggerRadius = cfg.radius != null ? cfg.radius : 3.2;
    this.activated = false;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    const accent = this.isFinish ? 0xffd23f : 0x46e6b0;
    const postMat = glossyMat(0x2a1f5c, { metalness: 0.4 });
    const glowMat = glossyMat(accent, { emissive: accent, emissiveIntensity: 0.6, roughness: 0.2 });

    // Two posts + top bar forming a gate.
    const postGeo = new THREE.CylinderGeometry(0.28, 0.32, 5, 14);
    const left = new THREE.Mesh(postGeo, postMat);
    left.position.set(-2.6, 2.5, 0);
    left.castShadow = true;
    const right = new THREE.Mesh(postGeo, postMat);
    right.position.set(2.6, 2.5, 0);
    right.castShadow = true;
    this.group.add(left, right);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.5, 0.5), glowMat.clone());
    bar.position.set(0, 5, 0);
    this.group.add(bar);
    this.bar = bar;

    // Glowing curtain plane in the gate opening.
    this.curtainMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    this.curtain = new THREE.Mesh(new THREE.PlaneGeometry(5, 4.6), this.curtainMat);
    this.curtain.position.set(0, 2.6, 0);
    this.group.add(this.curtain);

    // Floating flag / banner toppers.
    const flag = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.1, 4),
      glowMat.clone()
    );
    flag.position.set(0, 5.8, 0);
    flag.rotation.y = Math.PI / 4;
    this.group.add(flag);
    this.flag = flag;

    this.accentColor = accent;
    this._t = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this._t += dt;
    // Idle shimmer.
    const pulse = this.activated ? 0.9 : 0.45 + Math.sin(this._t * 3) * 0.2;
    this.bar.material.emissiveIntensity = pulse;
    this.flag.material.emissiveIntensity = pulse;
    this.curtainMat.opacity = this.activated ? 0.05 : 0.18 + Math.sin(this._t * 3) * 0.06;
    this.flag.rotation.y += dt * 1.2;
    // Gentle bob for the topper.
    this.flag.position.y = 5.8 + Math.sin(this._t * 2) * 0.12;
  }

  /** @returns {boolean} true the first time the player enters. */
  tryActivate(playerPos) {
    if (this.activated) return false;
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dy = playerPos.y - this.position.y;
    if (Math.hypot(dx, dz) < this.triggerRadius && dy > -3 && dy < 6) {
      this.activated = true;
      // Turn the whole gate brighter/gold-ish on activation.
      if (!this.isFinish) {
        const c = 0xffd23f;
        this.bar.material.color.setHex(c);
        this.bar.material.emissive.setHex(c);
        this.flag.material.color.setHex(c);
        this.flag.material.emissive.setHex(c);
      }
      return true;
    }
    return false;
  }
}

window.Checkpoint = Checkpoint;
