# Music generation stall, September 24, 2026

Production was inspected read-only. Both application services were healthy, and
the host was lightly loaded. The only stalled creation observed was **Rival Rows**,
project `c26007802db2f3b208ec6634`.

Its original turn `f49d86ccb8de09beca867f06` started at 03:58:28 UTC on September 25.
The brief, sprite, and icon finished; music remained on its first attempt from
03:59:15 until the creator cancelled the turn at 04:13:03. No coding sandbox had
been allocated for that turn. The app did not record the response ID/status, so
the evidence cannot distinguish provider queuing from slow model execution.

The creator retried at 04:13:06. The existing checkpoint preserved the exact art
and brief; the new music request completed in 20 seconds. The retry became ready
at 04:16:13 after independent game validation: 186.49 seconds total. No production
restart, database edit, or manual retry was performed during the investigation.

## Cause and local fix

The 60-second HTTP timeout applies independently to each background status poll.
It does not bound the overall background music request. With no music-specific
deadline, a pending response can consume the entire 15-minute creation budget,
preventing the existing second music attempt and code generation from running.

Music requests now have a 120-second deadline. Expiry cancels the background
response using a separate bounded request, then the existing two-attempt loop
tries once more under the unchanged overall budget. Parent cancellation still
stops the whole turn. Finished media stays pinned. Brief/model routing is unchanged.
This follows the documented [background cancellation API](https://developers.openai.com/api/docs/guides/background).

Regression tests cover cancellation without an already-aborted request signal,
phase expiry without cancelling the parent turn, and the actual generation pipeline
recovering from stalled background music without regenerating the art or brief.
The tests use controlled provider responses and a fake clock; they do not claim
that the original provider-side delay was reproduced live.

The fix is local and has not been deployed. Read-only production status evidence
is retained under `artifacts/player-ownership/`.
