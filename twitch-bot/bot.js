const { client } = require('./core/client');
const { verificarPalavrasProibidas, aplicarMedidaModeracao } = require('./moderation/moderation');
const { carregarPontuacoes } = require('./moderation/pontuacoes');
const { registrarOcorrencia } = require('./moderation/reincidencia');
const { processarFila, fila, cooldownUsuario, cooldowns, usuariosNaLive, botAtivo, filaAtiva, modo } = require('./core/state');
const { boasVindas } = require('./welcome/welcome');
const { isModOrStreamer } = require('./utils/utils');
const express = require('./core/expressServer');

// Carregar pontuações ao iniciar
carregarPontuacoes();

client.on('message', async (channel, tags, message, self) => {
    if (self) return;

    const usuario = tags.username;
    const texto = message.trim().toLowerCase();

    // Moderação
    const nivel = verificarPalavrasProibidas(message);
    if (nivel !== null) {
        await aplicarMedidaModeracao(nivel, usuario, channel);
        registrarOcorrencia(usuario, nivel, client, channel);
        return;
    }

    // Boas-vindas
    if (!usuariosNaLive.has(usuario)) {
        usuariosNaLive.add(usuario);
        const msg = boasVindas(tags);
        if (msg) client.say(channel, msg);
    }

    // Aqui entram seus comandos administrativos ou comandos do bot (omitidos para clareza)
});

setInterval(processarFila, 5000);
