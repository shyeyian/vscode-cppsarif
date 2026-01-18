import child_process from 'child_process'
import fs            from 'fs'
import util          from 'util'
child_process.promises = new Object()
child_process.promises.execFile = util.promisify(child_process.execFile)

// Git pull
child_process.execFile
await child_process.promises.execFile('git', ['pull'])

// Git commit
try {
    await child_process.promises.execFile('git', ['add', '.'])
    await child_process.promises.execFile('git', ['commit', '-m', 'update'])
} catch (_) { }

// Vsce upload
await child_process.promises.execFile('vsce', ['publish', 'patch', '--pat', await fs.promises.readFile('vsce-token.txt')])

// Git push
await child_process.promises.execFile('git', ['push'])
