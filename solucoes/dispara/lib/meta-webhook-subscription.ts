export type MetaSubscribedApp = {
  id?: string
  name?: string
  subscribed_fields?: string[]
}

export function normalizeSubscribedFields(apps: MetaSubscribedApp[]): string[] {
  const fields = new Set<string>()
  for (const app of apps) {
    for (const f of app.subscribed_fields || []) fields.add(f)
  }
  return Array.from(fields)
}

export function isMessagesSubscribed(apps: MetaSubscribedApp[]): boolean {
  return normalizeSubscribedFields(apps).includes('messages')
}
