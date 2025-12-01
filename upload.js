let child_process = require("child_process")
child_process.exec("git commit -m update")
child_process.exec("vsce publish patch")