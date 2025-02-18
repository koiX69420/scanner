// Wait for the page to load completely
window.addEventListener('DOMContentLoaded', () => {
    console.log("trying to get key");

    // Get the existing walletAddress div
    const walletAddressDiv = document.getElementById("walletAddress");

    // Retrieve the public key from chrome storage
    chrome.storage.local.get("walletPublicKey", (result) => {
        if (result.walletPublicKey) {
            // Update the content of the existing div with the connected public key
            walletAddressDiv.textContent = `${result.walletPublicKey}`;
        } else {
            // If no wallet is connected, show a message to guide the user
            walletAddressDiv.innerHTML = "No wallet connected yet. Please visit <a href='https://mandog.fun' target='_blank'>mandog.fun</a> to connect your wallet.";
        }
    });
});