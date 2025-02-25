chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📩 Received message in background.js:", message);

    if (message.type === "RUN_FETCH_TOKEN_DATA") {
        console.log("🔍 Processing token:", message.token);
        chrome.storage.local.set({ tokenAddress: message.token }, () => {
            chrome.action.openPopup();
            sendResponse({ success: true, receivedToken: message.token });
        });
        return true; // Important for async responses
    }

    sendResponse({ success: false, error: "Unknown message type" });
    return true;
});
