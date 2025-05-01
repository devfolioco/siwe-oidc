import dotenv from 'dotenv';
import { URL } from 'url';

dotenv.config();

const config = {
    address: process.env.ADDRESS || '127.0.0.1',
    port: parseInt(process.env.PORT || '8000', 10),
    baseUrl: new URL(process.env.BASE_URL || 'http://127.0.0.1:8000'),
    rsaPem: process.env.RSA_PEM,
    redisUrl: new URL(process.env.REDIS_URL || 'redis://localhost'),
    defaultClients: {},
    requireSecret: process.env.REQUIRE_SECRET === 'true',
    ethProvider: process.env.ETH_PROVIDER ? new URL(process.env.ETH_PROVIDER) : null,
    
    // OIDC Configuration
    signingAlg: 'RS256',
    kid: 'key1',
    scopes: ['openid', 'profile'],
    responseTypes: ['code', 'id_token', 'token id_token'],
    subjectIdentifierTypes: ['pairwise'],
    tokenEndpointAuthMethods: ['client_secret_basic', 'client_secret_post', 'private_key_jwt'],
    
    // Paths
    metadataPath: '/.well-known/openid-configuration',
    jwkPath: '/jwk',
    tokenPath: '/token',
    authorizePath: '/authorize',
    registerPath: '/register',
    clientPath: '/client',
    userinfoPath: '/userinfo',
    signinPath: '/sign_in',
    siweCookieKey: 'siwe',
    touPath: '/legal/terms-of-use.pdf',
    ppPath: '/legal/privacy-policy.pdf'
};

export default config; 