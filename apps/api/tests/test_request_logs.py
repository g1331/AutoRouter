"""Tests for Request Logs API endpoints."""

from datetime import datetime, timedelta, UTC
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services import request_logger


@pytest.mark.asyncio
async def test_list_request_logs_empty(db_session):
    """Test listing logs when empty."""
    result = await request_logger.list_request_logs(db=db_session)

    assert result.total == 0
    assert result.page == 1
    assert result.total_pages == 1
    assert len(result.items) == 0


@pytest.mark.asyncio
async def test_list_request_logs_pagination(db_session):
    """Test listing logs with pagination."""
    # Create 5 log entries
    for i in range(5):
        await request_logger.log_request(
            db=db_session,
            api_key_id=None,
            upstream_id=None,
            method="POST",
            path=f"/v1/chat/completions/{i}",
            model="gpt-4",
            prompt_tokens=10 + i,
            completion_tokens=20 + i,
            total_tokens=30 + i * 2,
            status_code=200,
            duration_ms=100 + i * 10,
        )
    await db_session.commit()

    # List first page
    result = await request_logger.list_request_logs(db=db_session, page=1, page_size=3)

    assert result.total == 5
    assert result.page == 1
    assert result.page_size == 3
    assert result.total_pages == 2
    assert len(result.items) == 3

    # List second page
    result = await request_logger.list_request_logs(db=db_session, page=2, page_size=3)

    assert result.page == 2
    assert len(result.items) == 2


@pytest.mark.asyncio
async def test_list_request_logs_ordered_by_created_at_desc(db_session):
    """Test that logs are ordered by created_at descending (newest first)."""
    # Create logs with slight time differences
    for i in range(3):
        await request_logger.log_request(
            db=db_session,
            api_key_id=None,
            upstream_id=None,
            method="POST",
            path=f"/path/{i}",
            model="gpt-4",
            prompt_tokens=10,
            completion_tokens=20,
            total_tokens=30,
            status_code=200,
            duration_ms=100,
        )
    await db_session.commit()

    result = await request_logger.list_request_logs(db=db_session)

    # Verify ordering (newest first)
    for i in range(len(result.items) - 1):
        assert result.items[i].created_at >= result.items[i + 1].created_at


@pytest.mark.asyncio
async def test_list_request_logs_filter_by_api_key(db_session):
    """Test filtering logs by API key ID."""
    api_key_id = uuid4()
    other_api_key_id = uuid4()

    # Create logs for different API keys
    await request_logger.log_request(
        db=db_session,
        api_key_id=api_key_id,
        upstream_id=None,
        method="POST",
        path="/v1/chat/completions",
        model="gpt-4",
        prompt_tokens=10,
        completion_tokens=20,
        total_tokens=30,
        status_code=200,
        duration_ms=100,
    )
    await request_logger.log_request(
        db=db_session,
        api_key_id=other_api_key_id,
        upstream_id=None,
        method="POST",
        path="/v1/chat/completions",
        model="gpt-4",
        prompt_tokens=10,
        completion_tokens=20,
        total_tokens=30,
        status_code=200,
        duration_ms=100,
    )
    await db_session.commit()

    # Filter by specific API key
    result = await request_logger.list_request_logs(db=db_session, api_key_id=api_key_id)

    assert result.total == 1
    assert result.items[0].api_key_id == api_key_id


@pytest.mark.asyncio
async def test_list_request_logs_filter_by_upstream(db_session):
    """Test filtering logs by upstream ID."""
    upstream_id = uuid4()
    other_upstream_id = uuid4()

    # Create logs for different upstreams
    await request_logger.log_request(
        db=db_session,
        api_key_id=None,
        upstream_id=upstream_id,
        method="POST",
        path="/v1/chat/completions",
        model="gpt-4",
        prompt_tokens=10,
        completion_tokens=20,
        total_tokens=30,
        status_code=200,
        duration_ms=100,
    )
    await request_logger.log_request(
        db=db_session,
        api_key_id=None,
        upstream_id=other_upstream_id,
        method="POST",
        path="/v1/chat/completions",
        model="claude-3",
        prompt_tokens=10,
        completion_tokens=20,
        total_tokens=30,
        status_code=200,
        duration_ms=100,
    )
    await db_session.commit()

    result = await request_logger.list_request_logs(db=db_session, upstream_id=upstream_id)

    assert result.total == 1
    assert result.items[0].upstream_id == upstream_id


@pytest.mark.asyncio
async def test_list_request_logs_filter_by_status_code(db_session):
    """Test filtering logs by status code."""
    # Create logs with different status codes
    await request_logger.log_request(
        db=db_session,
        api_key_id=None,
        upstream_id=None,
        method="POST",
        path="/v1/chat/completions",
        model="gpt-4",
        prompt_tokens=10,
        completion_tokens=20,
        total_tokens=30,
        status_code=200,
        duration_ms=100,
    )
    await request_logger.log_request(
        db=db_session,
        api_key_id=None,
        upstream_id=None,
        method="POST",
        path="/v1/chat/completions",
        model="gpt-4",
        prompt_tokens=10,
        completion_tokens=0,
        total_tokens=10,
        status_code=400,
        duration_ms=50,
        error_message="Bad request",
    )
    await db_session.commit()

    # Filter by status code 200
    result = await request_logger.list_request_logs(db=db_session, status_code=200)
    assert result.total == 1
    assert result.items[0].status_code == 200

    # Filter by status code 400
    result = await request_logger.list_request_logs(db=db_session, status_code=400)
    assert result.total == 1
    assert result.items[0].status_code == 400


@pytest.mark.asyncio
async def test_list_request_logs_filter_by_time_range(db_session):
    """Test filtering logs by time range."""
    now = datetime.now(UTC)
    one_hour_ago = now - timedelta(hours=1)
    two_hours_ago = now - timedelta(hours=2)

    # Create a log entry
    await request_logger.log_request(
        db=db_session,
        api_key_id=None,
        upstream_id=None,
        method="POST",
        path="/v1/chat/completions",
        model="gpt-4",
        prompt_tokens=10,
        completion_tokens=20,
        total_tokens=30,
        status_code=200,
        duration_ms=100,
    )
    await db_session.commit()

    # Filter with start_time in the past (should find logs)
    result = await request_logger.list_request_logs(db=db_session, start_time=one_hour_ago)
    assert result.total == 1

    # Filter with start_time in the future (should find no logs)
    future = now + timedelta(hours=1)
    result = await request_logger.list_request_logs(db=db_session, start_time=future)
    assert result.total == 0

    # Filter with end_time in the past (should find no logs)
    result = await request_logger.list_request_logs(db=db_session, end_time=two_hours_ago)
    assert result.total == 0


@pytest.mark.asyncio
async def test_list_request_logs_via_admin_endpoint(db_session):
    """Test listing logs via Admin API endpoint."""
    from app.api.routes.admin import list_request_logs as list_logs_endpoint

    # Create a log entry
    await request_logger.log_request(
        db=db_session,
        api_key_id=None,
        upstream_id=None,
        method="POST",
        path="/v1/chat/completions",
        model="gpt-4",
        prompt_tokens=100,
        completion_tokens=200,
        total_tokens=300,
        status_code=200,
        duration_ms=500,
    )
    await db_session.commit()

    # Call endpoint
    result = await list_logs_endpoint(
        page=1,
        page_size=20,
        api_key_id=None,
        upstream_id=None,
        status_code=None,
        start_time=None,
        end_time=None,
        db=db_session,
    )

    assert result.total == 1
    assert result.items[0].model == "gpt-4"
    assert result.items[0].total_tokens == 300


@pytest.mark.asyncio
async def test_list_request_logs_endpoint_invalid_time_format(db_session):
    """Test Admin API endpoint with invalid time format."""
    from app.api.routes.admin import list_request_logs as list_logs_endpoint

    with pytest.raises(HTTPException) as exc_info:
        await list_logs_endpoint(
            page=1,
            page_size=20,
            api_key_id=None,
            upstream_id=None,
            status_code=None,
            start_time="invalid-time",
            end_time=None,
            db=db_session,
        )

    assert exc_info.value.status_code == 400
    assert "Invalid start_time format" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_list_request_logs_endpoint_with_iso_time(db_session):
    """Test Admin API endpoint with valid ISO time format."""
    from app.api.routes.admin import list_request_logs as list_logs_endpoint

    # Create a log entry
    await request_logger.log_request(
        db=db_session,
        api_key_id=None,
        upstream_id=None,
        method="POST",
        path="/v1/chat/completions",
        model="gpt-4",
        prompt_tokens=10,
        completion_tokens=20,
        total_tokens=30,
        status_code=200,
        duration_ms=100,
    )
    await db_session.commit()

    # Call endpoint with ISO time
    now = datetime.now(UTC)
    one_hour_ago = (now - timedelta(hours=1)).isoformat()

    result = await list_logs_endpoint(
        page=1,
        page_size=20,
        api_key_id=None,
        upstream_id=None,
        status_code=None,
        start_time=one_hour_ago,
        end_time=None,
        db=db_session,
    )

    assert result.total == 1
