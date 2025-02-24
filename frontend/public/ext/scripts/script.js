document.getElementById("scanButton").addEventListener("click", fetchTokenData);
function isValidSolanaAddress(address) {
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
}

document.addEventListener("DOMContentLoaded", function () {
    // Extract the token from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    if (token) {
        console.log("📡 Token received:", token);
        fetchTokenData(token); // Call your function in script.js
    }
});

// Wait for the page to load completely
window.addEventListener('DOMContentLoaded', () => {
    console.log("trying to get key");

    // Get the existing walletAddress div and other elements
    const walletAddressDiv = document.getElementById("walletAddress");
    const inputContainer = document.querySelector('.input-container');
    const resultDiv = document.getElementById("result");

    // Retrieve the public key from chrome storage
    chrome.storage.local.get("walletPublicKey", (result) => {
        if (result.walletPublicKey) {
            // If a wallet public key is available, display it and show input and result sections
            walletAddressDiv.textContent = `Connected: ${result.walletPublicKey}`;
            inputContainer.style.display = 'flex';  // Show input container
            resultDiv.style.display = 'block';     // Show result div
        } else {
            // If no wallet is connected, update the message and hide input and result sections
            walletAddressDiv.innerHTML = "No wallet connected yet. <br> Please visit <a href='https://mandog.fun' target='_blank'>mandog.fun</a> to connect your wallet.";
            inputContainer.style.display = 'none'; // Hide input container
            resultDiv.style.display = 'none';      // Hide result div
        }
    });
});

// Modify fetchTokenData to handle error animation
async function fetchTokenData(tokenAddress) {

    const resultDiv = document.getElementById("result");
    // Get walletPublicKey from Chrome storage
    const walletAddress = await getWalletPublicKey();
    if (!walletAddress) {
        resultDiv.innerHTML = "❌ Wallet is not connected. Please connect your wallet.";
        shakeInput();
        return;
    }
    if (typeof tokenAddress !== "string") tokenAddress = document.getElementById("tokenAddress").value.trim();

    // Validate Solana address
    if (!isValidSolanaAddress(tokenAddress)) {
        resultDiv.innerHTML = "⚠️ Invalid Solana token address.";
        shakeInput();
        return;
    }

    resultDiv.innerHTML = `
    <div class="loading-container">
        <span class="spinner"></span>
    </div>
`;

    try {
        const verificationData= {
            tokenAddress:tokenAddress,
            walletAddress:walletAddress,
            isSummary:false,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            language: navigator.language,
            userAgent: navigator.userAgent
        };

        const response = await fetch("https://mandog.fun/api/token-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(verificationData)
        });

        const data = await response.json();
        if (data.error) {
            resultDiv.innerHTML = `${data.error}`;
            shakeInput();
        } else {
            resultDiv.innerHTML = convertTelegramTextToHTML(data.text);
            document.getElementById("tokenAddress").value=""
        }
    } catch (error) {
        resultDiv.innerHTML = "❌ Failed to fetch data.";
        shakeInput();
    }

    // Smoothly fade in results
    resultDiv.style.opacity = "1";
}

// Helper function to get walletPublicKey from Chrome storage
function getWalletPublicKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get("walletPublicKey", (result) => {
            resolve(result.walletPublicKey || null);
        });
    });
}

function convertTelegramTextToHTML(text) {
    // Protect underscores inside links first
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, (match, label, url) => {
        return `<a href="${url.replace(/_/g, "UNDERSCORE")}" target="_blank">${label}</a>`;
    });

    // Convert bold markdown
    text = text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>") // Bold
               .replace(/\*(.*?)\*/g, "<b>$1</b>"); // Bold fallback

    // Convert `_italic_` (without affecting links)
    text = text.replace(/_(.*?)_/g, "<i>$1</i>");

    // Restore underscores inside links
    text = text.replace(/UNDERSCORE/g, "_");

    // Convert inline code blocks
    text = text.replace(/`(.*?)`/g, '<span class="copyable"><code>$1</code></span>');

    // Convert new lines to <br>
    return text.replace(/\n/g, "<br>");
}

document.getElementById("tokenAddress").addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        triggerAnimation();
        fetchTokenData();
    }
});

function triggerAnimation() {
    const inputField = document.getElementById("tokenAddress");
    const resultDiv = document.getElementById("result");

    // Add glow effect
    inputField.classList.add("glow");

    // Fade out result div for smooth transition
    resultDiv.style.opacity = "0.5";

    // Remove glow effect after 1s
    setTimeout(() => inputField.classList.remove("glow"), 1000);
}

function shakeInput() {
    const inputField = document.getElementById("tokenAddress");
    inputField.classList.add("shake");

    setTimeout(() => inputField.classList.remove("shake"), 500);
}

// Function to copy text to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        console.log("Copied to clipboard:", text);
    }).catch(err => {
        console.error("Failed to copy:", err);
    });
}

// Function to show copy feedback
function showCopyFeedback(element) {
    element.classList.add("copied");
    setTimeout(() => element.classList.remove("copied"), 1000);
}

// Event delegation for dynamically added `.copyable` elements
document.addEventListener("click", function (event) {
    const copyable = event.target.closest(".copyable");
    if (copyable) {
        const codeElement = copyable.querySelector("code");
        if (codeElement) {
            copyToClipboard(codeElement.innerText);
            showCopyFeedback(copyable);
        }
    }
});

// MutationObserver to watch for new `.copyable` elements
const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1 && node.matches(".copyable")) {
                console.log("New copyable element detected:", node);
            }
        });
    });
});

// Start observing changes in the result div where new content is injected
const resultDiv = document.getElementById("result");
if (resultDiv) {
    observer.observe(resultDiv, { childList: true, subtree: true });
}

