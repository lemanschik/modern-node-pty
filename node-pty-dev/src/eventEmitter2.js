/**
 * Copyright (c) 2019, Microsoft Corporation (MIT License).
 */
export class EventEmitter2 {
    _listeners = [];
    _event;
    get event() {
        if (!this._event) {
            this._event = (listener) => {
                this._listeners.push(listener);
                const disposable = {
                    dispose: () => {
                        for (let i = 0; i < this._listeners.length; i++) {
                            if (this._listeners[i] === listener) {
                                this._listeners.splice(i, 1);
                                return;
                            }
                        }
                    }
                };
                return disposable;
            };
        }
        return this._event;
    }
    fire(data) {
        const queue = [];
        for (let i = 0; i < this._listeners.length; i++) {
            queue.push(this._listeners[i]);
        }
        for (let i = 0; i < queue.length; i++) {
            queue[i].call(undefined, data);
        }
    }
}
