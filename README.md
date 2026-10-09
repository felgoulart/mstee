# MStee Aulas de Tênis — site

Site estático da MStee Aulas de Tênis (Rio de Janeiro). Pode ser hospedado em qualquer servidor de arquivos estáticos.

- `index.html` — página inicial (programas, coordenação, prévia do ranking e aniversariantes, unidades, contato)
- `ranking.html` — ranking completo por categoria, com busca
- `aniversarios.html` — aniversariantes do mês
- `admin.html` — área do administrador
- `data/ranking.js` e `data/aniversarios.js` — dados exibidos no site (em `.js` para o site funcionar também aberto direto do disco)

## Área do administrador

Acesse `/admin.html` (há um link no rodapé). O painel edita o ranking e os aniversariantes
e, ao clicar em **Salvar e publicar**, grava os arquivos direto neste repositório.
Para as alterações aparecerem no site, a hospedagem precisa servir a versão mais recente deste repositório.

### Login com usuário e senha

O dia a dia é com **usuário e senha**. Senha inicial: usuário `mauro`, senha `mstee`.
Troque a senha no primeiro acesso pelo botão **Alterar senha** (o painel mostra um aviso
enquanto a senha inicial estiver em uso).

Como o site não tem servidor, quem grava no repositório é uma chave do GitHub
(*fine-grained personal access token*). Ela fica em `data/acesso.js` **criptografada**
(AES-GCM, chave derivada da senha com PBKDF2-SHA256, 600 mil iterações): só quem sabe
o usuário e a senha consegue usá-la.

**Primeiro acesso (uma vez) ou quando a chave expirar:** na tela de login, clique em
*Primeiro acesso ou chave expirada*, cole a chave e defina usuário e senha.
Para criar a chave:

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   (link direto: https://github.com/settings/personal-access-tokens/new)
2. **Repository access:** *Only select repositories* → `felgoulart/mstee`
3. **Permissions → Repository permissions → Contents:** *Read and write*
4. Gere o token e cole na tela de primeiro acesso.

Importante:
- `data/acesso.js` fica público junto com o site. Uma senha fraca pode ser descoberta por
  tentativa e erro, liberando a chave. Use uma senha longa e única. A chave só dá acesso a
  este repositório, nunca ao resto da conta.
- Para cortar o acesso, apague o token em Settings → Fine-grained tokens e cadastre um novo.
- O login precisa de HTTPS (ou do site aberto direto do computador); em `http://` simples
  o navegador não libera a criptografia.

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
