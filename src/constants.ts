import { User, InventoryItem } from './types';

export const USERS: User[] = [
  { id: 1, name: 'Jorge Toledo' },
  { id: 2, name: 'Andres Clavijo' },
  { id: 3, name: 'Luis Casique' },
  { id: 4, name: 'Ruben Rodriguez' },
  { id: 5, name: 'Branco Segovia' },
  { id: 6, name: 'Vicente Morales' },
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  { id: 1, code: 1, name: 'NEUMATICOS NIRO', quantity: 0 },
  { id: 2, code: 2, name: 'NEUMATICOS DONGFENG', quantity: 0 },
  { id: 3, code: 3, name: 'BATERIAS 12V (E70, NIRO, MAXUS)', quantity: 0 },
  { id: 4, code: 4, name: 'BATERIAS 12V (NETA,NAMMI)', quantity: 0 },
  { id: 5, code: 5, name: 'JUEGO DE CHICHARRA', quantity: 0 },
  { id: 6, code: 6, name: 'GATA HIDRAULICA Y ACCESORIOS', quantity: 0 },
  { id: 7, code: 7, name: 'PARTIDOR Y CABLE AUXILIAR', quantity: 0 },
];
