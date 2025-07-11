const TelegramBot = require("node-telegram-bot-api");
const token = ""; //TODO: ADD YOUR BOT TOKEN HERE
//const TGbot = new TelegramBot(token, { polling: true });
const fs = require("node:fs");
const USER_CHAT_ID = ""; //TODO: ADD YOUR TG ID HERE

const sendTGMessage = async (message) => {
  //return await TGbot.sendMessage(USER_CHAT_ID, message);
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
  myHeaders.append("referer", "https://www.bybit.com/");
  myHeaders.append("sec-fetch-dest", "empty");
  myHeaders.append("sec-fetch-mode", "cors");
  myHeaders.append("sec-fetch-site", "same-site");
  return myHeaders;
};

const BOTS_PER_PAGE = 50;

const getBots = async (page) => {
  const raw = JSON.stringify({
    status: 1,
    page: page,
    limit: BOTS_PER_PAGE,
    type: "GRID_FUTURES",
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };

  const futuresGridRes = await fetch(
    "https://api2.bybit.com/s1/bot/tradingbot/v1/list-all-bots",
    requestOptions
  );
  const futuresGrid = await futuresGridRes.json();
  return futuresGrid.result.bots;
};

const listAllBots = async (page) => {
  const bots = await getBots(page);
  let sum_total_plus = 0;
  let sum_total_minus = 0;
  let sum_total_minus_liquidated = 0;
  let sum_total_minus_cancelled = 0;

  let sales_total_plus = 0;
  let sales_total_minus = 0;

  let bot_total_plus = 0;
  let bot_total_minus = 0;
  let bot_total_minus_liquidated = 0;
  let bot_total_minus_cancelled = 0;

  bots.map((bot) => {
    if (Number(bot.future_grid.pnl) >= 0) {
      sum_total_plus += Number(bot.future_grid.pnl);
      sales_total_plus += Number(bot.future_grid.arbitrage_num);
      bot_total_plus = bot_total_plus + 1;
    } else {
      //console.log("lost", bot.close_detail);
      sum_total_minus += Number(bot.future_grid.pnl);
      sales_total_minus += Number(bot.future_grid.arbitrage_num);
      bot_total_minus = bot_total_minus + 1;

      if (
        bot.future_grid.close_detail.bot_close_code ===
        "BOT_CLOSE_CODE_CANCELED_AUTO_LIQ"
      ) {
        bot_total_minus_liquidated = bot_total_minus_liquidated + 1;
        sum_total_minus_liquidated += Number(bot.future_grid.pnl);
      }
      if (
        bot.future_grid.close_detail.bot_close_code ===
        "BOT_CLOSE_CODE_CANCELED_MANUALLY"
      ) {
        if (Number(bot.future_grid.pnl) < 1) {
          //console.log(bot);
        }
        bot_total_minus_cancelled = bot_total_minus_cancelled + 1;
        sum_total_minus_cancelled += Number(bot.future_grid.pnl);
      }
    }
  });
  //console.log(`Stats after ${bots.length} :`);

  console.log(
    "Balance = ",
    (Number(sum_total_plus) + Number(sum_total_minus)).toFixed(2)
  );
  console.log("Total Won PNL = ", Number(sum_total_plus).toFixed(2));
  console.log("Total Won = ", Number(bot_total_plus).toFixed(0));
  console.log("Total Lost PNL = ", Number(sum_total_minus).toFixed(2));
  console.log("Total Lost = ", Number(bot_total_minus).toFixed(0));
  console.log(
    "Total Liquidated = ",
    Number(bot_total_minus_liquidated).toFixed(0)
  );
  console.log(
    "Total Liquidated Lost = ",
    Number(sum_total_minus_liquidated).toFixed(2)
  );
  console.log(
    "Total Cancelled = ",
    Number(bot_total_minus_cancelled).toFixed(0)
  );
  console.log(
    "Total Cancelled Lost = ",
    Number(sum_total_minus_cancelled).toFixed(2)
  );

  console.log(
    `Winrate = ${((Number(bot_total_plus) / Number(bots.length)) * 100).toFixed(
      2
    )}%`
  );
  return true;
};
const main = async () => {
  console.log(`Last ${BOTS_PER_PAGE} stats:`);
  await listAllBots(0);
  console.log("----");
  console.log(`Previous ${BOTS_PER_PAGE} stats:`);
  await listAllBots(1);
  console.log("----");
  //console.log(`Old ${BOTS_PER_PAGE} stats:`);
  //await listAllBots(2);
};
main();
