const tmi = require('tmi.js');
const request = require('request');
const express = require('express');
const bodyParser = require('body-parser');

// Configurações do Twitch
const client = new tmi.Client({
    options: { debug: true },
    connection: {
        secure: true,
        reconnect: true
    },
    identity: {
        username: process.env.TWITCH_USERNAME,
        password: process.env.TWITCH_OAUTH
    },
    channels: [process.env.TWITCH_CHANNEL]
});

client.connect();

const webhookUrl = process.env.WEBHOOK_URL;

// Estados do bot
let botAtivo = false;
let modo = 0; // 0 = normal, 1 = competição, 2 = corrida
let filaAtiva = false;

// Fila e cooldowns
let fila = [];
const cooldownGlobal = 10 * 60 * 1000;
const cooldownUsuario = 10 * 60 * 1000;
let ultimoProcessamento = 0;
const cooldowns = {};

let usuariosNaLive = new Set();

// Verifica se é mod ou streamer
function isModOrStreamer(tags) {
    return tags.mod || tags.badges?.broadcaster === '1';
}

// Processa a fila automaticamente
function processarFila() {
    const agora = Date.now();

    if (fila.length === 0) return;
    if (agora - ultimoProcessamento < cooldownGlobal) return;

    const proximo = fila.shift();
    if (!proximo) return;

    const { username, pergunta } = proximo;
    ultimoProcessamento = agora;
    cooldowns[username] = agora;

    const data = {
        username: username,
        message: pergunta
    };

    request.post({
        url: webhookUrl,
        json: true,
        body: data
    }, (error, httpResponse, body) => {
        if (error) {
            console.error('Erro ao enviar para o Make:', error);
        } else {
            console.log(`✅ Pergunta de ${username} enviada (fila)!`);
        }
    });
}

setInterval(processarFila, 5000);

// Conexão e mensagens
client.on('message', (channel, tags, message, self) => {
    if (self) return;

    const usuario = tags.username;
    const texto = message.trim().toLowerCase();
    console.log(`[${channel}] ${usuario}: ${message}`);

    if (texto.startsWith('!liberar') && isModOrStreamer(tags)) {
        botAtivo = true;
        modo = 0;
        usuariosNaLive = new Set();
        client.say(channel, `🔓 O bot foi liberado e está no modo normal (0)!`);
        return;
    }

    if (texto.startsWith('!pausar') && isModOrStreamer(tags)) {
        botAtivo = false;
        client.say(channel, `⏸️ O bot foi pausado temporariamente.`);
        return;
    }

    if (texto.startsWith('!parar') && isModOrStreamer(tags)) {
        botAtivo = false;
        client.say(channel, `🛑 O bot foi completamente desligado.`);
        return;
    }

    if (texto.startsWith('!modo 1') && isModOrStreamer(tags)) {
        modo = 1;
        client.say(channel, `🏁 Modo 1 (Competição) ativado!`);
        return;
    }

    if (texto.startsWith('!modo 2') && isModOrStreamer(tags)) {
        modo = 2;
        client.say(channel, `⚡ Modo 2 (Corrida) ativado!`);
        return;
    }

    if (texto.startsWith('!modo 0') && isModOrStreamer(tags)) {
        modo = 0;
        client.say(channel, `🎯 Modo 0 (Normal) ativado!`);
        return;
    }

    if (texto.startsWith('!status') && isModOrStreamer(tags)) {
        const statusStr = botAtivo ? "Ativo ✅" : "Inativo ❌";
        const modos = ['Normal', 'Competição', 'Corrida'];
        const filaStatus = filaAtiva ? "ativada ✅" : "desativada ❌";
        client.say(channel, `📊 Status: ${statusStr} | Modo: ${modo} (${modos[modo]}) | Fila: ${filaStatus}`);
        return;
    }

    if (texto === '!filabot on' && isModOrStreamer(tags)) {
        filaAtiva = true;
        client.say(channel, '✅ Sistema de fila ativado! Use !ia para enviar suas perguntas.');
        return;
    }

    if (texto === '!filabot off' && isModOrStreamer(tags)) {
        filaAtiva = false;
        client.say(channel, '🚫 Sistema de fila desativado.');
        return;
    }

    if (texto === '!filabot status' && isModOrStreamer(tags)) {
        const status = filaAtiva ? 'ativada ✅' : 'desativada ❌';
        client.say(channel, `📋 A fila está atualmente ${status}.`);
        return;
    }

    if (texto.startsWith('!ia') && texto.length > 4) {
        if (!botAtivo) {
            client.say(channel, `⛔ O bot está inativo no momento. Aguarde a liberação!`);
            return;
        }

        const agora = Date.now();
        const pergunta = texto.slice(3).trim();

        if (filaAtiva && modo !== 2) {
            if (modo === 1 && usuariosNaLive.has(usuario)) {
                client.say(channel, `🚫 @${usuario}, no modo competição só é permitida uma pergunta por pessoa.`);
                return;
            }

            if (modo !== 2 && cooldowns[usuario] && agora - cooldowns[usuario] < cooldownUsuario) {
                const tempoRestante = Math.ceil((cooldowns[usuario] + cooldownUsuario - agora) / 60000);
                client.say(channel, `⏳ @${usuario}, você deve esperar mais ${tempoRestante} min para perguntar novamente.`);
                return;
            }

            const prioridade = usuariosNaLive.has(usuario) ? 1 : 0;
            usuariosNaLive.add(usuario);

            if (prioridade) {
                fila.push({ username: usuario, pergunta });
            } else {
                fila.unshift({ username: usuario, pergunta });
            }

            client.say(channel, `📥 @${usuario}, sua pergunta foi adicionada à fila!`);
        } else {
            if (modo !== 2 && Date.now() - ultimoProcessamento < cooldownGlobal) {
                const tempoRestante = Math.ceil((ultimoProcessamento + cooldownGlobal - Date.now()) / 60000);
                client.say(channel, `🕒 Aguarde ${tempoRestante} min antes de enviar nova pergunta.`);
                return;
            }

            if (modo !== 2) {
                ultimoProcessamento = agora;
                cooldowns[usuario] = agora;
            }

            const data = {
                username: usuario,
                message: pergunta
            };

            request.post({
                url: webhookUrl,
                json: true,
                body: data
            }, (error, httpResponse, body) => {
                if (error) {
                    return console.error('Erro ao enviar para o Make:', error);
                }
                console.log(`✅ Pergunta de ${usuario} enviada (sem fila)!`);
            });
        }
    }
});

// Servidor Express para receber resposta
const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.post('/resposta', (req, res) => {
    const { username, resposta } = req.body;

    if (!username || !resposta) {
        console.log("Dados inválidos recebidos.");
        return res.status(400).send("Erro: Dados incompletos");
    }

    const respostaLimpa = resposta.replace(/[\uD800-\uDFFF]/g, '').slice(0, 450);

    client.say('#sterb7', `🤖 ${respostaLimpa}`);
    console.log(`✅ Resposta enviada para @${username}: ${respostaLimpa}`);

    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`Servidor ouvindo na porta ${PORT}`);
});
