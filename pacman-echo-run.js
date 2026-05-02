    const TILE = 32;
    const mapTemplate = [
      '###############',
      '#P....#....o..#',
      '#.###.#.###.#.#',
      '#...#...#...#.#',
      '###.#.#.#.###.#',
      '#...#.#.#.....#',
      '#.###.#.#####.#',
      '#.....G.......#',
      '#.#####.#.###.#',
      '#.......#...#.#',
      '#.###.###.#.#.#',
      '#o..#.....#..o#',
      '#.#.#.###.###.#',
      '#...#...G.....#',
      '###############'
    ];

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    const pelletsEl = document.getElementById('pellets');
    const powerEl = document.getElementById('power');
    const statusEl = document.getElementById('status');

    const dirs = {
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 }
    };
    const dirList = Object.values(dirs);

    let state;
    let lastTime = 0;

    function parseMap() {
      const tiles = [];
      const pellets = new Set();
      const orbs = new Set();
      const ghostSpawns = [];
      let playerSpawn = { x: 1, y: 1 };

      for (let y = 0; y < mapTemplate.length; y++) {
        const row = [];
        for (let x = 0; x < mapTemplate[y].length; x++) {
          const ch = mapTemplate[y][x];
          row.push(ch === '#' ? '#' : ' ');
          if (ch === '.' || ch === 'P' || ch === 'G' || ch === 'o') pellets.add(key(x, y));
          if (ch === 'o') orbs.add(key(x, y));
          if (ch === 'P') playerSpawn = { x, y };
          if (ch === 'G') ghostSpawns.push({ x, y });
        }
        tiles.push(row);
      }
      for (const orb of orbs) pellets.delete(orb);
      return { tiles, pellets, orbs, playerSpawn, ghostSpawns };
    }

    function createEntity(tileX, tileY, speed) {
      return {
        x: tileX + 0.5,
        y: tileY + 0.5,
        dir: { x: 0, y: 0 },
        nextDir: { x: 0, y: 0 },
        facing: { x: 1, y: 0 },
        speed
      };
    }

    function resetGame() {
      const parsed = parseMap();
      state = {
        ...parsed,
        score: 0,
        lives: 3,
        powerTimer: 0,
        won: false,
        over: false,
        gameStarted: false,
        animTime: 0,
        currentRunPath: [],
        fireballs: [],
        fireballCooldown: 0,
        echo: { active: false, path: [], index: 0, x: 0, y: 0 },
        player: createEntity(parsed.playerSpawn.x, parsed.playerSpawn.y, 5.2),
        ghosts: parsed.ghostSpawns.map((spawn, i) => ({
          ...createEntity(spawn.x, spawn.y, 3.2 + i * 0.25),
          spawn: { ...spawn },
          lastDecisionTile: null,
          targetX: null,
          targetY: null,
          respawnTimer: 0,
          color: i === 0 ? '#ff5d73' : '#ff96d5'
        }))
      };
      state.player.dir = { x: 0, y: 0 };
      updateHud();
    }

    function key(x, y) { return `${x},${y}`; }
    function tileAt(x, y) {
      if (y < 0 || y >= state.tiles.length || x < 0 || x >= state.tiles[0].length) return '#';
      return state.tiles[y][x];
    }
    function isWall(x, y) { return tileAt(x, y) === '#'; }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function tileCenter(v) { return Math.floor(v) + 0.5; }
    function centerAligned(v) { return Math.abs(v - tileCenter(v)) < 0.12; }

    function canOccupy(x, y, radius = 0.22) {
      const left = Math.floor(x - radius);
      const right = Math.floor(x + radius);
      const top = Math.floor(y - radius);
      const bottom = Math.floor(y + radius);
      return !isWall(left, top) && !isWall(right, top) && !isWall(left, bottom) && !isWall(right, bottom);
    }

    function canMove(entity, dir) {
      const step = 0.28;
      return canOccupy(entity.x + dir.x * step, entity.y + dir.y * step);
    }

    function moveEntity(entity, dt) {
      const atCenter = centerAligned(entity.x) && centerAligned(entity.y);
      if (atCenter) {
        entity.x = tileCenter(entity.x);
        entity.y = tileCenter(entity.y);
      }

      if ((entity.nextDir.x || entity.nextDir.y) && atCenter && canMove(entity, entity.nextDir)) {
        entity.dir = { ...entity.nextDir };
        entity.facing = { ...entity.nextDir };
      }

      if (!entity.dir.x && !entity.dir.y) return;
      entity.facing = { ...entity.dir };

      const step = entity.speed * dt;

      if (entity.dir.x !== 0) {
        entity.y = tileCenter(entity.y);
        const nextX = entity.x + entity.dir.x * step;
        if (canOccupy(nextX, entity.y)) {
          entity.x = nextX;
        } else {
          entity.x = tileCenter(entity.x);
          entity.nextDir = { x: 0, y: 0 };
          entity.dir = { x: 0, y: 0 };
        }
      }

      if (entity.dir.y !== 0) {
        entity.x = tileCenter(entity.x);
        const nextY = entity.y + entity.dir.y * step;
        if (canOccupy(entity.x, nextY)) {
          entity.y = nextY;
        } else {
          entity.y = tileCenter(entity.y);
          entity.nextDir = { x: 0, y: 0 };
          entity.dir = { x: 0, y: 0 };
        }
      }
    }

    function updatePlayer(dt) {
      moveEntity(state.player, dt);
      state.currentRunPath.push({ x: state.player.x, y: state.player.y });
      if (state.currentRunPath.length > 1800) state.currentRunPath.shift();

      const tx = Math.floor(state.player.x);
      const ty = Math.floor(state.player.y);
      const k = key(tx, ty);

      if (state.pellets.has(k)) {
        state.pellets.delete(k);
        state.score += 10;
      }
      if (state.orbs.has(k)) {
        state.orbs.delete(k);
        state.score += 50;
        state.powerTimer = 6;
      }

      if (state.pellets.size === 0 && state.orbs.size === 0) {
        state.won = true;
      }
    }

    function chooseGhostDirection(ghost) {
      ghost.x = tileCenter(ghost.x);
      ghost.y = tileCenter(ghost.y);
      const currentTile = key(Math.floor(ghost.x), Math.floor(ghost.y));

      const tileX = Math.floor(ghost.x);
      const tileY = Math.floor(ghost.y);
      const options = dirList.filter(dir => {
        if (dir.x === -ghost.dir.x && dir.y === -ghost.dir.y) return false;
        return !isWall(tileX + dir.x, tileY + dir.y);
      });
      const choices = options.length ? options : dirList.filter(dir => !isWall(tileX + dir.x, tileY + dir.y));
      if (!choices.length) {
        ghost.dir = { x: 0, y: 0 };
        return;
      }

      const useEcho = state.echo.active && dist(ghost, state.echo) < dist(ghost, state.player) + 1.2;
      const target = useEcho ? { x: state.echo.x, y: state.echo.y } : { x: state.player.x, y: state.player.y };
      choices.sort((a, b) => {
        const da = Math.hypot((tileX + a.x + 0.5) - target.x, (tileY + a.y + 0.5) - target.y);
        const db = Math.hypot((tileX + b.x + 0.5) - target.x, (tileY + b.y + 0.5) - target.y);
        return da - db;
      });

      ghost.dir = choices[0];
      ghost.lastDecisionTile = currentTile;
      ghost.targetX = tileX + ghost.dir.x + 0.5;
      ghost.targetY = tileY + ghost.dir.y + 0.5;
    }

    function updateGhosts(dt) {
      if (!state.gameStarted) return;
      for (const ghost of state.ghosts) {
        if (ghost.respawnTimer > 0) {
          ghost.respawnTimer = Math.max(0, ghost.respawnTimer - dt);
          if (ghost.respawnTimer === 0) {
            ghost.x = ghost.spawn.x + 0.5;
            ghost.y = ghost.spawn.y + 0.5;
            ghost.dir = { x: 0, y: 0 };
            ghost.nextDir = { x: 0, y: 0 };
            ghost.lastDecisionTile = null;
            ghost.targetX = null;
            ghost.targetY = null;
          }
          continue;
        }
        if (ghost.targetX === null || ghost.targetY === null) {
          chooseGhostDirection(ghost);
        }
        if (ghost.targetX === null || ghost.targetY === null) continue;

        const step = ghost.speed * dt;
        const dx = ghost.targetX - ghost.x;
        const dy = ghost.targetY - ghost.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= step) {
          ghost.x = ghost.targetX;
          ghost.y = ghost.targetY;
          ghost.targetX = null;
          ghost.targetY = null;
        } else {
          ghost.x += (dx / distance) * step;
          ghost.y += (dy / distance) * step;
        }
      }
    }

    function updateEcho() {
      if (!state.echo.active || !state.echo.path.length) return;
      const p = state.echo.path[Math.min(state.echo.index, state.echo.path.length - 1)];
      state.echo.x = p.x;
      state.echo.y = p.y;
      state.echo.index += 2;
      if (state.echo.index >= state.echo.path.length) state.echo.index = 0;
    }

    function shootFireball() {
      if (!state || state.over || state.won) return;
      if (state.fireballCooldown > 0) return;
      const facing = state.player.facing || { x: 1, y: 0 };
      if (!facing.x && !facing.y) return;
      state.fireballs.push({
        x: state.player.x,
        y: state.player.y,
        dir: { ...facing },
        life: 0.55,
        speed: 10
      });
      state.fireballCooldown = 0.35;
    }

    function resetGhost(ghost, hidden = false) {
      ghost.x = ghost.spawn.x + 0.5;
      ghost.y = ghost.spawn.y + 0.5;
      ghost.dir = { x: 0, y: 0 };
      ghost.nextDir = { x: 0, y: 0 };
      ghost.lastDecisionTile = null;
      ghost.targetX = null;
      ghost.targetY = null;
      ghost.respawnTimer = hidden ? 1.2 : 0;
    }

    function updateFireballs(dt) {
      const next = [];
      for (const fireball of state.fireballs) {
        fireball.life -= dt;
        if (fireball.life <= 0) continue;
        const nx = fireball.x + fireball.dir.x * fireball.speed * dt;
        const ny = fireball.y + fireball.dir.y * fireball.speed * dt;
        if (!canOccupy(nx, ny, 0.08)) continue;
        fireball.x = nx;
        fireball.y = ny;

        let hit = false;
        for (const ghost of state.ghosts) {
          if (ghost.respawnTimer > 0) continue;
          if (dist(fireball, ghost) < 0.55) {
            resetGhost(ghost, true);
            state.score += 150;
            hit = true;
            break;
          }
        }
        if (!hit) next.push(fireball);
      }
      state.fireballs = next;
    }

    function handleCollisions() {
      for (const ghost of state.ghosts) {
        if (ghost.respawnTimer > 0) continue;
        if (dist(ghost, state.player) < 0.72) {
          if (state.powerTimer > 0) {
            resetGhost(ghost, true);
            state.score += 200;
          } else {
            loseLife();
            return;
          }
        }
      }
    }

    function loseLife() {
      state.lives -= 1;
      if (state.currentRunPath.length > 20) {
        state.echo = {
          active: true,
          path: [...state.currentRunPath],
          index: 0,
          x: state.currentRunPath[0].x,
          y: state.currentRunPath[0].y
        };
      }
      state.currentRunPath = [];
      state.player = createEntity(state.playerSpawn.x, state.playerSpawn.y, 5.2);
      state.player.dir = { x: 0, y: 0 };
      state.player.nextDir = { x: 0, y: 0 };
      state.player.facing = { x: 1, y: 0 };
      state.fireballs = [];
      state.fireballCooldown = 0;
      state.ghosts.forEach((ghost) => {
        resetGhost(ghost, false);
      });
      state.powerTimer = 0;
      if (state.lives <= 0) state.over = true;
    }

    function updateHud() {
      scoreEl.textContent = state.score;
      livesEl.textContent = state.lives;
      pelletsEl.textContent = state.pellets.size + state.orbs.size;
      powerEl.textContent = `${Math.max(0, state.powerTimer).toFixed(1)}से`;
      if (state.over) statusEl.textContent = 'खेळ संपला — R दाबा';
      else if (state.won) statusEl.textContent = 'तुम्ही जिंकलात — R दाबा';
      else if (state.echo.active) statusEl.textContent = 'इको सुरू';
      else statusEl.textContent = 'इको बंद';
    }

    function drawCircle(x, y, radius, color) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let y = 0; y < state.tiles.length; y++) {
        for (let x = 0; x < state.tiles[y].length; x++) {
          const px = x * TILE;
          const py = y * TILE;
          if (state.tiles[y][x] === '#') {
            ctx.fillStyle = '#15339b';
            ctx.fillRect(px, py, TILE, TILE);
            ctx.strokeStyle = '#6d92ff';
            ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
          }
        }
      }

      for (const pellet of state.pellets) {
        const [x, y] = pellet.split(',').map(Number);
        drawCircle(x * TILE + TILE / 2, y * TILE + TILE / 2, 3, '#f5f1c8');
      }
      for (const orb of state.orbs) {
        const [x, y] = orb.split(',').map(Number);
        drawCircle(x * TILE + TILE / 2, y * TILE + TILE / 2, 7, '#fff6a5');
      }
      if (state.echo.active) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        drawCircle(state.echo.x * TILE, state.echo.y * TILE, 11, '#53ebff');
        ctx.restore();
      }

      for (const fireball of state.fireballs) {
        drawCircle(fireball.x * TILE, fireball.y * TILE, 5, '#ff8c32');
      }

      for (const ghost of state.ghosts) {
        if (ghost.respawnTimer > 0) continue;
        const scared = state.powerTimer > 0;
        const color = scared ? '#7aa8ff' : ghost.color;
        const x = ghost.x * TILE;
        const y = ghost.y * TILE;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y - 4, 10, Math.PI, 0);
        ctx.lineTo(x + 10, y + 9);
        ctx.lineTo(x + 4, y + 5);
        ctx.lineTo(x, y + 9);
        ctx.lineTo(x - 4, y + 5);
        ctx.lineTo(x - 10, y + 9);
        ctx.closePath();
        ctx.fill();
        drawCircle(x - 4, y - 3, 2, '#fff');
        drawCircle(x + 4, y - 3, 2, '#fff');
      }

      const px = state.player.x * TILE;
      const py = state.player.y * TILE;
      const facing = state.player.facing || { x: 1, y: 0 };
      const baseAngle =
        facing.x > 0 ? 0 :
        facing.x < 0 ? Math.PI :
        facing.y > 0 ? Math.PI / 2 :
        -Math.PI / 2;
      const mouth = 0.22 + 0.16 * Math.abs(Math.sin(state.animTime * 14));
      ctx.fillStyle = '#ffd84d';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, 11, baseAngle + mouth, baseAngle + Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fill();

      if (state.over || state.won) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 26px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(state.over ? 'खेळ संपला' : 'पातळी पूर्ण!', canvas.width / 2, canvas.height / 2 + 8);
      }
    }

    function update(dt) {
      if (state.over || state.won) return;
      state.animTime += dt;
      if (state.powerTimer > 0) state.powerTimer = Math.max(0, state.powerTimer - dt);
      if (state.fireballCooldown > 0) state.fireballCooldown = Math.max(0, state.fireballCooldown - dt);
      updatePlayer(dt);
      handleCollisions();
      updateEcho();
      updateGhosts(dt);
      updateFireballs(dt);
      handleCollisions();
      updateHud();
    }

    function loop(ts) {
      const dt = Math.min(0.033, (ts - lastTime) / 1000 || 0);
      lastTime = ts;
      update(dt);
      render();
      requestAnimationFrame(loop);
    }

    function setDirection(dir) {
      if (!state || state.over || state.won) return;
      state.player.nextDir = { ...dir };
      state.player.facing = { ...dir };
      if (!state.player.dir.x && !state.player.dir.y) {
        state.player.dir = { ...dir };
      }
      state.gameStarted = true;
    }

    function handleKeydown(e) {
      const key = (e.key || '').toLowerCase();
      const code = e.code || '';
      const controlKeys = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', ' ', 'spacebar', 'r'];
      const controlCodes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'KeyR'];
      if (controlKeys.includes(key) || controlCodes.includes(code)) e.preventDefault();

      if (key === 'arrowleft' || key === 'a' || code === 'ArrowLeft' || code === 'KeyA') setDirection(dirs.left);
      if (key === 'arrowright' || key === 'd' || code === 'ArrowRight' || code === 'KeyD') setDirection(dirs.right);
      if (key === 'arrowup' || key === 'w' || code === 'ArrowUp' || code === 'KeyW') setDirection(dirs.up);
      if (key === 'arrowdown' || key === 's' || code === 'ArrowDown' || code === 'KeyS') setDirection(dirs.down);
      if (key === ' ' || key === 'spacebar' || code === 'Space') shootFireball();
      if (key === 'r' || code === 'KeyR') resetGame();
    }

    function handleControlPress(target) {
      const dir = target.dataset.dir;
      const action = target.dataset.action;
      if (dir && dirs[dir]) setDirection(dirs[dir]);
      if (action === 'fire') shootFireball();
    }

    window.addEventListener('keydown', handleKeydown, { passive: false });
    document.addEventListener('keydown', handleKeydown, { passive: false });
    document.body.tabIndex = 0;
    document.body.addEventListener('click', () => document.body.focus());
    canvas.addEventListener('click', () => canvas.focus());
    document.querySelectorAll('.ctrl-btn').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handleControlPress(btn);
      });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handleControlPress(btn);
      });
    });
    window.addEventListener('load', () => {
      document.body.focus();
      canvas.focus();
    });

    resetGame();
    requestAnimationFrame(loop);
