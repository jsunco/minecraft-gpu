"""Instruction-level oracle for the tiny-gpu Minecraft reconstruction.

This computes expected answers in software. It does not model redstone, RTL
clock phases, memory-channel arbitration, or physical execution time. The
default CMP semantics are the corrected unsigned ordering in the project
contract. ``rtl_original`` reproduces only the pinned ALU's CMP expression,
not every bug in the original RTL.
"""

from dataclasses import dataclass, field
from enum import IntEnum
import json
from pathlib import Path


UPSTREAM_COMMIT = "02b6c2ce223f606051a6d3a35ca942fbb1dffde2"
N, Z, P = 0b100, 0b010, 0b001


class Opcode(IntEnum):
    NOP = 0
    BR = 1
    CMP = 2
    ADD = 3
    SUB = 4
    MUL = 5
    DIV = 6
    LDR = 7
    STR = 8
    CONST = 9
    RET = 15


class ModelError(ValueError):
    """The requested execution is outside this oracle's defined contract."""


class UndefinedOperation(ModelError):
    pass


class DivergentBranch(ModelError):
    pass


class MemoryRace(ModelError):
    pass


def _uint(value: int, bits: int, name: str) -> int:
    if type(value) is not int or not 0 <= value < 1 << bits:
        raise ModelError(f"{name} must be an unsigned {bits}-bit integer")
    return value


def encode(opcode: Opcode, *, rd=0, rs=0, rt=0, immediate=0, nzp=0) -> int:
    """Encode the original 16-bit layout; unused bits are written as zero."""
    opcode = Opcode(opcode)
    for name, value in (("rd", rd), ("rs", rs), ("rt", rt)):
        _uint(value, 4, name)
    _uint(immediate, 8, "immediate")
    _uint(nzp, 3, "nzp")
    word = int(opcode) << 12
    if opcode == Opcode.BR:
        return word | nzp << 9 | immediate
    if opcode == Opcode.CONST:
        return word | rd << 8 | immediate
    if opcode in (Opcode.CMP, Opcode.STR):
        return word | rs << 4 | rt
    if opcode == Opcode.LDR:
        return word | rd << 8 | rs << 4
    if opcode in (Opcode.ADD, Opcode.SUB, Opcode.MUL, Opcode.DIV):
        return word | rd << 8 | rs << 4 | rt
    return word


@dataclass(frozen=True)
class Instruction:
    word: int
    opcode: int
    rd: int
    rs: int
    rt: int
    immediate: int
    nzp: int


def decode(word: int) -> Instruction:
    _uint(word, 16, "instruction")
    return Instruction(word, word >> 12, (word >> 8) & 15,
                       (word >> 4) & 15, word & 15, word & 255,
                       (word >> 9) & 7)


def compare_flags(a: int, b: int, mode="unsigned") -> int:
    _uint(a, 8, "rs")
    _uint(b, 8, "rt")
    if mode == "unsigned":
        return N if a < b else Z if a == b else P
    if mode == "rtl_original":
        # Pinned alu.sv uses unsigned subtraction in comparisons with unsized
        # zero. The > flag occupies bit 2; < zero is always false.
        return Z if a == b else N
    raise ModelError(f"unknown CMP mode: {mode}")


@dataclass
class Lane:
    registers: list[int]
    nzp: int = 0


@dataclass
class Block:
    block_id: int
    core_id: int
    lanes: list[Lane]
    pc: int = 0
    retired: int = 0
    done: bool = False


@dataclass
class Result:
    memory: list[int]
    blocks: list[Block]
    retired_instructions: int
    cmp_mode: str
    # This log records architectural commits, not clock/tick samples.
    commits: list[dict] = field(default_factory=list)


class ReferenceGPU:
    """Two cores, four lanes each by default; no divergent control flow.

    Ready cores take one whole instruction per model turn in core-id order.
    This deliberately deterministic schedule is not RTL cycle simulation.
    Conflicting inter-block memory dependencies are rejected so a serial
    execution order cannot silently become the answer to a data race.
    """

    def __init__(self, program, data=(), *, cores=2, lanes_per_core=4,
                 cmp_mode="unsigned", reserved_as_nop=False):
        if type(cores) is not int or not 1 <= cores <= 8:
            raise ModelError("cores must be in 1..8")
        if type(lanes_per_core) is not int or not 1 <= lanes_per_core <= 16:
            raise ModelError("lanes_per_core must be in 1..16")
        self.program = list(program)
        self.memory = list(data)
        if len(self.program) > 256 or len(self.memory) > 256:
            raise ModelError("program and data memory each have 256 addresses")
        for word in self.program:
            _uint(word, 16, "program word")
        for value in self.memory:
            _uint(value, 8, "data byte")
        self.program.extend([0] * (256 - len(self.program)))
        self.memory.extend([0] * (256 - len(self.memory)))
        compare_flags(0, 0, cmp_mode)
        self.cores, self.width, self.cmp_mode = cores, lanes_per_core, cmp_mode
        self.reserved_as_nop = reserved_as_nop
        self.accesses: dict[int, dict[str, set[int]]] = {}
        self.commits: list[dict] = []
        self.used = False

    def _access(self, address, block_id, write=False):
        access = self.accesses.setdefault(address, {"read": set(), "write": set()})
        conflicts = (access["read"] | access["write"]) if write else access["write"]
        if conflicts - {block_id}:
            raise MemoryRace(f"cross-block dependency at data address {address}")
        access["write" if write else "read"].add(block_id)

    def _block(self, block_id, core_id, active_count):
        lanes = [Lane([0] * 13 + [block_id, self.width, i])
                 for i in range(active_count)]
        return Block(block_id, core_id, lanes)

    def _step(self, block):
        ins = decode(self.program[block.pc])
        try:
            op = Opcode(ins.opcode)
        except ValueError as error:
            if not self.reserved_as_nop:
                raise UndefinedOperation(f"reserved opcode 0x{ins.opcode:x}") from error
            op = Opcode.NOP
        next_pcs, writes, rd_values = [], {}, []
        for lane_id, lane in enumerate(block.lanes):
            a, b = lane.registers[ins.rs], lane.registers[ins.rt]
            next_pc, value = (block.pc + 1) & 255, None
            if op == Opcode.ADD:
                value = (a + b) & 255
            elif op == Opcode.SUB:
                value = (a - b) & 255
            elif op == Opcode.MUL:
                value = (a * b) & 255
            elif op == Opcode.DIV:
                if b == 0:
                    raise UndefinedOperation(f"division by zero at pc {block.pc}, lane {lane_id}")
                value = a // b
            elif op == Opcode.CONST:
                value = ins.immediate
            elif op == Opcode.CMP:
                lane.nzp = compare_flags(a, b, self.cmp_mode)
            elif op == Opcode.BR and lane.nzp & ins.nzp:
                next_pc = ins.immediate
            elif op == Opcode.LDR:
                self._access(a, block.block_id)
                value = self.memory[a]
            elif op == Opcode.STR:
                self._access(a, block.block_id, write=True)
                if a in writes and writes[a] != b:
                    raise MemoryRace(f"different lane values target address {a}")
                writes[a] = b
            rd_values.append(value)
            next_pcs.append(next_pc)
        if len(set(next_pcs)) != 1:
            raise DivergentBranch(f"block {block.block_id}, pc {block.pc}: {next_pcs}")
        for lane, value in zip(block.lanes, rd_values):
            if value is not None and ins.rd < 13:
                lane.registers[ins.rd] = value
        for address, value in writes.items():
            self.memory[address] = value
        self.commits.append({"core": block.core_id, "block": block.block_id,
                             "pc": block.pc, "word": ins.word,
                             "active_lanes": len(block.lanes), "stores": dict(writes)})
        block.retired += 1
        block.done = op == Opcode.RET
        if not block.done:
            block.pc = next_pcs[0]

    def run(self, thread_count: int, *, max_instructions=10000) -> Result:
        """Run once; the limit counts instructions retired across all cores."""
        _uint(thread_count, 8, "thread_count")
        if type(max_instructions) is not int or max_instructions < 1:
            raise ModelError("max_instructions must be positive")
        if self.used:
            raise ModelError("create a new ReferenceGPU for a fresh reset/run")
        self.used = True
        block_count = (thread_count + self.width - 1) // self.width
        next_block, retired = 0, 0
        active, completed = [None] * self.cores, []
        while next_block < block_count or any(active):
            for core_id in range(self.cores):
                if active[core_id] is None and next_block < block_count:
                    count = min(self.width, thread_count - next_block * self.width)
                    active[core_id] = self._block(next_block, core_id, count)
                    next_block += 1
                block = active[core_id]
                if block is None:
                    continue
                if retired >= max_instructions:
                    raise ModelError("instruction limit exceeded; kernel did not terminate")
                self._step(block)
                retired += 1
                if block.done:
                    completed.append(block)
                    active[core_id] = None
        completed.sort(key=lambda block: block.block_id)
        return Result(self.memory[:], completed, retired, self.cmp_mode, self.commits[:])


def load_fixture(name):
    if name not in ("matadd", "matmul"):
        raise ModelError("fixture must be matadd or matmul")
    path = Path(__file__).with_name("fixtures") / f"original_{name}.json"
    return json.loads(path.read_text())


if __name__ == "__main__":
    for name in ("matadd", "matmul"):
        fixture = load_fixture(name)
        result = ReferenceGPU(fixture["program"], fixture["data"]).run(fixture["threads"])
        start = fixture["output_address"]
        actual = result.memory[start:start + len(fixture["expected"])]
        print(json.dumps({"kernel": name, "actual": actual,
                          "expected": fixture["expected"],
                          "passed": actual == fixture["expected"],
                          "retired_core_instructions": result.retired_instructions}))
