import Phaser from 'phaser';

export class CombatScene extends Phaser.Scene {
  constructor() {
    super('combat');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#091321');
    this.drawForest();
    this.createAmbientMagic();
    this.scale.on('resize', () => {
      this.children.removeAll(true);
      this.drawForest();
      this.createAmbientMagic();
    });
  }

  private drawForest(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x091321, 0x091321, 0x13283a, 0x13283a, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.fillStyle(0x132b2c, 0.9);
    for (let x = -20; x < width + 50; x += 90) {
      const trunkWidth = 18 + ((x + 20) % 24);
      graphics.fillRect(x, 0, trunkWidth, height * 0.82);
      graphics.fillTriangle(x - 80, height * 0.22, x + trunkWidth / 2, -30, x + 100, height * 0.28);
    }
    graphics.fillStyle(0x081116, 0.75);
    graphics.fillEllipse(width * 0.5, height * 1.02, width * 1.25, height * 0.46);
    graphics.lineStyle(2, 0xd7b968, 0.14);
    for (let i = 0; i < 8; i += 1) {
      graphics.strokeCircle(width * (0.2 + i * 0.09), height * 0.55, 35 + i * 12);
    }
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
