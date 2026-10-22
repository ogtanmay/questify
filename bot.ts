import http from "node:http";
import {
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
} from "discord-api-types/v10";
import { Client } from "@discordjs/core";
import { REST } from "@discordjs/rest";
import { WebSocketManager } from "@discordjs/ws";
import { runQuestsForToken, fetchQuestsStatus } from "./src/questRunner";
import type { Quest, QuestStatusInfo } from "./src/questRunner";
import {
    loadQuestChannels,
    questChannelNotice,
    removeQuestChannel,
    saveQuestChannel,
} from "./src/questChannels";
import {
    getQuestRecipients,
    loadQuestAudience,
    recordQuestUser,
    setQuestNotification,
} from "./src/questAudience";
import { spoofBadges, POPULAR_GAMES } from "./src/badgeSpoofer";

function isRealConfigToken(val: string | undefined): boolean {
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

export const BOT_TOKEN = process.env.BOT_TOKEN || "";
export const CLIENT_ID = process.env.CLIENT_ID || "";
export const hasValidBotConfig = isRealConfigToken(BOT_TOKEN) && isRealConfigToken(CLIENT_ID);

export let isBotConnected = false;

export function isDiscordBotRunning(): boolean {
    return isBotConnected;
}

export const OWNER_IDS = (
    process.env.OWNER_ID ||
    process.env.OWNER_IDS ||
    ""
)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function isOwner(userId: string): boolean {
    if (!userId) return false;
    return OWNER_IDS.includes(userId);
}

const PREFIX = "!quest";
const questChannels = loadQuestChannels();
const questAudience = loadQuestAudience();
const EMBED_COLOR = 0x2b2d31;
const BRAND_COLOR = EMBED_COLOR;

const INTENTS =
    GatewayIntentBits.Guilds |
    GatewayIntentBits.GuildMessages |
    GatewayIntentBits.MessageContent |
    GatewayIntentBits.DirectMessages;

let rest: REST = null as any;
let gateway: WebSocketManager = null as any;
let client: Client = null as any;

if (hasValidBotConfig) {
    try {
        rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
        gateway = new WebSocketManager({
            token: BOT_TOKEN,
            intents: INTENTS,
            rest,
        });
        client = new Client({ rest, gateway });
    } catch (e: any) {
        console.error("[Discord Bot] Initialization error:", e.message);
    }
}

// ── Custom IDs ────────────────────────────────────────────────────────────────
const BTN_RUN = "quest_run_btn";
const BTN_STATUS = "quest_status_btn";
const BTN_HELP = "quest_help_btn";
const MODAL_RUN = "quest_run_modal";
const MODAL_STATUS = "quest_status_modal";
const INPUT_TOKEN = "user_token_input";

// ── Helpers ───────────────────────────────────────────────────────────────────
const TASK_LABELS: Record<string, string> = {
    WATCH_VIDEO: "📺 Watch Video",
    WATCH_VIDEO_ON_MOBILE: "📱 Watch Video on Mobile",
    PLAY_ON_DESKTOP: "🖥️ Play on Desktop",
    PLAY_ON_XBOX: "🎮 Play on Xbox",
    PLAY_ON_PLAYSTATION: "🎮 Play on PlayStation",
    PLAY_ACTIVITY: "🎯 Play Activity",
    ACHIEVEMENT_IN_ACTIVITY: "🏆 Achievement",
    STREAM_ON_DESKTOP: "📡 Stream on Desktop",
};

function makeBar(pct: number, len = 12): string {
    const filled = Math.round((pct / 100) * len);
    return "█".repeat(filled) + "░".repeat(len - filled);
}

// ── "Token Required" embed + buttons ─────────────────────────────────────────
function buildTokenRequiredEmbed() {
    return {
        embeds: [
            {
                color: BRAND_COLOR,
                author: { name: "QUEST CONTROL  /  DASHBOARD" },
                title: "✦ Your quest hub",
                description:
                    "Everything you need, right here. Pick an action below to get started.\n" +
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
                fields: [
                    {
                        name: "▶️  Run quests",
                        value: "Start a run using the private token popup.",
                        inline: false,
                    },
                    {
                        name: "📋  Check status",
                        value: "See progress, rewards and time remaining.",
                        inline: false,
                    },
                    {
                        name: "❔  Need help?",
                        value:
                            "Open the guide for commands and safety tips.",
                        inline: false,
                    },
                ],
                footer: { text: "QUEST CONTROL  •  Never post a token publicly" },
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
                        emoji: { name: "▶️" },
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_STATUS,
                        label: "Check Status",
                        emoji: { name: "📋" },
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        custom_id: BTN_HELP,
                        label: "Help",
                        emoji: { name: "❔" },
                    },
                ],
            },
        ],
    };
}

function buildHelpEmbed() {
    return {
        embeds: [
            {
                color: BRAND_COLOR,
                author: { name: "QUEST CONTROL  /  COMMAND GUIDE" },
                title: "✦ Quest & Badge Bot Command Center",
                description:
                    "Complete reference of all slash and prefix commands available in this bot.\n━━━━━━━━━━━━━━━━━━━━━━━━━━",
                fields: [
                    {
                        name: "⚡  Slash Commands",
                        value:
                            "`/run-quests` — auto-complete active Discord quests\n" +
                            "`/quest-status` — check your active quests & progress\n" +
                            "`/spoof-playtime` — simulate game hours for profile Game Time badge\n" +
                            "`/spoof-variety` — simulate distinct games for Game Variety badge\n" +
                            "`/quest-help` — open this command guide\n" +
                            "`/quest-ping` — check gateway & connectivity status",
                        inline: false,
                    },
                    {
                        name: "⌨️  Prefix Commands (Quests & Status)",
                        value:
                            "`!help` or `!quest help` — open this command guide\n" +
                            "`!ping` or `!quest ping` — bot latency, memory & gateway status\n" +
                            "`!quest` or `!quest panel` — show interactive button dashboard\n" +
                            "`!quest run <token>` — auto-complete quests *(message auto-deleted)*\n" +
                            "`!quest status <token>` — view quest progress *(message auto-deleted)*",
                        inline: false,
                    },
                    {
                        name: "🎮  Prefix Commands (Discord Profile Badges)",
                        value:
                            "`!badge playtime <token> [hours] [game]` — spoof hours on Game Time badge\n" +
                            "`!badge variety <token> [games_count]` — spoof 10-50 games on Variety badge\n" +
                            "`!badge games` — list supported top games and application IDs\n" +
                            "`!badge help` — explain how science telemetry & badge sync work",
                        inline: false,
                    },
                    {
                        name: "👑  Owner Commands (OWNER_ID in .env)",
                        value:
                            "`!sync [guildId]` — force instant slash command registration\n" +
                            "`!stats` — bot uptime, RAM usage, gateway state & runners\n" +
                            "`!announce <quest_name> [details]` — DM registered quest recipients\n" +
                            "`!setchannel <#channel>` — lock quest commands to designated channel\n" +
                            "`!resetchannel` — remove channel lock restriction\n" +
                            "`!owner help` — owner administrative commands\n" +
                            "`!owner eval <code>` — execute JavaScript expression safely",
                        inline: false,
                    },
                    {
                        name: "🔒  Safety & Token Privacy",
                        value:
                            "Prefix commands containing user tokens are immediately deleted to protect your account. Discord badges update on user profiles in batches within 24-48 hours.",
                        inline: false,
                    },
                ],
                footer: { text: "QUEST CONTROL  •  Prefix & Slash Commands" },
                timestamp: new Date().toISOString(),
            },
        ],
    };
}

function buildBadgeHelpEmbed() {
    return {
        embeds: [
            {
                color: EMBED_COLOR,
                author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                title: "✦ Discord Badge Spoofer Guide",
                description:
                    "This engine uses Discord's official `/api/v9/science` analytics pipeline to legitimately register game activity telemetry for Discord profile badges.\n━━━━━━━━━━━━━━━━━━━━━━━━━━",
                fields: [
                    {
                        name: "🎮  Game Time Badge",
                        value: "Simulates continuous gameplay duration for detectable titles. Use `!badge playtime <token> 100` or specify a game like `!badge playtime <token> 150 valorant`.",
                        inline: false,
                    },
                    {
                        name: "🎯  Game Variety Badge",
                        value: "Simulates unique detectable game launches across Discord's catalog. Use `!badge variety <token> 30` to simulate 30 unique games.",
                        inline: false,
                    },
                    {
                        name: "📋  Supported Games",
                        value: "Use `!badge games` to view all 40+ pre-configured top detectable game titles and application IDs.",
                        inline: false,
                    },
                    {
                        name: "⏳  When do badges show up?",
                        value: "Discord evaluates profile badge telemetry in asynchronous backend batches. Badges appear on your Discord profile within **24 to 48 hours**.",
                        inline: false,
                    },
                ],
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
                title: "✦ Supported Detectable Games",
                description: `Discord tracks game badges for verified games in their catalog. Here are the top popular games available for spoofing:\n\n${list}\n\n*...and more in Discord's catalog.*`,
                footer: { text: "QUEST CONTROL  •  Use !badge playtime <token> <hours> <game_id>" },
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
                title: "✦ All systems online",
                description:
                    "The bot is connected and ready to receive commands.",
                fields: [
                    {
                        name: "📡  Status",
                        value: "🟢 Operational",
                        inline: true,
                    },
                    {
                        name: "🧭  Commands",
                        value: "Use `/quest-help` to begin",
                        inline: true,
                    },
                ],
                footer: { text: "QUEST CONTROL  •  System status" },
                timestamp: new Date().toISOString(),
            },
        ],
    };
}

function buildQuestAnnouncementEmbed(questName: string, details?: string) {
    return {
        color: EMBED_COLOR,
        author: { name: "QUEST CONTROL  /  NEW QUEST" },
        title: `✦ New quest: ${questName}`,
        description:
            "A new Discord Quest is available." +
            (details ? `\n\n${details}` : ""),
        footer: { text: "QUEST CONTROL  •  You received this because you used quest notifications" },
        timestamp: new Date().toISOString(),
    };
}

function rememberQuestUser(guildId: string | undefined, userId: string): void {
    if (!guildId || !userId) return;
    try {
        recordQuestUser(questAudience, guildId, userId);
    } catch (error) {
        console.error("Could not record quest notification recipient:", error);
    }
}

async function sendQuestAnnouncement(
    userId: string,
    questName: string,
    details?: string,
): Promise<void> {
    const dm = (await rest.post("/users/@me/channels" as any, {
        body: { recipient_id: userId },
    })) as any;
    await rest.post(`/channels/${dm.id}/messages` as any, {
        body: {
            embeds: [buildQuestAnnouncementEmbed(questName, details)],
            allowed_mentions: { parse: [] },
        },
    });
}

// ── Token modal ───────────────────────────────────────────────────────────────
function buildTokenModal(customId: string, title: string) {
    return {
        title,
        custom_id: customId,
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.TextInput,
                        style: TextInputStyle.Short,
                        custom_id: INPUT_TOKEN,
                        label: "Your Discord user token",
                        placeholder:
                            "Paste your token here — it starts with your ID",
                        required: true,
                        min_length: 20,
                    },
                ],
            },
        ],
    };
}

// ── Build "Quest Complete" embed ──────────────────────────────────────────────
function buildCompleteEmbed(quest: Quest) {
    const cfg = quest.config;
    const questName = cfg.messages.quest_name;
    const gameTitle = cfg.messages.game_title;
    const publisher = cfg.messages.game_publisher;
    const appId = cfg.application.id;

    const tasks = cfg.task_config_v2?.tasks ?? {};
    const taskLines = Object.entries(tasks)
        .map(
            ([k, v]: [string, any]) =>
                `${TASK_LABELS[k] ?? k} • ${Math.ceil((v?.target ?? 0) / 60)} min ✓`,
        )
        .join("\n");

    const expiresAt = new Date(cfg.expires_at);
    const expiresUnix = Math.floor(expiresAt.getTime() / 1000);
    const daysLeft = Math.max(
        0,
        Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000),
    );

    const rewards = cfg.rewards_config?.rewards ?? [];
    const rewardLines = (rewards as any[])
        .map((r: any) =>
            r.orb_quantity
                ? `${r.orb_quantity} Orbs ✦ (${r.messages?.name ?? ""})`
                : (r.messages?.name ?? ""),
        )
        .join("\n");

    const gameTile = cfg.assets?.game_tile;
    const thumbnail = gameTile
        ? {
              url: `https://media.discordapp.net/app-assets/${appId}/store/${gameTile}.png`,
          }
        : undefined;

    const embed: any = {
        color: EMBED_COLOR,
        author: { name: "QUEST CONTROL  /  COMPLETION" },
        title: "✦ Quest complete",
        description: `**${questName}**\n*${gameTitle} • ${publisher}*`,
        fields: [
            { name: "📋  Task", value: taskLines || "Unknown", inline: false },
            {
                name: "📅  Expires",
                value: `<t:${expiresUnix}:R> (${daysLeft}d left)`,
                inline: true,
            },
            {
                name: "📊  Progress",
                value: `\`${makeBar(100)}\`  100% — Done!`,
                inline: true,
            },
        ],
        footer: { text: "QUEST CONTROL  •  Completion report" },
        timestamp: new Date().toISOString(),
    };
    if (rewardLines)
        embed.fields.push({
            name: "🎁  Reward",
            value: rewardLines,
            inline: false,
        });
    if (thumbnail) embed.thumbnail = thumbnail;
    return embed;
}

// ── Build "Quest Status" embed (one per quest) ────────────────────────────────
function buildStatusEmbed(info: QuestStatusInfo) {
    const taskLabel = TASK_LABELS[info.taskName] ?? info.taskName;
    const targetMins = Math.ceil(info.targetSeconds / 60);
    const doneMins = Math.ceil(info.doneSeconds / 60);
    const bar = makeBar(info.progressPct);
    const expiresUnix = Math.floor(info.expiresAt.getTime() / 1000);
    const daysLeft = Math.max(
        0,
        Math.ceil((info.expiresAt.getTime() - Date.now()) / 86_400_000),
    );

    const statusIcon = info.isCompleted ? "✅" : info.isEnrolled ? "🔄" : "🆕";
    const statusText = info.isCompleted
        ? "Completed"
        : info.isEnrolled
          ? "In Progress"
          : "Not Enrolled";

    const rewardText = info.orbQuantity
        ? `${info.orbQuantity} Orbs ✦ (${info.rewardName})`
        : info.rewardName;

    const thumbnail = info.gameTileAsset
        ? {
              url: `https://media.discordapp.net/app-assets/${info.appId}/store/${info.gameTileAsset}.png`,
          }
        : undefined;

    const embed: any = {
        color: EMBED_COLOR,
        author: { name: "QUEST CONTROL  /  STATUS" },
        title: `${statusIcon} ${info.name}`,
        description: `*${info.gameTitle} • ${info.publisher}*`,
        fields: [
            {
                name: "📋  Task",
                value: `${taskLabel} • ${targetMins} min`,
                inline: false,
            },
            {
                name: "📊  Progress",
                value: `\`${bar}\`  ${info.progressPct}% (${doneMins}/${targetMins} min) — ${statusText}`,
                inline: false,
            },
            {
                name: "📅  Expires",
                value: `<t:${expiresUnix}:R> (${daysLeft}d left)`,
                inline: true,
            },
            { name: "🎁  Reward", value: rewardText, inline: true },
        ],
        footer: { text: "QUEST CONTROL  •  Live status" },
        timestamp: new Date().toISOString(),
    };
    if (thumbnail) embed.thumbnail = thumbnail;
    return embed;
}

// ── Format error messages ─────────────────────────────────────────────────────
function formatError(err: string): string {
    const blockedMatch = err.match(/blocked until (.+?)\.?$/i);
    if (blockedMatch) {
        const unixTs = Math.floor(new Date(blockedMatch[1]).getTime() / 1000);
        if (!isNaN(unixTs)) {
            return `🚫 **Quest enrollment blocked!**\nDiscord ne temporarily block kar diya hai.\n\n**Unblock hoga:** <t:${unixTs}:F> (<t:${unixTs}:R>)`;
        }
    }
    if (
        /401|unauthorized/i.test(err) ||
        /invalid.*token|token.*invalid/i.test(err)
    ) {
        return [
            "🔑 **Invalid or expired token!**",
            "The token is incorrect or has expired.",
            "",
            "**How to get a token?**",
            "Check tutorials given in the channel.",
        ].join("\n");
    }
    if (/token is required/i.test(err)) {
        return "❌ **did not give token!** Command ke saath apna Discord token do.";
    }
    if (/rate.?limit/i.test(err)) {
        return "⏱️ **Rate limited!** Discord ne temporarily block kar diya — thodi der baad try karo.";
    }
    return `❌ **Error:** \`${err}\``;
}

// ── Send quest complete embed ─────────────────────────────────────────────────
async function sendQuestEmbed(channelId: string, quest: Quest) {
    await rest
        .post(`/channels/${channelId}/messages` as any, {
            body: { embeds: [buildCompleteEmbed(quest)] },
        })
        .catch((e: any) =>
            console.error("Failed to send quest embed:", e.message),
        );
}

// ── Send status embeds ────────────────────────────────────────────────────────
async function sendStatusEmbeds(
    channelId: string,
    token: string,
    mentionUser?: string,
) {
    const working = (await rest
        .post(`/channels/${channelId}/messages` as any, {
            body: {
                content: `${mentionUser ? `<@${mentionUser}> ` : ""}⏳ Quest status fetch ho rahi hai...`,
            },
        })
        .catch(() => null)) as any;

    const { quests, error } = await fetchQuestsStatus(token);

    if (error) {
        await rest
            .patch(`/channels/${channelId}/messages/${working?.id}` as any, {
                body: {
                    content: `${mentionUser ? `<@${mentionUser}> ` : ""}${formatError(error)}`,
                },
            })
            .catch(() => {});
        return;
    }

    if (working?.id) {
        await rest
            .delete(`/channels/${channelId}/messages/${working.id}` as any)
            .catch(() => {});
    }

    if (quests.length === 0) {
        await rest
            .post(`/channels/${channelId}/messages` as any, {
                body: {
                    content: `${mentionUser ? `<@${mentionUser}> ` : ""}😴 Koi active quest nahi mili!`,
                },
            })
            .catch(() => {});
        return;
    }

    await rest
        .post(`/channels/${channelId}/messages` as any, {
            body: {
                content: `${mentionUser ? `<@${mentionUser}> ` : ""}📋 **${quests.length} quest(s) mili — current status:**`,
            },
        })
        .catch(() => {});

    for (const info of quests) {
        await rest
            .post(`/channels/${channelId}/messages` as any, {
                body: { embeds: [buildStatusEmbed(info)] },
            })
            .catch(() => {});
    }
}

// ── Register slash commands ───────────────────────────────────────────────────
export async function registerCommands(
    targetGuildId?: string,
    customBotToken?: string,
    customClientId?: string,
) {
    const token = (customBotToken && customBotToken.trim()) || BOT_TOKEN;
    const clientId = (customClientId && customClientId.trim()) || CLIENT_ID;

    if (!token || !clientId || !isRealConfigToken(token) || !isRealConfigToken(clientId)) {
        throw new Error("Discord Bot Token or Client ID is missing or placeholder. Please provide your bot credentials.");
    }

    const restClient = new REST({ version: "10" }).setToken(token);

    const commands = [
        {
            name: "run-quests",
            description: "Auto-complete your Discord quests using your user token",
            options: [
                {
                    name: "token",
                    description: "Your Discord user token (reply is private/ephemeral)",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "quest-status",
            description: "Check your active quests and progress without completing them",
            options: [
                {
                    name: "token",
                    description: "Your Discord user token (reply is private/ephemeral)",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "spoof-playtime",
            description: "Boost your Game Time badge hours on your Discord profile",
            options: [
                {
                    name: "token",
                    description: "Your Discord user token (reply is private/ephemeral)",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
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
            name: "spoof-variety",
            description: "Boost your Game Variety badge by simulating many different games",
            options: [
                {
                    name: "token",
                    description: "Your Discord user token (reply is private/ephemeral)",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
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
            description: "Open the Quest Bot command and safety guide",
        },
        {
            name: "quest-ping",
            description: "Check whether the Quest Bot is online",
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
            name: "quest-config",
            description: "View the configured quest channel for this server",
            dm_permission: false,
            default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
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
        await restClient.put(`/applications/${clientId}/commands` as any, { body: commands });
        console.log(`[Discord Bot] Registered ${commands.length} global slash commands for app ${clientId}.`);
    } catch (err: any) {
        console.error("[Discord Bot] Global slash command registration failed:", err.message);
        throw err;
    }

    const guildId = targetGuildId || process.env.GUILD_ID;
    if (guildId) {
        try {
            await restClient.put(`/applications/${clientId}/guilds/${guildId}/commands` as any, { body: commands });
            console.log(`[Discord Bot] Registered guild slash commands for guild ${guildId} (instant).`);
        } catch (err: any) {
            console.warn(`[Discord Bot] Guild slash command registration failed for ${guildId}:`, err.message);
        }
    }

    return { success: true, count: commands.length };
}

// ── Core run + report helper ──────────────────────────────────────────────────
async function runAndReport(
    userToken: string,
    channelId: string,
    sendInitial: () => Promise<any>,
    editFinal: (content: string) => Promise<void>,
) {
    await sendInitial();

    const result = await runQuestsForToken(userToken, (quest) =>
        sendQuestEmbed(channelId, quest),
    ).catch((err: any) => ({
        output: "",
        error: err.message ?? String(err),
        questsFound: 0,
        questsCompleted: 0,
    }));

    let content: string;
    if (result.error) {
        content = formatError(result.error);
    } else if (result.questsFound === 0) {
        content = "😴 I don't have any active quests now!";
    } else {
        content = `✅ **${result.questsFound}** quest(s) mili — **${result.questsCompleted}** complete!`;
    }

    await editFinal(content.slice(0, 2000));
}

// ── Cooldown system ───────────────────────────────────────────────────────────
const COOLDOWN_MS = 60_000;
const activeUsers = new Set<string>();
const lastRunAt = new Map<string, number>();

function checkCooldown(userId: string): { blocked: boolean; reason?: string } {
    if (activeUsers.has(userId)) {
        return {
            blocked: true,
            reason: "⏳ Your quest is already running, wait!",
        };
    }
    const last = lastRunAt.get(userId);
    if (last) {
        const elapsed = Date.now() - last;
        if (elapsed < COOLDOWN_MS) {
            const left = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
            return {
                blocked: true,
                reason: `⏱️ Cooldown! **${left}s** baad try karo.`,
            };
        }
    }
    return { blocked: false };
}

function startRun(userId: string) {
    activeUsers.add(userId);
    lastRunAt.set(userId, Date.now());
}
function finishRun(userId: string) {
    activeUsers.delete(userId);
}

// ── Bot Listeners ─────────────────────────────────────────────────────────────
function initBotListeners(client: Client, gateway: WebSocketManager) {
    // ── Ready ─────────────────────────────────────────────────────────────────
    client.once(GatewayDispatchEvents.Ready, async ({ data }) => {
        console.log(`Bot logged in as @${data.user.username} (${data.user.id})`);
        await registerCommands().catch((e) =>
            console.error("Failed to register commands:", e.message),
        );
        console.log(`Prefix command: "${PREFIX}" → shows Link Token button`);
    });

// ── Interactions (slash commands + buttons + modals) ──────────────────────────
client.on(
    GatewayDispatchEvents.InteractionCreate,
    async ({ data: interaction, api }) => {
        const channelId =
            (interaction as any).channel_id ?? interaction.channel?.id ?? "";
        const guildId = (interaction as any).guild_id as string | undefined;
        const userId =
            (interaction as any).member?.user?.id ??
            (interaction as any).user?.id ??
            "";
        const customId = (interaction.data as any)?.custom_id as string | undefined;
        const questInteraction =
            (interaction.type === InteractionType.MessageComponent &&
                [BTN_RUN, BTN_STATUS, BTN_HELP].includes(customId ?? "")) ||
            (interaction.type === InteractionType.ModalSubmit &&
                [MODAL_RUN, MODAL_STATUS].includes(customId ?? "")) ||
            (interaction.type === InteractionType.ApplicationCommand &&
                ["run-quests", "quest-status", "quest-help", "quest-ping", "spoof-playtime", "spoof-variety"].includes(
                    (interaction.data as any)?.name,
                ));
        if (questInteraction) {
            const notice = questChannelNotice(questChannels, guildId, channelId);
            if (notice) {
                await api.interactions.reply(interaction.id, interaction.token, {
                    embeds: [{
                        color: EMBED_COLOR,
                        author: { name: "QUEST CONTROL  /  ACCESS" },
                        title: "✦ Quest channel only",
                        description: notice,
                        footer: { text: "QUEST CONTROL  •  Channel restriction" },
                    }],
                    flags: 64,
                });
                return;
            }
            rememberQuestUser(guildId, userId);
        }

        // ── Button clicks ─────────────────────────────────────────────────────────
        if (interaction.type === InteractionType.MessageComponent) {

            if (customId === BTN_RUN) {
                const cd = checkCooldown(userId);
                if (cd.blocked) {
                    await api.interactions.reply(
                        interaction.id,
                        interaction.token,
                        {
                            content: cd.reason!,
                            flags: 64,
                        },
                    );
                    return;
                }
                await api.interactions.createModal(
                    interaction.id,
                    interaction.token,
                    buildTokenModal(MODAL_RUN, "Run Quests") as any,
                );
                return;
            }

            if (customId === BTN_STATUS) {
                await api.interactions.createModal(
                    interaction.id,
                    interaction.token,
                    buildTokenModal(MODAL_STATUS, "Check Quest Status") as any,
                );
                return;
            }

            if (customId === BTN_HELP) {
                await api.interactions.reply(
                    interaction.id,
                    interaction.token,
                    {
                        ...(buildHelpEmbed() as any),
                        flags: 64,
                    },
                );
                return;
            }
            return;
        }

        // ── Modal submits ─────────────────────────────────────────────────────────
        if (interaction.type === InteractionType.ModalSubmit) {
            const components = (interaction.data as any)?.components as any[];
            const userToken =
                components?.[0]?.components?.[0]?.value?.trim() ?? "";

            if (!userToken) {
                await api.interactions.reply(
                    interaction.id,
                    interaction.token,
                    {
                        content: "❌ I did not get the token. Try again.",
                        flags: 64,
                    },
                );
                return;
            }

            // Modal: Check Status
            if (customId === MODAL_STATUS) {
                await api.interactions.defer(
                    interaction.id,
                    interaction.token,
                    { flags: 64 },
                );
                console.log(`[Modal status] started (user: ${userId})`);
                await sendStatusEmbeds(channelId, userToken);
                await api.interactions.editReply(
                    CLIENT_ID!,
                    interaction.token,
                    {
                        content: "📋 Status embeds sent above!",
                    },
                );
                return;
            }

            // Modal: Run Quests
            if (customId === MODAL_RUN) {
                const cd = checkCooldown(userId);
                if (cd.blocked) {
                    await api.interactions.reply(
                        interaction.id,
                        interaction.token,
                        {
                            content: cd.reason!,
                            flags: 64,
                        },
                    );
                    return;
                }

                await api.interactions.defer(
                    interaction.id,
                    interaction.token,
                    { flags: 64 },
                );
                const sendInitial = async () =>
                    api.interactions.editReply(CLIENT_ID!, interaction.token, {
                        content: "⏳ Quest processing has started...",
                    });
                const editFinal = async (c: string) =>
                    void (await api.interactions.editReply(
                        CLIENT_ID!,
                        interaction.token,
                        { content: c },
                    ));

                console.log(`[Modal run] started (user: ${userId})`);
                startRun(userId);
                try {
                    await runAndReport(
                        userToken,
                        channelId,
                        sendInitial,
                        editFinal,
                    );
                } finally {
                    finishRun(userId);
                }
                return;
            }
            return;
        }

        // ── Slash commands ────────────────────────────────────────────────────────
        if (interaction.type !== InteractionType.ApplicationCommand) return;
        const cmdData = interaction.data as any;
        if (cmdData?.type !== ApplicationCommandType.ChatInput) return;

        if (["set", "reset", "quest-config", "quest-announce"].includes(cmdData?.name)) {
            const perms = BigInt((interaction as any).member?.permissions ?? "0");
            if (
                !guildId ||
                !(perms & (PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator))
            ) {
                await api.interactions.reply(interaction.id, interaction.token, {
                    content: "Only a server admin with Manage Server permission can set the quest channel.",
                    flags: 64,
                });
                return;
            }

            if (cmdData.name === "quest-announce") {
                const questName = cmdData.options?.find((o: any) => o.name === "quest")?.value?.trim();
                const details = cmdData.options?.find((o: any) => o.name === "details")?.value?.trim();
                if (!questName) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: "Add a quest name before sending the announcement.",
                        flags: 64,
                    });
                    return;
                }

                const recipients = getQuestRecipients(questAudience, guildId);
                if (recipients.length === 0) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: "No recipients are registered yet. Members must use a quest command in the configured channel first. Usage tracking starts with this update.",
                        flags: 64,
                    });
                    return;
                }

                await api.interactions.defer(interaction.id, interaction.token, {
                    flags: 64,
                });
                let sent = 0;
                let failed = 0;
                for (let index = 0; index < recipients.length; index++) {
                    try {
                        await sendQuestAnnouncement(recipients[index], questName, details);
                        sent++;
                    } catch (error: any) {
                        failed++;
                        console.warn(
                            `Quest announcement DM failed for recipient ${recipients[index]}:`,
                            error.message ?? error,
                        );
                    }
                    if (index < recipients.length - 1) {
                        await new Promise((resolve) => setTimeout(resolve, 500));
                    }
                    if ((index + 1) % 10 === 0 || index === recipients.length - 1) {
                        await api.interactions.editReply(CLIENT_ID!, interaction.token, {
                            embeds: [{
                                color: EMBED_COLOR,
                                author: { name: "QUEST CONTROL  /  ANNOUNCEMENT" },
                                title: "✦ Sending quest DMs",
                                description: `Sent: **${sent}** · Could not deliver: **${failed}** · Total: **${recipients.length}**`,
                                footer: { text: "QUEST CONTROL  •  Members can turn off notifications with /quest-notify off" },
                            }],
                        }).catch((error: any) => {
                            console.warn("Could not update announcement progress:", error.message);
                        });
                    }
                }
                return;
            }

            if (cmdData.name === "quest-config") {
                const configuredChannel = questChannels[guildId];
                await api.interactions.reply(interaction.id, interaction.token, {
                    embeds: [{
                        color: EMBED_COLOR,
                        author: { name: "QUEST CONTROL  /  SETTINGS" },
                        title: "✦ Server quest settings",
                        description: configuredChannel
                            ? `Quest commands are enabled only in <#${configuredChannel}>.`
                            : "No quest channel is configured. Quest commands are currently disabled. Use `/set channel` to enable them.",
                        fields: [{
                            name: "📍  Channel",
                            value: configuredChannel ? `<#${configuredChannel}>` : "Not set",
                            inline: true,
                        }],
                        footer: { text: "QUEST CONTROL  •  Visible only to you · Manage Server required" },
                    }],
                    flags: 64,
                });
                return;
            }

            if (cmdData.name === "reset") {
                const subcommand = cmdData.options?.find((o: any) => o.name === "channel");
                if (!subcommand) {
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: "Use `/reset channel` to disable quest commands for this server.",
                        flags: 64,
                    });
                    return;
                }
                try {
                    const removed = removeQuestChannel(questChannels, guildId);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        embeds: [{
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  SETTINGS" },
                            title: removed ? "✦ Quest channel cleared" : "✦ No channel was set",
                            description: removed
                                ? "Quest commands are now disabled for this server. Set a channel again with `/set channel`."
                                : "Quest commands are already disabled. Use `/set channel` to enable them.",
                            footer: { text: "QUEST CONTROL  •  Visible only to you · Manage Server required" },
                        }],
                        flags: 64,
                    });
                } catch (error) {
                    console.error("Could not clear quest channel:", error);
                    await api.interactions.reply(interaction.id, interaction.token, {
                        content: "Could not update the channel setting. Check the bot's data directory and try again.",
                        flags: 64,
                    });
                }
                return;
            }

            const subcommand = cmdData.options?.find((o: any) => o.name === "channel");
            const selected = subcommand?.options?.find((o: any) => o.name === "target")?.value as string | undefined;
            const targetId = selected ?? channelId;
            const targetType = selected
                ? cmdData.resolved?.channels?.[selected]?.type
                : (interaction as any).channel?.type;
            if (!subcommand || targetType !== ChannelType.GuildText) {
                await api.interactions.reply(interaction.id, interaction.token, {
                    content: "Choose a regular text channel. Run `/set channel` inside one, or pass `target`.",
                    flags: 64,
                });
                return;
            }
            try {
                saveQuestChannel(questChannels, guildId, targetId);
                await api.interactions.reply(interaction.id, interaction.token, {
                    embeds: [{
                        color: EMBED_COLOR,
                        author: { name: "QUEST CONTROL  /  SETTINGS" },
                        title: "✦ Quest channel saved",
                        description: `Quest commands and panel actions now work only in <#${targetId}>.`,
                        footer: { text: "QUEST CONTROL  •  Server settings" },
                    }],
                    flags: 64,
                });
            } catch (error) {
                console.error("Could not save quest channel:", error);
                await api.interactions.reply(interaction.id, interaction.token, {
                    content: "Could not save the channel. Check the bot's data directory and try again.",
                    flags: 64,
                });
            }
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
                        title: enabled ? "✦ Quest DMs are on" : "✦ Quest DMs are off",
                        description: enabled
                            ? "You'll receive English quest announcements sent by this server's admin."
                            : "Run `/quest-notify on` if you want to receive English quest announcements.",
                        footer: { text: "QUEST CONTROL  •  Only you can see this setting" },
                    }],
                    flags: 64,
                });
                return;
            }
            if (subcommand === "test") {
                await api.interactions.defer(interaction.id, interaction.token, {
                    flags: 64,
                });
                try {
                    await sendQuestAnnouncement(
                        userId,
                        "Notification test",
                        "This is a test message. New quest announcements will arrive here when enabled.",
                    );
                    await api.interactions.editReply(CLIENT_ID!, interaction.token, {
                        content: "Test DM sent. Check your direct messages.",
                    });
                } catch (error: any) {
                    await api.interactions.editReply(CLIENT_ID!, interaction.token, {
                        content: `I couldn't send a DM. Check your server privacy settings and try again. (${error.message ?? "delivery failed"})`,
                    });
                }
                return;
            }
            if (subcommand !== "on" && subcommand !== "off") return;
            try {
                setQuestNotification(questAudience, guildId, userId, subcommand === "on");
                await api.interactions.reply(interaction.id, interaction.token, {
                    embeds: [{
                        color: EMBED_COLOR,
                        author: { name: "QUEST CONTROL  /  NOTIFICATIONS" },
                        title: subcommand === "on" ? "✦ Quest DMs enabled" : "✦ Quest DMs disabled",
                        description: subcommand === "on"
                            ? "You'll receive English new-quest announcements sent by this server's admin."
                            : "You won't receive new quest announcement DMs from this server.",
                        footer: { text: "QUEST CONTROL  •  Only your Discord user ID is stored for this preference" },
                    }],
                    flags: 64,
                });
            } catch (error) {
                console.error("Could not update quest notification setting:", error);
                await api.interactions.reply(interaction.id, interaction.token, {
                    content: "Could not update your notification setting. Try again later.",
                    flags: 64,
                });
            }
            return;
        }

        if (cmdData?.name === "quest-help") {
            await api.interactions.reply(
                interaction.id,
                interaction.token,
                {
                    ...(buildHelpEmbed() as any),
                    flags: 64,
                },
            );
            return;
        }

        if (cmdData?.name === "quest-ping") {
            await api.interactions.reply(
                interaction.id,
                interaction.token,
                {
                    ...(buildPingEmbed() as any),
                    flags: 64,
                },
            );
            return;
        }

        const userToken: string | undefined = cmdData.options?.find(
            (o: any) => o.name === "token",
        )?.value;

        if (!userToken?.trim()) {
            await api.interactions.reply(interaction.id, interaction.token, {
                content: "❌ Token is required.",
                flags: 64,
            });
            return;
        }

        if (cmdData?.name === "quest-status") {
            await api.interactions.defer(interaction.id, interaction.token, {
                flags: 64,
            });
            console.log(`[Slash /quest-status] started`);
            await sendStatusEmbeds(channelId, userToken.trim());
            await api.interactions.editReply(CLIENT_ID!, interaction.token, {
                content: "📋 Status embeds sent above!",
            });
            return;
        }

        if (cmdData?.name === "run-quests") {
            const cd = checkCooldown(userId);
            if (cd.blocked) {
                await api.interactions.reply(
                    interaction.id,
                    interaction.token,
                    { content: cd.reason!, flags: 64 },
                );
                return;
            }
            await api.interactions.defer(interaction.id, interaction.token, {
                flags: 64,
            });
            const sendInitial = async () =>
                api.interactions.editReply(CLIENT_ID!, interaction.token, {
                    content: "⏳ Quest processing has started...",
                });
            const editFinal = async (c: string) =>
                void (await api.interactions.editReply(
                    CLIENT_ID!,
                    interaction.token,
                    { content: c },
                ));
            console.log(`[Slash /run-quests] started (user: ${userId})`);
            startRun(userId);
            try {
                await runAndReport(
                    userToken.trim(),
                    channelId,
                    sendInitial,
                    editFinal,
                );
            } finally {
                finishRun(userId);
            }
            return;
        }

        if (cmdData?.name === "spoof-playtime") {
            const cd = checkCooldown(userId);
            if (cd.blocked) {
                await api.interactions.reply(interaction.id, interaction.token, {
                    content: cd.reason!,
                    flags: 64,
                });
                return;
            }

            const targetHours = cmdData.options?.find((o: any) => o.name === "hours")?.value || 100;
            const targetGame = cmdData.options?.find((o: any) => o.name === "game")?.value;

            await api.interactions.defer(interaction.id, interaction.token, {
                flags: 64,
            });
            await api.interactions.editReply(CLIENT_ID!, interaction.token, {
                content: `⏳ Telemetry in progress: Spoofing Game Time badge (${targetHours} hours)...`,
            });

            startRun(userId);
            try {
                const spoofRes = await spoofBadges(userToken.trim(), {
                    mode: targetGame ? "custom" : "playtime",
                    hours: Number(targetHours),
                    gameIds: targetGame ? [String(targetGame)] : undefined,
                });

                if (!spoofRes.success) {
                    await api.interactions.editReply(CLIENT_ID!, interaction.token, {
                        content: `❌ Badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`,
                    });
                } else {
                    await api.interactions.editReply(CLIENT_ID!, interaction.token, {
                        embeds: [
                            {
                                color: EMBED_COLOR,
                                author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                                title: "✦ Game Time Badge Spoofed",
                                description: `Successfully simulated **${spoofRes.totalHoursSpoofed} hours** across **${spoofRes.gamesSpoofed} game(s)**!`,
                                fields: [
                                    {
                                        name: "🎮 Mode",
                                        value: "Game Time Playtime",
                                        inline: true,
                                    },
                                    {
                                        name: "⏱️ Hours Logged",
                                        value: `${spoofRes.totalHoursSpoofed}h`,
                                        inline: true,
                                    },
                                    {
                                        name: "📅 Badge Update",
                                        value: "Discord profile badges update in batches within 24-48 hours",
                                        inline: false,
                                    },
                                ],
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
                    content: cd.reason!,
                    flags: 64,
                });
                return;
            }

            const targetGames = cmdData.options?.find((o: any) => o.name === "games")?.value || 25;

            await api.interactions.defer(interaction.id, interaction.token, {
                flags: 64,
            });
            await api.interactions.editReply(CLIENT_ID!, interaction.token, {
                content: `⏳ Telemetry in progress: Spoofing Game Variety badge (${targetGames} games)...`,
            });

            startRun(userId);
            try {
                const spoofRes = await spoofBadges(userToken.trim(), {
                    mode: "variety",
                    gameCount: Number(targetGames),
                    hours: 5,
                });

                if (!spoofRes.success) {
                    await api.interactions.editReply(CLIENT_ID!, interaction.token, {
                        content: `❌ Variety badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`,
                    });
                } else {
                    await api.interactions.editReply(CLIENT_ID!, interaction.token, {
                        embeds: [
                            {
                                color: EMBED_COLOR,
                                author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                                title: "✦ Game Variety Badge Spoofed",
                                description: `Successfully simulated **${spoofRes.gamesSpoofed} distinct detectable games**!`,
                                fields: [
                                    {
                                        name: "🎯 Mode",
                                        value: "Game Variety",
                                        inline: true,
                                    },
                                    {
                                        name: "🎮 Games Registered",
                                        value: `${spoofRes.gamesSpoofed} games`,
                                        inline: true,
                                    },
                                    {
                                        name: "📅 Badge Update",
                                        value: "Discord profile badges update in batches within 24-48 hours",
                                        inline: false,
                                    },
                                ],
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

async function safeDeleteMessage(api: any, channelId: string, messageId: string) {
    try {
        await api.channels.deleteMessage(channelId, messageId);
    } catch {
        // Ignored if bot lacks delete permissions
    }
}

// ── Prefix Commands: Quests, Badges & Owner Operations ─────────────────────────
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

        // Parse command and arguments
        const parts = raw.slice(1).trim().split(/\s+/);
        const command = parts[0]?.toLowerCase() ?? "";
        const subArgs = parts.slice(1);

        // Helper to enforce owner privilege
        const requireOwner = async (): Promise<boolean> => {
            if (userIsOwner) return true;
            await api.channels.createMessage(channelId, {
                embeds: [{
                    color: 0xed4245,
                    author: { name: "QUEST CONTROL  /  ACCESS CONTROL" },
                    title: "🚫 Access Denied",
                    description: "This command is restricted to bot owners configured in the `OWNER_ID` environment variable.",
                    footer: { text: "QUEST CONTROL  •  Administrative privilege required" },
                    timestamp: new Date().toISOString(),
                }],
                message_reference: { message_id: message.id },
            }).catch(() => {});
            return false;
        };

        // ── 1. HELP COMMANDS (!help, !quest help) ─────────────────────────────
        if (command === "help" || (command === "quest" && subArgs[0]?.toLowerCase() === "help")) {
            await api.channels.createMessage(channelId, {
                ...(buildHelpEmbed() as any),
                message_reference: { message_id: message.id },
            }).catch(() => {});
            return;
        }

        // ── 2. PING COMMANDS (!ping, !quest ping) ─────────────────────────────
        if (command === "ping" || (command === "quest" && subArgs[0]?.toLowerCase() === "ping")) {
            const start = Date.now();
            const sent = await api.channels.createMessage(channelId, {
                content: "🏓 Pinging...",
                message_reference: { message_id: message.id },
            }).catch(() => null) as any;
            const latency = Date.now() - start;
            if (sent?.id) {
                await api.channels.editMessage(channelId, sent.id, {
                    content: "",
                    embeds: [{
                        color: EMBED_COLOR,
                        author: { name: "QUEST CONTROL  /  SYSTEM" },
                        title: "✦ Pong!",
                        description: "All services are online and responding.",
                        fields: [
                            { name: "📡 Gateway Status", value: isBotConnected ? "🟢 Connected" : "🟡 Standby / Reconnecting", inline: true },
                            { name: "⚡ API Latency", value: `${latency}ms`, inline: true },
                            { name: "⏱️ Uptime", value: `${Math.floor(process.uptime() / 60)} minutes`, inline: true },
                        ],
                        footer: { text: "QUEST CONTROL  •  System Diagnostic" },
                        timestamp: new Date().toISOString(),
                    }],
                }).catch(() => {});
            }
            return;
        }

        // ── 3. OWNER: !sync [guildId] ─────────────────────────────────────────
        if (command === "sync") {
            if (!await requireOwner()) return;
            const targetGuild = subArgs[0] || guildId;
            const statusMsg = await api.channels.createMessage(channelId, {
                content: `⏳ Synchronizing slash commands ${targetGuild ? `for guild \`${targetGuild}\`` : "globally"}...`,
                message_reference: { message_id: message.id },
            }).catch(() => null) as any;

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
                            title: "✦ Slash Commands Synchronized",
                            description: `Successfully registered **${res.count} slash commands**!`,
                            fields: [
                                { name: "📍 Scope", value: targetGuild ? `Guild: \`${targetGuild}\` (Instant)` : "Global (takes up to 1h)", inline: true },
                                { name: "⏱️ Duration", value: `${elapsed}ms`, inline: true },
                            ],
                            footer: { text: "QUEST CONTROL  •  Owner Action" },
                            timestamp: new Date().toISOString(),
                        }],
                    }).catch(() => {});
                }
            } catch (err: any) {
                if (statusMsg?.id) {
                    await api.channels.editMessage(channelId, statusMsg.id, {
                        content: `❌ Command synchronization failed: \`${err.message || err}\``,
                    }).catch(() => {});
                }
            }
            return;
        }

        // ── 4. OWNER: !stats ──────────────────────────────────────────────────
        if (command === "stats") {
            if (!await requireOwner()) return;
            const mem = process.memoryUsage();
            const formatMb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + " MB";
            const uptime = Math.floor(process.uptime());
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;

            await api.channels.createMessage(channelId, {
                embeds: [{
                    color: EMBED_COLOR,
                    author: { name: "QUEST CONTROL  /  BOT DIAGNOSTICS" },
                    title: "✦ System Metrics & Stats",
                    fields: [
                        { name: "🤖 Gateway Connection", value: isBotConnected ? "🟢 Online" : "🔴 Standby", inline: true },
                        { name: "⏱️ Bot Uptime", value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
                        { name: "⚡ Node Version", value: process.version, inline: true },
                        { name: "🧠 Memory (RSS)", value: formatMb(mem.rss), inline: true },
                        { name: "📊 Heap (Used / Total)", value: `${formatMb(mem.heapUsed)} / ${formatMb(mem.heapTotal)}`, inline: true },
                        { name: "🏃 Active Quest Runs", value: `${activeUsers.size} user(s)`, inline: true },
                        { name: "👑 Configured Owners", value: `${OWNER_IDS.length} owner(s)`, inline: true },
                        { name: "🌐 Port 3000 Health", value: "🟢 Listening", inline: true },
                    ],
                    footer: { text: "QUEST CONTROL  •  Owner Diagnostics" },
                    timestamp: new Date().toISOString(),
                }],
                message_reference: { message_id: message.id },
            }).catch(() => {});
            return;
        }

        // ── 5. OWNER: !owner (help / eval) ────────────────────────────────────
        if (command === "owner") {
            if (!await requireOwner()) return;
            const action = subArgs[0]?.toLowerCase();

            if (action === "help") {
                await api.channels.createMessage(channelId, {
                    embeds: [{
                        color: EMBED_COLOR,
                        author: { name: "QUEST CONTROL  /  OWNER MANUAL" },
                        title: "👑 Owner Commands Guide",
                        description: "Administrative commands available only to IDs specified in `OWNER_ID` in `.env`.",
                        fields: [
                            {
                                name: "⚡  Command Deployment",
                                value: "`!sync` — register global slash commands\n`!sync <guildId>` — register instant guild slash commands",
                                inline: false,
                            },
                            {
                                name: "📊  Diagnostics",
                                value: "`!stats` — view uptime, RAM usage, gateway state, and runners",
                                inline: false,
                            },
                            {
                                name: "📣  Announcements & Channels",
                                value: "`!announce <quest_name> [details]` — DM registered users\n`!setchannel <#channel or id>` — lock commands to channel\n`!resetchannel` — unlock channel restriction",
                                inline: false,
                            },
                            {
                                name: "💻  Code Execution",
                                value: "`!owner eval <code>` — execute JavaScript expression in the bot runtime",
                                inline: false,
                            },
                        ],
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
                        content: "❌ Please provide code to evaluate: `!owner eval <code>`",
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                    return;
                }
                try {
                    // eslint-disable-next-line no-eval
                    let result = (0, eval)(codeToEval);
                    if (result && typeof result.then === "function") {
                        result = await result;
                    }
                    const util = await import("node:util");
                    const resultStr = typeof result === "string" ? result : util.inspect(result, { depth: 2 });
                    await api.channels.createMessage(channelId, {
                        content: `\`\`\`javascript\n${resultStr.slice(0, 1900)}\n\`\`\``,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                } catch (err: any) {
                    await api.channels.createMessage(channelId, {
                        content: `❌ **Eval Error:** \`\`\`${err.message || err}\`\`\``,
                        message_reference: { message_id: message.id },
                    }).catch(() => {});
                }
                return;
            }

            await api.channels.createMessage(channelId, {
                content: "Use `!owner help` to view all owner commands, or `!sync`, `!stats`, `!announce`.",
                message_reference: { message_id: message.id },
            }).catch(() => {});
            return;
        }

        // ── 6. OWNER/ADMIN: !announce <quest> [details] ───────────────────────
        if (command === "announce" || (command === "quest" && subArgs[0]?.toLowerCase() === "announce")) {
            if (!await requireOwner()) return;
            const announceArgs = command === "announce" ? subArgs : subArgs.slice(1);
            const questName = announceArgs[0];
            const details = announceArgs.slice(1).join(" ");
            if (!questName) {
                await api.channels.createMessage(channelId, {
                    content: "❌ Usage: `!announce <quest_name> [optional_details]`",
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }
            if (!guildId) {
                await api.channels.createMessage(channelId, {
                    content: "❌ Announcements can only be sent from inside a server.",
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            const recipients = getQuestRecipients(questAudience, guildId);
            if (recipients.length === 0) {
                await api.channels.createMessage(channelId, {
                    content: "⚠️ No members registered for quest notifications in this guild yet.",
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            const progressMsg = await api.channels.createMessage(channelId, {
                content: `⏳ Sending announcement to **${recipients.length}** recipient(s)...`,
                message_reference: { message_id: message.id },
            }).catch(() => null) as any;

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
                        title: "✦ Announcement Broadcast Complete",
                        description: `Announced quest: **${questName}**`,
                        fields: [
                            { name: "📬 Delivered", value: `${sent} users`, inline: true },
                            { name: "⚠️ Failed / DMs Closed", value: `${failed} users`, inline: true },
                            { name: "👥 Total Targeted", value: `${recipients.length} users`, inline: true },
                        ],
                        footer: { text: "QUEST CONTROL  •  Notification System" },
                        timestamp: new Date().toISOString(),
                    }],
                }).catch(() => {});
            }
            return;
        }

        // ── 7. OWNER/ADMIN: !setchannel & !resetchannel ───────────────────────
        if (command === "setchannel") {
            if (!await requireOwner()) return;
            if (!guildId) {
                await api.channels.createMessage(channelId, { content: "Must be used in a server." }).catch(() => {});
                return;
            }
            const rawTarget = subArgs[0] || channelId;
            const cleanedTarget = rawTarget.replace(/[^0-9]/g, "");
            if (!cleanedTarget) {
                await api.channels.createMessage(channelId, { content: "❌ Specify a valid channel ID or mention: `!setchannel #channel`" }).catch(() => {});
                return;
            }
            saveQuestChannel(questChannels, guildId, cleanedTarget);
            await api.channels.createMessage(channelId, {
                content: `✅ Quest channel locked to <#${cleanedTarget}>. All quest commands will now only run there.`,
                message_reference: { message_id: message.id },
            }).catch(() => {});
            return;
        }

        if (command === "resetchannel") {
            if (!await requireOwner()) return;
            if (!guildId) {
                await api.channels.createMessage(channelId, { content: "Must be used in a server." }).catch(() => {});
                return;
            }
            removeQuestChannel(questChannels, guildId);
            await api.channels.createMessage(channelId, {
                content: "✅ Quest channel restriction cleared. Quest commands can now be used in any channel.",
                message_reference: { message_id: message.id },
            }).catch(() => {});
            return;
        }

        // ── CHANNEL ACCESS RESTRICTION CHECK (for user commands) ──────────────
        const channelNotice = questChannelNotice(questChannels, guildId, channelId);
        if (channelNotice && !userIsOwner && (command === "quest" || command === "badge")) {
            await api.channels.createMessage(channelId, {
                embeds: [{
                    color: EMBED_COLOR,
                    author: { name: "QUEST CONTROL  /  ACCESS" },
                    title: "✦ Quest channel only",
                    description: channelNotice,
                    footer: { text: "QUEST CONTROL  •  Channel restriction" },
                }],
                message_reference: { message_id: message.id },
            }).catch(() => {});
            return;
        }
        rememberQuestUser(guildId, userId);

        // ── 8. BADGE SPOOFER: !badge [playtime|variety|games|help] ─────────────
        if (command === "badge") {
            const subCmd = subArgs[0]?.toLowerCase();

            if (!subCmd || subCmd === "help") {
                await api.channels.createMessage(channelId, {
                    ...(buildBadgeHelpEmbed() as any),
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            if (subCmd === "games") {
                await api.channels.createMessage(channelId, {
                    ...(buildBadgeGamesEmbed() as any),
                    message_reference: { message_id: message.id },
                }).catch(() => {});
                return;
            }

            if (subCmd === "playtime") {
                const token = subArgs[1]?.trim();
                // Auto-delete token message immediately to protect user credentials
                await safeDeleteMessage(api, channelId, message.id);

                if (!token) {
                    await api.channels.createMessage(channelId, {
                        content: `❌ <@${userId}> Missing user token!\nUsage: \`!badge playtime <token> [hours] [game]\``,
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

                const hoursRaw = parseInt(subArgs[2] || "100", 10);
                const hours = isNaN(hoursRaw) ? 100 : Math.max(1, Math.min(hoursRaw, 1000));

                const queryGame = subArgs[3]?.toLowerCase();
                let matchedGame = POPULAR_GAMES[0];
                if (queryGame) {
                    const found = POPULAR_GAMES.find(
                        (g) => g.id === queryGame || g.name.toLowerCase().includes(queryGame),
                    );
                    if (found) matchedGame = found;
                }

                const progressMsg = await api.channels.createMessage(channelId, {
                    content: `⏳ <@${userId}> Telemetry in progress: Spoofing **${hours} hours** on **${matchedGame.name}**...`,
                }).catch(() => null) as any;

                startRun(userId);
                try {
                    const spoofRes = await spoofBadges(token, {
                        mode: "custom",
                        hours,
                        gameIds: [matchedGame.id],
                    });

                    if (!spoofRes.success) {
                        const errorContent = `❌ <@${userId}> Badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`;
                        if (progressMsg?.id) {
                            await api.channels.editMessage(channelId, progressMsg.id, { content: errorContent }).catch(() => {});
                        } else {
                            await api.channels.createMessage(channelId, { content: errorContent }).catch(() => {});
                        }
                    } else {
                        const embed = {
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                            title: "✦ Game Time Badge Spoofed",
                            description: `<@${userId}> Successfully registered **${spoofRes.totalHoursSpoofed} hours** for **${matchedGame.name}**!`,
                            fields: [
                                { name: "🎮 Game Title", value: matchedGame.name, inline: true },
                                { name: "⏱️ Hours Logged", value: `${spoofRes.totalHoursSpoofed}h`, inline: true },
                                { name: "🆔 Application ID", value: `\`${matchedGame.id}\``, inline: true },
                                { name: "📅 Badge Update", value: "Discord profile badges update in batches within 24-48 hours", inline: false },
                            ],
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

            if (subCmd === "variety") {
                const token = subArgs[1]?.trim();
                // Auto-delete token message immediately to protect user credentials
                await safeDeleteMessage(api, channelId, message.id);

                if (!token) {
                    await api.channels.createMessage(channelId, {
                        content: `❌ <@${userId}> Missing user token!\nUsage: \`!badge variety <token> [gameCount]\``,
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

                const countRaw = parseInt(subArgs[2] || "25", 10);
                const count = isNaN(countRaw) ? 25 : Math.max(5, Math.min(countRaw, 50));

                const progressMsg = await api.channels.createMessage(channelId, {
                    content: `⏳ <@${userId}> Telemetry in progress: Spoofing Game Variety badge with **${count} games**...`,
                }).catch(() => null) as any;

                startRun(userId);
                try {
                    const spoofRes = await spoofBadges(token, {
                        mode: "variety",
                        gameCount: count,
                        hours: 5,
                    });

                    if (!spoofRes.success) {
                        const errorContent = `❌ <@${userId}> Variety badge spoofing failed: ${spoofRes.error || "Could not authenticate with Discord"}`;
                        if (progressMsg?.id) {
                            await api.channels.editMessage(channelId, progressMsg.id, { content: errorContent }).catch(() => {});
                        } else {
                            await api.channels.createMessage(channelId, { content: errorContent }).catch(() => {});
                        }
                    } else {
                        const embed = {
                            color: EMBED_COLOR,
                            author: { name: "QUEST CONTROL  /  BADGE SPOOFER" },
                            title: "✦ Game Variety Badge Spoofed",
                            description: `<@${userId}> Successfully simulated **${spoofRes.gamesSpoofed} distinct detectable games**!`,
                            fields: [
                                { name: "🎯 Badge Mode", value: "Game Variety", inline: true },
                                { name: "🎮 Games Registered", value: `${spoofRes.gamesSpoofed} games`, inline: true },
                                { name: "📅 Profile Sync", value: "Discord profile badges update in batches within 24-48 hours", inline: false },
                            ],
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
                content: `Invalid badge command. Use \`!badge help\`, \`!badge playtime <token> [hours]\`, or \`!badge variety <token> [count]\`.`,
                message_reference: { message_id: message.id },
            }).catch(() => {});
            return;
        }

        // ── 9. QUEST COMMANDS: !quest [run|status|panel|<token>] ──────────────
        if (command === "quest") {
            const subCmd = subArgs[0]?.toLowerCase();

            // !quest status <token>
            if (subCmd === "status") {
                const token = subArgs[1]?.trim();
                await safeDeleteMessage(api, channelId, message.id);
                if (!token) {
                    await api.channels.createMessage(channelId, {
                        content: `❌ <@${userId}> Please provide your token: \`!quest status <token>\``,
                    }).catch(() => {});
                    return;
                }
                console.log(`[Prefix status] started (user: ${userId})`);
                await sendStatusEmbeds(channelId, token, userId);
                return;
            }

            // !quest run <token>
            if (subCmd === "run") {
                const token = subArgs[1]?.trim();
                await safeDeleteMessage(api, channelId, message.id);
                if (!token) {
                    await api.channels.createMessage(channelId, {
                        content: `❌ <@${userId}> Please provide your token: \`!quest run <token>\``,
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
                    content: `⏳ <@${userId}> Quest processing has started...`,
                }).catch(() => null) as any;

                const editFinal = async (txt: string) => {
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

            // !quest <token> (direct token shortcut)
            if (subArgs[0] && subArgs[0].length >= 20 && !["run", "status", "help", "ping", "panel", "games"].includes(subCmd)) {
                const token = subArgs[0].trim();
                await safeDeleteMessage(api, channelId, message.id);

                const cd = checkCooldown(userId);
                if (cd.blocked) {
                    await api.channels.createMessage(channelId, {
                        content: `<@${userId}> ${cd.reason}`,
                    }).catch(() => {});
                    return;
                }

                const sentMsg = await api.channels.createMessage(channelId, {
                    content: `⏳ <@${userId}> Quest processing has started...`,
                }).catch(() => null) as any;

                const editFinal = async (txt: string) => {
                    if (sentMsg?.id) {
                        await api.channels.editMessage(channelId, sentMsg.id, {
                            content: `<@${userId}> ${txt}`,
                        }).catch(() => {});
                    }
                };

                console.log(`[Prefix direct run] started (user: ${userId})`);
                startRun(userId);
                try {
                    await runAndReport(token, channelId, async () => {}, editFinal);
                } finally {
                    finishRun(userId);
                }
                return;
            }

            // !quest or !quest panel → show interactive button panel
            await api.channels.createMessage(channelId, {
                ...(buildTokenRequiredEmbed() as any),
                message_reference: { message_id: message.id },
            }).catch(() => {});
            return;
        }
    },
);

// ── Error handling ────────────────────────────────────────────────────────────
    process.on("unhandledRejection", (r) =>
        console.error("[Discord Bot] Unhandled Rejection:", r),
    );
    process.on("uncaughtException", (e) =>
        console.error("[Discord Bot] Uncaught Exception:", e.message),
    );

    try {
        gateway.connect().catch((err: any) => {
            console.warn("[Discord Bot] Gateway connection failed:", err.message);
            isBotConnected = false;
        });
        isBotConnected = true;
        console.log("[Discord Bot] Gateway connection started.");
    } catch (err: any) {
        console.error("[Discord Bot] Gateway connection error:", err.message);
    }
}

export function startDiscordBot(): boolean {
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

// Automatically start gateway bot only if valid tokens are present
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

