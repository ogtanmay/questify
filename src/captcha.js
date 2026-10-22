const { Constants } = require('./constants');
const { YesCaptchaSolver } = require('./providers/yescaptcha');

let yesCaptchaClient = null;

if (process.env.YES_CAPTCHA_API_KEY) {
    console.log('YesCaptcha API key found. Auto captcha solving enabled.');
    yesCaptchaClient = new YesCaptchaSolver(process.env.YES_CAPTCHA_API_KEY);
}

function isCaptchaSolvingEnabled() {
    return yesCaptchaClient !== null;
}

function solveCaptcha(data) {
    if (yesCaptchaClient) {
        return yesCaptchaClient
            .hcaptcha(data.captcha_sitekey, 'https://discord.com', {
                rqdata: data.captcha_rqdata,
                isInvisible: false,
                userAgent: Constants.USER_AGENT,
            })
            .then((result) => result.gRecaptchaResponse);
    }
    return Promise.reject(new Error('No captcha solver configured.'));
}

module.exports = {
    isCaptchaSolvingEnabled,
    solveCaptcha,
};
