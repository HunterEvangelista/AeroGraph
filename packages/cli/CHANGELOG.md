# aerograph

## 0.1.0-alpha.2

### Minor Changes

- 23ae577: Add first-class Node.js 24+ runtime support while retaining Bun as AeroGraph's primary runtime.
  The npm executable now uses a Node.js shebang; Bun users should invoke the package with
  `bunx --bun aerograph`.
  
  This is an operationally breaking change for existing Bun-only alpha installations: after
  upgrading, the plain `aerograph` executable requires Node.js 24 or later. Existing graph files
  and CLI behavior remain compatible and do not require a database migration.

### Patch Changes

- 6292d23: Record privacy-safe local CLI execution outcomes without changing command output or exit behavior.

## 0.1.0-alpha.1

### Patch Changes

- de302e6: Update stale init command output

## 0.1.0-alpha.0

### Minor Changes

- 535f529: Prepare the first public alpha of the AeroGraph CLI.
