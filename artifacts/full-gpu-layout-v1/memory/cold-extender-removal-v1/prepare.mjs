import {writeFileSync} from 'node:fs';
import {makeColdExtenderRemoval} from '../../../../hardware/memory-layout-cold-extender-removal.mjs';
writeFileSync(new URL('delta.json',import.meta.url),JSON.stringify(makeColdExtenderRemoval(),null,2)+'\n');
