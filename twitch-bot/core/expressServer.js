const express = require('express');
const bodyParser = require('body-parser');
const { client } = require('./client');
const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.post('/resposta', (req, res) => {
    const { username, resposta } = req.body;

    if (!username || !resposta) {
        return res.status(400).send("Erro: Dados incompletos");
    }

    const respostaLimpa = resposta.replace(/[�-�]/g, '').slice(0, 450);
    client.say(`#${process.env.TWITCH_CHANNEL}`, `🤖 ${respostaLimpa}`);
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor ouvindo na porta ${PORT}`);
});

module.exports = app;
