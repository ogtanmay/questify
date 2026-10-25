const test = require("node:test");
const assert = require("node:assert");
const {
    PRESENCE_GAMES,
    GAME_PRESETS,
    findPresenceGame,
    buildActivity,
    clearUserPresence,
    getUserPresence,
    listActivePresences,
    getPresenceGamesList,
} = require("./presenceManager");

test("presenceManager defines dedicated presence-only games list", () => {
    assert.ok(Array.isArray(PRESENCE_GAMES), "PRESENCE_GAMES is an array");
    assert.ok(PRESENCE_GAMES.length >= 10, "Has rich catalog of presence games");

    const gamesList = getPresenceGamesList();
    assert.strictEqual(gamesList.length, PRESENCE_GAMES.length);

    const valorant = findPresenceGame("valorant");
    assert.strictEqual(valorant.name, "VALORANT");
    assert.strictEqual(valorant.applicationId, "700136079562375258");

    const cs2 = findPresenceGame("cs2");
    assert.strictEqual(cs2.name, "Counter-Strike 2");
    assert.strictEqual(cs2.applicationId, "733852150177726474");

    const fortnite = findPresenceGame("fortnite");
    assert.strictEqual(fortnite.name, "Fortnite");

    const vscode = findPresenceGame("383226320970055681");
    assert.strictEqual(vscode.name, "Visual Studio Code");
});

test("buildActivity builds valid Discord activity payloads", () => {
    const valorantActivity = buildActivity("valorant");
    assert.strictEqual(valorantActivity.name, "VALORANT");
    assert.strictEqual(valorantActivity.type, 0);
    assert.strictEqual(valorantActivity.application_id, "700136079562375258");
    assert.ok(valorantActivity.timestamps.start > 0);

    const customActivity = buildActivity("vscode", {
        details: "Refactoring bot.js",
        state: "In Workspace",
    });
    assert.strictEqual(customActivity.details, "Refactoring bot.js");
    assert.strictEqual(customActivity.state, "In Workspace");
    assert.strictEqual(customActivity.application_id, "383226320970055681");
});

test("presence tracking handles clear and get safely", () => {
    const fakeId = "123456789012345678";
    assert.strictEqual(getUserPresence(fakeId), null);
    assert.strictEqual(clearUserPresence(fakeId), false);
    assert.ok(Array.isArray(listActivePresences()));
});
