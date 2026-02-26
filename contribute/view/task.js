// @ts-check

const vscode = require('vscode')

/** @type {string} */
let selectedTaskLabel = ''

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.TreeView<any>} sarifView
 * @returns {void}
 */
function activate(context, sarifView) {
    const selectTaskCommand = vscode.commands.registerCommand('cppsarif.selectTask', async () => {
        const selectedTask = await _pickTaskLabel(selectedTaskLabel)
        if (selectedTask == undefined)
            return
        selectedTaskLabel = selectedTask
        _updateTaskDescription(sarifView)
    })

    const runTaskCommand = vscode.commands.registerCommand('cppsarif.runTask', async () => {
        const taskLabels = await _getWorkspaceTaskLabels()
        if (taskLabels.length == 0) {
            void vscode.window.showWarningMessage('tasks.json 中没有可运行任务')
            return
        }

        if (!taskLabels.includes(selectedTaskLabel)) {
            const selectedTask = await _pickTaskLabel(taskLabels[0])
            if (selectedTask == undefined)
                return
            selectedTaskLabel = selectedTask
            _updateTaskDescription(sarifView)
        }

        const task = await _findWorkspaceTaskByLabel(selectedTaskLabel)
        if (task == undefined) {
            void vscode.window.showWarningMessage(`未找到任务：${selectedTaskLabel}`)
            return
        }

        await vscode.tasks.executeTask(task)
    })

    const openTasksJsonCommand = vscode.commands.registerCommand('cppsarif.openTasksJson', async () => {
        const tasksJsonUri = await _ensureWorkspaceTasksJson()
        await vscode.window.showTextDocument(tasksJsonUri, {preview: false})
    })

    const tasksJsonWatcher = vscode.workspace.createFileSystemWatcher('**/.vscode/tasks.json')

    const refreshTaskSelectionWhenTaskFileChanged = vscode.Disposable.from(
        tasksJsonWatcher.onDidChange(() => void _syncSelectedTaskLabel(sarifView)),
        tasksJsonWatcher.onDidCreate(() => void _syncSelectedTaskLabel(sarifView)),
        tasksJsonWatcher.onDidDelete(() => void _syncSelectedTaskLabel(sarifView))
    )

    const refreshTaskSelectionWhenWorkspaceChanged = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void _syncSelectedTaskLabel(sarifView)
    })

    context.subscriptions.push(selectTaskCommand)
    context.subscriptions.push(runTaskCommand)
    context.subscriptions.push(openTasksJsonCommand)
    context.subscriptions.push(tasksJsonWatcher)
    context.subscriptions.push(refreshTaskSelectionWhenTaskFileChanged)
    context.subscriptions.push(refreshTaskSelectionWhenWorkspaceChanged)

    void _syncSelectedTaskLabel(sarifView)
}

/** @returns {Promise<string[]>} */
async function _getWorkspaceTaskLabels() {
    const tasks = await vscode.tasks.fetchTasks()
    const taskLabels = tasks
        .filter(task => task.source == 'Workspace')
        .map(task => task.name)
    return [...new Set(taskLabels)]
}

/**
 * @param {string} currentSelection
 * @returns {Promise<string | undefined>}
 */
async function _pickTaskLabel(currentSelection) {
    const taskLabels = await _getWorkspaceTaskLabels()
    if (taskLabels.length == 0) {
        void vscode.window.showWarningMessage('tasks.json 中没有可运行任务')
        return undefined
    }

    const selectedTask = await vscode.window.showQuickPick(taskLabels, {
        title: '选择任务',
        placeHolder: '从 .vscode/tasks.json 选择要运行的任务'
    })
    if (selectedTask == undefined)
        return undefined

    if (currentSelection != selectedTask)
        void vscode.window.showInformationMessage(`已选择任务：${selectedTask}`)
    return selectedTask
}

/**
 * @param {vscode.TreeView<any>} sarifView
 * @returns {Promise<void>}
 */
async function _syncSelectedTaskLabel(sarifView) {
    const taskLabels = await _getWorkspaceTaskLabels()
    if (taskLabels.length == 0)
        selectedTaskLabel = ''
    else if (!taskLabels.includes(selectedTaskLabel))
        selectedTaskLabel = taskLabels[0]

    _updateTaskDescription(sarifView)
}

/**
 * @param {vscode.TreeView<any>} sarifView
 * @returns {void}
 */
function _updateTaskDescription(sarifView) {
    sarifView.description = selectedTaskLabel == '' ? '未选任务' : `任务: ${selectedTaskLabel}`
}

/**
 * @param {string} label
 * @returns {Promise<vscode.Task | undefined>}
 */
async function _findWorkspaceTaskByLabel(label) {
    const tasks = await vscode.tasks.fetchTasks()
    return tasks.find(task => task.source == 'Workspace' && task.name == label)
}

/** @returns {Promise<vscode.Uri>} */
async function _ensureWorkspaceTasksJson() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (workspaceFolder == undefined)
        throw new Error('没有打开工作区，无法定位 tasks.json')

    const vscodeDirectory = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode')
    const tasksJsonPath = vscode.Uri.joinPath(vscodeDirectory, 'tasks.json')
    try {
        await vscode.workspace.fs.stat(tasksJsonPath)
    }
    catch {
        await vscode.workspace.fs.createDirectory(vscodeDirectory)
        const template = `{
    "version": "2.0.0",
    "tasks": []
}
`
        await vscode.workspace.fs.writeFile(tasksJsonPath, Buffer.from(template))
        void vscode.window.showInformationMessage('已创建 .vscode/tasks.json')
    }

    return tasksJsonPath
}

module.exports = {activate}
