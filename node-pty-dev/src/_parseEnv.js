import { undefined } from './windowsPtyAgent';

export const _parseEnv = (env={}) => 
    Object.entries(env).filter(([_key,val])=>val).map(x=>x.join("="));


