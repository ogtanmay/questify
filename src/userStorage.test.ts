import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    getUserRecord,
    getUserToken,
    hasUserToken,
    listUserTokens,
    loadUserTokens,
    removeUserToken,
    saveUserToken,
} from "./userStorage";

test("saves, loads, and retrieves linked user tokens", () => {
    const dir = mkdtempSync(join(tmpdir(), "user-tokens-"));
    const file = join(dir, "tokens.json");
    try {
        const userId = "123456789012345678";
        const token = "MTE1ODk4OTAyMTIzNDU2Nzg5MA.G12345.SampleDiscordTokenHereLongEnough";

        assert.equal(hasUserToken(userId, file), false);
        assert.equal(getUserToken(userId, file), null);

        const saved = saveUserToken(
            userId,
            {
                token,
                username: "testuser",
                notes: "Main Account",
            },
            file,
        );

        assert.equal(saved.userId, userId);
        assert.equal(saved.token, token);
        assert.equal(saved.username, "testuser");
        assert.equal(saved.notes, "Main Account");

        assert.equal(hasUserToken(userId, file), true);
        assert.equal(getUserToken(userId, file), token);

        const rec = getUserRecord(userId, file);
        assert.ok(rec);
        assert.equal(rec.username, "testuser");
        assert.equal(rec.notes, "Main Account");

        const all = listUserTokens(file);
        assert.equal(all.length, 1);
        assert.equal(all[0].userId, userId);

        const db = loadUserTokens(file);
        assert.ok(db[userId]);

        const removed = removeUserToken(userId, file);
        assert.equal(removed, true);
        assert.equal(hasUserToken(userId, file), false);
        assert.equal(removeUserToken(userId, file), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("rejects invalid snowflakes and tokens", () => {
    const dir = mkdtempSync(join(tmpdir(), "user-tokens-"));
    const file = join(dir, "tokens.json");
    try {
        assert.throws(() =>
            saveUserToken("not-a-snowflake", { token: "MTE1ODk4OTAyMTIzNDU2Nzg5MA" }, file),
        );
        assert.throws(() =>
            saveUserToken("123456789012345678", { token: "short" }, file),
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
