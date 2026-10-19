import base from './vite.config.ts'
import { viteSingleFile } from 'vite-plugin-singlefile'
export default { ...base, plugins: [...base.plugins, viteSingleFile()], build: { outDir: 'dist-single', assetsInlineLimit: 100000000 } }
