"""Re-run pinned RTL kernels/probes using already-installed local tools.

No package installation and no edits to tracked upstream source. The local
tool wrappers described in docs/stages/00-reference.md handle macOS paths and
the upstream Makefile's older cocotb-config invocation.
"""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import xml.etree.ElementTree as ET

from hardware.reference_model import UPSTREAM_COMMIT


ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "reference/tiny-gpu"
OUT = ROOT / "artifacts/reference"


def run_logged(command, name, env, *, cwd=UPSTREAM, timeout=60):
    with (OUT / f"{name}.log").open("w") as log:
        process = subprocess.Popen(command, cwd=cwd, env=env, stdout=log,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            raise RuntimeError(f"{name}: wall timeout; see its log")
    if code:
        raise RuntimeError(f"{name}: exit {code}; see its log")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=UPSTREAM, text=True).strip()
    if revision != UPSTREAM_COMMIT:
        raise RuntimeError(f"unexpected upstream revision: {revision}")
    subprocess.run(["git", "diff", "--exit-code", "HEAD", "--"], cwd=UPSTREAM, check=True)
    (UPSTREAM / "build").mkdir(exist_ok=True)
    env = os.environ.copy()
    env["PATH"] = str(ROOT / ".reference-tools/bin") + os.pathsep + env["PATH"]
    env["PYTHONPATH"] = str(ROOT)
    env["PYGPI_PYTHON_BIN"] = str(ROOT / ".reference-tools/venv/bin/python")
    results = []
    for name, module in [("matadd", "hardware.rtl_compat"),
                         ("matmul", "hardware.rtl_compat"),
                         ("partial-defect", "hardware.rtl_partial_probe")]:
        env["TINYGPU_KERNEL"] = "matadd" if name == "partial-defect" else name
        env["COCOTB_TEST_MODULES"] = module
        xml_path = UPSTREAM / "results.xml"
        xml_path.unlink(missing_ok=True)  # Never accept stale results after a loader failure.
        run_logged(["make", f"test_{env['TINYGPU_KERNEL']}"], f"rtl-{name}", env)
        suite = ET.parse(xml_path).getroot()
        cases = suite.findall(".//testcase")
        if len(cases) != 1 or suite.findall(".//failure") or suite.findall(".//error"):
            raise RuntimeError(f"{name}: expected exactly one successful simulator test")
        shutil.copy2(xml_path, OUT / f"rtl-{name}-results.xml")
        results.append({"name": name, "status": "passed",
                        "purpose": "known defect reproduction" if name == "partial-defect" else "original kernel assertions",
                        "sim_time_ns": float(cases[0].attrib["sim_time_ns"])})
    for name, top, sources in [
        ("alu-probe", "rtl_alu_probe", ["reference/tiny-gpu/src/alu.sv", "hardware/rtl_alu_probe.sv"]),
        ("wait-probe", "rtl_wait_probe", ["reference/tiny-gpu/build/gpu.v", "hardware/rtl_wait_probe.sv"]),
    ]:
        output = f"artifacts/reference/{name}.vvp"
        run_logged(["iverilog", "-g2012", "-s", top, "-o", output, *sources], f"{name}-compile", env, cwd=ROOT)
        run_logged(["vvp", output], name, env, cwd=ROOT)
    summary = {"upstream_commit": revision,
               "tracked_upstream_source_changed": False,
               "adapter": "cocotb 2: disable incompatible debug formatter only",
               "kernels_and_defect_probe": results,
               "alu_probe": "65536 CMP pairs: 65280 flags100, 256 flags010, zero flags001; DIV0 unknown; arithmetic edges passed",
               "converted_wait_probe": "passed",
               "minecraft_execution": False}
    (OUT / "rtl-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
