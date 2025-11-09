const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.TOKEN;
const TGbot = new TelegramBot(token, { polling: false });
const USER_CHAT_ID = process.env.USER_CHAT_ID;

const sendTGMessage = async (message) => {
  try {
    return await TGbot.sendMessage(USER_CHAT_ID, message);
  } catch (error) {
    console.log("error in sending message", message, error);
  }
};

const getBYBIT_COOKIE = () => {
  return fs.readFileSync(path.join(process.cwd(), "BYBIT_COOKIE"), "utf8");
};

const getHeaders = () => {
  const BYBIT_COOKIE = getBYBIT_COOKIE();
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

const bybitPost = async (endpoint, payload) => {
  const raw = JSON.stringify(payload);
  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };
  try {
    const res = await fetch(endpoint, requestOptions);
    return await res.json();
  } catch (error) {
    console.error(`Error in bybitPost to ${endpoint}:`, error);
    return null;
  }
};

const fetchWithRetry = async (url, options, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) {
        return await res.json();
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      if (i === retries - 1) {
        console.error(`Fetch failed after ${retries} retries:`, err);
        throw err;
      }
      console.log(`Retry ${i + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
    }
  }
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
    console.log("validating grid", futuresGrid);
    if (futuresGrid.ret_code == 0) {
      return futuresGrid.result;
    }
  } catch (error) {
    await sendTGMessage("ERROR: failed to validate grid", error);
    return false;
  }
};

const closeGrid = async (bot_id) => {
  const payload = { bot_id: String(bot_id) };
  console.log("INFO: RAW CLOSE", JSON.stringify(payload));

  const data = await bybitPost(
    "https://api2-2.bybit.com/contract/v5/fgridbot/fgrid-bot-close?_sp_category=fbu&_sp_response_format=portugal",
    payload
  );

  console.log("BOT CLOSED", data);

  if (data && data.ret_code === 0) {
    return true;
  } else {
    await sendTGMessage("ERROR: failed to close grid");
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
  const payload = {
    total_investment: String(Number(amount).toFixed(4)),
    init_bonus: "0",
    source: 2,
    symbol,
    min_price: String(min_price),
    max_price: String(max_price),
    grid_mode,
    grid_type,
    cell_number,
    leverage: String(leverage),
  };
  console.log("creating bot - ", JSON.stringify(payload));
  const data = await bybitPost(
    "https://api2-2.bybit.com/contract/v5/fgridbot/fgrid-bot-create?_sp_category=fbu&_sp_business=usdt&_sp_response_format=portugal",
    payload
  );
  if (data?.result?.check_code === 400006) {
    console.error("ERROR: No money in the account");
    await sendTGMessage(
      "ERROR: Not enough money in the account to create a bot!!!"
    );
    return false;
  } else if (data?.result?.bot_id == "0") {
    console.log("result= ", data);
    await sendTGMessage("ERROR: Failed to create a bot!!!");
    return false;
  }
  console.log("CREATED?", data?.result);
  if (!data) {
    return;
  }
  return true;
};

const getListOfGrids = async (symbol) => {
  const payload = {
    page: 0,
    limit: 100,
    status: "2",
    symbol: symbol,
  };
  const data = await bybitPost(
    "https://api2-2.bybit.com/s1/bot/fgrid/v1/get-fgrid-list",
    payload
  );
  if (!data) {
    await sendTGMessage("ERROR: failed to get list of grids");
    return false;
  }
  return data;
};

const adjustMargin = async (amount, bot_id) => {
  const payload = {
    amount: String(amount),
    bot_id: String(bot_id),
  };
  const data = await bybitPost(
    "https://api2-2.bybit.com/contract/v5/fgridbot/add-margin?_sp_category=fbu&_sp_response_format=portugal",
    payload
  );
  if (!data) {
    await sendTGMessage("ERROR: failed to adjust margin");
  }
  return data;
};

const getUSDFuturesTradingBalance = async () => {
  const payload = {
    coin: "USDT",
    bot_type: "BOT_TYPE_ENUM_GRID_FUTURES",
  };
  const data = await bybitPost(
    "https://api2-2.bybit.com/contract/v5/fgridbot/get-user-balance?_sp_category=fbu&_sp_response_format=portugal",
    payload
  );
  if (!data) {
    await sendTGMessage("ERROR: failed to get usd futures trading balance");
  }
  return data;
};

const getUSDAssets = async () => {
  const payload = {
    page: 0,
    limit: 50,
  };
  const data = await bybitPost(
    "https://api2.bybit.com/bot-api-summary/v5/private/query-asset-summary",
    payload
  );
  if (!data) {
    await sendTGMessage("ERROR: failed to get usd assets");
  }
  return data;
};

const getAssets = async () => {
  const payload = {
    page: 0,
    limit: 50,
  };
  const data = await bybitPost(
    "https://api2.bybit.com/s1/bot/fgrid/v1/get-fgrid-assets-list",
    payload
  );
  if (!data) {
    await sendTGMessage("failed to get assets");
  }
  return data;
};

const getWithdrawDetail = async (bot_id) => {
  const payload = {
    bot_type: "GRID_FUTURES",
    bot_id: String(bot_id),
    withdraw_amount: "",
  };

  const data = await bybitPost(
    "https://www.bybit.com/x-api/s1/bot/grid/v1/get-withdraw-detail",
    payload
  );

  if (data && data.ret_code === 0 && data.result?.status_code === 200) {
    return data.result;
  } else {
    console.error("Error getting withdraw detail:", data);
    return null;
  }
};

const withdrawProfit = async (bot_id, amount) => {
  const payload = {
    bot_id: String(bot_id),
    withdraw_amount: String(Number(amount).toFixed(4)),
  };

  const data = await bybitPost(
    "https://www.bybit.com/x-api/contract/v5/fgridbot/withdraw-profit",
    payload
  );

  console.log("Withdraw result:", data);
  if (data && data.ret_code === 0 && data.result?.status_code === 200) {
    await sendTGMessage(
      `Successfully withdrew $${Number(amount).toFixed(
        4
      )} from bot ${bot_id} to futures balance`
    );
    return true;
  } else {
    console.error("Error withdrawing:", data);
    await sendTGMessage(
      `ERROR: failed to withdraw $${Number(amount).toFixed(
        4
      )} from bot ${bot_id}: ${data?.ret_msg || "Unknown error"}`
    );
    return false;
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

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

const getNumberFromPct = (number) => {
  return Number.parseFloat(Number(number * 100).toFixed(2));
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

const createMinimalBot = async (
  symbol,
  grid_mode,
  gap = 0.01,
  min_cells = 3,
  leverage = 20
) => {
  const grid_type = "FUTURE_GRID_TYPE_GEOMETRIC";

  // Get current price and decimals
  const { price: currentPrice, decimals } = await getTicker(symbol);
  if (currentPrice <= 0) {
    console.log(`Invalid price for ${symbol}, skipping minimal bot`);
    return false;
  }

  const minPrice = Number(currentPrice * (1 - gap)).toFixed(decimals);
  const maxPrice = Number(currentPrice * (1 + gap)).toFixed(decimals);
  console.log(`Minimal bot for ${symbol}: range ${minPrice}-${maxPrice}`);

  // Validate with min cells
  const initialGrid = await validateGrid(
    symbol,
    minPrice,
    maxPrice,
    grid_mode,
    grid_type,
    min_cells,
    leverage
  );
  if (!initialGrid) {
    console.log("Validation failed for minimal bot");
    return false;
  }

  let maxCellNumber = initialGrid.cell_number.to;
  if (maxCellNumber < min_cells) {
    console.log(
      `Insufficient cells for minimal bot (maxCellNumber = ${maxCellNumber})`
    );
    return false;
  }

  // Validate investment for max cells
  let maxCellNumberGrid = await validateGrid(
    symbol,
    minPrice,
    maxPrice,
    grid_mode,
    grid_type,
    maxCellNumber,
    leverage
  );
  if (!maxCellNumberGrid.investment?.from) {
    console.log("ERROR: Could not determine investment for minimal bot");
    return false;
  }
  if (maxCellNumber != maxCellNumberGrid.cell_number.to) {
    console.log(
      `Max grids been adjusted from ${maxCellNumber} to ${maxCellNumberGrid.cell_number.to}`
    );
    maxCellNumber = maxCellNumberGrid.cell_number.to;
    maxCellNumberGrid = await validateGrid(
      symbol,
      minPrice,
      maxPrice,
      grid_mode,
      grid_type,
      maxCellNumber,
      leverage
    );
  }

  let minInvestment = Number(maxCellNumberGrid.investment.from * 1.1).toFixed(
    4
  ); // Scale down for minimal
  const USDFuturesTradingBalance = await getUSDFuturesBalance();
  if (
    Number(minInvestment) < 0.005 &&
    Number(USDFuturesTradingBalance) > 0.005
  ) {
    minInvestment = 0.005; // Minimum sensible amount
  }
  if (
    minInvestment <= 0 ||
    Number(USDFuturesTradingBalance) < Number(minInvestment)
  ) {
    console.log(
      `Insufficient funds for minimal bot: need $${minInvestment}, have $${USDFuturesTradingBalance}`
    );
    return false;
  }

  const created = await createGrid(
    minInvestment,
    symbol,
    minPrice,
    maxPrice,
    maxCellNumber,
    leverage,
    grid_mode,
    grid_type
  );
  if (created) {
    console.log(`Minimal bot created for ${symbol} with $${minInvestment}`);
  } else {
    //console.log("FAILED TO CREATE");
  }
  return created;
};

const getGridDetails = async (bot_id) => {
  const raw = JSON.stringify({
    bot_id,
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };

  try {
    const res = await fetch(
      "https://api2.bybit.com/s1/bot/fgrid/v1/get-fgrid-detail",
      requestOptions
    );

    return (await res.json()).result.detail;
  } catch (error) {
    sendTGMessage(`failed to get grid ${bot_id} details`);
  }
};

const getGridOpenOrders = async (bot_id) => {
  const raw = JSON.stringify({
    bot_id,
    limit: 200,
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };

  try {
    const res = await fetch(
      "https://api2.bybit.com/s1/bot/fgrid/v1/get-fgrid-open-orders",
      requestOptions
    );

    return (await res.json()).result;
  } catch (error) {
    sendTGMessage(`failed to get grid ${bot_id} details`);
  }
};

module.exports = {
  sendTGMessage,
  getHeaders,
  fetchWithRetry,
  validateGrid,
  closeGrid,
  createGrid,
  getListOfGrids,
  adjustMargin,
  getUSDFuturesTradingBalance,
  getUSDAssets,
  getAssets,
  getUSDFuturesBalance,
  getUSDBalance,
  toTwoDecimals,
  toFourDecimals,
  sleep,
  getArgs,
  getNumberFromPct,
  getTicker,
  createMinimalBot,
  bybitPost,
  getWithdrawDetail,
  withdrawProfit,
  getGridDetails,
  getGridOpenOrders,
};
