// Values only known after the servers start (actual ports, tunnel URL).
import { config } from './env.js';

export const runtime = {
  httpPort: config.port,
  httpsPort: config.httpsPort,
  publicUrl: config.publicUrl || '',
};
