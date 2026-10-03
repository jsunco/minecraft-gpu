#!/usr/bin/env python3
"""Exhaustive offline functional checks; never connects to a game."""

import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "hardware"))
from iterative_arithmetic_model import Work, divide_round as parallel_round
from iterative_arithmetic_model import multiply_trace, divide_trace
from serial_arithmetic_model import divide_round, evaluate, serial_pass


def verify():
    started = time.monotonic()
    counts = {op: 0 for op in ("ADD", "SUB", "CMP", "MUL", "DIV")}
    bit_commits = 0
    for a in range(256):
        for b in range(256):
            for op, expected in (("ADD", (a + b) & 255),
                                 ("SUB", (a - b) & 255),
                                 ("CMP", (a - b) & 255),
                                 ("MUL", (a * b) & 255)):
                result = evaluate(op, a, b, flags=5)
                assert result.value == expected, (op, a, b, result)
                expected_flags = (4 if a < b else 2 if a == b else 1) if op == "CMP" else 5
                assert result.flags == expected_flags, (op, a, b, result)
                assert result.bit_commits == (64 if op == "MUL" else 8)
                counts[op] += 1
                bit_commits += result.bit_commits
            if b:
                result = evaluate("DIV", a, b, flags=5)
                assert (result.value, result.remainder) == divmod(a, b), (a, b, result)
                assert result.flags == 5 and result.bit_commits == 128
                counts["DIV"] += 1
                bit_commits += result.bit_commits
            else:
                try:
                    evaluate("DIV", a, 0)
                except ValueError as error:
                    assert "no defined numeric" in str(error)
                else:
                    raise AssertionError("Zero divisor fabricated a result")

    # General legal microstates include T8=1 cases not reached by starting an
    # eight-round byte division at zero. Every R/M/next-input-bit is covered;
    # lower Q bits are varied deterministically, not claimed exhaustive here.
    microstates = high_trial = 0
    high_bit_witness = None
    for divisor in range(1, 256):
        for remainder in range(divisor):
            for incoming in (0, 1):
                q = (incoming << 7) | ((remainder + 17 * divisor) & 127)
                current = Work(remainder, divisor, q)
                got = divide_round(current, 0)
                reference = parallel_round(current, 0)
                assert got.after == reference.after
                trial = remainder * 2 + incoming
                expected_take = int(trial >= divisor)
                assert got.trial_high == trial >> 8 and got.take == expected_take
                assert got.after.w == trial - (divisor if expected_take else 0)
                assert 0 <= got.after.w < divisor
                microstates += 1
                high_trial += got.trial_high
                low_only_carry = int((trial & 255) >= divisor)
                if got.take != low_only_carry:
                    high_bit_witness = high_bit_witness or {
                        "remainder": remainder, "divisor": divisor, "q": q,
                        "trial": trial, "correct_take": got.take,
                        "incorrect_without_t8": low_only_carry}
    assert high_bit_witness is not None

    # General one-byte serial pass, including physical conditioning disabled
    # and both initial carry values, independently compared to integer math.
    pass_cases = 0
    for a in range(256):
        for b in range(256):
            for initial_carry in (0, 1):
                for subtract in (False, True):
                    got = serial_pass(a, b, initial_carry, subtract=subtract)
                    integer = a + (b ^ (255 if subtract else 0)) + initial_carry
                    assert got == (integer & 255, b, integer >> 8, int(bool(integer & 255)))
                    pass_cases += 1
    for a in range(256):
        for b in (0, 1, 85, 128, 170, 255):
            for initial_carry in (0, 1):
                for subtract in (False, True):
                    integer = a + (255 if subtract else 0) + initial_carry
                    got = serial_pass(a, b, initial_carry, subtract=subtract, enable=False)
                    assert got == (integer & 255, b, integer >> 8, int(bool(integer & 255)))
                    pass_cases += 1

    traces = []
    # Full traces expose all eight intermediate rounds, carry resets, and M
    # rotations for selected boundary cases, independently against old model.
    for op, a, b in (("ADD", 255, 1), ("CMP", 0, 255), ("MUL", 173, 197),
                     ("DIV", 255, 7), ("DIV", 255, 129), ("DIV", 128, 255)):
        events = []
        result = evaluate(op, a, b, flags=3, record=events.append)
        bits = [row for row in events if row["event"] == "bit_commit"]
        assert len(bits) == result.bit_commits
        for start in range(0, len(bits), 8):
            phase = bits[start:start + 8]
            assert [row["index"] for row in phase] == list(range(8))
            assert phase[0]["before"]["nonzero"] == 0
            assert phase[-1]["after"]["m"] == phase[0]["before"]["m"]
            for before, after in zip(phase, phase[1:]):
                assert before["after"] == after["before"]
        if op in ("MUL", "DIV"):
            outer = [row for row in events if row["event"] == "outer_commit"]
            reference = (multiply_trace if op == "MUL" else divide_trace)(a, b)
            assert len(outer) == 8
            for row, expected in zip(outer, reference):
                assert row["after"] == vars(expected.after)
            if op == "DIV":
                for i in range(8):
                    assert bits[16 * i]["before"]["carry"] == 1
                    assert bits[16 * i + 8]["before"]["carry"] == 0
                    assert outer[i]["take"] == reference[i].take
        traces.append({"op": op, "rs": a, "rt": b, "result": vars(result), "events": events})

    flag_cases = 0
    for flags in range(8):
        for a, b in ((0, 1), (255, 1), (128, 255), (255, 128), (17, 17)):
            for op in counts:
                expected = (4 if a < b else 2 if a == b else 1) if op == "CMP" else flags
                assert evaluate(op, a, b, flags=flags).flags == expected
                flag_cases += 1
    sources = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
               for path in [Path(__file__).resolve(), ROOT / "hardware/serial_arithmetic_model.py",
                            ROOT / "hardware/iterative_arithmetic_model.py",
                            ROOT / "artifacts/compact-alu-plan-v1/README.md"]}
    return {"status": "offline_serial_functional_checks_passed", "native_calls": 0,
            "physical_acceptance": False, "complete_operand_pairs_by_operation": counts,
            "total_operations": sum(counts.values()), "arithmetic_bit_commits": bit_commits,
            "zero_division_refusals": 256, "general_serial_pass_cases": pass_cases,
            "general_division_microstates": microstates, "high_trial_microstates": high_trial,
            "missing_t8_counterexample": high_bit_witness, "directed_all_flag_states": flag_cases,
            "boundary_traces": traces, "sources": sources,
            "wall_seconds": round(time.monotonic() - started, 3),
            "limits": ["Software design recurrence only; no native placement or timing proof",
                       "General division microstates exhaust R/M/next-bit, not all lower Q combinations",
                       "Bit counts omit loading, outer shifts, handshake, and physical phase timing",
                       "Zero divisor hardware fault and system halt policy remain unimplemented"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    report = verify()
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open("x") as output:
            json.dump(report, output, indent=2)
            output.write("\n")
    print(json.dumps({key: value for key, value in report.items()
                      if key not in ("boundary_traces", "sources")}))
