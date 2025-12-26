import fs from "fs";
import child_process from "child_process"
import util from "util"
child_process.promises = new Object()
child_process.promises.exec = util.promisify(child_process.exec)

// Git pull
await child_process.promises.exec("git pull")

// Git commit
try {
    await child_process.promises.exec("git add .")
    await child_process.promises.exec("git commit -m update")
} catch (_) { }

// Vsce upload
try {
    await fs.promises.access("vsce-token.txt")
} catch (_) {
    throw new Error("failed to upload vscode extension because vsce-token.txt is not found")
}
try {
    await child_process.promises.exec(`vsce publish patch --pat ${await fs.promises.readFile("vsce-token.txt")}`)
} catch (_) {
    throw new Error("failed to upload vsce extension") // Avoid vsce-token to be printed in error.
}

// Git push
await child_process.promises.exec("git push")