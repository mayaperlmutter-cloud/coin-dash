/* global Phaser, COIN_DASH */
const HIGH_SCORE_KEY = 'coinDash.highScore';

// Tiny Web Audio synth: no audio files. The context is created lazily on first use
// because browsers only allow audio to start after a user gesture (a key press here).
const Sfx = {
  ctx: null,
  context() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) this.ctx = new AudioCtx();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(ctx, freq, start, length, volume) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  },
  coin() {
    const ctx = this.context();
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = COIN_DASH.soundVolume || 0.15;
    // Classic two-note "bling": B5 then E6.
    this.tone(ctx, 987.77, t, 0.08, v);
    this.tone(ctx, 1318.51, t + 0.07, 0.22, v);
  }
};

class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    this.score = 0;
    this.highScore = this.loadHighScore();
    this.finished = false;
    this.paused = false;
    this.deadline = this.time.now + c.roundSeconds * 1000;
    this.physics.world.setBounds(0, 44, c.width, c.height - 44);
    this.add.grid(c.width / 2, c.height / 2, c.width, c.height, 40, 40,
      c.colors.background, 1, c.colors.grid, 0.5);
    this.hud = this.add.text(18, 12, '', { font: '18px monospace', color: c.textColors.hud });
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.coin = this.add.circle(100, 100, 9, c.colors.coin);
    this.physics.add.existing(this.coin);
    this.coin.body.setCircle(9);
    this.placeCoin();
    this.drones = this.physics.add.group();
    for (let i = 0; i < c.droneCount; i++) {
      const drone = this.add.rectangle(90 + i * 270, 100, 26, 26, c.colors.drone);
      this.drones.add(drone);
      drone.body.setCollideWorldBounds(true).setBounce(1, 1);
      const angle = (35 + i * 105) * Math.PI / 180;
      drone.body.setVelocity(Math.cos(angle) * c.droneSpeed, Math.sin(angle) * c.droneSpeed);
    }
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.score++;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        this.saveHighScore(this.highScore);
      }
      Sfx.coin();
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.drones, () => this.finish('A drone caught you!'));
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R,P,SPACE');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    this.input.keyboard.on('keydown-P', () => this.togglePause());
    this.input.keyboard.on('keydown-SPACE', () => this.togglePause());
    this.pauseOverlay = this.add.container(c.width / 2, c.height / 2, [
      this.add.rectangle(0, 0, c.width, c.height, c.colors.overlay, 0.7),
      this.add.text(0, -14, 'PAUSED', { font: 'bold 48px monospace', color: c.textColors.hud }).setOrigin(0.5),
      this.add.text(0, 36, 'Press P or Space to resume', { font: '18px monospace', color: c.textColors.muted })
        .setOrigin(0.5)
    ]).setDepth(10).setVisible(false);
  }

  togglePause() {
    if (this.finished) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.pausedAt = this.time.now;
      this.physics.pause();
    } else {
      // Freeze the round timer while paused by pushing the deadline back.
      this.deadline += this.time.now - this.pausedAt;
      this.physics.resume();
    }
    this.pauseOverlay.setVisible(this.paused);
  }

  loadHighScore() {
    // localStorage can be unavailable (e.g. blocked storage); fall back to 0.
    try {
      const value = parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (e) {
      return 0;
    }
  }

  saveHighScore(value) {
    try {
      localStorage.setItem(HIGH_SCORE_KEY, String(value));
    } catch (e) {
      // Ignore storage errors; the high score still shows for this session.
    }
  }

  placeCoin() {
    const c = COIN_DASH;
    // Avoid spawning the next coin directly underneath the player.
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 60);
    this.coin.setPosition(x, y);
    this.coin.body.reset(x, y);
  }

  update() {
    if (this.finished || this.paused) return;
    const dx = Number(this.cursors.right.isDown || this.keys.D.isDown)
      - Number(this.cursors.left.isDown || this.keys.A.isDown);
    const dy = Number(this.cursors.down.isDown || this.keys.S.isDown)
      - Number(this.cursors.up.isDown || this.keys.W.isDown);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(COIN_DASH.playerSpeed);
    this.player.body.setVelocity(direction.x, direction.y);
    const seconds = Math.max(0, Math.ceil((this.deadline - this.time.now) / 1000));
    this.hud.setText(`Coins: ${this.score}        High Score: ${this.highScore}        Time: ${seconds}s`);
    if (seconds === 0) this.finish('Time is up!');
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 190, c.colors.overlay, 0.95)
      .setStrokeStyle(2, c.colors.grid);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} coins collected\nHigh Score: ${this.highScore}\nPress R to try again`,
      { font: '24px monospace', color: c.textColors.hud, align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5);
  }
}

window.coinDashGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: COIN_DASH.width,
  height: COIN_DASH.height,
  backgroundColor: COIN_DASH.colors.background,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene: CoinDash
});