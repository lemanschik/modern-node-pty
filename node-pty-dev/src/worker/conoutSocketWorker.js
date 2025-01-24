/**
 * Copyright (c) 2020, Microsoft Corporation (MIT License).
 */
import { parentPort, workerData } from 'worker_threads';
import { Socket, createServer } from 'net';
import { getWorkerPipeName } from '../shared/conout';
const conoutPipeName = workerData.conoutPipeName;
const conoutSocket = new Socket();
conoutSocket.setEncoding('utf8');
conoutSocket.connect(conoutPipeName, () => {
    const server = createServer(workerSocket => {
        conoutSocket.pipe(workerSocket);
    });
    server.listen(getWorkerPipeName(conoutPipeName));
    if (!parentPort) {
        throw new Error('worker_threads parentPort is null');
    }
    parentPort.postMessage(1 /* ConoutWorkerMessage.READY */);
});
