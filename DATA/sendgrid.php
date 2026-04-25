<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/env.php';

/**
 * Servicio de envío de correos transaccionales con SendGrid.
 *
 * Tras el rediseño de NodeWeaver → StudyWeaver:
 *   - Las URLs de los enlaces apuntan a la SPA React (Vite). Por defecto
 *     localhost:5173 en desarrollo. Cuando se despliegue en cloud habrá
 *     que definir FRONTEND_BASE_URL en .env.
 *   - El branding y la paleta de las plantillas pasan a StudyWeaver
 *     ("Cielo Claro": fondo paper, marca sky-500, acento coral).
 *   - El asunto y el copy hablan de estudio, no de automatización.
 */
class EmailService {
    private $sendgrid_api_key;
    private $from_email;
    private $from_name;
    private $frontend_base;

    public function __construct() {
        $this->sendgrid_api_key = EnvLoader::get('SENDGRID_API_KEY');
        $this->from_email = EnvLoader::get('SENDGRID_FROM_EMAIL', 'noreply@studyweaver.com');
        $this->from_name  = EnvLoader::get('SENDGRID_FROM_NAME', 'StudyWeaver');
        // Base de la SPA. Permite cambiar el host sin tocar este archivo.
        // Quitamos cualquier trailing slash para evitar URLs con dobles "/".
        $this->frontend_base = rtrim(EnvLoader::get('FRONTEND_BASE_URL', 'http://localhost:5173'), '/');
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
     * Devuelve el HTML para una notificación con paleta veraniega
     * "Cielo Claro" (sky / sun / coral sobre fondo paper).
     * Encabezado, cuerpo y CTA reciben el contenido por parámetros para
     * reutilizar la misma maqueta en distintos correos.
     */
    private function renderEmail($title, $bodyHtml, $ctaLabel, $ctaLink) {
        return "
        <!DOCTYPE html>
        <html lang='es'>
        <head>
            <meta charset='utf-8' />
            <style>
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; background-color: #f6fbff; margin: 0; padding: 40px 0; color: #0f172a; }
                .wrapper { width: 100%; display: table; background-color: #f6fbff; }
                .container { max-width: 520px; margin: 0 auto; padding: 0; border: 1px solid rgba(14,165,233,0.18); border-radius: 20px; background-color: #ffffff; box-shadow: 0 10px 40px -10px rgba(14,165,233,0.18); overflow: hidden; }
                .header { text-align: center; padding: 32px 20px 16px; }
                .header h2 { margin: 0; background: linear-gradient(to right, #0284c7, #0ea5e9, #fb7185); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 28px; letter-spacing: -0.5px; }
                .content { padding: 8px 40px 32px; text-align: center; }
                .content h3 { color: #0f172a; font-size: 20px; font-weight: 600; margin-bottom: 12px; }
                .content p { color: #475569; font-size: 15px; margin: 0 0 18px; line-height: 1.7; }
                .button { background: linear-gradient(to right, #0ea5e9, #3aa8fa, #fcd34d); color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 12px; display: inline-block; font-weight: bold; font-size: 16px; margin: 12px 0 4px; box-shadow: 0 10px 24px -6px rgba(14,165,233,0.45); }
                .footer { text-align: center; color: #94a3b8; font-size: 12px; padding: 18px; }
            </style>
        </head>
        <body>
            <div class='wrapper'>
                <div class='container'>
                    <div class='header'>
                        <h2>StudyWeaver</h2>
                    </div>
                    <div class='content'>
                        <h3>" . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . "</h3>
                        " . $bodyHtml . "
                        <a href='" . htmlspecialchars($ctaLink, ENT_QUOTES, 'UTF-8') . "' class='button'>" . htmlspecialchars($ctaLabel, ENT_QUOTES, 'UTF-8') . "</a>
                    </div>
                </div>
                <div class='footer'>
                    &copy; " . date('Y') . " StudyWeaver · Proyecto Final DAW
                </div>
            </div>
        </body>
        </html>
        ";
    }

    private function getResetEmailTemplate($name, $link) {
        $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        $body = "
            <p>Hola $safeName,</p>
            <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de StudyWeaver. Si has sido tú, pulsa el botón para crear una nueva.</p>
            <p style='font-size: 13px; color: #94a3b8;'>El enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.</p>
        ";
        return $this->renderEmail('Restablece tu contraseña', $body, 'Restablecer contraseña', $link);
    }

    private function getConfirmationEmailTemplate($name, $link) {
        $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        $body = "
            <p>Hola $safeName,</p>
            <p>¡Gracias por registrarte en <strong>StudyWeaver</strong>! Estás a un paso de empezar a estudiar con mapas conceptuales y flashcards generadas por IA.</p>
            <p>Confirma tu cuenta para activar todas las funciones:</p>
        ";
        return $this->renderEmail('Confirma tu cuenta', $body, 'Confirmar cuenta', $link);
    }
}
?>
