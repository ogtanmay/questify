const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const CONFIG_PATH = join(process.cwd(), "config.json");

const DEFAULT_CONFIG = {
    botToken: "",
    clientId: "",
    ownerIds: [],
    guildId: "",
    yesCaptchaApiKey: "",
    port: 3000,
    prefix: "!quest",
    defaultPresenceGame: "valorant",
};

function isRealConfigToken(val) {
    if (!val || typeof val !== "string") return false;
    const lower = val.trim().toLowerCase();
    if (
        lower === "your_discord_bot_token_here" ||
        lower === "your_discord_client_id_here" ||
        lower === "your_token_here" ||
        lower === "placeholder" ||
        lower === ""
    ) {
        return false;
    }
    return val.trim().length > 10;
}

function loadConfig() {
    let fileConfig = {};
    if (existsSync(CONFIG_PATH)) {
        try {
            const raw = readFileSync(CONFIG_PATH, "utf8");
            fileConfig = JSON.parse(raw);
        } catch (err) {
            console.warn("[Config] Failed to parse config.json, using defaults:", err.message);
        }
    } else {
        try {
            writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf8");
        } catch (err) {
            console.warn("[Config] Could not create initial config.json:", err.message);
        }
    }

    // Parse owners: array or comma-separated string
    let ownerIds = [];
    if (Array.isArray(fileConfig.ownerIds)) {
        ownerIds = fileConfig.ownerIds.map(String).map((s) => s.trim()).filter(Boolean);
    } else if (typeof fileConfig.ownerIds === "string") {
        ownerIds = fileConfig.ownerIds.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (process.env.OWNER_ID || process.env.OWNER_IDS) {
        ownerIds = (process.env.OWNER_ID || process.env.OWNER_IDS)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }

    // Merge priority: config.json value if set, else environment variable, else default
    const botToken = fileConfig.botToken || process.env.BOT_TOKEN || "";
    const clientId = fileConfig.clientId || process.env.CLIENT_ID || "";
    const guildId = fileConfig.guildId || process.env.GUILD_ID || "";
    const yesCaptchaApiKey =
        fileConfig.yesCaptchaApiKey || process.env.YES_CAPTCHA_API_KEY || "";
    const port = Number(fileConfig.port || process.env.PORT || 3000);
    const prefix = fileConfig.prefix || process.env.PREFIX || "!quest";
    const defaultPresenceGame = fileConfig.defaultPresenceGame || "valorant";

    return {
        botToken,
        clientId,
        ownerIds,
        guildId,
        yesCaptchaApiKey,
        port,
        prefix,
        defaultPresenceGame,
        isRealConfigToken,
    };
}

let cachedConfig = null;

function getConfig(forceReload = false) {
    if (!cachedConfig || forceReload) {
        cachedConfig = loadConfig();
    }
    return cachedConfig;
}

function updateConfig(updates) {
    const current = getConfig();
    const updated = {
        botToken: updates.botToken !== undefined ? updates.botToken : current.botToken,
        clientId: updates.clientId !== undefined ? updates.clientId : current.clientId,
        ownerIds: updates.ownerIds !== undefined ? updates.ownerIds : current.ownerIds,
        guildId: updates.guildId !== undefined ? updates.guildId : current.guildId,
        yesCaptchaApiKey:
            updates.yesCaptchaApiKey !== undefined
                ? updates.yesCaptchaApiKey
                : current.yesCaptchaApiKey,
        port: updates.port !== undefined ? updates.port : current.port,
        prefix: updates.prefix !== undefined ? updates.prefix : current.prefix,
        defaultPresenceGame:
            updates.defaultPresenceGame !== undefined
                ? updates.defaultPresenceGame
                : current.defaultPresenceGame,
    };

    try {
        writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2) + "\n", "utf8");
    } catch (err) {
        console.warn("[Config] Could not save updated config.json:", err.message);
    }

    cachedConfig = loadConfig();
    return cachedConfig;
}

module.exports = {
    getConfig,
    updateConfig,
    isRealConfigToken,
    CONFIG_PATH,
};
