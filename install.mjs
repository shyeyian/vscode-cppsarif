import child_process from 'child_process'
import fs            from 'fs'
import util          from 'util'
child_process.promises = new Object()
child_process.promises.execFile = util.promisify(child_process.execFile)

// Install extension
await child_process.promises.execFile('vsce', ['package', '-o', 'cpptheme.vsix'])
await child_process.promises.execFile('code', ['--install-extension', 'cpptheme.vsix'])
await fs.promises.rm('cpptheme.vsix')