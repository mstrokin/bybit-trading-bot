require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
var Table = require("cli-table");
var clc = require("cli-color");

const { pms } = require("@wilcosp/ms-prettify");

const clearConsole = require("console-clear");

const {
  createMinimalBot,
  getWithdrawDetail,
  withdrawProfit,
} = require("./lib/bybit-utils");

const token = process.env.TOKEN;
const TGbot = new TelegramBot(token, { polling: false });
const fs = require("node:fs");
const USER_CHAT_ID = process.env.USER_CHAT_ID;

let rateLimitedUntil = 0;
let messageQueue = [];

const sendTGMessageInternal = async (message) => {
  try {
    return await TGbot.sendMessage(USER_CHAT_ID, message);
  } catch (error) {
    throw error; // Re-throw for handling in sendTGMessage
  }
};

const processQueue = async () => {
  while (messageQueue.length > 0 && Date.now() >= rateLimitedUntil) {
    const msg = messageQueue.shift();
    try {
      await sendTGMessageInternal(msg);
    } catch (error) {
      if (error.response && error.response.statusCode === 429) {
        const retryAfter =
          parseInt(error.response.body.parameters?.retry_after) || 1;
        rateLimitedUntil = Date.now() + retryAfter * 1000;
        messageQueue.unshift(msg); // Put back to front
        setTimeout(processQueue, retryAfter * 1000);
        return;
      } else {
        console.log("error in sending queued message", msg, error);
      }
    }
  }
};

const sendTGMessage = async (message) => {
  const logEntry = `${new Date().toISOString()} - ${message}\n`;
  fs.appendFileSync(`${process.cwd()}/tg_messages.log`, logEntry);

  if (Date.now() < rateLimitedUntil) {
    console.log(
      `Rate limited, queuing message: ${message.substring(0, 50)}...`
    );
    messageQueue.push(message);
    return;
  }

  try {
    await sendTGMessageInternal(message);
  } catch (error) {
    if (error.response && error.response.statusCode === 429) {
      // Rate limit error
      const retryAfter =
        parseInt(error.response.body.parameters?.retry_after) || 1;
      rateLimitedUntil = Date.now() + retryAfter * 1000;
      console.log(
        `Rate limited. Deferring messages until ${new Date(
          rateLimitedUntil
        ).toISOString()}`
      );
      messageQueue.push(message);
      setTimeout(processQueue, retryAfter * 1000);
    } else {
      // Non-rate limit error, log and don't queue
      console.log("Non-rate limit error, message not queued");
    }
  }
};

const getCurrentPrice = async (symbol) => {
  const requestOptions = {
    method: "GET",
    headers: getHeaders(),
  };
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
      requestOptions
    );
    const data = await res.json();
    if (data.retCode === 0) {
      return parseFloat(data.result.list[0].lastPrice);
    }
  } catch (error) {
    console.error("Error fetching price for " + symbol + ":", error);
  }
  return null;
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
    } else if (futuresGrid.result?.bot_id == "0") {
      console.log("result= ", futuresGrid);
      sendTGMessage("ERROR: Failed to create a bot!!!");
      return false;
    }
    console.log("CREATED?", futuresGrid?.result);
    if (!futuresGrid) {
      return;
    }
    return true;
  } catch (error) {
    sendTGMessage("ERROR: failed to create grid:" + error.toString());
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

const RUNNING_INTERVAL = args["interval"] ? args["interval"] * 1000 : 10_000;

const RE_INVEST_AMOUNT_USD_LOW = args["RA"] || 0.005;

const SACRIFICE_PNL_THRESHOLD = -77.77;
const NEAR_PROFIT_THRESHOLD = -5;

const SACRIFICE_FILE = `${process.cwd()}/sacrifice_required.json`;
const SACRIFICE_PERCENT = 0.5;

const RE_INVEST_AMOUNT_USD_HIGH = 0.042;

const RE_INVEST_TRESHOLD_PCT_LOW = -42;

const RE_INVEST_APR_LOW = -7000;

const RE_INVEST_TRESHOLD_PCT_HIGH = 60;

const GROW_PCT = args["GP"] || 0.5;

const GROW_PCT_GRID = args["GG"] || 0;

const TAKE_PROFIT_PCT = args["TP"] || 6.9;

const TAKE_PROFIT_FORCE_PCT = args["TPF"] || 10;

const REINVEST_DUST_COLLECTION_ENABLED = true;

const DUST_LIMIT = 0.02;

const INSUFFICIENT_FUNDS_LIMIT = -1.5;

const ARBITRAGE_NUM_MAX = 5000;

const ARBITRAGE_NUM_MIN = 5;

const BOT_CREATION_DELAY = 35_000;

const BOT_RESTART_DELAY = 65_000;

const CANCELLED_BOTS = new Map();

const MAX_RETRIES = 3;

const LOW_PNL_THRESHOLD = -24;

const RESCUE_PNL_THRESHOLD = -60;

const WITHDRAW_THRESHOLD = 1.0;

const RESCUE_GAP = 0.015; // 1%

let lastLowPnlAlert = 0;

let lastRescueTime = 0;

let CURRENT_TRADING_BALANCE = 0;
let CURRENT_POSITION_SIZE = 0;
let CURRENT_PROFIT = 0;

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

const checkIfShouldReinvest = async (grid) => {
  if (Number(RE_INVEST_AMOUNT_USD_LOW) <= 0) return;
  const gridProfitPercent = getNumberFromPct(grid.pnl_per);
  const botId = grid.bot_id;
  if (Number(CURRENT_TRADING_BALANCE) < RE_INVEST_AMOUNT_USD_LOW) {
    //console.log("Not enough money for reinvesting!");
    return;
  }
  /*if (APR < RE_INVEST_APR_LOW) {
    console.log(
      `Reinvesting $${RE_INVEST_AMOUNT_USD_LOW} into ${botId} because too low percent: ${gridProfitPercent}% (Lower than ${RE_INVEST_TRESHOLD_PCT_LOW}%)`
    );
    await adjustMargin(RE_INVEST_AMOUNT_USD_LOW, botId);
  }*/
  if (gridProfitPercent < RE_INVEST_TRESHOLD_PCT_LOW) {
    const missing_percent = RE_INVEST_TRESHOLD_PCT_LOW - gridProfitPercent;
    let factor;
    if (missing_percent <= 5) {
      factor = 1;
    } else if (missing_percent <= 10) {
      factor = 2 * missing_percent;
    } else if (missing_percent <= 15) {
      factor = 3 * missing_percent;
    } else if (missing_percent <= 20) {
      factor = 4 * missing_percent;
    } else {
      factor = 5 * missing_percent;
    }
    factor = Math.ceil(factor);
    let reinvest_amount = RE_INVEST_AMOUNT_USD_LOW * factor;
    if (Number(CURRENT_TRADING_BALANCE) < reinvest_amount) {
      console.log(
        `Not enough money for reinvesting $${reinvest_amount} into ${botId}, reinvesting full ${CURRENT_TRADING_BALANCE}!`
      );
      reinvest_amount = CURRENT_TRADING_BALANCE;
    }
    if (!reinvest_amount) return;
    const reinvestMsg = `🔄 *Reinvesting into ${grid.grid_mode.replace(
      "FUTURE_GRID_MODE_",
      ""
    )} bot ${botId} for ${SYMBOL}*\n\n📉 Current PnL: *${gridProfitPercent.toFixed(
      2
    )}%*\n🎯 Low Threshold: *${RE_INVEST_TRESHOLD_PCT_LOW}%*\n📊 Deficit: *${missing_percent.toFixed(
      2
    )}%*\n⚡ Scaling Factor: *${factor}x*\n💰 Amount: *$${reinvest_amount.toFixed(
      4
    )}*\n💳 Available: *$${Number(CURRENT_TRADING_BALANCE).toFixed(
      4
    )}*\n💸 Remaining: *$${(
      Number(CURRENT_TRADING_BALANCE) - reinvest_amount
    ).toFixed(4)}*`;
    console.log(reinvestMsg);
    sendTGMessage(reinvestMsg);
    await adjustMargin(reinvest_amount, botId);
  } else if (gridProfitPercent > RE_INVEST_TRESHOLD_PCT_HIGH) {
    if (Number(CURRENT_TRADING_BALANCE) < RE_INVEST_AMOUNT_USD_HIGH) {
      console.log(
        `Not enough money for reinvesting $${RE_INVEST_AMOUNT_USD_HIGH} into ${botId}!`
      );
      return;
    }
    console.log(
      `Reinvesting $${RE_INVEST_AMOUNT_USD_HIGH} into ${botId} because too high ${gridProfitPercent}% (Higher than ${RE_INVEST_TRESHOLD_PCT_HIGH}%)`
    );
    await adjustMargin(RE_INVEST_AMOUNT_USD_HIGH, botId);
  } else {
    //console.log("Doing nothing");
  }
  return;
};

const createSacrificeFile = (targetBotId) => {
  const data = { target_bot_id: targetBotId, timestamp: Date.now() };
  fs.writeFileSync(SACRIFICE_FILE, JSON.stringify(data));
  console.log(`Created sacrifice file for target bot ${targetBotId}`);
};

const readSacrificeFile = () => {
  if (!fs.existsSync(SACRIFICE_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(SACRIFICE_FILE, "utf8"));
    if (Date.now() - data.timestamp > 600000) {
      // 10 min expiry
      fs.unlinkSync(SACRIFICE_FILE);
      return null;
    }
    return data.target_bot_id;
  } catch (error) {
    console.error("Error reading sacrifice file:", error);
    return null;
  }
};

const deleteSacrificeFile = () => {
  if (fs.existsSync(SACRIFICE_FILE)) {
    fs.unlinkSync(SACRIFICE_FILE);
    console.log("Deleted sacrifice file");
  }
};

const performSacrifice = async (sacrificeGrid, targetBotId) => {
  const sacrificeAmount =
    Number(sacrificeGrid.total_investment) * SACRIFICE_PERCENT;
  const closed = await closeGrid(sacrificeGrid.bot_id);
  if (closed) {
    CANCELLED_BOTS.set(sacrificeGrid.bot_id, +new Date());
    console.log(
      `Sacrificed best bot ${
        sacrificeGrid.bot_id
      }, reinvesting $${sacrificeAmount.toFixed(
        4
      )} into worst bot ${targetBotId}`
    );
    const sacrificeMsg = `⚡ *Sacrifice performed*\nSacrificed best bot ${
      sacrificeGrid.bot_id
    } (PnL: ${getNumberFromPct(sacrificeGrid.pnl_per).toFixed(
      2
    )}%)\nReinvesting *$${sacrificeAmount.toFixed(
      4
    )}* (50%) into worst bot ${targetBotId}\nSacrificing the strong to save the weak! 💪`;
    sendTGMessage(sacrificeMsg);
    await adjustMargin(sacrificeAmount, targetBotId);
    // Don't recreate the sacrificed best bot to free up resources
    deleteSacrificeFile();
    return true;
  }
  return false;
};
const recreateGrid = async (grid) => {
  const new_min_price = Number(
    Number(grid.min_price) - Number(grid.min_price) * (GROW_PCT_GRID / 100)
  ).toFixed(4);
  const new_max_price = Number(
    Number(grid.max_price) + Number(grid.max_price) * (GROW_PCT_GRID / 100)
  ).toFixed(4);
  const initial_investment = Number(grid.initial_investment);
  const investment_increase = Number(
    Number(initial_investment) * (GROW_PCT / 100)
  ).toFixed(4);
  let new_investment = Number(
    initial_investment + Number(investment_increase)
  ).toFixed(4);
  let msg = `Recreating ${SYMBOL} grid ${grid.grid_mode} for range ${new_min_price}-${new_max_price} (was ${grid.min_price}-${grid.max_price}) for $${new_investment} (was $${initial_investment}, +$${investment_increase}) with x${grid.leverage} leverage (${grid.cell_number} grids)`;

  const USDFuturesTradingBalance = await getUSDFuturesBalance();
  // full reinvest <3
  if (
    REINVEST_DUST_COLLECTION_ENABLED &&
    USDFuturesTradingBalance - new_investment < DUST_LIMIT
  ) {
    const dust = Number(
      USDFuturesTradingBalance - new_investment - 0.01
    ).toFixed(4);
    if (dust > 0) {
      new_investment = (Number(new_investment) + Number(dust)).toFixed(4);
      msg += ` , also adding dust (+$${dust}) = $${new_investment}`;
    }
  }
  if (USDFuturesTradingBalance < new_investment) {
    return false;
  }
  console.log(msg);
  sendTGMessage(msg);
  return await createGrid(
    new_investment,
    grid.symbol,
    new_min_price,
    new_max_price,
    grid.cell_number,
    grid.leverage,
    grid.grid_mode,
    grid.grid_type
  );
};

const closeAndRecreate = async (grid) => {
  const closed = await closeGrid(grid.bot_id);
  if (closed) {
    CANCELLED_BOTS.set(grid.bot_id, +new Date());
    console.log(`Bot closed! Recreating after ${BOT_CREATION_DELAY}ms!`);

    // Check total bots after closing
    const assetsResult = await getAssets();
    let currentTotal = 0;
    if (
      assetsResult?.ret_code === 0 &&
      assetsResult.result?.status_code === 200
    ) {
      currentTotal = assetsResult.result.assets.length;
    }
    if (Number(grid.total_investment) < 0.5) {
      console.log(
        `Skipping recreation for dust bot ${grid.bot_id} (investment: $${Number(
          grid.total_investment
        ).toFixed(4)})`
      );
      sendTGMessage(
        `Skipped recreation of dust bot ${grid.bot_id} (investment: $${Number(
          grid.total_investment
        ).toFixed(4)})`
      );
      return;
    }

    if (currentTotal > 40 && grid.total_investment < 1) {
      console.log(
        `Total bots after close >40 (${currentTotal}), skipping recreation for ${grid.bot_id}`
      );
      sendTGMessage(
        `Skipped recreation of ${grid.bot_id} due to high bot count (>40) and small investment`
      );
      return;
    }

    let tries = 0;
    while (true) {
      tries++;
      await sleep(BOT_CREATION_DELAY);
      let recreated;
      try {
        recreated = await recreateGrid(grid);
      } catch (error) {}
      if (recreated || tries > MAX_RETRIES) {
        if (tries > MAX_RETRIES) {
          sendTGMessage(`Failed to create a bot! ${JSON.stringify(grid)}`);
        }
        return;
      }
    }
  }
};
const PROFIT_BY_GRID = new Map();
const LP_BY_GRID = new Map();
const SALES_BY_GRID = new Map();
const PNL_BY_GRID = new Map();

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

let TOTAL_GRID_PROFIT = 0;
const checkIfShouldClose = async (grid) => {
  const gridProfitPercent = getNumberFromPct(grid.pnl_per);
  const APR = (Number(grid.total_profit_apr) * 100).toFixed(2);
  let greenSales = false;
  let LPFn = (txt) => {
    return txt;
  };
  let PNLFn = (txt) => {
    return txt;
  };
  const prevPnl = PNL_BY_GRID.get(grid.bot_id) || 0;
  const prevSales = SALES_BY_GRID.get(grid.bot_id) || 0;
  const prevLp = LP_BY_GRID.get(grid.bot_id) || 0;
  if (grid.arbitrage_num > prevSales) {
    greenSales = true;
    getGridDetails(grid.bot_id).then((gridDetails) => {
      PROFIT_BY_GRID.set(
        grid.bot_id,
        Number.parseFloat(gridDetails.grid_profit).toFixed(2)
      );
    });
    SALES_BY_GRID.set(grid.bot_id, grid.arbitrage_num);
  }
  if (grid.liquidation_price > prevLp) {
    LPFn = clc.green;
  } else if (grid.liquidation_price < prevLp) {
    LPFn = clc.red;
  }
  LP_BY_GRID.set(grid.bot_id, grid.liquidation_price);

  const GRID_PROFIT = PROFIT_BY_GRID.get(grid.bot_id) || "0.00";
  let pnlDiff = "";
  if (gridProfitPercent > prevPnl) {
    PNLFn = clc.green;
    pnlDiff = " (+" + Number(gridProfitPercent - prevPnl).toFixed(2) + "%)";
  } else if (gridProfitPercent < prevPnl) {
    PNLFn = clc.red;
    pnlDiff = " (" + Number(gridProfitPercent - prevPnl).toFixed(2) + "%)";
  }
  const gridModeText = `${grid.leverage}x $${
    grid.total_investment
  } ${grid.grid_mode.replace(/FUTURE_GRID_MODE_/, "")} ${grid.min_price}-${
    grid.max_price
  } @ ${grid.entry_price} (LP: ${LPFn(grid.liquidation_price)})`;
  const salesTxt = `${grid.arbitrage_num} (+$${GRID_PROFIT})`;
  const ageMs =
    Math.ceil(new Date().getTime() / 1000) - Number.parseInt(grid.create_time);
  const age = pms(ageMs * 1000, {
    max: 3,
    expanded: false,
    till: "second",
  });
  //var date = new Date(unix_timestamp * 1000);
  const salesText = `trades done: ${
    !greenSales ? salesTxt : clc.green(salesTxt)
  }, age: ${age}, APR: ${PNLFn(APR + "%")}`;
  const pnlText = `current PnL ${PNLFn(gridProfitPercent + "%" + pnlDiff)}`;
  PNL_BY_GRID.set(grid.bot_id, gridProfitPercent);

  if (Number(grid.arbitrage_num) > ARBITRAGE_NUM_MAX) {
    console.log(
      `${gridModeText} Not touching OG bot ${grid.bot_id}, ${pnlText}, ${salesText}`
    );
    return;
  }
  if (gridProfitPercent <= 0) {
    console.log(
      `${gridModeText} ${pnlText}, waiting for ${TAKE_PROFIT_PCT}%, ${salesText}`
    );
    return;
  }
  if (gridProfitPercent > 0 && gridProfitPercent < TAKE_PROFIT_PCT) {
    console.log(
      `${gridModeText} ${pnlText}, waiting for ${TAKE_PROFIT_PCT}%, ${salesText}`
    );
    return;
  }
  if (
    Number(grid.arbitrage_num) < ARBITRAGE_NUM_MIN &&
    gridProfitPercent < TAKE_PROFIT_FORCE_PCT
  ) {
    console.log(
      `${gridModeText} ${pnlText}, ${salesText}, waiting for ${ARBITRAGE_NUM_MIN},`
    );
    return;
  }
  if (CANCELLED_BOTS.get(grid.bot_id)) {
    console.log(`Grid ${grid.bot_id} was already cancelled`);
    return;
  }
  console.log(
    `WARNING: Taking ${SYMBOL} profit for ${grid.grid_mode} bot ${grid.bot_id} (${grid.min_price} - ${grid.max_price})! ${salesText}, profit: $${grid.total_profit}, APR: ${APR}`
  );
  //let msg = `Taking ${SYMBOL} profit - ${grid.grid_mode} (${grid.min_price} - ${grid.max_price}), sales made: ${grid.arbitrage_num}, profit: $${grid.total_profit}, APR: ${APR}!`;
  let msg = `Taking ${SYMBOL} profit: $${
    grid.total_profit
  }, APR: ${APR}%, Current balance: $${Number(CURRENT_TRADING_BALANCE).toFixed(
    2
  )} USDT`;
  sendTGMessage(msg);
  closeAndRecreate(grid);
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
const checkAssets = async (sales = 0, green, position_size = null) => {
  const USDBalance = await getUSDBalance();
  CURRENT_PROFIT = USDBalance.profit_in_usd;
  if (!USDBalance) {
    await sendTGMessage("ERROR: Balance is 0; something is wrong?");
    throw new Error("ERROR: Balance is 0, check cookie");
  }
  let posSizeFn = (txt) => {
    return txt;
  };
  let newPositionSize =
    position_size !== null ? position_size : await getPositionSize();
  if (newPositionSize > CURRENT_POSITION_SIZE) {
    posSizeFn = clc.green;
  } else if (newPositionSize < CURRENT_POSITION_SIZE) {
    posSizeFn = clc.red;
  }
  CURRENT_POSITION_SIZE = newPositionSize;
  const USDFuturesTradingBalance = await getUSDFuturesBalance();
  clearConsole();
  ACCOUNT_SIZE = toTwoDecimals(
    Number(USDBalance.balance_in_usd) +
      Math.abs(Number(USDBalance.profit_in_usd))
  );
  CURRENT_TRADING_BALANCE = Number(USDFuturesTradingBalance);
  //console.log("updated trading balance", USDFuturesTradingBalance);
  var table = new Table({
    head: [
      "Time",
      "Trading balance",
      "Account balance",
      "Profit",
      "Position size",
      "Account size",
      "Sales",
      "Total Bot Profit",
    ],
    style: {
      head: ["white"],
    },
    //colWidths: [100, 100, 100, 100],
  });
  table.push([
    new Date().toLocaleString(),
    toTwoDecimals(USDFuturesTradingBalance) + " USDT",
    toTwoDecimals(USDBalance.balance_in_usd) + " USDT",
    toTwoDecimals(USDBalance.profit_in_usd) + " USDT",
    posSizeFn(toFourDecimals(CURRENT_POSITION_SIZE) + " " + SYMBOL),
    ACCOUNT_SIZE,
    !green ? sales || 0 : clc.green(sales),
    TOTAL_GRID_PROFIT,
  ]);
  console.log(table.toString());
  if (Number.parseFloat(TOTAL_GRID_PROFIT) > 0) {
    const balanceString =
      [
        new Date().toLocaleString(),
        toTwoDecimals(USDFuturesTradingBalance),
        toTwoDecimals(USDBalance.balance_in_usd),
        toFourDecimals(CURRENT_POSITION_SIZE),
        ACCOUNT_SIZE,
        sales,
        TOTAL_GRID_PROFIT,
      ].join(",") + "\n";
    fs.writeFile(
      SYMBOL + "_balance.csv",
      balanceString,
      { flag: "a+" },
      () => {}
    );
  }
  if (Number(ACCOUNT_SIZE) > 0 && Number(ACCOUNT_SIZE) < USD_ALERT_LIMIT_MIN) {
    sendTGMessage(
      `WARNING: Balance is lower than $${USD_ALERT_LIMIT_MIN}: $${USDBalance.balance_in_usd}`
    );
  }
  if (Number(ACCOUNT_SIZE) > 0 && Number(ACCOUNT_SIZE) < USD_STOP_LIMIT_MIN) {
    await sendTGMessage(
      `ERROR: Balance is lower than $${USD_STOP_LIMIT_MIN}: $${USDBalance.balance_in_usd}, something is wrong?`
    );
    //FIXME: Kill all bots?
    //throw new Error("ERROR: balance too low");
  }
};

const sortGrids = (gridA, gridB) => {
  const gridProfitPercentA = getNumberFromPct(gridA.liquidation_price);
  const gridProfitPercentB = getNumberFromPct(gridB.liquidation_price);
  if (gridProfitPercentA > gridProfitPercentB) return 1;
  if (gridProfitPercentA < gridProfitPercentB) return -1;
  return 0;
};
let last_sales = 0;
const farm = async () => {
  let TOTAL_CURRENT_GRIDBOT_NUMBER = 0;
  let position_size = 0;
  const assetsResult = await getAssets();
  if (
    assetsResult?.ret_code === 0 &&
    assetsResult.result?.status_code === 200
  ) {
    const bots = assetsResult.result.assets;
    TOTAL_CURRENT_GRIDBOT_NUMBER = bots.length;
    const symbolBots = bots.filter((bot) => {
      return bot.symbol == SYMBOL;
    });
    symbolBots.map((bot) => {
      position_size += Number(Number.parseFloat(bot.current_position));
    });
  } else {
    console.error(
      "ERROR fetching assets for position size:",
      JSON.stringify(assetsResult)
    );
  }
  const gridsResult = await getListOfGrids();
  if (gridsResult.ret_code !== 0) {
    console.error("ERROR:", JSON.stringify(gridsResult));
    return;
  }
  if (gridsResult.result?.status_code !== 200) {
    console.error("ERROR:", JSON.stringify(gridsResult));
    return;
  }
  const grids = gridsResult.result.grids.sort((a, b) => sortGrids(a, b));
  if (!grids || !grids.length) {
    console.error("ERROR: no grids");
    return;
  }
  //clearConsole();
  //console.log("Total grids: ", grids.length);
  let sales = 0;
  let short_balance = 0;
  let long_balance = 0;
  for (grid of grids) {
    sales += Number(grid.arbitrage_num);
    if (grid.grid_mode == "FUTURE_GRID_MODE_SHORT") {
      short_balance += Number(grid.total_investment);
    } else {
      long_balance += Number(grid.total_investment);
    }
    await checkIfShouldReinvest(grid);
  }
  //console.error("REINVEST COMPLETE");
  for (let grid of grids) {
    const gridProfitPercent = getNumberFromPct(grid.pnl_per);
    // Only for profitable bots
    const detail = await getWithdrawDetail(grid.bot_id);
    if (detail && Number(detail.withdraw_limit) > WITHDRAW_THRESHOLD) {
      const amount = Number(detail.withdraw_limit).toFixed(4);
      const msg = `Withdrawing $${amount} from bot ${grid.bot_id}`;
      const success = await withdrawProfit(
        grid.bot_id,
        Number(amount * 0.8).toFixed(4)
      );
      if (success) {
        sendTGMessage(msg);
      }
      await sleep(1000); // Rate limit
    }
  }

  // Check for low PnL and send throttled alert
  let hasLowPnl = false;
  let worstPnl = 0;
  let worstBotId = "";
  let worstGrid = null;
  let hasLong = false;
  let hasShort = false;
  for (let grid of grids) {
    const gridProfitPercent = getNumberFromPct(grid.pnl_per);
    if (gridProfitPercent < LOW_PNL_THRESHOLD) {
      hasLowPnl = true;
      if (gridProfitPercent < worstPnl) {
        worstPnl = gridProfitPercent;
        worstBotId = grid.bot_id;
        worstGrid = grid;
      }
    }
    if (grid.grid_mode === "FUTURE_GRID_MODE_LONG") {
      hasLong = true;
    } else if (grid.grid_mode === "FUTURE_GRID_MODE_SHORT") {
      hasShort = true;
    }
  }
  if (hasLowPnl) {
    const now = Date.now();
    if (now - lastLowPnlAlert > 10 * 60 * 1000) {
      // 10 minutes
      const alertMsg = `Low PnL alert for ${SYMBOL}: ${worstPnl.toFixed(
        2
      )}% on bot ${worstBotId} (threshold ${LOW_PNL_THRESHOLD}%)`;
      sendTGMessage(alertMsg);
      lastLowPnlAlert = now;
    }
  }

  // Sacrifice logic
  let goodBotId = null;
  if (worstPnl < SACRIFICE_PNL_THRESHOLD && !readSacrificeFile()) {
    // Find a good bot near profit
    for (let grid of grids) {
      const gridProfitPercent = getNumberFromPct(grid.pnl_per);
      if (gridProfitPercent > NEAR_PROFIT_THRESHOLD) {
        goodBotId = grid.bot_id;
        break;
      }
    }
    if (goodBotId) {
      createSacrificeFile(goodBotId);
      const sacrificeAlert = `🚨 *Sacrifice required* for ${SYMBOL}\nWorst bot ${worstBotId}: *${worstPnl.toFixed(
        2
      )}%* PnL\nSignaling system to sacrifice 1 low performer into good bot ${goodBotId} (> ${NEAR_PROFIT_THRESHOLD}%)`;
      sendTGMessage(sacrificeAlert);
    } else {
      console.log(`No good bot found for sacrifice near ${SYMBOL}`);
    }
  }

  // Check for sacrifice to perform
  goodBotId = readSacrificeFile();
  if (goodBotId && worstGrid && worstPnl < LOW_PNL_THRESHOLD) {
    // Perform sacrifice on the worst grid
    const sacrificed = await performSacrifice(worstGrid, goodBotId);
    if (sacrificed) {
      console.log(`Sacrifice completed for ${SYMBOL}`);
    }
  }

  // Rescue: if low PnL below rescue threshold, no opposite direction, funds available, and throttled
  let needsRescue = false;
  for (let grid of grids) {
    const gridProfitPercent = getNumberFromPct(grid.pnl_per);
    if (gridProfitPercent < RESCUE_PNL_THRESHOLD) {
      needsRescue = true;
      break;
    }
  }
  let oppositeMode = "";
  if (needsRescue && hasLong && !hasShort) {
    oppositeMode = "FUTURE_GRID_MODE_SHORT";
  } else if (needsRescue && hasShort && !hasLong) {
    oppositeMode = "FUTURE_GRID_MODE_LONG";
  } else if (needsRescue && hasLong && hasShort) {
    let worstPnl = Infinity;
    let worstMode = null;
    for (let grid of grids) {
      const pnl = getNumberFromPct(grid.pnl_per);
      if (pnl < worstPnl) {
        worstPnl = pnl;
        worstMode = grid.grid_mode;
      }
    }
    if (worstMode === "FUTURE_GRID_MODE_LONG") {
      oppositeMode = "FUTURE_GRID_MODE_SHORT";
    } else if (worstMode === "FUTURE_GRID_MODE_SHORT") {
      oppositeMode = "FUTURE_GRID_MODE_LONG";
    }
  }

  let salesChanged = sales > 0 && last_sales !== sales;
  let green = salesChanged;

  await checkAssets(sales || 0, green, position_size);

  if (oppositeMode && Date.now() - lastRescueTime > 5 * 60 * 1000) {
    // 5 minutes throttle
    if (CURRENT_TRADING_BALANCE < 0.01) {
      console.log(
        `Insufficient trading balance for rescue bot: $${CURRENT_TRADING_BALANCE.toFixed(
          4
        )} USDT`
      );
    } else {
      const rescueMsg = `Attempting rescue bot for ${SYMBOL} in ${oppositeMode.replace(
        "FUTURE_GRID_MODE_",
        ""
      )} direction due to low PnL`;
      console.log(rescueMsg);
      if (TOTAL_CURRENT_GRIDBOT_NUMBER <= 50 && grids.length < 5) {
        const created = await createMinimalBot(
          SYMBOL,
          oppositeMode,
          RESCUE_GAP
        );
        if (created) {
          sendTGMessage(`Rescue bot created successfully for ${SYMBOL}`);
          lastRescueTime = Date.now();
        } else {
          //sendTGMessage(`Failed to create rescue bot for ${SYMBOL}`);
        }
      } else {
        const skipMsg = `Max bots (50) reached, skipping rescue for ${SYMBOL}`;
        console.log(skipMsg);
        //sendTGMessage(skipMsg);
      }
    }
  }

  if (salesChanged) {
    let msgtosend = `New ${SYMBOL} sales = ${sales}, Trading balance: $${Number(
      CURRENT_TRADING_BALANCE
    ).toFixed(2)} USDT, Profit: $${Number(CURRENT_PROFIT).toFixed(2)} USDT`;

    sendTGMessage(msgtosend);
    last_sales = sales;
  }
  TOTAL_GRID_PROFIT = 0;
  for (grid of grids) {
    TOTAL_GRID_PROFIT += Number.parseFloat(
      PROFIT_BY_GRID.get(grid.bot_id) || "0.00"
    );
  }
  TOTAL_GRID_PROFIT = TOTAL_GRID_PROFIT.toFixed(2);

  // Check and shift grids with zero position
  if (
    assetsResult?.ret_code === 0 &&
    assetsResult.result?.status_code === 200
  ) {
    const assets = assetsResult.result.assets || [];
    const symbolAssets = assets.filter((a) => a.symbol === SYMBOL);
    for (let grid of grids) {
      const asset = symbolAssets.find((a) => a.bot_id === grid.bot_id);
      const ageMs =
        Math.ceil(new Date().getTime() / 1000) -
        Number.parseInt(grid.create_time);
      if (asset && Number(asset.current_position) === 0 && ageMs > 1800) {
        // 30 minutes in seconds
        const zeroMsg = `Zero position detected for ${grid.bot_id} (age: ${
          ageMs / 60
        } min), preparing to shift`;
        console.log(zeroMsg);
        sendTGMessage(zeroMsg);
        const currentPrice = await getCurrentPrice(SYMBOL);
        if (!currentPrice) {
          const priceMsg = `Could not fetch current price for ${SYMBOL} for grid ${grid.bot_id}`;
          console.log(priceMsg);
          sendTGMessage(priceMsg);
          continue;
        }
        const oldMin = Number(grid.min_price);
        const oldMax = Number(grid.max_price);
        const width = oldMax - oldMin;
        const halfWidth = width / 2;
        const newMin = Number(currentPrice - halfWidth).toFixed(4);
        const newMax = Number(currentPrice + halfWidth).toFixed(4);

        // Calculate new investment similar to recreateGrid
        const initial_investment = Number(grid.initial_investment);
        const investment_increase = Number(
          initial_investment * (GROW_PCT / 100)
        ).toFixed(4);
        let new_investment = Number(
          initial_investment + Number(investment_increase)
        ).toFixed(4);
        const USDFuturesTradingBalance = await getUSDFuturesBalance();
        let shiftMsg = `Shifting ${SYMBOL} grid ${
          grid.bot_id
        } due to zero position (age: ${Math.floor(ageMs / 60)} min). `;
        shiftMsg += `Old range: ${oldMin.toFixed(4)}-${oldMax.toFixed(
          4
        )}, new range: ${newMin}-${newMax} (current: ${currentPrice.toFixed(
          4
        )}), `;
        shiftMsg += `investment: $${new_investment} (was $${initial_investment}, +$${investment_increase})`;
        if (
          REINVEST_DUST_COLLECTION_ENABLED &&
          USDFuturesTradingBalance - Number(new_investment) < DUST_LIMIT
        ) {
          const dust = Number(
            USDFuturesTradingBalance - Number(new_investment) - 0.01
          ).toFixed(4);
          if (dust > 0) {
            new_investment = (Number(new_investment) + Number(dust)).toFixed(4);
            shiftMsg += `, adding dust (+$${dust}) = $${new_investment}`;
          }
        }
        if (USDFuturesTradingBalance < Number(new_investment)) {
          shiftMsg += ` (note: balance $${USDFuturesTradingBalance.toFixed(
            4
          )} may be low)`;
        }
        console.log(shiftMsg);
        sendTGMessage(shiftMsg);

        const closed = await closeGrid(grid.bot_id);
        if (closed) {
          CANCELLED_BOTS.set(grid.bot_id, +new Date());
          const closeMsg = `Closed grid ${grid.bot_id}, waiting ${BOT_CREATION_DELAY}ms to recreate`;
          console.log(closeMsg);
          sendTGMessage(closeMsg);
          await sleep(BOT_CREATION_DELAY);
          const recreated = await createGrid(
            new_investment,
            grid.symbol,
            newMin,
            newMax,
            grid.cell_number,
            grid.leverage,
            grid.grid_mode,
            grid.grid_type
          );
          if (recreated) {
            const successMsg = `Shifted and recreated ${grid.bot_id} successfully`;
            console.log(successMsg);
            sendTGMessage(successMsg);
          } else {
            sendTGMessage(`Failed to create shifted grid ${grid.bot_id}`);
          }
        } else {
          sendTGMessage(`Failed to close ${grid.bot_id} for shifting`);
        }
      }
    }
  } else {
    const assetsError = "Failed to get assets for zero position check";
    console.error(assetsError);
    sendTGMessage(assetsError);
  }

  for (grid of grids) {
    await checkIfShouldClose(grid);
  }
  console.log(
    `TOTAL_GRID_PROFIT = $${Number(TOTAL_GRID_PROFIT).toFixed(2).trim()}`
  );
  console.log("----------------");

  // Update cache file for telegram bot
  const cacheData = {
    timestamp: Date.now(),
    symbol: SYMBOL,
    bots: TOTAL_CURRENT_GRIDBOT_NUMBER,
    tradingBalance: CURRENT_TRADING_BALANCE,
    profit: CURRENT_PROFIT,
    accountSize: ACCOUNT_SIZE,
    totalProfit: TOTAL_GRID_PROFIT,
    sales: sales,
  };
  fs.writeFileSync(
    `${SYMBOL}_farm_cache.json`,
    JSON.stringify(cacheData, null, 2)
  );
};

const runBot = async () => {
  await farm();
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
    `Farm started, Balance: $${USDBalance.balance_in_usd} Profit:$${
      USDBalance.profit_in_usd
    }, Params: ${JSON.stringify(args)}`
  );
  console.log(
    `Starting Farm bot, Balance: $${USDBalance.balance_in_usd} Profit:$${USDBalance.profit_in_usd}`
  );
  while (true) {
    await runBot();
  }
};

main();
