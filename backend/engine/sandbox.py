"""
Sandboxed Python code execution via subprocess.

run_sandboxed() runs user code in an isolated child process with:
  - Dangerous stdlib imports blocked (os, sys, subprocess, socket, ...)
  - Wall-clock timeout enforced by subprocess.run(timeout=N)
  - CPU and memory limits set via resource.setrlimit inside the child

Protocol: inputs arrive as a JSON payload file (argv[1]); the result is written
to a separate result file (argv[2]). User code's stdout is silently captured but
not used — only the result file matters. This separation means print() in user
code does not corrupt the sandbox protocol.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path
from typing import Any


class SandboxError(Exception):
    pass


_BLOCKED_MODULES = frozenset({
    "os", "sys", "subprocess", "shutil", "pathlib",
    "importlib", "ctypes", "socket", "threading", "multiprocessing",
    "signal", "mmap", "gc", "weakref", "pickle", "shelve",
    "urllib", "http", "ftplib", "telnetlib", "smtplib",
    "pty", "tty", "termios", "select", "selectors",
    "fcntl", "grp", "pwd", "nis",
    "syslog", "sysconfig", "distutils", "venv", "ensurepip",
    "runpy", "zipimport", "zipapp", "_thread",
})

# This script runs inside the child subprocess. String-formatted once at call
# time to embed the blocked-module set as a literal Python frozenset expression.
_RUNNER_TEMPLATE = textwrap.dedent("""\
    import sys
    import json
    import builtins
    import resource

    _BLOCKED = {blocked_set!r}
    _original_import = builtins.__import__

    def _safe_import(name, *args, **kwargs):
        root = name.split(".")[0]
        if root in _BLOCKED:
            raise ImportError(f"import '{{name}}' is blocked in sandbox")
        return _original_import(name, *args, **kwargs)

    builtins.__import__ = _safe_import

    try:
        resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    except Exception:
        pass

    def _write_result(data, path):
        with open(path, "w") as f:
            json.dump(data, f)

    with open(sys.argv[1]) as f:
        _payload = json.load(f)

    _result_path = sys.argv[2]
    _globals = dict(_payload["inputs"])

    try:
        exec(compile(_payload["code"], "<sandbox>", "exec"), _globals)
    except Exception as e:
        _write_result({{"error": f"{{type(e).__name__}}: {{e}}"}}, _result_path)
        sys.exit(0)

    if "result" not in _globals:
        _write_result({{"error": "code did not assign a 'result' variable"}}, _result_path)
        sys.exit(0)

    try:
        _write_result({{"result": _globals["result"]}}, _result_path)
    except (TypeError, ValueError) as e:
        _write_result({{"error": f"result is not JSON-serialisable: {{e}}"}}, _result_path)
""")


def run_sandboxed(code: str, inputs: dict, timeout: int = 5) -> Any:
    """
    Executes `code` in an isolated subprocess with `inputs` injected as named variables.

    Returns the value assigned to `result` inside the code.
    Raises SandboxError on: timeout, blocked import, syntax error, missing result variable.
    """
    runner_src = _RUNNER_TEMPLATE.format(blocked_set=_BLOCKED_MODULES)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        runner_path = tmp / "runner.py"
        payload_path = tmp / "payload.json"
        result_path = tmp / "result.json"

        runner_path.write_text(runner_src)
        payload_path.write_text(json.dumps({"code": code, "inputs": inputs}))

        try:
            subprocess.run(
                [sys.executable, str(runner_path), str(payload_path), str(result_path)],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            raise SandboxError(f"code timed out after {timeout}s")

        if not result_path.exists():
            raise SandboxError("sandbox process crashed before writing a result")

        payload = json.loads(result_path.read_text())

        if "error" in payload:
            raise SandboxError(payload["error"])

        return payload["result"]
