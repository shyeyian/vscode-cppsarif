// @ts-check

const child_process = require('child_process')
const fs            = require('fs')
const util          = require('util')

async function main() {
    // Install extension
    await _execFile('vsce', ['package', '-o', 'cpptheme.vsix'])
    await _execFile('code', ['--install-extension', 'cpptheme.vsix'])
    await fs.promises.rm('cpptheme.vsix')
}

const _execFile = util.promisify(child_process.execFile)

main()