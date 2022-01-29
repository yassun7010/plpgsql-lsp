import * as path from "path"
import {
    ExtensionContext,
    languages as Languages,
    OutputChannel,
    TextDocument,
    TextEdit,
    window as Window,
    workspace as Workspace,
} from "vscode"
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient/node"

let defaultClient: LanguageClient
const clients: Map<string, LanguageClient> = new Map()

const PLPGSQL_LANGUAGE_SERVER_SECTION = "plpgsqlLanguageServer"

function createLanguageClient(
    serverOptions: ServerOptions, clientOptions: LanguageClientOptions,
) {
    return new LanguageClient(
        PLPGSQL_LANGUAGE_SERVER_SECTION,
        "PL/pgSQL Language Server",
        serverOptions,
        clientOptions,
    )

}

export function activate(context: ExtensionContext) {
    // The server is implemented in node
    const module = context.asAbsolutePath(
        path.join("server", "out", "server.js"),
    )
    const outputChannel: OutputChannel = Window.createOutputChannel(
        PLPGSQL_LANGUAGE_SERVER_SECTION,
    )

    function didOpenTextDocument(document: TextDocument): void {
        // We are only interested in language mode text
        if (
            document.languageId !== "postgres"
            || (
                document.uri.scheme !== "file"
                && document.uri.scheme !== "untitled"
            )
        ) {
            return
        }

        const uri = document.uri
        // Untitled files go to a default client.
        if (uri.scheme === "untitled" && !defaultClient) {
            const debugOptions = { execArgv: ["--nolazy", "--inspect=6170"] }
            const serverOptions: ServerOptions = {
                run: { module, transport: TransportKind.ipc },
                debug: {
                    module,
                    transport: TransportKind.ipc,
                    options: debugOptions,
                },
            }
            const clientOptions: LanguageClientOptions = {
                documentSelector: [
                    {
                        scheme: "untitled",
                        language: "postgres",
                    },
                ],
                synchronize: {
                    fileEvents: Workspace
                        .createFileSystemWatcher("**/.clientrc"),
                },
                diagnosticCollectionName: PLPGSQL_LANGUAGE_SERVER_SECTION,
                outputChannel,
            }
            defaultClient = createLanguageClient(serverOptions, clientOptions)
            defaultClient.start()

            return
        }
        const folder = Workspace.getWorkspaceFolder(uri)
        if (!folder) {
            return
        }

        if (!clients.has(folder.uri.toString())) {

            const debugOptions = {
                execArgv: ["--nolazy", `--inspect=${6171 + clients.size}`],
            }
            const serverOptions = {
                run: { module, transport: TransportKind.ipc },
                debug: {
                    module, transport: TransportKind.ipc, options: debugOptions,
                },
            }
            const clientOptions: LanguageClientOptions = {
                // Register the server for plain text documents
                documentSelector: [
                    {
                        scheme: "file",
                        language: "postgres",
                        pattern: `${folder.uri.fsPath}/**/*`,
                    },
                ],
                synchronize: {
                    fileEvents: Workspace.createFileSystemWatcher(
                        "**/.clientrc",
                    ),
                },
                diagnosticCollectionName: PLPGSQL_LANGUAGE_SERVER_SECTION,
                workspaceFolder: folder,
                outputChannel,
            }
            const client = createLanguageClient(serverOptions, clientOptions)
            client.start()
            clients.set(folder.uri.toString(), client)
        }
    }

    Workspace.onDidOpenTextDocument(didOpenTextDocument)
    Workspace.textDocuments.forEach(didOpenTextDocument)
    Workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.removed) {
            const client = clients.get(folder.uri.toString())
            if (client) {
                clients.delete(folder.uri.toString())
                client.stop()
            }
        }
    })
}

export function deactivate(): Thenable<void> | undefined {
    const promises: Thenable<void>[] = []
    if (defaultClient) {
        promises.push(defaultClient.stop())
    }
    for (const client of clients.values()) {
        promises.push(client.stop())
    }

    return Promise.all(promises).then(() => undefined)
}


Languages.registerDocumentFormattingEditProvider("postgres", {
    provideDocumentFormattingEdits(_document: TextDocument): TextEdit[] {
        return []
        // const firstLine = document.lineAt(0)

        // return [
        //     TextEdit.insert(
        //         firstLine.range.start, "-- Formatting...\n",
        //     ),
        // ]
    },
})
