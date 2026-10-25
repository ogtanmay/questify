const test = require("node:test");
const assert = require("node:assert");
const { getConfig, isRealConfigToken } = require("./config");

test("config loads valid schema with defaults and helper", () => {
    const config = getConfig();
    assert.ok(typeof config === "object");
    assert.ok(typeof config.port === "number");
    assert.ok(Array.isArray(config.ownerIds));
    assert.ok(typeof config.prefix === "string");

    assert.strictEqual(isRealConfigToken(""), false);
    assert.strictEqual(isRealConfigToken("your_discord_bot_token_here"), false);
    assert.strictEqual(isRealConfigToken("short"), false);
    assert.strictEqual(isRealConfigToken("MTA4OTkyODc0NTY3MjEzMjExMg.GXYZ12.longvalidtokenexample"), true);
});
