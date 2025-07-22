// IMPORTAÇÕES
const tmi = require('tmi.js');
const request = require('request');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

// PERFIL DA STREAMER
let perfilStreamer = {};
try {
    const data = fs.readFileSync('./streamer_profile.json', 'utf8');
    perfilStreamer = JSON.parse(data);
    console.log(`📄 Perfil da streamer carregado: ${perfilStreamer.nome || 'sem nome definido'}`);
} catch (error) {
    console.error('❌ Erro ao carregar o perfil da streamer:', error);
    perfilStreamer = {};
}

// PALAVRAS PROIBIDAS
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

// REINCIDÊNCIA
let reincidentes = {};
const caminhoReincidentes = './usuarios_reincidentes.json';
try {
    if (fs.existsSync(caminhoReincidentes)) {
        reincidentes = JSON.parse(fs.readFileSync(caminhoReincidentes, 'utf8'));
        console.log('📁 Dados de reincidência carregados.');
    }
} catch (error) {
    console.error('❌ Erro ao carregar reincidência:', error);
}

// BOAS-VINDAS
let usuariosBoasVindas = {};
const caminhoBoasVindas = './usuarios_boasvindas.json';
try {
    if (fs.existsSync(caminhoBoasVindas)) {
        usuariosBoasVindas = JSON.parse(fs.readFileSync(caminhoBoasVindas, 'utf8'));
    }
} catch (error) {
    console.error('❌ Erro ao carregar usuários de boas-vindas:', error);
}
function salvarUsuariosBoasVindas() {
    fs.writeFileSync(caminhoBoasVindas, JSON.stringify(usuariosBoasVindas, null, 2));
}

// TWITCH
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

const webhookUrl = process.env.WEBHOOK_URL;

// ESTADOS
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

// IGNORAR USUÁRIOS ESPECÍFICOS
const usuariosIgnorados = [process.env.TWITCH_USERNAME?.toLowerCase(), 'streamelements'];

// HELPERS
function isModOrStreamer(tags) {
    return tags.mod || tags.badges?.broadcaster === '1';
}
function escolhaAleatoria(lista) {
    return lista[Math.floor(Math.random() * lista.length)];
}
function boasVindas(tags, username) {
    if (tags.badges?.broadcaster === '1') {
        return escolhaAleatoria(perfilStreamer.boasVindas?.streamer || []).replace(/\${user}/g, `@${username}`);
    }
    if (tags.mod) {
        return escolhaAleatoria(perfilStreamer.boasVindas?.mod || []).replace(/\${user}/g, `@${username}`);
    }
    if (tags.badges?.vip === '1') {
        return escolhaAleatoria(perfilStreamer.boasVindas?.vip || []).replace(/\${user}/g, `@${username}`);
    }
    return null;
}
function salvarReincidentes() {
    fs.writeFileSync(caminhoReincidentes, JSON.stringify(reincidentes, null, 2));
}
function aplicarPenalidade(channel, username, nivel) {
    switch (nivel) {
        case 1:
            client.say(channel, `⚠️ @${username}, essa linguagem não é bem-vinda aqui. Por favor, respeite o ambiente.`);
            break;
        case 2:
            client.timeout(channel, username, 60, "Comportamento inadequado");
            client.say(channel, `🚫 @${username}, você foi silenciado por 1 minuto por linguagem imprópria.`);
            break;
        case 3:
            client.timeout(channel, username, 300, "Reincidência de comportamento inadequado");
            client.say(channel, `⏰ @${username}, você foi silenciado por 5 minutos por repetição de comportamento inadequado.`);
            break;
        default:
            client.say(channel, `🔎 Moderação, fiquem atentos: @${username} atingiu o limite de advertências.`);
    }
}
function saudouHoje(usuario) {
    const hoje = new Date().toISOString().split('T')[0];
    return usuariosBoasVindas[usuario] === hoje;
}
function registrarSaudacao(usuario) {
    const hoje = new Date().toISOString().split('T')[0];
    usuariosBoasVindas[usuario] = hoje;
    salvarUsuariosBoasVindas();
}

// FILA
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

// COOLDOWN GLOBAL
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

// MENSAGENS & COMANDOS
client.on('message', (channel, tags, message, self) => {
    if (self) return;

    const usuario = tags.username?.toLowerCase();
    const texto = message.trim().toLowerCase();

    if (usuariosIgnorados.includes(usuario)) return;

    console.log(`[${channel}] ${usuario}: ${message}`);

    // Moderação
    const todas = [
        ...palavrasProibidas.palavroes,
        ...palavrasProibidas.sexuais,
        ...palavrasProibidas.odio_e_discriminacao,
        ...palavrasProibidas.alerta_contextual
    ];
    const textoLimpo = message.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').trim();
    const palavraDetectada = todas.some(p => new RegExp(`\\b${p}\\b`, 'i').test(textoLimpo));
    if (palavraDetectada) {
        reincidentes[usuario] = (reincidentes[usuario] || 0) + 1;
        salvarReincidentes();
        aplicarPenalidade(channel, usuario, reincidentes[usuario]);
        return;
    }

    // Boas-vindas (sem visitantes)
    if (!saudouHoje(usuario)) {
        registrarSaudacao(usuario);
        const msg = boasVindas(tags, usuario);
        if (msg) client.say(channel, msg);
    }

    // Comandos Mod
    if (texto.startsWith('!liberar') && isModOrStreamer(tags)) {
        botAtivo = true; modo = 0; usuariosNaLive = new Set();
        return client.say(channel, '🔓 O bot foi liberado e está no modo normal (0)!');
    }
    if (texto.startsWith('!pausar') && isModOrStreamer(tags)) {
        botAtivo = false;
        return client.say(channel, '⏸️ O bot foi pausado temporariamente.');
    }
    if (texto.startsWith('!parar') && isModOrStreamer(tags)) {
        botAtivo = false;
        return client.say(channel, '🛑 O bot foi completamente desligado.');
    }
    if (texto.startsWith('!modo ') && isModOrStreamer(tags)) {
        const novoModo = parseInt(texto.split(' ')[1]);
        if ([0, 1, 2].includes(novoModo)) {
            modo = novoModo;
            const nomes = ['Normal', 'Competição', 'Corrida'];
            return client.say(channel, `🎯 Modo ${modo} (${nomes[modo]}) ativado!`);
        }
        return;
    }
    if (texto.startsWith('!status') && isModOrStreamer(tags)) {
        const status = botAtivo ? "Ativo ✅" : "Inativo ❌";
        const modos = ['Normal', 'Competição', 'Corrida'];
        const filaStatus = filaAtiva ? "ativada ✅" : "desativada ❌";
        return client.say(channel, `📊 Status: ${status} | Modo: ${modo} (${modos[modo]}) | Fila: ${filaStatus}`);
    }
    if (texto === '!filabot on' && isModOrStreamer(tags)) {
        filaAtiva = true;
        return client.say(channel, '✅ Sistema de fila ativado! Use !ia para enviar suas perguntas.');
    }
    if (texto === '!filabot off' && isModOrStreamer(tags)) {
        filaAtiva = false;
        return client.say(channel, '🚫 Sistema de fila desativado.');
    }
    if (texto === '!filabot status' && isModOrStreamer(tags)) {
        const status = filaAtiva ? 'ativada ✅' : 'desativada ❌';
        return client.say(channel, `📋 A fila está atualmente ${status}.`);
    }

    // !ia
    if (texto.startsWith('!ia') && texto.length > 4) {
        if (!botAtivo) {
            return client.say(channel, `⛔ O bot está inativo no momento. Aguarde a liberação!`);
        }
        const agora = Date.now();
        const pergunta = texto.slice(3).trim();

        if (filaAtiva && modo !== 2) {
            if (modo === 1 && usuariosNaLive.has(usuario)) {
                return client.say(channel, `🚫 @${usuario}, no modo competição só é permitida uma pergunta por pessoa.`);
            }
            if (cooldowns[usuario] && agora - cooldowns[usuario] < cooldownUsuario) {
                const tempo = Math.ceil((cooldowns[usuario] + cooldownUsuario - agora) / 60000);
                return client.say(channel, `⏳ @${usuario}, espere ${tempo} min para perguntar novamente.`);
            }

            usuariosNaLive.add(usuario);
            fila.push({ username: usuario, pergunta });
            return client.say(channel, `📥 @${usuario}, sua pergunta foi adicionada à fila!`);
        } else {
            if (modo !== 2 && agora - ultimoProcessamento < cooldownGlobal) {
                const tempo = Math.ceil((ultimoProcessamento + cooldownGlobal - agora) / 60000);
                return client.say(channel, `🕒 Aguarde ${tempo} min antes de nova pergunta.`);
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

// EXPRESS
const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.post('/resposta', (req, res) => {
    const { username, resposta } = req.body;
    if (!username || !resposta) return res.status(400).send("Erro: Dados incompletos");

    const respostaLimpa = resposta.replace(/[�-�]/g, '').slice(0, 450);
    client.say(`#${process.env.TWITCH_CHANNEL}`, `🤖 ${respostaLimpa}`);
    console.log(`✅ Resposta enviada para @${username}: ${respostaLimpa}`);
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor ouvindo na porta ${PORT}`);
});

// AVISO DE FILA
setInterval(() => {
    if (botAtivo && filaAtiva) {
        client.say(`#${process.env.TWITCH_CHANNEL}`, `🔔 A fila está ativa! Use !ia para mandar sua pergunta.`);
    }
}, 15 * 60 * 1000);
