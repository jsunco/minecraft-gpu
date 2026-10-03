"""Offline design oracle for one physical bit-serial ALU per tiny-gpu lane.

No Minecraft imports or runtime interface. The model orders latch commits; it
does not prove redstone timing, routing, lock closure or an autonomous controller.
"""

from collections.abc import Callable
from dataclasses import dataclass

from iterative_arithmetic_model import Work, byte

Record = Callable[[dict], None]


@dataclass(frozen=True)
class Result:
    value: int
    flags: int
    bit_commits: int
    remainder: int | None = None


@dataclass(frozen=True)
class DivideRound:
    after: Work
    trial_high: int
    take: int


def serial_pass(w: int, m: int, carry: int, *, subtract: bool = False,
                enable: bool = True, record: Record | None = None,
                label: str = "pass") -> tuple[int, int, int, int]:
    """Eight closed-next then current commits, rotating M back to its start.

    A disabled addend supplies zero before the optional bit inversion. Each
    result bit enters W's high end; NZ accumulates all eight result bits.
    """
    byte(w)
    byte(m)
    if type(carry) is not int or carry not in (0, 1):
        raise ValueError("Carry must be a single bit")
    if type(subtract) is not bool or type(enable) is not bool:
        raise ValueError("Select controls must be booleans")
    nonzero = 0
    for index in range(8):
        a = w & 1
        b = ((m & 1) if enable else 0) ^ int(subtract)
        result_bit = a ^ b ^ carry
        following_carry = (a & b) | (a & carry) | (b & carry)
        next_w = (w >> 1) | (result_bit << 7)
        next_m = (m >> 1) | ((m & 1) << 7)
        next_nonzero = nonzero | result_bit
        if record is not None:
            record({"event": "bit_commit", "pass": label, "index": index,
                    "before": {"w": w, "m": m, "carry": carry,
                               "nonzero": nonzero},
                    "inputs": {"a": a, "conditioned_b": b},
                    "after": {"w": next_w, "m": next_m,
                              "carry": following_carry,
                              "nonzero": next_nonzero}})
        w, m, carry, nonzero = next_w, next_m, following_carry, next_nonzero
    return w, m, carry, nonzero


def divide_round(current: Work, index: int, *, record: Record | None = None) -> DivideRound:
    """One restoring round, including two complete serial arithmetic passes."""
    if type(index) is not int or not 0 <= index < 8:
        raise ValueError("A round index from zero through seven is required")
    if current.m == 0 or current.w >= current.m:
        raise ValueError("A legal divider microstate requires 0 <= R < M and M > 0")
    w, m, q = current.w, current.m, current.q
    trial_high = w >> 7
    w = ((w << 1) & 255) | (q >> 7)
    w, m, carry, _ = serial_pass(w, m, 1, subtract=True,
                                 record=record, label=f"DIV/{index}/subtract")
    take = trial_high | carry
    # TAKE is retained independently while the restore pass reuses C.
    w, m, _, _ = serial_pass(w, m, 0, enable=not bool(take),
                             record=record, label=f"DIV/{index}/restore")
    following = Work(w, m, ((q << 1) & 255) | take)
    if record is not None:
        record({"event": "outer_commit", "op": "DIV", "index": index,
                "before": {"w": current.w, "m": current.m, "q": current.q},
                "trial_high": trial_high, "take": take,
                "after": {"w": following.w, "m": following.m, "q": following.q}})
    return DivideRound(following, trial_high, take)


def evaluate(op: str, rs: int, rt: int, *, flags: int = 0,
             record: Record | None = None) -> Result:
    """Evaluate a proposed microsequence; only CMP commits architectural NZP.

    Bit counts exclude load, outer shifts, ready/ack and UPDATE operations.
    Zero division deliberately has no numeric result or invented halt policy.
    """
    byte(rs)
    byte(rt)
    if type(flags) is not int or not 0 <= flags <= 7:
        raise ValueError("Flags must fit the architectural three-bit register")
    if op in ("ADD", "SUB", "CMP"):
        subtract = op != "ADD"
        w, _, carry, nonzero = serial_pass(
            rs, rt, int(subtract), subtract=subtract, record=record, label=op)
        next_flags = flags
        if op == "CMP":
            next_flags = ((1 - carry) << 2) | ((1 - nonzero) << 1) | (carry & nonzero)
        return Result(w, next_flags, 8)
    if op == "MUL":
        w, m, q = 0, rs, rt
        for outer in range(8):
            before = {"w": w, "m": m, "q": q}
            selected = bool(q & 1)
            w, m, _, _ = serial_pass(w, m, 0, enable=selected,
                                     record=record, label=f"MUL/{outer}")
            m, q = (m << 1) & 255, q >> 1
            if record is not None:
                record({"event": "outer_commit", "op": op, "index": outer,
                        "before": before, "selected": selected,
                        "after": {"w": w, "m": m, "q": q}})
        return Result(w, flags, 64)
    if op == "DIV":
        if rt == 0:
            raise ValueError("Division by zero has no defined numeric ISA result")
        current = Work(0, rt, rs)
        for outer in range(8):
            current = divide_round(current, outer, record=record).after
        return Result(current.q, flags, 128, remainder=current.w)
    raise ValueError(f"Unsupported ALU operation: {op}")
