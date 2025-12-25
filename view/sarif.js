let vscode = require("vscode")

class Sarif {
    constructor(directory) {
        this.directory = directory
        this.refreshEmitter = new vscode.EventEmitter()
        this.onDidChangeTreeData = this.refreshEmitter.event
    }
     
    getTreeItem(entry) {
        return entry.getTreeItem()
    }

    async getChildren(entry) {
        if (entry == undefined) {
            let sarifFiles = []
            for (let workspaceFolder of vscode.workspace.workspaceFolders)
                try {
                    for (let [name, fileType] of await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(workspaceFolder.uri, this.directory)))
                        if (name.endsWith(".sarif") && fileType == vscode.FileType.File) {
                            try {
                                let sarifFile = await SarifFile.readFrom(vscode.Uri.joinPath(workspaceFolder.uri, this.directory, name))
                                if (sarifFile.getChildren().length >= 1)
                                    sarifFiles.push(sarifFile)
                            }
                            catch (error) {
                                console.warn(`reading sarif file failed (with file = ${vscode.Uri.joinPath(workspaceFolder.uri, this.directory, name)}: ${error}`)
                            }
                        }
                }
                catch (error) {
                    console.warn(`reading sarif directory failed (with directory = ${vscode.Uri.joinPath(workspaceFolder.uri, this.directory)}): ${error}`)
                }
            return sarifFiles
        }
        else
            return entry.getChildren()
    }

    refresh() {
        this.refreshEmitter.fire()
    }
}

class SarifFile {
    static async readFrom(uri) {
        let sarifFile = new SarifFile()
        Object.assign(sarifFile, JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf-8")))
        sarifFile.uri      = uri
        sarifFile.children = []
        for (let run of sarifFile.runs)
            for (let result of run.results)
                sarifFile.children.push(new SarifResult(result, run))
        return sarifFile
    }

    getTreeItem() { 
        return {
            iconPath: getIconPath("file"),
            label: this.uri.path.split('/').at(-1).slice(0, -".sarif".length),
            collapsibleState: this.getChildren().length >= 1 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        }
    }

    getChildren() {
        return this.children
    }
}

class SarifResult {
    constructor(object, parentRun) {
        Object.assign(this, object)
        this.parentRun = parentRun
        this.children  = []
        this.locationIndex = 0
        if (this.relatedLocations != undefined) {
            let mountable = new Map([[-1, this], [0, this]])
            for (let relatedLocation of this.relatedLocations)
                if (relatedLocation.message != undefined) {
                    let sarifRelatedLocation = new SarifRelatedLocation(relatedLocation, this.parentRun)
                    mountable.get(relatedLocation.properties.nestingLevel - 1).mountChild(sarifRelatedLocation)
                    mountable.set(relatedLocation.properties.nestingLevel, sarifRelatedLocation)  
                }                        
        }
    }

    getTreeItem() {
        this.locationIndex++
        return {
            iconPath: getIconPath(this.level),
            label: this.message.text,
            command: this.locations != undefined ? showPhysicalLocation(this.locations[this.locationIndex % this.locations.length].physicalLocation, this.parentRun.originalUriBaseIds) : undefined,
            collapsibleState: this.getChildren().length >= 1 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        }
    }

    getChildren() {
        return this.children
    }

    mountChild(child) {
        this.children.push(child)
    }
}

class SarifRelatedLocation {
    constructor(object, parentRun) {
        Object.assign(this, object)
        this.parentRun = parentRun
        this.children  = []
    }

    getTreeItem() {
        return {
            iconPath: getIconPath("note"),
            label: this.message.text,
            command: this.physicalLocation != undefined ? showPhysicalLocation(this.physicalLocation, this.parentRun.originalUriBaseIds) : undefined,
            collapsibleState: this.getChildren().length >= 1 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        }
    }

    getChildren() {
        return this.children
    }

    mountChild(child) {
        this.children.push(child)
    }
}

function getIconPath(name) {
    // Explicit write each case here.
    return name == "file"    ? new vscode.ThemeIcon("file")    :
           name == "error"   ? new vscode.ThemeIcon("error")   :
           name == "warning" ? new vscode.ThemeIcon("warning") :
           name == "note"    ? new vscode.ThemeIcon("more")    :
                               new vscode.ThemeIcon("more")
}

function showPhysicalLocation(physicalLocation, originalUriBaseIds) {
    return {
        command: "showPhysicalLocation",
        arguments: [physicalLocation, originalUriBaseIds]
    }
}

let sarif = new Sarif(vscode.workspace.getConfiguration("cppsarif").get("sarifDirectory"))

let sarifView = vscode.window.createTreeView("sarifView", {
    treeDataProvider: sarif
})

let sarifRefreshCommand = vscode.commands.registerCommand("sarifRefresh", () => {
    sarif.refresh()
})

let sarifRefreshDaemon = sarifView.onDidChangeVisibility(view => {
    if (view.visible)
        vscode.commands.executeCommand("sarifRefresh")
})

let sarifFocusDaemon = vscode.tasks.onDidEndTask(task => {
    if (task.exitCode != 0) {
        vscode.commands.executeCommand("sarifRefresh")
        if (sarif.getChildren().length >= 1)
            vscode.commands.executeCommand("sarifView.focus")
    }
})

let showPhysicalLocationCommand = vscode.commands.registerCommand('showPhysicalLocation', async (physicalLocation, originalUriBaseIds) => {
    let editor = await vscode.window.showTextDocument(
        physicalLocation.artifactLocation.uriBaseId != undefined ? 
            vscode.Uri.joinPath(vscode.Uri.parse(originalUriBaseIds[physicalLocation.artifactLocation.uriBaseId].uri), physicalLocation.artifactLocation.uri) : 
            vscode.Uri.parse(physicalLocation.artifactLocation.uri),
        {preview: false}
    )
    let selectBegin = new vscode.Position(
        physicalLocation.region.startLine   - 1, 
        physicalLocation.region.startColumn - 1
    )
    let selectEnd = new vscode.Position(
        physicalLocation.region.endLine != undefined ? 
            physicalLocation.region.endLine   - 1 :
            physicalLocation.region.startLine - 1, 
        physicalLocation.region.endColumn - 1
    )
    editor.revealRange(new vscode.Range(selectBegin, selectEnd), vscode.TextEditorRevealType.InCenter)
    editor.selection = new vscode.Selection(selectBegin, selectEnd)
})

function activate(context) {
    context.subscriptions.push(sarifView)
    context.subscriptions.push(sarifRefreshCommand)
    context.subscriptions.push(sarifRefreshDaemon)
    context.subscriptions.push(sarifFocusDaemon)
    context.subscriptions.push(showPhysicalLocationCommand)
}

module.exports = {
    activate
}