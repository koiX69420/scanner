const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });
bot.setMyCommands([
    { command: "fresh", description: "Get top holder wallet freshness and holdings with /fresh ca" },
    { command: "funding", description: "Get funding information of who funded whom in top holders with /funding ca" },
  ]);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Message to show available commands with descriptions
    const message = `
    🗣 *Welcome to the Bot!*
  
    Here are the commands you can use:

    Get top holder wallet freshness and holdings.
    /fresh [ca]  
  
    Get funding information of who funded whom in top holders.
    /funding [ca]
      `;

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
});
module.exports = bot;