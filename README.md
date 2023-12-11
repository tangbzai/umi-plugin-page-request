## umi-plugin-page-request

> 需要配合[约定式路由](https://umijs.org/docs/guides/routes#约定式路由)及[openAPI插件](https://pro.ant.design/zh-cn/docs/openapi/)使用

### 功能

获取`/src/pages/`底下的所有页面，并且根据`import`语法获取这些页面中使用到的接口（`/src/services/`里`export`的接口）并暴露到`umi`中

### 示例

目录结构

```
src
|- pages
  |- index.tsx
|- services
  |- demo
    |- demo.ts
    |- index.ts
```

```tsx
/** src/pages/index.tsx */
import { demoRequest } from '@/services/demo'
export default function Index() {
  return <></>
}
```

```ts
/** src/services/demo/index.ts */
export * from './demo'
```

```ts
/** src/services/demo/demo.ts */
// @ts-ignore
/* eslint-disable */
import { request } from '@umijs/max'

/** xxx POST /api/path/url */
export async function demoRequest(body: API.xxx) {
  return request<API.Response>('/api/path/url', {
    method: 'POST',
    data: body,
  })
}
```

使用时仅需在`umi`中导入`PAGE_REQUEST_MAP`即可

```ts
import { PAGE_REQUEST_MAP } from 'umi' // 获取页面与接口的映射
console.log(PAGE_REQUEST_MAP) // {"index.tsx": [{ "name": "demoRequest", "method":"POST", "url":"/api/path/url" }]}
```
