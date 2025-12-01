let child_process = require("child_process")

try {
    child_process.execSync("git add .")
    child_process.execSync("git commit -m 'update before vsce publish'")
}
catch (error) { }

child_process.execSync("vsce publish patch")