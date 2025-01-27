import { EventEmitter } from 'node:events';
import { TransformStream } from 'node:stream/web';
import { Socket } from 'node:net';
/**
 * Copyright (c) 2020-2025, Frank Lemanschik (MIT License)
 * Use it with a array Property and get a disposable
 * To fire events do data => array.forEach(fn=>fn.call(undefined,data))
 * @param {*} array 
 * @param {*} listener 
 * @returns 
 */
export const getDisposable = (array, listener) => {
    array.push(listener);
    
    return {
        dispose() {
            for (let i = 0; i < array.length; i++) {
                if (array[i] === listener) {
                    array.splice(i, 1);
                    return;
                }
            }
        }
    };
};

/**
 * Copyright (c) 2025, Frank Lemanschik (MIT License).
 * The current dispose algo disposes the first function that matches. While
 * the same function could listen more then once to get a other behavior
 * when this should create bugs then refactor to Commented Out filter method
 * 
 * fire can be replaced by something that pushes and fire forEach
 */
export class EventEmitter2 {
    _listeners = [];
    event(listener) {
        // this._listeners = this._listeners.filter(entry=>listner !== entry);
        /**
         * The current dispose algo disposes the first function that matches. While
         * the same function could listen more then once to get a other behavior
         * when this should create bugs then uncomment above and comment this
         */
        return getDisposable(this._listeners, listener);
    };
    fire(data) {
        this._listeners.forEach(
            listner => listner.call(undefined,data)
        );
    }
}


/**
 * Copyright (c) 2012-2015, Christopher Jeffrey (MIT License)
 * Copyright (c) 2016, Daniel Imms (MIT License).
 * Copyright (c) 2018, Microsoft Corporation (MIT License).
 */
export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;
/**
 * Default messages to indicate PAUSE/RESUME for automatic flow control.
 * To avoid conflicts with rebound XON/XOFF control codes (such as on-my-zsh),
 * the sequences can be customized in `IPtyForkOptions`.
 */
export const FLOW_CONTROL_PAUSE = '\x13'; // defaults to XOFF
export const FLOW_CONTROL_RESUME = '\x11'; // defaults to XON

export const _checkType = (name, value, type, allowArray = false) => {
    if (value === undefined) {
        return;
    }
    if (allowArray) {
        if (Array.isArray(value)) {
            value.forEach((v, i) => {
                if (typeof v !== type) {
                    throw new Error(`${name}[${i}] must be a ${type} (not a ${typeof v[i]})`);
                }
            });
            return;
        }
    }
    if (typeof value !== type) {
        throw new Error(`${name} must be a ${type} (not a ${typeof value})`);
    }
}

export const checkOpts = (opt) => {
    // Do basic type checks here in case node-pty is being used within JavaScript. If the wrong
    // types go through to the C++ side it can lead to hard to diagnose exceptions.
    _checkType('name', opt.name ? opt.name : undefined, 'string');
    _checkType('cols', opt.cols ? opt.cols : undefined, 'number');
    _checkType('rows', opt.rows ? opt.rows : undefined, 'number');
    _checkType('cwd', opt.cwd ? opt.cwd : undefined, 'string');
    _checkType('env', opt.env ? opt.env : undefined, 'object');
    _checkType('uid', opt.uid ? opt.uid : undefined, 'number');
    _checkType('gid', opt.gid ? opt.gid : undefined, 'number');
    _checkType('encoding', opt.encoding ? opt.encoding : undefined, 'string');
}

// const _parseEnv = (env) => {
//     const keys = Object.keys(env || {});
//     const pairs = [];
//     for (let i = 0; i < keys.length; i++) {
//         if (keys[i] === undefined) {
//             continue;
//         }
//         pairs.push(keys[i] + '=' + env[keys[i]]);
//     }
//     return pairs;
// }
export const _parseEnv = (env={}) => 
    Object.entries(env).filter(
        ([_key,val])=>val
    ).map(
        entWithVal => entWithVal.join("=")
    );


export class Terminal extends TransformStream {
    _socket; // HACK: This is unsafe
    _pid = 0;
    _fd = 0;
    _pty;
    _file; // HACK: This is unsafe
    _name; // HACK: This is unsafe
    _cols = 0;
    _rows = 0;
    _readable = false;
    _writable = false;
    _internalee;
    _flowControlPause;
    _flowControlResume;
    handleFlowControl;
    _onData = new EventEmitter2();
    _onExit = new EventEmitter2();
    constructor({ 
        handleFlowControl=false,
        flowControlPause=FLOW_CONTROL_PAUSE,
        flowControlResume=FLOW_CONTROL_RESUME,
    }, ttySocket) {
        super({ 
            start(){}, 
            transform(data,controller){
                controller.enqueue(data);
            } 
        });
        // for 'close'
        this._internalee = new EventEmitter();
        this._socket = ttySocket;

        // setup flow control handling
        this.handleFlowControl = Boolean(handleFlowControl);
        this._flowControlPause = flowControlPause;
        this._flowControlResume = flowControlResume;
        checkOpts(opt);
    }
    write(data) {
        if (this.handleFlowControl) {
            // PAUSE/RESUME messages are not forwarded to the pty
            if (data === this._flowControlPause) {
                this.pause();
                return;
            }
            if (data === this._flowControlResume) {
                this.resume();
                return;
            }
        }
        // everything else goes to the real pty
        this._write(data);
    }
    _forwardEvents() {
        this.on('data', e => this._onData.fire(e));
        this.on('exit', (exitCode, signal) => this._onExit.fire({ exitCode, signal }));
    }
    setEncoding(encoding) {
        delete this._socket._decoder;
        if (encoding) {
            this._socket.setEncoding(encoding);
        }
    }
    on(eventName, listener) {
        const target = eventName === 'close' ? this._internalee : this._socket
        target.on(eventName, listener);
    }
    emit(eventName, ...args) {
        const target = eventName === 'close' ? this._internalee : this._socket
        target.emit.apply(target, eventName, ...args);
    }
    _close() {
        this._socket.readable = false;
        this.write = () => { };
        this.end = () => { };
        this._writable = false;
        this._readable = false;
    }
    get onData() { return this._onData.event; }
    get onExit() { return this._onExit.event; }
    get pid() { return this._pid; }
    get cols() { return this._cols; }
    get rows() { return this._rows; }
    get end() { this._socket.end; }
    get pipe() { return this._socket.pipe; }
    get pause() { return this._socket.pause; }
    get resume() { return this._socket.resume; }
    get addListener() { this.on; }
    get listeners() { return this._socket.listeners; }
    get removeListener() { return this._socket.removeListener; }
    get removeAllListeners() { return this._socket.removeAllListeners; }
    get once() { return this._socket.once; }
}

export const assign = Object.assign;

export { DEFAULT_COLS as D, EventEmitter2 as E, Terminal as T, DEFAULT_ROWS as a, assign as b };

// #region Examples to apply eg: Streams
// const me = new TransformStream({start(){},
//                                transform(data,controller){
//                                  console.log("Transform:",data);
//                                  controller.enqueue(data);
//                                }
//                                });
// function sendMessage(message, writableStream) {
//   // defaultWriter is of type WritableStreamDefaultWriter
//   const defaultWriter = writableStream.getWriter();
//   const encoder = new TextEncoder();
//   const encoded = encoder.encode(message, { stream: true });
//   encoded.forEach((chunk,idx) => {
//     defaultWriter.ready
//       .then(() => defaultWriter.write(chunk))
//       .then(() => {
//         console.log("Chunk written to sink. idx:", idx);
//       })
//       .catch((err) => {
//         console.log("Chunk error:", err);
//       });
//   });
//   // Call ready again to ensure that all chunks are written
//   //   before closing the writer.
//   defaultWriter.ready
//     .then(() => {
//       defaultWriter.close();
//     })
//     .then(() => 
//       console.log("All chunks written"),
//     (err) => {
//       console.log("Stream error:", err);
//     });
// }

// sendMessage("hi ukkakak ne",me.writable)
const defaultWriter = writableStream.getWriter();
const sendMsg = data => defaultWriter.ready.then(
    _ => defaultWriter.write(data), 
    err => console.error(
        "Chunk error:", err, "with data:", data
    ));

const closeWriter = _ => defaultWriter.ready.then(
    _ => defaultWriter.close(), 
    err => console.error(
        "Stream error:", err
    ));
// me.readable.pipeTo(new WritableStream({write: console.log }))