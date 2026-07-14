// Export shared types and interfaces here
export * from "./storage";
export * from "./messages";
export * from "./currency";
export * from "./marketPrice";

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
