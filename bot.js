const tmi = require('tmi.js');
const request = require('request');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

// ====================
// Carregar perfil da streamer
// ====================
let perfilStreamer = {};
try {
    const data = fs.readFileSync('./streamer_profile.json', 'utf8');
    perfilStreamer = JSON.parse(data);
    console.log(`📄 Perfil da streamer carregado: ${perfilStreamer.nome || 'sem nome definido'}`);
} catch (error) {
    console.error('❌ Erro ao carregar o perfil da streamer:', error);
    perfilStreamer = {};
}

// ====================
// Carregar palavras proibidas
// ====================
let palavrasProibidas = {
    palavroes: [],
    sexuais: [],
    odio_e_discriminacao: [],
    alerta_contextual: []
};

try {
    const data = fs.readFileSync('./palavras_proibidas.json', 'utf8');
    palavrasProibidas = JSON.parse(data);
    console.log('🛡️ Lista de palavras proibidas carregada com sucesso.');
} catch (error) {
    console.error('❌ Erro ao carregar palavras proibidas:', error);
}

// ====================
// Configurações do Twitch
// ====================
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

// ====================
// Estados do bot
// ====================
let botAtivo = false;
let modo = 0;
let filaAtiva = false;
let fila = [];
const cooldownGlobal = 10 * 60 * 1000;
const cooldownUsuario = 10 * 60 * 1000;
let ultimoProcessamento = 0;
const cooldowns = {};
let usuariosNaLive = new Set();
let avisadoCooldown = false;

// ====================
// Verifica se é mod ou streamer
// ====================
function isModOrStreamer(tags) {
    return tags.mod || tags.badges?.broadcaster === '1';
}

// ====================
// Mensagens de boas-vindas
// ====================
function boasVindas(tags) {
    const user = tags.username;

    if (tags.badges?.broadcaster === '1') {
        const msgs = perfilStreamer.boasVindas?.streamer || [];
        return escolhaAleatoria(msgs).replace('${user}', user);
    }

    if (tags.mod) {
        const msgs = perfilStreamer.boasVindas?.mod || [];
        return escolhaAleatoria(msgs).replace('${user}', user);
    }

    if (tags.badges?.vip === '1') {
        const msgs = perfilStreamer.boasVindas?.vip || [];
        return escolhaAleatoria(msgs).replace('${user}', user);
    }

    const msgs = perfilStreamer.boasVindas?.visitante || [];
    return escolhaAleatoria(msgs).replace('${user}', user);
}

function escolhaAleatoria(lista) {
    return lista[Math.floor(Math.random() * lista.length)];
}

// ====================
// Processa a fila automaticamente
// ====================
function processarFila() {
    const agora = Date.now();
    if (fila.length === 0 || agora - ultimoProcessamento < cooldownGlobal) return;

    const proximo = fila.shift();
    if (!proximo) return;

    const { username, pergunta } = proximo;
    ultimoProcessamento = agora;
    cooldowns[username] = agora;

    request.post({
        url: webhookUrl,
        json: true,
        body: { username, message: pergunta }
    }, (error) => {
        if (error) console.error('Erro ao enviar para o Make:', error);
        else console.log(`✅ Pergunta de ${username} enviada (fila)!`);
    });
}

setInterval(processarFila, 5000);

// ====================
// Aviso quando cooldown global for liberado
// ====================
setInterval(() => {
    if (filaAtiva || !botAtivo) return;

    const agora = Date.now();
    const tempoDesdeUltimo = agora - ultimoProcessamento;

    if (tempoDesdeUltimo >= cooldownGlobal && !avisadoCooldown) {
        client.say(`#${process.env.TWITCH_CHANNEL}`, '🔄 Cooldown liberado! Pode mandar suas perguntas com !ia 🎤');
        avisadoCooldown = true;
    } else if (tempoDesdeUltimo < cooldownGlobal) {
        avisadoCooldown = false;
    }
}, 30000);

// ====================
// Conexão e mensagens
// ====================
client.on('message', (channel, tags, message, self) => {
    if (self) return;

    const usuario = tags.username;
    const texto = message.trim().toLowerCase();
    console.log(`[${channel}] ${usuario}: ${message}`);

    // Verificar palavras proibidas
    const todasPalavrasProibidas = [
        ...palavrasProibidas.palavroes,
        ...palavrasProibidas.sexuais,
        ...palavrasProibidas.odio_e_discriminacao,
        ...palavrasProibidas.alerta_contextual
    ];

    const mensagemSemPontuacao = message.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').trim();

    const encontrouPalavraProibida = todasPalavrasProibidas.some(palavra => {
        const regex = new RegExp(`\\b${palavra}\\b`, 'i');
        return regex.test(mensagemSemPontuacao);
    });

    if (encontrouPalavraProibida) {
        client.say(channel, `🚫 @${usuario}, cuidado com o que você diz! Essa linguagem não é permitida aqui.`);
        console.log(`⚠️ Mensagem com palavra proibida detectada de ${usuario}: "${message}"`);
        return;
    }

    // Boas-vindas
    if (!usuariosNaLive.has(usuario)) {
        usuariosNaLive.add(usuario);
        const msg = boasVindas(tags);
        if (msg) client.say(channel, msg);
    }

    // Comandos administrativos
    if (texto.startsWith('!liberar') && isModOrStreamer(tags)) {
        botAtivo = true; modo = 0; usuariosNaLive = new Set();
        client.say(channel, '🔓 O bot foi liberado e está no modo normal (0)!');
        return;
    }
    if (texto.startsWith('!pausar') && isModOrStreamer(tags)) {
        botAtivo = false;
        client.say(channel, '⏸️ O bot foi pausado temporariamente.');
        return;
    }
    if (texto.startsWith('!parar') && isModOrStreamer(tags)) {
        botAtivo = false;
        client.say(channel, '🛑 O bot foi completamente desligado.');
        return;
    }
    if (texto.startsWith('!modo ') && isModOrStreamer(tags)) {
        const novoModo = parseInt(texto.split(' ')[1]);
        if ([0, 1, 2].includes(novoModo)) {
            modo = novoModo;
            const nomesModos = ['Normal', 'Competição', 'Corrida'];
            client.say(channel, `🎯 Modo ${modo} (${nomesModos[modo]}) ativado!`);
        }
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

    // Comando !ia
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

            usuariosNaLive.add(usuario);
            fila.push({ username: usuario, pergunta });
            client.say(channel, `📥 @${usuario}, sua pergunta foi adicionada à fila!`);
        } else {
            if (modo !== 2 && Date.now() - ultimoProcessamento < cooldownGlobal) {
                const tempoRestante = Math.ceil((ultimoProcessamento + cooldownGlobal - agora) / 60000);
                client.say(channel, `🕒 Aguarde ${tempoRestante} min antes de enviar nova pergunta.`);
                return;
            }

            if (modo !== 2) {
                ultimoProcessamento = agora;
                cooldowns[usuario] = agora;
            }

            request.post({
                url: webhookUrl,
                json: true,
                body: { username: usuario, message: pergunta }
            }, (error) => {
                if (error) return console.error('Erro ao enviar para o Make:', error);
                console.log(`✅ Pergunta de ${usuario} enviada (sem fila)!`);
            });
        }
    }
});

// ====================
// Servidor Express
// ====================
const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.post('/resposta', (req, res) => {
    const { username, resposta } = req.body;

    if (!username || !resposta) {
        console.log("❌ Dados inválidos recebidos.");
        return res.status(400).send("Erro: Dados incompletos");
    }

    const respostaLimpa = resposta.replace(/[�-�]/g, '').slice(0, 450);
    client.say(`#${process.env.TWITCH_CHANNEL}`, `🤖 ${respostaLimpa}`);
    console.log(`✅ Resposta enviada para @${username}: ${respostaLimpa}`);
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor ouvindo na porta ${PORT}`);
});

// ====================
// Aviso periódico da fila
// ====================
setInterval(() => {
    if (botAtivo && filaAtiva) {
        client.say(`#${process.env.TWITCH_CHANNEL}`, `🔔 A fila está ativa! Use !ia para mandar sua pergunta.`);
    }
}, 15 * 60 * 1000);
