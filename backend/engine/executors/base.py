"""
ExecutorBase — abstract base class for all node executors.

Every node type has exactly one executor. The executor:
  1. Receives a node instance
  2. Receives the shared ExecutionContext
  3. Emits events via context.emit()
  4. Returns the node's output dict, keyed by handle ID
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import AsyncGenerator

from engine.context import ExecutionContext
from engine.events import SSEEvent


class SuspendExecution(Exception):
    """
    Raised by InputExecutor to halt execution at a pause gate.
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
    """

    @abstractmethod
    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        """
        Run the node logic.

        Args:
            node: The node instance
            ctx:  The shared execution context

        Returns:
            Output dict: {handle_id: output_value, ..., "dataType": str}
        """
        ...
