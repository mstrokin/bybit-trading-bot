const { bybitPost } = require("./http-client");
const { getTelegramClient } = require("./telegram-client");

/**
 * Grid bot operations module
 */

/**
 * Validate grid configuration
 */
async function validateGrid(
  symbol,
  min_price,
  max_price,
  grid_mode,
  grid_type,
  cell_number,
  leverage
) {
  const payload = {
    symbol,
    min_price: String(min_price),
    max_price: String(max_price),
    grid_mode,
    grid_type,
    cell_number,
    leverage: String(leverage),
    trailing_stop_per: "",
  };

  const data = await bybitPost(
    "https://api2.bybit.com/contract/v5/fgridbot/validate-fgrid-input?_sp_category=fbu&_sp_business=usdt&_sp_response_format=portugal",
    payload
  );

  if (data?.ret_code === 0) {
    return data.result;
  }
  return null;
}

/**
 * Create a grid bot
 */
async function createGrid(
  amount,
  symbol,
  min_price,
  max_price,
  cell_number,
  leverage,
  grid_mode,
  grid_type
) {
  const tgClient = getTelegramClient();
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
    console.log(data.result);
    console.error("ERROR: ", data.result?.debug_msg);
    await tgClient.send(`ERROR: ${data.result?.debug_msg}!!!`);
    return false;
  } else if (data?.result?.bot_id == "0") {
    console.log("result= ", data);
    await tgClient.send("ERROR: Failed to create a bot!!!");
    return false;
  }

  console.log("CREATED?", data?.result);
  return !!data;
}

/**
 * Close a grid bot
 */
async function closeGrid(bot_id) {
  const tgClient = getTelegramClient();
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
    await tgClient.send("ERROR: failed to close grid");
    return false;
  }
}

/**
 * Get list of grid bots
 */
async function getListOfGrids(symbol = null) {
  const tgClient = getTelegramClient();
  const payload = {
    page: 0,
    limit: 100,
    status: "2",
  };

  if (symbol) {
    payload.symbol = symbol;
  }

  const data = await bybitPost(
    "https://api2-2.bybit.com/s1/bot/fgrid/v1/get-fgrid-list",
    payload
  );

  if (!data) {
    await tgClient.send("ERROR: failed to get list of grids");
    return null;
  }
  return data;
}

/**
 * Adjust margin for a grid bot
 */
async function adjustMargin(amount, bot_id) {
  const tgClient = getTelegramClient();
  const payload = {
    amount: String(amount),
    bot_id: String(bot_id),
  };

  const data = await bybitPost(
    "https://api2-2.bybit.com/contract/v5/fgridbot/add-margin?_sp_category=fbu&_sp_response_format=portugal",
    payload
  );

  if (!data) {
    await tgClient.send("ERROR: failed to adjust margin");
  }
  return data;
}

/**
 * Get grid bot details
 */
async function getGridDetails(bot_id) {
  const tgClient = getTelegramClient();
  const payload = { bot_id };

  const data = await bybitPost(
    "https://api2.bybit.com/s1/bot/fgrid/v1/get-fgrid-detail",
    payload
  );

  if (data?.result?.detail) {
    return data.result.detail;
  }

  await tgClient.send(`failed to get grid ${bot_id} details`);
  return null;
}

/**
 * Get grid bot open orders
 */
async function getGridOpenOrders(bot_id) {
  const tgClient = getTelegramClient();
  const payload = {
    bot_id,
    limit: 200,
  };

  const data = await bybitPost(
    "https://api2.bybit.com/s1/bot/fgrid/v1/get-fgrid-open-orders",
    payload
  );

  if (data?.result) {
    return data.result;
  }

  await tgClient.send(`failed to get grid ${bot_id} open orders`);
  return null;
}

/**
 * Get withdraw details for a grid bot
 */
async function getWithdrawDetail(bot_id) {
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
}

/**
 * Withdraw profit from a grid bot
 */
async function withdrawProfit(bot_id, amount) {
  const tgClient = getTelegramClient();
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
    await tgClient.send(
      `Successfully withdrew $${Number(amount).toFixed(
        4
      )} from bot ${bot_id} to futures balance`
    );
    return true;
  } else {
    console.error("Error withdrawing:", data);
    await tgClient.send(
      `ERROR: failed to withdraw $${Number(amount).toFixed(
        4
      )} from bot ${bot_id}: ${data?.ret_msg || "Unknown error"}`
    );
    return false;
  }
}

module.exports = {
  validateGrid,
  createGrid,
  closeGrid,
  getListOfGrids,
  adjustMargin,
  getGridDetails,
  getGridOpenOrders,
  getWithdrawDetail,
  withdrawProfit,
};
