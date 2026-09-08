---
"aerograph": minor
---

Add first-class Node.js 24+ runtime support while retaining Bun as AeroGraph's primary runtime.
The npm executable now uses a Node.js shebang; Bun users should invoke the package with
`bunx --bun aerograph`.

This is an operationally breaking change for existing Bun-only alpha installations: after
upgrading, the plain `aerograph` executable requires Node.js 24 or later. Existing graph files
and CLI behavior remain compatible and do not require a database migration.
