import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import consola from 'consola'
import minimist from 'minimist'
import spawn from 'cross-spawn'
import prompts from 'prompts'
import {
  blue,
  cyan,
  green,
  lightBlue,
  lightGreen,
  lightRed,
  magenta,
  red,
  reset,
  yellow
} from 'kolorist'

type ColorFunc = (str: string | number) => string
type Framework = {
  name: string
  display: string
  color: ColorFunc
  variants: FrameworkVariant[]
}
type FrameworkVariant = {
  name: string
  display: string
  color: ColorFunc
  customCommand?: string
}

const FRAMEWORKS: Framework[] = [
  {
    name: 'vue',
    display: 'Vue',
    color: green,
    variants: [
      {
        name: 'vue-ts',
        display: 'TypeScript',
        color: blue
      },
      {
        name: 'vue',
        display: 'JavaScript',
        color: yellow
      },
      {
        name: 'custom-create-vue',
        display: 'Customize with create-vue ↗',
        color: green,
        customCommand: 'npm create vue@latest TARGET_DIR'
      },
      {
        name: 'custom-nuxt',
        display: 'Nuxt ↗',
        color: lightGreen,
        customCommand: 'npm exec nuxi init TARGET_DIR'
      }
    ]
  },

  {
    name: 'react',
    display: 'React',
    color: cyan,
    variants: [
      {
        name: 'react-ts',
        display: 'TypeScript',
        color: blue
      },
      {
        name: 'react-swc-ts',
        display: 'TypeScript + SWC',
        color: red
      },
      {
        name: 'react',
        display: 'JavaScript',
        color: lightBlue
      },
      {
        name: 'react-swc',
        display: 'JavaScript + SWC',
        color: lightGreen
      },
      {
        name: 'custom-remix',
        display: 'Remix ↗',
        color: cyan,
        customCommand: 'npm create remix@latest TARGET_DIR'
      }
    ]
  },
  {
    name: 'monorepo',
    display: 'Monorepo',
    color: lightBlue,
    variants: [
      {
        name: 'monorepo',
        display: 'TypeScript',
        color: lightRed
      }
    ]
  },
  {
    name: 'others',
    display: 'Others',
    color: reset,
    variants: [
      {
        name: 'create-vite-extra',
        display: 'create-vite-extra ↗',
        color: reset,
        customCommand: 'npm create vite-extra@latest TARGET_DIR'
      },
      {
        name: 'create-electron-vite',
        display: 'create-electron-vite ↗',
        color: reset,
        customCommand: 'npm create electron-vite@latest TARGET_DIR'
      }
    ]
  }
]

const TEMPALTES = FRAMEWORKS.map(
  f => (f.variants && f.variants.map(v => v.name)) || [f.name]
).reduce((a, b) => a.concat(b), [])

const pwd = process.cwd()
const defaultDestDir = 'your-project'

const argv = minimist<{ t?: string; tempalte?: string }>(
  process.argv.slice(2),
  { string: ['_'] }
)

const renameFiles: Record<string, string | undefined> = {
  _gitignore: '.gitignore'
}

function formatTargetDir(targetDir: string | undefined) {
  return targetDir?.trim().replace(/\/+$/g, '')
}

function isValidPackageName(projectName: string) {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
    projectName
  )
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z\d\-~]+/g, '-')
}

function isEmpty(path: string) {
  const length = fs.readdirSync(path).length
  return length === 0 || (length === 1 && fs.readdirSync(path).includes('.git'))
}

function emptyDir(path: string) {
  if (!fs.existsSync(path)) {
    return
  }
  for (const file of fs.readdirSync(path)) {
    if (file === '.git') {
      continue
    }
    fs.rmSync(`${path}/${file}`, { recursive: true, force: true })
  }
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  for (const file of fs.readdirSync(src)) {
    const srcFile = path.resolve(src, file)
    const destFile = path.resolve(dest, file)
    copy(srcFile, destFile)
  }
}

function copy(src: string, dest: string) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    copyDir(src, dest)
  } else {
    fs.copyFileSync(src, dest)
  }
}

function pkgFromUserAgent(userAgent: string | undefined) {
  if (!userAgent) return undefined
  const pkgSpec = userAgent.split(' ')[0]
  const pkgSpecArr = pkgSpec.split('/')
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1]
  }
}

function editFile(file: string, callback: (content: string) => string) {
  const content = fs.readFileSync(file, 'utf-8')
  fs.writeFileSync(file, callback(content), 'utf-8')
}

function setupReactSwc(root: string, isTs: boolean) {
  editFile(path.resolve(root, 'package.json'), content => {
    return content.replace(
      /"@vitejs\/plugin-react": ".+?"/,
      `"@vitejs/plugin-react-swc": "^3.5.0"`
    )
  })
  editFile(path.resolve(root, `vite.config.${isTs ? 'ts' : 'js'}`), content => {
    return content.replace('@vitejs/plugin-react', '@vitejs/plugin-react-swc')
  })
}

async function init() {
  const argDestDir = formatTargetDir(argv._[0])
  const argTemplate = argv.tempalte || argv.t

  let destDir = argDestDir || defaultDestDir

  const getProjetName = () => {
    return destDir === '.' ? path.basename(path.resolve()) : destDir
  }

  let promptResult: prompts.Answers<
    'projectName' | 'override' | 'packageName' | 'framework' | 'variant'
  >

  prompts.override({
    override: argv.override
  })

  try {
    promptResult = await prompts(
      [
        {
          type: argDestDir ? null : 'text',
          name: 'projectName',
          message: reset('Project name:'),
          initial: defaultDestDir,
          onState: state => {
            destDir = formatTargetDir(state.value) || defaultDestDir
          }
        },
        {
          type: () => {
            return !fs.existsSync(destDir) || isEmpty(destDir) ? null : 'select'
          },
          name: 'override',
          message: () => {
            return destDir === '.'
              ? 'Current directory '
              : `Target directory ${destDir} is not empty. Continue?`
          },
          initial: 0,
          choices: [
            {
              title: 'Remove existing files and continue',
              value: 'yes'
            },
            {
              title: 'Cancel operation',
              value: 'no'
            },
            {
              title: 'Ignore files and continue',
              value: 'ignore'
            }
          ]
        },
        {
          type: (_, { override }: { override: string }) => {
            if (override === 'no') {
              throw new Error('Operation cancelled')
            }
            return null
          },
          name: 'overrideChecker'
        },
        {
          type: () => (isValidPackageName(getProjetName()) ? null : 'text'),
          name: 'packageName',
          message: 'Package name:',
          initial: () => toValidPackageName(getProjetName()),
          validate: dir => {
            return isValidPackageName(dir) || 'Invalid package.json name'
          }
        },
        {
          type:
            argTemplate && TEMPALTES.includes(argTemplate) ? null : 'select',
          name: 'framework',
          message:
            typeof argTemplate === 'string' && !TEMPALTES.includes(argTemplate)
              ? reset(
                  `"${argTemplate}" isn't a valid template. Please choose from below: `
                )
              : reset('Select a framework:'),

          initial: 0,
          choices: FRAMEWORKS.map(f => {
            const frameworkColor = f.color
            return {
              title: frameworkColor(f.display || f.name),
              value: f
            }
          })
        },
        {
          type: (framework: Framework) => {
            return framework && framework.variants ? 'select' : null
          },
          name: 'variant',
          message: reset('select a variant:'),
          choices: (framework: Framework) =>
            framework.variants.map(variant => {
              const variantColor = variant.color
              return {
                title: variantColor(variant.display || variant.name),
                value: variant.name
              }
            })
        }
      ],
      {
        onCancel: () => {
          throw new Error('Operation cancelled')
        }
      }
    )
  } catch (cancelled: any) {
    consola.warn(cancelled.message)
    return
  }

  const { override, packageName, framework, variant } = promptResult
  const rootDir = path.join(pwd, destDir)

  if (override === 'yes') {
    emptyDir(rootDir)
  } else if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true })
  }

  let template: string = variant || framework?.name || argTemplate
  let isReactSWC = false
  if (template.includes('-swc')) {
    template = template.replace('-swc', '')
    isReactSWC = true
  }

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
  const pkgManager = pkgInfo?.name || 'npm'
  const isYarn1 = pkgManager === 'yarn' && pkgInfo?.version.startsWith('1.')

  const { customCommand } =
    FRAMEWORKS.flatMap(f => f.variants).find(v => v.name === template) ?? {}

  if (customCommand) {
    const fullCustomCommand = customCommand
      .replace(/^npm create /, () => {
        // `bun create` uses it's own set of templates,
        // the closest alternative is using `bun x` directly on the package
        if (pkgManager === 'bun') {
          return 'bun x create-'
        }
        return `${pkgManager} create `
      })
      // Only Yarn 1.x doesn't support `@version` in the `create` command
      .replace('@latest', () => (isYarn1 ? '' : '@latest'))
      .replace(/^npm exec/, () => {
        // Prefer `pnpm exec`, `yarn dlx`, or `bun x`
        if (pkgManager === 'pnpm') {
          return 'pnpm exec'
        }
        if (pkgManager === 'yarn' && !isYarn1) {
          return 'yarn dlx'
        }
        if (pkgManager === 'bun') {
          return 'bun x'
        }
        // Use `npm exec` in all other cases,
        // including Yarn 1.x and other custom npm clients.
        return 'npm exec'
      })

    const [command, ...args] = fullCustomCommand.split(' ')
    // we replace TARGET_DIR here because targetDir may include a space
    const replacedArgs = args.map(arg => arg.replace('TARGET_DIR', destDir))
    const { status } = spawn.sync(command, replacedArgs, {
      stdio: 'inherit'
    })
    process.exit(status ?? 0)
  }

  consola.start(magenta(`Scaffolding project in ${rootDir}...`))

  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    '../..',
    `template-${template}`
  )

  const write = (file: string, content?: string) => {
    const targetPath = path.join(rootDir, renameFiles[file] ?? file)
    if (content) {
      fs.writeFileSync(targetPath, content)
    } else {
      copy(path.join(templateDir, file), targetPath)
    }
  }

  const files = fs.readdirSync(templateDir)
  for (const file of files.filter(f => f !== 'package.json')) {
    write(file)
  }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8')
  )
  pkg.name = packageName || getProjetName()

  write('package.json', JSON.stringify(pkg, null, 2) + '\n')

  if (isReactSWC) {
    setupReactSwc(rootDir, template.endsWith('-ts'))
  }

  const cdProjectName = path.relative(pwd, rootDir)

  consola.success("Done! Let's get started:")
  const requireCd = rootDir !== pwd ? `cd ${cdProjectName}\n` : ''

  switch (pkgManager) {
    case 'yarn':
      consola.box(`${requireCd}yarn\nyarn dev`)
      break
    case 'pnpm':
      consola.box(`${requireCd}pnpm i\npnpm dev`)
      break
    default:
      consola.box(`${requireCd}${pkgManager} install\n${pkgManager} run dev`)
      break
  }
}

init().catch(e => {
  consola.error(e)
})
