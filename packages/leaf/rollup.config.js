import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import { nodeResolve } from '@rollup/plugin-node-resolve';

/**
 * @type {import('rollup').RollupOptions}
 */
export default {
  input: './src/index.ts',
  output: {
    file: './dist/leaf.min.js',
    format: 'module',
    sourcemap: true,
    name: 'leaf',
  },
  plugins: [typescript({ outputToFilesystem: false }), terser(), nodeResolve()],
};
