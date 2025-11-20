const fs = require("node:fs");
const { pms } = require("@wilcosp/ms-prettify");
var clc = require("cli-color");
const clearConsole = require("console-clear");
const {
  createMinimalBot,
  getWithdrawDetail,
  withdrawProfit,
} = require("./bybit-utils");

let rateLimitedUntil = 0;
let messageQueue = [];

const sendTGMessageInternal = async (TGbot, USER_CHAT_ID, message) => {
  try {
    return await TGbot.sendMessage(USER_CHAT_ID, message);
  } catch (error) {
    throw error;
  }
};

const processQueue = async (TGbot, USER_CHAT_ID) => {
  while (messageQueue.length > 0 && Date.now() >= rateLimitedUntil) {
    const msg = messageQueue.shift();
    try {
      await sendTGMessageInternal(TGbot, USER_CHAT_ID, msg);
    } catch (error) {
      if (error.response && error.response.statusCode === 429) {
        const retryAfter =
          parseInt(error.response.body.parameters?.retry_after) || 1;
        rateLimitedUntil = Date.now() + retryAfter * 1000;
        messageQueue.unshift(msg);
        setTimeout(() => processQueue(TGbot, USER_CHAT_ID), retryAfter * 1000);
        return;
      } else {
        console.log("error in sending queued message", msg, error);
      }
    }
  }
};

const sendTGMessage = async (TGbot, USER_CHAT_ID, message) => {
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
    await sendTGMessageInternal(TGbot, USER_CHAT_ID, message);
  } catch (error) {
    if (error.response && error.response.statusCode === 429) {
      const retryAfter =
        parseInt(error.response.body.parameters?.retry_after) || 1;
      rateLimitedUntil = Date.now() + retryAfter * 1000;
      console.log(
        `Rate limited. Deferring messages until ${new Date(
          rateLimitedUntil
        ).toISOString()}`
      );
      messageQueue.push(message);
      setTimeout(() => processQueue(TGbot, USER_CHAT_ID), retryAfter * 1000);
    } else {
      console.log("Non-rate limit error, message not queued");
    }
  }
};

const getCurrentPrice = async (symbol, getHeaders) => {
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

const getHeaders = (BYBIT_COOKIE) => {
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

const closeGrid = async (bot_id, BYBIT_COOKIE, sendTGMessage) => {
  const raw = JSON.stringify({
    bot_id: String(bot_id),
  });
  console.log("INFO: RAW CLOSE", raw);

  const requestOptions = {
    method: "POST",
    headers: getHeaders(BYBIT_COOKIE),
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
  grid_type,
  BYBIT_COOKIE,
  sendTGMessage
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
    headers: getHeaders(BYBIT_COOKIE),
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
      console.error("ERROR: ", futuresGrid.result?.debug_msg);
      sendTGMessage(`ERROR: ${futuresGrid.result?.debug_msg}!!!`);
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

const getListOfGrids = async (SYMBOL, BYBIT_COOKIE, sendTGMessage) => {
  const raw = JSON.stringify({
    page: 0,
    limit: 100,
    status: "2",
    symbol: SYMBOL,
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(BYBIT_COOKIE),
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

const adjustMargin = async (amount, bot_id, BYBIT_COOKIE, sendTGMessage) => {
  const raw = JSON.stringify({
    amount: String(amount),
    bot_id: String(bot_id),
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(BYBIT_COOKIE),
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
    if (arg.slice(0, 2) === "--") {
      const longArg = arg.split("=");
      const longArgFlag = longArg[0].slice(2);
      const longArgValue = longArg.length > 1 ? longArg[1] : true;
      args[longArgFlag] = longArgValue;
    } else if (arg[0] === "-") {
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

const getUSDFuturesTradingBalance = async (BYBIT_COOKIE, sendTGMessage) => {
  const body = JSON.stringify({
    coin: "USDT",
    bot_type: "BOT_TYPE_ENUM_GRID_FUTURES",
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(BYBIT_COOKIE),
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

const getUSDAssets = async (BYBIT_COOKIE, sendTGMessage) => {
  const raw = JSON.stringify({
    page: 0,
    limit: 50,
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(BYBIT_COOKIE),
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

const getAssets = async (BYBIT_COOKIE, sendTGMessage) => {
  const raw = JSON.stringify({
    page: 0,
    limit: 50,
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(BYBIT_COOKIE),
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

const checkIfShouldReinvest = async (
  grid,
  RE_INVEST_AMOUNT_USD_LOW,
  CURRENT_TRADING_BALANCE,
  RE_INVEST_TRESHOLD_PCT_LOW,
  RE_INVEST_AMOUNT_USD_HIGH,
  RE_INVEST_TRESHOLD_PCT_HIGH,
  SYMBOL,
  adjustMargin,
  sendTGMessage
) => {
  if (Number(RE_INVEST_AMOUNT_USD_LOW) <= 0) return;
  const gridProfitPercent = getNumberFromPct(grid.pnl_per);
  const botId = grid.bot_id;
  if (Number(CURRENT_TRADING_BALANCE) < RE_INVEST_AMOUNT_USD_LOW) {
    return;
  }
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
    await adjustMargin(reinvest_amount, botId, BYBIT_COOKIE, sendTGMessage);
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
    await adjustMargin(
      RE_INVEST_AMOUNT_USD_HIGH,
      botId,
      BYBIT_COOKIE,
      sendTGMessage
    );
  }
  return;
};

const createSacrificeFile = (SACRIFICE_FILE, targetBotId) => {
  const data = { target_bot_id: targetBotId, timestamp: Date.now() };
  fs.writeFileSync(SACRIFICE_FILE, JSON.stringify(data));
  console.log(`Created sacrifice file for target bot ${targetBotId}`);
};

const readSacrificeFile = (SACRIFICE_FILE) => {
  if (!fs.existsSync(SACRIFICE_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(SACRIFICE_FILE, "utf8"));
    if (Date.now() - data.timestamp > 600000) {
      fs.unlinkSync(SACRIFICE_FILE);
      return null;
    }
    return data.target_bot_id;
  } catch (error) {
    console.error("Error reading sacrifice file:", error);
    return null;
  }
};

const deleteSacrificeFile = (SACRIFICE_FILE) => {
  if (fs.existsSync(SACRIFICE_FILE)) {
    fs.unlinkSync(SACRIFICE_FILE);
    console.log("Deleted sacrifice file");
  }
};

const performSacrifice = async (
  sacrificeGrid,
  targetBotId,
  SACRIFICE_PERCENT,
  CANCELLED_BOTS,
  getNumberFromPct,
  closeGrid,
  sendTGMessage,
  adjustMargin,
  BYBIT_COOKIE,
  SACRIFICE_FILE
) => {
  const sacrificeAmount =
    Number(sacrificeGrid.total_investment) * SACRIFICE_PERCENT;
  const closed = await closeGrid(
    sacrificeGrid.bot_id,
    BYBIT_COOKIE,
    sendTGMessage
  );
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
    await adjustMargin(
      sacrificeAmount,
      targetBotId,
      BYBIT_COOKIE,
      sendTGMessage
    );
    deleteSacrificeFile(SACRIFICE_FILE);
    return true;
  }
  return false;
};

const recreateGrid = async (
  grid,
  SYMBOL,
  GROW_PCT_GRID,
  GROW_PCT,
  REINVEST_DUST_COLLECTION_ENABLED,
  DUST_LIMIT,
  INSUFFICIENT_FUNDS_LIMIT,
  getUSDFuturesBalance,
  sendTGMessage,
  createGrid,
  BYBIT_COOKIE
) => {
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

  const USDFuturesTradingBalance = await getUSDFuturesBalance(
    BYBIT_COOKIE,
    sendTGMessage
  );
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
  if (
    USDFuturesTradingBalance < new_investment &&
    USDFuturesTradingBalance - new_investment > INSUFFICIENT_FUNDS_LIMIT
  ) {
    if (USDFuturesTradingBalance < new_investment) {
      new_investment = USDFuturesTradingBalance - 0.01;
    }
  } else if (USDFuturesTradingBalance < new_investment) {
    new_investment = USDFuturesTradingBalance - 0.01;
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
    grid.grid_type,
    BYBIT_COOKIE,
    sendTGMessage
  );
};

const closeAndRecreate = async (
  grid,
  BOT_CREATION_DELAY,
  MAX_RETRIES,
  CANCELLED_BOTS,
  getAssets,
  sendTGMessage,
  sleep,
  recreateGrid
) => {
  const closed = await closeGrid(grid.bot_id, BYBIT_COOKIE, sendTGMessage);
  if (closed) {
    CANCELLED_BOTS.set(grid.bot_id, +new Date());
    console.log(`Bot closed! Recreating after ${BOT_CREATION_DELAY}ms!`);

    const assetsResult = await getAssets(BYBIT_COOKIE, sendTGMessage);
    let currentTotal = 0;
    if (
      assetsResult?.ret_code === 0 &&
      assetsResult.result?.status_code === 200
    ) {
      currentTotal = assetsResult.result.assets.length;
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
        recreated = await recreateGrid(
          grid,
          SYMBOL,
          GROW_PCT_GRID,
          GROW_PCT,
          REINVEST_DUST_COLLECTION_ENABLED,
          DUST_LIMIT,
          INSUFFICIENT_FUNDS_LIMIT,
          getUSDFuturesBalance,
          sendTGMessage,
          createGrid,
          BYBIT_COOKIE
        );
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

const getGridDetails = async (bot_id, BYBIT_COOKIE, sendTGMessage) => {
  const raw = JSON.stringify({
    bot_id,
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(BYBIT_COOKIE),
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

const getGridOpenOrders = async (bot_id, BYBIT_COOKIE, sendTGMessage) => {
  const raw = JSON.stringify({
    bot_id,
    limit: 200,
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(BYBIT_COOKIE),
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

const checkIfShouldClose = async (
  grid,
  getNumberFromPct,
  TAKE_PROFIT_PCT,
  ARBITRAGE_NUM_MAX,
  ARBITRAGE_NUM_MIN,
  TAKE_PROFIT_FORCE_PCT,
  SYMBOL,
  CANCELLED_BOTS,
  PROFIT_BY_GRID,
  SALES_BY_GRID,
  PNL_BY_GRID,
  LP_BY_GRID,
  clc,
  pms,
  getGridDetails,
  closeAndRecreate,
  sendTGMessage,
  CURRENT_TRADING_BALANCE,
  BOT_CREATION_DELAY,
  MAX_RETRIES,
  getAssets,
  sleep,
  recreateGrid,
  GROW_PCT_GRID,
  GROW_PCT,
  REINVEST_DUST_COLLECTION_ENABLED,
  DUST_LIMIT,
  INSUFFICIENT_FUNDS_LIMIT,
  createGrid,
  BYBIT_COOKIE
) => {
  const gridProfitPercent = getNumberFromPct(grid.pnl_per);
  const APR = (Number(grid.total_profit_apr) * 100).toFixed(2);
  let greenSales = false;
  let LPFn = (txt) => txt;
  let PNLFn = (txt) => txt;
  const prevPnl = PNL_BY_GRID.get(grid.bot_id) || 0;
  const prevSales = SALES_BY_GRID.get(grid.bot_id) || 0;
  const prevLp = LP_BY_GRID.get(grid.bot_id) || 0;
  if (grid.arbitrage_num > prevSales) {
    greenSales = true;
    getGridDetails(grid.bot_id, BYBIT_COOKIE, sendTGMessage).then(
      (gridDetails) => {
        PROFIT_BY_GRID.set(
          grid.bot_id,
          Number.parseFloat(gridDetails.grid_profit).toFixed(2)
        );
      }
    );
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
  let msg = `Taking ${SYMBOL} profit: $${
    grid.total_profit
  }, APR: ${APR}%, Current balance: $${Number(CURRENT_TRADING_BALANCE).toFixed(
    2
  )} USDT`;
  sendTGMessage(msg);
  closeAndRecreate(
    grid,
    BOT_CREATION_DELAY,
    MAX_RETRIES,
    CANCELLED_BOTS,
    getAssets,
    sendTGMessage,
    sleep,
    recreateGrid,
    GROW_PCT_GRID,
    GROW_PCT,
    REINVEST_DUST_COLLECTION_ENABLED,
    DUST_LIMIT,
    INSUFFICIENT_FUNDS_LIMIT,
    createGrid,
    BYBIT_COOKIE
  );
};

const getUSDFuturesBalance = async (BYBIT_COOKIE, sendTGMessage) => {
  const usd_assets = await getUSDFuturesTradingBalance(
    BYBIT_COOKIE,
    sendTGMessage
  );
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

const getUSDBalance = async (BYBIT_COOKIE, sendTGMessage) => {
  const usd_assets = await getUSDAssets(BYBIT_COOKIE, sendTGMessage);
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

const checkAssets = async (
  sales,
  green,
  position_size,
  SYMBOL,
  getUSDBalance,
  getPositionSize,
  CURRENT_POSITION_SIZE,
  getUSDFuturesBalance,
  clc,
  CURRENT_PROFIT,
  sendTGMessage,
  ACCOUNT_SIZE,
  CURRENT_TRADING_BALANCE,
  USD_ALERT_LIMIT_MIN,
  USD_STOP_LIMIT_MIN,
  USDBalance,
  TOTAL_GRID_PROFIT
) => {
  const USDBalanceLocal = await getUSDBalance(BYBIT_COOKIE, sendTGMessage);
  CURRENT_PROFIT = USDBalanceLocal.profit_in_usd;
  if (!USDBalanceLocal) {
    await sendTGMessage("ERROR: Balance is 0; something is wrong?");
    throw new Error("ERROR: Balance is 0, check cookie");
  }
  let posSizeFn = (txt) => txt;
  let newPositionSize =
    position_size !== null ? position_size : await getPositionSize();
  if (newPositionSize > CURRENT_POSITION_SIZE) {
    posSizeFn = clc.green;
  } else if (newPositionSize < CURRENT_POSITION_SIZE) {
    posSizeFn = clc.red;
  }
  CURRENT_POSITION_SIZE = newPositionSize;
  const USDFuturesTradingBalance = await getUSDFuturesBalance(
    BYBIT_COOKIE,
    sendTGMessage
  );
  clearConsole();
  ACCOUNT_SIZE = toTwoDecimals(
    Number(USDBalanceLocal.balance_in_usd) +
      Math.abs(Number(USDBalanceLocal.profit_in_usd))
  );
  CURRENT_TRADING_BALANCE = Number(USDFuturesTradingBalance);
  var Table = require("cli-table");
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
  });
  table.push([
    new Date().toLocaleString(),
    toTwoDecimals(USDFuturesTradingBalance) + " USDT",
    toTwoDecimals(USDBalanceLocal.balance_in_usd) + " USDT",
    toTwoDecimals(USDBalanceLocal.profit_in_usd) + " USDT",
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
        toTwoDecimals(USDBalanceLocal.balance_in_usd),
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
      `WARNING: Balance is lower than $${USD_ALERT_LIMIT_MIN}: $${USDBalanceLocal.balance_in_usd}`
    );
  }
  if (Number(ACCOUNT_SIZE) > 0 && Number(ACCOUNT_SIZE) < USD_STOP_LIMIT_MIN) {
    await sendTGMessage(
      `ERROR: Balance is lower than $${USD_STOP_LIMIT_MIN}: $${USDBalanceLocal.balance_in_usd}, something is wrong?`
    );
  }
};

const sortGrids = (gridA, gridB, getNumberFromPct) => {
  const gridProfitPercentA = getNumberFromPct(gridA.liquidation_price);
  const gridProfitPercentB = getNumberFromPct(gridB.liquidation_price);
  if (gridProfitPercentA > gridProfitPercentB) return 1;
  if (gridProfitPercentA < gridProfitPercentB) return -1;
  return 0;
};

const getPositionSize = async (SYMBOL, getAssets) => {
  let position_size = 0;
  const assetsResult = await getAssets(BYBIT_COOKIE, sendTGMessage);
  if (
    assetsResult?.ret_code === 0 &&
    assetsResult.result?.status_code === 200
  ) {
    const bots = assetsResult.result.assets;
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
  return position_size;
};

const farm = async (
  SYMBOL,
  LOW_PNL_THRESHOLD,
  WITHDRAW_THRESHOLD,
  SACRIFICE_PNL_THRESHOLD,
  NEAR_PROFIT_THRESHOLD,
  RESCUE_PNL_THRESHOLD,
  RESCUE_GAP,
  RE_INVEST_AMOUNT_USD_LOW,
  RE_INVEST_TRESHOLD_PCT_LOW,
  RE_INVEST_AMOUNT_USD_HIGH,
  RE_INVEST_TRESHOLD_PCT_HIGH,
  GROW_PCT,
  GROW_PCT_GRID,
  TAKE_PROFIT_PCT,
  TAKE_PROFIT_FORCE_PCT,
  ARBITRAGE_NUM_MAX,
  ARBITRAGE_NUM_MIN,
  BOT_CREATION_DELAY,
  MAX_RETRIES,
  REINVEST_DUST_COLLECTION_ENABLED,
  DUST_LIMIT,
  INSUFFICIENT_FUNDS_LIMIT,
  SACRIFICE_FILE,
  SACRIFICE_PERCENT,
  USD_ALERT_LIMIT_MIN,
  USD_STOP_LIMIT_MIN,
  RUNNING_INTERVAL,
  lastLowPnlAlert,
  lastRescueTime,
  CURRENT_TRADING_BALANCE,
  CURRENT_POSITION_SIZE,
  CURRENT_PROFIT,
  ACCOUNT_SIZE,
  CANCELLED_BOTS,
  PROFIT_BY_GRID,
  LP_BY_GRID,
  SALES_BY_GRID,
  PNL_BY_GRID,
  TOTAL_GRID_PROFIT,
  last_sales,
  getListOfGrids,
  getAssets,
  checkIfShouldReinvest,
  getWithdrawDetail,
  withdrawProfit,
  sleep,
  getCurrentPrice,
  createMinimalBot,
  sendTGMessage,
  closeGrid,
  adjustMargin,
  createSacrificeFile,
  readSacrificeFile,
  deleteSacrificeFile,
  performSacrifice,
  closeAndRecreate,
  getGridDetails,
  getGridOpenOrders,
  checkIfShouldClose,
  getUSDFuturesBalance,
  getUSDBalance,
  toTwoDecimals,
  toFourDecimals,
  checkAssets,
  sortGrids,
  getPositionSize,
  getNumberFromPct,
  clc,
  pms,
  Table,
  BYBIT_COOKIE,
  TGbot,
  USER_CHAT_ID
) => {
  let TOTAL_CURRENT_GRIDBOT_NUMBER = 0;
  let position_size = await getPositionSize(SYMBOL, getAssets);
  const assetsResult = await getAssets(BYBIT_COOKIE, sendTGMessage);
  if (
    assetsResult?.ret_code === 0 &&
    assetsResult.result?.status_code === 200
  ) {
    const bots = assetsResult.result.assets;
    TOTAL_CURRENT_GRIDBOT_NUMBER = bots.length;
  }
  const gridsResult = await getListOfGrids(SYMBOL, BYBIT_COOKIE, sendTGMessage);
  if (gridsResult.ret_code !== 0) {
    console.error("ERROR:", JSON.stringify(gridsResult));
    return;
  }
  if (gridsResult.result?.status_code !== 200) {
    console.error("ERROR:", JSON.stringify(gridsResult));
    return;
  }
  const grids = gridsResult.result.grids.sort((a, b) =>
    sortGrids(a, b, getNumberFromPct)
  );
  if (!grids || !grids.length) {
    console.error("ERROR: no grids");
    return;
  }
  let sales = 0;
  let short_balance = 0;
  let long_balance = 0;
  for (let grid of grids) {
    sales += Number(grid.arbitrage_num);
    if (grid.grid_mode == "FUTURE_GRID_MODE_SHORT") {
      short_balance += Number(grid.total_investment);
    } else {
      long_balance += Number(grid.total_investment);
    }
    await checkIfShouldReinvest(
      grid,
      RE_INVEST_AMOUNT_USD_LOW,
      CURRENT_TRADING_BALANCE,
      RE_INVEST_TRESHOLD_PCT_LOW,
      RE_INVEST_AMOUNT_USD_HIGH,
      RE_INVEST_TRESHOLD_PCT_HIGH,
      SYMBOL,
      adjustMargin,
      sendTGMessage
    );
  }
  console.log("checking profits");
  for (let grid of grids) {
    const gridProfitPercent = getNumberFromPct(grid.pnl_per);
    const detail = await getWithdrawDetail(grid.bot_id);
    console.log("detail = ", detail);
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
      await sleep(1000);
    }
  }

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
      const alertMsg = `Low PnL alert for ${SYMBOL}: ${worstPnl.toFixed(
        2
      )}% on bot ${worstBotId} (threshold ${LOW_PNL_THRESHOLD}%)`;
      sendTGMessage(alertMsg);
      lastLowPnlAlert = now;
    }
  }

  let goodBotId = null;
  if (
    worstPnl < SACRIFICE_PNL_THRESHOLD &&
    !readSacrificeFile(SACRIFICE_FILE)
  ) {
    for (let grid of grids) {
      const gridProfitPercent = getNumberFromPct(grid.pnl_per);
      if (gridProfitPercent > NEAR_PROFIT_THRESHOLD) {
        goodBotId = grid.bot_id;
        break;
      }
    }
    if (goodBotId) {
      createSacrificeFile(SACRIFICE_FILE, goodBotId);
      const sacrificeAlert = `🚨 *Sacrifice required* for ${SYMBOL}\nWorst bot ${worstBotId}: *${worstPnl.toFixed(
        2
      )}%* PnL\nSignaling system to sacrifice 1 low performer into good bot ${goodBotId} (> ${NEAR_PROFIT_THRESHOLD}%)`;
      sendTGMessage(sacrificeAlert);
    } else {
      console.log(`No good bot found for sacrifice near ${SYMBOL}`);
    }
  }

  goodBotId = readSacrificeFile(SACRIFICE_FILE);
  if (goodBotId && worstGrid && worstPnl < LOW_PNL_THRESHOLD) {
    const sacrificed = await performSacrifice(
      worstGrid,
      goodBotId,
      SACRIFICE_PERCENT,
      CANCELLED_BOTS,
      getNumberFromPct,
      closeGrid,
      sendTGMessage,
      adjustMargin,
      BYBIT_COOKIE,
      SACRIFICE_FILE
    );
    if (sacrificed) {
      console.log(`Sacrifice completed for ${SYMBOL}`);
    }
  }

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
    let worstPnlLocal = Infinity;
    let worstMode = null;
    for (let grid of grids) {
      const pnl = getNumberFromPct(grid.pnl_per);
      if (pnl < worstPnlLocal) {
        worstPnlLocal = pnl;
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

  await checkAssets(
    sales || 0,
    green,
    position_size,
    SYMBOL,
    getUSDBalance,
    getPositionSize,
    CURRENT_POSITION_SIZE,
    getUSDFuturesBalance,
    clc,
    CURRENT_PROFIT,
    sendTGMessage,
    ACCOUNT_SIZE,
    CURRENT_TRADING_BALANCE,
    USD_ALERT_LIMIT_MIN,
    USD_STOP_LIMIT_MIN,
    USDBalance,
    TOTAL_GRID_PROFIT
  );

  if (oppositeMode && Date.now() - lastRescueTime > 5 * 60 * 1000) {
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
        }
      } else {
        const skipMsg = `Max bots (50) reached, skipping rescue for ${SYMBOL}`;
        console.log(skipMsg);
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
  for (let grid of grids) {
    TOTAL_GRID_PROFIT += Number.parseFloat(
      PROFIT_BY_GRID.get(grid.bot_id) || "0.00"
    );
  }
  TOTAL_GRID_PROFIT = TOTAL_GRID_PROFIT.toFixed(2);

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
        const zeroMsg = `Zero position detected for ${grid.bot_id} (age: ${
          ageMs / 60
        } min), preparing to shift`;
        console.log(zeroMsg);
        sendTGMessage(zeroMsg);
        const currentPrice = await getCurrentPrice(SYMBOL, getHeaders);
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

        const initial_investment = Number(grid.initial_investment);
        const investment_increase = Number(
          initial_investment * (GROW_PCT / 100)
        ).toFixed(4);
        let new_investment = Number(
          initial_investment + Number(investment_increase)
        ).toFixed(4);
        const USDFuturesTradingBalance = await getUSDFuturesBalance(
          BYBIT_COOKIE,
          sendTGMessage
        );
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

        const closed = await closeGrid(
          grid.bot_id,
          BYBIT_COOKIE,
          sendTGMessage
        );
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
            grid.grid_type,
            BYBIT_COOKIE,
            sendTGMessage
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

  for (let grid of grids) {
    await checkIfShouldClose(
      grid,
      getNumberFromPct,
      TAKE_PROFIT_PCT,
      ARBITRAGE_NUM_MAX,
      ARBITRAGE_NUM_MIN,
      TAKE_PROFIT_FORCE_PCT,
      SYMBOL,
      CANCELLED_BOTS,
      PROFIT_BY_GRID,
      SALES_BY_GRID,
      PNL_BY_GRID,
      LP_BY_GRID,
      clc,
      pms,
      getGridDetails,
      closeAndRecreate,
      sendTGMessage,
      CURRENT_TRADING_BALANCE,
      BOT_CREATION_DELAY,
      MAX_RETRIES,
      getAssets,
      sleep,
      recreateGrid,
      GROW_PCT_GRID,
      GROW_PCT,
      REINVEST_DUST_COLLECTION_ENABLED,
      DUST_LIMIT,
      INSUFFICIENT_FUNDS_LIMIT,
      createGrid,
      BYBIT_COOKIE
    );
  }
  console.log(
    `TOTAL_GRID_PROFIT = $${Number(TOTAL_GRID_PROFIT).toFixed(2).trim()}`
  );
  console.log("----------------");

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

module.exports = {
  sendTGMessage,
  processQueue,
  sendTGMessageInternal,
  getCurrentPrice,
  getHeaders,
  closeGrid,
  createGrid,
  getListOfGrids,
  adjustMargin,
  getArgs,
  sleep,
  getUSDFuturesTradingBalance,
  getUSDAssets,
  getAssets,
  getNumberFromPct,
  checkIfShouldReinvest,
  createSacrificeFile,
  readSacrificeFile,
  deleteSacrificeFile,
  performSacrifice,
  recreateGrid,
  closeAndRecreate,
  getGridDetails,
  getGridOpenOrders,
  checkIfShouldClose,
  getUSDFuturesBalance,
  getUSDBalance,
  toTwoDecimals,
  toFourDecimals,
  checkAssets,
  sortGrids,
  farm,
  getPositionSize,
};
