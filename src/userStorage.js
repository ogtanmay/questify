const { mkdirSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

const DATA_FILE = join(process.cwd(), ".data", "user-tokens.json");
const SNOWFLAKE = /^\d{17,20}$/;

function loadUserTokens(file = DATA_FILE) {
    try {
        const raw = readFileSync(file, "utf8");
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return {};
        }
        const validated = {};
        for (const [userId, record] of Object.entries(data)) {
            if (!SNOWFLAKE.test(userId)) continue;
            if (!record || typeof record !== "object") continue;
            if (typeof record.token !== "string" || !record.token.trim()) continue;
            validated[userId] = {
                userId,
                token: record.token.trim(),
                username: typeof record.username === "string" ? record.username : undefined,
                globalName: typeof record.globalName === "string" ? record.globalName : undefined,
                discriminator: typeof record.discriminator === "string" ? record.discriminator : undefined,
                avatar: typeof record.avatar === "string" ? record.avatar : undefined,
                notes: typeof record.notes === "string" ? record.notes : undefined,
                linkedAt: record.linkedAt || new Date().toISOString(),
                updatedAt: record.updatedAt || new Date().toISOString(),
            };
        }
        return validated;
    } catch (error) {
        if (error.code === "ENOENT") return {};
        console.warn("[UserStorage] Failed to read user tokens file, starting empty:", error.message);
        return {};
    }
}

function getUserRecord(userId, file = DATA_FILE) {
    if (!SNOWFLAKE.test(userId)) return null;
    const db = loadUserTokens(file);
    return db[userId] ?? null;
}

function getUserToken(userId, file = DATA_FILE) {
    const record = getUserRecord(userId, file);
    return record?.token ?? null;
}

function hasUserToken(userId, file = DATA_FILE) {
    return Boolean(getUserToken(userId, file));
}

function saveUserToken(
    userId,
    data,
    file = DATA_FILE,
) {
    if (!SNOWFLAKE.test(userId)) {
        throw new Error("Invalid Discord user snowflake ID");
    }
    const cleanToken = data.token ? data.token.trim() : "";
    if (!cleanToken || cleanToken.length < 15) {
        throw new Error("Invalid user token format");
    }

    const db = loadUserTokens(file);
    const existing = db[userId];
    const now = new Date().toISOString();

    const record = {
        userId,
        token: cleanToken,
        username: data.username || existing?.username,
        globalName: data.globalName || existing?.globalName,
        discriminator: data.discriminator || existing?.discriminator,
        avatar: data.avatar || existing?.avatar,
        notes: data.notes !== undefined ? data.notes : existing?.notes,
        linkedAt: existing?.linkedAt || now,
        updatedAt: now,
    };

    const nextDb = { ...db, [userId]: record };
    persistUserTokens(nextDb, file);
    return record;
}

function removeUserToken(userId, file = DATA_FILE) {
    if (!SNOWFLAKE.test(userId)) return false;
    const db = loadUserTokens(file);
    if (!Object.prototype.hasOwnProperty.call(db, userId)) return false;

    const nextDb = { ...db };
    delete nextDb[userId];
    persistUserTokens(nextDb, file);
    return true;
}

function listUserTokens(file = DATA_FILE) {
    const db = loadUserTokens(file);
    return Object.values(db);
}

function persistUserTokens(db, file) {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, JSON.stringify(db, null, 2) + "\n", {
        mode: 0o600,
    });
    renameSync(temp, file);
}

async function verifyAndFetchDiscordUser(token) {
    try {
        const res = await fetch("https://discord.com/api/v9/users/@me", {
            headers: {
                Authorization: token.trim(),
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            return {
                valid: false,
                error: res.status === 401 ? "Unauthorized / Invalid Discord token" : `Discord API HTTP ${res.status}: ${errText}`,
            };
        }
        const data = await res.json();
        return {
            valid: true,
            id: data.id,
            username: data.username,
            globalName: data.global_name,
            discriminator: data.discriminator,
            avatar: data.avatar,
        };
    } catch (e) {
        return {
            valid: false,
            error: e.message || "Failed to reach Discord API",
        };
    }
}

module.exports = {
    loadUserTokens,
    getUserRecord,
    getUserToken,
    hasUserToken,
    saveUserToken,
    removeUserToken,
    listUserTokens,
    verifyAndFetchDiscordUser,
};
