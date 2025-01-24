/**
 * Copyright (c) 2020, Microsoft Corporation (MIT License).
 */
import { Worker } from 'worker_threads';
import { getWorkerPipeName } from './shared/conout';
import { join } from 'path';
import { EventEmitter2 } from './eventEmitter2';
/**
 * The amount of time to wait for additional data after the conpty shell process has exited before
 * shutting down the worker and sockets. The timer will be reset if a new data event comes in after
 * the timer has started.
 */
const FLUSH_DATA_INTERVAL = 1000;
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
    _onReady = new EventEmitter2();
    get onReady() { return this._onReady.event; }
    constructor(_conoutPipeName) {
        this._conoutPipeName = _conoutPipeName;
        const workerData = { conoutPipeName: _conoutPipeName };
        const scriptPath = __dirname.replace('node_modules.asar', 'node_modules.asar.unpacked');
        this._worker = new Worker(join(scriptPath, 'worker/conoutSocketWorker.js'), { workerData });
        this._worker.on('message', (message) => {
            switch (message) {
                case 1 /* ConoutWorkerMessage.READY */:
                    this._onReady.fire();
                    return;
                default:
                    console.warn('Unexpected ConoutWorkerMessage', message);
            }
        });
    }
    dispose() {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        // Drain all data from the socket before closing
        this._drainDataAndClose();
    }
    connectSocket(socket) {
        socket.connect(getWorkerPipeName(this._conoutPipeName));
    }
    _drainDataAndClose() {
        if (this._drainTimeout) {
            clearTimeout(this._drainTimeout);
        }
        this._drainTimeout = setTimeout(() => this._destroySocket(), FLUSH_DATA_INTERVAL);
    }
    async _destroySocket() {
        await this._worker.terminate();
    }
}
