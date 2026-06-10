export { MarketClient } from './MarketClient';
export * from './types';
import {main } from './integration';
import dotenv from "dotenv";

dotenv.config();

if (require.main === module) {
  void main();
}