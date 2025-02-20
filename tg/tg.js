const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });

bot.setMyCommands([
  { command: "verify", description: "Verify to get access to the Mandog Trench Tools chrome extension." }
]);

// Function to handle verification
async function handleVerification(chatId, tgId) {
  try {
    const response = await fetch(`https://mandog.fun/api/check-tgid?tgId=${tgId}`);
    const data = await response.json();

    if (data.success) {
      bot.sendMessage(
        chatId,
        `✅ *You're already verified!*  
🔗 Linked Wallet: \`${data.publicKey}\`  
⏳ *Verification valid for another* \`${data.daysLeft} days\`  

🎯 *As a verified user, you have full access to our* *Mandog Trench Tools Chrome Extension*! 🚀`,
        { parse_mode: "Markdown", disable_web_page_preview: true }
      );
    } else {
      const verifyLink = `https://mandog.fun/verify?tgId=${tgId}`;
      bot.sendMessage(
        chatId,
        `🔐 *Verify your wallet to unlock our tools!*  

🛠️ *Why verify?*  
✅ Gain access to the *Mandog Trench Tools Chrome Extension*  
🔍 Analyze Solana tokens with ease in your browser
🚀 Stay ahead in the market  

🔹 Click the link below to verify now:  
https://mandog.fun/verify?tgId=${tgId}`,
        { parse_mode: "Markdown", disable_web_page_preview: true }
      );
    }
  } catch (error) {
    console.error("Error checking Telegram ID verification:", error);
    bot.sendMessage(
      chatId,
      "❌ *An error occurred while checking your verification status.* Please try again later.",
      { parse_mode: "Markdown" }
    );
  }
}

// Handle /start and /start verify deep link
bot.onText(/\/start(?:\s+(\w+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const startParam = match[1]; // Extracts the start parameter if present

  if (startParam === "verify") {
    // If deep link includes "verify", run verification
    handleVerification(chatId, msg.from.id);
  } else {
    // Default welcome message
    // Default welcome message
    bot.sendMessage(
      chatId,
      `🚀 *Welcome to Mandog Trench Tools!*  

🔍 *Instantly analyze any Solana token* – just paste its address here.  
🔑 *Verify your wallet* to unlock exclusive tools, including our *Chrome extension*.  

🌐 Explore more: [Mandog.fun](https://mandog.fun)  
🛠️ Install our *Mandog Trench Tools* Chrome Extension: [Coming Soon](https://chrome.google.com/webstore)  

✨ *Get started now – paste a Solana token address!*`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );

  }
});

// Handle /verify command
bot.onText(/\/verify/, (msg) => {
  handleVerification(msg.chat.id, msg.from.id);
});

module.exports = bot;
