<?php
// Datos de marca para los reportes PDF/Excel (los genera el navegador; ver frontend/src/app/services/reports/).
// El navegador no puede leer el logo del bucket público de R2 (no tiene CORS), así que el servidor lo baja y lo entrega
// como data URI. Solo se lee una URL del bucket público de esta empresa (guarda contra SSRF).

const REPORTE_LOGO_MAX_BYTES = 1048576;   // mismo tope que r2UploadBranding

/** [mime, data_uri, ancho, alto] del logo de la empresa, o null si no tiene, no es de nuestro bucket o no se pudo leer. */
function reporteLogo(?string $url, int $idEmpresa): ?array
{
    $base = rtrim((string)getenv('R2_PUBLIC_URL'), '/');
    if (!$url || $base === '' || !str_starts_with($url, $base . '/empresas/' . $idEmpresa . '/branding/')) return null;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXFILESIZE => REPORTE_LOGO_MAX_BYTES + 1,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if (!is_string($body) || $code !== 200 || $body === '' || strlen($body) > REPORTE_LOGO_MAX_BYTES) {
        error_log('[reportes] no se pudo leer el logo de la empresa ' . $idEmpresa . " (http $code)");
        return null;
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($body) ?: '';
    if (in_array($mime, ['text/plain', 'text/xml', 'application/xml'], true) && str_contains(substr($body, 0, 2048), '<svg')) $mime = 'image/svg+xml';

    if ($mime === 'image/svg+xml') {
        return ['mime' => $mime, 'data_uri' => 'data:image/svg+xml;base64,' . base64_encode($body), 'ancho' => null, 'alto' => null];
    }
    if (!in_array($mime, ['image/png', 'image/jpeg', 'image/webp'], true)) return null;

    if ($mime === 'image/webp') {   // jsPDF y ExcelJS no leen WebP: se pasa a PNG conservando la transparencia
        if (!function_exists('imagecreatefromstring')) return null;
        $img = @imagecreatefromstring($body);
        if (!$img) return null;
        imagepalettetotruecolor($img);
        imagealphablending($img, false);
        imagesavealpha($img, true);
        ob_start();
        imagepng($img);
        $body = (string)ob_get_clean();
        imagedestroy($img);
        $mime = 'image/png';
    }
    $dim = @getimagesizefromstring($body) ?: [null, null];
    return ['mime' => $mime, 'data_uri' => 'data:' . $mime . ';base64,' . base64_encode($body), 'ancho' => $dim[0], 'alto' => $dim[1]];
}

/** Marca del cliente para un reporte: empresa, sede, colores, logo y quién lo genera. */
function reporteMarca(mysqli $conn, array $u): array
{
    $stmt = db_prepare_or_fail($conn, 'SELECT id, nombre, logo_url, color_primario, color_secundario, color_terciario FROM le_empresas WHERE id = ?');
    $idEmpresa = (int)$u['id_empresa'];
    $stmt->bind_param('i', $idEmpresa);
    db_execute_or_fail($stmt);
    $e = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $colores = $e && $e['color_primario'] && $e['color_secundario'] && $e['color_terciario']
        ? ['primary' => $e['color_primario'], 'secondary' => $e['color_secundario'], 'tertiary' => $e['color_terciario']]
        : null;
    return [
        'empresa' => ['id' => $idEmpresa, 'nombre' => $e['nombre'] ?? null],
        'sede'    => ['id' => (int)$u['id_sede'], 'nombre' => $u['sede_nombre']],
        'colores' => $colores,
        'logo'    => $e ? reporteLogo($e['logo_url'], $idEmpresa) : null,
        'usuario' => ['nombre' => $u['nombre'] ?: $u['email'], 'email' => $u['email']],
    ];
}
