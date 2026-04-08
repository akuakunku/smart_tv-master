import { EventEmitter } from 'events';

export const urlChangeEmitter = new EventEmitter();
export const watchHistoryEvent = new EventEmitter();
export const userUpdateEmitter = new EventEmitter();