const { RestClientV5 } = require("bybit-api");
// or
// import { RestClientV5 } from 'bybit-api';

const restClientOptions = {
  /** supports HMAC & RSA API keys - automatically detected */
  /** Your API key */
  key: "apiKeyHere",

  /** Your API secret */
  secret: "apiSecretHere",

  /** Set to `true` to connect to testnet. Uses the live environment by default. */
  // testnet: true,

  /**
   * Set to `true` to use Bybit's V5 demo trading:
   * https://bybit-exchange.github.io/docs/v5/demo
   *
   * Note: to use demo trading, you should have `testnet` disabled.
   *
   * You can find a detailed demoTrading example in the examples folder on GitHub.
   */
  // demoTrading: true,

  /** Override the max size of the request window (in ms) */
  // recv_window: 5000, // 5000 = 5 seconds

  /**
   * Enable keep alive for REST API requests (via axios).
   * See: https://github.com/tiagosiebler/bybit-api/issues/368
   */
  // keepAlive: true,

  /**
   * When using HTTP KeepAlive, how often to send TCP KeepAlive packets over
   * sockets being kept alive. Only relevant if keepAlive is set to true.
   * Default: 1000 (defaults comes from https agent)
   */
  // keepAliveMsecs: 1000, // 1000 = 1 second

  /**
   * Optionally override API domain used:
   * apiRegion: 'default' | 'bytick' | 'NL' | 'HK' | 'TK',
   **/

  // apiRegion: 'bytick',

  /** Default: false. Enable to parse/include per-API/endpoint rate limits in responses. */
  // parseAPIRateLimits: true,

  /**
   * Allows you to provide a custom "signMessage" function,
   * e.g. to use node crypto's much faster createHmac method
   *
   * Look at examples/fasterHmacSign.ts for a demonstration:
   */
  // customSignMessageFn: (message: string, secret: string) => Promise<string>;
};

const API_KEY = "xxx";
const API_SECRET = "yyy";

const client = new RestClientV5(
  {
    key: "-",
    secret: "--",
    // demoTrading: true,

    // Optional: enable to try parsing rate limit values from responses
    // parseAPIRateLimits: true
  }
  // requestLibraryOptions
);

// For public-only API calls, simply don't provide a key & secret or set them to undefined
// const client = new RestClientV5();

client
  .getWalletBalance({ accountType: "UNIFIED" })
  .then((result) => {
    console.log("getAccountInfo result: ", result.result.list[0].coin);
  })
  .catch((err) => {
    console.error("getAccountInfo error: ", err);
  });
/*
client
  .getOrderbook({ category: "linear", symbol: "BTCUSDT" })
  .then((result) => {
    console.log("getOrderBook result: ", result);
  })
  .catch((err) => {
    console.error("getOrderBook error: ", err);
  });
*/
