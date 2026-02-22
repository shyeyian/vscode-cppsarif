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

class Sarif {
    /**
     * @param {string} directory
     */
    constructor(directory) {
        this.directory = directory
        this.refreshEmitter = new vscode.EventEmitter()
        this.onDidChangeTreeData = this.refreshEmitter.event
    }
     
    /**
     * @param {SarifFile | SarifResult | SarifRelatedLocation} entry
     * @returns {vscode.TreeItem}
     */
    getTreeItem(entry) {
        return entry.getTreeItem()
    }

    /**
     * @param {SarifFile | SarifResult | SarifRelatedLocation | undefined} entry
     * @returns {Promise<Array<SarifFile | SarifResult | SarifRelatedLocation>>}
     */
    async getChildren(entry) {
        if (entry == undefined) {
            const sarifFiles = []
            if (vscode.workspace.workspaceFolders != undefined)
                for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                    const directory = vscode.Uri.joinPath(workspaceFolder.uri, this.directory)
                    try {
                        for await (const file of _recursiveIterateDirectory(directory))
                            if (file.path.endsWith('.sarif')) {
                                try {
                                    const sarifFile = await SarifFile.readFrom(file)
                                    if (sarifFile.getChildren().length >= 1)
                                        sarifFiles.push(sarifFile)
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
            return sarifFiles
        }
        else
            return entry.getChildren()
    }

    /**
     * @returns {void}
     */
    refresh() {
        this.refreshEmitter.fire(null)
    }
}

class SarifFile {    
    constructor() {
        /** @type {vscode.Uri} */
        this.uri = undefined
        
    }

    /**
     * @param {vscode.Uri} uri
     * @returns {Promise<SarifFile>}
     */
    static async readFrom(uri) {
        const sarifFile = new SarifFile()
        Object.assign(sarifFile, JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8')))
        sarifFile.uri      = uri
        sarifFile.children = []
        for (const run of sarifFile.runs)
            for (const result of run.results)
                sarifFile.children.push(new SarifResult(result, run))
        return sarifFile
    }

    /**
     * @returns {vscode.TreeItem}
     */
    getTreeItem() { 
        return {
            iconPath: _getIconPath('file'),
            label: this.uri.path.split('/').at(-1).slice(0, -'.sarif'.length),
            collapsibleState: this.getChildren().length >= 1 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        }
    }

    /**
     * @returns {SarifResult[]}
     */
    getChildren() {
        return this.children
    }
}

class SarifResult {
    /**
     * @param {object} object
     * @param {object} parentRun
     */
    constructor(object, parentRun) {
        Object.assign(this, object)
        this.parentRun = parentRun
        this.children  = []
        this.locationIndex = 0
        if (this.relatedLocations != undefined) {
            const mountable = new Map([[-1, this], [0, this]])
            for (const relatedLocation of this.relatedLocations)
                if (relatedLocation.message != undefined) {
                    const sarifRelatedLocation = new SarifRelatedLocation(relatedLocation, this.parentRun)
                    mountable.get(relatedLocation.properties.nestingLevel - 1).mountChild(sarifRelatedLocation)
                    mountable.set(relatedLocation.properties.nestingLevel, sarifRelatedLocation)  
                }                        
        }
    }

    /**
     * @returns {vscode.TreeItem}
     */
    getTreeItem() {
        this.locationIndex++
        return {
            iconPath: _getIconPath(this.level),
            label: this.message.text,
            command: this.locations != undefined ? _showPhysicalLocation(this.locations[this.locationIndex % this.locations.length].physicalLocation, this.parentRun.originalUriBaseIds) : undefined,
            collapsibleState: this.getChildren().length >= 1 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        }
    }

    /**
     * @returns {SarifRelatedLocation[]}
     */
    getChildren() {
        return this.children
    }

    /**
     * @param {SarifRelatedLocation} child
     * @returns {void}
     */
    mountChild(child) {
        this.children.push(child)
    }
}

class SarifRelatedLocation {
    /**
     * @param {object} object
     * @param {object} parentRun
     */
    constructor(object, parentRun) {
        Object.assign(this, object)
        this.parentRun = parentRun
        this.children  = []
    }

    /**
     * @returns {vscode.TreeItem}
     */
    getTreeItem() {
        return {
            iconPath: _getIconPath('note'),
            label: this.message.text,
            command: this.physicalLocation != undefined ? _showPhysicalLocation(this.physicalLocation, this.parentRun.originalUriBaseIds) : undefined,
            collapsibleState: this.getChildren().length >= 1 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        }
    }

    /**
     * @returns {SarifRelatedLocation[]}
     */
    getChildren() {
        return this.children
    }

    /**
     * @param {SarifRelatedLocation} child
     * @returns {void}
     */
    mountChild(child) {
        this.children.push(child)
    }
}

const sarif = new Sarif(vscode.workspace.getConfiguration('cppsarif').get('sarifDirectory'))

const sarifView = vscode.window.createTreeView('sarifView', {
    treeDataProvider: sarif
})

const sarifRefreshCommand = vscode.commands.registerCommand('sarifRefresh', () => {
    sarif.refresh()
})

const sarifRefreshDaemon = sarifView.onDidChangeVisibility(view => {
    if (view.visible)
        vscode.commands.executeCommand('sarifRefresh')
})

const sarifFocusDaemon = vscode.tasks.onDidEndTask(task => {
    if (task.exitCode != 0) {
        vscode.commands.executeCommand('sarifRefresh')
        if (sarif.getChildren().length >= 1)
            vscode.commands.executeCommand('sarifView.focus')
    }
})

const showPhysicalLocationCommand = vscode.commands.registerCommand('showPhysicalLocation', async (physicalLocation, originalUriBaseIds) => {
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
 * @param {vscode.Uri} directory
 * @returns {AsyncGenerator<vscode.Uri>}
 */
async function* _recursiveIterateDirectory(directory) {
    for await (const [name, fileType] of await vscode.workspace.fs.readDirectory(directory))
        if (fileType == vscode.FileType.File)
            yield vscode.Uri.joinPath(directory, name)
        else if (fileType == vscode.FileType.Directory)
            yield _recursiveIterateDirectory(vscode.Uri.joinPath(directory, name))
}

/**
 * @param {object} physicalLocation
 * @param {object} originalUriBaseIds
 * @returns {{command: string, arguments: object[]}}
 */
function _showPhysicalLocation(physicalLocation, originalUriBaseIds) {
    return {
        command: 'showPhysicalLocation',
        arguments: [physicalLocation, originalUriBaseIds]
    }
}