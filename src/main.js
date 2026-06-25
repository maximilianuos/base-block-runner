import { ethers } from 'ethers';
import './style.css';

const CONTRACT_ADDRESS = '0xE2D82b9c236859EE3a68146509260e564c2b5837';
const BASE_CHAIN_ID_HEX = '0x2105';
const MIN_SCORE_TO_SAVE = 250;

const BASE_CHAIN_PARAMS = {
  chainId: BASE_CHAIN_ID_HEX,
  chainName: 'Base',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org'],
};

const CONTRACT_ABI = [
  'function submitScore(uint256 score) external',
  'function getPlayerStats(address player) external view returns (uint256 bestScore, uint256 lastScore, uint256 gamesSaved, uint256 lastPlayedAt)',
  'function getBestScore(address player) external view returns (uint256)',
];

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="page">
    <header class="topbar">
      <div>
        <div class="eyebrow">Base Mainnet Game - Onchain Prototype</div>
        <h1>Base Block Runner</h1>
        <p class="subtitle">
          Jump over the onchain obstacles. After Game Over, save your score on Base Mainnet.
        </p>
        <p class="builder-credit">
          Built by
          <a href="https://github.com/maximilianuos" target="_blank" rel="noreferrer">Maximilianuos</a>
          with ❤️ for the Hyrcani community.
        </p>
      </div>
      <div class="status-card">
        <span>Wallet</span>
        <strong id="walletText">Not connected</strong>
        <small id="networkText">Base required</small>
      </div>
    </header>

    <main class="game-shell">
      <div class="hud">
        <div>
          <span>Score</span>
          <strong id="scoreText">0</strong>
        </div>
        <div>
          <span>Best Local</span>
          <strong id="bestText">0</strong>
        </div>
        <div>
          <span>Best Onchain</span>
          <strong id="onchainBestText">-</strong>
        </div>
        <div>
          <span>Speed</span>
          <strong id="speedText">1.0x</strong>
        </div>
      </div>

      <div class="canvas-wrap">
        <canvas id="gameCanvas" width="900" height="360"></canvas>

        <div id="overlay" class="overlay">
          <h2 id="overlayTitle">Base Block Runner</h2>
          <p id="overlayText">
            Click Start Game to begin. During the run, press Space, Arrow Up, click, or tap to jump.
          </p>
          <button id="startButton">Start Game</button>
        </div>
      </div>

      <div class="controls">
        <button id="connectButton">Connect Wallet</button>
        <button id="jumpButton">Jump</button>
        <button id="restartButton">Restart</button>
        <button id="saveButton" disabled>Save Score on Base</button>
      </div>

      <p class="note">
        Scores of 250+ can be saved on Base Mainnet. This app never requests USDC approval or token transfers; only a Base gas fee is required when saving a score.
      </p>

      <a id="txLink" class="tx-link hidden" target="_blank" rel="noreferrer">
        View transaction on Basescan
      </a>
    </main>
  </div>
`;

const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');

const scoreText = document.querySelector('#scoreText');
const bestText = document.querySelector('#bestText');
const onchainBestText = document.querySelector('#onchainBestText');
const speedText = document.querySelector('#speedText');
const walletText = document.querySelector('#walletText');
const networkText = document.querySelector('#networkText');
const overlay = document.querySelector('#overlay');
const overlayTitle = document.querySelector('#overlayTitle');
const overlayText = document.querySelector('#overlayText');
const startButton = document.querySelector('#startButton');
const connectButton = document.querySelector('#connectButton');
const jumpButton = document.querySelector('#jumpButton');
const restartButton = document.querySelector('#restartButton');
const saveButton = document.querySelector('#saveButton');
const txLink = document.querySelector('#txLink');

const GAME_WIDTH = 900;
const GAME_HEIGHT = 360;
const GROUND_Y = 285;

let state = 'ready';
let lastTime = 0;
let elapsed = 0;
let score = 0;
let bestScore = Number(localStorage.getItem('baseBlockRunnerBest') || 0);
let speed = 1;
let nextObstacleIn = 0;

let provider = null;
let signer = null;
let contract = null;
let connectedAddress = null;

const player = {
  x: 95,
  y: GROUND_Y - 46,
  width: 42,
  height: 42,
  velocityY: 0,
  gravity: 0.62,
  jumpPower: -13.5,
  onGround: true,
  legFrame: 0,
};

let obstacles = [];
let particles = [];
let clouds = [
  { x: 160, y: 70, speed: 12, size: 1.0 },
  { x: 430, y: 95, speed: 9, size: 0.8 },
  { x: 720, y: 55, speed: 14, size: 1.1 },
];

bestText.textContent = bestScore;

function formatAddress(address) {
  if (!address) return 'Not connected';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function ensureBaseNetwork() {
  if (!window.ethereum) {
    throw new Error('No wallet found. Please install or enable Rabby/MetaMask.');
  }

  const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });

  if (currentChainId?.toLowerCase() === BASE_CHAIN_ID_HEX) {
    return;
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  } catch (switchError) {
    if (switchError?.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [BASE_CHAIN_PARAMS],
      });
      return;
    }

    throw switchError;
  }
}

async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert('Rabby یا MetaMask در مرورگر پیدا نشد.');
      return false;
    }

    await ensureBaseNetwork();

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    signer = await provider.getSigner();
    connectedAddress = await signer.getAddress();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    walletText.textContent = formatAddress(connectedAddress);
    networkText.textContent = 'Base connected';
    connectButton.textContent = 'Wallet Connected';

    await loadOnchainStats();
    updateSaveButtonState();

    return true;
  } catch (error) {
    console.error(error);
    alert(error?.shortMessage || error?.message || 'Wallet connection failed.');
    return false;
  }
}

async function restoreWalletIfAlreadyConnected() {
  try {
    if (!window.ethereum) return;

    const accounts = await window.ethereum.request({ method: 'eth_accounts' });

    if (!accounts || accounts.length === 0) {
      return;
    }

    connectedAddress = accounts[0];
    walletText.textContent = formatAddress(connectedAddress);
    connectButton.textContent = 'Wallet Connected';

    provider = new ethers.BrowserProvider(window.ethereum);

    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });

    if (currentChainId?.toLowerCase() !== BASE_CHAIN_ID_HEX) {
      networkText.textContent = 'Switch to Base';
      onchainBestText.textContent = '-';
      updateSaveButtonState();
      return;
    }

    signer = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    networkText.textContent = 'Base connected';

    await loadOnchainStats();
    updateSaveButtonState();
  } catch (error) {
    console.error('Auto wallet restore failed:', error);
  }
}

async function loadOnchainStats() {
  try {
    if (!window.ethereum || !connectedAddress) return;

    if (!provider) {
      provider = new ethers.BrowserProvider(window.ethereum);
    }

    const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const stats = await readContract.getPlayerStats(connectedAddress);

    onchainBestText.textContent = stats[0].toString();
  } catch (error) {
    console.error(error);
    onchainBestText.textContent = 'Error';
  }
}

function updateSaveButtonState() {
  if (state !== 'gameover') {
    saveButton.disabled = true;
    saveButton.textContent = 'Save Score on Base';
    return;
  }

  if (score < MIN_SCORE_TO_SAVE) {
    saveButton.disabled = true;
    saveButton.textContent = `Minimum score: ${MIN_SCORE_TO_SAVE}`;
    return;
  }

  saveButton.disabled = false;
  saveButton.textContent = connectedAddress
    ? 'Save Score on Base'
    : 'Connect wallet and save score';
}

async function saveScoreOnBase() {
  if (state !== 'gameover') {
    alert('اول یک دور بازی را کامل کن. بعد از Game Over امتیاز قابل ذخیره است.');
    return;
  }

  const finalScore = Number(score);

  if (!finalScore || finalScore <= 0) {
    alert('امتیاز معتبر نیست.');
    return;
  }

  if (finalScore < MIN_SCORE_TO_SAVE) {
    alert(`برای ثبت امتیاز روی Base باید حداقل ${MIN_SCORE_TO_SAVE} امتیاز بگیری.`);
    updateSaveButtonState();
    return;
  }

  try {
    saveButton.disabled = true;
    saveButton.textContent = 'Opening wallet...';

    if (!connectedAddress || !contract) {
      const connected = await connectWallet();
      if (!connected) {
        updateSaveButtonState();
        return;
      }
    }

    await ensureBaseNetwork();

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    connectedAddress = await signer.getAddress();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    saveButton.textContent = 'Confirm in wallet...';

    const tx = await contract.submitScore(BigInt(finalScore));

    txLink.href = `https://basescan.org/tx/${tx.hash}`;
    txLink.classList.remove('hidden');

    saveButton.textContent = 'Saving on Base...';

    const receipt = await tx.wait();

    if (receipt.status !== 1) {
      throw new Error('Transaction failed.');
    }

    saveButton.textContent = 'Saved on Base ✅';
    await loadOnchainStats();
  } catch (error) {
    console.error(error);

    const message = String(error?.shortMessage || error?.message || '');

    if (
      message.toLowerCase().includes('user rejected') ||
      message.toLowerCase().includes('rejected') ||
      message.toLowerCase().includes('denied')
    ) {
      alert('تراکنش توسط کاربر لغو شد.');
    } else {
      alert(error?.shortMessage || error?.message || 'خطا در ثبت امتیاز روی Base.');
    }

    updateSaveButtonState();
  }
}

function resetGame() {
  state = 'ready';
  elapsed = 0;
  score = 0;
  speed = 1;
  nextObstacleIn = 0.8;
  obstacles = [];
  particles = [];

  player.y = GROUND_Y - player.height;
  player.velocityY = 0;
  player.onGround = true;
  player.legFrame = 0;

  scoreText.textContent = '0';
  speedText.textContent = '1.0x';
  txLink.classList.add('hidden');
  updateSaveButtonState();

  showOverlay(
    'Base Block Runner',
    'Click Start Game to begin. During the run, press Space, Arrow Up, click, or tap to jump.',
    'Start Game'
  );
}

function startGame() {
  if (state === 'running') return;

  state = 'running';
  elapsed = 0;
  score = 0;
  speed = 1;
  nextObstacleIn = 0.75;
  obstacles = [];
  particles = [];

  player.y = GROUND_Y - player.height;
  player.velocityY = 0;
  player.onGround = true;

  overlay.classList.add('hidden');
  txLink.classList.add('hidden');
  updateSaveButtonState();
}

function gameOver() {
  state = 'gameover';

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('baseBlockRunnerBest', String(bestScore));
    bestText.textContent = bestScore;
  }

  updateSaveButtonState();

  const saveMessage =
    score >= MIN_SCORE_TO_SAVE
      ? 'You can now save this score on Base Mainnet.'
      : `You need at least ${MIN_SCORE_TO_SAVE} points to save your score on Base.`;

  showOverlay(
    'Game Over',
    `Final Score: ${score}. ${saveMessage}`,
    'Play Again'
  );
}

function showOverlay(title, text, buttonText) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startButton.textContent = buttonText;
  overlay.classList.remove('hidden');
}

function jump() {
  // پرش فقط وقتی بازی واقعاً در حال اجراست مجاز است.
  // Space یا Tap نباید بازی را از حالت Ready یا Game Over دوباره Start کند.
  if (state !== 'running') return;

  if (!player.onGround) return;

  player.velocityY = player.jumpPower;
  player.onGround = false;

  createParticles(player.x + 8, GROUND_Y - 4, 8);
}

function createParticles(x, y, count) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x,
      y,
      vx: -1.5 - Math.random() * 2,
      vy: -1 - Math.random() * 2,
      life: 0.45 + Math.random() * 0.25,
      size: 2 + Math.random() * 3,
    });
  }
}

function spawnObstacle() {
  const types = [
    { width: 28, height: 46, label: 'GAS' },
    { width: 38, height: 36, label: 'BUG' },
    { width: 24, height: 58, label: 'TX' },
  ];

  const type = types[Math.floor(Math.random() * types.length)];

  obstacles.push({
    x: GAME_WIDTH + 30,
    y: GROUND_Y - type.height,
    width: type.width,
    height: type.height,
    label: type.label,
    passed: false,
  });
}

function update(delta) {
  if (state !== 'running') {
    updateClouds(delta);
    draw();
    return;
  }

  elapsed += delta;
  speed = 1 + elapsed / 22;
  const worldSpeed = 255 * speed;

  score = Math.floor(elapsed * 10);
  scoreText.textContent = score;
  speedText.textContent = `${speed.toFixed(1)}x`;

  player.velocityY += player.gravity;
  player.y += player.velocityY;

  if (player.y >= GROUND_Y - player.height) {
    player.y = GROUND_Y - player.height;
    player.velocityY = 0;
    player.onGround = true;
  }

  player.legFrame += delta * 12 * speed;

  nextObstacleIn -= delta;
  if (nextObstacleIn <= 0) {
    spawnObstacle();
    nextObstacleIn = Math.max(0.55, 1.2 - speed * 0.08) + Math.random() * 0.55;
  }

  obstacles.forEach((obstacle) => {
    obstacle.x -= worldSpeed * delta;

    if (!obstacle.passed && obstacle.x + obstacle.width < player.x) {
      obstacle.passed = true;
      score += 5;
      createParticles(obstacle.x + obstacle.width, obstacle.y + obstacle.height, 4);
    }
  });

  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -50);

  particles.forEach((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.08;
    particle.life -= delta;
  });

  particles = particles.filter((particle) => particle.life > 0);

  updateClouds(delta);

  if (checkCollision()) {
    createParticles(player.x + 20, player.y + 35, 18);
    gameOver();
  }

  draw();
}

function updateClouds(delta) {
  clouds.forEach((cloud) => {
    cloud.x -= cloud.speed * delta;

    if (cloud.x < -120) {
      cloud.x = GAME_WIDTH + 120;
      cloud.y = 45 + Math.random() * 70;
    }
  });
}

function checkCollision() {
  const playerBox = {
    x: player.x + 7,
    y: player.y + 5,
    width: player.width - 12,
    height: player.height - 8,
  };

  return obstacles.some((obstacle) => {
    const obstacleBox = {
      x: obstacle.x + 3,
      y: obstacle.y + 3,
      width: obstacle.width - 6,
      height: obstacle.height - 4,
    };

    return (
      playerBox.x < obstacleBox.x + obstacleBox.width &&
      playerBox.x + playerBox.width > obstacleBox.x &&
      playerBox.y < obstacleBox.y + obstacleBox.height &&
      playerBox.y + playerBox.height > obstacleBox.y
    );
  });
}

function draw() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  drawBackground();
  drawClouds();
  drawGround();
  drawObstacles();
  drawPlayer();
  drawParticles();

  if (state === 'ready') {
    drawHelperText('Click Start Game to start');
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, '#eef5ff');
  gradient.addColorStop(0.55, '#ffffff');
  gradient.addColorStop(1, '#f7f9ff');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = 'rgba(0, 82, 255, 0.055)';
  for (let x = 0; x < GAME_WIDTH; x += 48) {
    ctx.fillRect(x, 0, 1, GAME_HEIGHT);
  }

  for (let y = 0; y < GAME_HEIGHT; y += 48) {
    ctx.fillRect(0, y, GAME_WIDTH, 1);
  }
}

function drawClouds() {
  clouds.forEach((cloud) => {
    ctx.save();
    ctx.translate(cloud.x, cloud.y);
    ctx.scale(cloud.size, cloud.size);
    ctx.fillStyle = 'rgba(0, 82, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(0, 10, 18, 0, Math.PI * 2);
    ctx.arc(22, 2, 24, 0, Math.PI * 2);
    ctx.arc(50, 12, 18, 0, Math.PI * 2);
    ctx.roundRect(-10, 10, 78, 18, 9);
    ctx.fill();
    ctx.restore();
  });
}

function drawGround() {
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 1);
  ctx.lineTo(GAME_WIDTH, GROUND_Y + 1);
  ctx.stroke();

  const offset = (elapsed * 120 * speed) % 38;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
  ctx.lineWidth = 2;

  for (let x = -offset; x < GAME_WIDTH; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 18);
    ctx.lineTo(x + 18, GROUND_Y + 18);
    ctx.stroke();
  }
}

function drawPlayer() {
  const x = player.x;
  const y = player.y;

  const legSwing = player.onGround ? Math.sin(player.legFrame) * 7 : 4;
  const armSwing = player.onGround ? Math.sin(player.legFrame + Math.PI) * 6 : -6;

  ctx.save();

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(x + 13, y + 40);
  ctx.lineTo(x + 10 + legSwing, y + 55);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 30, y + 40);
  ctx.lineTo(x + 34 - legSwing, y + 55);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 4, y + 22);
  ctx.lineTo(x - 10 + armSwing, y + 30);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 38, y + 22);
  ctx.lineTo(x + 52 - armSwing, y + 29);
  ctx.stroke();

  ctx.fillStyle = '#0052ff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.roundRect(x, y, player.width, player.height, 9);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.roundRect(x + 6, y + 6, 18, 10, 5);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + 16, y + 18, 4, 0, Math.PI * 2);
  ctx.arc(x + 29, y + 18, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(x + 17, y + 18, 1.7, 0, Math.PI * 2);
  ctx.arc(x + 30, y + 18, 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 23, y + 27, 7, 0.1, Math.PI - 0.1);
  ctx.stroke();

  ctx.restore();
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    ctx.save();

    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#0052ff';
    ctx.lineWidth = 3;
    ctx.roundRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      obstacle.label,
      obstacle.x + obstacle.width / 2,
      obstacle.y + obstacle.height / 2 + 4
    );

    ctx.restore();
  });
}

function drawParticles() {
  particles.forEach((particle) => {
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = '#0052ff';
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function drawHelperText(text) {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.68)';
  ctx.font = '600 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, GAME_WIDTH / 2, 152);
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;

  const delta = Math.min((timestamp - lastTime) / 1000, 0.035);
  lastTime = timestamp;

  update(delta);
  requestAnimationFrame(loop);
}

connectButton.addEventListener('click', connectWallet);
startButton.addEventListener('click', startGame);
jumpButton.addEventListener('click', jump);
restartButton.addEventListener('click', startGame);
saveButton.addEventListener('click', saveScoreOnBase);

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    jump();
  }
});

canvas.addEventListener('pointerdown', () => {
  jump();
});

if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', () => {
    window.location.reload();
  });

  window.ethereum.on?.('chainChanged', () => {
    window.location.reload();
  });
}

resetGame();
restoreWalletIfAlreadyConnected();
requestAnimationFrame(loop);