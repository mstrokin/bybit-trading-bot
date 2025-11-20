# 🚨 **CRITICAL WARNING: TRADING RISKS AHEAD!** 🚨

⚠️ **Funds are inherently at risk when using this software!** ⚠️

This tool interacts with Bybit's grid trading bots, which involve **high-risk activities** such as leveraged futures trading. Key risks include:

- **Slippage**: Orders may execute at worse prices than expected, especially in volatile markets, leading to unexpected losses.
- **Market Volatility**: Crypto prices can swing wildly, causing grid bots to hit liquidation prices or accumulate heavy losses.
- **Leverage Risks**: Using leverage (e.g., 10x+) amplifies both gains and losses – you could lose your entire investment quickly.
- **Platform & API Risks**: Bybit may change APIs, impose limits, or experience downtime; cookie-based auth can expire or fail.
- **No Guarantees**: This is experimental code – bugs, misconfigurations, or poor strategy could wipe out your balance.
- **Regulatory & Legal**: Trading derivatives may be restricted in your jurisdiction; this is **NOT financial advice**. Consult professionals.

**💰 Only use money you can afford to lose! Start small, test in dry-run modes, and monitor closely. The author is not liable for any losses. Proceed at your own risk! 💀**

---

# Donation address

BTC only: bc1qlwz7qu5f4xrg2gwzxjh934rvrufrldnjzpegap

# Introduction videos

[How to manipulate Bitcoin (in Russian)](https://www.youtube.com/watch?v=7bL--MIvlhs)

[How to make money in markets (in Russian)](https://www.youtube.com/watch?v=wbZp0lFCZaU)

# Installation

0. Install dependencies:

```
   yarn install
```

and have pm2 installed on your system

1. Log in into account and copy the cookie into BYBIT_COOKIE file

2. Configure Telegram bot and copy your bot token and user ID to all scripts.

# To Manipulate the market

```
1. Have $250+ in the account

2. Use
   pm2 start ./start_up.sh  # for up bots (short mode)
   or
   pm2 start ./start_down.sh  # for down bots (long mode)
```

# To Farm

```
1. Create bots (or re-use bots from the up/down scripts)

2. To watch over a bot (to farm USDT), run
   pm2 start ./start_DOGE.sh
```

Note: up/down bots now merged into `grid-bot.js` with `--direction=up|down`.

To configure currencies, bot settings, etc, copy start_DOGE.sh into a different file and adjust the settings

```
symbol -- trading pair
interval -- how often to run (in seconds)
TP -- how much profit to take for long-running bots (in %)
TPF -- how much profit to take for fresh bots (in %)
GP -- by how much $ in % grow the next grid (in %)
GG -- by how much % grow the the next grid size (in %)
BALERT -- when to start alerting about the low balance (in $)
BSTOP -- when to stop all bots (in $)
RA -- reinvestment amount
```

# Dashboard and Hedging Tools

## bybit_dashboard.js

This script displays all existing grids in a CLI table format, sorted by symbol. It includes columns for Bot ID, Symbol, Mode, Leverage, Cells, Total Inv., Initial Inv., Min Price, Max Price, Sales, and PnL %.

- **Highlights**:

  - PnL < -10% in red.
  - Unhedged symbols (outside 40-60% Long/Short balance) in yellow.
  - Dust positions (investments < $0.50) in cyan.

- **Additional Info**:
  - Global Long/Short ratio (total investments).
  - Per-symbol Long/Short ratios in a separate table, with unhedged highlighted in yellow.

Run with: `node bybit_dashboard.js`

## auto_hedge.js

This script identifies non-hedged symbols (Long/Short imbalance outside 40-60%) and prompts to create a hedging grid in the minority direction.

- **Logic**:

  - Averages investment, leverage, and range from majority-side grids.
  - Fetches current price and uses symbol-specific decimals.
  - Shifts the range center by 2% around current price in the minority direction (up for Long, down for Short), maintaining the same relative width.
  - Validates parameters up to 3 times to stabilize cell_number (max possible).
  - Ensures amount meets minimum investment.

- **Prompt**:
  - Shows current price, proposed amount, range, leverage, and cells.
  - Asks y/n for each symbol.

Run with: `node auto_hedge.js`

## kill_dust.js

This script identifies and closes "dust" grid bots (total investment < $0.50) that have PnL > -10% (losses less than 10%). It filters active grids, logs each bot's details (symbol, bot_id, investment, PnL %), and performs closures with delays to avoid rate limits. Includes Telegram notifications for start, results, and errors.

- **Highlights**:
  - Filters: Investment < $0.50 AND PnL > -10%.
  - Dry-run mode: Simulates closures without executing (use `--dry-run` flag).
  - Displays PnL % for each targeted bot in console and messages.
  - Closes in a loop with 2-second delays.

Run with: `node kill_dust.js` (or `node kill_dust.js --dry-run` for simulation).
