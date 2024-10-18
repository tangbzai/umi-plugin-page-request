import type { IApi } from 'umi'
import type { RequestFunction } from '../index.d'
import InitPageRequest from './pageRequestMap'
import { pageRequestFormat } from './transform'

/**
 * 获取页面组件使用的所有接口
 * @param api 插件API
 */
export default async (api: IApi) => {
  api.describe({
    key: 'pageRequest',
    enableBy: api.EnableBy.register,
  })
  api.logger.info('Using PageRequest Plugin')

  /** 生成插件的入口临时文件 */
  function writeIndexTmpFile(content = '{}') {
    api.writeTmpFile({
      content: `const PAGE_REQUEST_MAP = ${content}
export { PAGE_REQUEST_MAP }`,
      path: 'index.ts',
    })
  }

  // 初始化
  const createPageRequestMap = InitPageRequest(api)
  // 构建成功之前
  api.onPrepareBuildSuccess(({ fileImports, isWatch }) => {
    // 开发环境不在初始构建时执行 - 优化启动速度
    // mako 中使用该优化有几率会导致开发环境生成出空对象
    if (api.service.appData.bundler !== 'mako' && api.env === 'development' && !isWatch) return
    const before = performance.now()
    // 创建获取 PAGE_REQUEST_MAP
    const pageRequestMap: Record<string, RequestFunction[] | undefined> =
      createPageRequestMap(fileImports)
    api.logger.info(`pageRequestMap builded in ${Math.floor(performance.now() - before)} ms`)
    // 写入 PAGE_REQUEST_MAP 至入口文件
    // const writeBefore = performance.now()
    if (api.env === 'development') writeIndexTmpFile(pageRequestFormat(pageRequestMap))
    else
      writeIndexTmpFile(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(pageRequestMap).map(([key, value]) => [
              [`${key.replace(/^@\/pages\//, '/')}`],
              value,
            ])
          )
        )
      )
    // api.logger.debug(`wrote in ${(performance.now() - writeBefore).toFixed(2)} ms`)
  })

  api.onGenerateFiles(({ isFirstTime }) => {
    if (!isFirstTime) return
    // 第一次调用则生成空的入口临时文件使得 Umi 成功捕获入口文件的 exports
    writeIndexTmpFile()
  })
}
