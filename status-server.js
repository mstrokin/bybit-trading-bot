const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;

app.use(express.static(".")); // Serve static files like HTML

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

app.listen(PORT, () => {
  console.log(`Status server running at http://localhost:${PORT}`);
  console.log(
    `Open http://localhost:${PORT}/farm-status.html to view the dashboard.`
  );
});
