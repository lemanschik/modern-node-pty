/**
 * Copyright (c) 2017, Daniel Imms (MIT License).
 * Copyright (c) 2018, Microsoft Corporation (MIT License).
 */
import assert from 'node:assert';
import test from 'node:test';
import { argsToCommandLine } from './windowsPtyAgent.js';
function check(file, args, expected) {
    assert.equal(argsToCommandLine(file, args), expected);
}
if (process.platform === 'win32') {
    

    test('argsToCommandLine Plain strings => doesn\'t quote plain string', () => {
        check('asdf', [], 'asdf');
    });
    test('argsToCommandLine Plain strings => doesn\'t escape backslashes', () => {
        check('\\asdf\\qwer\\', [], '\\asdf\\qwer\\');
    });
    test('argsToCommandLine Plain strings => doesn\'t escape multiple backslashes', () => {
        check('asdf\\\\qwer', [], 'asdf\\\\qwer');
    });
    test('argsToCommandLine Plain strings => adds backslashes before quotes', () => {
        check('"asdf"qwer"', [], '\\"asdf\\"qwer\\"');
    });
    test('argsToCommandLine Plain strings => escapes backslashes before quotes', () => {
        check('asdf\\"qwer', [], 'asdf\\\\\\"qwer');
    });


    test('argsToCommandLine Quoted strings => quotes string with spaces', () => {
        check('asdf qwer', [], '"asdf qwer"');
    });
    test('argsToCommandLine Quoted strings => quotes empty string', () => {
        check('', [], '""');
    });
    test('argsToCommandLine Quoted strings => quotes string with tabs', () => {
        check('asdf\tqwer', [], '"asdf\tqwer"');
    });
    test('argsToCommandLine Quoted strings => escapes only the last backslash', () => {
        check('\\asdf \\qwer\\', [], '"\\asdf \\qwer\\\\"');
    });
    test('argsToCommandLine Quoted strings => doesn\'t escape multiple backslashes', () => {
        check('asdf \\\\qwer', [], '"asdf \\\\qwer"');
    });
    test('argsToCommandLine Quoted strings => escapes backslashes before quotes', () => {
        check('asdf \\"qwer', [], '"asdf \\\\\\"qwer"');
    });
    test('argsToCommandLine Quoted strings => escapes multiple backslashes at the end', () => {
        check('asdf qwer\\\\', [], '"asdf qwer\\\\\\\\"');
    });


    test('argsToCommandLine Multiple arguments => joins arguments with spaces', () => {
        check('asdf', ['qwer zxcv', '', '"'], 'asdf "qwer zxcv" "" \\"');
    });
    test('argsToCommandLine Multiple arguments => array argument all in quotes', () => {
        check('asdf', ['"surounded by quotes"'], 'asdf \\"surounded by quotes\\"');
    });
    test('argsToCommandLine Multiple arguments => array argument quotes in the middle', () => {
        check('asdf', ['quotes "in the" middle'], 'asdf "quotes \\"in the\\" middle"');
    });
    test('argsToCommandLine Multiple arguments => array argument quotes near start', () => {
        check('asdf', ['"quotes" near start'], 'asdf "\\"quotes\\" near start"');
    });
    test('argsToCommandLine Multiple arguments => array argument quotes near end', () => {
        check('asdf', ['quotes "near end"'], 'asdf "quotes \\"near end\\""');
    });


    test('argsToCommandLine Args as CommandLine => should handle empty string', () => {
        check('file', '', 'file');
    });
    test('argsToCommandLine Args as CommandLine => should not change args', () => {
        check('file', 'foo bar baz', 'file foo bar baz');
        check('file', 'foo \\ba"r \baz', 'file foo \\ba"r \baz');
    });


    test('argsToCommandLine Real-world cases => quotes within quotes', () => {
        check('cmd.exe', ['/c', 'powershell -noexit -command \'Set-location \"C:\\user\"\''], 'cmd.exe /c "powershell -noexit -command \'Set-location \\\"C:\\user\\"\'"');
    });
    test('argsToCommandLine Real-world cases => space within quotes', () => {
        check('cmd.exe', ['/k', '"C:\\Users\\alros\\Desktop\\test script.bat"'], 'cmd.exe /k \\"C:\\Users\\alros\\Desktop\\test script.bat\\"');
    });


}
