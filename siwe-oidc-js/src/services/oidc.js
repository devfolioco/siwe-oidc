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
            console.log('Invalid authorization code');
            throw new Error('Invalid authorization code');
        }

        // const client = await db.getClient(client_id);
        // if (!client) {
        //     throw new Error('Invalid client');
        // }

        // Verify client credentials
        // if (config.requireSecret && client_secret !== client.client_secret) {
        //     throw new Error('Invalid client credentials');
        // }

        const idToken = await this.generateIdToken(authCode);

        return {
            access_token: code,
            token_type: 'Bearer',
            expires_in: 3600,
            id_token: idToken
        };
    }

    // Authorization endpoint
    async handleAuthorizationRequest(query) {
        const { client_id, redirect_uri, scope, response_type, state, nonce, prompt, request_uri, request, action } = query;

        // Generate nonce for SIWE
        const siweNonce = randomBytes(16).toString('base64').replace(/[+/=]/g, '');
        
        // Validate redirect URI
        const redirectUrl = new URL(redirect_uri);
        redirectUrl.search = '';
        
        // const clientRedirectUris = client.redirect_uris.map(uri => {
        //     const url = new URL(uri);
        //     url.search = '';
        //     return url.toString();
        // });
        
        // if (!clientRedirectUris.includes(redirectUrl.toString())) {
        //     return { redirect: "/error?message=unregistered_redirect_uri" };
        // }
        
        // Validate state
        if (!state) {
            if (request_uri) {
                const errorUrl = new URL(redirect_uri);
                errorUrl.searchParams.append('error', 'request_uri_not_supported');
                return { redirect: errorUrl.toString() };
            } else if (request) {
                const errorUrl = new URL(redirect_uri);
                errorUrl.searchParams.append('error', 'request_not_supported');
                return { redirect: errorUrl.toString() };
            } else {
                const errorUrl = new URL(redirect_uri);
                errorUrl.searchParams.append('error', 'invalid_request');
                errorUrl.searchParams.append('error_description', 'Missing state');
                return { redirect: errorUrl.toString() };
            }
        }
        
        // Check prompt
        if (prompt === 'none') {
            const errorUrl = new URL(redirect_uri);
            errorUrl.searchParams.append('state', state);
            errorUrl.searchParams.append('error', 'interaction_required');
            return { redirect: errorUrl.toString() };
        }
        
        // Validate response_type
        if (!response_type) {
            const errorUrl = new URL(redirect_uri);
            errorUrl.searchParams.append('state', state);
            errorUrl.searchParams.append('error', 'invalid_request');
            errorUrl.searchParams.append('error_description', 'Missing response_type');
            return { redirect: errorUrl.toString() };
        }
        
        // Validate scope
        const supportedScopes = ['openid', 'profile'];
        const requestedScopes = scope.split(' ');
        for (const requestedScope of requestedScopes) {
            if (!supportedScopes.includes(requestedScope)) {
                throw new Error(`Scope not supported: ${requestedScope}`);
            }
        }
        
        // Create session
        const sessionId = randomBytes(32).toString('hex');
        const sessionSecret = randomBytes(16).toString('base64').replace(/[+/=]/g, '');
        
        await db.setSession(sessionId, {
            siweNonce,
            oidcNonce: nonce,
            secret: sessionSecret,
            signinCount: 0
        });
        
        // Create session cookie
        const sessionCookie = {
            name: 'session',
            value: sessionId,
            sameSite: 'strict',
            httpOnly: true,
            maxAge: 3600 // SESSION_LIFETIME in seconds
        };
        
        const domain = new URL(redirect_uri).hostname;
        const oidcNonceParam = nonce ? `&oidc_nonce=${nonce}` : '';

        console.log({redirect_uri})
        
        return {
            redirect: `/?nonce=${siweNonce}&domain=${domain}&redirect_uri=${redirect_uri}&state=${state}&action=${action}&client_id=${client_id}${oidcNonceParam}`,
            cookie: sessionCookie,
            sessionId: sessionId
        };
    }

    // UserInfo endpoint
    async handleUserInfoRequest(accessToken) {
        const tokenDataString = await db.getAuthCode(accessToken);
        if (!tokenDataString) {
            throw new Error('Invalid access token');
        }

        const tokenData = JSON.parse(tokenDataString);

        // Resolve ENS name if available
        const ensName = await this.resolveEnsName(tokenData.address);


        console.log({ensName})
        // In a real implementation, you would fetch user data from your database
        return {
            sub: tokenData.sub,
            preferred_username: ensName,
            iss: config.baseUrl.toString(),
            aud: [tokenData.clientId],
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