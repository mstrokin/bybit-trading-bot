const { bybitGet } = require("./http-client");

/**
 * Market data operations module
 */

/**
 * Get ticker information including price and decimals
 */
async function getTicker(symbol) {
  try {
    const priceData = await bybitGet(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`
    );

    const currentPrice =
      priceData?.retCode === 0
        ? parseFloat(priceData.result.list[0].lastPrice)
        : 0;

    if (currentPrice <= 0) return { price: 0, decimals: 8 };

    // Fetch instrument info for tickSize to determine decimals
    const instData = await bybitGet(
      `https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=${symbol}`
    );

    let decimals = 8;
    if (instData?.retCode === 0 && instData.result.list.length > 0) {
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
}

/**
 * Get current price for a symbol (simple version)
 */
async function getCurrentPrice(symbol) {
  try {
    const data = await bybitGet(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`
    );
    if (data?.retCode === 0) {
      return parseFloat(data.result.list[0].lastPrice);
    }
  } catch (error) {
    console.error("Error fetching price for " + symbol + ":", error);
  }
  return null;
}

module.exports = {
  getTicker,
  getCurrentPrice,
};
