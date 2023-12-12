export type RequestFunction = { name: string; method: string; url: string }

export type DeclareKind = 'value' | 'type'

export type ImportDeclaration = {
  type: 'ImportDeclaration'
  source: string
  specifiers: Array<SimpleImportSpecifier>
  importKind: DeclareKind
  start: number
  end: number
}

export type DynamicImport = {
  type: 'DynamicImport'
  source: string
  start: number
  end: number
}

export type ExportNamedDeclaration = {
  type: 'ExportNamedDeclaration'
  source: string
  specifiers: Array<SimpleExportSpecifier>
  exportKind: DeclareKind
  start: number
  end: number
}

export type ExportAllDeclaration = {
  type: 'ExportAllDeclaration'
  source: string
  start: number
  end: number
}

export type Declaration =
  | ImportDeclaration
  | DynamicImport
  | ExportNamedDeclaration
  | ExportAllDeclaration

export type SimpleImportSpecifier =
  | {
      type: 'ImportDefaultSpecifier'
      local: string
    }
  | {
      type: 'ImportNamespaceSpecifier'
      local: string
      imported: string
    }
  | {
      type: 'ImportNamespaceSpecifier'
      local?: string
    }
export type SimpleExportSpecifier =
  | {
      type: 'ExportDefaultSpecifier'
      exported: string
    }
  | {
      type: 'ExportNamespaceSpecifier'
      exported?: string
    }
  | {
      type: 'ExportSpecifier'
      exported: string
      local: string
    }
