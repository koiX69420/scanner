document.addEventListener("DOMContentLoaded", function () {
    const analyzeButton = document.getElementById("analyzeButton");
    analyzeButton.addEventListener("click", fetchTokenData);
});

async function fetchTokenData() {
    const tokenAddress = document.getElementById("tokenAddress").value.trim();
    const resultDiv = document.getElementById("result");

    if (!tokenAddress) {
        resultDiv.innerHTML = "⚠️ Please enter a valid token address.";
        return;
    }

    resultDiv.innerHTML = "⏳ Fetching data...";

    try {
        const response = await fetch("https://mfscanner-07259bb7e8c0.herokuapp.com/api/token-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenAddress, isSummary: true })
        });

        const data = await response.json();
        console.log(data)
        if (data.error) {
            resultDiv.innerHTML = `❌ Error: ${data.error}`;
        } else {
            resultDiv.innerHTML = convertTelegramTextToHTML(data.text);
        }
    } catch (error) {
        resultDiv.innerHTML = "❌ Failed to fetch data.";
    }
}

function convertTelegramTextToHTML(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>") // Bold
        .replace(/\*(.*?)\*/g, "<b>$1</b>") // Bold fallback
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>') // Links
        .replace(/`(.*?)`/g, "<code>$1</code>") // Code formatting
        .replace(/\n/g, "<br>"); // New lines to HTML
}
