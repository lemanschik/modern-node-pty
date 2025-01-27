## Changelog
replace util assign with object assign
__dirname import.meta.dirname
replace !!() with Boolean()
remove references to winpty in favor of conpty only.
add createRequire to allow easy nativ module loading.

# pty-dev

Builds the ESM SRC as also nativ stuff

lib folder gets ignored thats a incremental result

the corrected and patched files are in src lib only serves as reference to them.

esm is the final build target for rollup
esm-dev is the lib folder bundled by rollup for comparison

# node-modern-pty
Node Modern PTY is a microsoft/node-pty fork that deprecates winpty support as also typescript src
It aims to be easyer to install and maintain on all devices and on current windows machines this is 
the only node-pty version that works with node 23+ ABI 9+


## Structure

the src folder contains our own src

the lib folder inside src/lib contains the tanspilled typescript src we only need to exec tsc on the typescript src once a none marginal upgrade got done and even not then.

the src/unix src/win directorys are near unmodifyed only winpty got deleted 

the bindings gyp has winpty removed.