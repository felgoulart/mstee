<?php
/*
 * MStee — API da área do administrador (PHP 7.4 ou superior).
 *
 * Faz o login com usuário e senha e grava, no próprio servidor:
 *   data/ranking.js, data/aniversarios.js e as fotos em assets/img/aniversarios/.
 * Usuários e senhas (com hash) ficam em privado/usuarios.php. Na primeira
 * execução o arquivo é criado com o usuário inicial abaixo.
 */
declare(strict_types=1);

const USUARIO_INICIAL = 'mauro';
const SENHA_INICIAL = 'mstee';
const SENHA_MIN = 8;
const MAX_TENTATIVAS = 5;          // erros de senha seguidos por IP...
const BLOQUEIO_SEGUNDOS = 900;     // ...bloqueiam o login por 15 minutos
const MAX_FOTO_BYTES = 6 * 1024 * 1024;

const PASTA_PRIVADA = __DIR__ . '/privado';
const ARQ_USUARIOS = PASTA_PRIVADA . '/usuarios.php';
const ARQ_TENTATIVAS = PASTA_PRIVADA . '/tentativas.php';
const ARQ_RANKING = __DIR__ . '/data/ranking.js';
const ARQ_ANIV = __DIR__ . '/data/aniversarios.js';
const PASTA_FOTOS = 'assets/img/aniversarios';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('mstee_admin');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

/* ---------- respostas ---------- */
function responder(array $dados, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}
function erro(string $mensagem, int $status = 400): void
{
    responder(['erro' => $mensagem], $status);
}

/* ---------- arquivos ---------- */
function escreverAtomico(string $arquivo, string $conteudo): void
{
    $pasta = dirname($arquivo);
    if (!is_dir($pasta) && !mkdir($pasta, 0755, true)) {
        erro('Não foi possível criar a pasta ' . basename($pasta) . '. Verifique as permissões na hospedagem.', 500);
    }
    $tmp = $arquivo . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $conteudo, LOCK_EX) === false || !rename($tmp, $arquivo)) {
        @unlink($tmp);
        erro('Não foi possível gravar ' . basename($arquivo) . '. Verifique as permissões na hospedagem.', 500);
    }
}

// Arquivos privados: começam com um bloco PHP que encerra a execução, então
// mesmo que alguém abra a URL no navegador, nada do conteúdo é exibido.
const CABECALHO_PRIVADO = "<?php http_response_code(404); exit; ?>\n";

function lerPrivado(string $arquivo): ?array
{
    if (!is_file($arquivo)) {
        return null;
    }
    $texto = (string) file_get_contents($arquivo);
    $dados = json_decode(substr($texto, strlen(CABECALHO_PRIVADO)), true);
    return is_array($dados) ? $dados : null;
}
function gravarPrivado(string $arquivo, array $dados): void
{
    escreverAtomico($arquivo, CABECALHO_PRIVADO . json_encode($dados, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

// data/*.js: "window.VAR = {...};" (assim o site funciona até aberto do disco)
function lerDadosJs(string $arquivo): array
{
    $texto = is_file($arquivo) ? (string) file_get_contents($arquivo) : '';
    $ini = strpos($texto, '{');
    $fim = strrpos($texto, '}');
    $dados = ($ini !== false && $fim !== false) ? json_decode(substr($texto, $ini, $fim - $ini + 1), true) : null;
    if (!is_array($dados)) {
        erro('O arquivo ' . basename($arquivo) . ' está ilegível no servidor.', 500);
    }
    return $dados;
}
function gravarDadosJs(string $arquivo, string $variavel, array $dados): void
{
    $json = json_encode($dados, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    escreverAtomico($arquivo, "/* Dados do site. Editado pela área do administrador (admin.html). */\n"
        . "window.$variavel = $json;\n");
}

/* ---------- usuários ---------- */
function normUsuario($u): string
{
    return mb_strtolower(trim((string) $u), 'UTF-8');
}
function usuarios(): array
{
    $lista = lerPrivado(ARQ_USUARIOS);
    if ($lista === null) {
        $lista = [USUARIO_INICIAL => ['hash' => password_hash(SENHA_INICIAL, PASSWORD_DEFAULT), 'inicial' => true]];
        gravarPrivado(ARQ_USUARIOS, $lista);
    }
    return $lista;
}
function usuarioLogado(): ?string
{
    $u = $_SESSION['usuario'] ?? null;
    return ($u !== null && isset(usuarios()[$u])) ? $u : null;
}
function exigirLogin(): string
{
    $u = usuarioLogado();
    if ($u === null) {
        erro('Sua sessão expirou. Entre novamente.', 401);
    }
    return $u;
}

/* ---------- limite de tentativas ---------- */
function ipCliente(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'desconhecido');
}
function tentativas(): array
{
    $t = lerPrivado(ARQ_TENTATIVAS) ?? [];
    $agora = time();
    return array_filter($t, function ($r) use ($agora) {
        return ($r['ate'] ?? 0) > $agora || ($r['ultima'] ?? 0) > $agora - BLOQUEIO_SEGUNDOS;
    });
}
function verificarBloqueio(): void
{
    $r = tentativas()[ipCliente()] ?? null;
    if ($r && ($r['ate'] ?? 0) > time()) {
        $min = (int) ceil(($r['ate'] - time()) / 60);
        erro("Muitas tentativas erradas. Tente novamente em $min minuto(s).", 429);
    }
}
function registrarFalha(): void
{
    $t = tentativas();
    $ip = ipCliente();
    $n = ($t[$ip]['n'] ?? 0) + 1;
    $t[$ip] = ['n' => $n, 'ultima' => time(), 'ate' => $n >= MAX_TENTATIVAS ? time() + BLOQUEIO_SEGUNDOS : 0];
    gravarPrivado(ARQ_TENTATIVAS, $t);
}
function limparFalhas(): void
{
    $t = tentativas();
    if (isset($t[ipCliente()])) {
        unset($t[ipCliente()]);
        gravarPrivado(ARQ_TENTATIVAS, $t);
    }
}

/* ---------- validação dos dados ---------- */
function texto($v, int $max): string
{
    $s = trim(preg_replace('/\s+/u', ' ', (string) $v) ?? '');
    return mb_substr($s, 0, $max, 'UTF-8');
}
function inteiro($v, int $min, int $max): int
{
    $n = filter_var($v, FILTER_VALIDATE_INT);
    if ($n === false || $n < $min || $n > $max) {
        erro("Valor fora do permitido ($min a $max).");
    }
    return $n;
}
function validarRanking($r): array
{
    if (!is_array($r) || !is_array($r['categorias'] ?? null)) {
        erro('Ranking inválido.');
    }
    $categorias = [];
    foreach (array_slice($r['categorias'], 0, 30) as $c) {
        $nome = texto($c['nome'] ?? '', 80);
        if ($nome === '') {
            erro('Há uma categoria do ranking sem nome.');
        }
        $jogadores = [];
        foreach (array_slice((array) ($c['jogadores'] ?? []), 0, 300) as $j) {
            $jn = texto($j['nome'] ?? '', 120);
            if ($jn === '') {
                continue;
            }
            $item = ['pos' => inteiro($j['pos'] ?? 0, 1, 999), 'nome' => $jn];
            if (isset($j['pontos']) && $j['pontos'] !== '') {
                $item['pontos'] = is_numeric($j['pontos']) ? $j['pontos'] + 0 : texto($j['pontos'], 20);
            }
            $jogadores[] = $item;
        }
        $categorias[] = ['nome' => $nome, 'jogadores' => $jogadores];
    }
    return [
        'mes' => inteiro($r['mes'] ?? 0, 1, 12),
        'ano' => inteiro($r['ano'] ?? 0, 2000, 2100),
        'categorias' => $categorias,
    ];
}
function validarAniversarios($a): array
{
    if (!is_array($a) || !is_array($a['aniversariantes'] ?? null)) {
        erro('Lista de aniversariantes inválida.');
    }
    $lista = [];
    foreach (array_slice($a['aniversariantes'], 0, 200) as $p) {
        $nome = texto($p['nome'] ?? '', 120);
        if ($nome === '') {
            continue;
        }
        $foto = (string) ($p['foto'] ?? '');
        if ($foto !== '' && !preg_match('#^' . PASTA_FOTOS . '/[a-z0-9-]+\.jpe?g$#', $foto)) {
            $foto = '';
        }
        $lista[] = [
            'nome' => $nome,
            'dia' => inteiro($p['dia'] ?? 0, 1, 31),
            'foto' => $foto,
            'mensagem' => mb_substr(trim((string) ($p['mensagem'] ?? '')), 0, 1500, 'UTF-8'),
        ];
    }
    usort($lista, function ($x, $y) {
        return $x['dia'] <=> $y['dia'];
    });
    return [
        'mes' => inteiro($a['mes'] ?? 0, 1, 12),
        'ano' => inteiro($a['ano'] ?? 0, 2000, 2100),
        'aniversariantes' => $lista,
    ];
}
function slug(string $s): string
{
    $s = mb_strtolower($s, 'UTF-8');
    $s = strtr($s, [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'ê' => 'e', 'è' => 'e', 'ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n',
    ]);
    $s = trim((string) preg_replace('/[^a-z0-9]+/', '-', $s), '-');
    return substr($s, 0, 50) ?: 'foto';
}

/* ---------- requisição ---------- */
$acao = (string) ($_GET['acao'] ?? '');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($metodo === 'POST') {
    // Exige um cabeçalho próprio: navegadores não deixam outro site enviá-lo sem permissão (CSRF).
    if (($_SERVER['HTTP_X_MSTEE'] ?? '') !== '1') {
        erro('Requisição recusada.', 403);
    }
    $entrada = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($entrada)) {
        $entrada = [];
    }
}

switch ($metodo . ' ' . $acao) {
    case 'GET sessao':
        $u = usuarioLogado();
        responder(['usuario' => $u, 'inicial' => $u ? !empty(usuarios()[$u]['inicial']) : false]);

    case 'POST login':
        verificarBloqueio();
        $u = normUsuario($entrada['usuario'] ?? '');
        $senha = (string) ($entrada['senha'] ?? '');
        $lista = usuarios();
        if (!isset($lista[$u]) || !password_verify($senha, $lista[$u]['hash'])) {
            registrarFalha();
            erro('Usuário ou senha incorretos.', 401);
        }
        limparFalhas();
        if (password_needs_rehash($lista[$u]['hash'], PASSWORD_DEFAULT)) {
            $lista[$u]['hash'] = password_hash($senha, PASSWORD_DEFAULT);
            gravarPrivado(ARQ_USUARIOS, $lista);
        }
        session_regenerate_id(true);
        $_SESSION['usuario'] = $u;
        responder(['usuario' => $u, 'inicial' => !empty($lista[$u]['inicial'])]);

    case 'POST sair':
        $_SESSION = [];
        session_destroy();
        responder(['ok' => true]);

    case 'GET dados':
        exigirLogin();
        responder(['ranking' => lerDadosJs(ARQ_RANKING), 'aniversarios' => lerDadosJs(ARQ_ANIV)]);

    case 'POST salvar':
        exigirLogin();
        if (!isset($entrada['ranking']) && !isset($entrada['aniversarios'])) {
            erro('Nada para salvar.');
        }
        $resposta = [];
        if (isset($entrada['ranking'])) {
            $resposta['ranking'] = validarRanking($entrada['ranking']);
            gravarDadosJs(ARQ_RANKING, 'MSTEE_RANKING', $resposta['ranking']);
        }
        if (isset($entrada['aniversarios'])) {
            $resposta['aniversarios'] = validarAniversarios($entrada['aniversarios']);
            gravarDadosJs(ARQ_ANIV, 'MSTEE_ANIVERSARIOS', $resposta['aniversarios']);
        }
        responder($resposta);

    case 'POST foto':
        exigirLogin();
        $bin = base64_decode((string) ($entrada['imagem'] ?? ''), true);
        if ($bin === false || strlen($bin) === 0 || strlen($bin) > MAX_FOTO_BYTES) {
            erro('Foto inválida ou grande demais.');
        }
        $info = @getimagesizefromstring($bin);
        if (!$info || $info[2] !== IMAGETYPE_JPEG) {
            erro('A foto precisa estar em JPEG.');
        }
        // Regrava a imagem com o GD (quando disponível) para descartar qualquer conteúdo estranho.
        if (function_exists('imagecreatefromstring')) {
            $img = @imagecreatefromstring($bin);
            if (!$img) {
                erro('Não foi possível ler a foto.');
            }
            ob_start();
            imagejpeg($img, null, 85);
            $bin = (string) ob_get_clean();
            imagedestroy($img);
        }
        $ano = inteiro($entrada['ano'] ?? 0, 2000, 2100);
        $mes = inteiro($entrada['mes'] ?? 0, 1, 12);
        $nomeArq = sprintf('%d-%02d-%s-%s.jpg', $ano, $mes, slug((string) ($entrada['nome'] ?? '')), bin2hex(random_bytes(3)));
        escreverAtomico(__DIR__ . '/' . PASTA_FOTOS . '/' . $nomeArq, $bin);
        responder(['caminho' => PASTA_FOTOS . '/' . $nomeArq]);

    case 'POST senha':
        $atual = exigirLogin();
        $lista = usuarios();
        if (!password_verify((string) ($entrada['senhaAtual'] ?? ''), $lista[$atual]['hash'])) {
            erro('A senha atual está incorreta.');
        }
        $novo = normUsuario($entrada['usuario'] ?? '');
        $senha = (string) ($entrada['novaSenha'] ?? '');
        if ($novo === '' || !preg_match('/^[\p{L}0-9._-]{2,40}$/u', $novo)) {
            erro('Usuário inválido (use letras, números, ponto, hífen ou sublinhado).');
        }
        if (mb_strlen($senha, 'UTF-8') < SENHA_MIN) {
            erro('A nova senha precisa ter pelo menos ' . SENHA_MIN . ' caracteres.');
        }
        if ($novo !== $atual && isset($lista[$novo])) {
            erro('Já existe um usuário com esse nome.');
        }
        unset($lista[$atual]);
        $lista[$novo] = ['hash' => password_hash($senha, PASSWORD_DEFAULT), 'inicial' => false];
        gravarPrivado(ARQ_USUARIOS, $lista);
        $_SESSION['usuario'] = $novo;
        responder(['usuario' => $novo, 'inicial' => false]);

    default:
        erro('Ação desconhecida.', 404);
}
