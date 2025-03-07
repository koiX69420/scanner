const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });

bot.setMyCommands([
  { command: "link", description: "Link your wallet to get basic access to the Mandog Trench Tools telegram bot." },
  { command: "subscribe", description: "Subscribe to get access to the Mandog Trench Tools chrome extension." },
  { command: "deviceupdate", description: "Update your device details to keep your verification up-to-date." }
]);

// Function to handle verification
async function handleSubscription(chatId, tgId) {
  try {
    const response = await fetch(`https://mandog.fun/api/sub/check-tgid?tgId=${tgId}`);
    const data = await response.json();

    if (data.success) {
      bot.sendMessage(
        chatId,
        `✅ *You have an active subscription!*  
🔗 Subscribed Wallet: \`${data.publicKey}\`  
⏳ *Subscription valid for another* \`${data.daysLeft} days\`  

🎯 *As a subscribed user, you have full access to our* *Mandog Trench Tools Chrome Extension*! 🚀`,
        { parse_mode: "Markdown", disable_web_page_preview: true }
      );
    } else {
      const verifyLink = `https://mandog.fun/subscribe?tgId=${tgId}`;
      bot.sendMessage(
        chatId,
        `🔐 *Verify your wallet to unlock our tools!*  

🛠️ *Why subscribe?*  
✅ Gain access to the *Mandog Trench Tools Chrome Extension*  
🔍 Analyze Solana tokens with ease in your browser  
🚀 Stay ahead in the market  

🔹 Click the link below to subscribe now:  
${verifyLink}`,
        { parse_mode: "Markdown", disable_web_page_preview: true }
      );
    }
  } catch (error) {
    console.error("Error checking Telegram ID verification:", error);
    bot.sendMessage(
      chatId,
      "❌ *An error occurred while checking your subscription status.* Please try again later.",
      { parse_mode: "Markdown" }
    );
  }
}

// Function to handle verification
async function handleLink(chatId, tgId) {
  try {
    const response = await fetch(`https://mandog.fun/api/link/check-tgid?tgId=${tgId}`);
    const data = await response.json();

    if (data.success) {
      bot.sendMessage(
        chatId,
        `✅ *You have a linked wallet!*  
🔗 Linked Wallet: \`${data.publicKey}\`  

🎯 *As a linked user, you have basic access to Mandog Trench Tools telegram bot if you hold more than ${process.env.TOKENGATE_AMOUNT} of the ${TOKEN_ADDRESS} token*! 🚀`,
        { parse_mode: "Markdown", disable_web_page_preview: true }
      );
    } else {
      const verifyLink = `https://mandog.fun/link?tgId=${tgId}`;
      bot.sendMessage(
        chatId,
        `🔐 *Link your wallet to unlock basic fucntion of the Mandog Trench Tools telegram bot!*  

🛠️ *Why link?*  
✅ Gain access to the *Mandog Trench Tools Telegram Bot*  
🔍 Analyze Solana tokens with ease in telegram  
🚀 Stay ahead in the market  

🔹 Click the link below to subscribe now:  
${verifyLink}`,
        { parse_mode: "Markdown", disable_web_page_preview: true }
      );
    }
  } catch (error) {
    console.error("Error checking Telegram ID verification:", error);
    bot.sendMessage(
      chatId,
      "❌ *An error occurred while checking your subscription status.* Please try again later.",
      { parse_mode: "Markdown" }
    );
  }
}

// Function to handle device update
async function handledeviceupdate(chatId, tgId) {
  try {
    const deviceupdateLink = `https://mandog.fun/deviceupdate?tgId=${tgId}`;
    bot.sendMessage(
      chatId,
      `🔄 *Update your device details* to keep your subscription up-to-date!  

Please visit the following link to begin updating your device details:  
${deviceupdateLink}`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );
  } catch (error) {
    console.error("Error sending device update link:", error);
    bot.sendMessage(
      chatId,
      "❌ *An error occurred while processing your device update.* Please try again later.",
      { parse_mode: "Markdown" }
    );
  }
}

// Handle /start and /start verify or deviceupdate deep link
bot.onText(/\/start(?:\s+(\w+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const startParam = match[1]; // Extracts the start parameter if present

  if (startParam === "subscribe") {
    // If deep link includes "verify", run verification
    handleSubscription(chatId, msg.from.id);
  } else if (startParam === "deviceupdate") {
    // If deep link includes "deviceupdate", run device update
    handledeviceupdate(chatId, msg.from.id);
  } else if (startParam === "link") {
    // If deep link includes "deviceupdate", run device update
    handleLink(chatId, msg.from.id);
  }else {
    // Default welcome message
    bot.sendMessage(
      chatId,
      `🚀 *Welcome to Mandog Trench Tools!*  

🔷 *Basic Service:* Link your solana wallet with /link and analyze any Solana token – just paste its address here.  
🔥 *Premium Service:* Subscribe to our premium service with /subscribe to unlock the *Mandog Trench Tools Chrome extension*.  

🌐 Explore more: [Mandog.fun](https://mandog.fun)  
🛠️ Install our *Mandog Trench Tools* Chrome Extension: [Coming Soon](https://chrome.google.com/webstore)  

✨ *Get started now with /link or /subscribe !*`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );
  }
});

// Handle /verify command
bot.onText(/\/subscribe/, (msg) => {

  handleSubscription(msg.chat.id, msg.from.id);
});

// Handle /verify command
bot.onText(/\/link/, (msg) => {

  handleLink(msg.chat.id, msg.from.id);
});

// Handle /deviceupdate command
bot.onText(/\/deviceupdate/, (msg) => {
  handledeviceupdate(msg.chat.id, msg.from.id);
});

module.exports = bot;
