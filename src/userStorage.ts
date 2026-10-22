import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DATA_FILE = join(process.cwd(), ".data", "user-tokens.json");
const SNOWFLAKE = /^\d{17,20}$/;

export interface UserTokenRecord {
    userId: string;
    token: string;
    username?: string;
    globalName?: string;
    discriminator?: string;
    avatar?: string;
    notes?: string;
    linkedAt: string;
    updatedAt: string;
}

export type UserTokenDatabase = Record<string, UserTokenRecord>;

export function loadUserTokens(file = DATA_FILE): UserTokenDatabase {
    try {
        const raw = readFileSync(file, "utf8");
        const data: unknown = JSON.parse(raw);
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return {};
        }
        const validated: UserTokenDatabase = {};
        for (const [userId, record] of Object.entries(data)) {
            if (!SNOWFLAKE.test(userId)) continue;
            if (!record || typeof record !== "object") continue;
            const rec = record as Partial<UserTokenRecord>;
            if (typeof rec.token !== "string" || !rec.token.trim()) continue;
            validated[userId] = {
                userId,
                token: rec.token.trim(),
                username: typeof rec.username === "string" ? rec.username : undefined,
                globalName: typeof rec.globalName === "string" ? rec.globalName : undefined,
                discriminator: typeof rec.discriminator === "string" ? rec.discriminator : undefined,
                avatar: typeof rec.avatar === "string" ? rec.avatar : undefined,
                notes: typeof rec.notes === "string" ? rec.notes : undefined,
                linkedAt: rec.linkedAt || new Date().toISOString(),
                updatedAt: rec.updatedAt || new Date().toISOString(),
            };
        }
        return validated;
    } catch (error: any) {
        if (error.code === "ENOENT") return {};
        console.warn("[UserStorage] Failed to read user tokens file, starting empty:", error.message);
        return {};
    }
}

export function getUserRecord(userId: string, file = DATA_FILE): UserTokenRecord | null {
    if (!SNOWFLAKE.test(userId)) return null;
    const db = loadUserTokens(file);
    return db[userId] ?? null;
}

export function getUserToken(userId: string, file = DATA_FILE): string | null {
    const record = getUserRecord(userId, file);
    return record?.token ?? null;
}

export function hasUserToken(userId: string, file = DATA_FILE): boolean {
    return Boolean(getUserToken(userId, file));
}

export function saveUserToken(
    userId: string,
    data: {
        token: string;
        username?: string;
        globalName?: string;
        discriminator?: string;
        avatar?: string;
        notes?: string;
    },
    file = DATA_FILE,
): UserTokenRecord {
    if (!SNOWFLAKE.test(userId)) {
        throw new Error("Invalid Discord user snowflake ID");
    }
    const cleanToken = data.token.trim();
    if (!cleanToken || cleanToken.length < 15) {
        throw new Error("Invalid user token format");
    }

    const db = loadUserTokens(file);
    const existing = db[userId];
    const now = new Date().toISOString();

    const record: UserTokenRecord = {
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

export function removeUserToken(userId: string, file = DATA_FILE): boolean {
    if (!SNOWFLAKE.test(userId)) return false;
    const db = loadUserTokens(file);
    if (!Object.prototype.hasOwnProperty.call(db, userId)) return false;

    const nextDb = { ...db };
    delete nextDb[userId];
    persistUserTokens(nextDb, file);
    return true;
}

export function listUserTokens(file = DATA_FILE): UserTokenRecord[] {
    const db = loadUserTokens(file);
    return Object.values(db);
}

function persistUserTokens(db: UserTokenDatabase, file: string): void {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, JSON.stringify(db, null, 2) + "\n", {
        mode: 0o600,
    });
    renameSync(temp, file);
}

/**
 * Optionally inspects Discord API /users/@me with the provided token
 * to retrieve the account's username, discriminator, global name and avatar.
 */
export async function verifyAndFetchDiscordUser(token: string): Promise<{
    valid: boolean;
    id?: string;
    username?: string;
    globalName?: string;
    discriminator?: string;
    avatar?: string;
    error?: string;
}> {
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
        const data = (await res.json()) as any;
        return {
            valid: true,
            id: data.id,
            username: data.username,
            globalName: data.global_name,
            discriminator: data.discriminator,
            avatar: data.avatar,
        };
    } catch (e: any) {
        return {
            valid: false,
            error: e.message || "Failed to reach Discord API",
        };
    }
}
