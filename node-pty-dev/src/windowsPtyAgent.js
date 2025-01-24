/**
 * Copyright (c) 2012-2015, Christopher Jeffrey, Peter Sunde (MIT License)
 * Copyright (c) 2016, Daniel Imms (MIT License).
 * Copyright (c) 2018, Microsoft Corporation (MIT License).
 * Copyright (c) 2025, Frank Lemanschik (MIT License).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Socket } from 'net';
import { fork } from 'child_process';
import { ConoutConnection } from './windowsConoutConnection';
import Module from "node:module";

const require = Module.createRequire(import.meta.url);
let conptyNative;

/**
 * The amount of time to wait for additional data after the conpty shell process has exited before
 * shutting down the socket. The timer will be reset if a new data event comes in after the timer
 * has started.
 */
const FLUSH_DATA_INTERVAL = 1000;
/**
 * This agent sits between the WindowsTerminal class and provides a common interface for both conpty
 * and winpty.
 */
export class WindowsPtyAgent {
    _useConpty;
    _inSocket;
    _outSocket;
    _pid = 0;
    _innerPid = 0;
    _innerPidHandle = 0;
    _closeTimeout;
    _exitCode;
    _conoutSocketWorker;
    _fd;
    _pty;
    _ptyNative;
    get inSocket() { return this._inSocket; }
    get outSocket() { return this._outSocket; }
    get fd() { return this._fd; }
    get innerPid() { return this._innerPid; }
    get pty() { return this._pty; }
    constructor(file, args, env, cwd, cols, rows, debug, _useConpty = true, conptyInheritCursor = false) {
        
        this._useConpty = this._getWindowsBuildNumber() >= 18309;
        
        if (this._useConpty) {
            
                try {
                    this._ptyNative = require('../build/Release/conpty.node');
                }
                catch (outerError) {
                    try {
                        this._ptyNative = require('../build/Debug/conpty.node');
                    }
                    catch (innerError) {
                        console.error('innerError', innerError);
                        // Re-throw the exception from the Release require if the Debug require fails as well
                        throw outerError;
                    }
                }
            
        }
        else {
            throw new Error(`Windws build number is to low? ${this._getWindowsBuildNumber()} >= 18309`);
        }
        
        // Sanitize input variable.
        cwd = path.resolve(cwd);
        // Compose command line
        const commandLine = argsToCommandLine(file, args);
        // Open pty session.
        
        
        const term = this._ptyNative.startProcess(file, cols, rows, debug, this._generatePipeName(), conptyInheritCursor);
        
        
        // Not available on windows.
        this._fd = term.fd;
        // Generated incremental number that has no real purpose besides  using it
        // as a terminal id.
        this._pty = term.pty;
        // Create terminal pipe IPC channel and forward to a local unix socket.
        this._outSocket = new Socket();
        this._outSocket.setEncoding('utf8');
        // The conout socket must be ready out on another thread to avoid deadlocks
        this._conoutSocketWorker = new ConoutConnection(term.conout);
        this._conoutSocketWorker.onReady(() => {
            this._conoutSocketWorker.connectSocket(this._outSocket);
        });
        this._outSocket.on('connect', () => {
            this._outSocket.emit('ready_datapipe');
        });
        const inSocketFD = fs.openSync(term.conin, 'w');
        this._inSocket = new Socket({
            fd: inSocketFD,
            readable: false,
            writable: true
        });
        this._inSocket.setEncoding('utf8');
        
            const connect = this._ptyNative.connect(this._pty, commandLine, cwd, env, c => this._$onProcessExit(c));
            this._innerPid = connect.pid;
        
    }
    resize(cols, rows) {
        
            if (this._exitCode !== undefined) {
                throw new Error('Cannot resize a pty that has already exited');
            }
            this._ptyNative.resize(this._pty, cols, rows);
            return;
        
        
    }
    clear() {
        
            this._ptyNative.clear(this._pty);
        
    }
    kill() {
        this._inSocket.readable = false;
        this._outSocket.readable = false;
        // Tell the agent to kill the pty, this releases handles to the process
        
            this._getConsoleProcessList().then(consoleProcessList => {
                consoleProcessList.forEach((pid) => {
                    try {
                        process.kill(pid);
                    }
                    catch (e) {
                        // Ignore if process cannot be found (kill ESRCH error)
                    }
                });
                this._ptyNative.kill(this._pty);
            });
        
        
        this._conoutSocketWorker.dispose();
    }
    _getConsoleProcessList() {
        return new Promise(resolve => {
            const agent = fork(path.join(__dirname, 'conpty_console_list_agent'), [this._innerPid.toString()]);
            agent.on('message', message => {
                clearTimeout(timeout);
                resolve(message.consoleProcessList);
            });
            const timeout = setTimeout(() => {
                // Something went wrong, just send back the shell PID
                agent.kill();
                resolve([this._innerPid]);
            }, 5000);
        });
    }
    get exitCode() {
            return this._exitCode;
    }
    _getWindowsBuildNumber() {
        const osVersion = (/(\d+)\.(\d+)\.(\d+)/g).exec(os.release());
        let buildNumber = 0;
        if (osVersion && osVersion.length === 4) {
            buildNumber = parseInt(osVersion[3]);
        }
        return buildNumber;
    }
    _generatePipeName() {
        return `conpty-${Math.random() * 10000000}`;
    }
    /**
     * Triggered from the native side when a contpy process exits.
     */
    _$onProcessExit(exitCode) {
        this._exitCode = exitCode;
        this._flushDataAndCleanUp();
        this._outSocket.on('data', () => this._flushDataAndCleanUp());
    }
    _flushDataAndCleanUp() {
        if (this._closeTimeout) {
            clearTimeout(this._closeTimeout);
        }
        this._closeTimeout = setTimeout(() => this._cleanUpProcess(), FLUSH_DATA_INTERVAL);
    }
    _cleanUpProcess() {
        this._inSocket.readable = false;
        this._outSocket.readable = false;
        this._outSocket.destroy();
    }
}
// Convert argc/argv into a Win32 command-line following the escaping convention
// documented on MSDN (e.g. see CommandLineToArgvW documentation). Copied from
// winpty project.
export function argsToCommandLine(file, args) {
    if (isCommandLine(args)) {
        if (args.length === 0) {
            return file;
        }
        return `${argsToCommandLine(file, [])} ${args}`;
    }
    const argv = [file];
    Array.prototype.push.apply(argv, args);
    let result = '';
    for (let argIndex = 0; argIndex < argv.length; argIndex++) {
        if (argIndex > 0) {
            result += ' ';
        }
        const arg = argv[argIndex];
        // if it is empty or it contains whitespace and is not already quoted
        const hasLopsidedEnclosingQuote = xOr((arg[0] !== '"'), (arg[arg.length - 1] !== '"'));
        const hasNoEnclosingQuotes = ((arg[0] !== '"') && (arg[arg.length - 1] !== '"'));
        const quote = arg === '' ||
            (arg.indexOf(' ') !== -1 ||
                arg.indexOf('\t') !== -1) &&
                ((arg.length > 1) &&
                    (hasLopsidedEnclosingQuote || hasNoEnclosingQuotes));
        if (quote) {
            result += '\"';
        }
        let bsCount = 0;
        for (let i = 0; i < arg.length; i++) {
            const p = arg[i];
            if (p === '\\') {
                bsCount++;
            }
            else if (p === '"') {
                result += repeatText('\\', bsCount * 2 + 1);
                result += '"';
                bsCount = 0;
            }
            else {
                result += repeatText('\\', bsCount);
                bsCount = 0;
                result += p;
            }
        }
        if (quote) {
            result += repeatText('\\', bsCount * 2);
            result += '\"';
        }
        else {
            result += repeatText('\\', bsCount);
        }
    }
    return result;
}
function isCommandLine(args) {
    return typeof args === 'string';
}
function repeatText(text, count) {
    let result = '';
    for (let i = 0; i < count; i++) {
        result += text;
    }
    return result;
}
function xOr(arg1, arg2) {
    return ((arg1 && !arg2) || (!arg1 && arg2));
}
