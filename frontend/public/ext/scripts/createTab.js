document.addEventListener("DOMContentLoaded", () => {
    // Create Tab Button Click Event
    document.getElementById("createTabBtn").addEventListener("click", () => {
        chrome.tabs.create({ url: "popup.html" });
    });
    document.getElementById("reset").addEventListener("click", () => {
        location.href = "popup.html"; // Reloads the extension popup
    });
});