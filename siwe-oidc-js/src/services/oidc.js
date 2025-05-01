import { randomBytes } from 'crypto';
import { ethers } from 'ethers';
import { SiweMessage } from 'siwe';
import { createPublicClient, http } from 'viem'
import jwt from 'jsonwebtoken';
import NodeRSA from 'node-rsa';
import config from '../config/index.js';
import db from '../db/redis.js';
import { mainnet } from 'wagmi/chains'
class OIDCService {
    constructor() {
        this.privateKey = new NodeRSA({ b: 2048 });
        this.publicClient = createPublicClient({
            chain: mainnet,
            transport: http(),
        })
    }

    // JWK Set endpoint
    async getJwkSet() {
        const publicKey = this.privateKey.exportKey('public');
        return {
            keys: [{
                kty: 'RSA',
                use: 'sig',
                kid: config.kid,
                alg: config.signingAlg,
                n: publicKey,
                e: 'AQAB'
            }]
        };
    }

    // Provider metadata endpoint
    getProviderMetadata() {
        const baseUrl = config.baseUrl.toString();
        return {
            issuer: baseUrl,
            authorization_endpoint: new URL(config.authorizePath, baseUrl).toString(),
            token_endpoint: new URL(config.tokenPath, baseUrl).toString(),
            userinfo_endpoint: new URL(config.userinfoPath, baseUrl).toString(),
            jwks_uri: new URL(config.jwkPath, baseUrl).toString(),
            registration_endpoint: new URL(config.registerPath, baseUrl).toString(),
            scopes_supported: config.scopes,
            response_types_supported: config.responseTypes,
            subject_types_supported: config.subjectIdentifierTypes,
            id_token_signing_alg_values_supported: [config.signingAlg],
            token_endpoint_auth_methods_supported: config.tokenEndpointAuthMethods
        };
    }

    // Token endpoint
    async handleTokenRequest(formData, authHeader) {
        const { grant_type, code, client_id, client_secret } = formData;
        
        if (grant_type !== 'authorization_code') {
            throw new Error('Unsupported grant type');
        }

        const authCode = await db.getAuthCode(code);
        if (!authCode) {
            throw new Error('Invalid authorization code');
        }

        const client = await db.getClient(client_id);
        if (!client) {
            throw new Error('Invalid client');
        }

        // Verify client credentials
        if (config.requireSecret && client_secret !== client.client_secret) {
            throw new Error('Invalid client credentials');
        }

        // Generate tokens
        const accessToken = randomBytes(32).toString('hex');
        const idToken = await this.generateIdToken(authCode);

        // Store tokens
        await db.setToken(accessToken, {
            client_id,
            scope: authCode.scope,
            sub: authCode.sub
        });

        // Delete used auth code
        await db.deleteAuthCode(code);

        return {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            id_token: idToken
        };
    }

    // Authorization endpoint
    async handleAuthorizationRequest(query) {
        const { client_id, redirect_uri, scope, state, nonce } = query;
        
        const client = await db.getClient(client_id);
        if (!client) {
            throw new Error('Invalid client');
        }

        if (!client.redirect_uris.includes(redirect_uri)) {
            throw new Error('Invalid redirect URI');
        }

        const sessionId = randomBytes(32).toString('hex');
        const authCode = randomBytes(32).toString('hex');

        await db.setSession(sessionId, {
            client_id,
            redirect_uri,
            scope,
            state,
            nonce
        });

        await db.setAuthCode(authCode, {
            client_id,
            redirect_uri,
            scope,
            state,
            nonce
        });

        return {
            sessionId,
            authCode
        };
    }

    // UserInfo endpoint
    async handleUserInfoRequest(accessToken) {
        const tokenData = await db.getToken(accessToken);
        if (!tokenData) {
            throw new Error('Invalid access token');
        }

        // In a real implementation, you would fetch user data from your database
        return {
            sub: tokenData.sub,
            // Add other claims as needed
        };
    }

    // SIWE (Sign-In with Ethereum) integration
    async verifySiweMessage(message, signature) {
        try {
            const siweMessage = new SiweMessage(message);
            const isValid = await this.publicClient.verifyMessage({
                message: siweMessage.prepareMessage(),
                signature: signature,
                address: siweMessage.address
            })
            return isValid;
        } catch (error) {
            console.error('SIWE verification failed:', error);
            return false;
        }
    }

    // Helper methods
    async generateIdToken(authCode) {
        const now = Math.floor(Date.now() / 1000);
        const claims = {
            iss: config.baseUrl.toString(),
            sub: authCode.sub,
            aud: authCode.client_id,
            exp: now + 3600,
            iat: now,
            nonce: authCode.nonce
        };

        return jwt.sign(claims, this.privateKey.exportKey('private'), {
            algorithm: config.signingAlg,
            keyid: config.kid
        });
    }

    // ENS resolution
    async resolveEnsName(address) {
        if (!config.ethProvider) {
            return address;
        }

        try {
            const provider = new ethers.JsonRpcProvider(config.ethProvider.toString());
            const name = await provider.lookupAddress(address);
            return name || address;
        } catch (error) {
            console.error('ENS resolution failed:', error);
            return address;
        }
    }
}

export default new OIDCService(); 