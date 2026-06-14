/*
 * Dino runner — ported from flo-bit's blento DinoGameCard (Svelte) to vanilla
 * JS. Game logic, sprite positions and tilemap are unchanged from the original.
 * Source: https://github.com/flo-bit/blento  (MIT)
 * Art: Kenney "1-Bit Platformer Pack" (CC0) via the same repo's static/dino.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('dino-canvas');
  const ctx = canvas.getContext('2d');

  let animationId;
  let gameState = 'idle'; // 'idle' | 'playing' | 'gameover'
  let score = 0;
  let highScore = 0;

  let spritesLoaded = false;
  const sprites = {}; // key -> offscreen canvas

  const TILE_SIZE = 16;

  let scale = 2.5;
  let scaledTile = TILE_SIZE * scale;

  const GRAVITY_BASE = 0.6;
  const JUMP_FORCE_BASE = -12;
  let gravity = GRAVITY_BASE;
  let jumpForce = JUMP_FORCE_BASE;
  let groundHeight = scaledTile + 10;
  let floorDrawHeight = Math.round(scaledTile * 0.4);

  let player = {
    x: 50, y: 0, width: scaledTile, height: scaledTile,
    velocityY: 0, isJumping: false, isDucking: false, frame: 0
  };

  let obstacles = [];
  let groundTiles = [];

  let gameSpeed = 5;
  let frameCount = 0;
  let lastFrameTimestamp = 0;
  let lastSpawnFrame = 0;
  let lastWalkFrame = 0;
  let lastBatFrame = 0;
  let lastSpeedScore = 0;
  const FRAME_TIME_MS = 1000 / 60;
  const MAX_SPEED_BASE = 14;

  let legTimerMs = 0;
  const LEG_FRAME_MS = 90;
  function animateLegs(deltaMs) {
    legTimerMs += deltaMs;
    if (legTimerMs >= LEG_FRAME_MS) {
      legTimerMs -= LEG_FRAME_MS;
      player.frame = (player.frame + 1) % 3;
    }
  }

  let introActive = false;
  let runX = 0;
  let introTimer = 0;
  let introStartX = 0;
  const INTRO_HOP_DUR = 0.55;
  const INTRO_WALK_DUR = 0.55;
  let introHopHeight = 0;

  const SPRITE_POSITIONS = {
    playerWalk1: { row: 14, col: 2 },
    playerWalk2: { row: 14, col: 3 },
    playerWalk3: { row: 14, col: 4 },
    playerJump: { row: 14, col: 5 },
    playerFall: { row: 14, col: 6 },
    playerDuck: { row: 14, col: 6 },
    floor: { row: 5, col: 6 },
    mushroom: { row: 3, col: 15 },
    spikes: { row: 10, col: 4 },
    plant1: { row: 1, col: 17 },
    plant2: { row: 1, col: 18 },
    plant3: { row: 1, col: 19 },
    plant4: { row: 2, col: 17 },
    plant5: { row: 2, col: 18 },
    plant6: { row: 2, col: 19 },
    bat1: { row: 20, col: 1 },
    bat2: { row: 20, col: 2 }
  };

  const DINO_GRAY = '#acacac';

  function extractTile(img, row, col) {
    const offscreen = document.createElement('canvas');
    offscreen.width = TILE_SIZE;
    offscreen.height = TILE_SIZE;
    const offCtx = offscreen.getContext('2d');
    const TILE_SPACING = 1;
    const sx = (col - 1) * (TILE_SIZE + TILE_SPACING);
    const sy = (row - 1) * (TILE_SIZE + TILE_SPACING);
    offCtx.drawImage(img, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
    offCtx.globalCompositeOperation = 'source-in';
    offCtx.fillStyle = DINO_GRAY;
    offCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    offCtx.globalCompositeOperation = 'source-over';
    return offscreen;
  }

  function buildFloorLine() {
    const src = sprites.floor;
    if (!src) return;
    const line = document.createElement('canvas');
    line.width = TILE_SIZE; line.height = 1;
    line.getContext('2d').drawImage(src, 0, 0, TILE_SIZE, 1, 0, 0, TILE_SIZE, 1);
    sprites.floorLine = line;

    const bump = document.createElement('canvas');
    bump.width = 3; bump.height = 2;
    bump.getContext('2d').drawImage(src, 5, 8, 3, 2, 0, 0, 3, 2);
    sprites.floorBump = bump;
  }

  function loadSprites() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        for (const key in SPRITE_POSITIONS) {
          const pos = SPRITE_POSITIONS[key];
          sprites[key] = extractTile(img, pos.row, pos.col);
        }
        buildFloorLine();
        spritesLoaded = true;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = 'assets/dino/Tilemap/monochrome_tilemap_transparent.png';
    });
  }

  function calculateScale() {
    if (!canvas) return;
    const targetTilesVertical = 3.75;
    scale = Math.max(1.5, Math.min(5, canvas.height / (TILE_SIZE * targetTilesVertical)));
    scaledTile = TILE_SIZE * scale;
    const scaleRatio = scale / 2.5;
    gravity = GRAVITY_BASE * scaleRatio;
    floorDrawHeight = Math.max(4, Math.round(6 * scaleRatio));
    groundHeight = Math.round(canvas.height * 0.073);

    const standingTop = canvas.height - groundHeight - scaledTile;
    const jumpHeight = Math.max(20, (standingTop - 2) * 0.98);
    jumpForce = -Math.sqrt(2 * gravity * jumpHeight);
    player.width = scaledTile;
    player.height = scaledTile;
    introStartX = -Math.round(scaledTile * 0.125);
    runX = Math.round(scaledTile * 0.9);
    player.x = introStartX;
    introHopHeight = Math.max(20, standingTop - 6);
  }

  function resetGame(withIntro) {
    calculateScale();
    player = {
      x: withIntro ? introStartX : runX, y: 0,
      width: scaledTile, height: scaledTile,
      velocityY: 0, isJumping: false, isDucking: false, frame: 0
    };
    introActive = !!withIntro;
    obstacles = [];
    gameSpeed = 4.2 * (scale / 2.5);
    score = 0;
    frameCount = 0;
    lastSpawnFrame = 0;
    lastWalkFrame = 0;
    lastBatFrame = 0;
    lastSpeedScore = 0;
    initGroundTiles();
  }

  function tileMarks() {
    const marks = [];
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      marks.push({
        x: Math.floor(Math.random() * (scaledTile - 4)),
        w: 1 + Math.floor(Math.random() * 4)
      });
    }
    return marks;
  }

  function initGroundTiles() {
    if (!canvas) return;
    groundTiles = [];
    const numTiles = Math.ceil(canvas.width / scaledTile) + 4;
    for (let i = 0; i < numTiles; i++) {
      groundTiles.push({ x: i * scaledTile, marks: tileMarks() });
    }
  }

  function startGame(withIntro) {
    resetGame(withIntro);
    gameState = 'playing';
    introTimer = 0;
  }

  function jump() {
    if (gameState === 'idle') {
      startGame(true);
      return;
    }
    if (gameState === 'gameover') {
      startGame(false);
      return;
    }
    if (!player.isJumping && !player.isDucking) {
      player.velocityY = jumpForce;
      player.isJumping = true;
    }
  }

  function duck(ducking) {
    if (gameState !== 'playing') return;
    if (ducking && !player.isJumping) {
      player.isDucking = true;
    } else if (!ducking) {
      player.isDucking = false;
    }
  }

  function handleKeyDown(e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      jump();
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      duck(true);
    }
  }

  function handleKeyUp(e) {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      duck(false);
    }
  }

  function handleTouch(e) {
    e.preventDefault();
    jump();
  }

  function spawnObstacle(canvasWidth, groundY) {
    const rand = Math.random();
    const canSpawnFlying = score > 100;

    if (canSpawnFlying && rand < 0.2) {
      const batFrame = Math.random() > 0.5 ? 1 : 2;
      const batSize = scaledTile * 0.65;
      obstacles.push({
        x: canvasWidth, y: groundY - scaledTile * 1.3,
        width: batSize, height: batSize,
        type: 'air', sprite: 'bat' + batFrame, frame: batFrame
      });
    } else if (rand < 0.4) {
      obstacles.push({
        x: canvasWidth, y: groundY - scaledTile,
        width: scaledTile, height: scaledTile, type: 'ground', sprite: 'spikes'
      });
    } else if (rand < 0.55) {
      obstacles.push({
        x: canvasWidth, y: groundY - scaledTile,
        width: scaledTile, height: scaledTile, type: 'ground', sprite: 'mushroom'
      });
    } else {
      const plantSprites = ['plant1', 'plant2', 'plant3', 'plant4', 'plant5', 'plant6'];
      const sprite = plantSprites[Math.floor(Math.random() * plantSprites.length)];
      obstacles.push({
        x: canvasWidth, y: groundY - scaledTile,
        width: scaledTile, height: scaledTile, type: 'ground', sprite
      });
    }
  }

  function checkCollision(rect1, rect2) {
    const padding = scaledTile * 0.3;
    return (
      rect1.x + padding < rect2.x + rect2.width - padding &&
      rect1.x + rect1.width - padding > rect2.x + padding &&
      rect1.y + padding < rect2.y + rect2.height - padding &&
      rect1.y + rect1.height - padding > rect2.y + padding
    );
  }

  function drawSprite(spriteKey, x, y, width, height) {
    if (!ctx || !sprites[spriteKey]) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprites[spriteKey], x, y, width, height);
  }

  function gameLoop(timestamp = 0) {
    if (!ctx || !canvas || !spritesLoaded) {
      animationId = requestAnimationFrame(gameLoop);
      return;
    }

    if (!lastFrameTimestamp) lastFrameTimestamp = timestamp;
    const deltaMs = timestamp - lastFrameTimestamp;
    lastFrameTimestamp = timestamp;
    const deltaFrames = Math.min(deltaMs / FRAME_TIME_MS, 3);

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const groundY = canvasHeight - groundHeight;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const idle = gameState === 'idle';
    const stub = scaledTile * 0.9;
    const inOpeningJump = introActive && introTimer < INTRO_HOP_DUR;
    const floorStart = 0;
    let floorEnd = canvasWidth;
    if (idle || inOpeningJump) {
      floorEnd = stub;
    } else if (introActive) {
      const EXTEND_DUR = 0.5;
      const t = Math.min(1, (introTimer - INTRO_HOP_DUR) / EXTEND_DUR);
      floorEnd = stub + (canvasWidth - stub) * t;
    }
    const floorSrc = sprites.floorLine;
    if (floorSrc) {
      ctx.imageSmoothingEnabled = false;
      const lineH = 2;
      const markH = 2;
      const markUnit = Math.max(1, Math.round(scale * 0.6));
      const markGap = lineH + 3;
      ctx.save();
      ctx.beginPath();
      ctx.rect(floorStart, groundY, floorEnd - floorStart, canvasHeight - groundY);
      ctx.clip();
      ctx.fillStyle = DINO_GRAY;
      for (const tile of groundTiles) {
        if (tile.x > floorEnd) continue;
        ctx.drawImage(
          floorSrc, 0, 0, floorSrc.width, floorSrc.height,
          Math.floor(tile.x), groundY, Math.ceil(scaledTile) + 1, lineH
        );
        if (tile.marks) {
          for (const m of tile.marks) {
            const dy = (m.x & 1) ? markGap + markH + 1 : markGap;
            ctx.fillRect(Math.floor(tile.x + m.x), groundY + dy, m.w * markUnit, markH);
          }
        }
      }
      ctx.restore();
    }

    if (gameState === 'playing' && introActive) {
      introTimer += deltaMs / 1000;
      const groundTopY = groundY - player.height;

      if (introTimer < INTRO_HOP_DUR) {
        const t = introTimer / INTRO_HOP_DUR;
        player.y = groundTopY - Math.sin(t * Math.PI) * introHopHeight;
        player.x = introStartX;
      } else if (introTimer < INTRO_HOP_DUR + INTRO_WALK_DUR) {
        const t = (introTimer - INTRO_HOP_DUR) / INTRO_WALK_DUR;
        player.y = groundTopY;
        player.x = introStartX + (runX - introStartX) * t;
        animateLegs(deltaMs);
      } else {
        player.x = runX;
        player.y = groundTopY;
        introActive = false;
        frameCount = 0;
        lastSpawnFrame = 0;
        lastWalkFrame = 0;
      }
      frameCount += deltaFrames;
    }

    if (gameState === 'playing' && !introActive) {
      frameCount += deltaFrames;

      for (const tile of groundTiles) {
        tile.x -= gameSpeed * deltaFrames;
      }
      const rightmostX = Math.max.apply(null, groundTiles.map((t) => t.x));
      for (const tile of groundTiles) {
        if (tile.x < -scaledTile) {
          tile.x = rightmostX + scaledTile;
          tile.marks = tileMarks();
        }
      }

      if (player.isJumping) {
        player.velocityY += gravity * deltaFrames;
        player.y += player.velocityY * deltaFrames;
        const minY = 4;
        if (player.y < minY) {
          player.y = minY;
          if (player.velocityY < 0) player.velocityY = 0;
        }
        if (player.y >= groundY - player.height) {
          player.y = groundY - player.height;
          player.isJumping = false;
          player.velocityY = 0;
        }
      } else {
        player.y = groundY - player.height;
      }

      animateLegs(deltaMs);

      for (const obs of obstacles) {
        if (obs.type === 'air' && frameCount - lastBatFrame >= 12) {
          obs.frame = obs.frame === 1 ? 2 : 1;
          obs.sprite = 'bat' + obs.frame;
          lastBatFrame = frameCount;
        }
      }

      const baseSpawnRate = 120;
      const spawnRate = Math.max(60, baseSpawnRate - Math.floor(score / 100) * 5);
      if (!introActive &&
          (frameCount - lastSpawnFrame >= spawnRate || (obstacles.length === 0 && frameCount > 60))) {
        spawnObstacle(canvasWidth, groundY);
        lastSpawnFrame = frameCount;
      }

      obstacles = obstacles.filter((obs) => {
        obs.x -= gameSpeed * deltaFrames;
        return obs.x > -obs.width;
      });

      for (const obstacle of obstacles) {
        let playerHitbox;
        if (player.isDucking) {
          playerHitbox = { x: player.x, y: groundY - player.height * 0.5, width: player.width, height: player.height * 0.5 };
        } else if (player.isJumping) {
          playerHitbox = { x: player.x, y: player.y, width: player.width, height: player.height };
        } else {
          playerHitbox = { x: player.x, y: groundY - player.height, width: player.width, height: player.height };
        }
        if (checkCollision(playerHitbox, obstacle)) {
          gameState = 'gameover';
          if (score > highScore) highScore = score;
          break;
        }
      }

      if (!introActive) score = Math.floor(frameCount / 5);

      if (score >= lastSpeedScore + 50) {
        gameSpeed = Math.min(gameSpeed + 0.4 * (scale / 2.5), MAX_SPEED_BASE * (scale / 2.5));
        lastSpeedScore = score - (score % 50);
      }
    }

    for (const obstacle of obstacles) {
      drawSprite(obstacle.sprite, obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }

    const playerY = (player.isJumping || introActive)
      ? player.y
      : player.isDucking ? groundY - player.height * 0.6 : groundY - player.height;

    let playerSprite;
    if (introActive) {
      playerSprite = (introTimer < INTRO_HOP_DUR)
        ? 'playerJump'
        : ['playerWalk1', 'playerWalk2', 'playerWalk3'][player.frame];
    } else if (player.isDucking) {
      playerSprite = 'playerDuck';
    } else if (player.isJumping) {
      playerSprite = player.velocityY < 0 ? 'playerJump' : 'playerFall';
    } else {
      playerSprite = ['playerWalk1', 'playerWalk2', 'playerWalk3'][player.frame];
    }

    const drawHeight = player.isDucking ? player.height * 0.6 : player.height;
    drawSprite(playerSprite, player.x, playerY, player.width, drawHeight);

    if (!idle && !introActive) {
      const fade = Math.min(1, frameCount / 24);
      ctx.fillStyle = 'rgba(172, 172, 172, ' + fade + ')';
      ctx.font = 'bold ' + Math.max(12, Math.floor(14 * (scale / 2.5))) + 'px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(score).padStart(5, '0'), canvasWidth - 10, 25);

      if (highScore > 0) {
        ctx.fillStyle = 'rgba(172, 172, 172, ' + (0.5 * fade) + ')';
        ctx.fillText('HI ' + String(highScore).padStart(5, '0'), canvasWidth - 70 * (scale / 2.5), 25);
      }
    }

    if (gameState === 'gameover') {
      ctx.fillStyle = '#acacac';
      ctx.font = 'bold ' + Math.max(14, Math.floor(20 * (scale / 2.5))) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvasWidth / 2, canvasHeight / 2 - 40);
    }

    animationId = requestAnimationFrame(gameLoop);
  }

  function resizeCanvas() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    calculateScale();
    initGroundTiles();
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  canvas.addEventListener('touchstart', handleTouch, { passive: false });

  let resizeObserver;
  (async function init() {
    await loadSprites();
    resizeCanvas();
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas.parentElement);
    gameLoop();
  })();
})();
