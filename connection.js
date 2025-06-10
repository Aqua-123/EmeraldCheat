//stolen CSRF token is stored here
let csrf;

//stolen WebSocket URL
let cableUrl;

async function loadJSON(url, noAlerts) {
    try {
        let response = await fetchOldAPI(url, {
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
            return await response.json();
        } else if (!noAlerts) {
            switch (response.status) {
                case 429:
                    alert("too many requests :(");
                    break;
                default:
                    alert(`invalid server response ${response.status} :(`);
                    break;
            }
        }
    } catch {
        alert("failed to load :(");
    }
}

async function sendActionRequest(url, method, ignoreResponse) {
    try {
        let response = await fetchOldAPI(url, {
            method: method,
            headers: { "x-csrf-token": csrf },
        });
        if (response.status === 422) {
            await stealFromApp();
            response = await fetchOldAPI(url, {
                headers: { "x-csrf-token": csrf },
                method: method,
            });
        }
        if (!ignoreResponse && !response.ok) {
            alert("failed to perform action :(");
            return;
        }
        if (
            response.status === 200 &&
            response.headers.get("content-type") &&
            response.headers.get("content-type").includes("application/json")
        ) {
            return await response.json();
        } else if (response.status === 500) {
            return false;
        }
    } catch {}
}

async function deletePictureCache() {
    for (let tuple of await getAllDatabaseJSON("PictureDates")) {
        await deleteDatabaseJSON("PictureDates", tuple.key);
    }
}

async function deleteExpiredPictures() {
    for (let tuple of await getAllDatabaseJSON("PictureDates")) {
        if (new Date() - new Date(tuple.timestamp) >= 432000000) {
            await deleteDatabaseJSON("PictureDates", tuple.key);
        }
    }
}

async function preloadImage(url, element) {
    if (
        !(
            url.includes("/rails/active_storage/blobs/redirect/") ||
            url.includes("/rails/active_storage/representations/redirect/")
        )
    ) {
        element.src = url;
        return;
    }
    let tuple = await getDatabaseJSON("PictureDates", url);
    let outdated =
        !tuple || new Date() - new Date(tuple.timestamp) >= 432000000;
    let time = outdated ? new Date() : new Date(tuple.timestamp);
    if (config.doNotPreloadProfilePictures) {
        element.src = `${url}${
            url.includes("?") ? "&" : "?"
        }buster=${time.valueOf()}`;
    } else {
        if (outdated) {
            try {
                await fetch(url);
            } catch {}
        }
        element.src = url;
    }

    if (outdated) {
        await setDatabaseJSON("PictureDates", {
            key: url,
            timestamp: time.toISOString(),
        });
    }
}

async function loadImage(element, url) {
    let dataURL = await getImageAsDataURL(url);
    if (dataURL) {
        element.src = dataURL;
    } else {
        replaceImageWithPlaceholder(element);
    }
}

async function getImageAsDataURLWithGM(url) {
    return new Promise((resolve, reject) => {
        try {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                responseType: "blob",
                onload: async function (response) {
                    if (response.status === 200) {
                        let blob = response.response;
                        if (blob) {
                            let dataURL = await toDataURL(blob);
                            if (dataURL) {
                                resolve(dataURL);
                                return;
                            }
                        }
                    }
                    resolve(undefined);
                },
                onerror: function () {
                    resolve(undefined);
                },
            });
        } catch {
            resolve(undefined);
        }
    });
}
async function getImageAsDataURL(url) {
    try {
        let response = await fetch(url);
        if (response.ok) {
            let blob = await response.blob();
            if (blob) {
                let dataURL = await toDataURL(blob);
                if (dataURL) {
                    return dataURL;
                }
            }
        }
    } catch {}
}

async function toDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function stealFromApp() {
    try {
        let response = await fetchOldAPI("/app");
        if (!response.ok) {
            alert("failed to get csrf or sock :(");
            return;
        }
        let parsedDocument = new DOMParser().parseFromString(
            await response.text(),
            "text/html"
        );
        csrf = parsedDocument
            .querySelector("meta[name='csrf-token']")
            ?.getAttribute("content");
        cableUrl = parsedDocument
            .querySelector("meta[name='action-cable-url']")
            ?.getAttribute("content");
        if (!csrf || !cableUrl) alert("failed to get csrf or sock :(");
    } catch {
        alert("failed to get csrf or sock :(");
    }
}

async function openSocket(onMessage, onConnect) {
    if (!cableUrl) {
        throw new Error("cableUrl wasn't set.");
    }

    let sockId = new Date().valueOf();
    let sock;
    let reconnectTimeout;
    let everSuccessful = false;

    function close() {
        if (sock) {
            try {
                sock.onclose = null;
                sock.close();
            } catch {}
        }
    }

    function reconnect() {
        if (!everSuccessful) {
            return;
        }
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        console.log(`${sockId} sock reconnecting...`);
        close();
        reconnectTimeout = setTimeout(() => {
            console.log(`${sockId} sock reconnect tick`);
            connect();
        }, 3000);
    }

    async function connect() {
        let failed = false;
        while (!failed && (!sock || sock.readyState !== WebSocket.OPEN)) {
            console.log(`${sockId} sock connecting...`);
            await new Promise((resolve, reject) => {
                sock = new WebSocket(cableUrl);
                sock.onopen = () => {
                    console.log(`${sockId} sock connected :)`);
                };
                sock.onerror = (e) => {
                    console.error(`${sockId} sock error :(`, e);
                    failed = true;
                    reject(e);
                };
                sock.onclose = (e) => {
                    reconnect();
                    resolve();
                };
                sock.onmessage = async (e) => {
                    everSuccessful = true;
                    let message = JSON.parse(e.data);
                    if (message.type === "welcome") {
                        if (onConnect) {
                            await onConnect(send);
                        }
                        resolve();
                    } else if (
                        message.type === "disconnect" &&
                        message.reason === "unauthorized"
                    ) {
                        await stealFromApp();
                        reconnect();
                        resolve();
                    } else {
                        await onMessage(message);
                    }
                };
            });
        }
    }

    function send(message) {
        if (sock && sock.readyState === WebSocket.OPEN) {
            if (message === "bye") {
                close();
                console.log(`${sockId} sock disconnected`);
            } else {
                sock.send(JSON.stringify(message));
            }
        } else {
            console.log(`${sockId} sock failed to send a message`);
        }
    }

    await connect();

    return send;
}
