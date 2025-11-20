require("dotenv").config();
const fs = require("node:fs");
var Table = require("cli-table");
var clc = require("cli-color");

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
  }
};

const main = async () => {
  const gridsResult = await getListOfGrids();
  if (!gridsResult || gridsResult.ret_code !== 0) {
    console.error("ERROR:", JSON.stringify(gridsResult));
    return;
  }
  if (gridsResult.result?.status_code !== 200) {
    console.error("ERROR:", JSON.stringify(gridsResult));
    return;
  }
  const grids = gridsResult.result.grids;
  if (!grids || !grids.length) {
    console.log("No grids found");
    return;
  }

  // Compute hedging status and ratios per symbol
  const hedgingStatus = {};
  const symbolGroups = {};
  let globalLong = 0;
  let globalShort = 0;
  grids.forEach((grid) => {
    const symbol = grid.symbol;
    if (!symbolGroups[symbol]) {
      symbolGroups[symbol] = { long: 0, short: 0 };
    }
    const investment = Number(grid.total_investment || 0);
    if (grid.grid_mode && grid.grid_mode.includes("SHORT")) {
      symbolGroups[symbol].short += investment;
      globalShort += investment;
    } else if (grid.grid_mode && grid.grid_mode.includes("LONG")) {
      symbolGroups[symbol].long += investment;
      globalLong += investment;
    }
  });

  Object.keys(symbolGroups).forEach((symbol) => {
    const { long, short } = symbolGroups[symbol];
    const total = long + short;
    if (total === 0) {
      hedgingStatus[symbol] = false; // No positions
      return;
    }
    const longPct = (long / total) * 100;
    hedgingStatus[symbol] = longPct >= 40 && longPct <= 60;
  });

  const globalTotal = globalLong + globalShort;
  const globalLongPct = globalTotal > 0 ? (globalLong / globalTotal) * 100 : 0;

  // Sort by symbol
  grids.sort((a, b) => a.symbol.localeCompare(b.symbol));

  var table = new Table({
    head: [
      "Bot ID",
      "Symbol",
      "Mode",
      "Leverage",
      "Cells",
      "Total Inv.",
      "Initial Inv.",
      "Min Price",
      "Max Price",
      "Sales",
      "PnL %",
    ],
    colWidths: [15, 15, 15, 8, 8, 12, 12, 10, 10, 8, 8],
    style: { head: ["cyan"] },
  });

  for (let grid of grids) {
    const mode = grid.grid_mode
      ? grid.grid_mode.replace(/FUTURE_GRID_MODE_/, "")
      : "";
    const pnlPercent = Number(grid.pnl_per * 100).toFixed(2);
    let pnlText = `${pnlPercent}%`;
    if (Number(pnlPercent) < -10) {
      pnlText = clc.red(pnlText);
    }
    let symbolText = grid.symbol || "";
    const symbol = grid.symbol;
    if (symbol && !hedgingStatus[symbol]) {
      symbolText = clc.yellowBright(symbolText);
    }
    let totalInvText = `$${Number(grid.total_investment || 0).toFixed(4)}`;
    if (Number(grid.total_investment || 0) < 0.5) {
      totalInvText = clc.cyan(totalInvText);
    }
    let initialInvText = `$${Number(grid.initial_investment || 0).toFixed(4)}`;
    if (Number(grid.initial_investment || 0) < 0.5) {
      initialInvText = clc.cyan(initialInvText);
    }
    table.push([
      grid.bot_id || "",
      symbolText,
      mode,
      `${grid.leverage}x` || "",
      grid.cell_number || "",
      totalInvText,
      initialInvText,
      grid.min_price || "",
      grid.max_price || "",
      grid.arbitrage_num || 0,
      pnlText,
    ]);
  }

  console.log(table.toString());
  console.log(`Total grids: ${grids.length}`);

  // Global ratio
  console.log("\n" + clc.magenta("Global Long/Short Ratio:"));
  console.log(
    `Long: $${globalLong.toFixed(2)} (${globalLongPct.toFixed(
      1
    )}%) | Short: $${globalShort.toFixed(2)} (${(100 - globalLongPct).toFixed(
      1
    )}%)`
  );

  // Per-symbol ratios
  console.log("\n" + clc.magenta("Per-Symbol Long/Short Ratios:"));
  var ratioTable = new Table({
    head: ["Symbol", "Long ($)", "Short ($)", "Long %"],
    colWidths: [15, 12, 12, 8],
    style: { head: ["cyan"] },
  });

  Object.keys(symbolGroups)
    .sort()
    .forEach((symbol) => {
      const { long, short } = symbolGroups[symbol];
      const total = long + short;
      const longPct = total > 0 ? (long / total) * 100 : 0;
      let ratioText = `${longPct.toFixed(1)}%`;
      if (!hedgingStatus[symbol]) {
        ratioText = clc.yellowBright(ratioText);
      }
      ratioTable.push([
        symbol,
        `$${long.toFixed(2)}`,
        `$${short.toFixed(2)}`,
        ratioText,
      ]);
    });

  console.log(ratioTable.toString());
};

main();
