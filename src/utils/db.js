const DB_NAME = 'splitmix_v1'
const STORE = 'session'
let _db = null

async function openDB() {
  if (_db) return _db
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE)
    req.onsuccess = e => { _db = e.target.result; res(_db) }
    req.onerror = () => rej(req.error)
  })
}

async function dbPut(key, value) {
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
}

async function dbGet(key) {
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => res(req.result ?? null)
    req.onerror = () => rej(req.error)
  })
}

async function dbDel(key) {
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
}

export { dbPut, dbGet, dbDel }
