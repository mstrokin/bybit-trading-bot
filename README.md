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
