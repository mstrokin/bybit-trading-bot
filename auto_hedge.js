require("dotenv").config();
const fs = require("node:fs");
const readline = require("readline");
var clc = require("cli-color");
const { validateGrid, createGrid, getTicker } = require("./lib/bybit-utils");

const path = process.cwd();
const BYBIT_COOKIE = fs.readFileSync(`${path}/BYBIT_COOKIE`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

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

const getListOfGrids = async () => {
  const raw = JSON.stringify({
    page: 0,
    limit: 100,
    status: "2",
  });

  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };
  try {
    const res = await fetch(
      "https://api2-2.bybit.com/s1/bot/fgrid/v1/get-fgrid-list",
      requestOptions
    );
    return await res.json();
  } catch (error) {
    console.error("failed to get list of grids");
    return null;
  }
};

const main = async () => {
  const gridsResult = await getListOfGrids();
  if (!gridsResult || gridsResult.ret_code !== 0) {
    console.error("ERROR:", JSON.stringify(gridsResult));
    rl.close();
    return;
  }
  if (gridsResult.result?.status_code !== 200) {
    console.error("ERROR:", JSON.stringify(gridsResult));
    rl.close();
    return;
  }
  const grids = gridsResult.result.grids;
  if (!grids || !grids.length) {
    console.log("No grids found");
    rl.close();
    return;
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
      if (majorityGrids.length === 0) return; // No majority grids to copy from

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

  if (nonHedgedSymbols.length === 0) {
    console.log(clc.green("All positions are properly hedged!"));
    rl.close();
    return;
  }

  console.log(
    clc.yellow(`Found ${nonHedgedSymbols.length} non-hedged symbols:`)
  );
  nonHedgedSymbols.forEach((item, index) => {
    console.log(
      `${index + 1}. ${item.symbol}: ${item.longPct}% long (majority ${
        item.majoritySide
      }, suggest adding ${item.minoritySide} hedge)`
    );
  });

  const hedge_shift = 0.01; // 1% shift
  const grid_type = "FUTURE_GRID_TYPE_GEOMETRIC";

  for (let item of nonHedgedSymbols) {
    // Fetch current price and decimals first
    const { price: currentPrice, decimals } = await getTicker(item.symbol);
    if (currentPrice <= 0) {
      console.log(
        clc.red(`Could not fetch current price for ${item.symbol}, skipping.`)
      );
      continue;
    }

    // Round averages to decimals
    const avgMinPriceRounded = Number(item.avgMinPrice).toFixed(decimals);
    const avgMaxPriceRounded = Number(item.avgMaxPrice).toFixed(decimals);

    // Calculate relative width from existing majority range
    const avgCenter =
      (Number(avgMinPriceRounded) + Number(avgMaxPriceRounded)) / 2;
    const relativeWidth =
      (Number(avgMaxPriceRounded) - Number(avgMinPriceRounded)) / avgCenter;

    // Shifted center around current price in minority direction
    let shiftedCenter;
    if (item.minoritySide === "LONG") {
      shiftedCenter = currentPrice * (1 + hedge_shift);
    } else {
      shiftedCenter = currentPrice * (1 - hedge_shift);
    }

    // New range around shifted center with same relative width
    const halfRel = relativeWidth / 2;
    const new_min_price = Number(shiftedCenter * (1 - halfRel)).toFixed(
      decimals
    );
    const new_max_price = Number(shiftedCenter * (1 + halfRel)).toFixed(
      decimals
    );

    const leverage = item.avgLeverage;
    const amount = item.avgInvestment;

    // Initial validation with high cell number to get max possible
    let validation = await validateGrid(
      item.symbol,
      new_min_price,
      new_max_price,
      item.minoritySide === "LONG"
        ? "FUTURE_GRID_MODE_LONG"
        : "FUTURE_GRID_MODE_SHORT",
      grid_type,
      3, // Start high to get max
      leverage
    );
    //console.log("Initial validate = ", validation);

    if (!validation) {
      console.log(
        clc.red(`Initial validation failed for ${item.symbol}, skipping.`)
      );
      continue;
    }

    let cell_number = validation.cell_number.to;
    if (cell_number < 3) {
      // Min sensible
      console.log(clc.red(`Insufficient cells for ${item.symbol}, skipping.`));
      continue;
    }

    // Run finalValidation up to 3 times to stabilize cell_number
    let finalValidation;
    let prevCellNumber = 0;
    for (let retry = 0; retry < 3; retry++) {
      finalValidation = await validateGrid(
        item.symbol,
        new_min_price,
        new_max_price,
        item.minoritySide === "LONG"
          ? "FUTURE_GRID_MODE_LONG"
          : "FUTURE_GRID_MODE_SHORT",
        grid_type,
        cell_number,
        leverage
      );
      console.log(
        `Validation retry ${retry + 1}: cell_number = ${cell_number}`
      );

      if (!finalValidation) {
        console.log(
          clc.red(
            `Validation retry ${retry + 1} failed for ${item.symbol}, skipping.`
          )
        );
        break;
      }

      const newCellNumber = finalValidation.cell_number.to;
      if (
        newCellNumber >= cell_number &&
        finalValidation.investment.from !== "0"
      ) {
        console.log("Cell number stabilized", cell_number);
        cell_number = cell_number;
        break; // Stabilized
      }

      prevCellNumber = cell_number;
      cell_number = newCellNumber;
      console.log("Cell number set to ", cell_number);
    }

    if (!finalValidation || !finalValidation.investment?.from) {
      console.log(
        clc.red(
          `Could not determine investment after retries for ${item.symbol}, skipping.`
        )
      );
      continue;
    }

    // Use same amount, but ensure it's above min investment
    let finalAmount = Math.max(
      Number(amount),
      Number(finalValidation.investment.from) * 1.1
    );
    const grid_mode =
      item.minoritySide === "LONG"
        ? "FUTURE_GRID_MODE_LONG"
        : "FUTURE_GRID_MODE_SHORT";

    let currentPriceStr =
      currentPrice > 0 ? `$${currentPrice.toFixed(decimals)}` : "N/A";

    const prompt = `Create ${grid_mode.replace(
      "FUTURE_GRID_MODE_",
      ""
    )} hedge for ${
      item.symbol
    }?\nCurrent Price: ${currentPriceStr}\nAmount: $${finalAmount.toFixed(
      4
    )}, Range: ${new_min_price}-${new_max_price}, Leverage: ${leverage}x, Cells: ${cell_number} (y/n): `;
    const answer = await question(prompt);
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      console.log(
        `Creating ${grid_mode.replace("FUTURE_GRID_MODE_", "")} hedge for ${
          item.symbol
        }...`
      );
      const success = await createGrid(
        finalAmount,
        item.symbol,
        new_min_price,
        new_max_price,
        cell_number,
        leverage,
        grid_mode,
        grid_type
      );
      if (success) {
        console.log(
          clc.green(`Successfully created hedge grid for ${item.symbol}!`)
        );
      } else {
        console.log(clc.red(`Failed to create hedge grid for ${item.symbol}.`));
      }
    } else {
      console.log(`Skipped ${item.symbol}.`);
    }
  }

  rl.close();
};

main();
