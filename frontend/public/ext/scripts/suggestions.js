// Function to fetch and display top scanned tokens
async function displayTopScannedTokens() {
    try {
        const response = await fetch('http://mandog.fun/api/get-top-scanned-tokens'); // Use your API endpoint here
        const data = await response.json();
        console.log(data)
        // Check if there's a message in the response
        if (data.message) {
            // Inject the formatted message into the result section
            document.getElementById('trending').innerHTML = data.message;
        }

    } catch (error) {
        console.error('Error fetching top scanned tokens:', error);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    // Event listener for the "Show Top 10" button
    const topten = document.getElementById("topten");
    topten.addEventListener("click", function () {
        displayRecentScans(); // Call the function to show the top scanned tokens
        const lastScansDiv = document.getElementById('last-scans');
        const isVisible = lastScansDiv.style.display === 'block';
        
        // Toggle visibility
        if (isVisible) {
            lastScansDiv.style.display = 'none'; // Hide the list
        } else {
            lastScansDiv.style.display = 'block'; // Show the list
        }
    });

    document.body.addEventListener("click", function (event) {
        const tokenEntry = event.target.closest(".token-entry"); // Ensure it selects the parent
        if (tokenEntry) {
            const tokenAddress = tokenEntry.getAttribute("data-address");
            if (tokenAddress) {
                const lastScansDiv = document.getElementById('last-scans');
                lastScansDiv.style.display = 'none'; // Hide the list

                fetchTokenData(tokenAddress);
            }
        }
    });
});
displayRecentScans()
// Function to fetch and display top scanned tokens from chrome storage
function displayRecentScans() {
    const resultDiv = document.getElementById('last-scans');

    // Retrieve the scanned tokens from chrome storage
    chrome.storage.local.get("scannedTokens", function(result) {
        let scannedTokens = result.scannedTokens;
        // If no tokens found or the value is not an array, set it to an empty array
        if (!Array.isArray(scannedTokens)) {
            scannedTokens = [];
        }

        // If no tokens are scanned yet, display a message
        if (scannedTokens.length === 0) {
            resultDiv.innerHTML = "No tokens scanned yet.";
            return;
        }   
        console.log(scannedTokens)
        // Generate the HTML for the list of scanned tokens
        const tokenList = scannedTokens.map(({tokenAddress,symbol,timestamp}) => {
            return `<div class="token-entry" data-address="${tokenAddress}"><b>${symbol}</b> ${timestamp}</div>`;
        }).join('');

        // Inject the generated token list into the result div
        resultDiv.innerHTML = `
            <h3>History of your scans</h3>
            <div class="token-list">
                ${tokenList}
            </div>
        `;
    });
}