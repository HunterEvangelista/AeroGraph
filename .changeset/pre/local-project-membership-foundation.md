---
"aerograph": patch
---

Add schema v7 project identities and many-to-many entity memberships, with transaction-bound persistence, idempotent attachment, and non-destructive detachment. Verify the schema-version stamp inside the upgrade transaction so a suppressed stamp cannot leave a partially upgraded graph.

This is a storage foundation only: existing database locations and CLI retrieval behavior remain unchanged. Upgrades add empty project/membership tables without importing the project registry or inferring memberships. Repository registration, scoped CLI queries, and consolidation into one local graph require separate implementation slices. Older executables that only support schema v6 cannot open an upgraded database.
