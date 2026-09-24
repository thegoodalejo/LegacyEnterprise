<?php
// Verifica un ID token de Firebase (RS256) contra los certificados públicos de Google.
// Se usa solo en el handshake: después la sesión es el hash del token en la BD.
// Devuelve los claims (uid en 'sub', email, name, picture) o null si no es válido.

function verifyFirebaseIdToken(string $idToken): ?array
{
    $projectId = getenv('FIREBASE_PROJECT_ID');
    if (!$projectId) { error_log('[firebase] FIREBASE_PROJECT_ID no configurado'); return null; }

    $parts = explode('.', $idToken);
    if (count($parts) !== 3) return null;
    [$h64, $p64, $s64] = $parts;

    $b64d = static fn(string $s) => base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
    $header  = json_decode($b64d($h64), true);
    $payload = json_decode($b64d($p64), true);
    if (!$header || !$payload || ($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) return null;

    $now = time();
    if (($payload['aud'] ?? '') !== $projectId) return null;
    if (($payload['iss'] ?? '') !== "https://securetoken.google.com/{$projectId}") return null;
    if (($payload['exp'] ?? 0) < $now - 60 || ($payload['iat'] ?? PHP_INT_MAX) > $now + 300) return null;
    if (empty($payload['sub'])) return null;

    $certs = _firebaseCerts();
    $pem = $certs[$header['kid']] ?? null;
    if (!$pem) return null;

    $ok = openssl_verify("{$h64}.{$p64}", $b64d($s64), $pem, OPENSSL_ALGO_SHA256);
    return $ok === 1 ? $payload : null;
}

/** Certificados de Google cacheados en /tmp según su Cache-Control (se rotan cada pocas horas). */
function _firebaseCerts(): array
{
    $cacheFile = sys_get_temp_dir() . '/firebase_certs.json';
    if (is_file($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if ($cached && ($cached['expires'] ?? 0) > time()) return $cached['certs'];
    }

    $ch = curl_init('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_TIMEOUT => 10]);
    $resp = curl_exec($ch);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    if ($resp === false) return [];

    $headers = substr($resp, 0, $headerSize);
    $certs = json_decode(substr($resp, $headerSize), true) ?: [];
    $maxAge = preg_match('/max-age=(\d+)/i', $headers, $m) ? (int)$m[1] : 3600;
    @file_put_contents($cacheFile, json_encode(['expires' => time() + $maxAge, 'certs' => $certs]));
    return $certs;
}
