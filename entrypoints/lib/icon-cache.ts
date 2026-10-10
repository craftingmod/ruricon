export const iconCacheTTL = 6 * 60 * 60 * 1000
type Record<T> = { updatedAt: number; value: T }
let database: Promise<IDBDatabase | null> | undefined
const pending = new Map<string, Promise<unknown>>()

function openDatabase() {
  return (database ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open("ruricon:icon-cache", 1)
      request.onupgradeneeded = () => request.result.createObjectStore("responses")
      let blocked = false
      request.onerror = () => resolve(null)
      request.onblocked = () => {
        blocked = true
        resolve(null)
      }
      request.onsuccess = () => {
        const db = request.result
        if (blocked) {
          db.close()
          return
        }
        db.onversionchange = () => {
          db.close()
          database = undefined
        }
        resolve(db)
      }
    } catch {
      resolve(null)
    }
  }))
}

export async function readIconCache<T>(
  key: string,
  validate?: (value: unknown) => void,
): Promise<Record<T> | undefined> {
  try {
    const db = await openDatabase()
    if (!db) return
    const record = await new Promise<Record<T> | undefined>((resolve, reject) => {
      const request = db.transaction("responses").objectStore("responses").get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (!record || !Number.isFinite(record.updatedAt)) return
    validate?.(record.value)
    return record
  } catch {
    return undefined
  }
}

async function writeIconCache<T>(key: string, value: T) {
  try {
    const db = await openDatabase()
    if (!db) return
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("responses", "readwrite")
      transaction.objectStore("responses").put({ updatedAt: Date.now(), value }, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = transaction.onabort = () => reject(transaction.error)
    })
  } catch {
    // Storage failure must not discard a successful server response.
  }
}

export async function loadIconCache<T>(
  key: string,
  fetchValue: () => Promise<T>,
  previous?: (value: T) => void,
  validate?: (value: unknown) => void,
): Promise<T> {
  const record = await readIconCache<T>(key, validate)
  if (record) {
    previous?.(record.value)
    if (Date.now() - record.updatedAt < iconCacheTTL) return record.value
  }
  const existing = pending.get(key)
  if (existing) return existing as Promise<T>
  const promise = fetchValue().then(async (value) => {
    await writeIconCache(key, value)
    return value
  })
  pending.set(key, promise)
  try {
    return await promise
  } finally {
    if (pending.get(key) === promise) pending.delete(key)
  }
}
