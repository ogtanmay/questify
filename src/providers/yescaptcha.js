const { fetch } = require('undici');

class YesCaptchaSolver {
    static baseUrl = 'https://api.yescaptcha.com';

    constructor(apiKey) {
        this.apiKey = apiKey;
        this.headersDefault = new Headers({
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
            'Content-Type': 'application/json',
        });
    }

    createTask = async (task) => {
        const response = await fetch(YesCaptchaSolver.baseUrl + '/createTask', {
            body: JSON.stringify({
                clientKey: this.apiKey,
                task,
            }),
            method: 'POST',
            headers: this.headersDefault,
        }).then((res) => res.json());

        if (response.errorId === 1) {
            throw new Error(
                `Error creating task: ${JSON.stringify(response, null, 2)}`,
            );
        }
        return response;
    };

    poolTaskResult(taskId) {
        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout while waiting for task result'));
            }, 120_000);

            while (true) {
                const response = await fetch(
                    YesCaptchaSolver.baseUrl + '/getTaskResult',
                    {
                        body: JSON.stringify({
                            clientKey: this.apiKey,
                            taskId,
                        }),
                        method: 'POST',
                        headers: this.headersDefault,
                    },
                ).then((res) => res.json());

                if (response.errorId === 1) {
                    clearTimeout(timeout);
                    return reject(
                        `Error getting task result: ${JSON.stringify(response, null, 2)}`,
                    );
                }

                if (response.status === 'processing') {
                    await new Promise((res) => setTimeout(res, 3000));
                    continue;
                }

                clearTimeout(timeout);
                return resolve(response);
            }
        });
    }

    async imageCaptcha(imageBase64) {
        const task = {
            type: 'ImageToTextTaskM1',
            body: imageBase64,
        };

        const createResult = await this.createTask(task);
        return createResult.solution;
    }

    async hcaptcha(sitekey, url, options = {}) {
        const task = {
            type: 'HCaptchaTaskProxyless',
            websiteURL: url,
            websiteKey: sitekey,
            isInvisible: options.isInvisible,
            userAgent: options.userAgent,
            rqdata: options.rqdata,
        };

        const createResult = await this.createTask(task);
        const taskId = createResult.taskId;

        const result = await this.poolTaskResult(taskId);
        return result.solution;
    }
}

module.exports = {
    YesCaptchaSolver,
};
