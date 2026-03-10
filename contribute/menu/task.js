// @ts-check

const vscode = require('vscode')

/** @type {vscode.Task | undefined} */
let currentSelectedTask

const startTaskCommand = vscode.commands.registerCommand('startTask', async () => {
    if (currentSelectedTask != undefined)
        vscode.tasks.executeTask(currentSelectedTask)
})

const selectTaskCommand = vscode.commands.registerCommand('selectTask', async () => {
    const tasks            = await vscode.tasks.fetchTasks()
    const selectedTaskName = await vscode.window.showQuickPick(tasks.map(task => task.name), {canPickMany: false})
    for (const task of tasks)
        if (task.name == selectedTaskName)
            currentSelectedTask = task
})

const openTasksJsonCommand = vscode.commands.registerCommand('openTasksJsonCommand', async () => {
    //vscode.window.showTextDocument(
    //    currentSelectedTask.
    //)
})

// USE INTERNAL COMMAND TO CHOOSE TASK, AND USE ON_DID_START_TASK TO LOG IT.

/** 
 * @param {vscode.ExtensionContext} context 
 * @returns {Promise<void>} 
 */
async function activate(context) {
    currentSelectedTask = (await vscode.tasks.fetchTasks())[0]
    context.subscriptions.push(startTaskCommand)
    context.subscriptions.push(selectTaskCommand)
    context.subscriptions.push(openTasksJsonCommand)
}

module.exports = {activate}
