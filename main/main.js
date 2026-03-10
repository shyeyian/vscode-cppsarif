// @ts-check

const vscode = require('vscode')
const sarif  = require('../contribute/view/sarif')
const task   = require('../contribute/menu/task')

/** 
 * @param {vscode.ExtensionContext} context
 * @returns {void}
 */
function activate(context) {
    sarif.activate(context)
    task .activate(context)
}

module.exports = {activate}
