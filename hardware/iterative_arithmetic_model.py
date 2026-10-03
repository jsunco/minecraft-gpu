"""Offline expectations for a proposed per-lane eight-round datapath.

This module has no Minecraft interface. It is neither a placed circuit nor a
runtime GPU implementation. State changes here describe closed-next-latch then
current-latch commits; the future physical phase controller must prove them.
"""

from dataclasses import dataclass


def byte(value: int) -> int:
    if type(value) is not int or not 0 <= value <= 255:
        raise ValueError("An unsigned byte is required")
    return value


@dataclass(frozen=True)
class Work:
    w: int
    m: int
    q: int

    def __post_init__(self):
        for value in (self.w, self.m, self.q):
            byte(value)


@dataclass(frozen=True)
class Round:
    index: int
    before: Work
    alu_a: int
    alu_b: int
    subtract: bool
    low_result: int
    carry: int
    extended_trial_bit: int
    take: int
    after: Work


def multiply_round(current: Work, index: int) -> Round:
    if type(index) is not int or not 0 <= index < 8:
        raise ValueError("A round index from zero through seven is required")
    raw = current.w + current.m
    low, carry, take = raw & 255, raw >> 8, current.q & 1
    following = Work(low if take else current.w, (current.m << 1) & 255,
                     current.q >> 1)
    return Round(index, current, current.w, current.m, False, low, carry,
                 0, take, following)


def divide_round(current: Work, index: int) -> Round:
    if type(index) is not int or not 0 <= index < 8:
        raise ValueError("A round index from zero through seven is required")
    if current.m == 0 or current.w >= current.m:
        raise ValueError("A legal divider microstate requires 0 <= R < M and M > 0")
    trial = (current.w << 1) | (current.q >> 7)
    low_trial, high_trial = trial & 255, trial >> 8
    raw = low_trial + (current.m ^ 255) + 1
    low, carry = raw & 255, raw >> 8
    take = high_trial | carry
    following = Work(low if take else low_trial, current.m,
                     ((current.q << 1) & 255) | take)
    return Round(index, current, low_trial, current.m, True, low, carry,
                 high_trial, take, following)


def multiply_trace(rs: int, rt: int) -> tuple[Round, ...]:
    current = Work(0, byte(rs), byte(rt))
    records = []
    for index in range(8):
        record = multiply_round(current, index)
        records.append(record)
        current = record.after
    return tuple(records)


def divide_trace(rs: int, rt: int) -> tuple[Round, ...]:
    byte(rs)
    byte(rt)
    if rt == 0:
        # No fabricated numeric answer: the hardware fault policy is separate.
        raise ValueError("Division by zero has no defined numeric ISA result")
    current = Work(0, rt, rs)
    records = []
    for index in range(8):
        record = divide_round(current, index)
        records.append(record)
        current = record.after
    return tuple(records)
