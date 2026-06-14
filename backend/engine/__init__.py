"""
Execution engine package.

Public surface for Phase 6 callers (main.py):
  from engine.engine import execute_pipeline
  from engine.events import SSEEvent

Internal structure:
  context.py   — ExecutionContext dataclass
  events.py    — SSEEvent and all event constructors
  engine.py    — top-level execute_pipeline coroutine
  executors/   — one module per execution.kind
"""
