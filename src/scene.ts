import Phaser from 'phaser';

export class CombatScene extends Phaser.Scene {
  constructor() {
    super('combat');
  }

  create(): void {
    this.createAmbientMagic();
    this.scale.on('resize', () => {
      this.children.removeAll(true);
      this.createAmbientMagic();
    });
  }

  private createAmbientMagic(): void {
    const dot = this.add.graphics();
    dot.fillStyle(0x73cfff, 1);
    dot.fillCircle(2, 2, 2);
    dot.generateTexture('magic-dot', 4, 4);
    dot.destroy();
    this.add.particles(0, 0, 'magic-dot', {
      x: { min: 0, max: this.scale.width }, y: { min: this.scale.height * 0.3, max: this.scale.height },
      lifespan: { min: 2500, max: 5000 }, speedY: { min: -12, max: -3 }, speedX: { min: -5, max: 5 },
      scale: { start: 0.8, end: 0 }, alpha: { start: 0.42, end: 0 }, frequency: 180,
    });
  }

  castEffect(color = 0x70cfff): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const line = this.add.graphics();
    line.lineStyle(8, color, 0.9);
    line.beginPath();
    line.moveTo(width * 0.28, height * 0.48);
    line.lineTo(width * 0.72, height * 0.42);
    line.strokePath();
    this.tweens.add({ targets: line, alpha: 0, duration: 320, onComplete: () => line.destroy() });
  }
}
