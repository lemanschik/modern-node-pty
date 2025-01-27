/**
 * Copyright (c) 2019, Frank Lemanschik (MIT License).
 */
import * as path from 'node:path';
import * as tty from 'node:tty';
import { Terminal, DEFAULT_COLS, DEFAULT_ROWS } from './terminal.js';
import { createRequire } from 'node:module';
import { _parseEnv } from './_parseEnv.js';
const require = createRequire(import.meta.url);
let PtyNode;
let helperDir = "Release";

try {
    PtyNode = require('../build/Release/pty.node');
} catch (outerError) {
    try {
        PtyNode = require('../build/Debug/pty.node');
        helperDir = 'Debug'
    } catch (innerError) {
        console.error('innerError', innerError);
        // Re-throw the exception from the Release require 
        // if the Debug require fails as well
        throw outerError;
    }
}

// handle electron quirks
const helperPath = path.resolve(
    import.meta.dirname, `../build/${helperDir}/spawn-helper`
).replace(
    'app.asar', 'app.asar.unpacked'
).replace(
    'node_modules.asar', 'node_modules.asar.unpacked'
);

const _sideEffectSanitizeEnv = (env={}) => {
    // Make sure we didn't start our server from inside tmux.
    delete env['TMUX'];
    delete env['TMUX_PANE'];
    // Make sure we didn't start our server from inside screen.
    // http://web.mit.edu/gnu/doc/html/screen_20.html
    delete env['STY'];
    delete env['WINDOW'];
    // Delete some variables that might confuse our terminal.
    delete env['WINDOWID'];
    delete env['TERMCAP'];
    delete env['COLUMNS'];
    delete env['LINES'];
}

const _sanitizeEnv = () => {
    const env = Object.assign({},process.env);
    _sideEffectSanitizeEnv(env);
    return env;
}

// #region UnixTerminal
const DESTROY_SOCKET_TIMEOUT_MS = 200;
export default class UnixTerminal extends Terminal {
    _fd;
    _pty;
    _file;
    _name;
    _readable;
    _writable;
    _boundClose = false;
    _emittedClose = false;
    _master;
    _slave;
    get master() { return this._master; }
    get slave() { return this._slave; }
    constructor(
        file='sh', 
        args=[], 
        { 
            env=process.env,
            cols=DEFAULT_COLS,
            rows=DEFAULT_ROWS,
            cwd=process.cwd(),
            env=process.env,
            encoding='utf8',
            name="",
            uid=-1,
            gid=-1,
            ...opts
        }
    ) {
        if (typeof args === 'string') {
            throw new Error('args as a string is not supported on unix.');
        }
 
        // const uid = opt.uid ?? -1;
        // const gid = opt.gid ?? -1;
        const useTerm = name || env.TERM || 'xterm';
            
        const parsedEnv = _parseEnv(Object.assign(
            env === process.env ? _sanitizeEnv() : _sideEffectSanitizeEnv(env), 
            { TERM: useTerm, PWD: cwd }
        ));

        let resolveTermExitPromise;
        const termExitPromise = new Promise(res=>(resolveTermExitPromise=res));
        const term = PtyNode.fork(
            file, args, parsedEnv, cwd, cols, rows, uid, gid, (encoding === 'utf8'),
            helperPath, (code, signal) => resolveTermExitPromise({ code, signal })
        );
        
        const socket = new tty.ReadStream(term.fd);
        if (encoding) {
            socket.setEncoding(encoding);
        }

        // #region UnixTerminal Super
        super({
            env, cols, rows, cwd, env, encoding, 
            name, uid, gid, ...opts
        }, socket, file, useTerm);

        termExitPromise.then(({code, signal}) => {
            // XXX Sometimes a data event is emitted after exit. 
            // Wait til socket is destroyed.
            if (!this._emittedClose) {
                if (this._boundClose) { return; }
                this._boundClose = true;
                // From macOS High Sierra 10.13.2 sometimes the socket never gets
                // closed. A timeout is applied here to avoid the terminal never being
                // destroyed when this occurs.
                let timeout = setTimeout(() => {
                    timeout = null;
                    // Destroying the socket now will cause the close event to fire
                    this._socket.destroy();
                }, DESTROY_SOCKET_TIMEOUT_MS);
                this.once('close', () => {
                    if (timeout) {
                        clearTimeout(timeout);
                    }
                    this.emit('exit', code, signal);
                });
                return;
            }
            this.emit('exit', code, signal);
        });

        // setup
        socket.on('error', (err) => {
            // NOTE: fs.ReadStream gets EAGAIN twice at first:
            if (err.code) {
                if (~err.code.indexOf('EAGAIN')) {
                    return;
                }
            }
            // close
            this._close();
            // EIO on exit from fs.ReadStream:
            if (!this._emittedClose) {
                this._emittedClose = true;
                this.emit('close');
            }
            // EIO, happens when someone closes our child process: the only process in
            // the terminal.
            // node < 0.6.14: errno 5
            // node >= 0.6.14: read EIO
            if (err.code) {
                if (~err.code.indexOf('errno 5') || ~err.code.indexOf('EIO')) {
                    return;
                }
            }
            // throw anything else
            if (this.listeners('error').length < 2) {
                throw err;
            }
        });
        this._socket = socket;
        this._cols = cols;
        this._rows = rows;
        this._pid = term.pid;
        this._fd = term.fd;
        this._pty = term.pty;
        this._file = file;
        this._name = useTerm;
        this._readable = true;
        this._writable = true;
        this._socket.on('close', () => {
            if (this._emittedClose) {
                return;
            }
            this._emittedClose = true;
            this._close();
            this.emit('close');
        });
        this._forwardEvents();
    }
    get _write() { this._socket.write; }
    /* Accessors */
    get fd() { return this._fd; }
    get ptsName() { return this._pty; }
    /**
     * openpty
     */
    static open(opt) {
        // ByPasses the constructor()
        const unixTerminal = Object.create(UnixTerminal.prototype);
        opt = opt || {};
        if (arguments.length > 1) {
            opt = {
                cols: arguments[1],
                rows: arguments[2]
            };
        }
        const cols = opt.cols || DEFAULT_COLS;
        const rows = opt.rows || DEFAULT_ROWS;
        const encoding = (opt.encoding === undefined ? 'utf8' : opt.encoding);
        // open
        const term = PtyNode.open(cols, rows);
        unixTerminal._master = new tty.ReadStream(term.master);
        if (encoding !== null) {
            unixTerminal._master.setEncoding(encoding);
        }
        unixTerminal._master.resume();
        unixTerminal._slave = new tty.ReadStream(term.slave);
        if (encoding !== null) {
            unixTerminal._slave.setEncoding(encoding);
        }
        unixTerminal._slave.resume();
        unixTerminal._socket = unixTerminal._master;
        unixTerminal._pid = -1;
        unixTerminal._fd = term.master;
        unixTerminal._pty = term.pty;
        unixTerminal._file = process.argv[0] || 'node';
        unixTerminal._name = process.env.TERM || '';
        unixTerminal._readable = true;
        unixTerminal._writable = true;
        unixTerminal._socket.on('error', err => {
            unixTerminal._close();
            if (unixTerminal.listeners('error').length < 2) {
                throw err;
            }
        });
        unixTerminal._socket.on('close', () => {
            unixTerminal._close();
        });
        return unixTerminal;
    }
    destroy() {
        this._close();
        // Need to close the read stream so node stops reading a dead file
        // descriptor. Then we can safely SIGHUP the shell.
        this._socket.once('close', () => {
            this.kill('SIGHUP');
        });
        this._socket.destroy();
    }
    kill(signal) {
        try {
            process.kill(this.pid, signal || 'SIGHUP');
        }
        catch (e) { /* swallow */ }
    }
    /**
     * Gets the name of the process.
     */
    get process() {
        if (process.platform === 'darwin') {
            const title = PtyNode.process(this._fd);
            return (title !== 'kernel_task') ? title : this._file;
        }
        return PtyNode.process(this._fd, this._pty) || this._file;
    }
    /**
     * TTY
     */
    resize(cols, rows) {
        if (cols <= 0 || rows <= 0 || isNaN(cols) || isNaN(rows) || cols === Infinity || rows === Infinity) {
            throw new Error('resizing must be done using positive cols and rows');
        }
        PtyNode.resize(this._fd, cols, rows);
        this._cols = cols;
        this._rows = rows;
    }
    clear() { }
}
