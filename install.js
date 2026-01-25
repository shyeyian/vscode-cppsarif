const child_process = require('child_process')
const fs            = require('fs')
const util          = require('util')
child_process.promises = new Object()
child_process.promises.execFile = util.promisify(child_process.execFile)

async function main() {
    // Install extension
    await child_process.promises.execFile('vsce', ['package', '-o', 'cpptheme.vsix'])
    await child_process.promises.execFile('code', ['--install-extension', 'cpptheme.vsix'])
    await fs.promises.rm('cpptheme.vsix')
}

main()