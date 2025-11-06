const { RestClientV5 } = require("bybit-api");
require("dotenv").config();

const apiKey = process.env.BYBIT_API_KEY;
const apiSecret = process.env.BYBIT_SECRET;
const testnet = process.env.BYBIT_TESTNET === "true";

if (!apiKey || !apiSecret) {
  throw new Error(
    "BYBIT_API_KEY and BYBIT_SECRET must be set in .env for official API"
  );
}

const client = new RestClientV5({
  key: apiKey,
  secret: apiSecret,
  testnet,
});

// Public: Get ticker for price and decimals
const getTicker = async (symbol) => {
  try {
    const result = await client.getTickers({
      category: "linear",
      symbol,
    });
    const ticker = result.result.list[0];
    if (!ticker) throw new Error(`No ticker for ${symbol}`);
    const lastPrice = parseFloat(ticker.lastPrice);
    const tickSize = parseFloat(ticker.priceFilter.tickSize);
    const decimals = tickSize.toString().split(".")[1]?.length || 0;
    return { price: lastPrice, decimals };
  } catch (error) {
    console.error(`Error fetching ticker for ${symbol}:`, error);
    throw error;
  }
};

// Private: Validate grid input (use SDK estimate or direct call if available; fallback to create simulation)
const validateGrid = async (
  symbol,
  minPrice,
  maxPrice,
  gridMode,
  gridType,
  cellNumber,
  leverage
) => {
  try {
    // SDK doesn't have direct validate; simulate by preparing params and check investment
    const params = {
      category: "linear",
      symbol,
      side: gridMode === "FUTURE_GRID_MODE_SHORT" ? "Sell" : "Buy",
      orderType: "Market",
      qty: "0", // Simulate
      price: maxPrice, // Approx
      // Full grid params for estimation
      basePrice: (parseFloat(minPrice) + parseFloat(maxPrice)) / 2,
      gridNum: cellNumber,
      gridInterval: (parseFloat(maxPrice) - parseFloat(minPrice)) / cellNumber,
      leverage,
      mode: gridType === "FUTURE_GRID_TYPE_GEOMETRIC" ? 1 : 0, // 1 geometric
    };
    // Use getInstrumentInfo or custom calc; for now, assume valid and return mock for investment estimate
    // In practice, calculate min investment based on grid
    const estimatedInvestment =
      (parseFloat(maxPrice) - parseFloat(minPrice)) * 10; // Placeholder calc
    return {
      cell_number: { to: cellNumber },
      investment: { from: estimatedInvestment.toFixed(4) },
    };
  } catch (error) {
    console.error("Validate grid error:", error);
    return false;
  }
};

// Create grid bot
const createGrid = async (
  amount,
  symbol,
  minPrice,
  maxPrice,
  cellNumber,
  leverage,
  gridMode,
  gridType
) => {
  try {
    const side = gridMode === "FUTURE_GRID_MODE_SHORT" ? "Sell" : "Buy";
    const params = {
      category: "linear",
      symbol,
      side,
      orderType: "Market",
      basePrice: (parseFloat(minPrice) + parseFloat(maxPrice)) / 2,
      gridNum: cellNumber,
      gridInterval: (parseFloat(maxPrice) - parseFloat(minPrice)) / cellNumber,
      totalInvestment: amount,
      leverage,
      mode: gridType === "FUTURE_GRID_TYPE_GEOMETRIC" ? 1 : 0,
      // Add more as per SDK docs
    };
    const result = await client.createFuturesGridBot(params);
    if (result.retCode === 0) {
      console.log("Grid created:", result.result);
      return true;
    } else {
      console.error("Create grid error:", result);
      await sendTGMessage(`ERROR: ${result.retMsg}`);
      return false;
    }
  } catch (error) {
    console.error("Create grid failed:", error);
    await sendTGMessage("ERROR: failed to create grid");
    return false;
  }
};

// Close grid bot
const closeGrid = async (botId) => {
  try {
    const result = await client.terminateFuturesGridBot({
      category: "linear",
      botId,
    });
    if (result.retCode === 0) {
      console.log("Bot closed:", result.result);
      return true;
    } else {
      console.error("Close grid error:", result);
      return false;
    }
  } catch (error) {
    console.error("Close grid failed:", error);
    await sendTGMessage("ERROR: failed to close grid");
    return false;
  }
};

// Get list of grids
const getListOfGrids = async (symbol) => {
  try {
    const result = await client.getFuturesGridBotList({
      category: "linear",
      symbol,
      limit: 100,
      status: "Running", // Equivalent to "2"
    });
    if (result.retCode === 0) {
      return { result: { grids: result.result.list, status_code: 200 } }; // Map to old format
    } else {
      return { ret_code: result.retCode, retMsg: result.retMsg };
    }
  } catch (error) {
    console.error("Get grids failed:", error);
    await sendTGMessage("ERROR: failed to get list of grids");
    return { ret_code: -1 };
  }
};

// Adjust margin
const adjustMargin = async (amount, botId) => {
  try {
    const result = await client.addFuturesGridBotMargin({
      category: "linear",
      botId,
      addMargin: amount,
    });
    if (result.retCode === 0) {
      return result;
    } else {
      console.error("Adjust margin error:", result);
      return { ret_code: result.retCode };
    }
  } catch (error) {
    console.error("Adjust margin failed:", error);
    await sendTGMessage("ERROR: failed to adjust margin");
    return { ret_code: -1 };
  }
};

// Get USD futures balance
const getUSDFuturesBalance = async () => {
  try {
    const result = await client.getWalletBalance({
      accountType: "UNIFIED",
      coin: "USDT",
    });
    if (result.retCode === 0) {
      const balance = parseFloat(result.result.list[0].totalEquity); // Adjust path as per response
      return toFourDecimals(balance);
    } else {
      console.error("Balance error:", result);
      return 0;
    }
  } catch (error) {
    console.error("Get balance failed:", error);
    await sendTGMessage("ERROR: failed to get usd futures balance");
    return 0;
  }
};

// Get USD assets summary
const getUSDBalance = async () => {
  try {
    const result = await client.getWalletBalance({
      accountType: "UNIFIED",
    });
    if (result.retCode === 0) {
      // Map to old format: assume profit and balance calc
      const usdt = result.result.list.find((a) => a.coin === "USDT");
      return {
        balance_in_usd: parseFloat(usdt.totalEquity),
        profit_in_usd: parseFloat(usdt.unrealisedPnl), // Approx
      };
    } else {
      console.error("USD assets error:", result);
      return null;
    }
  } catch (error) {
    console.error("Get USD balance failed:", error);
    await sendTGMessage("ERROR: failed to get usd assets");
    return null;
  }
};

// Get assets (positions)
const getAssets = async () => {
  try {
    const result = await client.getPositions({
      category: "linear",
    });
    if (result.retCode === 0) {
      return { result: { assets: result.result.list, status_code: 200 } }; // Map
    } else {
      return { ret_code: result.retCode };
    }
  } catch (error) {
    console.error("Get assets failed:", error);
    await sendTGMessage("failed to get assets");
    return { ret_code: -1 };
  }
};

const toTwoDecimals = (val) => Number(val).toFixed(2);
const toFourDecimals = (val) => Number(val).toFixed(4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getArgs = () =>
  process.argv.reduce((args, arg) => {
    if (arg.slice(0, 2) === "--") {
      const [flag, value = true] = arg.split("=");
      args[flag.slice(2)] = value;
    } else if (arg[0] === "-") {
      arg
        .slice(1)
        .split("")
        .forEach((f) => (args[f] = true));
    }
    return args;
  }, {});
const getNumberFromPct = (pct) => parseFloat((pct * 100).toFixed(2));

const sendTGMessage = async (msg) => {
  // Assume Telegram setup from original
  // Placeholder: implement if needed
  console.log("TG Message:", msg);
};

module.exports = {
  getTicker,
  validateGrid,
  createGrid,
  closeGrid,
  getListOfGrids,
  adjustMargin,
  getUSDFuturesBalance,
  getUSDBalance,
  getAssets,
  toTwoDecimals,
  toFourDecimals,
  sleep,
  getArgs,
  getNumberFromPct,
  sendTGMessage,
  client, // Export for advanced use
};
