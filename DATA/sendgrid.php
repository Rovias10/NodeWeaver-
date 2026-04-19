<?php
require_once __DIR__ . '/../backend/vendor/autoload.php';
require_once __DIR__ . '/env.php';
class EmailService {
    private $sendgrid_api_key;
    private $from_email;
    private $from_name;

    public function __construct() {
        $this->sendgrid_api_key = EnvLoader::get('SENDGRID_API_KEY');
        $this->from_email = EnvLoader::get('SENDGRID_FROM_EMAIL', 'noreply@NodeWeaver.com');
        $this->from_name = EnvLoader::get('SENDGRID_FROM_NAME', 'NodeWeaver');
    }

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
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; background-color: #0a0a0f; margin: 0; padding: 40px 0; color: #ffffff; }
                .wrapper { width: 100%; display: table; background-color: #0a0a0f; }
                .container { max-width: 500px; margin: 0 auto; padding: 0; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; background-color: #1e293b; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); overflow: hidden; }
                .header { text-align: center; padding: 30px 20px 20px; }
                .header h2 { margin: 0; background: linear-gradient(to right, #a855f7, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 28px; letter-spacing: -0.5px; }
                .content { padding: 10px 40px 30px; text-align: center; }
                .content p { color: #94a3b8; font-size: 15px; margin-bottom: 25px; line-height: 1.7; }
                .content h3 { color: #f8fafc; font-size: 20px; font-weight: 600; margin-bottom: 15px; }
                .button { background: linear-gradient(to right, #9333ea, #ec4899, #0891b2); color: #ffffff !important; padding: 14px 35px; text-decoration: none; border-radius: 12px; display: inline-block; font-weight: bold; font-size: 16px; margin: 15px 0; box-shadow: 0 10px 15px -3px rgba(168, 85, 247, 0.4); text-transform: none; }
                .footer { text-align: center; color: #475569; font-size: 13px; padding: 20px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class='wrapper'>
                <div class='container'>
                    <div class='header'>
                        <h2>NodeWeaver</h2>
                    </div>
                    <div class='content'>
                        <h3>Hola $name,</h3>
                        <p>Hemos recibido una solicitud para restablecer tu contraseña en recuparación tu cuenta.</p>
                        <a href='$link' class='button'>Restablecer Contraseña</a>
                        <p style='font-size: 13px; margin-top: 20px; color: #64748b;'>Si no solicitaste este cambio, puedes ignorar este email de manera segura.</p>
                    </div>
                </div>
                <div class='footer'>
                    <p>&copy; " . date('Y') . " NodeWeaver. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        ";
    }

    public function sendAccountConfirmation($to_email, $to_name, $verification_token) {
        $email = new \SendGrid\Mail\Mail();
        $email->setFrom($this->from_email, $this->from_name);
        $email->setSubject('Confirmación de cuenta - NodeWeaver');
        $email->addTo($to_email, $to_name);
        
        $confirm_link = "http://localhost/public/pages/auth/confirm-account.html?token=" . $verification_token;
        
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

    private function getConfirmationEmailTemplate($name, $link) {
        return "
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; background-color: #0a0a0f; margin: 0; padding: 40px 0; color: #ffffff; }
                .wrapper { width: 100%; display: table; background-color: #0a0a0f; }
                .container { max-width: 500px; margin: 0 auto; padding: 0; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; background-color: #1e293b; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); overflow: hidden; }
                .header { text-align: center; padding: 30px 20px 20px; }
                .header h2 { margin: 0; background: linear-gradient(to right, #a855f7, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 28px; letter-spacing: -0.5px; }
                .content { padding: 10px 40px 30px; text-align: center; }
                .content p { color: #94a3b8; font-size: 15px; margin-bottom: 25px; line-height: 1.7; }
                .content h3 { color: #f8fafc; font-size: 20px; font-weight: 600; margin-bottom: 15px; }
                .button { background: linear-gradient(to right, #9333ea, #ec4899, #0891b2); color: #ffffff !important; padding: 14px 35px; text-decoration: none; border-radius: 12px; display: inline-block; font-weight: bold; font-size: 16px; margin: 15px 0; box-shadow: 0 10px 15px -3px rgba(168, 85, 247, 0.4); text-transform: none; }
                .footer { text-align: center; color: #475569; font-size: 13px; padding: 20px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class='wrapper'>
                <div class='container'>
                    <div class='header'>
                        <h2>NodeWeaver</h2>
                    </div>
                    <div class='content'>
                        <h3>Hola $name,</h3>
                        <p>¡Gracias por registrarte en NodeWeaver!</p>
                        <p>Estás a un paso de comenzar. Por favor, confirma tu cuenta haciendo clic en el siguiente botón:</p>
                        <a href='$link' class='button'>Confirmar Cuenta</a>
                        <p style='font-size: 13px; margin-top: 20px; color: #64748b;'>Si no has creado una cuenta, puedes ignorar este email.</p>
                    </div>
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