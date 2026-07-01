# Scorer test fixtures

Real payloads from the public `vcpp.stldata.org/parcel_data/{ParcelId}` endpoint
(open CORS, no auth — the same data `src/scoring/cityData.ts` fetches client-side),
captured 2026-06-30 for four parcels spanning the score bands the scorer produces:

| File | ParcelId | Type | Notable |
| --- | --- | --- | --- |
| `single-family-very-likely.json` | 44779475000 | Single-Family | active permits + violations |
| `commercial-very-likely.json` | 15639050000 | Commercial | heavy tax delinquency |
| `multi-unit-boardups.json` | 30049090000 | Multi-Unit | repeated board-ups (1/n decay path) |
| `single-family-not-vacant.json` | 37539150000 | Single-Family | long, mostly-quiet history |

These contain city permit/inspection/tax/service-request records tied to a
property address — public records, not individual case data. They are
unrelated to the LSEM legal-aid case data used elsewhere in this project,
which is always fictional sample data.

`scoreAndTimeline.test.ts` pins `now` to a fixed timestamp so results stay
deterministic — these are characterization tests (they lock in the port's
current behavior), not a live fidelity check against city data.
