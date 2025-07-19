let fila = [];
let usuariosNaLive = new Set();
let cooldowns = {};
let ultimoProcessamento = 0;
const cooldownGlobal = 10 * 60 * 1000;
const cooldownUsuario = 10 * 60 * 1000;

let botAtivo = false;
let filaAtiva = false;
let modo = 0;

function processarFila() {
    const agora = Date.now();
    if (fila.length === 0 || agora - ultimoProcessamento < cooldownGlobal) return;

    const proximo = fila.shift();
    if (!proximo) return;

    const { username, pergunta } = proximo;
    ultimoProcessamento = agora;
    cooldowns[username] = agora;

    const request = require('request');
    request.post({
        url: process.env.WEBHOOK_URL,
        json: true,
        body: { username, message: pergunta }
    }, (error) => {
        if (error) console.error('Erro ao enviar para o Make:', error);
        else console.log(`✅ Pergunta de ${username} enviada (fila)!`);
    });
}

module.exports = {
    fila, usuariosNaLive, cooldowns, cooldownUsuario,
    botAtivo, filaAtiva, modo, processarFila
};
