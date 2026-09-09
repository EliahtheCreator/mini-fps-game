import * as THREE from "./vendor/three.module.js";

const canvas = document.getElementById("game-canvas");
const overlay = document.getElementById("overlay");
const overlayCopy = document.getElementById("overlay-copy");
const startButton = document.getElementById("start-button");
const healthValue = document.getElementById("health-value");
const healthBar = document.getElementById("health-bar");
const enemyValue = document.getElementById("enemy-value");
const scoreValue = document.getElementById("score-value");
const enemyStyleSelect = document.getElementById("enemy-style");
const enemyBehaviorSelect = document.getElementById("enemy-behavior");
const enemyTextureInput = document.getElementById("enemy-texture");
const textureLabel = document.getElementById("texture-label");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08111b);
scene.fog = new THREE.Fog(0x08111b, 16, 54);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 90);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
const keys = new Set();
const enemies = [];
const obstacles = [];
const bullets = [];
const impacts = [];

const player = {
  position: new THREE.Vector3(0, 1.65, 13),
  velocityY: 0,
  yaw: Math.PI,
  pitch: 0,
  radius: 0.45,
  speed: 7.4,
  health: 100,
  score: 0,
  alive: true
};

let playing = false;
let lastShot = 0;
let enemyStyle = "mesh";
let enemyBehavior = "dynamic";
let enemyTexture = null;
let enemyTextureUrl = "";
let spawnedEnemyStyle = "";
let spawnedEnemyBehavior = "";
let spawnedEnemyTexture = null;

function makeDefaultEnemyTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 384;
  const ctx = textureCanvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 384);
  ctx.fillStyle = "rgba(196, 203, 209, 0.95)";
  ctx.beginPath();
  ctx.roundRect(74, 34, 108, 108, 18);
  ctx.fill();
  ctx.fillStyle = "rgba(122, 130, 140, 0.98)";
  ctx.beginPath();
  ctx.roundRect(44, 138, 168, 190, 26);
  ctx.fill();
  ctx.fillStyle = "rgba(45, 55, 66, 0.92)";
  ctx.fillRect(94, 74, 68, 12);
  ctx.fillRect(76, 216, 104, 10);
  ctx.fillStyle = "rgba(230, 236, 241, 0.75)";
  ctx.fillRect(88, 160, 80, 8);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const defaultEnemyTexture = makeDefaultEnemyTexture();

function makeGridTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#172331";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#1e3042";
  for (let i = 0; i < 256; i += 32) {
    ctx.fillRect(i, 0, 2, 256);
    ctx.fillRect(0, i, 256, 2);
  }
  ctx.fillStyle = "#263d52";
  ctx.fillRect(0, 126, 256, 4);
  ctx.fillRect(126, 0, 4, 256);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  return texture;
}

function makeWallTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#223244";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#2b4054";
  for (let y = 0; y < 256; y += 64) {
    ctx.fillRect(0, y, 256, 2);
  }
  for (let x = 0; x < 256; x += 64) {
    ctx.fillRect(x, 0, 2, 256);
  }
  ctx.fillStyle = "rgba(107,217,192,.28)";
  ctx.fillRect(22, 24, 84, 5);
  ctx.fillRect(148, 122, 64, 5);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xcde8ff, 0x10151c, 1.9));

  const key = new THREE.DirectionalLight(0xf8e2bb, 2.2);
  key.position.set(7, 13, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  scene.add(key);

  const cyan = new THREE.PointLight(0x65d7c5, 2.4, 18);
  cyan.position.set(-8, 3.4, -9);
  scene.add(cyan);
}

function addArena() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 36),
    new THREE.MeshStandardMaterial({ map: makeGridTexture(), roughness: 0.72, metalness: 0.12 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ map: makeWallTexture(), roughness: 0.68, metalness: 0.04 });
  const wallData = [
    [0, 2.5, -18, 36, 5, 0.5],
    [0, 2.5, 18, 36, 5, 0.5],
    [-18, 2.5, 0, 0.5, 5, 36],
    [18, 2.5, 0, 0.5, 5, 36]
  ];

  for (const [x, y, z, w, h, d] of wallData) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMaterial);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  }

  const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x6d5842, roughness: 0.86, metalness: 0.08 });
  const crateData = [
    [-7, 0.8, 3, 2.4, 1.6, 2.4],
    [6, 0.9, 6, 2.8, 1.8, 1.8],
    [7, 0.7, -5, 2.2, 1.4, 2.2],
    [-4, 0.6, -8, 3.8, 1.2, 1.5]
  ];

  for (const data of crateData) {
    const [x, y, z, w, h, d] = data;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMaterial);
    crate.position.set(x, y, z);
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);
    obstacles.push({ x, z, halfW: w / 2 + player.radius, halfD: d / 2 + player.radius });
  }

  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xe7bd63, roughness: 0.28, metalness: 0.65, emissive: 0x3b2204 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.055, 8, 96), ringMaterial);
  ring.position.set(0, 0.04, 0);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);
}

function createEnemy(x, z) {
  const group = new THREE.Group();
  if (enemyStyle === "sprite") {
    const material = new THREE.SpriteMaterial({
      map: enemyTexture || defaultEnemyTexture,
      transparent: true,
      alphaTest: 0.08
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.y = 1.35;
    sprite.scale.set(1.65, 2.45, 1);
    group.add(sprite);
  } else {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.48, 1.0, 8, 16),
      new THREE.MeshStandardMaterial({
        color: 0x7a828c,
        roughness: 0.52,
        metalness: 0.22,
        emissive: 0x11161c
      })
    );
    body.castShadow = true;
    body.position.y = 1.1;

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xc4cbd1, roughness: 0.42, metalness: 0.16 })
    );
    eye.position.set(0, 1.35, 0.43);
    group.add(body, eye);
  }
  group.position.set(x, 0, z);
  scene.add(group);
  enemies.push({ group, hp: 2, alive: true, cooldown: 0 });
}

function spawnEnemies() {
  enemies.splice(0, enemies.length);
  const points = [
    [-10, -9],
    [9, -10],
    [12, 2],
    [-12, 4],
    [5, 12],
    [-8, 10]
  ];
  points.forEach(([x, z]) => createEnemy(x, z));
}

function resetGame() {
  for (const enemy of enemies) scene.remove(enemy.group);
  for (const bullet of bullets) scene.remove(bullet.mesh);
  for (const impact of impacts) scene.remove(impact.mesh);
  bullets.splice(0, bullets.length);
  impacts.splice(0, impacts.length);
  player.position.set(0, 1.65, 13);
  player.velocityY = 0;
  player.yaw = Math.PI;
  player.pitch = 0;
  player.health = 100;
  player.score = 0;
  player.alive = true;
  spawnEnemies();
  spawnedEnemyStyle = enemyStyle;
  spawnedEnemyBehavior = enemyBehavior;
  spawnedEnemyTexture = enemyTexture;
  updateHUD();
}

function updateCamera() {
  camera.position.copy(player.position);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function updateHUD() {
  const aliveCount = enemies.filter((enemy) => enemy.alive).length;
  healthValue.textContent = Math.max(0, Math.round(player.health));
  healthBar.style.width = `${Math.max(0, player.health)}%`;
  enemyValue.textContent = aliveCount;
  scoreValue.textContent = player.score;
}

function tryMove(deltaMove) {
  const next = player.position.clone().add(deltaMove);
  const limit = 16.9 - player.radius;
  next.x = THREE.MathUtils.clamp(next.x, -limit, limit);
  next.z = THREE.MathUtils.clamp(next.z, -limit, limit);

  for (const box of obstacles) {
    const insideX = Math.abs(next.x - box.x) < box.halfW;
    const insideZ = Math.abs(next.z - box.z) < box.halfD;
    if (insideX && insideZ) {
      if (Math.abs(player.position.x - box.x) >= box.halfW) next.x = player.position.x;
      if (Math.abs(player.position.z - box.z) >= box.halfD) next.z = player.position.z;
    }
  }

  player.position.copy(next);
}

function updatePlayer(dt) {
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(-Math.cos(player.yaw), 0, Math.sin(player.yaw));
  const move = new THREE.Vector3();

  if (keys.has("KeyW")) move.add(forward);
  if (keys.has("KeyS")) move.sub(forward);
  if (keys.has("KeyD")) move.add(right);
  if (keys.has("KeyA")) move.sub(right);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(player.speed * dt);
    tryMove(move);
  }

  const onGround = player.position.y <= 1.65;
  if (keys.has("Space") && onGround) player.velocityY = 6.4;
  player.velocityY -= 18 * dt;
  player.position.y += player.velocityY * dt;
  if (player.position.y < 1.65) {
    player.position.y = 1.65;
    player.velocityY = 0;
  }
}

function addBulletTrail(origin, direction) {
  const geometry = new THREE.CylinderGeometry(0.018, 0.018, 3.8, 8);
  const material = new THREE.MeshBasicMaterial({ color: 0xffe09a, transparent: true, opacity: 0.8 });
  const mesh = new THREE.Mesh(geometry, material);
  const midpoint = origin.clone().add(direction.clone().multiplyScalar(2.1));
  mesh.position.copy(midpoint);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  scene.add(mesh);
  bullets.push({ mesh, life: 0.08 });
}

function addImpact(point) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 1 })
  );
  mesh.position.copy(point);
  scene.add(mesh);
  impacts.push({ mesh, life: 0.18 });
}

function shoot() {
  if (!playing || !player.alive) return;
  const now = performance.now();
  if (now - lastShot < 160) return;
  lastShot = now;

  raycaster.setFromCamera(pointer, camera);
  const targets = enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.group);
  const hits = raycaster.intersectObjects(targets, true);
  const origin = camera.position.clone();
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  addBulletTrail(origin, direction);

  if (hits.length > 0) {
    const root = hits[0].object.parent;
    const enemy = enemies.find((item) => item.group === root);
    if (enemy && enemy.alive) {
      enemy.hp -= 1;
      addImpact(hits[0].point);
      enemy.group.scale.setScalar(1.08);
      if (enemy.hp <= 0) {
        enemy.alive = false;
        enemy.group.visible = false;
        player.score += 100;
      } else {
        player.score += 25;
      }
      updateHUD();
      checkEnd();
    }
  }
}

function updateEnemies(dt) {
  const playerFlat = new THREE.Vector3(player.position.x, 0, player.position.z);
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const position = enemy.group.position;
    const toPlayer = playerFlat.clone().sub(position);
    const distance = toPlayer.length();
    if (enemyBehavior === "static") {
      enemy.group.lookAt(player.position.x, 1, player.position.z);
    } else if (distance > 1.25) {
      const speed = distance > 7 ? 2.25 : 3.1;
      position.add(toPlayer.normalize().multiplyScalar(speed * dt));
    } else {
      enemy.cooldown -= dt;
      if (enemy.cooldown <= 0) {
        player.health -= 12;
        enemy.cooldown = 0.6;
        if (player.health <= 0) {
          player.health = 0;
          player.alive = false;
          endGame(false);
        }
        updateHUD();
      }
    }
    if (enemyBehavior !== "static") enemy.group.lookAt(player.position.x, 1, player.position.z);
    enemy.group.scale.lerp(new THREE.Vector3(1, 1, 1), 8 * dt);
  }
}

function updateEffects(dt) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    bullet.life -= dt;
    bullet.mesh.material.opacity = Math.max(0, bullet.life / 0.08);
    if (bullet.life <= 0) {
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
    }
  }

  for (let i = impacts.length - 1; i >= 0; i -= 1) {
    const impact = impacts[i];
    impact.life -= dt;
    const scale = 1 + (0.18 - impact.life) * 8;
    impact.mesh.scale.setScalar(scale);
    impact.mesh.material.opacity = Math.max(0, impact.life / 0.18);
    if (impact.life <= 0) {
      scene.remove(impact.mesh);
      impacts.splice(i, 1);
    }
  }
}

function checkEnd() {
  if (enemies.every((enemy) => !enemy.alive)) endGame(true);
}

function endGame(won) {
  playing = false;
  document.exitPointerLock?.();
  overlay.classList.remove("hidden");
  overlayCopy.textContent = won ? `清除完成，得分 ${player.score}。` : `训练失败，得分 ${player.score}。`;
  startButton.textContent = "再来一次";
}

function updateOverlayCopy() {
  const behaviorText = enemyBehavior === "static" ? "静止目标" : "移动目标";
  const styleText = enemyStyle === "sprite" ? "贴图敌人" : "3D 灰模敌人";
  overlayCopy.textContent = `使用 ${styleText}，清除所有${behaviorText}。`;
}

function syncSettings({ refreshTargets = false } = {}) {
  enemyStyle = enemyStyleSelect.value;
  enemyBehavior = enemyBehaviorSelect.value;
  updateOverlayCopy();
  if (refreshTargets && !playing) {
    resetGame();
    updateCamera();
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());

  if (playing && player.alive) {
    updatePlayer(dt);
    updateEnemies(dt);
    updateEffects(dt);
    updateCamera();
  } else {
    updateEffects(dt);
  }

  renderer.render(scene, camera);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

addLights();
addArena();
resetGame();
updateCamera();
resize();
animate();
window.__GAME_READY = true;

window.addEventListener("resize", resize);

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

enemyStyleSelect.addEventListener("change", () => {
  syncSettings({ refreshTargets: overlay.classList.contains("hidden") === false });
});

enemyBehaviorSelect.addEventListener("change", () => {
  syncSettings({ refreshTargets: overlay.classList.contains("hidden") === false });
});

enemyTextureInput.addEventListener("change", () => {
  const file = enemyTextureInput.files && enemyTextureInput.files[0];
  if (!file) return;

  if (enemyTextureUrl) URL.revokeObjectURL(enemyTextureUrl);
  enemyTextureUrl = URL.createObjectURL(file);
  const loader = new THREE.TextureLoader();
  loader.load(enemyTextureUrl, (texture) => {
    if (enemyTexture) enemyTexture.dispose();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    enemyTexture = texture;
    enemyStyleSelect.value = "sprite";
    textureLabel.textContent = file.name.length > 22 ? `${file.name.slice(0, 19)}...` : file.name;
    syncSettings({ refreshTargets: overlay.classList.contains("hidden") === false });
  });
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas || !playing) return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch -= event.movementY * 0.0022;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.25, 1.25);
});

document.addEventListener("mousedown", (event) => {
  if (event.button === 0) shoot();
});

document.addEventListener("pointerlockchange", () => {
  if (!playing) return;
  if (document.pointerLockElement !== canvas) {
    playing = false;
    overlay.classList.remove("hidden");
    overlayCopy.textContent = "训练暂停。";
    startButton.textContent = "继续";
  }
});

startButton.addEventListener("click", async () => {
  syncSettings();
  const settingsChanged = spawnedEnemyStyle !== enemyStyle || spawnedEnemyBehavior !== enemyBehavior || spawnedEnemyTexture !== enemyTexture;
  if (!player.alive || enemies.every((enemy) => !enemy.alive) || settingsChanged) resetGame();
  overlay.classList.add("hidden");
  playing = true;
  clock.getDelta();
  await canvas.requestPointerLock?.();
});

syncSettings();
