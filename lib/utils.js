/**
 * Common utility functions
 */

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/**
 * Parse command line arguments
 */
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

/**
 * Convert percentage to number
 */
const getNumberFromPct = (number) => {
  return Number.parseFloat(Number(number * 100).toFixed(2));
};

/**
 * Format to two decimal places
 */
const toTwoDecimals = (val) => {
  return Number(val).toFixed(2);
};

/**
 * Format to four decimal places
 */
const toFourDecimals = (val) => {
  return Number(val).toFixed(4);
};

/**
 * Get random element from array
 */
function getRandomFromArray(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Sort grids by liquidation price
 */
const sortGridsByLiquidation = (gridA, gridB) => {
  const gridProfitPercentA = getNumberFromPct(gridA.liquidation_price);
  const gridProfitPercentB = getNumberFromPct(gridB.liquidation_price);
  if (gridProfitPercentA > gridProfitPercentB) return 1;
  if (gridProfitPercentA < gridProfitPercentB) return -1;
  return 0;
};

/**
 * Sort grids by PnL percentage (descending)
 */
const sortGridsByPnl = (gridA, gridB) => {
  const pnlA = getNumberFromPct(gridA.pnl_per);
  const pnlB = getNumberFromPct(gridB.pnl_per);
  return pnlB - pnlA;
};

module.exports = {
  sleep,
  getArgs,
  getNumberFromPct,
  toTwoDecimals,
  toFourDecimals,
  getRandomFromArray,
  sortGridsByLiquidation,
  sortGridsByPnl,
};
