const { getListOfGrids } = require("./grid-operations");
const { getUSDFuturesBalance } = require("./account-operations");
const { getNumberFromPct } = require("./utils");

/**
 * Hedging operations module
 */

/**
 * Calculate hedging status for all symbols
 */
async function calculateHedgingStatus() {
  const gridsResult = await getListOfGrids();

  if (!gridsResult || gridsResult.ret_code !== 0) {
    console.error("ERROR:", JSON.stringify(gridsResult));
    return null;
  }

  if (gridsResult.result?.status_code !== 200) {
    console.error("ERROR:", JSON.stringify(gridsResult));
    return null;
  }

  const grids = gridsResult.result.grids;
  if (!grids || !grids.length) {
    console.log("No grids found");
    return null;
  }

  // Compute hedging status and groups per symbol
  const symbolGroups = {};
  grids.forEach((grid) => {
    const symbol = grid.symbol;
    if (!symbolGroups[symbol]) {
      symbolGroups[symbol] = {
        long: 0,
        short: 0,
        longGrids: [],
        shortGrids: [],
        totalInvestment: 0,
      };
    }
    const investment = Number(grid.total_investment || 0);
    symbolGroups[symbol].totalInvestment += investment;

    if (grid.grid_mode && grid.grid_mode.includes("SHORT")) {
      symbolGroups[symbol].short += investment;
      symbolGroups[symbol].shortGrids.push(grid);
    } else if (grid.grid_mode && grid.grid_mode.includes("LONG")) {
      symbolGroups[symbol].long += investment;
      symbolGroups[symbol].longGrids.push(grid);
    }
  });

  return { grids, symbolGroups };
}

/**
 * Identify non-hedged symbols
 */
function identifyNonHedgedSymbols(symbolGroups) {
  const nonHedgedSymbols = [];

  Object.keys(symbolGroups).forEach((symbol) => {
    const { long, short, totalInvestment, longGrids, shortGrids } =
      symbolGroups[symbol];
    const total = long + short;

    if (total === 0) return;

    const longPct = (long / total) * 100;
    const isHedged = longPct >= 40 && longPct <= 60;

    if (!isHedged) {
      const majoritySide = long > short ? "LONG" : "SHORT";
      const majorityGrids = majoritySide === "LONG" ? longGrids : shortGrids;

      if (majorityGrids.length === 0) return;

      // Compute averages from majority grids
      const avgInvestment =
        majorityGrids.reduce(
          (sum, g) => sum + Number(g.total_investment || 0),
          0
        ) / majorityGrids.length;
      const avgLeverage = Math.round(
        majorityGrids.reduce((sum, g) => sum + Number(g.leverage || 0), 0) /
          majorityGrids.length
      );
      const avgMinPrice =
        majorityGrids.reduce((sum, g) => sum + Number(g.min_price || 0), 0) /
        majorityGrids.length;
      const avgMaxPrice =
        majorityGrids.reduce((sum, g) => sum + Number(g.max_price || 0), 0) /
        majorityGrids.length;

      const minoritySide = majoritySide === "LONG" ? "SHORT" : "LONG";

      nonHedgedSymbols.push({
        symbol,
        majoritySide,
        minoritySide,
        longPct: longPct.toFixed(1),
        avgInvestment: avgInvestment.toFixed(4),
        avgLeverage,
        avgMinPrice,
        avgMaxPrice,
      });
    }
  });

  nonHedgedSymbols.sort(
    (a, b) => parseFloat(b.longPct) - parseFloat(a.longPct)
  );

  return nonHedgedSymbols;
}

/**
 * Calculate global long/short ratio
 */
function calculateGlobalRatio(symbolGroups) {
  let global_long = 0;
  let global_short = 0;

  for (let symbol in symbolGroups) {
    global_long += symbolGroups[symbol].long;
    global_short += symbolGroups[symbol].short;
  }

  const total_global = global_long + global_short;
  if (total_global === 0) {
    return null;
  }

  const global_long_pct = (global_long / total_global) * 100;

  return {
    global_long,
    global_short,
    total_global,
    global_long_pct,
  };
}

/**
 * Filter processable symbols based on balance
 */
function filterProcessableSymbols(
  nonHedgedSymbols,
  balance,
  partialMin = null
) {
  if (partialMin === null) {
    return nonHedgedSymbols.filter(
      (item) => Number(item.avgInvestment) <= Number(balance)
    );
  } else {
    return nonHedgedSymbols.filter(
      (item) =>
        Number(item.avgInvestment) <= Number(balance) ||
        Number(balance) >= partialMin
    );
  }
}

module.exports = {
  calculateHedgingStatus,
  identifyNonHedgedSymbols,
  calculateGlobalRatio,
  filterProcessableSymbols,
};
