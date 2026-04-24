<?php
/**
 * tests/_testutil.php — mini-framework de testing sin dependencias.
 *
 * Uso:
 *   $t = new TestRunner('Nombre de la suite');
 *   $t->test('descripción', function () {
 *       assert_equals(2, 1+1);
 *   });
 *   $t->summary();
 *
 * Funciones de aserción disponibles:
 *   - assert_true($cond, $msg=null)
 *   - assert_false($cond, $msg=null)
 *   - assert_equals($expected, $actual, $msg=null)
 *   - assert_contains($needle, $haystack, $msg=null)
 */

class AssertionFailure extends Exception {}

class TestRunner {
    private string $suite;
    private int $passed = 0;
    private int $failed = 0;
    private array $failures = [];

    public function __construct(string $suite) {
        $this->suite = $suite;
        echo "\n== $suite ==\n";
    }

    public function test(string $name, callable $fn): void {
        try {
            $fn();
            $this->passed++;
            echo "  [PASS] $name\n";
        } catch (AssertionFailure $e) {
            $this->failed++;
            $this->failures[] = "$name: " . $e->getMessage();
            echo "  [FAIL] $name\n         " . $e->getMessage() . "\n";
        } catch (Throwable $e) {
            $this->failed++;
            $this->failures[] = "$name: " . get_class($e) . ': ' . $e->getMessage();
            echo "  [ERR ] $name\n         " . $e->getMessage() . "\n";
            echo "         " . $e->getFile() . ':' . $e->getLine() . "\n";
        }
    }

    public function summary(): void {
        $total = $this->passed + $this->failed;
        echo "\nResultados: {$this->passed}/{$total} OK";
        if ($this->failed > 0) {
            echo "  —  {$this->failed} FAIL\n";
            echo "\nFallos:\n";
            foreach ($this->failures as $f) echo "  - $f\n";
            exit(1);
        }
        echo " ✓\n";
    }
}

function assert_true($cond, ?string $msg = null): void {
    if (!$cond) {
        throw new AssertionFailure($msg ?? 'Se esperaba true, se obtuvo ' . var_export($cond, true));
    }
}

function assert_false($cond, ?string $msg = null): void {
    if ($cond) {
        throw new AssertionFailure($msg ?? 'Se esperaba false, se obtuvo ' . var_export($cond, true));
    }
}

function assert_equals($expected, $actual, ?string $msg = null): void {
    if ($expected != $actual) {
        $e = is_scalar($expected) ? var_export($expected, true) : json_encode($expected);
        $a = is_scalar($actual)   ? var_export($actual, true)   : json_encode($actual);
        throw new AssertionFailure(($msg ?? 'No son iguales') . " — esperado=$e, actual=$a");
    }
}

function assert_contains(string $needle, string $haystack, ?string $msg = null): void {
    if (strpos($haystack, $needle) === false) {
        throw new AssertionFailure($msg ?? "'$needle' no encontrado en '" . substr($haystack, 0, 120) . "...'");
    }
}
