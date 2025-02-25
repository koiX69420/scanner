// Function to fetch and display top scanned tokens
async function displayTopScannedTokens() {
    try {
        const response = await fetch('https://mandog.fun/api/get-top-scanned-tokens'); // Use your API endpoint here
        const data = await response.json();
        console.log(data)
        // Check if there's a message in the response
        if (data.message) {
            // Inject the formatted message into the result section
            document.getElementById('result').innerHTML = data.message;
        }

    } catch (error) {
        console.error('Error fetching top scanned tokens:', error);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    document.body.addEventListener("click", function (event) {
        const target = event.target;
        
        // Check if the clicked element has the "clickable-token" class
        if (target.classList.contains("clickable-token")) {
            const tokenAddress = target.getAttribute("data-address");
            if (tokenAddress) {
                fetchTokenData(tokenAddress);
            }
        }
    });
});