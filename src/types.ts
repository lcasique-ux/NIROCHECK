export interface User {
  id: number;
  name: string;
}

export interface InventoryItem {
  id: number;
  code: number;
  name: string;
  quantity: number;
}

export enum LogAction {
  IN = 'INGRESO',
  OUT = 'SALIDA',
}

export interface LogEntry {
  id: string; // A composite key like `log-1-1-INGRESO`
  itemId: number;
  itemCode: number;
  itemName: string;
  userId: number;
  userName: string;
  action: LogAction;
  timestamp: string; // Timestamp of the last update to this group
  quantity: number;
  patente?: string;
}
