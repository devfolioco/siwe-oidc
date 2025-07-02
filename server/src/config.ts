import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

type Config = {
  SERVER: {
    PORT: number;
  };
  REDIS: {
    URL: string;
  };
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  CLIENT_REDIRECT_URI: string;
  BASE_URL: string;

  // OIDC Config
  SIGNING_ALG: string;
  KID: string;
  SCOPES: ['openid', 'profile'];
};

const config: Config = {
  SERVER: {
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8000,
  },
  REDIS: {
    URL: process.env.REDIS_URL || 'redis://localhost:6379/2',
  },
  CLIENT_ID: process.env.CLIENT_ID || '',
  CLIENT_SECRET: process.env.CLIENT_SECRET || '',
  CLIENT_REDIRECT_URI: process.env.CLIENT_REDIRECT_URI || '',
  BASE_URL: process.env.BASE_URL || '',

  // OIDC Config
  SIGNING_ALG: 'RS256',
  KID: 'key1',
  SCOPES: ['openid', 'profile'],
};

export const getConfig = (): Config => config;
