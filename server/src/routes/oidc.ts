import { Router, static as static_, Response } from 'express';
import { authorize, signIn, tokenExchange, userinfo } from '../controllers/oidc.js';
import { body, query } from 'express-validator';

const router = Router();

// Appending the header for Coinbase Wallet Connector to work
const customHeaders = (res: Response) => {
  res.append('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
};

// Serve static files from the static directory
router.use(static_('static', { setHeaders: customHeaders }));

// Serve the main index.html file on the base route
router.get('/', (req, res) => {
  res.sendFile('index.html', { root: 'static' });
});

router.get(
  '/authorize',
  [
    query('client_id').isString().notEmpty(),
    query('redirect_uri').isString().notEmpty(),
    query('response_type').optional().isString(),
    query('scope').isString().notEmpty(),
    query('state').isString().notEmpty(),
    query('nonce').optional().isString(),
    query('prompt').optional().isString(),
    query('request_uri').optional().isString(),
    query('request').optional().isString(),
    query('action').isString().notEmpty(),
  ],
  authorize
);

router.get('/sign_in', signIn);

router.get('/userinfo', userinfo);

router.post(
  '/token',
  [
    body('grant_type').isIn(['authorization_code']).withMessage('Invalid grant type'),
    body('code').isString().withMessage('Invalid code'),
    body('client_id').isString().withMessage('Invalid client id'),
    body('client_secret').optional().isString(),
  ],
  tokenExchange
);

export default router;
