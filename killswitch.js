require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fs = require("node:fs");

const token = process.env.TOKEN;
const TGbot = new TelegramBot(token, { polling: false });
const USER_CHAT_ID = process.env.USER_CHAT_ID;

let rateLimitedUntil = 0;
let messageQueue = [];

const sendTGMessageInternal = async (message) => {
  try {
    return await TGbot.sendMessage(USER_CHAT_ID, message);
  } catch (error) {
    throw error; // Re-throw for handling in sendTGMessage
  }
};

const processQueue = async () => {
  while (messageQueue.length > 0 && Date.now() >= rateLimitedUntil) {
    const msg = messageQueue.shift();
    try {
      await sendTGMessageInternal(msg);
    } catch (error) {
      if (error.response && error.response.statusCode === 429) {
        const retryAfter =
          parseInt(error.response.body.parameters?.retry_after) || 1;
        rateLimitedUntil = Date.now() + retryAfter * 1000;
        messageQueue.unshift(msg); // Put back to front
        setTimeout(processQueue, retryAfter * 1000);
        return;
      } else {
        console.log("error in sending queued message", msg, error);
      }
    }
  }
};

const sendTGMessage = async (message) => {
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
    await sendTGMessageInternal(message);
  } catch (error) {
    if (error.response && error.response.statusCode === 429) {
      // Rate limit error
      const retryAfter =
        parseInt(error.response.body.parameters?.retry_after) || 1;
      rateLimitedUntil = Date.now() + retryAfter * 1000;
      console.log(
        `Rate limited. Deferring messages until ${new Date(
          rateLimitedUntil
        ).toISOString()}`
      );
      messageQueue.push(message);
      setTimeout(processQueue, retryAfter * 1000);
    } else {
      // Non-rate limit error, log and don't queue
      console.log("Non-rate limit error, message not queued");
    }
  }
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
    return null;
  }
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
    sendTGMessage(`ERROR: failed to close grid ${bot_id}`);
    return false;
  }
};

const main = async () => {
  console.log("Starting killswitch...");
  await sendTGMessage("Killswitch activated - closing all grids");

  const assetsResult = await getAssets();
  if (
    assetsResult?.ret_code === 0 &&
    assetsResult.result?.status_code === 200
  ) {
    const bots = assetsResult.result.assets;
    console.log(`Found ${bots.length} bots to close.`);
    let closedCount = 0;
    for (let bot of bots) {
      console.log(`Closing bot ${bot.bot_id}`);
      const success = await closeGrid(bot.bot_id);
      if (success) {
        closedCount++;
      }
      // Delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    await sendTGMessage(
      `Killswitch complete. Closed ${closedCount} out of ${bots.length} grids.`
    );
  } else {
    console.error("ERROR: Failed to get assets", assetsResult);
    await sendTGMessage("ERROR: Failed to get list of bots for killswitch");
  }
};

main().catch((error) => {
  console.error("Killswitch error:", error);
  sendTGMessage(`Killswitch error: ${error.message}`);
});
