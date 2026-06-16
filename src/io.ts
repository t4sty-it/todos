export const write = (msg: string) => process.stdout.write(msg)

export const prompt = async (msg: string, separator: string = '\n> '): Promise<string> => {
  write(msg + separator)

  // https://bun.com/docs/guides/process/stdin
  for await (const line of console) {
    return line
  }

  throw new Error('Could not read from console')
}