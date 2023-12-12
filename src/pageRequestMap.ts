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

  /**
   * DFS 获取 组件文件 import 的所有接口列表
   * @param path 组件路径(绝对路径)
   * @param declaration import 描述对象
   * @returns 组件文件 import 的所有接口列表
   */
  function getComponentServicesList(
    filePath: string,
    declarationList: ImportDeclaration[]
  ): RequestFunction[] {
    return declarationList.flatMap((declaration) => {
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
        const dir = filePath.slice(0, filePath.lastIndexOf('/'))
        dependencyPath = path.join(dir, declaration.source)
      } else if (/^[/\\]/.test(declaration.source)) {
        dependencyPath = '@' + dependencyPath
      }
      // 获取模块的文件
      const filePathList = dirOrFileNormalization(aliasPathFormatAbsPath(dependencyPath))

      return filePathList.flatMap(
        (absPath) =>
          getComponentServicesList(absPath, getImportDeclarationByFilePath(absPath)) || []
      )
    })
  }
  return function createPageRequestMap(
    fileImports?: Record<string, Declaration[]>
  ): Record<string, RequestFunction[] | undefined> {
    if (!fileImports) return {}
    const result: Record<string, RequestFunction[] | undefined> = {}
    Object.entries(fileImports)
      .map(([absPath, list]) => {
        const filePath = absPathFormatAliasPath(absPath)
        const importDeclarationList = list?.filter(
          (declaration) =>
            declaration.type === 'ImportDeclaration' &&
            !new RegExp('^@?[a-zA-Z]').test(declaration.source)
        ) as ImportDeclaration[]

        fileImportsMap.set(filePath, importDeclarationList)

        // 从页面组件开始访问
        const texFileReg = /^@\/pages\/.*\.tsx$/
        if (!texFileReg.test(filePath)) return () => {}

        // 需要等 fileImportsMap 添加完毕再生成，不然会丢失部分数据
        return () => {
          const oldFunctionList =
            result[filePath]?.map(({ method, url }) => `${method}-${url}`) || []
          // 获取该页面引入的的接口列表并去重
          const newFunctionList = getComponentServicesList(absPath, importDeclarationList)
            .reduce<RequestFunction[]>((noRepeatList, item) => {
              if (
                !noRepeatList.some(
                  ({ method, url }) => `${method}-${url}` === `${item.method}-${item.url}`
                )
              )
                noRepeatList.push(item)
              return noRepeatList
            }, [])
            .filter(({ method, url }) => !oldFunctionList.includes(`${method}-${url}`))
          result[filePath] = [...(result[filePath] || []), ...newFunctionList]
        }
      })
      .forEach((fn) => fn())
    return result
  }
}
