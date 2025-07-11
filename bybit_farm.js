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

const RUNNING_INTERVAL = args["interval"] ? args["interval"] * 1000 : 10_000;

const RE_INVEST_AMOUNT_USD_LOW = args["RA"] || 0.005;

const RE_INVEST_AMOUNT_USD_HIGH = 0.042;

const RE_INVEST_TRESHOLD_PCT_LOW = -32;

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

const checkIfShouldReinvest = async (grid) => {
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
    console.log(
      `Reinvesting $${RE_INVEST_AMOUNT_USD_LOW} into ${botId} because too low percent: ${gridProfitPercent}% (Lower than ${RE_INVEST_TRESHOLD_PCT_LOW}%)`
    );
    await adjustMargin(RE_INVEST_AMOUNT_USD_LOW, botId);
  } else if (gridProfitPercent > RE_INVEST_TRESHOLD_PCT_HIGH) {
    console.log(
      `Reinvesting $${RE_INVEST_AMOUNT_USD_HIGH} into  into ${botId} because too high ${gridProfitPercent}%  (Higher than ${RE_INVEST_TRESHOLD_PCT_LOW}%)`
    );
    await adjustMargin(RE_INVEST_AMOUNT_USD_HIGH, botId);
  } else {
    //console.log("Doing nothing");
  }
  return;
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
  if (
    USDFuturesTradingBalance < new_investment &&
    USDFuturesTradingBalance - new_investment > INSUFFICIENT_FUNDS_LIMIT
  ) {
    new_investment = USDFuturesTradingBalance - 0.01;
  } else if (USDFuturesTradingBalance < new_investment) {
    new_investment = new_investment;
  }
  console.log(msg);
  //sendTGMessage(msg);
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
    //while (true) {
    await sleep(BOT_CREATION_DELAY);
    const recreated = await recreateGrid(grid);
    //if (recreated) {
    return;
    //}
    //}
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
  let msg = `Taking ${SYMBOL} profit: $${grid.total_profit}, APR: ${APR}%`;
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

const getPositionSize = async () => {
  const assets = await getAssets();
  //console.log("assets = ", assets);
  if (assets?.ret_code !== 0) {
    console.error("ERROR:", JSON.stringify(assets));
    return;
  }
  if (assets.result?.status_code !== 200) {
    console.error("ERROR:", JSON.stringify(assets));
    return;
  }
  const bots = assets.result.assets;
  //console.log("bots = ", bots[0]);
  let position_size = 0;
  bots
    .filter((bot) => {
      return bot.symbol == SYMBOL;
    })
    .map((bot) => {
      position_size += Number(Number.parseFloat(bot.current_position));
    });
  return position_size;
};

const toTwoDecimals = (val) => {
  return Number(val).toFixed(2);
};
const toFourDecimals = (val) => {
  return Number(val).toFixed(4);
};
const checkAssets = async (sales = 0, green) => {
  const USDBalance = await getUSDBalance();
  if (!USDBalance) {
    await sendTGMessage("ERROR: Balance is 0; something is wrong?");
    throw new Error("ERROR: Balance is 0, check cookie");
  }
  let posSizeFn = (txt) => {
    return txt;
  };
  let newPositionSize = await getPositionSize();
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
  CURRENT_TRADING_BALANCE = USDFuturesTradingBalance;
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

  let green = false;
  if (sales > 0 && last_sales !== sales) {
    green = true;
    /*
    let msgtosend = `New ${SYMBOL} sales = ${sales}, Balance = ${CURRENT_TRADING_BALANCE}, Account Size = ${ACCOUNT_SIZE}, Long = ${toFourDecimals(
      long_balance
    )}, Short = ${toFourDecimals(short_balance)}`;
    */
    let msgtosend = `New ${SYMBOL} sales = ${sales}`;

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
  await checkAssets(sales || 0, green);
  for (grid of grids) {
    await checkIfShouldClose(grid);
  }
  console.log(
    `TOTAL_GRID_PROFIT = $${Number(TOTAL_GRID_PROFIT).toFixed(2).trim()}`
  );
  console.log("----------------");
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
  //checkAssets();
  console.log(
    `Starting Farm bot, Balance: $${USDBalance.balance_in_usd} Profit:$${USDBalance.profit_in_usd}`
  );
  while (true) {
    await runBot();
  }
};

main();
