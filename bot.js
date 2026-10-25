const http = require("node:http");
const {
    GatewayDispatchEvents,
    GatewayIntentBits,
    InteractionType,
    InteractionResponseType,
    ApplicationCommandOptionType,
    ApplicationCommandType,
    ComponentType,
    ButtonStyle,
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits,
} = require("discord-api-types/v10");
const { Client } = require("@discordjs/core");
const { REST } = require("@discordjs/rest");
const { WebSocketManager } = require("@discordjs/ws");

const { getConfig, isRealConfigToken } = require("./src/config");
const { runQuestsForToken, fetchQuestsStatus } = require("./src/questRunner");
const {
    loadQuestChannels,
    saveQuestChannel,
    removeQuestChannel,
    loadCategoryChannels,
    saveCategoryChannel,
    removeCategoryChannel,
    getCategoryChannel,
    checkCategoryNotice,
    normalizeCategory,
} = require("./src/questChannels");
const {
    getUserRecord,
    getUserToken,
    hasUserToken,
    saveUserToken,
    removeUserToken,
    verifyAndFetchDiscordUser,
} = require("./src/userStorage");
const {
    getQuestRecipients,
    loadQuestAudience,
    recordQuestUser,
    setQuestNotification,
} = require("./src/questAudience");
const {
    spoofBadges,
    POPULAR_GAMES,
} = require("./src/badgeSpoofer");
const {
    setUserPresence,
    clearUserPresence,
    getUserPresence,
    GAME_PRESETS,
    PRESENCE_GAMES,
    findPresenceGame,
    getPresenceGamesList,
} = require("./src/presenceManager");

// ── Configuration (Loaded from config.json with env fallback) ─────────────────
const config = getConfig();
const BOT_TOKEN = config.botToken || "";
const CLIENT_ID = config.clientId || "";
const OWNER_IDS = config.ownerIds || [];
const PREFIX = config.prefix || "!quest";
const HTTP_PORT = config.port || 3000;
const hasValidBotConfig = isRealConfigToken(BOT_TOKEN) && isRealConfigToken(CLIENT_ID);

let isBotConnected = false;

function isDiscordBotRunning() {
    return isBotConnected;
}

function isOwner(userId) {
    if (!userId) return false;
    return OWNER_IDS.includes(userId);
}

const questChannels = loadQuestChannels();
const categoryChannels = loadCategoryChannels();
const questAudience = loadQuestAudience();

// ── Minimalist Aesthetic Palette (Zero ASCII, Zero Emojis in Embeds) ──────────
const COLOR_PRIMARY = 0x5865f2; // Discord Blurple
const COLOR_NEUTRAL = 0x2b2d31; // Minimalist Dark
const COLOR_SUCCESS = 0x23a55a; // Emerald Success
const COLOR_WARNING = 0xfee75c; // Amber Warning
const COLOR_DANGER = 0xf23f43;  // Crimson Error

const INTENTS =
    GatewayIntentBits.Guilds |
    GatewayIntentBits.GuildMessages |
    GatewayIntentBits.MessageContent |
    GatewayIntentBits.DirectMessages;

let rest = null;
let gateway = null;
let client = null;

if (hasValidBotConfig) {
    try {
        rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
        gateway = new WebSocketManager({
            token: BOT_TOKEN,
            intents: INTENTS,
            rest,
        });
        client = new Client({ rest, gateway });
    } catch (e) {
        console.error("[Discord Bot] Initialization error:", e.message);
    }
}

// ── Component Custom IDs ──────────────────────────────────────────────────────
const BTN_RUN = "quest_run_btn";
const BTN_STATUS = "quest_status_btn";
const BTN_HELP = "quest_help_btn";
const BTN_LINK = "link_token_open_modal";
const BTN_LINK_CHECK = "link_status_check";
const BTN_LINK_UNLINK = "link_unlink_btn";
const BTN_PRESENCE_MENU = "presence_menu_open";
const BTN_PRESENCE_VALORANT = "presence_set_valorant";
const BTN_PRESENCE_VSCODE = "presence_set_vscode";
const BTN_PRESENCE_CLEAR = "presence_clear_btn";
const BTN_PRESENCE_GAMES = "presence_games_list";
const SELECT_HELP_CATEGORY = "help_category_select";
const SELECT_PRESENCE_GAME = "presence_game_select";
const MODAL_LINK = "modal_link_token";
const INPUT_LINK_TOKEN = "user_link_token_input";
const INPUT_LINK_NOTE = "user_link_note_input";

// ── Clean Task Labels (No Emojis) ─────────────────────────────────────────────
const TASK_LABELS = {
    WATCH_VIDEO: "Watch Video",
    WATCH_VIDEO_ON_MOBILE: "Watch Video on Mobile",
    PLAY_ON_DESKTOP: "Play on Desktop",
    PLAY_ON_XBOX: "Play on Xbox",
    PLAY_ON_PLAYSTATION: "Play on PlayStation",
    PLAY_ACTIVITY: "Play Activity",
    ACHIEVEMENT_IN_ACTIVITY: "Activity Achievement",
    STREAM_ON_DESKTOP: "Stream on Desktop",
};

// ── Minimalist Embed Builders (No Emojis, No ASCII Art, No Embed Fields) ──────

/**
 * Embed shown when an action requires linking an account first
 */
function buildMustLinkFirstEmbed(actionName = "this command") {
    return {
        embeds: [
            {
                color: COLOR_WARNING,
                author: { name: "QUEST CONTROL / AUTHENTICATION" },
                title: "Discord Account Link Required",
                description: [
                    `You have not linked your Discord user account yet.`,
                    `To use ${actionName}, please link your account first.`,
                    "",
                    "## Why Link Your Account?",
                    "• Execute quest automation and badge spoofing with 1-click buttons.",
                    "• Never paste or expose your token in chat or public channels.",
                    "• Private modal entry ensures your credentials remain secure.",
                    "",
                    "Click **Link Account** below to open the private pop-up modal.",
                ].join("\n"),
                footer: { text: "Quest Control • Private Modal Authentication" },
                timestamp: new Date().toISOString(),
            },
        ],
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Success,
                        custom_id: BTN_LINK,
                        label: "Link Account",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_HELP,
                        label: "Help Guide",
                    },
                ],
            },
        ],
    };
}

/**
 * Main minimalist dashboard embed
 */
function buildTokenRequiredEmbed(hasLinkedToken = false) {
    const descLines = [
        "## Quest & Badge Control Center",
        "Select an action below or browse the command reference.",
        "",
        hasLinkedToken
            ? "**Account Status:** Linked and ready for automation."
            : "**Account Status:** No linked account. Click Link Account below.",
        "",
        "• **Quests:** Auto-complete active Discord quests with your saved account.",
        "• **Status:** Check progress, remaining time, and eligible rewards.",
        "• **Badges:** Simulate game playtime hours and live streaming telemetry.",
        "• **Rich Presence:** Display custom game status for VALORANT, VS Code, and more.",
        "",
        "*Security Note: Tokens can only be submitted via private modal.*",
    ];

    return {
        embeds: [
            {
                color: COLOR_PRIMARY,
                author: { name: "QUEST CONTROL / DASHBOARD" },
                title: "Automation Hub",
                description: descLines.join("\n"),
                footer: { text: "Quest Control • Minimalist Interface" },
                timestamp: new Date().toISOString(),
            },
        ],
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Primary,
                        custom_id: BTN_RUN,
                        label: "Run Quests",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_STATUS,
                        label: "Check Status",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_PRESENCE_MENU,
                        label: "Rich Presence",
                    },
                    {
                        type: ComponentType.Button,
                        style: hasLinkedToken ? ButtonStyle.Secondary : ButtonStyle.Success,
                        custom_id: BTN_LINK,
                        label: hasLinkedToken ? "Linked Account" : "Link Account",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_HELP,
                        label: "Help Guide",
                    },
                ],
            },
        ],
    };
}

/**
 * Embed displaying linked user account status
 */
function buildLinkEmbed(userRecord) {
    if (userRecord) {
        const maskedToken =
            userRecord.token.length > 10
                ? `${userRecord.token.slice(0, 6)}...${userRecord.token.slice(-4)}`
                : "••••••••";

        const descLines = [
            "## Discord Account Linked",
            "Your user token is stored in the local secure JSON database.",
            "You do not need to enter your token again.",
            "",
            `• **Account:** ${userRecord.username || "Linked User"} (\`${userRecord.userId}\`)`,
            `• **Token:** \`${maskedToken}\``,
            `• **Note:** ${userRecord.notes || "None"}`,
            `• **Linked:** ${userRecord.linkedAt ? `<t:${Math.floor(new Date(userRecord.linkedAt).getTime() / 1000)}:R>` : "Recently"}`,
            "",
            "## Quick Actions Available",
            "• `!quest run` — auto-complete available quests",
            "• `!quest status` — check quest progress and rewards",
            "• `!presence valorant` — set VALORANT rich presence",
            "• `!presence vscode` — set Visual Studio Code rich presence",
            "• `!badge playtime <hours>` — boost profile game playtime badge",
            "• `!badge stream <hours>` — boost live streaming badge",
        ];

        return {
            embeds: [
                {
                    color: COLOR_SUCCESS,
                    author: { name: "QUEST CONTROL / ACCOUNT" },
                    title: "Account Overview",
                    description: descLines.join("\n"),
                    footer: { text: "Quest Control • Stored securely in JSON database" },
                    timestamp: new Date().toISOString(),
                },
            ],
            components: [
                {
                    type: ComponentType.ActionRow,
                    components: [
                        {
                            type: ComponentType.Button,
                            style: ButtonStyle.Primary,
                            custom_id: BTN_LINK,
                            label: "Update Token",
                        },
                        {
                            type: ComponentType.Button,
                            style: ButtonStyle.Secondary,
                            custom_id: BTN_PRESENCE_MENU,
                            label: "Rich Presence",
                        },
                        {
                            type: ComponentType.Button,
                            style: ButtonStyle.Danger,
                            custom_id: BTN_LINK_UNLINK,
                            label: "Unlink Account",
                        },
                    ],
                },
            ],
        };
    }

    const descLines = [
        "## Link Your Discord Account",
        "Link your Discord account token once to enable token-free automation.",
        "Tokens must be entered inside the private pop-up modal only.",
        "",
        "## Features for Linked Accounts",
        "• Auto-complete Discord quests in background.",
        "• Boost Discord profile game playtime and live streaming badges.",
        "• Custom rich presence for VALORANT, Visual Studio Code, and Minecraft.",
        "• Safe and private modal entry.",
    ];

    return {
        embeds: [
            {
                color: COLOR_PRIMARY,
                author: { name: "QUEST CONTROL / ACCOUNT LINKING" },
                title: "Connect Account",
                description: descLines.join("\n"),
                footer: { text: "Quest Control • Private modal authentication" },
                timestamp: new Date().toISOString(),
            },
        ],
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Primary,
                        custom_id: BTN_LINK,
                        label: "Open Link Modal",
                    },
                ],
            },
        ],
    };
}

/**
 * Dedicated Presence Games Catalog Embed (Only for rich presence, separate from badge spoofer)
 */
function buildPresenceGamesEmbed() {
    const games = getPresenceGamesList().filter((g) => g.key !== "custom");
    const lines = games.map((g, idx) => {
        const typeLabel = g.type === 1 ? "Streaming" : "Playing";
        const idInfo = g.applicationId ? `ID: \`${g.applicationId}\`` : "Twitch URL";
        return `• **${idx + 1}. ${g.label || g.name}** (\`${g.key}\`)\n  *${g.details || typeLabel}* — ${g.state || "Active"} • ${idInfo}`;
    });

    return {
        embeds: [
            {
                color: COLOR_PRIMARY,
                author: { name: "QUEST CONTROL / RICH PRESENCE CATALOG" },
                title: "Presence-Only Games Catalog",
                description: [
                    "Dedicated list of games available for Discord Rich Presence on your linked account.",
                    "This list is separate from badge spoofer games.",
                    "",
                    "## How to Set Presence",
                    "• Use `!presence <key>` (e.g. `!presence valorant`, `!presence cs2`, `!presence fortnite`)",
                    "• Pass custom details: `!presence valorant Match Point (12-11)`",
                    "• Or use the interactive dropdown in `!presence`",
                    "",
                    "## Supported Presence Games",
                    lines.join("\n"),
                ].join("\n"),
                footer: { text: "Quest Control • Rich Presence Only" },
                timestamp: new Date().toISOString(),
            },
        ],
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Primary,
                        custom_id: BTN_PRESENCE_MENU,
                        label: "Open Dashboard",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_PRESENCE_VALORANT,
                        label: "VALORANT",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_PRESENCE_VSCODE,
                        label: "VS Code",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Danger,
                        custom_id: BTN_PRESENCE_CLEAR,
                        label: "Turn Off Presence",
                    },
                ],
            },
        ],
    };
}

/**
 * Rich Presence Management Embed
 */
function buildPresenceEmbed(userId, activePresence = null) {
    const isPlaying = Boolean(activePresence);
    const descLines = [
        "## Custom Rich Presence Manager",
        "Spoof custom game and application presence on your linked Discord account.",
        "",
        isPlaying
            ? `**Active Status:** Playing **${activePresence.presetName}** (\`${activePresence.presetKey}\`)\n• **Details:** ${activePresence.activity?.details || "None"}\n• **State:** ${activePresence.activity?.state || "Active"}\n• **Started:** <t:${Math.floor(activePresence.startedAt / 1000)}:R>`
            : "**Active Status:** No custom presence currently active.",
        "",
        "## Select a Game Preset Below",
        "• Choose a game from the dropdown menu to activate presence instantly.",
        "• View all presence titles with `!presence games` or click **All Games List** below.",
        "• Custom details: `!presence <game> [details] [state]`",
    ];

    const selectOptions = [
        { label: "VALORANT", value: "valorant", description: "Competitive match - In Game" },
        { label: "Visual Studio Code", value: "vscode", description: "Editing workspace files" },
        { label: "Counter-Strike 2", value: "cs2", description: "Premier Matchmaking - Dust II" },
        { label: "Fortnite", value: "fortnite", description: "Battle Royale (Duo)" },
        { label: "Minecraft", value: "minecraft", description: "Survival Multiplayer Realm" },
        { label: "Grand Theft Auto V", value: "gta5", description: "GTA Online Freemode Session" },
        { label: "Roblox", value: "roblox", description: "Playing Blox Fruits" },
        { label: "League of Legends", value: "league", description: "Summoner's Rift (Ranked)" },
        { label: "Apex Legends", value: "apex", description: "Ranked Leagues - Drop Ship" },
        { label: "Overwatch 2", value: "overwatch2", description: "Competitive Role Queue" },
        { label: "Genshin Impact", value: "genshin", description: "Exploring Teyvat" },
        { label: "Call of Duty: Warzone", value: "warzone", description: "Battle Royale Quads" },
        { label: "Cyberpunk 2077", value: "cyberpunk", description: "Exploring Night City" },
        { label: "Rust", value: "rust", description: "Official Server Survival" },
        { label: "Rocket League", value: "rocketleague", description: "Competitive 2v2" },
        { label: "Rainbow Six Siege", value: "r6s", description: "Ranked Match (Defending)" },
        { label: "Twitch Stream", value: "stream", description: "Live broadcast status" },
        { label: "Clear Presence", value: "clear", description: "Turn off and restore regular presence" },
    ];

    return {
        embeds: [
            {
                color: isPlaying ? COLOR_SUCCESS : COLOR_NEUTRAL,
                author: { name: "QUEST CONTROL / RICH PRESENCE" },
                title: "Custom Game Presence",
                description: descLines.join("\n"),
                footer: { text: "Quest Control • Discord Gateway Opcode 3" },
                timestamp: new Date().toISOString(),
            },
        ],
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.StringSelect,
                        custom_id: SELECT_PRESENCE_GAME,
                        placeholder: "Choose a game from the presence catalog...",
                        options: selectOptions,
                    },
                ],
            },
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Primary,
                        custom_id: BTN_PRESENCE_VALORANT,
                        label: "VALORANT",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Primary,
                        custom_id: BTN_PRESENCE_VSCODE,
                        label: "VS Code",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_PRESENCE_GAMES,
                        label: "All Games List",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Danger,
                        custom_id: BTN_PRESENCE_CLEAR,
                        label: "Turn Off Presence",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_PRESENCE_MENU,
                        label: "Refresh Status",
                    },
                ],
            },
        ],
    };
}

/**
 * Interactive Help Embed using String Select Menu
 */
function buildHelpEmbed(category = "help_overview") {
    let title = "Command Center";
    let descLines = [];

    switch (category) {
        case "help_quests":
            title = "Quest Automation Guide";
            descLines = [
                "## Quest Automation",
                "Automatically complete Discord quests for in-game rewards, avatar items, and orbs.",
                "",
                "• `/run-quests` — execute auto-completion for all active quests",
                "• `/quest-status` — inspect quest progress, target minutes, and rewards",
                "• `!quest run` — prefix command to auto-complete quests",
                "• `!quest status` — prefix command to check status",
                "• `!quest panel` — open the interactive button dashboard",
                "",
                "## Supported Quest Types",
                "• Desktop Playtime (15 min)",
                "• Mobile Video Quests",
                "• Discord Activities & Games",
                "• Desktop Screen Sharing & Streaming",
            ];
            break;

        case "help_badges":
            title = "Discord Badges & Telemetry";
            descLines = [
                "## Profile Badges & Science Telemetry",
                "Simulate legitimate Discord client telemetry to qualify for profile badges.",
                "",
                "• `!badge playtime <hours> [game]` — boost game playtime badge",
                "• `!badge stream <hours> [game]` — boost live streaming badge",
                "• `!badge variety <count>` — simulate up to 50 distinct games",
                "• `!badge all <hours>` — boost both playtime and streaming badges",
                "• `!badge games` — list supported detectable games and IDs",
                "• `/spoof-playtime` / `/spoof-stream` / `/spoof-variety` — slash commands",
                "",
                "## Profile Sync Time",
                "Discord processes badge telemetry asynchronously in backend batches.",
                "Badges typically reflect on your Discord profile within 24 to 48 hours.",
            ];
            break;

        case "help_presence":
            title = "Custom Rich Presence";
            descLines = [
                "## Game Rich Presence Spoofing",
                "Display rich presence for verified detectable games directly on your user account.",
                "",
                "• `!presence games` or `/presence list` — view the dedicated Presence Games list",
                "• `!presence <game>` — activate presence (e.g. `!presence valorant`, `!presence cs2`, `!presence fortnite`)",
                "• `!presence <game> <details> <state>` — pass custom details and state",
                "• `!presence clear` — turn off rich presence",
                "• `!presence` — open the interactive presence control panel with dropdown",
                "• `/presence game preset:<game>` — slash command to set presence",
                "• `/presence status` / `/presence clear` — manage via slash commands",
                "",
                "*Note: Presence games are exclusively for profile status, separate from badge spoofer.*",
            ];
            break;

        case "help_account":
            title = "Account Management & Security";
            descLines = [
                "## Account Management",
                "Manage your linked Discord account token and security credentials.",
                "",
                "• `!link` or `/link` — open private modal to link your token",
                "• `!unlink` or `/unlink` — remove your token from the bot database",
                "• `!whoami` or `/whoami` — inspect linked account details",
                "",
                "## Token Safety",
                "• Plain text tokens typed in chat are deleted automatically.",
                "• All tokens must be submitted through private Discord modals.",
                "• Credentials are stored locally in the bot's private JSON database.",
            ];
            break;

        case "help_admin":
            title = "Server Administration";
            descLines = [
                "## Server Administration",
                "Configure bot channels and announcement broadcasts for your server.",
                "",
                "• `!channel-set quest <#channel>` — lock quest commands to channel",
                "• `!channel-set badges <#channel>` — lock badge commands to channel",
                "• `!channel-set <quest/badges> reset` — clear channel restriction",
                "• `!channel-set` — view current server channel configuration",
                "• `!sync [guildId]` — register instant slash commands",
                "• `!stats` — view bot uptime, memory usage, and gateway status",
                "• `!announce <quest_name> [details]` — broadcast DM notification to registered members",
            ];
            break;

        case "help_overview":
        default:
            title = "Command Center Overview";
            descLines = [
                "## Getting Started",
                "Welcome to Quest Control. This bot automates Discord Quests, profile badges, and rich presence.",
                "",
                "## Step 1: Link Your Account",
                "Click **Link Account** below to enter your user token in a private modal.",
                "",
                "## Step 2: Use Token-Free Commands",
                "Once linked, execute any command or click interactive buttons with 1 click.",
                "",
                "## Browse Help Categories",
                "Use the select menu below to view specific command guides:",
                "• Quest Automation",
                "• Discord Badges & Telemetry",
                "• Custom Rich Presence",
                "• Account & Security",
                "• Server Administration",
            ];
            break;
    }

    return {
        embeds: [
            {
                color: COLOR_NEUTRAL,
                author: { name: "QUEST CONTROL / COMMAND REFERENCE" },
                title,
                description: descLines.join("\n"),
                footer: { text: "Quest Control • Clean Minimalist UI" },
                timestamp: new Date().toISOString(),
            },
        ],
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.StringSelect,
                        custom_id: SELECT_HELP_CATEGORY,
                        placeholder: "Select a help topic to view...",
                        options: [
                            {
                                label: "Overview & Getting Started",
                                value: "help_overview",
                                description: "Quick start and account linking guide",
                                default: category === "help_overview",
                            },
                            {
                                label: "Quest Automation",
                                value: "help_quests",
                                description: "Completing desktop, mobile, and stream quests",
                                default: category === "help_quests",
                            },
                            {
                                label: "Discord Badges & Spoofing",
                                value: "help_badges",
                                description: "Game playtime and live streaming telemetry",
                                default: category === "help_badges",
                            },
                            {
                                label: "Custom Rich Presence",
                                value: "help_presence",
                                description: "VALORANT, VS Code, and game status spoofing",
                                default: category === "help_presence",
                            },
                            {
                                label: "Account Management",
                                value: "help_account",
                                description: "Token linking, status check, and unlinking",
                                default: category === "help_account",
                            },
                            {
                                label: "Server Administration",
                                value: "help_admin",
                                description: "Channel locks and announcement notifications",
                                default: category === "help_admin",
                            },
                        ],
                    },
                ],
            },
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Success,
                        custom_id: BTN_LINK,
                        label: "Link Account",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Primary,
                        custom_id: BTN_RUN,
                        label: "Run Quests",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_STATUS,
                        label: "Check Status",
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_PRESENCE_MENU,
                        label: "Rich Presence",
                    },
                ],
            },
        ],
    };
}

/**
 * Detectable games catalog embed
 */
function buildBadgeGamesEmbed() {
    const list = POPULAR_GAMES.slice(0, 20)
        .map((g, i) => `• **${i + 1}. ${g.name}** — \`${g.id}\``)
        .join("\n");

    return {
        embeds: [
            {
                color: COLOR_NEUTRAL,
                author: { name: "QUEST CONTROL / DETECTABLE GAMES" },
                title: "Supported Detectable Games",
                description: [
                    "Discord tracks profile badges for verified detectable games. Here are the top titles supported for spoofing:",
                    "",
                    list,
                    "",
                    "*Use `!badge playtime <hours> [game]` to boost playtime.*",
                ].join("\n"),
                footer: { text: "Quest Control • Discord Detectable Catalog" },
                timestamp: new Date().toISOString(),
            },
        ],
    };
}

/**
 * Ping / System status embed
 */
function buildPingEmbed(latency = 0) {
    return {
        embeds: [
            {
                color: COLOR_NEUTRAL,
                author: { name: "QUEST CONTROL / SYSTEM" },
                title: "System Operational",
                description: [
                    "All services and gateway connections are online.",
                    "",
                    `• **Gateway Status:** ${isBotConnected ? "Online" : "Standby"}`,
                    `• **API Latency:** ${latency}ms`,
                    `• **Bot Uptime:** ${Math.floor(process.uptime() / 60)} minutes`,
                    `• **HTTP Port:** ${HTTP_PORT}`,
                ].join("\n"),
                footer: { text: "Quest Control • System Diagnostics" },
                timestamp: new Date().toISOString(),
            },
        ],
    };
}

/**
 * Quest completion announcement embed
 */
function buildQuestAnnouncementEmbed(questName, details) {
    return {
        color: COLOR_PRIMARY,
        author: { name: "QUEST CONTROL / NEW QUEST" },
        title: `New Quest Available: ${questName}`,
        description:
            "A new Discord Quest is available to complete." +
            (details ? `\n\n${details}` : ""),
        footer: { text: "Quest Control • Quest Notifications" },
        timestamp: new Date().toISOString(),
    };
}

function rememberQuestUser(guildId, userId) {
    if (!guildId || !userId) return;
    try {
        recordQuestUser(questAudience, guildId, userId);
    } catch (error) {
        console.error("Could not record quest notification recipient:", error);
    }
}

async function sendQuestAnnouncement(userId, questName, details) {
    const dm = await rest.post("/users/@me/channels", {
        body: { recipient_id: userId },
    });
    await rest.post(`/channels/${dm.id}/messages`, {
        body: {
            embeds: [buildQuestAnnouncementEmbed(questName, details)],
            allowed_mentions: { parse: [] },
        },
    });
}

/**
 * Private Modal Builder for Discord user token entry
 */
function buildLinkModal() {
    return {
        title: "Link Discord Account Token",
        custom_id: MODAL_LINK,
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.TextInput,
                        style: TextInputStyle.Short,
                        custom_id: INPUT_LINK_TOKEN,
                        label: "Your Discord user token",
                        placeholder: "Paste your Discord user token here",
                        required: true,
                        min_length: 20,
                    },
                ],
            },
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.TextInput,
                        style: TextInputStyle.Short,
                        custom_id: INPUT_LINK_NOTE,
                        label: "Account Nickname / Note (Optional)",
                        placeholder: "e.g. Main Account",
                        required: false,
                        max_length: 50,
                    },
                ],
            },
        ],
    };
}

/**
 * Embed for completed quest
 */
function buildCompleteEmbed(quest) {
    const cfg = quest.config;
    const questName = cfg.messages.quest_name;
    const gameTitle = cfg.messages.game_title;
    const publisher = cfg.messages.game_publisher;
    const appId = cfg.application.id;

    const tasks = cfg.task_config_v2?.tasks ?? {};
    const taskLines = Object.entries(tasks)
        .map(
            ([k, v]) =>
                `• ${TASK_LABELS[k] ?? k}: ${Math.ceil((v?.target ?? 0) / 60)} min (Completed)`,
        )
        .join("\n");

    const expiresAt = new Date(cfg.expires_at);
    const expiresUnix = Math.floor(expiresAt.getTime() / 1000);
    const daysLeft = Math.max(
        0,
        Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000),
    );

    const rewards = cfg.rewards_config?.rewards ?? [];
    const rewardLines = rewards
        .map((r) =>
            r.orb_quantity
                ? `${r.orb_quantity} Orbs (${r.messages?.name ?? ""})`
                : (r.messages?.name ?? ""),
        )
        .join("\n");

    const gameTile = cfg.assets?.game_tile;
    const thumbnail = gameTile
        ? {
              url: `https://media.discordapp.net/app-assets/${appId}/store/${gameTile}.png`,
          }
        : undefined;

    const descLines = [
        `## ${questName}`,
        `*${gameTitle} • ${publisher}*`,
        "",
        "**Task Requirements:**",
        taskLines || "• Standard task completion",
        "",
        `• **Progress:** 100% (Completed)`,
        `• **Expires:** <t:${expiresUnix}:R> (${daysLeft}d remaining)`,
    ];
    if (rewardLines) {
        descLines.push(`• **Reward:** ${rewardLines}`);
    }

    const embed = {
        color: COLOR_SUCCESS,
        author: { name: "QUEST CONTROL / COMPLETION" },
        title: "Quest Completed Successfully",
        description: descLines.join("\n"),
        footer: { text: "Quest Control • Completion Report" },
        timestamp: new Date().toISOString(),
    };
    if (thumbnail) embed.thumbnail = thumbnail;
    return embed;
}

/**
 * Embed for live quest status
 */
function buildStatusEmbed(info) {
    const taskLabel = TASK_LABELS[info.taskName] ?? info.taskName;
    const targetMins = Math.ceil(info.targetSeconds / 60);
    const doneMins = Math.ceil(info.doneSeconds / 60);
    const expiresUnix = Math.floor(info.expiresAt.getTime() / 1000);
    const daysLeft = Math.max(
        0,
        Math.ceil((info.expiresAt.getTime() - Date.now()) / 86_400_000),
    );

    const statusText = info.isCompleted
        ? "Completed"
        : info.isEnrolled
          ? "In Progress"
          : "Not Enrolled";

    const rewardText = info.orbQuantity
        ? `${info.orbQuantity} Orbs (${info.rewardName})`
        : info.rewardName;

    const thumbnail = info.gameTileAsset
        ? {
              url: `https://media.discordapp.net/app-assets/${info.appId}/store/${info.gameTileAsset}.png`,
          }
        : undefined;

    const descLines = [
        `## ${info.name}`,
        `*${info.gameTitle} • ${info.publisher}*`,
        "",
        `• **Task:** ${taskLabel} (${targetMins} min)`,
        `• **Progress:** ${info.progressPct}% (${doneMins}/${targetMins} min) — ${statusText}`,
        `• **Expires:** <t:${expiresUnix}:R> (${daysLeft}d left)`,
        `• **Reward:** ${rewardText}`,
    ];

    const embed = {
        color: info.isCompleted ? COLOR_SUCCESS : COLOR_NEUTRAL,
        author: { name: "QUEST CONTROL / STATUS" },
        title: info.name,
        description: descLines.join("\n"),
        footer: { text: "Quest Control • Live Quest Status" },
        timestamp: new Date().toISOString(),
    };
    if (thumbnail) embed.thumbnail = thumbnail;
    return embed;
}

function formatError(err) {
    const blockedMatch = err.match(/blocked until (.+?)\.?$/i);
    if (blockedMatch) {
        const unixTs = Math.floor(new Date(blockedMatch[1]).getTime() / 1000);
        if (!isNaN(unixTs)) {
            return `**Quest enrollment temporarily blocked by Discord until:** <t:${unixTs}:F> (<t:${unixTs}:R>)`;
        }
    }
    if (
        /401|unauthorized/i.test(err) ||
        /invalid.*token|token.*invalid/i.test(err)
    ) {
        return "**Invalid or expired token.** Please use `!link` or `/link` to update your token.";
    }
    if (/token is required/i.test(err)) {
        return "**Token required.** Please link your account first using `!link`.";
    }
    if (/rate.?limit/i.test(err)) {
        return "**Rate limited by Discord.** Please wait a few moments and try again.";
    }
    return `**Error:** \`${err}\``;
}

async function sendQuestEmbed(channelId, quest) {
    await rest
        .post(`/channels/${channelId}/messages`, {
            body: { embeds: [buildCompleteEmbed(quest)] },
        })
        .catch((e) =>
            console.error("Failed to send quest embed:", e.message),
        );
}

async function sendStatusEmbeds(channelId, token, mentionUser) {
    const working = await rest
        .post(`/channels/${channelId}/messages`, {
            body: {
                content: `${mentionUser ? `<@${mentionUser}> ` : ""}Fetching quest status...`,
            },
        })
        .catch(() => null);

    const { quests, error } = await fetchQuestsStatus(token);

    if (error) {
        await rest
            .patch(`/channels/${channelId}/messages/${working?.id}`, {
                body: {
                    content: `${mentionUser ? `<@${mentionUser}> ` : ""}${formatError(error)}`,
                },
            })
            .catch(() => {});
        return;
    }

    if (working?.id) {
        await rest
            .delete(`/channels/${channelId}/messages/${working.id}`)
            .catch(() => {});
    }

    if (quests.length === 0) {
        await rest
            .post(`/channels/${channelId}/messages`, {
                body: {
                    content: `${mentionUser ? `<@${mentionUser}> ` : ""}No active quests found.`,
                },
            })
            .catch(() => {});
        return;
    }

    await rest
        .post(`/channels/${channelId}/messages`, {
            body: {
                content: `${mentionUser ? `<@${mentionUser}> ` : ""}**Active Quests (${quests.length}):**`,
            },
        })
        .catch(() => {});

    for (const info of quests) {
        await rest
            .post(`/channels/${channelId}/messages`, {
                body: { embeds: [buildStatusEmbed(info)] },
            })
            .catch(() => {});
    }
}

// ── Register Slash Commands ───────────────────────────────────────────────────
async function registerCommands(targetGuildId, customBotToken, customClientId) {
    const token = (customBotToken && customBotToken.trim()) || BOT_TOKEN;
    const clientId = (customClientId && customClientId.trim()) || CLIENT_ID;

    if (!token || !clientId || !isRealConfigToken(token) || !isRealConfigToken(clientId)) {
        throw new Error("Discord Bot Token or Client ID is missing or placeholder.");
    }

    const restClient = new REST({ version: "10" }).setToken(token);

    const commands = [
        {
            name: "link",
            description: "Link your Discord user token via private modal",
        },
        {
            name: "unlink",
            description: "Remove your saved Discord token from the database",
        },
        {
            name: "whoami",
            description: "View your currently linked Discord account and status",
        },
        {
            name: "run-quests",
            description: "Auto-complete your Discord quests (requires linked account)",
        },
        {
            name: "quest-status",
            description: "Check your active quests and progress (requires linked account)",
        },
        {
            name: "spoof-playtime",
            description: "Boost your Game Time badge hours on your Discord profile",
            options: [
                {
                    name: "hours",
                    description: "Playtime hours to simulate (default: 100)",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "game",
                    description: "Specific game to boost",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                    choices: [
                        { name: "League of Legends", value: "356869127241072640" },
                        { name: "VALORANT", value: "700136079562375258" },
                        { name: "Minecraft", value: "432980957394370572" },
                        { name: "Grand Theft Auto V", value: "367827983903424512" },
                        { name: "Counter-Strike 2", value: "733852150177726474" },
                        { name: "Fortnite", value: "432980957394370560" },
                        { name: "Apex Legends", value: "532296478954717194" },
                        { name: "Roblox", value: "433010738367922186" },
                        { name: "Cyberpunk 2077", value: "752943263442141235" },
                        { name: "Overwatch 2", value: "356875221078245376" },
                    ],
                },
            ],
        },
        {
            name: "spoof-stream",
            description: "Boost your Streaming badge by simulating live stream telemetry",
            options: [
                {
                    name: "hours",
                    description: "Streaming hours to simulate (default: 50)",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "game",
                    description: "Specific game to stream",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "spoof-variety",
            description: "Boost your Game Variety badge by simulating many different games",
            options: [
                {
                    name: "games",
                    description: "Number of distinct games to simulate (10 - 50)",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
            ],
        },
        {
            name: "presence",
            description: "Manage custom rich presence for VALORANT, VS Code, and more",
            options: [
                {
                    name: "game",
                    description: "Set game rich presence",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [
                        {
                            name: "preset",
                            description: "Game preset to spoof",
                            type: ApplicationCommandOptionType.String,
                            required: true,
                            choices: [
                                { name: "VALORANT", value: "valorant" },
                                { name: "Visual Studio Code", value: "vscode" },
                                { name: "Counter-Strike 2", value: "cs2" },
                                { name: "Fortnite", value: "fortnite" },
                                { name: "Minecraft", value: "minecraft" },
                                { name: "Grand Theft Auto V", value: "gta5" },
                                { name: "Roblox", value: "roblox" },
                                { name: "League of Legends", value: "league" },
                                { name: "Apex Legends", value: "apex" },
                                { name: "Overwatch 2", value: "overwatch2" },
                                { name: "Genshin Impact", value: "genshin" },
                                { name: "Warzone", value: "warzone" },
                                { name: "Cyberpunk 2077", value: "cyberpunk" },
                                { name: "Rust", value: "rust" },
                                { name: "Rocket League", value: "rocketleague" },
                                { name: "Rainbow Six Siege", value: "r6s" },
                                { name: "Twitch Stream", value: "stream" },
                            ],
                        },
                        {
                            name: "details",
                            description: "Custom details line",
                            type: ApplicationCommandOptionType.String,
                            required: false,
                        },
                        {
                            name: "state",
                            description: "Custom state line",
                            type: ApplicationCommandOptionType.String,
                            required: false,
                        },
                    ],
                },
                {
                    name: "list",
                    description: "View the dedicated list of games available for Rich Presence",
                    type: ApplicationCommandOptionType.Subcommand,
                },
                {
                    name: "status",
                    description: "View current rich presence status",
                    type: ApplicationCommandOptionType.Subcommand,
                },
                {
                    name: "clear",
                    description: "Turn off custom rich presence",
                    type: ApplicationCommandOptionType.Subcommand,
                },
            ],
        },
        {
            name: "quest-help",
            description: "Open the Quest & Badge command center guide",
        },
        {
            name: "quest-ping",
            description: "Check whether the bot is online",
        },
        {
            name: "set",
            description: "Configure Quest Control for this server",
            dm_permission: false,
            default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
            options: [
                {
                    name: "channel",
                    description: "Choose the only channel where quest commands work",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [
                        {
                            name: "target",
                            description: "Channel to use (defaults to this channel)",
                            type: ApplicationCommandOptionType.Channel,
                            channel_types: [ChannelType.GuildText],
                            required: false,
                        },
                    ],
                },
            ],
        },
        {
            name: "reset",
            description: "Disable quest commands for this server",
            dm_permission: false,
            default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
            options: [
                {
                    name: "channel",
                    description: "Clear the configured quest channel",
                    type: ApplicationCommandOptionType.Subcommand,
                },
            ],
        },
        {
            name: "quest-notify",
            description: "Choose whether you receive new quest announcement DMs",
            dm_permission: false,
            options: [
                {
                    name: "on",
                    description: "Receive new quest announcement DMs",
                    type: ApplicationCommandOptionType.Subcommand,
                },
                {
                    name: "off",
                    description: "Stop receiving new quest announcement DMs",
                    type: ApplicationCommandOptionType.Subcommand,
                },
                {
                    name: "status",
                    description: "Check whether new quest announcement DMs are enabled",
                    type: ApplicationCommandOptionType.Subcommand,
                },
            ],
        },
        {
            name: "quest-announce",
            description: "DM a new quest announcement to this server's bot users",
            dm_permission: false,
            default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
            options: [
                {
                    name: "quest",
                    description: "Name of the new quest",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                    max_length: 100,
                },
                {
                    name: "details",
                    description: "Optional quest details",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                    max_length: 1000,
                },
            ],
        },
    ];

    try {
        await restClient.put(`/applications/${clientId}/commands`, { body: commands });
        console.log(`[Discord Bot] Registered ${commands.length} global slash commands.`);
    } catch (err) {
        console.error("[Discord Bot] Global slash command registration failed:", err.message);
        throw err;
    }

    const guildId = targetGuildId || config.guildId;
    if (guildId) {
        try {
            await restClient.put(`/applications/${clientId}/guilds/${guildId}/commands`, { body: commands });
            console.log(`[Discord Bot] Registered guild slash commands for guild ${guildId} (instant).`);
        } catch (err) {
            console.warn(`[Discord Bot] Guild slash command registration failed for ${guildId}:`, err.message);
        }
    }

    return { success: true, count: commands.length };
}

// ── Core run + report helper ──────────────────────────────────────────────────
async function runAndReport(userToken, channelId, sendInitial, editFinal) {
    await sendInitial();

    const result = await runQuestsForToken(userToken, (quest) =>
        sendQuestEmbed(channelId, quest),
    ).catch((err) => ({
        output: "",
        error: err.message ?? String(err),
        questsFound: 0,
        questsCompleted: 0,
    }));

    let content;
    if (result.error) {
        content = formatError(result.error);
    } else if (result.questsFound === 0) {
        content = "No active quests available to complete right now.";
    } else {
        content = `Found **${result.questsFound}** quest(s) — **${result.questsCompleted}** completed successfully!`;
    }

    await editFinal(content.slice(0, 2000));
}

// ── Cooldown System ───────────────────────────────────────────────────────────
const COOLDOWN_MS = 60_000;
const activeUsers = new Set();
const lastRunAt = new Map();

function checkCooldown(userId) {
    if (activeUsers.has(userId)) {
        return {
            blocked: true,
            reason: "Your quest or badge task is already in progress, please wait for it to finish.",
        };
    }
    const last = lastRunAt.get(userId);
    if (last) {
        const elapsed = Date.now() - last;
        if (elapsed < COOLDOWN_MS) {
            const left = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
            return {
                blocked: true,
                reason: `Cooldown active. Please wait **${left}s** before running again.`,
            };
        }
    }
    return { blocked: false };
}

function startRun(userId) {
    activeUsers.add(userId);
    lastRunAt.set(userId, Date.now());
}
function finishRun(userId) {
    activeUsers.delete(userId);
}

async function safeDeleteMessage(api, channelId, messageId) {
    try {
        await api.channels.deleteMessage(channelId, messageId);
    } catch {
        // Ignored if lacking delete permissions
    }
}

// ── Bot Listeners ─────────────────────────────────────────────────────────────
function initBotListeners(client, gateway) {
    // ── Ready ─────────────────────────────────────────────────────────────────
    client.once(GatewayDispatchEvents.Ready, async ({ data }) => {
        console.log(`Bot logged in as @${data.user.username} (${data.user.id})`);
        await registerCommands().catch((e) =>
            console.error("Failed to register commands:", e.message),
        );
        console.log(`Prefix: "${PREFIX}" | Minimalist Components V2 ready`);
    });

    // ── Interactions (Slash, Select Menus, Buttons, Modals) ───────────────────
    client.on(
        GatewayDispatchEvents.InteractionCreate,
        async ({ data: interaction, api }) => {
            const channelId = interaction.channel_id ?? interaction.channel?.id ?? "";
            const guildId = interaction.guild_id;
            const userId = interaction.member?.user?.id ?? interaction.user?.id ?? "";
            const customId = interaction.data?.custom_id;
            const userIsOwner = isOwner(userId);

            // Channel Access Control for Interactions
            const questInteraction =
                (interaction.type === InteractionType.MessageComponent &&
                    [BTN_RUN, BTN_STATUS].includes(customId ?? "")) ||
                (interaction.type === InteractionType.ApplicationCommand &&
                    ["run-quests", "quest-status"].includes(interaction.data?.name));

            if (questInteraction && !userIsOwner) {
                const notice = checkCategoryNotice(categoryChannels, guildId, channelId, "quest");
                if (notice) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        embeds: [{
                            color: COLOR_NEUTRAL,
                            author: { name: "QUEST CONTROL / ACCESS" },
                            title: "Quest Channel Restriction",
                            description: notice,
                            footer: { text: "Quest Control • Channel lock active" },
                        }],
                        flags: 64,
                    });
                    return;
                }
                rememberQuestUser(guildId, userId);
            }

            // ── String Select Menus ───────────────────────────────────────────
            if (
                interaction.type === InteractionType.MessageComponent &&
                interaction.data?.component_type === ComponentType.StringSelect
            ) {
                // Help category dropdown
                if (customId === SELECT_HELP_CATEGORY) {
                    const selectedCategory = interaction.data?.values?.[0] || "help_overview";
                    const helpPayload = buildHelpEmbed(selectedCategory);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        type: InteractionResponseType.UpdateMessage,
                        ...helpPayload,
                    });
                    return;
                }

                // Presence game preset dropdown
                if (customId === SELECT_PRESENCE_GAME) {
                    const selectedPreset = interaction.data?.values?.[0] || "valorant";
                    const token = getUserToken(userId);
                    if (!token) {
                        await api.interactions.reply(interaction.id, interaction.token, {
                            ...buildMustLinkFirstEmbed("rich presence spoofing"),
                            flags: 64,
                        });
                        return;
                    }

                    if (selectedPreset === "clear") {
                        clearUserPresence(userId);
                        const presencePayload = buildPresenceEmbed(userId, null);
                        await api.interactions.reply(interaction.id, interaction.token, {
                            type: InteractionResponseType.UpdateMessage,
                            ...presencePayload,
                        });
                        return;
                    }

                    await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                    try {
                        await setUserPresence(userId, token, selectedPreset);
                        const current = getUserPresence(userId);
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            ...buildPresenceEmbed(userId, current),
                        });
                    } catch (err) {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            content: `Failed to set rich presence: ${err.message}`,
                        });
                    }
                    return;
                }
            }

            // ── Button Clicks ─────────────────────────────────────────────────
            if (interaction.type === InteractionType.MessageComponent) {
                if (customId === BTN_LINK) {
                    await api.interactions.createModal(
                        interaction.id,
                        interaction.token,
                        buildLinkModal(),
                    );
                    return;
                }

                if (customId === BTN_LINK_CHECK) {
                    const rec = getUserRecord(userId);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        ...buildLinkEmbed(rec),
                        flags: 64,
                    });
                    return;
                }

                if (customId === BTN_LINK_UNLINK) {
                    clearUserPresence(userId);
                    const removed = removeUserToken(userId);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: removed
                            ? "Your linked Discord token has been removed from the database and active presence stopped."
                            : "You do not have any linked token in the database.",
                        flags: 64,
                    });
                    return;
                }

                if (customId === BTN_PRESENCE_MENU) {
                    const rec = getUserRecord(userId);
                    if (!rec) {
                        await api.interactions.reply(interaction.id, interaction.token, {
                            ...buildMustLinkFirstEmbed("custom rich presence"),
                            flags: 64,
                        });
                        return;
                    }
                    const activePres = getUserPresence(userId);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        ...buildPresenceEmbed(userId, activePres),
                        flags: 64,
                    });
                    return;
                }

                if (customId === BTN_PRESENCE_VALORANT || customId === BTN_PRESENCE_VSCODE) {
                    const token = getUserToken(userId);
                    if (!token) {
                        await api.interactions.reply(interaction.id, interaction.token, {
                            ...buildMustLinkFirstEmbed("custom rich presence"),
                            flags: 64,
                        });
                        return;
                    }
                    const preset = customId === BTN_PRESENCE_VALORANT ? "valorant" : "vscode";
                    await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                    try {
                        await setUserPresence(userId, token, preset);
                        const current = getUserPresence(userId);
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            ...buildPresenceEmbed(userId, current),
                        });
                    } catch (err) {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            content: `Failed to set presence: ${err.message}`,
                        });
                    }
                    return;
                }

                if (customId === BTN_PRESENCE_GAMES) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        ...buildPresenceGamesEmbed(),
                        flags: 64,
                    });
                    return;
                }

                if (customId === BTN_PRESENCE_CLEAR) {
                    clearUserPresence(userId);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        ...buildPresenceEmbed(userId, null),
                        flags: 64,
                    });
                    return;
                }

                if (customId === BTN_RUN) {
                    const linkedToken = getUserToken(userId);
                    if (!linkedToken) {
                        await api.interactions.reply(interaction.id, interaction.token, {
                            ...buildMustLinkFirstEmbed("quest execution"),
                            flags: 64,
                        });
                        return;
                    }

                    const cd = checkCooldown(userId);
                    if (cd.blocked) {
                        await api.interactions.reply(interaction.id, interaction.token, {
                            content: cd.reason,
                            flags: 64,
                        });
                        return;
                    }

                    await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                    const sendInitial = async () =>
                        api.interactions.editReply(CLIENT_ID, interaction.token, {
                            content: "Quest processing has started...",
                        });
                    const editFinal = async (c) =>
                        void (await api.interactions.editReply(CLIENT_ID, interaction.token, { content: c }));

                    startRun(userId);
                    try {
                        await runAndReport(linkedToken, channelId, sendInitial, editFinal);
                    } finally {
                        finishRun(userId);
                    }
                    return;
                }

                if (customId === BTN_STATUS) {
                    const linkedToken = getUserToken(userId);
                    if (!linkedToken) {
                        await api.interactions.reply(interaction.id, interaction.token, {
                            ...buildMustLinkFirstEmbed("checking quest status"),
                            flags: 64,
                        });
                        return;
                    }

                    await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                    await sendStatusEmbeds(channelId, linkedToken);
                    await api.interactions.editReply(CLIENT_ID, interaction.token, {
                        content: "Quest status report sent above.",
                    });
                    return;
                }

                if (customId === BTN_HELP) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        ...buildHelpEmbed("help_overview"),
                        flags: 64,
                    });
                    return;
                }
                return;
            }

            // ── Modal Submits ─────────────────────────────────────────────────
            if (interaction.type === InteractionType.ModalSubmit) {
                if (customId === MODAL_LINK) {
                    const rows = interaction.data?.components || [];
                    let submittedToken = "";
                    let submittedNote;

                    for (const row of rows) {
                        for (const comp of row?.components || []) {
                            if (comp.custom_id === INPUT_LINK_TOKEN) {
                                submittedToken = comp.value?.trim() || "";
                            } else if (comp.custom_id === INPUT_LINK_NOTE) {
                                submittedNote = comp.value?.trim() || undefined;
                            }
                        }
                    }

                    if (!submittedToken || submittedToken.length < 15) {
                        await api.interactions.reply(interaction.id, interaction.token, {
                            content: "Invalid Discord token format. Please check your token and try again.",
                            flags: 64,
                        });
                        return;
                    }

                    await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                    const verify = await verifyAndFetchDiscordUser(submittedToken);
                    if (!verify.valid) {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            content: `Failed to verify Discord token: ${verify.error || "Invalid user credentials"}. Make sure you copied your full user token.`,
                        });
                        return;
                    }

                    const savedRecord = saveUserToken(userId, {
                        token: submittedToken,
                        username: verify.username,
                        globalName: verify.globalName,
                        discriminator: verify.discriminator,
                        avatar: verify.avatar,
                        notes: submittedNote,
                    });

                    await api.interactions.editReply(CLIENT_ID, interaction.token, {
                        ...buildLinkEmbed(savedRecord),
                    });
                    return;
                }
                return;
            }

            // ── Slash Commands ────────────────────────────────────────────────
            if (interaction.type !== InteractionType.ApplicationCommand) return;
            const cmdData = interaction.data;
            if (cmdData?.type !== ApplicationCommandType.ChatInput) return;

            if (["set", "reset", "quest-announce"].includes(cmdData?.name)) {
                const perms = BigInt(interaction.member?.permissions ?? "0");
                if (
                    !guildId ||
                    !(perms & (PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator))
                ) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: "Only a server admin with Manage Server permission can configure quest channels.",
                        flags: 64,
                    });
                    return;
                }

                if (cmdData.name === "quest-announce") {
                    const questName = cmdData.options?.find((o) => o.name === "quest")?.value?.trim();
                    const details = cmdData.options?.find((o) => o.name === "details")?.value?.trim();
                    if (!questName) {
                        await api.interactions.reply(interaction.id, interaction.token, {
                            content: "Provide a quest name before sending the announcement.",
                            flags: 64,
                        });
                        return;
                    }

                    const recipients = getQuestRecipients(questAudience, guildId);
                    if (recipients.length === 0) {
                        await api.interactions.reply(interaction.id, interaction.token, {
                            content: "No recipients are registered yet in this server.",
                            flags: 64,
                        });
                        return;
                    }

                    await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                    let sent = 0;
                    let failed = 0;
                    for (let index = 0; index < recipients.length; index++) {
                        try {
                            await sendQuestAnnouncement(recipients[index], questName, details);
                            sent++;
                        } catch {
                            failed++;
                        }
                        if (index < recipients.length - 1) {
                            await new Promise((resolve) => setTimeout(resolve, 500));
                        }
                    }
                    await api.interactions.editReply(CLIENT_ID, interaction.token, {
                        embeds: [{
                            color: COLOR_NEUTRAL,
                            author: { name: "QUEST CONTROL / ANNOUNCEMENT" },
                            title: "Quest Announcement Broadcast",
                            description: `Delivered: **${sent}** · Failed: **${failed}** · Total: **${recipients.length}**`,
                            footer: { text: "Quest Control • Announcements" },
                        }],
                    });
                    return;
                }

                if (cmdData.name === "reset") {
                    const removed = removeQuestChannel(questChannels, guildId);
                    removeCategoryChannel(categoryChannels, guildId, "quest");
                    await api.interactions.reply(interaction.id, interaction.token, {
                        embeds: [{
                            color: COLOR_NEUTRAL,
                            author: { name: "QUEST CONTROL / SETTINGS" },
                            title: removed ? "Quest Channel Cleared" : "No Channel Set",
                            description: removed
                                ? "Quest commands are now allowed in any channel."
                                : "No channel restriction was set.",
                        }],
                        flags: 64,
                    });
                    return;
                }

                const subcommand = cmdData.options?.find((o) => o.name === "channel");
                const selected = subcommand?.options?.find((o) => o.name === "target")?.value;
                const targetId = selected ?? channelId;
                saveQuestChannel(questChannels, guildId, targetId);
                saveCategoryChannel(categoryChannels, guildId, "quest", targetId);
                await api.interactions.reply(interaction.id, interaction.token, {
                    embeds: [{
                        color: COLOR_NEUTRAL,
                        author: { name: "QUEST CONTROL / SETTINGS" },
                        title: "Quest Channel Saved",
                        description: `Quest commands now work only in <#${targetId}>.`,
                    }],
                    flags: 64,
                });
                return;
            }

            if (cmdData?.name === "quest-notify") {
                if (!guildId) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: "Use this command inside a server.",
                        flags: 64,
                    });
                    return;
                }
                const subcommand = cmdData.options?.[0]?.name;
                if (subcommand === "status") {
                    const enabled = getQuestRecipients(questAudience, guildId).includes(userId);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        embeds: [{
                            color: COLOR_NEUTRAL,
                            author: { name: "QUEST CONTROL / NOTIFICATIONS" },
                            title: enabled ? "Quest Notifications Active" : "Quest Notifications Inactive",
                            description: enabled
                                ? "You will receive new quest announcements sent by server admins."
                                : "Run `/quest-notify on` to receive quest announcement DMs.",
                        }],
                        flags: 64,
                    });
                    return;
                }
                if (subcommand === "on" || subcommand === "off") {
                    setQuestNotification(questAudience, guildId, userId, subcommand === "on");
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: subcommand === "on" ? "Quest announcement DMs enabled." : "Quest announcement DMs disabled.",
                        flags: 64,
                    });
                    return;
                }
                return;
            }

            if (cmdData?.name === "quest-help") {
                await api.interactions.reply(interaction.id, interaction.token, {
                    ...buildHelpEmbed("help_overview"),
                    flags: 64,
                });
                return;
            }

            if (cmdData?.name === "quest-ping") {
                await api.interactions.reply(interaction.id, interaction.token, {
                    ...buildPingEmbed(1),
                    flags: 64,
                });
                return;
            }

            if (cmdData?.name === "link") {
                await api.interactions.createModal(
                    interaction.id,
                    interaction.token,
                    buildLinkModal(),
                );
                return;
            }

            if (cmdData?.name === "unlink") {
                clearUserPresence(userId);
                const removed = removeUserToken(userId);
                await api.interactions.reply(interaction.id, interaction.token, {
                    content: removed
                        ? "Your linked Discord token has been removed from the database."
                        : "You do not have any linked token in the database.",
                    flags: 64,
                });
                return;
            }

            if (cmdData?.name === "whoami") {
                const rec = getUserRecord(userId);
                await api.interactions.reply(interaction.id, interaction.token, {
                    ...buildLinkEmbed(rec),
                    flags: 64,
                });
                return;
            }

            // /presence slash command handling
            if (cmdData?.name === "presence") {
                const effectiveToken = getUserToken(userId);
                if (!effectiveToken) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        ...buildMustLinkFirstEmbed("custom rich presence"),
                        flags: 64,
                    });
                    return;
                }

                const sub = cmdData.options?.[0];
                if (!sub || sub.name === "status") {
                    const current = getUserPresence(userId);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        ...buildPresenceEmbed(userId, current),
                        flags: 64,
                    });
                    return;
                }

                if (sub.name === "list" || sub.name === "games") {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        ...buildPresenceGamesEmbed(),
                        flags: 64,
                    });
                    return;
                }

                if (sub.name === "clear") {
                    clearUserPresence(userId);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        ...buildPresenceEmbed(userId, null),
                        flags: 64,
                    });
                    return;
                }

                if (sub.name === "game") {
                    const preset = sub.options?.find((o) => o.name === "preset")?.value || "valorant";
                    const details = sub.options?.find((o) => o.name === "details")?.value;
                    const state = sub.options?.find((o) => o.name === "state")?.value;

                    await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                    try {
                        await setUserPresence(userId, effectiveToken, preset, { details, state });
                        const current = getUserPresence(userId);
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            ...buildPresenceEmbed(userId, current),
                        });
                    } catch (err) {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            content: `Failed to set presence: ${err.message}`,
                        });
                    }
                    return;
                }
                return;
            }

            // Enforce linked token requirement for all remaining action slash commands
            const effectiveToken = getUserToken(userId);
            if (!effectiveToken) {
                await api.interactions.reply(interaction.id, interaction.token, {
                    ...buildMustLinkFirstEmbed(cmdData?.name),
                    flags: 64,
                });
                return;
            }

            if (cmdData?.name === "quest-status") {
                await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                await sendStatusEmbeds(channelId, effectiveToken);
                await api.interactions.editReply(CLIENT_ID, interaction.token, {
                    content: "Quest status report sent above.",
                });
                return;
            }

            if (cmdData?.name === "run-quests") {
                const cd = checkCooldown(userId);
                if (cd.blocked) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: cd.reason,
                        flags: 64,
                    });
                    return;
                }
                await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                const sendInitial = async () =>
                    api.interactions.editReply(CLIENT_ID, interaction.token, {
                        content: "Quest processing has started...",
                    });
                const editFinal = async (c) =>
                    void (await api.interactions.editReply(CLIENT_ID, interaction.token, { content: c }));

                startRun(userId);
                try {
                    await runAndReport(effectiveToken, channelId, sendInitial, editFinal);
                } finally {
                    finishRun(userId);
                }
                return;
            }

            if (cmdData?.name === "spoof-playtime") {
                const cd = checkCooldown(userId);
                if (cd.blocked) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: cd.reason,
                        flags: 64,
                    });
                    return;
                }

                const targetHours = cmdData.options?.find((o) => o.name === "hours")?.value || 100;
                const targetGame = cmdData.options?.find((o) => o.name === "game")?.value;

                await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                await api.interactions.editReply(CLIENT_ID, interaction.token, {
                    content: `Spoofing Game Time badge (${targetHours} hours)...`,
                });

                startRun(userId);
                try {
                    const spoofRes = await spoofBadges(effectiveToken, {
                        mode: targetGame ? "custom" : "playtime",
                        hours: Number(targetHours),
                        gameIds: targetGame ? [String(targetGame)] : undefined,
                    });

                    if (!spoofRes.success) {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            content: `Badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`,
                        });
                    } else {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            embeds: [
                                {
                                    color: COLOR_SUCCESS,
                                    author: { name: "QUEST CONTROL / BADGE SPOOFER" },
                                    title: "Game Time Badge Spoofed",
                                    description: [
                                        `Successfully registered **${spoofRes.totalHoursSpoofed} hours** across **${spoofRes.gamesSpoofed} game(s)**!`,
                                        "",
                                        `• **Mode:** Game Time Playtime`,
                                        `• **Hours Logged:** ${spoofRes.totalHoursSpoofed}h`,
                                        `• **Profile Sync:** Discord profile badges update in batches within 24 to 48 hours.`,
                                    ].join("\n"),
                                    footer: { text: "Quest Control • Discord Science Telemetry" },
                                    timestamp: new Date().toISOString(),
                                },
                            ],
                        });
                    }
                } finally {
                    finishRun(userId);
                }
                return;
            }

            if (cmdData?.name === "spoof-stream") {
                const cd = checkCooldown(userId);
                if (cd.blocked) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: cd.reason,
                        flags: 64,
                    });
                    return;
                }

                const targetHours = cmdData.options?.find((o) => o.name === "hours")?.value || 50;
                const targetGame = cmdData.options?.find((o) => o.name === "game")?.value;

                await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                await api.interactions.editReply(CLIENT_ID, interaction.token, {
                    content: `Spoofing Streaming badge (${targetHours} stream hours)...`,
                });

                startRun(userId);
                try {
                    const spoofRes = await spoofBadges(effectiveToken, {
                        mode: "stream",
                        hours: Number(targetHours),
                        gameIds: targetGame ? [String(targetGame)] : undefined,
                    });

                    if (!spoofRes.success) {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            content: `Streaming badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`,
                        });
                    } else {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            embeds: [
                                {
                                    color: COLOR_SUCCESS,
                                    author: { name: "QUEST CONTROL / BADGE SPOOFER" },
                                    title: "Streaming Badge Spoofed",
                                    description: [
                                        `Successfully registered **${spoofRes.totalHoursSpoofed} stream hours** across **${spoofRes.gamesSpoofed} title(s)**!`,
                                        "",
                                        `• **Mode:** Live Screenshare and Video Streaming`,
                                        `• **Duration Tracked:** ${spoofRes.totalHoursSpoofed} hours`,
                                        `• **Profile Sync:** Discord profile badges update in batches within 24 to 48 hours.`,
                                    ].join("\n"),
                                    footer: { text: "Quest Control • Discord Science Telemetry" },
                                    timestamp: new Date().toISOString(),
                                },
                            ],
                        });
                    }
                } finally {
                    finishRun(userId);
                }
                return;
            }

            if (cmdData?.name === "spoof-variety") {
                const cd = checkCooldown(userId);
                if (cd.blocked) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: cd.reason,
                        flags: 64,
                    });
                    return;
                }

                const targetGames = cmdData.options?.find((o) => o.name === "games")?.value || 25;

                await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                await api.interactions.editReply(CLIENT_ID, interaction.token, {
                    content: `Spoofing Game Variety badge (${targetGames} games)...`,
                });

                startRun(userId);
                try {
                    const spoofRes = await spoofBadges(effectiveToken, {
                        mode: "variety",
                        gameCount: Number(targetGames),
                        hours: 5,
                    });

                    if (!spoofRes.success) {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            content: `Variety badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`,
                        });
                    } else {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            embeds: [
                                {
                                    color: COLOR_SUCCESS,
                                    author: { name: "QUEST CONTROL / BADGE SPOOFER" },
                                    title: "Game Variety Badge Spoofed",
                                    description: [
                                        `Successfully registered **${spoofRes.gamesSpoofed} distinct detectable games**!`,
                                        "",
                                        `• **Mode:** Game Variety`,
                                        `• **Games Registered:** ${spoofRes.gamesSpoofed} games`,
                                        `• **Profile Sync:** Discord profile badges update in batches within 24 to 48 hours.`,
                                    ].join("\n"),
                                    footer: { text: "Quest Control • Discord Science Telemetry" },
                                    timestamp: new Date().toISOString(),
                                },
                            ],
                        });
                    }
                } finally {
                    finishRun(userId);
                }
                return;
            }
        },
    );

    // ── Prefix Commands: Quests, Badges, Presence, and Admin ─────────────────
    client.on(
        GatewayDispatchEvents.MessageCreate,
        async ({ data: message, api }) => {
            if (message.author.bot) return;
            const raw = message.content?.trim() ?? "";
            if (!raw.startsWith("!")) return;

            const channelId = message.channel_id;
            const guildId = message.guild_id;
            const userId = message.author.id;
            const userIsOwner = isOwner(userId);

            const parts = raw.slice(1).trim().split(/\s+/);
            const command = parts[0]?.toLowerCase() ?? "";
            const subArgs = parts.slice(1);

            const requireOwner = async () => {
                if (userIsOwner) return true;
                await api.channels.createMessage(channelId, {
                    embeds: [{
                        color: COLOR_DANGER,
                        author: { name: "QUEST CONTROL / ACCESS CONTROL" },
                        title: "Access Denied",
                        description: "This command is restricted to configured bot owners.",
                    }],
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return false;
            };

            // ── 1. HELP COMMANDS (!help, !quest help) ─────────────────────────
            if (command === "help" || (command === "quest" && subArgs[0]?.toLowerCase() === "help")) {
                await api.channels.createMessage(channelId, {
                    ...buildHelpEmbed("help_overview"),
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            // ── 2. PING COMMANDS (!ping, !quest ping) ─────────────────────────
            if (command === "ping" || (command === "quest" && subArgs[0]?.toLowerCase() === "ping")) {
                const start = Date.now();
                const sent = await api.channels.createMessage(channelId, {
                    content: "Pinging...",
                    message_reference: { message_id: message.id },
                }).catch(() => null);
                const latency = Date.now() - start;
                if (sent?.id) {
                    await api.channels.editMessage(channelId, sent.id, {
                        content: "",
                        ...buildPingEmbed(latency),
                    }).catch(() => {});
                }
                return;
            }

            // ── 3. RICH PRESENCE (!presence [valorant|vscode|minecraft|stream|clear]) ──
            if (command === "presence") {
                const subCmd = subArgs[0]?.toLowerCase();
                const token = getUserToken(userId);

                if (!token) {
                    await api.channels.createMessage(channelId, {
                        content: `<@${userId}>`,
                        ...buildMustLinkFirstEmbed("custom rich presence"),
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                if (!subCmd || subCmd === "panel" || subCmd === "menu") {
                    const current = getUserPresence(userId);
                    await api.channels.createMessage(channelId, {
                        ...buildPresenceEmbed(userId, current),
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                if (["clear", "off", "stop", "reset"].includes(subCmd)) {
                    clearUserPresence(userId);
                    await api.channels.createMessage(channelId, {
                        content: `<@${userId}> Custom rich presence has been turned off.`,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                if (subCmd === "status") {
                    const current = getUserPresence(userId);
                    await api.channels.createMessage(channelId, {
                        ...buildPresenceEmbed(userId, current),
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                if (subCmd === "games" || subCmd === "list") {
                    await api.channels.createMessage(channelId, {
                        ...buildPresenceGamesEmbed(),
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                // Check if subCmd matches any presence game (key, name, or ID)
                const matchedGame = findPresenceGame(subCmd);
                if (matchedGame && (GAME_PRESETS[subCmd] || PRESENCE_GAMES.some((g) => g.key === subCmd || g.name.toLowerCase() === subCmd))) {
                    const customDetails = subArgs.slice(1).join(" ") || undefined;
                    try {
                        await setUserPresence(userId, token, matchedGame.key, { details: customDetails });
                        const current = getUserPresence(userId);
                        await api.channels.createMessage(channelId, {
                            content: `<@${userId}> Rich presence activated for **${matchedGame.label || matchedGame.name}**!`,
                            ...buildPresenceEmbed(userId, current),
                            message_reference: { message_id: message.id },
                        }).catch(() => {});
                    } catch (err) {
                        await api.channels.createMessage(channelId, {
                            content: `<@${userId}> Failed to set rich presence: ${err.message}`,
                            message_reference: { message_id: message.id },
                        }).catch(() => {});
                    }
                    return;
                }

                await api.channels.createMessage(channelId, {
                    content: "Unknown presence game. Use `!presence games` to view the dedicated Presence Games catalog, or `!presence` to open the control panel.",
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            // ── 4. OWNER: !sync [guildId] ─────────────────────────────────────
            if (command === "sync") {
                if (!await requireOwner()) return;
                const targetGuild = subArgs[0] || guildId;
                const statusMsg = await api.channels.createMessage(channelId, {
                    content: `Synchronizing slash commands ${targetGuild ? `for guild \`${targetGuild}\`` : "globally"}...`,
                    message_reference: { message_id: message.id },
                }).catch(() => null);

                try {
                    const startTime = Date.now();
                    const res = await registerCommands(targetGuild);
                    const elapsed = Date.now() - startTime;
                    if (statusMsg?.id) {
                        await api.channels.editMessage(channelId, statusMsg.id, {
                            content: "",
                            embeds: [{
                                color: COLOR_SUCCESS,
                                author: { name: "QUEST CONTROL / OWNER MANAGEMENT" },
                                title: "Slash Commands Synchronized",
                                description: [
                                    `Successfully registered **${res.count} slash commands**!`,
                                    "",
                                    `• **Scope:** ${targetGuild ? `Guild: \`${targetGuild}\` (Instant)` : "Global"}`,
                                    `• **Duration:** ${elapsed}ms`,
                                ].join("\n"),
                                footer: { text: "Quest Control • Owner Action" },
                                timestamp: new Date().toISOString(),
                            }],
                        }).catch(() => {});
                    }
                } catch (err) {
                    if (statusMsg?.id) {
                        await api.channels.editMessage(channelId, statusMsg.id, {
                            content: `Command synchronization failed: \`${err.message || err}\``,
                        }).catch(() => {});
                    }
                }
                return;
            }

            // ── 5. OWNER: !stats ──────────────────────────────────────────────
            if (command === "stats") {
                if (!await requireOwner()) return;
                const mem = process.memoryUsage();
                const formatMb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + " MB";
                const uptime = Math.floor(process.uptime());
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = uptime % 60;

                await api.channels.createMessage(channelId, {
                    embeds: [{
                        color: COLOR_NEUTRAL,
                        author: { name: "QUEST CONTROL / BOT DIAGNOSTICS" },
                        title: "System Metrics",
                        description: [
                            `• **Gateway:** ${isBotConnected ? "Online" : "Standby"}`,
                            `• **Uptime:** ${hours}h ${minutes}m ${seconds}s`,
                            `• **Node Runtime:** ${process.version}`,
                            `• **Memory RSS:** ${formatMb(mem.rss)}`,
                            `• **Heap Used:** ${formatMb(mem.heapUsed)} / ${formatMb(mem.heapTotal)}`,
                            `• **Active Runs:** ${activeUsers.size} active user(s)`,
                            `• **Configured Owners:** ${OWNER_IDS.length} owner(s)`,
                            `• **HTTP Port:** ${HTTP_PORT}`,
                        ].join("\n"),
                        footer: { text: "Quest Control • System Diagnostics" },
                        timestamp: new Date().toISOString(),
                    }],
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            // ── 6. OWNER: !owner (help / eval) ────────────────────────────────
            if (command === "owner") {
                if (!await requireOwner()) return;
                const action = subArgs[0]?.toLowerCase();

                if (action === "help") {
                    await api.channels.createMessage(channelId, {
                        ...buildHelpEmbed("help_admin"),
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                if (action === "eval") {
                    const codeToEval = subArgs.slice(1).join(" ");
                    if (!codeToEval) {
                        await api.channels.createMessage(channelId, {
                            content: "Please provide code to evaluate: `!owner eval <code>`",
                            message_reference: { message_id: message.id },
                        }).catch(() => {});
                        return;
                    }
                    try {
                        let result = (0, eval)(codeToEval);
                        if (result && typeof result.then === "function") {
                            result = await result;
                        }
                        const util = require("node:util");
                        const resultStr = typeof result === "string" ? result : util.inspect(result, { depth: 2 });
                        await api.channels.createMessage(channelId, {
                            content: `\`\`\`javascript\n${resultStr.slice(0, 1900)}\n\`\`\``,
                            message_reference: { message_id: message.id },
                        }).catch(() => {});
                    } catch (err) {
                        await api.channels.createMessage(channelId, {
                            content: `**Eval Error:** \`\`\`${err.message || err}\`\`\``,
                            message_reference: { message_id: message.id },
                        }).catch(() => {});
                    }
                    return;
                }

                await api.channels.createMessage(channelId, {
                    content: "Use `!owner help` to view all owner commands.",
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            // ── 7. OWNER/ADMIN: !announce <quest> [details] ───────────────────
            if (command === "announce" || (command === "quest" && subArgs[0]?.toLowerCase() === "announce")) {
                if (!await requireOwner()) return;
                const announceArgs = command === "announce" ? subArgs : subArgs.slice(1);
                const questName = announceArgs[0];
                const details = announceArgs.slice(1).join(" ");
                if (!questName) {
                    await api.channels.createMessage(channelId, {
                        content: "Usage: `!announce <quest_name> [optional_details]`",
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }
                if (!guildId) {
                    await api.channels.createMessage(channelId, {
                        content: "Announcements can only be sent from inside a server.",
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const recipients = getQuestRecipients(questAudience, guildId);
                if (recipients.length === 0) {
                    await api.channels.createMessage(channelId, {
                        content: "No members registered for quest notifications in this guild yet.",
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const progressMsg = await api.channels.createMessage(channelId, {
                    content: `Sending announcement to **${recipients.length}** recipient(s)...`,
                    message_reference: { message_id: message.id },
                }).catch(() => null);

                let sent = 0;
                let failed = 0;
                for (let i = 0; i < recipients.length; i++) {
                    try {
                        await sendQuestAnnouncement(recipients[i], questName, details);
                        sent++;
                    } catch {
                        failed++;
                    }
                    if (i < recipients.length - 1) {
                        await new Promise((r) => setTimeout(r, 400));
                    }
                }

                if (progressMsg?.id) {
                    await api.channels.editMessage(channelId, progressMsg.id, {
                        content: "",
                        embeds: [{
                            color: COLOR_NEUTRAL,
                            author: { name: "QUEST CONTROL / ANNOUNCEMENT" },
                            title: "Announcement Broadcast Complete",
                            description: [
                                `Announced quest: **${questName}**`,
                                "",
                                `• **Delivered:** ${sent} users`,
                                `• **Failed / DMs Closed:** ${failed} users`,
                                `• **Total Targeted:** ${recipients.length} users`,
                            ].join("\n"),
                            footer: { text: "Quest Control • Notification System" },
                            timestamp: new Date().toISOString(),
                        }],
                    }).catch(() => {});
                }
                return;
            }

            // ── 8. ACCOUNT LINKING: STRICT MODAL-ONLY ENFORCEMENT ─────────────
            if (command === "link") {
                const tokenInput = subArgs[0]?.trim();
                if (tokenInput && tokenInput.length >= 10) {
                    await safeDeleteMessage(api, channelId, message.id);
                    await api.channels.createMessage(channelId, {
                        content: `<@${userId}>`,
                        ...buildMustLinkFirstEmbed("account linking"),
                    }).catch(() => {});
                    return;
                }

                const rec = getUserRecord(userId);
                await api.channels.createMessage(channelId, {
                    ...buildLinkEmbed(rec),
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            if (command === "unlink" || command === "delink") {
                clearUserPresence(userId);
                const removed = removeUserToken(userId);
                await api.channels.createMessage(channelId, {
                    content: removed
                        ? `<@${userId}> Your linked Discord token has been removed from the database.`
                        : `<@${userId}> You don't have any linked token in the database. Use \`!link\` to connect your account.`,
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            if (command === "whoami" || command === "profile") {
                const rec = getUserRecord(userId);
                await api.channels.createMessage(channelId, {
                    ...buildLinkEmbed(rec),
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            // ── 9. OWNER: !channel-set <quest/badges> <channel/id> ─────────────
            if (command === "channel-set") {
                if (!await requireOwner()) return;
                if (!guildId) {
                    await api.channels.createMessage(channelId, { content: "This command must be used inside a server." }).catch(() => {});
                    return;
                }

                if (subArgs.length === 0) {
                    const questChan = getCategoryChannel(categoryChannels, guildId, "quest");
                    const badgeChan = getCategoryChannel(categoryChannels, guildId, "badges");
                    await api.channels.createMessage(channelId, {
                        embeds: [{
                            color: COLOR_NEUTRAL,
                            author: { name: "QUEST CONTROL / SERVER CHANNELS" },
                            title: "Channel Command Restrictions",
                            description: [
                                "Configured channels for this server. When set, users are restricted to that channel only.",
                                "",
                                `• **Quest Commands:** ${questChan ? `<#${questChan}>` : "Any channel"}`,
                                `• **Badge Commands:** ${badgeChan ? `<#${badgeChan}>` : "Any channel"}`,
                                "",
                                "## Usage Guide",
                                "• `!channel-set quest <#channel or id>` — lock quest commands to channel",
                                "• `!channel-set badges <#channel or id>` — lock badge commands to channel",
                                "• `!channel-set quest reset` — remove quest channel lock",
                                "• `!channel-set badges reset` — remove badges channel lock",
                            ].join("\n"),
                            footer: { text: "Quest Control • Owner Channel Configuration" },
                            timestamp: new Date().toISOString(),
                        }],
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const category = normalizeCategory(subArgs[0]);
                if (!category) {
                    await api.channels.createMessage(channelId, {
                        content: "Invalid category. Choose either `quest` or `badges`:\n`!channel-set <quest/badges> <#channel or id>`",
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const rawTarget = subArgs[1];
                if (!rawTarget) {
                    await api.channels.createMessage(channelId, {
                        content: `Please specify a channel or \`reset\`:\n\`!channel-set ${category} <#channel or id>\`\n\`!channel-set ${category} reset\``,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                if (["reset", "clear", "none", "remove", "all"].includes(rawTarget.toLowerCase())) {
                    removeCategoryChannel(categoryChannels, guildId, category);
                    if (category === "quest") {
                        removeQuestChannel(questChannels, guildId);
                    }
                    await api.channels.createMessage(channelId, {
                        content: `**${category === "quest" ? "Quest" : "Badge"}** channel restriction cleared. Commands allowed in any channel.`,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const targetId = rawTarget.replace(/[^0-9]/g, "");
                if (!/^\d{17,20}$/.test(targetId)) {
                    await api.channels.createMessage(channelId, {
                        content: "Invalid channel. Mention a channel or provide a valid ID: `!channel-set <quest/badges> #channel`",
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                saveCategoryChannel(categoryChannels, guildId, category, targetId);
                if (category === "quest") {
                    saveQuestChannel(questChannels, guildId, targetId);
                }
                await api.channels.createMessage(channelId, {
                    content: `**${category === "quest" ? "Quest" : "Badge"}** commands locked to <#${targetId}>.`,
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            // ── CHANNEL ACCESS RESTRICTION CHECK ──────────────────────────────
            if (command === "quest") {
                const notice = checkCategoryNotice(categoryChannels, guildId, channelId, "quest");
                if (notice && !userIsOwner) {
                    await api.channels.createMessage(channelId, {
                        embeds: [{
                            color: COLOR_NEUTRAL,
                            author: { name: "QUEST CONTROL / ACCESS" },
                            title: "Quest Channel Restriction",
                            description: notice,
                            footer: { text: "Quest Control • Channel lock active" },
                        }],
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }
            }

            if (command === "badge") {
                const notice = checkCategoryNotice(categoryChannels, guildId, channelId, "badges");
                if (notice && !userIsOwner) {
                    await api.channels.createMessage(channelId, {
                        embeds: [{
                            color: COLOR_NEUTRAL,
                            author: { name: "QUEST CONTROL / ACCESS" },
                            title: "Badge Channel Restriction",
                            description: notice,
                            footer: { text: "Quest Control • Channel lock active" },
                        }],
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }
            }
            rememberQuestUser(guildId, userId);

            // ── 10. BADGE SPOOFER COMMANDS ────────────────────────────────────
            if (command === "badge") {
                const subCmd = subArgs[0]?.toLowerCase();

                if (!subCmd || subCmd === "help") {
                    await api.channels.createMessage(channelId, {
                        ...buildHelpEmbed("help_badges"),
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                if (subCmd === "games") {
                    await api.channels.createMessage(channelId, {
                        ...buildBadgeGamesEmbed(),
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const possibleToken = subArgs.find((a) => a && (a.length >= 25 || a.includes(".")));
                if (possibleToken) {
                    await safeDeleteMessage(api, channelId, message.id);
                }

                const token = getUserToken(userId);
                if (!token) {
                    await api.channels.createMessage(channelId, {
                        content: `<@${userId}>`,
                        ...buildMustLinkFirstEmbed("badge spoofing commands"),
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const cd = checkCooldown(userId);
                if (cd.blocked) {
                    await api.channels.createMessage(channelId, {
                        content: `<@${userId}> ${cd.reason}`,
                    }).catch(() => {});
                    return;
                }

                // !badge playtime [hours] [game]
                if (subCmd === "playtime") {
                    const hoursRaw = subArgs[1];
                    const queryGame = subArgs[2];

                    const hoursNum = parseInt(hoursRaw || "100", 10);
                    const hours = isNaN(hoursNum) ? 100 : Math.max(1, Math.min(hoursNum, 1000));

                    let matchedGame = POPULAR_GAMES[0];
                    if (queryGame) {
                        const found = POPULAR_GAMES.find(
                            (g) => g.id === queryGame || g.name.toLowerCase().includes(queryGame.toLowerCase()),
                        );
                        if (found) matchedGame = found;
                    }

                    const progressMsg = await api.channels.createMessage(channelId, {
                        content: `<@${userId}> Telemetry in progress: Spoofing **${hours} hours** on **${matchedGame.name}**...`,
                    }).catch(() => null);

                    startRun(userId);
                    try {
                        const spoofRes = await spoofBadges(token, {
                            mode: "custom",
                            hours,
                            gameIds: [matchedGame.id],
                        });

                        if (!spoofRes.success) {
                            const errorContent = `<@${userId}> Badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`;
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: errorContent }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { content: errorContent }).catch(() => {});
                            }
                        } else {
                            const embed = {
                                color: COLOR_SUCCESS,
                                author: { name: "QUEST CONTROL / BADGE SPOOFER" },
                                title: "Game Time Badge Spoofed",
                                description: [
                                    `<@${userId}> Successfully registered **${spoofRes.totalHoursSpoofed} hours** for **${matchedGame.name}**!`,
                                    "",
                                    `• **Game Title:** ${matchedGame.name}`,
                                    `• **Hours Logged:** ${spoofRes.totalHoursSpoofed}h`,
                                    `• **Application ID:** \`${matchedGame.id}\``,
                                    `• **Profile Sync:** Discord profile badges update in batches within 24 to 48 hours.`,
                                ].join("\n"),
                                footer: { text: "Quest Control • Discord Science Telemetry" },
                                timestamp: new Date().toISOString(),
                            };
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: "", embeds: [embed] }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { embeds: [embed] }).catch(() => {});
                            }
                        }
                    } finally {
                        finishRun(userId);
                    }
                    return;
                }

                // !badge stream [hours] [game]
                if (subCmd === "stream") {
                    const hoursRaw = subArgs[1];
                    const queryGame = subArgs[2];

                    const hoursNum = parseInt(hoursRaw || "50", 10);
                    const hours = isNaN(hoursNum) ? 50 : Math.max(1, Math.min(hoursNum, 1000));

                    let matchedGame = POPULAR_GAMES[0];
                    if (queryGame) {
                        const found = POPULAR_GAMES.find(
                            (g) => g.id === queryGame || g.name.toLowerCase().includes(queryGame.toLowerCase()),
                        );
                        if (found) matchedGame = found;
                    }

                    const progressMsg = await api.channels.createMessage(channelId, {
                        content: `<@${userId}> Telemetry in progress: Spoofing **${hours} streaming hours** on **${matchedGame.name}**...`,
                    }).catch(() => null);

                    startRun(userId);
                    try {
                        const spoofRes = await spoofBadges(token, {
                            mode: "stream",
                            hours,
                            gameIds: [matchedGame.id],
                        });

                        if (!spoofRes.success) {
                            const errorContent = `<@${userId}> Streaming badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`;
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: errorContent }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { content: errorContent }).catch(() => {});
                            }
                        } else {
                            const embed = {
                                color: COLOR_SUCCESS,
                                author: { name: "QUEST CONTROL / BADGE SPOOFER" },
                                title: "Streaming Badge Spoofed",
                                description: [
                                    `<@${userId}> Successfully registered **${spoofRes.totalHoursSpoofed} stream hours** for **${matchedGame.name}**!`,
                                    "",
                                    `• **Mode:** Live Screenshare & Stream Telemetry`,
                                    `• **Stream Title:** ${matchedGame.name}`,
                                    `• **Duration Tracked:** ${spoofRes.totalHoursSpoofed} hours`,
                                    `• **Profile Sync:** Discord profile badges update in batches within 24 to 48 hours.`,
                                ].join("\n"),
                                footer: { text: "Quest Control • Discord Science Telemetry" },
                                timestamp: new Date().toISOString(),
                            };
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: "", embeds: [embed] }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { embeds: [embed] }).catch(() => {});
                            }
                        }
                    } finally {
                        finishRun(userId);
                    }
                    return;
                }

                // !badge variety [count]
                if (subCmd === "variety") {
                    const countRaw = subArgs[1];
                    const countNum = parseInt(countRaw || "25", 10);
                    const count = isNaN(countNum) ? 25 : Math.max(5, Math.min(countNum, 50));

                    const progressMsg = await api.channels.createMessage(channelId, {
                        content: `<@${userId}> Telemetry in progress: Spoofing Game Variety badge with **${count} games**...`,
                    }).catch(() => null);

                    startRun(userId);
                    try {
                        const spoofRes = await spoofBadges(token, {
                            mode: "variety",
                            gameCount: count,
                            hours: 5,
                        });

                        if (!spoofRes.success) {
                            const errorContent = `<@${userId}> Variety badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`;
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: errorContent }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { content: errorContent }).catch(() => {});
                            }
                        } else {
                            const embed = {
                                color: COLOR_SUCCESS,
                                author: { name: "QUEST CONTROL / BADGE SPOOFER" },
                                title: "Game Variety Badge Spoofed",
                                description: [
                                    `<@${userId}> Successfully simulated **${spoofRes.gamesSpoofed} distinct detectable games**!`,
                                    "",
                                    `• **Badge Mode:** Game Variety`,
                                    `• **Games Registered:** ${spoofRes.gamesSpoofed} games`,
                                    `• **Profile Sync:** Discord profile badges update in batches within 24 to 48 hours.`,
                                ].join("\n"),
                                footer: { text: "Quest Control • Discord Science Telemetry" },
                                timestamp: new Date().toISOString(),
                            };
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: "", embeds: [embed] }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { embeds: [embed] }).catch(() => {});
                            }
                        }
                    } finally {
                        finishRun(userId);
                    }
                    return;
                }

                // !badge all [hours]
                if (subCmd === "all") {
                    const hoursRaw = subArgs[1];
                    const hoursNum = parseInt(hoursRaw || "100", 10);
                    const hours = isNaN(hoursNum) ? 100 : Math.max(1, Math.min(hoursNum, 500));

                    const progressMsg = await api.channels.createMessage(channelId, {
                        content: `<@${userId}> Telemetry in progress: Spoofing Playtime and Streaming with **${hours} hours**...`,
                    }).catch(() => null);

                    startRun(userId);
                    try {
                        const spoofRes = await spoofBadges(token, {
                            mode: "all",
                            hours,
                        });

                        if (!spoofRes.success) {
                            const errorContent = `<@${userId}> Combined badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`;
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: errorContent }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { content: errorContent }).catch(() => {});
                            }
                        } else {
                            const embed = {
                                color: COLOR_SUCCESS,
                                author: { name: "QUEST CONTROL / BADGE SPOOFER" },
                                title: "Profile Badges Spoofed",
                                description: [
                                    `<@${userId}> Successfully simulated **Playtime & Streaming** across **${spoofRes.gamesSpoofed} games**!`,
                                    "",
                                    `• **Mode:** Combined Game Playtime & Live Streaming`,
                                    `• **Hours Logged:** ~${spoofRes.totalHoursSpoofed} hours`,
                                    `• **Profile Sync:** Discord profile badges update in batches within 24 to 48 hours.`,
                                ].join("\n"),
                                footer: { text: "Quest Control • Discord Science Telemetry" },
                                timestamp: new Date().toISOString(),
                            };
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: "", embeds: [embed] }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { embeds: [embed] }).catch(() => {});
                            }
                        }
                    } finally {
                        finishRun(userId);
                    }
                    return;
                }

                await api.channels.createMessage(channelId, {
                    content: "Invalid badge command. Use `!badge help`, `!badge playtime [hours]`, `!badge stream [hours]`, or `!badge variety [count]`.",
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            // ── 11. QUEST COMMANDS: !quest [run|status|panel] ─────────────────
            if (command === "quest") {
                const subCmd = subArgs[0]?.toLowerCase();

                const possibleToken = subArgs.find((a) => a && (a.length >= 25 || a.includes(".")));
                if (possibleToken) {
                    await safeDeleteMessage(api, channelId, message.id);
                }

                // !quest status
                if (subCmd === "status") {
                    const token = getUserToken(userId);
                    if (!token) {
                        await api.channels.createMessage(channelId, {
                            content: `<@${userId}>`,
                            ...buildMustLinkFirstEmbed("checking quest status"),
                            message_reference: { message_id: message.id },
                        }).catch(() => {});
                        return;
                    }
                    await sendStatusEmbeds(channelId, token, userId);
                    return;
                }

                // !quest run
                if (subCmd === "run") {
                    const token = getUserToken(userId);
                    if (!token) {
                        await api.channels.createMessage(channelId, {
                            content: `<@${userId}>`,
                            ...buildMustLinkFirstEmbed("quest completion"),
                            message_reference: { message_id: message.id },
                        }).catch(() => {});
                        return;
                    }

                    const cd = checkCooldown(userId);
                    if (cd.blocked) {
                        await api.channels.createMessage(channelId, {
                            content: `<@${userId}> ${cd.reason}`,
                        }).catch(() => {});
                        return;
                    }

                    const sentMsg = await api.channels.createMessage(channelId, {
                        content: `<@${userId}> Quest processing has started...`,
                    }).catch(() => null);

                    const editFinal = async (txt) => {
                        if (sentMsg?.id) {
                            await api.channels.editMessage(channelId, sentMsg.id, {
                                content: `<@${userId}> ${txt}`,
                            }).catch(() => {});
                        }
                    };

                    startRun(userId);
                    try {
                        await runAndReport(token, channelId, async () => {}, editFinal);
                    } finally {
                        finishRun(userId);
                    }
                    return;
                }

                // !quest or !quest panel → show interactive button dashboard
                await api.channels.createMessage(channelId, {
                    ...buildTokenRequiredEmbed(hasUserToken(userId)),
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }
        },
    );

    process.on("unhandledRejection", (r) =>
        console.error("[Discord Bot] Unhandled Rejection:", r),
    );
    process.on("uncaughtException", (e) =>
        console.error("[Discord Bot] Uncaught Exception:", e.message),
    );

    try {
        gateway.connect().catch((err) => {
            console.warn("[Discord Bot] Gateway connection failed:", err.message);
            isBotConnected = false;
        });
        isBotConnected = true;
        console.log("[Discord Bot] Gateway connection started.");
    } catch (err) {
        console.error("[Discord Bot] Gateway connection error:", err.message);
    }
}

function startDiscordBot() {
    if (hasValidBotConfig && client && gateway) {
        if (!isBotConnected) {
            initBotListeners(client, gateway);
        }
        return isBotConnected;
    } else {
        console.log("[Discord Bot] Standby: Valid botToken or clientId not set in config.json. Bot Gateway is idle.");
        return false;
    }
}

if (hasValidBotConfig && client && gateway) {
    initBotListeners(client, gateway);
} else {
    console.log("[Discord Bot] Standby: Valid botToken or clientId not configured in config.json. Server active on port " + HTTP_PORT);
}

// ── Lightweight HTTP Health Server for Dev Environment (Port 3000) ────────────
const healthServer = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    });
    res.end(
        JSON.stringify({
            status: "online",
            botConnected: isBotConnected,
            ownerConfigured: OWNER_IDS.length > 0,
            uptimeSeconds: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
        })
    );
});

healthServer.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log(`[Bot Server] Service active and listening on http://0.0.0.0:${HTTP_PORT}`);
});

module.exports = {
    startDiscordBot,
    isDiscordBotRunning,
    registerCommands,
    BOT_TOKEN,
    CLIENT_ID,
    OWNER_IDS,
    isOwner,
};
