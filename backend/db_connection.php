<?php
// Conexión a la BD. Sin secretos: todo llega por variables de entorno del compose.
// Este archivo SE VERSIONA y se despliega con el CI (no hay archivos gitignored con código).

function conectar(): mysqli
{
    // PHP 8.1+ lanza excepciones por defecto; el código de la app chequea retornos.
    mysqli_report(MYSQLI_REPORT_OFF);

    $conn = mysqli_connect(
        getenv('DB_HOST') ?: 'mariadb',
        getenv('DB_USER'),
        getenv('DB_PASSWORD'),
        getenv('DB_NAME'),
        (int)(getenv('DB_PORT') ?: 3306)   // solo cambia en desarrollo local
    );

    if (!$conn) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['action' => false, 'mensaje' => 'Error de conexión a la base de datos']);
        exit;
    }

    $conn->set_charset('utf8mb4');
    // SET NAMES ... COLLATE, no solo collation_connection: con esto último los parámetros de los prepared
    // statements quedan en utf8mb4_general_ci y `? = ''` falla con "Illegal mix of collations".
    $conn->query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
    return $conn;
}

/** execute() que corta con JSON si falla (un get_result() sobre un execute fallido es un fatal de PHP). */
function db_execute_or_fail(mysqli_stmt $stmt): mysqli_stmt
{
    if (!$stmt->execute()) {
        error_log('[db] execute falló: ' . $stmt->error);
        http_response_code(500);
        echo json_encode(['action' => false, 'mensaje' => 'Error interno de base de datos']);
        exit;
    }
    return $stmt;
}

/**
 * prepare() que corta con JSON si falla. Con MYSQLI_REPORT_OFF un prepare() fallido devuelve
 * false y el bind_param() siguiente es un fatal de PHP (HTML en vez de JSON).
 */
function db_prepare_or_fail(mysqli $conn, string $sql): mysqli_stmt
{
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        error_log('[db] prepare falló: ' . $conn->error . ' | ' . $sql);
        http_response_code(500);
        echo json_encode(['action' => false, 'mensaje' => 'Error interno de base de datos']);
        exit;
    }
    return $stmt;
}

function app_env(): string
{
    return getenv('APP_ENV') ?: 'qa';
}
