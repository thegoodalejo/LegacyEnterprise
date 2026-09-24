<?php
// Cloudflare R2 (S3 compatible) con firma AWS SigV4 propia, sin SDK. Port del helper de Kingdom.
// Config por entorno (.env → environment: del compose):
//   R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, R2_BUCKET_PRIVATE, R2_PUBLIC_URL
// Claves: sedes/{id_sede}/{modulo}/{uuid}.{ext} — el id_sede SIEMPRE de la sesión.

const R2_MIME_EXT = [
    'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif',
    'image/svg+xml' => 'svg', 'application/pdf' => 'pdf', 'text/csv' => 'csv', 'text/plain' => 'txt',
    'audio/mpeg' => 'mp3', 'audio/ogg' => 'ogg', 'video/mp4' => 'mp4',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
];

function r2Config(): array
{
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $cfg = [
        'endpoint'       => rtrim((string)getenv('R2_ENDPOINT'), '/'),
        'access_key'     => (string)getenv('R2_ACCESS_KEY'),
        'secret_key'     => (string)getenv('R2_SECRET_KEY'),
        'bucket'         => (string)getenv('R2_BUCKET'),
        'bucket_private' => (string)getenv('R2_BUCKET_PRIVATE'),
        'public_url'     => rtrim((string)getenv('R2_PUBLIC_URL'), '/'),
    ];
    // Guardia de entorno: un .env de QA nunca escribe en buckets de producción (ni al revés).
    $env = getenv('APP_ENV') ?: 'qa';
    foreach (['bucket', 'bucket_private'] as $b) {
        $name = $cfg[$b];
        $esProd = str_contains($name, '-prod');
        if ($name === '' || ($env === 'production') !== $esProd) {
            error_log("[r2] Bucket '$name' no corresponde a APP_ENV=$env");
            http_response_code(500);
            echo json_encode(['action' => false, 'mensaje' => 'Almacenamiento mal configurado']);
            exit;
        }
    }
    return $cfg;
}

/**
 * Valida y sube un archivo de $_FILES. Suma el uso de la sede y respeta su cuota (si tiene).
 * @return array ['success'=>true,'key','url'|null,'mime','size'] | ['success'=>false,'error']
 */
function r2Upload(mysqli $conn, array $file, int $idSede, string $modulo, array $mimes, float $maxMB, bool $private = false): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) return ['success' => false, 'error' => 'No se recibió el archivo o llegó incompleto.'];
    if ($file['size'] > (int)($maxMB * 1024 * 1024)) return ['success' => false, 'error' => "El archivo supera el límite de {$maxMB} MB."];
    if (!preg_match('/^[a-z0-9_-]{1,40}$/', $modulo)) return ['success' => false, 'error' => 'Módulo inválido.'];

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    if (!isset(R2_MIME_EXT[$mime]) || ($mimes && !in_array($mime, $mimes, true))) {
        return ['success' => false, 'error' => "Tipo de archivo no permitido ($mime)."];
    }

    $s = db_prepare_or_fail($conn, 'SELECT storage_quota_mb, storage_used_bytes FROM le_sedes WHERE id = ?');
    $s->bind_param('i', $idSede);
    $s->execute();
    $sede = $s->get_result()->fetch_assoc();
    $s->close();
    if ($sede && $sede['storage_quota_mb'] !== null
        && (int)$sede['storage_used_bytes'] + $file['size'] > (int)$sede['storage_quota_mb'] * 1024 * 1024) {
        return ['success' => false, 'error' => 'La sede no tiene espacio de almacenamiento disponible.'];
    }

    $cfg = r2Config();
    $bucket = $private ? $cfg['bucket_private'] : $cfg['bucket'];
    $key = "sedes/{$idSede}/{$modulo}/" . bin2hex(random_bytes(16)) . '.' . R2_MIME_EXT[$mime];

    [$ok, $err] = _r2Request('PUT', $bucket, $key, $file['tmp_name'], $mime);
    if (!$ok) return ['success' => false, 'error' => 'No se pudo guardar el archivo.', 'detail' => $err];

    $u = db_prepare_or_fail($conn, 'UPDATE le_sedes SET storage_used_bytes = storage_used_bytes + ? WHERE id = ?');
    $size = (int)$file['size'];
    $u->bind_param('ii', $size, $idSede);
    $u->execute();
    $u->close();

    return ['success' => true, 'key' => $key, 'url' => $private ? null : $cfg['public_url'] . '/' . $key, 'mime' => $mime, 'size' => $size];
}

/** Borra un objeto y resta su tamaño del uso de la sede. Verifica que la clave sea de esa sede. */
function r2Delete(mysqli $conn, string $key, int $idSede, bool $private = false): bool
{
    if (!str_starts_with($key, "sedes/{$idSede}/")) return false;
    $cfg = r2Config();
    $bucket = $private ? $cfg['bucket_private'] : $cfg['bucket'];
    $size = _r2HeadSize($bucket, $key);
    [$ok] = _r2Request('DELETE', $bucket, $key);
    if ($ok && $size > 0) {
        $u = db_prepare_or_fail($conn, 'UPDATE le_sedes SET storage_used_bytes = GREATEST(0, CAST(storage_used_bytes AS SIGNED) - ?) WHERE id = ?');
        $u->bind_param('ii', $size, $idSede);
        $u->execute();
        $u->close();
    }
    return $ok;
}

/**
 * LegacyEnterprise — logo de marca blanca de una empresa (bucket público, sin cuota de sede).
 * Clave: empresas/{id_empresa}/branding/{uuid}.{ext}
 * @return array ['success'=>true,'key','url'] | ['success'=>false,'error']
 */
function r2UploadBranding(array $file, int $idEmpresa): array
{
    $mimes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    $maxMB = 1;
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) return ['success' => false, 'error' => 'No se recibió el archivo o llegó incompleto.'];
    if ($file['size'] > $maxMB * 1024 * 1024) return ['success' => false, 'error' => "El logo supera el límite de {$maxMB} MB."];
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    if (!in_array($mime, $mimes, true)) return ['success' => false, 'error' => "Formato no permitido ($mime). Usa PNG, JPG, WEBP o SVG."];

    $cfg = r2Config();
    $key = "empresas/{$idEmpresa}/branding/" . bin2hex(random_bytes(16)) . '.' . R2_MIME_EXT[$mime];
    [$ok, $err] = _r2Request('PUT', $cfg['bucket'], $key, $file['tmp_name'], $mime);
    if (!$ok) return ['success' => false, 'error' => 'No se pudo guardar el logo.', 'detail' => $err];
    return ['success' => true, 'key' => $key, 'url' => $cfg['public_url'] . '/' . $key];
}

/** Borra el logo anterior de una empresa si la URL es de nuestro bucket y de esa empresa. Nunca lanza. */
function r2DeleteBrandingUrl(?string $url, int $idEmpresa): void
{
    if (!$url) return;
    $cfg = r2Config();
    $prefix = $cfg['public_url'] . '/';
    if (!str_starts_with($url, $prefix)) return;
    $key = substr($url, strlen($prefix));
    if (!str_starts_with($key, "empresas/{$idEmpresa}/branding/")) return;
    _r2Request('DELETE', $cfg['bucket'], $key);
}

/** URL GET prefirmada (query-string SigV4) para un objeto del bucket privado. */
function r2PresignGet(string $key, int $seconds = 300): string
{
    $cfg = r2Config();
    $host = parse_url($cfg['endpoint'], PHP_URL_HOST);
    $path = '/' . $cfg['bucket_private'] . '/' . ltrim($key, '/');
    $now = new DateTime('now', new DateTimeZone('UTC'));
    $amzDate = $now->format('Ymd\THis\Z');
    $date = $now->format('Ymd');
    $scope = "$date/auto/s3/aws4_request";
    $qp = [
        'X-Amz-Algorithm' => 'AWS4-HMAC-SHA256',
        'X-Amz-Credential' => "{$cfg['access_key']}/$scope",
        'X-Amz-Date' => $amzDate,
        'X-Amz-Expires' => (string)$seconds,
        'X-Amz-SignedHeaders' => 'host',
    ];
    ksort($qp);
    $qs = http_build_query($qp, '', '&', PHP_QUERY_RFC3986);
    $canon = "GET\n" . _r2CanonUri($path) . "\n$qs\nhost:$host\n\nhost\nUNSIGNED-PAYLOAD";
    $sig = hash_hmac('sha256', "AWS4-HMAC-SHA256\n$amzDate\n$scope\n" . hash('sha256', $canon), _r2SigningKey($cfg['secret_key'], $date));
    return $cfg['endpoint'] . $path . "?$qs&X-Amz-Signature=$sig";
}

// --- internos ---------------------------------------------------------------

function _r2Request(string $method, string $bucket, string $key, ?string $filePath = null, string $contentType = ''): array
{
    $cfg = r2Config();
    $host = parse_url($cfg['endpoint'], PHP_URL_HOST);
    $path = "/$bucket/" . ltrim($key, '/');
    $now = new DateTime('now', new DateTimeZone('UTC'));
    $amzDate = $now->format('Ymd\THis\Z');
    $date = $now->format('Ymd');
    $payloadHash = $filePath ? hash_file('sha256', $filePath) : hash('sha256', '');

    $headers = ['host' => $host, 'x-amz-content-sha256' => $payloadHash, 'x-amz-date' => $amzDate];
    if ($contentType !== '') $headers['content-type'] = $contentType;
    ksort($headers);
    $canonHeaders = '';
    foreach ($headers as $k => $v) $canonHeaders .= "$k:$v\n";
    $signed = implode(';', array_keys($headers));

    $canon = "$method\n" . _r2CanonUri($path) . "\n\n$canonHeaders\n$signed\n$payloadHash";
    $scope = "$date/auto/s3/aws4_request";
    $sig = hash_hmac('sha256', "AWS4-HMAC-SHA256\n$amzDate\n$scope\n" . hash('sha256', $canon), _r2SigningKey($cfg['secret_key'], $date));
    $auth = "AWS4-HMAC-SHA256 Credential={$cfg['access_key']}/$scope,SignedHeaders=$signed,Signature=$sig";

    $h = ["Authorization: $auth"];
    foreach ($headers as $k => $v) $h[] = "$k: $v";

    $ch = curl_init($cfg['endpoint'] . $path);
    $opts = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 120, CURLOPT_HTTPHEADER => $h];
    $fh = null;
    if ($filePath) {
        $fh = fopen($filePath, 'rb');
        $opts += [CURLOPT_UPLOAD => true, CURLOPT_INFILE => $fh, CURLOPT_INFILESIZE => filesize($filePath)];
    }
    if ($method === 'HEAD') $opts[CURLOPT_NOBODY] = true;
    $contentLength = 0;
    $opts[CURLOPT_HEADERFUNCTION] = static function ($c, $line) use (&$contentLength) {
        if (preg_match('/^content-length:\s*(\d+)/i', $line, $m)) $contentLength = (int)$m[1];
        return strlen($line);
    };
    curl_setopt_array($ch, $opts);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($fh) fclose($fh);

    if ($err) return [false, $err, $code, 0];
    return [$code >= 200 && $code < 300, $code >= 300 ? "HTTP $code: " . substr((string)$resp, 0, 300) : '', $code, $contentLength];
}

/** Tamaño de un objeto vía HEAD firmado; 0 si no existe o falla. */
function _r2HeadSize(string $bucket, string $key): int
{
    [$ok, , , $len] = _r2Request('HEAD', $bucket, $key);
    return $ok ? $len : 0;
}

function _r2CanonUri(string $path): string
{
    return implode('/', array_map(static fn($s) => rawurlencode(rawurldecode($s)), explode('/', $path)));
}

function _r2SigningKey(string $secret, string $date): string
{
    $k = hash_hmac('sha256', $date, 'AWS4' . $secret, true);
    $k = hash_hmac('sha256', 'auto', $k, true);
    $k = hash_hmac('sha256', 's3', $k, true);
    return hash_hmac('sha256', 'aws4_request', $k, true);
}
