import { homedir } from "os"
import { join } from "path"
import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"

const STORAGE_DIR = join(homedir(), ".local", "share", "btw-opencode")
const STORAGE_FILE = join(STORAGE_DIR, "sessions.json")

export interface BTWSessionMapping {
  parentSessionID: string
  forkedSessionID: string
  createdAt: number
  lastUsedAt: number
}

export interface BTWStorage {
  sessions: BTWSessionMapping[]
}

async function ensureStorageDir(): Promise<void> {
  if (!existsSync(STORAGE_DIR)) {
    await mkdir(STORAGE_DIR, { recursive: true })
  }
}

export async function loadStorage(): Promise<BTWStorage> {
  await ensureStorageDir()
  try {
    const content = await readFile(STORAGE_FILE, "utf-8")
    return JSON.parse(content) as BTWStorage
  } catch {
    return { sessions: [] }
  }
}

export async function saveStorage(storage: BTWStorage): Promise<void> {
  await ensureStorageDir()
  await writeFile(STORAGE_FILE, JSON.stringify(storage, null, 2), "utf-8")
}

export async function getForkedSession(parentSessionID: string): Promise<BTWSessionMapping | null> {
  const storage = await loadStorage()
  return storage.sessions.find((s) => s.parentSessionID === parentSessionID) ?? null
}

export async function setForkedSession(parentSessionID: string, forkedSessionID: string): Promise<BTWSessionMapping> {
  const storage = await loadStorage()
  const now = Date.now()
  
  const existingIndex = storage.sessions.findIndex((s) => s.parentSessionID === parentSessionID)
  
  const mapping: BTWSessionMapping = {
    parentSessionID,
    forkedSessionID,
    createdAt: existingIndex >= 0 ? storage.sessions[existingIndex].createdAt : now,
    lastUsedAt: now,
  }
  
  if (existingIndex >= 0) {
    storage.sessions[existingIndex] = mapping
  } else {
    storage.sessions.push(mapping)
  }
  
  await saveStorage(storage)
  return mapping
}

export async function updateLastUsed(parentSessionID: string): Promise<void> {
  const storage = await loadStorage()
  const session = storage.sessions.find((s) => s.parentSessionID === parentSessionID)
  if (session) {
    session.lastUsedAt = Date.now()
    await saveStorage(storage)
  }
}

export async function getAllTrackedSessions(): Promise<Set<string>> {
  const storage = await loadStorage()
  return new Set(storage.sessions.map((s) => s.forkedSessionID))
}
