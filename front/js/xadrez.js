/* Tela do xadrez: desenha o tabuleiro e liga os cliques ao motor (xadrez-motor.js). */
(function () {
  'use strict';

  var X = window.Xadrez;
  var NOMES = { P: 'peão', N: 'cavalo', B: 'bispo', R: 'torre', Q: 'rainha', K: 'rei' };
  var COR = { w: 'branco', b: 'preto' };
  // Sempre o desenho "cheio"; a cor vem do CSS. ︎ impede que vire emoji.
  var GLIFO = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

  var el = {
    tab: document.getElementById('tabuleiro'),
    msg: document.getElementById('mensagem'),
    modo: document.getElementById('modo'),
    nivel: document.getElementById('nivel'),
    cor: document.getElementById('cor'),
    opcoesPc: document.getElementById('opcoes-pc'),
    novo: document.getElementById('novo'),
    desfazer: document.getElementById('desfazer'),
    virar: document.getElementById('virar'),
    lista: document.getElementById('lista'),
    vazio: document.getElementById('vazio'),
    promo: document.getElementById('promocao')
  };

  var jogo;            // { estados: [...], jogadas: [{move, san}] }
  var selecionada = -1;
  var destinos = [];   // jogadas legais da peca selecionada
  var virado = false;
  var foco = 52;       // casa com tabindex=0 (e2)
  var pensando = false;
  var pendente = null; // jogadas de promocao aguardando escolha
  var casas = [];

  function estadoAtual() { return jogo.estados[jogo.estados.length - 1]; }
  function jogandoContraPc() { return el.modo.value === 'pc'; }
  function corDoComputador() { return el.cor.value === 'w' ? 'b' : 'w'; }
  function vezDoComputador() { return jogandoContraPc() && estadoAtual().turn === corDoComputador(); }

  function novoJogo() {
    jogo = { estados: [X.novoEstado()], jogadas: [] };
    selecionada = -1; destinos = []; pensando = false; pendente = null;
    el.promo.hidden = true;
    virado = jogandoContraPc() && el.cor.value === 'b';
    foco = virado ? 11 : 52;
    desenhar();
    agendarComputador();
  }

  /* ---------- Desenho ---------- */
  function construirCasas() {
    el.tab.innerHTML = '';
    casas = [];
    for (var pos = 0; pos < 64; pos++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'casa';
      b.setAttribute('role', 'gridcell');
      b.addEventListener('click', aoClicar);
      b.addEventListener('keydown', aoTeclar);
      el.tab.appendChild(b);
      casas.push(b);
    }
  }

  function indiceNaPosicao(pos) { return virado ? 63 - pos : pos; }

  function desenhar() {
    var s = estadoAtual();
    var lista = X.legais(s);
    var fim = !lista.length || ['regra-50', 'material'].indexOf(X.situacao(s, lista)) >= 0;
    var xeque = X.emXeque(s);
    var rei = xeque ? X.casaDoRei(s.board, s.turn) : -1;
    var ultima = jogo.jogadas.length ? jogo.jogadas[jogo.jogadas.length - 1].move : null;

    for (var pos = 0; pos < 64; pos++) {
      var i = indiceNaPosicao(pos), r = i >> 3, c = i & 7, b = casas[pos];
      var peca = s.board[i];
      var cls = 'casa ' + (((r + c) % 2 === 0) ? 'casa--clara' : 'casa--escura');
      if (ultima && (i === ultima.from || i === ultima.to)) cls += ' casa--ultima';
      if (i === selecionada) cls += ' casa--selecionada';
      if (i === rei) cls += ' casa--xeque';
      var d = destinos.filter(function (m) { return m.to === i; });
      if (d.length) cls += ' casa--destino' + ((peca || d[0].flag === 'ep') ? ' casa--captura' : '');
      b.className = cls;
      b.dataset.indice = i;

      var rotulo = X.nomeCasa(i) + ', ' + (peca ? NOMES[peca.charAt(1)] + ' ' + COR[peca.charAt(0)] : 'vazia');
      if (i === selecionada) rotulo += ', selecionada';
      if (d.length) rotulo += ', jogada possível';
      b.setAttribute('aria-label', rotulo);
      b.tabIndex = (i === foco) ? 0 : -1;
      b.disabled = false;

      var html = '';
      if (peca) html += '<span class="peca-xadrez peca-xadrez--' + peca.charAt(0) + '" aria-hidden="true">' + GLIFO[peca.charAt(1)] + '︎</span>';
      if (pos % 8 === 0) html += '<span class="coord coord--linha" aria-hidden="true">' + (8 - r) + '</span>';
      if (pos >= 56) html += '<span class="coord coord--coluna" aria-hidden="true">' + 'abcdefgh'.charAt(c) + '</span>';
      b.innerHTML = html;
    }

    mostrarMensagem(s, lista, fim);
    listarJogadas();
    el.desfazer.disabled = jogo.estados.length < 2 || pensando;
  }

  function nomeCor(c) { return c === 'w' ? 'brancas' : 'pretas'; }

  function mostrarMensagem(s, lista, fim) {
    var st = X.situacao(s, lista), t, cls = 'status';
    if (st === 'xeque-mate') { t = 'Xeque-mate! As ' + nomeCor(s.turn === 'w' ? 'b' : 'w') + ' ganharam.'; cls += ' status--fim'; }
    else if (st === 'afogamento') { t = 'Empate: as ' + nomeCor(s.turn) + ' não têm jogada e o rei não está em xeque.'; cls += ' status--fim'; }
    else if (st === 'regra-50') { t = 'Empate: 50 jogadas sem capturar nem mover peão.'; cls += ' status--fim'; }
    else if (st === 'material') { t = 'Empate: não há peças suficientes para dar xeque-mate.'; cls += ' status--fim'; }
    else {
      var vez = jogandoContraPc()
        ? (vezDoComputador() ? 'O computador está pensando...' : 'Sua vez (' + nomeCor(s.turn) + ').')
        : 'Vez das ' + nomeCor(s.turn) + '.';
      t = st === 'xeque' ? 'Xeque! ' + vez : vez;
      if (st === 'xeque') cls += ' status--xeque';
      if (jogandoContraPc() && vezDoComputador() && !pensando) t = 'Vez do computador.';
    }
    el.msg.className = cls;
    el.msg.textContent = t;
  }

  function listarJogadas() {
    el.lista.innerHTML = '';
    for (var n = 0; n < jogo.jogadas.length; n += 2) {
      var li = document.createElement('li');
      var a = document.createElement('span'); a.textContent = jogo.jogadas[n].san; li.appendChild(a);
      if (jogo.jogadas[n + 1]) { var b = document.createElement('span'); b.textContent = jogo.jogadas[n + 1].san; li.appendChild(b); }
      el.lista.appendChild(li);
    }
    el.vazio.hidden = jogo.jogadas.length > 0;
    el.lista.scrollTop = el.lista.scrollHeight;
  }

  /* ---------- Jogar ---------- */
  function fimDeJogo() {
    var s = estadoAtual();
    var st = X.situacao(s);
    return ['xeque-mate', 'afogamento', 'regra-50', 'material'].indexOf(st) >= 0;
  }

  function fazerJogada(m) {
    var s = estadoAtual();
    var san = X.notacao(s, m);
    jogo.estados.push(X.aplicar(s, m));
    jogo.jogadas.push({ move: m, san: san });
    selecionada = -1; destinos = [];
    desenhar();
    agendarComputador();
  }

  function aoClicar(e) {
    var i = parseInt(e.currentTarget.dataset.indice, 10);
    foco = i;
    if (pensando || pendente || fimDeJogo() || vezDoComputador()) { desenhar(); return; }
    var s = estadoAtual();
    var alvo = destinos.filter(function (m) { return m.to === i; });
    if (alvo.length) {
      if (alvo[0].promo) { pendente = alvo; el.promo.hidden = false; el.promo.querySelector('button').focus(); return; }
      fazerJogada(alvo[0]);
      return;
    }
    var p = s.board[i];
    if (p && p.charAt(0) === s.turn && i !== selecionada) {
      selecionada = i;
      destinos = X.legais(s).filter(function (m) { return m.from === i; });
    } else {
      selecionada = -1; destinos = [];
    }
    desenhar();
    casas[posNaTela(foco)].focus();
  }

  function posNaTela(i) { return virado ? 63 - i : i; }

  function aoTeclar(e) {
    var pos = posNaTela(parseInt(e.currentTarget.dataset.indice, 10)), r = pos >> 3, c = pos & 7;
    if (e.key === 'ArrowUp') r--; else if (e.key === 'ArrowDown') r++;
    else if (e.key === 'ArrowLeft') c--; else if (e.key === 'ArrowRight') c++;
    else return;
    e.preventDefault();
    if (r < 0 || r > 7 || c < 0 || c > 7) return;
    foco = indiceNaPosicao(r * 8 + c);
    desenhar();
    casas[r * 8 + c].focus();
  }

  el.promo.addEventListener('click', function (e) {
    var t = e.target.getAttribute && e.target.getAttribute('data-peca');
    if (!t || !pendente) return;
    var m = pendente.filter(function (x) { return x.promo === t; })[0];
    pendente = null;
    el.promo.hidden = true;
    fazerJogada(m);
  });

  /* ---------- Computador ---------- */
  function agendarComputador() {
    if (!vezDoComputador() || fimDeJogo()) return;
    pensando = true;
    desenhar();
    var antes = jogo.estados.length;
    setTimeout(function () {
      if (!pensando || jogo.estados.length !== antes) return;
      var m = X.melhorJogada(estadoAtual(), el.nivel.value);
      pensando = false;
      if (m) fazerJogada(m); else desenhar();
    }, 450);
  }

  /* ---------- Botoes ---------- */
  el.novo.addEventListener('click', novoJogo);

  el.desfazer.addEventListener('click', function () {
    if (jogo.estados.length < 2) return;
    // contra o computador, desfaz a jogada do computador e a sua
    var tirar = Math.min(jogandoContraPc() ? 2 : 1, jogo.jogadas.length);
    for (var k = 0; k < tirar; k++) { jogo.estados.pop(); jogo.jogadas.pop(); }
    selecionada = -1; destinos = []; pensando = false;
    desenhar();
    agendarComputador();
  });

  el.virar.addEventListener('click', function () { virado = !virado; desenhar(); });

  el.modo.addEventListener('change', function () { el.opcoesPc.hidden = !jogandoContraPc(); novoJogo(); });
  el.nivel.addEventListener('change', novoJogo);
  el.cor.addEventListener('change', novoJogo);

  construirCasas();
  el.opcoesPc.hidden = !jogandoContraPc();
  novoJogo();
})();
