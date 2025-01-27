import { defineConfig } from "rollup";
import Module from "node:module";
import { isBuiltin } from 'node:module';
import 'colors'
const require = Module.createRequire(import.meta.url);
/**
 * TODO: Move that in 
 *     "preinstall": "npm i --ignore-scripts --no-save node-pty && node-gyp configure && node-gyp build",
    "test": "echo \"Error: no test specified\" && exit 1",
    "postinstall": "tsc -b ./tsconfig.json || exit 0"
    "postinstall": "tsc -p ./tsconfig.next.json || exit 0"
 */

// Copy
const { access, copyFile, mkdir, stat, unlink } = require('fs/promises')
const path = require('path')
const chokidar = require('chokidar')
const glob = require('glob')
const globParent = require('glob-parent')
const name = "RollupPluginCopyGlob";




const prepareDestination = (from, entry) => {
  const result = path.join(entry.dest, path.relative(globParent(entry.files), from))

  return entry.rename ? result.replace(path.basename(result), entry.rename) : result
}

const copy = async (from, entry, verbose) => {
  const data = await stat(from)

  if (!data.isDirectory()) {
    try {
      const to = prepareDestination(from, entry)
      const dir = path.dirname(to);
      
     try {
        await access(dir)
      } catch(_e) {
        await mkdir(dir, { recursive: true })
      }
    
      await copyFile(from, to)

      if (verbose)
        console.log('[COPY]'.yellow, from, 'to'.yellow, to)
    } catch (e) {
      console.log('[COPY][ERROR]'.red, from)
      console.error(e)
    }
  }
}

const remove = async (from, entry, verbose) => {
  const to = prepareDestination(from, entry)

  try {
    await unlink(to)

    if (verbose)
      console.log('[DELETE]'.yellow, to)
  } catch (e) {
    console.log('[DELETE][ERROR]'.red, to)
    console.error(e)
  }
}

const RollupPluginCopyGlob = (paths, { watch = process.env.ROLLUP_WATCH === 'true', verbose = false } = {}) => {
  let once = true
  console.log("Return ding");
  return {
    name,
    buildStart() {
      if (!once)
        return

      once = false

      if (watch) {
        for (const entry of paths) {
          chokidar.watch(entry.files)
            .on('add', from => copy(from, entry, verbose))
            .on('change', from => copy(from, entry, verbose))
            .on('unlink', from => remove(from, entry, verbose))
            .on('error', e => console.error(e))
        }
      } else {
        for (const entry of paths) {
          glob.sync(entry.files).forEach(file => copy(file, entry, verbose))
        }
      }
    }
  }
}
// third_party/conpty/1.20.240626001    
// src/win
// src/unix
const plugins = [
  {
		resolveId( importee="", importer ) {
			if ( isBuiltin(importee) && !importee.startsWith("node:") ) {
        return { id: 'node:' + importee, external: true };
      };
			// if nothing is returned, we fall back to default resolution
		}
	},  
  RollupPluginCopyGlob([
    // //   { files: 'src/*.{html,css}', dest: 'dist' },
    // //   { files: 'src/config.template', dest: 'dist', rename: 'config.json' },
    // //   { files: 'dev/images/**/*.*', dest: 'dist/images' }
    { files: 'node_modules/node-pty-next/third_party/**/*.*', dest: 'package-skel/third_party' },
    { files: 'node_modules/node-pty-next/src/unix/*.cc', dest: 'package-skel/src/unix' },
    { files: 'node_modules/node-pty-next/src/win/*.{cc,h}', dest: 'package-skel/src/win' }
    ], { verbose: true, watch: false })
  ]


const buildFromSrc = defineConfig({
  input: { 
      "worker/conoutSocketWorker": "src/worker/conoutSocketWorker.js", 
      "windowsTerminal": "src/windowsTerminal.js",
      "unixTerminal": "src/unixTerminal.js"
  },
  plugins,
  output: {
      dir: "esm"
  }  
})

// lib === tsc - ./tsconfig.next.json || exit 0
// builds tsc source from node-pty-next (beta 1.1) see: package.json
const buildFromLib = defineConfig({
  input: { 
      "unixTerminal": "lib/unixTerminal.js",
      "windowsTerminal": "lib/windowsTerminal.js",
      // windowsPtyAgent.js spawns the below files
      "conpty_console_list_agent": "lib/conpty_console_list_agent.js",
      // Should get innlined with windowsPtyAgent.js
      "worker/conoutSocketWorker": "lib/worker/conoutSocketWorker.js",
  },
  plugins,
  output: {
      dir: "esm-dev"
  }  
});

const configs = [
// buildFromSrc,
buildFromLib
]
export default configs;