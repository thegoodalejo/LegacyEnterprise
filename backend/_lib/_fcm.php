<?php
// Envío de push con FCM HTTP v1. La cuenta de servicio llega por FCM_SERVICE_ACCOUNT_B64 (.env),
// nunca como archivo en storage/ ni en el repo.

/** Access token OAuth de FCM, cacheado por proceso (el JWT se firma una vez por request/cron). */
function fcmAccessToken(): ?string
{
    static $cached = null;
    if ($cached !== null) return $cached ?: null;
    $cached = '';

    $sa = json_decode((string)base64_decode(getenv('FCM_SERVICE_ACCOUNT_B64') ?: ''), true);
    if (empty($sa['client_email']) || empty($sa['private_key'])) {
        error_log('[fcm] FCM_SERVICE_ACCOUNT_B64 ausente o inválida');
        return null;
    }

    $b64u = static fn(string $s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    $now = time();
    $header  = $b64u(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $payload = $b64u(json_encode([
        'iss'   => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'iat'   => $now,
        'exp'   => $now + 3600,
    ]));
    if (!openssl_sign("$header.$payload", $sig, $sa['private_key'], 'sha256WithRSAEncryption')) {
        error_log('[fcm] openssl_sign falló: ' . openssl_error_string());
        return null;
    }
    $jwt = "$header.$payload." . $b64u($sig);

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_POSTFIELDS => http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt]),
    ]);
    $resp = json_decode((string)curl_exec($ch), true);
    curl_close($ch);

    $cached = $resp['access_token'] ?? '';
    if (!$cached) error_log('[fcm] OAuth falló: ' . json_encode($resp));
    return $cached ?: null;
}

/**
 * Envía un push DATA-ONLY (sin bloque 'notification': el service worker decide cómo mostrarlo y no
 * se duplica). Todos los valores de 'data' deben ser strings.
 * @return string 'ok' | 'invalid_token' | 'error'
 */
function fcmSend(string $deviceToken, array $data): string
{
    $access = fcmAccessToken();
    $sa = json_decode((string)base64_decode(getenv('FCM_SERVICE_ACCOUNT_B64') ?: ''), true);
    $projectId = getenv('FIREBASE_PROJECT_ID') ?: ($sa['project_id'] ?? '');
    if (!$access || !$projectId) return 'error';

    $data = array_map('strval', $data);
    $body = json_encode(['message' => [
        'token'   => $deviceToken,
        'data'    => $data,
        'android' => ['priority' => 'high'],
        'webpush' => ['headers' => ['Urgency' => 'high', 'TTL' => '86400']],
    ]]);

    $ch = curl_init("https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send");
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $access],
        CURLOPT_POSTFIELDS => $body,
    ]);
    $resp = (string)curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code === 200) return 'ok';
    // Token que ya no sirve (desinstaló, borró datos, revocó permiso): el caller lo limpia.
    if ($code === 404 || str_contains($resp, 'UNREGISTERED') || ($code === 400 && str_contains($resp, 'registration token'))) {
        return 'invalid_token';
    }
    error_log("[fcm] HTTP $code: " . substr($resp, 0, 300));
    return 'error';
}
