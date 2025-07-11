const TelegramBot = require("node-telegram-bot-api");
var Table = require("cli-table");
var clc = require("cli-color");

const { pms } = require("@wilcosp/ms-prettify");

const clearConsole = require("console-clear");

const token = ""; //TODO: ADD YOUR BOT TOKEN HERE
const TGbot = new TelegramBot(token, { polling: false });
const fs = require("node:fs");
const USER_CHAT_ID = ""; //TODO: ADD YOUR TG ID HERE

const sendTGMessage = async (message) => {
  return await TGbot.sendMessage(USER_CHAT_ID, message);
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
    min_price: min_price,
    max_price: max_price,
    grid_mode,
    grid_type,
    cell_number,
    leverage: String(leverage),
    trailing_stop_per: "",
  });
  console.log("INFO: RAW validateGrid", raw);

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };
  try {
    const futuresGridRes = await fetch(
      "https://api2.bybit.com/contract/v5/fgridbot/validate-fgrid-input?_sp_category=fbu&_sp_business=usdt&_sp_response_format=portugal",
      requestOptions
    );
    const futuresGrid = await futuresGridRes.json();
    if (futuresGrid.ret_code == 0) {
      return futuresGrid.result;
    }
  } catch (error) {
    sendTGMessage("ERROR: failed to validate grid", error);
    return false;
  }
};

const closeGrid = async (bot_id) => {
  const raw = JSON.stringify({
    bot_id: String(bot_id),
  });
  console.log("INFO: RAW CLOSE", raw);

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };
  try {
    const futuresGridRes = await fetch(
      "https://api2-2.bybit.com/contract/v5/fgridbot/fgrid-bot-close?_sp_category=fbu&_sp_response_format=portugal",
      requestOptions
    );
    const futuresGrid = await futuresGridRes.json();

    console.log("BOT CLOSED", futuresGrid);

    return true;
  } catch (error) {
    sendTGMessage("ERROR: failed to close grid");
    return false;
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
    if (futuresGrid.result.check_code === 400006) {
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

const getListOfGrids = async () => {
  const raw = JSON.stringify({
    page: 0,
    limit: 100,
    status: "2",
    symbol: SYMBOL,
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };
  try {
    const res = await fetch(
      "https://api2-2.bybit.com/s1/bot/fgrid/v1/get-fgrid-list",
      requestOptions
    );
    return await res.json();
  } catch (error) {
    sendTGMessage("ERROR: failed to get list of grids");
    return false;
  }
};

const adjustMargin = async (amount, bot_id) => {
  const raw = JSON.stringify({
    amount: String(amount),
    bot_id: String(bot_id),
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };
  try {
    const res = await fetch(
      "https://api2-2.bybit.com/contract/v5/fgridbot/add-margin?_sp_category=fbu&_sp_response_format=portugal",
      requestOptions
    );
    return await res.json();
  } catch (error) {
    sendTGMessage("ERROR: failed to close grid");
  }
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

const args = getArgs();
console.log(args);
const SYMBOL = args["symbol"] || "DOGEUSDT"; //"BTCUSDT";
const USD_STOP_LIMIT_MIN = args["BSTOP"] ? args["BSTOP"] : 10;

const USD_ALERT_LIMIT_MIN = args["BALERT"] ? args["BALERT"] : 20;

const RUNNING_INTERVAL = args["interval"] ? args["interval"] * 1000 : 1_000;

const RE_INVEST_AMOUNT_USD_LOW = args["RA"] || 0.005;

const RE_INVEST_AMOUNT_USD_HIGH = 0.042;

const RE_INVEST_TRESHOLD_PCT_LOW = -58;

const RE_INVEST_APR_LOW = -7000;

const RE_INVEST_TRESHOLD_PCT_HIGH = 60;

const GROW_PCT = args["GP"] || 0.5;

const GROW_PCT_GRID = args["GG"] || 0;

const TAKE_PROFIT_PCT = args["TP"] || 6.9;

const TAKE_PROFIT_FORCE_PCT = args["TPF"] || 10;

const ARBITRAGE_NUM_MAX = 5000;

const ARBITRAGE_NUM_MIN = 5;

const BOT_CREATION_DELAY = 500;

const BOT_RESTART_DELAY = 30_000;

const CANCELLED_BOTS = new Map();

let CURRENT_TRADING_BALANCE = 0;
let CURRENT_POSITION_SIZE = 0;

let ACCOUNT_SIZE = 0;
const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

const getAssets = async () => {
  const raw = JSON.stringify({
    page: 0,
    limit: 50,
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };

  try {
    const res = await fetch(
      "https://api2.bybit.com/s1/bot/fgrid/v1/get-fgrid-assets-list",
      requestOptions
    );

    return await res.json();
  } catch (error) {
    sendTGMessage("failed to get assets");
  }
};

const getNumberFromPct = (number) => {
  return Number.parseFloat(Number(number * 100).toFixed(2));
};

const PROFIT_BY_GRID = new Map();

let TOTAL_GRID_PROFIT = 0;

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

const toTwoDecimals = (val) => {
  return Number(val).toFixed(2);
};
const toFourDecimals = (val) => {
  return Number(val).toFixed(4);
};

const PRICE_DOWN_GAP = 0.045;
const PRICE_UP_GAP = 0.055;
const MIN_GRIDS_NUMBER = 3;
const MIN_INVESTMENT_SCALE = 1.025;
const MIN_INVESTMENT = 0.69;

const upCurrency = async (symbol, leverage = 20) => {
  console.log("upping symbol");
  const grid_mode = "FUTURE_GRID_MODE_SHORT";
  const grid_type = "FUTURE_GRID_TYPE_GEOMETRIC";
  const currentPrice = currenciesRates[symbol];
  let minPrice = Number(currentPrice * (1 - PRICE_DOWN_GAP)).toFixed(
    currenciesDecimals[symbol]
  );
  let maxPrice = Number(currentPrice * (1 + PRICE_UP_GAP)).toFixed(
    currenciesDecimals[symbol]
  );
  console.log("minxmax", minPrice, maxPrice);
  const initialGrid = await validateGrid(
    symbol,
    minPrice,
    maxPrice,
    grid_mode,
    grid_type,
    MIN_GRIDS_NUMBER,
    20
  );
  //console.log("initial grid = ", initialGrid);
  const maxCellNumber = initialGrid.cell_number.to;
  console.log("max cells  = ", maxCellNumber);
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
    20
  );
  if (!maxCellNumberGrid.investment?.from) {
    console.log("ERROR maxCellNumberGrid", maxCellNumberGrid);
    return;
  }
  const minInvestment = Number(
    maxCellNumberGrid.investment.from * MIN_INVESTMENT_SCALE
  ).toFixed(4);
  console.log("minInvestment = ", minInvestment);
  const USDFuturesTradingBalance = await getUSDFuturesBalance();
  if (minInvestment <= 0) {
    console.log("minInvestment ERROR = ", minInvestment);
  }
  if (minInvestment <= 0.42 && USDFuturesTradingBalance > 0.42) {
    minInvestment = 0.42;
  }
  if (USDFuturesTradingBalance >= minInvestment) {
    console.log(
      `Creating additional bots for ${symbol} up - ${maxCellNumber} grids (${minPrice} - ${maxPrice})`
    );
    createGrid(
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
      `Not enough money for ${symbol} up - ${maxCellNumber} grids (${minPrice} - ${maxPrice}) -- ${USDFuturesTradingBalance} ${USDFuturesTradingBalance}`
    );
  }
};
const downCurrency = async (symbol, leverage = 20) => {
  console.log("downCurrency symbol", symbol);
  const grid_mode = "FUTURE_GRID_MODE_LONG";
  const grid_type = "FUTURE_GRID_TYPE_GEOMETRIC";
  const currentPrice = currenciesRates[symbol];
  let minPrice = Number(currentPrice * (1 - PRICE_DOWN_GAP)).toFixed(
    currenciesDecimals[symbol]
  );
  let maxPrice = Number(currentPrice * (1 + PRICE_UP_GAP)).toFixed(
    currenciesDecimals[symbol]
  );
  const initialGrid = await validateGrid(
    symbol,
    minPrice,
    maxPrice,
    grid_mode,
    grid_type,
    MIN_GRIDS_NUMBER,
    20
  );
  //console.log("initial grid = ", initialGrid);
  const maxCellNumber = initialGrid.cell_number.to;
  console.log("max cells  = ", maxCellNumber);

  const maxCellNumberGrid = await validateGrid(
    symbol,
    minPrice,
    maxPrice,
    grid_mode,
    grid_type,
    maxCellNumber,
    20
  );
  let minInvestment = Number(
    maxCellNumberGrid.investment.from * MIN_INVESTMENT_SCALE
  ).toFixed(4);
  console.log("minInvestment = ", minInvestment);
  const USDFuturesTradingBalance = await getUSDFuturesBalance();
  if (
    Number(minInvestment) <= 4.2 &&
    Number(USDFuturesTradingBalance) > MIN_INVESTMENT
  ) {
    minInvestment = MIN_INVESTMENT;
  }
  if (Number(USDFuturesTradingBalance) >= Number(minInvestment)) {
    console.log(
      `Creating additional bots for ${symbol} down - ${maxCellNumber} grids (${minPrice} - ${maxPrice})`
    );
    createGrid(
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
      `Not enough money for ${symbol} down - ${maxCellNumber} grids (${minPrice} - ${maxPrice}) -- current balance ${USDFuturesTradingBalance} , need $${minInvestment}`
    );
  }
};
const currenciesDecimals = {
  "10000SATSUSDT": 5,
  "1000CATSUSDT": 5,
  "1000PEPEUSDT": 5,
  ANIMEUSDT: 5,
  ARBUSDT: 3,
  DOGEUSDT: 3,
  FARTCOINUSDT: 4,
  HMSTRUSDT: 5,
  HYPEUSDT: 3,
  LTCUSDT: 3,
  MELANIAUSDT: 4,
  RENDERUSDT: 3,
  RVNUSDT: 5,
  SHIB1000USDT: 5,
  STRKUSDT: 4,
  TONUSDT: 3,
  TRUMPUSDT: 3,
  WIFUSDT: 3,
  WLDUSDT: 3,
  XLMUSDT: 3,
  XRPUSDT: 3,
};
//Hardcoded but easily fetched from APIs
const currenciesRates = {
  "1000PEPEUSDT": 0.01246,
  ANIMEUSDT: 0.0188,
  ARBUSDT: 0.428,
  DOGEUSDT: 0.199,
  FARTCOINUSDT: 1.37,
  HMSTRUSDT: 0.00082,
  HYPEUSDT: 45.45,
  LTCUSDT: 96.15,
  MELANIAUSDT: 0.22,
  RENDERUSDT: 3.85,
  RVNUSDT: 0.01494,
  SHIB1000USDT: 0.01351,
  STRKUSDT: 0.15,
  TONUSDT: 2.9882,
  TRUMPUSDT: 10.13,
  WIFUSDT: 1.06,
  WLDUSDT: 1.13,
  XLMUSDT: 0.307,
  XRPUSDT: 2.59,
};
function get_random(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const downBot = async () => {
  const currenciesToDOWN = [
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
    "TRUMPUSDT",
  ];

  downCurrency(get_random(currenciesToDOWN), 20);
};

const runBot = async () => {
  await downBot();
  await sleep(RUNNING_INTERVAL);
};

const main = async () => {
  const balanceString =
    [
      "Date",
      "Time",
      "Trading Balance",
      "Account Balance",
      "Position Size",
      "Account Size",
      "Sales",
      "Sales Profit",
    ].join(",") + "\n";
  fs.writeFile(SYMBOL + "_balance.csv", balanceString, {}, () => {});

  const USDBalance = await getUSDBalance();
  if (!USDBalance) {
    await sendTGMessage("ERROR: Balance is 0; something is wrong?");
    await sleep(BOT_RESTART_DELAY);
    throw new Error("ERROR: Balance is 0, check cookie");
  }

  sendTGMessage(
    `DOWNbot started, Balance: $${USDBalance.balance_in_usd} Profit:$${
      USDBalance.profit_in_usd
    }, Params: ${JSON.stringify(args)}`
  );
  //checkAssets();
  console.log(
    `Starting DOWNbot, Balance: $${USDBalance.balance_in_usd} Profit:$${USDBalance.profit_in_usd}`
  );
  while (true) {
    await runBot();
  }
};

main();
