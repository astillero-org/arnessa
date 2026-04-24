from arnessa.deps import ArnessaEvent
from arnessa.publish import _protocol_events_from_arnessa


def test_state_changed_maps_to_state_snapshot_and_custom_event():
    events = _protocol_events_from_arnessa(
        ArnessaEvent(
            kind="state_changed",
            payload={"state": {"count": 3}, "writable_fields": ["count"]},
            session_id="s1",
            timestamp=123.456,
        )
    )

    assert len(events) == 2
    assert events[0]["type"] == "STATE_SNAPSHOT"
    assert events[0]["snapshot"] == {"count": 3}
    assert events[1]["type"] == "CUSTOM"
    assert events[1]["name"] == "arnessa.stateChanged"
    assert events[1]["value"]["writable_fields"] == ["count"]


def test_tool_deferred_maps_to_namespaced_custom_event():
    events = _protocol_events_from_arnessa(
        ArnessaEvent(
            kind="tool_deferred",
            payload={"call_id": "c1", "tool_name": "wait_for_human"},
            session_id="s1",
            timestamp=123.456,
        )
    )

    assert events == [
        {
            "type": "CUSTOM",
            "name": "arnessa.toolDeferred",
            "value": {"call_id": "c1", "tool_name": "wait_for_human"},
            "timestamp": 123456,
        }
    ]
