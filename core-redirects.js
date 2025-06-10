// check if on https://emeraldchat.com and redirect to https://new.emeraldchat.com
function internalRedirect() {
    if (
        window.location.href.includes("emeraldchat.com") &&
        !window.location.href.includes("new.emeraldchat.com") &&
        window.location.pathname.startsWith("/cheat")
    ) {
        window.location.href =
            "https://new.emeraldchat.com" +
            window.location.pathname +
            window.location.search +
            window.location.hash;
    }
}

internalRedirect();
