<?php
// Revisión de categoría de una plantilla con REGLAS PROPIAS (sin IA): estima el riesgo de que Meta clasifique como MARKETING una plantilla
// pedida como UTILIDAD. Meta no ofrece validar antes de enviar: desde el 9-abr-2025 una «utilidad» que juzga promocional se aprueba como
// marketing (y cuesta 20 créditos por mensaje en vez de 1). Esto no reemplaza el criterio de Meta; avisa lo evidente antes de enviar.
// Una sola fuente de verdad: el constructor del frontend llama a revisar_categoria.php mientras se escribe (con pausa), no hay copia en TS.
//
// Devuelve {riesgo: bajo|medio|alto, puntaje, motivos: [{codigo, palabras?}], transaccional: bool}. El frontend traduce cada código.
// Puntaje ≥ 5 → alto (no se deja enviar como utilidad); 3–4 → medio; < 3 → bajo.

const COM_CAT_PROMO = ['descuento', 'descuentos', 'dcto', 'oferta', 'ofertas', 'promo', 'promocion', 'promociones', 'gratis', 'rebaja', 'rebajas',
    'liquidacion', 'black friday', 'cyber monday', 'compra ya', 'compra ahora', 'compralo', 'aprovecha', 'aprovechala', 'ultimas unidades',
    'ultimos dias', 'por tiempo limitado', 'solo por hoy', 'solo hoy', 'no te lo pierdas', 'precio especial', 'precios especiales', '2x1', '3x2',
    'cupon', 'cupones', 'codigo de descuento', 'regalo', 'regalos', 'sorteo', 'ganate', 'participa', 'lanzamiento', 'nuevo producto',
    'nuevos productos', 'novedades', 'nueva coleccion', 'catalogo', 'exclusivo', 'exclusiva', 'exclusivos', 'suscribete', 'siguenos',
    'visita nuestra tienda', 'te invitamos', 'ahorra', 'ahorro', 'envio gratis', 'oportunidad unica', 'descubre', 'imperdible', 'rebajado',
    'discount', 'offer', 'sale', 'free', 'deal', 'deals', 'coupon', 'limited time', 'shop now', 'buy now', 'new arrivals', 'exclusive',
    'giveaway', 'subscribe', 'follow us', 'save up'];
const COM_CAT_TRANSACCION = ['pedido', 'orden', 'factura', 'pago', 'pagos', 'cita', 'reserva', 'reservacion', 'envio', 'entrega', 'guia', 'cuenta',
    'saldo', 'cuota', 'recibo', 'confirmacion', 'confirmamos', 'confirmada', 'confirmado', 'recordatorio', 'vence', 'vencimiento', 'turno', 'tramite',
    'solicitud', 'ticket', 'caso', 'radicado', 'poliza', 'contrato', 'mantenimiento', 'visita', 'agendada', 'agendado', 'programada', 'programado',
    'estado de', 'numero de', 'codigo de seguimiento', 'garantia', 'devolucion', 'reembolso', 'suscripcion', 'membresia', 'afiliacion',
    'order', 'invoice', 'payment', 'appointment', 'booking', 'shipment', 'delivery', 'account', 'reminder', 'receipt', 'refund'];
const COM_CAT_EMOJIS = ['🎉', '🔥', '💥', '🛍', '🎁', '⚡', '🤑', '💸', '🏷', '🥳', '🎊', '💯', '🛒', '👉'];
const COM_CAT_SALUDOS = ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'buen dia', 'saludos', 'hi', 'hello', 'hey'];

/**
 * Revisa los textos de una plantilla. $textos = ['encabezado' => ?string, 'cuerpo' => string, 'pie' => ?string, 'botones' => [texto…]].
 */
function comRevisarCategoria(array $textos): array
{
    $cuerpo = (string)($textos['cuerpo'] ?? '');
    $todo = implode(' ', array_filter([(string)($textos['encabezado'] ?? ''), $cuerpo, (string)($textos['pie'] ?? ''),
        implode(' ', array_map('strval', $textos['botones'] ?? []))]));
    $sinVars = preg_replace('/\{\{\s*\d+\s*\}\}/', ' ', $todo) ?? $todo;
    $norm = ' ' . comNormalizar($sinVars) . ' ';
    $motivos = [];
    $puntaje = 0;

    $promo = array_values(array_filter(COM_CAT_PROMO, static fn($p) => str_contains($norm, ' ' . $p . ' ')));
    if ($promo) { $puntaje += min(6, 3 * count($promo)); $motivos[] = ['codigo' => 'promocional', 'palabras' => array_slice($promo, 0, 5)]; }
    if (preg_match('/\d+\s?%|%\s?\d+/u', $sinVars)) { $puntaje += 3; $motivos[] = ['codigo' => 'porcentaje']; }
    $emojis = array_values(array_filter(COM_CAT_EMOJIS, static fn($e) => str_contains($todo, $e)));
    if ($emojis) { $puntaje += min(2, count($emojis)); $motivos[] = ['codigo' => 'emojis', 'palabras' => $emojis]; }
    if (substr_count($todo, '!') >= 3) { $puntaje += 1; $motivos[] = ['codigo' => 'exclamaciones']; }

    $nVars = preg_match_all('/\{\{\s*\d+\s*\}\}/', $cuerpo);
    $trans = array_values(array_filter(COM_CAT_TRANSACCION, static fn($p) => str_contains($norm, ' ' . $p . ' ')));
    if (!$trans) { $puntaje += 2; $motivos[] = ['codigo' => 'sin_transaccion']; }
    elseif ($nVars > 0) { $puntaje -= 2; }
    if ($nVars === 0) {
        $puntaje += 1; $motivos[] = ['codigo' => 'sin_variables'];
        $inicio = comNormalizar(mb_substr($cuerpo, 0, 30));
        foreach (COM_CAT_SALUDOS as $s) if (str_starts_with($inicio, $s)) { $puntaje += 1; $motivos[] = ['codigo' => 'saludo_generico']; break; }
    }
    $puntaje = max(0, $puntaje);
    return ['riesgo' => $puntaje >= 5 ? 'alto' : ($puntaje >= 3 ? 'medio' : 'bajo'), 'puntaje' => $puntaje, 'motivos' => $motivos,
        'transaccional' => (bool)$trans, 'palabras_transaccion' => array_slice($trans, 0, 5)];
}
