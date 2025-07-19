function isModOrStreamer(tags) {
    return tags.mod || tags.badges?.broadcaster === '1';
}

function escolhaAleatoria(lista) {
    return lista[Math.floor(Math.random() * lista.length)];
}

module.exports = { isModOrStreamer, escolhaAleatoria };
