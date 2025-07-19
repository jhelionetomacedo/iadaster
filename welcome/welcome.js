const fs = require('fs');
const { escolhaAleatoria } = require('../utils/utils');

let perfilStreamer = {};
try {
    const data = fs.readFileSync('./streamer_profile.json', 'utf8');
    perfilStreamer = JSON.parse(data);
} catch (e) {
    console.error("Erro ao carregar perfil da streamer:", e);
}

function boasVindas(tags) {
    const user = tags.username;

    if (tags.badges?.broadcaster === '1')
        return escolhaAleatoria(perfilStreamer.boasVindas?.streamer || []).replace('${user}', user);
    if (tags.mod)
        return escolhaAleatoria(perfilStreamer.boasVindas?.mod || []).replace('${user}', user);
    if (tags.badges?.vip === '1')
        return escolhaAleatoria(perfilStreamer.boasVindas?.vip || []).replace('${user}', user);

    return escolhaAleatoria(perfilStreamer.boasVindas?.visitante || []).replace('${user}', user);
}

module.exports = { boasVindas };
