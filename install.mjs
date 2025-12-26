import child_process from "child_process"
import util from "util"
child_process.promises = new Object()
child_process.promises.exec = util.promisify(child_process.exec)

// Install extension
await child_process.promises.exec("vsce package")
await child_process.promises.exec("code --install-extension *.vsix")
await child_process.promises.exec("rm *.vsix")