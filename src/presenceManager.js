/**
 * Discord User Custom Rich Presence Manager
 * Allows linked users to spoof rich presence activities on their Discord account:
 * - VALORANT (700136079562375258)
 * - Visual Studio Code (383226320970055681)
 * - Minecraft (432980957394370572)
 * - League of Legends (356869127241072640)
 * - Streaming Status (Type 1 Twitch/YouTube)
 * - Custom Status (Type 4)
 */

const GATEWAY_URL = "wss://gateway.discord.gg/?v=9&encoding=json";

const GAME_PRESETS = {
    valorant: {
        key: "valorant",
        label: "VALORANT",
        applicationId: "700136079562375258",
        name: "VALORANT",
        type: 0, // Playing
        details: "Competitive",
        state: "In Game (11 - 9)",
        assets: {
            large_image: "valorant_icon",
            large_text: "VALORANT",
        },
    },
    vscode: {
        key: "vscode",
        label: "Visual Studio Code",
        applicationId: "383226320970055681",
        name: "Visual Studio Code",
        type: 0, // Playing
        details: "Workspace: discord-quest-bot",
        state: "Editing bot.js",
        assets: {
            large_image: "vscode",
            large_text: "Visual Studio Code",
        },
    },
    minecraft: {
        key: "minecraft",
        label: "Minecraft",
        applicationId: "432980957394370572",
        name: "Minecraft",
        type: 0, // Playing
        details: "Multiplayer Survival",
        state: "Exploring Overworld",
        assets: {
            large_image: "minecraft",
            large_text: "Minecraft",
        },
    },
    league: {
        key: "league",
        label: "League of Legends",
        applicationId: "356869127241072640",
        name: "League of Legends",
        type: 0, // Playing
        details: "Summoner's Rift (Ranked)",
        state: "In Match",
        assets: {
            large_image: "lol_icon",
            large_text: "League of Legends",
        },
    },
    stream: {
        key: "stream",
        label: "Streaming (Twitch)",
        applicationId: null,
        name: "Twitch",
        type: 1, // Streaming
        url: "https://twitch.tv/discord",
        details: "Live Stream",
        state: "Streaming with Quest Bot",
    },
    custom: {
        key: "custom",
        label: "Custom Status",
        applicationId: null,
        name: "Custom Status",
        type: 4, // Custom Status
        state: "Active on Discord",
    },
};

// Map of active presence sessions by userId: { ws, intervalId, presetKey, activity, startedAt, token }
const activePresences = new Map();

/**
 * Builds activity object for Discord gateway
 */
function buildActivity(presetKey, customOptions = {}) {
    const preset = GAME_PRESETS[presetKey] || GAME_PRESETS.valorant;
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

    const preset = GAME_PRESETS[presetKey] || GAME_PRESETS.valorant;
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
            presetName: preset.label,
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
                        presetName: preset.label,
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
            // Send empty presence before disconnecting
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
    } catch (e) {
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

module.exports = {
    GAME_PRESETS,
    buildActivity,
    setUserPresence,
    clearUserPresence,
    getUserPresence,
    listActivePresences,
};
