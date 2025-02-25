// Function to fetch and display top scanned tokens
async function displayTopScannedTokens() {
    try {
        const response = await fetch('https://mandog.fun/api/get-top-scanned-tokens'); // Use your API endpoint here
        const data = await response.json();

        // Check if there's a message in the response
        if (data.message) {
            // Inject the formatted message into the result section
            document.getElementById('result').innerHTML = data.message;
        }

    } catch (error) {
        console.error('Error fetching top scanned tokens:', error);
    }
}