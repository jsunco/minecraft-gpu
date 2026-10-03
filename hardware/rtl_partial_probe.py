"""Bounded reproduction of the pinned RTL's inactive-final-lane PC defect."""
import cocotb
from cocotb.triggers import ReadOnly, RisingEdge
from test.helpers.memory import Memory
from test.helpers.setup import setup
from hardware.reference_model import load_fixture


@cocotb.test()
async def partial_block_stall_is_reproduced(dut):
    fixture = load_fixture("matadd")
    program_memory = Memory(dut, 8, 16, 1, "program")
    data_memory = Memory(dut, 8, 8, 4, "data")
    await setup(dut, program_memory, fixture["program"], data_memory, fixture["data"], 3)
    for _ in range(600):
        data_memory.run()
        program_memory.run()
        await ReadOnly()
        assert int(dut.done.value) == 0, "original partial-block defect was not reproduced"
        assert int(dut.cores[0].core_instance.current_pc.value) == 0
        await RisingEdge(dut.clk)
    assert data_memory.memory[16:19] == [0, 0, 0]
    dut._log.info("DEFECT_REPRODUCED threads=3 cycles=600 pc=0 done=0 output=[0,0,0]")
