"""
Tests for the Python sandbox execution module.

Safe execution tests verify inputs are injected and results are returned.
Security tests verify that dangerous stdlib imports are blocked.
Timeout test verifies infinite loops are terminated.
"""
import pytest
from engine.sandbox import run_sandboxed, SandboxError


def test_simple_assignment():
    assert run_sandboxed("result = 'hello'", {}) == "hello"


def test_input_variable_injection():
    assert run_sandboxed("result = x + 1", {"x": 5}) == 6


def test_multiple_inputs():
    code = "result = a + b"
    assert run_sandboxed(code, {"a": 10, "b": 20}) == 30


def test_dict_result():
    code = "result = {'key': value}"
    assert run_sandboxed(code, {"value": 42}) == {"key": 42}


def test_print_does_not_break_result():
    code = "print('hello'); result = 'done'"
    assert run_sandboxed(code, {}) == "done"


def test_os_import_blocked():
    with pytest.raises(SandboxError, match="blocked"):
        run_sandboxed("import os; os.system('rm -rf /')", {})


def test_subprocess_import_blocked():
    with pytest.raises(SandboxError, match="blocked"):
        run_sandboxed("import subprocess; subprocess.run(['ls'])", {})


def test_sys_import_blocked():
    with pytest.raises(SandboxError, match="blocked"):
        run_sandboxed("import sys; sys.exit(0)", {})


def test_socket_import_blocked():
    with pytest.raises(SandboxError, match="blocked"):
        run_sandboxed("import socket; socket.gethostname()", {})


def test_infinite_loop_timeout():
    with pytest.raises(SandboxError, match="timed out"):
        run_sandboxed("while True: pass", {}, timeout=2)


def test_syntax_error_raises_sandbox_error():
    with pytest.raises(SandboxError, match="SyntaxError"):
        run_sandboxed("def broken(:", {})


def test_no_result_variable_raises_sandbox_error():
    with pytest.raises(SandboxError, match="result"):
        run_sandboxed("x = 5", {})
