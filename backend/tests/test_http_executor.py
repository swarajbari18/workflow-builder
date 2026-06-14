"""
Tests for HTTPExecutor — verifies real httpx requests go out and responses land correctly.

We use unittest.mock.patch to intercept httpx.AsyncClient.request at the transport level
rather than installing respx (not in venv), keeping the test deterministic without a network.
"""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from engine.context import ExecutionContext
from engine.executors.http_request import HTTPExecutor


def _ctx(node_id: str, data: dict) -> ExecutionContext:
    return ExecutionContext(
        run_id="r1",
        workflow_id="w1",
        graph={"nodes": [{"id": node_id, "type": "api_request", "data": data}], "edges": []},
    )


def _node(node_id: str, data: dict) -> dict:
    return {"id": node_id, "type": "api_request", "data": data}


def _mock_response(status: int, body: dict | str) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status
    resp.raise_for_status = MagicMock()
    if isinstance(body, dict):
        resp.json.return_value = body
        resp.text = json.dumps(body)
    else:
        resp.json.side_effect = ValueError("not json")
        resp.text = body
    return resp


def test_get_request_returns_json_response():
    data = {"url": "https://api.example.com/data", "method": "GET"}
    ctx = _ctx("n1", data)
    mock_resp = _mock_response(200, {"id": 1, "name": "Alice"})

    with patch("httpx.AsyncClient.request", new=AsyncMock(return_value=mock_resp)):
        output = asyncio.run(HTTPExecutor().execute(_node("n1", data), ctx))

    assert output["response"] == {"id": 1, "name": "Alice"}
    assert output["value"] == {"id": 1, "name": "Alice"}
    assert output["dataType"] == "json"
    assert output["status"] == 200


def test_post_with_body():
    data = {
        "url": "https://api.example.com/items",
        "method": "POST",
        "body": {"name": "Widget"},
    }
    ctx = _ctx("n1", data)
    mock_resp = _mock_response(201, {"id": 99})

    with patch("httpx.AsyncClient.request", new=AsyncMock(return_value=mock_resp)) as mock_req:
        output = asyncio.run(HTTPExecutor().execute(_node("n1", data), ctx))

    call_kwargs = mock_req.call_args.kwargs
    assert call_kwargs["method"] == "POST"
    assert output["status"] == 201


def test_plain_text_response_falls_back_gracefully():
    data = {"url": "https://api.example.com/ping", "method": "GET"}
    ctx = _ctx("n1", data)
    mock_resp = _mock_response(200, "pong")

    with patch("httpx.AsyncClient.request", new=AsyncMock(return_value=mock_resp)):
        output = asyncio.run(HTTPExecutor().execute(_node("n1", data), ctx))

    assert output["response"] == "pong"
    assert output["dataType"] == "string"


def test_http_error_returns_error_key():
    import httpx
    data = {"url": "https://api.example.com/missing", "method": "GET"}
    ctx = _ctx("n1", data)

    with patch(
        "httpx.AsyncClient.request",
        new=AsyncMock(side_effect=httpx.RequestError("connection refused")),
    ):
        output = asyncio.run(HTTPExecutor().execute(_node("n1", data), ctx))

    assert "error" in output
    assert output["dataType"] == "error"


def test_missing_url_returns_error():
    data = {"method": "GET"}
    ctx = _ctx("n1", data)
    output = asyncio.run(HTTPExecutor().execute(_node("n1", data), ctx))
    assert "error" in output
    assert output["dataType"] == "error"
