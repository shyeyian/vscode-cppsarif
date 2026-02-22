// @ts-check

const child_process = require('child_process')
const fs            = require('fs')
const util          = require('util')

async function main() {
    // Git pull
    await _execFile('git', ['pull'])

    // Git commit
    try {
        await _execFile('git', ['add', '.'])
        await _execFile('git', ['commit', '-m', 'update'])
    } catch (_) { }

    // Vsce upload
    await _execFile('vsce', ['publish', 'patch', '--pat', (await fs.promises.readFile('vsce-token.txt')).toString()])

    // Git push
    await _execFile('git', ['push'])
}

const _execFile = util.promisify(child_process.execFile)

main()