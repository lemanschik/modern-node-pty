/**
 * Copyright (c) 2012-2015, Christopher Jeffrey, Peter Sunde (MIT License)
 * Copyright (c) 2016, Daniel Imms (MIT License).
 * Copyright (c) 2018, Microsoft Corporation (MIT License).
 * Copyright (c) 2019, Frank Lemanschik (MIT License).
 */
/** TODO: Refactor to Webstreams */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Socket } from 'net';
import { fork } from 'child_process';
import { createRequire } from 'node:module';
import { _parseEnv } from './_parseEnv.js';
const require = createRequire(import.meta.url);

/**
 * Copyright (c) 2020, Microsoft Corporation (MIT License).
 */
import { Worker } from 'worker_threads';
import { getWorkerPipeName } from './shared/conout.js';
import { join } from 'path';
import { EventEmitter2 } from './eventEmitter2.js';
/**
 * The amount of time to wait for additional data after the conpty shell process has exited before
 * shutting down the worker and sockets. The timer will be reset if a new data event comes in after
 * the timer has started.
 */
const FLUSH_DATA_INTERVAL = 1000;

const workerScript = () => import('node:worker_threads').then(({ parentPort, workerData})=>{
    import('node:net').then(({ Socket, createServer })=>{
        const conoutPipeName = workerData.conoutPipeName;
        const conoutSocket = new Socket();
        conoutSocket.setEncoding('utf8');
        conoutSocket.connect(conoutPipeName, () => {
            const server = createServer(workerSocket => {
                conoutSocket.pipe(workerSocket);
            });
            server.listen(conoutPipeName+"-worker");
            if (!parentPort) {
                throw new Error('worker_threads parentPort is null');
            }
            parentPort.postMessage(1 /* ConoutWorkerMessage.READY */);
        });        
    })
});

/**
 * Connects to and manages the lifecycle of the conout socket. This socket must be drained on
 * another thread in order to avoid deadlocks where Conpty waits for the out socket to drain
 * when `ClosePseudoConsole` is called. This happens when data is being written to the terminal when
 * the pty is closed.
 *
 * See also:
 * - https://github.com/microsoft/node-pty/issues/375
 * - https://github.com/microsoft/vscode/issues/76548
 * - https://github.com/microsoft/terminal/issues/1810
 * - https://docs.microsoft.com/en-us/windows/console/closepseudoconsole
 */
export class ConoutConnection {
    _conoutPipeName;
    _worker;
    _drainTimeout;
    _isDisposed = false;
    constructor(_conoutPipeName,cb) {
        this._conoutPipeName = _conoutPipeName;
        const workerData = { conoutPipeName: _conoutPipeName };
        // const scriptPath = import.meta.dirname.replace('node_modules.asar', 'node_modules.asar.unpacked');
        this._worker = new Worker(`(${workerScript})()`, { workerData, eval:true });
    }
    dispose() {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        // Drain all data from the socket before closing
        if (this._drainTimeout) {
            clearTimeout(this._drainTimeout);
        }
        this._drainTimeout = setTimeout(() => this._worker.terminate(), FLUSH_DATA_INTERVAL);;
    }
    
}
// TODO: it will break when buildnumer longer then 4
export const _useConpty = () => {
    const osVersion = (/(\d+)\.(\d+)\.(\d+)/g).exec(os.release());
    const buildNumber = (osVersion && osVersion.length === 4) ? parseInt(osVersion[3]) : 0;
    // Buildnumer is higher then 18309
    return buildNumber >= 18309;
}

/**
 * This agent sits between the WindowsTerminal class and provides a common interface for both conpty
 * and winpty.
 */
export class WindowsPtyAgent {
    _useConpty=_useConpty();
    _useConptyDll=false;
    _inSocket;
    _outSocket;
    _pid = 0;
    _innerPid = 0;
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
    constructor(file, args, env, cwd, cols, rows, debug, useConpty=_useConpty(), _useConptyDll = false, conptyInheritCursor = false) {
        this._useConpty = useConpty 
        this._useConptyDll = _useConptyDll;
        
        // Buildnumer is higher then 18309
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
            throw new Error("No Conpty Support for this windows build")
        }
          
        // Sanitize input variable.
        cwd = path.resolve(cwd);
        // Compose command line
        const commandLine = argsToCommandLine(file, args);
        // Open pty session.
        const term = this._ptyNative.startProcess(
            file, cols, rows, debug, `conpty-${crypto.randomUUID()}`,
            conptyInheritCursor, this._useConptyDll
        );

        // Not available on windows.
        this._fd = term.fd;
        // Generated incremental number that has no real purpose besides  using it
        // as a terminal id.
        this._pty = term.pty;
        
        // Setup outSocket
        // Create terminal pipe IPC channel and forward to a local unix socket.
        // Step 2 
        this._outSocket = new Socket().on('connect', () => {
            this._outSocket.emit('ready_datapipe');
        }).setEncoding('utf8');
              
        // The conout socket must be ready out on another thread to avoid deadlocks
        const conoutPipeName = term.conout;
        // creates conoutPipeName+"-worker" socket
        this._conoutSocketWorker = new ConoutConnection(conoutPipeName);
        // Step 1 connect the outSocket
        this._conoutSocketWorker._worker.on('message', (message) => {
            switch (message) {
                case 1 /* ConoutWorkerMessage.READY */:
                    this._outSocket.connect(conoutPipeName+"-worker");
                    return;
                default:
                    console.warn('Unexpected ConoutWorkerMessage', message);
            }
        });
        // Setup inSocket
        const inSocketFD = fs.openSync(term.conin, 'w');
        this._inSocket = new Socket({
            fd: inSocketFD,
            readable: false,
            writable: true
        });
        this._inSocket.setEncoding('utf8');
        const connect = this._ptyNative.connect(this._pty, commandLine, cwd, _parseEnv(env), c => this._$onProcessExit(c));
        this._innerPid = connect.pid;
    }
    resize(cols, rows) {
        if (this.exitCode !== undefined) {
            throw new Error('Cannot resize a pty that has already exited');
        }
        this._ptyNative.resize(this._pty, cols, rows, this._useConptyDll);
        return;
    }
    clear() {
        this._ptyNative.clear(this._pty, this._useConptyDll);
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
            this._ptyNative.kill(this._pty, this._useConptyDll);
        });
    
        this._conoutSocketWorker.dispose();
    }
    _getConsoleProcessList() {
        return new Promise(resolve => {
            const agent = fork(
                path.join(import.meta.dirname, 'conpty_console_list_agent'),
                [this._innerPid.toString()]
            );
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
    /**
     * Triggered from the native side when a contpy process exits.
     */
    _$onProcessExit(exitCode) {
        this.exitCode = exitCode;
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
const xOr = (arg1, arg2) => ((arg1 && !arg2) || (!arg1 && arg2));
// Convert argc/argv into a Win32 command-line following the escaping convention
// documented on MSDN (e.g. see CommandLineToArgvW documentation). Copied from
// winpty project.
export function argsToCommandLine(file, args) {
    if (typeof args === 'string') {
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
            } else if (p === '"') {
                result += new Array(bsCount * 2 + 1).fill('\\').join("");
                result += '"';
                bsCount = 0;
            } else {
                result += new Array(bsCount).fill('\\').join("");
                result += p;
                bsCount = 0;
            }
        }

        if (quote) {
            result += new Array(bsCount * 2).fill('\\').join("");
            result += '\"';
        }
        else {
            result += new Array(bsCount).fill('\\').join("");
        }
    }
    return result;
}