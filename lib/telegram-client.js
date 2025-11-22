require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fs = require("node:fs");

class TelegramClient {
  constructor() {
    this.token = process.env.TOKEN;
    this.chatId = process.env.USER_CHAT_ID;
    this.bot = new TelegramBot(this.token, { polling: false });
    this.rateLimitedUntil = 0;
    this.messageQueue = [];
  }

  async sendMessageInternal(message) {
    try {
      return await this.bot.sendMessage(this.chatId, message);
    } catch (error) {
      throw error;
    }
  }

  async processQueue() {
    while (
      this.messageQueue.length > 0 &&
      Date.now() >= this.rateLimitedUntil
    ) {
      const msg = this.messageQueue.shift();
      try {
        await this.sendMessageInternal(msg);
      } catch (error) {
        if (error.response && error.response.statusCode === 429) {
          const retryAfter =
            parseInt(error.response.body.parameters?.retry_after) || 1;
          this.rateLimitedUntil = Date.now() + retryAfter * 1000;
          this.messageQueue.unshift(msg);
          setTimeout(() => this.processQueue(), retryAfter * 1000);
          return;
        } else {
          console.log("error in sending queued message", msg, error);
        }
      }
    }
  }

  async send(message) {
    const logEntry = `${new Date().toISOString()} - ${message}\n`;
    fs.appendFileSync(`${process.cwd()}/tg_messages.log`, logEntry);

    if (Date.now() < this.rateLimitedUntil) {
      console.log(
        `Rate limited, queuing message: ${message.substring(0, 50)}...`
      );
      this.messageQueue.push(message);
      return;
    }

    try {
      await this.sendMessageInternal(message);
    } catch (error) {
      if (error.response && error.response.statusCode === 429) {
        const retryAfter =
          parseInt(error.response.body.parameters?.retry_after) || 1;
        this.rateLimitedUntil = Date.now() + retryAfter * 1000;
        console.log(
          `Rate limited. Deferring messages until ${new Date(
            this.rateLimitedUntil
          ).toISOString()}`
        );
        this.messageQueue.push(message);
        setTimeout(() => this.processQueue(), retryAfter * 1000);
      } else {
        console.log("Non-rate limit error, message not queued");
      }
    }
  }
}

// Singleton instance
let instance = null;

function getTelegramClient() {
  if (!instance) {
    instance = new TelegramClient();
  }
  return instance;
}

module.exports = {
  TelegramClient,
  getTelegramClient,
};
