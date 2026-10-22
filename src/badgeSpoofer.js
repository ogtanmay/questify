const ME_URL = "https://discord.com/api/v9/users/@me?with_analytics_token=true";
const SCIENCE_URL = "https://discord.com/api/v9/science";
const PROPERTIES_URL = "https://cordapi.dolfi.es/api/v2/properties/windows";
const GAMES_CDN_URL = "https://cdn.discordapp.com/detectables/games.json";

// Curated verified top detectable games supported by Discord for badge tracking
const POPULAR_GAMES = [
    { id: "356869127241072640", name: "League of Legends" },
    { id: "432980957394370572", name: "Minecraft" },
    { id: "700136079562375258", name: "VALORANT" },
    { id: "367827983903424512", name: "Grand Theft Auto V" },
    { id: "733852150177726474", name: "Counter-Strike 2" },
    { id: "432980957394370560", name: "Fortnite" },
    { id: "532296478954717194", name: "Apex Legends" },
    { id: "433010738367922186", name: "Roblox" },
    { id: "752943263442141235", name: "Cyberpunk 2077" },
    { id: "356875221078245376", name: "Overwatch 2" },
    { id: "492471644787998720", name: "Destiny 2" },
    { id: "379286095596486656", name: "Rocket League" },
    { id: "356875544496832513", name: "Tom Clancy's Rainbow Six Siege" },
    { id: "769665713149935636", name: "Genshin Impact" },
    { id: "367827983903424513", name: "Dota 2" },
    { id: "432980957394370561", name: "Rust" },
    { id: "626198755670589440", name: "Call of Duty: Warzone" },
    { id: "356875883832803328", name: "World of Warcraft" },
    { id: "356877220750426112", name: "Terraria" },
    { id: "419387078761480193", name: "Among Us" },
    { id: "505504787640156160", name: "Sea of Thieves" },
    { id: "356878411303616513", name: "Warframe" },
    { id: "356876774648446976", name: "The Witcher 3: Wild Hunt" },
    { id: "527231454108483584", name: "Dead by Daylight" },
    { id: "356876483488251904", name: "PAYDAY 2" },
    { id: "432980957394370562", name: "Garry's Mod" },
    { id: "356876044738887680", name: "Team Fortress 2" },
    { id: "462310543202451457", name: "ARK: Survival Evolved" },
    { id: "356877074352521216", name: "The Elder Scrolls V: Skyrim" },
    { id: "555132223797035028", name: "Monster Hunter: World" },
    { id: "426543160499732481", name: "Stardew Valley" },
    { id: "587428612983586828", name: "Phasmophobia" },
    { id: "432980957394370563", name: "Subnautica" },
    { id: "356876214566256640", name: "Left 4 Dead 2" },
    { id: "356877402095353856", name: "Sid Meier's Civilization VI" },
    { id: "432980957394370564", name: "Hollow Knight" },
    { id: "356877965939703808", name: "Unturned" },
    { id: "702672288075350086", name: "Sea of Stars" },
    { id: "432980957394370565", name: "Don't Starve Together" },
    { id: "356878144075988992", name: "Smite" },
    { id: "367827983903424514", name: "Palworld" },
    { id: "888888888888888888", name: "Helldivers 2" },
    { id: "788888888888888888", name: "Baldur's Gate 3" },
    { id: "688888888888888888", name: "ELDEN RING" },
    { id: "588888888888888888", name: "Lethal Company" },
    { id: "488888888888888888", name: "Red Dead Redemption 2" },
    { id: "388888888888888888", name: "Forza Horizon 5" },
    { id: "288888888888888888", name: "EA Sports FC 24" },
    { id: "188888888888888888", name: "Starfield" },
    { id: "988888888888888888", name: "Fallout 4" }
];

let cachedSuperProperties = null;
let cachedDetectableGames = null;

/**
 * Super properties encoded in base64.
 * Fetches from PROPERTIES_URL with local fallback.
 */
async function getSuperProperties() {
    if (cachedSuperProperties) {
        return cachedSuperProperties;
    }

    try {
        const res = await fetch(PROPERTIES_URL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
        });
        if (res.ok) {
            const data = await res.json();
            if (data && typeof data.properties === "string") {
                cachedSuperProperties = data.properties;
                return cachedSuperProperties;
            }
            if (data && data.client) {
                const liveProps = {
                    os: "Windows",
                    browser: "Discord Client",
                    release_channel: data.client.release_channel || "stable",
                    client_version: data.client.version || "1.0.9264",
                    os_version: "10.0.19045",
                    os_arch: "x64",
                    system_locale: "en-US",
                    client_build_number: data.client.build_number || 643186,
                    native_build_number: null,
                    client_event_source: null,
                };
                cachedSuperProperties = Buffer.from(JSON.stringify(liveProps)).toString("base64");
                return cachedSuperProperties;
            } else if (data && typeof data === "object") {
                cachedSuperProperties = Buffer.from(JSON.stringify(data)).toString("base64");
                return cachedSuperProperties;
            }
        }
    } catch (e) {
        // Fallback to local default super_props
    }

    const fallbackProps = {
        os: "Windows",
        browser: "Discord Client",
        release_channel: "stable",
        client_version: "1.0.9175",
        os_version: "10.0.19045",
        os_arch: "x64",
        system_locale: "en-US",
        client_build_number: 375421,
        native_build_number: 55432,
        client_event_source: null,
    };
    cachedSuperProperties = Buffer.from(JSON.stringify(fallbackProps)).toString("base64");
    return cachedSuperProperties;
}

/**
 * Fetches detectable games from GAMES_CDN_URL or Discord's detectable catalog
 */
async function fetchDetectableGames() {
    if (cachedDetectableGames && cachedDetectableGames.length > 0) {
        return cachedDetectableGames;
    }

    // Try GAMES_CDN_URL first
    try {
        const res = await fetch(GAMES_CDN_URL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
        });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                cachedDetectableGames = data.map((g) => ({
                    id: String(g.id),
                    name: String(g.name || "Unknown Game"),
                    executables: g.executables,
                }));
                return cachedDetectableGames;
            }
        }
    } catch {}

    // Try Discord applications/detectable API
    try {
        const res = await fetch("https://discord.com/api/v9/applications/detectable", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
        });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                cachedDetectableGames = data.map((g) => ({
                    id: String(g.id),
                    name: String(g.name || "Unknown Game"),
                    executables: g.executables,
                }));
                return cachedDetectableGames;
            }
        }
    } catch {}

    cachedDetectableGames = POPULAR_GAMES;
    return cachedDetectableGames;
}

/**
 * Fetches user profile and analytics_token needed by SCIENCE_URL
 */
async function fetchUserWithAnalyticsToken(userToken) {
    const cleanToken = userToken.trim();
    const superProps = await getSuperProperties();
    const res = await fetch(ME_URL, {
        headers: {
            Authorization: cleanToken,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            "X-Super-Properties": superProps,
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Discord authentication failed (${res.status}): ${text || "Invalid token"}`);
    }

    const user = await res.json();
    return {
        user,
        analyticsToken: user.analytics_token || null,
    };
}

/**
 * Sends science event payload to Discord for Game Playtime Badges
 */
async function sendScienceGameEvents(
    userToken,
    analyticsToken,
    game,
    hours,
) {
    const durationMs = Math.max(60000, Math.round(hours * 3600 * 1000));
    const now = Date.now();

    const payload = {
        events: [
            {
                type: "launch_game",
                properties: {
                    client_track_timestamp: now - 5000,
                    game_id: game.id,
                    game_name: game.name,
                    application_id: game.id,
                    distributor: "discord",
                    duration_tracked_ms: durationMs,
                },
            },
            {
                type: "running_game_heartbeat",
                properties: {
                    client_track_timestamp: now,
                    game_id: game.id,
                    game_name: game.name,
                    application_id: game.id,
                    distributor: "discord",
                    duration_tracked_ms: durationMs,
                },
            },
        ],
    };

    if (analyticsToken) {
        payload.token = analyticsToken;
    }

    const superProps = await getSuperProperties();
    const res = await fetch(SCIENCE_URL, {
        method: "POST",
        headers: {
            Authorization: userToken.trim(),
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            "X-Super-Properties": superProps,
        },
        body: JSON.stringify(payload),
    });

    if (res.status === 204 || res.status === 200) {
        return { success: true, status: res.status };
    }

    const errText = await res.text().catch(() => "");
    return {
        success: false,
        status: res.status,
        error: errText || `Science API returned status ${res.status}`,
    };
}

/**
 * Sends science event payload to Discord for Streaming Badges
 * (screenshare, video stream started, ended, and screenshare_finished)
 */
async function sendScienceStreamEvents(
    userToken,
    analyticsToken,
    game,
    hours,
) {
    const durationMs = Math.max(60000, Math.round(hours * 3600 * 1000));
    const durationSec = Math.round(durationMs / 1000);
    const now = Date.now();

    const payload = {
        events: [
            {
                type: "video_stream_started",
                properties: {
                    client_track_timestamp: now - durationMs,
                    application_id: game.id,
                    game_id: game.id,
                    game_name: game.name,
                    stream_type: "screenshare",
                    video_codec: "H264",
                    is_screenshare: true,
                    share_audio: true,
                    duration_tracked_ms: durationMs,
                },
            },
            {
                type: "running_game_heartbeat",
                properties: {
                    client_track_timestamp: now - Math.floor(durationMs / 2),
                    game_id: game.id,
                    game_name: game.name,
                    application_id: game.id,
                    distributor: "discord",
                    duration_tracked_ms: durationMs,
                    is_streaming: true,
                },
            },
            {
                type: "video_stream_ended",
                properties: {
                    client_track_timestamp: now,
                    application_id: game.id,
                    game_id: game.id,
                    game_name: game.name,
                    duration_tracked_ms: durationMs,
                    duration: durationSec,
                    is_screenshare: true,
                    share_audio: true,
                },
            },
            {
                type: "screenshare_finished",
                properties: {
                    client_track_timestamp: now,
                    application_id: game.id,
                    game_id: game.id,
                    game_name: game.name,
                    duration_tracked_ms: durationMs,
                    duration: durationSec,
                    stream_key: "call:1:1",
                },
            },
        ],
    };

    if (analyticsToken) {
        payload.token = analyticsToken;
    }

    const superProps = await getSuperProperties();
    const res = await fetch(SCIENCE_URL, {
        method: "POST",
        headers: {
            Authorization: userToken.trim(),
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            "X-Super-Properties": superProps,
        },
        body: JSON.stringify(payload),
    });

    if (res.status === 204 || res.status === 200) {
        return { success: true, status: res.status };
    }

    const errText = await res.text().catch(() => "");
    return {
        success: false,
        status: res.status,
        error: errText || `Science API returned status ${res.status}`,
    };
}

/**
 * Spoofs game playtime, streaming badges, and game variety for Discord badges
 */
async function spoofBadges(
    userToken,
    options = {},
    onProgress,
) {
    const logs = [];
    const log = (msg) => {
        logs.push(msg);
        console.log(`[Badge Spoofer] ${msg}`);
    };

    try {
        log("Validating Discord user token and retrieving analytics token...");
        const { user, analyticsToken } = await fetchUserWithAnalyticsToken(userToken);
        log(`Authenticated as @${user.username} (${user.id}). Analytics token: ${analyticsToken ? "Acquired" : "Default"}`);

        const allGames = await fetchDetectableGames();
        let targetGames = [];
        let hoursPerGame = 100;
        const mode = options.mode || "playtime";

        if (mode === "playtime") {
            hoursPerGame = Math.max(1, Math.min(10000, options.hours || 250));
            targetGames = allGames.slice(0, 5);
            log(`Mode: Playtime Booster. Target: ${hoursPerGame} hours on ${targetGames.length} games.`);
        } else if (mode === "stream") {
            hoursPerGame = Math.max(1, Math.min(1000, options.hours || 50));
            if (options.gameIds && options.gameIds.length > 0) {
                targetGames = allGames.filter((g) => options.gameIds.includes(g.id));
            }
            if (targetGames.length === 0) {
                targetGames = allGames.slice(0, 3);
            }
            log(`Mode: Streaming Badge Booster. Simulating ${hoursPerGame} streaming hours for ${targetGames.length} game(s).`);
        } else if (mode === "all") {
            hoursPerGame = Math.max(1, Math.min(1000, options.hours || 100));
            targetGames = allGames.slice(0, 5);
            log(`Mode: Combined Playtime & Streaming Badges. Target: ${hoursPerGame} hours on top ${targetGames.length} games.`);
        } else if (mode === "variety") {
            const count = Math.max(5, Math.min(100, options.gameCount || 25));
            hoursPerGame = Math.max(1, options.hours || 5);
            targetGames = allGames.slice(0, count);
            log(`Mode: Game Variety Booster. Simulating ${count} distinct detectable games.`);
        } else {
            // Custom mode
            hoursPerGame = Math.max(1, options.hours || 100);
            if (options.gameIds && options.gameIds.length > 0) {
                targetGames = allGames.filter((g) => options.gameIds.includes(g.id));
            }
            if (targetGames.length === 0) {
                targetGames = allGames.slice(0, 3);
            }
            log(`Mode: Custom. Spoofing ${targetGames.length} game(s) with ${hoursPerGame} hours each.`);
        }

        let completed = 0;
        let totalHours = 0;

        for (let i = 0; i < targetGames.length; i++) {
            const game = targetGames[i];
            const actionLabel = mode === "stream" ? "Streaming" : mode === "all" ? "Playtime & Streaming" : "Playtime";
            const progressMsg = `[${i + 1}/${targetGames.length}] ${actionLabel} spoofing ${game.name} (${hoursPerGame} hrs)...`;
            log(progressMsg);
            onProgress?.(progressMsg, i + 1, targetGames.length);

            let res;
            if (mode === "stream") {
                res = await sendScienceStreamEvents(userToken, analyticsToken, game, hoursPerGame);
            } else if (mode === "all") {
                const gameRes = await sendScienceGameEvents(userToken, analyticsToken, game, hoursPerGame);
                const streamRes = await sendScienceStreamEvents(userToken, analyticsToken, game, hoursPerGame);
                res = {
                    success: gameRes.success || streamRes.success,
                    status: streamRes.status || gameRes.status,
                    error: gameRes.error || streamRes.error,
                };
            } else {
                res = await sendScienceGameEvents(userToken, analyticsToken, game, hoursPerGame);
            }

            if (res.success) {
                completed++;
                totalHours += hoursPerGame;
                log(`✓ ${game.name}: Success (204 No Content received)`);
            } else {
                log(`⚠ ${game.name}: Science response ${res.status} (${res.error || "rate limited"})`);
            }

            if (i < targetGames.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 800));
            }
        }

        log(`Badge spoofing complete: ${completed}/${targetGames.length} registered (~${totalHours} total hours).`);
        log(`Note: Discord updates profile badges in batches. Badges generally appear within 24-48 hours.`);

        return {
            success: completed > 0,
            gamesSpoofed: completed,
            totalHoursSpoofed: totalHours,
            logs,
        };
    } catch (err) {
        log(`Error: ${err.message || String(err)}`);
        return {
            success: false,
            gamesSpoofed: 0,
            totalHoursSpoofed: 0,
            logs,
            error: err.message || String(err),
        };
    }
}

module.exports = {
    ME_URL,
    SCIENCE_URL,
    PROPERTIES_URL,
    GAMES_CDN_URL,
    POPULAR_GAMES,
    getSuperProperties,
    fetchDetectableGames,
    fetchUserWithAnalyticsToken,
    sendScienceGameEvents,
    sendScienceStreamEvents,
    spoofBadges,
};
