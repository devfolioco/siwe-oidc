import express from 'express';
import { body, query } from 'express-validator';
import oidcService from '../services/oidc.js';
import db from '../db/redis.js';
import { SiweMessage } from 'siwe';

const router = express.Router();

// Serve static files from the static directory
router.use(express.static('static'));

// Serve the main index.html file on the base route
router.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'static' });
});

// JWK Set endpoint
router.get('/jwk', async (req, res) => {
    try {
        const jwkSet = await oidcService.getJwkSet();
        res.json(jwkSet);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Provider metadata endpoint
router.get('/.well-known/openid-configuration', (req, res) => {
    try {
        const metadata = oidcService.getProviderMetadata();
        res.json(metadata);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Token endpoint
router.post('/token',
    body('grant_type').isIn(['authorization_code']),
    body('code').isString(),
    body('client_id').isString(),
    body('client_secret').optional().isString(),
    async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            const tokenResponse = await oidcService.handleTokenRequest(req.body, authHeader);
            res.json(tokenResponse);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// Authorization endpoint
router.get('/authorize',
    query('client_id').isString(),
    query('redirect_uri').isURL(),
    query('scope').isString(),
    query('state').optional().isString(),
    query('nonce').optional().isString(),
    async (req, res) => {
        try {
            const { sessionId, redirect, cookie } = await oidcService.handleAuthorizationRequest(req.query);
            
            // Set session cookie
            res.cookie('session', sessionId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            });

            // Redirect to SIWE sign-in page
            res.redirect(`${redirect}`);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// Sign-in endpoint
router.get('/sign_in',
    async (req, res) => {
        try {
            // Get SIWE data from cookie instead of request body
            const siweCookie = req.cookies.siwe;
            if (!siweCookie) {
                throw new Error('No SIWE cookie found');
            }
            
            const { message, signature } = JSON.parse(decodeURIComponent(siweCookie));
            const isValid = await oidcService.verifySiweMessage(message, signature);
            
            if (!isValid) {
                throw new Error('Invalid SIWE signature');
            }

            const sessionId = req.cookies.session;
            const session = await db.getSession(sessionId);
            
            if (!session) {
                throw new Error('Invalid session');
            }

            // Extract Ethereum address from SIWE message
            const siweMessage = new SiweMessage(message);
            const address = siweMessage.address;
            
            // Resolve ENS name if available
            const ensName = await oidcService.resolveEnsName(address);
            
            // Create subject identifier
            const sub = `eip155:${siweMessage.chainId}:${address}`;
            
            // Update session with user info
            await db.setSession(sessionId, {
                ...session,
                sub,
                ensName,

            });

            // Generate a unique authorization code
            const authCode = crypto.randomUUID();
            
            // Create auth code entry with user information
            const codeEntry = {
                address,
                nonce: req.query.nonce || null,
                exchangeCount: 0,
                clientId: req.query.client_id,
                authTime: new Date().toISOString(),
                chainId: siweMessage.chainId
            };
            
            // Store the auth code with a short TTL (5 minutes)
            await db.setAuthCode(authCode, codeEntry);
            
            // Update session with the auth code
            await db.setSession(sessionId, {
                ...JSON.parse(session),
                signInCount: (JSON.parse(session).signInCount || 0) + 1
            });

            // Redirect back to client with authorization code
            const redirectUri = new URL(req.query.redirect_uri);
            redirectUri.searchParams.set('code', authCode);
            if (req.query.state) {
                redirectUri.searchParams.set('state', req.query.state);
            }

            res.redirect(redirectUri.toString());
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// UserInfo endpoint
router.get('/userinfo',
    async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                throw new Error('Missing or invalid authorization header');
            }

            const accessToken = authHeader.split(' ')[1];
            const userInfo = await oidcService.handleUserInfoRequest(accessToken);
            res.json(userInfo);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// Client registration endpoint
router.post('/register',
    body('redirect_uris').isArray(),
    body('client_name').optional().isString(),
    async (req, res) => {
        try {
            const clientId = randomBytes(32).toString('hex');
            const clientSecret = randomBytes(32).toString('hex');
            
            const client = {
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uris: req.body.redirect_uris,
                client_name: req.body.client_name
            };

            await db.setClient(clientId, client);
            
            res.status(201).json({
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uris: client.redirect_uris,
                client_name: client.client_name
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

export default router; 