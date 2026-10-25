# Discord Quest & Profile Spoofer Bot

A minimalistic, modern Discord bot for Discord Quests auto-completion, profile game playtime and live streaming badges, and custom rich presence (VALORANT, VS Code, Minecraft, etc.) built with Discord Components V2.

## Features

- **Quest Auto-Completion:** Automatically completes video, desktop, activity, and stream quests.
- **Discord Badge Spoofer:** Simulates legitimate Discord science telemetry pipeline (`running_game_heartbeat`, `video_stream_started`, `video_stream_ended`, `screenshare_finished`) for:
  - Game Playtime Badges
  - Live Streaming Badges
  - Game Variety Badges (up to 50 distinct games)
- **Custom Rich Presence for Linked Users:**
  - VALORANT (`700136079562375258`)
  - Visual Studio Code (`383226320970055681`)
  - Minecraft (`432980957394370572`)
  - League of Legends (`356869127241072640`)
  - Live Twitch / Streaming status
- **Minimalist Aesthetic:**
  - Zero emojis and zero ASCII art in embeds
  - Modern Discord Components V2 action rows
  - Interactive String Select Menus for Help and Rich Presence
- **Token Security:**
  - Strict modal-only token entry — no plain-text chat shortcuts
  - Local JSON database storage in `.data/user-tokens.json`
- **JSON Configuration:**
  - Primary configuration managed in `config.json` (no `.env` required)

## Configuration (`config.json`)

Configure your bot credentials directly in `config.json`:

```json
{
  "botToken": "YOUR_DISCORD_BOT_TOKEN",
  "clientId": "YOUR_DISCORD_CLIENT_ID",
  "ownerIds": ["YOUR_USER_ID"],
  "guildId": "",
  "yesCaptchaApiKey": "",
  "port": 3000,
  "prefix": "!quest",
  "defaultPresenceGame": "valorant"
}
```

*Note: Environment variables (`BOT_TOKEN`, `CLIENT_ID`, `PORT`) are supported as fallbacks.*

## Key Commands

### Account Management
- `!link` or `/link` — Open the private modal to link your account token
- `!unlink` or `/unlink` — Remove your linked account from the bot database
- `!whoami` or `/whoami` — Check your linked account details

### Rich Presence
- `/presence game preset:valorant` — Set active playing status for VALORANT
- `/presence game preset:vscode` — Set active playing status for VS Code
- `/presence clear` — Turn off custom rich presence
- `!presence` — Open interactive presence control panel with dropdown & buttons
- `!presence valorant` / `!presence vscode` / `!presence stream` / `!presence clear`

### Discord Quests
- `/run-quests` or `!quest run` — Auto-complete all active Discord quests
- `/quest-status` or `!quest status` — Inspect quest progress and rewards
- `!quest` or `!quest panel` — Show the interactive button dashboard

### Badges & Playtime
- `/spoof-playtime [hours] [game]` or `!badge playtime <hours> [game]` — Boost Game Time badge
- `/spoof-stream [hours] [game]` or `!badge stream <hours> [game]` — Boost Streaming badge
- `/spoof-variety [count]` or `!badge variety [count]` — Boost Game Variety badge
- `!badge all <hours>` — Boost both Playtime and Streaming badges together
- `!badge games` — List top supported detectable games and application IDs

### Help & Navigation
- `/quest-help` or `!help` — Open the interactive category dropdown help menu

### Server Administration
- `!channel-set quest <#channel>` — Lock quest commands to a designated channel
- `!channel-set badges <#channel>` — Lock badge commands to a designated channel
- `!channel-set <quest/badges> reset` — Clear channel lock
- `!channel-set` — View current channel settings
- `!sync [guildId]` — Force slash command registration
- `!stats` — View bot uptime, memory usage, and gateway status

## Running & Testing

```bash
# Start bot & health server
npm start

# Run test suite
npm test

# Lint check
npm run lint
```
