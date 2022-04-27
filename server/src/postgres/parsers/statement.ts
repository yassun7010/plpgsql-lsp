import { parseQuery } from "libpg-query"
import { integer, uinteger } from "vscode-languageserver"

export interface Statement {
  stmt: StatementItem
  stmt_location?: uinteger
  stmt_len: uinteger
}

export interface StatementItem {
  CreateStmt?: CreateStmt
  ViewStmt?: ViewStmt
  CompositeTypeStmt?: CompositeTypeStmt
  CreateFunctionStmt?: CreateFunctionStmt
  CreateTrigStmt?: CreateTrigStmt
  IndexStmt?: IndexStmt
}

export interface CreateStmt {
  relation: CreateStmtRelation
}

export interface CreateStmtRelation {
  schemaname?: string
  relname: string
  location: uinteger
}

export interface ViewStmt {
  view: ViewStmtRelation
}

export interface ViewStmtRelation {
  schemaname?: string
  relname: string
  location: uinteger
}

export interface CompositeTypeStmt {
  typevar: CompositeTypeStmtTypevar
}

export interface CompositeTypeStmtTypevar {
  schemaname?: string
  relname: string
  relpersistence: string
  location: uinteger
}

export interface CreateFunctionStmt {
  is_procedure?: boolean
  replace: boolean
  funcname: FuncName[]
  returnType: CreateFunctionStmtReturnType
  options: CreateFunctionStmtOption[]
}

export interface FuncName {
  String: FuncNameString
}

export interface CreateFunctionStmtReturnType {
  location: uinteger
}
export interface FuncNameString {
  str: string
}

export interface CreateFunctionStmtOption {
  DefElem: CreateFunctionStmtOptionsDefElem
}

export interface CreateFunctionStmtOptionsDefElem {
  defname: string
  arg: CreateFunctionStmtOptionsDefElemArg
  location: uinteger
}

export interface CreateFunctionStmtOptionsDefElemArg {
  List: CreateFunctionStmtOptionsDefElemArgList
}

export interface CreateFunctionStmtOptionsDefElemArgList {
  items: CreateFunctionStmtOptionsDefElemArgListItem[]
}

export interface CreateFunctionStmtOptionsDefElemArgListItem {
  String: CreateFunctionStmtOptionsDefElemArgListItemString
}

export interface CreateFunctionStmtOptionsDefElemArgListItemString {
  str: string
}

export interface CreateTrigStmt {
  trigname: string
  relation: CreateTrigStmtRelation
  funcname: FuncName[]
  row: boolean
  events: integer
}

export interface CreateTrigStmtRelation {
  relname: string
  inh: boolean
  relpersistence: string
}

export interface IndexStmt {
  idxname: string
}

export async function getStmtements(query: string): Promise<Statement[] | undefined> {
  try {
    return (await parseQuery(query))?.["stmts"]
  }
  catch (error: unknown) {
    return undefined
  }
}
