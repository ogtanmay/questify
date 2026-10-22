const { mkdirSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

const DATA_FILE = join(process.cwd(), ".data", "quest-channels.json");
const CATEGORY_DATA_FILE = join(process.cwd(), ".data", "category-channels.json");
const SNOWFLAKE = /^\d{17,20}$/;

function normalizeCategory(input) {
    if (!input || typeof input !== "string") return null;
    const lower = input.trim().toLowerCase();
    if (lower === "quest" || lower === "quests") return "quest";
    if (lower === "badges" || lower === "badge") return "badges";
    return null;
}

function loadCategoryChannels(
    file = CATEGORY_DATA_FILE,
    legacyQuestFile = DATA_FILE,
) {
    const result = {};

    // 1. Load legacy quest channels if present as defaults
    try {
        const legacy = loadQuestChannels(legacyQuestFile);
        for (const [guild, chan] of Object.entries(legacy)) {
            if (SNOWFLAKE.test(guild) && SNOWFLAKE.test(chan)) {
                result[guild] = { quest: chan };
            }
        }
    } catch {}

    // 2. Load dedicated category channels
    try {
        const raw = readFileSync(file, "utf8");
        const data = JSON.parse(raw);
        if (data && typeof data === "object" && !Array.isArray(data)) {
            for (const [guild, config] of Object.entries(data)) {
                if (!SNOWFLAKE.test(guild)) continue;
                if (!config || typeof config !== "object") continue;
                const existing = result[guild] || {};
                result[guild] = {
                    ...existing,
                    quest: (typeof config.quest === "string" && SNOWFLAKE.test(config.quest)) ? config.quest : existing.quest,
                    badges: (typeof config.badges === "string" && SNOWFLAKE.test(config.badges)) ? config.badges : existing.badges,
                };
            }
        }
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.warn("[CategoryChannels] Failed to read category channels, using defaults:", error.message);
        }
    }

    return result;
}

function saveCategoryChannel(
    database,
    guildId,
    category,
    channelId,
    file = CATEGORY_DATA_FILE,
) {
    if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(channelId)) {
        throw new Error("Invalid guild or channel ID");
    }
    const current = database[guildId] || {};
    const nextConfig = { ...current, [category]: channelId };
    const nextDatabase = { ...database, [guildId]: nextConfig };

    persistCategoryChannels(nextDatabase, file);
    database[guildId] = nextConfig;
}

function removeCategoryChannel(
    database,
    guildId,
    category,
    file = CATEGORY_DATA_FILE,
) {
    if (!database[guildId] || !database[guildId][category]) {
        return false;
    }
    const current = database[guildId];
    const nextConfig = { ...current };
    delete nextConfig[category];

    const nextDatabase = { ...database };
    if (!nextConfig.quest && !nextConfig.badges) {
        delete nextDatabase[guildId];
        delete database[guildId];
    } else {
        nextDatabase[guildId] = nextConfig;
        database[guildId] = nextConfig;
    }

    persistCategoryChannels(nextDatabase, file);
    return true;
}

function getCategoryChannel(
    database,
    guildId,
    category,
) {
    if (!guildId) return undefined;
    return database[guildId]?.[category];
}

function checkCategoryNotice(
    database,
    guildId,
    channelId,
    category,
) {
    if (!guildId) return "Commands are only available in a server.";
    const guildConfig = database[guildId];
    const allowed = guildConfig?.[category];
    if (!allowed) {
        return null;
    }
    if (allowed !== channelId) {
        const catName = category === "quest" ? "Quest" : "Badge";
        return `${catName} commands are restricted to <#${allowed}> in this server.`;
    }
    return null;
}

function persistCategoryChannels(data, file) {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", {
        mode: 0o600,
    });
    renameSync(temp, file);
}

function loadQuestChannels(file = DATA_FILE) {
    try {
        const data = JSON.parse(readFileSync(file, "utf8"));
        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data) ||
            Object.entries(data).some(
                ([guild, channel]) =>
                    !SNOWFLAKE.test(guild) ||
                    typeof channel !== "string" ||
                    !SNOWFLAKE.test(channel),
            )
        ) {
            throw new Error("Invalid quest channel configuration");
        }
        return data;
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }
}

function saveQuestChannel(
    channels,
    guildId,
    channelId,
    file = DATA_FILE,
) {
    if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(channelId)) {
        throw new Error("Invalid guild or channel ID");
    }
    const next = { ...channels, [guildId]: channelId };
    persistQuestChannels(next, file);
    channels[guildId] = channelId;
}

function removeQuestChannel(
    channels,
    guildId,
    file = DATA_FILE,
) {
    if (!Object.prototype.hasOwnProperty.call(channels, guildId)) return false;
    const next = { ...channels };
    delete next[guildId];
    persistQuestChannels(next, file);
    delete channels[guildId];
    return true;
}

function persistQuestChannels(channels, file) {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(channels, null, 2) + "\n", {
        mode: 0o600,
    });
    renameSync(temp, file);
}

function questChannelNotice(
    channels,
    guildId,
    channelId,
) {
    if (!guildId) return "Quest commands are only available in a server.";
    const allowed = channels[guildId];
    if (!allowed) return "No quest channel is set yet. Ask a server admin to use `/set channel`.";
    if (allowed !== channelId) return `Use quest commands in <#${allowed}>.`;
    return null;
}

module.exports = {
    normalizeCategory,
    loadCategoryChannels,
    saveCategoryChannel,
    removeCategoryChannel,
    getCategoryChannel,
    checkCategoryNotice,
    loadQuestChannels,
    saveQuestChannel,
    removeQuestChannel,
    questChannelNotice,
};
