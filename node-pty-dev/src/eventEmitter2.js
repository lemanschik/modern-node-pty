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
        this._listeners.push(listener);
        const disposable = {
            dispose: () => {
                // this._listeners = this._listeners.filter(entry=>listner !== entry);
                /**
                  * The current dispose algo disposes the first function that matches. While
                  * the same function could listen more then once to get a other behavior
                  * when this should create bugs then uncomment above and comment this
                  */
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
    fire(data) {
        this._listeners.forEach(
            listner=>listner.call(undefined,data)
        );
    }
}


/**
 * Use it with a array Property and get a disposable
 * To fire events do array.forEach(fn=>fn.call())
 * @param {*} array 
 * @param {*} listener 
 * @returns 
 */

export const getDisposable = (array, listener) => {
    array.push(listener);
    const disposable = {
        dispose: () => {
            for (let i = 0; i < array.length; i++) {
                if (array[i] === listener) {
                    array.splice(i, 1);
                    return;
                }
            }
        }
    };
    return disposable;
};