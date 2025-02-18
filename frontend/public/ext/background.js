chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📩 Received message in background.js:", message);

    if (message.type === "RUN_FETCH_TOKEN_DATA") {
        console.log("🔍 Processing token:", message.token);

        // Respond back to content.js
        sendResponse({ success: true, receivedToken: message.token });
        chrome.tabs.create({
            url: chrome.runtime.getURL(`popup.html?token=${message.token}`)
        });
        return true; // Important for async responses
    }

    sendResponse({ success: false, error: "Unknown message type" });
    return true;
});
