const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Message to show available commands with descriptions
    const message = `
    🗣 *Welcome to the Bot!*
      `;

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
});
module.exports = bot;