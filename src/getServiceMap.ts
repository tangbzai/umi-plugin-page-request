import fs from 'fs'
import path from 'path'
import type { RequestFunction } from '../index.d'

type RequestFunctionMap = Record<string, RequestFunction | undefined>
/** 通过文件路径，获取请求函数对象列表 */
function getFunctionList(serviceFilePath: string): RequestFunctionMap {
  return (
    // 获取接口文件的文本内容
    fs
      .readFileSync(serviceFilePath)
      .toString()
      // 去除注释
      .replace(/(\/\/[^\n]*|\/\*{1,2}[^*]*\*{1,2}\/)\n/g, '')
      // 将文本内容转换为对象
      .split('export ')
      .reduce<RequestFunctionMap>((map, fnStr) => {
        const functionName = fnStr.match(/function (.*)\(/)?.[1]
        const method = fnStr.match(/method: ['"](.*)['"],/)?.[1]
        const url = fnStr.match(/request(<.*>)?\([\n\s]*[`'"](.*)[`'"]/)?.[2]
        if (!functionName || !method || !url) return map
        return { ...map, [functionName]: { name: functionName, method, url } }
      }, {})
  )
}

/**
 * 获取 services 文件夹下所有分组的接口
 * @returns services 文件夹下所有分组的接口
 */
export default function getServiceMap(absSrcPath: string): Record<string, RequestFunctionMap> {
  // services 文件夹 路径
  const servicePath = path.join(absSrcPath, 'services')

  return fs.readdirSync(servicePath).reduce((acc, dir) => {
    // 处理分组
    const fileOrDirPath = path.join(servicePath, dir)
    if (!fs.statSync(fileOrDirPath).isDirectory()) return acc
    // 分组底下的所有接口
    const functionObjList: RequestFunctionMap = fs
      .readdirSync(fileOrDirPath)
      .reduce((map, fileName) => {
        if (/\.d\.ts/.test(fileName) || !/\.(j|t)s/.test(fileName)) return map
        return {
          ...map,
          ...getFunctionList(path.join(fileOrDirPath, fileName)),
        }
      }, {})
    return { ...acc, [dir]: functionObjList }
  }, {})
}
