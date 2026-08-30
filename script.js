const TWITCH_CLIENT_ID = "l2f4c48jfsoflno8qg5vhoy79zw4pd";
let CHANNEL = null;
let TWITCH_USER_ID = null;

const TWITCH_OAUTH_SCOPES = [
    "user:read:chat"
];

let accessToken = null;
let authenticatedUserId = null;
let authenticatedUsername = null;

let eventSubSocket = null;
let eventSubSessionId = null;
let eventSubReconnectUrl = null;
let eventSubReconnectTimer = null;

let twitchAuthPromise = null;

const sevenTVEmotes = new Map();
const sevenTVUsers = new Map();

const twitchBadges = new Map();
const ffzBadges = new Map();
const chatterinoBadges = new Map();
const sevenTVBadges = new Map();

const ffzRoomBadges = {
    vip: null,
    moderator: null
};

const twitchEmotes = new Map();
const ffzEmotes = new Map();
const bttvEmotes = new Map();

const externalBadgeCache = new Map();
const externalBadgePromises = new Map();
const badgeImageCache = new Map();

const sevenTVColors = new Map();
const sevenTVColorPromises = new Map();

const SEVENTV_EMOTE_FLAGS = Object.freeze({
    ZERO_WIDTH: 256
});

const ffzEffects = new Map([
    ["ffzX", { effects: ["flipX"] }],
    ["ffzY", { effects: ["flipY"] }],
    ["ffzW", { effects: ["growX"] }],
    ["ffzShrinkX", { effects: ["shrinkX"] }],
    ["ffzRainbow", { effects: ["rainbow"] }],
    ["ffzHyperRed", { effects: ["hyperRed"] }],
    ["ffzShake", { effects: ["shake"] }],
    ["ffzCursed", { effects: ["cursed"] }],
    ["ffzJam", { effects: ["jam"] }],
    ["ffzBounce", { effects: ["bounce"] }],
    ["ffzSlide", { effects: ["slide"] }],
    ["ffzArrive", { effects: ["appear"] }],
    ["ffzLeave", { effects: ["leave"] }],
    ["ffzSpin", { effects: ["rotate"] }],
    ["ffzPhotocopy", { effects: ["photocopy"] }],
    ["FlipX", { effects: ["flipX"] }],
    ["FlipY", { effects: ["flipY"] }],
    ["GrowX", { effects: ["growX"] }],
    ["ShrinkX", { effects: ["shrinkX"] }],
    ["Rainbow", { effects: ["rainbow"] }],
    ["HyperRed", { effects: ["hyperRed"] }],
    ["HyperShake", { effects: ["shake"] }],
    ["Cursed", { effects: ["cursed"] }],
    ["Jam", { effects: ["jam"] }],
    ["Bounce", { effects: ["bounce"] }],
    ["Slide", { effects: ["slide"] }],
    ["Appear", { effects: ["appear"] }],
    ["Leave", { effects: ["leave"] }],
    ["Rotate", { effects: ["rotate"] }],
    ["Photocopy", { effects: ["photocopy"] }]
]);

const FFZ_EFFECT_FLAGS = Object.freeze({
    HIDDEN: 1,
    GROW_X: 8,
    RAINBOW: 2048,
    HYPER_RED: 4096,
    HYPER_SHAKE: 8192,
    CURSED: 16384,
    JAM: 32768,
    BOUNCE: 65536
});

let twemojiReady = null;

const messageElements = new Map();
const userMessageElements = new Map();

function getOAuthRedirectUri() {
    return window.location.origin + window.location.pathname;
}

const params = new URLSearchParams(
    window.location.search
);

let sevenTVEventSocket = null;
let sevenTVSessionId = null;
let sevenTVEmoteSetId = null;
let sevenTVHeartbeatTimeout = null;
let sevenTVReconnectTimer = null;
 
const SEVENTV_OPCODES = Object.freeze({
    DISPATCH: 0,
    HELLO: 1,
    HEARTBEAT: 2,
    RECONNECT: 4,
    ACK: 5,
    ERROR: 6,
    END_OF_STREAM: 7,
    IDENTIFY: 33,
    RESUME: 34,
    SUBSCRIBE: 35,
    UNSUBSCRIBE: 36
});

function connectSevenTVEvents(emoteSetId, url = null) {
    if (!emoteSetId) {
        return;
    }
 
    sevenTVEmoteSetId = emoteSetId;
 
    const socketUrl = url || "wss://events.7tv.io/v3";
 
    console.log("Connecting to 7TV EventAPI:", socketUrl);
 
    const socket = new WebSocket(socketUrl);
    sevenTVEventSocket = socket;
 
    socket.onopen = () => {
        console.log("Connected to 7TV EventAPI WebSocket.");
    };
 
    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleSevenTVEventMessage(data);
        } catch (error) {
            console.error("7TV EventAPI message error:", error);
        }
    };
 
    socket.onerror = (error) => {
        console.error("7TV EventAPI WebSocket error:", error);
    };
 
    socket.onclose = (event) => {
        console.log("7TV EventAPI WebSocket closed:", event.code, event.reason);
 
        sevenTVEventSocket = null;
        sevenTVSessionId = null;
 
        clearTimeout(sevenTVHeartbeatTimeout);
        clearTimeout(sevenTVReconnectTimer);
 
        sevenTVReconnectTimer = setTimeout(() => {
            if (sevenTVEmoteSetId && !sevenTVEventSocket) {
                connectSevenTVEvents(sevenTVEmoteSetId);
            }
        }, 3000);
    };
 
    return socket;
}
 
function handleSevenTVEventMessage(data) {
    const op = data?.op;
 
    if (op === SEVENTV_OPCODES.HELLO) {
        sevenTVSessionId = data.d?.session_id || null;
 
        console.log("7TV EventAPI session:", sevenTVSessionId);
 
        resetSevenTVHeartbeatWatchdog(data.d?.heartbeat_interval);
 
        subscribeToEmoteSetUpdates(sevenTVEmoteSetId);
 
        return;
    }
 
    if (op === SEVENTV_OPCODES.HEARTBEAT) {
        resetSevenTVHeartbeatWatchdog(data.d?.heartbeat_interval);
        return;
    }
 
    if (op === SEVENTV_OPCODES.RECONNECT) {
        console.log("7TV requested EventAPI reconnect.");
 
        if (sevenTVEventSocket) {
            sevenTVEventSocket.close();
        }
 
        return;
    }
 
    if (op === SEVENTV_OPCODES.ERROR) {
        console.error("7TV EventAPI error:", data.d);
        return;
    }
 
    if (op === SEVENTV_OPCODES.DISPATCH) {
        const type = data.d?.type;
 
        if (type === "emote_set.update") {
            handleSevenTVEmoteSetUpdate(data.d.body);
        }
 
        return;
    }
}
 
function resetSevenTVHeartbeatWatchdog(intervalMs) {
    clearTimeout(sevenTVHeartbeatTimeout);
 
    if (!intervalMs) {
        return;
    }

    sevenTVHeartbeatTimeout = setTimeout(() => {
        console.warn("7TV EventAPI heartbeat timeout, reconnecting.");
 
        if (sevenTVEventSocket) {
            sevenTVEventSocket.close();
        }
    }, intervalMs * 2);
}
 
function subscribeToEmoteSetUpdates(emoteSetId) {
    if (!sevenTVEventSocket || !emoteSetId) {
        return;
    }
 
    const payload = {
        op: SEVENTV_OPCODES.SUBSCRIBE,
        d: {
            type: "emote_set.update",
            condition: {
                object_id: emoteSetId
            }
        }
    };
 
    sevenTVEventSocket.send(JSON.stringify(payload));
 
    console.log("Subscribed to 7TV emote_set.update for:", emoteSetId);
}
 
function handleSevenTVEmoteSetUpdate(body) {
    if (!body) {
        return;
    }
 
    for (const entry of body.pulled || []) {
        const name = entry?.old_value?.name;
 
        if (name) {
            sevenTVEmotes.delete(name);
        }
    }
 
    for (const entry of body.pushed || []) {
        if (entry?.value) {
            add7TVEmote(entry.value);
        }
    }
 
    for (const entry of body.updated || []) {
        const oldName = entry?.old_value?.name;
 
        if (oldName) {
            sevenTVEmotes.delete(oldName);
        }
 
        if (entry?.value) {
            add7TVEmote(entry.value);
        }
    }
 
    console.log(
        `7TV emote set updated: +${(body.pushed || []).length} ` +
        `-${(body.pulled || []).length} ` +
        `~${(body.updated || []).length}`
    );
}
 
function disconnectSevenTVEvents() {
    clearTimeout(sevenTVHeartbeatTimeout);
    clearTimeout(sevenTVReconnectTimer);
 
    sevenTVEmoteSetId = null;
 
    if (sevenTVEventSocket) {
        sevenTVEventSocket.close();
        sevenTVEventSocket = null;
    }
}

function decodeOverlaySettings() {
    const encoded =
        params.get("settings");

    if (!encoded) {
        return {};
    }

    try {
        const json =
            decodeURIComponent(
                atob(
                    encoded
                        .replace(/-/g, "+")
                        .replace(/_/g, "/")
                )
            );

        return JSON.parse(json) || {};

    } catch (error) {
        console.error(
            "Failed to decode overlay settings:",
            error
        );

        return {};
    }
}

const overlaySettings =
    decodeOverlaySettings();

const selectedChannel =
    (
        params.get("channel") ||
        ""
    )
        .trim()
        .toLowerCase()
        .replace(/^#/, "");

let backgroundEnabled =
    overlaySettings.background === true;

document.body.classList.toggle(
    "has-background",
    backgroundEnabled
);

let fade =
    overlaySettings.fade === false
        ? false
        : Number(
            overlaySettings.fade ?? 15
        );

let badgesEnabled =
    overlaySettings.badges !== false;

let scale =
    Number(
        overlaySettings.scale ?? 0.5
    );

if (!Number.isFinite(scale)) {
    scale = 0.5;
}

scale =
    Math.max(
        0.25,
        Math.min(scale, 3)
    );

document.documentElement.style.setProperty(
    "--chat-scale",
    scale
);

let wrapEnabled =
    overlaySettings.wrap === true;

let showUnlisted7TV =
    overlaySettings.unlisted !== false;

function saveTwitchAuth() {
    if (!accessToken) {
        return;
    }

    localStorage.setItem(
        "twitch_overlay_access_token",
        accessToken
    );

    if (authenticatedUserId) {
        localStorage.setItem(
            "twitch_overlay_user_id",
            authenticatedUserId
        );
    }

    if (authenticatedUsername) {
        localStorage.setItem(
            "twitch_overlay_username",
            authenticatedUsername
        );
    }
}


function loadSavedTwitchAuth() {
    accessToken =
        localStorage.getItem(
            "twitch_overlay_access_token"
        );

    authenticatedUserId =
        localStorage.getItem(
            "twitch_overlay_user_id"
        );

    authenticatedUsername =
        localStorage.getItem(
            "twitch_overlay_username"
        );

    return Boolean(accessToken);
}


function clearTwitchAuth() {
    accessToken = null;
    authenticatedUserId = null;
    authenticatedUsername = null;

    localStorage.removeItem(
        "twitch_overlay_access_token"
    );

    localStorage.removeItem(
        "twitch_overlay_user_id"
    );

    localStorage.removeItem(
        "twitch_overlay_username"
    );
}


function startTwitchLogin() {
    const redirectUri =
        getOAuthRedirectUri();

    const oauthParams =
        new URLSearchParams({
            client_id:
                TWITCH_CLIENT_ID,

            redirect_uri:
                redirectUri,

            response_type:
                "token",

            scope:
                TWITCH_OAUTH_SCOPES.join(" ")
        });

    window.location.href =
        "https://id.twitch.tv/oauth2/authorize?" +
        oauthParams.toString();
}

function readOAuthTokenFromHash() {
    if (!window.location.hash) {
        return null;
    }

    const hash =
        window.location.hash.substring(1);

    const params =
        new URLSearchParams(hash);

    const token =
        params.get("access_token");

    if (!token) {
        return null;
    }

    window.history.replaceState(
        {},
        document.title,
        window.location.pathname +
        window.location.search
    );

    return token;
}


async function validateTwitchToken() {
    if (!accessToken) {
        return false;
    }

    try {
        const response =
            await fetch(
                "https://id.twitch.tv/oauth2/validate",
                {
                    headers: {
                        Authorization:
                            `OAuth ${accessToken}`
                    }
                }
            );

        if (!response.ok) {
            throw new Error(
                `Token validation failed: ${response.status}`
            );
        }

        const data =
            await response.json();

        authenticatedUserId =
            String(data.user_id);

        authenticatedUsername =
            data.login ||
            data.user_name ||
            authenticatedUsername;

        TWITCH_USER_ID = authenticatedUserId;
        CHANNEL = authenticatedUsername;

        saveTwitchAuth();

        return true;

    } catch (error) {
        console.error(
            "Twitch OAuth validation error:",
            error
        );

        clearTwitchAuth();

        return false;
    }
}

async function getTwitchUserByLogin(login) {
    if (!accessToken || !login) {
        return null;
    }

    try {
        const response =
            await fetch(
                `https://api.twitch.tv/helix/users?login=${encodeURIComponent(
                    login
                )}`,
                {
                    headers: {
                        "Client-ID":
                            TWITCH_CLIENT_ID,

                        "Authorization":
                            `Bearer ${accessToken}`
                    }
                }
            );

        if (!response.ok) {
            throw new Error(
                `Twitch user lookup failed: ${response.status}`
            );
        }

        const data =
            await response.json();

        return data.data?.[0] || null;

    } catch (error) {
        console.error(
            "Twitch channel lookup error:",
            error
        );

        return null;
    }
}

async function resolveOverlayChannel() {
    if (!selectedChannel) {
        return false;
    }

    const channelUser =
        await getTwitchUserByLogin(
            selectedChannel
        );

    if (!channelUser) {
        console.error(
            "Twitch channel does not exist:",
            selectedChannel
        );

        showChannelError(
            `Twitch channel "${selectedChannel}" could not be found.`
        );

        return false;
    }

    CHANNEL =
        channelUser.login;

    TWITCH_USER_ID =
        channelUser.id;

    return true;
}

async function ensureTwitchAuth() {
    if (twitchAuthPromise) {
        return twitchAuthPromise;
    }

    twitchAuthPromise =
        (async () => {
            const hashToken =
                readOAuthTokenFromHash();

            if (hashToken) {
                accessToken =
                    hashToken;

                await validateTwitchToken();

                if (accessToken) {
                    saveTwitchAuth();
                }
            } else {
                loadSavedTwitchAuth();

                if (accessToken) {
                    const valid =
                        await validateTwitchToken();

                    if (!valid) {
                        return false;
                    }
                }
            }

            if (!accessToken) {
                showTwitchLoginScreen();

                return false;
            }

            return true;
        })();


        return twitchAuthPromise;
}

async function loadPreviewEmotes() {
    const previousChannel = CHANNEL;
    const previousUserId = TWITCH_USER_ID;

    CHANNEL = PREVIEW_CHANNEL;
    TWITCH_USER_ID = PREVIEW_TWITCH_USER_ID;

    seedPreviewTwitchBadges();

    const tasks = [
        load7TVGlobalEmotes(),
        load7TVEmotes(),
        loadFFZEmotes(),
        loadBTTVEmotes(),
        loadFFZBadges(),
        loadChatterinoBadges()
    ];

    if (accessToken) {
        tasks.push(loadTwitchBadges());
    }

    await Promise.allSettled(tasks);

    CHANNEL = previousChannel;
    TWITCH_USER_ID = previousUserId;
}

const PREVIEW_TWITCH_BADGES = {
    "48hgold/1": {
        title: "48 Hour Sub Gold",
        url: "https://static-cdn.jtvnw.net/badges/v1/af11047c-a3b6-424d-808e-7fc7aaa0e74d/3"
    },
    "founder/1": {
        title: "Founder",
        url: "https://static-cdn.jtvnw.net/badges/v1/511b78a9-ab37-472f-9569-457753bbe7d3/3"
    },
    "subtember/1": {
        title: "Subtember",
        url: "https://static-cdn.jtvnw.net/badges/v1/a9c01f28-179e-486d-a4c7-2277e4f6adb4/3"
    },
    "subscriber/1": {
        title: "subscriber",
        url: "https://static-cdn.jtvnw.net/badges/v1/3a37cb42-c1dc-48c1-9262-6266ca29ebf3/3"
    },
    "pikachu/1": {
        title: "pikachu",
        url: "https://static-cdn.jtvnw.net/badges/v1/20f214cf-36b0-4b42-8992-3b769bcb0461/3"
    },
};

function seedPreviewTwitchBadges() {
    for (const [key, badge] of Object.entries(PREVIEW_TWITCH_BADGES)) {
        twitchBadges.set(key, {
            title: badge.title,
            url_1x: badge.url,
            url_2x: badge.url,
            url_4x: badge.url
        });
    }
}

const PREVIEW_CHANNEL = "marz_dev";
const PREVIEW_TWITCH_USER_ID = "458139207";

const previewMessages = [
    [
        "Dodorej",
        "订阅层|成为订阅者您现在可以订阅并获得些额外福利包括徽章访问零宽度表情参与即将到来的全球表情抽奖等什么是是全新的表情服务和扩展免费提供自定7TV ffzCursed ffzW ffzSpin 7TV CHECK 订阅层|成为订阅者您现在可以订阅并获得些额外福利包括徽章访问零宽度表情参与即将到来的全球表情抽奖等什么是是全新的表情服务和扩展免费提供自定7TV ffzCursed ffzW ffzSpin 7TV CHECK 订阅层|成为订阅者您现在可以订阅并获得些额外福利包括徽章访问零宽度表情参与即将到来的全球表情抽奖等什么是是全新的表情服务和扩展免费提供自定7TV ffzCursed ffzW ffzSpin 7TV CHECK 订阅层|成为订阅者您现在可以订阅并获得些额外福利包括徽章访问零宽度表情参与即将到来的全球表情抽奖等什么是是全新的表情服务和扩展免费提供自定7TV ffzCursed ffzW ffzSpin 7TV CHECK 订阅层|成为订阅者您现在可以订阅并获得些额外福利包括徽章访问零宽度表情参与即将到来的全球表情抽奖等什么是是全新的表情服务和扩展免费提供自定7TV ffzCursed ffzW ffzSpin 7TV CHECK 订阅层|成为订阅者您现在可以订阅并获得些额外福利包括徽章访问零宽度表情参与即将到来的全球表情抽奖等什么是是全新的表情服务和扩展免费提供自定7TV ffzCursed ffzW ffzSpin 7TV CHECK 订阅层|成为订阅者您现在可以订阅并获得些额外福利包括徽章访问零宽度表情参与即将到来的全球表情抽奖等什么是是全新的表情服务和扩展免费提供自定7TV ffzCursed ffzW ffzSpin 7TV CHECK",
        "#FF0000",
        "504585840",
        { badges: "vip/1,founder/1,48hgold/1" }
    ],
    [
        "marz_dev",
        "wowie an overlay with support for ffz effects",
        "#8A2BE2",
        "1208634685",
        { badges: "broadcaster/1,subscriber/1,subtember/1" }
    ],
    [
        "XDR412",
        "DOVE! RAAAAAAH RAAAAAAH RAAAAAAH",
        "#DAA520",
        "195845559",
        { badges: "vip/1,pikachu/1" }
    ]
];

let currentPreviewMessage = 0;

function runPreviewMessage() {
    const message = previewMessages[currentPreviewMessage];

    addPreviewMessage(...message);

    currentPreviewMessage =
        (currentPreviewMessage + 1) % previewMessages.length;

    const delay = Math.random() * 1000 + 3000;

    setTimeout(runPreviewMessage, delay);
}


function showTwitchLoginScreen() {
    let screen =
        document.getElementById(
            "twitch-login-screen"
        );

    if (screen) {
        return;
    }

    screen =
        document.createElement("div");

    screen.id =
        "twitch-login-screen";

    screen.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 999999;

        display: flex;

        background: #18181b;
        color: #ffffff;

        font-family:
            Arial,
            Helvetica,
            sans-serif;

        overflow: hidden;
    `;

    const sidebar =
        document.createElement("div");

    sidebar.style.cssText = `
        width: 292px;
        min-width: 292px;
        height: 100vh;

        box-sizing: border-box;

        padding: 24px 19px 18px;

        background: #202024;

        border-right:
            1px solid #35353b;

        overflow-y: auto;
    `;

    const preview =
        document.createElement("div");

    preview.style.cssText = `
        flex: 1;
        min-width: 0;
        height: 100vh;

        background: #18181b;

        display: flex;
        flex-direction: column;
        overflow: hidden;
    `;

    let previewChat =
        document.getElementById("chat");

    if (!previewChat) {
        previewChat =
            document.createElement("div");

        previewChat.id = "chat";
    }

    previewChat.dataset.originalPosition =
        previewChat.style.position || "";
    previewChat.dataset.originalInset =
        previewChat.style.inset || "";
    previewChat.dataset.originalTop =
        previewChat.style.top || "";
    previewChat.dataset.originalLeft =
        previewChat.style.left || "";
    previewChat.dataset.originalRight =
        previewChat.style.right || "";
    previewChat.dataset.originalBottom =
        previewChat.style.bottom || "";
    previewChat.dataset.originalWidth =
        previewChat.style.width || "";
    previewChat.dataset.originalHeight =
        previewChat.style.height || "";
    previewChat.dataset.originalZIndex =
        previewChat.style.zIndex || "";


    previewChat.style.position = "relative";
    previewChat.style.inset = "auto";
    previewChat.style.top = "auto";
    previewChat.style.left = "auto";
    previewChat.style.right = "auto";
    previewChat.style.bottom = "auto";
    previewChat.style.width = "98%";  
    previewChat.style.height = "auto";
    previewChat.style.zIndex = "auto";

    previewChat.style.flex = "1";
    previewChat.style.minHeight = "0";
    previewChat.style.overflowY = "auto";
    previewChat.style.display = "flex";
    previewChat.style.flexDirection = "column";
    previewChat.style.justifyContent = "flex-end";

    previewChat.innerHTML = "";

    preview.appendChild(previewChat);

    loadPreviewEmotes();

    const title =
        document.createElement("div");

    title.textContent =
        "Marz' Chat Overlay";

    title.style.cssText = `
        font-size: 19px;
        font-weight: 700;

        color: #ffffff;

        margin-bottom: 4px;
    `;

    const description =
        document.createElement("div");

    description.textContent =
        "Configure your Twitch chat overlay.";

    description.style.cssText = `
        font-size: 12px;

        color: #a8a8b3;

        margin-bottom: 18px;
    `;

    const channelLabel =
        document.createElement("label");

    channelLabel.textContent =
        "Twitch Channel";

    channelLabel.style.cssText = `
        display: block;

        font-size: 12px;
        font-weight: 600;

        color: #e2e2e8;

        margin-bottom: 6px;
    `;

    const channelInput =
        document.createElement("input");

    channelInput.type =
        "text";

    channelInput.placeholder =
        "channelname";

    channelInput.value =
        selectedChannel || "";

    channelInput.autocomplete =
        "off";

    channelInput.spellcheck =
        false;

    channelInput.style.cssText = `
        width: 100%;
        height: 32px;

        box-sizing: border-box;

        padding: 0 10px;

        border:
            1px solid #46464f;

        border-radius: 6px;

        background: #151518;

        color: #ffffff;

        outline: none;

        font-size: 12px;

        transition:
            border-color .15s ease;
    `;

    const settingsTitle =
        document.createElement("div");

    settingsTitle.textContent =
        "Overlay Settings";

    settingsTitle.style.cssText = `
        margin-top: 17px;
        margin-bottom: 9px;

        font-size: 12px;
        font-weight: 600;

        color: #e2e2e8;
    `;

    const settings =
        document.createElement("div");

    settings.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;

    function createToggle(
        label,
        key,
        checked
    ) {
        const wrapper =
            document.createElement("label");

        wrapper.style.cssText = `
            display: flex;
            align-items: center;

            gap: 8px;

            height: 20px;

            cursor: pointer;

            font-size: 12px;

            color: #d8d8df;

            user-select: none;
        `;

        const checkbox =
            document.createElement("input");

        checkbox.type =
            "checkbox";

        checkbox.checked =
            checked;

        checkbox.dataset.setting =
            key;

        checkbox.style.cssText = `
            position: absolute;
            opacity: 0;
            pointer-events: none;
        `;

        const toggle =
            document.createElement("span");

        toggle.style.cssText = `
            width: 34px;
            height: 18px;

            border-radius: 20px;

            background:
                ${checked
                    ? "#9147ff"
                    : "#4a4a52"};

            position: relative;

            flex-shrink: 0;

            transition:
                background .15s ease;
        `;

        const knob =
            document.createElement("span");

        knob.style.cssText = `
            position: absolute;

            width: 14px;
            height: 14px;

            border-radius: 50%;

            background: #ffffff;

            left: 2px;
            top: 2px;

            pointer-events: none;

            transition:
                transform .15s ease;
        `;

        knob.style.transform =
            checked
                ? "translateX(16px)"
                : "translateX(0)";

        toggle.appendChild(
            knob
        );

        checkbox.addEventListener(
            "change",
            () => {
                toggle.style.background =
                    checkbox.checked
                        ? "#9147ff"
                        : "#4a4a52";

                knob.style.transform =
                    checkbox.checked
                        ? "translateX(16px)"
                        : "translateX(0)";
            }
        );

        const text =
            document.createElement("span");

        text.textContent =
            label;

        wrapper.appendChild(
            checkbox
        );

        wrapper.appendChild(
            toggle
        );

        wrapper.appendChild(
            text
        );

        settings.appendChild(
            wrapper
        );

        return checkbox;
    }

    const backgroundCheckbox =
        createToggle(
            "Background",
            "background",
            backgroundEnabled
        );

    const wrapCheckbox =
        createToggle(
            "Wrap messages",
            "wrap",
            wrapEnabled
        );

    const badgesCheckbox =
        createToggle(
            "Badges",
            "badges",
            badgesEnabled
        );

    const unlistedCheckbox =
        createToggle(
            "Unlisted 7TV emotes",
            "unlisted",
            showUnlisted7TV
        );

    const animationTitle =
        document.createElement("div");

    animationTitle.textContent =
        "Animation & Scaling";

    animationTitle.style.cssText = `
        margin-top: 17px;
        margin-bottom: 9px;

        font-size: 12px;
        font-weight: 600;

        color: #e2e2e8;
    `;

    const fadeLabel =
        document.createElement("label");

    fadeLabel.textContent =
        "Fade time";

    fadeLabel.style.cssText = `
        display: block;

        margin-bottom: 6px;

        font-size: 12px;
        font-weight: 600;

        color: #e2e2e8;
    `;

    const fadeInput =
        document.createElement("input");

    fadeInput.type =
        "number";

    fadeInput.min =
        "1";

    fadeInput.max =
        "300";

    fadeInput.step =
        "1";

    fadeInput.value =
        fade === false
            ? ""
            : String(fade);

    fadeInput.placeholder =
        "15";

    fadeInput.style.cssText = `
        width: 100%;
        height: 32px;

        box-sizing: border-box;

        padding: 0 10px;

        border:
            1px solid #46464f;

        border-radius: 6px;

        background: #151518;

        color: #ffffff;

        outline: none;

        font-size: 12px;
    `;

    const fadeNoWrapper =
        document.createElement("div");

    fadeNoWrapper.style.cssText = `
        margin-top: 8px;
        margin-bottom: 17px;
    `;

    const noFade =
        createToggle(
            "Disable fading",
            "disable-fading",
            fade === false
        );

    settings.removeChild(
        noFade.parentElement
    );

    fadeNoWrapper.appendChild(
        noFade.parentElement
    );

    noFade.addEventListener(
        "change",
        () => {
            fadeInput.disabled =
                noFade.checked;

            fadeInput.style.opacity =
                noFade.checked
                    ? ".4"
                    : "1";
        }
    );

    fadeInput.disabled =
        noFade.checked;

    if (noFade.checked) {
        fadeInput.style.opacity =
            ".4";
    }

    const scaleLabel =
        document.createElement("label");

    scaleLabel.textContent =
        "Scale";

    scaleLabel.style.cssText = `
        display: block;

        margin-bottom: 6px;

        font-size: 12px;
        font-weight: 600;

        color: #e2e2e8;
    `;

    const scaleInput =
        document.createElement("input");

    scaleInput.type =
        "number";

    scaleInput.min =
        "0.25";

    scaleInput.max =
        "3";

    scaleInput.step =
        "0.05";

    scaleInput.value =
        String(scale);

    scaleInput.style.cssText = `
        width: 100%;
        height: 32px;

        box-sizing: border-box;

        padding: 0 10px;

        border:
            1px solid #46464f;

        border-radius: 6px;

        background: #151518;

        color: #ffffff;

        outline: none;

        font-size: 12px;
    `;


        backgroundCheckbox.addEventListener(
        "change",
        () => {
            backgroundEnabled =
                backgroundCheckbox.checked;

            document.body.classList.toggle(
                "has-background",
                backgroundEnabled
            );

            previewChat.classList.toggle(
                "has-background",
                backgroundEnabled
            );
        }
    );

    wrapCheckbox.addEventListener(
        "change",
        () => {
            wrapEnabled =
                wrapCheckbox.checked;
        }
    );

    badgesCheckbox.addEventListener(
        "change",
        () => {
            badgesEnabled =
                badgesCheckbox.checked;
        }
    );

    unlistedCheckbox.addEventListener(
        "change",
        () => {
            showUnlisted7TV =
                unlistedCheckbox.checked;
        }
    );

    fadeInput.addEventListener(
        "input",
        () => {
            if (!noFade.checked) {
                fade =
                    Math.max(
                        1,
                        Number(fadeInput.value) || 15
                    );
            }
        }
    );

    noFade.addEventListener(
        "change",
        () => {
            fade =
                noFade.checked
                    ? false
                    : Math.max(
                        1,
                        Number(fadeInput.value) || 15
                    );
        }
    );

    scaleInput.addEventListener(
        "input",
        () => {
            let newScale =
                Number(scaleInput.value);

            if (!Number.isFinite(newScale)) {
                return;
            }

            scale =
                Math.max(
                    0.25,
                    Math.min(newScale, 3)
                );

            document.documentElement.style.setProperty(
                "--chat-scale",
                scale
            );
        }
    );

    channelInput.addEventListener(
        "focus",
        () => {
            channelInput.style.borderColor =
                "#9147ff";
        }
    );

    channelInput.addEventListener(
        "blur",
        () => {
            channelInput.style.borderColor =
                "#46464f";
        }
    );

    const error =
        document.createElement("div");

    error.dataset.channelError =
        "true";

    error.style.cssText = `
        display: none;

        margin-top: 10px;
        padding: 8px 10px;

        background:
            rgba(239, 68, 68, .12);

        border:
            1px solid rgba(239, 68, 68, .4);

        border-radius: 6px;

        color: #ff8c8c;

        font-size: 11px;
    `;

    function getOverlayUrl() {
        const channel =
            channelInput.value
                .trim()
                .toLowerCase()
                .replace(/^#/, "");

        if (!channel) {
            error.textContent =
                "Enter a Twitch channel.";

            error.style.display =
                "block";

            return null;
        }

        error.style.display =
            "none";

        const overlaySettings = {
            background:
                backgroundCheckbox.checked,

            fade:
                noFade.checked
                    ? false
                    : Math.max(
                        1,
                        Number(
                            fadeInput.value
                        ) || 15
                    ),

            badges:
                badgesCheckbox.checked,

            scale:
                Math.max(
                    0.25,
                    Math.min(
                        Number(
                            scaleInput.value
                        ) || 1,
                        3
                    )
                ),

            wrap:
                wrapCheckbox.checked,

            unlisted:
                unlistedCheckbox.checked
        };

        const encodedSettings =
            btoa(
                encodeURIComponent(
                    JSON.stringify(
                        overlaySettings
                    )
                )
            )
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");

        const url =
            new URL(
                window.location.href
            );

        url.search = "";

        url.searchParams.set(
            "channel",
            channel
        );

        url.searchParams.set(
            "settings",
            encodedSettings
        );

        return url.toString();
    }

    const authorizeButton =
        document.createElement("button");

    authorizeButton.type =
        "button";

    authorizeButton.textContent =
        "Authorize Twitch";

    authorizeButton.style.cssText = `
        width: 100%;
        height: 34px;

        margin-top: 17px;

        border: none;
        border-radius: 5px;

        background: #9147ff;

        color: #ffffff;

        font-size: 12px;
        font-weight: 600;

        cursor: pointer;

        transition:
            background .15s ease;
    `;

    authorizeButton.addEventListener(
        "mouseenter",
        () => {
            authorizeButton.style.background =
                "#772ce8";
        }
    );

    authorizeButton.addEventListener(
        "mouseleave",
        () => {
            authorizeButton.style.background =
                "#9147ff";
        }
    );

    authorizeButton.addEventListener(
        "click",
        () => {
            const url =
                getOverlayUrl();

            if (!url) {
                return;
            }

            if (accessToken) {
                authorizeButton.textContent =
                    "Twitch Authorized";

                return;
            }

            localStorage.setItem(
                "twitch_overlay_pending_url",
                url
            );

            startTwitchLogin();
        }
    );

    const copyButton =
        document.createElement("button");

    copyButton.type =
        "button";

    copyButton.textContent =
        "Copy Overlay Link";

    copyButton.style.cssText = `
        width: 100%;
        height: 34px;

        margin-top: 8px;

        border:
            1px solid #55555f;

        border-radius: 5px;

        background: #2b2b31;

        color: #ffffff;

        font-size: 12px;
        font-weight: 600;

        cursor: pointer;

        transition:
            background .15s ease,
            border-color .15s ease;
    `;

    copyButton.addEventListener(
        "mouseenter",
        () => {
            copyButton.style.background =
                "#35353d";

            copyButton.style.borderColor =
                "#777783";
        }
    );

    copyButton.addEventListener(
        "mouseleave",
        () => {
            copyButton.style.background =
                "#2b2b31";

            copyButton.style.borderColor =
                "#55555f";
        }
    );

    copyButton.addEventListener(
        "click",
        async () => {
            const url =
                getOverlayUrl();

            if (!url) {
                return;
            }

            try {
                await navigator.clipboard.writeText(
                    url
                );

                copyButton.textContent =
                    "Copied!";

                setTimeout(
                    () => {
                        copyButton.textContent =
                            "Copy Overlay Link";
                    },
                    1500
                );
            } catch {
                const textarea =
                    document.createElement(
                        "textarea"
                    );

                textarea.value =
                    url;

                textarea.style.position =
                    "fixed";

                textarea.style.opacity =
                    "0";

                document.body.appendChild(
                    textarea
                );

                textarea.select();

                document.execCommand(
                    "copy"
                );

                textarea.remove();

                copyButton.textContent =
                    "Copied!";

                setTimeout(
                    () => {
                        copyButton.textContent =
                            "Copy Overlay Link";
                    },
                    1500
                );
            }
        }
    );

    const footer =
        document.createElement("div");

    footer.textContent =
        "Authorize Twitch to connect your account, or copy the overlay link for OBS.";

    footer.style.cssText = `
        margin-top: 9px;

        color: #858590;

        font-size: 10px;
        line-height: 1.45;
    `;

    sidebar.appendChild(
        title
    );

    sidebar.appendChild(
        description
    );

    sidebar.appendChild(
        channelLabel
    );

    sidebar.appendChild(
        channelInput
    );

    sidebar.appendChild(
        settingsTitle
    );

    sidebar.appendChild(
        settings
    );

    sidebar.appendChild(
        animationTitle
    );

    sidebar.appendChild(
        fadeLabel
    );

    sidebar.appendChild(
        fadeInput
    );

    sidebar.appendChild(
        fadeNoWrapper
    );

    sidebar.appendChild(
        scaleLabel
    );

    sidebar.appendChild(
        scaleInput
    );

    sidebar.appendChild(
        error
    );

    sidebar.appendChild(
        authorizeButton
    );

    sidebar.appendChild(
        copyButton
    );

    sidebar.appendChild(
        footer
    );

    screen.appendChild(
        sidebar
    );

    screen.appendChild(
        preview
    );

    document.body.appendChild(
        screen
    );

    setTimeout(() => {
        runPreviewMessage();
    }, 3000);
}



function showChannelError(message) {
    const screen =
        document.getElementById(
            "twitch-login-screen"
        );

    if (!screen) {
        return;
    }

    const error =
        screen.querySelector(
            "[data-channel-error]"
        );

    if (error) {
        error.textContent =
            message;

        error.style.display =
            "block";
    }
}

function hideTwitchLoginScreen() {
    const screen =
        document.getElementById(
            "twitch-login-screen"
        );

    if (!screen) {
        return;
    }

    const chat =
        document.getElementById("chat");

    if (chat && screen.contains(chat)) {
        chat.style.position =
            chat.dataset.originalPosition || "";
        chat.style.inset =
            chat.dataset.originalInset || "";
        chat.style.top =
            chat.dataset.originalTop || "";
        chat.style.left =
            chat.dataset.originalLeft || "";
        chat.style.right =
            chat.dataset.originalRight || "";
        chat.style.bottom =
            chat.dataset.originalBottom || "";
        chat.style.width =
            chat.dataset.originalWidth || "";
        chat.style.height =
            chat.dataset.originalHeight || "";
        chat.style.zIndex =
            chat.dataset.originalZIndex || "";

        chat.style.flex = "";
        chat.style.minHeight = "";
        chat.style.overflowY = "";

        delete chat.dataset.originalPosition;
        delete chat.dataset.originalInset;
        delete chat.dataset.originalTop;
        delete chat.dataset.originalLeft;
        delete chat.dataset.originalRight;
        delete chat.dataset.originalBottom;
        delete chat.dataset.originalWidth;
        delete chat.dataset.originalHeight;
        delete chat.dataset.originalZIndex;

        chat.style.display = "";
        chat.style.flexDirection = "";
        chat.style.justifyContent = "";

        document.body.appendChild(chat);
    }

    screen.remove();
}
async function get7TVColor(userId) {
    if (!userId) {
        return null;
    }

    userId = String(userId);

    if (sevenTVColors.has(userId)) {
        return sevenTVColors.get(userId);
    }

    if (sevenTVColorPromises.has(userId)) {
        return sevenTVColorPromises.get(userId);
    }

    const query = `
        query GetUserColor($platformId: String!) {
            users {
                userByConnection(
                    platform: TWITCH
                    platformId: $platformId
                ) {
                    style {
                        color {
                            r
                            g
                            b
                            a
                            hex
                        }
                    }
                }
            }
        }
    `;

    const promise = (async () => {
        try {
            const response = await fetch(
                "https://api.7tv.app/v4/gql",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        query,
                        variables: {
                            platformId: userId
                        }
                    })
                }
            );

            if (!response.ok) {
                throw new Error(
                    `7TV color HTTP error: ${response.status}`
                );
            }

            const result = await response.json();

            if (result.errors) {
                console.error(
                    "7TV color GraphQL error:",
                    result.errors
                );

                sevenTVColors.set(userId, null);

                return null;
            }

            const color =
                result.data
                    ?.users
                    ?.userByConnection
                    ?.style
                    ?.color;

            if (!color) {
                sevenTVColors.set(userId, null);

                return null;
            }

            const cssColor =
                colorToCss(color);

            sevenTVColors.set(
                userId,
                cssColor
            );

            return cssColor;

        } catch (error) {
            console.error(
                "7TV color error:",
                error
            );

            sevenTVColors.set(
                userId,
                null
            );

            return null;
        }
    })();

    sevenTVColorPromises.set(
        userId,
        promise
    );

    try {
        return await promise;
    } finally {
        sevenTVColorPromises.delete(
            userId
        );
    }
}



function loadTwemoji() {
    if (window.twemoji) {
        return Promise.resolve(window.twemoji);
    }

    if (twemojiReady) {
        return twemojiReady;
    }

    twemojiReady = new Promise((resolve, reject) => {
        const script =
            document.createElement("script");

        script.src =
            "https://cdn.jsdelivr.net/npm/twemoji@latest/dist/twemoji.min.js";

        script.onload = () => {
            if (window.twemoji) {
                resolve(window.twemoji);
            } else {
                reject(
                    new Error(
                        "Twemoji loaded but was not found."
                    )
                );
            }
        };

        script.onerror = () => {
            reject(
                new Error(
                    "Failed to load Twemoji."
                )
            );
        };

        document.head.appendChild(script);
    });

    return twemojiReady;
}


function get7TVEmoteFlags(emote) {
    return Number(
        emote?.data?.flags ??
        emote?.flags ??
        0
    );
}

function is7TVZeroWidth(emote) {
    return Boolean(
        get7TVEmoteFlags(emote) &
        SEVENTV_EMOTE_FLAGS.ZERO_WIDTH
    );
}

function get7TVEmoteFile(emote) {
    const files =
        emote?.data?.host?.files || [];

    if (!files.length) {
        return null;
    }

    return (
        files.find(file =>
            String(file.name || "").includes("4x")
        ) ||
        files.find(file =>
            String(file.name || "").includes("3x")
        ) ||
        files.find(file =>
            String(file.name || "").includes("2x")
        ) ||
        files.find(file =>
            String(file.name || "").includes("1x")
        ) ||
        files[files.length - 1]
    );
}

function get7TVHostUrl(emote) {
    let host =
        emote?.data?.host?.url;

    if (!host) {
        return null;
    }

    if (host.startsWith("//")) {
        return `https:${host}`;
    }

    if (!host.startsWith("http")) {
        return `https://${host}`;
    }

    return host;
}

function add7TVEmote(emote) {
    if (!emote?.name) {
        return;
    }

    const file =
        get7TVEmoteFile(emote);

    const host =
        get7TVHostUrl(emote);

    if (!file || !host) {
        return;
    }

    const flags =
        get7TVEmoteFlags(emote);

    const listed =
        emote?.data?.listed ??
        emote?.listed ??
        true;

    sevenTVEmotes.set(
        emote.name,
        {
            id:
                emote.id
                    ? String(emote.id)
                    : null,

            name:
                emote.name,

            url:
                `${host}/${file.name}`,

            provider:
                "7TV",

            flags,

            listed:
                listed !== false,

            zeroWidth:
                Boolean(
                    flags &
                    SEVENTV_EMOTE_FLAGS.ZERO_WIDTH
                )
        }
    );
}

async function load7TVGlobalEmotes() {
    try {
        const response =
            await fetch(
                "https://7tv.io/v3/emote-sets/global"
            );

        if (!response.ok) {
            throw new Error(
                `7TV global emote error: ${response.status}`
            );
        }

        const data =
            await response.json();

        for (
            const emote
            of data.emotes || []
        ) {
            add7TVEmote(emote);
        }

        console.log(
            `Loaded ${sevenTVEmotes.size} total 7TV emotes.`
        );

    } catch (error) {
        console.error(
            "7TV global emote error:",
            error
        );
    }
}

async function load7TVEmotes() {
    try {
        const userResponse =
            await fetch(
                `https://7tv.io/v3/users/twitch/${TWITCH_USER_ID}`
            );

        if (!userResponse.ok) {
            throw new Error(
                `7TV user error: ${userResponse.status}`
            );
        }

        const userData =
            await userResponse.json();

        const emoteSetId =
            userData.emote_set?.id;

        if (!emoteSetId) {
            return;
        }

        const setResponse =
            await fetch(
                `https://7tv.io/v3/emote-sets/${emoteSetId}`
            );

        if (!setResponse.ok) {
            throw new Error(
                `7TV emote set error: ${setResponse.status}`
            );
        }

        const setData =
            await setResponse.json();
            

        for (
            const emote
            of setData.emotes || []
        ) {
            add7TVEmote(emote);
        }
        connectSevenTVEvents(emoteSetId);
        console.log(
            `Loaded ${sevenTVEmotes.size} 7TV emotes.`
        );

    } catch (error) {
        console.error(
            "7TV emote error:",
            error
        );
    }
}


function getTwitchEmoteUrl(emote) {
    if (!emote?.id) {
        return null;
    }

    const id =
        String(emote.id);

    const formats =
        Array.isArray(emote.format)
            ? emote.format
            : [];

    if (formats.includes("animated")) {
        return (
            `https://static-cdn.jtvnw.net/` +
            `emoticons/v2/${id}/default/dark/3.0`
        );
    }

    return (
        emote.images?.url_4x ||
        emote.images?.url_2x ||
        emote.images?.url_1x ||
        `https://static-cdn.jtvnw.net/` +
        `emoticons/v2/${id}/default/dark/3.0`
    );
}

async function loadTwitchEmotes() {
    try {
        const headers = {
            "Client-ID":
                TWITCH_CLIENT_ID,

            "Authorization":
                `Bearer ${accessToken}`
        };

        const globalResponse =
            await fetch(
                "https://api.twitch.tv/helix/chat/emotes/global",
                {
                    headers
                }
            );

        if (!globalResponse.ok) {
            throw new Error(
                `Twitch global emotes: ${globalResponse.status}`
            );
        }

        const globalData =
            await globalResponse.json();

        for (
            const emote
            of globalData.data || []
        ) {
            const url =
                getTwitchEmoteUrl(emote);

            if (!url) {
                continue;
            }

            twitchEmotes.set(
                String(emote.id),
                {
                    id:
                        String(emote.id),

                    name:
                        emote.name,

                    url,

                    animated:
                        Array.isArray(
                            emote.format
                        ) &&
                        emote.format.includes(
                            "animated"
                        ),

                    format:
                        emote.format || [],

                    scale:
                        emote.scale || []
                }
            );
        }

        const userResponse =
            await fetch(
                `https://api.twitch.tv/helix/users?login=${encodeURIComponent(
                    CHANNEL
                )}`,
                {
                    headers
                }
            );

        if (!userResponse.ok) {
            throw new Error(
                `Twitch channel lookup: ${userResponse.status}`
            );
        }

        const userData =
            await userResponse.json();

        const broadcasterId =
            userData.data?.[0]?.id;

        if (!broadcasterId) {
            console.log(
                `Loaded ${twitchEmotes.size} Twitch emotes.`
            );

            return;
        }

        const channelResponse =
            await fetch(
                `https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${broadcasterId}`,
                {
                    headers
                }
            );

        if (!channelResponse.ok) {
            throw new Error(
                `Twitch channel emotes: ${channelResponse.status}`
            );
        }

        const channelData =
            await channelResponse.json();

        for (
            const emote
            of channelData.data || []
        ) {
            const url =
                getTwitchEmoteUrl(emote);

            if (!url) {
                continue;
            }

            twitchEmotes.set(
                String(emote.id),
                {
                    id:
                        String(emote.id),

                    name:
                        emote.name,

                    url,

                    animated:
                        Array.isArray(
                            emote.format
                        ) &&
                        emote.format.includes(
                            "animated"
                        ),

                    format:
                        emote.format || [],

                    scale:
                        emote.scale || []
                }
            );
        }

        console.log(
            `Loaded ${twitchEmotes.size} Twitch emotes.`
        );

    } catch (error) {
        console.error(
            "Twitch emote error:",
            error
        );
    }
}



function normalizeImageUrl(url) {
    if (!url) {
        return null;
    }

    if (url.startsWith("//")) {
        return `https:${url}`;
    }

    return url;
}

function getFFZImage(emote) {
    return (
        emote.urls?.["4"] ||
        emote.urls?.["2"] ||
        emote.urls?.["1"] ||
        null
    );
}

async function loadFFZEmotes() {
    try {
        const response =
            await fetch(
                "https://api.frankerfacez.com/v1/set/global"
            );

        if (!response.ok) {
            throw new Error(
                `FFZ global emotes: ${response.status}`
            );
        }

        const data =
            await response.json();

        for (
            const set
            of Object.values(data.sets || {})
        ) {
            for (
                const emote
                of set.emoticons || []
            ) {
                const url =
                    normalizeImageUrl(
                        getFFZImage(emote)
                    );

                if (!url) {
                    continue;
                }

                ffzEmotes.set(
                    emote.name,
                    {
                        id:
                            String(emote.id),

                        name:
                            emote.name,

                        url,

                        width:
                            emote.width,

                        height:
                            emote.height,

                        modifier:
                            Boolean(
                                emote.modifier
                            ),

                        modifierFlags:
                            Number(
                                emote.modifier_flags ||
                                0
                            )
                    }
                );
            }
        }

        const roomResponse =
            await fetch(
                `https://api.frankerfacez.com/v1/room/${encodeURIComponent(
                    CHANNEL
                )}`
            );

        if (roomResponse.ok) {
            const roomData =
                await roomResponse.json();

            for (
                const set
                of Object.values(
                    roomData.sets || {}
                )
            ) {
                for (
                    const emote
                    of set.emoticons || []
                ) {
                    const url =
                        normalizeImageUrl(
                            getFFZImage(emote)
                        );

                    if (!url) {
                        continue;
                    }

                    ffzEmotes.set(
                        emote.name,
                        {
                            id:
                                String(emote.id),

                            name:
                                emote.name,

                            url,

                            width:
                                emote.width,

                            height:
                                emote.height,

                            modifier:
                                Boolean(
                                    emote.modifier
                                ),

                            modifierFlags:
                                Number(
                                    emote.modifier_flags ||
                                    0
                                )
                        }
                    );
                }
            }
        }

        console.log(
            `Loaded ${ffzEmotes.size} FFZ emotes.`
        );

    } catch (error) {
        console.error(
            "FFZ emote error:",
            error
        );
    }
}


async function loadBTTVEmotes() {
    try {
        const globalResponse =
            await fetch(
                "https://api.betterttv.net/3/cached/emotes/global"
            );

        if (!globalResponse.ok) {
            throw new Error(
                `BTTV global emotes: ${globalResponse.status}`
            );
        }

        const globalData =
            await globalResponse.json();

        for (
            const emote
            of globalData || []
        ) {
            if (
                !emote.code ||
                !emote.id
            ) {
                continue;
            }

            bttvEmotes.set(
                emote.code,
                {
                    id:
                        String(emote.id),

                    name:
                        emote.code,

                    url:
                        `https://cdn.betterttv.net/emote/${emote.id}/3x`
                }
            );
        }

        const userResponse =
            await fetch(
                `https://api.betterttv.net/3/cached/users/twitch/${TWITCH_USER_ID}`
            );

        if (userResponse.ok) {
            const userData =
                await userResponse.json();

            const emotes = [
                ...(userData.channelEmotes || []),
                ...(userData.sharedEmotes || [])
            ];

            for (
                const emote
                of emotes
            ) {
                if (
                    !emote.code ||
                    !emote.id
                ) {
                    continue;
                }

                const extension =
                    emote.imageType === "gif"
                        ? "gif"
                        : "png";

                bttvEmotes.set(
                    emote.code,
                    {
                        id:
                            String(emote.id),

                        name:
                            emote.code,

                        url:
                            `https://cdn.betterttv.net/emote/${emote.id}/3x.${extension}`
                    }
                );
            }
        }

        console.log(
            `Loaded ${bttvEmotes.size} BTTV emotes.`
        );

    } catch (error) {
        console.error(
            "BTTV emote error:",
            error
        );
    }
}

function colorToCss(color) {
    if (!color) {
        return "transparent";
    }

    const r =
        Math.max(
            0,
            Math.min(
                255,
                Number(color.r ?? 0)
            )
        );

    const g =
        Math.max(
            0,
            Math.min(
                255,
                Number(color.g ?? 0)
            )
        );

    const b =
        Math.max(
            0,
            Math.min(
                255,
                Number(color.b ?? 0)
            )
        );

    let alpha =
        Number(color.a ?? 255);

    if (alpha > 1) {
        alpha /= 255;
    }

    alpha =
        Math.max(
            0,
            Math.min(
                1,
                alpha
            )
        );

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


function createPaintDropShadowFilter(paint) {
    const shadows =
        paint?.data?.shadows || [];

    if (
        Array.isArray(shadows) &&
        shadows.length
    ) {
        const filters = [];

        for (
            const shadow
            of shadows
        ) {
            if (!shadow) {
                continue;
            }

            const color =
                colorToCss(
                    shadow.color
                );

            const offsetX =
                Number(
                    shadow.offsetX ?? 0
                ) * 2;

            const offsetY =
                Number(
                    shadow.offsetY ?? 0
                ) * 2;

            const blur =
                Math.max(
                    0,
                    Number(
                        shadow.blur ?? 0
                    ) * 2
                );

            filters.push(
                `drop-shadow(` +
                `${offsetX}px ` +
                `${offsetY}px ` +
                `${blur}px ` +
                `${color}` +
                `)`
            );
        }

        if (filters.length) {
            return filters.join(" ");
        }
    }
    return null;
}

function getPaintFallbackColor(paint) {
    const layers =
        paint?.data?.layers || [];

    for (
        const layer
        of layers
    ) {
        const type =
            layer?.ty;

        if (!type) {
            continue;
        }

        if (
            type.__typename ===
            "PaintLayerTypeSingleColor"
        ) {
            if (type.color) {
                return colorToCss(
                    type.color
                );
            }
        }

        if (
            type.__typename ===
            "PaintLayerTypeLinearGradient"
        ) {
            const color =
                type.stops?.[0]?.color;

            if (color) {
                return colorToCss(
                    color
                );
            }
        }

        if (
            type.__typename ===
            "PaintLayerTypeRadialGradient"
        ) {
            const color =
                type.stops?.[0]?.color;

            if (color) {
                return colorToCss(
                    color
                );
            }
        }
    }

    return "rgba(255, 255, 255, 0.35)";
}

function get7TVPaintLayerUrls(
    paint,
    layer
) {
    if (
        !paint?.id ||
        !layer?.id
    ) {
        return [];
    }

    const paintId =
        encodeURIComponent(
            String(paint.id)
        );

    const layerId =
        encodeURIComponent(
            String(layer.id)
        );

    return [
        `https://cdn.7tv.app/paint/${paintId}/layer/${layerId}/4x`,
        `https://cdn.7tv.app/paint/${paintId}/layer/${layerId}/3x`,
        `https://cdn.7tv.app/paint/${paintId}/layer/${layerId}/2x`,
        `https://cdn.7tv.app/paint/${paintId}/layer/${layerId}/1x`,

        `https://cdn.7tv.app/paint/${paintId}/layer/${layerId}/4x.webp`,
        `https://cdn.7tv.app/paint/${paintId}/layer/${layerId}/3x.webp`,
        `https://cdn.7tv.app/paint/${paintId}/layer/${layerId}/2x.webp`,
        `https://cdn.7tv.app/paint/${paintId}/layer/${layerId}/1x.webp`
    ];
}

function loadPaintImage(url) {
    return new Promise(resolve => {
        const img =
            new Image();

        img.onload = () => {
            resolve(url);
        };

        img.onerror = () => {
            resolve(null);
        };

        img.decoding = "async";
        img.loading = "eager";

        img.src = url;
    });
}

async function getWorking7TVPaintLayerUrl(
    paint,
    layer
) {
    const urls =
        get7TVPaintLayerUrls(
            paint,
            layer
        );

    for (
        const url
        of urls
    ) {
        const workingUrl =
            await loadPaintImage(url);

        if (workingUrl) {
            return workingUrl;
        }
    }

    return null;
}

async function applyPaint(
    element,
    paint
) {
    if (
        !element ||
        !paint
    ) {
        return;
    }

    const layers =
        paint?.data?.layers || [];

    if (
        !Array.isArray(layers) ||
        !layers.length
    ) {
        return;
    }

    element.classList.remove(
        "seven-tv-painted"
    );

    element.style.backgroundImage =
        "";

    element.style.backgroundColor =
        "";

    element.style.filter =
        "";

    element.style.textShadow =
        "none";

    element.style.color =
        "transparent";

    element.style.webkitTextFillColor =
        "transparent";

    const backgrounds = [];

    for (
        const layer
        of layers
    ) {
        const type =
            layer?.ty;

        if (!type) {
            continue;
        }

        let background = null;

        if (
            type.__typename ===
            "PaintLayerTypeSingleColor"
        ) {
            if (!type.color) {
                continue;
            }

            background =
                colorToCss(
                    type.color
                );
        }

        else if (
            type.__typename ===
            "PaintLayerTypeLinearGradient"
        ) {
            const stops =
                (type.stops || [])
                    .map(stop => {
                        if (!stop?.color) {
                            return null;
                        }

                        return (
                            `${colorToCss(
                                stop.color
                            )} ` +
                            `${Number(
                                stop.at ?? 0
                            ) * 100}%`
                        );
                    })
                    .filter(Boolean)
                    .join(", ");

            if (!stops) {
                continue;
            }

            let angle =
                Number(
                    type.angle ?? 0
                );

            background =
                `${type.repeating ? "repeating-" : ""}` +
                `linear-gradient(` +
                `${angle}deg, ` +
                `${stops}` +
                `)`;
        }

        else if (
            type.__typename ===
            "PaintLayerTypeRadialGradient"
        ) {
            const stops =
                (type.stops || [])
                    .map(stop => {
                        if (!stop?.color) {
                            return null;
                        }

                        return (
                            `${colorToCss(
                                stop.color
                            )} ` +
                            `${Number(
                                stop.at ?? 0
                            ) * 100}%`
                        );
                    })
                    .filter(Boolean)
                    .join(", ");

            if (!stops) {
                continue;
            }

            const shape =
                type.shape ||
                "circle";

            background =
                `${type.repeating ? "repeating-" : ""}` +
                `radial-gradient(` +
                `${shape}, ` +
                `${stops}` +
                `)`;
        }

        else if (
            type.__typename ===
            "PaintLayerTypeImage"
        ) {
            const animatedUrl =
                await getWorking7TVPaintLayerUrl(
                    paint,
                    layer
                );

            if (!animatedUrl) {
                const image =
                    type.images?.[0];

                if (!image?.url) {
                    continue;
                }

                background =
                    `url("${image.url}")`;
            } else {
                background =
                    `url("${animatedUrl}")`;
            }
        }

        if (background) {
            backgrounds.push({
                background,

                opacity:
                    Number(
                        layer.opacity ?? 1
                    )
            });
        }
    }

    if (!backgrounds.length) {
        return;
    }

    const imageLayers =
        backgrounds
            .map(layer =>
                layer.background
            )
            .reverse();

    element.classList.add(
        "seven-tv-painted"
    );

    element.style.display =
        "inline-block";

    element.style.position =
        "relative";

    element.style.backgroundImage =
        imageLayers.join(", ");

    element.style.backgroundSize =
        imageLayers
            .map((_, index) => {
                const original =
                    backgrounds[
                        backgrounds.length -
                        1 -
                        index
                    ];

                return original.background
                    .startsWith("url(")
                    ? "cover"
                    : "100% 100%";
            })
            .join(", ");

    element.style.backgroundPosition =
        imageLayers
            .map(() =>
                "center center"
            )
            .join(", ");

    element.style.backgroundRepeat =
        imageLayers
            .map(() =>
                "no-repeat"
            )
            .join(", ");

    element.style.backgroundClip =
        "text";

    element.style.webkitBackgroundClip =
        "text";

    element.style.color =
        "transparent";

    element.style.webkitTextFillColor =
        "transparent";

    const shadowFilter =
        createPaintDropShadowFilter(
            paint
        );

    if (
        shadowFilter ===
        "__NORMAL_USERNAME_SHADOW__"
    ) {
        element.style.filter =
            "none";
        element.style.textShadow =
            "1px 1px 2px rgba(0, 0, 0, 0.85)";
    } else if (
        shadowFilter &&
        shadowFilter !== "none"
    ) {
        element.style.filter =
            shadowFilter;
        element.style.textShadow =
            "none";
    }

    element.style.backgroundOrigin =
        "border-box";

    element.style.backgroundAttachment =
        "scroll";

    void element.offsetWidth;

    element.style.willChange =
        "background-image";
}

async function get7TVPaint(userId) {
    if (!userId) {
        return null;
    }

    userId = String(userId);

    if (sevenTVUsers.has(userId)) {
        return sevenTVUsers.get(userId);
    }

    const query = `
        query GetUserPaint($platformId: String!) {
            users {
                userByConnection(
                    platform: TWITCH
                    platformId: $platformId
                ) {
                    style {
                        activePaint {
                            id
                            name
                            data {
                                layers {
                                    id
                                    opacity
                                    ty {
                                        __typename

                                        ... on PaintLayerTypeSingleColor {
                                            color {
                                                r
                                                g
                                                b
                                                a
                                                hex
                                            }
                                        }

                                        ... on PaintLayerTypeLinearGradient {
                                            angle
                                            repeating
                                            stops {
                                                at
                                                color {
                                                    r
                                                    g
                                                    b
                                                    a
                                                    hex
                                                }
                                            }
                                        }

                                        ... on PaintLayerTypeRadialGradient {
                                            shape
                                            repeating
                                            stops {
                                                at
                                                color {
                                                    r
                                                    g
                                                    b
                                                    a
                                                    hex
                                                }
                                            }
                                        }

                                        ... on PaintLayerTypeImage {
                                            images {
                                                url
                                                width
                                                height
                                            }
                                        }
                                    }
                                }

                                shadows {
                                    blur
                                    offsetX
                                    offsetY
                                    color {
                                        r
                                        g
                                        b
                                        a
                                        hex
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    try {
        const response =
            await fetch(
                "https://api.7tv.app/v4/gql",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        query,

                        variables: {
                            platformId:
                                userId
                        }
                    })
                }
            );

        if (!response.ok) {
            throw new Error(
                `7TV GraphQL HTTP error: ${response.status}`
            );
        }

        const result =
            await response.json();

        if (result.errors) {
            console.error(
                "7TV paint GraphQL error:",
                result.errors
            );

            sevenTVUsers.set(
                userId,
                null
            );

            return null;
        }

        const paint =
            result.data
                ?.users
                ?.userByConnection
                ?.style
                ?.activePaint ||
            null;

        if (paint) {
            paint.repeat =
                Boolean(
                    paint.repeat ||
                    paint.data?.layers?.some(
                        layer => {
                            const type =
                                layer?.ty;

                            return Boolean(
                                type?.repeating
                            );
                        }
                    )
                );
        }

        sevenTVUsers.set(
            userId,
            paint
        );

        return paint;

    } catch (error) {
        console.error(
            "7TV paint error:",
            error
        );

        sevenTVUsers.set(
            userId,
            null
        );

        return null;
    }
}


async function loadTwitchBadges() {
    try {
        if (!accessToken) {
            throw new Error(
                "No Twitch access token available."
            );
        }

        const headers = {
            "Client-ID":
                TWITCH_CLIENT_ID,

            "Authorization":
                `Bearer ${accessToken}`
        };
        const globalResponse =
            await fetch(
                "https://api.twitch.tv/helix/chat/badges/global",
                {
                    headers
                }
            );

        if (!globalResponse.ok) {
            throw new Error(
                `Global Twitch badges: ${globalResponse.status}`
            );
        }

        const globalData =
            await globalResponse.json();

        addTwitchBadges(
            globalData.data || []
        );

        const userResponse =
            await fetch(
                `https://api.twitch.tv/helix/users?login=${encodeURIComponent(
                    CHANNEL
                )}`,
                {
                    headers
                }
            );

        if (!userResponse.ok) {
            throw new Error(
                `Twitch channel lookup: ${userResponse.status}`
            );
        }

        const userData =
            await userResponse.json();

        const broadcasterId =
            userData.data?.[0]?.id;


        if (broadcasterId) {
            const channelResponse =
                await fetch(
                    `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`,
                    {
                        headers
                    }
                );

            if (!channelResponse.ok) {
                console.warn(
                    "Twitch channel badges:",
                    channelResponse.status
                );
            } else {
                const channelData =
                    await channelResponse.json();

                addTwitchBadges(
                    channelData.data || []
                );
            }
        }


        console.log(
            `Loaded ${twitchBadges.size} Twitch badges.`
        );

    } catch (error) {
        console.error(
            "Twitch badge error:",
            error
        );
    }
}

function addTwitchBadges(badgeSets) {
    for (const set of badgeSets || []) {
        for (const version of set.versions || []) {
            twitchBadges.set(
                `${set.set_id}/${version.id}`,
                {
                    title: version.title || set.set_id,
                    url_1x: version.image_url_1x,
                    url_2x: version.image_url_2x,
                    url_4x: version.image_url_4x
                }
            );
        }
    }
}
function normalizeFFZRoomBadge(
    badge,
    title
) {
    if (!badge) {
        return null;
    }

    let url = null;

    if (
        typeof badge === "object" &&
        !Array.isArray(badge)
    ) {
        url =
            badge["4"] ||
            badge["2"] ||
            badge["1"] ||
            badge.image ||
            badge.url ||
            null;
    }
    if (
        typeof badge === "string"
    ) {
        url = badge;
    }

    url =
        normalizeImageUrl(url);

    if (!url) {
        return null;
    }

    return {
        url,

        title:
            title || "FFZ Badge"
    };
}

async function loadFFZBadges() {
    try {
        const response =
            await fetch(
                `https://api.frankerfacez.com/v1/user/id/${TWITCH_USER_ID}`
            );

        if (response.ok) {
            const data =
                await response.json();

            const badges =
                data.badges || {};

            for (
                const [id, badge]
                of Object.entries(
                    badges
                )
            ) {
                const image =
                    badge.urls?.["4"] ||
                    badge.urls?.["2"] ||
                    badge.urls?.["1"] ||
                    badge.image;

                if (!image) {
                    continue;
                }

                const url =
                    normalizeImageUrl(
                        image
                    );

                if (!url) {
                    continue;
                }

                ffzBadges.set(
                    String(id),
                    {
                        url,

                        title:
                            badge.title ||
                            badge.name ||
                            `FFZ ${id}`
                    }
                );
            }
        }

        const roomResponse =
            await fetch(
                `https://api.frankerfacez.com/v1/room/${encodeURIComponent(
                    CHANNEL
                )}`
            );

        if (!roomResponse.ok) {
            console.warn(
                `FFZ room badge request failed: ${roomResponse.status}`
            );

            return;
        }

        const roomData =
            await roomResponse.json();

        const room =
            roomData.room || {};

        if (room.vip_badge) {
            ffzRoomBadges.vip =
                normalizeFFZRoomBadge(
                    room.vip_badge,
                    "FFZ Custom VIP"
                );
        } else {
            ffzRoomBadges.vip = null;
        }

        if (room.moderator_badge) {
            ffzRoomBadges.moderator =
                normalizeFFZRoomBadge(
                    room.moderator_badge,
                    "FFZ Custom Moderator"
                );
        } else {
            ffzRoomBadges.moderator = null;
        }

        if (ffzRoomBadges.vip?.url) {
            preloadBadgeImage(
                ffzRoomBadges.vip.url
            );
        }

        if (ffzRoomBadges.moderator?.url) {
            preloadBadgeImage(
                ffzRoomBadges.moderator.url
            );
        }

        console.log(
            "Loaded FFZ channel badges:",
            {
                customVIP:
                    Boolean(
                        ffzRoomBadges.vip
                    ),

                customModerator:
                    Boolean(
                        ffzRoomBadges.moderator
                    )
            }
        );

    } catch (error) {
        console.error(
            "FFZ badge error:",
            error
        );
    }
}

async function loadChatterinoBadges() {
    const urls = [
        "https://api.chatterino.com/badges",
        "https://api.chatterino.com/v1/badges"
    ];

    for (
        const url
        of urls
    ) {
        try {
            const response =
                await fetch(url);

            if (!response.ok) {
                continue;
            }

            const data =
                await response.json();

            const entries =
                Array.isArray(data)
                    ? data
                    : data.badges ||
                      data.data ||
                      [];

            for (
                const badge
                of entries
            ) {
                const id =
                    badge.id ??
                    badge.name ??
                    badge.user_id;

                const image =
                    badge.image ??
                    badge.url ??
                    badge.image_url;

                if (
                    id &&
                    image
                ) {
                    chatterinoBadges.set(
                        String(id),
                        normalizeImageUrl(
                            image
                        )
                    );
                }
            }

            return;

        } catch {
        }
    }
}

async function loadExternalBadges() {
    await Promise.allSettled([
        loadTwitchBadges(),
        loadFFZBadges(),
        loadChatterinoBadges()
    ]);
}


function preloadBadgeImage(url) {
    if (!url) {
        return Promise.resolve(null);
    }

    const cached =
        badgeImageCache.get(url);

    if (
        cached instanceof
        HTMLImageElement
    ) {
        return Promise.resolve(
            cached
        );
    }

    if (
        cached instanceof Promise
    ) {
        return cached;
    }

    const promise =
        new Promise(resolve => {
            const img =
                new Image();

            img.decoding =
                "async";

            img.onload = () => {
                badgeImageCache.set(
                    url,
                    img
                );

                resolve(img);
            };

            img.onerror = () => {
                badgeImageCache.delete(
                    url
                );

                resolve(null);
            };

            img.src =
                url;
        });

    badgeImageCache.set(
        url,
        promise
    );

    return promise;
}

function createBadge(
    url,
    title
) {
    if (!url) {
        return null;
    }

    const img =
        document.createElement("img");

    img.className =
        "badge";

    img.alt = "";

    img.title =
        title || "";

    img.width = 18;
    img.height = 18;

    img.loading =
        "eager";

    img.decoding =
        "async";

    img.style.width =
        "18px";

    img.style.height =
        "18px";

    img.style.objectFit =
        "contain";

    img.style.display =
        "inline-block";

    img.style.verticalAlign =
        "middle";

    img.style.marginRight =
        "2px";

    const cached =
        badgeImageCache.get(url);

    if (
        cached instanceof
        HTMLImageElement
    ) {
        img.src =
            cached.src;

        return img;
    }

    img.src =
        url;

    preloadBadgeImage(url);

    return img;
}

function createTwitchBadges(tags) {
    const container =
        document.createElement("span");

    container.className =
        "badges twitch-badges";

    const badgeString =
        tags.badges || "";

    if (!badgeString) {
        return container;
    }

    for (
        const entry
        of badgeString
            .split(",")
            .filter(Boolean)
    ) {
        const slash =
            entry.indexOf("/");

        if (slash === -1) {
            continue;
        }

        const set =
            entry.substring(
                0,
                slash
            );

        const version =
            entry.substring(
                slash + 1
            );

        const badge =
            twitchBadges.get(
                `${set}/${version}`
            );

        const badgeUrl =
            badge?.url_2x ||
            badge?.url_1x ||
            badge?.url_4x;

        if (!badgeUrl) {
            console.warn(
                "Twitch badge not found:",
                `${set}/${version}`
            );

            continue;
        }

        const img =
            document.createElement("img");

        img.className =
            "badge";

        img.src =
            badgeUrl;

        img.alt =
            badge?.title ||
            set;

        img.title =
            badge?.title ||
            set;

        img.width = 18;
        img.height = 18;

        img.style.width =
            "18px";

        img.style.height =
            "18px";

        img.style.objectFit =
            "contain";

        img.dataset.badgeType =
            set;

        img.dataset.badgeProvider =
            "twitch";

        container.appendChild(
            img
        );
    }

    return container;
}

async function loadChatterinoBadges() {
    try {
        const response = await fetch("https://api.chatterino.com/badges");

        if (!response.ok) {
            throw new Error(`Chatterino badges: ${response.status}`);
        }

        const data = await response.json();

        for (const badge of data.badges || []) {
            const url = normalizeImageUrl(
                badge.image3 || badge.image2 || badge.image1
            );

            if (!url) {
                continue;
            }

            const title = badge.tooltip || "Chatterino Badge";

            for (const rawId of badge.users || []) {
                const id = String(rawId);

                if (!chatterinoBadges.has(id)) {
                    chatterinoBadges.set(id, []);
                }

                chatterinoBadges.get(id).push({ url, title });
            }
        }

        console.log(
            `Loaded Chatterino badges for ${chatterinoBadges.size} users.`
        );

    } catch (error) {
        console.error("Chatterino badge error:", error);
    }
}

function createFFZRoomBadge(tags) {
    const badgeString =
        tags.badges || "";

    if (!badgeString) {
        return null;
    }

    const badgeTypes =
        new Set();

    for (
        const entry
        of badgeString
            .split(",")
            .filter(Boolean)
    ) {
        const slash =
            entry.indexOf("/");

        const type =
            slash === -1
                ? entry
                : entry.substring(
                    0,
                    slash
                );

        badgeTypes.add(type);
    }

    if (
        badgeTypes.has("moderator") &&
        ffzRoomBadges.moderator
    ) {
        const badge =
            ffzRoomBadges.moderator;

        const img =
            createBadge(
                badge.url,
                badge.title
            );

        if (!img) {
            return null;
        }

        img.dataset.badgeType =
            "moderator";

        img.dataset.badgeProvider =
            "ffz";

        return {
            type:
                "moderator",

            img
        };
    }

    if (
        badgeTypes.has("vip") &&
        ffzRoomBadges.vip
    ) {
        const badge =
            ffzRoomBadges.vip;

        const img =
            createBadge(
                badge.url,
                badge.title
            );

        if (!img) {
            return null;
        }

        img.dataset.badgeType =
            "vip";

        img.dataset.badgeProvider =
            "ffz";

        return {
            type:
                "vip",

            img
        };
    }

    return null;
}


function hasTwitchBadge(
    tags,
    badgeType
) {
    if (!tags) {
        return false;
    }

    const badgeString =
        tags.badges || "";

    if (!badgeString) {
        return false;
    }

    return badgeString
        .split(",")
        .filter(Boolean)
        .some(entry => {
            const slash =
                entry.indexOf("/");

            const type =
                slash === -1
                    ? entry
                    : entry.substring(
                        0,
                        slash
                    );

            return type === badgeType;
        });
}


function isFFZVipBadge(
    id,
    badge
) {
    const badgeId =
        String(id || "")
            .toLowerCase();

    const badgeName =
        String(
            badge?.name || ""
        )
            .toLowerCase();

    const badgeTitle =
        String(
            badge?.title || ""
        )
            .toLowerCase();


    return (
        badgeId === "vip" ||
        badgeName === "vip" ||
        badgeTitle === "vip" ||
        badgeTitle.includes("vip")
    );
}


async function createExternalBadges(
    userId,
    tags = null
) {
    const container =
        document.createElement("span");

    container.className =
        "badges external-badges";

    if (!userId) {
        return container;
    }

    userId =
        String(userId);

    if (
        externalBadgeCache.has(
            userId
        )
    ) {
        const cached =
            externalBadgeCache.get(
                userId
            );

        for (
            const badge
            of cached
        ) {
            if (
                badge.provider === "FFZ" &&
                badge.type === "vip" &&
                ffzRoomBadges.vip &&
                hasTwitchBadge(
                    tags,
                    "vip"
                )
            ) {
                continue;
            }

            const img =
                createBadge(
                    badge.url,
                    badge.title
                );

            if (img) {
                container.appendChild(
                    img
                );
            }
        }

        return container;
    }

    if (
        externalBadgePromises.has(
            userId
        )
    ) {
        const badges =
            await externalBadgePromises.get(
                userId
            );

        for (
            const badge
            of badges
        ) {
            if (
                badge.provider === "FFZ" &&
                badge.type === "vip" &&
                ffzRoomBadges.vip &&
                hasTwitchBadge(
                    tags,
                    "vip"
                )
            ) {
                continue;
            }

            const img =
                createBadge(
                    badge.url,
                    badge.title
                );

            if (img) {
                container.appendChild(
                    img
                );
            }
        }

        return container;
    }


    const promise =
        (async () => {
            const badges = [];
            const ffzUser =
                await getFFZUser(
                    userId
                );

            if (ffzUser) {
                const ffzUserBadges =
                    ffzUser.badges || {};

                for (
                    const [
                        id,
                        badge
                    ]
                    of Object.entries(
                        ffzUserBadges
                    )
                ) {

                    if (
                        ffzRoomBadges.vip &&
                        hasTwitchBadge(
                            tags,
                            "vip"
                        ) &&
                        isFFZVipBadge(
                            id,
                            badge
                        )
                    ) {
                        continue;
                    }


                    const url =
                        badge?.urls?.["4"] ||
                        badge?.urls?.["2"] ||
                        badge?.urls?.["1"] ||
                        badge?.image;

                    if (!url) {
                        continue;
                    }

                    const normalizedUrl =
                        normalizeImageUrl(
                            url
                        );

                    if (!normalizedUrl) {
                        continue;
                    }

                    badges.push({
                        url:
                            normalizedUrl,

                        title:
                            badge?.title ||
                            badge?.name ||
                            `FFZ ${id}`,

                        provider:
                            "FFZ",

                        type:
                            isFFZVipBadge(
                                id,
                                badge
                            )
                                ? "vip"
                                : null
                    });

                    preloadBadgeImage(
                        normalizedUrl
                    );
                }
            }

            const sevenTV =
                await load7TVUserBadges(
                    userId
                );

            for (
                const badge
                of sevenTV
            ) {
                let url =
                    badge.loadedUrl ||
                    null;

                if (!url) {
                    for (
                        const candidate
                        of badge.urls || []
                    ) {
                        const image =
                            await preloadBadgeImage(
                                candidate
                            );

                        if (image) {
                            url =
                                candidate;

                            break;
                        }
                    }
                }

                if (!url) {
                    continue;
                }

                badges.push({
                    url,

                    title:
                        badge.name ||
                        "7TV",

                    provider:
                        "7TV",

                    type:
                        null
                });
            }


            const chatterino =
                chatterinoBadges.get(userId) || [];

            for (
                const badge
                of chatterino
            ) {
                const image =
                    await preloadBadgeImage(
                        badge.url
                    );

                if (!image) {
                    continue;
                }

                badges.push({
                    url:
                        badge.url,

                    title:
                        badge.title,

                    provider:
                        "Chatterino",

                    type:
                        null
                });
            }

            return badges;
        })();


    externalBadgePromises.set(
        userId,
        promise
    );


    try {
        const badges =
            await promise;

        externalBadgeCache.set(
            userId,
            badges
        );


        for (
            const badge
            of badges
        ) {
            if (
                badge.provider === "FFZ" &&
                badge.type === "vip" &&
                ffzRoomBadges.vip &&
                hasTwitchBadge(
                    tags,
                    "vip"
                )
            ) {
                continue;
            }

            const img =
                createBadge(
                    badge.url,
                    badge.title
                );

            if (img) {
                container.appendChild(
                    img
                );
            }
        }

        return container;

    } finally {
        externalBadgePromises.delete(
            userId
        );
    }
}


async function load7TVUserBadges(userId) {
    if (!userId) {
        return [];
    }

    userId =
        String(userId);

    if (sevenTVBadges.has(userId)) {
        return sevenTVBadges.get(
            userId
        );
    }

    const query = `
        query GetUserBadge($platformId: String!) {
            users {
                userByConnection(
                    platform: TWITCH
                    platformId: $platformId
                ) {
                    style {
                        activeBadge {
                            id
                            name
                        }
                    }
                }
            }
        }
    `;

    try {
        const response =
            await fetch(
                "https://api.7tv.app/v4/gql",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        query,

                        variables: {
                            platformId:
                                userId
                        }
                    })
                }
            );

        if (!response.ok) {
            throw new Error(
                `7TV badge HTTP error: ${response.status}`
            );
        }

        const result =
            await response.json();

        if (result.errors) {
            sevenTVBadges.set(
                userId,
                []
            );

            return [];
        }

        const badge =
            result.data
                ?.users
                ?.userByConnection
                ?.style
                ?.activeBadge;

        if (!badge?.id) {
            sevenTVBadges.set(
                userId,
                []
            );

            return [];
        }

        const badgeId =
            String(badge.id);

        const urls = [
            `https://cdn.7tv.app/badge/${badgeId}/4x`,
            `https://cdn.7tv.app/badge/${badgeId}/2x`,
            `https://cdn.7tv.app/badge/${badgeId}/1x`,
            `https://cdn.7tv.app/badge/${badgeId}/4x.webp`,
            `https://cdn.7tv.app/badge/${badgeId}/2x.webp`,
            `https://cdn.7tv.app/badge/${badgeId}/1x.webp`
        ];

        const badges = [
            {
                id:
                    badgeId,

                name:
                    badge.name ||
                    "7TV Badge",

                urls
            }
        ];

        sevenTVBadges.set(
            userId,
            badges
        );

        for (
            const badgeData
            of badges
        ) {
            for (
                const url
                of badgeData.urls
            ) {
                const image =
                    await preloadBadgeImage(
                        url
                    );

                if (image) {
                    badgeData.loadedUrl =
                        url;

                    break;
                }
            }
        }

        return badges;

    } catch (error) {
        console.error(
            "7TV user badge error:",
            error
        );

        sevenTVBadges.set(
            userId,
            []
        );

        return [];
    }
}


async function getFFZUser(userId) {
    if (!userId) {
        return null;
    }

    try {
        const response =
            await fetch(
                `https://api.frankerfacez.com/v1/user/id/${userId}`
            );

        if (!response.ok) {
            return null;
        }

        return await response.json();

    } catch {
        return null;
    }
}


function createEmote(
    url,
    alt
) {
    const emote =
        document.createElement("img");

    emote.className =
        "emote";

    emote.src =
        url;

    emote.alt =
        alt;

    emote.title =
        alt;

    emote.loading =
        "eager";

    emote.decoding =
        "async";

    emote.draggable =
        false;

    return emote;
}

function renderTwemoji(container) {
    if (!container) {
        return;
    }

    loadTwemoji()
        .then(twemoji => {
            twemoji.parse(
                container,
                {
                    folder: "svg",

                    ext: ".svg",

                    base:
                        "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/"
                }
            );

            const emojis =
                container.querySelectorAll(
                    "img.emoji"
                );

            for (
                const emoji
                of emojis
            ) {
                emoji.classList.add(
                    "twemoji"
                );

                emoji.draggable =
                    false;

                emoji.loading =
                    "eager";

                emoji.decoding =
                    "async";

                emoji.style.width =
                    "1.2em";

                emoji.style.height =
                    "1.2em";

                emoji.style.display =
                    "inline-block";

                emoji.style.verticalAlign =
                    "-0.2em";

                emoji.style.margin =
                    "0 0.05em";
            }
        })
        .catch(error => {
            console.error(
                "Twemoji error:",
                error
            );
        });
}

function applyFFZEffects(
    emote,
    effects
) {
    if (
        !emote ||
        !effects?.length
    ) {
        return;
    }

    let scaleX =
        Number(
            emote.dataset.ffzScaleX ||
            1
        );

    let scaleY =
        Number(
            emote.dataset.ffzScaleY ||
            1
        );

    let rotate =
        Number(
            emote.dataset.ffzRotate ||
            0
        );

    const existingEffects =
        emote.dataset.ffzEffects
            ? emote.dataset.ffzEffects
                .split(",")
                .filter(Boolean)
            : [];

    for (
        const effect
        of effects
    ) {
        switch (effect) {
            case "flipX":
                scaleX *= -1;
                break;

            case "flipY":
                scaleY *= -1;
                break;

            case "growX":
                scaleX *= 2;
                break;

            case "shrinkX":
                scaleX *= 0.5;
                break;
        }
    }

    emote.dataset.ffzScaleX =
        String(scaleX);

    emote.dataset.ffzScaleY =
        String(scaleY);

    emote.dataset.ffzRotate =
        String(rotate);

    const mergedEffects =
        Array.from(
            new Set([
                ...existingEffects,
                ...effects
            ])
        );

    emote.dataset.ffzEffects =
        mergedEffects.join(",");

    emote.classList.add(
        "ffz-effect-transform"
    );

    emote.style.setProperty(
        "--ffz-scale-x",
        String(scaleX)
    );

    emote.style.setProperty(
        "--ffz-scale-y",
        String(scaleY)
    );

    emote.style.setProperty(
        "--ffz-rotate",
        `${rotate}deg`
    );

    for (
        const effect
        of effects
    ) {
        switch (effect) {
            case "rainbow":
                emote.classList.add(
                    "ffz-effect-rainbow"
                );
                break;

            case "hyperRed":
                emote.classList.add(
                    "ffz-effect-hyper-red"
                );
                break;

            case "shake":
                emote.classList.add(
                    "ffz-effect-shake"
                );
                break;

            case "cursed":
                emote.classList.add(
                    "ffz-effect-cursed"
                );
                break;

            case "jam":
                emote.classList.add(
                    "ffz-effect-jam"
                );
                break;

            case "bounce":
                emote.classList.add(
                    "ffz-effect-bounce"
                );
                break;

            case "slide":
                emote.classList.add(
                    "ffz-effect-slide"
                );
                break;

            case "appear":
                emote.classList.add(
                    "ffz-effect-appear"
                );
                break;

            case "leave":
                emote.classList.add(
                    "ffz-effect-leave"
                );
                break;

            case "rotate":
                emote.classList.add(
                    "ffz-effect-rotate"
                );
                break;

            case "photocopy":
                emote.classList.add(
                    "ffz-effect-photocopy"
                );
                break;
        }
    }
}

function applyFFZEffect(
    emote,
    effectName
) {
    if (
        !emote ||
        !effectName
    ) {
        return false;
    }

    const effectData =
        ffzEffects.get(
            effectName
        );

    if (
        !effectData?.effects?.length
    ) {
        return false;
    }

    applyFFZEffects(
        emote,
        effectData.effects
    );

    return true;
}

function applyFFZEffectToPrevious(
    container,
    effectName
) {
    const effectData =
        ffzEffects.get(
            effectName
        );

    if (
        !effectData?.effects?.length
    ) {
        return false;
    }

    const previous =
        getPreviousEmote(
            container
        );

    if (!previous) {
        return false;
    }

    return applyFFZEffect(
        previous,
        effectName
    );
}

function getFFZModifierEffects(
    emote
) {
    if (!emote) {
        return [];
    }

    const effects = [];

    const flags =
        Number(
            emote.modifierFlags || 0
        );

    if (
        flags &
        FFZ_EFFECT_FLAGS.GROW_X
    ) {
        effects.push(
            "growX"
        );
    }

    if (
        flags &
        FFZ_EFFECT_FLAGS.RAINBOW
    ) {
        effects.push(
            "rainbow"
        );
    }

    if (
        flags &
        FFZ_EFFECT_FLAGS.HYPER_RED
    ) {
        effects.push(
            "hyperRed"
        );
    }

    if (
        flags &
        FFZ_EFFECT_FLAGS.HYPER_SHAKE
    ) {
        effects.push(
            "shake"
        );
    }

    if (
        flags &
        FFZ_EFFECT_FLAGS.CURSED
    ) {
        effects.push(
            "cursed"
        );
    }

    if (
        flags &
        FFZ_EFFECT_FLAGS.JAM
    ) {
        effects.push(
            "jam"
        );
    }

    if (
        flags &
        FFZ_EFFECT_FLAGS.BOUNCE
    ) {
        effects.push(
            "bounce"
        );
    }

    return effects;
}

function findThirdPartyEmote(word) {
    if (
        sevenTVEmotes.has(
            word
        )
    ) {
        const emote =
            sevenTVEmotes.get(
                word
            );

        if (
            !showUnlisted7TV &&
            emote.listed === false
        ) {
            return null;
        }

        return {
            ...emote,
            provider:
                "7TV"
        };
    }

    if (
        bttvEmotes.has(
            word
        )
    ) {
        return {
            ...bttvEmotes.get(
                word
            ),

            provider:
                "BTTV"
        };
    }

    if (
        ffzEmotes.has(
            word
        )
    ) {
        const emote =
            ffzEmotes.get(
                word
            );

        return {
            ...emote,

            provider:
                "FFZ",

            modifier:
                Boolean(
                    emote.modifier
                ),

            modifierFlags:
                Number(
                    emote.modifierFlags ||
                    0
                ),

            effects:
                getFFZModifierEffects(
                    emote
                )
        };
    }

    return null;
}

function getPreviousEmote(
    container
) {
    let previous =
        container.lastElementChild;

    while (previous) {
        if (
            previous.classList.contains(
                "emote-overlay-target"
            )
        ) {
            const base =
                previous.querySelector(
                    ":scope > .emote:not(.seven-tv-zero-width)"
                );

            if (base) {
                return base;
            }
        }

        if (
            previous.classList.contains(
                "emote"
            ) &&
            !previous.classList.contains(
                "seven-tv-zero-width"
            )
        ) {
            return previous;
        }

        previous =
            previous.previousElementSibling;
    }

    return null;
}

function getPreviousOverlayTarget(
    container
) {
    const previous =
        container.lastElementChild;

    if (
        previous?.classList.contains(
            "emote-overlay-target"
        )
    ) {
        return previous;
    }

    return null;
}

function create7TVOverlay(
    container,
    url,
    alt
) {
    if (!url) {
        return false;
    }

    let target =
        getPreviousOverlayTarget(
            container
        );

    if (!target) {
        const previous =
            getPreviousEmote(
                container
            );

        if (!previous) {
            return false;
        }

        target =
            document.createElement(
                "span"
            );

        target.className =
            "emote-overlay-target";

        previous.replaceWith(
            target
        );

        target.appendChild(
            previous
        );
    }

    const overlay =
        createEmote(
            url,
            alt
        );

    overlay.classList.add(
        "seven-tv-zero-width"
    );

    overlay.setAttribute(
        "aria-hidden",
        "true"
    );

    target.appendChild(
        overlay
    );

    return true;
}

function renderExternalText(
    container,
    value
) {
    const parts =
        value.split(
            /(\s+)/
        );

    for (
        const part
        of parts
    ) {
        if (!part) {
            continue;
        }

        if (
            ffzEffects.has(
                part
            )
        ) {
            const applied =
                applyFFZEffectToPrevious(
                    container,
                    part
                );

            if (!applied) {
                container.appendChild(
                    document.createTextNode(
                        part
                    )
                );
            }

            continue;
        }

        const external =
            findThirdPartyEmote(
                part
            );

        if (external) {
            if (
                external.provider ===
                    "7TV" &&
                external.zeroWidth
            ) {
                const applied =
                    create7TVOverlay(
                        container,
                        external.url,
                        external.name
                    );

                if (!applied) {
                    container.appendChild(
                        createEmote(
                            external.url,
                            external.name
                        )
                    );
                }

                continue;
            }

            const emote =
                createEmote(
                    external.url,
                    external.name
                );

            if (
                external.provider ===
                    "FFZ" &&
                external.modifier
            ) {
                const effects =
                    getFFZModifierEffects(
                        external
                    );

                if (effects.length) {
                    const applied =
                        applyEffectsToPreviousEmote(
                            container,
                            effects
                        );

                    if (!applied) {
                        container.appendChild(
                            emote
                        );
                    }

                    continue;
                }
            }

            container.appendChild(
                emote
            );

            continue;
        }

        container.appendChild(
            document.createTextNode(
                part
            )
        );
    }
}

function parseTwitchEmoteRanges(
    tags
) {
    const result = [];

    if (!tags.emotes) {
        return result;
    }

    for (
        const group
        of tags.emotes.split("/")
    ) {
        const separator =
            group.indexOf(":");

        if (separator === -1) {
            continue;
        }

        const id =
            group.substring(
                0,
                separator
            );

        const ranges =
            group.substring(
                separator + 1
            );

        for (
            const range
            of ranges.split(",")
        ) {
            const dash =
                range.indexOf("-");

            if (dash === -1) {
                continue;
            }

            const start =
                Number(
                    range.substring(
                        0,
                        dash
                    )
                );

            const end =
                Number(
                    range.substring(
                        dash + 1
                    )
                );

            if (
                Number.isNaN(start) ||
                Number.isNaN(end)
            ) {
                continue;
            }

            result.push({
                start,
                end,
                id
            });
        }
    }

    result.sort(
        (a, b) =>
            a.start - b.start
    );

    return result;
}

function applyEffectsToPreviousEmote(
    container,
    effects
) {
    const previous =
        getPreviousEmote(
            container
        );

    if (!previous) {
        return false;
    }

    applyFFZEffects(
        previous,
        effects
    );

    return true;
}

function renderMessageText(
    text,
    tags
) {
    const container =
        document.createElement(
            "span"
        );

    container.className =
        "text";

    const twitchRanges =
        parseTwitchEmoteRanges(
            tags
        );

    if (!twitchRanges.length) {
        renderExternalText(
            container,
            text
        );

        renderTwemoji(
            container
        );

        return container;
    }

    let cursor = 0;

    for (
        const range
        of twitchRanges
    ) {
        if (
            range.start <
            cursor
        ) {
            continue;
        }

        if (
            range.start >
            cursor
        ) {
            renderExternalText(
                container,
                text.substring(
                    cursor,
                    range.start
                )
            );
        }

        const twitchEmote =
            twitchEmotes.get(
                String(range.id)
            );

        const url =
            twitchEmote?.url ||
            `https://static-cdn.jtvnw.net/` +
            `emoticons/v2/${range.id}` +
            `/default/dark/3.0`;

        const name =
            twitchEmote?.name ||
            text.substring(
                range.start,
                range.end + 1
            );

        const emote =
            createEmote(
                url,
                name
            );

        if (
            twitchEmote?.animated
        ) {
            emote.dataset.twitchAnimated =
                "true";
        }

        container.appendChild(
            emote
        );

        cursor =
            range.end + 1;
    }

    if (
        cursor <
        text.length
    ) {
        renderExternalText(
            container,
            text.substring(
                cursor
            )
        );
    }

    renderTwemoji(
        container
    );

    return container;
}

function getReplyInfo(tags, msg) {
    const replyUsername = tags["reply-parent-display-name"] || null;

    if (!replyUsername) {
        let cleanMessage = msg.trim();

        if (tags["is-action"]) {
            cleanMessage = cleanMessage
                .replace(/^\x01?ACTION /, "")
                .replace(/\x01$/, "");
        }

        return { username: null, message: cleanMessage };
    }

    let cleanMessage = msg.trim();
    const escapedUsername = replyUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const replyPrefix = new RegExp(`^\\x01?ACTION\\s+@${escapedUsername}\\s*`, "i");

    cleanMessage = cleanMessage
        .replace(replyPrefix, "")
        .replace(/\x01$/, "");

    return { username: replyUsername, message: cleanMessage };
}

function getTwitchDisplayColor(color, login) {
    if (typeof color === "string" && color) {
        let hex = color.trim();

        if (!hex.startsWith("#")) {
            hex = `#${hex}`;
        }

        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);

            const brightness = (r * 299 + g * 587 + b * 114) / 1000;

            if (brightness <= 50) {
                return lightenColor(hex, 30);
            }

            return hex;
        }
    }

    const twitchColors = [
        "#FF0000", // Red
        "#0000FF", // Blue
        "#008000", // Green
        "#B22222", // FireBrick
        "#FF7F50", // Coral
        "#9ACD32", // YellowGreen
        "#FF4500", // OrangeRed
        "#2E8B57", // SeaGreen
        "#DAA520", // GoldenRod
        "#D2691E", // Chocolate
        "#5F9EA0", // CadetBlue
        "#1E90FF", // DodgerBlue
        "#FF69B4", // HotPink
        "#8A2BE2", // BlueViolet
        "#00FF7F"  // SpringGreen
    ];

    const nick = String(login || "").toLowerCase();

    if (!nick.length) {
        return twitchColors[0];
    }

    const index =
        (nick.charCodeAt(0) + nick.charCodeAt(nick.length - 1)) %
        twitchColors.length;

    return twitchColors[index];
}

function lightenColor(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    let h, s;
    const l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;

        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }

        h /= 6;
    }

    const newL = Math.min(1, l + amount / 100);

    return hslToHex(h, s, newL);
}

function hslToHex(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = (x) => {
        const hex = Math.round(x * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function addPreviewMessage(
    user,
    msg,
    usernameColor,
    userId,
    tags = {}
) {
    const previewChat =
        document.getElementById("chat");   // FIXED

    if (!previewChat) {
        return;
    }

    const result = onMsg(
        user,
        msg,
        usernameColor,
        userId,
        tags,
        previewChat
    );

    requestAnimationFrame(() => {
        previewChat.scrollTop =
            previewChat.scrollHeight;
    });

    return result;
}

window.addPreviewMessage = addPreviewMessage;

async function onMsg(
    user,
    msg,
    usernameColor,
    userId,
    tags,
    targetChat = null,
    messageId = null
) {
    const chat =
        targetChat ||
        document.getElementById(
            "chat"
        );

    if (!chat) {
        return;
    }

    const replyInfo =
        getReplyInfo(
            tags,
            msg
        );

    const message =
        document.createElement(
            "div"
        );

    message.className =
        "message";

    if (wrapEnabled) {
        message.classList.add("wrap-message");
    }

    if (
        tags["custom-reward-id"]
    ) {
        message.classList.add(
            "redeem-message"
        );
    }

    message.style.setProperty(
        "--user-color",
        usernameColor
    );
    
    const badges =
        badgesEnabled
            ? createTwitchBadges(tags)
            : document.createElement("span");

    const ffzRoomBadge =
        createFFZRoomBadge(
            tags
        );

    if (ffzRoomBadge) {
        const twitchBadge =
            badges.querySelector(
                `.badge[data-badge-type="${ffzRoomBadge.type}"]`
            );

        if (twitchBadge) {
            twitchBadge.replaceWith(
                ffzRoomBadge.img
            );
        } else {
            badges.appendChild(
                ffzRoomBadge.img
            );
        }
    }


    const usernameElement =
        document.createElement(
            "span"
        );

    usernameElement.className =
        "username";

    usernameElement.textContent =
        user +
        (
            tags["is-action"]
                ? " "
                : ": "
        );

    usernameElement.style.color =
        usernameColor;

    usernameElement.style.webkitTextFillColor =
        usernameColor;


    const text =
        renderMessageText(
            replyInfo.message,
            tags
        );


    if (
        tags["is-action"]
    ) {
        if (userId) {
            get7TVPaint(
                userId
            )
                .then(paint => {
                    if (paint) {
                        applyPaint(
                            text,
                            paint
                        );
                    } else {
                        text.style.color =
                            usernameColor;

                        text.style.webkitTextFillColor =
                            usernameColor;
                    }
                });
        } else {
            text.style.color =
                usernameColor;

            text.style.webkitTextFillColor =
                usernameColor;
        }
    }

    message.appendChild(
        badges
    );

    message.appendChild(
        usernameElement
    );

    message.appendChild(
        text
    );

    chat.appendChild(
        message
    );

    if (messageId) {
        message.dataset.messageId = messageId;
        messageElements.set(messageId, message);
    }


    if (userId) {
        if (!userMessageElements.has(userId)) {
            userMessageElements.set(userId, new Set());
        }
        userMessageElements.get(userId).add(message);
        get7TVPaint(
            userId
        )
            .then(paint => {
                if (paint) {
                    applyPaint(
                        usernameElement,
                        paint
                    );
                }
            });

        if (badgesEnabled) {
            createExternalBadges(
                userId,
                tags
            )
                .then(externalBadges => {
                    if (
                        externalBadges.children.length >
                        0
                    ) {
                        message.insertBefore(
                            externalBadges,
                            usernameElement
                        );
                    }
                });
            }
    }

    if (fade != false) {
        setTimeout(() => {
            message.style.animation =
                "messageFadeOut 1s ease-in forwards";

            setTimeout(() => {
                message.remove();

                if (messageId) {
                    messageElements.delete(messageId);
                }

                if (userId && userMessageElements.has(userId)) {
                    userMessageElements.get(userId).delete(message);

                    if (userMessageElements.get(userId).size === 0) {
                        userMessageElements.delete(userId);
                    }
                }
            }, 1000);

        }, fade * 1000 - 1000);
    }
}

function parseIRCtags(raw) {
    const tags = {};

    if (!raw) {
        return tags;
    }

    for (
        const part
        of raw.split(";")
    ) {
        const equals =
            part.indexOf("=");

        if (equals === -1) {
            tags[part] =
                "";

            continue;
        }

        const key =
            part.substring(
                0,
                equals
            );

        const value =
            part.substring(
                equals + 1
            );

        tags[key] =
            value
                .replace(
                    /\\s/g,
                    " "
                )
                .replace(
                    /\\:/g,
                    ";"
                )
                .replace(
                    /\\r/g,
                    "\r"
                )
                .replace(
                    /\\n/g,
                    "\n"
                )
                .replace(
                    /\\\\/g,
                    "\\"
                );
    }

    return tags;
}

function addGlobalStyle() {
    if (
        document.getElementById(
            "ffz-effects-style"
        )
    ) {
        return;
    }

    const style =
        document.createElement(
            "style"
        );

    style.id =
        "ffz-effects-style";

    style.textContent = `

        @keyframes ffzRainbow {
            0% {
                filter:
                    hue-rotate(0deg)
                    saturate(1.5);
            }

            100% {
                filter:
                    hue-rotate(360deg)
                    saturate(1.5);
            }
        }

        @keyframes ffzShake {
            0%, 100% {
                transform:
                    translateX(0)
                    rotate(0deg);
            }

            20% {
                transform:
                    translateX(-3px)
                    rotate(-3deg);
            }

            40% {
                transform:
                    translateX(3px)
                    rotate(3deg);
            }

            60% {
                transform:
                    translateX(-3px)
                    rotate(-3deg);
            }

            80% {
                transform:
                    translateX(3px)
                    rotate(3deg);
            }
        }

        @keyframes ffzSpin {
            from {
                transform:
                    rotate(0deg);
            }

            to {
                transform:
                    rotate(360deg);
            }
        }

        @keyframes ffzSlide {
            0% {
                transform:
                    translateX(-10px);
            }

            50% {
                transform:
                    translateX(10px);
            }

            100% {
                transform:
                    translateX(-10px);
            }
        }

        @keyframes ffzArrive {
            0% {
                opacity: 0;
                transform:
                    scale(0);
            }

            60% {
                opacity: 1;
                transform:
                    scale(1.15);
            }

            100% {
                opacity: 1;
                transform:
                    scale(1);
            }
        }

        @keyframes ffzLeave {
            0% {
                opacity: 1;
                transform:
                    scale(1);
            }

            100% {
                opacity: 0;
                transform:
                    scale(0);
            }
        }

        @keyframes ffzHyper {
            0%, 100% {
                transform:
                    scale(1)
                    rotate(0deg);
            }

            25% {
                transform:
                    scale(1.12)
                    rotate(-4deg);
            }

            50% {
                transform:
                    scale(0.92)
                    rotate(4deg);
            }

            75% {
                transform:
                    scale(1.12)
                    rotate(-4deg);
            }
        }

        @keyframes ffzJam {
            0%, 100% {
                transform:
                    translateY(0)
                    scaleY(1);
            }

            12.5% {
                transform:
                    translateY(1px)
                    scaleY(0.95);
            }

            25% {
                transform:
                    translateY(4px)
                    scaleY(0.85);
            }

            37.5% {
                transform:
                    translateY(0)
                    scaleY(1.05);
            }

            50% {
                transform:
                    translateY(-5px)
                    scaleY(1.1);
            }

            62.5% {
                transform:
                    translateY(0)
                    scaleY(1);
            }

            75% {
                transform:
                    translateY(4px)
                    scaleY(0.85);
            }

            87.5% {
                transform:
                    translateY(0)
                    scaleY(1.05);
            }
        }

        @keyframes ffz-effect-bounce {
            0% {
                transform:
                    scale(0.8, 1);
            }

            10% {
                transform:
                    scale(0.9, 0.8);
            }

            20% {
                transform:
                    scale(1, 0.4);
            }

            25% {
                transform:
                    scale(1.2, 0.3);
            }

            25.001% {
                transform:
                    scale(-1.2, 0.3);
            }

            30% {
                transform:
                    scale(-1, 0.4);
            }

            40% {
                transform:
                    scale(-0.9, 0.8);
            }

            50% {
                transform:
                    scale(-0.8, 1);
            }

            60% {
                transform:
                    scale(-0.9, 0.8);
            }

            70% {
                transform:
                    scale(-1, 0.4);
            }

            75% {
                transform:
                    scale(-1.2, 0.3);
            }

            75.001% {
                transform:
                    scale(1.2, 0.3);
            }

            80% {
                transform:
                    scale(1, 0.4);
            }

            90% {
                transform:
                    scale(0.9, 0.8);
            }

            100% {
                transform:
                    scale(0.8, 1);
            }
        }

        @keyframes ffzPhotocopy {
            0%, 100% {
                filter:
                    grayscale(1)
                    contrast(1.35)
                    brightness(1.05);
            }

            50% {
                filter:
                    grayscale(1)
                    contrast(1.8)
                    brightness(0.9);
            }
        }

        .ffz-effect-target {
            display:
                inline-block;

            position:
                relative;
        }

        .ffz-effect-target > .emote {
            display:
                block;
        }

        .ffz-effect-transform {
            display:
                inline-block;

            transform:
                translateZ(0)
                scaleX(var(--ffz-scale-x, 1))
                scaleY(var(--ffz-scale-y, 1))
                rotate(var(--ffz-rotate, 0deg));

            transform-origin:
                center center;
        }

        .ffz-effect-flip-x {
            transform:
                scaleX(-1);
        }

        .ffz-effect-flip-y {
            transform:
                scaleY(-1);
        }

        .ffz-effect-grow-x {
            transform:
                scaleX(2);
        }

        .ffz-effect-shrink-x {
            transform:
                scaleX(0.5);
        }

        .ffz-effect-rainbow {
            animation:
                ffzRainbow
                1.5s
                linear
                infinite;
        }

        .ffz-effect-hyper-red {
            filter:
                saturate(2)
                hue-rotate(-20deg)
                contrast(1.8);
        }

        .ffz-effect-shake {
            animation:
                ffzShake
                0.18s
                linear
                infinite;
        }

        .ffz-effect-cursed {
            filter:
                grayscale(1)
                contrast(3)
                brightness(0.75);
        }

        .ffz-effect-jam {
            animation:
                ffzJam
                0.6s
                ease-in-out
                infinite;
        }

        .ffz-effect-bounce {
            animation:
                ffz-effect-bounce
                0.9s
                linear
                infinite;

            transform-origin:
                bottom center;
        }

        .ffz-effect-slide {
            animation:
                ffzSlide
                1s
                ease-in-out
                infinite;
        }

        .ffz-effect-appear {
            animation:
                ffzArrive
                0.7s
                ease-out
                forwards;
        }

        .ffz-effect-leave {
            animation:
                ffzLeave
                0.7s
                ease-in
                forwards;
        }

        .ffz-effect-rotate {
            animation:
                ffzSpin
                1s
                linear
                infinite;
        }

        .ffz-effect-hyper {
            animation:
                ffzHyper
                0.45s
                ease-in-out
                infinite;
        }

        .ffz-effect-photocopy {
            animation:
                ffzPhotocopy
                0.35s
                steps(2)
                infinite;
        }

        .seven-tv-painted {
            position:
                relative;

            display:
                inline-block;

            isolation:
                isolate;

            overflow:
                visible;

            background-clip:
                text;

            -webkit-background-clip:
                text;

            color:
                transparent;

            -webkit-text-fill-color:
                transparent;
        }

        .emote-overlay-target {
            position:
                relative;

            display:
                inline-block;

            width:
                auto;

            height:
                auto;

            line-height:
                0;

            vertical-align:
                middle;

            overflow:
                visible;
        }

        .emote-overlay-target >
        .emote:not(.seven-tv-zero-width) {
            position:
                relative;

            display:
                block;

            z-index:
                1;
        }

        .emote-overlay-target >
        .seven-tv-zero-width {
            position:
                absolute;

            left:
                50%;

            top:
                50%;

            width:
                100%;

            height:
                100%;

            max-width:
                none;

            max-height:
                none;

            object-fit:
                contain;

            transform:
                translate(-50%, -50%);

            display:
                block;

            pointer-events:
                none;

            z-index:
                2;
        }

        .badge {
            width:
                18px;

            height:
                18px;

            object-fit:
                contain;

            display:
                inline-block;

            vertical-align:
                middle;

            margin-right:
                2px;
        }
    `;

    document.head.appendChild(
        style
    );
}

function createEventSubSocket(url = null) {
    const socketUrl =
        url ||
        "wss://eventsub.wss.twitch.tv/ws";

    console.log(
        "Connecting to Twitch EventSub:",
        socketUrl
    );

    const socket =
        new WebSocket(socketUrl);

    eventSubSocket =
        socket;

    socket.onopen =
        function() {
            console.log(
                "Connected to Twitch EventSub WebSocket."
            );
        };


    socket.onmessage =
        async function(event) {
            try {
                const data =
                    JSON.parse(event.data);

                await handleEventSubMessage(
                    data
                );

            } catch (error) {
                console.error(
                    "EventSub message error:",
                    error
                );
            }
        };


    socket.onerror =
        function(error) {
            console.error(
                "Twitch EventSub WebSocket error:",
                error
            );
        };


    socket.onclose =
        function(event) {
            console.log(
                "Twitch EventSub WebSocket closed:",
                event.code,
                event.reason
            );

            eventSubSocket =
                null;

            eventSubSessionId =
                null;

            if (
                eventSubReconnectUrl
            ) {
                const reconnectUrl =
                    eventSubReconnectUrl;

                eventSubReconnectUrl =
                    null;

                clearTimeout(
                    eventSubReconnectTimer
                );

                eventSubReconnectTimer =
                    setTimeout(
                        () => {
                            createEventSubSocket(
                                reconnectUrl
                            );
                        },
                        100
                    );

                return;
            }

            clearTimeout(
                eventSubReconnectTimer
            );

            eventSubReconnectTimer =
                setTimeout(
                    () => {
                        if (
                            accessToken &&
                            !eventSubSocket
                        ) {
                            createEventSubSocket();
                        }
                    },
                    3000
                );
        };

    return socket;
}


async function handleEventSubMessage(data) {
    const messageType =
        data?.metadata?.message_type;

    if (!messageType) {
        return;
    }

    if (
        messageType ===
        "session_welcome"
    ) {
        const session =
            data.payload?.session;

        if (!session?.id) {
            console.error(
                "EventSub welcome did not contain a session ID."
            );

            return;
        }

        eventSubSessionId =
            session.id;

        console.log(
            "EventSub session:",
            eventSubSessionId
        );

        await subscribeToChat();

        return;
    }

    if (
        messageType ===
        "session_reconnect"
    ) {
        eventSubReconnectUrl =
            data.payload?.session?.reconnect_url ||
            null;

        console.log(
            "Twitch requested EventSub reconnect:",
            eventSubReconnectUrl
        );

        if (eventSubSocket) {
            eventSubSocket.close();
        }

        return;
    }

    if (
        messageType ===
        "session_keepalive"
    ) {
        return;
    }

    if (
        messageType ===
        "notification"
    ) {
        const subscription =
            data.payload?.subscription;

        const event =
            data.payload?.event;

        if (
            subscription?.type ===
            "channel.chat.message"
        ) {
            handleEventSubChatMessage(
                event
            );
        }

        if (
            subscription?.type ===
            "channel.chat.message_delete"
        ) {
            handleEventSubMessageDelete(
                event
            );
        }

        if (
            subscription?.type ===
            "channel.chat.clear_user_messages"
        ) {
            handleEventSubClearUserMessages(
                event
            );
        }

        if (
            subscription?.type ===
            "channel.chat.clear"
        ) {
            handleEventSubClearChat();
        }

        return;
    }
}

function handleEventSubMessageDelete(event) {
    if (!event) return;

    const messageId = event.message_id;

    if (!messageId) {
        return;
    }

    const element = messageElements.get(messageId);

    if (element) {
        element.remove();
        messageElements.delete(messageId);
    }
}

async function subscribeToChat() {
    if (
        !eventSubSessionId ||
        !accessToken
    ) {
        return;
    }

    if (
        !authenticatedUserId
    ) {
        console.error(
            "Cannot subscribe to chat: authenticated user ID is missing."
        );

        return;
    }

    const condition = {
        broadcaster_user_id:
            String(TWITCH_USER_ID),

        user_id:
            String(authenticatedUserId)
    };

    const transport = {
        method:
            "websocket",

        session_id:
            eventSubSessionId
    };

    const subscriptions = [
        {
            type: "channel.chat.message",
            version: "1",
            condition,
            transport
        },
        {
            type: "channel.chat.message_delete",
            version: "1",
            condition,
            transport
        },
        {
            type: "channel.chat.clear_user_messages",
            version: "1",
            condition,
            transport
        },
        {
            type: "channel.chat.clear",
            version: "1",
            condition,
            transport
        }
    ];

    for (const body of subscriptions) {
        try {
            const response =
                await fetch(
                    "https://api.twitch.tv/helix/eventsub/subscriptions",
                    {
                        method: "POST",
                        headers: {
                            "Client-ID": TWITCH_CLIENT_ID,
                            "Authorization": `Bearer ${accessToken}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(body)
                    }
                );

            const responseText =
                await response.text();

            if (!response.ok) {
                console.error(
                    "EventSub subscription failed:",
                    body.type,
                    response.status,
                    responseText
                );

                continue;
            }

            console.log(
                "EventSub subscription created:",
                body.type
            );

        } catch (error) {
            console.error(
                "EventSub subscription request error:",
                body.type,
                error
            );
        }
    }
}

function handleEventSubClearUserMessages(event) {
    if (!event) return;

    const userId = event.target_user_id;

    if (!userId) {
        return;
    }

    const elements = userMessageElements.get(userId);

    if (!elements) {
        return;
    }

    for (const element of elements) {
        const messageId = element.dataset.messageId;

        element.remove();

        if (messageId) {
            messageElements.delete(messageId);
        }
    }

    userMessageElements.delete(userId);
}

function handleEventSubClearChat() {
    const chat = document.getElementById("chat");

    if (chat) {
        chat.innerHTML = "";
    }

    messageElements.clear();
    userMessageElements.clear();
}

function handleEventSubChatMessage(event) {
    if (!event) return;

    const username = event.chatter_user_name || event.chatter_user_login || "Unknown";
    const userId = event.chatter_user_id || null;
    const usernameColor = getTwitchDisplayColor(event.color, event.chatter_user_login);
    const messageId = event.message_id || null;

    const rawText = event.message?.text || "";
    const actionMatch = rawText.match(/^\x01?ACTION /);
    const isAction = Boolean(actionMatch);
    const actionPrefixLength = actionMatch ? actionMatch[0].length : 0;

    const emoteRanges = convertEventSubEmotes(
        event.message?.fragments,
        rawText,
        actionPrefixLength
    );

    const badges = convertEventSubBadges(event.badges);

    const tags = {
        badges,
        emotes: emoteRanges,
        color: event.color || "",
        "user-id": userId,
        "display-name": username,
        "is-action": isAction,
        "custom-reward-id": event.channel_points_custom_reward_id || "",
        "reply-parent-msg-id": event.reply?.parent_message_id || "",
        "reply-parent-user-id": event.reply?.parent_user_id || "",
        "reply-parent-user-login": event.reply?.parent_user_login || "",
        "reply-parent-display-name": event.reply?.parent_user_name || "",
        "reply-parent-msg-body": event.reply?.parent_message_body || ""
    };

    try {
        onMsg(username, rawText, usernameColor, userId, tags, null, messageId);
    } catch (error) {
        console.error("Message rendering error:", error, { username, rawText });
    }
}


function convertEventSubBadges(
    badges
) {
    if (
        !Array.isArray(
            badges
        )
    ) {
        return "";
    }


    return badges
        .map(badge => {
            const setId =
                badge?.set_id;

            const version =
                badge?.id;

            if (
                !setId ||
                !version
            ) {
                return null;
            }

            return (
                `${setId}/${version}`
            );
        })
        .filter(Boolean)
        .join(",");
}


function convertEventSubEmotes(fragments, text, offset = 0) {
    if (!Array.isArray(fragments) || !text) {
        return "";
    }

    const ranges = [];
    let cursor = 0;

    for (const fragment of fragments) {
        const fragmentText = fragment?.text || "";

        if (!fragmentText) {
            continue;
        }

        const start = text.indexOf(fragmentText, cursor);

        if (start === -1) {
            continue;
        }

        const end = start + fragmentText.length - 1;

        if (fragment.type === "emote") {
            const emoteId = fragment.emote?.id;

            if (emoteId) {
                ranges.push({
                    id: String(emoteId),
                    start: start - offset,
                    end: end - offset
                });
            }
        }

        cursor = start + fragmentText.length;
    }

    if (!ranges.length) {
        return "";
    }

    const grouped = new Map();

    for (const range of ranges) {
        if (!grouped.has(range.id)) {
            grouped.set(range.id, []);
        }

        grouped
            .get(range.id)
            .push(`${range.start}-${range.end}`);
    }

    return Array.from(grouped.entries())
        .map(([id, rangesForId]) => `${id}:${rangesForId.join(",")}`)
        .join("/");
}

addGlobalStyle();

async function startOverlay() {
    addGlobalStyle();

    if (!selectedChannel) {
        loadSavedTwitchAuth();

        showTwitchLoginScreen();

        return;
    }

    const authenticated =
        await ensureTwitchAuth();

    if (!authenticated) {
        console.log(
            "Twitch authentication required."
        );

        return;
    }

    const channelResolved =
        await resolveOverlayChannel();

    if (!channelResolved) {
        return;
    }

    hideTwitchLoginScreen();

    Promise.allSettled([
        load7TVGlobalEmotes(),
        load7TVEmotes(),
        loadTwitchEmotes(),
        loadFFZEmotes(),
        loadBTTVEmotes(),
        loadExternalBadges()
    ])
        .then(() => {
            console.log(
                "Chat emotes and badge data loaded."
            );

            console.log(
                "Overlay channel:",
                CHANNEL
            );

            console.log(
                "Overlay channel ID:",
                TWITCH_USER_ID
            );

            console.log(
                "Authenticated reader:",
                authenticatedUsername
            );
        });

    createEventSubSocket();

    setInterval(
        async () => {
            if (!accessToken) {
                return;
            }

            const valid =
                await validateTwitchToken();

            if (!valid) {
                if (eventSubSocket) {
                    eventSubSocket.close();
                }

                showTwitchLoginScreen();
            }
        },
        5 * 60 * 1000
    );
}

startOverlay()
    .catch(error => {
        console.error(
            "Overlay startup error:",
            error
        );
    });