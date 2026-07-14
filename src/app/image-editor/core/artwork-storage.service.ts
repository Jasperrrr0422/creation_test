import { Injectable } from '@angular/core';

const DATABASE_NAME = 'creaition-editor';
const DATABASE_VERSION = 1;
const CARD_STORE = 'canvas-cards';

export interface StoredCanvasCard {
  key: string;
  dataUrl: string;
  label: string;
  xRatio: number;
  yRatio: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ArtworkStorageService {
  async loadCards(): Promise<StoredCanvasCard[]> {
    const database = await this.openDatabase();
    return new Promise<StoredCanvasCard[]>((resolve, reject) => {
      const request = database.transaction(CARD_STORE, 'readonly').objectStore(CARD_STORE).getAll();
      request.onsuccess = () => {
        const cards = (request.result as StoredCanvasCard[])
          .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
        resolve(cards);
      };
      request.onerror = () => reject(request.error);
    }).finally(() => database.close());
  }

  async saveCard(card: StoredCanvasCard): Promise<void> {
    await this.runTransaction('readwrite', (store) => store.put(card));
  }

  async deleteCard(key: string): Promise<void> {
    await this.runTransaction('readwrite', (store) => store.delete(key));
  }

  private async runTransaction(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest,
  ): Promise<void> {
    const database = await this.openDatabase();
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CARD_STORE, mode);
      operation(transaction.objectStore(CARD_STORE));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }).finally(() => database.close());
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(CARD_STORE)) {
          request.result.createObjectStore(CARD_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Artwork storage is blocked by another browser tab.'));
    });
  }
}
