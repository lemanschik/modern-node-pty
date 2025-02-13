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
        // this._worker.on('message', (message) => {
        //     switch (message) {
        //         case 1 /* ConoutWorkerMessage.READY */:
        //             cb();
        //             return;
        //         default:
        //             console.warn('Unexpected ConoutWorkerMessage', message);
        //     }
        // });
    }
    dispose() {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        // Drain all data from the socket before closing
        this._drainDataAndClose();
    }
    _drainDataAndClose() {
        if (this._drainTimeout) {
            clearTimeout(this._drainTimeout);
        }
        this._drainTimeout = setTimeout(() => this._destroySocket(), FLUSH_DATA_INTERVAL);
    }
    _destroySocket() {
        return this._worker.terminate();
    }
}
