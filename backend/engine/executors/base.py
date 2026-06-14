"""
ExecutorBase — abstract base class for all node executors.

Every node type has exactly one executor. The executor:
  1. Receives a node instance (its ID, type, and data/field values)
  2. Receives the shared ExecutionContext
  3. Yields SSEEvent dicts as side-effects (via context.emit())
  4. Returns the node's output dict, keyed by handle ID

The output dict shape:  { handle_id: value, "dataType": str }
For nodes with multiple outputs:  { handle1_id: value1, handle2_id: value2, "dataType": str }
If a node has only one meaningful output, "value" is a common key, but the actual
handle ID is what matters for get_input() resolution.

Executors are async. Even executors with no I/O (like TemplateExecutor) are async
because:
  a) They emit events via await ctx.emit()
  b) Phase 7 will convert LLMExecutor to stream tokens — keeping the base async
     avoids a refactor at that point.

SuspendExecution is a control-flow exception (not an error). The engine catches it
and transitions the run to "suspended" state.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import AsyncGenerator

from engine.context import ExecutionContext
from engine.events import SSEEvent


class SuspendExecution(Exception):
    """
    Raised by InputExecutor to halt execution at a pause gate.

    Carries the suspension context that will be stored in the run record and
    sent to the client app's notification webhook.
    """
    def __init__(self, node_id: str, prompt: str, notify_url: str, callback_token: str):
        self.node_id = node_id
        self.prompt = prompt
        self.notify_url = notify_url
        self.callback_token = callback_token
        super().__init__(f"Execution suspended at node {node_id!r}")


class ExecutorBase(ABC):
    """
    Abstract base for all node executors.

    Subclasses implement `execute()`, which emits events and returns the output dict.
    The engine calls `run()` (the public wrapper) which handles timing and common events.
    """

    @abstractmethod
    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        """
        Run the node logic.

        Args:
            node: The node instance — {id, type, data: {field_name: value, ...}}
            ctx:  The shared execution context

        Returns:
            Output dict: {handle_id: output_value, ..., "dataType": str}
            The "dataType" key indicates the primary output's type.
            If a node produces multiple typed outputs on different handles,
            the executor stores them all and the "dataType" reflects the primary one.

        May raise:
            SuspendExecution — for Input nodes (suspend flow, not an error)
            Exception — for real executor errors (engine transitions to error state)
        """
        ...
