const assert = require("node:assert/strict");
const test = require("node:test");
const {
    ME_URL,
    SCIENCE_URL,
    PROPERTIES_URL,
    GAMES_CDN_URL,
    POPULAR_GAMES,
    getSuperProperties,
    fetchDetectableGames,
} = require("./badgeSpoofer");

test("badge spoofer endpoints are correctly defined", () => {
    assert.equal(ME_URL, "https://discord.com/api/v9/users/@me?with_analytics_token=true");
    assert.equal(SCIENCE_URL, "https://discord.com/api/v9/science");
    assert.equal(PROPERTIES_URL, "https://cordapi.dolfi.es/api/v2/properties/windows");
    assert.equal(GAMES_CDN_URL, "https://cdn.discordapp.com/detectables/games.json");
});

test("returns valid base64 encoded super properties with fallback", async () => {
    const superProps = await getSuperProperties();
    assert.ok(typeof superProps === "string");
    assert.ok(superProps.length > 20);

    const decoded = JSON.parse(Buffer.from(superProps, "base64").toString("utf8"));
    assert.equal(decoded.os, "Windows");
    assert.equal(decoded.browser, "Discord Client");
});

test("retrieves popular detectable games list", async () => {
    assert.ok(Array.isArray(POPULAR_GAMES));
    assert.ok(POPULAR_GAMES.length >= 25);
    const lol = POPULAR_GAMES.find((g) => g.name === "League of Legends");
    assert.ok(lol);
    assert.equal(lol.id, "356869127241072640");

    const games = await fetchDetectableGames();
    assert.ok(Array.isArray(games));
    assert.ok(games.length > 0);
});
