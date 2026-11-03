import { GM_info } from '$'

export const getScriptInfo = () => {
  const script = GM_info.script
  return {
    name: script.name,
    author: script.author ?? '',
    namespace: script.namespace ?? '',
    version: script.version,
    description: script.description ?? '',
  }
}
