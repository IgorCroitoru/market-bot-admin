// Export shared types and interfaces here
export * from "./storage";
export * from "./messages";

export interface ApiRequest {
  userId?: string;
  timestamp: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export type OfferStatusChangedMessage = {
 
}

export enum Currency {
  RUB = 'RUB',
  USD = 'USD',
  EUR = 'EUR',
}
