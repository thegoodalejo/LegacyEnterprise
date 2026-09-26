<?php
// Cifrado de los secretos de Comunicaciones (app secret y verify token de las apps de Meta, access token de las líneas).
// AES-256-GCM con la llave COM_SECRET_KEY del entorno (32 bytes en base64, distinta en QA y PDN; nunca en la BD ni en git).
// Formato guardado: "v1:" + base64(iv[12] + tag[16] + texto cifrado). Sin llave no se guarda ningún secreto (error claro) y lo
// guardado no se puede leer: los envíos fallan con ese motivo. Cambiar la llave obliga a volver a cargar los secretos.

const COM_CRYPTO_PREFIJO = 'v1:';

/** Llave binaria de 32 bytes o null si falta o es inválida. */
function comCryptoKey(): ?string
{
    static $key = false;
    if ($key !== false) return $key;
    $raw = (string)(getenv('COM_SECRET_KEY') ?: '');
    $bin = $raw !== '' ? base64_decode($raw, true) : false;
    $key = ($bin !== false && strlen($bin) === 32) ? $bin : null;
    if ($key === null && $raw !== '') error_log('[com_crypto] COM_SECRET_KEY inválida: debe ser base64 de 32 bytes (openssl rand -base64 32)');
    return $key;
}

function comCryptoDisponible(): bool
{
    return comCryptoKey() !== null;
}

/** Cifra un secreto. Sin llave corta con 500 y un mensaje que dice qué falta (lo ve L5 al guardar una app o una línea). */
function comCifrar(string $plano): string
{
    $key = comCryptoKey();
    if ($key === null) authFail(500, 'Falta COM_SECRET_KEY en el servidor: no se pueden guardar secretos de WhatsApp (ver docs/modulos/comunicaciones.md → Operación)');
    $iv = random_bytes(12);
    $tag = '';
    $ct = openssl_encrypt($plano, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    if ($ct === false) authFail(500, 'No se pudo cifrar el secreto');
    return COM_CRYPTO_PREFIJO . base64_encode($iv . $tag . $ct);
}

/** Descifra; null si viene vacío, falta la llave o el texto no corresponde a esta llave (nunca lanza). */
function comDescifrar(?string $enc): ?string
{
    if ($enc === null || $enc === '' || !str_starts_with($enc, COM_CRYPTO_PREFIJO)) return null;
    $key = comCryptoKey();
    if ($key === null) return null;
    $bin = base64_decode(substr($enc, strlen(COM_CRYPTO_PREFIJO)), true);
    if ($bin === false || strlen($bin) < 29) return null;
    $plano = openssl_decrypt(substr($bin, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($bin, 0, 12), substr($bin, 12, 16));
    if ($plano === false) {
        error_log('[com_crypto] no se pudo descifrar un secreto (¿cambió COM_SECRET_KEY?)');
        return null;
    }
    return $plano;
}
