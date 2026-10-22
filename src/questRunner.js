const { ClientQuest } = require('./client');
const { Utils } = require('./utils');
const { Quest } = require('./quest');
const { QuestTaskConfigType } = require('./interface');

const TASK_ORDER = [
    QuestTaskConfigType.WATCH_VIDEO,
    QuestTaskConfigType.WATCH_VIDEO_ON_MOBILE,
    QuestTaskConfigType.PLAY_ON_DESKTOP,
    QuestTaskConfigType.PLAY_ON_XBOX,
    QuestTaskConfigType.PLAY_ON_PLAYSTATION,
    QuestTaskConfigType.PLAY_ACTIVITY,
    QuestTaskConfigType.ACHIEVEMENT_IN_ACTIVITY,
    QuestTaskConfigType.STREAM_ON_DESKTOP,
];

function extractQuestInfo(quest) {
    const cfg = quest.config;
    const tasks = cfg.task_config_v2?.tasks ?? {};

    const taskName = TASK_ORDER.find((t) => tasks[t] != null) ?? Object.keys(tasks)[0] ?? 'UNKNOWN';
    const taskCfg = tasks[taskName] ?? {};
    const targetSeconds = taskCfg.target ?? 0;
    const doneSeconds = quest.userStatus?.progress?.[taskName]?.value ?? 0;
    const progressPct = targetSeconds > 0 ? Math.min(100, Math.round((doneSeconds / targetSeconds) * 100)) : 0;

    const reward = cfg.rewards_config?.rewards?.[0];
    const rewardName = reward?.messages?.name ?? 'Unknown';
    const orbQuantity = reward?.orb_quantity ?? null;

    return {
        id: cfg.id,
        name: cfg.messages.quest_name,
        gameTitle: cfg.messages.game_title,
        publisher: cfg.messages.game_publisher,
        appId: cfg.application.id,
        taskName,
        targetSeconds,
        doneSeconds,
        progressPct,
        expiresAt: new Date(cfg.expires_at),
        isCompleted: quest.isCompleted(),
        isEnrolled: quest.isEnrolledQuest(),
        colorHex: (cfg.colors?.primary ?? '#5865F2').replace('#', ''),
        gameTileAsset: cfg.assets?.game_tile ?? null,
        rewardName,
        orbQuantity,
    };
}

async function fetchQuestsStatus(token) {
    const noop = () => {};
    const origLog = console.log;
    const origError = console.error;
    const origWarn = console.warn;
    const origInfo = console.info;
    console.log = noop;
    console.error = noop;
    console.warn = noop;
    console.info = noop;

    try {
        await Utils.updateLatestBuildVersion();
        const client = new ClientQuest(token);
        await client.fetchQuests(false);
        const allQuests = client.questManager.list();
        return { quests: allQuests.map(extractQuestInfo) };
    } catch (err) {
        return { quests: [], error: err.message ?? String(err) };
    } finally {
        console.log = origLog;
        console.error = origError;
        console.warn = origWarn;
        console.info = origInfo;
    }
}

async function runQuestsForToken(token, onQuestComplete) {
    const logs = [];
    let questsFound = 0;
    let questsCompleted = 0;

    const origLog = console.log;
    const origError = console.error;
    const origWarn = console.warn;
    const origInfo = console.info;

    const capture = (prefix, args) => {
        logs.push(prefix + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };

    console.log = (...a) => { capture('', a); origLog(...a); };
    console.error = (...a) => { capture('[ERROR] ', a); origError(...a); };
    console.warn = (...a) => { capture('[WARN] ', a); origWarn(...a); };
    console.info = (...a) => { capture('[INFO] ', a); origInfo(...a); };

    try {
        await Utils.updateLatestBuildVersion();
        const client = new ClientQuest(token);

        if (onQuestComplete) {
            client.onQuestComplete = async (quest) => {
                questsCompleted++;
                await onQuestComplete(quest);
            };
        }

        await client.fetchQuests(false);
        const questsValid = client.questManager.filterQuestsValidToDo();
        questsFound = questsValid.length;

        if (questsValid.length === 0) {
            logs.push('No quests to complete right now!');
            return { output: logs.join('\n'), questsFound: 0, questsCompleted: 0 };
        }

        logs.push(`Found ${questsValid.length} valid quest(s) to do.`);
        await Promise.allSettled(questsValid.map((q) => client.questManager.doingQuest(q)));

        return { output: logs.join('\n'), questsFound, questsCompleted };
    } catch (err) {
        return { output: logs.join('\n'), error: err.message ?? String(err), questsFound, questsCompleted };
    } finally {
        console.log = origLog;
        console.error = origError;
        console.warn = origWarn;
        console.info = origInfo;
    }
}

module.exports = {
    Quest,
    TASK_ORDER,
    extractQuestInfo,
    fetchQuestsStatus,
    runQuestsForToken,
};
