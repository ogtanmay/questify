const { Constants } = require('./constants');
const { fetch } = require('undici');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');

class Utils {
    static makeHeaders(init) {
        let myHeaders = new Headers(init);
        const isAndroidRequest = myHeaders.get('AndroidRequest') === 'true';
        myHeaders.delete('AndroidRequest');
        if (myHeaders.has('Authorization')) {
            myHeaders.set(
                'Authorization',
                myHeaders.get('Authorization').replace('Bot ', ''),
            );
        }
        myHeaders.append('accept-language', 'en-US');
        myHeaders.append('x-debug-options', 'bugReporterEnabled');
        myHeaders.append('x-discord-locale', 'en-US');
        myHeaders.append('x-discord-timezone', 'Asia/Saigon');
        if (isAndroidRequest) {
            myHeaders = Utils.mergeHeaders(
                myHeaders,
                Utils.makeAndroidHeaders(true),
            );
        } else {
            myHeaders = Utils.mergeHeaders(
                myHeaders,
                Utils.makeDesktopHeaders(true, true),
            );
        }
        return myHeaders;
    }

    static makeDesktopHeaders(
        withDiscordClientProperties = true,
        withOriginAndReferer = true,
    ) {
        const myHeaders = new Headers();
        myHeaders.append('accept-language', 'vi');
        myHeaders.append('User-Agent', Constants.USER_AGENT);
        if (withOriginAndReferer) {
            myHeaders.append('origin', 'https://discord.com');
            myHeaders.append('referer', 'https://discord.com/channels/@me');
        }
        myHeaders.append('pragma', 'no-cache');
        myHeaders.append('priority', 'u=1, i');
        myHeaders.append(
            'sec-ch-ua',
            '"Not)A;Brand";v="8", "Chromium";v="138"',
        );
        myHeaders.append('sec-ch-ua-mobile', '?0');
        myHeaders.append('sec-ch-ua-platform', '"Windows"');
        myHeaders.append('sec-fetch-dest', 'empty');
        myHeaders.append('sec-fetch-mode', 'cors');
        myHeaders.append('sec-fetch-site', 'same-origin');
        if (withDiscordClientProperties) {
            myHeaders.append(
                'x-super-properties',
                Buffer.from(JSON.stringify(Constants.Properties)).toString(
                    'base64',
                ),
            );
        }
        return myHeaders;
    }

    static makeAndroidHeaders(withDiscordClientProperties = true) {
        const myHeaders = new Headers();
        myHeaders.append('accept-language', 'vi');
        myHeaders.append('User-Agent', Constants.ANDROID_USER_AGENT);
        if (withDiscordClientProperties) {
            myHeaders.append(
                'x-super-properties',
                Buffer.from(
                    JSON.stringify(Constants.ANDROID_Properties),
                ).toString('base64'),
            );
        }
        return myHeaders;
    }

    static mergeHeaders(a, b) {
        const result = new Headers(a);
        b.forEach((value, key) => {
            result.set(key, value);
        });
        return result;
    }

    static async getProxyTicket(applicationId, client) {
        const ticket = await client.rest.post(
            `/applications/${applicationId}/proxy-tickets`,
            {
                body: {},
            },
        );
        return ticket.ticket;
    }

    static async getActivityReferrer(applicationId, client) {
        const proxyTicket = await Utils.getProxyTicket(applicationId, client);
        const referrer = new URL(`https://${applicationId}.discordsays.com/`);

        referrer.searchParams.set('instance_id', 'example-cl-instance');
        referrer.searchParams.set('platform', 'desktop');
        referrer.searchParams.set('discord_proxy_ticket', proxyTicket);

        return referrer.toString();
    }

    static getActivityHeaders(questId, authToken = '', activityReferrer) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Auth-Token': authToken,
            'X-Discord-Quest-ID': questId,
        };
        if (activityReferrer) {
            headers.Referer = activityReferrer;
        }
        return headers;
    }

    static async authorizeDiscordSays(applicationId, questId, authCode, client) {
        let error = null;
        const headers = Utils.makeDesktopHeaders(false, false);
        const activityReferrer = await Utils.getActivityReferrer(
            applicationId,
            client,
        );
        const discordSaysHeaders = Utils.getActivityHeaders(
            questId,
            '',
            activityReferrer,
        );
        for (const [key, value] of Object.entries(discordSaysHeaders)) {
            headers.append(key, value);
        }
        const token = await fetch(
            `https://${applicationId}.discordsays.com/.proxy/acf/authorize`,
            {
                body: JSON.stringify({ code: authCode }),
                method: 'POST',
                headers,
            },
        )
            .then((res) => res.json())
            .then((data) => data.token)
            .catch((e) => {
                console.error('Error authorizing with Discord Says:', e);
                error = e instanceof Error ? e.message : String(e);
                return '';
            });
        return { token, error, activityReferrer };
    }

    static async progressDiscordSays(
        applicationId,
        questId,
        token,
        questTarget,
        activityReferrer,
    ) {
        let error = null;
        const headers = Utils.makeDesktopHeaders(false, false);
        const discordSaysHeaders = Utils.getActivityHeaders(
            questId,
            token,
            activityReferrer,
        );
        for (const [key, value] of Object.entries(discordSaysHeaders)) {
            headers.append(key, value);
        }
        const success = await fetch(
            `https://${applicationId}.discordsays.com/.proxy/acf/quest/progress`,
            {
                headers,
                body: JSON.stringify({ progress: questTarget }),
                method: 'POST',
            },
        )
            .then((res) => res.ok)
            .catch((e) => {
                error = e instanceof Error ? e.message : String(e);
                return false;
            });
        return { success, error };
    }

    static async askQuestion(promptText) {
        const rl = readline.createInterface({ input, output });
        try {
            const answer = await rl.question(promptText);
            return answer;
        } finally {
            rl.close();
        }
    }

    static async updateLatestBuildVersion() {
        try {
            const response = await fetch('https://discord.com/app', {
                headers: { 'User-Agent': Constants.USER_AGENT },
            });
            if (!response.ok) {
                return;
            }
            const html = await response.text();
            let scripts = Array.from(
                html.match(/\/assets\/web.([a-f0-9]+)\.js/g) || [],
            );
            if (!scripts || scripts.length === 0) {
                return;
            }

            for (const scriptPath of scripts) {
                try {
                    const assetUrl = `https://discord.com${scriptPath}`;
                    const assetResponse = await fetch(assetUrl, {
                        headers: { 'User-Agent': Constants.USER_AGENT },
                    });
                    if (!assetResponse.ok) continue;
                    const jsContent = await assetResponse.text();
                    const match = jsContent.match(
                        /buildNumber["\s:]+["\s]*(\d{5,7})/,
                    );
                    if (match) {
                        const buildNumber = parseInt(match[1], 10);
                        Constants.Properties.client_build_number = buildNumber;
                        return;
                    }
                } catch {
                    continue;
                }
            }
            return;
        } catch (error) {
            return;
        }
    }

    static async extractWebhookInfo() {
        const webhookUrl = process.env.WEBHOOK_URL;
        if (!webhookUrl) {
            return null;
        }
        const req = await fetch(webhookUrl).catch(() => null);
        if (!req || !req.ok) {
            return null;
        }
        const parts = webhookUrl.split('/');
        const webhookPathIndex = parts.findIndex((part) => part === 'webhooks');
        if (webhookPathIndex === -1 || parts.length < webhookPathIndex + 3) {
            return null;
        }
        const id = parts[webhookPathIndex + 1];
        const token = parts[webhookPathIndex + 2];
        return { id, token };
    }
}

module.exports = {
    Utils,
};
