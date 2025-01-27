/**
 * Copyright (c) 2012-2015, Christopher Jeffrey, Peter Sunde (MIT License)
 * Copyright (c) 2016, Daniel Imms (MIT License).
 * Copyright (c) 2018, Microsoft Corporation (MIT License).
 * Copyright (c) 2019, Frank Lemanschik (MIT License).
 */
import { Terminal, DEFAULT_COLS, DEFAULT_ROWS } from './terminal.js';
import { WindowsPtyAgent } from './windowsPtyAgent.js';
import { _checkType } from './rewrite/util.js';
import { _useConpty } from './windowsPtyAgent.js';
const getWindowsTerminal = (...args) => new Promise(resolve=>{
    return new WindowsTerminal(...args);
});
export default class WindowsTerminal extends Terminal {
    _isReady;
    _deferreds;
    _agent;
    constructor(
        file='cmd.exe', 
        args=[], 
        {
            env=process.env,
            cols=DEFAULT_COLS,
            rows=DEFAULT_ROWS,
            cwd=process.cwd(),
            name="",
            useDebug=false,
            useConpty=_useConpty(),
            useConptyDll=false, // Alternativ bundled dll
            conptyInheritCursor=false,
            encoding=""
        }
    ) {
        if (!env) {
            console.warn("opt.env is needed when calling the constructor");
        }
        if (encoding) {
            console.warn('Setting encoding on Windows is not supported');
        }
        _checkType('args', args, 'string', true);
        const agent = new WindowsPtyAgent(file, args, env, cwd, cols, rows, useDebug, useConpty, useConptyDll, conptyInheritCursor);
        super(opt, agent.outSocket, file,name || env.TERM || 'Windows Shell');
        this._file = file;
        this._name = name || env.TERM || 'Windows Shell';
        
        this._cols = cols;
        this._rows = rows;
        
        // If the terminal is ready
        this._isReady = false;
        // Functions that need to run after `ready` event is emitted.
        this._deferreds = [];
        // Create new termal.

        //this._agent = new WindowsPtyAgent(file, args, this._parseEnv(env), cwd, this._cols, this._rows, useDebug, useConpty, useConptyDll, conptyInheritCursor);
        this._socket = agent.outSocket;
        this._agent = agent;
        // Not available until `ready` event emitted.
        this._pid = this._agent.innerPid;
        this._fd = this._agent.fd;
        this._pty = this._agent.pty;
        // The forked windows terminal is not available until `ready` event is
        // emitted.
        this._agent.outSocket.on('ready_datapipe', () => {
            // These events needs to be forwarded.
            ['connect', 'data', 'end', 'timeout', 'drain'].forEach(event => {
                this._agent.outSocket.on(event, () => {
                    // Wait until the first data event is fired then we can run deferreds.
                    if (!this._isReady && event === 'data') {
                        // Terminal is now ready and we can avoid having to defer method
                        // calls.
                        this._isReady = true;
                        // Execute all deferred methods
                        this._deferreds.forEach(fn => {
                            // NB! In order to ensure that `this` has all its references
                            // updated any variable that need to be available in `this` before
                            // the deferred is run has to be declared above this forEach
                            // statement.
                            fn.run();
                        });
                        // Reset
                        this._deferreds = [];
                    }
                });
            });
            // Shutdown if `error` event is emitted.
            this._agent.outSocket.on('error', err => {
                // Close terminal session.
                this._close();
                // EIO, happens when someone closes our child process: the only process
                // in the terminal.
                // node < 0.6.14: errno 5
                // node >= 0.6.14: read EIO
                if (err.code) {
                    if (~err.code.indexOf('errno 5') || ~err.code.indexOf('EIO'))
                        return;
                }
                // Throw anything else.
                if (this.listeners('error').length < 2) {
                    throw err;
                }
            });
            // Cleanup after the socket is closed.
            this._socket.on('close', () => {
                this.emit('exit', this._agent.exitCode);
                this._close();
            });
        });

        this._readable = true;
        this._writable = true;
        this._forwardEvents();
    }
    _write(data) {
        this._defer(
            // TODO: test and remove this._doWrite
            this._agent.inSocket.write
            , data);
    }
    _doWrite(data) {
        //this._agent.inSocket.write(data);
    }
    /**
     * openpty
     */
    static open(options) {
        throw new Error('open() not supported on windows, use Fork() instead.');
    }
    /**
     * TTY
     */
    resize(cols, rows) {
        if (
            cols <= 0 || rows <= 0 || isNaN(cols) || isNaN(rows) || 
            cols === Infinity || rows === Infinity
        ) {
            throw new Error('resizing must be done using positive cols and rows');
        }
        this._defer(() => {
            this._agent.resize(cols, rows);
            this._cols = cols;
            this._rows = rows;
        });
    }
    clear() {
        this._defer(() => {
            this._agent.clear();
        });
    }
    destroy() {
        this._defer(() => {
            this.kill();
        });
    }
    kill(signal) {
        this._defer(() => {
            if (signal) {
                throw new Error('Signals not supported on windows.');
            }
            this._close();
            this._agent.kill();
        });
    }
    _defer(deferredFn, arg) {
        // If the terminal is ready, execute.
        if (this._isReady) {
            deferredFn.call(this, arg);
            return;
        }
        // Queue until terminal is ready.
        this._deferreds.push({
            run: () => deferredFn.call(this, arg)
        });
    }
    get process() { return this._name; }
    get master() { throw new Error('master is not supported on Windows'); }
    get slave() { throw new Error('slave is not supported on Windows'); }
}
