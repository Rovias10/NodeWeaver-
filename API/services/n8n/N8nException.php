<?php
/**
 * Excepción específica del puente n8n.
 * Conserva el código HTTP y el body crudo para que el controller pueda
 * persistirlo en automations.n8n_sync_error sin tener que reparsear nada.
 */
class N8nException extends RuntimeException {
    private int $httpStatus;
    private string $rawBody;

    public function __construct(string $message, int $httpStatus = 0, string $rawBody = '') {
        parent::__construct($message, $httpStatus);
        $this->httpStatus = $httpStatus;
        $this->rawBody    = $rawBody;
    }

    public function getHttpStatus(): int { return $this->httpStatus; }
    public function getRawBody(): string { return $this->rawBody; }
}
