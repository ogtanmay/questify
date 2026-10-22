const { fetch } = require('undici');

class CapSolverClient {
    static BASE_URL = 'https://api.capsolver.com';

    constructor(apiKey) {
        this.apiKey = apiKey;
        this.headers = new Headers({ 'Content-Type': 'application/json' });
    }

    async createTask(task) {
        const res = await fetch(`${CapSolverClient.BASE_URL}/createTask`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ clientKey: this.apiKey, task }),
        }).then((r) => r.json());

        if (res.errorId === 1) {
            throw new Error(`CapSolver createTask error: ${res.errorCode} — ${res.errorDescription}`);
        }
        if (!res.taskId) {
            throw new Error('CapSolver: no taskId returned');
        }
        return res.taskId;
    }

    async pollResult(taskId, timeoutMs = 120_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 3000));

            const res = await fetch(`${CapSolverClient.BASE_URL}/getTaskResult`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({ clientKey: this.apiKey, taskId }),
            }).then((r) => r.json());

            if (res.errorId === 1) {
                throw new Error(`CapSolver getTaskResult error: ${res.errorCode} — ${res.errorDescription}`);
            }
            if (res.status === 'ready' && res.solution) {
                return res.solution;
            }
            if (res.status === 'failed') {
                throw new Error(`CapSolver task failed: ${res.errorCode ?? 'unknown'}`);
            }
        }

        throw new Error('CapSolver: timed out waiting for solution');
    }

    async hcaptcha(sitekey, url, options = {}) {
        const task = {
            type: 'HCaptchaTaskProxyless',
            websiteURL: url,
            websiteKey: sitekey,
            userAgent: options.userAgent,
            isInvisible: options.isInvisible ?? false,
            enterprisePayload: options.rqdata ? { rqdata: options.rqdata } : undefined,
        };

        const taskId = await this.createTask(task);
        return this.pollResult(taskId);
    }
}

module.exports = {
    CapSolverClient,
};
