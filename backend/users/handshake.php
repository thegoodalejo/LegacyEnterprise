<?php
// Handshake de login: recibe el ID token de Firebase, lo verifica criptográficamente, crea/actualiza
// el usuario, guarda el hash del token y devuelve la sesión. Se llama tras el login y en cada
// refresco del token (Firebase lo renueva cada hora). Público: es el único que no exige X-Auth-Token.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_firebase_token.php';

$idToken = $_POST['id_token'] ?? '';
$claims = $idToken !== '' ? verifyFirebaseIdToken($idToken) : null;
if (!$claims) authFail(401, 'Token de Firebase inválido');

$uid    = $claims['sub'];
$email  = $claims['email'] ?? '';
$nombre = $claims['name'] ?? null;
$foto   = $claims['picture'] ?? null;
$hash   = hash('sha256', $idToken);

$conn = conectar();
$stmt = db_prepare_or_fail($conn,
    'INSERT INTO le_usuarios (firebase_uid, email, nombre, foto_url, auth_token_hash, last_login)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE email = VALUES(email),
                             nombre = COALESCE(nombre, VALUES(nombre)),
                             foto_url = VALUES(foto_url),
                             auth_token_hash = VALUES(auth_token_hash),
                             last_login = NOW()');
$stmt->bind_param('sssss', $uid, $email, $nombre, $foto, $hash);
$ok = $stmt->execute();
$stmt->close();
$conn->close();

if (!$ok) authFail(500, 'No se pudo iniciar sesión');

loadSession($idToken);   // deja la sesión en $GLOBALS['authUser'] (401/403 si algo falla)
echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => sessionPayload()]);
