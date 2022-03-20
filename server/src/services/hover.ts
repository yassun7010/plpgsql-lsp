import {
  Hover,
  HoverParams,
  Logger,
  MarkupKind,
} from "vscode-languageserver"
import { TextDocument } from "vscode-languageserver-textdocument"

import { PostgresPool } from "@/postgres/pool"
import {
  makeFunctionDefinitionText,
  queryFunctionDefinitions,
} from "@/postgres/queries/queryFunctionDefinitions"
import {
  makeTableDefinitionText,
  queryTableDefinitions,
} from "@/postgres/queries/queryTableDefinitions"
import {
  makeTypeDefinitionText,
  queryTypeDefinitions,
} from "@/postgres/queries/queryTypeDefinitions"
import {
  makeViewDefinitionText,
  queryViewDefinitions,
} from "@/postgres/queries/queryViewDefinitions"
import { sanitizeWordCandidates } from "@/utilities/sanitizeWord"
import { separateSchemaFromCandidate } from "@/utilities/schema"
import { getWordRangeAtPosition, makePostgresCodeMarkdown } from "@/utilities/text"

export async function getHover(
  pgPool: PostgresPool,
  params: HoverParams,
  document: TextDocument,
  defaultSchema: string,
  logger: Logger,
): Promise<Hover | undefined> {
  const wordRange = getWordRangeAtPosition(document, params.position)
  if (wordRange === undefined) {
    return undefined
  }

  const word = document.getText(wordRange)
  const sanitizedWordCandidates = sanitizeWordCandidates(word)

  for (const wordCandidate of sanitizedWordCandidates) {
    const schemaCandidate = separateSchemaFromCandidate(wordCandidate)
    if (schemaCandidate === undefined) {
      continue
    }
    const { schema, candidate } = schemaCandidate

    // Check as Table
    const tableHover = await getTableHover(
      pgPool, schema, candidate, defaultSchema, logger,
    )
    if (tableHover !== undefined) {
      return tableHover
    }

    // Check as View
    const viewHover = await getViewHover(
      pgPool, schema, candidate, defaultSchema, logger,
    )
    if (viewHover !== undefined) {
      return viewHover
    }

    // Check as Function
    const functionHover = await getFunctionHover(
      pgPool, schema, candidate, defaultSchema, logger,
    )
    if (functionHover !== undefined) {
      return functionHover
    }

    // Check as Type
    const typeHover = await getTypeHover(
      pgPool, schema, candidate, defaultSchema, logger,
    )
    if (typeHover !== undefined) {
      return typeHover
    }
  }

  return undefined
}

async function getTableHover(
  pgPool: PostgresPool,
  schema: string | undefined,
  tableName: string,
  defaultSchema: string,
  logger: Logger,
): Promise<Hover | undefined> {
  const definitions = await queryTableDefinitions(
    pgPool, schema, defaultSchema, logger, tableName,
  )

  return await makeHover(
    definitions.map(
      (definition) => makeTableDefinitionText(definition),
    ),
  )
}

async function getViewHover(
  pgPool: PostgresPool,
  schema: string | undefined,
  tableName: string,
  defaultSchema: string,
  logger: Logger,
): Promise<Hover | undefined> {
  const definitions = await queryViewDefinitions(
    pgPool, schema, defaultSchema, logger, tableName,
  )

  return await makeHover(
    definitions.map(
      (definition) => makeViewDefinitionText(definition),
    ),
  )
}

async function getFunctionHover(
  pgPool: PostgresPool,
  schema: string | undefined,
  functionName: string,
  defaultSchema: string,
  logger: Logger,
): Promise<Hover | undefined> {
  const definitions = await queryFunctionDefinitions(
    pgPool, schema, defaultSchema, logger, functionName,
  )

  return await makeHover(
    definitions.map(
      (definition) => makeFunctionDefinitionText(definition),
    ),
  )
}

async function getTypeHover(
  pgPool: PostgresPool,
  schema: string | undefined,
  typeName: string,
  defaultSchema: string,
  logger: Logger,
): Promise<Hover | undefined> {
  const definitions = await queryTypeDefinitions(
    pgPool, schema, defaultSchema, logger, typeName,
  )

  return await makeHover(
    definitions.map(
      (definition) => makeTypeDefinitionText(definition),
    ),
  )
}

async function makeHover(
  definitionTexts: string[],
): Promise<Hover | undefined> {
  if (definitionTexts.length === 0) {
    return undefined
  }

  const code = definitionTexts.join("\n\n")

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: makePostgresCodeMarkdown(code),
    },
  }
}