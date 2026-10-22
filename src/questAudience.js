const { mkdirSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

const DATA_FILE = join(process.cwd(), ".data", "quest-audience.json");
const SNOWFLAKE = /^\d{17,20}$/;

function loadQuestAudience(file = DATA_FILE) {
    try {
        const data = JSON.parse(readFileSync(file, "utf8"));
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error("Invalid quest notification audience");
        }
        for (const [guildId, entry] of Object.entries(data)) {
            if (
                !SNOWFLAKE.test(guildId) ||
                !Array.isArray(entry.recipients) ||
                !Array.isArray(entry.optedOut) ||
                [...entry.recipients, ...entry.optedOut].some(
                    (id) => typeof id !== "string" || !SNOWFLAKE.test(id),
                )
            ) {
                throw new Error("Invalid quest notification audience");
            }
        }
        return data;
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }
}

function recordQuestUser(
    audience,
    guildId,
    userId,
    file = DATA_FILE,
) {
    if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(userId)) {
        throw new Error("Invalid guild or user ID");
    }
    const current = audience[guildId] ?? { recipients: [], optedOut: [] };
    if (current.optedOut.includes(userId) || current.recipients.includes(userId)) {
        return;
    }
    const next = {
        ...audience,
        [guildId]: { ...current, recipients: [...current.recipients, userId] },
    };
    persistAudience(next, file);
    audience[guildId] = next[guildId];
}

function setQuestNotification(
    audience,
    guildId,
    userId,
    enabled,
    file = DATA_FILE,
) {
    if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(userId)) {
        throw new Error("Invalid guild or user ID");
    }
    const current = audience[guildId] ?? { recipients: [], optedOut: [] };
    const recipients = current.recipients.filter((id) => id !== userId);
    const optedOut = current.optedOut.filter((id) => id !== userId);
    if (enabled) recipients.push(userId);
    else optedOut.push(userId);

    const next = { ...audience, [guildId]: { recipients, optedOut } };
    persistAudience(next, file);
    audience[guildId] = next[guildId];
}

function getQuestRecipients(audience, guildId) {
    return [...(audience[guildId]?.recipients ?? [])];
}

function persistAudience(audience, file) {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(audience, null, 2) + "\n", {
        mode: 0o600,
    });
    renameSync(temp, file);
}

module.exports = {
    loadQuestAudience,
    recordQuestUser,
    setQuestNotification,
    getQuestRecipients,
};
