document.getElementById("scanButton").addEventListener("click", fetchTokenData);
function isValidSolanaAddress(address) {
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
}
window.addEventListener("message", (event) => {
    if (event.source !== window) return; // Ensure message comes from the same page
    if (event.data.type === "RUN_FETCH_TOKEN_DATA") {
        console.log("Received message - executing fetchTokenData()");
        fetchTokenData(); // Call your function
    }
});
// Modify fetchTokenData to handle error animation
async function fetchTokenData() {
    const tokenAddress = document.getElementById("tokenAddress").value.trim();
    const resultDiv = document.getElementById("result");
    // Validate Solana address
    if (!isValidSolanaAddress(tokenAddress)) {
        resultDiv.innerHTML = "⚠️ Invalid Solana token address.";
        shakeInput();
        return;
    }

    resultDiv.innerHTML = "⏳ Fetching data...";

    try {
        const response = await fetch("http://localhost:5000/api/token-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenAddress, isSummary: true })
        });

        const data = await response.json();
        if (data.error) {
            resultDiv.innerHTML = `❌ Error: ${data.error}`;
            shakeInput();
        } else {
            resultDiv.innerHTML = convertTelegramTextToHTML(data.text);
        }
    } catch (error) {
        resultDiv.innerHTML = "❌ Failed to fetch data.";
        shakeInput();
    }

    // Smoothly fade in results
    resultDiv.style.opacity = "1";
}

function convertTelegramTextToHTML(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>") // Bold
        .replace(/\*(.*?)\*/g, "<b>$1</b>") // Bold fallback
        .replace(/_(.*?)_/g, "<i>$1</i>") // Italic instead of underline
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>') // Links
        .replace(/`(.*?)`/g, '<span class="copyable"><code>$1</code></span>') // Make code copyable
        .replace(/\n/g, "<br>"); // New lines to HTML
}

document.getElementById("tokenAddress").addEventListener("keypress", function(event) {
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
document.addEventListener("click", function(event) {
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

