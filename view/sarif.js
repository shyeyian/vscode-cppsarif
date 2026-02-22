// @ts-check

const path   = require('path')
const vscode = require('vscode')
module.exports = {activate}

/**
 * @param {vscode.ExtensionContext} context
 * @returns {void}
 */
function activate(context) {
    context.subscriptions.push(sarifView)
    context.subscriptions.push(sarifRefreshCommand)
    context.subscriptions.push(sarifRefreshDaemon)
    context.subscriptions.push(sarifFocusDaemon)
    context.subscriptions.push(showPhysicalLocationCommand)
}

/**
 * @implements {vscode.TreeDataProvider<SarifFile | SarifResult | SarifRelatedLocation>}
 */
class Sarif {
    /** @type {vscode.EventEmitter<void>} */
    refreshEmitter 

    /** @type {vscode.Event<void>} */
    onDidChangeTreeData

    constructor() {
        this.refreshEmitter      = new vscode.EventEmitter()
        this.onDidChangeTreeData = this.refreshEmitter.event
        this._sarifFileList      = new SarifFileList()
    }

    /**
     * @param {SarifFile | SarifResult | SarifRelatedLocation} element
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element) {
        const treeItem = element.treeItem
        treeItem.collapsibleState = 
            element.children.length >= 1 ? 
                vscode.TreeItemCollapsibleState.Collapsed :
                vscode.TreeItemCollapsibleState.None
        return treeItem
    }

    /**
     * @param {void | SarifFile | SarifResult | SarifRelatedLocation} element
     * @returns {Promise<SarifFile[] | SarifResult[] | SarifRelatedLocation[]>}
     */
    async getChildren(element) {
        if (element == undefined) {
            this._sarifFileList = await new SarifFileList().create() 
            return this._sarifFileList.children
        }
        else
            return element.children
    }

    /**
     * @returns {void}
     */
    refresh() {
        this.refreshEmitter.fire()
    }

    /** @type {SarifFileList} */
    _sarifFileList
}

class SarifFileList {
    /** @type {SarifFile[]} */
    children

    constructor() {
        this.children = []
    }

    /** @returns {Promise<SarifFileList>} */
    async create() {
        if (vscode.workspace.workspaceFolders != undefined)
            for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                const directory = vscode.Uri.joinPath(workspaceFolder.uri, vscode.workspace.getConfiguration('cppsarif').get('sarifDirectory') ?? '.')
                    try {
                        for await (const file of _recursiveIterateDirectory(directory))
                            if (file.path.endsWith('.sarif')) {
                                try {
                                    const sarifFile = await new SarifFile().read(directory, file)
                                    if (sarifFile.children.length >= 1)
                                        this.children.push(sarifFile)
                                }
                                catch (error) {
                                    console.warn(`reading sarif file failed (with file = ${file}: ${error}`)
                                }
                            }
                    }
                    catch (error) {
                        console.warn(`reading sarif directory failed (with directory = ${directory}): ${error}`)
                    }
                }
        return this
    }
}

class SarifFile {    
    /** @type {vscode.TreeItem} */
    treeItem

    /** @type {SarifResult[]} */
    children

    constructor() {
        this.treeItem = new vscode.TreeItem('')
        this.children = []
    }

    /**
     * @param {vscode.Uri} directory
     * @param {vscode.Uri} file
     * @returns {Promise<SarifFile>}
     */
    async read(directory, file) {
        const sarif            = JSON.parse((await vscode.workspace.fs.readFile(file)).toString())
        this.treeItem          = new vscode.TreeItem('')
        this.treeItem.label    = path.relative(directory.fsPath, file.fsPath).replace(/\.sarif$/, '')
        this.treeItem.iconPath = _getIconPath('file')
        for (const run of sarif.runs)
            for (const result of run.results)
                this.children.push(new SarifResult(result, run))
        return this
    }
}

class SarifResult {
    /** @type {vscode.TreeItem} */
    treeItem

    /** @type {SarifRelatedLocation[]} */
    children

    /**
     * @param {Json} result
     * @param {Json} parentRun
     */
    constructor(result, parentRun) {
        this.treeItem              = new vscode.TreeItem('')
        this.treeItem.label        = result.message.text
        this.treeItem.iconPath     = _getIconPath(result.level)
        this.treeItem.command      = result.locations != undefined ? _showPhysicalLocation(result.locations[0].physicalLocation, parentRun.originalUriBaseIds) : undefined
        this.children              = []
        if (result.relatedLocations != undefined) {
            /** @type {Map<number, any>} */
            const mountable = new Map([[-1, this], [0, this]])
            for (const relatedLocation of result.relatedLocations)
                if (relatedLocation.message != undefined) {
                    const sarifRelatedLocation = new SarifRelatedLocation(relatedLocation, parentRun)
                    mountable.get(relatedLocation.properties.nestingLevel - 1)?.children.push(sarifRelatedLocation)
                    mountable.set(relatedLocation.properties.nestingLevel, sarifRelatedLocation)  
                }                        
        }
    }
}

class SarifRelatedLocation {
    /** @type {vscode.TreeItem} */
    treeItem

    /** @type {SarifRelatedLocation[]} */
    children

    /**
     * @param {Json} relatedLocation
     * @param {Json} parentRun
     */
    constructor(relatedLocation, parentRun) {
        this.treeItem          = new vscode.TreeItem('')
        this.treeItem.label    = relatedLocation.message.text
        this.treeItem.iconPath = _getIconPath('note')
        this.treeItem.command  = relatedLocation.physicalLocation != undefined ? _showPhysicalLocation(relatedLocation.physicalLocation, parentRun.originalUriBaseIds) : undefined
        this.children          = []
    }
}

const sarif = new Sarif()

const sarifView = vscode.window.createTreeView('sarifView', {
    treeDataProvider: sarif
})

const sarifRefreshCommand = vscode.commands.registerCommand('sarifRefreshCommand', () => {
    sarif.refresh()
})

const sarifRefreshDaemon = sarifView.onDidChangeVisibility(view => {
    if (view.visible)
        vscode.commands.executeCommand('sarifRefreshCommand')
})

const sarifFocusDaemon = vscode.tasks.onDidEndTask(async task => {
    vscode.commands.executeCommand('sarifRefresh')
    if ((await sarif.getChildren()).length >= 1)
        vscode.commands.executeCommand('sarifView.focus')
})

const showPhysicalLocationCommand = vscode.commands.registerCommand('showPhysicalLocationCommand', async (physicalLocation, originalUriBaseIds) => {
    const editor = await vscode.window.showTextDocument(
        physicalLocation.artifactLocation.uriBaseId != undefined ? 
            vscode.Uri.joinPath(vscode.Uri.parse(originalUriBaseIds[physicalLocation.artifactLocation.uriBaseId].uri), physicalLocation.artifactLocation.uri) : 
            vscode.Uri.parse(physicalLocation.artifactLocation.uri),
        {preview: false}
    )
    const selectBegin = new vscode.Position(
        physicalLocation.region.startLine   - 1, 
        physicalLocation.region.startColumn - 1
    )
    const selectEnd = new vscode.Position(
        physicalLocation.region.endLine != undefined ? 
            physicalLocation.region.endLine   - 1 :
            physicalLocation.region.startLine - 1, 
        physicalLocation.region.endColumn - 1
    )
    editor.revealRange(new vscode.Range(selectBegin, selectEnd), vscode.TextEditorRevealType.InCenter)
    editor.selection = new vscode.Selection(selectBegin, selectEnd)
})



/** @typedef {Record<string, any>} Json */

/**
 * @param {vscode.Uri} directory
 * @returns {AsyncGenerator<vscode.Uri>}
 */
async function* _recursiveIterateDirectory(directory) {
    for await (const [name, fileType] of await vscode.workspace.fs.readDirectory(directory))
        if (fileType == vscode.FileType.File)
            yield vscode.Uri.joinPath(directory, name)
        else if (fileType == vscode.FileType.Directory)
            for await (const subfile of _recursiveIterateDirectory(vscode.Uri.joinPath(directory, name)))
                yield subfile
}

/**
 * @param {string} name
 * @returns {vscode.ThemeIcon}
 */
function _getIconPath(name) {
    // Explicit write each case here.
    return name == 'file'    ? new vscode.ThemeIcon('file')    :
           name == 'error'   ? new vscode.ThemeIcon('error')   :
           name == 'warning' ? new vscode.ThemeIcon('warning') :
           name == 'note'    ? new vscode.ThemeIcon('more')    :
                               new vscode.ThemeIcon('more')
}

/**
 * @param {Json} physicalLocation
 * @param {Json} originalUriBaseIds
 * @returns {vscode.Command}
 */
function _showPhysicalLocation(physicalLocation, originalUriBaseIds) {
    return {
        title    : 'showPhysicalLocationCommand',
        command  : 'showPhysicalLocationCommand',
        tooltip  : 'showPhysicalLocationCommand',
        arguments: [physicalLocation, originalUriBaseIds]
    }
}