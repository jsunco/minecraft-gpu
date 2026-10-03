# status

2026-10-02. target: minecraft java 26.3, vanilla blocks doing all computation.

| part | checked result | still needed |
| --- | --- | --- |
| one-lane register file | 12,872 blocks; 66 jobs, 560 phases, 26,688 directed checks in minecraft | full-file reload/persistence and physical controller |
| arithmetic model | exhaustive ADD/SUB/CMP/MUL and nonzero DIV: 327,424 operations | physical arithmetic and timing |
| four-lane core layout | 997,299 cells and all 1,117 original stores in the current partial composition | external inputs, state transitions, timing and second core |
| memory and shared control layout | 2,192,740 cells; all four address/write bytes and 32 bank READY returns connected | response bytes, remaining controls, both core instances and full timing |

Layout counts overlap and must not be added. The old 10,015,941-cell reference was rejected for compact construction. Smaller checked sections do not establish a finished machine or a completion percentage.

The work order is to finish the complete connected layout, validate novel critical circuits, then assemble the machine and run the original kernels. Final acceptance uses a preserved copy in unmodified Minecraft. No full GPU instruction or kernel has run in-game.

## source layout

- `hardware/`: circuit generators, instruction model and arithmetic models.
- `tests/`: instruction semantics, original-kernel fixtures and arithmetic checks.
- `artifacts/full-gpu-layout-v1/`: current composition, routing and audit source, including historical drafts.
- `scripts/`: offline checks and analysis.
- `reference/tiny-gpu/`: upstream pinned to `02b6c2ce223f606051a6d3a35ca942fbb1dffde2`.
- `tools/minecraft-redstone/`: separate helper repository, pinned as a submodule.

The public snapshot omits about 30 GB of generated maps, private native receipts, live stage executors, saves and local configuration. Full-layout audit recipes need those generated inputs and their manifests; they are not all runnable from this checkout. Historical drafts can retain superseded relative paths. The README commands are the supported standalone checks.

Helper imports now use the submodule rather than a personal machine path. Checks that import helper schemas need `npm ci --ignore-scripts` in `tools/minecraft-redstone`. The model and PC-incrementer commands do not need a running game. Some larger geometry audits also require NumPy/SciPy.

[source-snapshot.json](../source-snapshot.json) records original and exported source hashes. Only helper-path portability, its affected embedded hashes and one source-note attribution were adapted; original frozen receipts do not certify the export. Reported Minecraft results belong to the original recorded fixtures, not a new game run from this repo.
