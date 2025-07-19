const reincidentes = {};

function registrarOcorrencia(usuario, nivel, client, canal) {
    if (!reincidentes[usuario]) {
        reincidentes[usuario] = { pontos: 0, ultimoNivel: -1 };
    }

    const penalidade = nivel + 1;
    reincidentes[usuario].pontos += penalidade;

    const total = reincidentes[usuario].pontos;

    if (total >= 8) {
        client.say(canal, `🚫 ${usuario} foi banido por reincidência.`);
        client.ban(canal, usuario, "Reincidência grave");
    } else if (total >= 5) {
        client.say(canal, `⚠️ ${usuario}, você foi colocado em timeout por reincidência.`);
        client.timeout(canal, usuario, 600, "Reincidência");
    }
}

module.exports = { registrarOcorrencia };
