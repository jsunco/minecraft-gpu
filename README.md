# minecraft gpu

a vanilla redstone recreation of [adam majmudar's tiny-gpu](https://github.com/adam-maj/tiny-gpu): two cores, four lanes each, 8-bit data and the original 16-bit instruction set.

a 12,872-block register file has passed 26,688 directed checks in minecraft java 26.3. the complete connected layout is still being designed offline. no full gpu instruction or kernel has run in the game yet.

this repo contains the hardware generators, models, tests and current layout work. the [minecraft redstone tools](https://github.com/jsunco/minecraft-redstone) live separately.

## run the offline checks

requires python 3.10+ and node 22+.

```sh
git clone --recurse-submodules https://github.com/jsunco/minecraft-gpu.git
cd minecraft-gpu
python3 -B -m unittest discover -s tests
python3 -B scripts/check-serial-arithmetic.py
node hardware/full-gpu-pc-incrementer.mjs artifacts/full-gpu-layout-v1/pc-incrementer
node artifacts/full-gpu-layout-v1/pc-incrementer/check.mjs
```

these check software and a generated circuit, not minecraft execution. [status](docs/STATUS.md) covers what works and what remains. [architecture](docs/ARCHITECTURE.md) defines the machine.

large generated maps, saves and private run records are excluded. this is a source snapshot, not a complete downloadable gpu or a one-command full-layout rebuild. [layout source](artifacts/full-gpu-layout-v1/) includes recipes that still need their generated parent maps and manifests.
