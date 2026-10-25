const test = require("node:test");
const assert = require("node:assert");
const {
    GAME_PRESETS,
    buildActivity,
    clearUserPresence,
    getUserPresence,
    listActivePresences,
} = require("./presenceManager");

test("presenceManager defines popular detectable games presets", () => {
    assert.ok(GAME_PRESETS.valorant, "VALORANT preset exists");
    assert.strictEqual(GAME_PRESETS.valorant.applicationId, "700136079562375258");
    assert.strictEqual(GAME_PRESETS.valorant.name, "VALORANT");

    assert.ok(GAME_PRESETS.vscode, "VS Code preset exists");
    assert.strictEqual(GAME_PRESETS.vscode.applicationId, "383226320970055681");
    assert.strictEqual(GAME_PRESETS.vscode.name, "Visual Studio Code");

    assert.ok(GAME_PRESETS.minecraft, "Minecraft preset exists");
    assert.strictEqual(GAME_PRESETS.minecraft.applicationId, "432980957394370572");

    assert.ok(GAME_PRESETS.league, "League of Legends preset exists");
    assert.strictEqual(GAME_PRESETS.league.applicationId, "356869127241072640");

    assert.ok(GAME_PRESETS.stream, "Streaming preset exists");
    assert.strictEqual(GAME_PRESETS.stream.type, 1);
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
