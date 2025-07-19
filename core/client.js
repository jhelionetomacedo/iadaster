require('dotenv').config();
const tmi = require('tmi.js');

const client = new tmi.Client({
    options: { debug: true },
    connection: { secure: true, reconnect: true },
    identity: {
        username: process.env.TWITCH_USERNAME,
        password: process.env.TWITCH_OAUTH
    },
    channels: [process.env.TWITCH_CHANNEL]
});

client.connect();
module.exports = { client };
