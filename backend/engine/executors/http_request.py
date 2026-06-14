"""
HTTPExecutor — makes async HTTP requests via httpx.

Reads configuration from node data:
  url     — required
  method  — HTTP verb
  headers — extra request headers
  params  — URL query parameters
  body    — request body
  timeout — seconds before the request is abandoned
"""
from __future__ import annotations

import httpx

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase


class HTTPExecutor(ExecutorBase):
    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)

        url = data.get("url") or data.get("baseUrl")
        if not url:
            return {"error": "url is required", "value": None, "dataType": "error"}

        method = data.get("method", "GET").upper()
        headers = data.get("headers") or {}
        params = data.get("params") or {}
        body = data.get("body")
        timeout = float(data.get("timeout", 30))

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    params=params,
                    json=body if body is not None else None,
                    timeout=timeout,
                )
                resp.raise_for_status()
        except httpx.RequestError as e:
            return {"error": str(e), "value": None, "dataType": "error"}
        except httpx.HTTPStatusError as e:
            return {
                "error": f"HTTP {e.response.status_code}: {e.response.text[:200]}",
                "status": e.response.status_code,
                "value": None,
                "dataType": "error",
            }

        try:
            response_body = resp.json()
            data_type = "json"
        except ValueError:
            response_body = resp.text
            data_type = "string"

        return {
            "response": response_body,
            "value": response_body,
            "dataType": data_type,
            "status": resp.status_code,
        }
