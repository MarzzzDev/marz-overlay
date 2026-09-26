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

const sevenTVPersonalEmotes = new Map();
const sevenTVUserIdToUsername = new Map();

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
const LOADING_TASKS = [
    { label: "7TV global emotes", run: load7TVGlobalEmotes },
    { label: "7TV channel emotes", run: load7TVEmotes },
    { label: "Twitch emotes", run: loadTwitchEmotes },
    { label: "FFZ emotes", run: loadFFZEmotes },
    { label: "BTTV emotes", run: loadBTTVEmotes },
    { label: "Twitch badges", run: loadTwitchBadges },
    { label: "FFZ badges", run: loadFFZBadges },
    { label: "Chatterino badges", run: loadChatterinoBadges }
];

function showLoadingIndicator() {
    const indicator = document.createElement("div");

    indicator.id = "overlay-loading-indicator";

    indicator.style.cssText = `
        position: fixed;
        inset: 0;

        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 12px;

        color: #ffffff;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 50px;

        pointer-events: none;
        z-index: 999999;
    `;

    document.body.appendChild(indicator);

    return indicator;
}

async function runLoadingTasks(tasks) {
    const indicator = showLoadingIndicator();
    const pending = new Set(tasks.map(task => task.label));

    function refresh() {
        if (!indicator) {
            return;
        }

        indicator.textContent = pending.size
            ? `Loading ${[...pending].join(", ")}...`
            : "Ready!";
    }

    refresh();

    await Promise.allSettled(
        tasks.map(task =>
            task.run()
                .catch(error => {
                    console.error(`${task.label} failed to load:`, error);
                })
                .finally(() => {
                    pending.delete(task.label);
                    refresh();
                })
        )
    );

    if (indicator) {
        indicator.remove();
    }
}

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


function add7TVPersonalEmote(
    username,
    name,
    activeEmote
) {
    username =
        String(
            username || ""
        )
            .trim()
            .toLowerCase();

    name =
        String(
            name || ""
        ).trim();

    if (
        !username ||
        !name ||
        !activeEmote
    ) {
        return;
    }

    const data =
        activeEmote.data;

    const host =
        get7TVHostUrl(
            activeEmote
        );

    if (
        !data ||
        !host
    ) {
        return;
    }

    const webpFiles =
        Array.isArray(
            data.host?.files
        )
            ? data.host.files
                .filter(
                    file =>
                        file?.format === "WEBP"
                )
                .slice()
                .sort(
                    (a, b) =>
                        Number(a?.width || 0) -
                        Number(b?.width || 0)
                )
            : [];

    const maxSizeName =
        webpFiles.length
            ? webpFiles[
                webpFiles.length - 1
            ]?.name
            : null;

    if (
        !maxSizeName
    ) {
        return;
    }

    const zeroWidth =
        Boolean(
            Number(
                activeEmote.flags || 0
            ) & 1
        ) ||
        Boolean(
            Number(
                data.flags || 0
            ) & 256
        );

    const normalizedEmote = {
        platform:
            "7TV",

        id:
            data.id
                ? String(data.id)
                : (
                    activeEmote.id
                        ? String(activeEmote.id)
                        : null
                ),

        name,

        image:
            `${host}/${maxSizeName}`,

        global:
            false,

        listed:
            data.listed !== false,

        zeroWidth,

        originalName:
            activeEmote.name === data.name
                ? null
                : (
                    data.name ||
                    null
                )
    };

    if (
        !sevenTVPersonalEmotes.has(
            username
        )
    ) {
        sevenTVPersonalEmotes.set(
            username,
            new Map()
        );
    }

    sevenTVPersonalEmotes
        .get(username)
        .set(
            name,
            normalizedEmote
        );

    console.debug(
        "[7TV] Personal emote added:",
        username,
        name,
        normalizedEmote.image
    );
}

function remove7TVPersonalEmote(
    username,
    name
) {
    username =
        String(
            username || ""
        )
            .trim()
            .toLowerCase();

    const userEmotes =
        sevenTVPersonalEmotes.get(
            username
        );

    if (
        !userEmotes
    ) {
        return;
    }

    userEmotes.delete(
        String(name || "")
    );

    if (
        userEmotes.size === 0
    ) {
        sevenTVPersonalEmotes.delete(
            username
        );
    }

    console.debug(
        "[7TV] Personal emote removed:",
        username,
        name
    );
}

function get7TVPersonalEmotesForUser(
    username
) {
    username =
        String(
            username || ""
        )
            .trim()
            .toLowerCase();

    if (
        sevenTVPersonalEmotes.has(
            username
        )
    ) {
        return sevenTVPersonalEmotes.get(
            username
        );
    }

    return new Map();
}

async function get7TVUsernameById(
    userId
) {
    if (
        !userId
    ) {
        return null;
    }

    userId =
        String(userId);

    if (
        sevenTVUserIdToUsername.has(
            userId
        )
    ) {
        return (
            sevenTVUserIdToUsername.get(
                userId
            )
        );
    }

    try {
        const response =
            await fetch(
                `https://7tv.io/v3/users/${encodeURIComponent(
                    userId
                )}`
            );

        if (
            !response.ok
        ) {
            sevenTVUserIdToUsername.set(
                userId,
                null
            );

            return null;
        }

        const data =
            await response.json();

        const username =
            data?.username
                ? String(
                    data.username
                )
                    .trim()
                    .toLowerCase()
                : null;

        sevenTVUserIdToUsername.set(
            userId,
            username
        );

        console.debug(
            "[7TV] actor_id -> username:",
            userId,
            username
        );

        return username;

    } catch (error) {
        console.error(
            "7TV personal emote username lookup error:",
            error
        );

        sevenTVUserIdToUsername.set(
            userId,
            null
        );

        return null;
    }
}

function subscribeToSevenTVChannelEmoteSets(
    twitchChannelId
) {
    if (
        !sevenTVEventSocket ||
        !twitchChannelId
    ) {
        return;
    }

    const payload = {
        op:
            SEVENTV_OPCODES.SUBSCRIBE,

        d: {
            type:
                "emote_set.*",

            condition: {
                platform:
                    "TWITCH",

                ctx:
                    "channel",

                id:
                    String(twitchChannelId)
            }
        }
    };

    sevenTVEventSocket.send(
        JSON.stringify(
            payload
        )
    );

    console.log(
        "Subscribed to 7TV channel emote_set.* for:",
        twitchChannelId
    );
}

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
        subscribeToSevenTVChannelEmoteSets(
            TWITCH_USER_ID
        );

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
 
async function handleSevenTVEmoteSetUpdate(
    body
) {
    if (!body) {
        return;
    }

    const emoteSetId =
        body.id ||
        body.object_id ||
        null;

    const personalEmoteSet =
        Boolean(
            emoteSetId &&
            emoteSetId !==
                sevenTVEmoteSetId
        );

    const emotesUpdated =
        body.updated || [];

    const emotesRemoved =
        (body.pulled || [])
            .map(
                entry =>
                    entry?.old_value
            )
            .filter(Boolean);

    const emotesAdded =
        (body.pushed || [])
            .map(
                entry =>
                    entry?.value
            )
            .filter(Boolean);

    for (
        const update
        of emotesUpdated
    ) {
        const oldEmote =
            update?.old_value;

        const newActiveEmote =
            update?.value;

        if (
            !oldEmote ||
            !newActiveEmote
        ) {
            continue;
        }

        if (
            !personalEmoteSet
        ) {
            if (oldEmote.name) {
                sevenTVEmotes.delete(
                    oldEmote.name
                );
            }

            add7TVEmote(
                newActiveEmote
            );

            continue;
        }

        const username =
            await get7TVUsernameById(
                newActiveEmote.actor_id
            );

        if (!username) {
            continue;
        }

        remove7TVPersonalEmote(
            username,
            oldEmote.name
        );

        add7TVPersonalEmote(
            username,
            newActiveEmote.name,
            newActiveEmote
        );
    }

    for (
        const emote
        of emotesRemoved
    ) {
        if (
            !personalEmoteSet
        ) {
            if (emote.name) {
                sevenTVEmotes.delete(
                    emote.name
                );
            }

            continue;
        }

        const username =
            await get7TVUsernameById(
                emote.actor_id
            );

        if (username) {
            remove7TVPersonalEmote(
                username,
                emote.name
            );
        }
    }

    for (
        const activeEmote
        of emotesAdded
    ) {
        if (
            !personalEmoteSet
        ) {
            add7TVEmote(
                activeEmote
            );

            continue;
        }

        const username =
            await get7TVUsernameById(
                activeEmote.actor_id
            );

        if (username) {
            add7TVPersonalEmote(
                username,
                activeEmote.name,
                activeEmote
            );
        }
    }

    console.debug(
        "7TV emote_set.update:",
        {
            emoteSetId,
            personalEmoteSet,
            added:
                emotesAdded.length,
            removed:
                emotesRemoved.length,
            updated:
                emotesUpdated.length
        }
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

let backgroundColor =
    typeof overlaySettings.backgroundColor === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(overlaySettings.backgroundColor)
        ? overlaySettings.backgroundColor
        : "#2d0c12";

function hexToRgbaString(hex, alpha) {
    let h = hex.replace("#", "");

    if (h.length === 3) {
        h = h.split("").map(c => c + c).join("");
    }

    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyBackgroundColor(hex) {
    document.documentElement.style.setProperty(
        "--bg-color-1",
        hexToRgbaString(hex, 0.9)
    );

    document.documentElement.style.setProperty(
        "--bg-color-2",
        hexToRgbaString(hex, 0.75)
    );
}

applyBackgroundColor(backgroundColor);

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

const CHAT_FONTS = [
    { label: "Open Sans", value: "'Open Sans', sans-serif" },
    { label: "Arial", value: "Arial, sans-serif" },
    { label: "Comic Sans MS", value: "'Comic Sans MS', sans-serif" },
    { label: "Roboto", value: "'Roboto', sans-serif" },
    { label: "Montserrat", value: "'Montserrat', sans-serif" },
    { label: "Minecraft", value: "'Minecraft', sans-serif" }
];

const GOOGLE_FONT_FAMILIES = {
    "'Open Sans', sans-serif": "Open+Sans:wght@400;600;700;800;900",
    "'Roboto', sans-serif": "Roboto:wght@400;700;900",
    "'Montserrat', sans-serif": "Montserrat:wght@400;700;900",
    "'Bangers', cursive": "Bangers"
};

const loadedGoogleFonts = new Set();

function loadGoogleFontIfNeeded(fontValue) {
    const family = GOOGLE_FONT_FAMILIES[fontValue];

    if (!family || loadedGoogleFonts.has(family)) {
        return;
    }

    loadedGoogleFonts.add(family);

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
    document.head.appendChild(link);
}

const CUSTOM_FONT_FACES = {
    "'Comic Sans MS', sans-serif": {
        family: "Comic Sans MS",
        url: "./fonts/COMIC.TTF"
    },
    "'Minecraft', sans-serif": {
        family: "Minecraft",
        url: "./fonts/Minecraft.ttf"
    }
};

const loadedCustomFonts = new Set();

function loadCustomFontIfNeeded(fontValue) {
    const fontFace = CUSTOM_FONT_FACES[fontValue];

    if (!fontFace || loadedCustomFonts.has(fontFace.family)) {
        return;
    }

    loadedCustomFonts.add(fontFace.family);

    const style = document.createElement("style");

    style.textContent = `
        @font-face {
            font-family: "${fontFace.family}";
            src: url("${fontFace.url}") format("truetype");
            font-display: swap;
        }
    `;

    document.head.appendChild(style);
}

let chatFont =
    typeof overlaySettings.font === "string" &&
    overlaySettings.font.trim()
        ? overlaySettings.font
        : "'Open Sans', sans-serif";

document.documentElement.style.setProperty("--chat-font", chatFont);
loadGoogleFontIfNeeded(chatFont);
loadCustomFontIfNeeded(chatFont);

document.body.classList.toggle(
    "pixel-font",
    chatFont === "'Minecraft', sans-serif"
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
        { badges: "moderator/1,subscriber/1,pikachu/1" }
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
    let screen = document.getElementById("twitch-login-screen");

    if (screen) {
        return;
    }

    screen = document.createElement("div");
    screen.id = "twitch-login-screen";

    loadGoogleFontIfNeeded("'Open Sans', sans-serif");

    const style = document.createElement("style");
    style.dataset.marzSetup = "true";
    style.textContent = `
        html:has(#twitch-login-screen),
        body:has(#twitch-login-screen) {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #0b0b0e;
        }

        #twitch-login-screen {
            position: fixed;
            left: 0;
            top: 0;
            width: 80vw;
            height: 80vh;
            zoom: 1.25;
            z-index: 999999;
            display: grid;
            grid-template-columns: 196px minmax(360px, 470px) minmax(0, 1fr);
            grid-template-rows: 58px minmax(0, 1fr);
            background: #0b0b0e;
            color: #f4f4f5;
            font-family: 'Open Sans', Arial, sans-serif;
            overflow: hidden;
        }

        /* Keep the 125% setup surface pinned to the viewport instead of exposing body edges. */
        html:has(#twitch-login-screen),
        body:has(#twitch-login-screen) {
            scrollbar-width: none;
        }

        html:has(#twitch-login-screen)::-webkit-scrollbar,
        body:has(#twitch-login-screen)::-webkit-scrollbar {
            display: none;
        }

        #twitch-login-screen *,
        #twitch-login-screen *::before,
        #twitch-login-screen *::after {
            box-sizing: border-box;
        }

        #twitch-login-screen button,
        #twitch-login-screen input,
        #twitch-login-screen select {
            font: inherit;
        }

        #twitch-login-screen .mc-topbar {
            grid-column: 1 / -1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 18px;
            border-bottom: 1px solid #27272d;
            background: #111114;
        }

        #twitch-login-screen .mc-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }

        #twitch-login-screen .mc-brand-mark {
            height: 30px;
            width: auto;
            max-width: 96px;
            display: block;
            flex: 0 0 auto;
            border-radius: 0;
            object-fit: contain;
            object-position: center;
        }

        #twitch-login-screen .mc-brand-text {
            min-width: 0;
        }

        #twitch-login-screen .mc-brand-name {
            color: #fafafa;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.05;
            letter-spacing: .02em;
        }

        #twitch-login-screen .mc-brand-m {
            color: #f2df9b;
        }

        #twitch-login-screen .mc-brand-page {
            margin-top: 3px;
            color: #74747f;
            font-size: 9px;
            line-height: 1;
            text-transform: none;
            letter-spacing: .11em;
        }

        #twitch-login-screen .mc-top-status {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #868690;
            font-size: 9px;
            text-transform: none;
            letter-spacing: .08em;
        }

        #twitch-login-screen .mc-status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #3d3d45;
        }

        #twitch-login-screen .mc-sidebar {
            min-width: 0;
            min-height: 0;
            display: flex;
            flex-direction: column;
            padding: 13px 10px;
            border-right: 1px solid #27272d;
            background: #101013;
        }

        #twitch-login-screen .mc-nav-label {
            padding: 0 8px 8px;
            color: #62626c;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: .14em;
            text-transform: none;
        }

        #twitch-login-screen .mc-nav {
            display: flex;
            flex-direction: column;
            gap: 3px;
        }

        #twitch-login-screen .mc-nav-button {
            position: relative;
            display: grid;
            grid-template-columns: 24px 1fr;
            align-items: center;
            gap: 7px;
            width: 100%;
            min-height: 38px;
            padding: 0 8px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: #8c8c96;
            text-align: left;
            cursor: pointer;
            transition: background .12s ease, color .12s ease;
        }

        #twitch-login-screen .mc-nav-button:hover {
            background: #17171b;
            color: #d8d8de;
        }

        #twitch-login-screen .mc-nav-button.is-active {
            background: #2a271d;
            color: #f0e9f8;
        }

        #twitch-login-screen .mc-nav-button.is-active::before {
            content: "";
            position: absolute;
            left: -10px;
            top: 8px;
            bottom: 8px;
            width: 2px;
            border-radius: 2px;
            background: #e8d58a;
        }

        #twitch-login-screen .mc-nav-icon {
            width: 24px;
            color: #66666f;
            font-size: 10px;
            font-weight: 800;
            text-align: center;
        }

        #twitch-login-screen .mc-nav-button.is-active .mc-nav-icon {
            color: #f2df9b;
        }

        #twitch-login-screen .mc-nav-copy {
            min-width: 0;
        }

        #twitch-login-screen .mc-nav-title {
            font-size: 10px;
            font-weight: 700;
        }

        #twitch-login-screen .mc-side-spacer {
            flex: 1;
        }

        #twitch-login-screen .mc-side-hint {
            padding: 9px 8px;
            border-top: 1px solid #222228;
            color: #5d5d67;
            font-size: 8px;
            line-height: 1.5;
        }

        #twitch-login-screen .mc-controls {
            min-width: 0;
            min-height: 0;
            display: flex;
            flex-direction: column;
            background: #0f0f12;
            border-right: 1px solid #27272d;
        }

        #twitch-login-screen .mc-controls-head {
            padding: 18px 18px 15px;
            border-bottom: 1px solid #27272d;
        }

        #twitch-login-screen .mc-control-title {
            margin: 0;
            font-size: 15px;
            line-height: 1.15;
            font-weight: 800;
            letter-spacing: -.02em;
        }

        #twitch-login-screen .mc-control-subtitle {
            margin: 5px 0 0;
            color: #686872;
            font-size: 9px;
            line-height: 1.45;
        }

        #twitch-login-screen .mc-panel-stack {
            flex: 1;
            min-height: 0;
            overflow: auto;
            padding: 14px 18px 20px;
            scrollbar-width: thin;
            scrollbar-color: #34343c transparent;
        }

        #twitch-login-screen .mc-panel {
            display: none;
        }

        #twitch-login-screen .mc-panel.is-active {
            display: block;
        }

        #twitch-login-screen .mc-field {
            margin-bottom: 15px;
        }

        #twitch-login-screen .mc-field:last-child {
            margin-bottom: 0;
        }

        #twitch-login-screen .mc-label {
            display: block;
            margin-bottom: 6px;
            color: #b9b9c1;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: .05em;
            text-transform: none;
        }

        #twitch-login-screen .mc-input,
        #twitch-login-screen .mc-select {
            width: 100%;
            height: 34px;
            padding: 0 10px;
            border: 1px solid #32323a;
            border-radius: 5px;
            background: #0a0a0d;
            color: #f6f6f7;
            outline: none;
            font-size: 10px;
            transition: border-color .12s ease, background .12s ease;
        }

        #twitch-login-screen .mc-input:hover,
        #twitch-login-screen .mc-select:hover {
            border-color: #45454f;
        }

        #twitch-login-screen .mc-input:focus,
        #twitch-login-screen .mc-select:focus {
            border-color: #e8d58a;
            background: #0d0c10;
        }

        #twitch-login-screen .mc-inline {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
        }


        #twitch-login-screen .mc-divider {
            height: 1px;
            margin: 17px 0;
            background: #24242a;
        }

        #twitch-login-screen .mc-subhead {
            margin: 0 0 9px;
            color: #777781;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: .13em;
            text-transform: none;
        }

        #twitch-login-screen .mc-toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-height: 40px;
            padding: 0 10px;
            margin-bottom: 4px;
            border: 1px solid #25252b;
            border-radius: 5px;
            background: #121216;
            cursor: pointer;
            user-select: none;
            transition: border-color .12s ease, background .12s ease;
        }

        #twitch-login-screen .mc-toggle-row:hover {
            border-color: #33333a;
            background: #151519;
        }

        #twitch-login-screen .mc-toggle-copy {
            min-width: 0;
        }

        #twitch-login-screen .mc-toggle-title {
            color: #d5d5db;
            font-size: 10px;
            font-weight: 700;
        }

        #twitch-login-screen .mc-toggle-note {
            margin-top: 2px;
            color: #5e5e68;
            font-size: 8px;
            line-height: 1.3;
        }

        #twitch-login-screen .mc-check {
            width: 1px;
            height: 1px;
            position: absolute;
            opacity: 0;
            pointer-events: none;
        }

        #twitch-login-screen .mc-switch {
            width: 31px;
            height: 18px;
            flex: 0 0 auto;
            position: relative;
            border-radius: 999px;
            background: #36363e;
            transition: background .12s ease;
        }

        #twitch-login-screen .mc-switch::after {
            content: "";
            position: absolute;
            width: 14px;
            height: 14px;
            top: 2px;
            left: 2px;
            border-radius: 50%;
            background: #ececf0;
            transition: transform .12s ease;
        }

        #twitch-login-screen .mc-toggle-row.is-on .mc-switch {
            background: #e8d58a;
        }

        #twitch-login-screen .mc-toggle-row.is-on .mc-switch::after {
            transform: translateX(13px);
        }

        #twitch-login-screen .mc-color-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 86px;
            align-items: center;
            gap: 10px;
            padding: 8px 10px 9px;
            margin: -4px 0 4px;
            border: 1px solid #24242a;
            border-top: 0;
            border-radius: 0 0 5px 5px;
            background: #0e0e11;
        }

        #twitch-login-screen .mc-muted {
            color: #62626b;
            font-size: 8px;
        }

        #twitch-login-screen .mc-color {
            width: 86px;
            height: 24px;
            padding: 1px;
            border: 1px solid #36363e;
            border-radius: 4px;
            background: #0a0a0d;
            cursor: pointer;
        }

        #twitch-login-screen .mc-color::-webkit-color-swatch-wrapper { padding: 0; }
        #twitch-login-screen .mc-color::-webkit-color-swatch { border: 0; border-radius: 3px; }
        #twitch-login-screen .mc-color::-moz-color-swatch { border: 0; border-radius: 3px; }

        #twitch-login-screen .mc-two-col {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        #twitch-login-screen .mc-range-line {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 72px;
            gap: 10px;
            align-items: center;
        }

        #twitch-login-screen .mc-unit {
            color: #65656e;
            font-size: 8px;
        }

        #twitch-login-screen .mc-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            padding-top: 15px;
            margin-top: 15px;
            border-top: 1px solid #25252b;
        }

        #twitch-login-screen .mc-button {
            height: 35px;
            border: 1px solid #35353d;
            border-radius: 5px;
            background: #19191e;
            color: #dcdce1;
            font-size: 9px;
            font-weight: 800;
            cursor: pointer;
            transition: background .12s ease, border-color .12s ease, color .12s ease;
        }

        #twitch-login-screen .mc-button:hover {
            background: #212127;
            border-color: #484850;
            color: #fff;
        }

        #twitch-login-screen .mc-button-primary {
            border-color: #9147ff;
            background: #9147ff;
            color: #fff;
        }

        #twitch-login-screen .mc-button-primary:hover {
            background: #7f35e7;
            border-color: #7f35e7;
        }

        #twitch-login-screen .mc-button-full {
            grid-column: 1 / -1;
        }

        #twitch-login-screen .mc-footnote {
            margin-top: 9px;
            color: #55555e;
            font-size: 8px;
            line-height: 1.45;
            text-align: center;
        }

        #twitch-login-screen .mc-error {
            display: none;
            margin-top: 9px;
            padding: 8px 9px;
            border: 1px solid rgba(239, 68, 68, .28);
            border-radius: 5px;
            background: rgba(239, 68, 68, .08);
            color: #f08a8a;
            font-size: 8px;
            line-height: 1.4;
        }

        #twitch-login-screen .mc-stage {
            min-width: 0;
            min-height: 0;
            display: flex;
            flex-direction: column;
            background: #09090c;
        }

        #twitch-login-screen .mc-stage-head {
            height: 44px;
            flex: 0 0 44px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 15px;
            border-bottom: 1px solid #27272d;
            background: #0e0e11;
        }

        #twitch-login-screen .mc-stage-title {
            color: #a6a6af;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: .13em;
            text-transform: none;
        }

        #twitch-login-screen .mc-stage-meta {
            display: flex;
            align-items: center;
            gap: 9px;
            color: #5c5c66;
            font-size: 8px;
        }

        #twitch-login-screen .mc-stage-meta strong {
            color: #8b8b95;
            font-weight: 700;
        }

        #twitch-login-screen .mc-stage-canvas {
            position: relative;
            flex: 1;
            min-width: 0;
            min-height: 0;
            display: grid;
            place-items: center;
            padding: 20px;
            overflow: hidden;
        }

        #twitch-login-screen .mc-stage-canvas::before {
            content: "";
            position: absolute;
            pointer-events: none;
        }

        #twitch-login-screen .mc-stage-canvas::before {
            inset: 0;
            opacity: .33;
            background-image:
                linear-gradient(#1f1f24 1px, transparent 1px),
                linear-gradient(90deg, #1f1f24 1px, transparent 1px);
            background-size: 36px 36px;
            mask-image: radial-gradient(circle at 50% 45%, black 0%, transparent 80%);
        }

        #twitch-login-screen .mc-preview-frame {
            position: relative;
            z-index: 1;
            width: min(760px, calc(100% - 40px));
            height: min(720px, calc(100% - 40px));
            min-width: 0;
            min-height: 0;
            max-width: 100%;
            max-height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            overflow: hidden;
            border: 1px solid #34343c;
            border-radius: 8px;
            background: #111116;
            box-shadow: none;
        }

        #twitch-login-screen .mc-preview-corner {
            position: absolute;
            inset: 10px 10px auto auto;
            z-index: 3;
            height: 22px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 0 8px;
            border: 1px solid #2d2d34;
            border-radius: 4px;
            background: rgba(7,7,10,.72);
            color: #676770;
            font-size: 7px;
            font-weight: 800;
            letter-spacing: .09em;
            text-transform: none;
            backdrop-filter: none;
        }

        #twitch-login-screen .mc-preview-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #35c759;
        }

        #twitch-login-screen #chat.mc-preview-chat {
            position: relative;
            z-index: 2;
            width: 100%;
            height: 100%;
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            overflow-y: auto;
            padding: 22px;
            scrollbar-width: none;
        }

        #twitch-login-screen #chat.mc-preview-chat::-webkit-scrollbar {
            display: none;
        }

        #twitch-login-screen .mc-preview-note {
            position: absolute;
            z-index: 2;
            left: 22px;
            bottom: 18px;
            color: #4e4e57;
            font-size: 7px;
            letter-spacing: .08em;
            text-transform: none;
            pointer-events: none;
        }

        #twitch-login-screen .mc-stage-help {
            position: absolute;
            right: 34px;
            bottom: 22px;
            z-index: 2;
            max-width: 220px;
            color: #4e4e57;
            font-size: 7px;
            line-height: 1.45;
            text-align: right;
        }

        #twitch-login-screen .mc-nav-title {
            font-size: 12px;
        }

        #twitch-login-screen .mc-brand-name {
            font-size: 14px;
        }

        #twitch-login-screen .mc-brand-page {
            font-size: 10px;
        }

        #twitch-login-screen .mc-control-title {
            font-size: 18px;
        }

        #twitch-login-screen .mc-control-subtitle,
        #twitch-login-screen .mc-label,
        #twitch-login-screen .mc-input,
        #twitch-login-screen .mc-select,
        #twitch-login-screen .mc-toggle-title,
        #twitch-login-screen .mc-button {
            font-size: 11px;
        }

        #twitch-login-screen .mc-toggle-note,
        #twitch-login-screen .mc-muted,
        #twitch-login-screen .mc-footnote {
            font-size: 9px;
        }

        @media (max-width: 1020px) {
            #twitch-login-screen {
                grid-template-columns: 176px minmax(330px, 420px) minmax(0, 1fr);
            }

            #twitch-login-screen .mc-stage-canvas {
                padding: 14px;
            }
        }

        @media (max-width: 780px) {
            #twitch-login-screen {
                grid-template-columns: 1fr;
                grid-template-rows: 58px auto minmax(320px, 1fr);
                overflow-y: auto;
            }

            #twitch-login-screen .mc-sidebar {
                min-height: auto;
                border-right: 0;
                border-bottom: 1px solid #27272d;
            }

            #twitch-login-screen .mc-nav {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
            }

            #twitch-login-screen .mc-nav-button {
                grid-template-columns: 1fr;
                justify-items: center;
                gap: 2px;
                min-height: 46px;
                text-align: center;
            }

            #twitch-login-screen .mc-nav-button.is-active::before {
                left: 12px;
                right: 12px;
                top: auto;
                bottom: 0;
                width: auto;
                height: 2px;
            }

            #twitch-login-screen .mc-side-spacer,
            #twitch-login-screen .mc-side-hint {
                display: none;
            }

            #twitch-login-screen .mc-controls {
                border-right: 0;
                border-bottom: 1px solid #27272d;
            }

            #twitch-login-screen .mc-panel-stack {
                max-height: 430px;
            }

            #twitch-login-screen .mc-stage {
                min-height: 430px;
            }
        }

        @media (max-width: 520px) {
            #twitch-login-screen .mc-two-col,
            #twitch-login-screen .mc-actions {
                grid-template-columns: 1fr;
            }

            #twitch-login-screen .mc-button-full {
                grid-column: auto;
            }

            #twitch-login-screen .mc-preview-frame {
                width: 100%;
                height: calc(100% - 20px);
            }

            #twitch-login-screen .mc-stage-help {
                display: none;
            }
        }
    `;

    screen.appendChild(style);

    const topbar = document.createElement("header");
    topbar.className = "mc-topbar";

    const brand = document.createElement("div");
    brand.className = "mc-brand";

    const brandMark = document.createElement("img");
    brandMark.className = "mc-brand-mark";
    brandMark.src = "waga.gif";
    brandMark.alt = "Waga";
    brandMark.draggable = false;

    const brandText = document.createElement("div");
    brandText.className = "mc-brand-text";

    const brandName = document.createElement("div");
    brandName.className = "mc-brand-name";

    const brandM = document.createElement("span");
    brandM.className = "mc-brand-m";
    brandM.textContent = "M";

    brandName.appendChild(brandM);
    brandName.appendChild(document.createTextNode("Chat"));

    const brandPage = document.createElement("div");
    brandPage.className = "mc-brand-page";
    brandPage.textContent = "The most up-to-date Twitch chat Overlay";

    brandText.appendChild(brandName);
    brandText.appendChild(brandPage);
    brand.appendChild(brandMark);
    brand.appendChild(brandText);

    topbar.appendChild(brand);
    const sidebar = document.createElement("aside");
    sidebar.className = "mc-sidebar";

    const navLabel = document.createElement("div");
    navLabel.className = "mc-nav-label";
    navLabel.textContent = "Setup";

    const nav = document.createElement("nav");
    nav.className = "mc-nav";

    sidebar.appendChild(navLabel);
    sidebar.appendChild(nav);

    const spacer = document.createElement("div");
    spacer.className = "mc-side-spacer";
    sidebar.appendChild(spacer);

    const hint = document.createElement("div");
    hint.className = "mc-side-hint";
    hint.textContent = "Changes update the renderer immediately. Preview will look 1:1 in your stream. (unless you change the aspect ratio in obs)";
    sidebar.appendChild(hint);

    const controls = document.createElement("main");
    controls.className = "mc-controls";

    const controlsHead = document.createElement("div");
    controlsHead.className = "mc-controls-head";

    const controlTitle = document.createElement("h1");
    controlTitle.className = "mc-control-title";
    controlTitle.textContent = "Overlay setup";

    const controlSubtitle = document.createElement("p");
    controlSubtitle.className = "mc-control-subtitle";
    controlSubtitle.textContent = "Tune the renderer without leaving the preview.";

    controlsHead.appendChild(controlTitle);
    controlsHead.appendChild(controlSubtitle);

    const panelStack = document.createElement("div");
    panelStack.className = "mc-panel-stack";

    controls.appendChild(controlsHead);
    controls.appendChild(panelStack);

    const stage = document.createElement("section");
    stage.className = "mc-stage";

    const stageHead = document.createElement("div");
    stageHead.className = "mc-stage-head";

    const stageTitle = document.createElement("div");
    stageTitle.className = "mc-stage-title";
    stageTitle.textContent = "Renderer preview";

    const stageMeta = document.createElement("div");
    stageMeta.className = "mc-stage-meta";

    stageHead.appendChild(stageTitle);
    stageHead.appendChild(stageMeta);

    const stageCanvas = document.createElement("div");
    stageCanvas.className = "mc-stage-canvas";

    const previewFrame = document.createElement("div");
    previewFrame.className = "mc-preview-frame";

    let previewChat = document.getElementById("chat");

    if (!previewChat) {
        previewChat = document.createElement("div");
        previewChat.id = "chat";
    }

    const originalKeys = [
        "position", "inset", "top", "left", "right", "bottom",
        "width", "height", "zIndex", "flex", "minHeight",
        "overflowY", "display", "flexDirection", "justifyContent",
        "padding"
    ];

    for (const key of originalKeys) {
        previewChat.dataset[`original${key.charAt(0).toUpperCase()}${key.slice(1)}`] = previewChat.style[key] || "";
    }

    previewChat.classList.add("mc-preview-chat");
    previewChat.style.position = "relative";
    previewChat.style.inset = "auto";
    previewChat.style.top = "auto";
    previewChat.style.left = "auto";
    previewChat.style.right = "auto";
    previewChat.style.bottom = "auto";
    previewChat.style.width = "100%";
    previewChat.style.height = "100%";
    previewChat.style.zIndex = "auto";
    previewChat.style.flex = "1";
    previewChat.style.minHeight = "0";
    previewChat.style.overflowY = "auto";
    previewChat.style.display = "flex";
    previewChat.style.flexDirection = "column";
    previewChat.style.justifyContent = "flex-end";
    previewChat.style.padding = "22px";
    previewChat.innerHTML = "";

    previewFrame.appendChild(previewChat);
    stageCanvas.appendChild(previewFrame);

    stage.appendChild(stageHead);
    stage.appendChild(stageCanvas);

    screen.appendChild(topbar);
    screen.appendChild(sidebar);
    screen.appendChild(controls);
    screen.appendChild(stage);
    document.body.appendChild(screen);

    function createPanel(id, navTitle, navDesc, icon) {
        const panel = document.createElement("section");
        panel.className = "mc-panel";
        panel.dataset.panel = id;

        const navButton = document.createElement("button");
        navButton.type = "button";
        navButton.className = "mc-nav-button";
        navButton.dataset.panel = id;

        const navIcon = document.createElement("span");
        navIcon.className = "mc-nav-icon";
        navIcon.textContent = icon;

        const navCopy = document.createElement("span");
        navCopy.className = "mc-nav-copy";

        const title = document.createElement("span");
        title.className = "mc-nav-title";
        title.textContent = navTitle;

        navCopy.appendChild(title);
        navButton.appendChild(navIcon);
        navButton.appendChild(navCopy);
        nav.appendChild(navButton);
        panelStack.appendChild(panel);

        navButton.addEventListener("click", () => {
            for (const button of nav.querySelectorAll(".mc-nav-button")) {
                button.classList.toggle("is-active", button === navButton);
            }

            for (const otherPanel of panelStack.querySelectorAll(".mc-panel")) {
                otherPanel.classList.toggle("is-active", otherPanel === panel);
            }

            controlTitle.textContent = navTitle;
            controlSubtitle.textContent = navDesc;
        });

        return panel;
    }

    function addField(parent, labelText, control) {
        const field = document.createElement("div");
        field.className = "mc-field";

        const label = document.createElement("label");
        label.className = "mc-label";
        label.textContent = labelText;

        field.appendChild(label);
        field.appendChild(control);
        parent.appendChild(field);

        return field;
    }

    function addToggle(parent, labelText, noteText, key, checked) {
        const wrapper = document.createElement("label");
        wrapper.className = `mc-toggle-row${checked ? " is-on" : ""}`;

        const copy = document.createElement("div");
        copy.className = "mc-toggle-copy";

        const title = document.createElement("div");
        title.className = "mc-toggle-title";
        title.textContent = labelText;

        const note = document.createElement("div");
        note.className = "mc-toggle-note";
        note.textContent = noteText;

        copy.appendChild(title);
        copy.appendChild(note);

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = checked;
        checkbox.dataset.setting = key;
        checkbox.className = "mc-check";

        const sw = document.createElement("span");
        sw.className = "mc-switch";

        wrapper.appendChild(copy);
        wrapper.appendChild(checkbox);
        wrapper.appendChild(sw);
        parent.appendChild(wrapper);

        checkbox.addEventListener("change", () => {
            wrapper.classList.toggle("is-on", checkbox.checked);
        });

        return checkbox;
    }

    const connectionPanel = createPanel("connection", "Connection", "Choose the channel this overlay should read from and authorize Twitch when needed.", "01");

    const channelInput = document.createElement("input");
    channelInput.type = "text";
    channelInput.className = "mc-input";
    channelInput.placeholder = "channelname";
    channelInput.value = selectedChannel || "";
    channelInput.autocomplete = "off";
    channelInput.spellcheck = false;

    const channelInline = document.createElement("div");
    channelInline.className = "mc-inline";
    channelInline.appendChild(channelInput);

    addField(connectionPanel, "Twitch channel", channelInline);

    const connectionDivider = document.createElement("div");
    connectionDivider.className = "mc-divider";
    connectionPanel.appendChild(connectionDivider);

    const connectionSub = document.createElement("h2");
    connectionSub.className = "mc-subhead";
    connectionSub.textContent = "Browser source";
    connectionPanel.appendChild(connectionSub);

    const connectionText = document.createElement("div");
    connectionText.className = "mc-muted";
    connectionText.textContent = "Generate one URL with the current overlay settings. Paste it into an OBS Browser Source.";
    connectionText.style.lineHeight = "1.55";
    connectionPanel.appendChild(connectionText);

    const appearancePanel = createPanel("appearance", "Appearance", "Control the visual density of messages, the backdrop, badges and 7TV visibility.", "02");

    const backgroundCheckbox = addToggle(appearancePanel, "Background", "Use the configured overlay backdrop.", "background", backgroundEnabled);

    const backgroundColorRow = document.createElement("div");
    backgroundColorRow.className = "mc-color-row";

    const backgroundColorText = document.createElement("span");
    backgroundColorText.className = "mc-muted";
    backgroundColorText.textContent = backgroundColor;

    const backgroundColorInput = document.createElement("input");
    backgroundColorInput.type = "color";
    backgroundColorInput.className = "mc-color";
    backgroundColorInput.value = backgroundColor;
    backgroundColorInput.setAttribute("aria-label", "Background color");

    backgroundColorRow.appendChild(backgroundColorText);
    backgroundColorRow.appendChild(backgroundColorInput);
    appearancePanel.appendChild(backgroundColorRow);

    const wrapCheckbox = addToggle(appearancePanel, "Wrap messages", "Allow long chat messages to continue on another line.", "wrap", wrapEnabled);
    const badgesCheckbox = addToggle(appearancePanel, "Badges", "Show Twitch, 7TV, FFZ and other supported badges.", "badges", badgesEnabled);
    const unlistedCheckbox = addToggle(appearancePanel, "Unlisted 7TV emotes", "Render unlisted 7TV emotes when they are available.", "unlisted", showUnlisted7TV);

    const typographyPanel = createPanel("typography", "Typography", "Choose the font used by the renderer. Changes are applied to the live preview immediately.", "03");

    const fontSelect = document.createElement("select");
    fontSelect.className = "mc-select";

    for (const font of CHAT_FONTS) {
        const option = document.createElement("option");
        option.value = font.value;
        option.textContent = font.label;
        if (font.value === chatFont) {
            option.selected = true;
        }
        fontSelect.appendChild(option);
    }

    addField(typographyPanel, "Chat font", fontSelect);

    const typographyNote = document.createElement("div");
    typographyNote.className = "mc-muted";
    typographyNote.textContent = "The same font setting is serialized into the generated overlay URL.";
    typographyPanel.appendChild(typographyNote);

    const textScaleInput = document.createElement("input");
    textScaleInput.type = "number";
    textScaleInput.className = "mc-input";
    textScaleInput.min = "0.25";
    textScaleInput.max = "3";
    textScaleInput.step = "0.05";
    textScaleInput.value = String(scale);

    addField(typographyPanel, "Text scale", textScaleInput);

    const timingPanel = createPanel("timing", "Timing", "Tune message lifetime and fading behavior.", "04");

    const timingTwoCol = document.createElement("div");
    timingTwoCol.className = "mc-two-col";

    const fadeField = document.createElement("div");
    fadeField.className = "mc-field";

    const fadeLabel = document.createElement("label");
    fadeLabel.className = "mc-label";
    fadeLabel.textContent = "Fade time";

    const fadeLine = document.createElement("div");
    fadeLine.className = "mc-range-line";

    const fadeInput = document.createElement("input");
    fadeInput.type = "number";
    fadeInput.className = "mc-input";
    fadeInput.min = "1";
    fadeInput.max = "300";
    fadeInput.step = "1";
    fadeInput.value = fade === false ? "" : String(fade);
    fadeInput.placeholder = "15";

    const fadeUnit = document.createElement("span");
    fadeUnit.className = "mc-unit";
    fadeUnit.textContent = "sec";

    fadeLine.appendChild(fadeInput);
    fadeLine.appendChild(fadeUnit);
    fadeField.appendChild(fadeLabel);
    fadeField.appendChild(fadeLine);

    timingTwoCol.appendChild(fadeField);
    timingPanel.appendChild(timingTwoCol);

    const noFade = addToggle(timingPanel, "Disable fading", "Keep messages visible until the renderer removes them.", "disable-fading", fade === false);

    const actions = document.createElement("div");
    actions.className = "mc-actions";

    const authorizeButton = document.createElement("button");
    authorizeButton.type = "button";
    authorizeButton.className = "mc-button mc-button-primary";
    authorizeButton.textContent = accessToken ? "Twitch authorized" : "Authorize Twitch";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "mc-button";
    copyButton.textContent = "Copy overlay link";

    actions.appendChild(authorizeButton);
    actions.appendChild(copyButton);

    const error = document.createElement("div");
    error.className = "mc-error";

    connectionPanel.appendChild(actions);
    connectionPanel.appendChild(error);

    function activatePanel(id) {
        const button = nav.querySelector(`.mc-nav-button[data-panel="${id}"]`);
        if (button) {
            button.click();
        }
    }

    activatePanel("connection");

    function syncFadeState() {
        fadeInput.disabled = noFade.checked;
        fadeInput.style.opacity = noFade.checked ? ".45" : "1";
        fadeInput.title = noFade.checked ? "Disable fading is enabled" : "Fade time in seconds";
    }

    function applyBackgroundPreview() {
        backgroundColor = backgroundColorInput.value;
        backgroundColorText.textContent = backgroundColor;
        applyBackgroundColor(backgroundColor);
        backgroundEnabled = backgroundCheckbox.checked;
        document.body.classList.toggle("has-background", backgroundEnabled);
        previewChat.classList.toggle("has-background", backgroundEnabled);
    }

    backgroundCheckbox.addEventListener("change", applyBackgroundPreview);
    backgroundColorInput.addEventListener("input", applyBackgroundPreview);
    backgroundColorInput.addEventListener("change", applyBackgroundPreview);

    wrapCheckbox.addEventListener("change", () => {
        wrapEnabled = wrapCheckbox.checked;
    });

    badgesCheckbox.addEventListener("change", () => {
        badgesEnabled = badgesCheckbox.checked;
    });

    unlistedCheckbox.addEventListener("change", () => {
        showUnlisted7TV = unlistedCheckbox.checked;
    });

    fontSelect.addEventListener("change", () => {
        chatFont = fontSelect.value;
        document.documentElement.style.setProperty("--chat-font", chatFont);
        loadGoogleFontIfNeeded(chatFont);
        loadCustomFontIfNeeded(chatFont);
        document.body.classList.toggle("pixel-font", chatFont === "'Minecraft', sans-serif");
    });

    fadeInput.addEventListener("input", () => {
        if (!noFade.checked) {
            fade = Math.max(1, Number(fadeInput.value) || 15);
        }
    });

    noFade.addEventListener("change", () => {
        fade = noFade.checked ? false : Math.max(1, Number(fadeInput.value) || 15);
        syncFadeState();
    });

    textScaleInput.addEventListener("input", () => {
        const newScale = Number(textScaleInput.value);
        if (!Number.isFinite(newScale)) {
            return;
        }
        scale = Math.max(0.25, Math.min(newScale, 3));
        document.documentElement.style.setProperty("--chat-scale", scale);
    });

    channelInput.addEventListener("input", () => {
        error.style.display = "none";
    });

    channelInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            copyButton.click();
        }
    });

    function getOverlayUrl() {
        const channel = channelInput.value.trim().toLowerCase().replace(/^#/, "");

        if (!channel) {
            error.textContent = "Enter a Twitch channel before generating the overlay link.";
            error.style.display = "block";
            activatePanel("connection");
            channelInput.focus();
            return null;
        }

        error.style.display = "none";

        const overlaySettings = {
            background: backgroundCheckbox.checked,
            backgroundColor: backgroundColorInput.value,
            fade: noFade.checked ? false : Math.max(1, Number(fadeInput.value) || 15),
            badges: badgesCheckbox.checked,
            scale: Math.max(0.25, Math.min(Number(textScaleInput.value) || 1, 3)),
            wrap: wrapCheckbox.checked,
            unlisted: unlistedCheckbox.checked,
            font: fontSelect.value
        };

        const encodedSettings = btoa(
            encodeURIComponent(JSON.stringify(overlaySettings))
        )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        const url = new URL(window.location.href);
        url.search = "";
        url.searchParams.set("channel", channel);
        url.searchParams.set("settings", encodedSettings);

        return url.toString();
    }

    authorizeButton.addEventListener("click", () => {
        const url = getOverlayUrl();
        if (!url) {
            return;
        }

        if (accessToken) {
            authorizeButton.textContent = "Twitch authorized";
            return;
        }

        localStorage.setItem("twitch_overlay_pending_url", url);
        startTwitchLogin();
    });

    copyButton.addEventListener("click", async () => {
        const url = getOverlayUrl();
        if (!url) {
            return;
        }

        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = url;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
        }

        copyButton.textContent = "Link copied";
        window.setTimeout(() => {
            copyButton.textContent = "Copy overlay link";
        }, 1500);
    });

    syncFadeState();
    loadPreviewEmotes();

    window.setTimeout(() => {
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

function findThirdPartyEmote(
    word,
    username = null
) {
    const personalEmotes =
        get7TVPersonalEmotesForUser(
            username
        );

    if (
        personalEmotes.has(
            word
        )
    ) {
        const personal =
            personalEmotes.get(
                word
            );

        if (
            !showUnlisted7TV &&
            personal.listed === false
        ) {
            return null;
        }

        return {
            id:
                personal.id,

            name:
                personal.name,

            url:
                personal.image,

            provider:
                "7TV",

            personal:
                true,

            listed:
                personal.listed,

            zeroWidth:
                personal.zeroWidth
        };
    }

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
    value,
    username = null
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
                part,
                username
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
    tags,
    username = null
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
            text,
            username
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
                ),
                username
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
            ),
            username
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
            tags,
            user
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

    const authenticated = await ensureTwitchAuth();

    if (!authenticated) {
        console.log("Twitch authentication required.");
        return;
    }

    const channelResolved = await resolveOverlayChannel();

    if (!channelResolved) {
        return;
    }

    hideTwitchLoginScreen();

    await runLoadingTasks(LOADING_TASKS);

    console.log("Chat emotes and badge data loaded.");
    console.log("Overlay channel:", CHANNEL);
    console.log("Overlay channel ID:", TWITCH_USER_ID);
    console.log("Authenticated reader:", authenticatedUsername);

    createEventSubSocket();

    setInterval(
        async () => {
            if (!accessToken) {
                return;
            }

            const valid = await validateTwitchToken();

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