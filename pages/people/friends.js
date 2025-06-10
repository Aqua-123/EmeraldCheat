/**
 * Creates a user row element with profile picture and display name
 * @param {HTMLElement} container - The container element to append the user row to
 * @param {Object} user - The user object containing user data
 * @param {number} user.id - User's unique identifier
 * @param {string} user.display_name - User's display name
 * @param {string} [user.thumbnail_picture] - User's thumbnail picture URL
 * @param {string} [user.display_picture] - User's display picture URL (fallback)
 */
function createUserRow(container, user) {
    const userRow = createElement("a", container, {
        className: "flex-row center-items",
        href: `/cheat/people/user?id=${user.id}`,
    });
    createElement("img", userRow, {
        className: "image flex-grow-0",
        style: "width: 3rem; height: 3rem;",
        src: userThumbnail(user),
    });
    createElement("span", userRow, { text: user.display_name });
}

/**
 * Loads friends in batches with optimistic offset calculation and reconsolidation
 * @param {number} startOffset - The starting offset (total friends already loaded)
 * @param {number} requestCount - Number of API requests to make
 * @param {number} total - Total number of friends available
 * @param {number} [expectedPerRequest=8] - Expected friends per API request
 * @param {number} [maxConcurrent=10] - Maximum concurrent requests
 * @returns {Promise<Array>} Array of user objects
 */
async function loadFriendsInBatches(
    startOffset,
    requestCount,
    total,
    expectedPerRequest = 8,
    maxConcurrent = 10
) {
    const allUsers = [];
    let processedRequests = 0;

    while (processedRequests < requestCount) {
        const batchSize = Math.min(
            maxConcurrent,
            requestCount - processedRequests
        );
        const promises = [];
        const requestOffsets = [];

        // Calculate optimistic offsets for this batch
        for (let i = 0; i < batchSize; i++) {
            const requestIndex = processedRequests + i;
            const optimisticOffset =
                startOffset + requestIndex * expectedPerRequest;

            if (optimisticOffset < total) {
                requestOffsets.push(optimisticOffset);
                promises.push(
                    loadJSON(`/load_friends_json?offset=${optimisticOffset}`)
                        .then((response) => ({
                            offset: optimisticOffset,
                            users: Array.isArray(response)
                                ? response.filter((user) => user && user.id)
                                : [],
                            success: true,
                        }))
                        .catch((error) => {
                            console.warn(
                                `Failed to load friends at offset ${optimisticOffset}:`,
                                error
                            );
                            return {
                                offset: optimisticOffset,
                                users: [],
                                success: false,
                            };
                        })
                );
            }
        }

        if (promises.length === 0) break;

        const batchResults = await Promise.all(promises);
        const successfulResults = batchResults.filter(
            (result) => result.success
        );

        // Check for gaps that need reconsolidation
        const gaps = [];
        let cumulativeActual = startOffset;

        for (let i = 0; i < successfulResults.length; i++) {
            const result = successfulResults[i];
            const expectedOffset =
                startOffset + (processedRequests + i) * expectedPerRequest;
            const actualUsersReceived = result.users.length;

            // If this request returned fewer users than expected, we have a gap
            if (
                actualUsersReceived < expectedPerRequest &&
                cumulativeActual + actualUsersReceived < total
            ) {
                const gapStart = cumulativeActual + actualUsersReceived;
                const gapEnd = Math.min(
                    cumulativeActual + expectedPerRequest,
                    total
                );
                if (gapStart < gapEnd) {
                    gaps.push({ start: gapStart, end: gapEnd });
                }
            }

            allUsers.push(...result.users);
            cumulativeActual += actualUsersReceived;
        }

        // Reconsolidate gaps
        if (gaps.length > 0) {
            console.warn(`Reconsolidating ${gaps.length} gaps in friend data`);
            for (const gap of gaps) {
                try {
                    const gapResponse = await loadJSON(
                        `/load_friends_json?offset=${gap.start}`
                    );
                    const gapUsers = Array.isArray(gapResponse)
                        ? gapResponse.filter((user) => user && user.id)
                        : [];
                    const neededUsers = gapUsers.slice(0, gap.end - gap.start);
                    allUsers.push(...neededUsers);
                    console.log(
                        `Reconsolidated gap: fetched ${neededUsers.length} users from offset ${gap.start}`
                    );
                } catch (error) {
                    console.warn(
                        `Failed to reconsolidate gap at offset ${gap.start}:`,
                        error
                    );
                }
            }
        }

        processedRequests += batchSize;
    }

    // Remove duplicates based on user ID (in case reconsolidation overlapped)
    const uniqueUsers = [];
    const seenIds = new Set();
    for (const user of allUsers) {
        if (!seenIds.has(user.id)) {
            seenIds.add(user.id);
            uniqueUsers.push(user);
        }
    }

    console.log(
        `Batch loading complete: ${uniqueUsers.length} unique users loaded`
    );
    return uniqueUsers;
}

/**
 * Loads all remaining friends with optimistic calculation and reconsolidation
 * @param {number} currentLoaded - Number of friends already loaded
 * @param {number} estimatedTotal - Estimated total number of friends
 * @param {number} [expectedPerRequest=8] - Expected friends per API request
 * @param {number} [maxConcurrent=10] - Maximum concurrent requests
 * @returns {Promise<Array>} Array of user objects
 */
async function loadAllRemainingFriends(
    currentLoaded,
    estimatedTotal,
    expectedPerRequest = 8,
    maxConcurrent = 10
) {
    const remaining = estimatedTotal - currentLoaded;
    const estimatedRequests = Math.ceil(remaining / expectedPerRequest);

    console.log(
        `Loading all remaining friends: ${remaining} friends in ~${estimatedRequests} requests`
    );

    const allUsers = [];
    let offset = currentLoaded;
    let actualTotal = estimatedTotal;

    while (offset < actualTotal) {
        const remainingFriends = actualTotal - offset;
        const requestsInBatch = Math.min(
            Math.ceil(remainingFriends / expectedPerRequest),
            maxConcurrent
        );
        const promises = [];
        const requestData = [];

        // Create batch with optimistic offsets
        for (let i = 0; i < requestsInBatch; i++) {
            const requestOffset = offset + i * expectedPerRequest;
            if (requestOffset < actualTotal) {
                requestData.push({ offset: requestOffset, index: i });
                promises.push(
                    loadJSON(`/load_friends_json?offset=${requestOffset}`)
                        .then((response) => ({
                            offset: requestOffset,
                            users: Array.isArray(response)
                                ? response.filter((user) => user && user.id)
                                : [],
                            success: true,
                        }))
                        .catch((error) => {
                            console.warn(
                                `Failed to load friends at offset ${requestOffset}:`,
                                error
                            );
                            return {
                                offset: requestOffset,
                                users: [],
                                success: false,
                            };
                        })
                );
            }
        }

        if (promises.length === 0) break;

        const batchResults = await Promise.all(promises);
        const successfulResults = batchResults.filter(
            (result) => result.success
        );

        if (successfulResults.length === 0) {
            console.warn("No successful requests in batch, stopping");
            break;
        }

        // Process results and detect gaps
        let batchUsers = [];
        let actualUsersInBatch = 0;
        const gaps = [];

        for (let i = 0; i < successfulResults.length; i++) {
            const result = successfulResults[i];
            const actualUsersReceived = result.users.length;
            const expectedForThisRequest = Math.min(
                expectedPerRequest,
                actualTotal - result.offset
            );

            batchUsers.push(...result.users);
            actualUsersInBatch += actualUsersReceived;

            // Check for gap in this specific request
            if (actualUsersReceived < expectedForThisRequest) {
                const gapStart = result.offset + actualUsersReceived;
                const gapEnd = Math.min(
                    result.offset + expectedPerRequest,
                    actualTotal
                );
                if (gapStart < gapEnd) {
                    gaps.push({ start: gapStart, end: gapEnd });
                }
            }
        }

        // Reconsolidate gaps sequentially to avoid conflicts
        for (const gap of gaps) {
            try {
                const gapResponse = await loadJSON(
                    `/load_friends_json?offset=${gap.start}`
                );
                const gapUsers = Array.isArray(gapResponse)
                    ? gapResponse.filter((user) => user && user.id)
                    : [];
                const neededUsers = gapUsers.slice(0, gap.end - gap.start);
                batchUsers.push(...neededUsers);
                actualUsersInBatch += neededUsers.length;
                console.log(
                    `Reconsolidated gap: ${neededUsers.length} users from offset ${gap.start}`
                );
            } catch (error) {
                console.warn(
                    `Failed to reconsolidate gap at offset ${gap.start}:`,
                    error
                );
            }
        }

        // Add users and update offset
        allUsers.push(...batchUsers);
        offset += requestsInBatch * expectedPerRequest;

        // Adjust total if we're getting fewer users than expected consistently
        if (actualUsersInBatch === 0) {
            console.warn("No users returned in batch, stopping load");
            break;
        }

        // If we got significantly fewer users, adjust our estimate
        const expectedUsersInBatch = Math.min(
            requestsInBatch * expectedPerRequest,
            actualTotal - (offset - requestsInBatch * expectedPerRequest)
        );
        if (actualUsersInBatch < expectedUsersInBatch * 0.5) {
            const newEstimate =
                offset -
                requestsInBatch * expectedPerRequest +
                actualUsersInBatch;
            if (newEstimate < actualTotal) {
                console.warn(
                    `Adjusting total estimate from ${actualTotal} to ${newEstimate} due to low response rate`
                );
                actualTotal = newEstimate;
            }
        }
    }

    // Remove duplicates
    const uniqueUsers = [];
    const seenIds = new Set();
    for (const user of allUsers) {
        if (!seenIds.has(user.id)) {
            seenIds.add(user.id);
            uniqueUsers.push(user);
        }
    }

    console.log(`Load all complete: ${uniqueUsers.length} unique users loaded`);
    return uniqueUsers;
}

/**
 * Creates load more buttons for pagination
 * @param {HTMLElement} container - The container to append buttons to
 * @param {number} loaded - Number of friends currently loaded
 * @param {number} total - Total number of friends available
 * @param {Function} addUsersCallback - Callback function to add users to the UI
 */
function createLoadMoreButtons(container, loaded, total, addUsersCallback) {
    const buttonContainer = createElement("div", container, {
        className: "flex-column",
    });

    // Load next batch (single request, ~10 friends)
    createElement("a", buttonContainer, {
        text: `more friends (${loaded}/${total})`,
        onclick: async (e) => {
            e.target.innerHTML = "loading...";
            try {
                const response = await loadJSON(
                    `/load_friends_json?offset=${loaded}`
                );
                const newUsers = Array.isArray(response)
                    ? response.filter((user) => user && user.id)
                    : [];
                e.target.parentElement.remove();
                addUsersCallback(newUsers);
            } catch (error) {
                e.target.innerHTML = "error loading friends";
                console.error("Error loading friends:", error);
            }
        },
    });

    // Load 10 batches (10 requests, ~100 friends)
    createElement("a", buttonContainer, {
        text: "more friends x10",
        onclick: async (e) => {
            e.target.innerHTML = "loading...";
            try {
                const newUsers = await loadFriendsInBatches(loaded, 10, total);
                e.target.parentElement.remove();
                addUsersCallback(newUsers);
            } catch (error) {
                e.target.innerHTML = "error loading friends";
                console.error("Error loading friends:", error);
            }
        },
    });

    // Load all remaining friends
    createElement("a", buttonContainer, {
        text: "load all",
        onclick: async (e) => {
            e.target.innerHTML = "loading...";
            try {
                const newUsers = await loadAllRemainingFriends(loaded, total);
                e.target.parentElement.remove();
                addUsersCallback(newUsers);
            } catch (error) {
                e.target.innerHTML = "error loading friends";
                console.error("Error loading friends:", error);
            }
        },
    });
}

/**
 * Opens the friends panel and displays paginated friends list
 * @param {HTMLElement} panel - The panel element to populate with friends content
 */
async function openFriends(panel) {
    createElement("a", panel, {
        className: "heading",
        text: "friends",
        href: "/cheat/people",
    });

    try {
        const friendsJson = await loadJSON("/friends_json");
        const total = friendsJson.count;

        if (total === 0) {
            createElement("span", panel, { text: "no friends :c" });
            return;
        }

        let loaded = 0;
        const container = createElement("div", panel, {
            className: "flex-column",
        });

        /**
         * Adds users to the UI and updates pagination controls
         * @param {Array} users - Array of user objects to add
         */
        const addUsers = (users) => {
            if (!Array.isArray(users)) {
                console.warn("Expected array of users, got:", users);
                return;
            }

            users.forEach((user) => {
                if (user && user.id) {
                    createUserRow(container, user);
                }
            });

            const validUsers = users.filter((user) => user && user.id);
            loaded += validUsers.length;

            console.log(
                `Added ${validUsers.length} users, total loaded: ${loaded}/${total}`
            );

            // Continue showing load more buttons if there are more friends to load
            if (loaded < total) {
                createLoadMoreButtons(container, loaded, total, addUsers);
            } else {
                console.log(`All ${loaded} friends loaded successfully`);
            }
        };

        // Initial load from the main response
        const initialUsers = Array.isArray(friendsJson.friends)
            ? friendsJson.friends.filter((user) => user && user.id)
            : [];
        addUsers(initialUsers);
    } catch (error) {
        createElement("span", panel, { text: "error loading friends" });
        console.error("Error in openFriends:", error);
    }
}

/**
 * Opens the online friends panel and displays currently online friends
 * @param {HTMLElement} panel - The panel element to populate with online friends content
 */
async function openOnlineFriends(panel) {
    createElement("a", panel, {
        className: "heading",
        text: "online friends",
        href: "/cheat/people",
    });

    try {
        const friendsJson = await loadJSON("/private_friends");
        const users = Array.isArray(friendsJson.online)
            ? friendsJson.online
            : [];

        if (users.length === 0) {
            createElement("span", panel, { text: "no online friends :c" });
            return;
        }

        const container = createElement("div", panel, {
            className: "flex-column",
        });
        users.forEach((user) => {
            if (user && user.id) {
                createUserRow(container, user);
            }
        });

        console.log(`Loaded ${users.length} online friends`);
    } catch (error) {
        createElement("span", panel, { text: "error loading online friends" });
        console.error("Error in openOnlineFriends:", error);
    }
}
