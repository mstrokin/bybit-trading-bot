const fs = require("node:fs");
const path = require("node:path");

/**
 * Get Bybit cookie from file
 */
function getBYBIT_COOKIE() {
  return fs.readFileSync(path.join(process.cwd(), "BYBIT_COOKIE"), "utf8");
}

/**
 * Generate HTTP headers for Bybit API requests
 */
function getHeaders() {
  const BYBIT_COOKIE = getBYBIT_COOKIE();
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
}

/**
 * Generic POST request to Bybit API
 */
async function bybitPost(endpoint, payload) {
  const raw = JSON.stringify(payload);
  const requestOptions = {
    method: "POST",
    headers: getHeaders(),
    body: raw,
    redirect: "follow",
  };
  try {
    const res = await fetch(endpoint, requestOptions);
    return await res.json();
  } catch (error) {
    console.error(`Error in bybitPost to ${endpoint}:`, error);
    return null;
  }
}

/**
 * Generic GET request to Bybit API
 */
async function bybitGet(endpoint) {
  const requestOptions = {
    method: "GET",
    headers: getHeaders(),
  };
  try {
    const res = await fetch(endpoint, requestOptions);
    return await res.json();
  } catch (error) {
    console.error(`Error in bybitGet to ${endpoint}:`, error);
    return null;
  }
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) {
        return await res.json();
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      if (i === retries - 1) {
        console.error(`Fetch failed after ${retries} retries:`, err);
        throw err;
      }
      console.log(`Retry ${i + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

module.exports = {
  getBYBIT_COOKIE,
  getHeaders,
  bybitPost,
  bybitGet,
  fetchWithRetry,
};
