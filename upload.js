let child_process = require("child_process")

child_process.execSync("git add .")
child_process.execSync("git commit -m 'update'")
child_process.execSync("git push")
child_process.execSync("vsce publish patch")
