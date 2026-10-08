/* MStee — área do administrador
 *
 * O site é estático (GitHub Pages). Este painel lê e grava os arquivos
 * data/ranking.json, data/aniversarios.json e as fotos dos aniversariantes
 * diretamente no repositório, usando a API do GitHub com o token do
 * administrador. Cada "Salvar e publicar" vira um commit; o GitHub Pages
 * republica o site em cerca de 1 minuto.
 */
(function () {
  "use strict";

  /* ---------- configuração ---------- */
  const REPO = { owner: "felgoulart", repo: "mstee", branch: "main" };
  const ARQ_RANKING = "data/ranking.json";
  const ARQ_ANIV = "data/aniversarios.json";
  const PASTA_FOTOS = "assets/img/aniversarios";
  const CHAVE_TOKEN = "mstee_admin_token";

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const $ = (s, el = document) => el.querySelector(s);

  /* ---------- estado ---------- */
  let token = "";
  const st = {
    ranking: null, rankingSha: null, rankingOrig: "",
    aniv: null, anivSha: null, anivOrig: "",
  };
  const previas = {}; // caminho da foto -> dataURL (para exibir antes do site republicar)

  /* ---------- armazenamento do token ---------- */
  function lerToken() {
    try { return localStorage.getItem(CHAVE_TOKEN) || sessionStorage.getItem(CHAVE_TOKEN) || ""; }
    catch (e) { return ""; }
  }
  function gravarToken(t, lembrar) {
    try {
      (lembrar ? localStorage : sessionStorage).setItem(CHAVE_TOKEN, t);
    } catch (e) { /* navegador sem armazenamento: o token vale só nesta aba */ }
  }
  function apagarToken() {
    try { localStorage.removeItem(CHAVE_TOKEN); sessionStorage.removeItem(CHAVE_TOKEN); } catch (e) { }
  }

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function slug(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "foto";
  }
  function utf8ParaB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function b64ParaUtf8(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
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

  /* ---------- API do GitHub ---------- */
  async function gh(caminho, opts = {}) {
    const r = await fetch("https://api.github.com" + caminho, {
      ...opts,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!r.ok) {
      let msg = "";
      try { msg = (await r.json()).message || ""; } catch (e) { }
      const err = new Error(msg || "Erro " + r.status);
      err.status = r.status;
      throw err;
    }
    return r.status === 204 ? null : r.json();
  }
  const repoPath = (p) => `/repos/${REPO.owner}/${REPO.repo}/contents/${p.split("/").map(encodeURIComponent).join("/")}`;

  async function lerArquivo(caminho) {
    const d = await gh(repoPath(caminho) + "?ref=" + REPO.branch + "&t=" + Date.now());
    return { sha: d.sha, texto: b64ParaUtf8(d.content) };
  }
  async function gravarArquivo(caminho, conteudoB64, mensagem, sha) {
    const body = { message: mensagem, content: conteudoB64, branch: REPO.branch };
    if (sha) body.sha = sha;
    const d = await gh(repoPath(caminho), { method: "PUT", body: JSON.stringify(body) });
    return d.content.sha;
  }

  /* ---------- serialização ---------- */
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
    }, null, 2) + "\n";
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
    }, null, 2) + "\n";
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
      el.textContent = "Alterações não publicadas em: " + partes.join(" e ") + ".";
      el.className = "status sujo";
    } else if (!el.classList.contains("ok")) {
      el.textContent = "Nenhuma alteração.";
      el.className = "status";
    }
    $("#salvar").disabled = !partes.length;
    $("#descartar").disabled = !partes.length;
  }

  /* ---------- login ---------- */
  async function entrar(t) {
    token = t;
    const usuario = await gh("/user");
    await gh(`/repos/${REPO.owner}/${REPO.repo}`); // confirma acesso ao repositório
    await carregarDados();
    $("#usuario").textContent = usuario.login;
    $("#tela-login").hidden = true;
    $("#tela-painel").hidden = false;
  }

  async function carregarDados() {
    const [r, a] = await Promise.all([lerArquivo(ARQ_RANKING), lerArquivo(ARQ_ANIV)]);
    st.ranking = JSON.parse(r.texto);
    st.rankingSha = r.sha;
    st.rankingOrig = serialRanking(st.ranking);
    st.aniv = JSON.parse(a.texto);
    st.anivSha = a.sha;
    st.anivOrig = serialAniv(st.aniv);
    renderRanking();
    renderAniv();
    atualizarStatus();
  }

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = $("#token").value.trim();
    const btn = e.submitter || $("#form-login button");
    $("#login-erro").textContent = "";
    btn.disabled = true;
    btn.textContent = "Entrando…";
    try {
      await entrar(t);
      gravarToken(t, $("#lembrar").checked);
    } catch (err) {
      token = "";
      $("#login-erro").textContent =
        err.status === 401 ? "Chave inválida ou expirada." :
        err.status === 404 || err.status === 403 ? "Esta chave não tem acesso ao repositório do site." :
        "Não foi possível entrar: " + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  });

  $("#sair").addEventListener("click", () => {
    if ((rankingSujo() || anivSujo()) && !confirm("Há alterações não publicadas. Sair mesmo assim?")) return;
    apagarToken();
    location.reload();
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
          <button class="icon-btn" data-acao="cat-subir" title="Mover categoria para cima" ${ci === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-btn" data-acao="cat-descer" title="Mover categoria para baixo" ${ci === r.categorias.length - 1 ? "disabled" : ""}>↓</button>
          <button class="icon-btn danger" data-acao="cat-remover" title="Remover categoria">✕</button>
        </div>
        <div class="cat-body">
          ${c.jogadores.length ? `<div class="rows-head"><span>Pos.</span><span>Nome</span><span>Pontos</span><span></span></div>` :
            `<p class="cat-empty">Nenhum jogador nesta categoria.</p>`}
          ${c.jogadores.map((j, ji) => `
            <div class="row" data-ji="${ji}">
              <input class="inp pos" data-campo="pos" type="number" min="1" value="${esc(j.pos)}" aria-label="Posição">
              <input class="inp" data-campo="nome" value="${esc(j.nome)}" placeholder="Nome do jogador" aria-label="Nome">
              <input class="inp pts" data-campo="pontos" value="${esc(j.pontos ?? "")}" placeholder="—" aria-label="Pontos (opcional)">
              <div class="row-actions">
                <button class="icon-btn" data-acao="j-subir" title="Subir" ${ji === 0 ? "disabled" : ""}>↑</button>
                <button class="icon-btn" data-acao="j-descer" title="Descer" ${ji === c.jogadores.length - 1 ? "disabled" : ""}>↓</button>
                <button class="icon-btn danger" data-acao="j-remover" title="Remover jogador">✕</button>
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
            <button class="icon-btn danger" data-acao="remover" title="Remover aniversariante">✕</button>
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
    btn.textContent = "Publicando…";
    const status = $("#status");
    status.className = "status";
    try {
      if (rankingSujo()) {
        status.textContent = "Publicando ranking…";
        const texto = serialRanking(st.ranking);
        const r = st.ranking;
        st.rankingSha = await gravarArquivo(ARQ_RANKING, utf8ParaB64(texto),
          `Atualiza ranking ${MESES[r.mes - 1]}/${r.ano}`, st.rankingSha);
        st.rankingOrig = texto;
      }
      if (anivSujo()) {
        const a = st.aniv;
        const comFoto = a.aniversariantes.filter((p) => p._novaFoto && p.nome.trim());
        for (let k = 0; k < comFoto.length; k++) {
          const p = comFoto[k];
          status.textContent = `Enviando foto ${k + 1} de ${comFoto.length}…`;
          const caminho = `${PASTA_FOTOS}/${a.ano}-${String(a.mes).padStart(2, "0")}-${slug(p.nome)}-${Date.now().toString(36)}.jpg`;
          await gravarArquivo(caminho, p._novaFoto.base64, `Foto de aniversário: ${p.nome.trim()}`);
          previas[caminho] = p._novaFoto.dataUrl;
          p.foto = caminho;
          delete p._novaFoto;
        }
        a.aniversariantes.forEach((p) => { delete p._novaFoto; });
        status.textContent = "Publicando aniversariantes…";
        const texto = serialAniv(a);
        st.anivSha = await gravarArquivo(ARQ_ANIV, utf8ParaB64(texto),
          `Atualiza aniversariantes ${MESES[a.mes - 1]}/${a.ano}`, st.anivSha);
        st.anivOrig = texto;
        // mantém a lista na mesma ordem em que foi publicada
        st.aniv = JSON.parse(texto);
        renderAniv();
      }
      status.textContent = "Publicado! O site é atualizado em cerca de 1 minuto.";
      status.className = "status ok";
      toast("Alterações publicadas com sucesso.");
    } catch (err) {
      status.className = "status sujo";
      status.textContent = "Falha ao publicar.";
      if (err.status === 409 || err.status === 422) {
        toast("O arquivo foi alterado em outro lugar. Recarregue a página e refaça a alteração.", true);
      } else if (err.status === 401) {
        toast("Sua chave de acesso expirou. Saia e entre novamente.", true);
      } else if (err.status === 403 || err.status === 404) {
        toast("A chave não tem permissão de escrita (Contents: Read and write).", true);
      } else {
        toast("Erro ao publicar: " + err.message, true);
      }
    } finally {
      btn.textContent = "Salvar e publicar";
      atualizarStatus();
    }
  });

  $("#descartar").addEventListener("click", async () => {
    if (!confirm("Descartar todas as alterações não publicadas?")) return;
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
    const salvo = lerToken();
    if (salvo) {
      try { await entrar(salvo); return; }
      catch (e) { apagarToken(); token = ""; }
    }
    $("#tela-login").hidden = false;
    $("#token").focus();
  })();
})();
