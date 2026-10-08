# MStee Aulas de Tênis — site

Site estático da MStee Aulas de Tênis (Rio de Janeiro). Pode ser hospedado em qualquer servidor de arquivos estáticos.

- `index.html` — página inicial (programas, coordenação, prévia do ranking e aniversariantes, unidades, contato)
- `ranking.html` — ranking completo por categoria, com busca
- `aniversarios.html` — aniversariantes do mês
- `admin.html` — área do administrador
- `data/ranking.json` e `data/aniversarios.json` — dados exibidos no site

## Área do administrador

Acesse `/admin.html` (há um link no rodapé). O painel edita o ranking e os aniversariantes
e, ao clicar em **Salvar e publicar**, grava os arquivos direto neste repositório.
Para as alterações aparecerem no site, a hospedagem precisa servir a versão mais recente deste repositório.

### Chave de acesso

O login usa um *fine-grained personal access token* do GitHub, criado uma única vez:

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   (link direto: https://github.com/settings/personal-access-tokens/new)
2. **Repository access:** *Only select repositories* → `felgoulart/mstee`
3. **Permissions → Repository permissions → Contents:** *Read and write*
4. Gere o token e cole na tela de login do painel.

Para dar acesso a outra pessoa sem compartilhar a conta, adicione-a como colaboradora do repositório
(Settings → Collaborators) e ela cria o próprio token com os mesmos passos.
Para revogar, apague o token em Settings → Fine-grained tokens.

### O que dá para fazer

**Ranking:** mudar mês/ano; criar, renomear, reordenar e remover categorias; adicionar, mover e
remover jogadores; pontos opcionais (a coluna só aparece no site se alguma linha tiver pontos);
"Numerar em ordem" (1, 2, 3…); "Colar lista" para importar uma lista inteira (`01- Nome`, um por linha).
Posições repetidas indicam empate.

**Aniversariantes:** mudar mês/ano; "Começar novo mês" limpa a lista; adicionar nome, dia, foto e
mensagem. As fotos são reduzidas para no máximo 1200 px antes do envio e salvas em
`assets/img/aniversarios/`.

## Desenvolvimento local

```sh
python -m http.server 8000
```

Abra http://localhost:8000. O painel de administração funciona localmente também, mas grava
sempre no repositório do GitHub. Repositório e branch ficam no topo de `assets/js/admin.js`.
