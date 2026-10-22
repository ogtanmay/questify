const http = require("node:http");
const {
    GatewayDispatchEvents,
    GatewayIntentBits,
    InteractionType,
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
const { Emojis, buttonEmoji } = require("./src/emoji");

function isRealConfigToken(val) {
    if (!val) return false;
    const lower = val.trim().toLowerCase();
    if (
        lower === "your_discord_bot_token_here" ||
        lower === "your_discord_client_id_here" ||
        lower === "your_token_here" ||
        lower === "placeholder" ||
        lower === ""
    ) {
        return false;
    }
    return val.trim().length > 10;
}

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const CLIENT_ID = process.env.CLIENT_ID || "";
const hasValidBotConfig = isRealConfigToken(BOT_TOKEN) && isRealConfigToken(CLIENT_ID);

let isBotConnected = false;

function isDiscordBotRunning() {
    return isBotConnected;
}

const OWNER_IDS = (
    process.env.OWNER_ID ||
    process.env.OWNER_IDS ||
    ""
)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function isOwner(userId) {
    if (!userId) return false;
    return OWNER_IDS.includes(userId);
}

const PREFIX = "!quest";
const questChannels = loadQuestChannels();
const categoryChannels = loadCategoryChannels();
const questAudience = loadQuestAudience();
const EMBED_COLOR = 0x2b2d31;
const BRAND_COLOR = EMBED_COLOR;

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

// ── Custom Component IDs ──────────────────────────────────────────────────────
const BTN_RUN = "quest_run_btn";
const BTN_STATUS = "quest_status_btn";
const BTN_HELP = "quest_help_btn";
const BTN_LINK = "link_token_open_modal";
const BTN_LINK_CHECK = "link_status_check";
const BTN_LINK_UNLINK = "link_unlink_btn";
const MODAL_LINK = "modal_link_token";
const INPUT_LINK_TOKEN = "user_link_token_input";
const INPUT_LINK_NOTE = "user_link_note_input";

// ── Helper Labels (Emojis from src/emoji.js) ──────────────────────────────────
const TASK_LABELS = {
    WATCH_VIDEO: `${Emojis.TV} Watch Video`,
    WATCH_VIDEO_ON_MOBILE: `${Emojis.MOBILE} Watch Video on Mobile`,
    PLAY_ON_DESKTOP: `${Emojis.DESKTOP} Play on Desktop`,
    PLAY_ON_XBOX: `${Emojis.XBOX} Play on Xbox`,
    PLAY_ON_PLAYSTATION: `${Emojis.PLAYSTATION} Play on PlayStation`,
    PLAY_ACTIVITY: `${Emojis.ACTIVITY} Play Activity`,
    ACHIEVEMENT_IN_ACTIVITY: `${Emojis.TROPHY} Achievement`,
    STREAM_ON_DESKTOP: `${Emojis.STREAM} Stream on Desktop`,
};

function makeBar(pct, len = 12) {
    const filled = Math.round((pct / 100) * len);
    return "█".repeat(filled) + "░".repeat(len - filled);
}

// ── Link Prompt Embed (When user needs to link first) ─────────────────────────
function buildMustLinkFirstEmbed(actionName = "quest or badge commands") {
    return {
        embeds: [
            {
                color: 0xfee75c,
                author: { name: "QUEST CONTROL  /  ACCOUNT LINK REQUIRED" },
                title: `${Emojis.LOCK} Account Link Required`,
                description: [
                    `You haven't linked your Discord account yet!`,
                    `To use ${actionName}, you must link your account first.`,
                    "",
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                    `${Emojis.SPARKLE} **Why link your account?**`,
                    `• Run commands with 1 click without ever typing your token again.`,
                    `• 100% private: enter your token only inside the secure Discord modal.`,
                    `• Never paste or leak your token in public server channels.`,
                    "",
                    `Click **Link Account** below to open the private pop-up modal.`,
                ].join("\n"),
                footer: { text: "QUEST CONTROL  •  Secure Modal Authentication" },
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
                        emoji: buttonEmoji(Emojis.LINK),
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_HELP,
                        label: "Help Guide",
                        emoji: buttonEmoji(Emojis.HELP),
                    },
                ],
            },
        ],
    };
}

// ── Dashboard Embed (NO fields — formatted exclusively in description) ────────
function buildTokenRequiredEmbed(hasLinkedToken = false) {
    const descLines = [
        "### ✦ Quest & Badge Control Center",
        "Everything you need, right here. Pick an action below to get started.",
        "",
        hasLinkedToken
            ? `${Emojis.ONLINE} **Discord account linked:** Ready to run commands!`
            : `${Emojis.STANDBY} **No account linked:** Click **Link Account** to link via private modal!`,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `${Emojis.RUN} **Run Quests:** Auto-complete active quests with your saved account.`,
        `${Emojis.STATUS} **Check Status:** See active quests, completion progress, rewards and time remaining.`,
        `${Emojis.LINK} **Link Account:** Manage your saved token or update your account.`,
        `${Emojis.HELP} **Command Guide:** View all available prefix and slash commands.`,
        "",
        `*Note: Tokens cannot be pasted in chat. Always use the private modal.*`,
    ];

    return {
        embeds: [
            {
                color: BRAND_COLOR,
                author: { name: "QUEST CONTROL  /  DASHBOARD" },
                title: `${Emojis.ORB} Your Quest & Badge Hub`,
                description: descLines.join("\n"),
                footer: { text: "QUEST CONTROL  •  Never post tokens publicly" },
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
                        emoji: buttonEmoji(Emojis.RUN),
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_STATUS,
                        label: "Check Status",
                        emoji: buttonEmoji(Emojis.STATUS),
                    },
                    {
                        type: ComponentType.Button,
                        style: hasLinkedToken ? ButtonStyle.Secondary : ButtonStyle.Success,
                        custom_id: BTN_LINK,
                        label: hasLinkedToken ? "Linked Account" : "Link Account",
                        emoji: buttonEmoji(Emojis.LINK),
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_HELP,
                        label: "Help",
                        emoji: buttonEmoji(Emojis.HELP),
                    },
                ],
            },
        ],
    };
}

// ── Linked Account Embed (NO fields — formatted in description) ───────────────
function buildLinkEmbed(userRecord) {
    if (userRecord) {
        const maskedToken = userRecord.token.length > 10
            ? `${userRecord.token.slice(0, 6)}...${userRecord.token.slice(-4)}`
            : "••••••••";

        const descLines = [
            `### ${Emojis.CHECK} Discord Account Linked`,
            "Your Discord account is saved in the local JSON database.",
            "You do **not** need to type tokens into any commands!",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━",
            `${Emojis.USER} **User:** ${userRecord.username || "Linked User"} (\`${userRecord.userId}\`)`,
            `${Emojis.KEY} **Token:** \`${maskedToken}\``,
            `${Emojis.NOTE} **Note:** ${userRecord.notes || "None"}`,
            `${Emojis.CALENDAR} **Linked:** ${userRecord.linkedAt ? `<t:${Math.floor(new Date(userRecord.linkedAt).getTime() / 1000)}:R>` : "Recently"}`,
            "",
            "**Token-Free Commands Available:**",
            `• \`!quest run\` — auto-completes quests`,
            `• \`!quest status\` — checks active quests & progress`,
            `• \`!badge playtime [hours] [game]\` — boost game time badge`,
            `• \`!badge stream [hours] [game]\` — boost streaming badge`,
            `• \`!badge variety [count]\` — boost game variety badge`,
            `• \`!badge all [hours]\` — boost both playtime & stream badges`,
        ];

        return {
            embeds: [
                {
                    color: 0x57f287,
                    author: { name: "QUEST CONTROL  /  ACCOUNT LINKED" },
                    title: `${Emojis.ORB} Account Status`,
                    description: descLines.join("\n"),
                    footer: { text: "QUEST CONTROL  •  Stored in local JSON database" },
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
                            emoji: buttonEmoji(Emojis.REFRESH),
                        },
                        {
                            type: ComponentType.Button,
                            style: ButtonStyle.Danger,
                            custom_id: BTN_LINK_UNLINK,
                            label: "Unlink Account",
                            emoji: buttonEmoji(Emojis.UNLINK),
                        },
                    ],
                },
            ],
        };
    }

    const descLines = [
        `### ${Emojis.LINK} Link Your Discord Token`,
        "Link your Discord account token once to enable token-free commands!",
        "Tokens must be submitted through the private modal only.",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `${Emojis.SPARKLE} **Why link your token?**`,
        "• Never paste tokens into chat again.",
        "• Run `!quest run` and `!quest status` directly.",
        "• Run `!badge playtime`, `!badge stream`, and `!badge variety` with 1 click.",
        "• Safe, private modal input with instant validation.",
        "",
        `${Emojis.SHIELD} **Privacy & Security:**`,
        "Your token is encrypted in memory and stored in the bot's private JSON database. Modals are 100% private to you.",
    ];

    return {
        embeds: [
            {
                color: 0x5865f2,
                author: { name: "QUEST CONTROL  /  ACCOUNT LINKING" },
                title: `${Emojis.ORB} Connect Your Account`,
                description: descLines.join("\n"),
                footer: { text: "QUEST CONTROL  •  Private modal authentication" },
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
                        label: "Link Account",
                        emoji: buttonEmoji(Emojis.LINK),
                    },
                ],
            },
        ],
    };
}

// ── Command Center Help Embed (NO fields — formatted in description) ──────────
function buildHelpEmbed() {
    const descLines = [
        `### ${Emojis.ORB} Command Center Reference`,
        "Complete reference of all slash and prefix commands available in this bot.",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `**${Emojis.LINK} Account Linking (Token-Free Commands)**`,
        "• `!link` — open private modal to link your token to the database",
        "• `!unlink` — disconnect your token from the bot database",
        "• `!whoami` or `!profile` — view your linked Discord account status",
        "",
        `**${Emojis.ROCKET} Slash Commands**`,
        "• `/run-quests` — auto-complete quests *(requires linked account)*",
        "• `/quest-status` — check quests & progress *(requires linked account)*",
        "• `/spoof-playtime [hours] [game]` — simulate Game Time badge",
        "• `/spoof-stream [hours] [game]` — simulate Streaming badge",
        "• `/spoof-variety [games]` — simulate Game Variety badge",
        "• `/link` — open private token linking modal",
        "• `/quest-help` — open this command guide",
        "• `/quest-ping` — check gateway & connectivity status",
        "",
        `**${Emojis.DESKTOP} Prefix Commands (Quests & Status)**`,
        "• `!quest run` — auto-complete quests using linked token",
        "• `!quest status` — view quest progress using linked token",
        "• `!quest` or `!quest panel` — show interactive button dashboard",
        "• `!ping` or `!quest ping` — bot latency, memory & gateway status",
        "• `!help` or `!quest help` — open this command guide",
        "",
        `**${Emojis.GAME} Prefix Commands (Discord Profile Badges)**`,
        "• `!badge playtime [hours] [game]` — boost Game Time badge",
        "• `!badge stream [hours] [game]` — boost Streaming badge",
        "• `!badge variety [games_count]` — boost Variety badge",
        "• `!badge all [hours]` — boost both playtime & stream badges",
        "• `!badge games` — list supported top games and application IDs",
        "• `!badge help` — explain how science telemetry & badge sync work",
        "",
        `**${Emojis.CROWN} Owner Commands (OWNER_ID in .env)**`,
        "• `!channel-set <quest/badges> <#channel or id>` — restrict commands to designated channel",
        "• `!channel-set` — view configured channels for this server",
        "• `!channel-set <quest/badges> reset` — remove channel lock restriction",
        "• `!sync [guildId]` — force instant slash command registration",
        "• `!stats` — bot uptime, RAM usage, gateway state & runners",
        "• `!announce <quest_name> [details]` — DM registered quest recipients",
        "• `!owner help` / `!owner eval <code>` — administrative evaluation",
        "",
        `**${Emojis.SHIELD} Safety & Security:**`,
        "Tokens must be entered in the modal only. Messages containing tokens are deleted immediately.",
    ];

    return {
        embeds: [
            {
                color: BRAND_COLOR,
                author: { name: "QUEST CONTROL  /  COMMAND GUIDE" },
                title: `${Emojis.ORB} Command Center Reference`,
                description: descLines.join("\n"),
                footer: { text: "QUEST CONTROL  •  Prefix & Slash Commands" },
                timestamp: new Date().toISOString(),
            },
        ],
    };
}

// ── Badge Spoofer Help Embed (NO fields — formatted in description) ───────────
function buildBadgeHelpEmbed() {
    const descLines = [
        `### ${Emojis.GAME} Discord Badge Spoofer Guide`,
        "This engine uses Discord's official telemetry pipeline to legitimately register game activity and streaming telemetry for profile badges.",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `**${Emojis.GAME} Game Time Badge:**`,
        "Simulates continuous gameplay duration for detectable titles.",
        "• `!badge playtime 100` — boosts 100 hours across top games",
        "• `!badge playtime 150 valorant` — boosts 150 hours on VALORANT",
        "",
        `**${Emojis.STREAM} Streaming Badge:**`,
        "Simulates live video screensharing telemetry (`video_stream_started`, `video_stream_ended`, `screenshare_finished`).",
        "• `!badge stream 50` — logs 50 hours of stream telemetry",
        "• `!badge stream 100 minecraft` — logs 100 stream hours for Minecraft",
        "",
        `**${Emojis.ACTIVITY} Game Variety Badge:**`,
        "Simulates unique detectable game launches across Discord's catalog.",
        "• `!badge variety 30` — simulates 30 unique games",
        "",
        `**${Emojis.FIRE} All Badges (Combined):**`,
        "• `!badge all 100` — boosts both Playtime and Streaming badges together!",
        "",
        `**${Emojis.CLOCK} When do badges show up?**`,
        "Discord evaluates profile badge telemetry in asynchronous backend batches. Badges appear on your Discord profile within **24 to 48 hours**.",
    ];

    return {
        embeds: [
            {
                color: EMBED_COLOR,
                author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                title: `${Emojis.ORB} Discord Badge Spoofer Guide`,
                description: descLines.join("\n"),
                footer: { text: "QUEST CONTROL  •  Discord Science Telemetry" },
                timestamp: new Date().toISOString(),
            },
        ],
    };
}

function buildBadgeGamesEmbed() {
    const list = POPULAR_GAMES.slice(0, 25)
        .map((g, i) => `**${i + 1}.** ${g.name} — \`${g.id}\``)
        .join("\n");
    return {
        embeds: [
            {
                color: EMBED_COLOR,
                author: { name: "QUEST CONTROL  /  DETECTABLE GAMES" },
                title: `${Emojis.GAME} Supported Detectable Games`,
                description: `Discord tracks game badges for verified games in their catalog. Here are the top games available for spoofing:\n\n${list}\n\n*...and more in Discord's catalog.*`,
                footer: { text: "QUEST CONTROL  •  Use !badge playtime <hours> [game]" },
                timestamp: new Date().toISOString(),
            },
        ],
    };
}

function buildPingEmbed() {
    return {
        embeds: [
            {
                color: EMBED_COLOR,
                author: { name: "QUEST CONTROL  /  SYSTEM" },
                title: `${Emojis.ORB} All Systems Online`,
                description: [
                    "The bot is connected and ready to receive commands.",
                    "",
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                    `${Emojis.ONLINE} **Status:** Operational`,
                    `${Emojis.HELP} **Commands:** Use \`/quest-help\` or \`!help\` to begin`,
                ].join("\n"),
                footer: { text: "QUEST CONTROL  •  System status" },
                timestamp: new Date().toISOString(),
            },
        ],
    };
}

function buildQuestAnnouncementEmbed(questName, details) {
    return {
        color: EMBED_COLOR,
        author: { name: "QUEST CONTROL  /  NEW QUEST" },
        title: `${Emojis.ORB} New quest: ${questName}`,
        description:
            "A new Discord Quest is available." +
            (details ? `\n\n${details}` : ""),
        footer: { text: "QUEST CONTROL  •  Quest notifications" },
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

// ── Private Modal Builder (Modal-Only Submission) ─────────────────────────────
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
                        placeholder: "e.g. Main Account or Secondary",
                        required: false,
                        max_length: 50,
                    },
                ],
            },
        ],
    };
}

// ── Quest Complete Embed (NO fields — formatted in description) ───────────────
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
                `${TASK_LABELS[k] ?? k} • ${Math.ceil((v?.target ?? 0) / 60)} min ${Emojis.CHECK}`,
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
                ? `${r.orb_quantity} Orbs ${Emojis.ORB} (${r.messages?.name ?? ""})`
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
        `**${questName}**`,
        `*${gameTitle} • ${publisher}*`,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `**${Emojis.STATUS} Task:**\n${taskLines || "Unknown"}`,
        "",
        `**${Emojis.STATS} Progress:** \`${makeBar(100)}\` 100% — Done!`,
        `**${Emojis.CALENDAR} Expires:** <t:${expiresUnix}:R> (${daysLeft}d left)`,
    ];
    if (rewardLines) {
        descLines.push(`**${Emojis.GIFT} Reward:** ${rewardLines}`);
    }

    const embed = {
        color: EMBED_COLOR,
        author: { name: "QUEST CONTROL  /  COMPLETION" },
        title: `${Emojis.CHECK} Quest Complete!`,
        description: descLines.join("\n"),
        footer: { text: "QUEST CONTROL  •  Completion report" },
        timestamp: new Date().toISOString(),
    };
    if (thumbnail) embed.thumbnail = thumbnail;
    return embed;
}

// ── Quest Status Embed (NO fields — formatted in description) ─────────────────
function buildStatusEmbed(info) {
    const taskLabel = TASK_LABELS[info.taskName] ?? info.taskName;
    const targetMins = Math.ceil(info.targetSeconds / 60);
    const doneMins = Math.ceil(info.doneSeconds / 60);
    const bar = makeBar(info.progressPct);
    const expiresUnix = Math.floor(info.expiresAt.getTime() / 1000);
    const daysLeft = Math.max(
        0,
        Math.ceil((info.expiresAt.getTime() - Date.now()) / 86_400_000),
    );

    const statusIcon = info.isCompleted ? Emojis.SUCCESS : info.isEnrolled ? Emojis.REFRESH : Emojis.STAR;
    const statusText = info.isCompleted
        ? "Completed"
        : info.isEnrolled
          ? "In Progress"
          : "Not Enrolled";

    const rewardText = info.orbQuantity
        ? `${info.orbQuantity} Orbs ${Emojis.ORB} (${info.rewardName})`
        : info.rewardName;

    const thumbnail = info.gameTileAsset
        ? {
              url: `https://media.discordapp.net/app-assets/${info.appId}/store/${info.gameTileAsset}.png`,
          }
        : undefined;

    const descLines = [
        `*${info.gameTitle} • ${info.publisher}*`,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `**${Emojis.STATUS} Task:** ${taskLabel} • ${targetMins} min`,
        `**${Emojis.STATS} Progress:** \`${bar}\` ${info.progressPct}% (${doneMins}/${targetMins} min) — ${statusText}`,
        `**${Emojis.CALENDAR} Expires:** <t:${expiresUnix}:R> (${daysLeft}d left)`,
        `**${Emojis.GIFT} Reward:** ${rewardText}`,
    ];

    const embed = {
        color: EMBED_COLOR,
        author: { name: "QUEST CONTROL  /  STATUS" },
        title: `${statusIcon} ${info.name}`,
        description: descLines.join("\n"),
        footer: { text: "QUEST CONTROL  •  Live status" },
        timestamp: new Date().toISOString(),
    };
    if (thumbnail) embed.thumbnail = thumbnail;
    return embed;
}

// ── Format error messages ─────────────────────────────────────────────────────
function formatError(err) {
    const blockedMatch = err.match(/blocked until (.+?)\.?$/i);
    if (blockedMatch) {
        const unixTs = Math.floor(new Date(blockedMatch[1]).getTime() / 1000);
        if (!isNaN(unixTs)) {
            return `${Emojis.WARNING} **Quest enrollment blocked!**\nDiscord temporarily blocked enrollment until: <t:${unixTs}:F> (<t:${unixTs}:R>)`;
        }
    }
    if (
        /401|unauthorized/i.test(err) ||
        /invalid.*token|token.*invalid/i.test(err)
    ) {
        return [
            `${Emojis.KEY} **Invalid or expired token!**`,
            "The token is incorrect or has expired. Please use `!link` to update your token.",
        ].join("\n");
    }
    if (/token is required/i.test(err)) {
        return `${Emojis.ERROR} **Token required!** Please link your account first using \`!link\`.`;
    }
    if (/rate.?limit/i.test(err)) {
        return `${Emojis.TIME} **Rate limited!** Discord returned rate limits. Please try again in a few minutes.`;
    }
    return `${Emojis.ERROR} **Error:** \`${err}\``;
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
                content: `${mentionUser ? `<@${mentionUser}> ` : ""}${Emojis.CLOCK} Fetching quest status...`,
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
                    content: `${mentionUser ? `<@${mentionUser}> ` : ""}${Emojis.SLEEP} No active quests found!`,
                },
            })
            .catch(() => {});
        return;
    }

    await rest
        .post(`/channels/${channelId}/messages`, {
            body: {
                content: `${mentionUser ? `<@${mentionUser}> ` : ""}${Emojis.STATUS} **Found ${quests.length} quest(s):**`,
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
                {
                    name: "test",
                    description: "Send yourself a test quest notification",
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

    const guildId = targetGuildId || process.env.GUILD_ID;
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
        content = `${Emojis.SLEEP} No active quests available to complete right now!`;
    } else {
        content = `${Emojis.SUCCESS} **${result.questsFound}** quest(s) found — **${result.questsCompleted}** completed!`;
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
            reason: `${Emojis.TIME} Your quest or badge run is already in progress, please wait!`,
        };
    }
    const last = lastRunAt.get(userId);
    if (last) {
        const elapsed = Date.now() - last;
        if (elapsed < COOLDOWN_MS) {
            const left = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
            return {
                blocked: true,
                reason: `${Emojis.TIME} Cooldown active! Please wait **${left}s** before running again.`,
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
        console.log(`Prefix command: "${PREFIX}" → ready with modal token linking`);
    });

    // ── Interactions (slash commands + buttons + modals) ──────────────────────
    client.on(
        GatewayDispatchEvents.InteractionCreate,
        async ({ data: interaction, api }) => {
            const channelId = interaction.channel_id ?? interaction.channel?.id ?? "";
            const guildId = interaction.guild_id;
            const userId = interaction.member?.user?.id ?? interaction.user?.id ?? "";
            const customId = interaction.data?.custom_id;
            const userIsOwner = isOwner(userId);

            // ── Category Channel Access Control for Interactions ──────────────────
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
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  ACCESS" },
                            title: `${Emojis.ORB} Quest Channel Only`,
                            description: notice,
                            footer: { text: "QUEST CONTROL  •  Channel restriction" },
                        }],
                        flags: 64,
                    });
                    return;
                }
                rememberQuestUser(guildId, userId);
            }

            const badgeInteraction =
                interaction.type === InteractionType.ApplicationCommand &&
                ["spoof-playtime", "spoof-stream", "spoof-variety"].includes(interaction.data?.name);

            if (badgeInteraction && !userIsOwner) {
                const notice = checkCategoryNotice(categoryChannels, guildId, channelId, "badges");
                if (notice) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        embeds: [{
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  ACCESS" },
                            title: `${Emojis.ORB} Badge Channel Only`,
                            description: notice,
                            footer: { text: "QUEST CONTROL  •  Channel restriction" },
                        }],
                        flags: 64,
                    });
                    return;
                }
            }

            // ── Button clicks ─────────────────────────────────────────────────────
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
                    const removed = removeUserToken(userId);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: removed
                            ? `${Emojis.SUCCESS} Your linked Discord token has been removed from the database.`
                            : `${Emojis.INFO} You do not have any linked token in the database.`,
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
                            content: `${Emojis.CLOCK} Quest processing has started...`,
                        });
                    const editFinal = async (c) =>
                        void (await api.interactions.editReply(CLIENT_ID, interaction.token, { content: c }));

                    console.log(`[Button run - linked token] started (user: ${userId})`);
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
                    console.log(`[Button status - linked token] started (user: ${userId})`);
                    await sendStatusEmbeds(channelId, linkedToken);
                    await api.interactions.editReply(CLIENT_ID, interaction.token, {
                        content: `${Emojis.STATUS} Quest status embeds sent above!`,
                    });
                    return;
                }

                if (customId === BTN_HELP) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        ...buildHelpEmbed(),
                        flags: 64,
                    });
                    return;
                }
                return;
            }

            // ── Modal Submits ─────────────────────────────────────────────────────
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
                            content: `${Emojis.ERROR} Invalid Discord token format. Please check your token and try again.`,
                            flags: 64,
                        });
                        return;
                    }

                    await api.interactions.defer(interaction.id, interaction.token, { flags: 64 });
                    const verify = await verifyAndFetchDiscordUser(submittedToken);
                    if (!verify.valid) {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            content: `${Emojis.ERROR} **Failed to verify Discord token:** ${verify.error || "Invalid user credentials"}. Make sure you copied your full user token.`,
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

            // ── Slash commands ────────────────────────────────────────────────────
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
                        } catch (error) {
                            failed++;
                        }
                        if (index < recipients.length - 1) {
                            await new Promise((resolve) => setTimeout(resolve, 500));
                        }
                    }
                    await api.interactions.editReply(CLIENT_ID, interaction.token, {
                        embeds: [{
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  ANNOUNCEMENT" },
                            title: `${Emojis.ORB} Quest Announcement Broadcast`,
                            description: `Delivered: **${sent}** · Failed: **${failed}** · Total: **${recipients.length}**`,
                            footer: { text: "QUEST CONTROL  •  Announcements" },
                        }],
                    });
                    return;
                }

                if (cmdData.name === "reset") {
                    const removed = removeQuestChannel(questChannels, guildId);
                    removeCategoryChannel(categoryChannels, guildId, "quest");
                    await api.interactions.reply(interaction.id, interaction.token, {
                        embeds: [{
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  SETTINGS" },
                            title: removed ? `${Emojis.CHECK} Quest Channel Cleared` : `${Emojis.INFO} No Channel Set`,
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
                        color: EMBED_COLOR,
                        author: { name: "QUEST CONTROL  /  SETTINGS" },
                        title: `${Emojis.CHECK} Quest Channel Saved`,
                        description: `Quest commands now work only in <#${targetId}>.`,
                    }],
                    flags: 64,
                });
                return;
            }

            if (cmdData?.name === "quest-notify") {
                if (!guildId) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: "Use this command in a server.",
                        flags: 64,
                    });
                    return;
                }
                const subcommand = cmdData.options?.[0]?.name;
                if (subcommand === "status") {
                    const enabled = getQuestRecipients(questAudience, guildId).includes(userId);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        embeds: [{
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  NOTIFICATIONS" },
                            title: enabled ? `${Emojis.ONLINE} Quest DMs On` : `${Emojis.OFFLINE} Quest DMs Off`,
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
                        content: subcommand === "on" ? `${Emojis.SUCCESS} Quest announcement DMs enabled.` : `${Emojis.INFO} Quest announcement DMs disabled.`,
                        flags: 64,
                    });
                    return;
                }
                return;
            }

            if (cmdData?.name === "quest-help") {
                await api.interactions.reply(interaction.id, interaction.token, {
                    ...buildHelpEmbed(),
                    flags: 64,
                });
                return;
            }

            if (cmdData?.name === "quest-ping") {
                await api.interactions.reply(interaction.id, interaction.token, {
                    ...buildPingEmbed(),
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
                const removed = removeUserToken(userId);
                await api.interactions.reply(interaction.id, interaction.token, {
                    content: removed
                        ? `${Emojis.SUCCESS} Your linked Discord token has been removed from the database.`
                        : `${Emojis.INFO} You do not have any linked token in the database.`,
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

            // Enforce linked token requirement for all action slash commands
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
                console.log(`[Slash /quest-status] started (user: ${userId})`);
                await sendStatusEmbeds(channelId, effectiveToken);
                await api.interactions.editReply(CLIENT_ID, interaction.token, {
                    content: `${Emojis.STATUS} Quest status embeds sent above!`,
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
                        content: `${Emojis.CLOCK} Quest processing has started...`,
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
                    content: `${Emojis.CLOCK} Telemetry in progress: Spoofing Game Time badge (${targetHours} hours)...`,
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
                            content: `${Emojis.ERROR} Badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`,
                        });
                    } else {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            embeds: [
                                {
                                    color: EMBED_COLOR,
                                    author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                                    title: `${Emojis.GAME} Game Time Badge Spoofed`,
                                    description: [
                                        `Successfully simulated **${spoofRes.totalHoursSpoofed} hours** across **${spoofRes.gamesSpoofed} game(s)**!`,
                                        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                        `**${Emojis.GAME} Mode:** Game Time Playtime`,
                                        `**${Emojis.TIME} Hours Logged:** ${spoofRes.totalHoursSpoofed}h`,
                                        `**${Emojis.CALENDAR} Profile Sync:** Discord profile badges update in batches within 24-48 hours.`,
                                    ].join("\n"),
                                    footer: { text: "QUEST CONTROL  •  Discord Science Telemetry" },
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
                    content: `${Emojis.CLOCK} Telemetry in progress: Spoofing Streaming badge (${targetHours} stream hours)...`,
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
                            content: `${Emojis.ERROR} Streaming badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`,
                        });
                    } else {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            embeds: [
                                {
                                    color: EMBED_COLOR,
                                    author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                                    title: `${Emojis.STREAM} Streaming Badge Spoofed`,
                                    description: [
                                        `Successfully registered **${spoofRes.totalHoursSpoofed} stream hours** across **${spoofRes.gamesSpoofed} title(s)**!`,
                                        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                        `**${Emojis.STREAM} Mode:** Live Screenshare & Video Streaming`,
                                        `**${Emojis.TIME} Duration Tracked:** ${spoofRes.totalHoursSpoofed} hours`,
                                        `**${Emojis.CALENDAR} Profile Sync:** Discord profile badges update in batches within 24-48 hours.`,
                                    ].join("\n"),
                                    footer: { text: "QUEST CONTROL  •  Discord Science Telemetry" },
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
                    content: `${Emojis.CLOCK} Telemetry in progress: Spoofing Game Variety badge (${targetGames} games)...`,
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
                            content: `${Emojis.ERROR} Variety badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`,
                        });
                    } else {
                        await api.interactions.editReply(CLIENT_ID, interaction.token, {
                            embeds: [
                                {
                                    color: EMBED_COLOR,
                                    author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                                    title: `${Emojis.ACTIVITY} Game Variety Badge Spoofed`,
                                    description: [
                                        `Successfully registered **${spoofRes.gamesSpoofed} distinct detectable games**!`,
                                        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                        `**${Emojis.ACTIVITY} Mode:** Game Variety`,
                                        `**${Emojis.GAME} Games Registered:** ${spoofRes.gamesSpoofed} games`,
                                        `**${Emojis.CALENDAR} Profile Sync:** Discord profile badges update in batches within 24-48 hours.`,
                                    ].join("\n"),
                                    footer: { text: "QUEST CONTROL  •  Discord Science Telemetry" },
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

    // ── Prefix Commands: Quests, Badges & Owner Operations ─────────────────────
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
                        color: 0xed4245,
                        author: { name: "QUEST CONTROL  /  ACCESS CONTROL" },
                        title: `${Emojis.CROSS} Access Denied`,
                        description: "This command is restricted to bot owners configured in the `OWNER_ID` environment variable.",
                    }],
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return false;
            };

            // ── 1. HELP COMMANDS (!help, !quest help) ─────────────────────────
            if (command === "help" || (command === "quest" && subArgs[0]?.toLowerCase() === "help")) {
                await api.channels.createMessage(channelId, {
                    ...buildHelpEmbed(),
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            // ── 2. PING COMMANDS (!ping, !quest ping) ─────────────────────────
            if (command === "ping" || (command === "quest" && subArgs[0]?.toLowerCase() === "ping")) {
                const start = Date.now();
                const sent = await api.channels.createMessage(channelId, {
                    content: `${Emojis.PONG} Pinging...`,
                    message_reference: { message_id: message.id },
                }).catch(() => null);
                const latency = Date.now() - start;
                if (sent?.id) {
                    await api.channels.editMessage(channelId, sent.id, {
                        content: "",
                        embeds: [{
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  SYSTEM" },
                            title: `${Emojis.PONG} Pong!`,
                            description: [
                                "All systems are operational.",
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                `${Emojis.ONLINE} **Gateway Status:** ${isBotConnected ? "Online" : "Standby"}`,
                                `${Emojis.TIME} **API Latency:** ${latency}ms`,
                                `${Emojis.CLOCK} **Uptime:** ${Math.floor(process.uptime() / 60)} minutes`,
                            ].join("\n"),
                            footer: { text: "QUEST CONTROL  •  Diagnostic" },
                            timestamp: new Date().toISOString(),
                        }],
                    }).catch(() => {});
                }
                return;
            }

            // ── 3. OWNER: !sync [guildId] ─────────────────────────────────────
            if (command === "sync") {
                if (!await requireOwner()) return;
                const targetGuild = subArgs[0] || guildId;
                const statusMsg = await api.channels.createMessage(channelId, {
                    content: `${Emojis.CLOCK} Synchronizing slash commands ${targetGuild ? `for guild \`${targetGuild}\`` : "globally"}...`,
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
                                color: 0x57f287,
                                author: { name: "QUEST CONTROL  /  OWNER MANAGEMENT" },
                                title: `${Emojis.CHECK} Commands Synchronized`,
                                description: [
                                    `Successfully registered **${res.count} slash commands**!`,
                                    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                    `**${Emojis.PIN} Scope:** ${targetGuild ? `Guild: \`${targetGuild}\` (Instant)` : "Global"}`,
                                    `**${Emojis.TIME} Duration:** ${elapsed}ms`,
                                ].join("\n"),
                                footer: { text: "QUEST CONTROL  •  Owner Action" },
                                timestamp: new Date().toISOString(),
                            }],
                        }).catch(() => {});
                    }
                } catch (err) {
                    if (statusMsg?.id) {
                        await api.channels.editMessage(channelId, statusMsg.id, {
                            content: `${Emojis.ERROR} Command synchronization failed: \`${err.message || err}\``,
                        }).catch(() => {});
                    }
                }
                return;
            }

            // ── 4. OWNER: !stats ──────────────────────────────────────────────
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
                        color: EMBED_COLOR,
                        author: { name: "QUEST CONTROL  /  BOT DIAGNOSTICS" },
                        title: `${Emojis.STATS} System Metrics & Stats`,
                        description: [
                            `**${Emojis.BOT} Gateway:** ${isBotConnected ? "Online" : "Standby"}`,
                            `**${Emojis.CLOCK} Bot Uptime:** ${hours}h ${minutes}m ${seconds}s`,
                            `**${Emojis.GEAR} Node:** ${process.version}`,
                            `**${Emojis.STATS} Memory (RSS):** ${formatMb(mem.rss)}`,
                            `**${Emojis.STATS} Heap (Used / Total):** ${formatMb(mem.heapUsed)} / ${formatMb(mem.heapTotal)}`,
                            `**${Emojis.RUN} Active Quest Runs:** ${activeUsers.size} user(s)`,
                            `**${Emojis.CROWN} Configured Owners:** ${OWNER_IDS.length} owner(s)`,
                            `**${Emojis.SERVER} Port 3000 Server:** Active`,
                        ].join("\n"),
                        footer: { text: "QUEST CONTROL  •  Owner Diagnostics" },
                        timestamp: new Date().toISOString(),
                    }],
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            // ── 5. OWNER: !owner (help / eval) ────────────────────────────────
            if (command === "owner") {
                if (!await requireOwner()) return;
                const action = subArgs[0]?.toLowerCase();

                if (action === "help") {
                    await api.channels.createMessage(channelId, {
                        embeds: [{
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  OWNER MANUAL" },
                            title: `${Emojis.CROWN} Owner Commands Guide`,
                            description: [
                                "Administrative commands available only to IDs specified in `OWNER_ID` in `.env`.",
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                `**${Emojis.GEAR} Command Deployment:**`,
                                "• `!sync` — register global slash commands",
                                "• `!sync <guildId>` — register instant guild slash commands",
                                "",
                                `**${Emojis.STATS} Diagnostics:**`,
                                "• `!stats` — view uptime, RAM usage, gateway state, and runners",
                                "",
                                `**${Emojis.PIN} Channel Restrictions:**`,
                                "• `!channel-set <quest/badges> <#channel or id>` — restrict commands to designated channel",
                                "• `!channel-set` — view current server configured channels",
                                "• `!channel-set <quest/badges> reset` — clear restriction",
                                "",
                                `**${Emojis.MAIL} Announcements:**`,
                                "• `!announce <quest_name> [details]` — DM registered users",
                                "",
                                `**${Emojis.KEY} Code Execution:**`,
                                "• `!owner eval <code>` — execute JavaScript expression in bot runtime",
                            ].join("\n"),
                            footer: { text: "QUEST CONTROL  •  Owner privileged interface" },
                            timestamp: new Date().toISOString(),
                        }],
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                if (action === "eval") {
                    const codeToEval = subArgs.slice(1).join(" ");
                    if (!codeToEval) {
                        await api.channels.createMessage(channelId, {
                            content: `${Emojis.ERROR} Please provide code to evaluate: \`!owner eval <code>\``,
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
                            content: `${Emojis.ERROR} **Eval Error:** \`\`\`${err.message || err}\`\`\``,
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

            // ── 6. OWNER/ADMIN: !announce <quest> [details] ───────────────────
            if (command === "announce" || (command === "quest" && subArgs[0]?.toLowerCase() === "announce")) {
                if (!await requireOwner()) return;
                const announceArgs = command === "announce" ? subArgs : subArgs.slice(1);
                const questName = announceArgs[0];
                const details = announceArgs.slice(1).join(" ");
                if (!questName) {
                    await api.channels.createMessage(channelId, {
                        content: `${Emojis.ERROR} Usage: \`!announce <quest_name> [optional_details]\``,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }
                if (!guildId) {
                    await api.channels.createMessage(channelId, {
                        content: `${Emojis.ERROR} Announcements can only be sent from inside a server.`,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const recipients = getQuestRecipients(questAudience, guildId);
                if (recipients.length === 0) {
                    await api.channels.createMessage(channelId, {
                        content: `${Emojis.WARNING} No members registered for quest notifications in this guild yet.`,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const progressMsg = await api.channels.createMessage(channelId, {
                    content: `${Emojis.CLOCK} Sending announcement to **${recipients.length}** recipient(s)...`,
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
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  ANNOUNCEMENT" },
                            title: `${Emojis.CHECK} Announcement Broadcast Complete`,
                            description: [
                                `Announced quest: **${questName}**`,
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                `${Emojis.MAIL} **Delivered:** ${sent} users`,
                                `${Emojis.WARNING} **Failed / DMs Closed:** ${failed} users`,
                                `${Emojis.USER} **Total Targeted:** ${recipients.length} users`,
                            ].join("\n"),
                            footer: { text: "QUEST CONTROL  •  Notification System" },
                            timestamp: new Date().toISOString(),
                        }],
                    }).catch(() => {});
                }
                return;
            }

            // ── 7. ACCOUNT LINKING: STRICT MODAL-ONLY ENFORCEMENT ─────────────
            // User requested: "Also no shortcut for !link /link user have to put token in modal only and nowhere else"
            if (command === "link") {
                const tokenInput = subArgs[0]?.trim();
                if (tokenInput && tokenInput.length >= 10) {
                    // User attempted to pass token as a text argument:
                    // Delete message immediately to protect privacy
                    await safeDeleteMessage(api, channelId, message.id);

                    // Refuse token shortcut and enforce modal input
                    await api.channels.createMessage(channelId, {
                        content: `<@${userId}>`,
                        ...buildMustLinkFirstEmbed("account linking"),
                    }).catch(() => {});
                    return;
                }

                // User ran !link without arguments: show embed with modal button
                const rec = getUserRecord(userId);
                await api.channels.createMessage(channelId, {
                    ...buildLinkEmbed(rec),
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            if (command === "unlink" || command === "delink") {
                const removed = removeUserToken(userId);
                await api.channels.createMessage(channelId, {
                    content: removed
                        ? `${Emojis.SUCCESS} <@${userId}> Your linked Discord token has been removed from the database.`
                        : `${Emojis.INFO} <@${userId}> You don't have any linked token in the database. Use \`!link\` to connect your account.`,
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

            // ── 8. OWNER: !channel-set <quest/badges> <channel/id> ─────────────
            if (command === "channel-set") {
                if (!await requireOwner()) return;
                if (!guildId) {
                    await api.channels.createMessage(channelId, { content: `${Emojis.ERROR} This command must be used inside a server.` }).catch(() => {});
                    return;
                }

                if (subArgs.length === 0) {
                    const questChan = getCategoryChannel(categoryChannels, guildId, "quest");
                    const badgeChan = getCategoryChannel(categoryChannels, guildId, "badges");
                    await api.channels.createMessage(channelId, {
                        embeds: [{
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  SERVER CHANNELS" },
                            title: `${Emojis.PIN} Channel Command Restrictions`,
                            description: [
                                "Configured channels for this server. When set, users are restricted to that channel only.",
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                `**${Emojis.ACTIVITY} Quest Commands:** ${questChan ? `<#${questChan}>` : `${Emojis.ONLINE} Any channel`}`,
                                `**${Emojis.GAME} Badge Commands:** ${badgeChan ? `<#${badgeChan}>` : `${Emojis.ONLINE} Any channel`}`,
                                "",
                                `**Usage Guide:**`,
                                "• `!channel-set quest <#channel or id>` — lock quest commands to channel",
                                "• `!channel-set badges <#channel or id>` — lock badge commands to channel",
                                "• `!channel-set quest reset` — remove quest channel lock",
                                "• `!channel-set badges reset` — remove badges channel lock",
                            ].join("\n"),
                            footer: { text: "QUEST CONTROL  •  Owner Channel Configuration" },
                            timestamp: new Date().toISOString(),
                        }],
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const category = normalizeCategory(subArgs[0]);
                if (!category) {
                    await api.channels.createMessage(channelId, {
                        content: `${Emojis.ERROR} Invalid category! Choose either \`quest\` or \`badges\`:\n\`!channel-set <quest/badges> <#channel or id>\``,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const rawTarget = subArgs[1];
                if (!rawTarget) {
                    await api.channels.createMessage(channelId, {
                        content: `${Emojis.ERROR} Please specify a channel or \`reset\`:\n\`!channel-set ${category} <#channel or id>\`\n\`!channel-set ${category} reset\``,
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
                        content: `${Emojis.SUCCESS} **${category === "quest" ? "Quest" : "Badge"}** channel restriction cleared. Users can now use ${category} commands in any channel.`,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                const targetId = rawTarget.replace(/[^0-9]/g, "");
                if (!/^\d{17,20}$/.test(targetId)) {
                    await api.channels.createMessage(channelId, {
                        content: `${Emojis.ERROR} Invalid channel! Mention a channel or provide a valid channel ID: \`!channel-set <quest/badges> #channel\``,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }

                saveCategoryChannel(categoryChannels, guildId, category, targetId);
                if (category === "quest") {
                    saveQuestChannel(questChannels, guildId, targetId);
                }
                await api.channels.createMessage(channelId, {
                    content: `${Emojis.SUCCESS} **${category === "quest" ? "Quest" : "Badge"}** commands locked to <#${targetId}>. Users will only be allowed to use ${category} commands in that channel.`,
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
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  ACCESS" },
                            title: `${Emojis.ORB} Quest Channel Only`,
                            description: notice,
                            footer: { text: "QUEST CONTROL  •  Channel restriction" },
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
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  ACCESS" },
                            title: `${Emojis.ORB} Badge Channel Only`,
                            description: notice,
                            footer: { text: "QUEST CONTROL  •  Channel restriction" },
                        }],
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }
            }
            rememberQuestUser(guildId, userId);

            // ── 9. BADGE SPOOFER COMMANDS ─────────────────────────────────────
            if (command === "badge") {
                const subCmd = subArgs[0]?.toLowerCase();

                if (!subCmd || subCmd === "help") {
                    await api.channels.createMessage(channelId, {
                        ...buildBadgeHelpEmbed(),
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

                // If user pastes a token into badge command, delete and require linking
                const possibleToken = subArgs.find((a) => a && (a.length >= 25 || a.includes(".")));
                if (possibleToken) {
                    await safeDeleteMessage(api, channelId, message.id);
                }

                // Enforce that user MUST link their token first
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

                // ── !badge playtime [hours] [game] ────────────────────────────
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
                        content: `${Emojis.CLOCK} <@${userId}> Telemetry in progress: Spoofing **${hours} hours** on **${matchedGame.name}**...`,
                    }).catch(() => null);

                    startRun(userId);
                    try {
                        const spoofRes = await spoofBadges(token, {
                            mode: "custom",
                            hours,
                            gameIds: [matchedGame.id],
                        });

                        if (!spoofRes.success) {
                            const errorContent = `${Emojis.ERROR} <@${userId}> Badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`;
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: errorContent }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { content: errorContent }).catch(() => {});
                            }
                        } else {
                            const embed = {
                                color: EMBED_COLOR,
                                author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                                title: `${Emojis.GAME} Game Time Badge Spoofed`,
                                description: [
                                    `<@${userId}> Successfully registered **${spoofRes.totalHoursSpoofed} hours** for **${matchedGame.name}**!`,
                                    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                    `**${Emojis.GAME} Game Title:** ${matchedGame.name}`,
                                    `**${Emojis.TIME} Hours Logged:** ${spoofRes.totalHoursSpoofed}h`,
                                    `**${Emojis.PIN} Application ID:** \`${matchedGame.id}\``,
                                    `**${Emojis.CALENDAR} Profile Sync:** Discord profile badges update in batches within 24-48 hours.`,
                                ].join("\n"),
                                footer: { text: "QUEST CONTROL  •  Discord Science Telemetry Pipeline" },
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

                // ── !badge stream [hours] [game] ──────────────────────────────
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
                        content: `${Emojis.CLOCK} <@${userId}> Telemetry in progress: Spoofing **${hours} streaming hours** on **${matchedGame.name}**...`,
                    }).catch(() => null);

                    startRun(userId);
                    try {
                        const spoofRes = await spoofBadges(token, {
                            mode: "stream",
                            hours,
                            gameIds: [matchedGame.id],
                        });

                        if (!spoofRes.success) {
                            const errorContent = `${Emojis.ERROR} <@${userId}> Streaming badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`;
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: errorContent }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { content: errorContent }).catch(() => {});
                            }
                        } else {
                            const embed = {
                                color: EMBED_COLOR,
                                author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                                title: `${Emojis.STREAM} Streaming Badge Spoofed`,
                                description: [
                                    `<@${userId}> Successfully registered **${spoofRes.totalHoursSpoofed} stream hours** for **${matchedGame.name}**!`,
                                    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                    `**${Emojis.STREAM} Mode:** Live Screenshare & Stream Telemetry`,
                                    `**${Emojis.GAME} Stream Title:** ${matchedGame.name}`,
                                    `**${Emojis.TIME} Stream Duration:** ${spoofRes.totalHoursSpoofed} hours`,
                                    `**${Emojis.CALENDAR} Profile Sync:** Discord profile badges update in batches within 24-48 hours.`,
                                ].join("\n"),
                                footer: { text: "QUEST CONTROL  •  Discord Science Telemetry Pipeline" },
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

                // ── !badge variety [count] ────────────────────────────────────
                if (subCmd === "variety") {
                    const countRaw = subArgs[1];
                    const countNum = parseInt(countRaw || "25", 10);
                    const count = isNaN(countNum) ? 25 : Math.max(5, Math.min(countNum, 50));

                    const progressMsg = await api.channels.createMessage(channelId, {
                        content: `${Emojis.CLOCK} <@${userId}> Telemetry in progress: Spoofing Game Variety badge with **${count} games**...`,
                    }).catch(() => null);

                    startRun(userId);
                    try {
                        const spoofRes = await spoofBadges(token, {
                            mode: "variety",
                            gameCount: count,
                            hours: 5,
                        });

                        if (!spoofRes.success) {
                            const errorContent = `${Emojis.ERROR} <@${userId}> Variety badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`;
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: errorContent }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { content: errorContent }).catch(() => {});
                            }
                        } else {
                            const embed = {
                                color: EMBED_COLOR,
                                author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                                title: `${Emojis.ACTIVITY} Game Variety Badge Spoofed`,
                                description: [
                                    `<@${userId}> Successfully simulated **${spoofRes.gamesSpoofed} distinct detectable games**!`,
                                    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                    `**${Emojis.ACTIVITY} Badge Mode:** Game Variety`,
                                    `**${Emojis.GAME} Games Registered:** ${spoofRes.gamesSpoofed} games`,
                                    `**${Emojis.CALENDAR} Profile Sync:** Discord profile badges update in batches within 24-48 hours.`,
                                ].join("\n"),
                                footer: { text: "QUEST CONTROL  •  Discord Science Telemetry Pipeline" },
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

                // ── !badge all [hours] ────────────────────────────────────────
                if (subCmd === "all") {
                    const hoursRaw = subArgs[1];
                    const hoursNum = parseInt(hoursRaw || "100", 10);
                    const hours = isNaN(hoursNum) ? 100 : Math.max(1, Math.min(hoursNum, 500));

                    const progressMsg = await api.channels.createMessage(channelId, {
                        content: `${Emojis.CLOCK} <@${userId}> Telemetry in progress: Spoofing **All Badges** (Playtime & Streaming) with **${hours} hours** on top games...`,
                    }).catch(() => null);

                    startRun(userId);
                    try {
                        const spoofRes = await spoofBadges(token, {
                            mode: "all",
                            hours,
                        });

                        if (!spoofRes.success) {
                            const errorContent = `${Emojis.ERROR} <@${userId}> Combined badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`;
                            if (progressMsg?.id) {
                                await api.channels.editMessage(channelId, progressMsg.id, { content: errorContent }).catch(() => {});
                            } else {
                                await api.channels.createMessage(channelId, { content: errorContent }).catch(() => {});
                            }
                        } else {
                            const embed = {
                                color: EMBED_COLOR,
                                author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                                title: `${Emojis.FIRE} All Profile Badges Spoofed`,
                                description: [
                                    `<@${userId}> Successfully simulated **Playtime & Streaming** across **${spoofRes.gamesSpoofed} games**!`,
                                    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                                    `**${Emojis.FIRE} Mode:** Combined Game Playtime & Live Streaming`,
                                    `**${Emojis.TIME} Hours Logged:** ~${spoofRes.totalHoursSpoofed} hours`,
                                    `**${Emojis.CALENDAR} Profile Sync:** Discord profile badges update in batches within 24-48 hours.`,
                                ].join("\n"),
                                footer: { text: "QUEST CONTROL  •  Discord Science Telemetry Pipeline" },
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
                    content: `Invalid badge command. Use \`!badge help\`, \`!badge playtime [hours]\`, \`!badge stream [hours]\`, or \`!badge variety [count]\`.`,
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            // ── 10. QUEST COMMANDS: !quest [run|status|panel] ─────────────────
            if (command === "quest") {
                const subCmd = subArgs[0]?.toLowerCase();

                // If user pastes a token into quest command, delete and require linking
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
                    console.log(`[Prefix status] started (user: ${userId})`);
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
                        content: `${Emojis.CLOCK} <@${userId}> Quest processing has started...`,
                    }).catch(() => null);

                    const editFinal = async (txt) => {
                        if (sentMsg?.id) {
                            await api.channels.editMessage(channelId, sentMsg.id, {
                                content: `<@${userId}> ${txt}`,
                            }).catch(() => {});
                        }
                    };

                    console.log(`[Prefix run] started (user: ${userId})`);
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
        console.log("[Discord Bot] Standby: Valid BOT_TOKEN or CLIENT_ID not set in env. Bot Gateway is idle.");
        return false;
    }
}

if (hasValidBotConfig && client && gateway) {
    initBotListeners(client, gateway);
} else {
    console.log("[Discord Bot] Standby: Real BOT_TOKEN or CLIENT_ID not provided. Dev server is running on port 3000.");
}

// ── Lightweight HTTP Health Server for Dev Environment (Port 3000) ────────────
const HTTP_PORT = parseInt(process.env.PORT || "3000", 10);
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
