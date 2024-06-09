import { ESLint } from 'eslint'

const removeIgnoredFiles = async (files) => {
  const eslint = new ESLint()
  const ignoredFiles = await Promise.all(
    files.map((file) => eslint.isPathIgnored(file)),
  )
  console.log(files)
  const filteredFiles = files.filter((_, i) => !ignoredFiles[i])
  return filteredFiles.join(' ')
}

export default {
  '*': async (files) => {
    console.log(files)
    const filesToLint = await removeIgnoredFiles(files)
    console.log(files)
    return [`eslint ${filesToLint} --max-warnings 0`]
  },
}
