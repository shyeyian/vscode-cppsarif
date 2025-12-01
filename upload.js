let child_process = require("child_process")

try {
    child_process.execSync("git add .")
    child_process.execSync("git commit -m update")
}
catch (error) { 
    // pass
}

child_process.execSync("vsce publish patch")
child_process.execSync("git push")
