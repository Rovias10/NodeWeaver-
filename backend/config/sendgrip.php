<?php
require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/env.php';
class EmailService {
    private $sendgrid_api_key = 'TU_API_KEY_DE_SENDGRID';
    private $from_email = 'noreply@NodeWeaver.com';
    private $from_name = 'NodeWeaver';

    public function sendPasswordReset($to_email, $to_name, $reset_token) {
        $email = new \SendGrid\Mail\Mail();
        $email->setFrom($this->from_email, $this->from_name);
        $email->setSubject('Recuperación de contraseña - NodeWeaver');
        $email->addTo($to_email, $to_name);
        
        $reset_link = "http://localhost/public/pages/auth/reset-password.html?token=" . $reset_token;
        
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

    private function getResetEmailTemplate($name, $link) {
        return "
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
                .footer { margin-top: 20px; text-align: center; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class='container'>
                <div class='header'>
                    <h2>NodeWeaver</h2>
                </div>
                <div class='content'>
                    <h3>Hola $name,</h3>
                    <p>Hemos recibido una solicitud para restablecer tu contraseña en NodeWeaver.</p>
                    <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
                    <a href='$link' class='button'>Restablecer Contraseña</a>
                    <p>Si no solicitaste este cambio, puedes ignorar este email.</p>
                    <p>El enlace expirará en 1 hora.</p>
                </div>
                <div class='footer'>
                    <p>&copy; " . date('Y') . " NodeWeaver. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        ";
    }
}
?>