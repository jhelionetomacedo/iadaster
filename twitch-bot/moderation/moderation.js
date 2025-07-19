const fs = require('fs');
const { mensagensPorNivel } = require('../utils/mensagensModeracao');
const { aumentarPontuacao, getPontuacao } = require('./pontuacoes');
const { client } = require('../core/client');

let palavrasProibidas = {
    palavroes: [], sexuais: [], odio_e_discriminacao: [], alerta_contextual: []
};

// Carrega palavras proibidas do JSON
try {
    const data = fs.readFileSync('./palavras_proibidas.json', 'utf8');
    palavrasProibidas = JSON.parse(data);
} catch (e) {
    console.error('Erro ao carregar palavras proibidas:', e);
}

// Verifica se a mensagem contém palavras proibidas e retorna o nível
function verificarPalavrasProibidas(message) {
    const texto = message.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').trim();
    const categorias = [
        { lista: palavrasProibidas.palavroes, nivel: 0 },
        { lista: palavrasProibidas.sexuais, nivel: 1 },
        { lista: palavrasProibidas.alerta_contextual, nivel: 2 },
        { lista: palavrasProibidas.odio_e_discriminacao, nivel: 3 }
    ];

    for (const categoria of categorias) {
        for (const palavra of categoria.lista) {
            const regex = new RegExp(`\\b${palavra}\\b`, 'i');
            if (regex.test(texto)) return categoria.nivel;
        }
    }
    return null;
}

// Aplica punição de acordo com o nível e reincidência
function aplicarMedidaModeracao(nivel, usuario, canal) {
    const reincidencia = aumentarPontuacao(usuario);
    const msgBase = mensagensPorNivel[nivel];

    if (msgBase) {
        const msg = msgBase[Math.floor(Math.random() * msgBase.length)];
        client.say(canal, msg.replace('{user}', `@${usuario}`));
    }

    if (nivel === 2) {
        const tempo = reincidencia >= 3 ? 600 : 300;
        client.timeout(canal, usuario, tempo, "Linguagem inadequada reincidente");
    }

    if (nivel === 3) {
        if (reincidencia >= 2) {
            client.ban(canal, usuario, "Discurso de ódio reincidente");
        } else {
            client.timeout(canal, usuario, 600, "Discurso de ódio - aviso");
        }
    }
}

module.exports = {
    verificarPalavrasProibidas,
    aplicarMedidaModeracao
};
