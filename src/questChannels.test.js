const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const {
    loadQuestChannels,
    questChannelNotice,
    removeQuestChannel,
    saveQuestChannel,
    checkCategoryNotice,
    saveCategoryChannel,
    removeCategoryChannel,
    loadCategoryChannels,
    normalizeCategory,
} = require("./questChannels");

test("saves one configured quest channel per server and reloads it", () => {
    const directory = mkdtempSync(join(tmpdir(), "quest-channels-"));
    const file = join(directory, "channels.json");
    try {
        const channels = {};
        saveQuestChannel(channels, "12345678901234567", "23456789012345678", file);

        assert.equal(channels["12345678901234567"], "23456789012345678");
        assert.deepEqual(loadQuestChannels(file), {
            "12345678901234567": "23456789012345678",
        });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("allows commands only in the configured server channel", () => {
    const channels = { "12345678901234567": "23456789012345678" };

    assert.equal(
        questChannelNotice(channels, "12345678901234567", "23456789012345678"),
        null,
    );
    assert.match(
        questChannelNotice(channels, "12345678901234567", "34567890123456789"),
        /<#23456789012345678>/,
    );
    assert.match(
        questChannelNotice(channels, "98765432109876543", "23456789012345678"),
        /No quest channel is set/,
    );
    assert.match(
        questChannelNotice(channels, undefined, "23456789012345678"),
        /only available in a server/,
    );
});

test("rejects invalid snowflakes instead of persisting them", () => {
    assert.throws(() =>
        saveQuestChannel({}, "not-a-server", "23456789012345678", "/tmp/unused.json"),
    );
});

test("clears a server channel and disables its quest commands", () => {
    const directory = mkdtempSync(join(tmpdir(), "quest-channels-"));
    const file = join(directory, "channels.json");
    try {
        const channels = { "12345678901234567": "23456789012345678" };
        assert.equal(removeQuestChannel(channels, "12345678901234567", file), true);
        assert.deepEqual(channels, {});
        assert.deepEqual(loadQuestChannels(file), {});
        assert.match(
            questChannelNotice(channels, "12345678901234567", "23456789012345678"),
            /No quest channel is set/,
        );
        assert.equal(removeQuestChannel(channels, "12345678901234567", file), false);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("saves category channels (quest & badges), enforces separation and clears them", () => {
    const directory = mkdtempSync(join(tmpdir(), "cat-channels-"));
    const file = join(directory, "category-channels.json");
    try {
        const db = {};
        const guildId = "111111111111111111";
        const questChan = "222222222222222222";
        const badgesChan = "333333333333333333";

        // Initial: No restrictions set -> commands allowed anywhere
        assert.equal(checkCategoryNotice(db, guildId, "999999999999999999", "quest"), null);
        assert.equal(checkCategoryNotice(db, guildId, "999999999999999999", "badges"), null);

        // Normalize
        assert.equal(normalizeCategory("quest"), "quest");
        assert.equal(normalizeCategory("quests"), "quest");
        assert.equal(normalizeCategory("badge"), "badges");
        assert.equal(normalizeCategory("badges"), "badges");
        assert.equal(normalizeCategory("invalid"), null);

        // Save quest channel
        saveCategoryChannel(db, guildId, "quest", questChan, file);
        assert.equal(checkCategoryNotice(db, guildId, questChan, "quest"), null);
        assert.match(
            checkCategoryNotice(db, guildId, "999999999999999999", "quest"),
            /<#222222222222222222>/,
        );
        // Badges channel is still unrestricted
        assert.equal(checkCategoryNotice(db, guildId, "999999999999999999", "badges"), null);

        // Save badges channel
        saveCategoryChannel(db, guildId, "badges", badgesChan, file);
        assert.equal(checkCategoryNotice(db, guildId, badgesChan, "badges"), null);
        assert.match(
            checkCategoryNotice(db, guildId, questChan, "badges"),
            /<#333333333333333333>/,
        );

        // Reload from file
        const loaded = loadCategoryChannels(file, "/tmp/non-existent.json");
        assert.equal(loaded[guildId]?.quest, questChan);
        assert.equal(loaded[guildId]?.badges, badgesChan);

        // Remove quest channel restriction
        assert.equal(removeCategoryChannel(db, guildId, "quest", file), true);
        assert.equal(checkCategoryNotice(db, guildId, "999999999999999999", "quest"), null);
        // Badges channel remains restricted
        assert.match(
            checkCategoryNotice(db, guildId, questChan, "badges"),
            /<#333333333333333333>/,
        );

        // Remove badges channel restriction
        assert.equal(removeCategoryChannel(db, guildId, "badges", file), true);
        assert.equal(checkCategoryNotice(db, guildId, questChan, "badges"), null);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
