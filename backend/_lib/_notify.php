<?php
// Notificar a usuarios desde cualquier endpoint o cron:
//   notifyUser($conn, $idSede, $idUsuario, 'Nueva tarea', 'Te asignaron "X"', '/tareas/123', 'tarea_asignada', ['id_tarea' => 123]);
// Siempre inserta la fila (aparece en la campanita) y, si el usuario tiene token, envía push.
// Llamar DESPUÉS del commit de la operación principal. Nunca lanza.
//
// Clics: el push abre /notificaciones?n=<uuid>; dentro de la app, la notificación navega a $link.

require_once __DIR__ . '/_fcm.php';

function notifUuid(): string
{
    $d = random_bytes(16);
    $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
    $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

function notifyUser(mysqli $conn, int $idSede, int $idUsuario, string $title, string $body,
                    string $link = '/notificaciones', string $tag = 'general', array $custom = []): ?string
{
    try {
        $uuid = notifUuid();
        $cj = json_encode($custom, JSON_UNESCAPED_UNICODE);
        $s = $conn->prepare('INSERT INTO le_notificaciones (uuid, id_sede, id_usuario, title, body, link, tag, custom_data)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        if (!$s) { error_log('[notify] ' . $conn->error); return null; }
        $s->bind_param('siisssss', $uuid, $idSede, $idUsuario, $title, $body, $link, $tag, $cj);
        $s->execute();
        $s->close();

        $s = $conn->prepare('SELECT fcm_token FROM le_usuarios WHERE id = ? AND state = 1');
        if (!$s) return $uuid;
        $s->bind_param('i', $idUsuario);
        $s->execute();
        $token = $s->get_result()->fetch_assoc()['fcm_token'] ?? null;
        $s->close();
        if (!$token) return $uuid;

        $res = fcmSend($token, [
            'uuid'  => $uuid,
            'title' => $title,
            'body'  => $body,
            'link'  => $link,
            'tag'   => $tag,
            'id_sede' => (string)$idSede,
        ]);
        if ($res === 'invalid_token') {
            $c = $conn->prepare('UPDATE le_usuarios SET fcm_token = NULL WHERE id = ? AND fcm_token = ?');
            if ($c) { $c->bind_param('is', $idUsuario, $token); $c->execute(); $c->close(); }
        }
        return $uuid;
    } catch (Throwable $e) {
        error_log('[notify] ' . $e->getMessage());
        return null;
    }
}

/** Notifica a varios usuarios sin repetir y omitiendo a $excluir (normalmente quien hizo la acción). */
function notifyUsers(mysqli $conn, int $idSede, array $idsUsuario, string $title, string $body,
                     string $link = '/notificaciones', string $tag = 'general', array $custom = [], int $excluir = 0): void
{
    $vistos = [];
    foreach ($idsUsuario as $id) {
        $id = (int)$id;
        if ($id <= 0 || $id === $excluir || isset($vistos[$id])) continue;
        $vistos[$id] = true;
        notifyUser($conn, $idSede, $id, $title, $body, $link, $tag, $custom);
    }
}
