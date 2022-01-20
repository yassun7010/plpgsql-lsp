import { readFileSync } from "fs"
import { sync as glob } from "glob"
import { parseQuery } from "libpg-query"
import { DefinitionLink, DefinitionParams, LocationLink, Position, Range } from "vscode-languageserver"

import { getWordRangeAtPosition } from "../helpers"
import { Statement } from "../postgres/statement"
import { LanguageServerSettings } from "../settings"
import { Resource, Space } from "../space"
type Candidate = { definition: string, definitionLink: DefinitionLink };

export async function loadDefinitionInWorkspace(space: Space, resource: Resource) {
    const settings: LanguageServerSettings = await space.getDocumentSettings(resource)
    const workspace = await space.getWorkSpaceFolder(resource)
    if (workspace === undefined) {
        return
    }

    if (settings.definitionFiles) {
        for (const filePattern of settings.definitionFiles) {
            const files = glob(filePattern)
            try {
                await Promise.all(files.map(async (file) => {
                    resource = `${workspace.uri}/${file}`
                    space.console.log(`resource: ${resource}`)
                    await updateFileDefinition(space, resource)
                }))
            }
            catch (error: unknown) {
                space.console.error(`${error}`)
                continue
            }
        }
    }
}

export async function updateFileDefinition(space: Space, resource: Resource) {
    const query = await parseQuery(readFileSync(resource.replace(/^file:\/\//, "")).toString())

    const stmts = query?.["stmts"]
    if (stmts === undefined) {
        return
    }
    const createStmts: Candidate[] = getCreateStmts(stmts, resource)
        .concat(getCompositeTypeStmts(stmts, resource))
        .concat(getCreateFunctionStmts(space, stmts, resource))

    space.console.log(`createStmts: ${JSON.stringify(createStmts)}`)
    space.definitionMap.updateCandidates(space, resource, createStmts)
}

function getCreateStmts(stmts: Statement[], resource: Resource): Candidate[] {
    return stmts
        .flatMap(stmt => {
            const schemaname = stmt?.stmt?.CreateStmt?.relation?.schemaname
            const relname = stmt?.stmt?.CreateStmt?.relation?.relname
            if (schemaname === undefined || relname === undefined) {
                return []
            }

            return [{
                definition: `${schemaname}.${relname}`,
                definitionLink: LocationLink.create(
                    resource,
                    Range.create(Position.create(0, 0), Position.create(0, 0)),
                    Range.create(Position.create(0, 0), Position.create(0, 0)),
                ),
            }]
        })
}

function getCompositeTypeStmts(stmts: Statement[], resource: Resource): Candidate[] {
    return stmts
        .flatMap(stmt => {
            const definition = stmt?.stmt?.CompositeTypeStmt?.typevar?.relname
            if (definition === undefined) {
                return []
            }

            return [{
                definition,
                definitionLink: LocationLink.create(
                    resource,
                    Range.create(Position.create(0, 0), Position.create(0, 0)),
                    Range.create(Position.create(0, 0), Position.create(0, 0)),
                ),
            }]
        })
}

function getCreateFunctionStmts(space: Space, stmts: Statement[], resource: Resource): Candidate[] {
    return stmts
        .flatMap(stmt => {
            const funcnames = stmt?.stmt?.CreateFunctionStmt?.funcname
            if (funcnames === undefined || funcnames.length === 0) {
                return []
            }

            return funcnames.flatMap(funcname => {
                const definition = funcname?.String?.str
                if (definition === undefined) {
                    return []
                }

                return [{
                    definition,
                    definitionLink: LocationLink.create(
                        resource,
                        Range.create(Position.create(0, 0), Position.create(0, 0)),
                        Range.create(Position.create(0, 0), Position.create(0, 0)),
                    ),
                }]
            })
        })
}

export function getDefinitionLinks(
    space: Space,
    params: DefinitionParams,
): DefinitionLink[] | undefined {
    const uri = params.textDocument.uri
    const document = space.documents.get(uri)
    if (document === undefined) {
        return undefined
    }

    const wordRange = getWordRangeAtPosition(document, params.position)
    if (wordRange === undefined) {
        return undefined
    }

    const word = document.getText(wordRange)
    space.console.log(`definition uri: ${uri}`)
    space.console.log(`definition word: "${word}"`)
    space.console.log(`definition links: "${JSON.stringify(space.definitionMap.getDefinitionLinks(word))}"`)

    return space.definitionMap.getDefinitionLinks(word)
}
