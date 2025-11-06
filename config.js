require("dotenv").config();

const config = {
  // Trading symbols list
  symbols: [
    "1000PEPEUSDT",
    "ANIMEUSDT",
    "ARBUSDT",
    "DOGEUSDT",
    "FARTCOINUSDT",
    "HMSTRUSDT",
    "HYPEUSDT",
    "LTCUSDT",
    "MELANIAUSDT",
    "RENDERUSDT",
    "RVNUSDT",
    "SHIB1000USDT",
    "STRKUSDT",
    "TONUSDT",
    "TRUMPUSDT",
    "WIFUSDT",
    "WLDUSDT",
    "XLMUSDT",
    "XRPUSDT",
  ],

  defaultDecimals: 3,

  // Bot parameters (overridable via CLI or env)
  intervals: {
    up: process.env.UP_INTERVAL || 3, // seconds
    down: process.env.DOWN_INTERVAL || 1,
    farm: process.env.FARM_INTERVAL || 10,
  },

  thresholds: {
    TP: process.env.TP || 6.9, // Take profit %
    TPF: process.env.TPF || 10, // Force take profit %
    GP: process.env.GP || 0.5, // Grow profit %
    GG: process.env.GG || 0, // Grow grid %
    BALERT: process.env.BALERT || 20, // Balance alert $
    BSTOP: process.env.BSTOP || 10, // Balance stop $
    RA: process.env.RA || 0.005, // Reinvest amount low
  },

  // Grid settings
  priceGaps: {
    down: 0.045,
    up: 0.055,
  },
  minGrids: 3,
  minInvestmentScale: 1.01,
  minInvestment: 1.0,
  leverage: 20,

  // Reinvest thresholds
  reinvest: {
    lowPct: -58,
    highPct: 60,
    aprLow: -7000,
    amountLow: 0.005,
    amountHigh: 0.042,
  },

  // Arbitrage
  arbNumMax: 5000,
  arbNumMin: 5,

  // Delays
  botCreationDelay: 500,
  botRestartDelay: 30000,

  // API
  bybit: {
    key: process.env.BYBIT_API_KEY,
    secret: process.env.BYBIT_SECRET,
    testnet: process.env.BYBIT_TESTNET === "true",
  },

  // Telegram
  telegram: {
    token: process.env.TOKEN,
    chatId: process.env.USER_CHAT_ID,
  },

  // Validation
  validate: (key, value) => {
    if (typeof value !== "number" || value < 0) {
      throw new Error(`Invalid config for ${key}: must be positive number`);
    }
    return value;
  },
};

module.exports = config;
