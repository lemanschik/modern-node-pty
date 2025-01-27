/**
 * Copyright (c) 2019, Microsoft Corporation (MIT License).
 * Given 
 */
import assert from 'node:assert';
import test from 'node:test';
import { EventEmitter2 } from './eventEmitter2.js';

test('should fire listeners multiple times', () => {
    const order = [];
    const emitter = new EventEmitter2();
    emitter.event(data => order.push(data + 'a'));
    emitter.event(data => order.push(data + 'b'));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepEqual(order, ['1a', '1b', '2a', '2b']);
});
test('should not fire listeners once disposed', () => {
    const order = [];
    const emitter = new EventEmitter2();
    emitter.event(data => order.push(data + 'a'));
    const disposeB = emitter.event(data => order.push(data + 'b'));
    emitter.event(data => order.push(data + 'c'));
    emitter.fire(1);
    disposeB.dispose();
    emitter.fire(2);
    assert.deepEqual(order, ['1a', '1b', '1c', '2a', '2c']);
});

