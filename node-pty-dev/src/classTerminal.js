const TerminalStream = new TransformStream({
    constructor(implementation) {
        this.implementation = implementation;
    }
})

const getUnixTerminal = (file='sh', args=[], {
            env=process.env,
            cols=DEFAULT_COLS,
            rows=DEFAULT_ROWS,
            cwd=process.cwd(),
            name="",
            encoding='utf8'
}) => {
        
            if (typeof args === 'string') {
                throw new Error('args as a string is not supported on unix.');
            }
            
            
          
            let resolve;
            const onExitPromise = new Promise(res=>(resolve=res));
            
            const term = pty.fork(
                file, 
                args,
                _parseEnv(
                    Object.assign(
                        env === process.env ? _sanitizeEnv() : env,
                        { PWD: cwd, TERM: name || env.TERM || 'xterm'}
                    )
                ),
                cwd,
                cols,
                rows,
                uid ?? -1,
                gid ?? -1,
                (encoding === 'utf8'),
                helperPath,
                (code, signal) => resolve({code,signal}));
            
                const onexit = ({code, signal}) => {
                    // XXX Sometimes a data event is emitted after exit. Wait til socket is
                    // destroyed.
                    if (!this._emittedClose) {
                        if (this._boundClose) {
                            return;
                        }
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
                            if (timeout !== null) {
                                clearTimeout(timeout);
                            }
                            this.emit('exit', code, signal);
                        });
                        return;
                    }
                    this.emit('exit', code, signal);
                };
                onExitPromise.then(onexit);

            const _socket = new tty.ReadStream(term.fd);
            const _pid = term.pid;
            const _fd = term.fd;
            const _pty = term.pty;
            const _file = file;
            const _name = name || env.TERM || 'xterm';



            return {
                agent, onExitPromise,
                _socket,
                _pid,
                _fd,
                _pty,
                _file,
                _name,
            }
}

const getWinTerminal = (
        file='cmd.exe', 
        args=[], 
        {
            env=process.env,
            cols=DEFAULT_COLS,
            rows=DEFAULT_ROWS,
            cwd=process.cwd(),
            name="",
            useDebug=false,
            useConpty=true,
            useConptyDll=false, 
            conptyInheritCursor=false,
        }
    ) => {
        const agent = new WindowsPtyAgent(file, args, env, cwd, cols, rows, useDebug, useConpty, useConptyDll, conptyInheritCursor);
        return {
            agent, socket, onExitPromise
        }
}