import fs from 'fs'
import path from 'path'
import type { IApi } from 'umi'
import type { RequestFunction } from '../index.d'
import getServiceMap from './getServiceMap'
import type { Declaration, ImportDeclaration } from '../index.d'

/** 路径的目录或文件归一化为文件路径，省略文件尾缀时若是有同名会取有可能会取到多个文件 */
function dirOrFileNormalization(dirOrFile?: string): string[] {
  if (!dirOrFile) return []
  const ext = dirOrFile.lastIndexOf('.') > 0 ? dirOrFile.slice(dirOrFile.lastIndexOf('.') + 1) : ''
  // dirOrFile 不属于 文件 或 目录 类型
  if (!fs.existsSync(dirOrFile)) {
    if (ext) return []
    // 尝试补充文件尾缀再获取
    return ['.jsx', '.js', '.tsx', '.ts'].flatMap((addExt) =>
      dirOrFileNormalization(dirOrFile + addExt)
    )
  }

  const fileStat = fs.statSync(dirOrFile)
  // dirOrFile 是 文件名称
  if (fileStat.isFile()) return ['jsx', 'js', 'tsx', 'ts'].includes(ext) ? [dirOrFile] : []
  // dirOrFile 是 目录名 则 寻找入口文件
  return fs
    .readdirSync(dirOrFile)
    .filter((dirName) => /index\.(j|t)sx?$/.test(dirName))
    .flatMap((dir) => dirOrFileNormalization(path.join(dirOrFile, dir)))
}

/** 列表去重后返回（含自身重复及与旧列表重复）*/
function filterNoRepeat<T>(newList: T[], oldList: T[], keyFn: (value: T) => string | number) {
  const oldKeyList = new Set(oldList.map(keyFn))
  const newKeySet = new Set()
  return newList.filter((item) => {
    const key = keyFn(item)
    // 新列表出现过或旧列表中已存在则直接返回空
    if (newKeySet.has(key) || oldKeyList.has(key)) return false
    newKeySet.add(key)
    return true
  })
}

export default function InitPageRequest(api: IApi) {
  /** Services 文件夹下所有分组的接口的映射  */
  const servicesMap = getServiceMap(api.paths.absSrcPath)

  /**
   * 获取 Service 文件的接口列表
   * @param filePath
   * @param functionNameList
   * @returns 接口函数对象
   */
  function getServiceList(filePath: string, functionNameList: string[]): RequestFunction[] {
    const group = filePath.match(/@\/services\/([^/\\]*)/)?.[1]
    if (!group || !servicesMap[group]) return []
    return functionNameList.flatMap((functionName) =>
      !!servicesMap[group][functionName] ? [servicesMap[group][functionName]] : []
    )
  }

  /** 绝对路径转换为别名路径 */
  function absPathFormatAliasPath(absPath?: string): string {
    return absPath?.replace(/[/\\]/g, '/').replace(api.paths.absSrcPath, '@') || ''
  }

  /** 别名路径转换为绝对路径 */
  function aliasPathFormatAbsPath(aliasPath?: string): string {
    return path.resolve(aliasPath?.replace(/^@[/\\]/, `${api.paths.absSrcPath}/`) || '')
  }

  /** 获取 declaration.source 的绝对路径 */
  function getDeclarationSourceAbsPath(declarationSource: string, filePath: string): string {
    if (!declarationSource.startsWith('.')) return aliasPathFormatAbsPath(declarationSource)
    // 拼接出当前文件引入的模块路径
    // 使用正则表达式匹配最后一个反斜杠或正斜杠
    const lastSeparator = filePath.match(/[/\\][^/\\]*$/)?.[0] // 获取匹配到的最后一个分隔符
    if (lastSeparator) {
      const dir = filePath.slice(0, -lastSeparator.length) // 截取路径至最后一个分隔符之前的部分
      return path.join(dir, declarationSource)
    }
    return path.join(filePath, declarationSource)
  }

  /** 模块 */
  const fileImportsMap = new Map<string, ImportDeclaration[]>()

  /** 通过文件路径获取 ImportDeclaration */
  function getImportDeclarationByFilePath(absPath: string): ImportDeclaration[] {
    return fileImportsMap.get(absPathFormatAliasPath(absPath)) || []
  }

  /** 组件与接口映射的缓存，存储 getComponentServicesList 过程中存储已获取的组件，减少重复获取 */
  const componentServicesMapCache = new Map<string, RequestFunction[]>()
  /**
   * DFS 获取 组件文件 import 的所有接口列表
   * @param filePath 组件路径(绝对路径)
   * @param declaration import 描述对象
   * @returns 组件文件 import 的所有接口列表
   */
  function getComponentServicesList(filePath: string): RequestFunction[] {
    if (componentServicesMapCache.get(filePath)) return componentServicesMapCache.get(filePath)
    const declarationList = getImportDeclarationByFilePath(filePath)
    const result = declarationList.flatMap((declaration) => {
      // 非本地模块被视为没有使用到 services 里的接口
      if (!/^(\.|@?[/\\])/.test(declaration.source)) return []

      if (declaration.source.startsWith('@/services')) {
        return getServiceList(
          declaration.source,
          declaration.specifiers.flatMap((item) =>
            'local' in item && !!item.local ? [item.local] : []
          )
        )
      }

      // 获取模块的文件 并往下递归
      return dirOrFileNormalization(
        getDeclarationSourceAbsPath(declaration.source, filePath)
      ).flatMap(getComponentServicesList)
    })
    componentServicesMapCache.set(filePath, result)
    return result
  }

  return function createPageRequestMap(
    fileImports?: Record<string, Declaration[]>
  ): Record<string, RequestFunction[] | undefined> {
    componentServicesMapCache.clear()
    fileImportsMap.clear()
    if (!fileImports) return {}
    return Object.entries(fileImports)
      .reduce<{ filePath: string; absPath: string }[]>((acc, [absPath, list]) => {
        const filePath = absPathFormatAliasPath(absPath)
        const importDeclarationList = list?.filter(
          (declaration): declaration is ImportDeclaration =>
            declaration.type === 'ImportDeclaration' &&
            !new RegExp('^@?[a-zA-Z]').test(declaration.source)
        )
        // 组装 页面 / 组件 的 相对路径与 Import 依赖的映射关系
        fileImportsMap.set(filePath, importDeclarationList)

        // 从页面组件开始访问
        if (/^@\/pages\/.*\.tsx$/.test(filePath)) acc.push({ filePath, absPath })
        return acc
      }, [])
      .reduce<Record<string, RequestFunction[] | undefined>>((result, { filePath, absPath }) => {
        // 获取该页面引入的的接口列表并去重
        const newFunctionList = filterNoRepeat(
          getComponentServicesList(absPath),
          result[filePath] || [],
          ({ method, url }) => `${method}-${url}`
        )
        result[filePath] = [...(result[filePath] || []), ...newFunctionList]
        return result
      }, {})
  }
}
