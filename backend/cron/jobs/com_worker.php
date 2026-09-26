<?php
// Worker de Comunicaciones: procesa la cola del webhook (mensajes entrantes → conversación, chatbot) y los envíos de campañas.
// Lo corre el cron de dev01 cada minuto y lo despierta el webhook (comDespertarWorker). Solo CLI (Apache niega /cron por HTTP).
// Uno a la vez (GET_LOCK) y en bucle hasta vaciar (~50 s): un aviso que llega con el candado tomado lo ve la vuelta siguiente.
// Deja logs/last_run_com_worker.json (inicio, fin, procesados) para saber si corrió sin leer logs.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require_once __DIR__ . '/../../db_connection.php';
require_once __DIR__ . '/../../_lib/_com_webhook.php';
foreach (['_com_bot.php', '_com_campanas.php'] as $f) if (is_file(__DIR__ . '/../../_lib/' . $f)) require_once __DIR__ . '/../../_lib/' . $f;

// Una validación que falla (authFail) lanza en vez de terminar el proceso: el worker sigue con lo demás.
$GLOBALS['authFailLanza'] = true;
$inicio = microtime(true);
$limite = time() + (int)(getenv('COM_WORKER_SEGUNDOS') ?: 50);
$conn = conectar();
$lock = 'com_worker_' . (getenv('DB_NAME') ?: 'local');
$r = $conn->query("SELECT GET_LOCK('" . $conn->real_escape_string($lock) . "', 0) AS ok");
if (!$r || (int)$r->fetch_assoc()['ok'] !== 1) { $conn->close(); exit(0); }

$totales = ['entrantes' => 0, 'campanas' => 0, 'vueltas' => 0];
do {
    $hecho = 0;
    $n = comProcesarCola($conn, 50);
    $totales['entrantes'] += $n; $hecho += $n;
    if (function_exists('comCampanasProcesar')) {
        $n = comCampanasProcesar($conn, $limite);
        $totales['campanas'] += $n; $hecho += $n;
    }
    $totales['vueltas']++;
    if ($hecho === 0) {
        // Nada pendiente: una espera corta por si llega algo con el candado tomado; luego termina.
        if ($totales['vueltas'] > 1 || time() >= $limite) break;
        usleep(500000);
    }
} while (time() < $limite);

$conn->query("SELECT RELEASE_LOCK('" . $conn->real_escape_string($lock) . "')");
$conn->close();
$dir = is_dir('/var/log/app') && is_writable('/var/log/app') ? '/var/log/app' : sys_get_temp_dir();
@file_put_contents($dir . '/last_run_com_worker.json', json_encode(['inicio' => date('c', (int)$inicio), 'fin' => date('c'),
    'segundos' => round(microtime(true) - $inicio, 2)] + $totales));
if ($totales['entrantes'] + $totales['campanas'] > 0) echo date('c') . ' ' . json_encode($totales) . "\n";
