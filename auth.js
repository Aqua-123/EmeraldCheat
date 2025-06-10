//the currently logged in user
let currentUser;

async function loadCurrentUser() {
    if (currentUser) return;
    try {
        let response = await fetchOldAPI("/current_user_json", {
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
        });
        if (
            response.status === 200 &&
            response.headers.get("content-type") &&
            response.headers.get("content-type").includes("application/json")
        ) {
            currentUser = await response.json();
            currentUser.mod = true;
            currentUser.master = true;
            currentUser.is_mod_admin = true;
        } else {
            // window.location.assign("https://emeraldchat.com/");
        }
    } catch {
        alert("failed to load the current user :(");
    }
}
