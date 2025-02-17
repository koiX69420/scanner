const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });
bot.setMyCommands([
    { command: "verify", description: "Get top holder wallet freshness and holdings with /fresh ca" }
  ]);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Message to show available commands with descriptions
    const message = `
    🗣 *Welcome to Mandog Trench Tools*
  
    Paste a solana token address for a full scan
      `;

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
});

// bot.onText(/\/verify/, (msg) => {
//   console.log(msg)
//   const chatId = msg.chat.id;
//   const tgId = msg.from.id; // Get Telegram user ID
//   const verifyLink = `https://mandog.fun/verify?tgId=${tgId}`;


//   bot.sendMessage(chatId, verifyLink, 
//     { parse_mode: "Markdown",reply_markup: {
//       inline_keyboard: [[{ text: "🔗 Verify Wallet", url: verifyLink }]],
//   }});

// });
module.exports = bot;