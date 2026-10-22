/**
 * Centralized Emoji Configuration
 * You can replace unicode emojis with custom Discord emojis (e.g. "<:my_emoji:123456789012345678>")
 * without having to modify any bot logic or commands.
 */

const Emojis = {
    // Actions & Navigation
    RUN: "▶️",
    STATUS: "📋",
    LINK: "🔗",
    UNLINK: "🗑️",
    REFRESH: "🔄",
    HELP: "❔",
    SUCCESS: "✅",
    ERROR: "❌",
    WARNING: "⚠️",
    TIME: "⏱️",
    CLOCK: "⏳",
    SLEEP: "😴",

    // Features & Badges
    GAME: "🎮",
    STREAM: "📡",
    ORB: "✦",
    SERVER: "🏰",
    SHIELD: "🛡️",
    STATS: "📊",
    USER: "👤",
    KEY: "🔑",
    NOTE: "📝",
    CALENDAR: "📅",
    ROCKET: "🚀",
    TROPHY: "🏆",
    ACTIVITY: "🎯",
    GIFT: "🎁",
    SPARKLE: "✨",
    FIRE: "🔥",
    STAR: "⭐",
    MAIL: "📬",
    PONG: "🏓",
    BOT: "🤖",
    CROWN: "👑",
    GEAR: "⚙️",
    PIN: "📍",

    // Platforms & Tasks
    TV: "📺",
    MOBILE: "📱",
    DESKTOP: "🖥️",
    XBOX: "🎮",
    PLAYSTATION: "🎮",

    // Status Indicators
    CHECK: "✓",
    CROSS: "✗",
    ONLINE: "🟢",
    STANDBY: "🟡",
    OFFLINE: "🔴",
    LOCK: "🔒",
    INFO: "ℹ️",
};

/**
 * Helper to get a button emoji object compatible with Discord components.
 * Works for both unicode ("▶️") and custom Discord emojis ("<:name:id>" or "<a:name:id>")
 */
function buttonEmoji(emojiStr) {
    if (!emojiStr) return undefined;
    const customMatch = emojiStr.match(/^<a?:([a-zA-Z0-9_]+):(\d+)>$/);
    if (customMatch) {
        return {
            name: customMatch[1],
            id: customMatch[2],
            animated: emojiStr.startsWith("<a:"),
        };
    }
    return { name: emojiStr };
}

module.exports = {
    Emojis,
    buttonEmoji,
};
