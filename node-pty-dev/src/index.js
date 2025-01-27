/**
 * Copyright (c) 2012-2015, Christopher Jeffrey, Peter Sunde (MIT License)
 * Copyright (c) 2016, Daniel Imms (MIT License).
 * Copyright (c) 2018, Microsoft Corporation (MIT License).
 * Copyright (c) 2025, Frank Lemanschik (MIT License).
 */
import Module from "node:module";
const require = Module.createRequire(import.meta.url);

const terminalCtor =  require(`./${process.platform === 'win32' ? 'windows' : 'unix'}Terminal.js`).default;

/**
 * Forks a process as a pseudoterminal.
 * @param file The file to launch.
 * @param args The file's arguments as argv (string[]) or in a pre-escaped
 * CommandLine format (string). Note that the CommandLine option is only
 * available on Windows and is expected to be escaped properly.
 * @param options The options of the terminal.
 * @throws When the file passed to spawn with does not exists.
 * @see CommandLineToArgvW https://msdn.microsoft.com/en-us/library/windows/desktop/bb776391(v=vs.85).aspx
 * @see Parsing C++ Comamnd-Line Arguments https://msdn.microsoft.com/en-us/library/17w5ykft.aspx
 * @see GetCommandLine https://msdn.microsoft.com/en-us/library/windows/desktop/ms683156.aspx
 */
export function spawn(file, args, opt) {
    return new terminalCtor(file, args, opt);
}
/** @deprecated */
export function fork(file, args, opt) {
    return new terminalCtor(file, args, opt);
}
/** @deprecated */
export function createTerminal(file, args, opt) {
    return new terminalCtor(file, args, opt);
}
export function open(options) {
    return terminalCtor.open(options);
}
/**
 * Expose the native API when not Windows, note that this is not public API and
 * could be removed at any time.
 */
export const native = (process.platform !== 'win32' ? require('../build/Release/pty.node') : null);
