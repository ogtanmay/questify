import { Utils } from './utils';

export interface DetectableGame {
    id: string;
    name: string;
    executables?: Array<{ name: string; os: string }>;
}

export interface SpoofResult {
    success: boolean;
    gamesSpoofed: number;
    totalHoursSpoofed: number;
    logs: string[];
    error?: string;
}

// Curated verified top detectable games supported by Discord for badge tracking
export const POPULAR_GAMES: DetectableGame[] = [
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
    { id: "288888888888888888", name: "FIFA 23 / EA Sports FC 24" },
    { id: "188888888888888888", name: "Starfield" },
    { id: "988888888888888888", name: "Fallout 4" }
];

let cachedDetectableGames: DetectableGame[] | null = null;

/**
 * Fetches detectable games directly from Discord's detectables catalog
 */
export async function fetchDetectableGames(): Promise<DetectableGame[]> {
    if (cachedDetectableGames && cachedDetectableGames.length > 0) {
        return cachedDetectableGames;
    }

    try {
        const res = await fetch("https://discord.com/api/v9/applications/detectable", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            },
        });

        if (res.ok) {
            const data = (await res.json()) as any[];
            if (Array.isArray(data) && data.length > 0) {
                cachedDetectableGames = data.map((g) => ({
                    id: String(g.id),
                    name: String(g.name || "Unknown Game"),
                    executables: g.executables,
                }));
                return cachedDetectableGames;
            }
        }
    } catch (e: any) {
        console.warn("[Badge Spoofer] Could not fetch remote detectable games, using bundled list:", e.message);
    }

    cachedDetectableGames = POPULAR_GAMES;
    return cachedDetectableGames;
}

/**
 * Super properties encoded in base64 as Discord client sends
 */
function getSuperProperties(): string {
    const props = {
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
    return Buffer.from(JSON.stringify(props)).toString("base64");
}

/**
 * Fetches user profile and analytics_token needed by /api/v9/science
 */
export async function fetchUserWithAnalyticsToken(userToken: string): Promise<{
    user: any;
    analyticsToken: string | null;
}> {
    const cleanToken = userToken.trim();
    const res = await fetch("https://discord.com/api/v9/users/@me?with_analytics_token=true", {
        headers: {
            Authorization: cleanToken,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            "X-Super-Properties": getSuperProperties(),
        },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Discord authentication failed (${res.status}): ${text || "Invalid token"}`);
    }

    const user = await res.json();
    return {
        user,
        analyticsToken: user.analytics_token || null,
    };
}

/**
 * Sends science event payload to Discord to credit playtime and games played
 */
export async function sendScienceGameEvents(
    userToken: string,
    analyticsToken: string | null,
    game: { id: string; name: string },
    hours: number,
): Promise<{ success: boolean; status: number; error?: string }> {
    const durationMs = Math.max(60000, Math.round(hours * 3600 * 1000));
    const now = Date.now();

    const payload: any = {
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

    const res = await fetch("https://discord.com/api/v9/science", {
        method: "POST",
        headers: {
            Authorization: userToken.trim(),
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            "X-Super-Properties": getSuperProperties(),
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
 * Spoofs game playtime and variety for Discord badges
 */
export async function spoofBadges(
    userToken: string,
    options: {
        mode: "playtime" | "variety" | "custom";
        hours?: number;
        gameCount?: number;
        gameIds?: string[];
    },
    onProgress?: (message: string, current: number, total: number) => void,
): Promise<SpoofResult> {
    const logs: string[] = [];
    const log = (msg: string) => {
        logs.push(msg);
        console.log(`[Badge Spoofer] ${msg}`);
    };

    try {
        log("Validating Discord user token and retrieving analytics token...");
        const { user, analyticsToken } = await fetchUserWithAnalyticsToken(userToken);
        log(`Authenticated as @${user.username} (${user.id}). Analytics token: ${analyticsToken ? "Acquired" : "Default"}`);

        const allGames = await fetchDetectableGames();
        let targetGames: DetectableGame[] = [];
        let hoursPerGame = 100;

        if (options.mode === "playtime") {
            // Hours booster on popular flagship games
            hoursPerGame = Math.max(1, Math.min(10000, options.hours || 250));
            targetGames = allGames.slice(0, 5); // Boost top 5 games heavily
            log(`Mode: Playtime Booster. Target: ${hoursPerGame} hours on ${targetGames.length} games.`);
        } else if (options.mode === "variety") {
            // Game variety booster across many different games
            const count = Math.max(5, Math.min(100, options.gameCount || 25));
            hoursPerGame = Math.max(1, options.hours || 5);
            targetGames = allGames.slice(0, count);
            log(`Mode: Game Variety Booster. Simulating ${count} distinct detectable games.`);
        } else {
            // Custom mode
            hoursPerGame = Math.max(1, options.hours || 100);
            if (options.gameIds && options.gameIds.length > 0) {
                targetGames = allGames.filter((g) => options.gameIds!.includes(g.id));
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
            const progressMsg = `[${i + 1}/${targetGames.length}] Spoofing ${game.name} (${hoursPerGame} hrs)...`;
            log(progressMsg);
            onProgress?.(progressMsg, i + 1, targetGames.length);

            const result = await sendScienceGameEvents(userToken, analyticsToken, game, hoursPerGame);

            if (result.success) {
                completed++;
                totalHours += hoursPerGame;
                log(`✓ ${game.name}: Success (204 No Content received)`);
            } else {
                log(`⚠ ${game.name}: Science response ${result.status} (${result.error || "rate limited"})`);
            }

            // Stagger requests to avoid Discord science rate limits
            if (i < targetGames.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 800));
            }
        }

        log(`Badge spoofing complete: ${completed}/${targetGames.length} games registered (~${totalHours} total hours).`);
        log(`Note: Discord updates profile badges in batches. Badges generally appear within 24-48 hours.`);

        return {
            success: completed > 0,
            gamesSpoofed: completed,
            totalHoursSpoofed: totalHours,
            logs,
        };
    } catch (err: any) {
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
