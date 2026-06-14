"""
Integration tests for POST /ai/assist — real Gemini API, no mocking.

Verifies that the endpoint returns explanation + generated code for each
node type, maintains conversation context across turns, and handles
missing/invalid input gracefully.
"""
import asyncio
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_condition_node_returns_explanation_and_code():
    resp = client.post("/ai/assist", json={
        "nodeType": "condition",
        "fieldName": "description",
        "conversation": [
            {"role": "user", "content": "return true if the score is above 80"}
        ],
        "context": {},
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "message" in body
    assert "generatedCode" in body
    assert len(body["message"]) > 0
    assert len(body["generatedCode"]) > 0


def test_script_node_returns_python_code():
    resp = client.post("/ai/assist", json={
        "nodeType": "script",
        "fieldName": "description",
        "conversation": [
            {"role": "user", "content": "double every number in a list called numbers"}
        ],
        "context": {},
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "result" in body["generatedCode"] or "=" in body["generatedCode"]


def test_multi_turn_conversation():
    resp = client.post("/ai/assist", json={
        "nodeType": "condition",
        "fieldName": "description",
        "conversation": [
            {"role": "user", "content": "check if user is active"},
            {"role": "assistant", "content": "Here's a condition: result = data['active'] == True"},
            {"role": "user", "content": "also check that the user has a valid email"},
        ],
        "context": {},
    })
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["message"]) > 0


def test_missing_conversation_returns_422():
    resp = client.post("/ai/assist", json={"nodeType": "condition"})
    assert resp.status_code == 422


def test_unknown_node_type_still_responds():
    resp = client.post("/ai/assist", json={
        "nodeType": "unknown_type",
        "fieldName": "description",
        "conversation": [{"role": "user", "content": "help me write something"}],
        "context": {},
    })
    assert resp.status_code == 200
    assert "message" in resp.json()
