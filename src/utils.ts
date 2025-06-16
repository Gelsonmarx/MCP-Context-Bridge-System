import fs from 'fs/promises';
import path from 'path';

/**
 * Checks if a file or directory exists at the given path.
 * @param filePath The path to check.
 * @returns A promise that resolves to true if the path exists, false otherwise.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the content of a file.
 * @param filePath The full path to the file.
 * @returns A promise that resolves to the file content as a string.
 * @throws An error if the file cannot be read.
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading file at ${filePath}:`, error);
    throw new Error(`Could not read file: ${path.basename(filePath)}`);
  }
}

/**
 * Writes content to a file, creating parent directories if they don't exist.
 * @param filePath The full path to the file.
 * @param content The content to write.
 * @returns A promise that resolves when the file has been written.
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    console.error(`Error writing to file at ${filePath}:`, error);
    throw new Error(`Could not write to file: ${path.basename(filePath)}`);
  }
}

/**
 * Appends content to a file. If the file doesn't exist, it creates it.
 * @param filePath The full path to the file.
 * @param content The content to append.
 * @returns A promise that resolves when the content has been appended.
 */
export async function appendFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, content, 'utf-8');
  } catch (error) {
    console.error(`Error appending to file at ${filePath}:`, error);
    throw new Error(`Could not append to file: ${path.basename(filePath)}`);
  }
}
