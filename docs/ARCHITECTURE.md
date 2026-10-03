# architecture

Reference: [tiny-gpu at 02b6c2c](https://github.com/adam-maj/tiny-gpu/tree/02b6c2ce223f606051a6d3a35ca942fbb1dffde2). The target preserves program behavior; Minecraft clocks and internal circuits can differ from the HDL.

| resource | target |
| --- | --- |
| execution | two independently scheduled cores, four physical lanes per core |
| lane state | 8-bit data, sixteen register addresses, per-lane arithmetic/comparison/load-store state |
| control | shared instruction and PC within each core |
| program memory | 256 x 16 bits, one request channel |
| data memory | 256 x 8 bits, four request channels |
| dispatch | 8-bit thread count, block assignment, core reuse, start/reset/done |

R0–R12 are writable; R0 is not a zero register. R13 is block index, R14 is 4, R15 is lane index 0–3. Writes to R13–R15 are ignored. A final partial block enables only its active lanes. Registers reset on core reuse; global memory remains.

## instructions

Words are 16 bits: opcode `[15:12]`, destination `[11:8]`, source `[7:4]`, second source `[3:0]`, immediate `[7:0]`, branch mask `[11:9]`. Unused fields are ignored.

| opcode | instruction | effect |
| --- | --- | --- |
| 0 | NOP | advance PC |
| 1 | BRnzp #i | branch to absolute i if a requested comparison flag is set |
| 2 | CMP Rs,Rt | set unsigned less/equal/greater flags |
| 3 | ADD Rd,Rs,Rt | add modulo 256 |
| 4 | SUB Rd,Rs,Rt | subtract modulo 256 |
| 5 | MUL Rd,Rs,Rt | multiply modulo 256 |
| 6 | DIV Rd,Rs,Rt | unsigned integer quotient, nonzero divisor |
| 7 | LDR Rd,Rs | load from the address in Rs |
| 8 | STR Rs,Rt | store Rt at the address in Rs |
| 9 | CONST Rd,#i | load eight immediate bits |
| F | RET | finish this core's block |

PC advances modulo 256 except on a taken branch or RET. Only CMP changes flags. All active lanes in one core must agree on the next PC; divergent execution is unsupported. Reserved opcodes A–E have the pinned decoder's NOP-like effect, although the software model defaults to rejecting them unless enabled explicitly.

Read operands before writeback, including instructions that overwrite their own source register. Memory responses must close before their ready acknowledgement; requests and owners must remain distinct until completion. Inactive lanes cannot issue memory writes or affect the chosen PC.

## deliberate differences

CMP uses the original unsigned operands to produce N/Z/P in branch-mask order; it corrects the pinned RTL's comparison behavior. The model can expose the original expression for comparison. Partial-block PC selection must use an active lane. Division by zero has no numeric result in the reference contract; a physical fault/halt policy remains an integration obligation.

Hold thread count fixed during a run. Reset, load program/data, set thread count, raise start, wait for all blocks to finish, lower start, then reset before another launch. Zero threads should complete without dispatch. The original addition and matrix-multiplication fixtures are retained for verification.

Software may generate blocks and compare expected answers. The finished machine must fetch, compute, store, branch and dispatch in redstone; the host cannot act as its live ALU, RAM or controller.
