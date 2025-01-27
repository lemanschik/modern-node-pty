/**
 * Copyright (c) 2017, Daniel Imms (MIT License).
 * Copyright (c) 2018, Microsoft Corporation (MIT License).
 */
import * as assert from 'assert';
import { WindowsTerminal } from './windowsTerminal.js';
import { UnixTerminal } from './unixTerminal.js';
import { Terminal } from './terminal.js';
const terminalConstructor = (process.platform === 'win32') ? WindowsTerminal : UnixTerminal;
const SHELL = (process.platform === 'win32') ? 'cmd.exe' : '/bin/bash';
let terminalCtor;
if (process.platform === 'win32') {
    terminalCtor = require('./windowsTerminal');
}
else {
    terminalCtor = require('./unixTerminal');
}
class TestTerminal extends Terminal {
    checkType(name, value, type, allowArray = false) {
        this._checkType(name, value, type, allowArray);
    }
    _write(data) {
        throw new Error('Method not implemented.');
    }
    resize(cols, rows) {
        throw new Error('Method not implemented.');
    }
    clear() {
        throw new Error('Method not implemented.');
    }
    destroy() {
        throw new Error('Method not implemented.');
    }
    kill(signal) {
        throw new Error('Method not implemented.');
    }
    get process() {
        throw new Error('Method not implemented.');
    }
    get master() {
        throw new Error('Method not implemented.');
    }
    get slave() {
        throw new Error('Method not implemented.');
    }
}
describe('Terminal', () => {
    describe('constructor', () => {
        it('should do basic type checks', () => {
            assert.throws(() => new terminalCtor('a', 'b', { 'name': {} }), 'name must be a string (not a object)');
        });
    });
    describe('checkType', () => {
        it('should throw for the wrong type', () => {
            const t = new TestTerminal();
            assert.doesNotThrow(() => t.checkType('foo', 'test', 'string'));
            assert.doesNotThrow(() => t.checkType('foo', 1, 'number'));
            assert.doesNotThrow(() => t.checkType('foo', {}, 'object'));
            assert.throws(() => t.checkType('foo', 'test', 'number'));
            assert.throws(() => t.checkType('foo', 1, 'object'));
            assert.throws(() => t.checkType('foo', {}, 'string'));
        });
        it('should throw for wrong types within arrays', () => {
            const t = new TestTerminal();
            assert.doesNotThrow(() => t.checkType('foo', ['test'], 'string', true));
            assert.doesNotThrow(() => t.checkType('foo', [1], 'number', true));
            assert.doesNotThrow(() => t.checkType('foo', [{}], 'object', true));
            assert.throws(() => t.checkType('foo', ['test'], 'number', true));
            assert.throws(() => t.checkType('foo', [1], 'object', true));
            assert.throws(() => t.checkType('foo', [{}], 'string', true));
        });
    });
    describe('automatic flow control', () => {
        it('should respect ctor flow control options', () => {
            const pty = new terminalConstructor(SHELL, [], { handleFlowControl: true, flowControlPause: 'abc', flowControlResume: '123' });
            assert.equal(pty.handleFlowControl, true);
            assert.equal(pty._flowControlPause, 'abc');
            assert.equal(pty._flowControlResume, '123');
        });
        // TODO: I don't think this test ever worked due to pollUntil being used incorrectly
        // it('should do flow control automatically', async function(): Promise<void> {
        //   // Flow control doesn't work on Windows
        //   if (process.platform === 'win32') {
        //     return;
        //   }
        //   this.timeout(10000);
        //   const pty = new terminalConstructor(SHELL, [], {handleFlowControl: true, flowControlPause: 'PAUSE', flowControlResume: 'RESUME'});
        //   let read: string = '';
        //   pty.on('data', data => read += data);
        //   pty.on('pause', () => read += 'paused');
        //   pty.on('resume', () => read += 'resumed');
        //   pty.write('1');
        //   pty.write('PAUSE');
        //   pty.write('2');
        //   pty.write('RESUME');
        //   pty.write('3');
        //   await pollUntil(() => {
        //     return stripEscapeSequences(read).endsWith('1pausedresumed23');
        //   }, 100, 10);
        // });
    });
});
function stripEscapeSequences(data) {
    return data.replace(/\u001b\[0K/, '');
}
