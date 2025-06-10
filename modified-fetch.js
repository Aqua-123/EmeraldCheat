/**
 * A wrapper around the native fetch function that automatically adds specific headers
 * and configuration for older API compatibility.
 *
 * @param {string|Request} input - The resource that you wish to fetch
 * @param {RequestInit} init - An options object containing any custom settings
 * @returns {Promise<Response>} A Promise that resolves to the Response object
 */
async function fetchOldAPI(input, init = {}) {
    // Process the input URL
    let url;
    if (typeof input === "string") {
        url = input;
    } else if (input instanceof Request) {
        url = input.url;
    } else {
        throw new Error(
            "Invalid input: must be a string URL or Request object"
        );
    }

    // Check if URL starts with / and prepend emeraldchat.com domain
    if (url.startsWith("/")) {
        url = "https://emeraldchat.com" + url;
    } else {
        // Check if it's trying to access a different domain
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname !== "emeraldchat.com") {
                throw new Error(
                    `Access denied: Only emeraldchat.com domain is allowed. Attempted: ${urlObj.hostname}`
                );
            }
        } catch (e) {
            if (e.message.includes("Access denied")) {
                throw e;
            }
            // If URL parsing fails, it might be a relative path without leading /
            throw new Error(`Invalid URL format: ${url}`);
        }
    }

    // Default configuration with the specified headers
    const defaultConfig = {
        credentials: "include",
        headers: {
            "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.5",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            Priority: "u=4",
        },
        method: "GET",
        mode: "cors",
    };

    // Merge the default config with any provided options
    // User-provided options will override defaults
    const mergedConfig = {
        ...defaultConfig,
        ...init,
        headers: {
            ...defaultConfig.headers,
            ...(init.headers || {}),
        },
    };

    // Call the native fetch with processed URL and merged configuration
    return fetch(url, mergedConfig);
}
