/**
 * Bybit Utilities - Main exports
 * This file consolidates all Bybit API utilities into one interface
 */

// Import all modules
const { getTelegramClient } = require("./telegram-client");
const { getHeaders, bybitPost, fetchWithRetry } = require("./http-client");
const {
  sleep,
  getArgs,
  getNumberFromPct,
  toTwoDecimals,
  toFourDecimals,
} = require("./utils");
const {
  validateGrid,
  createGrid,
  closeGrid,
  getListOfGrids,
  adjustMargin,
  getGridDetails,
  getGridOpenOrders,
  getWithdrawDetail,
  withdrawProfit,
} = require("./grid-operations");
const { getTicker } = require("./market-data");
const {
  getUSDFuturesTradingBalance,
  getUSDFuturesBalance,
  getUSDAssets,
  getUSDBalance,
  getAssets,
} = require("./account-operations");

// Legacy sendTGMessage wrapper for backward compatibility
const sendTGMessage = async (message) => {
  const tg = getTelegramClient();
  return await tg.send(message);
};

/**
 * Create minimal bot - convenience wrapper
 */
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
  );
  const USDFuturesTradingBalance = await getUSDFuturesBalance();
  if (
    Number(minInvestment) < 0.005 &&
    Number(USDFuturesTradingBalance) > 0.005
  ) {
    minInvestment = 0.005;
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
  }
  return created;
};

// Export all utility functions
module.exports = {
  // Legacy compatibility
  sendTGMessage,

  // HTTP operations
  getHeaders,
  bybitPost,
  fetchWithRetry,

  // Grid operations
  validateGrid,
  closeGrid,
  createGrid,
  getListOfGrids,
  adjustMargin,
  getGridDetails,
  getGridOpenOrders,
  getWithdrawDetail,
  withdrawProfit,
  createMinimalBot,

  // Account operations
  getUSDFuturesTradingBalance,
  getUSDFuturesBalance,
  getUSDAssets,
  getUSDBalance,
  getAssets,

  // Market data
  getTicker,

  // Utilities
  sleep,
  getArgs,
  getNumberFromPct,
  toTwoDecimals,
  toFourDecimals,
};
