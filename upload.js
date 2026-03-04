// @ts-check

const child_process = require('child_process')
const fs            = require('fs')
const util          = require('util')

async function upload() {
    // Git pull
    await util.promisify(child_process.execFile)('git', ['pull'])

    // Git commit
    try {
        await util.promisify(child_process.execFile)('git', ['add', '.'])
        await util.promisify(child_process.execFile)('git', ['commit', '-m', 'update'])
    } catch (error) { }

    // Vsce upload
    await util.promisify(child_process.execFile)('vsce', ['publish', 'patch', '--pat', (await fs.promises.readFile('vsce-token.txt')).toString()])

    // Git push
    await util.promisify(child_process.execFile)('git', ['push'])
}

upload()