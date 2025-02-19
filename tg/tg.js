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

bot.onText(/\/verify/, async (msg) => {
  const chatId = msg.chat.id;
  const tgId = msg.from.id; // Get Telegram user ID

  try {
    // Check if tgId is already verified
    const response = await fetch(`http://localhost:5000/api/check-tgid?tgId=${tgId}`);
    const data = await response.json();

    if (data.success) {
      // User is already verified
      bot.sendMessage(
        chatId,
        `✅ You are already verified! Your verification is valid for another ${data.daysLeft} days.`
      );
    } else {
      // User is not verified, send verification link
      const verifyLink = `https://mandog.fun/verify?tgId=${tgId}`;
      bot.sendMessage(
        chatId,
        `🔹 Click the link below to verify your wallet:\n\n${verifyLink}`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    console.error("Error checking Telegram ID verification:", error);
    bot.sendMessage(chatId, "❌ An error occurred while checking your verification status. Please try again later.");
  }
});
module.exports = bot;