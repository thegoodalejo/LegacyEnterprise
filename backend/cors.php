<?php
// Orígenes permitidos explícitos (nunca '*': hay tokens de por medio).
$allowedOrigins = [
    'https://legacyenterprise.web.app',               // sitio de Hosting de la app (URL pública)
    'https://legacyenterprise.firebaseapp.com',
    'https://legacyenterprise-731cb.web.app',         // sitio por defecto del proyecto (no se usa, se deja por compatibilidad)
    'https://legacyenterprise-731cb.firebaseapp.com',
    'http://localhost:4200',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token, Accept, Origin');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
