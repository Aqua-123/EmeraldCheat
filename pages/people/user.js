const TEXTAREA_STYLES = {
    post: "resize: none; min-height: 2.5rem; padding: 0.5rem; max-height: 10rem; overflow-y: auto;",
    postReply:
        "resize: none; min-height: 2rem; font-size: 0.875rem; padding: 0.5rem; max-height: 10rem; overflow-y: auto;",
    commentReply:
        "resize: none; min-height: 1.5rem; font-size: 0.75rem; padding: 0.5rem; max-height: 10rem; overflow-y: auto;",
};

function setupAutoExpandingTextarea(textarea) {
    const adjustHeight = () => {
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
    };

    textarea.addEventListener("input", adjustHeight);
    textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            textarea
                .closest("form")
                ?.dispatchEvent(new Event("submit", { cancelable: true }));
        }
    });
    adjustHeight();
}

function createTextarea(parent, styleType, placeholder) {
    const textarea = createElement("textarea", parent, {
        className: "fill-width normal-input",
        style: TEXTAREA_STYLES[styleType] || TEXTAREA_STYLES.post,
    });
    textarea.setAttribute("placeholder", placeholder);
    setupAutoExpandingTextarea(textarea);
    return textarea;
}

function createUserElement(
    container,
    user,
    timestamp,
    content,
    imageSize = "3rem"
) {
    const row = createElement("div", container, {
        className: "flex-row fill-width",
    });
    createElement("img", row, {
        className: "image flex-grow-0",
        style: `width: ${imageSize}; height: ${imageSize};`,
        src: userThumbnail(user),
        srcFull: userPicture(user),
    });

    const column = createElement("div", row, {
        className: "flex-grow-1 flex-column gap-0 flex-block-overflow",
    });

    const heading = createElement("div", column, {
        className: "flex-row center-items",
    });
    createElement("a", heading, {
        text: user.display_name,
        className: "text-highlighted",
        style: imageSize === "2.125rem" ? "font-size: 0.75rem" : "",
        href: `/cheat/people/user?id=${user.id}`,
    });
    createElement("span", heading, {
        text: timeSince(timestamp),
        style:
            imageSize === "2.125rem"
                ? "font-size: 0.625rem"
                : "font-size: 0.75rem",
    });

    createElement("span", column, {
        text: content,
        style: imageSize === "2.125rem" ? "font-size: 0.75rem" : "",
    });

    return { row, column };
}

//opens the user panel for the given user ID
async function openUser(panel, userId) {
    userId ??= parseInt(query("id"));
    if (!userId) return;
    let userJson = await loadJSON(`/profile_json?id=${userId}`);
    if (!userJson) return;
    let user = userJson.user;
    if (!user) return;

    await addUserHeader(panel, userJson, true);

    if (currentUser.mod) {
        let quickBanContainer = createElement("div", panel, {
            className: "quick-bans",
        });

        let banOptions = [];
        if (user.temp) {
            banOptions.push({
                name: "cp/csa",
                duration: ban3d.value,
                reason: banCSA.value,
            });
            banOptions.push({
                name: "illegal",
                duration: ban3d.value,
                reason: banIllegal.value,
            });
        } else {
            banOptions.push({
                name: "any illegal",
                duration: ban10y.value,
                reason: banPerm.value,
            });
        }
        banOptions.push(...quickBans);

        for (let quickBan of banOptions) {
            createElement("a", quickBanContainer, {
                className: "small-button",
                text: quickBan.name,
                onclick: async (e) => {
                    if (e.target.classList.contains("confirm")) {
                        e.target.classList.remove("confirm");
                        e.target.innerHTML = "banning...";
                        await banUser(
                            user.id,
                            quickBan.duration,
                            quickBan.reason
                        );
                        if (quickBan.duration >= ban10y.value) {
                            navigator.clipboard.writeText(
                                `${
                                    user.platinum || user.gold
                                        ? "[Paying user]\n"
                                        : ""
                                }${user.display_name} #${user.username} // ${
                                    user.id
                                }\n`
                            );
                        }
                        e.target.innerHTML = quickBan.name;
                        if (!e.target.classList.contains("text-highlighted")) {
                            e.target.classList.add("text-highlighted");
                        }
                    } else {
                        e.target.classList.add("confirm");
                    }
                },
            });
        }
    }

    if (user.bio !== "This user has not filled in their profile yet")
        createElement("span", panel, {
            className: "text-centered",
            text: user.bio,
        });

    if (user.interests.length > 0) {
        let interestContainer = createElement("div", panel, {
            className: "interests",
        });
        for (let interest of user.interests) {
            createElement("span", interestContainer, {
                text: interest.name,
                className: susInterestParts.some(
                    (p) =>
                        interest.name.split(" ").includes(p) ||
                        interest.name === p.split("").join(" ")
                )
                    ? "text-red"
                    : "",
            });
        }
    }

    let feedJson = await loadJSON(`/microposts_default?id=${userJson.wall_id}`);
    if (!feedJson) {
        alert("couldn't load feed :(");
    } else {
        let postForm = createElement("form", panel, {
            className: "fill-width",
        });
        let postInput = createTextarea(postForm, "post", "post something...");
        let feedContainer;

        async function addPost(
            poster,
            timestamp,
            content,
            postId,
            commentIds,
            prepend
        ) {
            let postRow = createElement("div", feedContainer, {
                className: "flex-row fill-width",
                prepend: prepend,
            });

            let { column: postColumn } = createUserElement(
                postRow,
                poster,
                timestamp,
                content
            );
            let postMainColumn = postColumn;

            // Add reply button to post
            let postReplyButton = createElement("a", postMainColumn, {
                text: "reply",
                className: "text-highlighted",
                style: "font-size: 0.75rem; cursor: pointer; margin-top: 0.5rem;",
                onclick: (e) => {
                    e.preventDefault();
                    let existingReplyForm =
                        postMainColumn.querySelector(".post-reply-form");
                    if (existingReplyForm) {
                        existingReplyForm.remove();
                        postReplyButton.textContent = "reply";
                        return;
                    }

                    let postReplyForm = createElement("form", postMainColumn, {
                        className: "post-reply-form",
                        style: "margin-top: 0.5rem;",
                    });

                    let postReplyInput = createTextarea(
                        postReplyForm,
                        "postReply",
                        `Reply to ${poster.display_name}'s post...`
                    );
                    setTimeout(() => postReplyInput.focus(), 0);

                    postReplyForm.addEventListener("submit", async (e) => {
                        e.preventDefault();
                        if (!postReplyInput.value.trim()) return;

                        await sendActionRequest(
                            `/comments_create?id=${postId}&content=${encodeURIComponent(
                                postReplyInput.value
                            )}`,
                            "GET"
                        );

                        let commentsSection = postColumn.querySelector("form");
                        if (commentsSection?.parentElement) {
                            createUserElement(
                                commentsSection.parentElement,
                                currentUser,
                                new Date().toISOString(),
                                postReplyInput.value,
                                "2.125rem"
                            );
                        }

                        postReplyForm.remove();
                        postReplyButton.textContent = "reply";
                    });

                    postReplyButton.textContent = "cancel";
                },
            });

            await addComments(postColumn, commentIds, postId);
        }

        postForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            let post = await sendActionRequest(
                `/microposts_create?id=${
                    userJson.wall_id
                }&content=${encodeURIComponent(postInput.value)}&picture=`,
                "GET"
            );
            await addPost(
                currentUser,
                new Date().toISOString(),
                postInput.value,
                post.micropost.id,
                [],
                true
            );
            postInput.value = "";
            postInput.style.height = "2.5rem"; // Reset height after posting
        });

        let feed = feedJson.microposts;
        feedContainer = createElement("div", panel, {
            className: "flex-column fill-width",
        });
        let nextIndex = 0;
        async function loadNextPosts() {
            const limit = Math.min(nextIndex + 6, feed.length);
            const postPromises = [];

            while (nextIndex < limit) {
                postPromises.push(
                    loadJSON(`/micropost_json?id=${feed[nextIndex++]}`, true)
                );
            }

            const posts = await Promise.all(postPromises);
            const addPostPromises = posts
                .filter((post) => post)
                .map((post) =>
                    addPost(
                        post.author,
                        post.micropost.created_at,
                        post.micropost.content,
                        post.micropost.id,
                        post.comments,
                        false
                    )
                );

            if (nextIndex < feed.length) {
                createElement("a", feedContainer, {
                    text: `older posts (${limit}/${feed.length})`,
                    onclick: (e) => {
                        e.target.remove();
                        loadNextPosts();
                    },
                });
            }

            await Promise.all(addPostPromises);
        }
        await loadNextPosts();
    }
}

async function addComments(element, commentIds, postId) {
    let commentForm = createElement("form", element, {
        className: "flex-grow-1",
    });

    function addComment(commenter, timestamp, content, prepend) {
        let commentContainer = createElement("div", element, {
            after: prepend ? commentForm : null,
        });

        let { column: commentColumn } = createUserElement(
            commentContainer,
            commenter,
            timestamp,
            content,
            "2.125rem"
        );

        // Add reply button
        let replyButton = createElement("a", commentColumn, {
            text: "reply",
            className: "text-highlighted",
            style: "font-size: 0.625rem; cursor: pointer; margin-top: 0.25rem;",
            onclick: (e) => {
                e.preventDefault();
                let existingReplyForm =
                    commentColumn.querySelector(".reply-form");
                if (existingReplyForm) {
                    existingReplyForm.remove();
                    replyButton.textContent = "reply";
                    return;
                }

                let replyForm = createElement("form", commentColumn, {
                    className: "reply-form",
                    style: "margin-top: 0.5rem; margin-left: 1rem;",
                });

                let replyInput = createTextarea(
                    replyForm,
                    "commentReply",
                    `Reply to ${commenter.display_name}...`
                );
                setTimeout(() => replyInput.focus(), 0);

                replyForm.addEventListener("submit", async (e) => {
                    e.preventDefault();
                    if (!replyInput.value.trim()) return;

                    const replyContent = `@${commenter.display_name} ${replyInput.value}`;
                    await sendActionRequest(
                        `/comments_create?id=${postId}&content=${encodeURIComponent(
                            replyContent
                        )}`,
                        "GET"
                    );

                    addComment(
                        currentUser,
                        new Date().toISOString(),
                        replyContent,
                        true
                    );
                    replyForm.remove();
                    replyButton.textContent = "reply";
                });

                replyButton.textContent = "cancel";
            },
        });
    }

    commentForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!commentInput.value.trim()) return;

        await sendActionRequest(
            `/comments_create?id=${postId}&content=${encodeURIComponent(
                commentInput.value
            )}`,
            "GET"
        );
        addComment(
            currentUser,
            new Date().toISOString(),
            commentInput.value,
            true
        );
        commentInput.value = "";
        commentInput.style.height = "2rem";
    });

    let nextIndex = 0;
    async function loadNextComments() {
        const limit = Math.min(nextIndex + 5, commentIds.length);
        const commentPromises = [];

        while (nextIndex < limit) {
            commentPromises.push(
                loadJSON(`/comment_json?id=${commentIds[nextIndex++]}`, true)
            );
        }

        const comments = await Promise.all(commentPromises);
        comments.forEach((commentJson) => {
            if (commentJson) {
                addComment(
                    commentJson.user,
                    commentJson.comment.created_at,
                    commentJson.comment.content,
                    false
                );
            }
        });

        if (nextIndex < commentIds.length) {
            createElement("a", element, {
                text: `older comments (${limit}/${commentIds.length})`,
                onclick: (e) => {
                    e.target.remove();
                    loadNextComments();
                },
            });
        }
    }
    await loadNextComments();
}

async function addUserHeader(panel, userJson, isMain) {
    let user = userJson.user;
    let statusJson = currentUser.mod
        ? await loadJSON(`/user_status?id=${userJson.user.id}`, true)
        : null;

    let mainRow = createElement("div", panel, {
        className: "flex-row",
        style: "align-items: start",
    });

    createElement("img", mainRow, {
        className: "image",
        style: "width: 8.5rem; height: 8.5rem",
        src: user.display_picture,
    });

    let detailCol = createElement("div", mainRow, {
        className: "flex-grow-1 flex-column",
        style: "gap: 0.25rem",
    });
    createElement("a", detailCol, {
        className:
            "heading" + (statusJson && statusJson.banned ? " text-red" : ""),
        text: user.display_name,
        href: "/cheat/people",
    });
    createElement("span", detailCol, {
        text: `${user.karma} pts, ${translateGender(user.gender)}`,
    });
    createElement("span", detailCol, {
        text: user.online
            ? "online now"
            : "online " + timeSince(user.last_logged_in_at),
        style:
            Math.floor(new Date() - new Date(user.last_logged_in_at)) >
                1800000 && !user.online
                ? " color: var(--red);"
                : null,
    });
    createElement("span", detailCol, {
        text: `${"joined " + timeSince(user.created_at)}`,
    });
    createElement("span", detailCol, {
        text: roleName(user),
        style:
            user.mod || user.master
                ? "color: var(--accent);"
                : user.gold || user.platinum
                ? "color: var(--gold);"
                : null,
    });

    createElement("span", panel, {
        text: "#" + user.username,
        className: "flex-block-overflow",
    });

    let buttonRow = createElement("div", panel, { className: "flex-row" });
    if (currentUser.mod) {
        if (isMain) {
            createElement("a", buttonRow, {
                className: "button",
                text: "mod",
                href: `/cheat/mod/user?id=${user.id}`,
            });
        } else {
            createElement("a", buttonRow, {
                className: "button",
                text: "back",
                onclick: (e) => window.history.back(),
            });
        }
    }
    if (user.id !== currentUser.id) {
        let removeElement, pendingElement, addElement, messageElement;
        removeElement = createElement("a", buttonRow, {
            text: "remove",
            className: "button hidden",
            onclick: async (e) => {
                await sendActionRequest(`/friends_destroy?id=${user.id}`);
                removeElement.classList.add("hidden");
                addElement.classList.remove("hidden");
                messageElement.classList.add("hidden");
            },
        });
        pendingElement = createElement("a", buttonRow, {
            text: "pending",
            className: "button hidden",
            onclick: async (e) => {
                await sendActionRequest(`/friends_destroy?id=${user.id}`);
                pendingElement.classList.add("hidden");
                addElement.classList.remove("hidden");
            },
        });
        addElement = createElement("a", buttonRow, {
            text: "add",
            className: "button hidden",
            onclick: async (e) => {
                await sendActionRequest(`/friend_create?friend_id=${user.id}`);
                addElement.classList.add("hidden");
                pendingElement.classList.remove("hidden");
            },
        });
        messageElement = createElement("a", buttonRow, {
            text: "message",
            className: "button hidden",
            href: `/cheat/chat/direct?id=${user.id}`,
        });

        if (userJson.friend) {
            removeElement.classList.remove("hidden");
            messageElement.classList.remove("hidden");
        } else if (userJson.friend_request_sent) {
            pendingElement.classList.remove("hidden");
        } else {
            addElement.classList.remove("hidden");
        }
    }
}
