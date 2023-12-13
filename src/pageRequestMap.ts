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
    .flatMap((dir) => dirOrFileNormalization(path.join(dirOrFile, `./${dir}`)))
}

/** 列表去重后返回（含自身重复及与旧列表重复）*/
function filterNoRepeat<T>(newList: T[], oldList: T[], keyFn: (value: T) => string | number) {
  const oldKeyList = oldList.map(keyFn)
  return (
    newList
      .reduce((noRepeatList, item) => {
        // 去除自身重复项
        if (!noRepeatList.some((value) => keyFn(value) === keyFn(item))) noRepeatList.push(item)
        return noRepeatList
      }, [])
      // 去除与旧列表之间的重复项
      .filter((value) => !oldKeyList.includes(keyFn(value)))
  )
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
    return functionNameList
      .map((functionName) => servicesMap[group][functionName])
      .filter((t) => t) as RequestFunction[]
  }

  /** 绝对路径转换为别名路径 */
  function absPathFormatAliasPath(absPath?: string): string {
    return absPath?.replace(/[/\\]/g, '/').replace(api.paths.absSrcPath, '@') || ''
  }

  /** 别名路径转换为绝对路径 */
  function aliasPathFormatAbsPath(aliasPath?: string): string {
    return path.resolve(aliasPath?.replace(/^@[/\\]/, `${api.paths.absSrcPath}/`) || '')
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
   * @param path 组件路径(绝对路径)
   * @param declaration import 描述对象
   * @returns 组件文件 import 的所有接口列表
   */
  function getComponentServicesList(filePath: string): RequestFunction[] {
    if (componentServicesMapCache.get(filePath)) return componentServicesMapCache.get(filePath)
    const declarationList = getImportDeclarationByFilePath(filePath)
    const result = declarationList.flatMap((declaration) => {
      if (declaration.source.startsWith('@/services')) {
        return getServiceList(
          declaration.source,
          declaration.specifiers
            .map((item) => ('local' in item ? item.local : undefined))
            .filter((t) => t) as string[]
        )
      }
      // 非本地模块被视为没有使用到 services 里的接口
      if (!/^(\.|@?\/|@?\\)/.test(declaration.source)) return []

      let dependencyPath: string = declaration.source
      if (declaration.source.startsWith('.')) {
        // 拼接出当前文件引入的模块路径
        const dir = filePath.slice(0, filePath.lastIndexOf('\\'))
        dependencyPath = path.join(dir, declaration.source)
      } else if (/^@?[/\\]/.test(declaration.source)) {
        dependencyPath = api.paths.absSrcPath + dependencyPath.replace(/^@/, '')
      }
      // 获取模块的文件
      const filePathList = dirOrFileNormalization(dependencyPath)
      return filePathList.flatMap(getComponentServicesList)
    })
    componentServicesMapCache.set(filePath, result)
    return result
  }
  return function createPageRequestMap(
    fileImports?: Record<string, Declaration[]>
  ): Record<string, RequestFunction[] | undefined> {
    componentServicesMapCache.clear()
    if (!fileImports) return {}
    return Object.entries(fileImports)
      .reduce<{ filePath: string; absPath: string }[]>((acc, [absPath, list]) => {
        const filePath = absPathFormatAliasPath(absPath)
        const importDeclarationList = list?.filter(
          (declaration) =>
            declaration.type === 'ImportDeclaration' &&
            !new RegExp('^@?[a-zA-Z]').test(declaration.source)
        ) as ImportDeclaration[]
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
