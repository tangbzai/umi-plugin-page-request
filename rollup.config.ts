import fs from 'fs'
import { defineConfig } from 'rollup'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'

const pkg = JSON.parse(fs.readFileSync('./package.json').toString())
const plugins = [resolve(), commonjs(), typescript(), terser()]

const deps = [...Object.keys(pkg.dependencies || {})]
const external = (id) => deps.includes(id)

function deleteDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = `${dirPath}/${file}`
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteDirectory(curPath) // 递归删除子目录
      } else {
        fs.unlinkSync(curPath) // 删除文件
      }
    })
    fs.rmdirSync(dirPath) // 删除空目录
  }
}

deleteDirectory('lib')
export default defineConfig([
  {
    input: './src/index.ts',
    output: [
      {
        dir: 'lib',
        format: 'cjs',
        entryFileNames: '[name].js',
      },
    ],
    plugins,
    external,
    treeshake: true,
  },
])
