<?php
/**
 * tests/run.php — ejecuta toda la suite.
 *
 * Uso:
 *   php tests/run.php          # todos
 *   php tests/run.php parser   # solo parser
 *   php tests/run.php e2e      # solo E2E
 */

$only = $argv[1] ?? null;

$runs = [];
if ($only === null || $only === 'parser') $runs[] = 'ParserTest.php';
if ($only === null || $only === 'e2e')    $runs[] = 'E2ETest.php';

$failed = 0;
foreach ($runs as $file) {
    $path = __DIR__ . '/' . $file;
    echo "\n>>> Running $file\n";
    // Lanzamos cada test en un proceso hijo para que `exit` de un failing
    // test no detenga a los siguientes.
    $phpBin = defined('PHP_BINARY') ? PHP_BINARY : 'php';
    $cmd = escapeshellarg($phpBin) . ' ' . escapeshellarg($path);
    passthru($cmd, $code);
    if ($code !== 0) $failed++;
}

echo "\n=================================\n";
echo ($failed === 0) ? "Toda la suite OK\n" : "$failed suite(s) con fallos\n";
exit($failed === 0 ? 0 : 1);
