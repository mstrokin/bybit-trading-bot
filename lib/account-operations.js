const { bybitPost } = require("./http-client");
const { getTelegramClient } = require("./telegram-client");
const { toFourDecimals } = require("./utils");

/**
 * Account and balance operations module
 */

/**
 * Get USD futures trading balance
 */
async function getUSDFuturesTradingBalance() {
  const tgClient = getTelegramClient();
  const payload = {
    coin: "USDT",
    bot_type: "BOT_TYPE_ENUM_GRID_FUTURES",
  };

  const data = await bybitPost(
    "https://api2-2.bybit.com/contract/v5/fgridbot/get-user-balance?_sp_category=fbu&_sp_response_format=portugal",
    payload
  );

  if (!data) {
    await tgClient.send("ERROR: failed to get usd futures trading balance");
  }
  return data;
}

/**
 * Get USD futures balance (formatted)
 */
async function getUSDFuturesBalance() {
  const usd_assets = await getUSDFuturesTradingBalance();
  if (usd_assets?.ret_code !== 0) {
    console.error("ERROR:", JSON.stringify(usd_assets));
    return null;
  }
  if (usd_assets.result?.status_code !== 200) {
    console.error("ERROR:", JSON.stringify(usd_assets));
    return null;
  }
  return toFourDecimals(usd_assets.result.balance);
}

/**
 * Get USD assets summary
 */
async function getUSDAssets() {
  const tgClient = getTelegramClient();
  const payload = {
    page: 0,
    limit: 50,
  };

  const data = await bybitPost(
    "https://api2.bybit.com/bot-api-summary/v5/private/query-asset-summary",
    payload
  );

  if (!data) {
    await tgClient.send("ERROR: failed to get usd assets");
  }
  return data;
}

/**
 * Get USD balance summary
 */
async function getUSDBalance() {
  const usd_assets = await getUSDAssets();
  if (usd_assets?.ret_code !== 0) {
    console.error("ERROR:", JSON.stringify(usd_assets));
    return null;
  }
  if (usd_assets.result?.status_code !== 200) {
    console.error("ERROR:", JSON.stringify(usd_assets));
    return null;
  }
  return usd_assets.result.asset_summary;
}

/**
 * Get assets (grid bots)
 */
async function getAssets() {
  const tgClient = getTelegramClient();
  const payload = {
    page: 0,
    limit: 50,
  };

  const data = await bybitPost(
    "https://api2.bybit.com/s1/bot/fgrid/v1/get-fgrid-assets-list",
    payload
  );

  if (!data) {
    await tgClient.send("failed to get assets");
  }
  return data;
}

/**
 * Get position size for a symbol
 */
async function getPositionSize(symbol) {
  let position_size = 0;
  const assetsResult = await getAssets();

  if (
    assetsResult?.ret_code === 0 &&
    assetsResult.result?.status_code === 200
  ) {
    const bots = assetsResult.result.assets;
    const symbolBots = bots.filter((bot) => bot.symbol === symbol);
    symbolBots.forEach((bot) => {
      position_size += Number(parseFloat(bot.current_position));
    });
  } else {
    console.error(
      "ERROR fetching assets for position size:",
      JSON.stringify(assetsResult)
    );
  }
  return position_size;
}

module.exports = {
  getUSDFuturesTradingBalance,
  getUSDFuturesBalance,
  getUSDAssets,
  getUSDBalance,
  getAssets,
  getPositionSize,
};
