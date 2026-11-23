import pytest
from sse_starlette.sse import AppStatus


@pytest.fixture(autouse=True)
def fresh_sse_exit_event():
    """sse-starlette caches an event bound to one event loop; each TestClient request uses a new loop."""
    AppStatus.should_exit_event = None
    yield
