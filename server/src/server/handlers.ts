import {
  CompletionItem,
  CompletionParams,
  Connection,
  DefinitionLink,
  DefinitionParams,
  Diagnostic,
  DidChangeConfigurationParams,
  DidChangeWatchedFilesParams,
  FileChangeType,
  Hover,
  HoverParams,
  Logger,
  TextDocumentChangeEvent,
  TextDocuments,
} from "vscode-languageserver"
import { TextDocument } from "vscode-languageserver-textdocument"

import { getPool, PostgresPoolMap } from "@/postgres/pool"
import { DefinitionsManager } from "@/server/definitionsManager"
import { SettingsManager } from "@/server/settingsManager"
import { getCompletionItems } from "@/services/completion"
import {
  getDefinitionLinks,
} from "@/services/definition"
import { getHover } from "@/services/hover"
import { validateTextDocument } from "@/services/validation"
import {
  disableLanguageServer, disableValidation,
} from "@/utilities/disableLanguageServer"
import { readTextDocumentFromUri } from "@/utilities/text"

export type HandlersOptions = {
  hasDiagnosticRelatedInformationCapability: boolean
}

export class Handlers {
  constructor(
    private readonly connection: Connection,
    private readonly pgPools: PostgresPoolMap,
    private readonly documents: TextDocuments<TextDocument>,
    private readonly settingsManager: SettingsManager,
    private readonly definitionsManager: DefinitionsManager,
    private readonly options: HandlersOptions,
    private readonly logger: Logger,
  ) {
    this.documents.onDidChangeContent((event) => this.onDidChangeContent(event))
    this.documents.onDidClose((event) => this.onDidClose(event))
    this.documents.onDidOpen((event) => this.onDidOpen(event))
    this.documents.onDidSave((event) => this.onDidSave(event))

    this.connection.onCompletion((params) => this.onCompletion(params))
    this.connection.onDefinition((params) => this.onDefinition(params))
    this.connection.onDidChangeConfiguration(
      (params) => this.onDidChangeConfiguration(params),
    )
    this.connection.onDidChangeWatchedFiles(
      (params) => this.onDidChangeWatchedFiles(params),
    )
    this.connection.onHover((params) => this.onHover(params))
  }

  async onDidChangeContent(
    event: TextDocumentChangeEvent<TextDocument>,
  ): Promise<void> {
    await this.validate(event.document)
  }

  async onDidClose(
    event: TextDocumentChangeEvent<TextDocument>,
  ): Promise<void> {
    this.settingsManager.delete(event.document.uri)
    this.connection.sendDiagnostics({
      uri: event.document.uri,
      diagnostics: [],
    })
  }

  async onDidOpen(
    event: TextDocumentChangeEvent<TextDocument>,
  ): Promise<void> {
    const workspaceFolder = await this.settingsManager.getWorkspaceFolder(
      event.document.uri,
    )
    if (workspaceFolder === undefined) {
      return
    }

    if (!this.definitionsManager.hasWorkspaceFolder(workspaceFolder)) {
      const settings = await this.settingsManager.get(event.document.uri)

      this.logger.log(
        `The "${workspaceFolder.name}" workspace definitions are loading...`,
      )

      await this.definitionsManager.loadWorkspaceDefinitions(
        workspaceFolder,
        settings,
        this.logger,
      )

      this.logger.log("The definitions have been loaded!! 👍")
    }
  }

  async onDidSave(
    event: TextDocumentChangeEvent<TextDocument>,
  ): Promise<void> {
    const documentUri = event.document.uri
    const textDocument = readTextDocumentFromUri(documentUri)

    if (disableLanguageServer(textDocument)) {
      return
    }

    await this.validate(event.document, { isComplete: true })

    if (
      this.definitionsManager.hasFileDefinitions(documentUri)
      || await this.settingsManager.isDefinitionTarget(documentUri)
    ) {
      const settings = await this.settingsManager.get(documentUri)

      console.log("The file definitions are updating...")

      const candidates = await this.definitionsManager.updateFileDefinitions(
        textDocument, settings.defaultSchema,
      )

      if (candidates !== undefined) {
        const definitions = candidates.map(candidate => candidate.definition)

        console.log(
          `The file definitions have been updated!! 😎 ${JSON.stringify(definitions)}`,
        )
      }
    }
  }

  async onCompletion(
    params: CompletionParams,
  ): Promise<CompletionItem[] | undefined> {
    const textDocument = this.documents.get(params.textDocument.uri)
    if (textDocument === undefined || disableLanguageServer(textDocument)) {
      return undefined
    }

    const settings = await this.settingsManager.get(params.textDocument.uri)

    const pgPool = getPool(this.pgPools, settings, this.logger)
    if (pgPool === undefined) {
      return undefined
    }

    return getCompletionItems(
      pgPool,
      params,
      textDocument,
      settings.defaultSchema,
      this.logger,
    )
  }

  async onDefinition(
    params: DefinitionParams,
  ): Promise<DefinitionLink[] | undefined> {
    const textDocument = this.documents.get(params.textDocument.uri)
    if (textDocument === undefined || disableLanguageServer(textDocument)) {
      return undefined
    }

    return await getDefinitionLinks(
      this.definitionsManager,
      params,
      textDocument,
      this.logger,
    )
  }

  async onDidChangeConfiguration(
    params: DidChangeConfigurationParams,
  ): Promise<void> {
    this.settingsManager.reset(params.settings.plpgsqlLanguageServer)
    for (const document of this.documents.all()) {

      await this.validate(document)
    }
  }

  async onDidChangeWatchedFiles(
    params: DidChangeWatchedFilesParams,
  ): Promise<void> {
    let hasChanges = false

    params.changes.forEach(
      ({ type }) => {
        if (type === FileChangeType.Changed) {
          hasChanges = true
        }
      },
    )

    if (hasChanges) {
      for (const document of this.documents.all()) {
        await this.validate(document)
      }
    }
  }

  async onHover(
    params: HoverParams,
  ): Promise<Hover | undefined> {
    const textDocument = this.documents.get(params.textDocument.uri)
    if (textDocument === undefined || disableLanguageServer(textDocument)) {
      return undefined
    }

    const settings = await this.settingsManager.get(params.textDocument.uri)

    const pgPool = getPool(this.pgPools, settings, this.logger)
    if (pgPool === undefined) {
      return undefined
    }

    return await getHover(
      pgPool,
      params,
      textDocument,
      settings.defaultSchema,
      this.logger,
    )
  }

  async validate(
    textDocument: TextDocument,
    options: { isComplete: boolean } = { isComplete: false },
  ): Promise<Diagnostic[] | undefined> {
    let diagnostics: Diagnostic[] | undefined = undefined

    if (!disableValidation(textDocument)) {
      const settings = await this.settingsManager.get(textDocument.uri)

      const pgPool = getPool(this.pgPools, settings, this.logger)
      if (pgPool !== undefined) {
        diagnostics = await validateTextDocument(
          pgPool,
          textDocument,
          {
            isComplete: options.isComplete,
            hasDiagnosticRelatedInformationCapability:
              this.options.hasDiagnosticRelatedInformationCapability,
          },
          this.logger,
        )
      }
    }

    this.connection.sendDiagnostics({
      uri: textDocument.uri,
      diagnostics: diagnostics || [],
    })

    return diagnostics
  }
}
