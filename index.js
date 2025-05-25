const { SuiClient, getFullnodeUrl } = require('@mysten/sui.js/client');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { decodeSuiPrivateKey } = require('@mysten/sui.js/cryptography');
const dotenv = require('dotenv');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs').promises;
const SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent;

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  wallet: (msg) => console.log(`${colors.yellow}[➤] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`\n${colors.cyan}[⏳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log(`--------------------------------------------------`);
    console.log(`    Duhhe Engine Tesnet Bot - Zonaairdrop    `);
    console.log(`--------------------------------------------------${colors.reset}\n`);
  },
};

dotenv.config();

const CONFIG = {
  WRAP: {
    enabled: true,
    amount: 100_000_000,
  },
  SWAP_wSUI_wDUBHE: {
    enabled: true,
    amount: 100_000,
    repeat: 1,
  },
  SWAP_wDUBHE_wSUI: {
    enabled: true,
    amount: 100_000,
    repeat: 1,
  },
  SWAP_wSUI_wSTARS: {
    enabled: true,
    amount: 100_000,
    repeat: 1,
  },
  SWAP_wSTARS_wSUI: {
    enabled: true,
    amount: 100_000,
    repeat: 1,
  },
  ADD_LIQUIDITY_wSUI_wDUBHE: {
    enabled: true,
    asset0: 0,
    asset1: 1,
    amount0: 1_000_000,
    amount1: 5765,
    min0: 1,
    min1: 1,
    label: 'Add Liquidity wSUI-wDUBHE',
  },
  ADD_LIQUIDITY_wSUI_wSTARS: {
    enabled: true,
    asset0: 0,
    asset1: 3,
    amount0: 1_000_000,
    amount1: 19149,
    min0: 1,
    min1: 1,
    label: 'Add Liquidity wSUI-wSTARS',
  },
  ADD_LIQUIDITY_wDUBHE_wSTARS: {
    enabled: true,
    asset0: 1,
    asset1: 3,
    amount0: 2000,
    amount1: 13873,
    min0: 1,
    min1: 1,
    label: 'Add Liquidity wDUBHE-wSTARS',
  },
  DELAY_BETWEEN_TX_MS: 5000,
};

const CONTRACTS = {
  WRAP_TARGET: '0xa6477a6bf50e2389383b34a76d59ccfbec766ff2decefe38e1d8436ef8a9b245::dubhe_wrapper_system::wrap',
  DEX_TARGET: '0xa6477a6bf50e2389383b34a76d59ccfbec766ff2decefe38e1d8436ef8a9b245::dubhe_dex_system::swap_exact_tokens_for_tokens',
  SHARED_OBJECT: '0x8ece4cb6de126eb5c7a375f90c221bdc16c81ad8f6f894af08e0b6c25fb50a45',
  PATHS: {
    wSUI_wDUBHE: [BigInt(0), BigInt(1)],
    wDUBHE_wSUI: [BigInt(1), BigInt(0)],
    wSUI_wSTARS: [BigInt(0), BigInt(3)],
    wSTARS_wSUI: [BigInt(3), BigInt(0)],
  },
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function loadProxies() {
  try {
    const data = await fs.readFile('proxies.txt', 'utf8');
    const proxies = data.split('\n').map(line => line.trim()).filter(line => line);
    if (proxies.length === 0) {
      logger.warn('No proxies found in proxies.txt. Running without proxy.');
      return [];
    }
    logger.info(`Loaded ${proxies.length} proxies from proxies.txt`);
    return proxies;
  } catch (e) {
    logger.error(`Failed to read proxies.txt: ${e.message}`);
    return [];
  }
}

function parseProxy(proxy) {
  let protocol = 'http';
  let auth = null;
  let host = proxy;

  if (proxy.includes('://')) {
    const [proto, rest] = proxy.split('://');
    protocol = proto.toLowerCase();
    host = rest;
  }

  if (host.includes('@')) {
    const [credentials, hostPort] = host.split('@');
    auth = credentials;
    host = hostPort;
  }

  const [ip, port] = host.split(':');
  if (!ip || !port) {
    logger.error(`Invalid proxy format: ${proxy}`);
    return null;
  }

  const proxyUrl = `${protocol}://${auth ? auth + '@' : ''}${ip}:${port}`;

  let agent;
  if (['socks4', 'socks5'].includes(protocol)) {
    agent = new SocksProxyAgent(proxyUrl);
  } else if (['http', 'https'].includes(protocol)) {
    agent = new HttpsProxyAgent(proxyUrl);
  } else {
    logger.error(`Unsupported proxy protocol: ${protocol}`);
    return null;
  }

  return { agent, url: proxyUrl, protocol };
}

function getRandomProxy(proxies) {
  if (!proxies.length) return null;
  const randomIndex = Math.floor(Math.random() * proxies.length);
  const proxy = parseProxy(proxies[randomIndex]);
  if (!proxy) {
    logger.warn(`Skipping invalid proxy: ${proxies[randomIndex]}`);
    proxies.splice(randomIndex, 1);
    return getRandomProxy(proxies);
  }
  return proxy;
}

function getTransactionCount() {
  return new Promise((resolve) => {
    rl.question(`${colors.cyan}Enter the number of transactions per wallet for this cycle (1-100): ${colors.reset}`, (answer) => {
      const count = parseInt(answer, 10);
      if (isNaN(count) || count < 1 || count > 100) {
        logger.error('Invalid input. Please enter a number between 1 and 100.');
        resolve(getTransactionCount());
      } else {
        logger.info(`Set ${count} transactions per wallet for this cycle.`);
        resolve(count);
      }
    });
  });
}

function readKeys() {
  const keys = [];
  const envVars = Object.keys(process.env);

  const privateKeys = envVars.filter((key) => key.startsWith('PRIVATE_KEY_'));
  for (const key of privateKeys) {
    const value = process.env[key]?.trim();
    if (value) {
      try {
        const { secretKey } = decodeSuiPrivateKey(value);
        keys.push({ type: 'privateKey', value });
      } catch (e) {
        logger.error(`Invalid private key for ${key}: ${e.message}`);
      }
    }
  }

  const mnemonics = envVars.filter((key) => key.startsWith('MNEMONIC_'));
  for (const key of mnemonics) {
    const value = process.env[key]?.trim();
    if (value) {
      try {
        const keypair = Ed25519Keypair.deriveKeypair(value);
        keys.push({ type: 'mnemonic', value, keypair });
      } catch (e) {
        logger.error(`Invalid mnemonic for ${key}: ${e.message}`);
      }
    }
  }

  if (keys.length === 0) {
    logger.error('No valid private keys or mnemonics found in .env');
    process.exit(1);
  }
  return keys;
}

function displayCountdown() {
  const nextRun = new Date();
  nextRun.setDate(nextRun.getDate() + 1);
  nextRun.setHours(0, 0, 0, 0);

  const updateCountdown = () => {
    const now = new Date();
    const timeLeft = nextRun - now;
    if (timeLeft <= 0) {
      logger.info('Starting daily transactions...');
      return true;
    }

    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    process.stdout.write(`\rNext run in: ${hours}h ${minutes}m ${seconds}s     `);
    return false;
  };

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (updateCountdown()) {
        clearInterval(interval);
        process.stdout.write('\n');
        resolve();
      }
    }, 1000);
  });
}

async function wrapSUI(client, keypair, amount) {
  const tx = new TransactionBlock();
  tx.moveCall({
    target: CONTRACTS.WRAP_TARGET,
    arguments: [tx.pure(amount)],
  });

  return client.signAndExecuteTransactionBlock({
    transactionBlock: tx,
    signer: keypair,
  });
}

async function swap(client, keypair, amount, path) {
  const tx = new TransactionBlock();
  tx.moveCall({
    target: CONTRACTS.DEX_TARGET,
    arguments: [
      tx.pure(path),
      tx.pure(amount),
      tx.pure(0), // min amount out
      tx.pure(0), // deadline
    ],
  });

  return client.signAndExecuteTransactionBlock({
    transactionBlock: tx,
    signer: keypair,
  });
}

function logTx(label, keypair, digest) {
  const address = keypair.getPublicKey().toSuiAddress();
  logger.step(`${label} for ${address}`);
  if (digest) {
    logger.info(`Transaction: https://testnet.suivision.xyz/txblock/${digest}`);
    logger.info('thx - transaksi berhasil');
  } else {
    logger.error('Failed to retrieve transaction digest!');
  }
}

function logError(label, keypair, e) {
  const address = keypair.getPublicKey().toSuiAddress();
  logger.error(`${label} failed for ${address}: ${e.message}`);
  if (e.message.toLowerCase().includes('blocked') || e.message.toLowerCase().includes('block')) {
    logger.info('thx - transaksi diblokir testnet sui');
  }
}

async function main() {
  logger.banner();

  const proxies = await loadProxies();
  const keys = readKeys();
  const txCount = await getTransactionCount();

  await displayCountdown();

  while (true) {
    for (const key of keys) {
      const keypair = key.type === 'mnemonic' ? key.keypair : Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(key.value).secretKey);

      const proxy = getRandomProxy(proxies);
      const client = new SuiClient({
        fullnode: getFullnodeUrl('testnet'),
        ...(proxy ? { agent: proxy.agent } : {}),
      });

      for (let i = 0; i < txCount; i++) {
        try {
          if (CONFIG.WRAP.enabled) {
            const resWrap = await wrapSUI(client, keypair, CONFIG.WRAP.amount);
            logTx('Wrap SUI', keypair, resWrap.digest);
          }

          if (CONFIG.SWAP_wSUI_wDUBHE.enabled) {
            for (let j = 0; j < CONFIG.SWAP_wSUI_wDUBHE.repeat; j++) {
              const resSwap = await swap(client, keypair, CONFIG.SWAP_wSUI_wDUBHE.amount, CONTRACTS.PATHS.wSUI_wDUBHE);
              logTx('Swap wSUI -> wDUBHE', keypair, resSwap.digest);
            }
          }

          if (CONFIG.SWAP_wDUBHE_wSUI.enabled) {
            for (let j = 0; j < CONFIG.SWAP_wDUBHE_wSUI.repeat; j++) {
              const resSwapBack = await swap(client, keypair, CONFIG.SWAP_wDUBHE_wSUI.amount, CONTRACTS.PATHS.wDUBHE_wSUI);
              logTx('Swap wDUBHE -> wSUI', keypair, resSwapBack.digest);
            }
          }

          if (CONFIG.SWAP_wSUI_wSTARS.enabled) {
            for (let j = 0; j < CONFIG.SWAP_wSUI_wSTARS.repeat; j++) {
              const resSwapStars = await swap(client, keypair, CONFIG.SWAP_wSUI_wSTARS.amount, CONTRACTS.PATHS.wSUI_wSTARS);
              logTx('Swap wSUI -> wSTARS', keypair, resSwapStars.digest);
            }
          }

          if (CONFIG.SWAP_wSTARS_wSUI.enabled) {
            for (let j = 0; j < CONFIG.SWAP_wSTARS_wSUI.repeat; j++) {
              const resSwapStarsBack = await swap(client, keypair, CONFIG.SWAP_wSTARS_wSUI.amount, CONTRACTS.PATHS.wSTARS_wSUI);
              logTx('Swap wSTARS -> wSUI', keypair, resSwapStarsBack.digest);
            }
          }

          // You can add other transactions like ADD_LIQUIDITY similarly here...

          await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_TX_MS));
        } catch (e) {
          logError('Transaction', keypair, e);
        }
      }
    }
  }
}

main().catch((e) => {
  logger.error(`Fatal error: ${e.message}`);
  process.exit(1);
});
