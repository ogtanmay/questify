/**
 * Discord User Custom Rich Presence Manager
 * Allows linked users to spoof rich presence activities on their Discord account:
 * Dedicated Presence Games List (independent of badge spoofer)
 */

const GATEWAY_URL = "wss://gateway.discord.gg/?v=9&encoding=json";

// ── Dedicated Presence-Only Games Catalog ────────────────────────────────────
const PRESENCE_GAMES = [
    {
        key: "valorant",
        label: "VALORANT",
        applicationId: "700136079562375258",
        name: "VALORANT",
        type: 0,
        details: "Competitive",
        state: "In Game (11 - 9)",
        assets: {
            large_image: "valorant_icon",
            large_text: "VALORANT",
        },
    },
    {
        key: "vscode",
        label: "Visual Studio Code",
        applicationId: "383226320970055681",
        name: "Visual Studio Code",
        type: 0,
        details: "Workspace: discord-quest-bot",
        state: "Editing bot.js",
        assets: {
            large_image: "vscode",
            large_text: "Visual Studio Code",
        },
    },
    {
        key: "minecraft",
        label: "Minecraft",
        applicationId: "432980957394370572",
        name: "Minecraft",
        type: 0,
        details: "Multiplayer Survival",
        state: "Exploring Overworld",
        assets: {
            large_image: "minecraft",
            large_text: "Minecraft",
        },
    },
    {
        key: "league",
        label: "League of Legends",
        applicationId: "356869127241072640",
        name: "League of Legends",
        type: 0,
        details: "Summoner's Rift (Ranked)",
        state: "In Match",
        assets: {
            large_image: "lol_icon",
            large_text: "League of Legends",
        },
    },
    {
        key: "cs2",
        label: "Counter-Strike 2",
        applicationId: "733852150177726474",
        name: "Counter-Strike 2",
        type: 0,
        details: "Premier Matchmaking",
        state: "Dust II (12 - 10)",
        assets: {
            large_image: "cs2_logo",
            large_text: "Counter-Strike 2",
        },
    },
    {
        key: "fortnite",
        label: "Fortnite",
        applicationId: "432980957394370560",
        name: "Fortnite",
        type: 0,
        details: "Battle Royale (Duo)",
        state: "In Match (Top 10)",
        assets: {
            large_image: "fortnite",
            large_text: "Fortnite",
        },
    },
    {
        key: "gta5",
        label: "Grand Theft Auto V",
        applicationId: "367827983903424512",
        name: "Grand Theft Auto V",
        type: 0,
        details: "GTA Online",
        state: "Freemode Session",
        assets: {
            large_image: "gtav",
            large_text: "Grand Theft Auto V",
        },
    },
    {
        key: "roblox",
        label: "Roblox",
        applicationId: "433010738367922186",
        name: "Roblox",
        type: 0,
        details: "Playing Experience",
        state: "Blox Fruits",
        assets: {
            large_image: "roblox",
            large_text: "Roblox",
        },
    },
    {
        key: "apex",
        label: "Apex Legends",
        applicationId: "532296478954717194",
        name: "Apex Legends",
        type: 0,
        details: "Ranked Leagues",
        state: "In Drop Ship",
        assets: {
            large_image: "apex",
            large_text: "Apex Legends",
        },
    },
    {
        key: "overwatch2",
        label: "Overwatch 2",
        applicationId: "356875221078245376",
        name: "Overwatch 2",
        type: 0,
        details: "Competitive Role Queue",
        state: "King's Row (Payload)",
        assets: {
            large_image: "overwatch",
            large_text: "Overwatch 2",
        },
    },
    {
        key: "genshin",
        label: "Genshin Impact",
        applicationId: "769665713149935636",
        name: "Genshin Impact",
        type: 0,
        details: "Exploring Teyvat",
        state: "Domain Challenge",
        assets: {
            large_image: "genshin",
            large_text: "Genshin Impact",
        },
    },
    {
        key: "warzone",
        label: "Call of Duty: Warzone",
        applicationId: "626198755670589440",
        name: "Call of Duty: Warzone",
        type: 0,
        details: "Battle Royale Quads",
        state: "Urzykstan In Match",
        assets: {
            large_image: "warzone",
            large_text: "Call of Duty: Warzone",
        },
    },
    {
        key: "cyberpunk",
        label: "Cyberpunk 2077",
        applicationId: "752943263442141235",
        name: "Cyberpunk 2077",
        type: 0,
        details: "Exploring Night City",
        state: "Story Mission",
        assets: {
            large_image: "cyberpunk",
            large_text: "Cyberpunk 2077",
        },
    },
    {
        key: "rust",
        label: "Rust",
        applicationId: "432980957394370561",
        name: "Rust",
        type: 0,
        details: "Official Server",
        state: "Roaming with Clan",
        assets: {
            large_image: "rust",
            large_text: "Rust",
        },
    },
    {
        key: "rocketleague",
        label: "Rocket League",
        applicationId: "379286095596486656",
        name: "Rocket League",
        type: 0,
        details: "Competitive 2v2",
        state: "Overtime (2 - 2)",
        assets: {
            large_image: "rocketleague",
            large_text: "Rocket League",
        },
    },
    {
        key: "r6s",
        label: "Rainbow Six Siege",
        applicationId: "356875544496832513",
        name: "Tom Clancy's Rainbow Six Siege",
        type: 0,
        details: "Ranked Match",
        state: "Defending (Round 5)",
        assets: {
            large_image: "r6s",
            large_text: "Tom Clancy's Rainbow Six Siege",
        },
    },
    {
        key: "stream",
        label: "Streaming (Twitch)",
        applicationId: null,
        name: "Twitch",
        type: 1,
        url: "https://twitch.tv/discord",
        details: "Live Stream",
        state: "Streaming with Quest Bot",
    },
    {
        key: "custom",
        label: "Custom Status",
        applicationId: null,
        name: "Custom Status",
        type: 4,
        state: "Active on Discord",
    },
];

// Build index lookup table by key, lowercase name, and applicationId
const GAME_PRESETS = {};
for (const game of PRESENCE_GAMES) {
    GAME_PRESETS[game.key] = game;
    if (game.applicationId) {
        GAME_PRESETS[game.applicationId] = game;
    }
    GAME_PRESETS[game.name.toLowerCase()] = game;
}

// Map of active presence sessions by userId: { ws, intervalId, presetKey, activity, startedAt, token }
const activePresences = new Map();

/**
 * Finds a presence game preset by key, name, or application ID
 */
function findPresenceGame(query) {
    if (!query) return GAME_PRESETS.valorant;
    const clean = String(query).trim().toLowerCase();
    if (GAME_PRESETS[clean]) return GAME_PRESETS[clean];

    // Substring search on name or key
    const matched = PRESENCE_GAMES.find(
        (g) =>
            g.key.toLowerCase().includes(clean) ||
            g.name.toLowerCase().includes(clean) ||
            (g.applicationId && g.applicationId === clean)
    );
    return matched || GAME_PRESETS.valorant;
}

/**
 * Builds activity object for Discord gateway
 */
function buildActivity(presetKey, customOptions = {}) {
    const preset = findPresenceGame(presetKey);
    const now = Date.now();

    const activity = {
        name: customOptions.name || preset.name,
        type: customOptions.type !== undefined ? customOptions.type : preset.type,
    };

    if (preset.applicationId || customOptions.applicationId) {
        activity.application_id = customOptions.applicationId || preset.applicationId;
    }

    if (preset.type === 1 || customOptions.type === 1) {
        activity.url = customOptions.url || preset.url || "https://twitch.tv/discord";
    }

    if (preset.details || customOptions.details) {
        activity.details = customOptions.details || preset.details;
    }

    if (preset.state || customOptions.state) {
        activity.state = customOptions.state || preset.state;
    }

    if (preset.assets || customOptions.assets) {
        activity.assets = {
            ...(preset.assets || {}),
            ...(customOptions.assets || {}),
        };
    }

    activity.timestamps = {
        start: customOptions.startTime || now,
    };

    return activity;
}

/**
 * Creates and maintains a Gateway connection for user rich presence
 */
function setUserPresence(userId, token, presetKey = "valorant", customOptions = {}) {
    if (!token || typeof token !== "string") {
        throw new Error("A valid Discord user token is required to set presence");
    }

    // Stop existing presence session if already active
    clearUserPresence(userId);

    const preset = findPresenceGame(presetKey);
    const activity = buildActivity(presetKey, customOptions);

    return new Promise((resolve, reject) => {
        let ws;
        try {
            ws = new WebSocket(GATEWAY_URL);
        } catch (err) {
            return reject(new Error(`Failed to create WebSocket: ${err.message}`));
        }

        let heartbeatInterval = null;
        let lastSequence = null;
        let identified = false;

        const session = {
            userId,
            token,
            ws,
            presetKey: preset.key,
            presetName: preset.label || preset.name,
            activity,
            startedAt: Date.now(),
            status: "connecting",
        };

        activePresences.set(userId, session);

        const cleanup = () => {
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            if (activePresences.get(userId)?.ws === ws) {
                activePresences.delete(userId);
            }
        };

        ws.onopen = () => {
            session.status = "connected";
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                const { op, d, s } = message;

                if (s !== null && s !== undefined) {
                    lastSequence = s;
                }

                // Opcode 10: Hello -> Start heartbeats and send Identify (Opcode 2)
                if (op === 10) {
                    const interval = d.heartbeat_interval || 41250;
                    heartbeatInterval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ op: 1, d: lastSequence }));
                        }
                    }, interval);

                    // Send initial heartbeat
                    ws.send(JSON.stringify({ op: 1, d: lastSequence }));

                    // Identify with user token and activity
                    const identifyPayload = {
                        op: 2,
                        d: {
                            token: token.trim(),
                            capabilities: 16381,
                            properties: {
                                os: "Windows",
                                browser: "Discord Client",
                                release_channel: "stable",
                                client_version: "1.0.9236",
                                os_version: "10.0.19045",
                                os_arch: "x64",
                                system_locale: "en-US",
                            },
                            presence: {
                                status: "online",
                                since: 0,
                                activities: [activity],
                                afk: false,
                            },
                        },
                    };
                    ws.send(JSON.stringify(identifyPayload));
                    identified = true;
                    session.status = "active";
                    resolve({
                        success: true,
                        preset: preset.key,
                        presetName: preset.label || preset.name,
                        activity,
                    });
                }

                // Opcode 1: Heartbeat requested by Discord
                if (op === 1) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ op: 1, d: lastSequence }));
                    }
                }

                // Opcode 9: Invalid Session -> Reconnect or abort
                if (op === 9) {
                    cleanup();
                }
            } catch (err) {
                console.error(`[PresenceManager] Error processing gateway message:`, err.message);
            }
        };

        ws.onerror = (err) => {
            cleanup();
            if (!identified) {
                reject(new Error(`WebSocket error connecting to Discord Gateway: ${err.message || "Failed"}`));
            }
        };

        ws.onclose = () => {
            cleanup();
        };

        // Timeout fallback if gateway does not respond within 12 seconds
        setTimeout(() => {
            if (!identified) {
                cleanup();
                try {
                    ws.close();
                } catch {
                    // Ignore close error on timeout
                }
                reject(new Error("Timeout connecting to Discord Gateway"));
            }
        }, 12000);
    });
}

/**
 * Clears active rich presence session for a user
 */
function clearUserPresence(userId) {
    const session = activePresences.get(userId);
    if (!session) return false;

    try {
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(
                JSON.stringify({
                    op: 3,
                    d: {
                        since: null,
                        activities: [],
                        status: "online",
                        afk: false,
                    },
                })
            );
            session.ws.close(1000, "Presence cleared by user");
        }
    } catch {
        // Ignore socket close errors
    }

    activePresences.delete(userId);
    return true;
}

/**
 * Returns current presence status for user
 */
function getUserPresence(userId) {
    const session = activePresences.get(userId);
    if (!session) return null;
    return {
        userId: session.userId,
        presetKey: session.presetKey,
        presetName: session.presetName,
        activity: session.activity,
        startedAt: session.startedAt,
        status: session.status,
    };
}

/**
 * Returns all active presences
 */
function listActivePresences() {
    const list = [];
    for (const [userId, session] of activePresences.entries()) {
        list.push({
            userId,
            presetKey: session.presetKey,
            presetName: session.presetName,
            activity: session.activity,
            startedAt: session.startedAt,
            status: session.status,
        });
    }
    return list;
}

/**
 * Returns the curated presence-only games list
 */
function getPresenceGamesList() {
    return PRESENCE_GAMES;
}

module.exports = {
    PRESENCE_GAMES,
    GAME_PRESETS,
    findPresenceGame,
    buildActivity,
    setUserPresence,
    clearUserPresence,
    getUserPresence,
    listActivePresences,
    getPresenceGamesList,
};
