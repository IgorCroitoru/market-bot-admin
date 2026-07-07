import "dotenv/config";
export { MarketClient } from './MarketClient';
export * from './types';
import {main } from './integration';

if (require.main === module) {
  void main();
}
