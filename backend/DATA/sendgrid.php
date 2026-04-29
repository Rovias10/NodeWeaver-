<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/env.php';

/**
 * Servicio de envío de correos transaccionales con SendGrid.
 *
 * Tras el rediseño de NodeWeaver → StudyWeaver:
 *   - Las URLs de los enlaces apuntan a la SPA React (Vite). En desarrollo
 *     localhost:5173; en producción se lee del .env (FRONTEND_BASE_URL o
 *     FRONTEND_URL como alias). Si ninguna está definida, cae al default
 *     local — que es la causa típica de "el enlace del email me lleva a
 *     localhost en producción".
 *   - El branding sigue la paleta StudyWeaver "Cielo Claro" (paper, sky,
 *     sun, coral, ink) ya definida en frontend/src/styles/index.css.
 *   - La plantilla usa **layout en tablas y estilos inline**: Gmail,
 *     Outlook y Apple Mail eliminan o ignoran lo que vaya en <style>, así
 *     que cualquier cosa importante para el render debe ir como atributo
 *     `style="..."` directamente en cada nodo.
 */
class EmailService {
    private $sendgrid_api_key;
    private $from_email;
    private $from_name;
    private $frontend_base;

    public function __construct() {
        $this->sendgrid_api_key = EnvLoader::get('SENDGRID_API_KEY');
        // Acepta tanto SENDGRID_FROM_EMAIL (nombre canónico en docs/backend-archivos.md)
        // como MAIL_FROM (alias documentado en docs/despliegue.md). La intención
        // es que el .env de producción funcione tal cual lo describe el manual
        // de despliegue, sin tener que recordar dos variables distintas.
        $this->from_email = EnvLoader::get('SENDGRID_FROM_EMAIL')
            ?: EnvLoader::get('MAIL_FROM', 'noreply@studyweaver.com');
        $this->from_name  = EnvLoader::get('SENDGRID_FROM_NAME', 'StudyWeaver');
        // Idem: FRONTEND_BASE_URL (canónico) o FRONTEND_URL (alias en
        // docs/despliegue.md). Quitamos cualquier trailing slash para evitar
        // URLs con dobles "/" cuando concatenamos /confirmar?token=...
        $base = EnvLoader::get('FRONTEND_BASE_URL')
            ?: EnvLoader::get('FRONTEND_URL', 'http://localhost:5173');
        $this->frontend_base = rtrim($base, '/');
    }

    public function sendPasswordReset($to_email, $to_name, $reset_token) {
        $email = new \SendGrid\Mail\Mail();
        $email->setFrom($this->from_email, $this->from_name);
        $email->setSubject('Recuperación de contraseña — StudyWeaver');
        $email->addTo($to_email, $to_name);

        $reset_link = $this->frontend_base . '/reset?token=' . urlencode($reset_token);

        $email->addContent(
            "text/html",
            $this->getResetEmailTemplate($to_name, $reset_link)
        );

        $sendgrid = new \SendGrid($this->sendgrid_api_key);

        try {
            $response = $sendgrid->send($email);
            return $response->statusCode() == 202;
        } catch (Exception $e) {
            error_log('Error SendGrid: ' . $e->getMessage());
            return false;
        }
    }

    public function sendAccountConfirmation($to_email, $to_name, $verification_token) {
        $email = new \SendGrid\Mail\Mail();
        $email->setFrom($this->from_email, $this->from_name);
        $email->setSubject('Confirma tu cuenta — StudyWeaver');
        $email->addTo($to_email, $to_name);

        $confirm_link = $this->frontend_base . '/confirmar?token=' . urlencode($verification_token);

        $email->addContent(
            "text/html",
            $this->getConfirmationEmailTemplate($to_name, $confirm_link)
        );

        $sendgrid = new \SendGrid($this->sendgrid_api_key);

        try {
            $response = $sendgrid->send($email);
            return $response->statusCode() == 202;
        } catch (Exception $e) {
            error_log('Error SendGrid: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Devuelve el HTML del correo con la maqueta StudyWeaver.
     *
     * Decisiones de diseño:
     *   - Layout 100% en tablas anidadas: es el patrón estándar de email
     *     transaccional porque Outlook (Word render engine) ignora flex,
     *     grid y muchos `display:` modernos.
     *   - Estilos inline en cada nodo. El bloque <style> sólo contiene
     *     hover/responsive como mejora progresiva.
     *   - Banda superior con gradiente sky → coral (los tres tonos clave
     *     de la paleta Cielo Claro), logo en SVG inline y wordmark.
     *   - Botón pill ancho con gradiente; debajo, enlace plano con la URL
     *     completa por si el cliente quita botones o el usuario desconfía
     *     de un botón sin URL visible (común en clientes corporativos).
     *
     * @param string $title    Título grande del cuerpo.
     * @param string $intro    Saludo HTML (incluye <p> ya formateados).
     * @param string $ctaLabel Texto del botón principal.
     * @param string $ctaLink  URL del botón (debe llevar token).
     * @param string $note     Texto pequeño de cierre (caducidad, aviso…).
     */
    private function renderEmail($title, $intro, $ctaLabel, $ctaLink, $note) {
        $safeTitle    = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
        $safeCtaLabel = htmlspecialchars($ctaLabel, ENT_QUOTES, 'UTF-8');
        $safeCtaLink  = htmlspecialchars($ctaLink, ENT_QUOTES, 'UTF-8');
        $safeNote     = htmlspecialchars($note, ENT_QUOTES, 'UTF-8');
        $year         = date('Y');

        return <<<HTML
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>StudyWeaver</title>
    <style>
        @media only screen and (max-width: 600px) {
            .sw-container { width: 100% !important; }
            .sw-inner     { padding: 24px 20px !important; }
            .sw-cta       { display: block !important; }
        }
        a.sw-btn:hover { filter: brightness(1.05); }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#f6fbff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
        Tu acción de StudyWeaver te espera. Pulsa el botón para continuar.
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f6fbff;padding:32px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" class="sw-container" style="width:560px;max-width:560px;background-color:#ffffff;border:1px solid #dbeefe;border-radius:20px;overflow:hidden;box-shadow:0 18px 48px -24px rgba(14,165,233,0.35);">
                    <tr>
                        <td style="background:linear-gradient(135deg,#0ea5e9 0%,#3aa8fa 55%,#fb7185 100%);padding:28px 32px;color:#ffffff;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="vertical-align:middle;">
                                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td style="padding-right:12px;vertical-align:middle;">
                                                    <div style="width:40px;height:40px;background-color:rgba(255,255,255,0.18);border-radius:12px;text-align:center;line-height:40px;">
                                                        <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#ffffff;">S</span>
                                                    </div>
                                                </td>
                                                <td style="vertical-align:middle;">
                                                    <div style="font-size:20px;font-weight:700;letter-spacing:-0.4px;color:#ffffff;">StudyWeaver</div>
                                                    <div style="font-size:12px;color:rgba(255,255,255,0.82);margin-top:2px;">Tus apuntes, en herramientas de estudio</div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td class="sw-inner" style="padding:36px 44px 12px;">
                            <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">
                                {$safeTitle}
                            </h1>
                            <div style="font-size:15px;line-height:1.65;color:#475569;">
                                {$intro}
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" class="sw-inner" style="padding:24px 44px 8px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="center" style="border-radius:12px;background:linear-gradient(135deg,#0ea5e9 0%,#3aa8fa 60%,#fcd34d 100%);box-shadow:0 12px 28px -8px rgba(14,165,233,0.45);">
                                        <a href="{$safeCtaLink}" class="sw-btn sw-cta" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;letter-spacing:0.2px;">
                                            {$safeCtaLabel}
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td class="sw-inner" style="padding:8px 44px 20px;">
                            <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
                                ¿No funciona el botón? Copia esta dirección en tu navegador:
                            </p>
                            <p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#0284c7;word-break:break-all;text-align:center;">
                                <a href="{$safeCtaLink}" style="color:#0284c7;text-decoration:underline;">{$safeCtaLink}</a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td class="sw-inner" style="padding:0 44px 32px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #eff8ff;margin-top:8px;">
                                <tr>
                                    <td style="padding-top:18px;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
                                        {$safeNote}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" class="sw-container" style="width:560px;max-width:560px;margin-top:18px;">
                    <tr>
                        <td align="center" style="font-size:11px;line-height:1.5;color:#94a3b8;padding:0 24px;">
                            &copy; {$year} StudyWeaver · Proyecto Final DAW<br>
                            Este correo se envió porque se solicitó una acción con tu dirección. Si no fuiste tú, ignóralo.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;
    }

    private function getResetEmailTemplate($name, $link) {
        $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        $intro = "
            <p style='margin:0 0 12px;'>Hola <strong style='color:#0f172a;'>{$safeName}</strong>,</p>
            <p style='margin:0 0 12px;'>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de StudyWeaver.</p>
            <p style='margin:0;'>Si has sido tú, pulsa el botón para crear una nueva contraseña. Si no, puedes ignorar este correo: tu cuenta seguirá intacta.</p>
        ";
        $note = 'Por seguridad, este enlace caduca en 1 hora. Si caducó, vuelve a solicitar otro desde la pantalla de recuperación.';
        return $this->renderEmail(
            'Restablece tu contraseña',
            $intro,
            'Restablecer contraseña',
            $link,
            $note
        );
    }

    private function getConfirmationEmailTemplate($name, $link) {
        $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        $intro = "
            <p style='margin:0 0 12px;'>¡Hola <strong style='color:#0f172a;'>{$safeName}</strong>!</p>
            <p style='margin:0 0 12px;'>Gracias por registrarte en <strong style='color:#0ea5e9;'>StudyWeaver</strong>. Estás a un paso de convertir tus apuntes en mapas conceptuales y flashcards generadas con IA.</p>
            <p style='margin:0;'>Confirma tu dirección de correo para activar la cuenta:</p>
        ";
        $note = '¿No te has registrado tú? Puedes ignorar este correo y la cuenta nunca se activará.';
        return $this->renderEmail(
            'Confirma tu cuenta',
            $intro,
            'Confirmar mi cuenta',
            $link,
            $note
        );
    }
}
?>
