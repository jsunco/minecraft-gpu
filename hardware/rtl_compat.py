"""Run the original cocotb Test object with only its debug formatter disabled.

cocotb 2 LogicArray values no longer multiply as the original formatter expects.
The original coroutine, memory helper, instructions, stimulus, and assertions
remain unchanged. This adapter is not the instruction-level Python oracle.
"""

import importlib
import os

kernel = os.environ.get("TINYGPU_KERNEL", "matadd")
if kernel not in ("matadd", "matmul"):
    raise ValueError("TINYGPU_KERNEL must be matadd or matmul")
upstream = importlib.import_module(f"test.test_{kernel}")
upstream.format_cycle = lambda *args, **kwargs: None
# Both original modules name their decorated coroutine test_matadd.
original_kernel_test = upstream.test_matadd
