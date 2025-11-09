const express = require("express");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const {
  getTicker,
  validateGrid,
  createGrid,
  getUSDFuturesBalance,
  sleep,
} = require("./lib/bybit-utils");

const app = express();
const PORT = 3001;

app.use(express.static(".")); // Serve static files like HTML
app.use(express.json()); // Parse JSON bodies

app.get("/api/status", (req, res) => {
  try {
    const files = fs
      .readdirSync(".")
      .filter((file) => file.endsWith("_farm_cache.json"));
    let status = { latest: null, totals: { totalSales: 0, totalBotProfit: 0 } };
    let maxTimestamp = 0;
    let totalSales = 0;
    let totalBotProfit = 0;

    if (files.length === 0) {
      return res.json({ error: "No active farm caches found." });
    }

    // Find newest file for latest stats
    files.forEach((file) => {
      const cacheData = JSON.parse(fs.readFileSync(file, "utf8"));
      if (cacheData.timestamp > maxTimestamp) {
        maxTimestamp = cacheData.timestamp;
        status.latest = {
          symbol: cacheData.symbol,
          bots: cacheData.bots,
          tradingBalance: cacheData.tradingBalance,
          profit: cacheData.profit,
          accountSize: cacheData.accountSize,
        };
      }
      // Aggregate totals
      totalSales += cacheData.sales || 0;
      totalBotProfit += parseFloat(cacheData.totalProfit || 0);
    });

    status.totals.totalSales = totalSales;
    status.totals.totalBotProfit = totalBotProfit.toFixed(2);

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: "Error reading farm status." });
  }
});

app.get("/api/symbols", (req, res) => {
  res.json(config.symbols);
});

app.post("/api/action", async (req, res) => {
  const { action, symbol } = req.body;
  if (!action || !symbol) {
    return res.status(400).json({ error: "Action and symbol required." });
  }

  const isShort = action === "dump";
  const gridMode = isShort ? "FUTURE_GRID_MODE_SHORT" : "FUTURE_GRID_MODE_LONG";
  const gridType = "FUTURE_GRID_TYPE_GEOMETRIC";
  const leverage = 20;
  const baseGap = 0.05; // 5% base range
  const offsetStep = 0.01; // 1% offset step
  const numGrids = 5;
  const investmentPerGrid = config.minInvestment; // 1.0 USDT per grid

  try {
    const { price: currentPrice, decimals } = await getTicker(symbol);

    if (currentPrice <= 0) {
      return res
        .status(500)
        .json({ error: `Unable to fetch current price for ${symbol}.` });
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

    const balance = Number(await getUSDFuturesBalance());
    if (balance < totalRequiredInvestment) {
      return res.status(400).json({
        error: `Insufficient balance for ${symbol} ${action.toUpperCase()} action.`,
        currentBalance: balance.toFixed(2),
        required: totalRequiredInvestment.toFixed(2),
        currentPrice: currentPrice.toFixed(decimals),
      });
    }

    let successCount = 0;
    // Now create the grids
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
      if (!initialValidation || !initialValidation.cell_number) {
        gridDetails.push(`Grid ${i + 1}: Initial validation failed`);
        continue;
      }

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
        if (returnedCellNumber >= cellNumber) {
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
      ) {
        gridDetails.push(`Grid ${i + 1}: Final validation failed`);
        continue;
      }

      let baseInvestment = Number(finalValidation.investment.from);
      baseInvestment = Math.max(baseInvestment, investmentPerGrid / 1.1);
      const actualInvestment = baseInvestment * 1.1;

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
      } else {
        gridDetails.push(`Grid ${i + 1}: Creation failed`);
      }

      await sleep(1000); // Delay between creations
    }

    const directionText = isShort ? "short (DUMP)" : "long (PUMP)";
    res.json({
      success: true,
      message: `Action "${action.toUpperCase()}" completed for ${symbol} (${directionText}). Grids created: ${successCount}/${numGrids}`,
      currentPrice: currentPrice.toFixed(decimals),
      details: gridDetails,
      remainingBalance: balance.toFixed(2),
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Failed to perform action: " + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Status server running at http://localhost:${PORT}`);
  console.log(
    `Open http://localhost:${PORT}/farm-status.html to view the dashboard.`
  );
});
