export class Entity {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.r = radius;
    this.vx = 0;
    this.vy = 0;
    this.hp = 1;
    this.maxHp = 1;
    this.alive = true;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx) {
    // Abstract
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) this.alive = false;
  }

  // Common circle collision
  collidesWith(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return (dx * dx + dy * dy) < (this.r + other.r) * (this.r + other.r);
  }
}
