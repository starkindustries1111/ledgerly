import 'dotenv/config'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const sourcePath = process.env.DATABASE_PATH || path.join(serverDir, 'budgeting.db')
const backupDir = path.join(serverDir, 'backups')
if (!fs.existsSync(sourcePath)) throw new Error('Database does not exist yet.')
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 })
const destinationPath = path.join(backupDir, `budgeting-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
const source = new Database(sourcePath, { readonly: true })
try {
	await source.backup(destinationPath)
	if (!fs.existsSync(destinationPath)) throw new Error('Backup file was not created.')
} finally {
	source.close()
}
process.stdout.write(`Backup created at ${destinationPath}\n`)
