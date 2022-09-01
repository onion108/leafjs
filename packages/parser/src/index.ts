import babel, { TransformOptions } from '@babel/core';
import fs from 'fs';
import path from 'path';
import glob from 'glob';
import { OutputOptions, rollup, RollupError, RollupOptions, watch } from 'rollup';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import { Command } from 'commander';
import { babel as rollupBabelPlugin, RollupBabelInputPluginOptions } from '@rollup/plugin-babel';
import inject from '@rollup/plugin-inject';
import chalk from 'chalk';
import progress from 'rollup-plugin-progress';
import { staticServer } from './server';
import chokidar from 'chokidar';
const open = require('open');

const babelConfig: RollupBabelInputPluginOptions = {
  presets: [['@babel/preset-env', { modules: false, targets: '> 0.25%, not dead' }]],
  plugins: [['@babel/plugin-transform-react-jsx', { pragma: '___leaf_create_element_react' }]],
  babelHelpers: 'bundled',
};

const program = new Command();

export const info = (str: string) => {
  console.log(`${chalk.cyan('[leafjs]')} - ${chalk.blue('info')} - ${str}`);
};

export const error = (str: string) => {
  console.log(`${chalk.cyan('[leafjs]')} - ${chalk.red('error')} - ${str}`);
};

const generateCodeTemplate = (code: string): string => {
  return `
    /** @jsx ___createElement_leaf */
    import { createElementReactStyle as ___createElement_leaf } from '@leaf-web/core';
    
    // user code start
    ${code};
    // user code end
  `;
};

export const compileCode = (code: string): string => {
  return babel.transformSync(generateCodeTemplate(code), babelConfig as TransformOptions)?.code || '';
};

export const transformFilename = (filename: string) => {
  const JSXExtensions = ['.jsx', '.tsx'];

  // transform file extension
  if (JSXExtensions.includes(path.extname(filename))) {
    return filename.substring(0, filename.length - 1);
  }
  return filename;
};

export const compileFile = (filePath: string, outputPath: string): string => {
  const code = fs.readFileSync(path.resolve(filePath)).toString();
  const result = compileCode(code);
  let absOutputPath = transformFilename(path.resolve(outputPath));

  fs.writeFileSync(absOutputPath, '// NOTE: This file is generated by Leafjs parser. DO NOT EDIT!\n\n' + result);
  return result;
};

export const compileFilesWithGlob = (pattern: string, outputDir: string) => {
  glob(pattern, (err, matches) => {
    if (err) {
      error(`failed to match glob files.\n${chalk.gray(err)}`);
      return;
    }

    matches.forEach((match) => {
      const currentPath = path.join(outputDir, match);
      const currentOutputDir = path.dirname(currentPath);

      fs.mkdir(currentOutputDir, { recursive: true }, (err) => {
        if (err) {
          console.error(err);
          return;
        }

        compileFile(match, currentPath);
      });
    });
  });
};

export const bundleFiles = async (entry: string, outputDir: string) => {
  const inputOptions: RollupOptions = {
    input: entry,
    plugins: [
      nodeResolve(),
      commonjs(),
      rollupBabelPlugin(babelConfig),
      inject({ ___leaf_create_element_react: ['@leaf-web/core', 'createElementReactStyle'] }),
      terser(),
      // @ts-ignore
      progress(),
    ],
  };
  const outputOptions: OutputOptions = {
    format: 'iife',
    file: path.join(outputDir, 'bundle.min.js'),
  };
  let bundle = null;
  let isError = false;

  try {
    bundle = await rollup(inputOptions);
    await bundle.write(outputOptions);
  } catch (err) {
    isError = true;
    error(`failed to compile.\n${chalk.gray(err)}`);
  }

  if (bundle) {
    await bundle.close();
  }

  if (isError) {
    process.exit(1);
  }
};

export const buildFromConfig = async (configPath: string) => {
  const configContent = JSON.parse(fs.readFileSync(configPath).toString());

  await bundleFiles(configContent.entry, configContent.outputDir);
};

export const startDevServer = (userConfig: any, port: number) => {
  const config = JSON.parse(fs.readFileSync(userConfig).toString());

  const inputOptions: RollupOptions = {
    input: config.entry,
    plugins: [
      nodeResolve(),
      commonjs(),
      rollupBabelPlugin(babelConfig),
      inject({ ___leaf_create_element_react: ['@leaf-web/core', 'createElementReactStyle'] }),
      // @ts-ignore
      progress(),
    ],
  };

  const outputOptions: OutputOptions = {
    format: 'iife',
    file: path.join(config.outputDir, 'bundle.min.js'),
  };

  const watcher = watch({
    ...inputOptions,
    output: outputOptions,
  });

  let currentError: RollupError | null = null;

  const server = staticServer('.');

  server.start(port, async () => {
    info(`started development server on http://localhost:${port}.`);
    await open(`http://127.0.0.1:${port}/`);
  });

  server.on('error', (err) => {
    error(`Failed to start development server.\n${chalk.gray(err)}`);
    return;
  });

  const clearScreen = () => {
    process.stdout.moveCursor(0, -10000);
    process.stdout.cursorTo(0);
    process.stdout.clearScreenDown();
  };

  let isRebuilding = true;

  watcher.on('event', (event) => {
    if (event.code === 'START') {
      isRebuilding = true;
      clearScreen();
      info('building...');
      currentError = null;
    } else if (event.code === 'END') {
      if (currentError) {
        error('an unexpected error occured while building.');
        server.error(currentError.message);
      } else {
        clearScreen();
        info('build successful.');
      }
      isRebuilding = false;
    } else if (event.code === 'ERROR') {
      error(`failed to build.\n${chalk.gray(event.error)}`);
      currentError = event.error;
    } else if (event.code === 'BUNDLE_END') {
      event.result.close();
    }
  });

  const fileSystemWatcher = chokidar.watch('.', {
    ignored: ['node_modules', '**/*.jsx', '**/*.tsx'],
  });

  fileSystemWatcher.on('all', () => {
    if (isRebuilding || currentError) return;
    info('change detected to filesystem. reloading...');
    server.update();
    clearScreen();
    info('waiting for changes...');
  });
};

program.name('leaf').description('Leafjs helper CLI.');

program
  .command('build')
  .description('Build and bundle a Leafjs application.')
  .option('-c, --config <string>', 'Config file location.', './leaf.config.json')
  .action(async (options) => {
    info('compiling...');
    await buildFromConfig(options.config);
    info('compiled successfully.');
  });

program
  .command('dev')
  .description('Start a development server.')
  .option('-c, --config <string>', 'Config file location.', './leaf.config.json')
  .option('-p, --port <number>', 'Port to start the development server.', '8080')
  .action((options) => {
    startDevServer(options.config, parseInt(options.port));
  });

program.parse();
