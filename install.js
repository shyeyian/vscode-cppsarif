let child_process = require("child_process")

child_process.execSync("vsce package")
child_process.execSync("code --install-extension *.vsix")
child_process.execSync("rm *.vsix")