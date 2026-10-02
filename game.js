"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const canvas = $("#game");
const ctx = canvas.getContext("2d");

const setup = $("#setup");
const arenaPanel = $("#arenaPanel");
const result = $("#result");
const countdown = $("#countdown");

const faceSources = [
  [
    "imagens/expressoes/mat_happy.png",
    "imagens/expressoes/mat_serious.png",
    "imagens/expressoes/mat_sad.png"
  ],
  [
    "imagens/expressoes/ald_happy.png",
    "imagens/expressoes/ald_serious.png",
    "imagens/expressoes/ald_sad.png"
  ]
];

const faces = faceSources.map((group) =>
  group.map((src) => {
    const im = new Image();
    im.src = src;
    return im;
  })
);

const allImages = faces.flat();

const fighterPhrases = [
  [
    "Sou cientista, me respeite",
    "Respeita o Vaqueiro",
    "Diga a ele, Lucas"
  ],
  [
    "Caramba, brotheeeer!",
    "Nem acredito, brotheeeer!",
    "Paga sua aposta, brotheeeer!"
  ]
];

let selectedPlayer = 0;
let level = "intermediario";
let running = false;
let paused = false;
let raf = 0;
let last = 0;
let aiClock = 0;

let projectiles = [];
let statusNoticeUntil = 0;
let playerWasPowered = false;
let powerNoticeTimer = 0;

let fighterSpeech = ["", ""];
let nextSpeechChange = 0;

const keys = {
  left: false,
  right: false,
  jump: false,
  attack: false,
  special: false
};

const LEVELS = {
  chan: {
    speed: 165,
    reaction: 0.62,
    attackGap: 1.45,
    accuracy: 0.48,
    aggression: 0.43
  },
  intermediario: {
    speed: 205,
    reaction: 0.34,
    attackGap: 0.92,
    accuracy: 0.72,
    aggression: 0.68
  },
  dificil: {
    speed: 245,
    reaction: 0.17,
    attackGap: 0.58,
    accuracy: 0.91,
    aggression: 0.9
  }
};

const ground = 465;

function makeFighter(i) {
  return {
    i,
    x: i === 0 ? 260 : 840,
    y: ground,
    vx: 0,
    vy: 0,
    w: 80,
    h: 210,
    hp: 100,
    facing: i === 0 ? 1 : -1,
    onGround: true,
    cooldown: 0,
    specialCooldown: 0,
    attackTime: 0,
    hitTime: 0,
    blocking: false,
    dead: false,
    powered: false
  };
}

let fighters = [makeFighter(0), makeFighter(1)];

$(".fighter-card");

$$(".fighter-card").forEach((button) => {
  button.onclick = () => {
    $$(".fighter-card").forEach((item) => {
      item.classList.remove("selected");
    });

    button.classList.add("selected");
    selectedPlayer = Number(button.dataset.player);
  };
});

$$(".levels button").forEach((button) => {
  button.onclick = () => {
    $$(".levels button").forEach((item) => {
      item.classList.remove("selected");
    });

    button.classList.add("selected");
    level = button.dataset.level;
  };
});

$("#start").onclick = startMatch;
$("#rematch").onclick = startMatch;
$("#menu").onclick = showMenu;
$("#quit").onclick = showMenu;

function showMenu() {
  running = false;
  cancelAnimationFrame(raf);

  arenaPanel.classList.add("hidden");
  setup.classList.remove("hidden");
  result.classList.add("hidden");

  hidePowerNotice();
}

function startMatch() {
  fighters = [makeFighter(0), makeFighter(1)];
  
  projectiles = [];

  fighterSpeech = [
    randomPhrase(0),
    randomPhrase(1)
  ];

  nextSpeechChange = performance.now() + 1000;

  playerWasPowered = false;

  clearTimeout(powerNoticeTimer);
  $("#powerNotice").classList.add("hidden");

  running = false;
  paused = false;

  result.classList.add("hidden");
  setup.classList.add("hidden");
  arenaPanel.classList.remove("hidden");

  updateHud();

  let n = 3;
  countdown.textContent = n;

  const timer = setInterval(() => {
    n--;

    countdown.textContent =
      n > 0
        ? n
        : n === 0
          ? "LUTEM!"
          : "";

    if (n < 0) {
      clearInterval(timer);

      countdown.textContent = "";
      running = true;
      last = performance.now();

      raf = requestAnimationFrame(loop);
    }
  }, 650);
}

function loop(t) {
  if (!running) return;

  const dt = Math.min(0.033, (t - last) / 1000 || 0);
  last = t;

  update(dt);
  draw();

  raf = requestAnimationFrame(loop);
}

function controlHuman(fighter, dt) {
  const accel = 900;
  const max = 230;

  if (keys.left) {
    fighter.vx = Math.max(
      fighter.vx - accel * dt,
      -max
    );

    fighter.facing = -1;
  } else if (keys.right) {
    fighter.vx = Math.min(
      fighter.vx + accel * dt,
      max
    );

    fighter.facing = 1;
  } else {
    fighter.vx *= Math.pow(0.001, dt);
  }

  if (keys.jump && fighter.onGround) {
    fighter.vy = -520;
    fighter.onGround = false;
    keys.jump = false;
  }

  if (keys.attack) {
    tryAttack(fighter, false);
    keys.attack = false;
  }

  if (keys.special) {
    tryAttack(fighter, true);
    keys.special = false;
  }
}

function controlAI(ai, human, dt) {
  const cfg = LEVELS[level];

  aiClock -= dt;

  if (aiClock > 0) return;

  aiClock =
    cfg.reaction *
    (0.7 + Math.random() * 0.6);

  const dist = human.x - ai.x;
  const absoluteDistance = Math.abs(dist);

  ai.facing = dist > 0 ? 1 : -1;
  ai.vx = 0;

  if (absoluteDistance > 125) {
    ai.vx = Math.sign(dist) * cfg.speed;
  } else if (
    absoluteDistance < 72 &&
    Math.random() > 0.65
  ) {
    ai.vx =
      -Math.sign(dist) *
      cfg.speed *
      0.65;
  }

  if (
    ai.onGround &&
    Math.random() <
      0.07 *
        (level === "dificil" ? 2 : 1)
  ) {
    ai.vy = -470;
    ai.onGround = false;
  }

  if (
    absoluteDistance < 145 &&
    ai.cooldown <= 0 &&
    Math.random() < cfg.aggression
  ) {
    if (Math.random() < cfg.accuracy) {
      tryAttack(
        ai,
        Math.random() <
          (level === "dificil"
            ? 0.32
            : 0.16)
      );
    } else {
      ai.cooldown = cfg.attackGap;
    }
  }
}

function tryAttack(fighter, special) {
  if (
    fighter.dead ||
    fighter.cooldown > 0 ||
    (special &&
      fighter.specialCooldown > 0)
  ) {
    return;
  }

  if (special && !fighter.powered) {
    if (fighter.i === selectedPlayer) {
      statusNoticeUntil =
        performance.now() + 1200;

      $("#roundStatus").textContent =
        "KAMEHAMEHA BLOQUEADO";
    }

    return;
  }

  if (special) {
    fighter.attackTime = 0.65;
    fighter.cooldown = 0.9;
    fighter.specialCooldown = 3.6;

    setTimeout(() => {
      launchKamehameha(fighter);
    }, 260);
  } else {
    fighter.attackTime = 0.26;
    fighter.cooldown = 0.42;

    setTimeout(() => {
      resolvePunch(fighter);
    }, 110);
  }
}

function launchKamehameha(fighter) {
  if (!running || fighter.dead) return;

  projectiles.push({
    owner: fighter.i,
    startX:
      fighter.x +
      fighter.facing * 54,
    x:
      fighter.x +
      fighter.facing * 70,
    y: fighter.y - 112,
    dir: fighter.facing,
    life: 0.62,
    maxLife: 0.62,
    hit: false
  });
}

function resolvePunch(attacker) {
  if (!running || attacker.dead) return;

  const defender =
    fighters[1 - attacker.i];

  const distance = Math.abs(
    defender.x - attacker.x
  );

  const toward =
    (defender.x - attacker.x) *
      attacker.facing >
    0;

  if (
    distance < 125 &&
    toward &&
    Math.abs(
      defender.y - attacker.y
    ) < 100
  ) {
    applyDamage(
      defender,
      10 + Math.floor(Math.random() * 7),
      attacker.facing,
      false,
      attacker.i
    );
  }
}

function applyDamage(
  defender,
  damage,
  direction,
  special,
  owner
) {
  defender.hp = Math.max(
    0,
    defender.hp - damage
  );

  defender.vx =
    direction *
    (special ? 470 : 250);

  defender.vy =
    special ? -220 : -90;

  defender.hitTime =
    special ? 0.42 : 0.28;

  updateHud();

  if (defender.hp <= 0) {
    defender.dead = true;

    setTimeout(() => {
      endMatch(owner);
    }, 600);
  }
}

function updateProjectiles(dt) {
  projectiles.forEach((projectile) => {
    projectile.life -= dt;

    const target =
      fighters[1 - projectile.owner];

    projectile.x +=
      projectile.dir *
      1180 *
      dt;

    const minX =
      Math.min(
        projectile.startX,
        projectile.x
      ) - 45;

    const maxX =
      Math.max(
        projectile.startX,
        projectile.x
      ) + 45;

    const withinBeam =
      target.x >= minX &&
      target.x <= maxX;

    if (
      !projectile.hit &&
      !target.dead &&
      withinBeam &&
      Math.abs(
        projectile.y -
          (target.y - 110)
      ) < 110
    ) {
      projectile.hit = true;

      projectile.x =
        target.x +
        projectile.dir * 48;

      projectile.life = Math.max(
        projectile.life,
        0.34
      );

      applyDamage(
        target,
        22 +
          Math.floor(
            Math.random() * 8
          ),
        projectile.dir,
        true,
        projectile.owner
      );
    }

    if (
      projectile.x < -100 ||
      projectile.x >
        canvas.width + 100
    ) {
      projectile.life = Math.min(
        projectile.life,
        0.15
      );
    }
  });

  projectiles =
    projectiles.filter(
      (projectile) =>
        projectile.life > 0
    );
}

function randomPhrase(fighterIndex) {
  const phrases =
    fighterPhrases[fighterIndex];

  return phrases[
    Math.floor(
      Math.random() *
        phrases.length
    )
  ];
}

function updateSpeech() {
  const now = performance.now();

  if (now < nextSpeechChange) return;

  fighterSpeech = [
    randomPhrase(0),
    randomPhrase(1)
  ];

  nextSpeechChange = now + 1000;
}

function update(dt) {
  updateSpeech();

  const human = fighters[selectedPlayer];
  const ai =
    fighters[1 - selectedPlayer];

  const diff =
    fighters[0].hp -
    fighters[1].hp;

  fighters[0].powered =
    diff >= 15 &&
    fighters[0].hp > 0 &&
    fighters[1].hp > 0;

  fighters[1].powered =
    diff <= -15 &&
    fighters[0].hp > 0 &&
    fighters[1].hp > 0;

  const playerIsPowered =
    fighters[selectedPlayer].powered;

  if (
    playerIsPowered &&
    !playerWasPowered
  ) {
    showPowerNotice();
  }

  if (
    !playerIsPowered &&
    playerWasPowered
  ) {
    hidePowerNotice();
  }

  playerWasPowered =
    playerIsPowered;

  controlHuman(human, dt);
  controlAI(ai, human, dt);

  fighters.forEach((fighter) => {
    fighter.cooldown = Math.max(
      0,
      fighter.cooldown - dt
    );

    fighter.specialCooldown =
      Math.max(
        0,
        fighter.specialCooldown - dt
      );

    fighter.attackTime = Math.max(
      0,
      fighter.attackTime - dt
    );

    fighter.hitTime = Math.max(
      0,
      fighter.hitTime - dt
    );

    fighter.vy += 1280 * dt;
    fighter.x += fighter.vx * dt;
    fighter.y += fighter.vy * dt;

    if (fighter.y >= ground) {
      fighter.y = ground;
      fighter.vy = 0;
      fighter.onGround = true;
    }

    fighter.x = Math.max(
      65,
      Math.min(
        canvas.width - 65,
        fighter.x
      )
    );
  });

  const fighterA = fighters[0];
  const fighterB = fighters[1];

  if (
    Math.abs(
      fighterA.x - fighterB.x
    ) < 85
  ) {
    const push =
      (85 -
        Math.abs(
          fighterA.x -
            fighterB.x
        )) /
      2;

    fighterA.x -= push;
    fighterA.x = Math.max(
      65,
      fighterA.x
    );

    fighterB.x += push;
    fighterB.x = Math.min(
      canvas.width - 65,
      fighterB.x
    );
  }

  updateProjectiles(dt);
}

function showPowerNotice() {
  const notice = $("#powerNotice");

  clearTimeout(powerNoticeTimer);
  notice.classList.remove("hidden");

  powerNoticeTimer = setTimeout(() => {
    notice.classList.add("hidden");
  }, 3200);
}

function hidePowerNotice() {
  clearTimeout(powerNoticeTimer);

  $("#powerNotice")
    .classList.add("hidden");
}

function updateHud() {
  fighters.forEach(
    (fighter, index) => {
      const bar = $("#hp" + index);
      const text =
        $("#hpText" + index);

      bar.style.width =
        fighter.hp + "%";

      bar.className =
        "fill " +
        (fighter.hp > 50
          ? "green"
          : fighter.hp > 20
            ? "yellow"
            : "red");

      text.textContent =
        fighter.hp;
    }
  );

  if (
    performance.now() >=
    statusNoticeUntil
  ) {
    const powered =
      fighters.find(
        (fighter) =>
          fighter.powered
      );

    $("#roundStatus").textContent =
      !running
        ? "PREPARE-SE!"
        : powered
          ? powered.i ===
            selectedPlayer
            ? "SUPER BAGRE: VOCÊ"
            : "SUPER BAGRE: PC"
          : selectedPlayer === 0
            ? "VOCÊ × PC"
            : "PC × VOCÊ";
  }
}

function endMatch(winner) {
  running = false;

  cancelAnimationFrame(raf);

  $("#winnerText").textContent =
    winner === selectedPlayer
      ? "VOCÊ É O CAMPEÃO DOS BAGRES!"
      : "O PC VENCEU A BATALHA!";

  result.classList.remove("hidden");
}

function draw() {
  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const sky =
    ctx.createLinearGradient(
      0,
      0,
      0,
      560
    );

  sky.addColorStop(
    0,
    "#0a3650"
  );

  sky.addColorStop(
    0.6,
    "#092037"
  );

  sky.addColorStop(
    1,
    "#07101d"
  );

  ctx.fillStyle = sky;

  ctx.fillRect(
    0,
    0,
    1100,
    560
  );

  ctx.globalAlpha = 0.22;

  for (let i = 0; i < 18; i++) {
    ctx.fillStyle =
      i % 2
        ? "#28d8ff"
        : "#725cff";

    ctx.beginPath();

    ctx.arc(
      (i * 79 + 35) % 1100,
      45 + (i % 5) * 42,
      2 + (i % 3) * 2,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  ctx.globalAlpha = 1;

  ctx.fillStyle = "#0b1721";

  ctx.fillRect(
    0,
    ground + 12,
    1100,
    100
  );

  ctx.strokeStyle = "#31c9df55";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(0, ground + 12);
  ctx.lineTo(1100, ground + 12);
  ctx.stroke();

  fighters.forEach(drawFighter);
  drawProjectiles();

  fighters.forEach((fighter) => {
    drawSpeechBubble(
      fighter,
      fighterSpeech[fighter.i]
    );
  });
}

function drawProjectiles() {
  projectiles.forEach(
    (projectile) => {
      const progress =
        1 -
        projectile.life /
          projectile.maxLife;

      const pulse =
        0.9 +
        0.12 *
          Math.sin(
            performance.now() / 35
          );

      const x1 =
        projectile.startX;

      const x2 = projectile.x;

      ctx.save();
      ctx.lineCap = "round";

      ctx.shadowColor =
        "#126dff";

      ctx.shadowBlur = 38;

      ctx.strokeStyle =
        "rgba(35,92,255,.38)";

      ctx.lineWidth =
        105 * pulse;

      ctx.beginPath();
      ctx.moveTo(x1, projectile.y);
      ctx.lineTo(x2, projectile.y);
      ctx.stroke();

      ctx.shadowColor =
        "#00eaff";

      ctx.shadowBlur = 28;

      ctx.strokeStyle =
        "#00eaff";

      ctx.lineWidth =
        68 * pulse;

      ctx.beginPath();
      ctx.moveTo(x1, projectile.y);
      ctx.lineTo(x2, projectile.y);
      ctx.stroke();

      ctx.strokeStyle =
        "#89ffff";

      ctx.lineWidth =
        39 * pulse;

      ctx.beginPath();
      ctx.moveTo(x1, projectile.y);
      ctx.lineTo(x2, projectile.y);
      ctx.stroke();

      ctx.strokeStyle =
        "#ffffff";

      ctx.lineWidth =
        15 * pulse;

      ctx.beginPath();
      ctx.moveTo(x1, projectile.y);
      ctx.lineTo(x2, projectile.y);
      ctx.stroke();

      const headX = x2;
      const radius =
        49 * pulse;

      const glow =
        ctx.createRadialGradient(
          headX,
          projectile.y,
          2,
          headX,
          projectile.y,
          radius * 1.45
        );

      glow.addColorStop(
        0,
        "#ffffff"
      );

      glow.addColorStop(
        0.28,
        "#d8ffff"
      );

      glow.addColorStop(
        0.57,
        "#00eaff"
      );

      glow.addColorStop(
        0.82,
        "#1671ff"
      );

      glow.addColorStop(
        1,
        "rgba(20,70,255,0)"
      );

      ctx.fillStyle = glow;

      ctx.beginPath();

      ctx.arc(
        headX,
        projectile.y,
        radius * 1.45,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.translate(
        headX,
        projectile.y
      );

      ctx.rotate(progress * 5);

      ctx.fillStyle =
        "rgba(0,225,255,.82)";

      for (
        let i = 0;
        i < 16;
        i++
      ) {
        ctx.rotate(Math.PI / 8);

        ctx.beginPath();

        ctx.moveTo(
          radius * 0.65,
          -5
        );

        ctx.lineTo(
          radius *
            (1.25 +
              (i % 3) * 0.18),
          0
        );

        ctx.lineTo(
          radius * 0.65,
          5
        );

        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }
  );
}

function drawGoldenHair(headY) {
  ctx.save();

  ctx.translate(
    0,
    headY - 34
  );

  ctx.fillStyle = "#ffd52e";
  ctx.strokeStyle = "#fff09a";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ffe74f";
  ctx.shadowBlur = 23;

  ctx.beginPath();

  ctx.moveTo(-44, 8);
  ctx.lineTo(-57, -28);
  ctx.lineTo(-31, -17);
  ctx.lineTo(-34, -65);
  ctx.lineTo(-9, -34);
  ctx.lineTo(2, -83);
  ctx.lineTo(17, -37);
  ctx.lineTo(43, -70);
  ctx.lineTo(36, -25);
  ctx.lineTo(61, -39);
  ctx.lineTo(45, 8);

  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawAura(fighter, headY) {
  ctx.save();

  ctx.globalAlpha =
    0.36 +
    0.12 *
      Math.sin(
        performance.now() / 90
      );

  ctx.strokeStyle = "#ffe23b";
  ctx.lineWidth = 7;
  ctx.shadowColor = "#ffe83d";
  ctx.shadowBlur = 30;

  ctx.beginPath();

  ctx.ellipse(
    0,
    -100,
    76,
    145,
    0,
    0,
    Math.PI * 2
  );

  ctx.stroke();
  ctx.restore();
}

function drawFighter(fighter) {
  ctx.save();

  ctx.translate(
    fighter.x,
    fighter.y
  );

  if (fighter.dead) {
    ctx.rotate(
      fighter.i === 0
        ? -1.25
        : 1.25
    );
  }

  const recoil =
    fighter.hitTime > 0
      ? Math.sin(
          fighter.hitTime * 80
        ) * 7
      : 0;

  ctx.translate(recoil, 0);

  ctx.strokeStyle =
    fighter.i === selectedPlayer
      ? "#b7fbff"
      : "#ffdb8a";

  ctx.lineWidth = 10;
  ctx.lineCap = "round";

  ctx.shadowColor =
    fighter.i === selectedPlayer
      ? "#29e4ff"
      : "#ff922b";

  ctx.shadowBlur = 13;

  const bodyTop = -125;
  const headY = -174;

  if (fighter.powered) {
    drawAura(fighter, headY);
  }

  ctx.beginPath();
  ctx.moveTo(0, bodyTop);
  ctx.lineTo(0, -50);
  ctx.stroke();

  const attacking =
    fighter.attackTime > 0;

  ctx.beginPath();

  ctx.moveTo(0, -105);

  ctx.lineTo(
    fighter.facing *
      (attacking ? 92 : 55),
    attacking ? -112 : -78
  );

  ctx.moveTo(0, -105);

  ctx.lineTo(
    -fighter.facing * 48,
    -75
  );

  ctx.stroke();

  ctx.beginPath();

  ctx.moveTo(0, -50);
  ctx.lineTo(-37, 0);

  ctx.moveTo(0, -50);
  ctx.lineTo(39, 0);

  ctx.stroke();

  ctx.shadowBlur = 0;

  if (fighter.powered) {
    drawGoldenHair(headY);
  }

  ctx.save();

  ctx.beginPath();

  ctx.arc(
    0,
    headY,
    49,
    0,
    Math.PI * 2
  );

  ctx.clip();

  const expression =
    fighter.hp > 60
      ? 0
      : fighter.hp > 30
        ? 1
        : 2;

  const image =
    faces[fighter.i][expression];

if (
  image &&
  image.complete &&
  image.naturalWidth > 0
) {
  ctx.drawImage(
    image,
    -55,
    headY - 55,
    110,
    110
  );
} else {
  ctx.fillStyle = "#64748b";

  ctx.fillRect(
    -55,
    headY - 55,
    110,
    110
  );

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText(
    "CARREGANDO",
    0,
    headY
  );
}
  

  ctx.restore();

  ctx.strokeStyle =
    fighter.i === selectedPlayer
      ? "#5ef2ff"
      : "#ffc85c";

  ctx.lineWidth = 5;

  ctx.beginPath();

  ctx.arc(
    0,
    headY,
    51,
    0,
    Math.PI * 2
  );

  ctx.stroke();

  if (attacking) {
    ctx.fillStyle = "#fff";
    ctx.font = "900 25px Arial";

    ctx.fillText(
      fighter.specialCooldown > 2.7
        ? "⚡"
        : "💥",
      fighter.facing * 105,
      -118
    );
  }

  if (fighter.powered) {
    ctx.fillStyle = "#ffe342";
    ctx.font = "900 15px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
      "SUPER BAGRE",
      0,
      -242
    );
  }

  ctx.restore();
}

function roundedRectangle(
  context,
  x,
  y,
  width,
  height,
  radius
) {
  const limitedRadius = Math.min(
    radius,
    width / 2,
    height / 2
  );

  context.beginPath();

  context.moveTo(
    x + limitedRadius,
    y
  );

  context.lineTo(
    x + width - limitedRadius,
    y
  );

  context.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + limitedRadius
  );

  context.lineTo(
    x + width,
    y + height - limitedRadius
  );

  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - limitedRadius,
    y + height
  );

  context.lineTo(
    x + limitedRadius,
    y + height
  );

  context.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - limitedRadius
  );

  context.lineTo(
    x,
    y + limitedRadius
  );

  context.quadraticCurveTo(
    x,
    y,
    x + limitedRadius,
    y
  );

  context.closePath();
}

function drawSpeechBubble(
  fighter,
  text
) {
  if (!text || fighter.dead) return;

  ctx.save();

  const bubbleWidth = 250;
  const bubbleHeight = 64;

  const bubbleX = Math.max(
    12,
    Math.min(
      canvas.width -
        bubbleWidth -
        12,
      fighter.x -
        bubbleWidth / 2
    )
  );


