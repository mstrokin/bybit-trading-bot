require("dotenv").config();
const config = require("./config");
const TelegramBot = require("node-telegram-bot-api");
const {
  getTicker,
  validateGrid,
  createGrid,
  getUSDFuturesBalance,
  sleep,
  sendTGMessage,
  getHeaders,
} = require("./lib/bybit-utils");

const token = process.env.TOKEN;
if (!token) {
  console.error("TOKEN not set in .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const USER_CHAT_ID = process.env.USER_CHAT_ID;

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== USER_CHAT_ID) {
    bot.sendMessage(chatId, "Unauthorized.");
    return;
  }

  const keyboard = config.symbols.map((symbol) => [
    { text: symbol, callback_data: `symbol:${symbol}` },
  ]);
  const opts = {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  };

  bot.sendMessage(chatId, "Select a currency:", opts);
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  if (chatId.toString() !== USER_CHAT_ID) {
    bot.answerCallbackQuery(query.id, { text: "Unauthorized." });
    return;
  }

  const data = query.data;
  bot.answerCallbackQuery(query.id);

  if (data.startsWith("symbol:")) {
    const symbol = data.split(":")[1];
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "PUMP EEET", callback_data: `pump:${symbol}` }],
          [{ text: "DUMP EEET", callback_data: `dump:${symbol}` }],
        ],
      },
    };
    bot.sendMessage(chatId, `Selected ${symbol}. Choose action:`, opts);
    return;
  }

  if (data.startsWith("pump:") || data.startsWith("dump:")) {
    const [action, symbol] = data.split(":");
    const isShort = action === "dump";
    const gridMode = isShort
      ? "FUTURE_GRID_MODE_SHORT"
      : "FUTURE_GRID_MODE_LONG";
    const gridType = "FUTURE_GRID_TYPE_GEOMETRIC";
    const leverage = 20;
    const baseGap = 0.05; // 5% base range
    const offsetStep = 0.01; // 1% offset step
    const numGrids = 5;
    const investmentPerGrid = config.minInvestment; // 1.0 USDT per grid

    const { price: currentPrice, decimals } = await getTicker(symbol);
    if (currentPrice <= 0) {
      bot.sendMessage(
        chatId,
        `Error: Unable to fetch current price for ${symbol}. Please try again later.`
      );
      return;
    }

    let totalRequiredInvestment = 0;
    let gridDetails = [];
    // Pre-validate all grids to estimate total investment
    for (let i = 0; i < numGrids; i++) {
      const offset = (i - numGrids / 2) * offsetStep;
      const minPrice = Number(currentPrice * (1 + offset - baseGap)).toFixed(
        decimals
      );
      const maxPrice = Number(currentPrice * (1 + offset + baseGap)).toFixed(
        decimals
      );

      const initialValidation = await validateGrid(
        symbol,
        minPrice,
        maxPrice,
        gridMode,
        gridType,
        config.minGrids,
        leverage
      );
      if (!initialValidation || !initialValidation.cell_number) continue;

      let cellNumber = initialValidation.cell_number.to;
      let finalValidation;
      let attempts = 0;
      const maxAttempts = 5;
      let matched = false;
      while (attempts < maxAttempts) {
        finalValidation = await validateGrid(
          symbol,
          minPrice,
          maxPrice,
          gridMode,
          gridType,
          cellNumber,
          leverage
        );
        if (!finalValidation || !finalValidation.cell_number) {
          finalValidation = null;
          break;
        }
        const returnedCellNumber = finalValidation.cell_number.to;
        if (returnedCellNumber === cellNumber) {
          matched = true;
          break;
        } else {
          cellNumber = returnedCellNumber;
          attempts++;
        }
      }
      if (
        !finalValidation ||
        !finalValidation.investment ||
        !finalValidation.investment.from ||
        Number(finalValidation.investment.from) <= 0 ||
        !matched
      )
        continue;

      const estimatedInvestment = Number(finalValidation.investment.from) * 1.1; // Add 10% buffer
      totalRequiredInvestment += estimatedInvestment;
    }

    const balance = await getUSDFuturesBalance();
    if (balance < totalRequiredInvestment) {
      bot.sendMessage(
        chatId,
        `Insufficient balance for ${symbol} ${action.toUpperCase()} action.\nCurrent balance: $${balance.toFixed(
          2
        )}\nRequired: $${totalRequiredInvestment.toFixed(
          2
        )} for ${numGrids} grids (with 10% buffer).\nCurrent price: $${currentPrice.toFixed(
          decimals
        )}`
      );
      return;
    }

    let successCount = 0;
    // Now create the grids
    for (let i = 0; i < numGrids; i++) {
      const offset = (i - numGrids / 2) * offsetStep; // Offsets: -2%, -1%, 0%, 1%, 2%
      const minPrice = Number(currentPrice * (1 + offset - baseGap)).toFixed(
        decimals
      );
      const maxPrice = Number(currentPrice * (1 + offset + baseGap)).toFixed(
        decimals
      );

      const initialValidation = await validateGrid(
        symbol,
        minPrice,
        maxPrice,
        gridMode,
        gridType,
        config.minGrids,
        leverage
      );
      if (!initialValidation || !initialValidation.cell_number) {
        console.log(
          `Initial validation failed for grid ${
            i + 1
          } on ${symbol} (range: ${minPrice}-${maxPrice})`
        );
        gridDetails.push(`Grid ${i + 1}: Initial validation failed`);
        continue;
      }

      let cellNumber = initialValidation.cell_number.to;
      console.log(
        `Initial cell number for final validation: ${cellNumber} for grid ${
          i + 1
        }`
      );
      let finalValidation;
      let attempts = 0;
      const maxAttempts = 5;
      let matched = false;
      while (attempts < maxAttempts) {
        finalValidation = await validateGrid(
          symbol,
          minPrice,
          maxPrice,
          gridMode,
          gridType,
          cellNumber,
          leverage
        );
        if (!finalValidation || !finalValidation.cell_number) {
          finalValidation = null;
          break;
        }
        const returnedCellNumber = finalValidation.cell_number.to;
        if (returnedCellNumber >= cellNumber) {
          matched = true;
          console.log(
            `Cell number matched at ${cellNumber} after ${
              attempts + 1
            } attempt(s) for grid ${i + 1}`
          );
          break;
        } else {
          console.log(
            `Cell number adjusted from ${cellNumber} to ${returnedCellNumber} on attempt ${
              attempts + 1
            } for grid ${i + 1}`
          );
          cellNumber = returnedCellNumber;
          attempts++;
        }
      }
      if (
        !finalValidation ||
        !finalValidation.investment ||
        !finalValidation.investment.from ||
        Number(finalValidation.investment.from) <= 0 ||
        !matched
      ) {
        console.log(
          `Final validation failed for grid ${
            i + 1
          } on ${symbol} (range: ${minPrice}-${maxPrice}, cells: ${cellNumber}, investment: ${
            finalValidation?.investment?.from || "invalid"
          }, attempts: ${attempts})`
        );
        gridDetails.push(
          `Grid ${
            i + 1
          }: Final validation failed (invalid investment or did not stabilize)`
        );
        continue;
      }

      let baseInvestment = Number(finalValidation.investment.from);
      // Adjust investment if needed (e.g., ensure min, but already checked >0)
      baseInvestment = Math.max(baseInvestment, investmentPerGrid / 1.1); // Ensure base before buffer meets min
      const actualInvestment = baseInvestment * 1.1; // 10% buffer

      const created = await createGrid(
        actualInvestment,
        symbol,
        minPrice,
        maxPrice,
        cellNumber,
        leverage,
        gridMode,
        gridType
      );

      if (created) {
        successCount++;
        gridDetails.push(
          `Grid ${
            i + 1
          }: Success (${minPrice}-${maxPrice}, ${cellNumber} cells, $${actualInvestment.toFixed(
            4
          )})`
        );
        console.log(
          `Created ${action} grid ${
            i + 1
          } for ${symbol}: ${minPrice}-${maxPrice} (${cellNumber} cells, base $${baseInvestment.toFixed(
            4
          )}, actual $${actualInvestment.toFixed(4)})`
        );
      } else {
        gridDetails.push(`Grid ${i + 1}: Creation failed`);
        console.log(
          `Failed to create ${action} grid ${
            i + 1
          } for ${symbol} (range: ${minPrice}-${maxPrice}, cells: ${cellNumber}, base investment: $${baseInvestment.toFixed(
            4
          )}, actual: $${actualInvestment.toFixed(4)})`
        );
      }

      await sleep(1000); // Delay between grid creations
    }

    const directionText = isShort ? "short (DUMP)" : "long (PUMP)";
    bot.sendMessage(
      chatId,
      `Action "${action.toUpperCase()}" completed for ${symbol} (${directionText}).\n` +
        `Current price: $${currentPrice.toFixed(decimals)}\n` +
        `Base range: ±${(baseGap * 100).toFixed(1)}% with ${
          offsetStep * 100
        }% offsets\n` +
        `Leverage: ${leverage}x | Investment per grid: $${investmentPerGrid}\n` +
        `Grids created: ${successCount}/${numGrids}\n` +
        `Details:\n${gridDetails.join("\n")}\n` +
        `Remaining balance: $${Number(balance).toFixed(2)}`
    );
  }
});

console.log("TG Trading Bot started...");
