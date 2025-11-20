require("dotenv").config();
const config = require("./config");
const TelegramBot = require("node-telegram-bot-api");
var Table = require("cli-table");
var clc = require("cli-color");

const { pms } = require("@wilcosp/ms-prettify");

const clearConsole = require("console-clear");

const token = process.env.TOKEN;
const TGbot = new TelegramBot(token, { polling: false });
const fs = require("node:fs");
const USER_CHAT_ID = process.env.USER_CHAT_ID;

const sendTGMessage = async (message) => {
  try {
    return await TGbot.sendMessage(USER_CHAT_ID, message);
  } catch (error) {
    console.log("error in sending message", message);
  }
};

const path = process.cwd();
const BYBIT_COOKIE = fs.readFileSync(`${path}/BYBIT_COOKIE`);

const getHeaders = () => {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  myHeaders.append("accept-language", "en-US,en;q=0.9");
  myHeaders.append("content-type", "application/json");
  myHeaders.append("cookie", BYBIT_COOKIE);
  myHeaders.append("origin", "https://www.bybit.com");
  myHeaders.append("platform", "pc");
  myHeaders.append("priority", "u=1, i");
  myHeaders.append("referer", "https://www.bybit.com/");
  myHeaders.append(
    "sec-ch-ua",
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"'
  );
  myHeaders.append("sec-ch-ua-mobile", "?0");
  myHeaders.append("sec-ch-ua-platform", '"macOS"');
  myHeaders.append("sec-fetch-dest", "empty");
  myHeaders.append("sec-fetch-mode", "cors");
  myHeaders.append("sec-fetch-site", "same-site");
  myHeaders.append(
    "user-agent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_20_7) AppleWebKit/537.42 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );
  return myHeaders;
};

const getArgs = () =>
  process.argv.reduce((args, arg) => {
    // long arg
    if (arg.slice(0, 2) === "--") {
      const longArg = arg.split("=");
      const longArgFlag = longArg[0].slice(2);
      const longArgValue = longArg.length > 1 ? longArg[1] : true;
      args[longArgFlag] = longArgValue;
    }
    // flags
    else if (arg[0] === "-") {
      const flags = arg.slice(1).split("");
      flags.forEach((flag) => {
        args[flag] = true;
      });
    }
    return args;
  }, {});

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const getTicker = async (symbol) => {
  const requestOptions = {
    method: "GET",
    headers: getHeaders(),
  };
  try {
    const priceRes = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
      requestOptions
    );
    const priceData = await priceRes.json();
    const currentPrice =
      priceData.retCode === 0
        ? parseFloat(priceData.result.list[0].lastPrice)
        : 0;
    if (currentPrice <= 0) return { price: 0, decimals: 8 };

    // Fetch instrument info for tickSize to determine decimals
    const instRes = await fetch(
      `https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=${symbol}`,
      requestOptions
    );
    const instData = await instRes.json();
    let decimals = 8;
    if (instData.retCode === 0 && instData.result.list.length > 0) {
      const tickSize = parseFloat(instData.result.list[0].priceFilter.tickSize);
      if (tickSize > 0) {
        decimals = Math.max(0, Math.floor(-Math.log10(tickSize)));
      }
    }
    return { price: currentPrice, decimals };
  } catch (error) {
    console.error("Error fetching ticker for " + symbol + ":", error);
    return { price: 0, decimals: 8 };
  }
};

const getUSDFuturesTradingBalance = async () => {
  const body = JSON.stringify({
    coin: "USDT",
    bot_type: "BOT_TYPE_ENUM_GRID_FUTURES",
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    redirect: "follow",
    body,
  };
  try {
    const res = await fetch(
      "https://api2-2.bybit.com/contract/v5/fgridbot/get-user-balance?_sp_category=fbu&_sp_response_format=portugal",
      requestOptions
    );
    return await res.json();
  } catch (error) {
    sendTGMessage("ERROR: failed to get usd futures trading ");
  }
};

const getUSDFuturesBalance = async () => {
  const usd_assets = await getUSDFuturesTradingBalance();
  if (usd_assets?.ret_code !== 0) {
    console.error("ERROR:", JSON.stringify(usd_assets));
    return;
  }
  if (usd_assets.result?.status_code !== 200) {
    console.error("ERROR:", JSON.stringify(usd_assets));
    return;
  }
  return toFourDecimals(usd_assets.result.balance);
};

const getUSDAssets = async () => {
  const raw = JSON.stringify({
    page: 0,
    limit: 50,
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    redirect: "follow",
  };
  try {
    const res = await fetch(
      "https://api2.bybit.com/bot-api-summary/v5/private/query-asset-summary",
      requestOptions
    );

    return await res.json();
  } catch (error) {
    sendTGMessage("ERROR: failed to get usd assets");
  }
};

const getUSDBalance = async () => {
  const usd_assets = await getUSDAssets();
  if (usd_assets?.ret_code !== 0) {
    console.error("ERROR:", JSON.stringify(usd_assets));
    return;
  }
  if (usd_assets.result?.status_code !== 200) {
    console.error("ERROR:", JSON.stringify(usd_assets));
    return;
  }
  const assets = usd_assets.result.asset_summary;
  return assets;
};

const toFourDecimals = (val) => {
  return Number(val).toFixed(4);
};

const validateGrid = async (
  symbol,
  min_price,
  max_price,
  grid_mode,
  grid_type,
  cell_number,
  leverage
) => {
  const raw = JSON.stringify({
    symbol,
    min_price: String(min_price),
    max_price: String(max_price),
    grid_mode,
    grid_type,
    cell_number,
    leverage: String(leverage),
  });
  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };
  try {
    const res = await fetch(
      "https://api2-2.bybit.com/contract/v5/fgridbot/fgrid-bot-validate?_sp_category=fbu&_sp_response_format=portugal",
      requestOptions
    );
    const data = await res.json();
    if (data.retCode === 0) {
      return data.result;
    } else {
      console.error("Validate error:", data);
      return null;
    }
  } catch (error) {
    console.error("Error validating grid:", error);
    return null;
  }
};

const createGrid = async (
  amount,
  symbol,
  min_price,
  max_price,
  cell_number,
  leverage,
  grid_mode,
  grid_type
) => {
  const raw = JSON.stringify({
    total_investment: String(amount),
    init_bonus: "0",
    source: 2,
    symbol,
    min_price: String(min_price),
    max_price: String(max_price),
    grid_mode,
    grid_type,
    cell_number,
    leverage: String(leverage),
  });
  console.log("creating bot - ", raw);
  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };
  try {
    const futuresGridRes = await fetch(
      "https://api2-2.bybit.com/contract/v5/fgridbot/fgrid-bot-create?_sp_category=fbu&_sp_business=usdt&_sp_response_format=portugal",
      requestOptions
    );
    const futuresGrid = await futuresGridRes.json();
    if (futuresGrid.result?.check_code === 400006) {
      console.error("ERROR: No money in the account");
      sendTGMessage(
        "ERROR: Not enough money in the account to create a bot!!!"
      );
      return false;
    }
    console.log("CREATED?", futuresGrid?.result);
    return true;
  } catch (error) {
    sendTGMessage("ERROR: failed to create grid");
  }
};

const args = getArgs();
console.log(args);

// Override config with CLI args
const effectiveConfig = { ...config };
Object.keys(args).forEach((key) => {
  if (
    key in config.thresholds ||
    key in config.intervals ||
    key in config.reinvest
  ) {
    effectiveConfig.thresholds[key] = args[key];
  }
  if (key === "symbol") effectiveConfig.symbol = args[key];
  if (key === "direction") effectiveConfig.direction = args[key];
  if (key === "interval") effectiveConfig.intervals.default = args[key];
});

const SYMBOL = effectiveConfig.symbol || "DOGEUSDT";
const RUNNING_INTERVAL = (effectiveConfig.intervals.default || 10) * 1000;

const BOT_RESTART_DELAY = effectiveConfig.botRestartDelay;

const PRICE_DOWN_GAP = effectiveConfig.priceGaps.down;
const PRICE_UP_GAP = effectiveConfig.priceGaps.up;
const MIN_GRIDS_NUMBER = effectiveConfig.minGrids;
const MIN_INVESTMENT_SCALE = effectiveConfig.minInvestmentScale;
const MIN_INVESTMENT = effectiveConfig.minInvestment;

// No hardcoded; use dynamic fetching
const currenciesDecimals = {}; // Will be populated dynamically
const currenciesRates = {}; // Will be populated dynamically

function get_random(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const currenciesToTrade = config.symbols;

const createBotForDirection = async (direction, leverage = 20) => {
  const symbol = get_random(currenciesToTrade);
  console.log(`${direction}ing symbol: ${symbol}`);

  const isShort = direction === "up"; // up uses SHORT mode
  const grid_mode = isShort
    ? "FUTURE_GRID_MODE_SHORT"
    : "FUTURE_GRID_MODE_LONG";
  const grid_type = "FUTURE_GRID_TYPE_GEOMETRIC";

  // Dynamic fetch
  let { price: currentPrice, decimals } = await getTicker(symbol);
  if (currentPrice <= 0) {
    console.log(`Invalid price for ${symbol}, skipping`);
    return;
  }
  currenciesRates[symbol] = currentPrice;
  currenciesDecimals[symbol] = decimals;

  let minPrice = Number(currentPrice * (1 - PRICE_DOWN_GAP)).toFixed(decimals);
  let maxPrice = Number(currentPrice * (1 + PRICE_UP_GAP)).toFixed(decimals);
  console.log("min/max", minPrice, maxPrice);

  const initialGrid = await validateGrid(
    symbol,
    minPrice,
    maxPrice,
    grid_mode,
    grid_type,
    MIN_GRIDS_NUMBER,
    leverage
  );
  if (!initialGrid) return;

  const maxCellNumber = initialGrid.cell_number.to;
  console.log("max cells = ", maxCellNumber);
  if (maxCellNumber <= 0) {
    console.log("cell calculation error", initialGrid);
    return;
  }

  const maxCellNumberGrid = await validateGrid(
    symbol,
    minPrice,
    maxPrice,
    grid_mode,
    grid_type,
    maxCellNumber,
    leverage
  );
  if (!maxCellNumberGrid.investment?.from) {
    console.log("ERROR maxCellNumberGrid", maxCellNumberGrid);
    return;
  }

  let minInvestment = Number(
    maxCellNumberGrid.investment.from * MIN_INVESTMENT_SCALE
  ).toFixed(4);
  console.log("minInvestment = ", minInvestment);

  const USDFuturesTradingBalance = await getUSDFuturesBalance();
  if (
    Number(minInvestment) <= MIN_INVESTMENT &&
    Number(USDFuturesTradingBalance) > MIN_INVESTMENT
  ) {
    minInvestment = MIN_INVESTMENT;
  }
  if (minInvestment <= 0) {
    console.log("minInvestment ERROR = ", minInvestment);
    return;
  }

  if (Number(USDFuturesTradingBalance) > Number(minInvestment)) {
    console.log(
      `Creating additional bots for ${symbol} ${direction} - ${maxCellNumber} grids (${minPrice} - ${maxPrice})`
    );
    await createGrid(
      minInvestment,
      symbol,
      minPrice,
      maxPrice,
      maxCellNumber,
      leverage,
      grid_mode,
      grid_type
    );
  } else {
    console.log(
      `Not enough money for ${symbol} ${direction} - ${maxCellNumber} grids (${minPrice} - ${maxPrice}) -- $${USDFuturesTradingBalance}, need $${minInvestment}`
    );
  }
};

const runBot = async () => {
  const direction = effectiveConfig.direction || "up";
  await createBotForDirection(direction);
  await sleep(RUNNING_INTERVAL);
};

const main = async () => {
  const USDBalance = await getUSDBalance();
  if (!USDBalance) {
    await sendTGMessage("ERROR: Balance is 0; something is wrong?");
    await sleep(BOT_RESTART_DELAY);
    throw new Error("ERROR: Balance is 0, check cookie");
  }

  const direction = effectiveConfig.direction || "up";
  await sendTGMessage(
    `${direction.toUpperCase()}bot started, Balance: $${
      USDBalance.balance_in_usd
    } Profit:$${USDBalance.profit_in_usd}, Params: ${JSON.stringify(args)}`
  );
  console.log(
    `Starting ${direction}bot, Balance: $${USDBalance.balance_in_usd} Profit:$${USDBalance.profit_in_usd}`
  );
  while (true) {
    await runBot();
  }
};

main();
