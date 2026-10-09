# MStee Aulas de Tênis — site

Site da MStee Aulas de Tênis (Rio de Janeiro), feito para hospedagem com PHP (HostGator).

- `index.html` — página inicial (programas, coordenação, prévia do ranking e aniversariantes, unidades, contato)
- `ranking.html` — ranking completo por categoria, com busca
- `aniversarios.html` — aniversariantes do mês
- `admin.html` + `admin-api.php` — área do administrador
- `data/ranking.js` e `data/aniversarios.js` — dados exibidos no site
  (em `.js` para o site funcionar também aberto direto do disco)
- `privado/` — usuários e senhas do painel (criado no servidor; bloqueado para acesso pela web)

## Publicar na HostGator

1. Envie todos os arquivos para `public_html` (Gerenciador de Arquivos do cPanel ou FTP),
   menos `README.md`, `.gitignore` e o PDF do jornalzinho.
2. Confirme que as pastas `data/`, `assets/img/aniversarios/` e `privado/` permitem gravação
   (permissão 755, padrão da HostGator).
3. Ative o SSL (HTTPS) do domínio no cPanel, para a senha não trafegar aberta.
4. Acesse `https://seu-dominio/admin.html`.

**Atenção ao reenviar o site:** depois que o painel estiver em uso, o ranking e os aniversariantes
mais recentes ficam no servidor. Ao subir uma nova versão, **não sobrescreva** `data/`,
`assets/img/aniversarios/` e `privado/`, ou as alterações feitas pelo painel (e as senhas) se perdem.

## Área do administrador

Login com usuário e senha. **Senha inicial: usuário `mauro`, senha `mstee`.**
O painel mostra um aviso enquanto a senha inicial estiver em uso. Troque em **Alterar senha**
(mínimo 8 caracteres).

- As senhas ficam só como hash (`password_hash`) em `privado/usuarios.php`, criado no primeiro acesso.
- 5 senhas erradas seguidas bloqueiam o login daquele endereço por 15 minutos.
- Esqueceu a senha? Apague `privado/usuarios.php` pelo Gerenciador de Arquivos. O acesso volta
  para `mauro` / `mstee`.

### O que dá para fazer

**Ranking:** mudar mês/ano; criar, renomear, reordenar e remover categorias; adicionar, mover e
remover jogadores; pontos opcionais (a coluna só aparece no site se alguma linha tiver pontos);
"Numerar em ordem" (1, 2, 3…); "Colar lista" para importar uma lista inteira (`01- Nome`, um por linha).
Posições repetidas indicam empate.

**Aniversariantes:** mudar mês/ano; "Começar novo mês" limpa a lista; adicionar nome, dia, foto e
mensagem. As fotos são reduzidas para no máximo 1200 px antes do envio e salvas em
`assets/img/aniversarios/`.

Ao clicar em **Salvar e publicar**, o site já fica atualizado.

## Testar no computador

O site abre direto pelo `index.html`. O painel precisa de PHP:

```sh
php -S localhost:8000
```

e abra http://localhost:8000/admin.html.
