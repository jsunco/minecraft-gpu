import {writeFileSync} from'node:fs';
import {makeProgramColdMaskRepair} from '../../../../hardware/memory-layout-program-cold-mask-repair.mjs';
writeFileSync(new URL('delta.json',import.meta.url),JSON.stringify(makeProgramColdMaskRepair(),null,2)+'\n');
