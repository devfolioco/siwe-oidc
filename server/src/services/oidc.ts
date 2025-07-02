import { getConfig } from '../config.js';
import { redisClient } from '../db/index.js';
import { AuthorizeParams, SignInParams, TokenExchangeParams } from '../types.js';
import { randomBytes } from 'crypto';
import { SiweMessage } from 'siwe';
import { PublicClient, createPublicClient, getAddress, http } from 'viem';
import { mainnet } from 'wagmi/chains';
import jwt from 'jsonwebtoken';
import NodeRSA from 'node-rsa';

export class OIDCService {
  private publicClient: PublicClient;
  private privateKey: NodeRSA;

  constructor() {
    this.publicClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    });

    this.privateKey = new NodeRSA({ b: 2048 });
  }
  async authorize(params: AuthorizeParams): Promise<{
    redirectUrl?: string;
    sessionCookie?: any;
    sessionId?: string;
  }> {
    const { client_id, redirect_uri } = params;
    try {
      // Validate client_id
      const isValidClient = client_id === getConfig().CLIENT_ID;
      if (!isValidClient) {
        throw new Error('Unrecognised client id.');
      }

      // Generate a random nonce
      const nonce = this.generateNonce();

      // Validate redirect_uri
      const redirectUri = new URL(redirect_uri);
      redirectUri.search = '';

      const isValidClientRedirectURI = redirectUri.toString() === getConfig().CLIENT_REDIRECT_URI;

      if (!isValidClientRedirectURI) {
        return { redirectUrl: '/error?message=unregistered_redirect_uri' };
      }

      // Validate state parameter
      let state: string;

      if (params.state) {
        state = params.state;
      } else if (params.request_uri) {
        const url = new URL(redirect_uri);
        url.searchParams.append('error', 'request_uri_not_supported');

        return { redirectUrl: url.toString() };
      } else if (params.request) {
        const url = new URL(redirect_uri);
        url.searchParams.append('error', 'request_not_supported');
        return { redirectUrl: url.toString() };
      } else {
        const url = new URL(redirect_uri);
        url.searchParams.append('error', 'invalid_request');
        url.searchParams.append('error_description', 'Missing state');
        return { redirectUrl: url.toString() };
      }

      // Check prompt parameter
      if (params.prompt === 'none') {
        const url = new URL(redirect_uri);
        url.searchParams.append('state', state);
        url.searchParams.append('error', 'interaction_required');
        return { redirectUrl: url.toString() };
      }

      // Validate response_type
      if (!params.response_type) {
        const url = new URL(redirect_uri);
        url.searchParams.append('state', state);
        url.searchParams.append('error', 'invalid_request');
        url.searchParams.append('error_description', 'Missing response_type');
        return { redirectUrl: url.toString() };
      }

      // Validate scopes
      const scopes = params.scope.trim().split(' ');
      for (const scope of scopes) {
        if (!getConfig().SCOPES.includes(scope as any)) {
          throw new Error(`Scope not supported: ${scope}`);
        }
      }

      // Create session
      const sessionId = this.generateUUID();
      const sessionSecret = this.generateRandomString(16);

      await redisClient.setSession(sessionId, {
        siwe_nonce: nonce,
        oidc_nonce: params.nonce,
        secret: sessionSecret,
        signin_count: 0,
      });

      // Create session cookie
      const sessionCookie = {
        name: 'session',
        value: sessionId,
        sameSite: 'strict',
        httpOnly: true,
        maxAge: 3600, // SESSION_LIFETIME in seconds
      };

      // Build redirect URL with parameters
      const domain = new URL(redirect_uri).host;
      const oidcNonceParam = params.nonce ? `&oidc_nonce=${params.nonce}` : '';

      const redirectUrl = `/?nonce=${nonce}&domain=${domain}&redirect_uri=${redirect_uri}&state=${state}&action=${params.action}&client_id=${client_id}${oidcNonceParam}`;

      return {
        redirectUrl,
        sessionCookie,
        sessionId,
      };
    } catch (error) {
      console.error('Error authorizing:', error);
      return { redirectUrl: '/error?message=internal_server_error' };
    }
  }

  async signIn({
    params,
    cookies,
  }: {
    params: SignInParams;
    cookies: any;
  }): Promise<{ redirectUrl: string }> {
    try {
      // Get session from cookies
      const sessionId = cookies.session as string;
      if (!sessionId) {
        throw new Error('Session cookie not found');
      }

      const sessionEntry = await redisClient.getSession(sessionId);
      if (!sessionEntry) {
        throw new Error('Session not found');
      }

      if (sessionEntry.signin_count > 0) {
        throw new Error('Session has already logged in');
      }

      // Get SIWE cookie
      const siweCookie = cookies.siwe;
      if (!siweCookie) {
        throw new Error('No `siwe` cookie');
      }

      const { message, signature } = JSON.parse(decodeURIComponent(siweCookie));

      const isValid = await this.verifySiweMessage(message, signature);
      if (!isValid) {
        throw new Error('Invalid SIWE message');
      }

      // Verify resources match redirect URI
      if (message.resources && message.resources.length > 0) {
        const redirectDomain = new URL(params.redirect_uri).toString();
        if (redirectDomain !== message.resources[0]) {
          throw new Error('Conflicting domains in message and redirect');
        }
      } else {
        throw new Error('Missing resource in SIWE message');
      }

      // Create code entry
      const codeEntry = {
        address: message.address,
        nonce: params.oidc_nonce,
        exchange_count: 0,
        client_id: params.client_id,
        auth_time: new Date().toISOString(),
        chain_id: message.chain_id,
      };

      // Update session
      const newSessionEntry = {
        ...sessionEntry,
        signin_count: sessionEntry.signin_count + 1,
      };

      await redisClient.setSession(sessionId, newSessionEntry);

      // Generate code and store code entry
      const code = this.generateUUID();
      await redisClient.setCode(code, codeEntry);

      // Build redirect URL
      const url = new URL(params.redirect_uri);
      url.searchParams.append('code', code);
      url.searchParams.append('state', params.state);

      return { redirectUrl: url.toString() };
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }

  async userinfo(accessToken: string): Promise<any> {
    try {
      // Get code entry from Redis
      const codeEntryString = await redisClient.getCode(accessToken);
      if (!codeEntryString) {
        throw new Error('Unknown code');
      }

      const codeEntry = JSON.parse(codeEntryString);

      // Get client entry
      const isValidClientEntry = codeEntry.client_id === getConfig().CLIENT_ID;
      if (!isValidClientEntry) {
        throw new Error('Unknown client');
      }

      // Resolve claims for the address
      const claims = await this.resolveClaims(codeEntry.address, codeEntry.chain_id || 1);

      // Create response with claims
      const response = {
        ...claims,
        iss: getConfig().BASE_URL,
        aud: [codeEntry.client_id],
      };

      console.log({ response });

      return response;
    } catch (error) {
      console.error('Error getting user info:', error);
      throw error;
    }
  }

  async tokenExchange({
    code,
    client_id,
    client_secret,
    grant_type,
  }: TokenExchangeParams): Promise<any> {
    try {
      if (grant_type !== 'authorization_code') {
        throw new Error('Invalid grant type');
      }

      const codeEntry = await redisClient.getCode(code);
      if (!codeEntry) {
        throw new Error('Unknown code');
      }

      if (codeEntry.client_id !== client_id) {
        throw new Error('Unknown client');
      }

      console.log({ client_secret, code_secret: codeEntry.client_secret });
      if (client_secret !== undefined && client_secret !== getConfig().CLIENT_SECRET) {
        throw new Error('Invalid client secret');
      }

      if (codeEntry.exchange_count >= 1) {
        throw new Error('Code was previously exchanged.');
      }

      const newCodeEntry = {
        ...codeEntry,
        exchange_count: codeEntry.exchange_count + 1,
      };

      await redisClient.setCode(code, newCodeEntry);

      const accessToken = jwt.sign(codeEntry, this.privateKey.exportKey('private'), {
        algorithm: getConfig().SIGNING_ALG as jwt.Algorithm,
        keyid: getConfig().KID,
      });

      // Create ID token claims
      const now = Math.floor(Date.now() / 1000);
      const idTokenClaims = {
        iss: getConfig().BASE_URL,
        aud: client_id,
        exp: now + 3600, // 1 hour expiration
        iat: now,
        sub: codeEntry.sub,
        nonce: codeEntry.nonce,
        auth_time: codeEntry.auth_time,
        // Include claims from the code entry
        ...codeEntry.claims,
      };

      // Sign the ID token with our private key
      const idToken = jwt.sign(idTokenClaims, this.privateKey.exportKey('private'), {
        algorithm: getConfig().SIGNING_ALG as jwt.Algorithm,
        keyid: getConfig().KID,
      });

      // Create token response
      const tokenResponse = {
        access_token: accessToken,
        token_type: 'Bearer',
        id_token: idToken,
        expires_in: 3600, // 1 hour
      };

      return tokenResponse;
    } catch (error) {
      console.error('Error exchanging token:', error);
      throw error;
    }
  }

  private generateNonce(): string {
    return randomBytes(16).toString('base64').replace(/[+/=]/g, '');
  }

  private generateUUID(): string {
    return crypto.randomUUID();
  }

  private generateRandomString(length: number): string {
    return randomBytes(length).toString('base64').replace(/[+/=]/g, '');
  }

  private async verifySiweMessage(message: any, signature: `0x${string}`): Promise<boolean> {
    const siweMessage = new SiweMessage(message);

    const isValid = this.publicClient.verifyMessage({
      message: siweMessage.prepareMessage(),
      signature,
      address: siweMessage.address as `0x${string}`,
    });

    return isValid;
  }

  private async resolveClaims(address: string, chainId: number): Promise<any> {
    // Convert address to checksum format
    const checksumAddress = getAddress(address);

    // Create subject identifier in the format "eip155:{chainId}:{address}"
    const subjectId = `eip155:${chainId}:${checksumAddress}`;

    // Initialize claims with subject
    const claims: {
      sub: string;
      preferred_username: string;
      picture?: string;
    } = {
      sub: subjectId,
      preferred_username: checksumAddress,
    };
    try {
      // Try to resolve ENS name if we have a provider configured
      try {
        const ensName = await this.publicClient.getEnsName({ address: checksumAddress });
        if (ensName) {
          claims.preferred_username = ensName;

          // Try to resolve avatar if ENS name is available
          try {
            const avatar = await this.publicClient.getEnsAvatar({ name: ensName });
            if (avatar) {
              claims.picture = avatar;
            }
          } catch (avatarError) {
            console.warn(`Failed to resolve avatar for ${ensName}:`, avatarError);
          }
        }
      } catch (ensError) {
        console.warn(`Failed to resolve ENS name for ${checksumAddress}:`, ensError);
      }

      return claims;
    } catch (error) {
      console.error('Error resolving claims:', error);
      return claims;
    }
  }

  private async generateIdToken(authCode: any): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: getConfig().BASE_URL,
      sub: authCode.sub,
      aud: authCode.client_id,
      exp: now + 3600,
      iat: now,
      nonce: authCode.nonce,
    };

    return jwt.sign(claims, this.privateKey.exportKey('private'), {
      algorithm: getConfig().SIGNING_ALG as jwt.Algorithm,
      keyid: getConfig().KID,
    });
  }
}

export const oidcService = new OIDCService();
