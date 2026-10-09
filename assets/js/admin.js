/* MStee — área do administrador
 *
 * Login com usuário e senha e gravação dos dados no próprio servidor
 * (HostGator), via admin-api.php: data/ranking.js, data/aniversarios.js e
 * as fotos dos aniversariantes em assets/img/aniversarios/.
 */
(function () {
  "use strict";

  /* ---------- configuração ---------- */
  const API = "admin-api.php";
  const SENHA_MIN = 8;

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const $ = (s, el = document) => el.querySelector(s);

  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICO = {
    cima: svg("<path d=\"M12 19V5M5 12l7-7 7 7\"/>"),
    baixo: svg("<path d=\"M12 5v14M19 12l-7 7-7-7\"/>"),
    x: svg("<path d=\"M6 6l12 12M18 6L6 18\"/>"),
  };

  /* ---------- estado ---------- */
  let usuarioAtual = "";
  const st = {
    ranking: null, rankingOrig: "",
    aniv: null, anivOrig: "",
  };
  const previas = {}; // caminho da foto -> dataURL (mostra a foto nova sem recarregar)

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  let toastTimer;
  function toast(msg, erro) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("erro", !!erro);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), erro ? 6000 : 3500);
  }

  /* ---------- servidor ---------- */
  async function api(acao, dados) {
    let r;
    try {
      r = await fetch(API + "?acao=" + acao, {
        method: dados ? "POST" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: dados ? { "Content-Type": "application/json", "X-MSTEE": "1" } : {},
        body: dados ? JSON.stringify(dados) : undefined,
      });
    } catch (e) {
      throw Object.assign(new Error(location.protocol === "file:"
        ? "A área do administrador só funciona com o site publicado na hospedagem."
        : "Sem conexão com o servidor."), { status: 0 });
    }
    let corpo = null;
    try { corpo = await r.json(); } catch (e) { /* resposta não é JSON */ }
    if (!r.ok || !corpo) {
      const err = new Error((corpo && corpo.erro) ||
        (r.status === 404 ? "admin-api.php não foi encontrado no servidor." : "Erro no servidor (" + r.status + ")."));
      err.status = r.status;
      if (r.status === 401 && acao !== "login") voltarAoLogin(err.message);
      throw err;
    }
    return corpo;
  }

  /* ---------- serialização (usada para detectar alterações) ---------- */
  function serialRanking(r) {
    return JSON.stringify({
      mes: +r.mes,
      ano: +r.ano,
      categorias: r.categorias.map((c) => ({
        nome: c.nome.trim(),
        jogadores: c.jogadores.filter((j) => j.nome.trim()).map((j) => {
          const o = { pos: parseInt(j.pos, 10) || 0, nome: j.nome.trim() };
          const p = String(j.pontos ?? "").trim();
          if (p !== "") o.pontos = isNaN(+p) ? p : +p;
          return o;
        }),
      })),
    });
  }
  function serialAniv(a) {
    return JSON.stringify({
      mes: +a.mes,
      ano: +a.ano,
      aniversariantes: a.aniversariantes
        .filter((p) => p.nome.trim())
        .map((p) => ({
          nome: p.nome.trim(),
          dia: parseInt(p.dia, 10) || 1,
          foto: p.foto || "",
          mensagem: (p.mensagem || "").trim(),
        }))
        .sort((x, y) => x.dia - y.dia),
    });
  }
  const rankingSujo = () => st.ranking && serialRanking(st.ranking) !== st.rankingOrig;
  const anivSujo = () => st.aniv && (serialAniv(st.aniv) !== st.anivOrig || st.aniv.aniversariantes.some((p) => p._novaFoto));

  function atualizarStatus() {
    const r = rankingSujo(), a = anivSujo();
    const el = $("#status");
    const partes = [];
    if (r) partes.push("ranking");
    if (a) partes.push("aniversariantes");
    if (partes.length) {
      el.textContent = "Alterações não salvas em: " + partes.join(" e ") + ".";
      el.className = "status sujo";
    } else if (!el.classList.contains("ok")) {
      el.textContent = "Nenhuma alteração.";
      el.className = "status";
    }
    $("#salvar").disabled = !partes.length;
    $("#descartar").disabled = !partes.length;
  }

  /* ---------- login ---------- */
  async function abrirPainel(sessao) {
    usuarioAtual = sessao.usuario;
    await carregarDados();
    $("#usuario").textContent = usuarioAtual;
    $("#aviso-senha").hidden = !sessao.inicial;
    $("#tela-login").hidden = true;
    $("#tela-painel").hidden = false;
  }

  function voltarAoLogin(msg) {
    $("#tela-painel").hidden = true;
    $("#tela-login").hidden = false;
    $("#login-erro").textContent = msg || "";
    $("#login-senha").value = "";
    $("#login-usuario").focus();
  }

  async function carregarDados() {
    const d = await api("dados");
    st.ranking = d.ranking;
    st.rankingOrig = serialRanking(st.ranking);
    st.aniv = d.aniversarios;
    st.anivOrig = serialAniv(st.aniv);
    renderRanking();
    renderAniv();
    atualizarStatus();
  }

  async function comBotao(form, rotulo, fn) {
    const btn = form.querySelector('button[type="submit"]');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = rotulo;
    try { await fn(); } finally { btn.disabled = false; btn.textContent = original; }
  }

  $("#form-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const erro = $("#login-erro");
    erro.textContent = "";
    comBotao(e.target, "Entrando…", async () => {
      try {
        const sessao = await api("login", { usuario: $("#login-usuario").value, senha: $("#login-senha").value });
        await abrirPainel(sessao);
      } catch (err) {
        erro.textContent = err.message;
      }
    });
  });

  $("#sair").addEventListener("click", async () => {
    if ((rankingSujo() || anivSujo()) && !confirm("Há alterações não salvas. Sair mesmo assim?")) return;
    try { await api("sair", {}); } catch (e) { /* sai mesmo assim */ }
    location.reload();
  });

  /* ---------- alterar senha ---------- */
  function abrirSenha() {
    $("#nova-usuario").value = usuarioAtual;
    $("#senha-atual").value = "";
    $("#nova-senha").value = "";
    $("#nova-senha2").value = "";
    $("#senha-erro").textContent = "";
    $("#dlg-senha").showModal();
  }
  $("#abrir-senha").addEventListener("click", abrirSenha);
  document.querySelector("[data-abrir-senha]").addEventListener("click", abrirSenha);
  $("#dlg-senha [data-fechar]").addEventListener("click", () => $("#dlg-senha").close());

  $("#form-senha").addEventListener("submit", (e) => {
    e.preventDefault();
    const erro = $("#senha-erro");
    const senha = $("#nova-senha").value;
    erro.textContent = "";
    if (senha.length < SENHA_MIN) { erro.textContent = `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`; return; }
    if (senha !== $("#nova-senha2").value) { erro.textContent = "As senhas não conferem."; return; }
    comBotao(e.target, "Salvando…", async () => {
      try {
        const sessao = await api("senha", {
          senhaAtual: $("#senha-atual").value,
          usuario: $("#nova-usuario").value,
          novaSenha: senha,
        });
        usuarioAtual = sessao.usuario;
        $("#usuario").textContent = usuarioAtual;
        $("#aviso-senha").hidden = true;
        $("#dlg-senha").close();
        toast("Senha alterada. Use a nova senha no próximo login.");
      } catch (err) {
        erro.textContent = err.message;
      }
    });
  });

  /* ---------- abas ---------- */
  document.querySelectorAll(".admin-tabs button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".admin-tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
      document.querySelectorAll(".aba").forEach((s) => { s.hidden = s.id !== "aba-" + b.dataset.aba; });
    });
  });

  /* ---------- seletores de mês ---------- */
  ["#r-mes", "#a-mes"].forEach((sel) => {
    $(sel).innerHTML = MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  });

  /* =========================================================
     RANKING
     ========================================================= */
  function renderRanking() {
    const r = st.ranking;
    $("#r-mes").value = r.mes;
    $("#r-ano").value = r.ano;
    $("#r-categorias").innerHTML = r.categorias.map((c, ci) => `
      <div class="cat" data-ci="${ci}">
        <div class="cat-head">
          <input class="inp" data-campo="cat-nome" value="${esc(c.nome)}" placeholder="Nome da categoria" aria-label="Nome da categoria">
          <span class="cat-count">${c.jogadores.length} jogador${c.jogadores.length === 1 ? "" : "es"}</span>
          <button class="icon-btn" data-acao="cat-subir" title="Mover categoria para cima" ${ci === 0 ? "disabled" : ""}>${ICO.cima}</button>
          <button class="icon-btn" data-acao="cat-descer" title="Mover categoria para baixo" ${ci === r.categorias.length - 1 ? "disabled" : ""}>${ICO.baixo}</button>
          <button class="icon-btn danger" data-acao="cat-remover" title="Remover categoria">${ICO.x}</button>
        </div>
        <div class="cat-body">
          ${c.jogadores.length ? `<div class="rows-head"><span>Pos.</span><span>Nome</span><span>Pontos</span><span></span></div>` :
            `<p class="cat-empty">Nenhum jogador nesta categoria.</p>`}
          ${c.jogadores.map((j, ji) => `
            <div class="row" data-ji="${ji}">
              <input class="inp pos" data-campo="pos" type="number" min="1" value="${esc(j.pos)}" aria-label="Posição">
              <input class="inp" data-campo="nome" value="${esc(j.nome)}" placeholder="Nome do jogador" aria-label="Nome">
              <input class="inp pts" data-campo="pontos" value="${esc(j.pontos ?? "")}" placeholder="opcional" aria-label="Pontos (opcional)">
              <div class="row-actions">
                <button class="icon-btn" data-acao="j-subir" title="Subir" ${ji === 0 ? "disabled" : ""}>${ICO.cima}</button>
                <button class="icon-btn" data-acao="j-descer" title="Descer" ${ji === c.jogadores.length - 1 ? "disabled" : ""}>${ICO.baixo}</button>
                <button class="icon-btn danger" data-acao="j-remover" title="Remover jogador">${ICO.x}</button>
              </div>
            </div>`).join("")}
          <div class="cat-tools">
            <button class="btn btn--ghost btn--sm" data-acao="j-add">+ Jogador</button>
            <button class="btn btn--ghost btn--sm" data-acao="numerar" title="Define as posições 1, 2, 3… na ordem atual">Numerar em ordem</button>
            <button class="btn btn--ghost btn--sm" data-acao="colar">Colar lista</button>
          </div>
        </div>
      </div>`).join("");
  }

  $("#r-mes").addEventListener("change", (e) => { st.ranking.mes = +e.target.value; atualizarStatus(); });
  $("#r-ano").addEventListener("input", (e) => { st.ranking.ano = +e.target.value; atualizarStatus(); });

  $("#r-categorias").addEventListener("input", (e) => {
    const campo = e.target.dataset.campo;
    if (!campo) return;
    const c = st.ranking.categorias[+e.target.closest(".cat").dataset.ci];
    if (campo === "cat-nome") c.nome = e.target.value;
    else {
      const j = c.jogadores[+e.target.closest(".row").dataset.ji];
      j[campo] = campo === "pos" ? (parseInt(e.target.value, 10) || "") : e.target.value;
    }
    atualizarStatus();
  });

  // Enter no nome do último jogador adiciona uma nova linha
  $("#r-categorias").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.dataset.campo !== "nome") return;
    e.preventDefault();
    const ci = +e.target.closest(".cat").dataset.ci;
    const ji = +e.target.closest(".row").dataset.ji;
    const c = st.ranking.categorias[ci];
    if (ji === c.jogadores.length - 1) adicionarJogador(ci);
    else focarJogador(ci, ji + 1);
  });

  function focarJogador(ci, ji) {
    const el = document.querySelector(`.cat[data-ci="${ci}"] .row[data-ji="${ji}"] [data-campo="nome"]`);
    if (el) el.focus();
  }
  function adicionarJogador(ci) {
    const c = st.ranking.categorias[ci];
    const ultimo = c.jogadores[c.jogadores.length - 1];
    c.jogadores.push({ pos: ultimo ? (parseInt(ultimo.pos, 10) || c.jogadores.length) + 1 : 1, nome: "", pontos: "" });
    renderRanking();
    focarJogador(ci, c.jogadores.length - 1);
    atualizarStatus();
  }

  let colarAlvo = null;
  $("#r-categorias").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-acao]");
    if (!btn) return;
    const ci = +btn.closest(".cat").dataset.ci;
    const cats = st.ranking.categorias;
    const c = cats[ci];
    const ji = btn.closest(".row") ? +btn.closest(".row").dataset.ji : -1;
    switch (btn.dataset.acao) {
      case "cat-subir": [cats[ci - 1], cats[ci]] = [cats[ci], cats[ci - 1]]; break;
      case "cat-descer": [cats[ci + 1], cats[ci]] = [cats[ci], cats[ci + 1]]; break;
      case "cat-remover":
        if (!confirm(`Remover a categoria "${c.nome}" e todos os seus jogadores?`)) return;
        cats.splice(ci, 1); break;
      case "j-subir": [c.jogadores[ji - 1], c.jogadores[ji]] = [c.jogadores[ji], c.jogadores[ji - 1]]; break;
      case "j-descer": [c.jogadores[ji + 1], c.jogadores[ji]] = [c.jogadores[ji], c.jogadores[ji + 1]]; break;
      case "j-remover": c.jogadores.splice(ji, 1); break;
      case "j-add": adicionarJogador(ci); return;
      case "numerar": c.jogadores.forEach((j, i) => { j.pos = i + 1; }); break;
      case "colar":
        colarAlvo = ci;
        $("#colar-texto").value = "";
        $("#dlg-colar").returnValue = "";
        $("#dlg-colar").showModal();
        return;
    }
    renderRanking();
    atualizarStatus();
  });

  $("#dlg-colar").addEventListener("close", () => {
    if ($("#dlg-colar").returnValue !== "ok" || colarAlvo === null) return;
    const linhas = $("#colar-texto").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) return;
    const jogadores = linhas.map((l, i) => {
      let pontos = "";
      const partes = l.split(/\t|;/);
      if (partes.length > 1) { pontos = partes.pop().trim(); l = partes.join(" ").trim(); }
      const m = l.match(/^(\d{1,3})\s*(?:º|ª|°)?\s*[-–—.)]*\s*(.+)$/);
      return m ? { pos: +m[1], nome: m[2].trim(), pontos } : { pos: i + 1, nome: l, pontos };
    });
    st.ranking.categorias[colarAlvo].jogadores = jogadores;
    colarAlvo = null;
    renderRanking();
    atualizarStatus();
    toast(jogadores.length + " jogadores importados.");
  });

  $("#r-add-cat").addEventListener("click", () => {
    st.ranking.categorias.push({ nome: "Nova categoria", jogadores: [] });
    renderRanking();
    const inp = document.querySelector(`.cat[data-ci="${st.ranking.categorias.length - 1}"] [data-campo="cat-nome"]`);
    inp.focus();
    inp.select();
    atualizarStatus();
  });

  /* =========================================================
     ANIVERSARIANTES
     ========================================================= */
  function msgPadrao(nome) {
    const primeiro = String(nome).trim().split(/\s+/)[0] || "";
    return `Parabéns, ${primeiro}! Muita saúde, alegria e ótimos jogos. Feliz aniversário!`;
  }

  function renderAniv() {
    const a = st.aniv;
    $("#a-mes").value = a.mes;
    $("#a-ano").value = a.ano;
    const lista = a.aniversariantes;
    if (!lista.length) {
      $("#a-lista").innerHTML = '<p class="muted">Nenhum aniversariante cadastrado. Clique em "Adicionar aniversariante".</p>';
      return;
    }
    $("#a-lista").innerHTML = lista.map((p, i) => {
      const src = p._novaFoto ? p._novaFoto.dataUrl : (previas[p.foto] || p.foto);
      return `
      <div class="bcard" data-i="${i}">
        <div class="bcard-photo">
          ${src ? `<img src="${esc(src)}" alt="">` : '<span class="sem-foto">Sem foto</span>'}
          ${p._novaFoto ? '<span class="badge-novo">Nova foto</span>' : ""}
          <div class="foto-acoes">
            <label>${src ? "Trocar foto" : "Adicionar foto"}<input type="file" accept="image/*" data-campo="foto"></label>
            ${src ? '<button data-acao="remover-foto">Remover</button>' : ""}
          </div>
        </div>
        <div class="bcard-body">
          <div class="bcard-row">
            <label class="field"><span>Nome</span><input data-campo="nome" value="${esc(p.nome)}" placeholder="Nome completo"></label>
            <label class="field"><span>Dia</span><input data-campo="dia" type="number" min="1" max="31" value="${esc(p.dia)}"></label>
          </div>
          <label class="field"><span>Mensagem</span><textarea data-campo="mensagem" rows="3">${esc(p.mensagem)}</textarea></label>
          <div class="bcard-foot">
            <button class="link" data-acao="msg-padrao">Usar mensagem padrão</button>
            <button class="icon-btn danger" data-acao="remover" title="Remover aniversariante">${ICO.x}</button>
          </div>
        </div>
      </div>`;
    }).join("");
  }

  $("#a-mes").addEventListener("change", (e) => { st.aniv.mes = +e.target.value; atualizarStatus(); });
  $("#a-ano").addEventListener("input", (e) => { st.aniv.ano = +e.target.value; atualizarStatus(); });

  $("#a-lista").addEventListener("input", (e) => {
    const campo = e.target.dataset.campo;
    if (!campo || campo === "foto") return;
    const p = st.aniv.aniversariantes[+e.target.closest(".bcard").dataset.i];
    p[campo] = campo === "dia" ? (parseInt(e.target.value, 10) || "") : e.target.value;
    atualizarStatus();
  });

  $("#a-lista").addEventListener("change", async (e) => {
    if (e.target.dataset.campo !== "foto" || !e.target.files[0]) return;
    const p = st.aniv.aniversariantes[+e.target.closest(".bcard").dataset.i];
    try {
      p._novaFoto = await reduzirImagem(e.target.files[0]);
      renderAniv();
      atualizarStatus();
    } catch (err) {
      toast("Não foi possível ler esta imagem.", true);
    }
  });

  $("#a-lista").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-acao]");
    if (!btn) return;
    const i = +btn.closest(".bcard").dataset.i;
    const lista = st.aniv.aniversariantes;
    const p = lista[i];
    switch (btn.dataset.acao) {
      case "remover":
        if (!confirm(`Remover ${p.nome || "este aniversariante"}?`)) return;
        lista.splice(i, 1); break;
      case "remover-foto": p.foto = ""; delete p._novaFoto; break;
      case "msg-padrao": p.mensagem = msgPadrao(p.nome); break;
    }
    renderAniv();
    atualizarStatus();
  });

  $("#a-add").addEventListener("click", () => {
    st.aniv.aniversariantes.push({ nome: "", dia: "", foto: "", mensagem: "" });
    renderAniv();
    const cards = document.querySelectorAll(".bcard");
    cards[cards.length - 1].querySelector('[data-campo="nome"]').focus();
    atualizarStatus();
  });

  $("#a-novo-mes").addEventListener("click", () => {
    const hoje = new Date();
    if (st.aniv.aniversariantes.length &&
      !confirm(`Isto limpa a lista atual e começa ${MESES[hoje.getMonth()]} ${hoje.getFullYear()}. Continuar?`)) return;
    st.aniv.mes = hoje.getMonth() + 1;
    st.aniv.ano = hoje.getFullYear();
    st.aniv.aniversariantes = [];
    renderAniv();
    atualizarStatus();
  });

  function reduzirImagem(arquivo, max = 1200) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * escala);
        const h = Math.round(img.naturalHeight * escala);
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const dataUrl = cv.toDataURL("image/jpeg", 0.85);
        resolve({ dataUrl, base64: dataUrl.split(",")[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagem inválida")); };
      img.src = url;
    });
  }


  /* =========================================================
     SALVAR / DESCARTAR
     ========================================================= */
  function validar() {
    for (const c of st.ranking.categorias) {
      if (!c.nome.trim()) return "Há uma categoria do ranking sem nome.";
      for (const j of c.jogadores) {
        if (j.nome.trim() && !(parseInt(j.pos, 10) > 0)) return `Defina a posição de "${j.nome}" em ${c.nome}.`;
      }
    }
    if (!(st.ranking.ano > 1999)) return "Ano do ranking inválido.";
    if (!(st.aniv.ano > 1999)) return "Ano dos aniversariantes inválido.";
    for (const p of st.aniv.aniversariantes) {
      if (!p.nome.trim() && (p.foto || p._novaFoto || p.mensagem)) return "Há um aniversariante sem nome.";
      const d = parseInt(p.dia, 10);
      if (p.nome.trim() && !(d >= 1 && d <= 31)) return `Informe um dia válido para ${p.nome}.`;
    }
    return "";
  }

  $("#salvar").addEventListener("click", async () => {
    const erro = validar();
    if (erro) { toast(erro, true); return; }
    const btn = $("#salvar");
    btn.disabled = true;
    $("#descartar").disabled = true;
    btn.textContent = "Salvando…";
    const status = $("#status");
    status.className = "status";
    try {
      if (rankingSujo()) {
        status.textContent = "Salvando ranking…";
        const r = await api("salvar", { ranking: JSON.parse(serialRanking(st.ranking)) });
        st.ranking = r.ranking;
        st.rankingOrig = serialRanking(st.ranking);
        renderRanking();
      }
      if (anivSujo()) {
        const a = st.aniv;
        const comFoto = a.aniversariantes.filter((p) => p._novaFoto && p.nome.trim());
        for (let k = 0; k < comFoto.length; k++) {
          const p = comFoto[k];
          status.textContent = `Enviando foto ${k + 1} de ${comFoto.length}…`;
          const { caminho } = await api("foto", { nome: p.nome, ano: a.ano, mes: a.mes, imagem: p._novaFoto.base64 });
          previas[caminho] = p._novaFoto.dataUrl;
          p.foto = caminho;
          delete p._novaFoto;
        }
        a.aniversariantes.forEach((p) => { delete p._novaFoto; });
        status.textContent = "Salvando aniversariantes…";
        const r = await api("salvar", { aniversarios: JSON.parse(serialAniv(a)) });
        // usa a versão gravada (já em ordem de dia)
        st.aniv = r.aniversarios;
        st.anivOrig = serialAniv(st.aniv);
        renderAniv();
      }
      status.textContent = "Salvo! O site já está atualizado.";
      status.className = "status ok";
      toast("Alterações salvas com sucesso.");
    } catch (err) {
      status.className = "status sujo";
      status.textContent = "Falha ao salvar.";
      toast(err.message, true);
    } finally {
      btn.textContent = "Salvar e publicar";
      atualizarStatus();
    }
  });

  $("#descartar").addEventListener("click", async () => {
    if (!confirm("Descartar todas as alterações não salvas?")) return;
    try {
      await carregarDados();
      toast("Alterações descartadas.");
    } catch (err) {
      toast("Erro ao recarregar: " + err.message, true);
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (rankingSujo() || anivSujo()) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- início ---------- */
  (async function iniciar() {
    try {
      const sessao = await api("sessao");
      if (sessao.usuario) { await abrirPainel(sessao); return; }
      $("#tela-login").hidden = false;
      $("#login-usuario").focus();
    } catch (err) {
      $("#tela-login").hidden = false;
      $("#login-erro").textContent = err.message;
    }
  })();
})();
