// Wait for the page to load completely
window.addEventListener('DOMContentLoaded', () => {
    console.log("trying to get key")
    chrome.storage.local.get("walletPublicKey", (result) => {
        const walletAddressDiv = document.createElement("div");
        walletAddressDiv.id = "walletAddress";

        if (result.walletPublicKey) {
            walletAddressDiv.textContent = `Connected: ${result.walletPublicKey}`;
        } else {
            walletAddressDiv.textContent = "No wallet connected yet.";
        }

        // Append the div with wallet address info below the heading
        const container = document.querySelector('.main-container'); // Adjust this selector as needed
        container.appendChild(walletAddressDiv);
    });
});