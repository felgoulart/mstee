/* MStee — scripts do site público */
(function () {
  "use strict";

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  /* ---------- menu mobile ---------- */
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open);
    });
    nav.addEventListener("click", (e) => {
      if (e.target.tagName === "A") nav.classList.remove("open");
    });
  }

  const yearEl = document.getElementById("ano-atual");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function iniciais(nome) {
    const p = String(nome).trim().split(/\s+/);
    return ((p[0] || "")[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "");
  }
  function normalizar(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  async function carregar(arquivo) {
    const r = await fetch(arquivo + "?v=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("Falha ao carregar " + arquivo);
    return r.json();
  }

  /* ---------- aniversariantes ---------- */
  async function renderAniversarios() {
    const alvo = document.querySelector("[data-aniversarios]");
    if (!alvo) return;
    const limite = parseInt(alvo.dataset.limite || "0", 10);
    try {
      const d = await carregar("data/aniversarios.json");
      document.querySelectorAll("[data-aniv-titulo]").forEach((el) => {
        el.textContent = MESES[d.mes - 1] + " " + d.ano;
      });
      let lista = [...(d.aniversariantes || [])].sort((a, b) => a.dia - b.dia);
      if (!lista.length) {
        alvo.innerHTML = '<p class="muted">Nenhum aniversariante cadastrado para este mês.</p>';
        return;
      }
      if (limite) lista = lista.slice(0, limite);
      const hoje = new Date();
      const ehMesAtual = hoje.getMonth() + 1 === d.mes && hoje.getFullYear() === d.ano;
      const mesAbrev = MESES[d.mes - 1].slice(0, 3);
      alvo.innerHTML = lista.map((p) => {
        const hojeClass = ehMesAtual && hoje.getDate() === p.dia ? " is-today" : "";
        const foto = p.foto
          ? `<img src="${esc(p.foto)}" alt="${esc(p.nome)}" loading="lazy">`
          : `<div class="no-photo">${esc(iniciais(p.nome))}</div>`;
        return `<article class="bday${hojeClass}">
          <div class="bday-photo">${foto}
            <div class="bday-day"><strong>${pad(p.dia)}</strong><span>${mesAbrev}</span></div>
          </div>
          <div class="bday-body">
            <h3>${esc(p.nome)}</h3>
            ${p.mensagem ? `<p>${esc(p.mensagem)}</p>` : ""}
          </div>
        </article>`;
      }).join("");
    } catch (e) {
      alvo.innerHTML = '<p class="muted">Não foi possível carregar os aniversariantes.</p>';
    }
  }

  /* ---------- ranking: prévia (home) ---------- */
  async function renderRankingPrevia() {
    const alvo = document.querySelector("[data-ranking-previa]");
    if (!alvo) return;
    try {
      const d = await carregar("data/ranking.json");
      document.querySelectorAll("[data-ranking-titulo]").forEach((el) => {
        el.textContent = MESES[d.mes - 1] + " / " + d.ano;
      });
      alvo.innerHTML = d.categorias.map((c) => `
        <div class="rank-mini">
          <h3>${esc(c.nome)}</h3>
          <ol>${c.jogadores.slice(0, 3).map((j) =>
            `<li><b>${pad(j.pos)}</b><span>${esc(j.nome)}</span></li>`).join("")}</ol>
        </div>`).join("");
    } catch (e) {
      alvo.innerHTML = '<p>Não foi possível carregar o ranking.</p>';
    }
  }

  /* ---------- ranking: página completa ---------- */
  async function renderRanking() {
    const alvo = document.querySelector("[data-ranking]");
    if (!alvo) return;
    let dados;
    try {
      dados = await carregar("data/ranking.json");
    } catch (e) {
      alvo.innerHTML = '<p class="muted">Não foi possível carregar o ranking.</p>';
      return;
    }
    document.querySelectorAll("[data-ranking-titulo]").forEach((el) => {
      el.textContent = MESES[dados.mes - 1] + " / " + dados.ano;
    });

    const cats = dados.categorias || [];
    const temPontos = (c) => c.jogadores.some((j) => j.pontos !== undefined && j.pontos !== null && j.pontos !== "");
    let atual = Math.max(0, cats.findIndex((c) => normalizar(c.nome).replace(/\s+/g, "-") === location.hash.slice(1)));
    let busca = "";

    alvo.innerHTML = `
      <div class="rank-tabs" role="tablist">${cats.map((c, i) =>
        `<button class="rank-tab" role="tab" data-i="${i}">${esc(c.nome)}</button>`).join("")}</div>
      <div class="rank-meta">
        <input class="search" type="search" placeholder="Buscar jogador…" aria-label="Buscar jogador">
      </div>
      <div data-podio></div>
      <div data-tabela></div>`;

    const tabs = alvo.querySelectorAll(".rank-tab");
    const podio = alvo.querySelector("[data-podio]");
    const tabela = alvo.querySelector("[data-tabela]");

    function destacar(nome) {
      if (!busca) return esc(nome);
      const n = normalizar(nome);
      const i = n.indexOf(normalizar(busca));
      if (i < 0) return esc(nome);
      return esc(nome.slice(0, i)) + "<mark>" + esc(nome.slice(i, i + busca.length)) + "</mark>" + esc(nome.slice(i + busca.length));
    }

    function pintar() {
      tabs.forEach((t, i) => t.setAttribute("aria-selected", i === atual));
      const c = cats[atual];
      if (!c) { tabela.innerHTML = ""; podio.innerHTML = ""; return; }
      const pts = temPontos(c);
      const lista = busca ? c.jogadores.filter((j) => normalizar(j.nome).includes(normalizar(busca))) : c.jogadores;

      podio.innerHTML = busca ? "" : `<div class="podium">${c.jogadores.slice(0, 3).map((j, i) => `
        <div class="podium-card p${i + 1}">
          <div class="pos">${j.pos}º</div>
          <div class="name">${esc(j.nome)}</div>
          ${pts && j.pontos !== undefined && j.pontos !== "" ? `<div class="pts">${esc(j.pontos)} pts</div>` : ""}
        </div>`).join("")}</div>`;

      if (!lista.length) {
        tabela.innerHTML = '<div class="rank-table"><div class="rank-empty">Nenhum jogador encontrado.</div></div>';
        return;
      }
      tabela.innerHTML = `<table class="rank-table">
        <thead><tr><th>Pos.</th><th>Jogador</th>${pts ? '<th class="pts">Pontos</th>' : ""}</tr></thead>
        <tbody>${lista.map((j) => `<tr>
          <td class="pos">${pad(j.pos)}</td>
          <td>${destacar(j.nome)}</td>
          ${pts ? `<td class="pts">${esc(j.pontos ?? "")}</td>` : ""}
        </tr>`).join("")}</tbody></table>`;
    }

    tabs.forEach((t) => t.addEventListener("click", () => {
      atual = +t.dataset.i;
      history.replaceState(null, "", "#" + normalizar(cats[atual].nome).replace(/\s+/g, "-"));
      pintar();
    }));
    alvo.querySelector(".search").addEventListener("input", (e) => { busca = e.target.value.trim(); pintar(); });
    pintar();
  }

  renderAniversarios();
  renderRankingPrevia();
  renderRanking();
})();
