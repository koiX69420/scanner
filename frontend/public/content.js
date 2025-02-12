console.log("Content script is running...");

// Function to inject the icon
function injectIcon() {
    let targetDiv = document.querySelector(".sBVBv2HePq7qYTpGDmRM.VTmpJ0jdbJuSJQ4HKGlN");
    if (targetDiv && !targetDiv.querySelector(".injected-icon")) {
        console.log("Target div found, injecting icon...");

        let icon = document.createElement("img");
        icon.src = chrome.runtime.getURL("128.png"); // Ensure this image exists
        icon.className = "injected-icon"; // Prevent duplicate injections
        icon.style.width = "20px";
        icon.style.height = "20px";
        icon.style.cursor = "pointer";
        icon.style.marginLeft = "10px";
        icon.title = "Click to scan token";

        targetDiv.appendChild(icon);

        icon.addEventListener("click", () => {
            console.log("Icon clicked - triggering fetchTokenData()");
            window.postMessage({ type: "RUN_FETCH_TOKEN_DATA" }, "*");
        });
    } else {
        console.warn("Target div not found. Retrying...");
    }
}

// **Try to inject immediately**
injectIcon();

// **Watch for dynamic changes using MutationObserver**
const observer = new MutationObserver((mutations) => {
    mutations.forEach(() => injectIcon());
});

// Start observing changes in the document body
observer.observe(document.body, { childList: true, subtree: true });
