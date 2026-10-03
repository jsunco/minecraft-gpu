"""Mathematical/ISA checks, not evidence of redstone or RTL execution."""

import ast
from pathlib import Path
import random
import unittest

from hardware.reference_model import (
    ReferenceGPU, Opcode as O, ModelError, UndefinedOperation,
    DivergentBranch, MemoryRace, UPSTREAM_COMMIT, N, Z, P,
    encode, decode, compare_flags, load_fixture,
)


RET = encode(O.RET)


def arithmetic(op, a, b):
    words = [encode(O.CONST, rd=0, immediate=a),
             encode(O.CONST, rd=1, immediate=b), encode(op, rd=2, rs=0, rt=1), RET]
    return ReferenceGPU(words).run(1).blocks[0].lanes[0].registers[2]


class OriginalKernels(unittest.TestCase):
    def test_fixture_words_and_inputs_equal_pinned_upstream_tests(self):
        root = Path(__file__).resolve().parents[1] / "reference/tiny-gpu"
        for name in ("matadd", "matmul"):
            f = load_fixture(name)
            self.assertEqual(f["source_commit"], UPSTREAM_COMMIT)
            tree = ast.parse((root / f["source_path"]).read_text())
            assignments = {}
            for node in ast.walk(tree):
                if (isinstance(node, ast.Assign) and len(node.targets) == 1
                    and isinstance(node.targets[0], ast.Name)
                    and node.targets[0].id in ("program", "data", "threads")):
                    assignments[node.targets[0].id] = ast.literal_eval(node.value)
            for key, expected in assignments.items():
                self.assertEqual(f[key], expected)

    def test_original_matadd(self):
        f = load_fixture("matadd")
        result = ReferenceGPU(f["program"], f["data"]).run(f["threads"])
        self.assertEqual(result.memory[16:24], [0, 2, 4, 6, 8, 10, 12, 14])
        self.assertEqual([b.core_id for b in result.blocks], [0, 1])

    def test_original_matmul(self):
        f = load_fixture("matmul")
        result = ReferenceGPU(f["program"], f["data"]).run(f["threads"])
        self.assertEqual(result.memory[8:12], [7, 10, 15, 22])

    def test_original_kernels_do_not_detect_raw_cmp_bug(self):
        for name in ("matadd", "matmul"):
            f = load_fixture(name)
            result = ReferenceGPU(f["program"], f["data"], cmp_mode="rtl_original").run(f["threads"])
            start = f["output_address"]
            self.assertEqual(result.memory[start:start + len(f["expected"])], f["expected"])

    def test_original_matadd_program_with_changed_inputs_and_overflow(self):
        rng = random.Random(7391)
        program = load_fixture("matadd")["program"]
        for _ in range(30):
            a, b = [rng.randrange(256) for _ in range(8)], [rng.randrange(256) for _ in range(8)]
            result = ReferenceGPU(program, a + b).run(8)
            self.assertEqual(result.memory[16:24], [(x + y) % 256 for x, y in zip(a, b)])

    def test_original_matmul_program_against_independent_dot_products(self):
        rng = random.Random(5433)
        program = load_fixture("matmul")["program"]
        for _ in range(30):
            a, b = [rng.randrange(256) for _ in range(4)], [rng.randrange(256) for _ in range(4)]
            expected = [sum(a[2*r+k] * b[2*k+c] for k in range(2)) % 256
                        for r in range(2) for c in range(2)]
            self.assertEqual(ReferenceGPU(program, a + b).run(4).memory[8:12], expected)


class InstructionSemantics(unittest.TestCase):
    def test_encoding_original_fields(self):
        self.assertEqual(encode(O.MUL, rd=0, rs=13, rt=14), 0x50DE)
        self.assertEqual(encode(O.BR, nzp=N, immediate=12), 0x180C)
        self.assertEqual(encode(O.STR, rs=9, rt=8), 0x8098)
        ins = decode(0x9AFF)
        self.assertEqual((ins.opcode, ins.rd, ins.immediate), (9, 10, 255))

    def test_byte_arithmetic_edges(self):
        for op, a, b, expected in [
            (O.ADD, 255, 1, 0), (O.ADD, 127, 128, 255),
            (O.SUB, 0, 1, 255), (O.SUB, 128, 255, 129),
            (O.MUL, 255, 255, 1), (O.MUL, 16, 16, 0),
            (O.DIV, 255, 2, 127), (O.DIV, 1, 2, 0), (O.DIV, 17, 5, 3),
        ]:
            with self.subTest(op=op, a=a, b=b):
                self.assertEqual(arithmetic(op, a, b), expected)

    def test_arithmetic_seeded_operands(self):
        rng = random.Random(1841)
        for _ in range(200):
            a, b = rng.randrange(256), rng.randrange(1, 256)
            for op, expected in [(O.ADD, (a+b) % 256), (O.SUB, (a-b) % 256),
                                 (O.MUL, (a*b) % 256), (O.DIV, a//b)]:
                self.assertEqual(arithmetic(op, a, b), expected)

    def test_corrected_comparison_all_65536_byte_pairs(self):
        for a in range(256):
            for b in range(256):
                expected = N if a < b else Z if a == b else P
                self.assertEqual(compare_flags(a, b), expected)

    def test_raw_cmp_is_explicitly_different_for_greater(self):
        self.assertEqual(compare_flags(255, 0), P)
        self.assertEqual(compare_flags(255, 0, "rtl_original"), N)
        self.assertEqual(compare_flags(0, 255, "rtl_original"), N)
        self.assertEqual(compare_flags(127, 127, "rtl_original"), Z)

    def test_all_branch_masks_for_less_equal_greater(self):
        for a, b, flag in [(1, 2, N), (2, 2, Z), (255, 2, P)]:
            for mask in range(8):
                words = [encode(O.CONST, rd=0, immediate=a), encode(O.CONST, rd=1, immediate=b),
                         encode(O.CMP, rs=0, rt=1), encode(O.BR, nzp=mask, immediate=6),
                         encode(O.CONST, rd=2, immediate=11), RET,
                         encode(O.CONST, rd=2, immediate=22), RET]
                result = ReferenceGPU(words).run(4)
                self.assertEqual([l.registers[2] for l in result.blocks[0].lanes],
                                 [22 if mask & flag else 11] * 4)

    def test_branch_before_cmp_falls_through_and_arithmetic_preserves_flags(self):
        words = [encode(O.BR, nzp=7, immediate=0), encode(O.CMP, rs=0, rt=0),
                 encode(O.CONST, rd=0, immediate=255), encode(O.ADD, rd=1, rs=0, rt=0), RET]
        lane = ReferenceGPU(words).run(1).blocks[0].lanes[0]
        self.assertEqual(lane.nzp, Z)
        self.assertEqual(lane.registers[1], 254)

    def test_read_only_registers_ignore_writes(self):
        words = [encode(O.CONST, rd=r, immediate=99) for r in (13, 14, 15)] + [RET]
        result = ReferenceGPU(words).run(8)
        for block in result.blocks:
            for lane_id, lane in enumerate(block.lanes):
                self.assertEqual(lane.registers[13:], [block.block_id, 4, lane_id])

    def test_load_store_high_address_and_operand_order(self):
        words = [encode(O.CONST, rd=0, immediate=255), encode(O.CONST, rd=1, immediate=173),
                 encode(O.STR, rs=0, rt=1), encode(O.LDR, rd=2, rs=0), RET]
        result = ReferenceGPU(words).run(1)
        self.assertEqual(result.memory[255], 173)
        self.assertEqual(result.blocks[0].lanes[0].registers[2], 173)

    def test_uninitialized_data_memory_is_zero_in_oracle_harness(self):
        result = ReferenceGPU([encode(O.LDR, rd=2, rs=0), RET]).run(1)
        self.assertEqual(result.blocks[0].lanes[0].registers[2], 0)

    def test_nop_and_ret_ignore_unused_bits(self):
        result = ReferenceGPU([0x0FFF, 0xFFFF]).run(1)
        self.assertEqual(result.retired_instructions, 2)
        self.assertEqual(result.blocks[0].lanes[0].registers[:13], [0] * 13)

    def test_pc_wraps_at_256(self):
        gpu = ReferenceGPU([0] * 256)
        with self.assertRaisesRegex(ModelError, "instruction limit"):
            gpu.run(1, max_instructions=257)
        self.assertEqual([x["pc"] for x in gpu.commits[-2:]], [255, 0])


class DispatchAndGuardrails(unittest.TestCase):
    def test_partial_blocks_and_multiple_dispatch_waves(self):
        words = [encode(O.MUL, rd=0, rs=13, rt=14), encode(O.ADD, rd=0, rs=0, rt=15),
                 encode(O.STR, rs=0, rt=0), RET]
        for count in [0, 1, 2, 3, 4, 5, 7, 8, 9, 17, 255]:
            result = ReferenceGPU(words).run(count)
            self.assertEqual(result.memory[:count], list(range(count)))
            self.assertEqual(sum(len(b.lanes) for b in result.blocks), count)
            self.assertEqual(len(result.blocks), (count + 3) // 4)

    def test_partial_block_uses_active_lane_convergence(self):
        words = [encode(O.CMP, rs=0, rt=0), encode(O.BR, nzp=Z, immediate=3), 0, RET]
        for count in (1, 2, 3):
            result = ReferenceGPU(words).run(count)
            self.assertEqual(result.blocks[0].retired, 3)

    def test_divergent_branch_is_rejected(self):
        words = [encode(O.CMP, rs=15, rt=0), encode(O.BR, nzp=Z, immediate=0), RET]
        with self.assertRaises(DivergentBranch):
            ReferenceGPU(words).run(4)

    def test_conflicting_lane_stores_are_rejected(self):
        with self.assertRaises(MemoryRace):
            ReferenceGPU([encode(O.STR, rs=0, rt=15), RET]).run(4)

    def test_cross_block_memory_dependency_is_rejected(self):
        with self.assertRaises(MemoryRace):
            ReferenceGPU([encode(O.STR, rs=0, rt=13), RET]).run(8)

    def test_divide_by_zero_is_not_given_an_invented_answer(self):
        with self.assertRaises(UndefinedOperation):
            arithmetic(O.DIV, 12, 0)

    def test_reserved_opcodes_strict_validation_or_explicit_nop_mode(self):
        for op in range(10, 15):
            with self.assertRaises(UndefinedOperation):
                ReferenceGPU([op << 12, RET]).run(1)
            result = ReferenceGPU([op << 12, RET], reserved_as_nop=True).run(1)
            self.assertEqual(result.retired_instructions, 2)

    def test_invalid_widths_counts_and_repeat_run_rejected(self):
        for args in [([-1],), ([65536],), ([RET], [256]), ([0] * 257,)]:
            with self.assertRaises(ModelError):
                ReferenceGPU(*args)
        for count in [-1, 256, True]:
            with self.assertRaises(ModelError):
                ReferenceGPU([RET]).run(count)
        gpu = ReferenceGPU([RET])
        gpu.run(1)
        with self.assertRaises(ModelError):
            gpu.run(1)


if __name__ == "__main__":
    unittest.main()
