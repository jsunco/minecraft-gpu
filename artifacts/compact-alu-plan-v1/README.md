# Compact per-lane ALU: count the selectors before choosing serial

Offline proposal, 2026-09-29. **Prototype a compact selector plus one serial feedback slice next; do not replicate the old byte ALU yet.** A one-bit arithmetic engine is a plausible area saving only if its shift/load selectors and staged storage are compact. Nothing here is placed, routed as a complete lane, or speed-validated. The existing register file, eight-lane target, ISA and frozen arithmetic evidence remain unchanged.

The [contract](../../docs/ARCHITECTURE_CONTRACT.md) requires eight physical ALUs, one per lane. Each lane keeps its own operands, working data, carry, flags and result. Only the common operation/phase/round controls may be shared by the four lanes of one core. The other core needs independent controls. A/B remain closed from REQUEST through UPDATE; the result does not overwrite a source while execution is in progress. Only CMP writes architectural N/Z/P. Protected-destination suppression remains in the register controller.

## What the existing hardware actually costs

Counts are regenerated from the frozen generators/saved maps in [costs-and-sources.json](costs-and-sources.json), which binds 17 source/evidence files. No upstream arithmetic tests were rerun.

| Reusable reference | Non-air blocks | Scope |
|---|---:|---|
| Older byte ADD | 13,895 | Native 40 vectors / 34 distinct pairs; lamps, carry-in zero |
| Compact bare byte ADD | 8,418 | Native six suites; no subtract conditioner or flag storage |
| Compact byte ADD/SUB/CMP | 10,637 | Native 114 executions / 84 distinct triples, 228 phases |
| Compact one-bit full adder | 750 | Native 19 cases; includes its 550-cell floor |
| Dense eight-bit word | 174 | Native storage primitive; no shift/load mux or independent reset |
| Old eight-bit 2:1 selector | 1,737 | Exact generated-plan count; not a compact integrated selector |

The accepted byte mode module occupies 64×9×239 = 137,664 cells and includes 401 repeaters, 65 comparators, 2,410 dust, 6,081 lime floor blocks and 1,661 other concrete blocks. The floor accounts for much of its cost, but is not all safely removable: supports and powered-block paths must be retained and rechecked. Removing floor blocks is not a demonstrated density optimization. The one-bit adder occupies 25×6×22, has 25 repeaters and six comparators. Its observed 21-tick final output delay cannot be compared as a clock ratio with the byte's 177-tick arithmetic / 203-tick flag observations: stimuli, routing and loads differ. None transfers to feedback timing.

Use the stage-4 allocation of W/M/Q plus W'/M'/Q': **48 work bits = six dense words = 1,044 blocks**, before selector adapters, reset and inter-bank routes. W' can hold the final result. Both alternatives also need auxiliary state and physical control. Literal reuse of ten old byte selectors costs **17,370 blocks per lane**. Thus:

- Byte-parallel iterative lane: `10,637 + 1,044 + 17,370 = 29,051`, before extra control/routes.
- One-bit serial iterative lane: `750 + 1,044 + 17,370 = 19,164`, before conditioning, carry/zero/take state and extra control/routes.

These are literal reuse subtotals, not complete build estimates. The serial choice removes seven arithmetic cells and their carry bridges, but still needs selection and storage. It does not give an eightfold area saving. Conversely, comparing a newly packed serial design only against the old full-floor parallel fixture would exaggerate the advantage: the parallel design can use compact storage/selectors too.

## Concrete serial datapath, with fixed work counts

Use the established comparator full-adder logic once **in each lane**. Its inputs are W[0], a physical conditioned M[0], and a stored carry C. For one bit step:

```text
(s, c) = full_adder(W[0], conditioned_M0, C)
W'     = {s, W[7:1]}              # shift right, new sum enters bit 7
M'     = {M[0], M[7:1]}           # rotate right, not destructive shift
C'     = c
```

Capture next while current banks are locked; close next and verify closure before committing current. After eight such commits, W contains the byte sum and M has returned to its original value. This is physical fixed wiring and latches, not a host supplying serial bits. A current→adder→current transparent loop is forbidden.

- **ADD/SUB/CMP:** initialize W=A, M=B; eight bit commits. SUB/CMP physically XOR M[0] with subtract and initialize C=1 once per byte; ADD starts C=0. Accumulate `NZ' = NZ OR s` with current/next latches. After bit 7, CMP captures `N=!C, Z=!NZ, P=C AND NZ`; never infer unsigned ordering from W[7]. Arithmetic leaves architectural flags unchanged.
- **MUL:** initialize W=0, M=A, Q=B. Hold Q throughout each eight-bit pass. Enable M[0] only when held Q[0]=1, otherwise add zero. Then shift M left once (discard overflow), shift Q right once, and repeat exactly eight outer rounds. **64 arithmetic bit commits**, plus outer shifts and initialization/finalization. This realizes the same W/M/Q recurrence as [the existing model](../../hardware/iterative_arithmetic_model.py).
- **DIV:** initialize W=0, M=B, Q=A. Before each outer round, retain old W[7] as T8 and set W to `{W[6:0], Q[7]}` while Q remains held. Perform eight serial subtraction steps, then latch `take = T8 OR C`. Perform another eight steps adding M back only if take=0, otherwise adding zero; carry starts at zero for this restore pass. M rotates back after each pass. Finally set Q to `{Q[6:0], take}`. **128 arithmetic bit commits**, fixed across all eight rounds. This avoids selecting a speculative remainder byte late, at the price of a second pass. Copy final Q into W' before ready; returning W would incorrectly return the remainder. T8 and take must remain retained when carry is cleared/reused.

The second DIV pass is an explicit proposed microarchitecture change, not the already-tested Python implementation or a physical result. The existing extended-trial formula remains necessary. As before, division by zero requires a physical held-divisor zero detector; a proposed sticky fault suppresses UPDATE rather than inventing a quotient. Its system-level halt behavior remains undecided. Initial A/B selection, reset/zero writes, exactly-once start, lane enable, ready/ack and interrupted-operation reset are real circuits still to build.

## Compact selector target and an honest routing budget

A small **two-input selector coupon** can test the dominant area uncertainty. Coordinates below are local, component Y=1 with one solid support below each component. For each Z=0 and 4: input dust X0 → repeater X1 → dust X2 → subtract comparator X3 → output repeater X4 → dust X5, all traveling east. Join the isolated outputs with dust X5,Z0..4; output repeater at (6,1,2), dust at (7,1,2). A's mask enters through dust (3,1,-2) and a south-travel repeater (3,1,-1); B's complementary mask uses dust (3,1,6) and a north-travel repeater (3,1,5). Supply S and !S physically, never as two independent runtime decisions.

That local coordinate list is **21 components + 21 supports = 42 blocks in 8×2×9**, excluding the S inverter, common mask rails, all inter-cell wiring and external ports. It reuses the proven normalized subtract-and-isolated-OR principle; it is not an independently reviewed or native-tested layout. Eight local copies cost 336 blocks, not a complete 336-block byte selector. Check comparator side strengths, OR backfeed, support power, natural dust shape and shared-mask skew before packing a bank.

A conservative functional decomposition uses ten byte 2:1 selections: four on W' (A/zero, serial/trial shift, initialization/work, final DIV-Q/result), three on M' (A/B initialization, rotate/left shift, initialization/work), three on Q' (A/B initialization, right/left shift, initialization/work). Hold is provided by closed latches, not another feedback mux. Fixed shifts add wires/supports and crossings even though they add no arithmetic gates. A/B stay held; no serial readout is borrowed from the architectural register file.

| Serial-lane budget item | Blocks charged |
|---|---:|
| Unchanged one-bit full-adder envelope | 750 |
| Six unchanged dense work banks | 1,044 |
| Twelve auxiliary cells at an explicit 24-block allowance each | 288 |
| 80 local selector coupons | 3,360 |
| Addend-enable/XOR, zero/take/flag gates | 300–600 allowance |
| Shift crossings, shared S/!S distribution, bank and ALU port wiring | 1,200–2,400 allowance |
| Per-lane close/reset/enable/ready/fault distribution | 500–1,000 allowance |
| **Arithmetic sum of this allocation** | **7,442–9,442** |

The twelve auxiliary cells account for C/C', NZ/NZ', T8, take, architectural NZP, busy/ready/fault. Their different enables need separate routing; 24 blocks/cell is an allocation, not a proven macro. Also reserve **1,500–3,000 per core**, additional to lane costs, for operation/phase/inner-bit/outer-round state, increment/decoding, blanking and four-lane fanout. Both counters need exactly-once commits. This is not permission to borrow one global controller across both independently scheduled cores.

The bands are **unrouted design allocations, neither predictions nor upper bounds**. They total roughly63–82k blocks for eight lanes plus two controllers, excluding the already required register files/A-B and scheduler/LSU/immediate writeback selection. Ten compact byte-selector functions reduce the comparable parallel arithmetic/storage/selector subtotal to15,041 blocks before its own control/routes. Serial remains worth investigating, but a complete routed bill of materials is required before selecting it. Shared routes or late flag/remainder gates can invalidate the allocation. No candidate should be replicated eight times based on this table.

## Small next physical dependency

After register/controller integration, first route **two selector coupons sharing real complementary mask rails, a two-bit W/M current-next feedback slice, one existing full-adder and stored carry**. Keep this as a useful extendable serial slice; do not build a second full ALU or replicate the old 1,737-block selector bank. Use actual selected data, local latch inputs and locks in one ≤64-probe view. Test all selector truth states, both data transitions under either select, blanked select changes, and selected/unselected input isolation. Then demonstrate two consecutive arithmetic bit commits with carry propagated physically and M restored after two rotations. The host may diagnose phases initially; acceptance of an autonomous operation requires the physical controller to produce them.

Require closure before feedback changes, no current-bank motion during next capture, no next-bank motion during current commit, reset during every phase, and retained results while destination overwrites the original source. Route and count the shared mask/clock/feedback wires before extending to eight bits. The serial density decision is made from that measured integrated cost, not from the42-block coupon alone. Later one-lane gates cover byte overflow/borrow/CMP extremes, MUL and DIV intermediate rounds, DIV T8 microstates, stable flags through non-CMP, distinct simultaneous values in four lanes, both cores, and original stored kernels in unmodified Minecraft. The native standalone byte-adder timing remains historical reference evidence throughout.
